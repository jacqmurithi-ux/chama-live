/* =========================================================
   CHAMA LIVE — DASHBOARD
   CANONICAL CONTRIBUTION ACCOUNTING

   ARCHITECTURE
   ---------------------------------------------------------
   Authenticated Supabase session
          ↓
   get_my_member()
          ↓
   my_group_id()
          ↓
   get_canonical_member_monthly_status()
          ↓
   Dashboard

   IMPORTANT
   ---------------------------------------------------------
   This file MUST NOT independently calculate:

   - arrears
   - previous outstanding
   - previous credit
   - allocation
   - carry-forward
   - current outstanding
   - monthly payment application

   Those values belong to the canonical 2B database
   accounting engine.

   Dashboard is a presentation layer.
========================================================= */


import {
  supabase
} from "./supabase.js";


import {
  requireAuth,
  getMyMember,
  getMyGroup,
  getMyGroupId,
  money,
  clearError
} from "./auth.js";


console.log(
  "CHAMA LIVE: dashboard.js loaded"
);


/* =========================================================
   STATE
========================================================= */

let currentMember =
  null;

let currentGroup =
  null;

let currentGroupId =
  null;

let currentMonth =
  null;

let initialized =
  false;


/* =========================================================
   DOM HELPERS
========================================================= */

function byId(
  id
) {

  return document.getElementById(
    id
  );

}


function setText(
  id,
  value
) {

  const element =
    byId(id);


  if (element) {

    element.textContent =
      value ?? "—";

  }

}


function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}


function formatMoney(
  value
) {

  const amount =
    Number(
      value || 0
    );


  return money(
    Number.isFinite(
      amount
    )
      ? amount
      : 0
  );

}


function formatDate(
  value
) {

  if (!value) {
    return "—";
  }


  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return String(
      value
    );

  }


  return date.toLocaleDateString(
    "en-KE",
    {
      year:
        "numeric",

      month:
        "short",

      day:
        "numeric"
    }
  );

}


/* =========================================================
   ERROR
========================================================= */

function showDashboardError(
  error
) {

  console.error(
    "CHAMA LIVE: dashboard error",
    error
  );


  const element =
    byId("error");


  if (!element) {
    return;
  }


  let message =
    "Unable to load dashboard data.";


  if (
    typeof error ===
    "string"
  ) {

    message =
      error;

  }

  else if (
    error?.message
  ) {

    message =
      error.message;

  }


  element.textContent =
    message;

  element.hidden =
    false;

}


/* =========================================================
   STATUS
========================================================= */

function setLoadingStatus(
  message
) {

  setText(
    "status",
    message
  );

}


function setReadyStatus(
  message
) {

  setText(
    "status",
    message
  );

}


/* =========================================================
   CURRENT MONTH
========================================================= */

function getCurrentMonthKey() {

  const now =
    new Date();


  return [
    now.getFullYear(),
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    )
  ].join(
    "-"
  );

}


function formatMonthLabel(
  monthKey
) {

  if (
    !monthKey ||
    !/^\d{4}-\d{2}$/.test(
      monthKey
    )
  ) {

    return "Current month";

  }


  const [
    year,
    month
  ] =
    monthKey
      .split("-")
      .map(Number);


  const date =
    new Date(
      year,
      month - 1,
      1
    );


  return date.toLocaleDateString(
    "en-KE",
    {
      year:
        "numeric",

      month:
        "long"
    }
  );

}


/* =========================================================
   GROUP / USER HEADER
========================================================= */

function renderHeader() {

  const groupName =
    currentGroup?.name ||
    "CHAMA";


  const memberName =
    currentMember?.name ||
    "Member";


  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(
      element => {

        element.textContent =
          groupName;

      }
    );


  document
    .querySelectorAll(
      "[data-user-name]"
    )
    .forEach(
      element => {

        element.textContent =
          memberName;

      }
    );

}


/* =========================================================
   CANONICAL MEMBER STATUS
========================================================= */

