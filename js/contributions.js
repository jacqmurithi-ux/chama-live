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
