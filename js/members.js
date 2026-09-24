/* =========================================================
   CHAMA LIVE — MEMBERS
   Pilot-ready members management
   National ID + Contribution Accounting
   ---------------------------------------------------------
   NEW MEMBER FLOW

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

   MEMBER VIEW
   ---------------------------------------------------------
   Contribution position is READ-ONLY.

   Canonical RPC:
     get_member_contribution_position(uuid)

   No accounting RPC is replaced here.
   No SQL changes are made here.
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
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}


function getToday() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}


function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "M";
  }

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
}


function displayRole(role) {
  const value = String(role || "member")
    .trim();

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, character =>
      character.toUpperCase()
    );
}


function roleBadgeHtml(role) {
  return `
    <span class="member-role-badge">
      ${escapeHtml(displayRole(role))}
    </span>
  `;
}


function accountStatusHtml(status) {
  const value = String(status || "unknown")
    .trim()
    .toLowerCase();

  const label = value
    .replace(/_/g, " ")
    .toUpperCase();

  let className = "status-unknown";

  if (value === "active") {
    className = "status-active";
  } else if (value === "inactive") {
    className = "status-inactive";
  }

  return `
    <span class="member-account-status ${className}">
      ${escapeHtml(label)}
    </span>
  `;
}


/* =========================================================
   LOGIN STATUS
   ========================================================= */

function getLoginStatus(member) {
  const onboardingStatus =
    String(member?.onboarding_status || "")
      .trim()
      .toLowerCase();

  if (member?.user_id) {
    return "Active";
  }

  if (
    onboardingStatus === "invited" ||
    onboardingStatus === "invitation_sent" ||
    onboardingStatus === "pending_invitation"
  ) {
    return "Invitation Sent";
  }

  return "No Login";
}


function loginStatusHtml(member) {
  const status = getLoginStatus(member);

  let className = "login-none";

  if (status === "Active") {
    className = "login-active";
  } else if (status === "Invitation Sent") {
    className = "login-invited";
  }

  return `
    <span class="member-login-status ${className}">
      ${escapeHtml(status)}
    </span>
  `;
}


/* =========================================================
   CONTRIBUTION STATUS
   ========================================================= */

function contributionStatusKey(position) {
  const status =
    String(position?.status || "")
      .trim()
      .toLowerCase();

  const arrears =
    Number(position?.arrears || 0);

  const credit =
    Number(position?.credit || 0);

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

  if (status === "up_to_date") {
    return "UP_TO_DATE";
  }

  if (status === "plan_not_set") {
    return "PLAN_NOT_SET";
  }

  return "UNKNOWN";
}


function contributionStatusHtml(member) {
  const position =
    contributionPositions.get(
      String(member.id)
    );

  if (!position) {
    return `
      <span class="member-contribution-status status-unknown">
        Unavailable
      </span>
    `;
  }

  const status =
    contributionStatusKey(position);

  if (status === "ARREARS") {
    return `
      <span class="member-contribution-status status-arrears">
        ARREARS
        <small>
          ${formatMoney(position?.arrears)}
        </small>
      </span>
    `;
  }

  if (status === "CREDIT") {
    return `
      <span class="member-contribution-status status-credit">
        CREDIT
        <small>
          ${formatMoney(position?.credit)}
        </small>
      </span>
    `;
  }

  if (status === "UP_TO_DATE") {
    return `
      <span class="member-contribution-status status-up-to-date">
        UP TO DATE
      </span>
    `;
  }

  if (status === "PLAN_NOT_SET") {
    return `
      <span class="member-contribution-status status-unknown">
        PLAN NOT SET
      </span>
    `;
  }

  return `
    <span class="member-contribution-status status-unknown">
      Unavailable
    </span>
  `;
}


/* =========================================================
   LOAD MEMBER CONTRIBUTION POSITIONS
   ========================================================= */

