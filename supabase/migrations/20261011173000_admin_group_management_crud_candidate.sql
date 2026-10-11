-- CHAMA LIVE candidate-only: restore full Admin CRUD on group-management tables
-- whose RLS was enabled but had no policies. Scope every row to the Admin's
-- active group membership through cl_user_has_role(). This does not touch
-- platform administration, audit tables, payment application tables, or the
-- canonical contribution ledger. Expense approval remains a separate 3-person
-- workflow and canonical accounting writes remain RPC-controlled.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'announcements',
    'documents',
    'contribution_goals',
    'group_contribution_calendar_periods',
    'group_contribution_settings'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_full_group_crud ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY admin_full_group_crud ON public.%I FOR ALL TO authenticated USING (public.cl_user_has_role(group_id, ARRAY[''admin'']::text[])) WITH CHECK (public.cl_user_has_role(group_id, ARRAY[''admin'']::text[]))',
      t
    );
  END LOOP;
END $$;

COMMENT ON POLICY admin_full_group_crud ON public.announcements IS
'Candidate: active group Admin can read and manage announcements only in groups where they hold the Admin role.';
COMMENT ON POLICY admin_full_group_crud ON public.documents IS
'Candidate: active group Admin can manage document metadata only in groups where they hold the Admin role. Storage bucket policies remain a separate check.';
COMMENT ON POLICY admin_full_group_crud ON public.contribution_goals IS
'Candidate: active group Admin can manage contribution goal configuration for their own group.';
COMMENT ON POLICY admin_full_group_crud ON public.group_contribution_calendar_periods IS
'Candidate: active group Admin can manage contribution calendar periods for their own group.';
COMMENT ON POLICY admin_full_group_crud ON public.group_contribution_settings IS
'Candidate: active group Admin can manage contribution settings for their own group; canonical accounting remains RPC-controlled.';
