/* =========================================================
   CHAMA LIVE — SUPPORT & WELFARE

   PHASE 1 — GROUP OPERATIONS FOUNDATION

   DATABASE
   ---------------------------------------------------------
   public.group_support_cases

   SECURITY
   ---------------------------------------------------------
   - Authentication comes from auth.js.
   - Current member comes from getMyMember().
   - Current group comes from currentMember.group_id.
   - No group_id is accepted from URL/localStorage/form.
   - RLS remains the database authorization boundary.
   - Database validators remain authoritative.
   - This module does not modify any 2B accounting object.

   IMPORTANT
   ---------------------------------------------------------
   Paid support requires an existing expense_id.
   This page does NOT create expenses.

   The existing Expenses workflow remains responsible
   for expense creation and approval.
========================================================= */

import {
  supabase
} from "./supabase.js";

import {
  requireAuth,
  getMyMember
} from "./auth.js";


console.log(
  "CHAMA LIVE: support-welfare.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const groupNameEl =
  document.getElementById(
    "groupName"
  );

const statusEl =
  document.getElementById(
    "status"
  );

const errorEl =
  document.getElementById(
    "error"
  );

const accessDeniedEl =
  document.getElementById(
    "accessDenied"
  );

const supportContentEl =
  document.getElementById(
    "supportContent"
  );

const supportForm =
  document.getElementById(
    "supportForm"
  );

const memberSelect =
  document.getElementById(
    "memberId"
  );

const supportTypeSelect =
  document.getElementById(
    "supportType"
  );

const supportDateInput =
  document.getElementById(
    "supportDate"
  );

const amountInput =
  document.getElementById(
    "amount"
  );

const descriptionInput =
  document.getElementById(
    "description"
  );

const saveButton =
  document.getElementById(
    "saveSupport"
  );

const resetButton =
  document.getElementById(
    "resetSupport"
  );

const refreshButton =
  document.getElementById(
    "refreshSupport"
  );

const statusFilter =
  document.getElementById(
    "statusFilter"
  );

const searchInput =
  document.getElementById(
    "caseSearch"
  );

const supportRows =
  document.getElementById(
    "supportRows"
  );

const totalCasesEl =
  document.getElementById(
    "totalCases"
  );

const openCasesEl =
  document.getElementById(
    "openCases"
  );

const approvedCasesEl =
  document.getElementById(
    "approvedCases"
  );

const totalAmountEl =
  document.getElementById(
    "totalAmount"
  );


/* =========================================================
   STATE
========================================================= */

let currentUser =
  null;

let currentMember =
  null;

let groupId =
  null;

let members =
  [];

let expenses =
  [];

let supportCases =
  [];

let initialized =
  false;


/* =========================================================
   LIVE DATABASE ENUMS
========================================================= */

const MANAGEMENT_ROLES =
  new Set([
    "admin",
    "chairperson",
    "secretary",
    "treasurer"
  ]);

const SUPPORT_TYPES =
  new Set([
    "welfare",
    "hospital",
    "bereavement",
    "education",
    "emergency",
    "accident",
    "marriage",
    "new_baby",
    "disaster",
    "other"
  ]);

const SUPPORT_STATUSES =
  new Set([
    "requested",
    "approved",
    "paid",
    "completed",
    "rejected",
    "cancelled"
  ]);


/* =========================================================
   HELPERS
========================================================= */

function todayString() {

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
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    )
  ].join("-");

}


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
    Number(
      value || 0
    )
  );

}


