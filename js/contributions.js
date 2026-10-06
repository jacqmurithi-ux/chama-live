/* ================================================================
   CHAMA LIVE — CONTRIBUTIONS
   CANONICAL 2B ACCOUNTING VERSION

   MEMBER PAYMENT EVIDENCE INTEGRATION
   CUSTOM CONTRIBUTION INTEGRATION
   ---------------------------------------------------------------
   ACCOUNTING BOUNDARIES
   ---------------------------------------------------------------
   • Ordinary members submit payment evidence only.
   • Evidence is inserted by the backend workflow.
   • Evidence remains pending until authorised verification.
   • Verified payments are recorded through:
       cl_2b_record_contribution()
   • Frontend NEVER directly inserts/updates:
       contributions
       contribution_allocations
       contribution_obligations
   • Custom contribution definitions are created through RPC.
   • Active contribution definitions remain visible after creation.
   • Active contribution types are available for recording payments.
   • Member status is derived from canonical accounting RPCs.
   • No automatic page execution.
   • initPage() is the page entry point.
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
  } catch {
    return null;
  }
}

function $all(selector, root = document) {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
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

function setText(elementOrSelector, value) {
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

function setHTML(elementOrSelector, value) {
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
  element.style.display = "";
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

function disable(elementOrSelector, value = true) {
  const element =
    typeof elementOrSelector === "string"
      ? $(elementOrSelector)
      : elementOrSelector;

  if (!element) {
    return;
  }

  element.disabled = Boolean(value);
}

/* ================================================================
   NOTIFICATIONS
================================================================ */

