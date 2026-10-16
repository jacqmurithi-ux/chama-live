-- STAGE ONLY: production function definitions; ordinal rows 171-180 of 201.
-- Captured read-only on 2026-10-14. Alphabetical order is NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects require separate reconciliation.

CREATE OR REPLACE FUNCTION public.record_recurring_contribution_initiative_payment(p_initiative_id uuid, p_member_id uuid, p_amount numeric, p_contribution_date date, p_payment_method text, p_reference text, p_mpesa_reference text, p_notes text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives;
  v_payment uuid;
  v_cash numeric := p_amount;
  v_alloc numeric;
  v_remaining numeric;
  v_credit_used numeric := 0;
  v_cash_allocated numeric := 0;
  r record;
  c record;
  v_result jsonb;
  v_alloc_id uuid;
  v_claimed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Invalid payment request'; END IF;

  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE;
  IF NOT FOUND OR v_i.frequency <> 'monthly' OR v_i.status <> 'active' THEN RAISE EXCEPTION 'Initiative not eligible'; END IF;
  IF p_contribution_date < v_i.start_date OR p_contribution_date > v_i.closing_date THEN RAISE EXCEPTION 'Payment date outside initiative window'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id=p_member_id AND m.group_id=v_i.group_id
      AND lower(coalesce(m.status,'active'))='active'
      AND (m.user_id=auth.uid() OR m.auth_user_id=auth.uid() OR public.can_manage_members(v_i.group_id))
  ) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'record_recurring_initiative_payment','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT result INTO v_result FROM private.contribution_initiative_requests
    WHERE request_id=p_request_id AND operation='record_recurring_initiative_payment';
    RETURN v_result || jsonb_build_object('idempotent',true);
  END IF;

  INSERT INTO public.contributions
    (group_id,member_id,amount,contribution_type,month,payment_method,reference,recorded_by,contribution_date,notes,mpesa_reference,initiative_id)
  VALUES
    (v_i.group_id,p_member_id,p_amount,'initiative',to_char(p_contribution_date,'YYYY-MM'),p_payment_method,p_reference,auth.uid(),p_contribution_date,p_notes,p_mpesa_reference,p_initiative_id)
  RETURNING id INTO v_payment;

  /* Initiative lock is acquired first. Eligible obligations are then locked in deterministic chronological order. */
  FOR r IN
    SELECT o.id,o.amount_due,o.due_date,
      greatest(o.amount_due-coalesce((
        SELECT sum(a.amount) FROM public.contribution_initiative_allocations a
        WHERE a.initiative_obligation_id=o.id
          AND NOT EXISTS (SELECT 1 FROM public.contribution_initiative_payment_reversals x WHERE x.payment_id=a.payment_id)
      ),0),0) outstanding
    FROM public.contribution_initiative_obligations o
    JOIN public.contribution_initiative_periods p ON p.id=o.initiative_period_id
    WHERE o.initiative_id=v_i.id AND o.member_id=p_member_id AND p.opening_date<=date_trunc('month',p_contribution_date)::date
    ORDER BY o.due_date,o.id
    FOR UPDATE OF o
  LOOP
    v_remaining:=r.outstanding;
    v_alloc_id:=NULL;
    IF v_remaining<=0 THEN CONTINUE; END IF;

    IF v_cash>0 THEN
      v_alloc:=least(v_cash,v_remaining);
      INSERT INTO public.contribution_initiative_allocations(payment_id,initiative_obligation_id,amount)
      VALUES(v_payment,r.id,v_alloc) RETURNING id INTO v_alloc_id;
      v_cash:=v_cash-v_alloc;
      v_cash_allocated:=v_cash_allocated+v_alloc;
      v_remaining:=v_remaining-v_alloc;
    END IF;

    WHILE v_remaining>0 LOOP
      SELECT * INTO c FROM public.contribution_initiative_credits
      WHERE initiative_id=v_i.id AND member_id=p_member_id AND remaining_amount>0
      ORDER BY created_at,id LIMIT 1 FOR UPDATE;
      EXIT WHEN NOT FOUND;

      v_alloc:=least(v_remaining,c.remaining_amount);
      IF v_alloc_id IS NULL THEN
        INSERT INTO public.contribution_initiative_allocations(payment_id,initiative_obligation_id,amount)
        VALUES(v_payment,r.id,v_alloc) RETURNING id INTO v_alloc_id;
      ELSE
        UPDATE public.contribution_initiative_allocations SET amount=amount+v_alloc WHERE id=v_alloc_id;
      END IF;
      INSERT INTO public.contribution_initiative_credit_consumptions(allocation_id,credit_id,amount)
      VALUES(v_alloc_id,c.id,v_alloc);
      UPDATE public.contribution_initiative_credits SET remaining_amount=remaining_amount-v_alloc WHERE id=c.id;
      v_remaining:=v_remaining-v_alloc;
      v_credit_used:=v_credit_used+v_alloc;
    END LOOP;
  END LOOP;

  IF v_cash>0 THEN
    INSERT INTO public.contribution_initiative_credits(initiative_id,member_id,source_payment_id,amount,remaining_amount)
    VALUES(v_i.id,p_member_id,v_payment,v_cash,v_cash);
    /* source_payment_id is an existing FK to contributions(id); initiative/member
       lineage is established atomically by this authenticated recurring RPC. */
  END IF;

  v_result=jsonb_build_object('status','recorded','payment_id',v_payment,'initiative_id',v_i.id,'amount',p_amount,'cash_allocated',v_cash_allocated,'credit_used',v_credit_used,'credit_created',v_cash);
  UPDATE private.contribution_initiative_requests
  SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_result
  WHERE request_id=p_request_id AND operation='record_recurring_initiative_payment';
  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.refresh_canonical_contribution_accounting(p_group_id uuid, p_through_month text, p_member_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_month date;
  v_count integer:=0;
  v_member_horizon date;
  v_rebuild_start date;
  v_member_row record;
BEGIN
  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'Group is required';
  END IF;

  IF p_through_month IS NULL
     OR p_through_month !~ '^[0-9]{4}-[0-9]{2}$'
  THEN
    RAISE EXCEPTION 'Month must use YYYY-MM format';
  END IF;

  v_month:=(p_through_month||'-01')::date;

  IF p_member_id IS NOT NULL THEN
    SELECT
      least(
        coalesce((SELECT min(date_trunc('month',mcr.effective_from)::date) FROM public.member_contribution_rules mcr WHERE mcr.group_id=p_group_id AND mcr.member_id=p_member_id AND mcr.frequency='monthly' AND mcr.effective_from IS NOT NULL),v_month),
        coalesce((SELECT min(date_trunc('month',o.obligation_month)::date) FROM public.contribution_obligations o WHERE o.group_id=p_group_id AND o.member_id=p_member_id),v_month),
        coalesce((SELECT min(date_trunc('month',c.contribution_date)::date) FROM public.contributions c WHERE c.group_id=p_group_id AND c.member_id=p_member_id AND lower(trim(coalesce(c.contribution_type,'')))='monthly' AND c.contribution_date IS NOT NULL),v_month),
        v_month
      ),
      greatest(
        v_month,
        coalesce(
          (
            SELECT max(c.contribution_date)
            FROM public.contributions c
            WHERE c.member_id=p_member_id
              AND lower(trim(coalesce(c.contribution_type,'')))='monthly'
          ),
          v_month
        ),
        coalesce(
          (
            SELECT max(o.obligation_month)
            FROM public.contribution_obligations o
            WHERE o.member_id=p_member_id
          ),
          v_month
        )
      )
    INTO v_rebuild_start,v_member_horizon
    FROM public.members m
    WHERE m.id=p_member_id
      AND m.group_id=p_group_id;

    IF v_rebuild_start IS NULL THEN
      RAISE EXCEPTION 'Member does not belong to this group';
    END IF;

    v_rebuild_start:=least(
      date_trunc('month',v_rebuild_start)::date,
      v_month
    );

    PERFORM public.cl_2b_accounting_lock_range(
      p_group_id,
      v_rebuild_start,
      date_trunc('month',v_member_horizon)::date
    );

    PERFORM public.cl_2b_refresh_member(
      p_member_id,
      date_trunc('month',v_member_horizon)::date
    );
    v_count:=1;
  ELSE
    SELECT
      least(
        coalesce((SELECT min(date_trunc('month',mcr.effective_from)::date) FROM public.member_contribution_rules mcr WHERE mcr.group_id=p_group_id AND mcr.frequency='monthly' AND mcr.effective_from IS NOT NULL),v_month),
        coalesce((SELECT min(date_trunc('month',o.obligation_month)::date) FROM public.contribution_obligations o WHERE o.group_id=p_group_id),v_month),
        coalesce((SELECT min(date_trunc('month',c.contribution_date)::date) FROM public.contributions c WHERE c.group_id=p_group_id AND lower(trim(coalesce(c.contribution_type,'')))='monthly' AND c.contribution_date IS NOT NULL),v_month),
        v_month
      ),
      greatest(
        v_month,
        coalesce(
          (
            SELECT max(c.contribution_date)
            FROM public.contributions c
            WHERE c.group_id=p_group_id
              AND lower(trim(coalesce(c.contribution_type,'')))='monthly'
          ),
          v_month
        ),
        coalesce(
          (
            SELECT max(o.obligation_month)
            FROM public.contribution_obligations o
            WHERE o.group_id=p_group_id
          ),
          v_month
        )
      )
    INTO v_rebuild_start,v_member_horizon
    FROM public.members m
    WHERE m.group_id=p_group_id;

    v_rebuild_start:=least(
      coalesce(
        date_trunc('month',v_rebuild_start)::date,
        v_month
      ),
      v_month
    );

    PERFORM public.cl_2b_accounting_lock_range(
      p_group_id,
      v_rebuild_start,
      date_trunc('month',v_member_horizon)::date
    );

    FOR v_member_row IN
      SELECT m.id
      FROM public.members m
      WHERE m.group_id=p_group_id
      ORDER BY m.id
    LOOP
      PERFORM public.cl_2b_refresh_member(
        v_member_row.id,
        date_trunc('month',v_member_horizon)::date
      );
      v_count:=v_count+1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok',true,
    'group_id',p_group_id,
    'through_month',p_through_month,
    'members_refreshed',v_count,
    'rebuild_horizon',
      date_trunc('month',v_member_horizon)::date
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.refresh_my_group_contribution_accounting(p_group_id uuid, p_through_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'Group is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_through_month IS NULL
     OR p_through_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  THEN
    RAISE EXCEPTION 'Month must use YYYY-MM format'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.cl_user_has_role(
    p_group_id,
    ARRAY['chairperson', 'treasurer', 'secretary', 'owner', 'administrator']::text[]
  ) THEN
    RAISE EXCEPTION 'Not authorized to refresh contribution accounting for this group'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.refresh_canonical_contribution_accounting(
    p_group_id,
    p_through_month,
    NULL
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.refresh_my_managed_member_accounting(p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_group_id uuid;
  v_through_month text;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_member_id IS NULL THEN
    RAISE EXCEPTION 'Member is required';
  END IF;

  SELECT m.group_id
  INTO v_group_id
  FROM public.members AS m
  WHERE m.id = p_member_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Member does not exist';
  END IF;

  IF NOT public.can_manage_members(v_group_id) THEN
    RAISE EXCEPTION 'Not authorized to manage members in this group';
  END IF;

  v_through_month :=
    to_char(
      date_trunc('month', current_date)::date,
      'YYYY-MM'
    );

  v_result :=
    public.refresh_canonical_contribution_accounting(
      v_group_id,
      v_through_month,
      p_member_id
    );

  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.reject_group_application(p_application_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a public.group_applications%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  SELECT *
  INTO a
  FROM public.group_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF a.status = 'approved' THEN
    RAISE EXCEPTION 'Approved applications cannot be rejected';
  END IF;

  IF a.status = 'rejected' THEN
    RAISE EXCEPTION 'Application is already rejected';
  END IF;

  UPDATE public.group_applications
  SET status = 'rejected',
      rejection_reason = v_reason,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      updated_at = now()
  WHERE id = p_application_id;

  PERFORM private.append_platform_activity(
    'group_application_reviewed',
    jsonb_build_object(
      'application_id', a.id,
      'group_name', a.group_name,
      'review_outcome', 'rejected',
      'rejection_reason', v_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'application_id', a.id,
    'email', a.email,
    'admin_name', a.admin_name,
    'group_name', a.group_name,
    'rejection_reason', v_reason
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.reopen_financial_month(p_group_id uuid, p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_period public.financial_periods%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_group_id IS NULL
     OR p_month IS NULL
     OR p_month !~ '^[0-9]{4}-[0-9]{2}$'
  THEN
    RAISE EXCEPTION 'Invalid month. Expected YYYY-MM';
  END IF;

  IF NOT public.cl_user_has_role(
    p_group_id,
    ARRAY['admin','treasurer','secretary']::text[]
  ) THEN
    RAISE EXCEPTION
      'Not authorized to reopen this financial month';
  END IF;

  PERFORM public.cl_2b_accounting_lock(p_group_id,p_month);

  SELECT fp.*
    INTO v_period
  FROM public.financial_periods fp
  WHERE fp.group_id=p_group_id
    AND fp.month=p_month
  FOR UPDATE;

  IF NOT FOUND
     OR lower(coalesce(v_period.status,''))<>'closed'
  THEN
    RAISE EXCEPTION
      'Financial month % is not closed',p_month;
  END IF;

  UPDATE public.financial_periods
  SET status='open',
      closing_balance=NULL,
      closed_at=NULL,
      closed_by=NULL
  WHERE id=v_period.id;

  RETURN public.get_monthly_financial_report(
    p_group_id,p_month
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.resolve_expense_recorded_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  resolved_member_id uuid;
BEGIN
  -- recorded_by is defined as members.id, but the frontend may provide
  -- the authenticated user's UUID. Resolve it to the member row first.
  IF NEW.recorded_by IS NOT NULL THEN
    SELECT m.id
      INTO resolved_member_id
    FROM public.members m
    WHERE m.group_id = NEW.group_id
      AND (m.id = NEW.recorded_by
           OR m.user_id = NEW.recorded_by
           OR m.auth_user_id = NEW.recorded_by)
    LIMIT 1;

    IF resolved_member_id IS NULL THEN
      RAISE EXCEPTION 'The expense recorder is not a member of this group.';
    END IF;

    NEW.recorded_by := resolved_member_id;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.reverse_contribution_initiative_payment(p_payment_id uuid, p_reason text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_c public.contributions; v_i public.contribution_initiatives; v_existing jsonb; v_rev uuid; v_claimed boolean;
BEGIN
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'reverse_initiative_payment','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN SELECT result INTO v_existing FROM private.contribution_initiative_requests WHERE request_id=p_request_id AND operation='reverse_initiative_payment'; RETURN v_existing; END IF;

  SELECT * INTO v_c FROM public.contributions WHERE id=p_payment_id AND initiative_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Initiative payment not found'; END IF;
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=v_c.initiative_id FOR UPDATE;
  IF NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF EXISTS(SELECT 1 FROM public.contribution_initiative_payment_reversals r WHERE r.payment_id=p_payment_id) THEN RAISE EXCEPTION 'Payment already reversed'; END IF;
  IF length(trim(coalesce(p_reason,'')))=0 THEN RAISE EXCEPTION 'Reversal reason is required'; END IF;
  INSERT INTO public.contribution_initiative_payment_reversals(payment_id,reason,reversed_by)
  VALUES(p_payment_id,trim(p_reason),auth.uid()) RETURNING id INTO v_rev;
  v_existing=jsonb_build_object('status','reversed','payment_id',p_payment_id,'reversal_id',v_rev);
  UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_existing WHERE request_id=p_request_id AND operation='reverse_initiative_payment';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.reverse_recurring_contribution_initiative_payment(p_payment_id uuid, p_reason text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_existing jsonb;
  v_i uuid;
  v_claimed boolean;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL OR nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Reason and request id are required'; END IF;

  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'reverse_recurring_initiative_payment','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT result INTO v_existing FROM private.contribution_initiative_requests
    WHERE request_id=p_request_id AND operation='reverse_recurring_initiative_payment';
    RETURN v_existing || jsonb_build_object('idempotent',true);
  END IF;

  SELECT c.initiative_id INTO v_i FROM public.contributions c
  WHERE c.id=p_payment_id AND c.initiative_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recurring initiative payment not found'; END IF;

  PERFORM 1 FROM public.contribution_initiatives i
  WHERE i.id=v_i AND public.can_manage_members(i.group_id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF EXISTS (SELECT 1 FROM public.contribution_initiative_payment_reversals WHERE payment_id=p_payment_id) THEN
    RAISE EXCEPTION 'Payment already reversed';
  END IF;

  /* A source-credit reversal cannot silently invalidate a later payment's allocation. */
  IF EXISTS (
    SELECT 1
    FROM public.contribution_initiative_credit_consumptions cc
    JOIN public.contribution_initiative_credits c ON c.id=cc.credit_id
    JOIN public.contribution_initiative_allocations a ON a.id=cc.allocation_id
    WHERE c.source_payment_id=p_payment_id AND a.payment_id<>p_payment_id
  ) THEN
    RAISE EXCEPTION 'Cannot reverse payment whose initiative credit was already consumed by another payment';
  END IF;

  INSERT INTO public.contribution_initiative_payment_reversals(payment_id,reason,reversed_by)
  VALUES(p_payment_id,p_reason,auth.uid());

  /* Restore credits consumed by this payment itself. */
  FOR r IN
    SELECT cc.credit_id,sum(cc.amount) amount
    FROM public.contribution_initiative_credit_consumptions cc
    JOIN public.contribution_initiative_allocations a ON a.id=cc.allocation_id
    WHERE a.payment_id=p_payment_id
    GROUP BY cc.credit_id
  LOOP
    UPDATE public.contribution_initiative_credits
    SET remaining_amount=least(amount,remaining_amount+r.amount)
    WHERE id=r.credit_id;
  END LOOP;

  /* Excess credit created by the reversed payment is no longer available. */
  UPDATE public.contribution_initiative_credits SET remaining_amount=0 WHERE source_payment_id=p_payment_id;

  v_existing=jsonb_build_object('status','reversed','payment_id',p_payment_id,'initiative_id',v_i);
  UPDATE private.contribution_initiative_requests r
  SET initiative_id=i.id,group_id=i.group_id,result=v_existing
  FROM public.contribution_initiatives i
  WHERE i.id=v_i AND r.request_id=p_request_id AND r.operation='reverse_recurring_initiative_payment';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.reverse_subscription_payment(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_auth_uid uuid;
    v_payment public.subscription_payments%ROWTYPE;
    v_source_invoice public.subscription_invoices%ROWTYPE;
    v_subscription public.group_subscriptions%ROWTYPE;
    v_affected_invoice public.subscription_invoices%ROWTYPE;
    v_credit RECORD;
    v_allocation RECORD;
    v_payment_ids uuid[];
    v_invoice_ids uuid[];
    v_credit_ids uuid[];
    v_allocation_ids uuid[];
    v_cycle_ids uuid[];
    v_lock_id uuid;
    v_invoice_id uuid;
    v_invoice_applied numeric;
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

    SELECT si.* INTO v_source_invoice
    FROM public.subscription_invoices AS si
    WHERE si.id = v_payment.invoice_id
      AND si.group_id = v_payment.group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source payment % does not resolve to its invoice', p_payment_id
            USING ERRCODE = '23503';
    END IF;

    SELECT gs.* INTO v_subscription
    FROM public.group_subscriptions AS gs
    WHERE gs.id = v_source_invoice.subscription_id
      AND gs.group_id = v_source_invoice.group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source invoice does not resolve to its subscription'
            USING ERRCODE = '23503';
    END IF;

    SELECT array_agg(x.invoice_id ORDER BY x.invoice_id)
    INTO v_invoice_ids
    FROM (
        SELECT a.invoice_id
        FROM public.subscription_payment_allocations AS a
        JOIN public.subscription_invoices AS si
          ON si.id = a.invoice_id
        WHERE a.payment_id = v_payment.id
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
        UNION
        SELECT a.invoice_id
        FROM public.subscription_payment_allocations AS a
        JOIN public.subscription_credits AS c
          ON c.id = a.credit_id
        JOIN public.subscription_invoices AS si
          ON si.id = a.invoice_id
        WHERE c.source_payment_id = v_payment.id
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
    ) AS x;

    SELECT array_agg(c.id ORDER BY c.created_at, c.id)
    INTO v_credit_ids
    FROM public.subscription_credits AS c
    WHERE c.source_payment_id = v_payment.id;

    v_payment_ids := ARRAY[v_payment.id];

    SELECT array_agg(x.cycle_id ORDER BY x.cycle_id)
    INTO v_cycle_ids
    FROM (
        SELECT si.cycle_id
        FROM public.subscription_invoices AS si
        WHERE si.id = ANY(COALESCE(v_invoice_ids, ARRAY[]::uuid[]))
          AND si.subscription_id = v_subscription.id
        UNION
        SELECT v_source_invoice.cycle_id
    ) AS x;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'chama_live_subscription:' || v_subscription.id::text,
            0
        )
    );

    SELECT sp.* INTO v_payment
    FROM public.subscription_payments AS sp
    WHERE sp.id = p_payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription payment % does not exist', p_payment_id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT si.* INTO v_source_invoice
    FROM public.subscription_invoices AS si
    WHERE si.id = v_payment.invoice_id
      AND si.group_id = v_payment.group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source payment % no longer resolves to its invoice', p_payment_id
            USING ERRCODE = '23503';
    END IF;

    SELECT gs.* INTO v_subscription
    FROM public.group_subscriptions AS gs
    WHERE gs.id = v_source_invoice.subscription_id
      AND gs.group_id = v_source_invoice.group_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source invoice no longer resolves to its subscription'
            USING ERRCODE = '23503';
    END IF;

    SELECT array_agg(a.payment_id ORDER BY a.payment_id)
    INTO v_payment_ids
    FROM (
        SELECT v_payment.id AS payment_id
    ) AS a;

    IF EXISTS (
        SELECT 1
        FROM public.subscription_payment_allocations AS a
        JOIN public.subscription_invoices AS si
          ON si.id = a.invoice_id
        WHERE (
            a.payment_id = v_payment.id
            OR EXISTS (
                SELECT 1
                FROM public.subscription_credits AS c
                WHERE c.id = a.credit_id
                  AND c.source_payment_id = v_payment.id
            )
        )
        AND si.subscription_id <> v_subscription.id
    ) THEN
        RAISE EXCEPTION
            'Payment % has an allocation resolving outside its authoritative subscription',
            v_payment.id
            USING ERRCODE = '23503';
    END IF;

    SELECT array_agg(x.invoice_id ORDER BY x.invoice_id)
    INTO v_invoice_ids
    FROM (
        SELECT v_source_invoice.id AS invoice_id
        UNION
        SELECT a.invoice_id
        FROM public.subscription_payment_allocations AS a
        JOIN public.subscription_invoices AS si
          ON si.id = a.invoice_id
        WHERE a.payment_id = v_payment.id
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
        UNION
        SELECT a.invoice_id
        FROM public.subscription_payment_allocations AS a
        JOIN public.subscription_credits AS c
          ON c.id = a.credit_id
        JOIN public.subscription_invoices AS si
          ON si.id = a.invoice_id
        WHERE c.source_payment_id = v_payment.id
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
    ) AS x;

    SELECT array_agg(c.id ORDER BY c.created_at, c.id)
    INTO v_credit_ids
    FROM public.subscription_credits AS c
    WHERE c.source_payment_id = v_payment.id;

    SELECT array_agg(x.allocation_id ORDER BY x.allocation_id)
    INTO v_allocation_ids
    FROM (
        SELECT a.id AS allocation_id
        FROM public.subscription_payment_allocations AS a
        JOIN public.subscription_invoices AS si
          ON si.id = a.invoice_id
        WHERE a.payment_id = v_payment.id
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
        UNION
        SELECT a.id AS allocation_id
        FROM public.subscription_payment_allocations AS a
        JOIN public.subscription_credits AS c
          ON c.id = a.credit_id
        JOIN public.subscription_invoices AS si
          ON si.id = a.invoice_id
        WHERE c.source_payment_id = v_payment.id
          AND si.subscription_id = v_subscription.id
          AND si.group_id = v_subscription.group_id
    ) AS x;

    SELECT array_agg(x.cycle_id ORDER BY x.cycle_id)
    INTO v_cycle_ids
    FROM (
        SELECT si.cycle_id
        FROM public.subscription_invoices AS si
        WHERE si.id = ANY(COALESCE(v_invoice_ids, ARRAY[]::uuid[]))
          AND si.subscription_id = v_subscription.id
        UNION
        SELECT v_source_invoice.cycle_id
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

    IF v_invoice_ids IS NOT NULL THEN
        FOR v_lock_id IN
            SELECT unnest(v_invoice_ids)
            ORDER BY 1
        LOOP
            PERFORM 1
            FROM public.subscription_invoices AS si
            WHERE si.id = v_lock_id
              AND si.subscription_id = v_subscription.id
              AND si.group_id = v_subscription.group_id
            FOR UPDATE;
        END LOOP;
    END IF;

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

    IF v_allocation_ids IS NOT NULL THEN
        FOR v_lock_id IN
            SELECT unnest(v_allocation_ids)
            ORDER BY 1
        LOOP
            PERFORM 1
            FROM public.subscription_payment_allocations AS a
            JOIN public.subscription_invoices AS si
              ON si.id = a.invoice_id
            WHERE a.id = v_lock_id
              AND si.subscription_id = v_subscription.id
              AND si.group_id = v_subscription.group_id
            FOR UPDATE OF a;

            IF NOT FOUND THEN
                RAISE EXCEPTION
                    'Allocation % no longer resolves to the authoritative subscription/group',
                    v_lock_id
                    USING ERRCODE = '23503';
            END IF;
        END LOOP;
    END IF;

    IF v_cycle_ids IS NOT NULL THEN
        FOR v_lock_id IN
            SELECT unnest(v_cycle_ids)
            ORDER BY 1
        LOOP
            PERFORM 1
            FROM public.subscription_cycles AS sc
            WHERE sc.id = v_lock_id
              AND sc.subscription_id = v_subscription.id
            FOR UPDATE;
        END LOOP;
    END IF;

    SELECT sp.* INTO v_payment
    FROM public.subscription_payments AS sp
    WHERE sp.id = p_payment_id;

    IF v_payment.status = 'reversed' THEN
        RETURN jsonb_build_object(
            'status', 'already_reversed',
            'payment_id', v_payment.id,
            'invoice_id', v_source_invoice.id,
            'subscription_id', v_subscription.id
        );
    END IF;

    IF v_payment.status <> 'confirmed' THEN
        RAISE EXCEPTION 'Only confirmed payment % can be reversed; current status is %',
            v_payment.id, v_payment.status
            USING ERRCODE = '22023';
    END IF;

    IF v_credit_ids IS NOT NULL THEN
        FOR v_credit IN
            SELECT c.id, c.source_payment_id
            FROM public.subscription_credits AS c
            WHERE c.id = ANY(v_credit_ids)
            ORDER BY c.created_at, c.id
        LOOP
            FOR v_allocation IN
                SELECT a.id
                FROM public.subscription_payment_allocations AS a
                WHERE a.id = ANY(
                    COALESCE(v_allocation_ids, ARRAY[]::uuid[])
                )
                  AND a.credit_id = v_credit.id
                  AND a.status = 'active'
                ORDER BY a.id
            LOOP
                UPDATE public.subscription_payment_allocations
                SET status = 'reversed', reversed_at = v_now
                WHERE id = v_allocation.id AND status = 'active';
            END LOOP;

            UPDATE public.subscription_credits
            SET status = 'reversed', reversed_at = v_now
            WHERE id = v_credit.id AND status <> 'reversed';
        END LOOP;
    END IF;

    FOR v_allocation IN
        SELECT a.id
        FROM public.subscription_payment_allocations AS a
        WHERE a.id = ANY(
            COALESCE(v_allocation_ids, ARRAY[]::uuid[])
        )
          AND a.payment_id = v_payment.id
          AND a.credit_id IS NULL
          AND a.status = 'active'
        ORDER BY a.id
    LOOP
        UPDATE public.subscription_payment_allocations
        SET status = 'reversed', reversed_at = v_now
        WHERE id = v_allocation.id AND status = 'active';
    END LOOP;

    UPDATE public.subscription_payments
    SET status = 'reversed'
    WHERE id = v_payment.id AND status = 'confirmed';

    PERFORM private.append_platform_activity(
        'subscription_payment_reversed',
        jsonb_build_object(
            'payment_id', v_payment.id,
            'invoice_id', v_source_invoice.id,
            'subscription_id', v_subscription.id
        )
    );

    IF v_invoice_ids IS NOT NULL THEN
        FOREACH v_invoice_id IN ARRAY v_invoice_ids
        LOOP
            SELECT si.* INTO v_affected_invoice
            FROM public.subscription_invoices AS si
            WHERE si.id = v_invoice_id;

            SELECT COALESCE(SUM(CASE WHEN a.status = 'active' THEN a.amount ELSE 0::numeric END), 0::numeric)
            INTO v_invoice_applied
            FROM public.subscription_payment_allocations AS a
            WHERE a.invoice_id = v_invoice_id;

            IF v_affected_invoice.total_amount = 0 THEN
                UPDATE public.subscription_invoices
                SET status = 'paid', paid_at = COALESCE(paid_at, v_now)
                WHERE id = v_invoice_id;
            ELSIF v_invoice_applied >= v_affected_invoice.total_amount THEN
                UPDATE public.subscription_invoices
                SET status = 'paid', paid_at = COALESCE(paid_at, v_now)
                WHERE id = v_invoice_id;
            ELSIF v_invoice_applied > 0 THEN
                UPDATE public.subscription_invoices
                SET status = 'partially_paid', paid_at = NULL
                WHERE id = v_invoice_id;
            ELSIF v_affected_invoice.due_at IS NOT NULL AND v_now > v_affected_invoice.due_at THEN
                UPDATE public.subscription_invoices
                SET status = 'overdue', paid_at = NULL
                WHERE id = v_invoice_id;
            ELSE
                UPDATE public.subscription_invoices
                SET status = 'issued', paid_at = NULL
                WHERE id = v_invoice_id;
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.subscription_invoices AS si
                WHERE si.id = v_invoice_id AND si.status = 'paid'
            ) THEN
                UPDATE public.subscription_cycles
                SET status = 'paid'
                WHERE id = v_affected_invoice.cycle_id
                  AND subscription_id = v_subscription.id;
            ELSIF EXISTS (
                SELECT 1 FROM public.subscription_invoices AS si
                WHERE si.id = v_invoice_id AND si.status = 'overdue'
            ) THEN
                UPDATE public.subscription_cycles
                SET status = 'overdue'
                WHERE id = v_affected_invoice.cycle_id
                  AND subscription_id = v_subscription.id;
            ELSE
                UPDATE public.subscription_cycles
                SET status = 'invoiced'
                WHERE id = v_affected_invoice.cycle_id
                  AND subscription_id = v_subscription.id;
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'status', 'reversed',
        'payment_id', v_payment.id,
        'invoice_id', v_source_invoice.id,
        'subscription_id', v_subscription.id
    );
END;
$function$
