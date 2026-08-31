/* =========================================================
   CHAMA LIVE — DASHBOARD
   FINAL STABLE VERSION
   ---------------------------------------------------------
   PURPOSE
   ---------------------------------------------------------
   Dashboard is READ-ONLY.

   Accounting source of truth:
       canonical monthly status RPC

   Flow:
       obligation
           ↓
       payment
           ↓
       allocation
           ↓
       monthly status

   The dashboard MUST NOT independently calculate
   accounting balances from raw contribution rows.
========================================================= */

import { supabase } from "./supabase.js";

import {
  getLayoutState
} from "./layout.js";


console.log(
  "CHAMA LIVE: dashboard.js loaded"
);


/* =========================================================
   STATE
========================================================= */

let currentMember = null;
let currentGroup = null;

let dashboardInitialized = false;


/* =========================================================
   HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
}


function money(value) {

  const amount =
    Number(value || 0);

  return (
    "KSh " +
    amount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }
    )
  );

}


function numberValue(value) {

  const amount =
    Number(value || 0);

  return amount.toLocaleString(
    "en-KE",
    {
      maximumFractionDigits: 2
    }
  );

}


function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =========================================================
   DATE HELPERS
========================================================= */

function getCurrentMonthStart() {

  const now =
    new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

}


function getCurrentMonthEnd() {

  const now =
    new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  );

}


function formatDate(value) {

  if (!value) {
    return "—";
  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return String(value);

  }


  return date.toLocaleDateString(
    "en-KE",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );

}


/* =========================================================
   STATUS HELPERS
========================================================= */

function normalizeStatus(status) {

  return String(
    status || ""
  )
    .trim()
    .toLowerCase();

}


function statusLabel(status) {

  const normalized =
    normalizeStatus(status);


  switch (normalized) {

    case "cleared":
      return "Cleared";

    case "paid":
      return "Paid";

    case "credit":
      return "Credit";

    case "partial":
      return "Partial";

    case "outstanding":
      return "Outstanding";

    case "pending":
      return "Pending";

    default:
      return status
        ? String(status)
        : "—";

  }

}


function statusClass(status) {

  const normalized =
    normalizeStatus(status);


  switch (normalized) {

    case "cleared":
      return "status-cleared";

    case "paid":
      return "status-paid";

    case "credit":
      return "status-credit";

    case "partial":
      return "status-partial";

    case "outstanding":
      return "status-outstanding";

    case "pending":
      return "status-pending";

    default:
      return "status-neutral";

  }

}


/* =========================================================
   CURRENT MONTH
========================================================= */

function getCurrentMonthKey() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");


  return `${year}-${month}`;

}


/* =========================================================
   ERROR DISPLAY
========================================================= */

function showError(message) {

  console.error(
    "CHAMA LIVE DASHBOARD:",
    message
  );


  const errorBox =
    byId("error");


  if (errorBox) {

    errorBox.hidden =
      false;

    errorBox.textContent =
      message ||
      "Unable to load dashboard.";

  }


  const status =
    byId("status");


  if (status) {

    status.textContent =
      "Dashboard could not be loaded.";

  }

}


/* =========================================================
   STATUS DISPLAY
========================================================= */

function setStatus(message) {

  const status =
    byId("status");


  if (status) {

    status.textContent =
      message;

  }

}


/* =========================================================
   GET LAYOUT CONTEXT
========================================================= */

function loadContext() {

  const state =
    getLayoutState();


  currentMember =
    state?.member ||
    null;


  currentGroup =
    state?.group ||
    null;


  if (!currentMember) {

    throw new Error(
      "Current member could not be loaded."
    );

  }


  if (!currentGroup) {

    throw new Error(
      "Current group could not be loaded."
    );

  }


  if (!currentGroup.id) {

    throw new Error(
      "Current group has no valid ID."
    );

  }


  console.log(
    "CHAMA LIVE DASHBOARD: context loaded",
    {
      member: currentMember,
      group: currentGroup
    }
  );

}


/* =========================================================
   UPDATE GROUP NAME
========================================================= */

function updateGroupDisplay() {

  const groupName =
    currentGroup?.name ||
    currentGroup?.group_name ||
    "CHAMA";


  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(function (element) {

      element.textContent =
        groupName;

    });

}


