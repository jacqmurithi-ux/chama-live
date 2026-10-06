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
   • Active Custom Contribution definitions are read from
     contribution_types + contribution_periods.
   • The frontend never creates accounting obligations,
     allocations, fines, credits, or balances.
========================================================= */

import {
  supabase
} from "./supabase.js";

import {
  getMyApplicationContext
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

const contributionRows =
  document.getElementById("contributionRows");

const notesInput =
  document.getElementById("notes");

const goalSelect =
  document.getElementById("goal") ||
  document.getElementById(
    "contributionGoal"
  );

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

const customContributionFineWrap =
  document.getElementById(
    "customContributionFineWrap"
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
   OPTIONAL ACTIVE CUSTOM CONTRIBUTION DISPLAY
========================================================= */

const activeCustomContributionRows =
  document.getElementById(
    "activeCustomContributionRows"
  );

const activeCustomContributionContainer =
  document.getElementById(
    "activeCustomContributionContainer"
  );

const draftCustomContributionsCard =
  document.getElementById(
    "draftCustomContributionsCard"
  );

const draftCustomContributionRows =
  document.getElementById(
    "draftCustomContributionRows"
  );


/* =========================================================
   STATE
========================================================= */

let groupId = null;

let members = [];

let contributions = [];

let contributionGoals = [];

let activeCustomContributions = [];

let draftCustomContributions = [];

let memberPaymentEvidence = [];

let verifierPaymentEvidence = [];

let currentMember = null;

let isGroupOwner = false;

let monthlyContribution = 0;

let initialized = false;

let accountingMonth =
  getCurrentMonth();

let selectedVerifierEvidenceId =
  null;


/*
 * Keeps the Custom Contribution that was just created
 * selected until the backend refresh confirms the
 * contribution is active.
 */
let preferredCustomContributionValue =
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


const RECORDER_ROLES = new Set([

  "admin",

  "administrator",

  "chairperson",

  "treasurer",

  "secretary"

]);


const CUSTOM_CONTRIBUTION_ACTIVATOR_ROLES = new Set([

  "chairperson"

]);


const VERIFIER_ROLES = new Set([

  "admin",

  "chairperson",

  "secretary",

  "treasurer"

]);


const ACTIVE_CUSTOM_PERIOD_STATUSES = new Set([

  "open",

  "due",

  "grace"

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


/*
 * Canonical date-only value for RPC parameters.
 *
 * HTML date inputs already expose YYYY-MM-DD, but normalize
 * and validate explicitly before sending the value to Supabase.
 * This prevents locale/timezone conversions from changing the
 * accounting date.
 */
function normalizeContributionDate(value) {

  const date =
    String(value || "").trim();

  if (
    !/^\\d{4}-\\d{2}-\\d{2}$/.test(
      date
    )
  ) {

    return "";

  }

  const [year, month, day] =
    date.split("-").map(Number);

  const parsed =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {

    return "";

  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
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


function safeUuid() {

  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {

    return crypto.randomUUID();

  }

  throw new Error(
    "Secure request ID generation is unavailable in this browser."
  );

}


function normalizeRpcResult(data) {

  if (Array.isArray(data)) {

    return data[0] || null;

  }

  return data || null;

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

  return value || "";

}


/*
 * Keep the canonical recording form's M-Pesa reference field
 * synchronized with the selected payment method. This is a
 * presentation/validation helper only; canonical accounting
 * remains backend-owned.
 */
function updatePaymentMethod() {

  if (!methodSelect || !mpesaReferenceWrap) {
    return;
  }

  const method =
    normalizePaymentMethod(
      methodSelect.value
    );

  const isMpesa =
    method === PAYMENT_METHODS.MPESA;

  mpesaReferenceWrap.hidden =
    !isMpesa;

  if (mpesaReference) {
    mpesaReference.required =
      isMpesa;

    if (!isMpesa) {
      mpesaReference.value = "";
    }
  }

}


/*
 * Keep the member payment-evidence form's M-Pesa reference
 * field synchronized with its selected payment method.
 * Evidence remains pending until backend verification.
 */
function updateMemberEvidencePaymentMethod() {

  if (
    !memberEvidenceMethod ||
    !memberEvidenceMpesaWrap
  ) {
    return;
  }

  const method =
    normalizePaymentMethod(
      memberEvidenceMethod.value
    );

  const isMpesa =
    method === PAYMENT_METHODS.MPESA;

  memberEvidenceMpesaWrap.hidden =
    !isMpesa;

  if (memberEvidenceMpesaReference) {
    memberEvidenceMpesaReference.required =
      isMpesa;

    if (!isMpesa) {
      memberEvidenceMpesaReference.value = "";
    }
  }

}


/* =========================================================
   IDEMPOTENCY
========================================================= */

function generateIdempotencyKey() {

  return safeUuid();

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

async function loadActiveCustomContributions() {

  activeCustomContributions = [];

  if (!groupId) {

    return [];

  }


  const {
    data: contributionTypes,
    error: contributionTypeError
  } =
    await supabase
      .from("contribution_types")
      .select(
        "id,group_id,name,code"
      )
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "code",
        "custom"
      );


  if (contributionTypeError) {

    throw contributionTypeError;

  }


  const customTypes =
    Array.isArray(
      contributionTypes
    )
      ? contributionTypes
      : [];


  if (!customTypes.length) {
    return [];

  }


  const customTypeIds =
    customTypes.map(
      type =>
        type.id
    );


  const {
    data: periods,
    error: periodError
  } =
    await supabase
      .from("contribution_periods")
      .select(
        [
          "id",
          "group_id",
          "contribution_type_id",
          "period_key",
          "opening_date",
          "due_date",
          "closing_date",
          "amount",
          "frequency",
          "status",
          "description",
          "fine_rule_id"
        ].join(",")
      )
      .eq(
        "group_id",
        groupId
      )
      .in(
        "contribution_type_id",
        customTypeIds
      )
      .in(
        "status",
        Array.from(
          ACTIVE_CUSTOM_PERIOD_STATUSES
        )
      )
      .order(
        "opening_date",
        {
          ascending: false
        }
      );


  if (periodError) {

    throw periodError;

  }


  const typeById =
    new Map(
      customTypes.map(
        type => [
          String(type.id),
          type
        ]
      )
    );


  activeCustomContributions =
    (
      Array.isArray(periods)
        ? periods
        : []
    )
      .filter(
        period =>
          typeById.has(
            String(
              period.contribution_type_id
            )
          )
      )
      .map(
        period => {

          const type =
            typeById.get(
              String(
                period.contribution_type_id
              )
            );

          return {

            ...period,

            contributionTypeId:
              period.contribution_type_id,

            contribution_name:
              type?.name ||
              "Custom Contribution",

            name:
              type?.name ||
              "Custom Contribution",

            contribution_code:
              type?.code ||
              "custom"

          };

        }
      );

  return activeCustomContributions;

}


/* =========================================================
   DRAFT CUSTOM CONTRIBUTIONS
========================================================= */

async function loadDraftCustomContributions() {

  draftCustomContributions = [];

  if (!groupId) {

    renderDraftCustomContributionList();

    return [];

  }


  const {
    data: contributionTypes,
    error: contributionTypeError
  } =
    await supabase
      .from("contribution_types")
      .select(
        "id,group_id,name,code"
      )
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "code",
        "custom"
      );


  if (contributionTypeError) {

    throw contributionTypeError;

  }


  const customTypes =
    Array.isArray(
      contributionTypes
    )
      ? contributionTypes
      : [];


  if (!customTypes.length) {

    renderDraftCustomContributionList();

    return [];

  }


  const customTypeIds =
    customTypes.map(
      type =>
        type.id
    );


  const {
    data: periods,
    error: periodError
  } =
    await supabase
      .from("contribution_periods")
      .select(
        [
          "id",
          "group_id",
          "contribution_type_id",
          "period_key",
          "opening_date",
          "due_date",
          "closing_date",
          "amount",
          "frequency",
          "status",
          "description",
          "fine_rule_id"
        ].join(",")
      )
      .eq(
        "group_id",
        groupId
      )
      .in(
        "contribution_type_id",
        customTypeIds
      )
      .eq(
        "status",
        "draft"
      )
      .order(
        "opening_date",
        {
          ascending: false
        }
      );


  if (periodError) {

    throw periodError;

  }


  const typeById =
    new Map(
      customTypes.map(
        type => [
          String(type.id),
          type
        ]
      )
    );


  draftCustomContributions =
    (
      Array.isArray(periods)
        ? periods
        : []
    )
      .filter(
        period =>
          typeById.has(
            String(
              period.contribution_type_id
            )
          )
      )
      .map(
        period => {

          const type =
            typeById.get(
              String(
                period.contribution_type_id
              )
            );

          return {

            ...period,

            contributionTypeId:
              period.contribution_type_id,

            contribution_name:
              type?.name ||
              "Custom Contribution",

            name:
              type?.name ||
              "Custom Contribution",

            contribution_code:
              type?.code ||
              "custom"

          };

        }
      );


  renderDraftCustomContributionList();


  return draftCustomContributions;

}


/* =========================================================
   DRAFT CUSTOM CONTRIBUTION DISPLAY
========================================================= */

function renderDraftCustomContributionList() {

  if (
    !draftCustomContributionsCard ||
    !draftCustomContributionRows
  ) {

    return;

  }


  const canActivate =
    isGroupOwner ||
    CUSTOM_CONTRIBUTION_ACTIVATOR_ROLES.has(
      getCurrentMemberRole()
    );


  if (!draftCustomContributions.length) {

    draftCustomContributionsCard.hidden =
      true;

    draftCustomContributionRows.innerHTML =
      "";

    return;

  }


  draftCustomContributionsCard.hidden =
    false;


  draftCustomContributionRows.innerHTML =
    draftCustomContributions
      .map(
        item => {

          const name =
            item.contribution_name ||
            item.name ||
            "Custom Contribution";

          const amount =
            number(
              item.amount
            );

          const frequency =
            item.frequency ||
            "—";

          const openingDate =
            item.opening_date
              ? formatDate(
                  item.opening_date
                )
              : "—";

          const dueDate =
            item.due_date
              ? formatDate(
                  item.due_date
                )
              : "—";

          const closingDate =
            item.closing_date
              ? formatDate(
                  item.closing_date
                )
              : "—";

          const description =
            String(
              item.description ||
              ""
            ).trim();


          return `

            <div
              class="cl-draft-contribution-card"
            >

              <div
                class="cl-draft-contribution-main"
              >

                <div
                  class="cl-draft-contribution-name"
                >
                  ${escapeHtml(name)}
                </div>

                <div
                  class="cl-draft-contribution-meta"
                >

                  <span>
                    <strong>Amount:</strong>
                    ${escapeHtml(
                      money(amount)
                    )}
                  </span>

                  <span>
                    <strong>Cycle:</strong>
                    ${escapeHtml(
                      frequency
                    )}
                  </span>

                  <span>
                    <strong>Start:</strong>
                    ${escapeHtml(
                      openingDate
                    )}
                  </span>

                  <span>
                    <strong>Due:</strong>
                    ${escapeHtml(
                      dueDate
                    )}
                  </span>

                  <span>
                    <strong>Closing:</strong>
                    ${escapeHtml(
                      closingDate
                    )}
                  </span>

                </div>

                ${
                  description
                    ? `
                      <div
                        class="cl-draft-contribution-description"
                      >
                        ${escapeHtml(
                          description
                        )}
                      </div>
                    `
                    : ""
                }

              </div>

              <div
                class="cl-draft-contribution-actions"
              >

                <span
                  class="cl-draft-status-badge"
                >
                  DRAFT
                </span>

                ${
                  canActivate
                    ? `
                      <button
                        type="button"
                        class="cl-draft-activate-button"
                        data-activate-custom-contribution="${escapeHtml(
                          item.id
                        )}"
                      >
                        Activate
                      </button>
                    `
                    : ""
                }

              </div>

            </div>

          `;

        }
      )
      .join("");


  if (!canActivate) {

    const note =
      document.createElement("div");

    note.className =
      "cl-draft-contribution-empty";

    note.textContent =
      "Only the group owner, administrator or chairperson can activate a custom contribution.";

    draftCustomContributionRows.appendChild(
      note
    );

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


  let amount =
    number(
      amountInput?.value
    );


  const contributionDate =
    normalizeContributionDate(
      dateInput?.value
    );


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
        "Please select a valid contribution date in YYYY-MM-DD format."
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
    isCustomContribution
  ) {

    let activeCustom =
      findActiveCustomContribution(
        customContributionTypeId
      );


    if (!activeCustom) {

      await refreshActiveCustomContributions(
        contributionType
      );


      activeCustom =
        findActiveCustomContribution(
          customContributionTypeId
        );


      if (!activeCustom) {

        showError(
          new Error(
            "The selected custom contribution is no longer active."
          )
        );

        return;

      }

    }


    /*
     * The configured Custom amount is authoritative for
     * the normal payment amount shown by the UI.
     *
     * The backend RPC remains authoritative and must
     * enforce its own accounting rules.
     */
    if (
      number(activeCustom.amount) > 0
    ) {

      amount =
        number(activeCustom.amount);

      if (amountInput) {

        amountInput.value =
          amount;

      }

    }

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


  /*
   * contributionDate is now guaranteed to be an exact
   * PostgreSQL date-compatible YYYY-MM-DD value.
   */
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


  /*
   * Monthly duplicate warning only.
   *
   * Custom Contribution payments do not participate
   * in the monthly duplicate warning.
   */
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
      isCustomContribution
        ? "Recording custom contribution payment securely..."
        : "Recording monthly contribution securely...";

  }


  try {

    let data;

    let error;


    /* =====================================================
       MONTHLY
    ===================================================== */

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


    /* =====================================================
       CUSTOM CONTRIBUTION
    ===================================================== */

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


    /* =====================================================
       REFRESH MONTHLY ACCOUNTING
    ===================================================== */

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

    }


    /* =====================================================
       REFRESH READ-ONLY STATE
    ===================================================== */

    await loadContributions();


    if (
      isCustomContribution
    ) {

      preferredCustomContributionValue =
        `custom:${customContributionTypeId}`;


      await loadActiveCustomContributions();

    }


    renderContributionTypeOptions(
      isCustomContribution
        ? `custom:${customContributionTypeId}`
        : "monthly"
    );

    renderLedger();

    renderSummary();

    renderContributionGoals();


    /*
     * Reset ordinary form controls.
     *
     * The Custom definition itself is NOT removed.
     */
    form?.reset();


    if (dateInput) {

      dateInput.value =
        todayString();

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


    /*
     * Restore amount based on selected contribution type.
     */
    if (
      isCustomContribution
    ) {

      const customValue =
        `custom:${customContributionTypeId}`;


      renderContributionTypeOptions(
        customValue
      );


      if (typeSelect) {

        typeSelect.value =
          customValue;

      }


      updateContributionAmountFromType();

    }
    else {

      if (typeSelect) {

        typeSelect.value =
          "monthly";

      }


      preferredCustomContributionValue =
        null;


      if (
        amountInput &&
        monthlyContribution > 0
      ) {

        amountInput.value =
          monthlyContribution;

      }

    }


    resetContributionIdempotencyKey();

    clearError();


    if (statusEl) {

      statusEl.hidden =
        false;


      statusEl.textContent =
        isCustomContribution
          ? "✓ Custom contribution payment recorded atomically. The contribution remains active and available for further payments."
          : `✓ Contribution recorded atomically. ${formatAccountingMonth(
              accountingMonth
            )} canonical accounting is current.`;

    }

  }
  catch (error) {

    /*
     * Do NOT reset the idempotency key after failure.
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


  const enabled =
    customContributionApplyFine.checked;


  customContributionFineAmount.disabled =
    !enabled;


  customContributionFineAmount.required =
    enabled;


  if (
    customContributionFineWrap
  ) {

    customContributionFineWrap.classList.toggle(
      "cl-visible",
      enabled
    );

  }


  if (!enabled) {

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


/* =========================================================
   EXISTING CUSTOM CONTRIBUTION PREFLIGHT
========================================================= */

async function preflightExistingCustomContribution() {

  if (!groupId) return null;

  const {
    data: contributionTypes,
    error: contributionTypeError
  } = await supabase
    .from("contribution_types")
    .select("id,group_id,name,code")
    .eq("group_id", groupId)
    .eq("code", "custom")
    .limit(1);

  if (contributionTypeError) throw contributionTypeError;

  const customType =
    Array.isArray(contributionTypes)
      ? contributionTypes[0]
      : null;

  if (!customType?.id) return null;

  const {
    data: periods,
    error: periodError
  } = await supabase
    .from("contribution_periods")
    .select([
      "id",
      "group_id",
      "contribution_type_id",
      "period_key",
      "opening_date",
      "due_date",
      "closing_date",
      "amount",
      "frequency",
      "status",
      "description",
      "fine_rule_id"
    ].join(","))
    .eq("group_id", groupId)
    .eq("contribution_type_id", customType.id)
    .in("status", [
      "draft",
      ...Array.from(ACTIVE_CUSTOM_PERIOD_STATUSES)
    ])
    .order("opening_date", { ascending: false });

  if (periodError) throw periodError;

  const existingPeriods =
    Array.isArray(periods) ? periods : [];

  const draft =
    existingPeriods.find(
      period =>
        String(period.status || "").trim().toLowerCase() === "draft"
    ) || null;

  if (draft) {

    await loadDraftCustomContributions();

    const refreshedDraft =
      draftCustomContributions.find(
        item => String(item.id) === String(draft.id)
      ) || draft;

    showCustomContributionEditorMessage(
      (customType.name || "Custom contribution") +
        " already exists as a draft. Activate the existing contribution below instead of creating another one.",
      "success"
    );

    if (draftCustomContributionsCard) {
      draftCustomContributionsCard.hidden = false;
      draftCustomContributionsCard.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    const activateButton =
      Array.from(
        draftCustomContributionRows?.querySelectorAll(
          "[data-activate-custom-contribution]"
        ) || []
      ).find(
        button =>
          String(button.dataset.activateCustomContribution || "") ===
          String(refreshedDraft.id)
      );

    if (activateButton) activateButton.focus();

    return {
      type: "draft",
      period: refreshedDraft,
      contributionType: customType
    };
  }

  const activePeriod =
    existingPeriods.find(
      period =>
        ACTIVE_CUSTOM_PERIOD_STATUSES.has(
          String(period.status || "").trim().toLowerCase()
        )
    ) || null;

  if (activePeriod) {

    await loadActiveCustomContributions();

    const selectorValue = "custom:" + customType.id;

    preferredCustomContributionValue = selectorValue;

    renderContributionTypeOptions(selectorValue);

    if (typeSelect) {
      typeSelect.value = selectorValue;
    }

    updateContributionAmountFromType();

    showCustomContributionEditorMessage(
      (customType.name || "Custom contribution") +
        " is already active. It has been selected for recording; no duplicate contribution was created.",
      "success"
    );

    if (activeCustomContributionContainer) {
      activeCustomContributionContainer.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    return {
      type: "active",
      period: activePeriod,
      contributionType: customType
    };
  }

  showCustomContributionEditorMessage(
    (customType.name || "Custom contribution") +
      " already exists for this group, but no draft or active period was found. Please refresh the page before creating anything else.",
    "error"
  );

  return {
    type: "existing_without_usable_period",
    period: null,
    contributionType: customType
  };
}


/* =========================================================
   CREATE + ACTIVATE CUSTOM CONTRIBUTION
========================================================= */

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




  /*
   * PRE-CREATE GUARD
   *
   * Resolve the existing custom type before calling
   * create_custom_contribution(). The backend currently
   * permits one code = "custom" type per group.
   */
  let existingCustomContribution;

  try {
    existingCustomContribution =
      await preflightExistingCustomContribution();
  }
  catch (error) {
    showCustomContributionEditorMessage(
      error?.message ||
        "The existing custom contribution could not be checked.",
      "error"
    );
    return;
  }

  if (existingCustomContribution) {
    return;
  }

  let requestId;


  try {

    requestId =
      safeUuid();

  }
  catch (error) {

    showCustomContributionEditorMessage(
      error.message,
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

    /* =====================================================
       CREATE
    ===================================================== */

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
      normalizeRpcResult(
        data
      );


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


    /* =====================================================
       ACTIVATE
    ===================================================== */

    const activationRequestId =
      safeUuid();


    /*
     * Activation is intentionally retried once with the SAME
     * request ID. This is safe for the canonical RPC because
     * request replay is backend-owned. It also covers the
     * browser/network case where activation succeeded but
     * the first response was lost.
     */
    let activationData = null;
    let activationError = null;

    for (
      let activationAttempt = 1;
      activationAttempt <= 2;
      activationAttempt += 1
    ) {

      const response =
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

      activationData =
        response.data;

      activationError =
        response.error;

      if (!activationError) {
        break;
      }

      if (
        activationAttempt === 2
      ) {
        throw activationError;
      }

    }


    const activation =
      normalizeRpcResult(
        activationData
      );


    /*
     * Do not trust the RPC response alone for the UI.
     * Re-read the period and confirm that LIVE actually
     * persisted an active status before showing it as active.
     */
    const {
      data:
        verifiedPeriod,
      error:
        verificationError
    } =
      await supabase
        .from("contribution_periods")
        .select(
          "id,contribution_type_id,status"
        )
        .eq(
          "id",
          result.period_id
        )
        .eq(
          "group_id",
          groupId
        )
        .single();


    if (
      verificationError
    ) {

      throw new Error(
        "The custom contribution was created, but its activation could not be verified. Please refresh and try activation again."
      );

    }


    const verifiedStatus =
      String(
        verifiedPeriod?.status ||
        activation?.status ||
        ""
      )
        .trim()
        .toLowerCase();


    if (
      !ACTIVE_CUSTOM_PERIOD_STATUSES.has(
        verifiedStatus
      )
    ) {

      throw new Error(
        "The custom contribution was saved as " +
        (verifiedStatus || "draft") +
        " but is not active yet. It was not added to Active Contributions."
      );

    }


    /*
     * Prefer the verified backend type ID. This guarantees
     * that the selector and Active Contributions list point
     * to the exact period that was just activated.
     */
    const verifiedContributionTypeId =
      verifiedPeriod?.contribution_type_id ||
      activation?.contribution_type_id ||
      activation?.type_id ||
      null;


    /* =====================================================
       RESOLVE TYPE
    ===================================================== */

    const createdContributionTypeId =
      result.contribution_type_id ||
      result.type_id ||
      verifiedContributionTypeId ||
      activation.contribution_type_id ||
      activation.type_id ||
      null;


    await loadActiveCustomContributions();


    let createdActiveContribution =
      activeCustomContributions.find(
        item =>
          String(item.id) ===
          String(result.period_id)
      ) || null;


    let resolvedTypeId =
      createdContributionTypeId ||
      getCustomContributionTypeId(
        createdActiveContribution
      );


    if (
      !resolvedTypeId &&
      createdActiveContribution
    ) {

      resolvedTypeId =
        createdActiveContribution.contribution_type_id ||
        null;

    }


    if (!resolvedTypeId) {

      /*
       * Do not invent an identifier.
       *
       * The contribution is only considered fully
       * selectable once its backend-owned type ID can
       * be resolved.
       */
      throw new Error(
        "The custom contribution was activated but its contribution type could not be resolved."
      );

    }


    const preferredCustomValue =
      `custom:${resolvedTypeId}`;


    preferredCustomContributionValue =
      preferredCustomValue;


    /* =====================================================
       REBUILD SELECTOR
    ===================================================== */

    renderContributionTypeOptions(
      preferredCustomValue
    );


    if (
      !findActiveCustomContribution(
        resolvedTypeId
      )
    ) {

      throw new Error(
        "The custom contribution was activated but could not be confirmed in the active contribution list."
      );

    }


    /* =====================================================
       REFRESH DISPLAY DATA
    ===================================================== */

    await Promise.all([

      loadContributions()

    ]);

    renderLedger();

    renderSummary();

    renderContributionGoals();


    if (
      typeSelect
    ) {

      typeSelect.value =
        preferredCustomValue;

    }


    updateContributionAmountFromType();


    showCustomContributionEditorMessage(
      "Custom contribution saved and activated. It is now ongoing and available in the contribution-type list.",
      "success"
    );


    if (statusEl) {

      statusEl.hidden =
        false;

      statusEl.textContent =
        "✓ Custom contribution is active and available for recording.";

    }


    /*
     * Close only after backend confirmation and selector
     * refresh.
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
   ACTIVATE EXISTING CUSTOM CONTRIBUTION
========================================================= */

async function activateExistingCustomContribution(
  periodId,
  button
) {

  if (
    !isGroupOwner &&
    !CUSTOM_CONTRIBUTION_ACTIVATOR_ROLES.has(
      getCurrentMemberRole()
    )
  ) {

    showError(
      new Error(
        "You are not authorised to activate custom contributions."
      )
    );

    return;

  }


  const period =
    draftCustomContributions.find(
      item =>
        String(item.id) ===
        String(periodId)
    );


  if (!period) {

    showError(
      new Error(
        "The draft custom contribution could not be found. Please refresh the page."
      )
    );

    return;

  }


  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Activating…";

  }


  let requestId;

  try {

    requestId =
      safeUuid();

  }
  catch (error) {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Activate";

    }

    showError(error);

    return;

  }


  try {

    let activationData =
      null;

    let activationError =
      null;


    /*
     * Retry once with the SAME request ID so a lost browser
     * response cannot accidentally create a second activation
     * request. Replay behavior remains backend-owned.
     */
    for (
      let attempt = 1;
      attempt <= 2;
      attempt += 1
    ) {

      const response =
        await supabase.rpc(
          "activate_custom_contribution",
          {
            p_group_id:
              groupId,

            p_period_id:
              period.id,

            p_request_id:
              requestId

          }
        );


      activationData =
        response.data;

      activationError =
        response.error;


      if (!activationError) {

        break;

      }


      if (attempt === 2) {

        throw activationError;

      }

    }


    const activation =
      normalizeRpcResult(
        activationData
      );


    const {
      data:
        verifiedPeriod,
      error:
        verificationError
    } =
      await supabase
        .from("contribution_periods")
        .select(
          "id,contribution_type_id,status"
        )
        .eq(
          "id",
          period.id
        )
        .eq(
          "group_id",
          groupId
        )
        .single();


    if (verificationError) {

      throw new Error(
        "The contribution activation could not be verified. Please refresh and try again."
      );

    }


    const verifiedStatus =
      String(
        verifiedPeriod?.status ||
        activation?.status ||
        ""
      )
        .trim()
        .toLowerCase();


    if (
      !ACTIVE_CUSTOM_PERIOD_STATUSES.has(
        verifiedStatus
      )
    ) {

      throw new Error(
        "The contribution is still a draft. It was not added to Active Contributions."
      );

    }


    const resolvedTypeId =
      verifiedPeriod?.contribution_type_id ||
      activation?.contribution_type_id ||
      activation?.type_id ||
      period.contribution_type_id ||
      null;


    if (!resolvedTypeId) {

      throw new Error(
        "The contribution was activated, but its contribution type could not be resolved."
      );

    }


    preferredCustomContributionValue =
      "custom:" +
      resolvedTypeId;


    await Promise.all([

      loadActiveCustomContributions(),

      loadDraftCustomContributions(),

      loadContributions()

    ]);


    renderContributionTypeOptions(
      preferredCustomContributionValue
    );

    renderDraftCustomContributionList();

    renderLedger();

    renderSummary();

    renderContributionGoals();


    if (typeSelect) {

      typeSelect.value =
        preferredCustomContributionValue;

    }


    updateContributionAmountFromType();


    showCustomContributionEditorMessage(
      (
        period.contribution_name ||
        period.name ||
        "Custom contribution"
      ) +
      " is now active and available for recording.",
      "success"
    );


    if (statusEl) {

      statusEl.hidden =
        false;

      statusEl.textContent =
        "✓ Custom contribution activated and added to Active Contributions.";

    }

  }
  catch (error) {

    console.error(
      "Failed to activate existing custom contribution:",
      error
    );


    showError(error);


    if (draftCustomContributionRows) {

      const message =
        error?.message ||
        "Custom contribution could not be activated.";

      const notice =
        document.createElement("div");

      notice.className =
        "cl-draft-contribution-empty";

      notice.textContent =
        message;

      draftCustomContributionRows.prepend(
        notice
      );

    }

  }
  finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Activate";

    }

  }

}


/* =========================================================
   DRAFT CUSTOM CONTRIBUTION CLICK HANDLER
========================================================= */

function handleDraftCustomContributionClick(
  event
) {

  const button =
    event.target.closest(
      "[data-activate-custom-contribution]"
    );


  if (!button) {

    return;

  }


  const periodId =
    button.dataset
      .activateCustomContribution;


  if (!periodId) {

    return;

  }


  void activateExistingCustomContribution(
    periodId,
    button
  );

}




/* =========================================================
   SELECT ACTIVE CUSTOM CONTRIBUTION
========================================================= */

function selectActiveCustomContribution(
  contributionTypeId
) {

  if (!typeSelect) {
    return;
  }


  const selectorValue =
    `custom:${contributionTypeId}`;


  const optionExists =
    Array.from(
      typeSelect.options
    ).some(
      option =>
        option.value ===
        selectorValue
    );


  if (!optionExists) {

    void refreshActiveCustomContributions(
      selectorValue
    )
      .then(
        () => {

          if (
            typeSelect
          ) {

            typeSelect.value =
              selectorValue;

          }


          updateContributionAmountFromType();

        }
      )
      .catch(
        showError
      );

    return;

  }


  typeSelect.value =
    selectorValue;


  preferredCustomContributionValue =
    selectorValue;


  updateContributionAmountFromType();


  typeSelect.scrollIntoView({
    behavior:
      "smooth",

    block:
      "center"

  });

}


/* =========================================================
   ACTIVE CUSTOM CONTRIBUTION CLICK HANDLER
========================================================= */

function handleActiveCustomContributionClick(
  event
) {

  const button =
    event.target.closest(
      "[data-select-custom-contribution]"
    );


  if (!button) {
    return;
  }


  const typeId =
    button.dataset
      .selectCustomContribution;


  if (!typeId) {
    return;
  }


  selectActiveCustomContribution(
    typeId
  );

}


/* =========================================================
   PAGE REFRESH
========================================================= */

async function refreshContributions() {

  if (!initialized) {
    return initContributions();
  }

  initialized = false;

  return initContributions({
    force: true
  });

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
     * Resolve authenticated member through the existing
     * canonical auth/member path.
     */
    const applicationContext =
      await getMyApplicationContext();

    currentMember =
      applicationContext.member;

    isGroupOwner =
      Boolean(applicationContext.isOwner);


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

      loadDraftCustomContributions(),

      loadContributions(),

      loadContributionGoals()

    ]);


    /*
     * Configure role-dependent UI only after currentMember
     * has been resolved.
     */
    configureMemberPaymentEvidence();

    configureVerifierPaymentEvidence();


    renderContributionTypeOptions(
      preferredCustomContributionValue ||
      typeSelect?.value ||
      "monthly"
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

    updateContributionAmountFromType();


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

    renderSummary();

    renderContributionGoals();


    /*
     * Support ?new=custom.
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

/* ---------------------------------------------------------
   Refresh is a read/reload action only. It never writes
   accounting data and does not bypass canonical RPC paths.
--------------------------------------------------------- */

const refreshContributionsButton =
  document.getElementById("refreshContributions");

if (
  refreshContributionsButton &&
  !refreshContributionsButton.dataset.clRefreshBound
) {

  refreshContributionsButton.dataset.clRefreshBound =
    "true";

  refreshContributionsButton.addEventListener(
    "click",
    async () => {

      refreshContributionsButton.disabled = true;
      refreshContributionsButton.textContent =
        "Refreshing…";

      try {

        await refreshContributions();

      }
      catch (error) {

        showError(error);

      }
      finally {

        refreshContributionsButton.disabled = false;
        refreshContributionsButton.textContent =
          "Refresh";

      }

    }
  );

}

/* =========================================================
   REMAINING EVENTS
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
   CONTRIBUTION TYPE CHANGE
========================================================= */

if (
  typeSelect &&
  !typeSelect.dataset
    .clContributionTypeBound
) {

  typeSelect.dataset
    .clContributionTypeBound =
    "true";


  typeSelect.addEventListener(
    "change",
    () => {

      const value =
        String(
          typeSelect.value ||
          ""
        )
        .trim()
        .toLowerCase();


      if (
        value.startsWith(
          "custom:"
        )
      ) {

        preferredCustomContributionValue =
          value;

      }
      else {

        preferredCustomContributionValue =
          null;

      }


      updateContributionAmountFromType();

    }
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
   DRAFT CUSTOM CONTRIBUTION EVENTS
========================================================= */

if (
  draftCustomContributionRows &&
  !draftCustomContributionRows.dataset
    .clDraftCustomBound
) {

  draftCustomContributionRows.dataset
    .clDraftCustomBound =
    "true";


  draftCustomContributionRows.addEventListener(
    "click",
    handleDraftCustomContributionClick
  );

}


/* =========================================================
   ACTIVE CUSTOM CONTRIBUTION EVENTS
========================================================= */

if (
  activeCustomContributionRows &&
  !activeCustomContributionRows.dataset
    .clActiveCustomBound
) {

  activeCustomContributionRows.dataset
    .clActiveCustomBound =
    "true";


  activeCustomContributionRows.addEventListener(
    "click",
    handleActiveCustomContributionClick
  );

}


if (
  activeCustomContributionContainer &&
  !activeCustomContributionContainer.dataset
    .clActiveCustomBound
) {

  activeCustomContributionContainer.dataset
    .clActiveCustomBound =
    "true";


  activeCustomContributionContainer.addEventListener(
    "click",
    handleActiveCustomContributionClick
  );

}



