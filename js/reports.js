/* =========================================================
   CHAMA LIVE — REPORTS
   COMPLETE STABLE + VISUALLY ENHANCED VERSION

   GROUP-SCOPED REPORTING
   ---------------------------------------------------------
   Uses:
       members.name
       members.id
       members.group_id

   FEATURES
   ---------------------------------------------------------
   • Group-scoped financial reports
   • Membership summary
   • Meeting summary
   • Contribution breakdown
   • Expense breakdown
   • Detailed contribution report
   • Detailed approved expense report
   • Date-range filtering
   • Reset reporting period
   • Group/member context verification

   Required export:
       initReports()
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";


console.log("CHAMA LIVE: reports.js loaded");


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


/* =========================================================
   DOM HELPERS
========================================================= */

function el(id) {
  return document.getElementById(id);
}


function setText(id, value) {

  const element = el(id);

  if (element) {
    element.textContent = value ?? "—";
  }

}


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
   ESCAPE HTML
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
   ERROR
========================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE: Reports error",
    error
  );

  const errorElement =
    el("error");

  if (!errorElement) {
    return;
  }

  errorElement.hidden =
    false;

  errorElement.textContent =
    error?.message ||
    "Unable to load reports.";

}


function clearError() {

  const errorElement =
    el("error");

  if (!errorElement) {
    return;
  }

  errorElement.hidden =
    true;

  errorElement.textContent =
    "";

}


/* =========================================================
   STATUS
========================================================= */

function showStatus(message) {

  const statusElement =
    el("status");

  if (!statusElement) {
    return;
  }

  statusElement.hidden =
    !message;

  statusElement.textContent =
    message || "";

}


function clearStatus() {

  const statusElement =
    el("status");

  if (!statusElement) {
    return;
  }

  statusElement.hidden =
    true;

  statusElement.textContent =
    "";

}


/* =========================================================
   DATE HELPERS
========================================================= */

function today() {

  const date =
    new Date();

  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1
    ).padStart(2, "0"),

    String(
      date.getDate()
    ).padStart(2, "0")

  ].join("-");

}


function firstDayOfMonth() {

  const date =
    new Date();

  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1
    ).padStart(2, "0"),

    "01"

  ].join("-");

}


function normalizeDate(value) {

  if (!value) {
    return "";
  }

  return String(value)
    .substring(0, 10);

}


function formatDate(value) {

  const dateValue =
    normalizeDate(value);

  if (!dateValue) {
    return "—";
  }

  const date =
    new Date(
      `${dateValue}T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return dateValue;
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


function monthKey(value) {

  const date =
    normalizeDate(value);

  return date
    ? date.substring(0, 7)
    : "";

}


function formatMonth(value) {

  if (!value) {
    return "—";
  }

  const date =
    new Date(
      `${value}-01T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
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
   DATE RANGE
========================================================= */

function getDateRange() {

  return {

    from:
      normalizeDate(
        el("fromDate")?.value
      ),

    to:
      normalizeDate(
        el("toDate")?.value
      )

  };

}


function inDateRange(
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


function validateDateRange() {

  const {
    from,
    to
  } =
    getDateRange();

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
   DEFAULT DATES
========================================================= */

function setDefaultDates() {

  const fromInput =
    el("fromDate");

  const toInput =
    el("toDate");

  if (fromInput) {

    fromInput.value =
      firstDayOfMonth();

  }

  if (toInput) {

    toInput.value =
      today();

  }

}


/* =========================================================
   GROUP CONTEXT
========================================================= */

async function loadContext() {

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
      "Current group context could not be verified."
    );

  }

  renderContext();

}


function renderContext() {

  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(element => {

      element.textContent =
        currentGroup?.name ||
        "CHAMA";

    });


  document
    .querySelectorAll(
      "[data-user-name]"
    )
    .forEach(element => {

      element.textContent =
        currentMember?.name ||
        "Member";

    });

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  const result =
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

  if (result.error) {
    throw result.error;
  }

  members =
    result.data || [];

}


/* =========================================================
   LOAD CONTRIBUTIONS
========================================================= */

async function loadContributions() {

  const result =
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
      );

  if (result.error) {
    throw result.error;
  }

  contributions =
    result.data || [];

}


/* =========================================================
   LOAD EXPENSES
========================================================= */

async function loadExpenses() {

  const result =
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
      );

  if (result.error) {
    throw result.error;
  }

  expenses =
    result.data || [];

}


