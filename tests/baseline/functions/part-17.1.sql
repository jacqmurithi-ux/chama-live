-- STAGE ONLY: production function definitions; ordinal rows 161-170 of 201.
-- Captured read-only on 2026-10-14. Alphabetical order is NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects require separate reconciliation.

CREATE OR REPLACE FUNCTION public.onboard_new_group(p_group_name text, p_category text DEFAULT 'other'::text, p_monthly_contribution numeric DEFAULT 0, p_opening_balance numeric DEFAULT 0, p_description text DEFAULT NULL::text, p_admin_name text DEFAULT NULL::text, p_admin_phone text DEFAULT NULL::text, p_country text DEFAULT 'Kenya'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid;
  v_email text;
  v_admin_name text;
  v_access_code text;
  v_group_id uuid;
  v_member_id uuid;
  v_member_number text;
  v_subscription_id uuid;
  v_cycle_id uuid;
  v_started_at timestamptz;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_group_name IS NULL OR btrim(p_group_name) = '' THEN RAISE EXCEPTION 'Group name is required'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.members
    WHERE auth_user_id = v_uid OR user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'User is already linked to a group';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Authenticated user email not found'; END IF;

  v_admin_name := NULLIF(btrim(p_admin_name), '');
  IF v_admin_name IS NULL THEN v_admin_name := split_part(v_email, '@', 1); END IF;

  v_started_at := now();
  v_access_code := public.generate_group_access_code(p_group_name);

  INSERT INTO public.groups (
    name, category, country, monthly_contribution,
    opening_balance, description, access_code, owner_user_id
  )
  VALUES (
    btrim(p_group_name),
    COALESCE(NULLIF(btrim(p_category), ''), 'other'),
    COALESCE(NULLIF(btrim(p_country), ''), 'Kenya'),
    COALESCE(p_monthly_contribution, 0),
    COALESCE(p_opening_balance, 0),
    p_description, v_access_code, v_uid
  )
  RETURNING id INTO v_group_id;

  SELECT COALESCE(
    max(NULLIF(regexp_replace(member_number, '[^0-9]', '', 'g'), '')::integer),
    0
  ) + 1
  INTO v_member_number
  FROM public.members
  WHERE group_id = v_group_id;

  v_member_number := lpad(v_member_number, 4, '0');

  INSERT INTO public.members (
    group_id, user_id, auth_user_id, member_number, membership_number,
    name, phone, email, role, status, onboarding_status, invited_at, activated_at
  )
  VALUES (
    v_group_id, v_uid, v_uid, v_member_number, v_member_number,
    v_admin_name, COALESCE(NULLIF(btrim(p_admin_phone), ''), ''),
    v_email, 'admin', 'active', 'active', v_started_at, v_started_at
  )
  RETURNING id INTO v_member_id;

  INSERT INTO public.contribution_types (group_id, name, code, created_by)
  SELECT v_group_id, 'Monthly', 'monthly', v_member_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.contribution_types ct
    WHERE ct.group_id = v_group_id
      AND (
        lower(trim(ct.name)) = 'monthly'
        OR lower(trim(coalesce(ct.code, ''))) = 'monthly'
      )
  );

  INSERT INTO public.financial_periods (group_id, month, opening_balance, status)
  VALUES (
    v_group_id, to_char(v_started_at::date, 'YYYY-MM'),
    COALESCE(p_opening_balance, 0), 'open'
  );

  v_subscription_id := private.initialize_group_subscription(v_group_id, v_started_at);
  v_cycle_id := private.create_next_subscription_cycle(v_subscription_id);
  PERFORM public.create_subscription_invoice(v_cycle_id);

  IF NOT EXISTS (
    SELECT 1 FROM public.subscription_cycles sc
    WHERE sc.id = v_cycle_id
      AND sc.subscription_id = v_subscription_id
      AND sc.cycle_number = 1
      AND sc.status = 'invoiced'
  ) THEN
    RAISE EXCEPTION 'Subscription initialization failed to create Cycle 1';
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'group_id', v_group_id, 'member_id', v_member_id,
    'member_number', v_member_number, 'access_code', v_access_code,
    'role', 'admin', 'subscription_id', v_subscription_id,
    'subscription_cycle_id', v_cycle_id
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.prevent_closed_month_contribution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group_id uuid;
  v_month text;
  v_status text;
BEGIN
  IF TG_OP <> 'DELETE' AND NEW.initiative_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_group_id := COALESCE(NEW.group_id, OLD.group_id);
  v_month := COALESCE(
    NEW.month,
    to_char(NEW.contribution_date, 'YYYY-MM'),
    OLD.month,
    to_char(OLD.contribution_date, 'YYYY-MM')
  );

  SELECT status INTO v_status
  FROM public.financial_periods
  WHERE group_id = v_group_id
    AND month = v_month
  LIMIT 1;

  IF lower(COALESCE(v_status, 'open')) = 'closed' THEN
    RAISE EXCEPTION 'Financial month % is closed. Contributions cannot be changed.', v_month;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.prevent_closed_month_expense()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group_id uuid;
  v_month text;
  v_status text;
BEGIN
  v_group_id := COALESCE(NEW.group_id, OLD.group_id);
  v_month := to_char(COALESCE(NEW.date, OLD.date), 'YYYY-MM');

  SELECT status INTO v_status
  FROM public.financial_periods
  WHERE group_id = v_group_id
    AND month = v_month
  LIMIT 1;

  IF lower(COALESCE(v_status, 'open')) = 'closed' THEN
    RAISE EXCEPTION 'Financial month % is closed. Expenses cannot be changed.', v_month;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$


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

  IF NOT public.can_manage_members(v_group_id) THEN
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
$function$


