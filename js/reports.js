```javascript
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
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

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

  errorBox.textContent =
    "Error: " + message;

  errorBox.hidden = false;

  statusBox.textContent =
    "Something went wrong.";

}


/* =====================================================
   CLEAR ERROR
===================================================== */

function clearError() {

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

    throw result.error;

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


  activeMembersEl.textContent =
    active;


  totalMembersEl.textContent =
    members.length;


  /*
   * Create a lookup table so we don't
   * depend on a Supabase relationship.
   */

  const memberMap = {};


  members.forEach(
    member => {

      memberMap[member.id] =
        member.name || "Unknown";

    }
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
   * IMPORTANT
   *
   * We use:
   *
   * contribution_date
   *
   * NOT:
   *
   * date
   */

  const result =
    await supabase
      .from("contributions")
      .select(`
        id,
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

    throw result.error;

  }


  const contributions =
    result.data || [];


  const total =
    contributions.reduce(
      (sum, contribution) =>
        sum +
        Number(
          contribution.amount || 0
        ),
      0
    );


  contributionsEl.textContent =
    money(total);


  contributions2El.textContent =
    money(total);


  /* ===================================================
     TABLE
  =================================================== */

  if (
    contributions.length === 0
  ) {

    contributionRows.innerHTML = `
      <tr>
        <td colspan="6">
          No contributions yet.
        </td>
      </tr>
    `;

    return total;

  }


  contributionRows.innerHTML =
    contributions
      .slice(0, 10)
      .map(
        contribution => {

          const memberName =
            memberMap[
              contribution.member_id
            ] ||
            "Unknown";


          const displayDate =
            contribution.contribution_date ||
            contribution.month ||
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
                  contribution.amount
                )}
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

        }
      )
      .join("");


  return total;

}


/* =====================================================
   LOAD EXPENSES
===================================================== */

async function loadExpenses(groupId) {

  const result =
    await supabase
      .from("expenses")
      .select(`
        id,
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

    throw result.error;

  }


  const expenses =
    result.data || [];


  const approved =
    expenses
      .filter(
        expense =>
          String(
            expense.approval_status || ""
          ).toLowerCase() ===
          "approved"
      );


  const pending =
    expenses
      .filter(
        expense =>
          String(
            expense.approval_status || ""
          ).toLowerCase() ===
          "pending"
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


  const pendingTotal =
    pending.reduce(
      (sum, expense) =>
        sum +
        Number(
          expense.amount || 0
        ),
      0
    );


  approvedExpensesEl.textContent =
    money(approvedTotal);


  pendingExpensesEl.textContent =
    money(pendingTotal);


  expenses2El.textContent =
    money(approvedTotal);


  /* ===================================================
     TABLE
  =================================================== */

  if (
    expenses.length === 0
  ) {

    expenseRows.innerHTML = `
      <tr>
        <td colspan="5">
          No expenses yet.
        </td>
      </tr>
    `;

    return approvedTotal;

  }


  expenseRows.innerHTML =
    expenses
      .slice(0, 10)
      .map(
        expense => {

          return `
            <tr>

              <td>
                ${escapeHtml(
                  expense.date ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  expense.description ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  expense.category ||
                  "—"
                )}
              </td>

              <td>
                ${money(
                  expense.amount
                )}
              </td>

              <td>
                ${escapeHtml(
                  expense.approval_status ||
                  "—"
                )}
              </td>

            </tr>
          `;

        }
      )
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
      .select(`
        id,
        date,
        status
      `)
      .eq(
        "group_id",
        groupId
      );


  if (result.error) {

    throw result.error;

  }


  const meetings =
    result.data || [];


  upcomingMeetingsEl.textContent =
    meetings.filter(
      meeting =>
        String(
          meeting.status || ""
        ).toLowerCase() ===
        "upcoming"
    ).length;


  completedMeetingsEl.textContent =
    meetings.filter(
      meeting =>
        String(
          meeting.status || ""
        ).toLowerCase() ===
        "completed"
    ).length;


  cancelledMeetingsEl.textContent =
    meetings.filter(
      meeting =>
        String(
          meeting.status || ""
        ).toLowerCase() ===
        "cancelled"
    ).length;

}


/* =====================================================
   LOAD REPORTS
===================================================== */

async function loadReports() {

  clearError();


  statusBox.textContent =
    "Finding your group...";


  const groupId =
    await getCurrentGroupId();


  if (!groupId) {

    throw new Error(
      "No group is linked to this account."
    );

  }


  statusBox.textContent =
    "Loading live report...";


  /*
   * Members first because we use their
   * IDs to display contribution names.
   */

  const memberMap =
    await loadMembers(
      groupId
    );


  const contributionTotal =
    await loadContributions(
      groupId,
      memberMap
    );


  const approvedExpenseTotal =
    await loadExpenses(
      groupId
    );


  await loadMeetings(
    groupId
  );


  /* ===================================================
     FINANCIAL POSITION
  =================================================== */

  const openingBalance = 0;


  const closingBalance =
    openingBalance +
    contributionTotal -
    approvedExpenseTotal;


  openingEl.textContent =
    money(
      openingBalance
    );


  balanceEl.textContent =
    money(
      closingBalance
    );


  currentBalanceEl.textContent =
    money(
      closingBalance
    );


  statusBox.textContent =
    "Report updated successfully.";

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

      }

      catch(error) {

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

    await supabase.auth.getSession();

    await loadReports();

  }

  catch(error) {

    showError(error);

  }

}


start();
```

