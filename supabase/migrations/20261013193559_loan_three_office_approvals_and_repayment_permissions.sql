-- CHAMA LIVE: require distinct Chairperson, Treasurer and Secretary loan approvals.
-- E2600 stays disabled; no contribution-accounting tables or RPCs are changed.

create table if not exists public.loan_approvals (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loan_applications(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  approver_user_id uuid not null,
  approval_slot text not null check (approval_slot in ('chairperson','treasurer','secretary')),
  decision text not null check (decision in ('approved','rejected')),
  note text,
  created_at timestamptz not null default now(),
  constraint loan_approvals_one_person_per_loan unique (loan_id, approver_user_id),
  constraint loan_approvals_one_person_per_slot unique (loan_id, approval_slot)
);
create index if not exists loan_approvals_group_loan_idx on public.loan_approvals (group_id, loan_id);

alter table public.loan_approvals enable row level security;
revoke all on public.loan_approvals from anon, authenticated;
grant select on public.loan_approvals to authenticated;
drop policy if exists loan_approvals_select_same_group on public.loan_approvals;
create policy loan_approvals_select_same_group on public.loan_approvals for select to authenticated
using (
  public.cl_group_module_enabled(group_id, 'loans')
  and exists (
    select 1 from public.members m
    where m.group_id=loan_approvals.group_id
      and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(coalesce(m.status,'active'))='active'
      and lower(coalesce(m.onboarding_status,'active'))='active'
  )
);

create or replace function public.cl_loan_review_authorized(
  p_group_id uuid, p_loan_id uuid, p_decision text,
  p_decision_note text default null, p_approved_amount numeric default null
) returns uuid
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_actor_member_id uuid; v_approver public.members%rowtype;
  v_loan public.loan_applications%rowtype; v_settings public.loan_settings%rowtype;
  v_member_count integer; v_slot text; v_position text; v_position_name text;
  v_technical_role text; v_amount numeric(14,2); v_approvals integer; v_status text;
begin
  v_actor_member_id := public.cl_loan_actor(p_group_id,true);
  if lower(btrim(coalesce(p_decision,''))) not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected' using errcode='22023';
  end if;
  if lower(btrim(coalesce(p_decision,'')))='rejected' and length(btrim(coalesce(p_decision_note,'')))=0 then
    raise exception 'Provide a reason for rejection' using errcode='22023';
  end if;
  select * into v_loan from public.loan_applications where id=p_loan_id and group_id=p_group_id for update;
  if not found then raise exception 'Loan application not found' using errcode='P0002'; end if;
  if v_loan.status<>'submitted' then
    raise exception 'Only pending loan applications can receive an office decision' using errcode='55000';
  end if;
  if v_loan.member_id=v_actor_member_id then
    raise exception 'A loan applicant cannot approve or reject their own loan' using errcode='42501';
  end if;

  select count(*) into v_member_count from public.members m
  where m.group_id=p_group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and lower(coalesce(m.status,''))='active' and lower(coalesce(m.onboarding_status,''))='active';
  if v_member_count<>1 then
    raise exception 'Exactly one active member record in this group is required to approve loans' using errcode='42501';
  end if;
  select m.* into v_approver from public.members m
  where m.group_id=p_group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and lower(coalesce(m.status,''))='active' and lower(coalesce(m.onboarding_status,''))='active';

  v_position := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g'));
  v_position_name := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g'));
  v_technical_role := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.role,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g'));
  if v_position in ('chairperson','vice chairperson','chair','vice chair')
     or v_position_name in ('chairperson','vice chairperson','chair','vice chair') then
    v_slot := 'chairperson';
  elsif v_position='treasurer' or v_position_name='treasurer' then v_slot := 'treasurer';
  elsif v_position in ('secretary','vice secretary') or v_position_name in ('secretary','vice secretary') then v_slot := 'secretary';
  elsif v_technical_role in ('chairperson','vice chairperson','chair','vice chair') then v_slot := 'chairperson';
  elsif v_technical_role='treasurer' then v_slot := 'treasurer';
  elsif v_technical_role in ('secretary','vice secretary') then v_slot := 'secretary';
  else
    raise exception 'Only the designated Chairperson, Treasurer or Secretary can decide loan applications' using errcode='42501';
  end if;

  if exists(select 1 from public.loan_approvals a where a.loan_id=p_loan_id and a.approver_user_id=auth.uid()) then
    raise exception 'You have already submitted a decision for this loan' using errcode='55000';
  end if;
  if exists(select 1 from public.loan_approvals a where a.loan_id=p_loan_id and a.approval_slot=v_slot) then
    raise exception 'Another official has already filled the % approval slot',v_slot using errcode='55000';
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
  else v_amount := null;
  end if;

  insert into public.loan_approvals(loan_id,group_id,approver_user_id,approval_slot,decision,note)
  values(p_loan_id,p_group_id,auth.uid(),v_slot,lower(p_decision),nullif(btrim(coalesce(p_decision_note,'')), ''));

  if lower(p_decision)='rejected' then
    v_status := 'rejected';
    update public.loan_applications set status='rejected',
      decision_note=nullif(btrim(coalesce(p_decision_note,'')), ''),
      approved_amount=null, interest_rate_snapshot=null, interest_type_snapshot=null,
      approved_by=null, approved_at=null, updated_at=now() where id=p_loan_id;
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
      update public.loan_applications set status='approved',decision_note=null,
        approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=p_loan_id;
    else v_status := 'submitted';
    end if;
  end if;

  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'review_loan_application','loan_application',p_loan_id::text,
    jsonb_build_object('decision',lower(p_decision),'approval_slot',v_slot,'approval_status',v_status,
      'approved_slots',(select count(*) from public.loan_approvals a where a.loan_id=p_loan_id and a.decision='approved'),
      'required_slots',3,'approved_amount',case when lower(p_decision)='approved' then v_amount else null end,'note',p_decision_note));
  return p_loan_id;