CREATE OR REPLACE FUNCTION public.record_charge_payment(p_charge_id uuid, p_payment_id uuid, p_amount numeric)
 RETURNS charge_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_charge public.financial_charges%rowtype;
    v_obligation public.contribution_obligations%rowtype;
    v_payment public.contributions%rowtype;
    v_period public.financial_periods%rowtype;
    v_applied numeric(14,2);
    v_remaining numeric(14,2);
    v_result public.charge_payments%rowtype;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_charge_id IS NULL OR p_payment_id IS NULL THEN
        RAISE EXCEPTION 'Charge and payment are required';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Charge allocation amount must be greater than zero';
    END IF;

    IF p_amount <> round(p_amount, 2) THEN
        RAISE EXCEPTION 'Charge allocation amount must have no more than two decimal places';
    END IF;

    -- Authoritative lock order for this path:
    -- Canonical global lock order for this path:
    --   authoritative accounting key read (no row lock)
    --   -> accounting advisory lock
    --   -> obligation FOR UPDATE
    --   -> period lock
    --   -> charge FOR UPDATE
    --   -> payment FOR SHARE.
    -- The canonical contribution writer and refresh path acquire accounting
    -- locks before obligation work. This path therefore MUST acquire the
    -- accounting lock before locking the obligation row. After the accounting
    -- lock is held, the obligation is locked and re-read; any change to the
    -- group/month used for the lock key causes the transaction to abort rather
    -- than operating under a stale serialization key.
    SELECT fc.*
      INTO v_charge
    FROM public.financial_charges fc
    WHERE fc.id = p_charge_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Financial charge % does not exist', p_charge_id;
    END IF;

    -- Derive the serialization key from the persisted charge identity,
    -- without locking the obligation first. This is a key read only.
    PERFORM public.cl_2b_accounting_lock(
        v_charge.group_id,
        v_charge.accounting_month
    );

    -- Now acquire the authoritative obligation row lock under the canonical
    -- accounting lock. Re-read the row and reject any stale key rather than
    -- silently serializing the operation against the wrong accounting month.
    SELECT co.*
      INTO v_obligation
    FROM public.contribution_obligations co
    WHERE co.id = v_charge.obligation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Financial charge % references a missing obligation', p_charge_id;
    END IF;

    IF v_charge.group_id IS DISTINCT FROM v_obligation.group_id
       OR v_charge.member_id IS DISTINCT FROM v_obligation.member_id
       OR v_charge.accounting_month IS DISTINCT FROM
          pg_catalog.to_char(v_obligation.obligation_month, 'YYYY-MM')
    THEN
        RAISE EXCEPTION 'Financial charge % is inconsistent with its obligation', p_charge_id;
    END IF;

    IF NOT public.cl_user_has_role(
        v_obligation.group_id,
        ARRAY['admin','chairperson','secretary','treasurer']::text[]
    ) THEN
        RAISE EXCEPTION 'Finance authorization required';
    END IF;

    v_period := public.ensure_financial_period(
        v_obligation.group_id,
        v_charge.accounting_month
    );

    IF lower(coalesce(v_period.status, 'open')) = 'closed' THEN
        RAISE EXCEPTION 'Financial period % is closed',
            pg_catalog.to_char(v_obligation.obligation_month, 'YYYY-MM');
    END IF;

    SELECT fc.*
      INTO v_charge
    FROM public.financial_charges fc
    WHERE fc.id = p_charge_id
    FOR UPDATE;

    IF v_charge.group_id IS DISTINCT FROM v_obligation.group_id
       OR v_charge.member_id IS DISTINCT FROM v_obligation.member_id
       OR v_charge.obligation_id IS DISTINCT FROM v_obligation.id
       OR v_charge.accounting_month IS DISTINCT FROM
          pg_catalog.to_char(v_obligation.obligation_month, 'YYYY-MM')
    THEN
        RAISE EXCEPTION 'Financial charge % changed inconsistently with its obligation', p_charge_id;
    END IF;

    IF v_charge.status = 'cancelled' THEN
        RAISE EXCEPTION 'Financial charge % is cancelled', p_charge_id;
    END IF;

    SELECT c.*
      INTO v_payment
    FROM public.contributions c
    WHERE c.id = p_payment_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
    END IF;

    IF v_payment.group_id <> v_charge.group_id
       OR v_payment.member_id <> v_charge.member_id
    THEN
        RAISE EXCEPTION 'Payment % does not belong to charge group/member', p_payment_id;
    END IF;

    SELECT COALESCE(SUM(cp.amount_applied), 0)::numeric(14,2)
      INTO v_applied
    FROM public.charge_payments cp
    WHERE cp.charge_id = p_charge_id
      AND cp.status = 'applied';

    v_remaining := v_charge.amount - v_applied;

    IF v_remaining <= 0 THEN
        RAISE EXCEPTION 'Financial charge % has no remaining balance', p_charge_id;
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


