/* =========================================================
   CHAMA LIVE — MONTHLY CLOSING
   CANONICAL 2B ACCOUNTING VERSION

   LIVE DATABASE CONTRACT
   ---------------------------------------------------------
   Canonical functions:

       get_canonical_member_monthly_status(
           p_group_id uuid,
           p_month text
       )

       get_canonical_monthly_accounting_summary(
           p_group_id uuid,
           p_month text
       )

   Actual tables:

       monthly_closings
       expenses
       groups
       members

   ACCOUNTING MODEL
   ---------------------------------------------------------
   Canonical contribution accounting determines:

       monthly due
       previous outstanding
       previous credit
       current month payment
       applied this month
       carry-forward
       current outstanding
       total paid
       total due
       member status

   Financial closing determines:

       opening balance
       + contributions received
       - approved expenses
       = closing balance

   IMPORTANT
   ---------------------------------------------------------
   JavaScript does NOT recreate arrears allocation logic.

   The canonical 2B RPC is authoritative.

   Required exports:
       initPage()
       initMonthlyClosing
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";


console.log(
  "CHAMA LIVE: monthly-closing.js loaded"
);


/* =========================================================
   DOM HELPERS
========================================================= */

function el(id) {
  return document.getElementById(id);
}


const statusEl =
  el("status");

const errorEl =
  el("error");

const monthInput =
  el("closingMonth");

const calculateButton =
  el("calculateClosing");

const closeButton =
  el("closeMonth");

const notesInput =
  el("closingNotes");

const expectedEl =
  el("totalExpected");

const collectedEl =
  el("totalCollected");

const expensesEl =
  el("totalExpenses");

const balanceEl =
  el("closingBalance");

const previousBalanceEl =
  el("previousBalance");

const closingStatusEl =
  el("closingStatus");

const closingRows =
  el("closingRows");

const selectedMonthLabel =
  el("selectedMonthLabel");

const collectionProgress =
  el("collectionProgress");

const collectionProgressText =
  el("collectionProgressText");

const collectionDifference =
  el("collectionDifference");


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentMember = null;

let currentGroup = null;

let groupId = null;

let currentClosing = null;

let calculatedData = null;

let canonicalMemberStatus = [];

let approvedExpenses = 0;

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


function clearStatus() {

  showStatus("");

}


