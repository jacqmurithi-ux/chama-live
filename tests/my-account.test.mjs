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
  assert.match(adminLayout, /my-account\.js\?v=20261013-shared-account1/);
  assert.match(memberLayout, /my-account\.js\?v=20261013-shared-account1/);
  assert.match(adminPage, /initMyAccount/);
  assert.match(memberPage, /initMyAccount/);
});

test("member dashboard profile link routes to the shared personal account", async () => {
  const dashboard = await read("../member-dashboard.html");
  assert.match(dashboard, /href="\.\/member-my-account\.html"/);
  assert.match(dashboard, /View My Account/);
});

test("account summary separates canonical lifetime allocations and arrears from monthly figures", () => {
  assert.match(migration, /'totalAllocated', coalesce\(v_total_allocated, 0\)/);
  assert.match(migration, /'totalArrears', greatest\(coalesce\(v_total_due_to_date, 0\) - coalesce\(v_total_allocated, 0\), 0\)/);
  assert.match(migration, /public\.contribution_allocations ca/);
  assert.match(service, /totalAllocated: asNumber\(bundle\.summary\?\.totalAllocated\)/);
  assert.match(ui, /Total allocated/);
  assert.match(ui, /Total arrears/);
});

test("lifetime allocations match the canonical monthly-status allocation scope", () => {
  assert.match(migration, /total_allocated numeric := 0/);
  assert.match(migration, /join public\.contribution_obligations o on o\.id = ca\.obligation_id/);
  assert.match(migration, /and o\.obligation_month <= date_trunc\('month', current_date\)::date;/);
  assert.doesNotMatch(migration, /and o\.rule_id is not null\s+and o\.obligation_month <= date_trunc/);
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
