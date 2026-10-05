/*
  CHAMA LIVE — v1.3M
  Replacement accounting-trigger implementation candidate.

  STATUS:
    Git-only implementation artifact.
    NOT AUTHORIZED FOR PRODUCTION EXECUTION.

  Scope:
    - replace legacy closed-period contribution protection
    - replace contribution-allocation lineage/balance protection
    - retire initiative-specific monthly payment-domain trigger
    - preserve existing Other-obligation lineage trigger

  v1.3L contract:
    ACCOUNTING → FINANCIAL PERIOD → PAYMENT → OBLIGATION/FINE
    No Initiative semantics in replacement guards.
*/

BEGIN;

-- ================================================================
-- A. CLOSED-PERIOD GUARD
-- ================================================================

CREATE OR REPLACE FUNCTION public.cl_guard_open_financial_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_group_id uuid;
  v_lock_start date;
  v_lock_end date;
  v_status text;
  v_month date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_group_id := NEW.group_id;

    IF NEW.contribution_date IS NULL THEN
      RAISE EXCEPTION 'Contribution date is required for accounting-period protection';
    END IF;

    SELECT date_trunc('month', NEW.contribution_date)::date
      INTO v_month;

  ELSIF TG_OP = 'DELETE' THEN
    v_group_id := OLD.group_id;

    IF OLD.contribution_date IS NULL THEN
      RAISE EXCEPTION 'Contribution date is required for accounting-period protection';
    END IF;

    SELECT date_trunc('month', OLD.contribution_date)::date
      INTO v_month;

  ELSE
    IF OLD.group_id IS DISTINCT FROM NEW.group_id THEN
      RAISE EXCEPTION 'Contribution group cannot be changed';
    END IF;

    v_group_id := NEW.group_id;

    IF OLD.contribution_date IS NULL OR NEW.contribution_date IS NULL THEN
      RAISE EXCEPTION 'Contribution date is required for accounting-period protection';
    END IF;

    SELECT MIN(x.month_start), MAX(x.month_start)
      INTO v_lock_start, v_lock_end
    FROM (
      VALUES
        (date_trunc('month', OLD.contribution_date)::date),
        (date_trunc('month', NEW.contribution_date)::date)
    ) AS x(month_start);

    PERFORM public.cl_2b_accounting_lock_range(
      v_group_id,
      v_lock_start,
      v_lock_end
    );

    -- Existing periods are locked only after accounting serialization.
    -- Missing periods are intentionally treated as open and are never created.
    FOR v_status IN
      SELECT fp.status
      FROM public.financial_periods fp
      WHERE fp.group_id = v_group_id
        AND fp.month BETWEEN v_lock_start AND v_lock_end
      ORDER BY fp.month
      FOR UPDATE
    LOOP
      IF lower(COALESCE(v_status, 'open')) = 'closed' THEN
        RAISE EXCEPTION
          'Financial month is closed. Contributions cannot be changed.';
      END IF;
    END LOOP;

    RETURN NEW;
  END IF;

  v_lock_start := v_month;
  v_lock_end := v_month;

  PERFORM public.cl_2b_accounting_lock_range(
    v_group_id,
    v_lock_start,
    v_lock_end
  );

  SELECT fp.status
    INTO v_status
  FROM public.financial_periods fp
  WHERE fp.group_id = v_group_id
    AND fp.month = v_month
  FOR UPDATE;

  IF lower(COALESCE(v_status, 'open')) = 'closed' THEN
    RAISE EXCEPTION
      'Financial month % is closed. Contributions cannot be changed.',
      to_char(v_month, 'YYYY-MM');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;


-- ================================================================
-- B. CONTRIBUTION-ALLOCATION GUARD
-- ================================================================

CREATE OR REPLACE FUNCTION public.cl_guard_contribution_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_group_id uuid;
  v_lock_start date;
  v_lock_end date;

  v_payment_id uuid;
  v_obligation_id uuid;

  v_payment_group_id uuid;
  v_payment_member_id uuid;
  v_payment_amount numeric;

  v_obligation_group_id uuid;
  v_obligation_member_id uuid;
  v_obligation_due numeric;

  v_payment_allocated numeric;
  v_fine_allocated numeric;
  v_obligation_allocated numeric;

  v_post_payment_allocated numeric;
  v_post_obligation_allocated numeric;

  v_status text;
  v_month date;
