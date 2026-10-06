/* =========================================================
   CHAMA LIVE — CONTRIBUTIONS
   CANONICAL 2B ACCOUNTING VERSION

   MEMBER PAYMENT EVIDENCE INTEGRATION
   CUSTOM CONTRIBUTION INTEGRATION
   ---------------------------------------------------------
   ACCOUNTING BOUNDARIES
   ---------------------------------------------------------
   • Ordinary members submit payment evidence only.
   • Member evidence is inserted into
     member_payment_evidence.
   • Evidence remains pending until authorised
     verification occurs.
   • Frontend never directly inserts into contributions
     for the member-evidence workflow.
   • Verification is performed by the database
     verify_member_payment_evidence() RPC.
   • Existing canonical contribution recording remains
     through cl_2b_record_contribution().
   • Custom contribution creation remains backend-owned.
   • Custom contribution activation remains backend-owned.
   • Custom contribution payments remain backend-owned.
   • Verifier reads are limited to pending evidence in
     the current group.
   • Verifier writes occur only through
     verify_member_payment_evidence().
   • Canonical accounting remains backend-owned.
   • Closed financial-period enforcement remains
     backend-owned.
========================================================= */

import {
  supabase
} from "./supabase.js";

import {
  getMyMember
} from "./auth.js";


console.log(
  "CHAMA LIVE: contributions.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const form =
  document.getElementById("contributionForm");

const recordContributionCard =
  document.getElementById(
    "recordContributionCard"
  );

const memberSelect =
  document.getElementById("member");

const amountInput =
  document.getElementById("amount");

const dateInput =
  document.getElementById("contributionDate");

const typeSelect =
  document.getElementById("contributionType");

const methodSelect =
  document.getElementById("paymentMethod");

const mpesaReference =
  document.getElementById("mpesaReference");

const mpesaReferenceWrap =
  document.getElementById("mpesaReferenceWrap");

const saveButton =
  document.getElementById("saveContribution");

const monthlyExpected =
  document.getElementById("monthlyExpected");

const memberStatusRows =
  document.getElementById("memberStatusRows");

const contributionRows =
  document.getElementById("contributionRows");

const notesInput =
  document.getElementById("notes");

const goalSelect =
  document.getElementById("goal") ||
  document.getElementById("contributionGoal");

const goalProgressContainer =
  document.getElementById(
    "goalProgressContainer"
  );

const accountingMonthSelect =
  document.getElementById(
    "accountingMonth"
  );

const selectedAccountingMonthLabel =
  document.getElementById(
    "selectedAccountingMonthLabel"
  );

const contributionIdempotencyKeyInput =
  document.getElementById(
    "contributionIdempotencyKey"
  );


/* =========================================================
   MEMBER PAYMENT EVIDENCE ELEMENTS
========================================================= */

const memberPaymentEvidenceCard =
  document.getElementById(
    "memberPaymentEvidenceCard"
  );

const memberPaymentEvidenceForm =
  document.getElementById(
    "memberPaymentEvidenceForm"
  );

const memberEvidenceAmount =
  document.getElementById(
    "memberEvidenceAmount"
  );

const memberEvidenceDate =
  document.getElementById(
    "memberEvidenceDate"
  );

const memberEvidenceMethod =
  document.getElementById(
    "memberEvidenceMethod"
  );

const memberEvidenceMpesaWrap =
  document.getElementById(
    "memberEvidenceMpesaWrap"
  );

const memberEvidenceMpesaReference =
  document.getElementById(
    "memberEvidenceMpesaReference"
  );

const memberEvidenceText =
  document.getElementById(
    "memberEvidenceText"
  );

const submitMemberPaymentEvidenceButton =
  document.getElementById(
    "submitMemberPaymentEvidence"
  );

const memberPaymentEvidenceRows =
  document.getElementById(
    "memberPaymentEvidenceRows"
  );

const memberEvidenceMessage =
  document.getElementById(
    "memberEvidenceMessage"
  );


/* =========================================================
   VERIFIER PAYMENT EVIDENCE ELEMENTS
========================================================= */

const verifierPaymentEvidenceCard =
  document.getElementById(
    "verifierPaymentEvidenceCard"
  );

const verifierPaymentEvidenceMessage =
  document.getElementById(
    "verifierPaymentEvidenceMessage"
  );

const verifierPaymentEvidenceRows =
  document.getElementById(
    "verifierPaymentEvidenceRows"
  );

const verifierPaymentEvidenceDetail =
  document.getElementById(
    "verifierPaymentEvidenceDetail"
  );


/* =========================================================
   CUSTOM CONTRIBUTION EDITOR ELEMENTS
========================================================= */

const customContributionEditorCard =
  document.getElementById(
    "customContributionEditorCard"
  );

const customContributionForm =
  document.getElementById(
    "customContributionForm"
  );

const customContributionEditorMessage =
  document.getElementById(
    "customContributionEditorMessage"
  );

const customContributionName =
  document.getElementById(
    "customContributionName"
  );

const customContributionAmount =
  document.getElementById(
    "customContributionAmount"
  );

const customContributionCycle =
  document.getElementById(
    "customContributionCycle"
  );

const customContributionStartDate =
  document.getElementById(
    "customContributionStartDate"
  );

const customContributionDueDate =
  document.getElementById(
    "customContributionDueDate"
  );

const customContributionClosingDate =
  document.getElementById(
    "customContributionClosingDate"
  );

const customContributionDescription =
  document.getElementById(
    "customContributionDescription"
  );

const customContributionGraceDays =
  document.getElementById(
    "customContributionGraceDays"
  );

const customContributionApplyFine =
  document.getElementById(
    "customContributionApplyFine"
  );

const customContributionFineAmount =
  document.getElementById(
    "customContributionFineAmount"
  );

const saveCustomContribution =
  document.getElementById(
    "saveCustomContribution"
  );

const cancelCustomContribution =
  document.getElementById(
    "cancelCustomContribution"
  );


/* =========================================================
   STATE
========================================================= */

let groupId = null;

let members = [];

let contributions = [];

let contributionGoals = [];

let activeCustomContributions = [];

let canonicalMemberStatus = [];

let memberPaymentEvidence = [];

let verifierPaymentEvidence = [];

let currentMember = null;

let monthlyContribution = 0;

let initialized = false;

let accountingMonth =
  getCurrentMonth();

let selectedVerifierEvidenceId =
  null;


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


/*
 * Roles allowed to use the manual canonical
 * contribution recorder surface.
 *
 * Database authorization remains authoritative.
 */
const RECORDER_ROLES = new Set([

  "admin",

  "chairperson",

  "treasurer",

  "secretary"

]);


/*
 * Roles allowed to review member payment evidence.
 *
 * Database authorization remains authoritative.
 */
const VERIFIER_ROLES = new Set([

  "admin",

  "chairperson",

  "secretary",

  "treasurer"

]);


/* =========================================================
   GENERIC HELPERS
========================================================= */

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
    Number(value || 0)
  );

}


