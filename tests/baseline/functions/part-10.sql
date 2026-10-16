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
