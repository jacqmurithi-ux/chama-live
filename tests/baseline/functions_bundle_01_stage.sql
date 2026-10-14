-- STAGE ONLY: bundled function source definitions, production catalog captured 2026-10-14.
-- Alphabetical inventory order, not dependency order. Install after tables and before views/triggers.
-- This file is a source bundle, not an executable final migration by itself.

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


-- STAGE ONLY: production function definitions; ordinal rows 11-20 of 201.
-- Definitions captured read-only on 2026-10-14. Ordering is alphabetical, NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects must be reconciled separately.

CREATE OR REPLACE FUNCTION private.cl_other_request_lock(p_request_id uuid, p_operation text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_request_id IS NULL OR p_operation NOT IN ('create','activate','generate_fine') THEN
    RAISE EXCEPTION 'Invalid Other contribution request lock key';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('chama-live:other-request:'||p_request_id::text||':'||p_operation,0));
END $function$


CREATE OR REPLACE FUNCTION private.create_next_subscription_cycle(p_subscription_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_subscription public.group_subscriptions%ROWTYPE;v_previous public.subscription_cycles%ROWTYPE;v_cycle_id uuid;v_cycle_number integer;v_starts_at timestamptz;v_ends_at timestamptz;v_member_count integer;v_tier public.subscription_pricing_tiers%ROWTYPE;v_group_discount numeric(5,2);v_login_discount numeric(5,2);v_group_amount numeric(12,2);v_login_unit numeric(12,2);v_member public.members%ROWTYPE; BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('chama_live_subscription:'||p_subscription_id::text,0)); SELECT * INTO v_subscription FROM public.group_subscriptions WHERE id=p_subscription_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % does not exist',p_subscription_id USING ERRCODE='P0002'; END IF; IF v_subscription.status<>'active' THEN RAISE EXCEPTION 'Subscription % is not active',p_subscription_id USING ERRCODE='P0001'; END IF; SELECT * INTO v_previous FROM public.subscription_cycles WHERE subscription_id=p_subscription_id ORDER BY cycle_number DESC LIMIT 1 FOR UPDATE; IF NOT FOUND THEN v_cycle_number:=1;v_starts_at:=v_subscription.started_at; ELSE v_cycle_number:=v_previous.cycle_number+1;v_starts_at:=v_previous.ends_at; END IF; v_ends_at:=v_starts_at+interval '30 days'; FOR v_member IN SELECT m.* FROM public.members m WHERE m.group_id=v_subscription.group_id ORDER BY m.id FOR UPDATE LOOP NULL; END LOOP; SELECT count(*) INTO v_member_count FROM public.members m WHERE m.group_id=v_subscription.group_id AND lower(coalesce(m.status,'active'))='active' AND lower(coalesce(m.onboarding_status,'pending'))='active'; SELECT * INTO v_tier FROM public.subscription_pricing_tiers t WHERE t.active AND v_member_count>=t.min_members AND(t.max_members IS NULL OR v_member_count<=t.max_members) ORDER BY t.min_members DESC LIMIT 1; IF NOT FOUND THEN RAISE EXCEPTION 'No subscription pricing tier exists for % active members',v_member_count; END IF; IF v_cycle_number=1 THEN v_group_discount:=100;v_login_discount:=100;ELSIF v_cycle_number BETWEEN 2 AND 5 THEN v_group_discount:=30;v_login_discount:=30;ELSE v_group_discount:=0;v_login_discount:=0;END IF; v_group_amount:=round(v_tier.standard_group_amount*(1-v_group_discount/100),2);v_login_unit:=round(v_tier.standard_member_login_amount*(1-v_login_discount/100),2); INSERT INTO public.subscription_cycles(subscription_id,cycle_number,starts_at,ends_at,member_count_snapshot,pricing_tier_code,standard_group_amount,group_discount_percent,group_amount,standard_member_login_amount,member_login_discount_percent,member_login_unit_amount,currency,status) VALUES(p_subscription_id,v_cycle_number,v_starts_at,v_ends_at,v_member_count,v_tier.tier_code,v_tier.standard_group_amount,v_group_discount,v_group_amount,v_tier.standard_member_login_amount,v_login_discount,v_login_unit,v_tier.currency,'open') RETURNING id INTO v_cycle_id; IF v_cycle_number>=2 THEN INSERT INTO public.subscription_member_billing(subscription_id,group_id,member_id,billable_from_cycle_id,activated_at,status) SELECT p_subscription_id,v_subscription.group_id,m.id,v_cycle_id,m.activated_at,'active' FROM public.members m WHERE m.group_id=v_subscription.group_id AND lower(coalesce(m.status,''))='active' AND lower(coalesce(m.onboarding_status,''))='active' AND m.activated_at IS NOT NULL AND m.activated_at<=v_starts_at AND NOT EXISTS(SELECT 1 FROM public.subscription_member_billing smb WHERE smb.subscription_id=p_subscription_id AND smb.member_id=m.id); END IF; RETURN v_cycle_id; END; $function$


CREATE OR REPLACE FUNCTION private.create_subscription_invoice_authority(p_cycle_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_cycle public.subscription_cycles%ROWTYPE;
    v_subscription public.group_subscriptions%ROWTYPE;
    v_invoice public.subscription_invoices%ROWTYPE;
    v_invoice_sequence bigint;
    v_invoice_number text;
    v_issued_at timestamptz;
    v_due_at timestamptz;
    v_member_login_count integer;
    v_standard_member_login_amount numeric(12,2);
    v_member_login_unit_amount numeric(12,2);
    v_member_login_amount numeric(12,2);
    v_group_discount_amount numeric(12,2);
    v_total_discount numeric(12,2);
    v_subtotal numeric(12,2);
    v_total_amount numeric(12,2);
    v_status text;
BEGIN
    SELECT gs.*
    INTO v_subscription
    FROM public.subscription_cycles sc
    JOIN public.group_subscriptions gs ON gs.id = sc.subscription_id
    WHERE sc.id = p_cycle_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription cycle % does not exist', p_cycle_id USING ERRCODE = 'P0002';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('chama_live_subscription:' || v_subscription.id::text, 0)
    );

    SELECT * INTO v_subscription
    FROM public.group_subscriptions
    WHERE id = v_subscription.id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription % does not exist', v_subscription.id USING ERRCODE = 'P0002';
    END IF;

    IF v_subscription.status <> 'active' THEN
        RAISE EXCEPTION 'Subscription % is not active', v_subscription.id USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_cycle
    FROM public.subscription_cycles
    WHERE id = p_cycle_id
      AND subscription_id = v_subscription.id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription cycle % does not exist for subscription %', p_cycle_id, v_subscription.id USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_invoice
    FROM public.subscription_invoices
    WHERE subscription_id = v_subscription.id
      AND cycle_id = v_cycle.id
    FOR UPDATE;

    IF FOUND THEN
        RETURN v_invoice.id;
    END IF;

    IF v_cycle.status <> 'open' THEN
        RAISE EXCEPTION 'Subscription cycle % is not open for invoicing', v_cycle.cycle_number USING ERRCODE = 'P0001';
    END IF;

    v_issued_at := now();
    v_due_at := v_issued_at + interval '7 days';

    SELECT
        count(*)::integer,
        coalesce(sum(v_cycle.standard_member_login_amount), 0)::numeric(12,2)
    INTO v_member_login_count, v_standard_member_login_amount
    FROM public.subscription_member_billing b
    JOIN public.subscription_cycles from_cycle
      ON from_cycle.id = b.billable_from_cycle_id
     AND from_cycle.subscription_id = v_subscription.id
    LEFT JOIN public.subscription_cycles until_cycle
      ON until_cycle.id = b.billable_until_cycle_id
     AND until_cycle.subscription_id = v_subscription.id
    WHERE b.subscription_id = v_subscription.id
      AND b.group_id = v_subscription.group_id
      AND from_cycle.cycle_number <= v_cycle.cycle_number
      AND (until_cycle.id IS NULL OR until_cycle.cycle_number >= v_cycle.cycle_number)
      AND b.status = 'active';

    v_standard_member_login_amount := coalesce(v_standard_member_login_amount, 0);
    v_member_login_unit_amount := round(v_cycle.member_login_unit_amount, 2);
    v_member_login_amount := round(v_member_login_count * v_member_login_unit_amount, 2);
    v_group_discount_amount := round(v_cycle.standard_group_amount - v_cycle.group_amount, 2);
    v_total_discount := round(v_group_discount_amount + (v_standard_member_login_amount - v_member_login_amount), 2);
    v_subtotal := round(v_cycle.standard_group_amount + v_standard_member_login_amount, 2);
    v_total_amount := round(v_cycle.group_amount + v_member_login_amount, 2);

    PERFORM pg_advisory_xact_lock(
        hashtextextended('chama_live_invoice_number:' || to_char(v_issued_at, 'YYYY'), 0)
    );

    SELECT COALESCE(MAX(substring(invoice_number FROM 10 FOR 6)::bigint), 0)
    INTO v_invoice_sequence
    FROM public.subscription_invoices
    WHERE invoice_number LIKE 'INV-' || to_char(v_issued_at, 'YYYY') || '-%';

    v_invoice_number :=
        'INV-' || to_char(v_issued_at, 'YYYY') || '-' ||
        lpad((v_invoice_sequence + 1)::text, 6, '0');

    v_status := CASE WHEN v_total_amount = 0 THEN 'paid' ELSE 'issued' END;

    INSERT INTO public.subscription_invoices (
        group_id, subscription_id, cycle_id, invoice_number,
        member_count_snapshot, pricing_tier_code,
        standard_group_amount, group_discount_amount, group_amount,
        member_login_count, member_login_unit_amount, member_login_amount,
        subtotal, total_discount, total_amount, currency, status,
        issued_at, due_at, paid_at
    )
    VALUES (
        v_subscription.group_id, v_subscription.id, v_cycle.id, v_invoice_number,
        v_cycle.member_count_snapshot, v_cycle.pricing_tier_code,
        v_cycle.standard_group_amount, v_group_discount_amount, v_cycle.group_amount,
        v_member_login_count, v_member_login_unit_amount, v_member_login_amount,
        v_subtotal, v_total_discount, v_total_amount, v_cycle.currency, v_status,
        v_issued_at, v_due_at, NULL
    )
    RETURNING * INTO v_invoice;

    INSERT INTO public.subscription_invoice_lines (
        invoice_id, group_id, line_type, member_id, description,
        quantity, unit_amount, discount_percent, discount_amount, line_amount, currency
    )
    VALUES (
        v_invoice.id, v_subscription.group_id, 'group_subscription', NULL,
        'Group subscription', 1, v_cycle.standard_group_amount,
        v_cycle.group_discount_percent, v_group_discount_amount,
        v_cycle.group_amount, v_cycle.currency
    );

    INSERT INTO public.subscription_invoice_lines (
        invoice_id, group_id, line_type, member_id, description,
        quantity, unit_amount, discount_percent, discount_amount, line_amount, currency
    )
    SELECT
        v_invoice.id, b.group_id, 'member_login', b.member_id,
        'Member login subscription', 1, v_cycle.standard_member_login_amount,
        v_cycle.member_login_discount_percent,
        round(v_cycle.standard_member_login_amount - v_cycle.member_login_unit_amount, 2),
        v_cycle.member_login_unit_amount, v_cycle.currency
    FROM public.subscription_member_billing b
    JOIN public.subscription_cycles from_cycle
      ON from_cycle.id = b.billable_from_cycle_id
     AND from_cycle.subscription_id = v_subscription.id
    LEFT JOIN public.subscription_cycles until_cycle
      ON until_cycle.id = b.billable_until_cycle_id
     AND until_cycle.subscription_id = v_subscription.id
    WHERE b.subscription_id = v_subscription.id
      AND b.group_id = v_subscription.group_id
      AND from_cycle.cycle_number <= v_cycle.cycle_number
      AND (until_cycle.id IS NULL OR until_cycle.cycle_number >= v_cycle.cycle_number)
      AND b.status = 'active';

    UPDATE public.subscription_cycles
    SET status = 'invoiced'
    WHERE id = v_cycle.id
      AND subscription_id = v_subscription.id
      AND status = 'open';

    RETURN v_invoice.id;
