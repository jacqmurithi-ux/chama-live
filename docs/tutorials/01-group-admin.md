# CHAMA LIVE Tutorial 01: Group Admin
**Lesson 1 of the role-by-role series** · Audience: the group creator/first administrator (Member 001).

> **Status warning:** The public landing page describes email confirmation and platform review, but the current `js/auth.js` documentation says its authentication core has no platform-admin review dependency. Pending → Active enforcement is therefore a gap to verify, not a behaviour this tutorial can promise.

## 1. Group creation journey
1. Open **Create Your Group / Sign up** (`signup.html`). Enter accurate account and group details with an email you can access.
2. If Supabase sends a confirmation email, open it and follow the link. Check Spam/Junk. Whether confirmation is mandatory depends on the deployed Supabase Auth setting.
3. Submit the group application as directed by the sign-up page and keep any confirmation message.
4. Sign in through **Admin Portal** (`login.html`) using your email and password. Supabase Auth checks credentials; CHAMA LIVE then resolves the signed-in member and group context.
5. If access is blocked, stop and contact support. Do not change IDs or database records to get around the block.

| Situation | What is known |
|---|---|
| Email not confirmed | If confirmation is enabled, sign-in may be blocked. Verify the deployed Auth setting. |
| Group Pending | Public copy describes review, but reviewed auth documentation does not prove a Pending-state gate. Unverified. |
| Group Active | Status alone does not prove every page/action is authorized. |
| No member/group context | Support should check the signed-in user's member relationship. Never change IDs to bypass it. |

## 2. First login: Getting Started checklist

The Admin Portal loads an onboarding checklist. Use the current checklist on screen as the source of truth; exact completion predicates need verification. A tick is not a financial audit.

### 1. Group profile — [Group Management](../../group-management.html)
Review the group name, category, registration details, phone, email, country and description. Correct and save. Common mistakes: misspelled name or wrong contacts. Reopen the page to verify saved values.

### 2. Officers assigned — Members / Group Management
Identify the correct members first, then use the available officer/leadership assignment area. Do not create duplicate members to assign an office. Check names and positions after saving. Admin is not automatically an elected officer.

### 3. Members added — [Members](../../members.html) / [Add Member](../../add-member.html)
Review the roster and add only people not already listed. Enter the fields requested by the form. Avoid duplicates and spelling/contact errors. Confirm the save succeeded and the member appears in the roster.

### 4. Contribution rules set — [Group Management](../../group-management.html)
Agree the amount, frequency, due date and contribution type with the group, then save the settings. Common mistakes: wrong amount/date or confusing a custom contribution with the monthly rule. Reopen and verify.

### 5. Modules chosen — [Group Settings](../../group-settings.html)
Review Loans and Merry-go-round, plus Plans & Activities, Assets, Milestones and Data Migration. The settings page says the four newer modules default to off. Enable only what the group intends to use and save. Turning a module off is described as blocking access without deleting saved data; it does not grant approval rights.

### 6. Opening balances — use only the supported workflow
Finish the member list and contribution rules first. Reconcile the old cashbook and agree one **cut-off date**: the date through which old records have been checked. Use only the opening-balance feature actually available to your account; check member, amount, date and source records. Never edit database rows directly or record old payments as new money.
- **Why members first?** Each figure must attach to the correct member.
- **Why rules first?** The opening position must be interpreted against the right contribution obligations.
- **Why the cut-off date?** It separates old books from new activity and helps prevent double counting or false arrears.
Common mistakes: wrong member, inconsistent dates, mixing opening figures with new contributions, or using an unverified amount. The exact UI/RPC and checklist rule remain gaps to verify.

### 7. Constitution uploaded — [Documents](../../documents.html)
Use the available upload control; choose Constitution category if offered and select the approved, readable file. Confirm it appears in the document list and opens. Do not assume a file on your phone has uploaded.

### 8. First meeting scheduled — [Meetings](../../meetings.html)
Enter the agreed date, time, venue/details and purpose requested by the form. Save and confirm the meeting appears in the schedule. Do not mark it complete before it happens. The checklist's exact completion test needs verification.

## 3. What the Admin can do
The Admin role is for group management and is distinct from elected offices. The repository has an Admin Portal allowlist and a role-permissions layer; backend permissions for each action still need to be verified.

| Page / area | Admin guidance |
|---|---|
| Dashboard | View group overview and summaries; verify details on the source page. |
| Members / Add Member | Manage onboarding and records where page and backend permissions allow it. |
| Officers / Group Management | Maintain group details, contribution settings and officer assignments where permitted. |
| Contributions | Use supported workflows. Never edit accounting tables directly; payment evidence is not automatically a posted contribution. |
| Expenses | Use supported workflow, subject to permissions and approvals. |
| Loans | Use only when enabled and permitted. Admin does not automatically gain approval/disbursement rights; documented approval requires Chairperson, Treasurer and Secretary. |
| Documents | View/upload documents where permitted; keep private group documents protected. |
| Meetings | Schedule meetings and maintain attendance/meeting brief using the available form. |
| Group Settings/modules | Configure supported switches if authorized. Disabled does not mean deleted. |
| Reports/Monthly Closing | Review reports and use closing workflow; do not bypass validation. |
| Platform administration | Group Admin cannot authorize other groups or perform platform-admin-only actions merely by being Admin. |

## 4. Security and roles

This is a safe operating guide, not a claim that every role/action combination has been verified against every RLS policy.

