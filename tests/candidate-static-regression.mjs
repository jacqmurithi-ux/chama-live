import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const meetingsHtml = read("meetings.html");
const meetingsJs = read("js/meetings.js");
const reportsJs = read("js/reports.js");
const lifecycleSql = read("supabase/migrations/20261012090000_meeting_lifecycle.sql");
const devSql = read("supabase/migrations/20261012120000_fix_dev_fund_allocation_shape.sql");

for (const id of ["meetingStatusHistory", "meetingStatusHistoryContent"]) {
  assert.equal((meetingsHtml.match(new RegExp(`id=["']${id}["']`, "g")) || []).length, 1,
    `meetings.html must contain exactly one #${id}`);
}
for (const status of ["upcoming", "held_pending_minutes", "completed", "cancelled", "postponed"]) {
  assert.ok(lifecycleSql.includes(`'${status}'`), `lifecycle migration must support ${status}`);
  assert.ok(meetingsJs.includes(status), `meeting UI must wire ${status}`);
  assert.ok(reportsJs.includes(status), `Reports must classify ${status}`);
}
assert.ok(lifecycleSql.includes("MEETING_MINUTES_REQUIRED_BEFORE_COMPLETION"));
assert.ok(lifecycleSql.includes("RESOLUTION_OR_NO_RESOLUTION_CONFIRMATION_REQUIRED"));
assert.ok(lifecycleSql.includes("ATTENDANCE_MUST_BE_RECORDED_FOR_EVERY_ACTIVE_MEMBER"));
assert.ok(lifecycleSql.includes("POSTPONEMENT_REQUIRES_A_LATER_DATE"));
assert.ok(meetingsJs.includes("escapeHtml(actor)") && meetingsJs.includes("escapeHtml(reason)"),
  "meeting history must escape actor and reason text");
assert.ok(reportsJs.includes("function exportCSV"));
assert.ok(reportsJs.includes("function exportSortedReportCSV"));
assert.ok(reportsJs.includes("function exportExcel"));
assert.ok(reportsJs.includes("function printReport"));
assert.ok(reportsJs.includes("meetingStatusLabel(row)"));
assert.ok(devSql.includes("information_schema.columns"));
assert.ok(devSql.includes("insert into public.contribution_allocations(payment_id,obligation_id,amount)"));
assert.ok(devSql.includes("REQUEST_ID_REUSE_MISMATCH"));
assert.ok(devSql.includes("PAYMENT_ALREADY_HAS_ALLOCATIONS"));
assert.ok(devSql.includes("DEV_FUND_RECONCILIATION_NOT_AUTHORIZED"));
console.log("CHAMA LIVE candidate static regression: PASS");
