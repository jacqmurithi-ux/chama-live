-- Candidate-only: payment evidence decisions belong to Treasurer alone.
-- Preserve the canonical contribution RPC and all evidence validation.
DO $migration$
DECLARE
  v_oid regprocedure;
  v_def text;
  v_before text;
BEGIN
  v_oid := 'public.verify_member_payment_evidence(uuid,text,text)'::regprocedure;
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
    RAISE EXCEPTION 'Unexpected verify_member_payment_evidence authorization guard';
  END IF;
END
$migration$;
