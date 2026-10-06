/* ================================================================
   CHAMA LIVE — CONTRIBUTIONS
   CANONICAL 2B ACCOUNTING VERSION

   MEMBER PAYMENT EVIDENCE
   CUSTOM CONTRIBUTION INTEGRATION
   ---------------------------------------------------------------
   FRONTEND / ACCOUNTING BOUNDARY
   ---------------------------------------------------------------
   • Frontend is presentation/orchestration only.
   • Frontend NEVER directly inserts/updates:
       contributions
       contribution_allocations
       contribution_obligations
   • Ordinary members submit payment evidence.
   • Authorised users verify/reject payment evidence.
   • Verified payment accounting is handled by:
       cl_2b_record_contribution()
   • Custom contribution definitions are created through RPC.
   • Active contribution definitions remain visible after creation.
   • Active contribution types appear in the payment selector.
   • Member contribution status shows Paid / Outstanding.
   • No automatic execution.
   • initPage() is the page entry point.
   • Non-critical RPC failures must NOT produce a white screen.
================================================================ */


/* ================================================================
   IMPORTS
================================================================ */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";


/* ================================================================
   STATE
================================================================ */

const state = {
  user: null,
  member: null,
  group: null,

  members: [],

  contributionTypes: [],
  activeContributionTypes: [],

  contributions: [],
  paymentEvidence: [],

  selectedMemberId: null,
  selectedContributionTypeId: null,

  loading: false,
  submitting: false
};


/* ================================================================
   DOM HELPERS
================================================================ */

function $(selector, root = document) {
  try {
    return root.querySelector(selector);
  } catch (error) {
    console.warn(
      "Invalid selector:",
      selector,
      error
    );

    return null;
  }
}


function $all(selector, root = document) {
  try {
    return Array.from(
      root.querySelectorAll(selector)
    );
  } catch (error) {
    console.warn(
      "Invalid selector:",
      selector,
      error
    );

    return [];
  }
}


function byId(id) {
  return document.getElementById(id);
}


function firstExisting(...selectors) {
  for (const selector of selectors) {
    const element = $(selector);

    if (element) {
      return element;
    }
  }

  return null;
}


function setText(
  elementOrSelector,
  value
) {
  const element =
    typeof elementOrSelector === "string"
      ? $(elementOrSelector)
      : elementOrSelector;

  if (!element) {
    return;
  }

  element.textContent =
    value === null ||
    value === undefined
      ? ""
      : String(value);
}


function setHTML(
  elementOrSelector,
  value
) {
  const element =
    typeof elementOrSelector === "string"
      ? $(elementOrSelector)
      : elementOrSelector;

  if (!element) {
    return;
  }

  element.innerHTML =
    value === null ||
    value === undefined
      ? ""
      : String(value);
}


function show(elementOrSelector) {
  const element =
    typeof elementOrSelector === "string"
      ? $(elementOrSelector)
      : elementOrSelector;

  if (!element) {
    return;
  }

  element.hidden = false;

  if (
    element.style.display === "none"
  ) {
    element.style.display = "";
  }
}


function hide(elementOrSelector) {
  const element =
    typeof elementOrSelector === "string"
      ? $(elementOrSelector)
      : elementOrSelector;

  if (!element) {
    return;
  }

  element.hidden = true;
  element.style.display = "none";
}


function disable(
  elementOrSelector,
  value = true
) {
  const element =
    typeof elementOrSelector === "string"
      ? $(elementOrSelector)
      : elementOrSelector;

  if (!element) {
    return;
  }

  element.disabled =
    Boolean(value);
}


/* ================================================================
   NOTIFICATIONS
================================================================ */

function notify(
  message,
  type = "info"
) {
  const element =
    firstExisting(
      "#contributionNotification",
      "#contributionsNotification",
      "#notification",
      "[data-contribution-notification]"
    );

  if (!element) {
    console[type === "error"
      ? "error"
      : "log"](
      "CHAMA LIVE Contributions:",
      message
    );

    return;
  }

  element.textContent =
    message === null ||
    message === undefined
      ? ""
      : String(message);

  element.dataset.type =
    type;

  element.classList.remove(
    "success",
    "error",
    "warning",
    "info"
  );

  element.classList.add(type);

  show(element);
}


function clearNotification() {
  const element =
    firstExisting(
      "#contributionNotification",
      "#contributionsNotification",
      "#notification",
      "[data-contribution-notification]"
    );

  if (!element) {
    return;
  }

  element.textContent = "";

  element.classList.remove(
    "success",
    "error",
    "warning",
    "info"
  );

  hide(element);
}


/* ================================================================
   FORMATTERS
================================================================ */

function formatKES(value) {
  const amount =
    Number(value);

  if (!Number.isFinite(amount)) {
    return "KSh 0";
  }

  return (
    "KSh " +
    amount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }
    )
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
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );
}


function normaliseAmount(value) {
  const amount =
    Number(value);

  return Number.isFinite(amount)
    ? amount
    : 0;
}


/*
 * Compatibility-safe HTML escaping.
 * Do not use String.prototype.replaceAll().
 */