| Role | View | Create/edit | Approve | Delete/platform actions |
|---|---|---|---|---|
| Admin (Member 001) | Admin pages allowed by role checks | Broad group management where authorized | Not automatically an elected-officer approval | No platform-admin authority; destructive actions depend on backend |
| Chairperson | Authorized group pages | Depends on page permission | Required for workflows assigned to Chairperson | No platform-wide actions |
| Treasurer | Authorized pages incl. relevant finance views | Depends on page permission | Required for workflows assigned to Treasurer | No platform-wide actions |
| Secretary | Authorized group pages | Depends on page permission | Required for workflows assigned to Secretary | No platform-wide actions |
| Member | Member-safe pages and own permitted records | Only explicitly available member actions | Not an officer approver unless a specific rule says so | Cannot use Admin Portal as a member |
| Platform Admin | Platform tools only if implemented/granted | Platform actions through protected tools | Onboarding approval only if implemented | Separate from group accounting |

1. **Authentication:** Supabase Auth validates email/password and provides a session. The frontend checks the current user and attempts to refresh an expired session; if refresh fails, sign in again.
2. **Group context:** The app resolves signed-in user → member → group. Do not trust group IDs from URLs/forms.
3. **Front-end checks:** `js/admin-layout.js` has an Admin page allowlist and applies role permissions.
4. **Database checks:** Supabase RLS and database functions must independently restrict reads/writes. A hidden button alone is not security.
5. **Group isolation:** Never change IDs to access another group's data. Report any cross-group exposure.
6. **Password/email:** Use your own accessible email and a unique strong password. Never share passwords or one-time links.

**Safe administration:** Assign offices only after group agreement. Before removing a member, check balances, contribution history and loans; use supported offboarding and do not delete history to tidy the roster. Compare finance screens with receipts, cashbook and bank/M-Pesa records. For handover, use the supported role process; never hand over your personal password. Do not share financial data, passwords, tokens or private documents in public chats.

## 5. Day 1 to the first live month

**Day 1**
- [ ] Confirm email and sign in with your own account.
- [ ] Verify group name and contact details.
- [ ] Confirm Admin and elected officers.
- [ ] Agree the member roster and correct duplicates.

**Before the first contribution period**
- [ ] Save agreed contribution rules and due dates.
- [ ] Choose modules the group will use.
- [ ] Upload approved constitution and essential documents.
- [ ] Schedule the first meeting.
- [ ] Reconcile old records to one cut-off date.
- [ ] Enter opening balances through the supported workflow and verify totals.

**First live month**
- [ ] Verify contributions against reliable evidence.
- [ ] Use the supported contribution workflow; never write ledger rows directly.
- [ ] Review arrears/credit with the Treasurer and reconcile discrepancies.
- [ ] Record expenses and meeting attendance.
- [ ] Review reports and close the month only after responsible officers check figures.
- [ ] Record unresolved issues and ask support rather than guessing.

## Troubleshooting
- **Email not confirmed:** Check address and Spam/Junk. Use the current link; if expired, use the supported resend route or contact support.
- **Group still Pending:** Ask support to verify stored status and authorization. Do not change status data yourself.
- **Member cannot log in:** Check correct portal, login identifier, password, account/email confirmation and member-to-group link. Never share credentials.
- **Wrong officer:** Correct through the supported officer/Group Management area, save and reopen to verify; otherwise contact support.
- **Opening balance error:** Stop further posting. Check member, source ledger, amount and cut-off date with the Treasurer; use only the approved correction process.
- **Checklist not complete:** Reopen the page, verify saved data and refresh. Report it if still incomplete.

## Gaps found
1. **Pending → Active:** public copy describes review, but `js/auth.js` says the auth core has no platform-admin review dependency. Verify signup RPC, status fields, platform tools and gates.
2. **Email confirmation:** deployed Supabase Auth setting and resend/recovery path are not established by reviewed frontend files.
3. **Checklist predicates:** `js/admin-layout.js` loads `initOnboardingChecklist`; verify all eight rules in `js/onboarding-checklist.js` against live data.
4. **Opening balances:** verify current UI/RPC, cut-off handling, correction process and checklist predicate.
5. **Role matrix/RLS:** the frontend allowlist is not proof of every database permission. Review relevant RLS/RPCs and test each role/action.
6. **Handover/removal:** verify reassignment/deactivation and historical-record behaviour before publishing destructive instructions.
7. **Help navigation:** confirm the deployed Admin navigation label is clear.

## Quick recap
- Use your own confirmed account; never share passwords.
- Check group details, officers and members before contribution rules.
- Opening balances come after the roster and rules, with one agreed cut-off date.
- Upload the approved constitution and schedule the first meeting.
- Admin differs from Chairperson, Treasurer, Secretary and Platform Admin.
- Front-end checks and Supabase database rules both matter.
- If status, permissions or balances look wrong, stop and ask support.

## Quiz: 10 questions with answers
1. **Who is Member 001?** The first group administrator; not automatically an elected officer.
2. **Does Pending always become Active after approval?** Not proven by reviewed auth code; support must verify the workflow.
3. **What to check if email confirmation fails?** Address, Spam/Junk, current link and supported resend/support route.
4. **Why enter members before balances?** So each figure attaches to the correct member.
5. **Why a cut-off date?** It separates old records from new activity and prevents double counting/false arrears.
6. **Can Admin automatically approve a loan?** No; documented approval requires Chairperson, Treasurer and Secretary.
7. **What proves a member was added?** Successful save and visible roster entry.
8. **Is hiding a button enough for security?** No; RLS and protected database functions must enforce access.
9. **What if an opening balance is wrong?** Stop posting, check source/member/amount/date, use approved correction process.
10. **Can you give the incoming Admin your password?** No; use the supported role process and keep credentials private.
