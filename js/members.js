/* =========================================================
   CHAMA LIVE — MEMBERS
   Clean module version
   Loaded by layout.js
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

  return String(value ?? "")
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

  return date.toLocaleDateString(
    "en-KE",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );

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


function clearStatus() {
  showStatus("");
}


/* =========================================================
   ERROR
========================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE Members:",
    error
  );

  const element = byId("error");

  if (!element) {
    return;
  }

  element.hidden = false;

  element.textContent =
    error?.message ||
    String(error) ||
    "Something went wrong.";

}


function clearError() {

  const element = byId("error");

  if (!element) {
    return;
  }

  element.hidden = true;
  element.textContent = "";

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

  element.textContent = message;

  element.style.display = "block";

  if (type === "error") {

    element.style.background =
      "rgba(220,38,38,.12)";

  }
  else {

    element.style.background =
      "rgba(22,163,74,.12)";

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
   INITIALIZE MEMBERS PAGE
========================================================= */

export async function initMembers() {

  if (initialized) {

    console.warn(
      "CHAMA LIVE: members already initialized"
    );

    return;

  }

  initialized = true;

  try {

    clearError();

    showStatus("Loading members...");


    /* -----------------------------------------------------
       AUTH
    ----------------------------------------------------- */

    currentUser =
      await requireAuth();


    if (!currentUser) {

      throw new Error(
        "You are not logged in."
      );

    }


    /* -----------------------------------------------------
       MEMBER
    ----------------------------------------------------- */

    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "No member record is linked to this account."
      );

    }


    if (!currentMember.group_id) {

      throw new Error(
        "Your account is not linked to a group."
      );

    }


    groupId =
      currentMember.group_id;


    /* -----------------------------------------------------
       GROUP
    ----------------------------------------------------- */

    currentGroup =
      await getMyGroup();


    if (!currentGroup) {

      throw new Error(
        "Group information could not be found."
      );

    }


    console.log(
      "CHAMA LIVE: members group",
      currentGroup
    );


    /* -----------------------------------------------------
       LOAD
    ----------------------------------------------------- */

    await loadMembers();


    /* -----------------------------------------------------
       RENDER
    ----------------------------------------------------- */

    renderMembers();

    updateMemberCount();


    /* -----------------------------------------------------
       EVENTS
    ----------------------------------------------------- */

    bindEvents();


    clearStatus();


    console.log(
      "CHAMA LIVE: members initialized successfully"
    );

  }
  catch (error) {

    initialized = false;

    clearStatus();

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


  const {
    data,
    error
  } =
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
        onboarding_status,
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


  if (error) {
    throw error;
  }


  members =
    Array.isArray(data)
      ? data
      : [];


  console.log(
    "CHAMA LIVE: loaded members:",
    members.length
  );

}


/* =========================================================
   MEMBER ROW
========================================================= */

function memberRow(member) {

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
      member.onboarding_status ||
      member.status ||
      "active"
    );


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

        </div>

      </td>

    </tr>
  `;

}


/* =========================================================
   RENDER MEMBERS
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


  if (!list.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          No members registered yet.
        </td>
      </tr>
    `;

    return;

  }


  tbody.innerHTML =
    list
      .map(memberRow)
      .join("");

}


/* =========================================================
   MEMBER COUNT
========================================================= */

function updateMemberCount() {

  const count =
    byId("memberCount");

  if (!count) {
    return;
  }

  count.textContent =
    String(members.length);

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

  const closeModal =
    byId("closeMemberModal");


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


  if (closeModal) {

    closeModal.addEventListener(
      "click",
      closeMemberModal
    );

  }


  const tbody =
    byId("memberRows");


  if (tbody) {

    tbody.addEventListener(
      "click",
      handleTableAction
    );

  }


  document.addEventListener(
    "keydown",
    handleEscape
  );


  console.log(
    "CHAMA LIVE: member events bound"
  );

}


/* =========================================================
   ESCAPE KEY
========================================================= */

