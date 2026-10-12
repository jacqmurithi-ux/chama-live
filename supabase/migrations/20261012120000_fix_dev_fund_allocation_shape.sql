-- Corrected candidate definition after discovering allocation table's required identity columns.
-- Existing payment identity is preserved; only one canonical allocation is inserted.
create or replace function public.cl_reconcile_existing_custom_payment(
  p_group_id uuid,
  p_payment_id uuid,
  p_request_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_actor_member_id uuid;
  v_payment public.contributions%rowtype;
  v_target public.members%rowtype;
  v_old_member public.members%rowtype;
  v_type public.contribution_types%rowtype;
  v_period public.contribution_periods%rowtype;
  v_rule public.member_contribution_rules%rowtype;
  v_obligation public.contribution_obligations%rowtype;
  v_rule_count integer;
  v_obligation_count integer;
  v_linked_obligation_count integer;
  v_payload jsonb;
  v_existing_payload jsonb;
  v_existing_result jsonb;
  v_result jsonb;
  v_allocated numeric;
  v_fine_allocated numeric;
  v_month date;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_group_id is null or p_payment_id is null or p_request_id is null
     or nullif(btrim(coalesce(p_reason,'')), '') is null then
    raise exception 'GROUP_PAYMENT_REQUEST_AND_REASON_REQUIRED' using errcode = '22023';
  end if;
  if not public.cl_user_has_role(p_group_id, array['admin','treasurer']::text[]) then
    raise exception 'DEV_FUND_RECONCILIATION_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select m.id into v_actor_member_id
  from public.members m
  where m.group_id = p_group_id
    and (m.user_id = v_user_id or m.auth_user_id = v_user_id)
    and lower(coalesce(m.status,'active')) = 'active'
    and lower(coalesce(m.onboarding_status,'active')) = 'active'
  order by m.id limit 1;
  if v_actor_member_id is null then
    raise exception 'ACTIVE_FINANCE_OFFICER_REQUIRED' using errcode = '42501';
  end if;

  v_payload := jsonb_build_object('group_id',p_group_id,'payment_id',p_payment_id,'reason',btrim(p_reason));
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('chama-live:dev-fund-reconcile:request:'||p_request_id::text,0)
  );

  select r.payload,r.result into v_existing_payload,v_existing_result
  from private.dev_fund_reconciliation_requests r
  where r.request_id=p_request_id for update;
  if found then
    if v_existing_payload is distinct from v_payload then
      raise exception 'REQUEST_ID_REUSE_MISMATCH' using errcode='22023';
    end if;
    if v_existing_result is null then
      raise exception 'REQUEST_ALREADY_CLAIMED_WITHOUT_RESULT' using errcode='55000';
    end if;
    return jsonb_set(v_existing_result,'{replayed}','true'::jsonb,true);
  end if;

  select * into v_payment from public.contributions c
  where c.id=p_payment_id and c.group_id=p_group_id;
  if not found then raise exception 'PAYMENT_NOT_FOUND_IN_GROUP' using errcode='22023'; end if;
  if v_payment.amount <> 250
     or v_payment.contribution_date <> date '2026-10-07'
     or lower(btrim(v_payment.contribution_type)) <> 'dev fund' then
    raise exception 'PAYMENT_DOES_NOT_MATCH_APPROVED_DEV_FUND_CORRECTION' using errcode='22023';
  end if;

  select * into v_target from public.members m
  where m.id=v_payment.member_id and m.group_id=p_group_id;
  if not found or lower(coalesce(v_target.status,'active')) <> 'active' then
    raise exception 'INTENDED_MEMBER_NOT_ACTIVE_IN_GROUP' using errcode='22023';
  end if;

  select ct.* into v_type from public.contribution_types ct
  where ct.group_id=p_group_id and lower(ct.name)='dev fund' and ct.code='custom';
  if not found then raise exception 'DEV_FUND_TYPE_NOT_FOUND' using errcode='22023'; end if;

  select count(*) into v_obligation_count
  from public.contribution_obligations o
  where o.group_id=p_group_id and o.contribution_type_id=v_type.id
    and o.obligation_month=date_trunc('month',v_payment.contribution_date)::date
    and o.component_kind='PARENT' and o.lifecycle_state='ACTIVE'
    and o.period_id is not null and o.rule_id is null
    and o.member_id<>v_target.id and o.due_amount=v_payment.amount;
  if v_obligation_count<>1 then
    raise exception 'EXPECTED_EXACTLY_ONE_MISASSIGNED_PERIOD_OBLIGATION; FOUND %',v_obligation_count using errcode='22023';
  end if;

  select * into v_obligation from public.contribution_obligations o
  where o.group_id=p_group_id and o.contribution_type_id=v_type.id
    and o.obligation_month=date_trunc('month',v_payment.contribution_date)::date
    and o.component_kind='PARENT' and o.lifecycle_state='ACTIVE'
    and o.period_id is not null and o.rule_id is null
    and o.member_id<>v_target.id and o.due_amount=v_payment.amount;

  select * into v_period from public.contribution_periods cp
  where cp.id=v_obligation.period_id and cp.group_id=p_group_id
    and cp.contribution_type_id=v_type.id;
  if not found or v_period.status not in ('open','due','grace')
     or v_payment.contribution_date<v_period.opening_date
     or v_payment.contribution_date>v_period.closing_date then
    raise exception 'DEV_FUND_PERIOD_NOT_OPEN_FOR_PAYMENT_DATE' using errcode='22023';
  end if;

  select * into v_old_member from public.members m
  where m.id=v_obligation.member_id and m.group_id=p_group_id;
  if not found then raise exception 'MISASSIGNED_MEMBER_NOT_FOUND' using errcode='22023'; end if;

  select count(*) into v_rule_count
  from public.member_contribution_rules r
  where r.group_id=p_group_id and r.member_id=v_old_member.id
    and r.contribution_type_id=v_type.id and r.status='active'
    and r.amount=v_obligation.due_amount
    and r.effective_from<=v_payment.contribution_date
    and coalesce(r.effective_to,date '9999-12-31')>=v_payment.contribution_date;
  if v_rule_count<>1 then
    raise exception 'EXPECTED_EXACTLY_ONE_MISASSIGNED_ACTIVE_RULE; FOUND %',v_rule_count using errcode='22023';
  end if;

  select * into v_rule from public.member_contribution_rules r
  where r.group_id=p_group_id and r.member_id=v_old_member.id
    and r.contribution_type_id=v_type.id and r.status='active'
    and r.amount=v_obligation.due_amount
    and r.effective_from<=v_payment.contribution_date
    and coalesce(r.effective_to,date '9999-12-31')>=v_payment.contribution_date;

  if v_obligation.economic_month is null then
    raise exception 'OBLIGATION_ECONOMIC_MONTH_REQUIRED' using errcode='22023';
  end if;

  perform public.cl_2b_accounting_lock_range(
    p_group_id,date_trunc('month',v_payment.contribution_date)::date,v_obligation.economic_month
  );

  perform 1 from public.financial_periods fp
  where fp.group_id=p_group_id and fp.month in (
    to_char(v_payment.contribution_date,'YYYY-MM'),
    to_char(v_obligation.economic_month,'YYYY-MM')
  )
  order by fp.month for update;
  if exists (
    select 1 from public.financial_periods fp
    where fp.group_id=p_group_id and fp.month in (
      to_char(v_payment.contribution_date,'YYYY-MM'),
      to_char(v_obligation.economic_month,'YYYY-MM')
    ) and lower(fp.status)='closed'
  ) then
    raise exception 'DEV_FUND_RECONCILIATION_TOUCHES_CLOSED_FINANCIAL_PERIOD' using errcode='22023';
  end if;

  select * into v_payment from public.contributions c
  where c.id=p_payment_id and c.group_id=p_group_id for update;
  select r.* into v_rule from public.member_contribution_rules r where r.id=v_rule.id for update;
  select o.* into v_obligation from public.contribution_obligations o where o.id=v_obligation.id for update;

  if exists(select 1 from public.contribution_allocations a where a.payment_id=p_payment_id)
     or exists(select 1 from public.fine_payment_allocations f where f.payment_id=p_payment_id) then
    raise exception 'PAYMENT_ALREADY_HAS_ALLOCATIONS' using errcode='22023';
  end if;
  if exists(select 1 from public.contribution_allocations a where a.obligation_id=v_obligation.id) then
    raise exception 'MISASSIGNED_OBLIGATION_ALREADY_HAS_ALLOCATIONS' using errcode='22023';
  end if;

  select count(*) into v_linked_obligation_count from public.contribution_obligations o where o.rule_id=v_rule.id;
  if v_linked_obligation_count<>0 then
    raise exception 'MISASSIGNED_RULE_HAS_LINKED_OBLIGATIONS; REVIEW_REQUIRED' using errcode='22023';
  end if;
  if exists (
    select 1 from public.member_contribution_rules r
    where r.group_id=p_group_id and r.member_id=v_target.id and r.contribution_type_id=v_type.id
      and r.status='active' and r.id<>v_rule.id
      and r.effective_from<=coalesce(v_rule.effective_to,date '9999-12-31')
      and coalesce(r.effective_to,date '9999-12-31')>=v_rule.effective_from
  ) then raise exception 'TARGET_MEMBER_HAS_OVERLAPPING_ACTIVE_DEV_FUND_RULE' using errcode='22023'; end if;
  if exists (
    select 1 from public.contribution_obligations o
    where o.group_id=p_group_id and o.member_id=v_target.id and o.contribution_type_id=v_type.id
      and o.period_id=v_obligation.period_id and o.component_kind='PARENT'
  ) then raise exception 'TARGET_MEMBER_ALREADY_HAS_OBLIGATION_FOR_PERIOD' using errcode='22023'; end if;
  if exists(select 1 from private.dev_fund_reconciliation_requests r where r.payment_id=p_payment_id) then
    raise exception 'PAYMENT_ALREADY_RECONCILED_WITH_DIFFERENT_REQUEST' using errcode='22023';
  end if;

  insert into private.dev_fund_reconciliation_requests(
    request_id,group_id,payment_id,reason,payload,actor_user_id,actor_member_id,
    prior_member_id,target_member_id,rule_id,obligation_id,amount
  ) values(
    p_request_id,p_group_id,p_payment_id,btrim(p_reason),v_payload,v_user_id,v_actor_member_id,
    v_old_member.id,v_target.id,v_rule.id,v_obligation.id,v_payment.amount
  );

  update public.member_contribution_rules set member_id=v_target.id
  where id=v_rule.id and group_id=p_group_id and member_id=v_old_member.id;
  if not found then raise exception 'RULE_REASSIGNMENT_FAILED'; end if;
  update public.contribution_obligations set member_id=v_target.id
  where id=v_obligation.id and group_id=p_group_id and member_id=v_old_member.id;
  if not found then raise exception 'OBLIGATION_REASSIGNMENT_FAILED'; end if;

  -- Support both the current deployed canonical schema and newer candidate
  -- schemas with denormalized allocation columns.
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='contribution_allocations'
      and column_name='group_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='contribution_allocations'
      and column_name='member_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='contribution_allocations'
      and column_name='allocated_amount'
  ) then
    execute 'insert into public.contribution_allocations(group_id,member_id,payment_id,obligation_id,allocated_amount,amount) values ($1,$2,$3,$4,$5,$5)'
      using p_group_id,v_target.id,p_payment_id,v_obligation.id,v_payment.amount;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='contribution_allocations'
      and column_name='group_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='contribution_allocations'
      and column_name='member_id'
  ) then
    execute 'insert into public.contribution_allocations(group_id,member_id,payment_id,obligation_id,amount) values ($1,$2,$3,$4,$5)'
      using p_group_id,v_target.id,p_payment_id,v_obligation.id,v_payment.amount;
  else
    insert into public.contribution_allocations(payment_id,obligation_id,amount)
    values(p_payment_id,v_obligation.id,v_payment.amount);
  end if;

  v_month:=date_trunc('month',v_payment.contribution_date)::date;
  perform public.cl_2b_refresh_member(v_old_member.id,v_month);
  perform public.cl_2b_refresh_member(v_target.id,v_month);

  select coalesce(sum(a.amount),0) into v_allocated from public.contribution_allocations a where a.payment_id=p_payment_id;
  select coalesce(sum(f.allocated_amount),0) into v_fine_allocated from public.fine_payment_allocations f where f.payment_id=p_payment_id;
  if v_allocated<>v_payment.amount or v_fine_allocated<>0 then
    raise exception 'POST_RECONCILIATION_ALLOCATION_TOTAL_MISMATCH' using errcode='22023';
  end if;

  v_result:=jsonb_build_object(
    'ok',true,'replayed',false,'payment_id',p_payment_id,'amount',v_payment.amount,
    'member_id',v_target.id,'member_name',v_target.name,
    'previous_obligation_member_id',v_old_member.id,'previous_obligation_member_name',v_old_member.name,
    'rule_id',v_rule.id,'obligation_id',v_obligation.id,
    'allocated_amount',v_allocated,'unapplied_amount',v_payment.amount-v_allocated,'reason',btrim(p_reason)
  );
  update private.dev_fund_reconciliation_requests set result=v_result,completed_at=now() where request_id=p_request_id;
  return v_result;
end;
$function$;

revoke all on function public.cl_reconcile_existing_custom_payment(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.cl_reconcile_existing_custom_payment(uuid,uuid,uuid,text) to authenticated;
