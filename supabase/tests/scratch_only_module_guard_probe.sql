-- SCRATCH PROJECT ONLY. DO NOT APPLY TO PRODUCTION.
-- Prerequisites: restore verified, Phase 0 migration applied to scratch,
-- and synthetic groups/members/authenticated test users created.
-- Call this RPC with a real authenticated synthetic member session.
-- A disabled module must raise SQLSTATE 42501. An enabled module returns allowed=true.
-- This helper is intentionally kept outside supabase/migrations/.

create or replace function public.cl_test_module_guard_probe(
  p_group_id uuid,
  p_module_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  perform public.cl_assert_group_module_enabled(p_group_id, p_module_key);

  return jsonb_build_object(
    'allowed', true,
    'group_id', p_group_id,
    'module_key', p_module_key
  );
end;
$function$;

revoke all on function public.cl_test_module_guard_probe(uuid, text) from public, anon;
grant execute on function public.cl_test_module_guard_probe(uuid, text) to authenticated;

comment on function public.cl_test_module_guard_probe(uuid, text) is
  'SCRATCH-ONLY Phase 0 test probe. Must not be deployed to production.';
