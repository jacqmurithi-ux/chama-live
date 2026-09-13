
/* =========================================================
   CHAMA LIVE — MEMBER ACCOUNTING MVP
   ---------------------------------------------------------
   Purpose:
   - Read-only canonical member accounting UI
   - Uses get_canonical_member_monthly_status()
   - No browser-side canonical refresh/rebuild
   - No direct writes to accounting tables
   - Preserves filtering, statements, exports and printing

   2B APPLICATION CONTRACT:
   Browser:
     READ -> get_canonical_member_monthly_status()

   Server/service-role:
     REFRESH -> protected canonical accounting refresh path

   IMPORTANT:
   The browser must NOT call:
     refresh_canonical_contribution_accounting()

   ========================================================= */

import {
  supabase
} from "./supabase.js";

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

const quickFilters =
  document.querySelectorAll("[data-quick]");


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
  return `KSh ${number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}


function formatMonth(month) {
  if (!month) {
    return "";
  }

  const [year, monthNumber] =
    month.split("-");

  const date =
    new Date(
      Number(year),
      Number(monthNumber) - 1,
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
    .toLowerCase();
}


function getMemberId(row) {
  return row.member_id ?? "";
}


function getMemberNumber(row) {
  return row.member_number ?? "";
}


function getMemberName(row) {
  return row.member_name ??
    "Unnamed member";
}


function getMonthlyDue(row) {
  return number(row.monthly_due);
}


function getPreviousOutstanding(row) {
  return number(
    row.previous_outstanding
  );
}


function getPreviousCredit(row) {
  return number(
    row.previous_credit
  );
}


function getCurrentMonthPayment(row) {
  return number(
    row.current_month_payment
  );
}


function getApplied(row) {
  return number(
    row.applied_this_month
  );
}


function getCarryForward(row) {
  return number(
    row.carry_forward
  );
}


function getCurrentOutstanding(row) {
  return number(
    row.current_outstanding
  );
}


function getTotalPaid(row) {
  return number(
    row.total_paid_to_date
  );
}


function getTotalDue(row) {
  return number(
    row.total_due_to_date
  );
}


function getStatus(row) {
  return row.status ?? "";
}


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
    "Member accounting error:",
    error
  );

  setStatus(
    error?.message ||
      "Unable to load member accounting.",
    "error"
  );
}


function setAccountingMonth(month) {
  if (!month) {
    const now = new Date();

    month =
      `${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, "0")}`;
  }

  accountingMonth =
    month;

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

  if (statementMeta) {
    statementMeta.textContent =
      `${period} • Canonical member accounting`;
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
   CANONICAL ACCOUNTING READ
   =========================================================
   Browser-side accounting is intentionally read-only.

   IMPORTANT:
   This function performs ONLY the canonical read.

   It does NOT call:
     refresh_canonical_contribution_accounting()

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
    <option value="">All members</option>
    ${members.map(row => `
      <option value="${escapeHtml(
        getMemberId(row)
      )}">
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
        String(getMemberId(row)) ===
        String(previousValue)
    )
  ) {
    memberFilter.value =
      previousValue;
  }
}


/* =========================================================
   FILTERING
   ========================================================= */