function notify(message, type = "info") {
  const containers = [
    "#contributionNotification",
    "#contributionsNotification",
    "#notification",
    "[data-contribution-notification]"
  ];

  const element =
    firstExisting(...containers);

  if (!element) {
    return;
  }

  element.textContent =
    message === null ||
    message === undefined
      ? ""
      : String(message);

  element.dataset.type = type;
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

  return `KSh ${amount.toLocaleString(
    "en-KE",
    {
      minimumFractionDigits: 0,
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

function normaliseAmount(value) {
  const amount =
    Number(value);

  return Number.isFinite(amount)
    ? amount
    : 0;
}

function escapeHTML(value) {
  return String(
    value === null ||
    value === undefined
      ? ""
      : value
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ================================================================
   ROLES
================================================================ */

function normaliseRole(role) {
  return String(
    role || ""
  )
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
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
  ].includes(
    getMemberRole()
  );
}

function canVerifyEvidence() {
  return [
    "admin",
    "administrator",
    "chairperson",
    "secretary",
    "treasurer"
  ].includes(
    getMemberRole()
  );
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

  state.user = user;

  const member =
    await getMyMember();

  if (!member) {
    throw new Error(
      "Your group membership could not be found."
    );
  }

  state.member = member;

  const group =
    await getMyGroup();

  if (!group?.id) {
    throw new Error(
      "Your group could not be found."
    );
  }

  state.group = group;

  return {
    user,
    member,
    group
  };
}

/* ================================================================
   GENERIC RPC RESULT EXTRACTION
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

  const active =
    row.is_active !== undefined
      ? Boolean(row.is_active)
      : String(
          row.status || "active"
        ).toLowerCase() === "active";

  return {
    ...row,

    id,
    name: String(name),
    amount,

    status:
      row.status ??
      (active ? "active" : "inactive"),

    is_active: active,

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
   LOAD ACTIVE CONTRIBUTION TYPES
================================================================ */

async function loadContributionTypes() {
  if (!state.group?.id) {
    throw new Error(
      "Group context is not available."
    );
  }

  let result = null;
  let rows = null;
  let lastError = null;

  /*
   * Read canonical active contribution definitions.
   *
   * These fallbacks are READ-only compatibility paths.
   * No accounting table is accessed directly.
   */

  const candidates = [
    "get_active_contribution_types",
    "get_group_contribution_types",
    "get_contribution_types"
  ];

  for (const rpcName of candidates) {
    try {
      result =
        await callRPC(
          rpcName,
          {
            p_group_id:
              state.group.id
          }
        );

      const extracted =
        extractRows(result);

      if (
        Array.isArray(extracted)
      ) {
        rows = extracted;
        break;
      }

    } catch (error) {
      lastError = error;
    }
  }

  if (!Array.isArray(rows)) {
    state.contributionTypes = [];
    state.activeContributionTypes = [];

    renderPaymentContributionTypes();
    renderCustomContributionSummary();
    renderContributionTypeTable();
    renderActiveContributionDashboardCards();

    throw (
      lastError ||
      new Error(
        "Unable to load active contribution types."
      )
    );
  }

  const normalised =
    rows
      .map(
        normaliseContributionType
      )
      .filter(Boolean);

  state.contributionTypes =
    normalised;

  state.activeContributionTypes =
    normalised.filter(
      item =>
        item.is_active !== false &&
        String(
          item.status || "active"
        ).toLowerCase() !==
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
      .map(selector => $(selector))
      .filter(Boolean);

  if (!selects.length) {
    return;
  }

  for (const select of selects) {
    const currentValue =
      select.value;

    const fragment =
      document.createDocumentFragment();

    const placeholder =
      document.createElement("option");

    placeholder.value = "";
    placeholder.textContent =
      "Select contribution type";

    fragment.appendChild(
      placeholder
    );

    for (
      const type
      of state.activeContributionTypes
    ) {
      const option =
        document.createElement("option");

      option.value =
        String(type.id);

      option.textContent =
        `${type.name} — ${formatKES(type.amount)}`;

      option.dataset.amount =
        String(type.amount);

      option.dataset.frequency =
        String(type.frequency || "");

      fragment.appendChild(
        option
      );
    }

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
  }
}

/* ================================================================
   MEMBERS
================================================================ */

function getMemberDisplayName(member) {
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
  if (!state.group?.id) {
    return [];
  }

  let result = null;
  let lastError = null;

  const candidates = [
    "get_group_members"
  ];

  for (const rpcName of candidates) {
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

      if (
        Array.isArray(rows)
      ) {
        state.members =
          rows;
        renderMemberOptions();

        return rows;
      }

    } catch (error) {
      lastError = error;
    }
  }

  state.members = [];
  renderMemberOptions();

  if (lastError) {
    throw lastError;
  }

  return [];
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
      .map(selector => $(selector))
      .filter(Boolean);

  for (const select of selects) {
    const currentValue =
      select.value;

    const fragment =
      document.createDocumentFragment();

    const placeholder =
      document.createElement("option");

    placeholder.value = "";
    placeholder.textContent =
      "Select member";

    fragment.appendChild(
      placeholder
    );

    for (
      const member
      of state.members
    ) {
      const id =
        member.id ??
        member.member_id;

      if (!id) {
        continue;
      }

      const option =
        document.createElement("option");

      option.value =
        String(id);

      option.textContent =
        getMemberDisplayName(
          member
        );

      fragment.appendChild(
        option
      );
    }

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
  }
}

/* ================================================================
   ACTIVE CONTRIBUTION SUMMARY
================================================================ */

function renderCustomContributionSummary() {
  const containers = [
    "#activeContributions",
    "#activeContributionTypes",
    "#customContributions",
    "[data-active-contributions]"
  ];

  const container =
    firstExisting(
      ...containers
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
              type.frequency || "ongoing"
            )}
          </div>

          ${
            type.description
              ? `
                <p class="contribution-card-description">
                  ${escapeHTML(type.description)}
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
              type.frequency || "—"
            )}
          </td>

          <td>
            ${escapeHTML(
              type.description || "—"
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
   ADMIN DASHBOARD ACTIVE CONTRIBUTION CARDS
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
              type.frequency || "ongoing"
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
    ) || null
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

  for (
    const selector
    of amountInputs
  ) {
    const input = $(selector);

    if (
      input &&
      (!input.value ||
       Number(input.value) === 0)
    ) {
      input.value =
        type.amount || "";
    }
  }
}

