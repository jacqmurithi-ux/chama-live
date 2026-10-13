# CHAMA LIVE schema recovery and module gates

Status date: 2026-10-13

## Safety boundary

- Production Supabase project `ptktftwyltxmtcodyzoa` is read-only for this work.
- Do not apply migrations, run DDL/DML, replace RPCs, or merge a development branch into production without explicit authorization.
- Candidate project `gkqkfgsizzezqorxzwed` currently has no application base tables in `public` or `private`; do not apply feature migrations until a verified production-shaped schema baseline is restored there.
- This file records progress only. It is not a production schema dump or a deployment approval.

## Read-only production inventory confirmed

- `public`: 62 base tables, 2 views, 1 sequence.
- `private`: 12 base tables.
- Functions in `public` and `private`: 172 total (153 SECURITY DEFINER).
- Production migration history returned 178 entries.
- Eight `private` tables have RLS disabled. Existing inventory indicates `anon` and `authenticated` lack USAGE on `private` and direct SELECT on those tables; nevertheless, SECURITY DEFINER call paths and grants must be included in the export/security review. Do not enable RLS blindly without reviewing required internal access paths.
- Two public tables, `charge_payments` and `financial_charges`, have both RLS enabled and FORCE RLS enabled.
- `public.expense_approvals` exists in production and must be included in the baseline export.
- Known production differences from the old reference include `fines.imposed_at`, `fines.reason`, `fines.source_type`, `group_contribution_settings.monthly_grace_days`, extra policies, and extra triggers. Use current catalog definitions, not the old reference, as authority.

## Export acceptance checklist

- [ ] Obtain a complete schema-only export using a supported database dump method; include schemas, tables, columns, defaults, identity/sequence definitions, constraints, indexes, views, functions and overloads, triggers, RLS enable/force flags and policies, grants/column ACLs, ownership, comments, and relevant extension dependencies.
- [ ] Keep application data out of the schema-only export.
- [ ] Compare the export with live catalog counts and object inventories.
- [ ] Restore into an isolated scratch database/project and resolve dependency/restore errors.
- [ ] Preserve the recovered production baseline as a distinct section/artifact.
- [ ] Add only reviewed Phase 0/1/2 candidate migrations to the combined candidate export; clearly label them as additions not present in production.
- [ ] Run authorization, isolation, audit, calculation, lifecycle, and regression tests.
- [ ] Record checksums, exact tool versions, restore/test results, and unresolved gaps.
- [ ] Only then produce the final combined `chamalive-schema.sql`.

## Module gate status

### Phase 0 — optional module toggles

Draft migration: `supabase/migrations/20261013090000_optional_group_modules_phase0.sql`

Status: NOT PASSED. The draft defines settings and audit tables plus settings/helper RPCs, but navigation, dashboard integration, shared `canWrite(page)`, comprehensive role permissions, disabled-module blocking tests, and audit coverage for all feature actions are not verified.

### Phase 1 — Merry-go-round and loans

Draft migration: `supabase/migrations/20261013100000_merry_go_round_and_loans_workflows.sql`

Status: UNAPPROVED / DO NOT APPLY. Known blockers include:
- Loan repayment function references `v_member_id` without declaring it.
- No complete group-configurable loan settings, reducing-balance calculation, installment schedule, due dates, late penalties, guarantor workflow, or overdue reporting.
- Merry-go-round is missing the full required payout-order modes, safe pre-round swaps, late-payment states/fines, and notification workflow.
- Audit logging for every feature action is incomplete.
- Role-based permissions and all SECURITY DEFINER access paths require a complete review.
- UI pages and end-to-end authenticated tests are not complete.

### Phase 2 — Loans completion

Not started. Must implement and test settings, application, decisions/approver evidence, optional guarantors, disbursement, a canonical backend schedule/calculation function, repayments allocated to installments, penalties, status transitions, member-only own-loan visibility, officer reports/statements, notifications, and complete audit coverage.

## Export rule

The final export must include the recovered schema plus the reviewed optional-module additions in one clearly labeled artifact. Do not present candidate additions as existing production objects. Do not label the artifact complete or validated until the acceptance checklist has evidence for each required gate.
