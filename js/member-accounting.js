/* =========================================================
   CHAMA LIVE — MEMBER ACCOUNTING MVP
   ---------------------------------------------------------
   Purpose:
     Member-level monthly accounting view.

   IMPORTANT:
     This page does NOT calculate accounting.

     Canonical source:
       Obligation
           ↓
       Payment
           ↓
       Allocation
           ↓
       Arrears / Credit

   Existing canonical RPCs:
     refresh_canonical_contribution_accounting
     get_canonical_member_monthly_status

   No database changes.
   No new RPCs.
   No duplicate accounting engine.
   ========================================================= */

import {
  supabase
} from "./supabase.js";

import {
  getCurrentUser,
  getCurrentMember,
  getCurrentGroup,
  requireAuth
} from "./auth.js";


/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let groupId = null;

let accountingMonth = "";
let allRows = [];
let filteredRows = [];

let quickFilter = "all";


/* =========================================================
   DOM
   ========================================================= */

const accountingMonthEl =
  document.getElementById(
    "accountingMonth"
  );

const memberFilterEl =
  document.getElementById(
    "memberFilter"
  );

const statusFilterEl =
  document.getElementById(
    "statusFilter"
  );

const searchMemberEl =
  document.getElementById(
    "searchMember"
  );

const refreshButton =
  document.getElementById(
    "refreshButton"
  );

const resetButton =
  document.getElementById(
    "resetButton"
  );

const printButton =
  document.getElementById(
    "printButton"
  );

const csvButton =
  document.getElementById(
    "csvButton"
  );

const excelButton =
  document.getElementById(
    "excelButton"
  );

const closeStatementButton =
  document.getElementById(
    "closeStatementButton"
  );

const groupLabel =
  document.getElementById(
    "groupLabel"
  );

const statusMessage =
  document.getElementById(
    "statusMessage"
  );

const memberAccountingBody =
  document.getElementById(
    "memberAccountingBody"
  );

const tablePeriod =
  document.getElementById(
    "tablePeriod"
  );

const statementSection =
  document.getElementById(
    "statementSection"
  );

const statementTitle =
  document.getElementById(
    "statementTitle"
  );

const statementMeta =
  document.getElementById(
    "statementMeta"
  );

const statementBody =
  document.getElementById(
    "statementBody"
  );

const statementDue =
  document.getElementById(
    "statementDue"
  );

const statementPaid =
  document.getElementById(
    "statementPaid"
  );

const statementOutstanding =
  document.getElementById(
    "statementOutstanding"
  );

const statementCredit =
  document.getElementById(
    "statementCredit"
  );

const statMembers =
  document.getElementById(
    "statMembers"
  );

const statDue =
  document.getElementById(
    "statDue"
  );

const statApplied =
  document.getElementById(
    "statApplied"
  );

const statOutstanding =
  document.getElementById(
    "statOutstanding"
  );

const statCredit =
  document.getElementById(
    "statCredit"
  );

const statAttention =
  document.getElementById(
    "statAttention"
  );


/* =========================================================
   HELPERS
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function numberValue(value) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : 0;
}


function money(value) {
  return new Intl.NumberFormat(
    "en-KE",
    {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ).format(
    numberValue(value)
  );
}


function csvValue(value) {
  const text =
    String(value ?? "");

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}


function normalizeStatus(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}


function statusLabel(status) {
  const value =
    normalizeStatus(status);

  switch (value) {
    case "paid":
      return "Paid";

    case "partial":
      return "Partial";

    case "outstanding":
      return "Outstanding";

    case "credit":
      return "Credit";

    default:
      return "No Payment";
  }
}


function statusClass(status) {
  const value =
    normalizeStatus(status);

  switch (value) {
    case "paid":
      return "ma-badge-paid";

    case "partial":
      return "ma-badge-partial";

    case "outstanding":
      return "ma-badge-outstanding";

    case "credit":
      return "ma-badge-credit";

    default:
      return "ma-badge-neutral";
  }
}


function setStatus(
  message,
  type = ""
) {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent =
    message;

  statusMessage.className =
    "ma-status";

  if (type) {
    statusMessage.classList.add(
      type
    );
  }
}


function getCurrentMonth() {
  const now =
    new Date();

  return [
    now.getFullYear(),
    String(
      now.getMonth() + 1
    ).padStart(2, "0")
  ].join("-");
}


function formatMonth(month) {
  if (
    !/^\d{4}-\d{2}$/.test(
      String(month || "")
    )
  ) {
    return month || "";
  }

  const [
    year,
    monthNumber
  ] =
    String(month).split("-");

  const date =
    new Date(
      Number(year),
      Number(monthNumber) - 1,
      1
    );

  return new Intl.DateTimeFormat(
    "en-KE",
    {
      month: "long",
      year: "numeric"
    }
  ).format(date);
}


function rowMemberId(row) {
  return String(
    row?.member_id ?? ""
  );
}


function rowMemberName(row) {
  return String(
    row?.member_name ||
    "Unnamed Member"
  );
}


function rowMemberNumber(row) {
  return String(
    row?.member_number || ""
  );
}


/* =========================================================
   CONTEXT
   ========================================================= */

