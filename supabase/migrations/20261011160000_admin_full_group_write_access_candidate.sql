-- CHAMA LIVE candidate only: Admin inherits group-management officer permissions.
-- Scope: helper-based group RLS policies and RPC authorization.
-- Does NOT grant direct writes to canonical accounting tables or bypass expense approvals.
-- Apply and verify on candidate only; do not deploy to production until release gates pass.

CREATE OR REPLACE FUNCTION public.cl_user_has_role(
  p_group_id uuid,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH requested AS (
    SELECT coalesce(
      array_agg(
        CASE lower(btrim(r))
          WHEN 'vice chairperson' THEN 'chairperson'
          WHEN 'vice-chairperson' THEN 'chairperson'
          WHEN 'vice_chairperson' THEN 'chairperson'
          WHEN 'vice secretary' THEN 'secretary'
          WHEN 'vice-secretary' THEN 'secretary'
          WHEN 'vice_secretary' THEN 'secretary'
          WHEN 'administrator' THEN 'admin'
          ELSE lower(btrim(r))
        END
      ),
      ARRAY[]::text[]
    ) AS roles
    FROM unnest(coalesce(p_roles, ARRAY[]::text[])) AS input(r)
  ),
  my_group_memberships AS (
    SELECT
      lower(btrim(coalesce(m.actual_position, ''))) AS actual_position,
      lower(btrim(coalesce(m.actual_position_name, ''))) AS actual_position_name,
      lower(btrim(coalesce(m.role, 'member'))) AS technical_role
    FROM public.members m
    WHERE m.group_id = p_group_id
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
      AND lower(coalesce(m.status, 'active')) = 'active'
      AND lower(coalesce(m.onboarding_status, 'active')) = 'active'
  )
  SELECT EXISTS (
    SELECT 1
    FROM my_group_memberships m
    CROSS JOIN requested q
    WHERE
      (
        CASE m.actual_position
          WHEN 'vice_chairperson' THEN 'chairperson'
          WHEN 'vice-chairperson' THEN 'chairperson'
          WHEN 'vice chairperson' THEN 'chairperson'
          WHEN 'vice_secretary' THEN 'secretary'
          WHEN 'vice-secretary' THEN 'secretary'
          WHEN 'vice secretary' THEN 'secretary'
          WHEN 'administrator' THEN 'admin'
          ELSE CASE m.technical_role
            WHEN 'vice chairperson' THEN 'chairperson'
            WHEN 'vice-chairperson' THEN 'chairperson'
            WHEN 'vice_chairperson' THEN 'chairperson'
            WHEN 'vice secretary' THEN 'secretary'
            WHEN 'vice-secretary' THEN 'secretary'
            WHEN 'vice_secretary' THEN 'secretary'
            WHEN 'administrator' THEN 'admin'
            ELSE m.technical_role
          END
        END = ANY(q.roles)
        OR (
          q.roles && ARRAY['admin','chairperson','secretary','treasurer']::text[]
          AND (
            m.actual_position IN ('admin','administrator')
            OR m.actual_position_name IN ('admin','administrator')
            OR m.technical_role IN ('admin','administrator')
          )
        )
      )
  );
$function$;

COMMENT ON FUNCTION public.cl_user_has_role(uuid, text[]) IS
'Candidate role helper: active group Admin inherits group-management role checks (including Treasurer-level checks). This helper does not replace canonical accounting RPCs and does not make Admin eligible for an expense approval slot; submit_expense_approval resolves the three required offices independently.';
