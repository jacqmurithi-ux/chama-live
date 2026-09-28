/* =========================================================
   CHAMA LIVE — ADMIN FINES
   ---------------------------------------------------------
   Fines v1 MANAGEMENT FEATURE

   RESPONSIBILITIES
   ---------------------------------------------------------
   - Load fines belonging to the authenticated admin's group
   - Load authoritative fine balances
   - Render fine summary
   - Filter/search fines
   - Display fine details
   - Perform authorized fine adjustments
   - Perform authorized fine waivers
   - Allocate recorded member payments to fines

   IMPORTANT
   ---------------------------------------------------------
   All accounting mutations are performed through the
   canonical database RPCs.

   PROHIBITED:
   - Direct INSERT into accounting tables
   - Direct UPDATE of accounting tables
   - Direct DELETE from accounting tables
   - Local reconstruction of authoritative balances
   - Browser-side fine generation
   - Scheduler execution
   - Manual fine creation through a nonexistent RPC
========================================================= */

import { supabase } from "./supabase.js";
import { getLayoutState } from "./admin-layout.js";


/* =========================================================
   STATE
========================================================= */

const state = {
  groupId: null,
  groupName: null,
  fines: [],
  balances: new Map(),
  selectedFineId: null
};


const actionState = {
  type: null,
  fineId: null,
  pending: false
};


const paymentState = {
  memberId: null,
  payments: [],
  loading: false
};


/* =========================================================
   ELEMENTS
========================================================= */

const elements = {};


/* =========================================================
   HELPERS
========================================================= */

function cacheElements() {

  elements.status =
    document.getElementById("status");

  elements.error =
    document.getElementById("error");

  elements.totalFines =
    document.getElementById("totalFines");

  elements.totalOriginal =
    document.getElementById("totalOriginal");

  elements.totalPaid =
    document.getElementById("totalPaid");

  elements.totalOutstanding =
    document.getElementById("totalOutstanding");

  elements.fineSearch =
    document.getElementById("fineSearch");

  elements.monthFilter =
    document.getElementById("monthFilter");

  elements.statusFilter =
    document.getElementById("statusFilter");

  elements.clearFilters =
    document.getElementById("clearFilters");

  elements.refreshFines =
    document.getElementById("refreshFines");

  elements.resultCount =
    document.getElementById("resultCount");

  elements.finesBody =
    document.getElementById("finesBody");

  elements.fineDetail =
    document.getElementById("fineDetail");

  elements.detailGrid =
    document.getElementById("detailGrid");

  elements.detailBalance =
    document.getElementById("detailBalance");

  elements.closeDetail =
    document.getElementById("closeDetail");

  elements.fineActions =
    document.getElementById("fineActions");

  elements.adjustFine =
    document.getElementById("adjustFine");

  elements.waiveFine =
    document.getElementById("waiveFine");

  elements.allocateFinePayment =
    document.getElementById(
      "allocateFinePayment"
    );

  elements.fineActionModal =
    document.getElementById(
      "fineActionModal"
    );

  elements.fineActionTitle =
    document.getElementById(
      "fineActionTitle"
    );

  elements.closeFineAction =
    document.getElementById(
      "closeFineAction"
    );

  elements.fineActionForm =
    document.getElementById(
      "fineActionForm"
    );

  elements.fineActionFields =
    document.getElementById(
      "fineActionFields"
    );

  elements.fineActionError =
    document.getElementById(
      "fineActionError"
    );

  elements.submitFineAction =
    document.getElementById(
      "submitFineAction"
    );

}


/* =========================================================
   FORMATTING
========================================================= */

function money(value) {

  const amount =
    Number(value);

  if (!Number.isFinite(amount)) {
    return "KSh 0";
  }

  return (
    "KSh " +
    amount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }
    )
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


function formatDateTime(value) {

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

  return date.toLocaleString(
    "en-KE",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  );

}


function titleCase(value) {

  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, char =>
      char.toUpperCase()
    );

}


function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


function normalizeError(error) {

  if (!error) {
    return "Something went wrong.";
  }

  return (
    error.message ||
    error.error_description ||
    error.details ||
    "Something went wrong."
  );

}


function parsePositiveAmount(value) {

  const amount =
    Number(value);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  return amount;

}


/* =========================================================
   MESSAGES
========================================================= */

function clearMessages() {

  if (elements.status) {
    elements.status.textContent = "";
  }

  if (elements.error) {
    elements.error.textContent = "";
  }

}


