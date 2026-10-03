-- Allow active group officers to read contribution rules for members in their group.
-- This restores the Members page read path without granting direct writes.
create policy "member_contribution_rules_select_group_officers"
on public.member_contribution_rules
for select
to authenticated
using (
  public.cl_user_has_role(
    group_id,
    array['admin', 'chairperson', 'secretary', 'treasurer']::text[]
  )
);

-- Rollback:
-- drop policy "member_contribution_rules_select_group_officers"
--   on public.member_contribution_rules;
