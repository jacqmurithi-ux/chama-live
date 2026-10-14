-- Include the stored historical payment method in the group-scoped approval queue.
DO $fix$
DECLARE d text; old text; repl text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.list_member_accounting_initialization_requests(uuid)'::regprocedure) INTO d;
  old := $old$        'paid_through', r.paid_through
      )$old$;
  repl := $new$        'paid_through', r.paid_through,
        'payment_method', r.payment_method
      )$new$;
  IF position(old in d)=0 THEN RAISE EXCEPTION 'Queue response payload did not match expected source'; END IF;
  d := replace(d,old,repl);
  EXECUTE d;
END;
$fix$;