/*
 * This is the central accounting call.
 *
 * It returns the canonical state generated from:
 *
 * obligation
 *      ↓
 * payment
 *      ↓
 * allocation
 *      ↓
 * arrears / credit
 *
 * No frontend reconstruction is performed.
 */

async function loadCanonicalMonthlyStatus() {

  if (!currentGroupId) {

    throw new Error(
      "No authenticated group is available."
    );

  }


  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_canonical_member_monthly_status",
      {
        p_group_id:
          currentGroupId,

        p_month:
          currentMonth
      }
    );


  if (error) {

    console.error(
      "CHAMA LIVE: canonical monthly status failed",
      error
    );

    throw error;

  }


  return data || [];

}


/* =========================================================
   CANONICAL STATUS NORMALIZATION
========================================================= */

function normalizeStatusRow(
  row
) {

  return {

    memberId:
      row?.member_id,

    memberNumber:
      row?.member_number ||
      "",

    memberName:
      row?.member_name ||
      "Member",

    monthlyDue:
      Number(
        row?.monthly_due ||
        0
      ),

    previousOutstanding:
      Number(
        row?.previous_outstanding ||
        0
      ),

    previousCredit:
      Number(
        row?.previous_credit ||
        0
      ),

    currentMonthPayment:
      Number(
        row?.current_month_payment ||
        0
      ),

    appliedThisMonth:
      Number(
        row?.applied_this_month ||
        0
      ),

    carryForward:
      Number(
        row?.carry_forward ||
        0
      ),

    currentOutstanding:
      Number(
        row?.current_outstanding ||
        0
      ),

    totalPaidToDate:
      Number(
        row?.total_paid_to_date ||
        0
      ),

    totalDueToDate:
      Number(
        row?.total_due_to_date ||
        0
      ),

    status:
      String(
        row?.status ||
        "outstanding"
      )
        .trim()
        .toLowerCase()

  };

}


/* =========================================================
   RENDER MEMBER STATUS TABLE
========================================================= */

function renderMemberStatus(
  rows
) {

  const tbody =
    byId(
      "memberStatusRows"
    );


  if (!tbody) {
    return;
  }


  if (
    !rows ||
    rows.length === 0
  ) {

    tbody.innerHTML = `

      <tr>

        <td colspan="7">

          No active members found
          for this month.

        </td>

      </tr>

    `;

    return;

  }


  tbody.innerHTML =
    rows
      .map(
        row => {

          const status =
            row.status;


          let badgeClass =
            "status-neutral";


          let label =
            "Outstanding";


          if (
            status ===
            "paid"
          ) {

            badgeClass =
              "status-paid";

            label =
              "Paid";

          }

          else if (
            status ===
            "credit"
          ) {

            badgeClass =
              "status-credit";

            label =
              "Credit";

          }

          else if (
            status ===
            "partial"
          ) {

            badgeClass =
              "status-partial";

            label =
              "Partial";

          }

          else if (
            status ===
            "outstanding"
          ) {

            badgeClass =
              "status-outstanding";

            label =
              "Outstanding";

          }


          const previousOutstandingClass =
            row.previousOutstanding >
            0
              ? "outstanding-value"
              : "";


          const appliedClass =
            row.appliedThisMonth >
            0
              ? "applied-value"
              : "";


          const creditClass =
            row.carryForward >
            0
              ? "credit-value"
              : "";


          const outstandingClass =
            row.currentOutstanding >
            0
              ? "outstanding-value"
              : "";


          return `

            <tr>

              <td>

                ${escapeHtml(
                  row.memberName
                )}

              </td>


              <td>

                ${formatMoney(
                  row.monthlyDue
                )}

              </td>


              <td class="${previousOutstandingClass}">

                ${formatMoney(
                  row.previousOutstanding
                )}

              </td>


              <td class="${appliedClass}">

                ${formatMoney(
                  row.appliedThisMonth
                )}

              </td>


              <td class="${creditClass}">

                ${formatMoney(
                  row.carryForward
                )}

              </td>


              <td class="${outstandingClass}">

                ${formatMoney(
                  row.currentOutstanding
                )}

              </td>


              <td>

                <span
                  class="status-badge ${badgeClass}"
                >

                  ${escapeHtml(
                    label
                  )}

                </span>

              </td>

            </tr>

          `;

        }
      )
      .join(
        ""
      );

}


