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
   Paid welfare requires an existing expense_id.
   This page does NOT create or modify expenses.

   The existing Expenses workflow remains responsible
   for expense creation and approval.
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember
} from "./auth.js";


console.log(
  "CHAMA LIVE: welfare-welfare.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const groupNameEl =
  document.getElementById("groupName");

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const accessDeniedEl =
  document.getElementById("accessDenied");

const welfareContentEl =
  document.getElementById("welfareContent");

const welfareForm =
  document.getElementById("welfareForm");

const memberSelect =
  document.getElementById("memberId");

const welfareTypeSelect =
  document.getElementById("welfareType");

const welfareDateInput =
  document.getElementById("welfareDate");

const amountInput =
  document.getElementById("amount");

const descriptionInput =
  document.getElementById("description");

const saveButton =
  document.getElementById("saveWelfare");

const resetButton =
  document.getElementById("resetWelfare");

const refreshButton =
  document.getElementById("refreshWelfare");

const statusFilter =
  document.getElementById("statusFilter");

const searchInput =
  document.getElementById("caseSearch");

const welfareRows =
  document.getElementById("welfareRows");

const totalCasesEl =
  document.getElementById("totalCases");

const openCasesEl =
  document.getElementById("openCases");

const approvedCasesEl =
  document.getElementById("approvedCases");

const totalAmountEl =
  document.getElementById("totalAmount");


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentMember = null;

let groupId = null;

let members = [];

let expenses = [];

let welfareCases = [];

let initialized = false;


/* =========================================================
   LIVE DATABASE CONTRACT VALUES
   ---------------------------------------------------------
   These values mirror the live CHECK constraints on
   public.group_support_cases.
========================================================= */

const MANAGEMENT_ROLES =
  new Set([
    "admin",
    "administrator",
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


/*
 * The live database currently permits these state
 * transitions through the validator/RLS combination.
 *
 * Keeping the transition map client-side prevents this
 * page from offering arbitrary status changes.
 */
const STATUS_TRANSITIONS = {
  requested: new Set([
    "approved",
    "rejected",
    "cancelled"
  ]),

  approved: new Set([
    "paid",
    "completed"
  ]),

  paid: new Set([
    "completed"
  ]),

  completed: new Set(),

  rejected: new Set(),

  cancelled: new Set()
};


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
    ).padStart(2, "0"),
    String(
      date.getDate()
    ).padStart(2, "0")
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
    return String(value);
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

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function normalize(value) {

  if (value && typeof value === "object") {
    value =
      value.role ??
      value.name ??
      "";
  }

  return String(value || "")
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
    "welfare-hidden",
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
    "welfare-hidden"
  );

}


function showError(error) {

  console.error(
    "CHAMA LIVE Welfare & Welfare:",
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
    "welfare-hidden"
  );

}


function welfareTypeLabel(value) {

  const labels = {

    welfare: "Welfare",

    hospital: "Hospital",

    bereavement: "Bereavement",

    education: "Education",

    emergency: "Emergency",

    accident: "Accident",

    marriage: "Marriage",

    new_baby: "New baby",

    disaster: "Disaster",

    other: "Other"

  };

  return (
    labels[
      normalize(value)
    ] ||
    String(value || "Other")
  );

}


function statusLabel(value) {

  return String(value || "")
    .replaceAll("_", " ");

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
      .from("groups")
      .select(`
        id,
        name
      `)
      .eq("id", groupId)
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
      .from("members")
      .select(`
        id,
        name,
        member_number,
        status
      `)
      .eq("group_id", groupId)
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
          normalize(member.status) ===
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
   READ ONLY FROM THIS MODULE.

   The Expenses workflow remains responsible for:
   - expense creation
   - expense approval
   - financial controls
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
        description,
        amount,
        date,
        approval_status
      `)
      .eq("group_id", groupId)
      .eq("approval_status", "approved")
      .order(
        "date",
        {
          ascending: false
        }
      )
      .limit(100);

  if (error) {
    throw error;
  }

  expenses =
    data || [];

}


/* =========================================================
   SUPPORT CASES
========================================================= */

async function loadWelfareCases() {

  const {
    data,
    error
  } =
    await supabase
      .from("group_support_cases")
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
      .eq("group_id", groupId)
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

  welfareCases =
    data || [];

  renderSummary();

  renderWelfareCases();

}


/* =========================================================
   SUMMARY
========================================================= */

function renderSummary() {

  const total =
    welfareCases.length;

  const open =
    welfareCases.filter(
      item =>
        item.status === "requested" ||
        item.status === "approved"
    ).length;

  const approved =
    welfareCases.filter(
      item =>
        item.status === "approved" ||
        item.status === "paid" ||
        item.status === "completed"
    ).length;

  const totalAmount =
    welfareCases.reduce(
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
      money(totalAmount);

  }

}


/* =========================================================
   LOOKUPS
========================================================= */

function getMember(memberId) {

  return members.find(
    member =>
      member.id === memberId
  );

}


function getExpense(expenseId) {

  return expenses.find(
    expense =>
      expense.id === expenseId
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

  return welfareCases.filter(
    item => {

      if (
        selectedStatus &&
        normalize(item.status) !==
          selectedStatus
      ) {
        return false;
      }

      if (!search) {
        return true;
      }

      const member =
        getMember(item.member_id);

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

function renderWelfareCases() {

  if (!welfareRows) {
    return;
  }

  const rows =
    getFilteredCases();

  if (rows.length === 0) {

    welfareRows.innerHTML =
      `
        <tr>
          <td
            colspan="7"
            class="welfare-empty"
          >
            No welfare cases match the current filter.
          </td>
        </tr>
      `;

    return;

  }

  welfareRows.innerHTML =
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
                      <div class="welfare-secondary">
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
                  welfareTypeLabel(
                    item.support_type
                  )
                )}

                ${
                  item.description
                    ? `
                      <div class="welfare-secondary">
                        ${escapeHtml(
                          item.description
                        )}
                      </div>
                    `
                    : ""
                }

              </td>

              <td class="welfare-amount">

                ${escapeHtml(
                  money(item.amount)
                )}

              </td>

              <td>

                <span
                  class="
                    welfare-status-badge
                    welfare-status-${safeStatus}
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

                      <div class="welfare-secondary">
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

                ${renderActions(item)}

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

function renderActions(item) {

  const buttons = [];

  const currentStatus =
    normalize(item.status);

  if (
    currentStatus ===
    "requested"
  ) {

    buttons.push(
      `
        <button
          type="button"
          class="welfare-action-btn"
          data-welfare-action="approve"
          data-welfare-id="${escapeHtml(
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
          class="welfare-action-btn"
          data-welfare-action="reject"
          data-welfare-id="${escapeHtml(
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
          class="welfare-action-btn"
          data-welfare-action="cancel"
          data-welfare-id="${escapeHtml(
            item.id
          )}"
        >
          Cancel
        </button>
      `
    );

  }


  if (
    currentStatus ===
    "approved"
  ) {

    buttons.push(
      `
        <button
          type="button"
          class="welfare-action-btn"
          data-welfare-action="pay"
          data-welfare-id="${escapeHtml(
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
          class="welfare-action-btn"
          data-welfare-action="complete"
          data-welfare-id="${escapeHtml(
            item.id
          )}"
        >
          Complete
        </button>
      `
    );

  }


  if (
    currentStatus ===
    "paid"
  ) {

    buttons.push(
      `
        <button
          type="button"
          class="welfare-action-btn"
          data-welfare-action="complete"
          data-welfare-id="${escapeHtml(
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
    <div class="welfare-actions">
      ${buttons.join("")}
    </div>
  `;

}


/* =========================================================
   CREATE CASE
========================================================= */

async function createWelfareCase(event) {

  event.preventDefault();

  clearError();

  showStatus("");

  try {

    if (!currentMember) {

      throw new Error(
        "Your member account could not be resolved."
      );

    }

    if (!groupId) {

      throw new Error(
        "Your current group could not be resolved."
      );

    }

    const memberId =
      String(
        memberSelect?.value || ""
      ).trim();

    const welfareType =
      normalize(
        welfareTypeSelect?.value
      );

    const welfareDate =
      String(
        welfareDateInput?.value || ""
      ).trim();

    const amount =
      Number(
        amountInput?.value || 0
      );

    const description =
      String(
        descriptionInput?.value || ""
      ).trim();


    if (!memberId) {

      throw new Error(
        "Please select the welfareed member."
      );

    }


    /*
     * Client-side membership check.
     *
     * This is only an early validation convenience.
     * The database validator remains authoritative.
     */
    const selectedMember =
      members.find(
        member =>
          member.id === memberId
      );

    if (!selectedMember) {

      throw new Error(
        "The selected member is not an active member of the current group."
      );

    }


    if (
      !SUPPORT_TYPES.has(
        welfareType
      )
    ) {

      throw new Error(
        "Please select a valid welfare type."
      );

    }


    if (!welfareDate) {

      throw new Error(
        "Please select the welfare date."
      );

    }


    if (
      !Number.isFinite(amount) ||
      amount < 0
    ) {

      throw new Error(
        "Welfare amount must be zero or greater."
      );

    }


    if (saveButton) {

      saveButton.disabled =
        true;

      saveButton.textContent =
        "Saving...";

    }

    showStatus(
      "Saving welfare case..."
    );


    /*
     * group_id is derived exclusively from the
     * authenticated member context.
     *
     * created_by is the authenticated member.
     *
     * The database validator and RLS remain
     * authoritative.
     */

    const payload = {

      group_id:
        groupId,

      member_id:
        memberId,

      support_type:
        welfareType,

      support_date:
        welfareDate,

      amount:
        amount,

      description:
        description ||
        null,

      /*
       * New cases deliberately begin in the live
       * database's default/requested state.
       */
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
        .from("group_support_cases")
        .insert(payload)
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
        "The welfare case was not created."
      );

    }


    resetForm();

    await loadWelfareCases();

    showStatus(
      "✓ Welfare case recorded successfully."
    );

    window.setTimeout(
      () => showStatus(""),
      1800
    );

  }
  catch (error) {

    showStatus("");

    showError(error);

  }
  finally {

    if (saveButton) {

      saveButton.disabled =
        false;

      saveButton.textContent =
        "Save Welfare Case";

    }

  }

}


/* =========================================================
   CHOOSE EXISTING APPROVED EXPENSE
   ---------------------------------------------------------
   No expense is created or modified here.

   The database remains authoritative for:
   - group ownership
   - existence of the referenced expense
   - paid status requiring expense_id
========================================================= */

async function chooseExpenseForPayment(
  welfareCase
) {

  /*
   * Refresh the approved-expense list immediately before
   * payment selection so the user is not relying entirely
   * on an old page load.
   */
  await loadExpenses();


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
          welfareCase.amount || 0
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
      .slice(0, 20)
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
      .join("\n");


  const answer =
    window.prompt(
      `Select the approved expense to link to this paid welfare case.\n\n${lines}\n\nEnter the number:`
    );


  if (
    answer ===
    null
  ) {

    return null;

  }


  const index =
    Number(answer) - 1;


  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= candidates.length
  ) {

    return null;

  }


  return candidates[index].id;

}


/* =========================================================
   UPDATE CASE
========================================================= */

async function updateWelfareCase(
  caseId,
  nextStatus
) {

  const normalizedNextStatus =
    normalize(nextStatus);


  if (
    !SUPPORT_STATUSES.has(
      normalizedNextStatus
    )
  ) {

    throw new Error(
      "Invalid welfare status."
    );

  }


  const welfareCase =
    welfareCases.find(
      item =>
        item.id === caseId
    );


  if (!welfareCase) {

    throw new Error(
      "The welfare case could not be found."
    );

  }


  const currentStatus =
    normalize(
      welfareCase.status
    );


  const allowedTransitions =
    STATUS_TRANSITIONS[
      currentStatus
    ] ||
    new Set();


  if (
    !allowedTransitions.has(
      normalizedNextStatus
    )
  ) {

    throw new Error(
      `This welfare case cannot be changed from "${statusLabel(
        currentStatus
      )}" to "${statusLabel(
        normalizedNextStatus
      )}".`
    );

  }


  const updates = {

    status:
      normalizedNextStatus

  };


  /*
   * Approval identity is recorded when the case
   * is actually approved.
   *
   * We deliberately do not overwrite approved_by
   * when merely marking an already-approved case
   * as paid or completed.
   */
  if (
    normalizedNextStatus ===
    "approved"
  ) {

    updates.approved_by =
      currentMember.id;

  }


  /*
   * The live validator requires:
   *
   * status = 'paid'
   * AND
   * expense_id IS NOT NULL
   *
   * Therefore payment cannot be attempted without
   * selecting an existing expense.
   */
  if (
    normalizedNextStatus ===
    "paid"
  ) {

    const expenseId =
      await chooseExpenseForPayment(
        welfareCase
      );


    if (!expenseId) {

      throw new Error(
        "Paid welfare requires an existing approved expense."
      );

    }


    /*
     * Verify the selected expense is still present
     * in the current approved-expense set after the
     * refresh performed above.
     */
    const selectedExpense =
      getExpense(expenseId);


    if (!selectedExpense) {

      throw new Error(
        "The selected expense is no longer available as an approved expense."
      );

    }


    /*
     * The expense belongs to the same authenticated
     * group because it was loaded using groupId.
     *
     * The database validator independently checks
     * expense ownership again.
     */
    updates.expense_id =
      expenseId;

  }


  const {
    data,
    error
  } =
    await supabase
      .from("group_support_cases")
      .update(updates)
      .eq("id", caseId)
      .eq("group_id", groupId)
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
      "The welfare case was not updated."
    );

  }


  /*
   * Keep local state synchronized with the row returned
   * by the database.
   */
  const index =
    welfareCases.findIndex(
      item =>
        item.id === caseId
    );

  if (index >= 0) {

    welfareCases[index] =
      data;

  }

}


