```javascript
/* =========================================================
   CHAMA LIVE — MEMBERS
   Clean Final Version
   Loaded dynamically by layout.js
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember,
  showError,
  clearError
} from "./auth.js";


/* =========================================================
   STATE
========================================================= */

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
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function formatDate(value) {

  if (!value) {

    return "—";

  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "—";

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


function setStatus(message) {

  const status =
    byId("membersStatus") ||
    byId("status");


  if (status) {

    status.textContent =
      message || "";

  }

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  setStatus(
    "Loading members..."
  );


  clearError();


  const currentMember =
    await getMyMember();


  const groupId =
    currentMember?.group_id;


  if (!groupId) {

    throw new Error(
      "Your account is not linked to a group."
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
        created_at
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "member_number",
        {
          ascending: true
        }
      );


  if (error) {

    throw error;

  }


  members =
    data || [];


  renderMembers();


  setStatus("");

}


/* =========================================================
   RENDER MEMBERS
========================================================= */

function renderMembers() {

  const rows =
    byId("memberRows");


  const count =
    byId("memberCount") ||
    byId("membersCount");


  if (count) {

    count.textContent =
      members.length;

  }


  if (!rows) {

    return;

  }


  if (
    members.length === 0
  ) {

    rows.innerHTML = `
      <tr>
        <td colspan="8">
          No members registered yet.
        </td>
      </tr>
    `;

    return;

  }


  rows.innerHTML =
    members
      .map(
        member => {

          const memberNumber =
            member.member_number ||
            "—";


          const name =
            member.name ||
            "—";


          const phone =
            member.phone ||
            "—";


          const email =
            member.email ||
            "—";


          const role =
            member.role ||
            "member";


          const status =
            member.status ||
            "active";


          const joinDate =
            formatDate(
              member.join_date
            );


          return `
            <tr>

              <td>
                ${escapeHtml(
                  memberNumber
                )}
              </td>

              <td>
                ${escapeHtml(
                  memberNumber
                )}
              </td>

              <td>
                ${escapeHtml(
                  name
                )}
              </td>

              <td>
                ${escapeHtml(
                  phone
                )}
              </td>

              <td>
                ${escapeHtml(
                  email
                )}
              </td>

              <td>
                ${escapeHtml(
                  role
                )}
              </td>

              <td>
                ${escapeHtml(
                  status
                )}
              </td>

              <td>

                <button
                  type="button"
                  class="btn btn-secondary btn-view-member"
                  data-id="${escapeHtml(
                    member.id
                  )}"
                >
                  View
                </button>

                <button
                  type="button"
                  class="btn btn-secondary btn-edit-member"
                  data-id="${escapeHtml(
                    member.id
                  )}"
                >
                  Edit
                </button>

              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   SEARCH
========================================================= */

