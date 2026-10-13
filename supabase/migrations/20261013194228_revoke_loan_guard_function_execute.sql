-- Trigger-only SECURITY DEFINER functions must not be exposed as callable RPCs.
revoke all on function public.cl_loan_guard_disbursement_approvals() from public, anon, authenticated;
revoke all on function public.cl_loan_guard_repayment_recorder() from public, anon, authenticated;
