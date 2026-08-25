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

const upcomingMeetingsEl = document.getElementById("upcomingMeetings");
const completedMeetingsEl = document.getElementById("completedMeetings");
const cancelledMeetingsEl = document.getElementById("cancelledMeetings");

const logoutButton = document.getElementById("logout");

/* =====================================================
MONEY
===================================================== */

function money(value) {
const amount = Number(value || 0);

```
return "KSh " + amount.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
});
```

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
console.error("CHAMA LIVE reports:", error);

```
const message = error?.message || String(error);

if (errorBox) {
    errorBox.textContent = "Error: " + message;
    errorBox.hidden = false;
}

if (statusBox) {
    statusBox.textContent = "Something went wrong.";
}
```

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

```
const result = await supabase
    .from("members")
    .select("id,name,status")
    .eq("group_id", groupId);

if (result.error) {
    throw result.error;
}

const members = result.data || [];

const activeCount = members.filter(member => {
    return String(member.status || "").toLowerCase() === "active";
}).length;

if (activeMembersEl) {
    activeMembersEl.textContent = activeCount;
}

if (totalMembersEl) {
    totalMembersEl.textContent = members.length;
}

return members;
```

}

/* =====================================================
LOAD CONTRIBUTIONS
===================================================== */

async function loadContributions(groupId) {

```
/*
   IMPORTANT

   The contributions table DOES NOT have:

   date

   It DOES have:

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
*/

const result = await supabase
    .from("contributions")
    .select(`
        id,
        group_id,
        member_id,
        amount,
        contribution_type,
        month,
        payment_method,
        reference,
        recorded_by,
        created_at,
        goal_id,
        contribution_date,
        notes,
        members (
            name
        )
    `)
    .eq("group_id", groupId)
    .order("contribution_date", {
        ascending: false
    });

if (result.error) {
    throw result.error;
}

const contributions = result.data || [];

const total = contributions.reduce((sum, contribution) => {
    return sum + Number(contribution.amount || 0);
}, 0);

if (contributionsEl) {
    contributionsEl.textContent = money(total);
}

if (contributions2El) {
    contributions2El.textContent = money(total);
}

renderContributions(contributions);

return total;
```

}

/* =====================================================
RENDER CONTRIBUTIONS
===================================================== */

function renderContributions(contributions) {

```
if (!contributionRows) {
    return;
}

const recent = contributions.slice(0, 10);

if (recent.length === 0) {

    contributionRows.innerHTML = `
        <tr>
            <td colspan="6">
                No contributions yet.
            </td>
        </tr>
    `;

    return;
}

contributionRows.innerHTML = recent.map(contribution => {

    const memberName =
        contribution.members?.name ||
        "Unknown";

    const date =
        contribution.contribution_date ||
        contribution.created_at ||
        contribution.month ||
        "—";

    const type =
        contribution.contribution_type ||
        "—";

    const method =
        contribution.payment_method ||
        "—";

    const reference =
        contribution.reference ||
        "—";

    return `
        <tr>
            <td>
                ${escapeHtml(date)}
            </td>

            <td>
                ${escapeHtml(memberName)}
            </td>

            <td>
                ${money(contribution.amount)}
            </td>

            <td>
                ${escapeHtml(type)}
            </td>

            <td>
                ${escapeHtml(method)}
            </td>

            <td>
                ${escapeHtml(reference)}
            </td>
        </tr>
    `;

}).join("");
```

}

/* =====================================================
LOAD EXPENSES
===================================================== */

async function loadExpenses(groupId) {

```
/*
   Expenses table uses:

   date
   description
   category
   amount
   approval_status
*/

const result = await supabase
    .from("expenses")
    .select(`
        id,
        group_id,
        description,
        category,
        amount,
        date,
        approval_status
    `)
    .eq("group_id", groupId)
    .order("date", {
        ascending: false
    });

if (result.error) {
    throw result.error;
}

const expenses = result.data || [];

const approvedTotal = expenses
    .filter(expense => {
        return String(expense.approval_status || "").toLowerCase() === "approved";
    })
    .reduce((sum, expense) => {
        return sum + Number(expense.amount || 0);
    }, 0);

const pendingTotal = expenses
    .filter(expense => {
        return String(expense.approval_status || "").toLowerCase() === "pending";
    })
    .reduce((sum, expense) => {
        return sum + Number(expense.amount || 0);
    }, 0);

if (approvedExpensesEl) {
    approvedExpensesEl.textContent = money(approvedTotal);
}

if (pendingExpensesEl) {
    pendingExpensesEl.textContent = money(pendingTotal);
}

if (expenses2El) {
    expenses2El.textContent = money(approvedTotal);
}

renderExpenses(expenses);

return approvedTotal;
```

}

