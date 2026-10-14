-- STAGE ONLY: production function definitions; ordinal rows 1-10 of 201.
-- Definitions captured read-only on 2026-10-14. Ordering is alphabetical, NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects must be reconciled separately.

CREATE OR REPLACE FUNCTION private.append_platform_activity(p_event_type text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_activity_id uuid;
  v_actor_display text;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
BEGIN
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated actor required' USING ERRCODE = '42501';
  END IF;
  IF p_event_type NOT IN (
    'group_application_submitted','group_application_reviewed','group_approved',
    'group_created','member_created','subscription_renewed',
    'subscription_payment_confirmed','subscription_payment_reversed'
  ) THEN
    RAISE EXCEPTION 'Unsupported platform activity event type: %', p_event_type
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'Platform activity metadata must be a JSON object'
      USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(
    NULLIF(BTRIM(COALESCE(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',''
    )), ''),
    NULLIF(BTRIM(u.email), '')
  ) INTO v_actor_display
  FROM auth.users AS u WHERE u.id = v_actor_user_id;

  INSERT INTO public.platform_activity(
    event_type, actor_user_id, actor_type, actor_display, metadata
  ) VALUES (
    p_event_type, v_actor_user_id, 'human', v_actor_display, v_metadata
  ) RETURNING id INTO v_activity_id;
  RETURN v_activity_id;
END;
$function$


CREATE OR REPLACE FUNCTION private.cl_fine_config_lock(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'Invalid fine group';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('chama-live:fine-config:' || p_group_id::text, 0));
END;
$function$


CREATE OR REPLACE FUNCTION private.cl_fine_lock(p_group_id uuid, p_month text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_group_id IS NULL OR p_month IS NULL
     OR p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Invalid fine accounting key';
  END IF;
  PERFORM public.cl_2b_accounting_lock(p_group_id, p_month);
END;
$function$


CREATE OR REPLACE FUNCTION private.cl_other_assert_fine_rule(p_group_id uuid, p_contribution_type_id uuid, p_fine_rule_id uuid, p_cycle_opening_date date, p_cycle_closing_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_rule public.fine_rules%ROWTYPE;
BEGIN
  IF p_fine_rule_id IS NULL THEN RETURN; END IF;
  SELECT r.* INTO v_rule FROM public.fine_rules r
  WHERE r.id=p_fine_rule_id AND r.group_id=p_group_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fine rule does not belong to cycle group'; END IF;
  IF v_rule.status <> 'active' THEN RAISE EXCEPTION 'Other cycle fine rule must be active'; END IF;
  IF v_rule.trigger_type <> 'missed_contribution' THEN
    RAISE EXCEPTION 'Other cycles require missed_contribution fine rules';
  END IF;
  IF v_rule.applicability_mode NOT IN ('ALL','SELECTED') THEN
    RAISE EXCEPTION 'Other cycles require ALL or SELECTED fine applicability';
  END IF;
  IF v_rule.effective_from > ((p_cycle_opening_date)::timestamp AT TIME ZONE 'Africa/Nairobi') THEN
    RAISE EXCEPTION 'Fine rule becomes effective after cycle opens';
  END IF;
  IF v_rule.effective_until IS NOT NULL
     AND v_rule.effective_until < ((p_cycle_closing_date+1)::timestamp AT TIME ZONE 'Africa/Nairobi') THEN
    RAISE EXCEPTION 'Fine rule expires before cycle closing boundary';
  END IF;
  IF v_rule.applicability_mode='SELECTED'
     AND NOT EXISTS (SELECT 1 FROM public.fine_rule_contribution_types rt
                     WHERE rt.rule_id=v_rule.id
                       AND rt.contribution_type_id=p_contribution_type_id) THEN
    RAISE EXCEPTION 'Selected fine rule is not applicable to contribution type';
  END IF;
END $function$


CREATE OR REPLACE FUNCTION private.cl_other_assert_type(p_group_id uuid, p_contribution_type_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_code text;
BEGIN
  SELECT ct.code INTO v_code FROM public.contribution_types ct
  WHERE ct.id=p_contribution_type_id AND ct.group_id=p_group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contribution type does not belong to group'; END IF;
  IF lower(coalesce(v_code,''))='monthly' THEN
    RAISE EXCEPTION 'Monthly contribution type cannot use Other lifecycle';
  END IF;
END $function$


CREATE OR REPLACE FUNCTION private.cl_other_cycle_authorize(p_group_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid:=auth.uid(); v_member_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  SELECT m.id INTO v_member_id
  FROM public.members m
  WHERE m.group_id=p_group_id
    AND (m.user_id=v_actor OR m.auth_user_id=v_actor)
    AND lower(coalesce(m.status,''))='active'
    AND lower(coalesce(m.onboarding_status,''))='active'
    AND (EXISTS (SELECT 1 FROM public.groups g
                 WHERE g.id=p_group_id AND g.owner_user_id=v_actor)
         OR lower(coalesce(m.actual_position,'')) IN ('chairperson','treasurer'))
  ORDER BY m.id LIMIT 1;
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Other cycle authorization requires owner, chairperson, or treasurer'
      USING ERRCODE='42501';
  END IF;
  RETURN v_member_id;
END $function$


CREATE OR REPLACE FUNCTION private.cl_other_cycle_lock(p_group_id uuid, p_contribution_type_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_group_id IS NULL OR p_contribution_type_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Other contribution cycle lock key';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('chama-live:other-cycle:'||p_group_id::text||':'||
                     p_contribution_type_id::text,0));
END $function$


CREATE OR REPLACE FUNCTION private.cl_other_obligation_lineage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_parent public.contribution_obligations%ROWTYPE;
BEGIN
  IF NEW.component_kind='RESIDUAL' THEN
    IF NEW.parent_obligation_id IS NULL THEN
      RAISE EXCEPTION 'Residual requires parent obligation';
    END IF;
    SELECT o.* INTO v_parent
    FROM public.contribution_obligations o
    WHERE o.id=NEW.parent_obligation_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Residual parent obligation % not found',NEW.parent_obligation_id;
    END IF;
    IF v_parent.group_id IS DISTINCT FROM NEW.group_id
       OR v_parent.member_id IS DISTINCT FROM NEW.member_id
       OR v_parent.contribution_type_id IS DISTINCT FROM NEW.contribution_type_id
       OR v_parent.obligation_month IS DISTINCT FROM NEW.obligation_month
       OR v_parent.economic_month IS DISTINCT FROM NEW.economic_month
       OR v_parent.rule_id IS DISTINCT FROM NEW.rule_id
       OR v_parent.period_id IS DISTINCT FROM NEW.period_id THEN
      RAISE EXCEPTION 'Residual source identity does not match parent obligation %',
        NEW.parent_obligation_id;
    END IF;
  END IF;
  RETURN NEW;
END $function$


CREATE OR REPLACE FUNCTION private.cl_other_payment_request_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.request_id IS DISTINCT FROM OLD.request_id
       OR NEW.operation IS DISTINCT FROM OLD.operation
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.member_id IS DISTINCT FROM OLD.member_id
       OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id
       OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION 'Other payment request identity is immutable';
    END IF;

    IF OLD.completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Completed other payment request is immutable';
    END IF;

    IF OLD.payment_id IS NOT NULL
       AND NEW.payment_id IS DISTINCT FROM OLD.payment_id
    THEN
        RAISE EXCEPTION
            'Other payment request payment_id is immutable once assigned';
    END IF;

    IF NEW.completed_at IS NULL THEN
        IF NEW.result IS DISTINCT FROM OLD.result THEN
            RAISE EXCEPTION
                'Incomplete other payment request result is immutable';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.payment_id IS NULL THEN
        RAISE EXCEPTION
            'Completed other payment request requires payment_id';
    END IF;

    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION private.cl_other_period_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF OLD.status <> 'draft' AND NEW.status='draft' THEN
    RAISE EXCEPTION 'Activated contribution cycle cannot return to draft';
  END IF;
  IF NEW.status <> 'draft' THEN
    IF NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.contribution_type_id IS DISTINCT FROM OLD.contribution_type_id
       OR NEW.frequency IS DISTINCT FROM OLD.frequency
       OR NEW.period_key IS DISTINCT FROM OLD.period_key
       OR NEW.opening_date IS DISTINCT FROM OLD.opening_date
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.closing_date IS DISTINCT FROM OLD.closing_date
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.fine_rule_id IS DISTINCT FROM OLD.fine_rule_id THEN
      RAISE EXCEPTION 'Activated contribution-cycle configuration is immutable';
    END IF;
  END IF;
  RETURN NEW;
END $function$
