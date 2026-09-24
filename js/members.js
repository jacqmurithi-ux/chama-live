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
  } = await supabase
    .from(
      "contribution_types"
    )
    .select("*")
    .eq(
      "group_id",
      groupId
    )
    .eq(
      "is_active",
      true
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

  if (!preview) {
    return;
  }

  if (
    amount <= 0
  ) {
    preview.textContent =
      "Set the member's monthly contribution amount.";
    return;
  }

  preview.textContent =
    `Monthly contribution: ${formatMoney(
      amount
    )}`;
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

    return;
  }

  let months =
    (end.getFullYear() -
      start.getFullYear()) *
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

  preview.textContent =
    amount > 0
      ? `${months} historical month${months === 1 ? "" : "s"} · ${formatMoney(total)}`
      : `${months} historical month${months === 1 ? "" : "s"}`;
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
    value === "credit"
  ) {
    return "CREDIT";
  }

  if (
    value === "arrears"
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
  } = await supabase
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


/* =========================================================
   MEMBER CARD
========================================================= */

function createMemberCard(
  member
) {
  const id =
    escapeHtml(
      member.id
    );

  const name =
    escapeHtml(
      member.name ||
      "—"
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
    <article
      class="member-card"
      data-member-id="${id}"
    >

      <div class="member-card-top">

        <div class="member-card-profile">

          <div class="member-card-avatar">
            ${escapeHtml(
              getInitials(
                member.name
              )
            )}
          </div>

          <div class="member-card-name">

            <h3>
              ${name}
            </h3>

            <span>
              Member No.
              ${memberNumber}
            </span>

          </div>

        </div>

        ${accountStatusHtml(
          member.status
        )}

      </div>

      <div class="member-card-badges">

        ${roleBadgeHtml(
          member.role
        )}

        ${loginStatusHtml(
          member
        )}

      </div>

      <div class="member-card-info">

        <div>
          <span>
            Membership No.
          </span>

          <strong>
            ${membershipNumber}
          </strong>
        </div>

        <div>
          <span>
            National ID
          </span>

          <strong>
            ${nationalId}
          </strong>
        </div>

        <div>
          <span>
            Phone
          </span>

          <strong>
            ${phone}
          </strong>
        </div>

        <div>
          <span>
            Email
          </span>

          <strong>
            ${email}
          </strong>
        </div>

        <div>
          <span>
            Joined
          </span>

          <strong>
            ${escapeHtml(
              formatDate(
                member.join_date
              )
            )}
          </strong>
        </div>

      </div>

      <div class="member-card-contribution-status">
        ${contributionStatusHtml(
          member
        )}
      </div>

      <div class="member-card-actions">

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

    </article>
  `;
}
/* =========================================================
   RENDER MEMBERS
========================================================= */

function renderMembers(
  list = members
) {
  ensureNationalIdUI();
  ensureContributionStatusHeader();

  const tbody =
    byId("memberRows");

  const cards =
    byId("memberCards");

  const rows =
    Array.isArray(list)
      ? list
      : [];

  if (tbody) {
    tbody.innerHTML =
      rows.length
        ? rows
            .map(
              createMemberRow
            )
            .join("")
        : `
          <tr>
            <td
              colspan="11"
              class="empty-table-cell"
            >
              <div class="empty-state">

                <div class="empty-state-icon">
                  ♙
                </div>

                <h3>
                  No members found
                </h3>

                <p>
                  Add your first group
                  member to get started.
                </p>

              </div>
            </td>
          </tr>
        `;
  }

  if (cards) {
    cards.innerHTML =
      rows.length
        ? rows
            .map(
              createMemberCard
            )
            .join("")
        : `
          <div class="empty-state mobile-empty">

            <div class="empty-state-icon">
              ♙
            </div>

            <h3>
              No members found
            </h3>

            <p>
              Add your first group
              member to get started.
            </p>

          </div>
        `;
  }

  const count =
    byId(
      "memberResultCount"
    );

  if (count) {
    count.textContent =
      rows.length ===
      members.length
        ? `${rows.length} members`
        : `${rows.length} of ${members.length} members`;
  }
}


/* =========================================================
   MEMBER COUNTS
========================================================= */

function updateMemberCount() {
  const total =
    members.length;

  const active =
    members.filter(
      member =>
        String(
          member.status ||
          ""
        ).toLowerCase() ===
        "active"
    ).length;

  const loginActive =
    members.filter(
      member =>
        getLoginStatus(
          member
        ) === "Active"
    ).length;

  const invitations =
    members.filter(
      member =>
        getLoginStatus(
          member
        ) ===
        "Invitation Sent"
    ).length;

  const noLogin =
    members.filter(
      member =>
        getLoginStatus(
          member
        ) ===
        "No Login"
    ).length;

  const totalElement =
    byId(
      "memberCount"
    );

  const membersElement =
    byId(
      "membersCount"
    );

  const activeElement =
    byId(
      "activeMembers"
    );

  const inactiveElement =
    byId(
      "inactiveMembers"
    );

  const loginElement =
    byId(
      "loginMembers"
    );

  const invitedElement =
    byId(
      "invitedMembers"
    );

  const noLoginElement =
    byId(
      "noLoginMembers"
    );

  if (totalElement) {
    totalElement.textContent =
      total;
  }

  if (membersElement) {
    membersElement.textContent =
      total;
  }

  if (activeElement) {
    activeElement.textContent =
      active;
  }

  if (inactiveElement) {
    inactiveElement.textContent =
      total - active;
  }

  if (loginElement) {
    loginElement.textContent =
      loginActive;
  }

  if (invitedElement) {
    invitedElement.textContent =
      invitations;
  }

  if (noLoginElement) {
    noLoginElement.textContent =
      noLogin;
  }
}


/* =========================================================
   OPEN ADD MEMBER
========================================================= */

async function openAddMember() {
  editingMemberId = null;

  const panel =
    byId(
      "addMemberPanel"
    );

  const title =
    byId(
      "memberFormTitle"
    );

  const description =
    byId(
      "memberFormDescription"
    );

  const form =
    byId(
      "addMemberForm"
    );

  if (panel) {
    panel.hidden = false;
  }

  if (title) {
    title.textContent =
      "Add Member";
  }

  if (description) {
    description.textContent =
      "Register a new member, set their contribution plan, and optionally record historical payments.";
  }

  if (form) {
    form.reset();
  }

  ensureNationalIdUI();
  ensureContributionUI();

  const today =
    getToday();

  const joinDate =
    byId(
      "memberJoinDate"
    );

  const effectiveFrom =
    byId(
      "memberContributionEffectiveFrom"
    );

  if (joinDate) {
    joinDate.value =
      today;
  }

  if (effectiveFrom) {
    effectiveFrom.value =
      today;

    effectiveFrom.dataset.auto =
      "true";

    effectiveFrom.disabled =
      false;
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

  const historicalEnabled =
    byId(
      "memberHistoricalEnabled"
    );

  if (historicalEnabled) {
    historicalEnabled.value =
      "false";

    historicalEnabled.disabled =
      false;
  }

  const historicalPaidThrough =
    byId(
      "memberHistoricalPaidThrough"
    );

  if (historicalPaidThrough) {
    historicalPaidThrough.value =
      "";

    historicalPaidThrough.disabled =
      true;
  }

  const historicalPaymentMethod =
    byId(
      "memberHistoricalPaymentMethod"
    );

  if (historicalPaymentMethod) {
    historicalPaymentMethod.value =
      "Cash";

    historicalPaymentMethod.disabled =
      true;
  }

  updateHistoricalControls();

  const setup =
    byId(
      "memberContributionSetup"
    );

  if (setup) {
    setup.style.opacity =
      "1";
  }

  clearFormMessage();

  try {
    await loadMonthlyContributionType();

    const groupMonthly =
      Number(
        currentGroup?.monthly_contribution ||
        0
      );

    if (
      amount &&
      !amount.value &&
      groupMonthly > 0
    ) {
      amount.value =
        groupMonthly;
    }

    updateContributionPreview();
    updateHistoricalPreview();

  } catch (error) {
    showFormMessage(
      error?.message ||
        "Could not load the group's Monthly contribution type.",
      "error"
    );
  }

  byId(
    "memberNumber"
  )?.focus();

  panel?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}
/* =========================================================
   FORM VALUES
========================================================= */

function getFormValues() {
  const value = id =>
    byId(id)?.value?.trim() ||
    "";

  const amountRaw =
    value(
      "memberContributionAmount"
    );

  return {
    memberNumber:
      value(
        "memberNumber"
      ),

    name:
      value(
        "memberName"
      ),

    nationalId:
      value(
        "memberNationalId"
      ),

    phone:
      value(
        "memberPhone"
      ),

    email:
      String(
        byId(
          "memberEmail"
        )?.value ||
        ""
      )
        .trim()
        .toLowerCase(),

    role:
      byId(
        "memberRole"
      )?.value ||
      "member",

    status:
      byId(
        "memberStatus"
      )?.value ||
      "active",

    joinDate:
      value(
        "memberJoinDate"
      ) ||
      getToday(),

    contributionAmount:
      amountRaw
        ? Number(
            amountRaw
          )
        : 0,

    firstPeriodRule:
      byId(
        "memberFirstPeriodRule"
      )?.value ||
      "full_period",

    effectiveFrom:
      value(
        "memberContributionEffectiveFrom"
      ),

    historicalEnabled:
      byId(
        "memberHistoricalEnabled"
      )?.value ===
      "true",

    historicalPaidThrough:
      value(
        "memberHistoricalPaidThrough"
      ),

    historicalPaymentMethod:
      byId(
        "memberHistoricalPaymentMethod"
      )?.value ||
      "Cash"
  };
}


/* =========================================================
   FORM VALIDATION
========================================================= */

async function validateForm(
  values
) {
  if (
    !values.memberNumber
  ) {
    throw new Error(
      "Member number is required."
    );
  }

  if (
    !values.name
  ) {
    throw new Error(
      "Member name is required."
    );
  }

  if (
    !editingMemberId &&
    !values.nationalId
  ) {
    throw new Error(
      "National ID is required for a new member."
    );
  }

  if (
    !values.phone
  ) {
    throw new Error(
      "Phone number is required."
    );
  }

  if (!groupId) {
    throw new Error(
      "Group information is required."
    );
  }

  if (
    editingMemberId
  ) {
    return true;
  }

  if (
    !values.joinDate
  ) {
    throw new Error(
      "Join date is required."
    );
  }

  if (
    !Number.isFinite(
      values.contributionAmount
    ) ||
    values.contributionAmount <= 0
  ) {
    throw new Error(
      "Monthly contribution must be greater than zero."
    );
  }

  if (
    !monthlyContributionType?.id
  ) {
    throw new Error(
      "The group's Monthly contribution type could not be found."
    );
  }

  if (
    ![
      "full_period",
      "next_full_period"
    ].includes(
      values.firstPeriodRule
    )
  ) {
    throw new Error(
      "Invalid first-period contribution rule."
    );
  }

  if (
    !values.effectiveFrom
  ) {
    throw new Error(
      "Contribution effective date is required."
    );
  }

  if (
    values.effectiveFrom <
    values.joinDate
  ) {
    throw new Error(
      "Contribution effective date cannot be before the member join date."
    );
  }

  if (
    !values.historicalEnabled
  ) {
    return true;
  }

  if (
    !values.historicalPaidThrough
  ) {
    throw new Error(
      "Historical paid-through date is required."
    );
  }

  const today =
    getToday();

  if (
    values.historicalPaidThrough >
    today
  ) {
    throw new Error(
      "Historical paid-through date cannot be in the future."
    );
  }

  if (
    ![
      "M-Pesa",
      "Cash",
      "Bank transfer"
    ].includes(
      values.historicalPaymentMethod
    )
  ) {
    throw new Error(
      "Invalid historical payment method."
    );
  }

  const firstHistoricalMonth =
    resolveFirstHistoricalMonth(
      values
    );

  if (
    !firstHistoricalMonth
  ) {
    throw new Error(
      "The first historical contribution month could not be determined."
    );
  }

  if (
    values.historicalPaidThrough <
    firstHistoricalMonth
  ) {
    throw new Error(
      "Historical paid-through date cannot be before the first historical contribution month."
    );
  }

  return true;
}


/* =========================================================
   DUPLICATE MEMBER NUMBER CHECK
========================================================= */

async function checkDuplicateMemberNumber(
  memberNumber
) {
  if (
    !groupId ||
    !memberNumber
  ) {
    return false;
  }

  let query =
    supabase
      .from(
        "members"
      )
      .select(
        "id"
      )
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "member_number",
        memberNumber
      );

  if (
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
  } =
    await query
      .limit(1);

  if (error) {
    throw error;
  }

  return Boolean(
    data &&
    data.length
  );
}


/* =========================================================
   SAVE MEMBER
========================================================= */

async function saveMember(
  event
) {
  event?.preventDefault();

  clearFormMessage();

  const submitButton =
    byId(
      "saveMemberButton"
    ) ||
    byId(
      "memberSaveButton"
    );

  const values =
    getFormValues();

  try {
    await validateForm(
      values
    );

    const duplicate =
      await checkDuplicateMemberNumber(
        values.memberNumber
      );

    if (duplicate) {
      throw new Error(
        "A member with this member number already exists in this group."
      );
    }

    if (submitButton) {
      submitButton.disabled =
        true;
    }

    let result = null;

    /* -----------------------------------------------------
       EDIT EXISTING MEMBER
    ----------------------------------------------------- */

    if (
      editingMemberId
    ) {
      const {
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
              values.phone,

            email:
              values.email ||
              null,

            role:
              values.role,

            status:
              values.status,

            join_date:
              values.joinDate
          })
          .eq(
            "id",
            editingMemberId
          )
          .eq(
            "group_id",
            groupId
          );

      if (error) {
        throw error;
      }

      await loadMembers();

      await loadMemberContributionPositions();

      renderMembers();

      updateMemberCount();

      showFormMessage(
        "Member details updated successfully.",
        "success"
      );

      closeAddMember();

      return;
    }


    /* -----------------------------------------------------
       NEW MEMBER
    ----------------------------------------------------- */

    const requestId =
      crypto.randomUUID();

    if (
      values.historicalEnabled
    ) {
      const {
        data,
        error
      } =
        await supabase.rpc(
          "create_member_with_historical_contributions",
          {
            p_request_id:
              requestId,

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
        );

      if (error) {
        throw error;
      }

      result =
        Array.isArray(data)
          ? data[0]
          : data;

    } else {
      const {
        data,
        error
      } =
        await supabase.rpc(
          "create_member_with_contribution_plan",
          {
            p_request_id:
              requestId,

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

      result =
        Array.isArray(data)
          ? data[0]
          : data;
    }


    /* -----------------------------------------------------
       ONBOARDING EVENT
    ----------------------------------------------------- */

    try {
      sessionStorage.setItem(
        "chama_live_onboarding_event",
        JSON.stringify({
          type:
            "new-member",

          member_id:
            result?.member_id ||
            result?.id ||
            null,

          group_id:
            groupId,

          created_at:
            new Date().toISOString()
        })
      );
    } catch {
      /* sessionStorage is optional */
    }


    /* -----------------------------------------------------
       REFRESH MEMBER LIST + ACCOUNTING POSITION
    ----------------------------------------------------- */

    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();


    /* -----------------------------------------------------
       SUCCESS MESSAGE
    ----------------------------------------------------- */

    const message =
      contributionResultMessage(
        result
      );

    showFormMessage(
      message
        ? `Member created successfully. ${message}`
        : "Member created successfully.",
      "success"
    );

    closeAddMember();

  } catch (error) {
    console.error(
      "CHAMA LIVE: Save member error",
      error
    );

    showFormMessage(
      error?.message ||
        "Could not save the member.",
      "error"
    );

  } finally {
    if (submitButton) {
      submitButton.disabled =
        false;
    }
  }
}


/* =========================================================
   HISTORICAL RECONCILIATION
========================================================= */

async function reconcileMemberHistoricalPayments(
  memberId,
  throughDate = null
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
      "reconcile_member_historical_payments",
      {
        p_member_id:
          memberId,

        p_through_date:
          throughDate ||
          null
      }
    );

  if (error) {
    throw error;
  }

  return Array.isArray(data)
    ? data[0]
    : data;
}


/* =========================================================
   HISTORICAL RECONCILIATION HANDLER
========================================================= */

async function handleHistoricalReconciliation(
  memberId
) {
  const member =
    members.find(
      item =>
        String(
          item.id
        ) ===
        String(
          memberId
        )
    );

  if (!member) {
    showError(
      new Error(
        "Member could not be found."
      )
    );

    return;
  }

  const confirmed =
    window.confirm(
      `Reconcile historical payments for ${member.name || "this member"}?`
    );

  if (!confirmed) {
    return;
  }

  try {
    showStatus(
      "Reconciling historical payments..."
    );

    await reconcileMemberHistoricalPayments(
      member.id
    );

    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();

    showStatus("");

    await openMemberModal(
      member.id
    );

  } catch (error) {
    showStatus("");

    showError(
      error
    );
  }
}


/* =========================================================
   MEMBER INVITATION
========================================================= */

async function sendMemberInvitation(
  memberId,
  reopenModal = false
) {
  const member =
    members.find(
      item =>
        String(
          item.id
        ) ===
        String(
          memberId
        )
    );

  if (!member) {
    throw new Error(
      "Member could not be found."
    );
  }

  const email =
    String(
      member.email ||
      ""
    )
      .trim()
      .toLowerCase();

  if (!email) {
    throw new Error(
      "This member does not have an email address."
    );
  }

  const {
    data: sessionData,
    error: sessionError
  } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (
    !sessionData?.session
  ) {
    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  const {
    error
  } =
    await supabase.functions.invoke(
      "send-member-invitation",
      {
        body: {
          member_id:
            member.id
        }
      }
    );

  if (error) {
    throw error;
  }

  await loadMembers();

  await loadMemberContributionPositions();

  renderMembers();

  updateMemberCount();

  if (
    reopenModal
  ) {
    await openMemberModal(
      member.id
    );
  }
}


/* =========================================================
   CLOSE ADD MEMBER
========================================================= */

function closeAddMember() {
  const panel =
    byId(
      "addMemberPanel"
    );

  if (panel) {
    panel.hidden =
      true;
  }

  editingMemberId =
    null;

  clearFormMessage();
}


/* =========================================================
   OPEN EDIT MEMBER
========================================================= */

async function openEditMember(
  memberId
) {
  const member =
    members.find(
      item =>
        String(
          item.id
        ) ===
        String(
          memberId
        )
    );

  if (!member) {
    showError(
      new Error(
        "Member could not be found."
      )
    );

    return;
  }

  editingMemberId =
    member.id;

  const panel =
    byId(
      "addMemberPanel"
    );

  const title =
    byId(
      "memberFormTitle"
    );

  const description =
    byId(
      "memberFormDescription"
    );

  const form =
    byId(
      "addMemberForm"
    );

  if (panel) {
    panel.hidden =
      false;
  }

  if (title) {
    title.textContent =
      "Edit Member";
  }

  if (description) {
    description.textContent =
      "Update the member's profile details. Contribution accounting remains managed by the existing accounting system.";
  }

  if (form) {
    form.reset();
  }

  ensureNationalIdUI();
  ensureContributionUI();

  const setValue =
    (
      id,
      value
    ) => {
      const element =
        byId(id);

      if (element) {
        element.value =
          value ?? "";
      }
    };

  setValue(
    "memberNumber",
    member.member_number
  );

  setValue(
    "memberName",
    member.name
  );

  setValue(
    "memberNationalId",
    member.national_id
  );

  setValue(
    "memberPhone",
    member.phone
  );

  setValue(
    "memberEmail",
    member.email
  );

  setValue(
    "memberRole",
    member.role ||
      "member"
  );

  setValue(
    "memberStatus",
    member.status ||
      "active"
  );

  setValue(
    "memberJoinDate",
    member.join_date
  );

  const amount =
    byId(
      "memberContributionAmount"
    );

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
   PART 5 — MEMBER ACCOUNTING / CONTRIBUTION POSITION
   ---------------------------------------------------------
   Read-only contribution position display.

   Canonical RPC:
     get_member_contribution_position(uuid)

   IMPORTANT:
   - No contribution/payment writes here.
   - No RPC replacement.
   - No reconciliation function declaration here.
   - Keep exactly one copy of each function in members.js.
========================================================= */


/* ---------------------------------------------------------
   CONTRIBUTION POSITION UI
--------------------------------------------------------- */

function ensureContributionPositionUI() {
  const modal =
    byId("viewMemberModal") ||
    byId("memberModal");

  if (!modal) {
    return null;
  }

  let panel =
    byId(
      "memberContributionPosition"
    );

  if (panel) {
    return panel;
  }

  panel =
    document.createElement(
      "section"
    );

  panel.id =
    "memberContributionPosition";

  panel.className =
    "member-contribution-position";

  panel.innerHTML = `
    <div class="member-contribution-position-header">
      <div>
        <h3>
          Contribution Accounting
        </h3>

        <p>
          Current contribution position for this member.
        </p>
      </div>

      <span
        id="memberContributionPositionStatus"
        class="member-contribution-position-status status-unknown"
      >
        Loading…
      </span>
    </div>

    <div
      id="memberContributionPositionDescription"
      class="member-contribution-position-description"
    >
      Loading contribution position…
    </div>

    <div class="member-contribution-position-grid">

      <div class="member-contribution-metric metric-due">
        <span class="member-contribution-metric-label">
          Total Due
        </span>

        <strong
          id="memberContributionPositionDue"
        >
          —
        </strong>
      </div>

      <div class="member-contribution-metric metric-paid">
        <span class="member-contribution-metric-label">
          Total Paid
        </span>

        <strong
          id="memberContributionPositionAllocated"
        >
          —
        </strong>
      </div>

      <div class="member-contribution-metric metric-arrears">
        <span class="member-contribution-metric-label">
          Total Arrears
        </span>

        <strong
          id="memberContributionPositionArrears"
        >
          —
        </strong>
      </div>

      <div class="member-contribution-metric metric-credit">
        <span class="member-contribution-metric-label">
          Total Credit
        </span>

        <strong
          id="memberContributionPositionCredit"
        >
          —
        </strong>
      </div>

      <div class="member-contribution-metric metric-records">
        <span class="member-contribution-metric-label">
          Contribution Records
        </span>

        <strong
          id="memberContributionPositionRecords"
        >
          —
        </strong>
      </div>

    </div>
  `;

  const actions =
    modal.querySelector(
      ".modal-actions"
    );

  if (actions) {
    actions.before(
      panel
    );
  } else {
    const detailGrid =
      modal.querySelector(
        ".member-detail-grid"
      );

    if (detailGrid) {
      detailGrid.after(
        panel
      );
    } else {
      modal.appendChild(
        panel
      );
    }
  }

  return panel;
}


/* ---------------------------------------------------------
   CONTRIBUTION POSITION STYLES
--------------------------------------------------------- */

function ensureContributionPositionStyles() {
  if (
    byId(
      "memberContributionPositionStyles"
    )
  ) {
    return;
  }

  const style =
    document.createElement(
      "style"
    );

  style.id =
    "memberContributionPositionStyles";

  style.textContent = `
    .member-contribution-position {
      margin-top: 18px;
      padding: 18px;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      background: #ffffff;
    }

    .member-contribution-position-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 10px;
    }

    .member-contribution-position-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 800;
    }

    .member-contribution-position-header p {
      margin: 4px 0 0;
      color: #64748b;
      font-size: 12px;
    }

    .member-contribution-position-status {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 28px;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      white-space: nowrap;
    }

    .member-contribution-position-status.status-arrears {
      background: #fee2e2;
      color: #b91c1c;
    }

    .member-contribution-position-status.status-credit {
      background: #dbeafe;
      color: #1d4ed8;
    }

    .member-contribution-position-status.status-up-to-date {
      background: #dcfce7;
      color: #15803d;
    }

    .member-contribution-position-status.status-unknown {
      background: #f1f5f9;
      color: #64748b;
    }

    .member-contribution-position-description {
      margin-bottom: 14px;
      padding: 10px 12px;
      border-radius: 10px;
      background: #f8fafc;
      color: #475569;
      font-size: 12px;
      line-height: 1.5;
    }

    .member-contribution-position-grid {
      display: grid;
      grid-template-columns:
        repeat(5, minmax(0, 1fr));
      gap: 10px;
    }

    .member-contribution-metric {
      min-width: 0;
      padding: 13px 12px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
    }

    .member-contribution-metric-label {
      display: block;
      margin-bottom: 6px;
      color: #64748b;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .04em;
    }

    .member-contribution-metric strong {
      display: block;
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
    }

    .member-contribution-metric.metric-due {
      border-left: 4px solid #64748b;
    }

    .member-contribution-metric.metric-paid {
      border-left: 4px solid #2563eb;
    }

    .member-contribution-metric.metric-arrears {
      border-left: 4px solid #dc2626;
    }

    .member-contribution-metric.metric-credit {
      border-left: 4px solid #16a34a;
    }

    .member-contribution-metric.metric-records {
      border-left: 4px solid #7c3aed;
    }

    .member-contribution-metric.metric-paid strong {
      color: #1d4ed8;
    }

    .member-contribution-metric.metric-arrears strong {
      color: #b91c1c;
    }

    .member-contribution-metric.metric-credit strong {
      color: #15803d;
    }

    @media (max-width: 850px) {
      .member-contribution-position-grid {
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 560px) {
      .member-contribution-position {
        padding: 14px;
      }

      .member-contribution-position-header {
        flex-direction: column;
      }

      .member-contribution-position-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
  `;

  document.head.appendChild(
    style
  );
}


/* ---------------------------------------------------------
   POSITION LOADING STATE
--------------------------------------------------------- */

function setContributionPositionLoading() {
  ensureContributionPositionUI();

  const status =
    byId(
      "memberContributionPositionStatus"
    );

  const description =
    byId(
      "memberContributionPositionDescription"
    );

  const due =
    byId(
      "memberContributionPositionDue"
    );

  const allocated =
    byId(
      "memberContributionPositionAllocated"
    );

  const arrears =
    byId(
      "memberContributionPositionArrears"
    );

  const credit =
    byId(
      "memberContributionPositionCredit"
    );

  const records =
    byId(
      "memberContributionPositionRecords"
    );

  if (status) {
    status.textContent =
      "Loading…";

    status.className =
      "member-contribution-position-status status-unknown";
  }

  if (description) {
    description.textContent =
      "Loading contribution position…";
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

  if (records) {
    records.textContent =
      "—";
  }
}


/* ---------------------------------------------------------
   POSITION STATUS CLASS
--------------------------------------------------------- */

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
    value === "arrears"
  ) {
    return "status-arrears";
  }

  if (
    value === "credit"
  ) {
    return "status-credit";
  }

  if (
    value === "up_to_date"
  ) {
    return "status-up-to-date";
  }

  return "status-unknown";
}


/* ---------------------------------------------------------
   READ MEMBER CONTRIBUTION POSITION
--------------------------------------------------------- */

async function loadMemberContributionPosition(
  memberId
) {
  ensureContributionPositionUI();
  ensureContributionPositionStyles();
  setContributionPositionLoading();

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

  const records =
    Number(
      position.contribution_records ??
      position.records_count ??
      position.record_count ??
      position.contribution_count ??
      0
    );

  const statusElement =
    byId(
      "memberContributionPositionStatus"
    );

  const description =
    byId(
      "memberContributionPositionDescription"
    );

  const dueElement =
    byId(
      "memberContributionPositionDue"
    );

  const allocatedElement =
    byId(
      "memberContributionPositionAllocated"
    );

  const arrearsElement =
    byId(
      "memberContributionPositionArrears"
    );

  const creditElement =
    byId(
      "memberContributionPositionCredit"
    );

  const recordsElement =
    byId(
      "memberContributionPositionRecords"
    );

  if (statusElement) {
    statusElement.textContent =
      contributionStatusLabel(
        status
      );

    statusElement.className =
      `member-contribution-position-status ${contributionPositionStatusClass(status)}`;
  }

  if (description) {
    if (
      status === "arrears"
    ) {
      description.textContent =
        `Member has paid ${formatMoney(allocated)} against ${formatMoney(due)} due, leaving ${formatMoney(arrears)} in arrears.`;

    } else if (
      status === "credit"
    ) {
      description.textContent =
        `Member has contributed ${formatMoney(allocated)} and currently has ${formatMoney(credit)} in credit.`;

    } else if (
      status === "up_to_date"
    ) {
      description.textContent =
        `Member has contributed ${formatMoney(allocated)} against ${formatMoney(due)} due and is up to date.`;

    } else if (
      status === "plan_not_set"
    ) {
      description.textContent =
        "No contribution plan has been established for this member.";

    } else {
      description.textContent =
        `Contribution position: ${contributionStatusLabel(status)}.`;
    }
  }

  if (dueElement) {
    dueElement.textContent =
      formatMoney(due);
  }

  if (allocatedElement) {
    allocatedElement.textContent =
      formatMoney(allocated);
  }

  if (arrearsElement) {
    arrearsElement.textContent =
      formatMoney(arrears);
  }

  if (creditElement) {
    creditElement.textContent =
      formatMoney(credit);
  }

  if (recordsElement) {
    recordsElement.textContent =
      Number.isFinite(records)
        ? records.toLocaleString(
            "en-KE"
          )
        : "0";
  }

  return position;
}


/* ---------------------------------------------------------
   REFRESH POSITION AFTER RECONCILIATION
--------------------------------------------------------- */

async function refreshMemberContributionPosition(
  memberId
) {
  if (!memberId) {
    return null;
  }

  try {
    return await loadMemberContributionPosition(
      memberId
    );

  } catch (error) {
    console.error(
      "CHAMA LIVE: Could not refresh member contribution position",
      error
    );

    throw error;
  }
}


/* ---------------------------------------------------------
   OPEN MEMBER MODAL
--------------------------------------------------------- */

async function openMemberModal(
  memberId
) {
  ensureNationalIdUI();
  ensureContributionPositionUI();
  ensureContributionPositionStyles();

  const member =
    members.find(
      item =>
        String(item.id) ===
        String(memberId)
    );

  if (!member) {
    showError(
      "Member could not be found."
    );

    return;
  }

  const modal =
    byId("viewMemberModal") ||
    byId("memberModal");

  if (!modal) {
    return;
  }

  const name =
    byId("viewMemberName");

  const memberNumber =
    byId("viewMemberNumber");

  const nationalId =
    byId("viewMemberNationalId");

  const phone =
    byId("viewMemberPhone");

  const email =
    byId("viewMemberEmail");

  const role =
    byId("viewMemberRole");

  const status =
    byId("viewMemberStatus");

  const joinDate =
    byId("viewMemberJoinDate");

  if (name) {
    name.textContent =
      member.name ||
      "—";
  }

  if (memberNumber) {
    memberNumber.textContent =
      member.member_number ||
      member.membership_number ||
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
      member.role ||
      "member";
  }

  if (status) {
    status.textContent =
      member.status ||
      "—";
  }

  if (joinDate) {
    joinDate.textContent =
      member.join_date ||
      "—";
  }

  modal.hidden =
    false;

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

    const positionStatus =
      byId(
        "memberContributionPositionStatus"
      );

    const description =
      byId(
        "memberContributionPositionDescription"
      );

    if (positionStatus) {
      positionStatus.textContent =
        "Unavailable";

      positionStatus.className =
        "member-contribution-position-status status-unknown";
    }

    if (description) {
      description.textContent =
        error?.message ||
        "Contribution position could not be loaded.";
    }
  }


  /* -------------------------------------------------------
     HISTORICAL RECONCILIATION BUTTON
  ------------------------------------------------------- */

  let reconcileButton =
    byId(
      "reconcileHistoricalPayments"
    );

  if (!reconcileButton) {
    reconcileButton =
      document.createElement(
        "button"
      );

    reconcileButton.type =
      "button";

    reconcileButton.id =
      "reconcileHistoricalPayments";

    reconcileButton.className =
      "btn btn-secondary";

    reconcileButton.dataset.action =
      "reconcile";

    const actions =
      modal.querySelector(
        ".modal-actions"
      );

    if (actions) {
      actions.prepend(
        reconcileButton
      );
    }
  }

  /*
     Important:
     The reconciliation action must carry the
     currently opened member ID.
  */
  reconcileButton.dataset.memberId =
    String(
      member.id
    );

  reconcileButton.textContent =
    "Reconcile Historical Payments";

  const closeButton =
    modal.querySelector(
      "[data-close-member-modal]"
    );

  if (closeButton) {
    closeButton.focus();
  }
}


/* =========================================================
   MEMBER SEARCH
   ---------------------------------------------------------
   memberSearchTimer is declared once at the top of
   members.js. Do NOT redeclare it here.
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
    byId("viewMemberModal") ||
    byId("memberModal");

  if (!modal) {
    return;
  }

  modal.hidden =
    true;

  modal.classList.remove(
    "open"
  );
}


/* =========================================================
   BIND EVENTS
========================================================= */

function bindEvents() {
  if (eventsBound) {
    return;
  }

  eventsBound =
    true;

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


  /* -------------------------------------------------------
     MEMBER VIEW MODAL
  ------------------------------------------------------- */

  const modal =
    byId("viewMemberModal") ||
    byId("memberModal");

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


  /* -------------------------------------------------------
     HISTORICAL CONTROLS
  ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     ESCAPE KEY
  ------------------------------------------------------- */

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
        byId("viewMemberModal") ||
        byId("memberModal");

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


