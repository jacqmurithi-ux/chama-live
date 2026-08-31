/* =========================================================
   CHAMA LIVE — DASHBOARD
   FINAL STABLE VERSION
   ---------------------------------------------------------
   READ-ONLY DASHBOARD

   ACCOUNTING SOURCE OF TRUTH
   ---------------------------------------------------------
   obligation
       ↓
   payment
       ↓
   allocation
       ↓
   canonical monthly status RPC

   IMPORTANT
   ---------------------------------------------------------
   Dashboard must NOT invent accounting logic.

   Raw contributions are used only for:
       - recent contribution display
       - actual cash received summary

   Monthly contribution figures come from:
       get_canonical_member_monthly_status

   Expenses are read using columns known to exist:
       description
       amount
       expense_date

   Do NOT assume expenses.status exists.
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

    case "approved":
      return "Approved";

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

    case "approved":
      return "status-paid";

    default:
      return "status-neutral";

  }

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
   LOAD LAYOUT CONTEXT
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
      member:
        currentMember,

      group:
        currentGroup
    }
  );

}


/* =========================================================
   GROUP DISPLAY
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
   MEMBER COUNT
========================================================= */

async function loadMemberCount() {

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
        currentGroup.id
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
          normalizeStatus(
            member.status
          );


        /*
         * Existing CHAMA LIVE data may leave
         * status empty for an active member.
         */

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
   CANONICAL MONTHLY STATUS
========================================================= */

async function loadCanonicalMonthlyStatus() {

  console.log(
    "CHAMA LIVE DASHBOARD: requesting canonical monthly status"
  );


  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_canonical_member_monthly_status",
      {
        p_group_id:
          currentGroup.id,

        p_month:
          getCurrentMonthKey()
      }
    );


  if (error) {

    throw error;

  }


  const rows =
    Array.isArray(data)
      ? data
      : [];


  console.log(
    "CHAMA LIVE DASHBOARD: canonical monthly rows",
    rows
  );


  return rows;

}


/* =========================================================
   NORMALIZE MONTHLY ROW
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
   MEMBER STATUS TABLE
========================================================= */

