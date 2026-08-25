import { supabase } from "./supabase.js";


/* =====================================================
   ELEMENTS
===================================================== */

const statusEl =
  document.getElementById(
    "status"
  );

const errorEl =
  document.getElementById(
    "error"
  );

const form =
  document.getElementById(
    "expenseForm"
  );

const descriptionInput =
  document.getElementById(
    "description"
  );

const categoryInput =
  document.getElementById(
    "category"
  );

const amountInput =
  document.getElementById(
    "amount"
  );

const dateInput =
  document.getElementById(
    "expenseDate"
  );

const receiptInput =
  document.getElementById(
    "receiptUrl"
  );

const saveButton =
  document.getElementById(
    "saveExpense"
  );

const statusFilter =
  document.getElementById(
    "statusFilter"
  );

const categoryFilter =
  document.getElementById(
    "categoryFilter"
  );

const expenseRows =
  document.getElementById(
    "expenseRows"
  );

const approvedTotalEl =
  document.getElementById(
    "approvedTotal"
  );

const pendingTotalEl =
  document.getElementById(
    "pendingTotal"
  );

const rejectedTotalEl =
  document.getElementById(
    "rejectedTotal"
  );


/* =====================================================
   STATE
===================================================== */

let groupId = null;

let expenses = [];


/* =====================================================
   HELPERS
===================================================== */

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

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
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


/* =====================================================
   ERROR
===================================================== */

function showError(error) {

  console.error(
    "Expenses error:",
    error
  );

  errorEl.textContent =
    error?.message ||
    "Unable to load expenses.";

  errorEl.hidden =
    false;

}


/* =====================================================
   GET GROUP
===================================================== */

async function getGroupId() {

  const {
    data,
    error
  } = await supabase.rpc(
    "my_group_id"
  );

  if (error) {
    throw error;
  }

  if (!data) {

    throw new Error(
      "No group is associated with your account."
    );

  }

  return data;

}


/* =====================================================
   LOAD EXPENSES
===================================================== */

async function loadExpenses() {

  const {
    data,
    error
  } = await supabase
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


/* =====================================================
   RENDER METRICS
===================================================== */

function renderMetrics() {

  let approved = 0;

  let pending = 0;

  let rejected = 0;


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


  approvedTotalEl.textContent =
    money(
      approved
    );

  pendingTotalEl.textContent =
    money(
      pending
    );

  rejectedTotalEl.textContent =
    money(
      rejected
    );

}


/* =====================================================
   FILTER EXPENSES
===================================================== */

function getFilteredExpenses() {

  const selectedStatus =
    String(
      statusFilter.value
    ).toLowerCase();


  const selectedCategory =
    String(
      categoryFilter.value
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


      const statusMatches =
        selectedStatus ===
        "all" ||
        status ===
        selectedStatus;


      const categoryMatches =
        selectedCategory ===
        "all" ||
        category ===
        selectedCategory;


      return (
        statusMatches &&
        categoryMatches
      );

    }
  );

}


/* =====================================================
   RENDER LEDGER
===================================================== */

