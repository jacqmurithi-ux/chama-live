-- Candidate-only hardening for remaining financial RPC authorization bypasses.
-- Apply to the isolated test project first. Never run against production before
-- source reconciliation and authenticated authorization tests pass.
DO $migration$
DECLARE
  v_def text;
  v_oid regprocedure;
BEGIN
  -- Payment verification is a financial control. Chair/vice-chair and admin
  -- are not permitted to verify; secretary/treasurer retain the verifier role.
  v_oid := 'public.verify_member_payment_evidence(uuid,text,text)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  IF position('ARRAY[''admin'',''chairperson'',''secretary'',''treasurer'']::text[]' in v_def) > 0 THEN
    v_def := replace(v_def,
      'ARRAY[''admin'',''chairperson'',''secretary'',''treasurer'']::text[]',
      'ARRAY[''secretary'',''treasurer'']::text[]');
    EXECUTE v_def;
  ELSIF position('ARRAY[''secretary'',''treasurer'']::text[]' in v_def) = 0 THEN
    RAISE EXCEPTION 'Unexpected verify_member_payment_evidence authorization guard';
  END IF;

  -- Payment reversal must not inherit broad member-management permissions.
  v_oid := 'public.reverse_contribution_initiative_payment(uuid,text,uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  IF position('IF NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION ''Not authorized''; END IF;' in v_def) > 0 THEN
    v_def := replace(v_def,
      'IF NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION ''Not authorized''; END IF;',
      'IF NOT public.cl_user_has_role(v_i.group_id, ARRAY[''treasurer'']::text[]) THEN RAISE EXCEPTION ''Not authorized''; END IF;');
    EXECUTE v_def;
  ELSIF position('cl_user_has_role(v_i.group_id, ARRAY[''treasurer'']::text[])' in v_def) = 0 THEN
    RAISE EXCEPTION 'Unexpected reverse_contribution_initiative_payment authorization guard';
  END IF;

  v_oid := 'public.reverse_recurring_contribution_initiative_payment(uuid,text,uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  IF position('public.can_manage_members(i.group_id)' in v_def) > 0 THEN
    v_def := replace(v_def, 'public.can_manage_members(i.group_id)',
      'public.cl_user_has_role(i.group_id, ARRAY[''treasurer'']::text[])');
    EXECUTE v_def;
  ELSIF position('public.cl_user_has_role(i.group_id, ARRAY[''treasurer'']::text[])' in v_def) = 0 THEN
    RAISE EXCEPTION 'Unexpected reverse_recurring_contribution_initiative_payment authorization guard';
  END IF;

  -- Historical payment recording is limited to secretary/treasurer, not any
  -- role that happens to manage members.
  v_oid := 'public.record_existing_member_historical_payments(uuid,uuid,numeric,date,date,text,jsonb)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  IF position('public.can_manage_members(v_group_id)' in v_def) > 0 THEN
    v_def := replace(v_def, 'public.can_manage_members(v_group_id)',
      'public.cl_user_has_role(v_group_id, ARRAY[''secretary'',''treasurer'']::text[])');
    EXECUTE v_def;
  ELSIF position('public.cl_user_has_role(v_group_id, ARRAY[''secretary'',''treasurer'']::text[])' in v_def) = 0 THEN
    RAISE EXCEPTION 'Unexpected record_existing_member_historical_payments authorization guard';
  END IF;

  -- Group contribution settings affect the financial cycle/rules and are
  -- treasury-only. Replace only recognized old guards; already-hardened
  -- candidate guards are accepted unchanged.
  v_oid := 'public.update_group_contribution_settings(uuid,smallint)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  IF position('IF NOT public.can_manage_members(p_group_id) THEN RAISE EXCEPTION ''Not authorized''; END IF;' in v_def) > 0 THEN
    v_def := replace(v_def,
      'IF NOT public.can_manage_members(p_group_id) THEN RAISE EXCEPTION ''Not authorized''; END IF;',
      'IF NOT public.cl_user_has_role(p_group_id, ARRAY[''treasurer'']::text[]) THEN RAISE EXCEPTION ''Not authorized''; END IF;');
    EXECUTE v_def;
  ELSIF position('cl_user_has_role(p_group_id, ARRAY[''treasurer'']::text[])' in v_def) = 0 THEN
    RAISE EXCEPTION 'Unexpected update_group_contribution_settings authorization guard';
  END IF;

  v_oid := 'public.update_group_contribution_cycle_settings(uuid,smallint,smallint)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  IF position('auth.uid() <> v_owner_user_id and coalesce(v_role,'''') not in (''admin'',''chairperson'')' in v_def) > 0 THEN
    v_def := replace(v_def,
      'auth.uid() <> v_owner_user_id and coalesce(v_role,'''') not in (''admin'',''chairperson'')',
      'NOT public.cl_user_has_role(p_group_id, ARRAY[''treasurer'']::text[])');
    EXECUTE v_def;
  ELSIF position('NOT public.cl_user_has_role(p_group_id, ARRAY[''treasurer'']::text[])' in v_def) = 0 THEN
    RAISE EXCEPTION 'Unexpected update_group_contribution_cycle_settings authorization guard';
  END IF;

  v_oid := 'public.update_group_monthly_contribution_settings(uuid,integer,integer,boolean,numeric)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  IF position('v_actor<>v_owner_user_id and coalesce(v_role,'''') not in (''admin'',''chairperson'')' in v_def) > 0 THEN
    v_def := replace(v_def,
      'v_actor<>v_owner_user_id and coalesce(v_role,'''') not in (''admin'',''chairperson'')',
      'not public.cl_user_has_role(p_group_id, ARRAY[''treasurer'']::text[])');
    EXECUTE v_def;
  ELSIF position('not public.cl_user_has_role(p_group_id, ARRAY[''treasurer'']::text[])' in v_def) = 0 THEN
    RAISE EXCEPTION 'Unexpected update_group_monthly_contribution_settings authorization guard';
  END IF;
END
$migration$;