/* =========================================================
   RENDER CANONICAL SUMMARY
========================================================= */

function renderCanonicalSummary(
  rows
) {

  const normalizedRows =
    rows.map(
      normalizeStatusRow
    );


  const monthlyExpected =
    normalizedRows.reduce(
      (
        total,
        row
      ) =>
        total +
        row.monthlyDue,
      0
    );


  const monthlyApplied =
    normalizedRows.reduce(
      (
        total,
        row
      ) =>
        total +
        row.appliedThisMonth,
      0
    );


  const monthlyOutstanding =
    normalizedRows.reduce(
      (
        total,
        row
      ) =>
        total +
        row.currentOutstanding,
      0
    );


  const carryForward =
    normalizedRows.reduce(
      (
        total,
        row
      ) =>
        total +
        row.carryForward,
      0
    );


  const contributors =
    normalizedRows.filter(
      row =>
        row.appliedThisMonth >
        0
    ).length;


  const activeMemberCount =
    normalizedRows.length;


  const collectionRate =
    monthlyExpected >
    0
      ? (
          monthlyApplied /
          monthlyExpected
        ) *
        100
      : 0;


  const participationRate =
    activeMemberCount >
    0
      ? (
          contributors /
          activeMemberCount
        ) *
        100
      : 0;


  const safeCollectionRate =
    Math.max(
      0,
      Math.min(
        100,
        collectionRate
      )
    );


  setText(
    "activeMembers",
    activeMemberCount
  );


  /*
   * The canonical RPC's monthly_due is the authoritative
   * current-month obligation total.
   */

  setText(
    "monthlyExpected",
    formatMoney(
      monthlyExpected
    )
  );


  /*
   * Monthly Applied means allocations against the current
   * month's obligation — NOT raw cash received.
   */

  setText(
    "monthlyCollected",
    formatMoney(
      monthlyApplied
    )
  );


  setText(
    "contributorsCount",
    `${contributors} / ${activeMemberCount}`
  );


  setText(
    "contributorsPercentage",
    `${safeNumber(
      participationRate
    )}%`
  );


  setText(
    "monthlyOutstanding",
    formatMoney(
      monthlyOutstanding
    )
  );


  setText(
    "progressApplied",
    formatMoney(
      monthlyApplied
    )
  );


  setText(
    "progressCarryForward",
    formatMoney(
      carryForward
    )
  );


  setText(
    "progressOutstanding",
    formatMoney(
      monthlyOutstanding
    )
  );


  setText(
    "progressText",
    `${formatMoney(
      monthlyApplied
    )} / ${formatMoney(
      monthlyExpected
    )}`
  );


  setText(
    "progressPercentage",
    `${safeNumber(
      collectionRate
    )}%`
  );


  const progressBar =
    byId(
      "progressBar"
    );


  if (progressBar) {

    progressBar.style.width =
      `${safeNumber(
        safeCollectionRate
      )}%`;

  }


  const progressContainer =
    document.querySelector(
      ".progress[role='progressbar']"
    );


  if (
    progressContainer
  ) {

    progressContainer.setAttribute(
      "aria-valuenow",
      String(
        safeNumber(
          safeCollectionRate
        )
      )
    );

  }


  setText(
    "progressMonth",
    formatMonthLabel(
      currentMonth
    )
  );


  renderMemberStatus(
    normalizedRows
  );


  return normalizedRows;

}


/* =========================================================
   NUMBER FORMAT
========================================================= */

function safeNumber(
  value
) {

  const number =
    Number(
      value || 0
    );


  if (
    !Number.isFinite(
      number
    )
  ) {

    return "0";

  }


  return number
    .toLocaleString(
      "en-KE",
      {
        minimumFractionDigits:
          0,

        maximumFractionDigits:
          2
      }
    );

}


/* =========================================================
   LOAD MEMBERS COUNT
========================================================= */

