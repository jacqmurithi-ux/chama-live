/* =========================================================
   CHAMA LIVE — MEMBERS
   Pilot-ready members management
   National ID + Contribution Accounting
   ---------------------------------------------------------
   NEW MEMBER FLOW
   ---------------------------------------------------------
   Member details
      ↓
   Contribution setup
      ↓
   Optional historical contribution setup
      ↓
   create_member_with_contribution_plan()
   OR
   create_member_with_historical_contributions()
      ↓
   Initial obligations / historical payments
      ↓
   Initial contribution status

   MEMBER VIEW FLOW
   ---------------------------------------------------------
   View Member
      ↓
   get_member_contribution_position()
      ↓
   Read-only contribution position
      ↓
   Total Due / Allocated / Arrears / Credit

   HISTORICAL RECONCILIATION
   ---------------------------------------------------------
   Separate explicit action only:
   reconcile_member_historical_payments()

   IMPORTANT ACCOUNTING RULE
   ---------------------------------------------------------
   Historical payments are created through the canonical
   create_member_with_historical_contributions() backend
   transaction.

   This frontend does NOT directly insert:
   - contributions
   - contribution_allocations
   - contribution_obligations
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let groupId = null;
let members = [];
let editingMemberId = null;
let initialized = false;
let eventsBound = false;

/* Approved performance change:
   debounce member search rendering */
let memberSearchTimer = null;

let monthlyContributionType = null;
let contributionTypesLoaded = false;

/*
   READ-ONLY contribution positions used by the
   Members dashboard.

   Key:
     member.id

   Value:
     get_member_contribution_position() result

   This map is never written to Supabase.
*/
let contributionPositions = new Map();
let contributionPositionsLoaded = false;


/* =========================================================
   BASIC HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function getToday() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function getInitials(name) {
  const value =
    String(name || "").trim();

  if (!value) {
    return "M";
  }

  const parts =
    value
      .split(/\s+/)
      .filter(Boolean);

  if (
    parts.length === 1
  ) {
    return parts[0]
      .substring(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
}

function displayRole(role) {
  const value =
    String(
      role || "member"
    )
      .trim()
      .toLowerCase();

  const labels = {
    admin: "Admin",
    member: "Member",
    chairperson: "Chairperson",
    secretary: "Secretary",
    treasurer: "Treasurer"
  };

  return (
    labels[value] ||
    value.charAt(0).toUpperCase() +
      value.slice(1)
  );
}

function roleBadgeHtml(role) {
  const value =
    String(
      role || "member"
    )
      .trim()
      .toLowerCase();

  const suffix = [
    "admin",
    "chairperson",
    "secretary",
    "treasurer"
  ].includes(value)
    ? ` role-${value}`
    : " role-member";

  return `
    <span class="member-role-badge${suffix}">
      ${escapeHtml(
        displayRole(role)
      )}
    </span>
  `;
}

function accountStatusHtml(status) {
  const value =
    String(
      status || "active"
    )
      .trim()
      .toLowerCase();

  if (
    value === "active"
  ) {
    return `
      <span class="member-status-badge status-active">
        <span class="status-dot"></span>
        Active
      </span>
    `;
  }

  return `
    <span class="member-status-badge status-inactive">
      <span class="status-dot"></span>
      ${escapeHtml(
        value.charAt(0).toUpperCase() +
        value.slice(1)
      )}
    </span>
  `;
}


/* =========================================================
   LOGIN STATUS
========================================================= */

function getLoginStatus(member) {
  if (!member) {
    return "No Login";
  }

  if (
    member.activated_at
  ) {
    return "Active";
  }

  const onboarding =
    String(
      member.onboarding_status || ""
    ).toLowerCase();

  if (
    onboarding === "activated" ||
    onboarding === "active"
  ) {
    return "Active";
  }

  if (
    onboarding === "invited" ||
    member.invited_at
  ) {
    return "Invitation Sent";
  }

  if (
    member.auth_user_id ||
    member.user_id
  ) {
    return "Invitation Sent";
  }

  return "No Login";
}

function loginStatusHtml(member) {
  const status =
    getLoginStatus(member);

  if (
    status === "Active"
  ) {
    return `
      <span class="login-badge login-active">
        <span class="login-icon">✓</span>
        Active
      </span>
    `;
  }

  if (
    status === "Invitation Sent"
  ) {
    return `
      <span class="login-badge login-invited">
        <span class="login-icon">✉</span>
        Invitation Sent
      </span>
    `;
  }

  return `
    <span class="login-badge login-none">
      <span class="login-icon">○</span>
      No Login
    </span>
  `;
}


/* =========================================================
   CONTRIBUTION STATUS — MEMBERS LIST
   ---------------------------------------------------------
   Read-only display sourced from:
   get_member_contribution_position()
========================================================= */

function contributionStatusKey(position) {
  const status =
    String(
      position?.status || ""
    )
      .trim()
      .toLowerCase();

  const arrears =
    Number(
      position?.arrears || 0
    );

  const credit =
    Number(
      position?.credit || 0
    );

  if (
    status === "arrears" ||
    arrears > 0
  ) {
    return "ARREARS";
  }

  if (
    status === "credit" ||
    credit > 0
  ) {
    return "CREDIT";
  }

  if (
    status === "up_to_date"
  ) {
    return "UP_TO_DATE";
  }

  return status === "plan_not_set"
    ? "PLAN_NOT_SET"
    : "UNKNOWN";
}

function contributionStatusHtml(member) {
  const position =
    contributionPositions.get(
      String(member.id)
    );

  const key =
    contributionStatusKey(
      position
    );

  if (
    key === "ARREARS"
  ) {
    return `
      <span
        class="member-contribution-status status-arrears"
      >
        Arrears —
        ${escapeHtml(
          formatMoney(
            position?.arrears
          )
        )}
      </span>
    `;
  }

  if (
    key === "CREDIT"
  ) {
    return `
      <span
        class="member-contribution-status status-credit"
      >
        Credit —
        ${escapeHtml(
          formatMoney(
            position?.credit
          )
        )}
      </span>
    `;
  }

  if (
    key === "UP_TO_DATE"
  ) {
    return `
      <span
        class="member-contribution-status status-up-to-date"
      >
        Up to Date
      </span>
    `;
  }

  if (
    key === "PLAN_NOT_SET"
  ) {
    return `
      <span
        class="member-contribution-status status-unknown"
      >
        Plan Not Set
      </span>
    `;
  }

  return `
    <span
      class="member-contribution-status status-unknown"
    >
      Unavailable
    </span>
  `;
}

async function loadMemberContributionPositions() {
  contributionPositions.clear();
  contributionPositionsLoaded = false;

  if (
    !members.length
  ) {
    contributionPositionsLoaded = true;
    return;
  }

  const results =
    await Promise.all(
      members.map(
        async member => {
          try {
            const result =
              await supabase.rpc(
                "get_member_contribution_position",
                {
                  p_member_id:
                    member.id
                },
                {
                  get: true
                }
              );

            if (
              result.error
            ) {
              throw result.error;
            }

            const position =
              Array.isArray(
                result.data
              )
                ? result.data[0]
                : result.data;

            return [
              String(member.id),
              position || null
            ];

          } catch (error) {
            console.error(
              "CHAMA LIVE: Member contribution position error",
              member.id,
              error
            );

            return [
              String(member.id),
              null
            ];
          }
        }
      )
    );

  results.forEach(
    ([memberId, position]) => {
      contributionPositions.set(
        memberId,
        position
      );
    }
  );

  contributionPositionsLoaded = true;
}

function ensureContributionStatusHeader() {
  const headRow =
    document.querySelector(
      ".members-table thead tr"
    );

  if (!headRow) {
    return;
  }

  if (
    headRow.querySelector(
      "[data-contribution-status-header]"
    ) ||
    [...headRow.children].some(
      cell =>
        cell.textContent.trim().toLowerCase() ===
        "contribution status"
    )
  ) {
    return;
  }

  const th =
    document.createElement(
      "th"
    );

  th.dataset.contributionStatusHeader =
    "true";

  th.textContent =
    "Contribution Status";

  const loginHeader =
    [...headRow.children]
      .find(
        cell =>
          cell.textContent.trim() ===
          "Login"
      );

  if (loginHeader) {
    headRow.insertBefore(
      th,
      loginHeader
    );
  } else {
    headRow.appendChild(
      th
    );
  }
}

function ensureContributionStatusStyles() {
  if (
    byId(
      "memberContributionStatusStyles"
    )
  ) {
    return;
  }

  const style =
    document.createElement(
      "style"
    );

  style.id =
    "memberContributionStatusStyles";

  style.textContent = `
    .member-contribution-status {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.2;
      white-space: nowrap;
    }

    .member-contribution-status.status-arrears {
      background: rgba(220, 38, 38, .09);
      color: #b91c1c;
    }

    .member-contribution-status.status-credit {
      background: rgba(37, 99, 235, .09);
      color: #1d4ed8;
    }

    .member-contribution-status.status-up-to-date {
      background: rgba(22, 163, 74, .09);
      color: #15803d;
    }

    .member-contribution-status.status-unknown {
      background: rgba(100, 116, 139, .09);
      color: #64748b;
    }

    .member-card-contribution-status {
      margin-top: 8px;
    }

    .member-card-contribution-status
      .member-contribution-status {
      width: 100%;
      justify-content: center;
    }

    @media (max-width: 560px) {
      .member-contribution-status {
        white-space: normal;
      }
    }
  `;

  document.head.appendChild(
    style
  );
}


/* =========================================================
   MESSAGES
========================================================= */

function showStatus(message) {
  const node =
    byId("status");

  if (!node) {
    return;
  }

  node.textContent =
    message || "";

  node.hidden =
    !message;
}