async function loadMemberContributionPositions() {
  contributionPositions.clear();
  contributionPositionsLoaded = false;

  if (!members.length) {
    contributionPositionsLoaded = true;
    return;
  }

  await Promise.all(
    members.map(async member => {
      try {
        const {
          data,
          error
        } = await supabase.rpc(
          "get_member_contribution_position",
          {
            p_member_id: member.id
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

        contributionPositions.set(
          String(member.id),
          position || null
        );
      } catch (error) {
        console.error(
          "Failed to load contribution position:",
          member.id,
          error
        );

        contributionPositions.set(
          String(member.id),
          null
        );
      }
    })
  );

  contributionPositionsLoaded = true;
}


/* =========================================================
   CONTRIBUTION STATUS HEADER
   ========================================================= */

function ensureContributionStatusHeader() {
  const row =
    document.querySelector(
      ".members-table thead tr"
    );

  if (!row) return;

  const existingHeader =
    Array.from(row.children)
      .find(header =>
        String(header.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase() ===
        "contribution status"
      );

  if (existingHeader) {
    return;
  }

  if (
    row.querySelector(
      "[data-contribution-status-header]"
    )
  ) {
    return;
  }

  const th =
    document.createElement("th");

  th.dataset.contributionStatusHeader =
    "true";

  th.textContent =
    "Contribution Status";

  const headers =
    Array.from(row.children);

  const loginHeader =
    headers.find(header =>
      String(header.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase() === "login"
    );

  if (loginHeader) {
    row.insertBefore(
      th,
      loginHeader
    );
  } else {
    row.appendChild(th);
  }
}


/* =========================================================
   CONTRIBUTION STATUS STYLES
   ========================================================= */

function ensureContributionStatusStyles() {
  if (byId("memberContributionStatusStyles")) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "memberContributionStatusStyles";

  style.textContent = `
    .member-contribution-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      white-space: nowrap;
    }

    .member-contribution-status small {
      font-size: 10px;
      font-weight: 800;
    }

    .member-contribution-status.status-arrears {
      background: #fee2e2;
      color: #b91c1c;
    }

    .member-contribution-status.status-credit {
      background: #ede9fe;
      color: #6d28d9;
    }

    .member-contribution-status.status-up-to-date {
      background: #dcfce7;
      color: #15803d;
    }

    .member-contribution-status.status-unknown {
      background: #f1f5f9;
      color: #64748b;
    }

    .member-card-contribution-status {
      margin-top: 12px;
    }
  `;

  document.head.appendChild(style);
}


/* =========================================================
   MESSAGES
   ========================================================= */

function showStatus(message) {
  const element =
    byId("membersStatus") ||
    byId("statusMessage") ||
    byId("memberStatus");

  if (!element) return;

  element.textContent =
    message || "";

  element.hidden =
    !message;
}


function showError(error) {
  console.error(error);

  const message =
    error?.message ||
    String(error || "Something went wrong.");

  const element =
    byId("membersError") ||
    byId("errorMessage") ||
    byId("memberError");

  if (!element) {
    console.error(message);
    return;
  }

  element.textContent = message;
  element.hidden = false;
}


function clearError() {
  const element =
    byId("membersError") ||
    byId("errorMessage") ||
    byId("memberError");

  if (!element) return;

  element.textContent = "";
  element.hidden = true;
}


function showFormMessage(
  message,
  type = "success"
) {
  const element =
    byId("memberFormMessage");

  if (!element) return;

  element.textContent =
    message || "";

  element.className =
    `form-message ${type}`;

  element.hidden =
    !message;
}


function clearFormMessage() {
  showFormMessage("");
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
  const memberNumber =
    byId("memberNumber");

  const form =
    byId("addMemberForm");

  if (!form) return;

  if (
    !byId("memberNationalId") &&
    memberNumber
  ) {
    const wrapper =
      document.createElement("div");

    wrapper.className =
      "form-group";

    wrapper.innerHTML = `
      <label for="memberNationalId">
        National ID
      </label>

      <input
        type="text"
        id="memberNationalId"
        name="national_id"
        autocomplete="off"
        placeholder="National ID"
      />
    `;

    memberNumber
      .closest(".form-group")
      ?.insertAdjacentElement(
        "afterend",
        wrapper
      );
  }

  const headerRow =
    document.querySelector(
      ".members-table thead tr"
    );

  if (
    headerRow &&
    !headerRow.querySelector(
      "[data-national-id-header]"
    )
  ) {
    const existingNationalIdHeader =
      Array.from(headerRow.children)
        .find(header =>
          String(header.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase() ===
          "national id"
        );

    if (!existingNationalIdHeader) {
      const th =
        document.createElement("th");

      th.dataset.nationalIdHeader =
        "true";

      th.textContent =
        "National ID";

      const headers =
        Array.from(
          headerRow.children
        );

      const membershipHeader =
        headers.find(header =>
          String(header.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase()
            .includes("membership no")
        );

      if (membershipHeader) {
        headerRow.insertBefore(
          th,
          membershipHeader
        );
      } else {
        headerRow.appendChild(th);
      }
    }
  }

  const detailGrid =
    document.querySelector(
      ".member-detail-grid"
    );

  if (
    detailGrid &&
    !byId("viewMemberNationalId")
  ) {
    const item =
      document.createElement("div");

    item.className =
      "member-detail-item";

    item.innerHTML = `
      <span class="detail-label">
        National ID
      </span>

      <strong id="viewMemberNationalId">
        —
      </strong>
    `;

    detailGrid.appendChild(item);
  }
}


/* =========================================================
   CONTRIBUTION SETUP UI
   ========================================================= */

function ensureContributionUI() {
  const setup =
    byId("memberContributionSetup");

  if (!setup) return;

  const amount =
    byId("memberContributionAmount");

  const firstPeriodRule =
    byId("memberFirstPeriodRule");

  const effectiveFrom =
    byId("memberContributionEffectiveFrom");

  if (amount) {
    amount.disabled = false;
  }

  if (firstPeriodRule) {
    firstPeriodRule.disabled = false;
  }

  if (effectiveFrom) {
    effectiveFrom.disabled = false;
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
      "Group ID is required to load contribution types."
    );
  }

  const {
    data,
    error
  } = await supabase
    .from("contribution_types")
    .select("*")
    .eq("group_id", groupId)
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  const rows = data || [];

  monthlyContributionType =
    rows.find(row => {
      const name =
        String(
          row.name ||
          row.type_name ||
          ""
        )
          .trim()
          .toLowerCase();

      return name === "monthly";
    }) ||
    rows.find(row =>
      String(row.code || "")
        .trim()
        .toLowerCase() === "monthly"
    ) ||
    rows[0] ||
    null;

  if (!monthlyContributionType) {
    throw new Error(
      "No active monthly contribution type was found for this group."
    );
  }

  contributionTypesLoaded = true;

  return monthlyContributionType;
}


/* =========================================================
   CONTRIBUTION PREVIEW
   ========================================================= */

function updateContributionPreview() {
  const amountElement =
    byId("memberContributionAmount");

  const preview =
    byId("memberContributionPreview");

  if (!preview) return;

  const amount =
    Number(amountElement?.value || 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    preview.textContent =
      "Set the member's monthly contribution amount.";

    return;
  }

  preview.textContent =
    `Monthly contribution: ${formatMoney(amount)}`;
}


/* =========================================================
   HISTORICAL CONTRIBUTION CONTROLS
   ========================================================= */

function updateHistoricalControls() {
  const enabledElement =
    byId("memberHistoricalEnabled");

  const paidThrough =
    byId("memberHistoricalPaidThrough");

  const paymentMethod =
    byId("memberHistoricalPaymentMethod");

  const paidThroughGroup =
    paidThrough?.closest(
      ".form-group"
    );

  const paymentMethodGroup =
    paymentMethod?.closest(
      ".form-group"
    );

  const enabled =
    enabledElement?.value === "true" ||
    enabledElement?.checked === true;

  if (paidThrough) {
    paidThrough.disabled =
      !enabled;
  }

  if (paymentMethod) {
    paymentMethod.disabled =
      !enabled;
  }

  if (paidThroughGroup) {
    paidThroughGroup.style.display =
      enabled ? "" : "none";
  }

  if (paymentMethodGroup) {
    paymentMethodGroup.style.display =
      enabled ? "" : "none";
  }

  updateHistoricalPreview();
}


/* =========================================================
   HISTORICAL PREVIEW
   ========================================================= */

function updateHistoricalPreview() {
  const enabledElement =
    byId("memberHistoricalEnabled");

  const preview =
    byId("memberHistoricalPreview");

  const joinDateElement =
    byId("memberJoinDate");

  const paidThroughElement =
    byId("memberHistoricalPaidThrough");

  const amountElement =
    byId("memberContributionAmount");

  if (!preview) return;

  const enabled =
    enabledElement?.value === "true" ||
    enabledElement?.checked === true;

  if (!enabled) {
    preview.style.display = "none";
    preview.textContent = "";
    return;
  }

  preview.style.display = "";

  const joinDate =
    joinDateElement?.value;

  const paidThrough =
    paidThroughElement?.value;

  const amount =
    Number(amountElement?.value || 0);

  if (!joinDate || !paidThrough) {
    preview.textContent =
      "Select the join date and paid-through date.";

    return;
  }

  const start =
    new Date(`${joinDate}T00:00:00`);

  const end =
    new Date(`${paidThrough}T00:00:00`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    preview.textContent =
      "Enter valid dates.";

    return;
  }

  if (end < start) {
    preview.textContent =
      "Paid-through date cannot be before join date.";

    return;
  }

  const months =
    (
      (end.getFullYear() -
        start.getFullYear()) *
        12
    ) +
    (
      end.getMonth() -
      start.getMonth()
    ) +
    1;

  const total =
    months *
    (
      Number.isFinite(amount)
        ? amount
        : 0
    );

  preview.textContent =
    `${months} historical month${months === 1 ? "" : "s"} · ${formatMoney(total)}`;
}


/* =========================================================
   CONTRIBUTION HELPERS
   ========================================================= */

function contributionStatusLabel(status) {
  const value =
    String(status || "")
      .toLowerCase();

  if (value === "up_to_date") {
    return "UP TO DATE";
  }

  if (value === "credit") {
    return "CREDIT";
  }

  if (value === "arrears") {
    return "ARREARS";
  }

  if (value === "plan_not_set") {
    return "PLAN NOT SET";
  }

  return value
    .replace(/_/g, " ")
    .toUpperCase();
}


function formatMoney(value) {
  const amount =
    Number(value || 0);

  return `KSh ${amount.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}


/* =========================================================
   HISTORICAL MONTH RESOLUTION
   ========================================================= */

function resolveFirstHistoricalMonth(values) {
  if (!values) return "";

  const effectiveFrom =
    values.effectiveFrom ||
    values.joinDate;

  if (!effectiveFrom) {
    return "";
  }

  const date =
    new Date(`${effectiveFrom}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (
    values.firstPeriodRule ===
    "next_full_period"
  ) {
    date.setDate(1);
    date.setMonth(
      date.getMonth() + 1
    );
  } else {
    date.setDate(1);
  }

  return date
    .toISOString()
    .slice(0, 10);
}


/* =========================================================
   LOAD MEMBERS
   ========================================================= */

async function loadMembers() {
  if (!groupId) {
    throw new Error(
      "Group ID is required."
    );
  }

  const {
    data,
    error
  } = await supabase
    .from("members")
    .select("*")
    .eq("group_id", groupId)
    .order(
      "member_number",
      {
        ascending: true
      }
    );

  if (error) {
    throw error;
  }

  members = data || [];
}


/* =========================================================
   CONTRIBUTION RESULT MESSAGE
   ========================================================= */

function contributionResultMessage(result) {
  const status =
    contributionStatusLabel(
      result?.status
    );

  const arrears =
    Number(result?.arrears || 0);

  const credit =
    Number(result?.credit || 0);

  const due =
    Number(
      result?.total_due ??
      result?.due ??
      0
    );

  const allocated =
    Number(
      result?.total_allocated ??
      result?.allocated ??
      0
    );

  const historicalCount =
    Number(
      result?.historical_payment_count ||
      result?.historical_count ||
      0
    );

  const details = [
    `Status: ${status}`,
    `Total due: ${formatMoney(due)}`,
    `Total contributed: ${formatMoney(allocated)}`,
    `Arrears: ${formatMoney(arrears)}`,
    `Credit: ${formatMoney(credit)}`
  ];

  if (historicalCount > 0) {
    details.push(
      `Historical payments: ${historicalCount}`
    );
  }

  return details.join(" · ");
}


/* =========================================================
   MEMBER TABLE ROW
   ========================================================= */

function createMemberRow(member) {
  const id =
    member.id;

  const memberNumber =
    member.member_number || "—";

  const membershipNumber =
    member.membership_number || "—";

  const nationalId =
    member.national_id || "—";

  const name =
    member.name || "Unnamed Member";

  const phone =
    member.phone || "—";

  const email =
    member.email || "—";

  const loginStatus =
    getLoginStatus(member);

  const hasEmail =
    Boolean(
      String(member.email || "")
        .trim()
    );

  let invitationLabel =
    "Invite";

  if (!hasEmail) {
    invitationLabel =
      "No Email";
  } else if (
    loginStatus === "Active"
  ) {
    invitationLabel =
      "Active";
  } else if (
    loginStatus === "Invitation Sent"
  ) {
    invitationLabel =
      "Resend";
  }

  const invitationDisabled =
    !hasEmail ||
    loginStatus === "Active";

  return `
    <tr data-member-id="${escapeHtml(id)}">

      <td>
        ${escapeHtml(memberNumber)}
      </td>

      <td>
        ${escapeHtml(nationalId)}
      </td>

      <td>
        ${escapeHtml(membershipNumber)}
      </td>

      <td>
        <div class="member-profile">
          <div class="member-avatar">
            ${escapeHtml(getInitials(name))}
          </div>

          <div>
            <strong>
              ${escapeHtml(name)}
            </strong>

            <small>
              Joined ${escapeHtml(
                formatDate(member.join_date)
              )}
            </small>
          </div>
        </div>
      </td>

      <td>
        ${escapeHtml(phone)}
      </td>

      <td>
        ${escapeHtml(email)}
      </td>

      <td>
        ${roleBadgeHtml(member.role)}
      </td>

      <td>
        ${accountStatusHtml(member.status)}
      </td>

      <td>
        ${contributionStatusHtml(member)}
      </td>

      <td>
        ${loginStatusHtml(member)}
      </td>

      <td>
        <div class="member-actions">

          <button
            type="button"
            class="btn btn-secondary"
            data-action="view"
            data-member-id="${escapeHtml(id)}"
          >
            View
          </button>

          <button
            type="button"
            class="btn btn-secondary"
            data-action="edit"
            data-member-id="${escapeHtml(id)}"
          >
            Edit
          </button>

          <button
            type="button"
            class="btn btn-secondary"
            data-action="invite"
            data-member-id="${escapeHtml(id)}"
            ${invitationDisabled ? "disabled" : ""}
          >
            ${invitationLabel}
          </button>

        </div>
      </td>

    </tr>
  `;
}


/* =========================================================
   MEMBER CARD
   ========================================================= */

function createMemberCard(member) {
  const id =
    member.id;

  const name =
    member.name || "Unnamed Member";

  const loginStatus =
    getLoginStatus(member);

  const hasEmail =
    Boolean(
      String(member.email || "")
        .trim()
    );

  let invitationLabel =
    "Invite";

  if (!hasEmail) {
    invitationLabel =
      "No Email";
  } else if (
    loginStatus === "Active"
  ) {
    invitationLabel =
      "Active";
  } else if (
    loginStatus === "Invitation Sent"
  ) {
    invitationLabel =
      "Resend";
  }

  const invitationDisabled =
    !hasEmail ||
    loginStatus === "Active";

  return `
    <article
      class="member-card"
      data-member-id="${escapeHtml(id)}"
    >

      <div class="member-card-header">

        <div class="member-profile">

          <div class="member-avatar">
            ${escapeHtml(getInitials(name))}
          </div>

          <div>
            <h3>
              ${escapeHtml(name)}
            </h3>

            <small>
              Member #${escapeHtml(
                member.member_number || "—"
              )}
            </small>
          </div>

        </div>

        <div class="member-card-badges">
          ${accountStatusHtml(member.status)}
          ${roleBadgeHtml(member.role)}
          ${loginStatusHtml(member)}
        </div>

      </div>

      <div class="member-card-details">

        <div>
          <span>Membership No.</span>
          <strong>
            ${escapeHtml(
              member.membership_number || "—"
            )}
          </strong>
        </div>

        <div>
          <span>National ID</span>
          <strong>
            ${escapeHtml(
              member.national_id || "—"
            )}
          </strong>
        </div>

        <div>
          <span>Phone</span>
          <strong>
            ${escapeHtml(
              member.phone || "—"
            )}
          </strong>
        </div>

        <div>
          <span>Email</span>
          <strong>
            ${escapeHtml(
              member.email || "—"
            )}
          </strong>
        </div>

        <div>
          <span>Joined</span>
          <strong>
            ${escapeHtml(
              formatDate(member.join_date)
            )}
          </strong>
        </div>

      </div>

      <div class="member-card-contribution-status">
        ${contributionStatusHtml(member)}
      </div>

      <div class="member-card-actions">

        <button
          type="button"
          class="btn btn-secondary"
          data-action="view"
          data-member-id="${escapeHtml(id)}"
        >
          View
        </button>

        <button
          type="button"
          class="btn btn-secondary"
          data-action="edit"
          data-member-id="${escapeHtml(id)}"
        >
          Edit
        </button>

        <button
          type="button"
          class="btn btn-secondary"
          data-action="invite"
          data-member-id="${escapeHtml(id)}"
          ${invitationDisabled ? "disabled" : ""}
        >
          ${invitationLabel}
        </button>

      </div>

    </article>
  `;
}
/* =========================================================
   RENDER MEMBERS
   ========================================================= */

function renderMembers(list = members) {
  ensureNationalIdUI();
  ensureContributionStatusHeader();

  const rowsContainer =
    byId("memberRows");

  const cardsContainer =
    byId("memberCards");

  const rows =
    Array.isArray(list)
      ? list
      : [];

  if (rowsContainer) {
    if (!rows.length) {
      rowsContainer.innerHTML = `
        <tr>
          <td
            colspan="11"
            class="empty-state"
          >
            No members found.
          </td>
        </tr>
      `;
    } else {
      rowsContainer.innerHTML =
        rows
          .map(createMemberRow)
          .join("");
    }
  }

  if (cardsContainer) {
    if (!rows.length) {
      cardsContainer.innerHTML = `
        <div class="empty-state">
          No members found.
        </div>
      `;
    } else {
      cardsContainer.innerHTML =
        rows
          .map(createMemberCard)
          .join("");
    }
  }

  const resultCount =
    byId("memberResultCount");

  if (resultCount) {
    resultCount.textContent =
      rows.length === members.length
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
    members.filter(member =>
      String(member.status || "")
        .toLowerCase() === "active"
    ).length;

  const loginActive =
    members.filter(member =>
      getLoginStatus(member) === "Active"
    ).length;

  const invitations =
    members.filter(member =>
      getLoginStatus(member) ===
      "Invitation Sent"
    ).length;

  const noLogin =
    members.filter(member =>
      getLoginStatus(member) ===
      "No Login"
    ).length;

  const values = {
    memberCount: total,
    membersCount: total,
    activeMembers: active,
    inactiveMembers:
      total - active,
    loginMembers: loginActive,
    invitedMembers: invitations,
    noLoginMembers: noLogin
  };

  Object.entries(values)
    .forEach(([id, value]) => {
      const element = byId(id);

      if (element) {
        element.textContent =
          value.toLocaleString("en-KE");
      }
    });
}


/* =========================================================
   OPEN ADD MEMBER
   ========================================================= */

async function openAddMember() {
  editingMemberId = null;

  const panel =
    byId("addMemberPanel");

  if (panel) {
    panel.hidden = false;
  }

  const title =
    byId("addMemberTitle");

  if (title) {
    title.textContent =
      "Add Member";
  }

  const description =
    byId("addMemberDescription");

  if (description) {
    description.textContent =
      "Register a new member, set their contribution plan, and optionally record historical payments.";
  }

  const form =
    byId("addMemberForm");

  if (form) {
    form.reset();
  }

  ensureNationalIdUI();
  ensureContributionUI();

  const today =
    getToday();

  const joinDate =
    byId("memberJoinDate");

  if (joinDate) {
    joinDate.value =
      today;
  }

  const effectiveFrom =
    byId(
      "memberContributionEffectiveFrom"
    );

  if (effectiveFrom) {
    effectiveFrom.value =
      today;

    effectiveFrom.dataset.auto =
      "true";

    effectiveFrom.disabled =
      false;
  }

  const amount =
    byId("memberContributionAmount");

  if (amount) {
    amount.disabled =
      false;
  }

  const firstPeriodRule =
    byId("memberFirstPeriodRule");

  if (firstPeriodRule) {
    firstPeriodRule.disabled =
      false;
  }

  const historicalEnabled =
    byId("memberHistoricalEnabled");

  if (historicalEnabled) {
    if (
      "checked" in historicalEnabled
    ) {
      historicalEnabled.checked =
        false;
    }

    if (
      "value" in historicalEnabled
    ) {
      historicalEnabled.value =
        "false";
    }

    historicalEnabled.disabled =
      false;
  }

  const paidThrough =
    byId(
      "memberHistoricalPaidThrough"
    );

  if (paidThrough) {
    paidThrough.value =
      "";

    paidThrough.disabled =
      true;
  }

  const paymentMethod =
    byId(
      "memberHistoricalPaymentMethod"
    );

  if (paymentMethod) {
    paymentMethod.value =
      "Cash";

    paymentMethod.disabled =
      true;
  }

  updateHistoricalControls();

  if (panel) {
    panel.style.opacity =
      "1";
  }

  clearFormMessage();

  try {
    await loadMonthlyContributionType();

    if (
      currentGroup &&
      Number(
        currentGroup.monthly_contribution
      ) > 0 &&
      amount &&
      !amount.value
    ) {
      amount.value =
        Number(
          currentGroup.monthly_contribution
        );
    }

    updateContributionPreview();
    updateHistoricalPreview();

  } catch (error) {
    console.error(
      "Failed to prepare contribution setup:",
      error
    );

    showFormMessage(
      error?.message ||
      "Could not load contribution setup.",
      "error"
    );
  }

  const memberNumber =
    byId("memberNumber");

  if (memberNumber) {
    memberNumber.focus();
  }

  panel?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


/* =========================================================
   FORM VALUES
   ========================================================= */

function getFormValues() {
  const historicalElement =
    byId("memberHistoricalEnabled");

  const historicalEnabled =
    historicalElement?.checked === true ||
    historicalElement?.value === "true";

  return {
    memberNumber:
      String(
        byId("memberNumber")?.value || ""
      ).trim(),

    name:
      String(
        byId("memberName")?.value || ""
      ).trim(),

    nationalId:
      String(
        byId("memberNationalId")?.value || ""
      ).trim(),

    phone:
      String(
        byId("memberPhone")?.value || ""
      ).trim(),

    email:
      String(
        byId("memberEmail")?.value || ""
      )
        .trim()
        .toLowerCase(),

    role:
      byId("memberRole")?.value ||
      "member",

    status:
      byId("memberStatus")?.value ||
      "active",

    joinDate:
      byId("memberJoinDate")?.value ||
      getToday(),

    contributionAmount:
      Number(
        byId(
          "memberContributionAmount"
        )?.value || 0
      ),

    firstPeriodRule:
      byId(
        "memberFirstPeriodRule"
      )?.value ||
      "full_period",

    effectiveFrom:
      byId(
        "memberContributionEffectiveFrom"
      )?.value ||
      "",

    historicalEnabled,

    historicalPaidThrough:
      byId(
        "memberHistoricalPaidThrough"
      )?.value ||
      "",

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

function validateForm(values) {
  if (!values.memberNumber) {
    throw new Error(
      "Member number is required."
    );
  }

  if (!values.name) {
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

  if (!values.phone) {
    throw new Error(
      "Phone number is required."
    );
  }

  if (!groupId) {
    throw new Error(
      "Group ID is missing."
    );
  }

  if (editingMemberId) {
    return true;
  }

  if (!values.joinDate) {
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
      "A valid monthly contribution amount is required."
    );
  }

  if (
    !monthlyContributionType?.id
  ) {
    throw new Error(
      "Monthly contribution type is not available."
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

  if (!values.effectiveFrom) {
    throw new Error(
      "Contribution effective date is required."
    );
  }

  if (
    values.effectiveFrom <
    values.joinDate
  ) {
    throw new Error(
      "Contribution effective date cannot be before the join date."
    );
  }

  if (!values.historicalEnabled) {
    return true;
  }

  if (!values.historicalPaidThrough) {
    throw new Error(
      "Historical paid-through date is required."
    );
  }

  if (
    values.historicalPaidThrough >
    getToday()
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

  if (!firstHistoricalMonth) {
    throw new Error(
      "Could not determine the first historical contribution month."
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
  if (!groupId || !memberNumber) {
    return false;
  }

  let query =
    supabase
      .from("members")
      .select("id")
      .eq("group_id", groupId)
      .eq("member_number", memberNumber)
      .limit(1);

  if (editingMemberId) {
    query =
      query.neq(
        "id",
        editingMemberId
      );
  }

  const {
    data,
    error
  } = await query;

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

async function saveMember(event) {
  event?.preventDefault();

  clearFormMessage();

  const submitButton =
    byId("saveMemberButton") ||
    byId("memberSaveButton");

  try {
    const values =
      getFormValues();

    validateForm(values);

    const duplicate =
      await checkDuplicateMemberNumber(
        values.memberNumber
      );

    if (duplicate) {
      throw new Error(
        "A member with this member number already exists."
      );
    }

    if (submitButton) {
      submitButton.disabled =
        true;
    }

    /* -----------------------------------------------------
       EDIT EXISTING MEMBER
       ----------------------------------------------------- */

    if (editingMemberId) {
      const {
        error
      } = await supabase
        .from("members")
        .update({
          member_number:
            values.memberNumber,

          name:
            values.name,

          national_id:
            values.nationalId,

          phone:
            values.phone,

          email:
            values.email,

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
        );

      if (error) {
        throw error;
      }

      await loadMembers();
      await loadMemberContributionPositions();

      renderMembers();
      updateMemberCount();

      showStatus(
        "Member updated successfully."
      );

      closeAddMember();

      return;
    }


    /* -----------------------------------------------------
       CREATE NEW MEMBER
       ----------------------------------------------------- */

    let result = null;

    if (values.historicalEnabled) {
      const requestId =
        crypto.randomUUID();

      const {
        data,
        error
      } = await supabase.rpc(
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
            values.email,

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
      } = await supabase.rpc(
        "create_member_with_contribution_plan",
        {
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
            values.email,

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

    } catch (storageError) {
      console.warn(
        "Could not store onboarding event:",
        storageError
      );
    }


    /* -----------------------------------------------------
       REFRESH MEMBER DATA
       ----------------------------------------------------- */

    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();

    showFormMessage(
      `Member created successfully. ${contributionResultMessage(result)}`,
      "success"
    );

    closeAddMember();

  } catch (error) {
    console.error(
      "Failed to save member:",
      error
    );

    showFormMessage(
      error?.message ||
      "Failed to save member.",
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
  } = await supabase.rpc(
    "reconcile_member_historical_payments",
    {
      p_member_id:
        memberId,

      p_through_date:
        throughDate || null
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
   HANDLE HISTORICAL RECONCILIATION
   ========================================================= */

async function handleHistoricalReconciliation(
  memberId
) {
  const member =
    findMember(memberId);

  if (!member) {
    throw new Error(
      "Member could not be found."
    );
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
      memberId
    );

    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();

    showStatus("");

    openMemberModal(memberId);

  } catch (error) {
    console.error(
      "Historical reconciliation failed:",
      error
    );

    showError(error);
  }
}


/* =========================================================
   SEND MEMBER INVITATION
   ========================================================= */

async function sendMemberInvitation(
  memberId,
  reopenModal = false
) {
  const member =
    findMember(memberId);

  if (!member) {
    throw new Error(
      "Member could not be found."
    );
  }

  const email =
    String(member.email || "")
      .trim();

  if (!email) {
    throw new Error(
      "This member does not have an email address."
    );
  }

  const {
    data: sessionData,
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const session =
    sessionData?.session;

  if (!session) {
    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  const {
    data,
    error
  } = await supabase.functions.invoke(
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

  console.log(
    "Member invitation sent:",
    data
  );

  await loadMembers();

  await loadMemberContributionPositions();

  renderMembers();

  updateMemberCount();

  if (reopenModal) {
    openMemberModal(memberId);
  }

  return data;
}


/* =========================================================
   CLOSE ADD MEMBER
   ========================================================= */

function closeAddMember() {
  const panel =
    byId("addMemberPanel");

  if (panel) {
    panel.hidden = true;
  }

  editingMemberId = null;

  clearFormMessage();
}


/* =========================================================
   OPEN EDIT MEMBER
   ========================================================= */

function openEditMember(memberId) {
  const member =
    findMember(memberId);

  if (!member) {
    showError(
      "Member could not be found."
    );

    return;
  }

  editingMemberId =
    memberId;

  const panel =
    byId("addMemberPanel");

  if (panel) {
    panel.hidden = false;
  }

  const title =
    byId("addMemberTitle");

  if (title) {
    title.textContent =
      "Edit Member";
  }

  const description =
    byId("addMemberDescription");

  if (description) {
    description.textContent =
      "Update the member's profile details. Contribution accounting remains managed by the existing accounting system.";
  }

  const form =
    byId("addMemberForm");

  if (form) {
    form.reset();
  }

  ensureNationalIdUI();
  ensureContributionUI();

  const fields = {
    memberNumber:
      member.member_number || "",

    memberName:
      member.name || "",

    memberNationalId:
      member.national_id || "",

    memberPhone:
      member.phone || "",

    memberEmail:
      member.email || "",

    memberRole:
      member.role || "member",

    memberStatus:
      member.status || "active",

    memberJoinDate:
      member.join_date || ""
  };

  Object.entries(fields)
    .forEach(([id, value]) => {
      const element =
        byId(id);

      if (element) {
        element.value =
          value;
      }
    });

  const amount =
    byId(
      "memberContributionAmount"
    );

  const firstPeriodRule =
    byId(
      "memberFirstPeriodRule"
    );

  const effectiveFrom =
    byId(
      "memberContributionEffectiveFrom"
    );

  if (amount) {
    amount.disabled =
      true;
  }

  if (firstPeriodRule) {
    firstPeriodRule.disabled =
      true;
  }

  if (effectiveFrom) {
    effectiveFrom.disabled =
      true;
  }

  const historicalEnabled =
    byId(
      "memberHistoricalEnabled"
    );

  if (historicalEnabled) {
    if (
      "checked" in historicalEnabled
    ) {
      historicalEnabled.checked =
        false;
    }

    historicalEnabled.disabled =
      true;
  }

  updateHistoricalControls();

  clearFormMessage();

  const memberNumber =
    byId("memberNumber");

  if (memberNumber) {
    memberNumber.focus();
  }

  panel?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}
/* =========================================================
   MEMBER ACCOUNTING / CONTRIBUTION POSITION
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


/* =========================================================
   CONTRIBUTION POSITION UI
   ---------------------------------------------------------
   The current members.html already contains the
   Contribution Accounting section.

   Therefore:
   - Reuse #memberContributionPosition when present.
   - Reuse the existing viewContribution* fields.
   - Do not create a second accounting section.
   - Add Contribution Records only when it is missing.
   ========================================================= */

function ensureContributionPositionUI() {
  const modal =
    byId("memberModal");

  if (!modal) {
    return null;
  }

  let section =
    byId("memberContributionPosition");

  if (!section) {
    section =
      document.createElement("section");

    section.id =
      "memberContributionPosition";

    section.className =
      "member-contribution-position";

    section.innerHTML = `
      <div class="member-accounting-header">

        <div>
          <h3>
            Contribution Accounting
          </h3>

          <p>
            Current contribution position
          </p>
        </div>

        <span
          id="memberContributionPositionStatus"
          class="accounting-status status-unknown"
        >
          Loading...
        </span>

      </div>

      <div
        id="memberContributionPositionDescription"
        class="member-accounting-description"
      >
        Loading contribution information...
      </div>

      <div class="member-accounting-grid">

        <div class="accounting-metric due">

          <div class="metric-label">
            TOTAL DUE
          </div>

          <div
            id="memberContributionPositionDue"
            class="metric-value"
          >
            —
          </div>

          <div class="metric-help">
            Expected contribution
          </div>

        </div>


        <div class="accounting-metric contributed">

          <div class="metric-label">
            TOTAL CONTRIBUTED
          </div>

          <div
            id="memberContributionPositionAllocated"
            class="metric-value"
          >
            —
          </div>

          <div class="metric-help">
            Paid / allocated
          </div>

        </div>


        <div class="accounting-metric arrears">

          <div class="metric-label">
            TOTAL ARREARS
          </div>

          <div
            id="memberContributionPositionArrears"
            class="metric-value"
          >
            —
          </div>

          <div class="metric-help">
            Still outstanding
          </div>

        </div>


        <div class="accounting-metric credit">

          <div class="metric-label">
            TOTAL CREDIT
          </div>

          <div
            id="memberContributionPositionCredit"
            class="metric-value"
          >
            —
          </div>

          <div class="metric-help">
            Excess contribution
          </div>

        </div>


        <div class="accounting-metric records">

          <div class="metric-label">
            CONTRIBUTION RECORDS
          </div>

          <div
            id="memberContributionPositionRecords"
            class="metric-value"
          >
            —
          </div>

          <div class="metric-help">
            Recorded payments
          </div>

        </div>

      </div>
    `;

    const actions =
      modal.querySelector(
        ".modal-actions"
      );

    const details =
      modal.querySelector(
        ".member-detail-grid"
      );

    if (actions) {
      modal.insertBefore(
        section,
        actions
      );
    } else if (details) {
      details.insertAdjacentElement(
        "afterend",
        section
      );
    } else {
      modal.appendChild(section);
    }
  }

  /*
     The existing members.html has its own accounting
     fields. Reuse them.

     Only add a Contribution Records metric if the
     current HTML does not already provide one.
  */

  const existingRecords =
    byId("viewContributionRecords") ||
    byId("memberContributionPositionRecords");

  if (!existingRecords) {
    const recordsCard =
      document.createElement("div");

    recordsCard.className =
      "accounting-metric records";

    recordsCard.dataset.contributionRecordsCard =
      "true";

    recordsCard.innerHTML = `
      <div class="metric-label">
        CONTRIBUTION RECORDS
      </div>

      <div
        id="viewContributionRecords"
        class="metric-value"
      >
        —
      </div>

      <div class="metric-help">
        Recorded payments
      </div>
    `;

    const summaryContainer =
      section.querySelector(
        ".member-accounting-grid, .member-accounting-summary"
      );

    if (summaryContainer) {
      summaryContainer.appendChild(
        recordsCard
      );
    } else {
      section.appendChild(
        recordsCard
      );
    }
  }

  return section;
}


/* =========================================================
   CONTRIBUTION POSITION STYLES
   ========================================================= */

function ensureContributionPositionStyles() {
  if (
    byId(
      "memberContributionPositionStyles"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "memberContributionPositionStyles";

  style.textContent = `
    .member-contribution-position {
      margin-top: 22px;
      padding: 18px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      box-shadow:
        0 4px 14px
        rgba(15, 23, 42, 0.05);
    }

    .member-accounting-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 14px;
    }

    .member-accounting-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
    }

    .member-accounting-header p {
      margin: 4px 0 0;
      font-size: 13px;
      color: #64748b;
    }

    .accounting-status {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 30px;
      padding: 5px 11px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .03em;
      white-space: nowrap;
    }

    .accounting-status.status-arrears {
      background: #fee2e2;
      color: #b91c1c;
    }

    .accounting-status.status-credit {
      background: #ede9fe;
      color: #6d28d9;
    }

    .accounting-status.status-up-to-date {
      background: #dcfce7;
      color: #15803d;
    }

    .accounting-status.status-unknown {
      background: #f1f5f9;
      color: #64748b;
    }

    .member-accounting-description {
      margin-bottom: 16px;
      padding: 11px 13px;
      background: #f8fafc;
      border-radius: 10px;
      color: #475569;
      font-size: 13px;
      line-height: 1.5;
    }

    .member-accounting-grid {
      display: grid;
      grid-template-columns:
        repeat(5, minmax(0, 1fr));
      gap: 12px;
    }

    .accounting-metric {
      min-width: 0;
      padding: 15px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-top: 4px solid #94a3b8;
      border-radius: 12px;
    }

    .accounting-metric.due {
      border-top-color: #64748b;
    }

    .accounting-metric.contributed {
      border-top-color: #16a34a;
      background: #f0fdf4;
    }

    .accounting-metric.arrears {
      border-top-color: #dc2626;
      background: #fef2f2;
    }

    .accounting-metric.credit {
      border-top-color: #7c3aed;
      background: #f5f3ff;
    }

    .accounting-metric.records {
      border-top-color: #2563eb;
      background: #eff6ff;
    }

    .metric-label {
      margin-bottom: 8px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .04em;
      color: #64748b;
    }

    .metric-value {
      font-size: 20px;
      line-height: 1.2;
      font-weight: 900;
      color: #0f172a;
      word-break: break-word;
    }

    .accounting-metric.contributed
      .metric-value {
      color: #15803d;
    }

    .accounting-metric.arrears
      .metric-value {
      color: #dc2626;
    }

    .accounting-metric.credit
      .metric-value {
      color: #6d28d9;
    }

    .accounting-metric.records
      .metric-value {
      color: #2563eb;
    }

    /*
       Existing members.html accounting fields.
       These IDs are the primary display contract.
    */

    #viewContributionTotal {
      color: #15803d;
      font-weight: 900;
    }

    #viewContributionDue {
      color: #475569;
      font-weight: 900;
    }

    #viewContributionAllocated {
      color: #15803d;
      font-weight: 900;
    }

    #viewContributionArrears {
      color: #dc2626;
      font-weight: 900;
    }

    #viewContributionCredit {
      color: #6d28d9;
      font-weight: 900;
    }

    #viewContributionRecords,
    #memberContributionPositionRecords {
      color: #2563eb;
      font-weight: 900;
    }

    @media (max-width: 1000px) {
      .member-accounting-grid {
        grid-template-columns:
          repeat(3, minmax(0, 1fr));
      }
    }

    @media (max-width: 700px) {
      .member-accounting-grid {
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
      }

      .member-accounting-header {
        align-items: flex-start;
        flex-direction: column;
      }
    }

    @media (max-width: 480px) {
      .member-accounting-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}


/* =========================================================
   CONTRIBUTION POSITION LOADING
   ========================================================= */

function setContributionPositionLoading() {
  ensureContributionPositionUI();
  ensureContributionPositionStyles();

  const status =
    byId("viewContributionStatus") ||
    byId("memberContributionPositionStatus");

  const description =
    byId("viewContributionDescription") ||
    byId(
      "memberContributionPositionDescription"
    );

  if (status) {
    status.textContent =
      "Loading...";

    status.className =
      "accounting-status status-unknown";
  }

  if (description) {
    description.textContent =
      "Loading contribution position...";
  }

  const fields = [
    "viewContributionTotal",
    "viewContributionDue",
    "viewContributionAllocated",
    "viewContributionArrears",
    "viewContributionCredit",
    "viewContributionRecords",
    "memberContributionPositionDue",
    "memberContributionPositionAllocated",
    "memberContributionPositionArrears",
    "memberContributionPositionCredit",
    "memberContributionPositionRecords"
  ];

  fields.forEach(id => {
    const element =
      byId(id);

    if (element) {
      element.textContent =
        "—";
    }
  });
}


/* =========================================================
   CONTRIBUTION STATUS CLASS
   ========================================================= */

function contributionPositionStatusClass(
  status
) {
  const value =
    String(status || "")
      .trim()
      .toLowerCase();

  if (value === "arrears") {
    return "status-arrears";
  }

  if (value === "credit") {
    return "status-credit";
  }

  if (value === "up_to_date") {
    return "status-up-to-date";
  }

  return "status-unknown";
}
/* =========================================================
   LOAD SINGLE MEMBER CONTRIBUTION POSITION
   ---------------------------------------------------------
   READ-ONLY ACCOUNTING DISPLAY

   Canonical RPC:
     get_member_contribution_position(uuid)

   No contribution/payment write occurs here.
   ========================================================= */

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
  } = await supabase.rpc(
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
      "Contribution position was not returned."
    );
  }


  /* -------------------------------------------------------
     NORMALIZE READ-ONLY POSITION
     ------------------------------------------------------- */

  const rawStatus =
    String(
      position.status || ""
    )
      .trim()
      .toLowerCase();

  const due =
    Number(
      position.total_due ??
      position.due ??
      0
    );

  const contributed =
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


  /* -------------------------------------------------------
     DERIVE DISPLAY STATUS

     The numeric balances are used as a safe fallback
     when the RPC status is empty or inconsistent.
     ------------------------------------------------------- */

  let displayStatus =
    rawStatus;

  if (
    rawStatus === "arrears" ||
    arrears > 0
  ) {
    displayStatus =
      "arrears";

  } else if (
    rawStatus === "credit" ||
    credit > 0
  ) {
    displayStatus =
      "credit";

  } else if (
    rawStatus === "up_to_date"
  ) {
    displayStatus =
      "up_to_date";

  } else if (
    rawStatus === "plan_not_set"
  ) {
    displayStatus =
      "plan_not_set";
  }


  /* -------------------------------------------------------
     DISPLAY ELEMENTS

     Existing members.html IDs are preferred.
     Dynamic IDs remain supported as fallback.
     ------------------------------------------------------- */

  const statusElement =
    byId("viewContributionStatus") ||
    byId(
      "memberContributionPositionStatus"
    );

  const descriptionElement =
    byId("viewContributionDescription") ||
    byId(
      "memberContributionPositionDescription"
    );

  const totalElement =
    byId("viewContributionTotal") ||
    byId(
      "memberContributionPositionAllocated"
    );

  const dueElement =
    byId("viewContributionDue") ||
    byId(
      "memberContributionPositionDue"
    );

  const allocatedElement =
    byId("viewContributionAllocated");

  const fallbackAllocatedElement =
    byId(
      "memberContributionPositionAllocated"
    );

  const arrearsElement =
    byId("viewContributionArrears") ||
    byId(
      "memberContributionPositionArrears"
    );

  const creditElement =
    byId("viewContributionCredit") ||
    byId(
      "memberContributionPositionCredit"
    );

  const recordsElement =
    byId("viewContributionRecords") ||
    byId(
      "memberContributionPositionRecords"
    );


  /* -------------------------------------------------------
     STATUS TEXT
     ------------------------------------------------------- */

  let statusLabel =
    "UNAVAILABLE";

  let statusClass =
    "status-unknown";

  let description =
    "Contribution position is currently unavailable.";


  if (displayStatus === "arrears") {
    statusLabel =
      "ARREARS";

    statusClass =
      "status-arrears";

    description =
      `Paid ${formatMoney(contributed)} ` +
      `of ${formatMoney(due)} due. ` +
      `Remaining arrears: ${formatMoney(arrears)}.`;

  } else if (
    displayStatus === "credit"
  ) {
    statusLabel =
      "CREDIT";

    statusClass =
      "status-credit";

    description =
      `Contributed ${formatMoney(contributed)}. ` +
      `Credit balance: ${formatMoney(credit)}.`;

  } else if (
    displayStatus === "up_to_date"
  ) {
    statusLabel =
      "UP TO DATE";

    statusClass =
      "status-up-to-date";

    description =
      `Contributed ${formatMoney(contributed)} ` +
      `of ${formatMoney(due)} due. ` +
      `Member is up to date.`;

  } else if (
    displayStatus === "plan_not_set"
  ) {
    statusLabel =
      "PLAN NOT SET";

    statusClass =
      "status-unknown";

    description =
      "No contribution plan has been established for this member.";
  }


  /* -------------------------------------------------------
     RENDER STATUS
     ------------------------------------------------------- */

  if (statusElement) {
    statusElement.textContent =
      statusLabel;

    statusElement.className =
      `accounting-status ${statusClass}`;
  }


  /* -------------------------------------------------------
     RENDER DESCRIPTION
     ------------------------------------------------------- */

  if (descriptionElement) {
    descriptionElement.textContent =
      description;
  }


  /* -------------------------------------------------------
     RENDER TOTAL CONTRIBUTED
     ------------------------------------------------------- */

  if (totalElement) {
    totalElement.textContent =
      formatMoney(contributed);
  }


  /* -------------------------------------------------------
     RENDER TOTAL DUE
     ------------------------------------------------------- */

  if (dueElement) {
    dueElement.textContent =
      formatMoney(due);
  }


  /* -------------------------------------------------------
     RENDER ALLOCATED

     The existing HTML has both Total Contributed and
     Allocated. Both represent the contribution amount
     returned by the canonical read-only position.
     ------------------------------------------------------- */

  if (allocatedElement) {
    allocatedElement.textContent =
      formatMoney(contributed);
  }

  if (
    fallbackAllocatedElement &&
    fallbackAllocatedElement !==
      totalElement
  ) {
    fallbackAllocatedElement.textContent =
      formatMoney(contributed);
  }


  /* -------------------------------------------------------
     RENDER ARREARS
     ------------------------------------------------------- */

  if (arrearsElement) {
    arrearsElement.textContent =
      formatMoney(arrears);
  }


  /* -------------------------------------------------------
     RENDER CREDIT
     ------------------------------------------------------- */

  if (creditElement) {
    creditElement.textContent =
      formatMoney(credit);
  }


  /* -------------------------------------------------------
     RENDER CONTRIBUTION RECORDS
     ------------------------------------------------------- */

  if (recordsElement) {
    recordsElement.textContent =
      records.toLocaleString("en-KE");
  }


  /*
     Keep the local read-only cache synchronized.
     This does NOT write to Supabase.
  */

  contributionPositions.set(
    String(memberId),
    position
  );

  return position;
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

  try {
    return await loadMemberContributionPosition(
      memberId
    );

  } catch (error) {
    console.error(
      "Failed to refresh member contribution position:",
      error
    );

    throw error;
  }
}


/* =========================================================
   OPEN MEMBER MODAL
   ---------------------------------------------------------
   Uses the actual members.html modal:

     #memberModal

   Not #viewMemberModal.
   ========================================================= */

function openMemberModal(memberId) {
  ensureNationalIdUI();
  ensureContributionPositionUI();
  ensureContributionPositionStyles();

  const member =
    findMember(memberId);

  if (!member) {
    showError(
      "Member could not be found."
    );

    return;
  }

  const modal =
    byId("memberModal");

  if (!modal) {
    showError(
      "Member view modal could not be found."
    );

    return;
  }


  /* -------------------------------------------------------
     MEMBER DETAILS
     ------------------------------------------------------- */

  const fields = {
    viewMemberInitials:
      getInitials(
        member.name
      ),

    viewMemberName:
      member.name ||
      "—",

    viewMemberNumber:
      member.member_number ||
      "—",

    viewMembershipNumber:
      member.membership_number ||
      "—",

    viewMemberNationalId:
      member.national_id ||
      "—",

    viewMemberPhone:
      member.phone ||
      "—",

    viewMemberEmail:
      member.email ||
      "—",

    viewMemberRole:
      displayRole(
        member.role
      ),

    viewMemberStatus:
      String(
        member.status ||
        "unknown"
      )
        .replace(/_/g, " ")
        .toUpperCase(),

    viewMemberLoginStatus:
      getLoginStatus(member),

    viewMemberJoinDate:
      formatDate(
        member.join_date
      ),

    viewMemberGroup:
      currentGroup?.name ||
      "—"
  };


  Object.entries(fields)
    .forEach(([id, value]) => {
      const element =
        byId(id);

      if (element) {
        element.textContent =
          value;
      }
    });


  /* -------------------------------------------------------
     OPEN MODAL

     Explicit display override handles the current
     members.html inline display:none.
     ------------------------------------------------------- */

  modal.hidden = false;

  modal.style.display =
    "flex";

  modal.classList.add(
    "open"
  );

  document.body.classList.add(
    "modal-open"
  );


  /* -------------------------------------------------------
     CONTRIBUTION ACCOUNTING
     ------------------------------------------------------- */

  setContributionPositionLoading();

  loadMemberContributionPosition(
    member.id
  ).catch(error => {
    console.error(
      "Failed to load member contribution position:",
      error
    );

    const status =
      byId("viewContributionStatus") ||
      byId(
        "memberContributionPositionStatus"
      );

    const description =
      byId("viewContributionDescription") ||
      byId(
        "memberContributionPositionDescription"
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
        "Contribution position could not be loaded.";
    }
  });


  /* -------------------------------------------------------
     HISTORICAL RECONCILIATION BUTTON
     ------------------------------------------------------- */

  const actions =
    modal.querySelector(
      ".modal-actions"
    );

  if (actions) {
    let reconcileButton =
      actions.querySelector(
        "[data-action='reconcile']"
      );

    /*
       Current members.html already has this button.
       Only create it if the page does not contain one.
    */

    if (!reconcileButton) {
      reconcileButton =
        document.createElement("button");

      reconcileButton.type =
        "button";

      reconcileButton.className =
        "btn btn-secondary";

      reconcileButton.dataset.action =
        "reconcile";

      reconcileButton.textContent =
        "Reconcile Historical Payments";

      actions.prepend(
        reconcileButton
      );
    }

    reconcileButton.dataset.memberId =
      String(member.id);
  }


  /* -------------------------------------------------------
     FOCUS CLOSE CONTROL
     ------------------------------------------------------- */

  const closeButton =
    modal.querySelector(
      "[data-close-member-modal], .modal-close, #doneMemberModal"
    );

  if (closeButton) {
    closeButton.focus();
  }
}
/* =========================================================
   MEMBER SEARCH
   ========================================================= */

function filterMembers(searchTerm) {
  const term =
    String(searchTerm || "")
      .trim()
      .toLowerCase();

  if (!term) {
    return members;
  }

  return members.filter(member => {
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

    return values.some(value =>
      String(value || "")
        .toLowerCase()
        .includes(term)
    );
  });
}


/* =========================================================
   MEMBER ACTION HANDLER
   ========================================================= */

async function handleMemberAction(event) {
  const target =
    event.target.closest(
      "[data-action]"
    );

  if (!target) {
    return;
  }

  const action =
    target.dataset.action;

  const memberId =
    target.dataset.memberId;

  try {
    if (action === "view") {
      openMemberModal(
        memberId
      );

      return;
    }

    if (action === "edit") {
      openEditMember(
        memberId
      );

      return;
    }

    if (action === "invite") {
      target.disabled = true;

      await sendMemberInvitation(
        memberId,
        false
      );

      return;
    }

    if (action === "reconcile") {
      await handleHistoricalReconciliation(
        memberId
      );

      return;
    }

    if (action === "close") {
      closeMemberModal();

      return;
    }

  } catch (error) {
    console.error(
      "Member action failed:",
      error
    );

    showError(error);

  } finally {
    if (
      action === "invite"
    ) {
      target.disabled =
        false;
    }
  }
}


/* =========================================================
   CLOSE MEMBER MODAL
   ========================================================= */

function closeMemberModal() {
  const modal =
    byId("memberModal");

  if (!modal) {
    return;
  }

  modal.hidden = true;

  /*
     Current members.html contains an inline
     display:none. Restore that state explicitly.
  */

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
   EVENT BINDING
   ========================================================= */

function bindEvents() {
  if (eventsBound) {
    return;
  }


  /* -------------------------------------------------------
     ADD MEMBER
     ------------------------------------------------------- */

  const addButton =
    byId("addMemberButton") ||
    byId("addMember");

  if (addButton) {
    addButton.addEventListener(
      "click",
      openAddMember
    );
  }


  /* -------------------------------------------------------
     CLOSE ADD MEMBER
     ------------------------------------------------------- */

  const closeAddButton =
    byId("closeAddMember");

  if (closeAddButton) {
    closeAddButton.addEventListener(
      "click",
      closeAddMember
    );
  }


  /* -------------------------------------------------------
     CANCEL ADD MEMBER
     ------------------------------------------------------- */

  const cancelAddButton =
    byId("cancelAddMember");

  if (cancelAddButton) {
    cancelAddButton.addEventListener(
      "click",
      closeAddMember
    );
  }


  /* -------------------------------------------------------
     MEMBER FORM
     ------------------------------------------------------- */

  const form =
    byId("addMemberForm");

  if (form) {
    form.addEventListener(
      "submit",
      saveMember
    );
  }


  /* -------------------------------------------------------
     MEMBER SEARCH
     ------------------------------------------------------- */

  const searchInput =
    byId("memberSearch");

  if (searchInput) {
    searchInput.addEventListener(
      "input",
      event => {
        clearTimeout(
          memberSearchTimer
        );

        const value =
          event.target.value;

        memberSearchTimer =
          setTimeout(() => {
            const filtered =
              filterMembers(value);

            renderMembers(
              filtered
            );
          }, 150);
      }
    );
  }


  /* -------------------------------------------------------
     CLEAR SEARCH
     ------------------------------------------------------- */

  const clearSearch =
    byId("clearMemberSearch");

  if (clearSearch) {
    clearSearch.addEventListener(
      "click",
      () => {
        if (searchInput) {
          searchInput.value =
            "";
        }

        renderMembers(
          members
        );
      }
    );
  }


  /* -------------------------------------------------------
     TABLE ACTIONS
     ------------------------------------------------------- */

  const rowsContainer =
    byId("memberRows");

  if (rowsContainer) {
    rowsContainer.addEventListener(
      "click",
      handleMemberAction
    );
  }


  /* -------------------------------------------------------
     MOBILE CARD ACTIONS
     ------------------------------------------------------- */

  const cardsContainer =
    byId("memberCards");

  if (cardsContainer) {
    cardsContainer.addEventListener(
      "click",
      handleMemberAction
    );
  }


  /* -------------------------------------------------------
     MEMBER MODAL
     ------------------------------------------------------- */

  const modal =
    byId("memberModal");

  if (modal) {
    modal.addEventListener(
      "click",
      event => {
        if (
          event.target === modal
        ) {
          closeMemberModal();

          return;
        }

        handleMemberAction(
          event
        );
      }
    );

    const closeButtons =
      modal.querySelectorAll(
        "[data-action='close'], .modal-close, #doneMemberModal"
      );

    closeButtons.forEach(button => {
      button.addEventListener(
        "click",
        closeMemberModal
      );
    });
  }


  /* -------------------------------------------------------
     HISTORICAL CONTRIBUTIONS
     ------------------------------------------------------- */

  const historicalEnabled =
    byId(
      "memberHistoricalEnabled"
    );

  if (historicalEnabled) {
    historicalEnabled.addEventListener(
      "change",
      updateHistoricalControls
    );
  }


  const paidThrough =
    byId(
      "memberHistoricalPaidThrough"
    );

  if (paidThrough) {
    paidThrough.addEventListener(
      "change",
      updateHistoricalPreview
    );
  }


  /* -------------------------------------------------------
     CONTRIBUTION AMOUNT
     ------------------------------------------------------- */

  const contributionAmount =
    byId(
      "memberContributionAmount"
    );

  if (contributionAmount) {
    contributionAmount.addEventListener(
      "input",
      () => {
        updateContributionPreview();
        updateHistoricalPreview();
      }
    );
  }


  /* -------------------------------------------------------
     JOIN DATE
     ------------------------------------------------------- */

  const joinDate =
    byId("memberJoinDate");

  if (joinDate) {
    joinDate.addEventListener(
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
            joinDate.value;

          updateHistoricalPreview();
        }
      }
    );
  }


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

      const modal =
        byId("memberModal");

      const panel =
        byId("addMemberPanel");

      if (
        modal &&
        !modal.hidden
      ) {
        closeMemberModal();

      } else if (
        panel &&
        !panel.hidden
      ) {
        closeAddMember();
      }
    }
  );

  eventsBound = true;
}


/* =========================================================
   INITIALIZE MEMBERS PAGE
   ========================================================= */

export async function init() {
  if (initialized) {
    return;
  }

  initialized = true;

  try {
    clearError();

    showStatus(
      "Loading members..."
    );

    currentUser =
      await requireAuth();

    currentMember =
      await getMyMember();

    if (!currentMember?.group_id) {
      throw new Error(
        "Your account is not associated with a group."
      );
    }

    groupId =
      currentMember.group_id;

    currentGroup =
      await getMyGroup();

    if (!currentGroup) {
      throw new Error(
        "Group information could not be loaded."
      );
    }


    /* -------------------------------------------------------
       GROUP NAME
       ------------------------------------------------------- */

    const groupName =
      byId("membersGroupName");

    if (groupName) {
      groupName.textContent =
        currentGroup.name ||
        "Your Group";
    }


    /* -------------------------------------------------------
       PAGE UI
       ------------------------------------------------------- */

    ensureNationalIdUI();

    ensureContributionUI();

    ensureContributionStatusStyles();

    ensureContributionPositionUI();

    ensureContributionPositionStyles();


    /* -------------------------------------------------------
       CONTRIBUTION TYPE
       ------------------------------------------------------- */

    await loadMonthlyContributionType();


    /* -------------------------------------------------------
       MEMBERS
       ------------------------------------------------------- */

    await loadMembers();


    /* -------------------------------------------------------
       READ-ONLY CONTRIBUTION POSITIONS
       ------------------------------------------------------- */

    await loadMemberContributionPositions();


    /* -------------------------------------------------------
       RENDER
       ------------------------------------------------------- */

    renderMembers();

    updateMemberCount();


    /* -------------------------------------------------------
       EVENTS
       ------------------------------------------------------- */

    bindEvents();

    showStatus("");

  } catch (error) {
    console.error(
      "Failed to initialize members page:",
      error
    );

    initialized = false;

    showStatus("");

    showError(error);
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
    console.error(
      "Failed to refresh members:",
      error
    );

    showError(error);
  }
}


/* =========================================================
   PAGE EXPORT / BOOT
   ========================================================= */

export const loadPage =
  init;


console.log(
  "CHAMA LIVE: members.js ready"
);
