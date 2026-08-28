```javascript
/* =========================================================
   CHAMA LIVE — MEMBERS
   COMPLETE STABLE VERSION
   Loaded dynamically by layout.js
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


/* =========================================================
   STATUS / ERROR MESSAGES
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

  console.error(
    "CHAMA LIVE: Members error",
    error
  );

  const element = byId("error");

  if (!element) {
    return;
  }

  element.textContent =
    error && error.message
      ? error.message
      : String(error || "Something went wrong.");

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

  element.textContent = message || "";
  element.style.display = message ? "block" : "none";

  if (type === "error") {

    element.style.background =
      "rgba(220, 38, 38, .12)";

    element.style.color =
      "#b91c1c";

  } else {

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

    showStatus("Loading members...");


    /* -----------------------------------------------------
       AUTHENTICATION
    ----------------------------------------------------- */

    currentUser = await requireAuth();

    if (!currentUser) {

      throw new Error(
        "You are not logged in."
      );

    }


    /* -----------------------------------------------------
       CURRENT MEMBER
    ----------------------------------------------------- */

    currentMember = await getMyMember();

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


    /* -----------------------------------------------------
       CURRENT GROUP
    ----------------------------------------------------- */

    currentGroup =
      await getMyGroup();

    if (!currentGroup) {

      throw new Error(
        "Group information could not be found."
      );

    }


    console.log(
      "CHAMA LIVE: members current member",
      currentMember
    );

    console.log(
      "CHAMA LIVE: members current group",
      currentGroup
    );


    /* -----------------------------------------------------
       LOAD MEMBERS
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


  const result =
    await supabase
      .from("members")
      .select(
        "id, group_id, user_id, member_number, name, phone, email, role, join_date, status, created_at"
      )
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


  console.log(
    "CHAMA LIVE: loaded members:",
    members.length
  );

}


/* =========================================================
   CREATE MEMBER TABLE ROW
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


  return `
<tr data-member-id="${id}">

  <td>${memberNumber}</td>

  <td>${name}</td>

  <td>${phone}</td>

  <td>${email}</td>

  <td>${role}</td>

  <td>${status}</td>

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


  const rows =
    Array.isArray(list)
      ? list
      : [];


  if (!rows.length) {

    tbody.innerHTML = `
<tr>
  <td colspan="7">
    No members registered yet.
  </td>
</tr>
`;

    return;

  }


  let html = "";


  rows.forEach(function(member) {

    html +=
      createMemberRow(member);

  });


  tbody.innerHTML =
    html;

}


/* =========================================================
   MEMBER COUNT
========================================================= */

