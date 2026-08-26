```javascript
import {
  supabase,
  getMyMember,
  hasRole
} from "./auth.js";


/* =========================================================
   STATE
========================================================= */

let currentMember = null;
let members = [];
let editingId = null;


/* =========================================================
   ELEMENTS
========================================================= */

const formCard =
  document.getElementById("memberFormCard");

const form =
  document.getElementById("memberForm");

const addButton =
  document.getElementById("addMemberButton");

const cancelButton =
  document.getElementById("cancelMember");

const saveButton =
  document.getElementById("saveMember");

const rows =
  document.getElementById("membersBody");

const errorBox =
  document.getElementById("error");

const successBox =
  document.getElementById("success");

const statusBox =
  document.getElementById("status");


/* =========================================================
   SAFETY CHECK
========================================================= */

function checkElements() {

  const missing = [];

  if (!formCard) missing.push("memberFormCard");
  if (!form) missing.push("memberForm");
  if (!addButton) missing.push("addMemberButton");
  if (!cancelButton) missing.push("cancelMember");
  if (!saveButton) missing.push("saveMember");
  if (!rows) missing.push("membersBody");
  if (!errorBox) missing.push("error");
  if (!successBox) missing.push("success");

  if (missing.length) {

    throw new Error(
      "Members page is missing HTML elements: " +
      missing.join(", ")
    );
  }
}


/* =========================================================
   INITIALIZE
========================================================= */

async function init() {

  try {

    checkElements();

    setStatus(
      "Loading your member account..."
    );

    currentMember =
      await getMyMember(true);

    if (!currentMember) {

      throw new Error(
        "Unable to identify your member account."
      );
    }


    console.log(
      "Current member:",
      currentMember
    );


    if (!currentMember.group_id) {

      throw new Error(
        "Your member account is not linked to a group."
      );
    }


    const allowed =
      hasRole([
        "admin",
        "administrator",
        "chairperson",
        "secretary",
        "treasurer",
        "manager"
      ]);


    if (!allowed) {

      addButton.hidden = true;

    } else {

      addButton.hidden = false;

    }


    await loadMembers();


  } catch (error) {

    console.error(
      "Members initialization error:",
      error
    );

    setStatus(
      "Unable to load members."
    );

    showError(
      friendlyError(error)
    );
  }
}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  setStatus(
    "Loading members..."
  );

  rows.innerHTML = `
    <tr>
      <td colspan="8" class="muted">
        Loading members...
      </td>
    </tr>
  `;


  const {
    data,
    error
  } = await supabase
    .from("members")
    .select(`
      id,
      member_number,
      membership_number,
      name,
      phone,
      email,
      role,
      status,
      onboarding_status,
      auth_user_id,
      join_date
    `)
    .eq(
      "group_id",
      currentMember.group_id
    )
    .order(
      "name",
      {
        ascending: true
      }
    );


  if (error) {

    console.error(
      "loadMembers error:",
      error
    );

    throw error;
  }


  members =
    data || [];


  renderMembers(
    members
  );


  setStatus(
    `${members.length} member${
      members.length === 1 ? "" : "s"
    } found.`
  );
}


/* =========================================================
   RENDER MEMBERS
========================================================= */

function renderMembers(list) {

  if (!list.length) {

    rows.innerHTML = `
      <tr>
        <td
          colspan="8"
          class="muted"
        >
          No members found.
        </td>
      </tr>
    `;

    return;
  }


  rows.innerHTML =
    list.map(
      member => {

        const account =
          member.auth_user_id
            ? "ACTIVE"
            : "PENDING";


        const status =
          String(
            member.status || "active"
          ).toLowerCase();


        const actionButton =
          status === "active"
            ? `
              <button
                class="btn btn-secondary"
                type="button"
                data-action="deactivate"
                data-id="${member.id}"
              >
                Deactivate
              </button>
            `
            : `
              <button
                class="btn btn-secondary"
                type="button"
                data-action="activate"
                data-id="${member.id}"
              >
                Activate
              </button>
            `;


        return `
          <tr>

            <td>
              ${escapeHtml(
                member.member_number || "—"
              )}
            </td>


            <td>
              ${escapeHtml(
                member.membership_number || "—"
              )}
            </td>


            <td>
              <strong>
                ${escapeHtml(
                  member.name || "—"
                )}
              </strong>
            </td>


            <td>
              ${escapeHtml(
                member.phone || "—"
              )}
            </td>


            <td>
              ${escapeHtml(
                member.email || "—"
              )}
            </td>


            <td>
              ${formatRole(
                member.role
              )}
            </td>


            <td>
              ${account}
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
                  class="btn btn-secondary"
                  type="button"
                  data-action="edit"
                  data-id="${member.id}"
                >
                  Edit
                </button>

                ${actionButton}

              </div>

            </td>

          </tr>
        `;
      }
    ).join("");


  attachRowActions();
}


/* =========================================================
   ROW ACTIONS
========================================================= */

function attachRowActions() {

  document
    .querySelectorAll(
      "[data-action='edit']"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const member =
              members.find(
                item =>
                  String(item.id) ===
                  String(button.dataset.id)
              );

            if (member) {
              openEditForm(member);
            }
          }
        );
      }
    );


  document
    .querySelectorAll(
      "[data-action='activate']"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            changeStatus(
              button.dataset.id,
              "active"
            );
          }
        );
      }
    );


  document
    .querySelectorAll(
      "[data-action='deactivate']"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            changeStatus(
              button.dataset.id,
              "inactive"
            );
          }
        );
      }
    );
}


/* =========================================================
   OPEN ADD FORM
========================================================= */

addButton.addEventListener(
  "click",
  () => {

    editingId = null;

    form.reset();

    formCard.hidden = false;

    saveButton.textContent =
      "Add Member";

    clearMessages();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }
);


/* =========================================================
   EDIT FORM
========================================================= */

function openEditForm(member) {

  editingId =
    member.id;


  document.getElementById(
    "memberNumber"
  ).value =
    member.member_number || "";


  document.getElementById(
    "membershipNumber"
  ).value =
    member.membership_number || "";


  document.getElementById(
    "name"
  ).value =
    member.name || "";


  document.getElementById(
    "phone"
  ).value =
    member.phone || "";


  document.getElementById(
    "email"
  ).value =
    member.email || "";


  document.getElementById(
    "role"
  ).value =
    member.role || "member";


  formCard.hidden =
    false;


  saveButton.textContent =
    "Save Changes";


  clearMessages();


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================================================
   CANCEL
========================================================= */

cancelButton.addEventListener(
  "click",
  () => {

    editingId = null;

    form.reset();

    formCard.hidden = true;

    clearMessages();

    saveButton.textContent =
      "Add Member";
  }
);


/* =========================================================
   SAVE
========================================================= */

form.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    clearMessages();


    const memberNumber =
      document.getElementById(
        "memberNumber"
      ).value.trim();


    const membershipNumber =
      document.getElementById(
        "membershipNumber"
      ).value.trim();


    const name =
      document.getElementById(
        "name"
      ).value.trim();


    const phone =
      document.getElementById(
        "phone"
      ).value.trim();


    const email =
      document.getElementById(
        "email"
      ).value.trim()
        .toLowerCase();


    const role =
      document.getElementById(
        "role"
      ).value;


    if (!memberNumber) {

      showError(
        "Enter a member number."
      );

      return;
    }


    if (!membershipNumber) {

      showError(
        "Enter a membership number."
      );

      return;
    }


    if (!name) {

      showError(
        "Enter the member's full name."
      );

      return;
    }


    if (!phone) {

      showError(
        "Enter the member's phone number."
      );

      return;
    }


    saveButton.disabled =
      true;

    saveButton.textContent =
      editingId
        ? "Saving..."
        : "Adding...";


    try {

      if (editingId) {

        await updateMember({
          member_number:
            memberNumber,

          membership_number:
            membershipNumber,

          name,

          phone,

          email:
            email || null,

          role
        });


        showSuccess(
          "Member updated successfully."
        );

      } else {

        await createMember({
          member_number:
            memberNumber,

          membership_number:
            membershipNumber,

          name,

          phone,

          email:
            email || null,

          role
        });


        showSuccess(
          "Member added successfully."
        );
      }


      editingId =
        null;


      form.reset();

      formCard.hidden =
        true;


      saveButton.textContent =
        "Add Member";


      await loadMembers();


    } catch (error) {

      console.error(
        "Save member error:",
        error
      );

      showError(
        friendlyError(error)
      );


    } finally {

      saveButton.disabled =
        false;

      if (!editingId) {

        saveButton.textContent =
          "Add Member";

      } else {

        saveButton.textContent =
          "Save Changes";
      }
    }
  }
);


/* =========================================================
   CREATE MEMBER
========================================================= */

async function createMember(member) {

  const payload = {

    group_id:
      currentMember.group_id,

    member_number:
      member.member_number,

    membership_number:
      member.membership_number,

    name:
      member.name,

    phone:
      member.phone,

    email:
      member.email,

    role:
      member.role || "member",

    status:
      "active",

    onboarding_status:
      "pending"
  };


  const {
    error
  } = await supabase
    .from("members")
    .insert(payload);


  if (error) {
    throw error;
  }
}


/* =========================================================
   UPDATE MEMBER
========================================================= */

async function updateMember(member) {

  const {
    error
  } = await supabase
    .from("members")
    .update(member)
    .eq(
      "id",
      editingId
    )
    .eq(
      "group_id",
      currentMember.group_id
    );


  if (error) {
    throw error;
  }
}


/* =========================================================
   CHANGE STATUS
========================================================= */

async function changeStatus(
  id,
  status
) {

  const action =
    status === "active"
      ? "activate"
      : "deactivate";


  const confirmed =
    window.confirm(
      `Are you sure you want to ${action} this member?`
    );


  if (!confirmed) {
    return;
  }


  try {

    const {
      error
    } = await supabase
      .from("members")
      .update({
        status
      })
      .eq(
        "id",
        id
      )
      .eq(
        "group_id",
        currentMember.group_id
      );


    if (error) {
      throw error;
    }


    showSuccess(
      `Member ${action}d successfully.`
    );


    await loadMembers();


  } catch (error) {

    console.error(
      "changeStatus error:",
      error
    );

    showError(
      friendlyError(error)
    );
  }
}


/* =========================================================
   STATUS
========================================================= */

function setStatus(message) {

  if (!statusBox) {
    return;
  }

  statusBox.textContent =
    message;
}


/* =========================================================
   ERROR
========================================================= */

function friendlyError(error) {

  const message =
    error?.message ||
    "Something went wrong.";


  const lower =
    message.toLowerCase();


  if (
    lower.includes("duplicate") ||
    lower.includes("unique constraint")
  ) {

    return (
      "That member number or membership number already exists."
    );
  }


  if (
    lower.includes("row-level security") ||
    lower.includes("permission denied")
  ) {

    return (
      "You do not have permission to manage members."
    );
  }


  if (
    lower.includes("membership_number")
  ) {

    return (
      "The membership_number column is not available in the database."
    );
  }


  return message;
}


/* =========================================================
   MESSAGES
========================================================= */

function showError(message) {

  if (!errorBox) {
    return;
  }

  errorBox.hidden =
    false;

  errorBox.textContent =
    message;


  if (successBox) {
    successBox.hidden =
      true;

    successBox.textContent =
      "";
  }
}


function showSuccess(message) {

  if (!successBox) {
    return;
  }

  successBox.hidden =
    false;

  successBox.textContent =
    message;


  if (errorBox) {
    errorBox.hidden =
      true;

    errorBox.textContent =
      "";
  }
}


function clearMessages() {

  if (errorBox) {

    errorBox.hidden =
      true;

    errorBox.textContent =
      "";
  }


  if (successBox) {

    successBox.hidden =
      true;

    successBox.textContent =
      "";
  }
}


/* =========================================================
   FORMAT ROLE
========================================================= */

function formatRole(role) {

  return escapeHtml(
    String(
      role || "member"
    )
      .replaceAll("_", " ")
      .replace(
        /\b\w/g,
        character =>
          character.toUpperCase()
      )
  );
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


/* =========================================================
   START
========================================================= */

init();
```
