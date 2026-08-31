/* =========================================================
   CHAMA LIVE — DASHBOARD
   COMPLETE STABLE VERSION

   IMPORTANT
   ---------------------------------------------------------
   1. No contributions -> members embedded relationship.
   2. expenses uses approval_status, NOT status.
   3. Monthly member accounting uses:
        get_canonical_member_monthly_status()
   4. Dashboard queries are group-scoped.
   5. Contribution/member data are loaded separately.
   6. No database/schema changes are made here.
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


function number(value) {

  return Number(value || 0);

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


function setText(id, value) {

  const element =
    byId(id);

  if (element) {
    element.textContent = value;
  }

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

  if (errorBox) {

    errorBox.hidden =
      true;

    errorBox.textContent =
      "";

  }

}


/* =========================================================
   GROUP / MEMBER
========================================================= */

async function loadContext() {

  currentMember =
    await getCurrentMember();

  if (!currentMember) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  currentGroup =
    await getCurrentGroup();

  if (!currentGroup) {

    throw new Error(
      "Group information could not be found."
    );

  }


  if (!currentMember.group_id) {

    throw new Error(
      "Your member record has no group."
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


  return {
    groupId
  };

}


/* =========================================================
   LOAD MEMBERS
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
   LOAD MONTHLY CANONICAL STATUS
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
    await supabase
      .rpc(
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
   RENDER MEMBER STATUS
========================================================= */

function renderMemberStatus(rows) {

  const tableBody =
    document.querySelector(
      "#memberStatusBody"
    );


  if (!tableBody) {

    console.warn(
      "CHAMA LIVE: #memberStatusBody not found"
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
          row.status || "Outstanding"
        );


      const normalized =
        status.toLowerCase();


      let statusClass =
        "status-neutral";


      if (
        normalized === "paid" ||
        normalized === "cleared"
      ) {

        statusClass =
          "status-paid";

      }
      else if (
        normalized === "credit"
      ) {

        statusClass =
          "status-credit";

      }
      else if (
        normalized === "partial"
      ) {

        statusClass =
          "status-partial";

      }
      else if (
        normalized === "outstanding"
      ) {

        statusClass =
          "status-outstanding";

      }


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
              class="status-badge ${statusClass}"
            >
              ${escapeHtml(status)}
            </span>
          </td>

        </tr>
      `;

    }).join("");

}


/* =========================================================
   CALCULATE MONTHLY SUMMARY
========================================================= */

function calculateMonthlySummary(rows) {

  let monthlyDue = 0;
  let appliedThisMonth = 0;
  let carryForward = 0;
  let outstanding = 0;
  let previousOutstanding = 0;
  let contributedMembers = 0;


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


    const previous =
      number(
        row.previous_outstanding
      );


    monthlyDue +=
      due;


    appliedThisMonth +=
      applied;


    carryForward +=
      credit;


    outstanding +=
      currentOutstanding;


    previousOutstanding +=
      previous;


    /*
     * A member counts as contributed
     * when money was actually applied
     * toward their current obligation.
     */

    if (applied > 0) {

      contributedMembers++;

    }

  });


  return {

    monthlyDue,

    appliedThisMonth,

    carryForward,

    outstanding,

    previousOutstanding,

    contributedMembers

  };

}


/* =========================================================
   RENDER MONTHLY SUMMARY
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
    "membersContributed",
    `${summary.contributedMembers} / ${totalMembers}`
  );


  setText(
    "currentOutstanding",
    money(
      summary.outstanding
    )
  );


  setText(
    "appliedThisMonth",
    money(
      summary.appliedThisMonth
    )
  );


  setText(
    "carryForwardCredit",
    money(
      summary.carryForward
    )
  );


  setText(
    "outstandingAmount",
    money(
      summary.outstanding
    )
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
    "contributionPercentage",
    `${Math.round(safeRate)}%`
  );


  const progressBar =
    byId("contributionProgress");


  if (progressBar) {

    progressBar.style.width =
      `${safeRate}%`;

  }


  setText(
    "contributionAppliedDisplay",
    `${money(summary.appliedThisMonth)} / ${money(summary.monthlyDue)}`
  );


  const participation =
    totalMembers > 0
      ? (
          summary.contributedMembers /
          totalMembers
        ) * 100
      : 0;


  setText(
    "memberParticipation",
    `${Math.round(participation)}%`
  );


  setText(
    "memberParticipationCount",
    `${summary.contributedMembers} / ${totalMembers}`
  );

}


/* =========================================================
   LOAD RECENT CONTRIBUTIONS
   ---------------------------------------------------------
   IMPORTANT:
   Do NOT use:
       members(...)
   here.

   There are multiple relationships between
   contributions and members.

   We therefore:
       1. fetch contributions only
       2. fetch required member names separately
========================================================= */

async function loadRecentContributions(groupId) {

  const {
    data: contributions,
    error
  } =
    await supabase
      .from("contributions")
      .select(
        "id,member_id,amount,contribution_date,created_at"
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
    return rows;
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
========================================================= */

function renderRecentContributions(rows) {

  const body =
    document.querySelector(
      "#recentContributionsBody"
    );


  if (!body) {
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
              row.member_name
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
   LOAD RECENT EXPENSES
   ---------------------------------------------------------
   Correct schema column:
       approval_status

   NOT:
       status
========================================================= */

async function loadRecentExpenses(groupId) {

  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .select(
        "id,description,amount,date,approval_status"
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
========================================================= */

function renderRecentExpenses(rows) {

  const body =
    document.querySelector(
      "#recentExpensesBody"
    );


  if (!body) {
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
        String(status)
          .toLowerCase();


      let statusClass =
        "status-neutral";


      if (
        normalized === "approved"
      ) {

        statusClass =
          "status-paid";

      }
      else if (
        normalized === "pending"
      ) {

        statusClass =
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
              class="status-badge ${statusClass}"
            >
              ${escapeHtml(status)}
            </span>

          </td>

        </tr>
      `;

    }).join("");

}


/* =========================================================
   LOAD UPCOMING MEETINGS
========================================================= */

async function loadUpcomingMeetings(groupId) {

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
      .select(
        "id,title,date,venue,status"
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
   RENDER UPCOMING MEETINGS
========================================================= */

function renderUpcomingMeetings(rows) {

  const body =
    document.querySelector(
      "#upcomingMeetingsBody"
    );


  if (!body) {
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

      return `
        <tr>

          <td>
            ${escapeHtml(
              formatDate(row.date)
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
              class="status-badge status-neutral"
            >
              ${escapeHtml(
                row.status ||
                "Scheduled"
              )}
            </span>
          </td>

        </tr>
      `;

    }).join("");

}


/* =========================================================
   FORMAT DATE
========================================================= */

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
   LOAD GROUP BALANCE
   ---------------------------------------------------------
   Balance =
       received contributions
       -
       approved expenses

   This is a dashboard cash balance.
   It is separate from monthly obligation status.
========================================================= */

async function loadCurrentBalance(groupId) {

  const [
    contributionsResult,
    expensesResult
  ] =
    await Promise.all([

      supabase
        .from("contributions")
        .select(
          "amount"
        )
        .eq(
          "group_id",
          groupId
        ),

      supabase
        .from("expenses")
        .select(
          "amount"
        )
        .eq(
          "group_id",
          groupId
        )
        .eq(
          "approval_status",
          "approved"
        )

    ]);


  if (
    contributionsResult.error
  ) {

    throw contributionsResult.error;

  }


  if (
    expensesResult.error
  ) {

    throw expensesResult.error;

  }


  const contributionTotal =
    (
      contributionsResult.data ||
      []
    ).reduce(
      function (sum, row) {

        return (
          sum +
          number(row.amount)
        );

      },
      0
    );


  const expenseTotal =
    (
      expensesResult.data ||
      []
    ).reduce(
      function (sum, row) {

        return (
          sum +
          number(row.amount)
        );

      },
      0
    );


  return (
    contributionTotal -
    expenseTotal
  );

}


/* =========================================================
   RENDER MEMBER COUNTS
========================================================= */

function renderMemberCounts(members) {

  const total =
    members.length;


  const active =
    members.filter(
      function (member) {

        return (
          String(
            member.status ||
            ""
          ).toLowerCase() ===
          "active"
        );

      }
    ).length;


  setText(
    "activeMembers",
    active
  );


  setText(
    "membersCount",
    total
  );


  return {
    total,
    active
  };

}


/* =========================================================
   DASHBOARD LOAD
========================================================= */

async function loadDashboard() {

  clearError();


  setStatus(
    "Loading dashboard..."
  );


  try {

    /*
     * 1. Get current group/member context.
     */

    const {
      groupId
    } =
      await loadContext();


    /*
     * 2. Load independent data sets.
     *
     * Promise.all is safe because none of
     * these queries uses an ambiguous
     * contributions -> members embed.
     */

    const [
      members,
      monthlyStatus,
      recentContributions,
      recentExpenses,
      upcomingMeetings,
      currentBalance
    ] =
      await Promise.all([

        loadMembers(
          groupId
        ),

        loadMonthlyStatus(
          groupId
        ),

        loadRecentContributions(
          groupId
        ),

        loadRecentExpenses(
          groupId
        ),

        loadUpcomingMeetings(
          groupId
        ),

        loadCurrentBalance(
          groupId
        )

      ]);


    /*
     * 3. Members.
     */

    const memberSummary =
      renderMemberCounts(
        members
      );


    /*
     * 4. Canonical monthly status.
     */

    renderMemberStatus(
      monthlyStatus
    );


    const summary =
      calculateMonthlySummary(
        monthlyStatus
      );


    renderMonthlySummary(
      summary,
      memberSummary.total
    );


    /*
     * 5. Recent contributions.
     */

    renderRecentContributions(
      recentContributions
    );


    /*
     * 6. Recent expenses.
     */

    renderRecentExpenses(
      recentExpenses
    );


    /*
     * 7. Upcoming meetings.
     */

    renderUpcomingMeetings(
      upcomingMeetings
    );


    /*
     * 8. Group balance.
     */

    setText(
      "currentBalance",
      money(currentBalance)
    );


    /*
     * 9. Successful completion.
     */

    setStatus(
      "Dashboard loaded."
    );


    console.log(
      "CHAMA LIVE: dashboard loaded successfully",
      {
        members: members.length,
        monthlyStatus: monthlyStatus.length,
        recentContributions:
          recentContributions.length,
        recentExpenses:
          recentExpenses.length,
        upcomingMeetings:
          upcomingMeetings.length,
        currentBalance
      }
    );

  }
  catch (error) {

    console.error(
      "CHAMA LIVE: dashboard failed",
      error
    );


    setStatus(
      "Dashboard could not be loaded."
    );


    showError(
      error?.message ||
      "Unable to load dashboard."
    );

  }

}


/* =========================================================
   PUBLIC INITIALIZER
========================================================= */

export async function initDashboard() {

  console.log(
    "CHAMA LIVE: initDashboard()"
  );


  await loadDashboard();

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
