/* =========================================================
   CHAMA LIVE — REPORTS
   SECURE DATABASE-DRIVEN VERSION
   ---------------------------------------------------------
   ACCOUNTING SOURCE OF TRUTH:
       Supabase RPC:
         get_monthly_financial_report()
         get_member_monthly_status()

   SECURITY:
       - Authentication required
       - RPCs execute as SECURITY DEFINER
       - RPC permissions restricted to authenticated users
       - Group membership enforced by database RPCs

   REPORT FEATURES:
       - Opening balance
       - Monthly expected contributions
       - Total contributions collected
       - Previous outstanding
       - Current month applied
       - Carry-forward
       - Current outstanding
       - Approved expenses
       - Closing balance
       - Member payment status
       - Cashbook
       - Expense report
       - Financial period status
       - Print report
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

const monthInput =
  document.getElementById("month");

const loadButton =
  document.getElementById("loadReport");

const printButton =
  document.getElementById("printReport");

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");


const openingBalanceEl =
  document.getElementById("openingBalance");

const expectedEl =
  document.getElementById("expected");

const collectedEl =
  document.getElementById("collected");

const outstandingEl =
  document.getElementById("outstanding");

const approvedExpensesEl =
  document.getElementById("approvedExpenses");

const closingBalanceEl =
  document.getElementById("closingBalance");


const activeMembersEl =
  document.getElementById("activeMembers");

const membersPaidEl =
  document.getElementById("membersPaid");

const membersPartialEl =
  document.getElementById("membersPartial");

const membersOutstandingEl =
  document.getElementById("membersOutstanding");

const collectionRateEl =
  document.getElementById("collectionRate");

const periodStatusEl =
  document.getElementById("periodStatus");


const cashbookRows =
  document.getElementById("cashbookRows");

const memberRows =
  document.getElementById("memberRows");

const expenseRows =
  document.getElementById("expenseRows");


/* =========================================================
   STATE
========================================================= */

let groupId = null;

let currentMember = null;

let group = null;

let members = [];

let contributions = [];

let expenses = [];

let memberStatuses = [];

let reportSummary = null;

let period = null;

let initialized = false;

let loading = false;


/* =========================================================
   HELPERS
========================================================= */

function money(value) {

  return new Intl.NumberFormat(
    "en-KE",
    {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ).format(
    Number(value || 0)
  );

}


/* =========================================================
   ESCAPE HTML
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
   FORMAT MONTH
========================================================= */

function formatMonth(month) {

  if (!month) {

    return "—";

  }


  const parts =
    String(month).split("-");


  if (
    parts.length !== 2
  ) {

    return String(month);

  }


  const year =
    Number(parts[0]);

  const monthNumber =
    Number(parts[1]);


  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthNumber)
  ) {

    return String(month);

  }


  const date =
    new Date(
      year,
      monthNumber - 1,
      1
    );


  return date.toLocaleDateString(
    "en-KE",
    {
      month: "long",
      year: "numeric"
    }
  );

}


/* =========================================================
   CURRENT MONTH
========================================================= */

function currentMonth() {

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

  ].join("-");

}


/* =========================================================
   MONTH KEY
========================================================= */

function monthKey(value) {

  if (!value) {

    return "";

  }


  const text =
    String(value);


  if (
    /^\d{4}-\d{2}/.test(
      text
    )
  ) {

    return text.slice(
      0,
      7
    );

  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "";

  }


  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    )

  ].join("-");

}


/* =========================================================
   ADD MONTHS
========================================================= */

function addMonths(
  month,
  amount
) {

  const [
    year,
    monthNumber
  ] =
    String(month)
      .split("-")
      .map(Number);


  const date =
    new Date(
      year,
      monthNumber - 1 + amount,
      1
    );


  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    )

  ].join("-");

}