/*
 * The canonical monthly status already returns active members,
 * so we use that result for Dashboard accounting.
 *
 * This function exists only to populate total members, including
 * inactive members, without using it to calculate accounting.
 */

async function loadTotalMemberCount() {

  const {
    count,
    error
  } =
    await supabase
      .from("members")
      .select(
        "id",
        {
          count:
            "exact",
          head:
            true
        }
      )
      .eq(
        "group_id",
        currentGroupId
      );


  if (error) {

    console.warn(
      "CHAMA LIVE: total member count unavailable",
      error
    );

    return;

  }


  setText(
    "membersCount",
    count ?? 0
  );

}


/* =========================================================
   LOAD CONTRIBUTIONS
========================================================= */

/*
 * Raw contributions are used ONLY for:
 *
 * - recent activity
 * - current cash balance
 *
 * They are NOT used to reconstruct arrears or allocation.
 */

async function loadRecentContributions() {

  const {
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select("*")
      .eq(
        "group_id",
        currentGroupId
      )
      .order(
        "contribution_date",
        {
          ascending:
            false
        }
      )
      .order(
        "id",
        {
          ascending:
            false
        }
      )
      .limit(
        5
      );


  if (error) {
    throw error;
  }


  return data || [];

}


/* =========================================================
   CONTRIBUTION MEMBER NAMES
========================================================= */

async function loadMemberNameMap(
  memberIds
) {

  const ids =
    [
      ...new Set(
        memberIds
          .filter(Boolean)
          .map(
            id =>
              String(id)
          )
      )
    ];


  if (
    ids.length === 0
  ) {

    return {};

  }


  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(
        "id,name"
      )
      .in(
        "id",
        ids
      );


  if (error) {
    throw error;
  }


  const map = {};


  (
    data ||
    []
  ).forEach(
    member => {

      map[
        String(
          member.id
        )
      ] =
        member.name ||
        "Member";

    }
  );


  return map;

}


/* =========================================================
   RENDER RECENT CONTRIBUTIONS
========================================================= */

async function renderRecentContributions(
  contributions
) {

  const tbody =
    byId(
      "recentContributionRows"
    );


  if (!tbody) {
    return;
  }


  if (
    !contributions ||
    contributions.length === 0
  ) {

    tbody.innerHTML = `

      <tr>

        <td colspan="3">

          No contributions recorded yet.

        </td>

      </tr>

    `;

    return;

  }


  const memberIds =
    contributions.map(
      row =>
        row.member_id
    );


  const memberNames =
    await loadMemberNameMap(
      memberIds
    );


  tbody.innerHTML =
    contributions
      .map(
        contribution => {

          const memberName =
            memberNames[
              String(
                contribution.member_id
              )
            ] ||
            "Member";


          return `

            <tr>

              <td>

                ${escapeHtml(
                  memberName
                )}

              </td>


              <td>

                ${formatMoney(
                  contribution.amount
                )}

              </td>


              <td>

                ${formatDate(
                  contribution.contribution_date
                )}

              </td>

            </tr>

          `;

        }
      )
      .join(
        ""
      );

}


/* =========================================================
   TOTAL CASH CONTRIBUTIONS
========================================================= */

async function loadTotalCashContributions() {

  const {
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select(
        "amount"
      )
      .eq(
        "group_id",
        currentGroupId
      );


  if (error) {
    throw error;
  }


  return (
    data ||
    []
  )
    .reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.amount ||
          0
        ),
      0
    );

}


/* =========================================================
   LOAD EXPENSES
========================================================= */

async function loadExpenses() {

  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .select("*")
      .eq(
        "group_id",
        currentGroupId
      )
      .order(
        "created_at",
        {
          ascending:
            false
        }
      )
      .limit(
        5
      );


  if (error) {
    throw error;
  }


  return data || [];

}


/* =========================================================
   EXPENSE STATUS
========================================================= */

function getExpenseStatus(
  expense
) {

  const raw =
    expense?.status ??
    expense?.approval_status ??
    expense?.expense_status ??
    "";


  return String(
    raw ||
    "recorded"
  )
    .trim()
    .toLowerCase();

}


