-- CHAMA LIVE: merry-go-round and loans workflows (candidate-only until approved).
-- Depends on 20261013090000_optional_group_modules_phase0.sql.
-- This migration is additive; it does not write to canonical contributions or contribution_allocations.
begin;

create table if not exists public.merry_go_rounds (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 120),
  contribution_amount numeric(14,2) not null check (contribution_amount > 0),
  frequency text not null check (frequency in ('weekly','fortnightly','monthly')),
  start_date date not null,
  status text not null default 'draft' check (status in ('draft','active','completed','cancelled')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.merry_go_round_members (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.merry_go_rounds(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  turn_number integer not null check (turn_number > 0),
  status text not null default 'active' check (status in ('active','withdrawn')),
  created_at timestamptz not null default now(),
  unique (round_id, member_id),
  unique (round_id, turn_number)
);

create table if not exists public.merry_go_round_cycles (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.merry_go_rounds(id) on delete restrict,
  cycle_number integer not null check (cycle_number > 0),
  recipient_member_id uuid not null references public.members(id) on delete restrict,
  scheduled_date date not null,
  status text not null default 'open' check (status in ('open','paid','skipped')),
  created_at timestamptz not null default now(),
  unique (round_id, cycle_number),
  unique (round_id, recipient_member_id)
);

create table if not exists public.merry_go_round_payments (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.merry_go_round_cycles(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default current_date,
  payment_method text not null check (length(btrim(payment_method)) between 2 and 40),
  reference text,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  unique (cycle_id, member_id)
);

create table if not exists public.merry_go_round_payouts (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null unique references public.merry_go_round_cycles(id) on delete restrict,
  recipient_member_id uuid not null references public.members(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payout_date date not null default current_date,
  payment_method text not null check (length(btrim(payment_method)) between 2 and 40),
  reference text,
  recorded_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_loan_applications (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  requested_amount numeric(14,2) not null check (requested_amount > 0),
  purpose text not null check (length(btrim(purpose)) between 5 and 1000),
  requested_term_months integer not null check (requested_term_months between 1 and 60),
  status text not null default 'pending' check (status in ('pending','approved','rejected','disbursed','closed')),
  decision_note text,
  approved_amount numeric(14,2) check (approved_amount > 0),
  flat_interest_rate numeric(7,4) check (flat_interest_rate >= 0 and flat_interest_rate <= 100),
  approved_term_months integer check (approved_term_months between 1 and 60),
  applied_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  disbursed_by uuid,
  disbursed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.group_loan_applications(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default current_date,
  payment_method text not null check (length(btrim(payment_method)) between 2 and 40),
  reference text,
  recorded_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_mgr_rounds_group_status on public.merry_go_rounds(group_id,status);
create index if not exists idx_mgr_cycles_round_date on public.merry_go_round_cycles(round_id,scheduled_date);
create index if not exists idx_mgr_payments_cycle on public.merry_go_round_payments(cycle_id);
create index if not exists idx_group_loans_group_status on public.group_loan_applications(group_id,status);
create index if not exists idx_group_loan_repayments_loan on public.group_loan_repayments(loan_id);
create unique index if not exists uq_group_loan_repayment_reference on public.group_loan_repayments(loan_id, reference) where reference is not null and btrim(reference) <> '';

alter table public.merry_go_rounds enable row level security;
alter table public.merry_go_round_members enable row level security;
alter table public.merry_go_round_cycles enable row level security;
alter table public.merry_go_round_payments enable row level security;
alter table public.merry_go_round_payouts enable row level security;
alter table public.group_loan_applications enable row level security;
alter table public.group_loan_repayments enable row level security;

revoke all on public.merry_go_rounds, public.merry_go_round_members,
  public.merry_go_round_cycles, public.merry_go_round_payments,
  public.merry_go_round_payouts, public.group_loan_applications,
  public.group_loan_repayments from public, anon, authenticated;

create or replace function public.create_merry_go_round(
  p_group_id uuid, p_name text, p_contribution_amount numeric,
  p_frequency text, p_start_date date, p_member_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_round_id uuid;
  v_count integer;
  v_i integer;
  v_member_id uuid;
  v_interval interval;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform public.cl_assert_group_module_enabled(p_group_id,'merry_go_round');
  if not public.cl_user_has_role(p_group_id,array['admin','chairperson','secretary','treasurer']::text[]) then
    raise exception 'Not authorized to manage merry-go-rounds' using errcode='42501';
  end if;
  if p_member_ids is null or cardinality(p_member_ids) < 2 then
    raise exception 'Select at least two members' using errcode='22023';
  end if;
  if cardinality(p_member_ids) <> (select count(distinct x) from unnest(p_member_ids) x) then
    raise exception 'Duplicate members are not allowed' using errcode='22023';
  end if;
  if p_frequency not in ('weekly','fortnightly','monthly') then raise exception 'Invalid frequency' using errcode='22023'; end if;
  select count(*) into v_count
  from public.members m
  where m.id = any(p_member_ids) and m.group_id=p_group_id
    and lower(coalesce(m.status,'active'))='active'
    and lower(coalesce(m.onboarding_status,'active'))='active';
  if v_count <> cardinality(p_member_ids) then raise exception 'Every selected member must be active in this group' using errcode='22023'; end if;

  insert into public.merry_go_rounds(group_id,name,contribution_amount,frequency,start_date,status,created_by)
  values(p_group_id,btrim(p_name),p_contribution_amount,p_frequency,p_start_date,'draft',auth.uid())
  returning id into v_round_id;

  insert into public.merry_go_round_members(round_id,member_id,turn_number)
  select v_round_id,x.member_id,x.ordinality::integer
  from unnest(p_member_ids) with ordinality as x(member_id,ordinality);

  v_interval := case p_frequency when 'weekly' then interval '7 days'
                 when 'fortnightly' then interval '14 days' else interval '1 month' end;
  for v_i in 1..cardinality(p_member_ids) loop
    select x into v_member_id from unnest(p_member_ids) with ordinality as u(x,ord) where ord=v_i;
    insert into public.merry_go_round_cycles(round_id,cycle_number,recipient_member_id,scheduled_date)
    values(v_round_id,v_i,v_member_id,(p_start_date + ((v_i-1)*v_interval))::date);
  end loop;
  return v_round_id;
end;
$$;

create or replace function public.activate_merry_go_round(p_round_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_group_id uuid;
begin
  select group_id into v_group_id from public.merry_go_rounds where id=p_round_id for update;
  if v_group_id is null then raise exception 'Merry-go-round not found' using errcode='P0002'; end if;
  perform public.cl_assert_group_module_enabled(v_group_id,'merry_go_round');
  if not public.cl_user_has_role(v_group_id,array['admin','chairperson','secretary','treasurer']::text[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.merry_go_rounds set status='active',updated_at=now() where id=p_round_id and status='draft';
  if not found then raise exception 'Only a draft merry-go-round can be activated' using errcode='55000'; end if;
  return true;
end;
$$;

create or replace function public.record_merry_go_round_payment(
  p_cycle_id uuid, p_member_id uuid, p_amount numeric,
  p_payment_date date, p_payment_method text, p_reference text default null
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_group_id uuid; v_round_id uuid; v_due numeric; v_status text; v_payment_id uuid;
begin
  select r.group_id,r.id,r.contribution_amount,cy.status
    into v_group_id,v_round_id,v_due,v_status
  from public.merry_go_round_cycles cy
  join public.merry_go_rounds r on r.id=cy.round_id
  where cy.id=p_cycle_id and r.status='active' for update of cy;
  if v_group_id is null then raise exception 'Active cycle not found' using errcode='P0002'; end if;
  perform public.cl_assert_group_module_enabled(v_group_id,'merry_go_round');
  if not public.cl_user_has_role(v_group_id,array['admin','chairperson','secretary','treasurer']::text[]) then raise exception 'Not authorized to record payments' using errcode='42501'; end if;
  if v_status <> 'open' then raise exception 'Cycle is not open' using errcode='55000'; end if;
  if not exists(select 1 from public.merry_go_round_members rm where rm.round_id=v_round_id and rm.member_id=p_member_id and rm.status='active') then
    raise exception 'Payer is not an active round member' using errcode='22023';
  end if;
  if p_amount <> v_due then raise exception 'Payment must equal the agreed cycle contribution; do not record partial payments here' using errcode='22023'; end if;
  insert into public.merry_go_round_payments(cycle_id,member_id,amount,payment_date,payment_method,reference,recorded_by)
  values(p_cycle_id,p_member_id,p_amount,coalesce(p_payment_date,current_date),btrim(p_payment_method),nullif(btrim(p_reference),''),auth.uid())
  returning id into v_payment_id;
  return v_payment_id;
end;
$$;

create or replace function public.record_merry_go_round_payout(
  p_cycle_id uuid, p_payout_date date, p_payment_method text, p_reference text default null
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_group_id uuid; v_round_id uuid; v_due numeric; v_recipient uuid; v_cycle_status text; v_members integer; v_paid integer; v_payout_id uuid;
begin
  select r.group_id,r.id,r.contribution_amount,cy.recipient_member_id,cy.status
    into v_group_id,v_round_id,v_due,v_recipient,v_cycle_status
  from public.merry_go_round_cycles cy join public.merry_go_rounds r on r.id=cy.round_id
  where cy.id=p_cycle_id and r.status='active' for update of cy;
  if v_group_id is null then raise exception 'Active cycle not found' using errcode='P0002'; end if;
  perform public.cl_assert_group_module_enabled(v_group_id,'merry_go_round');
  if not public.cl_user_has_role(v_group_id,array['admin','chairperson','secretary','treasurer']::text[]) then raise exception 'Not authorized to record payouts' using errcode='42501'; end if;
  if v_cycle_status <> 'open' then raise exception 'Cycle is not open or has already been paid' using errcode='55000'; end if;
  select count(*) into v_members from public.merry_go_round_members where round_id=v_round_id and status='active';
  select count(*) into v_paid from public.merry_go_round_payments p
    join public.merry_go_round_members rm on rm.round_id=v_round_id and rm.member_id=p.member_id and rm.status='active'
    where p.cycle_id=p_cycle_id and p.amount=v_due;
  if v_paid <> v_members then raise exception 'Payout blocked: every active member must have a confirmed full contribution' using errcode='55000'; end if;
  insert into public.merry_go_round_payouts(cycle_id,recipient_member_id,amount,payout_date,payment_method,reference,recorded_by)
  values(p_cycle_id,v_recipient,v_due*v_members,coalesce(p_payout_date,current_date),btrim(p_payment_method),nullif(btrim(p_reference),''),auth.uid())
  returning id into v_payout_id;
  update public.merry_go_round_cycles set status='paid' where id=p_cycle_id;
  if not exists(select 1 from public.merry_go_round_cycles where round_id=v_round_id and status='open') then
    update public.merry_go_rounds set status='completed',updated_at=now() where id=v_round_id;
  end if;
  return v_payout_id;
end;
$$;

create or replace function public.apply_for_group_loan(
  p_group_id uuid, p_member_id uuid, p_amount numeric, p_purpose text, p_term_months integer
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_loan_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform public.cl_assert_group_module_enabled(p_group_id,'loans');
  if not exists(select 1 from public.members m where m.id=p_member_id and m.group_id=p_group_id
    and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and lower(coalesce(m.status,'active'))='active'
    and lower(coalesce(m.onboarding_status,'active'))='active') then
    raise exception 'You may only apply for a loan for your own active membership' using errcode='42501';
  end if;
  insert into public.group_loan_applications(group_id,member_id,requested_amount,purpose,requested_term_months)
  values(p_group_id,p_member_id,p_amount,btrim(p_purpose),p_term_months)
  returning id into v_loan_id;
  return v_loan_id;
end;
$$;

create or replace function public.decide_group_loan(
  p_loan_id uuid, p_decision text, p_approved_amount numeric default null,
  p_flat_interest_rate numeric default 0, p_term_months integer default null, p_note text default null
) returns boolean language plpgsql security definer set search_path=''
as $$
declare v_group_id uuid; v_requested numeric; v_requested_term integer;
begin
  select group_id,requested_amount,requested_term_months into v_group_id,v_requested,v_requested_term
  from public.group_loan_applications where id=p_loan_id for update;
  if v_group_id is null then raise exception 'Loan application not found' using errcode='P0002'; end if;
  perform public.cl_assert_group_module_enabled(v_group_id,'loans');
  if not public.cl_user_has_role(v_group_id,array['admin','chairperson','secretary','treasurer']::text[]) then raise exception 'Not authorized to decide loans' using errcode='42501'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected' using errcode='22023'; end if;
  if not exists(select 1 from public.group_loan_applications where id=p_loan_id and status='pending') then raise exception 'Only pending applications can be decided' using errcode='55000'; end if;
  if p_decision='approved' then
    if p_approved_amount is null or p_approved_amount<=0 or p_approved_amount>v_requested then raise exception 'Approved amount must be positive and no greater than requested amount' using errcode='22023'; end if;
    if coalesce(p_flat_interest_rate,0)<0 or p_flat_interest_rate>100 then raise exception 'Flat interest rate must be between 0 and 100 percent' using errcode='22023'; end if;
    if coalesce(p_term_months,v_requested_term)<1 or coalesce(p_term_months,v_requested_term)>60 then raise exception 'Term must be between 1 and 60 months' using errcode='22023'; end if;
    update public.group_loan_applications set status='approved',approved_amount=p_approved_amount,flat_interest_rate=coalesce(p_flat_interest_rate,0),
      approved_term_months=coalesce(p_term_months,v_requested_term),decision_note=nullif(btrim(p_note),''),decided_by=auth.uid(),decided_at=now(),updated_at=now()
    where id=p_loan_id;
  else
    update public.group_loan_applications set status='rejected',decision_note=nullif(btrim(p_note),''),decided_by=auth.uid(),decided_at=now(),updated_at=now()
    where id=p_loan_id;
  end if;
  return true;
end;
$$;

create or replace function public.disburse_group_loan(
  p_loan_id uuid, p_disbursed_at date default current_date
) returns boolean language plpgsql security definer set search_path=''
as $$
declare v_group_id uuid;
begin
  select group_id into v_group_id from public.group_loan_applications where id=p_loan_id for update;
  if v_group_id is null then raise exception 'Loan not found' using errcode='P0002'; end if;
  perform public.cl_assert_group_module_enabled(v_group_id,'loans');
  if not public.cl_user_has_role(v_group_id,array['admin','chairperson','secretary','treasurer']::text[]) then raise exception 'Not authorized to disburse loans' using errcode='42501'; end if;
  update public.group_loan_applications set status='disbursed',disbursed_by=auth.uid(),disbursed_at=coalesce(p_disbursed_at,current_date)::timestamptz,updated_at=now()
  where id=p_loan_id and status='approved';
  if not found then raise exception 'Only approved loans can be disbursed' using errcode='55000'; end if;
  return true;
end;
$$;

create or replace function public.record_group_loan_repayment(
  p_loan_id uuid, p_amount numeric, p_payment_date date,
  p_payment_method text, p_reference text default null
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_group_id uuid; v_status text;
  v_approved numeric; v_rate numeric; v_repaid numeric; v_total_due numeric; v_repayment_id uuid;
begin
  select group_id,member_id,status,approved_amount,flat_interest_rate
  into v_group_id,v_member_id,v_status,v_approved,v_rate
  from public.group_loan_applications where id=p_loan_id for update;
  if v_group_id is null then raise exception 'Loan not found' using errcode='P0002'; end if;
  perform public.cl_assert_group_module_enabled(v_group_id,'loans');
  if not public.cl_user_has_role(v_group_id,array['admin','chairperson','secretary','treasurer']::text[]) then raise exception 'Only an authorized group officer can confirm a repayment' using errcode='42501'; end if;
  if v_status not in ('disbursed','closed') then raise exception 'Repayments are only accepted for disbursed loans' using errcode='55000'; end if;
  v_total_due := round(v_approved * (1 + coalesce(v_rate,0)/100),2);
  select coalesce(sum(amount),0) into v_repaid from public.group_loan_repayments where loan_id=p_loan_id;
  if p_amount<=0 or v_repaid+p_amount>v_total_due then raise exception 'Repayment exceeds the outstanding balance' using errcode='22023'; end if;
  insert into public.group_loan_repayments(loan_id,amount,payment_date,payment_method,reference,recorded_by)
  values(p_loan_id,p_amount,coalesce(p_payment_date,current_date),btrim(p_payment_method),nullif(btrim(p_reference),''),auth.uid())
  returning id into v_repayment_id;
  if v_repaid+p_amount=v_total_due then update public.group_loan_applications set status='closed',updated_at=now() where id=p_loan_id; end if;
  return v_repayment_id;
end;
$$;

create or replace function public.get_group_merry_go_rounds(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_result jsonb;
begin
  perform public.cl_assert_group_module_enabled(p_group_id,'merry_go_round');
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'name',r.name,'contribution_amount',r.contribution_amount,'frequency',r.frequency,'start_date',r.start_date,'status',r.status,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('member_id',rm.member_id,'member_name',m.name,'turn_number',rm.turn_number,'status',rm.status) order by rm.turn_number),'[]'::jsonb)
      from public.merry_go_round_members rm join public.members m on m.id=rm.member_id where rm.round_id=r.id),
    'cycles',(select coalesce(jsonb_agg(jsonb_build_object('id',cy.id,'cycle_number',cy.cycle_number,'recipient_member_id',cy.recipient_member_id,'recipient_name',mm.name,'scheduled_date',cy.scheduled_date,'status',cy.status,
       'payments',(select coalesce(jsonb_agg(jsonb_build_object('member_id',p.member_id,'member_name',pm.name,'amount',p.amount,'payment_date',p.payment_date,'method',p.payment_method,'reference',p.reference)),'[]'::jsonb)
        from public.merry_go_round_payments p join public.members pm on pm.id=p.member_id where p.cycle_id=cy.id),
       'payout',(select jsonb_build_object('amount',po.amount,'payout_date',po.payout_date,'method',po.payment_method,'reference',po.reference) from public.merry_go_round_payouts po where po.cycle_id=cy.id)
      ) order by cy.cycle_number),'[]'::jsonb) from public.merry_go_round_cycles cy join public.members mm on mm.id=cy.recipient_member_id where cy.round_id=r.id)
  ) order by r.created_at desc),'[]'::jsonb) into v_result
  from public.merry_go_rounds r where r.group_id=p_group_id;
  return v_result;
end;
$$;

create or replace function public.get_group_loans(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_result jsonb; v_is_manager boolean; v_member_id uuid;
begin
  perform public.cl_assert_group_module_enabled(p_group_id,'loans');
  v_is_manager := public.cl_user_has_role(p_group_id,array['admin','chairperson','secretary','treasurer']::text[]);
  select m.id into v_member_id from public.members m where m.group_id=p_group_id
    and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'member_id',l.member_id,'member_name',m.name,'requested_amount',l.requested_amount,'purpose',l.purpose,
    'requested_term_months',l.requested_term_months,'status',l.status,'approved_amount',l.approved_amount,
    'flat_interest_rate',l.flat_interest_rate,'approved_term_months',l.approved_term_months,'decision_note',l.decision_note,
    'applied_at',l.applied_at,'decided_at',l.decided_at,'disbursed_at',l.disbursed_at,
    'total_due',case when l.approved_amount is null then null else round(l.approved_amount*(1+coalesce(l.flat_interest_rate,0)/100),2) end,
    'total_repaid',(select coalesce(sum(rp.amount),0) from public.group_loan_repayments rp where rp.loan_id=l.id),
    'repayments',(select coalesce(jsonb_agg(jsonb_build_object('id',rp.id,'amount',rp.amount,'payment_date',rp.payment_date,'method',rp.payment_method,'reference',rp.reference) order by rp.payment_date),'[]'::jsonb) from public.group_loan_repayments rp where rp.loan_id=l.id)
  ) order by l.applied_at desc),'[]'::jsonb) into v_result
  from public.group_loan_applications l join public.members m on m.id=l.member_id
  where l.group_id=p_group_id and (v_is_manager or l.member_id=v_member_id);
  return v_result;
end;
$$;

revoke all on function public.create_merry_go_round(uuid,text,numeric,text,date,uuid[]) from public,anon;
revoke all on function public.activate_merry_go_round(uuid) from public,anon;
revoke all on function public.record_merry_go_round_payment(uuid,uuid,numeric,date,text,text) from public,anon;
revoke all on function public.record_merry_go_round_payout(uuid,date,text,text) from public,anon;
revoke all on function public.apply_for_group_loan(uuid,uuid,numeric,text,integer) from public,anon;
revoke all on function public.decide_group_loan(uuid,text,numeric,numeric,integer,text) from public,anon;
revoke all on function public.disburse_group_loan(uuid,date) from public,anon;
revoke all on function public.record_group_loan_repayment(uuid,numeric,date,text,text) from public,anon;
revoke all on function public.get_group_merry_go_rounds(uuid) from public,anon;
revoke all on function public.get_group_loans(uuid) from public,anon;
grant execute on function public.create_merry_go_round(uuid,text,numeric,text,date,uuid[]) to authenticated;
grant execute on function public.activate_merry_go_round(uuid) to authenticated;
grant execute on function public.record_merry_go_round_payment(uuid,uuid,numeric,date,text,text) to authenticated;
grant execute on function public.record_merry_go_round_payout(uuid,date,text,text) to authenticated;
grant execute on function public.apply_for_group_loan(uuid,uuid,numeric,text,integer) to authenticated;
grant execute on function public.decide_group_loan(uuid,text,numeric,numeric,integer,text) to authenticated;
grant execute on function public.disburse_group_loan(uuid,date) to authenticated;
grant execute on function public.record_group_loan_repayment(uuid,numeric,date,text,text) to authenticated;
grant execute on function public.get_group_merry_go_rounds(uuid) to authenticated;
grant execute on function public.get_group_loans(uuid) to authenticated;

comment on table public.merry_go_rounds is 'Rotating member payout plans; payouts are recorded manually and are not bank/mobile-money transfers.';
comment on table public.group_loan_applications is 'Group loan lifecycle: application, officer decision, disbursement record and repayments. Repayment schedule uses a flat interest percentage.';
comment on table public.group_loan_repayments is 'Append-only loan repayment receipts confirmed by an authorized group officer.';

commit;
