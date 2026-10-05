/*
  CHAMA LIVE — Custom Contribution Creation v1.2
  DEPLOYMENT CANDIDATE ONLY — DO NOT EXECUTE WITHOUT EXPLICIT AUTHORIZATION

  Scope:
    - Permit contribution_types.code = 'custom'
    - Create private replay ledger
    - Create public.create_custom_contribution(...)
    - Restrict EXECUTE to authenticated
    - No activation
    - No obligations
    - No payments
    - No allocations
    - No accounting-lock acquisition
    - No production execution is implied by this file

  Frozen replay identity:
    canonical JSONB payload -> UTF-8 text -> SHA-256 hex

  Frozen request lock:
    pg_advisory_xact_lock(
      hashtextextended(
        'chama-live:custom-contribution-request:' ||
        p_request_id::text ||
        ':create',
        0
      )
    )
*/

BEGIN;

-- ================================================================
-- 1. CONTRIBUTION TYPE VOCABULARY
-- ================================================================

ALTER TABLE public.contribution_types
    DROP CONSTRAINT IF EXISTS contribution_types_code_check;

ALTER TABLE public.contribution_types
    ADD CONSTRAINT contribution_types_code_check
    CHECK (
        code IS NULL
        OR code = ANY (
            ARRAY[
                'monthly'::text,
                'registration'::text,
                'special'::text,
                'welfare'::text,
                'custom'::text
            ]
        )
    );

-- ================================================================
-- 2. PRIVATE REQUEST / REPLAY LEDGER
-- ================================================================

CREATE TABLE private.custom_contribution_requests (
    request_id uuid NOT NULL,
    operation text NOT NULL,
    group_id uuid NOT NULL,
    contribution_type_id uuid,
    period_id uuid,
    fine_rule_id uuid,
    payload_hash text NOT NULL,
    result jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,

    CONSTRAINT custom_contribution_requests_pkey
        PRIMARY KEY (request_id, operation),

    CONSTRAINT custom_contribution_requests_group_fkey
        FOREIGN KEY (group_id)
        REFERENCES public.groups(id)
        ON DELETE CASCADE,

    CONSTRAINT custom_contribution_requests_operation_check
        CHECK (operation = 'create'),

    CONSTRAINT custom_contribution_requests_payload_hash_check
        CHECK (payload_hash ~ '^[0-9a-f]{64}$')
);

ALTER TABLE private.custom_contribution_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.custom_contribution_requests FROM PUBLIC;
REVOKE ALL ON TABLE private.custom_contribution_requests FROM anon;
REVOKE ALL ON TABLE private.custom_contribution_requests FROM authenticated;
REVOKE ALL ON TABLE private.custom_contribution_requests FROM service_role;