/* =========================================================
   EXPENSE DESCRIPTION
========================================================= */

function getExpenseDescription(
  expense
) {

  return (
    expense?.description ??
    expense?.expense_description ??
    expense?.name ??
    expense?.title ??
    "Expense"
  );

}


/* =========================================================
   EXPENSE AMOUNT
========================================================= */

function getExpenseAmount(
  expense
) {

  return Number(
    expense?.amount ||
    expense?.total_amount ||
    0
  );

}


/* =========================================================
   RENDER EXPENSES
========================================================= */

function renderRecentExpenses(
  expenses
) {

  const tbody =
    byId(
      "recentExpenseRows"
    );


  if (!tbody) {
    return;
  }


  if (
    !expenses ||
    expenses.length === 0
  ) {

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
    expenses
      .map(
        expense => {

          const status =
            getExpenseStatus(
              expense
            );


          let badgeClass =
            "status-neutral";


          if (
            status ===
            "approved"
          ) {

            badgeClass =
              "status-paid";

          }

          else if (
            status ===
            "pending"
          ) {

            badgeClass =
              "status-pending";

          }

          else if (
            status ===
            "rejected"
          ) {

            badgeClass =
              "status-outstanding";

          }


          return `

            <tr>

              <td>

                ${escapeHtml(
                  getExpenseDescription(
                    expense
                  )
                )}

              </td>


              <td>

                ${formatMoney(
                  getExpenseAmount(
                    expense
                  )
                )}

              </td>


              <td>

                <span
                  class="status-badge ${badgeClass}"
                >

                  ${escapeHtml(
                    status
                  )}

                </span>

              </td>

            </tr>

          `;

        }
      )
      .join(
        ""
      );

}


/* =========================================================
   APPROVED EXPENSE TOTAL
========================================================= */

async function loadApprovedExpenseTotal() {

  /*
   * Load rows instead of relying on a guessed status filter,
   * because existing deployments may use status or
   * approval_status.
   */

  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .select("*")
      .eq(
        "group_id",
        currentGroupId
      );


  if (error) {
    throw error;
  }


  return (
    data ||
    []
  )
    .filter(
      expense =>
        getExpenseStatus(
          expense
        ) ===
        "approved"
    )
    .reduce(
      (
        total,
        expense
      ) =>
        total +
        getExpenseAmount(
          expense
        ),
      0
    );

}


/* =========================================================
   CURRENT BALANCE
========================================================= */

async function renderCurrentBalance() {

  const [
    totalCash,
    approvedExpenses
  ] =
    await Promise.all([
      loadTotalCashContributions(),
      loadApprovedExpenseTotal()
    ]);


  /*
   * Cash balance is a cash-flow display metric.
   *
   * It is intentionally separate from canonical contribution
   * allocation accounting.
   */

  const openingBalance =
    Number(
      currentGroup?.opening_balance ||
      0
    );


  const balance =
    openingBalance +
    totalCash -
    approvedExpenses;


  setText(
    "currentBalance",
    formatMoney(
      balance
    )
  );

}


/* =========================================================
   LOAD MEETINGS
========================================================= */

async function loadMeetings() {

  const {
    data,
    error
  } =
    await supabase
      .from("meetings")
      .select("*")
      .eq(
        "group_id",
        currentGroupId
      )
      .order(
        "meeting_date",
        {
          ascending:
            true
        }
      )
      .limit(
        10
      );


  if (error) {
    throw error;
  }


  const today =
    new Date();


  today.setHours(
    0,
    0,
    0,
    0
  );


  return (
    data ||
    []
  )
    .filter(
      meeting => {

        const rawDate =
          meeting?.meeting_date ??
          meeting?.date ??
          meeting?.scheduled_at;


        if (!rawDate) {
          return true;
        }


        const date =
          new Date(
            rawDate
          );


        return (
          Number.isNaN(
            date.getTime()
          ) ||
          date >= today
        );

      }
    )
    .slice(
      0,
      5
    );

}


/* =========================================================
   MEETING HELPERS
========================================================= */

function getMeetingDate(
  meeting
) {

  return (
    meeting?.meeting_date ??
    meeting?.date ??
    meeting?.scheduled_at ??
    null
  );

}


function getMeetingTitle(
  meeting
) {

  return (
    meeting?.title ??
    meeting?.meeting_title ??
    meeting?.name ??
    meeting?.subject ??
    "Group Meeting"
  );

}


function getMeetingVenue(
  meeting
) {

  return (
    meeting?.venue ??
    meeting?.location ??
    meeting?.place ??
    "—"
  );

}


/* =========================================================
   RENDER MEETINGS
========================================================= */

function renderMeetings(
  meetings
) {

  const tbody =
    byId(
      "upcomingMeetingRows"
    );


  if (!tbody) {
    return;
  }


  if (
    !meetings ||
    meetings.length === 0
  ) {

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
    meetings
      .map(
        meeting => {

          const date =
            getMeetingDate(
              meeting
            );


          return `

            <tr>

              <td>

                ${formatDate(
                  date
                )}

              </td>


              <td>

                ${escapeHtml(
                  getMeetingTitle(
                    meeting
                  )
                )}

              </td>


              <td>

                ${escapeHtml(
                  getMeetingVenue(
                    meeting
                  )
                )}

              </td>


              <td>

                <span
                  class="status-badge status-neutral"
                >

                  Upcoming

                </span>

              </td>

            </tr>

          `;

        }
      )
      .join(
        ""
      );

}


/* =========================================================
   LOAD DASHBOARD DATA
========================================================= */

async function loadDashboardData() {

  setLoadingStatus(
    "Loading canonical dashboard data..."
  );


  clearError();


  currentMonth =
    getCurrentMonthKey();


  /*
   * These calls establish authenticated group context.
   */

  currentMember =
    await getMyMember();


  currentGroupId =
    await getMyGroupId();


  currentGroup =
    await getMyGroup();


  renderHeader();


  /*
   * Canonical accounting is loaded first.
   */

  const canonicalRows =
    await loadCanonicalMonthlyStatus();


  const normalizedRows =
    renderCanonicalSummary(
      canonicalRows
    );


  /*
   * Remaining dashboard panels are presentation/activity
   * queries and do not calculate accounting.
   */

  const [
    recentContributions,
    recentExpenses,
    meetings
  ] =
    await Promise.all([
      loadRecentContributions(),
      loadExpenses(),
      loadMeetings()
    ]);


  await Promise.all([

    renderRecentContributions(
      recentContributions
    ),

    renderCurrentBalance(),

    loadTotalMemberCount()

  ]);


  renderRecentExpenses(
    recentExpenses
  );


  renderMeetings(
    meetings
  );


  setReadyStatus(
    `Dashboard updated for ${formatMonthLabel(
      currentMonth
    )}.`
  );


  console.log(
    "CHAMA LIVE: canonical dashboard loaded",
    {
      groupId:
        currentGroupId,

      month:
        currentMonth,

      activeMembers:
        normalizedRows.length
    }
  );

}


/* =========================================================
   INITIALIZER
========================================================= */

/*
 * layout.js dynamically loads page scripts and looks for
 * a page initializer.
 *
 * Export this exact function.
 */

export async function initDashboard() {

  if (initialized) {
    return;
  }


  initialized =
    true;


  try {

    await loadDashboardData();

  }

  catch (error) {

    initialized =
      false;

    showDashboardError(
      error
    );

    setText(
      "status",
      "Dashboard failed to load."
    );

  }

}


/* =========================================================
   OPTIONAL DIRECT BOOT
========================================================= */

/*
 * Normally layout.js calls initDashboard().
 *
 * This guard allows the file to remain safe if loaded
 * directly in another compatible context.
 */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      /*
       * Do not automatically initialize here because
       * layout.js owns application boot.
       */

    }
  );

}


console.log(
  "CHAMA LIVE: dashboard.js ready"
);
