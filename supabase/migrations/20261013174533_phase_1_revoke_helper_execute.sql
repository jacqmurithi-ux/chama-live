-- Internal authorization helper is called by SECURITY DEFINER RPCs; do not expose it directly to clients.
revoke all on function public.cl_merry_authorize(uuid,boolean) from public,anon,authenticated;