BEGIN
  /*
    Pre-lock discovery only.
    No payment/obligation FOR UPDATE occurs before the accounting boundary.
  */
  SELECT p.group_id
    INTO v_group_id
  FROM public.contributions p
  WHERE p.id = NEW.payment_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Allocation payment does not exist';
  END IF;

  -- Every affected payment and obligation must remain in the same group.
  -- This is checked before the accounting envelope is acquired so a
  -- cross-group UPDATE cannot lock only the NEW group.
  IF EXISTS (
    SELECT 1
    FROM public.contributions c
    WHERE c.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.payment_id ELSE NULL END, NEW.payment_id)
      AND c.group_id IS DISTINCT FROM v_group_id
  ) THEN
    RAISE EXCEPTION
      'Allocation payment targets must belong to the same group';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contribution_obligations o
    WHERE o.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.obligation_id ELSE NULL END, NEW.obligation_id)
      AND o.group_id IS DISTINCT FROM v_group_id
  ) THEN
    RAISE EXCEPTION
      'Allocation obligation targets must belong to the same group';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contributions c
    WHERE c.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.payment_id ELSE NULL END, NEW.payment_id)
      AND c.contribution_date IS NULL
  ) THEN
    RAISE EXCEPTION
      'All affected allocation payments require contribution_date';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contribution_obligations o
    WHERE o.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.obligation_id ELSE NULL END, NEW.obligation_id)
      AND o.economic_month IS NULL
  ) THEN
    RAISE EXCEPTION
      'All affected allocation obligations require economic_month';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.contribution_obligations o
    WHERE o.id = NEW.obligation_id
  ) THEN
    RAISE EXCEPTION 'Allocation obligation does not exist';
  END IF;

  SELECT MIN(x.month_start), MAX(x.month_start)
    INTO v_lock_start, v_lock_end
  FROM (
    SELECT date_trunc('month', p.contribution_date)::date AS month_start
    FROM public.contributions p
    WHERE p.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.payment_id ELSE NULL END, NEW.payment_id)
      AND TG_OP = 'UPDATE'

    UNION

    SELECT date_trunc('month', p.contribution_date)::date
    FROM public.contributions p
    WHERE p.id = NEW.payment_id

    UNION

    SELECT o.economic_month
    FROM public.contribution_obligations o
    WHERE o.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.obligation_id ELSE NULL END, NEW.obligation_id)
      AND TG_OP = 'UPDATE'

    UNION

    SELECT o.economic_month
    FROM public.contribution_obligations o
    WHERE o.id = NEW.obligation_id
  ) x
  WHERE x.month_start IS NOT NULL;

  IF v_lock_start IS NULL OR v_lock_end IS NULL THEN
    RAISE EXCEPTION 'Unable to determine complete accounting envelope for allocation';
  END IF;

  PERFORM public.cl_2b_accounting_lock_range(
    v_group_id,
    v_lock_start,
    v_lock_end
  );

  /*
    Existing financial-period rows are locked after accounting
    serialization. Missing rows are open for mutation and are not created.
  */
  FOR v_month IN
    SELECT DISTINCT x.month_start
    FROM (
      SELECT date_trunc('month', p.contribution_date)::date AS month_start
      FROM public.contributions p
      WHERE p.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.payment_id ELSE NULL END, NEW.payment_id)
        AND TG_OP = 'UPDATE'

      UNION
      SELECT date_trunc('month', p.contribution_date)::date
      FROM public.contributions p
      WHERE p.id = NEW.payment_id

      UNION
      SELECT o.economic_month
      FROM public.contribution_obligations o
      WHERE o.id IN (CASE WHEN TG_OP = 'UPDATE' THEN OLD.obligation_id ELSE NULL END, NEW.obligation_id)
        AND TG_OP = 'UPDATE'

      UNION
      SELECT o.economic_month
      FROM public.contribution_obligations o
      WHERE o.id = NEW.obligation_id
    ) x
    WHERE x.month_start IS NOT NULL
    ORDER BY x.month_start
  LOOP
    SELECT fp.status
      INTO v_status
    FROM public.financial_periods fp
    WHERE fp.group_id = v_group_id
      AND fp.month = v_month
    FOR UPDATE;

    IF lower(COALESCE(v_status, 'open')) = 'closed' THEN
      RAISE EXCEPTION
        'Allocation cannot affect closed financial month %',
        to_char(v_month, 'YYYY-MM');
    END IF;
  END LOOP;

  /*
    Deterministic payment locks: all affected OLD/NEW payment targets.
  */
  FOR v_payment_id IN
    SELECT DISTINCT payment_id
    FROM (
      SELECT CASE WHEN TG_OP = 'UPDATE' THEN OLD.payment_id ELSE NULL END AS payment_id
      UNION
      SELECT NEW.payment_id
    ) p
    WHERE payment_id IS NOT NULL
    ORDER BY payment_id
  LOOP
    SELECT c.group_id, c.member_id, c.amount
      INTO v_payment_group_id, v_payment_member_id, v_payment_amount
    FROM public.contributions c
    WHERE c.id = v_payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Affected allocation payment % does not exist', v_payment_id;
    END IF;

    SELECT COALESCE(SUM(a.amount), 0)
      INTO v_payment_allocated
    FROM public.contribution_allocations a
    WHERE a.payment_id = v_payment_id;

    SELECT COALESCE(SUM(fpa.allocated_amount), 0)
      INTO v_fine_allocated
    FROM public.fine_payment_allocations fpa
    WHERE fpa.payment_id = v_payment_id;

    v_post_payment_allocated :=
      v_payment_allocated
      - CASE
          WHEN TG_OP = 'UPDATE' THEN
            CASE WHEN OLD.payment_id = v_payment_id THEN OLD.amount ELSE 0 END
          ELSE 0
        END
      + CASE
          WHEN NEW.payment_id = v_payment_id
          THEN NEW.amount
          ELSE 0
        END;

    IF v_post_payment_allocated < 0 THEN
      RAISE EXCEPTION 'Allocation mutation produces negative payment allocation balance';
    END IF;

    IF v_post_payment_allocated + v_fine_allocated > v_payment_amount THEN
      RAISE EXCEPTION
        'Allocation exceeds available payment balance for payment %',
        v_payment_id;
    END IF;
  END LOOP;

  /*
    Deterministic obligation locks: all affected OLD/NEW obligation targets.
  */
  FOR v_obligation_id IN
    SELECT DISTINCT obligation_id
    FROM (
      SELECT CASE WHEN TG_OP = 'UPDATE' THEN OLD.obligation_id ELSE NULL END AS obligation_id
      UNION
      SELECT NEW.obligation_id
    ) o
    WHERE obligation_id IS NOT NULL
    ORDER BY obligation_id
  LOOP
    SELECT o.group_id, o.member_id, o.due_amount
      INTO v_obligation_group_id, v_obligation_member_id, v_obligation_due
    FROM public.contribution_obligations o
    WHERE o.id = v_obligation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Affected allocation obligation % does not exist',
        v_obligation_id;
    END IF;

    SELECT COALESCE(SUM(a.amount), 0)
      INTO v_obligation_allocated
    FROM public.contribution_allocations a
    WHERE a.obligation_id = v_obligation_id;

    v_post_obligation_allocated :=
      v_obligation_allocated
      - CASE
          WHEN TG_OP = 'UPDATE' THEN
            CASE WHEN OLD.obligation_id = v_obligation_id THEN OLD.amount ELSE 0 END
          ELSE 0
        END
      + CASE
          WHEN NEW.obligation_id = v_obligation_id
          THEN NEW.amount
          ELSE 0
        END;

    IF v_post_obligation_allocated < 0 THEN
      RAISE EXCEPTION
        'Allocation mutation produces negative obligation allocation balance';
    END IF;

    IF v_post_obligation_allocated > v_obligation_due THEN
      RAISE EXCEPTION
        'Allocation exceeds obligation balance for obligation %',
        v_obligation_id;
    END IF;
  END LOOP;

  /*
    Authoritative NEW lineage validation after all relevant row locks.
  */
  SELECT c.group_id, c.member_id, c.amount
    INTO v_payment_group_id, v_payment_member_id, v_payment_amount
  FROM public.contributions c
  WHERE c.id = NEW.payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation payment does not exist';
  END IF;

  SELECT o.group_id, o.member_id, o.due_amount
    INTO v_obligation_group_id, v_obligation_member_id, v_obligation_due
  FROM public.contribution_obligations o
  WHERE o.id = NEW.obligation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation obligation does not exist';
  END IF;

  IF v_payment_group_id IS DISTINCT FROM v_obligation_group_id
     OR v_payment_member_id IS DISTINCT FROM v_obligation_member_id
  THEN
    RAISE EXCEPTION
      'Contribution allocation payment and obligation must belong to the same group and member';
  END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Contribution allocation amount must be greater than zero';
  END IF;

  /*
    The authoritative post-lock months must remain inside the acquired
    accounting envelope. No second accounting lock is permitted.
  */
  SELECT date_trunc('month', c.contribution_date)::date
    INTO v_month
  FROM public.contributions c
  WHERE c.id = NEW.payment_id;

  IF v_month < v_lock_start OR v_month > v_lock_end THEN
    RAISE EXCEPTION
      'Authoritative payment month expanded outside the acquired accounting envelope';
  END IF;

  SELECT o.economic_month
    INTO v_month
  FROM public.contribution_obligations o
  WHERE o.id = NEW.obligation_id;

  IF v_month < v_lock_start OR v_month > v_lock_end THEN
    RAISE EXCEPTION
      'Authoritative obligation month expanded outside the acquired accounting envelope';
  END IF;

  RETURN NEW;
