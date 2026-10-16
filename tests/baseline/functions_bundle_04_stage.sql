-- STAGE ONLY: bundled function source definitions, production catalog captured 2026-10-14.
-- Alphabetical inventory order, not dependency order. Install after tables and before views/triggers.
-- This file is a source bundle, not an executable final migration by itself.

-- STAGE ONLY: production function definitions; ordinal rows 151-160 of 201.
-- Captured read-only on 2026-10-14. Alphabetical order is NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects require separate reconciliation.

CREATE OR REPLACE FUNCTION public.join_group_by_code(p_code text, p_name text, p_phone text DEFAULT NULL::text)
 RETURNS TABLE(group_id uuid, group_name text, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  invite_row public.group_invites%rowtype;
  existing_member public.members%rowtype;
  new_member_number text;
  clean_code text := upper(trim(coalesce(p_code,'')));
  clean_name text := trim(coalesce(p_name,''));
  caller_email text;
  assigned_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if clean_code = '' then raise exception 'Invite code is required'; end if;
  if clean_name = '' then raise exception 'Your name is required'; end if;

  select * into invite_row
  from public.group_invites
  where code = clean_code and active = true
    and expires_at > now() and use_count < max_uses
  for update;

  if not found then raise exception 'Invite code is invalid, expired, or full'; end if;

  if invite_row.email is not null then
    select email into caller_email from auth.users where id = auth.uid();
    if lower(coalesce(caller_email,'')) <> lower(invite_row.email) then
      raise exception 'This invite code was issued for a different email address';
    end if;
  end if;

  assigned_role := coalesce(nullif(invite_row.role, ''), 'member');

  select * into existing_member
  from public.members
  where user_id = auth.uid() and group_id = invite_row.group_id
  limit 1;

  if found then
    if existing_member.status <> 'active' then
      update public.members set status = 'active', name = clean_name, phone = coalesce(p_phone, phone), role = assigned_role
      where id = existing_member.id;
    end if;
  else
    new_member_number := 'MBR-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    insert into public.members(group_id, user_id, member_number, name, phone, role, status)
    values(invite_row.group_id, auth.uid(), new_member_number, clean_name, coalesce(p_phone,''), assigned_role, 'active');
  end if;

  update public.group_invites
  set use_count = use_count + 1,
      used_at = now(),
      active = case when use_count + 1 >= max_uses then false else active end
  where id = invite_row.id;

  return query
  select g.id, g.name, assigned_role
  from public.groups g where g.id = invite_row.group_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.link_my_member(p_phone text)
 RETURNS members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_member public.members;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated';
  end if;

  update public.members
  set user_id = (select auth.uid()),
      auth_user_id = (select auth.uid()),
      onboarding_status = 'active',
      status = 'active',
      activated_at = coalesce(activated_at, now())
  where phone = btrim(p_phone)
    and user_id is null
    and auth_user_id is null
  returning * into v_member;

  if v_member.id is null then
    select * into v_member
    from public.members
    where (user_id = (select auth.uid()) or auth_user_id = (select auth.uid()))
      and phone = btrim(p_phone)
    order by created_at
    limit 1;
  end if;

  if v_member.id is null then
    raise exception 'No member record found for that phone number. Ask your group administrator to add you first.';
  end if;

  return v_member;
end;
$function$


CREATE OR REPLACE FUNCTION public.list_pending_group_applications()
 RETURNS SETOF group_applications
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select a.*
  from public.group_applications a
  where public.is_platform_admin()
    and lower(coalesce(a.status,'pending')) in ('pending','under_review')
  order by a.created_at asc;
$function$


CREATE OR REPLACE FUNCTION public.log_deleted_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.audit_deleted_rows(table_name, deleted_row, deleted_by)
  values (TG_TABLE_NAME, to_jsonb(OLD), auth.uid());
  return OLD;
end;
$function$


CREATE OR REPLACE FUNCTION public.machine_renew_due_subscriptions(p_batch_size integer, p_idempotency_key text)
 RETURNS TABLE(run_id uuid, processed_count integer, renewed_count integer, not_due_count integer, already_renewed_count integer, anomalous_count integer, failed_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_run_id uuid;
    v_result record;
BEGIN
    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'Idempotency key is required' USING ERRCODE = '22023';
    END IF;
    IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 100 THEN
        RAISE EXCEPTION 'Batch size must be between 1 and 100' USING ERRCODE = '22023';
    END IF;
    SELECT rr.run_id INTO v_run_id
    FROM private.renewal_runs AS rr
    WHERE rr.idempotency_key = p_idempotency_key;
    IF NOT FOUND THEN
        INSERT INTO private.renewal_runs AS inserted_run (execution_source, idempotency_key)
        VALUES ('scheduler', p_idempotency_key)
        RETURNING inserted_run.run_id INTO v_run_id;
    ELSIF EXISTS (
        SELECT 1 FROM private.renewal_runs AS rr
        WHERE rr.run_id = v_run_id AND rr.status <> 'running'
    ) THEN
        RETURN QUERY SELECT v_run_id, 0, 0, 0, 0, 0, 0;
        RETURN;
    END IF;
    SELECT * INTO v_result
    FROM private.machine_renew_due_subscriptions(v_run_id, p_batch_size);
    UPDATE private.renewal_runs AS rr
    SET status = 'completed', completed_at = now(), error_code = NULL, error_message = NULL
    WHERE rr.run_id = v_run_id AND rr.status = 'running';
    RETURN QUERY SELECT v_result.run_id, v_result.processed_count, v_result.renewed_count,
        v_result.not_due_count, v_result.already_renewed_count, v_result.anomalous_count,
        v_result.failed_count;
EXCEPTION WHEN OTHERS THEN
    IF v_run_id IS NOT NULL THEN
        UPDATE private.renewal_runs AS rr
        SET status = 'failed', completed_at = now(), error_code = SQLSTATE, error_message = SQLERRM
        WHERE rr.run_id = v_run_id AND rr.status = 'running';
    END IF;
    RAISE;
END;
$function$


CREATE OR REPLACE FUNCTION public.my_group_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.group_id
  FROM public.members m
  WHERE (
    m.user_id = auth.uid()
    OR m.auth_user_id = auth.uid()
  )
  AND lower(coalesce(m.status, 'active')) = 'active'
  ORDER BY m.created_at
  LIMIT 1;
$function$


CREATE OR REPLACE FUNCTION public.my_member(target_group uuid)
 RETURNS members
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select * from members
  where group_id = target_group and user_id = auth.uid()
  limit 1;
$function$


CREATE OR REPLACE FUNCTION public.my_member_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select m.id from public.members m where (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and m.status='active' and m.onboarding_status='active' order by m.created_at limit 1
$function$


CREATE OR REPLACE FUNCTION public.my_role(target_group uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select role from members
  where group_id = target_group and user_id = auth.uid()
  limit 1;
$function$


CREATE OR REPLACE FUNCTION public.normalize_contribution_recorded_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member_id uuid;
begin
  -- contributions.recorded_by references members(id), while the frontend
  -- currently supplies auth.uid(). Convert the authenticated user to their
  -- member row automatically.
  if new.recorded_by is null then
    select id into v_member_id
    from public.members
    where user_id = auth.uid()
      and group_id = new.group_id
    limit 1;

    if v_member_id is not null then
      new.recorded_by := v_member_id;
    end if;

  elsif new.recorded_by = auth.uid() then
    select id into v_member_id
    from public.members
    where user_id = auth.uid()
      and group_id = new.group_id
    limit 1;

    if v_member_id is not null then
      new.recorded_by := v_member_id;
    end if;
  end if;

  return new;
end;
$function$


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


-- STAGE ONLY: production function definitions; ordinal rows 181-190 of 201.
-- Captured read-only on 2026-10-14. Alphabetical order is NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects require separate reconciliation.

CREATE OR REPLACE FUNCTION public.save_pending_onboarding(p_group_name text, p_category text DEFAULT 'other'::text, p_monthly_contribution numeric DEFAULT 0, p_opening_balance numeric DEFAULT 0, p_description text DEFAULT NULL::text, p_admin_name text DEFAULT NULL::text, p_admin_phone text DEFAULT NULL::text, p_country text DEFAULT 'Kenya'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$

declare
  v_uid uuid := auth.uid();
  v_id uuid;

  v_monthly numeric :=
    greatest(coalesce(p_monthly_contribution, 0), 0);

  v_opening numeric :=
    greatest(coalesce(p_opening_balance, 0), 0);

begin

  /* =====================================================
     AUTHENTICATION
  ===================================================== */

  if v_uid is null then
    raise exception 'Authentication required';
  end if;


  /* =====================================================
     VALIDATION
  ===================================================== */

  if nullif(
    btrim(coalesce(p_group_name, '')),
    ''
  ) is null then

    raise exception 'Group name is required';

  end if;


  /* =====================================================
     DO NOT ALLOW EXISTING GROUP MEMBER
  ===================================================== */

  if exists (
    select 1
    from public.members m
    where m.auth_user_id = v_uid
       or m.user_id = v_uid
  ) then

    raise exception
      'This account is already assigned to a group';

  end if;


  /* =====================================================
     CANCEL OLD PENDING RECORD
  ===================================================== */

  update public.pending_onboarding
  set
    status = 'cancelled'
  where auth_user_id = v_uid
    and status = 'pending';


  /* =====================================================
     SAVE NEW PENDING ONBOARDING
  ===================================================== */

  insert into public.pending_onboarding (
    auth_user_id,
    group_name,
    category,
    monthly_contribution,
    opening_balance,
    description,
    admin_name,
    admin_phone,
    country,
    status
  )
  values (
    v_uid,
    btrim(p_group_name),
    coalesce(
      nullif(btrim(p_category), ''),
      'other'
    ),
    v_monthly,
    v_opening,
    nullif(
      btrim(coalesce(p_description, '')),
      ''
    ),
    nullif(
      btrim(coalesce(p_admin_name, '')),
      ''
    ),
    nullif(
      btrim(coalesce(p_admin_phone, '')),
      ''
    ),
    coalesce(
      nullif(btrim(p_country), ''),
      'Kenya'
    ),
    'pending'
  )
  returning id into v_id;


  return jsonb_build_object(
    'success', true,
    'pending_id', v_id
  );

end;

$function$


CREATE OR REPLACE FUNCTION public.set_contribution_initiative_member_term(p_initiative_member_id uuid, p_effective_from date, p_amount numeric, p_status text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_im public.contribution_initiative_members; v_i public.contribution_initiatives; v_existing jsonb; v_first date; v_term public.contribution_initiative_member_terms; v_claimed boolean;
  v_request_initiative_id uuid; v_request_group_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request id is required'; END IF;
  IF p_amount<0 THEN RAISE EXCEPTION 'Amount cannot be negative'; END IF;
  IF p_status NOT IN ('active','inactive') THEN RAISE EXCEPTION 'Invalid term status'; END IF;
  SELECT * INTO v_im FROM public.contribution_initiative_members WHERE id=p_initiative_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Initiative participant not found'; END IF;
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=v_im.initiative_id FOR UPDATE;
  IF NOT FOUND OR v_i.frequency<>'monthly' THEN RAISE EXCEPTION 'Initiative is not recurring monthly'; END IF;
  IF NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'set_recurring_initiative_member_term','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT initiative_id,group_id,result INTO v_request_initiative_id,v_request_group_id,v_existing
    FROM private.contribution_initiative_requests
    WHERE request_id=p_request_id AND operation='set_recurring_initiative_member_term' FOR UPDATE;
    IF v_request_initiative_id IS DISTINCT FROM v_i.id OR v_request_group_id IS DISTINCT FROM v_i.group_id
       OR (v_existing->>'initiative_member_id')::uuid IS DISTINCT FROM p_initiative_member_id
    THEN RAISE EXCEPTION 'Request id is already bound to another participant'; END IF;
    RETURN v_existing||jsonb_build_object('idempotent',true);
  END IF;
  v_first:=date_trunc('month',v_i.start_date)::date;
  IF v_i.start_date>v_first THEN v_first:=(v_first+interval '1 month')::date; END IF;
  IF p_effective_from<v_first OR p_effective_from>v_i.closing_date THEN RAISE EXCEPTION 'Term effective date outside recurring period window'; END IF;
  IF p_effective_from<>date_trunc('month',p_effective_from)::date THEN RAISE EXCEPTION 'Recurring term effective date must be the first day of a calendar month'; END IF;
  IF v_i.status='active' AND EXISTS(SELECT 1 FROM public.contribution_initiative_periods p WHERE p.initiative_id=v_i.id AND p.period_key=to_char(p_effective_from,'YYYY-MM')) THEN RAISE EXCEPTION 'Participant term cannot change after that period has begun'; END IF;
  SELECT * INTO v_term FROM public.contribution_initiative_member_terms WHERE initiative_member_id=p_initiative_member_id AND effective_from=p_effective_from;
  IF FOUND THEN
    IF v_term.amount IS DISTINCT FROM p_amount OR v_term.status IS DISTINCT FROM p_status THEN RAISE EXCEPTION 'Conflicting term already exists for effective date'; END IF;
    v_existing=jsonb_build_object('status','idempotent','initiative_member_id',p_initiative_member_id,'effective_from',p_effective_from,'amount',v_term.amount);
  ELSE
    UPDATE public.contribution_initiative_member_terms SET effective_to=p_effective_from-1
    WHERE initiative_member_id=p_initiative_member_id AND effective_from<p_effective_from AND (effective_to IS NULL OR effective_to>=p_effective_from);
    INSERT INTO public.contribution_initiative_member_terms(initiative_member_id,effective_from,amount,status)
    VALUES(p_initiative_member_id,p_effective_from,p_amount,p_status) RETURNING * INTO v_term;
    v_existing=jsonb_build_object('status','recorded','initiative_member_id',p_initiative_member_id,'effective_from',p_effective_from,'amount',p_amount);
  END IF;
  UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_existing
  WHERE request_id=p_request_id AND operation='set_recurring_initiative_member_term';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_contribution_initiative_members(p_initiative_id uuid, p_members jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_i public.contribution_initiatives; v_existing jsonb; x jsonb; v_member uuid; v_amount numeric; v_group uuid; v_claimed boolean;
BEGIN
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'set_initiative_members','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN SELECT result INTO v_existing FROM private.contribution_initiative_requests WHERE request_id=p_request_id AND operation='set_initiative_members'; RETURN v_existing; END IF;
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_i.status <> 'draft' THEN RAISE EXCEPTION 'Participants can only be changed while draft'; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_members,'[]'::jsonb)) LOOP
    v_member=(x->>'member_id')::uuid; v_amount=(x->>'amount')::numeric;
    SELECT m.group_id INTO v_group FROM public.members m WHERE m.id=v_member;
    IF v_group IS DISTINCT FROM v_i.group_id OR v_amount IS NULL OR v_amount < 0 THEN RAISE EXCEPTION 'Invalid participant'; END IF;
  END LOOP;
  DELETE FROM public.contribution_initiative_members WHERE initiative_id=p_initiative_id;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_members,'[]'::jsonb)) LOOP
    INSERT INTO public.contribution_initiative_members(initiative_id,member_id,amount,effective_from,effective_to,status)
    VALUES(p_initiative_id,(x->>'member_id')::uuid,(x->>'amount')::numeric,v_i.start_date,v_i.closing_date,'active');
  END LOOP;
  v_existing=jsonb_build_object('status','participants_updated','initiative_id',p_initiative_id,'count',jsonb_array_length(coalesce(p_members,'[]'::jsonb)));
  UPDATE private.contribution_initiative_requests SET initiative_id=p_initiative_id,group_id=v_i.group_id,result=v_existing WHERE request_id=p_request_id AND operation='set_initiative_members';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_member_actual_position(p_member_id uuid, p_actual_position text, p_actual_position_name text DEFAULT NULL::text, p_effective_from date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_auth_uid uuid; v_actor_member_id uuid; v_group_id uuid; v_join_date date;
  v_current_position text; v_current_position_name text; v_latest_from date; v_latest_to date;
  v_effective_from date; v_position text; v_position_name text; v_history_count integer;
BEGIN
  v_auth_uid:=auth.uid(); IF v_auth_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  v_position:=lower(nullif(btrim(p_actual_position),''));
  v_position_name:=nullif(btrim(p_actual_position_name),'');
  IF v_position IS NULL OR v_position NOT IN ('chairperson','vice_chairperson','treasurer','secretary','vice_secretary','committee_member','member','other') THEN RAISE EXCEPTION 'ACTUAL_POSITION_INVALID' USING ERRCODE='22023'; END IF;
  IF v_position='other' AND v_position_name IS NULL THEN RAISE EXCEPTION 'ACTUAL_POSITION_NAME_REQUIRED' USING ERRCODE='22023'; END IF;
  IF v_position<>'other' THEN v_position_name:=NULL; END IF;
  SELECT m.group_id,m.join_date INTO v_group_id,v_join_date FROM public.members m WHERE m.id=p_member_id FOR UPDATE;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  SELECT m.id INTO v_actor_member_id FROM public.members m WHERE m.group_id=v_group_id AND (m.auth_user_id=v_auth_uid OR m.user_id=v_auth_uid)
    AND lower(coalesce(m.status,''))='active' AND lower(coalesce(m.onboarding_status,''))='active' ORDER BY m.id LIMIT 1;
  IF v_actor_member_id IS NULL OR NOT public.can_manage_members(v_group_id) THEN RAISE EXCEPTION 'MEMBER_MANAGEMENT_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT count(*)::integer INTO v_history_count FROM public.member_position_history h WHERE h.member_id=p_member_id;
  IF v_history_count=0 THEN
    v_effective_from:=coalesce(p_effective_from,v_join_date);
    IF v_effective_from<v_join_date THEN RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_BEFORE_JOIN_DATE' USING ERRCODE='22023'; END IF;
    INSERT INTO public.member_position_history(group_id,member_id,actual_position,actual_position_name,effective_from,effective_to,recorded_by)
    VALUES(v_group_id,p_member_id,v_position,v_position_name,v_effective_from,NULL,v_actor_member_id);
    UPDATE public.members SET actual_position=v_position,actual_position_name=v_position_name WHERE id=p_member_id;
    RETURN jsonb_build_object('success',true,'member_id',p_member_id,'actual_position',v_position,'actual_position_name',v_position_name,'effective_from',v_effective_from);
  END IF;
  IF p_effective_from IS NULL THEN RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_REQUIRED' USING ERRCODE='22023'; END IF;
  v_effective_from:=p_effective_from;
  IF v_effective_from<CURRENT_DATE THEN RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_RETROACTIVE' USING ERRCODE='22023'; END IF;
  SELECT h.effective_from,h.effective_to,h.actual_position,h.actual_position_name INTO v_latest_from,v_latest_to,v_current_position,v_current_position_name
  FROM public.member_position_history h WHERE h.member_id=p_member_id ORDER BY h.effective_from DESC LIMIT 1;
  IF v_latest_to IS NOT NULL THEN RAISE EXCEPTION 'CURRENT_POSITION_HISTORY_NOT_OPEN' USING ERRCODE='23514'; END IF;
  IF v_effective_from<=v_latest_from THEN RAISE EXCEPTION 'ACTUAL_POSITION_EFFECTIVE_DATE_NOT_AFTER_LATEST' USING ERRCODE='22023'; END IF;
  UPDATE public.member_position_history SET effective_to=v_effective_from WHERE member_id=p_member_id AND effective_to IS NULL;
  INSERT INTO public.member_position_history(group_id,member_id,actual_position,actual_position_name,effective_from,effective_to,recorded_by)
  VALUES(v_group_id,p_member_id,v_position,v_position_name,v_effective_from,NULL,v_actor_member_id);
  UPDATE public.members SET actual_position=v_position,actual_position_name=v_position_name WHERE id=p_member_id;
  RETURN jsonb_build_object('success',true,'member_id',p_member_id,'actual_position',v_position,'actual_position_name',v_position_name,'effective_from',v_effective_from);
END;
$function$


CREATE OR REPLACE FUNCTION public.set_recorded_by_from_auth()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_member_id uuid;
BEGIN
  /*
   * recorded_by stores members.id, not auth.users.id.
   * Always resolve the authenticated user to the active member
   * in the row's group before validation runs. This is important
   * because BEFORE triggers execute in trigger-name order and the
   * validation trigger can otherwise see auth.uid() and reject it.
   */
  SELECT m.id
    INTO v_member_id
  FROM public.members m
  WHERE m.group_id = NEW.group_id
    AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
    AND lower(coalesce(m.status, '')) IN ('active', 'approved')
    AND lower(coalesce(m.onboarding_status, '')) = 'active'
  ORDER BY m.created_at
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'No active member record is linked to this account';
  END IF;

  NEW.recorded_by := v_member_id;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.submit_expense_approval(p_expense_id uuid, p_decision text DEFAULT 'approved'::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_expense public.expenses%ROWTYPE;
  v_approver public.members%ROWTYPE;
  v_member_count integer;
  v_slot text;
  v_position text;
  v_position_name text;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_approvals integer;
  v_status text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication is required to approve an expense'; END IF;
  IF v_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Decision must be approved or rejected'; END IF;
  SELECT e.* INTO v_expense FROM public.expenses e WHERE e.id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF v_expense.approval_status <> 'pending' THEN RAISE EXCEPTION 'Only pending expenses can receive approvals'; END IF;
  IF v_expense.recorded_by IS NULL THEN RAISE EXCEPTION 'Expense recorder is missing; approval is blocked'; END IF;
  IF v_expense.recorded_by = v_user_id OR EXISTS (
    SELECT 1 FROM public.members recorder WHERE recorder.id = v_expense.recorded_by
      AND (recorder.user_id = v_user_id OR recorder.auth_user_id = v_user_id)
  ) THEN RAISE EXCEPTION 'The expense recorder cannot approve or reject their own expense'; END IF;
  SELECT count(*) INTO v_member_count FROM public.members m
  WHERE m.group_id = v_expense.group_id AND (m.user_id = v_user_id OR m.auth_user_id = v_user_id)
    AND lower(coalesce(m.status, '')) = 'active' AND lower(coalesce(m.onboarding_status, '')) = 'active';
  IF v_member_count <> 1 THEN RAISE EXCEPTION 'Exactly one active member record in this group is required to approve expenses'; END IF;
  SELECT m.* INTO v_approver FROM public.members m
  WHERE m.group_id = v_expense.group_id AND (m.user_id = v_user_id OR m.auth_user_id = v_user_id)
    AND lower(coalesce(m.status, '')) = 'active' AND lower(coalesce(m.onboarding_status, '')) = 'active';
  v_position := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.actual_position, '')), '_', ' '), '-', ' '), '[[:space:]]+', ' ', 'g'));
  v_position_name := lower(regexp_replace(replace(replace(btrim(coalesce(v_approver.actual_position_name, '')), '_', ' '), '-', ' '), '[[:space:]]+', ' ', 'g'));
  IF v_position IN ('chairperson', 'vice chairperson', 'chair', 'vice chair') OR v_position_name IN ('chairperson', 'vice chairperson', 'chair', 'vice chair') THEN
    v_slot := 'chair';
  ELSIF v_position = 'treasurer' OR v_position_name = 'treasurer' THEN
    v_slot := 'treasurer';
  ELSIF v_position IN ('secretary', 'vice secretary') OR v_position_name IN ('secretary', 'vice secretary') THEN
    v_slot := 'secretary';
  ELSE RAISE EXCEPTION 'Your declared group office is not eligible to approve expenses'; END IF;
  IF EXISTS (SELECT 1 FROM public.expense_approvals ea WHERE ea.expense_id = v_expense.id AND ea.approver_user_id = v_user_id) THEN
    RAISE EXCEPTION 'You have already submitted a decision for this expense';
  END IF;
  IF EXISTS (SELECT 1 FROM public.expense_approvals ea WHERE ea.expense_id = v_expense.id AND ea.approval_slot = v_slot) THEN
    RAISE EXCEPTION 'Another person has already filled your office approval slot';
  END IF;
  INSERT INTO public.expense_approvals (expense_id, group_id, approver_user_id, approval_slot, decision, note)
  VALUES (v_expense.id, v_expense.group_id, v_user_id, v_slot, v_decision, nullif(btrim(coalesce(p_note, '')), ''));
  IF v_decision = 'rejected' THEN v_status := 'rejected';
  ELSE
    SELECT count(*) INTO v_approvals FROM public.expense_approvals ea WHERE ea.expense_id = v_expense.id AND ea.decision = 'approved';
    v_status := CASE WHEN v_approvals = 3 THEN 'approved' ELSE 'pending' END;
  END IF;
  UPDATE public.expenses SET approval_status = v_status WHERE id = v_expense.id;
  SELECT count(*) INTO v_approvals FROM public.expense_approvals ea WHERE ea.expense_id = v_expense.id AND ea.decision = 'approved';
  RETURN jsonb_build_object('expense_id', v_expense.id, 'approval_status', v_status, 'approved_slots', v_approvals, 'required_slots', 3, 'recorded_by', v_expense.recorded_by);
