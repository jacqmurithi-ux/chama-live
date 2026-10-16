-- STAGE ONLY: bundled function source definitions, production catalog captured 2026-10-14.
-- Alphabetical inventory order, not dependency order. Install after tables and before views/triggers.
-- This file is a source bundle, not an executable final migration by itself.

-- STAGE ONLY: production function definitions; ordinal rows 51-60 of 201.
-- Definitions captured read-only on 2026-10-14. Ordering is alphabetical, NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects must be reconciled separately.

CREATE OR REPLACE FUNCTION public.cl_group_support_cases_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$


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
      AND fp.month = to_char(v_month, 'YYYY-MM')
    FOR UPDATE;

    IF lower(COALESCE(v_status, 'open')) = 'closed' THEN
      RAISE EXCEPTION
        'Allocation cannot affect closed financial month %',
        to_char(v_month, 'YYYY-MM');
    END IF;
  END LOOP;

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

    IF v_payment_group_id IS DISTINCT FROM v_group_id THEN
      RAISE EXCEPTION 'Affected allocation payment % changed group during validation', v_payment_id;
    END IF;
  END LOOP;

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
      RAISE EXCEPTION 'Affected allocation obligation % does not exist', v_obligation_id;
    END IF;

    IF v_obligation_group_id IS DISTINCT FROM v_group_id THEN
      RAISE EXCEPTION 'Affected allocation obligation % changed group during validation', v_obligation_id;
    END IF;
  END LOOP;

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
$function$


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

    FOR v_status IN
      SELECT fp.status
      FROM public.financial_periods fp
      WHERE fp.group_id = v_group_id
        AND fp.month BETWEEN
          to_char(v_lock_start, 'YYYY-MM')
          AND to_char(v_lock_end, 'YYYY-MM')
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
    AND fp.month = to_char(v_month, 'YYYY-MM')
  FOR UPDATE;

  IF lower(COALESCE(v_status, 'open')) = 'closed' THEN
    RAISE EXCEPTION
      'Financial month % is closed. Contributions cannot be changed.',
      to_char(v_month, 'YYYY-MM');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_import_financial_batch_atomic(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_batch public.data_import_batches%rowtype;
  v_row public.data_import_rows%rowtype;
  v_imported integer:=0;
  v_contributions integer:=0;
  v_expenses integer:=0;
  v_total_amount numeric:=0;
  v_target_id uuid;
  v_payment_result jsonb;
  v_normalized jsonb;
  v_member_id uuid;
  v_group_id uuid;
  v_amount numeric;
  v_contribution_date date;
  v_contribution_type text;
  v_payment_method text;
  v_reference text;
  v_mpesa_reference text;
  v_goal_id uuid;
  v_notes text;
  v_expense_description text;
  v_expense_date date;
  v_expense_category text;
  v_expense_status text;
  v_receipt_url text;
  v_idempotency_key uuid;
  v_month text;
  v_expected_count integer;
  v_actual_count integer;
  v_expected_amount numeric;
  v_actual_amount numeric;
  v_finance_member_id uuid;
  v_existing public.expenses%rowtype;
  v_lock_start date;
  v_lock_end date;
  v_member_join date;
  v_member_horizon date;
  v_initial_lock_end date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'Batch id is required';
  END IF;

  SELECT b.*
    INTO v_batch
  FROM public.data_import_batches b
  WHERE b.id=p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import batch not found';
  END IF;

  v_group_id:=v_batch.group_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Import batch has no group';
  END IF;

  IF NOT public.cl_user_has_role(
    v_group_id,
    ARRAY['admin','chairperson','treasurer']::text[]
  ) THEN
    RAISE EXCEPTION 'Finance authorization required';
  END IF;

  IF lower(coalesce(v_batch.status,''))='completed' THEN
    RETURN jsonb_build_object(
      'ok',true,
      'idempotent_replay',true,
      'batch_id',p_batch_id,
      'group_id',v_group_id,
      'status',v_batch.status,
      'summary',v_batch.summary
    );
  END IF;

  IF lower(coalesce(v_batch.status,'')) NOT IN ('ready','failed') THEN
    RAISE EXCEPTION
      'Batch status % is not importable',v_batch.status;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
      AND lower(coalesce(r.status,''))='imported'
  ) THEN
    RAISE EXCEPTION
      'Batch contains previously imported rows; reconcile it before atomic import';
  END IF;

  PERFORM 1
  FROM public.data_import_rows r
  WHERE r.batch_id=p_batch_id
  ORDER BY r.source_row_number NULLS LAST,r.id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
  ) THEN
    RAISE EXCEPTION 'Import batch contains no rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
      AND lower(r.entity_type)
          NOT IN ('contribution','expense')
  ) THEN
    RAISE EXCEPTION 'Batch contains unsupported entity type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
      AND lower(coalesce(r.status,''))
          NOT IN ('valid','warning')
  ) THEN
    RAISE EXCEPTION
      'Every import row must be validated before atomic import';
  END IF;

  -- Validate every normalized row without accounting mutation.
  FOR v_row IN
    SELECT r.*
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
    ORDER BY r.source_row_number NULLS LAST,r.id
  LOOP
    v_normalized:=coalesce(v_row.normalized_data,'{}'::jsonb);

    IF lower(v_row.entity_type)='contribution' THEN
      BEGIN
        v_member_id:=nullif(
          v_normalized->>'member_id',''
        )::uuid;
        v_amount:=nullif(
          v_normalized->>'amount',''
        )::numeric;
        v_contribution_date:=nullif(
          v_normalized->>'contribution_date',''
        )::date;
        v_contribution_type:=coalesce(
          nullif(trim(v_normalized->>'contribution_type'),''),
          'monthly'
        );
        v_payment_method:=nullif(
          trim(v_normalized->>'payment_method'),''
        );
        v_reference:=nullif(
          trim(v_normalized->>'reference'),''
        );
        v_mpesa_reference:=nullif(
          trim(v_normalized->>'mpesa_reference'),''
        );
        v_goal_id:=nullif(
          v_normalized->>'goal_id',''
        )::uuid;
        v_notes:=nullif(v_normalized->>'notes','');
        v_idempotency_key:=nullif(
          v_normalized->>'__idempotency_key',''
        )::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION
          'Row % contains invalid normalized UUID/date/numeric data',
          v_row.source_row_number;
      END;

      IF v_member_id IS NULL
         OR v_amount IS NULL
         OR v_amount<=0
         OR v_contribution_date IS NULL
         OR v_idempotency_key IS NULL
      THEN
        RAISE EXCEPTION
          'Row % has incomplete contribution data',
          v_row.source_row_number;
      END IF;

      IF lower(v_contribution_type)<>'monthly' THEN
        RAISE EXCEPTION
          'Row % is not a monthly contribution',
          v_row.source_row_number;
      END IF;

      IF v_payment_method NOT IN
         ('M-Pesa','Cash','Bank transfer')
      THEN
        RAISE EXCEPTION
          'Row % has invalid payment method',
          v_row.source_row_number;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.members m
        WHERE m.id=v_member_id
          AND m.group_id=v_group_id
      ) THEN
        RAISE EXCEPTION
          'Row % member does not belong to batch group',
          v_row.source_row_number;
      END IF;

      IF v_goal_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.contribution_goals cg
           WHERE cg.id=v_goal_id
             AND cg.group_id=v_group_id
         )
      THEN
        RAISE EXCEPTION
          'Row % goal does not belong to batch group',
          v_row.source_row_number;
      END IF;

      IF v_payment_method='M-Pesa'
         AND v_reference IS NOT NULL
         AND v_mpesa_reference IS NOT NULL
         AND v_reference IS DISTINCT FROM v_mpesa_reference
      THEN
        RAISE EXCEPTION
          'Row % has conflicting M-Pesa references',
          v_row.source_row_number;
      END IF;

      IF v_payment_method<>'M-Pesa'
         AND v_mpesa_reference IS NOT NULL
      THEN
        RAISE EXCEPTION
          'Row % has M-Pesa reference on non-M-Pesa payment',
          v_row.source_row_number;
      END IF;

    ELSE
      BEGIN
        v_amount:=nullif(
          v_normalized->>'amount',''
        )::numeric;
        v_expense_date:=nullif(
          v_normalized->>'date',''
        )::date;
        v_expense_description:=nullif(
          trim(v_normalized->>'description'),''
        );
        v_expense_category:=coalesce(
          nullif(trim(v_normalized->>'category'),''),
          'other'
        );
        v_expense_status:=coalesce(
          nullif(trim(v_normalized->>'approval_status'),''),
          'pending'
        );
        v_receipt_url:=nullif(
          v_normalized->>'receipt_url',''
        );
        v_idempotency_key:=nullif(
          v_normalized->>'__idempotency_key',''
        )::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION
          'Row % contains invalid normalized UUID/date/numeric data',
          v_row.source_row_number;
      END;

      IF v_expense_description IS NULL
         OR v_amount IS NULL
         OR v_amount<=0
         OR v_expense_date IS NULL
         OR v_idempotency_key IS NULL
      THEN
        RAISE EXCEPTION
          'Row % has incomplete expense data',
          v_row.source_row_number;
      END IF;

      IF v_expense_status NOT IN
         ('pending','approved','rejected')
      THEN
        RAISE EXCEPTION
          'Row % has invalid expense approval status',
          v_row.source_row_number;
      END IF;
    END IF;
  END LOOP;

  -- Determine the complete accounting lock envelope before taking
  -- any accounting-month locks.  A contribution can cause
  -- cl_2b_refresh_member() to rewrite allocations from the member's
  -- join month through the safe rebuild horizon, not merely the
  -- payment month.  Use one continuous group/month envelope so every
  -- delegated payment writer acquires a compatible lock set.
  v_lock_start:=NULL;
  v_lock_end:=NULL;

  FOR v_row IN
    SELECT r.*
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
      AND lower(r.entity_type)='contribution'
    ORDER BY
      nullif(r.normalized_data->>'member_id','')::uuid,
      (r.normalized_data->>'contribution_date')::date,
      r.source_row_number NULLS LAST,
      r.id
  LOOP
    v_member_id:=(v_row.normalized_data->>'member_id')::uuid;
    v_contribution_date:=
      (v_row.normalized_data->>'contribution_date')::date;

    SELECT m.join_date
      INTO v_member_join
    FROM public.members m
    WHERE m.id=v_member_id
      AND m.group_id=v_group_id;

    IF v_member_join IS NULL THEN
      v_member_join:=v_contribution_date;
    END IF;

    SELECT greatest(
      v_contribution_date,
      coalesce(
        (
          SELECT max(c.contribution_date)
          FROM public.contributions c
          WHERE c.group_id=v_group_id
            AND c.member_id=v_member_id
            AND lower(coalesce(c.contribution_type,''))='monthly'
        ),
        v_contribution_date
      ),
      coalesce(
        (
          SELECT max(o.obligation_month)
          FROM public.contribution_obligations o
          WHERE o.group_id=v_group_id
            AND o.member_id=v_member_id
        ),
        v_contribution_date
      )
    )
    INTO v_member_horizon;

    v_lock_start:=least(
      coalesce(v_lock_start,date_trunc('month',v_member_join)::date),
      date_trunc('month',v_member_join)::date
    );
    v_lock_end:=greatest(
      coalesce(v_lock_end,date_trunc('month',v_member_horizon)::date),
      date_trunc('month',v_member_horizon)::date
    );
  END LOOP;

  -- Expenses do not rebuild contribution allocations, but their own
  -- accounting month must still participate in the same deterministic
  -- group/month lock envelope.
  SELECT least(
           coalesce(v_lock_start,min_month),
           min_month
         ),
         greatest(
           coalesce(v_lock_end,max_month),
           max_month
         )
    INTO v_lock_start,v_lock_end
  FROM (
    SELECT
      min(
        CASE
          WHEN lower(r.entity_type)='contribution'
            THEN date_trunc(
              'month',
              (r.normalized_data->>'contribution_date')::date
            )::date
          ELSE date_trunc(
            'month',
            (r.normalized_data->>'date')::date
          )::date
        END
      ) AS min_month,
      max(
        CASE
          WHEN lower(r.entity_type)='contribution'
            THEN date_trunc(
              'month',
              (r.normalized_data->>'contribution_date')::date
            )::date
          ELSE date_trunc(
            'month',
            (r.normalized_data->>'date')::date
          )::date
        END
      ) AS max_month
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
  ) s;

  IF v_lock_start IS NULL OR v_lock_end IS NULL THEN
    RAISE EXCEPTION 'Could not determine batch accounting lock envelope';
  END IF;

  -- Acquire the complete envelope in ascending month order before
  -- period decisions or any accounting mutation.
  v_initial_lock_end:=v_lock_end;

  PERFORM public.cl_2b_accounting_lock_range(
    v_group_id,
    v_lock_start,
    v_initial_lock_end
  );

  -- Re-read every contribution member's horizon after the initial lock.
  -- This closes the wait-then-refresh gap: a later concurrent payment
  -- committed before this batch acquired the lock must remain inside the
  -- allocation rebuild envelope. Any required extension is forward-only.
  FOR v_row IN
    SELECT r.*
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
      AND lower(r.entity_type)='contribution'
    ORDER BY
      nullif(r.normalized_data->>'member_id','')::uuid,
      (r.normalized_data->>'contribution_date')::date,
      r.source_row_number NULLS LAST,
      r.id
  LOOP
    v_member_id:=(v_row.normalized_data->>'member_id')::uuid;
    v_contribution_date:=
      (v_row.normalized_data->>'contribution_date')::date;

    SELECT greatest(
      v_contribution_date,
      coalesce(
        (
          SELECT max(c.contribution_date)
          FROM public.contributions c
          WHERE c.group_id=v_group_id
            AND c.member_id=v_member_id
            AND lower(coalesce(c.contribution_type,''))='monthly'
        ),
        v_contribution_date
      ),
      coalesce(
        (
          SELECT max(o.obligation_month)
          FROM public.contribution_obligations o
          WHERE o.group_id=v_group_id
            AND o.member_id=v_member_id
        ),
        v_contribution_date
      )
    )
    INTO v_member_horizon;

    IF date_trunc('month',v_member_horizon)::date > v_initial_lock_end THEN
      PERFORM public.cl_2b_accounting_lock_range(
        v_group_id,
        (v_initial_lock_end + interval '1 month')::date,
        date_trunc('month',v_member_horizon)::date
      );
      v_initial_lock_end:=date_trunc('month',v_member_horizon)::date;
    END IF;
  END LOOP;

  v_lock_end:=v_initial_lock_end;

  -- Establish/lock all periods only after all month locks exist.
  FOR v_month IN
    SELECT DISTINCT to_char(
      CASE
        WHEN lower(r.entity_type)='contribution'
          THEN (r.normalized_data->>'contribution_date')::date
        ELSE (r.normalized_data->>'date')::date
      END,
      'YYYY-MM'
    )
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
    ORDER BY 1
  LOOP
    PERFORM public.ensure_financial_period(
      v_group_id,v_month
    );

    PERFORM 1
    FROM public.financial_periods fp
    WHERE fp.group_id=v_group_id
      AND fp.month=v_month
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM public.financial_periods fp
      WHERE fp.group_id=v_group_id
        AND fp.month=v_month
        AND lower(coalesce(fp.status,'open'))='closed'
    ) THEN
      RAISE EXCEPTION
        'Batch contains rows targeting closed financial period %',
        v_month;
    END IF;
  END LOOP;

  SELECT m.id
    INTO v_finance_member_id
  FROM public.members m
  WHERE m.group_id=v_group_id
    AND (m.user_id=auth.uid() OR m.auth_user_id=auth.uid())
    AND lower(coalesce(m.status,'active'))='active'
    AND lower(coalesce(m.onboarding_status,'active'))='active'
    AND lower(coalesce(m.role,'member')) =
        ANY(
          ARRAY[
            'admin','chairperson','secretary','treasurer'
          ]::text[]
        )
  ORDER BY
    CASE WHEN m.auth_user_id=auth.uid() THEN 0 ELSE 1 END,
    m.id
  LIMIT 1;

  IF v_finance_member_id IS NULL THEN
    RAISE EXCEPTION
      'Authenticated finance member could not be resolved';
  END IF;

  UPDATE public.data_import_batches
  SET status='importing',
      started_at=coalesce(started_at,now()),
      completed_at=NULL
  WHERE id=p_batch_id;

  FOR v_row IN
    SELECT r.*
    FROM public.data_import_rows r
    WHERE r.batch_id=p_batch_id
    ORDER BY r.source_row_number NULLS LAST,r.id
  LOOP
    v_normalized:=coalesce(v_row.normalized_data,'{}'::jsonb);

    IF lower(v_row.entity_type)='contribution' THEN
      v_member_id:=(v_normalized->>'member_id')::uuid;
      v_amount:=(v_normalized->>'amount')::numeric;
      v_contribution_date:=
        (v_normalized->>'contribution_date')::date;
      v_contribution_type:=coalesce(
        nullif(trim(v_normalized->>'contribution_type'),''),
        'monthly'
      );
      v_payment_method:=v_normalized->>'payment_method';
      v_reference:=nullif(
        trim(v_normalized->>'reference'),''
      );
      v_mpesa_reference:=nullif(
        trim(v_normalized->>'mpesa_reference'),''
      );
      v_goal_id:=nullif(
        v_normalized->>'goal_id',''
      )::uuid;
      v_notes:=nullif(v_normalized->>'notes','');
      v_idempotency_key:=
        (v_normalized->>'__idempotency_key')::uuid;

      v_payment_result:=public.cl_2b_record_contribution(
        p_payment_id=>v_idempotency_key,
        p_group_id=>v_group_id,
        p_member_id=>v_member_id,
        p_amount=>v_amount,
        p_contribution_date=>v_contribution_date,
        p_contribution_type=>v_contribution_type,
        p_payment_method=>v_payment_method,
        p_reference=>v_reference,
        p_mpesa_reference=>v_mpesa_reference,
        p_goal_id=>v_goal_id,
        p_notes=>v_notes
      );

      v_target_id:=coalesce(
        nullif(v_payment_result->>'payment_id','')::uuid,
        v_idempotency_key
      );

      IF NOT EXISTS (
        SELECT 1
        FROM public.contributions c
        WHERE c.id=v_target_id
          AND c.group_id=v_group_id
          AND c.member_id=v_member_id
          AND c.amount=v_amount
          AND c.contribution_date=v_contribution_date
      ) THEN
        RAISE EXCEPTION
          'Atomic verification failed for contribution row %',
          v_row.source_row_number;
      END IF;

      v_contributions:=v_contributions+1;

    ELSE
      v_amount:=(v_normalized->>'amount')::numeric;
      v_expense_date:=(v_normalized->>'date')::date;
      v_expense_description:=
        v_normalized->>'description';
      v_expense_category:=coalesce(
        nullif(trim(v_normalized->>'category'),''),
        'other'
      );
      v_expense_status:=coalesce(
        nullif(trim(v_normalized->>'approval_status'),''),
        'pending'
      );
      v_receipt_url:=nullif(
        v_normalized->>'receipt_url',''
      );
      v_idempotency_key:=
        (v_normalized->>'__idempotency_key')::uuid;

      SELECT e.*
        INTO v_existing
      FROM public.expenses e
      WHERE e.id=v_idempotency_key
      FOR UPDATE;

      IF FOUND THEN
        IF v_existing.group_id IS DISTINCT FROM v_group_id
           OR v_existing.description IS DISTINCT FROM
              v_expense_description
           OR v_existing.category IS DISTINCT FROM
              v_expense_category
           OR v_existing.amount IS DISTINCT FROM v_amount
           OR v_existing.date IS DISTINCT FROM v_expense_date
           OR v_existing.recorded_by IS DISTINCT FROM
              v_finance_member_id
           OR v_existing.receipt_url IS DISTINCT FROM
              v_receipt_url
           OR v_existing.approval_status IS DISTINCT FROM
              v_expense_status
        THEN
          RAISE EXCEPTION
            'Expense idempotency key already exists for a different expense';
        END IF;

        v_target_id:=v_existing.id;
      ELSE
        INSERT INTO public.expenses (
          id,group_id,description,category,amount,date,
          recorded_by,receipt_url,approval_status
        )
        VALUES (
          v_idempotency_key,v_group_id,v_expense_description,
          v_expense_category,v_amount,v_expense_date,
          v_finance_member_id,v_receipt_url,v_expense_status
        )
        RETURNING id INTO v_target_id;

        SELECT e.*
          INTO v_existing
        FROM public.expenses e
        WHERE e.id=v_target_id
        FOR UPDATE;

        IF v_existing.group_id IS DISTINCT FROM v_group_id
           OR v_existing.description IS DISTINCT FROM
              v_expense_description
           OR v_existing.category IS DISTINCT FROM
              v_expense_category
           OR v_existing.amount IS DISTINCT FROM v_amount
           OR v_existing.date IS DISTINCT FROM v_expense_date
           OR v_existing.recorded_by IS DISTINCT FROM
              v_finance_member_id
           OR v_existing.receipt_url IS DISTINCT FROM
              v_receipt_url
           OR v_existing.approval_status IS DISTINCT FROM
              v_expense_status
        THEN
          RAISE EXCEPTION
            'Atomic verification failed for expense row %',
            v_row.source_row_number;
        END IF;
      END IF;

      v_expenses:=v_expenses+1;
    END IF;

    UPDATE public.data_import_rows
    SET status='imported',
        target_id=v_target_id,
        error_message=NULL
    WHERE id=v_row.id
      AND batch_id=p_batch_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Could not mark import row % imported',
        v_row.source_row_number;
    END IF;

    v_imported:=v_imported+1;
    v_total_amount:=v_total_amount+v_amount;
  END LOOP;

  SELECT count(*),
         coalesce(
           sum((r.normalized_data->>'amount')::numeric),0
         )
    INTO v_expected_count,v_expected_amount
  FROM public.data_import_rows r
  WHERE r.batch_id=p_batch_id;

  SELECT count(*),
         coalesce(
           sum((r.normalized_data->>'amount')::numeric),0
         )
    INTO v_actual_count,v_actual_amount
  FROM public.data_import_rows r
  WHERE r.batch_id=p_batch_id
    AND lower(r.status)='imported'
    AND r.target_id IS NOT NULL;

  IF v_actual_count<>v_expected_count THEN
    RAISE EXCEPTION
      'Atomic staging verification failed: % of % rows imported',
      v_actual_count,v_expected_count;
  END IF;

  IF v_actual_amount IS DISTINCT FROM v_expected_amount THEN
    RAISE EXCEPTION
      'Atomic staging verification failed: amount mismatch';
  END IF;

  UPDATE public.data_import_batches
  SET status='completed',
      completed_at=now(),
      summary=jsonb_build_object(
        'candidate',true,
        'atomic',true,
        'entity_scope',
          jsonb_build_array('contribution','expense'),
        'total_rows',v_imported,
        'imported_rows',v_imported,
        'contributions',v_contributions,
        'expenses',v_expenses,
        'total_amount',v_total_amount
      )
  WHERE id=p_batch_id
    AND group_id=v_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Could not mark atomic batch completed';
  END IF;

  RETURN jsonb_build_object(
    'ok',true,
    'atomic',true,
    'idempotent_replay',false,
    'batch_id',p_batch_id,
    'group_id',v_group_id,
    'imported_rows',v_imported,
    'contributions',v_contributions,
    'expenses',v_expenses,
    'total_amount',v_total_amount
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_actor(p_group_id uuid, p_write boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not public.cl_group_module_enabled(p_group_id, 'loans') then
    raise exception 'Loans is disabled for this group' using errcode='42501';
  end if;
  select m.id into v_member_id from public.members m
  where m.group_id=p_group_id and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and lower(coalesce(m.status,'active'))='active' and lower(coalesce(m.onboarding_status,'active'))='active'
  order by m.created_at limit 1;
  if v_member_id is null then raise exception 'Active group membership required' using errcode='42501'; end if;
  if p_write and not public.cl_user_has_role(p_group_id,array['admin','chairperson','secretary','treasurer']::text[]) then
    raise exception 'View only: you do not have permission to manage loans' using errcode='42501';
  end if;
  return v_member_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_apply(p_group_id uuid, p_requested_amount numeric, p_period_months integer, p_purpose text, p_guarantor_member_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member_id uuid; v_settings public.loan_settings%rowtype; v_id uuid;
begin
  v_member_id := public.cl_loan_actor(p_group_id, false);
  if p_requested_amount is null or p_requested_amount <= 0 or p_period_months is null or p_period_months < 1
    or length(btrim(coalesce(p_purpose,''))) < 3 or length(btrim(p_purpose)) > 2000 then
    raise exception 'Enter a valid amount, period and purpose' using errcode='22023';
  end if;
  select * into v_settings from public.loan_settings where group_id=p_group_id;
  if not found then raise exception 'Loan settings have not been configured by the Admin' using errcode='P0002'; end if;
  if p_requested_amount > v_settings.max_loan_amount then raise exception 'Requested amount exceeds the group maximum' using errcode='22023'; end if;
  if p_period_months > v_settings.max_period_months then raise exception 'Requested period exceeds the group maximum' using errcode='22023'; end if;
  if p_guarantor_member_id is not null and not exists(select 1 from public.members m where m.id=p_guarantor_member_id
    and m.group_id=p_group_id and m.id<>v_member_id and m.status='active' and m.onboarding_status='active') then
    raise exception 'Guarantor must be another active member of this group' using errcode='22023';
  end if;
  insert into public.loan_applications(group_id,member_id,requested_amount,period_months,purpose,guarantor_member_id)
  values(p_group_id,v_member_id,p_requested_amount,p_period_months,btrim(p_purpose),p_guarantor_member_id)
  returning id into v_id;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_member_id,'submit_loan_application','loan_application',v_id::text,
    jsonb_build_object('requested_amount',p_requested_amount,'period_months',p_period_months));
  return v_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_disburse(p_group_id uuid, p_loan_id uuid, p_disbursed_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor_member_id uuid; v_loan public.loan_applications%rowtype; v_settings public.loan_settings%rowtype;
  v_i integer; v_principal numeric(14,2); v_interest numeric(14,2); v_opening numeric(14,2);
  v_principal_each numeric(14,2); v_remaining numeric(14,2); v_total_interest numeric(14,2);
  v_due date; v_schedule_total numeric(14,2);
begin
  v_actor_member_id := public.cl_loan_actor(p_group_id, true);
  if not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer']::text[]) then
    raise exception 'Only Admin, Chairperson or Treasurer can disburse an approved loan' using errcode='42501';
  end if;
  select * into v_loan from public.loan_applications where id=p_loan_id and group_id=p_group_id for update;
  if not found then raise exception 'Loan application not found' using errcode='P0002'; end if;
  if v_loan.status <> 'approved' then raise exception 'Only approved loans can be disbursed' using errcode='55000'; end if;
  if exists(select 1 from public.loan_repayment_schedule where loan_id=p_loan_id) then raise exception 'Repayment schedule already exists' using errcode='55000'; end if;
  select * into v_settings from public.loan_settings where group_id=p_group_id;
  v_principal := v_loan.approved_amount;
  v_principal_each := round(v_principal / v_loan.period_months,2);
  v_remaining := v_principal;
  for v_i in 1..v_loan.period_months loop
    v_due := (p_disbursed_date + make_interval(months => v_i))::date;
    if v_i = v_loan.period_months then
      v_opening := v_remaining;
      v_principal_each := v_remaining;
    else
      v_opening := v_remaining;
    end if;
    if v_loan.interest_type_snapshot='flat' then
      v_interest := round(v_principal * v_loan.interest_rate_snapshot / 100 / 12,2);
    else
      v_interest := round(v_opening * v_loan.interest_rate_snapshot / 100 / 12,2);
    end if;
    insert into public.loan_repayment_schedule(group_id,loan_id,installment_no,due_date,principal_due,interest_due,status)
    values(p_group_id,p_loan_id,v_i,v_due,v_principal_each,v_interest,'pending');
    v_remaining := round(v_remaining-v_principal_each,2);
  end loop;
  select coalesce(sum(interest_due),0) into v_total_interest from public.loan_repayment_schedule where loan_id=p_loan_id;
  update public.loan_applications set status='active',disbursed_by=auth.uid(),disbursed_at=p_disbursed_date::timestamptz,
    updated_at=now() where id=p_loan_id;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'disburse_loan','loan_application',p_loan_id::text,
    jsonb_build_object('principal',v_principal,'interest_total',v_total_interest,'period_months',v_loan.period_months,'disbursed_date',p_disbursed_date));
  return p_loan_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_emit_notification(p_group_id uuid, p_recipient_member_id uuid, p_loan_id uuid, p_event_type text, p_title text, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_recipient_member_id is null or not exists (
    select 1 from public.groups g where g.id = p_group_id and g.loans_enabled = true
  ) then return; end if;
  insert into public.loan_notifications(group_id,recipient_member_id,loan_id,event_type,title,message)
  values(p_group_id,p_recipient_member_id,p_loan_id,p_event_type,p_title,p_message);
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_guard_approval_office()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_member public.members%rowtype;
  v_member_count integer;
  v_position text;
  v_position_name text;
  v_slot text;
begin
  if auth.uid() is null or new.approver_user_id <> auth.uid() then
    raise exception 'A loan approval must be submitted by the signed-in official' using errcode='42501';
  end if;

  select count(*) into v_member_count
  from public.members m
  where m.group_id=new.group_id
    and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and lower(coalesce(m.status,''))='active'
    and lower(coalesce(m.onboarding_status,''))='active';
  if v_member_count<>1 then
    raise exception 'Exactly one active member record in this group is required to approve loans' using errcode='42501';
  end if;

  select m.* into v_member
  from public.members m
  where m.group_id=new.group_id
    and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and lower(coalesce(m.status,''))='active'
    and lower(coalesce(m.onboarding_status,''))='active';

  v_position := lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g'));
  v_position_name := lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g'));

  if v_position in ('chairperson','vice chairperson','chair','vice chair')
     or v_position_name in ('chairperson','vice chairperson','chair','vice chair') then
    v_slot := 'chairperson';
  elsif v_position='treasurer' or v_position_name='treasurer' then
    v_slot := 'treasurer';
  elsif v_position in ('secretary','vice secretary') or v_position_name in ('secretary','vice secretary') then
    v_slot := 'secretary';
  else
    raise exception 'Your declared group office is not eligible to approve loans' using errcode='42501';
  end if;

  if v_slot<>new.approval_slot then
    raise exception 'The approval slot must match your declared group office' using errcode='42501';
  end if;

  if exists (
    select 1 from public.loan_applications l
    where l.id=new.loan_id and l.group_id=new.group_id and l.member_id=v_member.id
  ) then
    raise exception 'A loan applicant cannot approve or reject their own loan' using errcode='42501';
  end if;

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_guard_disbursement_approvals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_count integer;
begin
  if new.status='active' and old.status is distinct from 'active' then
    select count(*) into v_count from public.loan_approvals a
    where a.loan_id=new.id and a.group_id=new.group_id and a.decision='approved'
      and a.approval_slot in ('chairperson','treasurer','secretary');
    if v_count<>3 or exists(select 1 from public.loan_approvals a where a.loan_id=new.id and a.decision='rejected') then
      raise exception 'Loan disbursement blocked: Chairperson, Treasurer and Secretary approvals are all required' using errcode='42501';
    end if;
  end if;
  return new;
end;
$function$


-- STAGE ONLY: production function definitions; ordinal rows 61-70 of 201.
-- Definitions captured read-only on 2026-10-14. Ordering is alphabetical, NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects must be reconciled separately.

CREATE OR REPLACE FUNCTION public.cl_loan_guard_repayment_recorder()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.members m
    where m.group_id=new.group_id
      and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(coalesce(m.status,'active'))='active'
      and lower(coalesce(m.onboarding_status,'active'))='active'
      and (
        lower(btrim(coalesce(m.role,''))) in ('admin','administrator','treasurer')
        or lower(btrim(coalesce(m.actual_position,'')))='treasurer'
        or lower(btrim(coalesce(m.actual_position_name,'')))='treasurer'
      )
  ) then
    raise exception 'Only Admin or Treasurer can record loan repayments' using errcode='42501';
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_notify_application_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_member_name text;
  v_event text;
  v_title text;
  v_message text;
  v_recipient_member_id uuid;
begin
  if not exists(select 1 from public.groups g where g.id = new.group_id and g.loans_enabled = true) then
    return new;
  end if;

  select coalesce(m.name,'A member') into v_member_name
  from public.members m where m.id = new.member_id and m.group_id = new.group_id;

  if tg_op = 'INSERT' then
    perform public.cl_loan_emit_notification(
      new.group_id,new.member_id,new.id,'application_submitted',
      'Loan application submitted',
      'Your loan application for KES ' || to_char(new.requested_amount,'FM999999999990.00') || ' has been submitted.'
    );
    for v_recipient_member_id in
      select distinct m.id
      from public.members m
      where m.group_id = new.group_id
        and lower(coalesce(m.status,'active')) = 'active'
        and lower(coalesce(m.onboarding_status,'active')) = 'active'
        and (
          lower(coalesce(m.role,'')) in ('admin','administrator','chairperson','secretary')
          or lower(coalesce(m.actual_position,'')) in ('admin','administrator','chairperson','secretary')
          or lower(coalesce(m.actual_position_name,'')) in ('admin','administrator','chairperson','secretary')
        )
    loop
      perform public.cl_loan_emit_notification(
        new.group_id,v_recipient_member_id,new.id,'application_submitted','New loan application',
        v_member_name || ' submitted a loan application for KES ' || to_char(new.requested_amount,'FM999999999990.00') || '.'
      );
    end loop;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'approved' then
      v_event := 'application_approved'; v_title := 'Loan application approved';
      v_message := 'Your loan application for KES ' || to_char(coalesce(new.approved_amount,new.requested_amount),'FM999999999990.00') || ' was approved.';
    elsif new.status = 'rejected' then
      v_event := 'application_rejected'; v_title := 'Loan application not approved';
      v_message := 'Your loan application was not approved.' || case when nullif(btrim(new.decision_note),'') is not null then ' Reason: ' || btrim(new.decision_note) else '' end;
    elsif new.status = 'active' then
      v_event := 'loan_disbursed'; v_title := 'Loan disbursed';
      v_message := 'Your loan for KES ' || to_char(coalesce(new.approved_amount,new.requested_amount),'FM999999999990.00') || ' has been disbursed. Your repayment schedule is available in Loans.';
    elsif new.status = 'cleared' then
      v_event := 'loan_cleared'; v_title := 'Loan cleared';
      v_message := 'Your loan has been fully repaid and cleared.';
    else
      return new;
    end if;
    perform public.cl_loan_emit_notification(new.group_id,new.member_id,new.id,v_event,v_title,v_message);
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_notify_repayment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member_id uuid; v_amount text;
begin
  if not exists(select 1 from public.groups g where g.id = new.group_id and g.loans_enabled = true) then return new; end if;
  select l.member_id into v_member_id from public.loan_applications l where l.id = new.loan_id and l.group_id = new.group_id;
  v_amount := to_char(new.amount,'FM999999999990.00');
  perform public.cl_loan_emit_notification(
    new.group_id,v_member_id,new.loan_id,'repayment_recorded','Loan repayment recorded',
    'A repayment of KES ' || v_amount || ' was recorded on ' || new.payment_date::text || '.'
  );
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_record_repayment(p_group_id uuid, p_loan_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE, p_payment_method text DEFAULT 'cash'::text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor_member_id uuid; v_loan public.loan_applications%rowtype; v_settings public.loan_settings%rowtype;
  v_repayment_id uuid; v_remaining numeric(14,2); v_total_outstanding numeric(14,2);
  r record; v_penalty_alloc numeric(14,2); v_interest_alloc numeric(14,2); v_principal_alloc numeric(14,2);
  v_new_paid numeric(14,2); v_cleared boolean;
begin
  v_actor_member_id := public.cl_loan_actor(p_group_id, true);
  if not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer','secretary']::text[]) then
    raise exception 'You do not have permission to record loan repayments' using errcode='42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_payment_method not in ('cash','mpesa','bank','other') then
    raise exception 'Enter a positive repayment amount and valid payment method' using errcode='22023';
  end if;
  select * into v_loan from public.loan_applications where id=p_loan_id and group_id=p_group_id for update;
  if not found then raise exception 'Loan not found' using errcode='P0002'; end if;
  if v_loan.status not in ('active','overdue') then raise exception 'Repayments can only be recorded for active loans' using errcode='55000'; end if;
  select * into v_settings from public.loan_settings where group_id=p_group_id;
  if v_settings.late_penalty > 0 then
    update public.loan_repayment_schedule s set penalty_due=v_settings.late_penalty
    where s.loan_id=p_loan_id and s.group_id=p_group_id and s.due_date < p_payment_date
      and s.penalty_due=0 and s.amount_paid < s.principal_due+s.interest_due+s.penalty_due;
  end if;

  select coalesce(sum(principal_due+interest_due+penalty_due-amount_paid),0)
    into v_total_outstanding
  from public.loan_repayment_schedule where loan_id=p_loan_id and group_id=p_group_id;
  if p_amount > v_total_outstanding then
    raise exception 'Repayment exceeds the outstanding loan balance (%). No payment was recorded.', v_total_outstanding using errcode='22023';
  end if;

  insert into public.loan_repayments(group_id,loan_id,amount,payment_date,payment_method,reference,note,recorded_by)
  values(p_group_id,p_loan_id,p_amount,p_payment_date,p_payment_method,
    nullif(btrim(coalesce(p_reference,'')),''),nullif(btrim(coalesce(p_note,'')),''),auth.uid())
  returning id into v_repayment_id;
  v_remaining := p_amount;

  for r in
    select s.*,
      coalesce(a.principal_paid,0) as principal_paid,
      coalesce(a.interest_paid,0) as interest_paid,
      coalesce(a.penalty_paid,0) as penalty_paid
    from public.loan_repayment_schedule s
    left join (
      select schedule_id, sum(principal_amount) principal_paid,
        sum(interest_amount) interest_paid, sum(penalty_amount) penalty_paid
      from public.loan_repayment_allocations group by schedule_id
    ) a on a.schedule_id=s.id
    where s.loan_id=p_loan_id and s.group_id=p_group_id
      and s.amount_paid < s.principal_due+s.interest_due+s.penalty_due
    order by s.due_date,s.installment_no
    for update of s
  loop
    exit when v_remaining <= 0;
    v_penalty_alloc := least(v_remaining,greatest(r.penalty_due-r.penalty_paid,0));
    v_remaining := v_remaining-v_penalty_alloc;
    v_interest_alloc := least(v_remaining,greatest(r.interest_due-r.interest_paid,0));
    v_remaining := v_remaining-v_interest_alloc;
    v_principal_alloc := least(v_remaining,greatest(r.principal_due-r.principal_paid,0));
    v_remaining := v_remaining-v_principal_alloc;

    if v_penalty_alloc+v_interest_alloc+v_principal_alloc > 0 then
      insert into public.loan_repayment_allocations(group_id,repayment_id,loan_id,schedule_id,principal_amount,interest_amount,penalty_amount)
      values(p_group_id,v_repayment_id,p_loan_id,r.id,v_principal_alloc,v_interest_alloc,v_penalty_alloc);
      v_new_paid := r.amount_paid+v_penalty_alloc+v_interest_alloc+v_principal_alloc;
      update public.loan_repayment_schedule set amount_paid=v_new_paid,
        status=case when v_new_paid >= principal_due+interest_due+penalty_due then 'paid'
                    when due_date < p_payment_date then 'overdue' else 'partial' end,
        paid_at=case when v_new_paid >= principal_due+interest_due+penalty_due then now() else null end
      where id=r.id;
    end if;
  end loop;

  select not exists(select 1 from public.loan_repayment_schedule s where s.loan_id=p_loan_id
    and s.amount_paid < s.principal_due+s.interest_due+s.penalty_due) into v_cleared;
  if v_cleared then
    update public.loan_applications set status='cleared',cleared_at=now(),updated_at=now() where id=p_loan_id;
  else
    update public.loan_applications set status=case when exists(select 1 from public.loan_repayment_schedule s
      where s.loan_id=p_loan_id and s.due_date < p_payment_date and s.amount_paid < s.principal_due+s.interest_due+s.penalty_due)
      then 'overdue' else 'active' end, updated_at=now() where id=p_loan_id;
  end if;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'record_loan_repayment','loan_repayment',v_repayment_id::text,
    jsonb_build_object('loan_id',p_loan_id,'amount',p_amount,'payment_date',p_payment_date,
      'payment_method',p_payment_method,'unallocated_amount',v_remaining));
  return v_repayment_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_record_repayment_authorized(p_group_id uuid, p_loan_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE, p_payment_method text DEFAULT 'cash'::text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.cl_loan_actor(p_group_id,true);
  if not exists (
    select 1 from public.members m
    where m.group_id=p_group_id
      and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
      and lower(coalesce(m.status,'active'))='active'
      and lower(coalesce(m.onboarding_status,'active'))='active'
      and (
        lower(btrim(coalesce(m.role,''))) in ('admin','administrator','treasurer')
        or lower(btrim(coalesce(m.actual_position,'')))='treasurer'
        or lower(btrim(coalesce(m.actual_position_name,'')))='treasurer'
      )
  ) then
    raise exception 'Only Admin or Treasurer can record loan repayments' using errcode='42501';
  end if;
  return public.cl_loan_record_repayment(p_group_id,p_loan_id,p_amount,p_payment_date,p_payment_method,p_reference,p_note);
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_refresh_statuses(p_group_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor_member_id uuid; v_count integer;
begin
 v_actor_member_id:=public.cl_loan_actor(p_group_id,false);
 update public.loan_applications l set status=case
  when exists(select 1 from public.loan_repayment_schedule s where s.loan_id=l.id and s.due_date<current_date
    and s.amount_paid<s.principal_due+s.interest_due+s.penalty_due) then 'overdue'
  else 'active' end, updated_at=now()
 where l.group_id=p_group_id and l.status in ('active','overdue')
 and l.status is distinct from case
  when exists(select 1 from public.loan_repayment_schedule s where s.loan_id=l.id and s.due_date<current_date
   and s.amount_paid<s.principal_due+s.interest_due+s.penalty_due) then 'overdue' else 'active' end;
 get diagnostics v_count=row_count;
 if v_count>0 then
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'refresh_loan_statuses','loan_application',jsonb_build_object('updated_count',v_count));
 end if;
 return v_count;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_loan_review(p_group_id uuid, p_loan_id uuid, p_decision text, p_decision_note text DEFAULT NULL::text, p_approved_amount numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor_member_id uuid; v_loan public.loan_applications%rowtype; v_settings public.loan_settings%rowtype; v_amount numeric(14,2);
begin
  v_actor_member_id := public.cl_loan_actor(p_group_id, true);
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected' using errcode='22023'; end if;
  select * into v_loan from public.loan_applications where id=p_loan_id and group_id=p_group_id for update;
  if not found then raise exception 'Loan application not found' using errcode='P0002'; end if;
  if v_loan.status <> 'submitted' then raise exception 'Only submitted applications can be reviewed' using errcode='55000'; end if;
  if p_decision='rejected' and length(btrim(coalesce(p_decision_note,'')))=0 then
    raise exception 'Provide a reason for rejection' using errcode='22023';
  end if;
  select * into v_settings from public.loan_settings where group_id=p_group_id;
  if not found then raise exception 'Loan settings are not configured' using errcode='P0002'; end if;
  v_amount := coalesce(p_approved_amount,v_loan.requested_amount);
  if p_decision='approved' and (v_amount <= 0 or v_amount > v_loan.requested_amount or v_amount > v_settings.max_loan_amount) then
    raise exception 'Approved amount must be positive and cannot exceed the requested or group maximum amount' using errcode='22023';
  end if;
  update public.loan_applications set status=p_decision, decision_note=nullif(btrim(coalesce(p_decision_note,'')),''),
    approved_amount=case when p_decision='approved' then v_amount else null end,
    interest_rate_snapshot=case when p_decision='approved' then v_settings.interest_rate else null end,
    interest_type_snapshot=case when p_decision='approved' then v_settings.interest_type else null end,
    approved_by=auth.uid(), approved_at=now(), updated_at=now()
  where id=p_loan_id;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'review_loan_application','loan_application',p_loan_id::text,
    jsonb_build_object('decision',p_decision,'approved_amount',case when p_decision='approved' then v_amount else null end,
      'note',p_decision_note));
  return p_loan_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_review_authorized(p_group_id uuid, p_loan_id uuid, p_decision text, p_decision_note text DEFAULT NULL::text, p_approved_amount numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor_member_id uuid;
  v_approver public.members%rowtype;
  v_loan public.loan_applications%rowtype;
  v_settings public.loan_settings%rowtype;
  v_member_count integer;
  v_slot text;
  v_position text;
  v_position_name text;
  v_technical_role text;
  v_amount numeric(14,2);
  v_approvals integer;
  v_status text;
begin
  v_actor_member_id := public.cl_loan_actor(p_group_id, true);

  if lower(btrim(coalesce(p_decision,''))) not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected' using errcode='22023';
  end if;
  if lower(btrim(coalesce(p_decision,''))) = 'rejected'
     and length(btrim(coalesce(p_decision_note,''))) = 0 then
    raise exception 'Provide a reason for rejection' using errcode='22023';
  end if;

  select * into v_loan
  from public.loan_applications
  where id = p_loan_id and group_id = p_group_id
  for update;
  if not found then
    raise exception 'Loan application not found' using errcode='P0002';
  end if;
  if v_loan.status <> 'submitted' then
    raise exception 'Only pending loan applications can receive an office decision' using errcode='55000';
  end if;
  if v_loan.member_id = v_actor_member_id then
    raise exception 'A loan applicant cannot approve or reject their own loan' using errcode='42501';
  end if;

  select count(*) into v_member_count
  from public.members m
  where m.group_id = p_group_id
    and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
    and lower(coalesce(m.status,'')) = 'active'
    and lower(coalesce(m.onboarding_status,'')) = 'active';
  if v_member_count <> 1 then
    raise exception 'Exactly one active member record in this group is required to approve loans' using errcode='42501';
  end if;

  select m.* into v_approver
  from public.members m
  where m.group_id = p_group_id
    and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
    and lower(coalesce(m.status,'')) = 'active'
    and lower(coalesce(m.onboarding_status,'')) = 'active';

  v_position := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.actual_position,'')), '_',' '),'-',' '),'[[:space:]]+',' ','g'));
  v_position_name := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.actual_position_name,'')), '_',' '),'-',' '),'[[:space:]]+',' ','g'));
  v_technical_role := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.role,'')), '_',' '),'-',' '),'[[:space:]]+',' ','g'));

  if v_position in ('chairperson','vice chairperson','chair','vice chair')
     or v_position_name in ('chairperson','vice chairperson','chair','vice chair') then
    v_slot := 'chairperson';
  elsif v_position = 'treasurer' or v_position_name = 'treasurer' then
    v_slot := 'treasurer';
  elsif v_position in ('secretary','vice secretary') or v_position_name in ('secretary','vice secretary') then
    v_slot := 'secretary';
  elsif v_technical_role in ('chairperson','vice chairperson','chair','vice chair') then
    v_slot := 'chairperson';
  elsif v_technical_role = 'treasurer' then
    v_slot := 'treasurer';
  elsif v_technical_role in ('secretary','vice secretary') then
    v_slot := 'secretary';
  else
    raise exception 'Only the designated Chairperson, Treasurer or Secretary can decide loan applications' using errcode='42501';
  end if;

  if exists (select 1 from public.loan_approvals a where a.loan_id=p_loan_id and a.approver_user_id=auth.uid()) then
    raise exception 'You have already submitted a decision for this loan' using errcode='55000';
  end if;
  if exists (select 1 from public.loan_approvals a where a.loan_id=p_loan_id and a.approval_slot=v_slot) then
    raise exception 'Another official has already filled the % approval slot', v_slot using errcode='55000';
  end if;

  select * into v_settings from public.loan_settings where group_id=p_group_id;
  if not found then raise exception 'Loan settings are not configured' using errcode='P0002'; end if;

  if lower(p_decision)='approved' then
    v_amount := coalesce(p_approved_amount,v_loan.approved_amount,v_loan.requested_amount);
    if v_amount<=0 or v_amount>v_loan.requested_amount or v_amount>v_settings.max_loan_amount then
      raise exception 'Approved amount must be positive and cannot exceed the requested or group maximum amount' using errcode='22023';
    end if;
    if v_loan.approved_amount is not null and v_loan.approved_amount<>v_amount then
      raise exception 'All three officials must approve the same loan amount (% KES)',v_loan.approved_amount using errcode='22023';
    end if;
  else
    v_amount := null;
  end if;

  insert into public.loan_approvals(loan_id,group_id,approver_user_id,approval_slot,decision,note)
  values(p_loan_id,p_group_id,auth.uid(),v_slot,lower(p_decision),nullif(btrim(coalesce(p_decision_note,'')), ''));

  if lower(p_decision)='rejected' then
    v_status := 'rejected';
    update public.loan_applications set status='rejected',
      decision_note=nullif(btrim(coalesce(p_decision_note,'')), ''),
      approved_amount=null, interest_rate_snapshot=null, interest_type_snapshot=null,
      approved_by=null, approved_at=null, updated_at=now()
    where id=p_loan_id;
  else
    if v_loan.approved_amount is null then
      update public.loan_applications set approved_amount=v_amount,
        interest_rate_snapshot=v_settings.interest_rate, interest_type_snapshot=v_settings.interest_type,
        updated_at=now() where id=p_loan_id;
    end if;
    select count(*) into v_approvals from public.loan_approvals a
    where a.loan_id=p_loan_id and a.decision='approved'
      and a.approval_slot in ('chairperson','treasurer','secretary');
    if v_approvals=3 and not exists(select 1 from public.loan_approvals a where a.loan_id=p_loan_id and a.decision='rejected') then
      v_status := 'approved';
      update public.loan_applications set status='approved', decision_note=null,
        approved_by=auth.uid(), approved_at=now(), updated_at=now() where id=p_loan_id;
    else
      v_status := 'submitted';
    end if;
  end if;

  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'review_loan_application','loan_application',p_loan_id::text,
    jsonb_build_object('decision',lower(p_decision),'approval_slot',v_slot,'approval_status',v_status,
      'approved_slots',(select count(*) from public.loan_approvals a where a.loan_id=p_loan_id and a.decision='approved'),
      'required_slots',3,'approved_amount',case when lower(p_decision)='approved' then v_amount else null end,'note',p_decision_note));
  return p_loan_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_loan_update_settings(p_group_id uuid, p_interest_rate numeric, p_interest_type text, p_max_loan_amount numeric, p_max_period_months integer, p_late_penalty numeric)
 RETURNS loan_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor_member_id uuid; v_row public.loan_settings;