END;
$function$


CREATE OR REPLACE FUNCTION private.deactivate_member_login_billing(p_subscription_id uuid, p_member_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_subscription public.group_subscriptions%ROWTYPE;v_billing public.subscription_member_billing%ROWTYPE;v_current_cycle public.subscription_cycles%ROWTYPE;v_next_cycle public.subscription_cycles%ROWTYPE;BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('chama_live_subscription:'||p_subscription_id::text,0));SELECT * INTO v_subscription FROM public.group_subscriptions WHERE id=p_subscription_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % does not exist',p_subscription_id USING ERRCODE='P0002';END IF;SELECT * INTO v_billing FROM public.subscription_member_billing WHERE subscription_id=p_subscription_id AND member_id=p_member_id FOR UPDATE;IF NOT FOUND THEN RETURN false;END IF;IF v_billing.status='ended' THEN RETURN true;END IF;SELECT * INTO v_current_cycle FROM public.subscription_cycles sc WHERE sc.subscription_id=p_subscription_id AND now()>=sc.starts_at AND now()<sc.ends_at ORDER BY sc.cycle_number DESC LIMIT 1 FOR UPDATE;IF FOUND THEN SELECT * INTO v_next_cycle FROM public.subscription_cycles sc WHERE sc.subscription_id=p_subscription_id AND sc.cycle_number=v_current_cycle.cycle_number+1 LIMIT 1 FOR UPDATE;END IF;UPDATE public.subscription_member_billing SET status='ended',deactivated_at=now(),billable_until_cycle_id=CASE WHEN v_next_cycle.id IS NOT NULL THEN v_next_cycle.id ELSE billable_until_cycle_id END WHERE id=v_billing.id;RETURN true;END; $function$


CREATE OR REPLACE FUNCTION private.get_my_group_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
    select m.group_id
    from public.members m
    where m.user_id = auth.uid();
$function$


