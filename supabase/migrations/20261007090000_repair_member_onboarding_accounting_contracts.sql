-- CHAMA LIVE — Member onboarding/accounting contract repair
-- Explicitly approved. No data migration; function/trigger contracts only.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_member_with_contribution_plan(p_member jsonb, p_contribution_plan jsonb)
 RETURNS TABLE(member_id uuid, group_id uuid, member_number text, membership_number text, join_date date, contribution_status text, obligations_created integer, total_due numeric, total_allocated numeric, arrears numeric, credit numeric)
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
    v_member_status text;
    v_onboarding_status text;
    v_join_date date;
    v_actual_position text;
    v_actual_position_name text;
    v_actual_position_effective_from date;
    v_plan jsonb;
    v_plan_item jsonb;
    v_type_id uuid;
    v_amount numeric(14,2);
    v_frequency text;
    v_effective_from date;
    v_effective_to date;
    v_first_period_rule text;
    v_rule_status text;
    v_before_obligations integer := 0;
    v_after_obligations integer := 0;
    v_total_due numeric(14,2) := 0;
    v_total_allocated numeric(14,2) := 0;
    v_credit numeric(14,2) := 0;
    v_arrears numeric(14,2) := 0;
    v_contribution_status text;
    v_constraint_name text;
BEGIN
    IF p_member IS NULL OR jsonb_typeof(p_member) <> 'object' THEN
        RAISE EXCEPTION 'MEMBER_INPUT_INVALID' USING ERRCODE = '22023';
    END IF;

    IF p_contribution_plan IS NULL THEN
        v_plan := '[]'::jsonb;
    ELSIF jsonb_typeof(p_contribution_plan) <> 'array' THEN
        RAISE EXCEPTION 'CONTRIBUTION_PLAN_INVALID' USING ERRCODE = '22023';
    ELSE
        v_plan := p_contribution_plan;
    END IF;

    v_auth_uid := auth.uid();

    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
    END IF;

    SELECT m.id, m.group_id
    INTO v_creator_member_id, v_group_id
    FROM public.members m
    WHERE (m.auth_user_id = v_auth_uid OR m.user_id = v_auth_uid)
      AND lower(coalesce(m.status,'active')) = 'active'
    ORDER BY
        CASE WHEN lower(coalesce(m.onboarding_status,'pending')) = 'active'
             THEN 0 ELSE 1 END,
        m.created_at,
        m.id
    LIMIT 1;

    IF v_creator_member_id IS NULL OR v_group_id IS NULL THEN
        RAISE EXCEPTION 'ACTIVE_GROUP_MEMBER_REQUIRED' USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_manage_members(v_group_id) THEN
        RAISE EXCEPTION 'MEMBER_MANAGEMENT_NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;

    v_member_number := nullif(trim(p_member->>'member_number'), '');
    v_membership_number := nullif(trim(p_member->>'membership_number'), '');
    IF v_membership_number IS NULL OR v_membership_number !~ '^[0-9]{4}
    v_name := nullif(trim(p_member->>'name'), '');
    v_phone := nullif(trim(p_member->>'phone'), '');
    v_email := nullif(trim(p_member->>'email'), '');
    v_national_id := nullif(trim(p_member->>'national_id'), '');
    v_role := lower(coalesce(nullif(trim(p_member->>'role'), ''), 'member'));
    v_member_status := lower(coalesce(nullif(trim(p_member->>'status'), ''), 'active'));
    v_onboarding_status := lower(coalesce(nullif(trim(p_member->>'onboarding_status'), ''), 'pending'));
    v_join_date := coalesce(nullif(trim(p_member->>'join_date'), '')::date, CURRENT_DATE);
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

    IF v_member_number IS NULL THEN RAISE EXCEPTION 'MEMBER_NUMBER_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_member_number !~ '^[0-9]{4}
    IF v_membership_number IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_NUMBER_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_name IS NULL THEN RAISE EXCEPTION 'MEMBER_NAME_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_phone IS NULL THEN RAISE EXCEPTION 'MEMBER_PHONE_REQUIRED' USING ERRCODE='22023'; END IF;

    IF v_role NOT IN ('member','chairperson','admin','treasurer','secretary') THEN
        RAISE EXCEPTION 'MEMBER_ROLE_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_member_status NOT IN ('active','inactive') THEN
        RAISE EXCEPTION 'MEMBER_STATUS_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_onboarding_status NOT IN ('pending','invited','active','suspended') THEN
        RAISE EXCEPTION 'MEMBER_ONBOARDING_STATUS_INVALID' USING ERRCODE='22023';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'chama-live:add-member:' || v_group_id::text || ':' || v_member_number, 0
        )
    );

    IF EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.group_id = v_group_id AND m.member_number = v_member_number
    ) THEN
        RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.group_id = v_group_id AND m.membership_number = v_membership_number
    ) THEN
        RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
    END IF;

    BEGIN
        INSERT INTO public.members (
            group_id, member_number, membership_number, national_id, name,
            phone, email, role, status, onboarding_status, join_date
        )
        VALUES (
            v_group_id, v_member_number, v_membership_number, v_national_id, v_name,
            v_phone, v_email, v_role, v_member_status, v_onboarding_status, v_join_date
        )
        RETURNING id INTO v_member_id;
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name = 'members_group_id_member_number_key'
           OR v_constraint_name = 'members_group_member_number_uidx' THEN
            RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
        ELSIF v_constraint_name = 'members_group_membership_number_uidx' THEN
            RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
        ELSE
            RAISE;
        END IF;
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

    IF jsonb_array_length(v_plan) = 0 THEN
        RETURN QUERY SELECT v_member_id, v_group_id, v_member_number, v_membership_number,
            v_join_date, 'plan_not_set'::text, 0, 0::numeric(14,2), 0::numeric(14,2),
            0::numeric(14,2), 0::numeric(14,2);
        RETURN;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'chama-live:member:' || v_group_id::text || ':' || v_member_id::text, 0
        )
    );

    SELECT count(*)::integer INTO v_before_obligations
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    FOR v_plan_item IN SELECT value FROM jsonb_array_elements(v_plan) LOOP
        IF jsonb_typeof(v_plan_item) <> 'object' THEN
            RAISE EXCEPTION 'CONTRIBUTION_PLAN_ITEM_INVALID' USING ERRCODE='22023';
        END IF;

        BEGIN
            v_type_id := (v_plan_item->>'contribution_type_id')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_ID_INVALID' USING ERRCODE='22023';
        END;
        IF v_type_id IS NULL THEN RAISE EXCEPTION 'CONTRIBUTION_TYPE_ID_REQUIRED' USING ERRCODE='22023'; END IF;

        BEGIN
            v_amount := (v_plan_item->>'amount')::numeric(14,2);
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'CONTRIBUTION_AMOUNT_INVALID' USING ERRCODE='22023';
        END;
        IF v_amount IS NULL OR v_amount <= 0 THEN
            RAISE EXCEPTION 'CONTRIBUTION_AMOUNT_INVALID' USING ERRCODE='22023';
        END IF;

        v_frequency := lower(coalesce(nullif(trim(v_plan_item->>'frequency'), ''), 'monthly'));
        IF v_frequency <> 'monthly' THEN
            RAISE EXCEPTION 'CONTRIBUTION_FREQUENCY_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        v_effective_from := coalesce(nullif(trim(v_plan_item->>'effective_from'), '')::date, v_join_date);
        v_effective_to := nullif(trim(v_plan_item->>'effective_to'), '')::date;

        IF v_effective_from < v_join_date THEN
            RAISE EXCEPTION 'CONTRIBUTION_EFFECTIVE_DATE_BEFORE_JOIN_DATE' USING ERRCODE='22023';
        END IF;
        IF v_effective_to IS NOT NULL AND v_effective_to < v_effective_from THEN
            RAISE EXCEPTION 'CONTRIBUTION_EFFECTIVE_DATE_RANGE_INVALID' USING ERRCODE='22023';
        END IF;

        v_first_period_rule := lower(coalesce(nullif(trim(v_plan_item->>'first_period_rule'), ''), 'full_period'));
        IF v_first_period_rule NOT IN ('full_period','next_full_period') THEN
            RAISE EXCEPTION 'FIRST_PERIOD_RULE_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        v_rule_status := lower(coalesce(nullif(trim(v_plan_item->>'status'), ''), 'active'));
        IF v_rule_status NOT IN ('active','inactive','ended') THEN
            RAISE EXCEPTION 'CONTRIBUTION_RULE_STATUS_INVALID' USING ERRCODE='22023';
        END IF;
        IF v_rule_status = 'ended' AND v_effective_to IS NULL THEN
            RAISE EXCEPTION 'ENDED_RULE_REQUIRES_EFFECTIVE_TO' USING ERRCODE='22023';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.contribution_types ct
            WHERE ct.id = v_type_id AND ct.group_id = v_group_id
        ) THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_NOT_IN_GROUP' USING ERRCODE='42501';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.contribution_types ct
            WHERE ct.id = v_type_id AND ct.group_id = v_group_id
              AND (ct.code = 'monthly' OR lower(trim(ct.name)) = 'monthly')
        ) THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        BEGIN
            INSERT INTO public.member_contribution_rules (
                group_id, member_id, contribution_type_id, amount, frequency,
                effective_from, effective_to, first_period_rule, status, created_by
            )
            VALUES (
                v_group_id, v_member_id, v_type_id, v_amount, v_frequency,
                v_effective_from, v_effective_to, v_first_period_rule,
                v_rule_status, v_creator_member_id
            );
        EXCEPTION WHEN exclusion_violation THEN
            RAISE EXCEPTION 'CONTRIBUTION_RULE_OVERLAP' USING ERRCODE='23P01';
        END;
    END LOOP;

    PERFORM public.cl_2b_refresh_member(v_member_id, date_trunc('month', CURRENT_DATE)::date);

    SELECT count(*)::integer INTO v_after_obligations
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    v_after_obligations := greatest(v_after_obligations - v_before_obligations, 0);

    SELECT coalesce(sum(o.due_amount),0)::numeric(14,2)
    INTO v_total_due
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    SELECT coalesce(sum(a.amount),0)::numeric(14,2)
    INTO v_total_allocated
    FROM public.contribution_allocations a
    JOIN public.contribution_obligations o ON o.id = a.obligation_id
    WHERE o.member_id = v_member_id;

    SELECT coalesce(sum(
        greatest(
            c.amount - coalesce((
                SELECT sum(a.amount)
                FROM public.contribution_allocations a
                WHERE a.payment_id = c.id
            ),0),
            0
        )
    ),0)::numeric(14,2)
    INTO v_credit
    FROM public.contributions c
    WHERE c.member_id = v_member_id
      AND lower(trim(coalesce(c.contribution_type,''))) = 'monthly';

    v_arrears := greatest(v_total_due - v_total_allocated, 0)::numeric(14,2);

    IF v_arrears > 0 THEN
        v_contribution_status := 'arrears';
    ELSIF v_credit > 0 THEN
        v_contribution_status := 'credit';
    ELSE
        v_contribution_status := 'up_to_date';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.contribution_allocations a
        JOIN public.contributions p ON p.id = a.payment_id
        JOIN public.contribution_obligations o ON o.id = a.obligation_id
        WHERE (p.member_id = v_member_id OR o.member_id = v_member_id)
          AND (p.group_id <> o.group_id OR p.member_id <> o.member_id OR a.amount <= 0)
    ) THEN
        RAISE EXCEPTION 'Cross-member/group allocation detected';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT a.payment_id, sum(a.amount) AS allocated
            FROM public.contribution_allocations a
            JOIN public.contributions p ON p.id = a.payment_id
            WHERE p.member_id = v_member_id
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
            SELECT a.obligation_id, sum(a.amount) AS allocated
            FROM public.contribution_allocations a
            JOIN public.contribution_obligations o ON o.id = a.obligation_id
            WHERE o.member_id = v_member_id
            GROUP BY a.obligation_id
        ) x
        JOIN public.contribution_obligations o ON o.id = x.obligation_id
        WHERE x.allocated > o.due_amount
    ) THEN
        RAISE EXCEPTION 'Obligation over-allocation detected';
    END IF;

    RETURN QUERY SELECT
        v_member_id, v_group_id, v_member_number, v_membership_number, v_join_date,
        v_contribution_status, v_after_obligations, v_total_due, v_total_allocated,
        v_arrears, v_credit;
