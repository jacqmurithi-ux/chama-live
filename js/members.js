   /* =========================================================
   CHAMA LIVE — MEMBERS
   COMPLETE MEMBERS MANAGEMENT + LOGIN INVITATION FLOW

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
   - Send / resend invitation
   - Supabase Edge Function integration
   - Displays ACTUAL Edge Function errors
   - Supports auth_user_id / user_id
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

  let message = "Something went wrong.";

  if (error) {

    if (typeof error === "string") {
      message = error;
    }

    else if (error.message) {
      message = error.message;
    }

    else {
      try {
        message = JSON.stringify(error);
      }
      catch {
        message = String(error);
      }
    }

  }

  element.textContent = message;
  element.hidden = false;
}


/* =========================================================
   CLEAR ERROR
========================================================= */

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


/* =========================================================
   CLEAR FORM MESSAGE
========================================================= */

function clearFormMessage() {

  const element = byId("formMessage");

  if (!element) {
    return;
  }

  element.textContent = "";
  element.style.display = "none";
}


/* =========================================================
   FIND MEMBER
========================================================= */

function findMember(memberId) {

  return members.find(
    member =>
      String(member.id) === String(memberId)
  );
}


/* =========================================================
   LOGIN STATUS
========================================================= */

function getLoginStatus(member) {

  if (!member) {
    return "No Login";
  }

  /*
   * Fully activated account
   */

  if (member.activated_at) {
    return "Active";
  }

  /*
   * Existing Supabase Auth account linked
   */

  if (
    member.auth_user_id ||
    member.user_id
  ) {

    return "Invitation Sent";
  }

  /*
   * Onboarding status
   */

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
    onboarding === "pending"
  ) {

    return onboarding === "invited"
      ? "Invitation Sent"
      : "No Login";
  }

  if (member.invited_at) {
    return "Invitation Sent";
  }

  return "No Login";
}


/* =========================================================
   LOGIN STATUS HTML
========================================================= */

