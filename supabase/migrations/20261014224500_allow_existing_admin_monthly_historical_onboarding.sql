-- Enable Treasurer-approved historical Monthly onboarding for an Admin who
-- already has a later-effective Monthly rule. This migration only changes RPC
-- logic; it does not alter member/payment/obligation data.
DO $migration$
DECLARE
  d text;
  old text;
  repl text;
BEGIN
  SELECT pg_get_functiondef('public.preview_member_accounting_initialization(uuid,numeric,date,date)'::regprocedure) INTO d;
  old := $old$  if v_existing_rule_count > 0 then
    raise exception 'Member already has a Monthly rule; initialization is not applicable';
  end if;$old$;
  repl := $new$  if v_existing_rule_count > 0 then
    if v_existing_rule_count <> 1
       or not exists (
         select 1 from public.member_contribution_rules r
         join public.contribution_types ct on ct.id=r.contribution_type_id
         where r.group_id=v_group_id and r.member_id=p_member_id
           and (ct.code='monthly' or lower(trim(ct.name))='monthly')
           and r.status='active' and r.frequency='monthly'
           and r.effective_from > p_effective_from
       )
       or exists (
         select 1 from public.contribution_obligations o
         join public.contribution_types ct on ct.id=o.contribution_type_id
         where o.group_id=v_group_id and o.member_id=p_member_id
           and (ct.code='monthly' or lower(trim(ct.name))='monthly')
           and o.obligation_month < date_trunc('month',p_effective_from)::date
       )
       or exists (
         select 1 from public.contributions c
         where c.group_id=v_group_id and c.member_id=p_member_id
           and lower(trim(coalesce(c.contribution_type,'')))='monthly'
           and c.contribution_date < p_effective_from
       )
    then raise exception 'Existing Monthly rule is not eligible for historical onboarding'; end if;
  end if;$new$;
  IF position(old in d)=0 THEN RAISE EXCEPTION 'Preview source mismatch; no changes applied'; END IF;
  d := replace(d,old,repl);
  EXECUTE d;

  SELECT pg_get_functiondef('public.approve_member_accounting_initialization(uuid)'::regprocedure) INTO d;
  old := $old$  v_historical_payment_count integer := 0;
begin$old$;
  repl := $new$  v_historical_payment_count integer := 0;
  v_existing_rule_count integer := 0;
  v_existing_rule_id uuid;
