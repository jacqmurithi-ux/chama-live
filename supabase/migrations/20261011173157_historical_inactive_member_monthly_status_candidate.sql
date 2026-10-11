-- Historical monthly status includes inactive members only for past months
-- where a canonical contribution obligation proves eligibility. Current-month
-- active-member totals remain restricted to active members.
create or replace function public.get_canonical_member_monthly_status(p_group_id uuid, p_month text)
returns table(
  member_id uuid, member_number text, member_name text, monthly_due numeric,
  previous_outstanding numeric, previous_credit numeric, current_month_payment numeric,
  applied_this_month numeric, carry_forward numeric, current_outstanding numeric,
  total_paid_to_date numeric, total_due_to_date numeric, status text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_month date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.cl_user_in_group(p_group_id) then
    raise exception 'You do not have access to this group';
  end if;
  if p_month is null or p_month !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'Month must use YYYY-MM format';
  end if;
  v_month := (p_month || '-01')::date;

  return query
  with member_set as (
    select m.id, m.member_number::text, m.name
    from public.members m
    where m.group_id = p_group_id
      and (m.join_date is null or date_trunc('month', m.join_date)::date <= v_month)
      and (
        lower(coalesce(m.status, 'active')) = 'active'
        or (
          v_month < date_trunc('month', current_date)::date
          and exists (
            select 1
            from public.contribution_obligations historical_obligation
            where historical_obligation.group_id = m.group_id
              and historical_obligation.member_id = m.id
              and historical_obligation.obligation_month = v_month
              and historical_obligation.rule_id is not null
          )
        )
      )
  ),
  obligations as (
    select o.member_id, o.obligation_month, o.due_amount::numeric as due_amount
    from public.contribution_obligations o
    where o.group_id = p_group_id
      and o.obligation_month <= v_month
      and o.rule_id is not null
  ),
  obligation_totals as (
    select o.member_id,
           coalesce(sum(o.due_amount) filter (where o.obligation_month = v_month), 0)::numeric as monthly_due,
           coalesce(sum(o.due_amount) filter (where o.obligation_month < v_month), 0)::numeric as prior_due,
           coalesce(sum(o.due_amount), 0)::numeric as total_due
    from obligations o group by o.member_id
  ),
  payments as (
    select c.id, c.member_id, c.amount::numeric as amount, c.contribution_date
    from public.contributions c
    where c.group_id = p_group_id
      and lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
      and c.contribution_date is not null
      and c.contribution_date < (v_month + interval '1 month')::date
  ),
  payment_totals as (
    select p.member_id,
           coalesce(sum(p.amount) filter (
             where p.contribution_date >= v_month
               and p.contribution_date < (v_month + interval '1 month')::date
           ), 0)::numeric as current_month_payment,
           coalesce(sum(p.amount), 0)::numeric as total_paid
    from payments p group by p.member_id
  ),
  allocation_totals as (
    select o.member_id,
           coalesce(sum(ca.amount) filter (where o.obligation_month < v_month), 0)::numeric as prior_allocated,
           coalesce(sum(ca.amount) filter (where o.obligation_month = v_month), 0)::numeric as current_allocated,
           coalesce(sum(ca.amount), 0)::numeric as total_allocated
    from public.contribution_allocations ca
    join public.contribution_obligations o on o.id = ca.obligation_id
    where o.group_id = p_group_id and o.obligation_month <= v_month
    group by o.member_id
  )
  select
    ms.id, ms.member_number, ms.name,
    coalesce(ot.monthly_due, 0)::numeric,
    greatest(coalesce(ot.prior_due, 0) - coalesce(at.prior_allocated, 0), 0)::numeric,
    greatest(coalesce(at.prior_allocated, 0) - coalesce(ot.prior_due, 0), 0)::numeric,
    coalesce(pt.current_month_payment, 0)::numeric,
    coalesce(at.current_allocated, 0)::numeric,
    greatest(coalesce(pt.total_paid, 0) - coalesce(at.total_allocated, 0), 0)::numeric,
    greatest(coalesce(ot.monthly_due, 0) - coalesce(at.current_allocated, 0), 0)::numeric,
    coalesce(pt.total_paid, 0)::numeric,
    coalesce(ot.total_due, 0)::numeric,
    case
      when greatest(coalesce(ot.monthly_due, 0) - coalesce(at.current_allocated, 0), 0) = 0
       and greatest(coalesce(pt.total_paid, 0) - coalesce(at.total_allocated, 0), 0) > 0 then 'credit'
      when greatest(coalesce(ot.monthly_due, 0) - coalesce(at.current_allocated, 0), 0) = 0 then 'paid'
      when coalesce(at.current_allocated, 0) > 0 then 'partial'
      else 'outstanding'
    end::text
  from member_set ms
  left join obligation_totals ot on ot.member_id = ms.id
  left join payment_totals pt on pt.member_id = ms.id
  left join allocation_totals at on at.member_id = ms.id
  order by ms.name;
end;
$function$;
