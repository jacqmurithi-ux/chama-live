-- STAGE ONLY: production function definitions; ordinal rows 81-90 of 201.
-- Definitions captured read-only on 2026-10-14. Ordering is alphabetical, NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects must be reconciled separately.

CREATE OR REPLACE FUNCTION public.cl_user_in_group(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.group_id = p_group_id
      AND (m.user_id = auth.uid() OR m.auth_user_id = auth.uid())
      AND lower(coalesce(m.status, 'active')) = 'active'
  );
$function$


CREATE OR REPLACE FUNCTION public.cl_validate_group_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_assigned_group uuid; v_creator_group uuid; v_plan_group uuid; BEGIN IF NEW.assigned_to IS NOT NULL THEN SELECT m.group_id INTO v_assigned_group FROM public.members m WHERE m.id=NEW.assigned_to; IF v_assigned_group IS NULL OR v_assigned_group<>NEW.group_id THEN RAISE EXCEPTION 'Activity assignee does not belong to this group'; END IF; END IF; IF NEW.created_by IS NOT NULL THEN SELECT m.group_id INTO v_creator_group FROM public.members m WHERE m.id=NEW.created_by; IF v_creator_group IS NULL OR v_creator_group<>NEW.group_id THEN RAISE EXCEPTION 'Activity creator does not belong to this group'; END IF; END IF; IF NEW.plan_id IS NOT NULL THEN SELECT p.group_id INTO v_plan_group FROM public.group_plans p WHERE p.id=NEW.plan_id; IF v_plan_group IS NULL OR v_plan_group<>NEW.group_id THEN RAISE EXCEPTION 'Activity plan does not belong to this group'; END IF; END IF; RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_validate_group_asset()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_creator_group uuid; BEGIN IF NEW.created_by IS NOT NULL THEN SELECT m.group_id INTO v_creator_group FROM public.members m WHERE m.id=NEW.created_by; IF v_creator_group IS NULL OR v_creator_group<>NEW.group_id THEN RAISE EXCEPTION 'Asset creator does not belong to this group'; END IF; END IF; RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_validate_group_milestone()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_creator_group uuid; v_plan_group uuid; v_document_group uuid; BEGIN IF NEW.created_by IS NOT NULL THEN SELECT m.group_id INTO v_creator_group FROM public.members m WHERE m.id=NEW.created_by; IF v_creator_group IS NULL OR v_creator_group<>NEW.group_id THEN RAISE EXCEPTION 'Milestone creator does not belong to this group'; END IF; END IF; IF NEW.plan_id IS NOT NULL THEN SELECT p.group_id INTO v_plan_group FROM public.group_plans p WHERE p.id=NEW.plan_id; IF v_plan_group IS NULL OR v_plan_group<>NEW.group_id THEN RAISE EXCEPTION 'Milestone plan does not belong to this group'; END IF; END IF; IF NEW.document_id IS NOT NULL THEN SELECT d.group_id INTO v_document_group FROM public.documents d WHERE d.id=NEW.document_id; IF v_document_group IS NULL OR v_document_group<>NEW.group_id THEN RAISE EXCEPTION 'Milestone document does not belong to this group'; END IF; END IF; RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_validate_group_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_creator_group uuid; BEGIN IF NEW.created_by IS NOT NULL THEN SELECT m.group_id INTO v_creator_group FROM public.members m WHERE m.id=NEW.created_by; IF v_creator_group IS NULL OR v_creator_group<>NEW.group_id THEN RAISE EXCEPTION 'Plan creator does not belong to this group'; END IF; END IF; RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.cl_validate_group_support_case()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_member_group uuid; v_approved_group uuid; v_created_group uuid; v_expense_group uuid; BEGIN SELECT m.group_id INTO v_member_group FROM public.members m WHERE m.id=NEW.member_id; IF v_member_group IS NULL THEN RAISE EXCEPTION 'Support member does not exist'; END IF; IF v_member_group<>NEW.group_id THEN RAISE EXCEPTION 'Support member does not belong to this group'; END IF; IF NEW.approved_by IS NOT NULL THEN SELECT m.group_id INTO v_approved_group FROM public.members m WHERE m.id=NEW.approved_by; IF v_approved_group IS NULL OR v_approved_group<>NEW.group_id THEN RAISE EXCEPTION 'Support approver does not belong to this group'; END IF; END IF; IF NEW.created_by IS NOT NULL THEN SELECT m.group_id INTO v_created_group FROM public.members m WHERE m.id=NEW.created_by; IF v_created_group IS NULL OR v_created_group<>NEW.group_id THEN RAISE EXCEPTION 'Support creator does not belong to this group'; END IF; END IF; IF NEW.expense_id IS NOT NULL THEN SELECT e.group_id INTO v_expense_group FROM public.expenses e WHERE e.id=NEW.expense_id; IF v_expense_group IS NULL OR v_expense_group<>NEW.group_id THEN RAISE EXCEPTION 'Support expense does not belong to this group'; END IF; END IF; IF NEW.status='paid' AND NEW.expense_id IS NULL THEN RAISE EXCEPTION 'Paid support cases must reference an expense'; END IF; RETURN NEW; END; $function$


