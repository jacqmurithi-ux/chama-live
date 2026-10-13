# CHAMA LIVE Phase 0 Scratch Verification Report — 2026-10-13

## Decision

**NOT CLEARED. Do not apply the Phase 0 migration to production.**

All database observations below are read-only. No migration, DDL, DML, synthetic records, test RPC, RLS change, or financial transaction was applied to either database during this verification. Frontend changes are isolated to branch `phase0/module-aware-navigation-gate`.

## 1. Scratch restore and schema comparison

Scratch project: `gkqkfgsizzezqorxzwed` (`eu-west-2`, PostgreSQL 17.11).  
Production project: `ptktftwyltxmtcodyzoa` (`eu-west-1`, PostgreSQL 17.6).

Live read-only catalog queries found:

| Check | Production | Scratch | Result |
|---|---:|---:|---|
| Base tables in `public` | 62 | 0 | FAIL — all 62 production tables absent from scratch |
| Base tables in `private` | 12 | 0 | FAIL — all 12 production tables absent from scratch |
| Total base tables in these schemas | 74 | 0 | FAIL — scratch does not currently reflect the restored application schema |
| `public.groups` | present | missing | FAIL |
| `public.members` | present | missing | FAIL |
| `public.cl_user_has_role(uuid,text[])` | present | missing | FAIL |
| `public.cl_assert_group_module_enabled(uuid,text)` | not verified as a production deployment target; Phase 0 candidate function is in the migration | missing | Scratch prerequisite absent |

The Supabase project metadata identifies scratch as PostgreSQL 17.11. Its live catalog has standard Supabase `auth` and `storage` objects, but no base tables in `public` or `private`. Therefore the Phase 0 migration cannot safely be tested there as written: it depends on the existing `public.groups`, `public.members`, and `public.cl_user_has_role()` contracts.

### Production tables absent from scratch

- `public` (62): announcements, attendance, audit_deleted_rows, charge_payments, contribution_allocations, contribution_goals, contribution_initiative_allocations, contribution_initiative_credit_consumptions, contribution_initiative_credits, contribution_initiative_member_terms, contribution_initiative_members, contribution_initiative_obligations, contribution_initiative_payment_reversals, contribution_initiative_periods, contribution_initiatives, contribution_obligations, contribution_periods, contribution_types, contributions, data_import_batches, data_import_mappings, data_import_rows, documents, expense_approvals, expenses, feedback, financial_charges, financial_periods, fine_adjustments, fine_payment_allocations, fine_rule_contribution_types, fine_rules, fine_waivers, fines, group_activities, group_applications, group_assets, group_contribution_calendar_periods, group_contribution_settings, group_invites, group_milestones, group_plans, group_subscriptions, group_support_cases, groups, meetings, member_contribution_rules, member_payment_evidence, member_position_history, members, monthly_closings, pending_onboarding, platform_activity, platform_admins, subscription_credits, subscription_cycles, subscription_invoice_lines, subscription_invoices, subscription_member_billing, subscription_payment_allocations, subscription_payments, subscription_pricing_tiers.
- `private` (12): contribution_initiative_requests, custom_contribution_activation_requests, custom_contribution_payment_requests, custom_contribution_period_requests, custom_contribution_requests, member_historical_onboarding_requests, member_historical_payment_requests, other_contribution_cycle_audit, other_contribution_cycle_requests, other_contribution_payment_requests, renewal_attempts, renewal_runs.

Because those tables are absent in scratch, per-table row counts cannot be compared meaningfully: each of the 74 production tables is **missing**, rather than present with a zero row count. The checksum, extension comparison, and row-count report mentioned in the request were not included in the message received; no checksum match or row-count parity is claimed.

## 2. Extension comparison

Read-only `pg_extension` comparison:

| Extension | Production | Scratch | Result |
|---|---|---|---|
| `btree_gist` | 1.7 | absent | DIFFERENCE |
| `pg_cron` | 1.6.4 | absent | DIFFERENCE |
| `pg_stat_statements` | 1.11 | 1.11 | match |
| `pgcrypto` | 1.3 | 1.3 | match |
| `plpgsql` | 1.0 | 1.0 | match |
| `supabase_vault` | 0.3.1 | 0.3.1 | match |
| `uuid-ossp` | 1.1 | 1.1 | match |

These differences further confirm scratch is not yet a production-shaped restore. Do not attempt to patch extensions or replay the migration until the restore has been reconciled.

## 3. Phase 0 migration inventory

Candidate migration reviewed (not applied to either database in this run):

`supabase/migrations/20261013090000_optional_group_modules_phase0.sql`

Tables:
- `public.group_module_settings` — per-group flags `merry_go_round_enabled` and `loans_enabled`, default OFF.
- `public.group_module_audit_log` — settings change audit entries.

