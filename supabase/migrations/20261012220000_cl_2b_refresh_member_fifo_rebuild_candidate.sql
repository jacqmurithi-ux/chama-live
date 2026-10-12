-- Candidate-reviewed FIFO rebuild for canonical monthly allocations.
-- This migration is source-controlled on main, but MUST NOT be applied to
-- production until the authenticated UI/export and four-member reconciliation
-- release gates have passed and production deployment is separately authorized.
--
-- Rebuild only allocations from monthly payments to rule-backed monthly
-- obligations. Existing allocations from those payments to custom/non-monthly
-- obligations are retained. The function's existing advisory/accounting locks
-- and post-rebuild cross-member, payment-total and obligation-total checks remain.
DO $migration$
DECLARE
  v_def text;
  v_original text;
  v_monthly_cte_anchor text := '  WITH monthly_payments AS (';
  v_obligation_anchor text := '      AND o.obligation_month <= v_effective_through_month';
  v_rule_filter text := E'      AND o.obligation_month <= v_effective_through_month\n      AND o.rule_id IS NOT NULL';
  v_delete_block text := $sql$  -- Rebuild only rule-backed monthly allocations.
  -- Preserve custom/non-monthly allocations and subtract them from payment
  -- capacity when monthly allocations are recalculated below.
  DELETE FROM public.contribution_allocations a
  USING public.contributions p, public.contribution_obligations o
  WHERE a.payment_id = p.id
    AND a.obligation_id = o.id
    AND p.group_id = v_group_id
    AND p.member_id = p_member_id
    AND lower(trim(coalesce(p.contribution_type, ''))) = 'monthly'
    AND o.group_id = v_group_id
    AND o.member_id = p_member_id
    AND o.contribution_type_id = v_monthly_type_id
    AND o.rule_id IS NOT NULL;

$sql$;
  v_old_insert text := $old$  INSERT INTO public.contribution_allocations (payment_id, obligation_id, amount)
  SELECT m.payment_id, m.obligation_id, m.allocation_amount
  FROM matches m
  WHERE NOT EXISTS ($old$;
  v_new_insert text := $new$  INSERT INTO public.contribution_allocations (
    group_id, member_id, payment_id, obligation_id, allocated_amount, amount
  )
  SELECT v_group_id, p_member_id, m.payment_id, m.obligation_id,
         m.allocation_amount, m.allocation_amount
  FROM matches m
  WHERE NOT EXISTS ($new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.cl_2b_refresh_member(uuid,date)'::regprocedure
  ) INTO v_def;
  v_original := v_def;

  IF position(v_monthly_cte_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'FIFO migration aborted: monthly payment CTE anchor not found';
  END IF;

  IF position('DELETE FROM public.contribution_allocations a' IN v_def) = 0 THEN
    v_def := replace(v_def, v_monthly_cte_anchor, v_delete_block || v_monthly_cte_anchor);
  END IF;

  IF position(v_rule_filter IN v_def) = 0 THEN
    IF position(v_obligation_anchor IN v_def) = 0 THEN
      RAISE EXCEPTION 'FIFO migration aborted: monthly obligation anchor not found';
    END IF;
    v_def := replace(v_def, v_obligation_anchor, v_rule_filter);
  END IF;

  IF position(v_old_insert IN v_def) > 0 THEN
    v_def := replace(v_def, v_old_insert, v_new_insert);
  ELSIF position(v_new_insert IN v_def) = 0 THEN
    RAISE EXCEPTION 'FIFO migration aborted: allocation INSERT shape was not recognized';
  END IF;

  -- Safe re-run: if all three fixes are already present, leave the function
  -- unchanged rather than failing or rewriting an already-correct definition.
  IF v_def = v_original THEN
    RETURN;
  END IF;

  EXECUTE v_def;
END
$migration$;
