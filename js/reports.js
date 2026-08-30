/* =========================================================
   CHAMA LIVE — REPORTS
   COMPLETE INTEGRATED VERSION

   PURPOSE
   ---------------------------------------------------------
   Financial, membership and meeting reporting.

   GROUP CONTEXT
   ---------------------------------------------------------
   Reports always operate on the authenticated member's
   current group.

   DATABASE RULES
   ---------------------------------------------------------
   members.name
       -> member display name

   members.id
       -> member primary key

   members.group_id
       -> group ownership

   contributions.member_id
       -> member who made the contribution

   contributions.recorded_by
       -> member who recorded the contribution

   contributions.group_id
       -> group ownership

   contributions.contribution_date
       -> contribution date

   contributions.amount
       -> contribution amount

   expenses.recorded_by
       -> member who recorded the expense

   expenses.group_id
       -> group ownership

   expenses.approval_status
       -> pending / approved / rejected

   expenses.date
       -> expense date

   meetings.group_id
       -> group ownership

   meetings.date
       -> meeting date

   meetings.status
       -> upcoming / completed / cancelled

   IMPORTANT
   ---------------------------------------------------------
   DO NOT USE:

       members.full_name

   USE:

       members.name

   ARCHITECTURE
   ---------------------------------------------------------
   layout.js dynamically loads this module and calls:

       initReports()

   No database schema changes are required.
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
   STATE
========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let currentGroupId = null;

let members = [];
let contributions = [];
let expenses = [];
let meetings = [];

let initialized = false;


/* =========================================================
   DOM HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
}


function setText(id, value) {

  const element = byId(id);

  if (element) {
    element.textContent =
      value ?? "—";
  }

}


function setHtml(id, html) {

  const element = byId(id);

  if (element) {
    element.innerHTML = html;
  }

}


/* =========================================================
   ELEMENTS
========================================================= */

const statusEl =
  byId("status");

const errorEl =
  byId("error");

const fromDateInput =
  byId("fromDate");

const toDateInput =
  byId("toDate");

const applyFiltersButton =
  byId("applyFilters");

const resetFiltersButton =
  byId("resetFilters");


/* FINANCIAL */

const totalContributionsEl =
  byId("totalContributions");

const approvedExpensesEl =
  byId("approvedExpenses");

const currentBalanceEl =
  byId("currentBalance");

const pendingExpensesEl =
  byId("pendingExpenses");

const rejectedExpensesEl =
  byId("rejectedExpenses");

const activeMembersEl =
  byId("activeMembers");


/* MEETINGS */

const totalMeetingsEl =
  byId("totalMeetings");

const upcomingMeetingsEl =
  byId("upcomingMeetings");

const completedMeetingsEl =
  byId("completedMeetings");

const cancelledMeetingsEl =
  byId("cancelledMeetings");


/* TABLES */

const contributionBreakdownRows =
  byId("contributionBreakdownRows");

const expenseBreakdownRows =
  byId("expenseBreakdownRows");

const contributionReportRows =
  byId("contributionReportRows");

const expenseReportRows =
  byId("expenseReportRows");


/* =========================================================
   MONEY
========================================================= */

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


/* =========================================================
   HTML ESCAPE
========================================================= */

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


/* =========================================================
   STATUS MESSAGE
========================================================= */

function showStatus(message) {

  if (!statusEl) {
    return;
  }

  statusEl.hidden = false;

  statusEl.textContent =
    message || "";

}


function clearStatus() {

  if (!statusEl) {
    return;
  }

  statusEl.hidden = true;

  statusEl.textContent =
    "";

}


/* =========================================================
   ERROR HANDLING
========================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE: reports error",
    error
  );

  const message =
    error?.message ||
    String(error) ||
    "Unable to load reports.";

  if (errorEl) {

    errorEl.hidden = false;

    errorEl.textContent =
      message;

  }

}


function clearError() {

  if (!errorEl) {
    return;
  }

  errorEl.hidden = true;

  errorEl.textContent =
    "";

}


/* =========================================================
   DATE HELPERS
========================================================= */