function showError(error) {
  console.error(
    "CHAMA LIVE: Members error",
    error
  );

  const node =
    byId("error");

  if (!node) {
    return;
  }

  const message =
    typeof error === "string"
      ? error
      : error?.message ||
        String(
          error ||
          "Something went wrong."
        );

  node.innerHTML = `
    <div class="error-icon">
      !
    </div>

    <div>
      <strong>
        Something went wrong
      </strong>

      <div class="error-detail">
        ${escapeHtml(
          message
        )}
      </div>
    </div>
  `;

  node.hidden =
    false;
}

function clearError() {
  const node =
    byId("error");

  if (!node) {
    return;
  }

  node.innerHTML =
    "";

  node.hidden =
    true;
}

function showFormMessage(
  message,
  type = "success"
) {
  const node =
    byId("formMessage");

  if (!node) {
    return;
  }

  node.textContent =
    message || "";

  node.className =
    `form-message ${type}`;

  node.style.display =
    message
      ? "flex"
      : "none";
}

function clearFormMessage() {
  const node =
    byId("formMessage");

  if (!node) {
    return;
  }

  node.textContent =
    "";

  node.style.display =
    "none";
}


/* =========================================================
   MEMBER LOOKUP
========================================================= */

function findMember(memberId) {
  return members.find(
    member =>
      String(member.id) ===
      String(memberId)
  );
}


/* =========================================================
   NATIONAL ID UI
========================================================= */

function ensureNationalIdUI() {
  const form =
    byId("addMemberForm");

  const memberNumber =
    byId("memberNumber");

  if (
    form &&
    !byId("memberNationalId")
  ) {
    const field =
      document.createElement(
        "div"
      );

    field.className =
      "member-form-field";

    field.innerHTML = `
      <label
        class="form-section-label"
        for="memberNationalId"
      >
        National ID
      </label>

      <input
        id="memberNationalId"
        name="memberNationalId"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        maxlength="30"
        placeholder="National ID number"
      >

      <small class="muted member-form-hint">
        Required when adding a new member.
      </small>
    `;

    const anchor =
      memberNumber?.closest(
        ".member-form-field"
      );

    if (
      anchor?.parentElement
    ) {
      anchor.parentElement.insertBefore(
        field,
        anchor.nextElementSibling
      );
    } else {
      form
        .querySelector(
          ".member-form-grid"
        )
        ?.appendChild(
          field
        );
    }
  }

  const table =
    document.querySelector(
      ".members-table"
    );

  const headRow =
    table?.querySelector(
      "thead tr"
    );

  if (
    headRow &&
    !headRow.querySelector(
      "[data-national-id-header]"
    ) &&
    ![...headRow.children].some(
      cell =>
        cell.textContent.trim().toLowerCase() ===
        "national id"
    )
  ) {
    const th =
      document.createElement(
        "th"
      );

    th.dataset.nationalIdHeader =
      "true";

    th.textContent =
      "National ID";

    const memberHeader =
      [...headRow.children]
        .find(
          cell =>
            cell.textContent.trim() ===
            "Member No."
        );

    if (
      memberHeader?.nextElementSibling
    ) {
      headRow.insertBefore(
        th,
        memberHeader.nextElementSibling
      );
    } else {
      headRow.appendChild(
        th
      );
    }
  }

  const modalGrid =
    document.querySelector(
      ".member-detail-grid"
    );

  if (
    modalGrid &&
    !byId(
      "viewMemberNationalId"
    )
  ) {
    const detail =
      document.createElement(
        "div"
      );

    detail.className =
      "member-detail";

    detail.innerHTML = `
      <span class="member-detail-label">
        National ID
      </span>

      <span
        class="member-detail-value"
        id="viewMemberNationalId"
      >
        —
      </span>
    `;

    const first =
      modalGrid.firstElementChild;

    if (
      first?.nextElementSibling
    ) {
      modalGrid.insertBefore(
        detail,
        first.nextElementSibling
      );
    } else {
      modalGrid.appendChild(
        detail
      );
    }
  }
}


/* =========================================================
   CONTRIBUTION SETUP UI
========================================================= */

function ensureContributionUI() {
  const setup =
    byId(
      "memberContributionSetup"
    );

  if (!setup) {
    return;
  }

  const amount =
    byId(
      "memberContributionAmount"
    );

  if (amount) {
    amount.disabled =
      false;
  }

  const firstPeriod =
    byId(
      "memberFirstPeriodRule"
    );

  if (firstPeriod) {
    firstPeriod.disabled =
      false;
  }

  const effectiveFrom =
    byId(
      "memberContributionEffectiveFrom"
    );

  if (effectiveFrom) {
    effectiveFrom.disabled =
      false;
  }

  updateContributionPreview();
  updateHistoricalControls();
}


/* =========================================================
   MONEY / CONTRIBUTION SETUP
========================================================= */

function formatMoney(value) {
  const amount =
    Number(value || 0);

  return `KSh ${amount.toLocaleString(
    "en-KE",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  )}`;
}

function getContributionAmount() {
  const input =
    byId(
      "memberContributionAmount"
    );

  if (!input) {
    return 0;
  }

  const value =
    Number(
      input.value
    );

  return Number.isFinite(
    value
  )
    ? value
    : 0;
}

function getContributionEffectiveFrom() {
  const input =
    byId(
      "memberContributionEffectiveFrom"
    );

  return (
    input?.value ||
    getToday()
  );
}

function getFirstPeriodRule() {
  const input =
    byId(
      "memberFirstPeriodRule"
    );

  return (
    input?.value ||
    "full"
  );
}

function updateContributionPreview() {
  const amount =
    getContributionAmount();

  const preview =
    byId(
      "memberContributionPreview"
    );

  if (!preview) {
    return;
  }

  preview.textContent =
    amount > 0
      ? `Monthly contribution: ${formatMoney(amount)}`
      : "No monthly contribution set.";
}

function updateHistoricalControls() {
  const enabled =
    byId(
      "memberHistoricalContributions"
    );

  const section =
    byId(
      "memberHistoricalSection"
    );

  if (!enabled) {
    return;
  }

  if (section) {
    section.hidden =
      !enabled.checked;
  }
}

function getHistoricalRows() {
  const container =
    byId(
      "memberHistoricalRows"
    );

  if (!container) {
    return [];
  }

  return [
    ...container.querySelectorAll(
      "[data-historical-row]"
    )
  ];
}

function readHistoricalContributions() {
  return getHistoricalRows()
    .map(row => {
      const period =
        row.querySelector(
          "[data-history-period]"
        )?.value;

      const amount =
        Number(
          row.querySelector(
            "[data-history-amount]"
          )?.value || 0
        );

      const paymentDate =
        row.querySelector(
          "[data-history-payment-date]"
        )?.value;

      const reference =
        row.querySelector(
          "[data-history-reference]"
        )?.value?.trim();

      return {
        period,
        amount,
        payment_date:
          paymentDate ||
          null,
        reference:
          reference ||
          null
      };
    })
    .filter(
      row =>
        row.period &&
        row.amount > 0
    );
}

function addHistoricalContributionRow(
  values = {}
) {
  const container =
    byId(
      "memberHistoricalRows"
    );

  if (!container) {
    return;
  }

  const row =
    document.createElement(
      "div"
    );

  row.className =
    "historical-contribution-row";

  row.dataset.historicalRow =
    "true";

  row.innerHTML = `
    <input
      type="month"
      data-history-period
      value="${escapeHtml(
        values.period || ""
      )}"
      aria-label="Historical contribution period"
    >

    <input
      type="number"
      min="0"
      step="0.01"
      data-history-amount
      value="${escapeHtml(
        values.amount ?? ""
      )}"
      aria-label="Historical contribution amount"
      placeholder="Amount"
    >

    <input
      type="date"
      data-history-payment-date
      value="${escapeHtml(
        values.payment_date || ""
      )}"
      aria-label="Historical payment date"
    >

    <input
      type="text"
      data-history-reference
      value="${escapeHtml(
        values.reference || ""
      )}"
      aria-label="Historical payment reference"
      placeholder="Reference"
    >

    <button
      type="button"
      class="member-action remove-historical-row"
      data-action="remove-historical-row"
    >
      Remove
    </button>
  `;

  container.appendChild(
    row
  );
}