function number(value) {

  const result =
    Number(value || 0);

  return Number.isFinite(result)
    ? result
    : 0;

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


function formatAccountingMonth(month) {

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


function monthKeyFromDate(date) {

  return (
    `${date.getFullYear()}-` +
    `${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`
  );

}


function shiftMonth(
  month,
  offset
) {

  const [
    year,
    monthNumber
  ] =
    String(month)
      .split("-")
      .map(Number);

  const date =
    new Date(
      year,
      monthNumber - 1 + offset,
      1
    );

  return monthKeyFromDate(
    date
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


/* =========================================================
   ACCOUNTING MONTH
========================================================= */

function buildAccountingMonthOptions() {

  if (!accountingMonthSelect) {
    return;
  }

  const current =
    getCurrentMonth();

  const start =
    shiftMonth(
      current,
      -12
    );

  const end =
    shiftMonth(
      current,
      6
    );

  const options = [];

  let cursor =
    start;

  while (
    cursor <= end
  ) {

    options.push(cursor);

    cursor =
      shiftMonth(
        cursor,
        1
      );

  }

  accountingMonthSelect.innerHTML =
    options
      .map(
        month => `
          <option value="${escapeHtml(
            month
          )}">
            ${escapeHtml(
              formatAccountingMonth(
                month
              )
            )}
          </option>
        `
      )
      .join("");

  accountingMonthSelect.value =
    accountingMonth;

}


function renderAccountingMonthLabel() {

  if (
    !selectedAccountingMonthLabel
  ) {
    return;
  }

  selectedAccountingMonthLabel.textContent =
    formatAccountingMonth(
      accountingMonth
    );

}


function getSelectedAccountingMonth() {

  const value =
    String(
      accountingMonthSelect?.value ||
      accountingMonth ||
      getCurrentMonth()
    );

  if (
    !/^\d{4}-\d{2}$/.test(
      value
    )
  ) {

    return getCurrentMonth();

  }

  return value;

}


function getContributionMonth(item) {

  if (
    item?.contribution_date
  ) {

    return String(
      item.contribution_date
    ).slice(0, 7);

  }

  if (
    item?.month
  ) {

    return String(
      item.month
    ).slice(0, 7);

  }

  if (
    item?.created_at
  ) {

    const date =
      new Date(
        item.created_at
      );

    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {

      return monthKeyFromDate(
        date
      );

    }

  }

  return "";

}


/* =========================================================
   STATUS / ERROR
========================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE Contributions Error:",
    error
  );

  if (errorEl) {

    errorEl.textContent =
      error?.message ||
      "Something went wrong.";

    errorEl.hidden =
      false;

  }

  if (statusEl) {

    statusEl.hidden =
      false;

    statusEl.textContent =
      "Unable to complete the contribution request.";

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


/* =========================================================
   CURRENT MEMBER / ROLE
========================================================= */

function getCurrentMemberRole() {

  return String(
    currentMember?.role ||
    ""
  )
    .trim()
    .toLowerCase();

}


function isOrdinaryMember() {

  return (
    getCurrentMemberRole() ===
    "member"
  );

}


function isAuthorizedRecorder() {

  return RECORDER_ROLES.has(
    getCurrentMemberRole()
  );

}


function isAuthorizedVerifier() {

  return VERIFIER_ROLES.has(
    getCurrentMemberRole()
  );

}


/* =========================================================
   PAYMENT METHOD
========================================================= */

function normalizePaymentMethod(value) {

  const method =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    method === "m-pesa" ||
    method === "mpesa" ||
    method === "m_pesa"
  ) {

    return PAYMENT_METHODS.MPESA;

  }

  if (
    method === "cash"
  ) {

    return PAYMENT_METHODS.CASH;

  }

  if (
    method === "bank" ||
    method === "bank transfer" ||
    method === "bank_transfer"
  ) {

    return PAYMENT_METHODS.BANK;

  }

  return value || "—";

}


/* =========================================================
   IDEMPOTENCY
========================================================= */

function generateIdempotencyKey() {

  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {

    return crypto.randomUUID();

  }

  throw new Error(
    "Secure idempotency key generation is unavailable in this browser."
  );

}


function getContributionIdempotencyKey() {

  if (!contributionIdempotencyKeyInput) {

    throw new Error(
      "Contribution idempotency field is missing from the page."
    );

  }

  let key =
    String(
      contributionIdempotencyKeyInput.value ||
      ""
    ).trim();

  if (!key) {

    key =
      generateIdempotencyKey();

    contributionIdempotencyKeyInput.value =
      key;

  }

  return key;

}


function resetContributionIdempotencyKey() {

  if (!contributionIdempotencyKeyInput) {
    return;
  }

  contributionIdempotencyKeyInput.value =
    generateIdempotencyKey();

}


/* =========================================================
   CURRENT GROUP
========================================================= */

async function getGroupId() {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "my_group_id"
    );

  if (error) {

    throw error;

  }

  if (!data) {

    throw new Error(
      "No group is associated with your account."
    );

  }

  return data;

}


/* =========================================================
   LOAD GROUP
========================================================= */

async function loadGroup() {

  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select(
        "monthly_contribution,name,category"
      )
      .eq(
        "id",
        groupId
      )
      .single();

  if (error) {

    throw error;

  }

  monthlyContribution =
    number(
      data?.monthly_contribution
    );

  if (
    monthlyExpected
  ) {

    monthlyExpected.textContent =
      money(
        monthlyContribution
      );

  }

  if (
    amountInput &&
    monthlyContribution > 0
  ) {

    amountInput.value =
      monthlyContribution;

  }

  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(
      element => {

        element.textContent =
          data?.name ||
          "CHAMA";

      }
    );

}


/* =========================================================
   ACTIVE CUSTOM CONTRIBUTIONS
========================================================= */

/*
 * Backend-owned source of truth for active custom
 * contribution types.
 *
 * This function deliberately does not construct
 * custom contribution records locally.
 */
async function loadActiveCustomContributions() {

  activeCustomContributions = [];

  if (
    !groupId
  ) {

    return [];

  }

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_group_active_contributions",
      {
        p_group_id:
          groupId
      }
    );

  if (error) {

    throw error;

  }

  activeCustomContributions =
    (data || [])
      .filter(
        item =>
          String(
            item.contribution_code ||
            ""
          )
            .trim()
            .toLowerCase() !==
          "monthly"
      )
      .map(
        item => ({
          ...item,

          contributionTypeId:
            item.contribution_type_id
        })
      );

  return activeCustomContributions;

}


/*
 * Rebuild the contribution-type selector from the
 * backend's current active contribution list.
 *
 * Monthly remains the first option.
 *
 * Active Custom contribution types are added below it.
 */
function renderContributionTypeOptions(
  preferredValue = null
) {

  if (!typeSelect) {
    return;
  }

  typeSelect.innerHTML = "";

  const monthlyOption =
    document.createElement("option");

  monthlyOption.value =
    "monthly";

  monthlyOption.textContent =
    "Monthly Contribution";

  typeSelect.appendChild(
    monthlyOption
  );


  activeCustomContributions.forEach(
    item => {

      const contributionTypeId =
        item.contribution_type_id ||
        item.contributionTypeId;

      if (!contributionTypeId) {
        return;
      }

      const option =
        document.createElement(
          "option"
        );

      option.value =
        `custom:${contributionTypeId}`;

      const name =
        item.contribution_name ||
        item.name ||
        "Custom Contribution";

      const amount =
        number(
          item.amount
        );

      const dueDate =
        item.due_date ||
        item.period_due_date ||
        null;

      const status =
        String(
          item.status ||
          ""
        )
          .trim()
          .toLowerCase();

      let label =
        name;

      if (
        amount > 0
      ) {

        label +=
          ` — ${money(amount)}`;

      }

      if (dueDate) {

        label +=
          ` due ${formatDate(dueDate)}`;

      }

      if (status) {

        label +=
          ` (${status})`;

      }

      option.textContent =
        label;

      typeSelect.appendChild(
        option
      );

    }
  );


  const hasPreferred =
    preferredValue &&
    Array.from(
      typeSelect.options
    ).some(
      option =>
        option.value ===
        preferredValue
    );

  typeSelect.value =
    hasPreferred
      ? preferredValue
      : "monthly";

}


/*
 * Full active custom contribution refresh.
 *
 * This is intentionally separate from initialization.
 * It allows the newly created Custom contribution to
 * appear immediately after save/activation.
 */
async function refreshActiveCustomContributions(
  preferredValue = null
) {

  await loadActiveCustomContributions();

  renderContributionTypeOptions(
    preferredValue
  );

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(
        `
          id,
          name,
          status
        `
      )
      .eq(
        "group_id",
        groupId
      )
      .order(
        "name",
        {
          ascending: true
        }
      );

  if (error) {

    throw error;

  }

  members =
    (data || [])
      .filter(
        member =>
          String(
            member.status ||
            "active"
          )
            .toLowerCase() ===
          "active"
      );

  if (!memberSelect) {
    return;
  }

  memberSelect.innerHTML = `

    <option value="">
      Select member
    </option>

  `;

  members.forEach(
    member => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        member.id;

      option.textContent =
        member.name;

      memberSelect.appendChild(
        option
      );

    }
  );

}


/* =========================================================
   LOAD CONTRIBUTION GOALS
========================================================= */

async function loadContributionGoals() {

  contributionGoals = [];

  if (!goalSelect) {
    return;
  }

  const {
    data,
    error
  } =
    await supabase
      .from("contribution_goals")
      .select(
        `
          id,
          goal_name,
          category,
          target_amount,
          status,
          start_date,
          end_date,
          created_at
        `
      )
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "status",
        "active"
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

  contributionGoals =
    data || [];

  goalSelect.innerHTML = `

    <option value="">
      General contribution
    </option>

  `;

  contributionGoals.forEach(
    goal => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        goal.id;

      option.textContent =
        goal.target_amount
          ? `${goal.goal_name} — ${money(
              goal.target_amount
            )}`
          : goal.goal_name;

      goalSelect.appendChild(
        option
      );

    }
  );

}


/* =========================================================
   LOAD CONTRIBUTIONS
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
          month,
          payment_method,
          reference,
          recorded_by,
          created_at,
          goal_id,
          contribution_date,
          notes,
          mpesa_reference
        `
      )
      .eq(
        "group_id",
        groupId
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
   CANONICAL 2B STATUS
========================================================= */

async function loadCanonicalMemberStatus(
  month = accountingMonth
) {

  if (!groupId) {

    canonicalMemberStatus = [];

    return [];

  }

  if (
    !/^\d{4}-\d{2}$/.test(
      String(month || "")
    )
  ) {

    throw new Error(
      "Accounting month must use YYYY-MM format."
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
          month
      }
    );

  if (error) {

    throw error;

  }

  canonicalMemberStatus =
    data || [];

  return canonicalMemberStatus;

}


function getCanonicalMemberStatus(
  memberId
) {

  return canonicalMemberStatus.find(
    item =>
      String(item.member_id) ===
      String(memberId)
  ) || null;

}


/* =========================================================
   MEMBER NAME
========================================================= */

function getMemberName(memberId) {

  const member =
    members.find(
      item =>
        String(item.id) ===
        String(memberId)
    );

  return (
    member?.name ||
    "Unknown member"
  );

}


/* =========================================================
   GOAL NAME
========================================================= */

function getGoalName(goalId) {

  if (!goalId) {

    return "General";

  }

  const goal =
    contributionGoals.find(
      item =>
        String(item.id) ===
        String(goalId)
    );

  return (
    goal?.goal_name ||
    "Goal"
  );

}


