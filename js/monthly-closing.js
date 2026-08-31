/* =========================================================
   CHAMA LIVE — MONTHLY CLOSING
   CANONICAL 2B VERSION
   ---------------------------------------------------------
   Accounting source:
       get_canonical_monthly_accounting_summary()

   Member accounting source:
       get_canonical_member_monthly_status()

   Cash closing:
       Opening Balance
       + Actual Cash Contributions Received
       - Approved Expenses
       = Closing Balance

   Contribution accounting:
       Expected Monthly Obligations
       Applied To Current Month Obligations
       Outstanding
       Carry-forward
       Other Savings

   IMPORTANT 2B RULE
   ---------------------------------------------------------
   "Total Collected" means ACTUAL CASH RECEIVED during
   the selected financial month according to the
   canonical accounting summary.

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

   OTHER SAVINGS
   ---------------------------------------------------------
   Contributions recorded with contribution_type = "other"
   are displayed separately as Other Savings.

   Example:
       September Christmas saving = KES 200

   This amount:
       - remains a valid contribution transaction
       - is NOT a monthly obligation
       - is NOT included in monthly application progress
       - is NOT converted into a monthly contribution

   RLS IDENTITY RULE
   ---------------------------------------------------------
   monthly_closings.closed_by references auth.users.id.

   Therefore:
       closed_by = currentUser.id

   NOT:
       closed_by = currentMember.id

   Required exports:
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
   ELEMENTS
========================================================= */

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const monthInput =
  document.getElementById("closingMonth");

const calculateButton =
  document.getElementById("calculateClosing");

const closeButton =
  document.getElementById("closeMonth");

const notesInput =
  document.getElementById("closingNotes");

const expectedEl =
  document.getElementById("totalExpected");

const collectedEl =
  document.getElementById("totalCollected");

const expensesEl =
  document.getElementById("totalExpenses");

const balanceEl =
  document.getElementById("closingBalance");

const previousBalanceEl =
  document.getElementById("previousBalance");

const closingStatusEl =
  document.getElementById("closingStatus");

const closingRows =
  document.getElementById("closingRows");

const selectedMonthLabel =
  document.getElementById("selectedMonthLabel");

const collectionProgress =
  document.getElementById("collectionProgress");

const collectionProgressText =
  document.getElementById(
    "collectionProgressText"
  );

const collectionDifference =
  document.getElementById(
    "collectionDifference"
  );

const appliedThisMonthEl =
  document.getElementById(
    "appliedThisMonth"
  );

const otherSavingsEl =
  document.getElementById(
    "otherSavings"
  );

const currentOutstandingEl =
  document.getElementById(
    "currentOutstanding"
  );

const cashReceivedEl =
  document.getElementById(
    "cashReceived"
  );