/* =========================================================
   ERROR
========================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE Reports:",
    error
  );


  let message =
    error?.message ||
    String(error) ||
    "Unable to load report.";


  const lower =
    message.toLowerCase();


  if (
    lower.includes(
      "authentication required"
    ) ||
    lower.includes(
      "not authenticated"
    ) ||
    lower.includes(
      "jwt"
    )
  ) {

    message =
      "Your session has expired. Please sign in again.";

  }
  else if (
    lower.includes(
      "not a member"
    ) ||
    lower.includes(
      "not belong to this group"
    )
  ) {

    message =
      "You do not have access to this group's financial reports.";

  }
  else if (
    lower.includes(
      "permission denied"
    )
  ) {

    message =
      "You do not have permission to access this financial report.";

  }
  else if (
    lower.includes(
      "invalid month"
    )
  ) {

    message =
      "Please select a valid reporting month.";

  }


  if (errorEl) {

    errorEl.textContent =
      message;

    errorEl.hidden =
      false;

  }

}


/* =========================================================
   CLEAR ERROR
========================================================= */

function clearError() {

  if (errorEl) {

    errorEl.textContent =
      "";

    errorEl.hidden =
      true;

  }

}


/* =========================================================
   STATUS
========================================================= */

function showStatus(message) {

  if (!statusEl) {

    return;

  }


  statusEl.textContent =
    message || "";

}


/* =========================================================
   GET SELECTED MONTH
========================================================= */

function getSelectedMonth() {

  const value =
    String(
      monthInput?.value ||
      ""
    ).trim();


  if (
    /^\d{4}-\d{2}$/.test(
      value
    )
  ) {

    return value;

  }


  return currentMonth();

}


/* =========================================================
   LOAD GROUP
========================================================= */

async function loadGroup() {

  if (!groupId) {

    throw new Error(
      "No group is associated with this account."
    );

  }


  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select(`
        id,
        name,
        monthly_contribution,
        opening_balance,
        category,
        description,
        country
      `)
      .eq(
        "id",
        groupId
      )
      .single();


  if (error) {

    throw error;

  }


  if (!data) {

    throw new Error(
      "Group information could not be loaded."
    );

  }


  group =
    data;

}


/* =========================================================
   LOAD MEMBERS
   ---------------------------------------------------------
   Used by:
       - cashbook names
       - member numbers
       - supplementary report rendering
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
        onboarding_status
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
   ---------------------------------------------------------
   IMPORTANT:
   This is for the CASHBOOK.

   The accounting calculation itself is NOT performed
   here.

   Monthly allocation comes from:
       get_member_monthly_status()

   Financial summary comes from:
       get_monthly_financial_report()
========================================================= */

