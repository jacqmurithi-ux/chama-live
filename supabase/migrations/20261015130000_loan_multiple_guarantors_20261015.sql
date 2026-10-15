create table if not exists public.loan_application_guarantors (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  loan_id uuid not null references public.loan_applications(id) on delete cascade,
  guarantor_member_id uuid not null references public.members(id) on delete restrict,
  response text not null default 'pending' check (response in ('pending','accepted','declined')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint loan_application_guarantors_unique unique (loan_id, guarantor_member_id)
);
create index if not exists loan_application_guarantors_member_pending_idx
  on public.loan_application_guarantors (group_id, guarantor_member_id, response, created_at desc);
alter table public.loan_application_guarantors enable row level security;
revoke all on public.loan_application_guarantors from anon, authenticated;
grant select, insert, update, delete on public.loan_application_guarantors to service_role;

create or replace function public.cl_loan_apply_multi(
  p_group_id uuid, p_requested_amount numeric, p_period_months integer, p_purpose text,
  p_guarantor_member_ids uuid[] default '{}'::uuid[]
) returns uuid
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_member_id uuid; v_settings public.loan_settings%rowtype; v_id uuid; v_guarantor_id uuid; v_count integer;
begin
  v_member_id := public.cl_loan_actor(p_group_id, false);
  if p_requested_amount is null or p_requested_amount <= 0 or p_period_months is null or p_period_months < 1
    or length(btrim(coalesce(p_purpose,''))) < 3 or length(btrim(p_purpose)) > 2000 then
    raise exception 'Enter a valid amount, period and purpose' using errcode='22023';
  end if;
  if coalesce(array_length(p_guarantor_member_ids,1),0) > 5 then raise exception 'Select no more than five guarantors' using errcode='22023'; end if;
  select count(distinct x) into v_count from unnest(coalesce(p_guarantor_member_ids,'{}'::uuid[])) x;
  if v_count <> coalesce(array_length(p_guarantor_member_ids,1),0) then raise exception 'A guarantor can only be selected once' using errcode='22023'; end if;
  select * into v_settings from public.loan_settings where group_id=p_group_id;
  if not found then raise exception 'Loan settings have not been configured by the Admin' using errcode='P0002'; end if;
  if p_requested_amount > v_settings.max_loan_amount then raise exception 'Requested amount exceeds the group maximum' using errcode='22023'; end if;
  if p_period_months > v_settings.max_period_months then raise exception 'Requested period exceeds the group maximum' using errcode='22023'; end if;
  if exists (
    select 1 from unnest(coalesce(p_guarantor_member_ids,'{}'::uuid[])) selected(id)
    where not exists (select 1 from public.members m where m.id=selected.id and m.group_id=p_group_id
      and m.id<>v_member_id and m.status='active' and m.onboarding_status='active')
  ) then raise exception 'Every guarantor must be another active member of this group' using errcode='22023'; end if;
  insert into public.loan_applications(group_id,member_id,requested_amount,period_months,purpose,guarantor_member_id)
  values(p_group_id,v_member_id,p_requested_amount,p_period_months,btrim(p_purpose),(coalesce(p_guarantor_member_ids,'{}'::uuid[]))[1])
  returning id into v_id;
  foreach v_guarantor_id in array coalesce(p_guarantor_member_ids,'{}'::uuid[]) loop
    insert into public.loan_application_guarantors(group_id,loan_id,guarantor_member_id)
    values(p_group_id,v_id,v_guarantor_id);
  end loop;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(p_group_id,auth.uid(),v_member_id,'submit_loan_application','loan_application',v_id::text,
    jsonb_build_object('requested_amount',p_requested_amount,'period_months',p_period_months,'guarantor_count',coalesce(array_length(p_guarantor_member_ids,1),0)));
  return v_id;
end;
$function$;

create or replace function public.cl_my_loan_guarantor_requests(p_group_id uuid)
returns table (loan_id uuid, applicant_name text, requested_amount numeric, period_months integer, purpose text, application_created_at timestamptz, response text)
language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_member_id uuid;
begin
  v_member_id := public.cl_loan_actor(p_group_id, false);
  return query select g.loan_id, m.name::text, a.requested_amount, a.period_months, a.purpose, a.created_at, g.response
    from public.loan_application_guarantors g
    join public.loan_applications a on a.id=g.loan_id and a.group_id=g.group_id
    join public.members m on m.id=a.member_id
    where g.group_id=p_group_id and g.guarantor_member_id=v_member_id and a.status='submitted' and g.response='pending'
    order by a.created_at desc;
end;
$function$;

create or replace function public.cl_respond_to_loan_guarantor(p_loan_id uuid,p_accept boolean)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_group_id uuid; v_member_id uuid; v_updated integer;
begin
  select group_id into v_group_id from public.loan_applications where id=p_loan_id;
  if v_group_id is null then raise exception 'Loan application not found' using errcode='P0002'; end if;
  v_member_id := public.cl_loan_actor(v_group_id, false);
  update public.loan_application_guarantors set response=case when p_accept then 'accepted' else 'declined' end, responded_at=now()
    where loan_id=p_loan_id and group_id=v_group_id and guarantor_member_id=v_member_id and response='pending';
  get diagnostics v_updated = row_count;
  if v_updated=0 then raise exception 'No pending guarantor request was found for your account' using errcode='42501'; end if;
  insert into public.group_audit_log(group_id,actor_user_id,actor_member_id,action,entity_type,entity_id,details)
  values(v_group_id,auth.uid(),v_member_id,'respond_loan_guarantor','loan_application',p_loan_id::text,jsonb_build_object('accepted',p_accept));
  return true;
end;
$function$;

revoke all on function public.cl_loan_apply_multi(uuid,numeric,integer,text,uuid[]) from public, anon;
revoke all on function public.cl_my_loan_guarantor_requests(uuid) from public, anon;
revoke all on function public.cl_respond_to_loan_guarantor(uuid,boolean) from public, anon;
grant execute on function public.cl_loan_apply_multi(uuid,numeric,integer,text,uuid[]) to authenticated;
grant execute on function public.cl_my_loan_guarantor_requests(uuid) to authenticated;
grant execute on function public.cl_respond_to_loan_guarantor(uuid,boolean) to authenticated;
