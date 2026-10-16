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
