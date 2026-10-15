-- Ensure active custom contribution periods have one canonical obligation per active member.
-- Additive and idempotent: existing obligations and allocations are preserved.
create or replace function public.ensure_custom_contribution_member_obligations(
  p_group_id uuid,
  p_period_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_actor_member_id uuid;
  v_period public.contribution_periods%rowtype;
  v_role text;
  v_rules_created integer := 0;
  v_obligations_created integer := 0;
begin
  if v_auth_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_group_id is null or p_period_id is null or p_request_id is null then
    raise exception 'GROUP_PERIOD_AND_REQUEST_ID_REQUIRED' using errcode = '22023';
  end if;

  v_role := public.current_user_role(p_group_id);
  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.owner_user_id = v_auth_user_id
  ) and coalesce(v_role, '') not in ('admin','chairperson','treasurer','secretary') then
    raise exception 'CUSTOM_CONTRIBUTION_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select m.id into v_actor_member_id
  from public.members m
  where m.group_id = p_group_id
    and (m.user_id = v_auth_user_id or m.auth_user_id = v_auth_user_id)
    and lower(coalesce(m.status, 'active')) = 'active'
    and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  order by m.id
  limit 1;

  if v_actor_member_id is null then
    raise exception 'ACTIVE_GROUP_MEMBER_REQUIRED' using errcode = '42501';
  end if;

  select * into v_period
  from public.contribution_periods cp
  where cp.id = p_period_id and cp.group_id = p_group_id
  for update;

  if not found then
    raise exception 'CUSTOM_CONTRIBUTION_PERIOD_NOT_FOUND' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.contribution_types ct
    where ct.id = v_period.contribution_type_id
      and ct.group_id = p_group_id
      and lower(trim(coalesce(ct.code, ''))) = 'custom'
  ) then
    raise exception 'CUSTOM_CONTRIBUTION_TYPE_REQUIRED' using errcode = '22023';
  end if;

  if lower(coalesce(v_period.status, '')) not in ('open','due','grace') then
    raise exception 'CUSTOM_CONTRIBUTION_PERIOD_NOT_ACTIVE' using errcode = '22023';
  end if;

  perform public.cl_2b_accounting_lock_range(
    p_group_id,
    date_trunc('month', v_period.opening_date)::date,
    date_trunc('month', v_period.closing_date)::date
  );

  insert into public.member_contribution_rules
    (group_id, member_id, contribution_type_id, amount, frequency,
     effective_from, effective_to, first_period_rule, status, created_by)
  select m.group_id, m.id, v_period.contribution_type_id, v_period.amount,
         v_period.frequency, v_period.opening_date, v_period.closing_date,
         'full_period', 'active', v_actor_member_id
  from public.members m
  where m.group_id = p_group_id
    and lower(coalesce(m.status, 'active')) = 'active'
    and lower(coalesce(m.onboarding_status, 'active')) = 'active'
    and not exists (
      select 1 from public.member_contribution_rules r
      where r.group_id = m.group_id
        and r.member_id = m.id
        and r.contribution_type_id = v_period.contribution_type_id
        and r.effective_from = v_period.opening_date
        and r.effective_to = v_period.closing_date
    );
  get diagnostics v_rules_created = row_count;

  insert into public.contribution_obligations
    (group_id, member_id, contribution_type_id, obligation_month, due_amount, period_id)
  select r.group_id, r.member_id, r.contribution_type_id,
         date_trunc('month', v_period.due_date)::date, r.amount, v_period.id
  from public.member_contribution_rules r
  join public.members m on m.id = r.member_id and m.group_id = r.group_id
  where r.group_id = p_group_id
    and r.contribution_type_id = v_period.contribution_type_id
    and r.effective_from = v_period.opening_date
    and r.effective_to = v_period.closing_date
    and r.status = 'active'
    and lower(coalesce(m.status, 'active')) = 'active'
    and lower(coalesce(m.onboarding_status, 'active')) = 'active'
    and not exists (
      select 1 from public.contribution_obligations o
      where o.group_id = r.group_id
        and o.member_id = r.member_id
        and o.contribution_type_id = r.contribution_type_id
        and o.obligation_month = date_trunc('month', v_period.due_date)::date
        and o.component_kind = 'PARENT'
    );
  get diagnostics v_obligations_created = row_count;

  return jsonb_build_object(
    'ok', true,
    'period_id', p_period_id,
    'member_rules_created', v_rules_created,
    'obligations_created', v_obligations_created,
    'members_checked', (
      select count(*) from public.members m
      where m.group_id = p_group_id
        and lower(coalesce(m.status, 'active')) = 'active'
        and lower(coalesce(m.onboarding_status, 'active')) = 'active'
    )
  );
end;
$function$;

revoke all on function public.ensure_custom_contribution_member_obligations(uuid, uuid, uuid) from public, anon;
grant execute on function public.ensure_custom_contribution_member_obligations(uuid, uuid, uuid) to authenticated;
