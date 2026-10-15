begin;

alter table public.documents
  add column if not exists category text not null default 'Other',
  add column if not exists description text,
  add column if not exists file_size bigint,
  add column if not exists mime_type text,
  add column if not exists meeting_id uuid,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documents_category_check' and conrelid = 'public.documents'::regclass) then
    alter table public.documents add constraint documents_category_check
      check (category in ('Constitution','Forms','Minutes','Policies','Other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_file_size_check' and conrelid = 'public.documents'::regclass) then
    alter table public.documents add constraint documents_file_size_check
      check (file_size is null or file_size between 1 and 10485760);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_meeting_id_fkey' and conrelid = 'public.documents'::regclass) then
    alter table public.documents add constraint documents_meeting_id_fkey
      foreign key (meeting_id) references public.meetings(id) on delete set null;
  end if;
end $$;

create index if not exists documents_group_category_created_idx
  on public.documents (group_id, category, created_at desc);
create index if not exists documents_group_meeting_idx
  on public.documents (group_id, meeting_id) where meeting_id is not null;

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null,
  category text not null check (category in ('Constitution','Forms','Minutes','Policies','Other')),
  description text,
  storage_path text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  meeting_id uuid references public.meetings(id) on delete set null,
  unique (document_id, version_number)
);

create index if not exists document_versions_document_idx
  on public.document_versions (document_id, version_number desc);

alter table public.document_versions enable row level security;

drop policy if exists "read documents of my group" on public.documents;
drop policy if exists "secretary/admin upload documents" on public.documents;
drop policy if exists documents_group_read on public.documents;
drop policy if exists documents_official_insert on public.documents;
drop policy if exists documents_official_update on public.documents;
drop policy if exists documents_official_delete on public.documents;

create policy documents_group_read on public.documents
  for select to authenticated
  using (public.cl_user_in_group(group_id));

create policy documents_official_insert on public.documents
  for insert to authenticated
  with check (
    public.cl_user_has_role(group_id,
      array['admin','chairperson','vice chairperson','treasurer','secretary','vice secretary'])
    and uploaded_by = (
      select m.id from public.members m
      where m.group_id = documents.group_id
        and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
        and lower(coalesce(m.status, 'active')) = 'active'
        and lower(coalesce(m.onboarding_status, 'active')) = 'active'
      order by m.created_at limit 1
    )
    and (meeting_id is null or exists (
      select 1 from public.meetings m
      where m.id = documents.meeting_id and m.group_id = documents.group_id
    ))
  );

create policy documents_official_update on public.documents
  for update to authenticated
  using (public.cl_user_has_role(group_id,
    array['admin','chairperson','vice chairperson','treasurer','secretary','vice secretary']))
  with check (
    public.cl_user_has_role(group_id,
      array['admin','chairperson','vice chairperson','treasurer','secretary','vice secretary'])
    and (meeting_id is null or exists (
      select 1 from public.meetings m
      where m.id = documents.meeting_id and m.group_id = documents.group_id
    ))
  );

create policy documents_official_delete on public.documents
  for delete to authenticated
  using (public.cl_user_has_role(group_id,
    array['admin','chairperson','vice chairperson','treasurer','secretary','vice secretary']));

create policy document_versions_group_read on public.document_versions
  for select to authenticated
  using (public.cl_user_in_group(group_id));

revoke insert, update, delete on public.document_versions from anon, authenticated;
grant select on public.document_versions to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('group-documents','group-documents',false,10485760,array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg','image/png'
])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists group_documents_read on storage.objects;
drop policy if exists group_documents_insert_official on storage.objects;
drop policy if exists group_documents_update_official on storage.objects;
drop policy if exists group_documents_delete_official on storage.objects;

create policy group_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'group-documents'
    and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
    and public.cl_user_in_group(split_part(name, '/', 1)::uuid)
  );

create policy group_documents_insert_official on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'group-documents'
    and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
    and public.cl_user_has_role(split_part(name, '/', 1)::uuid,
      array['admin','chairperson','vice chairperson','treasurer','secretary','vice secretary'])
  );

