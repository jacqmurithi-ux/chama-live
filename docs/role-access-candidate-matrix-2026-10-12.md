# CHAMA LIVE role access audit — candidate only (2026-10-12)

## Scope and status

This matrix was assembled from the isolated test project's current `pg_policies`, selected RPC definitions, and the current `main` frontend permission matrix. It is an audit/review artifact, not proof of authenticated end-to-end behavior. Candidate migrations in this branch have **not** been applied to any database. Production remains unchanged.

Role labels: **Admin** = group Admin; **Chair/Vice-Chair**, **Secretary/Vice-Secretary**, and **Treasurer** are distinct group offices. Platform-admin access is not group-admin access.

## Table-by-table current-policy matrix

| Table / surface | Admin | Chair / Vice-Chair | Secretary / Vice-Secretary | Treasurer | Integrity boundary / audit note |
|---|---|---|---|---|---|
| `members` | Read/create/update via group-management helper and constraints. No DELETE policy found. | Read/create/update subject to `can_manage_members` and role constraints. | Read; no create/update grant through `can_manage_members`. | Read/create/update via `can_manage_members`. | Hard-delete remains blocked pending a retention/cascade review; do not delete rows anchoring financial history. |
| `groups` | Update/delete via `cl_user_has_role(..., ['admin'])`. | No group-row update/delete grant. | No group-row update/delete grant. | No group-row update/delete grant. | Cross-group access must fail for IDs outside the caller's membership. |
| `contribution_types` | Existing UPDATE/DELETE helper allows Admin. INSERT policy was broader and used direct role checks plus a group-owner alternative. | INSERT was allowed by direct role array; UPDATE/DELETE not granted. | INSERT was allowed by direct role array; UPDATE/DELETE not granted. | INSERT/UPDATE/DELETE inconsistent with the candidate UI, which assigns settings to Treasurer. | Candidate migration aligns INSERT/UPDATE/DELETE with Admin + Treasurer. |
| `contributions` | Read via group policy; no direct ledger writes in inspected RLS. | Read in group. | Read in group. | Read in group; recording is via authorized RPC. | Canonical accounting/RPCs own financial writes. Do not add direct ledger writes or bypass period locks/idempotency. |
| `contribution_allocations`, `contribution_obligations`, `member_contribution_rules` | Read as group management; no direct write grant in inspected policies. | Read where group-officer policy permits. | Read where group-officer policy permits. | Read where group-officer policy permits. | Canonical accounting, allocation and obligation changes remain RPC-owned. |
| `expenses` | Read/create pending expenses; no override of approval safeguards. | Read/create pending expenses; eligible Chair slot only if holding that office. | Read/create pending expenses; eligible Secretary slot only if holding that office. | Read/create pending expenses; eligible Treasurer slot only if holding that office. | Approval RPC enforces a different person from recorder, one person per slot, and three approved slots. Admin cannot impersonate an office slot or shortcut the rule. |
| `expense_approvals` | No Admin override for the three approval slots. | One Chair/Vice-Chair slot. | One Secretary/Vice-Secretary slot. | One Treasurer slot. | Distinct-person, distinct-slot, no-self-approval controls are mandatory. |
| `financial_periods`, `monthly_closings` | Read/update/insert under Admin policies. | Read; no direct close/update grant in inspected policies. | Read; no direct close/update grant in inspected policies. | Read/insert/update under Treasurer policies. | Closed-period restrictions and closing validation remain in force. |
| `meetings` | Read/create/update/delete through group role helper. | Same group-level CRUD policy. | Same group-level CRUD policy. | Same group-level CRUD policy. | Verify same-group references and authenticated writes. |
| `meeting_documents` | RLS helper allows group management; replacement RPC's former check was narrower/inconsistent with role normalization. | RLS allows officials; RPC permits Chair. | RLS allows officials; RPC permits Secretary. | RLS allows officials; former RPC check excluded Treasurer. | Candidate migration aligns RPC with shared helper while requiring active caller/uploader and completed meeting. |
| `attendance` | Read/write where Admin appears in attendance policy. | Insert/read as policy permits. | Insert/update/read as policy permits. | Insert/read as policy permits. | Check attendance constraints and same-group meeting/member references. |
| `group_plans`, `group_activities`, `group_assets`, `group_milestones` | CRUD through shared group-management role helper. | CRUD through helper. | CRUD through helper. | CRUD through helper. | UI/backend alignment still needs authenticated tests; no cross-group reassignment. |
| `announcements`, `documents`, `contribution_goals` | Full group CRUD policy exists. | Other role access depends on separate policies and UI action matrix. | Same. | Same. | Verify all mutations use intended role and group scope. |
| `fines`, `fine_rules`, `fine_waivers`, `fine_adjustments`, `fine_payment_allocations` | Read policies found; writes are RPC-owned/not granted directly by inspected policies. | Read under group-officer policy. | Candidate UI allows fine creation; backend RPC authorization needs verification. | Candidate UI allows create/adjust/waive/allocate subject to canonical RPC checks. | Do not add direct ledger writes; test balances, audit trail and idempotency. |
| `group_invites` | Read/create/update under invite policy. | Candidate UI permits invites; verify backend policy and alias normalization. | No candidate UI invite write grant. | Candidate UI permits invites; verify backend policy. | Must remain same-group scoped. |
| `member_payment_evidence` | Read/verify only where verifier RPC permits; submission remains member-owned. | Verify only if RPC permits; must not self-verify. | Same. | Verify only if RPC permits; must not self-verify. | Evidence remains pending until RPC verification; no direct contribution creation from client. |
| `data_import_batches`, `data_import_mappings`, `data_import_rows` | Authorized read/manage according to import policies. | No import write grant in candidate UI. | No import write grant in candidate UI. | Candidate UI allows import/post subject to role matrix. | Posting must use canonical accounting and period guards. |
| `group_support_cases` / welfare | Group-management CRUD includes Admin and officials, with separate member-created requested-case path. | Group-management CRUD via helper. | Group-management CRUD via helper. | Group-management CRUD via helper. | Preserve member self-service create-only restrictions and same-group checks. |

