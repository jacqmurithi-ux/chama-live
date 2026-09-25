/* =========================================================
   CHAMA LIVE — MEMBER CONTRIBUTIONS
   ---------------------------------------------------------
   MEMBER PORTAL

   PURPOSE
   ---------------------------------------------------------
   • Show the authenticated member's own contribution records.
   • Show the canonical monthly contribution position.
   • Allow the member to submit payment evidence.
   • Show submitted payment evidence and verification status.
   • Provide a printable/downloadable personal statement.

   SECURITY CONTRACT
   ---------------------------------------------------------
   • Member identity comes from the authenticated session.
   • Member/group context is resolved through getMyMember().
   • group_id is never accepted from the URL or form.
   • Contributions are SELECT-only from this page.
   • Payment evidence is inserted into the existing
     member_payment_evidence table.
   • Payment evidence remains pending until authorised
     verification occurs.
   • This page never inserts directly into contributions.
   • Canonical contribution status comes from
     get_canonical_member_monthly_status().

   DATABASE
   ---------------------------------------------------------
   NO NEW RPC
   NO NEW TABLE
   NO SCHEMA CHANGE
========================================================= */

import {
  supabase
} from "./supabase.js";

import {
  getMyMember
} from "./auth.js";


console.log(
  "CHAMA LIVE: member-contributions.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const loadingEl =
  document.getElementById(
    "memberContributionLoading"
  );

const errorEl =
  document.getElementById(
    "memberContributionError"
  );

const successEl =
  document.getElementById(
    "memberContributionSuccess"
  );

const contentEl =
  document.getElementById(
    "memberContributionContent"
  );

const subtitleEl =
  document.getElementById(
    "memberContributionSubtitle"
  );


/* =========================================================
   CANONICAL CONTRIBUTION POSITION
========================================================= */

const accountingMonthEl =
  document.getElementById(
    "memberAccountingMonth"
  );

const statusEl =
  document.getElementById(
    "memberContributionStatus"
  );

const currentDueEl =
  document.getElementById(
    "memberCurrentDue"
  );

const previousOutstandingEl =
  document.getElementById(
    "memberPreviousOutstanding"
  );

const currentPaidEl =
  document.getElementById(
    "memberCurrentPaid"
  );

const outstandingEl =
  document.getElementById(
    "memberOutstanding"
  );


/* =========================================================
   STATEMENT
========================================================= */

const statementTotalEl =
  document.getElementById(
    "memberStatementTotal"
  );

const statementCountEl =
  document.getElementById(
    "memberStatementCount"
  );

const statementButton =
  document.getElementById(
    "downloadMemberStatement"
  );

const printButton =
  document.getElementById(
    "printMemberStatement"
  );


/* =========================================================
   CONTRIBUTION HISTORY
========================================================= */

const contributionRows =
  document.getElementById(
    "memberContributionRows"
  );


/* =========================================================
   PAYMENT EVIDENCE
========================================================= */

const paymentEvidenceForm =
  document.getElementById(
    "memberPaymentEvidenceForm"
  );

const evidenceAmount =
  document.getElementById(
    "memberEvidenceAmount"
  );

const evidenceDate =
  document.getElementById(
    "memberEvidenceDate"
  );

const evidenceMethod =
  document.getElementById(
    "memberEvidenceMethod"
  );

const evidenceMpesaWrap =
  document.getElementById(
    "memberEvidenceMpesaWrap"
  );

const evidenceMpesaReference =
  document.getElementById(
    "memberEvidenceMpesaReference"
  );

const evidenceText =
  document.getElementById(
    "memberEvidenceText"
  );

const submitEvidenceButton =
  document.getElementById(
    "submitMemberPaymentEvidence"
  );

const evidenceRows =
  document.getElementById(
    "memberPaymentEvidenceRows"
  );

const evidenceMessage =
  document.getElementById(
    "memberEvidenceMessage"
  );


/* =========================================================
   STATE
========================================================= */

let currentMember = null;

let groupId = null;

let group = null;

let contributions = [];

let recognizedPaymentTotal = 0;

let memberPaymentEvidence = [];

let canonicalStatus = null;

let accountingMonth =
  getCurrentMonth();

let initialized = false;


/* =========================================================
   CONSTANTS
========================================================= */

const PAYMENT_METHODS = {
  MPESA: "M-Pesa",
  CASH: "Cash",
  BANK: "Bank transfer"
};

const MEMBER_EVIDENCE_STATUSES = {
  PENDING: "pending",
  VERIFIED: "verified",
  REJECTED: "rejected"
};


/* =========================================================
   BASIC HELPERS
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


function todayString() {

  const now =
    new Date();

  return [
    now.getFullYear(),
    String(
      now.getMonth() + 1
    ).padStart(2, "0"),
    String(
      now.getDate()
    ).padStart(2, "0")
  ].join("-");

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


function formatAccountingMonth(
  month
) {

  if (
    !/^\d{4}-\d{2}$/.test(
      String(month || "")
    )
  ) {

    return String(
      month || ""
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


function normalizePaymentMethod(
  value
) {

  const raw =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  if (
    raw === "m-pesa" ||
    raw === "mpesa" ||
    raw === "m_pesa"
  ) {

    return PAYMENT_METHODS.MPESA;

  }

  if (
    raw === "cash"
  ) {

    return PAYMENT_METHODS.CASH;

  }

  if (
    raw === "bank" ||
    raw === "bank transfer" ||
    raw === "bank_transfer"
  ) {

    return PAYMENT_METHODS.BANK;

  }

  return String(
    value || ""
  ).trim();

}


function getMemberRole() {

  return String(
    currentMember?.role || ""
  )
    .trim()
    .toLowerCase();

}


function isOrdinaryMember() {

  return (
    getMemberRole() ===
    "member"
  );

}


/* =========================================================
   PAGE MESSAGE HELPERS
========================================================= */

function showError(
  message
) {

  console.error(
    "CHAMA LIVE Member Contributions:",
    message
  );

  if (errorEl) {

    errorEl.textContent =
      message || "Something went wrong.";

    errorEl.hidden =
      false;

  }

  if (loadingEl) {

    loadingEl.hidden =
      true;

  }

}


function clearError() {

  if (errorEl) {

    errorEl.hidden =
      true;

    errorEl.textContent =
      "";

  }

}


function showSuccess(
  message
) {

  if (!successEl) {
    return;
  }

  successEl.textContent =
    message || "";

  successEl.hidden =
    !message;

}


function clearSuccess() {

  showSuccess("");

}


function showEvidenceMessage(
  message
) {

  if (!evidenceMessage) {
    return;
  }

  evidenceMessage.textContent =
    message || "";

  evidenceMessage.hidden =
    !message;

}


/* =========================================================
   GROUP CONTEXT
========================================================= */

async function loadGroupContext() {

  currentMember =
    await getMyMember();

  if (!currentMember?.id) {

    throw new Error(
      "Your member account could not be resolved."
    );

  }

  if (
    !currentMember.group_id
  ) {

    throw new Error(
      "Your group could not be resolved."
    );

  }

  groupId =
    currentMember.group_id;


  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select(
        `
          id,
          name,
          monthly_contribution
        `
      )
      .eq(
        "id",
        groupId
      )
      .maybeSingle();


  if (error) {

    throw error;

  }

  group =
    data || null;

}


/* =========================================================
   CONTRIBUTIONS
   ---------------------------------------------------------
   RECOGNIZED PAYMENT / HISTORY LAYER

   Uses the existing server-authorized RPC rather than
   directly querying contributions from the browser.

   This remains separate from canonical monthly accounting.
========================================================= */

async function loadMyContributions() {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_member_payment_statement",
      {
        p_member_id:
          currentMember.id,

        p_from_date:
          null,

        p_to_date:
          null
      }
    );


  if (error) {

    throw error;

  }


  contributions =
    (
      Array.isArray(data)
        ? data
        : []
    )
      .map(
        payment => ({

          id:
            payment.payment_id,

          group_id:
            payment.group_id,

          member_id:
            payment.member_id,

          amount:
            payment.amount,

          contribution_type:
            payment.contribution_type,

          /*
           * The payment statement RPC does not return
           * the legacy month field.
           */
          month:
            null,

          payment_method:
            payment.payment_method,

          reference:
            payment.reference,

          created_at:
            payment.created_at,

          contribution_date:
            payment.payment_date,

          notes:
            payment.notes,

          mpesa_reference:
            payment.mpesa_reference

        })
      );

}


