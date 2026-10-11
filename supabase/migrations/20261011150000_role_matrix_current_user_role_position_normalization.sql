-- Candidate-only: normalize elected office from the protected position history projection.
-- Keeps authorization group-scoped and preserves the existing current_user_role(uuid) contract.
CREATE OR REPLACE FUNCTION public.current_user_role(p_group_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE lower(btrim(coalesce(m.actual_position, '')))
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
  FROM public.members m
  WHERE m.group_id = p_group_id
    AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
    AND lower(coalesce(m.status, 'active')) = 'active'
    AND lower(coalesce(m.onboarding_status, 'active')) = 'active'
  ORDER BY m.id
  LIMIT 1;
$function$;