function handleEscape(event) {

  if (event.key === "Escape") {

    closeMemberModal();

    closeMemberForm();

  }

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

        const searchable = [

          member.member_number,

          member.name,

          member.phone,

          member.email,

          member.role,

          member.status,

          member.onboarding_status

        ]
          .filter(Boolean)
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
    button.dataset.memberId;


  if (!memberId) {
    return;
  }


  const action =
    button.dataset.action;


  if (action === "view") {

    openMemberModal(
      memberId
    );

  }


  if (action === "edit") {

    openEditMember(
      memberId
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
    members.find(
      item =>
        item.id === memberId
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

  const name =
    byId("memberName");

  const phone =
    byId("memberPhone");

  const email =
    byId("memberEmail");

  const role =
    byId("memberRole");

  const status =
    byId("memberStatus");


  if (memberNumber) {

    memberNumber.value =
      member.member_number || "";

  }


  if (name) {

    name.value =
      member.name || "";

  }


  if (phone) {

    phone.value =
      member.phone || "";

  }


  if (email) {

    email.value =
      member.email || "";

  }


  if (role) {

    role.value =
      member.role || "member";

  }


  if (status) {

    status.value =
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
   SAVE MEMBER
========================================================= */

async function saveMember(event) {

  event.preventDefault();


  clearError();

  clearFormMessage();


  const saveButton =
    byId("saveMemberButton");


  try {

    const memberNumber =
      byId("memberNumber")
        ?.value
        ?.trim();


    const name =
      byId("memberName")
        ?.value
        ?.trim();


    const phone =
      byId("memberPhone")
        ?.value
        ?.trim();


    const email =
      byId("memberEmail")
        ?.value
        ?.trim();


    const role =
      byId("memberRole")
        ?.value ||
      "member";


    const status =
      byId("memberStatus")
        ?.value ||
      "active";


    /* -----------------------------------------------------
       VALIDATION
    ----------------------------------------------------- */

    if (!memberNumber) {

      throw new Error(
        "Please enter the member number."
      );

    }


    if (!name) {

      throw new Error(
        "Please enter the member's full name."
      );

    }


    if (!phone) {

      throw new Error(
        "Please enter the member's phone number."
      );

    }


    if (!groupId) {

      throw new Error(
        "No group is associated with this account."
      );

    }


    if (saveButton) {

      saveButton.disabled = true;

      saveButton.textContent =
        editingMemberId
          ? "Updating..."
          : "Saving...";

    }


    /* =====================================================
       EDIT
    ===================================================== */

    if (editingMemberId) {

      const {
        error
      } =
        await supabase
          .from("members")
          .update({

            member_number:
              memberNumber,

            name:
              name,

            phone:
              phone,

            email:
              email || null,

            role:
              role,

            status:
              status

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


      showFormMessage(
        "Member updated successfully."
      );

    }


    /* =====================================================
       ADD
    ===================================================== */

    else {

      const {
        data: existing,
        error: duplicateError
      } =
        await supabase
          .from("members")
          .select("id")
          .eq(
            "group_id",
            groupId
          )
          .eq(
            "member_number",
            memberNumber
          )
          .limit(1);


      if (duplicateError) {
        throw duplicateError;
      }


      if (
        Array.isArray(existing) &&
        existing.length > 0
      ) {

        throw new Error(
          `Member number ${memberNumber} is already registered in this group.`
        );

      }


      const {
        data,
        error
      } =
        await supabase
          .from("members")
          .insert({

            group_id:
              groupId,

            member_number:
              memberNumber,

            name:
              name,

            phone:
              phone,

            email:
              email || null,

            role:
              role,

            status:
              status,

            join_date:
              new Date()
                .toISOString()
                .slice(
                  0,
                  10
                )

          })
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
            onboarding_status,
            created_at
          `)
          .single();


      if (error) {
        throw error;
      }


      console.log(
        "CHAMA LIVE: member created",
        data
      );


      showFormMessage(
        "Member added successfully."
      );

    }


    /* -----------------------------------------------------
       REFRESH
    ----------------------------------------------------- */

    await loadMembers();

    renderMembers();

    updateMemberCount();


    setTimeout(
      function() {

        closeMemberForm();

      },
      800
    );

  }
  catch (error) {

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
   VIEW MEMBER
========================================================= */

function openMemberModal(memberId) {

  const member =
    members.find(
      item =>
        item.id === memberId
    );


  if (!member) {

    showError(
      new Error(
        "Member could not be found."
      )
    );

    return;

  }


  setText(
    "viewMemberName",
    member.name || "Member"
  );


  setText(
    "viewMemberNumber",
    member.member_number || "—"
  );


  setText(
    "viewMemberPhone",
    member.phone || "—"
  );


  setText(
    "viewMemberEmail",
    member.email || "—"
  );


  setText(
    "viewMemberRole",
    member.role || "member"
  );


  setText(
    "viewMemberStatus",
    member.status || "—"
  );


  setText(
    "viewMemberJoinDate",
    formatDate(member.join_date)
  );


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
   SAFE TEXT
========================================================= */

function setText(id, value) {

  const element =
    byId(id);

  if (!element) {
    return;
  }

  element.textContent =
    String(value ?? "");

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
      "CHAMA LIVE: cannot refresh without group"
    );

    return;

  }


  try {

    showStatus(
      "Refreshing members..."
    );


    await loadMembers();

    renderMembers();

    updateMemberCount();


    clearStatus();

  }
  catch (error) {

    clearStatus();

    showError(error);

  }

}


/* =========================================================
   BACKWARD COMPATIBILITY
========================================================= */

export async function init() {

  return initMembers();

}


console.log(
  "CHAMA LIVE: members.js ready — initMembers() exported"
);
