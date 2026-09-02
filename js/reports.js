/* =========================================================
CHAMA LIVE — REPORTS 2.0
COMPLETE FRONTEND REPORTING CENTRE

ACCOUNTING RULE

Reports NEVER recalculate canonical contribution accounting.

Canonical chain:
Obligation
↓
Payment
↓
Allocation
↓
Arrears / Credit

Canonical RPCs:
get_canonical_member_monthly_status()
get_canonical_monthly_accounting_summary()

IMPORTANT

This page is READ-ONLY with respect to accounting.

It does NOT call:
refresh_canonical_contribution_accounting()

Contributions page / Monthly Closing are responsible for
refreshing canonical accounting.

Reports only reads the canonical results.

Required existing files:
js/supabase.js
js/auth.js
css/app.css
========================================================= */

import { supabase } from "./supabase.js";

import {
requireAuth,
getMyMember,
getMyGroup
} from "./auth.js";

console.log("CHAMA LIVE: reports.js loaded");

/* =========================================================
STATE
========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let currentGroupId = null;

let members = [];
let contributions = [];
let expenses = [];
let meetings = [];

let canonicalStatus = [];
let canonicalSummary = null;

let currentReportRows = [];
let currentReportType = "executive";

/* =========================================================
DOM
========================================================= */

function el(id) {
return document.getElementById(id);
}

function setText(id, value) {
const node = el(id);
if (node) node.textContent = value ?? "";
}

function showStatus(message) {
const node = el("statusMessage");
if (!node) return;

node.textContent = message || "";
node.classList.toggle("hidden", !message);
}

function clearStatus() {
showStatus("");
}

function showError(message) {
const node = el("errorMessage");
if (!node) return;

node.textContent = message || "Something went wrong.";
node.classList.remove("hidden");
}

function clearError() {
const node = el("errorMessage");
if (!node) return;

node.textContent = "";
node.classList.add("hidden");
}

/* =========================================================
BASIC HELPERS
========================================================= */

function money(value) {
const amount = Number(value || 0);

return new Intl.NumberFormat("en-KE", {
style: "currency",
currency: "KES",
minimumFractionDigits: 2,
maximumFractionDigits: 2
}).format(amount);
}

function number(value) {
return Number(value || 0);
}

