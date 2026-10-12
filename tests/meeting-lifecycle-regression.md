# Meeting lifecycle and Reports regression gate

Candidate branch: `candidate/meeting-lifecycle-reports-20261012`

## Migration / database
- [ ] Replay the migration on a clean candidate database and on a copy of the current schema.
- [ ] Existing upcoming/completed/cancelled rows remain readable.
- [ ] Status check permits only upcoming, held_pending_minutes, completed, cancelled, postponed.
- [ ] Status history is readable by authenticated members of the same group only.
- [ ] Anonymous users cannot read or write status history.
- [ ] Authenticated users cannot insert/update/delete history rows directly.
- [ ] Cancelled/postponed transitions without a reason fail.
- [ ] Postponed transitions without a later proposed date fail.
- [ ] Completion fails unless status was held_pending_minutes, minutes exist, resolution exists or no-resolution is confirmed, and every active member has an attendance row.
- [ ] Status transition audit records actor, time, from/to status, and reason.

## Meetings UI (authenticated)
- [ ] Schedule/edit/view a meeting; group isolation and existing permission rules remain intact.
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
- [ ] CSV, Excel, Download Sorted Report, and Print contain the same visible meeting statuses.
- [ ] Reports and Meetings reconcile for identical date/group filters.
- [ ] All existing canonical accounting, expenses, membership, and custom contribution report checks still pass.

## Release gate
Do not merge or deploy until authenticated browser checks, export file checks, permission negatives, and migration replay pass. No production migration or meeting-status change is performed by this candidate PR.
