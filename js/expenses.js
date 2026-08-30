/* =========================================================
   CHAMA LIVE — EXPENSES
   FINAL STABLE FRONTEND VERSION

   DATABASE RULE
   ---------------------------------------------------------
   expenses.recorded_by -> members.id

   Therefore:
       recorded_by = currentMember.id

   NOT:
       recorded_by = currentUser.id

   FEATURES
   ---------------------------------------------------------
   • Load group expenses
   • Record expenses
   • Pending by default
   • Approve
   • Reject
   • Restore rejected → pending
   • Delete
   • Status filter
   • Category filter
   • Approved / Pending / Rejected totals
   • Safe receipt/reference rendering
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember
} from "./auth.js";


console.log("CHAMA LIVE: expenses.js loaded");


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

let currentUser = null;
let currentMember = null;
let groupId = null;

let expenses = [];

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


function todayString() {

  const now = new Date();

  return [
    now.getFullYear(),

    String(
      now.getMonth() + 1
    ).padStart(2, "0"),

    String(
      now.getDate()
    ).padStart(2, "0")

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


function normalizeStatus(value) {

  const status =
    String(
      value || "pending"
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


function normalizeCategory(value) {

  return String(
    value || "other"
  )
    .trim()
    .toLowerCase();

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


function clearError() {

  if (!errorEl) {

    return;

  }

  errorEl.textContent =
    "";

  errorEl.hidden =
    true;

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


function setDefaultDate() {

  if (
    dateInput &&
    !dateInput.value
  ) {

    dateInput.value =
      todayString();

  }

}


/* =========================================================
   RECEIPT / REFERENCE
========================================================= */

function renderReceipt(value) {

  const reference =
    String(
      value || ""
    ).trim();

  if (!reference) {

    return "—";

  }


  /*
     Only make actual web URLs clickable.
     Receipt numbers such as:
         REC-001
         M-PESA QWE123
     remain plain text.
  */

  const isUrl =
    /^https?:\/\/[^\s]+$/i.test(
      reference
    );


  if (!isUrl) {

    return `
      <span>
        ${escapeHtml(reference)}
      </span>
    `;

  }


  return `
    <a
      href="${escapeHtml(reference)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      View
    </a>
  `;

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

  let approved = 0;
  let pending = 0;
  let rejected = 0;


  for (
    const expense of expenses
  ) {

    const amount =
      Number(
        expense.amount || 0
      );

    const status =
      normalizeStatus(
        expense.approval_status
      );


    if (
      status === "approved"
    ) {

      approved += amount;

    }
    else if (
      status === "rejected"
    ) {

      rejected += amount;

    }
    else {

      pending += amount;

    }

  }


  if (approvedTotalEl) {

    approvedTotalEl.textContent =
      money(approved);

  }

  if (pendingTotalEl) {

    pendingTotalEl.textContent =
      money(pending);

  }

  if (rejectedTotalEl) {

    rejectedTotalEl.textContent =
      money(rejected);

  }

}


/* =========================================================
   FILTER
========================================================= */