function clearHistoricalContributionRows() {
  const container =
    byId(
      "memberHistoricalRows"
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    "";
}

function validateHistoricalContributions(
  rows
) {
  if (!rows.length) {
    return {
      valid: true
    };
  }

  for (
    const row of rows
  ) {
    if (
      !row.period ||
      !/^\d{4}-\d{2}$/.test(
        row.period
      )
    ) {
      return {
        valid: false,
        message:
          "Each historical contribution must have a valid month."
      };
    }

    if (
      !Number.isFinite(
        Number(row.amount)
      ) ||
      Number(row.amount) <= 0
    ) {
      return {
        valid: false,
        message:
          "Historical contribution amounts must be greater than zero."
      };
    }
  }

  return {
    valid: true
  };
}


/* =========================================================
   CONTRIBUTION TYPE
   ---------------------------------------------------------
   Actual contribution_types schema:
     id
     group_id
     name
     created_by
     created_at
     code
========================================================= */

async function loadMonthlyContributionType() {
  if (
    contributionTypesLoaded &&
    monthlyContributionType
  ) {
    return monthlyContributionType;
  }

  if (!groupId) {
    throw new Error(
      "Group information is required before loading contribution types."
    );
  }

  const {
    data,
    error
  } = await supabase
    .from(
      "contribution_types"
    )
    .select("*")
    .eq(
      "group_id",
      groupId
    );

  if (error) {
    throw error;
  }

  const rows =
    Array.isArray(data)
      ? data
      : [];

  monthlyContributionType =
    rows.find(
      row =>
        String(
          row.name ||
          row.type_name ||
          ""
        )
          .trim()
          .toLowerCase() ===
        "monthly"
    ) ||
    rows.find(
      row =>
        String(
          row.code ||
          ""
        )
          .trim()
          .toLowerCase() ===
        "monthly"
    ) ||
    rows[0] ||
    null;

  contributionTypesLoaded =
    true;

  if (
    !monthlyContributionType
  ) {
    throw new Error(
      "The group's Monthly contribution type could not be found."
    );
  }

  return monthlyContributionType;
}


/* =========================================================
   MEMBER DATA LOADING
========================================================= */

async function loadMembers() {
  if (!groupId) {
    throw new Error(
      "Group information is required before loading members."
    );
  }

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select("*")
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
    Array.isArray(data)
      ? data
      : [];

  contributionPositions.clear();
  contributionPositionsLoaded =
    false;
}


/* =========================================================
   GROUP / USER CONTEXT
========================================================= */

async function loadContext() {
  currentUser =
    await requireAuth();

  currentMember =
    await getMyMember();

  currentGroup =
    await getMyGroup();

  groupId =
    currentMember?.group_id ||
    currentGroup?.id ||
    null;

  if (!groupId) {
    throw new Error(
      "Your account is not associated with a group."
    );
  }

  const groupName =
    currentGroup?.name ||
    currentMember?.group_name ||
    "Your Group";

  const groupNode =
    byId(
      "membersGroupName"
    );

  if (groupNode) {
    groupNode.textContent =
      groupName;
  }
}


/* =========================================================
   COUNTS
========================================================= */

function updateMemberCount() {
  const total =
    members.length;

  const active =
    members.filter(
      member =>
        String(
          member.status ||
          "active"
        )
          .trim()
          .toLowerCase() ===
        "active"
    ).length;

  const login =
    members.filter(
      member =>
        getLoginStatus(member) ===
        "Active"
    ).length;

  const noLogin =
    members.filter(
      member =>
        getLoginStatus(member) ===
        "No Login"
    ).length;

  const values = {
    memberCount: total,
    activeMembers: active,
    loginMembers: login,
    noLoginMembers: noLogin,
    membersCount: total,
    memberResultCount: total
  };

  Object.entries(
    values
  ).forEach(
    ([id, value]) => {
      const node =
        byId(id);

      if (node) {
        node.textContent =
          String(value);
      }
    }
  );
}


/* =========================================================
   MEMBER FORM
========================================================= */

function resetMemberForm() {
  editingMemberId =
    null;

  const form =
    byId(
      "addMemberForm"
    );

  form?.reset();

  const title =
    byId(
      "memberFormTitle"
    );

  if (title) {
    title.textContent =
      "Add Member";
  }

  const description =
    byId(
      "memberFormDescription"
    );

  if (description) {
    description.textContent =
      "Create a member account and contribution plan.";
  }

  const save =
    byId(
      "saveMemberButton"
    );

  if (save) {
    save.textContent =
      "Save Member";
  }

  const effectiveFrom =
    byId(
      "memberContributionEffectiveFrom"
    );

  if (effectiveFrom) {
    effectiveFrom.value =
      getToday();
  }

  clearHistoricalContributionRows();
  clearFormMessage();
  updateHistoricalControls();
  updateContributionPreview();
}

function openAddMemberPanel() {
  resetMemberForm();

  const panel =
    byId(
      "addMemberPanel"
    );

  if (panel) {
    panel.hidden =
      false;
  }

  byId(
    "memberName"
  )?.focus();
}

function closeAddMemberPanel() {
  const panel =
    byId(
      "addMemberPanel"
    );

  if (panel) {
    panel.hidden =
      true;
  }

  resetMemberForm();
}

function populateMemberForm(
  member
) {
  editingMemberId =
    member.id;

  byId(
    "memberNumber"
  ).value =
    member.member_number ||
    member.membership_number ||
    "";

  byId(
    "memberName"
  ).value =
    member.name ||
    "";

  byId(
    "memberPhone"
  ).value =
    member.phone ||
    "";

  byId(
    "memberEmail"
  ).value =
    member.email ||
    "";

  byId(
    "memberRole"
  ).value =
    member.role ||
    "member";

  byId(
    "memberStatus"
  ).value =
    member.status ||
    "active";

  const nationalId =
    byId(
      "memberNationalId"
    );

  if (nationalId) {
    nationalId.value =
      member.national_id ||
      "";
  }

  const title =
    byId(
      "memberFormTitle"
    );

  if (title) {
    title.textContent =
      "Edit Member";
  }

  const description =
    byId(
      "memberFormDescription"
    );

  if (description) {
    description.textContent =
      "Update member details. Contribution accounting remains server-controlled.";
  }

  const save =
    byId(
      "saveMemberButton"
    );

  if (save) {
    save.textContent =
      "Update Member";
  }
}

function openEditMember(
  memberId
) {
  const member =
    findMember(
      memberId
    );

  if (!member) {
    showError(
      "Member not found."
    );
    return;
  }

  resetMemberForm();
  populateMemberForm(
    member
  );

  const panel =
    byId(
      "addMemberPanel"
    );

  if (panel) {
    panel.hidden =
      false;
  }

  byId(
    "memberName"
  )?.focus();
}


/* =========================================================
   CONTRIBUTION SETUP VALIDATION
========================================================= */

function validateMemberForm() {
  const name =
    byId(
      "memberName"
    )?.value?.trim();

  if (!name) {
    return {
      valid: false,
      message:
        "Member name is required."
    };
  }

  const nationalId =
    byId(
      "memberNationalId"
    )?.value?.trim();

  if (
    !editingMemberId &&
    !nationalId
  ) {
    return {
      valid: false,
      message:
        "National ID is required when adding a new member."
    };
  }

  const amount =
    getContributionAmount();

  if (
    !editingMemberId &&
    amount < 0
  ) {
    return {
      valid: false,
      message:
        "Monthly contribution cannot be negative."
    };
  }

  const historicalEnabled =
    byId(
      "memberHistoricalContributions"
    )?.checked;

  if (
    !editingMemberId &&
    historicalEnabled
  ) {
    const historical =
      readHistoricalContributions();

    const result =
      validateHistoricalContributions(
        historical
      );

    if (!result.valid) {
      return result;
    }
  }

  return {
    valid: true
  };
}


/* =========================================================
   MEMBER CREATION — CANONICAL RPC
========================================================= */

async function createMember() {
  const validation =
    validateMemberForm();

  if (!validation.valid) {
    throw new Error(
      validation.message
    );
  }

  const name =
    byId(
      "memberName"
    )?.value?.trim();

  const memberNumber =
    byId(
      "memberNumber"
    )?.value?.trim() ||
    null;

  const phone =
    byId(
      "memberPhone"
    )?.value?.trim() ||
    null;

  const email =
    byId(
      "memberEmail"
    )?.value?.trim() ||
    null;

  const role =
    byId(
      "memberRole"
    )?.value ||
    "member";

  const status =
    byId(
      "memberStatus"
    )?.value ||
    "active";

  const nationalId =
    byId(
      "memberNationalId"
    )?.value?.trim() ||
    null;

  const amount =
    getContributionAmount();

  const effectiveFrom =
    getContributionEffectiveFrom();

  const firstPeriodRule =
    getFirstPeriodRule();

  const historicalEnabled =
    byId(
      "memberHistoricalContributions"
    )?.checked;

  const historical =
    historicalEnabled
      ? readHistoricalContributions()
      : [];

  const contributionType =
    await loadMonthlyContributionType();

  if (!contributionType?.id) {
    throw new Error(
      "Monthly contribution type is not configured for this group."
    );
  }

  if (
    historicalEnabled &&
    historical.length
  ) {
    const {
      data,
      error
    } =
      await supabase.rpc(
        "create_member_with_historical_contributions",
        {
          p_group_id:
            groupId,
          p_member_number:
            memberNumber,
          p_name:
            name,
          p_phone:
            phone,
          p_email:
            email,
          p_role:
            role,
          p_status:
            status,
          p_national_id:
            nationalId,
          p_contribution_type_id:
            contributionType.id,
          p_monthly_amount:
            amount,
          p_effective_from:
            effectiveFrom,
          p_first_period_rule:
            firstPeriodRule,
          p_historical_contributions:
            historical
        }
      );

    if (error) {
      throw error;
    }

    return data;
  }

  const {
    data,
    error
  } =
    await supabase.rpc(
      "create_member_with_contribution_plan",
      {
        p_group_id:
          groupId,
        p_member_number:
          memberNumber,
        p_name:
          name,
        p_phone:
          phone,
        p_email:
          email,
        p_role:
          role,
        p_status:
          status,
        p_national_id:
          nationalId,
        p_contribution_type_id:
          contributionType.id,
        p_monthly_amount:
          amount,
        p_effective_from:
          effectiveFrom,
        p_first_period_rule:
          firstPeriodRule
      }
    );

  if (error) {
    throw error;
  }

  return data;
}
  const modalGrid =
    document.querySelector(
      ".member-detail-grid"
    );

  if (
    modalGrid &&
    !byId(
      "viewMemberNationalId"
    )
  ) {
    const detail =
      document.createElement(
        "div"
      );

    detail.className =
      "member-detail";

    detail.innerHTML = `
      <span class="member-detail-label">
        National ID
      </span>

      <span
        class="member-detail-value"
        id="viewMemberNationalId"
      >
        —
      </span>
    `;

    const first =
      modalGrid.firstElementChild;

    if (
      first?.nextElementSibling
    ) {
      modalGrid.insertBefore(
        detail,
        first.nextElementSibling
      );
    } else {
      modalGrid.appendChild(
        detail
      );
    }
  }
}


