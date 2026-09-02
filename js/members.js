/* =========================================================
   CHAMA LIVE — MEMBERS
   Pilot-ready members management
   National ID support
========================================================= */

import { supabase } from "./supabase.js";
import { requireAuth, getMyMember, getMyGroup } from "./auth.js";

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let groupId = null;
let members = [];
let editingMemberId = null;
let initialized = false;
let eventsBound = false;

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";

  return String(value)
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

function getInitials(name) {
  const value = String(name || "").trim();

  if (!value) return "M";

  const parts = value.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
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
    value.charAt(0).toUpperCase() + value.slice(1)
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
        value.charAt(0).toUpperCase() + value.slice(1)
      )}
    </span>
  `;
}

function getLoginStatus(member) {
  if (!member) return "No Login";

  if (member.activated_at) {
    return "Active";
  }

  const onboarding = String(
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
  const status = getLoginStatus(member);

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

function showStatus(message) {
  const node = byId("status");

  if (!node) return;

  node.textContent = message || "";
  node.hidden = !message;
}

function showError(error) {
  console.error(
    "CHAMA LIVE: Members error",
    error
  );

  const node = byId("error");

  if (!node) return;

  const message =
    typeof error === "string"
      ? error
      : error?.message ||
        String(
          error || "Something went wrong."
        );

  node.innerHTML = `
    <div class="error-icon">!</div>
    <div>
      <strong>Something went wrong</strong>
      <div class="error-detail">
        ${escapeHtml(message)}
      </div>
    </div>
  `;

  node.hidden = false;
}

function clearError() {
  const node = byId("error");

  if (!node) return;

  node.innerHTML = "";
  node.hidden = true;
}

function showFormMessage(
  message,
  type = "success"
) {
  const node = byId("formMessage");

  if (!node) return;

  node.textContent = message || "";
  node.className = `form-message ${type}`;
  node.style.display = message
    ? "flex"
    : "none";
}

function clearFormMessage() {
  const node = byId("formMessage");

  if (!node) return;

  node.textContent = "";
  node.style.display = "none";
}

function findMember(memberId) {
  return members.find(
    member =>
      String(member.id) ===
      String(memberId)
  );
}

/* =========================================================
   NATIONAL ID UI
   Existing members may remain blank.
   New members must provide National ID.
========================================================= */

function ensureNationalIdUI() {
  const form = byId("addMemberForm");
  const memberNumber = byId("memberNumber");

  /*
    Add National ID field dynamically so the existing
    members.html structure does not have to be changed.
  */
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

  /*
    Add National ID column to the existing
    Members table.
  */
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

  /*
    Add National ID to the member detail modal.
  */
  const modalGrid =
    document.querySelector(
      ".member-detail-grid"
    );

  if (
    modalGrid &&
    !byId("viewMemberNationalId")
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
      .eq("group_id", groupId)
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
              getInitials(member.name)
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
    loginStatus ===
      "Invitation Sent"
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

function openAddMember() {
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
      "Register a new member in your group.";
  }

  if (form) {
    form.reset();
  }

  clearFormMessage();

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
      "active"
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

  clearFormMessage();

  panel?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function getFormValues() {
  const value = id =>
    byId(id)?.value?.trim() ||
    "";

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
      "active"
  };
}

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

  /*
    National ID is mandatory only for NEW
    members. Existing members who were
    created before this requirement may
    remain blank until edited.
  */
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
}

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

    validateForm(values);

    if (button) {
      button.disabled =
        true;

      button.textContent =
        wasEditing
          ? "Updating..."
          : "Saving...";
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

    if (wasEditing) {
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
    } else {
      const result =
        await supabase
          .from("members")
          .insert({
            ...payload,
            group_id:
              groupId,

            onboarding_status:
              "pending",

            join_date:
              new Date()
                .toISOString()
                .slice(
                  0,
                  10
                )
          });

      if (result.error) {
        throw result.error;
      }

      showFormMessage(
        values.email
          ? "Member added successfully. You can now send the login invitation."
          : "Member added successfully. Add an email address before sending a login invitation.",
        "success"
      );
    }

    await loadMembers();

    renderMembers();

    updateMemberCount();

    setTimeout(
      closeMemberForm,
      900
    );
  } catch (error) {
    console.error(
      "CHAMA LIVE: save member failed",
      error
    );

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
      openMemberModal(
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

function openMemberModal(
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

  const modal =
    byId("memberModal");

  if (!modal) return;

  modal.hidden =
    false;

  modal.style.display =
    "flex";

  document.body.classList.add(
    "modal-open"
  );

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

  if (!modal) return;

  modal.hidden =
    true;

  modal.style.display =
    "none";

  document.body.classList.remove(
    "modal-open"
  );
}

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

function handleTableAction(
  event
) {
  const button =
    event.target.closest(
      "[data-action]"
    );

  if (!button) return;

  const memberId =
    button.getAttribute(
      "data-member-id"
    );

  const action =
    button.getAttribute(
      "data-action"
    );

  if (!memberId) return;

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

function bindEvents() {
  if (eventsBound) return;

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
    "closeMemberModal"
  )?.addEventListener(
    "click",
    closeMemberModal
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

export async function init() {
  if (initialized) return;

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

export async function refreshMembers() {
  if (!groupId) return;

  try {
    await loadMembers();

    renderMembers();

    updateMemberCount();
  } catch (error) {
    showError(error);
  }
}

export const loadPage =
  init;

console.log(
  "CHAMA LIVE: members.js ready"
);
