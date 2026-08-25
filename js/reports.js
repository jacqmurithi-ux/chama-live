import { supabase } from "./supabase.js";
import { getCurrentGroupId } from "./app.js";

/* =====================================================
ELEMENTS
===================================================== */

const statusBox = document.getElementById("status");
const errorBox = document.getElementById("error");

const activeMembersEl = document.getElementById("activeMembers");
const totalMembersEl = document.getElementById("totalMembers");
const contributionsEl = document.getElementById("contributions");
const approvedExpensesEl = document.getElementById("approvedExpenses");
const pendingExpensesEl = document.getElementById("pendingExpenses");
const currentBalanceEl = document.getElementById("currentBalance");

const openingEl = document.getElementById("opening");
const contributions2El = document.getElementById("contributions2");
const expenses2El = document.getElementById("expenses2");
const balanceEl = document.getElementById("balance");

const contributionRows = document.getElementById("contributionRows");
const expenseRows = document.getElementById("expenseRows");

const upcomingMeetingsEl =
document.getElementById("upcomingMeetings");

const completedMeetingsEl =
document.getElementById("completedMeetings");

const cancelledMeetingsEl =
document.getElementById("cancelledMeetings");

const logoutButton =
document.getElementById("logout");

/* =====================================================
MONEY
===================================================== */

function money(value) {
const number = Number(value || 0);

return "KSh " + number.toLocaleString("en-KE", {
minimumFractionDigits: 0,
maximumFractionDigits: 2
});
}

/* =====================================================
SAFE TEXT
===================================================== */

function safe(value) {
if (value === null || value === undefined) {
return "";
}

return String(value);
}

/* =====================================================
ERROR
===================================================== */

function showError(error) {
console.error("CHAMA LIVE Reports:", error);

const message =
error && error.message
? error.message
: String(error);

if (errorBox) {
errorBox.textContent = "Error: " + message;
errorBox.hidden = false;
}

if (statusBox) {
statusBox.textContent = "Something went wrong.";
}
}

/* =====================================================
CLEAR ERROR
===================================================== */

function clearError() {
if (errorBox) {
errorBox.textContent = "";
errorBox.hidden = true;
}
}

/* =====================================================
LOAD MEMBERS
===================================================== */

async function loadMembers(groupId) {

const result = await supabase
.from("members")
.select("id,name,status")
.eq("group_id", groupId);

if (result.error) {
throw result.error;
}

const members = result.data || [];

let activeCount = 0;

members.forEach(function(member) {
if (
String(member.status || "").toLowerCase() === "active"
) {
activeCount++;
}
});

if (activeMembersEl) {
activeMembersEl.textContent = activeCount;
}

if (totalMembersEl) {
totalMembersEl.textContent = members.length;
}

const memberMap = {};

members.forEach(function(member) {
memberMap[member.id] = member.name || "Unknown";
});

return memberMap;
}

/* =====================================================
LOAD CONTRIBUTIONS
===================================================== */

async function loadContributions(groupId, memberMap) {

/*
IMPORTANT:

```
The contributions table DOES NOT have:

date

It has:

contribution_date
```

*/

const result = await supabase
.from("contributions")
.select(
"id,member_id,amount,contribution_type,month,payment_method,reference,contribution_date"
)
.eq("group_id", groupId)
.order("contribution_date", {
ascending: false
});

if (result.error) {
throw result.error;
}

const rows = result.data || [];

let total = 0;

rows.forEach(function(row) {
total += Number(row.amount || 0);
});

/* ===================================================
TOTAL
=================================================== */

if (contributionsEl) {
contributionsEl.textContent = money(total);
}

if (contributions2El) {
contributions2El.textContent = money(total);
}

/* ===================================================
TABLE
=================================================== */

if (!contributionRows) {
return total;
}

if (rows.length === 0) {

```
contributionRows.innerHTML =
  "<tr>" +
  "<td colspan=\"6\">No contributions yet.</td>" +
  "</tr>";

return total;
```

}

const recent = rows.slice(0, 10);

let html = "";

recent.forEach(function(row) {

```
const memberName =
  memberMap[row.member_id] || "Unknown";

const date =
  row.contribution_date ||
  row.month ||
  "—";

const type =
  row.contribution_type ||
  "—";

const method =
  row.payment_method ||
  "—";

const reference =
  row.reference ||
  "—";

html +=
  "<tr>" +

  "<td>" +
  safe(date) +
  "</td>" +

  "<td>" +
  safe(memberName) +
  "</td>" +

  "<td>" +
  money(row.amount) +
  "</td>" +

  "<td>" +
  safe(type) +
  "</td>" +

  "<td>" +
  safe(method) +
  "</td>" +

  "<td>" +
  safe(reference) +
  "</td>" +

  "</tr>";
```

});

contributionRows.innerHTML = html;

return total;
}

