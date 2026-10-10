# CHAMA LIVE role matrix candidate verification

## Status — NOT YET VERIFIED
The development branch and candidate migration are staged, but the SQL migration
has not been applied to a disposable candidate database and no browser/RPC denial
tests have been run. Production has not been changed.

Do not apply the migration to production. Use a disposable candidate database with
synthetic groups and users. Never use live contribution, expense, fine,
payment-evidence, or closing records as test fixtures.

**Release blockers:** audit every direct-membership RLS policy and every
SECURITY DEFINER financial mutation RPC; helper-backed cross-group admin access
alone does not prove full platform-wide access. A cross-group admin group-picker
and context-switching UI is also not yet implemented.

## Roles to provision
- Group A and Group B, each with synthetic members for admin, chairperson,
  vice chairperson, secretary, vice secretary, treasurer, and ordinary member.
- Use separate auth identities and active membership records; include one inactive
  membership and one pending-onboarding membership as negative cases.

## Required positive checks
- Chairperson and vice chairperson can read permitted financial reports, balances,
  contributions, expenses, fine records, financial periods, and closing history.
- Vice chairperson can perform every tested non-treasury chairperson action.
- Vice secretary can perform every tested non-treasury secretary action.
- Secretary retains the existing secretary-level contribution recording and
  payment-verification permissions allowed by the matrix.
- Treasurer can perform the existing treasury RPC operations in its own group.
- Admin/administrator can perform non-treasury group administration in both
  Group A and Group B, subject to explicit per-feature authorization.

## Required negative checks
- Chairperson and vice chairperson cannot insert, update, or delete contributions.
- Chairperson and vice chairperson cannot insert, update, or delete expenses.
- Chairperson and vice chairperson cannot adjust, waive, or allocate fines.
- Chairperson and vice chairperson cannot create treasury fine rules or verify
  payment evidence.
- Admin/administrator cannot invoke treasurer-only period close/reopen, financial
  period mutation, contribution deletion, expense update/delete, or fine correction
  RPCs merely because they are administrators.
- Secretary/vice secretary cannot perform treasurer-only fine correction or
  period close/reopen operations.
- Group B non-admin members cannot read or mutate Group A data.
- Inactive/pending members cannot gain permissions from a stale role value.
- Direct REST/RPC attempts must be denied even when the UI is bypassed.

## Audit and acceptance gates
- Audit every SECURITY DEFINER mutation RPC and every direct-membership RLS policy.
  The initial migration intentionally rewrites only identified role guards and
  policies; any remaining treasury mutation path is a blocker.
- Check SQL migration against a disposable clone and run Supabase security advisors.
- Verify the resulting pg_policies definitions and function source after migration.
- Run browser tests for role-dependent UI and direct RPC denial tests.
- Production stays locked/read-only until all checks pass and a separate deployment
  approval is given.
