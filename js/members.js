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
   create_member_with_contribution_plan()
      ↓
   Initial obligations
      ↓
   Initial contribution status
      ↓
   Optional historical reconciliation

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

let monthlyContributionType = null;
let contributionTypesLoaded = false;


/* =========================================================
   BASIC HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
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
  const value = String(name || "").trim();

  if (!value) {
    return "M";
  }

  const parts =
    value.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
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
  const value = String(role || "member")
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
  const value = String(role || "member")
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
      ${escapeHtml(displayRole(role))}
    </span>
  `;
}

function accountStatusHtml(status) {
  const value = String(status || "active")
    .trim()
    .toLowerCase();

  if (value === "active") {
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

  if (member.activated_at) {
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

  if (status === "Active") {
    return `
      <span class="login-badge login-active">
        <span class="login-icon">✓</span>
        Active
      </span>
    `;
  }

  if (status === "Invitation Sent") {
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
   MESSAGES
========================================================= */

function showStatus(message) {
  const node = byId("status");

  if (!node) {
    return;
  }

  node.textContent = message || "";
  node.hidden = !message;
}

function showError(error) {
  console.error(
    "CHAMA LIVE: Members error",
    error
  );

  const node = byId("error");

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
    <div class="error-icon">!</div>

    <div>
      <strong>
        Something went wrong
      </strong>

      <div class="error-detail">
        ${escapeHtml(message)}
      </div>
    </div>
  `;

  node.hidden = false;
}

function clearError() {
  const node = byId("error");

  if (!node) {
    return;
  }

  node.innerHTML = "";
  node.hidden = true;
}

function showFormMessage(
  message,
  type = "success"
) {
  const node = byId("formMessage");

  if (!node) {
    return;
  }

  node.textContent =
    message || "";

  node.className =
    `form-message ${type}`;

  node.style.display =
    message ? "flex" : "none";
}

function clearFormMessage() {
  const node =
    byId("formMessage");

  if (!node) {
    return;
  }

  node.textContent = "";
  node.style.display = "none";
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
      document.createElement("div");

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

    if (anchor?.parentElement) {
      anchor.parentElement.insertBefore(
        field,
        anchor.nextElementSibling
      );
    } else {
      form
        .querySelector(
          ".member-form-grid"
        )
        ?.appendChild(field);
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
      document.createElement("th");

    th.dataset.nationalIdHeader =
      "true";

    th.textContent =
      "National ID";

    const memberHeader =
      [...headRow.children].find(
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
      headRow.appendChild(th);
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
      document.createElement("div");

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

    if (first?.nextElementSibling) {
      modalGrid.insertBefore(
        detail,
        first.nextElementSibling
      );
    } else {
      modalGrid.appendChild(detail);
    }
  }
}


/* =========================================================
   CONTRIBUTION SETUP UI
   ---------------------------------------------------------
   Dynamically adds the accounting fields so the current
   members.html does not have to be replaced at this stage.
========================================================= */

function ensureContributionUI() {
  const form =
    byId("addMemberForm");

  if (
    !form ||
    byId("memberContributionAmount")
  ) {
    return;
  }

  const wrapper =
    document.createElement("div");

  wrapper.id =
    "memberContributionSetup";

  wrapper.className =
    "member-contribution-setup";

  wrapper.innerHTML = `
    <div class="member-form-section-heading">
      <strong>
        Contribution Setup
      </strong>

      <span>
        Set what this member is expected
        to contribute.
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
          value="${escapeHtml(getToday())}"
          required
        >

        <small class="muted member-form-hint">
          The member's actual membership start date.
        </small>

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
          min="0.01"
          step="0.01"
          inputmode="decimal"
          placeholder="e.g. 200"
        >

        <small
          class="muted member-form-hint"
          id="memberContributionTypeHint"
        >
          Loading the group's Monthly contribution type...
        </small>

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
            Full joining month
          </option>

          <option value="next_full_period">
            Start from next full month
          </option>
        </select>

        <small class="muted member-form-hint">
          This determines when the first monthly
          obligation starts.
        </small>

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
        >

        <small class="muted member-form-hint">
          Defaults to the join date.
        </small>

      </div>

    </div>

    <div
      id="memberContributionPreview"
      class="member-contribution-preview"
      aria-live="polite"
    >
      <span class="preview-label">
        Initial contribution position
      </span>

      <strong id="memberContributionPreviewText">
        Complete the contribution setup.
      </strong>
    </div>
  `;

  const formGrid =
    form.querySelector(
      ".member-form-grid"
    );

  if (formGrid?.parentElement) {
    formGrid.parentElement.appendChild(
      wrapper
    );
  } else {
    form.appendChild(wrapper);
  }

  const joinDate =
    byId("memberJoinDate");

  const effectiveFrom =
    byId(
      "memberContributionEffectiveFrom"
    );

  if (joinDate && effectiveFrom) {
    effectiveFrom.value =
      joinDate.value;

    effectiveFrom.dataset.auto =
      "true";

    joinDate.addEventListener(
      "change",
      () => {
        if (
          !effectiveFrom.value ||
          effectiveFrom.dataset.auto ===
            "true"
        ) {
          effectiveFrom.value =
            joinDate.value;

          effectiveFrom.dataset.auto =
            "true";
        }

        updateContributionPreview();
      }
    );

    effectiveFrom.addEventListener(
      "input",
      () => {
        effectiveFrom.dataset.auto =
          "false";
      }
    );
  }

  byId(
    "memberContributionAmount"
  )?.addEventListener(
    "input",
    updateContributionPreview
  );

  byId(
    "memberFirstPeriodRule"
  )?.addEventListener(
    "change",
    updateContributionPreview
  );
}

function updateContributionPreview() {
  const amount =
    Number(
      byId(
        "memberContributionAmount"
      )?.value || 0
    );

  const joinDate =
    byId("memberJoinDate")
      ?.value || "";

  const rule =
    byId(
      "memberFirstPeriodRule"
    )?.value ||
    "full_period";

  const node =
    byId(
      "memberContributionPreviewText"
    );

  if (!node) {
    return;
  }

  if (
    !amount ||
    amount <= 0
  ) {
    node.textContent =
      "Enter the monthly contribution amount.";
    return;
  }

  if (!joinDate) {
    node.textContent =
      "Select the member's join date.";
    return;
  }

  if (
    rule === "next_full_period"
  ) {
    node.textContent =
      `KSh ${amount.toLocaleString(
        "en-KE",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      )} per month, beginning with the next full month.`;
  } else {
    node.textContent =
      `KSh ${amount.toLocaleString(
        "en-KE",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      )} per month, beginning with the joining month.`;
  }
}


/* =========================================================
   CONTRIBUTION TYPE
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
      "No group is associated with this account."
    );
  }

  const result =
    await supabase
      .from("contribution_types")
      .select(
        "id, group_id, name, code"
      )
      .eq(
        "group_id",
        groupId
      )
      .or(
        "code.eq.monthly,name.ilike.Monthly"
      )
      .limit(1);

  if (result.error) {
    throw result.error;
  }

  const rows =
    Array.isArray(result.data)
      ? result.data
      : [];

  monthlyContributionType =
    rows[0] || null;

  contributionTypesLoaded =
    true;

  const hint =
    byId(
      "memberContributionTypeHint"
    );

  if (hint) {
    if (monthlyContributionType) {
      hint.textContent =
        `Contribution type: ${
          monthlyContributionType.name ||
          "Monthly"
        }`;
    } else {
      hint.textContent =
        "No Monthly contribution type is configured for this group.";
    }
  }

  return monthlyContributionType;
}


/* =========================================================
   MEMBERS
========================================================= */

async function loadMembers() {
  if (!groupId) {
    throw new Error(
      "No group is associated with this account."
    );
  }

  const result =
    await supabase
      .from("members")
      .select(`
        id,
        group_id,
        user_id,
        auth_user_id,
        member_number,
        membership_number,
        national_id,
        name,
        phone,
        email,
        role,
        join_date,
        status,
        onboarding_status,
        invited_at,
        activated_at,
        created_at
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "created_at",
        {
          ascending: true
        }
      );

  if (result.error) {
    throw result.error;
  }

  members =
    Array.isArray(result.data)
      ? result.data
      : [];

  return members;
}


