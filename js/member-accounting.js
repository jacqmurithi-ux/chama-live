/* =========================================================
   CHAMA LIVE — MEMBER ACCOUNTING
   ---------------------------------------------------------
   Purpose:
   - Read-only canonical member accounting UI
   - Uses get_canonical_member_monthly_status()
   - Uses get_member_contribution_position()
   - No browser-side accounting refresh/rebuild
   - No direct accounting-table writes
   - Preserves filtering, statements, exports and printing

   BOOT CONTRACT:
   member-layout.js is the sole feature boot owner.

   This file exports:
     initMemberAccounting()

   This file MUST NOT independently auto-boot.

   MONTHLY STATUS CONTRACT:
     paid
     credit
     partial
     outstanding

   CUMULATIVE POSITION CONTRACT:
     ARREARS
     CREDIT
     UP_TO_DATE

   IMPORTANT:
   previous_outstanding is a monthly historical field.
   It must NOT be relabeled as cumulative ARREARS.
   ========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";


/* =========================================================
   STATE
   ========================================================= */

let groupId = null;
let currentMember = null;
let currentGroup = null;

let accountingMonth = "";

let canonicalRows = [];
let filteredRows = [];

let selectedMemberId = null;

/*
 * Cumulative position cache.
 *
 * Key:
 *   member_id
 *
 * Value:
 *   result returned by get_member_contribution_position()
 */
const cumulativePositionCache = new Map();


/* =========================================================
   DOM
   ========================================================= */

const accountingMonthInput =
  document.getElementById("accountingMonth");

const memberFilter =
  document.getElementById("memberFilter");

const statusFilter =
  document.getElementById("statusFilter");

const searchMember =
  document.getElementById("searchMember");

const refreshButton =
  document.getElementById("refreshButton");

const resetButton =
  document.getElementById("resetButton");

const printButton =
  document.getElementById("printButton");

const csvButton =
  document.getElementById("csvButton");

const excelButton =
  document.getElementById("excelButton");

const closeStatementButton =
  document.getElementById("closeStatementButton");

const statementPrintButton =
  document.getElementById("statementPrintButton");

const groupLabel =
  document.getElementById("groupLabel");

const statusMessage =
  document.getElementById("statusMessage");

const memberAccountingBody =
  document.getElementById("memberAccountingBody");

const tablePeriod =
  document.getElementById("tablePeriod");

const statementSection =
  document.getElementById("statementSection");

const cumulativePositionSection =
  document.getElementById("memberCumulativePosition");

const cumulativePositionContent =
  document.getElementById(
    "memberCumulativePositionContent"
  );

const statementTitle =
  document.getElementById("statementTitle");

const statementMeta =
  document.getElementById("statementMeta");

const statementDue =
  document.getElementById("statementDue");

const statementPaid =
  document.getElementById("statementPaid");

const statementOutstanding =
  document.getElementById("statementOutstanding");

const statementCredit =
  document.getElementById("statementCredit");

const statementBody =
  document.getElementById("statementBody");

const statMembers =
  document.getElementById("statMembers");

const statDue =
  document.getElementById("statDue");

const statApplied =
  document.getElementById("statApplied");

const statOutstanding =
  document.getElementById("statOutstanding");

const statCredit =
  document.getElementById("statCredit");

const statAttention =
  document.getElementById("statAttention");

/*
 * IMPORTANT:
 * member-accounting.html uses:
 *
 *   data-quick-filter="all"
 *
 * Therefore the JS must use data-quick-filter too.
 */
const quickFilters =
  document.querySelectorAll(
    "[data-quick-filter]"
  );


/* =========================================================
   HELPERS
   ========================================================= */

function number(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}


function formatCurrency(value) {
  return `KSh ${number(value).toLocaleString(
    "en-KE",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  )}`;
}


function formatMonth(month) {
  if (!month) {
    return "";
  }

  const parts = String(month).split("-");

  if (parts.length !== 2) {
    return String(month);
  }

  const year = Number(parts[0]);
  const monthNumber = Number(parts[1]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber)
  ) {
    return String(month);
  }

  const date = new Date(
    year,
    monthNumber - 1,
    1
  );

  return date.toLocaleDateString(
    "en-KE",
    {
      month: "long",
      year: "numeric"
    }
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


function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}