function formatDate(value) {

  if (!value) {
    return "—";
  }

  const date =
    new Date(
      `${value}T00:00:00`
    );

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


function getTodayKey() {

  const now =
    new Date();

  return [
    now.getFullYear(),
    String(
      now.getMonth() + 1
    ).padStart(2, "0"),
    String(
      now.getDate()
    ).padStart(2, "0")
  ].join("-");

}


function getFirstDayOfCurrentMonth() {

  const now =
    new Date();

  return [
    now.getFullYear(),
    String(
      now.getMonth() + 1
    ).padStart(2, "0"),
    "01"
  ].join("-");

}


function normalizeDate(value) {

  if (!value) {
    return "";
  }

  return String(value).slice(
    0,
    10
  );

}


/* =========================================================
   DATE RANGE
========================================================= */

function getDateRange() {

  const from =
    normalizeDate(
      fromDateInput?.value
    );

  const to =
    normalizeDate(
      toDateInput?.value
    );

  return {
    from,
    to
  };

}


function dateIsInRange(
  value,
  from,
  to
) {

  const date =
    normalizeDate(value);

  if (!date) {
    return false;
  }

  if (
    from &&
    date < from
  ) {
    return false;
  }

  if (
    to &&
    date > to
  ) {
    return false;
  }

  return true;

}


/* =========================================================
   MONTH KEY
========================================================= */

function getMonthKey(value) {

  const date =
    normalizeDate(value);

  if (!date) {
    return "";
  }

  return date.slice(
    0,
    7
  );

}


/* =========================================================
   MONTH LABEL
========================================================= */

function formatMonth(monthKey) {

  if (
    !/^\d{4}-\d{2}$/.test(
      monthKey
    )
  ) {
    return monthKey || "—";
  }

  const date =
    new Date(
      `${monthKey}-01T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return monthKey;
  }

  return date.toLocaleDateString(
    "en-KE",
    {
      year: "numeric",
      month: "long"
    }
  );

}


/* =========================================================
   INITIAL DATE FILTER
========================================================= */

function setDefaultDateRange() {

  if (fromDateInput) {

    fromDateInput.value =
      getFirstDayOfCurrentMonth();

  }

  if (toDateInput) {

    toDateInput.value =
      getTodayKey();

  }

}


/* =========================================================
   VALIDATE DATE FILTER
========================================================= */

function validateDateRange() {

  const {
    from,
    to
  } = getDateRange();

  if (
    from &&
    to &&
    from > to
  ) {

    throw new Error(
      "From Date cannot be later than To Date."
    );

  }

}


/* =========================================================
   LOAD CURRENT GROUP CONTEXT
========================================================= */

async function loadGroupContext() {

  currentUser =
    await requireAuth();

  currentMember =
    await getMyMember();

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

  currentGroupId =
    currentMember.group_id;

  currentGroup =
    await getMyGroup();

  if (!currentGroup) {

    throw new Error(
      "Group information could not be found."
    );

  }

  if (
    String(currentGroup.id) !==
    String(currentGroupId)
  ) {

    throw new Error(
      "The current group context could not be verified."
    );

  }

  renderGroupContext();

  console.log(
    "CHAMA LIVE: Reports group context",
    {
      userId:
        currentUser?.id,

      memberId:
        currentMember?.id,

      groupId:
        currentGroupId,

      groupName:
        currentGroup?.name
    }
  );

}


/* =========================================================
   RENDER GROUP CONTEXT
========================================================= */

function renderGroupContext() {

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
        member_number,
        membership_number,
        name,
        phone,
        email,
        role,
        join_date,
        status,
        onboarding_status,
        invited_at,
        activated_at,
        created_at
      `)
      .eq(
        "group_id",
        currentGroupId
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

  const activeCount =
    members.filter(
      member =>
        String(
          member?.status || ""
        )
          .trim()
          .toLowerCase() ===
        "active"
    ).length;

  setText(
    "activeMembers",
    activeCount
  );

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
        notes,
        created_at
      `)
      .eq(
        "group_id",
        currentGroupId
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
        currentGroupId
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
        currentGroupId
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
   LOAD ALL REPORT DATA
========================================================= */

async function loadReportData() {

  showStatus(
    "Loading report data..."
  );

  await Promise.all([
    loadMembers(),
    loadContributions(),
    loadExpenses(),
    loadMeetings()
  ]);

  clearStatus();

}


/* =========================================================
   MEMBER NAME LOOKUP
========================================================= */

function getMemberName(
  memberId
) {

  if (!memberId) {
    return "—";
  }

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
   FILTER CONTRIBUTIONS
========================================================= */

function getFilteredContributions() {

  const {
    from,
    to
  } = getDateRange();

  return contributions.filter(
    contribution =>
      dateIsInRange(
        contribution.contribution_date,
        from,
        to
      )
  );

}


/* =========================================================
   FILTER EXPENSES
========================================================= */

function getFilteredExpenses() {

  const {
    from,
    to
  } = getDateRange();

  return expenses.filter(
    expense =>
      dateIsInRange(
        expense.date,
        from,
        to
      )
  );

}


/* =========================================================
   FILTER MEETINGS
========================================================= */

function getFilteredMeetings() {

  const {
    from,
    to
  } = getDateRange();

  return meetings.filter(
    meeting =>
      dateIsInRange(
        meeting.date,
        from,
        to
      )
  );

}


/* =========================================================
   EXPENSE STATUS
========================================================= */

function normalizeExpenseStatus(
  expense
) {

  return String(
    expense?.approval_status || ""
  )
    .trim()
    .toLowerCase();

}


/* =========================================================
   CALCULATE FINANCIAL SUMMARY
========================================================= */

function calculateFinancialSummary() {

  const filteredContributions =
    getFilteredContributions();

  const filteredExpenses =
    getFilteredExpenses();

  const totalContributions =
    filteredContributions.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.amount || 0
        ),
      0
    );

  const approvedExpenses =
    filteredExpenses
      .filter(
        expense =>
          normalizeExpenseStatus(
            expense
          ) ===
          "approved"
      )
      .reduce(
        (
          total,
          row
        ) =>
          total +
          Number(
            row.amount || 0
          ),
        0
      );

  const pendingExpenses =
    filteredExpenses
      .filter(
        expense =>
          normalizeExpenseStatus(
            expense
          ) ===
          "pending"
      )
      .reduce(
        (
          total,
          row
        ) =>
          total +
          Number(
            row.amount || 0
          ),
        0
      );

  const rejectedExpenses =
    filteredExpenses
      .filter(
        expense =>
          normalizeExpenseStatus(
            expense
          ) ===
          "rejected"
      )
      .reduce(
        (
          total,
          row
        ) =>
          total +
          Number(
            row.amount || 0
          ),
        0
      );

  const openingBalance =
    Number(
      currentGroup?.opening_balance || 0
    );

  const currentBalance =
    openingBalance +
    totalContributions -
    approvedExpenses;

  return {
    totalContributions,
    approvedExpenses,
    pendingExpenses,
    rejectedExpenses,
    openingBalance,
    currentBalance
  };

}


/* =========================================================
   RENDER FINANCIAL SUMMARY
========================================================= */

function renderFinancialSummary() {

  const summary =
    calculateFinancialSummary();

  setText(
    "totalContributions",
    money(
      summary.totalContributions
    )
  );

  setText(
    "approvedExpenses",
    money(
      summary.approvedExpenses
    )
  );

  setText(
    "currentBalance",
    money(
      summary.currentBalance
    )
  );

  setText(
    "pendingExpenses",
    money(
      summary.pendingExpenses
    )
  );

  setText(
    "rejectedExpenses",
    money(
      summary.rejectedExpenses
    )
  );

}


/* =========================================================
   MEETING SUMMARY
========================================================= */

function renderMeetingSummary() {

  const filtered =
    getFilteredMeetings();

  const total =
    filtered.length;

  const upcoming =
    filtered.filter(
      meeting =>
        String(
          meeting?.status || ""
        )
          .trim()
          .toLowerCase() ===
        "upcoming"
    ).length;

  const completed =
    filtered.filter(
      meeting =>
        String(
          meeting?.status || ""
        )
          .trim()
          .toLowerCase() ===
        "completed"
    ).length;

  const cancelled =
    filtered.filter(
      meeting =>
        String(
          meeting?.status || ""
        )
          .trim()
          .toLowerCase() ===
        "cancelled"
    ).length;

  setText(
    "totalMeetings",
    total
  );

  setText(
    "upcomingMeetings",
    upcoming
  );

  setText(
    "completedMeetings",
    completed
  );

  setText(
    "cancelledMeetings",
    cancelled
  );

}


/* =========================================================
   CONTRIBUTION MONTHLY BREAKDOWN
========================================================= */

function renderContributionBreakdown() {

  if (!contributionBreakdownRows) {
    return;
  }

  const filtered =
    getFilteredContributions();

  const grouped = {};

  filtered.forEach(
    contribution => {

      const month =
        getMonthKey(
          contribution.contribution_date
        );

      if (!month) {
        return;
      }

      if (!grouped[month]) {

        grouped[month] = {
          entries: 0,
          amount: 0
        };

      }

      grouped[month].entries +=
        1;

      grouped[month].amount +=
        Number(
          contribution.amount || 0
        );

    }
  );

  const months =
    Object.keys(grouped)
      .sort()
      .reverse();

  if (months.length === 0) {

    contributionBreakdownRows.innerHTML = `
      <tr>
        <td colspan="3">
          No contributions found for this period.
        </td>
      </tr>
    `;

    return;

  }

  contributionBreakdownRows.innerHTML =
    months
      .map(
        month => {

          const row =
            grouped[month];

          return `
            <tr>
              <td>
                ${escapeHtml(
                  formatMonth(month)
                )}
              </td>

              <td>
                ${row.entries}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    money(row.amount)
                  )}
                </strong>
              </td>
            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   EXPENSE MONTHLY BREAKDOWN
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
            expense
          ) ===
          "approved"
      );

  const grouped = {};

  filtered.forEach(
    expense => {

      const month =
        getMonthKey(
          expense.date
        );

      if (!month) {
        return;
      }

      if (!grouped[month]) {

        grouped[month] = {
          entries: 0,
          amount: 0
        };

      }

      grouped[month].entries +=
        1;

      grouped[month].amount +=
        Number(
          expense.amount || 0
        );

    }
  );

  const months =
    Object.keys(grouped)
      .sort()
      .reverse();

  if (months.length === 0) {

    expenseBreakdownRows.innerHTML = `
      <tr>
        <td colspan="3">
          No approved expenses found for this period.
        </td>
      </tr>
    `;

    return;

  }

  expenseBreakdownRows.innerHTML =
    months
      .map(
        month => {

          const row =
            grouped[month];

          return `
            <tr>
              <td>
                ${escapeHtml(
                  formatMonth(month)
                )}
              </td>

              <td>
                ${row.entries}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    money(row.amount)
                  )}
                </strong>
              </td>
            </tr>
          `;

        }
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

  if (filtered.length === 0) {

    contributionReportRows.innerHTML = `
      <tr>
        <td colspan="5">
          No contributions found for this period.
        </td>
      </tr>
    `;

    return;

  }

  const rows =
    filtered.slice(
      0,
      200
    );

  contributionReportRows.innerHTML =
    rows
      .map(
        contribution => {

          const recordedBy =
            getMemberName(
              contribution.recorded_by
            );

          const type =
            contribution.contribution_type ||
            "Contribution";

          const paymentMethod =
            contribution.payment_method ||
            "—";

          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    contribution.contribution_date
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  recordedBy
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
                  type
                )}
              </td>

              <td>
                ${escapeHtml(
                  paymentMethod
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   EXPENSE REPORT
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
            expense
          ) ===
          "approved"
      );

  if (filtered.length === 0) {

    expenseReportRows.innerHTML = `
      <tr>
        <td colspan="5">
          No approved expenses found for this period.
        </td>
      </tr>
    `;

    return;

  }

  const rows =
    filtered.slice(
      0,
      200
    );

  expenseReportRows.innerHTML =
    rows
      .map(
        expense => {

          const recordedBy =
            getMemberName(
              expense.recorded_by
            );

          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    expense.date
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
   RENDER ALL REPORTS
========================================================= */

function renderReports() {

  clearError();

  renderFinancialSummary();

  renderMeetingSummary();

  renderContributionBreakdown();

  renderExpenseBreakdown();

  renderContributionReport();

  renderExpenseReport();

}


/* =========================================================
   APPLY FILTERS
========================================================= */

async function applyFilters() {

  try {

    clearError();

    validateDateRange();

    renderReports();

    showStatus(
      "Report generated successfully."
    );

    window.setTimeout(
      clearStatus,
      1800
    );

  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =========================================================
   RESET FILTERS
========================================================= */

function resetFilters() {

  clearError();

  setDefaultDateRange();

  renderReports();

  showStatus(
    "Report period reset."
  );

  window.setTimeout(
    clearStatus,
    1500
  );

}


/* =========================================================
   EVENT LISTENERS
========================================================= */

function setupEvents() {

  if (
    applyFiltersButton &&
    applyFiltersButton.dataset.ready !==
    "true"
  ) {

    applyFiltersButton.dataset.ready =
      "true";

    applyFiltersButton.addEventListener(
      "click",
      applyFilters
    );

  }


  if (
    resetFiltersButton &&
    resetFiltersButton.dataset.ready !==
    "true"
  ) {

    resetFiltersButton.dataset.ready =
      "true";

    resetFiltersButton.addEventListener(
      "click",
      resetFilters
    );

  }

}


/* =========================================================
   INITIALIZE REPORTS
========================================================= */

export async function initReports() {

  if (initialized) {

    console.log(
      "CHAMA LIVE: reports already initialized"
    );

    return;

  }

  initialized =
    true;

  try {

    console.log(
      "CHAMA LIVE: initializing reports"
    );

    clearError();

    clearStatus();

    setDefaultDateRange();

    setupEvents();

    await loadGroupContext();

    await loadReportData();

    renderReports();

    console.log(
      "CHAMA LIVE: reports initialized successfully",
      {
        groupId:
          currentGroupId,

        members:
          members.length,

        contributions:
          contributions.length,

        expenses:
          expenses.length,

        meetings:
          meetings.length
      }
    );

  }
  catch (error) {

    initialized =
      false;

    showError(
      error
    );

    console.error(
      "CHAMA LIVE: reports initialization failed",
      error
    );

  }

}


/* =========================================================
   OPTIONAL PUBLIC REFRESH
========================================================= */

export async function refreshReports() {

  try {

    if (!currentGroupId) {

      await loadGroupContext();

    }

    await loadReportData();

    renderReports();

  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: reports module ready"
);
