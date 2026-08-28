```javascript
/* =========================================================
   CHAMA LIVE — MEMBERS
   CLEAN FINAL VERSION
   Compatible with layout.js dynamic loading
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


function showError(error) {
  console.error("CHAMA LIVE Members:", error);

  const element = byId("error");

  if (!element) {
    return;
  }

  element.textContent =
    error?.message ||
    String(error) ||
    "Something went wrong.";

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

function showFormMessage(message, type = "success") {
  const element = byId("formMessage");

  if (!element) {
    return;
  }

  element.textContent = message;
  element.style.display = "block";

  if (type === "error") {
    element.style.background = "rgba(220,38,38,.12)";
  } else {
    element.style.background = "rgba(22,163,74,.12)";
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
   INITIALIZE
========================================================= */

export async function init() {

  if (initialized) {
    console.log("CHAMA LIVE: members already initialized");
    return;
  }

  initialized = true;

  try {

    clearError();

    showStatus("Loading members...");


    /* -----------------------------------------------------
       AUTH
    ----------------------------------------------------- */

    currentUser = await requireAuth();

    if (!currentUser) {
      throw new Error("You are not logged in.");
    }


    /* -----------------------------------------------------
       MEMBER
    ----------------------------------------------------- */

    currentMember = await getMyMember();

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

    groupId = currentMember.group_id;


    /* -----------------------------------------------------
       GROUP
    ----------------------------------------------------- */

    currentGroup = await getMyGroup();

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


  const response = await supabase
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
    .eq("group_id", groupId)
    .order("created_at", {
      ascending: true
    });


  if (response.error) {
    throw response.error;
  }


  members = response.data || [];


  console.log(
    "CHAMA LIVE: loaded members:",
    members.length
  );

}


/* =========================================================
   CREATE MEMBER ROW
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

  const accountStatus =
    escapeHtml(
      member.onboarding_status ||
      member.status ||
      "active"
    );


  return `
    <tr data-member-id="${id}">

      <td>${memberNumber}</td>

      <td>${memberNumber}</td>

      <td>${name}</td>

      <td>${phone}</td>

      <td>${email}</td>

      <td>${role}</td>

      <td>${accountStatus}</td>

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

  const tbody = byId("memberRows");

  if (!tbody) {

    console.warn(
      "CHAMA LIVE: #memberRows not found"
    );

    return;
  }


  if (!list.length) {

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
    list
      .map(createMemberRow)
      .join("");

}


/* =========================================================
   MEMBER COUNT
========================================================= */

function updateMemberCount() {

  const count = byId("memberCount");

  if (!count) {
    return;
  }

  count.textContent =
    String(members.length);
}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {

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
    handleEscapeKey
  );

}


/* =========================================================
   ESCAPE KEY
========================================================= */

function handleEscapeKey(event) {

  if (event.key === "Escape") {
    closeMemberModal();
  }

}


/* =========================================================
   SEARCH
========================================================= */

function handleSearch(event) {

  const query =
    String(event.target.value || "")
      .trim()
      .toLowerCase();


  if (!query) {

    renderMembers();

    return;
  }


  const filtered =
    members.filter(member => {

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


      return searchable.includes(query);

    });


  const tbody =
    byId("memberRows");

  if (!tbody) {
    return;
  }


  if (!filtered.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          No matching members found.
        </td>
      </tr>
    `;

    return;
  }


  tbody.innerHTML =
    filtered
      .map(createMemberRow)
      .join("");

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

  const action =
    button.dataset.action;


  if (!memberId) {
    return;
  }


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
    title.textContent = "Add Member";
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
   OPEN EDIT MEMBER
========================================================= */

function openEditMember(memberId) {

  const member =
    members.find(
      item => item.id === memberId
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


  panel?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

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
        ?.trim() || "";


    const name =
      byId("memberName")
        ?.value
        ?.trim() || "";


    const phone =
      byId("memberPhone")
        ?.value
        ?.trim() || "";


    const email =
      byId("memberEmail")
        ?.value
        ?.trim() || "";


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
       UPDATE
    ===================================================== */

    if (editingMemberId) {

      const response =
        await supabase
          .from("members")
          .update({
            member_number: memberNumber,
            name: name,
            phone: phone,
            email: email || null,
            role: role,
            status: status
          })
          .eq("id", editingMemberId)
          .eq("group_id", groupId);


      if (response.error) {
        throw response.error;
      }


      showFormMessage(
        "Member updated successfully."
      );

    }


    /* =====================================================
       INSERT
    ===================================================== */

    else {

      const duplicateResponse =
        await supabase
          .from("members")
          .select("id")
          .eq("group_id", groupId)
          .eq("member_number", memberNumber)
          .limit(1);


      if (duplicateResponse.error) {
        throw duplicateResponse.error;
      }


      if (
        duplicateResponse.data &&
        duplicateResponse.data.length > 0
      ) {

        throw new Error(
          "Member number " +
          memberNumber +
          " is already registered in this group."
        );

      }


      const insertResponse =
        await supabase
          .from("members")
          .insert({
            group_id: groupId,
            member_number: memberNumber,
            name: name,
            phone: phone,
            email: email || null,
            role: role,
            status: status,
            join_date:
              new Date()
                .toISOString()
                .slice(0, 10)
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


      if (insertResponse.error) {
        throw insertResponse.error;
      }


      console.log(
        "CHAMA LIVE: member created",
        insertResponse.data
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
      closeMemberForm,
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
      item => item.id === memberId
    );


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
      formatDate(member.join_date);
  }


  const modal =
    byId("memberModal");


  if (!modal) {
    return;
  }


  modal.hidden = false;
  modal.style.display = "flex";


  byId(
    "closeMemberModal"
  )?.focus();

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
  modal.style.display = "none";

}


/* =========================================================
   REFRESH
========================================================= */

export async function refreshMembers() {

  if (!groupId) {
    return;
  }


  try {

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
   IMPORTANT
   DO NOT AUTO-RUN init() HERE.
   
   layout.js is responsible for loading this module
   and calling init().
========================================================= */

console.log(
  "CHAMA LIVE: members.js ready"
);
```