function escapeHTML(value) {
  return String(
    value === null ||
    value === undefined
      ? ""
      : value
  )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* ================================================================
   ERROR HELPERS
================================================================ */

function errorMessage(
  error,
  fallback
) {
  if (
    error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  if (
    typeof error === "string" &&
    error.trim()
  ) {
    return error;
  }

  return fallback;
}


/* ================================================================
   ROLE HELPERS
================================================================ */

function normaliseRole(role) {
  return String(
    role || ""
  )
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}


function getMemberRole() {
  return normaliseRole(
    state.member?.role ||
    state.member?.member_role ||
    state.member?.group_role ||
    state.member?.user_role
  );
}


function canManageContributions() {
  return [
    "owner",
    "admin",
    "administrator",
    "chairperson",
    "secretary",
    "treasurer"
  ].indexOf(
    getMemberRole()
  ) !== -1;
}


function canVerifyEvidence() {
  return [
    "admin",
    "administrator",
    "chairperson",
    "secretary",
    "treasurer"
  ].indexOf(
    getMemberRole()
  ) !== -1;
}


/* ================================================================
   RPC WRAPPER
================================================================ */

async function callRPC(
  name,
  args = {}
) {
  const {
    data,
    error
  } =
    await supabase.rpc(
      name,
      args
    );

  if (error) {
    throw error;
  }

  return data;
}


/* ================================================================
   AUTH / GROUP CONTEXT
================================================================ */

async function loadContext() {
  const user =
    await requireAuth();

  if (!user) {
    throw new Error(
      "Authentication is required."
    );
  }

  state.user =
    user;

  const member =
    await getMyMember();

  if (!member) {
    throw new Error(
      "Your group membership could not be found."
    );
  }

  state.member =
    member;

  const group =
    await getMyGroup();

  if (!group?.id) {
    throw new Error(
      "Your group could not be found."
    );
  }

  state.group =
    group;

  return {
    user,
    member,
    group
  };
}


/* ================================================================
   RPC RESULT EXTRACTION
================================================================ */

function extractRows(result) {
  if (Array.isArray(result)) {
    return result;
  }

  if (
    result &&
    Array.isArray(result.data)
  ) {
    return result.data;
  }

  if (
    result &&
    Array.isArray(result.rows)
  ) {
    return result.rows;
  }

  if (
    result &&
    Array.isArray(result.results)
  ) {
    return result.results;
  }

  if (
    result &&
    result.data &&
    Array.isArray(result.data.rows)
  ) {
    return result.data.rows;
  }

  return [];
}


/* ================================================================
   CONTRIBUTION TYPE NORMALISATION
================================================================ */

function normaliseContributionType(row) {
  if (!row) {
    return null;
  }

  const id =
    row.id ??
    row.contribution_type_id ??
    row.type_id ??
    row.goal_id;

  if (!id) {
    return null;
  }

  const name =
    row.name ??
    row.contribution_name ??
    row.type_name ??
    row.title ??
    row.contribution_type ??
    "Contribution";

  const amount =
    normaliseAmount(
      row.amount ??
      row.required_amount ??
      row.contribution_amount ??
      row.monthly_amount
    );

  let active;

  if (
    row.is_active !== undefined &&
    row.is_active !== null
  ) {
    active =
      Boolean(row.is_active);
  } else {
    active =
      String(
        row.status || "active"
      )
        .trim()
        .toLowerCase() ===
      "active";
  }

  return {
    ...row,

    id,

    name:
      String(name),

    amount,

    status:
      row.status ??
      (
        active
          ? "active"
          : "inactive"
      ),

    is_active:
      active,

    frequency:
      row.frequency ??
      row.interval ??
      "monthly",

    description:
      row.description ??
      "",

    type:
      row.type ??
      row.contribution_type ??
      "contribution"
  };
}


/* ================================================================
   LOAD CONTRIBUTION TYPES
================================================================ */

async function loadContributionTypes() {
  if (!state.group?.id) {
    state.contributionTypes = [];
    state.activeContributionTypes = [];

    renderPaymentContributionTypes();
    renderCustomContributionSummary();
    renderContributionTypeTable();
    renderActiveContributionDashboardCards();

    return [];
  }

  let successfulRows = null;
  let lastError = null;

  const candidates = [
    "get_active_contribution_types",
    "get_group_contribution_types",
    "get_contribution_types"
  ];

  for (
    const rpcName of candidates
  ) {
    try {
      const result =
        await callRPC(
          rpcName,
          {
            p_group_id:
              state.group.id
          }
        );

      const rows =
        extractRows(result);

      if (
        Array.isArray(rows)
      ) {
        successfulRows =
          rows;

        break;
      }

    } catch (error) {
      lastError =
        error;
    }
  }

  /*
   * Do not throw here.
   *
   * Contribution definitions are important, but
   * failure to read them must not white-screen
   * the entire page.
   */
  if (
    !Array.isArray(
      successfulRows
    )
  ) {
    state.contributionTypes = [];
    state.activeContributionTypes = [];

    renderPaymentContributionTypes();
    renderCustomContributionSummary();
    renderContributionTypeTable();
    renderActiveContributionDashboardCards();

    console.warn(
      "Unable to load contribution types:",
      lastError
    );

    return [];
  }

  state.contributionTypes =
    successfulRows
      .map(
        normaliseContributionType
      )
      .filter(Boolean);

  state.activeContributionTypes =
    state.contributionTypes.filter(
      type =>
        type.is_active !== false &&
        String(
          type.status || "active"
        )
          .trim()
          .toLowerCase() !==
        "inactive"
    );

  renderPaymentContributionTypes();
  renderCustomContributionSummary();
  renderContributionTypeTable();
  renderActiveContributionDashboardCards();

  return state.activeContributionTypes;
}


/* ================================================================
   PAYMENT CONTRIBUTION TYPE SELECT
================================================================ */

function renderPaymentContributionTypes() {
  const selectors = [
    "#contributionType",
    "#contribution_type",
    "#contributionTypeSelect",
    "#paymentContributionType"
  ];

  const selects =
    selectors
      .map(
        selector =>
          $(selector)
      )
      .filter(Boolean);

  if (!selects.length) {
    return;
  }

  selects.forEach(select => {
    const currentValue =
      select.value;

    const fragment =
      document.createDocumentFragment();

    const placeholder =
      document.createElement(
        "option"
      );

    placeholder.value = "";
    placeholder.textContent =
      "Select contribution type";

    fragment.appendChild(
      placeholder
    );

    state.activeContributionTypes
      .forEach(type => {
        const option =
          document.createElement(
            "option"
          );

        option.value =
          String(type.id);

        option.textContent =
          type.amount > 0
            ? `${type.name} — ${formatKES(type.amount)}`
            : type.name;

        option.dataset.amount =
          String(type.amount);

        option.dataset.frequency =
          String(
            type.frequency || ""
          );

        fragment.appendChild(
          option
        );
      });

    select.replaceChildren(
      fragment
    );

    if (
      currentValue &&
      state.activeContributionTypes.some(
        type =>
          String(type.id) ===
          String(currentValue)
      )
    ) {
      select.value =
        currentValue;
    }
  });
}


/* ================================================================
   MEMBERS
================================================================ */

function getMemberDisplayName(
  member
) {
  if (!member) {
    return "Member";
  }

  const name =
    member.full_name ||
    member.name ||
    member.member_name ||
    [
      member.first_name,
      member.last_name
    ]
      .filter(Boolean)
      .join(" ");

  return (
    name ||
    member.email ||
    "Member"
  );
}


async function loadMembers() {
  if (
    !state.group?.id ||
    !canManageContributions()
  ) {
    state.members = [];
    renderMemberOptions();

    return [];
  }

  try {
    const result =
      await callRPC(
        "get_group_members",
        {
          p_group_id:
            state.group.id
        }
      );

    const rows =
      extractRows(result);

    state.members =
      Array.isArray(rows)
        ? rows
        : [];

    renderMemberOptions();

    return state.members;

  } catch (error) {
    state.members = [];

    renderMemberOptions();

    console.warn(
      "Unable to load group members:",
      error
    );

    return [];
  }
}


function renderMemberOptions() {
  const selectors = [
    "#memberSelect",
    "#member_id",
    "#contributionMember",
    "#recordContributionMember"
  ];

  const selects =
    selectors
      .map(
        selector =>
          $(selector)
      )
      .filter(Boolean);

  selects.forEach(select => {
    const currentValue =
      select.value;

    const fragment =
      document.createDocumentFragment();

    const placeholder =
      document.createElement(
        "option"
      );

    placeholder.value = "";
    placeholder.textContent =
      "Select member";

    fragment.appendChild(
      placeholder
    );

    state.members.forEach(member => {
      const id =
        member.id ??
        member.member_id;

      if (!id) {
        return;
      }

      const option =
        document.createElement(
          "option"
        );

      option.value =
        String(id);

      option.textContent =
        getMemberDisplayName(
          member
        );

      fragment.appendChild(
        option
      );
    });

    select.replaceChildren(
      fragment
    );

    if (
      currentValue &&
      state.members.some(
        member =>
          String(
            member.id ??
            member.member_id
          ) ===
          String(currentValue)
      )
    ) {
      select.value =
        currentValue;
    }
  });
}


/* ================================================================
   ACTIVE CONTRIBUTION SUMMARY
================================================================ */

function renderCustomContributionSummary() {
  const container =
    firstExisting(
      "#activeContributions",
      "#activeContributionTypes",
      "#customContributions",
      "[data-active-contributions]"
    );

  if (!container) {
    return;
  }

  if (
    !state.activeContributionTypes.length
  ) {
    setHTML(
      container,
      `
        <div class="empty-state">
          No active contributions found.
        </div>
      `
    );

    return;
  }

  setHTML(
    container,
    state.activeContributionTypes
      .map(type => `
        <article
          class="contribution-card"
          data-contribution-type-id="${escapeHTML(type.id)}"
        >
          <div class="contribution-card-header">
            <h3>
              ${escapeHTML(type.name)}
            </h3>

            <span class="status active">
              Active
            </span>
          </div>

          <div class="contribution-card-amount">
            ${formatKES(type.amount)}
          </div>

          <div class="contribution-card-frequency">
            ${escapeHTML(
              type.frequency ||
              "ongoing"
            )}
          </div>

          ${
            type.description
              ? `
                <p class="contribution-card-description">
                  ${escapeHTML(
                    type.description
                  )}
                </p>
              `
              : ""
          }
        </article>
      `)
      .join("")
  );
}


/* ================================================================
   ACTIVE CONTRIBUTION TABLE
================================================================ */

function renderContributionTypeTable() {
  const container =
    firstExisting(
      "#contributionTypesBody",
      "#contributionTypeTableBody",
      "#activeContributionTypesBody",
      "[data-contribution-types-body]"
    );

  if (!container) {
    return;
  }

  if (
    !state.activeContributionTypes.length
  ) {
    setHTML(
      container,
      `
        <tr>
          <td colspan="6">
            No active contributions.
          </td>
        </tr>
      `
    );

    return;
  }

  setHTML(
    container,
    state.activeContributionTypes
      .map(type => `
        <tr
          data-contribution-type-id="${escapeHTML(type.id)}"
        >
          <td>
            ${escapeHTML(type.name)}
          </td>

          <td>
            ${formatKES(type.amount)}
          </td>

          <td>
            ${escapeHTML(
              type.frequency ||
              "—"
            )}
          </td>

          <td>
            ${escapeHTML(
              type.description ||
              "—"
            )}
          </td>

          <td>
            <span class="status active">
              Active
            </span>
          </td>
        </tr>
      `)
      .join("")
  );
}


/* ================================================================
   ADMIN ACTIVE CONTRIBUTIONS
================================================================ */

function renderActiveContributionDashboardCards() {
  const container =
    firstExisting(
      "#adminActiveContributions",
      "#dashboardActiveContributions",
      "#ongoingContributions",
      "[data-admin-active-contributions]"
    );

  if (!container) {
    return;
  }

  if (
    !state.activeContributionTypes.length
  ) {
    setHTML(
      container,
      `
        <div class="empty-state">
          No ongoing active contributions.
        </div>
      `
    );

    return;
  }

  setHTML(
    container,
    state.activeContributionTypes
      .map(type => `
        <div
          class="active-contribution-dashboard-card"
          data-contribution-type-id="${escapeHTML(type.id)}"
        >
          <div>
            <strong>
              ${escapeHTML(type.name)}
            </strong>

            <span class="status active">
              Active
            </span>
          </div>

          <div>
            ${formatKES(type.amount)}
          </div>

          <small>
            ${escapeHTML(
              type.frequency ||
              "ongoing"
            )}
          </small>
        </div>
      `)
      .join("")
  );
}


/* ================================================================
   SELECTED CONTRIBUTION TYPE
================================================================ */

function getSelectedContributionType() {
  const select =
    firstExisting(
      "#contributionType",
      "#contribution_type",
      "#contributionTypeSelect",
      "#paymentContributionType"
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
  const type =
    getSelectedContributionType();

  if (!type) {
    return;
  }

  const amountInputs = [
    "#contributionAmount",
    "#contribution_amount",
    "#paymentAmount"
  ];

  amountInputs.forEach(
    selector => {
      const input =
        $(selector);

      if (
        input &&
        (
          !input.value ||
          Number(input.value) === 0
        )
      ) {
        input.value =
          type.amount || "";
      }
    }
  );
}


/* ================================================================
   CONTRIBUTION FORM
================================================================ */

function getContributionFormValues() {
  const memberSelect =
    firstExisting(
      "#memberSelect",
      "#member_id",
      "#contributionMember",
      "#recordContributionMember"
    );

  const typeSelect =
    firstExisting(
      "#contributionType",
      "#contribution_type",
      "#contributionTypeSelect",
      "#paymentContributionType"
    );

  const amountInput =
    firstExisting(
      "#contributionAmount",
      "#contribution_amount",
      "#paymentAmount"
    );

  const dateInput =
    firstExisting(
      "#contributionDate",
      "#contribution_date",
      "#paymentDate"
    );

  const methodInput =
    firstExisting(
      "#paymentMethod",
      "#payment_method",
      "#contributionPaymentMethod"
    );

  const referenceInput =
    firstExisting(
      "#paymentReference",
      "#payment_reference",
      "#reference"
    );

  const notesInput =
    firstExisting(
      "#contributionNotes",
      "#contribution_notes",
      "#notes"
    );

  return {
    memberId:
      memberSelect?.value ||
      state.selectedMemberId ||
      null,

    contributionTypeId:
      typeSelect?.value ||
      state.selectedContributionTypeId ||
      null,

    amount:
      normaliseAmount(
        amountInput?.value
      ),

    contributionDate:
      dateInput?.value ||
      null,

    paymentMethod:
      methodInput?.value ||
      null,

    reference:
      referenceInput?.value?.trim() ||
      null,

    notes:
      notesInput?.value?.trim() ||
      null
  };
}


function resetContributionForm() {
  const form =
    firstExisting(
      "#recordContributionForm",
      "#contributionForm"
    );

  if (form) {
    form.reset();
  }

  state.selectedMemberId =
    null;

  state.selectedContributionTypeId =
    null;

  setDefaultDates();
}


/* ================================================================
   CANONICAL CONTRIBUTION RECORDING
================================================================ */

async function recordContribution(
  event
) {
  if (event) {
    event.preventDefault();
  }

  if (
    !canManageContributions()
  ) {
    notify(
      "You do not have permission to record contributions.",
      "error"
    );

    return {
      ok: false
    };
  }

  if (state.submitting) {
    return {
      ok: false,
      busy: true
    };
  }

  const values =
    getContributionFormValues();

  if (!values.memberId) {
    notify(
      "Select a member.",
      "error"
    );

    return {
      ok: false
    };
  }

  if (!values.contributionTypeId) {
    notify(
      "Select a contribution type.",
      "error"
    );

    return {
      ok: false
    };
  }

  if (
    !Number.isFinite(
      values.amount
    ) ||
    values.amount <= 0
  ) {
    notify(
      "Enter a valid contribution amount.",
      "error"
    );

    return {
      ok: false
    };
  }

  if (!values.contributionDate) {
    notify(
      "Select the contribution date.",
      "error"
    );

    return {
      ok: false
    };
  }

  state.submitting =
    true;

  const submitButtons =
    $all(
      "#recordContributionForm button[type='submit'], " +
      "#contributionForm button[type='submit']"
    );

  submitButtons.forEach(
    button =>
      disable(button, true)
  );

  try {
    /*
     * CANONICAL ACCOUNTING WRITE.
     *
     * No direct insert/update into accounting tables.
     */
    const result =
      await callRPC(
        "cl_2b_record_contribution",
        {
          p_group_id:
            state.group.id,

          p_member_id:
            values.memberId,

          p_contribution_type_id:
            values.contributionTypeId,

          p_amount:
            values.amount,

          p_contribution_date:
            values.contributionDate,

          p_payment_method:
            values.paymentMethod,

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
     * Refresh display only.
     */
    await loadContributionLedger();

    await renderMemberContributionCards();

    return {
      ok: true,
      data: result
    };

  } catch (error) {
    console.error(
      "CHAMA LIVE contribution recording failed:",
      error
    );

    notify(
      errorMessage(
        error,
        "Unable to record the contribution."
      ),
      "error"
    );

    return {
      ok: false,
      error
    };

  } finally {
    state.submitting =
      false;

    submitButtons.forEach(
      button =>
        disable(button, false)
    );
  }
}


/* ================================================================
   MEMBER CONTRIBUTION POSITION
================================================================ */

async function getMemberContributionPosition(
  memberId,
  contributionTypeId
) {
  if (
    !memberId ||
    !contributionTypeId
  ) {
    return null;
  }

  let lastError =
    null;

  const candidates = [
    "get_member_contribution_position",
    "get_member_contribution_status"
  ];

  for (
    const rpcName of candidates
  ) {
    try {
      const result =
        await callRPC(
          rpcName,
          {
            p_member_id:
              memberId,

            p_contribution_type_id:
              contributionTypeId
          }
        );

      const rows =
        extractRows(result);

      if (
        rows.length > 0
      ) {
        return normalisePosition(
          rows[0]
        );
      }

      if (
        result &&
        typeof result === "object" &&
        !Array.isArray(result)
      ) {
        return normalisePosition(
          result
        );
      }

      return normalisePosition({});

    } catch (error) {
      lastError =
        error;
    }
  }

  console.warn(
    "Unable to load member contribution position:",
    lastError
  );

  return null;
}


function normalisePosition(
  row
) {
  row =
    row || {};

  const required =
    normaliseAmount(
      row.required ??
      row.required_amount ??
      row.amount_due ??
      row.obligation_amount
    );

  const paid =
    normaliseAmount(
      row.paid ??
      row.paid_amount ??
      row.total_paid ??
      row.allocated
    );

  const allocated =
    normaliseAmount(
      row.allocated ??
      row.allocated_amount ??
      paid
    );

  const outstandingRaw =
    row.outstanding ??
    row.outstanding_amount ??
    row.balance;

  const outstanding =
    outstandingRaw !== undefined &&
    outstandingRaw !== null
      ? normaliseAmount(
          outstandingRaw
        )
      : Math.max(
          required -
          allocated,
          0
        );

  const unapplied =
    normaliseAmount(
      row.unapplied ??
      row.unapplied_amount ??
      row.credit
    );

  let status =
    row.status ??
    row.payment_status ??
    null;

  if (!status) {
    if (required <= 0) {
      status = "not_due";
    } else if (
      outstanding <= 0
    ) {
      status = "paid";
    } else if (
      allocated > 0
    ) {
      status = "partial";
    } else {
      status = "outstanding";
    }
  }

  return {
    ...row,

    required,
    paid,
    allocated,
    outstanding,
    unapplied,

    status:
      String(status)
        .trim()
        .toLowerCase()
  };
}


/* ================================================================
   STATUS HELPERS
================================================================ */

function statusLabel(
  status
) {
  const value =
    String(
      status || ""
    )
      .trim()
      .toLowerCase();

  switch (value) {
    case "paid":
    case "settled":
      return "Paid";

    case "outstanding":
    case "due":
    case "unpaid":
      return "Outstanding";

    case "partial":
    case "partially_paid":
      return "Partially Paid";

    case "not_due":
      return "Not Due";

    case "pending":
      return "Pending";

    case "rejected":
      return "Rejected";

    default:
      return status
        ? String(status)
        : "Outstanding";
  }
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
    [
      "paid",
      "settled"
    ].indexOf(value) !== -1
  ) {
    return "paid";
  }

  if (
    [
      "partial",
      "partially_paid"
    ].indexOf(value) !== -1
  ) {
    return "partial";
  }

  if (
    ["pending"].indexOf(
      value
    ) !== -1
  ) {
    return "pending";
  }

  if (
    ["rejected"].indexOf(
      value
    ) !== -1
  ) {
    return "rejected";
  }

  return "outstanding";
}


/* ================================================================
   MEMBER CONTRIBUTION CARDS
================================================================ */

async function loadMemberContributionStatus(
  memberId = state.member?.id
) {
  if (!memberId) {
    return [];
  }

  const positions = [];

  /*
   * Continue through all active contribution rules.
   * One failed status RPC must not destroy the
   * remaining cards.
   */
  for (
    const type
    of state.activeContributionTypes
  ) {
    try {
      const position =
        await getMemberContributionPosition(
          memberId,
          type.id
        );

      positions.push({
        type,

        position:
          position ||
          normalisePosition({})
      });

    } catch (error) {
      console.warn(
        "Contribution status failed:",
        {
          memberId,
          contributionTypeId:
            type.id,
          error
        }
      );

      positions.push({
        type,

        position:
          normalisePosition({})
      });
    }
  }

  return positions;
}


async function renderMemberContributionCards() {
  const container =
    firstExisting(
      "#memberContributionCards",
      "#memberContributions",
      "#memberContributionStatus",
      "[data-member-contributions]"
    );

  if (!container) {
    return [];
  }

  const memberId =
    state.member?.id;

  if (!memberId) {
    setHTML(
      container,
      `
        <div class="empty-state">
          Member information is unavailable.
        </div>
      `
    );

    return [];
  }

  if (
    !state.activeContributionTypes.length
  ) {
    setHTML(
      container,
      `
        <div class="empty-state">
          No active contribution rules.
        </div>
      `
    );

    return [];
  }

  const positions =
    await loadMemberContributionStatus(
      memberId
    );

  if (!positions.length) {
    setHTML(
      container,
      `
        <div class="empty-state">
          No contribution status available.
        </div>
      `
    );

    return [];
  }

  setHTML(
    container,
    positions
      .map(
        ({ type, position }) => `
          <article
            class="member-contribution-card"
            data-contribution-type-id="${escapeHTML(type.id)}"
          >
            <div class="member-contribution-card-header">

              <div>
                <h3>
                  ${escapeHTML(type.name)}
                </h3>

                <small>
                  ${escapeHTML(
                    type.frequency ||
                    "ongoing"
                  )}
                </small>
              </div>

              <span
                class="status ${escapeHTML(
                  statusClass(
                    position.status
                  )
                )}"
              >
                ${escapeHTML(
                  statusLabel(
                    position.status
                  )
                )}
              </span>

            </div>

            <div class="member-contribution-card-values">

              <div>
                <small>Required</small>

                <strong>
                  ${formatKES(
                    type.amount
                  )}
                </strong>
              </div>

              <div>
                <small>Paid</small>

                <strong>
                  ${formatKES(
                    position.allocated
                  )}
                </strong>
              </div>

              <div>
                <small>Outstanding</small>

                <strong>
                  ${formatKES(
                    position.outstanding
                  )}
                </strong>
              </div>

            </div>

            ${
              type.description
                ? `
                  <p>
                    ${escapeHTML(
                      type.description
                    )}
                  </p>
                `
                : ""
            }

          </article>
        `
      )
      .join("")
  );

  return positions;
}


/* ================================================================
   CONTRIBUTION LEDGER
   ---------------------------------------------------------------
   IMPORTANT:
   There is exactly ONE declaration of this function.
================================================================ */

async function loadContributionLedger() {
  const container =
    firstExisting(
      "#contributionsBody",
      "#contributionTableBody",
      "#contributionsList",
      "[data-contributions-body]"
    );

  /*
   * Always start from a clean state for a new refresh.
   * This prevents stale accounting data from remaining
   * visible after an unsuccessful read.
   */
  state.contributions = [];

  if (!state.group?.id) {
    renderContributionLedger(
      []
    );

    return [];
  }

  let successfulRows =
    null;

  let lastError =
    null;

  const candidates = [
    "get_group_contribution_ledger",
    "get_contribution_ledger",
    "get_contributions"
  ];

  for (
    const rpcName of candidates
  ) {
    try {
      const result =
        await callRPC(
          rpcName,
          {
            p_group_id:
              state.group.id
          }
        );

      const rows =
        extractRows(result);

      if (
        Array.isArray(rows)
      ) {
        successfulRows =
          rows;

        break;
      }

    } catch (error) {
      lastError =
        error;
    }
  }

  if (
    Array.isArray(
      successfulRows
    )
  ) {
    state.contributions =
      successfulRows;

  } else {
    state.contributions = [];

    console.warn(
      "Unable to load contribution ledger:",
      lastError
    );

    if (container) {
      if (
        container.tagName ===
        "TBODY"
      ) {
        setHTML(
          container,
          `
            <tr>
              <td colspan="8">
                Contribution records are temporarily unavailable.
              </td>
            </tr>
          `
        );
      } else {
        setHTML(
          container,
          `
            <div class="empty-state">
              Contribution records are temporarily unavailable.
            </div>
          `
        );
      }
    }
  }

  renderContributionLedger(
    state.contributions
  );

  return state.contributions;
}


function getContributionMemberName(
  row
) {
  return (
    row?.member_name ||
    row?.full_name ||
    row?.member?.full_name ||
    row?.name ||
    "Member"
  );
}


function getContributionTypeName(
  row
) {
  return (
    row?.contribution_type_name ||
    row?.type_name ||
    row?.contribution_name ||
    row?.contribution_type ||
    row?.type?.name ||
    "Contribution"
  );
}


function getContributionStatus(
  row
) {
  return (
    row?.status ||
    row?.payment_status ||
    row?.allocation_status ||
    "Recorded"
  );
}


function renderContributionRow(
  row
) {
  row =
    row || {};

  const amount =
    normaliseAmount(
      row.amount ??
      row.contribution_amount
    );

  const date =
    row.contribution_date ??
    row.payment_date ??
    row.date ??
    row.created_at;

  const paymentMethod =
    row.payment_method ??
    row.method ??
    "—";

  const reference =
    row.reference ??
    row.payment_reference ??
    row.mpesa_reference ??
    "—";

  return `
    <tr>

      <td>
        ${escapeHTML(
          formatDate(date)
        )}
      </td>

      <td>
        ${escapeHTML(
          getContributionMemberName(
            row
          )
        )}
      </td>

      <td>
        ${escapeHTML(
          getContributionTypeName(
            row
          )
        )}
      </td>

      <td>
        ${formatKES(amount)}
      </td>

      <td>
        ${escapeHTML(
          paymentMethod
        )}
      </td>

      <td>
        ${escapeHTML(
          reference
        )}
      </td>

      <td>
        <span class="status">
          ${escapeHTML(
            getContributionStatus(
              row
            )
          )}
        </span>
      </td>

    </tr>
  `;
}


function renderContributionLedger(
  rows
) {
  const container =
    firstExisting(
      "#contributionsBody",
      "#contributionTableBody",
      "#contributionsList",
      "[data-contributions-body]"
    );

  if (!container) {
    return;
  }

  if (
    !Array.isArray(rows) ||
    !rows.length
  ) {
    if (
      container.tagName ===
      "TBODY"
    ) {
      setHTML(
        container,
        `
          <tr>
            <td colspan="8">
              No contribution records found.
            </td>
          </tr>
        `
      );
    } else {
      setHTML(
        container,
        `
          <div class="empty-state">
            No contribution records found.
          </div>
        `
      );
    }

    return;
  }

  setHTML(
    container,
    rows
      .map(
        renderContributionRow
      )
      .join("")
  );
}


/* ================================================================
   CUSTOM CONTRIBUTION FORM
================================================================ */

function getCustomContributionFormValues() {
  const nameInput =
    firstExisting(
      "#customContributionName",
      "#custom_contribution_name",
      "#customName"
    );

  const amountInput =
    firstExisting(
      "#customContributionAmount",
      "#custom_contribution_amount",
      "#customAmount"
    );

  const frequencyInput =
    firstExisting(
      "#customContributionFrequency",
      "#custom_contribution_frequency",
      "#customFrequency"
    );

  const descriptionInput =
    firstExisting(
      "#customContributionDescription",
      "#custom_contribution_description",
      "#customDescription"
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
      frequencyInput?.value ||
      "monthly",

    description:
      descriptionInput?.value?.trim() ||
      ""
  };
}


function validateCustomContribution(
  values
) {
  if (!values.name) {
    return {
      ok: false,
      message:
        "Enter a contribution name."
    };
  }

  if (
    !Number.isFinite(
      values.amount
    ) ||
    values.amount <= 0
  ) {
    return {
      ok: false,
      message:
        "Enter a valid contribution amount."
    };
  }

  return {
    ok: true
  };
}


/* ================================================================
   CREATE CUSTOM CONTRIBUTION
================================================================ */

async function createCustomContribution(
  values
) {
  if (!state.group?.id) {
    throw new Error(
      "Group context is unavailable."
    );
  }

  let lastError =
    null;

  const candidates = [
    "create_custom_contribution",
    "create_group_custom_contribution",
    "create_contribution_type"
  ];

  for (
    const rpcName of candidates
  ) {
    try {
      return await callRPC(
        rpcName,
        {
          p_group_id:
            state.group.id,

          p_name:
            values.name,

          p_amount:
            values.amount,

          p_frequency:
            values.frequency,

          p_description:
            values.description ||
            null
        }
      );

    } catch (error) {
      lastError =
        error;
    }
  }

  throw (
    lastError ||
    new Error(
      "Unable to create the custom contribution."
    )
  );
}


async function submitCustomContribution(
  event
) {
  if (event) {
    event.preventDefault();
  }

  if (
    !canManageContributions()
  ) {
    notify(
      "You do not have permission to create contributions.",
      "error"
    );

    return {
      ok: false
    };
  }

  const values =
    getCustomContributionFormValues();

  const validation =
    validateCustomContribution(
      values
    );

  if (!validation.ok) {
    notify(
      validation.message,
      "error"
    );

    return validation;
  }

  try {
    await createCustomContribution(
      values
    );

    /*
     * Reload canonical definitions.
     *
     * This is what keeps the new contribution visible
     * as an active contribution and makes it available
     * in the payment selector.
     */
    await loadContributionTypes();

    const form =
      firstExisting(
        "#customContributionForm",
        "#custom-contribution-form"
      );

    if (form) {
      form.reset();
    }

    notify(
      "Custom Contribution created and activated.",
      "success"
    );

    await renderMemberContributionCards();

    return {
      ok: true
    };

  } catch (error) {
    console.error(
      "Custom contribution creation failed:",
      error
    );

    notify(
      errorMessage(
        error,
        "Unable to create the custom contribution."
      ),
      "error"
    );

    return {
      ok: false,
      error
    };
  }
}


/* ================================================================
   REFRESH ACTIVE CONTRIBUTIONS
================================================================ */

async function refreshActiveContributionTypes() {
  const result =
    await loadContributionTypes();

  await renderMemberContributionCards();

  return result;
}


/* ================================================================
   MEMBER PAYMENT EVIDENCE
================================================================ */

function getEvidenceFormValues() {
  const amountInput =
    firstExisting(
      "#memberEvidenceAmount",
      "#evidenceAmount",
      "#paymentEvidenceAmount",
      "#evidence_amount"
    );

  const dateInput =
    firstExisting(
      "#memberEvidenceDate",
      "#evidenceDate",
      "#paymentEvidenceDate",
      "#evidence_date"
    );

  const methodInput =
    firstExisting(
      "#memberEvidencePaymentMethod",
      "#evidencePaymentMethod",
      "#paymentEvidenceMethod",
      "#evidence_payment_method"
    );

  const referenceInput =
    firstExisting(
      "#memberEvidenceReference",
      "#evidenceReference",
      "#paymentEvidenceReference",
      "#evidence_reference"
    );

  const notesInput =
    firstExisting(
      "#memberEvidenceNotes",
      "#evidenceNotes",
      "#paymentEvidenceNotes",
      "#evidence_notes"
    );

  return {
    amount:
      normaliseAmount(
        amountInput?.value
      ),

    paymentDate:
      dateInput?.value ||
      null,

    paymentMethod:
      methodInput?.value ||
      null,

    reference:
      referenceInput?.value?.trim() ||
      null,

    notes:
      notesInput?.value?.trim() ||
      null
  };
}


async function submitPaymentEvidence(
  event
) {
  if (event) {
    event.preventDefault();
  }

  if (!state.member?.id) {
    notify(
      "Member information is unavailable.",
      "error"
    );

    return {
      ok: false
    };
  }

  const values =
    getEvidenceFormValues();

  if (
    !Number.isFinite(
      values.amount
    ) ||
    values.amount <= 0
  ) {
    notify(
      "Enter a valid payment amount.",
      "error"
    );

    return {
      ok: false
    };
  }

  if (!values.paymentDate) {
    notify(
      "Select the payment date.",
      "error"
    );

    return {
      ok: false
    };
  }

  try {
    const result =
      await callRPC(
        "submit_member_payment_evidence",
        {
          p_group_id:
            state.group.id,

          p_member_id:
            state.member.id,

          p_amount:
            values.amount,

          p_payment_date:
            values.paymentDate,

          p_payment_method:
            values.paymentMethod,

          p_reference:
            values.reference,

          p_notes:
            values.notes
        }
      );

    const form =
      firstExisting(
        "#memberPaymentEvidenceForm",
        "#paymentEvidenceForm",
        "#evidenceForm"
      );

    if (form) {
      form.reset();
    }

    setDefaultDates();

    notify(
      "Payment evidence submitted for verification.",
      "success"
    );

    if (
      canVerifyEvidence()
    ) {
      await loadPaymentEvidence();
    }

    return {
      ok: true,
      data: result
    };

  } catch (error) {
    console.error(
      "Payment evidence submission failed:",
      error
    );

    notify(
      errorMessage(
        error,
        "Unable to submit payment evidence."
      ),
      "error"
    );

    return {
      ok: false,
      error
    };
  }
}


/* ================================================================
   PAYMENT EVIDENCE QUEUE
================================================================ */

async function loadPaymentEvidence() {
  if (
    !state.group?.id ||
    !canVerifyEvidence()
  ) {
    state.paymentEvidence = [];

    renderPaymentEvidence(
      []
    );

    return [];
  }

  let successfulRows =
    null;

  let lastError =
    null;

  const candidates = [
    "get_member_payment_evidence",
    "get_payment_evidence",
    "get_pending_payment_evidence"
  ];

  for (
    const rpcName of candidates
  ) {
    try {
      const result =
        await callRPC(
          rpcName,
          {
            p_group_id:
              state.group.id
          }
        );

      const rows =
        extractRows(result);

      if (
        Array.isArray(rows)
      ) {
        successfulRows =
          rows;

        break;
      }

    } catch (error) {
      lastError =
        error;
    }
  }

  /*
   * Clear stale evidence when the refresh fails.
   */
  if (
    Array.isArray(
      successfulRows
    )
  ) {
    state.paymentEvidence =
      successfulRows;
  } else {
    state.paymentEvidence = [];

    console.warn(
      "Unable to load payment evidence:",
      lastError
    );
  }

  renderPaymentEvidence(
    state.paymentEvidence
  );

  return state.paymentEvidence;
}


function evidenceStatus(
  row
) {
  return String(
    row?.status ||
    row?.verification_status ||
    "pending"
  )
    .trim()
    .toLowerCase();
}


function evidenceStatusLabel(
  row
) {
  const status =
    evidenceStatus(row);

  switch (status) {
    case "verified":
    case "approved":
      return "Verified";

    case "rejected":
      return "Rejected";

    case "pending":
      return "Pending";

    default:
      return status;
  }
}


/* ================================================================
   RENDER PAYMENT EVIDENCE
================================================================ */

function renderPaymentEvidence(
  rows
) {
  const container =
    firstExisting(
      "#paymentEvidenceBody",
      "#evidenceVerificationBody",
      "#verificationQueueBody",
      "#paymentEvidenceList",
      "[data-payment-evidence]"
    );

  if (!container) {
    return;
  }

  if (
    !Array.isArray(rows) ||
    !rows.length
  ) {
    if (
      container.tagName ===
      "TBODY"
    ) {
      setHTML(
        container,
        `
          <tr>
            <td colspan="8">
              No payment evidence pending verification.
            </td>
          </tr>
        `
      );
    } else {
      setHTML(
        container,
        `
          <div class="empty-state">
            No payment evidence pending verification.
          </div>
        `
      );
    }

    return;
  }

  setHTML(
    container,
    rows
      .map(row => {
        const evidenceId =
          row?.id ??
          row?.evidence_id;

        const memberName =
          row?.member_name ||
          row?.full_name ||
          "Member";

        const amount =
          normaliseAmount(
            row?.amount
          );

        const date =
          row?.payment_date ||
          row?.evidence_date ||
          row?.created_at;

        const status =
          evidenceStatus(row);

        return `
          <tr
            data-evidence-id="${escapeHTML(
              evidenceId || ""
            )}"
          >

            <td>
              ${escapeHTML(
                memberName
              )}
            </td>

            <td>
              ${formatKES(amount)}
            </td>

            <td>
              ${escapeHTML(
                formatDate(date)
              )}
            </td>

            <td>
              ${escapeHTML(
                row?.payment_method ||
                "—"
              )}
            </td>

            <td>
              ${escapeHTML(
                row?.reference ||
                "—"
              )}
            </td>

            <td>
              <span
                class="status ${escapeHTML(
                  statusClass(status)
                )}"
              >
                ${escapeHTML(
                  evidenceStatusLabel(
                    row
                  )
                )}
              </span>
            </td>

            <td>
              ${
                status === "pending"
                  ? `
                    <button
                      type="button"
                      data-evidence-action="verify"
                      data-evidence-id="${escapeHTML(
                        evidenceId || ""
                      )}"
                    >
                      Verify
                    </button>

                    <button
                      type="button"
                      data-evidence-action="reject"
                      data-evidence-id="${escapeHTML(
                        evidenceId || ""
                      )}"
                    >
                      Reject
                    </button>
                  `
                  : "—"
              }
            </td>

          </tr>
        `;
      })
      .join("")
  );
}


