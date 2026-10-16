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
