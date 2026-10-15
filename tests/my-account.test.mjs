import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const service = await read("../js/my-account-service.js");
const ui = await read("../js/my-account.js");
const adminLayout = await read("../js/admin-layout.js");
const memberLayout = await read("../js/member-layout.js");
const adminPage = await read("../admin-my-account.html");
const memberPage = await read("../member-my-account.html");
const migration = await read("../supabase/migrations/20261014090000_shared_my_account_candidate.sql");
const expenses = await read("../js/expenses.js");
const rolePermissions = await read("../js/role-permissions.js");
const reports = await read("../js/reports.js");

test("shared account data and payment endpoints derive identity server-side", () => {
  assert.match(service, /rpc\("cl_get_my_account_bundle"\)/);
  assert.match(service, /rpc\("cl_submit_my_payment_evidence"/);
  assert.doesNotMatch(service, /member_id\s*:/);
  assert.doesNotMatch(service, /group_id\s*:/);
});

test("account records sort by date, amount, type and status in both directions", () => {
  assert.match(service, /export function sortAccountRecords/);
  for (const field of ["date", "amount", "type", "status"]) assert.ok(service.includes(`"${field}"`));
  assert.match(ui, /accountSortDirection/);
  assert.match(ui, /accountSortField/);
});

test("both portals load the same shared account renderer", () => {
  assert.match(adminLayout, /admin-my-account\.html/);
  assert.match(memberLayout, /member-my-account\.html/);
  assert.match(adminLayout, /my-account\.js\?v=[\w-]+/);
  assert.match(memberLayout, /my-account\.js\?v=[\w-]+/);
  assert.match(adminPage, /import \{ boot \} from "\.\/js\/admin-layout\.js"/);
  assert.match(memberPage, /import \\{ boot \\} from "\\.\\/js\\/member-layout\\.js(?:\\?v=[\\w-]+)?"/);
});

test("member dashboard profile link routes to the shared personal account", async () => {
  const dashboard = await read("../member-dashboard.html");
  assert.match(dashboard, /href="\.\/member-my-account\.html"/);
  assert.match(dashboard, /View My Account/);
});

test("official personal-account routes redirect away from member-only and group-wide pages", () => {
  assert.match(memberLayout, /const OFFICIAL_PERSONAL_ACCOUNT_PAGES = new Set\(\[/);
  for (const page of ["member-contributions.html", "member-accounting.html", "member-profile.html"]) {
    assert.ok(memberLayout.includes(`"${page}"`), `missing official route guard for ${page}`);
  }
  assert.match(memberLayout, /function resolveMemberNavigationItem\(item\)/);
  assert.match(memberLayout, /function resolveMemberNavigationItem\(item\)[\s\S]*?isAdminAccount\(\)[\s\S]*?OFFICIAL_PERSONAL_ACCOUNT_PAGES\.has\(targetPage\)/);
  assert.match(memberLayout, /items\.map\(resolveMemberNavigationItem\)\.filter\(Boolean\)/);
  assert.match(memberLayout, /const resolvedItem = resolveMemberNavigationItem\(item\)/);
  assert.match(memberLayout, /My Account is already a dedicated navigation entry[\s\S]*?return null;/);
  assert.match(memberLayout, /label: "Money",[\s\S]*?href: isAdminAccount\(\) \? "member-my-account\.html" : "member-contributions\.html"/);
  assert.match(memberLayout, /isAdminAccount\(\)[\s\S]*?OFFICIAL_PERSONAL_ACCOUNT_PAGES\.has\(currentPage\)[\s\S]*?window\.location\.replace\("member-my-account\.html"\)/);
});

test("shared account bundle is scoped to the authenticated member and rejects ambiguous identity", () => {
  assert.match(migration, /v_uid uuid := auth\.uid\(\)/);
  assert.match(migration, /m\.user_id = v_uid or m\.auth_user_id = v_uid/);
  assert.match(migration, /Multiple active member records are linked to this login/);
  assert.match(migration, /where s\.member_id = v_member\.id/);
  for (const table of ["contributions", "member_payment_evidence", "fines", "loan_applications"]) {
    assert.match(migration, new RegExp(`where ${table === "contributions" ? "c" : table === "member_payment_evidence" ? "e" : table === "fines" ? "f" : "l"}\\.group_id = v_member\\.group_id and ${table === "contributions" ? "c" : table === "member_payment_evidence" ? "e" : table === "fines" ? "f" : "l"}\\.member_id = v_member\\.id`));
  }
  assert.match(service, /rpc\("cl_get_my_account_bundle"\)/);
  assert.doesNotMatch(service, /member_id\s*:/);
  assert.doesNotMatch(service, /group_id\s*:/);
});

test("account summary separates canonical lifetime allocations and arrears from monthly figures", () => {
  assert.match(migration, /'totalAllocated', coalesce\(v_total_allocated, 0\)/);
  assert.match(migration, /'totalArrears', greatest\(coalesce\(v_total_due_to_date, 0\) - coalesce\(v_total_allocated, 0\), 0\)/);
  assert.match(migration, /public\.contribution_allocations ca/);
  assert.match(service, /totalAllocated: asNumber\(bundle\.summary\?\.totalAllocated\)/);
  assert.match(ui, /Allocated to Monthly Obligations/);
  assert.match(ui, /Total arrears/);
});

test("monthly allocation label distinguishes obligation allocation from payment amount", () => {
  assert.match(ui, /Allocated to obligations this month/);
  assert.doesNotMatch(ui, /summaryCard\("Applied this month"/);
  assert.match(migration, /'appliedThisMonth', coalesce\(\(v_monthly->>'applied_this_month'\)::numeric, 0\)/);
});

test("lifetime allocations match the canonical monthly-status allocation scope", () => {
  assert.match(migration, /total_allocated numeric := 0/);
  assert.match(migration, /join public\.contribution_obligations o on o\.id = ca\.obligation_id/);
  assert.match(migration, /and o\.obligation_month <= date_trunc\('month', current_date\)::date/);
  assert.match(migration, /and o\.contribution_type_id = \([\s\S]*?lower\(trim\(coalesce\(ct\.code, ''\)\)\) = 'monthly'[\s\S]*?lower\(trim\(coalesce\(ct\.name, ''\)\)\) = 'monthly'[\s\S]*?limit 1\s*\);/);
  assert.doesNotMatch(migration, /and o\.rule_id is not null\s+and o\.obligation_month <= date_trunc/);
});

test("expense approval UI uses member identity and respects the three backend office slots", () => {
  assert.match(expenses, /expense\.recorded_by !== currentMember\.id/);
  assert.match(expenses, /approval\.approver_user_id === currentUser\?\.id/);
  assert.match(expenses, /approval\.approval_slot === slot/);
  assert.match(expenses, /rpc\("submit_expense_approval"/);
  assert.match(rolePermissions, /"approve-chair": CHAIR_SLOT/);
  assert.match(rolePermissions, /"approve-treasurer": new Set\(\["treasurer"\]\)/);
  assert.match(rolePermissions, /"approve-secretary": SECRETARY_SLOT/);
  assert.match(rolePermissions, /declaredExpenseApprovalSlot\(member\)/);
});

test("manual report date edits activate the custom date range", () => {
  assert.match(reports, /for \(const id of \["fromDate", "toDate"\]\)[\s\S]*?preset\.value = "custom"[\s\S]*?generateReport\(\)/);
  assert.doesNotMatch(reports, /const regularFilters = \[[^\]]*"(?:fromDate|toDate)"/);
});

test("loan outstanding includes principal, interest and penalties net of all repayment allocations", () => {
  assert.match(migration, /s\.principal_due \+ s\.interest_due \+ s\.penalty_due/);
  assert.match(migration, /sum\(principal_amount \+ interest_amount \+ penalty_amount\) as total_paid/);
  assert.match(migration, /l\.disbursed_at is not null/);
});

test("payment evidence RPC normalizes non-M-Pesa references and enforces text limits server-side", () => {
  assert.match(migration, /when btrim\(coalesce\(p_payment_method, ''\)\) = 'M-Pesa'[\s\S]*?else null[\s\S]*?end;/);
  assert.match(migration, /length\(v_details\) > 1000/);
  assert.match(migration, /length\(v_reference\) > 64/);
});

test("candidate backend keeps payment evidence pending and blocks submitter self-verification", () => {
  assert.match(migration, /'pending'/);
  assert.match(migration, /You cannot verify or reject your own payment evidence/);
  assert.match(migration, /before update of status on public\.member_payment_evidence/);
  assert.match(migration, /cl_log_my_account_event/);
});

test("exports do not claim native Excel or public proof URLs", () => {
  assert.match(ui, /Excel-compatible CSV/);
  assert.doesNotMatch(ui, /createPublicUrl/);
  assert.match(service, /my-account-payment-proofs/);
});


test("both personal account pages include every shared renderer HTML target", () => {
  const requiredTargets = [
    "myAccountName",
    "myAccountMeta",
    "myAccountProfile",
    "myAccountSummary",
    "myAccountAllocationTypes",
    "myAccountAllocationTotals",
    "myAccountAllocationNote",
    "myAccountLoansSection",
    "myAccountLoanSummary",
    "myAccountRecords",
    "myAccountLoading",
    "myAccountContent",
    "myAccountError"
  ];
  for (const page of [adminPage, memberPage]) {
    for (const id of requiredTargets) {
      assert.ok(page.includes(`id="${id}"`), `personal account page is missing #${id}`);
    }
  }
});
