-- STAGE ONLY: production function definitions; ordinal rows 61-70 of 201.
-- Definitions captured read-only on 2026-10-14. Ordering is alphabetical, NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects must be reconciled separately.

CREATE OR REPLACE FUNCTION public.cl_loan_guard_repayment_recorder()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.members m
    where m.group_id=new.group_id
      and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(coalesce(m.status,'active'))='active'
      and lower(coalesce(m.onboarding_status,'active'))='active'
      and (
        lower(btrim(coalesce(m.role,''))) in ('admin','administrator','treasurer')
        or lower(btrim(coalesce(m.actual_position,'')))='treasurer'
        or lower(btrim(coalesce(m.actual_position_name,'')))='treasurer'
      )
  ) then
    raise exception 'Only Admin or Treasurer can record loan repayments' using errcode='42501';
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_notify_application_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_member_name text;
  v_event text;
  v_title text;
  v_message text;
  v_recipient_member_id uuid;
begin
  if not exists(select 1 from public.groups g where g.id = new.group_id and g.loans_enabled = true) then
    return new;
  end if;

  select coalesce(m.name,'A member') into v_member_name
  from public.members m where m.id = new.member_id and m.group_id = new.group_id;

  if tg_op = 'INSERT' then
    perform public.cl_loan_emit_notification(
      new.group_id,new.member_id,new.id,'application_submitted',
      'Loan application submitted',
      'Your loan application for KES ' || to_char(new.requested_amount,'FM999999999990.00') || ' has been submitted.'
    );
    for v_recipient_member_id in
      select distinct m.id
      from public.members m
      where m.group_id = new.group_id
        and lower(coalesce(m.status,'active')) = 'active'
        and lower(coalesce(m.onboarding_status,'active')) = 'active'
        and (
          lower(coalesce(m.role,'')) in ('admin','administrator','chairperson','secretary')
          or lower(coalesce(m.actual_position,'')) in ('admin','administrator','chairperson','secretary')
          or lower(coalesce(m.actual_position_name,'')) in ('admin','administrator','chairperson','secretary')
        )
    loop
      perform public.cl_loan_emit_notification(
        new.group_id,v_recipient_member_id,new.id,'application_submitted','New loan application',
        v_member_name || ' submitted a loan application for KES ' || to_char(new.requested_amount,'FM999999999990.00') || '.'
      );
    end loop;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'approved' then
      v_event := 'application_approved'; v_title := 'Loan application approved';
      v_message := 'Your loan application for KES ' || to_char(coalesce(new.approved_amount,new.requested_amount),'FM999999999990.00') || ' was approved.';
    elsif new.status = 'rejected' then
      v_event := 'application_rejected'; v_title := 'Loan application not approved';
      v_message := 'Your loan application was not approved.' || case when nullif(btrim(new.decision_note),'') is not null then ' Reason: ' || btrim(new.decision_note) else '' end;
    elsif new.status = 'active' then
      v_event := 'loan_disbursed'; v_title := 'Loan disbursed';
      v_message := 'Your loan for KES ' || to_char(coalesce(new.approved_amount,new.requested_amount),'FM999999999990.00') || ' has been disbursed. Your repayment schedule is available in Loans.';
    elsif new.status = 'cleared' then
      v_event := 'loan_cleared'; v_title := 'Loan cleared';
      v_message := 'Your loan has been fully repaid and cleared.';
    else
      return new;
    end if;
    perform public.cl_loan_emit_notification(new.group_id,new.member_id,new.id,v_event,v_title,v_message);
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_notify_repayment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member_id uuid; v_amount text;
begin
  if not exists(select 1 from public.groups g where g.id = new.group_id and g.loans_enabled = true) then return new; end if;
  select l.member_id into v_member_id from public.loan_applications l where l.id = new.loan_id and l.group_id = new.group_id;
  v_amount := to_char(new.amount,'FM999999999990.00');
  perform public.cl_loan_emit_notification(
    new.group_id,v_member_id,new.loan_id,'repayment_recorded','Loan repayment recorded',
    'A repayment of KES ' || v_amount || ' was recorded on ' || new.payment_date::text || '.'
  );
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_record_repayment(p_group_id uuid, p_loan_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE, p_payment_method text DEFAULT 'cash'::text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor_member_id uuid; v_loan public.loan_applications%rowtype; v_settings public.loan_settings%rowtype;
  v_repayment_id uuid; v_remaining numeric(14,2); v_total_outstanding numeric(14,2);
  r record; v_penalty_alloc numeric(14,2); v_interest_alloc numeric(14,2); v_principal_alloc numeric(14,2);
  v_new_paid numeric(14,2); v_cleared boolean;
begin
  v_actor_member_id := public.cl_loan_actor(p_group_id, true);
  if not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer','secretary']::text[]) then
    raise exception 'You do not have permission to record loan repayments' using errcode='42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_payment_method not in ('cash','mpesa','bank','other') then
    raise exception 'Enter a positive repayment amount and valid payment method' using errcode='22023';
  end if;
  select * into v_loan from public.loan_applications where id=p_loan_id and group_id=p_group_id for update;
  if not found then raise exception 'Loan not found' using errcode='P0002'; end if;
  if v_loan.status not in ('active','overdue') then raise exception 'Repayments can only be recorded for active loans' using errcode='55000'; end if;
  select * into v_settings from public.loan_settings where group_id=p_group_id;
  if v_settings.late_penalty > 0 then
    update public.loan_repayment_schedule s set penalty_due=v_settings.late_penalty
    where s.loan_id=p_loan_id and s.group_id=p_group_id and s.due_date < p_payment_date
      and s.penalty_due=0 and s.amount_paid < s.principal_due+s.interest_due+s.penalty_due;
  end if;

  select coalesce(sum(principal_due+interest_due+penalty_due-amount_paid),0)
    into v_total_outstanding
  from public.loan_repayment_schedule where loan_id=p_loan_id and group_id=p_group_id;
  if p_amount > v_total_outstanding then
    raise exception 'Repayment exceeds the outstanding loan balance (%). No payment was recorded.', v_total_outstanding using errcode='22023';
  end if;

  insert into public.loan_repayments(group_id,loan_id,amount,payment_date,payment_method,reference,note,recorded_by)
  values(p_group_id,p_loan_id,p_amount,p_payment_date,p_payment_method,
    nullif(btrim(coalesce(p_reference,'')),''),nullif(btrim(coalesce(p_note,'')),''),auth.uid())
  returning id into v_repayment_id;
  v_remaining := p_amount;

  for r in
    select s.*,
      coalesce(a.principal_paid,0) as principal_paid,
      coalesce(a.interest_paid,0) as interest_paid,
      coalesce(a.penalty_paid,0) as penalty_paid
    from public.loan_repayment_schedule s
    left join (
      select schedule_id, sum(principal_amount) principal_paid,
        sum(interest_amount) interest_paid, sum(penalty_amount) penalty_paid
      from public.loan_repayment_allocations group by schedule_id
    ) a on a.schedule_id=s.id
    where s.loan_id=p_loan_id and s.group_id=p_group_id
      and s.amount_paid < s.principal_due+s.interest_due+s.penalty_due
    order by s.due_date,s.installment_no
    for update of s
  loop
    exit when v_remaining <= 0;
    v_penalty_alloc := least(v_remaining,greatest(r.penalty_due-r.penalty_paid,0));
    v_remaining := v_remaining-v_penalty_alloc;
    v_interest_alloc := least(v_remaining,greatest(r.interest_due-r.interest_paid,0));
    v_remaining := v_remaining-v_interest_alloc;
    v_principal_alloc := least(v_remaining,greatest(r.principal_due-r.principal_paid,0));
    v_remaining := v_remaining-v_principal_alloc;

    if v_penalty_alloc+v_interest_alloc+v_principal_alloc > 0 then
      insert into public.loan_repayment_allocations(group_id,repayment_id,loan_id,schedule_id,principal_amount,interest_amount,penalty_amount)
      values(p_group_id,v_repayment_id,p_loan_id,r.id,v_principal_alloc,v_interest_alloc,v_penalty_alloc);
      v_new_paid := r.amount_paid+v_penalty_alloc+v_interest_alloc+v_principal_alloc;
      update public.loan_repayment_schedule set amount_paid=v_new_paid,
        status=case when v_new_paid >= principal_due+interest_due+penalty_due then 'paid'
                    when due_date < p_payment_date then 'overdue' else 'partial' end,
        paid_at=case when v_new_paid >= principal_due+interest_due+penalty_due then now() else null end
      where id=r.id;
    end if;
  end loop;

  select not exists(select 1 from public.loan_repayment_schedule s where s.loan_id=p_loan_id
    and s.amount_paid < s.principal_due+s.interest_due+s.penalty_due) into v_cleared;
  if v_cleared then
    update public.loan_applications set status='cleared',cleared_at=now(),updated_at=now() where id=p_loan_id;
  else
    update public.loan_applications set status=case when exists(select 1 from public.loan_repayment_schedule s
      where s.loan_id=p_loan_id and s.due_date < p_payment_date and s.amount_paid < s.principal_due+s.interest_due+s.penalty_due)
      then 'overdue' else 'active' end, updated_at=now() where id=p_loan_id;
  end if;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'record_loan_repayment','loan_repayment',v_repayment_id::text,
    jsonb_build_object('loan_id',p_loan_id,'amount',p_amount,'payment_date',p_payment_date,
      'payment_method',p_payment_method,'unallocated_amount',v_remaining));
  return v_repayment_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_record_repayment_authorized(p_group_id uuid, p_loan_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE, p_payment_method text DEFAULT 'cash'::text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.cl_loan_actor(p_group_id,true);
  if not exists (
    select 1 from public.members m
    where m.group_id=p_group_id
      and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(coalesce(m.status,'active'))='active'
      and lower(coalesce(m.onboarding_status,'active'))='active'
      and (
        lower(btrim(coalesce(m.role,''))) in ('admin','administrator','treasurer')
        or lower(btrim(coalesce(m.actual_position,'')))='treasurer'
        or lower(btrim(coalesce(m.actual_position_name,'')))='treasurer'
      )
  ) then
    raise exception 'Only Admin or Treasurer can record loan repayments' using errcode='42501';
  end if;
  return public.cl_loan_record_repayment(p_group_id,p_loan_id,p_amount,p_payment_date,p_payment_method,p_reference,p_note);
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_refresh_statuses(p_group_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor_member_id uuid; v_count integer;
begin
 v_actor_member_id:=public.cl_loan_actor(p_group_id,false);
 update public.loan_applications l set status=case
  when exists(select 1 from public.loan_repayment_schedule s where s.loan_id=l.id and s.due_date<current_date
    and s.amount_paid<s.principal_due+s.interest_due+s.penalty_due) then 'overdue'
  else 'active' end, updated_at=now()
 where l.group_id=p_group_id and l.status in ('active','overdue')
 and l.status is distinct from case
  when exists(select 1 from public.loan_repayment_schedule s where s.loan_id=l.id and s.due_date<current_date
   and s.amount_paid<s.principal_due+s.interest_due+s.penalty_due) then 'overdue' else 'active' end;
 get diagnostics v_count=row_count;
 if v_count>0 then
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'refresh_loan_statuses','loan_application',jsonb_build_object('updated_count',v_count));
 end if;
 return v_count;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_loan_review(p_group_id uuid, p_loan_id uuid, p_decision text, p_decision_note text DEFAULT NULL::text, p_approved_amount numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor_member_id uuid; v_loan public.loan_applications%rowtype; v_settings public.loan_settings%rowtype; v_amount numeric(14,2);
begin
  v_actor_member_id := public.cl_loan_actor(p_group_id, true);
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected' using errcode='22023'; end if;
  select * into v_loan from public.loan_applications where id=p_loan_id and group_id=p_group_id for update;
  if not found then raise exception 'Loan application not found' using errcode='P0002'; end if;
  if v_loan.status <> 'submitted' then raise exception 'Only submitted applications can be reviewed' using errcode='55000'; end if;
  if p_decision='rejected' and length(btrim(coalesce(p_decision_note,'')))=0 then
    raise exception 'Provide a reason for rejection' using errcode='22023';
  end if;
  select * into v_settings from public.loan_settings where group_id=p_group_id;
  if not found then raise exception 'Loan settings are not configured' using errcode='P0002'; end if;
  v_amount := coalesce(p_approved_amount,v_loan.requested_amount);
  if p_decision='approved' and (v_amount <= 0 or v_amount > v_loan.requested_amount or v_amount > v_settings.max_loan_amount) then
    raise exception 'Approved amount must be positive and cannot exceed the requested or group maximum amount' using errcode='22023';
  end if;
  update public.loan_applications set status=p_decision, decision_note=nullif(btrim(coalesce(p_decision_note,'')),''),
    approved_amount=case when p_decision='approved' then v_amount else null end,
    interest_rate_snapshot=case when p_decision='approved' then v_settings.interest_rate else null end,
    interest_type_snapshot=case when p_decision='approved' then v_settings.interest_type else null end,
    approved_by=auth.uid(), approved_at=now(), updated_at=now()
  where id=p_loan_id;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'review_loan_application','loan_application',p_loan_id::text,
    jsonb_build_object('decision',p_decision,'approved_amount',case when p_decision='approved' then v_amount else null end,
      'note',p_decision_note));
  return p_loan_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_review_authorized(p_group_id uuid, p_loan_id uuid, p_decision text, p_decision_note text DEFAULT NULL::text, p_approved_amount numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor_member_id uuid;
  v_approver public.members%rowtype;
  v_loan public.loan_applications%rowtype;
  v_settings public.loan_settings%rowtype;
  v_member_count integer;
  v_slot text;
  v_position text;
  v_position_name text;
  v_technical_role text;
  v_amount numeric(14,2);
  v_approvals integer;
  v_status text;
begin
  v_actor_member_id := public.cl_loan_actor(p_group_id, true);

  if lower(btrim(coalesce(p_decision,''))) not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected' using errcode='22023';
  end if;
  if lower(btrim(coalesce(p_decision,''))) = 'rejected'
     and length(btrim(coalesce(p_decision_note,''))) = 0 then
    raise exception 'Provide a reason for rejection' using errcode='22023';
  end if;

  select * into v_loan
  from public.loan_applications
  where id = p_loan_id and group_id = p_group_id
  for update;
  if not found then
    raise exception 'Loan application not found' using errcode='P0002';
  end if;
  if v_loan.status <> 'submitted' then
    raise exception 'Only pending loan applications can receive an office decision' using errcode='55000';
  end if;
  if v_loan.member_id = v_actor_member_id then
    raise exception 'A loan applicant cannot approve or reject their own loan' using errcode='42501';
  end if;

  select count(*) into v_member_count
  from public.members m
  where m.group_id = p_group_id
    and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
    and lower(coalesce(m.status,'')) = 'active'
    and lower(coalesce(m.onboarding_status,'')) = 'active';
  if v_member_count <> 1 then
    raise exception 'Exactly one active member record in this group is required to approve loans' using errcode='42501';
  end if;

  select m.* into v_approver
  from public.members m
  where m.group_id = p_group_id
    and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
    and lower(coalesce(m.status,'')) = 'active'
    and lower(coalesce(m.onboarding_status,'')) = 'active';

  v_position := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.actual_position,'')), '_',' '),'-',' '),'[[:space:]]+',' ','g'));
  v_position_name := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.actual_position_name,'')), '_',' '),'-',' '),'[[:space:]]+',' ','g'));
  v_technical_role := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.role,'')), '_',' '),'-',' '),'[[:space:]]+',' ','g'));

  if v_position in ('chairperson','vice chairperson','chair','vice chair')
     or v_position_name in ('chairperson','vice chairperson','chair','vice chair') then
    v_slot := 'chairperson';
  elsif v_position = 'treasurer' or v_position_name = 'treasurer' then
    v_slot := 'treasurer';
  elsif v_position in ('secretary','vice secretary') or v_position_name in ('secretary','vice secretary') then
    v_slot := 'secretary';
  elsif v_technical_role in ('chairperson','vice chairperson','chair','vice chair') then
    v_slot := 'chairperson';
  elsif v_technical_role = 'treasurer' then
    v_slot := 'treasurer';
  elsif v_technical_role in ('secretary','vice secretary') then
    v_slot := 'secretary';
  else
    raise exception 'Only the designated Chairperson, Treasurer or Secretary can decide loan applications' using errcode='42501';
  end if;

  if exists (select 1 from public.loan_approvals a where a.loan_id=p_loan_id and a.approver_user_id=auth.uid()) then
    raise exception 'You have already submitted a decision for this loan' using errcode='55000';
  end if;
  if exists (select 1 from public.loan_approvals a where a.loan_id=p_loan_id and a.approval_slot=v_slot) then
    raise exception 'Another official has already filled the % approval slot', v_slot using errcode='55000';
  end if;

  select * into v_settings from public.loan_settings where group_id=p_group_id;
  if not found then raise exception 'Loan settings are not configured' using errcode='P0002'; end if;

  if lower(p_decision)='approved' then
    v_amount := coalesce(p_approved_amount,v_loan.approved_amount,v_loan.requested_amount);
    if v_amount<=0 or v_amount>v_loan.requested_amount or v_amount>v_settings.max_loan_amount then
      raise exception 'Approved amount must be positive and cannot exceed the requested or group maximum amount' using errcode='22023';
    end if;
    if v_loan.approved_amount is not null and v_loan.approved_amount<>v_amount then
      raise exception 'All three officials must approve the same loan amount (% KES)',v_loan.approved_amount using errcode='22023';
    end if;
  else
    v_amount := null;
  end if;

  insert into public.loan_approvals(loan_id,group_id,approver_user_id,approval_slot,decision,note)
  values(p_loan_id,p_group_id,auth.uid(),v_slot,lower(p_decision),nullif(btrim(coalesce(p_decision_note,'')), ''));

  if lower(p_decision)='rejected' then
    v_status := 'rejected';
    update public.loan_applications set status='rejected',
      decision_note=nullif(btrim(coalesce(p_decision_note,'')), ''),
      approved_amount=null, interest_rate_snapshot=null, interest_type_snapshot=null,
      approved_by=null, approved_at=null, updated_at=now()
    where id=p_loan_id;
  else
    if v_loan.approved_amount is null then
      update public.loan_applications set approved_amount=v_amount,
        interest_rate_snapshot=v_settings.interest_rate, interest_type_snapshot=v_settings.interest_type,
        updated_at=now() where id=p_loan_id;
    end if;
    select count(*) into v_approvals from public.loan_approvals a
    where a.loan_id=p_loan_id and a.decision='approved'
      and a.approval_slot in ('chairperson','treasurer','secretary');
    if v_approvals=3 and not exists(select 1 from public.loan_approvals a where a.loan_id=p_loan_id and a.decision='rejected') then
      v_status := 'approved';
      update public.loan_applications set status='approved', decision_note=null,
        approved_by=auth.uid(), approved_at=now(), updated_at=now() where id=p_loan_id;
    else
      v_status := 'submitted';
    end if;
  end if;

  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'review_loan_application','loan_application',p_loan_id::text,
    jsonb_build_object('decision',lower(p_decision),'approval_slot',v_slot,'approval_status',v_status,
      'approved_slots',(select count(*) from public.loan_approvals a where a.loan_id=p_loan_id and a.decision='approved'),
      'required_slots',3,'approved_amount',case when lower(p_decision)='approved' then v_amount else null end,'note',p_decision_note));
  return p_loan_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_update_settings(p_group_id uuid, p_interest_rate numeric, p_interest_type text, p_max_loan_amount numeric, p_max_period_months integer, p_late_penalty numeric)
 RETURNS loan_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor_member_id uuid; v_row public.loan_settings;
