/* =========================================================
   CHAMA LIVE — DASHBOARD
   COMPLETE STABLE VERSION
   ---------------------------------------------------------
   Canonical contribution accounting:

   Obligation
        ↓
   Payment
        ↓
   Allocation
        ↓
   Arrears / Credit

   IMPORTANT
   ---------------------------------------------------------
   1. Do NOT embed contributions -> members.
      There are multiple relationships between those tables.

   2. Member names are loaded separately.

   3. Monthly status comes from:
        get_canonical_member_monthly_status()

   4. Expenses use:
        approval_status

   5. All data is scoped to the authenticated group.

   6. This file matches the IDs in dashboard.html.
========================================================= */

import { supabase } from "./supabase.js";

import {
  getCurrentMember,
  getCurrentGroup
} from "./auth.js";


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


function setText(id, value) {

  const element = byId(id);

  if (!element) {
    return;
  }

  element.textContent = value;

}


function money(value) {

  const amount =
    Number(value) || 0;

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


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

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


function currentMonthKey() {

  const now =
    new Date();

  return (
    now.getFullYear() +
    "-" +
    String(
      now.getMonth() + 1
    ).padStart(2, "0")
  );

}


function currentMonthLabel() {

  const now =
    new Date();

  return now.toLocaleDateString(
    "en-KE",
    {
      month: "long",
      year: "numeric"
    }
  );

}


/* =========================================================
   NORMALIZE MEMBER
========================================================= */

function memberName(member) {

  if (!member) {
    return "Member";
  }

  return (
    member.name ||
    member.full_name ||
    member.member_name ||
    "Member"
  );

}


/* =========================================================
   ERROR DISPLAY
========================================================= */

function showDashboardError(error) {

  console.error(
    "CHAMA LIVE: dashboard error",
    error
  );


  const message =
    error?.message ||
    "Dashboard could not be loaded.";


  const errorBox =
    byId("error");


  if (errorBox) {

    errorBox.hidden =
      false;

    errorBox.textContent =
      message;

  }


  const status =
    byId("status");


  if (status) {

    status.textContent =
      "Dashboard could not be loaded.";

  }

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  if (!currentGroup?.id) {

    throw new Error(
      "Current group could not be identified."
    );

  }


  /*
   * IMPORTANT:
   *
   * Do NOT use:
   *
   * contributions.select(`
   *   *,
   *   members(...)
   * `)
   *
   * because contributions and members have
   * more than one relationship.
   */

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(`
        id,
        name,
        full_name,
        group_id,
        status,
        active
      `)
      .eq(
        "group_id",
        currentGroup.id
      );


  if (error) {
    throw error;
  }


  return data || [];

}


/* =========================================================
   LOAD MEMBER STATUS
========================================================= */

async function loadMonthlyMemberStatus() {

  if (!currentGroup?.id) {

    throw new Error(
      "Current group could not be identified."
    );

  }


  /*
   * Canonical monthly accounting RPC.
   *
   * This is deliberately used instead of rebuilding
   * obligation/payment/allocation calculations in JS.
   */

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
          currentMonthKey()
      }
    );


  if (error) {
    throw error;
  }


  return data || [];

}


/* =========================================================
   MEMBER STATUS NORMALIZATION
========================================================= */

