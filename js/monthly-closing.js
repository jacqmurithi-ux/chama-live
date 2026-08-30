/* =========================================================
   CHAMA LIVE — MONTHLY CLOSING
   CANONICAL ACCOUNTING VERSION

   Uses:
       get_monthly_accounting_summary()

   Accounting:
       Previous balance
       + cash contributions
       - approved expenses
       = closing balance

   Contribution progress:
       Applied to current month
       / expected monthly contributions

   Carry-forward is NOT counted as current-month
   contribution progress.
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

let currentUser = null;

let currentMember = null;

let groupId = null;

let currentClosing = null;

let calculatedData = null;

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


function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

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
          No monthly closings recorded yet.
        </td>
      </tr>
    `;

    return;

  }

  closingRows.innerHTML =
    data
      .map(
        closing => `
          <tr>

            <td>
              ${escapeHtml(
                formatMonth(
                  String(
                    closing.closing_month
                  ).slice(0, 7)
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
        `
      )
      .join("");

}


/* =========================================================
   CANONICAL ACCOUNTING
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

  showStatus(
    `Calculating ${formatMonth(month)}...`
  );


  /*
     ONE DATABASE ENGINE

     Everything below comes from:

       get_monthly_accounting_summary()

     This keeps Reports and Monthly Closing
     consistent.
  */

  const {
    data,
    error
  } =
    await supabase
      .rpc(
        "get_monthly_accounting_summary",
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
      "No accounting summary was returned."
    );

  }


  calculatedData =
    data;


  renderCalculation();

  await loadExistingClosing(
    month
  );

  renderClosingStatus();


  showStatus(
    `Calculation ready for ${formatMonth(month)}.`
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
        calculatedData
          .expected_monthly_contributions
      );

  }


  if (collectedEl) {

    collectedEl.textContent =
      money(
        calculatedData
          .total_contributions_collected
      );

  }


  if (expensesEl) {

    expensesEl.textContent =
      money(
        calculatedData
          .approved_expenses
      );

  }


  if (previousBalanceEl) {

    previousBalanceEl.textContent =
      money(
        calculatedData
          .opening_balance
      );

  }


  if (balanceEl) {

    balanceEl.textContent =
      money(
        calculatedData
          .closing_balance
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

    if (closeButton) {

      closeButton.disabled =
        false;

      closeButton.textContent =
        "Close Month";

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


    const confirmed =
      window.confirm(
        `Close ${formatMonth(month)}?\n\n` +
        `Collected: ${money(
          calculatedData
            .total_contributions_collected
        )}\n` +
        `Approved expenses: ${money(
          calculatedData
            .approved_expenses
        )}\n` +
        `Closing balance: ${money(
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
      `Closing ${formatMonth(month)}...`
    );


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

      /*
         PostgreSQL unique constraint protects against
         accidentally closing the same month twice.
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
   EVENTS
========================================================= */

function setupEvents() {

  monthInput?.addEventListener(
    "change",
    () => {

      calculatedData =
        null;

      currentClosing =
        null;

      calculateMonth()
        .catch(
          showError
        );

    }
  );


  calculateButton?.addEventListener(
    "click",
    () => {

      calculateMonth()
        .catch(
          showError
        );

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
      "CHAMA LIVE: monthly closing initialized",
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
