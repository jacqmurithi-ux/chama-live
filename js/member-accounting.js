
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
     READ  -> get_canonical_member_monthly_status()

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

const statementMember =
  document.getElementById("statementMember");

const statementPeriod =
  document.getElementById("statementPeriod");

const statementStatus =
  document.getElementById("statementStatus");

const statementExpected =
  document.getElementById("statementExpected");

const statementPaid =
  document.getElementById("statementPaid");

const statementBalance =
  document.getElementById("statementBalance");

const statementCredit =
  document.getElementById("statementCredit");

const statementArrears =
  document.getElementById("statementArrears");

const totalExpected =
  document.getElementById("totalExpected");

const totalPaid =
  document.getElementById("totalPaid");

const totalArrears =
  document.getElementById("totalArrears");

const totalCredit =
  document.getElementById("totalCredit");

const totalMembers =
  document.getElementById("totalMembers");

const quickFilters =
  document.querySelectorAll("[data-quick]");


/* =========================================================
   HELPERS
   ========================================================= */

function formatCurrency(value) {
  const amount = Number(value || 0);

  return `KSh ${amount.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}


function formatMonth(month) {
  if (!month) {
    return "";
  }

  const [year, monthNumber] = month.split("-");

  const date = new Date(
    Number(year),
    Number(monthNumber) - 1,
    1
  );

  return date.toLocaleDateString("en-KE", {
    month: "long",
    year: "numeric"
  });
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


function getRowMemberId(row) {
  return (
    row.member_id ??
    row.memberId ??
    row.id ??
    ""
  );
}


function getMemberName(row) {
  return (
    row.member_name ??
    row.member_full_name ??
    row.full_name ??
    row.name ??
    "Unnamed member"
  );
}


function getExpected(row) {
  return Number(
    row.expected_amount ??
    row.due_amount ??
    row.expected ??
    0
  );
}


function getPaid(row) {
  return Number(
    row.paid_amount ??
    row.contributed_amount ??
    row.amount_paid ??
    row.paid ??
    0
  );
}


function getArrears(row) {
  return Number(
    row.arrears_amount ??
    row.arrears ??
    0
  );
}


function getCredit(row) {
  return Number(
    row.credit_amount ??
    row.credit ??
    0
  );
}


function getBalance(row) {
  if (
    row.balance_amount !== undefined &&
    row.balance_amount !== null
  ) {
    return Number(row.balance_amount);
  }

  return getExpected(row) - getPaid(row);
}


function getStatus(row) {
  return (
    row.status ??
    row.account_status ??
    row.payment_status ??
    ""
  );
}


function getMemberNumber(row) {
  return (
    row.member_number ??
    row.membership_number ??
    row.member_no ??
    ""
  );
}


function getContributionCount(row) {
  return Number(
    row.contribution_count ??
    row.payment_count ??
    0
  );
}


function setStatus(message, type = "info") {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = message;

  statusMessage.dataset.status =
    type;
}


function showError(error) {
  console.error(
    "Member accounting error:",
    error
  );

  const message =
    error?.message ||
    "Unable to load member accounting.";

  setStatus(
    message,
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

  accountingMonth = month;

  if (accountingMonthInput) {
    accountingMonthInput.value =
      accountingMonth;
  }

  if (tablePeriod) {
    tablePeriod.textContent =
      formatMonth(accountingMonth);
  }

  if (statementPeriod) {
    statementPeriod.textContent =
      formatMonth(accountingMonth);
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

   The protected server-side refresh/rebuild path is NOT
   called here.

   The canonical RPC below returns the accounting state
   already maintained by the protected accounting layer.
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
   FILTERS
   ========================================================= */

function populateMemberFilter() {
  if (!memberFilter) {
    return;
  }

  const previousValue =
    memberFilter.value;

  const members = [
    ...canonicalRows
  ].sort((a, b) =>
    getMemberName(a).localeCompare(
      getMemberName(b)
    )
  );

  memberFilter.innerHTML = `
    <option value="">All members</option>
    ${members
      .map((row) => {
        const id =
          getRowMemberId(row);

        return `
          <option value="${escapeHtml(id)}">
            ${escapeHtml(getMemberName(row))}
          </option>
        `;
      })
      .join("")}
  `;

  if (
    previousValue &&
    members.some(
      row =>
        String(getRowMemberId(row)) ===
        String(previousValue)
    )
  ) {
    memberFilter.value =
      previousValue;
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
        String(getRowMemberId(row));

      const name =
        getMemberName(row)
          .toLowerCase();

      const number =
        String(getMemberNumber(row))
          .toLowerCase();

      const rowStatus =
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
        rowStatus !==
          normalizeStatus(selectedStatus)
      ) {
        return false;
      }

      if (
        search &&
        !name.includes(search) &&
        !number.includes(search)
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
          colspan="9"
          class="text-center"
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
    filteredRows
      .map(row => {
        const memberId =
          getRowMemberId(row);

        const memberName =
          getMemberName(row);

        const memberNumber =
          getMemberNumber(row);

        const expected =
          getExpected(row);

        const paid =
          getPaid(row);

        const balance =
          getBalance(row);

        const arrears =
          getArrears(row);

        const credit =
          getCredit(row);

        const status =
          getStatus(row);

        const contributionCount =
          getContributionCount(row);

        const statusClass =
          normalizeStatus(status)
            .replace(/\s+/g, "-");

        return `
          <tr
            data-member-id="${escapeHtml(memberId)}"
          >
            <td>
              ${escapeHtml(memberNumber)}
            </td>

            <td>
              <button
                type="button"
                class="member-statement-link"
                data-member-id="${escapeHtml(memberId)}"
              >
                ${escapeHtml(memberName)}
              </button>
            </td>

            <td>
              ${formatCurrency(expected)}
            </td>

            <td>
              ${formatCurrency(paid)}
            </td>

            <td>
              ${formatCurrency(balance)}
            </td>

            <td>
              ${formatCurrency(arrears)}
            </td>

            <td>
              ${formatCurrency(credit)}
            </td>

            <td>
              <span
                class="status-badge ${escapeHtml(
                  statusClass
                )}"
              >
                ${escapeHtml(status || "—")}
              </span>
            </td>

            <td>
              ${contributionCount}
            </td>
          </tr>
        `;
      })
      .join("");

  memberAccountingBody
    .querySelectorAll(
      ".member-statement-link"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const memberId =
            button.dataset.memberId;

          openMemberStatement(
            memberId
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

  const expected =
    rows.reduce(
      (sum, row) =>
        sum + getExpected(row),
      0
    );

  const paid =
    rows.reduce(
      (sum, row) =>
        sum + getPaid(row),
      0
    );

  const arrears =
    rows.reduce(
      (sum, row) =>
        sum + getArrears(row),
      0
    );

  const credit =
    rows.reduce(
      (sum, row) =>
        sum + getCredit(row),
      0
    );

  if (totalExpected) {
    totalExpected.textContent =
      formatCurrency(expected);
  }

  if (totalPaid) {
    totalPaid.textContent =
      formatCurrency(paid);
  }

  if (totalArrears) {
    totalArrears.textContent =
      formatCurrency(arrears);
  }

  if (totalCredit) {
    totalCredit.textContent =
      formatCurrency(credit);
  }

  if (totalMembers) {
    totalMembers.textContent =
      rows.length.toLocaleString(
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
          getRowMemberId(item)
        ) ===
        String(memberId)
    );

  if (!row) {
    return;
  }

  selectedMemberId =
    memberId;

  if (statementMember) {
    const number =
      getMemberNumber(row);

    const name =
      getMemberName(row);

    statementMember.textContent =
      number
        ? `${number} — ${name}`
        : name;
  }

  if (statementPeriod) {
    statementPeriod.textContent =
      formatMonth(accountingMonth);
  }

  if (statementStatus) {
    statementStatus.textContent =
      getStatus(row) || "—";
  }

  if (statementExpected) {
    statementExpected.textContent =
      formatCurrency(
        getExpected(row)
      );
  }

  if (statementPaid) {
    statementPaid.textContent =
      formatCurrency(
        getPaid(row)
      );
  }

  if (statementBalance) {
    statementBalance.textContent =
      formatCurrency(
        getBalance(row)
      );
  }

  if (statementCredit) {
    statementCredit.textContent =
      formatCurrency(
        getCredit(row)
      );
  }

  if (statementArrears) {
    statementArrears.textContent =
      formatCurrency(
        getArrears(row)
      );
  }

  const statement =
    document.getElementById(
      "memberStatement"
    );

  if (statement) {
    statement.hidden = false;
  }
}


function closeMemberStatement() {
  selectedMemberId = null;

  const statement =
    document.getElementById(
      "memberStatement"
    );

  if (statement) {
    statement.hidden = true;
  }
}


/* =========================================================
   PERIOD RENDER
   ========================================================= */

function renderPeriod() {
  if (tablePeriod) {
    tablePeriod.textContent =
      formatMonth(accountingMonth);
  }

  if (statementPeriod) {
    statementPeriod.textContent =
      formatMonth(accountingMonth);
  }
}


/* =========================================================
   ACCOUNTING LOAD
   =========================================================
   No refresh parameter.

   Loading accounting means:
   1. Read canonical member accounting.
   2. Populate filters.
   3. Apply filters.
   4. Render the existing UI.

   It does NOT invoke a service-role-only refresh RPC.
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

  applyFilters();
}


/* =========================================================
   QUICK FILTERS
   ========================================================= */

function applyQuickFilter(
  filter
) {
  if (!filter) {
    return;
  }

  const value =
    String(filter)
      .trim()
      .toLowerCase();

  if (statusFilter) {
    const options =
      [
        ...statusFilter.options
      ];

    const matchingOption =
      options.find(
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
    }
  }

  applyFilters();
}


/* =========================================================
   CSV EXPORT
   ========================================================= */

function exportCsv() {
  const headers = [
    "Member Number",
    "Member Name",
    "Expected",
    "Paid",
    "Balance",
    "Arrears",
    "Credit",
    "Status",
    "Contribution Count"
  ];

  const rows =
    filteredRows.map(row => [
      getMemberNumber(row),
      getMemberName(row),
      getExpected(row),
      getPaid(row),
      getBalance(row),
      getArrears(row),
      getCredit(row),
      getStatus(row),
      getContributionCount(row)
    ]);

  const csv = [
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

  const filename =
    `member-accounting-${accountingMonth}.csv`;

  downloadBlob(
    csv,
    filename,
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
    "Expected",
    "Paid",
    "Balance",
    "Arrears",
    "Credit",
    "Status",
    "Contribution Count"
  ];

  const rows =
    filteredRows.map(row => [
      getMemberNumber(row),
      getMemberName(row),
      getExpected(row),
      getPaid(row),
      getBalance(row),
      getArrears(row),
      getCredit(row),
      getStatus(row),
      getContributionCount(row)
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
              ${headers
                .map(
                  header =>
                    `<th>${escapeHtml(
                      header
                    )}</th>`
                )
                .join("")}
            </tr>
          </thead>

          <tbody>
            ${rows
              .map(
                row => `
                  <tr>
                    ${row
                      .map(
                        value =>
                          `<td>${escapeHtml(
                            value
                          )}</td>`
                      )
                      .join("")}
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </body>
    </html>
  `;

  const filename =
    `member-accounting-${accountingMonth}.xls`;

  downloadBlob(
    html,
    filename,
    "application/vnd.ms-excel;charset=utf-8;"
  );
}


/* =========================================================
   DOWNLOAD HELPER
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

  anchor.href = url;
  anchor.download =
    filename;

  document.body.appendChild(
    anchor
  );

  anchor.click();

  anchor.remove();

  URL.revokeObjectURL(url);
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
   * The Refresh Accounting button remains part of the
   * existing UI, but it now performs a read-only reload.
   *
   * It does NOT invoke the protected
   * refresh_canonical_contribution_accounting() RPC.
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