begin
  v_actor_member_id := public.cl_loan_actor(p_group_id, true);
  if not public.cl_user_has_role(p_group_id,array['admin']::text[]) then
    raise exception 'Only the group Admin can change loan settings' using errcode='42501';
  end if;
  if p_interest_rate is null or p_interest_rate < 0 or p_interest_rate > 100
    or p_interest_type not in ('flat','reducing_balance')
    or p_max_loan_amount is null or p_max_loan_amount <= 0
    or p_max_period_months is null or p_max_period_months < 1 or p_max_period_months > 120
    or p_late_penalty is null or p_late_penalty < 0 then
    raise exception 'Invalid loan settings' using errcode='22023';
  end if;
  insert into public.loan_settings(group_id,interest_rate,interest_type,max_loan_amount,max_period_months,late_penalty,updated_by,updated_at)
  values(p_group_id,p_interest_rate,p_interest_type,p_max_loan_amount,p_max_period_months,p_late_penalty,auth.uid(),now())
  on conflict(group_id) do update set interest_rate=excluded.interest_rate, interest_type=excluded.interest_type,
    max_loan_amount=excluded.max_loan_amount, max_period_months=excluded.max_period_months,
    late_penalty=excluded.late_penalty, updated_by=excluded.updated_by, updated_at=now()
  returning * into v_row;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_actor_member_id,'update_loan_settings','loan_settings',p_group_id::text,
    jsonb_build_object('interest_rate',p_interest_rate,'interest_type',p_interest_type,'max_loan_amount',p_max_loan_amount,
      'max_period_months',p_max_period_months,'late_penalty',p_late_penalty));
  return v_row;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_merry_apply_preferences(p_group_id uuid, p_cycle_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid; v_cycle public.merry_go_round_cycles%rowtype; v_active_count integer; v_pref_count integer;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if not public.cl_user_has_role(p_group_id,array['admin','chairperson','secretary']::text[]) then raise exception 'Your role cannot finalize member payout choices' using errcode='42501'; end if;
 select * into v_cycle from public.merry_go_round_cycles where id=p_cycle_id and group_id=p_group_id for update;
 if v_cycle.id is null or v_cycle.payout_order_method<>'member_chosen' then raise exception 'Member-chosen cycle not found' using errcode='P0002'; end if;
 if exists(select 1 from public.merry_go_round_rounds where cycle_id=p_cycle_id and (status<>'pending' or due_date<=current_date)) then raise exception 'Payout choices can only be applied before the first round starts' using errcode='22023'; end if;
 select count(*) into v_active_count from public.members where group_id=p_group_id and status='active' and onboarding_status='active';
 select count(*) into v_pref_count from public.merry_go_round_preferences where group_id=p_group_id and cycle_id=p_cycle_id;
 if v_pref_count<>v_active_count then raise exception 'Every active member must choose a unique round first (% of % submitted)',v_pref_count,v_active_count using errcode='22023'; end if;
 if exists(select 1 from public.merry_go_round_preferences p where p.cycle_id=p_cycle_id and (p.preferred_round_number<1 or p.preferred_round_number>v_cycle.number_of_rounds)) then raise exception 'Invalid preferred round' using errcode='22023'; end if;
 update public.merry_go_round_rounds r set recipient_member_id=p.member_id
 from public.merry_go_round_preferences p where r.cycle_id=p_cycle_id and p.cycle_id=p_cycle_id and r.round_number=p.preferred_round_number;
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_actor,'apply_member_payout_choices','merry_go_round_cycle',p_cycle_id::text,jsonb_build_object('preference_count',v_pref_count));
 return true;