function setupSearch() {

  const searchInput =
    byId("memberSearch") ||
    byId("searchMembers");


  if (!searchInput) {

    return;

  }


  searchInput.addEventListener(
    "input",
    () => {

      const query =
        searchInput.value
          .trim()
          .toLowerCase();


      const rows =
        byId("memberRows");


      if (!rows) {

        return;

      }


      const filtered =
        members.filter(
          member => {

            return [
              member.member_number,
              member.name,
              member.phone,
              member.email,
              member.role,
              member.status
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(query);

          }
        );


      renderMemberRows(
        filtered
      );

    }
  );

}


/* =========================================================
   RENDER FILTERED ROWS
========================================================= */

function renderMemberRows(
  list
) {

  const rows =
    byId("memberRows");


  if (!rows) {

    return;

  }


  if (
    list.length === 0
  ) {

    rows.innerHTML = `
      <tr>
        <td colspan="8">
          No matching members found.
        </td>
      </tr>
    `;

    return;

  }


  rows.innerHTML =
    list
      .map(
        member => {

          return `
            <tr>

              <td>
                ${escapeHtml(
                  member.member_number ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  member.member_number ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  member.name ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  member.phone ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  member.email ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  member.role ||
                  "member"
                )}
              </td>

              <td>
                ${escapeHtml(
                  member.status ||
                  "active"
                )}
              </td>

              <td>

                <button
                  type="button"
                  class="btn btn-secondary btn-view-member"
                  data-id="${escapeHtml(
                    member.id
                  )}"
                >
                  View
                </button>

                <button
                  type="button"
                  class="btn btn-secondary btn-edit-member"
                  data-id="${escapeHtml(
                    member.id
                  )}"
                >
                  Edit
                </button>

              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   OPEN ADD FORM
========================================================= */

function openAddForm() {

  editingMemberId =
    null;


  const panel =
    byId("addMemberPanel");


  const title =
    byId("memberFormTitle");


  const saveButton =
    byId("saveMemberButton");


  const form =
    byId("addMemberForm");


  if (form) {

    form.reset();

  }


  if (title) {

    title.textContent =
      "Add Member";

  }


  if (saveButton) {

    saveButton.textContent =
      "Save Member";

  }


  clearFormMessage();


  if (panel) {

    panel.hidden =
      false;

    panel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  }

}


/* =========================================================
   OPEN EDIT FORM
========================================================= */

function openEditForm(
  member
) {

  editingMemberId =
    member.id;


  const panel =
    byId("addMemberPanel");


  const title =
    byId("memberFormTitle");


  const saveButton =
    byId("saveMemberButton");


  if (title) {

    title.textContent =
      "Edit Member";

  }


  if (saveButton) {

    saveButton.textContent =
      "Save Changes";

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

    panel.hidden =
      false;

    panel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  }

}


/* =========================================================
   CLOSE ADD / EDIT FORM
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

}


/* =========================================================
   FORM MESSAGE
========================================================= */

function showFormMessage(
  message,
  success = false
) {

  const box =
    byId("formMessage");


  if (!box) {

    return;

  }


  box.style.display =
    "block";


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


function clearFormMessage() {

  const box =
    byId("formMessage");


  if (!box) {

    return;

  }


  box.style.display =
    "none";


  box.textContent =
    "";

}


/* =========================================================
   SAVE MEMBER
========================================================= */

async function saveMember(
  event
) {

  event.preventDefault();


  clearError();


  clearFormMessage();


  const button =
    byId("saveMemberButton");


  const memberNumber =
    byId("memberNumber")
      ?.value
      .trim();


  const memberName =
    byId("memberName")
      ?.value
      .trim();


  const memberPhone =
    byId("memberPhone")
      ?.value
      .trim();


  const memberEmail =
    byId("memberEmail")
      ?.value
      .trim();


  const memberRole =
    byId("memberRole")
      ?.value ||
    "member";


  const memberStatus =
    byId("memberStatus")
      ?.value ||
    "active";


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

    button.disabled =
      true;


    button.textContent =
      editingMemberId
        ? "Saving Changes..."
        : "Saving Member...";

  }


  try {

    const currentMember =
      await getMyMember();


    const groupId =
      currentMember?.group_id;


    if (!groupId) {

      throw new Error(
        "Your account has no group."
      );

    }


    /* =====================================================
       EDIT EXISTING MEMBER
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
              memberName,

            phone:
              memberPhone,

            email:
              memberEmail ||
              null,

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


    /* =====================================================
       ADD NEW MEMBER
    ===================================================== */

    else {

      const {
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
              memberName,

            phone:
              memberPhone,

            email:
              memberEmail ||
              null,

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


    setTimeout(
      () => {

        closeMemberForm();

      },
      700
    );


  } catch (error) {

    console.error(
      "CHAMA LIVE: save member error",
      error
    );


    showFormMessage(
      error?.message ||
      "Unable to save member."
    );

  } finally {

    if (button) {

      button.disabled =
        false;


      button.textContent =
        editingMemberId
          ? "Save Changes"
          : "Save Member";

    }

  }

}


/* =========================================================
   VIEW MEMBER
========================================================= */

function openViewModal(
  member
) {

  const modal =
    byId("memberModal");


  if (!modal) {

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
      member.name ||
      "Member";

  }


  if (number) {

    number.textContent =
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
      "—";

  }


  if (status) {

    status.textContent =
      member.status ||
      "—";

  }


  if (joinDate) {

    joinDate.textContent =
      formatDate(
        member.join_date
      );

  }


  modal.dataset.lastViewId =
    String(
      member.id
    );


  modal.hidden =
    false;


  modal.style.display =
    "flex";


  modal.removeAttribute(
    "aria-hidden"
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
   CLOSE VIEW MODAL
========================================================= */

function closeViewModal() {

  const modal =
    byId("memberModal");


  if (!modal) {

    return;

  }


  const active =
    document.activeElement;


  if (
    active &&
    modal.contains(active)
  ) {

    active.blur();

  }


  modal.removeAttribute(
    "aria-hidden"
  );


  modal.hidden =
    true;


  modal.style.display =
    "none";


  const lastViewId =
    modal.dataset.lastViewId;


  if (lastViewId) {

    const button =
      document.querySelector(
        `.btn-view-member[data-id="${CSS.escape(lastViewId)}"]`
      );


    if (button) {

      setTimeout(
        () => {

          button.focus();

        },
        0
      );

    }

  }

}


/* =========================================================
   TABLE ACTIONS
========================================================= */

function setupTableActions() {

  const rows =
    byId("memberRows");


  if (!rows) {

    return;

  }


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


      /* ===============================================
         VIEW
      =============================================== */

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

          openViewModal(
            member
          );

        }


        return;

      }


      /* ===============================================
         EDIT
      =============================================== */

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

          openEditForm(
            member
          );

        }

      }

    }
  );

}


/* =========================================================
   BUTTONS
========================================================= */

function setupButtons() {

  /* -------------------------------------------------------
     ADD MEMBER
  ------------------------------------------------------- */

  const addButton =
    byId("addMemberButton");


  if (addButton) {

    addButton.addEventListener(
      "click",
      openAddForm
    );

  }


  /* -------------------------------------------------------
     CLOSE FORM
  ------------------------------------------------------- */

  const closeButton =
    byId("closeAddMember");


  if (closeButton) {

    closeButton.addEventListener(
      "click",
      closeMemberForm
    );

  }


  /* -------------------------------------------------------
     CANCEL FORM
  ------------------------------------------------------- */

  const cancelButton =
    byId("cancelAddMember");


  if (cancelButton) {

    cancelButton.addEventListener(
      "click",
      closeMemberForm
    );

  }


  /* -------------------------------------------------------
     FORM SUBMIT
  ------------------------------------------------------- */

  const form =
    byId("addMemberForm");


  if (form) {

    form.addEventListener(
      "submit",
      saveMember
    );

  }


  /* -------------------------------------------------------
     CLOSE MODAL
  ------------------------------------------------------- */

  const closeModal =
    byId("closeMemberModal");


  if (closeModal) {

    closeModal.addEventListener(
      "click",
      closeViewModal
    );

  }


  /* -------------------------------------------------------
     MODAL BACKDROP
  ------------------------------------------------------- */

  const modal =
    byId("memberModal");


  if (modal) {

    modal.hidden =
      true;


    modal.style.display =
      "none";


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


    modal.addEventListener(
      "keydown",
      event => {

        if (
          event.key === "Escape"
        ) {

          closeViewModal();

        }

      }
    );

  }

}


/* =========================================================
   INITIALIZE PAGE
========================================================= */

export async function initPage() {

  if (initialized) {

    console.log(
      "CHAMA LIVE: members already initialized"
    );

    return;

  }


  initialized =
    true;


  try {

    await requireAuth();


    setupButtons();


    setupSearch();


    setupTableActions();


    await loadMembers();


    console.log(
      "CHAMA LIVE: members page ready"
    );


  } catch (error) {

    initialized =
      false;


    console.error(
      "CHAMA LIVE: members initialization error",
      error
    );


    setStatus(
      "Unable to load members."
    );


    showError(
      error
    );


    throw error;

  }

}


/* =========================================================
   COMPATIBILITY ALIAS
========================================================= */

export async function initMembers() {

  return initPage();

}


console.log(
  "CHAMA LIVE: members.js ready"
);
```
