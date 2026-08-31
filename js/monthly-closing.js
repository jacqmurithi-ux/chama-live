/* =========================================================
   CHAMA LIVE — MONTHLY CLOSING
   CANONICAL 2B VERSION
   ---------------------------------------------------------

   ACCOUNTING SOURCES
   ---------------------------------------------------------
   Monthly accounting:
       get_canonical_monthly_accounting_summary()

   Member accounting:
       get_canonical_member_monthly_status()

   CASH CLOSING:
       Opening Balance
       + Actual Cash Contributions Received
       - Approved Expenses
       = Closing Balance

   CONTRIBUTION ACCOUNTING:
       Expected Monthly Obligations
       Applied To Current Month Obligations
       Outstanding
       Carry-forward

   IMPORTANT 2B RULE
   ---------------------------------------------------------
   "Total Collected" means ACTUAL CASH RECEIVED during
   the selected financial month.

   "Applied This Month" means the amount allocated against
   the selected month's obligations.

   These are NOT necessarily the same amount.

   Example:

       August cash payment
              ↓
       September obligation
              ↓
       September allocation

   Therefore:

       September Cash Received = KES 0
       September Applied       = KES 300

   Collection progress is based on APPLICATION against
   current-month obligations.

   CASH CLOSING MUST NEVER USE APPLICATION.

   ---------------------------------------------------------
   RLS IDENTITY RULE
   ---------------------------------------------------------
   monthly_closings.closed_by references auth.users.id.

   Therefore:

       closed_by = currentUser.id

   NOT:

       closed_by = currentMember.id

   ---------------------------------------------------------
   REQUIRED EXPORTS
   ---------------------------------------------------------
       initPage()
       initMonthlyClosing
========================================================= */


import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember
} from "./auth.js";


console.log(
  "CHAMA LIVE: monthly-closing.js loaded"
);


/* =========================================================
   ELEMENT HELPER
   ---------------------------------------------------------
   Supports both the current canonical IDs and older IDs.
========================================================= */

function getElement(...ids) {

  for (const id of ids) {

    const element =
      document.getElementById(id);

    if (element) {
      return element;
    }

  }

  return null;

}


/* =========================================================
   ELEMENTS
========================================================= */

const statusEl =
  getElement(
    "status"
  );


const errorEl =
  getElement(
    "error"
  );


const monthInput =
  getElement(
    "closingMonth",
    "month"
  );


const calculateButton =
  getElement(
    "calculateClosing",
    "calculate"
  );


const closeButton =
  getElement(
    "closeMonth"
  );


const notesInput =
  getElement(
    "closingNotes",
    "notes"
  );


const expectedEl =
  getElement(
    "totalExpected",
    "expected"
  );


const collectedEl =
  getElement(
    "totalCollected",
    "collected"
  );


const expensesEl =
  getElement(
    "totalExpenses",
    "approvedExpenses",
    "expenses"
  );


const balanceEl =
  getElement(
    "closingBalance",
    "balance"
  );


const previousBalanceEl =
  getElement(
    "previousBalance",
    "openingBalance"
  );


const closingStatusEl =
  getElement(
    "closingStatus",
    "periodStatus"
  );


const closingRows =
  getElement(
    "closingRows"
  );


const selectedMonthLabel =
  getElement(
    "selectedMonthLabel",
    "selectedMonth"
  );


const collectionProgress =
  getElement(
    "collectionProgress"
  );


const collectionProgressText =
  getElement(
    "collectionProgressText"
  );


const collectionDifference =
  getElement(
    "collectionDifference"
  );


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentMember = null;

let groupId = null;

let currentClosing = null;

let calculatedData = null;

let canonicalStatus = [];

let initialized = false;


/* =========================================================
   MONEY
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


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

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

  statusEl.hidden =
    !message;

}


function showError(error) {

  console.error(
    "CHAMA LIVE Monthly Closing:",
    error
  );

  if (!errorEl) {
    return;
  }

  errorEl.textContent =
    error?.message ||
    String(error) ||
    "Unable to process monthly closing.";

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
   MONTH
========================================================= */

