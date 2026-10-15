begin;
revoke execute on function public.cl_archive_document_version() from public, anon, authenticated;
revoke execute on function public.cl_announce_document_change() from public, anon, authenticated;
revoke execute on function public.cl_sync_document_meeting_link() from public, anon, authenticated;
commit;
