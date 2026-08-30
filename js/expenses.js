/* =========================================================
   CHAMA LIVE — EXPENSES
   FULL SCHEMA-ALIGNED VERSION

   FEATURES
   ---------------------------------------------------------
   • Load group expenses
   • Record new expenses
   • recorded_by uses the current MEMBER id
   • Default approval status = pending
   • Approve pending expenses
   • Reject pending/approved expenses
   • Restore rejected expenses to pending
   • Delete expenses
   • Filter by status
   • Filter by category
   • Approved / Pending / Rejected totals
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember
} from "./auth.js";


console.log(
  "CHAMA LIVE: expenses.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const form =
  document.getElementById("expenseForm");

const descriptionInput =
  document.getElementById("description");

const categoryInput =
  document.getElementById("category");

const amountInput =
  document.getElementById("amount");

const dateInput =
  document.getElementById("expenseDate");

const receiptInput =
  document.getElementById("receiptUrl");

const saveButton =
  document.getElementById("saveExpense");

const statusFilter =
  document.getElementById("statusFilter");

const categoryFilter =
  document.getElementById("categoryFilter");

const expenseRows =
  document.getElementById("expenseRows");

const approvedTotalEl =
  document.getElementById("approvedTotal");

const pendingTotalEl =
  document.getElementById("pendingTotal");

const rejectedTotalEl =
  document.getElementById("rejectedTotal");


/* =========================================================
   STATE
========================================================= */

let groupId =
  null;

let currentUser =
  null;

let currentMember =
  null;

let expenses =
  [];

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


/* =========================================================
   DATE
========================================================= */

function todayString() {

  const now =
    new Date();

  return [
    now.getFullYear(),

    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    ),

    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    )

  ].join("-");

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
   HTML ESCAPE
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
   STATUS MESSAGE
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