/* =========================================================
   CASE ACTION
========================================================= */

async function handleCaseAction(event) {

  const button =
    event.target.closest(
      "[data-welfare-action]"
    );

  if (!button) {
    return;
  }


  const action =
    String(
      button.dataset
        .welfareAction ||
      ""
    ).trim();


  const caseId =
    String(
      button.dataset
        .welfareId ||
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
    actionMap[action];


  if (
    !nextStatus ||
    !caseId
  ) {

    return;

  }


  const confirmed =
    window.confirm(
      `Change this welfare case to "${statusLabel(
        nextStatus
      )}"?`
    );


  if (!confirmed) {
    return;
  }


  try {

    clearError();

    showStatus(
      "Updating welfare case..."
    );

    button.disabled =
      true;


    await updateWelfareCase(
      caseId,
      nextStatus
    );


    renderSummary();

    renderWelfareCases();


    showStatus(
      "✓ Welfare case updated successfully."
    );

    window.setTimeout(
      () => showStatus(""),
      1800
    );

  }
  catch (error) {

    showStatus("");

    showError(error);

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

  if (welfareForm) {
    welfareForm.reset();
  }


  if (welfareDateInput) {

    welfareDateInput.value =
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
      "welfare-hidden"
    );

    welfareContentEl?.classList.remove(
      "welfare-hidden"
    );

  }
  else {

    accessDeniedEl?.classList.remove(
      "welfare-hidden"
    );

    welfareContentEl?.classList.add(
      "welfare-hidden"
    );

  }


  return allowed;

}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  welfareForm?.addEventListener(
    "submit",
    createWelfareCase
  );


  resetButton?.addEventListener(
    "click",
    () => {

      clearError();

      showStatus("");

      resetForm();

    }
  );


  refreshButton?.addEventListener(
    "click",
    async () => {

      try {

        clearError();

        showStatus(
          "Refreshing welfare cases..."
        );


        await loadMembers();

        await loadExpenses();

        await loadWelfareCases();


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

        showError(error);

      }

    }
  );


  statusFilter?.addEventListener(
    "change",
    renderWelfareCases
  );


  searchInput?.addEventListener(
    "input",
    renderWelfareCases
  );


  welfareRows?.addEventListener(
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
      "Loading Welfare & Welfare..."
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
     * Current group is derived exclusively from
     * authenticated member context.
     *
     * It is never supplied by the page.
     */
    groupId =
      currentMember.group_id;


    console.log(
      "CHAMA LIVE: Welfare & Welfare context",
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

    await loadWelfareCases();


    showStatus(
      "Welfare & Welfare ready."
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

    showError(error);

  }

}


/* =========================================================
   PUBLIC ALIAS
========================================================= */

export const initWelfareWelfare =
  initPage;


/* =========================================================
   BOOT OWNERSHIP
   ---------------------------------------------------------
   admin-layout.js is the sole page bootloader.
   This module exports initPage/initWelfareWelfare only.
========================================================= */

console.log(
  "CHAMA LIVE: welfare-welfare.js ready"
);
