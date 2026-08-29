
/* =========================================================
   CHAMA LIVE — MEMBERS
   COMPLETE GITHUB PAGES VERSION
   WITH MEMBER INVITATION / LOGIN FLOW

   File:
   /js/members.js

   Important:
   - Admin creates the member record.
   - Member gets their own Supabase Auth account.
   - Admin must NOT create another user's password.
   - Existing member_number is preserved.
   - user_id is never manually invented.
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


/* =========================================================
   DATE
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
   STATUS
========================================================= */

function showStatus(message) {

  const element = byId("status");

  if (!element) {
    return;
  }

  element.textContent = message || "";
  element.hidden = !message;

}


/* =========================================================
   ERROR
========================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE: Members error",
    error
  );

  const element = byId("error");

  if (!element) {
    return;
  }

  element.textContent =
    error?.message ||
    String(error || "Something went wrong.");

  element.hidden = false;

}


function clearError() {

  const element = byId("error");

  if (!element) {
    return;
  }

  element.textContent = "";
  element.hidden = true;

}


/* =========================================================
   FORM MESSAGE
========================================================= */

function showFormMessage(
  message,
  type = "success"
) {

  const element = byId("formMessage");

  if (!element) {
    return;
  }

  element.textContent = message || "";

  element.style.display =
    message ? "block" : "none";


  if (type === "error") {

    element.style.background =
      "rgba(220, 38, 38, .12)";

    element.style.color =
      "#b91c1c";

  }
  else {

    element.style.background =
      "rgba(22, 163, 74, .12)";

    element.style.color =
      "#166534";

  }

}


function clearFormMessage() {

  const element = byId("formMessage");

  if (!element) {
    return;
  }

  element.textContent = "";
  element.style.display = "none";

}


/* =========================================================
   MEMBER LOOKUP
========================================================= */

