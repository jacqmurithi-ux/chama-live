# CHAMA LIVE — Financial onboarding contract (candidate)

**Status:** design contract for candidate review only. This document does not authorize applying migrations or changing the production database. No UI is wired by this contract.

## 1. Boundary and scope

Group creation and financial onboarding are separate operations.

- **Group creation** creates the group, links the approved creator/admin membership (member number `0001`), and saves group settings. It must not infer historical dues, payments, credit, arrears, or an opening balance.
- **Financial onboarding** is a separate, explicit action performed after the group’s contribution policy is configured. For this candidate, scope is only the system-created creator/admin member `0001`. The existing Add Member flow is out of scope and must remain unchanged.
- Opening Group Management, refreshing settings, signing in, approving a group, or creating a group must never trigger financial onboarding implicitly.

## 2. Who initiates and authorizes it

1. The authenticated creator/admin linked to the approved creator membership `0001` initiates the action from the group they administer.
2. The server re-resolves the creator from the approved group application and membership records. It must not trust a client-supplied member ID or role.
3. The server verifies the caller is authorized to manage members for that group and that the target is the active creator/admin `0001` linked to the same authenticated user.
4. The action must not let an admin initialize another member through this creator-only contract. Ordinary member onboarding requires a separately specified contract; do not broaden this RPC.
5. If the caller/target relationship is ambiguous, membership is inactive, or more than one creator record matches, fail closed and require manual resolution.

## 3. Policy and effective-date confirmation

Before confirming, the user must see a review summary sourced from the server:

- group name;
- canonical Monthly contribution type;
- configured Monthly amount and currency;
- proposed effective date;
- first eligible obligation period;
- a clear statement that no historical dues or payments will be invented.

The user must explicitly confirm the summary. The server must re-read the group policy when processing the confirmation; a client preview is not authoritative.

Default date policy for this candidate:

- default effective date: the current database calendar date, shown to the user before confirmation;
- first obligation: the next full calendar month after the confirmed effective-date month (`next_full_period`);
- do not backdate a rule to group creation or membership join date;
- do not create an obligation for a partial/current period under this default;
- do not count future obligations as current arrears;
- if the group Monthly amount is missing or zero, stop without creating a rule and explain that the group must configure its contribution policy first.

If the user needs a different effective date or historical opening position, stop this default flow. A separate reviewed path must define the evidence, authorization, audit trail, and canonical treatment. Never infer a past payment or backdate obligations to make a dashboard balance look correct.

## 4. Server-side operation and idempotency

The explicit confirmation calls one authenticated server-side RPC. The client must not directly insert/update `member_contribution_rules`, `contribution_obligations`, `contribution_allocations`, or `contributions`.

The RPC must perform these steps transactionally:

1. Validate authenticated caller, group authorization, approved creator identity, active status, and member number `0001`.
2. Re-read the canonical Monthly amount and contribution type.
3. Serialize concurrent requests for the same group/creator.
4. Check for **any** existing rule for this member and canonical Monthly type, regardless of frequency or status. If one exists, do not silently create or rewrite another rule; return a safe “existing rule requires review/no change” result.
5. Require an explicit confirmation flag, a non-null effective date that is not before the database current date, and the Monthly amount shown in the confirmation summary. Re-read the server-side group amount and reject if the confirmed amount differs. Create at most one rule with the confirmed effective date and agreed first-period policy.
6. Call `cl_2b_refresh_member(member_id, through_month)` to let the canonical accounting engine materialize eligible obligations and allocate eligible verified payments.
7. Return a structured result identifying whether onboarding was completed, already configured/review required, or blocked by missing policy. Never claim success if the canonical refresh fails.

Repeated confirmations must not duplicate rules, obligations, or allocations. Use existing canonical constraints and refresh/idempotency behavior; do not add a parallel frontend accounting path.

## 5. Opening position: what it means

The initial position is a calculated view of canonical records, not a fabricated opening-balance row.

- Eligible dues come only from rule-backed obligations whose obligation period is due under the group’s canonical schedule and no later than the current accounting period.
- Eligible paid amounts come only from canonical allocations backed by recognized/verified contributions.
- Pending payment evidence is not a payment and must not reduce arrears.
- Unallocated or non-Monthly contributions must not be reclassified as Monthly merely to create a match.
- Future obligations must be excluded from current arrears and current-period due totals.
- With no historical rule or recognized allocation, the member starts with no invented historical dues or payments. A future rule can create future obligations only.
- Any legitimate historical opening position must be entered through a separately approved, evidence-backed, audited workflow and reconciled by the canonical accounting engine.

**Known accounting gate:** the currently inspected `get_member_contribution_position(uuid)` implementation sums all Monthly obligations without limiting them to due periods. That can misstate a future obligation as current arrears. Do not use that function as proof of the opening position until a candidate-only due-period fix is tested. Do not patch production as part of this workflow.

## 6. Audit and user feedback

Record the initiating authenticated user/member, group, target creator member, confirmed policy values, effective date, first obligation period, outcome, timestamp, and any blocked/review reason in the approved audit mechanism. Do not log secrets or payment proof contents.

The UI should distinguish:
- **Not financially set up** — group/member exists, no creator Monthly rule was initialized;
- **Ready to confirm** — policy and proposed date can be reviewed;
- **Completed** — canonical rule and refresh succeeded;
- **Already configured / needs review** — existing rule prevented automatic change;
- **Blocked** — policy missing, authorization/identity mismatch, or canonical refresh failed.

## 7. Required candidate tests before UI wiring

- Group creation alone creates no creator contribution rule or historical obligation.
- Opening/reloading Group Management creates no financial rule or obligation.
- Unauthenticated callers and unauthorized group admins are rejected.
- Caller cannot target a different member or another group.
- Only approved active creator/admin member `0001` is eligible.
- Missing/zero Monthly amount stops without writes.
- Confirmation uses the server-validated policy and confirmed effective date.
- Default next-full-period policy creates no current/partial-period arrears.
- Existing Monthly rule, and any other-frequency rule for the canonical Monthly type, prevents silent duplication.
- Concurrent/repeated confirmation produces at most one rule and canonical obligations/allocations.
- Canonical refresh failure rolls back the operation.
- Pending evidence and `other` contributions do not count as verified Monthly allocations.
- Future obligations do not appear as current arrears.
- Existing Add Member behavior is unchanged.
- Production database, schema, RPCs, and deployment remain untouched during candidate testing.

## 8. Implementation status

The candidate migration `20261014103000_creator_member_0001_monthly_rule_candidate.sql` now accepts `p_effective_date`, `p_confirmed_monthly_amount`, and `p_confirm`; it rejects a missing confirmation, a backdated date, a missing/non-positive confirmed amount, and a confirmed amount that no longer matches the server-side group policy. It still has no UI confirmation step, and these database changes have not been applied or exercised against an isolated candidate database. The due-period defect in `get_member_contribution_position(uuid)` also remains unresolved: the exact deployed function definition must be captured in the isolated candidate environment before preparing a safe replacement. Keep the PR draft and unmerged until the RPC, position calculation, and candidate tests pass.
