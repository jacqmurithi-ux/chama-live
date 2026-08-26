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

const statusBox =
  document.getElementById("status");

const errorBox =
  document.getElementById("error");

const successBox =
  document.getElementById("success");

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

const membersBody =
  document.getElementById("membersBody");


/* =========================================================
   SAFETY CHECK
========================================================= */

if (!form) {
  console.error("members.js: #memberForm was not found.");
}

if (!membersBody) {
  console.error("members.js: #membersBody was not found.");
}


/* =========================================================
   INITIALIZE
========================================================= */

async function init() {

  try {

    clearMessages();

    setStatus("Checking your account...");

    /*
     * Get logged-in member.
     */

    currentMember =
      await getMyMember(true);


    if (!currentMember) {

      throw new Error(
        "Your account is logged in, but no member record was found."
      );
    }


    if (!currentMember.group_id) {

      throw new Error(
        "Your member account is not connected to a group."
      );
    }


    /*
     * Check permission.
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

      setStatus(
        `Welcome, ${currentMember.name || "Member"}. You can view the members of your group.`
      );

    } else {

      addButton.hidden = false;

      setStatus(
        `Welcome, ${currentMember.name || "Member"}.`
      );
    }


    /*
     * Load members.
     */

    await loadMembers();


  } catch (error) {

    console.error(
      "Members initialization error:",
      error
    );

    setStatus("");

    showError(
      friendlyError(error)
    );

  }
}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  membersBody.innerHTML = `
    <tr>
      <td colspan="9" class="muted">
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


  if (members.length === 0) {

    setStatus(
      "No members have been registered yet."
    );

  } else {

    setStatus(
      `${members.length} member${members.length === 1 ? "" : "s"} registered.`
    );
  }
}


/* =========================================================
   RENDER MEMBERS
========================================================= */

function renderMembers(list) {

  /*
   * Keep table header synchronized with
   * the actions column.
   */

  const table =
    membersBody.closest("table");


  if (table) {

    const headerRow =
      table.querySelector("thead tr");


    if (
      headerRow &&
      !headerRow.querySelector(
        '[data-actions-header]'
      )
    ) {

      const th =
        document.createElement("th");

      th.setAttribute(
        "data-actions-header",
        "true"
      );

      th.textContent =
        "Actions";

      headerRow.appendChild(th);
    }
  }


  if (!list.length) {

    membersBody.innerHTML = `
      <tr>
        <td colspan="9" class="muted">
          No members found.
        </td>
      </tr>
    `;

    return;
  }


  membersBody.innerHTML =
    list
      .map(
        member => {

          const account =
            member.auth_user_id
              ? "ACTIVE"
              : "PENDING";


          const status =
            String(
              member.status || "active"
            )
              .toLowerCase();


          const canManage =
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


          const actionButtons =
            canManage
              ? `
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
                    data-edit="${escapeAttribute(member.id)}"
                  >
                    Edit
                  </button>

                  ${
                    status === "active"
                      ? `
                        <button
                          type="button"
                          class="btn btn-secondary"
                          data-deactivate="${escapeAttribute(member.id)}"
                        >
                          Deactivate
                        </button>
                      `
                      : `
                        <button
                          type="button"
                          class="btn btn-secondary"
                          data-activate="${escapeAttribute(member.id)}"
                        >
                          Activate
                        </button>
                      `
                  }

                </div>
              `
              : "—";


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
                ${formatStatus(
                  member.status
                )}
              </td>

              <td>
                ${actionButtons}
              </td>

            </tr>
          `;
        }
      )
      .join("");


  attachActions();
}


/* =========================================================
   ATTACH ACTION BUTTONS
========================================================= */

function attachActions() {

  document
    .querySelectorAll(
      "[data-edit]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          async () => {

            const id =
              button.dataset.edit;


            const member =
              members.find(
                item =>
                  String(item.id) ===
                  String(id)
              );


            if (!member) {
              return;
            }


            openEditForm(
              member
            );
          }
        );
      }
    );


  document
    .querySelectorAll(
      "[data-deactivate]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          async () => {

            await changeStatus(
              button.dataset.deactivate,
              "inactive"
            );
          }
        );
      }
    );


  document
    .querySelectorAll(
      "[data-activate]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          async () => {

            await changeStatus(
              button.dataset.activate,
              "active"
            );
          }
        );
      }
    );
}


/* =========================================================
   ADD MEMBER
========================================================= */

if (addButton) {

  addButton.addEventListener(
    "click",
    () => {

      editingId = null;

      form.reset();

      setFormTitle(
        "Add Member"
      );

      saveButton.textContent =
        "Add Member";

      formCard.hidden =
        false;

      clearMessages();

      const memberNumber =
        document.getElementById(
          "memberNumber"
        );

      if (memberNumber) {
        memberNumber.focus();
      }

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }
  );
}


/* =========================================================
   OPEN EDIT FORM
========================================================= */

