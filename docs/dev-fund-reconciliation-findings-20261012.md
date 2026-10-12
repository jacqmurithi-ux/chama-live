# Dev fund accounting reconciliation — 12 October 2026

## Confirmed production facts (read-only audit)
- Existing contribution: KSh 250, 7 October 2026, contribution type Dev fund.
- Existing contribution ID: `1ad63122-429b-4141-bff0-b2289795054f`.
- Member on that contribution: James Mwangi (member no. 0002).
- Existing allocation count: 0; allocated amount: KSh 0.
- Dev fund type ID: `cc622a14-257a-4b5a-90de-4f6964bff9bc`.
- Active Dev fund member rule belongs to `projecte2600`, KSh 250 one-time, effective 6 October–2 November 2026.
- Active October Dev fund obligation is period-backed and belongs to `projecte2600`; its `rule_id` is null.
- No Dev fund member rule was found for James Mwangi.

## Why the existing workflow is insufficient
- The canonical `cl_2b_record_contribution` overload inspected supports Monthly only.
- `record_custom_contribution_payment` records a *new* contribution and is not a safe reconciliation mechanism for an existing payment.
- The app's group-management API does not expose a correction RPC for retargeting a period-backed custom contribution obligation/rule while reconciling an already-recorded payment.
- Existing allocation triggers enforce same-group and accounting-envelope invariants; direct SQL writes would bypass the requested supported accounting workflow.

## Required implementation before correcting production
1. Add a narrowly scoped, authenticated, idempotent accounting correction RPC (or extend an existing sanctioned workflow) that can:
   - validate an open October financial period and the exact existing payment identity;
   - ensure the Dev fund obligation/rule is assigned to James Mwangi rather than `projecte2600`;
   - preserve the payment's ID, amount, date, member, and payment history;
   - use canonical allocation/refresh logic and all existing accounting locks;
   - refuse if any conflicting allocation, closed period, or duplicate obligation is found;
   - record actor, reason, before/after identifiers, and an idempotency key;
   - return a before/after reconciliation summary.
2. Test against a candidate database clone with positive/negative role tests, retry/idempotency tests, closed-period rejection, allocation conservation, and member cumulative accounting.
3. After review and explicit production authorization, execute the sanctioned workflow once and re-query the payment, rule, obligation, allocation, dashboard, and Reports.
4. Never create a replacement contribution or assign James's payment to `projecte2600`.

## Status
Blocked pending implementation and candidate tests for the supported correction workflow. No production write was made during this audit.