function getCurrentMonth() {

  const date =
    new Date();

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


/* =========================================================
   SELECTED MONTH
========================================================= */

function renderSelectedMonth() {

  if (!selectedMonthLabel) {
    return;
  }

  const month =
    monthInput?.value;

  selectedMonthLabel.textContent =
    month
      ? formatMonth(month)
      : "Select a month";

}


/* =========================================================
   OPTIONAL 2B ELEMENTS
========================================================= */

function renderOptionalAccountingFields(data) {

  if (!data) {
    return;
  }


  const appliedEl =
    getElement(
      "appliedThisMonth"
    );

  if (appliedEl) {

    appliedEl.textContent =
      money(
        data.applied_this_month
      );

  }


  const carryForwardEl =
    getElement(
      "carryForward"
    );

  if (carryForwardEl) {

    carryForwardEl.textContent =
      money(
        data.carry_forward
      );

  }


  const outstandingEl =
    getElement(
      "currentOutstanding"
    );

  if (outstandingEl) {

    outstandingEl.textContent =
      money(
        data.current_outstanding
      );

  }


  const cashReceivedEl =
    getElement(
      "cashReceived"
    );

  if (cashReceivedEl) {

    cashReceivedEl.textContent =
      money(
        data.total_contributions_collected
      );

  }


  const collectionLabelEl =
    getElement(
      "collectionProgressLabel"
    );

  if (collectionLabelEl) {

    collectionLabelEl.textContent =
      "Applied to current month obligations";

  }


  const collectedLabelEl =
    getElement(
      "totalCollectedLabel"
    );

  if (collectedLabelEl) {

    collectedLabelEl.textContent =
      "Actual cash received";

  }

}


/* =========================================================
   LOAD EXISTING CLOSING
========================================================= */

async function loadExistingClosing(
  month
) {

  const {
    data,
    error
  } =
    await supabase
      .from(
        "monthly_closings"
      )
      .select(`
        id,
        group_id,
        closing_month,
        closed_by,
        closed_at,
        total_expected,
        total_collected,
        total_expenses,
        closing_balance,
        notes
      `)
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "closing_month",
        `${month}-01`
      )
      .maybeSingle();


  if (error) {
    throw error;
  }


  currentClosing =
    data || null;

}


/* =========================================================
   LOAD HISTORY
========================================================= */

