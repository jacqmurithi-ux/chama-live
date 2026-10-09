-- Candidate Fine Management schema and RPC baseline.
-- Applied only to isolated project onzaonflquipqmhgslxi; production was not changed.

ALTER TABLE public.fines
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'AUTOMATIC',
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS imposed_at timestamptz;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fines'::regclass
      AND conname = 'fines_source_type_ck'
  ) THEN
    ALTER TABLE public.fines
      ADD CONSTRAINT fines_source_type_ck
      CHECK (source_type IN ('AUTOMATIC','MANUAL'));
  END IF;
END
$constraint$;

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

  /*
   * Manual custom_event rules are selectable fine types, not competing
   * automatic rules. Keep equal-specificity/priority rejection for every
   * trigger that participates in automatic generation.
   */
  IF p_trigger_type <> 'custom_event' AND EXISTS (
    SELECT 1
    FROM public.fine_rules r
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

  -- Keep configuration and month serialization ahead of period/member/fine
  -- row locks, matching the existing Fine Management lock contract.
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

  -- Check idempotency before checking current rule status: retrying the same
  -- accepted request must not create a second fine or fail after rule retirement.
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


REVOKE ALL ON FUNCTION public.create_manual_member_fine(uuid,uuid,uuid,numeric,text,uuid,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_manual_member_fine(uuid,uuid,uuid,numeric,text,uuid,timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cl_fine_create_rule(uuid,text,text,text,smallint,integer,text,numeric,numeric,numeric,numeric,integer,text,text,timestamptz,timestamptz,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cl_fine_create_rule(uuid,text,text,text,smallint,integer,text,numeric,numeric,numeric,numeric,integer,text,text,timestamptz,timestamptz,uuid[]) TO authenticated, service_role;
