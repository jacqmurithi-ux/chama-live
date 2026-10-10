-- Candidate-only reconciliation of fine mutation authorization.
-- Replaces legacy chairperson treasury permissions; keeps secretary access only
-- to manual fine creation. Test on the isolated project before production use.
DO $migration$
DECLARE v_def text; v_oid regprocedure; v_before text;
BEGIN
  v_oid := 'public.cl_fine_adjust(uuid,numeric,text,text)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  v_before := v_def;
  v_def := replace(v_def, 'ARRAY[''chairperson'',''treasurer'']::text[]', 'ARRAY[''treasurer'']::text[]');
  IF v_def <> v_before THEN EXECUTE v_def;
  ELSIF position('ARRAY[''treasurer'']::text[]' in v_def) = 0 THEN RAISE EXCEPTION 'Unexpected cl_fine_adjust guard'; END IF;

  v_oid := 'public.cl_fine_allocate_payment(uuid,uuid,numeric,text)'::regprocedure;
  v_def := pg_get_functiondef(v_oid); v_before := v_def;
  v_def := replace(v_def, 'ARRAY[''chairperson'',''treasurer'']::text[]', 'ARRAY[''treasurer'']::text[]');
  IF v_def <> v_before THEN EXECUTE v_def;
  ELSIF position('ARRAY[''treasurer'']::text[]' in v_def) = 0 THEN RAISE EXCEPTION 'Unexpected cl_fine_allocate_payment guard'; END IF;

  v_oid := 'public.cl_fine_create_rule(uuid,text,text,text,smallint,integer,text,numeric,numeric,numeric,numeric,integer,text,text,timestamp with time zone,timestamp with time zone,uuid[])'::regprocedure;
  v_def := pg_get_functiondef(v_oid); v_before := v_def;
  v_def := replace(v_def, 'ARRAY[''chairperson'',''treasurer'']::text[]', 'ARRAY[''treasurer'']::text[]');
  IF v_def <> v_before THEN EXECUTE v_def;
  ELSIF position('ARRAY[''treasurer'']::text[]' in v_def) = 0 THEN RAISE EXCEPTION 'Unexpected cl_fine_create_rule guard'; END IF;

  v_oid := 'public.cl_fine_generate_contribution(uuid,uuid,uuid,timestamp with time zone)'::regprocedure;
  v_def := pg_get_functiondef(v_oid); v_before := v_def;
  v_def := replace(v_def, 'ARRAY[''chairperson'',''treasurer'']::text[]', 'ARRAY[''treasurer'']::text[]');
  IF v_def <> v_before THEN EXECUTE v_def;
  ELSIF position('ARRAY[''treasurer'']::text[]' in v_def) = 0 THEN RAISE EXCEPTION 'Unexpected cl_fine_generate_contribution guard'; END IF;

  v_oid := 'public.cl_fine_waive(uuid,numeric,text)'::regprocedure;
  v_def := pg_get_functiondef(v_oid); v_before := v_def;
  v_def := replace(v_def, 'ARRAY[''chairperson'',''treasurer'']::text[]', 'ARRAY[''treasurer'']::text[]');
  IF v_def <> v_before THEN EXECUTE v_def;
  ELSIF position('ARRAY[''treasurer'']::text[]' in v_def) = 0 THEN RAISE EXCEPTION 'Unexpected cl_fine_waive guard'; END IF;

  v_oid := 'public.create_manual_member_fine(uuid,uuid,uuid,numeric,text,uuid,timestamp with time zone)'::regprocedure;
  v_def := pg_get_functiondef(v_oid); v_before := v_def;
  v_def := replace(v_def, 'ARRAY[''chairperson'',''treasurer'',''secretary'']::text[]', 'ARRAY[''treasurer'',''secretary'']::text[]');
  IF v_def <> v_before THEN EXECUTE v_def;
  ELSIF position('ARRAY[''treasurer'',''secretary'']::text[]' in v_def) = 0 AND position('ARRAY[''secretary'',''treasurer'']::text[]' in v_def) = 0 THEN
    RAISE EXCEPTION 'Unexpected create_manual_member_fine guard';
  END IF;
END
$migration$;