async function loadContributions(
  month
) {

  const start =
    `${month}-01`;

  const end =
    `${addMonths(
      month,
      1
    )}-01`;


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
        created_at,
        goal_id,
        contribution_date,
        notes,
        mpesa_reference
      `)
      .eq(
        "group_id",
        groupId
      )
      .gte(
        "contribution_date",
        start
      )
      .lt(
        "contribution_date",
        end
      )
      .order(
        "contribution_date",
        {
          ascending: true
        }
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


  contributions =
    data || [];

}


/* =========================================================
   LOAD EXPENSES
========================================================= */

async function loadExpenses(
  month
) {

  const start =
    `${month}-01`;

  const end =
    `${addMonths(
      month,
      1
    )}-01`;


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
      .gte(
        "date",
        start
      )
      .lt(
        "date",
        end
      )
      .order(
        "date",
        {
          ascending: true
        }
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


  expenses =
    data || [];

}


/* =========================================================
   LOAD FINANCIAL PERIOD
========================================================= */

async function loadFinancialPeriod(
  month
) {

  const {
    data,
    error
  } =
    await supabase
      .from("financial_periods")
      .select(`
        id,
        group_id,
        month,
        opening_balance,
        closing_balance,
        status,
        closed_at,
        closed_by,
        created_at
      `)
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "month",
        month
      )
      .limit(1);


  if (error) {

    throw error;

  }


  period =
    data?.[0] ||
    null;

}


/* =========================================================
   LOAD MEMBER MONTHLY STATUS
   ---------------------------------------------------------
   DATABASE IS THE SOURCE OF TRUTH.
========================================================= */

async function loadMemberStatuses(
  month
) {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_member_monthly_status",
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


  memberStatuses =
    data || [];

}


/* =========================================================
   LOAD FINANCIAL REPORT
   ---------------------------------------------------------
   DATABASE IS THE SOURCE OF TRUTH.
========================================================= */

async function loadFinancialReport(
  month
) {

  const {
    data,
    error
  } =
  await supabase.rpc(
    "get_monthly_financial_report",
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


  if (!data) {

    throw new Error(
      "The financial report returned no data."
    );

  }


  reportSummary =
    data;

}


/* =========================================================
   GET MEMBER
========================================================= */

function getMember(
  memberId
) {

  return members.find(
    member =>
      String(
        member.id
      ) ===
      String(
        memberId
      )
  );

}


/* =========================================================
   GET MEMBER NAME
========================================================= */

function getMemberName(
  memberId
) {

  return (
    getMember(
      memberId
    )?.name ||

    memberStatuses.find(
      item =>
        String(
          item.member_id
        ) ===
        String(
          memberId
        )
    )?.member_name ||

    "Member"
  );

}


/* =========================================================
   RENDER SUMMARY
========================================================= */

function renderSummary() {

  const summary =
    reportSummary;


  if (!summary) {

    return;

  }


  if (openingBalanceEl) {

    openingBalanceEl.textContent =
      money(
        summary.opening_balance
      );

  }


  if (expectedEl) {

    expectedEl.textContent =
      money(
        summary.expected_monthly_contributions
      );

  }


  if (collectedEl) {

    collectedEl.textContent =
      money(
        summary.total_contributions_collected
      );

  }


  if (outstandingEl) {

    outstandingEl.textContent =
      money(
        summary.current_outstanding
      );

  }


  if (approvedExpensesEl) {

    approvedExpensesEl.textContent =
      money(
        summary.approved_expenses
      );

  }


  if (closingBalanceEl) {

    closingBalanceEl.textContent =
      money(
        summary.closing_balance
      );

  }


  if (activeMembersEl) {

    activeMembersEl.textContent =
      Number(
        summary.active_members ||
        0
      );

  }


  if (membersPaidEl) {

    membersPaidEl.textContent =
      Number(
        summary.members_paid ||
        0
      );

  }


  if (membersPartialEl) {

    membersPartialEl.textContent =
      Number(
        summary.partial_payments ||
        0
      );

  }


  if (membersOutstandingEl) {

    membersOutstandingEl.textContent =
      Number(
        summary.outstanding_members ||
        0
      );

  }


  if (collectionRateEl) {

    collectionRateEl.textContent =
      `${Number(
        summary.collection_rate ||
        0
      ).toFixed(1)}%`;

  }


  if (periodStatusEl) {

    periodStatusEl.textContent =
      String(
        summary.period_status ||
        period?.status ||
        "open"
      ).toUpperCase();

  }

}


/* =========================================================
   RENDER NEW CONTRIBUTION METRICS
========================================================= */

function renderNewContributionMetrics() {

  const summary =
    reportSummary;


  if (!summary) {

    return;

  }


  const appliedEl =
    document.getElementById(
      "currentMonthApplied"
    );


  const carryForwardEl =
    document.getElementById(
      "carryForward"
    );


  const previousOutstandingEl =
    document.getElementById(
      "previousOutstanding"
    );


  if (appliedEl) {

    appliedEl.textContent =
      money(
        summary.applied_this_month
      );

  }


  if (carryForwardEl) {

    carryForwardEl.textContent =
      money(
        summary.carry_forward
      );

  }


  if (previousOutstandingEl) {

    /*
     * The summary RPC intentionally does not need
     * to duplicate member rows.

     * Calculate total previous outstanding directly
     * from the authoritative member RPC results.
     */

    const previousOutstanding =
      memberStatuses.reduce(
        (
          total,
          item
        ) =>
          total +
          Number(
            item.previous_outstanding ||
            0
          ),
        0
      );


    previousOutstandingEl.textContent =
      money(
        previousOutstanding
      );

  }

}


/* =========================================================
   RENDER CASHBOOK
========================================================= */

function renderCashbook(
  month
) {

  if (!cashbookRows) {

    return;

  }


  const contributionEntries =
    contributions.map(
      contribution => {

        return {

          date:
            contribution.contribution_date ||
            contribution.created_at,

          description:
            getMemberName(
              contribution.member_id
            ),

          type:
            contribution.contribution_type ||
            "Contribution",

          method:
            contribution.payment_method ||
            "—",

          reference:
            contribution.mpesa_reference ||
            contribution.reference ||
            "—",

          amount:
            Number(
              contribution.amount ||
              0
            ),

          income:
            true

        };

      }
    );


  const expenseEntries =
    expenses
      .filter(
        expense =>
          String(
            expense.approval_status ||
            ""
          ).toLowerCase() ===
          "approved"
      )
      .map(
        expense => {

          return {

            date:
              expense.date,

            description:
              expense.description ||
              "Expense",

            type:
              "Expense",

            method:
              "—",

            reference:
              expense.receipt_url ||
              "—",

            amount:
              Number(
                expense.amount ||
                0
              ),

            income:
              false

          };

        }
      );


  const entries =
    [
      ...contributionEntries,
      ...expenseEntries
    ]
      .sort(
        (
          a,
          b
        ) => {

          const dateA =
            new Date(
              a.date
            ).getTime();


          const dateB =
            new Date(
              b.date
            ).getTime();


          if (
            dateA !==
            dateB
          ) {

            return (
              dateA -
              dateB
            );

          }


          /*
           * Income before expenses
           * when dates are identical.
           */

          if (
            a.income ===
            b.income
          ) {

            return 0;

          }


          return a.income
            ? -1
            : 1;

        }
      );


  if (!entries.length) {

    cashbookRows.innerHTML = `
      <tr>
        <td colspan="6">
          No transactions recorded for ${escapeHtml(
            formatMonth(month)
          )}.
        </td>
      </tr>
    `;

    return;

  }


  cashbookRows.innerHTML =
    entries
      .map(
        entry => {

          const amount =
            entry.income

              ? `+${money(
                  entry.amount
                )}`

              : `-${money(
                  entry.amount
                )}`;


          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    entry.date
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.description
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.type
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.method
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.reference
                )}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    amount
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
   RENDER MEMBER REPORT
========================================================= */

function renderMembers() {

  if (!memberRows) {

    return;

  }


  if (!memberStatuses.length) {

    memberRows.innerHTML = `
      <tr>
        <td colspan="9">
          No active members found.
        </td>
      </tr>
    `;

    return;

  }


  memberRows.innerHTML =
    memberStatuses
      .map(
        item => {

          const member =
            getMember(
              item.member_id
            );


          const memberName =
            item.member_name ||
            member?.name ||
            "Unknown member";


          const memberNumber =
            item.member_number ||
            member?.member_number ||
            member?.membership_number ||
            "—";


          const status =
            String(
              item.contribution_status ||
              "Outstanding"
            );


          const statusClass =
            status
              .toLowerCase();


          return `
            <tr>

              <td>
                <strong>
                  ${escapeHtml(
                    memberName
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  memberNumber
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    item.monthly_due
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    item.previous_outstanding
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    item.applied_this_month
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    item.carry_forward
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    item.current_outstanding
                  )
                )}
              </td>

              <td>

                <strong
                  class="
                    report-status
                    report-status-${escapeHtml(
                      statusClass
                    )}
                  "
                >
                  ${escapeHtml(
                    status
                  )}
                </strong>

              </td>

              <td>
                ${escapeHtml(
                  money(
                    item.payment_this_month
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
   RENDER EXPENSES
========================================================= */

function renderExpenses() {

  if (!expenseRows) {

    return;

  }


  if (!expenses.length) {

    expenseRows.innerHTML = `
      <tr>
        <td colspan="5">
          No expenses recorded for this month.
        </td>
      </tr>
    `;

    return;

  }


  expenseRows.innerHTML =
    expenses
      .map(
        expense => {

          const status =
            String(
              expense.approval_status ||
              "pending"
            ).toLowerCase();


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
                  expense.category
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    expense.amount
                  )
                )}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    status
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
   RENDER EVERYTHING
========================================================= */

function renderReport(
  month
) {

  renderSummary();

  renderNewContributionMetrics();

  renderCashbook(
    month
  );

  renderMembers();

  renderExpenses();

}


/* =========================================================
   LOAD REPORT
========================================================= */

async function loadReport() {

  if (loading) {

    return;

  }


  loading =
    true;


  const month =
    getSelectedMonth();


  if (monthInput) {

    monthInput.value =
      month;

  }


  clearError();


  try {

    showStatus(
      `Loading report for ${formatMonth(
        month
      )}...`
    );


    /*
     * Load the group.
     */

    await loadGroup();


    /*
     * Load members for names and numbers.
     */

    await loadMembers();


    /*
     * Load selected month's transactions.
     */

    await loadContributions(
      month
    );


    await loadExpenses(
      month
    );


    /*
     * Load period metadata.
     */

    await loadFinancialPeriod(
      month
    );


    /*
     * IMPORTANT:
     *
     * These two RPCs are now the authoritative
     * accounting engine.
     */

    await loadMemberStatuses(
      month
    );


    await loadFinancialReport(
      month
    );


    /*
     * Render.
     */

    renderReport(
      month
    );


    showStatus(
      `Report loaded for ${formatMonth(
        month
      )}.`
    );


  }
  catch (error) {

    showStatus("");

    showError(
      error
    );

  }
  finally {

    loading =
      false;

  }

}


/* =========================================================
   PRINT
========================================================= */

function printReport() {

  window.print();

}


/* =========================================================
   EVENT HANDLERS
========================================================= */

function bindEvents() {

  if (loadButton) {

    loadButton.addEventListener(
      "click",
      loadReport
    );

  }


  if (printButton) {

    printButton.addEventListener(
      "click",
      printReport
    );

  }


  if (monthInput) {

    monthInput.addEventListener(
      "change",
      () => {

        clearError();

      }
    );

  }

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initPage() {

  if (initialized) {

    console.log(
      "CHAMA LIVE: reports already initialized"
    );

    return;

  }


  initialized =
    true;


  try {

    clearError();


    showStatus(
      "Checking account..."
    );


    /*
     * Authentication.
     */

    await requireAuth();


    /*
     * Current member.
     */

    currentMember =
      await getMyMember();


    if (
      !currentMember
    ) {

      throw new Error(
        "No member record is linked to your account."
      );

    }


    if (
      !currentMember.id
    ) {

      throw new Error(
        "Your member record does not have a valid ID."
      );

    }


    if (
      !currentMember.group_id
    ) {

      throw new Error(
        "No group is linked to your account."
      );

    }


    groupId =
      currentMember.group_id;


    /*
     * Default month.
     */

    const month =
      currentMonth();


    if (monthInput) {

      monthInput.value =
        month;

    }


    /*
     * Events.
     */

    bindEvents();


    /*
     * Initial report.
     */

    await loadReport();


    console.log(
      "CHAMA LIVE: reports page ready"
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
   BACKWARD COMPATIBILITY
========================================================= */

export const initReports =
  initPage;


export async function init() {

  return initPage();

}


/* =========================================================
   OPTIONAL PUBLIC REFRESH
========================================================= */

export async function refreshReports() {

  if (!groupId) {

    return;

  }


  await loadReport();

}


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: reports.js ready"
);

