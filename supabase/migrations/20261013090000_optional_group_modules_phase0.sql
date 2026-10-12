-- CHAMA LIVE Phase 0: optional module settings and enforcement helpers.
-- Additive only. Existing groups resolve to OFF until an administrator enables a module.
-- Do not apply to production until the agreed database backup is confirmed.

create table if not exists public.group_module_settings (
  group_id uuid primary key references public.groups(id) on delete cascade,
  merry_go_round_enabled boolean not null default false,
  loans_enabled boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_module_audit_log (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  module_key text not null check (module_key in ('module_settings','merry_go_round','loans')),
  action_key text not null,
  entity_table text,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists group_module_audit_log_group_created_idx
  on public.group_module_audit_log (group_id, created_at desc);

create index if not exists group_module_audit_log_module_created_idx
  on public.group_module_audit_log (group_id, module_key, created_at desc);

alter table public.group_module_settings enable row level security;
alter table public.group_module_audit_log enable row level security;

drop policy if exists group_module_settings_select_member on public.group_module_settings;
create policy group_module_settings_select_member
  on public.group_module_settings
  for select to authenticated
  using (
    exists (
      select 1
      from public.members m
      where m.group_id = group_module_settings.group_id
        and (m.user_id = (select auth.uid()) or m.auth_user_id = (select auth.uid()))
        and lower(coalesce(m.status, 'active')) = 'active'
        and lower(coalesce(m.onboarding_status, 'active')) = 'active'
    )
  );

drop policy if exists group_module_audit_select_admin on public.group_module_audit_log;
create policy group_module_audit_select_admin
  on public.group_module_audit_log
  for select to authenticated
  using (public.cl_user_has_role(group_id, array['admin']::text[]));

revoke all on public.group_module_settings from anon, authenticated;
grant select on public.group_module_settings to authenticated;
revoke all on public.group_module_audit_log from anon, authenticated;
grant select on public.group_module_audit_log to authenticated;
revoke all on sequence public.group_module_audit_log_id_seq from anon, authenticated;

create or replace function public.cl_log_group_module_settings_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.group_module_audit_log (
    group_id, actor_user_id, module_key, action_key, entity_table, entity_id,
    before_data, after_data, metadata
  ) values (
    coalesce(new.group_id, old.group_id),
    auth.uid(),
    'module_settings',
    case when tg_op = 'INSERT' then 'module_settings_created' else 'module_settings_updated' end,
    'group_module_settings',
    coalesce(new.group_id, old.group_id)::text,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new),
    jsonb_build_object('source', 'group-management')
  );
  return new;
end;
$function$;

drop trigger if exists trg_group_module_settings_audit on public.group_module_settings;
create trigger trg_group_module_settings_audit
after insert or update on public.group_module_settings
for each row execute function public.cl_log_group_module_settings_change();

create or replace function public.get_group_module_settings(p_group_id uuid)
returns table (
  group_id uuid,
  merry_go_round_enabled boolean,
  loans_enabled boolean,
  can_manage boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.members m
    where m.group_id = p_group_id
      and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  ) then
    raise exception 'Not authorized for this group' using errcode = '42501';
  end if;

  return query
  select p_group_id,
         coalesce(s.merry_go_round_enabled, false),
         coalesce(s.loans_enabled, false),
         public.cl_user_has_role(p_group_id, array['admin']::text[])
  from (select 1) seed
  left join public.group_module_settings s on s.group_id = p_group_id;
end;
$function$;

create or replace function public.update_group_module_settings(
  p_group_id uuid,
  p_merry_go_round_enabled boolean,
  p_loans_enabled boolean
)
returns table (
  group_id uuid,
  merry_go_round_enabled boolean,
  loans_enabled boolean,
  can_manage boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.group_module_settings%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not public.cl_user_has_role(p_group_id, array['admin']::text[]) then
    raise exception 'Only a group admin can change optional module settings' using errcode = '42501';
  end if;

  insert into public.group_module_settings (
    group_id, merry_go_round_enabled, loans_enabled, created_by, updated_by
  ) values (
    p_group_id, coalesce(p_merry_go_round_enabled, false),
    coalesce(p_loans_enabled, false), auth.uid(), auth.uid()
  )
  on conflict (group_id) do update set
    merry_go_round_enabled = excluded.merry_go_round_enabled,
    loans_enabled = excluded.loans_enabled,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into v_row;

  return query select v_row.group_id, v_row.merry_go_round_enabled,
                      v_row.loans_enabled, true;
end;
$function$;

create or replace function public.cl_assert_group_module_enabled(
  p_group_id uuid,
  p_module_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_enabled boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.members m
    where m.group_id = p_group_id
      and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  ) then
    raise exception 'Not authorized for this group' using errcode = '42501';
  end if;

  if p_module_key = 'merry_go_round' then
    select coalesce(s.merry_go_round_enabled, false) into v_enabled
    from (select 1) seed
    left join public.group_module_settings s on s.group_id = p_group_id;
  elsif p_module_key = 'loans' then
    select coalesce(s.loans_enabled, false) into v_enabled
    from (select 1) seed
    left join public.group_module_settings s on s.group_id = p_group_id;
  else
    raise exception 'Unknown optional module' using errcode = '22023';
  end if;

  if not coalesce(v_enabled, false) then
    raise exception 'This module is disabled for the group' using errcode = '42501';
  end if;

  return true;
end;
$function$;

revoke all on function public.cl_log_group_module_settings_change() from public, anon, authenticated;
revoke all on function public.get_group_module_settings(uuid) from public, anon;
revoke all on function public.update_group_module_settings(uuid, boolean, boolean) from public, anon;
revoke all on function public.cl_assert_group_module_enabled(uuid, text) from public, anon;
grant execute on function public.get_group_module_settings(uuid) to authenticated;
grant execute on function public.update_group_module_settings(uuid, boolean, boolean) to authenticated;
grant execute on function public.cl_assert_group_module_enabled(uuid, text) to authenticated;

comment on table public.group_module_settings is
  'Per-group optional module toggles. Missing rows mean both modules are disabled.';
comment on table public.group_module_audit_log is
  'Append-only audit trail for optional module settings and future module actions.';