/* =========================================================
   ACTIVE MEMBERS
========================================================= */

async function loadMemberCount() {

  const groupId =
    currentGroup.id;


  /*
   * Do not expose or manipulate unrelated groups.
   */

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(
        "id,status"
      )
      .eq(
        "group_id",
        groupId
      );


  if (error) {

    throw error;

  }


  const members =
    Array.isArray(data)
      ? data
      : [];


  const total =
    members.length;


  const active =
    members.filter(
      function (member) {

        const status =
          String(
            member.status ||
            ""
          ).toLowerCase();


        return (
          status === "active" ||
          status === ""
        );

      }
    ).length;


  const activeElement =
    byId("activeMembers");


  if (activeElement) {

    activeElement.textContent =
      numberValue(active);

  }


  const totalElement =
    byId("membersCount");


  if (totalElement) {

    totalElement.textContent =
      numberValue(total);

  }


  return {
    total,
    active
  };

}


/* =========================================================
   CANONICAL MONTHLY STATUS RPC
========================================================= */

async function loadCanonicalMonthlyStatus() {

  const groupId =
    currentGroup.id;


  const month =
    getCurrentMonthKey();


  console.log(
    "CHAMA LIVE DASHBOARD: loading canonical monthly status",
    {
      groupId,
      month
    }
  );


  /*
   * IMPORTANT
   * -------------------------------------------------------
   * This RPC is the accounting source of truth.
   *
   * Do NOT replace this with raw contribution sums.
   */

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_canonical_member_monthly_status",
      {
        p_group_id:
          groupId,

        p_month:
          month
      }
    );


  if (error) {

    throw error;

  }


  return Array.isArray(data)
    ? data
    : [];

}


/* =========================================================
   NORMALIZE CANONICAL ROW
========================================================= */

function normalizeMonthlyRow(row) {

  return {

    memberId:
      row.member_id ||
      row.member_uuid ||
      row.id ||
      null,

    memberName:
      row.member_name ||
      row.name ||
      row.full_name ||
      "Member",

    monthlyDue:
      Number(
        row.monthly_due ??
        row.due_amount ??
        row.obligation_amount ??
        0
      ),

    previousOutstanding:
      Number(
        row.previous_outstanding ??
        row.opening_outstanding ??
        row.prior_outstanding ??
        0
      ),

    appliedThisMonth:
      Number(
        row.applied_this_month ??
        row.monthly_applied ??
        row.applied_amount ??
        0
      ),

    carryForward:
      Number(
        row.carry_forward ??
        row.credit ??
        row.carry_forward_credit ??
        0
      ),

    currentOutstanding:
      Number(
        row.current_outstanding ??
        row.outstanding ??
        0
      ),

    status:
      row.status ||
      row.payment_status ||
      "Outstanding"

  };

}


/* =========================================================
   RENDER MEMBER STATUS TABLE
========================================================= */

