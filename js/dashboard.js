/* =========================================================
   CHAMA LIVE — DASHBOARD
   COMPLETE STABLE VERSION
   ---------------------------------------------------------
   Dashboard is READ-ONLY.

   BOOT MODEL
   ---------------------------------------------------------
   layout.js owns authentication and resolves:

       authenticated user
              ↓
       current member
              ↓
       current group
              ↓
       dashboard initializer

   Therefore this file MUST NOT use:
       DOMContentLoaded
       requireAuth()
       getMyMember()
       getMyGroup()

   Instead layout.js calls:

       initDashboard()

   CANONICAL ACCOUNTING RPC
   ---------------------------------------------------------
   public.get_canonical_member_monthly_status(
       p_group_id uuid,
       p_month text
   )

   Live verified signature:

       get_canonical_member_monthly_status(uuid,text)

   RPC returns:

       member_id
       member_number
       member_name
       monthly_due
       previous_outstanding
       previous_credit
       current_month_payment
       applied_this_month
       carry_forward
       current_outstanding
       total_paid_to_date
       total_due_to_date
       status

   IMPORTANT
   ---------------------------------------------------------
   This dashboard does NOT independently calculate:

       arrears
       allocation
       carry-forward
       current outstanding

   It displays the canonical RPC result.

   MEETINGS
   ---------------------------------------------------------
   Live meetings table uses:

       meetings.date

   NOT:

       meetings.meeting_date

   SECURITY
   ---------------------------------------------------------
   group_id comes ONLY from layout.js:

       getLayoutState().group.id

   No group_id is accepted from:
       URL
       localStorage
       query parameters
       forms
========================================================= */


import {
  supabase
} from "./supabase.js";

import {
  money,
  setText,
  showError,
  clearError
} from "./auth.js";

import {
  getLayoutState
} from "./layout.js";


console.log(
  "CHAMA LIVE: dashboard.js loaded"
);


/* =========================================================
   STATE
========================================================= */

let initialized = false;

let currentMember = null;
let currentGroup = null;

let groupMembers = [];
let activeMembers = [];

let monthlyStatusRows = [];


/* =========================================================
   DOM HELPER
========================================================= */

function byId(id) {

  return document.getElementById(id);

}


/* =========================================================
   SAFE TEXT
========================================================= */

function safeText(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return "—";

  }

  return String(value);

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


/* =========================================================
   NUMBER HELPERS
========================================================= */

function numberValue(value) {

  const number = Number(value);

  if (!Number.isFinite(number)) {

    return 0;

  }

  return number;

}


function roundMoney(value) {

  return Math.round(
    (
      numberValue(value) +
      Number.EPSILON
    ) * 100
  ) / 100;

}


function percentage(
  numerator,
  denominator
) {

  const top =
    numberValue(numerator);

  const bottom =
    numberValue(denominator);

  if (bottom <= 0) {

    return 0;

  }

  return Math.min(
    100,
    Math.max(
      0,
      (top / bottom) * 100
    )
  );

}


/* =========================================================
   CURRENT MONTH
   ---------------------------------------------------------
   Returns YYYY-MM.
========================================================= */

function getCurrentMonth() {

  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}`;

}


/* =========================================================
   FORMAT MONTH
========================================================= */

function formatMonth(value) {

  if (!value) {

    return "Current month";

  }

  const raw =
    String(value);

  const date =
    new Date(
      `${raw}-01T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return safeText(value);

  }

  return date.toLocaleDateString(
    "en-KE",
    {
      month: "long",
      year: "numeric"
    }
  );

}


/* =========================================================
   FORMAT DATE
========================================================= */

function formatDate(value) {

  if (!value) {

    return "—";

  }

  const raw =
    String(value);

  /*
   * PostgreSQL DATE must not be converted
   * through UTC because that can shift the
   * displayed calendar day.
   */

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(raw)
  ) {

    const [
      year,
      month,
      day
    ] =
      raw.split("-");

    return `${day}/${month}/${year}`;

  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return safeText(value);

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
   MEMBER NAME
========================================================= */

function getMemberName(member) {

  if (!member) {

    return "Unknown member";

  }

  return (
    member.name ||
    member.full_name ||
    member.member_name ||
    member.email ||
    "Unknown member"
  );

}


/* =========================================================
   FIND MEMBER NAME
========================================================= */

function findMemberName(memberId) {

  if (!memberId) {

    return "Unknown member";

  }

  const member =
    groupMembers.find(
      item =>
        item.id === memberId
    );

  if (!member) {

    return "Unknown member";

  }

  return getMemberName(member);

}


/* =========================================================
   STATUS CLASS
========================================================= */

function statusClass(status) {

  const value =
    String(status || "")
      .trim()
      .toLowerCase();

  switch (value) {

    case "credit":
      return "status-credit";

    case "paid":
      return "status-paid";

    case "cleared":
      return "status-cleared";

    case "partial":
      return "status-partial";

    case "pending":
      return "status-pending";

    case "outstanding":
      return "status-outstanding";

    default:
      return "status-neutral";

  }

}


/* =========================================================
   STATUS LABEL
========================================================= */

function statusLabel(status) {

  if (!status) {

    return "—";

  }

  const value =
    String(status)
      .trim();

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );

}