CREATE OR REPLACE FUNCTION public.record_contribution_initiative_payment(p_initiative_id uuid, p_member_id uuid, p_amount numeric, p_contribution_date date, p_payment_method text, p_reference text, p_mpesa_reference text, p_notes text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_i public.contribution_initiatives; v_o public.contribution_initiative_obligations; v_existing jsonb; v_payment uuid; v_allocated numeric; v_claimed boolean; v_member_group uuid; v_member_user uuid; v_member_auth uuid; BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF; IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request id is required'; END IF; SELECT m.group_id,m.user_id,m.auth_user_id INTO v_member_group,v_member_user,v_member_auth FROM public.members m WHERE m.id=p_member_id AND lower(coalesce(m.status,'active'))='active'; IF v_member_group IS NULL THEN RAISE EXCEPTION 'Member not found or inactive'; END IF; IF NOT (public.can_manage_members(v_member_group) OR v_member_user=auth.uid() OR v_member_auth=auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF; INSERT INTO private.contribution_initiative_requests(request_id,operation,result) VALUES(p_request_id,'record_initiative_payment','{}'::jsonb) ON CONFLICT(request_id,operation) DO NOTHING RETURNING true INTO v_claimed; IF NOT coalesce(v_claimed,false) THEN SELECT result INTO v_existing FROM private.contribution_initiative_requests WHERE request_id=p_request_id AND operation='record_initiative_payment'; RETURN v_existing; END IF; SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE; IF NOT FOUND OR v_i.group_id IS DISTINCT FROM v_member_group THEN RAISE EXCEPTION 'Initiative not found'; END IF; IF v_i.status <> 'active' THEN RAISE EXCEPTION 'Initiative is not active'; END IF; IF p_contribution_date < v_i.start_date OR p_contribution_date > v_i.closing_date THEN RAISE EXCEPTION 'Payment date outside initiative window'; END IF; IF p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF; SELECT o.* INTO v_o FROM public.contribution_initiative_obligations o WHERE o.initiative_id=p_initiative_id AND o.member_id=p_member_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Member has no initiative obligation'; END IF; SELECT coalesce(sum(a.amount),0) INTO v_allocated FROM public.contribution_initiative_allocations a WHERE a.initiative_obligation_id=v_o.id; IF p_amount > v_o.amount_due-v_allocated THEN RAISE EXCEPTION 'Payment exceeds outstanding initiative obligation'; END IF; INSERT INTO public.contributions(group_id,member_id,amount,contribution_type,month,payment_method,reference,recorded_by,contribution_date,notes,mpesa_reference,initiative_id) VALUES(v_i.group_id,p_member_id,p_amount,'initiative',to_char(p_contribution_date,'YYYY-MM'),p_payment_method,p_reference,auth.uid(),p_contribution_date,p_notes,p_mpesa_reference,p_initiative_id) RETURNING id INTO v_payment; INSERT INTO public.contribution_initiative_allocations(payment_id,initiative_obligation_id,amount) VALUES(v_payment,v_o.id,p_amount); v_existing=jsonb_build_object('status','recorded','payment_id',v_payment,'initiative_id',v_i.id,'obligation_id',v_o.id,'amount',p_amount); UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_existing WHERE request_id=p_request_id AND operation='record_initiative_payment'; RETURN v_existing; END; $function$


CREATE OR REPLACE FUNCTION public.record_custom_contribution_payment(p_group_id uuid, p_member_id uuid, p_contribution_type_id uuid, p_amount numeric, p_contribution_date date, p_payment_method text, p_reference text, p_notes text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auth_user_id uuid := auth.uid();
  v_actor_member_id uuid;
  v_type_name text;
  v_start date;
  v_end date;
  v_obligation record;
  v_remaining numeric := p_amount;
  v_allocated numeric := 0;
  v_due numeric;
  v_paid numeric;
  v_apply numeric;
  v_payload jsonb;
  v_hash text;
  v_existing_hash text;
  v_existing_result jsonb;
  v_payment_id uuid := p_request_id;
begin
  if v_auth_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;

  if p_group_id is null or p_member_id is null
     or p_contribution_type_id is null or p_request_id is null then
    raise exception 'REQUIRED_PAYMENT_FIELDS_MISSING' using errcode='22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'PAYMENT_AMOUNT_MUST_BE_POSITIVE' using errcode='22023';
  end if;

  if p_contribution_date is null then
    raise exception 'CONTRIBUTION_DATE_REQUIRED' using errcode='22023';
  end if;

  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.owner_user_id = v_auth_user_id
  ) and not public.cl_user_has_role(
    p_group_id, array['chairperson','treasurer','secretary']::text[]
  ) then
    raise exception 'CUSTOM_PAYMENT_NOT_AUTHORIZED' using errcode='42501';
  end if;

  select m.id into v_actor_member_id
  from public.members m
  where m.group_id = p_group_id
    and (m.user_id = v_auth_user_id or m.auth_user_id = v_auth_user_id)
    and lower(coalesce(m.status,'active')) = 'active'
    and lower(coalesce(m.onboarding_status,'active')) = 'active'
  order by m.id
  limit 1;

  if v_actor_member_id is null then
    raise exception 'ACTIVE_GROUP_MEMBER_REQUIRED' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.members m
    where m.id = p_member_id
      and m.group_id = p_group_id
      and lower(coalesce(m.status,'active')) = 'active'
  ) then
    raise exception 'MEMBER_NOT_IN_GROUP' using errcode='22023';
  end if;

  select ct.name into v_type_name
  from public.contribution_types ct
  where ct.id = p_contribution_type_id
    and ct.group_id = p_group_id;

  if v_type_name is null then
    raise exception 'CONTRIBUTION_TYPE_NOT_FOUND' using errcode='22023';
  end if;

  v_payload := jsonb_build_object(
    'group_id',p_group_id,'member_id',p_member_id,
    'contribution_type_id',p_contribution_type_id,'amount',p_amount,
    'contribution_date',p_contribution_date,
    'payment_method',coalesce(p_payment_method,''),
    'reference',coalesce(p_reference,''),
    'notes',coalesce(p_notes,'')
  );
  v_hash := encode(
    extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended('chama-live:custom-payment:'||p_request_id::text,0)
  );

  select payload_hash,result
  into v_existing_hash,v_existing_result
  from private.custom_contribution_payment_requests
  where request_id = p_request_id and operation = 'record'
  for update;

  if v_existing_hash is not null then
    if v_existing_hash <> v_hash then
      raise exception 'REQUEST_ID_REUSE_MISMATCH' using errcode='22023';
    end if;
    if v_existing_result is null then
      raise exception 'REQUEST_ALREADY_CLAIMED_WITHOUT_RESULT' using errcode='55000';
    end if;
    return jsonb_set(
      v_existing_result,'{replayed}','true'::jsonb,true
    );
  end if;

  select min(cp.opening_date), max(cp.closing_date)
  into v_start,v_end
  from public.contribution_periods cp
  where cp.group_id = p_group_id
    and cp.contribution_type_id = p_contribution_type_id
    and cp.status in ('open','due','grace')
    and cp.opening_date <= p_contribution_date
    and p_contribution_date <= cp.closing_date;

  if v_start is null then
    raise exception 'NO_ELIGIBLE_CUSTOM_CONTRIBUTION_PERIOD' using errcode='22023';
  end if;

  perform public.cl_2b_accounting_lock_range(
    p_group_id,
    date_trunc('month',v_start)::date,
    date_trunc('month',greatest(v_end,p_contribution_date))::date
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:'||p_group_id::text||':'||p_member_id::text,0
    )
  );

  insert into private.custom_contribution_payment_requests(
    request_id,operation,group_id,member_id,contribution_type_id,payload_hash
  )
  values(
    p_request_id,'record',p_group_id,p_member_id,p_contribution_type_id,v_hash
  );

  insert into public.contributions(
    id,group_id,member_id,amount,contribution_type,month,
    payment_method,reference,recorded_by,goal_id,contribution_date,
    notes,mpesa_reference
  )
  values(
    v_payment_id,p_group_id,p_member_id,p_amount,v_type_name,
    to_char(p_contribution_date,'YYYY-MM'),coalesce(p_payment_method,'Cash'),
    nullif(trim(p_reference),''),v_actor_member_id,null,p_contribution_date,
    nullif(trim(p_notes),''), 
    case when lower(coalesce(p_payment_method,''))='m-pesa'
      then nullif(trim(p_reference),'') else null end
  );

  for v_obligation in
    select o.id,o.due_amount,o.obligation_month
    from public.contribution_obligations o
    join public.contribution_periods cp on cp.id=o.period_id
    where o.group_id=p_group_id
      and o.member_id=p_member_id
      and o.contribution_type_id=p_contribution_type_id
      and o.component_kind='PARENT'
      and o.lifecycle_state='ACTIVE'
      and cp.status in ('open','due','grace')
      and cp.opening_date <= p_contribution_date
      and p_contribution_date <= cp.closing_date
    order by o.obligation_month asc,o.id asc
    for update
  loop
    exit when v_remaining <= 0;

    select coalesce(sum(a.amount),0)
    into v_paid
    from public.contribution_allocations a
    where a.obligation_id=v_obligation.id;

    v_due := greatest(v_obligation.due_amount-v_paid,0);
    if v_due <= 0 then
      continue;
    end if;

    v_apply := least(v_remaining,v_due);

    insert into public.contribution_allocations(
      payment_id,obligation_id,amount
    ) values(v_payment_id,v_obligation.id,v_apply);

    v_remaining := v_remaining-v_apply;
    v_allocated := v_allocated+v_apply;
  end loop;

  if v_allocated > p_amount then
    raise exception 'PAYMENT_OVER_ALLOCATION_DETECTED';
  end if;

  v_existing_result := jsonb_build_object(
    'ok',true,'replayed',false,'payment_id',v_payment_id,
    'contribution_type_id',p_contribution_type_id,'amount',p_amount,
    'allocated_amount',v_allocated,
    'unapplied_amount',greatest(v_remaining,0)
  );

  update private.custom_contribution_payment_requests
  set result=v_existing_result,completed_at=now()
  where request_id=p_request_id and operation='record';

  return v_existing_result;