function getMemberId(row) {
  return row?.member_id ?? "";
}


function getMemberNumber(row) {
  return row?.member_number ?? "";
}


function getMemberName(row) {
  return (
    row?.member_name ??
    row?.full_name ??
    "Unnamed member"
  );
}


function getMonthlyDue(row) {
  return number(
    row?.monthly_due
  );
}


function getPreviousOutstanding(row) {
  return number(
    row?.previous_outstanding
  );
}


function getPreviousCredit(row) {
  return number(
    row?.previous_credit
  );
}


function getCurrentMonthPayment(row) {
  return number(
    row?.current_month_payment
  );
}


function getApplied(row) {
  return number(
    row?.applied_this_month
  );
}


function getCarryForward(row) {
  return number(
    row?.carry_forward
  );
}


function getCurrentOutstanding(row) {
  return number(
    row?.current_outstanding
  );
}


function getTotalPaid(row) {
  return number(
    row?.total_paid_to_date
  );
}


function getTotalDue(row) {
  return number(
    row?.total_due_to_date
  );
}


function getStatus(row) {
  return row?.status ?? "";
}


/* =========================================================
   STATUS DISPLAY
   ========================================================= */

function statusLabel(value) {
  switch (
    normalizeStatus(value)
  ) {
    case "paid":
      return "Paid";

    case "credit":
      return "Credit";

    case "partial":
      return "Partial";

    case "outstanding":
      return "Outstanding";

    default:
      return value || "—";
  }
}


function statusClass(value) {
  switch (
    normalizeStatus(value)
  ) {
    case "paid":
      return "ma-badge-paid";

    case "credit":
      return "ma-badge-credit";

    case "partial":
      return "ma-badge-partial";

    case "outstanding":
      return "ma-badge-outstanding";

    default:
      return "ma-badge-neutral";
  }
}


/* =========================================================
   CUMULATIVE POSITION HELPERS
   ========================================================= */

function getCumulativeTotalDue(position) {
  return number(
    position?.total_due
  );
}


function getCumulativeTotalAllocated(
  position
) {
  return number(
    position?.total_allocated
  );
}


function getCumulativeArrears(position) {
  return number(
    position?.arrears
  );
}


function getCumulativeCredit(position) {
  return number(
    position?.credit
  );
}


function getCumulativeStatus(position) {
  return String(
    position?.status || ""
  )
    .trim()
    .toUpperCase();
}


function getCumulativeStatusLabel(
  status
) {
  switch (
    String(status || "")
      .trim()
      .toUpperCase()
  ) {
    case "ARREARS":
      return "Arrears";

    case "CREDIT":
      return "Credit";

    case "UP_TO_DATE":
      return "Up to date";

    default:
      return status || "—";
  }
}


function getCumulativeStatusClass(
  status
) {
  switch (
    String(status || "")
      .trim()
      .toUpperCase()
  ) {
    case "ARREARS":
      return "ma-badge-arrears";

    case "CREDIT":
      return "ma-badge-credit";

    case "UP_TO_DATE":
      return "ma-badge-paid";

    default:
      return "ma-badge-neutral";
  }
}


/* =========================================================
   STATUS MESSAGE
   ========================================================= */

function setStatus(
  message,
  type = "info"
) {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent =
    message;

  statusMessage.dataset.status =
    type;
}


function showError(error) {
  console.error(
    "CHAMA LIVE member accounting error:",
    error
  );

  setStatus(
    error?.message ||
      "Unable to load member accounting.",
    "error"
  );
}


/* =========================================================
   ACCOUNTING MONTH
   ========================================================= */

function setAccountingMonth(month) {
  let selectedMonth = month;

  if (!selectedMonth) {
    const now = new Date();

    selectedMonth =
      `${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, "0")}`;
  }

  accountingMonth =
    selectedMonth;

  if (accountingMonthInput) {
    accountingMonthInput.value =
      accountingMonth;
  }

  renderPeriod();
}


function renderPeriod() {
  const period =
    formatMonth(accountingMonth);

  if (tablePeriod) {
    tablePeriod.textContent =
      period;
  }
}


