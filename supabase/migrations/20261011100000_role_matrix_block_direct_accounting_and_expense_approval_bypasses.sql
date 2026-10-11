-- Candidate-only hardening for the role matrix.
-- No production deployment. No tables or columns are added.
--
-- Canonical contributions must be written only through authorized
-- SECURITY DEFINER accounting RPCs; authenticated direct table writes
-- are not an alternate accounting path.
--
-- Expense status mutation is deliberately fail-closed until the
-- existing schema can prove three distinct approvals. The current
-- expenses row has only approval_status and no separate approver slots.
-- Submissions remain pending; no direct approve/reject/restore/delete.

BEGIN;

DROP POLICY IF EXISTS contributions_insert_finance_role ON public.contributions;
DROP POLICY IF EXISTS contributions_update_finance_role ON public.contributions;
DROP POLICY IF EXISTS contributions_delete_treasurer_admin ON public.contributions;

DROP POLICY IF EXISTS expenses_insert_finance_role ON public.expenses;
DROP POLICY IF EXISTS expenses_update_finance_role ON public.expenses;
DROP POLICY IF EXISTS expenses_delete_treasurer_admin ON public.expenses;

CREATE POLICY expenses_insert_pending_only
ON public.expenses
FOR INSERT
TO authenticated
WITH CHECK (
  public.cl_user_has_role(group_id, ARRAY['chairperson','secretary','treasurer']::text[])
  AND approval_status = 'pending'
  AND NOT EXISTS (
    SELECT 1
    FROM public.financial_periods fp
    WHERE fp.group_id = expenses.group_id
      AND fp.month = to_char(expenses.date::timestamp with time zone, 'YYYY-MM')
      AND lower(coalesce(fp.status, 'open')) = 'closed'
  )
);

COMMIT;