CREATE OR REPLACE FUNCTION private.initialize_group_subscription(p_group_id uuid, p_started_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_subscription_id uuid;v_member_count integer;v_tier public.subscription_pricing_tiers%ROWTYPE; BEGIN SELECT count(*) INTO v_member_count FROM public.members m WHERE m.group_id=p_group_id AND lower(coalesce(m.status,'active'))='active' AND lower(coalesce(m.onboarding_status,'pending'))='active'; SELECT * INTO v_tier FROM public.subscription_pricing_tiers t WHERE t.active AND v_member_count>=t.min_members AND(t.max_members IS NULL OR v_member_count<=t.max_members) ORDER BY t.min_members DESC LIMIT 1; IF NOT FOUND THEN RAISE EXCEPTION 'No subscription pricing tier exists for % active members',v_member_count; END IF; INSERT INTO public.group_subscriptions(group_id,pricing_tier_id,pricing_tier_code,standard_group_amount,standard_member_login_amount,currency,started_at,status) VALUES(p_group_id,v_tier.id,v_tier.tier_code,v_tier.standard_group_amount,v_tier.standard_member_login_amount,v_tier.currency,p_started_at,'active') RETURNING id INTO v_subscription_id; RETURN v_subscription_id; END; $function$


CREATE OR REPLACE FUNCTION private.machine_renew_due_subscriptions(p_run_id uuid, p_batch_size integer)
 RETURNS TABLE(run_id uuid, processed_count integer, renewed_count integer, not_due_count integer, already_renewed_count integer, anomalous_count integer, failed_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_run private.renewal_runs%ROWTYPE;
    v_processed integer := 0;
    v_renewed integer := 0;
    v_not_due integer := 0;
    v_already_renewed integer := 0;
    v_anomalous integer := 0;
    v_failed integer := 0;
    v_candidate record;
    v_attempt record;
BEGIN
    IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 100 THEN
        RAISE EXCEPTION 'batch size must be between 1 and 100';
    END IF;

    SELECT * INTO v_run
    FROM private.renewal_runs AS rr
    WHERE rr.run_id = p_run_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'renewal run % not found', p_run_id;
    END IF;

    IF v_run.execution_source <> 'scheduler' THEN
        RAISE EXCEPTION 'renewal run % is not a scheduler run', p_run_id;
    END IF;

    IF v_run.status <> 'running' THEN
        RAISE EXCEPTION 'renewal run % is not running', p_run_id;
    END IF;

    FOR v_candidate IN
        SELECT gs.id AS subscription_id,
               lc.id AS expected_cycle_id
        FROM public.group_subscriptions AS gs
        JOIN LATERAL (
            SELECT sc.*
            FROM public.subscription_cycles AS sc
            WHERE sc.subscription_id = gs.id
            ORDER BY sc.cycle_number DESC
            LIMIT 1
        ) AS lc ON true
        WHERE gs.status = 'active'
          AND lc.ends_at <= pg_catalog.now()
        ORDER BY lc.ends_at, gs.id
        FOR UPDATE OF gs SKIP LOCKED
        LIMIT p_batch_size
    LOOP
        v_processed := v_processed + 1;

        BEGIN
            SELECT *
            INTO v_attempt
            FROM private.renew_subscription_authority(
                v_candidate.subscription_id,
                v_candidate.expected_cycle_id,
                p_run_id,
                'scheduler:' || v_candidate.subscription_id::text || ':' || v_candidate.expected_cycle_id::text,
                'scheduler'
            );

            IF v_attempt.result = 'renewed' THEN
                v_renewed := v_renewed + 1;
            ELSIF v_attempt.result = 'not_due' THEN
                v_not_due := v_not_due + 1;
            ELSIF v_attempt.result = 'already_renewed' THEN
                v_already_renewed := v_already_renewed + 1;
            ELSIF v_attempt.result = 'anomalous' THEN
                v_anomalous := v_anomalous + 1;
            ELSIF v_attempt.result = 'failed' THEN
                v_failed := v_failed + 1;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                v_failed := v_failed + 1;
        END;
    END LOOP;

    RETURN QUERY
    SELECT
        p_run_id,
        v_processed,
        v_renewed,
        v_not_due,
        v_already_renewed,
        v_anomalous,
        v_failed;
END;
$function$


CREATE OR REPLACE FUNCTION private.register_member_login_billing(p_subscription_id uuid, p_member_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_subscription public.group_subscriptions%ROWTYPE;v_member public.members%ROWTYPE;v_cycle public.subscription_cycles%ROWTYPE;v_auth_user_id uuid;v_billing_id uuid; BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('chama_live_subscription:'||p_subscription_id::text,0));SELECT * INTO v_subscription FROM public.group_subscriptions WHERE id=p_subscription_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % does not exist',p_subscription_id USING ERRCODE='P0002';END IF;IF v_subscription.status<>'active' THEN RAISE EXCEPTION 'Subscription % is not active',p_subscription_id USING ERRCODE='P0001';END IF;SELECT * INTO v_member FROM public.members WHERE id=p_member_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Member % does not exist',p_member_id USING ERRCODE='P0002';END IF;IF v_member.group_id<>v_subscription.group_id THEN RAISE EXCEPTION 'Member % does not belong to subscription group',p_member_id USING ERRCODE='P0001';END IF;IF lower(coalesce(v_member.status,''))<>'active' OR lower(coalesce(v_member.onboarding_status,''))<>'active' THEN RAISE EXCEPTION 'Member % is not currently eligible for login billing',p_member_id USING ERRCODE='P0001';END IF;IF v_member.activated_at IS NULL THEN RAISE EXCEPTION 'Member % has not been activated',p_member_id USING ERRCODE='P0001';END IF;IF v_member.user_id IS NOT NULL AND v_member.auth_user_id IS NOT NULL AND v_member.user_id<>v_member.auth_user_id THEN RAISE EXCEPTION 'Member has conflicting Auth identities';END IF;v_auth_user_id:=coalesce(v_member.auth_user_id,v_member.user_id);IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'Member has no authenticated login';END IF;IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v_auth_user_id) THEN RAISE EXCEPTION 'Authenticated user does not exist';END IF;SELECT * INTO v_cycle FROM public.subscription_cycles sc WHERE sc.subscription_id=p_subscription_id AND sc.cycle_number>=2 AND sc.starts_at>=v_member.activated_at ORDER BY sc.cycle_number LIMIT 1 FOR UPDATE;IF NOT FOUND THEN RETURN NULL;END IF;SELECT id INTO v_billing_id FROM public.subscription_member_billing WHERE subscription_id=p_subscription_id AND member_id=p_member_id FOR UPDATE;IF FOUND THEN RETURN v_billing_id;END IF;INSERT INTO public.subscription_member_billing(subscription_id,group_id,member_id,billable_from_cycle_id,activated_at,status) VALUES(p_subscription_id,v_subscription.group_id,p_member_id,v_cycle.id,v_member.activated_at,'active') RETURNING id INTO v_billing_id;RETURN v_billing_id;END; $function$


CREATE OR REPLACE FUNCTION private.renew_subscription_authority(p_subscription_id uuid, p_expected_cycle_id uuid, p_run_id uuid, p_idempotency_key text, p_execution_source text)
 RETURNS TABLE(attempt_id uuid, subscription_id uuid, result text, cycle_before integer, cycle_after integer, invoice_id uuid, error_code text, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_attempt private.renewal_attempts%ROWTYPE;
    v_run private.renewal_runs%ROWTYPE;
    v_subscription public.group_subscriptions%ROWTYPE;
    v_expected public.subscription_cycles%ROWTYPE;
    v_previous public.subscription_cycles%ROWTYPE;
    v_new_cycle_id uuid;
    v_new_cycle public.subscription_cycles%ROWTYPE;
    v_invoice_id uuid;
    v_error_code text;
    v_error_message text;
BEGIN
    IF p_execution_source NOT IN ('human','scheduler') THEN
        RAISE EXCEPTION 'Invalid execution source %', p_execution_source USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_attempt
    FROM private.renewal_attempts
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        RETURN QUERY SELECT v_attempt.attempt_id, v_attempt.subscription_id,
            v_attempt.result, v_attempt.cycle_before, v_attempt.cycle_after,
            v_attempt.invoice_id, v_attempt.error_code, v_attempt.error_message;
        RETURN;
    END IF;

    SELECT * INTO v_run
    FROM private.renewal_runs
    WHERE run_id = p_run_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Renewal run % does not exist', p_run_id USING ERRCODE = 'P0002';
    END IF;

    IF v_run.status <> 'running' THEN
        RAISE EXCEPTION 'Renewal run % is not running', p_run_id USING ERRCODE = 'P0001';
    END IF;

    IF v_run.execution_source <> p_execution_source THEN
        RAISE EXCEPTION 'Renewal run execution source mismatch' USING ERRCODE = '42501';
    END IF;

    BEGIN
        PERFORM pg_advisory_xact_lock(
            hashtextextended('chama_live_subscription:' || p_subscription_id::text, 0)
        );

        SELECT * INTO v_subscription
        FROM public.group_subscriptions
        WHERE id = p_subscription_id
        FOR UPDATE;

        IF NOT FOUND THEN
            INSERT INTO private.renewal_attempts(
                run_id, subscription_id, execution_source, result,
                cycle_before, cycle_after, invoice_id, idempotency_key,
                error_code, error_message
            ) VALUES (
                p_run_id, p_subscription_id, p_execution_source, 'anomalous',
                NULL, NULL, NULL, p_idempotency_key, 'SUBSCRIPTION_MISSING',
                format('Subscription %s does not exist', p_subscription_id)
            )
            RETURNING * INTO v_attempt;
            RETURN QUERY SELECT v_attempt.attempt_id, v_attempt.subscription_id,
                v_attempt.result, v_attempt.cycle_before, v_attempt.cycle_after,
                v_attempt.invoice_id, v_attempt.error_code, v_attempt.error_message;
            RETURN;
        END IF;

        IF v_subscription.status <> 'active' THEN
            RAISE EXCEPTION 'Subscription % is not active', p_subscription_id USING ERRCODE = 'P0001';
        END IF;

        SELECT * INTO v_expected
        FROM public.subscription_cycles
        WHERE id = p_expected_cycle_id
          AND subscription_id = p_subscription_id
        FOR UPDATE;

        IF NOT FOUND THEN
            INSERT INTO private.renewal_attempts(
                run_id, subscription_id, execution_source, result,
                cycle_before, cycle_after, invoice_id, idempotency_key,
                error_code, error_message
            ) VALUES (
                p_run_id, p_subscription_id, p_execution_source, 'anomalous',
                NULL, NULL, NULL, p_idempotency_key, 'EXPECTED_CYCLE_MISSING',
                format('Expected cycle %s does not exist for subscription %s',
                       p_expected_cycle_id, p_subscription_id)
            )
            RETURNING * INTO v_attempt;
            RETURN QUERY SELECT v_attempt.attempt_id, v_attempt.subscription_id,
                v_attempt.result, v_attempt.cycle_before, v_attempt.cycle_after,
                v_attempt.invoice_id, v_attempt.error_code, v_attempt.error_message;
            RETURN;
        END IF;

        SELECT * INTO v_previous
        FROM public.subscription_cycles
        WHERE subscription_id = p_subscription_id
        ORDER BY cycle_number DESC
        LIMIT 1
        FOR UPDATE;

        IF NOT FOUND THEN
            INSERT INTO private.renewal_attempts(
                run_id, subscription_id, execution_source, result,
                cycle_before, cycle_after, invoice_id, idempotency_key,
                error_code, error_message
            ) VALUES (
                p_run_id, p_subscription_id, p_execution_source, 'anomalous',
                NULL, NULL, NULL, p_idempotency_key, 'NO_LATEST_CYCLE',
                format('Subscription %s has no latest cycle', p_subscription_id)
            )
            RETURNING * INTO v_attempt;
            RETURN QUERY SELECT v_attempt.attempt_id, v_attempt.subscription_id,
                v_attempt.result, v_attempt.cycle_before, v_attempt.cycle_after,
                v_attempt.invoice_id, v_attempt.error_code, v_attempt.error_message;
            RETURN;
        END IF;

        IF v_previous.id <> p_expected_cycle_id THEN
            SELECT i.id INTO v_invoice_id
            FROM public.subscription_invoices i
            WHERE i.subscription_id = p_subscription_id
              AND i.cycle_id = v_previous.id
            ORDER BY i.id
            LIMIT 1;

            INSERT INTO private.renewal_attempts(
                run_id, subscription_id, execution_source, result,
                cycle_before, cycle_after, invoice_id, idempotency_key
            ) VALUES (
                p_run_id, p_subscription_id, p_execution_source, 'already_renewed',
                v_expected.cycle_number, v_previous.cycle_number,
                v_invoice_id, p_idempotency_key
            )
            RETURNING * INTO v_attempt;
            RETURN QUERY SELECT v_attempt.attempt_id, v_attempt.subscription_id,
                v_attempt.result, v_attempt.cycle_before, v_attempt.cycle_after,
                v_attempt.invoice_id, v_attempt.error_code, v_attempt.error_message;
            RETURN;
        END IF;

        IF v_previous.ends_at > now() THEN
            INSERT INTO private.renewal_attempts(
                run_id, subscription_id, execution_source, result,
                cycle_before, cycle_after, invoice_id, idempotency_key
            ) VALUES (
                p_run_id, p_subscription_id, p_execution_source, 'not_due',
                v_previous.cycle_number, NULL, NULL, p_idempotency_key
            )
            RETURNING * INTO v_attempt;
            RETURN QUERY SELECT v_attempt.attempt_id, v_attempt.subscription_id,
                v_attempt.result, v_attempt.cycle_before, v_attempt.cycle_after,
                v_attempt.invoice_id, v_attempt.error_code, v_attempt.error_message;
            RETURN;
        END IF;

        v_new_cycle_id := private.create_next_subscription_cycle(p_subscription_id);

        SELECT * INTO v_new_cycle
        FROM public.subscription_cycles
        WHERE id = v_new_cycle_id
          AND subscription_id = p_subscription_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Cycle creation returned a missing cycle' USING ERRCODE = 'P0001';
        END IF;

        IF v_new_cycle.cycle_number <> v_previous.cycle_number + 1 THEN
            RAISE EXCEPTION 'Unexpected cycle number created: %, expected %',
                v_new_cycle.cycle_number, v_previous.cycle_number + 1 USING ERRCODE = 'P0001';
        END IF;

        IF v_new_cycle.starts_at <> v_previous.ends_at THEN
            RAISE EXCEPTION 'New cycle does not begin at previous cycle end' USING ERRCODE = 'P0001';
        END IF;

        v_invoice_id := private.create_subscription_invoice_authority(v_new_cycle.id);

        INSERT INTO private.renewal_attempts(
            run_id, subscription_id, execution_source, result,
            cycle_before, cycle_after, invoice_id, idempotency_key
        ) VALUES (
            p_run_id, p_subscription_id, p_execution_source, 'renewed',
            v_previous.cycle_number, v_new_cycle.cycle_number,
            v_invoice_id, p_idempotency_key
        )
        RETURNING * INTO v_attempt;

    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS
            v_error_code = RETURNED_SQLSTATE,
            v_error_message = MESSAGE_TEXT;

        IF v_previous.cycle_number IS NULL THEN
            INSERT INTO private.renewal_attempts(
                run_id, subscription_id, execution_source, result,
                cycle_before, cycle_after, invoice_id, idempotency_key,
                error_code, error_message
            ) VALUES (
                p_run_id, p_subscription_id, p_execution_source, 'anomalous',
                NULL, NULL, NULL, p_idempotency_key, v_error_code, v_error_message
            )
            RETURNING * INTO v_attempt;
        ELSE
            INSERT INTO private.renewal_attempts(
                run_id, subscription_id, execution_source, result,
                cycle_before, cycle_after, invoice_id, idempotency_key,
                error_code, error_message
            ) VALUES (
                p_run_id, p_subscription_id, p_execution_source, 'failed',
                v_previous.cycle_number, NULL, NULL, p_idempotency_key,
                v_error_code, v_error_message
            )
            RETURNING * INTO v_attempt;
        END IF;
    END;

    RETURN QUERY SELECT v_attempt.attempt_id, v_attempt.subscription_id,
        v_attempt.result, v_attempt.cycle_before, v_attempt.cycle_after,
        v_attempt.invoice_id, v_attempt.error_code, v_attempt.error_message;
END;
$function$


CREATE OR REPLACE FUNCTION public.activate_contribution_initiative(p_initiative_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_i public.contribution_initiatives; v_existing jsonb; r record; v_count int:=0; v_claimed boolean;
BEGIN
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'activate_initiative','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT result INTO v_existing FROM private.contribution_initiative_requests
    WHERE request_id=p_request_id AND operation='activate_initiative';
    RETURN v_existing;
  END IF;

  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_i.status <> 'draft' THEN RAISE EXCEPTION 'Initiative is not draft'; END IF;
  IF current_date > v_i.closing_date THEN RAISE EXCEPTION 'Cannot activate after closing date'; END IF;

  FOR r IN SELECT im.*,m.group_id AS member_group FROM public.contribution_initiative_members im JOIN public.members m ON m.id=im.member_id WHERE im.initiative_id=p_initiative_id ORDER BY im.member_id FOR UPDATE OF m LOOP
    IF r.member_group IS DISTINCT FROM v_i.group_id THEN RAISE EXCEPTION 'Participant group mismatch'; END IF;
    INSERT INTO public.contribution_initiative_obligations(initiative_id,initiative_member_id,member_id,amount_due,due_date)
    VALUES(v_i.id,r.id,r.member_id,r.amount,v_i.closing_date)
    ON CONFLICT(initiative_id,member_id) WHERE initiative_period_id IS NULL DO NOTHING;
    v_count:=v_count+1;
  END LOOP;

  UPDATE public.contribution_initiatives SET status='active',updated_at=now() WHERE id=v_i.id;
  v_existing=jsonb_build_object('status','active','initiative_id',v_i.id,'obligations_created',v_count);
  UPDATE private.contribution_initiative_requests
  SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_existing
  WHERE request_id=p_request_id AND operation='activate_initiative';
  RETURN v_existing;
END;
$function$


-- STAGE ONLY: production function definitions; ordinal rows 21-30 of 201.
-- Definitions captured read-only on 2026-10-14. Ordering is alphabetical, NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects must be reconciled separately.

CREATE OR REPLACE FUNCTION public.activate_custom_contribution(p_group_id uuid, p_period_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auth_user_id uuid := auth.uid(); v_actor_member_id uuid;
  v_period public.contribution_periods%rowtype; v_obligation_count integer := 0;
  v_result jsonb; v_payload jsonb; v_hash text; v_existing_hash text; v_existing_result jsonb;
begin
  if v_auth_user_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if p_group_id is null or p_period_id is null or p_request_id is null then raise exception 'GROUP_PERIOD_AND_REQUEST_ID_REQUIRED' using errcode='22023'; end if;
  if not exists (select 1 from public.groups g where g.id=p_group_id and g.owner_user_id=v_auth_user_id)
     and not public.cl_user_has_role(p_group_id,array['chairperson']::text[]) then
    raise exception 'CUSTOM_CONTRIBUTION_NOT_AUTHORIZED' using errcode='42501';
  end if;
  select m.id into v_actor_member_id from public.members m
  where m.group_id=p_group_id and (m.user_id=v_auth_user_id or m.auth_user_id=v_auth_user_id)
    and lower(coalesce(m.status,'active'))='active' and lower(coalesce(m.onboarding_status,'active'))='active'
  order by m.id limit 1;
  if v_actor_member_id is null then raise exception 'ACTIVE_GROUP_MEMBER_REQUIRED' using errcode='42501'; end if;
  select * into v_period from public.contribution_periods where id=p_period_id and group_id=p_group_id for update;
  if not found then raise exception 'CUSTOM_CONTRIBUTION_PERIOD_NOT_FOUND' using errcode='22023'; end if;
  if v_period.contribution_type_id is null then raise exception 'CUSTOM_CONTRIBUTION_TYPE_REQUIRED' using errcode='22023'; end if;
  if v_period.status not in ('draft','open') then raise exception 'CUSTOM_CONTRIBUTION_PERIOD_NOT_ACTIVATABLE' using errcode='22023'; end if;
  v_payload:=jsonb_build_object('group_id',p_group_id,'period_id',p_period_id,'contribution_type_id',v_period.contribution_type_id);
  v_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('chama-live:custom-contribution-request:'||p_request_id::text||':activate',0));
  select r.payload_hash,r.result into v_existing_hash,v_existing_result from private.custom_contribution_activation_requests r where r.request_id=p_request_id for update;
  if v_existing_hash is not null then
    if v_existing_hash<>v_hash then raise exception 'REQUEST_ID_REUSE_MISMATCH' using errcode='22023'; end if;
    if v_existing_result is null then raise exception 'REQUEST_ALREADY_CLAIMED_WITHOUT_RESULT' using errcode='55000'; end if;
    return jsonb_set(v_existing_result,'{replayed}','true'::jsonb,true);
  end if;
  insert into private.custom_contribution_activation_requests(request_id,group_id,contribution_type_id,period_id,payload_hash)
  values(p_request_id,p_group_id,v_period.contribution_type_id,v_period.id,v_hash);
  perform public.cl_2b_accounting_lock_range(p_group_id,date_trunc('month',v_period.opening_date)::date,date_trunc('month',v_period.closing_date)::date);
  insert into public.member_contribution_rules(group_id,member_id,contribution_type_id,amount,frequency,effective_from,effective_to,first_period_rule,status,created_by)
  select m.group_id,m.id,v_period.contribution_type_id,v_period.amount,v_period.frequency,v_period.opening_date,v_period.closing_date,'full_period','active',v_actor_member_id
  from public.members m
  where m.group_id=p_group_id and lower(coalesce(m.status,'active'))='active' and lower(coalesce(m.onboarding_status,'active'))='active'
    and not exists(select 1 from public.member_contribution_rules r where r.group_id=m.group_id and r.member_id=m.id and r.contribution_type_id=v_period.contribution_type_id and r.effective_from=v_period.opening_date and r.effective_to=v_period.closing_date);
  insert into public.contribution_obligations(group_id,member_id,contribution_type_id,obligation_month,due_amount,period_id)
  select r.group_id,r.member_id,r.contribution_type_id,date_trunc('month',v_period.due_date)::date,r.amount,v_period.id
  from public.member_contribution_rules r
  where r.group_id=p_group_id and r.contribution_type_id=v_period.contribution_type_id and r.effective_from=v_period.opening_date and r.effective_to=v_period.closing_date and r.status='active'
    and not exists(select 1 from public.contribution_obligations o where o.group_id=r.group_id and o.member_id=r.member_id and o.contribution_type_id=r.contribution_type_id and o.obligation_month=date_trunc('month',v_period.due_date)::date and o.component_kind='PARENT');
  get diagnostics v_obligation_count=row_count;
  update public.contribution_periods set status='open' where id=v_period.id and group_id=p_group_id;
  v_result:=jsonb_build_object('ok',true,'operation','activate','replayed',false,'contribution_type_id',v_period.contribution_type_id,'period_id',v_period.id,'status','open','ongoing',true,'obligations_created',v_obligation_count);
  update private.custom_contribution_activation_requests set result=v_result,completed_at=now() where request_id=p_request_id;
  return v_result;
end;$function$


CREATE OR REPLACE FUNCTION public.activate_member_account(p_member_number text)
 RETURNS members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_member public.members;
begin
 if v_uid is null then raise exception 'Not authenticated'; end if;
 select * into v_member from public.members where member_number=trim(p_member_number) and onboarding_status='pending' limit 1;
 if v_member.id is null then raise exception 'Pending member account not found'; end if;
 if v_member.email is not null and exists(select 1 from auth.users where id=v_uid and lower(email)<>lower(v_member.email)) then raise exception 'This login email does not match the invited member email'; end if;
 update public.members set user_id=v_uid,auth_user_id=v_uid,onboarding_status='active',activated_at=now() where id=v_member.id returning * into v_member;
 return v_member;
end; $function$


CREATE OR REPLACE FUNCTION public.activate_other_contribution_cycle(p_cycle_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid:=auth.uid(); v_cycle public.contribution_periods%ROWTYPE;
  v_request private.other_contribution_cycle_requests%ROWTYPE;
  v_payload_hash text; v_expected_count bigint; v_actual_count bigint;
  v_collision_count bigint; v_missing_count bigint; v_extra_count bigint;
  v_existing_activation boolean; v_existing_generation boolean; v_snapshot jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_cycle_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Cycle id and request id are required';
  END IF;
  PERFORM private.cl_other_request_lock(p_request_id,'activate');
  v_payload_hash:=md5(jsonb_build_object('cycle_id',p_cycle_id)::text);
  SELECT * INTO v_request FROM private.other_contribution_cycle_requests r
  WHERE r.request_id=p_request_id AND r.operation='activate';
  IF FOUND THEN
    IF v_request.payload_hash<>v_payload_hash THEN
      RAISE EXCEPTION 'Activation request was previously used for another payload';
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
  PERFORM private.cl_other_assert_type(v_cycle.group_id,v_cycle.contribution_type_id);
  IF v_cycle.name IS NULL OR btrim(v_cycle.name)='' THEN RAISE EXCEPTION 'Cycle name required at activation'; END IF;
  IF v_cycle.amount IS NULL OR v_cycle.amount<=0 THEN RAISE EXCEPTION 'Cycle amount invalid at activation'; END IF;
  IF v_cycle.frequency NOT IN ('monthly','one_time') THEN RAISE EXCEPTION 'Cycle frequency invalid at activation'; END IF;
  IF v_cycle.period_key IS NULL OR btrim(v_cycle.period_key)='' OR length(btrim(v_cycle.period_key))>100 THEN
    RAISE EXCEPTION 'Cycle period key invalid at activation';
  END IF;
  IF v_cycle.opening_date IS NULL OR v_cycle.due_date IS NULL OR v_cycle.closing_date IS NULL
     OR v_cycle.opening_date>v_cycle.due_date OR v_cycle.due_date>v_cycle.closing_date THEN
    RAISE EXCEPTION 'Cycle dates invalid at activation';
  END IF;
  PERFORM private.cl_other_assert_fine_rule(
    v_cycle.group_id,v_cycle.contribution_type_id,v_cycle.fine_rule_id,
    v_cycle.opening_date,v_cycle.closing_date);

  IF v_cycle.status<>'draft' THEN
    IF v_cycle.status='cancelled' THEN RAISE EXCEPTION 'Cancelled cycle cannot be activated'; END IF;
    IF v_cycle.status NOT IN ('open','due','grace','closed') THEN
      RAISE EXCEPTION 'Cycle status % is not an activation state',v_cycle.status;
    END IF;
    SELECT EXISTS(SELECT 1 FROM private.other_contribution_cycle_audit a
                  WHERE a.cycle_id=v_cycle.id AND a.action='CYCLE_ACTIVATED'),
           EXISTS(SELECT 1 FROM private.other_contribution_cycle_audit a
                  WHERE a.cycle_id=v_cycle.id AND a.action='CYCLE_OBLIGATIONS_GENERATED')
      INTO v_existing_activation,v_existing_generation;
    SELECT a.details->'eligible_member_ids' INTO v_snapshot
    FROM private.other_contribution_cycle_audit a
    WHERE a.cycle_id=v_cycle.id AND a.action='CYCLE_OBLIGATIONS_GENERATED'
    ORDER BY a.created_at LIMIT 1;
    SELECT count(*) INTO v_expected_count
    FROM jsonb_array_elements_text(coalesce(v_snapshot,'[]'::jsonb));
    SELECT count(*) INTO v_actual_count
    FROM public.contribution_obligations o
    WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
      AND o.contribution_type_id=v_cycle.contribution_type_id
      AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL;
    IF NOT v_existing_activation OR NOT v_existing_generation OR v_snapshot IS NULL
       OR v_expected_count<>v_actual_count THEN
      RAISE EXCEPTION 'Activated cycle % is not canonically complete',v_cycle.id;
    END IF;
    IF EXISTS(SELECT 1 FROM(
      SELECT o.member_id::text member_id FROM public.contribution_obligations o
      WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
        AND o.contribution_type_id=v_cycle.contribution_type_id
        AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL
      EXCEPT SELECT jsonb_array_elements_text(v_snapshot)) s)
       OR EXISTS(SELECT 1 FROM(
      SELECT jsonb_array_elements_text(v_snapshot) member_id
      EXCEPT SELECT o.member_id::text FROM public.contribution_obligations o
      WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
        AND o.contribution_type_id=v_cycle.contribution_type_id
        AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL
    ) s) THEN
      RAISE EXCEPTION 'Activated cycle % has a frozen eligibility/member-set mismatch',v_cycle.id;
    END IF;
    IF EXISTS(SELECT 1 FROM public.contribution_obligations o
              WHERE o.period_id=v_cycle.id
                AND (o.group_id IS DISTINCT FROM v_cycle.group_id
                  OR o.contribution_type_id IS DISTINCT FROM v_cycle.contribution_type_id
                  OR o.component_kind IS DISTINCT FROM 'PARENT'
                  OR o.parent_obligation_id IS NOT NULL OR o.rule_id IS NOT NULL
                  OR o.obligation_month IS DISTINCT FROM date_trunc('month',v_cycle.opening_date)::date
                  OR o.economic_month IS DISTINCT FROM date_trunc('month',v_cycle.opening_date)::date
                  OR o.due_amount IS DISTINCT FROM v_cycle.amount)) THEN
      RAISE EXCEPTION 'Activated cycle contains invalid obligation identity';
    END IF;
    INSERT INTO private.other_contribution_cycle_requests(
      request_id,operation,cycle_id,group_id,payload_hash,result,completed_at)
    VALUES(p_request_id,'activate',v_cycle.id,v_cycle.group_id,v_payload_hash,
           jsonb_build_object('ok',true,'cycle_id',v_cycle.id,'group_id',v_cycle.group_id,
                              'status',v_cycle.status,'expected_members',v_expected_count,
                              'created_parents',v_actual_count,'idempotent_replay',true,
                              'cycle_level_idempotent',true),now())
    ON CONFLICT(request_id,operation) DO UPDATE
      SET cycle_id=EXCLUDED.cycle_id,group_id=EXCLUDED.group_id,
          payload_hash=EXCLUDED.payload_hash,result=EXCLUDED.result,
          completed_at=EXCLUDED.completed_at;
    RETURN jsonb_build_object('ok',true,'cycle_id',v_cycle.id,'group_id',v_cycle.group_id,
                              'status',v_cycle.status,'expected_members',v_expected_count,
                              'created_parents',v_actual_count,'idempotent_replay',true,
                              'cycle_level_idempotent',true);
  END IF;

  IF EXISTS(SELECT 1 FROM public.contribution_periods cp
            WHERE cp.id<>v_cycle.id AND cp.group_id=v_cycle.group_id
              AND cp.contribution_type_id=v_cycle.contribution_type_id
              AND lower(cp.status) IN ('scheduled','open','due','grace')
              AND cp.opening_date<=v_cycle.closing_date AND cp.closing_date>=v_cycle.opening_date) THEN
    RAISE EXCEPTION 'Another active/scheduled Other cycle overlaps this cycle';
  END IF;

  PERFORM 1 FROM public.members m
  WHERE m.group_id=v_cycle.group_id
    AND lower(coalesce(m.status,''))='active'
    AND lower(coalesce(m.onboarding_status,''))='active'
    AND m.join_date<=v_cycle.opening_date
  ORDER BY m.id FOR UPDATE;

  SELECT count(*) INTO v_expected_count FROM public.members m
  WHERE m.group_id=v_cycle.group_id
    AND lower(coalesce(m.status,''))='active'
    AND lower(coalesce(m.onboarding_status,''))='active'
    AND m.join_date<=v_cycle.opening_date;

  SELECT count(*) INTO v_collision_count FROM public.contribution_obligations o
  WHERE o.period_id=v_cycle.id;
  IF v_collision_count>v_expected_count THEN
    RAISE EXCEPTION 'Cycle has more obligations than eligible members';
  END IF;

  IF EXISTS(SELECT 1 FROM public.contribution_obligations o
            WHERE o.period_id=v_cycle.id
              AND (o.group_id IS DISTINCT FROM v_cycle.group_id
                OR o.contribution_type_id IS DISTINCT FROM v_cycle.contribution_type_id
                OR o.component_kind IS DISTINCT FROM 'PARENT'
                OR o.parent_obligation_id IS NOT NULL OR o.rule_id IS NOT NULL
                OR o.obligation_month IS DISTINCT FROM date_trunc('month',v_cycle.opening_date)::date
                OR o.economic_month IS DISTINCT FROM date_trunc('month',v_cycle.opening_date)::date
                OR o.due_amount IS DISTINCT FROM v_cycle.amount)) THEN
    RAISE EXCEPTION 'Cycle contains unexpected obligation identity';
  END IF;

  INSERT INTO public.contribution_obligations(
    group_id,member_id,obligation_month,due_amount,contribution_type_id,rule_id,
    period_id,component_kind,lifecycle_state,parent_obligation_id)
  SELECT v_cycle.group_id,m.id,date_trunc('month',v_cycle.opening_date)::date,v_cycle.amount,
         v_cycle.contribution_type_id,NULL,v_cycle.id,'PARENT','ACTIVE',NULL
  FROM public.members m
  WHERE m.group_id=v_cycle.group_id
    AND lower(coalesce(m.status,''))='active'
    AND lower(coalesce(m.onboarding_status,''))='active'
    AND m.join_date<=v_cycle.opening_date
    AND NOT EXISTS(SELECT 1 FROM public.contribution_obligations o
                   WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
                     AND o.member_id=m.id AND o.contribution_type_id=v_cycle.contribution_type_id
                     AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL
                     AND o.rule_id IS NULL);

  PERFORM 1 FROM public.contribution_obligations o
  WHERE o.period_id=v_cycle.id AND o.group_id=v_cycle.group_id
    AND o.contribution_type_id=v_cycle.contribution_type_id
    AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL
  ORDER BY o.member_id,o.id FOR UPDATE;

  SELECT count(*) INTO v_actual_count FROM public.contribution_obligations o
  WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
    AND o.contribution_type_id=v_cycle.contribution_type_id
    AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL;

  SELECT count(*) INTO v_missing_count FROM(
    SELECT m.id FROM public.members m
    WHERE m.group_id=v_cycle.group_id AND lower(coalesce(m.status,''))='active'
      AND lower(coalesce(m.onboarding_status,''))='active' AND m.join_date<=v_cycle.opening_date
    EXCEPT SELECT o.member_id FROM public.contribution_obligations o
    WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
      AND o.contribution_type_id=v_cycle.contribution_type_id
      AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL) s;
  SELECT count(*) INTO v_extra_count FROM(
    SELECT o.member_id FROM public.contribution_obligations o
    WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
      AND o.contribution_type_id=v_cycle.contribution_type_id
      AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL
    EXCEPT SELECT m.id FROM public.members m
    WHERE m.group_id=v_cycle.group_id AND lower(coalesce(m.status,''))='active'
      AND lower(coalesce(m.onboarding_status,''))='active' AND m.join_date<=v_cycle.opening_date) s;
  IF v_expected_count<>v_actual_count OR v_missing_count<>0 OR v_extra_count<>0 THEN
    RAISE EXCEPTION 'Other cycle conservation failed: expected %, actual %, missing %, extra %',
      v_expected_count,v_actual_count,v_missing_count,v_extra_count;
  END IF;

  INSERT INTO private.other_contribution_cycle_requests(
    request_id,operation,cycle_id,group_id,payload_hash,result,completed_at)
  VALUES(p_request_id,'activate',v_cycle.id,v_cycle.group_id,v_payload_hash,
         jsonb_build_object('ok',true,'cycle_id',v_cycle.id,'group_id',v_cycle.group_id,
                            'status','open','expected_members',v_expected_count,
                            'created_parents',v_actual_count,'idempotent_replay',false,
                            'cycle_level_idempotent',false),now())
  ON CONFLICT(request_id,operation) DO UPDATE
    SET cycle_id=EXCLUDED.cycle_id,group_id=EXCLUDED.group_id,
        payload_hash=EXCLUDED.payload_hash,result=EXCLUDED.result,
        completed_at=EXCLUDED.completed_at;

  INSERT INTO private.other_contribution_cycle_audit(
    cycle_id,group_id,action,actor_user_id,request_id,request_operation,details)
  VALUES(v_cycle.id,v_cycle.group_id,'CYCLE_OBLIGATIONS_GENERATED',v_actor,p_request_id,'activate',
         jsonb_build_object('expected_members',v_expected_count,'created_parents',v_actual_count,
                            'missing_members',v_missing_count,'extra_members',v_extra_count,
                            'eligible_member_ids',(
                              SELECT coalesce(jsonb_agg(m.id ORDER BY m.id),'[]'::jsonb)
                              FROM public.members m
                              WHERE m.group_id=v_cycle.group_id
                                AND lower(coalesce(m.status,''))='active'
                                AND lower(coalesce(m.onboarding_status,''))='active'
                                AND m.join_date<=v_cycle.opening_date)));

  INSERT INTO private.other_contribution_cycle_audit(
    cycle_id,group_id,action,actor_user_id,request_id,request_operation,details)
  VALUES(v_cycle.id,v_cycle.group_id,'CYCLE_ACTIVATED',v_actor,p_request_id,'activate',
         jsonb_build_object('previous_status',v_cycle.status,'new_status','open',
                            'expected_members',v_expected_count,'created_parents',v_actual_count));

  UPDATE public.contribution_periods SET status='open'
  WHERE id=v_cycle.id AND status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cycle could not transition draft to open'; END IF;

  RETURN jsonb_build_object('ok',true,'cycle_id',v_cycle.id,'group_id',v_cycle.group_id,
                            'status','open','expected_members',v_expected_count,
                            'created_parents',v_actual_count,'idempotent_replay',false,
                            'cycle_level_idempotent',false);
END $function$


CREATE OR REPLACE FUNCTION public.activate_recurring_contribution_initiative(p_initiative_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives; v_count integer; v_existing jsonb; v_claimed boolean;
  v_request jsonb; v_request_initiative_id uuid; v_request_group_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request id is required'; END IF;
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Initiative not found'; END IF;
  IF NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'activate_recurring_initiative','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT result,initiative_id,group_id INTO v_request,v_request_initiative_id,v_request_group_id
    FROM private.contribution_initiative_requests
    WHERE request_id=p_request_id AND operation='activate_recurring_initiative' FOR UPDATE;
    IF v_request_initiative_id IS DISTINCT FROM v_i.id OR v_request_group_id IS DISTINCT FROM v_i.group_id THEN
      RAISE EXCEPTION 'Request id is already bound to another initiative';
    END IF;
    RETURN v_request || jsonb_build_object('idempotent',true);
  END IF;
  IF v_i.frequency <> 'monthly' THEN RAISE EXCEPTION 'Initiative is not monthly'; END IF;
  IF v_i.status <> 'draft' THEN RAISE EXCEPTION 'Initiative is not draft'; END IF;
  IF current_date > v_i.closing_date THEN RAISE EXCEPTION 'Initiative closing date has passed'; END IF;
  SELECT count(*) INTO v_count FROM public.contribution_initiative_members im
  WHERE im.initiative_id=v_i.id AND lower(coalesce(im.status,'active'))='active';
  IF v_count=0 THEN RAISE EXCEPTION 'Recurring initiative requires at least one active participant'; END IF;
  IF EXISTS (SELECT 1 FROM public.contribution_initiative_members im
    WHERE im.initiative_id=v_i.id AND lower(coalesce(im.status,'active'))='active'
      AND NOT EXISTS (SELECT 1 FROM public.contribution_initiative_member_terms t
        WHERE t.initiative_member_id=im.id
          AND t.effective_from <= (date_trunc('month',v_i.start_date)::date + CASE WHEN v_i.start_date > date_trunc('month',v_i.start_date)::date THEN interval '1 month' ELSE interval '0 month' END)
          AND t.status='active'))
  THEN RAISE EXCEPTION 'Every active recurring participant requires an effective term'; END IF;
  UPDATE public.contribution_initiatives SET status='active',updated_at=now() WHERE id=v_i.id;
  v_existing=jsonb_build_object('status','active','initiative_id',v_i.id,'participant_count',v_count);
  UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_existing
  WHERE request_id=p_request_id AND operation='activate_recurring_initiative';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.add_group_member(p_group_id uuid, p_name text, p_member_number text DEFAULT NULL::text, p_membership_number text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_role text DEFAULT 'member'::text, p_join_date date DEFAULT CURRENT_DATE)
 RETURNS members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_member public.members;
  v_role text;
  v_member_number text;
  v_membership_number text;
  v_next_number integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT lower(m.role)
    INTO v_role
  FROM public.members m
  WHERE m.group_id = p_group_id
    AND (m.user_id = (SELECT auth.uid()) OR m.auth_user_id = (SELECT auth.uid()))
    AND lower(coalesce(m.status,'active')) = 'active'
    AND lower(coalesce(m.onboarding_status,'active')) = 'active'
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('admin','chairperson') THEN
    RAISE EXCEPTION 'Only a group admin or chairperson can add members';
  END IF;

  IF nullif(trim(p_name),'') IS NULL THEN
    RAISE EXCEPTION 'Member name is required';
  END IF;

  IF nullif(trim(p_phone),'') IS NULL THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;

  IF lower(coalesce(p_role,'member')) NOT IN ('member','secretary','treasurer','chairperson','admin') THEN
    RAISE EXCEPTION 'Invalid member role';
  END IF;

  -- Generate the next 4-digit member number when the frontend does not supply one.
  IF nullif(trim(p_member_number),'') IS NULL THEN
    SELECT coalesce(max(NULLIF(regexp_replace(m.member_number, '[^0-9]', '', 'g'), '')::integer), 0) + 1
      INTO v_next_number
    FROM public.members m
    WHERE m.group_id = p_group_id;

    v_member_number := lpad(v_next_number::text, 4, '0');
  ELSE
    v_member_number := trim(p_member_number);
  END IF;

  -- Keep membership_number synchronized with member_number when omitted.
  v_membership_number := coalesce(nullif(trim(p_membership_number), ''), v_member_number);

  IF EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.group_id = p_group_id
      AND (
        m.member_number = v_member_number
        OR m.membership_number = v_membership_number
      )
  ) THEN
    RAISE EXCEPTION 'Member number or membership number already exists in this group';
  END IF;

  INSERT INTO public.members (
    group_id,
    member_number,
    membership_number,
    name,
    phone,
    email,
    role,
    join_date,
    status,
    onboarding_status,
    invited_at
  )
  VALUES (
    p_group_id,
    v_member_number,
    v_membership_number,
    trim(p_name),
    trim(p_phone),
    nullif(trim(p_email),''),
    lower(coalesce(p_role,'member')),
    coalesce(p_join_date,current_date),
    'active',
    'pending',
    now()
  )
  RETURNING * INTO v_member;

  PERFORM private.append_platform_activity(
      'member_created',
      jsonb_build_object(
          'group_id', v_member.group_id,
          'member_id', v_member.id,
          'member_role', v_member.role
      )
  );

  RETURN v_member;
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_renew_subscription(p_subscription_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_subscription public.group_subscriptions%ROWTYPE;
    v_latest_cycle public.subscription_cycles%ROWTYPE;
    v_current_cycle public.subscription_cycles%ROWTYPE;
    v_run_id uuid;
    v_attempt record;
    v_key text;
    v_return_cycle_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Platform administrator privileges required' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('chama_live_subscription:' || p_subscription_id::text, 0)
    );

    SELECT * INTO v_subscription
    FROM public.group_subscriptions
    WHERE id = p_subscription_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription % does not exist', p_subscription_id USING ERRCODE = 'P0002';
    END IF;

    IF v_subscription.status <> 'active' THEN
        RAISE EXCEPTION 'Subscription % is not active', p_subscription_id USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_latest_cycle
    FROM public.subscription_cycles
    WHERE subscription_id = p_subscription_id
    ORDER BY cycle_number DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription % has no existing cycle', p_subscription_id USING ERRCODE = 'P0001';
    END IF;

    v_key := 'human:' || p_subscription_id::text || ':' || v_latest_cycle.id::text;

    SELECT rr.run_id INTO v_run_id
    FROM private.renewal_runs rr
    WHERE rr.idempotency_key = v_key;

    IF NOT FOUND THEN
        INSERT INTO private.renewal_runs(execution_source, idempotency_key)
        VALUES ('human', v_key)
        RETURNING run_id INTO v_run_id;
    END IF;

    SELECT * INTO v_attempt
    FROM private.renew_subscription_authority(
        p_subscription_id,
        v_latest_cycle.id,
        v_run_id,
        v_key,
        'human'
    );

    UPDATE private.renewal_runs
    SET status = 'completed',
        completed_at = now(),
        error_code = CASE WHEN v_attempt.result = 'failed' THEN v_attempt.error_code ELSE NULL END,
        error_message = CASE WHEN v_attempt.result = 'failed' THEN v_attempt.error_message ELSE NULL END
    WHERE run_id = v_run_id
      AND status = 'running';

    IF v_attempt.result IN ('renewed','already_renewed') THEN
        SELECT id INTO v_return_cycle_id
        FROM public.subscription_cycles
        WHERE subscription_id = p_subscription_id
          AND cycle_number = v_attempt.cycle_after
        LIMIT 1;

        IF v_return_cycle_id IS NULL THEN
            RAISE EXCEPTION 'Renewal result did not resolve a cycle id' USING ERRCODE = 'P0001';
        END IF;

        IF v_attempt.result = 'renewed' THEN
            PERFORM private.append_platform_activity(
                'subscription_renewed',
                jsonb_build_object(
                    'subscription_id', p_subscription_id,
                    'cycle_id', v_return_cycle_id
                )
            );
        END IF;

        RETURN v_return_cycle_id;
    END IF;

    IF v_attempt.result = 'not_due' THEN
        RAISE EXCEPTION 'Subscription cycle % has not ended', v_latest_cycle.cycle_number USING ERRCODE = 'P0001';
    END IF;

    RAISE EXCEPTION 'Subscription renewal failed or was anomalous: %',
        coalesce(v_attempt.error_message, 'unknown renewal result') USING ERRCODE = 'P0001';
END;
$function$


CREATE OR REPLACE FUNCTION public.approve_group_application(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    a public.group_applications%ROWTYPE;
    v_group_id uuid;
    v_member_id uuid;
    v_member_number text;
    v_access_code text;
    v_subscription_id uuid;
    v_cycle_id uuid;
    v_activated_at timestamptz;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Platform administrator access required'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO a
    FROM public.group_applications
    WHERE id = p_application_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
    IF a.status = 'approved' THEN RAISE EXCEPTION 'Application is already approved'; END IF;
    IF a.status = 'rejected' THEN RAISE EXCEPTION 'Rejected applications cannot be approved'; END IF;

    IF nullif(btrim(coalesce(a.location, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Application location is required';
    END IF;

    IF nullif(btrim(coalesce(a.town, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Application town is required';
    END IF;

    v_activated_at := now();
    v_access_code := public.generate_group_access_code(a.group_name);

    INSERT INTO public.groups (
        name, category, monthly_contribution, opening_balance, description,
        country, location, town, access_code, phone, email, owner_user_id
    )
    VALUES (
        a.group_name, coalesce(a.category, 'other'), 0, 0, a.description,
        coalesce(a.country, 'Kenya'), btrim(a.location), btrim(a.town),
        v_access_code, a.admin_phone, a.email, a.auth_user_id
    )
    RETURNING id INTO v_group_id;

    SELECT lpad(
        (coalesce(max(nullif(membership_number, '')::integer), 0) + 1)::text,
        4, '0'
    )
    INTO v_member_number
    FROM public.members
    WHERE group_id = v_group_id;

    INSERT INTO public.members (
        group_id, user_id, auth_user_id, member_number, membership_number,
        name, phone, email, role, status, onboarding_status, invited_at, activated_at
    )
    VALUES (
        v_group_id, a.auth_user_id, a.auth_user_id, v_member_number,
        v_member_number, a.admin_name, a.admin_phone, a.email, 'admin',
        'active', 'active', v_activated_at, v_activated_at
    )
    RETURNING id INTO v_member_id;

    INSERT INTO public.contribution_types (group_id, name, code, created_by)
    SELECT v_group_id, 'Monthly', 'monthly', v_member_id
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.contribution_types ct
        WHERE ct.group_id = v_group_id
          AND (
              lower(trim(ct.name)) = 'monthly'
              OR lower(trim(coalesce(ct.code, ''))) = 'monthly'
          )
    );

    INSERT INTO public.financial_periods (group_id, month, opening_balance, status)
    VALUES (v_group_id, to_char(v_activated_at::date, 'YYYY-MM'), 0, 'open');

    v_subscription_id := private.initialize_group_subscription(v_group_id, v_activated_at);
    v_cycle_id := private.create_next_subscription_cycle(v_subscription_id);
    PERFORM public.create_subscription_invoice(v_cycle_id);

    IF NOT EXISTS (
        SELECT 1 FROM public.subscription_cycles sc
        WHERE sc.id = v_cycle_id
          AND sc.subscription_id = v_subscription_id
          AND sc.cycle_number = 1
    ) THEN
        RAISE EXCEPTION 'Subscription initialization failed to create Cycle 1';
    END IF;

    UPDATE public.group_applications
    SET status = 'approved',
        reviewed_at = v_activated_at,
        reviewed_by = auth.uid(),
        updated_at = v_activated_at,
        approved_group_id = v_group_id,
        approved_member_id = v_member_id,
        approved_member_number = v_member_number,
        access_code = v_access_code
    WHERE id = p_application_id;

    PERFORM private.append_platform_activity(
        'group_application_reviewed',
        jsonb_build_object('application_id', a.id, 'group_name', a.group_name)
    );

    PERFORM private.append_platform_activity(
        'group_approved',
        jsonb_build_object(
            'application_id', a.id, 'group_id', v_group_id,
            'group_name', a.group_name, 'location', a.location, 'town', a.town
        )
    );

    PERFORM private.append_platform_activity(
        'group_created',
        jsonb_build_object(
            'application_id', a.id, 'group_id', v_group_id,
            'group_name', a.group_name, 'location', a.location, 'town', a.town
        )
    );

    PERFORM private.append_platform_activity(
        'member_created',
        jsonb_build_object(
            'application_id', a.id, 'group_id', v_group_id,
            'member_id', v_member_id, 'member_role', 'admin'
        )
    );

    RETURN jsonb_build_object(
        'success', true, 'application_id', a.id, 'group_id', v_group_id,
        'member_id', v_member_id, 'member_number', v_member_number,
        'access_code', v_access_code, 'role', 'admin', 'email', a.email,
        'admin_name', a.admin_name, 'group_name', a.group_name
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.can_add_group_members(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    public.current_user_role(p_group_id) IN ('admin', 'chairperson', 'treasurer'),
    false
  );
$function$


CREATE OR REPLACE FUNCTION public.can_manage_members(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.current_user_role(p_group_id) in ('admin','chairperson'), false);
$function$


CREATE OR REPLACE FUNCTION public.charge_payments_guard_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Charge payment allocations are immutable';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Charge payment allocations are immutable';
    END IF;

    RETURN NEW;
END;
$function$


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


-- STAGE ONLY: production function definitions; ordinal rows 41-50 of 201.
-- Definitions captured read-only on 2026-10-14. Ordering is alphabetical, NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects must be reconciled separately.

CREATE OR REPLACE FUNCTION public.cl_fine_create_rule(p_group_id uuid, p_name text, p_description text, p_trigger_type text, p_specificity_level smallint, p_priority integer, p_calculation_method text, p_fixed_amount numeric, p_percentage_rate numeric, p_minimum_amount numeric, p_maximum_amount numeric, p_grace_period_value integer, p_grace_period_unit text, p_applicability_mode text, p_effective_from timestamp with time zone, p_effective_until timestamp with time zone, p_contribution_type_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_actor uuid := auth.uid();
  v_month text;
  v_member_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF NOT public.cl_user_has_role(p_group_id, ARRAY['chairperson','treasurer']::text[]) THEN
    RAISE EXCEPTION 'Fine-rule management requires chairperson or treasurer' USING ERRCODE='42501';
  END IF;
  IF p_group_id IS NULL OR p_effective_from IS NULL THEN
    RAISE EXCEPTION 'Group and effective_from are required';
  END IF;
  IF btrim(coalesce(p_name,'')) = '' THEN
    RAISE EXCEPTION 'Rule name is required';
  END IF;
  IF p_specificity_level NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Invalid specificity level';
  END IF;
  IF p_trigger_type NOT IN ('missed_contribution','meeting_absence','late_attendance','custom_event') THEN
    RAISE EXCEPTION 'Invalid trigger type';
  END IF;
  IF p_applicability_mode IN ('ALL','SELECTED') AND p_trigger_type <> 'missed_contribution' THEN
    RAISE EXCEPTION 'Contribution applicability mode is only valid for contribution fines';
  END IF;
  IF p_trigger_type = 'missed_contribution' AND p_applicability_mode NOT IN ('ALL','SELECTED') THEN
    RAISE EXCEPTION 'Invalid contribution applicability mode';
  END IF;
  IF p_trigger_type <> 'missed_contribution' AND p_applicability_mode NOT IN ('ALL_MEETINGS') THEN
    RAISE EXCEPTION 'Invalid non-contribution applicability mode';
  END IF;
  IF p_trigger_type <> 'missed_contribution' AND p_contribution_type_ids IS NOT NULL AND cardinality(p_contribution_type_ids) > 0 THEN
    RAISE EXCEPTION 'Contribution types are only valid for contribution rules';
  END IF;

  v_month := to_char(date_trunc('month', p_effective_from)::date, 'YYYY-MM');
  PERFORM private.cl_fine_config_lock(p_group_id);
  PERFORM private.cl_fine_lock(p_group_id, v_month);

  SELECT m.id INTO v_member_id
  FROM public.members m
  WHERE m.group_id=p_group_id
    AND (m.auth_user_id=v_actor OR m.user_id=v_actor)
    AND lower(m.status)='active'
    AND lower(m.onboarding_status)='active'
  ORDER BY m.id LIMIT 1;
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Active group membership required' USING ERRCODE='42501';
  END IF;

  IF p_trigger_type='missed_contribution' AND p_applicability_mode='SELECTED' THEN
    IF p_contribution_type_ids IS NULL OR cardinality(p_contribution_type_ids)=0 THEN
      RAISE EXCEPTION 'Selected contribution rules require contribution types';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.contribution_types ct
      WHERE ct.id = ANY(p_contribution_type_ids)
        AND ct.group_id <> p_group_id
    ) OR EXISTS (
      SELECT 1
      FROM unnest(p_contribution_type_ids) x(id)
      WHERE NOT EXISTS (SELECT 1 FROM public.contribution_types ct WHERE ct.id=x.id)
    ) THEN
      RAISE EXCEPTION 'Selected contribution type does not belong to the rule group';
    END IF;
  END IF;

  -- Manual custom_event rules are selectable fine types, not competing
  -- automatic rules. Keep conflict detection for all automatic triggers.
  IF p_trigger_type <> 'custom_event' AND EXISTS (
    SELECT 1 FROM public.fine_rules r
    WHERE r.group_id=p_group_id
      AND r.trigger_type=p_trigger_type
      AND r.status='active'
      AND r.specificity_level=p_specificity_level
      AND r.priority=p_priority
      AND r.effective_from <= coalesce(p_effective_until,'infinity'::timestamptz)
      AND coalesce(r.effective_until,'infinity'::timestamptz) >= p_effective_from
  ) THEN
    RAISE EXCEPTION 'Equal specificity and priority rule conflict';
  END IF;

  INSERT INTO public.fine_rules(
    group_id,name,description,trigger_type,specificity_level,priority,
    calculation_method,fixed_amount,percentage_rate,minimum_amount,maximum_amount,
    grace_period_value,grace_period_unit,applicability_mode,effective_from,effective_until,
    status,created_by,updated_by
  ) VALUES (
    p_group_id,btrim(p_name),p_description,p_trigger_type,p_specificity_level,p_priority,
    p_calculation_method,p_fixed_amount,p_percentage_rate,p_minimum_amount,p_maximum_amount,
    p_grace_period_value,p_grace_period_unit,p_applicability_mode,p_effective_from,p_effective_until,
    'active',v_actor,v_actor
  ) RETURNING id INTO v_id;

  IF p_trigger_type='missed_contribution' AND p_applicability_mode='SELECTED' THEN
    INSERT INTO public.fine_rule_contribution_types(rule_id, contribution_type_id)
    SELECT v_id, x.id FROM unnest(p_contribution_type_ids) x(id);
  END IF;

  RETURN v_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_fine_generate_contribution(p_group_id uuid, p_member_id uuid, p_obligation_id uuid, p_triggered_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_obligation public.contribution_obligations%ROWTYPE;
  v_rule public.fine_rules%ROWTYPE;
  v_fine_id uuid;
  v_actor uuid := auth.uid();
  v_month text;
  v_close_at timestamptz;
  v_fine_eligible_at timestamptz;
  v_base numeric(14,2);
  v_amount numeric(14,2);
  v_period public.financial_periods%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT public.cl_user_has_role(p_group_id, ARRAY['chairperson','treasurer']::text[]) THEN
    RAISE EXCEPTION 'Fine generation requires chairperson or treasurer' USING ERRCODE='42501';
  END IF;

  SELECT o.* INTO v_obligation
  FROM public.contribution_obligations o
  WHERE o.id=p_obligation_id;
  IF NOT FOUND OR v_obligation.group_id<>p_group_id OR v_obligation.member_id<>p_member_id THEN
    RAISE EXCEPTION 'Contribution obligation ownership mismatch';
  END IF;

  v_month := to_char(v_obligation.obligation_month,'YYYY-MM');
  PERFORM private.cl_fine_config_lock(p_group_id);
  PERFORM private.cl_fine_lock(p_group_id, v_month);

  SELECT o.* INTO v_obligation
  FROM public.contribution_obligations o
  WHERE o.id=p_obligation_id
  FOR UPDATE;
  IF v_obligation.group_id<>p_group_id OR v_obligation.member_id<>p_member_id THEN
    RAISE EXCEPTION 'Contribution obligation ownership changed';
  END IF;

  v_period := public.ensure_financial_period(p_group_id,v_month);
  IF lower(coalesce(v_period.status,'open'))='closed' THEN
    RAISE EXCEPTION 'Financial month % is closed',v_month;
  END IF;

  -- Current physical contract provides a group contribution calendar period.
  -- Resolve that authoritative closing date; no contribution-type override is
  -- assumed because no such physical relation was reconciled.
  SELECT (gcp.closing_date + interval '1 day') AT TIME ZONE 'Africa/Nairobi'
  INTO v_close_at
  FROM public.group_contribution_calendar_periods gcp
  WHERE gcp.group_id=p_group_id
    AND gcp.opening_date <= v_obligation.obligation_month
    AND gcp.closing_date >= v_obligation.obligation_month
  ORDER BY gcp.closing_date
  LIMIT 1;
  IF v_close_at IS NULL THEN
    RAISE EXCEPTION 'No authoritative contribution closing period configured';
  END IF;

  IF p_triggered_at < v_close_at THEN
    RAISE EXCEPTION 'Contribution has not crossed its closing boundary';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contribution_allocations a
    WHERE a.obligation_id=p_obligation_id
    GROUP BY a.obligation_id
    HAVING coalesce(sum(a.amount),0) >= v_obligation.due_amount
  ) THEN
    RAISE EXCEPTION 'Contribution obligation is settled; no missed-contribution fine';
  END IF;

  IF (
    SELECT count(*)
    FROM public.fine_rules r
    WHERE r.group_id=p_group_id
      AND r.trigger_type='missed_contribution'
      AND r.status='active'
      AND r.effective_from <= p_triggered_at
      AND (r.effective_until IS NULL OR r.effective_until >= p_triggered_at)
      AND (
        r.applicability_mode='ALL'
        OR EXISTS (
          SELECT 1 FROM public.fine_rule_contribution_types rt
          WHERE rt.rule_id=r.id AND rt.contribution_type_id=v_obligation.contribution_type_id
        )
      )
      AND r.specificity_level = (
        SELECT max(r2.specificity_level)
        FROM public.fine_rules r2
        WHERE r2.group_id=p_group_id
          AND r2.trigger_type='missed_contribution'
          AND r2.status='active'
          AND r2.effective_from <= p_triggered_at
          AND (r2.effective_until IS NULL OR r2.effective_until >= p_triggered_at)
          AND (r2.applicability_mode='ALL' OR EXISTS (
            SELECT 1 FROM public.fine_rule_contribution_types rt2
            WHERE rt2.rule_id=r2.id AND rt2.contribution_type_id=v_obligation.contribution_type_id
          ))
      )
      AND r.priority = (
        SELECT max(r3.priority)
        FROM public.fine_rules r3
        WHERE r3.group_id=p_group_id
          AND r3.trigger_type='missed_contribution'
          AND r3.status='active'
          AND r3.effective_from <= p_triggered_at
          AND (r3.effective_until IS NULL OR r3.effective_until >= p_triggered_at)
          AND (r3.applicability_mode='ALL' OR EXISTS (
            SELECT 1 FROM public.fine_rule_contribution_types rt3
            WHERE rt3.rule_id=r3.id AND rt3.contribution_type_id=v_obligation.contribution_type_id
          ))
          AND r3.specificity_level = r.specificity_level
      )
  ) > 1 THEN
    RAISE EXCEPTION 'Equal specificity and priority produces ambiguous fine-rule precedence';
  END IF;

  SELECT r.* INTO v_rule
  FROM public.fine_rules r
  WHERE r.group_id=p_group_id
    AND r.trigger_type='missed_contribution'
    AND r.status='active'
    AND r.effective_from <= p_triggered_at
    AND (r.effective_until IS NULL OR r.effective_until >= p_triggered_at)
    AND (r.applicability_mode='ALL' OR EXISTS (
      SELECT 1 FROM public.fine_rule_contribution_types rt
      WHERE rt.rule_id=r.id AND rt.contribution_type_id=v_obligation.contribution_type_id
    ))
  ORDER BY r.specificity_level DESC, r.priority DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'No applicable contribution fine rule'; END IF;

  v_fine_eligible_at := v_close_at
    + CASE v_rule.grace_period_unit
        WHEN 'DAY' THEN make_interval(days => v_rule.grace_period_value)
        WHEN 'WEEK' THEN make_interval(days => v_rule.grace_period_value * 7)
        WHEN 'MONTH' THEN make_interval(months => v_rule.grace_period_value)
      END;
  IF p_triggered_at < v_fine_eligible_at THEN
    RAISE EXCEPTION 'Contribution has not crossed its closing and grace boundary';
  END IF;

  v_base := round(v_obligation.due_amount,2);
  IF v_rule.calculation_method='FIXED' THEN
    v_amount := round(v_rule.fixed_amount,2);
  ELSE
    v_amount := round(v_base * v_rule.percentage_rate / 100,2);
  END IF;
  IF v_rule.minimum_amount IS NOT NULL THEN v_amount := greatest(v_amount, round(v_rule.minimum_amount,2)); END IF;
  IF v_rule.maximum_amount IS NOT NULL THEN v_amount := least(v_amount, round(v_rule.maximum_amount,2)); END IF;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Calculated fine amount must be positive'; END IF;

  INSERT INTO public.fines(
    group_id,member_id,rule_id,trigger_type,trigger_id,accounting_month,
    original_amount,calculation_method,calculation_base,percentage_rate,fixed_amount,
    minimum_amount,maximum_amount,calculated_amount,resolved_closing_at,triggered_at
  ) VALUES (
    p_group_id,p_member_id,v_rule.id,'missed_contribution',p_obligation_id,v_month,
    v_amount,v_rule.calculation_method,v_base,v_rule.percentage_rate,v_rule.fixed_amount,
    v_rule.minimum_amount,v_rule.maximum_amount,v_amount,v_close_at,p_triggered_at
  )
  ON CONFLICT (group_id,member_id,rule_id,trigger_type,trigger_id)
  DO NOTHING
  RETURNING id INTO v_fine_id;

  IF v_fine_id IS NULL THEN
    SELECT f.id INTO v_fine_id FROM public.fines f
    WHERE f.group_id=p_group_id AND f.member_id=p_member_id
      AND f.rule_id=v_rule.id AND f.trigger_type='missed_contribution'
      AND f.trigger_id=p_obligation_id;
  END IF;

  RETURN v_fine_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_fine_waive(p_fine_id uuid, p_amount numeric, p_reason text)
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
  IF p_amount IS NULL OR p_amount <= 0 OR btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'Valid waiver amount and reason are required'; END IF;
  SELECT f.* INTO v_fine FROM public.fines f WHERE f.id=p_fine_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fine not found'; END IF;
  IF NOT public.cl_user_has_role(v_fine.group_id, ARRAY['chairperson','treasurer']::text[]) THEN RAISE EXCEPTION 'Fine waiver requires chairperson or treasurer' USING ERRCODE='42501'; END IF;
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
  IF p_amount > round(v_balance,2) THEN RAISE EXCEPTION 'Waiver exceeds outstanding fine balance'; END IF;
  INSERT INTO public.fine_waivers(fine_id,amount,reason,authorized_by) VALUES(p_fine_id,round(p_amount,2),btrim(p_reason),v_actor) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_get_group_loan_summary(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_summary jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_group_id is null then
    raise exception 'Group is required' using errcode = '22023';
  end if;

  -- A member may view their own group's summary. Group managers may
  -- view groups where they hold a recognized management role, and owners
  -- may view the group they own. Never trust a client-supplied group ID alone.
  if not exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and (
        g.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.members m
          where m.group_id = g.id
            and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
            and lower(coalesce(m.status, 'active')) = 'active'
            and lower(coalesce(m.onboarding_status, 'active')) = 'active'
        )
        or public.cl_user_has_role(
          g.id,
          array['admin','chairperson','secretary','treasurer']::text[]
        )
      )
  ) then
    raise exception 'You are not authorized to view this group loan summary'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and coalesce(g.loans_enabled, false) = true
  ) then
    raise exception 'Loans are not enabled for this group'
      using errcode = '42501';
  end if;

  with disbursed_loans as (
    select la.id, la.group_id, la.member_id, la.approved_amount, la.status
    from public.loan_applications la
    where la.group_id = p_group_id
      and la.disbursed_at is not null
      and la.status in ('active', 'overdue', 'cleared')
  ),
  loan_totals as (
    select
      coalesce(sum(approved_amount), 0)::numeric as total_disbursed,
      count(distinct member_id)::integer as members_benefited,
      count(*) filter (where status in ('active', 'overdue'))::integer as active_loans_count
    from disbursed_loans
  ),
  interest_totals as (
    -- Allocations record interest that was actually paid as part of a
    -- recorded repayment. Scheduled/unpaid interest is not counted.
    select coalesce(sum(a.interest_amount), 0)::numeric as interest_gained
    from public.loan_repayment_allocations a
    join disbursed_loans dl on dl.id = a.loan_id
    where a.group_id = p_group_id
  ),
  principal_totals as (
    -- Exclude cleared loans; overdue loans remain outstanding until cleared.
    -- Principal allocations, not total installment payments, reduce principal.
    select coalesce(sum(greatest(s.principal_due - coalesce(pa.principal_paid, 0), 0)), 0)::numeric
      as outstanding_amount
    from public.loan_repayment_schedule s
    join disbursed_loans dl on dl.id = s.loan_id
    left join (
      select schedule_id, sum(principal_amount)::numeric as principal_paid
      from public.loan_repayment_allocations
      where group_id = p_group_id
      group by schedule_id
    ) pa on pa.schedule_id = s.id
    where s.group_id = p_group_id
      and dl.status in ('active', 'overdue')
  )
  select jsonb_build_object(
    'totalDisbursed', lt.total_disbursed,
    'interestGained', it.interest_gained,
    'membersBenefited', lt.members_benefited,
    'outstandingAmount', pt.outstanding_amount,
    'activeLoansCount', lt.active_loans_count
  )
  into v_summary
  from loan_totals lt
  cross join interest_totals it
  cross join principal_totals pt;

  return coalesce(v_summary, jsonb_build_object(
    'totalDisbursed', 0,
    'interestGained', 0,
    'membersBenefited', 0,
    'outstandingAmount', 0,
    'activeLoansCount', 0
  ));
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_get_group_support_summary(p_group_id uuid)
 RETURNS TABLE(support_id uuid, member_id uuid, member_name text, support_type text, support_date date, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF; IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.group_id=p_group_id AND (m.user_id=(SELECT auth.uid()) OR m.auth_user_id=(SELECT auth.uid())) AND lower(coalesce(m.status,'active'))='active') THEN RAISE EXCEPTION 'Group access denied'; END IF; RETURN QUERY SELECT s.id,s.member_id,m.name,s.support_type,s.support_date,s.status FROM public.group_support_cases s JOIN public.members m ON m.id=s.member_id WHERE s.group_id=p_group_id ORDER BY s.support_date DESC,s.created_at DESC; END; $function$


CREATE OR REPLACE FUNCTION public.cl_group_activities_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_group_assets_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_group_milestones_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_group_module_enabled(p_group_id uuid, p_module text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_enabled boolean;
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

  if lower(btrim(coalesce(p_module, ''))) = 'merry_go_round' then
    select g.merry_go_round_enabled into v_enabled
    from public.groups g where g.id = p_group_id;
  elsif lower(btrim(coalesce(p_module, ''))) = 'loans' then
    select g.loans_enabled into v_enabled
    from public.groups g where g.id = p_group_id;
  else
    raise exception 'Unknown optional module' using errcode = '22023';
  end if;

  if v_enabled is null then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;

  return v_enabled;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_group_plans_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$