/* =========================================================
   CONTEXT
   ========================================================= */

async function loadContext() {
  currentMember =
    await getMyMember();

  currentGroup =
    await getMyGroup();

  if (!currentMember) {
    throw new Error(
      "Your member account could not be loaded."
    );
  }

  if (!currentGroup) {
    throw new Error(
      "Your group could not be loaded."
    );
  }

  groupId =
    currentGroup.id ??
    currentGroup.group_id;

  if (!groupId) {
    throw new Error(
      "Group ID is missing."
    );
  }

  if (groupLabel) {
    groupLabel.textContent =
      currentGroup.name ??
      currentGroup.group_name ??
      "My Group";
  }
}


/* =========================================================
   CANONICAL MONTHLY READ
   =========================================================
   READ ONLY.

   The browser does NOT call:
     refresh_canonical_contribution_accounting()

   The canonical accounting RPC is the only monthly
   accounting source used by this page.
   ========================================================= */

async function loadCanonicalRows() {
  const {
    data,
    error
  } = await supabase.rpc(
    "get_canonical_member_monthly_status",
    {
      p_group_id: groupId,
      p_month: accountingMonth
    }
  );

  if (error) {
    throw error;
  }

  canonicalRows =
    Array.isArray(data)
      ? data
      : [];
}


/* =========================================================
   CUMULATIVE MEMBER POSITION
   ========================================================= */

async function loadMemberContributionPosition(
  memberId
) {
  if (!memberId) {
    return null;
  }

  const cacheKey =
    String(memberId);

  if (
    cumulativePositionCache.has(
      cacheKey
    )
  ) {
    return cumulativePositionCache.get(
      cacheKey
    );
  }

  const {
    data,
    error
  } = await supabase.rpc(
    "get_member_contribution_position",
    {
      p_member_id: memberId
    }
  );

  if (error) {
    throw error;
  }

  const position =
    Array.isArray(data)
      ? data[0] ?? null
      : data ?? null;

  if (!position) {
    throw new Error(
      "Cumulative member contribution position returned no result."
    );
  }

  cumulativePositionCache.set(
    cacheKey,
    position
  );

  return position;
}


function clearCumulativePositionCache() {
  cumulativePositionCache.clear();
}


/* =========================================================
   CUMULATIVE POSITION RENDER
   ========================================================= */

function renderCumulativePosition(
  position
) {
  if (!cumulativePositionContent) {
    return;
  }

  if (!position) {
    cumulativePositionContent.innerHTML = `
      <div class="ma-empty">
        No cumulative contribution position
        is available for this member.
      </div>
    `;

    return;
  }

  const totalDue =
    getCumulativeTotalDue(
      position
    );

  const totalAllocated =
    getCumulativeTotalAllocated(
      position
    );

  const arrears =
    getCumulativeArrears(
      position
    );

  const credit =
    getCumulativeCredit(
      position
    );

  const status =
    getCumulativeStatus(
      position
    );

  const statusLabelValue =
    getCumulativeStatusLabel(
      status
    );

  const statusClassValue =
    getCumulativeStatusClass(
      status
    );

  cumulativePositionContent.innerHTML = `
    <div class="ma-summary-grid">

      <div class="ma-summary-card">
        <span class="ma-summary-label">
          Total due to date
        </span>

        <strong class="ma-summary-value">
          ${formatCurrency(totalDue)}
        </strong>
      </div>

      <div class="ma-summary-card">
        <span class="ma-summary-label">
          Total allocated
        </span>

        <strong class="ma-summary-value">
          ${formatCurrency(totalAllocated)}
        </strong>
      </div>

      <div class="ma-summary-card">
        <span class="ma-summary-label">
          Cumulative arrears
        </span>

        <strong class="ma-summary-value">
          ${formatCurrency(arrears)}
        </strong>
      </div>

      <div class="ma-summary-card">
        <span class="ma-summary-label">
          Cumulative credit
        </span>

        <strong class="ma-summary-value">
          ${formatCurrency(credit)}
        </strong>
      </div>

    </div>

    <div class="ma-cumulative-status">

      <span class="ma-summary-label">
        Cumulative position
      </span>

      <span class="ma-badge ${statusClassValue}">
        ${escapeHtml(
          statusLabelValue
        )}
      </span>

    </div>
  `;
}