CREATE OR REPLACE FUNCTION public.claim_member_account(p_membership_number text, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
  v_email text := lower(trim(coalesce(p_email,'')));
  v_number text := trim(coalesce(p_membership_number,''));
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if v_email = '' or v_number = '' then
    raise exception 'Membership number and email are required';
  end if;

  select * into v_member
  from public.members m
  where lower(coalesce(m.email,'')) = v_email
    and (m.membership_number = v_number or m.member_number = v_number)
    and m.auth_user_id is null
    and m.onboarding_status in ('pending','invited')
    and lower(coalesce(m.status,'active')) = 'active'
  limit 1;

  if not found then
    raise exception 'No pending member account matches those details';
  end if;

  if exists (select 1 from public.members m where m.auth_user_id = v_uid) then
    raise exception 'This login is already linked to a member';
  end if;

  update public.members
  set user_id = v_uid,
      auth_user_id = v_uid,
      onboarding_status = 'active',
      activated_at = coalesce(activated_at, now())
  where id = v_member.id;

  return jsonb_build_object(
    'success', true,
    'member_id', v_member.id,
    'group_id', v_member.group_id,
    'role', v_member.role,
    'name', v_member.name,
    'membership_number', v_member.membership_number
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.close_contribution_initiative(p_initiative_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_i public.contribution_initiatives; v_existing jsonb; v_claimed boolean;
BEGIN
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'close_initiative','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING
  RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN SELECT result INTO v_existing FROM private.contribution_initiative_requests WHERE request_id=p_request_id AND operation='close_initiative'; RETURN v_existing; END IF;

  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_i.status <> 'active' THEN RAISE EXCEPTION 'Initiative is not active'; END IF;
  UPDATE public.contribution_initiatives SET status='closed',updated_at=now() WHERE id=v_i.id;
  v_existing=jsonb_build_object('status','closed','initiative_id',v_i.id);
  UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_existing WHERE request_id=p_request_id AND operation='close_initiative';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.close_financial_month(p_group_id uuid, p_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_period public.financial_periods%rowtype;
  v_report jsonb;
  v_closing numeric;
  v_member_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_group_id IS NULL
     OR p_month IS NULL
     OR p_month !~ '^[0-9]{4}-[0-9]{2}$'
  THEN
    RAISE EXCEPTION 'Group and month YYYY-MM are required';
  END IF;

  IF NOT public.cl_user_has_role(
    p_group_id,
    ARRAY['admin','treasurer','secretary']::text[]
  ) THEN
    RAISE EXCEPTION
      'You are not authorized to close financial months for this group';
  END IF;

  PERFORM public.cl_2b_accounting_lock(p_group_id,p_month);

  SELECT fp.*
    INTO v_period
  FROM public.financial_periods fp
  WHERE fp.group_id=p_group_id
    AND fp.month=p_month
  FOR UPDATE;

  IF NOT FOUND THEN
    v_period := public.ensure_financial_period(
      p_group_id,p_month
    );
  END IF;

  IF lower(coalesce(v_period.status,'open'))='closed' THEN
    RAISE EXCEPTION
      'Financial month % is already closed',p_month;
  END IF;

  v_report := public.get_monthly_financial_report(
    p_group_id,p_month
  );

  v_closing :=
    coalesce((v_report->>'closing_balance')::numeric,0);

  UPDATE public.financial_periods
  SET closing_balance=v_closing,
      status='closed',
      closed_at=now(),
      closed_by=auth.uid()
  WHERE id=v_period.id;

  SELECT m.id
    INTO v_member_id
  FROM public.members m
  WHERE m.group_id=p_group_id
    AND (m.auth_user_id=auth.uid() OR m.user_id=auth.uid())
  ORDER BY
    CASE WHEN m.auth_user_id=auth.uid() THEN 0 ELSE 1 END,
    m.id
  LIMIT 1;

  INSERT INTO public.monthly_closings (
    group_id,closing_month,closed_by,closed_at,
    total_expected,total_collected,total_expenses,
    closing_balance,notes
  )
  VALUES (
    p_group_id,
    (p_month||'-01')::date,
    auth.uid(),
    now(),
    coalesce(
      (v_report->>'expected_monthly_contributions')::numeric,0
    ),
    coalesce(
      (v_report->>'total_contributions_collected')::numeric,0
    ),
    coalesce((v_report->>'approved_expenses')::numeric,0),
    v_closing,
    'Closed through CHAMA LIVE financial period.'
  )
  ON CONFLICT (group_id,closing_month)
  DO UPDATE SET
    closed_by=EXCLUDED.closed_by,
    closed_at=EXCLUDED.closed_at,
    total_expected=EXCLUDED.total_expected,
    total_collected=EXCLUDED.total_collected,
    total_expenses=EXCLUDED.total_expenses,
    closing_balance=EXCLUDED.closing_balance,
    notes=EXCLUDED.notes;

  RETURN public.get_monthly_financial_report(
    p_group_id,p_month
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.close_month(p_group_id uuid, p_month text, p_notes text DEFAULT NULL::text)
 RETURNS monthly_closings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_report jsonb;
  v_result public.monthly_closings;
BEGIN
  v_report := public.close_financial_month(p_group_id, p_month);

  IF p_notes IS NOT NULL THEN
    UPDATE public.monthly_closings
    SET notes = p_notes
    WHERE group_id = p_group_id
      AND closing_month = (p_month || '-01')::date;
  END IF;

  SELECT *
  INTO v_result
  FROM public.monthly_closings
  WHERE group_id = p_group_id
    AND closing_month = (p_month || '-01')::date
  LIMIT 1;

  RETURN v_result;
END;
$function$
