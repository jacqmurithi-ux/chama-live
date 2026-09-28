/* =========================================================
   CHAMA LIVE — ADMIN FINES
   ---------------------------------------------------------
   F1 READ-ONLY FEATURE

   RESPONSIBILITIES
   ---------------------------------------------------------
   - Load fines belonging to the authenticated admin's group
   - Load authoritative fine balances
   - Render fine summary
   - Filter/search fines
   - Display fine details

   IMPORTANT
   ---------------------------------------------------------
   This module performs NO financial mutations.

   PROHIBITED:
   - INSERT
   - UPDATE
   - DELETE
   - cl_fine_adjust()
   - cl_fine_waive()
   - cl_fine_allocate_payment()
   - cl_fine_generate_contribution()
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


  elements.fineDetail.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

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
