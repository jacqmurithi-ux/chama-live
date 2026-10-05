/* =========================================================
   CHAMA LIVE — ADMIN ALL-ROLES AUTHORIZATION
   =========================================================
   An active Admin is authorized anywhere the canonical
   cl_user_has_role() helper is used for group-role checks.
   Group membership and active-account checks remain required.
========================================================= */

create or replace function public.cl_user_has_role(
  p_group_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.members m
    where m.group_id = p_group_id
      and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
      and (
        lower(coalesce(m.role, 'member')) = 'admin'
        or lower(coalesce(m.role, 'member')) = any(p_roles)
      )
  );
$function$;