function getFilteredExpenses() {

  const selectedStatus =
    String(
      statusFilter?.value || "all"
    )
      .trim()
      .toLowerCase();


  const selectedCategory =
    String(
      categoryFilter?.value || "all"
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
        normalizeCategory(
          expense.category
        );


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
   STATUS BADGE
========================================================= */

function statusBadge(status) {

  const normalized =
    normalizeStatus(status);


  return `
    <span
      class="expense-status expense-status-${normalized}"
    >
      ${escapeHtml(normalized)}
    </span>
  `;

}


/* =========================================================
   RENDER EXPENSES
========================================================= */

function renderExpenses() {

  if (!expenseRows) {

    return;

  }


  const list =
    getFilteredExpenses();


  if (!list.length) {

    expenseRows.innerHTML = `
      <tr>
        <td
          colspan="7"
          style="text-align:center;"
        >
          No expenses found.
        </td>
      </tr>
    `;

    return;

  }


  expenseRows.innerHTML =
    list.map(
      expense => {

        const status =
          normalizeStatus(
            expense.approval_status
          );


        let actions = "";


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
              data-id="${escapeHtml(expense.id)}"
            >
              Approve
            </button>

            <button
              type="button"
              class="btn btn-secondary"
              data-action="reject"
              data-id="${escapeHtml(expense.id)}"
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
              data-id="${escapeHtml(expense.id)}"
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
              data-id="${escapeHtml(expense.id)}"
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
            data-id="${escapeHtml(expense.id)}"
          >
            Delete
          </button>
        `;


        return `
          <tr>

            <td>
              ${escapeHtml(
                formatDate(expense.date)
              )}
            </td>

            <td>
              ${escapeHtml(
                expense.description
              )}
            </td>

            <td>
              ${escapeHtml(
                expense.category || "—"
              )}
            </td>

            <td>
              <strong>
                ${escapeHtml(
                  money(expense.amount)
                )}
              </strong>
            </td>

            <td>
              ${statusBadge(status)}
            </td>

            <td>
              ${renderReceipt(
                expense.receipt_url
              )}
            </td>

            <td>

              <div
                class="expense-actions"
              >
                ${actions}
              </div>

            </td>

          </tr>
        `;

      }
    ).join("");

}


/* =========================================================
   CREATE EXPENSE
========================================================= */

async function createExpense(event) {

  event.preventDefault();

  clearError();

  showStatus("");


  try {

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
        descriptionInput?.value || ""
      ).trim();


    const category =
      String(
        categoryInput?.value || ""
      ).trim();


    const amount =
      Number(
        amountInput?.value || 0
      );


    const date =
      String(
        dateInput?.value || ""
      ).trim();


    const receiptUrl =
      String(
        receiptInput?.value || ""
      ).trim();


    /* -----------------------------------------------------
       VALIDATION
    ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       IMPORTANT

       recorded_by = MEMBER ID
       NOT AUTH USER ID
    ----------------------------------------------------- */

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
      "CHAMA LIVE: expense insert",
      payload
    );


    const {
      data,
      error
    } =
      await supabase
        .from("expenses")
        .insert(payload)
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
      () => showStatus(""),
      3000
    );

  }
  catch (error) {

    showStatus("");

    showPageError(error);

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
  newStatus
) {

  const allowed =
    [
      "pending",
      "approved",
      "rejected"
    ];


  const status =
    String(
      newStatus || ""
    )
      .trim()
      .toLowerCase();


  if (
    !allowed.includes(status)
  ) {

    throw new Error(
      "Invalid expense status."
    );

  }


  if (!id) {

    throw new Error(
      "Expense ID is missing."
    );

  }


  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .update({
        approval_status:
          status
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
      "Expense was not updated. You may not have permission to modify it."
    );

  }


  await loadExpenses();

  renderMetrics();

  renderExpenses();


  showStatus(
    `Expense marked ${status}.`
  );


  setTimeout(
    () => showStatus(""),
    3000
  );

}


/* =========================================================
   DELETE
========================================================= */

async function deleteExpense(id) {

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
    () => showStatus(""),
    3000
  );

}


/* =========================================================
   ACTION HANDLER
========================================================= */

async function handleExpenseAction(
  action,
  id
) {

  if (
    action === "approve"
  ) {

    await updateStatus(
      id,
      "approved"
    );

    return;

  }


  if (
    action === "reject"
  ) {

    await updateStatus(
      id,
      "rejected"
    );

    return;

  }


  if (
    action === "pending"
  ) {

    await updateStatus(
      id,
      "pending"
    );

    return;

  }


  if (
    action === "delete"
  ) {

    await deleteExpense(id);

    return;

  }


  throw new Error(
    `Unknown expense action: ${action}`
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
          button.dataset.action || ""
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
          id
        );

      }
      catch (error) {

        showPageError(error);

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

  statusFilter?.addEventListener(
    "change",
    renderExpenses
  );


  categoryFilter?.addEventListener(
    "change",
    renderExpenses
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
      "Loading expenses..."
    );


    /* -----------------------------------------------------
       AUTH
    ----------------------------------------------------- */

    currentUser =
      await requireAuth();


    if (!currentUser) {

      throw new Error(
        "You are not signed in."
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


    console.log(
      "CHAMA LIVE: expense context",
      {
        userId:
          currentUser.id,

        memberId:
          currentMember.id,

        groupId:
          groupId
      }
    );


    /* -----------------------------------------------------
       EVENTS
    ----------------------------------------------------- */

    setupActions();

    setupFilters();


    form?.addEventListener(
      "submit",
      createExpense
    );


    setDefaultDate();


    /* -----------------------------------------------------
       DATA
    ----------------------------------------------------- */

    await loadExpenses();

    renderMetrics();

    renderExpenses();


    showStatus(
      "Expenses ready."
    );


    setTimeout(
      () => showStatus(""),
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

    showPageError(error);

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
    () => initPage(),
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
