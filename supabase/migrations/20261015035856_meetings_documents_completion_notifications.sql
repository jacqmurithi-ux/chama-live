create table if not exists public.meeting_documents (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  content_type text not null check (content_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  uploaded_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  constraint meeting_documents_path_matches_meeting
    check (storage_path = group_id::text || '/' || meeting_id::text || '/' || split_part(storage_path, '/', 3)
      and split_part(storage_path, '/', 3) <> '')
);

alter table public.meeting_documents enable row level security;
revoke all on public.meeting_documents from anon, public;
grant select, insert, delete on public.meeting_documents to authenticated;

drop policy if exists meeting_documents_read_group on public.meeting_documents;
create policy meeting_documents_read_group
on public.meeting_documents for select to authenticated
using (public.cl_user_in_group(group_id));

drop policy if exists meeting_documents_upload_official on public.meeting_documents;
create policy meeting_documents_upload_official
on public.meeting_documents for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and public.cl_user_has_role(meeting_documents.group_id, array['admin','secretary']::text[])
  and exists (
    select 1 from public.meetings m
    where m.id = meeting_documents.meeting_id
      and m.group_id = meeting_documents.group_id
  )
);

drop policy if exists meeting_documents_delete_official on public.meeting_documents;
create policy meeting_documents_delete_official
on public.meeting_documents for delete to authenticated
using (public.cl_user_has_role(group_id, array['admin','secretary']::text[]));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meeting-files',
  'meeting-files',
  false,
  10485760,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists meeting_files_read_group on storage.objects;
create policy meeting_files_read_group
on storage.objects for select to authenticated
using (
  bucket_id = 'meeting-files'
  and exists (
    select 1
    from public.meetings m
    where m.group_id::text = split_part(name, '/', 1)
      and m.id::text = split_part(name, '/', 2)
      and public.cl_user_in_group(m.group_id)
  )
);

drop policy if exists meeting_files_upload_official on storage.objects;
create policy meeting_files_upload_official
on storage.objects for insert to authenticated
with check (
  bucket_id = 'meeting-files'
  and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
  and exists (
    select 1
    from public.meetings m
    where m.group_id::text = split_part(name, '/', 1)
      and m.id::text = split_part(name, '/', 2)
      and public.cl_user_has_role(m.group_id, array['admin','secretary']::text[])
  )
);

drop policy if exists meeting_files_delete_official on storage.objects;
create policy meeting_files_delete_official
on storage.objects for delete to authenticated
using (
  bucket_id = 'meeting-files'
  and exists (
    select 1
    from public.meetings m
    where m.group_id::text = split_part(name, '/', 1)
      and m.id::text = split_part(name, '/', 2)
      and public.cl_user_has_role(m.group_id, array['admin','secretary']::text[])
  )
);

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
    'Meeting: ' || v_meeting.title || E'\\nDate: ' || v_meeting.date::text ||
    E'\\nVenue: ' || coalesce(v_meeting.venue, 'Not specified') ||
    E'\\n\\nMeeting brief:\\n' || v_brief ||
    case when v_resolution is not null then E'\\n\\nResolutions:\\n' || v_resolution else '' end,
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