function formatDate(value) {

  if (!value) {
    return "—";
  }

  const date =
    new Date(
      value
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(
      value
    );
  }

  return date.toLocaleDateString(
    "en-KE",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
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


function normalize(value) {

  return String(
    value || ""
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

  statusEl.classList.toggle(
    "support-hidden",
    !message
  );

}


function clearError() {

  if (!errorEl) {
    return;
  }

  errorEl.textContent =
    "";

  errorEl.classList.add(
    "support-hidden"
  );

}


function showError(error) {

  console.error(
    "CHAMA LIVE Support & Welfare:",
    error
  );

  if (!errorEl) {
    return;
  }

  let message =
    error?.message ||
    String(error) ||
    "Unable to process the welfare request.";

  const normalized =
    message.toLowerCase();

  if (
    normalized.includes(
      "row-level security"
    ) ||
    normalized.includes(
      "permission denied"
    )
  ) {

    message =
      "You do not have permission to perform this welfare action.";

  }

  errorEl.textContent =
    message;

  errorEl.classList.remove(
    "support-hidden"
  );

}


function supportTypeLabel(
  value
) {

  const labels = {

    welfare:
      "Welfare",

    hospital:
      "Hospital",

    bereavement:
      "Bereavement",

    education:
      "Education",

    emergency:
      "Emergency",

    accident:
      "Accident",

    marriage:
      "Marriage",

    new_baby:
      "New baby",

    disaster:
      "Disaster",

    other:
      "Other"

  };

  return (
    labels[
      normalize(value)
    ] ||
    String(
      value || "Other"
    )
  );

}


function statusLabel(
  value
) {

  return String(
    value || ""
  )
    .replaceAll(
      "_",
      " "
    );

}


/* =========================================================
   CURRENT GROUP
========================================================= */

async function loadCurrentGroup() {

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
      .from(
        "groups"
      )
      .select(`
        id,
        name
      `)
      .eq(
        "id",
        groupId
      )
      .single();

  if (error) {
    throw error;
  }

  if (!data) {

    throw new Error(
      "Current group could not be found."
    );

  }

  if (groupNameEl) {

    groupNameEl.textContent =
      data.name ||
      "CHAMA";

  }

}


/* =========================================================
   MEMBERS
========================================================= */

async function loadMembers() {

  const {
    data,
    error
  } =
    await supabase
      .from(
        "members"
      )
      .select(`
        id,
        name,
        member_number,
        status
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "name",
        {
          ascending: true
        }
      );

  if (error) {
    throw error;
  }

  members =
    (data || [])
      .filter(
        member =>
          normalize(
            member.status
          ) ===
          "active"
      );

  renderMemberOptions();

}


function renderMemberOptions() {

  if (!memberSelect) {
    return;
  }

  memberSelect.innerHTML =
    `
      <option value="">
        Select member
      </option>
    `;

  members.forEach(
    member => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        member.id;

      option.textContent =
        member.member_number
          ? `${member.name} (${member.member_number})`
          : member.name;

      memberSelect.appendChild(
        option
      );

    }
  );

}


/* =========================================================
   APPROVED EXPENSES
   ---------------------------------------------------------
   This is read-only from this module.

   The existing Expenses workflow owns expense creation,
   approval and financial controls.
========================================================= */

async function loadExpenses() {

  const {
    data,
    error
  } =
    await supabase
      .from(
        "expenses"
      )
      .select(`
        id,
        description,
        amount,
        date,
        approval_status
      `)
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "approval_status",
        "approved"
      )
      .order(
        "date",
        {
          ascending: false
        }
      )
      .limit(
        100
      );

  if (error) {
    throw error;
  }

  expenses =
    data || [];

}


/* =========================================================
   SUPPORT CASES
========================================================= */

async function loadSupportCases() {

  const {
    data,
    error
  } =
    await supabase
      .from(
        "group_support_cases"
      )
      .select(`
        id,
        group_id,
        member_id,
        support_type,
        support_date,
        amount,
        description,
        status,
        approved_by,
        created_by,
        expense_id,
        created_at,
        updated_at
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "support_date",
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

  supportCases =
    data || [];

  renderSummary();

  renderSupportCases();

}


/* =========================================================
   SUMMARY
========================================================= */

function renderSummary() {

  const total =
    supportCases.length;

  const open =
    supportCases.filter(
      item =>
        item.status ===
          "requested" ||
        item.status ===
          "approved"
    ).length;

  const approved =
    supportCases.filter(
      item =>
        item.status ===
          "approved" ||
        item.status ===
          "paid" ||
        item.status ===
          "completed"
    ).length;

  const totalAmount =
    supportCases.reduce(
      (
        sum,
        item
      ) =>
        sum +
        Number(
          item.amount || 0
        ),
      0
    );

  if (totalCasesEl) {

    totalCasesEl.textContent =
      total;

  }

  if (openCasesEl) {

    openCasesEl.textContent =
      open;

  }

  if (approvedCasesEl) {

    approvedCasesEl.textContent =
      approved;

  }

  if (totalAmountEl) {

    totalAmountEl.textContent =
      money(
        totalAmount
      );

  }

}


/* =========================================================
   LOOKUPS
========================================================= */

function getMember(
  memberId
) {

  return members.find(
    member =>
      member.id ===
      memberId
  );

}


function getExpense(
  expenseId
) {

  return expenses.find(
    expense =>
      expense.id ===
      expenseId
  );

}


/* =========================================================
   FILTER
========================================================= */

function getFilteredCases() {

  const selectedStatus =
    normalize(
      statusFilter?.value
    );

  const search =
    normalize(
      searchInput?.value
    );

  return supportCases.filter(
    item => {

      if (
        selectedStatus &&
        normalize(
          item.status
        ) !==
        selectedStatus
      ) {

        return false;

      }

      if (!search) {
        return true;
      }

      const member =
        getMember(
          item.member_id
        );

      const searchable =
        [
          member?.name,
          member?.member_number,
          item.support_type,
          item.description
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

      return searchable.includes(
        search
      );

    }
  );

}


/* =========================================================
   RENDER CASES
========================================================= */

function renderSupportCases() {

  if (!supportRows) {
    return;
  }

  const rows =
    getFilteredCases();

  if (rows.length === 0) {

    supportRows.innerHTML =
      `
        <tr>

          <td
            colspan="7"
            class="support-empty"
          >
            No welfare cases match the current filter.
          </td>

        </tr>
      `;

    return;

  }

  supportRows.innerHTML =
    rows
      .map(
        item => {

          const member =
            getMember(
              item.member_id
            );

          const expense =
            getExpense(
              item.expense_id
            );

          const safeStatus =
            escapeHtml(
              item.status
            );

          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    item.support_date
                  )
                )}
              </td>


              <td>

                <strong>
                  ${escapeHtml(
                    member?.name ||
                    "Member"
                  )}
                </strong>

                ${
                  member?.member_number
                    ? `
                      <div class="support-secondary">
                        ${escapeHtml(
                          member.member_number
                        )}
                      </div>
                    `
                    : ""
                }

              </td>


              <td>

                ${escapeHtml(
                  supportTypeLabel(
                    item.support_type
                  )
                )}

                ${
                  item.description
                    ? `
                      <div class="support-secondary">
                        ${escapeHtml(
                          item.description
                        )}
                      </div>
                    `
                    : ""
                }

              </td>


              <td class="support-amount">

                ${escapeHtml(
                  money(
                    item.amount
                  )
                )}

              </td>


              <td>

                <span
                  class="
                    support-status-badge
                    support-status-${safeStatus}
                  "
                >
                  ${escapeHtml(
                    statusLabel(
                      item.status
                    )
                  )}
                </span>

              </td>


              <td>

                ${
                  expense
                    ? `
                      <strong>
                        ${escapeHtml(
                          expense.description ||
                          "Approved expense"
                        )}
                      </strong>

                      <div class="support-secondary">
                        ${escapeHtml(
                          money(
                            expense.amount
                          )
                        )}
                        ·
                        ${escapeHtml(
                          formatDate(
                            expense.date
                          )
                        )}
                      </div>
                    `
                    : "—"
                }

              </td>


              <td>

                ${renderActions(
                  item
                )}

              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   ACTION BUTTONS
========================================================= */

function renderActions(
  item
) {

  const buttons =
    [];

  if (
    item.status ===
    "requested"
  ) {

    buttons.push(
      `
        <button
          type="button"
          class="support-action-btn"
          data-support-action="approve"
          data-support-id="${escapeHtml(
            item.id
          )}"
        >
          Approve
        </button>
      `
    );

    buttons.push(
      `
        <button
          type="button"
          class="support-action-btn"
          data-support-action="reject"
          data-support-id="${escapeHtml(
            item.id
          )}"
        >
          Reject
        </button>
      `
    );

    buttons.push(
      `
        <button
          type="button"
          class="support-action-btn"
          data-support-action="cancel"
          data-support-id="${escapeHtml(
            item.id
          )}"
        >
          Cancel
        </button>
      `
    );

  }


  if (
    item.status ===
    "approved"
  ) {

    buttons.push(
      `
        <button
          type="button"
          class="support-action-btn"
          data-support-action="pay"
          data-support-id="${escapeHtml(
            item.id
          )}"
        >
          Mark Paid
        </button>
      `
    );

    buttons.push(
      `
        <button
          type="button"
          class="support-action-btn"
          data-support-action="complete"
          data-support-id="${escapeHtml(
            item.id
          )}"
        >
          Complete
        </button>
      `
    );

  }


  if (
    item.status ===
    "paid"
  ) {

    buttons.push(
      `
        <button
          type="button"
          class="support-action-btn"
          data-support-action="complete"
          data-support-id="${escapeHtml(
            item.id
          )}"
        >
          Complete
        </button>
      `
    );

  }


  if (
    buttons.length ===
    0
  ) {

    return "—";

  }

  return `
    <div class="support-actions">
      ${buttons.join("")}
    </div>
  `;

}


/* =========================================================
   CREATE CASE
========================================================= */

async function createSupportCase(
  event
) {

  event.preventDefault();

  clearError();

  showStatus("");

  try {

    if (!currentMember) {

      throw new Error(
        "Your member account could not be resolved."
      );

    }

    const memberId =
      String(
        memberSelect?.value ||
        ""
      ).trim();

    const supportType =
      normalize(
        supportTypeSelect?.value
      );

    const supportDate =
      String(
        supportDateInput?.value ||
        ""
      ).trim();

    const amount =
      Number(
        amountInput?.value ||
        0
      );

    const description =
      String(
        descriptionInput?.value ||
        ""
      ).trim();


    if (!memberId) {

      throw new Error(
        "Please select the supported member."
      );

    }


    if (
      !SUPPORT_TYPES.has(
        supportType
      )
    ) {

      throw new Error(
        "Please select a valid support type."
      );

    }


    if (!supportDate) {

      throw new Error(
        "Please select the support date."
      );

    }


    if (
      !Number.isFinite(
        amount
      ) ||
      amount < 0
    ) {

      throw new Error(
        "Support amount must be zero or greater."
      );

    }


    if (saveButton) {

      saveButton.disabled =
        true;

      saveButton.textContent =
        "Saving...";

    }

    showStatus(
      "Saving support case..."
    );


    /*
     * IMPORTANT:
     *
     * group_id is derived exclusively from the
     * authenticated member context.
     *
     * created_by is the authenticated member.
     *
     * The database validator and RLS remain authoritative.
     */

    const payload = {

      group_id:
        groupId,

      member_id:
        memberId,

      support_type:
        supportType,

      support_date:
        supportDate,

      amount:
        amount,

      description:
        description ||
        null,

      status:
        "requested",

      created_by:
        currentMember.id

    };


    const {
      data,
      error
    } =
      await supabase
        .from(
          "group_support_cases"
        )
        .insert(
          payload
        )
        .select(`
          id,
          group_id,
          member_id,
          support_type,
          support_date,
          amount,
          description,
          status,
          approved_by,
          created_by,
          expense_id,
          created_at,
          updated_at
        `)
        .single();


    if (error) {
      throw error;
    }


    if (!data) {

      throw new Error(
        "The support case was not created."
      );

    }


    resetForm();

    await loadSupportCases();

    showStatus(
      "✓ Support case recorded successfully."
    );

    window.setTimeout(
      () => showStatus(""),
      1800
    );

  }
  catch (error) {

    showStatus("");

    showError(
      error
    );

  }
  finally {

    if (saveButton) {

      saveButton.disabled =
        false;

      saveButton.textContent =
        "Save Support Case";

    }

  }

}


/* =========================================================
   CHOOSE EXISTING APPROVED EXPENSE
   ---------------------------------------------------------
   No expense is created or modified here.
========================================================= */

async function chooseExpenseForPayment(
  supportCase
) {

  if (
    expenses.length ===
    0
  ) {

    return null;

  }


  const matching =
    expenses.filter(
      expense =>
        Number(
          expense.amount || 0
        ) ===
        Number(
          supportCase.amount || 0
        )
    );


  const candidates =
    matching.length > 0
      ? matching
      : expenses;


  if (
    candidates.length ===
    1
  ) {

    return candidates[0].id;

  }


  const lines =
    candidates
      .slice(
        0,
        20
      )
      .map(
        (
          expense,
          index
        ) =>
          `${index + 1}. ${
            expense.description ||
            "Approved expense"
          } — ${
            money(
              expense.amount
            )
          } — ${
            formatDate(
              expense.date
            )
          }`
      )
      .join(
        "\n"
      );


  const answer =
    window.prompt(
      `Select the approved expense to link to this paid support case.\n\n${lines}\n\nEnter the number:`
    );


  const index =
    Number(
      answer
    ) - 1;


  if (
    !Number.isInteger(
      index
    ) ||
    index < 0 ||
    index >= candidates.length
  ) {

    return null;

  }


  return candidates[
    index
  ].id;

}


/* =========================================================
   UPDATE CASE
========================================================= */

async function updateSupportCase(
  caseId,
  nextStatus
) {

  if (
    !SUPPORT_STATUSES.has(
      nextStatus
    )
  ) {

    throw new Error(
      "Invalid support status."
    );

  }


  const supportCase =
    supportCases.find(
      item =>
        item.id ===
        caseId
    );

  if (!supportCase) {

    throw new Error(
      "The support case could not be found."
    );

  }


  const updates = {

    status:
      nextStatus

  };


  /*
   * Approval identity is recorded only when the
   * authenticated management user performs the
   * approval/payment action.
   */

  if (
    nextStatus ===
    "approved"
  ) {

    updates.approved_by =
      currentMember.id;

  }


  /*
   * The live validator requires an expense for
   * paid support.
   */

  if (
    nextStatus ===
    "paid"
  ) {

    const expenseId =
      await chooseExpenseForPayment(
        supportCase
      );

    if (!expenseId) {

      throw new Error(
        "Paid support requires an existing approved expense."
      );

    }

    updates.approved_by =
      currentMember.id;

    updates.expense_id =
      expenseId;

  }


  const {
    data,
    error
  } =
    await supabase
      .from(
        "group_support_cases"
      )
      .update(
        updates
      )
      .eq(
        "id",
        caseId
      )
      .eq(
        "group_id",
        groupId
      )
      .select(`
        id,
        group_id,
        member_id,
        support_type,
        support_date,
        amount,
        description,
        status,
        approved_by,
        created_by,
        expense_id,
        created_at,
        updated_at
      `)
      .single();


  if (error) {
    throw error;
  }


  if (!data) {

    throw new Error(
      "The support case was not updated."
    );

  }

}


/* =========================================================
   CASE ACTION
========================================================= */

async function handleCaseAction(
  event
) {

  const button =
    event.target.closest(
      "[data-support-action]"
    );

  if (!button) {
    return;
  }


  const action =
    String(
      button.dataset
        .supportAction ||
      ""
    ).trim();


  const caseId =
    String(
      button.dataset
        .supportId ||
      ""
    ).trim();


  const actionMap = {

    approve:
      "approved",

    pay:
      "paid",

    complete:
      "completed",

    reject:
      "rejected",

    cancel:
      "cancelled"

  };


  const nextStatus =
    actionMap[
      action
    ];


  if (
    !nextStatus ||
    !caseId
  ) {

    return;

  }


  const confirmed =
    window.confirm(
      `Change this support case to "${statusLabel(
        nextStatus
      )}"?`
    );


  if (!confirmed) {
    return;
  }


  try {

    clearError();

    showStatus(
      "Updating support case..."
    );

    button.disabled =
      true;


    await updateSupportCase(
      caseId,
      nextStatus
    );


    await loadSupportCases();

    showStatus(
      "✓ Support case updated successfully."
    );

    window.setTimeout(
      () => showStatus(""),
      1800
    );

  }
  catch (error) {

    showStatus("");

    showError(
      error
    );

  }
  finally {

    button.disabled =
      false;

  }

}


/* =========================================================
   RESET FORM
========================================================= */

function resetForm() {

  if (supportForm) {
    supportForm.reset();
  }

  if (supportDateInput) {

    supportDateInput.value =
      todayString();

  }

  if (amountInput) {

    amountInput.value =
      "0";

  }

}


/* =========================================================
   ACCESS
========================================================= */

function enforceManagementAccess() {

  const role =
    normalize(
      currentMember?.role
    );

  const allowed =
    MANAGEMENT_ROLES.has(
      role
    );


  if (allowed) {

    accessDeniedEl?.classList.add(
      "support-hidden"
    );

    supportContentEl?.classList.remove(
      "support-hidden"
    );

  }
  else {

    accessDeniedEl?.classList.remove(
      "support-hidden"
    );

    supportContentEl?.classList.add(
      "support-hidden"
    );

  }


  return allowed;

}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  supportForm?.addEventListener(
    "submit",
    createSupportCase
  );


  resetButton?.addEventListener(
    "click",
    resetForm
  );


  refreshButton?.addEventListener(
    "click",
    async () => {

      try {

        clearError();

        showStatus(
          "Refreshing welfare cases..."
        );

        await loadExpenses();

        await loadSupportCases();

        showStatus(
          "Welfare cases refreshed."
        );

        window.setTimeout(
          () => showStatus(""),
          1200
        );

      }
      catch (error) {

        showStatus("");

        showError(
          error
        );

      }

    }
  );


  statusFilter?.addEventListener(
    "change",
    renderSupportCases
  );


  searchInput?.addEventListener(
    "input",
    renderSupportCases
  );


  supportRows?.addEventListener(
    "click",
    handleCaseAction
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
      "Loading Support & Welfare..."
    );


    /*
     * Canonical authentication.
     */

    currentUser =
      await requireAuth();


    /*
     * Canonical member resolution.
     */

    currentMember =
      await getMyMember();


    if (
      !currentMember?.group_id
    ) {

      throw new Error(
        "Your member account is not linked to a group."
      );

    }


    /*
     * Current group is derived from the authenticated
     * member. It is never supplied by the page.
     */

    groupId =
      currentMember.group_id;


    console.log(
      "CHAMA LIVE: Support & Welfare context",
      {
        userId:
          currentUser?.id,

        memberId:
          currentMember?.id,

        groupId:
          groupId,

        role:
          currentMember?.role
      }
    );


    setupEvents();

    resetForm();


    await loadCurrentGroup();


    if (
      !enforceManagementAccess()
    ) {

      showStatus("");

      return;

    }


    await loadMembers();

    await loadExpenses();

    await loadSupportCases();


    showStatus(
      "Support & Welfare ready."
    );

    window.setTimeout(
      () => showStatus(""),
      1200
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

export const initSupportWelfare =
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
  "CHAMA LIVE: support-welfare.js ready"
);
