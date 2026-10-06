/* =========================================================
   CHAMA LIVE — CONTRIBUTIONS
   CANONICAL 2B ACCOUNTING VERSION

   MEMBER PAYMENT EVIDENCE INTEGRATION
   CUSTOM CONTRIBUTION INTEGRATION

   ---------------------------------------------------------
   ACCOUNTING BOUNDARIES
   ---------------------------------------------------------
   • Ordinary members submit payment evidence only.
   • Evidence remains pending until authorised verification.
   • Verified member payments are recorded through the
     canonical accounting RPC.
   • Frontend never directly inserts/updates:
       - contributions
       - contribution_allocations
       - contribution_obligations
   • Custom contribution creation is performed through RPC.
   • Active contribution definitions remain visible after
     creation and can be selected when recording payments.
   • Frontend is a presentation/orchestration layer only.

   ---------------------------------------------------------
   PAGE CONTRACT
   ---------------------------------------------------------
   Expected HTML IDs are resolved defensively because the
   contributions page has evolved across versions.

   Primary sections:
     #contributionsTable
     #contributionsBody
     #contributionType
     #contributionAmount
     #contributionDate
     #memberSelect
     #paymentMethod
     #reference
     #notes

   Custom contribution:
     #customContributionForm
     #customContributionName
     #customContributionAmount
     #customContributionFrequency
     #customContributionDescription

   Evidence:
     #paymentEvidenceForm
     #evidenceAmount
     #evidenceDate
     #evidenceReference
     #evidencePaymentMethod
     #evidenceNotes

   ---------------------------------------------------------
   IMPORTANT
   ---------------------------------------------------------
   This module does NOT assume that every DOM element exists.
   Missing optional elements must not break the page.
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

const state = {
  user: null,
  member: null,
  group: null,

  members: [],
  contributionTypes: [],
  activeContributionTypes: [],

  selectedMemberId: null,
  selectedContributionTypeId: null,

  loading: false,
  submitting: false
};


/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function byId(id) {
  return document.getElementById(id);
}

function firstExisting(...selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);

    if (element) {
      return element;
    }
  }

  return null;
}

function setText(target, value) {
  const element =
    typeof target === "string"
      ? firstExisting(target)
      : target;

  if (element) {
    element.textContent =
      value === null || value === undefined
        ? ""
        : String(value);
  }
}

function setHTML(target, value) {
  const element =
    typeof target === "string"
      ? firstExisting(target)
      : target;

  if (element) {
    element.innerHTML =
      value === null || value === undefined
        ? ""
        : String(value);
  }
}

function show(target) {
  const element =
    typeof target === "string"
      ? firstExisting(target)
      : target;

  if (!element) {
    return;
  }

  element.hidden = false;
  element.style.display = "";
}

function hide(target) {
  const element =
    typeof target === "string"
      ? firstExisting(target)
      : target;

  if (!element) {
    return;
  }

  element.hidden = true;
  element.style.display = "none";
}

function disable(target, disabled = true) {
  const element =
    typeof target === "string"
      ? firstExisting(target)
      : target;

  if (element) {
    element.disabled = disabled;
  }
}


/* =========================================================
   USER FEEDBACK
   ========================================================= */

function notify(message, type = "info") {
  const existing = firstExisting(
    "#contributionMessage",
    "#formMessage",
    "#pageMessage",
    "[data-contribution-message]"
  );

  if (existing) {
    existing.textContent = message;
    existing.dataset.type = type;
    existing.classList.remove(
      "success",
      "error",
      "warning",
      "info"
    );
    existing.classList.add(type);
    show(existing);
    return;
  }

  if (type === "error") {
    console.error(message);
  } else {
    console.log(message);
  }
}

function clearNotification() {
  const existing = firstExisting(
    "#contributionMessage",
    "#formMessage",
    "#pageMessage",
    "[data-contribution-message]"
  );

  if (existing) {
    existing.textContent = "";
    hide(existing);
  }
}


/* =========================================================
   FORMATTERS
   ========================================================= */

