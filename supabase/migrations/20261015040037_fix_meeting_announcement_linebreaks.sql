create or replace function public.cl_complete_meeting_and_notify(
  p_meeting_id uuid,
  p_brief text,
  p_resolution text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_meeting public.meetings%rowtype;
  v_brief text := btrim(coalesce(p_brief, ''));
  v_resolution text := nullif(btrim(coalesce(p_resolution, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if length(v_brief) < 5 or length(v_brief) > 3000 then
    raise exception 'Please enter a meeting brief between 5 and 3000 characters';
  end if;

  update public.meetings
     set status = 'completed',
         minutes = v_brief,
         resolution = v_resolution
   where id = p_meeting_id
   returning * into v_meeting;

  if not found then
    raise exception 'Meeting not found or you do not have permission to complete it';
  end if;

  insert into public.announcements (group_id, title, body, posted_by)
  values (
    v_meeting.group_id,
    left('Meeting completed: ' || v_meeting.title, 200),
    'Meeting: ' || v_meeting.title || E'\nDate: ' || v_meeting.date::text ||
    E'\nVenue: ' || coalesce(v_meeting.venue, 'Not specified') ||
    E'\n\nMeeting brief:\n' || v_brief ||
    case when v_resolution is not null then E'\n\nResolutions:\n' || v_resolution else '' end,
    auth.uid()
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
$$;

revoke all on function public.cl_complete_meeting_and_notify(uuid, text, text) from public, anon;
grant execute on function public.cl_complete_meeting_and_notify(uuid, text, text) to authenticated;