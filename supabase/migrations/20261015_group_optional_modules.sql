-- CHAMA LIVE optional group modules (additive; preserves Loans and Merry-go-round).
alter table public.groups
  add column if not exists modules jsonb not null
  default '{"plans": false, "assets": false, "milestones": false, "migration": false}'::jsonb;

update public.groups
set modules = coalesce(modules, '{}'::jsonb)
  || jsonb_build_object(
    'plans', coalesce((modules ->> 'plans')::boolean, false),
    'assets', coalesce((modules ->> 'assets')::boolean, false),
    'milestones', coalesce((modules ->> 'milestones')::boolean, false),
    'migration', coalesce((modules ->> 'migration')::boolean, false)
  );

create or replace function public.get_group_optional_modules(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_modules jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.members m
    where m.group_id = p_group_id
      and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  ) then
    raise exception 'You are not an active member of this group' using errcode = '42501';
  end if;

  select coalesce(g.modules, '{}'::jsonb)
    into v_modules
  from public.groups g
  where g.id = p_group_id;

  if not found then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'plans', coalesce((v_modules ->> 'plans')::boolean, false),
    'assets', coalesce((v_modules ->> 'assets')::boolean, false),
    'milestones', coalesce((v_modules ->> 'milestones')::boolean, false),
    'migration', coalesce((v_modules ->> 'migration')::boolean, false)
  );
end;
$function$;

