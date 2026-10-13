-- CHAMA LIVE Phase 0: per-group optional modules and action audit.
-- Applied directly to production Supabase project ptktftwyltxmtcodyzoa.
-- Feature tables and module RPCs remain additive; existing accounting tables are untouched.

alter table public.groups
  add column if not exists merry_go_round_enabled boolean not null default false,
  add column if not exists loans_enabled boolean not null default false;

create table if not exists public.group_audit_log (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  actor_user_id uuid not null,
  actor_member_id uuid references public.members(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists group_audit_log_group_created_idx
  on public.group_audit_log (group_id, created_at desc);
alter table public.group_audit_log enable row level security;
drop policy if exists group_audit_log_official_read on public.group_audit_log;
create policy group_audit_log_official_read on public.group_audit_log
  for select to authenticated
  using (public.cl_user_has_role(group_id, array['admin','chairperson','treasurer','secretary']::text[]));
revoke insert, update, delete on public.group_audit_log from anon, authenticated;
grant select on public.group_audit_log to authenticated;

create or replace function public.get_group_module_settings(p_group_id uuid)
returns table (group_id uuid, merry_go_round_enabled boolean, loans_enabled boolean)
language plpgsql stable security definer set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.members m
    where m.group_id = p_group_id and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  ) then raise exception 'You are not an active member of this group' using errcode = '42501'; end if;
  return query select g.id, g.merry_go_round_enabled, g.loans_enabled from public.groups g where g.id = p_group_id;
end;
$function$;

create or replace function public.update_group_module_settings(
  p_group_id uuid, p_merry_go_round_enabled boolean, p_loans_enabled boolean
)
returns table (group_id uuid, merry_go_round_enabled boolean, loans_enabled boolean)
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_actor_member_id uuid; v_old_merry boolean; v_old_loans boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.cl_user_has_role(p_group_id, array['admin']::text[]) then
    raise exception 'Only a group Admin can change optional module settings' using errcode = '42501';
  end if;
  select m.id into v_actor_member_id from public.members m
  where m.group_id = p_group_id and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
    and lower(coalesce(m.status, 'active')) = 'active'
    and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  order by m.created_at limit 1;
  select g.merry_go_round_enabled, g.loans_enabled into v_old_merry, v_old_loans
  from public.groups g where g.id = p_group_id for update;
  if not found then raise exception 'Group not found' using errcode = 'P0002'; end if;
  update public.groups g set
    merry_go_round_enabled = coalesce(p_merry_go_round_enabled, false),
    loans_enabled = coalesce(p_loans_enabled, false)
  where g.id = p_group_id;
  insert into public.group_audit_log (
    group_id, actor_user_id, actor_member_id, action, entity_type, entity_id, details
  ) values (
    p_group_id, auth.uid(), v_actor_member_id, 'update_module_settings',
    'group_module_settings', p_group_id::text,
    jsonb_build_object(
      'before', jsonb_build_object('merry_go_round_enabled', v_old_merry, 'loans_enabled', v_old_loans),
      'after', jsonb_build_object(
        'merry_go_round_enabled', coalesce(p_merry_go_round_enabled, false),
        'loans_enabled', coalesce(p_loans_enabled, false)
      )
    )
  );
  return query select g.id, g.merry_go_round_enabled, g.loans_enabled from public.groups g where g.id = p_group_id;
end;
$function$;

create or replace function public.cl_group_module_enabled(p_group_id uuid, p_module text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp
as $function$
declare v_enabled boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.members m
    where m.group_id = p_group_id and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  ) then raise exception 'You are not an active member of this group' using errcode = '42501'; end if;
  if lower(btrim(coalesce(p_module, ''))) = 'merry_go_round' then
    select g.merry_go_round_enabled into v_enabled from public.groups g where g.id = p_group_id;
  elsif lower(btrim(coalesce(p_module, ''))) = 'loans' then
    select g.loans_enabled into v_enabled from public.groups g where g.id = p_group_id;
  else raise exception 'Unknown optional module' using errcode = '22023'; end if;
  if v_enabled is null then raise exception 'Group not found' using errcode = 'P0002'; end if;
  return v_enabled;
end;
$function$;

revoke all on function public.get_group_module_settings(uuid) from public, anon;
revoke all on function public.update_group_module_settings(uuid, boolean, boolean) from public, anon;
revoke all on function public.cl_group_module_enabled(uuid, text) from public, anon;
grant execute on function public.get_group_module_settings(uuid) to authenticated;
grant execute on function public.update_group_module_settings(uuid, boolean, boolean) to authenticated;
grant execute on function public.cl_group_module_enabled(uuid, text) to authenticated;