END;
$function$
 THEN
        v_membership_number := v_member_number;
    END IF;
    v_name := nullif(trim(p_member->>'name'), '');
    v_phone := nullif(trim(p_member->>'phone'), '');
    v_email := nullif(trim(p_member->>'email'), '');
    v_national_id := nullif(trim(p_member->>'national_id'), '');
    v_role := lower(coalesce(nullif(trim(p_member->>'role'), ''), 'member'));
    v_member_status := lower(coalesce(nullif(trim(p_member->>'status'), ''), 'active'));
    v_onboarding_status := lower(coalesce(nullif(trim(p_member->>'onboarding_status'), ''), 'pending'));
    v_join_date := coalesce(nullif(trim(p_member->>'join_date'), '')::date, CURRENT_DATE);
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

    IF v_member_number IS NULL THEN RAISE EXCEPTION 'MEMBER_NUMBER_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_membership_number IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_NUMBER_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_name IS NULL THEN RAISE EXCEPTION 'MEMBER_NAME_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_phone IS NULL THEN RAISE EXCEPTION 'MEMBER_PHONE_REQUIRED' USING ERRCODE='22023'; END IF;

    IF v_role NOT IN ('member','chairperson','admin','treasurer','secretary') THEN
        RAISE EXCEPTION 'MEMBER_ROLE_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_member_status NOT IN ('active','inactive') THEN
        RAISE EXCEPTION 'MEMBER_STATUS_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_onboarding_status NOT IN ('pending','invited','active','suspended') THEN
        RAISE EXCEPTION 'MEMBER_ONBOARDING_STATUS_INVALID' USING ERRCODE='22023';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'chama-live:add-member:' || v_group_id::text || ':' || v_member_number, 0
        )
    );

    IF EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.group_id = v_group_id AND m.member_number = v_member_number
    ) THEN
        RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.group_id = v_group_id AND m.membership_number = v_membership_number
    ) THEN
        RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
    END IF;

    BEGIN
        INSERT INTO public.members (
            group_id, member_number, membership_number, national_id, name,
            phone, email, role, status, onboarding_status, join_date
        )
        VALUES (
            v_group_id, v_member_number, v_membership_number, v_national_id, v_name,
            v_phone, v_email, v_role, v_member_status, v_onboarding_status, v_join_date
        )
        RETURNING id INTO v_member_id;
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name = 'members_group_id_member_number_key'
           OR v_constraint_name = 'members_group_member_number_uidx' THEN
            RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
        ELSIF v_constraint_name = 'members_group_membership_number_uidx' THEN
            RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
        ELSE
            RAISE;
        END IF;
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

    IF jsonb_array_length(v_plan) = 0 THEN
        RETURN QUERY SELECT v_member_id, v_group_id, v_member_number, v_membership_number,
            v_join_date, 'plan_not_set'::text, 0, 0::numeric(14,2), 0::numeric(14,2),
            0::numeric(14,2), 0::numeric(14,2);
        RETURN;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'chama-live:member:' || v_group_id::text || ':' || v_member_id::text, 0
        )
    );

    SELECT count(*)::integer INTO v_before_obligations
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    FOR v_plan_item IN SELECT value FROM jsonb_array_elements(v_plan) LOOP
        IF jsonb_typeof(v_plan_item) <> 'object' THEN
            RAISE EXCEPTION 'CONTRIBUTION_PLAN_ITEM_INVALID' USING ERRCODE='22023';
        END IF;

        BEGIN
            v_type_id := (v_plan_item->>'contribution_type_id')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_ID_INVALID' USING ERRCODE='22023';
        END;
        IF v_type_id IS NULL THEN RAISE EXCEPTION 'CONTRIBUTION_TYPE_ID_REQUIRED' USING ERRCODE='22023'; END IF;

        BEGIN
            v_amount := (v_plan_item->>'amount')::numeric(14,2);
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'CONTRIBUTION_AMOUNT_INVALID' USING ERRCODE='22023';
        END;
        IF v_amount IS NULL OR v_amount <= 0 THEN
            RAISE EXCEPTION 'CONTRIBUTION_AMOUNT_INVALID' USING ERRCODE='22023';
        END IF;

        v_frequency := lower(coalesce(nullif(trim(v_plan_item->>'frequency'), ''), 'monthly'));
        IF v_frequency <> 'monthly' THEN
            RAISE EXCEPTION 'CONTRIBUTION_FREQUENCY_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        v_effective_from := coalesce(nullif(trim(v_plan_item->>'effective_from'), '')::date, v_join_date);
        v_effective_to := nullif(trim(v_plan_item->>'effective_to'), '')::date;

        IF v_effective_from < v_join_date THEN
            RAISE EXCEPTION 'CONTRIBUTION_EFFECTIVE_DATE_BEFORE_JOIN_DATE' USING ERRCODE='22023';
        END IF;
        IF v_effective_to IS NOT NULL AND v_effective_to < v_effective_from THEN
            RAISE EXCEPTION 'CONTRIBUTION_EFFECTIVE_DATE_RANGE_INVALID' USING ERRCODE='22023';
        END IF;

        v_first_period_rule := lower(coalesce(nullif(trim(v_plan_item->>'first_period_rule'), ''), 'full_period'));
        IF v_first_period_rule NOT IN ('full_period','next_full_period') THEN
            RAISE EXCEPTION 'FIRST_PERIOD_RULE_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        v_rule_status := lower(coalesce(nullif(trim(v_plan_item->>'status'), ''), 'active'));
        IF v_rule_status NOT IN ('active','inactive','ended') THEN
            RAISE EXCEPTION 'CONTRIBUTION_RULE_STATUS_INVALID' USING ERRCODE='22023';
        END IF;
        IF v_rule_status = 'ended' AND v_effective_to IS NULL THEN
            RAISE EXCEPTION 'ENDED_RULE_REQUIRES_EFFECTIVE_TO' USING ERRCODE='22023';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.contribution_types ct
            WHERE ct.id = v_type_id AND ct.group_id = v_group_id
        ) THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_NOT_IN_GROUP' USING ERRCODE='42501';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.contribution_types ct
            WHERE ct.id = v_type_id AND ct.group_id = v_group_id
              AND (ct.code = 'monthly' OR lower(trim(ct.name)) = 'monthly')
        ) THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        BEGIN
            INSERT INTO public.member_contribution_rules (
                group_id, member_id, contribution_type_id, amount, frequency,
                effective_from, effective_to, first_period_rule, status, created_by
            )
            VALUES (
                v_group_id, v_member_id, v_type_id, v_amount, v_frequency,
                v_effective_from, v_effective_to, v_first_period_rule,
                v_rule_status, v_creator_member_id
            );
        EXCEPTION WHEN exclusion_violation THEN
            RAISE EXCEPTION 'CONTRIBUTION_RULE_OVERLAP' USING ERRCODE='23P01';
        END;
    END LOOP;

    PERFORM public.cl_2b_refresh_member(v_member_id, date_trunc('month', CURRENT_DATE)::date);

    SELECT count(*)::integer INTO v_after_obligations
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    v_after_obligations := greatest(v_after_obligations - v_before_obligations, 0);

    SELECT coalesce(sum(o.due_amount),0)::numeric(14,2)
    INTO v_total_due
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    SELECT coalesce(sum(a.amount),0)::numeric(14,2)
    INTO v_total_allocated
    FROM public.contribution_allocations a
    JOIN public.contribution_obligations o ON o.id = a.obligation_id
    WHERE o.member_id = v_member_id;

    SELECT coalesce(sum(
        greatest(
            c.amount - coalesce((
                SELECT sum(a.amount)
                FROM public.contribution_allocations a
                WHERE a.payment_id = c.id
            ),0),
            0
        )
    ),0)::numeric(14,2)
    INTO v_credit
    FROM public.contributions c
    WHERE c.member_id = v_member_id
      AND lower(trim(coalesce(c.contribution_type,''))) = 'monthly';

    v_arrears := greatest(v_total_due - v_total_allocated, 0)::numeric(14,2);

    IF v_arrears > 0 THEN
        v_contribution_status := 'arrears';
    ELSIF v_credit > 0 THEN
        v_contribution_status := 'credit';
    ELSE
        v_contribution_status := 'up_to_date';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.contribution_allocations a
        JOIN public.contributions p ON p.id = a.payment_id
        JOIN public.contribution_obligations o ON o.id = a.obligation_id
        WHERE (p.member_id = v_member_id OR o.member_id = v_member_id)
          AND (p.group_id <> o.group_id OR p.member_id <> o.member_id OR a.amount <= 0)
    ) THEN
        RAISE EXCEPTION 'Cross-member/group allocation detected';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT a.payment_id, sum(a.amount) AS allocated
            FROM public.contribution_allocations a
            JOIN public.contributions p ON p.id = a.payment_id
            WHERE p.member_id = v_member_id
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
            SELECT a.obligation_id, sum(a.amount) AS allocated
            FROM public.contribution_allocations a
            JOIN public.contribution_obligations o ON o.id = a.obligation_id
            WHERE o.member_id = v_member_id
            GROUP BY a.obligation_id
        ) x
        JOIN public.contribution_obligations o ON o.id = x.obligation_id
        WHERE x.allocated > o.due_amount
    ) THEN
        RAISE EXCEPTION 'Obligation over-allocation detected';
    END IF;

    RETURN QUERY SELECT
        v_member_id, v_group_id, v_member_number, v_membership_number, v_join_date,
        v_contribution_status, v_after_obligations, v_total_due, v_total_allocated,
        v_arrears, v_credit;
