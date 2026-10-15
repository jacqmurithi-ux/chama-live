-- CHAMA LIVE: role-based loan workflow hardening.
-- Additive compatibility migration: preserve the existing loan_applications / loan_repayment_schedule model.
-- This file is intentionally NOT applied to production by this commit.

begin;

alter table public.loan_settings
  add column if not exists enabled boolean not null default true;

alter table public.loan_applications
  add column if not exists penalty_snapshot numeric(14,2),
  add column if not exists guarantor_status text not null default 'not_required';

-- The existing status constraint predates member cancellation.
alter table public.loan_applications drop constraint if exists loan_applications_status_check;
alter table public.loan_applications add constraint loan_applications_status_check
  check (status = any (array['submitted','approved','rejected','active','overdue','cleared','cancelled']::text[]));

alter table public.loan_repayments
  add column if not exists status text not null default 'confirmed',
  add column if not exists confirmed_by uuid references auth.users(id),
  add column if not exists confirmed_at timestamptz;

-- Existing repayments were allocated by the legacy RPC, so they remain confirmed.
update public.loan_repayments set status='confirmed' where status is null;

create table if not exists public.loan_audit (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  loan_id uuid references public.loan_applications(id) on delete set null,
  actor_id uuid references auth.users(id),
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists loan_audit_group_loan_created_idx
  on public.loan_audit(group_id, loan_id, created_at desc);

alter table public.loan_audit enable row level security;
alter table public.loan_settings enable row level security;
alter table public.loan_applications enable row level security;
alter table public.loan_approvals enable row level security;
alter table public.loan_repayment_schedule enable row level security;
alter table public.loan_repayments enable row level security;
alter table public.loan_repayment_allocations enable row level security;

-- Backfill the new settings switch from the existing module switch.
update public.loan_settings s
set enabled = g.loans_enabled
from public.groups g
where g.id=s.group_id;

-- Preserve the best available current terms for loans created before snapshots existed.
update public.loan_applications l
set interest_rate_snapshot=coalesce(l.interest_rate_snapshot,s.interest_rate),
    interest_type_snapshot=coalesce(l.interest_type_snapshot,s.interest_type),
    penalty_snapshot=coalesce(l.penalty_snapshot,s.late_penalty)
from public.loan_settings s
where s.group_id=l.group_id
  and (l.interest_rate_snapshot is null or l.interest_type_snapshot is null or l.penalty_snapshot is null);

create or replace function public.current_group_id()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select m.group_id
  from public.members m
  where (m.auth_user_id=auth.uid() or m.user_id=auth.uid())
    and lower(coalesce(m.status,'active'))='active'
    and lower(coalesce(m.onboarding_status,'active'))='active'
  order by m.created_at desc
  limit 1
$$;

create or replace function public.is_group_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists(
    select 1 from public.members m
    where m.group_id=public.current_group_id()
      and (m.auth_user_id=auth.uid() or m.user_id=auth.uid())
      and lower(coalesce(m.status,'active'))='active'
      and lower(coalesce(m.onboarding_status,'active'))='active'
      and lower(btrim(coalesce(m.role,''))) in ('admin','administrator')
  )
$$;

-- Explicit elected/appointed office only. A technical Admin role is not an office.
create or replace function public.has_office(p_office text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.members m
    where m.group_id=public.current_group_id()
      and (m.auth_user_id=auth.uid() or m.user_id=auth.uid())
      and lower(coalesce(m.status,'active'))='active'
      and lower(coalesce(m.onboarding_status,'active'))='active'
      and case lower(btrim(coalesce(p_office,'')))
        when 'chairperson' then
          lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in ('chairperson','vice chairperson','chair','vice chair')
          or lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in ('chairperson','vice chairperson','chair','vice chair')
        when 'treasurer' then
          lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g'))='treasurer'
          or lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g'))='treasurer'
        when 'secretary' then
          lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in ('secretary','vice secretary')
          or lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in ('secretary','vice secretary')
        else false
      end
  )
$$;

create or replace function public.cl_loan_audit_row()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
  v_loan_id uuid;
  v_action text;
  v_detail jsonb;
  v_actor uuid;
begin
  v_actor := auth.uid();
  if tg_table_name='loan_applications' then
    v_group_id := new.group_id;
    v_loan_id := new.id;
    if tg_op='INSERT' then
      v_action := 'application_submitted';
      v_detail := jsonb_build_object('requested_amount',new.requested_amount,'period_months',new.period_months,'status',new.status);
    elsif old.status is distinct from new.status then
      v_action := 'status_changed';
      v_detail := jsonb_build_object('from',old.status,'to',new.status,'approved_amount',new.approved_amount,'decision_note',new.decision_note);
    elsif old.approved_amount is distinct from new.approved_amount or old.disbursed_at is distinct from new.disbursed_at then
      v_action := 'loan_edited';
      v_detail := jsonb_build_object('approved_amount',new.approved_amount,'disbursed_at',new.disbursed_at);
    elsif old.guarantor_status is distinct from new.guarantor_status then
      v_action := 'guarantor_response';
      v_detail := jsonb_build_object('guarantor_status',new.guarantor_status,'guarantor_member_id',new.guarantor_member_id);
    else
      return new;
    end if;
  elsif tg_table_name='loan_approvals' then
    v_group_id := new.group_id; v_loan_id := new.loan_id;
    v_action := case when new.decision='approved' then 'office_approved' else 'office_rejected' end;
    v_detail := jsonb_build_object('office',new.approval_slot,'decision',new.decision,'reason',new.note);
    v_actor := coalesce(v_actor,new.approver_user_id);
  elsif tg_table_name='loan_repayments' then
    v_group_id := new.group_id; v_loan_id := new.loan_id;
    if tg_op='INSERT' then
      v_action := 'repayment_recorded';
      v_detail := jsonb_build_object('repayment_id',new.id,'amount',new.amount,'status',new.status,'paid_on',new.payment_date,'reference',new.reference);
    elsif old.status is distinct from new.status then
      v_action := 'repayment_confirmed';
      v_detail := jsonb_build_object('repayment_id',new.id,'amount',new.amount,'from',old.status,'to',new.status,'confirmed_by',new.confirmed_by);
      v_actor := coalesce(v_actor,new.confirmed_by);
    else
      return new;
    end if;
  elsif tg_table_name='loan_settings' then
    v_group_id := new.group_id; v_loan_id := null;
    v_action := 'settings_updated';
    v_detail := jsonb_build_object('enabled',new.enabled,'annual_rate',new.interest_rate,'interest_method',new.interest_type,
      'max_amount',new.max_loan_amount,'max_period_months',new.max_period_months,'late_penalty',new.late_penalty);
    v_actor := coalesce(v_actor,new.updated_by);
  else
    return new;
  end if;
  insert into public.loan_audit(group_id,loan_id,actor_id,action,detail)
  values(v_group_id,v_loan_id,v_actor,v_action,coalesce(v_detail,'{}'::jsonb));
  return new;
end
$;

drop trigger if exists cl_loan_audit_application on public.loan_applications;
create trigger cl_loan_audit_application
after insert or update on public.loan_applications
for each row execute function public.cl_loan_audit_row();

drop trigger if exists cl_loan_audit_approval on public.loan_approvals;
create trigger cl_loan_audit_approval
after insert on public.loan_approvals
for each row execute function public.cl_loan_audit_row();

drop trigger if exists cl_loan_audit_repayment on public.loan_repayments;
create trigger cl_loan_audit_repayment
after insert or update of status on public.loan_repayments
for each row execute function public.cl_loan_audit_row();

drop trigger if exists cl_loan_audit_settings on public.loan_settings;
create trigger cl_loan_audit_settings
after insert or update on public.loan_settings
for each row execute function public.cl_loan_audit_row();

-- Application-time guard and snapshots. These checks also protect calls to legacy RPCs.
create or replace function public.cl_loan_validate_application()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.loan_settings%rowtype;
  v_member public.members%rowtype;
begin
  select * into v_settings from public.loan_settings where group_id=new.group_id;
  if not found or not coalesce(v_settings.enabled,false)
     or not exists(select 1 from public.groups g where g.id=new.group_id and g.loans_enabled=true) then
    raise exception 'Loans are not yet available for this group.' using errcode='55000';
  end if;
  if new.requested_amount is null or new.requested_amount<=0
     or new.requested_amount>v_settings.max_loan_amount
     or new.period_months is null or new.period_months<1
     or new.period_months>v_settings.max_period_months then
    raise exception 'Requested amount or period exceeds the group loan terms.' using errcode='22023';
  end if;
  select * into v_member from public.members m
  where m.id=new.member_id and m.group_id=new.group_id
    and (m.user_id=auth.uid() or m.auth_user_id=auth.uid());
  if not found then
    raise exception 'Loan applications must belong to the signed-in member.' using errcode='42501';
  end if;
  if exists(select 1 from public.loan_applications l
    where l.group_id=new.group_id and l.member_id=new.member_id
      and l.status in ('submitted','approved')) then
    raise exception 'You already have a pending loan application.' using errcode='55000';
  end if;
  if exists(select 1 from public.loan_applications l
    where l.group_id=new.group_id and l.member_id=new.member_id
      and (l.status='overdue' or (l.status='active' and exists(
        select 1 from public.loan_repayment_schedule s
        where s.loan_id=l.id and s.due_date<current_date
          and s.amount_paid < s.principal_due+s.interest_due+s.penalty_due)))) then
    raise exception 'You cannot apply while you have an overdue loan.' using errcode='55000';
  end if;
  if new.guarantor_member_id is not null and not exists(
    select 1 from public.members g where g.id=new.guarantor_member_id and g.group_id=new.group_id
      and g.id<>new.member_id and g.status='active' and g.onboarding_status='active') then
    raise exception 'A guarantor must be another active member of this group.' using errcode='22023';
  end if;
  new.interest_rate_snapshot := v_settings.interest_rate;
  new.interest_type_snapshot := v_settings.interest_type;
  new.penalty_snapshot := v_settings.late_penalty;
  new.guarantor_status := case when new.guarantor_member_id is null then 'not_required' else 'pending' end;
  return new;
end
$$;

drop trigger if exists cl_loan_validate_application on public.loan_applications;
create trigger cl_loan_validate_application
before insert on public.loan_applications
for each row execute function public.cl_loan_validate_application();

-- Once captured at application time, loan terms are immutable even if settings change before approval/disbursement.
create or replace function public.cl_loan_preserve_term_snapshots()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $
begin
  if old.interest_rate_snapshot is not null then new.interest_rate_snapshot:=old.interest_rate_snapshot; end if;
  if old.interest_type_snapshot is not null then new.interest_type_snapshot:=old.interest_type_snapshot; end if;
  if old.penalty_snapshot is not null then new.penalty_snapshot:=old.penalty_snapshot; end if;
  return new;
end
$;

drop trigger if exists cl_loan_preserve_term_snapshots on public.loan_applications;
create trigger cl_loan_preserve_term_snapshots
before update on public.loan_applications
for each row execute function public.cl_loan_preserve_term_snapshots();

-- Only the explicitly recorded office may fill its approval slot; Admin role alone is insufficient.
create or replace function public.cl_loan_validate_office_approval()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.members%rowtype;
  v_slot text;
begin
  select * into v_member from public.members m
  where m.group_id=new.group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and m.status='active' and m.onboarding_status='active';
  if not found then raise exception 'Active group membership is required.' using errcode='42501'; end if;
  if exists(select 1 from public.loan_applications l where l.id=new.loan_id and l.member_id=v_member.id) then
    raise exception 'A loan applicant cannot approve or reject their own loan.' using errcode='42501';
  end if;
  if lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in ('chairperson','vice chairperson','chair','vice chair')
     or lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in ('chairperson','vice chairperson','chair','vice chair') then v_slot:='chairperson';
  elsif lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g'))='treasurer'
     or lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g'))='treasurer' then v_slot:='treasurer';
  elsif lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in ('secretary','vice secretary')
     or lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in ('secretary','vice secretary') then v_slot:='secretary';
  else raise exception 'Admin-only accounts cannot approve loans. An explicit Chairperson, Treasurer or Secretary office is required.' using errcode='42501';
  end if;
  if new.approval_slot<>v_slot then
    raise exception 'You may decide only for your own office (%).',v_slot using errcode='42501';
  end if;
  return new;
end
$$;

drop trigger if exists cl_loan_validate_office_approval on public.loan_approvals;
create trigger cl_loan_validate_office_approval
before insert or update on public.loan_approvals
for each row execute function public.cl_loan_validate_office_approval();

-- Disbursement is Treasurer-only and requires all three office approvals.
create or replace function public.cl_loan_validate_disbursement()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_member public.members%rowtype;
begin
  if old.status is distinct from new.status and new.status='active' then
    select * into v_member from public.members m
    where m.group_id=new.group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and m.status='active' and m.onboarding_status='active';
    if not found or not (
      lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g'))='treasurer'
      or lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g'))='treasurer'
    ) then
      raise exception 'Only the Treasurer can disburse a loan.' using errcode='42501';
    end if;
    if (select count(distinct a.approval_slot) from public.loan_approvals a
      where a.loan_id=new.id and a.decision='approved'
        and a.approval_slot in ('chairperson','treasurer','secretary'))<>3 then
      raise exception 'A loan cannot be disbursed until Chairperson, Treasurer and Secretary have all approved.' using errcode='55000';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists cl_loan_validate_disbursement on public.loan_applications;
create trigger cl_loan_validate_disbursement
before update of status on public.loan_applications
for each row execute function public.cl_loan_validate_disbursement();

-- Notifications and audit for guarantor invitations, cancellation and reminder requests.
create or replace function public.cl_loan_notify_guarantor_and_offices()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_name text; v_official record; v_position text; v_position_name text;
begin
  if tg_op='INSERT' then
    select m.name into v_name from public.members m where m.id=new.member_id;
    if new.guarantor_member_id is not null then
      perform public.cl_loan_emit_notification(new.group_id,new.guarantor_member_id,new.id,'guarantor_request','Loan guarantor request',
        coalesce(v_name,'A group member')||' has requested you as guarantor for a loan application.');
    end if;
    perform public.cl_loan_emit_notification(new.group_id,new.member_id,new.id,'application_submitted','Loan application submitted',
      'Your loan application has been submitted for the required office decisions.');
    for v_official in
      select m.id,m.role,m.actual_position,m.actual_position_name
      from public.members m
      where m.group_id=new.group_id and m.id<>new.member_id
        and lower(coalesce(m.status,'active'))='active'
        and lower(coalesce(m.onboarding_status,'active'))='active'
        and (
          lower(coalesce(m.role,'')) in ('admin','administrator')
          or lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in ('chairperson','vice chairperson','chair','vice chair','treasurer','secretary','vice secretary')
          or lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in ('chairperson','vice chairperson','chair','vice chair','treasurer','secretary','vice secretary')
        )
    loop
      perform public.cl_loan_emit_notification(new.group_id,v_official.id,new.id,'application_review_requested','Loan application awaiting review',
        'A member has submitted a loan application requiring the three office decisions.');
    end loop;
    return new;
  end if;
  if old.guarantor_status is distinct from new.guarantor_status and new.guarantor_member_id is not null then
    perform public.cl_loan_emit_notification(new.group_id,new.member_id,new.id,'guarantor_response','Guarantor response',
      'Your guarantor request was '||new.guarantor_status||'.');
  end if;
  if old.status is distinct from new.status and new.status='cancelled' then
    perform public.cl_loan_emit_notification(new.group_id,new.member_id,new.id,'application_cancelled','Loan application cancelled',
      'Your pending loan application has been cancelled.');
  end if;
  return new;
end
$$;

drop trigger if exists cl_loan_notify_guarantor_and_offices on public.loan_applications;
create trigger cl_loan_notify_guarantor_and_offices
after insert or update of status, guarantor_status on public.loan_applications
for each row execute function public.cl_loan_notify_guarantor_and_offices();

create or replace function public.set_loan_settings(
  p_group_id uuid,
  p_enabled boolean,
  p_interest_rate numeric,
  p_interest_type text,
  p_max_loan_amount numeric,
  p_max_period_months integer,
  p_late_penalty numeric
)
returns public.loan_settings
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_settings public.loan_settings%rowtype;
begin
  if not exists(select 1 from public.members m where m.group_id=p_group_id
    and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and lower(coalesce(m.status,'active'))='active'
    and lower(coalesce(m.onboarding_status,'active'))='active'
    and lower(coalesce(m.role,'')) in ('admin','administrator')) then
    raise exception 'Only the group Admin can change loan settings.' using errcode='42501';
  end if;
  if p_enabled is null or p_interest_rate is null or p_interest_rate<0 or p_interest_rate>100
    or p_interest_type not in ('flat','reducing_balance') or p_max_loan_amount is null or p_max_loan_amount<=0
    or p_max_period_months is null or p_max_period_months<1 or p_max_period_months>120
    or p_late_penalty is null or p_late_penalty<0 then
    raise exception 'Invalid loan settings.' using errcode='22023';
  end if;
  insert into public.loan_settings(group_id,enabled,interest_rate,interest_type,max_loan_amount,max_period_months,late_penalty,updated_by,updated_at)
  values(p_group_id,p_enabled,p_interest_rate,p_interest_type,p_max_loan_amount,p_max_period_months,p_late_penalty,auth.uid(),now())
  on conflict(group_id) do update set enabled=excluded.enabled,interest_rate=excluded.interest_rate,interest_type=excluded.interest_type,
    max_loan_amount=excluded.max_loan_amount,max_period_months=excluded.max_period_months,late_penalty=excluded.late_penalty,
    updated_by=excluded.updated_by,updated_at=now()
  returning * into v_settings;
  update public.groups set loans_enabled=p_enabled where id=p_group_id;
  return v_settings;
end
$$;

create or replace function public.apply_for_loan(
  p_group_id uuid, p_amount numeric, p_period integer, p_purpose text, p_guarantor_id uuid default null
)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  return public.cl_loan_apply(p_group_id,p_amount,p_period,p_purpose,p_guarantor_id);
end
$$;

create or replace function public.cancel_loan(p_loan_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_loan public.loan_applications%rowtype; v_member_id uuid;
begin
  select * into v_loan from public.loan_applications where id=p_loan_id for update;
  if not found then raise exception 'Loan application not found.' using errcode='P0002'; end if;
  v_member_id:=public.cl_loan_actor(v_loan.group_id,false);
  if v_loan.member_id<>v_member_id then raise exception 'You can cancel only your own loan application.' using errcode='42501'; end if;
  if v_loan.status<>'submitted' then raise exception 'Only pending applications can be cancelled.' using errcode='55000'; end if;
  update public.loan_applications set status='cancelled',updated_at=now() where id=p_loan_id;
  return p_loan_id;
end
$$;

create or replace function public.respond_guarantor(p_loan_id uuid,p_accept boolean)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_loan public.loan_applications%rowtype; v_actor uuid;
begin
  select * into v_loan from public.loan_applications where id=p_loan_id for update;
  if not found then raise exception 'Loan application not found.' using errcode='P0002'; end if;
  v_actor:=public.cl_loan_actor(v_loan.group_id,false);
  if v_loan.guarantor_member_id is distinct from v_actor then raise exception 'Only the requested guarantor can respond.' using errcode='42501'; end if;
  if v_loan.guarantor_status<>'pending' then raise exception 'This guarantor request has already been answered.' using errcode='55000'; end if;
  update public.loan_applications set guarantor_status=case when p_accept then 'accepted' else 'declined' end,updated_at=now()
  where id=p_loan_id;
  return p_loan_id;
end
$$;

create or replace function public.decide_loan(p_group_id uuid,p_loan_id uuid,p_decision text,p_reason text default null)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_loan public.loan_applications%rowtype;
begin
  select * into v_loan from public.loan_applications where id=p_loan_id and group_id=p_group_id;
  if not found then raise exception 'Loan application not found.' using errcode='P0002'; end if;
  if length(btrim(coalesce(p_reason,'')))=0 then
    raise exception 'A reason is required for an approval or rejection.' using errcode='22023';
  end if;
  return public.cl_loan_review_authorized(p_group_id,p_loan_id,p_decision,p_reason,
    case when p_decision='approved' then v_loan.requested_amount else null end);
end
$$;

create or replace function public.disburse_loan(p_group_id uuid,p_loan_id uuid,p_disbursed_date date default current_date)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- The trigger on loan_applications independently enforces Treasurer + three approvals.
  return public.cl_loan_disburse(p_group_id,p_loan_id,p_disbursed_date);
end
$$;

-- Repayments are requests until an official confirms them. Legacy immediate-allocation RPCs are revoked from clients below.
create or replace function public.record_repayment(
  p_group_id uuid,p_loan_id uuid,p_amount numeric,p_paid_on date,p_reference text default null
)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_member_id uuid; v_loan public.loan_applications%rowtype; v_id uuid;
begin
  v_member_id:=public.cl_loan_actor(p_group_id,false);
  select * into v_loan from public.loan_applications where id=p_loan_id and group_id=p_group_id for update;
  if not found then raise exception 'Loan not found.' using errcode='P0002'; end if;
  if v_loan.member_id<>v_member_id then raise exception 'You can record repayment only for your own loan.' using errcode='42501'; end if;
  if v_loan.status not in ('active','overdue') then raise exception 'Repayments can be submitted only for an active loan.' using errcode='55000'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Enter a positive repayment amount.' using errcode='22023'; end if;
  insert into public.loan_repayments(group_id,loan_id,amount,payment_date,payment_method,reference,recorded_by,status)
  values(p_group_id,p_loan_id,p_amount,coalesce(p_paid_on,current_date),'other',nullif(btrim(coalesce(p_reference,'')),''),auth.uid(),'pending')
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.confirm_repayment(p_repayment_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_repayment public.loan_repayments%rowtype;
  v_loan public.loan_applications%rowtype;
  v_member public.members%rowtype;
  r record;
  v_remaining numeric(14,2);
  v_total numeric(14,2);
  v_penalty numeric(14,2);
  v_interest numeric(14,2);
  v_principal numeric(14,2);
  v_paid numeric(14,2);
begin
  select * into v_repayment from public.loan_repayments where id=p_repayment_id for update;
  if not found then raise exception 'Repayment not found.' using errcode='P0002'; end if;
  if v_repayment.status<>'pending' then raise exception 'Only pending repayments can be confirmed.' using errcode='55000'; end if;
  select * into v_loan from public.loan_applications where id=v_repayment.loan_id and group_id=v_repayment.group_id for update;
  if not found then raise exception 'Loan not found.' using errcode='P0002'; end if;
  select * into v_member from public.members m where m.group_id=v_loan.group_id
    and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and m.status='active' and m.onboarding_status='active';
  if not found then raise exception 'Active group membership is required.' using errcode='42501'; end if;
  if not (
    lower(coalesce(v_member.role,'')) in ('admin','administrator')
    or lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in ('chairperson','vice chairperson','chair','vice chair','treasurer','secretary','vice secretary')
    or lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in ('chairperson','vice chairperson','chair','vice chair','treasurer','secretary','vice secretary')
  ) then raise exception 'Only an authorized group official can confirm repayments.' using errcode='42501'; end if;
  select coalesce(sum(principal_due+interest_due+penalty_due-amount_paid),0) into v_total
  from public.loan_repayment_schedule where loan_id=v_loan.id and group_id=v_loan.group_id;
  if v_repayment.amount>v_total then raise exception 'Repayment exceeds the outstanding loan balance.' using errcode='22023'; end if;
  v_remaining:=v_repayment.amount;
  for r in
    select s.*,
      coalesce(a.penalty_paid,0) as penalty_paid,
      coalesce(a.interest_paid,0) as interest_paid,
      coalesce(a.principal_paid,0) as principal_paid
    from public.loan_repayment_schedule s
    left join (
      select schedule_id,sum(penalty_amount) penalty_paid,
        sum(interest_amount) interest_paid,sum(principal_amount) principal_paid
      from public.loan_repayment_allocations group by schedule_id
    ) a on a.schedule_id=s.id
    where s.loan_id=v_loan.id and s.group_id=v_loan.group_id
      and s.amount_paid < s.principal_due+s.interest_due+s.penalty_due
    order by s.due_date,s.installment_no for update of s
  loop
    exit when v_remaining<=0;
    v_penalty:=least(v_remaining,greatest(r.penalty_due-r.penalty_paid,0));
    v_remaining:=v_remaining-v_penalty;
    v_interest:=least(v_remaining,greatest(r.interest_due-r.interest_paid,0));
    v_remaining:=v_remaining-v_interest;
    v_principal:=least(v_remaining,greatest(r.principal_due-r.principal_paid,0));
    v_remaining:=v_remaining-v_principal;
    v_paid:=v_penalty+v_interest+v_principal;
    if v_paid>0 then
      insert into public.loan_repayment_allocations(group_id,repayment_id,loan_id,schedule_id,principal_amount,interest_amount,penalty_amount)
      values(v_loan.group_id,v_repayment.id,v_loan.id,r.id,v_principal,v_interest,v_penalty);
      update public.loan_repayment_schedule s
      set amount_paid=s.amount_paid+v_paid,
          status=case when s.amount_paid+v_paid>=s.principal_due+s.interest_due+s.penalty_due then 'paid' when s.amount_paid+v_paid>0 then 'partial' else s.status end,
          paid_at=case when s.amount_paid+v_paid>=s.principal_due+s.interest_due+s.penalty_due then now() else s.paid_at end
      where s.id=r.id;
    end if;
  end loop;
  update public.loan_repayments set status='confirmed',confirmed_by=auth.uid(),confirmed_at=now() where id=p_repayment_id;
  if not exists(select 1 from public.loan_repayment_schedule s where s.loan_id=v_loan.id
    and s.amount_paid<s.principal_due+s.interest_due+s.penalty_due) then
    update public.loan_applications set status='cleared',cleared_at=now(),updated_at=now() where id=v_loan.id;
  elsif exists(select 1 from public.loan_repayment_schedule s where s.loan_id=v_loan.id
    and s.due_date<current_date and s.amount_paid<s.principal_due+s.interest_due+s.penalty_due) then
    update public.loan_applications set status='overdue',updated_at=now() where id=v_loan.id;
  end if;
  perform public.cl_loan_emit_notification(v_loan.group_id,v_loan.member_id,v_loan.id,'repayment_confirmed','Loan repayment confirmed',
    'Your repayment of KES '||to_char(v_repayment.amount,'FM999999999990.00')||' has been confirmed and allocated to the oldest unpaid installments.');
  return p_repayment_id;
end
$$;

create or replace function public.apply_late_penalties(p_group_id uuid)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_actor uuid; v_count integer;
begin
  v_actor:=public.cl_loan_actor(p_group_id,false);
  if not (
    public.cl_user_has_role(p_group_id,array['admin']::text[])
    or exists(select 1 from public.members m where m.group_id=p_group_id
      and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in
        ('chairperson','vice chairperson','chair','vice chair','treasurer','secretary','vice secretary'))
    or exists(select 1 from public.members m where m.group_id=p_group_id
      and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in
        ('chairperson','vice chairperson','chair','vice chair','treasurer','secretary','vice secretary'))
  ) then raise exception 'Only an authorized official can refresh overdue loans.' using errcode='42501'; end if;
  update public.loan_repayment_schedule s
  set penalty_due=coalesce(l.penalty_snapshot,0)
  from public.loan_applications l
  where l.id=s.loan_id and l.group_id=p_group_id
    and l.status in ('active','overdue') and s.due_date<current_date
    and s.penalty_due=0 and s.amount_paid<s.principal_due+s.interest_due+s.penalty_due
    and coalesce(l.penalty_snapshot,0)>0;
  get diagnostics v_count=row_count;
  update public.loan_applications l set status='overdue',updated_at=now()
  where l.group_id=p_group_id and l.status='active'
    and exists(select 1 from public.loan_repayment_schedule s where s.loan_id=l.id
      and s.due_date<current_date and s.amount_paid<s.principal_due+s.interest_due+s.penalty_due);
  insert into public.loan_audit(group_id,loan_id,actor_id,action,detail)
  values(p_group_id,null,auth.uid(),'late_penalties_applied',jsonb_build_object('installments_updated',v_count));
  return v_count;
end
$$;

create or replace function public.send_loan_reminder(p_loan_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_loan public.loan_applications%rowtype;
begin
  select * into v_loan from public.loan_applications where id=p_loan_id;
  if not found then raise exception 'Loan not found.' using errcode='P0002'; end if;
  if not (
    public.cl_user_has_role(v_loan.group_id,array['admin']::text[])
    or exists(select 1 from public.members m where m.group_id=v_loan.group_id
      and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in ('chairperson','vice chairperson','chair','vice chair','treasurer','secretary','vice secretary'))
    or exists(select 1 from public.members m where m.group_id=v_loan.group_id
      and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in ('chairperson','vice chairperson','chair','vice chair','treasurer','secretary','vice secretary'))
  ) then raise exception 'Only an authorized official can send loan reminders.' using errcode='42501'; end if;
  if v_loan.status not in ('overdue','active') or not exists(select 1 from public.loan_repayment_schedule s
    where s.loan_id=v_loan.id and s.due_date<current_date and s.amount_paid<s.principal_due+s.interest_due+s.penalty_due) then
    raise exception 'This loan has no overdue installment.' using errcode='55000';
  end if;
  perform public.cl_loan_emit_notification(v_loan.group_id,v_loan.member_id,v_loan.id,'repayment_reminder','Loan repayment reminder',
    'Your loan has an overdue installment. Please review your repayment schedule and contact the group Treasurer if you need assistance.');
  insert into public.loan_audit(group_id,loan_id,actor_id,action,detail)
  values(v_loan.group_id,v_loan.id,auth.uid(),'reminder_sent',jsonb_build_object('member_id',v_loan.member_id));
end
$$;

create or replace function public.group_loan_summary(p_group_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not (
    public.cl_user_has_role(p_group_id,array['admin','chairperson','secretary','treasurer']::text[])
  ) then raise exception 'Only group officials can view loan totals.' using errcode='42501'; end if;
  return public.cl_get_group_loan_summary(p_group_id);
end
$$;

drop policy if exists loan_settings_read_member on public.loan_settings;
create policy loan_settings_read_member on public.loan_settings
for select to authenticated
using (exists(select 1 from public.members m
  where m.group_id=loan_settings.group_id
    and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and lower(coalesce(m.status,'active'))='active'
    and lower(coalesce(m.onboarding_status,'active'))='active'));

drop policy if exists loan_applications_read_guarantor on public.loan_applications;
create policy loan_applications_read_guarantor on public.loan_applications
for select to authenticated
using (exists(select 1 from public.members m
  where m.id=loan_applications.guarantor_member_id
    and m.group_id=loan_applications.group_id
    and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and lower(coalesce(m.status,'active'))='active'
    and lower(coalesce(m.onboarding_status,'active'))='active'));

-- Loan audit is readable only by authorized group officials; no direct client writes.
drop policy if exists loan_audit_read_official on public.loan_audit;
create policy loan_audit_read_official on public.loan_audit
for select to authenticated
using (
  public.cl_group_module_enabled(group_id,'loans')
  and (
    public.cl_user_has_role(group_id,array['admin','chairperson','secretary','treasurer']::text[])
    or exists(select 1 from public.members m where m.group_id=loan_audit.group_id
      and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in
        ('chairperson','vice chairperson','chair','vice chair','treasurer','secretary','vice secretary'))
    or exists(select 1 from public.members m where m.group_id=loan_audit.group_id
      and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g')) in
        ('chairperson','vice chairperson','chair','vice chair','treasurer','secretary','vice secretary'))
  )
);

-- Client writes go through security-definer RPCs only.
revoke insert, update, delete on public.loan_applications from anon, authenticated;
revoke insert, update, delete on public.loan_approvals from anon, authenticated;
revoke insert, update, delete on public.loan_repayment_schedule from anon, authenticated;
revoke insert, update, delete on public.loan_repayment_allocations from anon, authenticated;
revoke insert, update, delete on public.loan_repayments from anon, authenticated;
revoke insert, update, delete on public.loan_settings from anon, authenticated;
revoke insert, delete on public.loan_notifications from anon, authenticated;
revoke update on public.loan_notifications from anon, authenticated;
grant update(read_at) on public.loan_notifications to authenticated;
revoke all on public.loan_audit from anon, authenticated;
grant select on public.loan_audit to authenticated;

-- Remove direct access to the legacy immediate-allocation entry points.
revoke execute on function public.cl_loan_record_repayment(uuid,uuid,numeric,date,text,text,text) from public, anon, authenticated;
revoke execute on function public.cl_loan_record_repayment_authorized(uuid,uuid,numeric,date,text,text,text) from public, anon, authenticated;

-- Only authenticated callers may use these RPC endpoints.
revoke all on function public.current_group_id() from public, anon;
revoke all on function public.is_group_admin() from public, anon;
revoke all on function public.has_office(text) from public, anon;
revoke all on function public.set_loan_settings(uuid,boolean,numeric,text,numeric,integer,numeric) from public, anon;
revoke all on function public.apply_for_loan(uuid,numeric,integer,text,uuid) from public, anon;
revoke all on function public.cancel_loan(uuid) from public, anon;
revoke all on function public.respond_guarantor(uuid,boolean) from public, anon;
revoke all on function public.decide_loan(uuid,uuid,text,text) from public, anon;
revoke all on function public.disburse_loan(uuid,uuid,date) from public, anon;
revoke all on function public.record_repayment(uuid,uuid,numeric,date,text) from public, anon;
revoke all on function public.confirm_repayment(uuid) from public, anon;
revoke all on function public.apply_late_penalties(uuid) from public, anon;
revoke all on function public.send_loan_reminder(uuid) from public, anon;
revoke all on function public.group_loan_summary(uuid) from public, anon;

grant execute on function public.current_group_id() to authenticated;
grant execute on function public.is_group_admin() to authenticated;
grant execute on function public.has_office(text) to authenticated;
grant execute on function public.set_loan_settings(uuid,boolean,numeric,text,numeric,integer,numeric) to authenticated;
grant execute on function public.apply_for_loan(uuid,numeric,integer,text,uuid) to authenticated;
grant execute on function public.cancel_loan(uuid) to authenticated;
grant execute on function public.respond_guarantor(uuid,boolean) to authenticated;
grant execute on function public.decide_loan(uuid,uuid,text,text) to authenticated;
grant execute on function public.disburse_loan(uuid,uuid,date) to authenticated;
grant execute on function public.record_repayment(uuid,uuid,numeric,date,text) to authenticated;
grant execute on function public.confirm_repayment(uuid) to authenticated;
grant execute on function public.apply_late_penalties(uuid) to authenticated;
grant execute on function public.send_loan_reminder(uuid) to authenticated;
grant execute on function public.group_loan_summary(uuid) to authenticated;

commit;
