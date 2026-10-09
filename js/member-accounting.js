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
let ownMemberId = null;

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
 * member-accounting.html uses:
 *
 *   data-quick-filter="all"
 *
 * Therefore the JS uses data-quick-filter too.
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

  const parts =
    String(month).split("-");

  if (parts.length !== 2) {
    return String(month);
  }

  const year =
    Number(parts[0]);

  const monthNumber =
    Number(parts[1]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    return String(month);
  }

  const date =
    new Date(
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


/* =========================================================
   MONTHLY ROW GETTERS
   ---------------------------------------------------------
   These getters intentionally tolerate harmless naming
   differences in the returned canonical RPC object.

   They do NOT create or calculate accounting records.
   ========================================================= */

function getMemberId(row) {
  return row?.member_id ?? "";
}


function getMemberNumber(row) {
  return (
    row?.member_number ??
    row?.member_no ??
    row?.membership_number ??
    ""
  );
}


function getMemberName(row) {
  return (
    row?.member_name ??
    row?.full_name ??
    row?.name ??
    "Unnamed member"
  );
}


function getMonthlyDue(row) {
  return number(
    row?.monthly_due ??
    row?.due ??
    0
  );
}


function getPreviousOutstanding(row) {
  return number(
    row?.previous_outstanding ??
    0
  );
}


function getPreviousCredit(row) {
  return number(
    row?.previous_credit ??
    0
  );
}


function getCurrentMonthPayment(row) {
  return number(
    row?.current_month_payment ??
    row?.current_payment ??
    row?.payment_this_month ??
    0
  );
}


function getApplied(row) {
  return number(
    row?.applied_this_month ??
    row?.applied ??
    0
  );
}


function getCarryForward(row) {
  return number(
    row?.carry_forward ??
    row?.credit_carry_forward ??
    0
  );
}


function getCurrentOutstanding(row) {
  return number(
    row?.current_outstanding ??
    row?.outstanding ??
    0
  );
}


function getCurrentCredit(row) {
  /*
   * Prefer an explicit current-credit field if the
   * canonical RPC supplies one.
   *
   * Existing canonical shape remains supported by
   * falling back to previous credit + carry-forward.
   */
  if (
    row &&
    (
      row.current_credit !== undefined &&
      row.current_credit !== null
    )
  ) {
    return Math.max(
      number(row.current_credit),
      0
    );
  }

  if (
    row &&
    (
      row.credit !== undefined &&
      row.credit !== null
    )
  ) {
    return Math.max(
      number(row.credit),
      0
    );
  }

  return (
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
      return "status-paid";

    case "credit":
      return "status-credit";

    case "partial":
      return "status-partial";

    case "outstanding":
      return "status-outstanding";

    default:
      return "";
  }
}


/* =========================================================
   CUMULATIVE POSITION HELPERS
   ========================================================= */

function getCumulativeTotalDue(position) {
  return number(
    position?.total_due ??
    position?.total_due_to_date ??
    0
  );
}


function getCumulativeTotalAllocated(
  position
) {
  return number(
    position?.total_allocated ??
    position?.total_paid ??
    position?.total_applied ??
    0
  );
}


function getCumulativeArrears(position) {
  return number(
    position?.arrears ??
    position?.cumulative_arrears ??
    0
  );
}


function getCumulativeCredit(position) {
  return number(
    position?.credit ??
    position?.cumulative_credit ??
    0
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
      return "status-arrears";

    case "CREDIT":
      return "status-credit";

    case "UP_TO_DATE":
      return "status-up-to-date";

    default:
      return "";
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

function getCurrentAccountingMonth() {
  const now =
    new Date();

  return (
    `${now.getFullYear()}-` +
    `${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`
  );
}


function setAccountingMonth(month) {
  let selectedMonth =
    String(month || "").trim();

  /*
   * The month input is authoritative when supplied.
   * Otherwise use the current local calendar month.
   */
  if (!selectedMonth) {
    selectedMonth =
      getCurrentAccountingMonth();
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
      period ||
      "Current Accounting Period";
  }
}


/* =========================================================
   CONTEXT
   ========================================================= */

async function loadContext() {
  const {
    data: authData,
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !authData?.user?.id) {
    throw new Error(
      "Your signed-in identity could not be verified. Please sign in again."
    );
  }

  const authenticatedUserId =
    String(authData.user.id);

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

  /*
   * Fail closed if the resolved member row is explicitly linked
   * to a different authenticated user. This prevents an admin or
   * chairperson from being shown a treasurer's member record when
   * the canonical member resolver returns the wrong linked row.
   */
  const linkedUserId =
    currentMember.auth_user_id ??
    currentMember.user_id ??
    null;

  if (
    linkedUserId &&
    String(linkedUserId) !== authenticatedUserId
  ) {
    throw new Error(
      "The member record returned for this session belongs to a different login. Your personal accounting has been blocked for your protection. Please sign out and contact support if this continues."
    );
  }

  ownMemberId =
    currentMember.id ??
    currentMember.member_id ??
    null;

  if (!ownMemberId) {
    throw new Error(
      "Your own member identity could not be identified."
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
  if (!groupId) {
    throw new Error(
      "Group context is not available."
    );
  }

  if (!accountingMonth) {
    throw new Error(
      "Accounting month is not available."
    );
  }

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

  /*
   * Member Portal is a personal view, including when the
   * signed-in member is an admin or chairperson. Never render
   * another member's accounting row in this portal.
   */
  const returnedRows =
    Array.isArray(data)
      ? data
      : [];

  canonicalRows =
    returnedRows.filter(
      row =>
        String(getMemberId(row)) ===
        String(ownMemberId)
    );
}


/* =========================================================
   CUMULATIVE MEMBER POSITION
   ========================================================= */

async function loadMemberContributionPosition(
  memberId
) {
  if (
    !memberId ||
    String(memberId) !== String(ownMemberId)
  ) {
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
   ---------------------------------------------------------
   Uses the classes already defined by
   member-accounting.html:

     cumulative-position
     cumulative-metric
     cumulative-description
     status-badge
     status-*
   ========================================================= */

function renderCumulativePosition(
  position
) {
  if (!cumulativePositionContent) {
    return;
  }

  if (!position) {
    cumulativePositionContent.innerHTML = `
      <div class="cumulative-description">
        No cumulative contribution position is
        available for this member.
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
    <div class="cumulative-metric">

      <span>
        Total due
      </span>

      <strong>
        ${formatCurrency(
          totalDue
        )}
      </strong>

    </div>


    <div class="cumulative-metric">

      <span>
        Total allocated
      </span>

      <strong>
        ${formatCurrency(
          totalAllocated
        )}
      </strong>

    </div>


    <div class="cumulative-metric">

      <span>
        Cumulative arrears
      </span>

      <strong>
        ${formatCurrency(
          arrears
        )}
      </strong>

    </div>


    <div class="cumulative-metric">

      <span>
        Cumulative credit
      </span>

      <strong>
        ${formatCurrency(
          credit
        )}
      </strong>

    </div>


    <div class="cumulative-metric">

      <span>
        Position
      </span>

      <strong>

        <span
          class="status-badge ${
            statusClassValue
          }"
        >
          ${escapeHtml(
            statusLabelValue
          )}
        </span>

      </strong>

    </div>


    <div class="cumulative-description">

      Lifetime scheduled contribution
      position from the canonical member
      contribution position.

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

  const ownRow =
    canonicalRows.find(
      row =>
        String(getMemberId(row)) ===
        String(ownMemberId)
    );

  memberFilter.innerHTML = "";

  const option = document.createElement("option");
  option.value = String(ownMemberId);
  option.textContent = "My account";
  memberFilter.appendChild(option);
  memberFilter.value = String(ownMemberId);

  // These controls are not appropriate in a personal portal.
  const memberField = memberFilter.closest(".field");
  if (memberField) memberField.hidden = true;

  if (searchMember) {
    const searchField = searchMember.closest(".field");
    if (searchField) searchField.hidden = true;
  }

  if (ownRow && memberFilter.labels?.[0]) {
    memberFilter.labels[0].textContent = "My account";
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
     * monthly arrears visible from the current
     * canonical monthly status.
     *
     * It is NOT cumulative ARREARS.
     */
    case "arrears":
      return (
        getCurrentOutstanding(row) > 0 ||
        getPreviousOutstanding(row) > 0
      );

    case "credit":
      return (
        getCurrentCredit(row) > 0
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
    String(ownMemberId || "");

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
          class="empty-state"
        >

          <strong>
            No member accounting records
          </strong>

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
   * Keep this exactly aligned with
   * member-accounting.html.
   */

  memberAccountingBody.innerHTML =
    filteredRows.map(row => {

      const memberId =
        getMemberId(row);

      const status =
        getStatus(row);

      const currentCredit =
        getCurrentCredit(row);

      return `
        <tr
          data-member-row="${escapeHtml(
            memberId
          )}"
        >

          <td>

            <button
              type="button"
              class="member-statement-link"
              data-member-statement="${escapeHtml(
                memberId
              )}"
              style="
                display:block;
                width:100%;
                padding:0;
                border:0;
                background:transparent;
                text-align:left;
              "
            >

              <span class="member-name">
                ${escapeHtml(
                  getMemberName(row)
                )}
              </span>

              <span class="member-number">
                ${escapeHtml(
                  getMemberNumber(row)
                )}
              </span>

            </button>

          </td>


          <td class="amount">
            ${formatCurrency(
              getMonthlyDue(row)
            )}
          </td>


          <td class="amount">
            ${formatCurrency(
              getPreviousOutstanding(row)
            )}
          </td>


          <td class="amount">
            ${formatCurrency(
              getPreviousCredit(row)
            )}
          </td>


          <td class="amount">
            ${formatCurrency(
              getCurrentMonthPayment(row)
            )}
          </td>


          <td class="amount">
            ${formatCurrency(
              getApplied(row)
            )}
          </td>


          <td class="amount">
            ${formatCurrency(
              getCarryForward(row)
            )}
          </td>


          <td class="amount ${
            getCurrentOutstanding(row) > 0
              ? "negative"
              : ""
          }">
            ${formatCurrency(
              getCurrentOutstanding(row)
            )}
          </td>


          <td class="amount ${
            currentCredit > 0
              ? "positive"
              : ""
          }">
            ${formatCurrency(
              currentCredit
            )}
          </td>


          <td>

            <span
              class="status-badge ${statusClass(
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
              class="btn member-statement-action"
              data-member-statement="${escapeHtml(
                memberId
              )}"
            >
              Statement
            </button>

          </td>

        </tr>
      `;
    }).join("");


  /*
   * Event delegation:
   *
   * One listener handles both:
   * - member name
   * - Statement button
   *
   * This prevents duplicate listeners when the
   * table is rendered repeatedly.
   */

  memberAccountingBody.onclick =
    event => {

      const target =
        event.target.closest(
          "[data-member-statement]"
        );

      if (!target) {
        return;
      }

      event.preventDefault();

      const memberId =
        target.dataset.memberStatement;

      if (!memberId) {
        return;
      }

      openMemberStatement(
        memberId
      );
    };
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
        getCurrentCredit(row),
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
        String(getMemberId(item)) ===
          String(ownMemberId) &&
        String(getMemberId(item)) ===
          String(memberId)
    );

  if (!row) {
    return;
  }

  selectedMemberId =
    ownMemberId;

  const name =
    getMemberName(row);

  const memberNumber =
    getMemberNumber(row);

  if (statementTitle) {
    statementTitle.textContent =
      memberNumber
        ? `${memberNumber} — ${name}`
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
        getCurrentCredit(row)
      );
  }

  /*
   * The canonical monthly RPC supplies the accounting
   * position, not a transaction ledger.
   *
   * Therefore this statement does NOT invent payment
   * transaction references, dates or provider records.
   *
   * The six-column table is kept aligned with the HTML:
   *
   * Date
   * Reference
   * Payment method
   * Amount
   * Applied
   * Allocation status
   */

  if (statementBody) {

    const periodLabel =
      formatMonth(accountingMonth);

    const status =
      getStatus(row);

    statementBody.innerHTML = `

      <tr>

        <td>
          ${escapeHtml(
            periodLabel
          )}
        </td>

        <td>
          Canonical monthly position
        </td>

        <td>
          —
        </td>

        <td class="amount">
          ${formatCurrency(
            getCurrentMonthPayment(row)
          )}
        </td>

        <td class="amount">
          ${formatCurrency(
            getApplied(row)
          )}
        </td>

        <td>

          <span
            class="status-badge ${statusClass(
              status
            )}"
          >
            ${escapeHtml(
              statusLabel(status)
            )}
          </span>

        </td>

      </tr>


      <tr>

        <td>
          ${escapeHtml(
            periodLabel
          )}
        </td>

        <td>
          Previous outstanding
        </td>

        <td>
          —
        </td>

        <td class="amount">
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

        <td>
          ${escapeHtml(
            periodLabel
          )}
        </td>

        <td>
          Previous credit
        </td>

        <td>
          —
        </td>

        <td class="amount">
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

        <td>
          ${escapeHtml(
            periodLabel
          )}
        </td>

        <td>
          Carry-forward
        </td>

        <td>
          —
        </td>

        <td class="amount">
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

        <td>
          ${escapeHtml(
            periodLabel
          )}
        </td>

        <td>
          Current outstanding
        </td>

        <td>
          —
        </td>

        <td class="amount">
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
        <div class="cumulative-description">
          Loading cumulative position…
        </div>
      `;
    }

    const position =
      await loadMemberContributionPosition(
        memberId
      );

    /*
     * The user may close the statement or select
     * another member while the RPC is running.
     *
     * Do not paint an old member's cumulative
     * position over a newly selected member.
     */
    if (
      String(selectedMemberId) !==
      String(memberId)
    ) {
      return;
    }

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
        <div class="cumulative-description">
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

  if (cumulativePositionContent) {
    cumulativePositionContent.innerHTML = `
      <div class="cumulative-metric">

        <span>
          Total due
        </span>

        <strong>
          KSh 0
        </strong>

      </div>

      <div class="cumulative-metric">

        <span>
          Total allocated
        </span>

        <strong>
          KSh 0
        </strong>

      </div>

      <div class="cumulative-metric">

        <span>
          Cumulative arrears
        </span>

        <strong>
          KSh 0
        </strong>

      </div>

      <div class="cumulative-metric">

        <span>
          Cumulative credit
        </span>

        <strong>
          KSh 0
        </strong>

      </div>

      <div class="cumulative-metric">

        <span>
          Position
        </span>

        <strong>
          —
        </strong>

      </div>

      <div class="cumulative-description">
        Select a member statement to load the
        cumulative contribution position.
      </div>
    `;
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

    /*
     * Quick filters intentionally operate directly
     * on canonicalRows and do not alter the normal
     * filter controls.
     */

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
   * Status quick filter support.
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

      getCurrentCredit(row),

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

      getCurrentCredit(row),

      statusLabel(
        getStatus(row)
      )

    ]);

  const html = `
    <!DOCTYPE html>

    <html>

      <head>

        <meta charset="UTF-8">

        <meta
          http-equiv="Content-Type"
          content="application/vnd.ms-excel; charset=UTF-8"
        >

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

  /*
   * Give the browser a chance to begin the
   * download before releasing the object URL.
   */
  setTimeout(
    () => {
      URL.revokeObjectURL(url);
    },
    100
  );
}


/* =========================================================
   PRINT
   ========================================================= */

function printAccounting() {
  window.print();
}


function printStatement() {
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
   * data-quick-filter matches
   * member-accounting.html.
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