END;
$function$
 THEN RAISE EXCEPTION 'MEMBER_NUMBER_INVALID' USING ERRCODE='22023'; END IF;
    IF v_membership_number IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_NUMBER_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_name IS NULL THEN RAISE EXCEPTION 'MEMBER_NAME_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_phone IS NULL THEN RAISE EXCEPTION 'MEMBER_PHONE_REQUIRED' USING ERRCODE='22023'; END IF;

    IF v_role NOT IN ('member','chairperson','admin','treasurer','secretary') THEN
        RAISE EXCEPTION 'MEMBER_ROLE_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_member_status NOT IN ('active','inactive') THEN
        RAISE EXCEPTION 'MEMBER_STATUS_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_onboarding_status NOT IN ('pending','invited','active','suspended') THEN
        RAISE EXCEPTION 'MEMBER_ONBOARDING_STATUS_INVALID' USING ERRCODE='22023';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'chama-live:add-member:' || v_group_id::text || ':' || v_member_number, 0
        )
    );

    IF EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.group_id = v_group_id AND m.member_number = v_member_number
    ) THEN
        RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.group_id = v_group_id AND m.membership_number = v_membership_number
    ) THEN
        RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
    END IF;

    BEGIN
        INSERT INTO public.members (
            group_id, member_number, membership_number, national_id, name,
            phone, email, role, status, onboarding_status, join_date
        )
        VALUES (
            v_group_id, v_member_number, v_membership_number, v_national_id, v_name,
            v_phone, v_email, v_role, v_member_status, v_onboarding_status, v_join_date
        )
        RETURNING id INTO v_member_id;
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name = 'members_group_id_member_number_key'
           OR v_constraint_name = 'members_group_member_number_uidx' THEN
            RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
        ELSIF v_constraint_name = 'members_group_membership_number_uidx' THEN
            RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
        ELSE
            RAISE;
        END IF;
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

    IF jsonb_array_length(v_plan) = 0 THEN
        RETURN QUERY SELECT v_member_id, v_group_id, v_member_number, v_membership_number,
            v_join_date, 'plan_not_set'::text, 0, 0::numeric(14,2), 0::numeric(14,2),
            0::numeric(14,2), 0::numeric(14,2);
        RETURN;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'chama-live:member:' || v_group_id::text || ':' || v_member_id::text, 0
        )
    );

    SELECT count(*)::integer INTO v_before_obligations
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    FOR v_plan_item IN SELECT value FROM jsonb_array_elements(v_plan) LOOP
        IF jsonb_typeof(v_plan_item) <> 'object' THEN
            RAISE EXCEPTION 'CONTRIBUTION_PLAN_ITEM_INVALID' USING ERRCODE='22023';
        END IF;

        BEGIN
            v_type_id := (v_plan_item->>'contribution_type_id')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_ID_INVALID' USING ERRCODE='22023';
        END;
        IF v_type_id IS NULL THEN RAISE EXCEPTION 'CONTRIBUTION_TYPE_ID_REQUIRED' USING ERRCODE='22023'; END IF;

        BEGIN
            v_amount := (v_plan_item->>'amount')::numeric(14,2);
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'CONTRIBUTION_AMOUNT_INVALID' USING ERRCODE='22023';
        END;
        IF v_amount IS NULL OR v_amount <= 0 THEN
            RAISE EXCEPTION 'CONTRIBUTION_AMOUNT_INVALID' USING ERRCODE='22023';
        END IF;

        v_frequency := lower(coalesce(nullif(trim(v_plan_item->>'frequency'), ''), 'monthly'));
        IF v_frequency <> 'monthly' THEN
            RAISE EXCEPTION 'CONTRIBUTION_FREQUENCY_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        v_effective_from := coalesce(nullif(trim(v_plan_item->>'effective_from'), '')::date, v_join_date);
        v_effective_to := nullif(trim(v_plan_item->>'effective_to'), '')::date;

        IF v_effective_from < v_join_date THEN
            RAISE EXCEPTION 'CONTRIBUTION_EFFECTIVE_DATE_BEFORE_JOIN_DATE' USING ERRCODE='22023';
        END IF;
        IF v_effective_to IS NOT NULL AND v_effective_to < v_effective_from THEN
            RAISE EXCEPTION 'CONTRIBUTION_EFFECTIVE_DATE_RANGE_INVALID' USING ERRCODE='22023';
        END IF;

        v_first_period_rule := lower(coalesce(nullif(trim(v_plan_item->>'first_period_rule'), ''), 'full_period'));
        IF v_first_period_rule NOT IN ('full_period','next_full_period') THEN
            RAISE EXCEPTION 'FIRST_PERIOD_RULE_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        v_rule_status := lower(coalesce(nullif(trim(v_plan_item->>'status'), ''), 'active'));
        IF v_rule_status NOT IN ('active','inactive','ended') THEN
            RAISE EXCEPTION 'CONTRIBUTION_RULE_STATUS_INVALID' USING ERRCODE='22023';
        END IF;
        IF v_rule_status = 'ended' AND v_effective_to IS NULL THEN
            RAISE EXCEPTION 'ENDED_RULE_REQUIRES_EFFECTIVE_TO' USING ERRCODE='22023';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.contribution_types ct
            WHERE ct.id = v_type_id AND ct.group_id = v_group_id
        ) THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_NOT_IN_GROUP' USING ERRCODE='42501';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.contribution_types ct
            WHERE ct.id = v_type_id AND ct.group_id = v_group_id
              AND (ct.code = 'monthly' OR lower(trim(ct.name)) = 'monthly')
        ) THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        BEGIN
            INSERT INTO public.member_contribution_rules (
                group_id, member_id, contribution_type_id, amount, frequency,
                effective_from, effective_to, first_period_rule, status, created_by
            )
            VALUES (
                v_group_id, v_member_id, v_type_id, v_amount, v_frequency,
                v_effective_from, v_effective_to, v_first_period_rule,
                v_rule_status, v_creator_member_id
            );
        EXCEPTION WHEN exclusion_violation THEN
            RAISE EXCEPTION 'CONTRIBUTION_RULE_OVERLAP' USING ERRCODE='23P01';
        END;
    END LOOP;

    PERFORM public.cl_2b_refresh_member(v_member_id, date_trunc('month', CURRENT_DATE)::date);

    SELECT count(*)::integer INTO v_after_obligations
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    v_after_obligations := greatest(v_after_obligations - v_before_obligations, 0);

    SELECT coalesce(sum(o.due_amount),0)::numeric(14,2)
    INTO v_total_due
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    SELECT coalesce(sum(a.amount),0)::numeric(14,2)
    INTO v_total_allocated
    FROM public.contribution_allocations a
    JOIN public.contribution_obligations o ON o.id = a.obligation_id
    WHERE o.member_id = v_member_id;

    SELECT coalesce(sum(
        greatest(
            c.amount - coalesce((
                SELECT sum(a.amount)
                FROM public.contribution_allocations a
                WHERE a.payment_id = c.id
            ),0),
            0
        )
    ),0)::numeric(14,2)
    INTO v_credit
    FROM public.contributions c
    WHERE c.member_id = v_member_id
      AND lower(trim(coalesce(c.contribution_type,''))) = 'monthly';

    v_arrears := greatest(v_total_due - v_total_allocated, 0)::numeric(14,2);

    IF v_arrears > 0 THEN
        v_contribution_status := 'arrears';
    ELSIF v_credit > 0 THEN
        v_contribution_status := 'credit';
    ELSE
        v_contribution_status := 'up_to_date';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.contribution_allocations a
        JOIN public.contributions p ON p.id = a.payment_id
        JOIN public.contribution_obligations o ON o.id = a.obligation_id
        WHERE (p.member_id = v_member_id OR o.member_id = v_member_id)
          AND (p.group_id <> o.group_id OR p.member_id <> o.member_id OR a.amount <= 0)
    ) THEN
        RAISE EXCEPTION 'Cross-member/group allocation detected';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT a.payment_id, sum(a.amount) AS allocated
            FROM public.contribution_allocations a
            JOIN public.contributions p ON p.id = a.payment_id
            WHERE p.member_id = v_member_id
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
            SELECT a.obligation_id, sum(a.amount) AS allocated
            FROM public.contribution_allocations a
            JOIN public.contribution_obligations o ON o.id = a.obligation_id
            WHERE o.member_id = v_member_id
            GROUP BY a.obligation_id
        ) x
        JOIN public.contribution_obligations o ON o.id = x.obligation_id
        WHERE x.allocated > o.due_amount
    ) THEN
        RAISE EXCEPTION 'Obligation over-allocation detected';
    END IF;

    RETURN QUERY SELECT
        v_member_id, v_group_id, v_member_number, v_membership_number, v_join_date,
        v_contribution_status, v_after_obligations, v_total_due, v_total_allocated,
        v_arrears, v_credit;