/* =========================================================
   SET PAGE STATUS
========================================================= */

function setPageStatus(message) {

  const element =
    byId("status");

  if (!element) {

    return;

  }

  element.textContent =
    message || "";

}


/* =========================================================
   RENDER GROUP HEADER
========================================================= */

function renderGroupHeader() {

  setText(
    "[data-group-name]",
    currentGroup?.name ||
      currentGroup?.group_name ||
      "CHAMA"
  );

  setText(
    "[data-user-name]",
    getMemberName(
      currentMember
    )
  );

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  if (!currentGroup?.id) {

    throw new Error(
      "Current group could not be resolved."
    );

  }

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(`
        id,
        group_id,
        name,
        status,
        onboarding_status,
        member_number,
        membership_number,
        created_at
      `)
      .eq(
        "group_id",
        currentGroup.id
      )
      .order(
        "created_at",
        {
          ascending: true
        }
      );

  if (error) {

    throw error;

  }

  groupMembers =
    Array.isArray(data)
      ? data
      : [];

  activeMembers =
    groupMembers.filter(
      member => {

        const status =
          String(
            member.status || ""
          )
            .trim()
            .toLowerCase();

        const onboarding =
          String(
            member.onboarding_status || ""
          )
            .trim()
            .toLowerCase();

        /*
         * Compatible with existing CHAMA LIVE
         * member records.
         */

        return (
          status === "active" &&
          (
            !onboarding ||
            onboarding === "active" ||
            onboarding === "approved"
          )
        );

      }
    );

  setText(
    "#activeMembers",
    activeMembers.length
  );

  setText(
    "#membersCount",
    groupMembers.length
  );

  return groupMembers;

}


/* =========================================================
   NORMALIZE CANONICAL ACCOUNTING ROW
========================================================= */

function normalizeContributionRow(row) {

  let status =
    row.status;

  /*
   * The database RPC is authoritative.
   *
   * Fallback is only for a missing status.
   */

  if (!status) {

    const carryForward =
      numberValue(
        row.carry_forward
      );

    const outstanding =
      numberValue(
        row.current_outstanding
      );

    const applied =
      numberValue(
        row.applied_this_month
      );

    const monthlyDue =
      numberValue(
        row.monthly_due
      );

    if (
      carryForward > 0
    ) {

      status = "credit";

    }
    else if (
      outstanding <= 0 &&
      applied >= monthlyDue &&
      monthlyDue > 0
    ) {

      status = "paid";

    }
    else if (
      applied > 0
    ) {

      status = "partial";

    }
    else {

      status = "outstanding";

    }

  }

  return {

    memberId:
      row.member_id,

    memberNumber:
      row.member_number,

    memberName:
      row.member_name ||
      findMemberName(
        row.member_id
      ),

    monthlyDue:
      roundMoney(
        row.monthly_due
      ),

    previousOutstanding:
      roundMoney(
        row.previous_outstanding
      ),

    previousCredit:
      roundMoney(
        row.previous_credit
      ),

    currentMonthPayment:
      roundMoney(
        row.current_month_payment
      ),

    appliedThisMonth:
      roundMoney(
        row.applied_this_month
      ),

    carryForward:
      roundMoney(
        row.carry_forward
      ),

    currentOutstanding:
      roundMoney(
        row.current_outstanding
      ),

    totalPaidToDate:
      roundMoney(
        row.total_paid_to_date
      ),

    totalDueToDate:
      roundMoney(
        row.total_due_to_date
      ),

    status:
      String(status)
        .trim()
        .toLowerCase()

  };

}


/* =========================================================
   LOAD CANONICAL MONTHLY STATUS
========================================================= */

