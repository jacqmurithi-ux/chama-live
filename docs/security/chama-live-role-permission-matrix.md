# CHAMA LIVE — Group Role Permission Matrix

Status: approved target specification for candidate implementation. This document is not proof that every permission is implemented or tested. Production remains unchanged until the candidate passes all required checks and separate deployment approval is given.

## Scope and role separation

Platform Admin is a platform-level role, not a group-management role. Platform Admin retains full platform write access everywhere and is not included in group role columns or group expense approval slots.

Group roles:
- Group Admin
- Chairperson
- Vice Chairperson
- Treasurer
- Secretary
- Vice Secretary
- Ordinary Member

Chairperson and Vice Chairperson share the same permissions. Secretary and Vice Secretary share the same permissions, except that each may independently fill the Secretary approval slot for expenses. A person’s approval may satisfy only one approval slot.

## Permission terms

- **Full access:** view and use the page’s authorized functionality.
- **Manage:** view, create, edit and delete records within the page’s scope and backend safeguards.
- **View only:** page and permitted data load normally; no write or approval actions are available.
- **No:** action is not allowed.
- Treasury restrictions, accounting invariants, audit controls, group isolation, and backend authorization apply even when a role has broad page access.

## Dashboard, reports and membership

| Page / action | Group Admin | Chair / Vice Chair | Treasurer | Secretary / Vice Secretary | Ordinary Member |
|---|---|---|---|---|---|
| Group dashboard | Full access | Full access | Full access | Full access | Own permitted view |
| Group reports, charts and exports | Full access | Full access | Full access | Full access | Own permitted reports |
| Member list and membership records | Full access | Full access | Full access | View only | Own profile only |
| Search/filter member records | Full access | Full access | Full access | View only; search/filter allowed | Own records only |
| Add members | Manage | Manage | Manage | No | No |
| Edit/overwrite member records | Manage | Manage | Manage | No | No |
| Remove members | Manage | Manage | Manage | No | No |
| Group financial position | Full access | Full access | Full access | Full access | Own permitted position |
| Other members’ private financial records | Authorized group access | Authorized group access | Authorized group access | Only if explicitly authorized | No |

## Meetings, Plans & Activities, and Assets

| Page / action | Group Admin | Chair / Vice Chair | Treasurer | Secretary / Vice Secretary | Ordinary Member |
|---|---|---|---|---|---|
| Meetings — view | Full access | Full access | Full access | Full access | View only |
| Meetings — create/edit/delete | Manage | Manage | Manage | Manage | No |
| Plans & Activities — view | Full access | Full access | Full access | Full access | View only |
| Plans & Activities — create/edit/delete | Manage | Manage | Manage | Manage | No |
| Assets — view | Full access | Full access | Full access | Full access | View only |
| Assets — create/edit/delete | Manage | Manage | Manage | Manage | No |

## Contributions and payment evidence

| Page / action | Group Admin | Chair / Vice Chair | Treasurer | Secretary / Vice Secretary | Ordinary Member |
|---|---|---|---|---|---|
| Contribution dashboard and reports | Full access | Full access | Full access | Full access | Own permitted view |
| View contribution records | Authorized group view | Authorized group view | Authorized group view | View only | Own records |
| Record canonical contributions directly | No | No | Authorized workflow | No | No |
| Record historical member payments | No by default | No | Authorized workflow | No | No |
| View payment evidence | Authorized group view | View only | Authorized group view | View only | Own submissions |
| Verify payment evidence | No | No | Yes | No | No |
| Approve/reject payment evidence | No | No | Yes | No | No |
| Reverse contribution payments | No by default | No | Authorized workflow | No | No |
| Change contribution financial settings | No by default | No | Authorized workflow | No | No |

Payment evidence decisions are Treasurer-only. Approving evidence must not bypass canonical accounting controls or create duplicate contribution entries.

## Expenses and mandatory three-role approval

| Page / action | Group Admin | Chair / Vice Chair | Treasurer | Secretary / Vice Secretary | Ordinary Member |
|---|---|---|---|---|---|
| View expenses and approval status | Authorized group view | Full access | Full access | Full access | View only |
| Submit/create expenses | Subject to existing authorization | Allowed | Allowed | Allowed | No by default |
| Satisfy Chair approval slot | No | Chairperson or Vice Chairperson | No | No | No |
| Satisfy Treasurer approval slot | No | No | Treasurer | No | No |
| Satisfy Secretary approval slot | No | No | No | Secretary or Vice Secretary | No |
| Record a fully approved expense | No by default | Authorized workflow | Authorized workflow | Authorized workflow | No |
| Override missing approvals | No | No | No | No | No |

