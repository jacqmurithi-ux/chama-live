/* =========================================================
   CHAMA LIVE — DASHBOARD
   COMPLETE STABLE VERSION
   ---------------------------------------------------------
   HTML IDS MATCH dashboard.html

   IMPORTANT DATABASE RULES
   ---------------------------------------------------------
   1. contributions -> members are loaded separately.
   2. Do NOT use members(...) embedding on contributions.
   3. expenses uses approval_status, NOT status.
   4. Monthly accounting uses:
        get_canonical_member_monthly_status()
   5. All dashboard queries are group-scoped.
   6. No database/schema changes are performed here.
   7. Each dashboard section fails independently so one
      optional section cannot break the whole dashboard.
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


/* =========================================================
   HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
}


function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


function number(value) {

  const result =
    Number(value);

  return Number.isFinite(result)
    ? result
    : 0;

}


function money(value) {

  return (
    "KSh " +
    number(value).toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }
    )
  );

}


function setText(id, value) {

  const element =
    byId(id);

  if (element) {
    element.textContent =
      value;
  }

}


function currentMonthText() {

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


function normalizeStatus(value) {

  return String(
    value || ""
  )
    .trim()
    .toLowerCase();

}


/* =========================================================
   STATUS
========================================================= */

function setStatus(message) {

  const element =
    byId("status");

  if (element) {

    element.textContent =
      message || "";

  }

}


function showError(message) {

  const errorBox =
    byId("error");

  if (!errorBox) {
    return;
  }

  errorBox.hidden =
    false;

  errorBox.textContent =
    message ||
    "Dashboard could not be loaded.";

}


function clearError() {

  const errorBox =
    byId("error");

  if (!errorBox) {
    return;
  }

  errorBox.hidden =
    true;

  errorBox.textContent =
    "";

}


/* =========================================================
   CONTEXT
========================================================= */

async function loadContext() {

  currentMember =
    await getCurrentMember();


  if (!currentMember) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  if (!currentMember.group_id) {

    throw new Error(
      "Your member record has no group."
    );

  }


  currentGroup =
    await getCurrentGroup();


  if (!currentGroup) {

    throw new Error(
      "Group information could not be found."
    );

  }


  const groupId =
    currentMember.group_id;


  if (
    currentGroup.id &&
    currentGroup.id !== groupId
  ) {

    throw new Error(
      "Member and group context do not match."
    );

  }


  const groupName =
    currentGroup.name ||
    currentGroup.group_name ||
    "CHAMA";


  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(function (element) {

      element.textContent =
        groupName;

    });


  const memberName =
    currentMember.name ||
    currentMember.full_name ||
    "Member";


  document
    .querySelectorAll(
      "[data-user-name]"
    )
    .forEach(function (element) {

      element.textContent =
        memberName;

    });


  return groupId;

}


/* =========================================================
   MEMBERS
========================================================= */

async function loadMembers(groupId) {

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(
        "id,name,member_number,status,group_id"
      )
      .eq(
        "group_id",
        groupId
      )
      .order(
        "name",
        {
          ascending: true
        }
      );


  if (error) {
    throw error;
  }


  return data || [];

}


/* =========================================================
   MONTHLY CANONICAL STATUS
========================================================= */

async function loadMonthlyStatus(groupId) {

  const month =
    currentMonthText();


  console.log(
    "CHAMA LIVE: loading canonical monthly status",
    {
      groupId,
      month
    }
  );


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


  return data || [];

}


/* =========================================================
   MEMBER STATUS BADGE
========================================================= */

function statusClass(status) {

  const normalized =
    normalizeStatus(status);


  if (
    normalized === "paid" ||
    normalized === "cleared"
  ) {

    return "status-paid";

  }


  if (
    normalized === "credit" ||
    normalized === "overpaid"
  ) {

    return "status-credit";

  }


  if (
    normalized === "partial"
  ) {

    return "status-partial";

  }


  if (
    normalized === "outstanding" ||
    normalized === "pending"
  ) {

    return "status-outstanding";

  }


  return "status-neutral";

}


