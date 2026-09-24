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
    <tr data-member-id="${id}">
      <td>
        <div class="member-name-cell">
          <div class="member-avatar">
            ${escapeHtml(
              getInitials(
                member.name
              )
            )}
          </div>

          <div class="member-name-details">
            <strong>
              ${name}
            </strong>

            <span>
              ${phone}
            </span>
          </div>
        </div>
      </td>

      <td>
        ${memberNumber}
      </td>

      <td>
        ${membershipNumber}
      </td>

      <td>
        ${nationalId}
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
        ${contributionStatusHtml(
          member
        )}
      </td>

      <td>
        <div class="member-actions">
          <button
            type="button"
            class="member-action"
            data-action="view"
            data-member-id="${id}"
          >
            View
          </button>

          <button
            type="button"
            class="member-action"
            data-action="edit"
            data-member-id="${id}"
          >
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
      "Unnamed member"
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

  const initials =
    escapeHtml(
      getInitials(
        member.name
      )
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
        Active
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
        ${
          loginStatus ===
          "Invitation Sent"
            ? "Resend"
            : "Invite"
        }
      </button>
    `;
  }

  return `
    <article
      class="member-card"
      data-member-id="${id}"
    >
      <div class="member-card-header">

        <div class="member-card-profile">
          <div class="member-avatar">
            ${initials}
          </div>

          <div>
            <h3>
              ${name}
            </h3>

            <p>
              Member No. ${memberNumber}
            </p>
          </div>
        </div>

        ${accountStatusHtml(
          member.status
        )}

      </div>

      <div class="member-card-body">

        <div class="member-card-detail">
          <span>
            Membership No.
          </span>

          <strong>
            ${membershipNumber}
          </strong>
        </div>

        <div class="member-card-detail">
          <span>
            National ID
          </span>

          <strong>
            ${nationalId}
          </strong>
        </div>

        <div class="member-card-detail">
          <span>
            Phone
          </span>

          <strong>
            ${phone}
          </strong>
        </div>

        <div class="member-card-detail">
          <span>
            Email
          </span>

          <strong>
            ${email}
          </strong>
        </div>

        <div class="member-card-detail">
          <span>
            Role
          </span>

          <strong>
            ${displayRole(
              member.role
            )}
          </strong>
        </div>

        <div class="member-card-detail">
          <span>
            Login
          </span>

          <strong>
            ${loginStatus}
          </strong>
        </div>

        <div class="member-card-contribution-status">
          ${contributionStatusHtml(
            member
          )}
        </div>

      </div>

      <div class="member-card-actions">

        <button
          type="button"
          class="member-action"
          data-action="view"
          data-member-id="${id}"
        >
          View
        </button>

        <button
          type="button"
          class="member-action"
          data-action="edit"
          data-member-id="${id}"
        >
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
    byId(
      "memberRows"
    );

  const cards =
    byId(
      "memberCards"
    );

  if (tbody) {
    tbody.innerHTML = "";

    if (
      !list.length
    ) {
      tbody.innerHTML = `
        <tr>
          <td
            colspan="9"
            class="empty-state"
          >
            No members found.
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML =
        list
          .map(
            member =>
              createMemberRow(
                member
              )
          )
          .join("");
    }
  }

  if (cards) {
    cards.innerHTML = "";

    if (
      !list.length
    ) {
      cards.innerHTML = `
        <div class="empty-state">
          No members found.
        </div>
      `;
    } else {
      cards.innerHTML =
        list
          .map(
            member =>
              createMemberCard(
                member
              )
          )
          .join("");
    }
  }

  const resultCount =
    byId(
      "memberResultCount"
    );

  if (resultCount) {
    resultCount.textContent =
      `${list.length} ${
        list.length === 1
          ? "member"
          : "members"
      }`;
  }

  updateMemberCount(
    list
  );
}


/* =========================================================
   MEMBER COUNTS
========================================================= */

function updateMemberCount(
  list = members
) {
  const total =
    list.length;

  const active =
    list.filter(
      member =>
        String(
          member.status ||
          ""
        ).toLowerCase() ===
        "active"
    ).length;

  const loginMembers =
    list.filter(
      member =>
        getLoginStatus(
          member
        ) === "Active"
    ).length;

  const noLoginMembers =
    list.filter(
      member =>
        getLoginStatus(
          member
        ) === "No Login"
    ).length;

  const totalNodes = [
    byId("memberCount"),
    byId("membersCount")
  ];

  totalNodes.forEach(
    node => {
      if (node) {
        node.textContent =
          String(total);
      }
    }
  );

  const activeNode =
    byId(
      "activeMembers"
    );

  if (activeNode) {
    activeNode.textContent =
      String(active);
  }

  const loginNode =
    byId(
      "loginMembers"
    );

  if (loginNode) {
    loginNode.textContent =
      String(loginMembers);
  }

  const noLoginNode =
    byId(
      "noLoginMembers"
    );

  if (noLoginNode) {
    noLoginNode.textContent =
      String(noLoginMembers);
  }
}


/* =========================================================
   SEARCH / FILTER
========================================================= */

function filterMembers(
  query
) {
  const value =
    String(
      query || ""
    )
      .trim()
      .toLowerCase();

  if (!value) {
    renderMembers(
      members
    );

    return;
  }

  const filtered =
    members.filter(
      member => {
        const searchable = [
          member.name,
          member.member_number,
          member.membership_number,
          member.national_id,
          member.phone,
          member.email,
          member.role,
          member.status
        ]
          .map(
            item =>
              String(
                item || ""
              ).toLowerCase()
          )
          .join(" ");

        return searchable.includes(
          value
        );
      }
    );

  renderMembers(
    filtered
  );
}


/* =========================================================
   FORM RESET
========================================================= */

function resetMemberForm() {
  const form =
    byId(
      "addMemberForm"
    );

  if (
    form &&
    typeof form.reset ===
      "function"
  ) {
    form.reset();
  }

  const nationalId =
    byId(
      "memberNationalId"
    );

  if (nationalId) {
    nationalId.value =
      "";
  }

  const status =
    byId(
      "memberStatus"
    );

  if (status) {
    status.value =
      "active";
  }

  const role =
    byId(
      "memberRole"
    );

  if (role) {
    role.value =
      "member";
  }

  const joinDate =
    byId(
      "memberJoinDate"
    );

  if (joinDate) {
    joinDate.value =
      getToday();
  }

  const historical =
    byId(
      "memberHistoricalEnabled"
    );

  if (historical) {
    historical.value =
      "false";
  }

  const contributionAmount =
    byId(
      "memberContributionAmount"
    );

  if (
    contributionAmount &&
    !contributionAmount.value
  ) {
    contributionAmount.value =
      "0";
  }

  editingMemberId =
    null;

  clearFormMessage();

  updateContributionPreview();
  updateHistoricalControls();
}


/* =========================================================
   OPEN ADD MEMBER FORM
========================================================= */

function openAddMemberForm() {
  resetMemberForm();

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
      "Add a new member and configure their contribution plan.";
  }

  const panel =
    byId(
      "addMemberPanel"
    );

  if (panel) {
    panel.hidden =
      false;
  }

  const name =
    byId(
      "memberName"
    );

  if (name) {
    name.focus();
  }
}


/* =========================================================
   CLOSE ADD MEMBER FORM
========================================================= */

function closeAddMemberForm() {
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
      member.email || ""
    )
      .trim()
      .toLowerCase();

  if (!email) {
    throw new Error(
      "This member does not have an email address."
    );
  }

  try {
    showStatus(
      "Sending member invitation..."
    );

    const {
      data,
      error
    } = await supabase.rpc(
      "invite_member",
      {
        p_member_id:
          member.id
      }
    );

    if (error) {
      throw error;
    }

    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();

    showStatus(
      "Invitation sent successfully."
    );

    if (reopenModal) {
      await openMemberModal(
        member.id
      );
    }

    return data;

  } catch (error) {
    showError(
      error
    );

    throw error;

  } finally {
    setTimeout(
      () => {
        showStatus("");
      },
      3000
    );
  }
}


/* =========================================================
   OPEN EDIT MEMBER
========================================================= */

function openEditMember(
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
      "Member not found."
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
      "Update the member's details.";
  }

  const setValue =
    (
      id,
      value
    ) => {
      const node =
        byId(id);

      if (node) {
        node.value =
          value ??
          "";
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
      ? String(
          member.join_date
        ).slice(0, 10)
      : ""
  );

  const contributionSetup =
    byId(
      "memberContributionSetup"
    );

  if (contributionSetup) {
    contributionSetup.hidden =
      true;
  }

  clearFormMessage();

  byId(
    "memberName"
  )?.focus();

  panel?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


/* =========================================================
   CONTRIBUTION POSITION UI
========================================================= */

function ensureContributionPositionUI() {
  const panel =
    byId(
      "memberContributionPosition"
    );

  /*
     The current members.html already owns this DOM.

     Do not create a second static Contribution Position
     section. The function only returns the existing section.
  */
  if (panel) {
    return panel;
  }

  return null;
}


/* =========================================================
   LOAD MEMBER CONTRIBUTION POSITION
========================================================= */

async function loadMemberContributionPosition(
  memberId
) {
  if (!memberId) {
    return null;
  }

  const panel =
    ensureContributionPositionUI();

  if (!panel) {
    return null;
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

  const status =
    contributionStatusLabel(
      position?.status
    );

  const totalDue =
    Number(
      position?.total_due ??
      position?.due ??
      0
    );

  const totalAllocated =
    Number(
      position?.total_allocated ??
      position?.allocated ??
      0
    );

  const arrears =
    Number(
      position?.arrears ||
      0
    );

  const credit =
    Number(
      position?.credit ||
      0
    );

  const statusNode =
    byId(
      "viewContributionStatus"
    );

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

  const descriptionNode =
    byId(
      "viewContributionDescription"
    );

  if (statusNode) {
    statusNode.textContent =
      status ||
      "UNAVAILABLE";
  }

  if (totalNode) {
    totalNode.textContent =
      formatMoney(
        totalDue
      );
  }

  if (dueNode) {
    dueNode.textContent =
      formatMoney(
        totalDue
      );
  }

  if (allocatedNode) {
    allocatedNode.textContent =
      formatMoney(
        totalAllocated
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

  if (descriptionNode) {
    if (
      arrears > 0
    ) {
      descriptionNode.textContent =
        `Member has ${formatMoney(
          arrears
        )} in contribution arrears.`;
    } else if (
      credit > 0
    ) {
      descriptionNode.textContent =
        `Member has ${formatMoney(
          credit
        )} in contribution credit.`;
    } else {
      descriptionNode.textContent =
        "Contribution position is up to date.";
    }
  }

  return position;
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
        String(
          item.id
        ) ===
        String(
          memberId
        )
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
      "Member details modal was not found."
    );
    return;
  }

  const setText =
    (
      id,
      value
    ) => {
      const node =
        byId(id);

      if (node) {
        node.textContent =
          value ??
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
      "—"
  );

  const reconciliationButton =
    byId(
      "reconcileHistoricalPayments"
    );

  if (
    reconciliationButton
  ) {
    reconciliationButton.dataset.memberId =
      member.id;
  }

  const modalDone =
    byId(
      "doneMemberModal"
    );

  if (modalDone) {
    modalDone.dataset.memberId =
      member.id;
  }

  modal.hidden =
    false;

  modal.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.classList.add(
    "modal-open"
  );

  try {
    await loadMemberContributionPosition(
      member.id
    );
  } catch (error) {
    console.error(
      "CHAMA LIVE: Could not load member contribution position",
      error
    );

    const description =
      byId(
        "viewContributionDescription"
      );

    if (description) {
      description.textContent =
        "Contribution position could not be loaded.";
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

  modal.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.classList.remove(
    "modal-open"
  );
}


/* =========================================================
   SEARCH
========================================================= */

function handleMemberSearch(
  event
) {
  const query =
    event?.target?.value ||
    "";

  window.clearTimeout(
    memberSearchTimer
  );

  memberSearchTimer =
    window.setTimeout(
      () => {
        filterMembers(
          query
        );
      },
      250
    );
}


/* =========================================================
   CLEAR SEARCH
========================================================= */

function clearMemberSearch() {
  const input =
    byId(
      "memberSearch"
    );

  if (input) {
    input.value =
      "";
  }

  filterMembers(
    ""
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

  if (!memberId) {
    return;
  }

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
    openEditMember(
      memberId
    );
    return;
  }

  if (
    action ===
    "invite"
  ) {
    try {
      await sendMemberInvitation(
        memberId
      );
    } catch {
      /* sendMemberInvitation handles UI error */
    }

    return;
  }

  if (
    action ===
    "reconcile"
  ) {
    await handleHistoricalReconciliation(
      memberId
    );
  }
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
   - No duplicate UI section.
   - Current members.html owns #memberContributionPosition.
========================================================= */


/* ---------------------------------------------------------
   CONTRIBUTION POSITION UI
--------------------------------------------------------- */

function ensureContributionPositionUI() {
  const panel =
    byId(
      "memberContributionPosition"
    );

  /*
     members.html already contains the contribution-position
     section.

     Do not create another copy dynamically.
  */
  return panel || null;
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
    .member-accounting-panel {
      margin-top: 18px;
    }

    .member-accounting-summary {
      display: grid;
      grid-template-columns:
        repeat(4, minmax(0, 1fr));
      gap: 10px;
    }

    .accounting-mini-card {
      min-width: 0;
      padding: 13px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      background: #ffffff;
    }

    .accounting-mini-card span {
      display: block;
      margin-bottom: 6px;
      color: #64748b;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .04em;
    }

    .accounting-mini-card strong {
      display: block;
      color: #0f172a;
      font-size: 15px;
      font-weight: 800;
    }

    @media (max-width: 700px) {
      .member-accounting-summary {
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 480px) {
      .member-accounting-summary {
        grid-template-columns: 1fr;
      }
    }
  `;

  document.head.appendChild(
    style
  );
}


/* ---------------------------------------------------------
   CONTRIBUTION POSITION LOADING STATE
--------------------------------------------------------- */

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
      "Loading…";
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
      "Loading contribution position…";
  }
}


