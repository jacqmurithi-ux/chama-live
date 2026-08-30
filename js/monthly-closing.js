/* =========================================================
   CHAMA LIVE — MONTHLY CLOSING
   FULL SCHEMA-ALIGNED VERSION

   DATABASE
   ---------------------------------------------------------
   monthly_closings
   • id
   • group_id
   • closing_month
   • closed_by
   • closed_at
   • total_expected
   • total_collected
   • total_expenses
   • closing_balance
   • notes

   IMPORTANT
   ---------------------------------------------------------
   closed_by = currentMember.id
   NOT auth.users.id
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

const openingEl =
  document.getElementById("openingBalance");

const closingEl =
  document.getElementById("closingBalance");

const collectionRateEl =
  document.getElementById("collectionRate");

const closingStatusEl =
  document.getElementById("closingStatus");

const historyRows =
  document.getElementById("closingRows");


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentMember = null;

let groupId = null;

let initialized = false;

let closingData = null;


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


/* =========================================================
   DATE HELPERS
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
    ),

    "01"

  ].join("-");

}


function getMonthRange(
  month
) {

  const firstDay =
    new Date(
      `${month}T00:00:00`
    );


  const nextMonth =
    new Date(
      firstDay
    );


  nextMonth.setMonth(
    nextMonth.getMonth() + 1
  );


  const nextMonthString =
    [
      nextMonth.getFullYear(),

      String(
        nextMonth.getMonth() + 1
      ).padStart(
        2,
        "0"
      ),

      "01"

    ].join("-");


  return {
    start:
      month,

    end:
      nextMonthString
  };

}


function formatMonth(
  value
) {

  if (!value) {

    return "—";

  }


  const date =
    new Date(
      `${value}T00:00:00`
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


function formatDateTime(
  value
) {

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

    return value;

  }


  return date.toLocaleString(
    "en-KE",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  );

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(
  value
) {

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
   STATUS
========================================================= */

function showStatus(
  message
) {

  if (!statusEl) {

    return;

  }


  statusEl.textContent =
    message || "";

  statusEl.hidden =
    !message;

}


function showError(
  error
) {

  console.error(
    "CHAMA LIVE Monthly Closing:",
    error
  );


  if (errorEl) {

    errorEl.textContent =
      error?.message ||
      String(error) ||
      "Unable to process monthly closing.";

    errorEl.hidden =
      false;

  }

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
   GET GROUP
========================================================= */

async function loadGroup() {

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
        opening_balance
      `)
      .eq(
        "id",
        groupId
      )
      .single();


  if (error) {

    throw error;

  }


  return data;

}


/* =========================================================
   ACTIVE MEMBERS
========================================================= */

async function getActiveMemberCount() {

  const {
    count,
    error
  } =
    await supabase
      .from("members")
      .select(
        "id",
        {
          count: "exact",
          head: true
        }
      )
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "status",
        "active"
      );


  if (error) {

    throw error;

  }


  return Number(
    count || 0
  );

}


/* =========================================================
   PREVIOUS CLOSING
========================================================= */

async function getPreviousClosing(
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
        closing_month,
        closing_balance,
        closed_at
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


  return data || null;

}


/* =========================================================
   CHECK CURRENT CLOSING
========================================================= */

async function getCurrentClosing(
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


  return data || null;

}


/* =========================================================
   CALCULATE EXPECTED
========================================================= */

async function calculateExpected(
  group
) {

  const memberCount =
    await getActiveMemberCount();


  const monthlyContribution =
    Number(
      group?.monthly_contribution ||
      0
    );


  return (
    memberCount *
    monthlyContribution
  );

}


/* =========================================================
   CALCULATE COLLECTIONS
========================================================= */

async function calculateCollections(
  range
) {

  const {
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select(`
        amount,
        contribution_date,
        contribution_type
      `)
      .eq(
        "group_id",
        groupId
      )
      .gte(
        "contribution_date",
        range.start
      )
      .lt(
        "contribution_date",
        range.end
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
          contribution.amount ||
          0
        )
      );

    },
    0
  );

}


/* =========================================================
   CALCULATE APPROVED EXPENSES
========================================================= */

async function calculateExpenses(
  range
) {

  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .select(`
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
        range.start
      )
      .lt(
        "date",
        range.end
      )
      .eq(
        "approval_status",
        "approved"
      );


  if (error) {

    throw error;

  }


  return (
    data || []
  ).reduce(
    (
      total,
      expense
    ) => {

      return (
        total +
        Number(
          expense.amount ||
          0
        )
      );

    },
    0
  );

}


/* =========================================================
   CALCULATE MONTH
========================================================= */