function renderExpenses() {

  const filtered =
    getFilteredExpenses();


  if (
    !filtered.length
  ) {

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
    filtered.map(
      expense => {

        const status =
          String(
            expense.approval_status ||
            "pending"
          ).toLowerCase();


        const receipt =
          expense.receipt_url
            ? escapeHtml(
                expense.receipt_url
              )
            : "—";


        let actions = "";


        /*
          Pending expense:
          Show Approve and Reject.
        */

        if (
          status ===
          "pending"
        ) {

          actions = `

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


        /*
          Approved expense:
          Show Reject option.
        */

        else if (
          status ===
          "approved"
        ) {

          actions = `

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


        /*
          Rejected expense:
          Allow restoring to pending.
        */

        else if (
          status ===
          "rejected"
        ) {

          actions = `

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


        /*
          Delete button.
        */

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
              <strong>
                ${escapeHtml(
                  expense.description
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                expense.category
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
              <strong>
                ${escapeHtml(
                  status
                )}
              </strong>
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


/* =====================================================
   CREATE EXPENSE
===================================================== */

async function createExpense(
  event
) {

  event.preventDefault();


  try {

    errorEl.hidden =
      true;


    const description =
      descriptionInput.value.trim();

    const category =
      categoryInput.value;

    const amount =
      Number(
        amountInput.value
      );

    const date =
      dateInput.value;

    const receiptUrl =
      receiptInput.value.trim();


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


    /*
      Get current authenticated user.
    */

    const {
      data: {
        user
      }
    } =
      await supabase.auth.getUser();


    if (!user) {

      throw new Error(
        "Your session has expired. Please sign in again."
      );

    }


    /*
      Insert into existing
      expenses table.

      New expenses are ALWAYS
      pending.
    */

    const {
      error
    } = await supabase
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
          user.id,

        receipt_url:
          receiptUrl ||
          null,

        approval_status:
          "pending"

      });


    if (error) {
      throw error;
    }


    /*
      Reset form.
    */

    form.reset();

    setDefaultDate();


    /*
      Reload.
    */

    await loadExpenses();

    renderMetrics();

    renderExpenses();


    statusEl.textContent =
      "Expense recorded successfully.";


  }
  catch (error) {

    showError(
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


/* =====================================================
   UPDATE STATUS
===================================================== */

async function updateExpenseStatus(
  id,
  newStatus
) {

  try {

    errorEl.hidden =
      true;


    const allowedStatuses = [
      "pending",
      "approved",
      "rejected"
    ];


    if (
      !allowedStatuses.includes(
        newStatus
      )
    ) {

      throw new Error(
        "Invalid expense status."
      );

    }


    const {
      error
    } = await supabase
      .from("expenses")
      .update({

        approval_status:
          newStatus

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


    statusEl.textContent =
      `Expense marked ${newStatus}.`;


  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =====================================================
   DELETE EXPENSE
===================================================== */

async function deleteExpense(
  id
) {

  try {

    errorEl.hidden =
      true;


    const confirmed =
      window.confirm(
        "Are you sure you want to delete this expense?"
      );


    if (!confirmed) {
      return;
    }


    const {
      error
    } = await supabase
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


    statusEl.textContent =
      "Expense deleted successfully.";


  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =====================================================
   ACTION HANDLER
===================================================== */

async function handleExpenseAction(
  event
) {

  const button =
    event.target.closest(
      "button[data-action]"
    );


  if (!button) {
    return;
  }


  const action =
    button.dataset.action;

  const id =
    button.dataset.id;


  if (!id) {
    return;
  }


  /*
    Approve.
  */

  if (
    action ===
    "approve"
  ) {

    await updateExpenseStatus(
      id,
      "approved"
    );

    return;

  }


  /*
    Reject.
  */

  if (
    action ===
    "reject"
  ) {

    await updateExpenseStatus(
      id,
      "rejected"
    );

    return;

  }


  /*
    Restore to pending.
  */

  if (
    action ===
    "pending"
  ) {

    await updateExpenseStatus(
      id,
      "pending"
    );

    return;

  }


  /*
    Delete.
  */

  if (
    action ===
    "delete"
  ) {

    await deleteExpense(
      id
    );

  }

}


/* =====================================================
   DEFAULT DATE
===================================================== */

function setDefaultDate() {

  const now =
    new Date();


  const year =
    now.getFullYear();


  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );


  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );


  dateInput.value =
    `${year}-${month}-${day}`;

}


/* =====================================================
   FILTER EVENTS
===================================================== */

statusFilter.addEventListener(
  "change",
  renderExpenses
);


categoryFilter.addEventListener(
  "change",
  renderExpenses
);


form.addEventListener(
  "submit",
  createExpense
);


expenseRows.addEventListener(
  "click",
  handleExpenseAction
);


/* =====================================================
   INITIALIZE
===================================================== */

async function init() {

  try {

    errorEl.hidden =
      true;

    statusEl.textContent =
      "Loading expenses...";


    setDefaultDate();


    /*
      Get group.
    */

    groupId =
      await getGroupId();


    /*
      Load expenses.
    */

    await loadExpenses();


    /*
      Render.
    */

    renderMetrics();

    renderExpenses();


    statusEl.textContent =
      `Expenses loaded • ${new Date().toLocaleString(
        "en-KE"
      )}`;


  }
  catch (error) {

    showError(
      error
    );

    statusEl.textContent =
      "Unable to load expenses.";

  }

}


/* =====================================================
   START
===================================================== */

init();