Functions/RPCs:
- `public.get_group_module_settings(uuid)`
- `public.update_group_module_settings(uuid, boolean, boolean)`
- `public.cl_assert_group_module_enabled(uuid, text)`
- Trigger function `public.cl_log_group_module_settings_change()` and trigger `trg_group_module_settings_audit`.

The migration includes RLS policies for its two new tables and grants authenticated access to the three user-facing RPCs. This source review does not prove the migration compiles against the restored schema or that policies behave correctly under authenticated sessions.

## 4. Frontend changes prepared on the isolated branch

Branch: `phase0/module-aware-navigation-gate`

Changed/added:
- `js/admin-layout.js`: loads per-group settings using `get_group_module_settings`; hides optional module links unless the matching flag is true; fails closed if settings cannot be loaded; redirects direct visits to a disabled/unavailable module page to `dashboard.html`.
- `merry-go-round.html`: guarded placeholder; clearly states the feature is not implemented and cannot record transactions.
- `loans.html`: guarded placeholder; clearly states the feature is not implemented and cannot record transactions.
- `supabase/tests/scratch_only_module_guard_probe.sql`: scratch-only authenticated RPC probe that calls `cl_assert_group_module_enabled`. It is deliberately outside the migrations directory and must never be deployed to production.

The ROSCA/loan business pages and transaction RPCs remain unimplemented. The placeholders are only for Phase 0 routing/access-control checks, not usable financial features.

## 5. Eight-gate results

| # | Gate | Result | Evidence / failure |
|---:|---|---|---|
| 1 | Backup integrity and successful isolated restore | **FAIL / BLOCKED** | Scratch has zero `public` and `private` base tables, versus 74 in production; `groups`, `members`, and role helper are missing. The checksum/count evidence referenced in the request was not present in the received message. |
| 2 | Migration review; production remains untouched | **PASS for source review and no-production-change condition** | Migration reviewed. No production or scratch migration was executed. |
| 3 | Synthetic per-group switches default OFF and save correctly | **NOT RUN** | Requires a restored schema, test identities, and authenticated session. |
| 4 | Disabled modules hidden from all navigation | **CODE CHECK PASS; RUNTIME NOT TESTED** | Desktop and mobile drawer use filtered navigation groups. Browser/mobile verification is still required. |
| 5 | Direct URL and backend guard enforcement | **CODE/TEST PROBE PREPARED; RUNTIME NOT TESTED** | Direct page guard fails closed; scratch-only probe file calls the backend guard. It could not be installed or executed because the required schema and guard function are absent. |
| 6 | Admin and view-only role behavior | **NOT RUN** | No synthetic users/officials or authenticated role sessions could be created on the missing schema. |
| 7 | Audit records and group isolation | **NOT RUN** | Requires tables, migration, synthetic groups and authenticated tests. |
| 8 | Complete report including all failures/fixes | **PARTIAL** | This report records current findings and code changes. Final runtime report must be regenerated after restore repair and tests. |

## 6. Failures found and changes made

Failures/gaps found:
1. Scratch project does not contain the restored application schema: 74 production `public`/`private` tables are missing.
2. Scratch is missing `btree_gist` and `pg_cron` extensions present in production.
3. No synthetic groups, members, admins, or officials were created because prerequisite schema is absent.
4. Phase 0 migration was not compiled or run against scratch; switch, RLS, audit, role, and group-isolation runtime behavior remains unverified.
5. ROSCA/loan RPCs and pages did not exist in the source inventory. Two non-transactional placeholder pages and a scratch-only guard probe were added on the candidate branch.
6. Navigation and direct-URL controls were source-updated but not browser-tested.

Changes made:
- Added optional-module settings loading and fail-closed filtering/direct-route checks to `js/admin-layout.js` on the candidate branch.
- Added guarded placeholder pages for Merry-go-round and Loans.
- Added a scratch-only guard probe SQL file, outside production migrations.
- No production database changes, no scratch database changes, no RLS changes to existing tables, and no financial transactions.

## 7. Separate mandatory Phase 2 (Loans) gate

The following production tables remain a separate RLS/security gate and were not changed:
- `private.renewal_runs`
- `private.renewal_attempts`
- `private.member_historical_onboarding_requests`
- `private.contribution_initiative_requests`
- `private.member_historical_payment_requests`
- `private.custom_contribution_payment_requests`
- `private.custom_contribution_period_requests`
- `private.custom_contribution_activation_requests`

They must be resolved before Phase 2 (Loans), independently of Phase 0.

## 8. Required next step

Reconcile the scratch restore until `public.groups`, `public.members`, the existing role helper, and the production application tables are present. Compare the dump checksum and extension inventory; then provide or rerun exact row counts for all 74 tables. Only then run the migration in scratch, create synthetic-only identities and groups, install the scratch-only probe, and execute all eight gates. Do not apply the migration to production until the full runtime report has passed and has been reviewed by the user.
