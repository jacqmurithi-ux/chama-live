-- Require an explicit office declaration for loan approval, exactly as for expenses.
create or replace function public.cl_loan_guard_approval_office()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_member public.members%rowtype;
  v_member_count integer;
  v_position text;
  v_position_name text;
  v_slot text;
begin
  if auth.uid() is null or new.approver_user_id <> auth.uid() then
    raise exception 'A loan approval must be submitted by the signed-in official' using errcode='42501';
  end if;

  select count(*) into v_member_count
  from public.members m
  where m.group_id=new.group_id
    and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and lower(coalesce(m.status,''))='active'
    and lower(coalesce(m.onboarding_status,''))='active';
  if v_member_count<>1 then
    raise exception 'Exactly one active member record in this group is required to approve loans' using errcode='42501';
  end if;

  select m.* into v_member
  from public.members m
  where m.group_id=new.group_id
    and (m.user_id=auth.uid() or m.auth_user_id=auth.uid())
    and lower(coalesce(m.status,''))='active'
    and lower(coalesce(m.onboarding_status,''))='active';

  v_position := lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g'));
  v_position_name := lower(regexp_replace(replace(replace(btrim(coalesce(v_member.actual_position_name,'')),'_',' '),'-',' '),'[[:space:]]+',' ','g'));

  if v_position in ('chairperson','vice chairperson','chair','vice chair')
     or v_position_name in ('chairperson','vice chairperson','chair','vice chair') then
    v_slot := 'chairperson';
  elsif v_position='treasurer' or v_position_name='treasurer' then
    v_slot := 'treasurer';
  elsif v_position in ('secretary','vice secretary') or v_position_name in ('secretary','vice secretary') then
    v_slot := 'secretary';
  else
    raise exception 'Your declared group office is not eligible to approve loans' using errcode='42501';
  end if;

  if v_slot<>new.approval_slot then
    raise exception 'The approval slot must match your declared group office' using errcode='42501';
  end if;

  if exists (
    select 1 from public.loan_applications l
    where l.id=new.loan_id and l.group_id=new.group_id and l.member_id=v_member.id
  ) then
    raise exception 'A loan applicant cannot approve or reject their own loan' using errcode='42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists loan_approval_requires_declared_office on public.loan_approvals;
create trigger loan_approval_requires_declared_office
before insert on public.loan_approvals
for each row execute function public.cl_loan_guard_approval_office();

revoke all on function public.cl_loan_guard_approval_office() from public,anon,authenticated;
