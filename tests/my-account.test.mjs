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
