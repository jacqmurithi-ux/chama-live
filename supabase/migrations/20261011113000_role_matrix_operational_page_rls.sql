-- Candidate-only: align operational page RLS with the approved matrix.
-- Group Admin, Chair/Vice Chair, Treasurer and Secretary/Vice Secretary
-- may manage meetings, meeting documents, plans, activities and assets.
-- Vice offices are represented by the existing chairperson/secretary role
-- vocabulary; no role enum or table design is changed.

BEGIN;

DROP POLICY IF EXISTS group_assets_insert_management ON public.group_assets;
DROP POLICY IF EXISTS group_assets_update_management ON public.group_assets;
DROP POLICY IF EXISTS group_assets_delete_admin ON public.group_assets;
CREATE POLICY group_assets_insert_management ON public.group_assets
  FOR INSERT TO authenticated
  WITH CHECK (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]));
CREATE POLICY group_assets_update_management ON public.group_assets
  FOR UPDATE TO authenticated
  USING (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]))
  WITH CHECK (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]));
CREATE POLICY group_assets_delete_admin ON public.group_assets
  FOR DELETE TO authenticated
  USING (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]));

DROP POLICY IF EXISTS meetings_insert_group ON public.meetings;
DROP POLICY IF EXISTS meetings_update_group ON public.meetings;
DROP POLICY IF EXISTS meetings_delete_group ON public.meetings;
CREATE POLICY meetings_insert_group ON public.meetings
  FOR INSERT TO authenticated
  WITH CHECK (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]));
CREATE POLICY meetings_update_group ON public.meetings
  FOR UPDATE TO authenticated
  USING (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]))
  WITH CHECK (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]));
CREATE POLICY meetings_delete_group ON public.meetings
  FOR DELETE TO authenticated
  USING (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]));

DROP POLICY IF EXISTS meeting_documents_insert_official ON public.meeting_documents;
DROP POLICY IF EXISTS meeting_documents_update_official ON public.meeting_documents;
DROP POLICY IF EXISTS meeting_documents_delete_official ON public.meeting_documents;
CREATE POLICY meeting_documents_insert_official ON public.meeting_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[])
    AND EXISTS (
      SELECT 1 FROM public.meetings mt
      WHERE mt.id = meeting_documents.meeting_id
        AND mt.group_id = meeting_documents.group_id
        AND lower(coalesce(mt.status, '')) = 'completed'
    )
    AND EXISTS (
      SELECT 1 FROM public.members uploader
      WHERE uploader.id = meeting_documents.uploaded_by
        AND uploader.group_id = meeting_documents.group_id
        AND (uploader.user_id = auth.uid() OR uploader.auth_user_id = auth.uid())
        AND lower(coalesce(uploader.status, 'active')) = 'active'
        AND lower(coalesce(uploader.onboarding_status, 'active')) = 'active'
    )
  );
CREATE POLICY meeting_documents_update_official ON public.meeting_documents
  FOR UPDATE TO authenticated
  USING (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]))
  WITH CHECK (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]));
CREATE POLICY meeting_documents_delete_official ON public.meeting_documents
  FOR DELETE TO authenticated
  USING (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]));

DROP POLICY IF EXISTS group_plans_insert_management ON public.group_plans;
DROP POLICY IF EXISTS group_plans_update_management ON public.group_plans;
DROP POLICY IF EXISTS group_plans_delete_admin ON public.group_plans;
CREATE POLICY group_plans_insert_management ON public.group_plans
  FOR INSERT TO authenticated
  WITH CHECK (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]));
CREATE POLICY group_plans_update_management ON public.group_plans
  FOR UPDATE TO authenticated
  USING (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]))
  WITH CHECK (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]));
CREATE POLICY group_plans_delete_admin ON public.group_plans
  FOR DELETE TO authenticated
  USING (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]));

DROP POLICY IF EXISTS group_activities_insert_management ON public.group_activities;
DROP POLICY IF EXISTS group_activities_update_management ON public.group_activities;
DROP POLICY IF EXISTS group_activities_delete_admin ON public.group_activities;
CREATE POLICY group_activities_insert_management ON public.group_activities
  FOR INSERT TO authenticated
  WITH CHECK (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]));
CREATE POLICY group_activities_update_management ON public.group_activities
  FOR UPDATE TO authenticated
  USING (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]))
  WITH CHECK (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]));
CREATE POLICY group_activities_delete_admin ON public.group_activities
  FOR DELETE TO authenticated
  USING (public.cl_user_has_role(group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]));

COMMIT;
