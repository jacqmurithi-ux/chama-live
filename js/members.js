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
  document.getElementById(
    "memberFormCard"
  );

const form =
  document.getElementById(
    "memberForm"
  );

const addButton =
  document.getElementById(
    "addMemberButton"
  );

const cancelButton =
  document.getElementById(
    "cancelMember"
  );

const saveButton =
  document.getElementById(
    "saveMember"
  );

const rows =
  document.getElementById(
    "membersBody"
  );

const errorBox =
  document.getElementById(
    "error"
  );

const successBox =
  document.getElementById(
    "success"
  );

const statusBox =
  document.getElementById(
    "status"
  );


/* =========================================================
   CHECK REQUIRED ELEMENTS
========================================================= */

function checkElements() {

  const missing = [];

  if (!formCard)
    missing.push("memberFormCard");

  if (!form)
    missing.push("memberForm");

  if (!addButton)
    missing.push("addMemberButton");

  if (!cancelButton)
    missing.push("cancelMember");

  if (!saveButton)
    missing.push("saveMember");

  if (!rows)
    missing.push("membersBody");

  if (!errorBox)
    missing.push("error");

  if (!successBox)
    missing.push("success");


  if (missing.length) {

    throw new Error(
      `Members page is missing HTML elements: ${missing.join(", ")}`
    );
  }
}


/* =========================================================
   INIT
========================================================= */

async function init() {

  try {

    checkElements();


    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "Unable to identify your member account."
      );
    }


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

      addButton.hidden =
        true;
    }


    await loadMembers();

  } catch (error) {

    console.error(
      "Members init:",
      error
    );

    showError(
      error.message ||
      "Unable to load members."
    );
  }
}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  rows.innerHTML = `
    <tr>
      <td colspan="8">
        Loading members...
      </td>
    </tr>
  `;


  if (statusBox) {

    statusBox.textContent =
      "Loading members...";
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
      "loadMembers:",
      error
    );

    throw error;
  }


  members =
    data || [];


  renderMembers(
    members
  );


  if (statusBox) {

    statusBox.textContent =
      `${members.length} member${members.length === 1 ? "" : "s"} loaded.`;
  }
}


/* =========================================================
   RENDER MEMBERS
========================================================= */

function renderMembers(
  list
) {

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
      .map(
        member => {

          const memberNo =
            member.member_number ||
            "—";


          const membershipNo =
            member.membership_number ||
            "—";


          const account =
            member.auth_user_id
              ? "ACTIVE"
              : "PENDING";


          const actionButtons =
            member.status === "active"

              ? `
                <button
                  class="btn btn-secondary"
                  type="button"
                  data-deactivate="${member.id}"
                >
                  Deactivate
                </button>
              `

              : `
                <button
                  class="btn btn-secondary"
                  type="button"
                  data-activate="${member.id}"
                >
                  Activate
                </button>
              `;


          return `

            <tr>

              <td>
                ${escapeHtml(memberNo)}
              </td>

              <td>
                ${escapeHtml(membershipNo)}
              </td>

              <td>
                <strong>
                  ${escapeHtml(member.name)}
                </strong>
              </td>

              <td>
                ${escapeHtml(member.phone || "—")}
              </td>

              <td>
                ${escapeHtml(member.email || "—")}
              </td>

              <td>
                ${formatRole(member.role)}
              </td>

              <td>
                ${account}
              </td>

              <td>
                ${formatStatus(member.status)}

                <div
                  style="
                    display:flex;
                    gap:6px;
                    margin-top:8px;
                    flex-wrap:wrap;
                  "
                >

                  <button
                    class="btn btn-secondary"
                    type="button"
                    data-edit="${member.id}"
                  >
                    Edit
                  </button>

                  ${actionButtons}

                </div>

              </td>

            </tr>
          `;
        }
      )
      .join("");


  attachRowActions();
}


/* =========================================================
   ROW ACTIONS
========================================================= */

