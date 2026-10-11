-- Candidate-only least-privilege grants for group authorization helpers.
-- These helpers require an authenticated identity and are not public APIs.
REVOKE EXECUTE ON FUNCTION public.cl_user_has_role(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cl_user_has_role(uuid, text[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cl_user_in_group(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cl_user_in_group(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.current_user_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_manage_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_members(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_add_group_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_add_group_members(uuid) TO authenticated;

ALTER FUNCTION private.cl_other_payment_request_guard() SET search_path TO '';
