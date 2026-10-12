-- CANDIDATE ONLY — do not apply to production without the accounting release gate.
-- Fixes:
-- 1) monthly status allocation totals must only include Monthly obligations;
-- 2) cumulative position must be as-of the current month, not include future obligations;
-- 3) monthly credit must reconcile to monthly payments less Monthly allocations due through this month.
--
-- This migration deliberately contains no data updates, deletes, or ledger mutations.

CREATE OR REPLACE FUNCTION public.get_canonical_member_monthly_status(
  p_group_id uuid,
  p_month text
)
RETURNS TABLE(
  member_id uuid,
  member_number text,
  member_name text,
  monthly_due numeric,
  previous_outstanding numeric,
  previous_credit numeric,
  current_month_payment numeric,
  applied_this_month numeric,
  carry_forward numeric,
  current_outstanding numeric,
  total_paid_to_date numeric,
  total_due_to_date numeric,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_month date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.cl_user_in_group(p_group_id) THEN
    RAISE EXCEPTION 'You do not have access to this group';
  END IF;

  IF p_month IS NULL OR p_month !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Month must use YYYY-MM format';
  END IF;

  v_month := (p_month || '-01')::date;

  RETURN QUERY
  WITH monthly_types AS (
    SELECT DISTINCT ON (ct.group_id)
      ct.group_id, ct.id AS contribution_type_id
    FROM public.contribution_types ct
    WHERE ct.group_id = p_group_id
      AND (
        lower(trim(coalesce(ct.code, ''))) = 'monthly'
        OR lower(trim(ct.name)) = 'monthly'
      )
    ORDER BY ct.group_id,
      CASE WHEN lower(trim(coalesce(ct.code, ''))) = 'monthly' THEN 0 ELSE 1 END,
      ct.created_at, ct.id
  ),
  member_set AS (
    SELECT m.id, m.member_number::text, m.name
    FROM public.members m
    WHERE m.group_id = p_group_id
      AND lower(coalesce(m.status, 'active')) = 'active'
      AND (m.join_date IS NULL OR date_trunc('month', m.join_date)::date <= v_month)
  ),
  obligations AS (
    SELECT o.member_id, o.obligation_month, o.due_amount::numeric AS due_amount
    FROM public.contribution_obligations o
    JOIN monthly_types mt
      ON mt.group_id = o.group_id
     AND mt.contribution_type_id = o.contribution_type_id
    WHERE o.group_id = p_group_id
      AND o.obligation_month <= v_month
  ),
  obligation_totals AS (
    SELECT o.member_id,
      coalesce(sum(o.due_amount) FILTER (WHERE o.obligation_month = v_month), 0)::numeric AS monthly_due,
      coalesce(sum(o.due_amount) FILTER (WHERE o.obligation_month < v_month), 0)::numeric AS prior_due,
      coalesce(sum(o.due_amount), 0)::numeric AS total_due
    FROM obligations o
    GROUP BY o.member_id
  ),
  payments AS (
    SELECT c.id, c.member_id, c.amount::numeric AS amount, c.contribution_date
    FROM public.contributions c
    WHERE c.group_id = p_group_id
      AND lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
      AND c.contribution_date IS NOT NULL
      AND c.contribution_date < (v_month + interval '1 month')::date
  ),
  payment_totals AS (
    SELECT p.member_id,
      coalesce(sum(p.amount) FILTER (
        WHERE p.contribution_date >= v_month
          AND p.contribution_date < (v_month + interval '1 month')::date
      ), 0)::numeric AS current_month_payment,
      coalesce(sum(p.amount), 0)::numeric AS total_paid
    FROM payments p
    GROUP BY p.member_id
  ),
  allocation_totals AS (
    SELECT o.member_id,
      coalesce(sum(ca.amount) FILTER (WHERE o.obligation_month < v_month), 0)::numeric AS prior_allocated,
      coalesce(sum(ca.amount) FILTER (WHERE o.obligation_month = v_month), 0)::numeric AS current_allocated,
      coalesce(sum(ca.amount), 0)::numeric AS total_allocated
    FROM public.contribution_allocations ca
    JOIN public.contribution_obligations o ON o.id = ca.obligation_id
    JOIN monthly_types mt
      ON mt.group_id = o.group_id
     AND mt.contribution_type_id = o.contribution_type_id
    WHERE o.group_id = p_group_id
      AND o.obligation_month <= v_month
    GROUP BY o.member_id
  )
  SELECT
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
    CASE
      -- Status must reconcile to cumulative position through the selected month,
      -- not just the current month's obligation. Otherwise a member with older
      -- arrears can be labelled "paid" while cumulative accounting says ARREARS.
      WHEN greatest(coalesce(ot.prior_due, 0) - coalesce(at.prior_allocated, 0), 0)
         + greatest(coalesce(ot.monthly_due, 0) - coalesce(at.current_allocated, 0), 0) > 0
        THEN 'outstanding'
      WHEN greatest(coalesce(pt.total_paid, 0) - coalesce(at.total_allocated, 0), 0) > 0
        THEN 'credit'
      ELSE 'paid'
    END::text
  FROM member_set ms
  LEFT JOIN obligation_totals ot ON ot.member_id = ms.id
  LEFT JOIN payment_totals pt ON pt.member_id = ms.id
  LEFT JOIN allocation_totals at ON at.member_id = ms.id
  ORDER BY ms.name;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_member_contribution_position(p_member_id uuid)
RETURNS TABLE(
  member_id uuid,
  group_id uuid,
  total_due numeric,
  total_allocated numeric,
  arrears numeric,
  credit numeric,
  status text
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  WITH target_member AS (
    SELECT m.id, m.group_id
    FROM public.members m
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
  as_of_period AS (
    SELECT (date_trunc('month', current_date))::date AS month_start,
           (date_trunc('month', current_date) + interval '1 month')::date AS next_month
  ),
  monthly_types AS (
    SELECT DISTINCT ON (ct.group_id)
      ct.group_id, ct.id AS contribution_type_id
    FROM public.contribution_types ct
    JOIN target_member tm ON tm.group_id = ct.group_id
    WHERE lower(trim(coalesce(ct.code, ''))) = 'monthly'
       OR lower(trim(ct.name)) = 'monthly'
    ORDER BY ct.group_id,
      CASE WHEN lower(trim(coalesce(ct.code, ''))) = 'monthly' THEN 0 ELSE 1 END,
      ct.created_at, ct.id
  ),
  obligation_totals AS (
    SELECT o.member_id, o.group_id,
      coalesce(sum(o.due_amount), 0)::numeric AS total_due
    FROM public.contribution_obligations o
    JOIN monthly_types mt
      ON mt.group_id = o.group_id
     AND mt.contribution_type_id = o.contribution_type_id
    JOIN target_member tm ON tm.id = o.member_id AND tm.group_id = o.group_id
    CROSS JOIN as_of_period ap
    WHERE o.obligation_month < ap.next_month
    GROUP BY o.member_id, o.group_id
  ),
  allocation_totals AS (
    SELECT o.member_id, o.group_id,
      coalesce(sum(a.amount), 0)::numeric AS total_allocated
    FROM public.contribution_allocations a
    JOIN public.contribution_obligations o ON o.id = a.obligation_id
    JOIN monthly_types mt
      ON mt.group_id = o.group_id
     AND mt.contribution_type_id = o.contribution_type_id
    JOIN target_member tm ON tm.id = o.member_id AND tm.group_id = o.group_id
    CROSS JOIN as_of_period ap
    WHERE o.obligation_month < ap.next_month
    GROUP BY o.member_id, o.group_id
  ),
  payment_totals AS (
    SELECT c.member_id, c.group_id,
      coalesce(sum(c.amount), 0)::numeric AS total_paid
    FROM public.contributions c
    JOIN target_member tm ON tm.id = c.member_id AND tm.group_id = c.group_id
    CROSS JOIN as_of_period ap
    WHERE lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
      AND c.contribution_date IS NOT NULL
      AND c.contribution_date < ap.next_month
    GROUP BY c.member_id, c.group_id
  )
  SELECT tm.id AS member_id, tm.group_id,
    coalesce(ot.total_due, 0)::numeric(14,2) AS total_due,
    coalesce(at.total_allocated, 0)::numeric(14,2) AS total_allocated,
    greatest(coalesce(ot.total_due, 0) - coalesce(at.total_allocated, 0), 0)::numeric(14,2) AS arrears,
    greatest(coalesce(pt.total_paid, 0) - coalesce(at.total_allocated, 0), 0)::numeric(14,2) AS credit,
    CASE
      WHEN greatest(coalesce(ot.total_due, 0) - coalesce(at.total_allocated, 0), 0) > 0 THEN 'ARREARS'
      WHEN greatest(coalesce(pt.total_paid, 0) - coalesce(at.total_allocated, 0), 0) > 0 THEN 'CREDIT'
      ELSE 'UP_TO_DATE'
    END AS status
  FROM target_member tm
  LEFT JOIN obligation_totals ot ON ot.member_id = tm.id AND ot.group_id = tm.group_id
  LEFT JOIN allocation_totals at ON at.member_id = tm.id AND at.group_id = tm.group_id
  LEFT JOIN payment_totals pt ON pt.member_id = tm.id AND pt.group_id = tm.group_id;
$function$;

-- Required candidate regression checks before production approval:
-- A. For E2600 / October 2026, monthly Applied must exclude the KSh 100
--    "Other Contribution (Runtime Test)" allocation when no monthly obligation exists.
-- B. Stanley Kaberia's monthly status and cumulative position must agree on
--    arrears/credit after excluding future obligations: expected arrears KSh 0,
--    credit KSh 100 if read-only source totals remain unchanged.
-- C. Duncan and Michael must not be in arrears for November/December obligations
--    when reporting October; their future KSh 400 each must be excluded.
-- D. James's KSh 250 Dev fund payment must remain untouched and must not count
--    as a monthly payment or monthly allocation.
-- E. Verify authorization for group roles, own-member access, and denied cross-group access.
