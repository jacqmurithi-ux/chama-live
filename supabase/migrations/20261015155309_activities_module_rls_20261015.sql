-- Apply the Plans & Activities module flag to the underlying activity records.
drop policy if exists group_activities_select_group on public.group_activities;
create policy group_activities_select_group on public.group_activities for select to authenticated
using (public.cl_user_in_group(group_id) and public.cl_group_module_enabled(group_id, 'plans'));

drop policy if exists group_activities_insert_management on public.group_activities;
create policy group_activities_insert_management on public.group_activities for insert to authenticated
with check (public.cl_group_module_enabled(group_id, 'plans') and public.cl_user_has_role(group_id, array['admin','chairperson','secretary']::text[]));

drop policy if exists group_activities_update_management on public.group_activities;
create policy group_activities_update_management on public.group_activities for update to authenticated
using (public.cl_group_module_enabled(group_id, 'plans') and public.cl_user_has_role(group_id, array['admin','chairperson','secretary']::text[]))
with check (public.cl_group_module_enabled(group_id, 'plans') and public.cl_user_has_role(group_id, array['admin','chairperson','secretary']::text[]));

drop policy if exists group_activities_delete_admin on public.group_activities;
create policy group_activities_delete_admin on public.group_activities for delete to authenticated
using (public.cl_group_module_enabled(group_id, 'plans') and public.cl_user_has_role(group_id, array['admin']::text[]));
