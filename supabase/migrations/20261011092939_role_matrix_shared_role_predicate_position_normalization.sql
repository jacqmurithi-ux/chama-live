-- Candidate-only: make the shared role predicate honor protected vice-office assignments.
-- Do not broaden cross-group matching; retain the current group and active-member predicates.
CREATE OR REPLACE FUNCTION public.cl_user_has_role(p_group_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH requested AS (
    SELECT coalesce(array_agg(CASE lower(btrim(r))
      WHEN 'vice chairperson' THEN 'chairperson'
      WHEN 'vice-chairperson' THEN 'chairperson'
      WHEN 'vice secretary' THEN 'secretary'
      WHEN 'vice-secretary' THEN 'secretary'
      WHEN 'administrator' THEN 'admin'
      ELSE lower(btrim(r)) END), ARRAY[]::text[]) AS roles
    FROM unnest(coalesce(p_roles, ARRAY[]::text[])) AS input(r)
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.members m
    CROSS JOIN requested q
    WHERE m.group_id = p_group_id
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
      AND lower(coalesce(m.status, 'active')) = 'active'
      AND lower(coalesce(m.onboarding_status, 'active')) = 'active'
      AND (
        CASE lower(btrim(coalesce(m.actual_position, '')))
          WHEN 'vice_chairperson' THEN 'chairperson'
          WHEN 'vice-chairperson' THEN 'chairperson'
          WHEN 'vice chairperson' THEN 'chairperson'
          WHEN 'vice_secretary' THEN 'secretary'
          WHEN 'vice-secretary' THEN 'secretary'
          WHEN 'vice secretary' THEN 'secretary'
          ELSE CASE lower(btrim(coalesce(m.role, 'member')))
            WHEN 'vice chairperson' THEN 'chairperson'
            WHEN 'vice-chairperson' THEN 'chairperson'
            WHEN 'vice secretary' THEN 'secretary'
            WHEN 'vice-secretary' THEN 'secretary'
            WHEN 'administrator' THEN 'admin'
            ELSE lower(btrim(coalesce(m.role, 'member')))
          END
        END
      ) = ANY(q.roles)
  );
$function$;
