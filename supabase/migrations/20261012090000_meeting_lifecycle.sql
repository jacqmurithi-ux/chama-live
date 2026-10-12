-- Candidate migration: meeting lifecycle and status audit trail.
-- Do not apply to production until authenticated UI/RLS regression and migration replay pass.

alter table public.meetings
  add column if not exists resolution_not_required boolean not null default false,
  add column if not exists status_reason text,
  add column if not exists postponed_to date;

alter table public.meetings
  drop constraint if exists meetings_status_check;

alter table public.meetings
  add constraint meetings_status_check
  check (status = any (array[
    'upcoming',
    'held_pending_minutes',
    'completed',
    'cancelled',
    'postponed'
  ]::text[]));

create table if not exists public.meeting_status_history (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  from_status text,
  to_status text not null,
  reason text,
  actor_user_id uuid,
  actor_member_id uuid,
  actor_name text,
  changed_at timestamptz not null default now()
);

create index if not exists meeting_status_history_meeting_changed_idx
  on public.meeting_status_history (meeting_id, changed_at desc);

alter table public.meeting_status_history enable row level security;
revoke all on public.meeting_status_history from public, anon, authenticated;
grant select on public.meeting_status_history to authenticated;
drop policy if exists meeting_status_history_read_group on public.meeting_status_history;
create policy meeting_status_history_read_group
  on public.meeting_status_history
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.members m
      where m.group_id = meeting_status_history.group_id
        and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
        and lower(coalesce(m.status, 'active')) = 'active'
        and lower(coalesce(m.onboarding_status, 'active')) = 'active'
    )
  );

-- The UI permits all four group officers to manage meeting attendance.
-- The previous SELECT policy omitted admin, and UPDATE omitted chairperson
-- and treasurer, causing upsert/read failures for otherwise authorized officers.
drop policy if exists attendance_select on public.attendance;
create policy attendance_select
  on public.attendance
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.meetings mt
      where mt.id = attendance.meeting_id
        and (
          exists (
            select 1
            from public.members me
            where me.id = attendance.member_id
              and me.group_id = mt.group_id
              and me.id in (
                select own.id from public.members own
                where own.group_id = mt.group_id
                  and (own.user_id = auth.uid() or own.auth_user_id = auth.uid())
                  and lower(coalesce(own.status, 'active')) = 'active'
              )
          )
          or public.cl_user_has_role(
            mt.group_id,
            array['admin','chairperson','secretary','treasurer']::text[]
          )
        )
    )
  );

drop policy if exists attendance_official_update on public.attendance;
create policy attendance_official_update
  on public.attendance
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.meetings mt
      where mt.id = attendance.meeting_id
        and public.cl_user_has_role(
          mt.group_id,
          array['admin','chairperson','secretary','treasurer']::text[]
        )
    )
  )
  with check (
    exists (
      select 1
      from public.meetings mt
      join public.members me
        on me.id = attendance.member_id
       and me.group_id = mt.group_id
      where mt.id = attendance.meeting_id
        and lower(coalesce(me.status, 'active')) = 'active'
        and public.cl_user_has_role(
          mt.group_id,
          array['admin','chairperson','secretary','treasurer']::text[]
        )
    )
  );

create or replace function public.guard_meeting_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_missing_attendance uuid;
  v_transition_allowed boolean := false;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.status, 'upcoming') <> 'upcoming' then
      raise exception 'MEETING_INITIAL_STATUS_MUST_BE_UPCOMING';
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  v_transition_allowed :=
    (old.status = 'upcoming' and new.status in ('held_pending_minutes', 'cancelled', 'postponed'))
    or (old.status = 'held_pending_minutes' and new.status in ('completed', 'cancelled', 'postponed'))
    or (old.status = 'postponed' and new.status in ('upcoming', 'cancelled'))
    or (old.status = 'cancelled' and new.status = 'upcoming');

  if not v_transition_allowed then
    raise exception 'MEETING_LIFECYCLE_TRANSITION_NOT_ALLOWED: % -> %', old.status, new.status;
  end if;

  if new.status in ('cancelled', 'postponed')
     and nullif(btrim(coalesce(new.status_reason, '')), '') is null then
    raise exception 'MEETING_STATUS_REASON_REQUIRED';
  end if;

  if new.status = 'postponed' then
    if new.postponed_to is null or new.postponed_to <= new.date then
      raise exception 'POSTPONEMENT_REQUIRES_A_LATER_DATE';
    end if;
  end if;

  if old.status = 'postponed' and new.status = 'upcoming' then
    if old.postponed_to is null or new.date is distinct from old.postponed_to then
      raise exception 'RESCHEDULE_TO_PROPOSED_DATE_REQUIRED';
    end if;
    new.postponed_to := null;
  end if;

  if new.status = 'completed' then
    if nullif(btrim(coalesce(new.minutes, '')), '') is null then
      raise exception 'MEETING_MINUTES_REQUIRED_BEFORE_COMPLETION';
    end if;
    if nullif(btrim(coalesce(new.resolution, '')), '') is null
       and not coalesce(new.resolution_not_required, false) then
      raise exception 'RESOLUTION_OR_NO_RESOLUTION_CONFIRMATION_REQUIRED';
    end if;

    select m.id into v_missing_attendance
    from public.members m
    where m.group_id = new.group_id
      and lower(coalesce(m.status, 'active')) = 'active'
      and not exists (
        select 1
        from public.attendance a
        where a.meeting_id = new.id
          and a.member_id = m.id
      )
    order by m.id
    limit 1;

    if v_missing_attendance is not null then
      raise exception 'ATTENDANCE_MUST_BE_RECORDED_FOR_EVERY_ACTIVE_MEMBER';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists meetings_guard_lifecycle on public.meetings;
create trigger meetings_guard_lifecycle
before insert or update of status on public.meetings
for each row execute function public.guard_meeting_lifecycle();

create or replace function public.audit_meeting_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_member_id uuid;
  v_actor_name text;
  v_from_status text;
  v_to_status text;
  v_reason text;
begin
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then
      return new;
    end if;
    v_from_status := old.status;
  else
    v_from_status := null;
  end if;

  v_to_status := new.status;
  v_reason := nullif(btrim(coalesce(new.status_reason, '')), '');

  select m.id, m.name
    into v_actor_member_id, v_actor_name
  from public.members m
  where m.group_id = new.group_id
    and (m.user_id = v_actor_user_id or m.auth_user_id = v_actor_user_id)
  order by m.id
  limit 1;

  insert into public.meeting_status_history (
    meeting_id, group_id, from_status, to_status, reason,
    actor_user_id, actor_member_id, actor_name
  ) values (
    new.id, new.group_id, v_from_status, v_to_status, v_reason,
    v_actor_user_id, v_actor_member_id, v_actor_name
  );

  return new;
end;
$function$;

drop trigger if exists meetings_audit_lifecycle on public.meetings;
create trigger meetings_audit_lifecycle
after insert or update of status on public.meetings
for each row execute function public.audit_meeting_lifecycle();

revoke all on function public.guard_meeting_lifecycle() from public, anon, authenticated;
revoke all on function public.audit_meeting_lifecycle() from public, anon, authenticated;

