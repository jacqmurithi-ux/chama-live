/* =========================================================
   CHAMA LIVE — REPORTS
   COMPLETE SCHEMA-ALIGNED VERSION

   FEATURES
   ---------------------------------------------------------
   • Group financial summary
   • Member count
   • Contribution totals
   • Expense totals
   • Approved / pending / rejected expenses
   • Current balance
   • Contribution vs expense comparison
   • Monthly contribution breakdown
   • Monthly expense breakdown
   • Meeting statistics
   • Recent contributions
   • Recent approved expenses
   • Date filtering
   • Print report
   • CSV export

   IMPORTANT DATABASE RULE
   ---------------------------------------------------------
   contributions.recorded_by -> members.id
   expenses.recorded_by      -> members.id

   Therefore:
       recorded_by = currentMember.id

   NOT:
       recorded_by = currentUser.id
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember
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

const generateButton =
  document.getElementById("generateReport");

const printButton =
  document.getElementById("printReport");

const csvButton =
  document.getElementById("exportCsv");


/* SUMMARY */

const membersTotalEl =
  document.getElementById("membersTotal");

const contributionsTotalEl =
  document.getElementById("contributionsTotal");

const approvedExpensesEl =
  document.getElementById("approvedExpenses");

const balanceTotalEl =
  document.getElementById("balanceTotal");

const pendingExpensesEl =
  document.getElementById("pendingExpenses");

const rejectedExpensesEl =
  document.getElementById("rejectedExpenses");


/* BREAKDOWN */

const contributionBreakdownRows =
  document.getElementById(
    "contributionBreakdownRows"
  );

const expenseBreakdownRows =
  document.getElementById(
    "expenseBreakdownRows"
  );


/* RECENT */

const contributionRows =
  document.getElementById(
    "reportContributionRows"
  );

const expenseRows =
  document.getElementById(
    "reportExpenseRows"
  );


/* MEETINGS */

const meetingsTotalEl =
  document.getElementById(
    "meetingsTotal"
  );

const upcomingMeetingsEl =
  document.getElementById(
    "upcomingMeetings"
  );

const completedMeetingsEl =
  document.getElementById(
    "completedMeetings"
  );

const cancelledMeetingsEl =
  document.getElementById(
    "cancelledMeetings"
  );


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentMember = null;

let groupId = null;

let members = [];

let contributions = [];

let expenses = [];

let meetings = [];

let initialized = false;


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

  const date =
    new Date();


  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    ),

    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    )

  ].join("-");

}


function getMonthStart() {

  const date =
    new Date();

  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1
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
    "Unable to generate report.";

  errorEl.hidden =
    false;

}


