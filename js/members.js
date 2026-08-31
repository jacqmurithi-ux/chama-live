/* =========================================================
   CHAMA LIVE — MEMBERS
   COMPLETE MEMBERS MANAGEMENT
   VISUAL + RESPONSIVE VERSION

   File:
   /js/members.js

   Features:
   - Load members
   - Add member
   - Edit member
   - Search members
   - View member
   - Membership number support
   - Login status
   - Send / resend Supabase Auth invitation
   - Supabase Edge Function integration
   - Responsive member cards
   - Desktop member table
   - Dashboard-style statistics
   - Actual Edge Function errors
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";


console.log("CHAMA LIVE: members.js loaded");


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


/* =========================================================
   HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
}


/* =========================================================
   ESCAPE HTML
========================================================= */

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


/* =========================================================
   FORMAT DATE
========================================================= */

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


/* =========================================================
   INITIALS
========================================================= */

function getInitials(name) {

  const value =
    String(name || "")
      .trim();

  if (!value) {
    return "M";
  }

  const parts =
    value
      .split(/\s+/)
      .filter(Boolean);

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


/* =========================================================
   DISPLAY ROLE
========================================================= */

function displayRole(role) {

  const value =
    String(role || "member")
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


/* =========================================================
   ROLE BADGE
========================================================= */

function roleBadgeHtml(role) {

  const value =
    String(role || "member")
      .trim()
      .toLowerCase();

  let className =
    "member-role-badge";

  if (value === "admin") {
    className += " role-admin";
  }

  else if (value === "chairperson") {
    className += " role-chairperson";
  }

  else if (value === "secretary") {
    className += " role-secretary";
  }

  else if (value === "treasurer") {
    className += " role-treasurer";
  }

  else {
    className += " role-member";
  }

  return `
    <span class="${className}">
      ${escapeHtml(displayRole(role))}
    </span>
  `;
}


/* =========================================================
   ACCOUNT STATUS BADGE
========================================================= */

function accountStatusHtml(status) {

  const value =
    String(status || "active")
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
   STATUS MESSAGE
========================================================= */

function showStatus(message) {

  const element =
    byId("status");

  if (!element) {
    return;
  }

  element.textContent =
    message || "";

  element.hidden =
    !message;
}


/* =========================================================
   ERROR MESSAGE
========================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE: Members error",
    error
  );

  const element =
    byId("error");

  if (!element) {
    return;
  }

  let message =
    "Something went wrong.";

  if (error) {

    if (
      typeof error === "string"
    ) {

      message = error;
    }

    else if (
      error.message
    ) {

      message =
        error.message;
    }

    else {

      try {

        message =
          JSON.stringify(error);

      }

      catch {

        message =
          String(error);
      }
    }
  }

  element.innerHTML = `
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

  element.hidden =
    false;
}


/* =========================================================
   CLEAR ERROR
========================================================= */

function clearError() {

  const element =
    byId("error");

  if (!element) {
    return;
  }

  element.innerHTML =
    "";

  element.hidden =
    true;
}


/* =========================================================
   FORM MESSAGE
========================================================= */

function showFormMessage(
  message,
  type = "success"
) {

  const element =
    byId("formMessage");

  if (!element) {
    return;
  }

  element.textContent =
    message || "";

  element.className =
    `form-message ${type}`;

  element.style.display =
    message ? "flex" : "none";
}


/* =========================================================
   CLEAR FORM MESSAGE
========================================================= */

function clearFormMessage() {

  const element =
    byId("formMessage");

  if (!element) {
    return;
  }

  element.textContent =
    "";

  element.style.display =
    "none";
}


/* =========================================================
   FIND MEMBER
========================================================= */

function findMember(memberId) {

  return members.find(
    member =>
      String(member.id) ===
      String(memberId)
  );
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
    )
      .toLowerCase();


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


/* =========================================================
   LOGIN STATUS BADGE
========================================================= */

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
   INITIALIZE
========================================================= */

export async function init() {

  if (initialized) {

    console.log(
      "CHAMA LIVE: members already initialized"
    );

    return;
  }

  initialized =
    true;


  try {

    clearError();

    showStatus(
      "Loading members..."
    );


    /* =====================================================
       AUTH
    ===================================================== */

    currentUser =
      await requireAuth();


    if (!currentUser) {

      throw new Error(
        "You are not logged in."
      );
    }


    /* =====================================================
       CURRENT MEMBER
    ===================================================== */

    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "No member record is linked to this account."
      );
    }


    if (!currentMember.group_id) {

      throw new Error(
        "Your member record has no group."
      );
    }


    groupId =
      currentMember.group_id;


    /* =====================================================
       CURRENT GROUP
    ===================================================== */

    currentGroup =
      await getMyGroup();


    if (!currentGroup) {

      throw new Error(
        "Group information could not be found."
      );
    }


    console.log(
      "CHAMA LIVE: current member",
      currentMember
    );


    console.log(
      "CHAMA LIVE: current group",
      currentGroup
    );


    /* =====================================================
       DISPLAY GROUP
    ===================================================== */

    const groupName =
      byId("membersGroupName");

    if (groupName) {

      groupName.textContent =
        currentGroup.name ||
        currentGroup.group_name ||
        "Your Group";
    }


    /* =====================================================
       LOAD
    ===================================================== */

    await loadMembers();

    renderMembers();

    updateMemberCount();

    bindEvents();

    showStatus("");


    console.log(
      "CHAMA LIVE: members initialized successfully"
    );

  }

  catch (error) {

    initialized =
      false;

    showStatus("");

    showError(error);
  }
}


/* =========================================================
   LOAD MEMBERS
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


  /* =====================================================
     COMPATIBILITY FALLBACK
  ===================================================== */

  if (result.error) {

    console.warn(
      "CHAMA LIVE: full member query failed",
      result.error
    );


    const retry =
      await supabase
        .from("members")
        .select(`
          id,
          group_id,
          user_id,
          auth_user_id,
          member_number,
          membership_number,
          name,
          phone,
          email,
          role,
          join_date,
          status,
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


    if (retry.error) {
      throw retry.error;
    }


    members =
      Array.isArray(retry.data)
        ? retry.data
        : [];


    return members;
  }


  members =
    Array.isArray(result.data)
      ? result.data
      : [];


  console.log(
    "CHAMA LIVE: loaded members:",
    members.length
  );


  return members;
}


/* =========================================================
   CREATE MEMBER ROW
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


  const role =
    member.role ||
    "member";


  const status =
    member.status ||
    "active";


  const loginStatus =
    loginStatusHtml(member);


  const hasEmail =
    Boolean(
      String(
        member.email || ""
      ).trim()
    );


  const loginStatusValue =
    getLoginStatus(member);


  let invitationButton =
    "";


  if (!hasEmail) {

    invitationButton = `
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
  }


  else if (
    loginStatusValue === "Active"
  ) {

    invitationButton = `
      <button
        type="button"
        class="member-action invitation-disabled"
        disabled
        title="This member account is already active"
      >
        <span>✓</span>
        Active
      </button>
    `;
  }


  else if (
    loginStatusValue ===
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
  }


  else {

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
              Joined ${escapeHtml(
                formatDate(member.join_date)
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
        <span class="member-contact email-contact">
          ${email}
        </span>
      </td>


      <td>
        ${roleBadgeHtml(role)}
      </td>


      <td>
        ${accountStatusHtml(status)}
      </td>


      <td>
        ${loginStatus}
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
   CREATE MOBILE MEMBER CARD
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


  const status =
    member.status ||
    "active";


  const loginStatus =
    getLoginStatus(member);


  let invitationButton =
    "";


  if (!member.email) {

    invitationButton = `
      <button
        type="button"
        class="mobile-action disabled-action"
        disabled
      >
        ✉ No Email
      </button>
    `;
  }

  else if (
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
  }

  else if (
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
  }

  else {

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
              getInitials(member.name)
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


        ${accountStatusHtml(status)}

      </div>


      <div class="member-card-badges">

        ${roleBadgeHtml(member.role)}

        ${loginStatusHtml(member)}

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
              formatDate(member.join_date)
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
   RENDER MEMBERS
========================================================= */

function renderMembers(
  list = members
) {

  const tbody =
    byId("memberRows");


  const cards =
    byId("memberCards");


  const rows =
    Array.isArray(list)
      ? list
      : [];


  /* =====================================================
     DESKTOP TABLE
  ===================================================== */

  if (tbody) {

    if (rows.length === 0) {

      tbody.innerHTML = `
        <tr>

          <td
            colspan="9"
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
                Add your first group member to get started.
              </p>

            </div>

          </td>

        </tr>
      `;
    }

    else {

      tbody.innerHTML =
        rows
          .map(createMemberRow)
          .join("");
    }
  }


  /* =====================================================
     MOBILE CARDS
  ===================================================== */

  if (cards) {

    if (rows.length === 0) {

      cards.innerHTML = `
        <div class="empty-state mobile-empty">

          <div class="empty-state-icon">
            ♙
          </div>

          <h3>
            No members found
          </h3>

          <p>
            Add your first group member to get started.
          </p>

        </div>
      `;
    }

    else {

      cards.innerHTML =
        rows
          .map(createMemberCard)
          .join("");
    }
  }


  /* =====================================================
     RESULT COUNT
  ===================================================== */

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
   MEMBER COUNT / STATISTICS
========================================================= */

function updateMemberCount() {

  const total =
    members.length;


  const active =
    members.filter(
      member =>
        String(
          member.status || ""
        )
          .toLowerCase() ===
        "active"
    ).length;


  const inactive =
    members.filter(
      member =>
        String(
          member.status || ""
        )
          .toLowerCase() !==
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

    memberCount:
      total,

    membersCount:
      total,

    activeMembers:
      active,

    inactiveMembers:
      inactive,

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

        const element =
          byId(id);

        if (element) {

          element.textContent =
            String(value);
        }
      }
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
    byId("addMemberButton");


  const closeButton =
    byId("closeAddMember");


  const cancelButton =
    byId("cancelAddMember");


  const form =
    byId("addMemberForm");


  const search =
    byId("memberSearch");


  const clearSearch =
    byId("clearMemberSearch");


  const closeModalButton =
    byId("closeMemberModal");


  const modalBackdrop =
    byId("memberModal");


  const tbody =
    byId("memberRows");


  const cards =
    byId("memberCards");


  if (addButton) {

    addButton.addEventListener(
      "click",
      openAddMember
    );
  }


  if (closeButton) {

    closeButton.addEventListener(
      "click",
      closeMemberForm
    );
  }


  if (cancelButton) {

    cancelButton.addEventListener(
      "click",
      closeMemberForm
    );
  }


  if (form) {

    form.addEventListener(
      "submit",
      saveMember
    );
  }


  if (search) {

    search.addEventListener(
      "input",
      handleSearch
    );
  }


  if (clearSearch) {

    clearSearch.addEventListener(
      "click",
      () => {

        if (search) {
          search.value = "";
        }

        renderMembers();
      }
    );
  }


  if (tbody) {

    tbody.addEventListener(
      "click",
      handleTableAction
    );
  }


  if (cards) {

    cards.addEventListener(
      "click",
      handleTableAction
    );
  }


  if (closeModalButton) {

    closeModalButton.addEventListener(
      "click",
      closeMemberModal
    );
  }


  if (modalBackdrop) {

    modalBackdrop.addEventListener(
      "click",
      event => {

        if (
          event.target ===
          modalBackdrop
        ) {

          closeMemberModal();
        }
      }
    );
  }


  document.addEventListener(
    "keydown",
    handleEscape
  );
}


/* =========================================================
   ESCAPE KEY
========================================================= */

function handleEscape(event) {

  if (event.key !== "Escape") {
    return;
  }

  closeMemberModal();

  closeMemberForm();
}


/* =========================================================
   SEARCH MEMBERS
========================================================= */

function handleSearch(event) {

  const query =
    String(
      event.target.value || ""
    )
      .trim()
      .toLowerCase();


  const searchEmpty =
    byId("searchEmpty");


  if (!query) {

    if (searchEmpty) {
      searchEmpty.hidden =
        true;
    }

    renderMembers();

    return;
  }


  const filtered =
    members.filter(
      member => {

        const values = [

          member.member_number,

          member.membership_number,

          member.name,

          member.phone,

          member.email,

          member.role,

          member.status,

          member.onboarding_status

        ];


        const searchable =
          values
            .filter(
              value =>
                value !== null &&
                value !== undefined
            )
            .join(" ")
            .toLowerCase();


        return searchable.includes(
          query
        );
      }
    );


  renderMembers(filtered);


  if (searchEmpty) {

    searchEmpty.hidden =
      filtered.length !== 0;
  }
}


/* =========================================================
   TABLE / CARD ACTIONS
========================================================= */

function handleTableAction(event) {

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


  if (!memberId) {
    return;
  }


  if (action === "view") {

    openMemberModal(memberId);

    return;
  }


  if (action === "edit") {

    openEditMember(memberId);

    return;
  }


  if (action === "invite") {

    sendMemberInvitation(
      memberId,
      button
    );
  }
}


/* =========================================================
   OPEN ADD MEMBER
========================================================= */

function openAddMember() {

  editingMemberId =
    null;


  const panel =
    byId("addMemberPanel");


  const title =
    byId("memberFormTitle");


  const description =
    byId("memberFormDescription");


  const form =
    byId("addMemberForm");


  if (panel) {
    panel.hidden =
      false;
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


  const memberNumber =
    byId("memberNumber");


  if (memberNumber) {

    memberNumber.focus();
  }


  if (panel) {

    panel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}


/* =========================================================
   CLOSE MEMBER FORM
========================================================= */

function closeMemberForm() {

  editingMemberId =
    null;


  const panel =
    byId("addMemberPanel");


  if (panel) {

    panel.hidden =
      true;
  }


  const form =
    byId("addMemberForm");


  if (form) {
    form.reset();
  }


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
      new Error(
        "Member could not be found."
      )
    );

    return;
  }


  editingMemberId =
    memberId;


  const panel =
    byId("addMemberPanel");


  const title =
    byId("memberFormTitle");


  const description =
    byId("memberFormDescription");


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
      "Update the member information.";
  }


  const memberNumber =
    byId("memberNumber");


  const memberName =
    byId("memberName");


  const memberPhone =
    byId("memberPhone");


  const memberEmail =
    byId("memberEmail");


  const memberRole =
    byId("memberRole");


  const memberStatus =
    byId("memberStatus");


  if (memberNumber) {

    memberNumber.value =
      member.member_number ||
      member.membership_number ||
      "";
  }


  if (memberName) {

    memberName.value =
      member.name ||
      "";
  }


  if (memberPhone) {

    memberPhone.value =
      member.phone ||
      "";
  }


  if (memberEmail) {

    memberEmail.value =
      member.email ||
      "";
  }


  if (memberRole) {

    memberRole.value =
      member.role ||
      "member";
  }


  if (memberStatus) {

    memberStatus.value =
      member.status ||
      "active";
  }


  clearFormMessage();


  if (panel) {

    panel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}


/* =========================================================
   GET FORM VALUES
========================================================= */

function getFormValues() {

  const memberNumberElement =
    byId("memberNumber");


  const nameElement =
    byId("memberName");


  const phoneElement =
    byId("memberPhone");


  const emailElement =
    byId("memberEmail");


  const roleElement =
    byId("memberRole");


  const statusElement =
    byId("memberStatus");


  return {

    memberNumber:
      memberNumberElement
        ? memberNumberElement.value.trim()
        : "",


    name:
      nameElement
        ? nameElement.value.trim()
        : "",


    phone:
      phoneElement
        ? phoneElement.value.trim()
        : "",


    email:
      emailElement
        ? emailElement.value
            .trim()
            .toLowerCase()
        : "",


    role:
      roleElement
        ? roleElement.value
        : "member",


    status:
      statusElement
        ? statusElement.value
        : "active"
  };
}


/* =========================================================
   VALIDATE FORM
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


/* =========================================================
   CHECK DUPLICATE MEMBER NUMBER
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
    Array.isArray(result.data) &&
    result.data.length > 0
  );
}


/* =========================================================
   GENERATE MEMBERSHIP NUMBER
========================================================= */

function generateMembershipNumber(
  memberNumber
) {

  return String(
    memberNumber || ""
  ).trim();
}


/* =========================================================
   SAVE MEMBER
========================================================= */

async function saveMember(event) {

  event.preventDefault();

  clearError();

  clearFormMessage();


  const saveButton =
    byId("saveMemberButton");


  const wasEditing =
    Boolean(editingMemberId);


  try {

    const values =
      getFormValues();


    validateForm(values);


    if (saveButton) {

      saveButton.disabled =
        true;

      saveButton.textContent =
        wasEditing
          ? "Updating..."
          : "Saving...";
    }


    /* =====================================================
       DUPLICATE NUMBER
    ===================================================== */

    const duplicate =
      await checkDuplicateMemberNumber(
        values.memberNumber
      );


    if (duplicate) {

      throw new Error(
        "Member number " +
        values.memberNumber +
        " is already registered in this group."
      );
    }


    /* =====================================================
       UPDATE
    ===================================================== */

    if (wasEditing) {

      const updatePayload = {

        member_number:
          values.memberNumber,

        membership_number:
          generateMembershipNumber(
            values.memberNumber
          ),

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
          .update(updatePayload)
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
    }


    /* =====================================================
       CREATE
    ===================================================== */

    else {

      const membershipNumber =
        generateMembershipNumber(
          values.memberNumber
        );


      if (!membershipNumber) {

        throw new Error(
          "A membership number could not be generated."
        );
      }


      const insertPayload = {

        group_id:
          groupId,

        member_number:
          values.memberNumber,

        membership_number:
          membershipNumber,

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
          new Date()
            .toISOString()
            .slice(0, 10)
      };


      const result =
        await supabase
          .from("members")
          .insert(insertPayload)
          .select(`
            id,
            group_id,
            user_id,
            auth_user_id,
            member_number,
            membership_number,
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
          .single();


      if (result.error) {

        throw result.error;
      }


      console.log(
        "CHAMA LIVE: member created",
        result.data
      );


      showFormMessage(
        values.email
          ? "Member added successfully. You can now send the login invitation."
          : "Member added successfully. Add an email address before sending a login invitation.",
        "success"
      );
    }


    /* =====================================================
       REFRESH
    ===================================================== */

    await loadMembers();

    renderMembers();

    updateMemberCount();


    setTimeout(
      () => {

        closeMemberForm();

      },
      900
    );

  }


  catch (error) {

    console.error(
      "CHAMA LIVE: save member failed",
      error
    );


    showFormMessage(
      error?.message ||
      String(error),
      "error"
    );
  }


  finally {

    if (saveButton) {

      saveButton.disabled =
        false;

      saveButton.textContent =
        wasEditing
          ? "Save Changes"
          : "Save Member";
    }
  }
}


/* =========================================================
   EXTRACT EDGE FUNCTION ERROR
========================================================= */

async function extractFunctionError(
  functionError,
  functionData
) {

  let message =
    functionError?.message ||
    "The invitation could not be sent.";


  if (
    functionData &&
    typeof functionData === "object"
  ) {

    if (functionData.error) {

      if (
        typeof functionData.error ===
        "string"
      ) {

        return functionData.error;
      }


      if (
        functionData.error.message
      ) {

        return functionData.error.message;
      }
    }


    if (functionData.message) {

      return functionData.message;
    }
  }


  const context =
    functionError?.context;


  if (context) {

    try {

      if (
        typeof context.clone ===
        "function"
      ) {

        const cloned =
          context.clone();


        if (
          typeof cloned.json ===
          "function"
        ) {

          const body =
            await cloned.json();


          console.error(
            "CHAMA LIVE: Edge Function JSON error",
            body
          );


          if (body?.error) {

            if (
              typeof body.error ===
              "string"
            ) {

              return body.error;
            }


            if (
              body.error.message
            ) {

              return body.error.message;
            }


            return JSON.stringify(
              body.error
            );
          }


          if (body?.message) {

            return body.message;
          }


          if (body) {

            return JSON.stringify(
              body
            );
          }
        }
      }

    }

    catch (jsonError) {

      console.warn(
        "CHAMA LIVE: JSON error parsing failed",
        jsonError
      );
    }


    try {

      if (
        typeof context.clone ===
        "function"
      ) {

        const cloned =
          context.clone();


        if (
          typeof cloned.text ===
          "function"
        ) {

          const text =
            await cloned.text();


          console.error(
            "CHAMA LIVE: Edge Function text error",
            text
          );


          if (text) {

            try {

              const parsed =
                JSON.parse(text);


              if (parsed?.error) {

                if (
                  typeof parsed.error ===
                  "string"
                ) {

                  return parsed.error;
                }


                if (
                  parsed.error.message
                ) {

                  return parsed.error.message;
                }


                return JSON.stringify(
                  parsed.error
                );
              }


              if (parsed?.message) {

                return parsed.message;
              }

            }

            catch {

              return text;
            }
          }
        }
      }

    }

    catch (textError) {

      console.warn(
        "CHAMA LIVE: text error parsing failed",
        textError
      );
    }
  }


  if (
    functionError?.status
  ) {

    message +=
      ` (HTTP ${functionError.status})`;
  }


  return message;
}


/* =========================================================
   SEND MEMBER INVITATION
========================================================= */

async function sendMemberInvitation(
  memberId,
  button = null
) {

  clearError();


  const member =
    findMember(memberId);


  if (!member) {

    showError(
      new Error(
        "Member could not be found."
      )
    );

    return;
  }


  const email =
    String(
      member.email || ""
    )
      .trim()
      .toLowerCase();


  if (!email) {

    showError(
      new Error(
        "This member does not have an email address. Edit the member and add an email first."
      )
    );

    return;
  }


  if (!groupId) {

    showError(
      new Error(
        "No group is associated with this account."
      )
    );

    return;
  }


  const originalText =
    button
      ? button.textContent
      : "Invite";


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


    console.log(
      "CHAMA LIVE: preparing member invitation",
      {
        memberId:
          member.id,

        email,

        groupId
      }
    );


    /* =====================================================
       SESSION
    ===================================================== */

    const {
      data: sessionData,
      error: sessionError
    } =
      await supabase.auth.getSession();


    if (sessionError) {
      throw sessionError;
    }


    const session =
      sessionData?.session;


    if (!session) {

      throw new Error(
        "Your login session has expired. Please sign in again."
      );
    }


    /* =====================================================
       EDGE FUNCTION
    ===================================================== */

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


    console.log(
      "CHAMA LIVE: invitation function response",
      result
    );


    if (result.error) {

      console.error(
        "CHAMA LIVE: Edge Function error",
        result.error
      );


      const actualMessage =
        await extractFunctionError(
          result.error,
          result.data
        );


      throw new Error(
        actualMessage
      );
    }


    if (
      result.data &&
      typeof result.data === "object"
    ) {

      if (
        result.data.success === false
      ) {

        throw new Error(
          result.data.error ||
          result.data.message ||
          "The invitation was rejected by the server."
        );
      }


      if (
        result.data.error
      ) {

        throw new Error(
          typeof result.data.error ===
          "string"
            ? result.data.error
            : result.data.error.message ||
              JSON.stringify(
                result.data.error
              )
        );
      }
    }


    console.log(
      "CHAMA LIVE: invitation sent successfully",
      result.data
    );


    showStatus(
      `Invitation sent successfully to ${email}.`
    );


    /* =====================================================
       REFRESH
    ===================================================== */

    await loadMembers();

    renderMembers();

    updateMemberCount();


    /* =====================================================
       REFRESH MODAL
    ===================================================== */

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
      () => {
        showStatus("");
      },
      3500
    );

  }


  catch (error) {

    console.error(
      "CHAMA LIVE: send invitation failed",
      error
    );


    showError(
      new Error(
        error?.message ||
        "Unable to send the member invitation."
      )
    );


    showStatus("");
  }


  finally {

    if (button) {

      button.disabled =
        false;


      const updatedMember =
        findMember(memberId);


      if (
        updatedMember &&
        getLoginStatus(updatedMember) ===
        "Invitation Sent"
      ) {

        button.textContent =
          "↻ Resend";
      }

      else {

        button.textContent =
          originalText ||
          "Invite";
      }
    }
  }
}


/* =========================================================
   OPEN MEMBER MODAL
========================================================= */

function openMemberModal(memberId) {

  const member =
    findMember(memberId);


  if (!member) {

    showError(
      new Error(
        "Member could not be found."
      )
    );

    return;
  }


  const name =
    byId("viewMemberName");


  const initials =
    byId("viewMemberInitials");


  const number =
    byId("viewMemberNumber");


  const membershipNumber =
    byId("viewMembershipNumber");


  const phone =
    byId("viewMemberPhone");


  const email =
    byId("viewMemberEmail");


  const role =
    byId("viewMemberRole");


  const status =
    byId("viewMemberStatus");


  const loginStatus =
    byId("viewMemberLoginStatus");


  const joinDate =
    byId("viewMemberJoinDate");


  const group =
    byId("viewMemberGroup");


  if (name) {

    name.textContent =
      member.name ||
      "Member";
  }


  if (initials) {

    initials.textContent =
      getInitials(member.name);
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

    role.innerHTML =
      roleBadgeHtml(
        member.role
      );
  }


  if (status) {

    status.innerHTML =
      accountStatusHtml(
        member.status
      );
  }


  if (loginStatus) {

    loginStatus.innerHTML =
      loginStatusHtml(
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
      currentGroup?.group_name ||
      "Current Group";
  }


  const modal =
    byId("memberModal");


  if (!modal) {

    console.warn(
      "CHAMA LIVE: #memberModal not found"
    );

    return;
  }


  modal.hidden =
    false;


  modal.style.display =
    "flex";


  document.body.classList.add(
    "modal-open"
  );


  const closeButton =
    byId("closeMemberModal");


  if (closeButton) {

    setTimeout(
      () => {
        closeButton.focus();
      },
      50
    );
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


  modal.hidden =
    true;


  modal.style.display =
    "none";


  document.body.classList.remove(
    "modal-open"
  );
}


/* =========================================================
   REFRESH MEMBERS
========================================================= */

export async function refreshMembers() {

  if (!groupId) {

    console.warn(
      "CHAMA LIVE: Cannot refresh members without groupId"
    );

    return;
  }


  try {

    clearError();

    showStatus(
      "Refreshing members..."
    );


    await loadMembers();

    renderMembers();

    updateMemberCount();

    showStatus("");


  }

  catch (error) {

    showStatus("");

    showError(error);
  }
}


/* =========================================================
   PUBLIC ALIAS
========================================================= */

export const loadPage =
  init;


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: members.js ready"
);
