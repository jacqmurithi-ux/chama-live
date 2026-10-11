-- Candidate-only hardening: do not use the legacy group helper for approval reads.
-- That helper has historically included a broad admin fallback.
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