/* ---------------------------------------------------------
   CONTRIBUTION POSITION STATUS CLASS
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
    value ===
    "up_to_date"
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

  /*
     Canonical read-only accounting RPC.

     Do not replace this with direct reads from:
       contributions
       contribution_allocations
       contribution_obligations
  */
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
      position.arrears ||
      0
    );

  const credit =
    Number(
      position.credit ||
      0
    );

  const total =
    Number(
      position.total_due ??
      position.due ??
      0
    );

  const statusNode =
    byId(
      "viewContributionStatus"
    );

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

  const descriptionNode =
    byId(
      "viewContributionDescription"
    );

  if (statusNode) {
    statusNode.textContent =
      contributionStatusLabel(
        status
      );

    statusNode.className =
      `member-contribution-status ${
        contributionPositionStatusClass(
          status
        )
      }`;
  }

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

  if (descriptionNode) {
    if (
      arrears > 0
    ) {
      descriptionNode.textContent =
        `Member has ${formatMoney(
          arrears
        )} in contribution arrears.`;
    } else if (
      credit > 0
    ) {
      descriptionNode.textContent =
        `Member has ${formatMoney(
          credit
        )} in contribution credit.`;
    } else {
      descriptionNode.textContent =
        "Member contribution position is up to date.";
    }
  }

  return position;
}