Expense approval must require all three distinct slots: (1) Chairperson or Vice Chairperson, (2) Treasurer, and (3) Secretary or Vice Secretary. One person cannot satisfy more than one slot. After one or two approvals, the expense remains pending and the UI identifies who approved and which slots remain. Only after all three slots are satisfied may the expense proceed through the authorized recording process. Platform Admin cannot substitute for any group approver or bypass the three approvals.

## Fines and financial periods

| Page / action | Group Admin | Chair / Vice Chair | Treasurer | Secretary / Vice Secretary | Ordinary Member |
|---|---|---|---|---|---|
| View fines and fine balances | Authorized group view | Authorized group view | Authorized group view | View only | Own records |
| Create manual member fines | No by default | No | Authorized workflow | Yes | No |
| Adjust fines | No | No | Yes | No | No |
| Waive fines | No | No | Yes | No | No |
| Allocate fine payments | No | No | Yes | No | No |
| Generate contribution-linked fines | No | No | Yes | No | No |
| Open financial periods | No | No | Authorized workflow | No | No |
| Close financial periods | No | No | Authorized workflow | No | No |
| Reopen financial periods | No | No | Authorized workflow | No | No |
| Import/post financial batches | No by default | No by default | Authorized workflow | No by default | No |

Treasurer permissions remain subject to existing accounting safeguards, audit history, immutability requirements and financial-period restrictions. Secretary/Vice Secretary manual fine creation does not grant permission to adjust, waive, allocate or otherwise modify fines.

## Other group pages

The following are proposed defaults where the owner has not given a more specific instruction. Reconcile them with current application behavior before changing implementation.

| Page / action | Group Admin | Chair / Vice Chair | Treasurer | Secretary / Vice Secretary | Ordinary Member |
|---|---|---|---|---|---|
| Welfare cases | Manage | Manage subject to policy | Manage subject to policy | Manage subject to policy | Own permitted records |
| Group documents and uploads | Manage | Manage | Manage | Manage | View only |
| Announcements and notices | Manage | Manage | Manage | Manage | View only |
| Member onboarding | Manage | Manage | Manage | View only unless separately authorized | Own application/status |
| Group profile and non-treasury settings | Manage | Manage permitted settings | Manage permitted settings | View only unless authorized | View only |
| Group subscription details | Authorized view | View only | View only | View only | Own permitted details |

## Shared View only rule — every page

Whenever a role can read a page but cannot write to it:
- The page and its permitted data must load normally; do not block the page or hide it.
- Display one small **View only** badge. Use the term “View only” consistently; do not alternate with “read only.”
- Hide or disable unauthorized Add, Edit, Delete, Approve, Save, Upload, Import and Record Payment controls.
- Display values as readable text or disabled inputs.
- Disabled controls must not send requests.
- Use a shared permission helper such as `canWrite(page)` consistently; unknown or missing permission defaults to View only.
- Enforce authorization in backend RPCs and table policies as well as the UI. Unauthorized writes should return a clear “You have view-only access” message where that applies.
- Preserve the existing database design, page layout and navigation.
- Platform Admin retains full platform write access; group-level accounting invariants and the mandatory three-role expense approvals must still be respected.

## Candidate verification gates

1. Confirm every readable page loads normally for each applicable role.
2. Confirm Secretary/Vice Secretary can search/filter member records but cannot add, edit, overwrite or remove them, through either UI or API.
3. Confirm the shared View only UI rule: badge, disabled/hidden write controls, and no requests from disabled controls.
4. Confirm backend RPC and REST/table writes are denied for unauthorized roles.
5. Confirm only Treasurer can verify, approve or reject payment evidence.
6. Confirm Secretary/Vice Secretary can create manual fines but cannot adjust, waive or allocate fines.
7. Confirm expense approvals remain pending until all three distinct role slots are satisfied; test each one- and two-approval combination and duplicate/cross-slot attempts.
8. Test direct RPC, REST/table access, cross-group isolation, inactive membership and pending-onboarding membership.
9. Reconcile all candidate function definitions and policies against production before preparing a production-compatible migration.
10. Keep production unchanged until all checks pass and the user separately authorizes deployment.
