-- CHAMA LIVE — First-class custom contributions candidate
-- Candidate only. Do not apply to production without the explicit production gate.

create schema if not exists private;

create table if not exists private.custom_contribution_activation_requests (
  request_id uuid primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  contribution_type_id uuid not null,
  period_id uuid not null,
  payload_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists private.custom_contribution_payment_requests (
  request_id uuid not null,
  operation text not null default 'record',
  group_id uuid not null,
  member_id uuid not null,
  contribution_type_id uuid not null,
  payload_hash text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (request_id, operation)
);

create or replace function public.activate_custom_contribution(
  p_group_id uuid,
  p_period_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_actor_member_id uuid;
  v_period public.contribution_periods%rowtype;
  v_obligation_count integer := 0;
  v_result jsonb;
  v_payload jsonb;
  v_hash text;
  v_existing_hash text;
  v_existing_result jsonb;
begin
  if v_auth_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;

  if p_group_id is null or p_period_id is null or p_request_id is null then
    raise exception 'GROUP_PERIOD_AND_REQUEST_ID_REQUIRED' using errcode='22023';
  end if;

  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.owner_user_id = v_auth_user_id
  ) and not public.cl_user_has_role(
    p_group_id, array['chairperson']::text[]
  ) then
    raise exception 'CUSTOM_CONTRIBUTION_NOT_AUTHORIZED' using errcode='42501';
  end if;

  select m.id into v_actor_member_id
  from public.members m
  where m.group_id = p_group_id
    and (m.user_id = v_auth_user_id or m.auth_user_id = v_auth_user_id)
    and lower(coalesce(m.status,'active')) = 'active'
    and lower(coalesce(m.onboarding_status,'active')) = 'active'
  order by m.id
  limit 1;

  if v_actor_member_id is null then
    raise exception 'ACTIVE_GROUP_MEMBER_REQUIRED' using errcode='42501';
  end if;

  select * into v_period
  from public.contribution_periods
  where id = p_period_id and group_id = p_group_id
  for update;

  if not found then
    raise exception 'CUSTOM_CONTRIBUTION_PERIOD_NOT_FOUND' using errcode='22023';
  end if;

  if v_period.contribution_type_id is null then
    raise exception 'CUSTOM_CONTRIBUTION_TYPE_REQUIRED' using errcode='22023';
  end if;

  if v_period.status not in ('draft','open') then
    raise exception 'CUSTOM_CONTRIBUTION_PERIOD_NOT_ACTIVATABLE' using errcode='22023';
  end if;

  v_payload := jsonb_build_object(
    'group_id', p_group_id,
    'period_id', p_period_id,
    'contribution_type_id', v_period.contribution_type_id
  );
  v_hash := encode(
    extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      'chama-live:custom-contribution-request:' ||
      p_request_id::text || ':activate', 0
    )
  );

  select r.payload_hash, r.result
  into v_existing_hash, v_existing_result
  from private.custom_contribution_activation_requests r
  where r.request_id = p_request_id
  for update;

  if v_existing_hash is not null then
    if v_existing_hash <> v_hash then
      raise exception 'REQUEST_ID_REUSE_MISMATCH' using errcode='22023';
    end if;
    if v_existing_result is null then
      raise exception 'REQUEST_ALREADY_CLAIMED_WITHOUT_RESULT' using errcode='55000';
    end if;
    return jsonb_set(
      v_existing_result, '{replayed}', 'true'::jsonb, true
    );
  end if;

  insert into private.custom_contribution_activation_requests(
    request_id, group_id, contribution_type_id, period_id, payload_hash
  )
  values (
    p_request_id, p_group_id, v_period.contribution_type_id,
    v_period.id, v_hash
  );

  perform public.cl_2b_accounting_lock_range(
    p_group_id,
    date_trunc('month',v_period.opening_date)::date,
    date_trunc('month',v_period.closing_date)::date
  );

  insert into public.member_contribution_rules(
    group_id, member_id, contribution_type_id, amount, frequency,
    effective_from, effective_to, first_period_rule, status, created_by
  )
  select
    m.group_id, m.id, v_period.contribution_type_id, v_period.amount,
    v_period.frequency, v_period.opening_date, v_period.closing_date,
    'full_period', 'active', v_actor_member_id
  from public.members m
  where m.group_id = p_group_id
    and lower(coalesce(m.status,'active')) = 'active'
    and lower(coalesce(m.onboarding_status,'active')) = 'active'
    and not exists (
      select 1
      from public.member_contribution_rules r
      where r.group_id = m.group_id
        and r.member_id = m.id
        and r.contribution_type_id = v_period.contribution_type_id
        and r.effective_from = v_period.opening_date
        and r.effective_to = v_period.closing_date
    );

  insert into public.contribution_obligations(
    group_id, member_id, contribution_type_id, rule_id,
    obligation_month, due_amount, period_id, economic_month
  )
  select
    r.group_id, r.member_id, r.contribution_type_id, r.id,
    v_period.due_date, r.amount, v_period.id, v_period.due_date
  from public.member_contribution_rules r
  where r.group_id = p_group_id
    and r.contribution_type_id = v_period.contribution_type_id
    and r.effective_from = v_period.opening_date
    and r.effective_to = v_period.closing_date
    and r.status = 'active'
    and not exists (
      select 1
      from public.contribution_obligations o
      where o.group_id = r.group_id
        and o.member_id = r.member_id
        and o.contribution_type_id = r.contribution_type_id
        and o.obligation_month = v_period.due_date
        and o.component_kind = 'PARENT'
    );

  get diagnostics v_obligation_count = row_count;

  update public.contribution_periods
  set status = 'open'
  where id = v_period.id and group_id = p_group_id;

  v_result := jsonb_build_object(
    'ok', true,
    'operation', 'activate',
    'replayed', false,
    'contribution_type_id', v_period.contribution_type_id,
    'period_id', v_period.id,
    'status', 'open',
    'ongoing', true,
    'obligations_created', v_obligation_count
  );

  update private.custom_contribution_activation_requests
  set result = v_result, completed_at = now()
  where request_id = p_request_id;

  return v_result;
