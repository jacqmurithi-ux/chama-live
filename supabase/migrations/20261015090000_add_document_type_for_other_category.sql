begin;
alter table public.documents add column if not exists document_type text;
alter table public.document_versions add column if not exists document_type text;
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
      (document_id, group_id, version_number, title, category, document_type, description, storage_path,
       file_size, mime_type, uploaded_by, created_at, meeting_id)
    values
      (old.id, old.group_id, next_version, old.title, old.category, old.document_type, old.description, old.storage_path,
       old.file_size, old.mime_type, old.uploaded_by, old.created_at, old.meeting_id);
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.cl_archive_document_version() from public, anon, authenticated;
commit;
