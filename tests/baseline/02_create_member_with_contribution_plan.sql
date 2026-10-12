-- READ-ONLY PRODUCTION BASELINE captured 2026-10-12
-- Rollback reference only. Do not run against production without explicit authorization.

-- create_member_with_contribution_plan(p_member jsonb, p_contribution_plan jsonb)
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

    IF NOT public.can_add_group_members(v_group_id) THEN
        RAISE EXCEPTION 'MEMBER_MANAGEMENT_NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;

    v_member_number := nullif(trim(p_member->>'member_number'), '');
    v_membership_number := nullif(trim(p_member->>'membership_number'), '');
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
;