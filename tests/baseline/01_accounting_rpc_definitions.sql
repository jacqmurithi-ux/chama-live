-- READ-ONLY PRODUCTION BASELINE captured 2026-10-12
-- Rollback reference only. Do not run against production without explicit authorization.

-- get_canonical_member_monthly_status(p_group_id uuid, p_month text)
CREATE OR REPLACE FUNCTION public.get_canonical_member_monthly_status(p_group_id uuid, p_month text)
 RETURNS TABLE(member_id uuid, member_number text, member_name text, monthly_due numeric, previous_outstanding numeric, previous_credit numeric, current_month_payment numeric, applied_this_month numeric, carry_forward numeric, current_outstanding numeric, total_paid_to_date numeric, total_due_to_date numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          and lower(coalesce(m.status, 'active')) = 'active'
          and (m.join_date is null or date_trunc('month', m.join_date)::date <= v_month)
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
        ms.id,
        ms.member_number,
        ms.name,
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
$function$
;

-- get_member_contribution_position(p_member_id uuid)
CREATE OR REPLACE FUNCTION public.get_member_contribution_position(p_member_id uuid)
 RETURNS TABLE(member_id uuid, group_id uuid, total_due numeric, total_allocated numeric, arrears numeric, credit numeric, status text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH target_member AS (
    SELECT m.id, m.group_id
    FROM public.members AS m
    WHERE m.id = p_member_id
      AND (
        public.cl_user_has_role(
          m.group_id,
          ARRAY['admin','chairperson','secretary','treasurer']::text[]
        )
        OR m.user_id = auth.uid()
        OR m.auth_user_id = auth.uid()
      )
  ),
  monthly_types AS (
    SELECT DISTINCT ON (ct.group_id)
      ct.group_id, ct.id AS contribution_type_id
    FROM public.contribution_types AS ct
    WHERE lower(trim(coalesce(ct.code, ''))) = 'monthly'
       OR lower(trim(ct.name)) = 'monthly'
    ORDER BY ct.group_id,
      CASE WHEN lower(trim(coalesce(ct.code, ''))) = 'monthly' THEN 0 ELSE 1 END,
      ct.created_at, ct.id
  ),
  obligation_totals AS (
    SELECT o.member_id, o.group_id, COALESCE(SUM(o.due_amount), 0)::numeric AS total_due
    FROM public.contribution_obligations AS o
    JOIN monthly_types AS mt ON mt.group_id = o.group_id AND mt.contribution_type_id = o.contribution_type_id
    JOIN target_member AS tm ON tm.id = o.member_id AND tm.group_id = o.group_id
    GROUP BY o.member_id, o.group_id
  ),
  allocation_totals AS (
    SELECT o.member_id, o.group_id, COALESCE(SUM(a.amount), 0)::numeric AS total_allocated
    FROM public.contribution_allocations AS a
    JOIN public.contribution_obligations AS o ON o.id = a.obligation_id
    JOIN monthly_types AS mt ON mt.group_id = o.group_id AND mt.contribution_type_id = o.contribution_type_id
    JOIN target_member AS tm ON tm.id = o.member_id AND tm.group_id = o.group_id
    GROUP BY o.member_id, o.group_id
  ),
  payment_totals AS (
    SELECT c.member_id, c.group_id,
      COALESCE(SUM(c.amount - COALESCE(pa.allocated_amount, 0)), 0)::numeric AS credit
    FROM public.contributions AS c
    JOIN target_member AS tm ON tm.id = c.member_id AND tm.group_id = c.group_id
    LEFT JOIN (
      SELECT a.payment_id, COALESCE(SUM(a.amount), 0)::numeric AS allocated_amount
      FROM public.contribution_allocations AS a
      GROUP BY a.payment_id
    ) AS pa ON pa.payment_id = c.id
    WHERE lower(trim(c.contribution_type)) = 'monthly'
    GROUP BY c.member_id, c.group_id
  )
  SELECT tm.id AS member_id, tm.group_id,
    COALESCE(ot.total_due, 0)::numeric(14,2) AS total_due,
    COALESCE(at.total_allocated, 0)::numeric(14,2) AS total_allocated,
    GREATEST(COALESCE(ot.total_due, 0) - COALESCE(at.total_allocated, 0), 0)::numeric(14,2) AS arrears,
    GREATEST(COALESCE(pt.credit, 0), 0)::numeric(14,2) AS credit,
    CASE
      WHEN GREATEST(COALESCE(ot.total_due, 0) - COALESCE(at.total_allocated, 0), 0) > 0 THEN 'ARREARS'
      WHEN GREATEST(COALESCE(pt.credit, 0), 0) > 0 THEN 'CREDIT'
      ELSE 'UP_TO_DATE'
    END AS status
  FROM target_member AS tm
  LEFT JOIN obligation_totals AS ot ON ot.member_id = tm.id AND ot.group_id = tm.group_id
  LEFT JOIN allocation_totals AS at ON at.member_id = tm.id AND at.group_id = tm.group_id
  LEFT JOIN payment_totals AS pt ON pt.member_id = tm.id AND pt.group_id = tm.group_id
$function$
;