async function loadContext() {
  setStatus(
    "Checking your CHAMA LIVE account…"
  );

  await requireAuth();

  currentUser =
    await getCurrentUser();

  currentMember =
    await getCurrentMember();

  currentGroup =
    await getCurrentGroup();

  groupId =
    currentMember?.group_id ||
    currentGroup?.id ||
    null;

  if (!groupId) {
    throw new Error(
      "No current group is available."
    );
  }

  if (groupLabel) {
    groupLabel.textContent =
      `Group: ${
        currentGroup?.name ||
        currentGroup?.group_name ||
        "Current Group"
      }`;
  }
}


/* =========================================================
   CANONICAL REFRESH
   ========================================================= */

async function refreshCanonicalAccounting() {
  if (!groupId) {
    throw new Error(
      "No current group is available."
    );
  }

  if (
    !/^\d{4}-\d{2}$/.test(
      accountingMonth
    )
  ) {
    throw new Error(
      "Accounting month must use YYYY-MM format."
    );
  }

  setStatus(
    `Refreshing ${formatMonth(accountingMonth)} canonical accounting…`
  );

  const {
    data,
    error
  } =
    await supabase.rpc(
      "refresh_canonical_contribution_accounting",
      {
        p_group_id:
          groupId,

        p_through_month:
          accountingMonth,

        p_member_id:
          null
      }
    );

  if (error) {
    throw error;
  }

  console.log(
    "CHAMA LIVE: canonical accounting refreshed",
    {
      groupId,
      accountingMonth,
      result: data
    }
  );

  return data;
}


/* =========================================================
   LOAD CANONICAL MEMBER STATUS
   ========================================================= */

async function loadCanonicalRows() {
  if (!groupId) {
    throw new Error(
      "No current group is available."
    );
  }

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_canonical_member_monthly_status",
      {
        p_group_id:
          groupId,

        p_month:
          accountingMonth
      }
    );

  if (error) {
    throw error;
  }

  allRows =
    Array.isArray(data)
      ? data
      : [];

  console.log(
    "CHAMA LIVE: canonical member accounting loaded",
    {
      groupId,
      accountingMonth,
      count: allRows.length
    }
  );
}


/* =========================================================
   MEMBER FILTER OPTIONS
   ========================================================= */

function populateMemberFilter() {
  if (!memberFilterEl) {
    return;
  }

  const currentValue =
    memberFilterEl.value ||
    "all";

  const members =
    [...allRows]
      .sort(
        (a, b) =>
          rowMemberName(a)
            .localeCompare(
              rowMemberName(b)
            )
      );

  const seen =
    new Set();

  const options = [
    `
      <option value="all">
        All Members
      </option>
    `
  ];

  for (const row of members) {
    const id =
      rowMemberId(row);

    if (
      !id ||
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);

    options.push(`
      <option value="${escapeHtml(id)}">
        ${escapeHtml(
          rowMemberName(row)
        )}
        ${
          rowMemberNumber(row)
            ? ` — ${escapeHtml(
                rowMemberNumber(row)
              )}`
            : ""
        }
      </option>
    `);
  }

  memberFilterEl.innerHTML =
    options.join("");

  const exists =
    [...memberFilterEl.options]
      .some(
        option =>
          option.value ===
          currentValue
      );

  memberFilterEl.value =
    exists
      ? currentValue
      : "all";
}


/* =========================================================
   FILTERING
   ========================================================= */

function hasArrears(row) {
  return (
    numberValue(
      row?.current_outstanding
    ) > 0
  );
}


function hasCredit(row) {
  return (
    numberValue(
      row?.carry_forward
    ) > 0 ||
    numberValue(
      row?.previous_credit
    ) > 0
  );
}