function showStatus(message) {

  if (!elements.status) {
    return;
  }

  elements.status.textContent =
    message;

}


function showError(message) {

  if (!elements.error) {
    return;
  }

  elements.error.textContent =
    message;

}


/* =========================================================
   CONTEXT
========================================================= */

function loadContext() {

  const context =
    getLayoutState();

  if (
    !context?.user ||
    !context?.member?.group_id
  ) {
    throw new Error(
      "Your account is not linked to a group."
    );
  }

  state.groupId =
    context.member.group_id;

  state.groupName =
    context.group?.name ||
    context.member.group_name ||
    "CHAMA";

  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(
      element => {
        element.textContent =
          state.groupName;
      }
    );

}


/* =========================================================
   LOAD FINES
========================================================= */

async function loadFines() {

  if (!state.groupId) {
    throw new Error(
      "Group context is unavailable."
    );
  }

  if (elements.finesBody) {

    elements.finesBody.innerHTML = `
      <tr>
        <td
          colspan="10"
          class="empty-state"
        >
          Loading fines…
        </td>
      </tr>
    `;

  }


  /*
   * READ ONLY.
   *
   * The query uses the existing fines foreign keys:
   *
   * fines.member_id → members.id
   * fines.rule_id   → fine_rules.id
   *
   * RLS remains the database authorization boundary.
   */

  const {
    data,
    error
  } = await supabase
    .from("fines")
    .select(`
      id,
      group_id,
      member_id,
      rule_id,
      trigger_type,
      trigger_id,
      accounting_month,
      original_amount,
      calculation_method,
      calculation_base,
      percentage_rate,
      fixed_amount,
      minimum_amount,
      maximum_amount,
      calculated_amount,
      resolved_closing_at,
      triggered_at,
      created_at,
      members (
        id,
        name
      ),
      fine_rules (
        id,
        name
      )
    `)
    .eq(
      "group_id",
      state.groupId
    )
    .order(
      "triggered_at",
      {
        ascending: false
      }
    );


  if (error) {
    throw error;
  }


  state.fines =
    Array.isArray(data)
      ? data
      : [];


  await loadBalances();

  populateMonthFilter();

  renderSummary();

  renderFines();


  if (
    state.selectedFineId
  ) {

    const stillExists =
      state.fines.some(
        fine =>
          String(fine.id) ===
          String(state.selectedFineId)
      );

    if (stillExists) {

      showFineDetail(
        state.selectedFineId
      );

    }

  }

}


/* =========================================================
   AUTHORITATIVE BALANCES
========================================================= */

async function loadBalances() {

  state.balances.clear();


  if (!state.fines.length) {
    return;
  }


  /*
   * cl_fine_balance() is the authoritative accounting
   * source for:
   *
   * adjustments
   * waivers
   * allocated/paid
   * outstanding
   * status
   *
   * No equivalent balance is reconstructed locally.
   */

  const results =
    await Promise.all(
      state.fines.map(
        async fine => {

          const {
            data,
            error
          } = await supabase.rpc(
            "cl_fine_balance",
            {
              p_fine_id: fine.id
            }
          );


          if (error) {
            throw error;
          }


          const balance =
            Array.isArray(data)
              ? data[0]
              : data;


          if (!balance) {
            throw new Error(
              `No accounting balance was returned for fine ${fine.id}.`
            );
          }


          return [
            fine.id,
            balance
          ];

        }
      )
    );


  for (
    const [
      fineId,
      balance
    ]
    of results
  ) {

    state.balances.set(
      fineId,
      balance
    );

  }

}


/* =========================================================
   MONTH FILTER
========================================================= */

function populateMonthFilter() {

  if (!elements.monthFilter) {
    return;
  }

  const currentValue =
    elements.monthFilter.value;

  const months =
    Array.from(
      new Set(
        state.fines
          .map(
            fine =>
              fine.accounting_month
          )
          .filter(Boolean)
      )
    )
    .sort()
    .reverse();


  elements.monthFilter.innerHTML =
    `
      <option value="">
        All months
      </option>
    ` +
    months
      .map(
        month => `
          <option value="${escapeHtml(month)}">
            ${escapeHtml(month)}
          </option>
        `
      )
      .join("");


  if (
    months.includes(
      currentValue
    )
  ) {

    elements.monthFilter.value =
      currentValue;

  }

}


