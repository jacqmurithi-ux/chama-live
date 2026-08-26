import { supabase } from "./supabase.js";

console.log("CHAMA LIVE: members.js loaded");


let currentGroupId = null;
let allMembers = [];
let editingMemberId = null;


/* =========================================================
   HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function showError(message) {

  const box = byId("error");

  if (!box) return;

  box.hidden = false;
  box.textContent = message;
}


function clearError() {

  const box = byId("error");

  if (!box) return;

  box.hidden = true;
  box.textContent = "";
}


/* =========================================================
   CURRENT USER
========================================================= */

async function getCurrentUser() {

  const {
    data,
    error
  } = await supabase.auth.getUser();

  if (error) throw error;

  if (!data?.user) {
    throw new Error("You are not logged in.");
  }

  return data.user;
}


/* =========================================================
   CURRENT MEMBER
========================================================= */

async function getCurrentMember(userId) {

  const {
    data,
    error
  } = await supabase
    .from("members")
    .select("*")
    .eq("user_id", userId)
    .limit(1);

  if (error) throw error;

  if (!data?.length) {
    throw new Error(
      "No member record is linked to this account."
    );
  }

  return data[0];
}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  clearError();

  const status = byId("status");

  try {

    if (status) {
      status.textContent = "Loading members...";
    }

    const user = await getCurrentUser();

    const currentMember =
      await getCurrentMember(user.id);

    currentGroupId =
      currentMember.group_id;

    if (!currentGroupId) {
      throw new Error(
        "Your account is not linked to a group."
      );
    }

    const {
      data,
      error
    } = await supabase
      .from("members")
      .select("*")
      .eq("group_id", currentGroupId)
      .order("created_at", {
        ascending: true
      });

    if (error) throw error;

    allMembers = data || [];

    renderMembers(allMembers);

    window.CHAMA_CURRENT_GROUP_ID =
      currentGroupId;

    if (status) {
      status.textContent = "";
    }

  } catch (error) {

    console.error(
      "Members loading error:",
      error
    );

    if (status) {
      status.textContent = "";
    }

    showError(
      error.message ||
      "Unable to load members."
    );
  }
}


/* =========================================================
   RENDER
========================================================= */

