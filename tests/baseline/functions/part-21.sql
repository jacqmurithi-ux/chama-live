-- STAGE ONLY: final production function definition, row 201 of 201.
-- Captured read-only on 2026-10-14; alphabetical inventory ordering, not dependency ordering.

CREATE OR REPLACE FUNCTION public.verify_member_payment_evidence(p_evidence_id uuid, p_decision text, p_rejection_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_evidence public.member_payment_evidence%rowtype;
    v_verifier public.members%rowtype;
    v_contribution jsonb;
    v_reason text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_evidence_id IS NULL THEN
        RAISE EXCEPTION 'Evidence id is required';
    END IF;

    IF p_decision NOT IN ('verified', 'rejected') THEN
        RAISE EXCEPTION 'Decision must be verified or rejected';
    END IF;

    v_reason := nullif(btrim(p_rejection_reason), '');

    IF p_decision = 'rejected' AND v_reason IS NULL THEN
        RAISE EXCEPTION 'Rejection reason is required';
    END IF;

    IF p_decision = 'verified' AND v_reason IS NOT NULL THEN
        RAISE EXCEPTION 'Rejection reason is only valid for rejected evidence';
    END IF;

    SELECT e.*
    INTO v_evidence
    FROM public.member_payment_evidence e
    WHERE e.id = p_evidence_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment evidence % not found', p_evidence_id;
    END IF;

    IF v_evidence.status <> 'pending' THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent_replay', true,
            'evidence_id', v_evidence.id,
            'status', v_evidence.status,
            'contribution_id', v_evidence.contribution_id,
            'verified_by', v_evidence.verified_by,
            'verified_at', v_evidence.verified_at,
            'rejection_reason', v_evidence.rejection_reason
        );
    END IF;

    SELECT m.*
    INTO v_verifier
    FROM public.members m
    WHERE m.group_id = v_evidence.group_id
      AND m.status = 'active'
      AND m.onboarding_status = 'active'
      AND (
          m.user_id = auth.uid()
          OR m.auth_user_id = auth.uid()
      )
    ORDER BY
        CASE
            WHEN m.auth_user_id = auth.uid() THEN 0
            ELSE 1
        END,
        m.id
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active group verifier identity required';
    END IF;

    IF NOT public.cl_user_has_role(
        v_evidence.group_id,
        ARRAY['admin','chairperson','secretary','treasurer']::text[]
    ) THEN
        RAISE EXCEPTION 'Payment verification authorization required';
    END IF;

    IF v_evidence.group_id IS NULL
       OR v_evidence.member_id IS NULL
       OR v_evidence.amount IS NULL
       OR v_evidence.amount <= 0
       OR v_evidence.payment_date IS NULL
       OR v_evidence.evidence_text IS NULL
       OR btrim(v_evidence.evidence_text) = ''
    THEN
        RAISE EXCEPTION 'Payment evidence integrity check failed';
    END IF;

    IF v_evidence.payment_method = 'M-Pesa'
       AND (
           v_evidence.mpesa_reference IS NULL
           OR btrim(v_evidence.mpesa_reference) = ''
       )
    THEN
        RAISE EXCEPTION 'M-Pesa reference is required';
    END IF;

    IF p_decision = 'rejected' THEN
        UPDATE public.member_payment_evidence
        SET status = 'rejected',
            verified_by = v_verifier.id,
            verified_at = now(),
            rejection_reason = v_reason,
            updated_at = now()
        WHERE id = v_evidence.id;

        RETURN jsonb_build_object(
            'success', true,
            'idempotent_replay', false,
            'evidence_id', v_evidence.id,
            'status', 'rejected',
            'contribution_id', NULL,
            'verified_by', v_verifier.id,
            'verified_at', now(),
            'rejection_reason', v_reason
        );
    END IF;

    v_contribution := public.cl_2b_record_contribution(
        v_evidence.id,
        v_evidence.group_id,
        v_evidence.member_id,
        v_evidence.amount,
        v_evidence.payment_date,
        'monthly',
        v_evidence.payment_method,
        v_evidence.mpesa_reference,
        v_evidence.mpesa_reference,
        NULL,
        v_evidence.evidence_text
    );

    UPDATE public.member_payment_evidence
    SET status = 'verified',
        contribution_id = v_evidence.id,
        verified_by = v_verifier.id,
        verified_at = now(),
        rejection_reason = NULL,
        updated_at = now()
    WHERE id = v_evidence.id;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', false,
        'evidence_id', v_evidence.id,
        'status', 'verified',
        'contribution_id', v_evidence.id,
        'verified_by', v_verifier.id,
        'verified_at', now(),
        'contribution', v_contribution
    );
END;
$function$