function updateMemberCount() {

  const element =
    byId("memberCount");


  if (!element) {
    return;
  }


  element.textContent =
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

  const tbody =
    byId("memberRows");


  /* -------------------------------------------------------
     ADD MEMBER
  ------------------------------------------------------- */

  if (addButton) {

    addButton.addEventListener(
      "click",
      openAddMember
    );

  }


  /* -------------------------------------------------------
     CLOSE ADD MEMBER
  ------------------------------------------------------- */

  if (closeButton) {

    closeButton.addEventListener(
      "click",
      closeMemberForm
    );

  }


  /* -------------------------------------------------------
     CANCEL ADD MEMBER
  ------------------------------------------------------- */

  if (cancelButton) {

    cancelButton.addEventListener(
      "click",
      closeMemberForm
    );

  }


  /* -------------------------------------------------------
     FORM SUBMIT
  ------------------------------------------------------- */

  if (form) {

    form.addEventListener(
      "submit",
      saveMember
    );

  }


  /* -------------------------------------------------------
     SEARCH
  ------------------------------------------------------- */

  if (search) {

    search.addEventListener(
      "input",
      handleSearch
    );

  }


  /* -------------------------------------------------------
     CLOSE MEMBER MODAL
  ------------------------------------------------------- */

  if (closeModal) {

    closeModal.addEventListener(
      "click",
      closeMemberModal
    );

  }


  /* -------------------------------------------------------
     TABLE ACTIONS
  ------------------------------------------------------- */

  if (tbody) {

    tbody.addEventListener(
      "click",
      handleTableAction
    );

  }


  /* -------------------------------------------------------
     ESCAPE KEY
  ------------------------------------------------------- */

  document.addEventListener(
    "keydown",
    function(event) {

      if (event.key === "Escape") {

        closeMemberModal();

        closeMemberForm();

      }

    }
  );

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
    members.filter(function(member) {

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
          .filter(function(value) {

            return (
              value !== null &&
              value !== undefined
            );

          })
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
  <td colspan="7">
    No matching members found.
  </td>
</tr>
`;

    return;

  }


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
    members.find(function(item) {

      return item.id === memberId;

    });


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
   SAVE MEMBER
========================================================= */

async function saveMember(event) {

  event.preventDefault();

  clearError();

  clearFormMessage();


  const saveButton =
    byId("saveMemberButton");


  try {

    /* -----------------------------------------------------
       FORM ELEMENTS
    ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       FORM VALUES
    ----------------------------------------------------- */

    const memberNumber =
      memberNumberElement
        ? memberNumberElement.value.trim()
        : "";


    const name =
      nameElement
        ? nameElement.value.trim()
        : "";


    const phone =
      phoneElement
        ? phoneElement.value.trim()
        : "";


    const email =
      emailElement
        ? emailElement.value.trim()
        : "";


    const role =
      roleElement
        ? roleElement.value
        : "member";


    const status =
      statusElement
        ? statusElement.value
        : "active";


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


    /* -----------------------------------------------------
       BUTTON STATE
    ----------------------------------------------------- */

    if (saveButton) {

      saveButton.disabled = true;

      saveButton.textContent =
        editingMemberId
          ? "Updating..."
          : "Saving...";

    }


    /* =====================================================
       UPDATE EXISTING MEMBER
    ===================================================== */

    if (editingMemberId) {

      /* ---------------------------------------------------
         CHECK DUPLICATE MEMBER NUMBER
      --------------------------------------------------- */

      const duplicateResult =
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
          .neq(
            "id",
            editingMemberId
          )
          .limit(1);


      if (duplicateResult.error) {

        throw duplicateResult.error;

      }


      if (
        duplicateResult.data &&
        duplicateResult.data.length > 0
      ) {

        throw new Error(
          "Member number " +
          memberNumber +
          " is already registered in this group."
        );

      }


      /* ---------------------------------------------------
         UPDATE
      --------------------------------------------------- */

      const updateResult =
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


      if (updateResult.error) {

        throw updateResult.error;

      }


      console.log(
        "CHAMA LIVE: member updated",
        editingMemberId
      );


      showFormMessage(
        "Member updated successfully.",
        "success"
      );

    }


    /* =====================================================
       CREATE NEW MEMBER
    ===================================================== */

    else {

      /* ---------------------------------------------------
         CHECK DUPLICATE MEMBER NUMBER
      --------------------------------------------------- */

      const duplicateResult =
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


      if (duplicateResult.error) {

        throw duplicateResult.error;

      }


      if (
        duplicateResult.data &&
        duplicateResult.data.length > 0
      ) {

        throw new Error(
          "Member number " +
          memberNumber +
          " is already registered in this group."
        );

      }


      /* ---------------------------------------------------
         INSERT
      --------------------------------------------------- */

      const insertResult =
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
                .slice(0, 10)

          })
          .select(
            "id, group_id, user_id, member_number, name, phone, email, role, join_date, status, created_at"
          )
          .single();


      if (insertResult.error) {

        throw insertResult.error;

      }


      console.log(
        "CHAMA LIVE: member created",
        insertResult.data
      );


      showFormMessage(
        "Member added successfully.",
        "success"
      );

    }


    /* =====================================================
       REFRESH TABLE
    ===================================================== */

    await loadMembers();

    renderMembers();

    updateMemberCount();


    /* -----------------------------------------------------
       CLOSE FORM AFTER SUCCESS
    ----------------------------------------------------- */

    setTimeout(
      function() {

        closeMemberForm();

      },
      800
    );

  }
  catch (error) {

    console.error(
      "CHAMA LIVE: save member failed",
      error
    );


    showFormMessage(
      error && error.message
        ? error.message
        : String(error),
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
    members.find(function(item) {

      return item.id === memberId;

    });


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


    console.log(
      "CHAMA LIVE: members refreshed"
    );

  }
  catch (error) {

    showStatus("");

    showError(error);

  }

}


/* =========================================================
   NO AUTO INIT
=========================================================

   layout.js dynamically imports members.js and calls:

       await module.init()

   Therefore this file must NOT call init()
   automatically.
========================================================= */

console.log(
  "CHAMA LIVE: members.js ready"
);
```
