-- Candidate-only Treasurer permissions.
-- Adds a narrowly scoped member-add permission without widening can_manage_members().
-- Apply in an isolated candidate first; do not deploy to production without approval.

CREATE OR REPLACE FUNCTION public.can_add_group_members(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT coalesce(
    public.current_user_role(p_group_id) IN ('admin', 'chairperson', 'treasurer'),
    false
  );
$function$;

REVOKE ALL ON FUNCTION public.can_add_group_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_add_group_members(uuid) TO authenticated;

DO $migration$
DECLARE
  v_def text;
  v_new text;
  v_oid regprocedure;
BEGIN
  -- Extend only add_group_member(); preserve validation and audit behavior.
  v_oid := 'public.add_group_member(uuid,text,text,text,text,text,text,date)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  v_new := replace(
    v_def,
    'v_role NOT IN (''admin'',''chairperson'')',
    'v_role NOT IN (''admin'',''chairperson'',''treasurer'')'
  );
  IF v_new = v_def THEN
    RAISE EXCEPTION 'Expected add_group_member role guard not found';
  END IF;
  v_new := replace(
    v_new,
    'Only a group admin or chairperson can add members',
    'Only a group admin, chairperson, or treasurer can add members'
  );
  EXECUTE v_new;

  -- Keep the existing canonical onboarding/accounting implementation unchanged
  -- except for the dedicated authorization helper.
  FOR v_oid IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_member_with_contribution_plan',
        'create_member_with_historical_contributions'
      )
  LOOP
    v_def := pg_get_functiondef(v_oid);
    v_new := replace(
      v_def,
      'public.can_manage_members(v_group_id)',
      'public.can_add_group_members(v_group_id)'
    );
    IF v_new = v_def THEN
      RAISE EXCEPTION 'Expected member-add guard not found in %', v_oid;
    END IF;
    EXECUTE v_new;
  END LOOP;

  -- Permit Treasurer read access to cumulative positions for the same group.
  v_oid := 'public.get_member_contribution_position(uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  v_new := replace(
    v_def,
    'public.can_manage_members(m.group_id)',
    'public.can_add_group_members(m.group_id)'
  );
  IF v_new = v_def THEN
    RAISE EXCEPTION 'Expected cumulative-position guard not found';
  END IF;
  EXECUTE v_new;
END
$migration$;

-- Preserve the existing row constraints and onboarding statuses.
DROP POLICY IF EXISTS members_insert_admin_chairperson ON public.members;
CREATE POLICY members_insert_admin_chairperson
ON public.members
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_add_group_members(group_id)
  AND onboarding_status IN ('pending', 'active')
  AND role IN ('chairperson', 'admin', 'treasurer', 'secretary', 'member')
  AND group_id IS NOT NULL
);