async function loadMonthlyContributionStatus() {

  if (!currentGroup?.id) {

    throw new Error(
      "Current group could not be resolved."
    );

  }

  const month =
    getCurrentMonth();

  /*
   * CRITICAL:
   *
   * Live database signature:
   *
   * get_canonical_member_monthly_status(
   *     p_group_id uuid,
   *     p_month text
   * )
   *
   * NOT:
   *
   * p_month_start
   */

  console.log(
    "CHAMA LIVE: calling canonical monthly RPC",
    {
      function:
        "get_canonical_member_monthly_status",

      p_group_id:
        currentGroup.id,

      p_month:
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
          currentGroup.id,

        p_month:
          month
      }
    );

  if (error) {

    console.error(
      "CHAMA LIVE: canonical monthly RPC failed",
      error
    );

    throw error;

  }

  monthlyStatusRows =
    Array.isArray(data)
      ? data
      : [];

  renderMonthlyContributionStatus(
    monthlyStatusRows,
    month
  );

  return monthlyStatusRows;

}


/* =========================================================
   RENDER MONTHLY STATUS
========================================================= */

function renderMonthlyContributionStatus(
  rawRows,
  month
) {

  const rows =
    rawRows.map(
      normalizeContributionRow
    );

  const tbody =
    byId(
      "memberStatusRows"
    );

  setText(
    "#progressMonth",
    formatMonth(month)
  );

  if (!tbody) {

    updateContributionSummary(
      rows
    );

    return;

  }

  if (
    rows.length === 0
  ) {

    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          No member contribution status is available for this month.
        </td>
      </tr>
    `;

    updateContributionSummary(
      rows
    );

    return;

  }

  tbody.innerHTML =
    rows
      .map(
        row => {

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

        }
      )
      .join("");

  updateContributionSummary(
    rows
  );

}


/* =========================================================
   CONTRIBUTION SUMMARY
========================================================= */

function updateContributionSummary(rows) {

  /*
   * Monthly expected comes directly from
   * canonical monthly_due.
   */

  const monthlyExpected =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        numberValue(
          row.monthlyDue
        ),
      0
    );

  /*
   * Monthly applied comes directly from
   * canonical applied_this_month.
   */

  const monthlyApplied =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        numberValue(
          row.appliedThisMonth
        ),
      0
    );

  /*
   * Carry-forward comes directly from
   * canonical carry_forward.
   */

  const carryForward =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        numberValue(
          row.carryForward
        ),
      0
    );

  /*
   * Outstanding comes directly from
   * canonical current_outstanding.
   */

  const outstanding =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        numberValue(
          row.currentOutstanding
        ),
      0
    );

  /*
   * Participation is based on actual
   * current-month payment.
   */

  const contributors =
    rows.filter(
      row =>
        numberValue(
          row.currentMonthPayment
        ) > 0
    ).length;

  const memberCount =
    rows.length;

  const collectionRate =
    percentage(
      monthlyApplied,
      monthlyExpected
    );

  const participationRate =
    percentage(
      contributors,
      memberCount
    );

  setText(
    "#monthlyExpected",
    money(
      monthlyExpected
    )
  );

  setText(
    "#monthlyCollected",
    money(
      monthlyApplied
    )
  );

  setText(
    "#monthlyOutstanding",
    money(
      outstanding
    )
  );

  setText(
    "#contributorsCount",
    `${contributors} / ${memberCount}`
  );

  setText(
    "#contributorsPercentage",
    `${Math.round(
      participationRate
    )}%`
  );

  setText(
    "#progressPercentage",
    `${Math.round(
      collectionRate
    )}%`
  );

  setText(
    "#progressText",
    `${money(
      monthlyApplied
    )} / ${money(
      monthlyExpected
    )}`
  );

  setText(
    "#progressApplied",
    money(
      monthlyApplied
    )
  );

  setText(
    "#progressCarryForward",
    money(
      carryForward
    )
  );

  setText(
    "#progressOutstanding",
    money(
      outstanding
    )
  );

  const progressBar =
    byId(
      "progressBar"
    );

  if (progressBar) {

    progressBar.style.width =
      `${collectionRate}%`;

    progressBar.setAttribute(
      "aria-valuenow",
      String(
        Math.round(
          collectionRate
        )
      );

  }

}


/* =========================================================
   LOAD GROUP BALANCE
========================================================= */

async function loadGroupBalance() {

  if (!currentGroup?.id) {

    throw new Error(
      "Current group could not be resolved."
    );

  }

  /*
   * Contributions received.
   */

  const contributionResult =
    await supabase
      .from("contributions")
      .select(
        "amount"
      )
      .eq(
        "group_id",
        currentGroup.id
      );

  if (
    contributionResult.error
  ) {

    throw contributionResult.error;

  }

  const totalContributions =
    (
      contributionResult.data || []
    )
      .reduce(
        (
          total,
          row
        ) =>
          total +
          numberValue(
            row.amount
          ),
        0
      );

  /*
   * Approved expenses only.
   */

  const expenseResult =
    await supabase
      .from("expenses")
      .select(
        "amount, approval_status"
      )
      .eq(
        "group_id",
        currentGroup.id
      );

  if (
    expenseResult.error
  ) {

    throw expenseResult.error;

  }

  const approvedExpenses =
    (
      expenseResult.data || []
    )
      .filter(
        expense =>
          String(
            expense.approval_status || ""
          )
            .trim()
            .toLowerCase() ===
          "approved"
      )
      .reduce(
        (
          total,
          expense
        ) =>
          total +
          numberValue(
            expense.amount
          ),
        0
      );

  const openingBalance =
    numberValue(
      currentGroup.opening_balance
    );

  const balance =
    roundMoney(
      openingBalance +
      totalContributions -
      approvedExpenses
    );

  setText(
    "#currentBalance",
    money(
      balance
    )
  );

  return {

    openingBalance,

    totalContributions,

    approvedExpenses,

    balance

  };

}


/* =========================================================
   LOAD RECENT CONTRIBUTIONS
========================================================= */

async function loadRecentContributions() {

  if (!currentGroup?.id) {

    throw new Error(
      "Current group could not be resolved."
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
        contribution_date,
        created_at
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
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(
        10
      );

  if (error) {

    throw error;

  }

  const rows =
    Array.isArray(data)
      ? data
      : [];

  const tbody =
    byId(
      "recentContributionRows"
    );

  if (!tbody) {

    return rows;

  }

  if (
    rows.length === 0
  ) {

    tbody.innerHTML = `
      <tr>
        <td colspan="3">
          No contributions recorded yet.
        </td>
      </tr>
    `;

    return rows;

  }

  tbody.innerHTML =
    rows
      .map(
        row => {

          return `
            <tr>

              <td>
                ${escapeHtml(
                  findMemberName(
                    row.member_id
                  )
                )}
              </td>

              <td>
                ${money(
                  row.amount
                )}
              </td>

              <td>
                ${formatDate(
                  row.contribution_date ||
                  row.created_at
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

  return rows;

}


/* =========================================================
   LOAD RECENT EXPENSES
========================================================= */

async function loadRecentExpenses() {

  if (!currentGroup?.id) {

    throw new Error(
      "Current group could not be resolved."
    );

  }

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
        date,
        approval_status,
        created_at
      `)
      .eq(
        "group_id",
        currentGroup.id
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
      .limit(
        10
      );

  if (error) {

    throw error;

  }

  const rows =
    Array.isArray(data)
      ? data
      : [];

  const tbody =
    byId(
      "recentExpenseRows"
    );

  if (!tbody) {

    return rows;

  }

  if (
    rows.length === 0
  ) {

    tbody.innerHTML = `
      <tr>
        <td colspan="3">
          No expenses recorded yet.
        </td>
      </tr>
    `;

    return rows;

  }

  tbody.innerHTML =
    rows
      .map(
        row => {

          const status =
            String(
              row.approval_status ||
              "pending"
            )
              .trim()
              .toLowerCase();

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
                    status
                  )}"
                >
                  ${escapeHtml(
                    statusLabel(
                      status
                    )
                  )}
                </span>
              </td>

            </tr>
          `;

        }
      )
      .join("");

  return rows;

}


/* =========================================================
   LOAD UPCOMING MEETINGS
========================================================= */

async function loadUpcomingMeetings() {

  if (!currentGroup?.id) {

    throw new Error(
      "Current group could not be resolved."
    );

  }

  /*
   * LIVE SCHEMA:
   *
   * meetings.date
   *
   * NOT:
   *
   * meetings.meeting_date
   */

  const now =
    new Date();

  const today =
    [
      now.getFullYear(),

      String(
        now.getMonth() + 1
      ).padStart(
        2,
        "0"
      ),

      String(
        now.getDate()
      ).padStart(
        2,
        "0"
      )
    ].join("-");

  const {
    data,
    error
  } =
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
        currentGroup.id
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
      .limit(
        10
      );

  if (error) {

    throw error;

  }

  const rows =
    Array.isArray(data)
      ? data
      : [];

  const tbody =
    byId(
      "upcomingMeetingRows"
    );

  if (!tbody) {

    return rows;

  }

  if (
    rows.length === 0
  ) {

    tbody.innerHTML = `
      <tr>
        <td colspan="4">
          No upcoming meetings scheduled.
        </td>
      </tr>
    `;

    return rows;

  }

  tbody.innerHTML =
    rows
      .map(
        row => {

          const status =
            String(
              row.status ||
              "scheduled"
            )
              .trim()
              .toLowerCase();

          return `
            <tr>

              <td>
                ${formatDate(
                  row.date
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
                    status
                  )}"
                >
                  ${escapeHtml(
                    statusLabel(
                      status
                    )
                  )}
                </span>
              </td>

            </tr>
          `;

        }
      )
      .join("");

  return rows;

}


/* =========================================================
   SECTION ERROR
========================================================= */

function renderSectionError(
  elementId,
  message,
  colspan
) {

  if (!elementId) {

    return;

  }

  const element =
    byId(elementId);

  if (!element) {

    return;

  }

  element.innerHTML = `
    <tr>
      <td colspan="${colspan}">
        <span class="muted">
          ${escapeHtml(
            message
          )}
        </span>
      </td>
    </tr>
  `;

}


/* =========================================================
   RUN SECTION SAFELY
========================================================= */

async function runSection(
  name,
  loader,
  errorElementId,
  colspan
) {

  try {

    return await loader();

  }

  catch (error) {

    console.error(
      `CHAMA LIVE: ${name} failed`,
      error
    );

    renderSectionError(
      errorElementId,
      `${name} could not be loaded.`,
      colspan
    );

    return null;

  }

}


/* =========================================================
   LOAD DASHBOARD DATA
========================================================= */

async function loadDashboardData() {

  /*
   * Layout.js has already authenticated the
   * user and resolved the current member/group.
   */

  const layoutState =
    getLayoutState();

  currentMember =
    layoutState?.member ||
    null;

  currentGroup =
    layoutState?.group ||
    null;

  if (!currentMember) {

    throw new Error(
      "No member record is linked to this account."
    );

  }

  if (!currentGroup?.id) {

    throw new Error(
      "Your current group could not be resolved."
    );

  }

  console.log(
    "CHAMA LIVE: dashboard context",
    {
      memberId:
        currentMember.id,

      groupId:
        currentGroup.id,

      groupName:
        currentGroup.name
    }
  );

  renderGroupHeader();

  /*
   * Members must load first because recent
   * contribution names depend on the member map.
   */

  await loadMembers();

  /*
   * Remaining sections are independent.
   */

  const sections = [

    runSection(
      "Monthly contribution accounting",
      loadMonthlyContributionStatus,
      "memberStatusRows",
      7
    ),

    runSection(
      "Group balance",
      loadGroupBalance,
      null,
      0
    ),

    runSection(
      "Recent contributions",
      loadRecentContributions,
      "recentContributionRows",
      3
    ),

    runSection(
      "Recent expenses",
      loadRecentExpenses,
      "recentExpenseRows",
      3
    ),

    runSection(
      "Upcoming meetings",
      loadUpcomingMeetings,
      "upcomingMeetingRows",
      4
    )

  ];

  const results =
    await Promise.all(
      sections
    );

  const failed =
    results.some(
      result =>
        result === null
    );

  if (failed) {

    setPageStatus(
      "Dashboard loaded with some unavailable sections."
    );

  }
  else {

    setPageStatus("");

  }

}


/* =========================================================
   PUBLIC INITIALIZER
   ---------------------------------------------------------
   layout.js calls this function.
========================================================= */

export async function initDashboard() {

  /*
   * Prevent duplicate initialization.
   */

  if (initialized) {

    console.log(
      "CHAMA LIVE: dashboard already initialized"
    );

    return;

  }

  initialized = true;

  clearError();

  setPageStatus(
    "Loading dashboard..."
  );

  try {

    await loadDashboardData();

    console.log(
      "CHAMA LIVE: dashboard initialized successfully"
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: dashboard initialization failed",
      error
    );

    initialized = false;

    setPageStatus(
      "Dashboard failed to load."
    );

    showError(
      error
    );

  }

}


/* =========================================================
   OPTIONAL GENERIC INITIALIZER
   ---------------------------------------------------------
   Supports layout.js implementations that use
   initPage().
========================================================= */

export async function initPage() {

  return initDashboard();

}


/* =========================================================
   PUBLIC REFRESH
========================================================= */

export async function refreshDashboard() {

  initialized = false;

  return initDashboard();

}


/* =========================================================
   DEBUG
========================================================= */

console.log(
  "CHAMA LIVE: dashboard.js ready"
);