/* =========================================================
   MEMBER PAYMENT EVIDENCE MESSAGE
========================================================= */

function showMemberEvidenceMessage(
  message
) {

  if (!memberEvidenceMessage) {
    return;
  }

  memberEvidenceMessage.textContent =
    message || "";

  memberEvidenceMessage.hidden =
    !message;

}


function clearMemberEvidenceMessage() {

  showMemberEvidenceMessage("");

}


/* =========================================================
   MEMBER PAYMENT EVIDENCE
========================================================= */

function updateMemberEvidencePaymentMethod() {

  if (!memberEvidenceMethod) {
    return;
  }

  const method =
    normalizePaymentMethod(
      memberEvidenceMethod.value
    );

  const isMpesa =
    method ===
    PAYMENT_METHODS.MPESA;

  if (memberEvidenceMpesaWrap) {

    memberEvidenceMpesaWrap.hidden =
      !isMpesa;

  }

  if (memberEvidenceMpesaReference) {

    memberEvidenceMpesaReference.required =
      isMpesa;

    if (!isMpesa) {

      memberEvidenceMpesaReference.value =
        "";

    }

  }

}


function memberEvidenceStatusLabel(
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


function memberEvidenceStatusClass(
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


function renderMemberPaymentEvidence() {

  if (!memberPaymentEvidenceRows) {
    return;
  }

  if (!memberPaymentEvidence.length) {

    memberPaymentEvidenceRows.innerHTML = `

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

  memberPaymentEvidenceRows.innerHTML =
    memberPaymentEvidence
      .map(
        evidence => {

          const method =
            normalizePaymentMethod(
              evidence.payment_method
            );

          const status =
            memberEvidenceStatusLabel(
              evidence.status
            );

          const statusClass =
            memberEvidenceStatusClass(
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
                <span class="cl-payment-badge">
                  ${escapeHtml(
                    method
                  )}
                </span>
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
                    ${statusClass}
                  "
                >
                  ${escapeHtml(
                    status
                  )}
                </span>
              </td>

              <td data-label="Details">

                ${
                  rejectionReason
                    ? `
                      <span class="cl-evidence-reason">
                        ${escapeHtml(
                          rejectionReason
                        )}
                      </span>
                    `
                    : `
                      <span class="cl-evidence-reason">
                        ${escapeHtml(
                          evidence.evidence_text ||
                          "Payment submitted for verification."
                        )}
                      </span>
                    `
                }

              </td>

            </tr>

          `;

        }
      )
      .join("");

}


async function loadMemberPaymentEvidence() {

  memberPaymentEvidence = [];

  if (
    !currentMember?.id ||
    !groupId ||
    !isOrdinaryMember()
  ) {

    renderMemberPaymentEvidence();

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

  renderMemberPaymentEvidence();

}


function configureMemberPaymentEvidence() {

  if (
    !memberPaymentEvidenceCard
  ) {
    return;
  }

  const show =
    isOrdinaryMember();

  memberPaymentEvidenceCard.hidden =
    !show;

  memberPaymentEvidenceCard.classList.toggle(
    "cl-member-evidence-visible",
    show
  );

  if (
    recordContributionCard
  ) {

    recordContributionCard.hidden =
      !isAuthorizedRecorder();

  }

  if (
    show &&
    memberEvidenceDate &&
    !memberEvidenceDate.value
  ) {

    memberEvidenceDate.value =
      todayString();

  }

  updateMemberEvidencePaymentMethod();

}


async function submitMemberPaymentEvidence(
  event
) {

  event.preventDefault();

  clearMemberEvidenceMessage();
  clearError();


  if (!isOrdinaryMember()) {

    showMemberEvidenceMessage(
      "Payment evidence submission is available to ordinary members."
    );

    return;

  }


  if (
    !currentMember?.id ||
    !groupId
  ) {

    showMemberEvidenceMessage(
      "Your active member account could not be resolved."
    );

    return;

  }


  const amount =
    number(
      memberEvidenceAmount?.value
    );

  const paymentDate =
    memberEvidenceDate?.value ||
    "";

  const paymentMethod =
    normalizePaymentMethod(
      memberEvidenceMethod?.value
    );

  const mpesaReferenceValue =
    memberEvidenceMpesaReference?.value
      ?.trim() ||
    "";

  const evidenceText =
    memberEvidenceText?.value
      ?.trim() ||
    "";


  if (
    amount <= 0
  ) {

    showMemberEvidenceMessage(
      "Please enter a valid payment amount greater than zero."
    );

    memberEvidenceAmount?.focus();

    return;

  }


  if (!paymentDate) {

    showMemberEvidenceMessage(
      "Please select the payment date."
    );

    memberEvidenceDate?.focus();

    return;

  }


  if (!paymentMethod) {

    showMemberEvidenceMessage(
      "Please select the payment method."
    );

    return;

  }


  if (
    paymentMethod ===
      PAYMENT_METHODS.MPESA &&
    !mpesaReferenceValue
  ) {

    showMemberEvidenceMessage(
      "Please enter the M-Pesa reference."
    );

    memberEvidenceMpesaReference?.focus();

    return;

  }


  if (!evidenceText) {

    showMemberEvidenceMessage(
      "Please provide payment details."
    );

    memberEvidenceText?.focus();

    return;

  }


  if (
    submitMemberPaymentEvidenceButton
  ) {

    submitMemberPaymentEvidenceButton.disabled =
      true;

    submitMemberPaymentEvidenceButton.textContent =
      "Submitting...";

  }


  if (statusEl) {

    statusEl.hidden =
      false;

    statusEl.textContent =
      "Submitting payment evidence securely...";

  }


  try {

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
              ? mpesaReferenceValue
              : null,

          payment_date:
            paymentDate,

          evidence_text:
            evidenceText,

          status:
            MEMBER_EVIDENCE_STATUSES.PENDING
        });


    if (error) {

      throw error;

    }


    if (
      memberPaymentEvidenceForm
    ) {

      memberPaymentEvidenceForm.reset();

    }


    if (memberEvidenceDate) {

      memberEvidenceDate.value =
        todayString();

    }


    if (memberEvidenceMethod) {

      memberEvidenceMethod.value =
        PAYMENT_METHODS.MPESA;

    }


    updateMemberEvidencePaymentMethod();

    await loadMemberPaymentEvidence();


    showMemberEvidenceMessage(
      "Payment evidence submitted successfully. It is now pending verification."
    );


    if (statusEl) {

      statusEl.hidden =
        false;

      statusEl.textContent =
        "Payment evidence submitted and is pending verification.";

    }

  }
  catch (error) {

    showError(error);

  }
  finally {

    if (
      submitMemberPaymentEvidenceButton
    ) {

      submitMemberPaymentEvidenceButton.disabled =
        false;

      submitMemberPaymentEvidenceButton.textContent =
        "Submit Payment Evidence";

    }

  }

}


/* =========================================================
   VERIFIER PAYMENT EVIDENCE
========================================================= */

function showVerifierPaymentEvidenceMessage(
  message
) {

  if (!verifierPaymentEvidenceMessage) {
    return;
  }

  verifierPaymentEvidenceMessage.textContent =
    message || "";

  verifierPaymentEvidenceMessage.hidden =
    !message;

}


function clearVerifierPaymentEvidenceMessage() {

  showVerifierPaymentEvidenceMessage("");

}


function configureVerifierPaymentEvidence() {

  if (
    !verifierPaymentEvidenceCard
  ) {
    return;
  }

  const show =
    isAuthorizedVerifier();

  verifierPaymentEvidenceCard.hidden =
    !show;

  if (!show) {

    verifierPaymentEvidence = [];

    selectedVerifierEvidenceId =
      null;

    clearVerifierPaymentEvidenceMessage();

    if (
      verifierPaymentEvidenceRows
    ) {

      verifierPaymentEvidenceRows.innerHTML =
        "";

    }

    if (
      verifierPaymentEvidenceDetail
    ) {

      verifierPaymentEvidenceDetail.hidden =
        true;

      verifierPaymentEvidenceDetail.innerHTML =
        "";

    }

  }

}


function renderVerifierPaymentEvidence() {

  if (
    !verifierPaymentEvidenceRows
  ) {
    return;
  }

  if (
    !verifierPaymentEvidence.length
  ) {

    verifierPaymentEvidenceRows.innerHTML = `

      <tr>

        <td
          colspan="7"
          class="cl-evidence-empty"
        >
          No pending payment evidence requires
          verification.
        </td>

      </tr>

    `;

    return;

  }

  verifierPaymentEvidenceRows.innerHTML =
    verifierPaymentEvidence
      .map(
        evidence => {

          const memberName =
            getMemberName(
              evidence.member_id
            );

          const method =
            normalizePaymentMethod(
              evidence.payment_method
            );

          const reference =
            evidence.mpesa_reference ||
            "—";

          return `

            <tr>

              <td data-label="Member">

                <strong>
                  ${escapeHtml(
                    memberName
                  )}
                </strong>

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

              <td data-label="Payment Date">

                ${escapeHtml(
                  formatDate(
                    evidence.payment_date
                  )
                )}

              </td>

              <td data-label="Method">

                <span class="cl-payment-badge">
                  ${escapeHtml(
                    method
                  )}
                </span>

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

              <td data-label="Action">

                <button
                  type="button"
                  class="cl-verifier-button"
                  data-verifier-evidence-id="${escapeHtml(
                    evidence.id
                  )}"
                >
                  Review
                </button>

              </td>

            </tr>

          `;

        }
      )
      .join("");

}