/* =========================================================
   MEMBER FILTER
   ========================================================= */

function populateMemberFilter() {
  if (!memberFilter) {
    return;
  }

  const previousValue =
    memberFilter.value;

  const members =
    [...canonicalRows].sort(
      (a, b) =>
        getMemberName(a).localeCompare(
          getMemberName(b)
        )
    );

  memberFilter.innerHTML = `
    <option value="">
      All Members
    </option>

    ${members.map(row => `
      <option
        value="${escapeHtml(
          getMemberId(row)
        )}"
      >
        ${escapeHtml(
          getMemberName(row)
        )}
      </option>
    `).join("")}
  `;

  if (
    previousValue &&
    members.some(
      row =>
        String(
          getMemberId(row)
        ) ===
        String(previousValue)
    )
  ) {
    memberFilter.value =
      previousValue;
  }
}


/* =========================================================
   QUICK FILTER MATCHING
   ========================================================= */

function matchesQuickFilter(
  row,
  filter
) {
  switch (filter) {
    case "all":
      return true;

    case "attention":
      return (
        getCurrentOutstanding(row) > 0 ||
        getPreviousOutstanding(row) > 0
      );

    /*
     * "Arrears" here deliberately means
     * previous monthly outstanding.
     *
     * It is NOT cumulative ARREARS.
     */
    case "arrears":
      return (
        getPreviousOutstanding(row) > 0
      );

    case "credit":
      return (
        getPreviousCredit(row) > 0 ||
        getCarryForward(row) > 0
      );

    default:
      return (
        normalizeStatus(
          getStatus(row)
        ) ===
        normalizeStatus(filter)
      );
  }
}


/* =========================================================
   FILTERS
   ========================================================= */

function applyFilters() {
  const selectedMember =
    memberFilter?.value || "";

  const selectedStatus =
    statusFilter?.value || "";

  const search =
    searchMember?.value
      ?.trim()
      .toLowerCase() || "";

  filteredRows =
    canonicalRows.filter(row => {
      const memberId =
        String(
          getMemberId(row)
        );

      const name =
        String(
          getMemberName(row)
        ).toLowerCase();

      const memberNumber =
        String(
          getMemberNumber(row)
        ).toLowerCase();

      const status =
        normalizeStatus(
          getStatus(row)
        );

      if (
        selectedMember &&
        memberId !==
          String(selectedMember)
      ) {
        return false;
      }

      if (
        selectedStatus &&
        status !==
          normalizeStatus(
            selectedStatus
          )
      ) {
        return false;
      }

      if (
        search &&
        !name.includes(search) &&
        !memberNumber.includes(search)
      ) {
        return false;
      }

      return true;
    });

  renderTable();
  renderSummary();
}


/* =========================================================
   ACCOUNTING TABLE
   ========================================================= */