end;
$function$


CREATE OR REPLACE FUNCTION public.record_existing_member_historical_payments(p_request_id uuid, p_member_id uuid, p_monthly_amount numeric, p_effective_from date, p_effective_to date, p_first_period_rule text, p_payments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_auth_uid uuid;
  v_creator_member_id uuid;
  v_member public.members%ROWTYPE;
  v_group_id uuid;
  v_payload_hash text;
  v_existing_payload_hash text;
  v_existing_result jsonb;
  v_canonical_payments jsonb;
  v_monthly_type_id uuid;
  v_existing_rule public.member_contribution_rules%ROWTYPE;
  v_first_payment_month date;
  v_last_payment_month date;
  v_obligation_start_month date;
  v_accounting_end_month date;
  v_payment_date date;
  v_payment_month date;
  v_closed_month text;
  v_item jsonb;
  v_payment_id uuid;
  v_amount numeric;
  v_payment_method text;
  v_reference text;
  v_mpesa_reference text;
  v_notes text;
  v_record_result jsonb;
  v_idempotent_replay boolean;
  v_payment_count integer := 0;
  v_recorded_count integer := 0;
  v_replayed_count integer := 0;
  v_obligations_count integer := 0;
  v_total_due numeric := 0;
  v_total_allocated numeric := 0;
  v_credit numeric := 0;
  v_arrears numeric := 0;
  v_position_status text;
  v_result jsonb;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'REQUEST_ID_REQUIRED'; END IF;
  IF p_member_id IS NULL THEN RAISE EXCEPTION 'MEMBER_ID_REQUIRED'; END IF;
  IF p_monthly_amount IS NULL OR p_monthly_amount <= 0 THEN RAISE EXCEPTION 'MONTHLY_AMOUNT_MUST_BE_POSITIVE'; END IF;
  IF p_effective_from IS NULL THEN RAISE EXCEPTION 'EFFECTIVE_FROM_REQUIRED'; END IF;
  IF date_trunc('month', p_effective_from)::date <> p_effective_from THEN RAISE EXCEPTION 'EFFECTIVE_FROM_MUST_BE_FIRST_OF_MONTH'; END IF;
  IF p_effective_to IS NOT NULL AND p_effective_to < p_effective_from THEN RAISE EXCEPTION 'EFFECTIVE_TO_CANNOT_PRECEDE_EFFECTIVE_FROM'; END IF;
  IF p_first_period_rule IS NULL OR p_first_period_rule NOT IN ('full_period','next_full_period') THEN RAISE EXCEPTION 'INVALID_FIRST_PERIOD_RULE'; END IF;
  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' OR jsonb_array_length(p_payments) = 0 THEN RAISE EXCEPTION 'HISTORICAL_PAYMENTS_ARRAY_REQUIRED'; END IF;

  SELECT m.* INTO v_member FROM public.members m WHERE m.id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  v_group_id := v_member.group_id;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'MEMBER_GROUP_REQUIRED'; END IF;

  SELECT m.id INTO v_creator_member_id
  FROM public.members m
  WHERE m.group_id = v_group_id
    AND (m.user_id = v_auth_uid OR m.auth_user_id = v_auth_uid)
    AND lower(coalesce(m.status,'')) = 'active'
    AND lower(coalesce(m.onboarding_status,'')) = 'active'
  ORDER BY m.id LIMIT 1;
  IF v_creator_member_id IS NULL THEN RAISE EXCEPTION 'ACTIVE_GROUP_MEMBERSHIP_REQUIRED'; END IF;
  IF NOT public.can_manage_members(v_group_id) THEN RAISE EXCEPTION 'MEMBER_MANAGEMENT_PERMISSION_REQUIRED'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    v_payment_count := v_payment_count + 1;
    IF jsonb_typeof(v_item) <> 'object' THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_MUST_BE_OBJECT',v_payment_count; END IF;
    IF NULLIF(trim(v_item->>'payment_id'),'') IS NULL THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_PAYMENT_ID_REQUIRED',v_payment_count; END IF;
    BEGIN v_payment_id := (v_item->>'payment_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_PAYMENT_ID_INVALID',v_payment_count; END;
    IF NULLIF(trim(v_item->>'payment_date'),'') IS NULL THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_DATE_REQUIRED',v_payment_count; END IF;
    BEGIN v_payment_date := (v_item->>'payment_date')::date; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_DATE_INVALID',v_payment_count; END;
    IF NULLIF(trim(v_item->>'amount'),'') IS NULL THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_AMOUNT_REQUIRED',v_payment_count; END IF;
    BEGIN v_amount := (v_item->>'amount')::numeric; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_AMOUNT_INVALID',v_payment_count; END;
    IF v_amount <= 0 THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_AMOUNT_MUST_BE_POSITIVE',v_payment_count; END IF;
    v_payment_method := trim(coalesce(v_item->>'payment_method',''));
    IF v_payment_method NOT IN ('M-Pesa','Cash','Bank transfer') THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_INVALID_PAYMENT_METHOD',v_payment_count; END IF;
    v_reference := NULLIF(trim(v_item->>'reference'),'');
    v_mpesa_reference := NULLIF(trim(v_item->>'mpesa_reference'),'');
    v_notes := NULLIF(trim(v_item->>'notes'),'');
    IF v_payment_method <> 'M-Pesa' AND v_mpesa_reference IS NOT NULL THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_MPESA_REFERENCE_REQUIRES_MPESA',v_payment_count; END IF;
    v_payment_month := date_trunc('month',v_payment_date)::date;
    IF v_payment_month < p_effective_from THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_BEFORE_RULE_EFFECTIVE_FROM',v_payment_count; END IF;
    IF p_effective_to IS NOT NULL AND v_payment_month > p_effective_to THEN RAISE EXCEPTION 'HISTORICAL_PAYMENT_%_AFTER_RULE_EFFECTIVE_TO',v_payment_count; END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM (SELECT (value->>'payment_id')::uuid payment_id FROM jsonb_array_elements(p_payments)) q
    GROUP BY payment_id HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'DUPLICATE_PAYMENT_ID_IN_REQUEST'; END IF;

  SELECT min(date_trunc('month',(value->>'payment_date')::date)::date),
         max(date_trunc('month',(value->>'payment_date')::date)::date)
  INTO v_first_payment_month,v_last_payment_month
  FROM jsonb_array_elements(p_payments);

  IF p_first_period_rule = 'next_full_period' THEN
    v_obligation_start_month := (date_trunc('month',p_effective_from)+interval '1 month')::date;
  ELSE
    v_obligation_start_month := date_trunc('month',p_effective_from)::date;
  END IF;
  IF v_first_payment_month < v_obligation_start_month THEN RAISE EXCEPTION 'PAYMENT_PRECEDES_FIRST_ELIGIBLE_OBLIGATION_MONTH'; END IF;
  v_accounting_end_month := v_last_payment_month;

  SELECT jsonb_agg(value ORDER BY (value->>'payment_id')::uuid) INTO v_canonical_payments
  FROM jsonb_array_elements(p_payments);
  v_payload_hash := pg_catalog.md5(jsonb_build_object(
    'member_id',p_member_id,'monthly_amount',p_monthly_amount,'effective_from',p_effective_from,
    'effective_to',p_effective_to,'first_period_rule',p_first_period_rule,'payments',v_canonical_payments)::text);

  INSERT INTO private.member_historical_payment_requests(request_id,member_id,group_id,payload_hash)
  VALUES(p_request_id,p_member_id,v_group_id,v_payload_hash)
  ON CONFLICT(request_id) DO NOTHING;

  SELECT r.payload_hash,r.result INTO v_existing_payload_hash,v_existing_result
  FROM private.member_historical_payment_requests r
  WHERE r.request_id=p_request_id FOR UPDATE;
  IF v_existing_payload_hash IS DISTINCT FROM v_payload_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  IF v_existing_result IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'idempotent_replay',true,'request_id',p_request_id,'result',v_existing_result);
  END IF;

  SELECT m.* INTO v_member FROM public.members m WHERE m.id=p_member_id AND m.group_id=v_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NO_LONGER_EXISTS_IN_GROUP'; END IF;
  IF lower(coalesce(v_member.status,'')) <> 'active' THEN RAISE EXCEPTION 'TARGET_MEMBER_NOT_ACTIVE'; END IF;
  IF lower(coalesce(v_member.onboarding_status,'')) <> 'active' THEN RAISE EXCEPTION 'TARGET_MEMBER_ONBOARDING_NOT_ACTIVE'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chama-live:member:'||v_group_id::text||':'||p_member_id::text,0));
  PERFORM public.cl_2b_accounting_lock_range(v_group_id,v_obligation_start_month,v_accounting_end_month);

  SELECT fp.month INTO v_closed_month
  FROM public.financial_periods fp
  WHERE fp.group_id=v_group_id
    AND fp.month >= to_char(v_obligation_start_month,'YYYY-MM')
    AND fp.month <= to_char(v_accounting_end_month,'YYYY-MM')
    AND lower(coalesce(fp.status,'open'))='closed'
  ORDER BY fp.month LIMIT 1;
  IF v_closed_month IS NOT NULL THEN RAISE EXCEPTION 'FINANCIAL_MONTH_CLOSED:%',v_closed_month; END IF;

  SELECT ct.id INTO v_monthly_type_id
  FROM public.contribution_types ct
  WHERE ct.group_id=v_group_id AND (ct.code='monthly' OR lower(trim(ct.name))='monthly')
  ORDER BY CASE WHEN ct.code='monthly' THEN 0 ELSE 1 END,ct.created_at,ct.id LIMIT 1;
  IF v_monthly_type_id IS NULL THEN RAISE EXCEPTION 'MONTHLY_CONTRIBUTION_TYPE_NOT_FOUND'; END IF;

  SELECT r.* INTO v_existing_rule
  FROM public.member_contribution_rules r
  WHERE r.group_id=v_group_id AND r.member_id=p_member_id AND r.contribution_type_id=v_monthly_type_id
    AND r.frequency='monthly' AND r.status='active'
    AND r.effective_from <= v_obligation_start_month
    AND (r.effective_to IS NULL OR r.effective_to >= v_accounting_end_month)
  ORDER BY r.effective_from DESC,r.created_at DESC LIMIT 1;

  IF v_existing_rule.id IS NOT NULL THEN
    IF v_existing_rule.amount <> p_monthly_amount THEN
      RAISE EXCEPTION 'MONTHLY_RULE_AMOUNT_CONFLICT:existing=%,requested=%',v_existing_rule.amount,p_monthly_amount;
    END IF;
    IF v_existing_rule.first_period_rule <> p_first_period_rule THEN RAISE EXCEPTION 'MONTHLY_RULE_FIRST_PERIOD_CONFLICT'; END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.member_contribution_rules r
      WHERE r.group_id=v_group_id AND r.member_id=p_member_id AND r.contribution_type_id=v_monthly_type_id
        AND daterange(r.effective_from,coalesce(r.effective_to+1,'infinity'::date),'[)')
            && daterange(p_effective_from,coalesce(p_effective_to+1,'infinity'::date),'[)')
    ) THEN RAISE EXCEPTION 'MONTHLY_RULE_OVERLAP_REQUIRES_EXPLICIT_RECONCILIATION'; END IF;

    INSERT INTO public.member_contribution_rules(
      group_id,member_id,contribution_type_id,amount,frequency,effective_from,effective_to,
      first_period_rule,status,created_by
    ) VALUES(
      v_group_id,p_member_id,v_monthly_type_id,p_monthly_amount,'monthly',p_effective_from,p_effective_to,
      p_first_period_rule,'active',v_creator_member_id
    );
  END IF;

  PERFORM public.cl_2b_refresh_member(p_member_id,v_accounting_end_month);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    v_payment_month := date_trunc('month',(v_item->>'payment_date')::date)::date;
    IF NOT EXISTS (
      SELECT 1 FROM public.contribution_obligations o
      WHERE o.group_id=v_group_id AND o.member_id=p_member_id AND o.contribution_type_id=v_monthly_type_id
        AND o.obligation_month=v_payment_month
    ) THEN RAISE EXCEPTION 'MONTHLY_OBLIGATION_NOT_FOUND:%',to_char(v_payment_month,'YYYY-MM'); END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    v_payment_id := (v_item->>'payment_id')::uuid;
    v_payment_date := (v_item->>'payment_date')::date;
    v_amount := (v_item->>'amount')::numeric;
    v_payment_method := trim(v_item->>'payment_method');
    v_reference := NULLIF(trim(v_item->>'reference'),'');
    v_mpesa_reference := NULLIF(trim(v_item->>'mpesa_reference'),'');
    v_notes := NULLIF(trim(v_item->>'notes'),'');

    v_record_result := public.cl_2b_record_contribution(
      p_payment_id=>v_payment_id,p_group_id=>v_group_id,p_member_id=>p_member_id,p_amount=>v_amount,
      p_contribution_date=>v_payment_date,p_contribution_type=>'monthly',p_payment_method=>v_payment_method,
      p_reference=>v_reference,p_mpesa_reference=>v_mpesa_reference,p_goal_id=>NULL,p_notes=>v_notes
    );
    IF coalesce((v_record_result->>'success')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'CANONICAL_PAYMENT_RECORDING_FAILED:%',v_payment_id;
    END IF;
    v_idempotent_replay := coalesce((v_record_result->>'idempotent_replay')::boolean,false);
    IF v_idempotent_replay THEN v_replayed_count:=v_replayed_count+1; ELSE v_recorded_count:=v_recorded_count+1; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.contributions c
      WHERE c.id=v_payment_id AND c.group_id=v_group_id AND c.member_id=p_member_id
        AND c.amount=v_amount AND c.contribution_date=v_payment_date
        AND lower(trim(coalesce(c.contribution_type,'')))='monthly'
    ) THEN RAISE EXCEPTION 'CANONICAL_PAYMENT_VERIFICATION_FAILED:%',v_payment_id; END IF;
  END LOOP;

  PERFORM public.cl_2b_refresh_member(p_member_id,v_accounting_end_month);

  IF EXISTS (
    SELECT 1 FROM public.contribution_allocations a
    JOIN public.contributions p ON p.id=a.payment_id
    JOIN public.contribution_obligations o ON o.id=a.obligation_id
    WHERE p.member_id=p_member_id
      AND (p.group_id<>v_group_id OR o.group_id<>v_group_id OR o.member_id<>p_member_id)
  ) THEN RAISE EXCEPTION 'CROSS_MEMBER_OR_GROUP_ALLOCATION_DETECTED'; END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT a.payment_id,sum(a.amount) allocated
      FROM public.contribution_allocations a JOIN public.contributions p ON p.id=a.payment_id
      WHERE p.member_id=p_member_id AND p.group_id=v_group_id GROUP BY a.payment_id
    ) x JOIN public.contributions p ON p.id=x.payment_id WHERE x.allocated>p.amount
  ) THEN RAISE EXCEPTION 'PAYMENT_OVER_ALLOCATION_DETECTED'; END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT a.obligation_id,sum(a.amount) allocated
      FROM public.contribution_allocations a JOIN public.contribution_obligations o ON o.id=a.obligation_id
      WHERE o.member_id=p_member_id AND o.group_id=v_group_id AND o.contribution_type_id=v_monthly_type_id
      GROUP BY a.obligation_id
    ) x JOIN public.contribution_obligations o ON o.id=x.obligation_id WHERE x.allocated>o.due_amount
  ) THEN RAISE EXCEPTION 'OBLIGATION_OVER_ALLOCATION_DETECTED'; END IF;

  SELECT count(*)::integer,coalesce(sum(o.due_amount),0)::numeric
  INTO v_obligations_count,v_total_due
  FROM public.contribution_obligations o
  WHERE o.group_id=v_group_id AND o.member_id=p_member_id AND o.contribution_type_id=v_monthly_type_id;

  SELECT coalesce(sum(a.amount),0)::numeric INTO v_total_allocated
  FROM public.contribution_allocations a JOIN public.contribution_obligations o ON o.id=a.obligation_id
  WHERE o.group_id=v_group_id AND o.member_id=p_member_id AND o.contribution_type_id=v_monthly_type_id;

  SELECT greatest(
    coalesce(sum(c.amount),0)-coalesce((
      SELECT sum(a.amount) FROM public.contribution_allocations a
      JOIN public.contributions c2 ON c2.id=a.payment_id
      WHERE c2.group_id=v_group_id AND c2.member_id=p_member_id
        AND lower(trim(coalesce(c2.contribution_type,'')))='monthly'
    ),0),0
  )::numeric
  INTO v_credit
  FROM public.contributions c
  WHERE c.group_id=v_group_id AND c.member_id=p_member_id
    AND lower(trim(coalesce(c.contribution_type,'')))='monthly';

  v_arrears:=greatest(v_total_due-v_total_allocated,0);
  v_position_status:=CASE WHEN v_arrears>0 THEN 'ARREARS' WHEN v_credit>0 THEN 'CREDIT' ELSE 'UP_TO_DATE' END;

  v_result:=jsonb_build_object(
    'success',true,'idempotent_replay',false,'request_id',p_request_id,'member_id',p_member_id,
    'group_id',v_group_id,'monthly_contribution_type_id',v_monthly_type_id,'monthly_amount',p_monthly_amount,
    'effective_from',p_effective_from,'effective_to',p_effective_to,'first_period_rule',p_first_period_rule,
    'historical_first_month',v_first_payment_month,'historical_last_month',v_last_payment_month,
    'obligation_start_month',v_obligation_start_month,'payments_requested',v_payment_count,
    'payments_recorded',v_recorded_count,'payments_replayed',v_replayed_count,'obligations_count',v_obligations_count,
    'total_due',v_total_due,'total_allocated',v_total_allocated,'arrears',v_arrears,'credit',v_credit,
    'position_status',v_position_status,'accounting_engine','cl_2b_record_contribution + cl_2b_refresh_member'
  );

  UPDATE private.member_historical_payment_requests
  SET result=v_result,completed_at=now() WHERE request_id=p_request_id;
  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.record_my_initiative_payment(p_initiative_id uuid, p_amount numeric, p_contribution_date date, p_payment_method text, p_reference text, p_mpesa_reference text, p_notes text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_member uuid; v_group uuid; v_i public.contribution_initiatives;
BEGIN
  SELECT m.id,m.group_id INTO v_member,v_group
  FROM public.members m
  WHERE auth.uid() IS NOT NULL AND (m.user_id=auth.uid() OR m.auth_user_id=auth.uid())
    AND lower(coalesce(m.status,'active'))='active'
  ORDER BY m.created_at,m.id LIMIT 1;
  IF v_member IS NULL THEN RAISE EXCEPTION 'Authenticated member not found'; END IF;
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id;
  IF NOT FOUND OR v_i.group_id IS DISTINCT FROM v_group THEN RAISE EXCEPTION 'Initiative not found'; END IF;
  RETURN public.record_contribution_initiative_payment(
    p_initiative_id,v_member,p_amount,p_contribution_date,p_payment_method,p_reference,
    p_mpesa_reference,p_notes,p_request_id
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.record_other_contribution_payment(p_cycle_id uuid, p_member_id uuid, p_amount numeric, p_contribution_date date, p_payment_method text, p_reference text, p_mpesa_reference text, p_notes text, p_payment_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_uid uuid := auth.uid();
    v_cycle public.contribution_periods%ROWTYPE;
    v_type public.contribution_types%ROWTYPE;
    v_member public.members%ROWTYPE;
    v_existing_request private.other_contribution_payment_requests%ROWTYPE;
    v_payload jsonb;
    v_payload_hash text;
    v_payment_month date;
    v_month text;
    v_financial_period public.financial_periods%ROWTYPE;
    v_lock_start date;
    v_lock_end date;
    v_initial_lock_start date;
    v_initial_lock_end date;
    v_recheck_start date;
    v_recheck_end date;
    v_payment public.contributions%ROWTYPE;
    v_obligation public.contribution_obligations%ROWTYPE;
    v_outstanding numeric;
    v_remaining numeric;
    v_allocate numeric;
    v_allocated numeric := 0;
    v_allocation_count integer := 0;
    v_result jsonb;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
    IF p_cycle_id IS NULL OR p_member_id IS NULL OR p_payment_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Cycle, member, payment id and request id are required'; END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
    IF p_contribution_date IS NULL THEN RAISE EXCEPTION 'Contribution date is required'; END IF;
    IF p_payment_method IS NULL OR p_payment_method NOT IN ('M-Pesa','Cash','Bank transfer') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;

    IF p_payment_method = 'M-Pesa' THEN
        IF p_reference IS NULL OR btrim(p_reference) = '' THEN RAISE EXCEPTION 'M-Pesa payment requires a payment reference'; END IF;
        IF p_mpesa_reference IS NULL OR btrim(p_mpesa_reference) = '' THEN RAISE EXCEPTION 'M-Pesa payment requires an M-Pesa reference'; END IF;
        p_reference := btrim(p_reference);
        p_mpesa_reference := btrim(p_mpesa_reference);
        IF lower(p_reference) IS DISTINCT FROM lower(p_mpesa_reference) THEN RAISE EXCEPTION 'M-Pesa reference and payment reference must match'; END IF;
    ELSE
        IF p_reference IS NOT NULL THEN p_reference := btrim(p_reference); IF p_reference = '' THEN p_reference := NULL; END IF; END IF;
        IF p_mpesa_reference IS NOT NULL THEN p_mpesa_reference := btrim(p_mpesa_reference); IF p_mpesa_reference = '' THEN p_mpesa_reference := NULL; END IF; END IF;
        IF p_mpesa_reference IS NOT NULL THEN RAISE EXCEPTION 'M-Pesa reference is only valid for M-Pesa payments'; END IF;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('chama-live:other-payment-request:' || p_request_id::text || ':record_other_contribution_payment', 0));

    SELECT cp.* INTO v_cycle FROM public.contribution_periods cp WHERE cp.id = p_cycle_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Other contribution cycle not found'; END IF;
    IF v_cycle.status <> 'open' THEN RAISE EXCEPTION 'Other contribution cycle is not open'; END IF;
    IF v_cycle.group_id IS NULL OR v_cycle.contribution_type_id IS NULL THEN RAISE EXCEPTION 'Other contribution cycle has incomplete group/type lineage'; END IF;

    SELECT ct.* INTO v_type FROM public.contribution_types ct WHERE ct.id = v_cycle.contribution_type_id AND ct.group_id = v_cycle.group_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Other contribution type does not belong to cycle group'; END IF;
    IF lower(coalesce(v_type.code,'')) <> 'special' THEN RAISE EXCEPTION 'Cycle contribution type is not the registered Other type'; END IF;
    IF NOT public.cl_user_has_role(v_cycle.group_id, ARRAY['admin','chairperson','secretary','treasurer']::text[]) THEN RAISE EXCEPTION 'Finance authorization required'; END IF;

    v_payload := jsonb_build_object('cycle_id', p_cycle_id, 'member_id', p_member_id, 'amount', p_amount, 'contribution_date', p_contribution_date, 'payment_method', p_payment_method, 'reference', p_reference, 'mpesa_reference', p_mpesa_reference, 'notes', p_notes, 'payment_id', p_payment_id);
    v_payload_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');

    INSERT INTO private.other_contribution_payment_requests (request_id, operation, group_id, member_id, cycle_id, payment_id, payload_hash, result)
    VALUES (p_request_id, 'record_other_contribution_payment', v_cycle.group_id, p_member_id, p_cycle_id, NULL, v_payload_hash, '{}'::jsonb)
    ON CONFLICT (request_id, operation) DO NOTHING;

    SELECT r.* INTO v_existing_request FROM private.other_contribution_payment_requests r
    WHERE r.request_id = p_request_id AND r.operation = 'record_other_contribution_payment' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unable to establish payment request ledger entry'; END IF;

    IF v_existing_request.payload_hash IS DISTINCT FROM v_payload_hash THEN RAISE EXCEPTION 'Request id is already bound to a different payment payload'; END IF;
    IF v_existing_request.group_id IS DISTINCT FROM v_cycle.group_id OR v_existing_request.member_id IS DISTINCT FROM p_member_id OR v_existing_request.cycle_id IS DISTINCT FROM p_cycle_id THEN RAISE EXCEPTION 'Request id is already bound to a different payment context'; END IF;

    IF v_existing_request.completed_at IS NOT NULL THEN
        RETURN jsonb_set(v_existing_request.result, '{idempotent_replay}', 'true'::jsonb, true);
    END IF;

    IF v_existing_request.payment_id IS NOT NULL THEN RAISE EXCEPTION 'Payment request is already partially completed'; END IF;

    SELECT c.* INTO v_payment FROM public.contributions c WHERE c.id = p_payment_id FOR UPDATE;
    IF FOUND THEN
        IF v_payment.group_id IS DISTINCT FROM v_cycle.group_id OR v_payment.member_id IS DISTINCT FROM p_member_id OR v_payment.amount IS DISTINCT FROM p_amount OR v_payment.contribution_date IS DISTINCT FROM p_contribution_date OR lower(coalesce(v_payment.contribution_type,'')) <> 'other' THEN
            RAISE EXCEPTION 'Payment id is already bound to a different contribution';
        END IF;
        RAISE EXCEPTION 'Payment id is already used by another request';
    END IF;

    v_payment_month := date_trunc('month', p_contribution_date)::date;
    v_month := to_char(v_payment_month, 'YYYY-MM');

    SELECT least(v_payment_month, min(o.economic_month)), greatest(v_payment_month, max(o.economic_month))
    INTO v_lock_start, v_lock_end
    FROM public.contribution_obligations o
    WHERE o.group_id = v_cycle.group_id AND o.member_id = p_member_id AND o.contribution_type_id = v_cycle.contribution_type_id
      AND o.component_kind = 'PARENT' AND o.parent_obligation_id IS NULL AND o.lifecycle_state = 'ACTIVE'
      AND (o.due_amount - COALESCE((SELECT SUM(a.amount) FROM public.contribution_allocations a WHERE a.obligation_id = o.id),0)) > 0;

    v_lock_start := coalesce(v_lock_start, v_payment_month);
    v_lock_end := coalesce(v_lock_end, v_payment_month);
    v_initial_lock_start := v_lock_start;
    v_initial_lock_end := v_lock_end;

    PERFORM public.cl_2b_accounting_lock_range(v_cycle.group_id, v_lock_start, v_lock_end);

    SELECT least(v_payment_month, min(o.economic_month)), greatest(v_payment_month, max(o.economic_month))
    INTO v_recheck_start, v_recheck_end
    FROM public.contribution_obligations o
    WHERE o.group_id = v_cycle.group_id AND o.member_id = p_member_id AND o.contribution_type_id = v_cycle.contribution_type_id
      AND o.component_kind = 'PARENT' AND o.parent_obligation_id IS NULL AND o.lifecycle_state = 'ACTIVE'
      AND (o.due_amount - COALESCE((SELECT SUM(a.amount) FROM public.contribution_allocations a WHERE a.obligation_id = o.id),0)) > 0;

    v_recheck_start := coalesce(v_recheck_start, v_payment_month);
    v_recheck_end := coalesce(v_recheck_end, v_payment_month);
    IF v_recheck_start < v_initial_lock_start THEN RAISE EXCEPTION 'Eligible Other obligation appeared before the locked accounting range'; END IF;
    IF v_recheck_end > v_initial_lock_end THEN
        PERFORM public.cl_2b_accounting_lock_range(v_cycle.group_id, v_initial_lock_end + interval '1 month', v_recheck_end);
        v_lock_end := v_recheck_end;
    END IF;

    SELECT m.* INTO v_member FROM public.members m WHERE m.id = p_member_id AND m.group_id = v_cycle.group_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Member does not belong to the cycle group'; END IF;
    IF lower(coalesce(v_member.status,'active')) <> 'active' OR lower(coalesce(v_member.onboarding_status,'active')) <> 'active' THEN RAISE EXCEPTION 'Member is not active'; END IF;

    SELECT fp.* INTO v_financial_period FROM public.ensure_financial_period(v_cycle.group_id, v_month) fp;
    IF v_financial_period.status <> 'open' THEN RAISE EXCEPTION 'Payment accounting month is closed'; END IF;

    v_remaining := p_amount;
    FOR v_obligation IN
        SELECT o.* FROM public.contribution_obligations o
        WHERE o.group_id = v_cycle.group_id AND o.member_id = p_member_id AND o.contribution_type_id = v_cycle.contribution_type_id
          AND o.component_kind = 'PARENT' AND o.parent_obligation_id IS NULL AND o.lifecycle_state = 'ACTIVE'
          AND (o.due_amount - COALESCE((SELECT SUM(a.amount) FROM public.contribution_allocations a WHERE a.obligation_id = o.id),0)) > 0
        ORDER BY o.economic_month ASC, o.obligation_month ASC, o.id ASC FOR UPDATE
    LOOP
        EXIT WHEN v_remaining <= 0;
        SELECT greatest(v_obligation.due_amount - COALESCE((SELECT SUM(a.amount) FROM public.contribution_allocations a WHERE a.obligation_id = v_obligation.id),0),0) INTO v_outstanding;
        IF v_outstanding <= 0 THEN CONTINUE; END IF;
        v_allocate := least(v_remaining, v_outstanding);
        SELECT fp.* INTO v_financial_period FROM public.ensure_financial_period(v_cycle.group_id, to_char(v_obligation.economic_month, 'YYYY-MM')) fp;
        IF v_financial_period.status <> 'open' THEN RAISE EXCEPTION 'An eligible Other obligation belongs to a closed accounting month'; END IF;
        v_remaining := v_remaining - v_allocate;
    END LOOP;

    INSERT INTO public.contributions (id, group_id, member_id, amount, contribution_type, month, payment_method, reference, recorded_by, contribution_date, notes, mpesa_reference, initiative_id)
    VALUES (p_payment_id, v_cycle.group_id, p_member_id, p_amount, 'other', v_month, p_payment_method, p_reference, v_uid, p_contribution_date, p_notes, p_mpesa_reference, NULL)
    RETURNING * INTO v_payment;

    v_remaining := p_amount; v_allocated := 0; v_allocation_count := 0;
    FOR v_obligation IN
        SELECT o.* FROM public.contribution_obligations o
        WHERE o.group_id = v_cycle.group_id AND o.member_id = p_member_id AND o.contribution_type_id = v_cycle.contribution_type_id
          AND o.component_kind = 'PARENT' AND o.parent_obligation_id IS NULL AND o.lifecycle_state = 'ACTIVE'
          AND (o.due_amount - COALESCE((SELECT SUM(a.amount) FROM public.contribution_allocations a WHERE a.obligation_id = o.id),0)) > 0
        ORDER BY o.economic_month ASC, o.obligation_month ASC, o.id ASC FOR UPDATE
    LOOP
        EXIT WHEN v_remaining <= 0;
        SELECT greatest(v_obligation.due_amount - COALESCE((SELECT SUM(a.amount) FROM public.contribution_allocations a WHERE a.obligation_id = v_obligation.id),0),0) INTO v_outstanding;
        IF v_outstanding <= 0 THEN CONTINUE; END IF;
        v_allocate := least(v_remaining, v_outstanding);
        INSERT INTO public.contribution_allocations (payment_id, obligation_id, amount) VALUES (p_payment_id, v_obligation.id, v_allocate);
        v_remaining := v_remaining - v_allocate;
        v_allocated := v_allocated + v_allocate;
        v_allocation_count := v_allocation_count + 1;
    END LOOP;

    v_result := jsonb_build_object('status','recorded','idempotent_replay',false,'payment_id',p_payment_id,'request_id',p_request_id,'group_id',v_cycle.group_id,'member_id',p_member_id,'cycle_id',p_cycle_id,'amount',p_amount,'allocated_amount',v_allocated,'unallocated_remainder',v_remaining,'allocation_count',v_allocation_count,'accounting_month',v_month);

    UPDATE private.other_contribution_payment_requests
    SET payment_id=p_payment_id, result=v_result, completed_at=clock_timestamp()
    WHERE request_id=p_request_id AND operation='record_other_contribution_payment';

    RETURN v_result;
END;
$function$