function renderMemberStatus(rows) {

  const body =
    document.querySelector(
      "#memberStatusTableBody"
    ) ||
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


        const css =
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
                class="status-badge ${css}"
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
   CALCULATE MONTHLY SUMMARY
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
   FIND PROGRESS ELEMENT
========================================================= */

function findProgressElement() {

  return (
    byId(
      "contributionProgressBar"
    ) ||

    byId(
      "progressBar"
    ) ||

    document.querySelector(
      ".progress-bar"
    )
  );

}


function findProgressPercentageElement() {

  return (
    byId(
      "contributionPercentage"
    ) ||

    byId(
      "progressPercentage"
    ) ||

    document.querySelector(
      ".progress-percentage"
    )
  );

}


/* =========================================================
   FIND PROGRESS AMOUNT ELEMENT
========================================================= */

function findProgressAmountElement() {

  return (
    byId(
      "contributionProgressAmount"
    ) ||

    byId(
      "progressAmount"
    ) ||

    document.querySelector(
      ".progress-footer strong"
    )
  );

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
  } =
    summary;


  /*
   * Monthly expected
   */

  const expectedElement =
    byId(
      "monthlyExpected"
    );


  if (expectedElement) {

    expectedElement.textContent =
      money(
        monthlyExpected
      );

  }


  /*
   * Monthly applied
   */

  const appliedElement =
    byId(
      "monthlyCollected"
    );


  if (appliedElement) {

    appliedElement.textContent =
      money(
        monthlyApplied
      );

  }


  /*
   * Progress
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


  /*
   * Percentage
   */

  const percentageElement =
    findProgressPercentageElement();


  if (percentageElement) {

    percentageElement.textContent =
      `${Math.round(
        safeProgress
      )}%`;

  }


  /*
   * Progress bar
   */

  const progressBar =
    findProgressElement();


  if (progressBar) {

    progressBar.style.width =
      `${safeProgress}%`;


    progressBar.setAttribute(
      "aria-valuenow",
      String(
        Math.round(
          safeProgress
        )
      )
    );

  }


  /*
   * Progress amount
   */

  const progressAmount =
    findProgressAmountElement();


  if (progressAmount) {

    progressAmount.textContent =
      `${money(
        monthlyApplied
      )} / ${money(
        monthlyExpected
      )}`;

  }


  /*
   * Members contributed
   */

  const contributedElement =
    byId(
      "membersContributed"
    );


  if (contributedElement) {

    contributedElement.textContent =
      `${membersContributed} / ${
        memberCounts.total
      }`;

  }


  /*
   * Participation
   */

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


  /*
   * Applied this month
   */

  const appliedThisMonthElement =
    byId(
      "appliedThisMonth"
    );


  if (appliedThisMonthElement) {

    appliedThisMonthElement.textContent =
      money(
        monthlyApplied
      );

  }


  /*
   * Carry-forward credit
   */

  const carryForwardElement =
    byId(
      "carryForwardCredit"
    );


  if (carryForwardElement) {

    carryForwardElement.textContent =
      money(
        carryForward
      );

  }


  /*
   * Current outstanding
   */

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
   CURRENT CASH BALANCE
========================================================= */

async function loadCurrentBalance() {

  const groupId =
    currentGroup.id;


  /*
   * IMPORTANT
   * -------------------------------------------------------
   * Do not select expenses.status.
   *
   * The live expenses table does not contain that column.
   *
   * We therefore use the actual financial amount recorded
   * in the expenses table.
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


  let contributionTotal =
    0;


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
   * Expenses:
   *
   * Only columns known to be needed are selected.
   */

  const expenseResult =
    await supabase
      .from("expenses")
      .select(
        "amount"
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


  let expenseTotal =
    0;


  (
    expenseResult.data ||
    []
  ).forEach(function (row) {

    expenseTotal +=
      Number(
        row.amount || 0
      );

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


  console.log(
    "CHAMA LIVE DASHBOARD: current balance",
    {
      contributionTotal,
      expenseTotal,
      balance
    }
  );


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
        currentGroup.id
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
      "CHAMA LIVE DASHBOARD: recent contributions body not found"
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

  /*
   * IMPORTANT
   * -------------------------------------------------------
   * Do NOT request expenses.status.
   *
   * The current live schema reports:
   *
   *     column expenses.status does not exist
   *
   * Therefore the dashboard only requests columns that
   * are actually required for this display.
   */

  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .select(
        "id,description,amount,expense_date"
      )
      .eq(
        "group_id",
        currentGroup.id
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
      "CHAMA LIVE DASHBOARD: recent expenses body not found"
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
                class="status-badge status-neutral"
              >
                Recorded
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

  /*
   * Use the existing meeting fields.
   *
   * We intentionally keep the query conservative.
   */

  const {
    data,
    error
  } =
    await supabase
      .from("meetings")
      .select(
        "id,meeting_date,title,venue,status"
      )
      .eq(
        "group_id",
        currentGroup.id
      )
      .gte(
        "meeting_date",
        new Date().toISOString()
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
     * Do not allow a meetings schema mismatch to
     * destroy an otherwise functioning financial
     * dashboard.
     */

    console.warn(
      "CHAMA LIVE DASHBOARD: meetings query failed",
      error
    );

    return;

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
      "CHAMA LIVE DASHBOARD: meetings body not found"
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

        return `
          <tr>

            <td>
              ${formatDate(
                row.meeting_date
              )}
            </td>

            <td>
              ${escapeHtml(
                row.title ||
                "Meeting"
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
   MAIN DASHBOARD LOAD
========================================================= */

async function loadDashboard() {

  setStatus(
    "Loading dashboard..."
  );


  /*
   * Core data
   */

  const memberCounts =
    await loadMemberCount();


  const monthlyRows =
    await loadCanonicalMonthlyStatus();


  const summary =
    calculateDashboardSummary(
      monthlyRows
    );


  /*
   * Render canonical accounting first.
   */

  renderMemberStatus(
    monthlyRows
  );


  renderSummary(
    summary,
    memberCounts
  );


  /*
   * Current balance.
   */

  await loadCurrentBalance();


  /*
   * Activity panels.
   *
   * Contributions and expenses are important but
   * should not overwrite the canonical monthly
   * accounting values.
   */

  await Promise.all([
    loadRecentContributions(),
    loadRecentExpenses(),
    loadUpcomingMeetings()
  ]);


  /*
   * Final status.
   */

  setStatus(
    `Current month: ${getCurrentMonthKey()}`
  );


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