function renderTable() {
  if (!memberAccountingBody) {
    return;
  }

  if (!filteredRows.length) {
    memberAccountingBody.innerHTML = `
      <tr>
        <td
          colspan="11"
          class="ma-empty"
        >
          No member accounting records
          found for
          ${escapeHtml(
            formatMonth(accountingMonth)
          )}.
        </td>
      </tr>
    `;

    return;
  }

  /*
   * HTML table contract:
   *
   * 1  Member
   * 2  Due
   * 3  Previous outstanding
   * 4  Previous credit
   * 5  Current payment
   * 6  Applied
   * 7  Carry forward
   * 8  Outstanding
   * 9  Credit
   * 10 Status
   * 11 Action
   *
   * Keep this exactly aligned with member-accounting.html.
   */

  memberAccountingBody.innerHTML =
    filteredRows.map(row => {

      const memberId =
        getMemberId(row);

      const status =
        getStatus(row);

      return `
        <tr
          data-member-id="${escapeHtml(
            memberId
          )}"
        >

          <td>

            <button
              type="button"
              class="member-statement-link"
              data-member-id="${escapeHtml(
                memberId
              )}"
            >

              <span class="ma-member-name">
                ${escapeHtml(
                  getMemberName(row)
                )}
              </span>

              <span class="ma-member-number">
                ${escapeHtml(
                  getMemberNumber(row)
                )}
              </span>

            </button>

          </td>

          <td>
            ${formatCurrency(
              getMonthlyDue(row)
            )}
          </td>

          <td>
            ${formatCurrency(
              getPreviousOutstanding(row)
            )}
          </td>

          <td>
            ${formatCurrency(
              getPreviousCredit(row)
            )}
          </td>

          <td>
            ${formatCurrency(
              getCurrentMonthPayment(row)
            )}
          </td>

          <td>
            ${formatCurrency(
              getApplied(row)
            )}
          </td>

          <td>
            ${formatCurrency(
              getCarryForward(row)
            )}
          </td>

          <td>
            ${formatCurrency(
              getCurrentOutstanding(row)
            )}
          </td>

          <td>
            ${formatCurrency(
              getPreviousCredit(row) +
              Math.max(
                getCarryForward(row),
                0
              )
            )}
          </td>

          <td>

            <span
              class="ma-badge ${statusClass(
                status
              )}"
            >
              ${escapeHtml(
                statusLabel(status)
              )}
            </span>

          </td>

          <td>

            <button
              type="button"
              class="btn btn-small member-statement-action"
              data-member-id="${escapeHtml(
                memberId
              )}"
            >
              Statement
            </button>

          </td>

        </tr>
      `;
    }).join("");

  memberAccountingBody
    .querySelectorAll(
      "[data-member-id]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        event => {

          event.preventDefault();
          event.stopPropagation();

          openMemberStatement(
            button.dataset.memberId
          );
        }
      );

    });
}


/* =========================================================
   SUMMARY
   ========================================================= */

function renderSummary() {
  const rows =
    filteredRows;

  const members =
    rows.length;

  const due =
    rows.reduce(
      (sum, row) =>
        sum +
        getMonthlyDue(row),
      0
    );

  const applied =
    rows.reduce(
      (sum, row) =>
        sum +
        getApplied(row),
      0
    );

  const outstanding =
    rows.reduce(
      (sum, row) =>
        sum +
        getCurrentOutstanding(row),
      0
    );

  const credit =
    rows.reduce(
      (sum, row) =>
        sum +
        Math.max(
          getPreviousCredit(row),
          0
        ) +
        Math.max(
          getCarryForward(row),
          0
        ),
      0
    );

  const attention =
    rows.filter(
      row =>
        getCurrentOutstanding(row) > 0 ||
        getPreviousOutstanding(row) > 0
    ).length;

  if (statMembers) {
    statMembers.textContent =
      members.toLocaleString(
        "en-KE"
      );
  }

  if (statDue) {
    statDue.textContent =
      formatCurrency(due);
  }

  if (statApplied) {
    statApplied.textContent =
      formatCurrency(applied);
  }

  if (statOutstanding) {
    statOutstanding.textContent =
      formatCurrency(
        outstanding
      );
  }

  if (statCredit) {
    statCredit.textContent =
      formatCurrency(
        credit
      );
  }

  if (statAttention) {
    statAttention.textContent =
      attention.toLocaleString(
        "en-KE"
      );
  }
}


/* =========================================================
   MEMBER STATEMENT
   ========================================================= */