function needsAttention(row) {
  const status =
    normalizeStatus(
      row?.status
    );

  return (
    status === "partial" ||
    status === "outstanding" ||
    (
      status === "credit" &&
      numberValue(
        row?.carry_forward
      ) > 0
    )
  );
}


function matchesQuickFilter(row) {
  switch (quickFilter) {
    case "attention":
      return needsAttention(row);

    case "arrears":
      return hasArrears(row);

    case "credit":
      return hasCredit(row);

    default:
      return true;
  }
}


function applyFilters() {
  const selectedMember =
    memberFilterEl?.value ||
    "all";

  const selectedStatus =
    normalizeStatus(
      statusFilterEl?.value ||
      "all"
    );

  const search =
    String(
      searchMemberEl?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  filteredRows =
    allRows.filter(
      row => {
        const memberId =
          rowMemberId(row);

        const name =
          rowMemberName(row)
            .toLowerCase();

        const number =
          rowMemberNumber(row)
            .toLowerCase();

        const status =
          normalizeStatus(
            row?.status
          );

        const memberMatches =
          selectedMember === "all" ||
          memberId ===
            selectedMember;

        const statusMatches =
          selectedStatus === "all" ||
          (
            selectedStatus ===
              "no_payment"
              ? numberValue(
                  row?.current_month_payment
                ) <= 0
              : status ===
                selectedStatus
          );

        const searchMatches =
          !search ||
          name.includes(search) ||
          number.includes(search);

        return (
          memberMatches &&
          statusMatches &&
          searchMatches &&
          matchesQuickFilter(row)
        );
      }
    );

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
          No members match the selected filters.
        </td>
      </tr>
    `;

    return;
  }

  memberAccountingBody.innerHTML =
    filteredRows
      .map(
        row => `
          <tr
            data-member-id="${escapeHtml(
              rowMemberId(row)
            )}"
            title="Double-click to open member statement"
          >

            <td>
              <div class="ma-member-name">
                ${escapeHtml(
                  rowMemberName(row)
                )}
              </div>

              ${
                rowMemberNumber(row)
                  ? `
                    <div class="ma-member-number">
                      ${escapeHtml(
                        rowMemberNumber(row)
                      )}
                    </div>
                  `
                  : ""
              }
            </td>

            <td class="ma-number">
              ${money(
                row?.monthly_due
              )}
            </td>

            <td class="ma-number">
              ${money(
                row?.previous_outstanding
              )}
            </td>

            <td class="ma-number">
              ${money(
                row?.previous_credit
              )}
            </td>

            <td class="ma-number">
              ${money(
                row?.current_month_payment
              )}
            </td>

            <td class="ma-number">
              ${money(
                row?.applied_this_month
              )}
            </td>

            <td class="ma-number">
              ${money(
                row?.carry_forward
              )}
            </td>

            <td class="ma-number">
              ${money(
                row?.current_outstanding
              )}
            </td>

            <td class="ma-number">
              ${money(
                row?.total_paid_to_date
              )}
            </td>

            <td class="ma-number">
              ${money(
                row?.total_due_to_date
              )}
            </td>

            <td>
              <span
                class="ma-badge ${statusClass(
                  row?.status
                )}"
              >
                ${escapeHtml(
                  statusLabel(
                    row?.status
                  )
                )}
              </span>
            </td>

          </tr>
        `
      )
      .join("");
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
        numberValue(
          row?.monthly_due
        ),
      0
    );

  const applied =
    rows.reduce(
      (sum, row) =>
        sum +
        numberValue(
          row?.applied_this_month
        ),
      0
    );

  const outstanding =
    rows.reduce(
      (sum, row) =>
        sum +
        numberValue(
          row?.current_outstanding
        ),
      0
    );

  const credit =
    rows.reduce(
      (sum, row) =>
        sum +
        numberValue(
          row?.carry_forward
        ),
      0
    );

  const attention =
    rows.filter(
      needsAttention
    ).length;

  if (statMembers) {
    statMembers.textContent =
      members;
  }

  if (statDue) {
    statDue.textContent =
      money(due);
  }

  if (statApplied) {
    statApplied.textContent =
      money(applied);
  }

  if (statOutstanding) {
    statOutstanding.textContent =
      money(outstanding);
  }

  if (statCredit) {
    statCredit.textContent =
      money(credit);
  }

  if (statAttention) {
    statAttention.textContent =
      attention;
  }
}


/* =========================================================
   ACCOUNTING MONTH LABEL
   ========================================================= */

function renderPeriod() {
  const label =
    formatMonth(
      accountingMonth
    );

  if (tablePeriod) {
    tablePeriod.textContent =
      `${label} • Canonical Member Accounting`;
  }

  document.title =
    `${label} Member Accounting | CHAMA LIVE`;
}


/* =========================================================
   LOAD
   ========================================================= */

async function loadAccounting({
  refresh = true
} = {}) {
  try {
    setStatus(
      `Loading ${formatMonth(accountingMonth)} accounting…`
    );

    if (refresh) {
      await refreshCanonicalAccounting();
    }

    await loadCanonicalRows();

    populateMemberFilter();

    applyFilters();

    renderPeriod();

    setStatus(
      `${formatMonth(accountingMonth)} member accounting loaded.`,
      "success"
    );
  }
  catch (error) {
    console.error(
      "CHAMA LIVE Member Accounting error:",
      error
    );

    setStatus(
      error?.message ||
      "Unable to load member accounting.",
      "error"
    );

    if (memberAccountingBody) {
      memberAccountingBody.innerHTML = `
        <tr>
          <td
            colspan="11"
            class="ma-empty"
          >
            Unable to load member accounting.
          </td>
        </tr>
      `;
    }
  }
}


/* =========================================================
   RESET
   ========================================================= */

function resetFilters() {
  if (memberFilterEl) {
    memberFilterEl.value =
      "all";
  }

  if (statusFilterEl) {
    statusFilterEl.value =
      "all";
  }

  if (searchMemberEl) {
    searchMemberEl.value =
      "";
  }

  quickFilter =
    "all";

  document
    .querySelectorAll(
      "[data-quick]"
    )
    .forEach(
      button => {
        button.classList.toggle(
          "active",
          button.dataset.quick ===
            "all"
        );
      }
    );

  applyFilters();
}


/* =========================================================
   QUICK FILTERS
   ========================================================= */

function setupQuickFilters() {
  document
    .querySelectorAll(
      "[data-quick]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            quickFilter =
              button.dataset.quick ||
              "all";

            document
              .querySelectorAll(
                "[data-quick]"
              )
              .forEach(
                item => {
                  item.classList.toggle(
                    "active",
                    item ===
                      button
                  );
                }
              );

            applyFilters();
          }
        );
      }
    );
}


/* =========================================================
   MEMBER STATEMENT
   ========================================================= */

function buildStatementRows(
  memberId
) {
  return allRows.filter(
    row =>
      rowMemberId(row) ===
      memberId
  );
}


function openStatement(
  memberId
) {
  const rows =
    buildStatementRows(
      memberId
    );

  if (!rows.length) {
    return;
  }

  const row =
    rows[0];

  const memberName =
    rowMemberName(row);

  const memberNumber =
    rowMemberNumber(row);

  if (statementTitle) {
    statementTitle.textContent =
      `${memberName} — Member Statement`;
  }

  if (statementMeta) {
    statementMeta.textContent =
      [
        memberNumber
          ? `Member No. ${memberNumber}`
          : "",

        currentGroup?.name
          ? currentGroup.name
          : "Current Group"
      ]
        .filter(Boolean)
        .join(" • ");
  }

  const totalDue =
    numberValue(
      row?.total_due_to_date
    );

  const totalPaid =
    numberValue(
      row?.total_paid_to_date
    );

  const outstanding =
    numberValue(
      row?.current_outstanding
    );

  const credit =
    numberValue(
      row?.carry_forward
    );

  if (statementDue) {
    statementDue.textContent =
      money(totalDue);
  }

  if (statementPaid) {
    statementPaid.textContent =
      money(totalPaid);
  }

  if (statementOutstanding) {
    statementOutstanding.textContent =
      money(outstanding);
  }

  if (statementCredit) {
    statementCredit.textContent =
      money(credit);
  }

  if (statementBody) {
    statementBody.innerHTML = `
      <tr>

        <td>
          ${escapeHtml(
            formatMonth(
              accountingMonth
            )
          )}
        </td>

        <td class="ma-number">
          ${money(
            row?.monthly_due
          )}
        </td>

        <td class="ma-number">
          ${money(
            row?.applied_this_month
          )}
        </td>

        <td class="ma-number">
          ${money(
            row?.current_outstanding
          )}
        </td>

        <td class="ma-number">
          ${money(
            row?.carry_forward
          )}
        </td>

        <td>
          <span
            class="ma-badge ${statusClass(
              row?.status
            )}"
          >
            ${escapeHtml(
              statusLabel(
                row?.status
              )
            )}
          </span>
        </td>

      </tr>
    `;
  }

  statementSection?.classList.add(
    "visible"
  );

  statementSection?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


function closeStatement() {
  statementSection?.classList.remove(
    "visible"
  );
}


/* =========================================================
   CSV EXPORT
   ========================================================= */

function exportCsv() {
  if (!filteredRows.length) {
    setStatus(
      "There are no rows to export.",
      "error"
    );

    return;
  }

  const headers = [
    "Member Number",
    "Member Name",
    "Accounting Month",
    "Monthly Due",
    "Previous Arrears",
    "Previous Credit",
    "Current Payment",
    "Applied This Month",
    "Carry Forward",
    "Current Outstanding",
    "Total Paid To Date",
    "Total Due To Date",
    "Status"
  ];

  const lines = [
    headers
      .map(csvValue)
      .join(",")
  ];

  for (
    const row of filteredRows
  ) {
    lines.push(
      [
        rowMemberNumber(row),

        rowMemberName(row),

        accountingMonth,

        numberValue(
          row?.monthly_due
        ).toFixed(2),

        numberValue(
          row?.previous_outstanding
        ).toFixed(2),

        numberValue(
          row?.previous_credit
        ).toFixed(2),

        numberValue(
          row?.current_month_payment
        ).toFixed(2),

        numberValue(
          row?.applied_this_month
        ).toFixed(2),

        numberValue(
          row?.carry_forward
        ).toFixed(2),

        numberValue(
          row?.current_outstanding
        ).toFixed(2),

        numberValue(
          row?.total_paid_to_date
        ).toFixed(2),

        numberValue(
          row?.total_due_to_date
        ).toFixed(2),

        statusLabel(
          row?.status
        )
      ]
        .map(csvValue)
        .join(",")
    );
  }

  const csv =
    "\uFEFF" +
    lines.join("\r\n");

  downloadBlob(
    csv,
    `chama-live-member-accounting-${accountingMonth}.csv`,
    "text/csv;charset=utf-8"
  );

  setStatus(
    "CSV download prepared.",
    "success"
  );
}


/* =========================================================
   EXCEL-COMPATIBLE EXPORT
   ---------------------------------------------------------
   This intentionally avoids adding a third-party dependency.

   The generated .xls file is an HTML table that Microsoft
   Excel can open directly.
   ========================================================= */

function exportExcel() {
  if (!filteredRows.length) {
    setStatus(
      "There are no rows to export.",
      "error"
    );

    return;
  }

  const groupName =
    currentGroup?.name ||
    currentGroup?.group_name ||
    "CHAMA";

  const rowsHtml =
    filteredRows
      .map(
        row => `
          <tr>

            <td>
              ${escapeHtml(
                rowMemberNumber(row)
              )}
            </td>

            <td>
              ${escapeHtml(
                rowMemberName(row)
              )}
            </td>

            <td>
              ${escapeHtml(
                accountingMonth
              )}
            </td>

            <td>
              ${numberValue(
                row?.monthly_due
              ).toFixed(2)}
            </td>

            <td>
              ${numberValue(
                row?.previous_outstanding
              ).toFixed(2)}
            </td>

            <td>
              ${numberValue(
                row?.previous_credit
              ).toFixed(2)}
            </td>

            <td>
              ${numberValue(
                row?.current_month_payment
              ).toFixed(2)}
            </td>

            <td>
              ${numberValue(
                row?.applied_this_month
              ).toFixed(2)}
            </td>

            <td>
              ${numberValue(
                row?.carry_forward
              ).toFixed(2)}
            </td>

            <td>
              ${numberValue(
                row?.current_outstanding
              ).toFixed(2)}
            </td>

            <td>
              ${numberValue(
                row?.total_paid_to_date
              ).toFixed(2)}
            </td>

            <td>
              ${numberValue(
                row?.total_due_to_date
              ).toFixed(2)}
            </td>

            <td>
              ${escapeHtml(
                statusLabel(
                  row?.status
                )
              )}
            </td>

          </tr>
        `
      )
      .join("");

  const html = `
    <!DOCTYPE html>

    <html>

      <head>

        <meta charset="UTF-8">

        <title>
          CHAMA LIVE Member Accounting
        </title>

        <style>

          body {
            font-family: Arial, sans-serif;
          }

          h1 {
            margin-bottom: 4px;
          }

          p {
            color: #555;
          }

          table {
            border-collapse: collapse;
            width: 100%;
          }

          th,
          td {
            border: 1px solid #999;
            padding: 7px;
            text-align: left;
          }

          th {
            background: #eee;
            font-weight: bold;
          }

        </style>

      </head>

      <body>

        <h1>
          CHAMA LIVE — Member Accounting
        </h1>

        <p>
          Group:
          ${escapeHtml(
            groupName
          )}
        </p>

        <p>
          Accounting Month:
          ${escapeHtml(
            formatMonth(
              accountingMonth
            )
          )}
        </p>

        <table>

          <thead>

            <tr>

              <th>
                Member Number
              </th>

              <th>
                Member Name
              </th>

              <th>
                Accounting Month
              </th>

              <th>
                Monthly Due
              </th>

              <th>
                Previous Arrears
              </th>

              <th>
                Previous Credit
              </th>

              <th>
                Current Payment
              </th>

              <th>
                Applied This Month
              </th>

              <th>
                Carry Forward
              </th>

              <th>
                Current Outstanding
              </th>

              <th>
                Total Paid To Date
              </th>

              <th>
                Total Due To Date
              </th>

              <th>
                Status
              </th>

            </tr>

          </thead>

          <tbody>

            ${rowsHtml}

          </tbody>

        </table>

      </body>

    </html>
  `;

  downloadBlob(
    "\uFEFF" + html,
    `chama-live-member-accounting-${accountingMonth}.xls`,
    "application/vnd.ms-excel"
  );

  setStatus(
    "Excel-compatible download prepared.",
    "success"
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

  setTimeout(
    () => {
      URL.revokeObjectURL(
        url
      );
    },
    1000
  );
}


/* =========================================================
   PRINT
   ========================================================= */

function printAccounting() {
  if (!filteredRows.length) {
    setStatus(
      "There are no rows to print.",
      "error"
    );

    return;
  }

  window.print();
}


/* =========================================================
   EVENTS
   ========================================================= */

function setupEvents() {

  accountingMonthEl?.addEventListener(
    "change",
    async () => {

      accountingMonth =
        accountingMonthEl.value;

      await loadAccounting({
        refresh: true
      });

    }
  );


  memberFilterEl?.addEventListener(
    "change",
    () => {
      applyFilters();
    }
  );


  statusFilterEl?.addEventListener(
    "change",
    () => {
      applyFilters();
    }
  );


  searchMemberEl?.addEventListener(
    "input",
    () => {
      applyFilters();
    }
  );


  refreshButton?.addEventListener(
    "click",
    async () => {

      await loadAccounting({
        refresh: true
      });

    }
  );


  resetButton?.addEventListener(
    "click",
    () => {
      resetFilters();
    }
  );


  printButton?.addEventListener(
    "click",
    () => {
      printAccounting();
    }
  );


  csvButton?.addEventListener(
    "click",
    () => {
      exportCsv();
    }
  );


  excelButton?.addEventListener(
    "click",
    () => {
      exportExcel();
    }
  );


  closeStatementButton?.addEventListener(
    "click",
    () => {
      closeStatement();
    }
  );


  /*
    Row-click statement support.

    The table does not add a separate button column,
    keeping the exported table clean.

    Double-click any member row to open that
    member's current accounting statement.
  */

  memberAccountingBody?.addEventListener(
    "dblclick",
    event => {

      const rowElement =
        event.target.closest(
          "tr[data-member-id]"
        );

      if (!rowElement) {
        return;
      }

      openStatement(
        rowElement.dataset.memberId
      );

    }
  );
}


/* =========================================================
   INIT
   ========================================================= */

async function initMemberAccounting() {

  try {

    accountingMonth =
      accountingMonthEl?.value ||
      getCurrentMonth();

    if (accountingMonthEl) {
      accountingMonthEl.value =
        accountingMonth;
    }


    setupQuickFilters();

    setupEvents();


    await loadContext();


    await loadAccounting({
      refresh: true
    });

  }
  catch (error) {

    console.error(
      "CHAMA LIVE Member Accounting initialization error:",
      error
    );

    setStatus(
      error?.message ||
      "Unable to initialise Member Accounting.",
      "error"
    );

  }

}


initMemberAccounting();
