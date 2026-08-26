import { supabase } from "./supabase.js";

console.log("CHAMA LIVE: members.js loaded");

/* =====================================================
   STATE
===================================================== */

let members = [];
let editingMemberId = null;


/* =====================================================
   HELPERS
===================================================== */

function byId(id) {
  return document.getElementById(id);
}


function showError(message) {

  const errorBox = byId("error");

  if (!errorBox) return;

  errorBox.hidden = false;
  errorBox.textContent = message || "Something went wrong.";

}


function clearError() {

  const errorBox = byId("error");

  if (!errorBox) return;

  errorBox.hidden = true;
  errorBox.textContent = "";

}


function setStatus(message) {

  const status = byId("status");

  if (status) {
    status.textContent = message;
  }

}


function escapeHTML(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =====================================================
   GET CURRENT USER
===================================================== */

async function getCurrentUser() {

  const {
    data,
    error
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!data?.user) {
    throw new Error("You are not logged in.");
  }

  return data.user;
}


/* =====================================================
   GET CURRENT MEMBER
===================================================== */

async function getCurrentMember() {

  const user = await getCurrentUser();

  const {
    data,
    error
  } = await supabase
    .from("members")
    .select("*")
    .eq("user_id", user.id)
    .limit(1);

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    throw new Error(
      "Your account is not linked to a member record."
    );
  }

  return data[0];
}


/* =====================================================
   LOAD MEMBERS
===================================================== */

async function loadMembers() {

  clearError();

  setStatus("Loading members...");

  const currentMember =
    await getCurrentMember();

  const groupId =
    currentMember.group_id;

  if (!groupId) {
    throw new Error(
      "Your member account has no group."
    );
  }

  const {
    data,
    error
  } = await supabase
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
    .eq("group_id", groupId)
    .order("member_number", {
      ascending: true
    });

  if (error) {
    throw error;
  }

  members = data || [];

  renderMembers(members);

  setStatus(
    `${members.length} member${members.length === 1 ? "" : "s"} loaded.`
  );
}


/* =====================================================
   RENDER MEMBERS
===================================================== */

function renderMembers(list) {

  const rows =
    byId("memberRows");

  const count =
    byId("memberCount");

  if (count) {
    count.textContent = list.length;
  }

  if (!rows) return;

  if (list.length === 0) {

    rows.innerHTML = `
      <tr>
        <td colspan="8">
          No members found.
        </td>
      </tr>
    `;

    return;
  }

  rows.innerHTML =
    list.map(member => {

      const status =
        String(member.status || "active").toLowerCase();

      const statusLabel =
        status === "active"
          ? "Active"
          : "Inactive";

      return `
        <tr>

          <td>
            ${escapeHTML(member.member_number || "—")}
          </td>

          <td>
            ${escapeHTML(
              member.membership_number ||
              member.member_number ||
              "—"
            )}
          </td>

          <td>
            <strong>
              ${escapeHTML(member.name || "—")}
            </strong>
          </td>

          <td>
            ${escapeHTML(member.phone || "—")}
          </td>

          <td>
            ${escapeHTML(member.email || "—")}
          </td>

          <td>
            ${escapeHTML(member.role || "member")}
          </td>

          <td>
            ${escapeHTML(statusLabel)}
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
                class="btn btn-secondary btn-view-member"
                data-id="${escapeHTML(member.id)}"
              >
                View
              </button>

              <button
                type="button"
                class="btn btn-primary btn-edit-member"
                data-id="${escapeHTML(member.id)}"
              >
                Edit
              </button>

            </div>

          </td>

        </tr>
      `;

    }).join("");
}


/* =====================================================
   SEARCH
===================================================== */

function setupSearch() {

  const search =
    byId("memberSearch");

  if (!search) return;

  search.addEventListener(
    "input",
    () => {

      const query =
        search.value
          .trim()
          .toLowerCase();

      if (!query) {

        renderMembers(members);

        return;
      }

      const filtered =
        members.filter(member => {

          const values = [

            member.name,
            member.member_number,
            member.membership_number,
            member.phone,
            member.email,
            member.role,
            member.status

          ];

          return values.some(value =>
            String(value || "")
              .toLowerCase()
              .includes(query)
          );

        });

      renderMembers(filtered);

    }
  );
}


/* =====================================================
   ADD / EDIT PANEL
===================================================== */

function openAddForm() {

  editingMemberId = null;

  const panel =
    byId("addMemberPanel");

  const title =
    byId("memberFormTitle");

  const description =
    byId("memberFormDescription");

  const form =
    byId("addMemberForm");

  if (!panel) return;

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

  const status =
    byId("memberStatus");

  if (status) {
    status.value = "active";
  }

  panel.hidden = false;

  panel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}