/* =========================================================
   SUMMARY
========================================================= */

function renderSummary() {

  const fines =
    state.fines;

  let totalOriginal = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;


  for (
    const fine
    of fines
  ) {

    const balance =
      state.balances.get(
        fine.id
      );

    totalOriginal +=
      Number(
        balance?.original_amount ??
        fine.original_amount ??
        0
      );

    totalPaid +=
      Number(
        balance?.allocated_amount ??
        0
      );

    totalOutstanding +=
      Number(
        balance?.outstanding_amount ??
        0
      );

  }


  elements.totalFines.textContent =
    String(fines.length);

  elements.totalOriginal.textContent =
    money(totalOriginal);

  elements.totalPaid.textContent =
    money(totalPaid);

  elements.totalOutstanding.textContent =
    money(totalOutstanding);

}


/* =========================================================
   FILTERING
========================================================= */

function getFilteredFines() {

  const search =
    String(
      elements.fineSearch?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  const month =
    String(
      elements.monthFilter?.value ||
      ""
    )
      .trim();

  const status =
    String(
      elements.statusFilter?.value ||
      ""
    )
      .trim()
      .toUpperCase();


  return state.fines.filter(
    fine => {

      const balance =
        state.balances.get(
          fine.id
        );

      const memberName =
        fine.members?.name ||
        "";

      const ruleName =
        fine.fine_rules?.name ||
        "";

      const searchable = [
        memberName,
        ruleName,
        fine.trigger_type,
        fine.accounting_month,
        fine.calculation_method
      ]
        .map(
          value =>
            String(
              value || ""
            ).toLowerCase()
        )
        .join(" ");


      const matchesSearch =
        !search ||
        searchable.includes(
          search
        );


      const matchesMonth =
        !month ||
        fine.accounting_month ===
          month;


      const matchesStatus =
        !status ||
        String(
          balance?.status || ""
        ).toUpperCase() ===
          status;


      return (
        matchesSearch &&
        matchesMonth &&
        matchesStatus
      );

    }
  );

}


/* =========================================================
   STATUS BADGE
========================================================= */

function statusBadge(status) {

  const normalized =
    String(
      status || "OUTSTANDING"
    )
      .trim()
      .toUpperCase();


  let className =
    "badge-outstanding";


  if (
    normalized === "PAID"
  ) {
    className =
      "badge-paid";
  }

  else if (
    normalized === "PARTIALLY_PAID"
  ) {
    className =
      "badge-partial";
  }

  else if (
    normalized === "WAIVED"
  ) {
    className =
      "badge-waived";
  }


  return `
    <span
      class="badge ${className}"
    >
      ${escapeHtml(
        titleCase(normalized)
      )}
    </span>
  `;

}


/* =========================================================
   RENDER FINE REGISTER
========================================================= */

function renderFines() {

  const fines =
    getFilteredFines();


  elements.resultCount.textContent =
    `${fines.length} ${
      fines.length === 1
        ? "fine"
        : "fines"
    }`;


  if (!fines.length) {

    elements.finesBody.innerHTML = `
      <tr>
        <td
          colspan="10"
          class="empty-state"
        >
          <strong>
            ${
              state.fines.length
                ? "No matching fines"
                : "No fines recorded"
            }
          </strong>

          ${
            state.fines.length
              ? "Try changing your filters."
              : "There are currently no fines available for this group."
          }
        </td>
      </tr>
    `;

    return;

  }


  elements.finesBody.innerHTML =
    fines
      .map(
        fine => {

          const balance =
            state.balances.get(
              fine.id
            );


          const memberName =
            fine.members?.name ||
            "Unknown member";


          const ruleName =
            fine.fine_rules?.name ||
            "Fine rule";


          const adjusted =
            Number(
              balance?.adjustments_increase ||
              0
            ) -
            Number(
              balance?.adjustments_decrease ||
              0
            );


          const status =
            balance?.status ||
            "OUTSTANDING";


          return `
            <tr>

              <td>
                <div class="member-name">
                  ${escapeHtml(memberName)}
                </div>
              </td>


              <td>

                <div class="fine-name">
                  ${escapeHtml(ruleName)}
                </div>

                <div class="fine-meta">
                  ${escapeHtml(
                    titleCase(
                      fine.trigger_type
                    )
                  )}
                </div>

              </td>


              <td>
                ${escapeHtml(
                  fine.accounting_month ||
                  "—"
                )}
              </td>


              <td class="money">
                ${money(
                  balance?.original_amount ??
                  fine.original_amount
                )}
              </td>


              <td class="money">
                ${money(adjusted)}
              </td>


              <td class="money">
                ${money(
                  balance?.waived_amount
                )}
              </td>


              <td class="money">
                ${money(
                  balance?.allocated_amount
                )}
              </td>


              <td class="money">
                ${money(
                  balance?.outstanding_amount
                )}
              </td>


              <td>
                ${statusBadge(status)}
              </td>


              <td>

                <div class="row-actions">

                  <button
                    type="button"
                    class="btn"
                    data-action="view"
                    data-id="${escapeHtml(fine.id)}"
                  >
                    View
                  </button>

                </div>

              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   DETAIL VIEW
========================================================= */

function showFineDetail(
  fineId
) {

  const fine =
    state.fines.find(
      item =>
        String(item.id) ===
        String(fineId)
    );


  if (!fine) {
    showError(
      "The selected fine could not be found."
    );

    return;
  }


  const balance =
    state.balances.get(
      fine.id
    );


  if (!balance) {
    showError(
      "The authoritative fine balance could not be loaded."
    );

    return;
  }


  const memberName =
    fine.members?.name ||
    "Unknown member";


  const ruleName =
    fine.fine_rules?.name ||
    "Fine rule";


  const adjusted =
    Number(
      balance.adjustments_increase ||
      0
    ) -
    Number(
      balance.adjustments_decrease ||
      0
    );


  elements.detailGrid.innerHTML = `

    <div class="detail-item">
      <div class="detail-label">
        Member
      </div>

      <div class="detail-value">
        ${escapeHtml(memberName)}
      </div>
    </div>


    <div class="detail-item">
      <div class="detail-label">
        Fine Rule
      </div>

      <div class="detail-value">
        ${escapeHtml(ruleName)}
      </div>
    </div>


    <div class="detail-item">
      <div class="detail-label">
        Trigger Type
      </div>

      <div class="detail-value">
        ${escapeHtml(
          titleCase(
            fine.trigger_type
          )
        )}
      </div>
    </div>


    <div class="detail-item">
      <div class="detail-label">
        Accounting Month
      </div>

      <div class="detail-value">
        ${escapeHtml(
          fine.accounting_month
        )}
      </div>
    </div>


    <div class="detail-item">
      <div class="detail-label">
        Triggered
      </div>

      <div class="detail-value">
        ${escapeHtml(
          formatDateTime(
            fine.triggered_at
          )
        )}
      </div>
    </div>


    <div class="detail-item">
      <div class="detail-label">
        Created
      </div>

      <div class="detail-value">
        ${escapeHtml(
          formatDateTime(
            fine.created_at
          )
        )}
      </div>
    </div>


    <div class="detail-item">
      <div class="detail-label">
        Calculation Method
      </div>

      <div class="detail-value">
        ${escapeHtml(
          titleCase(
            fine.calculation_method
          )
        )}
      </div>
    </div>


    <div class="detail-item">
      <div class="detail-label">
        Calculation Base
      </div>

      <div class="detail-value">
        ${money(
          fine.calculation_base
        )}
      </div>
    </div>


    <div class="detail-item">
      <div class="detail-label">
        Calculated Amount
      </div>

      <div class="detail-value">
        ${money(
          fine.calculated_amount
        )}
      </div>
    </div>


    <div class="detail-item">
      <div class="detail-label">
        Trigger ID
      </div>

      <div class="detail-value">
        ${escapeHtml(
          fine.trigger_id ||
          "—"
        )}
      </div>
    </div>


    <div class="detail-item">
      <div class="detail-label">
        Resolved Closing
      </div>

      <div class="detail-value">
        ${escapeHtml(
          formatDateTime(
            fine.resolved_closing_at
          )
        )}
      </div>
    </div>


    <div class="detail-item">
      <div class="detail-label">
        Status
      </div>

      <div class="detail-value">
        ${statusBadge(
          balance.status
        )}
      </div>
    </div>

  `;


  elements.detailBalance.innerHTML = `

    <div class="balance-item">
      <div class="balance-label">
        Original
      </div>

      <div class="balance-value">
        ${money(
          balance.original_amount
        )}
      </div>
    </div>


    <div class="balance-item">
      <div class="balance-label">
        Adjustments
      </div>

      <div class="balance-value">
        ${money(adjusted)}
      </div>
    </div>


    <div class="balance-item">
      <div class="balance-label">
        Waived
      </div>

      <div class="balance-value">
        ${money(
          balance.waived_amount
        )}
      </div>
    </div>


    <div class="balance-item">
      <div class="balance-label">
        Paid
      </div>

      <div class="balance-value">
        ${money(
          balance.allocated_amount
        )}
      </div>
    </div>


    <div class="balance-item">
      <div class="balance-label">
        Outstanding
      </div>

      <div class="balance-value">
        ${money(
          balance.outstanding_amount
        )}
      </div>
    </div>

  `;


  elements.fineDetail.classList.add(
    "open"
  );


  state.selectedFineId =
    fine.id;


  updateActionAvailability(
    fine,
    balance
  );


  elements.fineDetail.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}


/* =========================================================
   ACTION AVAILABILITY
========================================================= */

function updateActionAvailability(
  fine,
  balance
) {

  const hasFine =
    Boolean(fine);

  const hasBalance =
    Boolean(balance);


  if (elements.adjustFine) {
    elements.adjustFine.disabled =
      !hasFine ||
      !hasBalance ||
      actionState.pending;
  }

  if (elements.waiveFine) {
    elements.waiveFine.disabled =
      !hasFine ||
      !hasBalance ||
      actionState.pending;
  }

  if (elements.allocateFinePayment) {
    elements.allocateFinePayment.disabled =
      !hasFine ||
      !hasBalance ||
      actionState.pending;
  }

}


/* =========================================================
   CLOSE DETAIL
========================================================= */

function closeFineDetail() {

  elements.fineDetail.classList.remove(
    "open"
  );

  state.selectedFineId =
    null;

  actionState.type =
    null;

  actionState.fineId =
    null;

}


/* =========================================================
   CANONICAL ACCOUNTING RPC WRAPPERS
========================================================= */

async function adjustFine(
  fineId,
  amount,
  direction,
  reason
) {

  const {
    data,
    error
  } = await supabase.rpc(
    "cl_fine_adjust",
    {
      p_fine_id: fineId,
      p_amount: amount,
      p_direction: direction,
      p_reason: reason
    }
  );


  if (error) {
    throw error;
  }


  return data;

}


async function waiveFine(
  fineId,
  amount,
  reason
) {

  const {
    data,
    error
  } = await supabase.rpc(
    "cl_fine_waive",
    {
      p_fine_id: fineId,
      p_amount: amount,
      p_reason: reason
    }
  );


  if (error) {
    throw error;
  }


  return data;

}


async function allocateFinePayment(
  fineId,
  paymentId,
  amount,
  source
) {

  const {
    data,
    error
  } = await supabase.rpc(
    "cl_fine_allocate_payment",
    {
      p_fine_id: fineId,
      p_payment_id: paymentId,
      p_amount: amount,
      p_source: source
    }
  );


  if (error) {
    throw error;
  }


  return data;

}


/* =========================================================
   PAYMENT LOADING
========================================================= */

async function loadFinePayments(
  fine
) {

  if (!state.groupId) {
    throw new Error(
      "Group context is unavailable."
    );
  }


  if (!fine?.member_id) {
    throw new Error(
      "The selected fine has no member."
    );
  }


  paymentState.memberId =
    fine.member_id;

  paymentState.payments =
    [];

  paymentState.loading =
    true;


  try {

    const {
      data,
      error
    } = await supabase
      .from("contributions")
      .select(`
        id,
        member_id,
        amount,
        contribution_type,
        month,
        payment_method,
        reference,
        mpesa_reference,
        contribution_date,
        created_at
      `)
      .eq(
        "group_id",
        state.groupId
      )
      .eq(
        "member_id",
        fine.member_id
      )
      .order(
        "contribution_date",
        {
          ascending: false,
          nullsFirst: false
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


    paymentState.payments =
      Array.isArray(data)
        ? data
        : [];


  }

  finally {

    paymentState.loading =
      false;

  }

}


/* =========================================================
   PAYMENT OPTION FORMATTING
========================================================= */

function formatFinePaymentOption(
  payment
) {

  const date =
    payment.contribution_date
      ? formatDate(
          payment.contribution_date
        )
      : formatDate(
          payment.created_at
        );


  const amount =
    money(payment.amount);


  const method =
    titleCase(
      payment.payment_method ||
      "Payment"
    );


  const reference =
    payment.mpesa_reference ||
    payment.reference ||
    "";


  const referenceText =
    reference
      ? ` • ${reference}`
      : "";


  const month =
    payment.month
      ? ` • ${payment.month}`
      : "";


  return (
    `${date} • ${amount} • ` +
    `${method}${month}${referenceText}`
  );

}


function renderFinePaymentOptions() {

  const select =
    document.getElementById(
      "finePaymentId"
    );


  if (!select) {
    return;
  }


  select.innerHTML = "";


  const placeholder =
    document.createElement(
      "option"
    );

  placeholder.value =
    "";

  placeholder.textContent =
    "Select a payment";

  placeholder.disabled =
    false;

  placeholder.selected =
    true;

  select.appendChild(
    placeholder
  );


  for (
    const payment
    of paymentState.payments
  ) {

    const option =
      document.createElement(
        "option"
      );

    option.value =
      payment.id;

    option.textContent =
      formatFinePaymentOption(
        payment
      );

    select.appendChild(
      option
    );

  }

}


/* =========================================================
   ACTION MODAL
========================================================= */

function clearActionError() {

  if (
    elements.fineActionError
  ) {
    elements.fineActionError.textContent =
      "";
  }

}


function showActionError(
  message
) {

  if (
    elements.fineActionError
  ) {
    elements.fineActionError.textContent =
      message;
  }

}


function closeFineActionModal() {

  if (
    !elements.fineActionModal
  ) {
    return;
  }


  elements.fineActionModal.hidden =
    true;

  elements.fineActionModal
    .setAttribute(
      "aria-hidden",
      "true"
    );


  actionState.type =
    null;

  actionState.fineId =
    null;

  clearActionError();


  if (
    elements.fineActionFields
  ) {
    elements.fineActionFields.innerHTML =
      "";
  }


  if (
    elements.submitFineAction
  ) {
    elements.submitFineAction.disabled =
      false;
  }

}


async function openFineActionModal(
  type,
  fineId
) {

  const fine =
    state.fines.find(
      item =>
        String(item.id) ===
        String(fineId)
    );


  if (!fine) {

    showError(
      "The selected fine could not be found."
    );

    return;

  }


  const balance =
    state.balances.get(
      fine.id
    );


  if (!balance) {

    showError(
      "The authoritative fine balance could not be loaded."
    );

    return;

  }


  if (
    ![
      "adjust",
      "waive",
      "allocate"
    ].includes(type)
  ) {

    showError(
      "Unsupported fine action."
    );

    return;

  }


  actionState.type =
    type;

  actionState.fineId =
    fine.id;

  clearActionError();


  if (
    type === "adjust"
  ) {

    elements.fineActionTitle.textContent =
      "Adjust Fine";

    elements.fineActionFields.innerHTML = `

      <div class="action-field">

        <label for="fineAdjustmentDirection">
          Direction
        </label>

        <select
          id="fineAdjustmentDirection"
          name="direction"
          required
        >

          <option value="INCREASE">
            Increase
          </option>

          <option value="DECREASE">
            Decrease
          </option>

        </select>

      </div>


      <div class="action-field">

        <label for="fineAdjustmentAmount">
          Amount
        </label>

        <input
          type="number"
          id="fineAdjustmentAmount"
          name="amount"
          min="0.01"
          step="0.01"
          inputmode="decimal"
          required
        >

      </div>


      <div class="action-field">

        <label for="fineAdjustmentReason">
          Reason
        </label>

        <textarea
          id="fineAdjustmentReason"
          name="reason"
          required
        ></textarea>

      </div>

    `;

  }


  if (
    type === "waive"
  ) {

    elements.fineActionTitle.textContent =
      "Waive Fine";

    elements.fineActionFields.innerHTML = `

      <div class="action-field">

        <label for="fineWaiverAmount">
          Amount
        </label>

        <input
          type="number"
          id="fineWaiverAmount"
          name="amount"
          min="0.01"
          step="0.01"
          inputmode="decimal"
          required
        >

        <small class="action-field-note">
          The database will determine whether this
          waiver is valid against the authoritative fine balance.
        </small>

      </div>


      <div class="action-field">

        <label for="fineWaiverReason">
          Reason
        </label>

        <textarea
          id="fineWaiverReason"
          name="reason"
          required
        ></textarea>

      </div>

    `;

  }


  if (
    type === "allocate"
  ) {

    elements.fineActionTitle.textContent =
      "Allocate Payment";

    elements.fineActionFields.innerHTML = `

      <div class="action-field">

        <label for="finePaymentId">
          Payment
        </label>

        <select
          id="finePaymentId"
          name="paymentId"
          required
        >
          <option value="">
            Loading payments…
          </option>
        </select>

        <small class="action-field-note">
          Only payments recorded for this member are shown.
          The database remains authoritative for payment ownership,
          available allocation, and accounting validity.
        </small>

      </div>


      <div class="action-field">

        <label for="finePaymentAmount">
          Amount
        </label>

        <input
          type="number"
          id="finePaymentAmount"
          name="amount"
          min="0.01"
          step="0.01"
          inputmode="decimal"
          required
        >

      </div>


      <div class="action-field">

        <label for="finePaymentSource">
          Source
        </label>

        <select
          id="finePaymentSource"
          name="source"
          required
        >

          <option value="MANUAL">
            Manual
          </option>

          <option value="SYSTEM">
            System
          </option>

        </select>

      </div>

    `;


    try {

      await loadFinePayments(
        fine
      );

      renderFinePaymentOptions();


      const select =
        document.getElementById(
          "finePaymentId"
        );


      if (
        !paymentState.payments.length
      ) {

        showActionError(
          "No recorded payments were found for this member."
        );

      }

      if (select) {
        select.focus();
      }

    }

    catch (error) {

      console.error(
        "CHAMA LIVE: Fine payment load failed:",
        error
      );

      showActionError(
        normalizeError(error)
      );

    }

  }


  elements.fineActionModal.hidden =
    false;

  elements.fineActionModal
    .setAttribute(
      "aria-hidden",
      "false"
    );


  if (
    type !== "allocate"
  ) {

    const firstInput =
      elements.fineActionFields
        ?.querySelector(
          "input, select, textarea"
        );

    firstInput?.focus();

  }

}


/* =========================================================
   ACTION SUBMISSION
========================================================= */

async function submitFineAction(
  event
) {

  event.preventDefault();


  if (
    actionState.pending
  ) {
    return;
  }


  const type =
    actionState.type;

  const fineId =
    actionState.fineId;


  if (
    !type ||
    !fineId
  ) {

    showActionError(
      "No fine action is selected."
    );

    return;

  }


  const fine =
    state.fines.find(
      item =>
        String(item.id) ===
        String(fineId)
    );


  if (!fine) {

    showActionError(
      "The selected fine could not be found."
    );

    return;

  }


  const formData =
    new FormData(
      elements.fineActionForm
    );


  const amount =
    parsePositiveAmount(
      formData.get("amount")
    );


  if (
    amount === null
  ) {

    showActionError(
      "Enter an amount greater than zero."
    );

    return;

  }


  actionState.pending =
    true;


  clearActionError();


  if (
    elements.submitFineAction
  ) {

    elements.submitFineAction.disabled =
      true;

    elements.submitFineAction.textContent =
      "Submitting…";

  }


  updateActionAvailability(
    fine,
    state.balances.get(
      fine.id
    )
  );


  try {

    if (
      type === "adjust"
    ) {

      const direction =
        String(
          formData.get(
            "direction"
          ) ||
          ""
        )
          .trim()
          .toUpperCase();


      const reason =
        String(
          formData.get(
            "reason"
          ) ||
          ""
        ).trim();


      if (
        ![
          "INCREASE",
          "DECREASE"
        ].includes(direction)
      ) {

        throw new Error(
          "Select a valid adjustment direction."
        );

      }


      if (!reason) {

        throw new Error(
          "A reason is required for an adjustment."
        );

      }


      await adjustFine(
        fine.id,
        amount,
        direction,
        reason
      );

    }


    else if (
      type === "waive"
    ) {

      const reason =
        String(
          formData.get(
            "reason"
          ) ||
          ""
        ).trim();


      if (!reason) {

        throw new Error(
          "A reason is required for a waiver."
        );

      }


      await waiveFine(
        fine.id,
        amount,
        reason
      );

    }


    else if (
      type === "allocate"
    ) {

      const paymentId =
        String(
          formData.get(
            "paymentId"
          ) ||
          ""
        ).trim();


      const source =
        String(
          formData.get(
            "source"
          ) ||
          ""
        )
          .trim()
          .toUpperCase();


      if (!paymentId) {

        throw new Error(
          "Select a payment."
        );

      }


      if (
        ![
          "MANUAL",
          "SYSTEM"
        ].includes(source)
      ) {

        throw new Error(
          "Select a valid payment source."
        );

      }


      await allocateFinePayment(
        fine.id,
        paymentId,
        amount,
        source
      );

    }


    else {

      throw new Error(
        "Unsupported fine action."
      );

    }


    /*
     * No optimistic accounting update.
     *
     * The modal closes only after the canonical RPC
     * succeeds. loadFines() then reloads the fine and
     * authoritative cl_fine_balance() result.
     */

    closeFineActionModal();

    await loadFines();

    showStatus(
      "Fine accounting action completed and authoritative balances were refreshed."
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: Fine action failed:",
      error
    );


    /*
     * Never display a local success state after failure.
     *
     * Reload the authoritative state in case the backend
     * transaction committed before a transport-level error.
     */

    try {

      await loadFines();

    }

    catch (reloadError) {

      console.error(
        "CHAMA LIVE: Authoritative fine reload failed:",
        reloadError
      );

    }


    showActionError(
      normalizeError(error)
    );

  }

  finally {

    actionState.pending =
      false;


    if (
      elements.submitFineAction
    ) {

      elements.submitFineAction.disabled =
        false;

      elements.submitFineAction.textContent =
        "Submit";

    }


    const currentFine =
      state.fines.find(
        item =>
          String(item.id) ===
          String(actionState.fineId)
      );


    const currentBalance =
      currentFine
        ? state.balances.get(
            currentFine.id
          )
        : null;


    updateActionAvailability(
      currentFine,
      currentBalance
    );

  }

}


/* =========================================================
   REFRESH
========================================================= */

async function refresh() {

  clearMessages();

  if (elements.refreshFines) {
    elements.refreshFines.disabled =
      true;
  }

  try {

    await loadFines();

    showStatus(
      "Fines refreshed."
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: Fines load failed:",
      error
    );

    showError(
      normalizeError(error)
    );

  }

  finally {

    if (elements.refreshFines) {
      elements.refreshFines.disabled =
        false;
    }

  }

}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {

  elements.fineSearch?.addEventListener(
    "input",
    renderFines
  );


  elements.monthFilter?.addEventListener(
    "change",
    renderFines
  );


  elements.statusFilter?.addEventListener(
    "change",
    renderFines
  );


  elements.clearFilters?.addEventListener(
    "click",
    () => {

      elements.fineSearch.value =
        "";

      elements.monthFilter.value =
        "";

      elements.statusFilter.value =
        "";

      renderFines();

    }
  );


  elements.refreshFines?.addEventListener(
    "click",
    refresh
  );


  elements.closeDetail?.addEventListener(
    "click",
    closeFineDetail
  );


  elements.adjustFine?.addEventListener(
    "click",
    () => {

      if (
        !state.selectedFineId
      ) {
        return;
      }

      openFineActionModal(
        "adjust",
        state.selectedFineId
      );

    }
  );


  elements.waiveFine?.addEventListener(
    "click",
    () => {

      if (
        !state.selectedFineId
      ) {
        return;
      }

      openFineActionModal(
        "waive",
        state.selectedFineId
      );

    }
  );


  elements.allocateFinePayment?.addEventListener(
    "click",
    () => {

      if (
        !state.selectedFineId
      ) {
        return;
      }

      openFineActionModal(
        "allocate",
        state.selectedFineId
      );

    }
  );


  elements.closeFineAction?.addEventListener(
    "click",
    closeFineActionModal
  );


  elements.fineActionModal?.addEventListener(
    "click",
    event => {

      if (
        event.target.matches(
          "[data-modal-close]"
        )
      ) {

        closeFineActionModal();

      }

    }
  );


  elements.fineActionForm?.addEventListener(
    "submit",
    submitFineAction
  );


  elements.finesBody?.addEventListener(
    "click",
    event => {

      const button =
        event.target.closest(
          "[data-action='view']"
        );

      if (!button) {
        return;
      }

      const fineId =
        button.dataset.id;

      if (!fineId) {
        return;
      }

      showFineDetail(
        fineId
      );

    }
  );

}


/* =========================================================
   INITIALIZER
   ---------------------------------------------------------
   NO AUTO-BOOT.
   admin-layout.js is the sole boot owner.
========================================================= */

export async function initFines() {

  cacheElements();

  bindEvents();

  clearMessages();

  loadContext();

  await loadFines();

}
