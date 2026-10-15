drop policy if exists meeting_documents_upload_official on public.meeting_documents;
create policy meeting_documents_upload_official
on public.meeting_documents for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and public.cl_user_has_role(meeting_documents.group_id, array['admin','secretary']::text[])
  and exists (
    select 1
    from public.meetings m
    where m.id = meeting_documents.meeting_id
      and m.group_id = meeting_documents.group_id
  )
);