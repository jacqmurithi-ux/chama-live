-- STAGE ONLY: production function definitions; ordinal rows 111-120 of 201.
-- Captured read-only on 2026-10-14. Alphabetical order is NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects require separate reconciliation.

CREATE OR REPLACE FUNCTION public.financial_charges_guard_obligation_contract()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_obligation public.contribution_obligations%rowtype;
    v_expected_month text;
BEGIN
    SELECT co.*
      INTO v_obligation
    FROM public.contribution_obligations co
    WHERE co.id = NEW.obligation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contribution obligation % does not exist', NEW.obligation_id;
    END IF;

    v_expected_month := pg_catalog.to_char(v_obligation.obligation_month, 'YYYY-MM');

    IF NEW.accounting_month IS DISTINCT FROM v_expected_month THEN
        RAISE EXCEPTION 'Charge accounting month % does not match obligation month %',
            NEW.accounting_month, v_expected_month;
    END IF;

    IF NEW.group_id IS DISTINCT FROM v_obligation.group_id
       OR NEW.member_id IS DISTINCT FROM v_obligation.member_id
    THEN
        RAISE EXCEPTION 'Charge group/member does not match obligation';
    END IF;

    IF NEW.source = 'automatic'
       AND NEW.amount IS DISTINCT FROM v_obligation.due_amount
    THEN
        RAISE EXCEPTION
            'Automatic charge amount % does not match obligation due_amount %',
            NEW.amount, v_obligation.due_amount;
    END IF;

    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.financial_charges_guard_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_applied numeric(14,2);
