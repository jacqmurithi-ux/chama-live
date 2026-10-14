-- E2600 reporting correction: classify obligations by contribution type and payment allocations.
-- Reporting-only: no payment, allocation, or obligation rows are modified.

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
  WITH monthly_type AS (
    SELECT ct.id
    FROM public.contribution_types ct
    WHERE ct.group_id = p_group_id
      AND (lower(trim(coalesce(ct.code, ''))) = 'monthly'
        OR lower(trim(coalesce(ct.name, ''))) = 'monthly')
    ORDER BY CASE WHEN lower(trim(coalesce(ct.code, ''))) = 'monthly' THEN 0 ELSE 1 END,
             ct.created_at, ct.id
    LIMIT 1
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
    JOIN monthly_type mt ON mt.id = o.contribution_type_id
    WHERE o.group_id = p_group_id
      AND o.obligation_month <= v_month
  ),
  obligation_totals AS (
    SELECT o.member_id,
      coalesce(sum(o.due_amount) FILTER (WHERE o.obligation_month = v_month), 0)::numeric AS monthly_due,
      coalesce(sum(o.due_amount) FILTER (WHERE o.obligation_month < v_month), 0)::numeric AS prior_due,
      coalesce(sum(o.due_amount), 0)::numeric AS total_due
    FROM obligations o GROUP BY o.member_id
  ),
  monthly_allocations AS (
    SELECT o.member_id, o.obligation_month, ca.amount::numeric AS amount,
           c.contribution_date
    FROM public.contribution_allocations ca
    JOIN obligations o ON o.id = ca.obligation_id
    JOIN public.contributions c ON c.id = ca.payment_id
    WHERE c.group_id = p_group_id
  ),
  allocation_totals AS (
    SELECT a.member_id,
      coalesce(sum(a.amount) FILTER (WHERE a.obligation_month < v_month), 0)::numeric AS prior_allocated,
      coalesce(sum(a.amount) FILTER (WHERE a.obligation_month = v_month), 0)::numeric AS current_allocated,
      coalesce(sum(a.amount), 0)::numeric AS total_allocated,
      coalesce(sum(a.amount) FILTER (
        WHERE a.contribution_date >= v_month
          AND a.contribution_date < (v_month + interval '1 month')::date
      ), 0)::numeric AS current_month_payment
    FROM monthly_allocations a
    GROUP BY a.member_id
  )
  SELECT
    ms.id,
    ms.member_number,
    ms.name,
    coalesce(ot.monthly_due, 0)::numeric,
    greatest(coalesce(ot.prior_due, 0) - coalesce(at.prior_allocated, 0), 0)::numeric,
    greatest(coalesce(at.prior_allocated, 0) - coalesce(ot.prior_due, 0), 0)::numeric,
    coalesce(at.current_month_payment, 0)::numeric,
    coalesce(at.current_allocated, 0)::numeric,
    greatest(coalesce(at.prior_allocated, 0) - coalesce(ot.prior_due, 0), 0)::numeric,
    greatest(coalesce(ot.monthly_due, 0) - coalesce(at.current_allocated, 0), 0)::numeric,
    coalesce(at.total_allocated, 0)::numeric,
    coalesce(ot.total_due, 0)::numeric,
    CASE
      WHEN greatest(coalesce(ot.monthly_due, 0) - coalesce(at.current_allocated, 0), 0) = 0
       AND greatest(coalesce(at.total_allocated, 0) - coalesce(ot.total_due, 0), 0) > 0 THEN 'credit'
      WHEN greatest(coalesce(ot.monthly_due, 0) - coalesce(at.current_allocated, 0), 0) = 0 THEN 'paid'
      WHEN coalesce(at.current_allocated, 0) > 0 THEN 'partial'
      ELSE 'outstanding'
    END::text
  FROM member_set ms
  LEFT JOIN obligation_totals ot ON ot.member_id = ms.id
  LEFT JOIN allocation_totals at ON at.member_id = ms.id
  ORDER BY ms.name;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_group_contribution_type_summary(
  p_group_id uuid,
  p_month text
)
RETURNS TABLE(
  contribution_type_id uuid,
  contribution_name text,
  contribution_code text,
  is_monthly boolean,
  due_this_month numeric,
  allocated_this_month numeric,
  payment_allocated_this_month numeric,
  outstanding_due_to_date numeric
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
  WITH types AS (
    SELECT ct.id, ct.name, ct.code,
      (lower(trim(coalesce(ct.code, ''))) = 'monthly'
        OR lower(trim(coalesce(ct.name, ''))) = 'monthly') AS is_monthly
    FROM public.contribution_types ct
    WHERE ct.group_id = p_group_id
  ),
  obligations AS (
    SELECT o.id, o.contribution_type_id, o.obligation_month, o.due_amount::numeric AS due_amount
    FROM public.contribution_obligations o
    WHERE o.group_id = p_group_id
      AND o.obligation_month <= v_month
  ),
  allocations AS (
    SELECT o.contribution_type_id, o.obligation_month, ca.amount::numeric AS amount,
           c.contribution_date
    FROM public.contribution_allocations ca
    JOIN obligations o ON o.id = ca.obligation_id
    JOIN public.contributions c ON c.id = ca.payment_id
    WHERE c.group_id = p_group_id
  ),
  due_totals AS (
    SELECT o.contribution_type_id,
      coalesce(sum(o.due_amount) FILTER (WHERE o.obligation_month = v_month), 0)::numeric AS due_month,
      coalesce(sum(o.due_amount), 0)::numeric AS due_to_date
    FROM obligations o
    GROUP BY o.contribution_type_id
  ),
  allocation_totals AS (
    SELECT a.contribution_type_id,
      coalesce(sum(a.amount) FILTER (WHERE a.obligation_month = v_month), 0)::numeric AS allocated_month,
      coalesce(sum(a.amount) FILTER (
        WHERE a.contribution_date >= v_month
          AND a.contribution_date < (v_month + interval '1 month')::date
      ), 0)::numeric AS payment_month,
      coalesce(sum(a.amount), 0)::numeric AS allocated_to_date
    FROM allocations a
    GROUP BY a.contribution_type_id
  )
  SELECT t.id, t.name, t.code, t.is_monthly,
    coalesce(d.due_month, 0)::numeric,
    coalesce(a.allocated_month, 0)::numeric,
    coalesce(a.payment_month, 0)::numeric,
    greatest(coalesce(d.due_to_date, 0) - coalesce(a.allocated_to_date, 0), 0)::numeric
  FROM types t
  LEFT JOIN due_totals d ON d.contribution_type_id = t.id
  LEFT JOIN allocation_totals a ON a.contribution_type_id = t.id
  WHERE coalesce(d.due_month, 0) <> 0
     OR coalesce(a.allocated_month, 0) <> 0
     OR coalesce(a.payment_month, 0) <> 0
  ORDER BY t.is_monthly DESC, t.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_canonical_member_monthly_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_canonical_member_monthly_status(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_group_contribution_type_summary(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_contribution_type_summary(uuid, text) TO authenticated;