## Candidate corrections committed (not applied)

1. `supabase/migrations/20261012080000_align_meeting_document_rpc_admin_authorization.sql` — aligns the document replacement RPC with the RLS role helper while keeping active caller/uploader binding and completed-meeting checks.
2. `supabase/migrations/20261012080100_align_contribution_type_write_permissions.sql` — aligns contribution-type INSERT/UPDATE/DELETE with Admin + Treasurer, matching the candidate UI, and validates supplied `created_by`.
3. `js/role-permissions.js` — Admin gets full control over ordinary group actions and never sees a view-only badge, but cannot submit any expense approval action. The three independent office slots remain mandatory.

## Required tests before release

- **Authorized writes:** Admin create/edit/delete across ordinary group-management surfaces; Treasurer contribution settings and canonical contribution RPC; permitted office actions on meetings, attendance, plans, assets, welfare and fines.
- **Unauthorized writes:** Secretary/Chair/Vice-Chair direct API attempts against Treasurer-only contribution settings; ordinary member writes to group records; Admin attempts to self-approve or fill any expense slot.
- **Cross-group isolation:** each write/read RPC and RLS path using an ID from another group must fail without changing either group's records.
- **Accounting invariants:** ledger/allocations/obligations remain RPC-owned; duplicate idempotency key is safe; closed financial period is protected; balances reconcile before/after; three distinct eligible approvers remain required.
- **Authenticated browser:** test each role against relevant pages, dynamic controls, save/error messages, refresh persistence, and view-only data loading on mobile and desktop.
- **Release gate:** this audit session did not execute real authenticated role sessions, and the candidate migrations have not been applied to the isolated test DB. Do not merge, deploy, or apply migrations until these tests pass.