BEGIN
    SELECT COALESCE(SUM(cp.amount_applied), 0)::numeric(14,2)
      INTO v_applied
    FROM public.charge_payments cp
    WHERE cp.charge_id = NEW.id
      AND cp.status = 'applied';

    IF NEW.status = 'paid' AND v_applied <> NEW.amount THEN
        RAISE EXCEPTION 'Paid charge % must have allocations equal to charge amount', NEW.id;
    END IF;

    IF NEW.status = 'open' AND v_applied >= NEW.amount THEN
        RAISE EXCEPTION 'Open charge % cannot have allocations equal to or above charge amount', NEW.id;
    END IF;

    IF NEW.status = 'cancelled' AND v_applied <> 0 THEN
        RAISE EXCEPTION 'Cancelled charge % cannot have applied payments', NEW.id;
    END IF;

    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.financial_charges_normalize_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    NEW.charge_type := lower(pg_catalog.btrim(NEW.charge_type));
    IF NEW.charge_type = '' THEN
        RAISE EXCEPTION 'Charge type is required';
    END IF;
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.financial_charges_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.generate_group_access_code(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  prefix text;
  candidate text;
  attempt int := 0;
begin
  -- First two letters of the group name, uppercased, falling back to "CL"
  -- (Chama Live) if the name has no usable letters.
  prefix := upper(left(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z]', '', 'g'), 2));
  if length(prefix) < 2 then
    prefix := 'CL';
  end if;

  loop
    candidate := prefix || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from groups where access_code = candidate);
    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'Could not generate a unique access code';
    end if;
  end loop;

  return candidate;
end;
$function$


CREATE OR REPLACE FUNCTION public.generate_member_number(p_group_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_num integer;
begin
  if p_group_id is null then raise exception 'Group is required'; end if;
  select coalesce(max(nullif(regexp_replace(member_number,'[^0-9]','','g'),'')::integer),0)+1 into v_num
  from public.members where group_id=p_group_id and member_number ~ '^[0-9]+$';
  return lpad(v_num::text,4,'0');
end; $function$


CREATE OR REPLACE FUNCTION public.generate_next_custom_contribution_period(p_group_id uuid, p_contribution_type_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auth uuid := auth.uid();
  v_actor uuid;
  v_source public.contribution_periods%rowtype;
  v_next_open date;
  v_next_due date;
  v_next_close date;
  v_period_id uuid;
  v_period_key text;
  v_result jsonb;
  v_existing jsonb;
  v_frequency text;
  v_step interval;
  v_close_span integer;
  v_due_span integer;
begin
  if v_auth is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.groups g where g.id=p_group_id and g.owner_user_id=v_auth)
     and not public.cl_user_has_role(p_group_id,array['chairperson']::text[])
  then raise exception 'CUSTOM_CONTRIBUTION_NOT_AUTHORIZED' using errcode='42501'; end if;

  select m.id into v_actor
  from public.members m
  where m.group_id=p_group_id
    and (m.user_id=v_auth or m.auth_user_id=v_auth)
    and lower(coalesce(m.status,'active'))='active'
    and lower(coalesce(m.onboarding_status,'active'))='active'
  order by m.id limit 1;
  if v_actor is null then raise exception 'ACTIVE_GROUP_MEMBER_REQUIRED' using errcode='42501'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'chama-live:custom-next-period:'||p_request_id::text,0));

  select result into v_existing
  from private.custom_contribution_period_requests
  where request_id=p_request_id
  for update;
  if v_existing is not null then
    return jsonb_set(v_existing,'{replayed}','true'::jsonb,true);
  end if;

  select * into v_source
  from public.contribution_periods
  where group_id=p_group_id
    and contribution_type_id=p_contribution_type_id
    and status in ('open','due','grace','closed')
  order by closing_date desc,created_at desc,id desc
  limit 1
  for update;

  if not found then raise exception 'SOURCE_CUSTOM_CONTRIBUTION_PERIOD_NOT_FOUND' using errcode='22023'; end if;

  v_frequency:=lower(v_source.frequency);
  if v_frequency='weekly' then v_step:=interval '7 days';
  elsif v_frequency='monthly' then v_step:=interval '1 month';
  elsif v_frequency='quarterly' then v_step:=interval '3 months';
  elsif v_frequency='annual' then v_step:=interval '1 year';
  else raise exception 'NON_RECURRING_CUSTOM_CONTRIBUTION' using errcode='22023';
  end if;

  v_close_span:=v_source.closing_date-v_source.opening_date;
  v_due_span:=v_source.due_date-v_source.opening_date;
  v_next_open:=v_source.opening_date+v_step;
  v_next_due:=v_next_open+v_due_span;
  v_next_close:=v_next_open+v_close_span;

  if exists(
    select 1 from public.contribution_periods cp
    where cp.group_id=p_group_id
      and cp.contribution_type_id=p_contribution_type_id
      and cp.opening_date=v_next_open
      and cp.due_date=v_next_due
      and cp.closing_date=v_next_close
  ) then
    select jsonb_build_object(
      'ok',true,'operation','generate_next','replayed',false,
      'existing',true,'contribution_type_id',p_contribution_type_id,
      'period_id',cp.id,'status',cp.status
    ) into v_result
    from public.contribution_periods cp
    where cp.group_id=p_group_id and cp.contribution_type_id=p_contribution_type_id
      and cp.opening_date=v_next_open and cp.due_date=v_next_due
      and cp.closing_date=v_next_close
    limit 1;
    insert into private.custom_contribution_period_requests(request_id,group_id,contribution_type_id,source_period_id,result,completed_at)
    values(p_request_id,p_group_id,p_contribution_type_id,v_source.id,v_result,now());
    return v_result;
  end if;

  v_period_key:='custom:v1:'||p_contribution_type_id::text||':'||
    to_char(v_next_open,'YYYY-MM-DD')||':'||to_char(v_next_due,'YYYY-MM-DD')||':'||
    to_char(v_next_close,'YYYY-MM-DD');

  insert into public.contribution_periods(
    group_id,contribution_type_id,frequency,period_key,opening_date,closing_date,
    due_date,status,created_by,name,description,amount,fine_rule_id
  ) values(
    p_group_id,p_contribution_type_id,v_source.frequency,v_period_key,v_next_open,
    v_next_close,v_next_due,'open',v_actor,v_source.name,v_source.description,
    v_source.amount,v_source.fine_rule_id
  ) returning id into v_period_id;

  perform public.cl_2b_accounting_lock_range(
    p_group_id,date_trunc('month',v_next_open)::date,date_trunc('month',v_next_close)::date);

  insert into public.member_contribution_rules(
    group_id,member_id,contribution_type_id,amount,frequency,effective_from,effective_to,
    first_period_rule,status,created_by
  )
  select m.group_id,m.id,p_contribution_type_id,v_source.amount,v_source.frequency,
         v_next_open,v_next_close,'full_period','active',v_actor
  from public.members m
  where m.group_id=p_group_id
    and lower(coalesce(m.status,'active'))='active'
    and lower(coalesce(m.onboarding_status,'active'))='active'
    and not exists(
      select 1 from public.member_contribution_rules r
      where r.group_id=m.group_id and r.member_id=m.id
        and r.contribution_type_id=p_contribution_type_id
        and r.effective_from=v_next_open and r.effective_to=v_next_close);

  insert into public.contribution_obligations(
    group_id,member_id,contribution_type_id,rule_id,obligation_month,due_amount,
    period_id,economic_month
  )
  select r.group_id,r.member_id,r.contribution_type_id,r.id,
         date_trunc('month',v_next_due)::date,r.amount,
         v_period_id,v_next_due
  from public.member_contribution_rules r
  where r.group_id=p_group_id and r.contribution_type_id=p_contribution_type_id
    and r.effective_from=v_next_open and r.effective_to=v_next_close
    and r.status='active'
    and not exists(
      select 1 from public.contribution_obligations o
      where o.group_id=r.group_id and o.member_id=r.member_id
        and o.contribution_type_id=r.contribution_type_id
        and o.obligation_month=date_trunc('month',v_next_due)::date
        and o.component_kind='PARENT');

  v_result:=jsonb_build_object(
    'ok',true,'operation','generate_next','replayed',false,
    'existing',false,'contribution_type_id',p_contribution_type_id,
    'source_period_id',v_source.id,'period_id',v_period_id,'status','open',
    'opening_date',v_next_open,'due_date',v_next_due,'closing_date',v_next_close);

  insert into private.custom_contribution_period_requests(
    request_id,group_id,contribution_type_id,source_period_id,result,completed_at)
  values(p_request_id,p_group_id,p_contribution_type_id,v_source.id,v_result,now());

  return v_result;
