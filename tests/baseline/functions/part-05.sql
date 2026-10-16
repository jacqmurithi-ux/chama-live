-- STAGE ONLY: production function definitions; ordinal rows 41-50 of 201.
-- Definitions captured read-only on 2026-10-14. Ordering is alphabetical, NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects must be reconciled separately.

CREATE OR REPLACE FUNCTION public.cl_fine_create_rule(p_group_id uuid, p_name text, p_description text, p_trigger_type text, p_specificity_level smallint, p_priority integer, p_calculation_method text, p_fixed_amount numeric, p_percentage_rate numeric, p_minimum_amount numeric, p_maximum_amount numeric, p_grace_period_value integer, p_grace_period_unit text, p_applicability_mode text, p_effective_from timestamp with time zone, p_effective_until timestamp with time zone, p_contribution_type_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_actor uuid := auth.uid();
  v_month text;
  v_member_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF NOT public.cl_user_has_role(p_group_id, ARRAY['chairperson','treasurer']::text[]) THEN
    RAISE EXCEPTION 'Fine-rule management requires chairperson or treasurer' USING ERRCODE='42501';
  END IF;
  IF p_group_id IS NULL OR p_effective_from IS NULL THEN
    RAISE EXCEPTION 'Group and effective_from are required';
  END IF;
  IF btrim(coalesce(p_name,'')) = '' THEN
    RAISE EXCEPTION 'Rule name is required';
  END IF;
  IF p_specificity_level NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Invalid specificity level';
  END IF;
  IF p_trigger_type NOT IN ('missed_contribution','meeting_absence','late_attendance','custom_event') THEN
    RAISE EXCEPTION 'Invalid trigger type';
  END IF;
  IF p_applicability_mode IN ('ALL','SELECTED') AND p_trigger_type <> 'missed_contribution' THEN
    RAISE EXCEPTION 'Contribution applicability mode is only valid for contribution fines';
  END IF;
  IF p_trigger_type = 'missed_contribution' AND p_applicability_mode NOT IN ('ALL','SELECTED') THEN
    RAISE EXCEPTION 'Invalid contribution applicability mode';
  END IF;
  IF p_trigger_type <> 'missed_contribution' AND p_applicability_mode NOT IN ('ALL_MEETINGS') THEN
    RAISE EXCEPTION 'Invalid non-contribution applicability mode';
  END IF;
  IF p_trigger_type <> 'missed_contribution' AND p_contribution_type_ids IS NOT NULL AND cardinality(p_contribution_type_ids) > 0 THEN
    RAISE EXCEPTION 'Contribution types are only valid for contribution rules';
  END IF;

  v_month := to_char(date_trunc('month', p_effective_from)::date, 'YYYY-MM');
  PERFORM private.cl_fine_config_lock(p_group_id);
  PERFORM private.cl_fine_lock(p_group_id, v_month);

  SELECT m.id INTO v_member_id
  FROM public.members m
  WHERE m.group_id=p_group_id
    AND (m.auth_user_id=v_actor OR m.user_id=v_actor)
    AND lower(m.status)='active'
    AND lower(m.onboarding_status)='active'
  ORDER BY m.id LIMIT 1;
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Active group membership required' USING ERRCODE='42501';
  END IF;

  IF p_trigger_type='missed_contribution' AND p_applicability_mode='SELECTED' THEN
    IF p_contribution_type_ids IS NULL OR cardinality(p_contribution_type_ids)=0 THEN
      RAISE EXCEPTION 'Selected contribution rules require contribution types';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.contribution_types ct
      WHERE ct.id = ANY(p_contribution_type_ids)
        AND ct.group_id <> p_group_id
    ) OR EXISTS (
      SELECT 1
      FROM unnest(p_contribution_type_ids) x(id)
      WHERE NOT EXISTS (SELECT 1 FROM public.contribution_types ct WHERE ct.id=x.id)
    ) THEN
      RAISE EXCEPTION 'Selected contribution type does not belong to the rule group';
    END IF;
  END IF;

  -- Manual custom_event rules are selectable fine types, not competing
  -- automatic rules. Keep conflict detection for all automatic triggers.
  IF p_trigger_type <> 'custom_event' AND EXISTS (
    SELECT 1 FROM public.fine_rules r
    WHERE r.group_id=p_group_id
      AND r.trigger_type=p_trigger_type
      AND r.status='active'
      AND r.specificity_level=p_specificity_level
      AND r.priority=p_priority
      AND r.effective_from <= coalesce(p_effective_until,'infinity'::timestamptz)
      AND coalesce(r.effective_until,'infinity'::timestamptz) >= p_effective_from
  ) THEN
    RAISE EXCEPTION 'Equal specificity and priority rule conflict';
  END IF;

  INSERT INTO public.fine_rules(
    group_id,name,description,trigger_type,specificity_level,priority,
    calculation_method,fixed_amount,percentage_rate,minimum_amount,maximum_amount,
    grace_period_value,grace_period_unit,applicability_mode,effective_from,effective_until,
    status,created_by,updated_by
  ) VALUES (
    p_group_id,btrim(p_name),p_description,p_trigger_type,p_specificity_level,p_priority,
    p_calculation_method,p_fixed_amount,p_percentage_rate,p_minimum_amount,p_maximum_amount,
    p_grace_period_value,p_grace_period_unit,p_applicability_mode,p_effective_from,p_effective_until,
    'active',v_actor,v_actor
  ) RETURNING id INTO v_id;

  IF p_trigger_type='missed_contribution' AND p_applicability_mode='SELECTED' THEN
    INSERT INTO public.fine_rule_contribution_types(rule_id, contribution_type_id)
    SELECT v_id, x.id FROM unnest(p_contribution_type_ids) x(id);
  END IF;

  RETURN v_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_fine_generate_contribution(p_group_id uuid, p_member_id uuid, p_obligation_id uuid, p_triggered_at timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_obligation public.contribution_obligations%ROWTYPE;
  v_rule public.fine_rules%ROWTYPE;
  v_fine_id uuid;
  v_actor uuid := auth.uid();
  v_month text;
  v_close_at timestamptz;
  v_fine_eligible_at timestamptz;
  v_base numeric(14,2);
  v_amount numeric(14,2);
  v_period public.financial_periods%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF NOT public.cl_user_has_role(p_group_id, ARRAY['chairperson','treasurer']::text[]) THEN
    RAISE EXCEPTION 'Fine generation requires chairperson or treasurer' USING ERRCODE='42501';
  END IF;

  SELECT o.* INTO v_obligation
  FROM public.contribution_obligations o
  WHERE o.id=p_obligation_id;
  IF NOT FOUND OR v_obligation.group_id<>p_group_id OR v_obligation.member_id<>p_member_id THEN
    RAISE EXCEPTION 'Contribution obligation ownership mismatch';
  END IF;

  v_month := to_char(v_obligation.obligation_month,'YYYY-MM');
  PERFORM private.cl_fine_config_lock(p_group_id);
  PERFORM private.cl_fine_lock(p_group_id, v_month);

  SELECT o.* INTO v_obligation
  FROM public.contribution_obligations o
  WHERE o.id=p_obligation_id
  FOR UPDATE;
  IF v_obligation.group_id<>p_group_id OR v_obligation.member_id<>p_member_id THEN
    RAISE EXCEPTION 'Contribution obligation ownership changed';
  END IF;

  v_period := public.ensure_financial_period(p_group_id,v_month);
  IF lower(coalesce(v_period.status,'open'))='closed' THEN
    RAISE EXCEPTION 'Financial month % is closed',v_month;
  END IF;

  -- Current physical contract provides a group contribution calendar period.
  -- Resolve that authoritative closing date; no contribution-type override is
  -- assumed because no such physical relation was reconciled.
  SELECT (gcp.closing_date + interval '1 day') AT TIME ZONE 'Africa/Nairobi'
  INTO v_close_at
  FROM public.group_contribution_calendar_periods gcp
  WHERE gcp.group_id=p_group_id
    AND gcp.opening_date <= v_obligation.obligation_month
    AND gcp.closing_date >= v_obligation.obligation_month
  ORDER BY gcp.closing_date
  LIMIT 1;
  IF v_close_at IS NULL THEN
    RAISE EXCEPTION 'No authoritative contribution closing period configured';
  END IF;

  IF p_triggered_at < v_close_at THEN
    RAISE EXCEPTION 'Contribution has not crossed its closing boundary';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.contribution_allocations a
    WHERE a.obligation_id=p_obligation_id
    GROUP BY a.obligation_id
    HAVING coalesce(sum(a.amount),0) >= v_obligation.due_amount
  ) THEN
    RAISE EXCEPTION 'Contribution obligation is settled; no missed-contribution fine';
  END IF;

  IF (
    SELECT count(*)
    FROM public.fine_rules r
    WHERE r.group_id=p_group_id
      AND r.trigger_type='missed_contribution'
      AND r.status='active'
      AND r.effective_from <= p_triggered_at
      AND (r.effective_until IS NULL OR r.effective_until >= p_triggered_at)
      AND (
        r.applicability_mode='ALL'
        OR EXISTS (
          SELECT 1 FROM public.fine_rule_contribution_types rt
          WHERE rt.rule_id=r.id AND rt.contribution_type_id=v_obligation.contribution_type_id
        )
      )
      AND r.specificity_level = (
        SELECT max(r2.specificity_level)
        FROM public.fine_rules r2
        WHERE r2.group_id=p_group_id
          AND r2.trigger_type='missed_contribution'
          AND r2.status='active'
          AND r2.effective_from <= p_triggered_at
          AND (r2.effective_until IS NULL OR r2.effective_until >= p_triggered_at)
          AND (r2.applicability_mode='ALL' OR EXISTS (
            SELECT 1 FROM public.fine_rule_contribution_types rt2
            WHERE rt2.rule_id=r2.id AND rt2.contribution_type_id=v_obligation.contribution_type_id
          ))
      )
      AND r.priority = (
        SELECT max(r3.priority)
        FROM public.fine_rules r3
        WHERE r3.group_id=p_group_id
          AND r3.trigger_type='missed_contribution'
          AND r3.status='active'
          AND r3.effective_from <= p_triggered_at
          AND (r3.effective_until IS NULL OR r3.effective_until >= p_triggered_at)
          AND (r3.applicability_mode='ALL' OR EXISTS (
            SELECT 1 FROM public.fine_rule_contribution_types rt3
            WHERE rt3.rule_id=r3.id AND rt3.contribution_type_id=v_obligation.contribution_type_id
          ))
          AND r3.specificity_level = r.specificity_level
      )
  ) > 1 THEN
    RAISE EXCEPTION 'Equal specificity and priority produces ambiguous fine-rule precedence';
  END IF;

  SELECT r.* INTO v_rule
  FROM public.fine_rules r
  WHERE r.group_id=p_group_id
    AND r.trigger_type='missed_contribution'
    AND r.status='active'
    AND r.effective_from <= p_triggered_at
    AND (r.effective_until IS NULL OR r.effective_until >= p_triggered_at)
    AND (r.applicability_mode='ALL' OR EXISTS (
      SELECT 1 FROM public.fine_rule_contribution_types rt
      WHERE rt.rule_id=r.id AND rt.contribution_type_id=v_obligation.contribution_type_id
    ))
  ORDER BY r.specificity_level DESC, r.priority DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'No applicable contribution fine rule'; END IF;

  v_fine_eligible_at := v_close_at
    + CASE v_rule.grace_period_unit
        WHEN 'DAY' THEN make_interval(days => v_rule.grace_period_value)
        WHEN 'WEEK' THEN make_interval(days => v_rule.grace_period_value * 7)
        WHEN 'MONTH' THEN make_interval(months => v_rule.grace_period_value)
      END;
  IF p_triggered_at < v_fine_eligible_at THEN
    RAISE EXCEPTION 'Contribution has not crossed its closing and grace boundary';
  END IF;

  v_base := round(v_obligation.due_amount,2);
  IF v_rule.calculation_method='FIXED' THEN
    v_amount := round(v_rule.fixed_amount,2);
  ELSE
    v_amount := round(v_base * v_rule.percentage_rate / 100,2);
  END IF;
  IF v_rule.minimum_amount IS NOT NULL THEN v_amount := greatest(v_amount, round(v_rule.minimum_amount,2)); END IF;
  IF v_rule.maximum_amount IS NOT NULL THEN v_amount := least(v_amount, round(v_rule.maximum_amount,2)); END IF;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Calculated fine amount must be positive'; END IF;

  INSERT INTO public.fines(
    group_id,member_id,rule_id,trigger_type,trigger_id,accounting_month,
    original_amount,calculation_method,calculation_base,percentage_rate,fixed_amount,
    minimum_amount,maximum_amount,calculated_amount,resolved_closing_at,triggered_at
  ) VALUES (
    p_group_id,p_member_id,v_rule.id,'missed_contribution',p_obligation_id,v_month,
    v_amount,v_rule.calculation_method,v_base,v_rule.percentage_rate,v_rule.fixed_amount,
    v_rule.minimum_amount,v_rule.maximum_amount,v_amount,v_close_at,p_triggered_at
  )
  ON CONFLICT (group_id,member_id,rule_id,trigger_type,trigger_id)
  DO NOTHING
  RETURNING id INTO v_fine_id;

  IF v_fine_id IS NULL THEN
    SELECT f.id INTO v_fine_id FROM public.fines f
    WHERE f.group_id=p_group_id AND f.member_id=p_member_id
      AND f.rule_id=v_rule.id AND f.trigger_type='missed_contribution'
      AND f.trigger_id=p_obligation_id;
  END IF;

  RETURN v_fine_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_fine_waive(p_fine_id uuid, p_amount numeric, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_fine public.fines%ROWTYPE;
  v_period public.financial_periods%ROWTYPE;
  v_actor uuid := auth.uid();
  v_balance numeric(14,2);
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR btrim(coalesce(p_reason,''))='' THEN RAISE EXCEPTION 'Valid waiver amount and reason are required'; END IF;
  SELECT f.* INTO v_fine FROM public.fines f WHERE f.id=p_fine_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fine not found'; END IF;
  IF NOT public.cl_user_has_role(v_fine.group_id, ARRAY['chairperson','treasurer']::text[]) THEN RAISE EXCEPTION 'Fine waiver requires chairperson or treasurer' USING ERRCODE='42501'; END IF;
  PERFORM private.cl_fine_lock(v_fine.group_id,v_fine.accounting_month);
  SELECT fp.* INTO v_period FROM public.financial_periods fp WHERE fp.group_id=v_fine.group_id AND fp.month=v_fine.accounting_month FOR UPDATE;
  IF NOT FOUND OR lower(v_period.status)='closed' THEN RAISE EXCEPTION 'Financial month is closed or missing'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:member:' || v_fine.group_id::text || ':' || v_fine.member_id::text,
      0
    )
  );
  SELECT f.* INTO v_fine FROM public.fines f WHERE f.id=p_fine_id FOR UPDATE;
  SELECT v_fine.original_amount
    + coalesce((SELECT sum(CASE WHEN a.direction='INCREASE' THEN a.amount ELSE -a.amount END) FROM public.fine_adjustments a WHERE a.fine_id=v_fine.id),0)
    - coalesce((SELECT sum(w.amount) FROM public.fine_waivers w WHERE w.fine_id=v_fine.id),0)
    - coalesce((SELECT sum(a.allocated_amount) FROM public.fine_payment_allocations a WHERE a.fine_id=v_fine.id),0)
  INTO v_balance;
  IF p_amount > round(v_balance,2) THEN RAISE EXCEPTION 'Waiver exceeds outstanding fine balance'; END IF;
  INSERT INTO public.fine_waivers(fine_id,amount,reason,authorized_by) VALUES(p_fine_id,round(p_amount,2),btrim(p_reason),v_actor) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.cl_get_group_loan_summary(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_summary jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_group_id is null then
    raise exception 'Group is required' using errcode = '22023';
  end if;

  -- A member may view their own group's summary. Group managers may
  -- view groups where they hold a recognized management role, and owners
  -- may view the group they own. Never trust a client-supplied group ID alone.
  if not exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and (
        g.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.members m
          where m.group_id = g.id
            and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
            and lower(coalesce(m.status, 'active')) = 'active'
            and lower(coalesce(m.onboarding_status, 'active')) = 'active'
        )
        or public.cl_user_has_role(
          g.id,
          array['admin','chairperson','secretary','treasurer']::text[]
        )
      )
  ) then
    raise exception 'You are not authorized to view this group loan summary'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and coalesce(g.loans_enabled, false) = true
  ) then
    raise exception 'Loans are not enabled for this group'
      using errcode = '42501';
  end if;

  with disbursed_loans as (
    select la.id, la.group_id, la.member_id, la.approved_amount, la.status
    from public.loan_applications la
    where la.group_id = p_group_id
      and la.disbursed_at is not null
      and la.status in ('active', 'overdue', 'cleared')
  ),
  loan_totals as (
    select
      coalesce(sum(approved_amount), 0)::numeric as total_disbursed,
      count(distinct member_id)::integer as members_benefited,
      count(*) filter (where status in ('active', 'overdue'))::integer as active_loans_count
    from disbursed_loans
  ),
  interest_totals as (
    -- Allocations record interest that was actually paid as part of a
    -- recorded repayment. Scheduled/unpaid interest is not counted.
    select coalesce(sum(a.interest_amount), 0)::numeric as interest_gained
    from public.loan_repayment_allocations a
    join disbursed_loans dl on dl.id = a.loan_id
    where a.group_id = p_group_id
  ),
  principal_totals as (
    -- Exclude cleared loans; overdue loans remain outstanding until cleared.
    -- Principal allocations, not total installment payments, reduce principal.
    select coalesce(sum(greatest(s.principal_due - coalesce(pa.principal_paid, 0), 0)), 0)::numeric
      as outstanding_amount
    from public.loan_repayment_schedule s
    join disbursed_loans dl on dl.id = s.loan_id
    left join (
      select schedule_id, sum(principal_amount)::numeric as principal_paid
      from public.loan_repayment_allocations
      where group_id = p_group_id
      group by schedule_id
    ) pa on pa.schedule_id = s.id
    where s.group_id = p_group_id
      and dl.status in ('active', 'overdue')
  )
  select jsonb_build_object(
    'totalDisbursed', lt.total_disbursed,
    'interestGained', it.interest_gained,
    'membersBenefited', lt.members_benefited,
    'outstandingAmount', pt.outstanding_amount,
    'activeLoansCount', lt.active_loans_count
  )
  into v_summary
  from loan_totals lt
  cross join interest_totals it
  cross join principal_totals pt;

  return coalesce(v_summary, jsonb_build_object(
    'totalDisbursed', 0,
    'interestGained', 0,
    'membersBenefited', 0,
    'outstandingAmount', 0,
    'activeLoansCount', 0
  ));
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_get_group_support_summary(p_group_id uuid)
 RETURNS TABLE(support_id uuid, member_id uuid, member_name text, support_type text, support_date date, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ BEGIN IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF; IF NOT EXISTS (SELECT 1 FROM public.members m WHERE m.group_id=p_group_id AND (m.user_id=(SELECT auth.uid()) OR m.auth_user_id=(SELECT auth.uid())) AND lower(coalesce(m.status,'active'))='active') THEN RAISE EXCEPTION 'Group access denied'; END IF; RETURN QUERY SELECT s.id,s.member_id,m.name,s.support_type,s.support_date,s.status FROM public.group_support_cases s JOIN public.members m ON m.id=s.member_id WHERE s.group_id=p_group_id ORDER BY s.support_date DESC,s.created_at DESC; END; $function$


CREATE OR REPLACE FUNCTION public.cl_group_activities_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_group_assets_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_group_milestones_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_group_module_enabled(p_group_id uuid, p_module text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_enabled boolean;
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

  if lower(btrim(coalesce(p_module, ''))) = 'merry_go_round' then
    select g.merry_go_round_enabled into v_enabled
    from public.groups g where g.id = p_group_id;
  elsif lower(btrim(coalesce(p_module, ''))) = 'loans' then
    select g.loans_enabled into v_enabled
    from public.groups g where g.id = p_group_id;
  else
    raise exception 'Unknown optional module' using errcode = '22023';
  end if;

  if v_enabled is null then
    raise exception 'Group not found' using errcode = 'P0002';
  end if;

  return v_enabled;
end;
$function$


CREATE OR REPLACE FUNCTION public.cl_group_plans_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $function$
