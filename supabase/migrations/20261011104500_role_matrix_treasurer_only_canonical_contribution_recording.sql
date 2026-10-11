-- Candidate-only: canonical contribution recording is Treasury-authorized.
-- The 10-argument overload delegates to the 11-argument canonical RPC,
-- so hardening the canonical overload protects both signatures.
DO $migration$
DECLARE
  v_oid regprocedure;
  v_def text;
  v_before text;
BEGIN
  v_oid := 'public.cl_2b_record_contribution(uuid,uuid,uuid,numeric,date,text,text,text,uuid,text)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  v_before := v_def;
  v_def := replace(
    v_def,
    'ARRAY[''secretary'',''treasurer'']::text[]',
    'ARRAY[''treasurer'']::text[]'
  );

  IF v_def <> v_before THEN
    EXECUTE v_def;
  ELSIF position('ARRAY[''treasurer'']::text[]' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Unexpected canonical contribution authorization guard';
  END IF;
END
$migration$;