function normalizeMonthlyStatus(row) {

  /*
   * Support the canonical RPC column names while
   * tolerating harmless naming differences.
   */

  const monthlyDue =
    Number(
      row.monthly_due ??
      row.due_amount ??
      row.current_due ??
      0
    );


  const previousOutstanding =
    Number(
      row.previous_outstanding ??
      row.prior_outstanding ??
      row.arrears ??
      0
    );


  const appliedThisMonth =
    Number(
      row.applied_this_month ??
      row.monthly_applied ??
      row.applied_amount ??
      0
    );


  const carryForward =
    Number(
      row.carry_forward ??
      row.credit ??
      0
    );


  const currentOutstanding =
    Number(
      row.current_outstanding ??
      row.outstanding ??
      0
    );


  const memberId =
    row.member_id ||
    row.id ||
    null;


  const name =
    row.member_name ||
    row.name ||
    row.full_name ||
    "Member";


  let status =
    row.status ||
    null;


  if (!status) {

    if (carryForward > 0) {

      status = "Credit";

    }
    else if (currentOutstanding <= 0) {

      status = "Cleared";

    }
    else if (appliedThisMonth > 0) {

      status = "Partial";

    }
    else {

      status = "Outstanding";

    }

  }


  return {

    memberId,

    name,

    monthlyDue,

    previousOutstanding,

    appliedThisMonth,

    carryForward,

    currentOutstanding,

    status

  };

}


/* =========================================================
   MERGE MEMBER NAMES
========================================================= */

function mergeMemberNames(
  statusRows,
  members
) {

  const memberMap =
    new Map();


  members.forEach(function (member) {

    if (member?.id) {

      memberMap.set(
        member.id,
        memberName(member)
      );

    }

  });


  return statusRows.map(
    function (row) {

      const normalized =
        normalizeMonthlyStatus(row);


      if (
        normalized.memberId &&
        memberMap.has(
          normalized.memberId
        )
      ) {

        normalized.name =
          memberMap.get(
            normalized.memberId
          );

      }


      return normalized;

    }
  );

}


/* =========================================================
   STATUS BADGE
========================================================= */

function statusClass(status) {

  const normalized =
    String(status || "")
      .toLowerCase()
      .trim();


  if (
    normalized.includes("credit") ||
    normalized.includes("overpaid") ||
    normalized.includes("paid") ||
    normalized.includes("cleared")
  ) {

    return "status-credit";

  }


  if (
    normalized.includes("partial")
  ) {

    return "status-partial";

  }


  if (
    normalized.includes("outstanding") ||
    normalized.includes("pending")
  ) {

    return "status-outstanding";

  }


  return "status-neutral";

}


/* =========================================================
   RENDER MEMBER STATUS TABLE
========================================================= */

