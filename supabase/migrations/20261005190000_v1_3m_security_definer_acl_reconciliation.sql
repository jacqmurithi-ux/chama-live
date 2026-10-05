BEGIN;

-- These functions are trigger entry points, not public RPC APIs.
-- Keep execution for the owning postgres role and service_role,
-- while removing direct execution by PUBLIC, anon, and authenticated.
REVOKE EXECUTE ON FUNCTION public.cl_guard_open_financial_period() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cl_guard_contribution_allocation() FROM PUBLIC, anon, authenticated;

COMMIT;
