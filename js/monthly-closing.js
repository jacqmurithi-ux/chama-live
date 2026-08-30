/* =========================================================
   CHAMA LIVE — MONTHLY CLOSING
   FULL SCHEMA-ALIGNED VERSION

   PURPOSE
   ---------------------------------------------------------
   • Select a financial month
   • Calculate expected contributions
   • Calculate collected contributions
   • Calculate approved expenses
   • Calculate closing balance
   • Show previous closing
   • Close the selected month
   • Prevent duplicate closing
   • Display previous closing records

   IMPORTANT
   ---------------------------------------------------------
   monthly_closings.closed_by -> auth.users.id

   Unlike:
   contributions.recorded_by -> members.id
   expenses.recorded_by       -> members.id
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


/* =========================================================
   STATE
========================================================= */

let currentUser =
  null;

let currentMember =
  null;

let groupId =
  null;

let currentClosing =
  null;

let calculatedData =
  null;

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
   MONTH RANGE
========================================================= */

function getMonthRange(
  month
) {

  const start =
    `${month}-01`;

  const date =
    new Date(
      `${month}-01T00:00:00`
    );


  date.setMonth(
    date.getMonth() + 1
  );


  const end =
    [
      date.getFullYear(),

      String(
        date.getMonth() + 1
      ).padStart(
        2,
        "0"
      ),

      "01"

    ].join("-");


  return {
    start,
    end
  };

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
        month
      )
      .maybeSingle();


  if (error) {

    throw error;

  }


  currentClosing =
    data || null;


  renderClosingStatus();

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
          No monthly closings recorded yet.
        </td>
      </tr>
    `;

    return;

  }


  closingRows.innerHTML =
    data
      .map(
        closing => {

          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatMonth(
                    closing.closing_month
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    closing.total_expected
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    closing.total_collected
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    closing.total_expenses
                  )
                )}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    money(
                      closing.closing_balance
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

              <td>
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
   CALCULATE EXPECTED
========================================================= */

async function calculateExpected(
  month
) {

  /*
     Groups table contains the default monthly
     contribution amount.

     Members table determines the number of
     active members expected to contribute.
  */

  const {
    data: group,
    error: groupError
  } =
    await supabase
      .from("groups")
      .select(`
        id,
        monthly_contribution
      `)
      .eq(
        "id",
        groupId
      )
      .single();


  if (groupError) {

    throw groupError;

  }


  const {
    data: members,
    error: membersError
  } =
    await supabase
      .from("members")
      .select(`
        id,
        status
      `)
      .eq(
        "group_id",
        groupId
      );


  if (membersError) {

    throw membersError;

  }


  const activeMembers =
    (members || [])
      .filter(
        member =>
          String(
            member.status ||
            "active"
          )
            .toLowerCase() ===
          "active"
      );


  const monthlyContribution =
    Number(
      group?.monthly_contribution ||
      0
    );


  const expected =
    activeMembers.length *
    monthlyContribution;


  return {
    expected,
    activeMembers:
      activeMembers.length,
    monthlyContribution
  };

}


/* =========================================================
   CALCULATE COLLECTED
========================================================= */

async function calculateCollected(
  month
) {

  const {
    start,
    end
  } =
    getMonthRange(
      month
    );


  /*
     Only contributions recorded during the
     selected calendar month are counted here.

     This is the cash movement recorded in
     the contribution ledger for that month.
  */

  const {
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select(`
        id,
        amount,
        contribution_type,
        contribution_date
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
      );


  if (error) {

    throw error;

  }


  const collected =
    (data || [])
      .reduce(
        (
          total,
          contribution
        ) =>
          total +
          Number(
            contribution.amount ||
            0
          ),
        0
      );


  return collected;

}


/* =========================================================
   CALCULATE APPROVED EXPENSES
========================================================= */

async function calculateExpenses(
  month
) {

  const {
    start,
    end
  } =
    getMonthRange(
      month
    );


  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .select(`
        id,
        amount,
        approval_status,
        date
      `)
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "approval_status",
        "approved"
      )
      .gte(
        "date",
        start
      )
      .lt(
        "date",
        end
      );


  if (error) {

    throw error;

  }


  const total =
    (data || [])
      .reduce(
        (
          sum,
          expense
        ) =>
          sum +
          Number(
            expense.amount ||
            0
          ),
        0
      );


  return total;

}


