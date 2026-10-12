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
- [x] Candidate SQL RLS test with authenticated JWT claims: same-group member can read meeting status history; an admin belonging only to another group cannot read it.
- [x] Candidate SQL negative test: authenticated direct INSERT into meeting status history is denied.
- [ ] Repeat RLS checks in real browser-authenticated sessions; SQL JWT-claim tests are not browser E2E.
- [x] SQL negative test: cancellation without a reason is rejected.
- [x] SQL positive test: postponement with a reason and later date, then reschedule to the proposed date, succeeds.
- [ ] SQL negative test: postponement without a later proposed date fails.
- [x] SQL negative test: direct INSERT with a non-Upcoming initial status is rejected.
- [x] SQL negative tests: direct Upcoming → Completed, completion without minutes, without resolution/no-resolution choice, and without attendance are rejected.
- [x] SQL positive test: Held → Completed succeeds after minutes, explicit no-resolution, and attendance are recorded.
- [x] SQL fixture test verified expected lifecycle history row count; exact actor/time/from/to/reason contents and RLS visibility still need independent assertions.

## Meetings UI (authenticated)
- [ ] Schedule/edit/view a meeting in browser; group isolation and existing permission rules remain intact.
- [x] Candidate SQL RLS test with authenticated JWT claims: admin, chairperson, secretary, and treasurer can read/update group attendance; an ordinary member sees only their own attendance and cannot update another member's row.
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

## Reports and exports
- [ ] Upcoming, Held — minutes pending, Completed, Cancelled, Postponed, and Other/Review counts sum exactly to Total.
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
- [ ] Exercise the canonical three-column allocation branch on an isolated production-shaped database before release.
- [x] Verify allocated amount = KSh 250 and unapplied amount = KSh 0.
- [x] Retry same request ID and confirm idempotent replay.
- [x] Negative role test: unrelated authenticated user is denied.
- [x] Verify all synthetic fixture rows and audit request are removed after the test.
- [ ] Production payment/rule/obligation reconciliation; intentionally not run before the authenticated workflow and release gate pass.

## Release gate
Do not merge or deploy until authenticated browser checks, export file checks, permission negatives, and migration replay pass. No production migration or meeting-status change is performed by this candidate PR.
