# CHAMA LIVE candidate regression gate: canonical monthly accounting and expense approvals

## Scope and safety

This is a candidate-only change. Do not apply these migrations to production or merge/deploy until all gates below pass. The accounting change only aligns allocation aggregation with the existing rule-backed monthly obligation set; it does not create, update, delete, or reallocate any financial records.

## Finding: unallocated Dev fund payment

Production read-only inspection found contribution `1ad63122-429b-4141-bff0-b2289795054f`, dated 2026-10-07, for KSh 250, type `Dev fund`, recorded for James Mwangi, with no allocation. The only Dev fund obligation found in the group for October belongs to projecte2600, not James Mwangi. Do not allocate this payment until the intended payer/obligation is confirmed.

## Canonical monthly status regression

The current canonical function calculates monthly due from obligations where `rule_id IS NOT NULL`, but the allocation aggregate included all obligation types. On the inspected E2600 data, October reported KSh 900 applied against KSh 800 of rule-backed monthly due. The candidate migration adds the same `rule_id IS NOT NULL` scope to allocation aggregation.

After applying the migration to an isolated candidate database, test:
- September 2026 and October 2026 status RPC return rows and the same member set expected for each month.
- `applied_this_month` is calculated only from rule-backed monthly obligations.
- A custom obligation/payment remains visible to its own custom-contribution workflow and does not inflate monthly contribution status.
- Sum of monthly allocations per member/month does not exceed the corresponding monthly payments or rule-backed obligations without an explicitly documented carry-forward/credit rule.
- The canonical summary RPC agrees with the row-level monthly status output.
- Existing idempotency, closed-period locks, ledger rows, and allocation rows remain unchanged by the read-only regression.

## Three-person expense approval rules

The candidate RPC requires all of the following:
- Only pending expenses can receive decisions.
- Missing or unverifiable recorder identity blocks approval.
- Recorder identity is resolved through `expenses.recorded_by -> members.id -> members.user_id/auth_user_id`; a recorder cannot approve their own expense.
- Three distinct office slots are required: Chair/Vice Chair, Treasurer, Secretary/Vice Secretary.
- One person cannot vote twice; one person cannot fill two office slots; an office slot can be filled only once.
- Group Admin is not an approval office.
- A rejection immediately changes the expense to rejected; fewer than three approvals leave it pending; three approvals change it to approved.
- Direct client inserts with a non-pending status and direct status updates/deletes are denied.
- Users outside the group, inactive members, ordinary members, duplicate voters, same-office substitutes, and the recorder are denied.
- Read-only group members can view approval progress only for their own group.

## Required authenticated browser tests

Use real portal sessions for each active Chair/Vice Chair, Treasurer, Secretary/Vice Secretary, Admin, and ordinary-member test account. Do not substitute simulated JWT claims for browser-authenticated evidence.

1. Submit a new expense; verify status is pending and recorder cannot approve it.
2. Obtain approval from one eligible office; status remains pending.
3. Attempt a second approval from the same office family (e.g. Vice Chair after Chair); deny.
4. Attempt a second vote from the same person; deny.
5. Obtain second distinct office approval; status remains pending.
6. Obtain third distinct office approval; status becomes approved.
7. Test rejection, missing recorder, inactive/missing membership, group mismatch, direct status update, direct insert as approved, direct delete, and unauthorized RPC calls; all must fail safely.
8. Confirm the approval UI compares `recorded_by` to the current member ID, not the auth-user ID.
9. Repeat read-only September/October canonical summary and custom contribution checks for the four designated officer accounts; capture screenshots/network errors and verify all group-scoped expense, meeting, membership and report views.

## Current verification state

- Production read-only SQL regression: found the KSh 250 unallocated custom payment and October monthly allocation-scope mismatch.
- SQL-level canonical RPC invocation using simulated JWT subject claims: September and October returned status rows for admin, chairperson, secretary and treasurer identities. This is not a real authenticated browser test.
- Candidate code: migration files added on `candidate/expense-three-person-approval-hardening`; no candidate database migration execution or end-to-end browser test has yet been performed.
- Production accounting records/functions were not modified by the candidate code changes.