/* =========================================================
   RENDER MEMBER STATUS
   ---------------------------------------------------------
   HTML ID:
       memberStatusRows
========================================================= */

function renderMemberStatus(rows) {

  const tableBody =
    byId("memberStatusRows");


  if (!tableBody) {

    console.warn(
      "CHAMA LIVE: #memberStatusRows not found"
    );

    return;

  }


  if (!rows.length) {

    tableBody.innerHTML = `
      <tr>
        <td colspan="7">
          No member contribution status available.
        </td>
      </tr>
    `;

    return;

  }


  tableBody.innerHTML =
    rows.map(function (row) {

      const status =
        String(
          row.status ||
          "Outstanding"
        );


      const carry =
        number(
          row.carry_forward
        );


      const outstanding =
        number(
          row.current_outstanding
        );


      return `
        <tr>

          <td>
            ${escapeHtml(
              row.member_name ||
              "Member"
            )}
          </td>

          <td>
            ${money(
              row.monthly_due
            )}
          </td>

          <td>
            ${money(
              row.previous_outstanding
            )}
          </td>

          <td class="applied-value">
            ${money(
              row.applied_this_month
            )}
          </td>

          <td class="${
            carry > 0
              ? "credit-value"
              : ""
          }">
            ${money(carry)}
          </td>

          <td class="${
            outstanding > 0
              ? "outstanding-value"
              : ""
          }">
            ${money(outstanding)}
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

    }).join("");

}


/* =========================================================
   MONTHLY SUMMARY
========================================================= */

function calculateMonthlySummary(rows) {

  let monthlyDue =
    0;

  let appliedThisMonth =
    0;

  let carryForward =
    0;

  let outstanding =
    0;

  let contributedMembers =
    0;


  rows.forEach(function (row) {

    const due =
      number(
        row.monthly_due
      );


    const applied =
      number(
        row.applied_this_month
      );


    const credit =
      number(
        row.carry_forward
      );


    const currentOutstanding =
      number(
        row.current_outstanding
      );


    monthlyDue +=
      due;


    appliedThisMonth +=
      applied;


    carryForward +=
      credit;


    outstanding +=
      currentOutstanding;


    if (applied > 0) {

      contributedMembers++;

    }

  });


  return {

    monthlyDue,

    appliedThisMonth,

    carryForward,

    outstanding,

    contributedMembers

  };

}


/* =========================================================
   RENDER MONTHLY SUMMARY
   ---------------------------------------------------------
   HTML IDS:
       monthlyExpected
       monthlyCollected
       progressMonth
       progressPercentage
       progressBar
       progressText
       contributorsCount
       contributorsPercentage
       monthlyOutstanding
       progressApplied
       progressCarryForward
       progressOutstanding
========================================================= */

function renderMonthlySummary(
  summary,
  totalMembers
) {

  setText(
    "monthlyExpected",
    money(
      summary.monthlyDue
    )
  );


  setText(
    "monthlyCollected",
    money(
      summary.appliedThisMonth
    )
  );


  setText(
    "progressMonth",
    currentMonthText()
  );


  const rate =
    summary.monthlyDue > 0
      ? (
          summary.appliedThisMonth /
          summary.monthlyDue
        ) * 100
      : 0;


  const safeRate =
    Math.max(
      0,
      Math.min(
        100,
        rate
      )
    );


  setText(
    "progressPercentage",
    `${Math.round(safeRate)}%`
  );


  setText(
    "progressText",
    `${money(summary.appliedThisMonth)} / ${money(summary.monthlyDue)}`
  );


  const progressBar =
    byId("progressBar");


  if (progressBar) {

    progressBar.style.width =
      `${safeRate}%`;

  }


  const progressContainer =
    document.querySelector(
      '[role="progressbar"]'
    );


  if (progressContainer) {

    progressContainer.setAttribute(
      "aria-valuenow",
      String(
        Math.round(safeRate)
      )
    );

  }


  setText(
    "contributorsCount",
    `${summary.contributedMembers} / ${totalMembers}`
  );


  const participation =
    totalMembers > 0
      ? (
          summary.contributedMembers /
          totalMembers
        ) * 100
      : 0;


  setText(
    "contributorsPercentage",
    `${Math.round(participation)}%`
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
      summary.appliedThisMonth
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

}


/* =========================================================
   RECENT CONTRIBUTIONS
   ---------------------------------------------------------
   NO embedded members relationship.
========================================================= */

async function loadRecentContributions(groupId) {

  const {
    data: contributions,
    error
  } =
    await supabase
      .from("contributions")
      .select(
        `
        id,
        member_id,
        amount,
        contribution_type,
        contribution_date,
        created_at
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
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(5);


  if (error) {
    throw error;
  }


  const rows =
    contributions || [];


  if (!rows.length) {
    return [];
  }


  const memberIds =
    [
      ...new Set(
        rows
          .map(function (row) {
            return row.member_id;
          })
          .filter(Boolean)
      )
    ];


  if (!memberIds.length) {

    return rows.map(function (row) {

      return {
        ...row,
        member_name: "Member"
      };

    });

  }


  const {
    data: members,
    error: memberError
  } =
    await supabase
      .from("members")
      .select(
        "id,name"
      )
      .in(
        "id",
        memberIds
      );


  if (memberError) {
    throw memberError;
  }


  const memberMap =
    new Map();


  (members || [])
    .forEach(function (member) {

      memberMap.set(
        member.id,
        member.name ||
        "Member"
      );

    });


  return rows.map(function (row) {

    return {

      ...row,

      member_name:
        memberMap.get(
          row.member_id
        ) ||
        "Member"

    };

  });

}


/* =========================================================
   RENDER RECENT CONTRIBUTIONS
   ---------------------------------------------------------
   HTML ID:
       recentContributionRows
========================================================= */

function renderRecentContributions(rows) {

  const body =
    byId(
      "recentContributionRows"
    );


  if (!body) {

    console.warn(
      "CHAMA LIVE: #recentContributionRows not found"
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
    rows.map(function (row) {

      const date =
        row.contribution_date ||
        row.created_at;


      return `
        <tr>

          <td>
            ${escapeHtml(
              row.member_name ||
              "Member"
            )}
          </td>

          <td>
            ${money(
              row.amount
            )}
          </td>

          <td>
            ${escapeHtml(
              formatDate(date)
            )}
          </td>

        </tr>
      `;

    }).join("");

}


/* =========================================================
   RECENT EXPENSES
   ---------------------------------------------------------
   IMPORTANT:
       expenses.status DOES NOT EXIST.

   Actual database column:
       approval_status
========================================================= */

async function loadRecentExpenses(groupId) {

  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .select(
        `
        id,
        description,
        amount,
        date,
        approval_status,
        created_at
        `
      )
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
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(5);


  if (error) {
    throw error;
  }


  return data || [];

}


/* =========================================================
   RENDER RECENT EXPENSES
   ---------------------------------------------------------
   HTML ID:
       recentExpenseRows
========================================================= */

function renderRecentExpenses(rows) {

  const body =
    byId(
      "recentExpenseRows"
    );


  if (!body) {

    console.warn(
      "CHAMA LIVE: #recentExpenseRows not found"
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
    rows.map(function (row) {

      const status =
        row.approval_status ||
        "Pending";


      const normalized =
        normalizeStatus(
          status
        );


      let badgeClass =
        "status-neutral";


      if (
        normalized === "approved"
      ) {

        badgeClass =
          "status-paid";

      }
      else if (
        normalized === "pending"
      ) {

        badgeClass =
          "status-pending";

      }


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
              class="status-badge ${badgeClass}"
            >
              ${escapeHtml(status)}
            </span>

          </td>

        </tr>
      `;

    }).join("");

}


/* =========================================================
   MEETINGS
========================================================= */

async function loadUpcomingMeetings(groupId) {

  const today =
    new Date()
      .toISOString()
      .slice(
        0,
        10
      );


  const {
    data,
    error
  } =
    await supabase
      .from("meetings")
      .select(
        `
        id,
        title,
        date,
        venue,
        status
        `
      )
      .eq(
        "group_id",
        groupId
      )
      .gte(
        "date",
        today
      )
      .order(
        "date",
        {
          ascending: true
        }
      )
      .limit(5);


  if (error) {
    throw error;
  }


  return data || [];

}


/* =========================================================
   RENDER MEETINGS
   ---------------------------------------------------------
   HTML ID:
       upcomingMeetingRows
========================================================= */

function renderUpcomingMeetings(rows) {

  const body =
    byId(
      "upcomingMeetingRows"
    );


  if (!body) {

    console.warn(
      "CHAMA LIVE: #upcomingMeetingRows not found"
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
    rows.map(function (row) {

      const status =
        row.status ||
        "Scheduled";


      const normalized =
        normalizeStatus(
          status
        );


      let badgeClass =
        "status-neutral";


      if (
        normalized === "scheduled" ||
        normalized === "confirmed" ||
        normalized === "upcoming"
      ) {

        badgeClass =
          "status-paid";

      }


      return `
        <tr>

          <td>
            ${escapeHtml(
              formatDate(
                row.date
              )
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
              class="status-badge ${badgeClass}"
            >
              ${escapeHtml(status)}
            </span>

          </td>

        </tr>
      `;

    }).join("");

}


/* =========================================================
   LOAD TOTAL CONTRIBUTIONS
========================================================= */

async function loadTotalContributions(groupId) {

  const {
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select(
        "amount,contribution_date"
      )
      .eq(
        "group_id",
        groupId
      );


  if (error) {
    throw error;
  }


  return data || [];

}


/* =========================================================
   LOAD APPROVED EXPENSE TOTAL
========================================================= */

async function loadApprovedExpenseTotal(groupId) {

  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .select(
        "amount,approval_status"
      )
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "approval_status",
        "approved"
      );


  if (error) {
    throw error;
  }


  return (data || [])
    .reduce(
      function (
        total,
        row
      ) {

        return (
          total +
          number(row.amount)
        );

      },
      0
    );

}


/* =========================================================
   CURRENT BALANCE
========================================================= */

async function calculateCurrentBalance(groupId) {

  const [
    contributions,
    approvedExpenses
  ] =
    await Promise.all([
      loadTotalContributions(
        groupId
      ),

      loadApprovedExpenseTotal(
        groupId
      )
    ]);


  const totalContributions =
    contributions.reduce(
      function (
        total,
        row
      ) {

        return (
          total +
          number(row.amount)
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
   ACTIVE MEMBER COUNT
========================================================= */

function countActiveMembers(
  members
) {

  if (!members.length) {
    return 0;
  }


  const activeStatuses =
    new Set([
      "active",
      "approved"
    ]);


  const hasStatus =
    members.some(function (member) {

      return (
        member.status !== null &&
        member.status !== undefined &&
        String(
          member.status
        ).trim() !== ""
      );

    });


  if (!hasStatus) {

    return members.length;

  }


  return members.filter(
    function (member) {

      return activeStatuses.has(
        normalizeStatus(
          member.status
        )
      );

    }
  ).length;

}


/* =========================================================
   DASHBOARD METRICS
========================================================= */

function renderMemberMetrics(
  members
) {

  const totalMembers =
    members.length;


  const activeMembers =
    countActiveMembers(
      members
    );


  setText(
    "activeMembers",
    String(activeMembers)
  );


  setText(
    "membersCount",
    String(totalMembers)
  );

}


/* =========================================================
   SAFE SECTION LOADER
========================================================= */

async function runSection(
  name,
  loader
) {

  try {

    return await loader();

  }
  catch (error) {

    console.error(
      `CHAMA LIVE: ${name} failed`,
      error
    );

    return {
      __error:
        error?.message ||
        String(error)
    };

  }

}


/* =========================================================
   INITIALIZE DASHBOARD
========================================================= */

export async function initDashboard() {

  console.log(
    "CHAMA LIVE: initializing dashboard"
  );


  clearError();


  setStatus(
    "Loading dashboard..."
  );


  try {

    /* -----------------------------------------------------
       1. CONTEXT
    ----------------------------------------------------- */

    const groupId =
      await loadContext();


    /* -----------------------------------------------------
       2. MEMBERS
    ----------------------------------------------------- */

    const members =
      await loadMembers(
        groupId
      );


    renderMemberMetrics(
      members
    );


    /* -----------------------------------------------------
       3. CANONICAL MONTHLY STATUS
    ----------------------------------------------------- */

    const monthlyStatus =
      await runSection(
        "monthly status",
        function () {

          return loadMonthlyStatus(
            groupId
          );

        }
      );


    if (
      monthlyStatus &&
      !monthlyStatus.__error
    ) {

      const summary =
        calculateMonthlySummary(
          monthlyStatus
        );


      renderMonthlySummary(
        summary,
        members.length
      );


      renderMemberStatus(
        monthlyStatus
      );

    }
    else {

      const body =
        byId(
          "memberStatusRows"
        );


      if (body) {

        body.innerHTML = `
          <tr>
            <td colspan="7">
              Unable to load contribution status.
            </td>
          </tr>
        `;

      }


      console.error(
        "CHAMA LIVE: monthly status error",
        monthlyStatus?.__error
      );

    }


    /* -----------------------------------------------------
       4. CURRENT BALANCE
    ----------------------------------------------------- */

    const balanceResult =
      await runSection(
        "current balance",
        function () {

          return calculateCurrentBalance(
            groupId
          );

        }
      );


    if (
      typeof balanceResult ===
      "number"
    ) {

      setText(
        "currentBalance",
        money(
          balanceResult
        )
      );

    }


    /* -----------------------------------------------------
       5. RECENT CONTRIBUTIONS
    ----------------------------------------------------- */

    const recentContributions =
      await runSection(
        "recent contributions",
        function () {

          return loadRecentContributions(
            groupId
          );

        }
      );


    if (
      Array.isArray(
        recentContributions
      )
    ) {

      renderRecentContributions(
        recentContributions
      );

    }
    else {

      const body =
        byId(
          "recentContributionRows"
        );


      if (body) {

        body.innerHTML = `
          <tr>
            <td colspan="3">
              Unable to load recent contributions.
            </td>
          </tr>
        `;

      }

    }


    /* -----------------------------------------------------
       6. RECENT EXPENSES
    ----------------------------------------------------- */

    const recentExpenses =
      await runSection(
        "recent expenses",
        function () {

          return loadRecentExpenses(
            groupId
          );

        }
      );


    if (
      Array.isArray(
        recentExpenses
      )
    ) {

      renderRecentExpenses(
        recentExpenses
      );

    }
    else {

      const body =
        byId(
          "recentExpenseRows"
        );


      if (body) {

        body.innerHTML = `
          <tr>
            <td colspan="3">
              Unable to load recent expenses.
            </td>
          </tr>
        `;

      }

    }


    /* -----------------------------------------------------
       7. UPCOMING MEETINGS
    ----------------------------------------------------- */

    const meetings =
      await runSection(
        "upcoming meetings",
        function () {

          return loadUpcomingMeetings(
            groupId
          );

        }
      );


    if (
      Array.isArray(
        meetings
      )
    ) {

      renderUpcomingMeetings(
        meetings
      );

    }
    else {

      const body =
        byId(
          "upcomingMeetingRows"
        );


      if (body) {

        body.innerHTML = `
          <tr>
            <td colspan="4">
              Unable to load upcoming meetings.
            </td>
          </tr>
        `;

      }

    }


    /* -----------------------------------------------------
       COMPLETE
    ----------------------------------------------------- */

    setStatus(
      "Dashboard loaded."
    );


    console.log(
      "CHAMA LIVE: dashboard initialized successfully"
    );

  }
  catch (error) {

    console.error(
      "CHAMA LIVE: dashboard initialization failed",
      error
    );


    showError(
      error?.message ||
      "Dashboard could not be loaded."
    );


    setStatus(
      "Dashboard could not be loaded."
    );

  }

}


/* =========================================================
   OPTIONAL GENERIC INIT
========================================================= */

export async function init() {

  return initDashboard();

}


console.log(
  "CHAMA LIVE: dashboard.js ready"
);
