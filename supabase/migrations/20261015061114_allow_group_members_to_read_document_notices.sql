begin;
drop policy if exists read_document_notices_of_my_group on public.announcements;
create policy read_document_notices_of_my_group on public.announcements
  for select to authenticated
  using (public.cl_user_in_group(group_id));
commit;