begin$new$;
  IF position(old in d)=0 THEN RAISE EXCEPTION 'Approval declaration mismatch'; END IF;
  d := replace(d,old,repl);

  old := $old$  if exists (
    select 1 from public.member_contribution_rules r
    join public.contribution_types ct on ct.id=r.contribution_type_id
    where r.group_id=v_request.group_id and r.member_id=v_request.member_id
      and (ct.code='monthly' or lower(trim(ct.name))='monthly')
  ) then
    raise exception 'Member already has a Monthly rule; no changes were applied';
  end if;$old$;
  repl := $new$  select count(*) into v_existing_rule_count
  from public.member_contribution_rules r
  join public.contribution_types ct on ct.id=r.contribution_type_id
  where r.group_id=v_request.group_id and r.member_id=v_request.member_id
    and (ct.code='monthly' or lower(trim(ct.name))='monthly');
  if v_existing_rule_count > 0 then
    if v_existing_rule_count <> 1 then raise exception 'Multiple Monthly rules exist; manual reconciliation required'; end if;
    select r.id into strict v_existing_rule_id
    from public.member_contribution_rules r
    join public.contribution_types ct on ct.id=r.contribution_type_id
    where r.group_id=v_request.group_id and r.member_id=v_request.member_id
      and (ct.code='monthly' or lower(trim(ct.name))='monthly')
      and r.status='active' and r.frequency='monthly' and r.effective_from > v_request.effective_from
    for update;
    if exists (
      select 1 from public.contribution_obligations o
      join public.contribution_types ct on ct.id=o.contribution_type_id
      where o.group_id=v_request.group_id and o.member_id=v_request.member_id
        and (ct.code='monthly' or lower(trim(ct.name))='monthly')
        and o.obligation_month < date_trunc('month',v_request.effective_from)::date
    ) or exists (
      select 1 from public.contributions c
      where c.group_id=v_request.group_id and c.member_id=v_request.member_id
        and lower(trim(coalesce(c.contribution_type,'')))='monthly'
        and c.contribution_date < v_request.effective_from
    ) then raise exception 'Existing Monthly history conflicts with requested historical onboarding'; end if;
  end if;$new$;
  IF position(old in d)=0 THEN RAISE EXCEPTION 'Approval guard mismatch'; END IF;
  d := replace(d,old,repl);

  old := $old$  if v_request.effective_from < coalesce(v_join_date,v_request.effective_from) then
    raise exception 'Monthly start date cannot precede the member join date';
  end if;$old$;
  repl := $new$  if v_request.effective_from < coalesce(v_join_date,v_request.effective_from)
     and v_existing_rule_count = 0 then
    raise exception 'Monthly start date cannot precede the member join date';
  end if;$new$;
  IF position(old in d)=0 THEN RAISE EXCEPTION 'Join-date guard mismatch'; END IF;
  d := replace(d,old,repl);

  old := $old$  insert into public.member_contribution_rules(
    group_id,member_id,contribution_type_id,amount,frequency,effective_from,
    effective_to,first_period_rule,status,created_by
  ) values (
    v_request.group_id,v_request.member_id,v_monthly_type_id,v_request.monthly_amount,
    'monthly',v_request.effective_from,null,'full_period','active',v_approver_member_id
  );$old$;
  repl := $new$  if v_existing_rule_count > 0 then
    update public.members set join_date=v_request.effective_from
    where id=v_request.member_id and group_id=v_request.group_id;
    update public.member_contribution_rules
    set amount=v_request.monthly_amount,effective_from=v_request.effective_from,
        effective_to=null,first_period_rule='full_period',status='active'
    where id=v_existing_rule_id and group_id=v_request.group_id and member_id=v_request.member_id;
    if not found then raise exception 'Existing Monthly rule changed before approval; no initialization completed'; end if;
  else
    insert into public.member_contribution_rules(
      group_id,member_id,contribution_type_id,amount,frequency,effective_from,
      effective_to,first_period_rule,status,created_by
    ) values (
      v_request.group_id,v_request.member_id,v_monthly_type_id,v_request.monthly_amount,
      'monthly',v_request.effective_from,null,'full_period','active',v_approver_member_id
    );
    update public.members set join_date=v_request.effective_from
    where id=v_request.member_id and group_id=v_request.group_id;
  end if;$new$;
  IF position(old in d)=0 THEN RAISE EXCEPTION 'Rule write block mismatch'; END IF;
  d := replace(d,old,repl);

  old := $old$    jsonb_build_object('effective_from',v_request.effective_from,'monthly_amount',v_request.monthly_amount,
      'paid_through',v_request.paid_through,'payment_method',v_request.payment_method,'historical_payment_count',v_historical_payment_count,'position',coalesce(v_result,'{}'::jsonb),
      'reconciliation',to_jsonb(v_reconcile))$old$;
  repl := $new$    jsonb_build_object('effective_from',v_request.effective_from,'join_date_after_approval',v_request.effective_from,'monthly_amount',v_request.monthly_amount,
      'paid_through',v_request.paid_through,'payment_method',v_request.payment_method,'historical_payment_count',v_historical_payment_count,'position',coalesce(v_result,'{}'::jsonb),
      'reconciliation',to_jsonb(v_reconcile))$new$;
  IF position(old in d)=0 THEN RAISE EXCEPTION 'Audit payload block mismatch'; END IF;
  d := replace(d,old,repl);
  EXECUTE d;
END;
$migration$;
