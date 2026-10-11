-- Candidate-only safety gate for the three-person expense approval workflow.
-- expenses.recorded_by references public.members.id, not auth.users.id.
-- Apply to the candidate database only until the release gate is approved.
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
  v_recorder public.members%ROWTYPE;
  v_approver public.members%ROWTYPE;
  v_member_count integer;
  v_slot text;
  v_position text;
  v_position_name text;
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

  SELECT e.* INTO v_expense
  FROM public.expenses e
  WHERE e.id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  IF v_expense.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending expenses can receive approvals';
  END IF;

  -- Fail closed if recorded_by is NULL, stale, or points outside this group.
  IF v_expense.recorded_by IS NULL THEN
    RAISE EXCEPTION 'Expense recorder is missing; approval is blocked';
  END IF;

  SELECT m.* INTO v_recorder
  FROM public.members m
  WHERE m.id = v_expense.recorded_by
    AND m.group_id = v_expense.group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense recorder cannot be resolved to a member in this group; approval is blocked';
  END IF;

  IF v_recorder.user_id = v_user_id OR v_recorder.auth_user_id = v_user_id THEN
    RAISE EXCEPTION 'The expense recorder cannot approve or reject their own expense';
  END IF;

  -- Require exactly one active member record for the caller in this expense's group.
  SELECT count(*) INTO v_member_count
  FROM public.members m
  WHERE m.group_id = v_expense.group_id
    AND (m.user_id = v_user_id OR m.auth_user_id = v_user_id)
    AND lower(coalesce(m.status, '')) = 'active'
    AND lower(coalesce(m.onboarding_status, '')) = 'active';

  IF v_member_count <> 1 THEN
    RAISE EXCEPTION 'Exactly one active member record in this group is required to approve expenses';
  END IF;

  SELECT m.* INTO v_approver
  FROM public.members m
  WHERE m.group_id = v_expense.group_id
    AND (m.user_id = v_user_id OR m.auth_user_id = v_user_id)
    AND lower(coalesce(m.status, '')) = 'active'
    AND lower(coalesce(m.onboarding_status, '')) = 'active';

  v_position := lower(regexp_replace(
    replace(replace(btrim(coalesce(v_approver.actual_position, '')), '_', ' '), '-', ' '),
    '[[:space:]]+', ' ', 'g'
  ));
  v_position_name := lower(regexp_replace(
    replace(replace(btrim(coalesce(v_approver.actual_position_name, '')), '_', ' '), '-', ' '),
    '[[:space:]]+', ' ', 'g'
  ));

  -- Office position, not technical system role, controls the approval slot.
  -- Chair/Vice Chair share one slot; Secretary/Vice Secretary share one slot.
  IF v_position IN ('chairperson', 'vice chairperson', 'chair', 'vice chair')
     OR v_position_name IN ('chairperson', 'vice chairperson', 'chair', 'vice chair') THEN
    v_slot := 'chair';
  ELSIF v_position = 'treasurer' OR v_position_name = 'treasurer' THEN
    v_slot := 'treasurer';
  ELSIF v_position IN ('secretary', 'vice secretary')
     OR v_position_name IN ('secretary', 'vice secretary') THEN
    v_slot := 'secretary';
  ELSE
    RAISE EXCEPTION 'Your declared group office is not eligible to approve expenses';
  END IF;

  -- Table constraints also enforce one vote per person and one vote per slot.
  -- The expense row lock serializes competing votes for this expense.
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
    SELECT count(*) INTO v_approvals
    FROM public.expense_approvals ea
    WHERE ea.expense_id = v_expense.id
      AND ea.decision = 'approved';

    v_status := CASE WHEN v_approvals = 3 THEN 'approved' ELSE 'pending' END;
  END IF;

  UPDATE public.expenses
  SET approval_status = v_status
  WHERE id = v_expense.id;

  SELECT count(*) INTO v_approvals
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
