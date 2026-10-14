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
