-- Keep Data Migration data inaccessible unless its group has enabled the module.
drop policy if exists data_import_batches_select_authorized on public.data_import_batches;
create policy data_import_batches_select_authorized on public.data_import_batches for select to authenticated
using (public.cl_group_module_enabled(group_id, 'migration') and public.cl_user_has_role(group_id, array['admin','chairperson','secretary','treasurer']::text[]));

drop policy if exists data_import_batches_insert_authorized on public.data_import_batches;
create policy data_import_batches_insert_authorized on public.data_import_batches for insert to authenticated
with check (public.cl_group_module_enabled(group_id, 'migration') and public.cl_user_has_role(group_id, array['admin','chairperson','secretary','treasurer']::text[]));

drop policy if exists data_import_batches_update_authorized on public.data_import_batches;
create policy data_import_batches_update_authorized on public.data_import_batches for update to authenticated
using (public.cl_group_module_enabled(group_id, 'migration') and public.cl_user_has_role(group_id, array['admin','chairperson','secretary','treasurer']::text[]))
with check (public.cl_group_module_enabled(group_id, 'migration') and public.cl_user_has_role(group_id, array['admin','chairperson','secretary','treasurer']::text[]));

drop policy if exists data_import_batches_delete_admin on public.data_import_batches;
create policy data_import_batches_delete_admin on public.data_import_batches for delete to authenticated
using (public.cl_group_module_enabled(group_id, 'migration') and public.cl_user_has_role(group_id, array['admin']::text[]));

drop policy if exists data_import_rows_select_authorized on public.data_import_rows;
create policy data_import_rows_select_authorized on public.data_import_rows for select to authenticated
using (exists (select 1 from public.data_import_batches b where b.id = data_import_rows.batch_id
  and public.cl_group_module_enabled(b.group_id, 'migration')
  and public.cl_user_has_role(b.group_id, array['admin','chairperson','secretary','treasurer']::text[])));

drop policy if exists data_import_rows_insert_authorized on public.data_import_rows;
create policy data_import_rows_insert_authorized on public.data_import_rows for insert to authenticated
with check (exists (select 1 from public.data_import_batches b where b.id = data_import_rows.batch_id
  and public.cl_group_module_enabled(b.group_id, 'migration')
  and public.cl_user_has_role(b.group_id, array['admin','chairperson','secretary','treasurer']::text[])));

drop policy if exists data_import_rows_update_authorized on public.data_import_rows;
create policy data_import_rows_update_authorized on public.data_import_rows for update to authenticated
using (exists (select 1 from public.data_import_batches b where b.id = data_import_rows.batch_id
  and public.cl_group_module_enabled(b.group_id, 'migration')
  and public.cl_user_has_role(b.group_id, array['admin','chairperson','secretary','treasurer']::text[])))
with check (exists (select 1 from public.data_import_batches b where b.id = data_import_rows.batch_id
  and public.cl_group_module_enabled(b.group_id, 'migration')
  and public.cl_user_has_role(b.group_id, array['admin','chairperson','secretary','treasurer']::text[])));

drop policy if exists data_import_rows_delete_admin on public.data_import_rows;
create policy data_import_rows_delete_admin on public.data_import_rows for delete to authenticated
using (exists (select 1 from public.data_import_batches b where b.id = data_import_rows.batch_id
  and public.cl_group_module_enabled(b.group_id, 'migration')
  and public.cl_user_has_role(b.group_id, array['admin']::text[])));

drop policy if exists data_import_mappings_select_authorized on public.data_import_mappings;
create policy data_import_mappings_select_authorized on public.data_import_mappings for select to authenticated
using (exists (select 1 from public.data_import_batches b where b.id = data_import_mappings.batch_id
  and public.cl_group_module_enabled(b.group_id, 'migration')
  and public.cl_user_has_role(b.group_id, array['admin','chairperson','secretary','treasurer']::text[])));

drop policy if exists data_import_mappings_insert_authorized on public.data_import_mappings;
create policy data_import_mappings_insert_authorized on public.data_import_mappings for insert to authenticated
with check (exists (select 1 from public.data_import_batches b where b.id = data_import_mappings.batch_id
  and public.cl_group_module_enabled(b.group_id, 'migration')
  and public.cl_user_has_role(b.group_id, array['admin','chairperson','secretary','treasurer']::text[])));

drop policy if exists data_import_mappings_update_authorized on public.data_import_mappings;
create policy data_import_mappings_update_authorized on public.data_import_mappings for update to authenticated
using (exists (select 1 from public.data_import_batches b where b.id = data_import_mappings.batch_id
  and public.cl_group_module_enabled(b.group_id, 'migration')
  and public.cl_user_has_role(b.group_id, array['admin','chairperson','secretary','treasurer']::text[])))
with check (exists (select 1 from public.data_import_batches b where b.id = data_import_mappings.batch_id
  and public.cl_group_module_enabled(b.group_id, 'migration')
  and public.cl_user_has_role(b.group_id, array['admin','chairperson','secretary','treasurer']::text[])));

drop policy if exists data_import_mappings_delete_admin on public.data_import_mappings;
create policy data_import_mappings_delete_admin on public.data_import_mappings for delete to authenticated
using (exists (select 1 from public.data_import_batches b where b.id = data_import_mappings.batch_id
  and public.cl_group_module_enabled(b.group_id, 'migration')
  and public.cl_user_has_role(b.group_id, array['admin']::text[])));