function findMember(memberId) {

  return members.find(
    member =>
      String(member.id) === String(memberId)
  );

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


  initialized = true;


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
       LOAD MEMBERS
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

    initialized = false;

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


  /*
   * Try full structure first.
   */

  let result =
    await supabase
      .from("members")
      .select(`
        id,
        group_id,
        user_id,
        auth_user_id,
        member_number,
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


  /*
   * Older schema fallback.
   */

  if (
    result.error &&
    String(result.error.message || "")
      .toLowerCase()
      .includes("auth_user_id")
  ) {

    result =
      await supabase
        .from("members")
        .select(`
          id,
          group_id,
          user_id,
          member_number,
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

  }


  if (result.error) {

    throw result.error;

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
   MEMBER ROW
========================================================= */

function createMemberRow(member) {

  const id =
    escapeHtml(member.id);


  const memberNumber =
    escapeHtml(
      member.member_number || "—"
    );


  const name =
    escapeHtml(
      member.name || "—"
    );


  const phone =
    escapeHtml(
      member.phone || "—"
    );


  const email =
    escapeHtml(
      member.email || "—"
    );


  const role =
    escapeHtml(
      member.role || "member"
    );


  const status =
    escapeHtml(
      member.status || "active"
    );


  const linked =
    member.user_id ||
    member.auth_user_id;


  const accountStatus =
    linked
      ? "Linked"
      : "Pending Login";


  return `
    <tr data-member-id="${id}">

      <td>
        ${memberNumber}
      </td>

      <td>
        ${name}
      </td>

      <td>
        ${phone}
      </td>

      <td>
        ${email}
      </td>

      <td>
        ${role}
      </td>

      <td>
        ${status}
      </td>

      <td>
        ${accountStatus}
      </td>

      <td>

        <div
          style="
            display:flex;
            gap:6px;
            flex-wrap:wrap;
          "
        >

          <button
            type="button"
            class="btn btn-secondary"
            data-action="view"
            data-member-id="${id}"
          >
            View
          </button>

          <button
            type="button"
            class="btn btn-primary"
            data-action="edit"
            data-member-id="${id}"
          >
            Edit
          </button>

          ${
            !linked && member.email
              ? `
                <button
                  type="button"
                  class="btn btn-secondary"
                  data-action="invite"
                  data-member-id="${id}"
                >
                  Invite
                </button>
              `
              : ""
          }

        </div>

      </td>

    </tr>
  `;

}


/* =========================================================
   RENDER
========================================================= */

function renderMembers(list = members) {

  const tbody =
    byId("memberRows");


  if (!tbody) {

    console.warn(
      "CHAMA LIVE: #memberRows not found"
    );

    return;

  }


  const rows =
    Array.isArray(list)
      ? list
      : [];


  if (rows.length === 0) {

    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          No members registered yet.
        </td>
      </tr>
    `;

    return;

  }


  tbody.innerHTML =
    rows
      .map(createMemberRow)
      .join("");

}


/* =========================================================
   MEMBER COUNT
========================================================= */

function updateMemberCount() {

  const total =
    members.length;


  const active =
    members.filter(
      member =>
        String(
          member.status || ""
        ).toLowerCase() === "active"
    ).length;


  const count =
    byId("memberCount");


  if (count) {
    count.textContent =
      String(total);
  }


  const totalMembers =
    byId("membersCount");


  if (totalMembers) {
    totalMembers.textContent =
      String(total);
  }


  const activeMembers =
    byId("activeMembers");


  if (activeMembers) {
    activeMembers.textContent =
      String(active);
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


  const closeModalButton =
    byId("closeMemberModal");


  const tbody =
    byId("memberRows");


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


  if (tbody) {

    tbody.addEventListener(
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


  document.addEventListener(
    "keydown",
    handleEscape
  );

}


/* =========================================================
   ESCAPE
========================================================= */

function handleEscape(event) {

  if (event.key !== "Escape") {
    return;
  }

  closeMemberModal();

  closeMemberForm();

}


/* =========================================================
   SEARCH
========================================================= */

function handleSearch(event) {

  const query =
    String(
      event.target.value || ""
    )
      .trim()
      .toLowerCase();


  if (!query) {

    renderMembers();

    return;

  }


  const filtered =
    members.filter(
      member => {

        const values = [

          member.member_number,
          member.name,
          member.phone,
          member.email,
          member.role,
          member.status

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

}


/* =========================================================
   TABLE ACTION
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

    inviteMember(memberId);

  }

}


/* =========================================================
   ADD MEMBER
========================================================= */

function openAddMember() {

  editingMemberId = null;


  const panel =
    byId("addMemberPanel");


  const title =
    byId("memberFormTitle");


  const description =
    byId("memberFormDescription");


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


  const memberNumber =
    byId("memberNumber");


  if (memberNumber) {
    memberNumber.focus();
  }

}


/* =========================================================
   CLOSE MEMBER FORM
========================================================= */

function closeMemberForm() {

  editingMemberId = null;


  const panel =
    byId("addMemberPanel");


  if (panel) {
    panel.hidden = true;
  }


  const form =
    byId("addMemberForm");


  if (form) {
    form.reset();
  }


  clearFormMessage();

}


/* =========================================================
   EDIT MEMBER
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
    panel.hidden = false;
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
      member.member_number || "";

  }


  if (memberName) {

    memberName.value =
      member.name || "";

  }


  if (memberPhone) {

    memberPhone.value =
      member.phone || "";

  }


  if (memberEmail) {

    memberEmail.value =
      member.email || "";

  }


  if (memberRole) {

    memberRole.value =
      member.role || "member";

  }


  if (memberStatus) {

    memberStatus.value =
      member.status || "active";

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
   FORM VALUES
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
        ? emailElement.value.trim().toLowerCase()
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
   VALIDATE
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
    Array.isArray(result.data) &&
    result.data.length > 0
  );

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


  try {

    const values =
      getFormValues();


    validateForm(values);


    if (saveButton) {

      saveButton.disabled = true;

      saveButton.textContent =
        editingMemberId
          ? "Updating..."
          : "Saving...";

    }


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

    if (editingMemberId) {

      const updatePayload = {

        member_number:
          values.memberNumber,

        name:
          values.name,

        phone:
          values.phone,

        email:
          values.email || null,

        role:
          values.role,

        status:
          values.status

      };


      const result =
        await supabase
          .from("members")
          .update(
            updatePayload
          )
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

      /*
       * CRITICAL:
       *
       * member_number MUST be supplied.
       *
       * Do not send membership_number unless that is
       * actually the database column.
       *
       * Your current schema uses member_number.
       */

      const insertPayload = {

        group_id:
          groupId,

        member_number:
          values.memberNumber,

        name:
          values.name,

        phone:
          values.phone,

        email:
          values.email || null,

        role:
          values.role,

        status:
          values.status,

        join_date:
          new Date()
            .toISOString()
            .slice(0, 10)

      };


      const result =
        await supabase
          .from("members")
          .insert(
            insertPayload
          )
          .select(`
            id,
            group_id,
            user_id,
            member_number,
            name,
            phone,
            email,
            role,
            join_date,
            status,
            created_at
          `)
          .single();


      if (result.error) {
        throw result.error;
      }


      showFormMessage(
        "Member added successfully.",
        "success"
      );


      /*
       * If the member has an email, offer invitation.
       */

      if (values.email) {

        setTimeout(
          async () => {

            const invite =
              await inviteMember(
                result.data.id,
                true
              );


            if (invite) {

              showFormMessage(
                "Member added. An invitation link has been prepared.",
                "success"
              );

            }

          },
          400
        );

      }

    }


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

      saveButton.disabled = false;

      saveButton.textContent =
        editingMemberId
          ? "Save Changes"
          : "Save Member";

    }

  }

}


/* =========================================================
   MEMBER INVITATION
========================================================= */

async function inviteMember(
  memberId,
  silent = false
) {

  const member =
    findMember(memberId);


  if (!member) {

    if (!silent) {

      showError(
        new Error(
          "Member could not be found."
        )
      );

    }

    return false;

  }


  if (!member.email) {

    if (!silent) {

      showFormMessage(
        "This member does not have an email address.",
        "error"
      );

    }

    return false;

  }


  try {

    /*
     * The invitation is sent by Supabase Auth.
     *
     * This must be configured in Supabase Auth.
     */

    const redirectTo =
      new URL(
        "create-group.html",
        window.location.href
      ).href;


    /*
     * IMPORTANT:
     *
     * This calls Supabase's password-reset/invite
     * mechanism only if the project permits it.
     *
     * A browser client cannot securely create another
     * user's Auth account with admin privileges.
     *
     * Therefore we use a recovery-style email flow.
     */

    const result =
      await supabase.auth.resetPasswordForEmail(
        member.email,
        {
          redirectTo
        }
      );


    if (result.error) {

      throw result.error;

    }


    if (!silent) {

      showFormMessage(
        "Login setup email sent to " +
        member.email +
        ".",
        "success"
      );

    }


    console.log(
      "CHAMA LIVE: member login email sent",
      member.email
    );


    return true;

  }
  catch (error) {

    console.error(
      "CHAMA LIVE: member invitation failed",
      error
    );


    if (!silent) {

      showFormMessage(
        friendlyInviteError(error),
        "error"
      );

    }


    return false;

  }

}


/* =========================================================
   INVITATION ERROR
========================================================= */

function friendlyInviteError(error) {

  const message =
    String(
      error?.message ||
      error ||
      ""
    );


  if (
    message.toLowerCase()
      .includes("rate limit")
  ) {

    return (
      "The email service has reached its sending limit. " +
      "Please wait and try again later."
    );

  }


  if (
    message.toLowerCase()
      .includes("redirect")
  ) {

    return (
      "The member login email could not be prepared " +
      "because the redirect URL is not allowed in Supabase Auth."
    );

  }


  return (
    "The member login email could not be sent. " +
    message
  );

}


/* =========================================================
   MEMBER VIEW
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


  const number =
    byId("viewMemberNumber");


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
      member.name || "Member";
  }


  if (number) {
    number.textContent =
      member.member_number || "—";
  }


  if (phone) {
    phone.textContent =
      member.phone || "—";
  }


  if (email) {
    email.textContent =
      member.email || "—";
  }


  if (role) {
    role.textContent =
      member.role || "member";
  }


  if (status) {
    status.textContent =
      member.status || "—";
  }


  if (joinDate) {

    joinDate.textContent =
      formatDate(
        member.join_date
      );

  }


  const modal =
    byId("memberModal");


  if (!modal) {

    console.warn(
      "CHAMA LIVE: #memberModal not found"
    );

    return;

  }


  modal.hidden = false;

  modal.style.display = "flex";


  const closeButton =
    byId("closeMemberModal");


  if (closeButton) {
    closeButton.focus();
  }

}


/* =========================================================
   CLOSE MODAL
========================================================= */

function closeMemberModal() {

  const modal =
    byId("memberModal");


  if (!modal) {
    return;
  }


  modal.hidden = true;

  modal.style.display = "none";

}


/* =========================================================
   REFRESH
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
