/* =========================================================
   CHAMA LIVE — MEMBER CONTRIBUTIONS

   MEMBER PORTAL / READ ONLY

   • Shows only the authenticated member's contribution records.
   • Uses the canonical monthly status RPC.
   • Does not record contributions.
   • Does not verify payment evidence.
   • Does not expose the group contribution ledger.
   • Does not perform database mutations.
========================================================= */

import {
  supabase
} from "./supabase.js";

import {
  getMyMember
} from "./auth.js";


/* =========================================================
   STATE
========================================================= */

let currentMember = null;

let groupId = null;

let contributions = [];

let canonicalStatus = null;

let initialized = false;


/* =========================================================
   ELEMENTS
========================================================= */

const groupEl =
  document.getElementById(
    "memberContributionGroup"
  );

const statusMessageEl =
  document.getElementById(
    "memberContributionStatus"
  );

const errorEl =
  document.getElementById(
    "memberContributionError"
  );

const accountingMonthEl =
  document.getElementById(
    "accountingMonth"
  );

const contributionStatusEl =
  document.getElementById(
    "contributionStatus"
  );

const currentDueEl =
  document.getElementById(
    "currentDue"
  );

const previousOutstandingEl =
  document.getElementById(
    "previousOutstanding"
  );

const currentPaidEl =
  document.getElementById(
    "currentPaid"
  );

const currentOutstandingEl =
  document.getElementById(
    "currentOutstanding"
  );

const contributionRowsEl =
  document.getElementById(
    "memberContributionRows"
  );

const statementTotalEl =
  document.getElementById(
    "statementTotal"
  );

const statementCountEl =
  document.getElementById(
    "statementCount"
  );

const downloadStatementButton =
  document.getElementById(
    "downloadStatement"
  );

const printStatementButton =
  document.getElementById(
    "printStatement"
  );


/* =========================================================
   HELPERS
========================================================= */