/* ================================================================
   FIND EVIDENCE
================================================================ */

function findEvidence(
  evidenceId
) {
  return state.paymentEvidence.find(
    row =>
      String(
        row?.id ??
        row?.evidence_id
      ) ===
      String(evidenceId)
  );
}


/* ================================================================
   VERIFY PAYMENT EVIDENCE
================================================================ */

async function verifyPaymentEvidence(
  evidenceId
) {
  if (!canVerifyEvidence()) {
    notify(
      "You do not have permission to verify payment evidence.",
      "error"
    );

    return {
      ok: false
    };
  }

  if (!evidenceId) {
    notify(
      "Payment evidence ID is missing.",
      "error"
    );

    return {
      ok: false
    };
  }

  try {
    /*
     * Backend verification workflow.
     *
     * The frontend does not write accounting tables.
     */
    const result =
      await callRPC(
        "verify_member_payment_evidence",
        {
          p_evidence_id:
            evidenceId
        }
      );

    notify(
      "Payment evidence verified successfully.",
      "success"
    );

    await loadPaymentEvidence();

    await loadContributionLedger();

    await renderMemberContributionCards();

    return {
      ok: true,
      data: result
    };

  } catch (error) {
    console.error(
      "Payment evidence verification failed:",
      error
    );

    notify(
      errorMessage(
        error,
        "Unable to verify payment evidence."
      ),
      "error"
    );

    return {
      ok: false,
      error
    };
  }
}