/* =========================================================
   MEMBER MODAL
========================================================= */

async function openMemberModal(
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
      "Member not found."
    );
    return;
  }

  /*
     IMPORTANT:
     Current members.html uses #memberModal.
     The old #viewMemberModal reference must not return.
  */
  const modal =
    byId(
      "memberModal"
    );

  if (!modal) {
    showError(
      "Member details modal was not found."
    );
    return;
  }

  const setText =
    (
      id,
      value
    ) => {
      const node =
        byId(id);

      if (node) {
        node.textContent =
          value ??
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
      "—"
  );

  const reconciliationButton =
    byId(
      "reconcileHistoricalPayments"
    );

  if (
    reconciliationButton
  ) {
    reconciliationButton.dataset.memberId =
      member.id;
  }

  const doneButton =
    byId(
      "doneMemberModal"
    );

  if (doneButton) {
    doneButton.dataset.memberId =
      member.id;
  }

  setContributionPositionLoading();

  modal.hidden =
    false;

  modal.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.classList.add(
    "modal-open"
  );

  try {
    await loadMemberContributionPosition(
      member.id
    );
  } catch (error) {
    console.error(
      "CHAMA LIVE: Could not load member contribution position",
      error
    );

    const description =
      byId(
        "viewContributionDescription"
      );

    if (description) {
      description.textContent =
        "Contribution position could not be loaded.";
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

  modal.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.classList.remove(
    "modal-open"
  );
}
/* =========================================================
   MEMBER SEARCH
========================================================= */

function handleMemberSearch(
  event
) {
  const query =
    event?.target?.value ||
    "";

  clearTimeout(
    memberSearchTimer
  );

  memberSearchTimer =
    setTimeout(
      () => {
        const filtered =
          filterMembers(
            query
          );

        renderMembers(
          filtered
        );
      },
      150
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
      action === "view"
    ) {
      await openMemberModal(
        memberId
      );

      return;
    }

    if (
      action === "edit"
    ) {
      await openEditMember(
        memberId
      );

      return;
    }

    if (
      action === "invite"
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
      action === "reconcile"
    ) {
      await handleHistoricalReconciliation(
        memberId
      );

      return;
    }

    if (
      action === "close"
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
      action === "invite"
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

  modal.setAttribute(
    "aria-hidden",
    "true"
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
    );

  addButton?.addEventListener(
    "click",
    openAddMember
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
    handleMemberSearch
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

  if (modal) {
    modal.addEventListener(
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
  }

  const closeModalButton =
    byId(
      "closeMemberModal"
    );

  closeModalButton?.addEventListener(
    "click",
    closeMemberModal
  );

  const doneModalButton =
    byId(
      "doneMemberModal"
    );

  doneModalButton?.addEventListener(
    "click",
    closeMemberModal
  );

  const reconciliationButton =
    byId(
      "reconcileHistoricalPayments"
    );

  reconciliationButton?.addEventListener(
    "click",
    async event => {
      const memberId =
        event.currentTarget
          ?.dataset
          ?.memberId;

      if (!memberId) {
        return;
      }

      await handleHistoricalReconciliation(
        memberId
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

  eventsBound =
    true;
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

    ensureContributionPositionUI();

    ensureContributionPositionStyles();

    await loadMonthlyContributionType();

    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();

    if (!eventsBound) {
      bindEvents();
    }

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