function matchesQuickFilter(
  row,
  filter
) {
  const status =
    normalizeStatus(
      getStatus(row)
    );

  switch (filter) {
    case "all":
      return true;

    case "attention":
      return (
        getCurrentOutstanding(row) > 0 ||
        getPreviousOutstanding(row) > 0
      );

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
      return status ===
        normalizeStatus(filter);
  }
}


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
        String(getMemberId(row));

      const name =
        String(getMemberName(row))
          .toLowerCase();

      const memberNumber =
        String(getMemberNumber(row))
          .toLowerCase();

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
   TABLE
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
          found for ${escapeHtml(
            formatMonth(accountingMonth)
          )}.
        </td>
      </tr>
    `;

    return;
  }

  memberAccountingBody.innerHTML =
    filteredRows.map(row => {
      const memberId =
        getMemberId(row);

      const status =
        getStatus(row);

      const statusClass =
        normalizeStatus(status)
          .replace(/\s+/g, "-");

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
              getTotalPaid(row)
            )}
          </td>

          <td>
            ${formatCurrency(
              getTotalDue(row)
            )}
          </td>

          <td>
            <span
              class="ma-badge ${
                statusClass
                  ? `ma-badge-${escapeHtml(
                      statusClass
                    )}`
                  : "ma-badge-neutral"
              }"
            >
              ${escapeHtml(
                status || "—"
              )}
            </span>
          </td>
        </tr>
      `;
    }).join("");

  memberAccountingBody
    .querySelectorAll(
      ".member-statement-link"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        event => {
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
        sum + getMonthlyDue(row),
      0
    );

  const applied =
    rows.reduce(
      (sum, row) =>
        sum + getApplied(row),
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
        getPreviousCredit(row) +
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
      formatCurrency(outstanding);
  }

  if (statCredit) {
    statCredit.textContent =
      formatCurrency(credit);
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

function openMemberStatement(
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
        getPreviousCredit(row)
      );
  }

  if (statementBody) {
    statementBody.innerHTML = `
      <tr>
        <td>Previous arrears</td>
        <td>${formatCurrency(
          getPreviousOutstanding(row)
        )}</td>
      </tr>

      <tr>
        <td>Previous credit</td>
        <td>${formatCurrency(
          getPreviousCredit(row)
        )}</td>
      </tr>

      <tr>
        <td>Current month payment</td>
        <td>${formatCurrency(
          getCurrentMonthPayment(row)
        )}</td>
      </tr>

      <tr>
        <td>Applied this month</td>
        <td>${formatCurrency(
          getApplied(row)
        )}</td>
      </tr>

      <tr>
        <td>Carry-forward</td>
        <td>${formatCurrency(
          getCarryForward(row)
        )}</td>
      </tr>

      <tr>
        <td>Current outstanding</td>
        <td>${formatCurrency(
          getCurrentOutstanding(row)
        )}</td>
      </tr>

      <tr>
        <td>Total paid to date</td>
        <td>${formatCurrency(
          getTotalPaid(row)
        )}</td>
      </tr>

      <tr>
        <td>Total due to date</td>
        <td>${formatCurrency(
          getTotalDue(row)
        )}</td>
      </tr>

      <tr>
        <td>Status</td>
        <td>${escapeHtml(
          getStatus(row) || "—"
        )}</td>
      </tr>
    `;
  }

  if (statementSection) {
    statementSection.classList.add(
      "visible"
    );
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
        button.dataset.quick ===
          value
      );
    }
  );

  if (value === "all") {
    if (memberFilter) {
      memberFilter.value = "";
    }

    if (statusFilter) {
      statusFilter.value = "";
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

  if (statusFilter) {
    const matchingOption =
      [...statusFilter.options]
        .find(
          option =>
            normalizeStatus(
              option.value
            ) === value ||
            normalizeStatus(
              option.textContent
            ) === value
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
    memberFilter.value = "";
  }

  if (statusFilter) {
    statusFilter.value = "";
  }

  if (searchMember) {
    searchMember.value = "";
  }

  quickFilters.forEach(
    button =>
      button.classList.remove(
        "active"
      )
  );

  applyFilters();
}


/* =========================================================
   CSV EXPORT
   ========================================================= */

function exportCsv() {
  const headers = [
    "Member Number",
    "Member Name",
    "Monthly Due",
    "Previous Arrears",
    "Previous Credit",
    "Current Payment",
    "Applied",
    "Carry-forward",
    "Outstanding",
    "Total Paid",
    "Total Due",
    "Status"
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
      getTotalPaid(row),
      getTotalDue(row),
      getStatus(row)
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
   EXCEL-COMPATIBLE EXPORT
   ========================================================= */

function exportExcel() {
  const headers = [
    "Member Number",
    "Member Name",
    "Monthly Due",
    "Previous Arrears",
    "Previous Credit",
    "Current Payment",
    "Applied",
    "Carry-forward",
    "Outstanding",
    "Total Paid",
    "Total Due",
    "Status"
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
      getTotalPaid(row),
      getTotalDue(row),
      getStatus(row)
    ]);

  const html = `
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
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

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

        await loadAccounting();
      }
    );
  }

  if (memberFilter) {
    memberFilter.addEventListener(
      "change",
      applyFilters
    );
  }

  if (statusFilter) {
    statusFilter.addEventListener(
      "change",
      applyFilters
    );
  }

  if (searchMember) {
    searchMember.addEventListener(
      "input",
      applyFilters
    );
  }

  /*
   * Refresh remains a read-only reload.
   *
   * It does NOT invoke:
   * refresh_canonical_contribution_accounting()
   */

  if (refreshButton) {
    refreshButton.addEventListener(
      "click",
      async () => {
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

  quickFilters.forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          applyQuickFilter(
            button.dataset.quick
          );
        }
      );
    }
  );
}


/* =========================================================
   LOAD
   ========================================================= */

async function loadAccounting() {
  try {
    setStatus(
      `Loading ${formatMonth(
        accountingMonth
      )} accounting…`
    );

    await loadCanonicalRows();

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
   INIT
   ========================================================= */

async function initMemberAccounting() {
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


initMemberAccounting();
