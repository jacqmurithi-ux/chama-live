-- Candidate-only RLS alignment for contribution type/settings writes.
-- The frontend matrix assigns contribution settings to the group Admin and Treasurer.
-- Do not permit Chairperson/Secretary writes solely because they are group officers.
-- All contribution ledger rows and canonical accounting remain RPC-owned.

DROP POLICY IF EXISTS contribution_types_insert_admin ON public.contribution_types;
CREATE POLICY contribution_types_insert_admin
ON public.contribution_types
FOR INSERT
TO authenticated
WITH CHECK (
  public.cl_user_has_role(group_id, ARRAY['admin', 'treasurer']::text[])
  AND (
    created_by IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.members m
      WHERE m.id = contribution_types.created_by
        AND m.group_id = contribution_types.group_id
        AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
        AND lower(coalesce(m.status, 'active')) = 'active'
        AND lower(coalesce(m.onboarding_status, 'active')) = 'active'
    )
  )
);

DROP POLICY IF EXISTS contribution_types_update_admin ON public.contribution_types;
CREATE POLICY contribution_types_update_admin
ON public.contribution_types
FOR UPDATE
TO authenticated
USING (
  public.cl_user_has_role(group_id, ARRAY['admin', 'treasurer']::text[])
)
WITH CHECK (
  public.cl_user_has_role(group_id, ARRAY['admin', 'treasurer']::text[])
);

DROP POLICY IF EXISTS contribution_types_delete_admin ON public.contribution_types;
CREATE POLICY contribution_types_delete_admin
ON public.contribution_types
FOR DELETE
TO authenticated
USING (
  public.cl_user_has_role(group_id, ARRAY['admin', 'treasurer']::text[])
);
