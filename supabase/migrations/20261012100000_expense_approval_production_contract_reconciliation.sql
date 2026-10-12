
-- CHAMA LIVE: expense approval workflow, reconciled for the production
-- expenses.recorded_by -> members.id contract. Three distinct office slots
-- (Chair/Vice Chair, Treasurer, Secretary/Vice Secretary) are required.

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
      SELECT 1 FROM public.members m
      WHERE m.group_id = expense_approvals.group_id
        AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
        AND lower(coalesce(m.status, '')) = 'active'
        AND lower(coalesce(m.onboarding_status, '')) = 'active'
    )
  );

REVOKE ALL ON TABLE public.expense_approvals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.expense_approvals TO authenticated;

-- Status-only updates must not overwrite the original expense recorder.
DROP TRIGGER IF EXISTS expenses_set_recorded_by ON public.expenses;
CREATE TRIGGER expenses_set_recorded_by
  BEFORE INSERT OR UPDATE OF recorded_by, group_id ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_recorded_by_from_auth();

DROP TRIGGER IF EXISTS expenses_validate_recorded_by ON public.expenses;
CREATE TRIGGER expenses_validate_recorded_by
  BEFORE INSERT OR UPDATE OF recorded_by, group_id ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.validate_recorded_by();

-- Approval status is RPC-owned. Direct status changes must not bypass approval.
CREATE OR REPLACE FUNCTION public.guard_expense_approval_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_table_owner text;
BEGIN
  SELECT pg_get_userbyid(c.relowner)
    INTO v_table_owner
  FROM pg_class c
  WHERE c.oid = 'public.expenses'::regclass;

  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status IS DISTINCT FROM 'pending'
       AND current_user <> v_table_owner THEN
      RAISE EXCEPTION 'Expenses must start pending; approval status is managed by the approval workflow';
    END IF;
  ELSIF NEW.approval_status IS DISTINCT FROM OLD.approval_status
        AND current_user <> v_table_owner THEN
    RAISE EXCEPTION 'Expense approval status can only be changed through the approval workflow';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_expense_approval_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_expense_approval_status_trigger ON public.expenses;
CREATE TRIGGER guard_expense_approval_status_trigger
  BEFORE INSERT OR UPDATE OF approval_status ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_expense_approval_status();

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

  -- Production records members.id; newer candidates may record auth.users.id.
  -- Support both without rewriting any existing expense or financial record.
  IF v_expense.recorded_by IS NULL THEN
    RAISE EXCEPTION 'Expense recorder is missing; approval is blocked';
  END IF;

  IF v_expense.recorded_by = v_user_id
     OR EXISTS (
       SELECT 1 FROM public.members recorder
       WHERE recorder.id = v_expense.recorded_by
         AND (recorder.user_id = v_user_id OR recorder.auth_user_id = v_user_id)
     ) THEN
    RAISE EXCEPTION 'The expense recorder cannot approve or reject their own expense';
  END IF;

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

  -- Office position controls approval; technical Admin does not get a slot.
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