/* =========================================================
   CONTRIBUTION SETUP UI
========================================================= */

function ensureContributionUI() {
  const form =
    byId("addMemberForm");

  const grid =
    form?.querySelector(
      ".member-form-grid"
    );

  if (
    !form ||
    !grid
  ) {
    return;
  }

  let setup =
    byId(
      "memberContributionSetup"
    );

  if (!setup) {
    setup =
      document.createElement(
        "section"
      );

    setup.id =
      "memberContributionSetup";

    setup.className =
      "member-contribution-setup";

    setup.innerHTML = `
      <div class="member-form-section-heading">
        <strong>
          Contribution Setup
        </strong>

        <span>
          Set the member's monthly contribution plan and,
          where applicable, record previous paid months.
        </span>
      </div>

      <div class="member-form-grid">

        <div class="member-form-field">

          <label
            class="form-section-label"
            for="memberJoinDate"
          >
            Join Date
          </label>

          <input
            id="memberJoinDate"
            name="memberJoinDate"
            type="date"
            required
          >

        </div>

        <div class="member-form-field">

          <label
            class="form-section-label"
            for="memberContributionAmount"
          >
            Monthly Contribution
          </label>

          <input
            id="memberContributionAmount"
            name="memberContributionAmount"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            placeholder="e.g. 500"
            required
          >

        </div>

        <div class="member-form-field">

          <label
            class="form-section-label"
            for="memberFirstPeriodRule"
          >
            First Contribution Period
          </label>

          <select
            id="memberFirstPeriodRule"
            name="memberFirstPeriodRule"
          >

            <option value="full_period">
              Full contribution period
            </option>

            <option value="next_full_period">
              Start from next full period
            </option>

          </select>

        </div>

        <div class="member-form-field">

          <label
            class="form-section-label"
            for="memberContributionEffectiveFrom"
          >
            Contribution Effective From
          </label>

          <input
            id="memberContributionEffectiveFrom"
            name="memberContributionEffectiveFrom"
            type="date"
            required
          >

          <small class="muted member-form-hint">
            The date from which the contribution plan becomes effective.
          </small>

        </div>

        <div class="member-form-field">

          <label
            class="form-section-label"
            for="memberHistoricalEnabled"
          >
            Historical Contributions
          </label>

          <select
            id="memberHistoricalEnabled"
            name="memberHistoricalEnabled"
          >

            <option value="false">
              No — start from the contribution plan
            </option>

            <option value="true">
              Yes — record previous paid months
            </option>

          </select>

        </div>

        <div
          class="member-form-field"
          id="memberHistoricalPaidThroughField"
        >

          <label
            class="form-section-label"
            for="memberHistoricalPaidThrough"
          >
            Paid Through
          </label>

          <input
            id="memberHistoricalPaidThrough"
            name="memberHistoricalPaidThrough"
            type="date"
          >

        </div>

        <div
          class="member-form-field"
          id="memberHistoricalPaymentMethodField"
        >

          <label
            class="form-section-label"
            for="memberHistoricalPaymentMethod"
          >
            Historical Payment Method
          </label>

          <select
            id="memberHistoricalPaymentMethod"
            name="memberHistoricalPaymentMethod"
          >

            <option value="Cash">
              Cash
            </option>

            <option value="M-Pesa">
              M-Pesa
            </option>

            <option value="Bank transfer">
              Bank transfer
            </option>

          </select>

        </div>

      </div>

      <div
        class="member-contribution-preview"
        id="memberContributionPreview"
      >

        <span class="preview-label">
          Contribution Preview
        </span>

        <span id="memberContributionPreviewText">
          Set the member's monthly contribution amount.
        </span>

      </div>

      <div
        class="member-contribution-preview"
        id="memberHistoricalPreview"
        hidden
      >

        <span class="preview-label">
          Historical Preview
        </span>

        <span id="memberHistoricalPreviewText">
          Select the member's historical payment period.
        </span>

      </div>
    `;

    form.insertBefore(
      setup,
      form.querySelector(
        ".member-form-actions"
      ) || null
    );
  }

  const amount =
    byId(
      "memberContributionAmount"
    );

  const firstPeriod =
    byId(
      "memberFirstPeriodRule"
    );

  const effectiveFrom =
    byId(
      "memberContributionEffectiveFrom"
    );

  if (amount) {
    amount.disabled =
      false;
  }

  if (firstPeriod) {
    firstPeriod.disabled =
      false;
  }

  if (effectiveFrom) {
    effectiveFrom.disabled =
      false;
  }

  updateContributionPreview();
  updateHistoricalControls();
}


/* =========================================================
   MONTHLY CONTRIBUTION TYPE
========================================================= */

async function loadMonthlyContributionType() {
  if (
    contributionTypesLoaded &&
    monthlyContributionType
  ) {
    return monthlyContributionType;
  }

  if (!groupId) {
    throw new Error(
      "Group information is required before loading contribution types."
    );
  }

  const {
    data,
    error
  } =
    await supabase
      .from(
        "contribution_types"
      )
      .select("*")
      .eq(
        "group_id",
        groupId
      )
      ;

  if (error) {
    throw error;
  }

  const rows =
    Array.isArray(data)
      ? data
      : [];

  monthlyContributionType =
    rows.find(
      row =>
        String(
          row.name ||
          row.type_name ||
          ""
        )
          .trim()
          .toLowerCase() ===
        "monthly"
    ) ||
    rows.find(
      row =>
        String(
          row.code ||
          ""
        )
          .trim()
          .toLowerCase() ===
        "monthly"
    ) ||
    rows[0] ||
    null;

  contributionTypesLoaded =
    true;

  if (
    !monthlyContributionType
  ) {
    throw new Error(
      "The group's Monthly contribution type could not be found."
    );
  }

  return monthlyContributionType;
}


/* =========================================================
   CONTRIBUTION PREVIEW
========================================================= */

function updateContributionPreview() {
  const amount =
    Number(
      byId(
        "memberContributionAmount"
      )?.value || 0
    );

  const preview =
    byId(
      "memberContributionPreview"
    );

  const previewText =
    byId(
      "memberContributionPreviewText"
    );

  if (
    !preview &&
    !previewText
  ) {
    return;
  }

  const message =
    amount <= 0
      ? "Set the member's monthly contribution amount."
      : `Monthly contribution: ${formatMoney(
          amount
        )}`;

  if (preview) {
    preview.textContent =
      message;
  }

  if (previewText) {
    previewText.textContent =
      message;
  }
}


/* =========================================================
   HISTORICAL CONTROLS
========================================================= */

function updateHistoricalControls() {
  const enabled =
    byId(
      "memberHistoricalEnabled"
    );

  const isEnabled =
    enabled?.value ===
    "true";

  const paidThrough =
    byId(
      "memberHistoricalPaidThrough"
    );

  const paymentMethod =
    byId(
      "memberHistoricalPaymentMethod"
    );

  const paidThroughField =
    byId(
      "memberHistoricalPaidThroughField"
    );

  const paymentMethodField =
    byId(
      "memberHistoricalPaymentMethodField"
    );

  const preview =
    byId(
      "memberHistoricalPreview"
    );

  if (paidThrough) {
    paidThrough.disabled =
      !isEnabled;
  }

  if (paymentMethod) {
    paymentMethod.disabled =
      !isEnabled;
  }

  if (paidThroughField) {
    paidThroughField.hidden =
      !isEnabled;
  }

  if (paymentMethodField) {
    paymentMethodField.hidden =
      !isEnabled;
  }

  if (preview) {
    preview.hidden =
      !isEnabled;
  }

  updateHistoricalPreview();
}


/* =========================================================
   HISTORICAL PREVIEW
========================================================= */

function updateHistoricalPreview() {
  const preview =
    byId(
      "memberHistoricalPreview"
    );

  if (!preview) {
    return;
  }

  const enabled =
    byId(
      "memberHistoricalEnabled"
    )?.value ===
    "true";

  if (!enabled) {
    preview.hidden =
      true;

    const text =
      byId(
        "memberHistoricalPreviewText"
      );

    if (text) {
      text.textContent =
        "Select the member's historical payment period.";
    }

    return;
  }

  const joinDate =
    byId(
      "memberJoinDate"
    )?.value ||
    "";

  const paidThrough =
    byId(
      "memberHistoricalPaidThrough"
    )?.value ||
    "";

  if (
    !joinDate ||
    !paidThrough
  ) {
    preview.hidden =
      false;

    preview.textContent =
      "Select the member's historical payment period.";

    const text =
      byId(
        "memberHistoricalPreviewText"
      );

    if (text) {
      text.textContent =
        preview.textContent;
    }

    return;
  }

  const start =
    new Date(
      `${joinDate}T00:00:00`
    );

  const end =
    new Date(
      `${paidThrough}T00:00:00`
    );

  if (
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    ) ||
    end < start
  ) {
    preview.hidden =
      false;

    preview.textContent =
      "Check the historical payment dates.";

    const text =
      byId(
        "memberHistoricalPreviewText"
      );

    if (text) {
      text.textContent =
        preview.textContent;
    }

    return;
  }

  let months =
    (
      end.getFullYear() -
      start.getFullYear()
    ) *
      12 +
    (
      end.getMonth() -
      start.getMonth()
    ) +
    1;

  if (
    months < 1
  ) {
    months = 1;
  }

  const amount =
    Number(
      byId(
        "memberContributionAmount"
      )?.value || 0
    );

  const total =
    months *
    amount;

  preview.hidden =
    false;

  const message =
    amount > 0
      ? `${months} historical month${
          months === 1
            ? ""
            : "s"
        } · ${formatMoney(total)}`
      : `${months} historical month${
          months === 1
            ? ""
            : "s"
        }`;

  preview.textContent =
    message;

  const text =
    byId(
      "memberHistoricalPreviewText"
    );

  if (text) {
    text.textContent =
      message;
  }
}


