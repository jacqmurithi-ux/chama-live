-- CANDIDATE FIX — monthly status roll-forward, as-of selected month.
-- This migration replaces the prior candidate formula, which used current allocation
-- state to calculate prior balances and therefore let October payments erase September
-- arrears in a historical "previous outstanding" column.
-- No ledger/data mutations are performed by these function definitions.

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
  v_next_month date;
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
  v_next_month := (v_month + interval '1 month')::date;

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
    SELECT o.id, o.member_id, o.obligation_month, o.due_amount::numeric AS due_amount
    FROM public.contribution_obligations o
    JOIN monthly_types mt
      ON mt.group_id = o.group_id
     AND mt.contribution_type_id = o.contribution_type_id
    WHERE o.group_id = p_group_id
      AND o.obligation_month < v_next_month
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
      AND c.contribution_date < v_next_month
  ),
  payment_residuals AS (
    SELECT p.id, p.member_id, p.amount, p.contribution_date,
      greatest(p.amount - coalesce(allocation_sum.allocated_amount, 0), 0)::numeric AS residual_amount
    FROM payments p
    LEFT JOIN LATERAL (
      SELECT sum(ca.amount)::numeric AS allocated_amount
      FROM public.contribution_allocations ca
      WHERE ca.payment_id = p.id
    ) allocation_sum ON true
  ),
  payment_totals AS (
    SELECT p.member_id,
      coalesce(sum(p.amount) FILTER (
        WHERE p.contribution_date >= v_month AND p.contribution_date < v_next_month
      ), 0)::numeric AS current_month_payment,
      coalesce(sum(p.amount), 0)::numeric AS total_paid,
      coalesce(sum(p.amount) FILTER (WHERE p.contribution_date < v_month), 0)::numeric AS prior_paid,
      coalesce(sum(p.residual_amount), 0)::numeric AS carry_forward,
      coalesce(sum(p.residual_amount) FILTER (WHERE p.contribution_date < v_month), 0)::numeric AS prior_credit
    FROM payment_residuals p
    GROUP BY p.member_id
  ),
  allocation_totals AS (
    SELECT o.member_id,
      coalesce(sum(ca.amount) FILTER (
        WHERE o.obligation_month < v_month AND p.contribution_date < v_month
      ), 0)::numeric AS prior_allocated_asof,
      coalesce(sum(ca.amount) FILTER (
        WHERE o.obligation_month = v_month AND p.contribution_date < v_next_month
      ), 0)::numeric AS current_month_allocated_asof,
      coalesce(sum(ca.amount) FILTER (
        WHERE o.obligation_month < v_next_month AND p.contribution_date < v_next_month
      ), 0)::numeric AS total_allocated_asof
    FROM public.contribution_allocations ca
    JOIN obligations o ON o.id = ca.obligation_id
    JOIN payments p ON p.id = ca.payment_id
    GROUP BY o.member_id
  )
  SELECT
    ms.id,
    ms.member_number,
    ms.name,
    coalesce(ot.monthly_due, 0)::numeric,
    greatest(coalesce(ot.prior_due, 0) - coalesce(at.prior_allocated_asof, 0), 0)::numeric,
    coalesce(pt.prior_credit, 0)::numeric,
    coalesce(pt.current_month_payment, 0)::numeric,
    coalesce(at.current_month_allocated_asof, 0)::numeric,
    coalesce(pt.carry_forward, 0)::numeric,
    greatest(coalesce(ot.total_due, 0) - coalesce(at.total_allocated_asof, 0), 0)::numeric,
    coalesce(pt.total_paid, 0)::numeric,
    coalesce(ot.total_due, 0)::numeric,
    CASE
      WHEN greatest(coalesce(ot.total_due, 0) - coalesce(at.total_allocated_asof, 0), 0) > 0
        THEN 'outstanding'
      WHEN coalesce(pt.carry_forward, 0) > 0
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
    SELECT date_trunc('month', current_date)::date AS month_start,
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
    SELECT o.member_id, o.group_id, coalesce(sum(o.due_amount), 0)::numeric AS total_due
    FROM public.contribution_obligations o
    JOIN monthly_types mt
      ON mt.group_id = o.group_id AND mt.contribution_type_id = o.contribution_type_id
    JOIN target_member tm ON tm.id = o.member_id AND tm.group_id = o.group_id
    CROSS JOIN as_of_period ap
    WHERE o.obligation_month < ap.next_month
    GROUP BY o.member_id, o.group_id
  ),
  allocation_totals AS (
    SELECT o.member_id, o.group_id, coalesce(sum(a.amount), 0)::numeric AS total_allocated
    FROM public.contribution_allocations a
    JOIN public.contribution_obligations o ON o.id = a.obligation_id
    JOIN public.contributions p ON p.id = a.payment_id
    JOIN monthly_types mt
      ON mt.group_id = o.group_id AND mt.contribution_type_id = o.contribution_type_id
    JOIN target_member tm ON tm.id = o.member_id AND tm.group_id = o.group_id
    CROSS JOIN as_of_period ap
    WHERE o.obligation_month < ap.next_month
      AND lower(trim(coalesce(p.contribution_type, ''))) = 'monthly'
      AND p.contribution_date < ap.next_month
      AND p.group_id = o.group_id AND p.member_id = o.member_id
    GROUP BY o.member_id, o.group_id
  ),
  payment_totals AS (
    SELECT c.member_id, c.group_id,
      coalesce(sum(greatest(c.amount - coalesce(pa.allocated_amount, 0), 0)), 0)::numeric AS credit
    FROM public.contributions c
    JOIN target_member tm ON tm.id = c.member_id AND tm.group_id = c.group_id
    CROSS JOIN as_of_period ap
    LEFT JOIN LATERAL (
      SELECT sum(a.amount)::numeric AS allocated_amount
      FROM public.contribution_allocations a
      WHERE a.payment_id = c.id
    ) pa ON true
    WHERE lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
      AND c.contribution_date IS NOT NULL
      AND c.contribution_date < ap.next_month
    GROUP BY c.member_id, c.group_id
  )
  SELECT tm.id AS member_id, tm.group_id,
    coalesce(ot.total_due, 0)::numeric(14,2) AS total_due,
    coalesce(at.total_allocated, 0)::numeric(14,2) AS total_allocated,
    greatest(coalesce(ot.total_due, 0) - coalesce(at.total_allocated, 0), 0)::numeric(14,2) AS arrears,
    coalesce(pt.credit, 0)::numeric(14,2) AS credit,
    CASE
      WHEN greatest(coalesce(ot.total_due, 0) - coalesce(at.total_allocated, 0), 0) > 0 THEN 'ARREARS'
      WHEN coalesce(pt.credit, 0) > 0 THEN 'CREDIT'
      ELSE 'UP_TO_DATE'
    END AS status
  FROM target_member tm
  LEFT JOIN obligation_totals ot ON ot.member_id = tm.id AND ot.group_id = tm.group_id
  LEFT JOIN allocation_totals at ON at.member_id = tm.id AND at.group_id = tm.group_id
  LEFT JOIN payment_totals pt ON pt.member_id = tm.id AND pt.group_id = tm.group_id;
$function$;

-- Regression expectations for E2600 / October 2026 using contribution_date:
-- Duncan: prior outstanding 0, October due 200, October applied 200, current outstanding 0, credit 0.
-- James: prior outstanding 200, October due 200, October applied 200, current outstanding 0, carry-forward credit 200.
-- Michael: prior outstanding 0, October due 200, October applied 200, current outstanding 0, credit 0.
-- projecte2600: monthly due/payment/applied/credit all 0; KSh 100 Other Contribution excluded.
-- Stanley: prior outstanding 400, October due 200, October applied 200, current outstanding 0, carry-forward credit 100.
-- Future Nov/Dec obligations excluded from October cumulative position.
-- James's KSh 250 Dev fund payment remains excluded from monthly totals and unchanged.
-- Access control and browser/UI regression tests remain required before production release.
