-- Candidate migration: shared, auth-derived My Account services.
-- Do not apply to production until candidate validation and explicit authorization.

alter table public.member_payment_evidence
  add column if not exists proof_storage_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'my-account-payment-proofs',
  'my-account-payment-proofs',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists "my account proof owner read" on storage.objects;
create policy "my account proof owner read"
on storage.objects for select to authenticated
using (
  bucket_id = 'my-account-payment-proofs'
  and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
  and exists (
    select 1 from public.members m
    where m.group_id = split_part(name, '/', 1)::uuid
      and m.id = split_part(name, '/', 2)::uuid
      and (m.user_id = (select auth.uid()) or m.auth_user_id = (select auth.uid()))
  )
);

drop policy if exists "my account proof owner upload" on storage.objects;
create policy "my account proof owner upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'my-account-payment-proofs'
  and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
  and exists (
    select 1 from public.members m
    where m.group_id = split_part(name, '/', 1)::uuid
      and m.id = split_part(name, '/', 2)::uuid
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
      and (m.user_id = (select auth.uid()) or m.auth_user_id = (select auth.uid()))
  )
);

create or replace function public.cl_get_my_account_bundle()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
  v_group public.groups%rowtype;
  v_month text := to_char(current_date, 'YYYY-MM');
  v_monthly jsonb := '{}'::jsonb;
  v_contributions jsonb := '[]'::jsonb;
  v_evidence jsonb := '[]'::jsonb;
  v_fines jsonb := '[]'::jsonb;
  v_loans jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_bundle jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select m.* into v_member
  from public.members m
  where (m.user_id = v_uid or m.auth_user_id = v_uid)
    and lower(coalesce(m.status, 'active')) = 'active'
    and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  order by case when m.auth_user_id = v_uid then 0 else 1 end, m.created_at, m.id
  limit 1;

  if not found then
    raise exception 'No active member account is linked to this login' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.members m
    where (m.user_id = v_uid or m.auth_user_id = v_uid)
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
      and m.id <> v_member.id
  ) then
    raise exception 'Multiple active member records are linked to this login. Resolve the identity mapping before continuing.' using errcode = '23505';
  end if;

  select g.* into v_group from public.groups g where g.id = v_member.group_id;
  if not found then
    raise exception 'The member group could not be resolved' using errcode = 'P0002';
  end if;

  select to_jsonb(s) into v_monthly
  from public.get_canonical_member_monthly_status(v_member.group_id, v_month) s
  where s.member_id = v_member.id
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.contribution_date desc nulls last, c.created_at desc), '[]'::jsonb)
  into v_contributions
  from (
    select c.id, c.contribution_date as payment_date, c.amount, c.contribution_type,
           c.payment_method, c.reference, c.mpesa_reference, c.notes, c.created_at,
           ci.name as initiative_name
    from public.contributions c
    left join public.contribution_initiatives ci
      on ci.id = c.initiative_id and ci.group_id = c.group_id
    where c.group_id = v_member.group_id and c.member_id = v_member.id
  ) c;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'amount', e.amount, 'payment_method', e.payment_method,
    'mpesa_reference', e.mpesa_reference, 'payment_date', e.payment_date,
    'evidence_text', e.evidence_text, 'status', e.status,
    'submitted_at', e.submitted_at, 'verified_at', e.verified_at,
    'rejection_reason', e.rejection_reason, 'proof_storage_path', e.proof_storage_path
  ) order by e.submitted_at desc), '[]'::jsonb)
  into v_evidence
  from public.member_payment_evidence e
  where e.group_id = v_member.group_id and e.member_id = v_member.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'accounting_month', f.accounting_month,
    'original_amount', f.original_amount, 'calculated_amount', f.calculated_amount,
    'reason', f.reason, 'source_type', f.source_type,
    'triggered_at', f.triggered_at, 'imposed_at', f.imposed_at,
    'created_at', f.created_at, 'status', b.status,
    'outstanding_amount', b.outstanding_amount
  ) order by coalesce(f.imposed_at, f.triggered_at, f.created_at) desc), '[]'::jsonb),
  coalesce(sum(b.outstanding_amount), 0)
  into v_fines, v_summary
  from public.fines f
  cross join lateral public.cl_fine_balance(f.id) b
  where f.group_id = v_member.group_id and f.member_id = v_member.id;

  if coalesce(v_group.loans_enabled, false) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'requested_amount', l.requested_amount,
      'approved_amount', l.approved_amount, 'status', l.status,
      'purpose', l.purpose, 'created_at', l.created_at,
      'approved_at', l.approved_at, 'disbursed_at', l.disbursed_at,
      'cleared_at', l.cleared_at
    ) order by l.created_at desc), '[]'::jsonb)
    into v_loans
    from public.loan_applications l
    where l.group_id = v_member.group_id and l.member_id = v_member.id;
  end if;

  v_bundle := jsonb_build_object(
    'member', jsonb_build_object(
      'id', v_member.id, 'name', v_member.name, 'email', v_member.email,
      'phone', v_member.phone, 'member_number', v_member.member_number,
      'membership_number', v_member.membership_number, 'role', v_member.role,
      'join_date', v_member.join_date, 'status', v_member.status,
      'onboarding_status', v_member.onboarding_status
    ),
    'group', jsonb_build_object('id', v_group.id, 'name', v_group.name),
    'loansEnabled', coalesce(v_group.loans_enabled, false),
    'summary', jsonb_build_object(
      'recognizedContributions', coalesce((select sum(c.amount) from public.contributions c where c.group_id = v_member.group_id and c.member_id = v_member.id), 0),
      'monthlyDue', coalesce((v_monthly->>'monthly_due')::numeric, 0),
      'appliedThisMonth', coalesce((v_monthly->>'applied_this_month')::numeric, 0),
      'outstanding', coalesce((v_monthly->>'current_outstanding')::numeric, 0),
      'carryForwardCredit', coalesce((v_monthly->>'previous_credit')::numeric, 0),
      'monthlyStatus', coalesce(v_monthly->>'status', 'unavailable'),
      'finesOutstanding', coalesce((v_summary #>> '{}')::numeric, 0),
      'loansBorrowed', case when coalesce(v_group.loans_enabled, false) then coalesce((select sum(coalesce(l.approved_amount, l.requested_amount, 0)) from public.loan_applications l where l.group_id = v_member.group_id and l.member_id = v_member.id and l.disbursed_at is not null), 0) else 0 end,
      'loansRepaid', case when coalesce(v_group.loans_enabled, false) then coalesce((select sum(a.principal_amount + a.interest_amount + a.penalty_amount) from public.loan_repayment_allocations a join public.loan_applications l on l.id = a.loan_id and l.group_id = a.group_id where l.group_id = v_member.group_id and l.member_id = v_member.id), 0) else 0 end,
      'loansOutstanding', case when coalesce(v_group.loans_enabled, false) then coalesce((
        select sum(greatest(s.principal_due - coalesce(a.principal_paid, 0), 0))
        from public.loan_repayment_schedule s
        join public.loan_applications l on l.id = s.loan_id and l.group_id = s.group_id
        left join (select schedule_id, sum(principal_amount) as principal_paid from public.loan_repayment_allocations where group_id = v_member.group_id group by schedule_id) a on a.schedule_id = s.id
        where l.group_id = v_member.group_id and l.member_id = v_member.id and l.status in ('active','overdue')
      ), 0) else 0 end
    ),
    'contributions', v_contributions,
    'paymentEvidence', v_evidence,
    'fines', v_fines,
    'loans', v_loans,
    'statements', v_contributions
  );

  return v_bundle;
end;
$function$;

revoke all on function public.cl_get_my_account_bundle() from public, anon;
grant execute on function public.cl_get_my_account_bundle() to authenticated;

create or replace function public.cl_submit_my_payment_evidence(
  p_amount numeric,
  p_payment_date date,
  p_payment_method text,
  p_mpesa_reference text default null,
  p_evidence_text text default null,
  p_proof_storage_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
  v_id uuid;
  v_method text := btrim(coalesce(p_payment_method, ''));
  v_details text := nullif(btrim(coalesce(p_evidence_text, '')), '');
  v_reference text := nullif(btrim(coalesce(p_mpesa_reference, '')), '');
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_payment_date is null or p_payment_date > current_date then raise exception 'Payment date is invalid'; end if;
  if v_method not in ('M-Pesa', 'Cash', 'Bank transfer') then raise exception 'Payment method is invalid'; end if;
  if v_method = 'M-Pesa' and v_reference is null then raise exception 'M-Pesa reference is required'; end if;
  if v_details is null then raise exception 'Payment details are required'; end if;

  select m.* into v_member
  from public.members m
  where (m.user_id = v_uid or m.auth_user_id = v_uid)
    and lower(coalesce(m.status, 'active')) = 'active'
    and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  order by case when m.auth_user_id = v_uid then 0 else 1 end, m.id
  limit 1;

  if not found then raise exception 'Active member account required'; end if;
  if exists (select 1 from public.members m where (m.user_id = v_uid or m.auth_user_id = v_uid) and m.id <> v_member.id and lower(coalesce(m.status,'active'))='active' and lower(coalesce(m.onboarding_status,'active'))='active') then
    raise exception 'Multiple member records are linked to this login'; 
  end if;

  if p_proof_storage_path is not null then
    if p_proof_storage_path !~* ('^' || v_member.group_id::text || '/' || v_member.id::text || '/[^/]+$')
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'my-account-payment-proofs' and o.name = p_proof_storage_path
       ) then
      raise exception 'Payment proof must be uploaded to your private account folder';
    end if;
  end if;

  insert into public.member_payment_evidence(
    group_id, member_id, amount, payment_method, mpesa_reference,
    payment_date, evidence_text, status, proof_storage_path
  ) values (
    v_member.group_id, v_member.id, p_amount, v_method, v_reference,
    p_payment_date, v_details, 'pending', p_proof_storage_path
  ) returning id into v_id;

  insert into public.group_audit_log(group_id, actor_user_id, actor_member_id, action, entity_type, entity_id, details)
  values (v_member.group_id, v_uid, v_member.id, 'my_account_payment_submitted', 'member_payment_evidence', v_id::text,
    jsonb_build_object('amount', p_amount, 'payment_method', v_method, 'payment_date', p_payment_date, 'proof_attached', p_proof_storage_path is not null));

  return jsonb_build_object('success', true, 'id', v_id, 'status', 'pending');
end;
$function$;

revoke all on function public.cl_submit_my_payment_evidence(numeric,date,text,text,text,text) from public, anon;
grant execute on function public.cl_submit_my_payment_evidence(numeric,date,text,text,text,text) to authenticated;

create or replace function public.cl_log_my_account_event(
  p_action text,
  p_format text default null,
  p_record_count integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_member public.members%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_action <> 'export' or p_format not in ('csv','excel','pdf','print') then
    raise exception 'Unsupported account audit event' using errcode = '22023';
  end if;
  select m.* into v_member from public.members m
  where (m.user_id = v_uid or m.auth_user_id = v_uid)
    and lower(coalesce(m.status,'active'))='active'
    and lower(coalesce(m.onboarding_status,'active'))='active'
  order by case when m.auth_user_id = v_uid then 0 else 1 end, m.id limit 1;
  if not found then raise exception 'Active member account required'; end if;
  insert into public.group_audit_log(group_id, actor_user_id, actor_member_id, action, entity_type, entity_id, details)
  values (v_member.group_id, v_uid, v_member.id, 'my_account_export', 'member_account', v_member.id::text,
    jsonb_build_object('format', p_format, 'record_count', greatest(coalesce(p_record_count,0),0)));
  return jsonb_build_object('success', true);
end;
$function$;

revoke all on function public.cl_log_my_account_event(text,text,integer) from public, anon;
grant execute on function public.cl_log_my_account_event(text,text,integer) to authenticated;

-- Defense in depth: even a direct table update or a privileged verifier RPC
-- cannot verify/reject the submitter's own payment evidence.
create or replace function public.cl_block_self_payment_verification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if old.status = 'pending' and new.status in ('verified','rejected') and auth.uid() is not null
     and exists (
       select 1 from public.members owner_member
       where owner_member.id = old.member_id
         and (owner_member.user_id = auth.uid() or owner_member.auth_user_id = auth.uid())
     ) then
    raise exception 'You cannot verify or reject your own payment evidence' using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.cl_block_self_payment_verification() from public, anon, authenticated;
drop trigger if exists cl_block_self_payment_verification on public.member_payment_evidence;
create trigger cl_block_self_payment_verification
before update of status on public.member_payment_evidence
for each row execute function public.cl_block_self_payment_verification();
