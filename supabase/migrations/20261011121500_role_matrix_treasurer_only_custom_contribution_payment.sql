-- Candidate-only: custom contribution payment recording is Treasury-only.
DO $migration$
DECLARE
  v_oid regprocedure;
  v_def text;
  v_before text;
BEGIN
  v_oid := 'public.record_custom_contribution_payment(uuid,uuid,uuid,numeric,date,text,text,text,uuid)'::regprocedure;
  v_def := pg_get_functiondef(v_oid);
  v_before := v_def;
  v_def := replace(
    v_def,
    'array[''secretary'',''treasurer'']::text[]',
    'array[''treasurer'']::text[]'
  );

  IF v_def <> v_before THEN
    EXECUTE v_def;
  ELSIF position('array[''treasurer'']::text[]' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Unexpected custom contribution payment authorization guard';
  END IF;
END
$migration$;