/* =========================================================
   PREVIOUS CLOSING BALANCE
========================================================= */

async function loadPreviousBalance(
  month
) {

  const {
    data,
    error
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
        month
      )
      .order(
        "closing_month",
        {
          ascending: false
        }
      )
      .limit(1)
      .maybeSingle();


  if (error) {

    throw error;

  }


  return Number(
    data?.closing_balance ||
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


  if (expectedEl) {

    expectedEl.textContent =
      money(
        calculatedData.totalExpected
      );

  }


  if (collectedEl) {

    collectedEl.textContent =
      money(
        calculatedData.totalCollected
      );

  }


  if (expensesEl) {

    expensesEl.textContent =
      money(
        calculatedData.totalExpenses
      );

  }


  if (balanceEl) {

    balanceEl.textContent =
      money(
        calculatedData.closingBalance
      );

  }


  if (previousBalanceEl) {

    previousBalanceEl.textContent =
      money(
        calculatedData.previousBalance
      );

  }

}


/* =========================================================
   RENDER STATUS
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
      "metric";

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

  }
  else {

    closingStatusEl.textContent =
      "Open";

    closingStatusEl.className =
      "muted";

    if (closeButton) {

      closeButton.disabled =
        false;

      closeButton.textContent =
        "Close Month";

    }

  }

}


/* =========================================================
   CALCULATE MONTH
========================================================= */

async function calculateMonth() {

  try {

    clearError();

    showStatus(
      "Calculating monthly closing..."
    );


    const month =
      monthInput?.value;


    if (!month) {

      throw new Error(
        "Please select a month."
      );

    }


    await loadExistingClosing(
      month
    );


    const expected =
      await calculateExpected(
        month
      );


    const collected =
      await calculateCollected(
        month
      );


    const totalExpenses =
      await calculateExpenses(
        month
      );


    const previousBalance =
      await loadPreviousBalance(
        month
      );


    /*
       Closing balance represents:

       Previous closing balance
       + contributions collected
       - approved expenses
    */

    const closingBalance =
      previousBalance +
      collected -
      totalExpenses;


    calculatedData = {

      totalExpected:
        expected.expected,

      totalCollected:
        collected,

      totalExpenses:
        totalExpenses,

      previousBalance:
        previousBalance,

      closingBalance:
        closingBalance,

      activeMembers:
        expected.activeMembers,

      monthlyContribution:
        expected.monthlyContribution

    };


    renderCalculation();

    renderClosingStatus();


    showStatus(
      `Calculation ready for ${formatMonth(
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


    const confirmed =
      window.confirm(
        `Close ${formatMonth(
          month
        )}?\n\nOnce closed, this record will be saved as the official monthly closing.`
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
        month,

      closed_by:
        currentUser.id,

      closed_at:
        new Date().toISOString(),

      total_expected:
        calculatedData.totalExpected,

      total_collected:
        calculatedData.totalCollected,

      total_expenses:
        calculatedData.totalExpenses,

      closing_balance:
        calculatedData.closingBalance,

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


    calculatedData =
      null;

  }
  catch (error) {

    showStatus("");

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


  if (expectedEl) {

    expectedEl.textContent =
      money(0);

  }

  if (collectedEl) {

    collectedEl.textContent =
      money(0);

  }

  if (expensesEl) {

    expensesEl.textContent =
      money(0);

  }

  if (balanceEl) {

    balanceEl.textContent =
      money(0);

  }

  if (previousBalanceEl) {

    previousBalanceEl.textContent =
      money(0);

  }


  await calculateMonth();

}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  monthInput?.addEventListener(
    "change",
    () => {

      handleMonthChange();

    }
  );


  calculateButton?.addEventListener(
    "click",
    () => {

      calculateMonth();

    }
  );


  closeButton?.addEventListener(
    "click",
    () => {

      closeMonth();

    }
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
      "CHAMA LIVE: monthly closing initialized"
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
