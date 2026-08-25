import { supabase } from "./supabase.js";
import { getCurrentGroupId } from "./app.js";

/* =====================================================
ELEMENTS
===================================================== */

const statusBox = document.getElementById("status");
const errorBox = document.getElementById("error");

const activeMembersEl =
document.getElementById("activeMembers");

const totalMembersEl =
document.getElementById("totalMembers");

const contributionsEl =
document.getElementById("contributions");

const approvedExpensesEl =
document.getElementById("approvedExpenses");

const pendingExpensesEl =
document.getElementById("pendingExpenses");

const currentBalanceEl =
document.getElementById("currentBalance");

const openingEl =
document.getElementById("opening");

const contributions2El =
document.getElementById("contributions2");

const expenses2El =
document.getElementById("expenses2");

const balanceEl =
document.getElementById("balance");

const contributionRows =
document.getElementById("contributionRows");

const expenseRows =
document.getElementById("expenseRows");

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
return (
"KSh " +
Number(value || 0).toLocaleString("en-KE", {
minimumFractionDigits: 0,
maximumFractionDigits: 2
})
);
}

/* =====================================================
ESCAPE HTML
===================================================== */

function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&")
.replaceAll("<", "<")
.replaceAll(">", ">")
.replaceAll('"', """)
.replaceAll("'", "'");
}

/* =====================================================
ERROR
===================================================== */

function showError(error) {

console.error(
"CHAMA LIVE Reports:",
error
);

const message =
error?.message ||
String(error);

if (errorBox) {
errorBox.textContent =
"Error: " + message;

errorBox.hidden = false;

}

if (statusBox) {
statusBox.textContent =
"Something went wrong.";
}
}

/* =====================================================
CLEAR ERROR
===================================================== */

function clearError() {

if (!errorBox) {
return;
}

errorBox.textContent = "";
errorBox.hidden = true;
}

/* =====================================================
LOAD MEMBERS
===================================================== */

async function loadMembers(groupId) {

const result =
await supabase
.from("members")
.select("id,name,status")
.eq("group_id", groupId);

if (result.error) {
throw result.error;
}

const members =
result.data || [];

const active =
members.filter(
member =>
String(member.status || "")
.toLowerCase() === "active"
).length;

if (activeMembersEl) {
activeMembersEl.textContent =
active;
}

if (totalMembersEl) {
totalMembersEl.textContent =
members.length;
}

const memberMap = {};

members.forEach(member => {
memberMap[member.id] =
member.name || "Unknown";
});

return memberMap;
}

/* =====================================================
LOAD CONTRIBUTIONS
===================================================== */

async function loadContributions(
groupId,
memberMap
) {

/*
Actual contributions columns:

id
group_id
member_id
amount
contribution_type
month
payment_method
reference
recorded_by
created_at
goal_id
contribution_date
notes

IMPORTANT:
There is NO contributions.date
*/

const result =
await supabase
.from("contributions")
.select( id, member_id, amount, contribution_type, month, payment_method, reference, contribution_date )
.eq("group_id", groupId)
.order("contribution_date", {
ascending: false
});

if (result.error) {
throw result.error;
}

const contributions =
result.data || [];

/* ===================================================
TOTAL CONTRIBUTIONS
=================================================== */

const total =
contributions.reduce(
(sum, contribution) =>
sum +
Number(
contribution.amount || 0
),
0
);

if (contributionsEl) {
contributionsEl.textContent =
money(total);
}

if (contributions2El) {
contributions2El.textContent =
money(total);
}

/* ===================================================
CONTRIBUTION TABLE
=================================================== */

if (!contributionRows) {
return total;
}

if (contributions.length === 0) {

contributionRows.innerHTML =
  `
  <tr>
    <td colspan="6">
      No contributions yet.
    </td>
  </tr>
  `;

return total;

}

const recent =
contributions.slice(0, 10);

contributionRows.innerHTML =
recent
.map(contribution => {

    const memberName =
      memberMap[
        contribution.member_id
      ] || "Unknown";


    const displayDate =
      contribution.contribution_date ||
      contribution.month ||
      "—";


    return `
      <tr>

        <td>
          ${escapeHtml(displayDate)}
        </td>

        <td>
          ${escapeHtml(memberName)}
        </td>

        <td>
          ${money(contribution.amount)}
        </td>

        <td>
          ${escapeHtml(
            contribution.contribution_type ||
            "—"
          )}
        </td>

        <td>
          ${escapeHtml(
            contribution.payment_method ||
            "—"
          )}
        </td>

        <td>
          ${escapeHtml(
            contribution.reference ||
            "—"
          )}
        </td>

      </tr>
    `;

  })
  .join("");

return total;
}

/* =====================================================
LOAD EXPENSES
===================================================== */

async function loadExpenses(groupId) {

/*
Actual expenses columns include:

id
group_id
description
category
amount
date
approval_status
*/

const result =
await supabase
.from("expenses")
.select( id, date, description, category, amount, approval_status )
.eq("group_id", groupId)
.order("date", {
ascending: false
});

if (result.error) {
throw result.error;
}

const expenses =
result.data || [];

/* ===================================================
APPROVED EXPENSES
=================================================== */

const approved =
expenses.filter(
expense =>
String(
expense.approval_status || ""
).toLowerCase() === "approved"
);

const approvedTotal =
approved.reduce(
(sum, expense) =>
sum +
Number(
expense.amount || 0
),
0
);

/* ===================================================
PENDING EXPENSES
=================================================== */

const pending =
expenses.filter(
expense =>
String(
expense.approval_status || ""
).toLowerCase() === "pending"
);

const pendingTotal =
pending.reduce(
(sum, expense) =>
sum +
Number(
expense.amount || 0
),
0
);

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
EXPENSE TABLE
=================================================== */

if (!expenseRows) {
return approvedTotal;
}

if (expenses.length === 0) {

expenseRows.innerHTML =
  `
  <tr>
    <td colspan="5">
      No expenses yet.
    </td>
  </tr>
  `;

return approvedTotal;

}

const recent =
expenses.slice(0, 10);

expenseRows.innerHTML =
recent
.map(expense => {

    return `
      <tr>

        <td>
          ${escapeHtml(
            expense.date || "—"
          )}
        </td>

        <td>
          ${escapeHtml(
            expense.description || "—"
          )}
        </td>

        <td>
          ${escapeHtml(
            expense.category || "—"
          )}
        </td>

        <td>
          ${money(expense.amount)}
        </td>

        <td>
          ${escapeHtml(
            expense.approval_status || "—"
          )}
        </td>

      </tr>
    `;

  })
  .join("");

return approvedTotal;
}

/* =====================================================
LOAD MEETINGS
===================================================== */

async function loadMeetings(groupId) {

const result =
await supabase
.from("meetings")
.select( id, date, status )
.eq("group_id", groupId);

if (result.error) {
throw result.error;
}

const meetings =
result.data || [];

/* ===================================================
UPCOMING
=================================================== */

const upcoming =
meetings.filter(
meeting =>
String(
meeting.status || ""
).toLowerCase() === "upcoming"
).length;

/* ===================================================
COMPLETED
=================================================== */

const completed =
meetings.filter(
meeting =>
String(
meeting.status || ""
).toLowerCase() === "completed"
).length;

/* ===================================================
CANCELLED
=================================================== */

const cancelled =
meetings.filter(
meeting =>
String(
meeting.status || ""
).toLowerCase() === "cancelled"
).length;

if (upcomingMeetingsEl) {
upcomingMeetingsEl.textContent =
upcoming;
}

if (completedMeetingsEl) {
completedMeetingsEl.textContent =
completed;
}

if (cancelledMeetingsEl) {
cancelledMeetingsEl.textContent =
cancelled;
}
}

/* =====================================================
LOAD REPORTS
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
OPENING BALANCE
=================================================== */

const openingBalance = 0;

/* ===================================================
CLOSING BALANCE
=================================================== */

const closingBalance =
openingBalance +
contributionTotal -
approvedExpenseTotal;

/* ===================================================
UPDATE FINANCIAL POSITION
=================================================== */

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

/* ===================================================
SUCCESS
=================================================== */

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
async () => {

  try {

    await supabase.auth.signOut();

    window.location.href =
      "login.html";

  } catch (error) {

    showError(error);

  }

}

);

}

/* =====================================================
START
===================================================== */

async function start() {

try {

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

} catch (error) {

showError(error);

}

}

start();
