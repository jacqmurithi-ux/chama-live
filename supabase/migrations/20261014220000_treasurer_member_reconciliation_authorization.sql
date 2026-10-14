-- Allow the group's Treasurer to reconcile member contribution allocations.
-- The reconciliation RPC remains scoped to an active group role and uses the existing
-- accounting locks and closed-period protections.
begin;
CREATE OR REPLACE FUNCTION public.reconcile_member_historical_payments(p_member_id uuid, p_through_date date DEFAULT NULL::date)
 RETURNS TABLE(member_id uuid, group_id uuid, payments_considered integer, payments_with_residual integer, allocations_created integer, total_due numeric, total_allocated numeric, arrears numeric, credit numeric, status text, reconciled_through date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_group_id uuid;
  v_cutoff date := COALESCE(p_through_date, CURRENT_DATE);
  v_monthly_type_id uuid;
  v_join_date date;
  v_lock_start date;
  v_lock_end date;
  v_payments_considered integer := 0;
  v_payments_with_residual integer := 0;
  v_allocations_created integer := 0;
  v_total_due numeric := 0;
  v_total_allocated numeric := 0;
  v_arrears numeric := 0;
  v_credit numeric := 0;
  v_status text;
  v_reconciled_through date;
  v_payment record;
  v_obligation record;
  v_period record;
  v_period_status text;
  v_remaining numeric;
  v_available numeric;
  v_alloc_amount numeric;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_member_id IS NULL THEN
    RAISE EXCEPTION 'Member is required';
  END IF;

  SELECT m.group_id, m.join_date
  INTO STRICT v_group_id, v_join_date
  FROM public.members AS m
  WHERE m.id = p_member_id
  FOR SHARE;

  IF NOT public.can_manage_members(v_group_id)
     AND public.current_user_role(v_group_id) IS DISTINCT FROM 'treasurer'
  THEN
    RAISE EXCEPTION 'Not authorized to reconcile this member';
  END IF;

  v_lock_start := date_trunc('month', COALESCE(v_join_date, v_cutoff))::date;
  v_lock_end := date_trunc('month', v_cutoff)::date;

  PERFORM public.cl_2b_accounting_lock_range(
    v_group_id,
    v_lock_start,
    v_lock_end
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' || v_group_id::text || ':' || p_member_id::text,
      0
    )
  );

  SELECT ct.id
  INTO STRICT v_monthly_type_id
  FROM public.contribution_types AS ct
  WHERE ct.group_id = v_group_id
    AND ct.code = 'monthly';

  SELECT COALESCE(MAX(o.obligation_month), v_join_date)
  INTO v_reconciled_through
  FROM public.contribution_obligations AS o
  WHERE o.group_id = v_group_id
    AND o.member_id = p_member_id
    AND o.contribution_type_id = v_monthly_type_id
    AND o.obligation_month <= v_cutoff;

  FOR v_period IN
    SELECT DISTINCT o.obligation_month
    FROM public.contribution_obligations AS o
    WHERE o.group_id = v_group_id
      AND o.member_id = p_member_id
      AND o.contribution_type_id = v_monthly_type_id
      AND o.obligation_month <= v_cutoff
      AND o.obligation_month >= date_trunc('month', v_join_date)::date
    ORDER BY o.obligation_month
  LOOP
    SELECT fp.status
    INTO v_period_status
    FROM public.financial_periods AS fp
    WHERE fp.group_id = v_group_id
      AND fp.month = to_char(v_period.obligation_month, 'YYYY-MM')
    FOR UPDATE;

    IF lower(COALESCE(v_period_status, 'open')) = 'closed'
       AND EXISTS (
         SELECT 1
         FROM public.contribution_obligations AS o
         WHERE o.group_id = v_group_id
           AND o.member_id = p_member_id
           AND o.contribution_type_id = v_monthly_type_id
           AND o.obligation_month = v_period.obligation_month
           AND o.due_amount > (
             SELECT COALESCE(SUM(a.amount), 0)
             FROM public.contribution_allocations AS a
             WHERE a.obligation_id = o.id
           )
       )
    THEN
      RAISE EXCEPTION
        'Financial month % is closed and has outstanding obligation for this member',
        to_char(v_period.obligation_month, 'YYYY-MM');
    END IF;
  END LOOP;

  FOR v_payment IN
    SELECT c.id, c.amount
    FROM public.contributions AS c
    WHERE c.group_id = v_group_id
      AND c.member_id = p_member_id
      AND c.contribution_type = 'monthly'
      AND c.contribution_date <= v_cutoff
      AND c.amount > 0
    ORDER BY c.contribution_date, c.id
    FOR UPDATE
  LOOP
    v_payments_considered := v_payments_considered + 1;

    SELECT c.amount - COALESCE(SUM(a.amount), 0)
    INTO v_remaining
    FROM public.contributions AS c
    LEFT JOIN public.contribution_allocations AS a
      ON a.payment_id = c.id
    WHERE c.id = v_payment.id
    GROUP BY c.id, c.amount;

    IF v_remaining > 0 THEN
      v_payments_with_residual := v_payments_with_residual + 1;
    ELSE
      CONTINUE;
    END IF;

    FOR v_obligation IN
      SELECT
        o.id,
        o.obligation_month,
        o.due_amount,
        o.due_amount - COALESCE((
          SELECT SUM(a.amount)
          FROM public.contribution_allocations AS a
          WHERE a.obligation_id = o.id
        ), 0) AS outstanding
      FROM public.contribution_obligations AS o
      WHERE o.group_id = v_group_id
        AND o.member_id = p_member_id
        AND o.contribution_type_id = v_monthly_type_id
        AND o.obligation_month <= v_cutoff
        AND o.obligation_month >= date_trunc('month', v_join_date)::date
        AND o.due_amount > COALESCE((
          SELECT SUM(a.amount)
          FROM public.contribution_allocations AS a
          WHERE a.obligation_id = o.id
        ), 0)
      ORDER BY o.obligation_month, o.id
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_available := GREATEST(v_obligation.outstanding, 0);
      v_alloc_amount := LEAST(v_remaining, v_available);

      IF v_alloc_amount <= 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.contribution_allocations (
        payment_id,
        obligation_id,
        amount
      )
      VALUES (
        v_payment.id,
        v_obligation.id,
        v_alloc_amount
      )
      ON CONFLICT (payment_id, obligation_id) DO NOTHING;

      IF FOUND THEN
        v_allocations_created := v_allocations_created + 1;
        v_remaining := v_remaining - v_alloc_amount;
      END IF;
    END LOOP;
  END LOOP;

  SELECT
    COALESCE(SUM(o.due_amount), 0),
    COALESCE(SUM(oa.allocated_amount), 0)
  INTO v_total_due, v_total_allocated
  FROM public.contribution_obligations AS o
  LEFT JOIN (
    SELECT a.obligation_id, SUM(a.amount) AS allocated_amount
    FROM public.contribution_allocations AS a
    GROUP BY a.obligation_id
  ) AS oa ON oa.obligation_id = o.id
  WHERE o.group_id = v_group_id
    AND o.member_id = p_member_id
    AND o.contribution_type_id = v_monthly_type_id
    AND o.obligation_month <= v_cutoff;

  v_arrears := GREATEST(v_total_due - v_total_allocated, 0);

  SELECT COALESCE(SUM(
    GREATEST(c.amount - COALESCE(a.allocated_amount, 0), 0)
  ), 0)
  INTO v_credit
  FROM public.contributions AS c
  LEFT JOIN (
    SELECT a.payment_id, SUM(a.amount) AS allocated_amount
    FROM public.contribution_allocations AS a
    GROUP BY a.payment_id
  ) AS a ON a.payment_id = c.id
  WHERE c.group_id = v_group_id
    AND c.member_id = p_member_id
    AND c.contribution_type = 'monthly'
    AND c.contribution_date <= v_cutoff
    AND c.amount > 0;

  IF v_arrears > 0 THEN
    v_status := 'ARREARS';
  ELSIF v_credit > 0 THEN
    v_status := 'CREDIT';
  ELSE
    v_status := 'UP_TO_DATE';
  END IF;

  RETURN QUERY
  SELECT
    p_member_id,
    v_group_id,
    v_payments_considered,
    v_payments_with_residual,
    v_allocations_created,
    round(v_total_due, 2),
    round(v_total_allocated, 2),
    round(v_arrears, 2),
    round(v_credit, 2),
    v_status,
    v_reconciled_through;
END;
$function$;
grant execute on function public.reconcile_member_historical_payments(uuid,date) to authenticated;
notify pgrst, 'reload schema';
commit;