end; $function$


-- STAGE ONLY: production function definitions; ordinal rows 71-80 of 201.
-- Definitions captured read-only on 2026-10-14. Ordering is alphabetical, NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects must be reconciled separately.

CREATE OR REPLACE FUNCTION public.cl_merry_authorize(p_group_id uuid, p_write boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not exists(select 1 from public.groups g where g.id=p_group_id and g.merry_go_round_enabled) then
   raise exception 'Merry-go-round is disabled for this group' using errcode='42501';
 end if;
 select m.id into v_member_id from public.members m where m.group_id=p_group_id
 and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and m.status='active' and m.onboarding_status='active'
 order by m.created_at limit 1;
 if v_member_id is null then raise exception 'Active group membership required' using errcode='42501'; end if;
 if p_write and not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer','secretary']::text[]) then
   raise exception 'View-only: you do not have permission to manage merry-go-round' using errcode='42501';
 end if;
 return v_member_id;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_choose_round(p_group_id uuid, p_cycle_id uuid, p_round_number integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member uuid; v_cycle public.merry_go_round_cycles%rowtype;
begin
 v_member:=public.cl_merry_authorize(p_group_id,false);
 select * into v_cycle from public.merry_go_round_cycles where id=p_cycle_id and group_id=p_group_id for update;
 if v_cycle.id is null then raise exception 'Cycle not found' using errcode='P0002'; end if;
 if v_cycle.payout_order_method<>'member_chosen' then raise exception 'This cycle does not use member-chosen payout order' using errcode='22023'; end if;
 if v_cycle.status<>'active' or p_round_number<1 or p_round_number>v_cycle.number_of_rounds then raise exception 'Invalid payout round choice' using errcode='22023'; end if;
 if exists(select 1 from public.merry_go_round_rounds where cycle_id=p_cycle_id and due_date<=current_date) then raise exception 'Choices are closed after the first round starts' using errcode='22023'; end if;
 if exists(select 1 from public.merry_go_round_preferences where cycle_id=p_cycle_id and preferred_round_number=p_round_number and member_id<>v_member) then raise exception 'That round has already been chosen by another member. Choose another round.' using errcode='23505'; end if;
 insert into public.merry_go_round_preferences(group_id,cycle_id,member_id,preferred_round_number) values(p_group_id,p_cycle_id,v_member,p_round_number)
 on conflict(cycle_id,member_id) do update set preferred_round_number=excluded.preferred_round_number,updated_at=now();
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_member,'choose_payout_round','merry_go_round_preference',p_cycle_id::text,jsonb_build_object('preferred_round_number',p_round_number));
 return true;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_complete_payout(p_group_id uuid, p_round_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid; r public.merry_go_round_rounds%rowtype; v_recipient_name text;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 select * into r from public.merry_go_round_rounds where id=p_round_id and group_id=p_group_id for update;
 if r.id is null then raise exception 'Round not found' using errcode='P0002'; end if;
 if r.status='completed' then return true; end if;
 if exists(select 1 from public.merry_go_round_payments p where p.round_id=r.id and p.status<>'paid') then
  raise exception 'All round contributions must be paid before payout' using errcode='22023';
 end if;
 update public.merry_go_round_rounds set status='completed',payout_recorded_at=now(),payout_recorded_by=auth.uid() where id=r.id;
 update public.merry_go_round_cycles set status='completed',updated_at=now()
 where id=r.cycle_id and not exists(select 1 from public.merry_go_round_rounds x where x.cycle_id=r.cycle_id and x.status<>'completed');
 select name into v_recipient_name from public.members where id=r.recipient_member_id;
 insert into public.merry_go_round_notifications(group_id,cycle_id,round_id,member_id,notification_type,message,due_date)
 values(p_group_id,r.cycle_id,r.id,r.recipient_member_id,'payout_recorded','Your merry-go-round payout of '||r.payout_amount||' has been recorded.',r.due_date);
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_actor,'complete_payout','merry_go_round_round',r.id::text,jsonb_build_object('recipient_member_id',r.recipient_member_id,'recipient_name',v_recipient_name,'payout_amount',r.payout_amount));
 return true;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_create_cycle(p_group_id uuid, p_name text, p_contribution_amount numeric, p_frequency text, p_start_date date, p_number_of_rounds integer, p_payout_order_method text, p_member_order uuid[] DEFAULT NULL::uuid[], p_late_fine_amount numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid; v_cycle uuid; v_members uuid[]; v_order uuid[]; v_count integer; i integer; v_due date; v_round uuid;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer','secretary']::text[]) then raise exception 'Not authorized to create cycle' using errcode='42501'; end if;
 if nullif(btrim(p_name),'') is null or p_contribution_amount<=0 or p_number_of_rounds<1 or p_frequency not in ('weekly','monthly') or p_payout_order_method not in ('admin','random','member_chosen') or coalesce(p_late_fine_amount,0)<0 then raise exception 'Invalid cycle settings' using errcode='22023'; end if;
 select array_agg(id order by created_at,id) into v_members from public.members where group_id=p_group_id and status='active' and onboarding_status='active';
 v_count:=coalesce(array_length(v_members,1),0);
 if v_count<2 then raise exception 'At least two active members are required' using errcode='22023'; end if;
 if p_number_of_rounds<>v_count then raise exception 'Number of rounds must match active member count (%).',v_count using errcode='22023'; end if;
 if p_payout_order_method='admin' then
  if coalesce(array_length(p_member_order,1),0)<>v_count then raise exception 'Provide the complete payout order' using errcode='22023'; end if;
  if (select count(distinct x) from unnest(p_member_order) x)<>v_count or not (p_member_order @> v_members and v_members @> p_member_order) then raise exception 'Payout order must include every active member exactly once' using errcode='22023'; end if;
  v_order:=p_member_order;
 else select array_agg(id order by random()) into v_order from unnest(v_members) id;
 end if;
 insert into public.merry_go_round_cycles(group_id,name,contribution_amount,frequency,start_date,number_of_rounds,payout_order_method,late_fine_amount,created_by)
 values(p_group_id,btrim(p_name),p_contribution_amount,p_frequency,p_start_date,p_number_of_rounds,p_payout_order_method,coalesce(p_late_fine_amount,0),auth.uid()) returning id into v_cycle;
 for i in 1..p_number_of_rounds loop
  v_due:=case when p_frequency='weekly' then p_start_date+((i-1)*7) else (p_start_date + ((i-1)||' months')::interval)::date end;
  insert into public.merry_go_round_rounds(group_id,cycle_id,round_number,due_date,recipient_member_id,payout_amount) values(p_group_id,v_cycle,i,v_due,v_order[i],p_contribution_amount*v_count) returning id into v_round;
  insert into public.merry_go_round_payments(group_id,cycle_id,round_id,member_id,amount_due,late_fine_amount) select p_group_id,v_cycle,v_round,m,p_contribution_amount,0 from unnest(v_members) m;
  insert into public.merry_go_round_notifications(group_id,cycle_id,round_id,member_id,notification_type,message,due_date) select p_group_id,v_cycle,v_round,m,'round_due','Merry-go-round contribution due for round '||i,v_due from unnest(v_members) m;
 end loop;
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details) values(p_group_id,auth.uid(),v_actor,'create','merry_go_round_cycle',v_cycle::text,jsonb_build_object('name',p_name,'contribution_amount',p_contribution_amount,'frequency',p_frequency,'number_of_rounds',p_number_of_rounds,'payout_order_method',p_payout_order_method,'late_fine_amount',coalesce(p_late_fine_amount,0)));
 return v_cycle;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_delete_cycle(p_group_id uuid, p_cycle_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_cycle public.merry_go_round_cycles%rowtype;
  v_round_count integer;
  v_payment_count integer;
begin
  v_actor := public.cl_merry_authorize(p_group_id, true);

  if not public.cl_user_has_role(p_group_id, array['admin']::text[]) then
    raise exception 'Only the group Admin can delete a merry-go-round cycle' using errcode = '42501';
  end if;

  select * into v_cycle
  from public.merry_go_round_cycles
  where id = p_cycle_id and group_id = p_group_id
  for update;

  if v_cycle.id is null then
    raise exception 'Cycle not found in this group' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.merry_go_round_payments p
    where p.cycle_id = p_cycle_id
      and (coalesce(p.amount_paid, 0) > 0 or p.status = 'paid' or p.recorded_by is not null)
  ) then
    raise exception 'This cycle has recorded payment activity. It cannot be deleted; keep its payment history.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.merry_go_round_rounds r
    where r.cycle_id = p_cycle_id
      and (r.status = 'completed' or r.payout_recorded_at is not null or r.payout_recorded_by is not null)
  ) then
    raise exception 'This cycle has a recorded payout or completed round and cannot be deleted.' using errcode = '22023';
  end if;

  select count(*) into v_round_count
  from public.merry_go_round_rounds where cycle_id = p_cycle_id;
  select count(*) into v_payment_count
  from public.merry_go_round_payments where cycle_id = p_cycle_id;

  insert into public.group_audit_log(
    group_id, actor_user_id, actor_member_id, action, entity_type, entity_id, details
  ) values (
    p_group_id, auth.uid(), v_actor, 'delete', 'merry_go_round_cycle', p_cycle_id::text,
    jsonb_build_object(
      'name', v_cycle.name,
      'status', v_cycle.status,
      'number_of_rounds', v_cycle.number_of_rounds,
      'round_count', v_round_count,
      'payment_record_count', v_payment_count
    )
  );

  delete from public.merry_go_round_cycles
  where id = p_cycle_id and group_id = p_group_id;

  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_merry_list_preferences(p_group_id uuid, p_cycle_id uuid)
 RETURNS TABLE(member_id uuid, member_name text, preferred_round_number integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 perform public.cl_merry_authorize(p_group_id,false);
 if not public.cl_user_has_role(p_group_id,array['admin','chairperson','treasurer','secretary']::text[]) then raise exception 'Only group officials can view all payout choices' using errcode='42501'; end if;
 return query select p.member_id,m.name,p.preferred_round_number,p.updated_at
 from public.merry_go_round_preferences p join public.members m on m.id=p.member_id
 where p.group_id=p_group_id and p.cycle_id=p_cycle_id order by p.preferred_round_number,m.name;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_record_payment(p_group_id uuid, p_payment_id uuid, p_amount numeric)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid; p public.merry_go_round_payments%rowtype; v_status text; v_due_date date; v_fine numeric; v_late boolean;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if p_amount<0 then raise exception 'Amount cannot be negative' using errcode='22023'; end if;
 select * into p from public.merry_go_round_payments where id=p_payment_id and group_id=p_group_id for update;
 if p.id is null then raise exception 'Payment entry not found' using errcode='P0002'; end if;
 select r.due_date,c.late_fine_amount into v_due_date,v_fine from public.merry_go_round_rounds r join public.merry_go_round_cycles c on c.id=r.cycle_id where r.id=p.round_id;
 if p_amount>p.amount_due then raise exception 'Payment exceeds the contribution amount due' using errcode='22023'; end if;
 v_late:=current_date>v_due_date;
 v_status:=case when p_amount>=p.amount_due then 'paid' when v_late then 'late' else 'pending' end;
 update public.merry_go_round_payments set amount_paid=p_amount,status=v_status,paid_at=case when v_status='paid' then now() else null end,
 late_fine_amount=case when v_late then coalesce(v_fine,0) else 0 end,
 recorded_by=auth.uid(),updated_at=now() where id=p_payment_id;
 update public.merry_go_round_rounds r set status=case when not exists(select 1 from public.merry_go_round_payments x where x.round_id=r.id and x.status<>'paid') then 'ready_for_payout' else 'pending' end where r.id=p.round_id and r.status<>'completed';
 insert into public.merry_go_round_notifications(group_id,cycle_id,round_id,member_id,notification_type,message,due_date)
 values(p_group_id,p.cycle_id,p.round_id,p.member_id,
 case when v_late then 'payment_late' when v_status='paid' then 'payment_recorded' else 'payment_updated' end,
 case when v_late then 'Your merry-go-round contribution was recorded after its due date. Applicable late fine: KES '||coalesce(v_fine,0)||'.'
      when v_status='paid' then 'Your merry-go-round contribution has been marked paid.'
      else 'Your merry-go-round payment status was updated.' end,v_due_date);
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_actor,'record_payment','merry_go_round_payment',p_payment_id::text,
 jsonb_build_object('amount_paid',p_amount,'status',v_status,'late_fine_amount',case when v_late then coalesce(v_fine,0) else 0 end));
 return v_status;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_swap_recipients(p_group_id uuid, p_cycle_id uuid, p_round_a integer, p_round_b integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_actor uuid; a public.merry_go_round_rounds%rowtype; b public.merry_go_round_rounds%rowtype;
begin
 v_actor:=public.cl_merry_authorize(p_group_id,true);
 if not public.cl_user_has_role(p_group_id,array['admin','chairperson','secretary']::text[]) then
   raise exception 'Your role cannot change payout order' using errcode='42501';
 end if;
 select * into a from public.merry_go_round_rounds where group_id=p_group_id and cycle_id=p_cycle_id and round_number=p_round_a for update;
 select * into b from public.merry_go_round_rounds where group_id=p_group_id and cycle_id=p_cycle_id and round_number=p_round_b for update;
 if a.id is null or b.id is null then raise exception 'Round not found' using errcode='P0002'; end if;
 if a.status<>'pending' or b.status<>'pending' or a.due_date<=current_date or b.due_date<=current_date then raise exception 'Payout order can only change before both rounds start' using errcode='22023'; end if;
 update public.merry_go_round_rounds set recipient_member_id=case when id=a.id then b.recipient_member_id else a.recipient_member_id end where id in (a.id,b.id);
 insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
 values(p_group_id,auth.uid(),v_actor,'swap_payout_order','merry_go_round_cycle',p_cycle_id::text,jsonb_build_object('round_a',p_round_a,'round_b',p_round_b));
 return true;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_merry_tracking(p_group_id uuid, p_cycle_id uuid)
 RETURNS TABLE(round_id uuid, round_number integer, due_date date, recipient_member_id uuid, recipient_name text, round_status text, payout_amount numeric, paid_count bigint, pending_count bigint, late_count bigint, member_payments jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_member uuid;
begin
 v_member:=public.cl_merry_authorize(p_group_id,false);
 if not exists(select 1 from public.merry_go_round_cycles c where c.id=p_cycle_id and c.group_id=p_group_id) then raise exception 'Cycle not found' using errcode='P0002'; end if;
 return query
 select r.id,r.round_number,r.due_date,r.recipient_member_id,m.name,r.status,r.payout_amount,
 count(p.id) filter(where p.status='paid'),
 count(p.id) filter(where p.status<>'paid' and current_date<=r.due_date),
 count(p.id) filter(where p.status<>'paid' and current_date>r.due_date),
 jsonb_agg(jsonb_build_object('payment_id',p.id,'member_id',p.member_id,'member_name',pm.name,'amount_due',p.amount_due,'amount_paid',p.amount_paid,'late_fine_amount',p.late_fine_amount,'status',case when p.status<>'paid' and current_date>r.due_date then 'late' else p.status end) order by pm.name)
 from public.merry_go_round_rounds r join public.members m on m.id=r.recipient_member_id
 join public.merry_go_round_payments p on p.round_id=r.id join public.members pm on pm.id=p.member_id
 where r.group_id=p_group_id and r.cycle_id=p_cycle_id
 group by r.id,r.round_number,r.due_date,r.recipient_member_id,m.name,r.status,r.payout_amount order by r.round_number;
end; $function$


CREATE OR REPLACE FUNCTION public.cl_user_has_role(p_group_id uuid, p_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH requested AS (
    SELECT coalesce(array_agg(CASE lower(btrim(r))
      WHEN 'vice chairperson' THEN 'chairperson'
      WHEN 'vice-chairperson' THEN 'chairperson'
      WHEN 'vice secretary' THEN 'secretary'
      WHEN 'vice-secretary' THEN 'secretary'
      WHEN 'administrator' THEN 'admin'
      ELSE lower(btrim(r)) END), ARRAY[]::text[]) AS roles
    FROM unnest(coalesce(p_roles, ARRAY[]::text[])) AS input(r)
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.members m
    CROSS JOIN requested q
    WHERE m.group_id = p_group_id
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
      AND lower(coalesce(m.status, 'active')) = 'active'
      AND lower(coalesce(m.onboarding_status, 'active')) = 'active'
      AND (
        CASE lower(btrim(coalesce(m.actual_position, '')))
          WHEN 'vice_chairperson' THEN 'chairperson'
          WHEN 'vice-chairperson' THEN 'chairperson'
          WHEN 'vice chairperson' THEN 'chairperson'
          WHEN 'vice_secretary' THEN 'secretary'
          WHEN 'vice-secretary' THEN 'secretary'
          WHEN 'vice secretary' THEN 'secretary'
          ELSE CASE lower(btrim(coalesce(m.role, 'member')))
            WHEN 'vice chairperson' THEN 'chairperson'
            WHEN 'vice-chairperson' THEN 'chairperson'
            WHEN 'vice secretary' THEN 'secretary'
            WHEN 'vice-secretary' THEN 'secretary'
            WHEN 'administrator' THEN 'admin'
            ELSE lower(btrim(coalesce(m.role, 'member')))
          END
        END
      ) = ANY(q.roles)
  );
$function$


-- STAGE ONLY: production function definitions; ordinal rows 81-90 of 201.
-- Definitions captured read-only on 2026-10-14. Ordering is alphabetical, NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects must be reconciled separately.

CREATE OR REPLACE FUNCTION public.cl_user_in_group(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.group_id = p_group_id
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
      AND lower(coalesce(m.status, 'active')) = 'active'
  );
$function$


CREATE OR REPLACE FUNCTION public.cl_validate_group_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_assigned_group uuid; v_creator_group uuid; v_plan_group uuid; BEGIN IF NEW.assigned_to IS NOT NULL THEN SELECT m.group_id INTO v_assigned_group FROM public.members m WHERE m.id=NEW.assigned_to; IF v_assigned_group IS NULL OR v_assigned_group<>NEW.group_id THEN RAISE EXCEPTION 'Activity assignee does not belong to this group'; END IF; END IF; IF NEW.created_by IS NOT NULL THEN SELECT m.group_id INTO v_creator_group FROM public.members m WHERE m.id=NEW.created_by; IF v_creator_group IS NULL OR v_creator_group<>NEW.group_id THEN RAISE EXCEPTION 'Activity creator does not belong to this group'; END IF; END IF; IF NEW.plan_id IS NOT NULL THEN SELECT p.group_id INTO v_plan_group FROM public.group_plans p WHERE p.id=NEW.plan_id; IF v_plan_group IS NULL OR v_plan_group<>NEW.group_id THEN RAISE EXCEPTION 'Activity plan does not belong to this group'; END IF; END IF; RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_validate_group_asset()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_creator_group uuid; BEGIN IF NEW.created_by IS NOT NULL THEN SELECT m.group_id INTO v_creator_group FROM public.members m WHERE m.id=NEW.created_by; IF v_creator_group IS NULL OR v_creator_group<>NEW.group_id THEN RAISE EXCEPTION 'Asset creator does not belong to this group'; END IF; END IF; RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_validate_group_milestone()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_creator_group uuid; v_plan_group uuid; v_document_group uuid; BEGIN IF NEW.created_by IS NOT NULL THEN SELECT m.group_id INTO v_creator_group FROM public.members m WHERE m.id=NEW.created_by; IF v_creator_group IS NULL OR v_creator_group<>NEW.group_id THEN RAISE EXCEPTION 'Milestone creator does not belong to this group'; END IF; END IF; IF NEW.plan_id IS NOT NULL THEN SELECT p.group_id INTO v_plan_group FROM public.group_plans p WHERE p.id=NEW.plan_id; IF v_plan_group IS NULL OR v_plan_group<>NEW.group_id THEN RAISE EXCEPTION 'Milestone plan does not belong to this group'; END IF; END IF; IF NEW.document_id IS NOT NULL THEN SELECT d.group_id INTO v_document_group FROM public.documents d WHERE d.id=NEW.document_id; IF v_document_group IS NULL OR v_document_group<>NEW.group_id THEN RAISE EXCEPTION 'Milestone document does not belong to this group'; END IF; END IF; RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_validate_group_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_creator_group uuid; BEGIN IF NEW.created_by IS NOT NULL THEN SELECT m.group_id INTO v_creator_group FROM public.members m WHERE m.id=NEW.created_by; IF v_creator_group IS NULL OR v_creator_group<>NEW.group_id THEN RAISE EXCEPTION 'Plan creator does not belong to this group'; END IF; END IF; RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_validate_group_support_case()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_member_group uuid; v_approved_group uuid; v_created_group uuid; v_expense_group uuid; BEGIN SELECT m.group_id INTO v_member_group FROM public.members m WHERE m.id=NEW.member_id; IF v_member_group IS NULL THEN RAISE EXCEPTION 'Support member does not exist'; END IF; IF v_member_group<>NEW.group_id THEN RAISE EXCEPTION 'Support member does not belong to this group'; END IF; IF NEW.approved_by IS NOT NULL THEN SELECT m.group_id INTO v_approved_group FROM public.members m WHERE m.id=NEW.approved_by; IF v_approved_group IS NULL OR v_approved_group<>NEW.group_id THEN RAISE EXCEPTION 'Support approver does not belong to this group'; END IF; END IF; IF NEW.created_by IS NOT NULL THEN SELECT m.group_id INTO v_created_group FROM public.members m WHERE m.id=NEW.created_by; IF v_created_group IS NULL OR v_created_group<>NEW.group_id THEN RAISE EXCEPTION 'Support creator does not belong to this group'; END IF; END IF; IF NEW.expense_id IS NOT NULL THEN SELECT e.group_id INTO v_expense_group FROM public.expenses e WHERE e.id=NEW.expense_id; IF v_expense_group IS NULL OR v_expense_group<>NEW.group_id THEN RAISE EXCEPTION 'Support expense does not belong to this group'; END IF; END IF; IF NEW.status='paid' AND NEW.expense_id IS NULL THEN RAISE EXCEPTION 'Paid support cases must reference an expense'; END IF; RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.claim_member_account(p_membership_number text, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
  v_email text := lower(trim(coalesce(p_email,'')));
  v_number text := trim(coalesce(p_membership_number,''));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if v_email = '' or v_number = '' then
    raise exception 'Membership number and email are required';
  end if;

  select * into v_member
  from public.members m
  where lower(coalesce(m.email,'')) = v_email
    and (m.membership_number = v_number or m.member_number = v_number)
    and m.auth_user_id is null
    and m.onboarding_status in ('pending','invited')
    and lower(coalesce(m.status,'active')) = 'active'
  limit 1;

  if not found then
    raise exception 'No pending member account matches those details';
  end if;

  if exists (select 1 from public.members m where m.auth_user_id = v_uid) then
    raise exception 'This login is already linked to a member';
  end if;

  update public.members
  set user_id = v_uid,
      auth_user_id = v_uid,
      onboarding_status = 'active',
      activated_at = coalesce(activated_at, now())
  where id = v_member.id;

  return jsonb_build_object(
    'success', true,
    'member_id', v_member.id,
    'group_id', v_member.group_id,
    'role', v_member.role,
    'name', v_member.name,
    'membership_number', v_member.membership_number
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.close_contribution_initiative(p_initiative_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_i public.contribution_initiatives; v_existing jsonb; v_claimed boolean;
BEGIN
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'close_initiative','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN SELECT result INTO v_existing FROM private.contribution_initiative_requests WHERE request_id=p_request_id AND operation='close_initiative'; RETURN v_existing; END IF;

  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_i.status <> 'active' THEN RAISE EXCEPTION 'Initiative is not active'; END IF;
  UPDATE public.contribution_initiatives SET status='closed',updated_at=now() WHERE id=v_i.id;
  v_existing=jsonb_build_object('status','closed','initiative_id',v_i.id);
  UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_existing WHERE request_id=p_request_id AND operation='close_initiative';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.close_financial_month(p_group_id uuid, p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_period public.financial_periods%rowtype;
  v_report jsonb;
  v_closing numeric;
  v_member_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_group_id IS NULL
     OR p_month IS NULL
     OR p_month !~ '^[0-9]{4}-[0-9]{2}$'
  THEN
    RAISE EXCEPTION 'Group and month YYYY-MM are required';
  END IF;

  IF NOT public.cl_user_has_role(
    p_group_id,
    ARRAY['admin','treasurer','secretary']::text[]
  ) THEN
    RAISE EXCEPTION
      'You are not authorized to close financial months for this group';
  END IF;

  PERFORM public.cl_2b_accounting_lock(p_group_id,p_month);

  SELECT fp.*
    INTO v_period
  FROM public.financial_periods fp
  WHERE fp.group_id=p_group_id
    AND fp.month=p_month
  FOR UPDATE;

  IF NOT FOUND THEN
    v_period := public.ensure_financial_period(
      p_group_id,p_month
    );
  END IF;

  IF lower(coalesce(v_period.status,'open'))='closed' THEN
    RAISE EXCEPTION
      'Financial month % is already closed',p_month;
  END IF;

  v_report := public.get_monthly_financial_report(
    p_group_id,p_month
  );

  v_closing :=
    coalesce((v_report->>'closing_balance')::numeric,0);

  UPDATE public.financial_periods
  SET closing_balance=v_closing,
      status='closed',
      closed_at=now(),
      closed_by=auth.uid()
  WHERE id=v_period.id;

  SELECT m.id
    INTO v_member_id
  FROM public.members m
  WHERE m.group_id=p_group_id
    AND (m.auth_user_id=auth.uid() OR m.user_id=auth.uid())
  ORDER BY
    CASE WHEN m.auth_user_id=auth.uid() THEN 0 ELSE 1 END,
    m.id
  LIMIT 1;

  INSERT INTO public.monthly_closings (
    group_id,closing_month,closed_by,closed_at,
    total_expected,total_collected,total_expenses,
    closing_balance,notes
  )
  VALUES (
    p_group_id,
    (p_month||'-01')::date,
    auth.uid(),
    now(),
    coalesce(
      (v_report->>'expected_monthly_contributions')::numeric,0
    ),
    coalesce(
      (v_report->>'total_contributions_collected')::numeric,0
    ),
    coalesce((v_report->>'approved_expenses')::numeric,0),
    v_closing,
    'Closed through CHAMA LIVE financial period.'
  )
  ON CONFLICT (group_id,closing_month)
  DO UPDATE SET
    closed_by=EXCLUDED.closed_by,
    closed_at=EXCLUDED.closed_at,
    total_expected=EXCLUDED.total_expected,
    total_collected=EXCLUDED.total_collected,
    total_expenses=EXCLUDED.total_expenses,
    closing_balance=EXCLUDED.closing_balance,
    notes=EXCLUDED.notes;

  RETURN public.get_monthly_financial_report(
    p_group_id,p_month
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.close_month(p_group_id uuid, p_month text, p_notes text DEFAULT NULL::text)
 RETURNS monthly_closings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_report jsonb;
  v_result public.monthly_closings;
BEGIN
  v_report := public.close_financial_month(p_group_id, p_month);

  IF p_notes IS NOT NULL THEN
    UPDATE public.monthly_closings
    SET notes = p_notes
    WHERE group_id = p_group_id
      AND closing_month = (p_month || '-01')::date;
  END IF;

  SELECT *
  INTO v_result
  FROM public.monthly_closings
  WHERE group_id = p_group_id
    AND closing_month = (p_month || '-01')::date
  LIMIT 1;

  RETURN v_result;
END;
$function$


-- STAGE ONLY: production function definitions; ordinal rows 91-100 of 201.
-- Definitions captured read-only on 2026-10-14. Ordering is alphabetical, NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects must be reconciled separately.

CREATE OR REPLACE FUNCTION public.complete_group_onboarding(p_group_name text, p_monthly_contribution numeric, p_opening_balance numeric DEFAULT 0, p_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_role text DEFAULT 'admin'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$

declare

  v_uid uuid := auth.uid();

  v_result jsonb;

begin

  if v_uid is null then
    raise exception 'Authentication required';
  end if;


  if lower(
    coalesce(p_role, 'admin')
  ) not in (
    'admin',
    'chairperson'
  ) then

    raise exception
      'Only admin or chairperson can create a group';

  end if;


  /*
   * Save the onboarding request against
   * the authenticated user.
   */

  perform public.save_pending_onboarding(

    p_group_name,

    'other',

    p_monthly_contribution,

    p_opening_balance,

    null,

    p_name,

    p_phone,

    'Kenya'

  );


  /*
   * If the user is already authenticated,
   * complete immediately.
   */

  v_result :=
    public.onboard_new_group();


  return
    v_result ||
    jsonb_build_object(
      'role',
      lower(
        coalesce(
          p_role,
          'admin'
        )
      )
    );

end;

$function$


CREATE OR REPLACE FUNCTION public.confirm_subscription_payment(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_auth_uid uuid;
    v_payment public.subscription_payments%ROWTYPE;
    v_invoice public.subscription_invoices%ROWTYPE;
    v_subscription public.group_subscriptions%ROWTYPE;
    v_cycle public.subscription_cycles%ROWTYPE;

    v_payment_ids uuid[];
    v_credit_ids uuid[];
    v_allocation_ids uuid[];
    v_lock_id uuid;

    v_applied_current numeric := 0;
    v_available_current numeric := 0;
    v_invoice_applied numeric := 0;
    v_invoice_outstanding numeric := 0;

    v_credit RECORD;
    v_credit_applied numeric;
    v_credit_remaining numeric;
    v_allocate numeric;
    v_now timestamptz := clock_timestamp();
BEGIN
    v_auth_uid := auth.uid();

    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'Authenticated user required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Platform administrator privileges required'
            USING ERRCODE = '42501';
    END IF;

    SELECT sp.* INTO v_payment
    FROM public.subscription_payments AS sp
    WHERE sp.id = p_payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription payment % does not exist', p_payment_id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT si.* INTO v_invoice
    FROM public.subscription_invoices AS si
    WHERE si.id = v_payment.invoice_id
      AND si.group_id = v_payment.group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment % does not resolve to its authoritative invoice', p_payment_id
            USING ERRCODE = '23503';
    END IF;

    SELECT gs.* INTO v_subscription
    FROM public.group_subscriptions AS gs
    WHERE gs.id = v_invoice.subscription_id
      AND gs.group_id = v_invoice.group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice % does not resolve to its authoritative subscription', v_invoice.id
            USING ERRCODE = '23503';
    END IF;

    SELECT array_agg(x.payment_id ORDER BY x.payment_id)
    INTO v_payment_ids
    FROM (
        SELECT v_payment.id AS payment_id
        UNION
        SELECT sp.id
        FROM public.subscription_payments AS sp
        JOIN public.subscription_credits AS c
          ON c.source_payment_id = sp.id
        JOIN public.subscription_invoices AS si
          ON si.id = sp.invoice_id
         AND si.group_id = sp.group_id
        WHERE c.status IN ('active', 'exhausted')
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
    ) AS x;

    SELECT array_agg(c.id ORDER BY c.created_at, c.id)
    INTO v_credit_ids
    FROM public.subscription_credits AS c
    JOIN public.subscription_payments AS sp
      ON sp.id = c.source_payment_id
    JOIN public.subscription_invoices AS si
      ON si.id = sp.invoice_id
     AND si.group_id = sp.group_id
    WHERE c.status IN ('active', 'exhausted')
      AND si.subscription_id = v_subscription.id
      AND si.group_id = v_subscription.group_id;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'chama_live_subscription:' || v_subscription.id::text,
            0
        )
    );

    SELECT gs.* INTO v_subscription
    FROM public.group_subscriptions AS gs
    WHERE gs.id = v_invoice.subscription_id
      AND gs.group_id = v_invoice.group_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice % no longer resolves to its subscription', v_invoice.id
            USING ERRCODE = '23503';
    END IF;

    SELECT sp.* INTO v_payment
    FROM public.subscription_payments AS sp
    WHERE sp.id = p_payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription payment % does not exist', p_payment_id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT si.* INTO v_invoice
    FROM public.subscription_invoices AS si
    WHERE si.id = v_payment.invoice_id
      AND si.group_id = v_payment.group_id;

    IF NOT FOUND OR v_invoice.subscription_id <> v_subscription.id THEN
        RAISE EXCEPTION 'Payment % no longer resolves to its authoritative invoice/subscription', p_payment_id
            USING ERRCODE = '23503';
    END IF;

    SELECT array_agg(x.payment_id ORDER BY x.payment_id)
    INTO v_payment_ids
    FROM (
        SELECT v_payment.id AS payment_id
        UNION
        SELECT sp.id
        FROM public.subscription_payments AS sp
        JOIN public.subscription_credits AS c
          ON c.source_payment_id = sp.id
        JOIN public.subscription_invoices AS si
          ON si.id = sp.invoice_id
         AND si.group_id = sp.group_id
        WHERE c.status IN ('active', 'exhausted')
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
    ) AS x;

    FOR v_lock_id IN
        SELECT unnest(v_payment_ids)
        ORDER BY 1
    LOOP
        PERFORM 1
        FROM public.subscription_payments AS sp
        WHERE sp.id = v_lock_id
        FOR UPDATE;
    END LOOP;

    SELECT si.* INTO v_invoice
    FROM public.subscription_invoices AS si
    WHERE si.id = v_payment.invoice_id
      AND si.group_id = v_payment.group_id
      AND si.subscription_id = v_subscription.id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment % destination invoice is unavailable', p_payment_id
            USING ERRCODE = '23503';
    END IF;

    SELECT array_agg(c.id ORDER BY c.created_at, c.id)
    INTO v_credit_ids
    FROM public.subscription_credits AS c
    JOIN public.subscription_payments AS sp
      ON sp.id = c.source_payment_id
    JOIN public.subscription_invoices AS si
      ON si.id = sp.invoice_id
     AND si.group_id = sp.group_id
    WHERE c.status IN ('active', 'exhausted')
      AND si.subscription_id = v_subscription.id
      AND si.group_id = v_subscription.group_id;

    IF v_credit_ids IS NOT NULL THEN
        FOR v_lock_id IN
            SELECT c.id
            FROM public.subscription_credits AS c
            WHERE c.id = ANY(v_credit_ids)
            ORDER BY c.created_at, c.id
        LOOP
            PERFORM 1
            FROM public.subscription_credits AS c
            WHERE c.id = v_lock_id
            FOR UPDATE;
        END LOOP;
    END IF;

    SELECT sc.* INTO v_cycle
    FROM public.subscription_cycles AS sc
    WHERE sc.id = v_invoice.cycle_id
      AND sc.subscription_id = v_subscription.id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription cycle % not found for subscription %',
            v_invoice.cycle_id, v_subscription.id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT sp.* INTO v_payment
    FROM public.subscription_payments AS sp
    WHERE sp.id = p_payment_id;

    IF v_payment.status = 'confirmed' THEN
        SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
        INTO v_applied_current
        FROM public.subscription_payment_allocations AS a
        WHERE a.payment_id = v_payment.id;

        IF v_applied_current > v_payment.amount THEN
            RAISE EXCEPTION 'Payment % has allocations exceeding its source amount', v_payment.id;
        END IF;

        RETURN jsonb_build_object(
            'status', 'already_confirmed',
            'payment_id', v_payment.id,
            'invoice_id', v_invoice.id,
            'subscription_id', v_subscription.id,
            'payment_amount', v_payment.amount,
            'applied_amount', v_applied_current,
            'remaining_amount', GREATEST(v_payment.amount - v_applied_current, 0)
        );
    END IF;

    IF v_payment.status <> 'pending' THEN
        RAISE EXCEPTION 'Payment % cannot be confirmed from status %', v_payment.id, v_payment.status
            USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
    INTO v_applied_current
    FROM public.subscription_payment_allocations AS a
    WHERE a.payment_id = v_payment.id;

    IF v_applied_current <> 0 THEN
        RAISE EXCEPTION 'Pending payment % already has allocations', v_payment.id;
    END IF;

    SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
    INTO v_invoice_applied
    FROM public.subscription_payment_allocations AS a
    WHERE a.invoice_id = v_invoice.id;

    IF v_invoice_applied > v_invoice.total_amount THEN
        RAISE EXCEPTION 'Invoice % has allocations exceeding invoice total', v_invoice.id;
    END IF;

    v_invoice_outstanding := GREATEST(v_invoice.total_amount - v_invoice_applied, 0);

    FOR v_credit IN
        SELECT c.id, c.source_payment_id, c.original_amount, c.status, c.created_at,
               sp.amount AS source_payment_amount,
               si.subscription_id AS source_subscription_id,
               si.group_id AS source_group_id
        FROM public.subscription_credits AS c
        JOIN public.subscription_payments AS sp ON sp.id = c.source_payment_id
        JOIN public.subscription_invoices AS si
          ON si.id = sp.invoice_id AND si.group_id = sp.group_id
        WHERE c.status IN ('active', 'exhausted')
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
        ORDER BY c.created_at, c.id
    LOOP
        EXIT WHEN v_invoice_outstanding <= 0;

        IF v_credit.source_subscription_id <> v_subscription.id
           OR v_credit.source_group_id <> v_subscription.group_id THEN
            RAISE EXCEPTION 'Cross-subscription credit allocation rejected';
        END IF;

        SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
        INTO v_credit_applied
        FROM public.subscription_payment_allocations AS a
        WHERE a.payment_id = v_credit.source_payment_id;

        IF v_credit_applied > v_credit.source_payment_amount THEN
            RAISE EXCEPTION 'Source payment % has allocations exceeding its amount', v_credit.source_payment_id;
        END IF;

        SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
        INTO v_credit_applied
        FROM public.subscription_payment_allocations AS a
        WHERE a.credit_id = v_credit.id;

        IF v_credit_applied > v_credit.original_amount THEN
            RAISE EXCEPTION 'Credit % has allocations exceeding its original amount', v_credit.id;
        END IF;

        v_credit_remaining := GREATEST(v_credit.original_amount - v_credit_applied, 0);

        IF v_credit_remaining <= 0 THEN
            UPDATE public.subscription_credits
            SET status = 'exhausted'
            WHERE id = v_credit.id AND status <> 'reversed';
            CONTINUE;
        END IF;

        v_allocate := LEAST(v_credit_remaining, v_invoice_outstanding);

        IF v_allocate > 0 THEN
            INSERT INTO public.subscription_payment_allocations (
                payment_id, invoice_id, allocation_type, credit_id, amount, status
            ) VALUES (
                v_credit.source_payment_id, v_invoice.id, 'credit', v_credit.id, v_allocate, 'active'
            );

            v_invoice_outstanding := GREATEST(v_invoice_outstanding - v_allocate, 0);

            SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
            INTO v_credit_applied
            FROM public.subscription_payment_allocations AS a
            WHERE a.credit_id = v_credit.id;

            IF v_credit_applied > v_credit.original_amount THEN
                RAISE EXCEPTION 'Credit % exceeded during allocation', v_credit.id;
            END IF;

            UPDATE public.subscription_credits
            SET status = CASE
                WHEN v_credit_applied >= original_amount THEN 'exhausted'
                ELSE 'active'
            END
            WHERE id = v_credit.id AND status <> 'reversed';
        END IF;
    END LOOP;

    IF v_invoice_outstanding > 0 THEN
        v_available_current := GREATEST(v_payment.amount - v_applied_current, 0);
        v_allocate := LEAST(v_available_current, v_invoice_outstanding);

        IF v_allocate > 0 THEN
            INSERT INTO public.subscription_payment_allocations (
                payment_id, invoice_id, allocation_type, credit_id, amount, status
            ) VALUES (
                v_payment.id, v_invoice.id, 'direct', NULL, v_allocate, 'active'
            );
            v_applied_current := v_applied_current + v_allocate;
            v_invoice_outstanding := GREATEST(v_invoice_outstanding - v_allocate, 0);
        END IF;
    END IF;

    IF v_applied_current > v_payment.amount THEN
        RAISE EXCEPTION 'Payment % allocations exceed payment amount', v_payment.id;
    END IF;

    v_available_current := GREATEST(v_payment.amount - v_applied_current, 0);

    IF v_available_current > 0 THEN
        INSERT INTO public.subscription_credits (source_payment_id, original_amount, status)
        VALUES (v_payment.id, v_available_current, 'active');
    END IF;

    UPDATE public.subscription_payments
    SET status = 'confirmed', paid_at = COALESCE(paid_at, v_now)
    WHERE id = v_payment.id AND status = 'pending';

    PERFORM private.append_platform_activity(
        'subscription_payment_confirmed',
        jsonb_build_object(
            'payment_id', v_payment.id,
            'invoice_id', v_invoice.id,
            'subscription_id', v_subscription.id,
            'amount', v_payment.amount
        )
    );

    SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
    INTO v_invoice_applied
    FROM public.subscription_payment_allocations AS a
    WHERE a.invoice_id = v_invoice.id;

    IF v_invoice.total_amount = 0 THEN
        UPDATE public.subscription_invoices
        SET status = 'paid', paid_at = COALESCE(paid_at, v_now)
        WHERE id = v_invoice.id;
    ELSIF v_invoice_applied >= v_invoice.total_amount THEN
        UPDATE public.subscription_invoices
        SET status = 'paid', paid_at = COALESCE(paid_at, v_now)
        WHERE id = v_invoice.id;
    ELSIF v_invoice_applied > 0 THEN
        UPDATE public.subscription_invoices
        SET status = 'partially_paid', paid_at = NULL
        WHERE id = v_invoice.id;
    ELSIF v_invoice.due_at IS NOT NULL AND v_now > v_invoice.due_at THEN
        UPDATE public.subscription_invoices
        SET status = 'overdue', paid_at = NULL
        WHERE id = v_invoice.id;
    ELSE
        UPDATE public.subscription_invoices
        SET status = 'issued', paid_at = NULL
        WHERE id = v_invoice.id;
    END IF;

    SELECT si.status INTO v_invoice.status
    FROM public.subscription_invoices AS si
    WHERE si.id = v_invoice.id;

    IF v_invoice.status = 'paid' THEN
        UPDATE public.subscription_cycles SET status = 'paid'
        WHERE id = v_cycle.id AND subscription_id = v_subscription.id;
    ELSIF v_invoice.status = 'overdue' THEN
        UPDATE public.subscription_cycles SET status = 'overdue'
        WHERE id = v_cycle.id AND subscription_id = v_subscription.id;
    ELSE
        UPDATE public.subscription_cycles SET status = 'invoiced'
        WHERE id = v_cycle.id AND subscription_id = v_subscription.id;
    END IF;

    RETURN jsonb_build_object(
        'status', 'confirmed',
        'payment_id', v_payment.id,
        'invoice_id', v_invoice.id,
        'subscription_id', v_subscription.id,
        'payment_amount', v_payment.amount,
        'applied_amount', v_applied_current,
        'credit_created', v_available_current,
        'invoice_status', v_invoice.status
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.create_and_record_automatic_charge_payment(p_obligation_id uuid, p_charge_type text, p_payment_id uuid, p_amount numeric)
 RETURNS charge_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_obligation public.contribution_obligations%rowtype;
    v_charge public.financial_charges%rowtype;
    v_payment public.contributions%rowtype;
    v_period public.financial_periods%rowtype;
    v_accounting_month text;
    v_applied numeric(14,2);
    v_remaining numeric(14,2);
    v_result public.charge_payments%rowtype;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_obligation_id IS NULL
       OR p_payment_id IS NULL
       OR p_charge_type IS NULL
       OR length(trim(p_charge_type)) = 0
    THEN
        RAISE EXCEPTION 'Obligation, charge type and payment are required';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Charge allocation amount must be greater than zero';
    END IF;

    IF p_amount <> round(p_amount, 2) THEN
        RAISE EXCEPTION 'Charge allocation amount must have no more than two decimal places';
    END IF;

    p_charge_type := lower(pg_catalog.btrim(p_charge_type));

    -- Canonical global lock order for this path:
    --   authoritative accounting key read (no row lock)
    --   -> accounting advisory lock
    --   -> obligation FOR UPDATE
    --   -> period lock
    --   -> automatic charge FOR UPDATE
    --   -> payment FOR SHARE.
    -- This matches cl_2b_record_contribution()/cl_2b_refresh_member(),
    -- which acquire accounting locks before obligation work.
    -- The initial obligation read supplies only the serialization key.
    -- The authoritative row is locked and re-read after the accounting lock;
    -- a changed group/month aborts instead of using a stale lock key.
    SELECT co.*
      INTO v_obligation
    FROM public.contribution_obligations co
    WHERE co.id = p_obligation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contribution obligation % does not exist', p_obligation_id;
    END IF;

    v_accounting_month := pg_catalog.to_char(v_obligation.obligation_month, 'YYYY-MM');

    IF NOT public.cl_user_has_role(
        v_obligation.group_id,
        ARRAY['admin','chairperson','secretary','treasurer']::text[]
    ) THEN
        RAISE EXCEPTION 'Finance authorization required';
    END IF;

    PERFORM public.cl_2b_accounting_lock(
        v_obligation.group_id,
        v_accounting_month
    );

    SELECT co.*
      INTO v_obligation
    FROM public.contribution_obligations co
    WHERE co.id = p_obligation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contribution obligation % does not exist', p_obligation_id;
    END IF;

    IF v_obligation.group_id IS NULL
       OR pg_catalog.to_char(v_obligation.obligation_month, 'YYYY-MM') IS DISTINCT FROM v_accounting_month
    THEN
        RAISE EXCEPTION 'Contribution obligation % changed during accounting serialization', p_obligation_id;
    END IF;

    v_period := public.ensure_financial_period(
        v_obligation.group_id,
        v_accounting_month
    );

    IF lower(coalesce(v_period.status, 'open')) = 'closed' THEN
        RAISE EXCEPTION 'Financial period % is closed', v_accounting_month;
    END IF;

    -- Re-read under the row lock after serialization. The month/group/member
    -- must remain the same authoritative values used for the accounting lock.
    SELECT co.*
      INTO v_obligation
    FROM public.contribution_obligations co
    WHERE co.id = p_obligation_id
    FOR UPDATE;

    IF v_obligation.group_id IS NULL
       OR pg_catalog.to_char(v_obligation.obligation_month, 'YYYY-MM') IS DISTINCT FROM v_accounting_month
    THEN
        RAISE EXCEPTION 'Contribution obligation % changed during accounting serialization', p_obligation_id;
    END IF;

    SELECT fc.*
      INTO v_charge
    FROM public.financial_charges fc
    WHERE fc.obligation_id = p_obligation_id
      AND fc.charge_type = p_charge_type
      AND fc.source = 'automatic'
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.financial_charges (
            group_id,
            member_id,
            obligation_id,
            charge_type,
            source,
            accounting_month,
            amount,
            currency,
            charge_date,
            status
        )
        VALUES (
            v_obligation.group_id,
            v_obligation.member_id,
            v_obligation.id,
            p_charge_type,
            'automatic',
            v_accounting_month,
            v_obligation.due_amount,
            'KES',
            current_date,
            'open'
        )
        RETURNING * INTO v_charge;
    END IF;

    IF v_charge.accounting_month IS DISTINCT FROM v_accounting_month
       OR v_charge.group_id IS DISTINCT FROM v_obligation.group_id
       OR v_charge.member_id IS DISTINCT FROM v_obligation.member_id
       OR v_charge.obligation_id IS DISTINCT FROM v_obligation.id
       OR v_charge.source IS DISTINCT FROM 'automatic'
       OR v_charge.charge_type IS DISTINCT FROM p_charge_type
       OR v_charge.amount IS DISTINCT FROM v_obligation.due_amount
    THEN
        RAISE EXCEPTION 'Automatic financial charge % is inconsistent with its obligation contract', v_charge.id;
    END IF;

    IF v_charge.status = 'cancelled' THEN
        RAISE EXCEPTION 'Financial charge % is cancelled', v_charge.id;
    END IF;

    SELECT c.*
      INTO v_payment
    FROM public.contributions c
    WHERE c.id = p_payment_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
    END IF;

    IF v_payment.group_id <> v_obligation.group_id
       OR v_payment.member_id <> v_obligation.member_id
       OR v_payment.group_id <> v_charge.group_id
       OR v_payment.member_id <> v_charge.member_id
    THEN
        RAISE EXCEPTION 'Payment % does not belong to automatic charge group/member',
            p_payment_id;
    END IF;

    SELECT COALESCE(SUM(cp.amount_applied), 0)::numeric(14,2)
      INTO v_applied
    FROM public.charge_payments cp
    WHERE cp.charge_id = v_charge.id
      AND cp.status = 'applied';

    v_remaining := v_charge.amount - v_applied;

    IF v_remaining <= 0 THEN
        RAISE EXCEPTION 'Financial charge % has no remaining balance', v_charge.id;
    END IF;

    IF p_amount > v_remaining THEN
        RAISE EXCEPTION 'Allocation %.2f exceeds remaining charge balance %.2f',
            p_amount, v_remaining;
    END IF;

    INSERT INTO public.charge_payments (
        charge_id, payment_id, amount_applied
    )
    VALUES (
        v_charge.id, p_payment_id, p_amount
    )
    RETURNING * INTO v_result;

    UPDATE public.financial_charges
       SET status = CASE
           WHEN v_applied + p_amount = amount THEN 'paid'
           ELSE 'open'
       END
     WHERE id = v_charge.id;

    RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_contribution_initiative(p_group_id uuid, p_name text, p_description text, p_contribution_type_id uuid, p_start_date date, p_closing_date date, p_default_amount numeric, p_frequency text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_existing jsonb; v_id uuid; v_group uuid; v_claimed boolean;
BEGIN
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'create_initiative','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT result INTO v_existing FROM private.contribution_initiative_requests WHERE request_id=p_request_id AND operation='create_initiative';
    RETURN v_existing;
  END IF;
  IF NOT public.can_manage_members(p_group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_name IS NULL OR length(trim(p_name))=0 OR p_start_date > p_closing_date OR p_default_amount < 0 OR p_frequency NOT IN ('one_time','monthly') THEN RAISE EXCEPTION 'Invalid initiative terms'; END IF;
  SELECT group_id INTO v_group FROM public.contribution_types WHERE id=p_contribution_type_id;
  IF v_group IS DISTINCT FROM p_group_id THEN RAISE EXCEPTION 'Contribution type does not belong to group'; END IF;
  INSERT INTO public.contribution_initiatives(group_id,contribution_type_id,name,description,start_date,closing_date,default_amount,frequency,status,created_by)
  VALUES(p_group_id,p_contribution_type_id,trim(p_name),p_description,p_start_date,p_closing_date,p_default_amount,p_frequency,'draft',auth.uid())
  RETURNING id INTO v_id;
  v_existing=jsonb_build_object('status','created','initiative_id',v_id);
  UPDATE private.contribution_initiative_requests SET initiative_id=v_id,group_id=p_group_id,result=v_existing WHERE request_id=p_request_id AND operation='create_initiative';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_custom_contribution(p_group_id uuid, p_name text, p_description text, p_amount numeric, p_frequency text, p_start_date date, p_due_date date, p_closing_date date, p_grace_period_value integer, p_apply_fine boolean, p_fine_amount numeric, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_auth_user_id uuid:=auth.uid(); v_member_id uuid; v_type_id uuid; v_period_id uuid; v_fine_rule_id uuid:=NULL;
 v_period_key text; v_payload jsonb; v_payload_hash text; v_result jsonb; v_existing_hash text; v_existing_result jsonb;
BEGIN
 IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_group_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'GROUP_ID_AND_REQUEST_ID_REQUIRED' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.id=p_group_id AND g.owner_user_id=v_auth_user_id)
 AND NOT public.cl_user_has_role(p_group_id,ARRAY['chairperson','treasurer']::text[]) THEN RAISE EXCEPTION 'CUSTOM_CONTRIBUTION_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT m.id INTO v_member_id FROM public.members m WHERE m.group_id=p_group_id AND (m.user_id=v_auth_user_id OR m.auth_user_id=v_auth_user_id) AND lower(coalesce(m.status,'active'))='active' AND lower(coalesce(m.onboarding_status,'active'))='active' ORDER BY m.id LIMIT 1;
 IF v_member_id IS NULL THEN RAISE EXCEPTION 'ACTIVE_GROUP_MEMBER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF nullif(trim(coalesce(p_name,'')),'') IS NULL THEN RAISE EXCEPTION 'CONTRIBUTION_NAME_REQUIRED' USING ERRCODE='22023'; END IF;
 IF p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'CONTRIBUTION_AMOUNT_MUST_BE_POSITIVE' USING ERRCODE='22023'; END IF;
 IF p_frequency IS NULL OR p_frequency NOT IN ('one_time','weekly','monthly','quarterly','annual') THEN RAISE EXCEPTION 'INVALID_CUSTOM_CONTRIBUTION_FREQUENCY' USING ERRCODE='22023'; END IF;
 IF p_start_date IS NULL OR p_due_date IS NULL OR p_closing_date IS NULL THEN RAISE EXCEPTION 'START_DUE_CLOSING_DATES_REQUIRED' USING ERRCODE='22023'; END IF;
 IF p_start_date>p_due_date OR p_due_date>p_closing_date THEN RAISE EXCEPTION 'INVALID_CUSTOM_CONTRIBUTION_DATE_RANGE' USING ERRCODE='22023'; END IF;
 IF p_grace_period_value IS NULL OR p_grace_period_value<0 THEN RAISE EXCEPTION 'INVALID_GRACE_PERIOD' USING ERRCODE='22023'; END IF;
 IF p_apply_fine IS NULL THEN RAISE EXCEPTION 'APPLY_FINE_REQUIRED' USING ERRCODE='22023'; END IF;
 IF p_apply_fine AND (p_fine_amount IS NULL OR p_fine_amount<=0) THEN RAISE EXCEPTION 'FINE_AMOUNT_MUST_BE_POSITIVE_WHEN_ENABLED' USING ERRCODE='22023'; END IF;
 IF NOT p_apply_fine THEN p_fine_amount:=NULL; END IF;
 v_payload:=jsonb_build_object('group_id',p_group_id,'name',trim(p_name),'description',coalesce(p_description,''),'amount',p_amount,'frequency',p_frequency,'start_date',p_start_date,'due_date',p_due_date,'closing_date',p_closing_date,'grace_period_value',p_grace_period_value,'apply_fine',p_apply_fine,'fine_amount',CASE WHEN p_apply_fine THEN p_fine_amount ELSE NULL END);
 v_payload_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('chama-live:custom-contribution-request:'||p_request_id::text||':create',0));
 SELECT r.payload_hash,r.result INTO v_existing_hash,v_existing_result FROM private.custom_contribution_requests r WHERE r.request_id=p_request_id AND r.operation='create' FOR UPDATE;
 IF v_existing_hash IS NOT NULL THEN
  IF v_existing_hash<>v_payload_hash THEN RAISE EXCEPTION 'REQUEST_ID_REUSE_MISMATCH' USING ERRCODE='22023'; END IF;
  IF v_existing_result IS NULL THEN RAISE EXCEPTION 'REQUEST_ALREADY_CLAIMED_WITHOUT_RESULT' USING ERRCODE='55000'; END IF;
  RETURN jsonb_set(v_existing_result,'{replayed}','true'::jsonb,true);
 END IF;
 INSERT INTO private.custom_contribution_requests(request_id,operation,group_id,payload_hash) VALUES(p_request_id,'create',p_group_id,v_payload_hash);
 INSERT INTO public.contribution_types(group_id,name,code,created_by) VALUES(p_group_id,trim(p_name),'custom',v_member_id) RETURNING id INTO v_type_id;
 v_period_key:='custom:v1:'||v_type_id::text||':'||to_char(p_start_date,'YYYY-MM-DD')||':'||to_char(p_due_date,'YYYY-MM-DD')||':'||to_char(p_closing_date,'YYYY-MM-DD');
 IF p_apply_fine THEN
  INSERT INTO public.fine_rules(group_id,name,description,trigger_type,specificity_level,priority,calculation_method,fixed_amount,percentage_rate,minimum_amount,maximum_amount,grace_period_value,grace_period_unit,applicability_mode,effective_from,effective_until,status,created_by,updated_by)
  VALUES(p_group_id,trim(p_name)||' Fine','Automatic fixed fine for missed '||trim(p_name)||' contribution.','missed_contribution',1,0,'FIXED',p_fine_amount,NULL,NULL,NULL,p_grace_period_value,'DAY','ALL',p_start_date::timestamp AT TIME ZONE 'UTC',NULL,'active',v_member_id,v_member_id) RETURNING id INTO v_fine_rule_id;
  INSERT INTO public.fine_rule_contribution_types(rule_id,contribution_type_id) VALUES(v_fine_rule_id,v_type_id);
 END IF;
 INSERT INTO public.contribution_periods(group_id,contribution_type_id,frequency,period_key,opening_date,closing_date,due_date,status,created_by,name,description,amount,fine_rule_id)
 VALUES(p_group_id,v_type_id,p_frequency,v_period_key,p_start_date,p_closing_date,p_due_date,'draft',v_member_id,trim(p_name),NULLIF(trim(coalesce(p_description,'')),''),p_amount,v_fine_rule_id) RETURNING id INTO v_period_id;
 v_result:=jsonb_build_object('ok',true,'operation','create','replayed',false,'contribution_type_id',v_type_id,'period_id',v_period_id,'fine_rule_id',v_fine_rule_id,'status','draft','period_key',v_period_key);
 UPDATE private.custom_contribution_requests SET contribution_type_id=v_type_id,period_id=v_period_id,fine_rule_id=v_fine_rule_id,result=v_result,completed_at=now() WHERE request_id=p_request_id AND operation='create';
 RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_group(p_name text, p_category text DEFAULT 'other'::text, p_monthly_contribution numeric DEFAULT 0, p_description text DEFAULT NULL::text, p_admin_name text DEFAULT NULL::text, p_admin_phone text DEFAULT NULL::text, p_country text DEFAULT 'Kenya'::text)
 RETURNS TABLE(group_id uuid, access_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  new_group_id uuid;
  new_access_code text;
  admin_email text;
  resolved_name text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_name is null or trim(p_name) = '' then raise exception 'Group name is required'; end if;

  new_access_code := generate_group_access_code(p_name);

  insert into groups (
    name, category, monthly_contribution, description, country, access_code
  )
  values (
    trim(p_name), coalesce(p_category, 'other'), coalesce(p_monthly_contribution, 0),
    p_description, coalesce(nullif(trim(p_country), ''), 'Kenya'), new_access_code
  )
  returning id into new_group_id;

  select email into admin_email from auth.users where id = auth.uid();

  resolved_name := coalesce(
    nullif(trim(p_admin_name), ''),
    split_part(admin_email, '@', 1),
    'Admin'
  );

  insert into members (
    group_id, user_id, member_number, name, phone, role, status
  )
  values (
    new_group_id, auth.uid(),
    'ADM-' || to_char(now(), 'YYYYMMDDHH24MISS'),
    resolved_name, coalesce(nullif(trim(p_admin_phone), ''), ''),
    'admin', 'active'
  );

  INSERT INTO contribution_types (group_id, name, code)
  SELECT new_group_id, 'Monthly', 'monthly'
  WHERE NOT EXISTS (
    SELECT 1 FROM contribution_types ct
    WHERE ct.group_id = new_group_id
      AND (
        lower(trim(ct.name)) = 'monthly'
        OR lower(trim(coalesce(ct.code, ''))) = 'monthly'
      )
  );

  return query select new_group_id, new_access_code;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_group_account(p_name text, p_category text DEFAULT NULL::text, p_monthly_contribution numeric DEFAULT 0, p_description text DEFAULT NULL::text, p_admin_name text DEFAULT NULL::text, p_admin_phone text DEFAULT NULL::text, p_country text DEFAULT 'Kenya'::text)
 RETURNS TABLE(group_id uuid, access_code text, member_id uuid, member_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
  v_member_id uuid;
  v_access_code text;
  v_member_number text;
  v_email text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Group name is required'; end if;
  if coalesce(p_monthly_contribution, 0) < 0 then raise exception 'Monthly contribution must be zero or greater'; end if;

  select email into v_email from auth.users where id = v_uid;

  if exists (
    select 1 from public.members m
    where (m.user_id = v_uid or m.auth_user_id = v_uid)
      and lower(coalesce(m.status,'active')) = 'active'
      and lower(coalesce(m.onboarding_status,'active')) in ('active','pending','approved')
  ) then
    raise exception 'This account is already linked to a group';
  end if;

  v_access_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
  while exists (select 1 from public.groups g where g.access_code = v_access_code) loop
    v_access_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
  end loop;

  insert into public.groups (
    name, category, monthly_contribution, description, country, access_code, email
  ) values (
    trim(p_name), nullif(trim(p_category), ''), coalesce(p_monthly_contribution, 0),
    nullif(trim(p_description), ''), coalesce(nullif(trim(p_country), ''), 'Kenya'),
    v_access_code, v_email
  ) returning id into v_group_id;

  v_member_number := '0001';
  while exists (
    select 1 from public.members m
    where m.group_id = v_group_id AND m.member_number = v_member_number
  ) loop
    v_member_number := lpad(((v_member_number::integer) + 1)::text, 4, '0');
  end loop;

  insert into public.members (
    group_id, user_id, auth_user_id, member_number, membership_number,
    name, phone, email, role, status, onboarding_status, join_date, activated_at
  ) values (
    v_group_id, v_uid, v_uid, v_member_number, v_member_number,
    trim(p_admin_name), trim(p_admin_phone), v_email,
    'admin', 'pending', 'pending', current_date, null
  ) returning id into v_member_id;

  insert into public.contribution_types (group_id, name, code, created_by)
  select v_group_id, 'Monthly', 'monthly', v_member_id
  where not exists (
    select 1 from public.contribution_types ct
    where ct.group_id = v_group_id
      and (
        lower(trim(ct.name)) = 'monthly'
        or lower(trim(coalesce(ct.code, ''))) = 'monthly'
      )
  );

  return query select v_group_id, v_access_code, v_member_id, v_member_number;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_group_invite(p_group_id uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text, p_role text DEFAULT 'member'::text)
 RETURNS TABLE(id uuid, group_id uuid, code text, expires_at timestamp with time zone, max_uses integer, email text, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE target_group uuid:=p_group_id; caller_role text; new_id uuid; new_code text;
        v_expires timestamptz; v_max integer; v_email text; v_role text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_role:=lower(trim(coalesce(p_role,'member')));
  IF v_role NOT IN ('admin','secretary','treasurer','member','chairperson') THEN RAISE EXCEPTION 'Invalid role: %',v_role; END IF;
  IF target_group IS NULL THEN
    SELECT m.group_id,lower(m.role) INTO target_group,caller_role FROM public.members m
    WHERE (m.user_id=(SELECT auth.uid()) OR m.auth_user_id=(SELECT auth.uid())) AND m.status='active'
    ORDER BY m.created_at LIMIT 1;
  ELSE
    SELECT lower(m.role) INTO caller_role FROM public.members m
    WHERE (m.user_id=(SELECT auth.uid()) OR m.auth_user_id=(SELECT auth.uid())) AND m.group_id=target_group AND m.status='active' LIMIT 1;
  END IF;
  IF target_group IS NULL THEN RAISE EXCEPTION 'You do not belong to a group'; END IF;
  IF caller_role NOT IN ('admin','chairperson') THEN RAISE EXCEPTION 'Only a group admin or chairperson can create an invite'; END IF;
  new_code:=upper(substr(md5(gen_random_uuid()::text||clock_timestamp()::text),1,8));
  INSERT INTO public.group_invites(group_id,code,created_by,email,role)
  VALUES(target_group,new_code,(SELECT auth.uid()),nullif(trim(coalesce(p_email,'')),''),v_role)
  RETURNING public.group_invites.id,public.group_invites.expires_at,public.group_invites.max_uses,public.group_invites.email
  INTO new_id,v_expires,v_max,v_email;
  RETURN QUERY SELECT new_id,target_group,new_code,v_expires,v_max,v_email,v_role;
END; $function$


CREATE OR REPLACE FUNCTION public.create_manual_member_fine(p_group_id uuid, p_member_id uuid, p_rule_id uuid, p_amount numeric, p_reason text, p_trigger_id uuid, p_imposed_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_imposed_at timestamptz := coalesce(p_imposed_at, now());
  v_month text;
  v_member_group uuid;
  v_rule public.fine_rules%ROWTYPE;
  v_period public.financial_periods%ROWTYPE;
  v_existing public.fines%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF p_group_id IS NULL OR p_member_id IS NULL OR p_rule_id IS NULL OR p_trigger_id IS NULL THEN
    RAISE EXCEPTION 'Group, member, fine type, and request id are required';
  END IF;
  IF p_amount IS NULL OR round(p_amount,2) <= 0 THEN
    RAISE EXCEPTION 'Fine amount must be positive after currency rounding';
  END IF;
  IF btrim(coalesce(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'Fine reason is required';
  END IF;
  IF NOT public.cl_user_has_role(
    p_group_id,
    ARRAY['chairperson','treasurer','secretary']::text[]
  ) THEN
    RAISE EXCEPTION 'Manual fine requires an authorised group officer' USING ERRCODE='42501';
  END IF;

  v_month := to_char(date_trunc('month', v_imposed_at)::date, 'YYYY-MM');

  -- Preserve the canonical fine lock order: configuration, accounting month,
  -- financial period row, member advisory lock, then existing fine row.
  PERFORM private.cl_fine_config_lock(p_group_id);
  PERFORM private.cl_fine_lock(p_group_id, v_month);

  SELECT m.group_id INTO v_member_group
  FROM public.members m
  WHERE m.id=p_member_id;
  IF NOT FOUND OR v_member_group <> p_group_id THEN
    RAISE EXCEPTION 'Selected member does not belong to this group';
  END IF;

  SELECT fp.* INTO v_period
  FROM public.financial_periods fp
  WHERE fp.group_id=p_group_id AND fp.month=v_month
  FOR UPDATE;
  IF NOT FOUND OR lower(v_period.status) <> 'open' THEN
    RAISE EXCEPTION 'Financial month is closed or missing';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' || p_group_id::text || ':' || p_member_id::text,
      0
    )
  );

  -- Idempotency check precedes rule status so safe retries still return the
  -- original fine after the fine type is retired.
  SELECT f.* INTO v_existing
  FROM public.fines f
  WHERE f.group_id=p_group_id
    AND f.member_id=p_member_id
    AND f.rule_id=p_rule_id
    AND f.trigger_type='custom_event'
    AND f.trigger_id=p_trigger_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.source_type='MANUAL'
       AND round(v_existing.original_amount,2)=round(p_amount,2)
       AND coalesce(v_existing.reason,'')=btrim(p_reason)
       AND v_existing.imposed_at=v_imposed_at THEN
      RETURN v_existing.id;
    END IF;
    RAISE EXCEPTION 'Duplicate request id conflicts with an existing fine';
  END IF;

  SELECT r.* INTO v_rule
  FROM public.fine_rules r
  WHERE r.id=p_rule_id
    AND r.group_id=p_group_id
    AND r.trigger_type='custom_event'
    AND r.status='active'
    AND r.effective_from <= v_imposed_at
    AND (r.effective_until IS NULL OR r.effective_until >= v_imposed_at);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active manual fine type effective on the incident date is required';
  END IF;

  IF v_rule.minimum_amount IS NOT NULL AND round(p_amount,2) < v_rule.minimum_amount THEN
    RAISE EXCEPTION 'Fine amount is below the configured minimum';
  END IF;
  IF v_rule.maximum_amount IS NOT NULL AND round(p_amount,2) > v_rule.maximum_amount THEN
    RAISE EXCEPTION 'Fine amount exceeds the configured maximum';
  END IF;

  INSERT INTO public.fines(
    group_id,member_id,rule_id,trigger_type,trigger_id,accounting_month,
    original_amount,calculation_method,calculation_base,percentage_rate,
    fixed_amount,minimum_amount,maximum_amount,calculated_amount,
    resolved_closing_at,triggered_at,source_type,reason,imposed_at
  ) VALUES (
    p_group_id,p_member_id,p_rule_id,'custom_event',p_trigger_id,v_month,
    round(p_amount,2),'FIXED',NULL,NULL,
    round(p_amount,2),v_rule.minimum_amount,v_rule.maximum_amount,
    round(p_amount,2),NULL,v_imposed_at,'MANUAL',btrim(p_reason),v_imposed_at
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.create_member_with_contribution_plan(p_member jsonb, p_contribution_plan jsonb)
 RETURNS TABLE(member_id uuid, group_id uuid, member_number text, membership_number text, join_date date, contribution_status text, obligations_created integer, total_due numeric, total_allocated numeric, arrears numeric, credit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_auth_uid uuid;
    v_creator_member_id uuid;
    v_group_id uuid;
    v_member_id uuid;
    v_member_number text;
    v_membership_number text;
    v_name text;
    v_phone text;
    v_email text;
    v_national_id text;
    v_role text;
    v_member_status text;
    v_onboarding_status text;
    v_join_date date;
    v_actual_position text;
    v_actual_position_name text;
    v_actual_position_effective_from date;
    v_plan jsonb;
    v_plan_item jsonb;
    v_type_id uuid;
    v_amount numeric(14,2);
    v_frequency text;
    v_effective_from date;
    v_effective_to date;
    v_first_period_rule text;
    v_rule_status text;
    v_before_obligations integer := 0;
    v_after_obligations integer := 0;
    v_total_due numeric(14,2) := 0;
    v_total_allocated numeric(14,2) := 0;
    v_credit numeric(14,2) := 0;
    v_arrears numeric(14,2) := 0;
    v_contribution_status text;
    v_constraint_name text;
BEGIN
    IF p_member IS NULL OR jsonb_typeof(p_member) <> 'object' THEN
        RAISE EXCEPTION 'MEMBER_INPUT_INVALID' USING ERRCODE = '22023';
    END IF;

    IF p_contribution_plan IS NULL THEN
        v_plan := '[]'::jsonb;
    ELSIF jsonb_typeof(p_contribution_plan) <> 'array' THEN
        RAISE EXCEPTION 'CONTRIBUTION_PLAN_INVALID' USING ERRCODE = '22023';
    ELSE
        v_plan := p_contribution_plan;
    END IF;

    v_auth_uid := auth.uid();

    IF v_auth_uid IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
    END IF;

    SELECT m.id, m.group_id
    INTO v_creator_member_id, v_group_id
    FROM public.members m
    WHERE (m.auth_user_id = v_auth_uid OR m.user_id = v_auth_uid)
      AND lower(coalesce(m.status,'active')) = 'active'
    ORDER BY
        CASE WHEN lower(coalesce(m.onboarding_status,'pending')) = 'active'
             THEN 0 ELSE 1 END,
        m.created_at,
        m.id
    LIMIT 1;

    IF v_creator_member_id IS NULL OR v_group_id IS NULL THEN
        RAISE EXCEPTION 'ACTIVE_GROUP_MEMBER_REQUIRED' USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_add_group_members(v_group_id) THEN
        RAISE EXCEPTION 'MEMBER_MANAGEMENT_NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;

    v_member_number := nullif(trim(p_member->>'member_number'), '');
    v_membership_number := nullif(trim(p_member->>'membership_number'), '');
    v_name := nullif(trim(p_member->>'name'), '');
    v_phone := nullif(trim(p_member->>'phone'), '');
    v_email := nullif(trim(p_member->>'email'), '');
    v_national_id := nullif(trim(p_member->>'national_id'), '');
    v_role := lower(coalesce(nullif(trim(p_member->>'role'), ''), 'member'));
    v_member_status := lower(coalesce(nullif(trim(p_member->>'status'), ''), 'active'));
    v_onboarding_status := lower(coalesce(nullif(trim(p_member->>'onboarding_status'), ''), 'pending'));
    v_join_date := coalesce(nullif(trim(p_member->>'join_date'), '')::date, CURRENT_DATE);
    v_actual_position := lower(nullif(trim(p_member->>'actual_position'), ''));
    v_actual_position_name := nullif(trim(p_member->>'actual_position_name'), '');
    IF v_actual_position IS NOT NULL AND v_actual_position NOT IN ('chairperson','vice_chairperson','treasurer','secretary','vice_secretary','committee_member','member','other') THEN
        RAISE EXCEPTION 'ACTUAL_POSITION_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_actual_position = 'other' AND v_actual_position_name IS NULL THEN
        RAISE EXCEPTION 'ACTUAL_POSITION_NAME_REQUIRED' USING ERRCODE='22023';
    END IF;
    IF v_actual_position IS DISTINCT FROM 'other' THEN v_actual_position_name := NULL; END IF;
    IF nullif(trim(p_member->>'actual_position_effective_from'), '') IS NULL THEN
        v_actual_position_effective_from := v_join_date;
    ELSE
        BEGIN
            v_actual_position_effective_from := (p_member->>'actual_position_effective_from')::date;
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
            RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_INVALID' USING ERRCODE='22023';
        END;
    END IF;
    IF v_actual_position IS NOT NULL AND v_actual_position_effective_from < v_join_date THEN
        RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_BEFORE_JOIN_DATE' USING ERRCODE='22023';
    END IF;

    IF v_member_number IS NULL THEN RAISE EXCEPTION 'MEMBER_NUMBER_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_membership_number IS NULL THEN RAISE EXCEPTION 'MEMBERSHIP_NUMBER_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_name IS NULL THEN RAISE EXCEPTION 'MEMBER_NAME_REQUIRED' USING ERRCODE='22023'; END IF;
    IF v_phone IS NULL THEN RAISE EXCEPTION 'MEMBER_PHONE_REQUIRED' USING ERRCODE='22023'; END IF;

    IF v_role NOT IN ('member','chairperson','admin','treasurer','secretary') THEN
        RAISE EXCEPTION 'MEMBER_ROLE_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_member_status NOT IN ('active','inactive') THEN
        RAISE EXCEPTION 'MEMBER_STATUS_INVALID' USING ERRCODE='22023';
    END IF;
    IF v_onboarding_status NOT IN ('pending','invited','active','suspended') THEN
        RAISE EXCEPTION 'MEMBER_ONBOARDING_STATUS_INVALID' USING ERRCODE='22023';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'chama-live:add-member:' || v_group_id::text || ':' || v_member_number, 0
        )
    );

    IF EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.group_id = v_group_id AND m.member_number = v_member_number
    ) THEN
        RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.group_id = v_group_id AND m.membership_number = v_membership_number
    ) THEN
        RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
    END IF;

    BEGIN
        INSERT INTO public.members (
            group_id, member_number, membership_number, national_id, name,
            phone, email, role, status, onboarding_status, join_date
        )
        VALUES (
            v_group_id, v_member_number, v_membership_number, v_national_id, v_name,
            v_phone, v_email, v_role, v_member_status, v_onboarding_status, v_join_date
        )
        RETURNING id INTO v_member_id;
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name = 'members_group_id_member_number_key'
           OR v_constraint_name = 'members_group_member_number_uidx' THEN
            RAISE EXCEPTION 'MEMBER_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
        ELSIF v_constraint_name = 'members_group_membership_number_uidx' THEN
            RAISE EXCEPTION 'MEMBERSHIP_NUMBER_ALREADY_EXISTS' USING ERRCODE='23505';
        ELSE
            RAISE;
        END IF;
    END;

    IF v_actual_position IS NOT NULL THEN
        INSERT INTO public.member_position_history (
            group_id, member_id, actual_position, actual_position_name,
            effective_from, effective_to, recorded_by
        )
        VALUES (
            v_group_id, v_member_id, v_actual_position, v_actual_position_name,
            v_actual_position_effective_from, NULL, v_creator_member_id
        );
    END IF;

    IF jsonb_array_length(v_plan) = 0 THEN
        RETURN QUERY SELECT v_member_id, v_group_id, v_member_number, v_membership_number,
            v_join_date, 'plan_not_set'::text, 0, 0::numeric(14,2), 0::numeric(14,2),
            0::numeric(14,2), 0::numeric(14,2);
        RETURN;
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'chama-live:member:' || v_group_id::text || ':' || v_member_id::text, 0
        )
    );

    SELECT count(*)::integer INTO v_before_obligations
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    FOR v_plan_item IN SELECT value FROM jsonb_array_elements(v_plan) LOOP
        IF jsonb_typeof(v_plan_item) <> 'object' THEN
            RAISE EXCEPTION 'CONTRIBUTION_PLAN_ITEM_INVALID' USING ERRCODE='22023';
        END IF;

        BEGIN
            v_type_id := (v_plan_item->>'contribution_type_id')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_ID_INVALID' USING ERRCODE='22023';
        END;
        IF v_type_id IS NULL THEN RAISE EXCEPTION 'CONTRIBUTION_TYPE_ID_REQUIRED' USING ERRCODE='22023'; END IF;

        BEGIN
            v_amount := (v_plan_item->>'amount')::numeric(14,2);
        EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'CONTRIBUTION_AMOUNT_INVALID' USING ERRCODE='22023';
        END;
        IF v_amount IS NULL OR v_amount <= 0 THEN
            RAISE EXCEPTION 'CONTRIBUTION_AMOUNT_INVALID' USING ERRCODE='22023';
        END IF;

        v_frequency := lower(coalesce(nullif(trim(v_plan_item->>'frequency'), ''), 'monthly'));
        IF v_frequency <> 'monthly' THEN
            RAISE EXCEPTION 'CONTRIBUTION_FREQUENCY_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        v_effective_from := coalesce(nullif(trim(v_plan_item->>'effective_from'), '')::date, v_join_date);
        v_effective_to := nullif(trim(v_plan_item->>'effective_to'), '')::date;

        IF v_effective_from < v_join_date THEN
            RAISE EXCEPTION 'CONTRIBUTION_EFFECTIVE_DATE_BEFORE_JOIN_DATE' USING ERRCODE='22023';
        END IF;
        IF v_effective_to IS NOT NULL AND v_effective_to < v_effective_from THEN
            RAISE EXCEPTION 'CONTRIBUTION_EFFECTIVE_DATE_RANGE_INVALID' USING ERRCODE='22023';
        END IF;

        v_first_period_rule := lower(coalesce(nullif(trim(v_plan_item->>'first_period_rule'), ''), 'full_period'));
        IF v_first_period_rule NOT IN ('full_period','next_full_period') THEN
            RAISE EXCEPTION 'FIRST_PERIOD_RULE_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        v_rule_status := lower(coalesce(nullif(trim(v_plan_item->>'status'), ''), 'active'));
        IF v_rule_status NOT IN ('active','inactive','ended') THEN
            RAISE EXCEPTION 'CONTRIBUTION_RULE_STATUS_INVALID' USING ERRCODE='22023';
        END IF;
        IF v_rule_status = 'ended' AND v_effective_to IS NULL THEN
            RAISE EXCEPTION 'ENDED_RULE_REQUIRES_EFFECTIVE_TO' USING ERRCODE='22023';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.contribution_types ct
            WHERE ct.id = v_type_id AND ct.group_id = v_group_id
        ) THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_NOT_IN_GROUP' USING ERRCODE='42501';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.contribution_types ct
            WHERE ct.id = v_type_id AND ct.group_id = v_group_id
              AND (ct.code = 'monthly' OR lower(trim(ct.name)) = 'monthly')
        ) THEN
            RAISE EXCEPTION 'CONTRIBUTION_TYPE_NOT_SUPPORTED' USING ERRCODE='22023';
        END IF;

        BEGIN
            INSERT INTO public.member_contribution_rules (
                group_id, member_id, contribution_type_id, amount, frequency,
                effective_from, effective_to, first_period_rule, status, created_by
            )
            VALUES (
                v_group_id, v_member_id, v_type_id, v_amount, v_frequency,
                v_effective_from, v_effective_to, v_first_period_rule,
                v_rule_status, v_creator_member_id
            );
        EXCEPTION WHEN exclusion_violation THEN
            RAISE EXCEPTION 'CONTRIBUTION_RULE_OVERLAP' USING ERRCODE='23P01';
        END;
    END LOOP;

    PERFORM public.cl_2b_refresh_member(v_member_id, date_trunc('month', CURRENT_DATE)::date);

    SELECT count(*)::integer INTO v_after_obligations
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    v_after_obligations := greatest(v_after_obligations - v_before_obligations, 0);

    SELECT coalesce(sum(o.due_amount),0)::numeric(14,2)
    INTO v_total_due
    FROM public.contribution_obligations o
    WHERE o.member_id = v_member_id;

    SELECT coalesce(sum(a.amount),0)::numeric(14,2)
    INTO v_total_allocated
    FROM public.contribution_allocations a
    JOIN public.contribution_obligations o ON o.id = a.obligation_id
    WHERE o.member_id = v_member_id;

    SELECT coalesce(sum(
        greatest(
            c.amount - coalesce((
                SELECT sum(a.amount)
                FROM public.contribution_allocations a
                WHERE a.payment_id = c.id
            ),0),
            0
        )
    ),0)::numeric(14,2)
    INTO v_credit
    FROM public.contributions c
    WHERE c.member_id = v_member_id
      AND lower(trim(coalesce(c.contribution_type,''))) = 'monthly';

    v_arrears := greatest(v_total_due - v_total_allocated, 0)::numeric(14,2);

    IF v_arrears > 0 THEN
        v_contribution_status := 'arrears';
    ELSIF v_credit > 0 THEN
        v_contribution_status := 'credit';
    ELSE
        v_contribution_status := 'up_to_date';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.contribution_allocations a
        JOIN public.contributions p ON p.id = a.payment_id
        JOIN public.contribution_obligations o ON o.id = a.obligation_id
        WHERE (p.member_id = v_member_id OR o.member_id = v_member_id)
          AND (p.group_id <> o.group_id OR p.member_id <> o.member_id OR a.amount <= 0)
    ) THEN
        RAISE EXCEPTION 'Cross-member/group allocation detected';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT a.payment_id, sum(a.amount) AS allocated
            FROM public.contribution_allocations a
            JOIN public.contributions p ON p.id = a.payment_id
            WHERE p.member_id = v_member_id
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
            SELECT a.obligation_id, sum(a.amount) AS allocated
            FROM public.contribution_allocations a
            JOIN public.contribution_obligations o ON o.id = a.obligation_id
            WHERE o.member_id = v_member_id
            GROUP BY a.obligation_id
        ) x
        JOIN public.contribution_obligations o ON o.id = x.obligation_id
        WHERE x.allocated > o.due_amount
    ) THEN
        RAISE EXCEPTION 'Obligation over-allocation detected';
    END IF;

    RETURN QUERY SELECT
        v_member_id, v_group_id, v_member_number, v_membership_number, v_join_date,
        v_contribution_status, v_after_obligations, v_total_due, v_total_allocated,
        v_arrears, v_credit;
END;
$function$