end;
$function$;

create or replace function public.get_group_active_contributions(
  p_group_id uuid
) returns table(
  contribution_type_id uuid,
  contribution_name text,
  contribution_code text,
  period_id uuid,
  frequency text,
  period_key text,
  opening_date date,
  due_date date,
  closing_date date,
  amount numeric,
  description text,
  fine_rule_id uuid,
  fine_enabled boolean,
  grace_period_value integer,
  fine_amount numeric,
  status text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    ct.id, ct.name, ct.code, cp.id, cp.frequency, cp.period_key,
    cp.opening_date, cp.due_date, cp.closing_date, cp.amount,
    cp.description, cp.fine_rule_id, (cp.fine_rule_id is not null),
    fr.grace_period_value, fr.fixed_amount, cp.status
  from public.contribution_periods cp
  join public.contribution_types ct
    on ct.id = cp.contribution_type_id
   and ct.group_id = cp.group_id
  left join public.fine_rules fr on fr.id = cp.fine_rule_id
  where cp.group_id = p_group_id
    and cp.status in ('open','due','grace')
    and exists (
      select 1 from public.members viewer
      where viewer.group_id = p_group_id
        and (viewer.user_id = auth.uid() or viewer.auth_user_id = auth.uid())
        and lower(coalesce(viewer.status,'active')) = 'active'
        and lower(coalesce(viewer.onboarding_status,'active')) = 'active'
    )
  order by cp.opening_date desc, cp.created_at desc, cp.id;
$function$;

create or replace function public.get_member_active_contributions(
  p_group_id uuid,
  p_member_id uuid
) returns table(
  contribution_type_id uuid,
  contribution_name text,
  contribution_code text,
  period_id uuid,
  frequency text,
  opening_date date,
  due_date date,
  closing_date date,
  amount_due numeric,
  amount_allocated numeric,
  outstanding_balance numeric,
  status text,
  description text,
  fine_rule_id uuid,
  fine_enabled boolean,
  grace_period_value integer,
  fine_amount numeric
)
language sql
stable
security definer
set search_path to ''
as $function$
  with active_periods as (
    select cp.id, cp.group_id, cp.contribution_type_id, cp.frequency,
           cp.opening_date, cp.due_date, cp.closing_date,
           cp.description, cp.fine_rule_id, cp.created_at
    from public.contribution_periods cp
    where cp.group_id = p_group_id
      and cp.status in ('open','due','grace')
  ),
  obligation_totals as (
    select o.period_id, o.contribution_type_id,
           coalesce(sum(o.due_amount),0)::numeric as amount_due
    from public.contribution_obligations o
    join active_periods ap on ap.id = o.period_id
    where o.group_id = p_group_id
      and o.member_id = p_member_id
      and o.component_kind = 'PARENT'
      and o.lifecycle_state = 'ACTIVE'
    group by o.period_id, o.contribution_type_id
  ),
  allocation_totals as (
    select o.period_id, o.contribution_type_id,
           coalesce(sum(a.amount),0)::numeric as amount_allocated
    from public.contribution_obligations o
    join active_periods ap on ap.id = o.period_id
    join public.contribution_allocations a on a.obligation_id = o.id
    where o.group_id = p_group_id
      and o.member_id = p_member_id
      and o.component_kind = 'PARENT'
      and o.lifecycle_state = 'ACTIVE'
    group by o.period_id, o.contribution_type_id
  )
  select
    ct.id, ct.name, ct.code, ap.id, ap.frequency,
    ap.opening_date, ap.due_date, ap.closing_date,
    coalesce(ot.amount_due,0),
    coalesce(at.amount_allocated,0),
    greatest(
      coalesce(ot.amount_due,0) - coalesce(at.amount_allocated,0), 0
    ),
    case
      when greatest(
        coalesce(ot.amount_due,0) - coalesce(at.amount_allocated,0), 0
      ) = 0 then 'PAID'
      else 'OUTSTANDING'
    end,
    ap.description, ap.fine_rule_id, (ap.fine_rule_id is not null),
    fr.grace_period_value, fr.fixed_amount
  from active_periods ap
  join public.contribution_types ct
    on ct.id = ap.contribution_type_id
   and ct.group_id = ap.group_id
  left join obligation_totals ot
    on ot.period_id = ap.id
   and ot.contribution_type_id = ap.contribution_type_id
  left join allocation_totals at
    on at.period_id = ap.id
   and at.contribution_type_id = ap.contribution_type_id
  left join public.fine_rules fr on fr.id = ap.fine_rule_id
  where exists (
    select 1 from public.members target
    where target.id = p_member_id
      and target.group_id = p_group_id
      and lower(coalesce(target.status,'active')) = 'active'
  )
  and exists (
    select 1 from public.members viewer
    where viewer.group_id = p_group_id
      and (viewer.user_id = auth.uid() or viewer.auth_user_id = auth.uid())
      and lower(coalesce(viewer.status,'active')) = 'active'
      and lower(coalesce(viewer.onboarding_status,'active')) = 'active'
      and (
        viewer.id = p_member_id
        or lower(coalesce(viewer.role,'member')) =
           any(array['admin','chairperson','treasurer','secretary']::text[])
      )
  )
  order by ap.opening_date desc, ap.created_at desc, ap.id;
$function$;

create or replace function public.record_custom_contribution_payment(
  p_group_id uuid,
  p_member_id uuid,
  p_contribution_type_id uuid,
  p_amount numeric,
  p_contribution_date date,
  p_payment_method text,
  p_reference text,
  p_notes text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_actor_member_id uuid;
  v_type_name text;
  v_start date;
  v_end date;
  v_obligation record;
  v_remaining numeric := p_amount;
  v_allocated numeric := 0;
  v_due numeric;
  v_paid numeric;
  v_apply numeric;
  v_payload jsonb;
  v_hash text;
  v_existing_hash text;
  v_existing_result jsonb;
  v_payment_id uuid := p_request_id;
begin
  if v_auth_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;

  if p_group_id is null or p_member_id is null
     or p_contribution_type_id is null or p_request_id is null then
    raise exception 'REQUIRED_PAYMENT_FIELDS_MISSING' using errcode='22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'PAYMENT_AMOUNT_MUST_BE_POSITIVE' using errcode='22023';
  end if;

  if p_contribution_date is null then
    raise exception 'CONTRIBUTION_DATE_REQUIRED' using errcode='22023';
  end if;

  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.owner_user_id = v_auth_user_id
  ) and not public.cl_user_has_role(
    p_group_id, array['chairperson','treasurer','secretary']::text[]
  ) then
    raise exception 'CUSTOM_PAYMENT_NOT_AUTHORIZED' using errcode='42501';
  end if;

  select m.id into v_actor_member_id
  from public.members m
  where m.group_id = p_group_id
    and (m.user_id = v_auth_user_id or m.auth_user_id = v_auth_user_id)
    and lower(coalesce(m.status,'active')) = 'active'
    and lower(coalesce(m.onboarding_status,'active')) = 'active'
  order by m.id
  limit 1;

  if v_actor_member_id is null then
    raise exception 'ACTIVE_GROUP_MEMBER_REQUIRED' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.members m
    where m.id = p_member_id
      and m.group_id = p_group_id
      and lower(coalesce(m.status,'active')) = 'active'
  ) then
    raise exception 'MEMBER_NOT_IN_GROUP' using errcode='22023';
  end if;

  select ct.name into v_type_name
  from public.contribution_types ct
  where ct.id = p_contribution_type_id
    and ct.group_id = p_group_id;

  if v_type_name is null then
    raise exception 'CONTRIBUTION_TYPE_NOT_FOUND' using errcode='22023';
  end if;

  v_payload := jsonb_build_object(
    'group_id',p_group_id,'member_id',p_member_id,
    'contribution_type_id',p_contribution_type_id,'amount',p_amount,
    'contribution_date',p_contribution_date,
    'payment_method',coalesce(p_payment_method,''),
    'reference',coalesce(p_reference,''),
    'notes',coalesce(p_notes,'')
  );
  v_hash := encode(
    extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended('chama-live:custom-payment:'||p_request_id::text,0)
  );

  select payload_hash,result
  into v_existing_hash,v_existing_result
  from private.custom_contribution_payment_requests
  where request_id = p_request_id and operation = 'record'
  for update;

  if v_existing_hash is not null then
    if v_existing_hash <> v_hash then
      raise exception 'REQUEST_ID_REUSE_MISMATCH' using errcode='22023';
    end if;
    if v_existing_result is null then
      raise exception 'REQUEST_ALREADY_CLAIMED_WITHOUT_RESULT' using errcode='55000';
    end if;
    return jsonb_set(
      v_existing_result,'{replayed}','true'::jsonb,true
    );
  end if;

  select min(cp.opening_date), max(cp.closing_date)
  into v_start,v_end
  from public.contribution_periods cp
  where cp.group_id = p_group_id
    and cp.contribution_type_id = p_contribution_type_id
    and cp.status in ('open','due','grace','closed')
    and cp.opening_date <= p_contribution_date
    and cp.due_date <= p_contribution_date;

  if v_start is null then
    raise exception 'NO_ELIGIBLE_CUSTOM_CONTRIBUTION_PERIOD' using errcode='22023';
  end if;

  perform public.cl_2b_accounting_lock_range(
    p_group_id,
    date_trunc('month',v_start)::date,
    date_trunc('month',greatest(v_end,p_contribution_date))::date
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:'||p_group_id::text||':'||p_member_id::text,0
    )
  );

  insert into private.custom_contribution_payment_requests(
    request_id,operation,group_id,member_id,contribution_type_id,payload_hash
  )
  values(
    p_request_id,'record',p_group_id,p_member_id,p_contribution_type_id,v_hash
  );

  insert into public.contributions(
    id,group_id,member_id,amount,contribution_type,month,
    payment_method,reference,recorded_by,goal_id,contribution_date,
    notes,mpesa_reference
  )
  values(
    v_payment_id,p_group_id,p_member_id,p_amount,v_type_name,
    to_char(p_contribution_date,'YYYY-MM'),coalesce(p_payment_method,'Cash'),
    nullif(trim(p_reference),''),v_actor_member_id,null,p_contribution_date,
    nullif(trim(p_notes),''),
    case when lower(coalesce(p_payment_method,''))='m-pesa'
      then nullif(trim(p_reference),'') else null end
  );

  for v_obligation in
    select o.id,o.due_amount,o.obligation_month
    from public.contribution_obligations o
    join public.contribution_periods cp on cp.id=o.period_id
    where o.group_id=p_group_id
      and o.member_id=p_member_id
      and o.contribution_type_id=p_contribution_type_id
      and o.component_kind='PARENT'
      and o.lifecycle_state='ACTIVE'
      and cp.status in ('open','due','grace','closed')
      and cp.due_date <= p_contribution_date
    order by o.obligation_month asc,o.id asc
    for update
  loop
    exit when v_remaining <= 0;

    select coalesce(sum(a.amount),0)
    into v_paid
    from public.contribution_allocations a
    where a.obligation_id=v_obligation.id;

    v_due := greatest(v_obligation.due_amount-v_paid,0);
    if v_due <= 0 then
      continue;
    end if;

    v_apply := least(v_remaining,v_due);

    insert into public.contribution_allocations(
      payment_id,obligation_id,amount
    ) values(v_payment_id,v_obligation.id,v_apply);

    v_remaining := v_remaining-v_apply;
    v_allocated := v_allocated+v_apply;
  end loop;

  if v_allocated > p_amount then
    raise exception 'PAYMENT_OVER_ALLOCATION_DETECTED';
  end if;

  v_existing_result := jsonb_build_object(
    'ok',true,'replayed',false,'payment_id',v_payment_id,
    'contribution_type_id',p_contribution_type_id,'amount',p_amount,
    'allocated_amount',v_allocated,
    'unapplied_amount',greatest(v_remaining,0)
  );

  update private.custom_contribution_payment_requests
  set result=v_existing_result,completed_at=now()
  where request_id=p_request_id and operation='record';

  return v_existing_result;
end;
$function$;

revoke all on function public.activate_custom_contribution(uuid,uuid,uuid) from public;
grant execute on function public.activate_custom_contribution(uuid,uuid,uuid) to authenticated;
revoke all on function public.get_group_active_contributions(uuid) from public;
grant execute on function public.get_group_active_contributions(uuid) to authenticated;
revoke all on function public.get_member_active_contributions(uuid,uuid) from public;
grant execute on function public.get_member_active_contributions(uuid,uuid) to authenticated;
revoke all on function public.record_custom_contribution_payment(uuid,uuid,uuid,numeric,date,text,text,text,uuid) from public;
grant execute on function public.record_custom_contribution_payment(uuid,uuid,uuid,numeric,date,text,text,text,uuid) to authenticated;