END;
$function$
 THEN
        v_membership_number := v_member_number;
    END IF;
    v_name := nullif(trim(p_member->>'name'), '');
    v_phone := nullif(trim(p_member->>'phone'), '');
    v_email := nullif(trim(p_member->>'email'), '');
    v_national_id := nullif(trim(p_member->>'national_id'), '');
    v_role := lower(coalesce(nullif(trim(p_member->>'role'), ''), 'member'));
    v_member_status := lower(coalesce(nullif(trim(p_member->>'status'), ''), 'active'));
    v_onboarding_status := lower(coalesce(nullif(trim(p_member->>'onboarding_status'), ''), 'pending'));
    v_join_date := coalesce(nullif(trim(p_member->>'join_date'), '')::date, CURRENT_DATE);
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

    IF v_member_number IS NULL THEN RAISE EXCEPTION 'MEMBER_NUMBER_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_membership_number IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_NUMBER_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_name IS NULL THEN RAISE EXCEPTION 'MEMBER_NAME_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_phone IS NULL THEN RAISE EXCEPTION 'MEMBER_PHONE_REQUIRED' USING ERRCODE='22023'; END IF;

    IF v_role NOT IN ('member','chairperson','admin','treasurer','secretary') THEN
        RAISE EXCEPTION 'MEMBER_ROLE_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_member_status NOT IN ('active','inactive') THEN
        RAISE EXCEPTION 'MEMBER_STATUS_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_onboarding_status NOT IN ('pending','invited','active','suspended') THEN
        RAISE EXCEPTION 'MEMBER_ONBOARDING_STATUS_INVALID' USING ERRCODE='22023';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'chama-live:add-member:' || v_group_id::text || ':' || v_member_number, 0
        )
    );

    IF EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.group_id = v_group_id AND m.member_number = v_member_number
    ) THEN
        RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.group_id = v_group_id AND m.membership_number = v_membership_number
    ) THEN
        RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
    END IF;

    BEGIN
        INSERT INTO public.members (
            group_id, member_number, membership_number, national_id, name,
            phone, email, role, status, onboarding_status, join_date
        )
        VALUES (
            v_group_id, v_member_number, v_membership_number, v_national_id, v_name,
            v_phone, v_email, v_role, v_member_status, v_onboarding_status, v_join_date
        )
        RETURNING id INTO v_member_id;
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name = 'members_group_id_member_number_key'
           OR v_constraint_name = 'members_group_member_number_uidx' THEN
            RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
        ELSIF v_constraint_name = 'members_group_membership_number_uidx' THEN
            RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
        ELSE
            RAISE;
        END IF;
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

    IF jsonb_array_length(v_plan) = 0 THEN
        RETURN QUERY SELECT v_member_id, v_group_id, v_member_number, v_membership_number,
            v_join_date, 'plan_not_set'::text, 0, 0::numeric(14,2), 0::numeric(14,2),
            0::numeric(14,2), 0::numeric(14,2);
        RETURN;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'chama-live:member:' || v_group_id::text || ':' || v_member_id::text, 0
        )
    );

    SELECT count(*)::integer INTO v_before_obligations
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    FOR v_plan_item IN SELECT value FROM jsonb_array_elements(v_plan) LOOP
        IF jsonb_typeof(v_plan_item) <> 'object' THEN
            RAISE EXCEPTION 'CONTRIBUTION_PLAN_ITEM_INVALID' USING ERRCODE='22023';
        END IF;

        BEGIN
            v_type_id := (v_plan_item->>'contribution_type_id')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_ID_INVALID' USING ERRCODE='22023';
        END;
        IF v_type_id IS NULL THEN RAISE EXCEPTION 'CONTRIBUTION_TYPE_ID_REQUIRED' USING ERRCODE='22023'; END IF;

        BEGIN
            v_amount := (v_plan_item->>'amount')::numeric(14,2);
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'CONTRIBUTION_AMOUNT_INVALID' USING ERRCODE='22023';
        END;
        IF v_amount IS NULL OR v_amount <= 0 THEN
            RAISE EXCEPTION 'CONTRIBUTION_AMOUNT_INVALID' USING ERRCODE='22023';
        END IF;

        v_frequency := lower(coalesce(nullif(trim(v_plan_item->>'frequency'), ''), 'monthly'));
        IF v_frequency <> 'monthly' THEN
            RAISE EXCEPTION 'CONTRIBUTION_FREQUENCY_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        v_effective_from := coalesce(nullif(trim(v_plan_item->>'effective_from'), '')::date, v_join_date);
        v_effective_to := nullif(trim(v_plan_item->>'effective_to'), '')::date;

        IF v_effective_from < v_join_date THEN
            RAISE EXCEPTION 'CONTRIBUTION_EFFECTIVE_DATE_BEFORE_JOIN_DATE' USING ERRCODE='22023';
        END IF;
        IF v_effective_to IS NOT NULL AND v_effective_to < v_effective_from THEN
            RAISE EXCEPTION 'CONTRIBUTION_EFFECTIVE_DATE_RANGE_INVALID' USING ERRCODE='22023';
        END IF;

        v_first_period_rule := lower(coalesce(nullif(trim(v_plan_item->>'first_period_rule'), ''), 'full_period'));
        IF v_first_period_rule NOT IN ('full_period','next_full_period') THEN
            RAISE EXCEPTION 'FIRST_PERIOD_RULE_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        v_rule_status := lower(coalesce(nullif(trim(v_plan_item->>'status'), ''), 'active'));
        IF v_rule_status NOT IN ('active','inactive','ended') THEN
            RAISE EXCEPTION 'CONTRIBUTION_RULE_STATUS_INVALID' USING ERRCODE='22023';
        END IF;
        IF v_rule_status = 'ended' AND v_effective_to IS NULL THEN
            RAISE EXCEPTION 'ENDED_RULE_REQUIRES_EFFECTIVE_TO' USING ERRCODE='22023';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.contribution_types ct
            WHERE ct.id = v_type_id AND ct.group_id = v_group_id
        ) THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_NOT_IN_GROUP' USING ERRCODE='42501';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.contribution_types ct
            WHERE ct.id = v_type_id AND ct.group_id = v_group_id
              AND (ct.code = 'monthly' OR lower(trim(ct.name)) = 'monthly')
        ) THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        BEGIN
            INSERT INTO public.member_contribution_rules (
                group_id, member_id, contribution_type_id, amount, frequency,
                effective_from, effective_to, first_period_rule, status, created_by
            )
            VALUES (
                v_group_id, v_member_id, v_type_id, v_amount, v_frequency,
                v_effective_from, v_effective_to, v_first_period_rule,
                v_rule_status, v_creator_member_id
            );
        EXCEPTION WHEN exclusion_violation THEN
            RAISE EXCEPTION 'CONTRIBUTION_RULE_OVERLAP' USING ERRCODE='23P01';
        END;
    END LOOP;

    PERFORM public.cl_2b_refresh_member(v_member_id, date_trunc('month', CURRENT_DATE)::date);

    SELECT count(*)::integer INTO v_after_obligations
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    v_after_obligations := greatest(v_after_obligations - v_before_obligations, 0);

    SELECT coalesce(sum(o.due_amount),0)::numeric(14,2)
    INTO v_total_due
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    SELECT coalesce(sum(a.amount),0)::numeric(14,2)
    INTO v_total_allocated
    FROM public.contribution_allocations a
    JOIN public.contribution_obligations o ON o.id = a.obligation_id
    WHERE o.member_id = v_member_id;

    SELECT coalesce(sum(
        greatest(
            c.amount - coalesce((
                SELECT sum(a.amount)
                FROM public.contribution_allocations a
                WHERE a.payment_id = c.id
            ),0),
            0
        )
    ),0)::numeric(14,2)
    INTO v_credit
    FROM public.contributions c
    WHERE c.member_id = v_member_id
      AND lower(trim(coalesce(c.contribution_type,''))) = 'monthly';

    v_arrears := greatest(v_total_due - v_total_allocated, 0)::numeric(14,2);

    IF v_arrears > 0 THEN
        v_contribution_status := 'arrears';
    ELSIF v_credit > 0 THEN
        v_contribution_status := 'credit';
    ELSE
        v_contribution_status := 'up_to_date';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.contribution_allocations a
        JOIN public.contributions p ON p.id = a.payment_id
        JOIN public.contribution_obligations o ON o.id = a.obligation_id
        WHERE (p.member_id = v_member_id OR o.member_id = v_member_id)
          AND (p.group_id <> o.group_id OR p.member_id <> o.member_id OR a.amount <= 0)
    ) THEN
        RAISE EXCEPTION 'Cross-member/group allocation detected';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT a.payment_id, sum(a.amount) AS allocated
            FROM public.contribution_allocations a
            JOIN public.contributions p ON p.id = a.payment_id
            WHERE p.member_id = v_member_id
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
            SELECT a.obligation_id, sum(a.amount) AS allocated
            FROM public.contribution_allocations a
            JOIN public.contribution_obligations o ON o.id = a.obligation_id
            WHERE o.member_id = v_member_id
            GROUP BY a.obligation_id
        ) x
        JOIN public.contribution_obligations o ON o.id = x.obligation_id
        WHERE x.allocated > o.due_amount
    ) THEN
        RAISE EXCEPTION 'Obligation over-allocation detected';
    END IF;

    RETURN QUERY SELECT
        v_member_id, v_group_id, v_member_number, v_membership_number, v_join_date,
        v_contribution_status, v_after_obligations, v_total_due, v_total_allocated,
        v_arrears, v_credit;
