-- Paid Through parity with Add Member: record genuine historical payments
-- only after a different Treasurer approves, using canonical accounting RPCs.
begin;
alter table private.member_accounting_initialization_requests add column if not exists payment_method text;
alter table private.member_accounting_initialization_requests drop constraint if exists member_accounting_initialization_payment_method_check;
alter table private.member_accounting_initialization_requests add constraint member_accounting_initialization_payment_method_check check (payment_method is null or payment_method in ('M-Pesa','Cash','Bank transfer'));
drop function public.request_member_accounting_initialization(uuid,uuid,numeric,date,date);
CREATE OR REPLACE FUNCTION public.request_member_accounting_initialization(p_request_id uuid, p_member_id uuid, p_monthly_amount numeric, p_effective_from date, p_paid_through date, p_payment_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_preview jsonb;
  v_group_id uuid;
  v_actor uuid := auth.uid();
  v_actor_member_id uuid;
  v_hash text;
  v_existing private.member_accounting_initialization_requests%rowtype;
  v_inserted integer := 0;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'Request id is required' using errcode='22023'; end if;
  if p_member_id is null then raise exception 'Member id is required' using errcode='22023'; end if;

  select m.group_id into strict v_group_id
  from public.members m where m.id = p_member_id;

  if not public.can_manage_members(v_group_id) then
    raise exception 'Member-management authorization required' using errcode='42501';
  end if;

  select m.id into v_actor_member_id
  from public.members m
  where m.group_id = v_group_id
    and (m.auth_user_id = v_actor or m.user_id = v_actor)
    and lower(coalesce(m.status,'active')) = 'active'
    and lower(coalesce(m.onboarding_status,'active')) = 'active'
  order by m.id limit 1;
  if v_actor_member_id is null then
    raise exception 'Active official membership required' using errcode='42501';
  end if;

  if p_paid_through is not null and p_payment_method not in ('M-Pesa','Cash','Bank transfer') then
    raise exception 'A valid payment method is required when Paid Through is set' using errcode='22023';
  end if;
  if p_paid_through is null then p_payment_method := null; end if;

  v_hash := pg_catalog.md5(jsonb_build_object(
    'member_id',p_member_id,'monthly_amount',p_monthly_amount,
    'effective_from',p_effective_from,'paid_through',p_paid_through,'payment_method',p_payment_method
  )::text);

  -- Replay is checked before preview because a successful approval creates the rule
  -- that would otherwise make preview reject the same request on a retry.
  select * into v_existing
  from private.member_accounting_initialization_requests
  where request_id = p_request_id
  for update;

  if found then
    if v_existing.payload_hash <> v_hash then
      raise exception 'IDEMPOTENCY_CONFLICT: request id reused with different inputs';
    end if;
    if v_existing.requested_by_member_id <> v_actor_member_id then
      raise exception 'Request id belongs to a different requester' using errcode='42501';
    end if;
    return jsonb_build_object(
      'success',true,'idempotent_replay',true,'request_id',p_request_id,
      'status',v_existing.status,'result',v_existing.result,
      'message',case when v_existing.status='pending'
        then 'This request is already awaiting approval.'
        else 'This request has already been processed.' end
    );
  end if;

  if exists (
    select 1 from private.member_accounting_initialization_requests r
    where r.group_id=v_group_id and r.member_id=p_member_id and r.status='pending'
  ) then
    raise exception 'An initialization request is already pending for this member';
  end if;

  v_preview := public.preview_member_accounting_initialization(
    p_member_id, p_monthly_amount, p_effective_from, p_paid_through
  );

  insert into private.member_accounting_initialization_requests(
    request_id,group_id,member_id,requested_by_member_id,monthly_amount,
    effective_from,paid_through,payment_method,payload_hash
  ) values (
    p_request_id,v_group_id,p_member_id,v_actor_member_id,p_monthly_amount,
    p_effective_from,p_paid_through,p_payment_method,v_hash
  ) on conflict (request_id) do nothing;
  get diagnostics v_inserted = row_count;

  select * into strict v_existing
  from private.member_accounting_initialization_requests
  where request_id = p_request_id for update;

  if v_existing.payload_hash <> v_hash then
    raise exception 'IDEMPOTENCY_CONFLICT: request id reused with different inputs';
  end if;
  if v_existing.requested_by_member_id <> v_actor_member_id then
    raise exception 'Request id belongs to a different requester' using errcode='42501';
  end if;

  if v_existing.status = 'approved' then
    return jsonb_build_object('success',true,'idempotent_replay',true,'request_id',p_request_id,'status',v_existing.status,'result',v_existing.result);
  end if;

  if v_inserted > 0 then
    insert into private.member_accounting_initialization_audit(
      request_id,group_id,member_id,actor_member_id,action,details
    ) values (p_request_id,v_group_id,p_member_id,v_actor_member_id,'requested',v_preview);
  end if;

  return jsonb_build_object(
    'success',true,'request_id',p_request_id,'status',v_existing.status,
    'idempotent_replay',(v_inserted = 0),'preview',v_preview,
    'message','Pending approval by a different authorized group official.'
  );
end;
$function$;
grant execute on function public.request_member_accounting_initialization(uuid,uuid,numeric,date,date,text) to authenticated;
CREATE OR REPLACE FUNCTION public.approve_member_accounting_initialization(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_request private.member_accounting_initialization_requests%rowtype;
  v_actor uuid := auth.uid();
  v_approver_member_id uuid;
  v_monthly_type_id uuid;
  v_join_date date;
  v_first_historical_month date;
  v_historical_last_month date;
  v_current_month date;
  v_closed_month text;
  v_result jsonb;
  v_reconcile record;
  v_payment_method text;
  v_payment_date date;
  v_payment_id uuid;
  v_historical_payment_count integer := 0;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into strict v_request
  from private.member_accounting_initialization_requests
  where request_id = p_request_id for update;

  -- Authenticate and authorize every replay too; do not leak stored results to
  -- callers who no longer have access to this group's member-management workflow.
  select m.id into v_approver_member_id
  from public.members m
  where m.group_id = v_request.group_id
    and (m.auth_user_id = v_actor or m.user_id = v_actor)
    and lower(coalesce(m.status,'active')) = 'active'
    and lower(coalesce(m.onboarding_status,'active')) = 'active'
  order by m.id limit 1;

  if v_approver_member_id is null or public.current_user_role(v_request.group_id) is distinct from 'treasurer' then
    raise exception 'Authorized group official required' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.members target
    where target.id=v_request.member_id and target.group_id=v_request.group_id
      and lower(trim(coalesce(target.role,'')))='admin'
  ) then
    raise exception 'Accounting initialization is limited to members with the admin security role';
  end if;

  if v_request.status = 'approved' then
    return jsonb_build_object('success',true,'idempotent_replay',true,'request_id',p_request_id,'result',v_request.result);
  end if;
  if v_request.status <> 'pending' then raise exception 'Request is not pending approval'; end if;
  if v_approver_member_id = v_request.requested_by_member_id then
    raise exception 'A different group official must approve this request' using errcode='42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chama-live:member-accounting-init:'||v_request.group_id::text||':'||v_request.member_id::text,0)
  );

  if not exists (select 1 from public.members m where m.id=v_request.member_id and m.group_id=v_request.group_id) then
    raise exception 'Member does not belong to the request group';
  end if;

  if exists (
    select 1 from public.member_contribution_rules r
    join public.contribution_types ct on ct.id=r.contribution_type_id
    where r.group_id=v_request.group_id and r.member_id=v_request.member_id
      and (ct.code='monthly' or lower(trim(ct.name))='monthly')
  ) then
    raise exception 'Member already has a Monthly rule; no changes were applied';
  end if;

  select m.join_date into v_join_date
  from public.members m where m.id=v_request.member_id and m.group_id=v_request.group_id;
  if v_request.effective_from < coalesce(v_join_date,v_request.effective_from) then
    raise exception 'Monthly start date cannot precede the member join date';
  end if;

  if not exists (
    select 1 from public.members target
    where target.id=v_request.member_id and target.group_id=v_request.group_id
      and lower(trim(coalesce(target.role,'')))='admin'
  ) then
    raise exception 'Accounting initialization is limited to members with the admin security role';
  end if;

  -- Do not mutate obligations in a closed period.
  v_first_historical_month := date_trunc('month',v_request.effective_from)::date;
  v_historical_last_month := date_trunc('month',current_date)::date;
  perform public.cl_2b_accounting_lock_range(v_request.group_id,v_first_historical_month,v_historical_last_month);
  select fp.month into v_closed_month
  from public.financial_periods fp
  where fp.group_id=v_request.group_id
    and fp.month >= to_char(v_first_historical_month,'YYYY-MM')
    and fp.month <= to_char(v_historical_last_month,'YYYY-MM')
    and lower(coalesce(fp.status,'open'))='closed'
  order by fp.month limit 1;
  if v_closed_month is not null then
    raise exception 'Financial month % is closed. Reopen it through the approved finance process before initialization.',v_closed_month;
  end if;

  select ct.id into strict v_monthly_type_id
  from public.contribution_types ct
  where ct.group_id=v_request.group_id and (ct.code='monthly' or lower(trim(ct.name))='monthly')
  order by case when ct.code='monthly' then 0 else 1 end, ct.created_at, ct.id
  limit 1;

  insert into public.member_contribution_rules(
    group_id,member_id,contribution_type_id,amount,frequency,effective_from,
    effective_to,first_period_rule,status,created_by
  ) values (
    v_request.group_id,v_request.member_id,v_monthly_type_id,v_request.monthly_amount,
    'monthly',v_request.effective_from,null,'full_period','active',v_approver_member_id
  );

  -- Paid Through records genuine historical payments using the canonical RPC.
  if v_request.paid_through is not null then
    v_payment_method := v_request.payment_method;
    if v_payment_method not in ('M-Pesa','Cash','Bank transfer') then
      raise exception 'A valid payment method is required for Paid Through historical payments';
    end if;
    v_current_month := date_trunc('month',v_request.effective_from)::date;
    v_historical_last_month := date_trunc('month',v_request.paid_through)::date;
    if v_historical_last_month > date_trunc('month',current_date)::date then
      raise exception 'Historical Paid Through cannot be in the future';
    end if;
    while v_current_month <= v_historical_last_month loop
      if v_current_month = date_trunc('month',v_join_date)::date then
        v_payment_date := v_join_date;
      else
        v_payment_date := v_current_month;
      end if;
      v_payment_id := pg_catalog.md5(
        'chama-live:member-accounting-init:historical:' ||
        p_request_id::text || ':' || to_char(v_current_month,'YYYY-MM')
      )::uuid;
      perform public.cl_2b_record_contribution(
        v_payment_id,v_request.group_id,v_request.member_id,
        v_request.monthly_amount,v_payment_date,'monthly',v_payment_method,
        null,null,null,
        'Existing-member initialization historical payment ' ||
          to_char(v_current_month,'YYYY-MM')
      );
      v_historical_payment_count := v_historical_payment_count + 1;
      v_current_month := (v_current_month + interval '1 month')::date;
    end loop;
  end if;

  perform public.cl_2b_refresh_member(v_request.member_id,date_trunc('month',current_date)::date);

  select * into v_reconcile
  from public.reconcile_member_historical_payments(v_request.member_id,current_date);

  select row_to_json(p)::jsonb into v_result
  from public.get_member_contribution_position(v_request.member_id) p;

  update private.member_accounting_initialization_requests
  set status='approved',approved_by_member_id=v_approver_member_id,
      approved_at=now(),result=coalesce(v_result,'{}'::jsonb)
  where request_id=p_request_id;

  insert into private.member_accounting_initialization_audit(
    request_id,group_id,member_id,actor_member_id,action,details
  ) values (
    p_request_id,v_request.group_id,v_request.member_id,v_approver_member_id,'approved',
    jsonb_build_object('effective_from',v_request.effective_from,'monthly_amount',v_request.monthly_amount,
      'paid_through',v_request.paid_through,'payment_method',v_request.payment_method,'historical_payment_count',v_historical_payment_count,'position',coalesce(v_result,'{}'::jsonb),
      'reconciliation',to_jsonb(v_reconcile))
  );

  return jsonb_build_object('success',true,'request_id',p_request_id,'status','approved','position',v_result,'reconciliation',to_jsonb(v_reconcile),'historical_payments_recorded',v_historical_payment_count,'payment_method',v_request.payment_method);
end;
$function$;
grant execute on function public.approve_member_accounting_initialization(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;