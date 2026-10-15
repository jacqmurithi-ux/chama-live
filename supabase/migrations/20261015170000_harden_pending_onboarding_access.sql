BEGIN;

-- Remove direct table-level access to the internal queue.
REVOKE ALL PRIVILEGES
ON TABLE public.pending_onboarding
FROM anon, authenticated;

-- Remove any separate column-level grants as well.
DO $$
DECLARE
  v_column text;
BEGIN
  FOR v_column IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pending_onboarding'
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%I)
       ON TABLE public.pending_onboarding
       FROM anon, authenticated',
      v_column
    );
  END LOOP;
END;
$$;

-- Keep contribution summary available to signed-in clients only.
REVOKE EXECUTE
ON FUNCTION public.get_group_contribution_type_summary(uuid, text)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.get_group_contribution_type_summary(uuid, text)
TO authenticated;

-- Remove anonymous/public execution of the accounting request RPC.
REVOKE EXECUTE
ON FUNCTION public.request_member_accounting_initialization(
  uuid, uuid, numeric, date, date, text
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.request_member_accounting_initialization(
  uuid, uuid, numeric, date, date, text
)
TO authenticated;

COMMIT;