END;
$function$;


-- ================================================================
-- C. TRIGGER REPLACEMENT
-- ================================================================

DROP TRIGGER IF EXISTS trg_validate_monthly_payment_domain
  ON public.contributions;

DROP TRIGGER IF EXISTS prevent_closed_month_contribution_trigger
  ON public.contributions;

CREATE TRIGGER trg_cl_guard_open_financial_period
BEFORE INSERT OR UPDATE OR DELETE
ON public.contributions
FOR EACH ROW
EXECUTE FUNCTION public.cl_guard_open_financial_period();

DROP TRIGGER IF EXISTS trg_cl_guard_contribution_allocation
  ON public.contribution_allocations;

CREATE TRIGGER trg_cl_guard_contribution_allocation
BEFORE INSERT OR UPDATE
ON public.contribution_allocations
FOR EACH ROW
EXECUTE FUNCTION public.cl_guard_contribution_allocation();

-- NOTE:
-- trg_cl_other_obligation_lineage is intentionally preserved.
-- validate_monthly_payment_domain() is intentionally NOT replaced by
-- another contribution_type/initiative domain rule.


-- ================================================================
-- D. VERIFICATION QUERIES — REVIEW ONLY
-- ================================================================

-- These are intentionally comments in the migration artifact.
-- They are to be run separately during pre/post deployment review.
--
-- SELECT tgname, pg_get_triggerdef(oid)
-- FROM pg_trigger
-- WHERE tgrelid IN (
--   'public.contributions'::regclass,
--   'public.contribution_allocations'::regclass
-- )
-- AND NOT tgisinternal
-- ORDER BY tgrelid::text, tgname;
--
-- SELECT count(*) FROM public.contributions WHERE initiative_id IS NOT NULL;
--
-- SELECT count(*)
-- FROM public.contribution_allocations a
-- JOIN public.contributions p ON p.id = a.payment_id
-- JOIN public.contribution_obligations o ON o.id = a.obligation_id
-- WHERE p.group_id IS DISTINCT FROM o.group_id
--    OR p.member_id IS DISTINCT FROM o.member_id;
--
-- SELECT a.payment_id,
--        SUM(a.amount) AS contribution_allocated,
--        COALESCE(f.fine_allocated,0) AS fine_allocated,
--        p.amount
-- FROM public.contribution_allocations a
-- JOIN public.contributions p ON p.id = a.payment_id
-- LEFT JOIN (
--   SELECT payment_id, SUM(allocated_amount) AS fine_allocated
--   FROM public.fine_payment_allocations
--   GROUP BY payment_id
-- ) f ON f.payment_id = p.id
-- GROUP BY a.payment_id, p.amount, f.fine_allocated
-- HAVING SUM(a.amount) + COALESCE(f.fine_allocated,0) > p.amount;

COMMIT;