/* ================================================================
   REJECT PAYMENT EVIDENCE
================================================================ */

async function rejectPaymentEvidence(
  evidenceId,
  reason = null
) {
  if (!canVerifyEvidence()) {
    notify(
      "You do not have permission to reject payment evidence.",
      "error"
    );

    return {
      ok: false
    };
  }

  if (!evidenceId) {
    notify(
      "Payment evidence ID is missing.",
      "error"
    );

    return {
      ok: false
    };
  }

  let lastError =
    null;

  const candidates = [
    "reject_member_payment_evidence",
    "reject_payment_evidence"
  ];

  for (
    const rpcName of candidates
  ) {
    try {
      const result =
        await callRPC(
          rpcName,
          {
            p_evidence_id:
              evidenceId,

            p_reason:
              reason
          }
        );

      notify(
        "Payment evidence rejected.",
        "success"
      );

      await loadPaymentEvidence();

      return {
        ok: true,
        data: result
      };

    } catch (error) {
      lastError =
        error;
    }
  }

  console.error(
    "Payment evidence rejection failed:",
    lastError
  );

  notify(
    errorMessage(
      lastError,
      "Unable to reject payment evidence."
    ),
    "error"
  );

  return {
    ok: false,
    error: lastError
  };
}


/* ================================================================
   EVIDENCE ACTION HANDLER
================================================================ */

