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
   CHECK REQUIRED ELEMENTS
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
      "Members page is missing: " +
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

    setStatus("Loading your account...");

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


    /*
     * Only management roles can add/edit
     * members.
     */

    const allowed =
      hasRole(
        currentMember,
        [
          "admin",
          "administrator",
          "chairperson",
          "secretary",
          "treasurer"
        ]
      );


    if (!allowed) {

      addButton.hidden = true;

    }


    await loadMembers();

  } catch (error) {

    console.error(
      "Members initialization error:",
      error
    );

    setStatus("Unable to load members.");

    showError(
      friendlyError(error)
    );
  }
}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  if (!currentMember?.group_id) {

    throw new Error(
      "Your account is not linked to a group."
    );
  }


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
  } =
    await supabase
      .from("members")
      .select(`
        id,
        group_id,
        member_number,
        membership_number,
        name,
        phone,
        email,
        role,
        join_date,
        status,
        onboarding_status,
        auth_user_id
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
        <td colspan="8" class="muted">
          No members found.
        </td>
      </tr>
    `;

    return;
  }


  rows.innerHTML =
    list
      .map(member => {

        const account =
          member.auth_user_id
            ? "ACTIVE"
            : "PENDING";


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

                ${
                  canManageMembers()
                    ? `
                      <button
                        type="button"
                        class="btn btn-secondary"
                        data-edit="${member.id}"
                      >
                        Edit
                      </button>
                    `
                    : ""
                }


                ${
                  canManageMembers()
                    ? member.status === "active"
                      ? `
                        <button
                          type="button"
                          class="btn btn-secondary"
                          data-deactivate="${member.id}"
                        >
                          Deactivate
                        </button>
                      `
                      : `
                        <button
                          type="button"
                          class="btn btn-secondary"
                          data-activate="${member.id}"
                        >
                          Activate
                        </button>
                      `
                    : ""
                }

              </div>
            </td>

          </tr>
        `;

      })
      .join("");


  attachRowActions();
}


/* =========================================================
   MANAGEMENT PERMISSION
========================================================= */

function canManageMembers() {

  return hasRole(
    currentMember,
    [
      "admin",
      "administrator",
      "chairperson",
      "secretary",
      "treasurer"
    ]
  );
}


/* =========================================================
   ROW ACTIONS
========================================================= */

function attachRowActions() {

  document
    .querySelectorAll("[data-edit]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const member =
            members.find(
              item =>
                item.id ===
                button.dataset.edit
            );

          if (member) {
            openEditForm(member);
          }
        }
      );
    });


  document
    .querySelectorAll("[data-deactivate]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          changeStatus(
            button.dataset.deactivate,
            "inactive"
          );
        }
      );
    });


  document
    .querySelectorAll("[data-activate]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          changeStatus(
            button.dataset.activate,
            "active"
          );
        }
      );
    });
}


/* =========================================================
   ADD MEMBER
========================================================= */

addButton.addEventListener(
  "click",
  () => {

    editingId = null;

    form.reset();

    /*
     * Default role
     */

    const role =
      document.getElementById("role");

    if (role) {
      role.value = "member";
    }


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
   EDIT MEMBER
========================================================= */

function openEditForm(member) {

  editingId =
    member.id;


  const memberNumber =
    document.getElementById(
      "memberNumber"
    );

  const membershipNumber =
    document.getElementById(
      "membershipNumber"
    );

  const name =
    document.getElementById(
      "name"
    );

  const phone =
    document.getElementById(
      "phone"
    );

  const email =
    document.getElementById(
      "email"
    );

  const role =
    document.getElementById(
      "role"
    );


  if (memberNumber) {

    memberNumber.value =
      member.member_number || "";
  }


  if (membershipNumber) {

    membershipNumber.value =
      member.membership_number || "";
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


  formCard.hidden = false;

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


    const name =
      document.getElementById(
        "name"
      )?.value.trim();


    const memberNumber =
      document.getElementById(
        "memberNumber"
      )?.value.trim();


    const membershipNumber =
      document.getElementById(
        "membershipNumber"
      )?.value.trim();


    const phone =
      document.getElementById(
        "phone"
      )?.value.trim();


    const email =
      document.getElementById(
        "email"
      )?.value.trim()
        .toLowerCase();


    const role =
      document.getElementById(
        "role"
      )?.value || "member";


    if (!name) {

      showError(
        "Enter the member's full name."
      );

      return;
    }


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


    if (!phone) {

      showError(
        "Enter the member's phone number."
      );

      return;
    }


    saveButton.disabled = true;

    saveButton.textContent =
      editingId
        ? "Saving..."
        : "Adding...";


    try {

      if (editingId) {

        await updateMember({
          name,
          member_number: memberNumber,
          membership_number:
            membershipNumber,
          phone,
          email: email || null,
          role
        });


        showSuccess(
          "Member updated successfully."
        );

      } else {

        await createMember({
          name,
          member_number: memberNumber,
          membership_number:
            membershipNumber,
          phone,
          email: email || null,
          role
        });


        showSuccess(
          "Member added successfully."
        );
      }


      editingId = null;

      form.reset();

      formCard.hidden = true;

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

      saveButton.disabled = false;

      saveButton.textContent =
        "Add Member";
    }
  }
);


/* =========================================================
   CREATE MEMBER
========================================================= */

async function createMember(member) {

  if (!currentMember?.group_id) {

    throw new Error(
      "Your account is not linked to a group."
    );
  }


  const payload = {

    group_id:
      currentMember.group_id,

    name:
      member.name,

    member_number:
      member.member_number,

    membership_number:
      member.membership_number,

    phone:
      member.phone,

    email:
      member.email,

    role:
      member.role,

    status:
      "active",

    onboarding_status:
      "pending",

    join_date:
      new Date()
        .toISOString()
        .slice(0, 10)
  };


  const {
    error
  } =
    await supabase
      .from("members")
      .insert(payload);


  if (error) {

    console.error(
      "createMember error:",
      error
    );

    throw error;
  }
}


/* =========================================================
   UPDATE MEMBER
========================================================= */

async function updateMember(member) {

  const {
    error
  } =
    await supabase
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

    console.error(
      "updateMember error:",
      error
    );

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
    confirm(
      `Are you sure you want to ${action} this member?`
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
   FORMAT ROLE
========================================================= */

function formatRole(role) {

  return escapeHtml(
    String(
      role || "member"
    )
      .replaceAll(
        "_",
        " "
      )
      .replace(
        /\b\w/g,
        character =>
          character.toUpperCase()
      )
  );
}


/* =========================================================
   STATUS MESSAGE
========================================================= */

function setStatus(message) {

  if (statusBox) {
    statusBox.textContent =
      message;
  }
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
    lower.includes("unique")
  ) {

    return (
      "That member number or membership number " +
      "already exists."
    );
  }


  if (
    lower.includes(
      "row-level security"
    ) ||
    lower.includes(
      "permission denied"
    )
  ) {

    return (
      "You do not have permission to manage members."
    );
  }


  if (
    lower.includes(
      "membership_number"
    )
  ) {

    return (
      "The database does not appear to have the " +
      "membership_number column."
    );
  }


  return message;
}


/* =========================================================
   SHOW ERROR
========================================================= */

function showError(message) {

  if (!errorBox) {
    return;
  }


  errorBox.hidden = false;

  errorBox.textContent =
    message;


  if (successBox) {
    successBox.hidden = true;
  }
}


/* =========================================================
   SHOW SUCCESS
========================================================= */

function showSuccess(message) {

  if (!successBox) {
    return;
  }


  successBox.hidden = false;

  successBox.textContent =
    message;


  if (errorBox) {
    errorBox.hidden = true;
  }
}


/* =========================================================
   CLEAR MESSAGES
========================================================= */

function clearMessages() {

  if (errorBox) {

    errorBox.hidden = true;

    errorBox.textContent = "";
  }


  if (successBox) {

    successBox.hidden = true;

    successBox.textContent = "";
  }
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