function renderMemberStatus(
  rows
) {

  const tbody =
    byId("memberStatusRows");


  if (!tbody) {
    return;
  }


  if (!rows.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          No member contribution status available.
        </td>
      </tr>
    `;

    return;

  }


  tbody.innerHTML =
    rows.map(
      function (row) {

        return `
          <tr>

            <td>
              ${escapeHtml(row.name)}
            </td>

            <td>
              ${money(row.monthlyDue)}
            </td>

            <td>
              ${money(row.previousOutstanding)}
            </td>

            <td class="applied-value">
              ${money(row.appliedThisMonth)}
            </td>

            <td class="credit-value">
              ${money(row.carryForward)}
            </td>

            <td class="outstanding-value">
              ${money(row.currentOutstanding)}
            </td>

            <td>
              <span
                class="status-badge ${statusClass(row.status)}"
              >
                ${escapeHtml(row.status)}
              </span>
            </td>

          </tr>
        `;

      }
    ).join("");

}


/* =========================================================
   CALCULATE MONTHLY SUMMARY
========================================================= */

function calculateMonthlySummary(
  rows,
  members
) {

  /*
   * Expected monthly amount:
   *
   * Sum of active members' monthly obligations.
   *
   * We prefer the canonical status rows because
   * those contain the actual monthly due.
   */

  const monthlyExpected =
    rows.reduce(
      function (total, row) {

        return (
          total +
          Number(row.monthlyDue || 0)
        );

      },
      0
    );


  const monthlyApplied =
    rows.reduce(
      function (total, row) {

        return (
          total +
          Number(row.appliedThisMonth || 0)
        );

      },
      0
    );


  const carryForward =
    rows.reduce(
      function (total, row) {

        return (
          total +
          Number(row.carryForward || 0)
        );

      },
      0
    );


  const outstanding =
    rows.reduce(
      function (total, row) {

        return (
          total +
          Number(row.currentOutstanding || 0)
        );

      },
      0
    );


  const activeMembers =
    members.filter(
      function (member) {

        /*
         * Treat explicit inactive/disabled status
         * as inactive.
         */

        const status =
          String(
            member?.status || ""
          ).toLowerCase();


        if (
          status === "inactive" ||
          status === "disabled" ||
          status === "suspended"
        ) {

          return false;

        }


        if (
          member?.active === false
        ) {

          return false;

        }


        return true;

      }
    ).length;


  /*
   * Members who have a positive application this month.
   */

  const contributors =
    rows.filter(
      function (row) {

        return (
          Number(
            row.appliedThisMonth
          ) > 0
        );

      }
    ).length;


  const denominator =
    monthlyExpected > 0
      ? monthlyExpected
      : 0;


  const percentage =
    denominator > 0
      ? (
          monthlyApplied /
          denominator
        ) * 100
      : 0;


  return {

    monthlyExpected,

    monthlyApplied,

    carryForward,

    outstanding,

    activeMembers,

    contributors,

    percentage

  };

}


/* =========================================================
   RENDER MONTHLY SUMMARY
========================================================= */

function renderMonthlySummary(
  summary
) {

  setText(
    "activeMembers",
    summary.activeMembers
  );


  setText(
    "membersCount",
    summary.activeMembers
  );


  setText(
    "monthlyExpected",
    money(
      summary.monthlyExpected
    )
  );


  setText(
    "monthlyCollected",
    money(
      summary.monthlyApplied
    )
  );


  setText(
    "progressPercentage",
    Math.round(
      summary.percentage
    ) + "%"
  );


  setText(
    "progressText",
    `${money(summary.monthlyApplied)} / ${money(summary.monthlyExpected)}`
  );


  setText(
    "contributorsCount",
    `${summary.contributors} / ${summary.activeMembers}`
  );


  const participation =
    summary.activeMembers > 0
      ? (
          summary.contributors /
          summary.activeMembers
        ) * 100
      : 0;


  setText(
    "contributorsPercentage",
    Math.round(
      participation
    ) + "%"
  );


  setText(
    "monthlyOutstanding",
    money(
      summary.outstanding
    )
  );


  setText(
    "progressApplied",
    money(
      summary.monthlyApplied
    )
  );


  setText(
    "progressCarryForward",
    money(
      summary.carryForward
    )
  );


  setText(
    "progressOutstanding",
    money(
      summary.outstanding
    )
  );


  setText(
    "progressMonth",
    currentMonthLabel()
  );


  const progressBar =
    byId("progressBar");


  if (progressBar) {

    const width =
      Math.max(
        0,
        Math.min(
          100,
          summary.percentage
        )
      );


    progressBar.style.width =
      width + "%";


    const progressContainer =
      progressBar.parentElement;


    if (progressContainer) {

      progressContainer.setAttribute(
        "aria-valuenow",
        String(
          Math.round(width)
        )
      );

    }

  }

}


/* =========================================================
   LOAD CURRENT BALANCE
========================================================= */

async function loadCurrentBalance() {

  if (!currentGroup?.id) {
    return 0;
  }


  /*
   * Balance is:
   *
   * total recorded contributions
   * minus approved expenses
   *
   * Contributions are queried directly.
   * No members embedding is used.
   */

  const {
    data: contributions,
    error: contributionError
  } =
    await supabase
      .from("contributions")
      .select(
        "amount"
      )
      .eq(
        "group_id",
        currentGroup.id
      );


  if (contributionError) {
    throw contributionError;
  }


  const totalContributions =
    (contributions || [])
      .reduce(
        function (total, row) {

          return (
            total +
            Number(
              row.amount || 0
            )
          );

        },
        0
      );


  /*
   * IMPORTANT:
   *
   * expenses.status does NOT exist.
   *
   * The application uses approval_status.
   *
   * Only approved expenses reduce the group balance.
   */

  const {
    data: expenses,
    error: expenseError
  } =
    await supabase
      .from("expenses")
      .select(
        "amount, approval_status"
      )
      .eq(
        "group_id",
        currentGroup.id
      );


  if (expenseError) {
    throw expenseError;
  }


  const approvedExpenses =
    (expenses || [])
      .filter(
        function (expense) {

          return (
            String(
              expense.approval_status || ""
            ).toLowerCase() ===
            "approved"
          );

        }
      )
      .reduce(
        function (total, expense) {

          return (
            total +
            Number(
              expense.amount || 0
            )
          );

        },
        0
      );


  return (
    totalContributions -
    approvedExpenses
  );

}


/* =========================================================
   RENDER CURRENT BALANCE
========================================================= */

function renderCurrentBalance(
  balance
) {

  setText(
    "currentBalance",
    money(balance)
  );

}


/* =========================================================
   LOAD RECENT CONTRIBUTIONS
========================================================= */

async function loadRecentContributions(
  members
) {

  const tbody =
    byId("recentContributionRows");


  if (!tbody) {
    return;
  }


  if (!currentGroup?.id) {

    throw new Error(
      "Current group could not be identified."
    );

  }


  const {
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select(`
        id,
        member_id,
        amount,
        contribution_date
      `)
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


  if (!data?.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="3">
          No contributions recorded yet.
        </td>
      </tr>
    `;

    return;

  }


  const memberMap =
    new Map();


  members.forEach(
    function (member) {

      if (member?.id) {

        memberMap.set(
          member.id,
          memberName(member)
        );

      }

    }
  );


  tbody.innerHTML =
    data.map(
      function (row) {

        const name =
          memberMap.get(
            row.member_id
          ) ||
          "Member";


        return `
          <tr>

            <td>
              ${escapeHtml(name)}
            </td>

            <td>
              ${money(row.amount)}
            </td>

            <td>
              ${escapeHtml(
                formatDate(
                  row.contribution_date
                )
              )}
            </td>

          </tr>
        `;

      }
    ).join("");

}