END;
$function$


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
  IF NOT public.can_manage_members(v_group_id) THEN RAISE EXCEPTION 'Member-management authorization required'; END IF;

  v_member_number := nullif(trim(p_member->>'member_number'), '');
  v_membership_number := nullif(trim(p_member->>'membership_number'), '');
  IF v_membership_number IS NULL OR v_membership_number !~ '^[0-9]{4}
  v_name := nullif(trim(p_member->>'name'), '');
  v_phone := nullif(trim(p_member->>'phone'), '');
  v_email := nullif(trim(p_member->>'email'), '');
  v_national_id := nullif(trim(p_member->>'national_id'), '');
  v_role := coalesce(nullif(trim(p_member->>'role'), ''), 'member');
  v_status := coalesce(nullif(trim(p_member->>'status'), ''), 'active');
  v_onboarding_status := coalesce(nullif(trim(p_member->>'onboarding_status'), ''), 'pending');
  IF nullif(trim(p_member->>'join_date'), '') IS NULL THEN
    v_join_date := current_date;
  ELSE
    BEGIN
      v_join_date := (p_member->>'join_date')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Invalid join_date';
    END;
  END IF;

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
  IF v_member_number !~ '^[0-9]{4}
  IF v_membership_number IS NULL THEN RAISE EXCEPTION 'Membership number is required'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Member name is required'; END IF;
  IF v_phone IS NULL THEN RAISE EXCEPTION 'Member phone is required'; END IF;

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
 THEN
    v_membership_number := v_member_number;
  END IF;
  v_name := nullif(trim(p_member->>'name'), '');
  v_phone := nullif(trim(p_member->>'phone'), '');
  v_email := nullif(trim(p_member->>'email'), '');
  v_national_id := nullif(trim(p_member->>'national_id'), '');
  v_role := coalesce(nullif(trim(p_member->>'role'), ''), 'member');
  v_status := coalesce(nullif(trim(p_member->>'status'), ''), 'active');
  v_onboarding_status := coalesce(nullif(trim(p_member->>'onboarding_status'), ''), 'pending');
  IF nullif(trim(p_member->>'join_date'), '') IS NULL THEN
    v_join_date := current_date;
  ELSE
    BEGIN
      v_join_date := (p_member->>'join_date')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Invalid join_date';
    END;
  END IF;

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
 THEN RAISE EXCEPTION 'MEMBER_NUMBER_INVALID' USING ERRCODE='22023'; END IF;
  IF v_membership_number IS NULL THEN RAISE EXCEPTION 'Membership number is required'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Member name is required'; END IF;
  IF v_phone IS NULL THEN RAISE EXCEPTION 'Member phone is required'; END IF;

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
 THEN
    v_membership_number := v_member_number;
  END IF;
  v_name := nullif(trim(p_member->>'name'), '');
  v_phone := nullif(trim(p_member->>'phone'), '');
  v_email := nullif(trim(p_member->>'email'), '');
  v_national_id := nullif(trim(p_member->>'national_id'), '');
  v_role := coalesce(nullif(trim(p_member->>'role'), ''), 'member');
  v_status := coalesce(nullif(trim(p_member->>'status'), ''), 'active');
  v_onboarding_status := coalesce(nullif(trim(p_member->>'onboarding_status'), ''), 'pending');
  IF nullif(trim(p_member->>'join_date'), '') IS NULL THEN
    v_join_date := current_date;
  ELSE
    BEGIN
      v_join_date := (p_member->>'join_date')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Invalid join_date';
    END;
  END IF;

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

  v_requested_month := date_trunc('month',p_through_month)::date;

  SELECT m.group_id,date_trunc('month',m.join_date)::date
  INTO v_group_id,v_join_month
  FROM public.members m
  WHERE m.id=p_member_id;

  IF v_group_id IS NULL THEN
    RETURN;
  END IF;

  IF v_join_month IS NULL THEN
    v_join_month=v_requested_month;
  END IF;

  SELECT ct.id INTO v_monthly_type_id
  FROM public.contribution_types ct
  WHERE ct.group_id=v_group_id
    AND (ct.code='monthly' OR lower(trim(ct.name))='monthly')
  ORDER BY CASE WHEN ct.code='monthly' THEN 0 ELSE 1 END,ct.created_at,ct.id
  LIMIT 1;

  IF v_monthly_type_id IS NULL THEN
    RAISE EXCEPTION 'Canonical Monthly contribution type is missing';
  END IF;

  SELECT min(date_trunc('month',r.effective_from)::date) INTO v_earliest_rule_month FROM public.member_contribution_rules r WHERE r.group_id=v_group_id AND r.member_id=p_member_id AND r.contribution_type_id=v_monthly_type_id AND r.frequency='monthly' AND r.effective_from IS NOT NULL;
  SELECT min(date_trunc('month',o.obligation_month)::date) INTO v_earliest_obligation_month FROM public.contribution_obligations o WHERE o.group_id=v_group_id AND o.member_id=p_member_id AND o.contribution_type_id=v_monthly_type_id;
  SELECT min(date_trunc('month',c.contribution_date)::date) INTO v_earliest_payment_month FROM public.contributions c WHERE c.group_id=v_group_id AND c.member_id=p_member_id AND lower(trim(coalesce(c.contribution_type,'')))='monthly' AND c.contribution_date IS NOT NULL;
  v_financial_start_month := least(coalesce(v_earliest_rule_month,v_requested_month),coalesce(v_earliest_obligation_month,v_requested_month),coalesce(v_earliest_payment_month,v_requested_month),v_requested_month);

  SELECT max(c.contribution_date)
  INTO v_latest_payment_month
  FROM public.contributions c
  WHERE c.member_id=p_member_id
    AND lower(trim(coalesce(c.contribution_type,'')))='monthly'
    AND c.contribution_date IS NOT NULL;

  SELECT max(o.obligation_month)
  INTO v_latest_obligation_month
  FROM public.contribution_obligations o
  WHERE o.member_id=p_member_id
    AND o.contribution_type_id=v_monthly_type_id;

  v_effective_through_month := greatest(
    v_requested_month,
    coalesce(date_trunc('month',v_latest_payment_month)::date,v_requested_month),
    coalesce(v_latest_obligation_month,v_requested_month),
    coalesce((
      SELECT max((date_trunc('month', r.effective_from)+interval '1 month')::date)
      FROM public.member_contribution_rules r
      WHERE r.group_id=v_group_id
        AND r.member_id=p_member_id
        AND r.contribution_type_id=v_monthly_type_id
        AND r.frequency='monthly'
        AND r.status='active'
        AND r.first_period_rule='next_full_period'
        AND date_trunc('month',r.effective_from)::date=v_join_month
    ),v_requested_month)
  );

  v_initial_lock_end=v_effective_through_month;

  PERFORM public.cl_2b_accounting_lock_range(v_group_id,v_financial_start_month,v_initial_lock_end);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' || v_group_id::text || ':' || p_member_id::text,
      0
    )
  );

  INSERT INTO public.contribution_obligations (
    group_id,member_id,contribution_type_id,rule_id,obligation_month,due_amount
  )
  SELECT r.group_id,r.member_id,r.contribution_type_id,r.id,gs::date,r.amount
  FROM public.member_contribution_rules r
  CROSS JOIN LATERAL generate_series(
    CASE WHEN r.first_period_rule='next_full_period'
      THEN (date_trunc('month',r.effective_from)+interval '1 month')::date
      ELSE date_trunc('month',r.effective_from)::date END,
    least(v_effective_through_month,coalesce(date_trunc('month',r.effective_to)::date,v_effective_through_month)),
    interval '1 month'
  ) gs
  WHERE r.group_id=v_group_id
    AND r.member_id=p_member_id
    AND r.contribution_type_id=v_monthly_type_id
    AND r.frequency='monthly'
    AND r.status='active'
    AND date_trunc('month',r.effective_from)::date<=v_effective_through_month
    AND (
      r.effective_to IS NULL
      OR date_trunc('month',r.effective_to)::date >= CASE WHEN r.first_period_rule='next_full_period'
        THEN (date_trunc('month',r.effective_from)+interval '1 month')::date
        ELSE date_trunc('month',r.effective_from)::date END
    )
  ON CONFLICT (group_id,member_id,contribution_type_id,obligation_month) WHERE component_kind = 'PARENT' AND rule_id IS NOT NULL DO NOTHING;

  WITH monthly_payments AS (
    SELECT c.id AS payment_id,c.amount::numeric AS amount,c.contribution_date,c.created_at
    FROM public.contributions c
    WHERE c.group_id=v_group_id
      AND c.member_id=p_member_id
      AND lower(trim(coalesce(c.contribution_type,'')))='monthly'
      AND c.contribution_date IS NOT NULL
      AND date_trunc('month',c.contribution_date)::date<=v_effective_through_month
  ),
  payment_allocations AS (
    SELECT p.payment_id,
      coalesce(sum(a.amount),0)::numeric AS all_allocated_amount,
      coalesce(sum(a.amount) FILTER (WHERE o.id IS NOT NULL),0)::numeric AS monthly_allocated_amount
    FROM monthly_payments p
    LEFT JOIN public.contribution_allocations a ON a.payment_id=p.payment_id
    LEFT JOIN public.contribution_obligations o ON o.id=a.obligation_id
      AND o.group_id=v_group_id AND o.member_id=p_member_id AND o.contribution_type_id=v_monthly_type_id
    GROUP BY p.payment_id
  ),
  payment_residuals AS (
    SELECT p.payment_id,greatest(p.amount-coalesce(pa.all_allocated_amount,0),0)::numeric AS residual_amount,p.contribution_date,p.created_at
    FROM monthly_payments p
    LEFT JOIN payment_allocations pa ON pa.payment_id=p.payment_id
    WHERE p.amount>coalesce(pa.all_allocated_amount,0)
  ),
  monthly_obligations AS (
    SELECT o.id AS obligation_id,o.due_amount::numeric AS due_amount,o.obligation_month
    FROM public.contribution_obligations o
    WHERE o.group_id=v_group_id AND o.member_id=p_member_id
      AND o.contribution_type_id=v_monthly_type_id
      AND o.obligation_month<=v_effective_through_month
  ),
  obligation_allocations AS (
    SELECT o.obligation_id,
      coalesce(sum(a.amount) FILTER (WHERE p.id IS NOT NULL),0)::numeric AS monthly_allocated_amount
    FROM monthly_obligations o
    LEFT JOIN public.contribution_allocations a ON a.obligation_id=o.obligation_id
    LEFT JOIN public.contributions p ON p.id=a.payment_id
      AND p.group_id=v_group_id AND p.member_id=p_member_id
      AND lower(trim(coalesce(p.contribution_type,'')))='monthly'
    GROUP BY o.obligation_id
  ),
  obligation_residuals AS (
    SELECT o.obligation_id,greatest(o.due_amount-coalesce(oa.monthly_allocated_amount,0),0)::numeric AS residual_amount,o.obligation_month
    FROM monthly_obligations o
    LEFT JOIN obligation_allocations oa ON oa.obligation_id=o.obligation_id
    WHERE o.due_amount>coalesce(oa.monthly_allocated_amount,0)
  ),
  payment_ranges AS (
    SELECT pr.*,
      coalesce(sum(pr.residual_amount) OVER (
        ORDER BY pr.contribution_date,pr.created_at,pr.payment_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)::numeric AS payment_from,
      sum(pr.residual_amount) OVER (
        ORDER BY pr.contribution_date,pr.created_at,pr.payment_id
        ROWS UNBOUNDED PRECEDING)::numeric AS payment_to
    FROM payment_residuals pr
  ),
  obligation_ranges AS (
    SELECT orr.*,
      coalesce(sum(orr.residual_amount) OVER (
        ORDER BY orr.obligation_month,orr.obligation_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)::numeric AS obligation_from,
      sum(orr.residual_amount) OVER (
        ORDER BY orr.obligation_month,orr.obligation_id
        ROWS UNBOUNDED PRECEDING)::numeric AS obligation_to
    FROM obligation_residuals orr
  ),
  matches AS (
    SELECT p.payment_id,o.obligation_id,
      greatest(0,least(p.payment_to,o.obligation_to)-greatest(p.payment_from,o.obligation_from))::numeric AS allocation_amount
    FROM payment_ranges p
    CROSS JOIN obligation_ranges o
    WHERE greatest(0,least(p.payment_to,o.obligation_to)-greatest(p.payment_from,o.obligation_from))>0
  )
  INSERT INTO public.contribution_allocations (payment_id,obligation_id,amount)
  SELECT m.payment_id,m.obligation_id,m.allocation_amount
  FROM matches m
  WHERE NOT EXISTS (
    SELECT 1 FROM public.contribution_allocations a
    WHERE a.payment_id=m.payment_id AND a.obligation_id=m.obligation_id
  );

  IF EXISTS (
    SELECT 1
    FROM public.contribution_allocations a
    JOIN public.contributions p ON p.id=a.payment_id
    JOIN public.contribution_obligations o ON o.id=a.obligation_id
    WHERE (p.member_id=p_member_id OR o.member_id=p_member_id)
      AND (p.group_id<>o.group_id OR p.member_id<>o.member_id OR a.amount<=0)
  ) THEN
    RAISE EXCEPTION 'Cross-member/group allocation detected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT a.payment_id,sum(a.amount) allocated
      FROM public.contribution_allocations a
      JOIN public.contributions p ON p.id=a.payment_id
      WHERE p.member_id=p_member_id
      GROUP BY a.payment_id
    ) x
    JOIN public.contributions p ON p.id=x.payment_id
    WHERE x.allocated>p.amount
  ) THEN
    RAISE EXCEPTION 'Payment over-allocation detected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT a.obligation_id,sum(a.amount) allocated
      FROM public.contribution_allocations a
      JOIN public.contribution_obligations o ON o.id=a.obligation_id
      WHERE o.member_id=p_member_id
      GROUP BY a.obligation_id
    ) x
    JOIN public.contribution_obligations o ON o.id=x.obligation_id
    WHERE x.allocated>o.due_amount
  ) THEN
    RAISE EXCEPTION 'Obligation over-allocation detected';
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_guard_open_financial_period()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group_id uuid;
  v_lock_start date;
  v_lock_end date;
  v_status text;
  v_month text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_group_id := NEW.group_id;

    IF NEW.contribution_date IS NULL THEN
      RAISE EXCEPTION 'Contribution date is required for accounting-period protection';
    END IF;

    SELECT to_char(date_trunc('month', NEW.contribution_date), 'YYYY-MM')
      INTO v_month;

  ELSIF TG_OP = 'DELETE' THEN
    v_group_id := OLD.group_id;

    IF OLD.contribution_date IS NULL THEN
      RAISE EXCEPTION 'Contribution date is required for accounting-period protection';
    END IF;

    SELECT to_char(date_trunc('month', OLD.contribution_date), 'YYYY-MM')
      INTO v_month;

  ELSE
    IF OLD.group_id IS DISTINCT FROM NEW.group_id THEN
      RAISE EXCEPTION 'Contribution group cannot be changed';
    END IF;

    v_group_id := NEW.group_id;

    IF OLD.contribution_date IS NULL OR NEW.contribution_date IS NULL THEN
      RAISE EXCEPTION 'Contribution date is required for accounting-period protection';
    END IF;

    SELECT MIN(x.month_start), MAX(x.month_start)
      INTO v_lock_start, v_lock_end
    FROM (
      VALUES
        (date_trunc('month', OLD.contribution_date)::date),
        (date_trunc('month', NEW.contribution_date)::date)
    ) AS x(month_start);

    PERFORM public.cl_2b_accounting_lock_range(
      v_group_id,
      v_lock_start,
      v_lock_end
    );

    -- Existing periods are locked only after accounting serialization.
    -- Missing periods are intentionally treated as open and are never created.
    FOR v_status IN
      SELECT fp.status
      FROM public.financial_periods fp
      WHERE fp.group_id = v_group_id
        AND fp.month BETWEEN to_char(v_lock_start, 'YYYY-MM') AND to_char(v_lock_end, 'YYYY-MM')
      ORDER BY fp.month
      FOR UPDATE
    LOOP
      IF lower(COALESCE(v_status, 'open')) = 'closed' THEN
        RAISE EXCEPTION
          'Financial month is closed. Contributions cannot be changed.';
      END IF;
    END LOOP;

    RETURN NEW;
  END IF;

  v_lock_start := v_month;
  v_lock_end := v_month;

  PERFORM public.cl_2b_accounting_lock_range(
    v_group_id,
    v_lock_start,
    v_lock_end
  );

  SELECT fp.status
    INTO v_status
  FROM public.financial_periods fp
  WHERE fp.group_id = v_group_id
    AND fp.month = v_month
  FOR UPDATE;

  IF lower(COALESCE(v_status, 'open')) = 'closed' THEN
    RAISE EXCEPTION
      'Financial month % is closed. Contributions cannot be changed.',
      v_month;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.validate_recorded_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if new.recorded_by is null then raise exception 'No active member record is linked to this account'; end if;
 if not exists(select 1 from public.members m where m.id=new.recorded_by and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and lower(coalesce(m.status,''))='active' and lower(coalesce(m.onboarding_status,''))='active') then raise exception 'Invalid recorded_by member'; end if;
 return new;
end; $function$


COMMIT;