function renderMemberStatus(rows) {

  const tableBody =
    document.querySelector(
      "#memberStatusTableBody"
    );


  /*
   * Support alternate existing IDs.
   */

  const body =
    tableBody ||
    document.querySelector(
      "#memberStatus tbody"
    ) ||
    document.querySelector(
      ".member-status-table tbody"
    );


  if (!body) {

    console.warn(
      "CHAMA LIVE DASHBOARD: member status table body not found"
    );

    return;

  }


  if (!rows.length) {

    body.innerHTML = `
      <tr>
        <td colspan="7">
          No member contribution status available.
        </td>
      </tr>
    `;

    return;

  }


  body.innerHTML =
    rows
      .map(function (rawRow) {

        const row =
          normalizeMonthlyRow(
            rawRow
          );


        const status =
          statusLabel(
            row.status
          );


        const statusCss =
          statusClass(
            row.status
          );


        return `
          <tr>

            <td>
              ${escapeHtml(
                row.memberName
              )}
            </td>

            <td>
              ${money(
                row.monthlyDue
              )}
            </td>

            <td>
              ${money(
                row.previousOutstanding
              )}
            </td>

            <td class="applied-value">
              ${money(
                row.appliedThisMonth
              )}
            </td>

            <td class="credit-value">
              ${money(
                row.carryForward
              )}
            </td>

            <td class="outstanding-value">
              ${money(
                row.currentOutstanding
              )}
            </td>

            <td>
              <span
                class="status-badge ${statusCss}"
              >
                ${escapeHtml(
                  status
                )}
              </span>
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   MONTHLY SUMMARY
========================================================= */

function calculateDashboardSummary(rows) {

  let monthlyExpected =
    0;

  let monthlyApplied =
    0;

  let carryForward =
    0;

  let currentOutstanding =
    0;

  let previousOutstanding =
    0;

  let membersContributed =
    0;


  rows.forEach(function (rawRow) {

    const row =
      normalizeMonthlyRow(
        rawRow
      );


    monthlyExpected +=
      row.monthlyDue;


    monthlyApplied +=
      row.appliedThisMonth;


    carryForward +=
      row.carryForward;


    currentOutstanding +=
      row.currentOutstanding;


    previousOutstanding +=
      row.previousOutstanding;


    if (
      row.appliedThisMonth > 0
    ) {

      membersContributed++;

    }

  });


  return {

    monthlyExpected,
    monthlyApplied,
    carryForward,
    currentOutstanding,
    previousOutstanding,
    membersContributed

  };

}


/* =========================================================
   RENDER SUMMARY
========================================================= */

function renderSummary(
  summary,
  memberCounts
) {

  const {

    monthlyExpected,
    monthlyApplied,
    carryForward,
    currentOutstanding,
    membersContributed

  } = summary;


  const monthlyExpectedElement =
    byId(
      "monthlyExpected"
    );


  if (monthlyExpectedElement) {

    monthlyExpectedElement.textContent =
      money(
        monthlyExpected
      );

  }


  const monthlyCollectedElement =
    byId(
      "monthlyCollected"
    );


  if (monthlyCollectedElement) {

    monthlyCollectedElement.textContent =
      money(
        monthlyApplied
      );

  }


  /*
   * Current balance:
   *
   * This dashboard value represents the group's
   * current balance and therefore MUST come from
   * actual group financial records.
   *
   * We load it separately below.
   */


  const progress =
    monthlyExpected > 0
      ? (
          monthlyApplied /
          monthlyExpected
        ) * 100
      : 0;


  const safeProgress =
    Math.max(
      0,
      Math.min(
        100,
        progress
      )
    );


  const percentageElement =
    byId(
      "contributionPercentage"
    );


  if (percentageElement) {

    percentageElement.textContent =
      `${Math.round(
        safeProgress
      )}%`;

  }


  const progressBar =
    byId(
      "contributionProgressBar"
    );


  if (progressBar) {

    progressBar.style.width =
      `${safeProgress}%`;

    /*
     * FIX:
     * The previous syntax error was caused by
     * an incomplete function call in this area.
     *
     * Correctly closed:
     * setAttribute("aria-valuenow", String(...))
     */

    progressBar.setAttribute(
      "aria-valuenow",
      String(
        Math.round(
          safeProgress
        )
      )
    );

  }


  const progressAmount =
    byId(
      "contributionProgressAmount"
    );


  if (progressAmount) {

    progressAmount.textContent =
      `${money(
        monthlyApplied
      )} / ${money(
        monthlyExpected
      )}`;

  }


  const membersContributedElement =
    byId(
      "membersContributed"
    );


  if (membersContributedElement) {

    membersContributedElement.textContent =
      `${membersContributed} / ${
        memberCounts.total
      }`;

  }


  const participation =
    memberCounts.active > 0
      ? (
          membersContributed /
          memberCounts.active
        ) * 100
      : 0;


  const participationElement =
    byId(
      "memberParticipation"
    );


  if (participationElement) {

    participationElement.textContent =
      `${Math.round(
        participation
      )}%`;

  }


  const appliedElement =
    byId(
      "appliedThisMonth"
    );


  if (appliedElement) {

    appliedElement.textContent =
      money(
        monthlyApplied
      );

  }


  const carryElement =
    byId(
      "carryForwardCredit"
    );


  if (carryElement) {

    carryElement.textContent =
      money(
        carryForward
      );

  }


  const outstandingElement =
    byId(
      "currentOutstanding"
    );


  if (outstandingElement) {

    outstandingElement.textContent =
      money(
        currentOutstanding
      );

  }

}


/* =========================================================
   LOAD CURRENT GROUP BALANCE
========================================================= */

async function loadCurrentBalance() {

  const groupId =
    currentGroup.id;


  /*
   * Current balance is:
   *
   * approved/posted money received
   * minus approved/posted expenses.
   *
   * This is separate from monthly contribution
   * allocation and should not be confused with
   * monthly applied amounts.
   */


  let contributionTotal =
    0;

  let expenseTotal =
    0;


  /*
   * Contributions
   */

  const contributionResult =
    await supabase
      .from("contributions")
      .select(
        "amount"
      )
      .eq(
        "group_id",
        groupId
      );


  if (
    contributionResult.error
  ) {

    throw contributionResult.error;

  }


  (
    contributionResult.data ||
    []
  ).forEach(function (row) {

    contributionTotal +=
      Number(
        row.amount || 0
      );

  });


  /*
   * Expenses
   */

  const expenseResult =
    await supabase
      .from("expenses")
      .select(
        "amount,status"
      )
      .eq(
        "group_id",
        groupId
      );


  if (
    expenseResult.error
  ) {

    throw expenseResult.error;

  }


  (
    expenseResult.data ||
    []
  ).forEach(function (row) {

    const status =
      normalizeStatus(
        row.status
      );


    /*
     * Only approved expenses affect
     * the displayed group balance.
     */

    if (
      status === "approved" ||
      status === "paid" ||
      status === "posted" ||
      status === ""
    ) {

      expenseTotal +=
        Number(
          row.amount || 0
        );

    }

  });


  const balance =
    contributionTotal -
    expenseTotal;


  const balanceElement =
    byId(
      "currentBalance"
    );


  if (balanceElement) {

    balanceElement.textContent =
      money(
        balance
      );

  }


  return {

    contributionTotal,
    expenseTotal,
    balance

  };

}


/* =========================================================
   RECENT CONTRIBUTIONS
========================================================= */

async function loadRecentContributions() {

  const groupId =
    currentGroup.id;


  const {
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select(
        `
          id,
          amount,
          contribution_date,
          member_id,
          members (
            name,
            full_name
          )
        `
      )
      .eq(
        "group_id",
        groupId
      )
      .order(
        "contribution_date",
        {
          ascending: false
        }
      )
      .limit(5);


  if (error) {

    throw error;

  }


  const rows =
    Array.isArray(data)
      ? data
      : [];


  const body =
    document.querySelector(
      "#recentContributions tbody"
    ) ||
    document.querySelector(
      ".contributions-table tbody"
    );


  if (!body) {

    console.warn(
      "CHAMA LIVE DASHBOARD: recent contributions table body not found"
    );

    return;

  }


  if (!rows.length) {

    body.innerHTML = `
      <tr>
        <td colspan="3">
          No contributions recorded yet.
        </td>
      </tr>
    `;

    return;

  }


  body.innerHTML =
    rows
      .map(function (row) {

        const member =
          Array.isArray(
            row.members
          )
            ? row.members[0]
            : row.members;


        const name =
          member?.name ||
          member?.full_name ||
          "Member";


        return `
          <tr>

            <td>
              ${escapeHtml(
                name
              )}
            </td>

            <td>
              ${money(
                row.amount
              )}
            </td>

            <td>
              ${formatDate(
                row.contribution_date
              )}
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   RECENT EXPENSES
========================================================= */

async function loadRecentExpenses() {

  const groupId =
    currentGroup.id;


  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .select(
        "id,description,amount,status,expense_date"
      )
      .eq(
        "group_id",
        groupId
      )
      .order(
        "expense_date",
        {
          ascending: false
        }
      )
      .limit(5);


  if (error) {

    throw error;

  }


  const rows =
    Array.isArray(data)
      ? data
      : [];


  const body =
    document.querySelector(
      "#recentExpenses tbody"
    ) ||
    document.querySelector(
      ".expenses-table tbody"
    );


  if (!body) {

    console.warn(
      "CHAMA LIVE DASHBOARD: recent expenses table body not found"
    );

    return;

  }


  if (!rows.length) {

    body.innerHTML = `
      <tr>
        <td colspan="3">
          No expenses recorded yet.
        </td>
      </tr>
    `;

    return;

  }


  body.innerHTML =
    rows
      .map(function (row) {

        return `
          <tr>

            <td>
              ${escapeHtml(
                row.description ||
                "Expense"
              )}
            </td>

            <td>
              ${money(
                row.amount
              )}
            </td>

            <td>
              <span
                class="status-badge ${statusClass(
                  row.status
                )}"
              >
                ${escapeHtml(
                  statusLabel(
                    row.status
                  )
                )}
              </span>
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   UPCOMING MEETINGS
========================================================= */

async function loadUpcomingMeetings() {

  const groupId =
    currentGroup.id;


  const today =
    new Date();


  const {
    data,
    error
  } =
    await supabase
      .from("meetings")
      .select(
        "id,meeting_date,title,name,venue,status"
      )
      .eq(
        "group_id",
        groupId
      )
      .gte(
        "meeting_date",
        today.toISOString()
      )
      .order(
        "meeting_date",
        {
          ascending: true
        }
      )
      .limit(5);


  if (error) {

    /*
     * Some deployments may not have `title`
     * or `name` simultaneously.
     *
     * Re-throw so the page reports the actual
     * database problem instead of silently
     * showing false data.
     */

    throw error;

  }


  const rows =
    Array.isArray(data)
      ? data
      : [];


  const body =
    document.querySelector(
      "#upcomingMeetings tbody"
    ) ||
    document.querySelector(
      ".meetings-table tbody"
    );


  if (!body) {

    console.warn(
      "CHAMA LIVE DASHBOARD: meetings table body not found"
    );

    return;

  }


  if (!rows.length) {

    body.innerHTML = `
      <tr>
        <td colspan="4">
          No upcoming meetings.
        </td>
      </tr>
    `;

    return;

  }


  body.innerHTML =
    rows
      .map(function (row) {

        const meetingName =
          row.title ||
          row.name ||
          "Meeting";


        return `
          <tr>

            <td>
              ${formatDate(
                row.meeting_date
              )}
            </td>

            <td>
              ${escapeHtml(
                meetingName
              )}
            </td>

            <td>
              ${escapeHtml(
                row.venue ||
                "—"
              )}
            </td>

            <td>
              <span
                class="status-badge ${statusClass(
                  row.status
                )}"
              >
                ${escapeHtml(
                  statusLabel(
                    row.status
                  )
                )}
              </span>
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   UPDATE STATUS TEXT
========================================================= */

function updateDashboardStatus() {

  setStatus(
    `Current month: ${getCurrentMonthKey()}`
  );

}


/* =========================================================
   LOAD DASHBOARD
========================================================= */

async function loadDashboard() {

  setStatus(
    "Loading dashboard..."
  );


  const memberCounts =
    await loadMemberCount();


  const monthlyRows =
    await loadCanonicalMonthlyStatus();


  const summary =
    calculateDashboardSummary(
      monthlyRows
    );


  renderMemberStatus(
    monthlyRows
  );


  renderSummary(
    summary,
    memberCounts
  );


  await loadCurrentBalance();


  /*
   * Activity sections are intentionally loaded
   * after the core accounting dashboard succeeds.
   */

  await Promise.all([
    loadRecentContributions(),
    loadRecentExpenses(),
    loadUpcomingMeetings()
  ]);


  updateDashboardStatus();


  console.log(
    "CHAMA LIVE DASHBOARD: loaded successfully"
  );

}


/* =========================================================
   PUBLIC INITIALIZER
========================================================= */

export async function initDashboard() {

  if (dashboardInitialized) {

    console.warn(
      "CHAMA LIVE DASHBOARD: already initialized"
    );

    return;

  }


  dashboardInitialized =
    true;


  try {

    loadContext();


    updateGroupDisplay();


    await loadDashboard();

  }
  catch (error) {

    dashboardInitialized =
      false;


    console.error(
      "CHAMA LIVE DASHBOARD: initialization failed",
      error
    );


    showError(
      error?.message ||
      "Unable to load dashboard."
    );

  }

}


/* =========================================================
   GENERIC INITIALIZER
========================================================= */

export async function init() {

  await initDashboard();

}


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: dashboard.js ready"
);
