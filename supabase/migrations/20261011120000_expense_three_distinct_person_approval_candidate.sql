-- CHAMA LIVE candidate: three-distinct-person expense approval workflow.
-- Scope: candidate migration only. Never apply to production without a separate release gate.

CREATE TABLE IF NOT EXISTS public.expense_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  approver_user_id uuid NOT NULL REFERENCES auth.users(id),
  approval_slot text NOT NULL CHECK (approval_slot IN ('chair', 'treasurer', 'secretary')),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_approvals_one_slot_per_expense UNIQUE (expense_id, approval_slot),
  CONSTRAINT expense_approvals_one_vote_per_person UNIQUE (expense_id, approver_user_id)
);

CREATE INDEX IF NOT EXISTS expense_approvals_group_expense_idx
  ON public.expense_approvals (group_id, expense_id);

ALTER TABLE public.expense_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expense_approvals_select_same_group ON public.expense_approvals;
CREATE POLICY expense_approvals_select_same_group
  ON public.expense_approvals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.members m
      WHERE m.group_id = expense_approvals.group_id
        AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
        AND lower(coalesce(m.status, '')) = 'active'
        AND lower(coalesce(m.onboarding_status, '')) = 'active'
    )
  );

REVOKE ALL ON TABLE public.expense_approvals FROM anon, authenticated;
GRANT SELECT ON TABLE public.expense_approvals TO authenticated;

-- Existing recorder triggers must not rewrite recorded_by during a status-only
-- update made by the approval RPC. They still validate the recorder on insert
-- and whenever group_id / recorded_by is explicitly changed.
DROP TRIGGER IF EXISTS expenses_set_recorded_by ON public.expenses;
CREATE TRIGGER expenses_set_recorded_by
  BEFORE INSERT OR UPDATE OF recorded_by, group_id ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_recorded_by_from_auth();

DROP TRIGGER IF EXISTS expenses_validate_recorded_by ON public.expenses;
CREATE TRIGGER expenses_validate_recorded_by
  BEFORE INSERT OR UPDATE OF recorded_by, group_id ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.validate_recorded_by();

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

  -- An expense author cannot approve their own submission.
  IF v_expense.recorded_by = v_user_id THEN
    RAISE EXCEPTION 'The expense recorder cannot approve or reject their own expense';
  END IF;

  -- One slot per office family: Chair OR Vice Chair, Treasurer,
  -- Secretary OR Vice Secretary. Group Admin is not an approval slot.
  IF public.cl_user_has_role(v_expense.group_id, ARRAY['chairperson']) THEN
    v_slot := 'chair';
  ELSIF public.cl_user_has_role(v_expense.group_id, ARRAY['treasurer']) THEN
    v_slot := 'treasurer';
  ELSIF public.cl_user_has_role(v_expense.group_id, ARRAY['secretary']) THEN
    v_slot := 'secretary';
  ELSE
    RAISE EXCEPTION 'Your group role is not eligible to approve expenses';
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
