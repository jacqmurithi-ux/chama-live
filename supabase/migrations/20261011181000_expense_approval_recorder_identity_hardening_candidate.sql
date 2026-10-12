-- CHAMA LIVE candidate-only hardening for three-distinct-person expense approval.
-- expenses.recorded_by references public.members(id), not auth.users(id).
-- Keep production unchanged until this candidate passes all approval and RLS tests.

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
  v_mine record;
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

  -- Fail closed if the expense recorder cannot be tied to a member.
  IF v_expense.recorded_by IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.members recorder
    WHERE recorder.id = v_expense.recorded_by
      AND recorder.group_id = v_expense.group_id
      AND lower(coalesce(recorder.status, 'active')) = 'active'
      AND lower(coalesce(recorder.onboarding_status, 'active')) = 'active'
  ) THEN
    RAISE EXCEPTION 'Expense recorder cannot be verified; approval is blocked';
  END IF;

  -- recorded_by is members.id. Resolve it to the authenticated identity
  -- before checking self-approval; never compare member UUID directly to auth.uid().
  IF EXISTS (
    SELECT 1
    FROM public.members recorder
    WHERE recorder.id = v_expense.recorded_by
      AND recorder.group_id = v_expense.group_id
      AND (recorder.user_id = v_user_id OR recorder.auth_user_id = v_user_id)
  ) THEN
    RAISE EXCEPTION 'The expense recorder cannot approve or reject their own expense';
  END IF;

  SELECT
    lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position, '')), '_', ' '), '-', ' '), '\s+', ' ', 'g')) AS position,
    lower(regexp_replace(replace(replace(btrim(coalesce(m.actual_position_name, '')), '_', ' '), '-', ' '), '\s+', ' ', 'g')) AS position_name,
    lower(regexp_replace(replace(replace(btrim(coalesce(m.role, 'member')), '_', ' '), '-', ' '), '\s+', ' ', 'g')) AS technical_role
  INTO v_mine
  FROM public.members m
  WHERE m.group_id = v_expense.group_id
    AND (m.user_id = v_user_id OR m.auth_user_id = v_user_id)
    AND lower(coalesce(m.status, 'active')) = 'active'
    AND lower(coalesce(m.onboarding_status, 'active')) = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active membership in this group is required';
  END IF;

  -- Group Admin is not an approval office, even if a generic position field
  -- happens to contain a chair title. Approval eligibility is office-specific.
  IF v_mine.technical_role IN ('admin', 'administrator')
    OR v_mine.position IN ('admin', 'administrator')
    OR v_mine.position_name IN ('admin', 'administrator') THEN
    RAISE EXCEPTION 'Group Admin cannot occupy an expense approval slot';
  END IF;

  IF v_mine.position IN ('chairperson', 'vice chairperson', 'chair', 'vice chair')
    OR (v_mine.position IN ('', 'member', 'other') AND
        v_mine.position_name IN ('chairperson', 'vice chairperson', 'chair', 'vice chair'))
    OR (v_mine.position IN ('', 'member', 'other') AND
        v_mine.technical_role IN ('chairperson', 'vice chairperson', 'chair', 'vice chair')) THEN
    v_slot := 'chair';
  ELSIF v_mine.position = 'treasurer'
    OR (v_mine.position IN ('', 'member', 'other') AND v_mine.position_name = 'treasurer')
    OR (v_mine.position IN ('', 'member', 'other') AND v_mine.technical_role = 'treasurer') THEN
    v_slot := 'treasurer';
  ELSIF v_mine.position IN ('secretary', 'vice secretary')
    OR (v_mine.position IN ('', 'member', 'other') AND
        v_mine.position_name IN ('secretary', 'vice secretary'))
    OR (v_mine.position IN ('', 'member', 'other') AND
        v_mine.technical_role IN ('secretary', 'vice secretary')) THEN
    v_slot := 'secretary';
  ELSE
    RAISE EXCEPTION 'Your active group office is not eligible to approve expenses';
  END IF;

  -- Defensive checks provide clear errors; unique constraints remain the
  -- database-enforced protection against concurrent duplicate approvals.
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
    'approval_slot', v_slot
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_expense_approval(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_expense_approval(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.submit_expense_approval(uuid, text, text) IS
'Candidate hardening: requires three distinct office slots and people; resolves expense recorder through members.id to auth identity; fails closed for missing recorder and excludes Group Admin.';