create or replace function public.update_group_optional_modules(
  p_group_id uuid,
  p_modules jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor_member_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not public.cl_user_has_role(p_group_id, array['admin']::text[]) then
    raise exception 'Only a group Admin can change optional module settings' using errcode = '42501';
  end if;

  if jsonb_typeof(p_modules) <> 'object'
     or jsonb_typeof(p_modules -> 'plans') <> 'boolean'
     or jsonb_typeof(p_modules -> 'assets') <> 'boolean'
     or jsonb_typeof(p_modules -> 'milestones') <> 'boolean'
     or jsonb_typeof(p_modules -> 'migration') <> 'boolean' then
    raise exception 'All four module flags must be boolean values' using errcode = '22023';
  end if;

  select m.id into v_actor_member_id
  from public.members m
  where m.group_id = p_group_id
    and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
    and lower(coalesce(m.status, 'active')) = 'active'
    and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  order by m.created_at
  limit 1;

  select coalesce(g.modules, '{}'::jsonb) into v_old
  from public.groups g
  where g.id = p_group_id
  for update;

  if not found then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;

  v_new := jsonb_build_object(
    'plans', (p_modules ->> 'plans')::boolean,
    'assets', (p_modules ->> 'assets')::boolean,
    'milestones', (p_modules ->> 'milestones')::boolean,
    'migration', (p_modules ->> 'migration')::boolean
  );

  update public.groups g
  set modules = v_new
  where g.id = p_group_id;

  insert into public.group_audit_log (
    group_id, actor_user_id, actor_member_id, action, entity_type, entity_id, details
  ) values (
    p_group_id, auth.uid(), v_actor_member_id, 'update_optional_modules',
    'group_modules', p_group_id::text,
    jsonb_build_object('before', v_old, 'after', v_new)
  );

  return v_new;
end;
$function$;

create or replace function public.cl_group_module_enabled(p_group_id uuid, p_module text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_enabled boolean;
  v_module text := lower(btrim(coalesce(p_module, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.members m
    where m.group_id = p_group_id
      and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  ) then
    raise exception 'You are not an active member of this group' using errcode = '42501';
  end if;

  if v_module = 'merry_go_round' then
    select g.merry_go_round_enabled into v_enabled from public.groups g where g.id = p_group_id;
  elsif v_module = 'loans' then
    select g.loans_enabled into v_enabled from public.groups g where g.id = p_group_id;
  elsif v_module in ('plans', 'assets', 'milestones', 'migration') then
    select coalesce((g.modules ->> v_module)::boolean, false)
      into v_enabled from public.groups g where g.id = p_group_id;
  else
    raise exception 'Unknown optional module' using errcode = '22023';
  end if;

  if v_enabled is null then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;

  return v_enabled;
end;
$function$;

-- Module-specific RLS: existing role requirements remain intact, and disabled modules
-- cannot be read or written directly through the Data API.
drop policy if exists group_assets_select_group on public.group_assets;
create policy group_assets_select_group on public.group_assets
  for select to authenticated
  using (public.cl_user_in_group(group_id) and public.cl_group_module_enabled(group_id, 'assets'));

drop policy if exists group_assets_insert_management on public.group_assets;
create policy group_assets_insert_management on public.group_assets
  for insert to authenticated
  with check (
    public.cl_group_module_enabled(group_id, 'assets')
    and public.cl_user_has_role(group_id, array['admin','chairperson','treasurer']::text[])
  );

drop policy if exists group_assets_update_management on public.group_assets;
create policy group_assets_update_management on public.group_assets
  for update to authenticated
  using (
    public.cl_group_module_enabled(group_id, 'assets')
    and public.cl_user_has_role(group_id, array['admin','chairperson','treasurer']::text[])
  )
  with check (
    public.cl_group_module_enabled(group_id, 'assets')
    and public.cl_user_has_role(group_id, array['admin','chairperson','treasurer']::text[])
  );

drop policy if exists group_assets_delete_admin on public.group_assets;
create policy group_assets_delete_admin on public.group_assets
  for delete to authenticated
  using (
    public.cl_group_module_enabled(group_id, 'assets')
    and public.cl_user_has_role(group_id, array['admin']::text[])
  );

drop policy if exists group_plans_select_group on public.group_plans;
create policy group_plans_select_group on public.group_plans
  for select to authenticated
  using (public.cl_user_in_group(group_id) and public.cl_group_module_enabled(group_id, 'plans'));

drop policy if exists group_plans_insert_management on public.group_plans;
create policy group_plans_insert_management on public.group_plans
  for insert to authenticated
  with check (
    public.cl_group_module_enabled(group_id, 'plans')
    and public.cl_user_has_role(group_id, array['admin','chairperson','secretary']::text[])
  );

drop policy if exists group_plans_update_management on public.group_plans;
create policy group_plans_update_management on public.group_plans
  for update to authenticated
  using (
    public.cl_group_module_enabled(group_id, 'plans')
    and public.cl_user_has_role(group_id, array['admin','chairperson','secretary']::text[])
  )
  with check (
    public.cl_group_module_enabled(group_id, 'plans')
    and public.cl_user_has_role(group_id, array['admin','chairperson','secretary']::text[])
  );

drop policy if exists group_plans_delete_admin on public.group_plans;
create policy group_plans_delete_admin on public.group_plans
  for delete to authenticated
  using (
    public.cl_group_module_enabled(group_id, 'plans')
    and public.cl_user_has_role(group_id, array['admin']::text[])
  );

drop policy if exists group_milestones_select_group on public.group_milestones;
create policy group_milestones_select_group on public.group_milestones
  for select to authenticated
  using (public.cl_user_in_group(group_id) and public.cl_group_module_enabled(group_id, 'milestones'));

drop policy if exists group_milestones_insert_management on public.group_milestones;
create policy group_milestones_insert_management on public.group_milestones
  for insert to authenticated
  with check (
    public.cl_group_module_enabled(group_id, 'milestones')
    and public.cl_user_has_role(group_id, array['admin','chairperson','secretary']::text[])
  );

drop policy if exists group_milestones_update_management on public.group_milestones;
create policy group_milestones_update_management on public.group_milestones
  for update to authenticated
  using (
    public.cl_group_module_enabled(group_id, 'milestones')
    and public.cl_user_has_role(group_id, array['admin','chairperson','secretary']::text[])
  )
  with check (
    public.cl_group_module_enabled(group_id, 'milestones')
    and public.cl_user_has_role(group_id, array['admin','chairperson','secretary']::text[])
  );

drop policy if exists group_milestones_delete_admin on public.group_milestones;
create policy group_milestones_delete_admin on public.group_milestones
  for delete to authenticated
  using (
    public.cl_group_module_enabled(group_id, 'milestones')
    and public.cl_user_has_role(group_id, array['admin']::text[])
  );

revoke all on function public.get_group_optional_modules(uuid) from public, anon;
grant execute on function public.get_group_optional_modules(uuid) to authenticated;
revoke all on function public.update_group_optional_modules(uuid, jsonb) from public, anon;
grant execute on function public.update_group_optional_modules(uuid, jsonb) to authenticated;
