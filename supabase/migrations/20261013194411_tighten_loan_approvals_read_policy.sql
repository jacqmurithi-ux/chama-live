-- Loan applicants may see approvals for their own loan only; officials can see group approval progress.
drop policy if exists loan_approvals_select_same_group on public.loan_approvals;
create policy loan_approvals_select_same_group
on public.loan_approvals for select to authenticated
using (
  public.cl_group_module_enabled(group_id,'loans')
  and exists (
    select 1 from public.members active_member
    where active_member.group_id=loan_approvals.group_id
      and (active_member.user_id=auth.uid() or active_member.auth_user_id=auth.uid())
      and lower(coalesce(active_member.status,'active'))='active'
      and lower(coalesce(active_member.onboarding_status,'active'))='active'
  )
  and (
    public.cl_user_has_role(group_id,array['admin','chairperson','secretary','treasurer']::text[])
    or exists (
      select 1 from public.loan_applications own_loan
      join public.members loan_owner on loan_owner.id=own_loan.member_id and loan_owner.group_id=own_loan.group_id
      where own_loan.id=loan_approvals.loan_id
        and own_loan.group_id=loan_approvals.group_id
        and (loan_owner.user_id=auth.uid() or loan_owner.auth_user_id=auth.uid())
    )
  )
);
