-- STAGE ONLY: bundled function source definitions, production catalog captured 2026-10-14.
-- Alphabetical inventory order, not dependency order. Install after tables and before views/triggers.
-- This file is a source bundle, not an executable final migration by itself.

-- STAGE ONLY: production function definitions; ordinal rows 101-110 of 201.
-- Captured read-only on 2026-10-14. Alphabetical order is NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects require separate reconciliation.

CREATE OR REPLACE FUNCTION public.create_member_with_historical_contributions(p_member jsonb, p_contribution_plan jsonb, p_historical jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_auth_uid uuid;
  v_creator_member_id uuid;
  v_group_id uuid;
  v_member_id uuid;
  v_member_number text;
  v_membership_number text;
  v_name text;
  v_phone text;
  v_email text;
  v_national_id text;
  v_role text;
  v_status text;
  v_onboarding_status text;
  v_join_date date;
  v_actual_position text;
  v_actual_position_name text;
  v_actual_position_effective_from date;
  v_plan_count integer;
  v_contribution_type_id uuid;
  v_monthly_amount numeric(14,2);
  v_frequency text;
  v_effective_from date;
  v_effective_to date;
  v_first_period_rule text;
  v_rule_status text;
  v_historical_enabled boolean;
  v_historical_amount numeric(14,2);
  v_paid_through date;
  v_payment_method text;
  v_first_historical_month date;
  v_historical_last_month date;
  v_current_month date;
  v_payment_date date;
  v_payment_id uuid;
  v_historical_payment_count integer := 0;
  v_closed_month text;
  v_payload_hash text;
  v_existing_payload_hash text;
  v_existing_result jsonb;
  v_obligations_created integer := 0;
  v_total_due numeric := 0;
  v_total_allocated numeric := 0;
  v_arrears numeric := 0;
  v_credit numeric := 0;
  v_result jsonb;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request idempotency key is required'; END IF;
  IF p_member IS NULL OR jsonb_typeof(p_member) <> 'object' THEN RAISE EXCEPTION 'Member payload must be a JSON object'; END IF;
  IF p_contribution_plan IS NULL OR jsonb_typeof(p_contribution_plan) <> 'array' THEN RAISE EXCEPTION 'Contribution plan must be a JSON array'; END IF;
  IF p_historical IS NULL OR jsonb_typeof(p_historical) <> 'object' THEN RAISE EXCEPTION 'Historical payload must be a JSON object'; END IF;

  v_payload_hash := pg_catalog.md5(jsonb_build_object('member', p_member, 'contribution_plan', p_contribution_plan, 'historical', p_historical)::text);

  INSERT INTO private.member_historical_onboarding_requests (request_id, payload_hash)
  VALUES (p_request_id, v_payload_hash)
  ON CONFLICT (request_id) DO NOTHING;

  SELECT r.payload_hash, r.result
  INTO v_existing_payload_hash, v_existing_result
  FROM private.member_historical_onboarding_requests r
  WHERE r.request_id = p_request_id
  FOR UPDATE;

  IF v_existing_payload_hash IS DISTINCT FROM v_payload_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;

  IF v_existing_result IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'request_id', p_request_id, 'result', v_existing_result);
  END IF;

  SELECT m.id, m.group_id
  INTO v_creator_member_id, v_group_id
  FROM public.members m
  WHERE (m.user_id = v_auth_uid OR m.auth_user_id = v_auth_uid)
    AND lower(coalesce(m.status, '')) = 'active'
    AND lower(coalesce(m.onboarding_status, '')) = 'active'
  ORDER BY m.id
  LIMIT 1;

  IF v_creator_member_id IS NULL OR v_group_id IS NULL THEN RAISE EXCEPTION 'Active group membership is required'; END IF;
  IF NOT public.can_add_group_members(v_group_id) THEN RAISE EXCEPTION 'Member-management authorization required'; END IF;

  v_member_number := nullif(trim(p_member->>'member_number'), '');
  v_membership_number := nullif(trim(p_member->>'membership_number'), '');
  v_name := nullif(trim(p_member->>'name'), '');
  v_phone := nullif(trim(p_member->>'phone'), '');
  v_email := nullif(trim(p_member->>'email'), '');
  v_national_id := nullif(trim(p_member->>'national_id'), '');
  v_role := coalesce(nullif(trim(p_member->>'role'), ''), 'member');
  v_status := coalesce(nullif(trim(p_member->>'status'), ''), 'active');
  v_onboarding_status := coalesce(nullif(trim(p_member->>'onboarding_status'), ''), 'pending');
  v_actual_position := lower(nullif(trim(p_member->>'actual_position'), ''));
  v_actual_position_name := nullif(trim(p_member->>'actual_position_name'), '');
  IF v_actual_position IS NOT NULL AND v_actual_position NOT IN ('chairperson','vice_chairperson','treasurer','secretary','vice_secretary','committee_member','member','other') THEN
    RAISE EXCEPTION 'ACTUAL_POSITION_INVALID' USING ERRCODE='22023';
  END IF;
  IF v_actual_position = 'other' AND v_actual_position_name IS NULL THEN
    RAISE EXCEPTION 'ACTUAL_POSITION_NAME_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF v_actual_position IS DISTINCT FROM 'other' THEN v_actual_position_name := NULL; END IF;
  IF nullif(trim(p_member->>'actual_position_effective_from'), '') IS NULL THEN
    v_actual_position_effective_from := v_join_date;
  ELSE
    BEGIN
      v_actual_position_effective_from := (p_member->>'actual_position_effective_from')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_INVALID' USING ERRCODE='22023';
    END;
  END IF;
  IF v_actual_position IS NOT NULL AND v_actual_position_effective_from < v_join_date THEN
    RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_BEFORE_JOIN_DATE' USING ERRCODE='22023';
  END IF;

  IF v_member_number IS NULL THEN RAISE EXCEPTION 'Member number is required'; END IF;
  IF v_membership_number IS NULL THEN RAISE EXCEPTION 'Membership number is required'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Member name is required'; END IF;
  IF v_phone IS NULL THEN RAISE EXCEPTION 'Member phone is required'; END IF;

  IF nullif(trim(p_member->>'join_date'), '') IS NULL THEN
    v_join_date := current_date;
  ELSE
    BEGIN
      v_join_date := (p_member->>'join_date')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Invalid join_date';
    END;
  END IF;

  v_plan_count := jsonb_array_length(p_contribution_plan);
  IF v_plan_count <> 1 THEN RAISE EXCEPTION 'Revision 3.2 requires exactly one Monthly contribution rule'; END IF;
  IF jsonb_typeof(p_contribution_plan->0) <> 'object' THEN RAISE EXCEPTION 'Contribution plan item must be a JSON object'; END IF;

  BEGIN
    v_contribution_type_id := nullif(trim(p_contribution_plan->0->>'contribution_type_id'), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid contribution_type_id';
  END;

  IF v_contribution_type_id IS NULL THEN RAISE EXCEPTION 'Contribution type is required'; END IF;

  BEGIN
    v_monthly_amount := (p_contribution_plan->0->>'amount')::numeric(14,2);
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid contribution amount';
  END;

  IF v_monthly_amount IS NULL OR v_monthly_amount <= 0 THEN RAISE EXCEPTION 'Monthly contribution amount must be greater than zero'; END IF;

  v_frequency := lower(trim(coalesce(p_contribution_plan->0->>'frequency', 'monthly')));
  IF v_frequency <> 'monthly' THEN RAISE EXCEPTION 'Revision 3.2 supports Monthly contributions only'; END IF;

  IF nullif(trim(p_contribution_plan->0->>'effective_from'), '') IS NULL THEN
    v_effective_from := v_join_date;
  ELSE
    BEGIN
      v_effective_from := (p_contribution_plan->0->>'effective_from')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Invalid contribution effective_from';
    END;
  END IF;

  IF nullif(trim(p_contribution_plan->0->>'effective_to'), '') IS NULL THEN
    v_effective_to := NULL;
  ELSE
    BEGIN
      v_effective_to := (p_contribution_plan->0->>'effective_to')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Invalid contribution effective_to';
    END;
  END IF;

  v_first_period_rule := lower(trim(coalesce(p_contribution_plan->0->>'first_period_rule', 'full_period')));
  IF v_first_period_rule NOT IN ('full_period', 'next_full_period') THEN RAISE EXCEPTION 'Invalid first_period_rule'; END IF;

  v_rule_status := lower(trim(coalesce(p_contribution_plan->0->>'status', 'active')));
  IF v_effective_from < v_join_date THEN RAISE EXCEPTION 'Contribution effective_from cannot precede join_date'; END IF;
  IF v_effective_to IS NOT NULL AND v_effective_to < v_effective_from THEN RAISE EXCEPTION 'Contribution effective_to cannot precede effective_from'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contribution_types ct
    WHERE ct.id = v_contribution_type_id
      AND ct.group_id = v_group_id
      AND (ct.code = 'monthly' OR lower(trim(ct.name)) = 'monthly')
  ) THEN
    RAISE EXCEPTION 'Canonical Monthly contribution type does not belong to the group';
  END IF;

  v_historical_enabled := coalesce((p_historical->>'enabled')::boolean, false);
  IF NOT v_historical_enabled THEN RAISE EXCEPTION 'Historical onboarding must be explicitly enabled'; END IF;

  BEGIN
    v_historical_amount := (p_historical->>'monthly_amount')::numeric(14,2);
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid historical monthly_amount';
  END;

  IF v_historical_amount IS NULL OR v_historical_amount <= 0 THEN RAISE EXCEPTION 'Historical monthly amount must be greater than zero'; END IF;
  IF v_historical_amount <> v_monthly_amount THEN RAISE EXCEPTION 'Historical monthly amount must equal current Monthly amount'; END IF;

  BEGIN
    v_paid_through := (p_historical->>'paid_through')::date;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid historical paid_through';
  END;

  IF v_paid_through IS NULL THEN RAISE EXCEPTION 'paid_through is required'; END IF;
  IF v_paid_through > current_date THEN RAISE EXCEPTION 'Historical paid_through cannot be in the future'; END IF;

  v_payment_method := trim(coalesce(p_historical->>'payment_method', ''));
  IF v_payment_method NOT IN ('M-Pesa', 'Cash', 'Bank transfer') THEN RAISE EXCEPTION 'Invalid historical payment method'; END IF;

  IF v_first_period_rule = 'next_full_period'
     AND date_trunc('month', v_effective_from)::date = date_trunc('month', v_join_date)::date THEN
    v_first_historical_month := (date_trunc('month', v_join_date) + interval '1 month')::date;
  ELSE
    v_first_historical_month := date_trunc('month', greatest(v_effective_from, v_join_date))::date;
  END IF;

  v_historical_last_month := date_trunc('month', v_paid_through)::date;
  IF v_historical_last_month < v_first_historical_month THEN RAISE EXCEPTION 'paid_through does not reach the first historical obligation month'; END IF;

  IF EXISTS (SELECT 1 FROM public.members m WHERE m.group_id = v_group_id AND m.member_number = v_member_number) THEN RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS'; END IF;
  IF EXISTS (SELECT 1 FROM public.members m WHERE m.group_id = v_group_id AND m.membership_number = v_membership_number) THEN RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS'; END IF;

  BEGIN
    INSERT INTO public.members (group_id, member_number, name, phone, role, join_date, status, email, membership_number, onboarding_status, auth_user_id, national_id)
    VALUES (v_group_id, v_member_number, v_name, v_phone, v_role, v_join_date, v_status, v_email, v_membership_number, v_onboarding_status, NULL, v_national_id)
    RETURNING id INTO v_member_id;
  EXCEPTION WHEN unique_violation THEN
    IF EXISTS (SELECT 1 FROM public.members m WHERE m.group_id = v_group_id AND m.member_number = v_member_number) THEN RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS'; END IF;
    IF EXISTS (SELECT 1 FROM public.members m WHERE m.group_id = v_group_id AND m.membership_number = v_membership_number) THEN RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS'; END IF;
    RAISE;
  END;

  IF v_actual_position IS NOT NULL THEN
    INSERT INTO public.member_position_history (
      group_id, member_id, actual_position, actual_position_name,
      effective_from, effective_to, recorded_by
    )
    VALUES (
      v_group_id, v_member_id, v_actual_position, v_actual_position_name,
      v_actual_position_effective_from, NULL, v_creator_member_id
    );
  END IF;

  PERFORM public.cl_2b_accounting_lock_range(v_group_id, v_first_historical_month, v_historical_last_month);

  SELECT fp.month INTO v_closed_month
  FROM public.financial_periods fp
  WHERE fp.group_id = v_group_id
    AND fp.month >= to_char(v_first_historical_month, 'YYYY-MM')
    AND fp.month <= to_char(v_historical_last_month, 'YYYY-MM')
    AND lower(coalesce(fp.status, 'open')) = 'closed'
  ORDER BY fp.month
  LIMIT 1;

  IF v_closed_month IS NOT NULL THEN
    RAISE EXCEPTION 'Financial month % is closed. Historical onboarding cannot modify it.', v_closed_month;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chama-live:member:' || v_group_id::text || ':' || v_member_id::text, 0));

  BEGIN
    INSERT INTO public.member_contribution_rules (group_id, member_id, contribution_type_id, amount, frequency, effective_from, effective_to, first_period_rule, status, created_by)
    VALUES (v_group_id, v_member_id, v_contribution_type_id, v_monthly_amount, 'monthly', v_effective_from, v_effective_to, v_first_period_rule, v_rule_status, v_creator_member_id);
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'CONTRIBUTION_RULE_OVERLAP';
  END;

  v_current_month := v_first_historical_month;

  WHILE v_current_month <= v_historical_last_month LOOP
    IF v_current_month = v_first_historical_month
       AND v_first_period_rule = 'full_period'
       AND date_trunc('month', v_join_date)::date = v_first_historical_month THEN
      v_payment_date := v_join_date;
    ELSE
      v_payment_date := v_current_month;
    END IF;

    v_payment_id := (pg_catalog.md5('chama-live:revision-3.2:historical:' || p_request_id::text || ':' || to_char(v_current_month, 'YYYY-MM')))::uuid;

    PERFORM public.cl_2b_record_contribution(
      v_payment_id, v_group_id, v_member_id, v_historical_amount, v_payment_date,
      'monthly', v_payment_method, NULL, NULL, NULL,
      'Revision 3.2 historical onboarding ' || to_char(v_current_month, 'YYYY-MM')
    );

    v_historical_payment_count := v_historical_payment_count + 1;
    v_current_month := (v_current_month + interval '1 month')::date;
  END LOOP;

  PERFORM public.cl_2b_refresh_member(v_member_id, v_historical_last_month);

  SELECT count(*)::integer, coalesce(sum(o.due_amount), 0)::numeric
  INTO v_obligations_created, v_total_due
  FROM public.contribution_obligations o
  WHERE o.group_id = v_group_id AND o.member_id = v_member_id AND o.contribution_type_id = v_contribution_type_id;

  SELECT coalesce(sum(a.amount), 0)::numeric
  INTO v_total_allocated
  FROM public.contribution_allocations a
  JOIN public.contribution_obligations o ON o.id = a.obligation_id
  WHERE o.group_id = v_group_id AND o.member_id = v_member_id AND o.contribution_type_id = v_contribution_type_id;

  v_arrears := greatest(v_total_due - v_total_allocated, 0);
  v_credit := greatest(v_total_allocated - v_total_due, 0);

  IF EXISTS (
    SELECT 1
    FROM public.contribution_allocations a
    JOIN public.contributions p ON p.id = a.payment_id
    JOIN public.contribution_obligations o ON o.id = a.obligation_id
    WHERE p.member_id = v_member_id
      AND (p.group_id <> o.group_id OR p.member_id <> o.member_id OR a.amount <= 0)
  ) THEN RAISE EXCEPTION 'Cross-member/group allocation detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT a.payment_id, sum(a.amount) AS allocated
      FROM public.contribution_allocations a
      JOIN public.contributions p ON p.id = a.payment_id
      WHERE p.member_id = v_member_id
      GROUP BY a.payment_id
    ) x
    JOIN public.contributions p ON p.id = x.payment_id
    WHERE x.allocated > p.amount
  ) THEN RAISE EXCEPTION 'Payment over-allocation detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT a.obligation_id, sum(a.amount) AS allocated
      FROM public.contribution_allocations a
      JOIN public.contribution_obligations o ON o.id = a.obligation_id
      WHERE o.member_id = v_member_id
      GROUP BY a.obligation_id
    ) x
    JOIN public.contribution_obligations o ON o.id = x.obligation_id
    WHERE x.allocated > o.due_amount
  ) THEN RAISE EXCEPTION 'Obligation over-allocation detected'; END IF;

  v_result := jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'request_id', p_request_id,
    'member_id', v_member_id,
    'group_id', v_group_id,
    'member_number', v_member_number,
    'membership_number', v_membership_number,
    'join_date', v_join_date,
    'contribution_type_id', v_contribution_type_id,
    'monthly_amount', v_monthly_amount,
    'first_period_rule', v_first_period_rule,
    'historical_enabled', true,
    'historical_paid_through', v_paid_through,
    'historical_first_month', v_first_historical_month,
    'historical_last_month', v_historical_last_month,
    'historical_payment_count', v_historical_payment_count,
    'result_scope', 'resulting_member_accounting_state',
    'obligations_created', v_obligations_created,
    'total_due', v_total_due,
    'total_allocated', v_total_allocated,
    'arrears', v_arrears,
    'credit', v_credit,
    'payment_method', v_payment_method
  );

  UPDATE private.member_historical_onboarding_requests
  SET result = v_result, completed_at = now()
  WHERE request_id = p_request_id;

  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_other_contribution_cycle(p_group_id uuid, p_contribution_type_id uuid, p_name text, p_description text, p_amount numeric, p_frequency text, p_period_key text, p_opening_date date, p_due_date date, p_closing_date date, p_fine_rule_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid:=auth.uid(); v_actor_member_id uuid;
  v_existing private.other_contribution_cycle_requests%ROWTYPE;
  v_payload_hash text; v_cycle_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request id is required'; END IF;
  PERFORM private.cl_other_request_lock(p_request_id,'create');
  v_actor_member_id:=private.cl_other_cycle_authorize(p_group_id);
  v_payload_hash:=md5(jsonb_build_object(
    'group_id',p_group_id,'contribution_type_id',p_contribution_type_id,
    'name',btrim(coalesce(p_name,'')),'description',p_description,'amount',p_amount,
    'frequency',lower(btrim(coalesce(p_frequency,''))),
    'period_key',btrim(coalesce(p_period_key,'')),
    'opening_date',p_opening_date,'due_date',p_due_date,
    'closing_date',p_closing_date,'fine_rule_id',p_fine_rule_id)::text);
  SELECT * INTO v_existing FROM private.other_contribution_cycle_requests r
  WHERE r.request_id=p_request_id AND r.operation='create';
  IF FOUND THEN
    IF v_existing.payload_hash<>v_payload_hash THEN
      RAISE EXCEPTION 'Request was previously used with a different payload';
    END IF;
    IF v_existing.completed_at IS NOT NULL AND v_existing.result IS NOT NULL THEN
      RETURN v_existing.result||jsonb_build_object('idempotent_replay',true);
    END IF;
  END IF;
  PERFORM private.cl_other_cycle_lock(p_group_id,p_contribution_type_id);
  IF p_name IS NULL OR btrim(p_name)='' THEN RAISE EXCEPTION 'Cycle name is required'; END IF;
  IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'Cycle amount must be greater than zero'; END IF;
  IF lower(coalesce(p_frequency,'')) NOT IN ('monthly','one_time') THEN
    RAISE EXCEPTION 'Cycle frequency must be monthly or one_time';
  END IF;
  IF p_period_key IS NULL OR btrim(p_period_key)='' OR length(btrim(p_period_key))>100 THEN
    RAISE EXCEPTION 'Valid period key is required';
  END IF;
  IF p_opening_date IS NULL OR p_due_date IS NULL OR p_closing_date IS NULL
     OR p_opening_date>p_due_date OR p_due_date>p_closing_date THEN
    RAISE EXCEPTION 'Dates must satisfy opening <= due <= closing';
  END IF;
  PERFORM private.cl_other_assert_type(p_group_id,p_contribution_type_id);
  PERFORM private.cl_other_assert_fine_rule(
    p_group_id,p_contribution_type_id,p_fine_rule_id,p_opening_date,p_closing_date);
  IF EXISTS (SELECT 1 FROM public.contribution_periods cp
             WHERE cp.group_id=p_group_id AND cp.contribution_type_id=p_contribution_type_id
               AND lower(cp.status) IN ('scheduled','open','due','grace')
               AND cp.opening_date<=p_closing_date AND cp.closing_date>=p_opening_date) THEN
    RAISE EXCEPTION 'Another active/scheduled Other cycle overlaps this cycle';
  END IF;
  INSERT INTO public.contribution_periods(
    group_id,contribution_type_id,frequency,period_key,opening_date,closing_date,due_date,
    status,created_by,name,description,amount,fine_rule_id)
  VALUES(p_group_id,p_contribution_type_id,lower(p_frequency),btrim(p_period_key),
         p_opening_date,p_closing_date,p_due_date,'draft',v_actor_member_id,
         btrim(p_name),p_description,p_amount,p_fine_rule_id)
  RETURNING id INTO v_cycle_id;
  INSERT INTO private.other_contribution_cycle_requests(
    request_id,operation,cycle_id,group_id,payload_hash,result,completed_at)
  VALUES(p_request_id,'create',v_cycle_id,p_group_id,v_payload_hash,
         jsonb_build_object('ok',true,'cycle_id',v_cycle_id,'group_id',p_group_id,'status','draft'),now())
  ON CONFLICT(request_id,operation) DO UPDATE
    SET cycle_id=EXCLUDED.cycle_id,group_id=EXCLUDED.group_id,
        payload_hash=EXCLUDED.payload_hash,result=EXCLUDED.result,
        completed_at=EXCLUDED.completed_at;
  INSERT INTO private.other_contribution_cycle_audit(
    cycle_id,group_id,action,actor_user_id,request_id,request_operation,details)
  VALUES(v_cycle_id,p_group_id,'CYCLE_CREATED',v_actor,p_request_id,'create',
         jsonb_build_object('amount',p_amount,'frequency',lower(p_frequency),
                            'opening_date',p_opening_date,'due_date',p_due_date,
                            'closing_date',p_closing_date,'fine_rule_id',p_fine_rule_id));
  RETURN jsonb_build_object('ok',true,'cycle_id',v_cycle_id,'group_id',p_group_id,
                            'status','draft','idempotent_replay',false);
END $function$


CREATE OR REPLACE FUNCTION public.create_subscription_invoice(p_cycle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_subscription public.group_subscriptions%ROWTYPE;
    v_invoice_id uuid;
    v_invoice public.subscription_invoices%ROWTYPE;
    v_existing boolean;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT gs.* INTO v_subscription
    FROM public.subscription_cycles sc
    JOIN public.group_subscriptions gs ON gs.id = sc.subscription_id
    WHERE sc.id = p_cycle_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription cycle % does not exist', p_cycle_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.is_platform_admin()
       AND NOT EXISTS (
           SELECT 1 FROM public.groups g
           WHERE g.id = v_subscription.group_id
             AND g.owner_user_id = auth.uid()
       )
       AND NOT EXISTS (
           SELECT 1 FROM public.members m
           WHERE m.group_id = v_subscription.group_id
             AND (m.auth_user_id = auth.uid() OR m.user_id = auth.uid())
             AND lower(coalesce(m.role,'')) = 'admin'
             AND lower(coalesce(m.status,'')) = 'active'
             AND lower(coalesce(m.onboarding_status,'')) = 'active'
       ) THEN
        RAISE EXCEPTION 'Group administrator privileges required' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('chama_live_subscription:' || v_subscription.id::text, 0)
    );

    SELECT * INTO v_invoice
    FROM public.subscription_invoices
    WHERE subscription_id = v_subscription.id
      AND cycle_id = p_cycle_id
    FOR UPDATE;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true, 'existing', true,
            'invoice_id', v_invoice.id, 'invoice_number', v_invoice.invoice_number,
            'subscription_id', v_invoice.subscription_id, 'cycle_id', v_invoice.cycle_id,
            'status', v_invoice.status, 'total_amount', v_invoice.total_amount
        );
    END IF;

    v_invoice_id := private.create_subscription_invoice_authority(p_cycle_id);

    SELECT * INTO v_invoice
    FROM public.subscription_invoices
    WHERE id = v_invoice_id
    FOR UPDATE;

    RETURN jsonb_build_object(
        'success', true, 'existing', false,
        'invoice_id', v_invoice.id, 'invoice_number', v_invoice.invoice_number,
        'subscription_id', v_invoice.subscription_id, 'cycle_id', v_invoice.cycle_id,
        'status', v_invoice.status,
        'member_count_snapshot', v_invoice.member_count_snapshot,
        'member_login_count', v_invoice.member_login_count,
        'subtotal', v_invoice.subtotal,
        'total_discount', v_invoice.total_discount,
        'total_amount', v_invoice.total_amount,
        'currency', v_invoice.currency
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.current_user_group_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select group_id
  from public.members
  where (user_id = (select auth.uid()) or auth_user_id = (select auth.uid()))
    and status = 'active'
    and onboarding_status = 'active';
$function$


CREATE OR REPLACE FUNCTION public.current_user_role(p_group_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE lower(btrim(coalesce(m.actual_position, '')))
    WHEN 'vice_chairperson' THEN 'chairperson'
    WHEN 'vice-chairperson' THEN 'chairperson'
    WHEN 'vice chairperson' THEN 'chairperson'
    WHEN 'vice_secretary' THEN 'secretary'
    WHEN 'vice-secretary' THEN 'secretary'
    WHEN 'vice secretary' THEN 'secretary'
    ELSE CASE lower(btrim(coalesce(m.role, 'member')))
      WHEN 'vice chairperson' THEN 'chairperson'
      WHEN 'vice-chairperson' THEN 'chairperson'
      WHEN 'vice secretary' THEN 'secretary'
      WHEN 'vice-secretary' THEN 'secretary'
      WHEN 'administrator' THEN 'admin'
      ELSE lower(btrim(coalesce(m.role, 'member')))
    END
  END
  FROM public.members m
  WHERE m.group_id = p_group_id
    AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
    AND lower(coalesce(m.status, 'active')) = 'active'
    AND lower(coalesce(m.onboarding_status, 'active')) = 'active'
  ORDER BY m.id
  LIMIT 1;
$function$


CREATE OR REPLACE FUNCTION public.enforce_member_position_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.actual_position IS DISTINCT FROM OLD.actual_position OR NEW.actual_position_name IS DISTINCT FROM OLD.actual_position_name THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.member_position_history h
      WHERE h.group_id=NEW.group_id AND h.member_id=NEW.id AND h.effective_to IS NULL
        AND h.actual_position IS NOT DISTINCT FROM NEW.actual_position
        AND h.actual_position_name IS NOT DISTINCT FROM NEW.actual_position_name
    ) THEN RAISE EXCEPTION 'POSITION_HISTORY_REQUIRED' USING ERRCODE='23514',HINT='Use set_member_actual_position().'; END IF;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.ensure_contribution_initiative_period(p_initiative_id uuid, p_period_key text, p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives; v_open date; v_close date; v_first date; v_existing uuid; v_claimed boolean;
  v_request jsonb; v_request_initiative_id uuid; v_request_group_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request id is required'; END IF;
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE;
  IF NOT FOUND OR v_i.frequency <> 'monthly' OR v_i.status <> 'active' THEN RAISE EXCEPTION 'Initiative not eligible'; END IF;
  IF NOT public.cl_user_in_group(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'ensure_recurring_period','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT result,initiative_id,group_id INTO v_request,v_request_initiative_id,v_request_group_id
    FROM private.contribution_initiative_requests
    WHERE request_id=p_request_id AND operation='ensure_recurring_period' FOR UPDATE;
    IF v_request_initiative_id IS DISTINCT FROM v_i.id OR v_request_group_id IS DISTINCT FROM v_i.group_id THEN
      RAISE EXCEPTION 'Request id is already bound to another initiative';
    END IF;
    RETURN ((v_request->>'period_id'))::uuid;
  END IF;
  v_open:=to_date(p_period_key||'-01','YYYY-MM-DD');
  IF to_char(v_open,'YYYY-MM')<>p_period_key THEN RAISE EXCEPTION 'Invalid period key'; END IF;
  v_close:=(v_open+interval '1 month'-interval '1 day')::date;
  v_first:=date_trunc('month',v_i.start_date)::date;
  IF v_i.start_date>v_first THEN v_first:=(v_first+interval '1 month')::date; END IF;
  IF v_open<v_first OR v_close>v_i.closing_date THEN RAISE EXCEPTION 'Period outside recurring window'; END IF;
  IF v_open<>date_trunc('month',current_date)::date THEN RAISE EXCEPTION 'Just-in-time generation permits current calendar month only'; END IF;
  SELECT id INTO v_existing FROM public.contribution_initiative_periods WHERE initiative_id=v_i.id AND period_key=p_period_key;
  IF FOUND THEN
    UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=jsonb_build_object('period_id',v_existing)
    WHERE request_id=p_request_id AND operation='ensure_recurring_period';
    RETURN v_existing;
  END IF;
  INSERT INTO public.contribution_initiative_periods(initiative_id,period_key,opening_date,closing_date,due_date,status)
  VALUES(v_i.id,p_period_key,v_open,v_close,v_close,'open')
  ON CONFLICT(initiative_id,period_key) DO UPDATE SET updated_at=public.contribution_initiative_periods.updated_at
  RETURNING id INTO v_existing;
  UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=jsonb_build_object('period_id',v_existing)
  WHERE request_id=p_request_id AND operation='ensure_recurring_period';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.ensure_contribution_initiative_period_obligations(p_period_id uuid, p_request_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_p public.contribution_initiative_periods; v_i public.contribution_initiatives; v_count integer:=0; v_claimed boolean;
  v_request jsonb; v_request_initiative_id uuid; v_request_group_id uuid; v_request_period_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request id is required'; END IF;
  SELECT i.* INTO v_i FROM public.contribution_initiatives i
  WHERE i.id=(SELECT p.initiative_id FROM public.contribution_initiative_periods p WHERE p.id=p_period_id) FOR UPDATE;
  IF NOT FOUND OR v_i.frequency <> 'monthly' OR v_i.status <> 'active' THEN RAISE EXCEPTION 'Initiative not eligible'; END IF;
  SELECT * INTO v_p FROM public.contribution_initiative_periods WHERE id=p_period_id AND initiative_id=v_i.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Period not found'; END IF;
  IF NOT public.cl_user_in_group(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'ensure_recurring_period_obligations','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT result,initiative_id,group_id INTO v_request,v_request_initiative_id,v_request_group_id
    FROM private.contribution_initiative_requests
    WHERE request_id=p_request_id AND operation='ensure_recurring_period_obligations' FOR UPDATE;
    IF v_request_initiative_id IS DISTINCT FROM v_i.id OR v_request_group_id IS DISTINCT FROM v_i.group_id THEN
      RAISE EXCEPTION 'Request id is already bound to another initiative';
    END IF;
    v_request_period_id:=(v_request->>'period_id')::uuid;
    IF v_request_period_id IS DISTINCT FROM v_p.id THEN RAISE EXCEPTION 'Request id is already bound to another period'; END IF;
    RETURN coalesce((v_request->>'inserted_count')::integer,0);
  END IF;
  IF v_p.opening_date>date_trunc('month',current_date)::date THEN RAISE EXCEPTION 'Cannot generate obligations for a future period'; END IF;
  INSERT INTO public.contribution_initiative_obligations(initiative_id,initiative_period_id,initiative_member_id,member_id,amount_due,due_date)
  SELECT v_i.id,v_p.id,im.id,im.member_id,t.amount,v_p.due_date
  FROM public.contribution_initiative_members im
  JOIN LATERAL (SELECT t.amount FROM public.contribution_initiative_member_terms t
    WHERE t.initiative_member_id=im.id AND t.status='active' AND t.effective_from<=v_p.opening_date
      AND (t.effective_to IS NULL OR t.effective_to>=v_p.opening_date)
    ORDER BY t.effective_from DESC,t.id DESC LIMIT 1) t ON true
  WHERE im.initiative_id=v_i.id AND lower(coalesce(im.status,'active'))='active'
  ON CONFLICT(initiative_period_id,member_id) DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=jsonb_build_object('inserted_count',v_count,'period_id',v_p.id)
  WHERE request_id=p_request_id AND operation='ensure_recurring_period_obligations';
  RETURN v_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.ensure_financial_period(p_group_id uuid, p_month text)
 RETURNS financial_periods
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_period public.financial_periods;
  v_opening numeric := 0;
  v_previous_month text;
BEGIN
  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'Group ID is required';
  END IF;

  IF p_month IS NULL OR p_month !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Month must use YYYY-MM format';
  END IF;

  SELECT fp.*
    INTO v_period
  FROM public.financial_periods fp
  WHERE fp.group_id = p_group_id
    AND fp.month = p_month
  FOR UPDATE;

  IF FOUND THEN
    RETURN v_period;
  END IF;

  v_previous_month :=
    to_char(
      (to_date(p_month || '-01','YYYY-MM-DD') - interval '1 month')::date,
      'YYYY-MM'
    );

  SELECT fp.closing_balance
    INTO v_opening
  FROM public.financial_periods fp
  WHERE fp.group_id = p_group_id
    AND fp.month = v_previous_month
  LIMIT 1;

  IF v_opening IS NULL THEN
    SELECT g.opening_balance
      INTO v_opening
    FROM public.groups g
    WHERE g.id = p_group_id;
  END IF;

  v_opening := coalesce(v_opening,0);

  INSERT INTO public.financial_periods (
    group_id, month, opening_balance, closing_balance, status
  )
  VALUES (
    p_group_id, p_month, v_opening, v_opening, 'open'
  )
  ON CONFLICT (group_id,month) DO NOTHING;

  SELECT fp.*
    INTO v_period
  FROM public.financial_periods fp
  WHERE fp.group_id = p_group_id
    AND fp.month = p_month
  FOR UPDATE;

  RETURN v_period;
END;
$function$


CREATE OR REPLACE FUNCTION public.financial_charges_guard_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.member_id IS DISTINCT FROM OLD.member_id
       OR NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
       OR NEW.charge_type IS DISTINCT FROM OLD.charge_type
       OR NEW.source IS DISTINCT FROM OLD.source
       OR NEW.source_id IS DISTINCT FROM OLD.source_id
       OR NEW.accounting_month IS DISTINCT FROM OLD.accounting_month
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.currency IS DISTINCT FROM OLD.currency
    THEN
        RAISE EXCEPTION 'Financial charge accounting identity is immutable';
    END IF;

    RETURN NEW;
END;
$function$


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


-- STAGE ONLY: production function definitions; ordinal rows 121-130 of 201.
-- Captured read-only on 2026-10-14. Alphabetical order is NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects require separate reconciliation.

CREATE OR REPLACE FUNCTION public.get_contribution_initiative_member_status(p_initiative_id uuid, p_member_id uuid, p_period_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives;
  v_p public.contribution_initiative_periods;
  v_o public.contribution_initiative_obligations;
  v_allocated numeric := 0;
  v_credit numeric := 0;
BEGIN
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id;
  IF NOT FOUND OR NOT public.cl_user_in_group(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_p FROM public.contribution_initiative_periods
  WHERE initiative_id=p_initiative_id AND period_key=p_period_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('initiative_id',p_initiative_id,'member_id',p_member_id,'period_key',p_period_key,'exists',false);
  END IF;

  SELECT * INTO v_o FROM public.contribution_initiative_obligations
  WHERE initiative_period_id=v_p.id AND member_id=p_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('initiative_id',p_initiative_id,'member_id',p_member_id,'period_key',p_period_key,'obligation_exists',false);
  END IF;

  SELECT coalesce(sum(a.amount),0) INTO v_allocated
  FROM public.contribution_initiative_allocations a
  WHERE a.initiative_obligation_id=v_o.id
    AND NOT EXISTS (SELECT 1 FROM public.contribution_initiative_payment_reversals r WHERE r.payment_id=a.payment_id);

  SELECT coalesce(sum(c.remaining_amount),0) INTO v_credit
  FROM public.contribution_initiative_credits c
  WHERE c.initiative_id=p_initiative_id AND c.member_id=p_member_id;

  RETURN jsonb_build_object(
    'initiative_id',p_initiative_id,
    'member_id',p_member_id,
    'period_id',v_p.id,
    'period_key',v_p.period_key,
    'amount_due',v_o.amount_due,
    'allocated_amount',v_allocated,
    'outstanding_amount',greatest(v_o.amount_due-v_allocated,0),
    'initiative_credit',v_credit
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.get_contribution_initiative_participants(p_initiative_id uuid)
 RETURNS TABLE(initiative_member_id uuid, member_id uuid, amount numeric, effective_from date, effective_to date, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select ci.group_id
    into v_group_id
    from public.contribution_initiatives ci
   where ci.id = p_initiative_id;

  if not found or not public.can_manage_members(v_group_id) then
    raise exception 'Not authorized';
  end if;

  return query
    select im.id,
           im.member_id,
           im.amount,
           im.effective_from,
           im.effective_to,
           im.status
      from public.contribution_initiative_members im
     where im.initiative_id = p_initiative_id
     order by im.member_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_contribution_initiative_period_status(p_initiative_id uuid, p_period_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives;
  v_p public.contribution_initiative_periods;
  v_obligations integer;
  v_allocated numeric;
  v_outstanding numeric;
BEGIN
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id;
  IF NOT FOUND OR NOT public.cl_user_in_group(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_p FROM public.contribution_initiative_periods
  WHERE initiative_id=p_initiative_id AND period_key=p_period_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('initiative_id',p_initiative_id,'period_key',p_period_key,'exists',false);
  END IF;

  SELECT count(*),
         coalesce(sum(coalesce(a.allocated,0)),0),
         coalesce(sum(greatest(o.amount_due-coalesce(a.allocated,0),0)),0)
  INTO v_obligations,v_allocated,v_outstanding
  FROM public.contribution_initiative_obligations o
  LEFT JOIN LATERAL (
    SELECT sum(x.amount) allocated
    FROM public.contribution_initiative_allocations x
    WHERE x.initiative_obligation_id=o.id
      AND NOT EXISTS (SELECT 1 FROM public.contribution_initiative_payment_reversals r WHERE r.payment_id=x.payment_id)
  ) a ON true
  WHERE o.initiative_period_id=v_p.id;

  RETURN jsonb_build_object(
    'initiative_id',p_initiative_id,
    'period_id',v_p.id,
    'period_key',v_p.period_key,
    'opening_date',v_p.opening_date,
    'closing_date',v_p.closing_date,
    'status',v_p.status,
    'obligation_count',v_obligations,
    'allocated_amount',v_allocated,
    'outstanding_amount',v_outstanding
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.get_contribution_initiative_recurring_participants(p_initiative_id uuid)
 RETURNS TABLE(initiative_member_id uuid, member_id uuid, amount numeric, effective_from date, effective_to date, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group_id uuid;
  v_frequency text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select ci.group_id, ci.frequency
    into v_group_id, v_frequency
    from public.contribution_initiatives ci
   where ci.id = p_initiative_id;

  if not found or not public.can_manage_members(v_group_id) then
    raise exception 'Not authorized';
  end if;

  if v_frequency <> 'monthly' then
    raise exception 'Initiative is not recurring monthly';
  end if;

  return query
    select im.id,
           im.member_id,
           coalesce(term.amount, im.amount),
           coalesce(term.effective_from, im.effective_from),
           coalesce(term.effective_to, im.effective_to),
           coalesce(term.status, im.status)
      from public.contribution_initiative_members im
      left join lateral (
        select t.amount, t.effective_from, t.effective_to, t.status
          from public.contribution_initiative_member_terms t
         where t.initiative_member_id = im.id
         order by t.effective_from desc
         limit 1
      ) term on true
     where im.initiative_id = p_initiative_id
       and lower(coalesce(im.status, 'active')) = 'active'
     order by im.member_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_contribution_initiative_summary(p_initiative_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives;
  v_periods integer;
  v_obligations integer;
  v_due numeric;
  v_allocated numeric;
  v_outstanding numeric;
  v_credit numeric;
BEGIN
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id;
  IF NOT FOUND OR NOT public.cl_user_in_group(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT count(*) INTO v_periods FROM public.contribution_initiative_periods WHERE initiative_id=p_initiative_id;
  SELECT count(*),coalesce(sum(o.amount_due),0) INTO v_obligations,v_due
  FROM public.contribution_initiative_obligations o WHERE o.initiative_id=p_initiative_id AND o.initiative_period_id IS NOT NULL;
  SELECT coalesce(sum(a.amount),0) INTO v_allocated
  FROM public.contribution_initiative_allocations a
  WHERE EXISTS (SELECT 1 FROM public.contribution_initiative_obligations o WHERE o.id=a.initiative_obligation_id AND o.initiative_id=p_initiative_id)
    AND NOT EXISTS (SELECT 1 FROM public.contribution_initiative_payment_reversals r WHERE r.payment_id=a.payment_id);
  SELECT coalesce(sum(c.remaining_amount),0) INTO v_credit
  FROM public.contribution_initiative_credits c WHERE c.initiative_id=p_initiative_id;
  v_outstanding=greatest(v_due-v_allocated,0);

  RETURN jsonb_build_object(
    'initiative_id',p_initiative_id,
    'status',v_i.status,
    'frequency',v_i.frequency,
    'period_count',v_periods,
    'obligation_count',v_obligations,
    'amount_due',v_due,
    'allocated_amount',v_allocated,
    'outstanding_amount',v_outstanding,
    'initiative_credit',v_credit
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.get_group_contribution_positions(p_group_id uuid)
 RETURNS TABLE(member_id uuid, group_id uuid, total_due numeric, total_allocated numeric, arrears numeric, credit numeric, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_role text;
BEGIN
  v_role := public.current_user_role(p_group_id);
  IF v_role IS NULL OR v_role NOT IN ('admin', 'chairperson', 'secretary', 'treasurer') THEN
    RAISE EXCEPTION 'Not authorized to view group cumulative contribution positions'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT pos.member_id, pos.group_id, pos.total_due, pos.total_allocated, pos.arrears, pos.credit, pos.status
  FROM public.members AS m
  CROSS JOIN LATERAL public.get_member_contribution_position(m.id) AS pos
  WHERE m.group_id = p_group_id AND pos.group_id = p_group_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_group_contribution_settings(p_group_id uuid)
 RETURNS TABLE(group_id uuid, monthly_closing_day smallint, current_opening_date date, current_closing_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_day smallint; v_close date; v_open date;
BEGIN
  IF NOT public.can_manage_members(p_group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT s.monthly_closing_day INTO v_day FROM public.group_contribution_settings s WHERE s.group_id=p_group_id;
  IF v_day IS NULL THEN v_day := 5; END IF;
  v_close := CASE WHEN current_date <= make_date(extract(year from current_date)::int,extract(month from current_date)::int,v_day)
    THEN make_date(extract(year from current_date)::int,extract(month from current_date)::int,v_day)
    ELSE make_date(extract(year from current_date + interval '1 month')::int,extract(month from current_date + interval '1 month')::int,v_day) END;
  v_open := v_close - interval '1 month' + interval '1 day';
  v_open := v_open::date;
  RETURN QUERY SELECT p_group_id,v_day,v_open,v_close;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_group_custom_contribution_status(p_group_id uuid)
 RETURNS TABLE(member_id uuid, member_name text, contribution_name text, period_id uuid, amount_due numeric, amount_applied numeric, outstanding numeric, status text, due_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_user_role(p_group_id);
  IF v_role IS NULL OR v_role NOT IN ('admin', 'chairperson', 'secretary', 'treasurer') THEN
    RAISE EXCEPTION 'Not authorized to view group custom contribution status'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.member_id,
    m.name::text,
    COALESCE(NULLIF(trim(cp.name), ''), NULLIF(trim(ct.name), ''), 'Custom Contribution')::text,
    cp.id,
    COALESCE(o.due_amount, 0)::numeric,
    COALESCE(alloc.amount_applied, 0)::numeric,
    GREATEST(COALESCE(o.due_amount, 0) - COALESCE(alloc.amount_applied, 0), 0)::numeric,
    CASE
      WHEN COALESCE(alloc.amount_applied, 0) >= COALESCE(o.due_amount, 0) THEN 'paid'
      WHEN COALESCE(alloc.amount_applied, 0) > 0 THEN 'partial'
      ELSE 'outstanding'
    END::text,
    cp.due_date
  FROM public.contribution_obligations AS o
  JOIN public.members AS m
    ON m.id = o.member_id
   AND m.group_id = o.group_id
  JOIN public.contribution_periods AS cp
    ON cp.id = o.period_id
   AND cp.group_id = o.group_id
  JOIN public.contribution_types AS ct
    ON ct.id = o.contribution_type_id
   AND ct.group_id = o.group_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(a.amount), 0)::numeric AS amount_applied
    FROM public.contribution_allocations AS a
    WHERE a.obligation_id = o.id
  ) AS alloc ON true
  WHERE o.group_id = p_group_id
    AND lower(trim(COALESCE(ct.code, ''))) = 'custom'
    AND lower(trim(COALESCE(cp.status, ''))) IN ('open', 'due', 'grace')
  ORDER BY cp.due_date NULLS LAST, cp.name, m.name;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_group_module_settings(p_group_id uuid)
 RETURNS TABLE(group_id uuid, merry_go_round_enabled boolean, loans_enabled boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.members m
    where m.group_id = p_group_id
      and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  ) then
    raise exception 'You are not an active member of this group' using errcode = '42501';
  end if;

  return query
  select g.id, g.merry_go_round_enabled, g.loans_enabled
  from public.groups g
  where g.id = p_group_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_group_monthly_cycle_status(p_group_id uuid, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(group_id uuid, monthly_closing_day smallint, monthly_grace_days smallint, cycle_opening_date date, cycle_closing_date date, cycle_status text, grace_start_date date, grace_end_date date, is_in_grace boolean, next_cycle_opening_date date, next_cycle_closing_date date, grace_message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_closing_day smallint;
  v_grace_days smallint;
  v_owner_user_id uuid;
  v_role text;
  v_cycle_closing date;
  v_cycle_opening date;
  v_previous_closing date;
  v_grace_start date;
  v_grace_end date;
  v_next_opening date;
  v_next_closing date;
  v_in_grace boolean := false;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select g.owner_user_id into v_owner_user_id
  from public.groups g
  where g.id = p_group_id;

  if v_owner_user_id is null then raise exception 'GROUP_NOT_FOUND'; end if;

  v_role := public.current_user_role(p_group_id);

  if auth.uid() <> v_owner_user_id and v_role is null then
    raise exception 'GROUP_ACCESS_NOT_AUTHORIZED';
  end if;

  select s.monthly_closing_day, coalesce(s.monthly_grace_days,0)
    into v_closing_day, v_grace_days
  from public.group_contribution_settings s
  where s.group_id=p_group_id;

  if v_closing_day is null then raise exception 'CONTRIBUTION_SETTINGS_NOT_FOUND'; end if;

  if extract(day from p_as_of_date)::int <= v_closing_day then
    v_cycle_closing := make_date(extract(year from p_as_of_date)::int,extract(month from p_as_of_date)::int,v_closing_day);
  else
    v_cycle_closing := (date_trunc('month',p_as_of_date)::date + interval '1 month')::date + (v_closing_day-1);
  end if;

  v_cycle_opening := (v_cycle_closing - interval '1 month')::date + 1;
  v_next_opening := v_cycle_closing + 1;
  v_next_closing := (v_cycle_closing + interval '1 month')::date;

  if extract(day from p_as_of_date)::int > v_closing_day then
    v_previous_closing := date_trunc('month',p_as_of_date)::date + (v_closing_day-1);
  else
    v_previous_closing := (date_trunc('month',p_as_of_date)::date - interval '1 month')::date + (v_closing_day-1);
  end if;

  v_grace_start := v_previous_closing + 1;
  v_grace_end := v_previous_closing + v_grace_days;
  v_in_grace := v_grace_days > 0 and p_as_of_date between v_grace_start and v_grace_end;

  return query
  select p_group_id,v_closing_day,v_grace_days,v_cycle_opening,v_cycle_closing,
    case when v_in_grace then 'GRACE' else 'OPEN' end,
    v_grace_start,v_grace_end,v_in_grace,v_next_opening,v_next_closing,
    case when v_in_grace then 'Previous contribution cycle is in its grace period through '||to_char(v_grace_end,'DD Mon YYYY') else null end;
end;
$function$


-- STAGE ONLY: production function definitions; ordinal rows 131-140 of 201.
-- Captured read-only on 2026-10-14. Alphabetical order is NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects require separate reconciliation.

CREATE OR REPLACE FUNCTION public.get_group_subscription(p_group_id uuid)
 RETURNS TABLE(subscription_id uuid, group_id uuid, status text, started_at timestamp with time zone, pricing_tier_code text, standard_group_amount numeric, standard_member_login_amount numeric, currency text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT s.id,s.group_id,s.status,s.started_at,s.pricing_tier_code,s.standard_group_amount,s.standard_member_login_amount,s.currency FROM public.group_subscriptions s WHERE s.group_id=p_group_id AND public.cl_user_in_group(p_group_id); $function$


CREATE OR REPLACE FUNCTION public.get_member_contribution_position(p_member_id uuid)
 RETURNS TABLE(member_id uuid, group_id uuid, total_due numeric, total_allocated numeric, arrears numeric, credit numeric, status text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH target_member AS (
    SELECT m.id, m.group_id
    FROM public.members AS m
    WHERE m.id = p_member_id
      AND (
        public.cl_user_has_role(
          m.group_id,
          ARRAY['admin','chairperson','secretary','treasurer']::text[]
        )
        OR m.user_id = auth.uid()
        OR m.auth_user_id = auth.uid()
      )
  ),
  monthly_types AS (
    SELECT DISTINCT ON (ct.group_id)
      ct.group_id, ct.id AS contribution_type_id
    FROM public.contribution_types AS ct
    WHERE lower(trim(coalesce(ct.code, ''))) = 'monthly'
       OR lower(trim(ct.name)) = 'monthly'
    ORDER BY ct.group_id,
      CASE WHEN lower(trim(coalesce(ct.code, ''))) = 'monthly' THEN 0 ELSE 1 END,
      ct.created_at, ct.id
  ),
  obligation_totals AS (
    SELECT o.member_id, o.group_id, COALESCE(SUM(o.due_amount), 0)::numeric AS total_due
    FROM public.contribution_obligations AS o
    JOIN monthly_types AS mt ON mt.group_id = o.group_id AND mt.contribution_type_id = o.contribution_type_id
    JOIN target_member AS tm ON tm.id = o.member_id AND tm.group_id = o.group_id
    GROUP BY o.member_id, o.group_id
  ),
  allocation_totals AS (
    SELECT o.member_id, o.group_id, COALESCE(SUM(a.amount), 0)::numeric AS total_allocated
    FROM public.contribution_allocations AS a
    JOIN public.contribution_obligations AS o ON o.id = a.obligation_id
    JOIN monthly_types AS mt ON mt.group_id = o.group_id AND mt.contribution_type_id = o.contribution_type_id
    JOIN target_member AS tm ON tm.id = o.member_id AND tm.group_id = o.group_id
    GROUP BY o.member_id, o.group_id
  ),
  payment_totals AS (
    SELECT c.member_id, c.group_id,
      COALESCE(SUM(c.amount - COALESCE(pa.allocated_amount, 0)), 0)::numeric AS credit
    FROM public.contributions AS c
    JOIN target_member AS tm ON tm.id = c.member_id AND tm.group_id = c.group_id
    LEFT JOIN (
      SELECT a.payment_id, COALESCE(SUM(a.amount), 0)::numeric AS allocated_amount
      FROM public.contribution_allocations AS a
      GROUP BY a.payment_id
    ) AS pa ON pa.payment_id = c.id
    WHERE lower(trim(c.contribution_type)) = 'monthly'
    GROUP BY c.member_id, c.group_id
  )
  SELECT tm.id AS member_id, tm.group_id,
    COALESCE(ot.total_due, 0)::numeric(14,2) AS total_due,
    COALESCE(at.total_allocated, 0)::numeric(14,2) AS total_allocated,
    GREATEST(COALESCE(ot.total_due, 0) - COALESCE(at.total_allocated, 0), 0)::numeric(14,2) AS arrears,
    GREATEST(COALESCE(pt.credit, 0), 0)::numeric(14,2) AS credit,
    CASE
      WHEN GREATEST(COALESCE(ot.total_due, 0) - COALESCE(at.total_allocated, 0), 0) > 0 THEN 'ARREARS'
      WHEN GREATEST(COALESCE(pt.credit, 0), 0) > 0 THEN 'CREDIT'
      ELSE 'UP_TO_DATE'
    END AS status
  FROM target_member AS tm
  LEFT JOIN obligation_totals AS ot ON ot.member_id = tm.id AND ot.group_id = tm.group_id
  LEFT JOIN allocation_totals AS at ON at.member_id = tm.id AND at.group_id = tm.group_id
  LEFT JOIN payment_totals AS pt ON pt.member_id = tm.id AND pt.group_id = tm.group_id
$function$


CREATE OR REPLACE FUNCTION public.get_member_monthly_status(p_group_id uuid, p_month text)
 RETURNS TABLE(member_id uuid, member_name text, member_number text, monthly_due numeric, previous_outstanding numeric, payment_this_month numeric, applied_this_month numeric, carry_forward numeric, current_outstanding numeric, contribution_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_selected_month date;
    v_monthly_due numeric := 0;
    r_member record;

    v_debt numeric := 0;
    v_credit numeric := 0;
    v_payment numeric := 0;
    v_available numeric := 0;
    v_current_due numeric := 0;
    v_applied numeric := 0;
    v_current_outstanding numeric := 0;
    v_previous_outstanding numeric := 0;

    v_month date;
    v_start_month date;
BEGIN

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_month IS NULL
       OR p_month !~ '^\d{4}-\d{2}$'
    THEN
        RAISE EXCEPTION 'Invalid month. Expected YYYY-MM';
    END IF;

    v_selected_month :=
        (p_month || '-01')::date;

    IF NOT public.cl_user_in_group(p_group_id) THEN
        RAISE EXCEPTION
            'You are not a member of this group';
    END IF;

    SELECT COALESCE(
        g.monthly_contribution,
        0
    )
    INTO v_monthly_due
    FROM public.groups g
    WHERE g.id = p_group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found';
    END IF;

    /*
     * ACTIVE MEMBERS
     *
     * status = active is the authoritative membership
     * condition for contribution reporting.
     *
     * onboarding_status is deliberately NOT used here.
     */
    FOR r_member IN
        SELECT
            m.id,
            m.name,
            m.member_number,
            m.join_date
        FROM public.members m
        WHERE m.group_id = p_group_id
          AND lower(
                COALESCE(m.status, 'active')
              ) = 'active'
        ORDER BY m.name
    LOOP

        v_debt := 0;
        v_credit := 0;

        v_start_month :=
            date_trunc(
                'month',
                COALESCE(
                    r_member.join_date,
                    v_selected_month
                )
            )::date;

        IF v_start_month > v_selected_month THEN
            v_start_month := v_selected_month;
        END IF;

        v_month := v_start_month;

        /*
         * Process months before selected month.
         */
        WHILE v_month < v_selected_month LOOP

            SELECT COALESCE(
                SUM(c.amount),
                0
            )
            INTO v_payment
            FROM public.contributions c
            WHERE c.group_id = p_group_id
              AND c.member_id = r_member.id
              AND lower(
                    COALESCE(
                        c.contribution_type,
                        ''
                    )
                  ) = 'monthly'
              AND c.contribution_date >= v_month
              AND c.contribution_date <
                    (
                        v_month +
                        interval '1 month'
                    )::date;

            v_available :=
                v_payment + v_credit;

            /*
             * Clear historical debt first.
             */
            IF v_debt > 0 THEN

                IF v_available >= v_debt THEN
                    v_available :=
                        v_available - v_debt;

                    v_debt := 0;

                ELSE
                    v_debt :=
                        v_debt - v_available;

                    v_available := 0;

                END IF;

            END IF;

            v_applied :=
                LEAST(
                    v_available,
                    v_monthly_due
                );

            v_available :=
                GREATEST(
                    v_available - v_applied,
                    0
                );

            v_current_outstanding :=
                GREATEST(
                    v_monthly_due - v_applied,
                    0
                );

            v_credit := v_available;

            v_debt :=
                v_debt +
                v_current_outstanding;

            v_month :=
                (
                    v_month +
                    interval '1 month'
                )::date;

        END LOOP;

        /*
         * Debt entering selected month.
         */
        v_previous_outstanding :=
            GREATEST(v_debt, 0);

        /*
         * Selected month's actual monthly payments.
         */
        SELECT COALESCE(
            SUM(c.amount),
            0
        )
        INTO v_payment
        FROM public.contributions c
        WHERE c.group_id = p_group_id
          AND c.member_id = r_member.id
          AND lower(
                COALESCE(
                    c.contribution_type,
                    ''
                )
              ) = 'monthly'
          AND c.contribution_date >=
                v_selected_month
          AND c.contribution_date <
                (
                    v_selected_month +
                    interval '1 month'
                )::date;

        v_available :=
            v_payment + v_credit;

        /*
         * Previous arrears are cleared first.
         */
        IF v_debt > 0 THEN

            IF v_available >= v_debt THEN

                v_available :=
                    v_available - v_debt;

                v_debt := 0;

            ELSE

                v_debt :=
                    v_debt - v_available;

                v_available := 0;

            END IF;

        END IF;

        v_current_due :=
            v_monthly_due;

        v_applied :=
            LEAST(
                v_available,
                v_current_due
            );

        v_available :=
            GREATEST(
                v_available - v_applied,
                0
            );

        v_current_outstanding :=
            GREATEST(
                v_current_due - v_applied,
                0
            );

        v_credit :=
            v_available;

        /*
         * RETURN ROW
         */
        member_id :=
            r_member.id;

        member_name :=
            r_member.name;

        member_number :=
            r_member.member_number;

        monthly_due :=
            v_monthly_due;

        previous_outstanding :=
            v_previous_outstanding;

        payment_this_month :=
            v_payment;

        applied_this_month :=
            v_applied;

        carry_forward :=
            v_credit;

        current_outstanding :=
            v_current_outstanding;

        contribution_status :=
            CASE
                WHEN v_current_outstanding <= 0
                    THEN 'Paid'

                WHEN v_applied > 0
                    THEN 'Partial'

                ELSE 'Outstanding'
            END;

        RETURN NEXT;

    END LOOP;

END;
$function$


CREATE OR REPLACE FUNCTION public.get_member_payment_allocation_statement(p_member_id uuid, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date)
 RETURNS TABLE(payment_id uuid, member_id uuid, group_id uuid, payment_date date, payment_amount numeric, payment_method text, reference text, mpesa_reference text, notes text, created_at timestamp with time zone, allocation_id uuid, allocated_amount numeric, obligation_id uuid, obligation_month date, obligation_due_amount numeric, economic_month date, contribution_type_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    select
        c.id as payment_id,
        c.member_id,
        c.group_id,
        c.contribution_date as payment_date,
        c.amount as payment_amount,
        c.payment_method,
        c.reference,
        c.mpesa_reference,
        c.notes,
        c.created_at,
        a.id as allocation_id,
        a.amount as allocated_amount,
        o.id as obligation_id,
        o.obligation_month,
        o.due_amount as obligation_due_amount,
        o.economic_month,
        o.contribution_type_id
    from public.contributions c
    join public.members m
      on m.id = c.member_id
    left join public.contribution_allocations a
      on a.payment_id = c.id
    left join public.contribution_obligations o
      on o.id = a.obligation_id
     and o.member_id = c.member_id
     and o.group_id = c.group_id
    where c.member_id = p_member_id
      and c.group_id = m.group_id
      and auth.uid() is not null
      and (
          m.user_id = auth.uid()
          or m.auth_user_id = auth.uid()
          or public.cl_user_has_role(
              m.group_id,
              array[
                  'admin',
                  'chairperson',
                  'treasurer',
                  'secretary'
              ]::text[]
          )
      )
      and (
          p_from_date is null
          or c.contribution_date >= p_from_date
      )
      and (
          p_to_date is null
          or c.contribution_date <= p_to_date
      )
    order by
        c.contribution_date desc nulls last,
        c.created_at desc,
        c.id desc,
        o.obligation_month asc nulls last,
        o.id asc nulls last;
$function$


CREATE OR REPLACE FUNCTION public.get_member_payment_statement(p_member_id uuid, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date)
 RETURNS TABLE(payment_id uuid, member_id uuid, group_id uuid, payment_date date, amount numeric, contribution_type text, payment_method text, reference text, mpesa_reference text, initiative_id uuid, initiative_name text, initiative_contribution_type_id uuid, initiative_contribution_type_name text, notes text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    SELECT
        c.id AS payment_id,
        c.member_id,
        c.group_id,
        c.contribution_date AS payment_date,
        c.amount::numeric,
        c.contribution_type,
        c.payment_method,
        c.reference,
        c.mpesa_reference,
        c.initiative_id,
        ci.name AS initiative_name,
        ci.contribution_type_id AS initiative_contribution_type_id,
        ct.name AS initiative_contribution_type_name,
        c.notes,
        c.created_at
    FROM public.contributions AS c
    JOIN public.members AS m
        ON m.id = c.member_id
       AND m.group_id = c.group_id
    LEFT JOIN public.contribution_initiatives AS ci
        ON ci.id = c.initiative_id
       AND ci.group_id = c.group_id
    LEFT JOIN public.contribution_types AS ct
        ON ct.id = ci.contribution_type_id
       AND ct.group_id = c.group_id
    WHERE c.member_id = p_member_id
      AND auth.uid() IS NOT NULL
      AND (
          m.user_id = auth.uid()
          OR m.auth_user_id = auth.uid()
          OR public.cl_user_has_role(
              m.group_id,
              ARRAY['admin','chairperson','treasurer','secretary']::text[]
          )
      )
      AND (
          p_from_date IS NULL
          OR c.contribution_date >= p_from_date
      )
      AND (
          p_to_date IS NULL
          OR c.contribution_date <= p_to_date
      )
    ORDER BY
        c.contribution_date DESC NULLS LAST,
        c.created_at DESC,
        c.id DESC;
$function$


CREATE OR REPLACE FUNCTION public.get_member_total_recognized_payments(p_member_id uuid)
 RETURNS TABLE(member_id uuid, group_id uuid, total_recognized numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    SELECT
        m.id AS member_id,
        m.group_id,
        COALESCE(SUM(c.amount), 0)::numeric AS total_recognized
    FROM public.members AS m
    LEFT JOIN public.contributions AS c
        ON c.member_id = m.id
       AND c.group_id = m.group_id
    WHERE m.id = p_member_id
      AND auth.uid() IS NOT NULL
      AND (
          m.user_id = auth.uid()
          OR m.auth_user_id = auth.uid()
          OR public.cl_user_has_role(
              m.group_id,
              ARRAY['admin','chairperson','treasurer','secretary']::text[]
          )
      )
    GROUP BY
        m.id,
        m.group_id;
$function$


CREATE OR REPLACE FUNCTION public.get_monthly_accounting_summary(p_group_id uuid, p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_start date;
  v_end date;
  v_expected numeric := 0;
  v_collected numeric := 0;
  v_applied numeric := 0;
  v_credit numeric := 0;
  v_outstanding numeric := 0;
  v_expenses numeric := 0;
  v_opening numeric := 0;
  v_closing numeric := 0;
  v_active integer := 0;
  v_paid integer := 0;
  v_partial integer := 0;
  v_unpaid integer := 0;
  v_rate numeric := 0;
  v_period_status text := 'open';
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_group_id is null then
    raise exception 'Group is required';
  end if;

  if p_month is null or p_month !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'Invalid month. Expected YYYY-MM';
  end if;

  if not public.cl_user_in_group(p_group_id) then
    raise exception 'You are not a member of this group';
  end if;

  v_start := (p_month || '-01')::date;
  v_end := (v_start + interval '1 month')::date;

  select
    coalesce(fp.opening_balance, 0),
    coalesce(fp.status, 'open')
  into
    v_opening,
    v_period_status
  from public.financial_periods fp
  where fp.group_id = p_group_id
    and fp.month = p_month
  limit 1;

  if not found then
    select coalesce(
      (
        select fp.closing_balance
        from public.financial_periods fp
        where fp.group_id = p_group_id
          and lower(fp.status) = 'closed'
          and fp.month < p_month
        order by fp.month desc
        limit 1
      ),
      (
        select mc.closing_balance
        from public.monthly_closings mc
        where mc.group_id = p_group_id
          and mc.closing_month < v_start
        order by mc.closing_month desc
        limit 1
      ),
      g.opening_balance,
      0
    )
    into v_opening
    from public.groups g
    where g.id = p_group_id;
  end if;

  select
    coalesce(sum(s.monthly_due), 0),
    coalesce(sum(s.applied_this_month), 0),
    coalesce(sum(s.carry_forward), 0),
    coalesce(sum(s.current_outstanding), 0),
    count(*),
    count(*) filter (
      where lower(s.status) in ('paid', 'credit')
    ),
    count(*) filter (
      where lower(s.status) = 'partial'
    ),
    count(*) filter (
      where lower(s.status) = 'outstanding'
    )
  into
    v_expected,
    v_applied,
    v_credit,
    v_outstanding,
    v_active,
    v_paid,
    v_partial,
    v_unpaid
  from public.get_canonical_member_monthly_status(
    p_group_id,
    p_month
  ) s;

  select coalesce(sum(c.amount), 0)
  into v_collected
  from public.contributions c
  where c.group_id = p_group_id
    and c.contribution_date >= v_start
    and c.contribution_date < v_end;

  select coalesce(sum(e.amount), 0)
  into v_expenses
  from public.expenses e
  where e.group_id = p_group_id
    and e.date >= v_start
    and e.date < v_end
    and lower(coalesce(e.approval_status, '')) = 'approved';

  if v_expected > 0 then
    v_rate := least((v_applied / v_expected) * 100, 100);
  end if;

  v_closing :=
    v_opening
    + v_collected
    - v_expenses;

  return jsonb_build_object(
    'month', p_month,
    'period_status', v_period_status,
    'opening_balance', v_opening,
    'expected_monthly_contributions', v_expected,
    'total_contributions_collected', v_collected,
    'applied_this_month', v_applied,
    'carry_forward', v_credit,
    'current_outstanding', v_outstanding,
    'approved_expenses', v_expenses,
    'closing_balance', v_closing,
    'active_members', v_active,
    'members_paid', v_paid,
    'partial_payments', v_partial,
    'outstanding_members', v_unpaid,
    'collection_rate', round(v_rate, 2)
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.get_monthly_contribution_progress(p_group_id uuid, p_month text)
 RETURNS TABLE(month text, expected numeric, collected numeric, percentage numeric, members_total bigint, members_contributed bigint, participation_percentage numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v_auth_group uuid;

begin

  v_auth_group :=
    public.my_group_id();


  if v_auth_group is null
     or p_group_id <> v_auth_group then

    raise exception
      'You do not have access to this group.';

  end if;


  return query

  with active as (

    select
      count(*)::bigint as total

    from public.members m

    where m.group_id = p_group_id

      and lower(
        coalesce(
          m.status,
          'active'
        )
      ) = 'active'

      and lower(
        coalesce(
          m.onboarding_status,
          'active'
        )
      ) = 'active'

  ),

  payments as (

    select

      coalesce(
        sum(c.amount),
        0
      )::numeric as collected,

      count(
        distinct c.member_id
      )::bigint as members_contributed

    from public.contributions c

    where c.group_id = p_group_id

      and c.month = p_month

      and lower(
        coalesce(
          c.contribution_type,
          ''
        )
      ) = 'monthly'

  ),

  expected as (

    select

      coalesce(
        sum(
          case

            when date_trunc(
              'month',
              m.join_date
            )::date
            <= to_date(
              p_month || '-01',
              'YYYY-MM-DD'
            )

            then g.monthly_contribution

            else 0

          end
        ),
        0
      )::numeric as expected

    from public.members m

    join public.groups g
      on g.id = m.group_id

    where m.group_id = p_group_id

      and lower(
        coalesce(
          m.status,
          'active'
        )
      ) = 'active'

      and lower(
        coalesce(
          m.onboarding_status,
          'active'
        )
      ) = 'active'

  )

  select

    p_month,

    e.expected,

    p.collected,

    case

      when e.expected <= 0
        then 0

      else round(
        least(
          100,
          (
            p.collected
            /
            e.expected
          ) * 100
        ),
        2
      )

    end,

    a.total,

    p.members_contributed,

    case

      when a.total <= 0
        then 0

      else round(
        (
          p.members_contributed::numeric
          /
          a.total
        ) * 100,
        2
      )

    end

  from active a
  cross join payments p
  cross join expected e;

end;

$function$


CREATE OR REPLACE FUNCTION public.get_monthly_contribution_status(p_group_id uuid, p_month text)
 RETURNS TABLE(member_id uuid, member_number text, member_name text, monthly_due numeric, previous_outstanding numeric, previous_credit numeric, current_month_payment numeric, applied_this_month numeric, carry_forward numeric, current_outstanding numeric, total_paid_to_date numeric, total_due_to_date numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v_auth_group uuid;

  v_month_date date;

begin

  v_auth_group :=
    public.my_group_id();


  if v_auth_group is null then

    raise exception
      'No active member group found.';

  end if;


  if p_group_id <> v_auth_group then

    raise exception
      'You do not have access to this group.';

  end if;


  if p_month is null
     or p_month !~ '^[0-9]{4}-[0-9]{2}$' then

    raise exception
      'Month must use YYYY-MM format.';

  end if;


  v_month_date :=
    to_date(
      p_month || '-01',
      'YYYY-MM-DD'
    );


  return query

  with active_members as (

    select

      m.id,

      m.member_number,

      m.name,

      g.monthly_contribution,

      greatest(
        date_trunc(
          'month',
          m.join_date
        )::date,
        date '1900-01-01'
      ) as join_month

    from public.members m

    join public.groups g
      on g.id = m.group_id

    where m.group_id = p_group_id

      and lower(
        coalesce(
          m.status,
          'active'
        )
      ) = 'active'

      and lower(
        coalesce(
          m.onboarding_status,
          'active'
        )
      ) = 'active'

      and date_trunc(
        'month',
        m.join_date
      )::date <= v_month_date

  ),

  member_due as (

    select

      am.*,

      (
        greatest(
          0,
          (
            (
              extract(
                year
                from age(
                  v_month_date,
                  am.join_month
                )
              )::integer
              * 12
            )
            +
            extract(
              month
              from age(
                v_month_date,
                am.join_month
              )
            )::integer
            + 1
          )
        )
        * coalesce(
          am.monthly_contribution,
          0
        )
      )::numeric
      as total_due

    from active_members am

  ),

  payment_totals as (

    select

      c.member_id,

      coalesce(
        sum(
          case
            when c.month < p_month
            then c.amount
            else 0
          end
        ),
        0
      )::numeric
      as previous_paid,

      coalesce(
        sum(
          case
            when c.month = p_month
            then c.amount
            else 0
          end
        ),
        0
      )::numeric
      as current_paid,

      coalesce(
        sum(c.amount),
        0
      )::numeric
      as total_paid

    from public.contributions c

    where c.group_id = p_group_id

      and lower(
        coalesce(
          c.contribution_type,
          ''
        )
      ) = 'monthly'

      and c.month <= p_month

    group by
      c.member_id

  ),

  previous_due as (

    select

      md.*,

      greatest(
        0,

        (
          md.total_due
          -
          md.monthly_due
        )
      )::numeric
      as due_before_current

    from (

      select

        md0.*,

        (
          greatest(
            0,

            (
              (
                extract(
                  year
                  from age(
                    v_month_date,
                    md0.join_month
                  )
                )::integer
                * 12
              )
              +
              extract(
                month
                from age(
                  v_month_date,
                  md0.join_month
                )
              )::integer
              + 1
            )
          )
          * coalesce(
            md0.monthly_contribution,
            0
          )
        )::numeric
        as total_due

      from active_members md0

    ) md

  ),

  calculations as (

    select

      md.id,

      md.member_number,

      md.name,

      coalesce(
        md.monthly_contribution,
        0
      )::numeric
      as monthly_due,

      greatest(
        0,

        md.total_due
        -
        md.monthly_due
        -
        coalesce(
          pt.previous_paid,
          0
        )

      )::numeric
      as previous_outstanding,

      greatest(
        0,

        coalesce(
          pt.previous_paid,
          0
        )
        -
        (
          md.total_due
          -
          md.monthly_due
        )

      )::numeric
      as previous_credit,

      coalesce(
        pt.current_paid,
        0
      )::numeric
      as current_month_payment,

      greatest(
        0,

        least(
          md.monthly_due,

          greatest(
            0,

            greatest(
              0,

              coalesce(
                pt.previous_paid,
                0
              )
              -
              (
                md.total_due
                -
                md.monthly_due
              )
            )
            +
            coalesce(
              pt.current_paid,
              0
            )

          )

        )

      )::numeric
      as applied_this_month,

      greatest(
        0,

        greatest(
          0,

          greatest(
            0,

            coalesce(
              pt.previous_paid,
              0
            )
            -
            (
              md.total_due
              -
              md.monthly_due
            )

          )
          +
          coalesce(
            pt.current_paid,
            0
          )

        )
        -
        md.monthly_due

      )::numeric
      as carry_forward,

      greatest(
        0,

        md.total_due
        -
        coalesce(
          pt.total_paid,
          0
        )

      )::numeric
      as current_outstanding,

      coalesce(
        pt.total_paid,
        0
      )::numeric
      as total_paid_to_date,

      md.total_due

    from member_due md

    left join payment_totals pt
      on pt.member_id = md.id

  )

  select

    c.id,

    c.member_number,

    c.name,

    c.monthly_due,

    c.previous_outstanding,

    c.previous_credit,

    c.current_month_payment,

    c.applied_this_month,

    c.carry_forward,

    c.current_outstanding,

    c.total_paid_to_date,

    c.total_due,

    case

      when c.current_outstanding <= 0
        and c.carry_forward > 0
        then 'credit'

      when c.current_outstanding <= 0
        then 'paid'

      when c.current_month_payment > 0
        then 'partial'

      else 'outstanding'

    end

  from calculations c

  order by
    c.name;

end;

$function$


CREATE OR REPLACE FUNCTION public.get_monthly_financial_report(p_group_id uuid, p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  return public.get_monthly_accounting_summary(p_group_id, p_month);
end;
$function$


-- STAGE ONLY: production function definitions; ordinal rows 141-150 of 201.
-- Captured read-only on 2026-10-14. Alphabetical order is NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects require separate reconciliation.

CREATE OR REPLACE FUNCTION public.get_my_active_contribution_initiatives()
 RETURNS TABLE(initiative_id uuid, group_id uuid, name text, description text, start_date date, closing_date date, amount numeric, frequency text, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT i.id,i.group_id,i.name,i.description,i.start_date,i.closing_date,im.amount,i.frequency,i.status
  FROM public.contribution_initiatives i
  JOIN public.contribution_initiative_members im ON im.initiative_id=i.id
  JOIN public.members m ON m.id=im.member_id
  WHERE i.status='active' AND im.status='active'
    AND auth.uid() IS NOT NULL
    AND (m.user_id=auth.uid() OR m.auth_user_id=auth.uid())
    AND lower(coalesce(m.status,'active'))='active'
    AND current_date BETWEEN i.start_date AND i.closing_date
  ORDER BY i.start_date,i.name;
$function$


CREATE OR REPLACE FUNCTION public.get_my_contribution_position()
 RETURNS TABLE(member_id uuid, group_id uuid, total_due numeric, total_allocated numeric, arrears numeric, credit numeric, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH target_member AS (
  SELECT m.id, m.group_id
  FROM public.members m
  WHERE auth.uid() IS NOT NULL
    AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
    AND lower(coalesce(m.status, 'active')) = 'active'
  ORDER BY m.created_at, m.id
  LIMIT 1
),
monthly_types AS (
  SELECT DISTINCT ON (ct.group_id)
    ct.group_id,
    ct.id AS contribution_type_id
  FROM public.contribution_types ct
  WHERE lower(trim(coalesce(ct.code, ''))) = 'monthly'
     OR lower(trim(coalesce(ct.name, ''))) = 'monthly'
  ORDER BY ct.group_id,
    CASE WHEN lower(trim(coalesce(ct.code, ''))) = 'monthly' THEN 0 ELSE 1 END,
    ct.created_at, ct.id
),
current_obligation_totals AS (
  SELECT
    o.member_id,
    o.group_id,
    coalesce(sum(o.due_amount), 0)::numeric AS current_due
  FROM public.contribution_obligations o
  JOIN monthly_types mt
    ON mt.group_id = o.group_id
   AND mt.contribution_type_id = o.contribution_type_id
  JOIN target_member tm
    ON tm.id = o.member_id
   AND tm.group_id = o.group_id
  WHERE o.obligation_month <= date_trunc('month', CURRENT_DATE)::date
  GROUP BY o.member_id, o.group_id
),
all_obligation_totals AS (
  SELECT
    o.member_id,
    o.group_id,
    coalesce(sum(o.due_amount), 0)::numeric AS total_due
  FROM public.contribution_obligations o
  JOIN monthly_types mt
    ON mt.group_id = o.group_id
   AND mt.contribution_type_id = o.contribution_type_id
  JOIN target_member tm
    ON tm.id = o.member_id
   AND tm.group_id = o.group_id
  GROUP BY o.member_id, o.group_id
),
allocation_totals AS (
  SELECT
    o.member_id,
    o.group_id,
    coalesce(sum(a.amount), 0)::numeric AS total_allocated,
    coalesce(
      sum(
        CASE
          WHEN o.obligation_month <= date_trunc('month', CURRENT_DATE)::date
          THEN a.amount
          ELSE 0
        END
      ),
      0
    )::numeric AS current_allocated
  FROM public.contribution_allocations a
  JOIN public.contribution_obligations o
    ON o.id = a.obligation_id
  JOIN monthly_types mt
    ON mt.group_id = o.group_id
   AND mt.contribution_type_id = o.contribution_type_id
  JOIN target_member tm
    ON tm.id = o.member_id
   AND tm.group_id = o.group_id
  GROUP BY o.member_id, o.group_id
),
payment_totals AS (
  SELECT
    c.member_id,
    coalesce(
      sum(c.amount - coalesce(pa.allocated_amount, 0)),
      0
    )::numeric AS credit
  FROM public.contributions c
  JOIN target_member tm
    ON tm.id = c.member_id
  LEFT JOIN (
    SELECT
      a.payment_id,
      coalesce(sum(a.amount), 0)::numeric AS allocated_amount
    FROM public.contribution_allocations a
    GROUP BY a.payment_id
  ) pa
    ON pa.payment_id = c.id
  WHERE lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
  GROUP BY c.member_id
)
SELECT
  tm.id AS member_id,
  tm.group_id,
  coalesce(aot.total_due, 0)::numeric(14,2) AS total_due,
  coalesce(at.total_allocated, 0)::numeric(14,2) AS total_allocated,
  greatest(
    coalesce(cot.current_due, 0) - coalesce(at.current_allocated, 0),
    0
  )::numeric(14,2) AS arrears,
  greatest(coalesce(pt.credit, 0), 0)::numeric(14,2) AS credit,
  CASE
    WHEN greatest(
      coalesce(cot.current_due, 0) - coalesce(at.current_allocated, 0),
      0
    ) > 0 THEN 'ARREARS'
    WHEN greatest(coalesce(pt.credit, 0), 0) > 0 THEN 'CREDIT'
    ELSE 'UP_TO_DATE'
  END AS status
FROM target_member tm
LEFT JOIN all_obligation_totals aot
  ON aot.member_id = tm.id
 AND aot.group_id = tm.group_id
LEFT JOIN current_obligation_totals cot
  ON cot.member_id = tm.id
 AND cot.group_id = tm.group_id
LEFT JOIN allocation_totals at
  ON at.member_id = tm.id
 AND at.group_id = tm.group_id
LEFT JOIN payment_totals pt
  ON pt.member_id = tm.id
$function$


CREATE OR REPLACE FUNCTION public.get_my_group()
 RETURNS groups
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT g.*
  FROM public.groups g
  JOIN public.members m ON m.group_id = g.id
  WHERE (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
    AND lower(coalesce(m.status, 'active')) = 'active'
  ORDER BY m.created_at
  LIMIT 1;
$function$


CREATE OR REPLACE FUNCTION public.get_my_groups()
 RETURNS TABLE(group_id uuid, group_name text, role text, category text, monthly_contribution numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select g.id, g.name, m.role, g.category, g.monthly_contribution
  from public.members m
  join public.groups g on g.id = m.group_id
  where (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
    and lower(coalesce(m.status,'active')) = 'active'
    and lower(coalesce(m.onboarding_status,'active')) = 'active'
  order by m.created_at;
$function$


CREATE OR REPLACE FUNCTION public.get_my_member()
 RETURNS members
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.*
  FROM public.members m
  WHERE (
    m.user_id = auth.uid()
    OR m.auth_user_id = auth.uid()
  )
  AND lower(coalesce(m.status, 'active')) = 'active'
  ORDER BY m.created_at
  LIMIT 1;
$function$


CREATE OR REPLACE FUNCTION public.get_platform_admin_applications()
 RETURNS TABLE(application_id uuid, group_name text, category text, description text, admin_name text, admin_phone text, email text, country text, location text, town text, status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ga.id,
    ga.group_name,
    ga.category,
    ga.description,
    ga.admin_name,
    ga.admin_phone,
    ga.email,
    ga.country,
    ga.location,
    ga.town,
    ga.status,
    ga.created_at
  FROM public.group_applications AS ga
  WHERE ga.status IN ('pending', 'under_review')
  ORDER BY
    ga.created_at ASC,
    ga.id ASC;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_platform_admin_overview()
 RETURNS TABLE(groups_total bigint, groups_created_this_month bigint, members_total bigint, members_active bigint, members_with_login bigint, members_without_login bigint, onboarding_pending bigint, onboarding_invited bigint, onboarding_active bigint, onboarding_suspended bigint, applications_pending bigint, applications_under_review bigint, applications_approved bigint, applications_rejected bigint, subscriptions_active bigint, subscriptions_pending bigint, subscriptions_suspended bigint, subscriptions_cancelled bigint, subscriptions_expired bigint, invoices_paid bigint, invoices_unpaid bigint, subscription_payments_total bigint, subscription_revenue_total numeric, generated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Platform Admin access required';
    END IF;
    RETURN QUERY
    SELECT
        (SELECT count(*)::bigint FROM public.groups),
        (SELECT count(*)::bigint FROM public.groups WHERE created_at >= date_trunc('month', now()) AND created_at < date_trunc('month', now()) + interval '1 month'),
        (SELECT count(*)::bigint FROM public.members),
        (SELECT count(*)::bigint FROM public.members WHERE status = 'active'),
        (SELECT count(*)::bigint FROM public.members WHERE auth_user_id IS NOT NULL),
        (SELECT count(*)::bigint FROM public.members WHERE auth_user_id IS NULL),
        (SELECT count(*)::bigint FROM public.members WHERE onboarding_status = 'pending'),
        (SELECT count(*)::bigint FROM public.members WHERE onboarding_status = 'invited'),
        (SELECT count(*)::bigint FROM public.members WHERE onboarding_status = 'active'),
        (SELECT count(*)::bigint FROM public.members WHERE onboarding_status = 'suspended'),
        (SELECT count(*)::bigint FROM public.group_applications WHERE status = 'pending'),
        (SELECT count(*)::bigint FROM public.group_applications WHERE status = 'under_review'),
        (SELECT count(*)::bigint FROM public.group_applications WHERE status = 'approved'),
        (SELECT count(*)::bigint FROM public.group_applications WHERE status = 'rejected'),
        (SELECT count(*)::bigint FROM public.group_subscriptions WHERE status = 'active'),
        (SELECT count(*)::bigint FROM public.group_subscriptions WHERE status = 'pending'),
        (SELECT count(*)::bigint FROM public.group_subscriptions WHERE status = 'suspended'),
        (SELECT count(*)::bigint FROM public.group_subscriptions WHERE status = 'cancelled'),
        (SELECT count(*)::bigint FROM public.group_subscriptions WHERE status = 'expired'),
        (SELECT count(*)::bigint FROM public.subscription_invoices WHERE status = 'paid'),
        (SELECT count(*)::bigint FROM public.subscription_invoices WHERE status IN ('draft','issued','partially_paid','overdue')),
        (SELECT count(*)::bigint FROM public.subscription_payments),
        (SELECT COALESCE(SUM(amount), 0)::numeric FROM public.subscription_payments WHERE status = 'confirmed'),
        now();
END;
$function$


CREATE OR REPLACE FUNCTION public.guard_expense_approval_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_table_owner text;
BEGIN
  SELECT pg_get_userbyid(c.relowner) INTO v_table_owner FROM pg_class c WHERE c.oid = 'public.expenses'::regclass;
  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status IS DISTINCT FROM 'pending' AND current_user <> v_table_owner THEN
      RAISE EXCEPTION 'Expenses must start pending; approval status is managed by the approval workflow';
    END IF;
  ELSIF NEW.approval_status IS DISTINCT FROM OLD.approval_status AND current_user <> v_table_owner THEN
    RAISE EXCEPTION 'Expense approval status can only be changed through the approval workflow';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.invite_member(p_group_id uuid, p_name text, p_phone text, p_email text DEFAULT NULL::text, p_role text DEFAULT 'member'::text)
 RETURNS TABLE(member_id uuid, member_number text, membership_number text, invite_email text, onboarding_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_admin uuid; v_num text; v_id uuid; v_email text;
begin
 if v_uid is null then raise exception 'Not authenticated'; end if;
 select m.id into v_admin from public.members m where m.group_id=p_group_id and (m.user_id=v_uid or m.auth_user_id=v_uid) and m.role in ('admin','chairperson') and m.status='active' and m.onboarding_status='active' limit 1;
 if v_admin is null then raise exception 'Only an active group administrator can invite members'; end if;
 if coalesce(trim(p_name),'')='' then raise exception 'Member name is required'; end if;
 if coalesce(trim(p_phone),'')='' then raise exception 'Member phone is required'; end if;
 if p_role not in ('chairperson','admin','treasurer','secretary','member') then raise exception 'Invalid member role'; end if;
 v_num:=public.generate_member_number(p_group_id);
 v_email:=nullif(lower(trim(coalesce(p_email,''))),'');
 insert into public.members(group_id,user_id,auth_user_id,member_number,membership_number,name,phone,email,role,status,onboarding_status,join_date,invited_at)
 values(p_group_id,null,null,v_num,v_num,trim(p_name),trim(p_phone),v_email,p_role,'active','pending',current_date,now()) returning id into v_id;
 return query select v_id,v_num,v_num,v_email,'pending'::text;
end; $function$


CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
      and active = true
  );
$function$


