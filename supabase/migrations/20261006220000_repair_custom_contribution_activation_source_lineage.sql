-- CHAMA LIVE
-- Repair: custom contribution parent obligations use period_id lineage.
-- economic_month remains generated and is omitted from the insert.
-- Production repair authorized 2026-10-06.

CREATE OR REPLACE FUNCTION public.activate_custom_contribution(p_group_id uuid, p_period_id uuid, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
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
end;$function$;