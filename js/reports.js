/* =========================================================
   CHAMA LIVE — REPORTS
   COMPLETE SCHEMA-ALIGNED VERSION

   IMPORTANT DATABASE RULES
   ---------------------------------------------------------
   • members.name — NOT members.full_name
   • members.id is the member primary key
   • members.group_id identifies the group
   • contributions.member_id -> members.id
   • contributions.recorded_by -> members.id
   • expenses.recorded_by -> members.id
   • All records are restricted to currentMember.group_id
   • No database schema changes required

   FEATURES
   ---------------------------------------------------------
   • Financial summary
   • Contribution summary
   • Expense summary
   • Meeting summary
   • Monthly contribution breakdown
   • Monthly approved-expense breakdown
   • Contribution report
   • Approved expense report
   • Member-name resolution
   • Date-range filtering
   • Current group isolation
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";


console.log(
  "CHAMA LIVE: reports.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const fromDateInput =
  document.getElementById("fromDate");

const toDateInput =
  document.getElementById("toDate");

const totalContributionsEl =
  document.getElementById("totalContributions");

const approvedExpensesEl =
  document.getElementById("approvedExpenses");

const currentBalanceEl =
  document.getElementById("currentBalance");

const pendingExpensesEl =
  document.getElementById("pendingExpenses");

const rejectedExpensesEl =
  document.getElementById("rejectedExpenses");

const activeMembersEl =
  document.getElementById("activeMembers");

const totalMeetingsEl =
  document.getElementById("totalMeetings");

const upcomingMeetingsEl =
  document.getElementById("upcomingMeetings");

const completedMeetingsEl =
  document.getElementById("completedMeetings");

const cancelledMeetingsEl =
  document.getElementById("cancelledMeetings");

const contributionBreakdownRows =
  document.getElementById(
    "contributionBreakdownRows"
  );

const expenseBreakdownRows =
  document.getElementById(
    "expenseBreakdownRows"
  );

const contributionReportRows =
  document.getElementById(
    "contributionReportRows"
  );

const expenseReportRows =
  document.getElementById(
    "expenseReportRows"
  );

const applyFiltersButton =
  document.getElementById(
    "applyFilters"
  );

const resetFiltersButton =
  document.getElementById(
    "resetFilters"
  );


/* =========================================================
   STATE
========================================================= */

let currentUser =
  null;

let currentMember =
  null;

let currentGroup =
  null;

let groupId =
  null;

let members =
  [];

let contributions =
  [];

let expenses =
  [];

let meetings =
  [];

let initialized =
  false;


/* =========================================================
   HELPERS
========================================================= */

function money(value) {

  return new Intl.NumberFormat(
    "en-KE",
    {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }
  ).format(
    Number(value || 0)
  );

}


function number(value) {

  return new Intl.NumberFormat(
    "en-KE"
  ).format(
    Number(value || 0)
  );

}


function escapeHtml(value) {

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
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );

}


function getToday() {

  const now =
    new Date();

  return [
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

}


function getFirstDayOfCurrentMonth() {

  const now =
    new Date();

  return [
    now.getFullYear(),

    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    ),

    "01"

  ].join("-");

}


function showStatus(message) {

  if (!statusEl) {

    return;

  }


  statusEl.textContent =
    message || "";

  statusEl.hidden =
    !message;

}


function showError(error) {

  console.error(
    "CHAMA LIVE Reports:",
    error
  );


  if (!errorEl) {

    return;

  }


  errorEl.textContent =
    error?.message ||
    String(error) ||
    "Unable to load reports.";

  errorEl.hidden =
    false;

}


function clearError() {

  if (!errorEl) {

    return;

  }


  errorEl.textContent =
    "";

  errorEl.hidden =
    true;

}


/* =========================================================
   DATE RANGE
========================================================= */

function getDateRange() {

  let from =
    fromDateInput?.value ||
    "";

  let to =
    toDateInput?.value ||
    "";


  if (!from) {

    from =
      getFirstDayOfCurrentMonth();

  }


  if (!to) {

    to =
      getToday();

  }


  return {
    from,
    to
  };

}