END;
$function$


CREATE OR REPLACE FUNCTION public.submit_group_application(p_group_name text, p_category text, p_description text, p_admin_name text, p_admin_phone text, p_country text, p_location text, p_town text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_application_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF nullif(btrim(coalesce(p_group_name,'')),'') IS NULL THEN RAISE EXCEPTION 'Group name is required'; END IF;
  IF nullif(btrim(coalesce(p_admin_name,'')),'') IS NULL THEN RAISE EXCEPTION 'Administrator name is required'; END IF;
  IF nullif(btrim(coalesce(p_admin_phone,'')),'') IS NULL THEN RAISE EXCEPTION 'Administrator phone is required'; END IF;
  IF nullif(btrim(coalesce(p_location,'')),'') IS NULL THEN RAISE EXCEPTION 'Group location is required'; END IF;
  IF nullif(btrim(coalesce(p_town,'')),'') IS NULL THEN RAISE EXCEPTION 'Town is required'; END IF;

  SELECT u.email INTO v_email FROM auth.users AS u WHERE u.id = v_uid;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Authenticated email could not be found'; END IF;

  IF EXISTS (SELECT 1 FROM public.members m WHERE m.auth_user_id=v_uid OR m.user_id=v_uid)
  THEN RAISE EXCEPTION 'This account is already assigned to a group'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.group_applications ga
    WHERE ga.auth_user_id=v_uid AND ga.status IN ('pending','under_review','approved')
  ) THEN
    RAISE EXCEPTION 'A group account application already exists for this account';
  END IF;

  INSERT INTO public.group_applications(
    auth_user_id,admin_name,admin_phone,email,group_name,category,
    description,country,location,town,status
  ) VALUES (
    v_uid,btrim(p_admin_name),btrim(p_admin_phone),v_email,btrim(p_group_name),
    nullif(btrim(coalesce(p_category,'')),''),
    nullif(btrim(coalesce(p_description,'')),''),
    coalesce(nullif(btrim(p_country),''),'Kenya'),
    btrim(p_location),btrim(p_town),'pending'
  ) RETURNING id INTO v_application_id;

  PERFORM private.append_platform_activity(
    'group_application_submitted',
    jsonb_build_object(
      'application_id',v_application_id,
      'group_name',btrim(p_group_name),
      'location',btrim(p_location),
      'town',btrim(p_town)
    )
  );

  RETURN jsonb_build_object(
    'success',true,'application_id',v_application_id,'status','pending'
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.submit_group_application(p_group_name text, p_category text, p_monthly_contribution numeric DEFAULT 0, p_opening_balance numeric DEFAULT 0, p_description text DEFAULT NULL::text, p_admin_name text DEFAULT NULL::text, p_admin_phone text DEFAULT NULL::text, p_country text DEFAULT 'Kenya'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_application_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(coalesce(p_group_name,'')),'') is null then raise exception 'Group name is required'; end if;
  if nullif(btrim(coalesce(p_admin_name,'')),'') is null then raise exception 'Administrator name is required'; end if;
  if nullif(btrim(coalesce(p_admin_phone,'')),'') is null then raise exception 'Administrator phone is required'; end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email is null then raise exception 'Authenticated email could not be found'; end if;

  if exists (select 1 from public.members m where m.auth_user_id = v_uid or m.user_id = v_uid) then
    raise exception 'This account is already assigned to a group';
  end if;

  select id into v_application_id
  from public.group_applications
  where auth_user_id = v_uid and status in ('pending','under_review','approved')
  order by created_at desc limit 1;

  if v_application_id is not null then
    raise exception 'A group account application already exists for this account';
  end if;

  insert into public.group_applications (
    auth_user_id, admin_name, admin_phone, email, group_name, category,
    monthly_contribution, opening_balance, description, country, status
  ) values (
    v_uid, btrim(p_admin_name), btrim(p_admin_phone), v_email,
    btrim(p_group_name), nullif(btrim(coalesce(p_category,'')),''),
    greatest(coalesce(p_monthly_contribution,0),0),
    greatest(coalesce(p_opening_balance,0),0),
    nullif(btrim(coalesce(p_description,'')),''),
    coalesce(nullif(btrim(p_country),''),'Kenya'), 'pending'
  ) returning id into v_application_id;

  return jsonb_build_object(
    'success', true,
    'application_id', v_application_id,
    'status', 'pending'
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.sync_membership_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if nullif(trim(new.member_number), '') is null and nullif(trim(new.membership_number), '') is not null then
    new.member_number := trim(new.membership_number);
  elsif nullif(trim(new.membership_number), '') is null and nullif(trim(new.member_number), '') is not null then
    new.membership_number := trim(new.member_number);
  end if;
  return new;
end;
$function$


-- STAGE ONLY: production function definitions; ordinal rows 191-200 of 201.
-- Captured read-only on 2026-10-14. Alphabetical order is NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects require separate reconciliation.

CREATE OR REPLACE FUNCTION public.update_group_contribution_cycle_settings(p_group_id uuid, p_monthly_closing_day smallint, p_monthly_grace_days smallint DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner_user_id uuid;
  v_role text;
  v_opening_date date;
  v_closing_date date;
  v_grace smallint;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_monthly_closing_day < 1 or p_monthly_closing_day > 28 then raise exception 'MONTHLY_CLOSING_DAY_MUST_BE_1_TO_28'; end if;
  if p_monthly_grace_days is null or p_monthly_grace_days < 0 or p_monthly_grace_days > 27 then raise exception 'MONTHLY_GRACE_DAYS_MUST_BE_0_TO_27'; end if;

  select owner_user_id into v_owner_user_id from public.groups where id=p_group_id;
  if v_owner_user_id is null then raise exception 'GROUP_NOT_FOUND'; end if;

  v_role := public.current_user_role(p_group_id);
  if auth.uid() <> v_owner_user_id and coalesce(v_role,'') not in ('admin','chairperson') then
    raise exception 'CONTRIBUTION_SETTINGS_NOT_AUTHORIZED';
  end if;

  perform public.update_group_contribution_settings(p_group_id,p_monthly_closing_day);

  update public.group_contribution_settings
     set monthly_grace_days=p_monthly_grace_days, updated_by=auth.uid(), updated_at=now()
   where group_id=p_group_id;

  select current_opening_date,current_closing_date into v_opening_date,v_closing_date
  from public.get_group_contribution_settings(p_group_id);

  return jsonb_build_object(
    'group_id',p_group_id,
    'monthly_closing_day',p_monthly_closing_day,
    'monthly_grace_days',p_monthly_grace_days,
    'current_opening_date',v_opening_date,
    'current_closing_date',v_closing_date
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.update_group_contribution_settings(p_group_id uuid, p_monthly_closing_day smallint)
 RETURNS group_contribution_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_row public.group_contribution_settings; v_close date; v_open date;
BEGIN
  IF NOT public.can_manage_members(p_group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_monthly_closing_day NOT BETWEEN 1 AND 28 THEN RAISE EXCEPTION 'Closing day must be between 1 and 28'; END IF;
  INSERT INTO public.group_contribution_settings(group_id,monthly_closing_day,updated_by)
  VALUES(p_group_id,p_monthly_closing_day,auth.uid())
  ON CONFLICT(group_id) DO UPDATE SET monthly_closing_day=excluded.monthly_closing_day,updated_at=now(),updated_by=auth.uid()
  RETURNING * INTO v_row;

  v_close := CASE WHEN current_date <= make_date(extract(year from current_date)::int,extract(month from current_date)::int,p_monthly_closing_day)
    THEN make_date(extract(year from current_date)::int,extract(month from current_date)::int,p_monthly_closing_day)
    ELSE make_date(extract(year from current_date + interval '1 month')::int,extract(month from current_date + interval '1 month')::int,p_monthly_closing_day) END;
  v_open := (v_close - interval '1 month' + interval '1 day')::date;

  INSERT INTO public.group_contribution_calendar_periods(group_id,opening_date,closing_date,closing_day,status)
  VALUES(p_group_id,v_open,v_close,p_monthly_closing_day,'open')
  ON CONFLICT(group_id,opening_date) DO NOTHING;

  RETURN v_row;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_group_module_settings(p_group_id uuid, p_merry_go_round_enabled boolean, p_loans_enabled boolean)
 RETURNS TABLE(group_id uuid, merry_go_round_enabled boolean, loans_enabled boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor_member_id uuid;
  v_old_merry boolean;
  v_old_loans boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not public.cl_user_has_role(p_group_id, array['admin']::text[]) then
    raise exception 'Only a group Admin can change optional module settings' using errcode = '42501';
  end if;

  select m.id into v_actor_member_id
  from public.members m
  where m.group_id = p_group_id
    and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
    and lower(coalesce(m.status, 'active')) = 'active'
    and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  order by m.created_at
  limit 1;

  select g.merry_go_round_enabled, g.loans_enabled
    into v_old_merry, v_old_loans
  from public.groups g
  where g.id = p_group_id
  for update;

  if not found then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;

  update public.groups g
  set merry_go_round_enabled = coalesce(p_merry_go_round_enabled, false),
      loans_enabled = coalesce(p_loans_enabled, false)
  where g.id = p_group_id;

  insert into public.group_audit_log (
    group_id, actor_user_id, actor_member_id, action, entity_type, entity_id, details
  ) values (
    p_group_id, auth.uid(), v_actor_member_id, 'update_module_settings',
    'group_module_settings', p_group_id::text,
    jsonb_build_object(
      'before', jsonb_build_object(
        'merry_go_round_enabled', v_old_merry,
        'loans_enabled', v_old_loans
      ),
      'after', jsonb_build_object(
        'merry_go_round_enabled', coalesce(p_merry_go_round_enabled, false),
        'loans_enabled', coalesce(p_loans_enabled, false)
      )
    )
  );

  return query
  select g.id, g.merry_go_round_enabled, g.loans_enabled
  from public.groups g where g.id = p_group_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.update_group_monthly_contribution_settings(p_group_id uuid, p_monthly_closing_day integer, p_monthly_grace_days integer DEFAULT 0, p_fine_applies boolean DEFAULT false, p_fine_amount numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid(); v_owner_user_id uuid; v_role text; v_monthly_type_id uuid;
 v_existing_rule_id uuid; v_existing_fixed_amount numeric; v_existing_grace integer;
 v_effective_from timestamptz; v_new_rule_id uuid; v_fine_amount numeric:=coalesce(p_fine_amount,0);
 v_rule_count integer; v_opening_date date; v_closing_date date;
begin
 if v_actor is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 if p_group_id is null then raise exception 'GROUP_NOT_FOUND'; end if;
 if p_monthly_closing_day is null or p_monthly_closing_day<1 or p_monthly_closing_day>28 then raise exception 'MONTHLY_CLOSING_DAY_MUST_BE_1_TO_28'; end if;
 if p_monthly_grace_days is null or p_monthly_grace_days<0 or p_monthly_grace_days>27 then raise exception 'MONTHLY_GRACE_DAYS_MUST_BE_0_TO_27'; end if;
 if p_fine_applies and v_fine_amount<=0 then raise exception 'FINE_AMOUNT_REQUIRED'; end if;
 select g.owner_user_id into v_owner_user_id from public.groups g where g.id=p_group_id;
 if not found then raise exception 'GROUP_NOT_FOUND'; end if;
 v_role:=public.current_user_role(p_group_id);
 if v_actor<>v_owner_user_id and coalesce(v_role,'') not in ('admin','chairperson') then raise exception 'MONTHLY_SETTINGS_NOT_AUTHORIZED'; end if;
 perform private.cl_fine_config_lock(p_group_id);
 select ct.id into v_monthly_type_id from public.contribution_types ct where ct.group_id=p_group_id and lower(coalesce(ct.code,''))='monthly' order by ct.id limit 1;
 if v_monthly_type_id is null then raise exception 'MONTHLY_CONTRIBUTION_TYPE_NOT_FOUND'; end if;
 select count(*) into v_rule_count from public.fine_rules r join public.fine_rule_contribution_types rt on rt.rule_id=r.id and rt.contribution_type_id=v_monthly_type_id
 where r.group_id=p_group_id and r.trigger_type='missed_contribution' and r.applicability_mode='SELECTED' and r.status='active' and r.effective_from<=now() and (r.effective_until is null or r.effective_until>=now());
 if v_rule_count>1 then raise exception 'MONTHLY_FINE_RULE_CONFLICT'; end if;
 if v_rule_count=1 then
  select r.id,r.fixed_amount,r.grace_period_value into v_existing_rule_id,v_existing_fixed_amount,v_existing_grace
  from public.fine_rules r join public.fine_rule_contribution_types rt on rt.rule_id=r.id and rt.contribution_type_id=v_monthly_type_id
  where r.group_id=p_group_id and r.trigger_type='missed_contribution' and r.applicability_mode='SELECTED' and r.status='active' and r.effective_from<=now() and (r.effective_until is null or r.effective_until>=now()) for update;
 end if;
 if not p_fine_applies then
  if v_existing_rule_id is not null then
   update public.fine_rules set effective_until=now()-interval '1 microsecond',status='inactive',updated_at=now(),updated_by=v_actor where id=v_existing_rule_id;
  end if;
  perform public.update_group_contribution_settings(p_group_id,p_monthly_closing_day::smallint);
  update public.group_contribution_settings set monthly_grace_days=p_monthly_grace_days,updated_by=v_actor,updated_at=now() where group_id=p_group_id;
 else
  if v_existing_rule_id is null then
   v_effective_from:=clock_timestamp();
   insert into public.fine_rules(group_id,name,description,trigger_type,specificity_level,priority,calculation_method,fixed_amount,percentage_rate,minimum_amount,maximum_amount,grace_period_value,grace_period_unit,applicability_mode,effective_from,effective_until,status,created_by,updated_by)
   values(p_group_id,'Monthly Contribution Fine','Monthly contribution late-payment fine managed by Monthly contribution settings.','missed_contribution',3,100,'FIXED',round(v_fine_amount,2),null,null,null,p_monthly_grace_days,'DAY','SELECTED',v_effective_from,null,'active',v_actor,v_actor) returning id into v_new_rule_id;
   insert into public.fine_rule_contribution_types(rule_id,contribution_type_id) values(v_new_rule_id,v_monthly_type_id);
  elsif round(coalesce(v_existing_fixed_amount,0),2)<>round(v_fine_amount,2) or coalesce(v_existing_grace,-1)<>p_monthly_grace_days then
   v_effective_from:=clock_timestamp();
   update public.fine_rules set effective_until=v_effective_from-interval '1 microsecond',status='inactive',updated_at=now(),updated_by=v_actor where id=v_existing_rule_id;
   insert into public.fine_rules(group_id,name,description,trigger_type,specificity_level,priority,calculation_method,fixed_amount,percentage_rate,minimum_amount,maximum_amount,grace_period_value,grace_period_unit,applicability_mode,effective_from,effective_until,status,created_by,updated_by)
   values(p_group_id,'Monthly Contribution Fine','Monthly contribution late-payment fine managed by Monthly contribution settings.','missed_contribution',3,100,'FIXED',round(v_fine_amount,2),null,null,null,p_monthly_grace_days,'DAY','SELECTED',v_effective_from,null,'active',v_actor,v_actor) returning id into v_new_rule_id;
   insert into public.fine_rule_contribution_types(rule_id,contribution_type_id) values(v_new_rule_id,v_monthly_type_id);
  else v_new_rule_id:=v_existing_rule_id;
  end if;
  perform public.update_group_contribution_settings(p_group_id,p_monthly_closing_day::smallint);
  update public.group_contribution_settings set monthly_grace_days=p_monthly_grace_days,updated_by=v_actor,updated_at=now() where group_id=p_group_id;
 end if;
 select s.current_opening_date,s.current_closing_date into v_opening_date,v_closing_date from public.get_group_contribution_settings(p_group_id) s;
 return jsonb_build_object('ok',true,'group_id',p_group_id,'contribution_type_id',v_monthly_type_id,'monthly_closing_day',p_monthly_closing_day,'monthly_grace_days',p_monthly_grace_days,'fine_applies',p_fine_applies,'fine_amount',case when p_fine_applies then round(v_fine_amount,2) else 0 end,'fine_rule_id',case when p_fine_applies then coalesce(v_new_rule_id,v_existing_rule_id) else null end,'fine_rule_status',case when p_fine_applies then 'active' else 'inactive' end,'current_opening_date',v_opening_date,'current_closing_date',v_closing_date);
end;
$function$


CREATE OR REPLACE FUNCTION public.validate_initiative_payment_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_payment_initiative uuid;
  v_obligation_initiative uuid;
  v_payment_amount numeric;
  v_allocated numeric;
  v_obligation_amount numeric;
  v_obligation_allocated numeric;
BEGIN
  SELECT c.initiative_id, c.amount
    INTO v_payment_initiative, v_payment_amount
  FROM public.contributions c
  WHERE c.id = NEW.payment_id;

  IF v_payment_initiative IS NULL THEN
    RAISE EXCEPTION 'Initiative allocation requires an initiative payment';
  END IF;

  SELECT o.initiative_id, o.amount_due
    INTO v_obligation_initiative, v_obligation_amount
  FROM public.contribution_initiative_obligations o
  WHERE o.id = NEW.initiative_obligation_id;

  IF v_obligation_initiative IS NULL OR v_obligation_initiative <> v_payment_initiative THEN
    RAISE EXCEPTION 'Payment and obligation belong to different initiatives';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contribution_initiative_payment_reversals r
    WHERE r.payment_id = NEW.payment_id
  ) THEN
    RAISE EXCEPTION 'Reversed payment cannot receive an allocation';
  END IF;

  SELECT coalesce(sum(a.amount),0) INTO v_allocated
  FROM public.contribution_initiative_allocations a
  WHERE a.payment_id = NEW.payment_id AND a.id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  SELECT coalesce(sum(a.amount),0) INTO v_obligation_allocated
  FROM public.contribution_initiative_allocations a
  WHERE a.initiative_obligation_id = NEW.initiative_obligation_id AND a.id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF NEW.amount + v_allocated > v_payment_amount THEN
    RAISE EXCEPTION 'Initiative allocation exceeds payment amount';
  END IF;

  IF NEW.amount + v_obligation_allocated > v_obligation_amount THEN
    RAISE EXCEPTION 'Initiative allocation exceeds obligation amount';
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.validate_monthly_allocation_domain()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_initiative uuid;
BEGIN
  SELECT c.initiative_id INTO v_initiative FROM public.contributions c WHERE c.id=NEW.payment_id;
  IF v_initiative IS NOT NULL THEN
    RAISE EXCEPTION 'Monthly allocation cannot reference an initiative payment';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.validate_monthly_payment_domain()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.initiative_id IS NOT NULL AND lower(trim(NEW.contribution_type)) = 'monthly' THEN
    RAISE EXCEPTION 'Monthly contribution cannot reference an initiative';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.validate_recorded_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if new.recorded_by is null then raise exception 'No active member record is linked to this account'; end if;
 if not exists(select 1 from public.members m where m.id=new.recorded_by and (m.user_id=auth.uid() or m.auth_user_id=auth.uid()) and m.status='active' and m.onboarding_status='active') then raise exception 'Invalid recorded_by member'; end if;
 return new;
end; $function$


CREATE OR REPLACE FUNCTION public.verify_group_access_code(p_access_code text)
 RETURNS TABLE(group_id uuid, role text, member_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select m.group_id, m.role, m.id
  from public.members m
  join public.groups g on g.id = m.group_id
  where m.user_id = auth.uid()
    and upper(trim(g.access_code)) = upper(trim(p_access_code))
    and m.status = 'active'
  limit 1;
$function$


CREATE OR REPLACE FUNCTION public.verify_group_invite(p_email text, p_access_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_invite public.group_invites%rowtype;
begin
  select * into v_invite
  from public.group_invites
  where lower(email)=lower(trim(p_email))
    and (code_hash = encode(extensions.digest(upper(trim(p_access_code)), 'sha256'), 'hex') or code = upper(trim(p_access_code)))
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Invalid email or one-time access code.');
  end if;
  if not v_invite.active or v_invite.use_count >= v_invite.max_uses then
    return jsonb_build_object('success', false, 'message', 'This access code has already been used.');
  end if;
  if v_invite.expires_at < now() then
    return jsonb_build_object('success', false, 'message', 'This access code has expired.');
  end if;

  update public.group_invites
  set last_sent_at = now(), updated_at = now(), attempts = coalesce(attempts,0) + 1
  where id = v_invite.id;

  return jsonb_build_object('success', true, 'invite_id', v_invite.id, 'group_id', v_invite.group_id, 'email', lower(v_invite.email), 'role', v_invite.role);
end;
$function$


-- STAGE ONLY: final production function definition, row 201 of 201.
-- Captured read-only on 2026-10-14; alphabetical inventory ordering, not dependency ordering.

CREATE OR REPLACE FUNCTION public.verify_member_payment_evidence(p_evidence_id uuid, p_decision text, p_rejection_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_evidence public.member_payment_evidence%rowtype;
    v_verifier public.members%rowtype;
    v_contribution jsonb;
    v_reason text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_evidence_id IS NULL THEN
        RAISE EXCEPTION 'Evidence id is required';
    END IF;

    IF p_decision NOT IN ('verified', 'rejected') THEN
        RAISE EXCEPTION 'Decision must be verified or rejected';
    END IF;

    v_reason := nullif(btrim(p_rejection_reason), '');

    IF p_decision = 'rejected' AND v_reason IS NULL THEN
        RAISE EXCEPTION 'Rejection reason is required';
    END IF;

    IF p_decision = 'verified' AND v_reason IS NOT NULL THEN
        RAISE EXCEPTION 'Rejection reason is only valid for rejected evidence';
    END IF;

    SELECT e.*
    INTO v_evidence
    FROM public.member_payment_evidence e
    WHERE e.id = p_evidence_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment evidence % not found', p_evidence_id;
    END IF;

    IF v_evidence.status <> 'pending' THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent_replay', true,
            'evidence_id', v_evidence.id,
            'status', v_evidence.status,
            'contribution_id', v_evidence.contribution_id,
            'verified_by', v_evidence.verified_by,
            'verified_at', v_evidence.verified_at,
            'rejection_reason', v_evidence.rejection_reason
        );
    END IF;

    SELECT m.*
    INTO v_verifier
    FROM public.members m
    WHERE m.group_id = v_evidence.group_id
      AND m.status = 'active'
      AND m.onboarding_status = 'active'
      AND (
          m.user_id = auth.uid()
          OR m.auth_user_id = auth.uid()
      )
    ORDER BY
        CASE
            WHEN m.auth_user_id = auth.uid() THEN 0
            ELSE 1
        END,
        m.id
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active group verifier identity required';
    END IF;

    IF NOT public.cl_user_has_role(
        v_evidence.group_id,
        ARRAY['admin','chairperson','secretary','treasurer']::text[]
    ) THEN
        RAISE EXCEPTION 'Payment verification authorization required';
    END IF;

    IF v_evidence.group_id IS NULL
       OR v_evidence.member_id IS NULL
       OR v_evidence.amount IS NULL
       OR v_evidence.amount <= 0
       OR v_evidence.payment_date IS NULL
       OR v_evidence.evidence_text IS NULL
       OR btrim(v_evidence.evidence_text) = ''
    THEN
        RAISE EXCEPTION 'Payment evidence integrity check failed';
    END IF;

    IF v_evidence.payment_method = 'M-Pesa'
       AND (
           v_evidence.mpesa_reference IS NULL
           OR btrim(v_evidence.mpesa_reference) = ''
       )
    THEN
        RAISE EXCEPTION 'M-Pesa reference is required';
    END IF;

    IF p_decision = 'rejected' THEN
        UPDATE public.member_payment_evidence
        SET status = 'rejected',
            verified_by = v_verifier.id,
            verified_at = now(),
            rejection_reason = v_reason,
            updated_at = now()
        WHERE id = v_evidence.id;

        RETURN jsonb_build_object(
            'success', true,
            'idempotent_replay', false,
            'evidence_id', v_evidence.id,
            'status', 'rejected',
            'contribution_id', NULL,
            'verified_by', v_verifier.id,
            'verified_at', now(),
            'rejection_reason', v_reason
        );
    END IF;

    v_contribution := public.cl_2b_record_contribution(
        v_evidence.id,
        v_evidence.group_id,
        v_evidence.member_id,
        v_evidence.amount,
        v_evidence.payment_date,
        'monthly',
        v_evidence.payment_method,
        v_evidence.mpesa_reference,
        v_evidence.mpesa_reference,
        NULL,
        v_evidence.evidence_text
    );

    UPDATE public.member_payment_evidence
    SET status = 'verified',
        contribution_id = v_evidence.id,
        verified_by = v_verifier.id,
        verified_at = now(),
        rejection_reason = NULL,
        updated_at = now()
    WHERE id = v_evidence.id;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', false,
        'evidence_id', v_evidence.id,
        'status', 'verified',
        'contribution_id', v_evidence.id,
        'verified_by', v_verifier.id,
        'verified_at', now(),
        'contribution', v_contribution
    );
END;
$function$