end;
$function$;
revoke all on function public.cl_loan_review_authorized(uuid,uuid,text,text,numeric) from public,anon;
grant execute on function public.cl_loan_review_authorized(uuid,uuid,text,text,numeric) to authenticated,service_role;

create or replace function public.cl_loan_guard_disbursement_approvals()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_count integer;
begin
  if new.status='active' and old.status is distinct from 'active' then
    select count(*) into v_count from public.loan_approvals a
    where a.loan_id=new.id and a.group_id=new.group_id and a.decision='approved'
      and a.approval_slot in ('chairperson','treasurer','secretary');
    if v_count<>3 or exists(select 1 from public.loan_approvals a where a.loan_id=new.id and a.decision='rejected') then
      raise exception 'Loan disbursement blocked: Chairperson, Treasurer and Secretary approvals are all required' using errcode='42501';
    end if;
  end if;
  return new;
end;
$function$;
drop trigger if exists loan_disbursement_requires_three_approvals on public.loan_applications;
create trigger loan_disbursement_requires_three_approvals before update of status on public.loan_applications
for each row execute function public.cl_loan_guard_disbursement_approvals();

create or replace function public.cl_loan_guard_repayment_recorder()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.members m
    where m.group_id=new.group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(coalesce(m.status,'active'))='active' and lower(coalesce(m.onboarding_status,'active'))='active'
      and (lower(btrim(coalesce(m.role,''))) in ('admin','administrator','treasurer')
        or lower(btrim(coalesce(m.actual_position,'')))='treasurer'
        or lower(btrim(coalesce(m.actual_position_name,'')))='treasurer')
  ) then
    raise exception 'Only Admin or Treasurer can record loan repayments' using errcode='42501';
  end if;
  return new;
end;
$function$;
drop trigger if exists loan_repayment_recorder_role_guard on public.loan_repayments;
create trigger loan_repayment_recorder_role_guard before insert on public.loan_repayments
for each row execute function public.cl_loan_guard_repayment_recorder();

create or replace function public.cl_loan_record_repayment_authorized(
  p_group_id uuid,p_loan_id uuid,p_amount numeric,p_payment_date date default current_date,
  p_payment_method text default 'cash',p_reference text default null,p_note text default null
) returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
begin
  perform public.cl_loan_actor(p_group_id,true);
  if not exists (
    select 1 from public.members m
    where m.group_id=p_group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(coalesce(m.status,'active'))='active' and lower(coalesce(m.onboarding_status,'active'))='active'
      and (lower(btrim(coalesce(m.role,''))) in ('admin','administrator','treasurer')
        or lower(btrim(coalesce(m.actual_position,'')))='treasurer'
        or lower(btrim(coalesce(m.actual_position_name,'')))='treasurer')
  ) then
    raise exception 'Only Admin or Treasurer can record loan repayments' using errcode='42501';
  end if;
  return public.cl_loan_record_repayment(p_group_id,p_loan_id,p_amount,p_payment_date,p_payment_method,p_reference,p_note);
end;
$function$;
revoke all on function public.cl_loan_record_repayment_authorized(uuid,uuid,numeric,date,text,text,text) from public,anon;
grant execute on function public.cl_loan_record_repayment_authorized(uuid,uuid,numeric,date,text,text,text) to authenticated,service_role;

update public.groups set loans_enabled=false where name='E2600';
