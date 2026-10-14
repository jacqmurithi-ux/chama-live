-- STAGE ONLY: production function definitions; ordinal rows 31-40 of 201.
-- Definitions captured read-only on 2026-10-14. Ordering is alphabetical, NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects must be reconciled separately.

CREATE OR REPLACE FUNCTION public.check_application_status(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_group_name text;
  v_member_email text;
  v_onboarding_status text;
  v_member_status text;
  v_application_status text;
BEGIN
  v_email := lower(trim(coalesce(p_email, '')));

  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'Please enter the registered administrator email address.'
    );
  END IF;

  /*
     Only the registered group administrator is eligible.
     Do not return internal IDs or any other member/group data.
  */
  SELECT
    g.name,
    m.email,
    lower(trim(coalesce(m.onboarding_status, ''))),
    lower(trim(coalesce(m.status, '')))
  INTO
    v_group_name,
    v_member_email,
    v_onboarding_status,
    v_member_status
  FROM public.members AS m
  INNER JOIN public.groups AS g
    ON g.id = m.group_id
  WHERE lower(trim(coalesce(m.email, ''))) = v_email
    AND lower(trim(coalesce(m.role, ''))) IN (
      'admin',
      'administrator',
      'group_admin',
      'group administrator',
      'chairperson'
    )
  ORDER BY m.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_group_name IS NULL THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'No registered group administrator application was found for this email address.'
    );
  END IF;

  /*
     Normalize the database states into the four statuses
     exposed by the Account Review page.
  */
  IF v_member_status = 'suspended' THEN
    v_application_status := 'suspended';

  ELSIF v_member_status = 'rejected'
     OR v_onboarding_status = 'rejected' THEN
    v_application_status := 'rejected';

  ELSIF v_onboarding_status IN ('approved', 'active')
     OR v_member_status = 'active' THEN
    v_application_status := 'active';

  ELSE
    v_application_status := 'pending';
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'group_name', v_group_name,
    'masked_email',
      CASE
        WHEN position('@' IN v_member_email) > 1 THEN
          left(split_part(v_member_email, '@', 1), 1)
          || repeat('*', greatest(length(split_part(v_member_email, '@', 1)) - 1, 1))
          || '@'
          || split_part(v_member_email, '@', 2)
        ELSE
          '***'
      END,
    'onboarding_status',
      CASE
        WHEN v_onboarding_status = '' THEN NULL
        ELSE v_onboarding_status
      END,
    'application_status', v_application_status
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_2b_accounting_lock(p_group_id uuid, p_month text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_group_id IS NULL
     OR p_month IS NULL
     OR p_month !~ '^[0-9]{4}-[0-9]{2}$'
  THEN
    RAISE EXCEPTION 'Group and month YYYY-MM are required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:accounting:' || p_group_id::text || ':' || p_month,
      0
    )
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_2b_accounting_lock_range(p_group_id uuid, p_start_month date, p_end_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_month date;
BEGIN
  IF p_group_id IS NULL
     OR p_start_month IS NULL
     OR p_end_month IS NULL
     OR date_trunc('month',p_start_month)::date > date_trunc('month',p_end_month)::date
  THEN
    RAISE EXCEPTION 'Valid accounting month range is required';
  END IF;

  FOR v_month IN
    SELECT gs::date
    FROM pg_catalog.generate_series(
      date_trunc('month',p_start_month)::date,
      date_trunc('month',p_end_month)::date,
      interval '1 month'
    ) AS gs
    ORDER BY gs
  LOOP
    PERFORM public.cl_2b_accounting_lock(
      p_group_id,
      to_char(v_month,'YYYY-MM')
    );
  END LOOP;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_2b_decompose_obligation(p_parent_obligation_id uuid)
 RETURNS TABLE(parent_obligation_id uuid, residual_obligation_id uuid, status text, original_due_amount numeric, historical_allocated numeric, residual_due_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller_uid uuid := auth.uid();
  v_parent record;
  v_member record;
  v_residual record;
  v_group_id uuid;
  v_member_id uuid;
  v_residual_obligation_id uuid;
  v_caller_rows integer := 0;
  v_has_active boolean := false;
  v_has_onboarded boolean := false;
  v_has_treasurer boolean := false;
  v_self_target boolean := false;
  v_historical_allocated numeric := 0;
  v_outstanding numeric := 0;
  v_residual_count integer := 0;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF p_parent_obligation_id IS NULL THEN
    RAISE EXCEPTION 'PARENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT o.id,o.group_id,o.member_id,o.contribution_type_id,o.rule_id,
         o.obligation_month,o.due_amount,o.period_id,o.component_kind,
         o.lifecycle_state,o.parent_obligation_id
  INTO v_parent
  FROM public.contribution_obligations o
  WHERE o.id = p_parent_obligation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PARENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_group_id := v_parent.group_id;
  v_member_id := v_parent.member_id;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' || v_group_id::text || ':' || v_member_id::text,0
    )
  );

  SELECT o.id,o.group_id,o.member_id,o.contribution_type_id,o.rule_id,
         o.obligation_month,o.due_amount,o.period_id,o.component_kind,
         o.lifecycle_state,o.parent_obligation_id
  INTO v_parent
  FROM public.contribution_obligations o
  WHERE o.id = p_parent_obligation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PARENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  FOR v_member IN
    SELECT m.id,m.user_id,m.auth_user_id,m.role,m.status,m.onboarding_status
    FROM public.members m
    WHERE m.group_id = v_parent.group_id
      AND (m.user_id = v_caller_uid OR m.auth_user_id = v_caller_uid)
    ORDER BY m.id
    FOR UPDATE
  LOOP
    v_caller_rows := v_caller_rows + 1;

    IF v_member.id = v_parent.member_id THEN
      v_self_target := true;
    END IF;

    IF lower(coalesce(v_member.status,'active')) = 'active' THEN
      v_has_active := true;
    END IF;

    IF lower(coalesce(v_member.onboarding_status,'active')) = 'active' THEN
      v_has_onboarded := true;
    END IF;

    IF lower(coalesce(v_member.status,'active')) = 'active'
       AND lower(coalesce(v_member.onboarding_status,'active')) = 'active'
       AND lower(coalesce(v_member.role,'member')) = 'treasurer' THEN
      v_has_treasurer := true;
    END IF;
  END LOOP;

  IF v_caller_rows = 0 THEN
    RAISE EXCEPTION 'UNAUTHORIZED_GROUP' USING ERRCODE = '42501';
  END IF;

  IF v_self_target THEN
    RAISE EXCEPTION 'SELF_CONFIGURATION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF NOT v_has_active THEN
    RAISE EXCEPTION 'CALLER_NOT_ACTIVE' USING ERRCODE = '42501';
  END IF;

  IF NOT v_has_onboarded THEN
    RAISE EXCEPTION 'CALLER_NOT_ONBOARDED' USING ERRCODE = '42501';
  END IF;

  IF NOT v_has_treasurer THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE' USING ERRCODE = '42501';
  END IF;

  IF v_parent.component_kind <> 'PARENT'
     OR v_parent.parent_obligation_id IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_PARENT_COMPONENT' USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
  INTO v_residual_count
  FROM public.contribution_obligations r
  WHERE r.parent_obligation_id = v_parent.id
    AND r.component_kind = 'RESIDUAL';

  IF v_parent.lifecycle_state = 'DECOMPOSED' THEN
    IF v_residual_count <> 1 THEN
      RAISE EXCEPTION 'DECOMPOSED_PARENT_MISSING_RESIDUAL' USING ERRCODE = '23514';
    END IF;

    SELECT r.id,r.group_id,r.member_id,r.contribution_type_id,r.rule_id,
           r.obligation_month,r.due_amount,r.period_id,r.lifecycle_state
    INTO v_residual
    FROM public.contribution_obligations r
    WHERE r.parent_obligation_id = v_parent.id
      AND r.component_kind = 'RESIDUAL';

    IF v_residual.lifecycle_state <> 'ACTIVE'
       OR v_residual.group_id <> v_parent.group_id
       OR v_residual.member_id <> v_parent.member_id
       OR v_residual.contribution_type_id <> v_parent.contribution_type_id
       OR v_residual.obligation_month <> v_parent.obligation_month
       OR v_residual.period_id IS DISTINCT FROM v_parent.period_id THEN
      RAISE EXCEPTION 'INVALID_RESIDUAL_LINEAGE' USING ERRCODE = '23514';
    END IF;

    SELECT coalesce(sum(a.amount),0)::numeric
    INTO v_historical_allocated
    FROM public.contribution_allocations a
    WHERE a.obligation_id = v_parent.id;

    IF v_historical_allocated < 0
       OR v_historical_allocated > v_parent.due_amount
       OR v_historical_allocated + v_residual.due_amount <> v_parent.due_amount THEN
      RAISE EXCEPTION 'RESIDUAL_CONSERVATION_FAILURE' USING ERRCODE = '23514';
    END IF;

    RETURN QUERY
    SELECT v_parent.id,v_residual.id,'ALREADY_DECOMPOSED'::text,
           v_parent.due_amount,v_historical_allocated,v_residual.due_amount;
    RETURN;
  END IF;

  IF v_parent.lifecycle_state <> 'ACTIVE' THEN
    RAISE EXCEPTION 'INVALID_PARENT_LIFECYCLE' USING ERRCODE = '23514';
  END IF;

  IF v_residual_count <> 0 THEN
    RAISE EXCEPTION 'ACTIVE_PARENT_HAS_RESIDUAL' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(sum(a.amount),0)::numeric
  INTO v_historical_allocated
  FROM public.contribution_allocations a
  WHERE a.obligation_id = v_parent.id;

  IF v_historical_allocated < 0
     OR v_historical_allocated > v_parent.due_amount THEN
    RAISE EXCEPTION 'PARENT_ALLOCATION_INVARIANT_FAILURE' USING ERRCODE = '23514';
  END IF;

  v_outstanding := v_parent.due_amount - v_historical_allocated;

  IF v_outstanding <= 0 THEN
    RAISE EXCEPTION 'PARENT_HAS_NO_OUTSTANDING_AMOUNT' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.contribution_obligations (
    group_id,member_id,obligation_month,due_amount,
    contribution_type_id,rule_id,period_id,
    component_kind,lifecycle_state,parent_obligation_id
  )
  VALUES (
    v_parent.group_id,v_parent.member_id,v_parent.obligation_month,v_outstanding,
    v_parent.contribution_type_id,v_parent.rule_id,v_parent.period_id,
    'RESIDUAL','ACTIVE',v_parent.id
  )
  RETURNING id INTO v_residual_obligation_id;

  UPDATE public.contribution_obligations
  SET lifecycle_state = 'DECOMPOSED'
  WHERE id = v_parent.id
    AND component_kind = 'PARENT'
    AND lifecycle_state = 'ACTIVE'
    AND parent_obligation_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PARENT_STATE_TRANSITION_FAILED' USING ERRCODE = '40001';
  END IF;

  SELECT count(*)
  INTO v_residual_count
  FROM public.contribution_obligations r
  WHERE r.parent_obligation_id = v_parent.id
    AND r.component_kind = 'RESIDUAL';

  IF v_residual_count <> 1 THEN
    RAISE EXCEPTION 'RESIDUAL_IDENTITY_FAILURE' USING ERRCODE = '23514';
  END IF;

  SELECT r.id,r.due_amount,r.group_id,r.member_id,r.contribution_type_id,
         r.obligation_month,r.period_id,r.lifecycle_state
  INTO v_residual
  FROM public.contribution_obligations r
  WHERE r.parent_obligation_id = v_parent.id
    AND r.component_kind = 'RESIDUAL';

  IF v_residual.lifecycle_state <> 'ACTIVE'
     OR v_residual.group_id <> v_parent.group_id
     OR v_residual.member_id <> v_parent.member_id
     OR v_residual.contribution_type_id <> v_parent.contribution_type_id
     OR v_residual.obligation_month <> v_parent.obligation_month
     OR v_residual.period_id IS DISTINCT FROM v_parent.period_id
     OR v_residual.due_amount <> v_outstanding THEN
    RAISE EXCEPTION 'INVALID_RESIDUAL_LINEAGE' USING ERRCODE = '23514';
  END IF;

  IF v_historical_allocated + v_residual.due_amount <> v_parent.due_amount THEN
    RAISE EXCEPTION 'RESIDUAL_CONSERVATION_FAILURE' USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT v_parent.id,v_residual.id,'DECOMPOSED'::text,
         v_parent.due_amount,v_historical_allocated,v_residual.due_amount;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_2b_record_contribution(p_group_id uuid, p_member_id uuid, p_amount numeric, p_contribution_type text, p_contribution_date date, p_payment_method text, p_reference text, p_notes text, p_goal_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_payment_id uuid;
BEGIN
  IF p_idempotency_key IS NULL
     OR nullif(trim(p_idempotency_key),'') IS NULL
  THEN
    RAISE EXCEPTION 'Payment idempotency key is required';
  END IF;

  BEGIN
    v_payment_id := trim(p_idempotency_key)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION
      'Payment idempotency key must be a valid UUID';
  END;

  RETURN public.cl_2b_record_contribution(
    p_payment_id=>v_payment_id,
    p_group_id=>p_group_id,
    p_member_id=>p_member_id,
    p_amount=>p_amount,
    p_contribution_date=>p_contribution_date,
    p_contribution_type=>p_contribution_type,
    p_payment_method=>p_payment_method,
    p_reference=>p_reference,
    p_mpesa_reference=>NULL,
    p_goal_id=>p_goal_id,
    p_notes=>p_notes
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_2b_record_contribution(p_payment_id uuid, p_group_id uuid, p_member_id uuid, p_amount numeric, p_contribution_date date, p_contribution_type text DEFAULT 'monthly'::text, p_payment_method text DEFAULT 'M-Pesa'::text, p_reference text DEFAULT NULL::text, p_mpesa_reference text DEFAULT NULL::text, p_goal_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_payment_month text;
  v_payment_month_date date;
  v_rebuild_start date;
  v_rebuild_horizon date;
  v_existing public.contributions%rowtype;
  v_period public.financial_periods%rowtype;
  v_reference text;
  v_mpesa_reference text;
  v_input_reference text;
  v_input_mpesa_reference text;
  v_existing_reference text;
  v_existing_mpesa_reference text;
  v_existing_effective_mpesa_reference text;
  v_initial_lock_end date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment idempotency key is required';
  END IF;

  IF p_group_id IS NULL OR p_member_id IS NULL THEN
    RAISE EXCEPTION 'Group and member are required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Contribution amount must be greater than zero';
  END IF;

  IF p_contribution_date IS NULL THEN
    RAISE EXCEPTION 'Contribution date is required';
  END IF;

  IF lower(trim(coalesce(p_contribution_type,''))) <> 'monthly' THEN
    RAISE EXCEPTION '2B only supports monthly contributions';
  END IF;

  IF p_payment_method IS NULL
     OR p_payment_method NOT IN ('M-Pesa','Cash','Bank transfer')
  THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF NOT public.cl_user_has_role(
    p_group_id,
    ARRAY['admin','chairperson','secretary','treasurer']::text[]
  ) THEN
    RAISE EXCEPTION 'Finance authorization required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.id=p_member_id
      AND m.group_id=p_group_id
  ) THEN
    RAISE EXCEPTION 'Member does not belong to the supplied group';
  END IF;

  v_payment_month:=to_char(p_contribution_date,'YYYY-MM');
  v_payment_month_date:=date_trunc('month',p_contribution_date)::date;

  -- cl_2b_refresh_member rewrites all allocations for the member through
  -- its supplied horizon. Determine the safe horizon before locking, then
  -- lock the entire member allocation span before any status decision.
  SELECT greatest(
    p_contribution_date,
    coalesce(
      (
        SELECT max(c.contribution_date)
        FROM public.contributions c
        WHERE c.member_id=p_member_id
          AND lower(trim(coalesce(c.contribution_type,'')))='monthly'
      ),
      p_contribution_date
    ),
    coalesce(
      (
        SELECT max(o.obligation_month)
        FROM public.contribution_obligations o
        WHERE o.member_id=p_member_id
      ),
      p_contribution_date
    )
  )
  INTO v_rebuild_horizon;

  SELECT date_trunc('month',m.join_date)::date
  INTO v_rebuild_start
  FROM public.members m
  WHERE m.id=p_member_id
    AND m.group_id=p_group_id;

  v_rebuild_start:=least(
    coalesce(v_rebuild_start,v_payment_month_date),
    v_payment_month_date
  );

  v_initial_lock_end:=date_trunc('month',v_rebuild_horizon)::date;

  PERFORM public.cl_2b_accounting_lock_range(
    p_group_id,
    v_rebuild_start,
    v_initial_lock_end
  );

  -- Re-read the horizon after acquiring the initial lock envelope.
  -- A concurrent writer may have committed a later payment/obligation
  -- while this transaction was waiting for the shared accounting locks.
  -- Extend only forward, preserving deterministic ascending lock order,
  -- before refresh can delete/rebuild the member's allocations.
  SELECT greatest(
    p_contribution_date,
    coalesce(
      (
        SELECT max(c.contribution_date)
        FROM public.contributions c
        WHERE c.member_id=p_member_id
          AND lower(trim(coalesce(c.contribution_type,'')))='monthly'
      ),
      p_contribution_date
    ),
    coalesce(
      (
        SELECT max(o.obligation_month)
        FROM public.contribution_obligations o
        WHERE o.member_id=p_member_id
      ),
      p_contribution_date
    )
  )
  INTO v_rebuild_horizon;

  IF date_trunc('month',v_rebuild_horizon)::date > v_initial_lock_end THEN
    PERFORM public.cl_2b_accounting_lock_range(
      p_group_id,
      (v_initial_lock_end + interval '1 month')::date,
      date_trunc('month',v_rebuild_horizon)::date
    );
  END IF;

  v_period:=public.ensure_financial_period(
    p_group_id,v_payment_month
  );

  IF v_period.id IS NULL THEN
    RAISE EXCEPTION
      'Unable to establish financial period for %',
      v_payment_month;
  END IF;

  IF lower(coalesce(v_period.status,'open'))='closed' THEN
    RAISE EXCEPTION
      'Financial month % is closed. Contributions cannot be changed.',
      v_payment_month;
  END IF;

  v_input_reference:=nullif(trim(p_reference),'');
  v_input_mpesa_reference:=nullif(trim(p_mpesa_reference),'');

  IF p_payment_method='M-Pesa' THEN
    IF v_input_reference IS NOT NULL
       AND v_input_mpesa_reference IS NOT NULL
       AND v_input_reference IS DISTINCT FROM v_input_mpesa_reference
    THEN
      RAISE EXCEPTION 'M-Pesa reference fields do not match';
    END IF;

    v_mpesa_reference:=coalesce(
      v_input_mpesa_reference,v_input_reference
    );
    v_reference:=v_mpesa_reference;
  ELSE
    IF v_input_mpesa_reference IS NOT NULL THEN
      RAISE EXCEPTION
        'M-Pesa reference is only valid for M-Pesa payments';
    END IF;

    v_mpesa_reference:=NULL;
    v_reference:=v_input_reference;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' ||
      p_group_id::text || ':' || p_member_id::text,
      0
    )
  );

  SELECT c.*
  INTO v_existing
  FROM public.contributions c
  WHERE c.id=p_payment_id
  FOR UPDATE;

  IF FOUND THEN
    v_existing_reference:=nullif(trim(v_existing.reference),'');
    v_existing_mpesa_reference:=
      nullif(trim(v_existing.mpesa_reference),'');

    IF p_payment_method='M-Pesa' THEN
      IF v_existing_reference IS NOT NULL
         AND v_existing_mpesa_reference IS NOT NULL
         AND v_existing_reference IS DISTINCT FROM
             v_existing_mpesa_reference
      THEN
        RAISE EXCEPTION
          'Existing M-Pesa payment contains conflicting reference fields';
      END IF;

      v_existing_effective_mpesa_reference:=coalesce(
        v_existing_mpesa_reference,v_existing_reference
      );

      IF v_existing.group_id IS DISTINCT FROM p_group_id
         OR v_existing.member_id IS DISTINCT FROM p_member_id
         OR v_existing.amount IS DISTINCT FROM p_amount
         OR v_existing.contribution_date IS DISTINCT FROM
             p_contribution_date
         OR lower(trim(coalesce(v_existing.contribution_type,'')))
              IS DISTINCT FROM lower(trim(p_contribution_type))
         OR v_existing.payment_method IS DISTINCT FROM p_payment_method
         OR v_existing_effective_mpesa_reference IS DISTINCT FROM
             v_mpesa_reference
         OR v_existing.goal_id IS DISTINCT FROM p_goal_id
         OR v_existing.notes IS DISTINCT FROM p_notes
      THEN
        RAISE EXCEPTION
          'Idempotency key already exists for a different contribution';
      END IF;
    ELSE
      IF v_existing.group_id IS DISTINCT FROM p_group_id
         OR v_existing.member_id IS DISTINCT FROM p_member_id
         OR v_existing.amount IS DISTINCT FROM p_amount
         OR v_existing.contribution_date IS DISTINCT FROM
             p_contribution_date
         OR lower(trim(coalesce(v_existing.contribution_type,'')))
              IS DISTINCT FROM lower(trim(p_contribution_type))
         OR v_existing.payment_method IS DISTINCT FROM p_payment_method
         OR v_existing_reference IS DISTINCT FROM v_reference
         OR v_existing_mpesa_reference IS NOT NULL
         OR v_existing.goal_id IS DISTINCT FROM p_goal_id
         OR v_existing.notes IS DISTINCT FROM p_notes
      THEN
        RAISE EXCEPTION
          'Idempotency key already exists for a different contribution';
      END IF;
    END IF;

    PERFORM public.cl_2b_refresh_member(
      p_member_id,
      date_trunc('month',v_rebuild_horizon)::date
    );

    RETURN jsonb_build_object(
      'success',true,
      'idempotent_replay',true,
      'payment_id',v_existing.id,
      'group_id',v_existing.group_id,
      'member_id',v_existing.member_id,
      'amount',v_existing.amount,
      'contribution_date',v_existing.contribution_date,
      'rebuild_horizon',
        date_trunc('month',v_rebuild_horizon)::date
    );
  END IF;

  INSERT INTO public.contributions (
    id,group_id,member_id,amount,contribution_type,month,
    payment_method,reference,goal_id,notes,mpesa_reference,
    contribution_date
  )
  VALUES (
    p_payment_id,p_group_id,p_member_id,p_amount,'monthly',
    v_payment_month,p_payment_method,v_reference,p_goal_id,p_notes,
    v_mpesa_reference,p_contribution_date
  );

  PERFORM public.cl_2b_refresh_member(
    p_member_id,
    date_trunc('month',v_rebuild_horizon)::date
  );

  RETURN jsonb_build_object(
    'success',true,
    'idempotent_replay',false,
    'payment_id',p_payment_id,
    'group_id',p_group_id,
    'member_id',p_member_id,
    'amount',p_amount,
    'contribution_date',p_contribution_date,
    'contribution_type','monthly',
    'payment_method',p_payment_method,
    'rebuild_horizon',
      date_trunc('month',v_rebuild_horizon)::date
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_2b_refresh_member(p_member_id uuid, p_through_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group_id uuid;
  v_join_month date;
  v_requested_month date;
  v_effective_through_month date;
  v_latest_payment_month date;
  v_latest_obligation_month date;
  v_initial_lock_end date;
  v_monthly_type_id uuid;
  v_financial_start_month date;
  v_earliest_rule_month date;
  v_earliest_obligation_month date;
  v_earliest_payment_month date;
BEGIN
  IF p_member_id IS NULL OR p_through_month IS NULL THEN
    RAISE EXCEPTION 'Member and through month are required';
  END IF;

  v_requested_month := date_trunc('month', p_through_month)::date;

  SELECT m.group_id, date_trunc('month', m.join_date)::date
  INTO v_group_id, v_join_month
  FROM public.members m
  WHERE m.id = p_member_id;

  IF v_group_id IS NULL THEN RETURN; END IF;
  IF v_join_month IS NULL THEN v_join_month = v_requested_month; END IF;

  SELECT ct.id INTO v_monthly_type_id
  FROM public.contribution_types ct
  WHERE ct.group_id = v_group_id
    AND (ct.code = 'monthly' OR lower(trim(ct.name)) = 'monthly')
  ORDER BY CASE WHEN ct.code = 'monthly' THEN 0 ELSE 1 END, ct.created_at, ct.id
  LIMIT 1;

  IF v_monthly_type_id IS NULL THEN
    RAISE EXCEPTION 'Canonical Monthly contribution type is missing';
  END IF;

  SELECT min(date_trunc('month', r.effective_from)::date)
  INTO v_earliest_rule_month
  FROM public.member_contribution_rules r
  WHERE r.group_id = v_group_id AND r.member_id = p_member_id
    AND r.contribution_type_id = v_monthly_type_id AND r.frequency = 'monthly'
    AND r.effective_from IS NOT NULL;

  SELECT min(date_trunc('month', o.obligation_month)::date)
  INTO v_earliest_obligation_month
  FROM public.contribution_obligations o
  WHERE o.group_id = v_group_id AND o.member_id = p_member_id
    AND o.contribution_type_id = v_monthly_type_id;

  SELECT min(date_trunc('month', c.contribution_date)::date)
  INTO v_earliest_payment_month
  FROM public.contributions c
  WHERE c.group_id = v_group_id AND c.member_id = p_member_id
    AND lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
    AND c.contribution_date IS NOT NULL;

  v_financial_start_month := least(
    coalesce(v_earliest_rule_month, v_requested_month),
    coalesce(v_earliest_obligation_month, v_requested_month),
    coalesce(v_earliest_payment_month, v_requested_month),
    v_requested_month
  );

  SELECT max(c.contribution_date) INTO v_latest_payment_month
  FROM public.contributions c
  WHERE c.member_id = p_member_id
    AND lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
    AND c.contribution_date IS NOT NULL;

  SELECT max(o.obligation_month) INTO v_latest_obligation_month
  FROM public.contribution_obligations o
  WHERE o.member_id = p_member_id AND o.contribution_type_id = v_monthly_type_id;

  v_effective_through_month := greatest(
    v_requested_month,
    coalesce(date_trunc('month', v_latest_payment_month)::date, v_requested_month),
    coalesce(v_latest_obligation_month, v_requested_month),
    coalesce((
      SELECT max((date_trunc('month', r.effective_from) + interval '1 month')::date)
      FROM public.member_contribution_rules r
      WHERE r.group_id = v_group_id AND r.member_id = p_member_id
        AND r.contribution_type_id = v_monthly_type_id
        AND r.frequency = 'monthly' AND r.status = 'active'
        AND r.first_period_rule = 'next_full_period'
        AND date_trunc('month', r.effective_from)::date = v_join_month
    ), v_requested_month)
  );

  v_initial_lock_end = v_effective_through_month;

  PERFORM public.cl_2b_accounting_lock_range(
    v_group_id, v_financial_start_month, v_initial_lock_end
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' || v_group_id::text || ':' || p_member_id::text, 0
    )
  );

  INSERT INTO public.contribution_obligations (
    group_id, member_id, contribution_type_id, rule_id, obligation_month, due_amount
  )
  SELECT r.group_id, r.member_id, r.contribution_type_id, r.id, gs::date, r.amount
  FROM public.member_contribution_rules r
  CROSS JOIN LATERAL generate_series(
    CASE WHEN r.first_period_rule = 'next_full_period'
      THEN (date_trunc('month', r.effective_from) + interval '1 month')::date
      ELSE date_trunc('month', r.effective_from)::date END,
    least(
      v_effective_through_month,
      coalesce(date_trunc('month', r.effective_to)::date, v_effective_through_month)
    ),
    interval '1 month'
  ) gs
  WHERE r.group_id = v_group_id AND r.member_id = p_member_id
    AND r.contribution_type_id = v_monthly_type_id
    AND r.frequency = 'monthly' AND r.status = 'active'
    AND date_trunc('month', r.effective_from)::date <= v_effective_through_month
    AND (
      r.effective_to IS NULL
      OR date_trunc('month', r.effective_to)::date >=
        CASE WHEN r.first_period_rule = 'next_full_period'
          THEN (date_trunc('month', r.effective_from) + interval '1 month')::date
          ELSE date_trunc('month', r.effective_from)::date END
    )
  ON CONFLICT (
    group_id, member_id, contribution_type_id, obligation_month
  )
  WHERE component_kind = 'PARENT'
    AND rule_id IS NOT NULL
  DO NOTHING;

  WITH monthly_payments AS (
    SELECT c.id AS payment_id, c.amount::numeric AS amount,
           c.contribution_date, c.created_at
    FROM public.contributions c
    WHERE c.group_id = v_group_id AND c.member_id = p_member_id
      AND lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
      AND c.contribution_date IS NOT NULL
      AND date_trunc('month', c.contribution_date)::date <= v_effective_through_month
  ),
  payment_allocations AS (
    SELECT p.payment_id,
      coalesce(sum(a.amount), 0)::numeric AS all_allocated_amount,
      coalesce(sum(a.amount) FILTER (WHERE o.id IS NOT NULL), 0)::numeric AS monthly_allocated_amount
    FROM monthly_payments p
    LEFT JOIN public.contribution_allocations a ON a.payment_id = p.payment_id
    LEFT JOIN public.contribution_obligations o ON o.id = a.obligation_id
      AND o.group_id = v_group_id AND o.member_id = p_member_id
      AND o.contribution_type_id = v_monthly_type_id
    GROUP BY p.payment_id
  ),
  payment_residuals AS (
    SELECT p.payment_id,
      greatest(p.amount - coalesce(pa.all_allocated_amount, 0), 0)::numeric AS residual_amount,
      p.contribution_date, p.created_at
    FROM monthly_payments p
    LEFT JOIN payment_allocations pa ON pa.payment_id = p.payment_id
    WHERE p.amount > coalesce(pa.all_allocated_amount, 0)
  ),
  monthly_obligations AS (
    SELECT o.id AS obligation_id, o.due_amount::numeric AS due_amount, o.obligation_month
    FROM public.contribution_obligations o
    WHERE o.group_id = v_group_id AND o.member_id = p_member_id
      AND o.contribution_type_id = v_monthly_type_id
      AND o.obligation_month <= v_effective_through_month
  ),
  obligation_allocations AS (
    SELECT o.obligation_id,
      coalesce(sum(a.amount) FILTER (WHERE p.id IS NOT NULL), 0)::numeric AS monthly_allocated_amount
    FROM monthly_obligations o
    LEFT JOIN public.contribution_allocations a ON a.obligation_id = o.obligation_id
    LEFT JOIN public.contributions p ON p.id = a.payment_id
      AND p.group_id = v_group_id AND p.member_id = p_member_id
      AND lower(trim(coalesce(p.contribution_type, ''))) = 'monthly'
    GROUP BY o.obligation_id
  ),
  obligation_residuals AS (
    SELECT o.obligation_id,
      greatest(o.due_amount - coalesce(oa.monthly_allocated_amount, 0), 0)::numeric AS residual_amount,
      o.obligation_month
    FROM monthly_obligations o
    LEFT JOIN obligation_allocations oa ON oa.obligation_id = o.obligation_id
    WHERE o.due_amount > coalesce(oa.monthly_allocated_amount, 0)
  ),
  payment_ranges AS (
    SELECT pr.*,
      coalesce(sum(pr.residual_amount) OVER (
        ORDER BY pr.contribution_date, pr.created_at, pr.payment_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0)::numeric AS payment_from,
      sum(pr.residual_amount) OVER (
        ORDER BY pr.contribution_date, pr.created_at, pr.payment_id
        ROWS UNBOUNDED PRECEDING
      )::numeric AS payment_to
    FROM payment_residuals pr
  ),
  obligation_ranges AS (
    SELECT orr.*,
      coalesce(sum(orr.residual_amount) OVER (
        ORDER BY orr.obligation_month, orr.obligation_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0)::numeric AS obligation_from,
      sum(orr.residual_amount) OVER (
        ORDER BY orr.obligation_month, orr.obligation_id
        ROWS UNBOUNDED PRECEDING
      )::numeric AS obligation_to
    FROM obligation_residuals orr
  ),
  matches AS (
    SELECT p.payment_id, o.obligation_id,
      greatest(
        0,
        least(p.payment_to, o.obligation_to) -
        greatest(p.payment_from, o.obligation_from)
      )::numeric AS allocation_amount
    FROM payment_ranges p
    CROSS JOIN obligation_ranges o
    WHERE greatest(
      0,
      least(p.payment_to, o.obligation_to) -
      greatest(p.payment_from, o.obligation_from)
    ) > 0
  )
  INSERT INTO public.contribution_allocations (payment_id, obligation_id, amount)
  SELECT m.payment_id, m.obligation_id, m.allocation_amount
  FROM matches m
  WHERE NOT EXISTS (
    SELECT 1 FROM public.contribution_allocations a
    WHERE a.payment_id = m.payment_id AND a.obligation_id = m.obligation_id
  );

  IF EXISTS (
    SELECT 1
    FROM public.contribution_allocations a
    JOIN public.contributions p ON p.id = a.payment_id
    JOIN public.contribution_obligations o ON o.id = a.obligation_id
    WHERE (p.member_id = p_member_id OR o.member_id = p_member_id)
      AND (p.group_id <> o.group_id OR p.member_id <> o.member_id OR a.amount <= 0)
  ) THEN
    RAISE EXCEPTION 'Cross-member/group allocation detected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT a.payment_id, sum(a.amount) allocated
      FROM public.contribution_allocations a
      JOIN public.contributions p ON p.id = a.payment_id
      WHERE p.member_id = p_member_id
      GROUP BY a.payment_id
    ) x
    JOIN public.contributions p ON p.id = x.payment_id
    WHERE x.allocated > p.amount
  ) THEN
    RAISE EXCEPTION 'Payment over-allocation detected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT a.obligation_id, sum(a.amount) allocated
      FROM public.contribution_allocations a
      JOIN public.contribution_obligations o ON o.id = a.obligation_id
      WHERE o.member_id = p_member_id
      GROUP BY a.obligation_id
    ) x
    JOIN public.contribution_obligations o ON o.id = x.obligation_id
    WHERE x.allocated > o.due_amount
  ) THEN
    RAISE EXCEPTION 'Obligation over-allocation detected';
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_fine_adjust(p_fine_id uuid, p_amount numeric, p_direction text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_fine public.fines%ROWTYPE;
  v_period public.financial_periods%ROWTYPE;
  v_actor uuid := auth.uid();
  v_balance numeric(14,2);
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_direction NOT IN ('INCREASE','DECREASE') OR btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'Invalid adjustment'; END IF;
  SELECT f.* INTO v_fine FROM public.fines f WHERE f.id=p_fine_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fine not found'; END IF;
  IF NOT public.cl_user_has_role(v_fine.group_id, ARRAY['chairperson','treasurer']::text[]) THEN RAISE EXCEPTION 'Fine adjustment requires chairperson or treasurer' USING ERRCODE='42501'; END IF;
  PERFORM private.cl_fine_lock(v_fine.group_id,v_fine.accounting_month);
  SELECT fp.* INTO v_period FROM public.financial_periods fp WHERE fp.group_id=v_fine.group_id AND fp.month=v_fine.accounting_month FOR UPDATE;
  IF NOT FOUND OR lower(v_period.status)='closed' THEN RAISE EXCEPTION 'Financial month is closed or missing'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' || v_fine.group_id::text || ':' || v_fine.member_id::text,
      0
    )
  );
  SELECT f.* INTO v_fine FROM public.fines f WHERE f.id=p_fine_id FOR UPDATE;
  SELECT v_fine.original_amount
    + coalesce((SELECT sum(CASE WHEN a.direction='INCREASE' THEN a.amount ELSE -a.amount END) FROM public.fine_adjustments a WHERE a.fine_id=v_fine.id),0)
    - coalesce((SELECT sum(w.amount) FROM public.fine_waivers w WHERE w.fine_id=v_fine.id),0)
    - coalesce((SELECT sum(a.allocated_amount) FROM public.fine_payment_allocations a WHERE a.fine_id=v_fine.id),0)
  INTO v_balance;
  IF p_direction='DECREASE' AND p_amount > round(v_balance,2) THEN RAISE EXCEPTION 'Decrease adjustment exceeds collectible balance'; END IF;
  INSERT INTO public.fine_adjustments(fine_id,amount,direction,reason,authorized_by) VALUES(p_fine_id,round(p_amount,2),p_direction,btrim(p_reason),v_actor) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_fine_allocate_payment(p_fine_id uuid, p_payment_id uuid, p_amount numeric, p_source text DEFAULT 'MANUAL'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_fine public.fines%ROWTYPE;
  v_payment public.contributions%ROWTYPE;
  v_period public.financial_periods%ROWTYPE;
  v_actor uuid := auth.uid();
  v_outstanding numeric(14,2);
  v_allocated numeric(14,2);
  v_id uuid;
  v_fine_month date;
  v_payment_month date;
  v_lock_start date;
  v_lock_end date;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;

  IF p_amount IS NULL OR round(p_amount,2) <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be positive after currency rounding';
  END IF;

  IF p_source NOT IN ('MANUAL','SYSTEM') THEN
    RAISE EXCEPTION 'Invalid allocation source';
  END IF;

  -- Unlocked reads are used only to derive the lock envelope. All
  -- authoritative ownership/value checks are repeated after the shared
  -- serialization boundary is acquired.
  SELECT f.*
  INTO v_fine
  FROM public.fines f
  WHERE f.id=p_fine_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fine not found';
  END IF;

  IF NOT public.cl_user_has_role(
    v_fine.group_id,
    ARRAY['chairperson','treasurer']::text[]
  ) THEN
    RAISE EXCEPTION 'Fine allocation requires chairperson or treasurer'
      USING ERRCODE='42501';
  END IF;

  SELECT c.*
  INTO v_payment
  FROM public.contributions c
  WHERE c.id=p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.contribution_date IS NULL THEN
    RAISE EXCEPTION 'Payment contribution date is required for allocation serialization';
  END IF;

  IF v_payment.group_id<>v_fine.group_id
     OR v_payment.member_id<>v_fine.member_id THEN
    RAISE EXCEPTION 'Cross-member or cross-group payment allocation prohibited';
  END IF;

  v_fine_month := to_date(v_fine.accounting_month || '-01','YYYY-MM-DD');
  v_payment_month := date_trunc('month',v_payment.contribution_date)::date;
  v_lock_start := least(v_fine_month,v_payment_month);
  v_lock_end := greatest(v_fine_month,v_payment_month);

  -- Participate in the same accounting lock domain used by
  -- cl_2b_record_contribution()/cl_2b_refresh_member(). A range is required
  -- because the payment month and fine accounting month are not assumed to
  -- be identical.
  PERFORM public.cl_2b_accounting_lock_range(
    v_fine.group_id,
    v_lock_start,
    v_lock_end
  );

  -- Lock the required financial-period row before entering the member/payment/fine
  -- portion of the lock order. The accounting advisory range above remains the
  -- month-range serializer; this row lock is only for the financial period
  -- actually required by the Fine allocation (the Fine's accounting month).
  SELECT fp.*
  INTO v_period
  FROM public.financial_periods fp
  WHERE fp.group_id=v_fine.group_id
    AND fp.month=v_fine.accounting_month
  FOR UPDATE;

  IF NOT FOUND OR lower(v_period.status)='closed' THEN
    RAISE EXCEPTION 'Financial month is closed or missing';
  END IF;

  -- This is the canonical member serialization key already used by the 2B
  -- member refresh path. It is acquired only after the accounting and required
  -- financial-period locks, and before payment/fine row serialization.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' ||
      v_fine.group_id::text || ':' ||
      v_fine.member_id::text,
      0
    )
  );

  -- The payment row is the next physical serialization point for the payment's
  -- total available balance. It is deliberately acquired before the Fine row
  -- so the complete row-lock suffix is Payment -> Fine.
  SELECT c.*
  INTO v_payment
  FROM public.contributions c
  WHERE c.id=p_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.group_id<>v_fine.group_id
     OR v_payment.member_id<>v_fine.member_id THEN
    RAISE EXCEPTION 'Cross-member or cross-group payment allocation prohibited';
  END IF;

  IF date_trunc('month',v_payment.contribution_date)::date<>v_payment_month THEN
    RAISE EXCEPTION 'Payment accounting month changed during allocation';
  END IF;

  -- Re-read the authoritative Fine only after the payment row is locked. This
  -- is the final row lock in the canonical allocation order.
  SELECT f.*
  INTO v_fine
  FROM public.fines f
  WHERE f.id=p_fine_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fine not found';
  END IF;

  IF v_fine.group_id<>v_payment.group_id
     OR v_fine.member_id<>v_payment.member_id THEN
    RAISE EXCEPTION 'Fine ownership changed';
  END IF;

  IF NOT public.cl_user_has_role(
    v_fine.group_id,
    ARRAY['chairperson','treasurer']::text[]
  ) THEN
    RAISE EXCEPTION 'Fine allocation requires chairperson or treasurer'
      USING ERRCODE='42501';
  END IF;

  -- Fine outstanding balance.
  SELECT coalesce(sum(a.allocated_amount),0)
  INTO v_allocated
  FROM public.fine_payment_allocations a
  WHERE a.fine_id=v_fine.id;

  SELECT coalesce(
    sum(CASE WHEN a.direction='INCREASE' THEN a.amount ELSE -a.amount END),
    0
  )
  INTO v_outstanding
  FROM public.fine_adjustments a
  WHERE a.fine_id=v_fine.id;

  v_outstanding := v_fine.original_amount + v_outstanding;

  SELECT v_outstanding - coalesce(sum(w.amount),0) - v_allocated
  INTO v_outstanding
  FROM public.fine_waivers w
  WHERE w.fine_id=v_fine.id;

  v_outstanding := round(v_outstanding,2);

  -- Total payment availability is cross-ledger:
  -- contribution allocations + fine allocations cannot exceed the payment.
  SELECT
    coalesce((
      SELECT sum(ca.amount)
      FROM public.contribution_allocations ca
      WHERE ca.payment_id=v_payment.id
    ),0)
    + coalesce((
      SELECT sum(fa.allocated_amount)
      FROM public.fine_payment_allocations fa
      WHERE fa.payment_id=v_payment.id
    ),0)
  INTO v_allocated;

  IF p_amount > round(v_payment.amount - v_allocated,2) THEN
    RAISE EXCEPTION 'Allocation exceeds payment remaining unallocated balance';
  END IF;

  IF v_outstanding <= 0 OR p_amount > v_outstanding THEN
    RAISE EXCEPTION 'Allocation exceeds outstanding fine balance';
  END IF;

  INSERT INTO public.fine_payment_allocations(
    fine_id,
    payment_id,
    allocated_amount,
    allocated_by,
    source
  )
  VALUES(
    p_fine_id,
    p_payment_id,
    round(p_amount,2),
    v_actor,
    p_source
  )
  ON CONFLICT (payment_id,fine_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Payment is already allocated to this fine';
  END IF;

  RETURN v_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_fine_balance(p_fine_id uuid)
 RETURNS TABLE(fine_id uuid, original_amount numeric, adjustments_increase numeric, adjustments_decrease numeric, waived_amount numeric, allocated_amount numeric, outstanding_amount numeric, status text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT f.id,
         f.original_amount,
         coalesce((SELECT sum(a.amount) FROM public.fine_adjustments a WHERE a.fine_id=f.id AND a.direction='INCREASE'),0),
         coalesce((SELECT sum(a.amount) FROM public.fine_adjustments a WHERE a.fine_id=f.id AND a.direction='DECREASE'),0),
         coalesce((SELECT sum(w.amount) FROM public.fine_waivers w WHERE w.fine_id=f.id),0),
         coalesce((SELECT sum(a.allocated_amount) FROM public.fine_payment_allocations a WHERE a.fine_id=f.id),0),
         greatest(round(
           f.original_amount
           + coalesce((SELECT sum(a.amount) FROM public.fine_adjustments a WHERE a.fine_id=f.id AND a.direction='INCREASE'),0)
           - coalesce((SELECT sum(a.amount) FROM public.fine_adjustments a WHERE a.fine_id=f.id AND a.direction='DECREASE'),0)
           - coalesce((SELECT sum(w.amount) FROM public.fine_waivers w WHERE w.fine_id=f.id),0)
           - coalesce((SELECT sum(a.allocated_amount) FROM public.fine_payment_allocations a WHERE a.fine_id=f.id),0)
         ,2),0),
         CASE
           WHEN coalesce((SELECT sum(w.amount) FROM public.fine_waivers w WHERE w.fine_id=f.id),0)
                >= f.original_amount
                + coalesce((SELECT sum(CASE WHEN a.direction='INCREASE' THEN a.amount ELSE -a.amount END) FROM public.fine_adjustments a WHERE a.fine_id=f.id),0)
             THEN 'WAIVED'
           WHEN greatest(round(f.original_amount
                + coalesce((SELECT sum(CASE WHEN a.direction='INCREASE' THEN a.amount ELSE -a.amount END) FROM public.fine_adjustments a WHERE a.fine_id=f.id),0)
                - coalesce((SELECT sum(w.amount) FROM public.fine_waivers w WHERE w.fine_id=f.id),0)
                - coalesce((SELECT sum(a.allocated_amount) FROM public.fine_payment_allocations a WHERE a.fine_id=f.id),0),2),0)=0
             THEN 'PAID'
           WHEN coalesce((SELECT sum(a.allocated_amount) FROM public.fine_payment_allocations a WHERE a.fine_id=f.id),0)>0
             THEN 'PARTIALLY_PAID'
           ELSE 'OUTSTANDING'
         END
  FROM public.fines f
  WHERE f.id=p_fine_id
    AND (
      public.cl_user_has_role(
        f.group_id,
        ARRAY['chairperson','treasurer']::text[]
      )
      OR EXISTS (
        SELECT 1
        FROM public.members m
        WHERE m.id=f.member_id
          AND m.group_id=f.group_id
          AND (m.auth_user_id=auth.uid() OR m.user_id=auth.uid())
      )
    );
$function$