/* =========================================================
   ERROR
========================================================= */

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

  const normalized =
    String(value)
      .substring(0, 10);

  const date =
    new Date(
      `${normalized}T00:00:00`
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
   GROUP CONTEXT
========================================================= */

async function loadContext() {

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

  currentGroup =
    await getMyGroup();

  if (!currentGroup) {

    throw new Error(
      "Group information could not be found."
    );

  }

  if (
    String(currentGroup.id) !==
    String(groupId)
  ) {

    throw new Error(
      "Current group context could not be verified."
    );

  }

}


/* =========================================================
   CANONICAL MEMBER ACCOUNTING
========================================================= */

async function loadCanonicalMemberStatus(
  month
) {

  const {
    data,
    error
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

  if (error) {
    throw error;
  }

  canonicalMemberStatus =
    Array.isArray(data)
      ? data
      : [];

}


/* =========================================================
   CANONICAL MONTHLY SUMMARY
========================================================= */

async function loadCanonicalSummary(
  month
) {

  const {
    data,
    error
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

  if (error) {
    throw error;
  }

  return data || null;

}


/* =========================================================
   APPROVED EXPENSES
========================================================= */

async function loadApprovedExpenses(
  month
) {

  const start =
    `${month}-01`;

  const startDate =
    new Date(
      `${start}T00:00:00`
    );

  if (
    Number.isNaN(
      startDate.getTime()
    )
  ) {

    throw new Error(
      "Invalid closing month."
    );

  }


  const endDate =
    new Date(startDate);

  endDate.setMonth(
    endDate.getMonth() + 1
  );


  const end =
    [
      endDate.getFullYear(),

      String(
        endDate.getMonth() + 1
      ).padStart(2, "0"),

      "01"

    ].join("-");


  const {
    data,
    error
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
        start
      )
      .lt(
        "date",
        end
      )
      .eq(
        "approval_status",
        "approved"
      );


  if (error) {
    throw error;
  }


  approvedExpenses =
    (data || [])
      .reduce(
        (total, expense) =>
          total +
          Number(
            expense.amount || 0
          ),
        0
      );


  return data || [];

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
   LOAD CLOSING HISTORY
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
            <div class="empty-state-icon">▣</div>
            <strong>No monthly closings yet</strong>
            <span>
              Closed financial months will appear here.
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
                : "amount-neutral";


          return `
            <tr>

              <td>
                <strong>
                  ${escapeHtml(
                    formatMonth(
                      String(
                        closing.closing_month
                      ).substring(0, 7)
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
   CALCULATE MONTH
========================================================= */

async function calculateMonth() {

  clearError();

  const month =
    monthInput?.value;

  if (!month) {

    throw new Error(
      "Please select a month."
    );

  }


  renderSelectedMonth();


  showStatus(
    `Calculating ${formatMonth(month)}...`
  );


  /*
     The canonical RPC is called first.

     It performs the authoritative 2B accounting:

       obligations
       payments
       allocations
       previous arrears
       previous credits
       current-month application
       carry-forward
       current outstanding
  */

  const summary =
    await loadCanonicalSummary(
      month
    );


  /*
     Also load the detailed canonical member state.
  */

  await loadCanonicalMemberStatus(
    month
  );


  /*
     Expenses are NOT part of contribution allocation.

     They are included separately in the financial
     closing calculation.
  */

  await loadApprovedExpenses(
    month
  );


  if (!summary) {

    throw new Error(
      "No canonical accounting summary was returned."
    );

  }


  /*
     Canonical contribution collection.

     total_contributions_collected is the actual monthly
     payment amount received.

     applied_this_month is what was applied against
     this month's obligation.

     carry_forward remains separate.
  */

  const expected =
    Number(
      summary.expected_monthly_contributions ||
      0
    );


  const collected =
    Number(
      summary.total_contributions_collected ||
      0
    );


  const openingBalance =
    await calculateOpeningBalance(
      month
    );


  const closingBalance =
    openingBalance +
    collected -
    approvedExpenses;


  calculatedData = {

    ...summary,

    opening_balance:
      openingBalance,

    approved_expenses:
      approvedExpenses,

    closing_balance:
      closingBalance

  };


  await loadExistingClosing(
    month
  );


  renderCalculation();

  renderClosingStatus();


  showStatus(
    `Calculation ready for ${formatMonth(month)}.`
  );

}


/* =========================================================
   OPENING BALANCE
========================================================= */

async function calculateOpeningBalance(
  month
) {

  /*
     First preference:
     financial_periods if the table exists and is
     already part of the project accounting model.

     We deliberately do not require this table because
     monthly_closings and groups are the guaranteed
     live structures used by this page.
  */


  const {
    data: previousClosing,
    error: previousClosingError
  } =
    await supabase
      .from("monthly_closings")
      .select(`
        closing_month,
        closing_balance
      `)
      .eq(
        "group_id",
        groupId
      )
      .lt(
        "closing_month",
        `${month}-01`
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
    previousClosingError &&
    previousClosingError.code !==
      "PGRST116"
  ) {

    throw previousClosingError;

  }


  if (previousClosing) {

    return Number(
      previousClosing.closing_balance ||
      0
    );

  }


  /*
     No previous closing.

     Use the group's configured opening balance.
  */

  return Number(
    currentGroup?.opening_balance ||
    0
  );

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


  const credit =
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
     Optional existing elements.
  */

  const appliedEl =
    el("appliedThisMonth");

  if (appliedEl) {

    appliedEl.textContent =
      money(applied);

  }


  const creditEl =
    el("carryForward");

  if (creditEl) {

    creditEl.textContent =
      money(credit);

  }


  const outstandingEl =
    el("currentOutstanding");

  if (outstandingEl) {

    outstandingEl.textContent =
      money(outstanding);

  }


  /* =====================================================
     CONTRIBUTION PROGRESS
  ====================================================== */

  let percentage = 0;

  /*
     IMPORTANT:

     Current-month progress is based on APPLIED amount,
     not raw cash received.

     This prevents carry-forward or excess payment from
     falsely increasing collection progress.
  */

  if (expected > 0) {

    percentage =
      (applied / expected) * 100;

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
      `${Math.round(percentage)}% collected`;

  }


  if (collectionDifference) {

    const difference =
      applied - expected;


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


  /* =====================================================
     BALANCE STATE
  ====================================================== */

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
     Optional summary elements.
  */

  const collectedCashEl =
    el("cashCollected");

  if (collectedCashEl) {

    collectedCashEl.textContent =
      money(collected);

  }


  const canonicalAppliedEl =
    el("canonicalApplied");

  if (canonicalAppliedEl) {

    canonicalAppliedEl.textContent =
      money(applied);

  }


  const canonicalCreditEl =
    el("canonicalCredit");

  if (canonicalCreditEl) {

    canonicalCreditEl.textContent =
      money(credit);

  }


  const canonicalOutstandingEl =
    el("canonicalOutstanding");

  if (canonicalOutstandingEl) {

    canonicalOutstandingEl.textContent =
      money(outstanding);

  }

}


/* =========================================================
   CLOSING STATUS
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
      el("finalizeSection");

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
      el("finalizeSection");

    if (finalizeSection) {

      finalizeSection.classList.remove(
        "already-closed"
      );

    }

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

      await calculateMonth();

    }


    if (!calculatedData) {

      throw new Error(
        "Unable to calculate the month."
      );

    }


    /*
       Recheck the closing immediately before insert.

       This protects against another browser/session
       closing the same month while this page was open.
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


    const expenses =
      Number(
        calculatedData
          .approved_expenses ||
        0
      );


    const closingBalance =
      Number(
        calculatedData
          .closing_balance ||
        0
      );


    const confirmed =
      window.confirm(
        `Close ${formatMonth(month)}?\n\n` +
        `Expected: ${money(expected)}\n` +
        `Contributions received: ${money(collected)}\n` +
        `Approved expenses: ${money(expenses)}\n` +
        `Closing balance: ${money(closingBalance)}\n\n` +
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
      `Closing ${formatMonth(month)}...`
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
        expected,

      total_collected:
        collected,

      total_expenses:
        expenses,

      closing_balance:
        closingBalance,

      notes:
        notesInput?.value?.trim() ||
        null

    };


    /*
       IMPORTANT:

       monthly_closings.closed_by is a member UUID
       in the existing CHAMA LIVE model.

       Therefore we use:

           currentMember.id

       NOT:

           currentUser.id
    */


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
         PostgreSQL unique constraint should prevent
         duplicate monthly closing.

         Handle duplicate gracefully.
      */

      if (
        error.code === "23505"
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
      `${formatMonth(month)} closed successfully.`
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
   MONTH CHANGE
========================================================= */

async function handleMonthChange() {

  calculatedData =
    null;

  currentClosing =
    null;

  canonicalMemberStatus =
    [];

  approvedExpenses =
    0;

  renderSelectedMonth();

  try {

    await calculateMonth();

  }
  catch (error) {

    showError(
      error
    );

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
      handleMonthChange
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

        calculateMonth()
          .catch(
            showError
          );

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
      closeMonth
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


    await loadContext();


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
      clearStatus,
      2500
    );


    console.log(
      "CHAMA LIVE: Monthly Closing initialized",
      {
        groupId,
        memberId:
          currentMember.id,
        userId:
          currentUser.id
      }
    );

  }
  catch (error) {

    initialized =
      false;

    clearStatus();

    showError(
      error
    );

  }

}


/* =========================================================
   REFRESH
========================================================= */

export async function refreshMonthlyClosing() {

  try {

    clearError();

    if (!groupId) {

      await loadContext();

    }

    const month =
      monthInput?.value ||
      getCurrentMonth();


    calculatedData =
      null;

    currentClosing =
      null;


    await calculateMonth();

    await loadClosingHistory();

  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =========================================================
   ALIAS
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