function openEditForm(member) {

  editingMemberId =
    member.id;

  const panel =
    byId("addMemberPanel");

  const title =
    byId("memberFormTitle");

  const description =
    byId("memberFormDescription");

  if (!panel) return;

  if (title) {
    title.textContent = "Edit Member";
  }

  if (description) {
    description.textContent =
      "Update this member's information.";
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

  const formMessage =
    byId("formMessage");

  if (formMessage) {
    formMessage.style.display = "none";
    formMessage.textContent = "";
  }

  panel.hidden = false;

  panel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


function closeMemberForm() {

  editingMemberId = null;

  const panel =
    byId("addMemberPanel");

  if (panel) {
    panel.hidden = true;
  }

}


/* =====================================================
   FORM MESSAGE
===================================================== */

function showFormMessage(
  message,
  success = false
) {

  const box =
    byId("formMessage");

  if (!box) return;

  box.style.display = "block";

  box.style.background =
    success
      ? "#dcfce7"
      : "#fee2e2";

  box.style.color =
    success
      ? "#166534"
      : "#991b1b";

  box.textContent =
    message;
}


/* =====================================================
   SAVE MEMBER
===================================================== */

async function saveMember(event) {

  event.preventDefault();

  clearError();

  const button =
    byId("saveMemberButton");

  const memberNumber =
    byId("memberNumber")?.value.trim();

  const memberName =
    byId("memberName")?.value.trim();

  const memberPhone =
    byId("memberPhone")?.value.trim();

  const memberEmail =
    byId("memberEmail")?.value.trim();

  const memberRole =
    byId("memberRole")?.value || "member";

  const memberStatus =
    byId("memberStatus")?.value || "active";

  if (!memberNumber) {
    showFormMessage(
      "Enter a member number."
    );
    return;
  }

  if (!memberName) {
    showFormMessage(
      "Enter the member's full name."
    );
    return;
  }

  if (!memberPhone) {
    showFormMessage(
      "Enter the member's phone number."
    );
    return;
  }

  if (button) {
    button.disabled = true;

    button.textContent =
      editingMemberId
        ? "Saving Changes..."
        : "Saving Member...";
  }

  try {

    const currentMember =
      await getCurrentMember();

    const groupId =
      currentMember.group_id;

    if (!groupId) {
      throw new Error(
        "Your account has no group."
      );
    }


    /* ===============================================
       EDIT EXISTING MEMBER
    =============================================== */

    if (editingMemberId) {

      const {
        error
      } = await supabase
        .from("members")
        .update({

          member_number:
            memberNumber,

          name:
            memberName,

          phone:
            memberPhone,

          email:
            memberEmail || null,

          role:
            memberRole,

          status:
            memberStatus

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
        "Member updated successfully.",
        true
      );

    }


    /* ===============================================
       ADD NEW MEMBER
    =============================================== */

    else {

      const {
        error
      } = await supabase
        .from("members")
        .insert({

          group_id:
            groupId,

          member_number:
            memberNumber,

          name:
            memberName,

          phone:
            memberPhone,

          email:
            memberEmail || null,

          role:
            memberRole,

          status:
            memberStatus,

          join_date:
            new Date()
              .toISOString()
              .slice(0, 10)

        });

      if (error) {
        throw error;
      }

      showFormMessage(
        "Member added successfully.",
        true
      );

    }


    await loadMembers();

    setTimeout(() => {

      closeMemberForm();

    }, 700);


  } catch (error) {

    console.error(
      "Save member error:",
      error
    );

    showFormMessage(
      error?.message ||
      "Unable to save member."
    );

  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        editingMemberId
          ? "Save Changes"
          : "Save Member";

    }

  }

}


/* =====================================================
   VIEW MEMBER
===================================================== */

function openViewModal(member) {

  const modal =
    byId("memberModal");

  if (!modal) return;

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
      member.member_number ||
      member.membership_number ||
      "—";
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
      member.role || "—";
  }

  if (status) {
    status.textContent =
      member.status || "—";
  }

  if (joinDate) {
    joinDate.textContent =
      member.join_date || "—";
  }

  modal.hidden = false;
}


function closeViewModal() {

  const modal =
    byId("memberModal");

  if (modal) {
    modal.hidden = true;
  }

}


/* =====================================================
   TABLE ACTIONS
===================================================== */

function setupTableActions() {

  const rows =
    byId("memberRows");

  if (!rows) return;

  rows.addEventListener(
    "click",
    event => {

      const viewButton =
        event.target.closest(
          ".btn-view-member"
        );

      const editButton =
        event.target.closest(
          ".btn-edit-member"
        );


      /* VIEW */

      if (viewButton) {

        const id =
          viewButton.dataset.id;

        const member =
          members.find(
            item =>
              String(item.id) ===
              String(id)
          );

        if (member) {
          openViewModal(member);
        }

        return;
      }


      /* EDIT */

      if (editButton) {

        const id =
          editButton.dataset.id;

        const member =
          members.find(
            item =>
              String(item.id) ===
              String(id)
          );

        if (member) {
          openEditForm(member);
        }

      }

    }
  );
}


/* =====================================================
   BUTTONS
===================================================== */

function setupButtons() {

  const addButton =
    byId("addMemberButton");

  if (addButton) {

    addButton.addEventListener(
      "click",
      openAddForm
    );

  }


  const closeButton =
    byId("closeAddMember");

  if (closeButton) {

    closeButton.addEventListener(
      "click",
      closeMemberForm
    );

  }


  const cancelButton =
    byId("cancelAddMember");

  if (cancelButton) {

    cancelButton.addEventListener(
      "click",
      closeMemberForm
    );

  }


  const form =
    byId("addMemberForm");

  if (form) {

    form.addEventListener(
      "submit",
      saveMember
    );

  }


  const closeModal =
    byId("closeMemberModal");

  if (closeModal) {

    closeModal.addEventListener(
      "click",
      closeViewModal
    );

  }


  const modal =
    byId("memberModal");

  if (modal) {

    modal.addEventListener(
      "click",
      event => {

        if (
          event.target === modal
        ) {
          closeViewModal();
        }

      }
    );

  }

}


/* =====================================================
   INITIALIZE
===================================================== */

async function init() {

  try {

    setupButtons();

    setupSearch();

    setupTableActions();

    await loadMembers();

  } catch (error) {

    console.error(
      "CHAMA LIVE members error:",
      error
    );

    setStatus(
      "Unable to load members."
    );

    showError(
      error?.message ||
      "Unable to load members."
    );

  }

}


/* =====================================================
   START
===================================================== */

init();