function number(value) {

  const result =
    Number(value || 0);

  return Number.isFinite(result)
    ? result
    : 0;

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
    number(value)
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


function getCurrentMonth() {

  const now =
    new Date();

  return (
    `${now.getFullYear()}-` +
    `${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`
  );

}


function formatMonth(month) {

  if (
    !/^\d{4}-\d{2}$/.test(
      String(month || "")
    )
  ) {
    return String(
      month || "—"
    );
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

  return date.toLocaleDateString(
    "en-KE",
    {
      month: "long",
      year: "numeric"
    }
  );

}


function showError(error) {

  console.error(
    "CHAMA LIVE Member Contributions:",
    error
  );

  if (errorEl) {

    errorEl.textContent =
      error?.message ||
      "Unable to load your contribution records.";

    errorEl.style.display =
      "block";

  }

  if (statusMessageEl) {

    statusMessageEl.textContent =
      "Unable to load your contribution records.";

  }

}


function clearError() {

  if (!errorEl) {
    return;
  }

  errorEl.textContent =
    "";

  errorEl.style.display =
    "none";

}


/* =========================================================
   GROUP CONTEXT
========================================================= */

async function loadGroupName() {

  if (!groupId) {
    return;
  }

  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select(
        "id,name"
      )
      .eq(
        "id",
        groupId
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (groupEl) {

    groupEl.textContent =
      data?.name
        ? `${data.name} — your contribution record`
        : "Your contribution record";

  }

}


/* =========================================================
   CONTRIBUTIONS
========================================================= */

async function loadContributions() {

  const {
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select(
        `
          id,
          group_id,
          member_id,
          amount,
          contribution_type,
          contribution_date,
          payment_method,
          reference,
          mpesa_reference,
          created_at,
          notes
        `
      )
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "member_id",
        currentMember.id
      )
      .order(
        "contribution_date",
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

  contributions =
    Array.isArray(data)
      ? data
      : [];

}


/* =========================================================
   CANONICAL OBLIGATION STATUS
========================================================= */

async function loadCanonicalStatus() {

  const month =
    getCurrentMonth();

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
          month
      }
    );

  if (error) {
    throw error;
  }

  const rows =
    Array.isArray(data)
      ? data
      : [];

  canonicalStatus =
    rows.find(
      row =>
        String(
          row.member_id
        ) ===
        String(
          currentMember.id
        )
    ) || null;

  return month;

}


/* =========================================================
   STATUS PRESENTATION
========================================================= */

function statusLabel(status) {

  switch (
    String(
      status || ""
    ).toLowerCase()
  ) {

    case "paid":
      return "PAID";

    case "partial":
      return "PARTIAL";

    case "outstanding":
      return "OUTSTANDING";

    case "credit":
      return "OVERPAID";

    default:
      return "—";

  }

}


function statusClass(status) {

  switch (
    String(
      status || ""
    ).toLowerCase()
  ) {

    case "paid":
      return "status-paid";

    case "partial":
      return "status-partial";

    case "outstanding":
      return "status-outstanding";

    case "credit":
      return "status-credit";

    default:
      return "status-neutral";

  }

}


/* =========================================================
   RENDER STATUS
========================================================= */

function renderCanonicalStatus(month) {

  if (!canonicalStatus) {

    if (accountingMonthEl) {
      accountingMonthEl.textContent =
        formatMonth(month);
    }

    if (contributionStatusEl) {
      contributionStatusEl.textContent =
        "—";
    }

    if (currentDueEl) {
      currentDueEl.textContent =
        money(0);
    }

    if (previousOutstandingEl) {
      previousOutstandingEl.textContent =
        money(0);
    }

    if (currentPaidEl) {
      currentPaidEl.textContent =
        money(0);
    }

    if (currentOutstandingEl) {
      currentOutstandingEl.textContent =
        money(0);
    }

    return;
  }

  const status =
    canonicalStatus.status;

  if (accountingMonthEl) {

    accountingMonthEl.textContent =
      formatMonth(month);

  }

  if (contributionStatusEl) {

    contributionStatusEl.textContent =
      statusLabel(status);

    contributionStatusEl.className =
      `obligation-value ${statusClass(status)}`;

  }

  if (currentDueEl) {

    currentDueEl.textContent =
      money(
        canonicalStatus.monthly_due
      );

  }

  if (previousOutstandingEl) {

    previousOutstandingEl.textContent =
      money(
        canonicalStatus.previous_outstanding
      );

  }

  if (currentPaidEl) {

    currentPaidEl.textContent =
      money(
        canonicalStatus.current_month_payment
      );

  }

  if (currentOutstandingEl) {

    currentOutstandingEl.textContent =
      money(
        canonicalStatus.current_outstanding
      );

  }

}


/* =========================================================
   RENDER CONTRIBUTION HISTORY
========================================================= */

function renderContributionHistory() {

  if (!contributionRowsEl) {
    return;
  }

  if (!contributions.length) {

    contributionRowsEl.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="member-empty">
            No contribution records found.
          </div>
        </td>
      </tr>
    `;

    return;
  }

  contributionRowsEl.innerHTML =
    contributions
      .map(
        contribution => {

          const reference =
            contribution.mpesa_reference ||
            contribution.reference ||
            "—";

          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    contribution.contribution_date
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    contribution.amount
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  contribution.contribution_type ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  contribution.payment_method ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  reference
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   SUMMARY
========================================================= */

function renderSummary() {

  const total =
    contributions.reduce(
      (
        sum,
        contribution
      ) =>
        sum +
        number(
          contribution.amount
        ),
      0
    );

  if (statementTotalEl) {

    statementTotalEl.textContent =
      money(total);

  }

  if (statementCountEl) {

    statementCountEl.textContent =
      String(
        contributions.length
      );

  }

}


/* =========================================================
   STATEMENT DATA
========================================================= */

function buildStatementHtml() {

  const memberName =
    currentMember?.full_name ||
    currentMember?.name ||
    currentMember?.member_name ||
    "Member";

  const memberNumber =
    currentMember?.member_number ||
    currentMember?.member_no ||
    currentMember?.id ||
    "—";

  const month =
    getCurrentMonth();

  const total =
    contributions.reduce(
      (
        sum,
        contribution
      ) =>
        sum +
        number(
          contribution.amount
        ),
      0
    );

  const status =
    canonicalStatus
      ? statusLabel(
          canonicalStatus.status
        )
      : "—";

  const rows =
    contributions.length
      ? contributions
          .map(
            contribution => {

              const reference =
                contribution.mpesa_reference ||
                contribution.reference ||
                "—";

              return `
                <tr>
                  <td>
                    ${escapeHtml(
                      formatDate(
                        contribution.contribution_date
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      money(
                        contribution.amount
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      contribution.contribution_type ||
                      "—"
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      contribution.payment_method ||
                      "—"
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      reference
                    )}
                  </td>
                </tr>
              `;

            }
          )
          .join("")
      : `
          <tr>
            <td colspan="5">
              No contribution records found.
            </td>
          </tr>
        `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>

  <meta charset="UTF-8">

  <title>
    CHAMA LIVE — Member Statement
  </title>

  <style>

    body {
      font-family:
        Arial,
        Helvetica,
        sans-serif;

      margin: 40px;

      color: #222;
    }

    h1 {
      margin-bottom: 4px;
    }

    .muted {
      color: #666;
    }

    .summary {
      display: grid;
      grid-template-columns:
        repeat(3, 1fr);

      gap: 12px;

      margin: 24px 0;
    }

    .summary-card {
      padding: 14px;
      border: 1px solid #ddd;
      border-radius: 8px;
    }

    .summary-card span {
      display: block;
      font-size: 12px;
      color: #666;
      margin-bottom: 5px;
    }

    .summary-card strong {
      font-size: 18px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }

    th,
    td {
      padding: 10px;
      border-bottom: 1px solid #ddd;
      text-align: left;
    }

    th {
      background: #f4f4f4;
    }

    @media print {

      body {
        margin: 20px;
      }

    }

  </style>

</head>

<body>

  <h1>
    CHAMA LIVE
  </h1>

  <p class="muted">
    Member Contribution Statement
  </p>

  <p>
    <strong>Member:</strong>
    ${escapeHtml(memberName)}
  </p>

  <p>
    <strong>Member Number:</strong>
    ${escapeHtml(memberNumber)}
  </p>

  <p>
    <strong>Statement Month:</strong>
    ${escapeHtml(
      formatMonth(month)
    )}
  </p>

  <div class="summary">

    <div class="summary-card">
      <span>
        Current Status
      </span>

      <strong>
        ${escapeHtml(status)}
      </strong>
    </div>

    <div class="summary-card">
      <span>
        Current Outstanding
      </span>

      <strong>
        ${escapeHtml(
          money(
            canonicalStatus?.current_outstanding
          )
        )}
      </strong>
    </div>

    <div class="summary-card">
      <span>
        Total Recorded
      </span>

      <strong>
        ${escapeHtml(
          money(total)
        )}
      </strong>
    </div>

  </div>

  <h2>
    Contribution History
  </h2>

  <table>

    <thead>

      <tr>
        <th>Date</th>
        <th>Amount</th>
        <th>Type</th>
        <th>Payment Method</th>
        <th>Reference</th>
      </tr>

    </thead>

    <tbody>
      ${rows}
    </tbody>

  </table>

</body>
</html>
  `;

}


/* =========================================================
   DOWNLOAD STATEMENT
========================================================= */

function downloadStatement() {

  const html =
    buildStatementHtml();

  const blob =
    new Blob(
      [html],
      {
        type:
          "text/html;charset=utf-8"
      }
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
    "chama-live-member-statement.html";

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
   PRINT / SAVE PDF
========================================================= */

function printStatement() {

  const html =
    buildStatementHtml();

  const printWindow =
    window.open(
      "",
      "_blank"
    );

  if (!printWindow) {

    throw new Error(
      "The browser blocked the statement window. Please allow pop-ups and try again."
    );

  }

  printWindow.document.open();

  printWindow.document.write(
    html
  );

  printWindow.document.close();

  printWindow.focus();

  setTimeout(
    () => {
      printWindow.print();
    },
    300
  );

}


/* =========================================================
   INITIALIZATION
========================================================= */

export async function initMemberContributions() {

  if (initialized) {
    return;
  }

  initialized =
    true;

  try {

    clearError();

    if (statusMessageEl) {

      statusMessageEl.textContent =
        "Loading your contribution records...";

    }

    currentMember =
      await getMyMember();

    if (!currentMember?.id) {

      throw new Error(
        "Your member account could not be resolved."
      );

    }

    groupId =
      currentMember.group_id;

    if (!groupId) {

      throw new Error(
        "Your group could not be resolved."
      );

    }

    await loadGroupName();

    const month =
      await loadCanonicalStatus();

    await loadContributions();

    renderCanonicalStatus(
      month
    );

    renderContributionHistory();

    renderSummary();

    if (statusMessageEl) {

      statusMessageEl.textContent =
        "Your contribution records are up to date.";

    }

  }
  catch (error) {

    initialized =
      false;

    showError(
      error
    );

  }

}


/* =========================================================
   EVENTS
========================================================= */

if (
  downloadStatementButton &&
  !downloadStatementButton.dataset.bound
) {

  downloadStatementButton.dataset.bound =
    "true";

  downloadStatementButton.addEventListener(
    "click",
    () => {

      try {

        downloadStatement();

      }
      catch (error) {

        showError(
          error
        );

      }

    }
  );

}


if (
  printStatementButton &&
  !printStatementButton.dataset.bound
) {

  printStatementButton.dataset.bound =
    "true";

  printStatementButton.addEventListener(
    "click",
    () => {

      try {

        printStatement();

      }
      catch (error) {

        showError(
          error
        );

      }

    }
  );

}


/* =========================================================
   DIRECT BOOT COMPATIBILITY
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      if (
        !window.__CHAMA_LIVE_LAYOUT_LOADING__
      ) {

        initMemberContributions();

      }

    },
    {
      once: true
    }
  );

}
else {

  if (
    !window.__CHAMA_LIVE_LAYOUT_LOADING__
  ) {

    initMemberContributions();

  }

}
