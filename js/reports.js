
```javascript
import { supabase } from "./supabase.js";
import { getCurrentGroupId } from "./app.js";


/* =====================================================
   ELEMENTS
===================================================== */

const membersEl =
  document.getElementById("members");

const totalMembersEl =
  document.getElementById("totalMembers");

const contributionsEl =
  document.getElementById("contributions");

const expensesEl =
  document.getElementById("expenses");

const pendingExpensesEl =
  document.getElementById("pendingExpenses");

const balanceEl =
  document.getElementById("balance");

const openingEl =
  document.getElementById("opening");

const c2El =
  document.getElementById("c2");

const e2El =
  document.getElementById("e2");

const errorEl =
  document.querySelector("[data-error]") ||
  document.getElementById("error");

const logoutButton =
  document.getElementById("logout");


/* =====================================================
   MONEY
===================================================== */

function money(amount) {

  return (
    "KSh " +
    Number(amount || 0).toLocaleString(
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
    "CHAMA LIVE reports:",
    error
  );

  const message =
    error?.message ||
    String(error);

  if (errorEl) {

    errorEl.textContent =
      "Error: " + message;

    errorEl.hidden =
      false;

  }

}


/* =====================================================
   CLEAR ERROR
===================================================== */

function clearError() {

  if (!errorEl) {
    return;
  }

  errorEl.textContent =
    "";

  errorEl.hidden =
    true;

}


/* =====================================================
   LOAD REPORTS
===================================================== */

async function loadReports() {

  clearError();


  /* ===================================================
     GROUP
  =================================================== */

  const groupId =
    await getCurrentGroupId();


  if (!groupId) {

    throw new Error(
      "No group is linked to this account."
    );

  }


  /* ===================================================
     MEMBERS
  =================================================== */

  const membersResult =
    await supabase
      .from("members")
      .select(
        "id,name,status"
      )
      .eq(
        "group_id",
        groupId
      );


  if (membersResult.error) {
    throw membersResult.error;
  }


  const members =
    membersResult.data || [];


  /* ===================================================
     CONTRIBUTIONS

     IMPORTANT:

     Your contributions table has:

     group_id
     member_id
     amount
     contribution_type
     month
     payment_method

     THERE IS NO contributions.date
  =================================================== */

  const contributionsResult =
    await supabase
      .from("contributions")
      .select(`
        id,
        group_id,
        member_id,
        amount,
        contribution_type,
        month,
        payment_method,
        members (
          name
        )
      `)
      .eq(
        "group_id",
        groupId
      );


  if (contributionsResult.error) {
    throw contributionsResult.error;
  }


  const contributions =
    contributionsResult.data || [];


  /* ===================================================
     EXPENSES

     Known columns:

     id
     group_id
     description
     category
     amount
     date
     approval_status
  =================================================== */

  const expensesResult =
    await supabase
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


  if (expensesResult.error) {
    throw expensesResult.error;
  }


  const expenses =
    expensesResult.data || [];


  /* ===================================================
     MEETINGS
  =================================================== */

  const meetingsResult =
    await supabase
      .from("meetings")
      .select(`
        id,
        title,
        date,
        venue,
        status
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


  if (meetingsResult.error) {
    throw meetingsResult.error;
  }


  const meetings =
    meetingsResult.data || [];


  /* ===================================================
     OPENING BALANCE
  =================================================== */

  const openingBalance = 0;


  /* ===================================================
     MEMBER TOTALS
  =================================================== */

  const totalMembers =
    members.length;


  const activeMembers =
    members.filter(
      member =>
        String(
          member.status || ""
        ).toLowerCase() ===
        "active"
    ).length;


  /* ===================================================
     CONTRIBUTION TOTAL
  =================================================== */

  const contributionTotal =
    contributions.reduce(
      function(total, contribution) {

        return (
          total +
          Number(
            contribution.amount || 0
          )
        );

      },
      0
    );


  /* ===================================================
     APPROVED EXPENSES
  =================================================== */

  const approvedExpenses =
    expenses.filter(
      expense =>
        String(
          expense.approval_status || ""
        ).toLowerCase() ===
        "approved"
    );


  const approvedExpenseTotal =
    approvedExpenses.reduce(
      function(total, expense) {

        return (
          total +
          Number(
            expense.amount || 0
          )
        );

      },
      0
    );


  /* ===================================================
     PENDING EXPENSES
  =================================================== */

  const pendingExpenses =
    expenses.filter(
      expense =>
        String(
          expense.approval_status || ""
        ).toLowerCase() ===
        "pending"
    );


  const pendingExpenseTotal =
    pendingExpenses.reduce(
      function(total, expense) {

        return (
          total +
          Number(
            expense.amount || 0
          )
        );

      },
      0
    );


  /* ===================================================
     CURRENT BALANCE
  =================================================== */

  const currentBalance =
    openingBalance +
    contributionTotal -
    approvedExpenseTotal;


  /* ===================================================
     UPDATE MEMBERS
  =================================================== */

  if (membersEl) {

    membersEl.textContent =
      activeMembers;

  }


  if (totalMembersEl) {

    totalMembersEl.textContent =
      totalMembers;

  }


  /* ===================================================
     UPDATE CONTRIBUTIONS
  =================================================== */

  if (contributionsEl) {

    contributionsEl.textContent =
      money(
        contributionTotal
      );

  }


  /* ===================================================
     UPDATE EXPENSES
  =================================================== */

  if (expensesEl) {

    expensesEl.textContent =
      money(
        approvedExpenseTotal
      );

  }


  if (pendingExpensesEl) {

    pendingExpensesEl.textContent =
      money(
        pendingExpenseTotal
      );

  }


  /* ===================================================
     FINANCIAL POSITION
  =================================================== */

  if (openingEl) {

    openingEl.textContent =
      money(
        openingBalance
      );

  }


  if (c2El) {

    c2El.textContent =
      money(
        contributionTotal
      );

  }


  if (e2El) {

    e2El.textContent =
      money(
        approvedExpenseTotal
      );

  }


  if (balanceEl) {

    balanceEl.textContent =
      money(
        currentBalance
      );

  }


  /* ===================================================
     RECENT CONTRIBUTIONS
  =================================================== */

  renderRecentContributions(
    contributions
  );


  /* ===================================================
     RECENT EXPENSES
  =================================================== */

  renderRecentExpenses(
    expenses
  );


  /* ===================================================
     MEETING SUMMARY
  =================================================== */

  renderMeetingsSummary(
    meetings
  );

}


