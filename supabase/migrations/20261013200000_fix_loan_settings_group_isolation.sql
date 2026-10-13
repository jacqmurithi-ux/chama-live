-- CHAMA LIVE Loans: restrict settings reads to active members of the owning group.
-- Module state remains enforced; this policy does not enable Loans for any group.
drop policy if exists loan_settings_read_member on public.loan_settings;
create policy loan_settings_read_member
on public.loan_settings
for select
to authenticated
using (
  public.cl_group_module_enabled(group_id, 'loans')
  and exists (
    select 1
    from public.members m
    where m.group_id = loan_settings.group_id
      and (m.user_id = auth.uid() or m.auth_user_id = auth.uid())
      and lower(coalesce(m.status, 'active')) = 'active'
      and lower(coalesce(m.onboarding_status, 'active')) = 'active'
  )
);
