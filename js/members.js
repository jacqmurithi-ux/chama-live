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

const formCard = document.getElementById("memberFormCard");
const form = document.getElementById("memberForm");
const addButton = document.getElementById("addMemberButton");
const cancelButton = document.getElementById("cancelMember");
const saveButton = document.getElementById("saveMember");

const rows = document.getElementById("memberRows");
const search = document.getElementById("search");
const count = document.getElementById("memberCount");

const errorBox = document.getElementById("error");
const successBox = document.getElementById("success");
const statusBox = document.getElementById("status");


/* =========================================================
   CHECK REQUIRED ELEMENTS
========================================================= */

function checkElements() {

  const required = {
    memberFormCard: formCard,
    memberForm: form,
    addMemberButton: addButton,
    cancelMember: cancelButton,
    saveMember: saveButton,
    memberRows: rows,
    search: search,
    memberCount: count,
    error: errorBox,
    success: successBox,
    status: statusBox
  };


  const missing = Object.entries(required)
    .filter(([, element]) => !element)
    .map(([name]) => name);


  if (missing.length) {

    throw new Error(
      "Members page is missing these HTML elements: " +
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

    currentMember = await getMyMember(true);


    if (!currentMember) {

      throw new Error(
        "Your member account could not be found."
      );

    }


    if (!currentMember.group_id) {

      throw new Error(
        "Your member account is not linked to a group."
      );

    }


    const allowed = hasRole([
      "admin",
      "administrator",
      "chairperson",
      "secretary",
      "treasurer"
    ]);


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

  setStatus("Loading members...");

  rows.innerHTML = `
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


  members = data || [];


  renderMembers(
    members
  );


  setStatus(
    `Showing ${members.length} member${
      members.length === 1 ? "" : "s"
    }.`
  );

}


/* =========================================================
   RENDER MEMBERS
========================================================= */

function renderMembers(list) {

  count.textContent =
    `${list.length} member${
      list.length === 1 ? "" : "s"
    }`;


  if (!list.length) {

    rows.innerHTML = `
      <tr>
        <td colspan="9" class="muted">
          No members found.
        </td>
      </tr>
    `;

    return;

  }


  rows.innerHTML = list
    .map(member => {

      const memberNumber =
        member.member_number || "—";


      const membershipNumber =
        member.membership_number || "—";


      const account =
        member.auth_user_id
          ? `<span>ACTIVE</span>`
          : `<span>PENDING</span>`;


      const actions = `
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
            data-edit="${escapeHtml(member.id)}"
          >
            Edit
          </button>

          ${
            member.status === "active"
              ? `
                <button
                  class="btn btn-secondary"
                  type="button"
                  data-deactivate="${escapeHtml(member.id)}"
                >
                  Deactivate
                </button>
              `
              : `
                <button
                  class="btn btn-secondary"
                  type="button"
                  data-activate="${escapeHtml(member.id)}"
                >
                  Activate
                </button>
              `
          }

        </div>
      `;


      return `
        <tr>

          <td>
            ${escapeHtml(memberNumber)}
          </td>

          <td>
            ${escapeHtml(membershipNumber)}
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
          </td>

          <td>
            ${actions}
          </td>

        </tr>
      `;

    })
    .join("");


  attachRowActions();

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

          const member = members.find(
            item =>
              String(item.id) ===
              String(button.dataset.edit)
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
   ADD MEMBER BUTTON
========================================================= */

addButton.addEventListener(
  "click",
  () => {

    editingId = null;

    form.reset();


    document.getElementById(
      "formTitle"
    ).textContent =
      "Add Member";


    document.getElementById(
      "joinDate"
    ).value =
      new Date()
        .toISOString()
        .slice(0, 10);


    document.getElementById(
      "role"
    ).value =
      "member";


    document.getElementById(
      "status"
    ).value =
      "active";


    saveButton.textContent =
      "Save Member";


    formCard.hidden = false;


    clearMessages();


    formCard.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  }
);


/* =========================================================
   OPEN EDIT FORM
========================================================= */

function openEditForm(member) {

  editingId = member.id;


  document.getElementById(
    "formTitle"
  ).textContent =
    "Edit Member";


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


  document.getElementById(
    "joinDate"
  ).value =
    member.join_date || "";


  document.getElementById(
    "status"
  ).value =
    member.status || "active";


  saveButton.textContent =
    "Update Member";


  formCard.hidden = false;


  clearMessages();


  formCard.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}


/* =========================================================
   CANCEL EDIT
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
   SAVE MEMBER
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


    const joinDate =
      document
        .getElementById("joinDate")
        .value;


    const status =
      document
        .getElementById("status")
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


    saveButton.disabled = true;

    saveButton.textContent =
      editingId
        ? "Updating..."
        : "Saving...";


    try {

      if (editingId) {

        await updateMember({

          member_number:
            memberNumber,

          membership_number:
            membershipNumber || null,

          name,

          phone,

          email:
            email || null,

          role,

          join_date:
            joinDate || null,

          status

        });


        showSuccess(
          "Member updated successfully."
        );

      } else {

        await createMember({

          member_number:
            memberNumber,

          membership_number:
            membershipNumber || null,

          name,

          phone,

          email:
            email || null,

          role,

          join_date:
            joinDate ||
            new Date()
              .toISOString()
              .slice(0, 10),

          status

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
        "Save Member";

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

    join_date:
      member.join_date,

    status:
      member.status,

    onboarding_status:
      "pending"

  };


  /*
   * Only add membership_number
   * when the field exists in the database
   * and has a value.
   */

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
   UPDATE MEMBER
========================================================= */

async function updateMember(member) {

  const payload = {

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

    join_date:
      member.join_date,

    status:
      member.status

  };


  if (
    member.membership_number !== undefined
  ) {

    payload.membership_number =
      member.membership_number;

  }


  const {
    error
  } =
    await supabase
      .from("members")
      .update(payload)
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

  const action =
    newStatus === "active"
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
    } =
      await supabase
        .from("members")
        .update({
          status: newStatus
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
   SEARCH
========================================================= */

search.addEventListener(
  "input",
  () => {

    const query =
      search.value
        .trim()
        .toLowerCase();


    if (!query) {

      renderMembers(
        members
      );

      return;

    }


    const filtered =
      members.filter(member => {

        const values = [

          member.member_number,

          member.membership_number,

          member.name,

          member.phone,

          member.email,

          member.role,

          member.status

        ];


        return values
          .filter(Boolean)
          .some(value =>
            String(value)
              .toLowerCase()
              .includes(query)
          );

      });


    renderMembers(
      filtered
    );

  }
);


/* =========================================================
   FORMAT ROLE
========================================================= */

function formatRole(role) {

  const value =
    String(
      role || "member"
    )
      .replaceAll("_", " ");


  return escapeHtml(
    value.replace(
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
   STATUS MESSAGE
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
   SUCCESS
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
   FRIENDLY ERROR
========================================================= */

function friendlyError(error) {

  const message =
    String(
      error?.message ||
      error ||
      "Something went wrong."
    );


  const lower =
    message.toLowerCase();


  if (
    lower.includes("row-level security") ||
    lower.includes("rls")
  ) {

    return (
      "You do not have permission to manage members. " +
      "Please check the Members table RLS policies in Supabase."
    );

  }


  if (
    lower.includes("duplicate") ||
    lower.includes("unique constraint")
  ) {

    return (
      "That member number already exists. " +
      "Please use a different member number."
    );

  }


  if (
    lower.includes("membership_number") &&
    lower.includes("column")
  ) {

    return (
      "The database does not have the membership_number column. " +
      "Remove that field or add the column to the members table."
    );

  }


  if (
    lower.includes("members") &&
    lower.includes("relation")
  ) {

    return (
      "The members table could not be found in Supabase."
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
   START
========================================================= */

init();
```