function attachRowActions() {

  document
    .querySelectorAll(
      "[data-edit]"
    )
    .forEach(
      button => {

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

              openEditForm(
                member
              );
            }
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
          () => {

            changeStatus(
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
          () => {

            changeStatus(
              button.dataset.activate,
              "active"
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

    editingId =
      null;


    form.reset();


    const heading =
      formCard.querySelector(
        "h2"
      );

    if (heading) {

      heading.textContent =
        "Add Member";
    }


    const role =
      document.getElementById(
        "role"
      );

    if (role) {

      role.value =
        "member";
    }


    formCard.hidden =
      false;


    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }
);


/* =========================================================
   EDIT MEMBER
========================================================= */

function openEditForm(
  member
) {

  editingId =
    member.id;


  const heading =
    formCard.querySelector(
      "h2"
    );

  if (heading) {

    heading.textContent =
      "Edit Member";
  }


  const memberNumber =
    document.getElementById(
      "memberNumber"
    );

  if (memberNumber) {

    memberNumber.value =
      member.member_number || "";
  }


  const membershipNumber =
    document.getElementById(
      "membershipNumber"
    );

  if (membershipNumber) {

    membershipNumber.value =
      member.membership_number || "";
  }


  const name =
    document.getElementById(
      "name"
    );

  if (name) {

    name.value =
      member.name || "";
  }


  const phone =
    document.getElementById(
      "phone"
    );

  if (phone) {

    phone.value =
      member.phone || "";
  }


  const email =
    document.getElementById(
      "email"
    );

  if (email) {

    email.value =
      member.email || "";
  }


  const role =
    document.getElementById(
      "role"
    );

  if (role) {

    role.value =
      member.role || "member";
  }


  formCard.hidden =
    false;


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

    editingId =
      null;

    form.reset();

    formCard.hidden =
      true;
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
      document
        .getElementById("name")
        .value
        .trim();


    const memberNumber =
      document
        .getElementById("memberNumber")
        .value
        .trim();


    const membershipNumber =
      document
        .getElementById("membershipNumber")
        .value
        .trim();


    const phone =
      document
        .getElementById("phone")
        .value
        .trim();


    const email =
      document
        .getElementById("email")
        .value
        .trim()
        .toLowerCase();


    const role =
      document
        .getElementById("role")
        .value;


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


    if (!phone) {

      showError(
        "Enter the member's phone number."
      );

      return;
    }


    saveButton.disabled =
      true;

    saveButton.textContent =
      "Saving...";


    try {

      if (editingId) {

        await updateMember({
          name,
          member_number:
            memberNumber,
          membership_number:
            membershipNumber || null,
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
          name,
          member_number:
            memberNumber,
          membership_number:
            membershipNumber || null,
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


      await loadMembers();

    } catch (error) {

      console.error(
        "Save member:",
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


/* =========================================================
   CREATE
========================================================= */

async function createMember(
  member
) {

  const payload = {

    group_id:
      currentMember.group_id,

    member_number:
      member.member_number,

    name:
      member.name,

    phone:
      member.phone,

    email:
      member.email,

    role:
      member.role,

    status:
      "active",

    onboarding_status:
      "pending"
  };


  if (member.membership_number) {

    payload.membership_number =
      member.membership_number;
  }


  const {
    error
  } =
    await supabase
      .from("members")
      .insert(payload);


  if (error) {
    throw error;
  }
}


/* =========================================================
   UPDATE
========================================================= */

async function updateMember(
  member
) {

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
    throw error;
  }
}


/* =========================================================
   STATUS
========================================================= */

async function changeStatus(
  id,
  status
) {

  const action =
    status === "active"
      ? "activate"
      : "deactivate";


  if (
    !confirm(
      `Are you sure you want to ${action} this member?`
    )
  ) {

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
      "changeStatus:",
      error
    );

    showError(
      friendlyError(error)
    );
  }
}


/* =========================================================
   ROLE FORMAT
========================================================= */

function formatRole(
  role
) {

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
   STATUS FORMAT
========================================================= */

function formatStatus(
  status
) {

  return String(
    status || "active"
  )
    .toUpperCase();
}


/* =========================================================
   FRIENDLY ERROR
========================================================= */

function friendlyError(
  error
) {

  const message =
    error?.message ||
    "Something went wrong.";


  const lower =
    message.toLowerCase();


  if (
    lower.includes(
      "duplicate"
    ) ||
    lower.includes(
      "unique"
    )
  ) {

    return (
      "That member number already exists."
    );
  }


  if (
    lower.includes(
      "row-level security"
    ) ||
    lower.includes(
      "permission"
    )
  ) {

    return (
      "You do not have permission to manage members."
    );
  }


  return message;
}


/* =========================================================
   ERROR MESSAGE
========================================================= */

function showError(
  message
) {

  errorBox.hidden =
    false;

  errorBox.textContent =
    message;

  successBox.hidden =
    true;
}


/* =========================================================
   SUCCESS MESSAGE
========================================================= */

function showSuccess(
  message
) {

  successBox.hidden =
    true;

  successBox.hidden =
    false;

  successBox.textContent =
    message;

  errorBox.hidden =
    true;
}


/* =========================================================
   CLEAR
========================================================= */

function clearMessages() {

  errorBox.hidden =
    true;

  successBox.hidden =
    true;

  errorBox.textContent =
    "";

  successBox.textContent =
    "";
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(
  value
) {

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