function showPageError(error) {

  console.error(
    "CHAMA LIVE Expenses:",
    error
  );


  const message =
    error?.message ||
    String(error) ||
    "Unable to process expense.";


  if (errorEl) {

    errorEl.textContent =
      message;

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
   DEFAULT DATE
========================================================= */

function setDefaultDate() {

  if (!dateInput) {

    return;

  }


  if (!dateInput.value) {

    dateInput.value =
      todayString();

  }

}


/* =========================================================
   NORMALIZE STATUS
========================================================= */

function normalizeStatus(
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
   LOAD EXPENSES
========================================================= */

async function loadExpenses() {

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
   METRICS
========================================================= */

function renderMetrics() {

  let approved =
    0;

  let pending =
    0;

  let rejected =
    0;


  expenses.forEach(
    expense => {

      const amount =
        Number(
          expense.amount ||
          0
        );


      const status =
        normalizeStatus(
          expense.approval_status
        );


      if (
        status === "approved"
      ) {

        approved +=
          amount;

      }
      else if (
        status === "rejected"
      ) {

        rejected +=
          amount;

      }
      else {

        pending +=
          amount;

      }

    }
  );


  if (approvedTotalEl) {

    approvedTotalEl.textContent =
      money(
        approved
      );

  }


  if (pendingTotalEl) {

    pendingTotalEl.textContent =
      money(
        pending
      );

  }


  if (rejectedTotalEl) {

    rejectedTotalEl.textContent =
      money(
        rejected
      );

  }

}


/* =========================================================
   FILTERED EXPENSES
========================================================= */

function filteredExpenses() {

  const selectedStatus =
    String(
      statusFilter?.value ||
      "all"
    )
      .trim()
      .toLowerCase();


  const selectedCategory =
    String(
      categoryFilter?.value ||
      "all"
    )
      .trim()
      .toLowerCase();


  return expenses.filter(
    expense => {

      const status =
        normalizeStatus(
          expense.approval_status
        );


      const category =
        String(
          expense.category ||
          "other"
        )
          .trim()
          .toLowerCase();


      const statusMatches =
        selectedStatus === "all" ||
        selectedStatus === status;


      const categoryMatches =
        selectedCategory === "all" ||
        selectedCategory === category;


      return (
        statusMatches &&
        categoryMatches
      );

    }
  );

}


/* =========================================================
   RENDER EXPENSES
========================================================= */

function renderExpenses() {

  if (!expenseRows) {

    return;

  }


  const list =
    filteredExpenses();


  if (!list.length) {

    expenseRows.innerHTML = `
      <tr>
        <td colspan="7">
          No expenses found.
        </td>
      </tr>
    `;

    return;

  }


  expenseRows.innerHTML =
    list
      .map(
        expense => {

          const status =
            normalizeStatus(
              expense.approval_status
            );


          let actions =
            "";


          /* -------------------------------------------------
             PENDING
          ------------------------------------------------- */

          if (
            status === "pending"
          ) {

            actions += `
              <button
                type="button"
                class="btn btn-secondary"
                data-action="approve"
                data-id="${escapeHtml(
                  expense.id
                )}"
              >
                Approve
              </button>

              <button
                type="button"
                class="btn btn-secondary"
                data-action="reject"
                data-id="${escapeHtml(
                  expense.id
                )}"
              >
                Reject
              </button>
            `;

          }


          /* -------------------------------------------------
             APPROVED
          ------------------------------------------------- */

          else if (
            status === "approved"
          ) {

            actions += `
              <button
                type="button"
                class="btn btn-secondary"
                data-action="reject"
                data-id="${escapeHtml(
                  expense.id
                )}"
              >
                Reject
              </button>
            `;

          }


          /* -------------------------------------------------
             REJECTED
          ------------------------------------------------- */

          else {

            actions += `
              <button
                type="button"
                class="btn btn-secondary"
                data-action="pending"
                data-id="${escapeHtml(
                  expense.id
                )}"
              >
                Restore
              </button>
            `;

          }


          /* -------------------------------------------------
             DELETE
          ------------------------------------------------- */

          actions += `
            <button
              type="button"
              class="btn btn-secondary"
              data-action="delete"
              data-id="${escapeHtml(
                expense.id
              )}"
            >
              Delete
            </button>
          `;


          const receipt =
            expense.receipt_url
              ? `
                <a
                  href="${escapeHtml(
                    expense.receipt_url
                  )}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View
                </a>
              `
              : "—";


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
                  status
                )}
              </td>

              <td>
                ${receipt}
              </td>

              <td>

                <div
                  style="
                    display:flex;
                    gap:6px;
                    flex-wrap:wrap;
                  "
                >
                  ${actions}
                </div>

              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   CREATE EXPENSE
========================================================= */

async function createExpense(
  event
) {

  event.preventDefault();


  try {

    clearError();

    showStatus("");


    if (!groupId) {

      throw new Error(
        "No group is associated with this account."
      );

    }


    if (!currentMember?.id) {

      throw new Error(
        "Your member record could not be found."
      );

    }


    const description =
      String(
        descriptionInput?.value ||
        ""
      )
        .trim();


    const category =
      String(
        categoryInput?.value ||
        ""
      )
        .trim();


    const amount =
      Number(
        amountInput?.value ||
        0
      );


    const date =
      dateInput?.value ||
      "";


    const receiptUrl =
      String(
        receiptInput?.value ||
        ""
      )
        .trim();


    /* -------------------------------------------------------
       VALIDATION
    ------------------------------------------------------- */

    if (!description) {

      throw new Error(
        "Please enter an expense description."
      );

    }


    if (!category) {

      throw new Error(
        "Please select an expense category."
      );

    }


    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {

      throw new Error(
        "Please enter a valid expense amount."
      );

    }


    if (!date) {

      throw new Error(
        "Please select the expense date."
      );

    }


    if (saveButton) {

      saveButton.disabled =
        true;

      saveButton.textContent =
        "Saving...";

    }


    showStatus(
      "Recording expense..."
    );


    /* -------------------------------------------------------
       INSERT

       IMPORTANT:
       recorded_by is the MEMBER id, not auth.users.id.
    ------------------------------------------------------- */

    const payload = {

      group_id:
        groupId,

      description:
        description,

      category:
        category,

      amount:
        amount,

      date:
        date,

      recorded_by:
        currentMember.id,

      receipt_url:
        receiptUrl ||
        null,

      approval_status:
        "pending"

    };


    console.log(
      "CHAMA LIVE: inserting expense",
      payload
    );


    const {
      data,
      error
    } =
      await supabase
        .from("expenses")
        .insert(
          payload
        )
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
        .single();


    if (error) {

      throw error;

    }


    console.log(
      "CHAMA LIVE: expense created",
      data
    );


    if (form) {

      form.reset();

    }


    setDefaultDate();


    await loadExpenses();

    renderMetrics();

    renderExpenses();


    showStatus(
      "Expense recorded successfully."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      3000
    );

  }
  catch (error) {

    showStatus("");

    showPageError(
      error
    );

  }
  finally {

    if (saveButton) {

      saveButton.disabled =
        false;

      saveButton.textContent =
        "Record Expense";

    }

  }

}


/* =========================================================
   UPDATE STATUS
========================================================= */

async function updateStatus(
  id,
  status
) {

  const allowedStatuses = [
    "pending",
    "approved",
    "rejected"
  ];


  const normalizedStatus =
    String(
      status ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    !allowedStatuses.includes(
      normalizedStatus
    )
  ) {

    throw new Error(
      `Invalid expense status: ${status}`
    );

  }


  if (!id) {

    throw new Error(
      "Expense ID is missing."
    );

  }


  console.log(
    "CHAMA LIVE: updating expense status",
    {
      id,
      status:
        normalizedStatus
    }
  );


  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .update({
        approval_status:
          normalizedStatus
      })
      .eq(
        "id",
        id
      )
      .eq(
        "group_id",
        groupId
      )
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
      .single();


  if (error) {

    throw error;

  }


  if (!data) {

    throw new Error(
      "Expense was not updated. You may not have permission to modify this expense."
    );

  }


  await loadExpenses();

  renderMetrics();

  renderExpenses();


  showStatus(
    `Expense marked ${normalizedStatus}.`
  );


  setTimeout(
    () => {

      showStatus("");

    },
    3000
  );

}


/* =========================================================
   DELETE EXPENSE
========================================================= */

async function deleteExpense(
  id
) {

  if (!id) {

    throw new Error(
      "Expense ID is missing."
    );

  }


  const confirmed =
    window.confirm(
      "Are you sure you want to delete this expense?"
    );


  if (!confirmed) {

    return;

  }


  console.log(
    "CHAMA LIVE: deleting expense",
    id
  );


  const {
    error
  } =
    await supabase
      .from("expenses")
      .delete()
      .eq(
        "id",
        id
      )
      .eq(
        "group_id",
        groupId
      );


  if (error) {

    throw error;

  }


  await loadExpenses();

  renderMetrics();

  renderExpenses();


  showStatus(
    "Expense deleted successfully."
  );


  setTimeout(
    () => {

      showStatus("");

    },
    3000
  );

}


/* =========================================================
   ACTION HANDLER
========================================================= */

async function handleExpenseAction(
  action,
  id,
  button
) {

  if (!action) {

    return;

  }


  if (!id) {

    throw new Error(
      "Expense ID is missing."
    );

  }


  /* -------------------------------------------------------
     IMPORTANT STATUS MAPPING

     UI action       DATABASE status
     --------------------------------
     approve         approved
     reject          rejected
     pending         pending
  ------------------------------------------------------- */

  const statusMap = {

    approve:
      "approved",

    reject:
      "rejected",

    pending:
      "pending"

  };


  if (
    action === "delete"
  ) {

    await deleteExpense(
      id
    );

    return;

  }


  const newStatus =
    statusMap[action];


  if (!newStatus) {

    throw new Error(
      `Unknown expense action: ${action}`
    );

  }


  await updateStatus(
    id,
    newStatus
  );

}


/* =========================================================
   ACTION EVENTS
========================================================= */

function setupActions() {

  if (!expenseRows) {

    return;

  }


  expenseRows.addEventListener(
    "click",
    async event => {

      const button =
        event.target.closest(
          "button[data-action]"
        );


      if (!button) {

        return;

      }


      const action =
        String(
          button.dataset.action ||
          ""
        )
          .trim()
          .toLowerCase();


      const id =
        button.dataset.id;


      if (!id) {

        showPageError(
          new Error(
            "Expense ID is missing."
          )
        );

        return;

      }


      try {

        clearError();


        button.disabled =
          true;


        await handleExpenseAction(
          action,
          id,
          button
        );

      }
      catch (error) {

        showPageError(
          error
        );

      }
      finally {

        button.disabled =
          false;

      }

    }
  );

}


/* =========================================================
   FILTER EVENTS
========================================================= */

function setupFilters() {

  if (statusFilter) {

    statusFilter.addEventListener(
      "change",
      () => {

        renderExpenses();

      }
    );

  }


  if (categoryFilter) {

    categoryFilter.addEventListener(
      "change",
      () => {

        renderExpenses();

      }
    );

  }

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initPage() {

  if (initialized) {

    console.warn(
      "CHAMA LIVE: expenses already initialized"
    );

    return;

  }


  initialized =
    true;


  try {

    clearError();

    showStatus(
      "Loading expenses..."
    );


    /* -------------------------------------------------------
       AUTHENTICATION
    ------------------------------------------------------- */

    currentUser =
      await requireAuth();


    if (!currentUser) {

      throw new Error(
        "You are not signed in."
      );

    }


    /* -------------------------------------------------------
       MEMBER
    ------------------------------------------------------- */

    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "No member record is linked to this account."
      );

    }


    /* -------------------------------------------------------
       GROUP
    ------------------------------------------------------- */

    groupId =
      currentMember.group_id;


    if (!groupId) {

      throw new Error(
        "Your member record is not linked to a group."
      );

    }


    console.log(
      "CHAMA LIVE: expenses context",
      {
        userId:
          currentUser.id,

        memberId:
          currentMember.id,

        groupId:
          groupId
      }
    );


    /* -------------------------------------------------------
       EVENTS
    ------------------------------------------------------- */

    setupActions();

    setupFilters();


    if (form) {

      form.addEventListener(
        "submit",
        createExpense
      );

    }


    setDefaultDate();


    /* -------------------------------------------------------
       DATA
    ------------------------------------------------------- */

    await loadExpenses();

    renderMetrics();

    renderExpenses();


    showStatus(
      "Expenses ready."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      2000
    );


    console.log(
      "CHAMA LIVE: expenses initialized"
    );

  }
  catch (error) {

    initialized =
      false;

    showStatus("");

    showPageError(
      error
    );

  }

}


/* =========================================================
   PUBLIC ALIAS
========================================================= */

export const initExpenses =
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
  "CHAMA LIVE: expenses.js ready"
);
