/* =========================================================
   CHAMA LIVE — MONTHLY CLOSING
   COMPLETE CORRECTED CANONICAL 2B VERSION

   Accounting source:
       get_canonical_monthly_accounting_summary()

   Member accounting source:
       get_canonical_member_monthly_status()

   Cash closing:
       Opening Balance
       + Contributions Received
       - Approved Expenses
       = Closing Balance

   Contribution progress:
       Applied To Current Month Obligations
       / Expected Monthly Obligations

   IMPORTANT
   ---------------------------------------------------------
   Total cash received is NOT automatically the amount
   applied to the current month's obligations.

   Carry-forward remains separate.

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

    /*
       If the table is not accessible,
       continue to monthly_closings.
    */

    console.warn(
      "CHAMA LIVE: financial_periods lookup:",
      previousPeriodError
    );

  }


  if (previousPeriod?.closing_balance !== null &&
      previousPeriod?.closing_balance !== undefined) {

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
     CANONICAL 2B ENGINE

     This is the authoritative source for:

       monthly due
       previous outstanding
       previous credit
       current month payment
       applied this month
       carry-forward
       current outstanding
       status
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
     Canonical summary gives us:

       expected
       total collected
       applied
       carry-forward
       outstanding
       member counts
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
     Approved expenses are intentionally loaded
     separately because the canonical contribution
     RPC concerns contribution accounting.
  */

  const monthStart =
    `${month}-01`;

  const date =
    new Date(
      `${month}-01T00:00:00`
    );

  date.setMonth(
    date.getMonth() + 1
  );


  const monthEnd =
    [
      date.getFullYear(),

      String(
        date.getMonth() + 1
      ).padStart(2, "0"),

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
    (expenseRows || [])
      .reduce(
        (total, expense) =>
          total +
          Number(
            expense.amount || 0
          ),
        0
      );


  const openingBalance =
    await getOpeningBalance(
      month
    );


  /*
     IMPORTANT:

     Cash closing is NOT:

       opening + applied - expenses

     It is:

       opening
       + cash received
       - approved expenses

     because cash received is actual money
     entering the group account.

     Application is used only for collection
     progress and member obligation accounting.
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


  const closingBalance =
    openingBalance +
    totalCollected -
    approvedExpenses;


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
        summaryData.active_members ||
        canonicalStatus.length ||
        0
      ),

    members_paid:
      Number(
        summaryData.members_paid ||
        0
      ),

    partial_payments:
      Number(
        summaryData.partial_payments ||
        0
      ),

    outstanding_members:
      Number(
        summaryData.outstanding_members ||
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
     Collection progress uses APPLIED,
     not total cash collected.
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
     Optional additional elements if present
     in the HTML.
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


    if (!calculatedData) {

      await loadCanonicalAccounting(
        month
      );

    }


    if (!calculatedData) {

      throw new Error(
        "Unable to calculate the month."
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


    const payload = {

      group_id:
        groupId,

      closing_month:
        `${month}-01`,

      closed_by:
        currentMember.id,

      closed_at:
        new Date().toISOString(),

      total_expected:
        Number(
          calculatedData
            .expected_monthly_contributions ||
          0
        ),

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

      if (
        error.code ===
        "23505"
      ) {

        throw new Error(
          "This financial month has already been closed."
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


    if (monthInput) {

      monthInput.value =
        getCurrentMonth();

    }


    renderSelectedMonth();

    setupEvents();


    await calculateMonth();

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
