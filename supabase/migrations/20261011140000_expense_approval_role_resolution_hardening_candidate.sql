-- CHAMA LIVE candidate-only hardening.
-- Resolve office names across structured and display fields without changing the
-- shared role helper or production database. Apply only to the candidate project
-- until all approval workflow gates pass.

CREATE OR REPLACE FUNCTION public.submit_expense_approval(
  p_expense_id uuid,
  p_decision text DEFAULT 'approved',
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_expense public.expenses%ROWTYPE;
  v_slot text;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_approvals integer;
  v_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to approve an expense';
  END IF;

  IF v_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;

  SELECT e.*
    INTO v_expense
  FROM public.expenses e
  WHERE e.id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  IF v_expense.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending expenses can receive approvals';
  END IF;

  -- expenses.recorded_by references auth.users in this schema.
  IF v_expense.recorded_by = v_user_id THEN
    RAISE EXCEPTION 'The expense recorder cannot approve or reject their own expense';
  END IF;

  -- Resolve a declared office first. When older rows contain only generic
  -- position values, use the display office or role as a compatibility fallback.
  WITH mine AS (
    SELECT
      lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position, '')), '_', ' '), '-', ' '), '\s+', ' ', 'g')) AS position,
      lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position_name, '')), '_', ' '), '-', ' '), '\s+', ' ', 'g')) AS position_name,
      lower(regexp_replace(replace(replace(btrim(coalesce(m.role, '')), '_', ' '), '-', ' '), '\s+', ' ', 'g')) AS technical_role
    FROM public.members m
    WHERE m.group_id = v_expense.group_id
      AND (m.user_id = v_user_id OR m.auth_user_id = v_user_id)
      AND lower(coalesce(m.status, '')) = 'active'
      AND lower(coalesce(m.onboarding_status, '')) = 'active'
    LIMIT 1
  )
  SELECT CASE
    WHEN position IN ('chairperson', 'vice chairperson', 'chair', 'vice chair')
      OR (position IN ('', 'member', 'other') AND (
        position_name IN ('chairperson', 'vice chairperson', 'chair', 'vice chair')
        OR technical_role IN ('chairperson', 'vice chairperson', 'chair', 'vice chair')
      )) THEN 'chair'
    WHEN position = 'treasurer'
      OR (position IN ('', 'member', 'other') AND (
        position_name = 'treasurer' OR technical_role = 'treasurer'
      )) THEN 'treasurer'
    WHEN position IN ('secretary', 'vice secretary')
      OR (position IN ('', 'member', 'other') AND (
        position_name IN ('secretary', 'vice secretary')
        OR technical_role IN ('secretary', 'vice secretary')
      )) THEN 'secretary'
    ELSE NULL
  END
  INTO v_slot
  FROM mine;

  IF v_slot IS NULL THEN
    RAISE EXCEPTION 'Your active group office is not eligible to approve expenses';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.expense_approvals ea
    WHERE ea.expense_id = v_expense.id
      AND ea.approver_user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You have already submitted a decision for this expense';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.expense_approvals ea
    WHERE ea.expense_id = v_expense.id
      AND ea.approval_slot = v_slot
  ) THEN
    RAISE EXCEPTION 'Another person has already filled your office approval slot';
  END IF;

  INSERT INTO public.expense_approvals (
    expense_id, group_id, approver_user_id, approval_slot, decision, note
  ) VALUES (
    v_expense.id, v_expense.group_id, v_user_id, v_slot, v_decision,
    nullif(btrim(coalesce(p_note, '')), '')
  );

  IF v_decision = 'rejected' THEN
    v_status := 'rejected';
  ELSE
    SELECT count(*)
      INTO v_approvals
    FROM public.expense_approvals ea
    WHERE ea.expense_id = v_expense.id
      AND ea.decision = 'approved';

    v_status := CASE WHEN v_approvals = 3 THEN 'approved' ELSE 'pending' END;
  END IF;

  UPDATE public.expenses
  SET approval_status = v_status
  WHERE id = v_expense.id;

  SELECT count(*)
    INTO v_approvals
  FROM public.expense_approvals ea
  WHERE ea.expense_id = v_expense.id
    AND ea.decision = 'approved';

  RETURN jsonb_build_object(
    'expense_id', v_expense.id,
    'approval_status', v_status,
    'approved_slots', v_approvals,
    'required_slots', 3,
    'recorded_by', v_expense.recorded_by
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_expense_approval(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_expense_approval(uuid, text, text) TO authenticated;