/* =========================================================
   TABLE ROW
========================================================= */

function createMemberRow(member) {
  const id =
    escapeHtml(member.id);

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
    getLoginStatus(member);

  const hasEmail =
    Boolean(
      String(
        member.email || ""
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
    loginStatus === "Active"
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
    loginStatus === "Invitation Sent"
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
  } else if (hasEmail) {
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
   MOBILE MEMBER CARD
========================================================= */

function createMemberCard(member) {
  const id =
    escapeHtml(member.id);

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
      "Member"
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
    getLoginStatus(member);

  let invitationButton = `
    <button
      type="button"
      class="mobile-action disabled-action"
      disabled
    >
      ✉ No Email
    </button>
  `;

  if (
    member.email &&
    loginStatus === "Active"
  ) {
    invitationButton = `
      <button
        type="button"
        class="mobile-action disabled-action"
        disabled
      >
        ✓ Account Active
      </button>
    `;
  } else if (
    member.email &&
    loginStatus === "Invitation Sent"
  ) {
    invitationButton = `
      <button
        type="button"
        class="mobile-action invite-mobile"
        data-action="invite"
        data-member-id="${id}"
      >
        ↻ Resend
      </button>
    `;
  } else if (
    member.email
  ) {
    invitationButton = `
      <button
        type="button"
        class="mobile-action invite-mobile"
        data-action="invite"
        data-member-id="${id}"
      >
        ✉ Invite
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

          <div class="member-avatar large">
            ${escapeHtml(
              getInitials(
                member.name
              )
            )}
          </div>

          <div>

            <h3>
              ${name}
            </h3>

            <div class="member-card-number">
              #${memberNumber}
            </div>

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

        <div class="member-info-item">
          <span class="info-label">
            Membership No.
          </span>

          <strong>
            ${membershipNumber}
          </strong>
        </div>

        <div class="member-info-item">
          <span class="info-label">
            National ID
          </span>

          <strong>
            ${nationalId}
          </strong>
        </div>

        <div class="member-info-item">
          <span class="info-label">
            Phone
          </span>

          <strong>
            ${phone}
          </strong>
        </div>

        <div class="member-info-item full">
          <span class="info-label">
            Email
          </span>

          <strong class="mobile-email">
            ${email}
          </strong>
        </div>

        <div class="member-info-item">
          <span class="info-label">
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

      <div class="member-card-actions">

        <button
          type="button"
          class="mobile-action view-mobile"
          data-action="view"
          data-member-id="${id}"
        >
          ◉ View
        </button>

        <button
          type="button"
          class="mobile-action edit-mobile"
          data-action="edit"
          data-member-id="${id}"
        >
          ✎ Edit
        </button>

        ${invitationButton}

      </div>

    </article>
  `;
}


/* =========================================================
   RENDER
========================================================= */

function renderMembers(
  list = members
) {
  ensureNationalIdUI();

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
            .map(createMemberRow)
            .join("")
        : `
          <tr>
            <td
              colspan="10"
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
            .map(createMemberCard)
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
    byId("memberResultCount");

  if (count) {
    count.textContent =
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
    members.filter(
      member =>
        String(
          member.status || ""
        ).toLowerCase() ===
        "active"
    ).length;

  const loginActive =
    members.filter(
      member =>
        getLoginStatus(member) ===
        "Active"
    ).length;

  const invitations =
    members.filter(
      member =>
        getLoginStatus(member) ===
        "Invitation Sent"
    ).length;

  const noLogin =
    members.filter(
      member =>
        getLoginStatus(member) ===
        "No Login"
    ).length;

  const values = {
    memberCount: total,
    membersCount: total,
    activeMembers: active,
    inactiveMembers:
      total - active,
    loginMembers:
      loginActive,
    invitedMembers:
      invitations,
    noLoginMembers:
      noLogin
  };

  Object.entries(values)
    .forEach(
      ([id, value]) => {
        const node = byId(id);

        if (node) {
          node.textContent =
            String(value);
        }
      }
    );
}


/* =========================================================
   ADD MEMBER
========================================================= */

async function openAddMember() {
  editingMemberId = null;

  const panel =
    byId("addMemberPanel");

  const title =
    byId("memberFormTitle");

  const description =
    byId(
      "memberFormDescription"
    );

  const form =
    byId("addMemberForm");

  if (panel) {
    panel.hidden = false;
  }

  if (title) {
    title.textContent =
      "Add Member";
  }

  if (description) {
    description.textContent =
      "Register a new member and set their contribution plan.";
  }

  if (form) {
    form.reset();
  }

  ensureNationalIdUI();
  ensureContributionUI();

  const today =
    getToday();

  const joinDate =
    byId("memberJoinDate");

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

function closeMemberForm() {
  editingMemberId = null;

  byId(
    "addMemberPanel"
  )?.setAttribute(
    "hidden",
    ""
  );

  byId(
    "addMemberForm"
  )?.reset();

  clearFormMessage();
}


/* =========================================================
   EDIT MEMBER
========================================================= */

function openEditMember(
  memberId
) {
  const member =
    findMember(memberId);

  if (!member) {
    return showError(
      new Error(
        "Member could not be found."
      )
    );
  }

  editingMemberId =
    memberId;

  ensureNationalIdUI();
  ensureContributionUI();

  const panel =
    byId("addMemberPanel");

  if (panel) {
    panel.hidden = false;
  }

  if (
    byId("memberFormTitle")
  ) {
    byId(
      "memberFormTitle"
    ).textContent =
      "Edit Member";
  }

  if (
    byId(
      "memberFormDescription"
    )
  ) {
    byId(
      "memberFormDescription"
    ).textContent =
      "Update the member information.";
  }

  const values = {
    memberNumber:
      member.member_number ||
      member.membership_number ||
      "",

    memberName:
      member.name ||
      "",

    memberNationalId:
      member.national_id ||
      "",

    memberPhone:
      member.phone ||
      "",

    memberEmail:
      member.email ||
      "",

    memberRole:
      member.role ||
      "member",

    memberStatus:
      member.status ||
      "active",

    memberJoinDate:
      member.join_date ||
      getToday()
  };

  Object.entries(values)
    .forEach(
      ([id, value]) => {
        const node =
          byId(id);

        if (node) {
          node.value =
            value;
        }
      }
    );

  const effectiveFrom =
    byId(
      "memberContributionEffectiveFrom"
    );

  if (effectiveFrom) {
    effectiveFrom.value =
      member.join_date ||
      getToday();

    effectiveFrom.disabled =
      true;
  }

  const amount =
    byId(
      "memberContributionAmount"
    );

  if (amount) {
    amount.value = "";
    amount.disabled = true;
  }

  const firstPeriod =
    byId(
      "memberFirstPeriodRule"
    );

  if (firstPeriod) {
    firstPeriod.disabled =
      true;
  }

  const setup =
    byId(
      "memberContributionSetup"
    );

  if (setup) {
    setup.style.opacity =
      "0.7";
  }

  clearFormMessage();

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
      value("memberNumber"),

    name:
      value("memberName"),

    nationalId:
      value("memberNationalId"),

    phone:
      value("memberPhone"),

    email:
      String(
        byId("memberEmail")
          ?.value || ""
      )
        .trim()
        .toLowerCase(),

    role:
      byId("memberRole")
        ?.value ||
      "member",

    status:
      byId("memberStatus")
        ?.value ||
      "active",

    joinDate:
      value("memberJoinDate") ||
      getToday(),

    contributionAmount:
      amountRaw
        ? Number(amountRaw)
        : 0,

    firstPeriodRule:
      byId(
        "memberFirstPeriodRule"
      )?.value ||
      "full_period",

    effectiveFrom:
      value(
        "memberContributionEffectiveFrom"
      )
  };
}


/* =========================================================
   VALIDATION
========================================================= */

function validateForm(values) {
  if (!values.memberNumber) {
    throw new Error(
      "Please enter the member number."
    );
  }

  if (!values.name) {
    throw new Error(
      "Please enter the member's full name."
    );
  }

  if (
    !values.nationalId &&
    !editingMemberId
  ) {
    throw new Error(
      "Please enter the member's National ID."
    );
  }

  if (!values.phone) {
    throw new Error(
      "Please enter the member's phone number."
    );
  }

  if (!groupId) {
    throw new Error(
      "No group is associated with this account."
    );
  }

  if (editingMemberId) {
    return;
  }

  if (!values.joinDate) {
    throw new Error(
      "Please enter the member's join date."
    );
  }

  if (
    !Number.isFinite(
      values.contributionAmount
    ) ||
    values.contributionAmount <= 0
  ) {
    throw new Error(
      "Please enter a valid monthly contribution amount."
    );
  }

  if (
    !monthlyContributionType?.id
  ) {
    throw new Error(
      "This group does not have a Monthly contribution type configured."
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
      "Please select a valid first contribution period."
    );
  }

  if (!values.effectiveFrom) {
    throw new Error(
      "Please enter the contribution effective date."
    );
  }

  if (
    values.effectiveFrom <
    values.joinDate
  ) {
    throw new Error(
      "The contribution effective date cannot be before the member's join date."
    );
  }
}


/* =========================================================
   DUPLICATE MEMBER NUMBER
========================================================= */

async function checkDuplicateMemberNumber(
  memberNumber
) {
  let query =
    supabase
      .from("members")
      .select("id")
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "member_number",
        memberNumber
      );

  if (editingMemberId) {
    query =
      query.neq(
        "id",
        editingMemberId
      );
  }

  const result =
    await query.limit(1);

  if (result.error) {
    throw result.error;
  }

  return (
    Array.isArray(
      result.data
    ) &&
    result.data.length > 0
  );
}


/* =========================================================
   CONTRIBUTION STATUS
========================================================= */

function contributionStatusLabel(
  status
) {
  const value =
    String(
      status || ""
    ).toLowerCase();

  if (
    value === "up_to_date"
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
    value === "plan_not_set"
  ) {
    return "PLAN NOT SET";
  }

  return (
    value
      .replace(/_/g, " ")
      .toUpperCase()
  );
}

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

function contributionResultMessage(
  result
) {
  const status =
    contributionStatusLabel(
      result?.contribution_status
    );

  const arrears =
    Number(
      result?.arrears || 0
    );

  const credit =
    Number(
      result?.credit || 0
    );

  const due =
    Number(
      result?.total_due || 0
    );

  const allocated =
    Number(
      result?.total_allocated || 0
    );

  if (
    status === "ARREARS"
  ) {
    return `
      Member added successfully.
      Contribution status: ARREARS.
      Due ${formatMoney(due)},
      allocated ${formatMoney(allocated)},
      arrears ${formatMoney(arrears)}.
    `;
  }

  if (
    status === "CREDIT"
  ) {
    return `
      Member added successfully.
      Contribution status: CREDIT.
      Credit available:
      ${formatMoney(credit)}.
    `;
  }

  if (
    status === "UP TO DATE"
  ) {
    return `
      Member added successfully.
      Contribution status: UP TO DATE.
    `;
  }

  return `
    Member added successfully.
    Contribution plan has been created.
  `;
}


/* =========================================================
   READ-ONLY CONTRIBUTION POSITION
   ---------------------------------------------------------
   This function only reads the current accounting position.

   It does NOT:
   - create payments
   - create allocations
   - reconcile historical payments
   - modify obligations
========================================================= */

function ensureContributionPositionUI() {
  const modal =
    byId("memberModal");

  if (
    !modal ||
    byId("memberContributionPosition")
  ) {
    return;
  }

  const section =
    document.createElement("section");

  section.id =
    "memberContributionPosition";

  section.className =
    "member-contribution-position";

  section.innerHTML = `
    <div class="member-contribution-position-header">

      <div>
        <span class="member-detail-label">
          Contribution Position
        </span>

        <strong>
          Current accounting position
        </strong>
      </div>

      <span
        id="viewContributionStatus"
        class="contribution-status-badge"
      >
        Loading...
      </span>

    </div>

    <p
      id="viewContributionDescription"
      class="member-contribution-description"
      aria-live="polite"
    >
      Loading contribution position...
    </p>

    <div class="contribution-position-grid">

      <div class="contribution-metric">
        <span>
          Total Due
        </span>

        <strong id="viewContributionDue">
          —
        </strong>
      </div>

      <div class="contribution-metric">
        <span>
          Allocated
        </span>

        <strong id="viewContributionAllocated">
          —
        </strong>
      </div>

      <div class="contribution-metric">
        <span>
          Arrears
        </span>

        <strong id="viewContributionArrears">
          —
        </strong>
      </div>

      <div class="contribution-metric">
        <span>
          Credit
        </span>

        <strong id="viewContributionCredit">
          —
        </strong>
      </div>

    </div>
  `;

  const detailGrid =
    modal.querySelector(
      ".member-detail-grid"
    );

  const modalActions =
    modal.querySelector(
      ".member-modal-actions, " +
      ".modal-actions, " +
      ".member-actions"
    );

  if (modalActions) {
    modal.insertBefore(
      section,
      modalActions
    );

    return;
  }

  if (detailGrid?.parentElement) {
    detailGrid.parentElement.appendChild(
      section
    );

    return;
  }

  modal
    .querySelector(
      ".member-modal-content, " +
      ".modal-content"
    )
    ?.appendChild(section);
}

function setContributionPositionLoading(
  message = "Loading contribution position..."
) {
  ensureContributionPositionUI();

  const status =
    byId(
      "viewContributionStatus"
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
      "contribution-status-badge";
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
      message;
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

async function loadMemberContributionPosition(
  memberId
) {
  ensureContributionPositionUI();

  setContributionPositionLoading();

  const result =
    await supabase.rpc(
      "get_member_contribution_position",
      {
        p_member_id:
          memberId
      }
    );

  if (result.error) {
    throw result.error;
  }

  const position =
    Array.isArray(
      result.data
    )
      ? result.data[0]
      : result.data;

  if (!position) {
    throw new Error(
      "No contribution position was returned for this member."
    );
  }

  const status =
    byId(
      "viewContributionStatus"
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

  const statusLabel =
    contributionStatusLabel(
      position.status
    );

  if (status) {
    status.textContent =
      statusLabel;

    status.className =
      `contribution-status-badge ${contributionPositionStatusClass(
        position.status
      )}`;
  }

  if (due) {
    due.textContent =
      formatMoney(
        position.total_due
      );
  }

  if (allocated) {
    allocated.textContent =
      formatMoney(
        position.total_allocated
      );
  }

  if (arrears) {
    arrears.textContent =
      formatMoney(
        position.arrears
      );
  }

  if (credit) {
    credit.textContent =
      formatMoney(
        position.credit
      );
  }

  if (description) {
    description.textContent =
      `Expected ${formatMoney(
        position.total_due
      )} · Allocated ${formatMoney(
        position.total_allocated
      )}. This position is read-only. Historical reconciliation is a separate action.`;
  }

  return position;
}


/* =========================================================
   SAVE MEMBER
========================================================= */

async function saveMember(
  event
) {
  event.preventDefault();

  clearError();
  clearFormMessage();

  const button =
    byId("saveMemberButton");

  const wasEditing =
    Boolean(editingMemberId);

  try {
    const values =
      getFormValues();

    if (!wasEditing) {
      await loadMonthlyContributionType();
    }

    validateForm(values);

    if (button) {
      button.disabled =
        true;

      button.textContent =
        wasEditing
          ? "Updating..."
          : "Creating...";
    }

    if (
      await checkDuplicateMemberNumber(
        values.memberNumber
      )
    ) {
      throw new Error(
        `Member number ${values.memberNumber} is already registered in this group.`
      );
    }


    /* -------------------------------------------------------
       EDIT EXISTING MEMBER
       -------------------------------------------------------
       Editing remains a normal member update.
       It does not alter contribution rules or payments.
    ------------------------------------------------------- */

    if (wasEditing) {
      const payload = {
        member_number:
          values.memberNumber,

        membership_number:
          values.memberNumber,

        national_id:
          values.nationalId ||
          null,

        name:
          values.name,

        phone:
          values.phone,

        email:
          values.email ||
          null,

        role:
          values.role,

        status:
          values.status
      };

      const result =
        await supabase
          .from("members")
          .update(payload)
          .eq(
            "id",
            editingMemberId
          )
          .eq(
            "group_id",
            groupId
          );

      if (result.error) {
        throw result.error;
      }

      showFormMessage(
        "Member updated successfully.",
        "success"
      );

      await loadMembers();

      renderMembers();

      updateMemberCount();

      setTimeout(
        closeMemberForm,
        900
      );

      return;
    }


    /* -------------------------------------------------------
       NEW MEMBER
       -------------------------------------------------------
       All member + contribution setup work is delegated
       to the database transaction.
    ------------------------------------------------------- */

    const memberPayload = {
      member_number:
        values.memberNumber,

      membership_number:
        values.memberNumber,

      national_id:
        values.nationalId ||
        null,

      name:
        values.name,

      phone:
        values.phone,

      email:
        values.email ||
        null,

      role:
        values.role,

      status:
        values.status,

      onboarding_status:
        "pending",

      join_date:
        values.joinDate
    };

    const contributionPlan = [
      {
        contribution_type_id:
          monthlyContributionType.id,

        amount:
          values.contributionAmount,

        frequency:
          "monthly",

        effective_from:
          values.effectiveFrom ||
          values.joinDate,

        effective_to:
          null,

        first_period_rule:
          values.firstPeriodRule,

        status:
          "active"
      }
    ];

    showStatus(
      "Creating member and contribution plan..."
    );

    const result =
      await supabase.rpc(
        "create_member_with_contribution_plan",
        {
          p_member:
            memberPayload,

          p_contribution_plan:
            contributionPlan
        }
      );

    if (result.error) {
      throw result.error;
    }

    const returned =
      Array.isArray(result.data)
        ? result.data[0]
        : result.data;

    if (!returned?.member_id) {
      throw new Error(
        "The member was not created because the server returned no member record."
      );
    }


    /* -------------------------------------------------------
       NEW-MEMBER ONBOARDING EVENT
    ------------------------------------------------------- */

    sessionStorage.setItem(
      "chama_live_getting_started_event",
      "new-member"
    );


    /* -------------------------------------------------------
       SHOW INITIAL ACCOUNTING POSITION
    ------------------------------------------------------- */

    showFormMessage(
      contributionResultMessage(
        returned
      ),
      "success"
    );

    showStatus("");


    /* -------------------------------------------------------
       REFRESH MEMBER LIST
    ------------------------------------------------------- */

    await loadMembers();

    renderMembers();

    updateMemberCount();


    /* -------------------------------------------------------
       KEEP FORM OPEN BRIEFLY SO THE USER CAN SEE
       THE ACCOUNTING RESULT.
    ------------------------------------------------------- */

    setTimeout(
      closeMemberForm,
      1800
    );

  } catch (error) {
    console.error(
      "CHAMA LIVE: save member failed",
      error
    );

    showStatus("");

    showFormMessage(
      error?.message ||
        String(error),
      "error"
    );
  } finally {
    if (button) {
      button.disabled =
        false;

      button.textContent =
        wasEditing
          ? "Save Changes"
          : "Save Member";
    }
  }
}


/* =========================================================
   HISTORICAL RECONCILIATION
   ---------------------------------------------------------
   IMPORTANT:
   This remains the ONLY explicit mutating accounting action
   from the member modal.
========================================================= */

async function reconcileMemberHistoricalPayments(
  memberId,
  throughDate = null
) {
  const member =
    findMember(memberId);

  if (!member) {
    throw new Error(
      "Member could not be found."
    );
  }

  const result =
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

  if (result.error) {
    throw result.error;
  }

  const data =
    Array.isArray(result.data)
      ? result.data[0]
      : result.data;

  if (!data) {
    throw new Error(
      "Historical reconciliation returned no result."
    );
  }

  return data;
}

async function handleHistoricalReconciliation(
  memberId,
  button
) {
  clearError();

  const member =
    findMember(memberId);

  if (!member) {
    return showError(
      new Error(
        "Member could not be found."
      )
    );
  }

  const confirmed =
    window.confirm(
      `Reconcile existing Monthly payments for ${member.name || "this member"} against their contribution obligations?\n\nNo new payment will be created. Existing payments will be allocated to outstanding obligations.`
    );

  if (!confirmed) {
    return;
  }

  const original =
    button?.textContent ||
    "Reconcile";

  try {
    if (button) {
      button.disabled =
        true;

      button.textContent =
        "Reconciling...";
    }

    showStatus(
      `Reconciling historical payments for ${
        member.name || "member"
      }...`
    );

    const result =
      await reconcileMemberHistoricalPayments(
        memberId
      );

    await loadMembers();

    renderMembers();

    updateMemberCount();

    showStatus(
      `${contributionStatusLabel(
        result.status
      )}: ${result.allocations_created || 0} allocation(s) created.`
    );

    await openMemberModal(
      memberId
    );

    setTimeout(
      () =>
        showStatus(""),
      5000
    );

  } catch (error) {
    showStatus("");

    showError(error);

  } finally {
    if (button) {
      button.disabled =
        false;

      button.textContent =
        original;
    }
  }
}


/* =========================================================
   INVITATIONS
========================================================= */

async function sendMemberInvitation(
  memberId,
  button
) {
  clearError();

  const member =
    findMember(memberId);

  if (!member) {
    return showError(
      new Error(
        "Member could not be found."
      )
    );
  }

  const email =
    String(
      member.email || ""
    )
      .trim()
      .toLowerCase();

  if (!email) {
    return showError(
      new Error(
        "This member does not have an email address. Edit the member and add an email first."
      )
    );
  }

  const original =
    button?.textContent ||
    "Invite";

  try {
    if (button) {
      button.disabled =
        true;

      button.textContent =
        "Sending...";
    }

    showStatus(
      `Sending login invitation to ${email}...`
    );

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
        "Your login session has expired. Please sign in again."
      );
    }

    const result =
      await supabase.functions.invoke(
        "send-member-invitation",
        {
          body: {
            member_id:
              member.id
          }
        }
      );

    if (result.error) {
      throw result.error;
    }

    if (
      result.data?.success ===
        false ||
      result.data?.error
    ) {
      throw new Error(
        result.data.error ||
          result.data.message ||
          "The invitation was rejected by the server."
      );
    }

    await loadMembers();

    renderMembers();

    updateMemberCount();

    showStatus(
      `Invitation sent successfully to ${email}.`
    );

    const modal =
      byId("memberModal");

    if (
      modal &&
      !modal.hidden
    ) {
      await openMemberModal(
        member.id
      );
    }

    setTimeout(
      () =>
        showStatus(""),
      3500
    );

  } catch (error) {
    showStatus("");

    showError(error);

  } finally {
    if (button) {
      button.disabled =
        false;

      const updated =
        findMember(
          memberId
        );

      button.textContent =
        updated &&
        getLoginStatus(
          updated
        ) ===
          "Invitation Sent"
          ? "↻ Resend"
          : original;
    }
  }
}


/* =========================================================
   MEMBER MODAL
========================================================= */

async function openMemberModal(
  memberId
) {
  const member =
    findMember(memberId);

  if (!member) {
    return showError(
      new Error(
        "Member could not be found."
      )
    );
  }

  ensureNationalIdUI();
  ensureContributionPositionUI();

  const values = {
    viewMemberName:
      member.name ||
      "Member",

    viewMemberNumber:
      member.member_number ||
      "—",

    viewMembershipNumber:
      member.membership_number ||
      member.member_number ||
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

    viewMemberJoinDate:
      formatDate(
        member.join_date
      ),

    viewMemberGroup:
      currentGroup?.name ||
      currentGroup?.group_name ||
      "Current Group"
  };

  const initials =
    byId(
      "viewMemberInitials"
    );

  if (initials) {
    initials.textContent =
      getInitials(
        member.name
      );
  }

  Object.entries(values)
    .forEach(
      ([id, value]) => {
        const node =
          byId(id);

        if (node) {
          node.textContent =
            value;
        }
      }
    );

  const role =
    byId(
      "viewMemberRole"
    );

  if (role) {
    role.innerHTML =
      roleBadgeHtml(
        member.role
      );
  }

  const status =
    byId(
      "viewMemberStatus"
    );

  if (status) {
    status.innerHTML =
      accountStatusHtml(
        member.status
      );
  }

  const login =
    byId(
      "viewMemberLoginStatus"
    );

  if (login) {
    login.innerHTML =
      loginStatusHtml(
        member
      );
  }


  /* -------------------------------------------------------
     OPEN MODAL BEFORE ASYNC ACCOUNTING LOAD
     -------------------------------------------------------
     This allows the user to see the member details while
     the read-only accounting position is loading.
  ------------------------------------------------------- */

  const modal =
    byId("memberModal");

  if (!modal) {
    return;
  }

  modal.hidden =
    false;

  modal.style.display =
    "flex";

  document.body.classList.add(
    "modal-open"
  );


  /* -------------------------------------------------------
     READ-ONLY CONTRIBUTION POSITION
     -------------------------------------------------------
     IMPORTANT:
     This is a read-only RPC.

     It does NOT call:
       reconcile_member_historical_payments()

     Historical reconciliation remains separate.
  ------------------------------------------------------- */

  try {
    await loadMemberContributionPosition(
      member.id
    );

  } catch (error) {
    console.error(
      "CHAMA LIVE: contribution position load failed",
      error
    );

    const status =
      byId(
        "viewContributionStatus"
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
        "Unavailable";

      status.className =
        "contribution-status-badge status-unknown";
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
        error?.message ||
        "Contribution position could not be loaded.";
    }
  }


  /* -------------------------------------------------------
     HISTORICAL RECONCILIATION CONTROL
     -------------------------------------------------------
     This remains an explicit user action.
  ------------------------------------------------------- */

  let reconciliationButton =
    byId(
      "reconcileHistoricalPayments"
    );

  if (!reconciliationButton) {
    const modalActions =
      document.querySelector(
        "#memberModal .member-modal-actions, " +
        "#memberModal .modal-actions, " +
        "#memberModal .member-actions"
      );

    if (modalActions) {
      reconciliationButton =
        document.createElement("button");

      reconciliationButton.type =
        "button";

      reconciliationButton.id =
        "reconcileHistoricalPayments";

      reconciliationButton.className =
        "member-action";

      reconciliationButton.textContent =
        "Reconcile Contributions";

      modalActions.appendChild(
        reconciliationButton
      );
    }
  }

  if (reconciliationButton) {
    reconciliationButton.dataset.memberId =
      member.id;

    reconciliationButton.dataset.action =
      "reconcile";
  }

  setTimeout(
    () =>
      byId(
        "closeMemberModal"
      )?.focus(),
    50
  );
}

function closeMemberModal() {
  const modal =
    byId("memberModal");

  if (!modal) {
    return;
  }

  modal.hidden =
    true;

  modal.style.display =
    "none";

  document.body.classList.remove(
    "modal-open"
  );
}


/* =========================================================
   SEARCH
========================================================= */

function handleSearch(
  event
) {
  const query =
    String(
      event.target.value ||
        ""
    )
      .trim()
      .toLowerCase();

  if (!query) {
    return renderMembers();
  }

  const filtered =
    members.filter(
      member =>
        [
          member.member_number,
          member.membership_number,
          member.national_id,
          member.name,
          member.phone,
          member.email,
          member.role,
          member.status,
          member.onboarding_status
        ]
          .filter(
            value =>
              value !== null &&
              value !== undefined
          )
          .join(" ")
          .toLowerCase()
          .includes(query)
    );

  renderMembers(
    filtered
  );
}


/* =========================================================
   ACTION HANDLER
========================================================= */

function handleTableAction(
  event
) {
  const button =
    event.target.closest(
      "[data-action]"
    );

  if (!button) {
    return;
  }

  const memberId =
    button.getAttribute(
      "data-member-id"
    );

  const action =
    button.getAttribute(
      "data-action"
    );

  if (
    action ===
      "reconcile"
  ) {
    const modalMemberId =
      button.dataset.memberId;

    if (modalMemberId) {
      handleHistoricalReconciliation(
        modalMemberId,
        button
      );
    }

    return;
  }

  if (!memberId) {
    return;
  }

  if (
    action === "view"
  ) {
    openMemberModal(
      memberId
    );

  } else if (
    action === "edit"
  ) {
    openEditMember(
      memberId
    );

  } else if (
    action === "invite"
  ) {
    sendMemberInvitation(
      memberId,
      button
    );
  }
}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {
  if (eventsBound) {
    return;
  }

  eventsBound = true;

  byId(
    "addMemberButton"
  )?.addEventListener(
    "click",
    openAddMember
  );

  byId(
    "closeAddMember"
  )?.addEventListener(
    "click",
    closeMemberForm
  );

  byId(
    "cancelAddMember"
  )?.addEventListener(
    "click",
    closeMemberForm
  );

  byId(
    "addMemberForm"
  )?.addEventListener(
    "submit",
    saveMember
  );

  byId(
    "memberSearch"
  )?.addEventListener(
    "input",
    handleSearch
  );

  byId(
    "clearMemberSearch"
  )?.addEventListener(
    "click",
    () => {
      const search =
        byId(
          "memberSearch"
        );

      if (search) {
        search.value = "";
      }

      renderMembers();
    }
  );

  byId(
    "memberRows"
  )?.addEventListener(
    "click",
    handleTableAction
  );

  byId(
    "memberCards"
  )?.addEventListener(
    "click",
    handleTableAction
  );

  byId(
    "memberModal"
  )?.addEventListener(
    "click",
    event => {
      if (
        event.target ===
        byId("memberModal")
      ) {
        closeMemberModal();
      }
    }
  );

  byId(
    "closeMemberModal"
  )?.addEventListener(
    "click",
    closeMemberModal
  );

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key ===
        "Escape"
      ) {
        closeMemberModal();
        closeMemberForm();
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

    await loadMonthlyContributionType();

    await loadMembers();

    renderMembers();

    updateMemberCount();

    bindEvents();

    showStatus("");

  } catch (error) {
    initialized =
      false;

    showStatus("");

    showError(error);
  }
}


/* =========================================================
   REFRESH
========================================================= */

export async function refreshMembers() {
  if (!groupId) {
    return;
  }

  try {
    await loadMembers();

    renderMembers();

    updateMemberCount();

  } catch (error) {
    showError(error);
  }
}


/* =========================================================
   PAGE ALIAS
========================================================= */

export const loadPage =
  init;


console.log(
  "CHAMA LIVE: members.js ready"
);