begin
  v_actor_member_id := public.cl_loan_actor(p_group_id, true);
  if not public.cl_user_has_role(p_group_id,array['admin']::text[]) then
    raise exception 'Only the group Admin can change loan settings' using errcode='42501';
  end if;
  if p_interest_rate is null or p_interest_rate < 0 or p_interest_rate > 100
    or p_interest_type not in ('flat','reducing_balance')
    or p_max_loan_amount is null or p_max_loan_amount <= 0
    or p_max_period_months is null or p_max_period_months < 1 or p_max_period_months > 120
    or p_late_penalty is null or p_late_penalty < 0 then
    raise exception 'Invalid loan settings' using errcode='22023';
  end if;
  insert into public.loan_settings(group_id,interest_rate,interest_type,max_loan_amount,max_period_months,late_penalty,updated_by,updated_at)
  values(p_group_id,p_interest_rate,p_interest_type,p_max_loan_amount,p_max_period_months,p_late_penalty,auth.uid(),now())
  on conflict(group_id) do update set interest_rate=excluded.interest_rate, interest_type=excluded.interest_type,
    max_loan_amount=excluded.max_loan_amount, max_period_months=excluded.max_period_months,
    late_penalty=excluded.late_penalty, updated_by=excluded.updated_by, updated_at=now()
  returning * into v_row;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'update_loan_settings','loan_settings',p_group_id::text,
    jsonb_build_object('interest_rate',p_interest_rate,'interest_type',p_interest_type,'max_loan_amount',p_max_loan_amount,
      'max_period_months',p_max_period_months,'late_penalty',p_late_penalty));
  return v_row;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_merry_apply_preferences(p_group_id uuid, p_cycle_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid; v_cycle public.merry_go_round_cycles%rowtype; v_active_count integer; v_pref_count integer;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if not public.cl_user_has_role(p_group_id,array['admin','chairperson','secretary']::text[]) then raise exception 'Your role cannot finalize member payout choices' using errcode='42501'; end if;
 select * into v_cycle from public.merry_go_round_cycles where id=p_cycle_id and group_id=p_group_id for update;
 if v_cycle.id is null or v_cycle.payout_order_method<>'member_chosen' then raise exception 'Member-chosen cycle not found' using errcode='P0002'; end if;
 if exists(select 1 from public.merry_go_round_rounds where cycle_id=p_cycle_id and (status<>'pending' or due_date<=current_date)) then raise exception 'Payout choices can only be applied before the first round starts' using errcode='22023'; end if;
 select count(*) into v_active_count from public.members where group_id=p_group_id and status='active' and onboarding_status='active';
 select count(*) into v_pref_count from public.merry_go_round_preferences where group_id=p_group_id and cycle_id=p_cycle_id;
 if v_pref_count<>v_active_count then raise exception 'Every active member must choose a unique round first (% of % submitted)',v_pref_count,v_active_count using errcode='22023'; end if;
 if exists(select 1 from public.merry_go_round_preferences p where p.cycle_id=p_cycle_id and (p.preferred_round_number<1 or p.preferred_round_number>v_cycle.number_of_rounds)) then raise exception 'Invalid preferred round' using errcode='22023'; end if;
 update public.merry_go_round_rounds r set recipient_member_id=p.member_id
 from public.merry_go_round_preferences p where r.cycle_id=p_cycle_id and p.cycle_id=p_cycle_id and r.round_number=p.preferred_round_number;
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_actor,'apply_member_payout_choices','merry_go_round_cycle',p_cycle_id::text,jsonb_build_object('preference_count',v_pref_count));
 return true;
end; $function$