function renderMembers(members) {

  const rows =
    byId("memberRows");

  const count =
    byId("memberCount");

  if (!rows) return;

  if (count) {
    count.textContent =
      members.length;
  }

  if (!members.length) {

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
    members.map(member => {

      const number =
        member.member_number || "—";

      const name =
        member.name || "—";

      const phone =
        member.phone || "—";

      const email =
        member.email || "—";

      const role =
        member.role || "member";

      const status =
        member.status || "active";


      return `
        <tr>

          <td>
            ${escapeHtml(number)}
          </td>

          <td>
            ${escapeHtml(number)}
          </td>

          <td>
            ${escapeHtml(name)}
          </td>

          <td>
            ${escapeHtml(phone)}
          </td>

          <td>
            ${escapeHtml(email)}
          </td>

          <td>
            ${escapeHtml(role)}
          </td>

          <td>
            ${escapeHtml(status)}
          </td>

          <td>

            <button
              type="button"
              class="btn btn-secondary view-member"
              data-id="${escapeHtml(member.id)}"
            >
              View
            </button>

            <button
              type="button"
              class="btn btn-secondary edit-member"
              data-id="${escapeHtml(member.id)}"
            >
              Edit
            </button>

            ${
              status === "active"
              ? `
                <button
                  type="button"
                  class="btn btn-secondary deactivate-member"
                  data-id="${escapeHtml(member.id)}"
                >
                  Deactivate
                </button>
              `
              : `
                <button
                  type="button"
                  class="btn btn-secondary activate-member"
                  data-id="${escapeHtml(member.id)}"
                >
                  Activate
                </button>
              `
            }

          </td>

        </tr>
      `;

    }).join("");
}


/* =========================================================
   SEARCH
========================================================= */

function searchMembers() {

  const input =
    byId("memberSearch");

  if (!input) return;

  const search =
    input.value
      .trim()
      .toLowerCase();


  if (!search) {

    renderMembers(
      allMembers
    );

    return;
  }


  const filtered =
    allMembers.filter(member => {

      return (

        String(
          member.member_number || ""
        )
          .toLowerCase()
          .includes(search)

        ||

        String(
          member.name || ""
        )
          .toLowerCase()
          .includes(search)

        ||

        String(
          member.phone || ""
        )
          .toLowerCase()
          .includes(search)

        ||

        String(
          member.email || ""
        )
          .toLowerCase()
          .includes(search)

        ||

        String(
          member.role || ""
        )
          .toLowerCase()
          .includes(search)

      );

    });


  renderMembers(filtered);
}


/* =========================================================
   ADD / EDIT PANEL
========================================================= */

function openMemberForm(member = null) {

  const panel =
    byId("addMemberPanel");

  if (!panel) return;


  panel.hidden = false;


  const title =
    byId("memberFormTitle");

  const description =
    byId("memberFormDescription");


  if (member) {

    editingMemberId =
      member.id;

    title.textContent =
      "Edit Member";

    description.textContent =
      "Update this member's information.";


    byId("memberNumber").value =
      member.member_number || "";

    byId("memberName").value =
      member.name || "";

    byId("memberPhone").value =
      member.phone || "";

    byId("memberEmail").value =
      member.email || "";

    byId("memberRole").value =
      member.role || "member";


    const statusField =
      byId("memberStatus");

    if (statusField) {
      statusField.value =
        member.status || "active";
    }


    byId("saveMemberButton").textContent =
      "Update Member";

  } else {

    editingMemberId = null;

    title.textContent =
      "Add Member";

    description.textContent =
      "Register a new member in your group.";


    byId("addMemberForm").reset();

    byId("memberRole").value =
      "member";


    const statusField =
      byId("memberStatus");

    if (statusField) {
      statusField.value =
        "active";
    }


    byId("saveMemberButton").textContent =
      "Save Member";
  }


  const message =
    byId("formMessage");

  if (message) {
    message.style.display = "none";
    message.textContent = "";
  }


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================================================
   CLOSE FORM
========================================================= */

function closeMemberForm() {

  const panel =
    byId("addMemberPanel");

  if (!panel) return;

  panel.hidden = true;

  editingMemberId = null;
}


/* =========================================================
   SAVE MEMBER
========================================================= */

async function saveMember(event) {

  event.preventDefault();

  const button =
    byId("saveMemberButton");


  const memberNumber =
    byId("memberNumber")
      .value
      .trim();


  const name =
    byId("memberName")
      .value
      .trim();


  const phone =
    byId("memberPhone")
      .value
      .trim();


  const email =
    byId("memberEmail")
      .value
      .trim()
      .toLowerCase();


  const role =
    byId("memberRole")
      .value;


  const statusField =
    byId("memberStatus");


  const status =
    statusField
      ? statusField.value
      : "active";


  if (!memberNumber) {

    showFormMessage(
      "Member number is required.",
      true
    );

    return;
  }


  if (!name) {

    showFormMessage(
      "Full name is required.",
      true
    );

    return;
  }


  if (!phone) {

    showFormMessage(
      "Phone number is required.",
      true
    );

    return;
  }


  try {

    button.disabled = true;

    button.textContent =
      editingMemberId
      ? "Updating..."
      : "Saving...";


    /* -----------------------------------------------------
       DUPLICATE MEMBER NUMBER
    ----------------------------------------------------- */

    let duplicateQuery =
      supabase
        .from("members")
        .select("id")
        .eq(
          "group_id",
          currentGroupId
        )
        .eq(
          "member_number",
          memberNumber
        );


    if (editingMemberId) {

      duplicateQuery =
        duplicateQuery.neq(
          "id",
          editingMemberId
        );
    }


    const {
      data: duplicates,
      error: duplicateError
    } =
      await duplicateQuery;


    if (duplicateError) {
      throw duplicateError;
    }


    if (duplicates?.length) {

      throw new Error(
        `Member number ${memberNumber} already exists.`
      );
    }


    /* -----------------------------------------------------
       UPDATE
    ----------------------------------------------------- */

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
            currentGroupId
          );


      if (error) {
        throw error;
      }


      showFormMessage(
        `${name} has been updated successfully.`,
        false
      );

    }


    /* -----------------------------------------------------
       INSERT
    ----------------------------------------------------- */

    else {

      const {
        data,
        error
      } =
        await supabase
          .from("members")
          .insert({

            group_id:
              currentGroupId,

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
          .select()
          .single();


      if (error) {
        throw error;
      }


      console.log(
        "New member:",
        data
      );


      showFormMessage(
        `${name} has been added successfully.`,
        false
      );
    }


    await loadMembers();


    setTimeout(
      closeMemberForm,
      700
    );


  } catch (error) {

    console.error(
      "Save member error:",
      error
    );


    showFormMessage(
      error.message ||
      "Unable to save member.",
      true
    );


  } finally {

    button.disabled = false;

    button.textContent =
      editingMemberId
      ? "Update Member"
      : "Save Member";
  }
}


/* =========================================================
   VIEW MEMBER
========================================================= */

function viewMember(memberId) {

  const member =
    allMembers.find(
      item =>
        String(item.id) ===
        String(memberId)
    );


  if (!member) return;


  const modal =
    byId("memberModal");

  if (!modal) return;


  byId("viewMemberName").textContent =
    member.name || "—";


  byId("viewMemberNumber").textContent =
    member.member_number || "—";


  byId("viewMemberPhone").textContent =
    member.phone || "—";


  byId("viewMemberEmail").textContent =
    member.email || "—";


  byId("viewMemberRole").textContent =
    member.role || "member";


  byId("viewMemberStatus").textContent =
    member.status || "active";


  byId("viewMemberJoinDate").textContent =
    member.join_date || "—";


  modal.hidden = false;
}


/* =========================================================
   CLOSE VIEW
========================================================= */

function closeMemberModal() {

  const modal =
    byId("memberModal");

  if (modal) {
    modal.hidden = true;
  }
}


/* =========================================================
   EDIT
========================================================= */

function editMember(memberId) {

  const member =
    allMembers.find(
      item =>
        String(item.id) ===
        String(memberId)
    );


  if (!member) return;


  openMemberForm(
    member
  );
}


/* =========================================================
   CHANGE STATUS
========================================================= */

async function changeMemberStatus(
  memberId,
  newStatus
) {

  const member =
    allMembers.find(
      item =>
        String(item.id) ===
        String(memberId)
    );


  if (!member) return;


  const action =
    newStatus === "active"
      ? "activate"
      : "deactivate";


  const confirmed =
    confirm(
      `Are you sure you want to ${action} ${member.name}?`
    );


  if (!confirmed) return;


  try {

    const {
      error
    } =
      await supabase
        .from("members")
        .update({
          status: newStatus
        })
        .eq(
          "id",
          memberId
        )
        .eq(
          "group_id",
          currentGroupId
        );


    if (error) {
      throw error;
    }


    await loadMembers();


  } catch (error) {

    console.error(
      "Status update error:",
      error
    );


    showError(
      error.message ||
      "Unable to update member status."
    );
  }
}


/* =========================================================
   FORM MESSAGE
========================================================= */

function showFormMessage(
  message,
  isError
) {

  const box =
    byId("formMessage");

  if (!box) return;


  box.style.display =
    "block";

  box.textContent =
    message;


  if (isError) {

    box.style.background =
      "#fee2e2";

    box.style.color =
      "#991b1b";

  } else {

    box.style.background =
      "#dcfce7";

    box.style.color =
      "#166534";
  }
}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  byId("addMemberButton")
    ?.addEventListener(
      "click",
      () => openMemberForm()
    );


  byId("closeAddMember")
    ?.addEventListener(
      "click",
      closeMemberForm
    );


  byId("cancelAddMember")
    ?.addEventListener(
      "click",
      closeMemberForm
    );


  byId("addMemberForm")
    ?.addEventListener(
      "submit",
      saveMember
    );


  byId("memberSearch")
    ?.addEventListener(
      "input",
      searchMembers
    );


  byId("closeMemberModal")
    ?.addEventListener(
      "click",
      closeMemberModal
    );


  document.addEventListener(
    "click",
    event => {

      const viewButton =
        event.target.closest(
          ".view-member"
        );

      if (viewButton) {

        viewMember(
          viewButton.dataset.id
        );

        return;
      }


      const editButton =
        event.target.closest(
          ".edit-member"
        );

      if (editButton) {

        editMember(
          editButton.dataset.id
        );

        return;
      }


      const deactivateButton =
        event.target.closest(
          ".deactivate-member"
        );

      if (deactivateButton) {

        changeMemberStatus(
          deactivateButton.dataset.id,
          "inactive"
        );

        return;
      }


      const activateButton =
        event.target.closest(
          ".activate-member"
        );

      if (activateButton) {

        changeMemberStatus(
          activateButton.dataset.id,
          "active"
        );

      }

    }
  );
}


/* =========================================================
   INIT
========================================================= */

async function initMembers() {

  setupEvents();

  await loadMembers();

}


initMembers();


export {
  initMembers
};
