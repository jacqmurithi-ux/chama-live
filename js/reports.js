import { supabase } from "./supabase.js";
import { getCurrentGroupId } from "./app.js";

/* =====================================================
ELEMENTS
===================================================== */

const statusBox =
document.getElementById("status");

const errorBox =
document.getElementById("error");

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
Number(value || 0).toLocaleString(
"en-KE",
{
minimumFractionDigits: 0,
maximumFractionDigits: 2
}
)
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
"CHAMA LIVE reports:",
error
);

const message =
error?.message ||
String(error);

if (errorBox) {

```
errorBox.textContent =
  "Error: " + message;

errorBox.hidden =
  false;
```

}

if (statusBox) {

```
statusBox.textContent =
  "Something went wrong.";
```

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
.select(
"id,name,status"
)
.eq(
"group_id",
groupId
);

if (result.error) {

```
throw result.error;
```

}

const members =
result.data || [];

const active =
members.filter(
member =>
String(
member.status || ""
).toLowerCase() ===
"active"
).length;

if (activeMembersEl) {

```
activeMembersEl.textContent =
  active;
```

}

if (totalMembersEl) {

```
totalMembersEl.textContent =
  members.length;
```

}

/* Create a member lookup */

const memberMap = new Map();

members.forEach(
member => {

```
  memberMap.set(
    member.id,
    member.name
  );

}
```

);

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

* IMPORTANT:
*
* There is NO:
*
* contributions.date
*
* We use:
*
* contributions.contribution_date
  */

const result =
await supabase
.from("contributions")
.select(`         id,
        member_id,
        amount,
        contribution_type,
        month,
        payment_method,
        reference,
        contribution_date
      `)
.eq(
"group_id",
groupId
)
.order(
"contribution_date",
{
ascending: false
}
);

if (result.error) {

```
throw result.error;
```

}

const rows =
result.data || [];

/* ===================================================
TOTAL
=================================================== */

const total =
rows.reduce(
(sum, row) =>
sum +
Number(
row.amount || 0
),
0
);

if (contributionsEl) {

```
contributionsEl.textContent =
  money(total);
```

}

if (contributions2El) {

```
contributions2El.textContent =
  money(total);
```

}

/* ===================================================
TABLE
=================================================== */

if (!contributionRows) {

```
return total;
```

}

if (rows.length === 0) {

```
contributionRows.innerHTML = `
  <tr>
    <td colspan="6">
      No contributions yet.
    </td>
  </tr>
`;

return total;
```

}

contributionRows.innerHTML =
rows
.slice(0, 10)
.map(
row => {

```
      const memberName =
        memberMap.get(
          row.member_id
        ) ||
        "Unknown";


      const displayDate =
        row.contribution_date ||
        row.month ||
        "—";


      return `
        <tr>

          <td>
            ${escapeHtml(
              displayDate
            )}
          </td>

          <td>
            ${escapeHtml(
              memberName
            )}
          </td>

          <td>
            ${money(
              row.amount
            )}
          </td>

          <td>
            ${escapeHtml(
              row.contribution_type ||
              "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              row.payment_method ||
              "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              row.reference ||
              "—"
            )}
          </td>

        </tr>
      `;

    }
  )
  .join("");
```

return total;

}

/* =====================================================
LOAD EXPENSES
===================================================== */

async function loadExpenses(groupId) {

/*

* expenses.date is valid.
  */

const result =
await supabase
.from("expenses")
.select(`         id,
        date,
        description,
        category,
        amount,
        approval_status
      `)
.eq(
"group_id",
groupId
)
.order(
"date",
{
ascending: false
}
);

if (result.error) {

```
throw result.error;
```

}

const rows =
result.data || [];

/* ===================================================
APPROVED
=================================================== */

const approved =
rows
.filter(
row =>
String(
row.approval_status || ""
).toLowerCase() ===
"approved"
)
.reduce(
(sum, row) =>
sum +
Number(
row.amount || 0
),
0
);

/* ===================================================
PENDING
=================================================== */

const pending =
rows
.filter(
row =>
String(
row.approval_status || ""
).toLowerCase() ===
"pending"
)
.reduce(
(sum, row) =>
sum +
Number(
row.amount || 0
),
0
);

if (approvedExpensesEl) {

```
approvedExpensesEl.textContent =
  money(approved);
```

}

if (pendingExpensesEl) {

```
pendingExpensesEl.textContent =
  money(pending);
```

}

if (expenses2El) {

```
expenses2El.textContent =
  money(approved);
```

}

/* ===================================================
TABLE
=================================================== */

if (!expenseRows) {

```
return approved;
```

}

if (rows.length === 0) {

```
expenseRows.innerHTML = `
  <tr>
    <td colspan="5">
      No expenses yet.
    </td>
  </tr>
`;

return approved;
```

}

expenseRows.innerHTML =
rows
.slice(0, 10)
.map(
row => {

```
      return `
        <tr>

          <td>
            ${escapeHtml(
              row.date ||
              "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              row.description ||
              "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              row.category ||
              "—"
            )}
          </td>

          <td>
            ${money(
              row.amount
            )}
          </td>

          <td>
            ${escapeHtml(
              row.approval_status ||
              "—"
            )}
          </td>

        </tr>
      `;

    }
  )
  .join("");
```

return approved;

}

/* =====================================================
LOAD MEETINGS
===================================================== */

async function loadMeetings(groupId) {

const result =
await supabase
.from("meetings")
.select(`         id,
        date,
        status
      `)
.eq(
"group_id",
groupId
);

if (result.error) {

```
throw result.error;
```

}

const meetings =
result.data || [];

const upcoming =
meetings.filter(
meeting =>
String(
meeting.status || ""
).toLowerCase() ===
"upcoming"
).length;

const completed =
meetings.filter(
meeting =>
String(
meeting.status || ""
).toLowerCase() ===
"completed"
).length;

const cancelled =
meetings.filter(
meeting =>
String(
meeting.status || ""
).toLowerCase() ===
"cancelled"
).length;

if (upcomingMeetingsEl) {

```
upcomingMeetingsEl.textContent =
  upcoming;
```

}

if (completedMeetingsEl) {

```
completedMeetingsEl.textContent =
  completed;
```

}

if (cancelledMeetingsEl) {

```
cancelledMeetingsEl.textContent =
  cancelled;
```

}

}

/* =====================================================
LOAD REPORT
===================================================== */

async function loadReports() {

clearError();

if (statusBox) {

```
statusBox.textContent =
  "Finding your group...";
```

}

const groupId =
await getCurrentGroupId();

if (!groupId) {

```
throw new Error(
  "No group is linked to this account."
);
```

}

if (statusBox) {

```
statusBox.textContent =
  "Loading live report...";
```

}

/* ===================================================
MEMBERS FIRST
=================================================== */

const memberMap =
await loadMembers(
groupId
);

/* ===================================================
LOAD FINANCIAL DATA
=================================================== */

const contributionTotal =
await loadContributions(
groupId,
memberMap
);

const approvedExpenseTotal =
await loadExpenses(
groupId
);

/* ===================================================
MEETINGS
=================================================== */

await loadMeetings(
groupId
);

/* ===================================================
BALANCE
=================================================== */

const openingBalance = 0;

const closingBalance =
openingBalance +
contributionTotal -
approvedExpenseTotal;

if (openingEl) {

```
openingEl.textContent =
  money(
    openingBalance
  );
```

}

if (balanceEl) {

```
balanceEl.textContent =
  money(
    closingBalance
  );
```

}

if (currentBalanceEl) {

```
currentBalanceEl.textContent =
  money(
    closingBalance
  );
```

}

if (statusBox) {

```
statusBox.textContent =
  "Report updated successfully.";
```

}

}

/* =====================================================
LOGOUT
===================================================== */

if (logoutButton) {

logoutButton.addEventListener(
"click",
async () => {

```
  try {

    await supabase.auth.signOut();

    window.location.href =
      "login.html";

  }

  catch (error) {

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
const {
  data: {
    session
  }
} =
  await supabase.auth.getSession();


if (!session) {

  window.location.href =
    "login.html";

  return;

}


await loadReports();
```

}

catch (error) {

```
showError(error);
```

}

}

start();