/* =========================================================
   RECOGNIZED PAYMENT TOTAL
   ---------------------------------------------------------
   Separate from canonical monthly accounting.

   Uses the server-recognized payment total instead of
   summing contribution rows in the browser.
========================================================= */

async function loadRecognizedPaymentTotal() {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_member_total_recognized_payments",
      {
        p_member_id:
          currentMember.id
      }
    );


  if (error) {

    throw error;

  }


  const row =
    Array.isArray(data)
      ? data[0] || null
      : data || null;


  recognizedPaymentTotal =
    number(
      row?.total_recognized
    );

}


/* =========================================================
   CANONICAL MEMBER STATUS
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
    Array.isArray(data)
      ? data
      : data
        ? [data]
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
    ) ||
    null;

}


/* =========================================================
   PAYMENT EVIDENCE
   EXACT EXISTING CONTRACT
========================================================= */

async function loadMemberPaymentEvidence() {

  memberPaymentEvidence =
    [];

  if (
    !currentMember?.id ||
    !groupId
  ) {

    renderPaymentEvidence();

    return;

  }


  const {
    data,
    error
  } =
    await supabase
      .from(
        "member_payment_evidence"
      )
      .select(
        `
          id,
          group_id,
          member_id,
          amount,
          payment_method,
          mpesa_reference,
          payment_date,
          evidence_text,
          status,
          submitted_at,
          verified_at,
          rejection_reason,
          contribution_id
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
        "submitted_at",
        {
          ascending: false
        }
      );


  if (error) {

    throw error;

  }

  memberPaymentEvidence =
    data || [];

  renderPaymentEvidence();

}


/* =========================================================
   PAYMENT EVIDENCE FORM
========================================================= */

function updateEvidencePaymentMethod() {

  const method =
    normalizePaymentMethod(
      evidenceMethod?.value
    );

  const isMpesa =
    method ===
    PAYMENT_METHODS.MPESA;


  if (evidenceMpesaWrap) {

    evidenceMpesaWrap.hidden =
      !isMpesa;

  }


  if (evidenceMpesaReference) {

    evidenceMpesaReference.required =
      isMpesa;

    if (!isMpesa) {

      evidenceMpesaReference.value =
        "";

    }

  }

}


async function submitMemberPaymentEvidence(
  event
) {

  event.preventDefault();

  clearError();
  clearSuccess();
  showEvidenceMessage("");


  if (!isOrdinaryMember()) {

    showEvidenceMessage(
      "Payment evidence submission is available to ordinary members."
    );

    return;

  }


  if (
    !currentMember?.id ||
    !groupId
  ) {

    showEvidenceMessage(
      "Your active member account could not be resolved."
    );

    return;

  }


  const amount =
    number(
      evidenceAmount?.value
    );

  const paymentDate =
    evidenceDate?.value ||
    "";

  const paymentMethod =
    normalizePaymentMethod(
      evidenceMethod?.value
    );

  const mpesaReference =
    evidenceMpesaReference?.value
      ?.trim() ||
    "";

  const evidenceDetails =
    evidenceText?.value
      ?.trim() ||
    "";


  if (
    amount <= 0
  ) {

    showEvidenceMessage(
      "Please enter a valid payment amount greater than zero."
    );

    evidenceAmount?.focus();

    return;

  }


  if (!paymentDate) {

    showEvidenceMessage(
      "Please select the payment date."
    );

    evidenceDate?.focus();

    return;

  }


  if (!paymentMethod) {

    showEvidenceMessage(
      "Please select the payment method."
    );

    evidenceMethod?.focus();

    return;

  }


  if (
    paymentMethod ===
      PAYMENT_METHODS.MPESA &&
    !mpesaReference
  ) {

    showEvidenceMessage(
      "Please enter the M-Pesa reference."
    );

    evidenceMpesaReference?.focus();

    return;

  }


  if (!evidenceDetails) {

    showEvidenceMessage(
      "Please provide payment details."
    );

    evidenceText?.focus();

    return;

  }


  if (submitEvidenceButton) {

    submitEvidenceButton.disabled =
      true;

    submitEvidenceButton.textContent =
      "Submitting...";

  }


  try {

    /*
     * EXISTING MEMBER PAYMENT EVIDENCE
     * WRITE CONTRACT
     *
     * This creates only a pending evidence
     * record.
     *
     * It does NOT create a contribution.
     */

    const {
      error
    } =
      await supabase
        .from(
          "member_payment_evidence"
        )
        .insert({
          group_id:
            groupId,

          member_id:
            currentMember.id,

          amount:
            amount,

          payment_method:
            paymentMethod,

          mpesa_reference:
            paymentMethod ===
              PAYMENT_METHODS.MPESA
              ? mpesaReference
              : null,

          payment_date:
            paymentDate,

          evidence_text:
            evidenceDetails,

          status:
            MEMBER_EVIDENCE_STATUSES.PENDING
        });


    if (error) {

      throw error;

    }


    if (paymentEvidenceForm) {

      paymentEvidenceForm.reset();

    }


    if (evidenceDate) {

      evidenceDate.value =
        todayString();

    }


    if (evidenceMethod) {

      evidenceMethod.value =
        PAYMENT_METHODS.MPESA;

    }


    updateEvidencePaymentMethod();


    await loadMemberPaymentEvidence();


    showEvidenceMessage(
      "Payment evidence submitted successfully. It is now pending verification."
    );


    showSuccess(
      "Payment evidence submitted and is pending verification."
    );

  }
  catch (error) {

    console.error(
      "CHAMA LIVE payment evidence error:",
      error
    );

    showEvidenceMessage(
      error?.message ||
      "Unable to submit payment evidence."
    );

  }
  finally {

    if (submitEvidenceButton) {

      submitEvidenceButton.disabled =
        false;

      submitEvidenceButton.textContent =
        "Submit Payment Evidence";

    }

  }

}
/* =========================================================
   STATUS LABEL
========================================================= */

function statusLabel(
  status
) {

  const value =
    String(
      status || ""
    )
      .trim()
      .toLowerCase();

  if (
    value === "paid"
  ) {

    return "PAID";

  }

  if (
    value === "partial"
  ) {

    return "PARTIAL";

  }

  if (
    value === "credit"
  ) {

    return "OVERPAID";

  }

  return "OUTSTANDING";

}


function statusClass(
  status
) {

  const value =
    String(
      status || ""
    )
      .trim()
      .toLowerCase();

  if (
    value === "paid"
  ) {

    return "cl-status-paid";

  }

  if (
    value === "partial"
  ) {

    return "cl-status-partial";

  }

  if (
    value === "credit"
  ) {

    return "cl-status-credit";

  }

  return "cl-status-outstanding";

}


/* =========================================================
   RENDER CANONICAL POSITION
========================================================= */

function renderCanonicalPosition() {

  if (!canonicalStatus) {

    if (statusEl) {

      statusEl.textContent =
        "OUTSTANDING";

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

    if (outstandingEl) {

      outstandingEl.textContent =
        money(0);

    }

    return;

  }


  const status =
    statusLabel(
      canonicalStatus.status
    );


  if (accountingMonthEl) {

    accountingMonthEl.textContent =
      formatAccountingMonth(
        accountingMonth
      );

  }


  if (statusEl) {

    statusEl.textContent =
      status;

    statusEl.className =
      statusClass(
        canonicalStatus.status
      );

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


  if (outstandingEl) {

    outstandingEl.textContent =
      money(
        canonicalStatus.current_outstanding
      );

  }

}


/* =========================================================
   RENDER CONTRIBUTION HISTORY
========================================================= */

function renderContributionHistory() {

  if (!contributionRows) {
    return;
  }


  if (!contributions.length) {

    contributionRows.innerHTML = `
      <tr>
        <td
          colspan="6"
          class="cl-empty"
        >
          No contribution records found.
        </td>
      </tr>
    `;

    return;

  }


  contributionRows.innerHTML =
    contributions
      .map(
        contribution => {

          const method =
            normalizePaymentMethod(
              contribution.payment_method
            );

          const reference =
            contribution.mpesa_reference ||
            contribution.reference ||
            "—";

          return `
            <tr>

              <td data-label="Date">
                ${escapeHtml(
                  formatDate(
                    contribution.contribution_date ||
                    contribution.created_at
                  )
                )}
              </td>

              <td
                data-label="Amount"
                class="cl-money-cell"
              >
                <strong>
                  ${escapeHtml(
                    money(
                      contribution.amount
                    )
                  )}
                </strong>
              </td>

              <td data-label="Type">
                ${escapeHtml(
                  contribution.contribution_type ||
                  "—"
                )}
              </td>

              <td data-label="Payment Method">
                ${escapeHtml(
                  method || "—"
                )}
              </td>

              <td data-label="Reference">
                ${escapeHtml(
                  reference
                )}
              </td>

              <td data-label="Notes">
                ${escapeHtml(
                  contribution.notes ||
                  "—"
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   RENDER PAYMENT EVIDENCE
========================================================= */

function evidenceStatusLabel(
  status
) {

  const value =
    String(
      status || ""
    )
      .trim()
      .toLowerCase();

  if (
    value ===
    MEMBER_EVIDENCE_STATUSES.VERIFIED
  ) {

    return "VERIFIED";

  }

  if (
    value ===
    MEMBER_EVIDENCE_STATUSES.REJECTED
  ) {

    return "REJECTED";

  }

  return "PENDING";

}


function evidenceStatusClass(
  status
) {

  const value =
    String(
      status || ""
    )
      .trim()
      .toLowerCase();

  if (
    value ===
    MEMBER_EVIDENCE_STATUSES.VERIFIED
  ) {

    return "cl-evidence-status-verified";

  }

  if (
    value ===
    MEMBER_EVIDENCE_STATUSES.REJECTED
  ) {

    return "cl-evidence-status-rejected";

  }

  return "cl-evidence-status-pending";

}


function renderPaymentEvidence() {

  if (!evidenceRows) {
    return;
  }


  if (!memberPaymentEvidence.length) {

    evidenceRows.innerHTML = `
      <tr>
        <td
          colspan="7"
          class="cl-evidence-empty"
        >
          You have not submitted any payment
          evidence yet.
        </td>
      </tr>
    `;

    return;

  }


  evidenceRows.innerHTML =
    memberPaymentEvidence
      .map(
        evidence => {

          const method =
            normalizePaymentMethod(
              evidence.payment_method
            );

          const status =
            evidenceStatusLabel(
              evidence.status
            );

          const reference =
            evidence.mpesa_reference ||
            "—";

          const rejectionReason =
            evidence.rejection_reason ||
            "";


          return `
            <tr>

              <td data-label="Date">
                ${escapeHtml(
                  formatDate(
                    evidence.payment_date
                  )
                )}
              </td>

              <td
                data-label="Amount"
                class="cl-money-cell"
              >
                <strong>
                  ${escapeHtml(
                    money(
                      evidence.amount
                    )
                  )}
                </strong>
              </td>

              <td data-label="Method">
                ${escapeHtml(
                  method || "—"
                )}
              </td>

              <td data-label="Reference">
                ${escapeHtml(
                  reference
                )}
              </td>

              <td data-label="Submitted">
                ${escapeHtml(
                  formatDate(
                    evidence.submitted_at
                  )
                )}
              </td>

              <td data-label="Status">
                <span
                  class="
                    cl-evidence-status-badge
                    ${evidenceStatusClass(
                      evidence.status
                    )}
                  "
                >
                  ${escapeHtml(
                    status
                  )}
                </span>
              </td>

              <td data-label="Details">
                ${escapeHtml(
                  rejectionReason ||
                  evidence.evidence_text ||
                  "Payment submitted for verification."
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   STATEMENT DATA
========================================================= */

function getRecordedTotal() {

  return recognizedPaymentTotal;

}


function renderStatementSummary() {

  if (statementTotalEl) {

    statementTotalEl.textContent =
      money(
        getRecordedTotal()
      );

  }


  if (statementCountEl) {

    statementCountEl.textContent =
      String(
        contributions.length
      );

  }

}


/* =========================================================
   STATEMENT HTML
========================================================= */

function buildStatementHtml() {

  const memberName =
    currentMember?.full_name ||
    currentMember?.name ||
    currentMember?.member_name ||
    "Member";


  const groupName =
    group?.name ||
    "CHAMA LIVE Group";


  const total =
    getRecordedTotal();


  const position =
    canonicalStatus || {};


  const contributionRowsHtml =
    contributions.length
      ? contributions
          .map(
            contribution => {

              const method =
                normalizePaymentMethod(
                  contribution.payment_method
                );

              const reference =
                contribution.mpesa_reference ||
                contribution.reference ||
                "—";

              return `
                <tr>
                  <td>
                    ${escapeHtml(
                      formatDate(
                        contribution.contribution_date ||
                        contribution.created_at
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
                      method || "—"
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

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>

<title>
  My Contribution Statement
</title>

<style>

  body {
    font-family:
      Arial,
      Helvetica,
      sans-serif;

    color: #222;

    margin: 32px;

    line-height: 1.5;
  }

  h1 {
    margin-bottom: 4px;
  }

  h2 {
    margin-top: 28px;
  }

  .muted {
    color: #666;
  }

  .summary {
    display: grid;
    grid-template-columns:
      repeat(4, 1fr);

    gap: 12px;

    margin: 24px 0;
  }

  .card {
    border:
      1px solid #ddd;

    border-radius: 8px;

    padding: 14px;
  }

  .card span {
    display: block;

    color: #666;

    font-size: 12px;
  }

  .card strong {
    display: block;

    font-size: 20px;

    margin-top: 5px;
  }

  table {
    width: 100%;

    border-collapse:
      collapse;

    margin-top: 12px;
  }

  th,
  td {
    border-bottom:
      1px solid #ddd;

    padding: 9px;

    text-align: left;

    vertical-align: top;
  }

  th {
    background:
      #f5f5f5;
  }

  @media print {

    body {
      margin: 12mm;
    }

    .no-print {
      display: none;
    }

  }

</style>

</head>

<body>

  <h1>
    My Contribution Statement
  </h1>

  <p class="muted">
    ${escapeHtml(groupName)}
  </p>

  <p>
    Member:
    <strong>
      ${escapeHtml(memberName)}
    </strong>
  </p>

  <p>
    Generated:
    ${escapeHtml(
      formatDate(
        new Date()
      )
    )}
  </p>


  <div class="summary">

    <div class="card">

      <span>
        Current Due
      </span>

      <strong>
        ${escapeHtml(
          money(
            position.monthly_due
          )
        )}
      </strong>

    </div>


    <div class="card">

      <span>
        Previous Outstanding
      </span>

      <strong>
        ${escapeHtml(
          money(
            position.previous_outstanding
          )
        )}
      </strong>

    </div>


    <div class="card">

      <span>
        Current Paid
      </span>

      <strong>
        ${escapeHtml(
          money(
            position.current_month_payment
          )
        )}
      </strong>

    </div>


    <div class="card">

      <span>
        Outstanding
      </span>

      <strong>
        ${escapeHtml(
          money(
            position.current_outstanding
          )
        )}
      </strong>

    </div>

  </div>


  <p>
    Accounting month:
    <strong>
      ${escapeHtml(
        formatAccountingMonth(
          accountingMonth
        )
      )}
    </strong>
  </p>

  <p>
    Status:
    <strong>
      ${escapeHtml(
        statusLabel(
          position.status
        )
      )}
    </strong>
  </p>


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
      ${contributionRowsHtml}
    </tbody>

  </table>


  <p class="muted">

    Total recorded contributions:
    <strong>
      ${escapeHtml(
        money(total)
      )}
    </strong>

  </p>


  <p class="muted">

    Payment evidence that has not yet been
    verified is not included in the recorded
    contribution total.

  </p>

</body>
</html>
  `;

}


/* =========================================================
   DOWNLOAD / PRINT STATEMENT
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
    "my-contribution-statement.html";


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


function printStatement() {

  const html =
    buildStatementHtml();


  const printWindow =
    window.open(
      "",
      "_blank"
    );


  if (!printWindow) {

    showError(
      "Please allow pop-ups to print your statement."
    );

    return;

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
   PAGE STATE
========================================================= */

function showPageContent() {

  if (loadingEl) {

    loadingEl.hidden =
      true;

  }

  if (contentEl) {

    contentEl.hidden =
      false;

  }

}


function setMemberSubtitle() {

  if (!subtitleEl) {
    return;
  }

  const groupName =
    group?.name ||
    "your group";


  subtitleEl.textContent =
    `${groupName} — your contribution record`;

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
    clearSuccess();
    showEvidenceMessage("");


    if (loadingEl) {

      loadingEl.hidden =
        false;

    }


    if (contentEl) {

      contentEl.hidden =
        true;

    }


    /*
     * Resolve authenticated member.
     * No group_id is accepted from the page.
     */

    await loadGroupContext();


    /*
     * This page is intended for ordinary members.
     * layout.js provides the portal boundary, but
     * this page also protects its own workflow.
     */

    if (!isOrdinaryMember()) {

      throw new Error(
        "This page is available to ordinary members."
      );

    }


    accountingMonth =
      getCurrentMonth();


    if (evidenceDate) {

      evidenceDate.value =
        todayString();

    }


    if (evidenceMethod) {

      evidenceMethod.value =
        PAYMENT_METHODS.MPESA;

    }


    updateEvidencePaymentMethod();


    setMemberSubtitle();


    await Promise.all([
      loadMyContributions(),
      loadRecognizedPaymentTotal(),
      loadCanonicalStatus(),
      loadMemberPaymentEvidence()
    ]);


    renderCanonicalPosition();

    renderContributionHistory();

    renderPaymentEvidence();

    renderStatementSummary();

    showPageContent();


    console.log(
      "CHAMA LIVE: Member Contributions ready.",
      {
        groupId,
        memberId:
          currentMember.id,
        accountingMonth
      }
    );

  }
  catch (error) {

    initialized =
      false;

    showError(
      error?.message ||
      "Unable to load your contribution records."
    );

  }

}


/* =========================================================
   EVENTS
========================================================= */

if (
  paymentEvidenceForm &&
  !paymentEvidenceForm.dataset
    .clMemberEvidenceBound
) {

  paymentEvidenceForm.dataset
    .clMemberEvidenceBound =
    "true";


  paymentEvidenceForm.addEventListener(
    "submit",
    submitMemberPaymentEvidence
  );

}


if (
  evidenceMethod &&
  !evidenceMethod.dataset
    .clMemberEvidenceMethodBound
) {

  evidenceMethod.dataset
    .clMemberEvidenceMethodBound =
    "true";


  evidenceMethod.addEventListener(
    "change",
    updateEvidencePaymentMethod
  );

}


if (
  statementButton &&
  !statementButton.dataset
    .clStatementBound
) {

  statementButton.dataset
    .clStatementBound =
    "true";


  statementButton.addEventListener(
    "click",
    event => {

      event.preventDefault();

      clearError();

      downloadStatement();

    }
  );

}


if (
  printButton &&
  !printButton.dataset
    .clStatementPrintBound
) {

  printButton.dataset
    .clStatementPrintBound =
    "true";


  printButton.addEventListener(
    "click",
    event => {

      event.preventDefault();

      clearError();

      printStatement();

    }
  );

}


/* =========================================================
   DIRECT PAGE COMPATIBILITY
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


console.log(
  "CHAMA LIVE: member-contributions.js loaded"
);
