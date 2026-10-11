# CHAMA LIVE Role Matrix — Candidate Status (2026-10-11)

## Release state

**NOT READY FOR RELEASE.** Candidate branch only. Production project `ptktftwyltxmtcodyzoa` has not been changed. Candidate database work was applied only to isolated test project `onzaonflquipqmhgslxi`.

Branch:
`candidate/role-matrix-chair-vice-finance-readonly-20261010`

## Implemented candidate changes

### Shared frontend permission layer
- Added `js/role-permissions.js` as a central page/action permission vocabulary.
- Wired the helper into `js/admin-layout.js` and `js/member-layout.js`.
- Marked key create/record forms on Expenses, Contributions, Members, Fines, Meetings, Plans & Activities, Assets and Add Member.
- Denied forms are kept visible, marked View only, and their inputs are disabled; form submit is blocked in capture phase.
- Added read-only mode to the Add Member page for Secretary/Vice Secretary roles.
- Added a separate Treasurer-only permission on the historical-payment section.
- Updated frontend role checks for assets, plans/activities, member management, contribution recording and payment-evidence decisions.
- Expense status mutation buttons are intentionally unavailable while the three-slot approval model is unsupported.

### Candidate database changes
Candidate migrations added from `20261011100000` onward:
- Block authenticated direct writes to canonical contributions; canonical RPCs remain the intended accounting write path.
- Permit expense submission only with `approval_status = 'pending'`; drop direct expense update/delete policies to prevent untracked approval, rejection, restore or deletion.
- Restrict payment-evidence verification and canonical/legacy contribution payment RPCs to Treasurer.
- Remove the group-admin cross-group fallback from `cl_user_has_role`.
- Expand RLS for meetings, meeting documents, plans, activities and assets to the approved group-management roles.
- Scope `current_user_role` to the requested group, allow Treasurer member-management operations, restrict ordinary-member member-row reads to their own row, and allow authorized management roles to read the group directory.
- Restrict historical payment posting to Treasurer, including historical onboarding through the combined member-creation RPC.

No table or column was added by these migrations.

## Blocking issue: three-role expense approval

The isolated test schema has `public.expenses` fields including `approval_status`, but no separate Chair, Treasurer and Secretary approval slots, no approval table, and no expense-approval RPC/trigger that tracks three distinct approvers.

Therefore the existing schema **cannot prove** that:
1. Chairperson or Vice Chairperson approved;
2. Treasurer approved;
3. Secretary or Vice Secretary approved;
4. the same person did not satisfy multiple slots; and
5. the expense remained pending until all three distinct slots were complete.

Because the instruction is not to change database design, no columns or tables have been added. To prevent bypasses, the candidate now allows pending expense submission only and blocks direct status changes/deletes. This is a safe interim state, not a completed expense approval workflow. The three-slot requirement remains unresolved and must block release.

## Authentication and test status

Seven distinct synthetic Auth users are still required for:
- Group Admin
- Chairperson
- Vice Chairperson
- Secretary
- Vice Secretary
- Treasurer
- Ordinary Member

No supported Auth-user provisioning action was available through the connected tools. Do not insert directly into `auth.users` or repurpose the real account. Create synthetic users through the isolated test project's Supabase Dashboard → Authentication → Users, then link their generated UUIDs to the designated test member fixtures through a controlled test-only operation. The existing position-history trigger also rejects direct office-position edits; Vice Chair/Vice Secretary fixtures must be assigned through `set_member_actual_position()` after authentication is linked, not by bypassing the trigger.

**Authenticated positive/negative tests have not yet passed.** In particular, role-specific RLS/RPC tests, member privacy tests, canonical contribution idempotency/closed-period regressions, and the full expense approval matrix remain pending.

## Reconciliation findings

Read-only comparison against production found broader existing policies than the candidate matrix permits, including:
- direct contribution insert/update/delete policies in production;
- expense policies that allow direct approval-status changes and deletion;
- group-wide member-row reads for ordinary members;
- meetings and assets policies that reserve some mutations to narrower roles.

The candidate policies are being narrowed/expanded to match the approved matrix, but full function-signature, grants, trigger, RLS and migration replay reconciliation has not been completed. No production SQL was executed for these changes.

## Security advisor findings still requiring classification

The isolated test project's latest Supabase security advisor reports:
- 25 RLS-enabled tables without policies across `cl_demo`, `private` and `public`;
- the mutable-search-path warning for `private.cl_other_payment_request_guard` was cleared by the candidate migration;
- one extension-in-public warning;
- 16 anonymous-executable SECURITY DEFINER functions (down from 17 after revoking anonymous access to the authorization helpers);
- 150 authenticated-executable SECURITY DEFINER functions;
- leaked-password protection disabled.

Some findings may be intentional (for example private request tables or token-gated demo functions), but they must be individually classified and the effective grants/function guards reviewed before a release decision.

## Gate status

- [x] Candidate branch-only edits; production unchanged
- [x] Shared permission helper wired into admin and member layout boots
- [x] Key static write forms tagged for role-aware disabling
- [x] Candidate RLS/RPC hardening applied to isolated test project
- [x] Removed the cross-group group-admin fallback and restricted anonymous execution of group authorization helpers
- [x] Cleared the mutable search-path warning for `private.cl_other_payment_request_guard`
- [x] Three-slot expense blocker documented and expense status changes fail closed
- [ ] Finish dynamic-control coverage across all pages
- [ ] Create/link seven synthetic Auth users
- [ ] Run positive and negative authenticated tests for every role
- [ ] Complete canonical accounting regression tests
- [ ] Classify/remediate relevant security-advisor findings
- [ ] Replay all candidate migrations on a clean candidate database and compare definitions/policies/grants with production
- [ ] Preview/browser lifecycle and role-matrix verification
- [ ] Separate explicit release approval

Do not merge, deploy, or describe the matrix as resolved until every required gate passes and the expense-approval blocker is cleared without violating the database-design constraint.