/* ================================================================
   CONTRIBUTION FORM VALUES
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

  setDefaultDates();
}

/* ================================================================
   CANONICAL CONTRIBUTION RECORDING
================================================================ */

async function recordContribution(event) {
  event?.preventDefault();

  if (!canManageContributions()) {
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
      ok: false
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
    !Number.isFinite(values.amount) ||
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

  state.submitting = true;

  const submitButtons = $all(
    "#recordContributionForm button[type='submit'], #contributionForm button[type='submit']"
  );

  submitButtons.forEach(
    button =>
      disable(button, true)
  );

  try {
    /*
     * IMPORTANT:
     * This is the only accounting write path used
     * by the frontend.
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

    await loadContributionLedger();

    if (
      state.member?.id
    ) {
      await renderMemberContributionCards();
    }

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
      error?.message ||
      "Unable to record the contribution.",
      "error"
    );

    return {
      ok: false,
      error
    };

  } finally {
    state.submitting = false;

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

  let result = null;
  let lastError = null;

  const candidates = [
    "get_member_contribution_position",
    "get_member_contribution_status"
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
            p_member_id:
              memberId,

            p_contribution_type_id:
              contributionTypeId
          }
        );

      const rows =
        extractRows(result);

      if (
        rows.length
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

      return normalisePosition(
        {}
      );

    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

function normalisePosition(row) {
  const required =
    normaliseAmount(
      row?.required ??
      row?.required_amount ??
      row?.amount_due ??
      row?.obligation_amount
    );

  const paid =
    normaliseAmount(
      row?.paid ??
      row?.paid_amount ??
      row?.total_paid ??
      row?.allocated
    );

  const allocated =
    normaliseAmount(
      row?.allocated ??
      row?.allocated_amount ??
      paid
    );

  const outstandingRaw =
    row?.outstanding ??
    row?.outstanding_amount ??
    row?.balance;

  const outstanding =
    outstandingRaw !== undefined &&
    outstandingRaw !== null
      ? normaliseAmount(
          outstandingRaw
        )
      : Math.max(
          required - allocated,
          0
        );

  const unapplied =
    normaliseAmount(
      row?.unapplied ??
      row?.unapplied_amount ??
      row?.credit
    );

  let status =
    row?.status ??
    row?.payment_status ??
    null;

  if (!status) {
    if (required <= 0) {
      status = "not_due";
    } else if (outstanding <= 0) {
      status = "paid";
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

function statusLabel(status) {
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
      return (
        status
          ? String(status)
          : "Outstanding"
      );
  }
}

function statusClass(status) {
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
    ].includes(value)
  ) {
    return "paid";
  }

  if (
    [
      "partial",
      "partially_paid"
    ].includes(value)
  ) {
    return "partial";
  }

  if (
    [
      "pending"
    ].includes(value)
  ) {
    return "pending";
  }

  if (
    [
      "rejected"
    ].includes(value)
  ) {
    return "rejected";
  }

  return "outstanding";
}

/* ================================================================
   MEMBER CONTRIBUTION STATUS
================================================================ */

function renderMemberContributionStatus(
  container,
  type,
  position
) {
  if (!container) {
    return;
  }

  const status =
    position?.status ||
    "outstanding";

  const outstanding =
    normaliseAmount(
      position?.outstanding
    );

  const allocated =
    normaliseAmount(
      position?.allocated
    );

  setHTML(
    container,
    `
      <div class="member-contribution-status">
        <div class="member-contribution-status-header">
          <strong>
            ${escapeHTML(type.name)}
          </strong>

          <span
            class="status ${escapeHTML(
              statusClass(status)
            )}"
          >
            ${escapeHTML(
              statusLabel(status)
            )}
          </span>
        </div>

        <div class="member-contribution-status-values">
          <div>
            <small>Required</small>
            <strong>
              ${formatKES(type.amount)}
            </strong>
          </div>

          <div>
            <small>Paid</small>
            <strong>
              ${formatKES(allocated)}
            </strong>
          </div>

          <div>
            <small>Outstanding</small>
            <strong>
              ${formatKES(outstanding)}
            </strong>
          </div>
        </div>
      </div>
    `
  );
}

async function loadMemberContributionStatus(
  memberId = state.member?.id
) {
  if (!memberId) {
    return [];
  }

  const positions = [];

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
      console.error(
        "Contribution status load failed:",
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

/* ================================================================
   MEMBER CONTRIBUTION CARDS
================================================================ */

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

  setHTML(
    container,
    `
      <div class="loading-state">
        Loading contribution status…
      </div>
    `
  );

  const positions =
    await loadMemberContributionStatus(
      memberId
    );

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
                    type.frequency || "ongoing"
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
================================================================ */

async function loadContributionLedger() {
  const container =
    firstExisting(
      "#contributionsBody",
      "#contributionTableBody",
      "#contributionsList",
      "[data-contributions-body]"
    );

  if (!state.group?.id) {
    state.contributions = [];

    renderContributionLedger(
      state.contributions
    );

    return [];
  }

  let successfulRows = null;
  let lastError = null;

  const rpcCandidates = [
    "get_group_contribution_ledger",
    "get_contribution_ledger",
    "get_contributions"
  ];

  for (
    const rpcName
    of rpcCandidates
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
      lastError = error;
    }
  }

  /*
   * IMPORTANT:
   * Do not retain stale ledger rows when a refresh
   * fails. A failed refresh must never make old
   * accounting data look current.
   */
  if (
    Array.isArray(successfulRows)
  ) {
    state.contributions =
      successfulRows;
  } else {
    state.contributions = [];

    if (
      container &&
      lastError
    ) {
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
  }

  renderContributionLedger(
    state.contributions
  );

  return state.contributions;
}

function getContributionMemberName(row) {
  return (
    row?.member_name ||
    row?.full_name ||
    row?.member?.full_name ||
    row?.name ||
    "Member"
  );
}

function getContributionTypeName(row) {
  return (
    row?.contribution_type_name ||
    row?.type_name ||
    row?.contribution_name ||
    row?.contribution_type ||
    row?.type?.name ||
    "Contribution"
  );
}

function getContributionStatus(row) {
  return (
    row?.status ||
    row?.payment_status ||
    row?.allocation_status ||
    "Recorded"
  );
}

function renderContributionRow(row) {
  const amount =
    normaliseAmount(
      row?.amount ??
      row?.contribution_amount
    );

  const date =
    row?.contribution_date ??
    row?.payment_date ??
    row?.date ??
    row?.created_at;

  const paymentMethod =
    row?.payment_method ??
    row?.method ??
    "—";

  const reference =
    row?.reference ??
    row?.payment_reference ??
    row?.mpesa_reference ??
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
    const isTableBody =
      container.tagName ===
      "TBODY";

    if (isTableBody) {
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

  let lastError = null;

  const candidates = [
    "create_custom_contribution",
    "create_group_custom_contribution",
    "create_contribution_type"
  ];

  for (
    const rpcName
    of candidates
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
      lastError = error;
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
  event?.preventDefault();

  if (!canManageContributions()) {
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
     * Reload the canonical contribution
     * definitions so the new contribution remains
     * visible and immediately becomes selectable.
     */
    await loadContributionTypes();

    const form =
      firstExisting(
        "#customContributionForm",
        "#custom-contribution-form"
      );

    form?.reset();

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
      error?.message ||
      "Unable to create the custom contribution.",
      "error"
    );

    return {
      ok: false,
      error
    };
  }
}

/* ================================================================
   REFRESH ACTIVE CONTRIBUTION TYPES
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
  event?.preventDefault();

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

    form?.reset();

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
      error?.message ||
      "Unable to submit payment evidence.",
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
      state.paymentEvidence
    );

    return [];
  }

  let successfulRows = null;
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
      lastError = error;
    }
  }

  if (
    Array.isArray(successfulRows)
  ) {
    state.paymentEvidence =
      successfulRows;
  } else {
    /*
     * Never leave stale evidence visible after
     * an unsuccessful refresh.
     */
    state.paymentEvidence = [];
  }

  renderPaymentEvidence(
    state.paymentEvidence
  );

  if (
    lastError &&
    !Array.isArray(successfulRows)
  ) {
    throw lastError;
  }

  return state.paymentEvidence;
}

function evidenceStatus(row) {
  return String(
    row?.status ||
    row?.verification_status ||
    "pending"
  )
    .trim()
    .toLowerCase();
}

function evidenceStatusLabel(row) {
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
    const isTableBody =
      container.tagName ===
      "TBODY";

    if (isTableBody) {
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
                row?.payment_method || "—"
              )}
            </td>

            <td>
              ${escapeHTML(
                row?.reference || "—"
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
   FIND PAYMENT EVIDENCE
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
     * Verification is a backend workflow.
     * The frontend does not insert/update
     * contributions or allocation tables.
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
      error?.message ||
      "Unable to verify payment evidence.",
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

  let lastError = null;

  const candidates = [
    "reject_member_payment_evidence",
    "reject_payment_evidence"
  ];

  for (
    const rpcName
    of candidates
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
      lastError = error;
    }
  }

  console.error(
    "Payment evidence rejection failed:",
    lastError
  );

  notify(
    lastError?.message ||
    "Unable to reject payment evidence.",
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
  const button =
    event.target.closest(
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

  if (action === "verify") {
    const confirmed =
      window.confirm(
        `Verify payment of ${formatKES(
          evidence?.amount
        )} for ${
          evidence?.member_name ||
          evidence?.full_name ||
          "this member"
        }?`
      );

    if (!confirmed) {
      return;
    }

    await verifyPaymentEvidence(
      evidenceId
    );

    return;
  }

  if (action === "reject") {
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
      reason?.trim() ||
      null
    );
  }
}

/* ================================================================
   ACTIVE CONTRIBUTION CLICK
================================================================ */

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

    select.dispatchEvent(
      new Event(
        "change",
        {
          bubbles: true
        }
      )
    );
  }

  const form =
    firstExisting(
      "#recordContributionSection",
      "#recordContributionCard",
      "#recordContributionForm",
      "#contributionForm"
    );

  form?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* ================================================================
   CHANGE HANDLERS
================================================================ */

function handleContributionTypeChange(
  event
) {
  state.selectedContributionTypeId =
    event.target.value ||
    null;

  applyContributionTypeDefaults();
}

function handleMemberChange(
  event
) {
  state.selectedMemberId =
    event.target.value ||
    null;
}

/* ================================================================
   REFRESH CONTRIBUTION VIEW
================================================================ */

async function refreshContributionView() {
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

  for (
    const selector
    of managerSelectors
  ) {
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

  for (
    const selector
    of verifierSelectors
  ) {
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

  /*
   * Ordinary member evidence submission remains
   * available to authenticated members.
   */
  const evidenceForms = [
    "#memberPaymentEvidenceForm",
    "#paymentEvidenceForm",
    "#evidenceForm",
    "[data-member-evidence-form]"
  ];

  for (
    const selector
    of evidenceForms
  ) {
    $all(selector).forEach(
      element => {
        show(element);
      }
    );
  }
}

/* ================================================================
   DEFAULT DATES
================================================================ */

function setDefaultDates() {
  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const selectors = [
    "#contributionDate",
    "#contribution_date",
    "#paymentDate",
    "#memberEvidenceDate",
    "#evidenceDate",
    "#paymentEvidenceDate",
    "#evidence_date"
  ];

  for (
    const selector
    of selectors
  ) {
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
}

/* ================================================================
   EVENT BINDING
================================================================ */

let eventsBound = false;

function bindEvents() {
  if (eventsBound) {
    return;
  }

  eventsBound = true;

  const contributionForm =
    firstExisting(
      "#recordContributionForm",
      "#contributionForm"
    );

  contributionForm?.addEventListener(
    "submit",
    recordContribution
  );

  const evidenceForm =
    firstExisting(
      "#memberPaymentEvidenceForm",
      "#paymentEvidenceForm",
      "#evidenceForm"
    );

  evidenceForm?.addEventListener(
    "submit",
    submitPaymentEvidence
  );

  const customForm =
    firstExisting(
      "#customContributionForm",
      "#custom-contribution-form"
    );

  customForm?.addEventListener(
    "submit",
    submitCustomContribution
  );

  const evidenceContainer =
    firstExisting(
      "#paymentEvidenceBody",
      "#evidenceVerificationBody",
      "#verificationQueueBody",
      "#paymentEvidenceList",
      "[data-payment-evidence]"
    );

  evidenceContainer?.addEventListener(
    "click",
    handleEvidenceAction
  );

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

  for (
    const selector
    of activeContainers
  ) {
    const container =
      $(selector);

    container?.addEventListener(
      "click",
      handleActiveContributionClick
    );
  }

  const typeSelectors = [
    "#contributionType",
    "#contribution_type",
    "#contributionTypeSelect",
    "#paymentContributionType"
  ];

  for (
    const selector
    of typeSelectors
  ) {
    $(selector)?.addEventListener(
      "change",
      handleContributionTypeChange
    );
  }

  const memberSelectors = [
    "#memberSelect",
    "#member_id",
    "#contributionMember",
    "#recordContributionMember"
  ];

  for (
    const selector
    of memberSelectors
  ) {
    $(selector)?.addEventListener(
      "change",
      handleMemberChange
    );
  }

  const refreshButtons = $all(
    "[data-refresh-contributions], #refreshContributions"
  );

  refreshButtons.forEach(
    button => {
      button.addEventListener(
        "click",
        async event => {
          event.preventDefault();

          try {
            await refreshContributionView();

            notify(
              "Contributions refreshed.",
              "success"
            );

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
          }
        }
      );
    }
  );
}

/* ================================================================
   PAGE LOADING STATE
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
      "main",
      "[data-contributions-page]"
    );

  if (page) {
    page.dataset.loading =
      loading
        ? "true"
        : "false";
  }
}

/* ================================================================
   INITIAL DATA LOAD
================================================================ */

async function loadInitialData() {
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
   PAGE INITIALISATION
================================================================ */

export async function initPage() {
  if (state.loading) {
    return {
      ok: false,
      busy: true
    };
  }

  clearNotification();
  setPageLoading(true);

  try {
    const data =
      await loadInitialData();

    bindEvents();
    renderAfterLoad();

    /*
     * Manager accounting refresh:
     *
     * The refresh RPC is allowed to return its own
     * canonical result shape. The frontend must NOT
     * require data.ok === true.
     *
     * Its purpose here is to refresh backend-managed
     * member accounting before the display is refreshed.
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

        await renderMemberContributionCards();

      } catch (error) {
        /*
         * Do not make an otherwise usable page fail
         * solely because this optional refresh could
         * not execute.
         */
        console.warn(
          "Managed member accounting refresh unavailable:",
          error
        );
      }
    }

    return {
      ok: true,
      data
    };

  } catch (error) {
    console.error(
      "CHAMA LIVE Contributions initialisation failed:",
      error
    );

    notify(
      error?.message ||
      "Unable to load contributions.",
      "error"
    );

    return {
      ok: false,
      error
    };

  } finally {
    setPageLoading(false);
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
      error?.message ||
      "Unable to refresh contributions.",
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
   ---------------------------------------------------------------
   The page loader must call:

       import("./js/contributions.js")
         .then(module => module.initPage())

   Do NOT add:

       initPage();

   here.
================================================================ */