function showVerifierPaymentEvidenceDetail(
  evidenceId
) {

  if (
    !verifierPaymentEvidenceDetail
  ) {
    return;
  }

  const evidence =
    verifierPaymentEvidence.find(
      item =>
        String(item.id) ===
        String(evidenceId)
    );

  if (!evidence) {

    verifierPaymentEvidenceDetail.hidden =
      true;

    verifierPaymentEvidenceDetail.innerHTML =
      "";

    selectedVerifierEvidenceId =
      null;

    return;

  }

  selectedVerifierEvidenceId =
    evidence.id;

  const memberName =
    getMemberName(
      evidence.member_id
    );

  const method =
    normalizePaymentMethod(
      evidence.payment_method
    );

  const reference =
    evidence.mpesa_reference ||
    "—";

  verifierPaymentEvidenceDetail.innerHTML = `

    <div class="cl-verifier-detail">

      <div class="cl-verifier-detail-grid">

        <div>
          <span>Member</span>
          <strong>
            ${escapeHtml(
              memberName
            )}
          </strong>
        </div>

        <div>
          <span>Amount</span>
          <strong>
            ${escapeHtml(
              money(
                evidence.amount
              )
            )}
          </strong>
        </div>

        <div>
          <span>Payment date</span>
          <strong>
            ${escapeHtml(
              formatDate(
                evidence.payment_date
              )
            )}
          </strong>
        </div>

        <div>
          <span>Payment method</span>
          <strong>
            ${escapeHtml(
              method
            )}
          </strong>
        </div>

        <div>
          <span>M-Pesa reference</span>
          <strong>
            ${escapeHtml(
              reference
            )}
          </strong>
        </div>

        <div>
          <span>Submitted</span>
          <strong>
            ${escapeHtml(
              formatDate(
                evidence.submitted_at
              )
            )}
          </strong>
        </div>

      </div>

      <div class="cl-verifier-detail-evidence">

        <span>
          Payment details
        </span>

        <p>
          ${escapeHtml(
            evidence.evidence_text ||
            "No additional payment details supplied."
          )}
        </p>

      </div>

      <div class="cl-verifier-detail-actions">

        <button
          type="button"
          class="
            cl-verifier-button
            cl-verifier-button-primary
          "
          data-verify-evidence-id="${escapeHtml(
            evidence.id
          )}"
        >
          Verify Payment
        </button>

        <button
          type="button"
          class="
            cl-verifier-button
            cl-verifier-button-danger
          "
          data-reject-evidence-id="${escapeHtml(
            evidence.id
          )}"
        >
          Reject Payment
        </button>

        <button
          type="button"
          class="
            cl-verifier-button
            cl-verifier-button-secondary
          "
          data-close-verifier-detail
        >
          Close
        </button>

      </div>

    </div>

  `;

  verifierPaymentEvidenceDetail.hidden =
    false;

}


async function loadVerifierPaymentEvidence() {

  verifierPaymentEvidence = [];

  selectedVerifierEvidenceId =
    null;

  if (
    !groupId ||
    !isAuthorizedVerifier()
  ) {

    renderVerifierPaymentEvidence();

    if (
      verifierPaymentEvidenceDetail
    ) {

      verifierPaymentEvidenceDetail.hidden =
        true;

      verifierPaymentEvidenceDetail.innerHTML =
        "";

    }

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
          submitted_at
        `
      )
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "status",
        MEMBER_EVIDENCE_STATUSES.PENDING
      )
      .order(
        "submitted_at",
        {
          ascending: true
        }
      );

  if (error) {

    throw error;

  }

  verifierPaymentEvidence =
    data || [];

  renderVerifierPaymentEvidence();

}


/* =========================================================
   VERIFY PAYMENT EVIDENCE
========================================================= */

async function verifyPaymentEvidence(
  evidenceId
) {

  if (
    !isAuthorizedVerifier()
  ) {

    showVerifierPaymentEvidenceMessage(
      "You are not authorised to verify payment evidence."
    );

    return;

  }

  const evidence =
    verifierPaymentEvidence.find(
      item =>
        String(item.id) ===
        String(evidenceId)
    );

  if (!evidence) {

    showVerifierPaymentEvidenceMessage(
      "The selected payment evidence is no longer pending."
    );

    return;

  }

  const confirmed =
    window.confirm(
      `Verify ${getMemberName(
        evidence.member_id
      )}'s payment of ${money(
        evidence.amount
      )}?\n\n` +
      `This will pass the payment through the canonical accounting workflow.`
    );

  if (!confirmed) {
    return;
  }

  clearVerifierPaymentEvidenceMessage();
  clearError();

  try {

    if (statusEl) {

      statusEl.hidden =
        false;

      statusEl.textContent =
        "Verifying payment evidence securely...";

    }

    const {
      data,
      error
    } =
      await supabase.rpc(
        "verify_member_payment_evidence",
        {
          p_evidence_id:
            evidenceId,

          p_decision:
            MEMBER_EVIDENCE_STATUSES.VERIFIED,

          p_rejection_reason:
            null
        }
      );

    if (error) {

      throw error;

    }

    console.log(
      "CHAMA LIVE: Payment evidence verification completed",
      {
        evidenceId,
        result: data
      }
    );

    selectedVerifierEvidenceId =
      null;

    if (
      verifierPaymentEvidenceDetail
    ) {

      verifierPaymentEvidenceDetail.hidden =
        true;

      verifierPaymentEvidenceDetail.innerHTML =
        "";

    }

    await Promise.all([

      loadVerifierPaymentEvidence(),

      loadContributions(),

      loadCanonicalMemberStatus(
        accountingMonth
      )

    ]);

    if (
      isOrdinaryMember()
    ) {

      await loadMemberPaymentEvidence();

    }

    renderLedger();

    renderMemberStatus();

    renderSummary();

    renderContributionGoals();

    showVerifierPaymentEvidenceMessage(
      "Payment verified successfully and passed through canonical accounting."
    );

    if (statusEl) {

      statusEl.hidden =
        false;

      statusEl.textContent =
        "Payment verified and canonical accounting refreshed.";

    }

  }
  catch (error) {

    showError(error);

    showVerifierPaymentEvidenceMessage(
      error?.message ||
      "Payment verification failed. The pending evidence remains available for review."
    );

  }

}


/* =========================================================
   REJECT PAYMENT EVIDENCE
========================================================= */

async function rejectPaymentEvidence(
  evidenceId
) {

  if (
    !isAuthorizedVerifier()
  ) {

    showVerifierPaymentEvidenceMessage(
      "You are not authorised to reject payment evidence."
    );

    return;

  }

  const evidence =
    verifierPaymentEvidence.find(
      item =>
        String(item.id) ===
        String(evidenceId)
    );

  if (!evidence) {

    showVerifierPaymentEvidenceMessage(
      "The selected payment evidence is no longer pending."
    );

    return;

  }

  const reason =
    window.prompt(
      "Enter the reason for rejecting this payment evidence:"
    );

  if (reason === null) {
    return;
  }

  const rejectionReason =
    String(
      reason
    ).trim();

  if (!rejectionReason) {

    showVerifierPaymentEvidenceMessage(
      "A rejection reason is required."
    );

    return;

  }

  const confirmed =
    window.confirm(
      `Reject ${getMemberName(
        evidence.member_id
      )}'s payment evidence?\n\n` +
      `Reason: ${rejectionReason}`
    );

  if (!confirmed) {
    return;
  }

  clearVerifierPaymentEvidenceMessage();
  clearError();

  try {

    if (statusEl) {

      statusEl.hidden =
        false;

      statusEl.textContent =
        "Rejecting payment evidence securely...";

    }

    const {
      data,
      error
    } =
      await supabase.rpc(
        "verify_member_payment_evidence",
        {
          p_evidence_id:
            evidenceId,

          p_decision:
            MEMBER_EVIDENCE_STATUSES.REJECTED,

          p_rejection_reason:
            rejectionReason
        }
      );

    if (error) {

      throw error;

    }

    console.log(
      "CHAMA LIVE: Payment evidence rejection completed",
      {
        evidenceId,
        result: data
      }
    );

    selectedVerifierEvidenceId =
      null;

    if (
      verifierPaymentEvidenceDetail
    ) {

      verifierPaymentEvidenceDetail.hidden =
        true;

      verifierPaymentEvidenceDetail.innerHTML =
        "";

    }

    await loadVerifierPaymentEvidence();

    if (
      isOrdinaryMember()
    ) {

      await loadMemberPaymentEvidence();

    }

    showVerifierPaymentEvidenceMessage(
      "Payment evidence rejected successfully."
    );

    if (statusEl) {

      statusEl.hidden =
        false;

      statusEl.textContent =
        "Payment evidence rejected.";

    }

  }
  catch (error) {

    showError(error);

    showVerifierPaymentEvidenceMessage(
      error?.message ||
      "Payment rejection failed. The pending evidence remains available for review."
    );

  }

}


/* =========================================================
   VERIFIER EVENT DELEGATION
========================================================= */

