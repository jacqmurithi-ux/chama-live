-- Allow authorized group officials to inspect pending initialization requests.
-- Only the Treasurer can approve; the approval RPC enforces that separately.
CREATE OR REPLACE FUNCTION public.list_member_accounting_initialization_requests(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_group_id uuid;
  v_rows jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  v_group_id := p_group_id;

  if v_group_id is null or not public.can_manage_members(v_group_id) then
    raise exception 'Member-management authorization required' using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.members m
    where m.group_id = v_group_id
      and (m.auth_user_id = v_actor or m.user_id = v_actor)
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  ) then
    raise exception 'Active membership in the requested group required' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'request_id', r.request_id,
        'member_id', r.member_id,
        'member_name', m.name,
        'member_number', m.member_number,
        'requested_by_member_id', r.requested_by_member_id,
        'requested_by_name', requester.name,
        'monthly_amount', r.monthly_amount,
        'effective_from', r.effective_from,
        'paid_through', r.paid_through
      )
      order by r.created_at
    ),
    '[]'::jsonb
  )
  into v_rows
  from private.member_accounting_initialization_requests r
  join public.members m
    on m.id = r.member_id
   and m.group_id = r.group_id
  join public.members requester
    on requester.id = r.requested_by_member_id
  where r.group_id = v_group_id
    and r.status = 'pending'
    and lower(trim(coalesce(m.role, ''))) = 'admin';

  return v_rows;
end;
$function$;
