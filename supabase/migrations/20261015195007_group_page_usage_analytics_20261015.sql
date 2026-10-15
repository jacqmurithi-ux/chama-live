-- CHAMA LIVE: privacy-conscious group page usage analytics.
-- Additive only: no existing group, member, or financial records are modified.
-- Usage events store group + approved page key + timestamp only; no member ID or financial data.

create table if not exists public.group_page_usage_events (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  page_key text not null check (
    page_key = any (array[
      'dashboard',
      'members',
      'contributions',
      'expenses',
      'fines',
      'reports',
      'meetings',
      'documents',
      'group_management',
      'group_settings',
      'loans',
      'merry_go_round',
      'my_account',
      'plans',
      'activities',
      'assets',
      'milestones',
      'data_migration',
      'notifications',
      'group_calendar',
      'other'
    ]::text[])
  ),
  occurred_at timestamptz not null default clock_timestamp()
);

comment on table public.group_page_usage_events is
  'Minimal group-level page usage analytics. Stores group, allowlisted page key, and timestamp; never stores member identity or financial data.';

create index if not exists group_page_usage_events_group_time_idx
  on public.group_page_usage_events (group_id, occurred_at desc);

create index if not exists group_page_usage_events_page_time_idx
  on public.group_page_usage_events (page_key, occurred_at desc);

alter table public.group_page_usage_events enable row level security;

-- The table is intentionally inaccessible directly. Writes and reads go
-- through the guarded SECURITY DEFINER RPCs below.
revoke all on table public.group_page_usage_events from public, anon, authenticated;
revoke all on sequence public.group_page_usage_events_id_seq from public, anon, authenticated;

create or replace function public.record_group_page_view(
  p_group_id uuid,
  p_page_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if p_group_id is null then
    raise exception 'Group context required'
      using errcode = '22023';
  end if;

  if p_page_key is null or p_page_key <> all (array[
    'dashboard',
    'members',
    'contributions',
    'expenses',
    'fines',
    'reports',
    'meetings',
    'documents',
    'group_management',
    'group_settings',
    'loans',
    'merry_go_round',
    'my_account',
    'plans',
    'activities',
    'assets',
    'milestones',
    'data_migration',
    'notifications',
    'group_calendar',
    'other'
  ]::text[]) then
    raise exception 'Unsupported page key'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.members as m
    where m.group_id = p_group_id
      and m.status = 'active'
      and (
        m.user_id = auth.uid()
        or m.auth_user_id = auth.uid()
      )
  ) then
    raise exception 'Active membership in this group is required'
      using errcode = '42501';
  end if;

  insert into public.group_page_usage_events (group_id, page_key)
  values (p_group_id, p_page_key);
end;
$function$;

revoke all on function public.record_group_page_view(uuid, text) from public, anon;
grant execute on function public.record_group_page_view(uuid, text) to authenticated;

create or replace function public.get_platform_page_usage(
  p_days integer default 30
)
returns table (
  group_id uuid,
  group_name text,
  page_key text,
  view_count bigint,
  active_days bigint,
  last_viewed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required'
      using errcode = '42501';
  end if;

  return query
  with page_keys(page_key) as (
    values
      ('dashboard'::text),
      ('members'::text),
      ('contributions'::text),
      ('expenses'::text),
      ('fines'::text),
      ('reports'::text),
      ('meetings'::text),
      ('documents'::text),
      ('group_management'::text),
      ('group_settings'::text),
      ('loans'::text),
      ('merry_go_round'::text),
      ('my_account'::text),
      ('plans'::text),
      ('activities'::text),
      ('assets'::text),
      ('milestones'::text),
      ('data_migration'::text),
      ('notifications'::text),
      ('group_calendar'::text),
      ('other'::text)
  ),
  recent_events as (
    select e.group_id, e.page_key, e.occurred_at
    from public.group_page_usage_events as e
    where e.occurred_at >= now() - make_interval(days => v_days)
  )
  select
    g.id,
    g.name,
    k.page_key,
    count(e.occurred_at)::bigint,
    count(distinct (e.occurred_at at time zone 'UTC')::date)::bigint,
    max(e.occurred_at)
  from public.groups as g
  cross join page_keys as k
  left join recent_events as e
    on e.group_id = g.id
   and e.page_key = k.page_key
  group by g.id, g.name, k.page_key
  order by g.name, k.page_key;
end;
$function$;

revoke all on function public.get_platform_page_usage(integer) from public, anon;
grant execute on function public.get_platform_page_usage(integer) to authenticated;
