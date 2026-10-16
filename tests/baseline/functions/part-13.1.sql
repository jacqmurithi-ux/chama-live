-- STAGE ONLY: production function definitions; ordinal rows 121-130 of 201.
-- Captured read-only on 2026-10-14. Alphabetical order is NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects require separate reconciliation.

CREATE OR REPLACE FUNCTION public.get_contribution_initiative_member_status(p_initiative_id uuid, p_member_id uuid, p_period_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives;
  v_p public.contribution_initiative_periods;
  v_o public.contribution_initiative_obligations;
  v_allocated numeric := 0;
  v_credit numeric := 0;
BEGIN
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id;
  IF NOT FOUND OR NOT public.cl_user_in_group(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_p FROM public.contribution_initiative_periods
  WHERE initiative_id=p_initiative_id AND period_key=p_period_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('initiative_id',p_initiative_id,'member_id',p_member_id,'period_key',p_period_key,'exists',false);
  END IF;

  SELECT * INTO v_o FROM public.contribution_initiative_obligations
  WHERE initiative_period_id=v_p.id AND member_id=p_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('initiative_id',p_initiative_id,'member_id',p_member_id,'period_key',p_period_key,'obligation_exists',false);
  END IF;

  SELECT coalesce(sum(a.amount),0) INTO v_allocated
  FROM public.contribution_initiative_allocations a
  WHERE a.initiative_obligation_id=v_o.id
    AND NOT EXISTS (SELECT 1 FROM public.contribution_initiative_payment_reversals r WHERE r.payment_id=a.payment_id);

  SELECT coalesce(sum(c.remaining_amount),0) INTO v_credit
  FROM public.contribution_initiative_credits c
  WHERE c.initiative_id=p_initiative_id AND c.member_id=p_member_id;

  RETURN jsonb_build_object(
    'initiative_id',p_initiative_id,
    'member_id',p_member_id,
    'period_id',v_p.id,
    'period_key',v_p.period_key,
    'amount_due',v_o.amount_due,
    'allocated_amount',v_allocated,
    'outstanding_amount',greatest(v_o.amount_due-v_allocated,0),
    'initiative_credit',v_credit
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.get_contribution_initiative_participants(p_initiative_id uuid)
 RETURNS TABLE(initiative_member_id uuid, member_id uuid, amount numeric, effective_from date, effective_to date, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select ci.group_id
    into v_group_id
    from public.contribution_initiatives ci
   where ci.id = p_initiative_id;

  if not found or not public.can_manage_members(v_group_id) then
    raise exception 'Not authorized';
  end if;

  return query
    select im.id,
           im.member_id,
           im.amount,
           im.effective_from,
           im.effective_to,
           im.status
      from public.contribution_initiative_members im
     where im.initiative_id = p_initiative_id
     order by im.member_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_contribution_initiative_period_status(p_initiative_id uuid, p_period_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives;
  v_p public.contribution_initiative_periods;
  v_obligations integer;
  v_allocated numeric;
  v_outstanding numeric;
BEGIN
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id;
  IF NOT FOUND OR NOT public.cl_user_in_group(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_p FROM public.contribution_initiative_periods
  WHERE initiative_id=p_initiative_id AND period_key=p_period_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('initiative_id',p_initiative_id,'period_key',p_period_key,'exists',false);
  END IF;

  SELECT count(*),
         coalesce(sum(coalesce(a.allocated,0)),0),
         coalesce(sum(greatest(o.amount_due-coalesce(a.allocated,0),0)),0)
  INTO v_obligations,v_allocated,v_outstanding
  FROM public.contribution_initiative_obligations o
  LEFT JOIN LATERAL (
    SELECT sum(x.amount) allocated
    FROM public.contribution_initiative_allocations x
    WHERE x.initiative_obligation_id=o.id
      AND NOT EXISTS (SELECT 1 FROM public.contribution_initiative_payment_reversals r WHERE r.payment_id=x.payment_id)
  ) a ON true
  WHERE o.initiative_period_id=v_p.id;

  RETURN jsonb_build_object(
    'initiative_id',p_initiative_id,
    'period_id',v_p.id,
    'period_key',v_p.period_key,
    'opening_date',v_p.opening_date,
    'closing_date',v_p.closing_date,
    'status',v_p.status,
    'obligation_count',v_obligations,
    'allocated_amount',v_allocated,
    'outstanding_amount',v_outstanding
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.get_contribution_initiative_recurring_participants(p_initiative_id uuid)
 RETURNS TABLE(initiative_member_id uuid, member_id uuid, amount numeric, effective_from date, effective_to date, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group_id uuid;
  v_frequency text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select ci.group_id, ci.frequency
    into v_group_id, v_frequency
    from public.contribution_initiatives ci
   where ci.id = p_initiative_id;

  if not found or not public.can_manage_members(v_group_id) then
    raise exception 'Not authorized';
  end if;

  if v_frequency <> 'monthly' then
    raise exception 'Initiative is not recurring monthly';
  end if;

  return query
    select im.id,
           im.member_id,
           coalesce(term.amount, im.amount),
           coalesce(term.effective_from, im.effective_from),
           coalesce(term.effective_to, im.effective_to),
           coalesce(term.status, im.status)
      from public.contribution_initiative_members im
      left join lateral (
        select t.amount, t.effective_from, t.effective_to, t.status
          from public.contribution_initiative_member_terms t
         where t.initiative_member_id = im.id
         order by t.effective_from desc
         limit 1
      ) term on true
     where im.initiative_id = p_initiative_id
       and lower(coalesce(im.status, 'active')) = 'active'
     order by im.member_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_contribution_initiative_summary(p_initiative_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives;
  v_periods integer;
  v_obligations integer;
  v_due numeric;
  v_allocated numeric;
  v_outstanding numeric;
  v_credit numeric;
BEGIN
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id;
  IF NOT FOUND OR NOT public.cl_user_in_group(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT count(*) INTO v_periods FROM public.contribution_initiative_periods WHERE initiative_id=p_initiative_id;
  SELECT count(*),coalesce(sum(o.amount_due),0) INTO v_obligations,v_due
  FROM public.contribution_initiative_obligations o WHERE o.initiative_id=p_initiative_id AND o.initiative_period_id IS NOT NULL;
  SELECT coalesce(sum(a.amount),0) INTO v_allocated
  FROM public.contribution_initiative_allocations a
  WHERE EXISTS (SELECT 1 FROM public.contribution_initiative_obligations o WHERE o.id=a.initiative_obligation_id AND o.initiative_id=p_initiative_id)
    AND NOT EXISTS (SELECT 1 FROM public.contribution_initiative_payment_reversals r WHERE r.payment_id=a.payment_id);
  SELECT coalesce(sum(c.remaining_amount),0) INTO v_credit
  FROM public.contribution_initiative_credits c WHERE c.initiative_id=p_initiative_id;
  v_outstanding=greatest(v_due-v_allocated,0);

  RETURN jsonb_build_object(
    'initiative_id',p_initiative_id,
    'status',v_i.status,
    'frequency',v_i.frequency,
    'period_count',v_periods,
    'obligation_count',v_obligations,
    'amount_due',v_due,
    'allocated_amount',v_allocated,
    'outstanding_amount',v_outstanding,
    'initiative_credit',v_credit
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.get_group_contribution_positions(p_group_id uuid)
 RETURNS TABLE(member_id uuid, group_id uuid, total_due numeric, total_allocated numeric, arrears numeric, credit numeric, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_role text;
BEGIN
  v_role := public.current_user_role(p_group_id);
  IF v_role IS NULL OR v_role NOT IN ('admin', 'chairperson', 'secretary', 'treasurer') THEN
    RAISE EXCEPTION 'Not authorized to view group cumulative contribution positions'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT pos.member_id, pos.group_id, pos.total_due, pos.total_allocated, pos.arrears, pos.credit, pos.status
  FROM public.members AS m
  CROSS JOIN LATERAL public.get_member_contribution_position(m.id) AS pos
  WHERE m.group_id = p_group_id AND pos.group_id = p_group_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_group_contribution_settings(p_group_id uuid)
 RETURNS TABLE(group_id uuid, monthly_closing_day smallint, current_opening_date date, current_closing_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_day smallint; v_close date; v_open date;
BEGIN
  IF NOT public.can_manage_members(p_group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT s.monthly_closing_day INTO v_day FROM public.group_contribution_settings s WHERE s.group_id=p_group_id;
  IF v_day IS NULL THEN v_day := 5; END IF;
  v_close := CASE WHEN current_date <= make_date(extract(year from current_date)::int,extract(month from current_date)::int,v_day)
    THEN make_date(extract(year from current_date)::int,extract(month from current_date)::int,v_day)
    ELSE make_date(extract(year from current_date + interval '1 month')::int,extract(month from current_date + interval '1 month')::int,v_day) END;
  v_open := v_close - interval '1 month' + interval '1 day';
  v_open := v_open::date;
  RETURN QUERY SELECT p_group_id,v_day,v_open,v_close;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_group_custom_contribution_status(p_group_id uuid)
 RETURNS TABLE(member_id uuid, member_name text, contribution_name text, period_id uuid, amount_due numeric, amount_applied numeric, outstanding numeric, status text, due_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_user_role(p_group_id);
  IF v_role IS NULL OR v_role NOT IN ('admin', 'chairperson', 'secretary', 'treasurer') THEN
    RAISE EXCEPTION 'Not authorized to view group custom contribution status'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.member_id,
    m.name::text,
    COALESCE(NULLIF(trim(cp.name), ''), NULLIF(trim(ct.name), ''), 'Custom Contribution')::text,
    cp.id,
    COALESCE(o.due_amount, 0)::numeric,
    COALESCE(alloc.amount_applied, 0)::numeric,
    GREATEST(COALESCE(o.due_amount, 0) - COALESCE(alloc.amount_applied, 0), 0)::numeric,
    CASE
      WHEN COALESCE(alloc.amount_applied, 0) >= COALESCE(o.due_amount, 0) THEN 'paid'
      WHEN COALESCE(alloc.amount_applied, 0) > 0 THEN 'partial'
      ELSE 'outstanding'
    END::text,
    cp.due_date
  FROM public.contribution_obligations AS o
  JOIN public.members AS m
    ON m.id = o.member_id
   AND m.group_id = o.group_id
  JOIN public.contribution_periods AS cp
    ON cp.id = o.period_id
   AND cp.group_id = o.group_id
  JOIN public.contribution_types AS ct
    ON ct.id = o.contribution_type_id
   AND ct.group_id = o.group_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(a.amount), 0)::numeric AS amount_applied
    FROM public.contribution_allocations AS a
    WHERE a.obligation_id = o.id
  ) AS alloc ON true
  WHERE o.group_id = p_group_id
    AND lower(trim(COALESCE(ct.code, ''))) = 'custom'
    AND lower(trim(COALESCE(cp.status, ''))) IN ('open', 'due', 'grace')
  ORDER BY cp.due_date NULLS LAST, cp.name, m.name;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_group_module_settings(p_group_id uuid)
 RETURNS TABLE(group_id uuid, merry_go_round_enabled boolean, loans_enabled boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.members m
    where m.group_id = p_group_id
      and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  ) then
    raise exception 'You are not an active member of this group' using errcode = '42501';
  end if;

  return query
  select g.id, g.merry_go_round_enabled, g.loans_enabled
  from public.groups g
  where g.id = p_group_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_group_monthly_cycle_status(p_group_id uuid, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(group_id uuid, monthly_closing_day smallint, monthly_grace_days smallint, cycle_opening_date date, cycle_closing_date date, cycle_status text, grace_start_date date, grace_end_date date, is_in_grace boolean, next_cycle_opening_date date, next_cycle_closing_date date, grace_message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_closing_day smallint;
  v_grace_days smallint;
  v_owner_user_id uuid;
  v_role text;
  v_cycle_closing date;
  v_cycle_opening date;
  v_previous_closing date;
  v_grace_start date;
  v_grace_end date;
  v_next_opening date;
  v_next_closing date;
  v_in_grace boolean := false;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select g.owner_user_id into v_owner_user_id
  from public.groups g
  where g.id = p_group_id;

  if v_owner_user_id is null then raise exception 'GROUP_NOT_FOUND'; end if;

  v_role := public.current_user_role(p_group_id);

  if auth.uid() <> v_owner_user_id and v_role is null then
    raise exception 'GROUP_ACCESS_NOT_AUTHORIZED';
  end if;

  select s.monthly_closing_day, coalesce(s.monthly_grace_days,0)
    into v_closing_day, v_grace_days
  from public.group_contribution_settings s
  where s.group_id=p_group_id;

  if v_closing_day is null then raise exception 'CONTRIBUTION_SETTINGS_NOT_FOUND'; end if;

  if extract(day from p_as_of_date)::int <= v_closing_day then
    v_cycle_closing := make_date(extract(year from p_as_of_date)::int,extract(month from p_as_of_date)::int,v_closing_day);
  else
    v_cycle_closing := (date_trunc('month',p_as_of_date)::date + interval '1 month')::date + (v_closing_day-1);
  end if;

  v_cycle_opening := (v_cycle_closing - interval '1 month')::date + 1;
  v_next_opening := v_cycle_closing + 1;
  v_next_closing := (v_cycle_closing + interval '1 month')::date;

  if extract(day from p_as_of_date)::int > v_closing_day then
    v_previous_closing := date_trunc('month',p_as_of_date)::date + (v_closing_day-1);
  else
    v_previous_closing := (date_trunc('month',p_as_of_date)::date - interval '1 month')::date + (v_closing_day-1);
  end if;

  v_grace_start := v_previous_closing + 1;
  v_grace_end := v_previous_closing + v_grace_days;
  v_in_grace := v_grace_days > 0 and p_as_of_date between v_grace_start and v_grace_end;

  return query
  select p_group_id,v_closing_day,v_grace_days,v_cycle_opening,v_cycle_closing,
    case when v_in_grace then 'GRACE' else 'OPEN' end,
    v_grace_start,v_grace_end,v_in_grace,v_next_opening,v_next_closing,
    case when v_in_grace then 'Previous contribution cycle is in its grace period through '||to_char(v_grace_end,'DD Mon YYYY') else null end;
end;
$function$
