-- Group-wide loan summary for both dashboard portals.
-- Reads canonical disbursement and repayment allocation records only.
create or replace function public.cl_get_group_loan_summary(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_summary jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_group_id is null then
    raise exception 'Group is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and (
        g.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.members m
          where m.group_id = g.id
            and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
            and lower(coalesce(m.status, 'active')) = 'active'
            and lower(coalesce(m.onboarding_status, 'active')) = 'active'
        )
        or public.cl_user_has_role(
          g.id,
          array['admin','chairperson','secretary','treasurer']::text[]
        )
      )
  ) then
    raise exception 'You are not authorized to view this group loan summary'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and coalesce(g.loans_enabled, false) = true
  ) then
    raise exception 'Loans are not enabled for this group'
      using errcode = '42501';
  end if;

  with disbursed_loans as (
    select la.id, la.group_id, la.member_id, la.approved_amount, la.status
    from public.loan_applications la
    where la.group_id = p_group_id
      and la.disbursed_at is not null
      and la.status in ('active', 'overdue', 'cleared')
  ),
  loan_totals as (
    select
      coalesce(sum(approved_amount), 0)::numeric as total_disbursed,
      count(distinct member_id)::integer as members_benefited,
      count(*) filter (where status in ('active', 'overdue'))::integer as active_loans_count
    from disbursed_loans
  ),
  interest_totals as (
    select coalesce(sum(a.interest_amount), 0)::numeric as interest_gained
    from public.loan_repayment_allocations a
    join disbursed_loans dl on dl.id = a.loan_id
    where a.group_id = p_group_id
  ),
  principal_totals as (
    select coalesce(sum(greatest(s.principal_due - coalesce(pa.principal_paid, 0), 0)), 0)::numeric
      as outstanding_amount
    from public.loan_repayment_schedule s
    join disbursed_loans dl on dl.id = s.loan_id
    left join (
      select schedule_id, sum(principal_amount)::numeric as principal_paid
      from public.loan_repayment_allocations
      where group_id = p_group_id
      group by schedule_id
    ) pa on pa.schedule_id = s.id
    where s.group_id = p_group_id
      and dl.status in ('active', 'overdue')
  )
  select jsonb_build_object(
    'totalDisbursed', lt.total_disbursed,
    'interestGained', it.interest_gained,
    'membersBenefited', lt.members_benefited,
    'outstandingAmount', pt.outstanding_amount,
    'activeLoansCount', lt.active_loans_count
  )
  into v_summary
  from loan_totals lt
  cross join interest_totals it
  cross join principal_totals pt;

  return coalesce(v_summary, jsonb_build_object(
    'totalDisbursed', 0,
    'interestGained', 0,
    'membersBenefited', 0,
    'outstandingAmount', 0,
    'activeLoansCount', 0
  ));
end;
$function$;

revoke all on function public.cl_get_group_loan_summary(uuid) from public;
revoke all on function public.cl_get_group_loan_summary(uuid) from anon;
grant execute on function public.cl_get_group_loan_summary(uuid) to authenticated;
