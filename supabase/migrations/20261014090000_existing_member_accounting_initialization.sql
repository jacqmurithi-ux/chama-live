-- CHAMA LIVE: two-official initialization of existing members' Monthly accounting.
-- Source migration only. Do not apply to production until the candidate gate passes.
-- Historical payments are never synthesized from "paid through": only existing
-- canonical contribution rows are reconciled, preventing invented/double-counted money.

begin;

create table if not exists private.member_accounting_initialization_requests (
  request_id uuid primary key,
  group_id uuid not null references public.groups(id),
  member_id uuid not null references public.members(id),
  requested_by_member_id uuid not null references public.members(id),
  monthly_amount numeric(14,2) not null check (monthly_amount > 0),
  effective_from date not null,
  paid_through date,
  payment_method text,
  payload_hash text not null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  approved_by_member_id uuid references public.members(id),
  approved_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now(),
);

create table if not exists private.member_accounting_initialization_audit (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  group_id uuid not null,
  member_id uuid not null,
  actor_member_id uuid not null,
  action text not null check (action in ('requested','approved','rejected')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

revoke all on private.member_accounting_initialization_requests from public, anon, authenticated;
revoke all on private.member_accounting_initialization_audit from public, anon, authenticated;
revoke update, delete, truncate on private.member_accounting_initialization_audit from public, anon, authenticated;

create or replace function public.preview_member_accounting_initialization(
  p_member_id uuid,
  p_monthly_amount numeric,
  p_effective_from date,
  p_paid_through date default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_group_id uuid;
  v_actor_member_id uuid;
  v_months integer;
  v_existing_rule_count integer;
  v_due_estimate numeric(14,2);
  v_paid numeric(14,2);
  v_cumulative_contributions numeric(14,2);
  v_arrears numeric(14,2);
  v_credit numeric(14,2);
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_member_id is null or p_monthly_amount is null or p_monthly_amount <= 0
     or p_effective_from is null then
    raise exception 'Member, positive monthly amount and effective start date are required' using errcode='22023';
  end if;
  if p_paid_through is not null and p_paid_through > current_date then
    raise exception 'Paid through cannot be in the future' using errcode='22023';
  end if;
  if p_paid_through is not null and p_paid_through < p_effective_from then
    raise exception 'Paid through cannot precede the Monthly start date' using errcode='22023';
  end if;

  select m.group_id into strict v_group_id
  from public.members m where m.id = p_member_id;

  if not public.can_manage_members(v_group_id) then
    raise exception 'Member-management authorization required' using errcode='42501';
  end if;

  select m.id into v_actor_member_id
  from public.members m
  where m.group_id = v_group_id
    and (m.auth_user_id = v_actor or m.user_id = v_actor)
    and lower(coalesce(m.status,'active')) = 'active'
    and lower(coalesce(m.onboarding_status,'active')) = 'active'
  order by m.id limit 1;
  if v_actor_member_id is null then
    raise exception 'Active official membership required' using errcode='42501';
  end if;

  select count(*) into v_existing_rule_count
  from public.member_contribution_rules r
  join public.contribution_types ct on ct.id = r.contribution_type_id
  where r.group_id = v_group_id and r.member_id = p_member_id
    and (ct.code = 'monthly' or lower(trim(ct.name)) = 'monthly');
  if v_existing_rule_count > 0 then
    raise exception 'Member already has a Monthly rule; initialization is not applicable';
  end if;

  v_months := (
    (extract(year from age(date_trunc('month', current_date), date_trunc('month', p_effective_from)))::integer * 12)
    + extract(month from age(date_trunc('month', current_date), date_trunc('month', p_effective_from)))::integer
    + 1
  );
  v_months := greatest(v_months, 0);
  v_due_estimate := v_months * p_monthly_amount;

  select coalesce(sum(c.amount),0)::numeric(14,2)
  into v_paid
  from public.contributions c
  where c.group_id = v_group_id and c.member_id = p_member_id
    and lower(trim(coalesce(c.contribution_type,''))) = 'monthly'
    and c.contribution_date >= p_effective_from
    and c.contribution_date <= coalesce(p_paid_through, current_date)
    and c.amount > 0;

  select coalesce(sum(c.amount),0)::numeric(14,2)
  into v_cumulative_contributions
  from public.contributions c
  where c.group_id=v_group_id and c.member_id=p_member_id;

  v_arrears := greatest(v_due_estimate - v_paid, 0);
  v_credit := greatest(v_paid - v_due_estimate, 0);

  return jsonb_build_object(
    'member_id', p_member_id,
    'group_id', v_group_id,
    'monthly_amount', p_monthly_amount,
    'effective_from', p_effective_from,
    'paid_through', p_paid_through,
    'estimated_months', v_months,
    'estimated_due', v_due_estimate,
    'recorded_monthly_payments_in_range', v_paid,
    'cumulative_recorded_contributions', v_cumulative_contributions,
    'estimated_arrears', v_arrears,
    'estimated_credit', v_credit,
    'estimate_only', true,
    'note', 'Preview is an estimate from the proposed monthly amount and recorded payment rows. Final position is calculated by canonical accounting after approval.'
  );
end;
$function$;

create or replace function public.request_member_accounting_initialization(
  p_request_id uuid,
  p_member_id uuid,
  p_monthly_amount numeric,
  p_effective_from date,
  p_paid_through date default null,
  p_payment_method text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_preview jsonb;
  v_group_id uuid;
  v_actor uuid := auth.uid();
  v_actor_member_id uuid;
  v_hash text;
  v_existing private.member_accounting_initialization_requests%rowtype;
begin
  if p_request_id is null then raise exception 'Request id is required' using errcode='22023'; end if;
  v_preview := public.preview_member_accounting_initialization(
    p_member_id, p_monthly_amount, p_effective_from, p_paid_through
  );
  v_group_id := (v_preview->>'group_id')::uuid;

  if p_paid_through is not null and coalesce(p_payment_method,'') not in ('M-Pesa','Cash','Bank transfer') then
    raise exception 'Select a valid payment method for historical reconciliation' using errcode='22023';
  end if;
  v_hash := pg_catalog.md5(jsonb_build_object(
    'member_id',p_member_id,'monthly_amount',p_monthly_amount,
    'effective_from',p_effective_from,'paid_through',p_paid_through,
    'payment_method',p_payment_method
  )::text);

  select m.id into v_actor_member_id
  from public.members m
  where m.group_id = v_group_id
    and (m.auth_user_id = v_actor or m.user_id = v_actor)
    and lower(coalesce(m.status,'active')) = 'active'
    and lower(coalesce(m.onboarding_status,'active')) = 'active'
  order by m.id limit 1;

  insert into private.member_accounting_initialization_requests(
    request_id,group_id,member_id,requested_by_member_id,monthly_amount,
    effective_from,paid_through,payment_method,payload_hash
  ) values (
    p_request_id,v_group_id,p_member_id,v_actor_member_id,p_monthly_amount,
    p_effective_from,p_paid_through,p_payment_method,v_hash
  ) on conflict (request_id) do nothing;

  select * into strict v_existing
  from private.member_accounting_initialization_requests
  where request_id = p_request_id for update;

  if v_existing.payload_hash <> v_hash then
    raise exception 'IDEMPOTENCY_CONFLICT: request id reused with different inputs';
  end if;

  if v_existing.status = 'approved' then
    return jsonb_build_object('success',true,'idempotent_replay',true,'request_id',p_request_id,'status',v_existing.status,'result',v_existing.result);
  end if;

  if v_existing.requested_by_member_id <> v_actor_member_id then
    raise exception 'Request id belongs to a different requester' using errcode='42501';
  end if;

  insert into private.member_accounting_initialization_audit(
    request_id,group_id,member_id,actor_member_id,action,details
  ) values (p_request_id,v_group_id,p_member_id,v_actor_member_id,'requested',v_preview)
  on conflict do nothing;

  return jsonb_build_object('success',true,'request_id',p_request_id,'status',v_existing.status,'preview',v_preview,
    'message','Pending approval by a different authorized group official.');
end;
$function$;

create or replace function public.approve_member_accounting_initialization(
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request private.member_accounting_initialization_requests%rowtype;
  v_actor uuid := auth.uid();
  v_approver_member_id uuid;
  v_monthly_type_id uuid;
  v_result jsonb;
  v_reconcile record;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into strict v_request
  from private.member_accounting_initialization_requests
  where request_id = p_request_id for update;

  if v_request.status = 'approved' then
    return jsonb_build_object('success',true,'idempotent_replay',true,'request_id',p_request_id,'result',v_request.result);
  end if;
  if v_request.status <> 'pending' then raise exception 'Request is not pending approval'; end if;

  select m.id into v_approver_member_id
  from public.members m
  where m.group_id = v_request.group_id
    and (m.auth_user_id = v_actor or m.user_id = v_actor)
    and lower(coalesce(m.status,'active')) = 'active'
    and lower(coalesce(m.onboarding_status,'active')) = 'active'
  order by m.id limit 1;

  if v_approver_member_id is null or not public.can_manage_members(v_request.group_id) then
    raise exception 'Authorized group official required' using errcode='42501';
  end if;
  if v_approver_member_id = v_request.requested_by_member_id then
    raise exception 'A different group official must approve this request' using errcode='42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chama-live:member-accounting-init:'||v_request.group_id::text||':'||v_request.member_id::text,0)
  );

  if not exists (select 1 from public.members m where m.id=v_request.member_id and m.group_id=v_request.group_id) then
    raise exception 'Member does not belong to the request group';
  end if;

  if exists (
    select 1 from public.member_contribution_rules r
    join public.contribution_types ct on ct.id=r.contribution_type_id
    where r.group_id=v_request.group_id and r.member_id=v_request.member_id
      and (ct.code='monthly' or lower(trim(ct.name))='monthly')
  ) then
    raise exception 'Member already has a Monthly rule; no changes were applied';
  end if;

  select ct.id into strict v_monthly_type_id
  from public.contribution_types ct
  where ct.group_id=v_request.group_id and (ct.code='monthly' or lower(trim(ct.name))='monthly')
  order by case when ct.code='monthly' then 0 else 1 end, ct.created_at, ct.id
  limit 1;

  insert into public.member_contribution_rules(
    group_id,member_id,contribution_type_id,amount,frequency,effective_from,
    effective_to,first_period_rule,status,created_by
  ) values (
    v_request.group_id,v_request.member_id,v_monthly_type_id,v_request.monthly_amount,
    'monthly',v_request.effective_from,null,'full_period','active',v_approver_member_id
  );

  perform public.cl_2b_refresh_member(v_request.member_id,date_trunc('month',current_date)::date);

  if v_request.paid_through is not null then
    select * into v_reconcile
    from public.reconcile_member_historical_payments(v_request.member_id,v_request.paid_through);
  end if;

  select row_to_json(p)::jsonb into v_result
  from public.get_member_contribution_position(v_request.member_id) p;

  update private.member_accounting_initialization_requests
  set status='approved',approved_by_member_id=v_approver_member_id,
      approved_at=now(),result=coalesce(v_result,'{}'::jsonb)
  where request_id=p_request_id;

  insert into private.member_accounting_initialization_audit(
    request_id,group_id,member_id,actor_member_id,action,details
  ) values (
    p_request_id,v_request.group_id,v_request.member_id,v_approver_member_id,'approved',
    jsonb_build_object('effective_from',v_request.effective_from,'monthly_amount',v_request.monthly_amount,
      'paid_through',v_request.paid_through,'position',coalesce(v_result,'{}'::jsonb))
  );

  return jsonb_build_object('success',true,'request_id',p_request_id,'status','approved','position',v_result);
end;
$function$;

create or replace function public.list_member_accounting_initialization_requests(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_group_id uuid;
  v_rows jsonb;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  v_group_id := p_group_id;
  if v_group_id is null or not public.can_manage_members(v_group_id) then
    raise exception 'Member-management authorization required' using errcode='42501';
  end if;
  if not exists (select 1 from public.members m where m.group_id=v_group_id
    and (m.auth_user_id=v_actor or m.user_id=v_actor)
    and lower(coalesce(m.status,'active'))='active'
    and lower(coalesce(m.onboarding_status,'active'))='active') then
    raise exception 'Active membership in the requested group required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'request_id',r.request_id,'member_id',r.member_id,'member_name',m.name,
    'member_number',m.member_number,'requested_by_member_id',r.requested_by_member_id,
    'requested_by_name',requester.name,'monthly_amount',r.monthly_amount,
    'effective_from',r.effective_from,'paid_through',r.paid_through,
    'payment_method',r.payment_method,'created_at',r.created_at
  ) order by r.created_at), '[]'::jsonb)
  into v_rows
  from private.member_accounting_initialization_requests r
  join public.members m on m.id=r.member_id and m.group_id=r.group_id
  join public.members requester on requester.id=r.requested_by_member_id
  where r.group_id=v_group_id and r.status='pending';
  return v_rows;
end;
$function$;

revoke all on function public.preview_member_accounting_initialization(uuid,numeric,date,date) from public, anon;
revoke all on function public.request_member_accounting_initialization(uuid,uuid,numeric,date,date,text) from public, anon;
revoke all on function public.approve_member_accounting_initialization(uuid) from public, anon;\nrevoke all on function public.list_member_accounting_initialization_requests(uuid) from public, anon;
grant execute on function public.preview_member_accounting_initialization(uuid,numeric,date,date) to authenticated;
grant execute on function public.request_member_accounting_initialization(uuid,uuid,numeric,date,date,text) to authenticated;
grant execute on function public.approve_member_accounting_initialization(uuid) to authenticated;\ngrant execute on function public.list_member_accounting_initialization_requests(uuid) to authenticated;

commit;