function setDefaultDateRange() {

  if (fromDateInput) {

    fromDateInput.value =
      getFirstDayOfCurrentMonth();

  }


  if (toDateInput) {

    toDateInput.value =
      getToday();

  }

}


function dateInRange(
  value,
  from,
  to
) {

  if (!value) {

    return false;

  }


  const date =
    String(value).slice(0, 10);


  return (
    date >= from &&
    date <= to
  );

}


/* =========================================================
   MEMBER NAME
========================================================= */

function getMemberName(
  memberId
) {

  const member =
    members.find(
      item =>
        String(item.id) ===
        String(memberId)
    );


  return (
    member?.name ||
    "Unknown member"
  );

}


/* =========================================================
   MEMBER MAP
========================================================= */

function buildMemberMap() {

  const map =
    new Map();


  members.forEach(
    member => {

      map.set(
        String(member.id),
        member.name ||
          "Unknown member"
      );

    }
  );


  return map;

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

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
        status
      `)
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


  members =
    data || [];

}


/* =========================================================
   LOAD CONTRIBUTIONS
========================================================= */

async function loadContributions() {

  const {
    data,
    error
  } =
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
        reference,
        recorded_by,
        contribution_date,
        created_at
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
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      );


  if (error) {

    throw error;

  }


  contributions =
    data || [];

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
      .select(`
        id,
        group_id,
        description,
        category,
        amount,
        date,
        recorded_by,
        receipt_url,
        approval_status,
        created_at
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
      .order(
        "created_at",
        {
          ascending: false
        }
      );


  if (error) {

    throw error;

  }


  expenses =
    data || [];

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
      .select(`
        id,
        group_id,
        title,
        date,
        venue,
        agenda,
        minutes,
        resolution,
        status,
        created_at
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
      .order(
        "created_at",
        {
          ascending: false
        }
      );


  if (error) {

    throw error;

  }


  meetings =
    data || [];

}


/* =========================================================
   STATUS NORMALIZATION
========================================================= */

function normalizeExpenseStatus(
  value
) {

  const status =
    String(
      value ||
      "pending"
    )
      .trim()
      .toLowerCase();


  if (
    status === "approved"
  ) {

    return "approved";

  }


  if (
    status === "rejected"
  ) {

    return "rejected";

  }


  return "pending";

}


function normalizeMeetingStatus(
  value
) {

  const status =
    String(
      value ||
      "upcoming"
    )
      .trim()
      .toLowerCase();


  if (
    status === "completed"
  ) {

    return "completed";

  }


  if (
    status === "cancelled"
  ) {

    return "cancelled";

  }


  return "upcoming";

}


/* =========================================================
   FILTER DATA
========================================================= */

function getFilteredContributions() {

  const {
    from,
    to
  } =
    getDateRange();


  return contributions.filter(
    contribution =>
      dateInRange(
        contribution.contribution_date ||
          contribution.created_at,
        from,
        to
      )
  );

}


function getFilteredExpenses() {

  const {
    from,
    to
  } =
    getDateRange();


  return expenses.filter(
    expense =>
      dateInRange(
        expense.date ||
          expense.created_at,
        from,
        to
      )
  );

}


function getFilteredMeetings() {

  const {
    from,
    to
  } =
    getDateRange();


  return meetings.filter(
    meeting =>
      dateInRange(
        meeting.date ||
          meeting.created_at,
        from,
        to
      )
  );

}


/* =========================================================
   FINANCIAL SUMMARY
========================================================= */

function renderFinancialSummary() {

  const filteredContributions =
    getFilteredContributions();


  const filteredExpenses =
    getFilteredExpenses();


  let totalContributions =
    0;

  let approvedExpenses =
    0;

  let pendingExpenses =
    0;

  let rejectedExpenses =
    0;


  filteredContributions.forEach(
    contribution => {

      totalContributions +=
        Number(
          contribution.amount || 0
        );

    }
  );


  filteredExpenses.forEach(
    expense => {

      const amount =
        Number(
          expense.amount || 0
        );


      const status =
        normalizeExpenseStatus(
          expense.approval_status
        );


      if (
        status === "approved"
      ) {

        approvedExpenses +=
          amount;

      }
      else if (
        status === "rejected"
      ) {

        rejectedExpenses +=
          amount;

      }
      else {

        pendingExpenses +=
          amount;

      }

    }
  );


  const balance =
    totalContributions -
    approvedExpenses;


  if (totalContributionsEl) {

    totalContributionsEl.textContent =
      money(
        totalContributions
      );

  }


  if (approvedExpensesEl) {

    approvedExpensesEl.textContent =
      money(
        approvedExpenses
      );

  }


  if (currentBalanceEl) {

    currentBalanceEl.textContent =
      money(
        balance
      );

  }


  if (pendingExpensesEl) {

    pendingExpensesEl.textContent =
      money(
        pendingExpenses
      );

  }


  if (rejectedExpensesEl) {

    rejectedExpensesEl.textContent =
      money(
        rejectedExpenses
      );

  }


  if (activeMembersEl) {

    const activeCount =
      members.filter(
        member =>
          String(
            member.status ||
            "active"
          ).toLowerCase() ===
          "active"
      ).length;


    activeMembersEl.textContent =
      number(
        activeCount
      );

  }

}


/* =========================================================
   MEETING SUMMARY
========================================================= */

function renderMeetingSummary() {

  const filtered =
    getFilteredMeetings();


  let upcoming =
    0;

  let completed =
    0;

  let cancelled =
    0;


  filtered.forEach(
    meeting => {

      const status =
        normalizeMeetingStatus(
          meeting.status
        );


      if (
        status === "completed"
      ) {

        completed++;

      }
      else if (
        status === "cancelled"
      ) {

        cancelled++;

      }
      else {

        upcoming++;

      }

    }
  );


  if (totalMeetingsEl) {

    totalMeetingsEl.textContent =
      number(
        filtered.length
      );

  }


  if (upcomingMeetingsEl) {

    upcomingMeetingsEl.textContent =
      number(
        upcoming
      );

  }


  if (completedMeetingsEl) {

    completedMeetingsEl.textContent =
      number(
        completed
      );

  }


  if (cancelledMeetingsEl) {

    cancelledMeetingsEl.textContent =
      number(
        cancelled
      );

  }

}


/* =========================================================
   MONTH KEY
========================================================= */

function getMonthKey(
  value
) {

  if (!value) {

    return null;

  }


  return String(value)
    .slice(0, 7);

}


function formatMonth(
  monthKey
) {

  if (!monthKey) {

    return "—";

  }


  const parts =
    monthKey.split("-");


  if (
    parts.length !== 2
  ) {

    return monthKey;

  }


  const date =
    new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      1
    );


  return date.toLocaleDateString(
    "en-KE",
    {
      month: "short",
      year: "numeric"
    }
  );

}


/* =========================================================
   CONTRIBUTION BREAKDOWN
========================================================= */

function renderContributionBreakdown() {

  if (!contributionBreakdownRows) {

    return;

  }


  const filtered =
    getFilteredContributions();


  const months =
    new Map();


  filtered.forEach(
    contribution => {

      const month =
        getMonthKey(
          contribution.contribution_date ||
          contribution.month ||
          contribution.created_at
        );


      if (!month) {

        return;

      }


      if (!months.has(month)) {

        months.set(
          month,
          {
            entries: 0,
            amount: 0
          }
        );

      }


      const row =
        months.get(month);


      row.entries++;

      row.amount +=
        Number(
          contribution.amount || 0
        );

    }
  );


  const sorted =
    Array.from(
      months.entries()
    ).sort(
      (
        a,
        b
      ) =>
        b[0].localeCompare(
          a[0]
        )
    );


  if (!sorted.length) {

    contributionBreakdownRows.innerHTML = `
      <tr>
        <td colspan="3">
          No contribution records found
          for the selected period.
        </td>
      </tr>
    `;

    return;

  }


  contributionBreakdownRows.innerHTML =
    sorted
      .map(
        ([month, row]) => `
          <tr>
            <td>
              ${escapeHtml(
                formatMonth(month)
              )}
            </td>

            <td>
              ${number(
                row.entries
              )}
            </td>

            <td>
              <strong>
                ${escapeHtml(
                  money(row.amount)
                )}
              </strong>
            </td>
          </tr>
        `
      )
      .join("");

}


/* =========================================================
   APPROVED EXPENSE BREAKDOWN
========================================================= */

function renderExpenseBreakdown() {

  if (!expenseBreakdownRows) {

    return;

  }


  const filtered =
    getFilteredExpenses()
      .filter(
        expense =>
          normalizeExpenseStatus(
            expense.approval_status
          ) === "approved"
      );


  const months =
    new Map();


  filtered.forEach(
    expense => {

      const month =
        getMonthKey(
          expense.date ||
          expense.created_at
        );


      if (!month) {

        return;

      }


      if (!months.has(month)) {

        months.set(
          month,
          {
            entries: 0,
            amount: 0
          }
        );

      }


      const row =
        months.get(month);


      row.entries++;

      row.amount +=
        Number(
          expense.amount || 0
        );

    }
  );


  const sorted =
    Array.from(
      months.entries()
    ).sort(
      (
        a,
        b
      ) =>
        b[0].localeCompare(
          a[0]
        )
    );


  if (!sorted.length) {

    expenseBreakdownRows.innerHTML = `
      <tr>
        <td colspan="3">
          No approved expenses found
          for the selected period.
        </td>
      </tr>
    `;

    return;

  }


  expenseBreakdownRows.innerHTML =
    sorted
      .map(
        ([month, row]) => `
          <tr>
            <td>
              ${escapeHtml(
                formatMonth(month)
              )}
            </td>

            <td>
              ${number(
                row.entries
              )}
            </td>

            <td>
              <strong>
                ${escapeHtml(
                  money(row.amount)
                )}
              </strong>
            </td>
          </tr>
        `
      )
      .join("");

}


/* =========================================================
   CONTRIBUTION REPORT
========================================================= */

function renderContributionReport() {

  if (!contributionReportRows) {

    return;

  }


  const filtered =
    getFilteredContributions();


  if (!filtered.length) {

    contributionReportRows.innerHTML = `
      <tr>
        <td colspan="5">
          No contributions found
          for the selected period.
        </td>
      </tr>
    `;

    return;

  }


  const memberMap =
    buildMemberMap();


  contributionReportRows.innerHTML =
    filtered
      .map(
        contribution => {

          const memberName =
            memberMap.get(
              String(
                contribution.recorded_by
              )
            ) ||
            memberMap.get(
              String(
                contribution.member_id
              )
            ) ||
            "Unknown member";


          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    contribution.contribution_date ||
                    contribution.created_at
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  memberName
                )}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    money(
                      contribution.amount
                    )
                  )}
                </strong>
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


/* =========================================================
   APPROVED EXPENSE REPORT
========================================================= */

function renderExpenseReport() {

  if (!expenseReportRows) {

    return;

  }


  const filtered =
    getFilteredExpenses()
      .filter(
        expense =>
          normalizeExpenseStatus(
            expense.approval_status
          ) === "approved"
      );


  if (!filtered.length) {

    expenseReportRows.innerHTML = `
      <tr>
        <td colspan="5">
          No approved expenses found
          for the selected period.
        </td>
      </tr>
    `;

    return;

  }


  const memberMap =
    buildMemberMap();


  expenseReportRows.innerHTML =
    filtered
      .map(
        expense => {

          const recordedBy =
            memberMap.get(
              String(
                expense.recorded_by
              )
            ) ||
            "Unknown member";


          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    expense.date ||
                    expense.created_at
                  )
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
                <strong>
                  ${escapeHtml(
                    money(
                      expense.amount
                    )
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  recordedBy
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   RENDER ALL
========================================================= */

function renderReports() {

  renderFinancialSummary();

  renderMeetingSummary();

  renderContributionBreakdown();

  renderExpenseBreakdown();

  renderContributionReport();

  renderExpenseReport();

}


/* =========================================================
   FILTER BUTTONS
========================================================= */

function setupFilters() {

  applyFiltersButton?.addEventListener(
    "click",
    () => {

      clearError();

      const {
        from,
        to
      } =
        getDateRange();


      if (
        from > to
      ) {

        showError(
          new Error(
            "From Date cannot be later than To Date."
          )
        );

        return;

      }


      renderReports();

      showStatus(
        `Report updated: ${formatDate(from)} – ${formatDate(to)}`
      );

      setTimeout(
        () => {

          showStatus("");

        },
        2500
      );

    }
  );


  resetFiltersButton?.addEventListener(
    "click",
    () => {

      clearError();

      setDefaultDateRange();

      renderReports();

      showStatus(
        "Report period reset."
      );

      setTimeout(
        () => {

          showStatus("");

        },
        2000
      );

    }
  );


  fromDateInput?.addEventListener(
    "change",
    () => {

      if (
        toDateInput?.value &&
        fromDateInput?.value >
          toDateInput.value
      ) {

        toDateInput.value =
          fromDateInput.value;

      }

    }
  );

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initPage() {

  if (initialized) {

    console.warn(
      "CHAMA LIVE: reports already initialized"
    );

    return;

  }


  initialized =
    true;


  try {

    clearError();

    showStatus(
      "Loading reports..."
    );


    /* -------------------------------------------------------
       AUTH
    ------------------------------------------------------- */

    currentUser =
      await requireAuth();


    if (!currentUser) {

      throw new Error(
        "You are not signed in."
      );

    }


    /* -------------------------------------------------------
       MEMBER
    ------------------------------------------------------- */

    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "No member record is linked to this account."
      );

    }


    /* -------------------------------------------------------
       GROUP
    ------------------------------------------------------- */

    groupId =
      currentMember.group_id;


    if (!groupId) {

      throw new Error(
        "Your member record is not linked to a group."
      );

    }


    /* -------------------------------------------------------
       GROUP DETAILS
    ------------------------------------------------------- */

    try {

      currentGroup =
        await getMyGroup();

    }
    catch (groupError) {

      console.warn(
        "CHAMA LIVE Reports: group details unavailable:",
        groupError
      );

      currentGroup =
        null;

    }


    console.log(
      "CHAMA LIVE: reports context",
      {
        userId:
          currentUser.id,

        memberId:
          currentMember.id,

        groupId:
          groupId,

        group:
          currentGroup
      }
    );


    /* -------------------------------------------------------
       DATE RANGE
    ------------------------------------------------------- */

    setDefaultDateRange();


    /* -------------------------------------------------------
       EVENTS
    ------------------------------------------------------- */

    setupFilters();


    /* -------------------------------------------------------
       DATA
    ------------------------------------------------------- */

    await Promise.all([
      loadMembers(),
      loadContributions(),
      loadExpenses(),
      loadMeetings()
    ]);


    /* -------------------------------------------------------
       RENDER
    ------------------------------------------------------- */

    renderReports();


    showStatus(
      "Reports ready."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      2000
    );


    console.log(
      "CHAMA LIVE: reports initialized"
    );

  }
  catch (error) {

    initialized =
      false;

    showStatus("");

    showError(
      error
    );

  }

}


/* =========================================================
   PUBLIC ALIAS
========================================================= */

export const initReports =
  initPage;


/* =========================================================
   AUTO BOOT SAFETY
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      /*
       * Normally layout.js calls initPage().
       * The guard above prevents duplicate
       * initialization if both paths execute.
       */

      initPage();

    },
    {
      once: true
    }
  );

}
else {

  /*
   * Normally layout.js calls initPage().
   * Safe because initialized prevents duplication.
   */

  initPage();

}


console.log(
  "CHAMA LIVE: reports.js ready"
);
