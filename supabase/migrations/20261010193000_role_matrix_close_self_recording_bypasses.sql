-- CHAMA LIVE role matrix follow-up: remove self-member payment-recording bypasses.
-- Candidate branch only. Authenticated role tests are still required before release.
-- This preserves the accounting transaction bodies and tightens only authorization.

DO $close_self_recording_bypasses$
DECLARE
  v_oid oid;
  v_definition text;
  v_updated text;
  v_signature text;
  v_old text;
  v_new text;
BEGIN
  v_signature := 'public.record_contribution_initiative_payment(uuid,uuid,numeric,date,text,text,text,text,uuid)';
  v_oid := to_regprocedure(v_signature);
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Required RPC not found: %', v_signature; END IF;
  v_definition := pg_get_functiondef(v_oid);
  v_old := 'IF NOT (public.cl_user_has_role(v_member_group, ARRAY[''secretary'',''treasurer'']::text[]) OR v_member_user=auth.uid() OR v_member_auth=auth.uid()) THEN';
  v_new := 'IF NOT public.cl_user_has_role(v_member_group, ARRAY[''secretary'',''treasurer'']::text[]) THEN';
  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected self-member bypass not found in %', v_signature;
  END IF;
  v_updated := replace(v_definition, v_old, v_new);
  IF v_updated = v_definition THEN RAISE EXCEPTION 'No authorization change made to %', v_signature; END IF;
  EXECUTE v_updated;

  v_signature := 'public.record_recurring_contribution_initiative_payment(uuid,uuid,numeric,date,text,text,text,text,uuid)';
  v_oid := to_regprocedure(v_signature);
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Required RPC not found: %', v_signature; END IF;
  v_definition := pg_get_functiondef(v_oid);
  v_old := 'AND (m.user_id=auth.uid() OR m.auth_user_id=auth.uid() OR public.cl_user_has_role(v_i.group_id, ARRAY[''secretary'',''treasurer'']::text[]))';
  v_new := 'AND public.cl_user_has_role(v_i.group_id, ARRAY[''secretary'',''treasurer'']::text[])';
  IF position(v_old in v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected self-member bypass not found in %', v_signature;
  END IF;
  v_updated := replace(v_definition, v_old, v_new);
  IF v_updated = v_definition THEN RAISE EXCEPTION 'No authorization change made to %', v_signature; END IF;
  EXECUTE v_updated;
END;
$close_self_recording_bypasses$;