create policy group_documents_update_official on storage.objects
  for update to authenticated
  using (
    bucket_id = 'group-documents'
    and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
    and public.cl_user_has_role(split_part(name, '/', 1)::uuid,
      array['admin','chairperson','vice chairperson','treasurer','secretary','vice secretary'])
  )
  with check (
    bucket_id = 'group-documents'
    and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
    and public.cl_user_has_role(split_part(name, '/', 1)::uuid,
      array['admin','chairperson','vice chairperson','treasurer','secretary','vice secretary'])
  );

create policy group_documents_delete_official on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'group-documents'
    and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
    and public.cl_user_has_role(split_part(name, '/', 1)::uuid,
      array['admin','chairperson','vice chairperson','treasurer','secretary','vice secretary'])
  );

create or replace function public.cl_archive_document_version()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare next_version integer;
begin
  if tg_op = 'UPDATE' and old.storage_path is distinct from new.storage_path then
    select coalesce(max(v.version_number), 0) + 1 into next_version
    from public.document_versions v where v.document_id = old.id;
    insert into public.document_versions
      (document_id, group_id, version_number, title, category, description, storage_path,
       file_size, mime_type, uploaded_by, created_at, meeting_id)
    values
      (old.id, old.group_id, next_version, old.title, old.category, old.description, old.storage_path,
       old.file_size, old.mime_type, old.uploaded_by, old.created_at, old.meeting_id);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists documents_archive_version on public.documents;
create trigger documents_archive_version before update on public.documents
for each row execute function public.cl_archive_document_version();

alter table public.meeting_documents
  add column if not exists source_document_id uuid references public.documents(id) on delete cascade;
create unique index if not exists meeting_documents_source_document_uidx
  on public.meeting_documents (source_document_id) where source_document_id is not null;

create or replace function public.cl_sync_document_meeting_link()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    delete from public.meeting_documents where source_document_id = old.id;
    return old;
  end if;
  if new.category = 'Minutes' and new.meeting_id is not null then
    insert into public.meeting_documents
      (group_id, meeting_id, storage_path, file_name, content_type, size_bytes, uploaded_by, source_document_id)
    values
      (new.group_id, new.meeting_id, new.storage_path, new.title,
       coalesce(new.mime_type,'application/octet-stream'), coalesce(new.file_size,0), auth.uid(), new.id)
    on conflict (source_document_id) where source_document_id is not null
    do update set group_id=excluded.group_id, meeting_id=excluded.meeting_id,
      storage_path=excluded.storage_path, file_name=excluded.file_name,
      content_type=excluded.content_type, size_bytes=excluded.size_bytes, uploaded_by=excluded.uploaded_by;
  else
    delete from public.meeting_documents where source_document_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists documents_sync_meeting_link on public.documents;
create trigger documents_sync_meeting_link
after insert or update of category, meeting_id, storage_path, title, mime_type, file_size on public.documents
for each row execute function public.cl_sync_document_meeting_link();

create or replace function public.cl_announce_document_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  member_row public.members%rowtype;
  notice_title text;
  notice_body text;
begin
  if tg_op = 'UPDATE' and old.storage_path is not distinct from new.storage_path then return new; end if;
  select m.* into member_row from public.members m
  where m.group_id = new.group_id and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
    and lower(coalesce(m.status,'active')) = 'active'
    and lower(coalesce(m.onboarding_status,'active')) = 'active'
  order by m.created_at limit 1;
  if member_row.id is null then return new; end if;
  notice_title := case when tg_op = 'INSERT' then 'New group document: ' || new.title else 'Document updated: ' || new.title end;
  notice_body := 'Category: ' || new.category || E'\n' || 'Document: ' || new.title || E'\n'
    || 'Updated: ' || to_char(now() at time zone 'Africa/Nairobi','DD Mon YYYY');
  insert into public.announcements (group_id,title,body,posted_by)
  values (new.group_id,notice_title,notice_body,member_row.id);
  return new;
end;
$$;

drop trigger if exists documents_announce_change on public.documents;
create trigger documents_announce_change after insert or update of storage_path on public.documents
for each row execute function public.cl_announce_document_change();

grant select, insert, update, delete on public.documents to authenticated;
grant select on public.meeting_documents to authenticated;

commit;
