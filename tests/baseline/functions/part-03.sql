-- STAGE ONLY: production function definitions; ordinal rows 21-30 of 201.
-- Definitions captured read-only on 2026-10-14. Ordering is alphabetical, NOT dependency order.
-- Owners, ACLs, views, triggers, types and dependent objects must be reconciled separately.

CREATE OR REPLACE FUNCTION public.activate_custom_contribution(p_group_id uuid, p_period_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auth_user_id uuid := auth.uid(); v_actor_member_id uuid;
  v_period public.contribution_periods%rowtype; v_obligation_count integer := 0;
  v_result jsonb; v_payload jsonb; v_hash text; v_existing_hash text; v_existing_result jsonb;
begin
  if v_auth_user_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if p_group_id is null or p_period_id is null or p_request_id is null then raise exception 'GROUP_PERIOD_AND_REQUEST_ID_REQUIRED' using errcode='22023'; end if;
  if not exists (select 1 from public.groups g where g.id=p_group_id and g.owner_user_id=v_auth_user_id)
     and not public.cl_user_has_role(p_group_id,array['chairperson']::text[]) then
    raise exception 'CUSTOM_CONTRIBUTION_NOT_AUTHORIZED' using errcode='42501';
  end if;
  select m.id into v_actor_member_id from public.members m
  where m.group_id=p_group_id and (m.user_id=v_auth_user_id or m.auth_user_id=v_auth_user_id)
    and lower(coalesce(m.status,'active'))='active' and lower(coalesce(m.onboarding_status,'active'))='active'
  order by m.id limit 1;
  if v_actor_member_id is null then raise exception 'ACTIVE_GROUP_MEMBER_REQUIRED' using errcode='42501'; end if;
  select * into v_period from public.contribution_periods where id=p_period_id and group_id=p_group_id for update;
  if not found then raise exception 'CUSTOM_CONTRIBUTION_PERIOD_NOT_FOUND' using errcode='22023'; end if;
  if v_period.contribution_type_id is null then raise exception 'CUSTOM_CONTRIBUTION_TYPE_REQUIRED' using errcode='22023'; end if;
  if v_period.status not in ('draft','open') then raise exception 'CUSTOM_CONTRIBUTION_PERIOD_NOT_ACTIVATABLE' using errcode='22023'; end if;
  v_payload:=jsonb_build_object('group_id',p_group_id,'period_id',p_period_id,'contribution_type_id',v_period.contribution_type_id);
  v_hash:=encode(extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('chama-live:custom-contribution-request:'||p_request_id::text||':activate',0));
  select r.payload_hash,r.result into v_existing_hash,v_existing_result from private.custom_contribution_activation_requests r where r.request_id=p_request_id for update;
  if v_existing_hash is not null then
    if v_existing_hash<>v_hash then raise exception 'REQUEST_ID_REUSE_MISMATCH' using errcode='22023'; end if;
    if v_existing_result is null then raise exception 'REQUEST_ALREADY_CLAIMED_WITHOUT_RESULT' using errcode='55000'; end if;
    return jsonb_set(v_existing_result,'{replayed}','true'::jsonb,true);
  end if;
  insert into private.custom_contribution_activation_requests(request_id,group_id,contribution_type_id,period_id,payload_hash)
  values(p_request_id,p_group_id,v_period.contribution_type_id,v_period.id,v_hash);
  perform public.cl_2b_accounting_lock_range(p_group_id,date_trunc('month',v_period.opening_date)::date,date_trunc('month',v_period.closing_date)::date);
  insert into public.member_contribution_rules(group_id,member_id,contribution_type_id,amount,frequency,effective_from,effective_to,first_period_rule,status,created_by)
  select m.group_id,m.id,v_period.contribution_type_id,v_period.amount,v_period.frequency,v_period.opening_date,v_period.closing_date,'full_period','active',v_actor_member_id
  from public.members m
  where m.group_id=p_group_id and lower(coalesce(m.status,'active'))='active' and lower(coalesce(m.onboarding_status,'active'))='active'
    and not exists(select 1 from public.member_contribution_rules r where r.group_id=m.group_id and r.member_id=m.id and r.contribution_type_id=v_period.contribution_type_id and r.effective_from=v_period.opening_date and r.effective_to=v_period.closing_date);
  insert into public.contribution_obligations(group_id,member_id,contribution_type_id,obligation_month,due_amount,period_id)
  select r.group_id,r.member_id,r.contribution_type_id,date_trunc('month',v_period.due_date)::date,r.amount,v_period.id
  from public.member_contribution_rules r
  where r.group_id=p_group_id and r.contribution_type_id=v_period.contribution_type_id and r.effective_from=v_period.opening_date and r.effective_to=v_period.closing_date and r.status='active'
    and not exists(select 1 from public.contribution_obligations o where o.group_id=r.group_id and o.member_id=r.member_id and o.contribution_type_id=r.contribution_type_id and o.obligation_month=date_trunc('month',v_period.due_date)::date and o.component_kind='PARENT');
  get diagnostics v_obligation_count=row_count;
  update public.contribution_periods set status='open' where id=v_period.id and group_id=p_group_id;
  v_result:=jsonb_build_object('ok',true,'operation','activate','replayed',false,'contribution_type_id',v_period.contribution_type_id,'period_id',v_period.id,'status','open','ongoing',true,'obligations_created',v_obligation_count);
  update private.custom_contribution_activation_requests set result=v_result,completed_at=now() where request_id=p_request_id;
  return v_result;
end;$function$


CREATE OR REPLACE FUNCTION public.activate_member_account(p_member_number text)
 RETURNS members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_member public.members;
begin
 if v_uid is null then raise exception 'Not authenticated'; end if;
 select * into v_member from public.members where member_number=trim(p_member_number) and onboarding_status='pending' limit 1;
 if v_member.id is null then raise exception 'Pending member account not found'; end if;
 if v_member.email is not null and exists(select 1 from auth.users where id=v_uid and lower(email)<>lower(v_member.email)) then raise exception 'This login email does not match the invited member email'; end if;
 update public.members set user_id=v_uid,auth_user_id=v_uid,onboarding_status='active',activated_at=now() where id=v_member.id returning * into v_member;
 return v_member;
end; $function$


CREATE OR REPLACE FUNCTION public.activate_other_contribution_cycle(p_cycle_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid:=auth.uid(); v_cycle public.contribution_periods%ROWTYPE;
  v_request private.other_contribution_cycle_requests%ROWTYPE;
  v_payload_hash text; v_expected_count bigint; v_actual_count bigint;
  v_collision_count bigint; v_missing_count bigint; v_extra_count bigint;
  v_existing_activation boolean; v_existing_generation boolean; v_snapshot jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_cycle_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Cycle id and request id are required';
  END IF;
  PERFORM private.cl_other_request_lock(p_request_id,'activate');
  v_payload_hash:=md5(jsonb_build_object('cycle_id',p_cycle_id)::text);
  SELECT * INTO v_request FROM private.other_contribution_cycle_requests r
  WHERE r.request_id=p_request_id AND r.operation='activate';
  IF FOUND THEN
    IF v_request.payload_hash<>v_payload_hash THEN
      RAISE EXCEPTION 'Activation request was previously used for another payload';
    END IF;
    IF v_request.completed_at IS NOT NULL AND v_request.result IS NOT NULL THEN
      RETURN v_request.result||jsonb_build_object('idempotent_replay',true);
    END IF;
  END IF;
  SELECT cp.* INTO v_cycle FROM public.contribution_periods cp WHERE cp.id=p_cycle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Other contribution cycle not found'; END IF;
  PERFORM private.cl_other_cycle_authorize(v_cycle.group_id);
  PERFORM private.cl_other_cycle_lock(v_cycle.group_id,v_cycle.contribution_type_id);
  SELECT cp.* INTO v_cycle FROM public.contribution_periods cp WHERE cp.id=p_cycle_id FOR UPDATE;
  PERFORM private.cl_other_assert_type(v_cycle.group_id,v_cycle.contribution_type_id);
  IF v_cycle.name IS NULL OR btrim(v_cycle.name)='' THEN RAISE EXCEPTION 'Cycle name required at activation'; END IF;
  IF v_cycle.amount IS NULL OR v_cycle.amount<=0 THEN RAISE EXCEPTION 'Cycle amount invalid at activation'; END IF;
  IF v_cycle.frequency NOT IN ('monthly','one_time') THEN RAISE EXCEPTION 'Cycle frequency invalid at activation'; END IF;
  IF v_cycle.period_key IS NULL OR btrim(v_cycle.period_key)='' OR length(btrim(v_cycle.period_key))>100 THEN
    RAISE EXCEPTION 'Cycle period key invalid at activation';
  END IF;
  IF v_cycle.opening_date IS NULL OR v_cycle.due_date IS NULL OR v_cycle.closing_date IS NULL
     OR v_cycle.opening_date>v_cycle.due_date OR v_cycle.due_date>v_cycle.closing_date THEN
    RAISE EXCEPTION 'Cycle dates invalid at activation';
  END IF;
  PERFORM private.cl_other_assert_fine_rule(
    v_cycle.group_id,v_cycle.contribution_type_id,v_cycle.fine_rule_id,
    v_cycle.opening_date,v_cycle.closing_date);

  IF v_cycle.status<>'draft' THEN
    IF v_cycle.status='cancelled' THEN RAISE EXCEPTION 'Cancelled cycle cannot be activated'; END IF;
    IF v_cycle.status NOT IN ('open','due','grace','closed') THEN
      RAISE EXCEPTION 'Cycle status % is not an activation state',v_cycle.status;
    END IF;
    SELECT EXISTS(SELECT 1 FROM private.other_contribution_cycle_audit a
                  WHERE a.cycle_id=v_cycle.id AND a.action='CYCLE_ACTIVATED'),
           EXISTS(SELECT 1 FROM private.other_contribution_cycle_audit a
                  WHERE a.cycle_id=v_cycle.id AND a.action='CYCLE_OBLIGATIONS_GENERATED')
      INTO v_existing_activation,v_existing_generation;
    SELECT a.details->'eligible_member_ids' INTO v_snapshot
    FROM private.other_contribution_cycle_audit a
    WHERE a.cycle_id=v_cycle.id AND a.action='CYCLE_OBLIGATIONS_GENERATED'
    ORDER BY a.created_at LIMIT 1;
    SELECT count(*) INTO v_expected_count
    FROM jsonb_array_elements_text(coalesce(v_snapshot,'[]'::jsonb));
    SELECT count(*) INTO v_actual_count
    FROM public.contribution_obligations o
    WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
      AND o.contribution_type_id=v_cycle.contribution_type_id
      AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL;
    IF NOT v_existing_activation OR NOT v_existing_generation OR v_snapshot IS NULL
       OR v_expected_count<>v_actual_count THEN
      RAISE EXCEPTION 'Activated cycle % is not canonically complete',v_cycle.id;
    END IF;
    IF EXISTS(SELECT 1 FROM(
      SELECT o.member_id::text member_id FROM public.contribution_obligations o
      WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
        AND o.contribution_type_id=v_cycle.contribution_type_id
        AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL
      EXCEPT SELECT jsonb_array_elements_text(v_snapshot)) s)
       OR EXISTS(SELECT 1 FROM(
      SELECT jsonb_array_elements_text(v_snapshot) member_id
      EXCEPT SELECT o.member_id::text FROM public.contribution_obligations o
      WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
        AND o.contribution_type_id=v_cycle.contribution_type_id
        AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL
    ) s) THEN
      RAISE EXCEPTION 'Activated cycle % has a frozen eligibility/member-set mismatch',v_cycle.id;
    END IF;
    IF EXISTS(SELECT 1 FROM public.contribution_obligations o
              WHERE o.period_id=v_cycle.id
                AND (o.group_id IS DISTINCT FROM v_cycle.group_id
                  OR o.contribution_type_id IS DISTINCT FROM v_cycle.contribution_type_id
                  OR o.component_kind IS DISTINCT FROM 'PARENT'
                  OR o.parent_obligation_id IS NOT NULL OR o.rule_id IS NOT NULL
                  OR o.obligation_month IS DISTINCT FROM date_trunc('month',v_cycle.opening_date)::date
                  OR o.economic_month IS DISTINCT FROM date_trunc('month',v_cycle.opening_date)::date
                  OR o.due_amount IS DISTINCT FROM v_cycle.amount)) THEN
      RAISE EXCEPTION 'Activated cycle contains invalid obligation identity';
    END IF;
    INSERT INTO private.other_contribution_cycle_requests(
      request_id,operation,cycle_id,group_id,payload_hash,result,completed_at)
    VALUES(p_request_id,'activate',v_cycle.id,v_cycle.group_id,v_payload_hash,
           jsonb_build_object('ok',true,'cycle_id',v_cycle.id,'group_id',v_cycle.group_id,
                              'status',v_cycle.status,'expected_members',v_expected_count,
                              'created_parents',v_actual_count,'idempotent_replay',true,
                              'cycle_level_idempotent',true),now())
    ON CONFLICT(request_id,operation) DO UPDATE
      SET cycle_id=EXCLUDED.cycle_id,group_id=EXCLUDED.group_id,
          payload_hash=EXCLUDED.payload_hash,result=EXCLUDED.result,
          completed_at=EXCLUDED.completed_at;
    RETURN jsonb_build_object('ok',true,'cycle_id',v_cycle.id,'group_id',v_cycle.group_id,
                              'status',v_cycle.status,'expected_members',v_expected_count,
                              'created_parents',v_actual_count,'idempotent_replay',true,
                              'cycle_level_idempotent',true);
  END IF;

  IF EXISTS(SELECT 1 FROM public.contribution_periods cp
            WHERE cp.id<>v_cycle.id AND cp.group_id=v_cycle.group_id
              AND cp.contribution_type_id=v_cycle.contribution_type_id
              AND lower(cp.status) IN ('scheduled','open','due','grace')
              AND cp.opening_date<=v_cycle.closing_date AND cp.closing_date>=v_cycle.opening_date) THEN
    RAISE EXCEPTION 'Another active/scheduled Other cycle overlaps this cycle';
  END IF;

  PERFORM 1 FROM public.members m
  WHERE m.group_id=v_cycle.group_id
    AND lower(coalesce(m.status,''))='active'
    AND lower(coalesce(m.onboarding_status,''))='active'
    AND m.join_date<=v_cycle.opening_date
  ORDER BY m.id FOR UPDATE;

  SELECT count(*) INTO v_expected_count FROM public.members m
  WHERE m.group_id=v_cycle.group_id
    AND lower(coalesce(m.status,''))='active'
    AND lower(coalesce(m.onboarding_status,''))='active'
    AND m.join_date<=v_cycle.opening_date;

  SELECT count(*) INTO v_collision_count FROM public.contribution_obligations o
  WHERE o.period_id=v_cycle.id;
  IF v_collision_count>v_expected_count THEN
    RAISE EXCEPTION 'Cycle has more obligations than eligible members';
  END IF;

  IF EXISTS(SELECT 1 FROM public.contribution_obligations o
            WHERE o.period_id=v_cycle.id
              AND (o.group_id IS DISTINCT FROM v_cycle.group_id
                OR o.contribution_type_id IS DISTINCT FROM v_cycle.contribution_type_id
                OR o.component_kind IS DISTINCT FROM 'PARENT'
                OR o.parent_obligation_id IS NOT NULL OR o.rule_id IS NOT NULL
                OR o.obligation_month IS DISTINCT FROM date_trunc('month',v_cycle.opening_date)::date
                OR o.economic_month IS DISTINCT FROM date_trunc('month',v_cycle.opening_date)::date
                OR o.due_amount IS DISTINCT FROM v_cycle.amount)) THEN
    RAISE EXCEPTION 'Cycle contains unexpected obligation identity';
  END IF;

  INSERT INTO public.contribution_obligations(
    group_id,member_id,obligation_month,due_amount,contribution_type_id,rule_id,
    period_id,component_kind,lifecycle_state,parent_obligation_id)
  SELECT v_cycle.group_id,m.id,date_trunc('month',v_cycle.opening_date)::date,v_cycle.amount,
         v_cycle.contribution_type_id,NULL,v_cycle.id,'PARENT','ACTIVE',NULL
  FROM public.members m
  WHERE m.group_id=v_cycle.group_id
    AND lower(coalesce(m.status,''))='active'
    AND lower(coalesce(m.onboarding_status,''))='active'
    AND m.join_date<=v_cycle.opening_date
    AND NOT EXISTS(SELECT 1 FROM public.contribution_obligations o
                   WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
                     AND o.member_id=m.id AND o.contribution_type_id=v_cycle.contribution_type_id
                     AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL
                     AND o.rule_id IS NULL);

  PERFORM 1 FROM public.contribution_obligations o
  WHERE o.period_id=v_cycle.id AND o.group_id=v_cycle.group_id
    AND o.contribution_type_id=v_cycle.contribution_type_id
    AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL
  ORDER BY o.member_id,o.id FOR UPDATE;

  SELECT count(*) INTO v_actual_count FROM public.contribution_obligations o
  WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
    AND o.contribution_type_id=v_cycle.contribution_type_id
    AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL;

  SELECT count(*) INTO v_missing_count FROM(
    SELECT m.id FROM public.members m
    WHERE m.group_id=v_cycle.group_id AND lower(coalesce(m.status,''))='active'
      AND lower(coalesce(m.onboarding_status,''))='active' AND m.join_date<=v_cycle.opening_date
    EXCEPT SELECT o.member_id FROM public.contribution_obligations o
    WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
      AND o.contribution_type_id=v_cycle.contribution_type_id
      AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL) s;
  SELECT count(*) INTO v_extra_count FROM(
    SELECT o.member_id FROM public.contribution_obligations o
    WHERE o.group_id=v_cycle.group_id AND o.period_id=v_cycle.id
      AND o.contribution_type_id=v_cycle.contribution_type_id
      AND o.component_kind='PARENT' AND o.parent_obligation_id IS NULL AND o.rule_id IS NULL
    EXCEPT SELECT m.id FROM public.members m
    WHERE m.group_id=v_cycle.group_id AND lower(coalesce(m.status,''))='active'
      AND lower(coalesce(m.onboarding_status,''))='active' AND m.join_date<=v_cycle.opening_date) s;
  IF v_expected_count<>v_actual_count OR v_missing_count<>0 OR v_extra_count<>0 THEN
    RAISE EXCEPTION 'Other cycle conservation failed: expected %, actual %, missing %, extra %',
      v_expected_count,v_actual_count,v_missing_count,v_extra_count;
  END IF;

  INSERT INTO private.other_contribution_cycle_requests(
    request_id,operation,cycle_id,group_id,payload_hash,result,completed_at)
  VALUES(p_request_id,'activate',v_cycle.id,v_cycle.group_id,v_payload_hash,
         jsonb_build_object('ok',true,'cycle_id',v_cycle.id,'group_id',v_cycle.group_id,
                            'status','open','expected_members',v_expected_count,
                            'created_parents',v_actual_count,'idempotent_replay',false,
                            'cycle_level_idempotent',false),now())
  ON CONFLICT(request_id,operation) DO UPDATE
    SET cycle_id=EXCLUDED.cycle_id,group_id=EXCLUDED.group_id,
        payload_hash=EXCLUDED.payload_hash,result=EXCLUDED.result,
        completed_at=EXCLUDED.completed_at;

  INSERT INTO private.other_contribution_cycle_audit(
    cycle_id,group_id,action,actor_user_id,request_id,request_operation,details)
  VALUES(v_cycle.id,v_cycle.group_id,'CYCLE_OBLIGATIONS_GENERATED',v_actor,p_request_id,'activate',
         jsonb_build_object('expected_members',v_expected_count,'created_parents',v_actual_count,
                            'missing_members',v_missing_count,'extra_members',v_extra_count,
                            'eligible_member_ids',(
                              SELECT coalesce(jsonb_agg(m.id ORDER BY m.id),'[]'::jsonb)
                              FROM public.members m
                              WHERE m.group_id=v_cycle.group_id
                                AND lower(coalesce(m.status,''))='active'
                                AND lower(coalesce(m.onboarding_status,''))='active'
                                AND m.join_date<=v_cycle.opening_date)));

  INSERT INTO private.other_contribution_cycle_audit(
    cycle_id,group_id,action,actor_user_id,request_id,request_operation,details)
  VALUES(v_cycle.id,v_cycle.group_id,'CYCLE_ACTIVATED',v_actor,p_request_id,'activate',
         jsonb_build_object('previous_status',v_cycle.status,'new_status','open',
                            'expected_members',v_expected_count,'created_parents',v_actual_count));

  UPDATE public.contribution_periods SET status='open'
  WHERE id=v_cycle.id AND status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cycle could not transition draft to open'; END IF;

  RETURN jsonb_build_object('ok',true,'cycle_id',v_cycle.id,'group_id',v_cycle.group_id,
                            'status','open','expected_members',v_expected_count,
                            'created_parents',v_actual_count,'idempotent_replay',false,
                            'cycle_level_idempotent',false);
END $function$


CREATE OR REPLACE FUNCTION public.activate_recurring_contribution_initiative(p_initiative_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_i public.contribution_initiatives; v_count integer; v_existing jsonb; v_claimed boolean;
  v_request jsonb; v_request_initiative_id uuid; v_request_group_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request id is required'; END IF;
  SELECT * INTO v_i FROM public.contribution_initiatives WHERE id=p_initiative_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Initiative not found'; END IF;
  IF NOT public.can_manage_members(v_i.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO private.contribution_initiative_requests(request_id,operation,result)
  VALUES(p_request_id,'activate_recurring_initiative','{}'::jsonb)
  ON CONFLICT(request_id,operation) DO NOTHING RETURNING true INTO v_claimed;
  IF NOT coalesce(v_claimed,false) THEN
    SELECT result,initiative_id,group_id INTO v_request,v_request_initiative_id,v_request_group_id
    FROM private.contribution_initiative_requests
    WHERE request_id=p_request_id AND operation='activate_recurring_initiative' FOR UPDATE;
    IF v_request_initiative_id IS DISTINCT FROM v_i.id OR v_request_group_id IS DISTINCT FROM v_i.group_id THEN
      RAISE EXCEPTION 'Request id is already bound to another initiative';
    END IF;
    RETURN v_request || jsonb_build_object('idempotent',true);
  END IF;
  IF v_i.frequency <> 'monthly' THEN RAISE EXCEPTION 'Initiative is not monthly'; END IF;
  IF v_i.status <> 'draft' THEN RAISE EXCEPTION 'Initiative is not draft'; END IF;
  IF current_date > v_i.closing_date THEN RAISE EXCEPTION 'Initiative closing date has passed'; END IF;
  SELECT count(*) INTO v_count FROM public.contribution_initiative_members im
  WHERE im.initiative_id=v_i.id AND lower(coalesce(im.status,'active'))='active';
  IF v_count=0 THEN RAISE EXCEPTION 'Recurring initiative requires at least one active participant'; END IF;
  IF EXISTS (SELECT 1 FROM public.contribution_initiative_members im
    WHERE im.initiative_id=v_i.id AND lower(coalesce(im.status,'active'))='active'
      AND NOT EXISTS (SELECT 1 FROM public.contribution_initiative_member_terms t
        WHERE t.initiative_member_id=im.id
          AND t.effective_from <= (date_trunc('month',v_i.start_date)::date + CASE WHEN v_i.start_date > date_trunc('month',v_i.start_date)::date THEN interval '1 month' ELSE interval '0 month' END)
          AND t.status='active'))
  THEN RAISE EXCEPTION 'Every active recurring participant requires an effective term'; END IF;
  UPDATE public.contribution_initiatives SET status='active',updated_at=now() WHERE id=v_i.id;
  v_existing=jsonb_build_object('status','active','initiative_id',v_i.id,'participant_count',v_count);
  UPDATE private.contribution_initiative_requests SET initiative_id=v_i.id,group_id=v_i.group_id,result=v_existing
  WHERE request_id=p_request_id AND operation='activate_recurring_initiative';
  RETURN v_existing;
END;
$function$


CREATE OR REPLACE FUNCTION public.add_group_member(p_group_id uuid, p_name text, p_member_number text DEFAULT NULL::text, p_membership_number text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_role text DEFAULT 'member'::text, p_join_date date DEFAULT CURRENT_DATE)
 RETURNS members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_member public.members;
  v_role text;
  v_member_number text;
  v_membership_number text;
  v_next_number integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT lower(m.role)
    INTO v_role
  FROM public.members m
  WHERE m.group_id = p_group_id
    AND (m.user_id = (SELECT auth.uid()) OR m.auth_user_id = (SELECT auth.uid()))
    AND lower(coalesce(m.status,'active')) = 'active'
    AND lower(coalesce(m.onboarding_status,'active')) = 'active'
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('admin','chairperson') THEN
    RAISE EXCEPTION 'Only a group admin or chairperson can add members';
  END IF;

  IF nullif(trim(p_name),'') IS NULL THEN
    RAISE EXCEPTION 'Member name is required';
  END IF;

  IF nullif(trim(p_phone),'') IS NULL THEN
    RAISE EXCEPTION 'Phone number is required';
  END IF;

  IF lower(coalesce(p_role,'member')) NOT IN ('member','secretary','treasurer','chairperson','admin') THEN
    RAISE EXCEPTION 'Invalid member role';
  END IF;

  -- Generate the next 4-digit member number when the frontend does not supply one.
  IF nullif(trim(p_member_number),'') IS NULL THEN
    SELECT coalesce(max(NULLIF(regexp_replace(m.member_number, '[^0-9]', '', 'g'), '')::integer), 0) + 1
      INTO v_next_number
    FROM public.members m
    WHERE m.group_id = p_group_id;

    v_member_number := lpad(v_next_number::text, 4, '0');
  ELSE
    v_member_number := trim(p_member_number);
  END IF;

  -- Keep membership_number synchronized with member_number when omitted.
  v_membership_number := coalesce(nullif(trim(p_membership_number), ''), v_member_number);

  IF EXISTS (
    SELECT 1
    FROM public.members m
    WHERE m.group_id = p_group_id
      AND (
        m.member_number = v_member_number
        OR m.membership_number = v_membership_number
      )
  ) THEN
    RAISE EXCEPTION 'Member number or membership number already exists in this group';
  END IF;

  INSERT INTO public.members (
    group_id,
    member_number,
    membership_number,
    name,
    phone,
    email,
    role,
    join_date,
    status,
    onboarding_status,
    invited_at
  )
  VALUES (
    p_group_id,
    v_member_number,
    v_membership_number,
    trim(p_name),
    trim(p_phone),
    nullif(trim(p_email),''),
    lower(coalesce(p_role,'member')),
    coalesce(p_join_date,current_date),
    'active',
    'pending',
    now()
  )
  RETURNING * INTO v_member;

  PERFORM private.append_platform_activity(
      'member_created',
      jsonb_build_object(
          'group_id', v_member.group_id,
          'member_id', v_member.id,
          'member_role', v_member.role
      )
  );

  RETURN v_member;
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_renew_subscription(p_subscription_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_subscription public.group_subscriptions%ROWTYPE;
    v_latest_cycle public.subscription_cycles%ROWTYPE;
    v_current_cycle public.subscription_cycles%ROWTYPE;
    v_run_id uuid;
    v_attempt record;
    v_key text;
    v_return_cycle_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Platform administrator privileges required' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('chama_live_subscription:' || p_subscription_id::text, 0)
    );

    SELECT * INTO v_subscription
    FROM public.group_subscriptions
    WHERE id = p_subscription_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription % does not exist', p_subscription_id USING ERRCODE = 'P0002';
    END IF;

    IF v_subscription.status <> 'active' THEN
        RAISE EXCEPTION 'Subscription % is not active', p_subscription_id USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_latest_cycle
    FROM public.subscription_cycles
    WHERE subscription_id = p_subscription_id
    ORDER BY cycle_number DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription % has no existing cycle', p_subscription_id USING ERRCODE = 'P0001';
    END IF;

    v_key := 'human:' || p_subscription_id::text || ':' || v_latest_cycle.id::text;

    SELECT rr.run_id INTO v_run_id
    FROM private.renewal_runs rr
    WHERE rr.idempotency_key = v_key;

    IF NOT FOUND THEN
        INSERT INTO private.renewal_runs(execution_source, idempotency_key)
        VALUES ('human', v_key)
        RETURNING run_id INTO v_run_id;
    END IF;

    SELECT * INTO v_attempt
    FROM private.renew_subscription_authority(
        p_subscription_id,
        v_latest_cycle.id,
        v_run_id,
        v_key,
        'human'
    );

    UPDATE private.renewal_runs
    SET status = 'completed',
        completed_at = now(),
        error_code = CASE WHEN v_attempt.result = 'failed' THEN v_attempt.error_code ELSE NULL END,
        error_message = CASE WHEN v_attempt.result = 'failed' THEN v_attempt.error_message ELSE NULL END
    WHERE run_id = v_run_id
      AND status = 'running';

    IF v_attempt.result IN ('renewed','already_renewed') THEN
        SELECT id INTO v_return_cycle_id
        FROM public.subscription_cycles
        WHERE subscription_id = p_subscription_id
          AND cycle_number = v_attempt.cycle_after
        LIMIT 1;

        IF v_return_cycle_id IS NULL THEN
            RAISE EXCEPTION 'Renewal result did not resolve a cycle id' USING ERRCODE = 'P0001';
        END IF;

        IF v_attempt.result = 'renewed' THEN
            PERFORM private.append_platform_activity(
                'subscription_renewed',
                jsonb_build_object(
                    'subscription_id', p_subscription_id,
                    'cycle_id', v_return_cycle_id
                )
            );
        END IF;

        RETURN v_return_cycle_id;
    END IF;

    IF v_attempt.result = 'not_due' THEN
        RAISE EXCEPTION 'Subscription cycle % has not ended', v_latest_cycle.cycle_number USING ERRCODE = 'P0001';
    END IF;

    RAISE EXCEPTION 'Subscription renewal failed or was anomalous: %',
        coalesce(v_attempt.error_message, 'unknown renewal result') USING ERRCODE = 'P0001';
END;
$function$


CREATE OR REPLACE FUNCTION public.approve_group_application(p_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    a public.group_applications%ROWTYPE;
    v_group_id uuid;
    v_member_id uuid;
    v_member_number text;
    v_access_code text;
    v_subscription_id uuid;
    v_cycle_id uuid;
    v_activated_at timestamptz;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Platform administrator access required'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO a
    FROM public.group_applications
    WHERE id = p_application_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
    IF a.status = 'approved' THEN RAISE EXCEPTION 'Application is already approved'; END IF;
    IF a.status = 'rejected' THEN RAISE EXCEPTION 'Rejected applications cannot be approved'; END IF;

    IF nullif(btrim(coalesce(a.location, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Application location is required';
    END IF;

    IF nullif(btrim(coalesce(a.town, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Application town is required';
    END IF;

    v_activated_at := now();
    v_access_code := public.generate_group_access_code(a.group_name);

    INSERT INTO public.groups (
        name, category, monthly_contribution, opening_balance, description,
        country, location, town, access_code, phone, email, owner_user_id
    )
    VALUES (
        a.group_name, coalesce(a.category, 'other'), 0, 0, a.description,
        coalesce(a.country, 'Kenya'), btrim(a.location), btrim(a.town),
        v_access_code, a.admin_phone, a.email, a.auth_user_id
    )
    RETURNING id INTO v_group_id;

    SELECT lpad(
        (coalesce(max(nullif(membership_number, '')::integer), 0) + 1)::text,
        4, '0'
    )
    INTO v_member_number
    FROM public.members
    WHERE group_id = v_group_id;

    INSERT INTO public.members (
        group_id, user_id, auth_user_id, member_number, membership_number,
        name, phone, email, role, status, onboarding_status, invited_at, activated_at
    )
    VALUES (
        v_group_id, a.auth_user_id, a.auth_user_id, v_member_number,
        v_member_number, a.admin_name, a.admin_phone, a.email, 'admin',
        'active', 'active', v_activated_at, v_activated_at
    )
    RETURNING id INTO v_member_id;

    INSERT INTO public.contribution_types (group_id, name, code, created_by)
    SELECT v_group_id, 'Monthly', 'monthly', v_member_id
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.contribution_types ct
        WHERE ct.group_id = v_group_id
          AND (
              lower(trim(ct.name)) = 'monthly'
              OR lower(trim(coalesce(ct.code, ''))) = 'monthly'
          )
    );

    INSERT INTO public.financial_periods (group_id, month, opening_balance, status)
    VALUES (v_group_id, to_char(v_activated_at::date, 'YYYY-MM'), 0, 'open');

    v_subscription_id := private.initialize_group_subscription(v_group_id, v_activated_at);
    v_cycle_id := private.create_next_subscription_cycle(v_subscription_id);
    PERFORM public.create_subscription_invoice(v_cycle_id);

    IF NOT EXISTS (
        SELECT 1 FROM public.subscription_cycles sc
        WHERE sc.id = v_cycle_id
          AND sc.subscription_id = v_subscription_id
          AND sc.cycle_number = 1
    ) THEN
        RAISE EXCEPTION 'Subscription initialization failed to create Cycle 1';
    END IF;

    UPDATE public.group_applications
    SET status = 'approved',
        reviewed_at = v_activated_at,
        reviewed_by = auth.uid(),
        updated_at = v_activated_at,
        approved_group_id = v_group_id,
        approved_member_id = v_member_id,
        approved_member_number = v_member_number,
        access_code = v_access_code
    WHERE id = p_application_id;

    PERFORM private.append_platform_activity(
        'group_application_reviewed',
        jsonb_build_object('application_id', a.id, 'group_name', a.group_name)
    );

    PERFORM private.append_platform_activity(
        'group_approved',
        jsonb_build_object(
            'application_id', a.id, 'group_id', v_group_id,
            'group_name', a.group_name, 'location', a.location, 'town', a.town
        )
    );

    PERFORM private.append_platform_activity(
        'group_created',
        jsonb_build_object(
            'application_id', a.id, 'group_id', v_group_id,
            'group_name', a.group_name, 'location', a.location, 'town', a.town
        )
    );

    PERFORM private.append_platform_activity(
        'member_created',
        jsonb_build_object(
            'application_id', a.id, 'group_id', v_group_id,
            'member_id', v_member_id, 'member_role', 'admin'
        )
    );

    RETURN jsonb_build_object(
        'success', true, 'application_id', a.id, 'group_id', v_group_id,
        'member_id', v_member_id, 'member_number', v_member_number,
        'access_code', v_access_code, 'role', 'admin', 'email', a.email,
        'admin_name', a.admin_name, 'group_name', a.group_name
    );
END;
$function$


CREATE OR REPLACE FUNCTION public.can_add_group_members(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    public.current_user_role(p_group_id) IN ('admin', 'chairperson', 'treasurer'),
    false
  );
$function$


CREATE OR REPLACE FUNCTION public.can_manage_members(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.current_user_role(p_group_id) in ('admin','chairperson'), false);
$function$


CREATE OR REPLACE FUNCTION public.charge_payments_guard_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Charge payment allocations are immutable';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Charge payment allocations are immutable';
    END IF;

    RETURN NEW;
END;
$function$
