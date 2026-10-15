-- CHAMA LIVE production hotfix: loan repayment confirmation and office-gated disbursement.
-- Existing repayment rows retain status='confirmed'; new submissions are pending.
alter table public.loan_repayments
  add column if not exists status text not null default 'confirmed',
  add column if not exists confirmed_by uuid,
  add column if not exists confirmed_at timestamptz;
alter table public.loan_repayments drop constraint if exists loan_repayments_status_check;
alter table public.loan_repayments add constraint loan_repayments_status_check check (status in ('pending','confirmed','rejected'));
create index if not exists loan_repayments_pending_group_idx on public.loan_repayments(group_id,payment_date) where status='pending';

create or replace function public.cl_loan_record_repayment(
  p_group_id uuid,p_loan_id uuid,p_amount numeric,p_payment_date date default current_date,
  p_payment_method text default 'cash',p_reference text default null,p_note text default null
) returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_actor_member_id uuid; v_loan public.loan_applications%rowtype; v_outstanding numeric; v_id uuid;
begin
  v_actor_member_id:=public.cl_loan_actor(p_group_id,false);
  if p_amount is null or p_amount<=0 or p_payment_method not in ('cash','mpesa','bank','other') then raise exception 'Enter a positive repayment amount and valid payment method' using errcode='22023'; end if;
  select * into v_loan from public.loan_applications where id=p_loan_id and group_id=p_group_id for update;
  if not found then raise exception 'Loan not found' using errcode='P0002'; end if;
  if v_loan.member_id<>v_actor_member_id then raise exception 'You may submit repayment evidence only for your own loan' using errcode='42501'; end if;
  if v_loan.status not in ('active','overdue') then raise exception 'Repayments can only be submitted for active loans' using errcode='55000'; end if;
  select coalesce(sum(greatest(principal_due+interest_due+penalty_due-amount_paid,0)),0) into v_outstanding
    from public.loan_repayment_schedule where loan_id=p_loan_id and group_id=p_group_id;
  if p_amount>v_outstanding then raise exception 'Repayment exceeds outstanding balance (%). No payment was recorded.',v_outstanding using errcode='22023'; end if;
  insert into public.loan_repayments(group_id,loan_id,amount,payment_date,payment_method,reference,note,recorded_by,status)
  values(p_group_id,p_loan_id,p_amount,p_payment_date,p_payment_method,nullif(btrim(coalesce(p_reference,'')),''),nullif(btrim(coalesce(p_note,'')),''),auth.uid(),'pending')
  returning id into v_id;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'submit_loan_repayment','loan_repayment',v_id::text,
    jsonb_build_object('loan_id',p_loan_id,'amount',p_amount,'payment_date',p_payment_date,'status','pending'));
  return v_id;
end;
$function$;

