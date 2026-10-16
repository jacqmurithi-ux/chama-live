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