async function handleEvidenceAction(
  event
) {
  const target =
    event.target;

  if (
    !target ||
    typeof target.closest !==
      "function"
  ) {
    return;
  }

  const button =
    target.closest(
      "[data-evidence-action]"
    );

  if (!button) {
    return;
  }

  const action =
    button.dataset.evidenceAction;

  const evidenceId =
    button.dataset.evidenceId;

  if (!evidenceId) {
    return;
  }

  const evidence =
    findEvidence(
      evidenceId
    );

  if (
    action === "verify"
  ) {
    const confirmed =
      window.confirm(
        "Verify payment of " +
        formatKES(
          evidence?.amount
        ) +
        " for " +
        (
          evidence?.member_name ||
          evidence?.full_name ||
          "this member"
        ) +
        "?"
      );

    if (!confirmed) {
      return;
    }

    await verifyPaymentEvidence(
      evidenceId
    );

    return;
  }

  if (
    action === "reject"
  ) {
    const confirmed =
      window.confirm(
        "Reject this payment evidence?"
      );

    if (!confirmed) {
      return;
    }

    const reason =
      window.prompt(
        "Optional rejection reason:"
      );

    await rejectPaymentEvidence(
      evidenceId,
      reason
        ? reason.trim()
        : null
    );
  }
}


