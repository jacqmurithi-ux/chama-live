-- Candidate-only repair for historical onboarding regression tests.
-- Populate the denormalized group/member and legacy allocated_amount fields
-- required by the current contribution_allocations schema, while retaining
-- amount as the canonical allocation value. Do not apply to production before release gates.
CREATE OR REPLACE FUNCTION public.cl_2b_refresh_member(p_member_id uuid, p_through_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group_id uuid;
  v_join_month date;
  v_requested_month date;
  v_effective_through_month date;
  v_latest_payment_month date;
  v_latest_obligation_month date;
  v_initial_lock_end date;
  v_monthly_type_id uuid;
  v_financial_start_month date;
  v_earliest_rule_month date;
  v_earliest_obligation_month date;
  v_earliest_payment_month date;
BEGIN
  IF p_member_id IS NULL OR p_through_month IS NULL THEN
    RAISE EXCEPTION 'Member and through month are required';
  END IF;

  v_requested_month := date_trunc('month', p_through_month)::date;

  SELECT m.group_id, date_trunc('month', m.join_date)::date
  INTO v_group_id, v_join_month
  FROM public.members m
  WHERE m.id = p_member_id;

  IF v_group_id IS NULL THEN RETURN; END IF;
  IF v_join_month IS NULL THEN v_join_month = v_requested_month; END IF;

  SELECT ct.id INTO v_monthly_type_id
  FROM public.contribution_types ct
  WHERE ct.group_id = v_group_id
    AND (ct.code = 'monthly' OR lower(trim(ct.name)) = 'monthly')
  ORDER BY CASE WHEN ct.code = 'monthly' THEN 0 ELSE 1 END, ct.created_at, ct.id
  LIMIT 1;

  IF v_monthly_type_id IS NULL THEN
    RAISE EXCEPTION 'Canonical Monthly contribution type is missing';
  END IF;

  SELECT min(date_trunc('month', r.effective_from)::date)
  INTO v_earliest_rule_month
  FROM public.member_contribution_rules r
  WHERE r.group_id = v_group_id AND r.member_id = p_member_id
    AND r.contribution_type_id = v_monthly_type_id AND r.frequency = 'monthly'
    AND r.effective_from IS NOT NULL;

  SELECT min(date_trunc('month', o.obligation_month)::date)
  INTO v_earliest_obligation_month
  FROM public.contribution_obligations o
  WHERE o.group_id = v_group_id AND o.member_id = p_member_id
    AND o.contribution_type_id = v_monthly_type_id;

  SELECT min(date_trunc('month', c.contribution_date)::date)
  INTO v_earliest_payment_month
  FROM public.contributions c
  WHERE c.group_id = v_group_id AND c.member_id = p_member_id
    AND lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
    AND c.contribution_date IS NOT NULL;

  v_financial_start_month := least(
    coalesce(v_earliest_rule_month, v_requested_month),
    coalesce(v_earliest_obligation_month, v_requested_month),
    coalesce(v_earliest_payment_month, v_requested_month),
    v_requested_month
  );

  SELECT max(c.contribution_date) INTO v_latest_payment_month
  FROM public.contributions c
  WHERE c.member_id = p_member_id
    AND lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
    AND c.contribution_date IS NOT NULL;

  SELECT max(o.obligation_month) INTO v_latest_obligation_month
  FROM public.contribution_obligations o
  WHERE o.member_id = p_member_id AND o.contribution_type_id = v_monthly_type_id;

  v_effective_through_month := greatest(
    v_requested_month,
    coalesce(date_trunc('month', v_latest_payment_month)::date, v_requested_month),
    coalesce(v_latest_obligation_month, v_requested_month),
    coalesce((
      SELECT max((date_trunc('month', r.effective_from) + interval '1 month')::date)
      FROM public.member_contribution_rules r
      WHERE r.group_id = v_group_id AND r.member_id = p_member_id
        AND r.contribution_type_id = v_monthly_type_id
        AND r.frequency = 'monthly' AND r.status = 'active'
        AND r.first_period_rule = 'next_full_period'
        AND date_trunc('month', r.effective_from)::date = v_join_month
    ), v_requested_month)
  );

  v_initial_lock_end = v_effective_through_month;

  PERFORM public.cl_2b_accounting_lock_range(
    v_group_id, v_financial_start_month, v_initial_lock_end
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' || v_group_id::text || ':' || p_member_id::text, 0
    )
  );

  INSERT INTO public.contribution_obligations (
    group_id, member_id, contribution_type_id, rule_id, obligation_month, economic_month, due_amount
  )
  SELECT r.group_id, r.member_id, r.contribution_type_id, r.id, gs::date, gs::date, r.amount
  FROM public.member_contribution_rules r
  CROSS JOIN LATERAL generate_series(
    CASE WHEN r.first_period_rule = 'next_full_period'
      THEN (date_trunc('month', r.effective_from) + interval '1 month')::date
      ELSE date_trunc('month', r.effective_from)::date END,
    least(
      v_effective_through_month,
      coalesce(date_trunc('month', r.effective_to)::date, v_effective_through_month)
    ),
    interval '1 month'
  ) gs
  WHERE r.group_id = v_group_id AND r.member_id = p_member_id
    AND r.contribution_type_id = v_monthly_type_id
    AND r.frequency = 'monthly' AND r.status = 'active'
    AND date_trunc('month', r.effective_from)::date <= v_effective_through_month
    AND (
      r.effective_to IS NULL
      OR date_trunc('month', r.effective_to)::date >=
        CASE WHEN r.first_period_rule = 'next_full_period'
          THEN (date_trunc('month', r.effective_from) + interval '1 month')::date
          ELSE date_trunc('month', r.effective_from)::date END
    )
  ON CONFLICT (
    group_id, member_id, contribution_type_id, obligation_month
  )
  WHERE component_kind = 'PARENT'
    AND rule_id IS NOT NULL
  DO NOTHING;

  WITH monthly_payments AS (
    SELECT c.id AS payment_id, c.amount::numeric AS amount,
           c.contribution_date, c.created_at
    FROM public.contributions c
    WHERE c.group_id = v_group_id AND c.member_id = p_member_id
      AND lower(trim(coalesce(c.contribution_type, ''))) = 'monthly'
      AND c.contribution_date IS NOT NULL
      AND date_trunc('month', c.contribution_date)::date <= v_effective_through_month
  ),
  payment_allocations AS (
    SELECT p.payment_id,
      coalesce(sum(a.amount), 0)::numeric AS all_allocated_amount,
      coalesce(sum(a.amount) FILTER (WHERE o.id IS NOT NULL), 0)::numeric AS monthly_allocated_amount
    FROM monthly_payments p
    LEFT JOIN public.contribution_allocations a ON a.payment_id = p.payment_id
    LEFT JOIN public.contribution_obligations o ON o.id = a.obligation_id
      AND o.group_id = v_group_id AND o.member_id = p_member_id
      AND o.contribution_type_id = v_monthly_type_id
    GROUP BY p.payment_id
  ),
  payment_residuals AS (
    SELECT p.payment_id,
      greatest(p.amount - coalesce(pa.all_allocated_amount, 0), 0)::numeric AS residual_amount,
      p.contribution_date, p.created_at
    FROM monthly_payments p
    LEFT JOIN payment_allocations pa ON pa.payment_id = p.payment_id
    WHERE p.amount > coalesce(pa.all_allocated_amount, 0)
  ),
  monthly_obligations AS (
    SELECT o.id AS obligation_id, o.due_amount::numeric AS due_amount, o.obligation_month
    FROM public.contribution_obligations o
    WHERE o.group_id = v_group_id AND o.member_id = p_member_id
      AND o.contribution_type_id = v_monthly_type_id
      AND o.obligation_month <= v_effective_through_month
  ),
  obligation_allocations AS (
    SELECT o.obligation_id,
      coalesce(sum(a.amount) FILTER (WHERE p.id IS NOT NULL), 0)::numeric AS monthly_allocated_amount
    FROM monthly_obligations o
    LEFT JOIN public.contribution_allocations a ON a.obligation_id = o.obligation_id
    LEFT JOIN public.contributions p ON p.id = a.payment_id
      AND p.group_id = v_group_id AND p.member_id = p_member_id
      AND lower(trim(coalesce(p.contribution_type, ''))) = 'monthly'
    GROUP BY o.obligation_id
  ),
  obligation_residuals AS (
    SELECT o.obligation_id,
      greatest(o.due_amount - coalesce(oa.monthly_allocated_amount, 0), 0)::numeric AS residual_amount,
      o.obligation_month
    FROM monthly_obligations o
    LEFT JOIN obligation_allocations oa ON oa.obligation_id = o.obligation_id
    WHERE o.due_amount > coalesce(oa.monthly_allocated_amount, 0)
  ),
  payment_ranges AS (
    SELECT pr.*,
      coalesce(sum(pr.residual_amount) OVER (
        ORDER BY pr.contribution_date, pr.created_at, pr.payment_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0)::numeric AS payment_from,
      sum(pr.residual_amount) OVER (
        ORDER BY pr.contribution_date, pr.created_at, pr.payment_id
        ROWS UNBOUNDED PRECEDING
      )::numeric AS payment_to
    FROM payment_residuals pr
  ),
  obligation_ranges AS (
    SELECT orr.*,
      coalesce(sum(orr.residual_amount) OVER (
        ORDER BY orr.obligation_month, orr.obligation_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0)::numeric AS obligation_from,
      sum(orr.residual_amount) OVER (
        ORDER BY orr.obligation_month, orr.obligation_id
        ROWS UNBOUNDED PRECEDING
      )::numeric AS obligation_to
    FROM obligation_residuals orr
  ),
  matches AS (
    SELECT p.payment_id, o.obligation_id,
      greatest(
        0,
        least(p.payment_to, o.obligation_to) -
        greatest(p.payment_from, o.obligation_from)
      )::numeric AS allocation_amount
    FROM payment_ranges p
    CROSS JOIN obligation_ranges o
    WHERE greatest(
      0,
      least(p.payment_to, o.obligation_to) -
      greatest(p.payment_from, o.obligation_from)
    ) > 0
  )
  INSERT INTO public.contribution_allocations (group_id, member_id, payment_id, obligation_id, allocated_amount, amount)
  SELECT v_group_id, p_member_id, m.payment_id, m.obligation_id, m.allocation_amount, m.allocation_amount
  FROM matches m
  WHERE NOT EXISTS (
    SELECT 1 FROM public.contribution_allocations a
    WHERE a.payment_id = m.payment_id AND a.obligation_id = m.obligation_id
  );

  IF EXISTS (
    SELECT 1
    FROM public.contribution_allocations a
    JOIN public.contributions p ON p.id = a.payment_id
    JOIN public.contribution_obligations o ON o.id = a.obligation_id
    WHERE (p.member_id = p_member_id OR o.member_id = p_member_id)
      AND (p.group_id <> o.group_id OR p.member_id <> o.member_id OR a.amount <= 0)
  ) THEN
    RAISE EXCEPTION 'Cross-member/group allocation detected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT a.payment_id, sum(a.amount) allocated
      FROM public.contribution_allocations a
      JOIN public.contributions p ON p.id = a.payment_id
      WHERE p.member_id = p_member_id
      GROUP BY a.payment_id
    ) x
    JOIN public.contributions p ON p.id = x.payment_id
    WHERE x.allocated > p.amount
  ) THEN
    RAISE EXCEPTION 'Payment over-allocation detected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT a.obligation_id, sum(a.amount) allocated
      FROM public.contribution_allocations a
      JOIN public.contribution_obligations o ON o.id = a.obligation_id
      WHERE o.member_id = p_member_id
      GROUP BY a.obligation_id
    ) x
    JOIN public.contribution_obligations o ON o.id = x.obligation_id
    WHERE x.allocated > o.due_amount
  ) THEN
    RAISE EXCEPTION 'Obligation over-allocation detected';
  END IF;
END;
$function$
;
