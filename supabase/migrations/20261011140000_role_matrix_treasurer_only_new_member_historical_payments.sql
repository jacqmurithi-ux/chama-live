-- Candidate-only: creating a member and posting historical payments are
-- separate authorities even though the legacy RPC combines both workflows.
-- Admin/Chair/Treasurer may create members; historical posting requires Treasurer.
DO $migration$
DECLARE
  v_oid regprocedure;
  v_def text;
  v_before text;
  v_guard text := 'IF NOT public.can_add_group_members(v_group_id) THEN RAISE EXCEPTION ''Member-management authorization required''; END IF;';
  v_replacement text := 'IF NOT public.can_add_group_members(v_group_id) THEN RAISE EXCEPTION ''Member-management authorization required''; END IF;
  IF coalesce((p_historical->>''enabled'')::boolean, false)
     AND NOT public.cl_user_has_role(v_group_id, ARRAY[''treasurer'']::text[]) THEN
    RAISE EXCEPTION ''Historical payment posting is restricted to the group Treasurer'' USING ERRCODE = ''42501'';
  END IF;';
BEGIN
  v_oid := 'public.create_member_with_historical_contributions(jsonb,jsonb,jsonb,uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  v_before := v_def;
  v_def := replace(v_def, v_guard, v_replacement);

  IF v_def <> v_before THEN
    EXECUTE v_def;
  ELSIF position('Historical payment posting is restricted to the group Treasurer' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Unexpected member onboarding authorization guard';
  END IF;
END
$migration$;
