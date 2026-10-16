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