create or replace function public.confirm_repayment(p_repayment_id uuid) returns uuid
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_payment public.loan_repayments%rowtype; v_loan public.loan_applications%rowtype; v_actor_member_id uuid;
  v_remaining numeric(14,2); v_total_outstanding numeric(14,2); r record;
  v_penalty_alloc numeric(14,2); v_interest_alloc numeric(14,2); v_principal_alloc numeric(14,2);
  v_new_paid numeric(14,2); v_cleared boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select p.* into v_payment from public.loan_repayments p where p.id=p_repayment_id for update;
  if not found then raise exception 'Repayment not found' using errcode='P0002'; end if;
  if v_payment.status<>'pending' then raise exception 'Only pending repayments can be confirmed' using errcode='55000'; end if;
  select m.id into v_actor_member_id from public.members m
  where m.group_id=v_payment.group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and lower(coalesce(m.status,'active'))='active' and lower(coalesce(m.onboarding_status,'active'))='active'
    and (lower(btrim(coalesce(m.role,''))) in ('admin','administrator','treasurer','chairperson','secretary')
      or lower(btrim(coalesce(m.actual_position,''))) in ('treasurer','chairperson','vice chairperson','secretary','vice secretary')
      or lower(btrim(coalesce(m.actual_position_name,''))) in ('treasurer','chairperson','vice chairperson','secretary','vice secretary')) limit 1;
  if v_actor_member_id is null then raise exception 'Only an authorized group official can confirm repayments' using errcode='42501'; end if;
  if not public.cl_group_module_enabled(v_payment.group_id,'loans') then raise exception 'Loans is disabled for this group' using errcode='42501'; end if;
  select * into v_loan from public.loan_applications where id=v_payment.loan_id and group_id=v_payment.group_id for update;
  if not found or v_loan.status not in ('active','overdue') then raise exception 'Loan is not active' using errcode='55000'; end if;
  select coalesce(sum(greatest(principal_due+interest_due+penalty_due-amount_paid,0)),0) into v_total_outstanding
    from public.loan_repayment_schedule where loan_id=v_payment.loan_id and group_id=v_payment.group_id;
  if v_payment.amount>v_total_outstanding then raise exception 'Repayment exceeds current outstanding balance; no allocation made' using errcode='22023'; end if;
  v_remaining:=v_payment.amount;
  for r in
    select s.*,coalesce(a.principal_paid,0) principal_paid,coalesce(a.interest_paid,0) interest_paid,coalesce(a.penalty_paid,0) penalty_paid
    from public.loan_repayment_schedule s left join (
      select schedule_id,sum(principal_amount) principal_paid,sum(interest_amount) interest_paid,sum(penalty_amount) penalty_paid
      from public.loan_repayment_allocations group by schedule_id
    ) a on a.schedule_id=s.id
    where s.loan_id=v_payment.loan_id and s.group_id=v_payment.group_id and s.amount_paid<s.principal_due+s.interest_due+s.penalty_due
    order by s.due_date,s.installment_no for update of s
  loop
    exit when v_remaining<=0;
    v_penalty_alloc:=least(v_remaining,greatest(r.penalty_due-r.penalty_paid,0)); v_remaining:=v_remaining-v_penalty_alloc;
    v_interest_alloc:=least(v_remaining,greatest(r.interest_due-r.interest_paid,0)); v_remaining:=v_remaining-v_interest_alloc;
    v_principal_alloc:=least(v_remaining,greatest(r.principal_due-r.principal_paid,0)); v_remaining:=v_remaining-v_principal_alloc;
    if v_penalty_alloc+v_interest_alloc+v_principal_alloc>0 then
      insert into public.loan_repayment_allocations(group_id,repayment_id,loan_id,schedule_id,principal_amount,interest_amount,penalty_amount)
      values(v_payment.group_id,v_payment.id,v_payment.loan_id,r.id,v_principal_alloc,v_interest_alloc,v_penalty_alloc);
      v_new_paid:=r.amount_paid+v_penalty_alloc+v_interest_alloc+v_principal_alloc;
      update public.loan_repayment_schedule set amount_paid=v_new_paid,
        status=case when v_new_paid>=principal_due+interest_due+penalty_due then 'paid' when due_date<v_payment.payment_date then 'overdue' else 'partial' end,
        paid_at=case when v_new_paid>=principal_due+interest_due+penalty_due then now() else null end where id=r.id;
    end if;
  end loop;
  update public.loan_repayments set status='confirmed',confirmed_by=auth.uid(),confirmed_at=now() where id=v_payment.id;
  select not exists(select 1 from public.loan_repayment_schedule s where s.loan_id=v_payment.loan_id and s.amount_paid<s.principal_due+s.interest_due+s.penalty_due) into v_cleared;
  if v_cleared then update public.loan_applications set status='cleared',cleared_at=now(),updated_at=now() where id=v_payment.loan_id;
  else update public.loan_applications set status=case when exists(select 1 from public.loan_repayment_schedule s where s.loan_id=v_payment.loan_id and s.due_date<current_date and s.amount_paid<s.principal_due+s.interest_due+s.penalty_due) then 'overdue' else 'active' end,updated_at=now() where id=v_payment.loan_id;
  end if;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(v_payment.group_id,auth.uid(),v_actor_member_id,'confirm_loan_repayment','loan_repayment',v_payment.id::text,jsonb_build_object('loan_id',v_payment.loan_id,'amount',v_payment.amount,'status','confirmed'));
  return v_payment.id;
end;
$function$;
revoke all on function public.confirm_repayment(uuid) from public,anon;
grant execute on function public.confirm_repayment(uuid) to authenticated,service_role;

create or replace function public.cl_loan_guard_disbursement_approvals()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_count integer; v_office boolean;
begin
  if new.status='active' and old.status is distinct from 'active' then
    select count(*) into v_count from public.loan_approvals a where a.loan_id=new.id and a.group_id=new.group_id and a.decision='approved' and a.approval_slot in ('chairperson','treasurer','secretary');
    if v_count<>3 or exists(select 1 from public.loan_approvals a where a.loan_id=new.id and a.decision='rejected') then raise exception 'Loan disbursement blocked: Chairperson, Treasurer and Secretary approvals are all required' using errcode='42501'; end if;
    select exists(select 1 from public.members m where m.group_id=new.group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(coalesce(m.status,'active'))='active' and lower(coalesce(m.onboarding_status,'active'))='active'
      and (lower(btrim(coalesce(m.actual_position,''))) in ('chairperson','vice chairperson','treasurer') or lower(btrim(coalesce(m.actual_position_name,''))) in ('chairperson','vice chairperson','treasurer'))) into v_office;
    if not v_office then raise exception 'Disbursement requires a declared Chairperson or Treasurer office' using errcode='42501'; end if;
  end if;
  return new;
end;
$function$;
