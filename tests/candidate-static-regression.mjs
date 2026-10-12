import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const meetingsHtml = read("meetings.html");
const meetingsJs = read("js/meetings.js");
const reportsJs = read("js/reports.js");
const reportsHtml = read("reports.html");
const supabaseJs = read("js/supabase.js");
const lifecycleSql = read("supabase/migrations/20261012090000_meeting_lifecycle.sql");
const devSql = read("supabase/migrations/20261012120000_fix_dev_fund_allocation_shape.sql");

assert.equal((meetingsHtml.match(/id="meetingStatusHistory"/g) || []).length, 1,
  "meetings.html must contain exactly one status-history host");
assert.equal((meetingsHtml.match(/id="meetingStatusHistoryContent"/g) || []).length, 1,
  "meetings.html must contain exactly one status-history content host");

for (const status of ["upcoming", "held_pending_minutes", "completed", "cancelled", "postponed"]) {
  assert.ok(lifecycleSql.includes("'" + status + "'"), "lifecycle migration must support " + status);
  assert.ok(meetingsJs.includes(status), "meeting UI must wire " + status);
  assert.ok(reportsJs.includes(status), "Reports must classify " + status);
}
assert.ok(lifecycleSql.includes("MEETING_MINUTES_REQUIRED_BEFORE_COMPLETION"));
assert.ok(lifecycleSql.includes("RESOLUTION_OR_NO_RESOLUTION_CONFIRMATION_REQUIRED"));
assert.ok(lifecycleSql.includes("ATTENDANCE_MUST_BE_RECORDED_FOR_EVERY_ACTIVE_MEMBER"));
assert.ok(lifecycleSql.includes("POSTPONEMENT_REQUIRES_A_LATER_DATE"));
assert.ok(meetingsJs.includes("escapeHtml(actor)") && meetingsJs.includes("escapeHtml(reason)"),
  "meeting history must escape actor and reason text");

const tableBodyIndex = reportsHtml.indexOf('<tbody id="meetingRows">');
assert.ok(tableBodyIndex >= 0, "Reports must contain the meeting summary table");
const tableStartIndex = reportsHtml.lastIndexOf("<table", tableBodyIndex);
const tableEndIndex = reportsHtml.indexOf("</table>", tableBodyIndex) + "</table>".length;
const meetingTable = reportsHtml.slice(tableStartIndex, tableEndIndex);
const meetingHeaders = [...meetingTable.matchAll(/<th[^>]*>(.*?)<\/th>/gs)]
  .map(([, value]) => value.replace(/<[^>]+>/g, "").trim());
assert.deepEqual(meetingHeaders, [
  "Date", "Title", "Venue", "Status", "Reason / follow-up",
  "Agenda", "Minutes", "Attendance", "Resolution"
], "Reports meeting table must expose all nine lifecycle fields");

const renderStart = reportsJs.indexOf("function renderMeetings(rows)");
const renderEnd = reportsJs.indexOf("CUMULATIVE POSITION TABLE", renderStart);
const renderBlock = reportsJs.slice(renderStart, renderEnd);
assert.equal((renderBlock.match(/"<td>"/g) || []).length, 9,
  "Reports renderer must emit nine cells for each meeting");

assert.ok(reportsJs.includes('["Date", "Meeting", "Venue", "Status", "Reason / follow-up", "Agenda", "Minutes", "Attendance", "Resolution"]'),
  "CSV export must include all meeting lifecycle fields");
assert.ok(reportsJs.includes("<th>Attendance</th>") && reportsJs.includes("<th>Minutes</th>"),
  "Excel export must include minutes and attendance");
assert.ok(reportsJs.includes('row.resolution_not_required ? "No resolution made"'),
  "Reports and exports must label explicit no-resolution decisions");
for (const fn of ["function exportCSV", "function exportSortedReportCSV", "function exportExcel", "function printReport"]) {
  assert.ok(reportsJs.includes(fn), "Reports must retain " + fn);
}

assert.ok(devSql.includes("information_schema.columns"));
assert.ok(devSql.includes("insert into public.contribution_allocations(payment_id,obligation_id,amount)"));
assert.ok(devSql.includes("REQUEST_ID_REUSE_MISMATCH"));
assert.ok(devSql.includes("PAYMENT_ALREADY_HAS_ALLOCATIONS"));
assert.ok(devSql.includes("DEV_FUND_RECONCILIATION_NOT_AUTHORIZED"));
assert.ok(supabaseJs.includes("https://onzaonflquipqmhgslxi.supabase.co")
  && supabaseJs.includes("https://ptktftwyltxmtcodyzoa.supabase.co")
  && supabaseJs.includes("window.location.hostname")
  && supabaseJs.includes("chama-live-[a-z0-9]+-chamalive"),
  "Candidate preview must use isolated Supabase project while official hosts use production");

console.log("CHAMA LIVE candidate static regression: PASS");
