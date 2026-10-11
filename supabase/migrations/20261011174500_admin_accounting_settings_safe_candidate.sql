-- Candidate-only hardening: contribution settings and calendar writes must go
-- through the validated accounting/settings RPCs, not unrestricted table CRUD.
-- Admin remains authorized to call those RPCs through cl_user_has_role().

DROP POLICY IF EXISTS admin_full_group_crud ON public.group_contribution_settings;
DROP POLICY IF EXISTS admin_full_group_crud ON public.group_contribution_calendar_periods;

CREATE POLICY admin_read_group_settings ON public.group_contribution_settings
  FOR SELECT TO authenticated
  USING (public.cl_user_has_role(group_id, ARRAY['admin']::text[]));

CREATE POLICY admin_read_group_calendar ON public.group_contribution_calendar_periods
  FOR SELECT TO authenticated
  USING (public.cl_user_has_role(group_id, ARRAY['admin']::text[]));

COMMENT ON POLICY admin_read_group_settings ON public.group_contribution_settings IS
'Candidate: group Admin can read settings; validated SECURITY DEFINER settings RPCs own changes so monthly amounts and accounting-cycle configuration cannot be changed by direct table writes.';
COMMENT ON POLICY admin_read_group_calendar ON public.group_contribution_calendar_periods IS
'Candidate: group Admin can read calendar periods; validated settings RPCs own changes to preserve accounting-cycle invariants.';