function openEditForm(member) {

  editingId =
    member.id;


  setFormTitle(
    "Edit Member"
  );


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


  saveButton.textContent =
    "Update Member";


  formCard.hidden =
    false;


  clearMessages();


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================================================
   FORM TITLE
========================================================= */

function setFormTitle(title) {

  /*
   * Your current HTML doesn't have a #formTitle
   * element. Therefore we update the H2 instead.
   */

  const heading =
    formCard?.querySelector("h2");


  if (heading) {
    heading.textContent =
      title;
  }
}


/* =========================================================
   CANCEL
========================================================= */

if (cancelButton) {

  cancelButton.addEventListener(
    "click",
    () => {

      editingId =
        null;

      form.reset();

      formCard.hidden =
        true;

      clearMessages();
    }
  );
}


/* =========================================================
   SAVE MEMBER
========================================================= */

if (form) {

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      clearMessages();


      const memberNumber =
        getValue(
          "memberNumber"
        );


      const membershipNumber =
        getValue(
          "membershipNumber"
        );


      const name =
        getValue(
          "name"
        );


      const phone =
        getValue(
          "phone"
        );


      const email =
        getValue(
          "email"
        )
          .toLowerCase();


      const role =
        getValue(
          "role"
        ) ||
        "member";


      /*
       * Validation
       */

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


      /*
       * Permission
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

        showError(
          "You do not have permission to manage members."
        );

        return;
      }


      /*
       * Disable button
       */

      saveButton.disabled =
        true;

      saveButton.textContent =
        editingId
          ? "Updating..."
          : "Adding...";


      try {

        if (editingId) {

          await updateMember({
            member_number:
              memberNumber,

            membership_number:
              membershipNumber,

            name:
              name,

            phone:
              phone,

            email:
              email || null,

            role:
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

            name:
              name,

            phone:
              phone,

            email:
              email || null,

            role:
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

        saveButton.textContent =
          "Add Member";
      }

    }
  );
}


/* =========================================================
   CREATE MEMBER
========================================================= */

async function createMember(member) {

  if (!currentMember?.group_id) {

    throw new Error(
      "Your account is not connected to a group."
    );
  }


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
      member.role,

    join_date:
      new Date()
        .toISOString()
        .slice(0, 10),

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

  if (!editingId) {

    throw new Error(
      "No member selected for editing."
    );
  }


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
  newStatus
) {

  const member =
    members.find(
      item =>
        String(item.id) ===
        String(id)
    );


  if (!member) {

    showError(
      "Member could not be found."
    );

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
    } = await supabase
      .from("members")
      .update({
        status:
          newStatus
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
      "Change status error:",
      error
    );


    showError(
      friendlyError(error)
    );
  }
}


/* =========================================================
   GET INPUT VALUE
========================================================= */

function getValue(id) {

  const element =
    document.getElementById(id);


  if (!element) {
    return "";
  }


  return String(
    element.value || ""
  ).trim();
}


/* =========================================================
   STATUS MESSAGE
========================================================= */

function setStatus(message) {

  if (!statusBox) {
    return;
  }

  statusBox.textContent =
    message || "";
}


/* =========================================================
   SHOW ERROR
========================================================= */

function showError(message) {

  if (errorBox) {

    errorBox.hidden =
      false;

    errorBox.textContent =
      message;
  }


  if (successBox) {

    successBox.hidden =
      true;

    successBox.textContent =
      "";
  }
}


/* =========================================================
   SHOW SUCCESS
========================================================= */

function showSuccess(message) {

  if (successBox) {

    successBox.hidden =
      false;

    successBox.textContent =
      message;
  }


  if (errorBox) {

    errorBox.hidden =
      true;

    errorBox.textContent =
      "";
  }
}


/* =========================================================
   CLEAR MESSAGES
========================================================= */

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
   FORMAT STATUS
========================================================= */

function formatStatus(status) {

  const value =
    String(
      status || "active"
    )
      .trim()
      .toLowerCase();


  return value === "active"
    ? "ACTIVE"
    : "INACTIVE";
}


/* =========================================================
   FRIENDLY ERROR
========================================================= */

function friendlyError(error) {

  const message =
    String(
      error?.message ||
      error?.details ||
      "Something went wrong."
    );


  const lower =
    message.toLowerCase();


  if (
    lower.includes("duplicate") ||
    lower.includes("already exists") ||
    lower.includes("unique constraint")
  ) {

    return (
      "That member number or membership number already exists. " +
      "Please use a different number."
    );
  }


  if (
    lower.includes(
      "row-level security"
    ) ||
    lower.includes(
      "permission denied"
    ) ||
    lower.includes(
      "not authorized"
    )
  ) {

    return (
      "You do not have permission to manage members."
    );
  }


  if (
    lower.includes(
      "membership_number"
    ) &&
    lower.includes(
      "column"
    )
  ) {

    return (
      "The database is missing the membership_number column."
    );
  }


  if (
    lower.includes(
      "get_my_member"
    )
  ) {

    return (
      "Your member account could not be loaded. " +
      "Please check the get_my_member database function."
    );
  }


  return message;
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
   ESCAPE ATTRIBUTE
========================================================= */

function escapeAttribute(value) {

  return escapeHtml(
    value
  );
}


/* =========================================================
   START
========================================================= */

init();
```
