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
   LOAD REPORT
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
     LOAD ALL DATA
  =================================================== */

  const [

    groupResult,

    membersResult,

    contributionsResult,

    expensesResult,

    meetingsResult

  ] = await Promise.all([


    /* GROUP */

    supabase

      .from("groups")

      .select(
        "id,name,opening_balance"
      )

      .eq(
        "id",
        groupId
      )

      .maybeSingle(),


    /* MEMBERS */

    supabase

      .from("members")

      .select(
        "id,name,status"
      )

      .eq(
        "group_id",
        groupId
      ),


    /* CONTRIBUTIONS */

    supabase

      .from("contributions")

      .select(`
        id,
        amount,
        contribution_type,
        month,
        payment_method,
        reference,
        contribution_date,
        created_at,
        member_id,
        members (
          name
        )
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
      ),


    /* EXPENSES */

    supabase

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
      ),


    /* MEETINGS */

    supabase

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
      )

  ]);


  /* ===================================================
     CHECK ERRORS
  =================================================== */

  if (groupResult.error) {
    throw groupResult.error;
  }

  if (membersResult.error) {
    throw membersResult.error;
  }

  if (contributionsResult.error) {
    throw contributionsResult.error;
  }

  if (expensesResult.error) {
    throw expensesResult.error;
  }

  if (meetingsResult.error) {
    throw meetingsResult.error;
  }


  /* ===================================================
     DATA
  =================================================== */

  const group =
    groupResult.data;

  const members =
    membersResult.data || [];

  const contributions =
    contributionsResult.data || [];

  const expenses =
    expensesResult.data || [];

  const meetings =
    meetingsResult.data || [];


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
        ).toLowerCase() === "active"
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
     EXPENSE TOTALS
  =================================================== */

  const approvedExpenses =
    expenses.filter(
      expense =>
        String(
          expense.approval_status || ""
        ).toLowerCase() === "approved"
    );


  const pendingExpenses =
    expenses.filter(
      expense =>
        String(
          expense.approval_status || ""
        ).toLowerCase() === "pending"
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
     OPENING BALANCE
  =================================================== */

  const openingBalance =
    Number(
      group?.opening_balance || 0
    );


  /* ===================================================
     CURRENT BALANCE
  =================================================== */

  const currentBalance =
    openingBalance +
    contributionTotal -
    approvedExpenseTotal;


  /* ===================================================
     TOP METRICS
  =================================================== */

  if (membersEl) {

    membersEl.textContent =
      activeMembers;

  }


  if (totalMembersEl) {

    totalMembersEl.textContent =
      totalMembers;

  }


  if (contributionsEl) {

    contributionsEl.textContent =
      money(
        contributionTotal
      );

  }


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
     MEETINGS
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
        contribution => {

          const memberName =
            contribution.members?.name ||
            "Unknown";


          return `

            <tr>

              <td>
                ${escapeHtml(
                  contribution.contribution_date ||
                  "—"
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
        meeting.status === "upcoming"
    ).length;


  const completed =
    meetings.filter(
      meeting =>
        meeting.status === "completed"
    ).length;


  const cancelled =
    meetings.filter(
      meeting =>
        meeting.status === "cancelled"
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

const logout =
  document.getElementById(
    "logout"
  );


if (logout) {

  logout.addEventListener(
    "click",
    async function() {

      await supabase.auth.signOut();

      window.location.href =
        "login.html";

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
