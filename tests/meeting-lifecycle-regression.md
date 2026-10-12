# Meeting lifecycle and Reports regression gate

Candidate branch: `candidate/meeting-lifecycle-reports-20261012`

## Migration / database
- [ ] Replay the migration on a clean candidate database.
- [x] Apply/replay the meeting lifecycle, guard-trigger patch, and Dev fund workflow migrations twice against the existing candidate test schema; each replay succeeded.
- [x] Existing candidate data remained readable after replay (8 meeting rows retained).
- [x] Existing upcoming/completed rows remain readable after migration (candidate test database; 8 meetings retained).
- [x] Candidate database status check permits only upcoming, held_pending_minutes, completed, cancelled, postponed.
- [ ] Status history is readable by authenticated members of the same group only.
- [x] Candidate database grants: anonymous SELECT/INSERT denied; authenticated SELECT granted; authenticated INSERT/UPDATE/DELETE denied for status history.
- [x] Candidate SQL RLS test with authenticated JWT claims: same-group member can read meeting status history; an admin belonging only to another group cannot read it. The first test exposed the global-admin fallback in cl_user_in_group; the history policy was narrowed to direct same-group membership and the retest passed.
- [x] Candidate SQL negative test: authenticated direct INSERT into meeting status history is denied.
- [ ] Repeat RLS checks in real browser-authenticated sessions; SQL JWT-claim tests are not browser E2E.
- [x] SQL negative test: cancellation without a reason is rejected.
- [x] SQL positive test: postponement with a reason and later date, then reschedule to the proposed date, succeeds.
- [x] SQL negative test: postponement without a later proposed date is rejected by the lifecycle guard.
- [x] SQL negative test: direct INSERT with a non-Upcoming initial status is rejected.
- [x] SQL negative tests: direct Upcoming → Completed, completion without minutes, without resolution/no-resolution choice, and without attendance are rejected.
- [x] SQL positive test: Held → Completed succeeds after minutes, explicit no-resolution, and attendance are recorded.
- [x] SQL transaction test asserted audit actor user/member, timestamp, from/to status, and reason; transaction rollback preserved the original meeting. RLS visibility still needs real authenticated-session assertions.

## Meetings UI (authenticated)
- [ ] Schedule/edit/view a meeting in browser; group isolation and existing permission rules remain intact.
- [x] Candidate SQL RLS test with authenticated JWT claims: admin, chairperson, secretary, and treasurer can read/update group attendance; an ordinary member sees only their own attendance and cannot update another member's row. Candidate policies now align with the UI's officer roles.
- [ ] Upcoming → Held — minutes pending.
- [ ] Held → Completed with minutes, resolution or explicit no-resolution, and full attendance.
- [ ] Attempt completion with missing minutes, resolution choice, or attendance; clear actionable validation appears and DB remains unchanged.
- [ ] Upcoming/Held → Cancelled requires reason.
- [ ] Upcoming/Held → Postponed requires reason and later date.
- [ ] Postponed → Upcoming uses the proposed date and clears the proposed-date field.
- [ ] Cancelled → Upcoming restore works.
- [ ] Status history renders safely and accurately; special characters in notes are escaped.
- [ ] Past-dated Upcoming rows display “Action required · confirm outcome”; status is not silently rewritten.
- [ ] Unknown status displays Review, not Upcoming.
- [ ] Mobile layout, filters, refresh, attendance save, minutes save, and permission gates work.

## Expense approval workflow (candidate only)
- [x] Candidate SQL JWT-claim test: expense recorder cannot approve their own pending expense.
- [x] Candidate SQL JWT-claim test: chair, treasurer, and secretary approve as three distinct users; status remains pending after approvals one and two, then becomes approved after the third.
- [x] Candidate SQL JWT-claim negative tests: vice-chair duplicate chair slot rejected; treasurer rejection marks the expense rejected.
- [ ] Browser-authenticated officer tests and ordinary-member denial remain required before release.

## Reports and exports
- [x] Candidate data arithmetic check: existing 8-meeting fixture counts sum to Total (1 Upcoming + 7 Completed = 8); status-category sum formula includes held, cancelled, postponed, and Other/Review.
- [ ] Verify the same count reconciliation in an authenticated browser with the production-shaped meeting set.
- [ ] October 11 Invest appears as Held — minutes pending after the authorised transition, until its record is completed.
- [ ] Agenda, status, reason, and resolution are rendered accurately.
- [x] Candidate source/preview checks: Meetings and Reports HTML/JS respond HTTP 200; the Meetings page has one status-history host/content ID; filters include all five lifecycle states plus Review.
- [x] Candidate source check: Reports table, CSV, Excel, and sorted-view export include lifecycle status labels, reason/follow-up, minutes state, attendance summary, and resolution/no-resolution label.
- [ ] Browser-authenticated CSV, Excel, Download Sorted Report, and Print downloads verified byte-for-byte against visible meeting rows.
- [ ] Reports and Meetings reconcile for identical date/group filters in authenticated browser sessions, including attendance and minutes.
- [ ] All existing canonical accounting, expenses, membership, and custom contribution report checks still pass.

## Dev fund correction workflow (candidate only)
- [x] Apply/replay the candidate correction migration to the isolated test database after the allocation-schema compatibility change; synthetic fixture still passes.
- [x] Synthetic existing-payment fixture: reassign matching active rule and period-backed obligation to the payment's intended member; allocate the existing KSh 250 payment without creating a second contribution.
- [x] Read-only production schema review: `contribution_allocations` has only the canonical `payment_id`, `obligation_id`, and `amount` fields; the candidate function now selects a compatible insert shape based on actual columns.
- [x] Transactionally exercise the canonical three-column allocation INSERT against a temporary production-shaped table definition; trigger reached the expected payment guard, and rollback restored all three candidate-only columns, the original RLS policy, and the original 98 allocation rows.
- [x] Full correction RPC end-to-end against a temporary production-shaped allocation table inside a candidate transaction, using the production canonical refresh function definition: existing payment preserved, exactly one KSh 250 allocation, obligation and rule reassigned to the intended candidate member, idempotent retry, and unauthorized role rejected.
- [x] Transaction rollback verified: candidate allocation schema restored with all 98 original allocation rows; synthetic member/payment/request absent.
- [x] Verify allocated amount = KSh 250 and unapplied amount = KSh 0.
- [x] Retry same request ID and confirm idempotent replay.
- [x] Negative role test: unrelated authenticated user is denied.
- [x] Verify all synthetic fixture rows and audit request are removed after the test.
- [ ] Production payment/rule/obligation reconciliation; intentionally not run before the authenticated workflow and release gate pass.

## Release gate
Do not merge or deploy until authenticated browser checks, export file checks, permission negatives, and migration replay pass. No production migration or meeting-status change is performed by this candidate PR.
