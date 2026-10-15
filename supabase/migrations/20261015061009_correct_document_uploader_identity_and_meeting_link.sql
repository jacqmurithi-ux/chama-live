begin;
drop trigger if exists documents_sync_meeting_link on public.documents;
drop policy if exists documents_official_insert on public.documents;
create policy documents_official_insert on public.documents
  for insert to authenticated
  with check (
    public.cl_user_has_role(group_id,
      array['admin','chairperson','vice chairperson','treasurer','secretary','vice secretary'])
    and uploaded_by = (
      select m.id
      from public.members m
      where m.group_id = documents.group_id
        and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
        and lower(coalesce(m.status, 'active')) = 'active'
        and lower(coalesce(m.onboarding_status, 'active')) = 'active'
      order by m.created_at
      limit 1
    )
    and (meeting_id is null or exists (
      select 1 from public.meetings m
      where m.id = documents.meeting_id and m.group_id = documents.group_id
    ))
  );
commit;
