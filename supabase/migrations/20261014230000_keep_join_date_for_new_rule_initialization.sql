-- Keep the historical join-date correction limited to an existing-rule backfill.
-- New-rule initialization must preserve the member's already recorded join date.
DO $fix$
DECLARE
  d text;
  old text;
  repl text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('public.approve_member_accounting_initialization(uuid)'::regprocedure) INTO d;
  old := $old$    update public.members
    set join_date=v_request.effective_from
    where id=v_request.member_id and group_id=v_request.group_id;
  end if;$old$;
  repl := $new$  end if;$new$;
  IF position(old in d)=0 THEN
    RAISE EXCEPTION 'Expected insert-branch join-date update not found; no changes applied';
  END IF;
  d := replace(d,old,repl);
  EXECUTE d;
END;
$fix$;