/* =========================================================
   CONTRIBUTION STATUS HELPERS
========================================================= */

function contributionStatusLabel(
  status
) {
  const value =
    String(
      status || ""
    ).toLowerCase();

  if (
    value ===
    "up_to_date"
  ) {
    return "UP TO DATE";
  }

  if (
    value ===
    "credit"
  ) {
    return "CREDIT";
  }

  if (
    value ===
    "arrears"
  ) {
    return "ARREARS";
  }

  if (
    value ===
    "plan_not_set"
  ) {
    return "PLAN NOT SET";
  }

  return value
    .replace(
      /_/g,
      " "
    )
    .toUpperCase();
}


function formatMoney(value) {
  const amount =
    Number(
      value || 0
    );

  return `KSh ${amount.toLocaleString(
    "en-KE",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  )}`;
}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {
  if (!groupId) {
    throw new Error(
      "Group information is required."
    );
  }

  const {
    data,
    error
  } =
    await supabase
      .from(
        "members"
      )
      .select("*")
      .eq(
        "group_id",
        groupId
      )
      .order(
        "member_number",
        {
          ascending: true
        }
      );

  if (error) {
    throw error;
  }

  members =
    Array.isArray(data)
      ? data
      : [];

  return members;
}


/* =========================================================
   CONTRIBUTION RESULT MESSAGE
========================================================= */

function contributionResultMessage(
  result
) {
  if (!result) {
    return "";
  }

  const status =
    contributionStatusLabel(
      result.status
    );

  const arrears =
    formatMoney(
      result.arrears
    );

  const credit =
    formatMoney(
      result.credit
    );

  const due =
    formatMoney(
      result.total_due ??
      result.due
    );

  const allocated =
    formatMoney(
      result.total_allocated ??
      result.allocated
    );

  const historicalCount =
    Number(
      result.historical_payment_count ||
      result.historical_count ||
      0
    );

  const details = [
    `Status: ${status}`,
    `Total due: ${due}`,
    `Allocated: ${allocated}`,
    `Arrears: ${arrears}`,
    `Credit: ${credit}`
  ];

  if (
    historicalCount > 0
  ) {
    details.push(
      `Historical payments: ${historicalCount}`
    );
  }

  return details.join(
    " · "
  );
}


/* =========================================================
   MEMBER ROW
========================================================= */

function createMemberRow(
  member
) {
  const id =
    escapeHtml(
      member.id
    );

  const memberNumber =
    escapeHtml(
      member.member_number ||
      "—"
    );

  const membershipNumber =
    escapeHtml(
      member.membership_number ||
      member.member_number ||
      "—"
    );

  const nationalId =
    escapeHtml(
      member.national_id ||
      "—"
    );

  const name =
    escapeHtml(
      member.name ||
      "—"
    );

  const phone =
    escapeHtml(
      member.phone ||
      "—"
    );

  const email =
    escapeHtml(
      member.email ||
      "—"
    );

  const loginStatus =
    getLoginStatus(
      member
    );

  const hasEmail =
    Boolean(
      String(
        member.email ||
        ""
      ).trim()
    );

  let invitationButton = `
    <button
      type="button"
      class="member-action invitation-disabled"
      disabled
      title="Add an email address first"
    >
      <span>✉</span>
      No Email
    </button>
  `;

  if (
    hasEmail &&
    loginStatus ===
      "Active"
  ) {
    invitationButton = `
      <button
        type="button"
        class="member-action invitation-disabled"
        disabled
      >
        <span>✓</span>
        Active
      </button>
    `;
  } else if (
    hasEmail &&
    loginStatus ===
      "Invitation Sent"
  ) {
    invitationButton = `
      <button
        type="button"
        class="member-action invitation-action"
        data-action="invite"
        data-member-id="${id}"
      >
        <span>↻</span>
        Resend
      </button>
    `;
  } else if (
    hasEmail
  ) {
    invitationButton = `
      <button
        type="button"
        class="member-action invitation-primary"
        data-action="invite"
        data-member-id="${id}"
      >
        <span>✉</span>
        Invite
      </button>
    `;
  }

  return `
    <tr data-member-id="${id}">

      <td>
        <span class="member-number">
          ${memberNumber}
        </span>
      </td>

      <td>
        <span class="member-contact">
          ${nationalId}
        </span>
      </td>

      <td>
        <span class="membership-number">
          ${membershipNumber}
        </span>
      </td>

      <td>
        <div class="member-table-profile">

          <div class="member-avatar">
            ${escapeHtml(
              getInitials(
                member.name
              )
            )}
          </div>

          <div class="member-table-name">

            <strong>
              ${name}
            </strong>

            <span>
              Joined
              ${escapeHtml(
                formatDate(
                  member.join_date
                )
              )}
            </span>

          </div>

        </div>
      </td>

      <td>
        <span class="member-contact">
          ${phone}
        </span>
      </td>

      <td>
        <span
          class="member-contact email-contact"
        >
          ${email}
        </span>
      </td>

      <td>
        ${roleBadgeHtml(
          member.role
        )}
      </td>

      <td>
        ${accountStatusHtml(
          member.status
        )}
      </td>

      <td>
        ${contributionStatusHtml(
          member
        )}
      </td>

      <td>
        ${loginStatusHtml(
          member
        )}
      </td>

      <td>

        <div class="member-actions">

          <button
            type="button"
            class="member-action view-action"
            data-action="view"
            data-member-id="${id}"
          >
            <span>◉</span>
            View
          </button>

          <button
            type="button"
            class="member-action edit-action"
            data-action="edit"
            data-member-id="${id}"
          >
            <span>✎</span>
            Edit
          </button>

          ${invitationButton}

        </div>

      </td>

    </tr>
  `;
}
      editingMemberId
  ) {
    query =
      query.neq(
        "id",
        editingMemberId
      );
  }

  const {
    data,
    error
  } = await query.limit(1);

  if (error) {
    throw error;
  }

  return (
    Array.isArray(data) &&
    data.length > 0
  );
}


/* =========================================================
   FIRST HISTORICAL MONTH
   ---------------------------------------------------------
   Determines the first month that can be represented by
   the historical-payment period.

   full_period:
     use effective month

   next_full_period:
     use the following month

   Always normalizes to the first day of the month.
========================================================= */

