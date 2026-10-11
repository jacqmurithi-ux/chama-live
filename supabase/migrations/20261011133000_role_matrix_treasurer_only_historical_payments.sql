-- Candidate-only: historical member payment posting is Treasury-only.
DO $migration$
DECLARE
  v_oid regprocedure;
  v_def text;
  v_before text;
BEGIN
  v_oid := 'public.record_existing_member_historical_payments(uuid,uuid,numeric,date,date,text,jsonb)'::regprocedure;
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
    RAISE EXCEPTION 'Unexpected historical payment authorization guard';
  END IF;
END
$migration$;