function formatKES(amount) {
  const numeric = Number(amount);

  if (!Number.isFinite(numeric)) {
    return "KSh 0";
  }

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(numeric);
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function normaliseAmount(value) {
  const amount = Number.parseFloat(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100) / 100;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   ROLE HELPERS
   ========================================================= */

function normaliseRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

function getMemberRole() {
  return normaliseRole(
    state.member?.role ||
    state.member?.member_role ||
    state.member?.group_role
  );
}

function canManageContributions() {
  const role = getMemberRole();

  return [
    "owner",
    "admin",
    "administrator",
    "chairperson",
    "secretary",
    "treasurer"
  ].includes(role);
}

function canVerifyEvidence() {
  const role = getMemberRole();

  return [
    "admin",
    "administrator",
    "chairperson",
    "secretary",
    "treasurer"
  ].includes(role);
}


/* =========================================================
   SAFE RPC CALLER
   ========================================================= */

async function callRPC(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);

  if (error) {
    throw error;
  }

  return data;
}


/* =========================================================
   INITIAL AUTH / CONTEXT
   ========================================================= */

async function loadContext() {
  const authResult = await requireAuth();

  state.user =
    authResult?.user ||
    authResult ||
    null;

  if (!state.user?.id) {
    throw new Error("Authenticated user could not be resolved.");
  }

  state.member = await getMyMember();
  state.group = await getMyGroup();

  if (!state.group?.id) {
    throw new Error("Your group could not be resolved.");
  }

  return {
    user: state.user,
    member: state.member,
    group: state.group
  };
}


/* =========================================================
   CONTRIBUTION TYPE NORMALISATION
   ========================================================= */

function normaliseContributionType(row) {
  if (!row) {
    return null;
  }

  const id =
    row.id ??
    row.contribution_type_id ??
    row.type_id ??
    null;

  const name =
    row.name ??
    row.contribution_name ??
    row.type_name ??
    row.title ??
    "";

  const amount =
    row.amount ??
    row.default_amount ??
    row.required_amount ??
    row.monthly_amount ??
    null;

  const status =
    row.status ??
    row.contribution_status ??
    "active";

  const isActive =
    row.is_active !== undefined
      ? Boolean(row.is_active)
      : String(status).toLowerCase() === "active";

  return {
    ...row,
    id,
    name: String(name || "").trim(),
    amount: amount === null ? null : Number(amount),
    status,
    is_active: isActive,

    frequency:
      row.frequency ??
      row.contribution_frequency ??
      row.interval ??
      null,

    description:
      row.description ??
      row.notes ??
      "",

    type:
      row.type ??
      row.contribution_type ??
      "custom"
  };
}


/* =========================================================
   LOAD ACTIVE CONTRIBUTION TYPES
   ========================================================= */

async function loadContributionTypes() {
  /*
   * Prefer the canonical read RPC where available.
   * We do not fabricate contribution definitions in the
   * frontend.
   */

  let rows = null;
  let lastError = null;

  const candidates = [
    "get_active_contribution_types",
    "get_group_contribution_types",
    "get_contribution_types"
  ];

  for (const rpcName of candidates) {
    try {
      rows = await callRPC(rpcName, {
        p_group_id: state.group.id
      });

      if (Array.isArray(rows)) {
        break;
      }

      /*
       * Some RPCs return an object containing rows.
       */
      if (Array.isArray(rows?.data)) {
        rows = rows.data;
        break;
      }

      if (Array.isArray(rows?.rows)) {
        rows = rows.rows;
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (!Array.isArray(rows)) {
    /*
     * Do not silently invent database data.
     * If the read RPC is unavailable, leave the list empty
     * and surface the real error.
     */
    throw lastError ||
      new Error(
        "No contribution-type read RPC is available."
      );
  }

  state.contributionTypes = rows
    .map(normaliseContributionType)
    .filter(Boolean);

  state.activeContributionTypes =
    state.contributionTypes.filter(
      type => type.is_active !== false
    );

  renderContributionTypeOptions();

  return state.activeContributionTypes;
}


/* =========================================================
   CONTRIBUTION TYPE SELECT
   ========================================================= */

function renderContributionTypeOptions() {
  const select = firstExisting(
    "#contributionType",
    "#contribution_type",
    "#contributionTypeSelect",
    "[data-contribution-type]"
  );

  if (!select) {
    return;
  }

  const currentValue = select.value;

  select.innerHTML = `
    <option value="">Select contribution type</option>
  `;

  for (const type of state.activeContributionTypes) {
    if (!type.id) {
      continue;
    }

    const amountText =
      Number.isFinite(type.amount)
        ? ` — ${formatKES(type.amount)}`
        : "";

    const option = document.createElement("option");

    option.value = type.id;
    option.textContent =
      `${type.name || "Contribution"}${amountText}`;

    option.dataset.contributionTypeId = type.id;

    select.appendChild(option);
  }

  if (
    currentValue &&
    state.activeContributionTypes.some(
      type => String(type.id) === String(currentValue)
    )
  ) {
    select.value = currentValue;
  }
}


/* =========================================================
   MEMBERS
   ========================================================= */

async function loadMembers() {
  /*
   * Member reads are allowed here.
   * Accounting writes remain RPC-owned.
   */

  const result = await callRPC(
    "get_group_members",
    {
      p_group_id: state.group.id
    }
  );

  const rows =
    Array.isArray(result)
      ? result
      : Array.isArray(result?.data)
        ? result.data
        : Array.isArray(result?.rows)
          ? result.rows
          : [];

  /*
   * Do not filter members merely because a status/onboarding
   * column is different. Membership visibility is based on
   * the actual returned member rows.
   */
  state.members = rows.filter(Boolean);

  renderMemberOptions();

  return state.members;
}


/* =========================================================
   MEMBER SELECT
   ========================================================= */

function getMemberDisplayName(member) {
  return (
    member.full_name ||
    member.name ||
    [
      member.first_name,
      member.last_name
    ]
      .filter(Boolean)
      .join(" ") ||
    member.email ||
    "Member"
  );
}

function renderMemberOptions() {
  const select = firstExisting(
    "#memberSelect",
    "#member",
    "#member_id",
    "#contributionMember",
    "[data-member-select]"
  );

  if (!select) {
    return;
  }

  const currentValue = select.value;

  select.innerHTML = `
    <option value="">Select member</option>
  `;

  for (const member of state.members) {
    const id =
      member.id ??
      member.member_id;

    if (!id) {
      continue;
    }

    const option = document.createElement("option");

    option.value = id;
    option.textContent = getMemberDisplayName(member);

    select.appendChild(option);
  }

  if (
    currentValue &&
    state.members.some(
      member =>
        String(member.id ?? member.member_id) ===
        String(currentValue)
    )
  ) {
    select.value = currentValue;
  }
}


/* =========================================================
   CUSTOM CONTRIBUTION VISIBILITY
   ========================================================= */

function renderCustomContributionSummary() {
  const container = firstExisting(
    "#activeContributions",
    "#activeContributionTypes",
    "#customContributions",
    "[data-active-contributions]"
  );

  if (!container) {
    return;
  }

  const types = state.activeContributionTypes;

  if (!types.length) {
    container.innerHTML = `
      <div class="empty-state">
        No active contribution types.
      </div>
    `;
    return;
  }

  container.innerHTML = types
    .map(type => {
      const name = escapeHTML(
        type.name || "Contribution"
      );

      const amount =
        Number.isFinite(type.amount)
          ? formatKES(type.amount)
          : "Amount varies";

      const frequency = escapeHTML(
        type.frequency || ""
      );

      const description = escapeHTML(
        type.description || ""
      );

      return `
        <div
          class="contribution-type-card"
          data-contribution-type-id="${escapeHTML(type.id)}"
        >
          <div class="contribution-type-card__header">
            <strong>${name}</strong>
            <span class="status-badge status-active">
              Active
            </span>
          </div>

          <div class="contribution-type-card__amount">
            ${escapeHTML(amount)}
          </div>

          ${
            frequency
              ? `<div class="contribution-type-card__frequency">
                   ${frequency}
                 </div>`
              : ""
          }

          ${
            description
              ? `<div class="contribution-type-card__description">
                   ${description}
                 </div>`
              : ""
          }
        </div>
      `;
    })
    .join("");
}


/* =========================================================
   SELECTED CONTRIBUTION TYPE
   ========================================================= */

function getSelectedContributionType() {
  const select = firstExisting(
    "#contributionType",
    "#contribution_type",
    "#contributionTypeSelect",
    "[data-contribution-type]"
  );

  if (!select?.value) {
    return null;
  }

  return (
    state.activeContributionTypes.find(
      type =>
        String(type.id) ===
        String(select.value)
    ) ||
    null
  );
}

function applyContributionTypeDefaults() {
  const type = getSelectedContributionType();

  if (!type) {
    return;
  }

  state.selectedContributionTypeId = type.id;

  const amountInput = firstExisting(
    "#contributionAmount",
    "#contribution_amount",
    "#amount"
  );

  if (
    amountInput &&
    Number.isFinite(type.amount) &&
    (!amountInput.value ||
      amountInput.dataset.autoFilled === "true")
  ) {
    amountInput.value = type.amount;
    amountInput.dataset.autoFilled = "true";
  }

  const description = firstExisting(
    "#contributionDescription",
    "#contribution_description"
  );

  if (
    description &&
    !description.value &&
    type.description
  ) {
    description.value = type.description;
  }
}


/* =========================================================
   PAYMENT FORM RESET
   ========================================================= */

function resetContributionForm() {
  const form = firstExisting(
    "#contributionForm",
    "#recordContributionForm",
    "[data-contribution-form]"
  );

  if (form) {
    form.reset();
  }

  const amountInput = firstExisting(
    "#contributionAmount",
    "#contribution_amount",
    "#amount"
  );

  if (amountInput) {
    delete amountInput.dataset.autoFilled;
  }

  state.selectedMemberId = null;
  state.selectedContributionTypeId = null;
}


/* =========================================================
   PAYMENT EVIDENCE FORM
   ========================================================= */

function getEvidenceFormValues() {
  const amount = normaliseAmount(
    firstExisting(
      "#evidenceAmount",
      "#evidence_amount"
    )?.value
  );

  const paymentDate =
    firstExisting(
      "#evidenceDate",
      "#evidence_date"
    )?.value ||
    new Date().toISOString().slice(0, 10);

  const paymentMethod =
    firstExisting(
      "#evidencePaymentMethod",
      "#evidence_payment_method"
    )?.value ||
    null;

  const reference =
    firstExisting(
      "#evidenceReference",
      "#evidence_reference",
      "#reference"
    )?.value?.trim() ||
    null;

  const notes =
    firstExisting(
      "#evidenceNotes",
      "#evidence_notes"
    )?.value?.trim() ||
    null;

  return {
    amount,
    payment_date: paymentDate,
    payment_method: paymentMethod,
    reference,
    notes
  };
}


/* =========================================================
   MEMBER PAYMENT EVIDENCE SUBMISSION
   ========================================================= */

async function submitPaymentEvidence(event) {
  event?.preventDefault();

  if (state.submitting) {
    return;
  }

  clearNotification();

  const values = getEvidenceFormValues();

  if (!values.amount) {
    notify(
      "Enter a valid payment amount.",
      "error"
    );
    return;
  }

  state.submitting = true;

  const submitButton = firstExisting(
    "#submitEvidence",
    "#submitPaymentEvidence",
    "#evidenceSubmit",
    "#paymentEvidenceForm button[type='submit']"
  );

  disable(submitButton, true);

  try {
    /*
     * Ordinary members submit evidence.
     *
     * The exact RPC owns the database write. This module
     * deliberately does not insert directly into
     * member_payment_evidence.
     */

    const result = await callRPC(
      "submit_member_payment_evidence",
      {
        p_group_id: state.group.id,
        p_member_id: state.member.id,
        p_amount: values.amount,
        p_payment_date: values.payment_date,
        p_payment_method: values.payment_method,
        p_reference: values.reference,
        p_notes: values.notes
      }
    );

    notify(
      "Payment evidence submitted and is awaiting verification.",
      "success"
    );

    const form = firstExisting(
      "#paymentEvidenceForm",
      "[data-payment-evidence-form]"
    );

    if (form) {
      form.reset();
    }

    return result;
  } catch (error) {
    console.error(
      "Payment evidence submission failed:",
      error
    );

    notify(
      error?.message ||
        "Unable to submit payment evidence.",
      "error"
    );

    throw error;
  } finally {
    state.submitting = false;
    disable(submitButton, false);
  }
}


/* =========================================================
   ADMIN DIRECT RECORDING
   ========================================================= */

function getContributionFormValues() {
  const memberSelect = firstExisting(
    "#memberSelect",
    "#member",
    "#member_id",
    "#contributionMember"
  );

  const typeSelect = firstExisting(
    "#contributionType",
    "#contribution_type",
    "#contributionTypeSelect"
  );

  const amountInput = firstExisting(
    "#contributionAmount",
    "#contribution_amount",
    "#amount"
  );

  const dateInput = firstExisting(
    "#contributionDate",
    "#contribution_date"
  );

  const paymentMethodInput = firstExisting(
    "#paymentMethod",
    "#payment_method"
  );

  const referenceInput = firstExisting(
    "#reference",
    "#paymentReference",
    "#payment_reference"
  );

  const notesInput = firstExisting(
    "#notes",
    "#contributionNotes",
    "#contribution_notes"
  );

  return {
    member_id:
      memberSelect?.value ||
      null,

    contribution_type_id:
      typeSelect?.value ||
      null,

    amount:
      normaliseAmount(amountInput?.value),

    contribution_date:
      dateInput?.value ||
      new Date().toISOString().slice(0, 10),

    payment_method:
      paymentMethodInput?.value ||
      null,

    reference:
      referenceInput?.value?.trim() ||
      null,

    notes:
      notesInput?.value?.trim() ||
      null
  };
}


/* =========================================================
   CANONICAL CONTRIBUTION RECORDING
   ========================================================= */

async function recordContribution(event) {
  event?.preventDefault();

  if (state.submitting) {
    return;
  }

  if (!canManageContributions()) {
    notify(
      "You are not authorised to record contributions.",
      "error"
    );
    return;
  }

  clearNotification();

  const values = getContributionFormValues();

  if (!values.member_id) {
    notify(
      "Select the member making the payment.",
      "error"
    );
    return;
  }

  if (!values.contribution_type_id) {
    notify(
      "Select the contribution type.",
      "error"
    );
    return;
  }

  if (!values.amount) {
    notify(
      "Enter a valid payment amount.",
      "error"
    );
    return;
  }

  state.submitting = true;

  const submitButton = firstExisting(
    "#recordContribution",
    "#saveContribution",
    "#contributionSubmit",
    "#contributionForm button[type='submit']"
  );

  disable(submitButton, true);

  try {
    /*
     * Canonical accounting boundary.
     *
     * Do NOT replace this with a direct table insert.
     *
     * The backend owns:
     *   - period resolution
     *   - obligation resolution
     *   - allocations
     *   - overpayment handling
     *   - replay safety
     *   - accounting locks
     */

    const result = await callRPC(
      "cl_2b_record_contribution",
      {
        p_group_id: state.group.id,
        p_member_id: values.member_id,
        p_contribution_type_id:
          values.contribution_type_id,
        p_amount: values.amount,
        p_contribution_date:
          values.contribution_date,
        p_payment_method:
          values.payment_method,
        p_reference:
          values.reference,
        p_notes:
          values.notes
      }
    );

    notify(
      "Contribution recorded successfully.",
      "success"
    );

    resetContributionForm();

    /*
     * Refresh only through canonical/read paths.
     */
    await refreshContributionView();

    return result;
  } catch (error) {
    console.error(
      "Canonical contribution recording failed:",
      error
    );

    notify(
      error?.message ||
        "Unable to record the contribution.",
      "error"
    );

    throw error;
  } finally {
    state.submitting = false;
    disable(submitButton, false);
  }
}


/* =========================================================
   VIEW REFRESH
   ========================================================= */

async function refreshContributionView() {
  /*
   * Re-load definitions because Custom contributions must
   * remain visible immediately after creation.
   */

  await loadContributionTypes();

  renderCustomContributionSummary();

  /*
   * Contribution ledger rendering is intentionally delegated
   * to the canonical read implementation in the next section.
   */
  await loadContributionLedger();
}


/* =========================================================
   PLACEHOLDER FOR PART 2
   ========================================================= */

/*
   Part 2 continues with:

   • canonical contribution ledger reads
   • member contribution position
   • Paid / Outstanding status
   • monthly + Custom obligation display
   • active contribution rendering
   • admin verification workflow
   • evidence loading

   Part 3 continues with:

   • Custom contribution creation
   • RPC boundary
   • active contribution persistence/display
   • event handlers

   Part 4 continues with:

   • page initialisation
   • safe event binding
   • exports
   • final integration
*/


/* =========================================================
   TEMPORARY DECLARATION
   ========================================================= */

async function loadContributionLedger() {
  /*
   * Implemented in Part 2.
   *
   * This declaration is intentionally kept here so the file
   * structure remains easy to merge part-by-part.
   */
}
/* =========================================================
   PART 2 — CANONICAL LEDGER / MEMBER POSITION / STATUS
   ========================================================= */


/* =========================================================
   GENERIC RPC ROW EXTRACTION
   ========================================================= */

function extractRows(result) {
  if (Array.isArray(result)) {
    return result;
  }

  if (Array.isArray(result?.data)) {
    return result.data;
  }

  if (Array.isArray(result?.rows)) {
    return result.rows;
  }

  if (Array.isArray(result?.results)) {
    return result.results;
  }

  return [];
}


/* =========================================================
   CONTRIBUTION LEDGER READ
   ========================================================= */

async function loadContributionLedger() {
  const container = firstExisting(
    "#contributionsBody",
    "#contributionTableBody",
    "#contributionsList",
    "[data-contributions-body]"
  );

  /*
   * Try the canonical read RPCs in order.
   *
   * This is READ ONLY.
   * No accounting table is written from the frontend.
   */

  let result = null;
  let lastError = null;

  const rpcCandidates = [
    "get_group_contribution_ledger",
    "get_contribution_ledger",
    "get_contributions"
  ];

  for (const rpcName of rpcCandidates) {
    try {
      result = await callRPC(rpcName, {
        p_group_id: state.group.id
      });

      const rows = extractRows(result);

      if (Array.isArray(rows)) {
        state.contributions = rows;
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (!Array.isArray(state.contributions)) {
    state.contributions = [];
  }

  if (lastError && !result) {
    /*
     * If the page has no ledger container, avoid making an
     * otherwise valid page unusable because an optional
     * historical ledger RPC is unavailable.
     */
    if (container) {
      console.error(
        "Unable to load contribution ledger:",
        lastError
      );

      setHTML(
        container,
        `
          <tr>
            <td colspan="8">
              Unable to load contribution records.
            </td>
          </tr>
        `
      );
    }

    return [];
  }

  renderContributionLedger(
    state.contributions
  );

  return state.contributions;
}


/* =========================================================
   LEDGER RENDERING
   ========================================================= */

function getContributionMemberName(row) {
  return (
    row.member_name ||
    row.full_name ||
    row.name ||
    [
      row.first_name,
      row.last_name
    ]
      .filter(Boolean)
      .join(" ") ||
    "Member"
  );
}

function getContributionTypeName(row) {
  return (
    row.contribution_type_name ||
    row.type_name ||
    row.contribution_name ||
    row.contribution_type ||
    row.type ||
    "Contribution"
  );
}

function getContributionStatus(row) {
  const raw =
    row.status ||
    row.contribution_status ||
    row.payment_status ||
    row.accounting_status ||
    "";

  return String(raw)
    .trim()
    .toLowerCase();
}

function statusLabel(status) {
  switch (status) {
    case "paid":
    case "settled":
    case "complete":
    case "completed":
      return "Paid";

    case "outstanding":
    case "unpaid":
    case "due":
      return "Outstanding";

    case "pending":
      return "Pending";

    case "partially_paid":
    case "partial":
      return "Partially Paid";

    case "overpaid":
      return "Overpaid";

    case "rejected":
      return "Rejected";

    default:
      return status
        ? status.replaceAll("_", " ")
        : "Recorded";
  }
}

function statusClass(status) {
  switch (status) {
    case "paid":
    case "settled":
    case "complete":
    case "completed":
      return "status-paid";

    case "outstanding":
    case "unpaid":
    case "due":
      return "status-outstanding";

    case "pending":
      return "status-pending";

    case "partially_paid":
    case "partial":
      return "status-partial";

    case "overpaid":
      return "status-overpaid";

    case "rejected":
      return "status-rejected";

    default:
      return "status-recorded";
  }
}


/* =========================================================
   LEDGER ROW
   ========================================================= */

function renderContributionRow(row) {
  const amount =
    row.amount ??
    row.payment_amount ??
    row.total_amount ??
    0;

  const date =
    row.contribution_date ??
    row.payment_date ??
    row.recorded_at ??
    row.created_at;

  const method =
    row.payment_method ??
    row.method ??
    "—";

  const reference =
    row.reference ??
    row.payment_reference ??
    row.mpesa_reference ??
    "—";

  const rawStatus =
    getContributionStatus(row);

  const status =
    statusLabel(rawStatus);

  const statusCss =
    statusClass(rawStatus);

  return `
    <tr
      data-contribution-id="${
        escapeHTML(
          row.id ??
          row.contribution_id ??
          ""
        )
      }"
    >
      <td>
        ${escapeHTML(
          getContributionMemberName(row)
        )}
      </td>

      <td>
        ${escapeHTML(
          getContributionTypeName(row)
        )}
      </td>

      <td>
        ${escapeHTML(
          formatKES(amount)
        )}
      </td>

      <td>
        ${escapeHTML(
          formatDate(date)
        )}
      </td>

      <td>
        ${escapeHTML(method)}
      </td>

      <td>
        ${escapeHTML(reference)}
      </td>

      <td>
        <span class="status-badge ${statusCss}">
          ${escapeHTML(status)}
        </span>
      </td>
    </tr>
  `;
}


/* =========================================================
   LEDGER TABLE
   ========================================================= */

function renderContributionLedger(rows) {
  const container = firstExisting(
    "#contributionsBody",
    "#contributionTableBody",
    "[data-contributions-body]"
  );

  if (!container) {
    return;
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    const table = container.closest("table");

    const columnCount =
      table?.querySelectorAll("thead th")
        ?.length ||
      7;

    container.innerHTML = `
      <tr>
        <td
          colspan="${columnCount}"
          class="empty-state"
        >
          No contribution payments recorded yet.
        </td>
      </tr>
    `;

    return;
  }

  container.innerHTML = rows
    .map(renderContributionRow)
    .join("");
}


/* =========================================================
   MEMBER CONTRIBUTION POSITION
   ========================================================= */

async function getMemberContributionPosition(
  memberId,
  contributionTypeId = null
) {
  if (!memberId) {
    return null;
  }

  /*
   * This read must come from the canonical accounting layer.
   */

  const args = {
    p_member_id: memberId
  };

  if (contributionTypeId) {
    args.p_contribution_type_id =
      contributionTypeId;
  }

  let lastError = null;

  const candidates = [
    "get_member_contribution_position",
    "get_member_contribution_status"
  ];

  for (const rpcName of candidates) {
    try {
      const result =
        await callRPC(rpcName, args);

      if (result !== null &&
          result !== undefined) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.error(
      "Unable to load member contribution position:",
      lastError
    );
  }

  return null;
}


/* =========================================================
   POSITION NORMALISATION
   ========================================================= */

function normalisePosition(position) {
  if (!position) {
    return {
      required: 0,
      paid: 0,
      allocated: 0,
      outstanding: 0,
      unapplied: 0,
      status: "outstanding"
    };
  }

  const required =
    Number(
      position.required ??
      position.amount_due ??
      position.obligation_amount ??
      position.total_required ??
      0
    );

  const paid =
    Number(
      position.paid ??
      position.total_paid ??
      position.amount_paid ??
      position.recorded_amount ??
      0
    );

  const allocated =
    Number(
      position.allocated ??
      position.total_allocated ??
      position.allocated_amount ??
      0
    );

  const outstandingValue =
    position.outstanding ??
    position.amount_outstanding ??
    position.balance_due;

  const outstanding =
    outstandingValue !== undefined &&
    outstandingValue !== null
      ? Number(outstandingValue)
      : Math.max(
          required - allocated,
          0
        );

  const unapplied =
    Number(
      position.unapplied ??
      position.unapplied_amount ??
      position.credit ??
      0
    );

  let status =
    String(
      position.status ||
      position.payment_status ||
      ""
    )
      .trim()
      .toLowerCase();

  if (!status) {
    if (outstanding <= 0 && required > 0) {
      status = "paid";
    } else if (allocated > 0) {
      status = "partially_paid";
    } else {
      status = "outstanding";
    }
  }

  return {
    raw: position,
    required,
    paid,
    allocated,
    outstanding,
    unapplied,
    status
  };
}


/* =========================================================
   MEMBER STATUS DISPLAY
   ========================================================= */

function renderMemberContributionStatus(
  container,
  position
) {
  if (!container) {
    return;
  }

  const normalised =
    normalisePosition(position);

  const label =
    statusLabel(
      normalised.status
    );

  const css =
    statusClass(
      normalised.status
    );

  container.innerHTML = `
    <span class="status-badge ${css}">
      ${escapeHTML(label)}
    </span>
  `;
}


/* =========================================================
   MEMBER CONTRIBUTION DETAIL
   ========================================================= */

async function loadMemberContributionStatus(
  memberId,
  contributionTypeId,
  target = null
) {
  const position =
    await getMemberContributionPosition(
      memberId,
      contributionTypeId
    );

  const container =
    target ||
    firstExisting(
      "#memberContributionStatus",
      "#contributionStatus",
      "[data-member-contribution-status]"
    );

  renderMemberContributionStatus(
    container,
    position
  );

  return normalisePosition(
    position
  );
}


/* =========================================================
   ACTIVE CONTRIBUTION TYPES FOR PAYMENT SELECTION
   ========================================================= */

function renderPaymentContributionTypes() {
  const select = firstExisting(
    "#contributionType",
    "#contribution_type",
    "#contributionTypeSelect",
    "#paymentContributionType"
  );

  if (!select) {
    return;
  }

  const current =
    select.value;

  select.innerHTML = `
    <option value="">
      Select contribution type
    </option>
  `;

  /*
   * IMPORTANT:
   * Every active contribution type is shown here.
   *
   * Therefore a newly-created Custom Contribution is not
   * treated as a temporary form object. Once the backend
   * creates it and the read RPC returns it, it becomes a
   * selectable active contribution type.
   */

  for (
    const type
    of state.activeContributionTypes
  ) {
    if (!type?.id) {
      continue;
    }

    const option =
      document.createElement("option");

    option.value =
      String(type.id);

    const amountText =
      Number.isFinite(type.amount)
        ? ` — ${formatKES(type.amount)}`
        : "";

    const frequencyText =
      type.frequency
        ? ` (${type.frequency})`
        : "";

    option.textContent =
      `${type.name || "Contribution"}`
      + amountText
      + frequencyText;

    select.appendChild(option);
  }

  if (
    current &&
    state.activeContributionTypes.some(
      type =>
        String(type.id) ===
        String(current)
    )
  ) {
    select.value = current;
  }
}


/* =========================================================
   CONTRIBUTION TYPE CHANGE
   ========================================================= */

function handleContributionTypeChange(
  event
) {
  const typeId =
    event?.target?.value ||
    null;

  state.selectedContributionTypeId =
    typeId;

  applyContributionTypeDefaults();

  /*
   * If a member is already selected, immediately refresh
   * that member's status for the selected contribution type.
   */
  const memberSelect = firstExisting(
    "#memberSelect",
    "#member",
    "#member_id",
    "#contributionMember"
  );

  if (
    memberSelect?.value &&
    typeId
  ) {
    loadMemberContributionStatus(
      memberSelect.value,
      typeId
    ).catch(error => {
      console.error(
        "Contribution status refresh failed:",
        error
      );
    });
  }
}


/* =========================================================
   MEMBER CHANGE
   ========================================================= */

function handleMemberChange(event) {
  const memberId =
    event?.target?.value ||
    null;

  state.selectedMemberId =
    memberId;

  const type =
    getSelectedContributionType();

  if (
    memberId &&
    type?.id
  ) {
    loadMemberContributionStatus(
      memberId,
      type.id
    ).catch(error => {
      console.error(
        "Member contribution status refresh failed:",
        error
      );
    });
  }
}


/* =========================================================
   ACTIVE CONTRIBUTION CARD SELECTION
   ========================================================= */

function handleActiveContributionClick(
  event
) {
  const card =
    event.target.closest(
      "[data-contribution-type-id]"
    );

  if (!card) {
    return;
  }

  const typeId =
    card.dataset.contributionTypeId;

  const select = firstExisting(
    "#contributionType",
    "#contribution_type",
    "#contributionTypeSelect",
    "#paymentContributionType"
  );

  if (!select || !typeId) {
    return;
  }

  const exists =
    Array.from(select.options)
      .some(
        option =>
          String(option.value) ===
          String(typeId)
      );

  if (!exists) {
    return;
  }

  select.value =
    typeId;

  select.dispatchEvent(
    new Event("change", {
      bubbles: true
    })
  );

  /*
   * Keep the selected contribution visible when the user
   * clicks an active Custom Contribution card.
   */
  select.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}


/* =========================================================
   ACTIVE CONTRIBUTION STATUS TABLE
   ========================================================= */

function renderContributionTypeTable(
  rows = state.activeContributionTypes
) {
  const body = firstExisting(
    "#activeContributionTypesBody",
    "#contributionTypesBody",
    "[data-active-contribution-types-body]"
  );

  if (!body) {
    return;
  }

  if (!rows.length) {
    const table =
      body.closest("table");

    const colspan =
      table?.querySelectorAll("thead th")
        ?.length ||
      5;

    body.innerHTML = `
      <tr>
        <td colspan="${colspan}">
          No active contribution types.
        </td>
      </tr>
    `;

    return;
  }

  body.innerHTML = rows
    .map(type => {
      const amount =
        Number.isFinite(type.amount)
          ? formatKES(type.amount)
          : "Variable";

      return `
        <tr
          data-contribution-type-id="${
            escapeHTML(type.id)
          }"
        >
          <td>
            ${escapeHTML(
              type.name ||
              "Contribution"
            )}
          </td>

          <td>
            ${escapeHTML(amount)}
          </td>

          <td>
            ${escapeHTML(
              type.frequency ||
              "—"
            )}
          </td>

          <td>
            <span class="status-badge status-active">
              Active
            </span>
          </td>

          <td>
            ${escapeHTML(
              type.description ||
              "—"
            )}
          </td>
        </tr>
      `;
    })
    .join("");
}


/* =========================================================
   MEMBER STATUS SUMMARY
   ========================================================= */

async function renderSelectedMemberSummary() {
  const memberSelect = firstExisting(
    "#memberSelect",
    "#member",
    "#member_id",
    "#contributionMember"
  );

  const typeSelect = firstExisting(
    "#contributionType",
    "#contribution_type",
    "#contributionTypeSelect"
  );

  if (
    !memberSelect?.value ||
    !typeSelect?.value
  ) {
    return null;
  }

  return loadMemberContributionStatus(
    memberSelect.value,
    typeSelect.value
  );
}


/* =========================================================
   PART 2 END
   ========================================================= */

/*
   Part 3 continues with:

   • Custom Contribution creation
   • active Custom persistence/readback
   • contribution-type creation RPC
   • admin verification
   • evidence queue
   • verification through the canonical backend RPC
*/
/* =========================================================
   PART 3 — CUSTOM CONTRIBUTIONS + PAYMENT EVIDENCE
   ========================================================= */


/* =========================================================
   CUSTOM CONTRIBUTION FORM VALUES
   ========================================================= */

function getCustomContributionFormValues() {
  const nameInput = firstExisting(
    "#customContributionName",
    "#custom_contribution_name",
    "#customName",
    "[name='custom_contribution_name']"
  );

  const amountInput = firstExisting(
    "#customContributionAmount",
    "#custom_contribution_amount",
    "#customAmount",
    "[name='custom_contribution_amount']"
  );

  const frequencyInput = firstExisting(
    "#customContributionFrequency",
    "#custom_contribution_frequency",
    "#customFrequency",
    "[name='custom_contribution_frequency']"
  );

  const descriptionInput = firstExisting(
    "#customContributionDescription",
    "#custom_contribution_description",
    "#customDescription",
    "[name='custom_contribution_description']"
  );

  return {
    name:
      nameInput?.value?.trim() ||
      "",

    amount:
      normaliseAmount(
        amountInput?.value
      ),

    frequency:
      frequencyInput?.value?.trim() ||
      null,

    description:
      descriptionInput?.value?.trim() ||
      null
  };
}


/* =========================================================
   CUSTOM CONTRIBUTION VALIDATION
   ========================================================= */

function validateCustomContribution(values) {
  if (!values.name) {
    return "Enter a name for the contribution.";
  }

  if (values.name.length < 2) {
    return "Contribution name is too short.";
  }

  if (values.name.length > 150) {
    return "Contribution name is too long.";
  }

  if (
    values.amount !== null &&
    values.amount <= 0
  ) {
    return "Enter a valid contribution amount.";
  }

  return null;
}


/* =========================================================
   CUSTOM CONTRIBUTION RPC
   ========================================================= */

async function createCustomContribution(values) {
  /*
   * IMPORTANT:
   *
   * This function does not INSERT directly into a table.
   *
   * The backend owns the creation of the contribution
   * definition and any associated accounting configuration.
   *
   * Candidate RPC names are attempted only for compatibility
   * with the existing CHAMA LIVE schema.
   */

  const rpcCandidates = [
    "create_custom_contribution",
    "create_group_custom_contribution",
    "create_contribution_type"
  ];

  let lastError = null;

  for (const rpcName of rpcCandidates) {
    try {
      const args = {
        p_group_id:
          state.group.id,

        p_name:
          values.name,

        p_amount:
          values.amount,

        p_frequency:
          values.frequency,

        p_description:
          values.description
      };

      const result =
        await callRPC(
          rpcName,
          args
        );

      return result;
    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ||
    new Error(
      "Unable to create the Custom Contribution."
    )
  );
}


/* =========================================================
   CREATE CUSTOM CONTRIBUTION
   ========================================================= */

async function submitCustomContribution(event) {
  event?.preventDefault();

  if (state.submitting) {
    return;
  }

  if (!canManageContributions()) {
    notify(
      "You are not authorised to create contributions.",
      "error"
    );
    return;
  }

  clearNotification();

  const values =
    getCustomContributionFormValues();

  const validation =
    validateCustomContribution(
      values
    );

  if (validation) {
    notify(
      validation,
      "error"
    );
    return;
  }

  state.submitting = true;

  const submitButton =
    firstExisting(
      "#createCustomContribution",
      "#saveCustomContribution",
      "#customContributionSubmit",
      "#customContributionForm button[type='submit']"
    );

  disable(
    submitButton,
    true
  );

  try {
    const result =
      await createCustomContribution(
        values
      );

    notify(
      "Custom Contribution created and activated.",
      "success"
    );

    /*
     * IMPORTANT:
     *
     * We immediately reload the canonical contribution
     * definitions from the database.
     *
     * This is what makes the Custom Contribution remain
     * visible after saving instead of disappearing with
     * the form state.
     */

    await loadContributionTypes();

    renderPaymentContributionTypes();

    renderCustomContributionSummary();

    renderContributionTypeTable();

    /*
     * Reset only the creation form.
     * Never clear the active contribution definitions.
     */
    const form =
      firstExisting(
        "#customContributionForm",
        "[data-custom-contribution-form]"
      );

    if (form) {
      form.reset();
    }

    return result;
  } catch (error) {
    console.error(
      "Custom Contribution creation failed:",
      error
    );

    notify(
      error?.message ||
        "Unable to create the Custom Contribution.",
      "error"
    );

    throw error;
  } finally {
    state.submitting = false;

    disable(
      submitButton,
      false
    );
  }
}


/* =========================================================
   ACTIVE CONTRIBUTION REFRESH
   ========================================================= */

async function refreshActiveContributionTypes() {
  await loadContributionTypes();

  renderPaymentContributionTypes();
  renderCustomContributionSummary();
  renderContributionTypeTable();

  return state.activeContributionTypes;
}


/* =========================================================
   PAYMENT EVIDENCE QUEUE
   ========================================================= */

async function loadPaymentEvidence() {
  const container =
    firstExisting(
      "#paymentEvidenceBody",
      "#evidenceBody",
      "#paymentEvidenceList",
      "[data-payment-evidence-body]"
    );

  /*
   * Only authorised verification roles should request the
   * verification queue.
   */

  if (!canVerifyEvidence()) {
    if (container) {
      hide(container);
    }

    return [];
  }

  let result = null;
  let lastError = null;

  const candidates = [
    "get_member_payment_evidence",
    "get_payment_evidence",
    "get_pending_payment_evidence"
  ];

  for (
    const rpcName
    of candidates
  ) {
    try {
      result =
        await callRPC(
          rpcName,
          {
            p_group_id:
              state.group.id
          }
        );

      const rows =
        extractRows(result);

      if (Array.isArray(rows)) {
        state.paymentEvidence =
          rows;

        break;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (
    !Array.isArray(
      state.paymentEvidence
    )
  ) {
    state.paymentEvidence = [];
  }

  if (
    lastError &&
    !result &&
    container
  ) {
    console.error(
      "Payment evidence read failed:",
      lastError
    );

    container.innerHTML = `
      <tr>
        <td colspan="8">
          Unable to load payment evidence.
        </td>
      </tr>
    `;

    return [];
  }

  renderPaymentEvidence(
    state.paymentEvidence
  );

  return state.paymentEvidence;
}


/* =========================================================
   PAYMENT EVIDENCE STATUS
   ========================================================= */

function evidenceStatus(row) {
  return String(
    row.status ||
    row.evidence_status ||
    "pending"
  )
    .trim()
    .toLowerCase();
}

function evidenceStatusLabel(status) {
  switch (status) {
    case "verified":
    case "approved":
      return "Verified";

    case "rejected":
      return "Rejected";

    case "pending":
    case "submitted":
      return "Pending";

    default:
      return status
        ? status.replaceAll(
            "_",
            " "
          )
        : "Pending";
  }
}


/* =========================================================
   PAYMENT EVIDENCE RENDERING
   ========================================================= */

function renderPaymentEvidence(rows) {
  const container =
    firstExisting(
      "#paymentEvidenceBody",
      "#evidenceBody",
      "[data-payment-evidence-body]"
    );

  if (!container) {
    return;
  }

  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {
    const table =
      container.closest("table");

    const colspan =
      table?.querySelectorAll(
        "thead th"
      )?.length ||
      8;

    container.innerHTML = `
      <tr>
        <td colspan="${colspan}">
          No payment evidence awaiting verification.
        </td>
      </tr>
    `;

    return;
  }

  container.innerHTML =
    rows
      .map(row => {
        const id =
          row.id ??
          row.evidence_id;

        const memberName =
          getContributionMemberName(
            row
          );

        const amount =
          row.amount ??
          row.payment_amount ??
          0;

        const date =
          row.payment_date ??
          row.contribution_date ??
          row.created_at;

        const method =
          row.payment_method ??
          row.method ??
          "—";

        const reference =
          row.reference ??
          row.payment_reference ??
          "—";

        const status =
          evidenceStatus(row);

        const actions =
          canVerifyEvidence() &&
          (
            status === "pending" ||
            status === "submitted"
          )
            ? `
              <button
                type="button"
                class="btn btn-primary"
                data-verify-evidence="${escapeHTML(id)}"
              >
                Verify
              </button>

              <button
                type="button"
                class="btn btn-secondary"
                data-reject-evidence="${escapeHTML(id)}"
              >
                Reject
              </button>
            `
            : "";

        return `
          <tr
            data-evidence-id="${escapeHTML(id)}"
          >
            <td>
              ${escapeHTML(memberName)}
            </td>

            <td>
              ${escapeHTML(
                formatKES(amount)
              )}
            </td>

            <td>
              ${escapeHTML(
                formatDate(date)
              )}
            </td>

            <td>
              ${escapeHTML(method)}
            </td>

            <td>
              ${escapeHTML(reference)}
            </td>

            <td>
              <span
                class="status-badge status-${escapeHTML(status)}"
              >
                ${escapeHTML(
                  evidenceStatusLabel(
                    status
                  )
                )}
              </span>
            </td>

            <td>
              ${actions}
            </td>
          </tr>
        `;
      })
      .join("");
}


/* =========================================================
   EVIDENCE LOOKUP
   ========================================================= */

function findEvidence(evidenceId) {
  return (
    state.paymentEvidence?.find(
      row =>
        String(
          row.id ??
          row.evidence_id
        ) ===
        String(evidenceId)
    ) ||
    null
  );
}


/* =========================================================
   VERIFY PAYMENT EVIDENCE
   ========================================================= */

async function verifyPaymentEvidence(
  evidenceId
) {
  if (!canVerifyEvidence()) {
    throw new Error(
      "You are not authorised to verify payment evidence."
    );
  }

  if (!evidenceId) {
    throw new Error(
      "Payment evidence could not be identified."
    );
  }

  /*
   * Verification is a backend accounting operation.
   *
   * The verification RPC is responsible for:
   *   1. validating the evidence
   *   2. authorising the payment
   *   3. invoking canonical contribution recording
   *   4. creating allocations
   *   5. maintaining accounting locks
   *   6. preserving replay safety
   */

  const result =
    await callRPC(
      "verify_member_payment_evidence",
      {
        p_evidence_id:
          evidenceId
      }
    );

  return result;
}


/* =========================================================
   REJECT PAYMENT EVIDENCE
   ========================================================= */

async function rejectPaymentEvidence(
  evidenceId,
  reason = null
) {
  if (!canVerifyEvidence()) {
    throw new Error(
      "You are not authorised to reject payment evidence."
    );
  }

  if (!evidenceId) {
    throw new Error(
      "Payment evidence could not be identified."
    );
  }

  /*
   * Rejection is also backend-owned.
   * No direct UPDATE against member_payment_evidence.
   */

  const rpcCandidates = [
    "reject_member_payment_evidence",
    "reject_payment_evidence"
  ];

  let lastError = null;

  for (
    const rpcName
    of rpcCandidates
  ) {
    try {
      return await callRPC(
        rpcName,
        {
          p_evidence_id:
            evidenceId,

          p_reason:
            reason
        }
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ||
    new Error(
      "Unable to reject payment evidence."
    )
  );
}


/* =========================================================
   VERIFY / REJECT CLICK HANDLERS
   ========================================================= */

async function handleEvidenceAction(
  event
) {
  const verifyButton =
    event.target.closest(
      "[data-verify-evidence]"
    );

  const rejectButton =
    event.target.closest(
      "[data-reject-evidence]"
    );

  if (
    !verifyButton &&
    !rejectButton
  ) {
    return;
  }

  const evidenceId =
    verifyButton?.dataset
      ?.verifyEvidence ||
    rejectButton?.dataset
      ?.rejectEvidence;

  if (!evidenceId) {
    return;
  }

  const evidence =
    findEvidence(
      evidenceId
    );

  if (!evidence) {
    notify(
      "Payment evidence could not be found.",
      "error"
    );
    return;
  }

  if (verifyButton) {
    const confirmed =
      window.confirm(
        `Verify the payment of ${
          formatKES(
            evidence.amount ??
            evidence.payment_amount ??
            0
          )
        } for ${
          getContributionMemberName(
            evidence
          )
        }?`
      );

    if (!confirmed) {
      return;
    }

    disable(
      verifyButton,
      true
    );

    try {
      await verifyPaymentEvidence(
        evidenceId
      );

      notify(
        "Payment evidence verified and recorded through canonical accounting.",
        "success"
      );

      await refreshContributionView();

      /*
       * Refresh evidence separately because verification
       * changes its status.
       */
      await loadPaymentEvidence();
    } catch (error) {
      console.error(
        "Evidence verification failed:",
        error
      );

      notify(
        error?.message ||
          "Unable to verify payment evidence.",
        "error"
      );
    } finally {
      disable(
        verifyButton,
        false
      );
    }

    return;
  }

  if (rejectButton) {
    const reason =
      window.prompt(
        "Reason for rejecting this payment evidence (optional):"
      );

    /*
     * Cancelled prompt means no action.
     */
    if (
      reason === null
    ) {
      return;
    }

    disable(
      rejectButton,
      true
    );

    try {
      await rejectPaymentEvidence(
        evidenceId,
        reason.trim() || null
      );

      notify(
        "Payment evidence rejected.",
        "success"
      );

      await loadPaymentEvidence();
    } catch (error) {
      console.error(
        "Evidence rejection failed:",
        error
      );

      notify(
        error?.message ||
          "Unable to reject payment evidence.",
        "error"
      );
    } finally {
      disable(
        rejectButton,
        false
      );
    }
  }
}


/* =========================================================
   CUSTOM CONTRIBUTION — ACTIVE DISPLAY
   ========================================================= */

function renderActiveContributionDashboardCards() {
  const containers = [
    firstExisting(
      "#adminActiveContributions",
      "#dashboardActiveContributions",
      "[data-admin-active-contributions]"
    )
  ].filter(Boolean);

  for (
    const container
    of containers
  ) {
    if (
      state.activeContributionTypes.length ===
      0
    ) {
      container.innerHTML = `
        <div class="empty-state">
          No active contributions.
        </div>
      `;

      continue;
    }

    container.innerHTML =
      state.activeContributionTypes
        .map(type => {
          const amount =
            Number.isFinite(type.amount)
              ? formatKES(type.amount)
              : "Variable";

          return `
            <article
              class="active-contribution-card"
              data-contribution-type-id="${
                escapeHTML(
                  type.id
                )
              }"
            >
              <div class="active-contribution-card__title">
                ${escapeHTML(
                  type.name ||
                  "Contribution"
                )}
              </div>

              <div class="active-contribution-card__amount">
                ${escapeHTML(amount)}
              </div>

              <div class="active-contribution-card__meta">
                ${
                  escapeHTML(
                    type.frequency ||
                    "Contribution"
                  )
                }
              </div>

              <span class="status-badge status-active">
                Active
              </span>
            </article>
          `;
        })
        .join("");
  }
}


/* =========================================================
   MEMBER CONTRIBUTION STATUS CARD
   ========================================================= */

async function renderMemberContributionCards() {
  const container =
    firstExisting(
      "#memberContributionStatuses",
      "#memberContributionTypes",
      "#memberContributionRules",
      "[data-member-contribution-statuses]"
    );

  if (!container) {
    return;
  }

  if (
    !state.member?.id
  ) {
    return;
  }

  if (
    !state.activeContributionTypes.length
  ) {
    container.innerHTML = `
      <div class="empty-state">
        No active contribution rules.
      </div>
    `;

    return;
  }

  const cards = [];

  for (
    const type
    of state.activeContributionTypes
  ) {
    try {
      const position =
        await getMemberContributionPosition(
          state.member.id,
          type.id
        );

      const normalised =
        normalisePosition(
          position
        );

      cards.push(`
        <article
          class="member-contribution-card"
          data-contribution-type-id="${
            escapeHTML(type.id)
          }"
        >
          <div class="member-contribution-card__header">
            <strong>
              ${escapeHTML(
                type.name ||
                "Contribution"
              )}
            </strong>

            <span
              class="status-badge ${statusClass(
                normalised.status
              )}"
            >
              ${escapeHTML(
                statusLabel(
                  normalised.status
                )
              )}
            </span>
          </div>

          <div class="member-contribution-card__amount">
            Required:
            ${escapeHTML(
              formatKES(
                normalised.required
              )
            )}
          </div>

          <div class="member-contribution-card__paid">
            Paid:
            ${escapeHTML(
              formatKES(
                normalised.allocated
              )
            )}
          </div>

          <div class="member-contribution-card__outstanding">
            Outstanding:
            ${escapeHTML(
              formatKES(
                normalised.outstanding
              )
            )}
          </div>
        </article>
      `);
    } catch (error) {
      console.error(
        "Member contribution position failed:",
        error
      );
    }
  }

  container.innerHTML =
    cards.join("");
}


/* =========================================================
   PART 3 END
   ========================================================= */

/*
   Part 4 continues with:

   • page initialisation
   • all event bindings
   • role-based form visibility
   • final refresh sequence
   • exported initPage()
   • no automatic page execution
*/
/* =========================================================
   PART 4 — INITIALISATION / EVENT BINDING / EXPORTS
   ========================================================= */


/* =========================================================
   FORM VISIBILITY
   ========================================================= */

function applyRoleBasedVisibility() {
  const managerOnlySelectors = [
    "#recordContributionSection",
    "#recordContributionCard",
    "#adminContributionSection",
    "#customContributionSection",
    "#customContributionCard",
    "[data-manager-only]"
  ];

  const verificationOnlySelectors = [
    "#paymentEvidenceVerification",
    "#evidenceVerification",
    "#verificationQueue",
    "[data-verification-only]"
  ];

  const managerAllowed =
    canManageContributions();

  const verifierAllowed =
    canVerifyEvidence();

  for (
    const selector
    of managerOnlySelectors
  ) {
    const elements =
      document.querySelectorAll(
        selector
      );

    elements.forEach(
      element => {
        if (managerAllowed) {
          show(element);
        } else {
          hide(element);
        }
      }
    );
  }

  for (
    const selector
    of verificationOnlySelectors
  ) {
    const elements =
      document.querySelectorAll(
        selector
      );

    elements.forEach(
      element => {
        if (verifierAllowed) {
          show(element);
        } else {
          hide(element);
        }
      }
    );
  }

  /*
   * Ordinary members can submit payment evidence.
   */
  const evidenceForm =
    firstExisting(
      "#paymentEvidenceForm",
      "[data-payment-evidence-form]"
    );

  if (evidenceForm) {
    show(evidenceForm);
  }
}


/* =========================================================
   DATE DEFAULT
   ========================================================= */

function setDefaultDates() {
  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const dateInputs = [
    firstExisting(
      "#contributionDate",
      "#contribution_date"
    ),

    firstExisting(
      "#evidenceDate",
      "#evidence_date"
    )
  ];

  for (
    const input
    of dateInputs
  ) {
    if (
      input &&
      !input.value
    ) {
      input.value =
        today;
    }
  }
}


/* =========================================================
   EVENT BINDING — CONTRIBUTION FORM
   ========================================================= */

function bindContributionForm() {
  const form =
    firstExisting(
      "#contributionForm",
      "#recordContributionForm",
      "[data-contribution-form]"
    );

  if (
    form &&
    !form.dataset.bound
  ) {
    form.addEventListener(
      "submit",
      recordContribution
    );

    form.dataset.bound =
      "true";
  }

  const typeSelect =
    firstExisting(
      "#contributionType",
      "#contribution_type",
      "#contributionTypeSelect",
      "#paymentContributionType"
    );

  if (
    typeSelect &&
    !typeSelect.dataset.bound
  ) {
    typeSelect.addEventListener(
      "change",
      handleContributionTypeChange
    );

    typeSelect.dataset.bound =
      "true";
  }

  const memberSelect =
    firstExisting(
      "#memberSelect",
      "#member",
      "#member_id",
      "#contributionMember"
    );

  if (
    memberSelect &&
    !memberSelect.dataset.bound
  ) {
    memberSelect.addEventListener(
      "change",
      handleMemberChange
    );

    memberSelect.dataset.bound =
      "true";
  }

  const amountInput =
    firstExisting(
      "#contributionAmount",
      "#contribution_amount",
      "#amount"
    );

  if (
    amountInput &&
    !amountInput.dataset.bound
  ) {
    amountInput.addEventListener(
      "input",
      () => {
        /*
         * Once the user manually changes the amount,
         * stop treating it as the automatically-filled
         * contribution-rule amount.
         */
        delete amountInput.dataset.autoFilled;
      }
    );

    amountInput.dataset.bound =
      "true";
  }
}


/* =========================================================
   EVENT BINDING — PAYMENT EVIDENCE
   ========================================================= */

function bindPaymentEvidenceForm() {
  const form =
    firstExisting(
      "#paymentEvidenceForm",
      "[data-payment-evidence-form]"
    );

  if (
    form &&
    !form.dataset.bound
  ) {
    form.addEventListener(
      "submit",
      submitPaymentEvidence
    );

    form.dataset.bound =
      "true";
  }
}


/* =========================================================
   EVENT BINDING — CUSTOM CONTRIBUTION
   ========================================================= */

function bindCustomContributionForm() {
  const form =
    firstExisting(
      "#customContributionForm",
      "[data-custom-contribution-form]"
    );

  if (
    form &&
    !form.dataset.bound
  ) {
    form.addEventListener(
      "submit",
      submitCustomContribution
    );

    form.dataset.bound =
      "true";
  }
}


/* =========================================================
   EVENT BINDING — EVIDENCE ACTIONS
   ========================================================= */

function bindEvidenceActions() {
  const containers = [
    firstExisting(
      "#paymentEvidenceBody",
      "#evidenceBody",
      "#paymentEvidenceList"
    )
  ].filter(Boolean);

  for (
    const container
    of containers
  ) {
    if (
      container.dataset.evidenceBound
    ) {
      continue;
    }

    container.addEventListener(
      "click",
      handleEvidenceAction
    );

    container.dataset.evidenceBound =
      "true";
  }
}


/* =========================================================
   EVENT BINDING — ACTIVE CONTRIBUTIONS
   ========================================================= */

function bindActiveContributionCards() {
  const containers = [
    firstExisting(
      "#activeContributions",
      "#activeContributionTypes",
      "#customContributions",
      "[data-active-contributions]"
    ),

    firstExisting(
      "#adminActiveContributions",
      "#dashboardActiveContributions",
      "[data-admin-active-contributions]"
    )
  ].filter(Boolean);

  for (
    const container
    of containers
  ) {
    if (
      container.dataset.activeContributionBound
    ) {
      continue;
    }

    container.addEventListener(
      "click",
      handleActiveContributionClick
    );

    container.dataset.activeContributionBound =
      "true";
  }
}


/* =========================================================
   EVENT BINDING — REFRESH BUTTONS
   ========================================================= */

function bindRefreshButtons() {
  const buttons =
    document.querySelectorAll(
      [
        "#refreshContributions",
        "#refreshContributionList",
        "#refreshEvidence",
        "[data-refresh-contributions]"
      ].join(",")
    );

  buttons.forEach(
    button => {
      if (
        button.dataset.bound
      ) {
        return;
      }

      button.addEventListener(
        "click",
        async () => {
          if (state.loading) {
            return;
          }

          try {
            state.loading =
              true;

            disable(
              button,
              true
            );

            await refreshContributionView();

            if (
              canVerifyEvidence()
            ) {
              await loadPaymentEvidence();
            }

            await renderMemberContributionCards();

          } catch (error) {
            console.error(
              "Contribution refresh failed:",
              error
            );

            notify(
              error?.message ||
                "Unable to refresh contributions.",
              "error"
            );
          } finally {
            state.loading =
              false;

            disable(
              button,
              false
            );
          }
        }
      );

      button.dataset.bound =
        "true";
    }
  );
}


/* =========================================================
   GLOBAL EVENT BINDING
   ========================================================= */

function bindEvents() {
  bindContributionForm();
  bindPaymentEvidenceForm();
  bindCustomContributionForm();
  bindEvidenceActions();
  bindActiveContributionCards();
  bindRefreshButtons();
}


/* =========================================================
   LOADING STATE
   ========================================================= */

function setPageLoading(isLoading) {
  const loader =
    firstExisting(
      "#contributionsLoading",
      "#pageLoading",
      "[data-contributions-loading]"
    );

  const content =
    firstExisting(
      "#contributionsContent",
      "#pageContent",
      "[data-contributions-content]"
    );

  if (isLoading) {
    if (loader) {
      show(loader);
    }

    return;
  }

  if (loader) {
    hide(loader);
  }

  if (content) {
    show(content);
  }
}


/* =========================================================
   INITIAL DATA LOAD
   ========================================================= */

async function loadInitialData() {
  /*
   * Order matters:
   *
   * 1. Auth/context
   * 2. Contribution definitions
   * 3. Members
   * 4. Ledger
   * 5. Evidence for authorised verifiers
   * 6. Member-specific statuses
   */

  await loadContext();

  await loadContributionTypes();

  renderPaymentContributionTypes();

  renderCustomContributionSummary();

  renderContributionTypeTable();

  renderActiveContributionDashboardCards();

  /*
   * Members are needed by manager/admin payment recording.
   */
  if (
    canManageContributions()
  ) {
    try {
      await loadMembers();
    } catch (error) {
      console.error(
        "Member list failed:",
        error
      );

      /*
       * Do not prevent the rest of the page from loading.
       */
      state.members = [];
    }
  }

  await loadContributionLedger();

  if (
    canVerifyEvidence()
  ) {
    await loadPaymentEvidence();
  }

  /*
   * A member dashboard can show the status for every active
   * contribution type:
   *
   *   Paid
   *   Outstanding
   *   Partially Paid
   *
   * This is derived from the canonical position RPC.
   */
  await renderMemberContributionCards();
}


/* =========================================================
   POST-LOAD RENDER
   ========================================================= */

function renderAfterLoad() {
  renderPaymentContributionTypes();

  renderCustomContributionSummary();

  renderContributionTypeTable();

  renderActiveContributionDashboardCards();

  applyRoleBasedVisibility();

  setDefaultDates();
}


/* =========================================================
   PUBLIC PAGE INITIALISATION
   ========================================================= */

export async function initPage() {
  if (state.loading) {
    return;
  }

  state.loading =
    true;

  clearNotification();

  setPageLoading(
    true
  );

  try {
    await loadInitialData();

    bindEvents();

    renderAfterLoad();

    /*
     * Refresh the managed-member accounting view when
     * available, but DO NOT require data.ok === true.
     *
     * The refresh RPC may return a different successful
     * payload shape.
     */
    if (
      canManageContributions()
    ) {
      try {
        const refreshResult =
          await callRPC(
            "refresh_my_managed_member_accounting",
            {
              p_group_id:
                state.group.id
            }
          );

        /*
         * The result is intentionally not validated as:
         *
         *     refreshResult.ok === true
         *
         * because that is not part of the RPC contract.
         */

        if (
          refreshResult === null ||
          refreshResult === undefined
        ) {
          /*
           * A null result is not treated as a frontend
           * accounting failure.
           */
        }
      } catch (error) {
        /*
         * The page itself should remain usable if this
         * optional refresh RPC is unavailable.
         */
        console.warn(
          "Managed-member accounting refresh unavailable:",
          error
        );
      }
    }

    /*
     * Re-render member statuses after the accounting refresh.
     */
    await renderMemberContributionCards();

    setPageLoading(
      false
    );

    return {
      ok: true,
      user: state.user,
      member: state.member,
      group: state.group
    };

  } catch (error) {
    console.error(
      "Contributions page initialisation failed:",
      error
    );

    setPageLoading(
      false
    );

    notify(
      error?.message ||
        "Unable to load Contributions.",
      "error"
    );

    return {
      ok: false,
      error
    };

  } finally {
    state.loading =
      false;
  }
}


/* =========================================================
   PUBLIC REFRESH API
   ========================================================= */

export async function refreshPage() {
  if (state.loading) {
    return;
  }

  state.loading =
    true;

  try {
    await refreshContributionView();

    if (
      canVerifyEvidence()
    ) {
      await loadPaymentEvidence();
    }

    await renderMemberContributionCards();

    return true;
  } catch (error) {
    console.error(
      "Contributions refresh failed:",
      error
    );

    notify(
      error?.message ||
        "Unable to refresh Contributions.",
      "error"
    );

    return false;

  } finally {
    state.loading =
      false;
  }
}


/* =========================================================
   OPTIONAL PUBLIC HELPERS
   ========================================================= */

export function getContributionState() {
  return {
    ...state,

    /*
     * Return copies so callers cannot accidentally mutate
     * this module's internal arrays.
     */
    members: [
      ...(state.members || [])
    ],

    contributionTypes: [
      ...(state.contributionTypes || [])
    ],

    activeContributionTypes: [
      ...(state.activeContributionTypes || [])
    ],

    contributions: [
      ...(state.contributions || [])
    ],

    paymentEvidence: [
      ...(state.paymentEvidence || [])
    ]
  };
}


/* =========================================================
   NO AUTO-RUN
   =========================================================

   IMPORTANT:

   Do NOT add:

       initPage();

   here.

   The HTML page/application loader owns page startup.

   Example:

       import {
         initPage
       } from "./js/contributions.js";

       await initPage();

   This prevents duplicate initialisation and keeps the
   page architecture consistent with the other CHAMA LIVE
   modules.
   ========================================================= */


/* =========================================================
   FINAL EXPORTS
   ========================================================= */

export {
  loadContributionTypes,
  loadMembers,
  loadContributionLedger,

  submitPaymentEvidence,
  recordContribution,

  submitCustomContribution,

  loadPaymentEvidence,
  verifyPaymentEvidence,
  rejectPaymentEvidence,

  getMemberContributionPosition,
  loadMemberContributionStatus,

  refreshActiveContributionTypes
};


/* =========================================================
   END — CHAMA LIVE CONTRIBUTIONS
   ========================================================= */


