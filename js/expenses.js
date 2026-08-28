/* =========================================================
   CHAMA LIVE — EXPENSES
   Schema-aligned version
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

let groupId = null;

let currentUser = null;

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

    return value;

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


function showPageError(error) {

  console.error(
    "CHAMA LIVE Expenses:",
    error
  );


  if (errorEl) {

    errorEl.textContent =
      error?.message ||
      "Unable to load expenses.";

    errorEl.hidden =
      false;

  }

}


function setDefaultDate() {

  if (!dateInput) {

    return;

  }


  const now =
    new Date();


  dateInput.value =
    [
      now.getFullYear(),
      String(
        now.getMonth() + 1
      ).padStart(2, "0"),
      String(
        now.getDate()
      ).padStart(2, "0")
    ].join("-");

}


/* =========================================================
   LOAD EXPENSES
========================================================= */

async function loadExpenses() {

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
        String(
          expense.approval_status ||
          "pending"
        ).toLowerCase();


      if (
        status ===
        "approved"
      ) {

        approved +=
          amount;

      }
      else if (
        status ===
        "rejected"
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

function filteredExpenses() {

  const selectedStatus =
    String(
      statusFilter?.value ||
      "all"
    ).toLowerCase();


  const selectedCategory =
    String(
      categoryFilter?.value ||
      "all"
    ).toLowerCase();


  return expenses.filter(
    expense => {

      const status =
        String(
          expense.approval_status ||
          "pending"
        ).toLowerCase();


      const category =
        String(
          expense.category ||
          "other"
        ).toLowerCase();


      return (
        (
          selectedStatus ===
          "all" ||
          selectedStatus ===
          status
        ) &&
        (
          selectedCategory ===
          "all" ||
          selectedCategory ===
          category
        )
      );

    }
  );

}


/* =========================================================
   RENDER
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
            String(
              expense.approval_status ||
              "pending"
            ).toLowerCase();


          let actions = "";


          if (
            status ===
            "pending"
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
          else if (
            status ===
            "approved"
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
                  expense.category
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    expense.amount
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  status
                )}
              </td>

              <td>
                ${
                  expense.receipt_url
                    ? escapeHtml(
                        expense.receipt_url
                      )
                    : "—"
                }
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
   CREATE
========================================================= */

async function createExpense(
  event
) {

  event.preventDefault();


  try {

    if (errorEl) {

      errorEl.hidden =
        true;

    }


    const description =
      descriptionInput?.value
        .trim();


    const category =
      categoryInput?.value;


    const amount =
      Number(
        amountInput?.value ||
        0
      );


    const date =
      dateInput?.value;


    const receiptUrl =
      receiptInput?.value
        .trim();


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
      !amount ||
      amount <= 0
    ) {

      throw new Error(
        "Please enter a valid amount."
      );

    }


    if (!date) {

      throw new Error(
        "Please select the expense date."
      );

    }


    saveButton.disabled =
      true;


    saveButton.textContent =
      "Saving...";


    const {
      error
    } =
      await supabase
        .from("expenses")
        .insert({

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
            currentUser.id,

          receipt_url:
            receiptUrl ||
            null,

          approval_status:
            "pending"

        });


    if (error) {

      throw error;

    }


    form?.reset();


    setDefaultDate();


    await loadExpenses();

    renderMetrics();

    renderExpenses();


    if (statusEl) {

      statusEl.textContent =
        "Expense recorded successfully.";

    }

  }
  catch (error) {

    showPageError(
      error
    );

  }
  finally {

    saveButton.disabled =
      false;

    saveButton.textContent =
      "Record Expense";

  }

}


/* =========================================================
   UPDATE STATUS
========================================================= */

async function updateStatus(
  id,
  status
) {

  const allowed = [
    "pending",
    "approved",
    "rejected"
  ];


  if (
    !allowed.includes(
      status
    )
  ) {

    throw new Error(
      "Invalid expense status."
    );

  }


  const {
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
      );


  if (error) {

    throw error;

  }


  await loadExpenses();

  renderMetrics();

  renderExpenses();


  if (statusEl) {

    statusEl.textContent =
      `Expense marked ${status}.`;

  }

}


/* =========================================================
   DELETE
========================================================= */

async function deleteExpense(
  id
) {

  if (
    !window.confirm(
      "Are you sure you want to delete this expense?"
    )
  ) {

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


  if (statusEl) {

    statusEl.textContent =
      "Expense deleted successfully.";

  }

}


/* =========================================================
   ACTIONS
========================================================= */

function setupActions() {

  expenseRows?.addEventListener(
    "click",
    async event => {

      const button =
        event.target.closest(
          "button[data-action]"
        );


      if (!button) {

        return;

      }


      const id =
        button.dataset.id;


      const action =
        button.dataset.action;


      try {

        button.disabled =
          true;


        if (
          action ===
          "delete"
        ) {

          await deleteExpense(
            id
          );

        }
        else {

          await updateStatus(
            id,
            action
          );

        }

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

    currentUser =
      await requireAuth();


    const member =
      await getMyMember();


    groupId =
      member.group_id;


    setupActions();

    setupFilters();

    setDefaultDate();


    form?.addEventListener(
      "submit",
      createExpense
    );


    await loadExpenses();

    renderMetrics();

    renderExpenses();


    if (statusEl) {

      statusEl.textContent =
        "Expenses ready.";

    }

  }
  catch (error) {

    initialized =
      false;

    showPageError(
      error
    );

  }

}


export const initExpenses =
  initPage;


console.log(
  "CHAMA LIVE: expenses.js ready"
);
