-- CHAMA LIVE: restrict financial initiative mutation RPCs to treasurer role.
-- This is a candidate migration; authenticated role tests remain a release gate.
DO $role_guard$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  v_signature text;
  v_old text;
  v_count integer;
BEGIN
  v_signature := 'public.activate_contribution_initiative(uuid,uuid)';
  v_oid := to_regprocedure(v_signature);
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Missing signature %',v_signature; END IF;
  v_def := pg_get_functiondef(v_oid);
  v_old := 'IF NOT FOUND OR NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION ''Not authorized''; END IF;';
  v_new := 'IF NOT FOUND OR NOT public.cl_user_has_role(v_i.group_id, ARRAY[''treasurer'']::text[]) THEN RAISE EXCEPTION ''Not authorized'' USING ERRCODE=''42501''; END IF;';
  IF position(v_old in v_def)=0 THEN RAISE EXCEPTION 'Expected guard not found: %',v_signature; END IF;
  EXECUTE replace(v_def,v_old,v_new);

  v_signature := 'public.activate_recurring_contribution_initiative(uuid,uuid)';
  v_oid := to_regprocedure(v_signature);
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Missing signature %',v_signature; END IF;
  v_def := pg_get_functiondef(v_oid);
  v_old := 'IF NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION ''Not authorized''; END IF;';
  v_new := 'IF NOT public.cl_user_has_role(v_i.group_id, ARRAY[''treasurer'']::text[]) THEN RAISE EXCEPTION ''Not authorized'' USING ERRCODE=''42501''; END IF;';
  IF position(v_old in v_def)=0 THEN RAISE EXCEPTION 'Expected guard not found: %',v_signature; END IF;
  EXECUTE replace(v_def,v_old,v_new);

  v_signature := 'public.close_contribution_initiative(uuid,uuid)';
  v_oid := to_regprocedure(v_signature);
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Missing signature %',v_signature; END IF;
  v_def := pg_get_functiondef(v_oid);
  v_old := 'IF NOT FOUND OR NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION ''Not authorized''; END IF;';
  v_new := 'IF NOT FOUND OR NOT public.cl_user_has_role(v_i.group_id, ARRAY[''treasurer'']::text[]) THEN RAISE EXCEPTION ''Not authorized'' USING ERRCODE=''42501''; END IF;';
  IF position(v_old in v_def)=0 THEN RAISE EXCEPTION 'Expected guard not found: %',v_signature; END IF;
  EXECUTE replace(v_def,v_old,v_new);

  v_signature := 'public.create_contribution_initiative(uuid,text,text,uuid,date,date,numeric,text,uuid)';
  v_oid := to_regprocedure(v_signature);
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Missing signature %',v_signature; END IF;
  v_def := pg_get_functiondef(v_oid);
  v_old := 'IF NOT public.can_manage_members(p_group_id) THEN RAISE EXCEPTION ''Not authorized''; END IF;';
  v_new := 'IF NOT public.cl_user_has_role(p_group_id, ARRAY[''treasurer'']::text[]) THEN RAISE EXCEPTION ''Not authorized'' USING ERRCODE=''42501''; END IF;';
  IF position(v_old in v_def)=0 THEN RAISE EXCEPTION 'Expected guard not found: %',v_signature; END IF;
  EXECUTE replace(v_def,v_old,v_new);

  v_signature := 'private.cl_other_cycle_authorize(uuid)';
  v_oid := to_regprocedure(v_signature);
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Missing signature %',v_signature; END IF;
  v_def := pg_get_functiondef(v_oid);
  v_old := 'AND (EXISTS (SELECT 1 FROM public.groups g
                 WHERE g.id=p_group_id AND g.owner_user_id=v_actor)
         OR lower(coalesce(m.actual_position,'''')) IN (''chairperson'',''treasurer''))';
  v_new := 'AND public.cl_user_has_role(p_group_id, ARRAY[''treasurer'']::text[])';
  IF position(v_old in v_def)=0 THEN RAISE EXCEPTION 'Expected owner/chair bypass not found: %',v_signature; END IF;
  v_def := replace(v_def,v_old,v_new);
  v_def := replace(v_def,
    'Other cycle authorization requires owner, chairperson, or treasurer',
    'Other cycle authorization requires treasurer role');
  EXECUTE v_def;
END;
$role_guard$;