function resolveFirstHistoricalMonth(
  values
) {
  const effectiveFrom =
    values?.effectiveFrom ||
    values?.joinDate ||
    "";

  if (!effectiveFrom) {
    return "";
  }

  const date =
    new Date(
      `${effectiveFrom}T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  if (
    values?.firstPeriodRule ===
    "next_full_period"
  ) {
    date.setMonth(
      date.getMonth() + 1
    );
  }

  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    ),
    "01"
  ].join("-");
}


/* =========================================================
   CREATE MEMBER — SUBMIT FLOW
========================================================= */

async function handleCreateMember(
  event
) {
  event.preventDefault();

  clearError();
  clearFormMessage();

  const saveButton =
    byId(
      "saveMemberButton"
    );

  const originalText =
    saveButton?.textContent ||
    "Save Member";

  if (saveButton) {
    saveButton.disabled =
      true;

    saveButton.textContent =
      editingMemberId
        ? "Updating..."
        : "Saving...";
  }

  try {
    const values =
      getFormValues();

    await validateForm(
      values
    );

    if (
      !editingMemberId
    ) {
      const duplicate =
        await checkDuplicateMemberNumber(
          values.memberNumber
        );

      if (duplicate) {
        throw new Error(
          `Member number ${values.memberNumber} is already in use by another member.`
        );
      }

      await loadMonthlyContributionType();

      /*
       * The canonical backend function owns creation
       * of the member, contribution plan, obligations,
       * and historical payment accounting.
       *
       * No direct contribution inserts occur here.
       */

      const {
        data,
        error
      } =
        await supabase.rpc(
          values.historicalEnabled
            ? "create_member_with_historical_contributions"
            : "create_member_with_contribution_plan",
          values.historicalEnabled
            ? {
                p_request_id:
                  crypto.randomUUID(),
                p_group_id:
                  groupId,
                p_member_number:
                  values.memberNumber,
                p_name:
                  values.name,
                p_national_id:
                  values.nationalId,
                p_phone:
                  values.phone,
                p_email:
                  values.email ||
                  null,
                p_role:
                  values.role,
                p_status:
                  values.status,
                p_join_date:
                  values.joinDate,
                p_contribution_type_id:
                  monthlyContributionType.id,
                p_contribution_amount:
                  values.contributionAmount,
                p_first_period_rule:
                  values.firstPeriodRule,
                p_effective_from:
                  values.effectiveFrom,
                p_historical_paid_through:
                  values.historicalPaidThrough,
                p_historical_payment_method:
                  values.historicalPaymentMethod
              }
            : {
                p_request_id:
                  crypto.randomUUID(),
                p_group_id:
                  groupId,
                p_member_number:
                  values.memberNumber,
                p_name:
                  values.name,
                p_national_id:
                  values.nationalId,
                p_phone:
                  values.phone,
                p_email:
                  values.email ||
                  null,
                p_role:
                  values.role,
                p_status:
                  values.status,
                p_join_date:
                  values.joinDate,
                p_contribution_type_id:
                  monthlyContributionType.id,
                p_contribution_amount:
                  values.contributionAmount,
                p_first_period_rule:
                  values.firstPeriodRule,
                p_effective_from:
                  values.effectiveFrom
              }
        );

      if (error) {
        throw error;
      }

      console.log(
        "CHAMA LIVE: Member created",
        data
      );

      showFormMessage(
        values.historicalEnabled
          ? "Member created and historical contribution information recorded."
          : "Member created and contribution plan established.",
        "success"
      );

    } else {
      await updateExistingMember(
        values
      );

      showFormMessage(
        "Member details updated successfully.",
        "success"
      );
    }

    await loadMembers();

    await loadMemberContributionPositions();

    updateMemberCount();

    renderMembers(
      members
    );

    /*
     * Keep the panel open briefly so the user can see
     * the result, then return to the members list.
     */
    window.setTimeout(
      () => {
        closeAddMemberPanel();
      },
      600
    );

  } catch (error) {
    console.error(
      "CHAMA LIVE: Save member failed",
      error
    );

    showFormMessage(
      error?.message ||
        "Unable to save the member.",
      "error"
    );

  } finally {
    if (saveButton) {
      saveButton.disabled =
        false;

      saveButton.textContent =
        originalText;
    }
  }
}


/* =========================================================
   UPDATE EXISTING MEMBER
   ---------------------------------------------------------
   Editing member identity/details is kept separate from
   contribution accounting.

   This function does NOT rewrite contribution records.
========================================================= */

async function updateExistingMember(
  values
) {
  if (
    !editingMemberId
  ) {
    throw new Error(
      "No member selected for editing."
    );
  }

  const {
    data,
    error
  } =
    await supabase
      .from(
        "members"
      )
      .update({
        member_number:
          values.memberNumber,
        name:
          values.name,
        national_id:
          values.nationalId ||
          null,
        phone:
          values.phone ||
          null,
        email:
          values.email ||
          null,
        role:
          values.role,
        status:
          values.status
      })
      .eq(
        "id",
        editingMemberId
      )
      .eq(
        "group_id",
        groupId
      )
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}


/* =========================================================
   SEARCH
========================================================= */

function normalizeSearchValue(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}

function filterMembers(
  searchTerm
) {
  const term =
    normalizeSearchValue(
      searchTerm
    );

  if (!term) {
    return members;
  }

  return members.filter(
    member => {
      const fields = [
        member.member_number,
        member.membership_number,
        member.national_id,
        member.name,
        member.phone,
        member.email,
        member.role,
        member.status
      ];

      return fields.some(
        field =>
          normalizeSearchValue(
            field
          ).includes(term)
      );
    }
  );
}

function handleMemberSearch() {
  const input =
    byId(
      "memberSearch"
    );

  const term =
    input?.value ||
    "";

  if (
    memberSearchTimer
  ) {
    window.clearTimeout(
      memberSearchTimer
    );
  }

  memberSearchTimer =
    window.setTimeout(
      () => {
        const filtered =
          filterMembers(
            term
          );

        renderMembers(
          filtered
        );
      },
      120
    );
}

function clearMemberSearch() {
  const input =
    byId(
      "memberSearch"
    );

  if (input) {
    input.value =
      "";
  }

  renderMembers(
    members
  );
}


/* =========================================================
   MEMBER MODAL — CONTRIBUTION POSITION
   ---------------------------------------------------------
   The HTML owns this section.

   Required static elements:
     memberContributionPosition
     viewContributionStatus
     viewContributionTotal
     viewContributionDue
     viewContributionAllocated
     viewContributionArrears
     viewContributionCredit
     viewContributionDescription
========================================================= */

function ensureContributionPositionUI() {
  return byId(
    "memberContributionPosition"
  );
}

function ensureContributionPositionStyles() {
  /*
   * Intentionally empty.
   *
   * The current members.html owns the Contribution
   * Position markup and styling.
   *
   * Do NOT dynamically create another accounting panel.
   */
  return null;
}

function setContributionPositionLoading(
  loading
) {
  const status =
    byId(
      "viewContributionStatus"
    );

  const total =
    byId(
      "viewContributionTotal"
    );

  const due =
    byId(
      "viewContributionDue"
    );

  const allocated =
    byId(
      "viewContributionAllocated"
    );

  const arrears =
    byId(
      "viewContributionArrears"
    );

  const credit =
    byId(
      "viewContributionCredit"
    );

  const description =
    byId(
      "viewContributionDescription"
    );

  if (!loading) {
    return;
  }

  if (status) {
    status.textContent =
      "Loading...";
  }

  if (total) {
    total.textContent =
      "—";
  }

  if (due) {
    due.textContent =
      "—";
  }

  if (allocated) {
    allocated.textContent =
      "—";
  }

  if (arrears) {
    arrears.textContent =
      "—";
  }

  if (credit) {
    credit.textContent =
      "—";
  }

  if (description) {
    description.textContent =
      "Loading the member's contribution position...";
  }
}

function contributionPositionStatusClass(
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
    "arrears"
  ) {
    return "status-arrears";
  }

  if (
    value ===
    "credit"
  ) {
    return "status-credit";
  }

  if (
    value ===
    "up_to_date"
  ) {
    return "status-up-to-date";
  }

  return "status-unknown";
}


/* =========================================================
   LOAD MEMBER CONTRIBUTION POSITION
   ---------------------------------------------------------
   CANONICAL READ CONTRACT

   Frontend reads:
     get_member_contribution_position(
       p_member_id
     )

   No direct reads from accounting internals are required
   for the member modal.
========================================================= */

async function loadMemberContributionPosition(
  memberId
) {
  const container =
    ensureContributionPositionUI();

  if (!container) {
    return null;
  }

  ensureContributionPositionStyles();

  setContributionPositionLoading(
    true
  );

  try {
    const {
      data,
      error
    } =
      await supabase.rpc(
        "get_member_contribution_position",
        {
          p_member_id:
            memberId
        },
        {
          get: true
        }
      );

    if (error) {
      throw error;
    }

    const position =
      Array.isArray(
        data
      )
        ? data[0]
        : data;

    if (!position) {
      const status =
        byId(
          "viewContributionStatus"
        );

      const description =
        byId(
          "viewContributionDescription"
        );

      if (status) {
        status.textContent =
          "Unavailable";
      }

      if (description) {
        description.textContent =
          "No contribution position was returned for this member.";
      }

      return null;
    }

    const status =
      String(
        position.status ||
        "unknown"
      );

    const statusNode =
      byId(
        "viewContributionStatus"
      );

    if (statusNode) {
      statusNode.textContent =
        contributionStatusLabel(
          status
        );

      statusNode.className =
        `accounting-status ${contributionPositionStatusClass(
          status
        )}`;
    }

    const total =
      position.total_due ??
      position.total ??
      position.total_obligation ??
      0;

    const due =
      position.due ??
      position.total_due ??
      0;

    const allocated =
      position.allocated ??
      position.total_allocated ??
      0;

    const arrears =
      position.arrears ??
      0;

    const credit =
      position.credit ??
      0;

    const totalNode =
      byId(
        "viewContributionTotal"
      );

    const dueNode =
      byId(
        "viewContributionDue"
      );

    const allocatedNode =
      byId(
        "viewContributionAllocated"
      );

    const arrearsNode =
      byId(
        "viewContributionArrears"
      );

    const creditNode =
      byId(
        "viewContributionCredit"
      );

    if (totalNode) {
      totalNode.textContent =
        formatMoney(
          total
        );
    }

    if (dueNode) {
      dueNode.textContent =
        formatMoney(
          due
        );
    }

    if (allocatedNode) {
      allocatedNode.textContent =
        formatMoney(
          allocated
        );
    }

    if (arrearsNode) {
      arrearsNode.textContent =
        formatMoney(
          arrears
        );
    }

    if (creditNode) {
      creditNode.textContent =
        formatMoney(
          credit
        );
    }

    const description =
      byId(
        "viewContributionDescription"
      );

    if (description) {
      description.textContent =
        contributionResultMessage(
          position
        );
    }

    contributionPositions.set(
      String(memberId),
      position
    );

    return position;

  } catch (error) {
    console.error(
      "CHAMA LIVE: Contribution position load failed",
      error
    );

    const status =
      byId(
        "viewContributionStatus"
      );

    const description =
      byId(
        "viewContributionDescription"
      );

    if (status) {
      status.textContent =
        "Unavailable";

      status.className =
        "accounting-status status-unknown";
    }

    if (description) {
      description.textContent =
        error?.message ||
        "Unable to load the member's contribution position.";
    }

    return null;
  }
}


/* =========================================================
   REFRESH MEMBER CONTRIBUTION POSITION
========================================================= */

async function refreshMemberContributionPosition(
  memberId
) {
  if (!memberId) {
    return null;
  }

  return loadMemberContributionPosition(
    memberId
  );
}


/* =========================================================
   OPEN MEMBER MODAL
========================================================= */

async function openMemberModal(
  memberId
) {
  const member =
    members.find(
      item =>
        String(item.id) ===
        String(memberId)
    );

  if (!member) {
    showError(
      "Member not found."
    );

    return;
  }

  const modal =
    byId(
      "memberModal"
    );

  if (!modal) {
    showError(
      "Member details modal is not available."
    );

    return;
  }

  const initials =
    byId(
      "viewMemberInitials"
    );

  const name =
    byId(
      "viewMemberName"
    );

  const number =
    byId(
      "viewMemberNumber"
    );

  const membershipNumber =
    byId(
      "viewMembershipNumber"
    );

  const nationalId =
    byId(
      "viewMemberNationalId"
    );

  const phone =
    byId(
      "viewMemberPhone"
    );

  const email =
    byId(
      "viewMemberEmail"
    );

  const role =
    byId(
      "viewMemberRole"
    );

  const status =
    byId(
      "viewMemberStatus"
    );

  const loginStatus =
    byId(
      "viewMemberLoginStatus"
    );

  const joinDate =
    byId(
      "viewMemberJoinDate"
    );

  const group =
    byId(
      "viewMemberGroup"
    );

  if (initials) {
    initials.textContent =
      getInitials(
        member.name
      );
  }

  if (name) {
    name.textContent =
      member.name ||
      "—";
  }

  if (number) {
    number.textContent =
      member.member_number ||
      "—";
  }

  if (membershipNumber) {
    membershipNumber.textContent =
      member.membership_number ||
      member.member_number ||
      "—";
  }

  if (nationalId) {
    nationalId.textContent =
      member.national_id ||
      "—";
  }

  if (phone) {
    phone.textContent =
      member.phone ||
      "—";
  }

  if (email) {
    email.textContent =
      member.email ||
      "—";
  }

  if (role) {
    role.textContent =
      displayRole(
        member.role
      );
  }

  if (status) {
    status.textContent =
      String(
        member.status ||
        "active"
      )
        .charAt(0)
        .toUpperCase() +
      String(
        member.status ||
        "active"
      ).slice(1);
  }

  if (loginStatus) {
    loginStatus.textContent =
      getLoginStatus(
        member
      );
  }

  if (joinDate) {
    joinDate.textContent =
      formatDate(
        member.join_date
      );
  }

  if (group) {
    group.textContent =
      currentGroup?.name ||
      "—";
  }

  const reconcileButton =
    byId(
      "reconcileHistoricalPayments"
    );

  if (reconcileButton) {
    reconcileButton.dataset.memberId =
      String(
        member.id
      );

    reconcileButton.dataset.action =
      "reconcile";
  }

  modal.hidden =
    false;

  modal.style.display =
    "flex";

  modal.classList.add(
    "open"
  );

  document.body.classList.add(
    "modal-open"
  );

  setContributionPositionLoading(
    true
  );

  await loadMemberContributionPosition(
    member.id
  );

  byId(
    "closeMemberModal"
  )?.focus();
}
      if (amount) {
    amount.disabled =
      true;
  }

  const firstPeriod =
    byId(
      "memberFirstPeriodRule"
    );

  if (firstPeriod) {
    firstPeriod.disabled =
      true;
  }

  const effectiveFrom =
    byId(
      "memberContributionEffectiveFrom"
    );

  if (effectiveFrom) {
    effectiveFrom.disabled =
      true;
  }

  const historicalEnabled =
    byId(
      "memberHistoricalEnabled"
    );

  if (historicalEnabled) {
    historicalEnabled.value =
      "false";

    historicalEnabled.disabled =
      true;
  }

  updateHistoricalControls();

  clearFormMessage();

  byId(
    "memberNumber"
  )?.focus();

  panel?.scrollIntoView({
    behavior:
      "smooth",
    block:
      "start"
  });
}


/* =========================================================
   MEMBER CONTRIBUTION POSITION UI
   ---------------------------------------------------------
   The current members.html owns the static Contribution
   Position DOM. members.js only updates those elements.
========================================================= */

function ensureContributionPositionUI() {
  return byId(
    "memberContributionPosition"
  );
}


function ensureContributionPositionStyles() {
  return null;
}


function setContributionPositionLoading() {
  const status =
    byId(
      "viewContributionStatus"
    );

  const total =
    byId(
      "viewContributionTotal"
    );

  const due =
    byId(
      "viewContributionDue"
    );

  const allocated =
    byId(
      "viewContributionAllocated"
    );

  const arrears =
    byId(
      "viewContributionArrears"
    );

  const credit =
    byId(
      "viewContributionCredit"
    );

  const description =
    byId(
      "viewContributionDescription"
    );

  if (status) {
    status.textContent =
      "Loading...";

    status.className =
      "status-unknown";
  }

  [
    total,
    due,
    allocated,
    arrears,
    credit
  ].forEach(
    element => {
      if (element) {
        element.textContent =
          "—";
      }
    }
  );

  if (description) {
    description.textContent =
      "Loading contribution position...";
  }
}


function contributionPositionStatusClass(
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
    "arrears"
  ) {
    return "status-arrears";
  }

  if (
    value ===
    "credit"
  ) {
    return "status-credit";
  }

  if (
    value ===
    "up_to_date"
  ) {
    return "status-up-to-date";
  }

  return "status-unknown";
}


/* =========================================================
   LOAD MEMBER CONTRIBUTION POSITION
   ---------------------------------------------------------
   CANONICAL READ RPC:
     get_member_contribution_position
========================================================= */

async function loadMemberContributionPosition(
  memberId
) {
  if (!memberId) {
    throw new Error(
      "Member ID is required."
    );
  }

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_member_contribution_position",
      {
        p_member_id:
          memberId
      },
      {
        get: true
      }
    );

  if (error) {
    throw error;
  }

  const position =
    Array.isArray(data)
      ? data[0]
      : data;

  if (!position) {
    throw new Error(
      "No contribution position was returned for this member."
    );
  }

  const status =
    String(
      position.status ||
      ""
    )
      .trim()
      .toLowerCase();

  const due =
    Number(
      position.total_due ??
      position.due ??
      0
    );

  const allocated =
    Number(
      position.total_allocated ??
      position.allocated ??
      position.total_paid ??
      position.paid ??
      0
    );

  const totalContributed =
    Number(
      position.total_contributed ??
      position.total_paid ??
      position.paid ??
      allocated
    );

  const arrears =
    Number(
      position.arrears ??
      0
    );

  const credit =
    Number(
      position.credit ??
      0
    );

  const statusElement =
    byId(
      "viewContributionStatus"
    );

  const totalElement =
    byId(
      "viewContributionTotal"
    );

  const dueElement =
    byId(
      "viewContributionDue"
    );

  const allocatedElement =
    byId(
      "viewContributionAllocated"
    );

  const arrearsElement =
    byId(
      "viewContributionArrears"
    );

  const creditElement =
    byId(
      "viewContributionCredit"
    );

  const description =
    byId(
      "viewContributionDescription"
    );

  if (statusElement) {
    statusElement.textContent =
      contributionStatusLabel(
        status
      );

    statusElement.className =
      contributionPositionStatusClass(
        status
      );
  }

  if (totalElement) {
    totalElement.textContent =
      formatMoney(
        totalContributed
      );
  }

  if (dueElement) {
    dueElement.textContent =
      formatMoney(
        due
      );
  }

  if (allocatedElement) {
    allocatedElement.textContent =
      formatMoney(
        allocated
      );
  }

  if (arrearsElement) {
    arrearsElement.textContent =
      formatMoney(
        arrears
      );
  }

  if (creditElement) {
    creditElement.textContent =
      formatMoney(
        credit
      );
  }

  if (description) {

    if (
      status ===
      "arrears"
    ) {
      description.textContent =
        `Member has paid ${formatMoney(
          allocated
        )} against ${formatMoney(
          due
        )} due, leaving ${formatMoney(
          arrears
        )} in arrears.`;

    } else if (
      status ===
      "credit"
    ) {
      description.textContent =
        `Member has contributed ${formatMoney(
          totalContributed
        )} and currently has ${formatMoney(
          credit
        )} in credit.`;

    } else if (
      status ===
      "up_to_date"
    ) {
      description.textContent =
        `Member has contributed ${formatMoney(
          totalContributed
        )} against ${formatMoney(
          due
        )} due and is up to date.`;

    } else if (
      status ===
      "plan_not_set"
    ) {
      description.textContent =
        "No contribution plan has been established for this member.";

    } else {
      description.textContent =
        `Contribution position: ${contributionStatusLabel(
          status
        )}.`;
    }
  }

  contributionPositions.set(
    String(
      memberId
    ),
    position
  );

  return position;
}


async function refreshMemberContributionPosition(
  memberId
) {
  if (!memberId) {
    return null;
  }

  return loadMemberContributionPosition(
    memberId
  );
}


/* =========================================================
   OPEN MEMBER MODAL
========================================================= */

async function openMemberModal(
  memberId
) {
  ensureNationalIdUI();

  ensureContributionPositionUI();

  const member =
    findMember(
      memberId
    );

  if (!member) {
    showError(
      "Member could not be found."
    );

    return;
  }

  const modal =
    byId(
      "memberModal"
    );

  if (!modal) {
    return;
  }

  const setText =
    (
      id,
      value
    ) => {
      const element =
        byId(id);

      if (element) {
        element.textContent =
          value ||
          "—";
      }
    };

  setText(
    "viewMemberInitials",
    getInitials(
      member.name
    )
  );

  setText(
    "viewMemberName",
    member.name ||
      "—"
  );

  setText(
    "viewMemberNumber",
    member.member_number ||
      "—"
  );

  setText(
    "viewMembershipNumber",
    member.membership_number ||
      member.member_number ||
      "—"
  );

  setText(
    "viewMemberNationalId",
    member.national_id ||
      "—"
  );

  setText(
    "viewMemberPhone",
    member.phone ||
      "—"
  );

  setText(
    "viewMemberEmail",
    member.email ||
      "—"
  );

  setText(
    "viewMemberRole",
    displayRole(
      member.role
    )
  );

  setText(
    "viewMemberStatus",
    member.status ||
      "—"
  );

  setText(
    "viewMemberLoginStatus",
    getLoginStatus(
      member
    )
  );

  setText(
    "viewMemberJoinDate",
    formatDate(
      member.join_date
    )
  );

  setText(
    "viewMemberGroup",
    currentGroup?.name ||
      currentGroup?.group_name ||
      "—"
  );

  const reconcileButton =
    byId(
      "reconcileHistoricalPayments"
    );

  if (reconcileButton) {
    reconcileButton.dataset.memberId =
      String(
        member.id
      );

    reconcileButton.dataset.action =
      "reconcile";
  }

  modal.hidden =
    false;

  modal.style.display =
    "flex";

  document.body.classList.add(
    "modal-open"
  );

  setContributionPositionLoading();

  try {
    await loadMemberContributionPosition(
      member.id
    );

  } catch (error) {
    console.error(
      "CHAMA LIVE: Member contribution position unavailable",
      error
    );

    const status =
      byId(
        "viewContributionStatus"
      );

    const description =
      byId(
        "viewContributionDescription"
      );

    if (status) {
      status.textContent =
        "Unavailable";

      status.className =
        "status-unknown";
    }

    if (description) {
      description.textContent =
        error?.message ||
        "Contribution position could not be loaded.";
    }
  }

  byId(
    "closeMemberModal"
  )?.focus();
}


/* =========================================================
   MEMBER SEARCH
========================================================= */

function filterMembers(
  searchTerm
) {
  const term =
    String(
      searchTerm ||
      ""
    )
      .trim()
      .toLowerCase();

  if (!term) {
    return members;
  }

  return members.filter(
    member => {
      const values = [
        member.member_number,
        member.membership_number,
        member.national_id,
        member.name,
        member.phone,
        member.email,
        member.role,
        member.status,
        member.onboarding_status
      ];

      return values.some(
        value =>
          String(
            value ||
            ""
          )
            .toLowerCase()
            .includes(
              term
            )
      );
    }
  );
}


/* =========================================================
   MEMBER ACTION HANDLER
========================================================= */

async function handleMemberAction(
  event
) {
  const button =
    event.target.closest(
      "[data-action]"
    );

  if (!button) {
    return;
  }

  const action =
    button.dataset.action;

  const memberId =
    button.dataset.memberId;

  if (!action) {
    return;
  }

  try {

    if (
      action ===
      "view"
    ) {
      await openMemberModal(
        memberId
      );

      return;
    }

    if (
      action ===
      "edit"
    ) {
      await openEditMember(
        memberId
      );

      return;
    }

    if (
      action ===
      "invite"
    ) {
      button.disabled =
        true;

      await sendMemberInvitation(
        memberId,
        false
      );

      return;
    }

    if (
      action ===
      "reconcile"
    ) {
      await handleHistoricalReconciliation(
        memberId
      );

      return;
    }

    if (
      action ===
      "close"
    ) {
      closeMemberModal();

      return;
    }

  } catch (error) {

    console.error(
      "CHAMA LIVE: Member action error",
      error
    );

    showError(
      error
    );

  } finally {

    if (
      action ===
      "invite"
    ) {
      button.disabled =
        false;
    }
  }
}


/* =========================================================
   CLOSE MEMBER MODAL
========================================================= */

function closeMemberModal() {
  const modal =
    byId(
      "memberModal"
    );

  if (!modal) {
    return;
  }

  modal.hidden =
    true;

  modal.style.display =
    "none";

  modal.classList.remove(
    "open"
  );

  document.body.classList.remove(
    "modal-open"
  );
}


/* =========================================================
   BIND EVENTS
========================================================= */

function bindEvents() {

  const addButton =
    byId(
      "addMemberButton"
    ) ||
    byId(
      "addMember"
    );

  addButton?.addEventListener(
    "click",
    () =>
      openAddMember()
  );

  const closeAddButton =
    byId(
      "closeAddMember"
    );

  closeAddButton?.addEventListener(
    "click",
    closeAddMember
  );

  const cancelAddButton =
    byId(
      "cancelAddMember"
    );

  cancelAddButton?.addEventListener(
    "click",
    closeAddMember
  );

  const form =
    byId(
      "addMemberForm"
    );

  form?.addEventListener(
    "submit",
    saveMember
  );

  const search =
    byId(
      "memberSearch"
    );

  search?.addEventListener(
    "input",
    event => {

      clearTimeout(
        memberSearchTimer
      );

      memberSearchTimer =
        setTimeout(
          () => {

            const filtered =
              filterMembers(
                event.target.value
              );

            renderMembers(
              filtered
            );

          },
          150
        );
    }
  );

  const clearSearch =
    byId(
      "clearMemberSearch"
    );

  clearSearch?.addEventListener(
    "click",
    () => {

      if (search) {
        search.value =
          "";
      }

      renderMembers(
        members
      );
    }
  );

  const rows =
    byId(
      "memberRows"
    );

  rows?.addEventListener(
    "click",
    handleMemberAction
  );

  const cards =
    byId(
      "memberCards"
    );

  cards?.addEventListener(
    "click",
    handleMemberAction
  );

  const modal =
    byId(
      "memberModal"
    );

  modal?.addEventListener(
    "click",
    event => {

      if (
        event.target ===
        modal
      ) {
        closeMemberModal();

        return;
      }

      handleMemberAction(
        event
      );
    }
  );

  const modalClose =
    modal?.querySelectorAll(
      "[data-action='close'], .modal-close"
    );

  modalClose?.forEach(
    button => {
      button.addEventListener(
        "click",
        closeMemberModal
      );
    }
  );

  byId(
    "memberHistoricalEnabled"
  )?.addEventListener(
    "change",
    updateHistoricalControls
  );

  byId(
    "memberHistoricalPaidThrough"
  )?.addEventListener(
    "change",
    updateHistoricalPreview
  );

  byId(
    "memberContributionAmount"
  )?.addEventListener(
    "input",
    () => {
      updateContributionPreview();

      updateHistoricalPreview();
    }
  );

  byId(
    "memberJoinDate"
  )?.addEventListener(
    "change",
    () => {

      const effectiveFrom =
        byId(
          "memberContributionEffectiveFrom"
        );

      if (
        effectiveFrom &&
        effectiveFrom.dataset.auto ===
          "true"
      ) {
        effectiveFrom.value =
          byId(
            "memberJoinDate"
          )?.value ||
          "";

        updateHistoricalPreview();
      }
    }
  );

  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key !==
        "Escape"
      ) {
        return;
      }

      const memberModal =
        byId(
          "memberModal"
        );

      if (
        memberModal &&
        !memberModal.hidden
      ) {
        closeMemberModal();

        return;
      }

      const panel =
        byId(
          "addMemberPanel"
        );

      if (
        panel &&
        !panel.hidden
      ) {
        closeAddMember();
      }
    }
  );
}


/* =========================================================
   INIT
========================================================= */

export async function init() {

  if (initialized) {
    return;
  }

  initialized =
    true;

  try {

    clearError();

    showStatus(
      "Loading members..."
    );

    currentUser =
      await requireAuth();

    currentMember =
      await getMyMember();

    if (
      !currentMember?.group_id
    ) {
      throw new Error(
        "Your member record has no group."
      );
    }

    groupId =
      currentMember.group_id;

    currentGroup =
      await getMyGroup();

    if (!currentGroup) {
      throw new Error(
        "Group information could not be found."
      );
    }

    const groupName =
      byId(
        "membersGroupName"
      );

    if (groupName) {
      groupName.textContent =
        currentGroup.name ||
        currentGroup.group_name ||
        "Your Group";
    }

    ensureNationalIdUI();

    ensureContributionUI();

    ensureContributionStatusStyles();

    await loadMonthlyContributionType();

    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();

    bindEvents();

    showStatus("");

  } catch (error) {

    initialized =
      false;

    showStatus("");

    showError(
      error
    );
  }
}


/* =========================================================
   REFRESH MEMBERS
========================================================= */

export async function refreshMembers() {

  if (!groupId) {
    return;
  }

  try {

    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();

  } catch (error) {

    showError(
      error
    );
  }
}


/* =========================================================
   PAGE BOOT
========================================================= */

export const loadPage =
  init;


console.log(
  "CHAMA LIVE: members.js ready"
);
  byId(
    "memberJoinDate"
  )?.addEventListener(
    "change",
    () => {
      const effectiveFrom =
        byId(
          "memberContributionEffectiveFrom"
        );

      if (
        effectiveFrom &&
        effectiveFrom.dataset.auto ===
          "true"
      ) {
        effectiveFrom.value =
          byId(
            "memberJoinDate"
          )?.value ||
          "";

        updateHistoricalPreview();
      }
    }
  );

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key !==
        "Escape"
      ) {
        return;
      }

      const memberModal =
        byId(
          "memberModal"
        );

      if (
        memberModal &&
        !memberModal.hidden
      ) {
        closeMemberModal();

        return;
      }

      const panel =
        byId(
          "addMemberPanel"
        );

      if (
        panel &&
        !panel.hidden
      ) {
        closeAddMember();
      }
    }
  );
}


/* =========================================================
   INIT
========================================================= */

export async function init() {
  if (initialized) {
    return;
  }

  initialized =
    true;

  try {
    clearError();

    showStatus(
      "Loading members..."
    );

    currentUser =
      await requireAuth();

    currentMember =
      await getMyMember();

    if (
      !currentMember?.group_id
    ) {
      throw new Error(
        "Your member record has no group."
      );
    }

    groupId =
      currentMember.group_id;

    currentGroup =
      await getMyGroup();

    if (!currentGroup) {
      throw new Error(
        "Group information could not be found."
      );
    }

    const groupName =
      byId(
        "membersGroupName"
      );

    if (groupName) {
      groupName.textContent =
        currentGroup.name ||
        currentGroup.group_name ||
        "Your Group";
    }

    ensureNationalIdUI();

    ensureContributionUI();

    ensureContributionStatusStyles();

    await loadMonthlyContributionType();

    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();

    bindEvents();

    showStatus("");

  } catch (error) {
    initialized =
      false;

    showStatus("");

    showError(
      error
    );
  }
}


/* =========================================================
   REFRESH MEMBERS
========================================================= */

export async function refreshMembers() {
  if (!groupId) {
    return;
  }

  try {
    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();

  } catch (error) {
    showError(
      error
    );
  }
}


/* =========================================================
   PAGE BOOT
========================================================= */

export const loadPage =
  init;

console.log(
  "CHAMA LIVE: members.js ready"
);      
      
      