async function openMemberStatement(
  memberId
) {
  const row =
    canonicalRows.find(
      item =>
        String(
          getMemberId(item)
        ) ===
        String(memberId)
    );

  if (!row) {
    return;
  }

  selectedMemberId =
    memberId;

  const name =
    getMemberName(row);

  const number =
    getMemberNumber(row);

  if (statementTitle) {
    statementTitle.textContent =
      number
        ? `${number} — ${name}`
        : name;
  }

  if (statementMeta) {
    statementMeta.textContent =
      `${formatMonth(
        accountingMonth
      )} • Canonical member accounting`;
  }

  if (statementDue) {
    statementDue.textContent =
      formatCurrency(
        getMonthlyDue(row)
      );
  }

  if (statementPaid) {
    statementPaid.textContent =
      formatCurrency(
        getCurrentMonthPayment(row)
      );
  }

  if (statementOutstanding) {
    statementOutstanding.textContent =
      formatCurrency(
        getCurrentOutstanding(row)
      );
  }

  if (statementCredit) {
    statementCredit.textContent =
      formatCurrency(
        Math.max(
          getPreviousCredit(row),
          0
        ) +
        Math.max(
          getCarryForward(row),
          0
        )
      );
  }

  /*
   * The current canonical monthly RPC supplies
   * accounting-position fields, not a transaction
   * ledger. Therefore the statement section displays
   * the canonical monthly accounting position rather
   * than inventing transaction rows.
   */

  if (statementBody) {
    statementBody.innerHTML = `
      <tr>
        <td colspan="3">
          Monthly due
        </td>

        <td>
          ${formatCurrency(
            getMonthlyDue(row)
          )}
        </td>

        <td>
          ${formatCurrency(
            getApplied(row)
          )}
        </td>

        <td>
          ${escapeHtml(
            statusLabel(
              getStatus(row)
            )
          )}
        </td>
      </tr>

      <tr>
        <td colspan="3">
          Previous outstanding
        </td>

        <td>
          ${formatCurrency(
            getPreviousOutstanding(row)
          )}
        </td>

        <td>
          —
        </td>

        <td>
          Historical monthly position
        </td>
      </tr>

      <tr>
        <td colspan="3">
          Previous credit
        </td>

        <td>
          ${formatCurrency(
            getPreviousCredit(row)
          )}
        </td>

        <td>
          —
        </td>

        <td>
          Historical monthly position
        </td>
      </tr>

      <tr>
        <td colspan="3">
          Current month payment
        </td>

        <td>
          ${formatCurrency(
            getCurrentMonthPayment(row)
          )}
        </td>

        <td>
          ${formatCurrency(
            getApplied(row)
          )}
        </td>

        <td>
          Canonical monthly accounting
        </td>
      </tr>

      <tr>
        <td colspan="3">
          Carry-forward
        </td>

        <td>
          ${formatCurrency(
            getCarryForward(row)
          )}
        </td>

        <td>
          —
        </td>

        <td>
          Current carry-forward
        </td>
      </tr>

      <tr>
        <td colspan="3">
          Current outstanding
        </td>

        <td>
          ${formatCurrency(
            getCurrentOutstanding(row)
          )}
        </td>

        <td>
          —
        </td>

        <td>
          Current monthly position
        </td>
      </tr>
    `;
  }

  if (statementSection) {
    statementSection.classList.add(
      "visible"
    );
  }

  if (cumulativePositionSection) {
    cumulativePositionSection.classList.add(
      "visible"
    );
  }

  /*
   * Cumulative accounting is deliberately loaded
   * separately from monthly accounting.
   */

  try {

    if (cumulativePositionContent) {
      cumulativePositionContent.innerHTML = `
        <div class="ma-empty">
          Loading cumulative position…
        </div>
      `;
    }

    const position =
      await loadMemberContributionPosition(
        memberId
      );

    renderCumulativePosition(
      position
    );

  } catch (error) {

    console.error(
      "Cumulative member position error:",
      error
    );

    if (cumulativePositionContent) {
      cumulativePositionContent.innerHTML = `
        <div class="ma-empty">
          Cumulative position could not be loaded.
        </div>
      `;
    }
  }
}


function closeMemberStatement() {
  selectedMemberId =
    null;

  if (statementSection) {
    statementSection.classList.remove(
      "visible"
    );
  }

  if (cumulativePositionSection) {
    cumulativePositionSection.classList.remove(
      "visible"
    );
  }
}


/* =========================================================
   QUICK FILTERS
   ========================================================= */