function clearError() {

  if (errorEl) {

    errorEl.textContent =
      "";

    errorEl.hidden =
      true;

  }

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
        full_name,
        status
      `)
      .eq(
        "group_id",
        groupId
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

  let query =
    supabase
      .from("contributions")
      .select(`
        id,
        group_id,
        amount,
        date,
        type,
        payment_method,
        mpesa_reference,
        recorded_by,
        created_at
      `)
      .eq(
        "group_id",
        groupId
      );


  const fromDate =
    fromDateInput?.value ||
    "";


  const toDate =
    toDateInput?.value ||
    "";


  if (fromDate) {

    query =
      query.gte(
        "date",
        fromDate
      );

  }


  if (toDate) {

    query =
      query.lte(
        "date",
        toDate
      );

  }


  const {
    data,
    error
  } =
    await query
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


  contributions =
    data || [];

}


/* =========================================================
   LOAD EXPENSES
========================================================= */

async function loadExpenses() {

  let query =
    supabase
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
      );


  const fromDate =
    fromDateInput?.value ||
    "";


  const toDate =
    toDateInput?.value ||
    "";


  if (fromDate) {

    query =
      query.gte(
        "date",
        fromDate
      );

  }


  if (toDate) {

    query =
      query.lte(
        "date",
        toDate
      );

  }


  const {
    data,
    error
  } =
    await query
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

  let query =
    supabase
      .from("meetings")
      .select(`
        id,
        group_id,
        title,
        date,
        venue,
        status,
        created_at
      `)
      .eq(
        "group_id",
        groupId
      );


  const fromDate =
    fromDateInput?.value ||
    "";


  const toDate =
    toDateInput?.value ||
    "";


  if (fromDate) {

    query =
      query.gte(
        "date",
        fromDate
      );

  }


  if (toDate) {

    query =
      query.lte(
        "date",
        toDate
      );

  }


  const {
    data,
    error
  } =
    await query
      .order(
        "date",
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
   LOAD ALL DATA
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

}


/* =========================================================
   SUMMARY
========================================================= */

function renderSummary() {

  let contributionTotal =
    0;

  let approvedExpenses =
    0;

  let pendingExpenses =
    0;

  let rejectedExpenses =
    0;


  contributions.forEach(
    contribution => {

      contributionTotal +=
        Number(
          contribution.amount ||
          0
        );

    }
  );


  expenses.forEach(
    expense => {

      const amount =
        Number(
          expense.amount ||
          0
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
    contributionTotal -
    approvedExpenses;


  if (membersTotalEl) {

    membersTotalEl.textContent =
      number(
        members.length
      );

  }


  if (contributionsTotalEl) {

    contributionsTotalEl.textContent =
      money(
        contributionTotal
      );

  }


  if (approvedExpensesEl) {

    approvedExpensesEl.textContent =
      money(
        approvedExpenses
      );

  }


  if (balanceTotalEl) {

    balanceTotalEl.textContent =
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

}


/* =========================================================
   MEMBER NAME
========================================================= */

function memberName(
  memberId
) {

  const member =
    members.find(
      item =>
        String(
          item.id
        ) ===
        String(
          memberId
        )
    );


  if (!member) {

    return "Unknown member";

  }


  return (
    member.full_name ||
    "Unnamed member"
  );

}


/* =========================================================
   MONTHLY CONTRIBUTIONS
========================================================= */

function renderContributionBreakdown() {

  if (!contributionBreakdownRows) {

    return;

  }


  const months = {};


  contributions.forEach(
    contribution => {

      const date =
        String(
          contribution.date ||
          ""
        );


      const month =
        date.slice(
          0,
          7
        );


      if (!month) {

        return;

      }


      if (!months[month]) {

        months[month] = {
          count: 0,
          amount: 0
        };

      }


      months[month].count +=
        1;

      months[month].amount +=
        Number(
          contribution.amount ||
          0
        );

    }
  );


  const list =
    Object.entries(
      months
    )
      .sort(
        ([a], [b]) =>
          b.localeCompare(a)
      );


  if (!list.length) {

    contributionBreakdownRows.innerHTML = `
      <tr>
        <td colspan="3">
          No contribution data found.
        </td>
      </tr>
    `;

    return;

  }


  contributionBreakdownRows.innerHTML =
    list
      .map(
        ([month, data]) => {

          const label =
            new Date(
              `${month}-01T00:00:00`
            )
              .toLocaleDateString(
                "en-KE",
                {
                  year: "numeric",
                  month: "long"
                }
              );


          return `
            <tr>

              <td>
                ${escapeHtml(label)}
              </td>

              <td>
                ${number(data.count)}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    money(data.amount)
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
   MONTHLY EXPENSES
========================================================= */

function renderExpenseBreakdown() {

  if (!expenseBreakdownRows) {

    return;

  }


  const months = {};


  expenses.forEach(
    expense => {

      if (
        normalizeExpenseStatus(
          expense.approval_status
        ) !==
        "approved"
      ) {

        return;

      }


      const date =
        String(
          expense.date ||
          ""
        );


      const month =
        date.slice(
          0,
          7
        );


      if (!month) {

        return;

      }


      if (!months[month]) {

        months[month] = {
          count: 0,
          amount: 0
        };

      }


      months[month].count +=
        1;

      months[month].amount +=
        Number(
          expense.amount ||
          0
        );

    }
  );


  const list =
    Object.entries(
      months
    )
      .sort(
        ([a], [b]) =>
          b.localeCompare(a)
      );


  if (!list.length) {

    expenseBreakdownRows.innerHTML = `
      <tr>
        <td colspan="3">
          No approved expense data found.
        </td>
      </tr>
    `;

    return;

  }


  expenseBreakdownRows.innerHTML =
    list
      .map(
        ([month, data]) => {

          const label =
            new Date(
              `${month}-01T00:00:00`
            )
              .toLocaleDateString(
                "en-KE",
                {
                  year: "numeric",
                  month: "long"
                }
              );


          return `
            <tr>

              <td>
                ${escapeHtml(label)}
              </td>

              <td>
                ${number(data.count)}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    money(data.amount)
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
   RECENT CONTRIBUTIONS
========================================================= */

function renderContributionLedger() {

  if (!contributionRows) {

    return;

  }


  const list =
    contributions.slice(
      0,
      20
    );


  if (!list.length) {

    contributionRows.innerHTML = `
      <tr>
        <td colspan="5">
          No contributions found.
        </td>
      </tr>
    `;

    return;

  }


  contributionRows.innerHTML =
    list
      .map(
        contribution => {

          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    contribution.date
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  memberName(
                    contribution.recorded_by
                  )
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
                  contribution.type ||
                  "monthly"
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
   APPROVED EXPENSE LEDGER
========================================================= */

function renderExpenseLedger() {

  if (!expenseRows) {

    return;

  }


  const list =
    expenses
      .filter(
        expense =>
          normalizeExpenseStatus(
            expense.approval_status
          ) ===
          "approved"
      )
      .slice(
        0,
        20
      );


  if (!list.length) {

    expenseRows.innerHTML = `
      <tr>
        <td colspan="5">
          No approved expenses found.
        </td>
      </tr>
    `;

    return;

  }


  expenseRows.innerHTML =
    list
      .map(
        expense => {

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
                  expense.description
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
                  memberName(
                    expense.recorded_by
                  )
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   MEETING REPORT
========================================================= */

function renderMeetingSummary() {

  const upcoming =
    meetings.filter(
      meeting =>
        String(
          meeting.status ||
          "upcoming"
        )
          .toLowerCase() ===
        "upcoming"
    ).length;


  const completed =
    meetings.filter(
      meeting =>
        String(
          meeting.status ||
          ""
        )
          .toLowerCase() ===
        "completed"
    ).length;


  const cancelled =
    meetings.filter(
      meeting =>
        String(
          meeting.status ||
          ""
        )
          .toLowerCase() ===
        "cancelled"
    ).length;


  if (meetingsTotalEl) {

    meetingsTotalEl.textContent =
      number(
        meetings.length
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
   RENDER EVERYTHING
========================================================= */

function renderReport() {

  renderSummary();

  renderContributionBreakdown();

  renderExpenseBreakdown();

  renderContributionLedger();

  renderExpenseLedger();

  renderMeetingSummary();

}


/* =========================================================
   GENERATE
========================================================= */

async function generateReport() {

  try {

    clearError();

    showStatus(
      "Generating report..."
    );


    const fromDate =
      fromDateInput?.value ||
      "";

    const toDate =
      toDateInput?.value ||
      "";


    if (
      fromDate &&
      toDate &&
      fromDate >
      toDate
    ) {

      throw new Error(
        "The From date cannot be after the To date."
      );

    }


    if (generateButton) {

      generateButton.disabled =
        true;

      generateButton.textContent =
        "Generating...";

    }


    await loadReportData();

    renderReport();


    showStatus(
      "Report generated successfully."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      2500
    );

  }
  catch (error) {

    showStatus("");

    showError(
      error
    );

  }
  finally {

    if (generateButton) {

      generateButton.disabled =
        false;

      generateButton.textContent =
        "Generate Report";

    }

  }

}


/* =========================================================
   CSV EXPORT
========================================================= */

function csvEscape(value) {

  const text =
    String(
      value ?? ""
    );


  return `"${text.replaceAll(
    '"',
    '""'
  )}"`;

}


function exportCsv() {

  try {

    const rows = [
      [
        "Type",
        "Date",
        "Description",
        "Category",
        "Amount",
        "Status",
        "Member / Recorded By",
        "Payment Method"
      ]
    ];


    contributions.forEach(
      contribution => {

        rows.push([
          "Contribution",

          contribution.date ||
          "",

          "Contribution",

          contribution.type ||
          "",

          contribution.amount ||
          0,

          "recorded",

          memberName(
            contribution.recorded_by
          ),

          contribution.payment_method ||
          ""
        ]);

      }
    );


    expenses.forEach(
      expense => {

        rows.push([
          "Expense",

          expense.date ||
          "",

          expense.description ||
          "",

          expense.category ||
          "",

          expense.amount ||
          0,

          normalizeExpenseStatus(
            expense.approval_status
          ),

          memberName(
            expense.recorded_by
          ),

          ""
        ]);

      }
    );


    const csv =
      rows
        .map(
          row =>
            row
              .map(csvEscape)
              .join(",")
        )
        .join("\r\n");


    const blob =
      new Blob(
        [
          "\ufeff",
          csv
        ],
        {
          type:
            "text/csv;charset=utf-8;"
        }
      );


    const url =
      URL.createObjectURL(
        blob
      );


    const link =
      document.createElement(
        "a"
      );


    link.href =
      url;

    link.download =
      `chama-live-report-${getToday()}.csv`;


    document.body.appendChild(
      link
    );


    link.click();


    link.remove();


    URL.revokeObjectURL(
      url
    );


    showStatus(
      "CSV report exported."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      2500
    );

  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =========================================================
   PRINT
========================================================= */

function printReport() {

  window.print();

}


/* =========================================================
   DEFAULT FILTER
========================================================= */

function setDefaultDates() {

  if (fromDateInput) {

    fromDateInput.value =
      getMonthStart();

  }


  if (toDateInput) {

    toDateInput.value =
      getToday();

  }

}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  generateButton?.addEventListener(
    "click",
    generateReport
  );


  printButton?.addEventListener(
    "click",
    printReport
  );


  csvButton?.addEventListener(
    "click",
    exportCsv
  );

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initPage() {

  if (initialized) {

    return;

  }


  initialized =
    true;


  try {

    clearError();

    showStatus(
      "Loading reports..."
    );


    currentUser =
      await requireAuth();


    if (!currentUser) {

      throw new Error(
        "You are not signed in."
      );

    }


    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "No member record is linked to this account."
      );

    }


    groupId =
      currentMember.group_id;


    if (!groupId) {

      throw new Error(
        "Your member record is not linked to a group."
      );

    }


    console.log(
      "CHAMA LIVE: reports context",
      {
        userId:
          currentUser.id,

        memberId:
          currentMember.id,

        groupId:
          groupId
      }
    );


    setDefaultDates();

    setupEvents();


    await generateReport();


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


export const initReports =
  initPage;


/* =========================================================
   AUTO BOOT
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      initPage();

    },
    {
      once: true
    }
  );

}
else {

  initPage();

}


console.log(
  "CHAMA LIVE: reports.js ready"
);