async function loadClosingHistory() {

  if (!closingRows) {
    return;
  }


  const {
    data,
    error
  } =
    await supabase
      .from(
        "monthly_closings"
      )
      .select(`
        id,
        closing_month,
        closed_at,
        total_expected,
        total_collected,
        total_expenses,
        closing_balance,
        notes
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "closing_month",
        {
          ascending: false
        }
      );


  if (error) {
    throw error;
  }


  if (!data?.length) {

    closingRows.innerHTML = `
      <tr>
        <td colspan="7">

          <div class="empty-state">

            <div class="empty-state-icon">
              ▣
            </div>

            <strong>
              No monthly closings yet
            </strong>

            <span>
              Closed financial months will
              appear here.
            </span>

          </div>

        </td>
      </tr>
    `;

    return;

  }


  closingRows.innerHTML =
    data
      .map(
        closing => {

          const balance =
            Number(
              closing.closing_balance || 0
            );


          const balanceClass =
            balance < 0
              ? "amount-negative"
              : balance > 0
                ? "amount-positive"
                : "";


          return `
            <tr>

              <td>
                <strong>
                  ${escapeHtml(
                    formatMonth(
                      String(
                        closing.closing_month
                      ).slice(
                        0,
                        7
                      )
                    )
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  money(
                    closing.total_expected
                  )
                )}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    money(
                      closing.total_collected
                    )
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  money(
                    closing.total_expenses
                  )
                )}
              </td>

              <td>
                <strong
                  class="${balanceClass}"
                >
                  ${escapeHtml(
                    money(
                      balance
                    )
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  formatDate(
                    closing.closed_at
                  )
                )}
              </td>

              <td class="history-notes">
                ${escapeHtml(
                  closing.notes ||
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
   GET OPENING BALANCE
========================================================= */

async function getOpeningBalance(
  month
) {

  const monthStart =
    `${month}-01`;


  /* -------------------------------------------------------
     FIRST:
     Previous closed financial period
  ------------------------------------------------------- */

  const {
    data: previousPeriod,
    error:
      previousPeriodError
  } =
    await supabase
      .from(
        "financial_periods"
      )
      .select(`
        closing_balance,
        month,
        status
      `)
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "status",
        "closed"
      )
      .lt(
        "month",
        month
      )
      .order(
        "month",
        {
          ascending: false
        }
      )
      .limit(1)
      .maybeSingle();


  if (
    previousPeriodError
  ) {

    console.warn(
      "CHAMA LIVE: financial_periods lookup:",
      previousPeriodError
    );

  }


  if (
    previousPeriod?.closing_balance !== null &&
    previousPeriod?.closing_balance !== undefined
  ) {

    return Number(
      previousPeriod.closing_balance || 0
    );

  }


  /* -------------------------------------------------------
     SECOND:
     Previous monthly closing
  ------------------------------------------------------- */

  const {
    data: previousClosing,
    error:
      previousClosingError
  } =
    await supabase
      .from(
        "monthly_closings"
      )
      .select(`
        closing_balance,
        closing_month
      `)
      .eq(
        "group_id",
        groupId
      )
      .lt(
        "closing_month",
        monthStart
      )
      .order(
        "closing_month",
        {
          ascending: false
        }
      )
      .limit(1)
      .maybeSingle();


  if (
    previousClosingError
  ) {

    console.warn(
      "CHAMA LIVE: previous monthly closing lookup:",
      previousClosingError
    );

  }


  if (
    previousClosing?.closing_balance !== null &&
    previousClosing?.closing_balance !== undefined
  ) {

    return Number(
      previousClosing.closing_balance || 0
    );

  }


  /* -------------------------------------------------------
     FINAL:
     Group opening balance
  ------------------------------------------------------- */

  const {
    data: group,
    error:
      groupError
  } =
    await supabase
      .from(
        "groups"
      )
      .select(`
        opening_balance
      `)
      .eq(
        "id",
        groupId
      )
      .single();


  if (groupError) {
    throw groupError;
  }


  return Number(
    group?.opening_balance || 0
  );

}


/* =========================================================
   LOAD CANONICAL ACCOUNTING
========================================================= */

async function loadCanonicalAccounting(
  month
) {

  showStatus(
    `Calculating ${formatMonth(month)}...`
  );


  /* -------------------------------------------------------
     CANONICAL MEMBER STATUS
  ------------------------------------------------------- */

  const {
    data: statusData,
    error: statusError
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


  if (statusError) {
    throw statusError;
  }


  canonicalStatus =
    statusData || [];


  /* -------------------------------------------------------
     CANONICAL MONTHLY SUMMARY
  ------------------------------------------------------- */

  const {
    data: summaryData,
    error: summaryError
  } =
    await supabase
      .rpc(
        "get_canonical_monthly_accounting_summary",
        {
          p_group_id:
            groupId,

          p_month:
            month
        }
      );


  if (summaryError) {
    throw summaryError;
  }


  if (!summaryData) {

    throw new Error(
      "No canonical accounting summary was returned."
    );

  }


  const summary =
    Array.isArray(
      summaryData
    )
      ? summaryData[0]
      : summaryData;


  if (!summary) {

    throw new Error(
      "The canonical accounting summary is empty."
    );

  }


  /* -------------------------------------------------------
     APPROVED EXPENSES
  ------------------------------------------------------- */

  const monthStart =
    `${month}-01`;


  const monthDate =
    new Date(
      `${month}-01T00:00:00`
    );


  monthDate.setMonth(
    monthDate.getMonth() + 1
  );


  const monthEnd =
    [
      monthDate.getFullYear(),

      String(
        monthDate.getMonth() + 1
      ).padStart(
        2,
        "0"
      ),

      "01"

    ].join("-");


  const {
    data: expenseRows,
    error: expenseError
  } =
    await supabase
      .from(
        "expenses"
      )
      .select(`
        id,
        amount,
        date,
        approval_status
      `)
      .eq(
        "group_id",
        groupId
      )
      .gte(
        "date",
        monthStart
      )
      .lt(
        "date",
        monthEnd
      )
      .eq(
        "approval_status",
        "approved"
      );


  if (expenseError) {
    throw expenseError;
  }


  const approvedExpenses =
    (expenseRows || [])
      .reduce(
        (
          total,
          expense
        ) =>
          total +
          Number(
            expense.amount || 0
          ),

        0
      );


  /* -------------------------------------------------------
     OPENING BALANCE
  ------------------------------------------------------- */

  const openingBalance =
    await getOpeningBalance(
      month
    );


  /* =======================================================
     CANONICAL 2B VALUES
  ======================================================= */

  /*
     ACTUAL CASH RECEIVED

     This is contribution cash actually recorded
     during the selected financial month.

     It belongs in CASH CLOSING.
  */

  const totalCollected =
    Number(
      summary
        .total_contributions_collected ||
      0
    );


  /*
     EXPECTED MONTHLY OBLIGATIONS
  */

  const expected =
    Number(
      summary
        .expected_monthly_contributions ||
      0
    );


  /*
     APPLICATION AGAINST CURRENT MONTH

     This can originate from:
       - current-month cash
       - earlier payment
       - carry-forward credit
  */

  const applied =
    Number(
      summary
        .applied_this_month ||
      0
    );


  /*
     CARRY-FORWARD CREDIT
  */

  const carryForward =
    Number(
      summary
        .carry_forward ||
      0
    );


  /*
     CURRENT OUTSTANDING
  */

  const outstanding =
    Number(
      summary
        .current_outstanding ||
      0
    );


  /* =======================================================
     CASH CLOSING
     -------------------------------------------------------

       opening balance
       + actual cash received
       - approved expenses

     NEVER use "applied" here.

     Example:

       September opening       -150
       September cash received    0
       September expenses         0

       Closing balance = -150

     Even if:

       September applied = 300

     the KES 300 is NOT September cash.
  ======================================================= */

  const closingBalance =
    openingBalance +
    totalCollected -
    approvedExpenses;


  /* -------------------------------------------------------
     APPLICATION RATE
  ------------------------------------------------------- */

  let collectionRate =
    0;


  if (expected > 0) {

    collectionRate =
      Math.min(
        100,
        Math.max(
          0,
          (
            applied /
            expected
          ) * 100
        )
      );

  }


  calculatedData = {

    month,

    opening_balance:
      openingBalance,

    expected_monthly_contributions:
      expected,

    total_contributions_collected:
      totalCollected,

    applied_this_month:
      applied,

    carry_forward:
      carryForward,

    current_outstanding:
      outstanding,

    approved_expenses:
      approvedExpenses,

    closing_balance:
      closingBalance,

    active_members:
      Number(
        summary.active_members ??
        canonicalStatus.length ??
        0
      ),

    members_paid:
      Number(
        summary.members_paid ??
        0
      ),

    partial_payments:
      Number(
        summary.partial_payments ??
        0
      ),

    outstanding_members:
      Number(
        summary.outstanding_members ??
        0
      ),

    collection_rate:
      Number(
        collectionRate.toFixed(
          2
        )
      )

  };


  console.log(
    "CHAMA LIVE: canonical monthly accounting",
    {
      month,

      expected,

      actualCashReceived:
        totalCollected,

      appliedThisMonth:
        applied,

      carryForward,

      currentOutstanding:
        outstanding,

      approvedExpenses,

      openingBalance,

      closingBalance,

      collectionRate:
        Number(
          collectionRate.toFixed(
            2
          )
        )
    }
  );


  renderCalculation();

}


/* =========================================================
   RENDER CALCULATION
========================================================= */

function renderCalculation() {

  if (!calculatedData) {
    return;
  }


  const expected =
    Number(
      calculatedData
        .expected_monthly_contributions ||
      0
    );


  const collected =
    Number(
      calculatedData
        .total_contributions_collected ||
      0
    );


  const applied =
    Number(
      calculatedData
        .applied_this_month ||
      0
    );


  const carryForward =
    Number(
      calculatedData
        .carry_forward ||
      0
    );


  const outstanding =
    Number(
      calculatedData
        .current_outstanding ||
      0
    );


  const expenses =
    Number(
      calculatedData
        .approved_expenses ||
      0
    );


  const previousBalance =
    Number(
      calculatedData
        .opening_balance ||
      0
    );


  const balance =
    Number(
      calculatedData
        .closing_balance ||
      0
    );


  /* -------------------------------------------------------
     SUMMARY CARDS
  ------------------------------------------------------- */

  if (expectedEl) {

    expectedEl.textContent =
      money(
        expected
      );

  }


  /*
     TOTAL COLLECTED
     ----------------

     This is CASH.

     It must NOT display applied amount.

     September example:

       cash = 0
       applied = 300

     Therefore:

       Total Collected = KES 0
  */

  if (collectedEl) {

    collectedEl.textContent =
      money(
        collected
      );

  }


  if (expensesEl) {

    expensesEl.textContent =
      money(
        expenses
      );

  }


  if (previousBalanceEl) {

    previousBalanceEl.textContent =
      money(
        previousBalance
      );

  }


  if (balanceEl) {

    balanceEl.textContent =
      money(
        balance
      );

  }


  /* -------------------------------------------------------
     APPLICATION PROGRESS
     -------------------------------------------------------

     IMPORTANT:

       applied / expected

     NOT:

       cash received / expected
  ------------------------------------------------------- */

  let percentage =
    0;


  if (expected > 0) {

    percentage =
      (
        applied /
        expected
      ) * 100;

  }


  percentage =
    Math.max(
      0,
      Math.min(
        percentage,
        100
      )
    );


  if (collectionProgress) {

    collectionProgress.style.width =
      `${percentage}%`;

    collectionProgress.setAttribute(
      "aria-valuenow",
      String(
        Math.round(
          percentage
        )
      )
    );

  }


  if (collectionProgressText) {

    collectionProgressText.textContent =
      `${Math.round(
        percentage
      )}% applied`;

  }


  /* -------------------------------------------------------
     DIFFERENCE
     -------------------------------------------------------

     Difference is based on:

       applied - expected
  ------------------------------------------------------- */

  if (collectionDifference) {

    const difference =
      applied -
      expected;


    if (difference > 0) {

      collectionDifference.textContent =
        `${money(
          difference
        )} above expected`;

      collectionDifference.className =
        "collection-difference positive";

    }

    else if (difference < 0) {

      collectionDifference.textContent =
        `${money(
          Math.abs(
            difference
          )
        )} below expected`;

      collectionDifference.className =
        "collection-difference negative";

    }

    else {

      collectionDifference.textContent =
        "Fully applied";

      collectionDifference.className =
        "collection-difference positive";

    }

  }


  /* -------------------------------------------------------
     BALANCE CLASS
  ------------------------------------------------------- */

  if (balanceEl) {

    balanceEl.classList.remove(
      "amount-positive",
      "amount-negative",
      "amount-neutral"
    );


    if (balance < 0) {

      balanceEl.classList.add(
        "amount-negative"
      );

    }

    else if (balance > 0) {

      balanceEl.classList.add(
        "amount-positive"
      );

    }

    else {

      balanceEl.classList.add(
        "amount-neutral"
      );

    }

  }


  /* -------------------------------------------------------
     OPTIONAL 2B VALUES
  ------------------------------------------------------- */

  renderOptionalAccountingFields(
    calculatedData
  );


  const progressDescription =
    getElement(
      "collectionProgressDescription"
    );


  if (progressDescription) {

    progressDescription.textContent =
      "Current-month obligations satisfied by payment allocations.";

  }


  const cashDescription =
    getElement(
      "cashCollectedDescription"
    );


  if (cashDescription) {

    cashDescription.textContent =
      "Actual contribution cash received during this month.";

  }


  const appliedDescription =
    getElement(
      "appliedDescription"
    );


  if (appliedDescription) {

    appliedDescription.textContent =
      "Payments allocated against this month's obligations.";

  }


  const activeMembersEl =
    getElement(
      "activeMembers"
    );


  if (activeMembersEl) {

    activeMembersEl.textContent =
      String(
        calculatedData.active_members
      );

  }


  const paidMembersEl =
    getElement(
      "membersPaid"
    );


  if (paidMembersEl) {

    paidMembersEl.textContent =
      String(
        calculatedData.members_paid
      );

  }


  const partialMembersEl =
    getElement(
      "partialPayments"
    );


  if (partialMembersEl) {

    partialMembersEl.textContent =
      String(
        calculatedData.partial_payments
      );

  }


  const outstandingMembersEl =
    getElement(
      "outstandingMembers"
    );


  if (outstandingMembersEl) {

    outstandingMembersEl.textContent =
      String(
        calculatedData.outstanding_members
      );

  }

}


/* =========================================================
   RENDER CLOSING STATUS
========================================================= */

function renderClosingStatus() {

  if (!closingStatusEl) {
    return;
  }


  if (currentClosing) {

    closingStatusEl.textContent =
      `Closed on ${formatDate(
        currentClosing.closed_at
      )}`;


    closingStatusEl.className =
      "closing-status-badge closed";


    if (closeButton) {

      closeButton.disabled =
        true;

      closeButton.textContent =
        "Month Already Closed";

    }


    if (notesInput) {

      notesInput.value =
        currentClosing.notes ||
        "";

    }


    if (expectedEl) {

      expectedEl.textContent =
        money(
          currentClosing.total_expected
        );

    }


    if (collectedEl) {

      /*
         Historical closing stores ACTUAL CASH.
      */

      collectedEl.textContent =
        money(
          currentClosing.total_collected
        );

    }


    if (expensesEl) {

      expensesEl.textContent =
        money(
          currentClosing.total_expenses
        );

    }


    if (balanceEl) {

      balanceEl.textContent =
        money(
          currentClosing.closing_balance
        );


      balanceEl.classList.remove(
        "amount-positive",
        "amount-negative",
        "amount-neutral"
      );


      const historicalBalance =
        Number(
          currentClosing.closing_balance ||
          0
        );


      if (historicalBalance < 0) {

        balanceEl.classList.add(
          "amount-negative"
        );

      }

      else if (historicalBalance > 0) {

        balanceEl.classList.add(
          "amount-positive"
        );

      }

      else {

        balanceEl.classList.add(
          "amount-neutral"
        );

      }

    }


    const finalizeSection =
      getElement(
        "finalizeSection"
      );


    if (finalizeSection) {

      finalizeSection.classList.add(
        "already-closed"
      );

    }

  }

  else {

    closingStatusEl.textContent =
      "Open";


    closingStatusEl.className =
      "closing-status-badge open";


    if (closeButton) {

      closeButton.disabled =
        false;

      closeButton.textContent =
        "Close Month";

    }


    const finalizeSection =
      getElement(
        "finalizeSection"
      );


    if (finalizeSection) {

      finalizeSection.classList.remove(
        "already-closed"
      );

    }

  }

}


/* =========================================================
   CALCULATE MONTH
========================================================= */

async function calculateMonth() {

  try {

    clearError();


    const month =
      monthInput?.value;


    if (!month) {

      throw new Error(
        "Please select a month."
      );

    }


    calculatedData =
      null;


    currentClosing =
      null;


    canonicalStatus =
      [];


    renderSelectedMonth();


    await loadCanonicalAccounting(
      month
    );


    await loadExistingClosing(
      month
    );


    renderClosingStatus();


    showStatus(
      `Calculation ready for ${formatMonth(
        month
      )}.`
    );

  }

  catch (error) {

    showError(
      error
    );

  }

}


/* =========================================================
   CLOSE MONTH
========================================================= */

async function closeMonth() {

  try {

    clearError();


    const month =
      monthInput?.value;


    if (!month) {

      throw new Error(
        "Please select a month."
      );

    }


    if (currentClosing) {

      throw new Error(
        "This month has already been closed."
      );

    }


    /*
       Recalculate immediately before closing.

       This prevents stale accounting values.
    */

    await loadCanonicalAccounting(
      month
    );


    if (!calculatedData) {

      throw new Error(
        "Unable to calculate the month."
      );

    }


    /*
       Check duplicate immediately before INSERT.
    */

    await loadExistingClosing(
      month
    );


    if (currentClosing) {

      renderClosingStatus();

      throw new Error(
        "This financial month has already been closed."
      );

    }


    const confirmed =
      window.confirm(

        `Close ${formatMonth(
          month
        )}?\n\n` +

        `Expected monthly obligations: ` +

        `${money(
          calculatedData
            .expected_monthly_contributions
        )}\n` +

        `Actual cash contributions received: ` +

        `${money(
          calculatedData
            .total_contributions_collected
        )}\n` +

        `Applied to current-month obligations: ` +

        `${money(
          calculatedData
            .applied_this_month
        )}\n` +

        `Carry-forward credit: ` +

        `${money(
          calculatedData
            .carry_forward
        )}\n` +

        `Current outstanding: ` +

        `${money(
          calculatedData
            .current_outstanding
        )}\n` +

        `Approved expenses: ` +

        `${money(
          calculatedData
            .approved_expenses
        )}\n` +

        `Opening balance: ` +

        `${money(
          calculatedData
            .opening_balance
        )}\n` +

        `Closing cash balance: ` +

        `${money(
          calculatedData
            .closing_balance
        )}\n\n` +

        `Continue?`

      );


    if (!confirmed) {
      return;
    }


    if (!currentUser?.id) {

      throw new Error(
        "Authenticated user identity is unavailable."
      );

    }


    if (!currentMember?.id) {

      throw new Error(
        "Current member identity is unavailable."
      );

    }


    if (!groupId) {

      throw new Error(
        "Current group identity is unavailable."
      );

    }


    if (closeButton) {

      closeButton.disabled =
        true;

      closeButton.textContent =
        "Closing...";

    }


    showStatus(
      `Closing ${formatMonth(
        month
      )}...`
    );


    /* =====================================================
       RLS IDENTITY

       monthly_closings.closed_by
       references auth.users.id.

       Therefore:

           currentUser.id

       is REQUIRED.

       NEVER:

           currentMember.id
    ===================================================== */

    const payload = {

      group_id:
        groupId,

      closing_month:
        `${month}-01`,

      closed_by:
        currentUser.id,

      closed_at:
        new Date().toISOString(),

      total_expected:
        Number(
          calculatedData
            .expected_monthly_contributions ||
          0
        ),

      /*
         ACTUAL CASH RECEIVED.

         This is deliberately NOT:

             applied_this_month
      */

      total_collected:
        Number(
          calculatedData
            .total_contributions_collected ||
          0
        ),

      total_expenses:
        Number(
          calculatedData
            .approved_expenses ||
          0
        ),

      /*
         CASH CLOSING:

           opening
           + actual cash
           - expenses
      */

      closing_balance:
        Number(
          calculatedData
            .closing_balance ||
          0
        ),

      notes:
        notesInput?.value?.trim() ||
        null

    };


    console.log(
      "CHAMA LIVE: monthly closing insert",
      {

        groupId:
          payload.group_id,

        closingMonth:
          payload.closing_month,

        closedBy:
          payload.closed_by,

        currentUserId:
          currentUser.id,

        currentMemberId:
          currentMember.id,

        closedByMatchesAuthUser:
          payload.closed_by ===
          currentUser.id,

        expected:
          payload.total_expected,

        actualCashReceived:
          payload.total_collected,

        appliedThisMonth:
          calculatedData
            .applied_this_month,

        carryForward:
          calculatedData
            .carry_forward,

        approvedExpenses:
          payload.total_expenses,

        openingBalance:
          calculatedData
            .opening_balance,

        closingBalance:
          payload.closing_balance

      }
    );


    const {
      data,
      error
    } =
      await supabase
        .from(
          "monthly_closings"
        )
        .insert(
          payload
        )
        .select(`
          id,
          group_id,
          closing_month,
          closed_by,
          closed_at,
          total_expected,
          total_collected,
          total_expenses,
          closing_balance,
          notes
        `)
        .single();


    if (error) {

      /*
         PostgreSQL unique violation.
      */

      if (
        error.code ===
        "23505"
      ) {

        throw new Error(
          "This financial month has already been closed."
        );

      }


      /*
         RLS authorization failure.
      */

      if (
        error.code ===
        "42501"
      ) {

        throw new Error(
          "Monthly Closing was blocked by database authorization. The closing identity must match the authenticated user."
        );

      }


      throw error;

    }


    currentClosing =
      data;


    renderClosingStatus();


    await loadClosingHistory();


    showStatus(
      `${formatMonth(
        month
      )} closed successfully.`
    );


    setTimeout(
      () => {

        showStatus("");

      },
      3000
    );

  }

  catch (error) {

    showError(
      error
    );

  }

  finally {

    if (
      closeButton &&
      !currentClosing
    ) {

      closeButton.disabled =
        false;

      closeButton.textContent =
        "Close Month";

    }

  }

}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  if (
    monthInput &&
    monthInput.dataset.bound !==
      "true"
  ) {

    monthInput.dataset.bound =
      "true";


    monthInput.addEventListener(
      "change",
      () => {

        calculatedData =
          null;

        currentClosing =
          null;

        canonicalStatus =
          [];

        renderSelectedMonth();

        calculateMonth();

      }
    );

  }


  if (
    calculateButton &&
    calculateButton.dataset.bound !==
      "true"
  ) {

    calculateButton.dataset.bound =
      "true";


    calculateButton.addEventListener(
      "click",
      () => {

        calculateMonth();

      }
    );

  }


  if (
    closeButton &&
    closeButton.dataset.bound !==
      "true"
  ) {

    closeButton.dataset.bound =
      "true";


    closeButton.addEventListener(
      "click",
      () => {

        closeMonth();

      }
    );

  }

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
      "Loading monthly closing..."
    );


    /* -----------------------------------------------------
       AUTHENTICATION
    ----------------------------------------------------- */

    currentUser =
      await requireAuth();


    if (!currentUser) {

      throw new Error(
        "You are not signed in."
      );

    }


    if (!currentUser.id) {

      throw new Error(
        "Authenticated user ID is unavailable."
      );

    }


    /* -----------------------------------------------------
       MEMBER
    ----------------------------------------------------- */

    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "No member record is linked to this account."
      );

    }


    if (!currentMember.id) {

      throw new Error(
        "Current member ID is unavailable."
      );

    }


    /* -----------------------------------------------------
       GROUP
    ----------------------------------------------------- */

    groupId =
      currentMember.group_id;


    if (!groupId) {

      throw new Error(
        "Your member record is not linked to a group."
      );

    }


    /* -----------------------------------------------------
       MONTH
    ----------------------------------------------------- */

    if (monthInput) {

      monthInput.value =
        getCurrentMonth();

    }


    renderSelectedMonth();


    setupEvents();


    /* -----------------------------------------------------
       INITIAL CALCULATION
    ----------------------------------------------------- */

    await calculateMonth();


    /* -----------------------------------------------------
       HISTORY
    ----------------------------------------------------- */

    await loadClosingHistory();


    showStatus(
      "Monthly closing ready."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      2500
    );


    console.log(
      "CHAMA LIVE: monthly closing initialized",
      {

        groupId,

        memberId:
          currentMember.id,

        authenticatedUserId:
          currentUser.id,

        memberUserId:
          currentMember.user_id,

        memberAuthUserId:
          currentMember.auth_user_id,

        canonicalMembers:
          canonicalStatus.length

      }
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
   REQUIRED EXPORT
========================================================= */

export const initMonthlyClosing =
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
  "CHAMA LIVE: monthly-closing.js ready"
);