async function calculateClosing() {

  clearError();


  if (!groupId) {

    throw new Error(
      "No group is associated with this account."
    );

  }


  const month =
    monthInput?.value;


  if (!month) {

    throw new Error(
      "Please select a closing month."
    );

  }


  showStatus(
    "Calculating monthly closing..."
  );


  const group =
    await loadGroup();


  const range =
    getMonthRange(
      month
    );


  const [
    totalExpected,
    totalCollected,
    totalExpenses,
    previousClosing,
    existingClosing
  ] =
    await Promise.all([
      calculateExpected(
        group
      ),

      calculateCollections(
        range
      ),

      calculateExpenses(
        range
      ),

      getPreviousClosing(
        month
      ),

      getCurrentClosing(
        month
      )
    ]);


  const openingBalance =
    previousClosing
      ? Number(
          previousClosing.closing_balance ||
          0
        )
      : Number(
          group?.opening_balance ||
          0
        );


  const closingBalance =
    openingBalance +
    totalCollected -
    totalExpenses;


  const collectionRate =
    totalExpected > 0
      ? (
          totalCollected /
          totalExpected
        ) *
        100
      : 0;


  closingData = {

    month,

    totalExpected,

    totalCollected,

    totalExpenses,

    openingBalance,

    closingBalance,

    collectionRate,

    existingClosing,

    previousClosing

  };


  renderClosing();


  if (existingClosing) {

    showStatus(
      "This month has already been closed."
    );

  }
  else {

    showStatus(
      "Monthly closing calculated."
    );

  }

}


/* =========================================================
   RENDER
========================================================= */

function renderClosing() {

  if (!closingData) {

    return;

  }


  if (expectedEl) {

    expectedEl.textContent =
      money(
        closingData.totalExpected
      );

  }


  if (collectedEl) {

    collectedEl.textContent =
      money(
        closingData.totalCollected
      );

  }


  if (expensesEl) {

    expensesEl.textContent =
      money(
        closingData.totalExpenses
      );

  }


  if (openingEl) {

    openingEl.textContent =
      money(
        closingData.openingBalance
      );

  }


  if (closingEl) {

    closingEl.textContent =
      money(
        closingData.closingBalance
      );

  }


  if (collectionRateEl) {

    collectionRateEl.textContent =
      `${Math.min(
        closingData.collectionRate,
        100
      ).toFixed(1)}%`;

  }


  if (closingStatusEl) {

    if (
      closingData.existingClosing
    ) {

      closingStatusEl.textContent =
        "CLOSED";

    }
    else {

      closingStatusEl.textContent =
        "OPEN";

    }

  }


  if (closeButton) {

    closeButton.disabled =
      Boolean(
        closingData.existingClosing
      );

  }

}


/* =========================================================
   SAVE CLOSING
========================================================= */

async function closeMonth() {

  clearError();


  if (!closingData) {

    throw new Error(
      "Calculate the monthly closing first."
    );

  }


  if (
    closingData.existingClosing
  ) {

    throw new Error(
      "This month has already been closed."
    );

  }


  if (!currentMember?.id) {

    throw new Error(
      "Your member record could not be found."
    );

  }


  const confirmed =
    window.confirm(
      `Close ${formatMonth(
        closingData.month
      )}? This will record the month's financial closing.`
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
    "Saving monthly closing..."
  );


  const payload = {

    group_id:
      groupId,

    closing_month:
      closingData.month,

    closed_by:
      currentMember.id,

    closed_at:
      new Date().toISOString(),

    total_expected:
      closingData.totalExpected,

    total_collected:
      closingData.totalCollected,

    total_expenses:
      closingData.totalExpenses,

    closing_balance:
      closingData.closingBalance,

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


  closingData.existingClosing =
    data;


  renderClosing();

  await loadHistory();


  showStatus(
    `${formatMonth(
      closingData.month
    )} closed successfully.`
  );

}


/* =========================================================
   LOAD HISTORY
========================================================= */

async function loadHistory() {

  if (!historyRows) {

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


  const rows =
    data || [];


  if (!rows.length) {

    historyRows.innerHTML = `
      <tr>
        <td colspan="6">
          No monthly closings recorded yet.
        </td>
      </tr>
    `;

    return;

  }


  historyRows.innerHTML =
    rows.map(
      row => {

        return `
          <tr>

            <td>
              ${escapeHtml(
                formatMonth(
                  row.closing_month
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                money(
                  row.total_expected
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                money(
                  row.total_collected
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                money(
                  row.total_expenses
                )
              )}
            </td>

            <td>
              <strong>
                ${escapeHtml(
                  money(
                    row.closing_balance
                  )
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                formatDateTime(
                  row.closed_at
                )
              )}
            </td>

          </tr>
        `;

      }
    ).join("");

}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  calculateButton?.addEventListener(
    "click",
    async () => {

      try {

        await calculateClosing();

      }
      catch (error) {

        showError(
          error
        );

        showStatus("");

      }

    }
  );


  closeButton?.addEventListener(
    "click",
    async () => {

      try {

        await closeMonth();

      }
      catch (error) {

        showError(
          error
        );

        showStatus("");

      }
      finally {

        if (closeButton) {

          closeButton.disabled =
            Boolean(
              closingData?.existingClosing
            );

          closeButton.textContent =
            "Close Month";

        }

      }

    }
  );


  monthInput?.addEventListener(
    "change",
    () => {

      closingData =
        null;

      if (closeButton) {

        closeButton.disabled =
          true;

      }

      if (closingStatusEl) {

        closingStatusEl.textContent =
          "NOT CALCULATED";

      }

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

    await loadHistory();

    await calculateClosing();


    console.log(
      "CHAMA LIVE: monthly closing initialized",
      {
        userId:
          currentUser.id,

        memberId:
          currentMember.id,

        groupId:
          groupId
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
   PUBLIC ALIAS
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