function applyQuickFilter(
  filter
) {
  const value =
    String(filter || "")
      .trim()
      .toLowerCase();

  quickFilters.forEach(
    button => {

      button.classList.toggle(
        "active",
        button.dataset.quickFilter ===
          value
      );

    }
  );

  if (value === "all") {
    if (memberFilter) {
      memberFilter.value =
        "";
    }

    if (statusFilter) {
      statusFilter.value =
        "";
    }

    if (searchMember) {
      searchMember.value =
        "";
    }

    applyFilters();

    return;
  }

  if (
    value === "attention" ||
    value === "arrears" ||
    value === "credit"
  ) {

    filteredRows =
      canonicalRows.filter(
        row =>
          matchesQuickFilter(
            row,
            value
          )
      );

    renderTable();
    renderSummary();

    return;
  }

  /*
   * Status quick filter.
   */

  if (statusFilter) {

    const matchingOption =
      [...statusFilter.options]
        .find(option =>
          normalizeStatus(
            option.value
          ) ===
            normalizeStatus(value) ||
          normalizeStatus(
            option.textContent
          ) ===
            normalizeStatus(value)
        );

    if (matchingOption) {

      statusFilter.value =
        matchingOption.value;

      applyFilters();

      return;
    }
  }

  applyFilters();
}


/* =========================================================
   RESET
   ========================================================= */

function resetFilters() {
  if (memberFilter) {
    memberFilter.value =
      "";
  }

  if (statusFilter) {
    statusFilter.value =
      "";
  }

  if (searchMember) {
    searchMember.value =
      "";
  }

  quickFilters.forEach(
    button =>
      button.classList.toggle(
        "active",
        button.dataset.quickFilter ===
          "all"
      )
  );

  applyFilters();
}


/* =========================================================
   CSV
   ========================================================= */

function exportCsv() {
  const headers = [
    "Member Number",
    "Member Name",
    "Monthly Due",
    "Previous Outstanding",
    "Previous Credit",
    "Current Payment",
    "Applied",
    "Carry-forward",
    "Current Outstanding",
    "Credit",
    "Monthly Status"
  ];

  const rows =
    filteredRows.map(row => [

      getMemberNumber(row),

      getMemberName(row),

      getMonthlyDue(row),

      getPreviousOutstanding(row),

      getPreviousCredit(row),

      getCurrentMonthPayment(row),

      getApplied(row),

      getCarryForward(row),

      getCurrentOutstanding(row),

      Math.max(
        getPreviousCredit(row),
        0
      ) +
        Math.max(
          getCarryForward(row),
          0
        ),

      statusLabel(
        getStatus(row)
      )

    ]);

  const csv =
    [
      headers,
      ...rows
    ]
      .map(row =>
        row
          .map(value =>
            `"${String(
              value ?? ""
            ).replace(
              /"/g,
              '""'
            )}"`
          )
          .join(",")
      )
      .join("\r\n");

  downloadBlob(
    csv,
    `member-accounting-${accountingMonth}.csv`,
    "text/csv;charset=utf-8;"
  );
}


/* =========================================================
   EXCEL
   ========================================================= */

function exportExcel() {
  const headers = [
    "Member Number",
    "Member Name",
    "Monthly Due",
    "Previous Outstanding",
    "Previous Credit",
    "Current Payment",
    "Applied",
    "Carry-forward",
    "Current Outstanding",
    "Credit",
    "Monthly Status"
  ];

  const rows =
    filteredRows.map(row => [

      getMemberNumber(row),

      getMemberName(row),

      getMonthlyDue(row),

      getPreviousOutstanding(row),

      getPreviousCredit(row),

      getCurrentMonthPayment(row),

      getApplied(row),

      getCarryForward(row),

      getCurrentOutstanding(row),

      Math.max(
        getPreviousCredit(row),
        0
      ) +
        Math.max(
          getCarryForward(row),
          0
        ),

      statusLabel(
        getStatus(row)
      )

    ]);

  const html = `
    <!DOCTYPE html>

    <html>

      <head>
        <meta charset="UTF-8">
      </head>

      <body>

        <table border="1">

          <thead>

            <tr>

              ${headers.map(
                header =>
                  `<th>${escapeHtml(
                    header
                  )}</th>`
              ).join("")}

            </tr>

          </thead>

          <tbody>

            ${rows.map(
              row => `
                <tr>

                  ${row.map(
                    value =>
                      `<td>${escapeHtml(
                        value
                      )}</td>`
                  ).join("")}

                </tr>
              `
            ).join("")}

          </tbody>

        </table>

      </body>

    </html>
  `;

  downloadBlob(
    html,
    `member-accounting-${accountingMonth}.xls`,
    "application/vnd.ms-excel;charset=utf-8;"
  );
}