/* ================================================================
   ACTIVE CONTRIBUTION CLICK
================================================================ */

function handleActiveContributionClick(
  event
) {
  const target =
    event.target;

  if (
    !target ||
    typeof target.closest !==
      "function"
  ) {
    return;
  }

  const card =
    target.closest(
      "[data-contribution-type-id]"
    );

  if (!card) {
    return;
  }

  const typeId =
    card.dataset.contributionTypeId;

  if (!typeId) {
    return;
  }

  state.selectedContributionTypeId =
    typeId;

  const select =
    firstExisting(
      "#contributionType",
      "#contribution_type",
      "#contributionTypeSelect",
      "#paymentContributionType"
    );

  if (select) {
    select.value =
      String(typeId);

    applyContributionTypeDefaults();

    try {
      select.dispatchEvent(
        new Event(
          "change",
          {
            bubbles: true
          }
        )
      );
    } catch (error) {
      console.warn(
        "Unable to dispatch contribution type change:",
        error
      );
    }
  }

  const form =
    firstExisting(
      "#recordContributionSection",
      "#recordContributionCard",
      "#recordContributionForm",
      "#contributionForm"
    );

  if (
    form &&
    typeof form.scrollIntoView ===
      "function"
  ) {
    form.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}


/* ================================================================
   CHANGE HANDLERS
================================================================ */

function handleContributionTypeChange(
  event
) {
  state.selectedContributionTypeId =
    event?.target?.value ||
    null;

  applyContributionTypeDefaults();
}


function handleMemberChange(
  event
) {
  state.selectedMemberId =
    event?.target?.value ||
    null;
}


/* ================================================================
   REFRESH CONTRIBUTION VIEW
================================================================ */

async function refreshContributionView() {
  /*
   * Each loader is internally failure-safe.
   * Therefore one unavailable RPC cannot white-screen
   * the page.
   */

  await loadContributionTypes();

  if (
    canManageContributions()
  ) {
    await loadMembers();
  }

  await loadContributionLedger();

  if (
    canVerifyEvidence()
  ) {
    await loadPaymentEvidence();
  }

  await renderMemberContributionCards();

  renderAfterLoad();

  return getContributionState();
}


/* ================================================================
   ROLE-BASED VISIBILITY
================================================================ */

function applyRoleVisibility() {
  const managerSelectors = [
    "#recordContributionSection",
    "#recordContributionCard",
    "#adminContributionSection",
    "#customContributionSection",
    "#customContributionCard",
    "#customContributionEditorCard",
    "[data-manager-only]"
  ];

  const verifierSelectors = [
    "#paymentEvidenceVerification",
    "#evidenceVerification",
    "#verificationQueue",
    "#verifierPaymentEvidenceCard",
    "[data-verification-only]"
  ];

  const manager =
    canManageContributions();

  const verifier =
    canVerifyEvidence();

  managerSelectors.forEach(
    selector => {
      $all(selector).forEach(
        element => {
          if (manager) {
            show(element);
          } else {
            hide(element);
          }
        }
      );
    }
  );

  verifierSelectors.forEach(
    selector => {
      $all(selector).forEach(
        element => {
          if (verifier) {
            show(element);
          } else {
            hide(element);
          }
        }
      );
    }
  );

  /*
   * Authenticated members can submit evidence.
   */
  const evidenceForms = [
    "#memberPaymentEvidenceForm",
    "#paymentEvidenceForm",
    "#evidenceForm",
    "[data-member-evidence-form]"
  ];

  evidenceForms.forEach(
    selector => {
      $all(selector).forEach(
        element =>
          show(element)
      );
    }
  );
}


/* ================================================================
   DEFAULT DATES
================================================================ */

function setDefaultDates() {
  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  const today =
    `${year}-${month}-${day}`;

  const selectors = [
    "#contributionDate",
    "#contribution_date",
    "#paymentDate",
    "#memberEvidenceDate",
    "#evidenceDate",
    "#paymentEvidenceDate",
    "#evidence_date"
  ];

  selectors.forEach(
    selector => {
      const input =
        $(selector);

      if (
        input &&
        !input.value
      ) {
        input.value =
          today;
      }
    }
  );
}


/* ================================================================
   EVENT BINDING
================================================================ */

let eventsBound =
  false;


function bindEvents() {
  if (eventsBound) {
    return;
  }

  eventsBound =
    true;

  const contributionForm =
    firstExisting(
      "#recordContributionForm",
      "#contributionForm"
    );

  if (contributionForm) {
    contributionForm.addEventListener(
      "submit",
      recordContribution
    );
  }

  const evidenceForm =
    firstExisting(
      "#memberPaymentEvidenceForm",
      "#paymentEvidenceForm",
      "#evidenceForm"
    );

  if (evidenceForm) {
    evidenceForm.addEventListener(
      "submit",
      submitPaymentEvidence
    );
  }

  const customForm =
    firstExisting(
      "#customContributionForm",
      "#custom-contribution-form"
    );

  if (customForm) {
    customForm.addEventListener(
      "submit",
      submitCustomContribution
    );
  }

  const evidenceContainer =
    firstExisting(
      "#paymentEvidenceBody",
      "#evidenceVerificationBody",
      "#verificationQueueBody",
      "#paymentEvidenceList",
      "[data-payment-evidence]"
    );

  if (evidenceContainer) {
    evidenceContainer.addEventListener(
      "click",
      handleEvidenceAction
    );
  }

  const activeContainers = [
    "#activeContributions",
    "#activeContributionTypes",
    "#customContributions",
    "#adminActiveContributions",
    "#dashboardActiveContributions",
    "#ongoingContributions",
    "[data-active-contributions]",
    "[data-admin-active-contributions]"
  ];

  activeContainers.forEach(
    selector => {
      const container =
        $(selector);

      if (container) {
        container.addEventListener(
          "click",
          handleActiveContributionClick
        );
      }
    }
  );

  const typeSelectors = [
    "#contributionType",
    "#contribution_type",
    "#contributionTypeSelect",
    "#paymentContributionType"
  ];

  typeSelectors.forEach(
    selector => {
      const element =
        $(selector);

      if (element) {
        element.addEventListener(
          "change",
          handleContributionTypeChange
        );
      }
    }
  );

  const memberSelectors = [
    "#memberSelect",
    "#member_id",
    "#contributionMember",
    "#recordContributionMember"
  ];

  memberSelectors.forEach(
    selector => {
      const element =
        $(selector);

      if (element) {
        element.addEventListener(
          "change",
          handleMemberChange
        );
      }
    }
  );

  const refreshButtons =
    $all(
      "[data-refresh-contributions], #refreshContributions"
    );

  refreshButtons.forEach(
    button => {
      button.addEventListener(
        "click",
        async event => {
          event.preventDefault();

          disable(
            button,
            true
          );

          try {
            await refreshContributionView();

            notify(
              "Contributions refreshed.",
              "success"
            );

          } catch (error) {
            /*
             * Final safety net.
             */
            console.error(
              "Contribution refresh failed:",
              error
            );

            notify(
              errorMessage(
                error,
                "Unable to refresh contributions."
              ),
              "error"
            );

          } finally {
            disable(
              button,
              false
            );
          }
        }
      );
    }
  );
}


/* ================================================================
   PAGE LOADING
================================================================ */

function setPageLoading(
  loading
) {
  state.loading =
    Boolean(loading);

  const loader =
    firstExisting(
      "#contributionsLoading",
      "#contributionLoading",
      "#pageLoading",
      "[data-contributions-loading]"
    );

  if (loader) {
    if (loading) {
      show(loader);
    } else {
      hide(loader);
    }
  }

  const page =
    firstExisting(
      "#contributionsPage",
      "[data-contributions-page]"
    );

  if (page) {
    page.dataset.loading =
      loading
        ? "true"
        : "false";
  }

  /*
   * IMPORTANT:
   * We deliberately do not hide <main> or the page
   * content while RPCs are running.
   *
   * This prevents a failed optional RPC from leaving
   * the user with a blank/white page.
   */
}


/* ================================================================
   INITIAL DATA
================================================================ */

async function loadInitialData() {
  /*
   * Context is the only critical dependency.
   *
   * If authentication/group context fails, initPage()
   * reports the failure.
   *
   * Everything after context is best-effort.
   */
  await loadContext();

  applyRoleVisibility();

  await loadContributionTypes();

  if (
    canManageContributions()
  ) {
    await loadMembers();
  }

  await loadContributionLedger();

  if (
    canVerifyEvidence()
  ) {
    await loadPaymentEvidence();
  }

  await renderMemberContributionCards();

  return getContributionState();
}


/* ================================================================
   FINAL RENDER
================================================================ */

function renderAfterLoad() {
  /*
   * Every renderer is defensive and safe to call even
   * when the corresponding HTML element is absent.
   */
  renderPaymentContributionTypes();

  renderCustomContributionSummary();

  renderContributionTypeTable();

  renderActiveContributionDashboardCards();

  renderContributionLedger(
    state.contributions
  );

  renderPaymentEvidence(
    state.paymentEvidence
  );

  applyRoleVisibility();

  setDefaultDates();
}


/* ================================================================
   INIT PAGE
================================================================ */

export async function initPage() {
  if (state.loading) {
    return {
      ok: false,
      busy: true
    };
  }

  clearNotification();

  /*
   * Set the loading flag without blanking the page.
   */
  setPageLoading(
    true
  );

  try {
    /*
     * Critical:
     * authentication/group context only.
     */
    await loadContext();

    /*
     * Render role visibility immediately.
     */
    applyRoleVisibility();

    /*
     * Bind UI before asynchronous optional loads.
     */
    bindEvents();

    /*
     * Render safe initial state.
     */
    renderAfterLoad();

    /*
     * Best-effort data loading.
     *
     * Each function handles its own errors.
     */
    await loadContributionTypes();

    if (
      canManageContributions()
    ) {
      await loadMembers();
    }

    await loadContributionLedger();

    if (
      canVerifyEvidence()
    ) {
      await loadPaymentEvidence();
    }

    await renderMemberContributionCards();

    /*
     * Manager accounting refresh.
     *
     * IMPORTANT:
     * Do NOT require data.ok === true.
     *
     * The refresh result belongs to the backend and
     * its result shape must not be used as a frontend
     * success gate.
     */
    if (
      canManageContributions()
    ) {
      try {
        await callRPC(
          "refresh_my_managed_member_accounting",
          {
            p_group_id:
              state.group.id
          }
        );

        /*
         * Refresh the display after backend refresh.
         */
        await renderMemberContributionCards();

      } catch (error) {
        /*
         * This is intentionally non-fatal.
         */
        console.warn(
          "Managed member accounting refresh unavailable:",
          error
        );
      }
    }

    /*
     * Final safe render.
     */
    renderAfterLoad();

    return {
      ok: true,
      data:
        getContributionState()
    };

  } catch (error) {
    /*
     * Only critical context failure reaches here.
     */
    console.error(
      "CHAMA LIVE Contributions initialisation failed:",
      error
    );

    notify(
      errorMessage(
        error,
        "Unable to load contributions."
      ),
      "error"
    );

    /*
     * Even on failure, render the shell/state that
     * is available instead of leaving the page blank.
     */
    try {
      bindEvents();
      renderAfterLoad();
    } catch (renderError) {
      console.error(
        "Contribution fallback render failed:",
        renderError
      );
    }

    return {
      ok: false,
      error
    };

  } finally {
    /*
     * Always release the loading state.
     */
    setPageLoading(
      false
    );
  }
}


/* ================================================================
   EXPLICIT PAGE REFRESH
================================================================ */

export async function refreshPage() {
  try {
    clearNotification();

    const data =
      await refreshContributionView();

    renderAfterLoad();

    return {
      ok: true,
      data
    };

  } catch (error) {
    console.error(
      "CHAMA LIVE Contributions refresh failed:",
      error
    );

    notify(
      errorMessage(
        error,
        "Unable to refresh contributions."
      ),
      "error"
    );

    return {
      ok: false,
      error
    };
  }
}


/* ================================================================
   STATE ACCESS
================================================================ */

export function getContributionState() {
  return {
    ...state,

    members: [
      ...state.members
    ],

    contributionTypes: [
      ...state.contributionTypes
    ],

    activeContributionTypes: [
      ...state.activeContributionTypes
    ],

    contributions: [
      ...state.contributions
    ],

    paymentEvidence: [
      ...state.paymentEvidence
    ]
  };
}


/* ================================================================
   NAMED EXPORTS
================================================================ */

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


/* ================================================================
   NO AUTO-RUN
================================================================ */

/*
   DO NOT ADD:

       initPage();

   The HTML/page loader must explicitly call initPage().
*/