/* =====================================================
LOAD EXPENSES
===================================================== */

async function loadExpenses(groupId) {

const result = await supabase
.from("expenses")
.select(
"id,date,description,category,amount,approval_status"
)
.eq("group_id", groupId)
.order("date", {
ascending: false
});

if (result.error) {
throw result.error;
}

const rows = result.data || [];

let approvedTotal = 0;
let pendingTotal = 0;

rows.forEach(function(row) {

```
const status =
  String(row.approval_status || "").toLowerCase();

const amount =
  Number(row.amount || 0);

if (status === "approved") {
  approvedTotal += amount;
}

if (status === "pending") {
  pendingTotal += amount;
}
```

});

/* ===================================================
METRICS
=================================================== */

if (approvedExpensesEl) {
approvedExpensesEl.textContent =
money(approvedTotal);
}

if (pendingExpensesEl) {
pendingExpensesEl.textContent =
money(pendingTotal);
}

if (expenses2El) {
expenses2El.textContent =
money(approvedTotal);
}

/* ===================================================
TABLE
=================================================== */

if (!expenseRows) {
return approvedTotal;
}

if (rows.length === 0) {

```
expenseRows.innerHTML =
  "<tr>" +
  "<td colspan=\"5\">No expenses yet.</td>" +
  "</tr>";

return approvedTotal;
```

}

const recent = rows.slice(0, 10);

let html = "";

recent.forEach(function(row) {

```
html +=
  "<tr>" +

  "<td>" +
  safe(row.date || "—") +
  "</td>" +

  "<td>" +
  safe(row.description || "—") +
  "</td>" +

  "<td>" +
  safe(row.category || "—") +
  "</td>" +

  "<td>" +
  money(row.amount) +
  "</td>" +

  "<td>" +
  safe(row.approval_status || "—") +
  "</td>" +

  "</tr>";
```

});

expenseRows.innerHTML = html;

return approvedTotal;
}

/* =====================================================
LOAD MEETINGS
===================================================== */

async function loadMeetings(groupId) {

const result = await supabase
.from("meetings")
.select("id,date,status")
.eq("group_id", groupId);

if (result.error) {
throw result.error;
}

const meetings = result.data || [];

let upcoming = 0;
let completed = 0;
let cancelled = 0;

meetings.forEach(function(meeting) {

```
const status =
  String(meeting.status || "").toLowerCase();

if (status === "upcoming") {
  upcoming++;
}

if (status === "completed") {
  completed++;
}

if (status === "cancelled") {
  cancelled++;
}
```

});

if (upcomingMeetingsEl) {
upcomingMeetingsEl.textContent = upcoming;
}

if (completedMeetingsEl) {
completedMeetingsEl.textContent = completed;
}

if (cancelledMeetingsEl) {
cancelledMeetingsEl.textContent = cancelled;
}
}

/* =====================================================
MAIN REPORT
===================================================== */

async function loadReports() {

clearError();

if (statusBox) {
statusBox.textContent =
"Finding your group...";
}

const groupId =
await getCurrentGroupId();

if (!groupId) {
throw new Error(
"No group is linked to this account."
);
}

if (statusBox) {
statusBox.textContent =
"Loading live report...";
}

/* ===================================================
MEMBERS
=================================================== */

const memberMap =
await loadMembers(groupId);

/* ===================================================
CONTRIBUTIONS
=================================================== */

const contributionTotal =
await loadContributions(
groupId,
memberMap
);

/* ===================================================
EXPENSES
=================================================== */

const approvedExpenseTotal =
await loadExpenses(groupId);

/* ===================================================
MEETINGS
=================================================== */

await loadMeetings(groupId);

/* ===================================================
BALANCE
=================================================== */

const openingBalance = 0;

const closingBalance =
openingBalance +
contributionTotal -
approvedExpenseTotal;

if (openingEl) {
openingEl.textContent =
money(openingBalance);
}

if (balanceEl) {
balanceEl.textContent =
money(closingBalance);
}

if (currentBalanceEl) {
currentBalanceEl.textContent =
money(closingBalance);
}

if (statusBox) {
statusBox.textContent =
"Report updated successfully.";
}
}

/* =====================================================
LOGOUT
===================================================== */

if (logoutButton) {

logoutButton.addEventListener(
"click",
async function() {

```
  try {

    await supabase.auth.signOut();

    window.location.href =
      "login.html";

  } catch (error) {

    showError(error);

  }

}
```

);

}

/* =====================================================
START
===================================================== */

async function start() {

try {

```
const sessionResult =
  await supabase.auth.getSession();

if (sessionResult.error) {
  throw sessionResult.error;
}

if (!sessionResult.data.session) {

  window.location.href =
    "login.html";

  return;
}

await loadReports();
```

} catch (error) {

```
showError(error);
```

}
}

start();
