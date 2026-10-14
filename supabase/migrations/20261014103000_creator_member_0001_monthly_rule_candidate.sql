/*
  CHAMA LIVE — Creator member Monthly-rule repair
  STATUS: CANDIDATE ONLY — DO NOT APPLY TO PRODUCTION.

  Narrow scope:
    - only the approved creator membership linked to group_applications
    - member number 0001, admin role, active membership
    - only when group Monthly amount is positive and the rule is absent
    - no historical obligations: activate from today using next_full_period
    - all accounting writes remain inside cl_2b_refresh_member
*/

BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_creator_monthly_contribution_rule(
  p_group_id uuid
)
RETURNS TABLE (
  ok boolean,
  status text,
  member_id uuid,
  rule_id uuid,
  effective_from date,
  obligations_through date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_member public.members%ROWTYPE;
  v_amount numeric(14,2);
  v_type_id uuid;
  v_rule_id uuid;
  v_existing_count integer;
  v_through date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_group_id IS NULL OR NOT public.can_manage_members(p_group_id) THEN
    RAISE EXCEPTION 'MEMBER_MANAGEMENT_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT m.*
    INTO v_member
  FROM public.group_applications ga
  JOIN public.members m
    ON m.id = ga.approved_member_id
   AND m.group_id = ga.approved_group_id
  WHERE ga.approved_group_id = p_group_id
    AND ga.approved_member_id = m.id
    AND ga.auth_user_id = auth.uid()
    AND m.member_number = '0001'
    AND lower(m.role) = 'admin'
    AND lower(coalesce(m.status, '')) = 'active'
    AND (m.auth_user_id = auth.uid() OR m.user_id = auth.uid())
  ORDER BY ga.reviewed_at DESC NULLS LAST, ga.created_at DESC
  LIMIT 1
  FOR UPDATE OF m;

  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'CREATOR_MEMBER_0001_NOT_CONFIRMED' USING ERRCODE = '42501';
  END IF;

  SELECT g.monthly_contribution
    INTO v_amount
  FROM public.groups g
  WHERE g.id = p_group_id
  FOR UPDATE;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND';
  END IF;

  IF v_amount <= 0 THEN
    RETURN QUERY SELECT true, 'monthly_amount_not_configured'::text,
      v_member.id, NULL::uuid, NULL::date, NULL::date;
    RETURN;
  END IF;

  SELECT ct.id
    INTO v_type_id
  FROM public.contribution_types ct
  WHERE ct.group_id = p_group_id
    AND (ct.code = 'monthly' OR lower(trim(ct.name)) = 'monthly')
  ORDER BY CASE WHEN ct.code = 'monthly' THEN 0 ELSE 1 END,
           ct.created_at, ct.id
  LIMIT 1;

  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'CANONICAL_MONTHLY_CONTRIBUTION_TYPE_MISSING';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chama-live:creator-monthly-rule:' || p_group_id::text || ':' || v_member.id::text, 0
    )
  );

  SELECT count(*)::integer
    INTO v_existing_count
  FROM public.member_contribution_rules r
  WHERE r.group_id = p_group_id
    AND r.member_id = v_member.id
    AND r.contribution_type_id = v_type_id
    AND r.frequency = 'monthly';

  IF v_existing_count > 0 THEN
    RETURN QUERY SELECT true, 'existing_rule_requires_no_automatic_change'::text,
      v_member.id, NULL::uuid, NULL::date, NULL::date;
    RETURN;
  END IF;

  /*
    Safe date policy: do not backdate the missing rule to the member's join
    date. Start today, and make the first obligation the next full month.
    Refresh through that next month so the canonical engine can materialize
    exactly the intended first full-period obligation.
  */
  v_through := (date_trunc('month', CURRENT_DATE) + interval '1 month')::date;

  INSERT INTO public.member_contribution_rules (
    group_id,
    member_id,
    contribution_type_id,
    amount,
    frequency,
    effective_from,
    effective_to,
    first_period_rule,
    status,
    created_by
  )
  VALUES (
    p_group_id,
    v_member.id,
    v_type_id,
    v_amount,
    'monthly',
    CURRENT_DATE,
    NULL,
    'next_full_period',
    'active',
    v_member.id
  )
  RETURNING id INTO v_rule_id;

  PERFORM public.cl_2b_refresh_member(v_member.id, v_through);

  RETURN QUERY SELECT true, 'created_and_refreshed'::text,
    v_member.id, v_rule_id, CURRENT_DATE, v_through;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_creator_monthly_contribution_rule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_creator_monthly_contribution_rule(uuid) TO authenticated;

COMMIT;
