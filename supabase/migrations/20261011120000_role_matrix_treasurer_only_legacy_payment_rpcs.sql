-- Candidate-only: close legacy SECURITY DEFINER payment RPC bypasses.
-- These RPCs retain their validation, idempotency and canonical ledger writes;
-- only the role guard changes from Secretary/Treasurer to Treasurer alone.
DO $migration$
DECLARE
  v_proc record;
  v_def text;
  v_before text;
BEGIN
  FOR v_proc IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_and_record_automatic_charge_payment',
        'record_charge_payment',
        'record_contribution_initiative_payment',
        'record_other_contribution_payment',
        'record_recurring_contribution_initiative_payment'
      )
  LOOP
    v_def := pg_get_functiondef(v_proc.oid);
    v_before := v_def;
    v_def := replace(
      v_def,
      'ARRAY[''secretary'',''treasurer'']',
      'ARRAY[''treasurer'']'
    );
    v_def := replace(
      v_def,
      'ARRAY[''treasurer'',''secretary'']',
      'ARRAY[''treasurer'']'
    );

    IF v_def = v_before THEN
      RAISE EXCEPTION 'Expected finance-role guard not found in %', v_proc.proname;
    END IF;

    EXECUTE v_def;
  END LOOP;
END
$migration$;
