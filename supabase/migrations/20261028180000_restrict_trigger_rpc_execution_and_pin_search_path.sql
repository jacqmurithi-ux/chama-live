-- Restrict trigger-only functions from direct PostgREST RPC execution.
-- PostgreSQL trigger execution does not require callers to have EXECUTE on the
-- trigger function; these functions are invoked by their attached table triggers.
REVOKE EXECUTE ON FUNCTION public.enforce_member_position_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_deleted_row() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_contribution_recorded_by() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_closed_month_contribution() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_closed_month_expense() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_expense_recorded_by() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_recorded_by_from_auth() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_initiative_payment_allocation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_monthly_payment_domain() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_recorded_by() FROM PUBLIC, anon, authenticated;

-- This guard uses only NEW/OLD fields; pin its path to prevent object shadowing.
ALTER FUNCTION private.cl_other_payment_request_guard() SET search_path = '';