function loginStatusHtml(member) {

  const status =
    getLoginStatus(member);

  if (status === "Active") {

    return `
      <span
        style="
          display:inline-block;
          padding:5px 9px;
          border-radius:999px;
          background:rgba(22,163,74,.12);
          color:#166534;
          font-size:12px;
          font-weight:600;
        "
      >
        Active
      </span>
    `;
  }

  if (status === "Invitation Sent") {

    return `
      <span
        style="
          display:inline-block;
          padding:5px 9px;
          border-radius:999px;
          background:rgba(234,179,8,.15);
          color:#854d0e;
          font-size:12px;
          font-weight:600;
        "
      >
        Invitation Sent
      </span>
    `;
  }

  return `
    <span
      style="
        display:inline-block;
        padding:5px 9px;
        border-radius:999px;
        background:rgba(100,116,139,.12);
        color:#475569;
        font-size:12px;
        font-weight:600;
      "
    >
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

  if (result.error) {

    console.error(
      "CHAMA LIVE: complete member query failed",
      result.error
    );

    /*
     * Compatibility fallback
     */

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
    escapeHtml(
      member.role ||
      "member"
    );

  const status =
    escapeHtml(
      member.status ||
      "active"
    );

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

  let invitationButton = "";

  if (
    hasEmail &&
    loginStatusValue !== "Active"
  ) {

    if (
      loginStatusValue ===
      "Invitation Sent"
    ) {

      invitationButton = `
        <button
          type="button"
          class="btn btn-secondary"
          data-action="invite"
          data-member-id="${id}"
        >
          Resend Invitation
        </button>
      `;

    }

    else {

      invitationButton = `
        <button
          type="button"
          class="btn btn-primary"
          data-action="invite"
          data-member-id="${id}"
        >
          Send Invitation
        </button>
      `;
    }

  }

  if (!hasEmail) {

    invitationButton = `
      <button
        type="button"
        class="btn btn-secondary"
        data-action="invite"
        data-member-id="${id}"
        disabled
        title="Add an email address first"
      >
        No Email
      </button>
    `;
  }

  return `
    <tr data-member-id="${id}">

      <td>
        ${memberNumber}
      </td>

      <td>
        ${membershipNumber}
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
        ${loginStatus}
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

          ${invitationButton}

        </div>

      </td>

    </tr>
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
        <td colspan="9">
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
        ).toLowerCase() ===
        "active"
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
   BIND EVENTS
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
   OPEN EDIT
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

  try {

    const values =
      getFormValues();

    validateForm(values);

    if (saveButton) {

      saveButton.disabled =
        true;

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

        membership_number:
          generateMembershipNumber(
            values.memberNumber
          ),

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
          values.email || null,

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
          .insert(
            insertPayload
          )
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
          ? "Member added successfully. Send the login invitation from the Members table."
          : "Member added successfully. Add an email address before sending a login invitation.",
        "success"
      );
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

      saveButton.disabled =
        false;

      saveButton.textContent =
        editingMemberId
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

  /*
   * Start with the normal Supabase error.
   */

  let message =
    functionError?.message ||
    "The invitation could not be sent.";

  /*
   * If data already contains an object,
   * inspect it.
   */

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

  /*
   * Supabase Functions errors sometimes expose
   * the actual Response object as context.
   */

  const context =
    functionError?.context;

  if (context) {

    try {

      if (
        typeof context.json ===
        "function"
      ) {

        const body =
          await context.json();

        console.error(
          "CHAMA LIVE: Edge Function JSON error",
          body
        );

        if (
          body?.error
        ) {

          return typeof body.error === "string"
            ? body.error
            : body.error.message ||
              JSON.stringify(body.error);
        }

        if (body?.message) {
          return body.message;
        }

        if (body) {
          return JSON.stringify(body);
        }
      }

    }
    catch (jsonError) {

      console.warn(
        "CHAMA LIVE: Could not parse Edge Function JSON",
        jsonError
      );
    }

    /*
     * Response body may be text.
     */

    try {

      if (
        typeof context.text ===
        "function"
      ) {

        const text =
          await context.text();

        console.error(
          "CHAMA LIVE: Edge Function text error",
          text
        );

        if (text) {

          try {

            const parsed =
              JSON.parse(text);

            if (parsed?.error) {

              return typeof parsed.error === "string"
                ? parsed.error
                : parsed.error.message ||
                  JSON.stringify(parsed.error);
            }

            if (parsed?.message) {
              return parsed.message;
            }

          }
          catch {
            /*
             * Not JSON.
             */

            return text;
          }
        }
      }

    }
    catch (textError) {

      console.warn(
        "CHAMA LIVE: Could not read Edge Function text",
        textError
      );
    }

  }

  /*
   * Inspect any additional properties.
   */

  if (
    functionError?.name
  ) {

    console.error(
      "CHAMA LIVE: Edge Function error name:",
      functionError.name
    );
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
    ).trim();

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
      : "";

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
      "CHAMA LIVE: preparing invitation",
      {
        memberId: member.id,
        email,
        groupId
      }
    );

    /* =====================================================
       CHECK SESSION
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

    console.log(
      "CHAMA LIVE: authenticated user:",
      session.user?.id
    );

    /* =====================================================
       CALL EDGE FUNCTION
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
      "CHAMA LIVE: raw invitation response:",
      result
    );

    /* =====================================================
       HANDLE EDGE FUNCTION ERROR
    ===================================================== */

    if (result.error) {

      console.error(
        "CHAMA LIVE: Edge Function returned error:",
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

    /* =====================================================
       HANDLE FUNCTION-LEVEL ERROR
    ===================================================== */

    if (
      result.data &&
      typeof result.data === "object"
    ) {

      if (result.data.success === false) {

        throw new Error(
          result.data.error ||
          result.data.message ||
          "The invitation was rejected by the server."
        );
      }

      if (result.data.error) {

        throw new Error(
          typeof result.data.error === "string"
            ? result.data.error
            : result.data.error.message ||
              JSON.stringify(result.data.error)
        );
      }
    }

    /* =====================================================
       SUCCESS
    ===================================================== */

    console.log(
      "CHAMA LIVE: invitation sent successfully:",
      result.data
    );

    showStatus(
      `Invitation sent successfully to ${email}.`
    );

    /*
     * Do NOT manually update auth_user_id here.
     *
     * The Edge Function is responsible for:
     * - creating/finding the Supabase Auth user
     * - linking the member
     * - recording invitation state
     *
     * Refresh the member list instead.
     */

    await loadMembers();

    renderMembers();

    updateMemberCount();

    /*
     * Refresh modal if open.
     */

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

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: send invitation failed:",
      error
    );

    /*
     * IMPORTANT:
     * Display the actual server error.
     */

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

      /*
       * Recalculate button text after
       * the server operation.
       */

      const updatedMember =
        findMember(memberId);

      if (
        updatedMember &&
        getLoginStatus(updatedMember) ===
        "Invitation Sent"
      ) {

        button.textContent =
          "Resend Invitation";

      }

      else {

        button.textContent =
          originalText ||
          "Send Invitation";
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

  if (name) {

    name.textContent =
      member.name ||
      "Member";
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

    role.textContent =
      member.role ||
      "member";
  }

  if (status) {

    status.textContent =
      member.status ||
      "—";
  }

  if (loginStatus) {

    loginStatus.textContent =
      getLoginStatus(member);
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

  modal.hidden =
    false;

  modal.style.display =
    "flex";

  const closeButton =
    byId("closeMemberModal");

  if (closeButton) {
    closeButton.focus();
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