end;
$function$


CREATE OR REPLACE FUNCTION public.generate_other_contribution_fines(p_cycle_id uuid, p_request_id uuid, p_triggered_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid:=auth.uid(); v_cycle public.contribution_periods%ROWTYPE;
  v_rule public.fine_rules%ROWTYPE;
  v_request private.other_contribution_cycle_requests%ROWTYPE;
  v_payload_hash text; v_fine_eligible_at timestamptz;
  v_obligation record; v_existing_fine uuid; v_fine_id uuid;
  v_generated_count bigint:=0; v_existing_count bigint:=0; v_skipped_settled bigint:=0;
  v_base numeric(14,2); v_amount numeric(14,2); v_allocated numeric(14,2);
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_cycle_id IS NULL OR p_request_id IS NULL OR p_triggered_at IS NULL THEN
    RAISE EXCEPTION 'Cycle id, request id and trigger time are required';
  END IF;
  PERFORM private.cl_other_request_lock(p_request_id,'generate_fine');
  v_payload_hash:=md5(jsonb_build_object('cycle_id',p_cycle_id,'triggered_at',p_triggered_at)::text);
  SELECT * INTO v_request FROM private.other_contribution_cycle_requests r
  WHERE r.request_id=p_request_id AND r.operation='generate_fine';
  IF FOUND THEN
    IF v_request.payload_hash<>v_payload_hash THEN
      RAISE EXCEPTION 'Fine-generation request was previously used with another payload';
    END IF;
    IF v_request.completed_at IS NOT NULL AND v_request.result IS NOT NULL THEN
      RETURN v_request.result||jsonb_build_object('idempotent_replay',true);
    END IF;
  END IF;
  SELECT cp.* INTO v_cycle FROM public.contribution_periods cp WHERE cp.id=p_cycle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Other contribution cycle not found'; END IF;
  PERFORM private.cl_other_cycle_authorize(v_cycle.group_id);
  PERFORM private.cl_other_cycle_lock(v_cycle.group_id,v_cycle.contribution_type_id);
  SELECT cp.* INTO v_cycle FROM public.contribution_periods cp WHERE cp.id=p_cycle_id FOR UPDATE;
  IF v_cycle.status NOT IN ('open','due','grace','closed') THEN
    RAISE EXCEPTION 'Cycle status % cannot generate fines',v_cycle.status;
  END IF;
  IF v_cycle.fine_rule_id IS NULL THEN RAISE EXCEPTION 'Cycle has no fine rule'; END IF;
  SELECT r.* INTO v_rule FROM public.fine_rules r
  WHERE r.id=v_cycle.fine_rule_id AND r.group_id=v_cycle.group_id
    AND r.trigger_type='missed_contribution'
    AND r.applicability_mode IN ('ALL','SELECTED');
  IF NOT FOUND THEN RAISE EXCEPTION 'Configured Other fine rule is unavailable'; END IF;
  IF v_rule.applicability_mode='SELECTED'
     AND NOT EXISTS(SELECT 1 FROM public.fine_rule_contribution_types rt
                    WHERE rt.rule_id=v_rule.id
                      AND rt.contribution_type_id=v_cycle.contribution_type_id) THEN
    RAISE EXCEPTION 'Configured fine rule is not applicable to this contribution type';
  END IF;
  v_fine_eligible_at:=((v_cycle.closing_date+1)::timestamp AT TIME ZONE 'Africa/Nairobi')+
    CASE v_rule.grace_period_unit
      WHEN 'DAY' THEN make_interval(days=>v_rule.grace_period_value)
      WHEN 'WEEK' THEN make_interval(days=>v_rule.grace_period_value*7)
      WHEN 'MONTH' THEN make_interval(months=>v_rule.grace_period_value)
    END;
  IF p_triggered_at<v_fine_eligible_at THEN
    RAISE EXCEPTION 'Cycle has not crossed closing plus grace boundary';
  END IF;

  -- LOCK ORDER #4: all canonical Other obligations, then the fine-rule row.
  PERFORM 1
  FROM public.contribution_obligations o
  WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
    AND o.contribution_type_id=v_cycle.contribution_type_id
    AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL
  ORDER BY o.member_id,o.id FOR UPDATE;

  -- Re-lock/re-read the referenced rule after obligation locks.
  SELECT r.* INTO v_rule FROM public.fine_rules r
  WHERE r.id=v_cycle.fine_rule_id AND r.group_id=v_cycle.group_id
    AND r.trigger_type='missed_contribution'
    AND r.applicability_mode IN ('ALL','SELECTED') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Configured Other fine rule disappeared'; END IF;
  IF v_rule.applicability_mode='SELECTED'
     AND NOT EXISTS(SELECT 1 FROM public.fine_rule_contribution_types rt
                    WHERE rt.rule_id=v_rule.id
                      AND rt.contribution_type_id=v_cycle.contribution_type_id) THEN
    RAISE EXCEPTION 'Configured fine rule is not applicable to this contribution type';
  END IF;
  v_fine_eligible_at:=((v_cycle.closing_date+1)::timestamp AT TIME ZONE 'Africa/Nairobi')+
    CASE v_rule.grace_period_unit
      WHEN 'DAY' THEN make_interval(days=>v_rule.grace_period_value)
      WHEN 'WEEK' THEN make_interval(days=>v_rule.grace_period_value*7)
      WHEN 'MONTH' THEN make_interval(months=>v_rule.grace_period_value)
    END;
  IF p_triggered_at<v_fine_eligible_at THEN
    RAISE EXCEPTION 'Cycle has not crossed closing plus grace boundary';
  END IF;

  FOR v_obligation IN
    SELECT
      o.id,o.group_id,o.member_id,o.contribution_type_id,o.due_amount,
      o.obligation_month,o.period_id,
      greatest(
        round(o.due_amount,2) -
        round(coalesce((SELECT sum(a.amount)
                        FROM public.contribution_allocations a
                        WHERE a.obligation_id=o.id),0),2),
        0
      ) AS outstanding_principal
    FROM public.contribution_obligations o
    WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
      AND o.contribution_type_id=v_cycle.contribution_type_id
      AND o.rule_id IS NULL
      AND o.lifecycle_state='ACTIVE'
      AND (
        (o.component_kind='PARENT' AND o.parent_obligation_id IS NULL)
        OR
        (o.component_kind='RESIDUAL' AND o.parent_obligation_id IS NOT NULL)
      )
    ORDER BY o.member_id,o.id FOR UPDATE
  LOOP
    -- A decomposed Other parent is no longer the active canonical charge.
    -- The active residual carries the remaining principal; only ACTIVE
    -- Active Other parent/residual charge components are fine candidates.
    v_base:=v_obligation.outstanding_principal;
    IF v_base<=0 THEN v_skipped_settled:=v_skipped_settled+1; CONTINUE; END IF;

    SELECT f.id INTO v_existing_fine FROM public.fines f
    WHERE f.group_id=v_cycle.group_id AND f.member_id=v_obligation.member_id
      AND f.rule_id=v_rule.id AND f.trigger_type='missed_contribution'
      AND f.trigger_id=v_obligation.id FOR UPDATE;
    IF v_existing_fine IS NOT NULL THEN v_existing_count:=v_existing_count+1; CONTINUE; END IF;

    IF v_rule.calculation_method='FIXED' THEN
      v_amount:=round(v_rule.fixed_amount,2);
    ELSE
      v_amount:=round(v_base*v_rule.percentage_rate/100,2);
    END IF;
    IF v_rule.minimum_amount IS NOT NULL THEN
      v_amount:=greatest(v_amount,round(v_rule.minimum_amount,2));
    END IF;
    IF v_rule.maximum_amount IS NOT NULL THEN
      v_amount:=least(v_amount,round(v_rule.maximum_amount,2));
    END IF;
    IF v_amount<=0 THEN RAISE EXCEPTION 'Calculated fine amount must be positive'; END IF;

    -- No ON CONFLICT DO NOTHING: the fine identity was explicitly checked
    -- under the obligation lock; an unexpected unique collision aborts.
    INSERT INTO public.fines(
      group_id,member_id,rule_id,trigger_type,trigger_id,accounting_month,
      original_amount,calculation_method,calculation_base,percentage_rate,
      fixed_amount,minimum_amount,maximum_amount,calculated_amount,
      resolved_closing_at,triggered_at)
    VALUES(v_cycle.group_id,v_obligation.member_id,v_rule.id,'missed_contribution',
           v_obligation.id,to_char(v_cycle.opening_date,'YYYY-MM'),v_amount,
           v_rule.calculation_method,v_base,v_rule.percentage_rate,v_rule.fixed_amount,
           v_rule.minimum_amount,v_rule.maximum_amount,v_amount,
           ((v_cycle.closing_date+1)::timestamp AT TIME ZONE 'Africa/Nairobi'),p_triggered_at)
    RETURNING id INTO v_fine_id;
    v_generated_count:=v_generated_count+1;
  END LOOP;

  INSERT INTO private.other_contribution_cycle_requests(
    request_id,operation,cycle_id,group_id,payload_hash,result,completed_at)
  VALUES(p_request_id,'generate_fine',v_cycle.id,v_cycle.group_id,v_payload_hash,
         jsonb_build_object('ok',true,'cycle_id',v_cycle.id,
                            'generated_count',v_generated_count,'existing_count',v_existing_count,
                            'settled_skipped',v_skipped_settled,
                            'fine_eligible_at',v_fine_eligible_at,'idempotent_replay',false),now())
  ON CONFLICT(request_id,operation) DO UPDATE
    SET cycle_id=EXCLUDED.cycle_id,group_id=EXCLUDED.group_id,
        payload_hash=EXCLUDED.payload_hash,result=EXCLUDED.result,
        completed_at=EXCLUDED.completed_at;
  INSERT INTO private.other_contribution_cycle_audit(
    cycle_id,group_id,action,actor_user_id,request_id,request_operation,details)
  VALUES(v_cycle.id,v_cycle.group_id,'CYCLE_FINE_GENERATION',v_actor,p_request_id,'generate_fine',
         jsonb_build_object('generated_count',v_generated_count,'existing_count',v_existing_count,
                            'settled_skipped',v_skipped_settled,'fine_rule_id',v_rule.id,
                            'fine_eligible_at',v_fine_eligible_at,'triggered_at',p_triggered_at));
  RETURN jsonb_build_object('ok',true,'cycle_id',v_cycle.id,
                            'generated_count',v_generated_count,'existing_count',v_existing_count,
                            'settled_skipped',v_skipped_settled,
                            'fine_eligible_at',v_fine_eligible_at,'idempotent_replay',false);
END $function$


CREATE OR REPLACE FUNCTION public.get_canonical_member_monthly_status(p_group_id uuid, p_month text)
 RETURNS TABLE(member_id uuid, member_number text, member_name text, monthly_due numeric, previous_outstanding numeric, previous_credit numeric, current_month_payment numeric, applied_this_month numeric, carry_forward numeric, current_outstanding numeric, total_paid_to_date numeric, total_due_to_date numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_month date;
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    if not public.cl_user_in_group(p_group_id) then
        raise exception 'You do not have access to this group';
    end if;
    if p_month is null or p_month !~ '^[0-9]{4}-[0-9]{2}$' then
        raise exception 'Month must use YYYY-MM format';
    end if;
    v_month := (p_month || '-01')::date;

    return query
    with member_set as (
        select m.id, m.member_number::text, m.name
        from public.members m
        where m.group_id = p_group_id
          and lower(coalesce(m.status, 'active')) = 'active'
          and (m.join_date is null or date_trunc('month', m.join_date)::date <= v_month)
    ),
    obligations as (
        select o.member_id, o.obligation_month, o.due_amount::numeric as due_amount
        from public.contribution_obligations o
        where o.group_id = p_group_id
          and o.obligation_month <= v_month
          and o.rule_id is not null
    ),
    obligation_totals as (
        select o.member_id,
               coalesce(sum(o.due_amount) filter (where o.obligation_month = v_month), 0)::numeric as monthly_due,
               coalesce(sum(o.due_amount) filter (where o.obligation_month < v_month), 0)::numeric as prior_due,
               coalesce(sum(o.due_amount), 0)::numeric as total_due
        from obligations o group by o.member_id
    ),
    payments as (
        select c.id, c.member_id, c.amount::numeric as amount, c.contribution_date
        from public.contributions c
        where c.group_id = p_group_id
          and lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
          and c.contribution_date is not null
          and c.contribution_date < (v_month + interval '1 month')::date
    ),
    payment_totals as (
        select p.member_id,
               coalesce(sum(p.amount) filter (
                   where p.contribution_date >= v_month
                     and p.contribution_date < (v_month + interval '1 month')::date
               ), 0)::numeric as current_month_payment,
               coalesce(sum(p.amount), 0)::numeric as total_paid
        from payments p group by p.member_id
    ),
    allocation_totals as (
        select o.member_id,
               coalesce(sum(ca.amount) filter (where o.obligation_month < v_month), 0)::numeric as prior_allocated,
               coalesce(sum(ca.amount) filter (where o.obligation_month = v_month), 0)::numeric as current_allocated,
               coalesce(sum(ca.amount), 0)::numeric as total_allocated
        from public.contribution_allocations ca
        join public.contribution_obligations o on o.id = ca.obligation_id
        where o.group_id = p_group_id and o.obligation_month <= v_month
        group by o.member_id
    )
    select
        ms.id,
        ms.member_number,
        ms.name,
        coalesce(ot.monthly_due, 0)::numeric,
        greatest(coalesce(ot.prior_due, 0) - coalesce(at.prior_allocated, 0), 0)::numeric,
        greatest(coalesce(at.prior_allocated, 0) - coalesce(ot.prior_due, 0), 0)::numeric,
        coalesce(pt.current_month_payment, 0)::numeric,
        coalesce(at.current_allocated, 0)::numeric,
        greatest(coalesce(pt.total_paid, 0) - coalesce(at.total_allocated, 0), 0)::numeric,
        greatest(coalesce(ot.monthly_due, 0) - coalesce(at.current_allocated, 0), 0)::numeric,
        coalesce(pt.total_paid, 0)::numeric,
        coalesce(ot.total_due, 0)::numeric,
        case
            when greatest(coalesce(ot.monthly_due, 0) - coalesce(at.current_allocated, 0), 0) = 0
             and greatest(coalesce(pt.total_paid, 0) - coalesce(at.total_allocated, 0), 0) > 0 then 'credit'
            when greatest(coalesce(ot.monthly_due, 0) - coalesce(at.current_allocated, 0), 0) = 0 then 'paid'
            when coalesce(at.current_allocated, 0) > 0 then 'partial'
            else 'outstanding'
        end::text
    from member_set ms
    left join obligation_totals ot on ot.member_id = ms.id
    left join payment_totals pt on pt.member_id = ms.id
    left join allocation_totals at on at.member_id = ms.id
    order by ms.name;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_canonical_monthly_accounting_summary(p_group_id uuid, p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare
    v_expected numeric := 0;
    v_collected numeric := 0;
    v_applied numeric := 0;
    v_credit numeric := 0;
    v_outstanding numeric := 0;

    v_active integer := 0;
    v_paid integer := 0;
    v_partial integer := 0;
    v_unpaid integer := 0;

    v_collection_rate numeric := 0;

begin

    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;


    if not public.cl_user_in_group(p_group_id) then
        raise exception
            'You do not have access to this group';
    end if;


    select

        count(*)::integer,

        coalesce(
            sum(s.monthly_due),
            0
        ),

        coalesce(
            sum(s.current_month_payment),
            0
        ),

        coalesce(
            sum(s.applied_this_month),
            0
        ),

        coalesce(
            sum(s.carry_forward),
            0
        ),

        coalesce(
            sum(s.current_outstanding),
            0
        ),

        count(*) filter (
            where s.status in (
                'paid',
                'credit'
            )
        )::integer,

        count(*) filter (
            where s.status = 'partial'
        )::integer,

        count(*) filter (
            where s.status = 'outstanding'
        )::integer

    into

        v_active,
        v_expected,
        v_collected,
        v_applied,
        v_credit,
        v_outstanding,
        v_paid,
        v_partial,
        v_unpaid

    from public.get_canonical_member_monthly_status(
        p_group_id,
        p_month
    ) s;


    if v_expected > 0 then

        v_collection_rate :=
            least(
                (
                    v_applied /
                    v_expected
                ) * 100,
                100
            );

    end if;


    return jsonb_build_object(

        'month',
        p_month,

        'active_members',
        v_active,

        'expected_monthly_contributions',
        v_expected,

        'total_contributions_collected',
        v_collected,

        'applied_this_month',
        v_applied,

        'carry_forward',
        v_credit,

        'current_outstanding',
        v_outstanding,

        'members_paid',
        v_paid,

        'partial_payments',
        v_partial,

        'outstanding_members',
        v_unpaid,

        'collection_rate',
        round(
            v_collection_rate,
            2
        )
    );

end;
$function$
