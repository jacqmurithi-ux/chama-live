/* =========================================================
   CHAMA LIVE — MEMBER CONTRIBUTIONS
   MEMBER-SAFE READ-ONLY CONTRIBUTION VIEW
========================================================= */

import { supabase } from "./supabase.js";

import {
  getMyApplicationContext
} from "./auth.js";


let initialized = false;

let currentUser = null;
let currentMember = null;
let currentGroup = null;

let groupId = null;
let memberId = null;

let contributions = [];
let canonicalStatus = null;
let accountingMonth = "";


/* =========================================================
   HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
}


function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


function number(value) {

  const result =
    Number(value);

  return Number.isFinite(result)
    ? result
    : 0;

}


function money(value) {

  return `KSh ${number(value).toLocaleString(
    "en-KE",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  )}`;

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
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );

}


function formatAccountingMonth(value) {

  if (
    !/^\d{4}-\d{2}$/.test(
      String(value || "")
    )
  ) {
    return value || "—";
  }

  const date =
    new Date(
      `${value}-01T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    "en-KE",
    {
      year: "numeric",
      month: "long"
    }
  );

}


function currentMonth() {

  const now =
    new Date();

  return [
    now.getFullYear(),
    String(
      now.getMonth() + 1
    ).padStart(2, "0")
  ].join("-");

}


function setText(
  id,
  value
) {

  const element =
    byId(id);

  if (element) {
    element.textContent =
      value;
  }

}


function showError(error) {

  const element =
    byId("memberError");

  if (!element) {
    return;
  }

  element.hidden = false;

  element.textContent =
    error?.message ||
    "Unable to load your contribution information.";

}


function clearError() {

  const element =
    byId("memberError");

  if (!element) {
    return;
  }

  element.hidden = true;
  element.textContent = "";

}


/* =========================================================
   STATUS DISPLAY
========================================================= */

function statusLabel(status) {

  const value =
    String(
      status || ""
    )
      .trim()
      .toLowerCase();

  const labels = {

    paid: "PAID",

    partial: "PARTIAL",

    outstanding: "OUTSTANDING",

    credit: "OVERPAID"

  };

  return (
    labels[value] ||
    (
      value
        ? value.toUpperCase()
        : "NOT SET"
    )
  );

}


function statusClass(status) {

  const value =
    String(
      status || ""
    )
      .trim()
      .toLowerCase();

  if (
    value === "paid"
  ) {
    return "status-paid";
  }

  if (
    value === "partial"
  ) {
    return "status-partial";
  }

  if (
    value === "outstanding"
  ) {
    return "status-outstanding";
  }

  if (
    value === "credit"
  ) {
    return "status-credit";
  }

  return "status-neutral";

}


/* =========================================================
   ACCOUNTING CONTEXT
========================================================= */

async function loadContext() {

  const context =
    await getMyApplicationContext();

  currentUser =
    context?.user || null;

  currentMember =
    context?.member || null;

  currentGroup =
    context?.group || null;

  groupId =
    currentMember?.group_id ||
    currentGroup?.id ||
    null;

  memberId =
    currentMember?.id ||
    null;

  if (!groupId) {
    throw new Error(
      "Your group could not be resolved."
    );
  }

  if (!memberId) {
    throw new Error(
      "Your member record could not be resolved."
    );
  }

  accountingMonth =
    currentMonth();

}


/* =========================================================
   MEMBER CONTRIBUTIONS
========================================================= */