/* =========================================================
   LOAD RECENT EXPENSES
========================================================= */

async function loadRecentExpenses() {

  const tbody =
    byId("recentExpenseRows");


  if (!tbody) {
    return;
  }


  if (!currentGroup?.id) {

    throw new Error(
      "Current group could not be identified."
    );

  }


  /*
   * IMPORTANT:
   * expenses.status does not exist.
   *
   * Use approval_status.
   */

  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .select(`
        id,
        description,
        amount,
        approval_status,
        expense_date,
        created_at
      `)
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


  if (!data?.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="3">
          No expenses recorded yet.
        </td>
      </tr>
    `;

    return;

  }


  tbody.innerHTML =
    data.map(
      function (row) {

        const status =
          row.approval_status ||
          "Pending";


        return `
          <tr>

            <td>
              ${escapeHtml(
                row.description ||
                "Expense"
              )}
            </td>

            <td>
              ${money(row.amount)}
            </td>

            <td>
              <span
                class="status-badge ${statusClass(status)}"
              >
                ${escapeHtml(status)}
              </span>
            </td>

          </tr>
        `;

      }
    ).join("");

}


/* =========================================================
   LOAD UPCOMING MEETINGS
========================================================= */

async function loadUpcomingMeetings() {

  const tbody =
    byId("upcomingMeetingRows");


  if (!tbody) {
    return;
  }


  if (!currentGroup?.id) {

    throw new Error(
      "Current group could not be identified."
    );

  }


  const today =
    new Date()
      .toISOString()
      .slice(0, 10);


  const {
    data,
    error
  } =
    await supabase
      .from("meetings")
      .select(`
        id,
        meeting_date,
        title,
        name,
        venue,
        status
      `)
      .eq(
        "group_id",
        currentGroup.id
      )
      .gte(
        "meeting_date",
        today
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
     * Some older schemas may not have title/name
     * exactly as expected. Surface the actual error
     * rather than silently producing incorrect data.
     */

    throw error;

  }


  if (!data?.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="4">
          No upcoming meetings.
        </td>
      </tr>
    `;

    return;

  }


  tbody.innerHTML =
    data.map(
      function (row) {

        const meetingName =
          row.title ||
          row.name ||
          "Meeting";


        const status =
          row.status ||
          "Scheduled";


        return `
          <tr>

            <td>
              ${escapeHtml(
                formatDate(
                  row.meeting_date
                )
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
                class="status-badge ${statusClass(status)}"
              >
                ${escapeHtml(status)}
              </span>
            </td>

          </tr>
        `;

      }
    ).join("");

}