/* =========================================================
   DOWNLOAD
   ========================================================= */

function downloadBlob(
  content,
  filename,
  type
) {
  const blob =
    new Blob(
      [content],
      { type }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      "a"
    );

  anchor.href =
    url;

  anchor.download =
    filename;

  document.body.appendChild(
    anchor
  );

  anchor.click();

  anchor.remove();

  URL.revokeObjectURL(
    url
  );
}


/* =========================================================
   PRINT
   ========================================================= */

function printAccounting() {
  window.print();
}


function printStatement() {
  if (!selectedMemberId) {
    window.print();

    return;
  }

  window.print();
}


/* =========================================================
   EVENTS
   ========================================================= */

function setupEvents() {

  if (accountingMonthInput) {

    accountingMonthInput.addEventListener(
      "change",
      async () => {

        setAccountingMonth(
          accountingMonthInput.value
        );

        clearCumulativePositionCache();

        await loadAccounting();

      }
    );

  }


  if (memberFilter) {

    memberFilter.addEventListener(
      "change",
      () => {

        /*
         * Selecting a member from the normal filter
         * returns to normal filtering mode.
         */

        quickFilters.forEach(
          button =>
            button.classList.toggle(
              "active",
              button.dataset.quickFilter ===
                "all"
            )
        );

        applyFilters();

      }
    );

  }


  if (statusFilter) {

    statusFilter.addEventListener(
      "change",
      () => {

        quickFilters.forEach(
          button =>
            button.classList.toggle(
              "active",
              button.dataset.quickFilter ===
                "all"
            )
        );

        applyFilters();

      }
    );

  }


  if (searchMember) {

    searchMember.addEventListener(
      "input",
      () => {

        quickFilters.forEach(
          button =>
            button.classList.toggle(
              "active",
              button.dataset.quickFilter ===
                "all"
            )
        );

        applyFilters();

      }
    );

  }


  /*
   * Refresh is deliberately READ ONLY.
   *
   * It does not call any accounting
   * refresh/rebuild function.
   */

  if (refreshButton) {

    refreshButton.addEventListener(
      "click",
      async () => {

        clearCumulativePositionCache();

        await loadAccounting();

      }
    );

  }


  if (resetButton) {

    resetButton.addEventListener(
      "click",
      resetFilters
    );

  }


  if (printButton) {

    printButton.addEventListener(
      "click",
      printAccounting
    );

  }


  if (statementPrintButton) {

    statementPrintButton.addEventListener(
      "click",
      printStatement
    );

  }


  if (csvButton) {

    csvButton.addEventListener(
      "click",
      exportCsv
    );

  }


  if (excelButton) {

    excelButton.addEventListener(
      "click",
      exportExcel
    );

  }


  if (closeStatementButton) {

    closeStatementButton.addEventListener(
      "click",
      closeMemberStatement
    );

  }


  /*
   * IMPORTANT:
   * data-quick-filter matches member-accounting.html.
   */

  quickFilters.forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          applyQuickFilter(
            button.dataset.quickFilter
          );

        }
      );

    }
  );

}


/* =========================================================
   LOAD ACCOUNTING
   ========================================================= */

async function loadAccounting() {

  try {

    setStatus(
      `Loading ${formatMonth(
        accountingMonth
      )} accounting…`
    );

    await loadCanonicalRows();

    clearCumulativePositionCache();

    populateMemberFilter();

    applyFilters();

    renderPeriod();

    setStatus(
      `${canonicalRows.length} member accounting record${
        canonicalRows.length === 1
          ? ""
          : "s"
      } loaded.`,
      "success"
    );

  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   INITIALIZER
   =========================================================
   member-layout.js calls this function.

   There is intentionally NO:

     DOMContentLoaded

   and NO:

     initMemberAccounting();

   at the bottom of this file.

   This prevents duplicate feature initialization.
   ========================================================= */

export async function initMemberAccounting() {

  try {

    setStatus(
      "Loading member accounting…"
    );

    await requireAuth();

    setAccountingMonth(
      accountingMonthInput?.value
    );

    setupEvents();

    await loadContext();

    await loadAccounting();

  } catch (error) {

    showError(error);

  }

}