/* =========================================================
   LOAD MEETINGS
========================================================= */

async function loadMeetings() {

  const result =
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
      );

  if (result.error) {
    throw result.error;
  }

  meetings =
    result.data || [];

}


/* =========================================================
   LOAD DATA
========================================================= */

async function loadData() {

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
   MEMBER NAME
========================================================= */

function memberName(memberId) {

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
   FILTERED DATA
========================================================= */

function filteredContributions() {

  const {
    from,
    to
  } =
    getDateRange();

  return contributions.filter(
    contribution =>
      inDateRange(
        contribution.contribution_date,
        from,
        to
      )
  );

}


function filteredExpenses() {

  const {
    from,
    to
  } =
    getDateRange();

  return expenses.filter(
    expense =>
      inDateRange(
        expense.date,
        from,
        to
      )
  );

}


function filteredMeetings() {

  const {
    from,
    to
  } =
    getDateRange();

  return meetings.filter(
    meeting =>
      inDateRange(
        meeting.date,
        from,
        to
      )
  );

}


/* =========================================================
   EXPENSE STATUS
========================================================= */

function expenseStatus(expense) {

  return String(
    expense?.approval_status || ""
  )
    .trim()
    .toLowerCase();

}


/* =========================================================
   STATUS BADGE
========================================================= */

function statusBadge(status) {

  const normalized =
    String(status || "")
      .trim()
      .toLowerCase();

  const label =
    normalized
      ? normalized.charAt(0).toUpperCase() +
        normalized.slice(1)
      : "Unknown";

  return `
    <span
      class="report-status report-status-${escapeHtml(
        normalized || "unknown"
      )}"
    >
      ${escapeHtml(label)}
    </span>
  `;

}


/* =========================================================
   FINANCIAL SUMMARY
========================================================= */

function renderFinancialSummary() {

  const contributionRows =
    filteredContributions();

  const expenseRows =
    filteredExpenses();


  const contributionsTotal =
    contributionRows.reduce(
      (total, row) =>
        total +
        Number(row.amount || 0),
      0
    );


  const approvedExpenses =
    expenseRows
      .filter(
        row =>
          expenseStatus(row) ===
          "approved"
      )
      .reduce(
        (total, row) =>
          total +
          Number(row.amount || 0),
        0
      );


  const pendingExpenses =
    expenseRows
      .filter(
        row =>
          expenseStatus(row) ===
          "pending"
      )
      .reduce(
        (total, row) =>
          total +
          Number(row.amount || 0),
        0
      );


  const rejectedExpenses =
    expenseRows
      .filter(
        row =>
          expenseStatus(row) ===
          "rejected"
      )
      .reduce(
        (total, row) =>
          total +
          Number(row.amount || 0),
        0
      );


  const openingBalance =
    Number(
      currentGroup?.opening_balance || 0
    );


  const balance =
    openingBalance +
    contributionsTotal -
    approvedExpenses;


  setText(
    "totalContributions",
    money(contributionsTotal)
  );

  setText(
    "approvedExpenses",
    money(approvedExpenses)
  );

  setText(
    "pendingExpenses",
    money(pendingExpenses)
  );

  setText(
    "rejectedExpenses",
    money(rejectedExpenses)
  );

  setText(
    "currentBalance",
    money(balance)
  );


  const balanceElement =
    el("currentBalance");

  if (balanceElement) {

    balanceElement.classList.toggle(
      "negative",
      balance < 0
    );

    balanceElement.classList.toggle(
      "positive",
      balance >= 0
    );

  }


  const activeMembers =
    members.filter(
      member =>
        String(
          member.status || ""
        )
          .trim()
          .toLowerCase() ===
        "active"
    ).length;


  setText(
    "activeMembers",
    activeMembers
  );


  setText(
    "reportContributionEntries",
    contributionRows.length
  );

  setText(
    "reportExpenseEntries",
    expenseRows.length
  );

}


/* =========================================================
   MEETING SUMMARY
========================================================= */

function renderMeetingSummary() {

  const rows =
    filteredMeetings();


  const countStatus =
    status =>
      rows.filter(
        meeting =>
          String(
            meeting.status || ""
          )
            .trim()
            .toLowerCase() ===
          status
      ).length;


  setText(
    "totalMeetings",
    rows.length
  );

  setText(
    "upcomingMeetings",
    countStatus("upcoming")
  );

  setText(
    "completedMeetings",
    countStatus("completed")
  );

  setText(
    "cancelledMeetings",
    countStatus("cancelled")
  );

}


/* =========================================================
   CONTRIBUTION BREAKDOWN
========================================================= */

function renderContributionBreakdown() {

  const container =
    el(
      "contributionBreakdownRows"
    );

  if (!container) {
    return;
  }


  const grouped = {};


  filteredContributions()
    .forEach(row => {

      const month =
        monthKey(
          row.contribution_date
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


      grouped[month].entries += 1;

      grouped[month].amount +=
        Number(row.amount || 0);

    });


  const months =
    Object.keys(grouped)
      .sort()
      .reverse();


  if (!months.length) {

    container.innerHTML = `
      <tr>
        <td
          colspan="3"
          class="report-empty"
        >
          <div class="empty-state">
            <div class="empty-icon">₿</div>
            <strong>No contribution data</strong>
            <span>
              No contributions were recorded
              for this reporting period.
            </span>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  container.innerHTML =
    months
      .map(month => {

        const row =
          grouped[month];

        return `
          <tr>

            <td>
              <strong>
                ${escapeHtml(
                  formatMonth(month)
                )}
              </strong>
            </td>

            <td>
              <span class="table-count">
                ${row.entries}
              </span>
            </td>

            <td>
              <strong class="money-value">
                ${escapeHtml(
                  money(row.amount)
                )}
              </strong>
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   EXPENSE BREAKDOWN
========================================================= */

function renderExpenseBreakdown() {

  const container =
    el(
      "expenseBreakdownRows"
    );

  if (!container) {
    return;
  }


  const grouped = {};


  filteredExpenses()
    .filter(
      row =>
        expenseStatus(row) ===
        "approved"
    )
    .forEach(row => {

      const month =
        monthKey(row.date);

      if (!month) {
        return;
      }


      if (!grouped[month]) {

        grouped[month] = {
          entries: 0,
          amount: 0
        };

      }


      grouped[month].entries += 1;

      grouped[month].amount +=
        Number(row.amount || 0);

    });


  const months =
    Object.keys(grouped)
      .sort()
      .reverse();


  if (!months.length) {

    container.innerHTML = `
      <tr>
        <td
          colspan="3"
          class="report-empty"
        >
          <div class="empty-state">
            <div class="empty-icon">—</div>
            <strong>No approved expenses</strong>
            <span>
              No approved expenses were found
              for this reporting period.
            </span>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  container.innerHTML =
    months
      .map(month => {

        const row =
          grouped[month];

        return `
          <tr>

            <td>
              <strong>
                ${escapeHtml(
                  formatMonth(month)
                )}
              </strong>
            </td>

            <td>
              <span class="table-count">
                ${row.entries}
              </span>
            </td>

            <td>
              <strong class="money-value">
                ${escapeHtml(
                  money(row.amount)
                )}
              </strong>
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   CONTRIBUTION REPORT
========================================================= */

function renderContributionReport() {

  const container =
    el(
      "contributionReportRows"
    );

  if (!container) {
    return;
  }


  const rows =
    filteredContributions();


  if (!rows.length) {

    container.innerHTML = `
      <tr>
        <td
          colspan="5"
          class="report-empty"
        >
          <div class="empty-state">
            <div class="empty-icon">+</div>
            <strong>No contributions</strong>
            <span>
              No contributions were recorded
              during the selected period.
            </span>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  container.innerHTML =
    rows
      .slice(0, 200)
      .map(row => {

        return `
          <tr>

            <td>
              ${escapeHtml(
                formatDate(
                  row.contribution_date
                )
              )}
            </td>

            <td>
              <div class="person-cell">

                <span class="avatar-small">
                  ${escapeHtml(
                    String(
                      memberName(
                        row.recorded_by
                      )
                    )
                      .charAt(0)
                      .toUpperCase()
                  )}
                </span>

                <span>
                  ${escapeHtml(
                    memberName(
                      row.recorded_by
                    )
                  )}
                </span>

              </div>
            </td>

            <td>
              <strong class="money-value">
                ${escapeHtml(
                  money(row.amount)
                )}
              </strong>
            </td>

            <td>
              <span class="type-pill">
                ${escapeHtml(
                  row.contribution_type ||
                  "Contribution"
                )}
              </span>
            </td>

            <td>
              ${escapeHtml(
                row.payment_method ||
                "—"
              )}
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   EXPENSE REPORT
========================================================= */

function renderExpenseReport() {

  const container =
    el(
      "expenseReportRows"
    );

  if (!container) {
    return;
  }


  const rows =
    filteredExpenses()
      .filter(
        row =>
          expenseStatus(row) ===
          "approved"
      );


  if (!rows.length) {

    container.innerHTML = `
      <tr>
        <td
          colspan="5"
          class="report-empty"
        >
          <div class="empty-state">
            <div class="empty-icon">—</div>
            <strong>No approved expenses</strong>
            <span>
              No approved expenses were recorded
              during the selected period.
            </span>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  container.innerHTML =
    rows
      .slice(0, 200)
      .map(row => {

        return `
          <tr>

            <td>
              ${escapeHtml(
                formatDate(row.date)
              )}
            </td>

            <td>
              <strong>
                ${escapeHtml(
                  row.description ||
                  "—"
                )}
              </strong>
            </td>

            <td>
              <span class="type-pill">
                ${escapeHtml(
                  row.category ||
                  "—"
                )}
              </span>
            </td>

            <td>
              <strong class="money-value">
                ${escapeHtml(
                  money(row.amount)
                )}
              </strong>
            </td>

            <td>
              <div class="person-cell">

                <span class="avatar-small">
                  ${escapeHtml(
                    String(
                      memberName(
                        row.recorded_by
                      )
                    )
                      .charAt(0)
                      .toUpperCase()
                  )}
                </span>

                <span>
                  ${escapeHtml(
                    memberName(
                      row.recorded_by
                    )
                  )}
                </span>

              </div>
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   RENDER
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
   APPLY FILTER
========================================================= */

function applyFilters() {

  try {

    clearError();

    validateDateRange();

    renderReports();

    showStatus(
      "Report generated successfully."
    );

    setTimeout(
      clearStatus,
      1800
    );

  }
  catch (error) {

    showError(error);

  }

}


/* =========================================================
   RESET FILTER
========================================================= */

function resetFilters() {

  clearError();

  setDefaultDates();

  renderReports();

  showStatus(
    "Report period reset."
  );

  setTimeout(
    clearStatus,
    1500
  );

}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  const applyButton =
    el("applyFilters");

  const resetButton =
    el("resetFilters");


  if (
    applyButton &&
    applyButton.dataset.bound !== "true"
  ) {

    applyButton.dataset.bound =
      "true";

    applyButton.addEventListener(
      "click",
      applyFilters
    );

  }


  if (
    resetButton &&
    resetButton.dataset.bound !== "true"
  ) {

    resetButton.dataset.bound =
      "true";

    resetButton.addEventListener(
      "click",
      resetFilters
    );

  }

}


/* =========================================================
   INIT REPORTS
========================================================= */

export async function initReports() {

  try {

    console.log(
      "CHAMA LIVE: initializing Reports..."
    );

    clearError();

    clearStatus();

    setDefaultDates();

    setupEvents();

    await loadContext();

    await loadData();

    renderReports();

    console.log(
      "CHAMA LIVE: Reports initialized",
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

    showError(error);

    console.error(
      "CHAMA LIVE: Reports initialization failed",
      error
    );

  }

}


/* =========================================================
   REFRESH REPORTS
========================================================= */

export async function refreshReports() {

  try {

    clearError();

    if (!currentGroupId) {

      await loadContext();

    }

    await loadData();

    renderReports();

  }
  catch (error) {

    showError(error);

  }

}


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: reports module ready"
);