function handleVerifierPaymentEvidenceClick(
  event
) {

  const reviewButton =
    event.target.closest(
      "[data-verifier-evidence-id]"
    );

  if (reviewButton) {

    const evidenceId =
      reviewButton.dataset
        .verifierEvidenceId;

    showVerifierPaymentEvidenceDetail(
      evidenceId
    );

    return;

  }


  const verifyButton =
    event.target.closest(
      "[data-verify-evidence-id]"
    );

  if (verifyButton) {

    const evidenceId =
      verifyButton.dataset
        .verifyEvidenceId;

    void verifyPaymentEvidence(
      evidenceId
    );

    return;

  }


  const rejectButton =
    event.target.closest(
      "[data-reject-evidence-id]"
    );

  if (rejectButton) {

    const evidenceId =
      rejectButton.dataset
        .rejectEvidenceId;

    void rejectPaymentEvidence(
      evidenceId
    );

    return;

  }


  const closeButton =
    event.target.closest(
      "[data-close-verifier-detail]"
    );

  if (closeButton) {

    selectedVerifierEvidenceId =
      null;

    if (
      verifierPaymentEvidenceDetail
    ) {

      verifierPaymentEvidenceDetail.hidden =
        true;

      verifierPaymentEvidenceDetail.innerHTML =
        "";

    }

  }

}


/* =========================================================
   CONTRIBUTION TYPE
========================================================= */

