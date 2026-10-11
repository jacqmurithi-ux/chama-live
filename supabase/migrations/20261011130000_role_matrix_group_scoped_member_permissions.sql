-- Candidate-only: group-scoped member authorization and privacy.
-- Group Admin is not a platform-wide admin. Ordinary members may read
-- their own member row only; management roles can read the group directory.
-- Treasurer joins admin/chair in the explicitly authorized member-management
-- permissions. Secretary/Vice Secretary remain view/search/filter only.

CREATE OR REPLACE FUNCTION public.current_user_role(p_group_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE lower(btrim(coalesce(m.role, 'member')))
    WHEN 'vice chairperson' THEN 'chairperson'
    WHEN 'vice-chairperson' THEN 'chairperson'
    WHEN 'vice secretary' THEN 'secretary'
    WHEN 'vice-secretary' THEN 'secretary'
    WHEN 'administrator' THEN 'admin'
    ELSE lower(btrim(coalesce(m.role, 'member')))
  END
  FROM public.members m
  WHERE m.group_id = p_group_id
    AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
    AND lower(coalesce(m.status, 'active')) = 'active'
    AND lower(coalesce(m.onboarding_status, 'active')) = 'active'
  ORDER BY m.id
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_members(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.cl_user_has_role(
    p_group_id,
    ARRAY['admin','chairperson','treasurer']::text[]
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_add_group_members(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT coalesce(
    public.current_user_role(p_group_id) IN ('admin', 'chairperson', 'treasurer'),
    false
  );
$function$;

DROP POLICY IF EXISTS members_select_own_or_group ON public.members;
CREATE POLICY members_select_own_or_group
ON public.members
FOR SELECT
TO authenticated
USING (
  auth_user_id = auth.uid()
  OR user_id = auth.uid()
  OR public.cl_user_has_role(
    group_id,
    ARRAY['admin','chairperson','secretary','treasurer']::text[]
  )
);

DROP POLICY IF EXISTS members_delete_admin_chairperson ON public.members;
CREATE POLICY members_delete_admin_chairperson
ON public.members
FOR DELETE
TO authenticated
USING (
  public.cl_user_has_role(
    group_id,
    ARRAY['admin','chairperson','treasurer']::text[]
  )
  AND auth_user_id IS DISTINCT FROM auth.uid()
  AND user_id IS DISTINCT FROM auth.uid()
);
