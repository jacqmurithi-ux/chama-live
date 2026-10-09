-- Candidate Fine Management: canonical lock order and safe idempotent retries.
-- Reasserts the final RPC body for environments following the candidate migrations in order.

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