function contributionTypeLabel(item) {

  const type =
    String(
      item?.contribution_type ||
      ""
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

    fine: "Fine"

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


/* =========================================================
   PAYMENT METHOD UI
========================================================= */

function updatePaymentMethod() {

  if (!methodSelect) {
    return;
  }

  const method =
    normalizePaymentMethod(
      methodSelect.value
    );

  const isMpesa =
    method ===
    PAYMENT_METHODS.MPESA;

  if (mpesaReferenceWrap) {

    mpesaReferenceWrap.hidden =
      !isMpesa;

  }

  if (mpesaReference) {

    mpesaReference.required =
      isMpesa;

    if (!isMpesa) {

      mpesaReference.value =
        "";

    }

  }

}


/* =========================================================
   LEDGER
========================================================= */

function renderLedger() {

  if (!contributionRows) {
    return;
  }

  if (!contributions.length) {

    contributionRows.innerHTML = `

      <tr>

        <td
          colspan="8"
          class="cl-empty-table"
        >

          No contributions recorded yet.

        </td>

      </tr>

    `;

    return;

  }

  contributionRows.innerHTML =
    contributions
      .slice(0, 100)
      .map(
        item => {

          const date =
            item.contribution_date ||
            item.created_at ||
            (
              item.month
                ? `${item.month}-01`
                : null
            );

          const reference =
            item.mpesa_reference ||
            item.reference ||
            "—";

          const paymentMethod =
            normalizePaymentMethod(
              item.payment_method
            );

          const type =
            contributionTypeLabel(
              item
            );

          const goalName =
            getGoalName(
              item.goal_id
            );

          return `

            <tr>

              <td data-label="Date">

                ${escapeHtml(
                  formatDate(date)
                )}

              </td>

              <td data-label="Member">

                <strong>
                  ${escapeHtml(
                    getMemberName(
                      item.member_id
                    )
                  )}
                </strong>

              </td>

              <td
                data-label="Amount"
                class="cl-money-cell"
              >

                <strong>
                  ${escapeHtml(
                    money(item.amount)
                  )}
                </strong>

              </td>

              <td data-label="Type">

                <span class="cl-type-badge">
                  ${escapeHtml(type)}
                </span>

              </td>

              <td data-label="Payment Method">

                <span class="cl-payment-badge">
                  ${escapeHtml(
                    paymentMethod
                  )}
                </span>

              </td>

              <td data-label="Goal">

                ${escapeHtml(
                  goalName
                )}

              </td>

              <td data-label="Reference">

                ${escapeHtml(
                  reference
                )}

              </td>

              <td data-label="Notes">

                ${
                  item.notes
                    ? `
                      <span class="cl-note-text">
                        ${escapeHtml(
                          item.notes
                        )}
                      </span>
                    `
                    : "—"
                }

              </td>

            </tr>

          `;

        }
      )
      .join("");

}


/* =========================================================
   CANONICAL STATUS HELPERS
========================================================= */

function canonicalStatusLabel(
  status
) {

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


function canonicalStatusClass(
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

  if (
    value === "outstanding"
  ) {

    return "cl-status-outstanding";

  }

  return "cl-status-neutral";

}


function canonicalProgress(
  account
) {

  const due =
    number(
      account?.monthly_due
    );

  const applied =
    number(
      account?.applied_this_month
    );

  if (
    due <= 0
  ) {

    return 0;

  }

  return Math.min(
    Math.max(
      (
        applied /
        due
      ) * 100,
      0
    ),
    100
  );

}


/* =========================================================
   MONTHLY STATUS
   DISPLAY ONLY
========================================================= */

function renderMemberStatus() {

  if (!memberStatusRows) {
    return;
  }

  if (!members.length) {

    memberStatusRows.innerHTML = `

      <tr>

        <td
          colspan="7"
          class="cl-empty-table"
        >

          No active members found.

        </td>

      </tr>

    `;

    return;

  }

  if (!canonicalMemberStatus.length) {

    memberStatusRows.innerHTML = `

      <tr>

        <td
          colspan="7"
          class="cl-empty-table"
        >

          No canonical accounting rows are
          available for
          ${escapeHtml(
            formatAccountingMonth(
              accountingMonth
            )
          )}.

        </td>

      </tr>

    `;

    return;

  }

  memberStatusRows.innerHTML =
    members
      .map(
        member => {

          const account =
            getCanonicalMemberStatus(
              member.id
            );

          if (!account) {

            return `

              <tr>

                <td
                  data-label="Member"
                  class="cl-member-cell"
                >

                  <strong>
                    ${escapeHtml(
                      member.name
                    )}
                  </strong>

                </td>

                <td data-label="Current Due">
                  —
                </td>

                <td data-label="Previous Arrears">
                  —
                </td>

                <td data-label="Current Paid">
                  —
                </td>

                <td data-label="Carry Forward">
                  —
                </td>

                <td data-label="Outstanding">
                  —
                </td>

                <td data-label="Status">

                  <span
                    class="
                      cl-status-badge
                      cl-status-neutral
                    "
                  >
                    NOT AVAILABLE
                  </span>

                </td>

              </tr>

            `;

          }

          const monthlyDue =
            number(
              account.monthly_due
            );

          const previousArrears =
            number(
              account.previous_outstanding
            );

          const currentPaid =
            number(
              account.current_month_payment
            );

          const appliedThisMonth =
            number(
              account.applied_this_month
            );

          const carryForward =
            number(
              account.carry_forward
            );

          const outstanding =
            number(
              account.current_outstanding
            );

          const progress =
            canonicalProgress(
              account
            );

          const status =
            canonicalStatusLabel(
              account.status
            );

          const statusClass =
            canonicalStatusClass(
              account.status
            );

          return `

            <tr>

              <td
                data-label="Member"
                class="cl-member-cell"
              >

                <strong>
                  ${escapeHtml(
                    member.name
                  )}
                </strong>

              </td>

              <td
                data-label="Current Due"
                class="cl-money-cell"
              >

                ${escapeHtml(
                  money(monthlyDue)
                )}

              </td>

              <td data-label="Previous Arrears">

                ${
                  previousArrears > 0
                    ? `
                      <span class="cl-arrears">
                        ${escapeHtml(
                          money(
                            previousArrears
                          )
                        )}
                      </span>
                    `
                    : `
                      <span class="cl-zero">
                        —
                      </span>
                    `
                }

              </td>

              <td data-label="Current Paid">

                <div class="cl-paid-cell">

                  <strong>
                    ${escapeHtml(
                      money(
                        currentPaid
                      )
                    )}
                  </strong>

                  <div
                    class="cl-mini-progress"
                    aria-hidden="true"
                  >

                    <span
                      style="width:${progress}%;"
                    ></span>

                  </div>

                  <small class="cl-sub-detail">

                    Applied:
                    ${escapeHtml(
                      money(
                        appliedThisMonth
                      )
                    )}

                  </small>

                </div>

              </td>

              <td data-label="Carry Forward">

                ${
                  carryForward > 0
                    ? `
                      <span class="cl-carry-forward">
                        ${escapeHtml(
                          money(
                            carryForward
                          )
                        )}
                      </span>
                    `
                    : `
                      <span class="cl-zero">
                        —
                      </span>
                    `
                }

              </td>

              <td data-label="Outstanding">

                ${
                  outstanding > 0
                    ? `
                      <strong
                        class="cl-outstanding-amount"
                      >
                        ${escapeHtml(
                          money(
                            outstanding
                          )
                        )}
                      </strong>
                    `
                    : `
                      <span class="cl-zero">
                        —
                      </span>
                    `
                }

              </td>

              <td data-label="Status">

                <span
                  class="
                    cl-status-badge
                    ${statusClass}
                  "
                >

                  ${escapeHtml(
                    status
                  )}

                </span>

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

  const container =
    document.getElementById(
      "contributionSummary"
    );

  if (!container) {
    return;
  }

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

  const selectedMonth =
    accountingMonth;

  const monthlyTotal =
    contributions
      .filter(
        item =>
          String(
            item.contribution_type ||
            ""
          ).toLowerCase() ===
          "monthly" &&
          getContributionMonth(item) ===
          selectedMonth
      )
      .reduce(
        (
          sum,
          item
        ) =>
          sum +
          number(item.amount),
        0
      );

  const outstandingMembers =
    canonicalMemberStatus.filter(
      account =>
        number(
          account.current_outstanding
        ) > 0
    ).length;

  container.innerHTML = `

    <div class="cl-contribution-summary-card">

      <span>
        TOTAL RECORDED
      </span>

      <strong>
        ${escapeHtml(
          money(total)
        )}
      </strong>

      <small>
        All contribution records
      </small>

    </div>


    <div class="cl-contribution-summary-card">

      <span>
        ${escapeHtml(
          formatAccountingMonth(
            selectedMonth
          )
        ).toUpperCase()}
      </span>

      <strong>
        ${escapeHtml(
          money(monthlyTotal)
        )}
      </strong>

      <small>
        Monthly contributions recorded
      </small>

    </div>


    <div class="cl-contribution-summary-card">

      <span>
        MONTHLY RATE
      </span>

      <strong>
        ${escapeHtml(
          money(
            monthlyContribution
          )
        )}
      </strong>

      <small>
        Expected per active member
      </small>

    </div>


    <div class="cl-contribution-summary-card">

      <span>
        NEEDS ATTENTION
      </span>

      <strong>
        ${escapeHtml(
          String(
            outstandingMembers
          )
        )}
      </strong>

      <small>
        Canonical outstanding members
      </small>

    </div>

  `;

}


/* =========================================================
   CONTRIBUTION GOALS
========================================================= */

function renderContributionGoals() {

  if (!goalProgressContainer) {
    return;
  }

  if (!contributionGoals.length) {

    goalProgressContainer.innerHTML = `

      <div class="cl-goals-empty">

        <strong>
          No active contribution goals
        </strong>

        <span>
          Create a contribution goal to start
          tracking progress.
        </span>

      </div>

    `;

    return;

  }

  goalProgressContainer.innerHTML =
    contributionGoals
      .map(
        goal => {

          const target =
            number(
              goal.target_amount
            );

          const raised =
            contributions
              .filter(
                item =>
                  String(
                    item.goal_id
                  ) ===
                  String(
                    goal.id
                  )
              )
              .reduce(
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

          const percentage =
            target > 0
              ? Math.min(
                  (
                    raised /
                    target
                  ) * 100,
                  100
                )
              : 0;

          return `

            <div class="cl-goal-card">

              <div class="cl-goal-top">

                <div>

                  <strong>
                    ${escapeHtml(
                      goal.goal_name ||
                      "Contribution Goal"
                    )}
                  </strong>

                  ${
                    goal.category
                      ? `
                        <small>
                          ${escapeHtml(
                            goal.category
                          )}
                        </small>
                      `
                      : ""
                  }

                </div>

                <strong>
                  ${escapeHtml(
                    money(raised)
                  )}
                </strong>

              </div>

              <div class="cl-goal-progress">

                <span
                  style="width:${percentage}%;"
                ></span>

              </div>

              <div class="cl-goal-bottom">

                <span>
                  ${escapeHtml(
                    target > 0
                      ? `${money(target)} target`
                      : "No target set"
                  )}
                </span>

                <strong>
                  ${escapeHtml(
                    `${Math.round(
                      percentage
                    )}%`
                  )}
                </strong>

              </div>

            </div>

          `;

        }
      )
      .join("");

}


/* =========================================================
   ACCOUNTING MONTH CHANGE
========================================================= */

async function changeAccountingMonth() {

  const selected =
    getSelectedAccountingMonth();

  accountingMonth =
    selected;

  renderAccountingMonthLabel();

  clearError();

  if (statusEl) {

    statusEl.hidden =
      false;

    statusEl.textContent =
      `Loading ${formatAccountingMonth(
        accountingMonth
      )} canonical accounting...`;

  }

  if (memberStatusRows) {

    memberStatusRows.innerHTML = `

      <tr>

        <td colspan="7">

          Loading ${escapeHtml(
            formatAccountingMonth(
              accountingMonth
            )
          )} canonical accounting...

        </td>

      </tr>

    `;

  }

  try {

    await loadCanonicalMemberStatus(
      accountingMonth
    );

    renderMemberStatus();

    renderSummary();

    if (statusEl) {

      statusEl.textContent =
        `${formatAccountingMonth(
          accountingMonth
        )} accounting loaded.`;

    }

  }
  catch (error) {

    showError(error);

  }

}


/* =========================================================
   RECORD CONTRIBUTION
   CANONICAL 2B PATH
========================================================= */

async function recordContribution(event) {

  event.preventDefault();

  clearError();


  if (!isAuthorizedRecorder()) {

    showError(
      new Error(
        "You are not authorised to record canonical contributions."
      )
    );

    return;

  }


  const memberId =
    memberSelect?.value ||
    "";

  const amount =
    number(
      amountInput?.value
    );

  const contributionDate =
    dateInput?.value ||
    "";

  const contributionType =
    String(
      typeSelect?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  const paymentMethod =
    normalizePaymentMethod(
      methodSelect?.value
    );

  const reference =
    mpesaReference?.value
      ?.trim() ||
    "";

  const normalNotes =
    notesInput?.value
      ?.trim() ||
    "";

  const goalId =
    goalSelect?.value ||
    null;


  if (!memberId) {

    showError(
      new Error(
        "Please select a member."
      )
    );

    return;

  }


  if (
    amount <= 0
  ) {

    showError(
      new Error(
        "Please enter a valid amount greater than zero."
      )
    );

    amountInput?.focus();

    return;

  }


  if (!contributionDate) {

    showError(
      new Error(
        "Please select the contribution date."
      )
    );

    dateInput?.focus();

    return;

  }


  if (!contributionType) {

    showError(
      new Error(
        "Please select the contribution type."
      )
    );

    typeSelect?.focus();

    return;

  }


  const isCustomContribution =
    contributionType.startsWith(
      "custom:"
    );

  const customContributionTypeId =
    isCustomContribution
      ? contributionType.slice(
          "custom:".length
        )
      : null;


  if (
    isCustomContribution &&
    !activeCustomContributions.some(
      item =>
        String(
          item.contribution_type_id ||
          item.contributionTypeId
        ) ===
        String(
          customContributionTypeId
        )
    )
  ) {

    showError(
      new Error(
        "The selected custom contribution is no longer active."
      )
    );

    return;

  }


  if (!paymentMethod) {

    showError(
      new Error(
        "Please select the payment method."
      )
    );

    return;

  }


  if (
    paymentMethod ===
      PAYMENT_METHODS.MPESA &&
    !reference
  ) {

    showError(
      new Error(
        "Please enter the M-Pesa reference."
      )
    );

    mpesaReference?.focus();

    return;

  }


  const month =
    contributionDate.slice(
      0,
      7
    );


  if (
    !/^\d{4}-\d{2}$/.test(
      month
    )
  ) {

    showError(
      new Error(
        "Please enter a valid contribution date."
      )
    );

    return;

  }


  const existing =
    !isCustomContribution &&
    contributions.some(
      item =>
        String(item.member_id) ===
          String(memberId) &&
        String(
          item.contribution_type ||
          ""
        ).toLowerCase() ===
          "monthly" &&
        getContributionMonth(item) ===
          month
    );


  if (existing) {

    const proceed =
      window.confirm(

        `This member already has a monthly contribution for ${month}.\n\n` +

        `You can still record another payment. ` +

        `Any excess payment will be handled by canonical accounting.\n\n` +

        `Continue?`

      );


    if (!proceed) {
      return;
    }

  }


  const finalNotes =
    String(
      normalNotes
    ).trim() ||
    null;


  let idempotencyKey;

  try {

    idempotencyKey =
      getContributionIdempotencyKey();

  }
  catch (error) {

    showError(error);

    return;

  }


  if (saveButton) {

    saveButton.disabled =
      true;

    saveButton.textContent =
      "Saving...";

  }


  if (statusEl) {

    statusEl.hidden =
      false;

    statusEl.textContent =
      "Recording contribution securely...";

  }


  try {

    let data;
    let error;


    /*
     * MONTHLY CONTRIBUTION
     *
     * Canonical 2B accounting RPC.
     */
    if (!isCustomContribution) {

      ({
        data,
        error
      } =
        await supabase.rpc(
          "cl_2b_record_contribution",
          {
            p_group_id:
              groupId,

            p_member_id:
              memberId,

            p_amount:
              amount,

            p_contribution_type:
              "monthly",

            p_contribution_date:
              contributionDate,

            p_payment_method:
              paymentMethod,

            p_reference:
              reference ||
              null,

            p_notes:
              finalNotes,

            p_goal_id:
              goalId,

            p_idempotency_key:
              idempotencyKey
          }
        ));

    }


    /*
     * CUSTOM CONTRIBUTION
     *
     * Dedicated backend-owned custom payment RPC.
     */
    else {

      ({
        data,
        error
      } =
        await supabase.rpc(
          "record_custom_contribution_payment",
          {
            p_group_id:
              groupId,

            p_member_id:
              memberId,

            p_contribution_type_id:
              customContributionTypeId,

            p_amount:
              amount,

            p_contribution_date:
              contributionDate,

            p_payment_method:
              paymentMethod,

            p_reference:
              reference ||
              null,

            p_notes:
              finalNotes,

            p_request_id:
              idempotencyKey
          }
        ));

    }


    if (error) {

      throw error;

    }


    console.log(
      "CHAMA LIVE: Atomic contribution RPC completed",
      {
        groupId,
        memberId,
        amount,
        contributionType:
          isCustomContribution
            ? customContributionTypeId
            : "monthly",
        contributionDate,
        paymentMethod,
        idempotencyKey,
        result:
          data
      }
    );


    /*
     * Refresh the selected accounting month for
     * monthly payments.
     */
    if (!isCustomContribution) {

      accountingMonth =
        month;

      if (
        accountingMonthSelect
      ) {

        accountingMonthSelect.value =
          accountingMonth;

      }

      renderAccountingMonthLabel();

      await loadCanonicalMemberStatus(
        accountingMonth
      );

    }


    /*
     * Always refresh the contribution ledger.
     */
    await loadContributions();


    /*
     * Custom contribution status/type list is also
     * refreshed after every successful custom payment.
     */
    if (
      isCustomContribution
    ) {

      await loadActiveCustomContributions();

    }


    renderContributionTypeOptions(
      "monthly"
    );

    renderLedger();

    renderMemberStatus();

    renderSummary();

    renderContributionGoals();


    form?.reset();


    if (dateInput) {

      dateInput.value =
        todayString();

    }


    if (typeSelect) {

      typeSelect.value =
        "monthly";

    }


    if (methodSelect) {

      methodSelect.value =
        PAYMENT_METHODS.MPESA;

    }


    if (goalSelect) {

      goalSelect.value =
        "";

    }


    updatePaymentMethod();


    if (
      amountInput &&
      monthlyContribution > 0
    ) {

      amountInput.value =
        monthlyContribution;

    }


    resetContributionIdempotencyKey();

    clearError();


    if (statusEl) {

      statusEl.hidden =
        false;

      statusEl.textContent =
        isCustomContribution
          ? "✓ Custom contribution payment recorded atomically. The active contribution list and ledger are current."
          : `✓ Contribution recorded atomically. ${formatAccountingMonth(
              accountingMonth
            )} canonical accounting is current.`;

    }

  }
  catch (error) {

    /*
     * Do not reset the idempotency key on failure.
     */
    showError(error);

  }
  finally {

    if (saveButton) {

      saveButton.disabled =
        false;

      saveButton.textContent =
        "Record Contribution";

    }

  }

}


/* =========================================================
   CUSTOM CONTRIBUTION EDITOR
========================================================= */

function showCustomContributionEditorMessage(
  message,
  type = "info"
) {

  if (!customContributionEditorMessage) {
    return;
  }

  customContributionEditorMessage.hidden =
    false;

  customContributionEditorMessage.textContent =
    message;

  customContributionEditorMessage.className =
    "cl-evidence-message" +
    (
      type === "error"
        ? " error"
        : type === "success"
          ? " success"
          : ""
    );

}


function clearCustomContributionEditorMessage() {

  if (!customContributionEditorMessage) {
    return;
  }

  customContributionEditorMessage.hidden =
    true;

  customContributionEditorMessage.textContent =
    "";

  customContributionEditorMessage.className =
    "cl-evidence-message";

}


function syncCustomContributionFineControl() {

  if (
    !customContributionApplyFine ||
    !customContributionFineAmount
  ) {
    return;
  }

  customContributionFineAmount.disabled =
    !customContributionApplyFine.checked;

  if (
    !customContributionApplyFine.checked
  ) {

    customContributionFineAmount.value =
      "";

  }

}


function resetCustomContributionEditor() {

  customContributionForm?.reset();

  if (
    customContributionGraceDays
  ) {

    customContributionGraceDays.value =
      "0";

  }

  if (
    customContributionApplyFine
  ) {

    customContributionApplyFine.checked =
      false;

  }

  syncCustomContributionFineControl();

  clearCustomContributionEditorMessage();

}


function closeCustomContributionEditor() {

  if (
    customContributionEditorCard
  ) {

    customContributionEditorCard.hidden =
      true;

  }

  resetCustomContributionEditor();

  const url =
    new URL(
      window.location.href
    );

  url.searchParams.delete(
    "new"
  );

  window.history.replaceState(
    {},
    "",
    url.toString()
  );

}


function openCustomContributionEditor() {

  if (
    !customContributionEditorCard
  ) {
    return;
  }

  customContributionEditorCard.hidden =
    false;

  resetCustomContributionEditor();

  customContributionName?.focus();

  customContributionEditorCard.scrollIntoView({
    behavior:
      "smooth",

    block:
      "start"
  });

}


async function saveCustomContributionDraft(
  event
) {

  event.preventDefault();

  clearCustomContributionEditorMessage();


  if (!groupId) {

    showCustomContributionEditorMessage(
      "The current group could not be determined.",
      "error"
    );

    return;

  }


  if (!isAuthorizedRecorder()) {

    showCustomContributionEditorMessage(
      "You are not authorised to create custom contributions.",
      "error"
    );

    return;

  }


  const name =
    customContributionName?.value.trim() ||
    "";

  const amount =
    Number(
      customContributionAmount?.value
    );

  const frequency =
    customContributionCycle?.value ||
    "";

  const startDate =
    customContributionStartDate?.value ||
    "";

  const dueDate =
    customContributionDueDate?.value ||
    "";

  const closingDate =
    customContributionClosingDate?.value ||
    "";

  const description =
    customContributionDescription?.value.trim() ||
    "";

  const graceDays =
    Number(
      customContributionGraceDays?.value ||
      0
    );

  const applyFine =
    Boolean(
      customContributionApplyFine?.checked
    );

  const fineAmount =
    Number(
      customContributionFineAmount?.value
    );


  if (!name) {

    showCustomContributionEditorMessage(
      "Contribution name is required.",
      "error"
    );

    return;

  }


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    showCustomContributionEditorMessage(
      "Amount due must be greater than zero.",
      "error"
    );

    return;

  }


  if (
    ![
      "one_time",
      "weekly",
      "monthly",
      "quarterly",
      "annual"
    ].includes(
      frequency
    )
  ) {

    showCustomContributionEditorMessage(
      "Invalid contribution cycle.",
      "error"
    );

    return;

  }


  if (
    !startDate ||
    !dueDate ||
    !closingDate
  ) {

    showCustomContributionEditorMessage(
      "Start date, due date, and closing date are required.",
      "error"
    );

    return;

  }


  if (
    startDate > dueDate ||
    dueDate > closingDate
  ) {

    showCustomContributionEditorMessage(
      "Dates must follow Start ≤ Due ≤ Closing.",
      "error"
    );

    return;

  }


  if (
    !Number.isInteger(graceDays) ||
    graceDays < 0
  ) {

    showCustomContributionEditorMessage(
      "Grace period must be a whole number of days.",
      "error"
    );

    return;

  }


  if (
    applyFine &&
    (
      !Number.isFinite(fineAmount) ||
      fineAmount <= 0
    )
  ) {

    showCustomContributionEditorMessage(
      "Fine amount must be greater than zero when a fine is enabled.",
      "error"
    );

    return;

  }


  const requestId =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : null;


  if (!requestId) {

    showCustomContributionEditorMessage(
      "Secure request ID generation is unavailable in this browser.",
      "error"
    );

    return;

  }


  if (
    saveCustomContribution
  ) {

    saveCustomContribution.disabled =
      true;

  }


  showCustomContributionEditorMessage(
    "Creating custom contribution…"
  );


  try {

    /*
     * -----------------------------------------------------
     * CREATE CUSTOM CONTRIBUTION
     * -----------------------------------------------------
     *
     * Backend remains authoritative.
     */
    const {
      data,
      error
    } =
      await supabase.rpc(
        "create_custom_contribution",
        {
          p_group_id:
            groupId,

          p_name:
            name,

          p_description:
            description,

          p_amount:
            amount,

          p_frequency:
            frequency,

          p_start_date:
            startDate,

          p_due_date:
            dueDate,

          p_closing_date:
            closingDate,

          p_grace_period_value:
            graceDays,

          p_apply_fine:
            applyFine,

          p_fine_amount:
            applyFine
              ? fineAmount
              : null,

          p_request_id:
            requestId
        }
      );


    if (error) {

      throw error;

    }


    const result =
      Array.isArray(data)
        ? data[0] ||
          null
        : data ||
          null;


    if (
      !result?.ok
    ) {

      throw new Error(
        "The backend did not return a successful custom contribution result."
      );

    }


    if (
      !result?.period_id
    ) {

      throw new Error(
        "The backend did not return a valid custom contribution period."
      );

    }


    /*
     * -----------------------------------------------------
     * ACTIVATE CUSTOM CONTRIBUTION
     * -----------------------------------------------------
     */
    const activationRequestId =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : null;


    if (!activationRequestId) {

      throw new Error(
        "Secure activation request ID generation is unavailable in this browser."
      );

    }


    const {
      data:
        activationData,
      error:
        activationError
    } =
      await supabase.rpc(
        "activate_custom_contribution",
        {
          p_group_id:
            groupId,

          p_period_id:
            result.period_id,

          p_request_id:
            activationRequestId
        }
      );


    if (
      activationError
    ) {

      throw activationError;

    }


    const activation =
      Array.isArray(
        activationData
      )
        ? activationData[0] ||
          null
        : activationData ||
          null;


    const activationStatus =
      String(
        activation?.status ||
        ""
      )
        .trim()
        .toLowerCase();


    if (
      !activation?.ok ||
      ![
        "open",
        "due",
        "grace"
      ].includes(
        activationStatus
      )
    ) {

      throw new Error(
        "The custom contribution was saved but could not be activated."
      );

    }


    /*
     * -----------------------------------------------------
     * IMPORTANT:
     * Immediately reload the backend's active contribution
     * list before closing the editor.
     *
     * This prevents the new Custom contribution from
     * disappearing from the recording selector until a
     * full page reload.
     * -----------------------------------------------------
     */
    await loadActiveCustomContributions();


    /*
     * Preserve the newly created contribution in the
     * selector if the backend returned its type ID.
     */
    const createdContributionTypeId =
      result.contribution_type_id ||
      result.type_id ||
      activation.contribution_type_id ||
      activation.type_id ||
      null;


    const preferredCustomValue =
      createdContributionTypeId
        ? `custom:${createdContributionTypeId}`
        : null;


    renderContributionTypeOptions(
      preferredCustomValue
    );


    /*
     * Refresh contribution-related reads.
     *
     * No frontend accounting mutation is performed.
     */
    await loadContributions();

    await loadCanonicalMemberStatus(
      accountingMonth
    );


    renderLedger();

    renderMemberStatus();

    renderSummary();

    renderContributionGoals();


    /*
     * The contribution is now deliberately left visible
     * in the active contribution selector.
     */
    showCustomContributionEditorMessage(
      activation.replayed
        ? "Custom contribution activation was replayed safely. It remains active and available for recording."
        : "Custom contribution saved and activated. It is now ongoing and available in the contribution-type list.",
      "success"
    );


    if (statusEl) {

      statusEl.hidden =
        false;

      statusEl.textContent =
        "✓ Custom contribution is active and available for recording.";

    }


    /*
     * Close the editor only after the active contribution
     * has been successfully reloaded into the page state.
     */
    setTimeout(
      () => {

        closeCustomContributionEditor();

      },
      700
    );

  }
  catch (error) {

    console.error(
      "Failed to create custom contribution:",
      error
    );

    showCustomContributionEditorMessage(
      error?.message ||
        "Custom contribution could not be created.",
      "error"
    );

  }
  finally {

    if (
      saveCustomContribution
    ) {

      saveCustomContribution.disabled =
        false;

    }

  }

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initContributions(
  options = {}
) {

  const force =
    Boolean(
      options?.force
    );


  if (
    initialized &&
    !force
  ) {

    return;

  }


  initialized =
    true;


  try {

    clearError();

    clearMemberEvidenceMessage();

    clearVerifierPaymentEvidenceMessage();


    /*
     * Resolve authenticated member through the
     * existing canonical auth/member path.
     */
    currentMember =
      await getMyMember();


    configureMemberPaymentEvidence();

    configureVerifierPaymentEvidence();


    buildAccountingMonthOptions();

    renderAccountingMonthLabel();


    if (
      contributionIdempotencyKeyInput &&
      !String(
        contributionIdempotencyKeyInput.value ||
        ""
      ).trim()
    ) {

      resetContributionIdempotencyKey();

    }


    if (statusEl) {

      statusEl.hidden =
        false;

      statusEl.textContent =
        "Loading contributions...";

    }


    groupId =
      await getGroupId();


    await Promise.all([

      loadGroup(),

      loadMembers(),

      loadActiveCustomContributions(),

      loadContributions(),

      loadContributionGoals()

    ]);


    /*
     * Build the contribution selector only after
     * the active custom list has been loaded.
     */
    renderContributionTypeOptions(
      typeSelect?.value ||
      "monthly"
    );


    await loadCanonicalMemberStatus(
      accountingMonth
    );


    if (dateInput) {

      dateInput.value =
        todayString();

    }


    if (
      memberEvidenceDate &&
      !memberEvidenceDate.value
    ) {

      memberEvidenceDate.value =
        todayString();

    }


    if (typeSelect) {

      /*
       * Preserve an already-selected active custom
       * contribution where possible.
       */
      const currentType =
        String(
          typeSelect.value ||
          ""
        );

      const currentStillExists =
        Array.from(
          typeSelect.options
        ).some(
          option =>
            option.value ===
            currentType
        );

      typeSelect.value =
        currentStillExists
          ? currentType
          : "monthly";

    }


    if (methodSelect) {

      methodSelect.value =
        PAYMENT_METHODS.MPESA;

    }


    if (memberEvidenceMethod) {

      memberEvidenceMethod.value =
        PAYMENT_METHODS.MPESA;

    }


    updatePaymentMethod();

    updateMemberEvidencePaymentMethod();


    if (
      amountInput &&
      monthlyContribution > 0 &&
      (
        !amountInput.value ||
        number(
          amountInput.value
        ) ===
          monthlyContribution
      )
    ) {

      amountInput.value =
        monthlyContribution;

    }


    configureMemberPaymentEvidence();

    configureVerifierPaymentEvidence();


    if (
      isOrdinaryMember()
    ) {

      await loadMemberPaymentEvidence();

    }


    if (
      isAuthorizedVerifier()
    ) {

      await loadVerifierPaymentEvidence();

    }


    renderAccountingMonthLabel();

    renderLedger();

    renderMemberStatus();

    renderSummary();

    renderContributionGoals();


    /*
     * Support ?new=custom.
     *
     * This occurs only after group resolution so the
     * editor can safely submit against the current group.
     */
    if (
      new URLSearchParams(
        window.location.search
      ).get("new") ===
      "custom"
    ) {

      openCustomContributionEditor();

    }


    if (statusEl) {

      statusEl.textContent =
        `${formatAccountingMonth(
          accountingMonth
        )} accounting loaded.`;

    }


    console.log(
      "CHAMA LIVE: Contributions ready.",
      {
        groupId,

        accountingMonth,

        memberId:
          currentMember?.id ||
          null,

        role:
          getCurrentMemberRole(),

        activeCustomContributions:
          activeCustomContributions.length
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

if (
  customContributionApplyFine &&
  !customContributionApplyFine.dataset
    .clCustomFineBound
) {

  customContributionApplyFine.dataset
    .clCustomFineBound =
    "true";

  customContributionApplyFine.addEventListener(
    "change",
    syncCustomContributionFineControl
  );

}


if (
  customContributionForm &&
  !customContributionForm.dataset
    .clCustomContributionBound
) {

  customContributionForm.dataset
    .clCustomContributionBound =
    "true";

  customContributionForm.addEventListener(
    "submit",
    saveCustomContributionDraft
  );

}


if (
  cancelCustomContribution &&
  !cancelCustomContribution.dataset
    .clCustomContributionCancelBound
) {

  cancelCustomContribution.dataset
    .clCustomContributionCancelBound =
    "true";

  cancelCustomContribution.addEventListener(
    "click",
    closeCustomContributionEditor
  );

}


if (
  form &&
  !form.dataset.clContributionBound
) {

  form.dataset
    .clContributionBound =
    "true";

  form.addEventListener(
    "submit",
    recordContribution
  );

}


if (
  methodSelect &&
  !methodSelect.dataset.clPaymentBound
) {

  methodSelect.dataset
    .clPaymentBound =
    "true";

  methodSelect.addEventListener(
    "change",
    updatePaymentMethod
  );

}


if (
  accountingMonthSelect &&
  !accountingMonthSelect.dataset
    .clAccountingMonthBound
) {

  accountingMonthSelect.dataset
    .clAccountingMonthBound =
    "true";

  accountingMonthSelect.addEventListener(
    "change",
    changeAccountingMonth
  );

}


if (
  memberPaymentEvidenceForm &&
  !memberPaymentEvidenceForm.dataset
    .clMemberEvidenceBound
) {

  memberPaymentEvidenceForm.dataset
    .clMemberEvidenceBound =
    "true";

  memberPaymentEvidenceForm.addEventListener(
    "submit",
    submitMemberPaymentEvidence
  );

}


if (
  memberEvidenceMethod &&
  !memberEvidenceMethod.dataset
    .clMemberEvidencePaymentBound
) {

  memberEvidenceMethod.dataset
    .clMemberEvidencePaymentBound =
    "true";

  memberEvidenceMethod.addEventListener(
    "change",
    updateMemberEvidencePaymentMethod
  );

}


/* =========================================================
   VERIFIER EVENTS
========================================================= */

if (
  verifierPaymentEvidenceCard &&
  !verifierPaymentEvidenceCard.dataset
    .clVerifierEvidenceBound
) {

  verifierPaymentEvidenceCard.dataset
    .clVerifierEvidenceBound =
    "true";

  verifierPaymentEvidenceCard.addEventListener(
    "click",
    handleVerifierPaymentEvidenceClick
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

        void initContributions();

      }

    },
    {
      once:
        true
    }
  );

}
else {

  if (
    !window.__CHAMA_LIVE_LAYOUT_LOADING__
  ) {

    void initContributions();

  }

}


console.log(
  "CHAMA LIVE: contributions.js ready"
);
