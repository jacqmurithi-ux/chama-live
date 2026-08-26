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

  if (error) {
    throw error;
  }

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

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {

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

  const statusBox = byId("status");

  try {

    if (statusBox) {
      statusBox.textContent =
        "Loading members...";
    }


    const user =
      await getCurrentUser();


    const currentMember =
      await getCurrentMember(
        user.id
      );


    currentGroupId =
      currentMember.group_id;


    if (!currentGroupId) {

      throw new Error(
        "Your account is not linked to a group."
      );

    }


    console.log(
      "CURRENT GROUP:",
      currentGroupId
    );


    const {
      data,
      error
    } =
      await supabase
        .from("members")
        .select("*")
        .eq(
          "group_id",
          currentGroupId
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


    allMembers =
      data || [];


    console.log(
      "MEMBERS:",
      allMembers
    );


    renderMembers(
      allMembers
    );


    if (statusBox) {
      statusBox.textContent = "";
    }


  } catch (error) {

    console.error(
      "LOAD MEMBERS ERROR:",
      error
    );


    if (statusBox) {
      statusBox.textContent = "";
    }


    showError(
      error?.message ||
      "Unable to load members."
    );

  }

}


/* =========================================================
   RENDER MEMBERS
========================================================= */

function renderMembers(
  members
) {

  const rows =
    byId("memberRows");

  const count =
    byId("memberCount");


  if (!rows) {
    return;
  }


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
    members
      .map(member => {

        const id =
          member.id;

        const memberNumber =
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
              ${escapeHtml(memberNumber)}
            </td>

            <td>
              ${escapeHtml(memberNumber)}
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
                data-member-id="${escapeHtml(id)}"
              >
                View
              </button>

              <button
                type="button"
                class="btn btn-secondary edit-member"
                data-member-id="${escapeHtml(id)}"
              >
                Edit
              </button>

              ${
                status === "active"

                ? `

                  <button
                    type="button"
                    class="btn btn-secondary deactivate-member"
                    data-member-id="${escapeHtml(id)}"
                  >
                    Deactivate
                  </button>

                `

                : `

                  <button
                    type="button"
                    class="btn btn-secondary activate-member"
                    data-member-id="${escapeHtml(id)}"
                  >
                    Activate
                  </button>

                `
              }

            </td>

          </tr>

        `;

      })
      .join("");

}


/* =========================================================
   SEARCH
========================================================= */

function searchMembers() {

  const input =
    byId("memberSearch");

  if (!input) {
    return;
  }


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
    allMembers.filter(
      member => {

        const memberNumber =
          String(
            member.member_number || ""
          ).toLowerCase();


        const name =
          String(
            member.name || ""
          ).toLowerCase();


        const phone =
          String(
            member.phone || ""
          ).toLowerCase();


        const email =
          String(
            member.email || ""
          ).toLowerCase();


        return (

          memberNumber.includes(search) ||

          name.includes(search) ||

          phone.includes(search) ||

          email.includes(search)

        );

      }
    );


  renderMembers(
    filtered
  );

}


/* =========================================================
   FIND MEMBER
========================================================= */

function findMember(memberId) {

  return allMembers.find(
    member =>
      String(member.id) ===
      String(memberId)
  );

}


/* =========================================================
   VIEW MEMBER
========================================================= */

function viewMember(memberId) {

  console.log(
    "VIEW MEMBER ID:",
    memberId
  );


  console.log(
    "AVAILABLE MEMBERS:",
    allMembers
  );


  const member =
    findMember(
      memberId
    );


  if (!member) {

    console.error(
      "Member not found:",
      memberId
    );

    showError(
      "The selected member could not be found."
    );

    return;

  }


  console.log(
    "VIEWING MEMBER:",
    member
  );


  const modal =
    byId("memberModal");


  if (!modal) {

    console.error(
      "memberModal element not found."
    );

    return;

  }


  /* -------------------------------------------------------
     NAME
  ------------------------------------------------------- */

  const name =
    member.name ||
    "Member";


  byId(
    "viewMemberName"
  ).textContent =
    name;


  /* -------------------------------------------------------
     MEMBER NUMBER
  ------------------------------------------------------- */

  byId(
    "viewMemberNumber"
  ).textContent =
    member.member_number ||
    "—";


  /* -------------------------------------------------------
     PHONE
  ------------------------------------------------------- */

  byId(
    "viewMemberPhone"
  ).textContent =
    member.phone ||
    "—";


  /* -------------------------------------------------------
     EMAIL
  ------------------------------------------------------- */

  byId(
    "viewMemberEmail"
  ).textContent =
    member.email ||
    "—";


  /* -------------------------------------------------------
     ROLE
  ------------------------------------------------------- */

  byId(
    "viewMemberRole"
  ).textContent =
    member.role ||
    "member";


  /* -------------------------------------------------------
     STATUS
  ------------------------------------------------------- */

  byId(
    "viewMemberStatus"
  ).textContent =
    member.status ||
    "active";


  /* -------------------------------------------------------
     JOIN DATE
  ------------------------------------------------------- */

  byId(
    "viewMemberJoinDate"
  ).textContent =
    member.join_date ||
    "—";


  /* -------------------------------------------------------
     SHOW MODAL
  ------------------------------------------------------- */

  modal.hidden =
    false;

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

}


/* =========================================================
   OPEN ADD MEMBER FORM
========================================================= */

function openMemberForm(
  member = null
) {

  const panel =
    byId("addMemberPanel");

  if (!panel) {
    return;
  }


  panel.hidden =
    false;


  const title =
    byId("memberFormTitle");


  const description =
    byId("memberFormDescription");


  const saveButton =
    byId("saveMemberButton");


  if (member) {

    editingMemberId =
      member.id;


    if (title) {

      title.textContent =
        "Edit Member";

    }


    if (description) {

      description.textContent =
        "Update this member's information.";

    }


    byId(
      "memberNumber"
    ).value =
      member.member_number || "";


    byId(
      "memberName"
    ).value =
      member.name || "";


    byId(
      "memberPhone"
    ).value =
      member.phone || "";


    byId(
      "memberEmail"
    ).value =
      member.email || "";


    byId(
      "memberRole"
    ).value =
      member.role || "member";


    byId(
      "memberStatus"
    ).value =
      member.status || "active";


    if (saveButton) {

      saveButton.textContent =
        "Update Member";

    }

  } else {

    editingMemberId =
      null;


    if (title) {

      title.textContent =
        "Add Member";

    }


    if (description) {

      description.textContent =
        "Register a new member in your group.";

    }


    const form =
      byId("addMemberForm");


    if (form) {
      form.reset();
    }


    byId(
      "memberRole"
    ).value =
      "member";


    byId(
      "memberStatus"
    ).value =
      "active";


    if (saveButton) {

      saveButton.textContent =
        "Save Member";

    }

  }


  const message =
    byId("formMessage");


  if (message) {

    message.style.display =
      "none";

    message.textContent =
      "";

  }


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* =========================================================
   CLOSE ADD / EDIT FORM
========================================================= */

function closeMemberForm() {

  const panel =
    byId("addMemberPanel");

  if (panel) {

    panel.hidden =
      true;

  }


  editingMemberId =
    null;

}


/* =========================================================
   FORM MESSAGE
========================================================= */

function showFormMessage(
  message,
  error = false
) {

  const box =
    byId("formMessage");


  if (!box) {
    return;
  }


  box.style.display =
    "block";


  box.textContent =
    message;


  if (error) {

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
   SAVE MEMBER
========================================================= */

async function saveMember(
  event
) {

  event.preventDefault();


  clearError();


  const button =
    byId("saveMemberButton");


  const memberNumber =
    byId("memberNumber")
      ?.value
      .trim();


  const name =
    byId("memberName")
      ?.value
      .trim();


  const phone =
    byId("memberPhone")
      ?.value
      .trim();


  const email =
    byId("memberEmail")
      ?.value
      .trim()
      .toLowerCase();


  const role =
    byId("memberRole")
      ?.value;


  const status =
    byId("memberStatus")
      ?.value ||
      "active";


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

    if (button) {

      button.disabled =
        true;

      button.textContent =
        editingMemberId
          ? "Updating..."
          : "Saving...";

    }


    /* -------------------------------------------------------
       CHECK DUPLICATE MEMBER NUMBER
    ------------------------------------------------------- */

    let query =
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

      query =
        query.neq(
          "id",
          editingMemberId
        );

    }


    const {
      data: duplicates,
      error: duplicateError
    } =
      await query;


    if (duplicateError) {
      throw duplicateError;
    }


    if (duplicates?.length) {

      throw new Error(
        `Member number ${memberNumber} already exists.`
      );

    }


    /* -------------------------------------------------------
       UPDATE
    ------------------------------------------------------- */

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
        `${name} updated successfully.`
      );

    }


    /* -------------------------------------------------------
       INSERT
    ------------------------------------------------------- */

    else {

      const {
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

          });


      if (error) {
        throw error;
      }


      showFormMessage(
        `${name} added successfully.`
      );

    }


    await loadMembers();


    setTimeout(
      () => {

        closeMemberForm();

      },
      700
    );


  } catch (error) {

    console.error(
      "SAVE MEMBER ERROR:",
      error
    );


    showFormMessage(
      error?.message ||
      "Unable to save member.",
      true
    );


  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        editingMemberId
          ? "Update Member"
          : "Save Member";

    }

  }

}


/* =========================================================
   EDIT MEMBER
========================================================= */

function editMember(
  memberId
) {

  const member =
    findMember(
      memberId
    );


  if (!member) {

    showError(
      "The selected member could not be found."
    );

    return;

  }


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
    findMember(
      memberId
    );


  if (!member) {
    return;
  }


  const action =
    newStatus === "active"
      ? "activate"
      : "deactivate";


  const confirmed =
    window.confirm(
      `Are you sure you want to ${action} ${member.name}?`
    );


  if (!confirmed) {
    return;
  }


  try {

    const {
      error
    } =
      await supabase
        .from("members")
        .update({
          status:
            newStatus
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
      "STATUS UPDATE ERROR:",
      error
    );


    showError(
      error?.message ||
      "Unable to update member status."
    );

  }

}


/* =========================================================
   EVENT HANDLERS
========================================================= */

function setupEvents() {


  /* ADD */

  byId(
    "addMemberButton"
  )?.addEventListener(
    "click",
    () => {

      openMemberForm();

    }
  );


  /* CLOSE ADD */

  byId(
    "closeAddMember"
  )?.addEventListener(
    "click",
    closeMemberForm
  );


  /* CANCEL */

  byId(
    "cancelAddMember"
  )?.addEventListener(
    "click",
    closeMemberForm
  );


  /* FORM */

  byId(
    "addMemberForm"
  )?.addEventListener(
    "submit",
    saveMember
  );


  /* SEARCH */

  byId(
    "memberSearch"
  )?.addEventListener(
    "input",
    searchMembers
  );


  /* CLOSE MODAL */

  byId(
    "closeMemberModal"
  )?.addEventListener(
    "click",
    closeMemberModal
  );


  /* TABLE BUTTONS */

  const rows =
    byId("memberRows");


  if (rows) {

    rows.addEventListener(
      "click",
      event => {


        /* VIEW */

        const viewButton =
          event.target.closest(
            ".view-member"
          );


        if (viewButton) {

          viewMember(
            viewButton.dataset.memberId
          );

          return;

        }


        /* EDIT */

        const editButton =
          event.target.closest(
            ".edit-member"
          );


        if (editButton) {

          editMember(
            editButton.dataset.memberId
          );

          return;

        }


        /* DEACTIVATE */

        const deactivateButton =
          event.target.closest(
            ".deactivate-member"
          );


        if (deactivateButton) {

          changeMemberStatus(
            deactivateButton.dataset.memberId,
            "inactive"
          );

          return;

        }


        /* ACTIVATE */

        const activateButton =
          event.target.closest(
            ".activate-member"
          );


        if (activateButton) {

          changeMemberStatus(
            activateButton.dataset.memberId,
            "active"
          );

        }

      }
    );

  }


  /* CLOSE MODAL WHEN CLICKING BACKDROP */

  byId(
    "memberModal"
  )?.addEventListener(
    "click",
    event => {

      if (
        event.target.id ===
        "memberModal"
      ) {

        closeMemberModal();

      }

    }
  );

}


/* =========================================================
   INITIALIZE
========================================================= */

async function initMembers() {

  console.log(
    "CHAMA LIVE: initializing members..."
  );


  setupEvents();


  await loadMembers();


  console.log(
    "CHAMA LIVE: members ready."
  );

}


initMembers();


export {
  initMembers
};