const carryForwardEl =
  document.getElementById(
    "carryForward"
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
   LOAD OTHER SAVINGS
   ---------------------------------------------------------
   Other savings are intentionally separate from the
   canonical monthly contribution accounting.

   This reads contribution transactions recorded during
   the selected calendar month where:

       contribution_type = "other"

   Example:
       September 2026 Christmas saving = KES 200

   It does NOT modify the canonical RPC values.
========================================================= */

async function loadOtherSavings(month) {

  if (!groupId) {
    throw new Error(
      "Current group identity is unavailable."
    );
  }

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
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select(`
        id,
        amount,
        date,
        contribution_type
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
        "contribution_type",
        "other"
      );


  if (error) {
    throw error;
  }


  return (
    data || []
  ).reduce(
    (
      total,
      contribution
    ) => {

      return (
        total +
        Number(
          contribution.amount || 0
        )
      );

    },
    0
  );

}


/* =========================================================
   OPTIONAL 2B ELEMENTS
========================================================= */

function renderOptionalAccountingFields(
  data
) {

  if (!data) {
    return;
  }


  if (appliedThisMonthEl) {

    appliedThisMonthEl.textContent =
      money(
        data.applied_this_month
      );

  }


  if (otherSavingsEl) {

    otherSavingsEl.textContent =
      money(
        data.other_savings
      );

  }


  if (carryForwardEl) {

    carryForwardEl.textContent =
      money(
        data.carry_forward
      );

  }


  if (currentOutstandingEl) {

    currentOutstandingEl.textContent =
      money(
        data.current_outstanding
      );

  }


  if (cashReceivedEl) {

    cashReceivedEl.textContent =
      money(
        data.total_contributions_collected
      );

  }


  const collectionLabelEl =
    document.getElementById(
      "collectionProgressLabel"
    );

  if (collectionLabelEl) {

    collectionLabelEl.textContent =
      "Applied to current month obligations";

  }


  const collectedLabelEl =
    document.getElementById(
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
      .from("monthly_closings")
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
      .from("monthly_closings")
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
                      ).slice(0, 7)
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
                    money(balance)
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


  /*
    First preference:
    previously closed financial period.
  */

  const {
    data: previousPeriod,
    error:
      previousPeriodError
  } =
    await supabase
      .from("financial_periods")
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
    previousPeriod?.closing_balance !==
      null &&
    previousPeriod?.closing_balance !==
      undefined
  ) {

    return Number(
      previousPeriod.closing_balance || 0
    );

  }


  /*
    Second preference:
    monthly_closings.
  */

  const {
    data: previousClosing,
    error:
      previousClosingError
  } =
    await supabase
      .from("monthly_closings")
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


  if (previousClosingError) {

    console.warn(
      "CHAMA LIVE: previous monthly closing lookup:",
      previousClosingError
    );

  }


  if (
    previousClosing?.closing_balance !==
      null &&
    previousClosing?.closing_balance !==
      undefined
  ) {

    return Number(
      previousClosing.closing_balance || 0
    );

  }


  /*
    Final fallback:
    group opening balance.
  */

  const {
    data: group,
    error: groupError
  } =
    await supabase
      .from("groups")
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


  /*
    The RPC may return either a single object
    or a one-row array.
  */

  const summary =
    Array.isArray(summaryData)
      ? summaryData[0]
      : summaryData;


  if (!summary) {

    throw new Error(
      "The canonical accounting summary is empty."
    );

  }


  /* -------------------------------------------------------
     OTHER SAVINGS
  --------------------------------------------------------- */

  const otherSavings =
    await loadOtherSavings(
      month
    );


  /* -------------------------------------------------------
     APPROVED EXPENSES
  --------------------------------------------------------- */

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
      .from("expenses")
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
    (
      expenseRows || []
    ).reduce(
      (
        total,
        expense
      ) => {

        return (
          total +
          Number(
            expense.amount || 0
          )
        );

      },
      0
    );


  /* -------------------------------------------------------
     OPENING BALANCE
  --------------------------------------------------------- */

  const openingBalance =
    await getOpeningBalance(
      month
    );


  /* -------------------------------------------------------
     CANONICAL 2B VALUES
  --------------------------------------------------------- */

  /*
    ACTUAL CASH RECEIVED

    This is the amount returned by the canonical
    accounting summary.

    It is used for CASH CLOSING.
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

    This can come from earlier payments/carry-forward.
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


  /* -------------------------------------------------------
     CASH CLOSING
  ---------------------------------------------------------

     IMPORTANT:

       opening
       + actual cash received
       - approved expenses

     NOT:

       opening
       + applied amount
       - expenses

     Application is an obligation-accounting concept,
     not a cash-flow concept.

     Other savings are displayed separately and are NOT
     silently added to the canonical cash value here.
  --------------------------------------------------------- */

  const closingBalance =
    openingBalance +
    totalCollected -
    approvedExpenses;


  /* -------------------------------------------------------
     APPLICATION RATE
  --------------------------------------------------------- */

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

    other_savings:
      otherSavings,

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
        collectionRate.toFixed(2)
      )

  };


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


  /*
    ACTUAL CASH RECEIVED
  */

  const collected =
    Number(
      calculatedData
        .total_contributions_collected ||
      0
    );


  /*
    AMOUNT APPLIED TO CURRENT MONTH
  */

  const applied =
    Number(
      calculatedData
        .applied_this_month ||
      0
    );


  /*
    OTHER SAVINGS
  */

  const otherSavings =
    Number(
      calculatedData
        .other_savings ||
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
  --------------------------------------------------------- */

  if (expectedEl) {

    expectedEl.textContent =
      money(expected);

  }


  /*
    Keep the legacy Total Collected field synchronized
    with the canonical actual-cash value.
  */

  if (collectedEl) {

    collectedEl.textContent =
      money(collected);

  }


  if (appliedThisMonthEl) {

    appliedThisMonthEl.textContent =
      money(applied);

  }


  if (otherSavingsEl) {

    otherSavingsEl.textContent =
      money(otherSavings);

  }


  if (currentOutstandingEl) {

    currentOutstandingEl.textContent =
      money(outstanding);

  }


  if (cashReceivedEl) {

    cashReceivedEl.textContent =
      money(collected);

  }


  if (expensesEl) {

    expensesEl.textContent =
      money(expenses);

  }


  if (previousBalanceEl) {

    previousBalanceEl.textContent =
      money(previousBalance);

  }


  if (carryForwardEl) {

    carryForwardEl.textContent =
      money(carryForward);

  }


  if (balanceEl) {

    balanceEl.textContent =
      money(balance);

  }


  /* -------------------------------------------------------
     CONTRIBUTION APPLICATION PROGRESS
  ---------------------------------------------------------

     Percentage is:

         applied / expected

     NOT:

         cash received / expected
  --------------------------------------------------------- */

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
  --------------------------------------------------------- */

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
  --------------------------------------------------------- */

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
     OPTIONAL 2B FIELDS
  --------------------------------------------------------- */

  renderOptionalAccountingFields(
    calculatedData
  );


  /*
    Optional explanatory labels.
  */

  const progressDescription =
    document.getElementById(
      "collectionProgressDescription"
    );


  if (progressDescription) {

    progressDescription.textContent =
      "Current-month obligations satisfied by payment allocations.";

  }


  const cashDescription =
    document.getElementById(
      "cashCollectedDescription"
    );


  if (cashDescription) {

    cashDescription.textContent =
      "Actual contribution cash received during this month.";

  }


  const appliedDescription =
    document.getElementById(
      "appliedDescription"
    );


  if (appliedDescription) {

    appliedDescription.textContent =
      "Payments allocated against this month's obligations.";

  }


  /*
    Optional current accounting values.
  */

  const activeMembersEl =
    document.getElementById(
      "activeMembers"
    );


  if (activeMembersEl) {

    activeMembersEl.textContent =
      String(
        calculatedData.active_members
      );

  }


  const paidMembersEl =
    document.getElementById(
      "membersPaid"
    );


  if (paidMembersEl) {

    paidMembersEl.textContent =
      String(
        calculatedData.members_paid
      );

  }


  const partialMembersEl =
    document.getElementById(
      "partialPayments"
    );


  if (partialMembersEl) {

    partialMembersEl.textContent =
      String(
        calculatedData.partial_payments
      );

  }


  const outstandingMembersEl =
    document.getElementById(
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

    }


    const finalizeSection =
      document.getElementById(
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
      document.getElementById(
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

    showError(error);

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
      Recalculate before closing.

      This prevents stale values from being
      written if another contribution or expense
      was recorded after the last calculation.
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
      Check again immediately before INSERT.

      This prevents duplicate closing records
      when another session has already closed
      the month.
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

        `Applied to current-month obligations: ` +

        `${money(
          calculatedData
            .applied_this_month
        )}\n` +

        `Other savings: ` +

        `${money(
          calculatedData
            .other_savings
        )}\n` +

        `Current outstanding: ` +

        `${money(
          calculatedData
            .current_outstanding
        )}\n` +

        `Actual cash contributions received: ` +

        `${money(
          calculatedData
            .total_contributions_collected
        )}\n` +

        `Carry-forward credit: ` +

        `${money(
          calculatedData
            .carry_forward
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


    /*
      RLS IDENTITY FIX

      monthly_closings.closed_by references
      auth.users.id.

      Therefore:

          currentUser.id

      is REQUIRED.

      Do NOT use:

          currentMember.id
    */

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
        This is ACTUAL CASH RECEIVED
        according to the canonical summary.
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
        Cash closing formula:

            opening
            + actual cash received
            - approved expenses
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

        otherSavings:
          calculatedData
            .other_savings,

        approvedExpenses:
          payload.total_expenses,

        closingBalance:
          payload.closing_balance
      }
    );


    const {
      data,
      error
    } =
      await supabase
        .from("monthly_closings")
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
        RLS diagnostic message.

        We do not bypass RLS.

        The authenticated user ID is deliberately
        used as closed_by.
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

    showError(error);

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
    monthInput.dataset.bound !== "true"
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
    calculateButton.dataset.bound !== "true"
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
    closeButton.dataset.bound !== "true"
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

    showError(error);

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