-- ================================================================
-- 3. CUSTOM CONTRIBUTION CREATION RPC
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_custom_contribution(
    p_group_id uuid,
    p_name text,
    p_description text,
    p_amount numeric,
    p_frequency text,
    p_start_date date,
    p_due_date date,
    p_closing_date date,
    p_grace_period_value integer,
    p_apply_fine boolean,
    p_fine_amount numeric,
    p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_auth_user_id uuid := auth.uid();
    v_member_id uuid;
    v_type_id uuid;
    v_period_id uuid;
    v_fine_rule_id uuid := NULL;
    v_period_key text;
    v_payload jsonb;
    v_payload_hash text;
    v_result jsonb;
    v_existing_hash text;
    v_existing_result jsonb;
BEGIN
    -- ------------------------------------------------------------
    -- A. Authentication
    -- ------------------------------------------------------------

    IF v_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    IF p_group_id IS NULL
       OR p_request_id IS NULL THEN
        RAISE EXCEPTION 'GROUP_ID_AND_REQUEST_ID_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    -- ------------------------------------------------------------
    -- B. Group authorization
    --
    -- Allowed:
    --   group owner
    --   active admin
    --   active chairperson
    --
    -- cl_user_has_role() already treats role=admin as authorized
    -- whenever the requested role array is checked.
    -- ------------------------------------------------------------

    IF NOT EXISTS (
        SELECT 1
        FROM public.groups g
        WHERE g.id = p_group_id
          AND g.owner_user_id = v_auth_user_id
    )
    AND NOT public.cl_user_has_role(
        p_group_id,
        ARRAY['chairperson']::text[]
    ) THEN
        RAISE EXCEPTION 'CUSTOM_CONTRIBUTION_NOT_AUTHORIZED'
            USING ERRCODE = '42501';
    END IF;

    -- The metadata tables require a member identity for created_by.
    SELECT m.id
      INTO v_member_id
      FROM public.members m
     WHERE m.group_id = p_group_id
       AND (m.user_id = v_auth_user_id OR m.auth_user_id = v_auth_user_id)
       AND lower(coalesce(m.status, 'active')) = 'active'
       AND lower(coalesce(m.onboarding_status, 'active')) = 'active'
     ORDER BY m.id
     LIMIT 1;

    IF v_member_id IS NULL THEN
        RAISE EXCEPTION 'ACTIVE_GROUP_MEMBER_REQUIRED'
            USING ERRCODE = '42501';
    END IF;

    -- ------------------------------------------------------------
    -- C. Input validation
    -- ------------------------------------------------------------

    IF nullif(trim(coalesce(p_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'CONTRIBUTION_NAME_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'CONTRIBUTION_AMOUNT_MUST_BE_POSITIVE'
            USING ERRCODE = '22023';
    END IF;

    IF p_frequency IS NULL
       OR p_frequency NOT IN (
            'one_time',
            'weekly',
            'monthly',
            'quarterly',
            'annual'
       ) THEN
        RAISE EXCEPTION 'INVALID_CUSTOM_CONTRIBUTION_FREQUENCY'
            USING ERRCODE = '22023';
    END IF;

    IF p_start_date IS NULL
       OR p_due_date IS NULL
       OR p_closing_date IS NULL THEN
        RAISE EXCEPTION 'START_DUE_CLOSING_DATES_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF p_start_date > p_due_date
       OR p_due_date > p_closing_date THEN
        RAISE EXCEPTION 'INVALID_CUSTOM_CONTRIBUTION_DATE_RANGE'
            USING ERRCODE = '22023';
    END IF;

    IF p_grace_period_value IS NULL
       OR p_grace_period_value < 0 THEN
        RAISE EXCEPTION 'INVALID_GRACE_PERIOD'
            USING ERRCODE = '22023';
    END IF;

    IF p_apply_fine IS NULL THEN
        RAISE EXCEPTION 'APPLY_FINE_REQUIRED'
            USING ERRCODE = '22023';
    END IF;

    IF p_apply_fine
       AND (p_fine_amount IS NULL OR p_fine_amount <= 0) THEN
        RAISE EXCEPTION 'FINE_AMOUNT_MUST_BE_POSITIVE_WHEN_ENABLED'
            USING ERRCODE = '22023';
    END IF;

    -- When fines are disabled, fine_amount has no semantic meaning.
    -- It is normalized to NULL in the replay identity and is not used.
    IF NOT p_apply_fine THEN
        p_fine_amount := NULL;
    END IF;

    -- ------------------------------------------------------------
    -- D. Canonical payload + SHA-256 identity
    -- ------------------------------------------------------------

    v_payload := jsonb_build_object(
        'group_id', p_group_id,
        'name', trim(p_name),
        'description', coalesce(p_description, ''),
        'amount', p_amount,
        'frequency', p_frequency,
        'start_date', p_start_date,
        'due_date', p_due_date,
        'closing_date', p_closing_date,
        'grace_period_value', p_grace_period_value,
        'apply_fine', p_apply_fine,
        'fine_amount',
            CASE
                WHEN p_apply_fine THEN p_fine_amount
                ELSE NULL
            END
    );

    v_payload_hash := encode(
        extensions.digest(
            convert_to(v_payload::text, 'UTF8'),
            'sha256'
        ),
        'hex'
    );

    -- ------------------------------------------------------------
    -- E. Request/replay serialization
    -- ------------------------------------------------------------

    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'chama-live:custom-contribution-request:' ||
            p_request_id::text ||
            ':create',
            0
        )
    );

    SELECT r.payload_hash, r.result
      INTO v_existing_hash, v_existing_result
      FROM private.custom_contribution_requests r
     WHERE r.request_id = p_request_id
       AND r.operation = 'create'
     FOR UPDATE;

    IF v_existing_hash IS NOT NULL THEN
        IF v_existing_hash <> v_payload_hash THEN
            RAISE EXCEPTION 'REQUEST_ID_REUSE_MISMATCH'
                USING ERRCODE = '22023';
        END IF;

        IF v_existing_result IS NULL THEN
            RAISE EXCEPTION 'REQUEST_ALREADY_CLAIMED_WITHOUT_RESULT'
                USING ERRCODE = '55000';
        END IF;

        RETURN jsonb_set(
            v_existing_result,
            '{replayed}',
            'true'::jsonb,
            true
        );
    END IF;

    INSERT INTO private.custom_contribution_requests (
        request_id,
        operation,
        group_id,
        payload_hash
    )
    VALUES (
        p_request_id,
        'create',
        p_group_id,
        v_payload_hash
    );

    -- ------------------------------------------------------------
    -- F. Contribution type
    -- ------------------------------------------------------------

    INSERT INTO public.contribution_types (
        group_id,
        name,
        code,
        created_by
    )
    VALUES (
        p_group_id,
        trim(p_name),
        'custom',
        v_member_id
    )
    RETURNING id INTO v_type_id;

    -- Deterministic business identity. request_id remains the
    -- client operation identity and is deliberately not embedded.
    v_period_key :=
        'custom:v1:' ||
        v_type_id::text || ':' ||
        to_char(p_start_date, 'YYYY-MM-DD') || ':' ||
        to_char(p_due_date, 'YYYY-MM-DD') || ':' ||
        to_char(p_closing_date, 'YYYY-MM-DD');

    -- ------------------------------------------------------------
    -- G. Optional fixed missed-contribution fine
    -- ------------------------------------------------------------

    IF p_apply_fine THEN
        INSERT INTO public.fine_rules (
            group_id,
            name,
            description,
            trigger_type,
            specificity_level,
            priority,
            calculation_method,
            fixed_amount,
            percentage_rate,
            minimum_amount,
            maximum_amount,
            grace_period_value,
            grace_period_unit,
            applicability_mode,
            effective_from,
            effective_until,
            status,
            created_by,
            updated_by
        )
        VALUES (
            p_group_id,
            trim(p_name) || ' Fine',
            'Automatic fixed fine for missed ' || trim(p_name) || ' contribution.',
            'missed_contribution',
            1,
            0,
            'FIXED',
            p_fine_amount,
            NULL,
            NULL,
            NULL,
            p_grace_period_value,
            'DAY',
            'ALL',
            p_start_date::timestamp AT TIME ZONE 'UTC',
            NULL,
            'active',
            v_member_id,
            v_member_id
        )
        RETURNING id INTO v_fine_rule_id;

        INSERT INTO public.fine_rule_contribution_types (
            rule_id,
            contribution_type_id
        )
        VALUES (
            v_fine_rule_id,
            v_type_id
        );
    END IF;

    -- ------------------------------------------------------------
    -- H. DRAFT contribution period only
    -- ------------------------------------------------------------

    INSERT INTO public.contribution_periods (
        group_id,
        contribution_type_id,
        frequency,
        period_key,
        opening_date,
        closing_date,
        due_date,
        status,
        created_by,
        name,
        description,
        amount,
        fine_rule_id
    )
    VALUES (
        p_group_id,
        v_type_id,
        p_frequency,
        v_period_key,
        p_start_date,
        p_closing_date,
        p_due_date,
        'draft',
        v_member_id,
        trim(p_name),
        NULLIF(trim(coalesce(p_description, '')), ''),
        p_amount,
        v_fine_rule_id
    )
    RETURNING id INTO v_period_id;

    -- ------------------------------------------------------------
    -- I. Persist exact result
    -- ------------------------------------------------------------

    v_result := jsonb_build_object(
        'ok', true,
        'operation', 'create',
        'replayed', false,
        'contribution_type_id', v_type_id,
        'period_id', v_period_id,
        'fine_rule_id', v_fine_rule_id,
        'status', 'draft',
        'period_key', v_period_key
    );

    UPDATE private.custom_contribution_requests
       SET contribution_type_id = v_type_id,
           period_id = v_period_id,
           fine_rule_id = v_fine_rule_id,
           result = v_result,
           completed_at = now()
     WHERE request_id = p_request_id
       AND operation = 'create';

    RETURN v_result;
END;
$function$;

-- ================================================================
-- 4. EXECUTE POLICY
-- ================================================================

REVOKE ALL
ON FUNCTION public.create_custom_contribution(
    uuid,
    text,
    text,
    numeric,
    text,
    date,
    date,
    date,
    integer,
    boolean,
    numeric,
    uuid
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.create_custom_contribution(
    uuid,
    text,
    text,
    numeric,
    text,
    date,
    date,
    date,
    integer,
    boolean,
    numeric,
    uuid
)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.create_custom_contribution(
    uuid,
    text,
    text,
    numeric,
    text,
    date,
    date,
    date,
    integer,
    boolean,
    numeric,
    uuid
)
TO authenticated;

COMMIT;

/*
  DEPLOYMENT NOTE

  This is a candidate SQL artifact, not an executed migration.

  Before production deployment:
    - create the final migration through the Supabase CLI workflow
    - run SQL parse/compile checks in an isolated project
    - run Supabase DB advisors
    - inspect privileges and constraints
    - run authenticated positive/negative tests
    - verify replay behavior
    - verify no accounting/obligation/payment side effects

  DO NOT execute this candidate against production until the separate
  "Production Deployment Authorization — Custom Contribution v1.2"
  gate is explicitly passed.
*/