/* =====================================================
RENDER EXPENSES
===================================================== */

function renderExpenses(expenses) {

```
if (!expenseRows) {
    return;
}

const recent = expenses.slice(0, 10);

if (recent.length === 0) {

    expenseRows.innerHTML = `
        <tr>
            <td colspan="5">
                No expenses yet.
            </td>
        </tr>
    `;

    return;
}

expenseRows.innerHTML = recent.map(expense => {

    return `
        <tr>

            <td>
                ${escapeHtml(expense.date || "—")}
            </td>

            <td>
                ${escapeHtml(expense.description || "—")}
            </td>

            <td>
                ${escapeHtml(expense.category || "—")}
            </td>

            <td>
                ${money(expense.amount)}
            </td>

            <td>
                ${escapeHtml(expense.approval_status || "—")}
            </td>

        </tr>
    `;

}).join("");
```

}

/* =====================================================
LOAD MEETINGS
===================================================== */

async function loadMeetings(groupId) {

```
const result = await supabase
    .from("meetings")
    .select(`
        id,
        title,
        date,
        venue,
        status
    `)
    .eq("group_id", groupId);

if (result.error) {
    throw result.error;
}

const meetings = result.data || [];

const upcoming = meetings.filter(meeting => {
    return String(meeting.status || "").toLowerCase() === "upcoming";
}).length;

const completed = meetings.filter(meeting => {
    return String(meeting.status || "").toLowerCase() === "completed";
}).length;

const cancelled = meetings.filter(meeting => {
    return String(meeting.status || "").toLowerCase() === "cancelled";
}).length;

if (upcomingMeetingsEl) {
    upcomingMeetingsEl.textContent = upcoming;
}

if (completedMeetingsEl) {
    completedMeetingsEl.textContent = completed;
}

if (cancelledMeetingsEl) {
    cancelledMeetingsEl.textContent = cancelled;
}

return meetings;
```

}

/* =====================================================
LOAD REPORT
===================================================== */

async function loadReports() {

```
clearError();

if (statusBox) {
    statusBox.textContent = "Finding your group...";
}

const groupId = await getCurrentGroupId();

if (!groupId) {
    throw new Error("No group is linked to this account.");
}

if (statusBox) {
    statusBox.textContent = "Loading live report...";
}

/*
   Load everything.

   Notice that contributions are queried using
   contribution_date.

   There is NO .order("date") anywhere
   in the contribution query.
*/

const membersPromise = loadMembers(groupId);
const contributionsPromise = loadContributions(groupId);
const expensesPromise = loadExpenses(groupId);
const meetingsPromise = loadMeetings(groupId);

const [
    members,
    contributionTotal,
    approvedExpenseTotal,
    meetings
] = await Promise.all([
    membersPromise,
    contributionsPromise,
    expensesPromise,
    meetingsPromise
]);

/*
   Opening balance is currently KSh 0.
*/

const openingBalance = 0;

const closingBalance =
    openingBalance +
    contributionTotal -
    approvedExpenseTotal;

if (openingEl) {
    openingEl.textContent = money(openingBalance);
}

if (balanceEl) {
    balanceEl.textContent = money(closingBalance);
}

if (currentBalanceEl) {
    currentBalanceEl.textContent = money(closingBalance);
}

if (statusBox) {
    statusBox.textContent = "Report updated successfully.";
}
```

}

/* =====================================================
LOGOUT
===================================================== */

if (logoutButton) {

```
logoutButton.addEventListener("click", async () => {

    try {

        await supabase.auth.signOut();

        window.location.href = "login.html";

    } catch (error) {

        showError(error);

    }

});
```

}

/* =====================================================
START
===================================================== */

async function start() {

```
try {

    const sessionResult =
        await supabase.auth.getSession();

    if (sessionResult.error) {
        throw sessionResult.error;
    }

    const session =
        sessionResult.data?.session;

    if (!session) {

        window.location.href = "login.html";

        return;
    }

    await loadReports();

} catch (error) {

    showError(error);

}
```

}

start();