function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&")
.replaceAll("<", "<")
.replaceAll(">", ">")
.replaceAll('"', """)
.replaceAll("'", "'");
}

function today() {
const d = new Date();

const year = d.getFullYear();
const month = String(d.getMonth() + 1).padStart(2, "0");
const day = String(d.getDate()).padStart(2, "0");

return "${year}-${month}-${day}";
}

function firstDayOfMonth(date = new Date()) {
const d = new Date(date);

return "${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01";
}

function monthKey(date) {
if (!date) return "";

const d = new Date(date);

if (Number.isNaN(d.getTime())) {
const raw = String(date);
return raw.slice(0, 7);
}

return "${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}";
}

function formatDate(value) {
if (!value) return "—";

const d = new Date(value);

if (Number.isNaN(d.getTime())) {
return String(value);
}

return d.toLocaleDateString("en-KE", {
year: "numeric",
month: "short",
day: "numeric"
});
}

function formatMonth(value) {
if (!value) return "—";

const [year, month] = String(value).split("-");

if (!year || !month) return String(value);

const d = new Date(Number(year), Number(month) - 1, 1);

return d.toLocaleDateString("en-KE", {
year: "numeric",
month: "long"
});
}

function normalizeDate(value) {
if (!value) return "";

return String(value).slice(0, 10);
}

function monthStart(month) {
return "${month}-01";
}

function nextMonthStart(month) {
const [year, monthNumber] = String(month).split("-").map(Number);

if (!year || !monthNumber) return "";

const d = new Date(year, monthNumber, 1);

return "${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01";
}

function normalizeStatus(value) {
return String(value || "")
.trim()
.toLowerCase();
}

function statusLabel(status) {
const normalized = normalizeStatus(status);

if (normalized === "outstanding") return "Outstanding";
if (normalized === "partial") return "Partial";
if (normalized === "credit") return "Credit";
if (normalized === "paid") return "Paid";

return normalized || "Unknown";
}

function statusClass(status) {
const normalized = normalizeStatus(status);

if (normalized === "paid") return "status-paid";
if (normalized === "credit") return "status-credit";
if (normalized === "partial") return "status-partial";
if (normalized === "outstanding") return "status-outstanding";

return "status-other";
}

function contributionTypeLabel(value) {
const type = String(value || "").trim().toLowerCase();

if (type === "monthly") return "Monthly";
if (type === "other") return "Other Savings";

return value ? String(value) : "Other";
}

function paymentMethodLabel(value) {
if (!value) return "Not specified";

const raw = String(value).trim();

if (!raw) return "Not specified";

return raw;
}

function expenseStatus(row) {
return String(
row?.approval_status ||
row?.status ||
"pending"
).trim().toLowerCase();
}

function memberName(memberId) {
const member = members.find(
item => String(item.id) === String(memberId)
);

if (!member) return "Unknown member";

return member.name ||
member.full_name ||
member.member_name ||
member.member_number ||
"Unnamed member";
}

function memberNumber(memberId) {
const member = members.find(
item => String(item.id) === String(memberId)
);

if (!member) return "—";

return member.member_number ||
member.membership_number ||
"—";
}

function activeMembers() {
return members.filter(
member => normalizeStatus(member.status) === "active"
);
}

/* =========================================================
DATE RANGE
========================================================= */

function setDefaultDates() {
const from = el("fromDate");
const to = el("toDate");
const preset = el("periodPreset");

const current = new Date();

if (preset) {
preset.value = "this-month";
}

if (from) {
from.value = firstDayOfMonth(current);
}

if (to) {
to.value = today();
}

const accountingMonth = el("accountingMonth");

if (accountingMonth) {
accountingMonth.value = monthKey(today());
}
}

function setPeriodFromPreset(value) {
const preset = String(value || "this-month");

const from = el("fromDate");
const to = el("toDate");

if (!from || !to) return;

const now = new Date();

if (preset === "custom") {
return;
}

if (preset === "this-month") {
from.value = firstDayOfMonth(now);
to.value = today();
return;
}

if (preset === "last-month") {
const firstCurrent = new Date(
now.getFullYear(),
now.getMonth(),
1
);

const firstPrevious = new Date(
  now.getFullYear(),
  now.getMonth() - 1,
  1
);

const lastPrevious = new Date(
  now.getFullYear(),
  now.getMonth(),
  0
);

from.value =
  `${firstPrevious.getFullYear()}-${String(firstPrevious.getMonth() + 1).padStart(2, "0")}-01`;

to.value =
  `${lastPrevious.getFullYear()}-${String(lastPrevious.getMonth() + 1).padStart(2, "0")}-${String(lastPrevious.getDate()).padStart(2, "0")}`;

return;

}

if (preset === "this-quarter") {
const quarterStartMonth =
Math.floor(now.getMonth() / 3) * 3;

const quarterStart = new Date(
  now.getFullYear(),
  quarterStartMonth,
  1
);

from.value = firstDayOfMonth(quarterStart);
to.value = today();

return;

}

if (preset === "this-year") {
from.value = "${now.getFullYear()}-01-01";
to.value = today();
}
}

function validateDateRange() {
const from = normalizeDate(el("fromDate")?.value);
const to = normalizeDate(el("toDate")?.value);

if (!from || !to) {
throw new Error("Please select both From and To dates.");
}

if (from > to) {
throw new Error("From date cannot be after To date.");
}

return { from, to };
}

/* =========================================================
CONTEXT
========================================================= */

async function loadContext() {
currentUser = await requireAuth();

currentMember = await getMyMember();

if (!currentMember) {
throw new Error("No member profile is available for the signed-in user.");
}

currentGroup = await getMyGroup();

if (!currentGroup) {
throw new Error("No current group is available.");
}

currentGroupId =
currentMember.group_id ||
currentGroup.id;

if (!currentGroupId) {
throw new Error("Current group ID could not be determined.");
}

renderContext();
}

function renderContext() {
setText(
"groupLabel",
currentGroup?.name ||
currentGroup?.group_name ||
"Current Group"
);

setText(
"printGroupName",
currentGroup?.name ||
currentGroup?.group_name ||
"Current Group"
);
}

/* =========================================================
DATA LOADERS
========================================================= */

async function loadMembers() {
const { data, error } = await supabase
.from("members")
.select("id, group_id, member_number, membership_number, name, phone, email, role, join_date, status, onboarding_status, invited_at, activated_at, created_at")
.eq("group_id", currentGroupId)
.order("name", { ascending: true });

if (error) throw error;

members = data || [];

populateMemberFilter();

setText(
"activeMembers",
activeMembers().length
);
}

async function loadContributions() {
const { data, error } = await supabase
.from("contributions")
.select("id, group_id, member_id, amount, contribution_type, month, payment_method, reference, recorded_by, contribution_date, notes, mpesa_reference, goal_id, created_at")
.eq("group_id", currentGroupId)
.order("contribution_date", { ascending: false });

if (error) throw error;

contributions = data || [];
}

async function loadExpenses() {
const { data, error } = await supabase
.from("expenses")
.select("id, group_id, description, category, amount, date, recorded_by, receipt_url, approval_status, created_at")
.eq("group_id", currentGroupId)
.order("date", { ascending: false });

if (error) throw error;

expenses = data || [];
}

async function loadMeetings() {
const { data, error } = await supabase
.from("meetings")
.select("id, group_id, title, date, venue, agenda, minutes, resolution, status, created_at")
.eq("group_id", currentGroupId)
.order("date", { ascending: false });

if (error) throw error;

meetings = data || [];
}

/* =========================================================
CANONICAL ACCOUNTING READ
========================================================= */

async function loadCanonicalAccounting(month) {
if (!currentGroupId) {
throw new Error("No current group is available.");
}

if (!/^\d{4}-\d{2}$/.test(String(month || ""))) {
throw new Error("Accounting month must use YYYY-MM format.");
}

/*
READ-ONLY.

Do not call refresh_canonical_contribution_accounting here.

Reports must not mutate accounting data simply because
someone opens or exports a report.

*/

const [
statusResult,
summaryResult
] = await Promise.all([
supabase.rpc(
"get_canonical_member_monthly_status",
{
p_group_id: currentGroupId,
p_month: month
}
),

supabase.rpc(
  "get_canonical_monthly_accounting_summary",
  {
    p_group_id: currentGroupId,
    p_month: month
  }
)

]);

if (statusResult.error) {
throw statusResult.error;
}

if (summaryResult.error) {
throw summaryResult.error;
}

canonicalStatus = statusResult.data || [];

const summaryData = summaryResult.data;

if (Array.isArray(summaryData)) {
canonicalSummary = summaryData[0] || null;
} else {
canonicalSummary = summaryData || null;
}
}

/* =========================================================
FILTER POPULATION
========================================================= */

function populateMemberFilter() {
const select = el("memberFilter");

if (!select) return;

const currentValue = select.value;

select.innerHTML = "<option value="all">All Members</option> ${members.map(member =>"
<option value="${escapeHtml(member.id)}">
${escapeHtml(
"${member.member_number || member.membership_number || ""} ${member.name || ""}".trim()
)}
</option>
").join("")} ";

if (
currentValue &&
[...select.options].some(option => option.value === currentValue)
) {
select.value = currentValue;
}
}

function populatePaymentMethods() {
const select = el("paymentMethodFilter");

if (!select) return;

const methods = [
...new Set(
contributions
.map(row => paymentMethodLabel(row.payment_method))
.filter(Boolean)
)
].sort();

const currentValue = select.value;

select.innerHTML = "<option value="all">All Methods</option> ${methods.map(method =>"
<option value="${escapeHtml(method)}">
${escapeHtml(method)}
</option>
").join("")} ";

if (
currentValue &&
[...select.options].some(option => option.value === currentValue)
) {
select.value = currentValue;
}
}

/* =========================================================
RANGE FILTERS
========================================================= */

function filteredContributions() {
const { from, to } = validateDateRange();

const selectedMember =
el("memberFilter")?.value || "all";

const contributionType =
el("contributionTypeFilter")?.value || "all";

const paymentMethod =
el("paymentMethodFilter")?.value || "all";

return contributions.filter(row => {
const date = normalizeDate(row.contribution_date);

if (!date || date < from || date > to) {
  return false;
}

if (
  selectedMember !== "all" &&
  String(row.member_id) !== String(selectedMember)
) {
  return false;
}

if (
  contributionType !== "all" &&
  normalizeStatus(row.contribution_type) !==
    normalizeStatus(contributionType)
) {
  return false;
}

if (
  paymentMethod !== "all" &&
  paymentMethodLabel(row.payment_method) !== paymentMethod
) {
  return false;
}

return true;

});
}

function filteredExpenses() {
const { from, to } = validateDateRange();

return expenses.filter(row => {
const date = normalizeDate(row.date);

return (
  date &&
  date >= from &&
  date <= to
);

});
}

function filteredMeetings() {
const { from, to } = validateDateRange();

return meetings.filter(row => {
const date = normalizeDate(row.date);

return (
  date &&
  date >= from &&
  date <= to
);

});
}

/* =========================================================
CANONICAL STATUS FILTER
========================================================= */

function canonicalRowsForSelectedMember() {
const selectedMember =
el("memberFilter")?.value || "all";

const statusFilter =
el("statusFilter")?.value || "all";

return canonicalStatus.filter(row => {
if (
selectedMember !== "all" &&
String(row.member_id) !== String(selectedMember)
) {
return false;
}

const status =
  normalizeStatus(row.status);

if (statusFilter === "all") {
  return true;
}

if (statusFilter === "no-payment") {
  return number(row.current_month_payment) <= 0;
}

return status === statusFilter;

});
}

function needsAttention(row) {
const status = normalizeStatus(row?.status);

return (
status === "partial" ||
status === "outstanding"
);
}

function hasArrears(row) {
return (
number(row?.previous_outstanding) > 0 ||
number(row?.current_outstanding) > 0
);
}

function hasCredit(row) {
return (
normalizeStatus(row?.status) === "credit" ||
number(row?.carry_forward) > 0 ||
number(row?.previous_credit) > 0
);
}

/* =========================================================
SUMMARY
========================================================= */

function calculatePeriodSummary() {
const contributionRows =
filteredContributions();

const expenseRows =
filteredExpenses();

const contributionTotal =
contributionRows.reduce(
(sum, row) => sum + number(row.amount),
0
);

const approvedExpenseTotal =
expenseRows
.filter(row => expenseStatus(row) === "approved")
.reduce(
(sum, row) => sum + number(row.amount),
0
);

const pendingExpenseTotal =
expenseRows
.filter(row => expenseStatus(row) === "pending")
.reduce(
(sum, row) => sum + number(row.amount),
0
);

const rejectedExpenseTotal =
expenseRows
.filter(row => expenseStatus(row) === "rejected")
.reduce(
(sum, row) => sum + number(row.amount),
0
);

setText(
"totalContributions",
money(contributionTotal)
);

setText(
"approvedExpenses",
money(approvedExpenseTotal)
);

setText(
"currentBalance",
money(contributionTotal - approvedExpenseTotal)
);

setText(
"pendingExpenses",
money(pendingExpenseTotal)
);

setText(
"rejectedExpenses",
money(rejectedExpenseTotal)
);

const applied =
number(canonicalSummary?.applied_this_month);

const outstanding =
number(canonicalSummary?.current_outstanding);

const carryForward =
number(canonicalSummary?.carry_forward);

const collectionRate =
number(canonicalSummary?.collection_rate);

setText(
"reportApplied",
money(applied)
);

setText(
"reportOutstanding",
money(outstanding)
);

setText(
"reportCarryForward",
money(carryForward)
);

setText(
"reportCollectionRate",
"${collectionRate.toFixed(0)}%"
);
}

/* =========================================================
CONTRIBUTION BREAKDOWN
========================================================= */

function renderContributionBreakdown() {
const tbody =
el("contributionBreakdownRows");

if (!tbody) return;

const rows =
filteredContributions();

const groups = new Map();

rows.forEach(row => {
const key =
contributionTypeLabel(row.contribution_type);

if (!groups.has(key)) {
  groups.set(key, {
    type: key,
    entries: 0,
    amount: 0
  });
}

const item = groups.get(key);

item.entries += 1;
item.amount += number(row.amount);

});

const items = [...groups.values()]
.sort((a, b) => b.amount - a.amount);

const total =
items.reduce(
(sum, item) => sum + item.amount,
0
);

if (!items.length) {
tbody.innerHTML = "<tr> <td colspan="4" class="report-empty"> No contribution records match the selected filters. </td> </tr>";
return;
}

tbody.innerHTML = items.map(item => {
const share =
total > 0
? (item.amount / total) * 100
: 0;

return `
  <tr>
    <td>${escapeHtml(item.type)}</td>
    <td class="amount">${item.entries}</td>
    <td class="amount">${escapeHtml(money(item.amount))}</td>
    <td class="amount">${share.toFixed(1)}%</td>
  </tr>
`;

}).join("");
}

/* =========================================================
EXPENSE BREAKDOWN
========================================================= */

function renderExpenseBreakdown() {
const tbody =
el("expenseBreakdownRows");

if (!tbody) return;

const rows =
filteredExpenses()
.filter(row => expenseStatus(row) === "approved");

const groups = new Map();

rows.forEach(row => {
const category =
row.category || "Uncategorised";

if (!groups.has(category)) {
  groups.set(category, {
    category,
    entries: 0,
    amount: 0
  });
}

const item =
  groups.get(category);

item.entries += 1;
item.amount += number(row.amount);

});

const items = [...groups.values()]
.sort((a, b) => b.amount - a.amount);

const total =
items.reduce(
(sum, item) => sum + item.amount,
0
);

if (!items.length) {
tbody.innerHTML = "<tr> <td colspan="4" class="report-empty"> No approved expenses match the selected period. </td> </tr>";
return;
}

tbody.innerHTML = items.map(item => {
const share =
total > 0
? (item.amount / total) * 100
: 0;

return `
  <tr>
    <td>${escapeHtml(item.category)}</td>
    <td class="amount">${item.entries}</td>
    <td class="amount">${escapeHtml(money(item.amount))}</td>
    <td class="amount">${share.toFixed(1)}%</td>
  </tr>
`;

}).join("");
}

/* =========================================================
CONTRIBUTION ENTRIES
========================================================= */

function renderContributionEntries() {
const tbody =
el("reportContributionEntries");

if (!tbody) return;

const rows =
filteredContributions();

if (!rows.length) {
tbody.innerHTML = "<tr> <td colspan="6" class="report-empty"> No contribution records match the selected filters. </td> </tr>";
return;
}

tbody.innerHTML = rows.map(row => {
const reference =
row.mpesa_reference ||
row.reference ||
"—";

return `
  <tr>
    <td>${escapeHtml(formatDate(row.contribution_date))}</td>
    <td>
      <strong>${escapeHtml(memberName(row.member_id))}</strong>
      <br>
      <small>${escapeHtml(memberNumber(row.member_id))}</small>
    </td>
    <td>${escapeHtml(contributionTypeLabel(row.contribution_type))}</td>
    <td>${escapeHtml(paymentMethodLabel(row.payment_method))}</td>
    <td>${escapeHtml(reference)}</td>
    <td class="amount">${escapeHtml(money(row.amount))}</td>
  </tr>
`;

}).join("");
}

/* =========================================================
EXPENSE ENTRIES
========================================================= */

function renderExpenseEntries() {
const tbody =
el("reportExpenseEntries");

if (!tbody) return;

const rows =
filteredExpenses();

if (!rows.length) {
tbody.innerHTML = "<tr> <td colspan="5" class="report-empty"> No expenses match the selected period. </td> </tr>";
return;
}

tbody.innerHTML = rows.map(row => {
const status =
expenseStatus(row);

return `
  <tr>
    <td>${escapeHtml(formatDate(row.date))}</td>
    <td>${escapeHtml(row.description || "—")}</td>
    <td>${escapeHtml(row.category || "Uncategorised")}</td>
    <td>
      <span class="status-badge ${statusClass(status)}">
        ${escapeHtml(status)}
      </span>
    </td>
    <td class="amount">${escapeHtml(money(row.amount))}</td>
  </tr>
`;

}).join("");
}

/* =========================================================
MEETINGS
========================================================= */

function renderMeetings() {
const rows =
filteredMeetings();

let upcoming = 0;
let completed = 0;
let cancelled = 0;

rows.forEach(row => {
const status =
normalizeStatus(row.status);

if (status === "completed") {
  completed += 1;
} else if (status === "cancelled") {
  cancelled += 1;
} else if (
  status === "upcoming" ||
  status === "scheduled" ||
  normalizeDate(row.date) >= today()
) {
  upcoming += 1;
}

});

setText(
"totalMeetings",
rows.length
);

setText(
"upcomingMeetings",
upcoming
);

setText(
"completedMeetings",
completed
);

setText(
"cancelledMeetings",
cancelled
);

const tbody =
el("meetingRows");

if (!tbody) return;

if (!rows.length) {
tbody.innerHTML = "<tr> <td colspan="4" class="report-empty"> No meetings match the selected period. </td> </tr>";
return;
}

tbody.innerHTML = rows.map(row => "<tr> <td>${escapeHtml(formatDate(row.date))}</td> <td>${escapeHtml(row.title || "Meeting")}</td> <td>${escapeHtml(row.venue || "—")}</td> <td> <span class="status-badge ${statusClass(row.status)}"> ${escapeHtml(row.status || "scheduled")} </span> </td> </tr>").join("");
}

/* =========================================================
CANONICAL MEMBER STATUS TABLE
========================================================= */

function renderCanonicalStatusTable(rows) {
if (!rows.length) {
return "<div class="report-empty"> No member accounting records match the selected filters. </div>";
}

return `
<div class="table-wrap">
<table>
<thead>
<tr>
<th>Member</th>
<th>Monthly Due</th>
<th>Previous Arrears</th>
<th>Previous Credit</th>
<th>Current Payment</th>
<th>Applied</th>
<th>Carry-forward</th>
<th>Outstanding</th>
<th>Total Paid</th>
<th>Total Due</th>
<th>Status</th>
</tr>
</thead>

    <tbody>
      ${rows.map(row => `
        <tr>
          <td>
            <strong>${escapeHtml(row.member_name || memberName(row.member_id))}</strong>
            <br>
            <small>${escapeHtml(row.member_number || memberNumber(row.member_id))}</small>
          </td>

          <td class="amount">${escapeHtml(money(row.monthly_due))}</td>
          <td class="amount">${escapeHtml(money(row.previous_outstanding))}</td>
          <td class="amount">${escapeHtml(money(row.previous_credit))}</td>
          <td class="amount">${escapeHtml(money(row.current_month_payment))}</td>
          <td class="amount">${escapeHtml(money(row.applied_this_month))}</td>
          <td class="amount">${escapeHtml(money(row.carry_forward))}</td>
          <td class="amount">${escapeHtml(money(row.current_outstanding))}</td>
          <td class="amount">${escapeHtml(money(row.total_paid_to_date))}</td>
          <td class="amount">${escapeHtml(money(row.total_due_to_date))}</td>

          <td>
            <span class="status-badge ${statusClass(row.status)}">
              ${escapeHtml(statusLabel(row.status))}
            </span>
          </td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</div>

`;
}

/* =========================================================
MEMBER CONTRIBUTIONS REPORT
========================================================= */

function renderMemberContributionsReport() {
const rows =
filteredContributions();

currentReportRows = rows;

if (!rows.length) {
return emptyReport(
"No contributions found",
"There are no contribution records matching the selected filters."
);
}

const groupBy =
el("groupBy")?.value || "member";

const grouped =
aggregateContributions(rows, groupBy);

return `
${renderContributionKpis(rows)}

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>${escapeHtml(groupLabel(groupBy))}</th>
        <th class="amount">Entries</th>
        <th class="amount">Amount</th>
      </tr>
    </thead>

    <tbody>
      ${grouped.map(item => `
        <tr>
          <td>${escapeHtml(item.label)}</td>
          <td class="amount">${item.entries}</td>
          <td class="amount">${escapeHtml(money(item.amount))}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</div>

`;
}

/* =========================================================
CONTRIBUTION KPIS
========================================================= */

function renderContributionKpis(rows) {
const total =
rows.reduce(
(sum, row) => sum + number(row.amount),
0
);

const monthly =
rows
.filter(row =>
normalizeStatus(row.contribution_type) === "monthly"
)
.reduce(
(sum, row) => sum + number(row.amount),
0
);

const other =
rows
.filter(row =>
normalizeStatus(row.contribution_type) === "other"
)
.reduce(
(sum, row) => sum + number(row.amount),
0
);

return `
<div class="report-kpi-grid">
<div class="report-kpi">
<span>Total Entries</span>
<strong>${rows.length}</strong>
</div>

  <div class="report-kpi">
    <span>Total Received</span>
    <strong>${escapeHtml(money(total))}</strong>
  </div>

  <div class="report-kpi">
    <span>Monthly</span>
    <strong>${escapeHtml(money(monthly))}</strong>
  </div>

  <div class="report-kpi">
    <span>Other Savings</span>
    <strong>${escapeHtml(money(other))}</strong>
  </div>
</div>

`;
}

/* =========================================================
AGGREGATION
========================================================= */

function groupLabel(groupBy) {
const labels = {
member: "Member",
month: "Month",
contribution_type: "Contribution Type",
payment_method: "Payment Method",
expense_category: "Expense Category",
status: "Status"
};

return labels[groupBy] || "Group";
}

function contributionGroupKey(row, groupBy) {
if (groupBy === "member") {
return memberName(row.member_id);
}

if (groupBy === "month") {
return monthKey(row.contribution_date);
}

if (groupBy === "contribution_type") {
return contributionTypeLabel(row.contribution_type);
}

if (groupBy === "payment_method") {
return paymentMethodLabel(row.payment_method);
}

if (groupBy === "status") {
return "Received";
}

return "All";
}

function aggregateContributions(rows, groupBy) {
const map = new Map();

rows.forEach(row => {
const key =
contributionGroupKey(row, groupBy);

if (!map.has(key)) {
  map.set(key, {
    label: key,
    entries: 0,
    amount: 0
  });
}

const item =
  map.get(key);

item.entries += 1;
item.amount += number(row.amount);

});

return [...map.values()]
.sort((a, b) => b.amount - a.amount);
}

/* =========================================================
ARREARS REPORT
========================================================= */

function renderArrearsReport() {
const rows =
canonicalRowsForSelectedMember()
.filter(row => {
const status =
normalizeStatus(row.status);

    return (
      status === "partial" ||
      status === "outstanding" ||
      hasArrears(row)
    );
  });

currentReportRows = rows;

if (!rows.length) {
return emptyReport(
"No arrears found",
"No members currently match the arrears / outstanding criteria for the selected accounting month."
);
}

const totalOutstanding =
rows.reduce(
(sum, row) =>
sum + number(row.current_outstanding),
0
);

const totalPrevious =
rows.reduce(
(sum, row) =>
sum + number(row.previous_outstanding),
0
);

return `
<div class="report-kpi-grid">
<div class="report-kpi">
<span>Members with Attention</span>
<strong>${rows.length}</strong>
</div>

  <div class="report-kpi">
    <span>Previous Arrears</span>
    <strong>${escapeHtml(money(totalPrevious))}</strong>
  </div>

  <div class="report-kpi">
    <span>Current Outstanding</span>
    <strong>${escapeHtml(money(totalOutstanding))}</strong>
  </div>

  <div class="report-kpi">
    <span>Accounting Month</span>
    <strong>${escapeHtml(formatMonth(el("accountingMonth")?.value))}</strong>
  </div>
</div>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Member</th>
        <th>Monthly Due</th>
        <th>Previous Arrears</th>
        <th>Current Payment</th>
        <th>Applied</th>
        <th>Current Outstanding</th>
        <th>Status</th>
      </tr>
    </thead>

    <tbody>
      ${rows.map(row => `
        <tr>
          <td>
            <strong>${escapeHtml(row.member_name || memberName(row.member_id))}</strong>
            <br>
            <small>${escapeHtml(row.member_number || memberNumber(row.member_id))}</small>
          </td>

          <td class="amount">${escapeHtml(money(row.monthly_due))}</td>
          <td class="amount">${escapeHtml(money(row.previous_outstanding))}</td>
          <td class="amount">${escapeHtml(money(row.current_month_payment))}</td>
          <td class="amount">${escapeHtml(money(row.applied_this_month))}</td>
          <td class="amount">${escapeHtml(money(row.current_outstanding))}</td>

          <td>
            <span class="status-badge ${statusClass(row.status)}">
              ${escapeHtml(statusLabel(row.status))}
            </span>
          </td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</div>

`;
}

/* =========================================================
CREDIT REPORT
========================================================= */

function renderCreditReport() {
const rows =
canonicalRowsForSelectedMember()
.filter(hasCredit);

currentReportRows = rows;

if (!rows.length) {
return emptyReport(
"No carry-forward credit",
"No members currently have a carry-forward credit for the selected accounting month."
);
}

const totalCredit =
rows.reduce(
(sum, row) =>
sum + number(row.carry_forward),
0
);

return `
<div class="report-kpi-grid">
<div class="report-kpi">
<span>Members with Credit</span>
<strong>${rows.length}</strong>
</div>

  <div class="report-kpi">
    <span>Carry-forward</span>
    <strong>${escapeHtml(money(totalCredit))}</strong>
  </div>

  <div class="report-kpi">
    <span>Accounting Month</span>
    <strong>${escapeHtml(formatMonth(el("accountingMonth")?.value))}</strong>
  </div>

  <div class="report-kpi">
    <span>Source</span>
    <strong>Canonical</strong>
  </div>
</div>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Member</th>
        <th>Monthly Due</th>
        <th>Current Payment</th>
        <th>Applied</th>
        <th>Carry-forward</th>
        <th>Total Paid</th>
        <th>Total Due</th>
        <th>Status</th>
      </tr>
    </thead>

    <tbody>
      ${rows.map(row => `
        <tr>
          <td>
            <strong>${escapeHtml(row.member_name || memberName(row.member_id))}</strong>
            <br>
            <small>${escapeHtml(row.member_number || memberNumber(row.member_id))}</small>
          </td>

          <td class="amount">${escapeHtml(money(row.monthly_due))}</td>
          <td class="amount">${escapeHtml(money(row.current_month_payment))}</td>
          <td class="amount">${escapeHtml(money(row.applied_this_month))}</td>
          <td class="amount">${escapeHtml(money(row.carry_forward))}</td>
          <td class="amount">${escapeHtml(money(row.total_paid_to_date))}</td>
          <td class="amount">${escapeHtml(money(row.total_due_to_date))}</td>

          <td>
            <span class="status-badge ${statusClass(row.status)}">
              ${escapeHtml(statusLabel(row.status))}
            </span>
          </td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</div>

`;
}

/* =========================================================
CONTRIBUTION TYPE REPORT
========================================================= */

function renderContributionTypeReport() {
const rows =
filteredContributions();

currentReportRows = rows;

const grouped =
aggregateContributions(
rows,
"contribution_type"
);

const total =
rows.reduce(
(sum, row) => sum + number(row.amount),
0
);

if (!grouped.length) {
return emptyReport(
"No contribution data",
"No contribution records match the selected period."
);
}

return `
${renderContributionKpis(rows)}

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Contribution Type</th>
        <th class="amount">Entries</th>
        <th class="amount">Amount</th>
        <th class="amount">Share</th>
      </tr>
    </thead>

    <tbody>
      ${grouped.map(item => {
        const share =
          total > 0
            ? item.amount / total * 100
            : 0;

        return `
          <tr>
            <td>${escapeHtml(item.label)}</td>
            <td class="amount">${item.entries}</td>
            <td class="amount">${escapeHtml(money(item.amount))}</td>
            <td class="amount">${share.toFixed(1)}%</td>
          </tr>
        `;
      }).join("")}
    </tbody>
  </table>
</div>

`;
}

/* =========================================================
PAYMENT METHOD REPORT
========================================================= */

function renderPaymentMethodReport() {
const rows =
filteredContributions();

currentReportRows = rows;

const grouped =
aggregateContributions(
rows,
"payment_method"
);

const total =
rows.reduce(
(sum, row) => sum + number(row.amount),
0
);

if (!grouped.length) {
return emptyReport(
"No payment data",
"No contribution records match the selected period."
);
}

return `
${renderContributionKpis(rows)}

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Payment Method</th>
        <th class="amount">Entries</th>
        <th class="amount">Amount</th>
        <th class="amount">Share</th>
      </tr>
    </thead>

    <tbody>
      ${grouped.map(item => {
        const share =
          total > 0
            ? item.amount / total * 100
            : 0;

        return `
          <tr>
            <td>${escapeHtml(item.label)}</td>
            <td class="amount">${item.entries}</td>
            <td class="amount">${escapeHtml(money(item.amount))}</td>
            <td class="amount">${share.toFixed(1)}%</td>
          </tr>
        `;
      }).join("")}
    </tbody>
  </table>
</div>

`;
}

/* =========================================================
EXPENSE REPORT
========================================================= */

function renderExpenseReport() {
const rows =
filteredExpenses();

currentReportRows = rows;

if (!rows.length) {
return emptyReport(
"No expenses found",
"No expenses match the selected reporting period."
);
}

const approved =
rows.filter(
row => expenseStatus(row) === "approved"
);

const pending =
rows.filter(
row => expenseStatus(row) === "pending"
);

const rejected =
rows.filter(
row => expenseStatus(row) === "rejected"
);

const approvedTotal =
approved.reduce(
(sum, row) => sum + number(row.amount),
0
);

const pendingTotal =
pending.reduce(
(sum, row) => sum + number(row.amount),
0
);

const rejectedTotal =
rejected.reduce(
(sum, row) => sum + number(row.amount),
0
);

const groupBy =
el("groupBy")?.value === "expense_category"
? "expense_category"
: "expense_category";

const grouped =
aggregateExpenses(
approved,
groupBy
);

return `
<div class="report-kpi-grid">
<div class="report-kpi">
<span>Approved</span>
<strong>${escapeHtml(money(approvedTotal))}</strong>
</div>

  <div class="report-kpi">
    <span>Pending</span>
    <strong>${escapeHtml(money(pendingTotal))}</strong>
  </div>

  <div class="report-kpi">
    <span>Rejected</span>
    <strong>${escapeHtml(money(rejectedTotal))}</strong>
  </div>

  <div class="report-kpi">
    <span>Entries</span>
    <strong>${rows.length}</strong>
  </div>
</div>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th class="amount">Entries</th>
        <th class="amount">Approved Amount</th>
      </tr>
    </thead>

    <tbody>
      ${grouped.map(item => `
        <tr>
          <td>${escapeHtml(item.label)}</td>
          <td class="amount">${item.entries}</td>
          <td class="amount">${escapeHtml(money(item.amount))}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</div>

`;
}

function aggregateExpenses(rows, groupBy) {
const map = new Map();

rows.forEach(row => {
let key = "Uncategorised";

if (groupBy === "expense_category") {
  key = row.category || "Uncategorised";
} else if (groupBy === "month") {
  key = monthKey(row.date);
} else if (groupBy === "status") {
  key = expenseStatus(row);
}

if (!map.has(key)) {
  map.set(key, {
    label: key,
    entries: 0,
    amount: 0
  });
}

const item =
  map.get(key);

item.entries += 1;
item.amount += number(row.amount);

});

return [...map.values()]
.sort((a, b) => b.amount - a.amount);
}

/* =========================================================
CASH FLOW
========================================================= */

function renderCashFlowReport() {
const contributionRows =
filteredContributions();

const expenseRows =
filteredExpenses()
.filter(row => expenseStatus(row) === "approved");

const months = new Set();

contributionRows.forEach(row => {
months.add(monthKey(row.contribution_date));
});

expenseRows.forEach(row => {
months.add(monthKey(row.date));
});

const items =
[...months]
.filter(Boolean)
.sort();

currentReportRows = items.map(month => {
const contributionsTotal =
contributionRows
.filter(row =>
monthKey(row.contribution_date) === month
)
.reduce(
(sum, row) => sum + number(row.amount),
0
);

const expensesTotal =
  expenseRows
    .filter(row =>
      monthKey(row.date) === month
    )
    .reduce(
      (sum, row) => sum + number(row.amount),
      0
    );

return {
  month,
  contributions: contributionsTotal,
  expenses: expensesTotal,
  net: contributionsTotal - expensesTotal
};

});

if (!currentReportRows.length) {
return emptyReport(
"No cash flow data",
"No contribution or approved expense activity was found in the selected period."
);
}

return `
<div class="table-wrap">
<table>
<thead>
<tr>
<th>Month</th>
<th class="amount">Cash Contributions</th>
<th class="amount">Approved Expenses</th>
<th class="amount">Net Movement</th>
</tr>
</thead>

    <tbody>
      ${currentReportRows.map(item => `
        <tr>
          <td>${escapeHtml(formatMonth(item.month))}</td>
          <td class="amount">${escapeHtml(money(item.contributions))}</td>
          <td class="amount">${escapeHtml(money(item.expenses))}</td>
          <td class="amount"><strong>${escapeHtml(money(item.net))}</strong></td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</div>

`;
}

/* =========================================================
MEETING REPORT
========================================================= */

function renderMeetingReport() {
const rows =
filteredMeetings();

currentReportRows = rows;

if (!rows.length) {
return emptyReport(
"No meetings found",
"No meetings match the selected reporting period."
);
}

return `
<div class="meeting-cards">
<div class="meeting-card">
<span>Total</span>
<strong>${rows.length}</strong>
</div>

  <div class="meeting-card">
    <span>Upcoming</span>
    <strong>${rows.filter(row => {
      const status = normalizeStatus(row.status);
      return status === "upcoming" ||
        status === "scheduled" ||
        normalizeDate(row.date) >= today();
    }).length}</strong>
  </div>

  <div class="meeting-card">
    <span>Completed</span>
    <strong>${rows.filter(row =>
      normalizeStatus(row.status) === "completed"
    ).length}</strong>
  </div>

  <div class="meeting-card">
    <span>Cancelled</span>
    <strong>${rows.filter(row =>
      normalizeStatus(row.status) === "cancelled"
    ).length}</strong>
  </div>
</div>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Title</th>
        <th>Venue</th>
        <th>Status</th>
      </tr>
    </thead>

    <tbody>
      ${rows.map(row => `
        <tr>
          <td>${escapeHtml(formatDate(row.date))}</td>
          <td>${escapeHtml(row.title || "Meeting")}</td>
          <td>${escapeHtml(row.venue || "—")}</td>
          <td>
            <span class="status-badge ${statusClass(row.status)}">
              ${escapeHtml(row.status || "scheduled")}
            </span>
          </td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</div>

`;
}

/* =========================================================
EXECUTIVE REPORT
========================================================= */

function renderExecutiveReport() {
currentReportRows = [];

const contributionRows =
filteredContributions();

const expenseRows =
filteredExpenses();

const meetingRows =
filteredMeetings();

const canonicalRows =
canonicalRowsForSelectedMember();

const contributionsTotal =
contributionRows.reduce(
(sum, row) => sum + number(row.amount),
0
);

const approvedExpenses =
expenseRows
.filter(row => expenseStatus(row) === "approved")
.reduce(
(sum, row) => sum + number(row.amount),
0
);

const attention =
canonicalRows.filter(needsAttention).length;

const credit =
canonicalRows.filter(hasCredit).length;

return `
<div class="report-kpi-grid">
<div class="report-kpi">
<span>Cash Contributions</span>
<strong>${escapeHtml(money(contributionsTotal))}</strong>
</div>

  <div class="report-kpi">
    <span>Approved Expenses</span>
    <strong>${escapeHtml(money(approvedExpenses))}</strong>
  </div>

  <div class="report-kpi">
    <span>Members Needing Attention</span>
    <strong>${attention}</strong>
  </div>

  <div class="report-kpi">
    <span>Members with Credit</span>
    <strong>${credit}</strong>
  </div>
</div>

<div class="breakdown-grid">

  <div>
    <h3>Member Accounting Snapshot</h3>
    ${renderCanonicalStatusTable(canonicalRows)}
  </div>

  <div>
    <h3>Meetings</h3>

    <div class="meeting-cards">
      <div class="meeting-card">
        <span>Total</span>
        <strong>${meetingRows.length}</strong>
      </div>

      <div class="meeting-card">
        <span>Completed</span>
        <strong>${meetingRows.filter(row =>
          normalizeStatus(row.status) === "completed"
        ).length}</strong>
      </div>
    </div>

    <p class="report-footer-note">
      The accounting snapshot is sourced directly from the canonical
      monthly accounting RPC for the selected accounting month.
    </p>
  </div>

</div>

`;
}

/* =========================================================
FULL REPORT
========================================================= */

function renderFullReport() {
currentReportRows = [];

const contributionRows =
filteredContributions();

const expenseRows =
filteredExpenses();

const meetingRows =
filteredMeetings();

const canonicalRows =
canonicalRowsForSelectedMember();

return `
<h3>Member Accounting</h3>
${renderCanonicalStatusTable(canonicalRows)}

<h3 style="margin-top:24px;">Contribution Activity</h3>
${contributionRows.length
  ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Member</th>
            <th>Type</th>
            <th>Payment Method</th>
            <th class="amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${contributionRows.map(row => `
            <tr>
              <td>${escapeHtml(formatDate(row.contribution_date))}</td>
              <td>${escapeHtml(memberName(row.member_id))}</td>
              <td>${escapeHtml(contributionTypeLabel(row.contribution_type))}</td>
              <td>${escapeHtml(paymentMethodLabel(row.payment_method))}</td>
              <td class="amount">${escapeHtml(money(row.amount))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `
  : `<div class="report-empty">No contribution activity.</div>`
}

<h3 style="margin-top:24px;">Expenses</h3>
${expenseRows.length
  ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Category</th>
            <th>Status</th>
            <th class="amount">Amount</th>
          </tr>
        </thead>

        <tbody>
          ${expenseRows.map(row => `
            <tr>
              <td>${escapeHtml(formatDate(row.date))}</td>
              <td>${escapeHtml(row.description || "—")}</td>
              <td>${escapeHtml(row.category || "Uncategorised")}</td>
              <td>${escapeHtml(expenseStatus(row))}</td>
              <td class="amount">${escapeHtml(money(row.amount))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `
  : `<div class="report-empty">No expense activity.</div>`
}

<h3 style="margin-top:24px;">Meetings</h3>
${meetingRows.length
  ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Title</th>
            <th>Venue</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${meetingRows.map(row => `
            <tr>
              <td>${escapeHtml(formatDate(row.date))}</td>
              <td>${escapeHtml(row.title || "Meeting")}</td>
              <td>${escapeHtml(row.venue || "—")}</td>
              <td>${escapeHtml(row.status || "scheduled")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `
  : `<div class="report-empty">No meetings.</div>`
}

`;
}

/* =========================================================
EMPTY REPORT
========================================================= */

function emptyReport(title, message) {
return "<div class="report-empty"> <strong>${escapeHtml(title)}</strong> <p>${escapeHtml(message)}</p> </div>";
}

/* =========================================================
REPORT GENERATION
========================================================= */

async function generateReport() {
clearError();
clearStatus();

try {
const { from, to } =
validateDateRange();

const accountingMonth =
  el("accountingMonth")?.value ||
  monthKey(to);

if (!accountingMonth) {
  throw new Error("Please select an accounting month.");
}

await loadCanonicalAccounting(
  accountingMonth
);

calculatePeriodSummary();

renderContributionBreakdown();
renderExpenseBreakdown();
renderContributionEntries();
renderExpenseEntries();
renderMeetings();

currentReportType =
  el("reportType")?.value ||
  "executive";

let html = "";

switch (currentReportType) {
  case "member-contributions":
    html = renderMemberContributionsReport();
    break;

  case "arrears":
    html = renderArrearsReport();
    break;

  case "credit":
    html = renderCreditReport();
    break;

  case "contribution-types":
    html = renderContributionTypeReport();
    break;

  case "payment-methods":
    html = renderPaymentMethodReport();
    break;

  case "expenses":
    html = renderExpenseReport();
    break;

  case "cash-flow":
    html = renderCashFlowReport();
    break;

  case "meetings":
    html = renderMeetingReport();
    break;

  case "full":
    html = renderFullReport();
    break;

  case "executive":
  default:
    html = renderExecutiveReport();
    break;
}

const reportNames = {
  executive: "Executive Summary",
  "member-contributions": "Member Contributions",
  arrears: "Arrears & Outstanding",
  credit: "Carry-forward / Credit",
  "contribution-types": "Contribution Types",
  "payment-methods": "Payment Methods",
  expenses: "Expenses",
  "cash-flow": "Cash Flow",
  meetings: "Meetings",
  full: "Full Chama Report"
};

setText(
  "reportOutputTitle",
  reportNames[currentReportType] ||
  "Report"
);

setText(
  "reportOutputSubtitle",
  `${formatDate(from)} — ${formatDate(to)}`
);

const output =
  el("reportOutput");

if (output) {
  output.innerHTML = html;
}

updatePrintMeta(
  reportNames[currentReportType] ||
  "Report",
  from,
  to,
  accountingMonth
);

showStatus(
  `Report generated for ${formatDate(from)} to ${formatDate(to)}.`
);

} catch (error) {
console.error(
"CHAMA LIVE: Report generation error",
error
);

showError(
  error?.message ||
  "Unable to generate report."
);

}
}

/* =========================================================
QUICK FILTERS
========================================================= */

function applyQuickFilter(filter) {
const status =
el("statusFilter");

const member =
el("memberFilter");

if (!status || !member) return;

if (filter === "all") {
member.value = "all";
status.value = "all";
}

if (filter === "attention") {
member.value = "all";
status.value = "partial";
}

if (filter === "arrears") {
member.value = "all";
status.value = "outstanding";
}

if (filter === "credit") {
member.value = "all";
status.value = "credit";
}

document
.querySelectorAll(".quick-filter")
.forEach(button => {
button.classList.toggle(
"active",
button.dataset.quick === filter
);
});

generateReport();
}

/* =========================================================
RESET
========================================================= */

async function resetFilters() {
clearError();
clearStatus();

setDefaultDates();

const reportType =
el("reportType");

if (reportType) {
reportType.value = "executive";
}

const member =
el("memberFilter");

if (member) {
member.value = "all";
}

const status =
el("statusFilter");

if (status) {
status.value = "all";
}

const contributionType =
el("contributionTypeFilter");

if (contributionType) {
contributionType.value = "all";
}

const paymentMethod =
el("paymentMethodFilter");

if (paymentMethod) {
paymentMethod.value = "all";
}

const groupBy =
el("groupBy");

if (groupBy) {
groupBy.value = "member";
}

document
.querySelectorAll(".quick-filter")
.forEach(button => {
button.classList.toggle(
"active",
button.dataset.quick === "all"
);
});

await generateReport();
}

/* =========================================================
PRINT
========================================================= */

function updatePrintMeta(
reportName,
from,
to,
accountingMonth
) {
setText(
"printReportType",
reportName
);

setText(
"printPeriod",
"${formatDate(from)} — ${formatDate(to)}"
);

setText(
"printAccountingMonth",
formatMonth(accountingMonth)
);

setText(
"printGeneratedAt",
new Date().toLocaleString("en-KE")
);
}

function printReport() {
window.print();
}

/* =========================================================
EXPORT HELPERS
========================================================= */

function downloadBlob(
content,
filename,
type
) {
const blob =
new Blob(
[content],
{ type }
);

const url =
URL.createObjectURL(blob);

const anchor =
document.createElement("a");

anchor.href = url;
anchor.download = filename;

document.body.appendChild(anchor);

anchor.click();

anchor.remove();

URL.revokeObjectURL(url);
}

function csvEscape(value) {
const text =
String(value ?? "");

if (
text.includes(",") ||
text.includes('"') ||
text.includes("\n")
) {
return ""${text.replaceAll('"', '""')}"";
}

return text;
}

function exportCsv() {
clearError();

try {
const reportName =
el("reportOutputTitle")?.textContent ||
"CHAMA LIVE Report";

const period =
  el("printPeriod")?.textContent ||
  "";

const lines = [];

lines.push(
  csvEscape("CHAMA LIVE")
);

lines.push(
  csvEscape(reportName)
);

lines.push(
  csvEscape(`Period: ${period}`)
);

lines.push("");

if (
  currentReportType === "arrears" ||
  currentReportType === "credit"
) {
  const rows =
    canonicalRowsForSelectedMember();

  if (currentReportType === "arrears") {
    lines.push([
      "Member Number",
      "Member",
      "Monthly Due",
      "Previous Arrears",
      "Current Payment",
      "Applied",
      "Current Outstanding",
      "Status"
    ].map(csvEscape).join(","));

    rows
      .filter(row => {
        const status =
          normalizeStatus(row.status);

        return (
          status === "partial" ||
          status === "outstanding" ||
          hasArrears(row)
        );
      })
      .forEach(row => {
        lines.push([
          row.member_number ||
            memberNumber(row.member_id),

          row.member_name ||
            memberName(row.member_id),

          number(row.monthly_due).toFixed(2),
          number(row.previous_outstanding).toFixed(2),
          number(row.current_month_payment).toFixed(2),
          number(row.applied_this_month).toFixed(2),
          number(row.current_outstanding).toFixed(2),
          statusLabel(row.status)
        ].map(csvEscape).join(","));
      });
  } else {
    lines.push([
      "Member Number",
      "Member",
      "Monthly Due",
      "Current Payment",
      "Applied",
      "Carry-forward",
      "Total Paid",
      "Total Due",
      "Status"
    ].map(csvEscape).join(","));

    rows
      .filter(hasCredit)
      .forEach(row => {
        lines.push([
          row.member_number ||
            memberNumber(row.member_id),

          row.member_name ||
            memberName(row.member_id),

          number(row.monthly_due).toFixed(2),
          number(row.current_month_payment).toFixed(2),
          number(row.applied_this_month).toFixed(2),
          number(row.carry_forward).toFixed(2),
          number(row.total_paid_to_date).toFixed(2),
          number(row.total_due_to_date).toFixed(2),
          statusLabel(row.status)
        ].map(csvEscape).join(","));
      });
  }

} else if (
  currentReportType === "member-contributions" ||
  currentReportType === "contribution-types" ||
  currentReportType === "payment-methods"
) {
  const rows =
    filteredContributions();

  lines.push([
    "Date",
    "Member Number",
    "Member",
    "Contribution Type",
    "Payment Method",
    "Reference",
    "Amount"
  ].map(csvEscape).join(","));

  rows.forEach(row => {
    lines.push([
      normalizeDate(row.contribution_date),
      memberNumber(row.member_id),
      memberName(row.member_id),
      contributionTypeLabel(row.contribution_type),
      paymentMethodLabel(row.payment_method),
      row.mpesa_reference ||
        row.reference ||
        "",
      number(row.amount).toFixed(2)
    ].map(csvEscape).join(","));
  });

} else if (currentReportType === "expenses") {
  const rows =
    filteredExpenses();

  lines.push([
    "Date",
    "Description",
    "Category",
    "Status",
    "Amount"
  ].map(csvEscape).join(","));

  rows.forEach(row => {
    lines.push([
      normalizeDate(row.date),
      row.description || "",
      row.category || "",
      expenseStatus(row),
      number(row.amount).toFixed(2)
    ].map(csvEscape).join(","));
  });

} else if (currentReportType === "meetings") {
  const rows =
    filteredMeetings();

  lines.push([
    "Date",
    "Title",
    "Venue",
    "Status"
  ].map(csvEscape).join(","));

  rows.forEach(row => {
    lines.push([
      normalizeDate(row.date),
      row.title || "",
      row.venue || "",
      row.status || ""
    ].map(csvEscape).join(","));
  });

} else if (currentReportType === "cash-flow") {
  currentReportRows.forEach((row, index) => {
    if (index === 0) {
      lines.push([
        "Month",
        "Cash Contributions",
        "Approved Expenses",
        "Net Movement"
      ].map(csvEscape).join(","));
    }

    lines.push([
      row.month,
      number(row.contributions).toFixed(2),
      number(row.expenses).toFixed(2),
      number(row.net).toFixed(2)
    ].map(csvEscape).join(","));
  });

} else {
  const rows =
    filteredContributions();

  lines.push([
    "Date",
    "Member",
    "Contribution Type",
    "Payment Method",
    "Amount"
  ].map(csvEscape).join(","));

  rows.forEach(row => {
    lines.push([
      normalizeDate(row.contribution_date),
      memberName(row.member_id),
      contributionTypeLabel(row.contribution_type),
      paymentMethodLabel(row.payment_method),
      number(row.amount).toFixed(2)
    ].map(csvEscape).join(","));
  });
}

const filename =
  `chama-live-${slugify(reportName)}-${today()}.csv`;

downloadBlob(
  lines.join("\n"),
  filename,
  "text/csv;charset=utf-8"
);

showStatus(
  "CSV report exported successfully."
);

} catch (error) {
console.error(
"CHAMA LIVE: CSV export error",
error
);

showError(
  error?.message ||
  "Unable to export CSV."
);

}
}

/* =========================================================
EXCEL-COMPATIBLE EXPORT

This intentionally creates an Excel-compatible HTML
spreadsheet with .xls extension.

It is NOT a native XLSX file.
========================================================= */

function exportExcel() {
clearError();

try {
const reportName =
el("reportOutputTitle")?.textContent ||
"CHAMA LIVE Report";

const groupName =
  currentGroup?.name ||
  currentGroup?.group_name ||
  "Current Group";

const period =
  el("printPeriod")?.textContent ||
  "";

const accountingMonth =
  el("printAccountingMonth")?.textContent ||
  "";

let body = "";

if (
  currentReportType === "arrears" ||
  currentReportType === "credit"
) {
  const rows =
    canonicalRowsForSelectedMember();

  const filtered =
    currentReportType === "arrears"
      ? rows.filter(row => {
          const status =
            normalizeStatus(row.status);

          return (
            status === "partial" ||
            status === "outstanding" ||
            hasArrears(row)
          );
        })
      : rows.filter(hasCredit);

  const headers =
    currentReportType === "arrears"
      ? [
          "Member Number",
          "Member",
          "Monthly Due",
          "Previous Arrears",
          "Current Payment",
          "Applied",
          "Current Outstanding",
          "Status"
        ]
      : [
          "Member Number",
          "Member",
          "Monthly Due",
          "Current Payment",
          "Applied",
          "Carry-forward",
          "Total Paid",
          "Total Due",
          "Status"
        ];

  body += htmlExcelRow(
    headers,
    true
  );

  filtered.forEach(row => {
    const values =
      currentReportType === "arrears"
        ? [
            row.member_number ||
              memberNumber(row.member_id),

            row.member_name ||
              memberName(row.member_id),

            money(row.monthly_due),
            money(row.previous_outstanding),
            money(row.current_month_payment),
            money(row.applied_this_month),
            money(row.current_outstanding),
            statusLabel(row.status)
          ]
        : [
            row.member_number ||
              memberNumber(row.member_id),

            row.member_name ||
              memberName(row.member_id),

            money(row.monthly_due),
            money(row.current_month_payment),
            money(row.applied_this_month),
            money(row.carry_forward),
            money(row.total_paid_to_date),
            money(row.total_due_to_date),
            statusLabel(row.status)
          ];

    body += htmlExcelRow(values);
  });

} else if (
  currentReportType === "expenses"
) {
  const rows =
    filteredExpenses();

  body += htmlExcelRow([
    "Date",
    "Description",
    "Category",
    "Status",
    "Amount"
  ], true);

  rows.forEach(row => {
    body += htmlExcelRow([
      normalizeDate(row.date),
      row.description || "",
      row.category || "",
      expenseStatus(row),
      money(row.amount)
    ]);
  });

} else if (
  currentReportType === "meetings"
) {
  const rows =
    filteredMeetings();

  body += htmlExcelRow([
    "Date",
    "Title",
    "Venue",
    "Status"
  ], true);

  rows.forEach(row => {
    body += htmlExcelRow([
      normalizeDate(row.date),
      row.title || "",
      row.venue || "",
      row.status || ""
    ]);
  });

} else if (
  currentReportType === "cash-flow"
) {
  body += htmlExcelRow([
    "Month",
    "Cash Contributions",
    "Approved Expenses",
    "Net Movement"
  ], true);

  currentReportRows.forEach(row => {
    body += htmlExcelRow([
      formatMonth(row.month),
      money(row.contributions),
      money(row.expenses),
      money(row.net)
    ]);
  });

} else {
  const rows =
    filteredContributions();

  body += htmlExcelRow([
    "Date",
    "Member Number",
    "Member",
    "Contribution Type",
    "Payment Method",
    "Reference",
    "Amount"
  ], true);

  rows.forEach(row => {
    body += htmlExcelRow([
      normalizeDate(row.contribution_date),
      memberNumber(row.member_id),
      memberName(row.member_id),
      contributionTypeLabel(row.contribution_type),
      paymentMethodLabel(row.payment_method),
      row.mpesa_reference ||
        row.reference ||
        "",
      money(row.amount)
    ]);
  });
}

const html = `
  <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: Arial, sans-serif;
        }

        h1 {
          font-size: 20px;
        }

        p {
          font-size: 12px;
        }

        table {
          border-collapse: collapse;
          width: 100%;
        }

        th,
        td {
          border: 1px solid #999;
          padding: 7px;
        }

        th {
          font-weight: bold;
          background: #eeeeee;
        }
      </style>
    </head>

    <body>
      <h1>CHAMA LIVE — ${escapeHtml(reportName)}</h1>

      <p>
        <strong>Group:</strong>
        ${escapeHtml(groupName)}
      </p>

      <p>
        <strong>Period:</strong>
        ${escapeHtml(period)}
      </p>

      <p>
        <strong>Accounting Month:</strong>
        ${escapeHtml(accountingMonth)}
      </p>

      <table>
        ${body}
      </table>
    </body>
  </html>
`;

const filename =
  `chama-live-${slugify(reportName)}-${today()}.xls`;

downloadBlob(
  html,
  filename,
  "application/vnd.ms-excel;charset=utf-8"
);

showStatus(
  "Excel-compatible report exported successfully."
);

} catch (error) {
console.error(
"CHAMA LIVE: Excel export error",
error
);

showError(
  error?.message ||
  "Unable to export Excel report."
);

}
}

function htmlExcelRow(values, header = false) {
const tag =
header ? "th" : "td";

return "<tr> ${values.map(value =>"
<${tag}>
${escapeHtml(value)}
</${tag}>
").join("")} </tr> ";
}

function slugify(value) {
return String(value || "report")
.toLowerCase()
.replace(/[^a-z0-9]+/g, "-")
.replace(/^-+|-+$/g, "")
.slice(0, 80);
}

/* =========================================================
EVENT HANDLERS
========================================================= */

function bindEvents() {
el("periodPreset")
?.addEventListener(
"change",
event => {
setPeriodFromPreset(
event.target.value
);

    if (event.target.value !== "custom") {
      generateReport();
    }
  }
);

el("fromDate")
?.addEventListener(
"change",
() => {
const preset =
el("periodPreset");

    if (preset) {
      preset.value = "custom";
    }
  }
);

el("toDate")
?.addEventListener(
"change",
() => {
const preset =
el("periodPreset");

    if (preset) {
      preset.value = "custom";
    }
  }
);

el("accountingMonth")
?.addEventListener(
"change",
() => {
generateReport();
}
);

el("applyFilters")
?.addEventListener(
"click",
generateReport
);

el("resetFilters")
?.addEventListener(
"click",
resetFilters
);

el("printReport")
?.addEventListener(
"click",
printReport
);

el("csvButton")
?.addEventListener(
"click",
exportCsv
);

el("excelButton")
?.addEventListener(
"click",
exportExcel
);

document
.querySelectorAll(".quick-filter")
.forEach(button => {
button.addEventListener(
"click",
() => {
applyQuickFilter(
button.dataset.quick
);
}
);
});

el("reportType")
?.addEventListener(
"change",
() => {
generateReport();
}
);

el("statusFilter")
?.addEventListener(
"change",
() => {
document
.querySelectorAll(".quick-filter")
.forEach(button => {
button.classList.remove("active");
});
}
);

el("memberFilter")
?.addEventListener(
"change",
() => {
document
.querySelectorAll(".quick-filter")
.forEach(button => {
button.classList.remove("active");
});
}
);
}

/* =========================================================
INITIAL LOAD
========================================================= */

async function loadData() {
await Promise.all([
loadMembers(),
loadContributions(),
loadExpenses(),
loadMeetings()
]);

populatePaymentMethods();
}

async function initReports() {
clearError();
clearStatus();

try {
showStatus(
"Loading CHAMA LIVE reports..."
);

await loadContext();

setDefaultDates();

await loadData();

bindEvents();

await generateReport();

clearStatus();

console.log(
  "CHAMA LIVE: Reports 2.0 initialized",
  {
    groupId: currentGroupId,
    members: members.length,
    contributions: contributions.length,
    expenses: expenses.length,
    meetings: meetings.length
  }
);

} catch (error) {
console.error(
"CHAMA LIVE: Reports initialization failed",
error
);

showError(
  error?.message ||
  "Unable to load Reports."
);

}
}

/* =========================================================
START
========================================================= */

document.addEventListener(
"DOMContentLoaded",
initReports
);

/* =========================================================
OPTIONAL GLOBAL ACCESS
========================================================= */

window.CHAMA_LIVE_REPORTS = {
initReports,
generateReport,
printReport,
exportCsv,
exportExcel
};