/* =====================================================
   RECENT CONTRIBUTIONS
===================================================== */

function renderRecentContributions(
  contributions
) {

  const table =
    document.querySelector(
      "#recentContributions tbody"
    );


  if (!table) {
    return;
  }


  const recent =
    contributions.slice(
      0,
      10
    );


  if (recent.length === 0) {

    table.innerHTML = `
      <tr>
        <td colspan="5">
          No contributions yet.
        </td>
      </tr>
    `;

    return;

  }


  table.innerHTML =
    recent
      .map(
        function(contribution) {

          const memberName =
            contribution.members?.name ||
            "Unknown";


          /*
           * Your table has no date column.
           *
           * We display the contribution
           * month instead.
           */

          const displayDate =
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

            </tr>
          `;

        }
      )
      .join("");

}


/* =====================================================
   RECENT EXPENSES
===================================================== */

function renderRecentExpenses(
  expenses
) {

  const table =
    document.querySelector(
      "#recentExpenses tbody"
    );


  if (!table) {
    return;
  }


  const recent =
    expenses.slice(
      0,
      10
    );


  if (recent.length === 0) {

    table.innerHTML = `
      <tr>
        <td colspan="5">
          No expenses yet.
        </td>
      </tr>
    `;

    return;

  }


  table.innerHTML =
    recent
      .map(
        function(expense) {

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

}


/* =====================================================
   MEETINGS SUMMARY
===================================================== */

function renderMeetingsSummary(
  meetings
) {

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


  const upcomingEl =
    document.getElementById(
      "upcoming"
    );

  const completedEl =
    document.getElementById(
      "completed"
    );

  const cancelledEl =
    document.getElementById(
      "cancelled"
    );


  if (upcomingEl) {

    upcomingEl.textContent =
      upcoming;

  }


  if (completedEl) {

    completedEl.textContent =
      completed;

  }


  if (cancelledEl) {

    cancelledEl.textContent =
      cancelled;

  }

}


/* =====================================================
   LOGOUT
===================================================== */

if (logoutButton) {

  logoutButton.addEventListener(
    "click",
    async function() {

      try {

        await supabase.auth.signOut();

        window.location.href =
          "login.html";

      }

      catch(error) {

        showError(
          error
        );

      }

    }
  );

}


/* =====================================================
   START
===================================================== */

async function start() {

  try {

    await loadReports();

  }

  catch(error) {

    showError(
      error
    );

  }

}


start();
```
