/* =========================================================
   CHAMA LIVE — MONTHLY CLOSING
   COMPLETE CANONICAL 2B VERSION
   ---------------------------------------------------------
   IMPORTANT

   Calculation source:
       get_canonical_monthly_accounting_summary()
       get_canonical_member_monthly_status()

   Final closing source:
       close_financial_month()

   IMPORTANT IDENTITY RULE
   ---------------------------------------------------------
   monthly_closings.closed_by is resolved by the database
   through close_financial_month().

   DO NOT directly insert auth.uid() into monthly_closings.

   The frontend therefore does NOT perform:

       INSERT INTO monthly_closings

   Instead it calls:

       close_financial_month(
         group_id,
         YYYY-MM
       )

   This preserves the existing RLS/security model.

   No database changes are performed by this file.

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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

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
    ).padStart(2, "0")

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
   MONTH END
========================================================= */

function getMonthEnd(month) {

  const date =
    new Date(
      `${month}-01T00:00:00`
    );

  date.setMonth(
    date.getMonth() + 1
  );

  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1
    ).padStart(2, "0"),

    "01"

  ].join("-");

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
    previousPeriodError &&
    previousPeriodError.code !==
      "PGRST116"
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
     previous monthly closing.
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
    error:
      groupError
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


  /*
     --------------------------------------------------------
     CANONICAL MEMBER STATUS
     --------------------------------------------------------

     Authoritative 2B member-level accounting:

       Obligation
          ↓
       Payment
          ↓
       Allocation
          ↓
       Arrears / Credit
  */

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


  /*
     --------------------------------------------------------
     CANONICAL MONTHLY SUMMARY
     --------------------------------------------------------
  */

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
     --------------------------------------------------------
     APPROVED EXPENSES
     --------------------------------------------------------

     Contribution accounting remains canonical.

     Expenses are independently read for cash closing.
  */

  const monthStart =
    `${month}-01`;

  const monthEnd =
    getMonthEnd(month);


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
    (expenseRows || [])
      .reduce(
        (total, expense) =>
          total +
          Number(
            expense.amount || 0
          ),
        0
      );


  /*
     --------------------------------------------------------
     OPENING BALANCE
     --------------------------------------------------------
  */

  const openingBalance =
    await getOpeningBalance(
      month
    );


  /*
     --------------------------------------------------------
     CANONICAL VALUES
     --------------------------------------------------------
  */

  const totalCollected =
    Number(
      summaryData
        .total_contributions_collected ||
      0
    );


  const expected =
    Number(
      summaryData
        .expected_monthly_contributions ||
      0
    );


  const applied =
    Number(
      summaryData
        .applied_this_month ||
      0
    );


  const carryForward =
    Number(
      summaryData
        .carry_forward ||
      0
    );


  const outstanding =
    Number(
      summaryData
        .current_outstanding ||
      0
    );


  /*
     --------------------------------------------------------
     CASH CLOSING
     --------------------------------------------------------

       Opening Balance
       + Cash Contributions Received
       - Approved Expenses
       = Closing Balance

     IMPORTANT:

       applied_this_month

     is NOT used as cash received.

     Application is for obligation accounting.
  */

  const closingBalance =
    openingBalance +
    totalCollected -
    approvedExpenses;


  /*
     --------------------------------------------------------
     COLLECTION RATE
     --------------------------------------------------------
  */

  let collectionRate = 0;


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


  /*
     --------------------------------------------------------
     MEMBER COUNTS
     --------------------------------------------------------
  */

  const activeMembers =
    Number(
      summaryData.active_members ??
      canonicalStatus.length ??
      0
    );


  const membersPaid =
    Number(
      summaryData.members_paid ??
      0
    );


  const partialPayments =
    Number(
      summaryData.partial_payments ??
      0
    );


  const outstandingMembers =
    Number(
      summaryData.outstanding_members ??
      0
    );


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
      activeMembers,

    members_paid:
      membersPaid,

    partial_payments:
      partialPayments,

    outstanding_members:
      outstandingMembers,

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


  if (expectedEl) {

    expectedEl.textContent =
      money(expected);

  }


  if (collectedEl) {

    collectedEl.textContent =
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


  if (balanceEl) {

    balanceEl.textContent =
      money(balance);

  }


  /*
     --------------------------------------------------------
     COLLECTION PROGRESS
     --------------------------------------------------------

     Uses applied amount, NOT cash received.
  */

  let percentage = 0;


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

  }


  if (collectionProgressText) {

    collectionProgressText.textContent =
      `${Math.round(
        percentage
      )}% collected`;

  }


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
          Math.abs(difference)
        )} below expected`;

      collectionDifference.className =
        "collection-difference negative";

    }
    else {

      collectionDifference.textContent =
        "Fully collected";

      collectionDifference.className =
        "collection-difference positive";

    }

  }


  /*
     --------------------------------------------------------
     BALANCE CLASS
     --------------------------------------------------------
  */

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


  /*
     --------------------------------------------------------
     OPTIONAL EXTENDED ELEMENTS
     --------------------------------------------------------
  */

  const appliedEl =
    document.getElementById(
      "appliedThisMonth"
    );

  if (appliedEl) {

    appliedEl.textContent =
      money(applied);

  }


  const carryForwardEl =
    document.getElementById(
      "carryForward"
    );

  if (carryForwardEl) {

    carryForwardEl.textContent =
      money(carryForward);

  }


  const outstandingEl =
    document.getElementById(
      "currentOutstanding"
    );

  if (outstandingEl) {

    outstandingEl.textContent =
      money(outstanding);

  }


  /*
     Optional active member display.
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


  /*
     Optional member payment counts.
  */

  const membersPaidEl =
    document.getElementById(
      "membersPaid"
    );

  if (membersPaidEl) {

    membersPaidEl.textContent =
      String(
        calculatedData.members_paid
      );

  }


  const partialPaymentsEl =
    document.getElementById(
      "partialPayments"
    );

  if (partialPaymentsEl) {

    partialPaymentsEl.textContent =
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


  /*
     Keep outstanding variable intentionally
     referenced for optional UI compatibility.
  */

  void outstanding;

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


      const balance =
        Number(
          currentClosing.closing_balance ||
          0
        );


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
   ---------------------------------------------------------
   IMPORTANT

   This function DOES NOT insert directly into
   monthly_closings.

   It calls:

       close_financial_month()

   The database RPC handles:

       authorization
       financial period creation
       canonical report
       member identity resolution
       monthly_closings insert
       duplicate protection
       financial period closing
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
       Always calculate immediately before closing.

       This prevents closing with stale browser data.
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
       ------------------------------------------------------
       CONFIRMATION
       ------------------------------------------------------
    */

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

        `Cash contributions received: ` +
        `${money(
          calculatedData
            .total_contributions_collected
        )}\n` +

        `Applied to monthly obligations: ` +
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

        `Closing balance: ` +
        `${money(
          calculatedData
            .closing_balance
        )}\n\n` +

        `Continue?`

      );


    if (!confirmed) {
      return;
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
       ------------------------------------------------------
       CANONICAL FINANCIAL CLOSING RPC
       ------------------------------------------------------

       Do NOT directly insert into monthly_closings.

       The RPC resolves closed_by from auth identity
       and performs the protected database operation.
    */

    const {
      data,
      error
    } =
      await supabase
        .rpc(
          "close_financial_month",
          {
            p_group_id:
              groupId,

            p_month:
              month
          }
        );


    if (error) {

      console.error(
        "CHAMA LIVE: close_financial_month failed:",
        error
      );

      /*
         Translate common duplicate/closed errors
         into a user-friendly message.
      */

      const message =
        String(
          error.message ||
          ""
        );


      if (
        /already closed/i.test(
          message
        ) ||
        error.code === "23505"
      ) {

        throw new Error(
          "This financial month has already been closed."
        );

      }


      throw error;

    }


    /*
       ------------------------------------------------------
       RPC SUCCESS
       ------------------------------------------------------

       The RPC returns get_monthly_financial_report().
    */

    console.log(
      "CHAMA LIVE: close_financial_month succeeded",
      data
    );


    /*
       Reload the actual database row rather than
       constructing currentClosing locally.

       This guarantees that the page displays the
       official record actually written by the database.
    */

    await loadExistingClosing(
      month
    );


    /*
       Refresh canonical calculation and history.
    */

    await loadCanonicalAccounting(
      month
    );


    renderClosingStatus();

    await loadClosingHistory();


    showStatus(
      `${formatMonth(
        month
      )} closed successfully.`
    );


    /*
       Clear the status after a short delay,
       preserving the current UI behavior.
    */

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


    /*
       ------------------------------------------------------
       AUTHENTICATION
       ------------------------------------------------------
    */

    currentUser =
      await requireAuth();


    if (!currentUser) {

      throw new Error(
        "You are not signed in."
      );

    }


    /*
       ------------------------------------------------------
       MEMBER
       ------------------------------------------------------
    */

    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "No member record is linked to this account."
      );

    }


    /*
       ------------------------------------------------------
       GROUP
       ------------------------------------------------------
    */

    groupId =
      currentMember.group_id;


    if (!groupId) {

      throw new Error(
        "Your member record is not linked to a group."
      );

    }


    /*
       ------------------------------------------------------
       DEFAULT MONTH
       ------------------------------------------------------
    */

    if (monthInput) {

      monthInput.value =
        getCurrentMonth();

    }


    renderSelectedMonth();

    setupEvents();


    /*
       ------------------------------------------------------
       INITIAL CALCULATION
       ------------------------------------------------------
    */

    await calculateMonth();


    /*
       ------------------------------------------------------
       HISTORY
       ------------------------------------------------------
    */

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

        userId:
          currentUser.id,

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
