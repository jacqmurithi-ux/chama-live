-- Keep the meeting brief as the only editable/published meeting summary.
-- Preserve any historical resolution column values without displaying or rewriting them.
create or replace function public.cl_complete_meeting_and_notify(
  p_meeting_id uuid,
  p_brief text,
  p_resolution text default null
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_meeting public.meetings%rowtype;
  v_posted_by uuid;
  v_brief text := btrim(coalesce(p_brief, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if length(v_brief) < 5 or length(v_brief) > 3000 then
    raise exception 'Please enter a meeting brief between 5 and 3000 characters';
  end if;

  update public.meetings
     set status = 'completed',
         minutes = v_brief
   where id = p_meeting_id
   returning * into v_meeting;

  if not found then
    raise exception 'Meeting not found or you do not have permission to complete it';
  end if;

  select m.id
    into v_posted_by
    from public.members m
   where m.group_id = v_meeting.group_id
     and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
     and m.status = 'active'
   limit 1;

  if v_posted_by is null then
    raise exception 'No active member record found for the current user in this group';
  end if;

  insert into public.announcements (group_id, title, body, posted_by)
  values (
    v_meeting.group_id,
    left('Meeting completed: ' || v_meeting.title, 200),
    'Meeting: ' || v_meeting.title || E'\nDate: ' || v_meeting.date::text ||
    E'\nVenue: ' || coalesce(v_meeting.venue, 'Not specified') ||
    E'\n\nMeeting brief:\n' || v_brief,
    v_posted_by
  );

  return jsonb_build_object(
    'id', v_meeting.id,
    'group_id', v_meeting.group_id,
    'title', v_meeting.title,
    'date', v_meeting.date,
    'venue', v_meeting.venue,
    'agenda', v_meeting.agenda,
    'minutes', v_meeting.minutes,
    'resolution', v_meeting.resolution,
    'status', v_meeting.status,
    'created_at', v_meeting.created_at,
    'announcement_published', true
  );
end;
$function$;

-- Each successful document upload or file replacement produces a group announcement.
-- Group members can read these notices through the existing announcements RLS policy.
create or replace function public.cl_announce_document_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  member_row public.members%rowtype;
  notice_title text;
  notice_body text;
begin
  if tg_op = 'UPDATE' and old.storage_path is not distinct from new.storage_path then
    return new;
  end if;

  select m.* into member_row
    from public.members m
   where m.group_id = new.group_id
     and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
     and lower(coalesce(m.status, 'active')) = 'active'
     and lower(coalesce(m.onboarding_status, 'active')) = 'active'
   order by m.created_at
   limit 1;

  if member_row.id is null then
    return new;
  end if;

  notice_title := case
    when tg_op = 'INSERT' then 'New group document: ' || new.title
    else 'Document updated: ' || new.title
  end;

  notice_body :=
    'Category: ' || new.category || E'\n' ||
    'Document: ' || new.title || E'\n' ||
    'Updated: ' || to_char(now() at time zone 'Africa/Nairobi', 'DD Mon YYYY') ||
    E'\n\nOpen the Documents page in CHAMA LIVE to view or download this file.';

  insert into public.announcements (group_id, title, body, posted_by)
  values (new.group_id, notice_title, notice_body, member_row.id);

  return new;
end;
$$;
