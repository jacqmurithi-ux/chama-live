-- Additive, self-only read model for My Account allocation-by-type display.
-- This migration does not create, update, or delete financial records.
create or replace function public.cl_get_my_account_allocation_breakdown()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_member_id uuid;
  v_group_id uuid;
  v_recognized numeric := 0;
  v_allocated numeric := 0;
  v_by_type jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select m.id, m.group_id
    into v_member_id, v_group_id
  from public.members m
  where (m.user_id = v_uid or m.auth_user_id = v_uid)
    and lower(coalesce(m.status, 'active')) = 'active'
    and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  order by case when m.auth_user_id = v_uid then 0 else 1 end, m.created_at, m.id
  limit 1;

  if v_member_id is null then
    raise exception 'No active member account is linked to this login' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.members m
    where (m.user_id = v_uid or m.auth_user_id = v_uid)
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
      and m.id <> v_member_id
  ) then
    raise exception 'Multiple active member records are linked to this login. Resolve the identity mapping before continuing.' using errcode = '23505';
  end if;

  select coalesce(sum(c.amount), 0)
    into v_recognized
  from public.contributions c
  where c.group_id = v_group_id and c.member_id = v_member_id;

  select coalesce(sum(ca.amount), 0)
    into v_allocated
  from public.contribution_allocations ca
  join public.contribution_obligations o
    on o.id = ca.obligation_id
   and o.group_id = v_group_id
   and o.member_id = v_member_id
  join public.contributions c
    on c.id = ca.payment_id
   and c.group_id = v_group_id
   and c.member_id = v_member_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'contributionTypeId', x.contribution_type_id,
      'contributionType', x.contribution_type,
      'allocatedAmount', x.allocated_amount
    ) order by x.contribution_type
  ), '[]'::jsonb)
  into v_by_type
  from (
    select
      o.contribution_type_id,
      coalesce(nullif(btrim(ct.name), ''), 'Unclassified / legacy') as contribution_type,
      sum(ca.amount)::numeric as allocated_amount
    from public.contribution_allocations ca
    join public.contribution_obligations o
      on o.id = ca.obligation_id
     and o.group_id = v_group_id
     and o.member_id = v_member_id
    join public.contributions c
      on c.id = ca.payment_id
     and c.group_id = v_group_id
     and c.member_id = v_member_id
    left join public.contribution_types ct
      on ct.id = o.contribution_type_id
     and ct.group_id = v_group_id
    group by o.contribution_type_id, coalesce(nullif(btrim(ct.name), ''), 'Unclassified / legacy')
  ) x;

  return jsonb_build_object(
    'recognizedContributions', v_recognized,
    'totalAllocatedAcrossTypes', v_allocated,
    'unallocatedAmount', greatest(v_recognized - v_allocated, 0),
    'allocationExceedsRecognized', v_allocated > v_recognized,
    'allocationsByType', v_by_type
  );
end;
$function$;

revoke all on function public.cl_get_my_account_allocation_breakdown() from public, anon;
grant execute on function public.cl_get_my_account_allocation_breakdown() to authenticated;
