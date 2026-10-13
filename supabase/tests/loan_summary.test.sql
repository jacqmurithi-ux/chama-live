-- Integration/regression tests for cl_get_group_loan_summary(uuid).
-- Run with a privileged Supabase SQL test session. All fixture writes roll back.
begin;

do $test$
declare
  v_user uuid;
  v_admin_user uuid;
  v_group uuid;
  v_other_group uuid;
  v_member_one uuid;
  v_member_two uuid;
  v_loan_active uuid;
  v_loan_cleared uuid;
  v_loan_overdue uuid;
  v_schedule_active uuid;
  v_schedule_cleared uuid;
  v_schedule_overdue uuid;
  v_payment_active uuid;
  v_payment_cleared uuid;
  v_payment_overdue uuid;
  v_result jsonb;
  v_denied boolean;
begin
  select id into v_user from auth.users order by created_at limit 1;
  select id into v_admin_user from auth.users where id <> v_user order by created_at limit 1;
  if v_user is null or v_admin_user is null then
    raise exception 'Loan summary tests require at least two existing auth users';
  end if;

  insert into public.groups(name, access_code, owner_user_id, loans_enabled)
  values ('__loan_summary_test__', '__loan_summary_' || gen_random_uuid()::text, null, true)
  returning id into v_group;

  insert into public.groups(name, access_code, owner_user_id, loans_enabled)
  values ('__loan_summary_other_group__', '__loan_summary_other_' || gen_random_uuid()::text, null, true)
  returning id into v_other_group;

  insert into public.members(
    group_id, user_id, member_number, membership_number, name, phone,
    role, status, onboarding_status
  ) values (
    v_group, v_user, 'LS-TEST-1', 'LS-MEM-TEST-1', 'Loan Summary Test Member 1',
    '000000001', 'member', 'active', 'active'
  ) returning id into v_member_one;

  insert into public.members(
    group_id, member_number, membership_number, name, phone,
    role, status, onboarding_status
  ) values (
    v_group, 'LS-TEST-2', 'LS-MEM-TEST-2', 'Loan Summary Test Member 2',
    '000000002', 'member', 'active', 'active'
  ) returning id into v_member_two;

  -- Separate admin identity for the admin-portal authorization case.
  insert into public.members(
    group_id, user_id, member_number, membership_number, name, phone,
    role, status, onboarding_status
  ) values (
    v_group, v_admin_user, 'LS-TEST-ADMIN', 'LS-MEM-TEST-ADMIN',
    'Loan Summary Test Admin', '000000003', 'admin', 'active', 'active'
  );

  perform set_config('request.jwt.claim.sub', v_user::text, true);

  -- Empty state: all five contract values are numeric zero.
  v_result := public.cl_get_group_loan_summary(v_group);
  if (v_result->>'totalDisbursed')::numeric <> 0
     or (v_result->>'interestGained')::numeric <> 0
     or (v_result->>'membersBenefited')::integer <> 0
     or (v_result->>'outstandingAmount')::numeric <> 0
     or (v_result->>'activeLoansCount')::integer <> 0 then
    raise exception 'FAIL: empty-state summary must return zero values: %', v_result;
  end if;

  -- Disabled groups must be denied even if the caller belongs to the group.
  update public.groups set loans_enabled = false where id = v_group;
  v_denied := false;
  begin
    perform public.cl_get_group_loan_summary(v_group);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'FAIL: disabled loan module was not denied';
  end if;
  update public.groups set loans_enabled = true where id = v_group;

  -- Multiple loans for the same member, one fully repaid loan, and partial repayments.
  insert into public.loan_applications(
    group_id, member_id, requested_amount, period_months, purpose, status,
    approved_amount, disbursed_at
  ) values (
    v_group, v_member_one, 1000, 1, 'Summary test active partial loan',
    'active', 1000, now()
  ) returning id into v_loan_active;

  insert into public.loan_applications(
    group_id, member_id, requested_amount, period_months, purpose, status,
    approved_amount, disbursed_at, cleared_at
  ) values (
    v_group, v_member_one, 500, 1, 'Summary test fully repaid loan',
    'cleared', 500, now(), now()
  ) returning id into v_loan_cleared;

  insert into public.loan_applications(
    group_id, member_id, requested_amount, period_months, purpose, status,
    approved_amount, disbursed_at
  ) values (
    v_group, v_member_two, 800, 1, 'Summary test overdue partial loan',
    'overdue', 800, now()
  ) returning id into v_loan_overdue;

  insert into public.loan_repayment_schedule(
    group_id, loan_id, installment_no, due_date, principal_due, interest_due,
    penalty_due, amount_paid, status
  ) values (
    v_group, v_loan_active, 1, current_date, 1000, 100, 0, 650, 'partial'
  ) returning id into v_schedule_active;

  insert into public.loan_repayment_schedule(
    group_id, loan_id, installment_no, due_date, principal_due, interest_due,
    penalty_due, amount_paid, status
  ) values (
    v_group, v_loan_cleared, 1, current_date, 500, 100, 0, 600, 'paid'
  ) returning id into v_schedule_cleared;

  insert into public.loan_repayment_schedule(
    group_id, loan_id, installment_no, due_date, principal_due, interest_due,
    penalty_due, amount_paid, status
  ) values (
    v_group, v_loan_overdue, 1, current_date - 30, 800, 100, 0, 620, 'overdue'
  ) returning id into v_schedule_overdue;

  insert into public.loan_repayments(group_id, loan_id, amount, recorded_by)
  values (v_group, v_loan_active, 650, v_user) returning id into v_payment_active;
  insert into public.loan_repayments(group_id, loan_id, amount, recorded_by)
  values (v_group, v_loan_cleared, 600, v_user) returning id into v_payment_cleared;
  insert into public.loan_repayments(group_id, loan_id, amount, recorded_by)
  values (v_group, v_loan_overdue, 620, v_user) returning id into v_payment_overdue;

  insert into public.loan_repayment_allocations(
    group_id, repayment_id, loan_id, schedule_id, principal_amount, interest_amount, penalty_amount
  ) values
    (v_group, v_payment_active, v_loan_active, v_schedule_active, 600, 50, 0),
    (v_group, v_payment_cleared, v_loan_cleared, v_schedule_cleared, 500, 100, 0),
    (v_group, v_payment_overdue, v_loan_overdue, v_schedule_overdue, 600, 20, 0);

  v_result := public.cl_get_group_loan_summary(v_group);
  if (v_result->>'totalDisbursed')::numeric <> 2300 then
    raise exception 'FAIL: expected total disbursed 2300, got %', v_result->>'totalDisbursed';
  end if;
  if (v_result->>'interestGained')::numeric <> 170 then
    raise exception 'FAIL: expected interest actually collected 170, got %', v_result->>'interestGained';
  end if;
  if (v_result->>'membersBenefited')::integer <> 2 then
    raise exception 'FAIL: expected two distinct benefited members, got %', v_result->>'membersBenefited';
  end if;
  if (v_result->>'outstandingAmount')::numeric <> 600 then
    raise exception 'FAIL: expected outstanding principal 600, got %', v_result->>'outstandingAmount';
  end if;
  if (v_result->>'activeLoansCount')::integer <> 2 then
    raise exception 'FAIL: expected two active/overdue loans, got %', v_result->>'activeLoansCount';
  end if;

  -- A member cannot request another group's summary by changing group_id.
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  v_denied := false;
  begin
    perform public.cl_get_group_loan_summary(v_other_group);
  exception when insufficient_privilege then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'FAIL: member was allowed to read another group summary';
  end if;

  -- A group Admin can read the group they manage through their group role.
  perform set_config('request.jwt.claim.sub', v_admin_user::text, true);
  v_result := public.cl_get_group_loan_summary(v_group);
  if (v_result->>'totalDisbursed')::numeric <> 2300 then
    raise exception 'FAIL: group Admin was denied or received incorrect summary';
  end if;

  raise notice 'PASS: loan summary empty state, disabled module, multiple loans per member, partial repayments, cleared loans, distinct members, interest allocations, and authorization';
end
$test$;

rollback;