async function loadContributions() {

  const {
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select(`
        id,
        member_id,
        amount,
        contribution_type,
        contribution_date,
        payment_method,
        reference,
        mpesa_reference,
        created_at,
        notes
      `)
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "member_id",
        memberId
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
    data || [];

}


/* =========================================================
   CANONICAL OBLIGATION STATUS
========================================================= */

async function loadCanonicalStatus() {

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

  const rows =
    data || [];

  canonicalStatus =
    rows.find(
      row =>
        String(
          row.member_id
        ) ===
        String(
          memberId
        )
    ) || null;

}


/* =========================================================
   ACCOUNTING STATUS
========================================================= */

function renderCanonicalStatus() {

  setText(
    "accountingMonth",
    formatAccountingMonth(
      accountingMonth
    )
  );

  if (!canonicalStatus) {

    setText(
      "currentDue",
      "KSh 0.00"
    );

    setText(
      "previousOutstanding",
      "KSh 0.00"
    );

    setText(
      "currentPaid",
      "KSh 0.00"
    );

    setText(
      "carryForward",
      "KSh 0.00"
    );

    setText(
      "currentOutstanding",
      "KSh 0.00"
    );

    const status =
      byId(
        "obligationStatus"
      );

    if (status) {

      status.textContent =
        "NOT AVAILABLE";

      status.className =
        "member-status status-neutral";

    }

    return;
  }


  setText(
    "currentDue",
    money(
      canonicalStatus.monthly_due
    )
  );

  setText(
    "previousOutstanding",
    money(
      canonicalStatus.previous_outstanding
    )
  );

  setText(
    "currentPaid",
    money(
      canonicalStatus.current_month_payment
    )
  );

  setText(
    "carryForward",
    money(
      canonicalStatus.carry_forward
    )
  );

  setText(
    "currentOutstanding",
    money(
      canonicalStatus.current_outstanding
    )
  );


  const status =
    byId(
      "obligationStatus"
    );

  if (status) {

    status.textContent =
      statusLabel(
        canonicalStatus.status
      );

    status.className =
      `member-status ${
        statusClass(
          canonicalStatus.status
        )
      }`;

  }

}


/* =========================================================
   CONTRIBUTION HISTORY
========================================================= */

function contributionTypeLabel(
  value
) {

  const type =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  const labels = {

    monthly: "Monthly",

    welfare: "Welfare",

    emergency: "Emergency",

    fundraising: "Fundraising",

    project: "Project",

    event: "Event",

    fine: "Fine",

    other: "Other"

  };

  return (
    labels[type] ||
    (
      type
        ? type.charAt(0).toUpperCase() +
          type.slice(1)
        : "—"
    )
  );

}


function paymentMethodLabel(
  value
) {

  const method =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  if (
    method === "mpesa" ||
    method === "m-pesa" ||
    method === "m_pesa"
  ) {
    return "M-Pesa";
  }

  if (
    method === "bank" ||
    method === "bank transfer" ||
    method === "bank_transfer"
  ) {
    return "Bank transfer";
  }

  if (
    method === "cash"
  ) {
    return "Cash";
  }

  return value || "—";

}


function renderContributions() {

  const rows =
    byId(
      "memberContributionRows"
    );

  if (!rows) {
    return;
  }


  if (!contributions.length) {

    rows.innerHTML = `
      <tr>
        <td colspan="5">
          No contribution records found.
        </td>
      </tr>
    `;

    return;
  }


  rows.innerHTML =
    contributions
      .map(
        item => {

          const reference =
            item.mpesa_reference ||
            item.reference ||
            "—";

          return `
            <tr>

              <td data-label="Date">
                ${escapeHtml(
                  formatDate(
                    item.contribution_date ||
                    item.created_at
                  )
                )}
              </td>

              <td
                data-label="Amount"
                class="money"
              >
                ${escapeHtml(
                  money(
                    item.amount
                  )
                )}
              </td>

              <td data-label="Type">
                ${escapeHtml(
                  contributionTypeLabel(
                    item.contribution_type
                  )
                )}
              </td>

              <td data-label="Payment Method">
                ${escapeHtml(
                  paymentMethodLabel(
                    item.payment_method
                  )
                )}
              </td>

              <td data-label="Reference">
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
        item
      ) =>
        sum +
        number(
          item.amount
        ),
      0
    );

  setText(
    "totalContributions",
    money(total)
  );

  setText(
    "contributionCount",
    String(
      contributions.length
    )
  );

}


/* =========================================================
   GROUP / MEMBER HEADER
========================================================= */

function renderHeader() {

  setText(
    "memberGroupName",
    currentGroup?.name ||
    currentGroup?.group_name ||
    "CHAMA"
  );

}


/* =========================================================
   STATEMENT HTML
========================================================= */

function buildStatementHtml() {

  const memberName =
    currentMember?.name ||
    currentMember?.full_name ||
    "Member";

  const memberNumber =
    currentMember?.member_number ||
    currentMember?.member_no ||
    currentMember?.id ||
    "—";

  const groupName =
    currentGroup?.name ||
    currentGroup?.group_name ||
    "CHAMA";

  const status =
    canonicalStatus
      ? statusLabel(
          canonicalStatus.status
        )
      : "NOT AVAILABLE";

  const total =
    contributions.reduce(
      (
        sum,
        item
      ) =>
        sum +
        number(item.amount),
      0
    );


  const rows =
    contributions
      .map(
        item => {

          const reference =
            item.mpesa_reference ||
            item.reference ||
            "—";

          return `
            <tr>
              <td>
                ${escapeHtml(
                  formatDate(
                    item.contribution_date ||
                    item.created_at
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(item.amount)
                )}
              </td>

              <td>
                ${escapeHtml(
                  contributionTypeLabel(
                    item.contribution_type
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  paymentMethodLabel(
                    item.payment_method
                  )
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


  return `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Member Statement — CHAMA LIVE</title>

<style>

body {
  font-family: Arial, sans-serif;
  margin: 40px;
  color: #111827;
}

h1 {
  margin-bottom: 4px;
}

.meta {
  color: #475569;
  margin-bottom: 24px;
}

.summary {
  display: grid;
  grid-template-columns:
    repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.box {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 12px;
}

.label {
  display: block;
  color: #64748b;
  font-size: 11px;
  margin-bottom: 4px;
}

.value {
  font-weight: 700;
  font-size: 18px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 9px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
}

th {
  font-size: 12px;
  color: #475569;
}

.footer {
  margin-top: 30px;
  font-size: 11px;
  color: #64748b;
}

</style>
</head>

<body>

<h1>Member Contribution Statement</h1>

<div class="meta">

  <strong>
    ${escapeHtml(groupName)}
  </strong>

  <br>

  Member:
  ${escapeHtml(memberName)}

  <br>

  Member number:
  ${escapeHtml(memberNumber)}

  <br>

  Statement month:
  ${escapeHtml(
    formatAccountingMonth(
      accountingMonth
    )
  )}

</div>


<div class="summary">

  <div class="box">

    <span class="label">
      Obligation status
    </span>

    <span class="value">
      ${escapeHtml(status)}
    </span>

  </div>


  <div class="box">

    <span class="label">
      Current due
    </span>

    <span class="value">
      ${escapeHtml(
        money(
          canonicalStatus?.monthly_due
        )
      )}
    </span>

  </div>


  <div class="box">

    <span class="label">
      Current paid
    </span>

    <span class="value">
      ${escapeHtml(
        money(
          canonicalStatus?.current_month_payment
        )
      )}
    </span>

  </div>


  <div class="box">

    <span class="label">
      Outstanding
    </span>

    <span class="value">
      ${escapeHtml(
        money(
          canonicalStatus?.current_outstanding
        )
      )}
    </span>

  </div>


  <div class="box">

    <span class="label">
      Total recorded contributions
    </span>

    <span class="value">
      ${escapeHtml(
        money(total)
      )}
    </span>

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

${
  rows ||
  `
    <tr>
      <td colspan="5">
        No contribution records.
      </td>
    </tr>
  `
}

</tbody>

</table>


<div class="footer">

  Generated from CHAMA LIVE member records.

</div>

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
        type: "text/html;charset=utf-8"
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );

  const safeMember =
    String(
      currentMember?.name ||
      "member"
    )
      .trim()
      .replace(
        /[^a-z0-9]+/gi,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .toLowerCase();

  link.href =
    url;

  link.download =
    `chama-live-${safeMember || "member"}-statement.html`;

  document.body.appendChild(
    link
  );

  link.click();

  link.remove();

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
      "_blank",
      "noopener,noreferrer"
    );

  if (!printWindow) {

    throw new Error(
      "Please allow pop-ups to print your statement."
    );

  }

  printWindow.document.open();

  printWindow.document.write(
    html
  );

  printWindow.document.close();

  printWindow.focus();

  setTimeout(
    function () {

      printWindow.print();

    },
    300
  );

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initMemberContributions() {

  if (initialized) {
    return;
  }

  initialized =
    true;

  try {

    clearError();


    await loadContext();

    renderHeader();


    await Promise.all([
      loadContributions(),
      loadCanonicalStatus()
    ]);


    renderCanonicalStatus();

    renderContributions();

    renderSummary();


    const loading =
      byId(
        "memberLoading"
      );

    if (loading) {
      loading.hidden = true;
    }


    console.log(
      "CHAMA LIVE: Member Contributions ready.",
      {
        groupId,
        memberId,
        accountingMonth
      }
    );

  }
  catch (error) {

    initialized =
      false;

    showError(error);

  }

}


/* =========================================================
   EVENTS
========================================================= */

const downloadButton =
  byId(
    "downloadStatement"
  );

if (downloadButton) {

  downloadButton.addEventListener(
    "click",
    function () {

      try {

        downloadStatement();

      }
      catch (error) {

        showError(error);

      }

    }
  );

}


const printButton =
  byId(
    "printStatement"
  );

if (printButton) {

  printButton.addEventListener(
    "click",
    function () {

      try {

        printStatement();

      }
      catch (error) {

        showError(error);

      }

    }
  );

}


/* =========================================================
   BOOT
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    function () {

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


console.log(
  "CHAMA LIVE: member-contributions.js loaded"
);