/* =========================================================
   LOAD ALL DASHBOARD DATA
========================================================= */

async function loadDashboard() {

  /*
   * Load members independently.
   */

  const members =
    await loadMembers();


  /*
   * Load canonical monthly accounting.
   */

  const rawStatus =
    await loadMonthlyMemberStatus();


  /*
   * Merge names locally.
   *
   * No ambiguous Supabase relationship.
   */

  const monthlyStatus =
    mergeMemberNames(
      rawStatus,
      members
    );


  /*
   * Render contribution status.
   */

  renderMemberStatus(
    monthlyStatus
  );


  /*
   * Calculate and render monthly summary.
   */

  const summary =
    calculateMonthlySummary(
      monthlyStatus,
      members
    );


  renderMonthlySummary(
    summary
  );


  /*
   * Current balance.
   */

  const balance =
    await loadCurrentBalance();


  renderCurrentBalance(
    balance
  );


  /*
   * Recent activity.
   */

  await Promise.all([

    loadRecentContributions(
      members
    ),

    loadRecentExpenses(),

    loadUpcomingMeetings()

  ]);


  console.log(
    "CHAMA LIVE: dashboard data loaded",
    {
      groupId:
        currentGroup?.id,

      summary,

      balance,

      memberStatus:
        monthlyStatus
    }
  );

}


/* =========================================================
   INITIALIZE DASHBOARD
========================================================= */

export async function initDashboard() {

  if (dashboardInitialized) {

    console.warn(
      "CHAMA LIVE: dashboard already initialized"
    );

    return;

  }


  dashboardInitialized =
    true;


  try {

    /*
     * Current authenticated member.
     */

    currentMember =
      await getCurrentMember();


    if (!currentMember) {

      throw new Error(
        "No authenticated member found."
      );

    }


    /*
     * Current authenticated group.
     */

    currentGroup =
      await getCurrentGroup();


    if (!currentGroup) {

      throw new Error(
        "Current group could not be found."
      );

    }


    /*
     * Verify group ID.
     */

    if (!currentGroup.id) {

      throw new Error(
        "Current group has no ID."
      );

    }


    console.log(
      "CHAMA LIVE: dashboard group",
      currentGroup
    );


    /*
     * Load dashboard.
     */

    await loadDashboard();


    /*
     * Success.
     */

    const status =
      byId("status");


    if (status) {

      status.textContent =
        "Dashboard loaded.";

    }


    const errorBox =
      byId("error");


    if (errorBox) {

      errorBox.hidden =
        true;

      errorBox.textContent =
        "";

    }


    console.log(
      "CHAMA LIVE: dashboard initialized successfully"
    );

  }
  catch (error) {

    dashboardInitialized =
      false;


    showDashboardError(
      error
    );

  }

}


/* =========================================================
   GENERIC INITIALIZER
========================================================= */

export async function init() {

  return initDashboard();

}


/* =========================================================
   PUBLIC REFRESH
========================================================= */

export async function refreshDashboard() {

  if (!currentMember) {

    currentMember =
      await getCurrentMember();

  }


  if (!currentGroup) {

    currentGroup =
      await getCurrentGroup();

  }


  await loadDashboard();

}


console.log(
  "CHAMA LIVE: dashboard.js ready"
);
