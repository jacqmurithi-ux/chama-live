import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";


const $ = (id) =>
  document.getElementById(id);


let currentUser = null;
let currentGroupId = null;
let allMembers = [];
let editingMemberId = null;


/* =====================================================
   INIT
===================================================== */

async function init() {

  try {

    const member =
      await getMyMember();

    if (!member) {
      throw new Error(
        "Unable to identify your group."
      );
    }


    currentUser = member;
    currentGroupId = member.group_id;


    setupEvents();

    await loadMembers();


  } catch (error) {

    showError(error);

  }

}


/* =====================================================
   EVENTS
===================================================== */

function setupEvents() {

  $("addMemberBtn")
    ?.addEventListener(
      "click",
      openAddMember
    );


  $("closeModal")
    ?.addEventListener(
      "click",
      closeModal
    );


  $("cancelMember")
    ?.addEventListener(
      "click",
      closeModal
    );


  $("memberForm")
    ?.addEventListener(
      "submit",
      saveMember
    );


  $("search")
    ?.addEventListener(
      "input",
      renderMembers
    );


  $("roleFilter")
    ?.addEventListener(
      "change",
      renderMembers
    );


  $("statusFilter")
    ?.addEventListener(
      "change",
      renderMembers
    );


  $("memberModal")
    ?.addEventListener(
      "click",
      event => {

        if (
          event.target ===
          $("memberModal")
        ) {

          closeModal();

        }

      }
    );

}


/* =====================================================
   LOAD MEMBERS
===================================================== */

async function loadMembers() {

  clearError();

  setStatus(
    "Loading members..."
  );


  const {
    data,
    error
  } = await supabase

    .from("members")

    .select(`
      id,
      group_id,
      user_id,
      auth_user_id,
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
      currentGroupId
    )

    .order(
      "name",
      {
        ascending: true
      }
    );


  if (error) {

    /*
      Some installations may not yet have
      auth_user_id. Retry without it.
    */

    if (
      error.message?.includes(
        "auth_user_id"
      )
    ) {

      const retry =
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
            currentGroupId
          )

          .order(
            "name",
            {
              ascending: true
            }
          );


      if (retry.error) {

        throw retry.error;

      }


      allMembers =
        retry.data || [];

    } else {

      throw error;

    }

  } else {

    allMembers =
      data || [];

  }


  renderMembers();

  updateStatistics();


  setStatus(
    `Members loaded • ${new Date().toLocaleString(
      "en-KE"
    )}`
  );

}


/* =====================================================
   RENDER
===================================================== */

function renderMembers() {

  const tbody =
    $("memberRows");

  if (!tbody) {
    return;
  }


  const search =
    (
      $("search")?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  const role =
    $("roleFilter")?.value ||
    "";


  const status =
    $("statusFilter")?.value ||
    "";


  const filtered =
    allMembers.filter(
      member => {

        const searchable =
          [
            member.name,
            member.member_number,
            member.phone,
            member.email
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();


        if (
          search &&
          !searchable.includes(search)
        ) {

          return false;

        }


        if (
          role &&
          member.role !== role
        ) {

          return false;

        }


        if (
          status &&
          member.status !== status
        ) {

          return false;

        }


        return true;

      }
    );


  if (!filtered.length) {

    tbody.innerHTML = `

      <tr>

        <td colspan="8">

          No members found.

        </td>

      </tr>

    `;

    return;

  }


  tbody.innerHTML =
    filtered
      .map(
        member =>
          memberRow(member)
      )
      .join("");

}


/* =====================================================
   MEMBER ROW
===================================================== */

function memberRow(member) {

  const loginEnabled =
    Boolean(
      member.auth_user_id ||
      member.user_id
    );


  return `

    <tr>

      <td>

        <strong>
          ${escapeHtml(
            member.member_number ||
            "—"
          )}
        </strong>

      </td>


      <td>

        <strong>
          ${escapeHtml(
            member.name
          )}
        </strong>

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

        <span>
          ${escapeHtml(
            formatRole(
              member.role
            )
          )}
        </span>

      </td>


      <td>

        <strong>
          ${escapeHtml(
            String(
              member.status ||
              "active"
            ).toUpperCase()
          )}
        </strong>

      </td>


      <td>

        ${
          loginEnabled

            ? `<strong>ENABLED</strong>`

            : `<span class="muted">
                NOT ENABLED
              </span>`
        }

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


          ${
            member.status === "active"

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
              `
          }


          ${
            !loginEnabled

              ? `
                <button
                  class="btn btn-primary"
                  type="button"
                  data-action="login"
                  data-id="${member.id}"
                >
                  Enable Login
                </button>
              `

              : ""
          }

        </div>

      </td>

    </tr>

  `;

}


/* =====================================================
   TABLE ACTIONS
===================================================== */

document.addEventListener(
  "click",
  async event => {

    const button =
      event.target.closest(
        "[data-action]"
      );


    if (!button) {
      return;
    }


    const action =
      button.dataset.action;


    const id =
      button.dataset.id;


    const member =
      allMembers.find(
        item =>
          String(item.id) ===
          String(id)
      );


    if (!member) {
      return;
    }


    if (action === "edit") {

      openEditMember(member);

    }


    if (action === "activate") {

      await changeStatus(
        member,
        "active"
      );

    }


    if (action === "deactivate") {

      await changeStatus(
        member,
        "inactive"
      );

    }


    if (action === "login") {

      enableLogin(member);

    }

  }
);


/* =====================================================
   ADD MEMBER
===================================================== */

function openAddMember() {

  editingMemberId =
    null;


  $("modalTitle").textContent =
    "Add Member";


  $("memberForm").reset();


  $("memberId").value =
    "";


  $("joinDate").value =
    today();


  $("role").value =
    "member";


  $("memberStatus").value =
    "active";


  $("saveMember").textContent =
    "Save Member";


  openModal();

}


/* =====================================================
   EDIT MEMBER
===================================================== */

function openEditMember(member) {

  editingMemberId =
    member.id;


  $("modalTitle").textContent =
    "Edit Member";


  $("memberId").value =
    member.id;


  $("memberNumber").value =
    member.member_number ||
    "";


  $("name").value =
    member.name ||
    "";


  $("phone").value =
    member.phone ||
    "";


  $("email").value =
    member.email ||
    "";


  $("role").value =
    member.role ||
    "member";


  $("joinDate").value =
    member.join_date ||
    today();


  $("memberStatus").value =
    member.status ||
    "active";


  $("saveMember").textContent =
    "Update Member";


  openModal();

}


/* =====================================================
   SAVE MEMBER
===================================================== */

async function saveMember(event) {

  event.preventDefault();

  clearError();


  const memberNumber =
    $("memberNumber").value
      .trim();


  const name =
    $("name").value
      .trim();


  const phone =
    $("phone").value
      .trim();


  const email =
    $("email").value
      .trim();


  const role =
    $("role").value;


  const joinDate =
    $("joinDate").value;


  const status =
    $("memberStatus").value;


  if (!memberNumber) {

    showError(
      new Error(
        "Member number is required."
      )
    );

    return;

  }


  if (!name) {

    showError(
      new Error(
        "Member name is required."
      )
    );

    return;

  }


  if (!phone) {

    showError(
      new Error(
        "Phone number is required."
      )
    );

    return;

  }


  if (!joinDate) {

    showError(
      new Error(
        "Join date is required."
      )
    );

    return;

  }


  const payload = {

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

    join_date:
      joinDate,

    status:
      status

  };


  setStatus(
    editingMemberId
      ? "Updating member..."
      : "Creating member..."
  );


  let result;


  if (editingMemberId) {

    result =
      await supabase

        .from("members")

        .update(payload)

        .eq(
          "id",
          editingMemberId
        )

        .eq(
          "group_id",
          currentGroupId );

  } else {

    result =
      await supabase

        .from("members")

        .insert(
          payload
        );

  }


  if (result.error) {

    showError(
      result.error
    );

    return;

  }


  closeModal();

  await loadMembers();


  setStatus(
    editingMemberId
      ? "Member updated successfully."
      : "Member added successfully."
  );


  editingMemberId =
    null;

}


/* =====================================================
   STATUS CHANGE
===================================================== */

async function changeStatus(
  member,
  newStatus
) {

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


  clearError();


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
      member.id
    )

    .eq(
      "group_id",
      currentGroupId
    );


  if (error) {

    showError(error);

    return;

  }


  await loadMembers();

}


/* =====================================================
   ENABLE LOGIN
===================================================== */

function enableLogin(member) {

  /*
    We deliberately do not create an Auth
    password here.

    The next stage will use a secure invitation/
    account-activation process.

    For now this validates that the member has
    the information required for login.
  */


  if (!member.email) {

    alert(
      "This member needs an email address before login can be enabled."
    );

    openEditMember(member);

    return;

  }


  alert(
    `Login setup for ${member.name} will be activated through the secure member invitation process.`
  );

}


/* =====================================================
   STATISTICS
===================================================== */

function updateStatistics() {

  const total =
    allMembers.length;


  const active =
    allMembers.filter(
      member =>
        member.status ===
        "active"
    ).length;


  const login =
    allMembers.filter(
      member =>
        Boolean(
          member.auth_user_id ||
          member.user_id
        )
    ).length;


  $("totalMembers").textContent =
    total;


  $("activeMembers").textContent =
    active;


  $("loginMembers").textContent =
    login;

}


/* =====================================================
   MODAL
===================================================== */

function openModal() {

  $("memberModal").hidden =
    false;

}


function closeModal() {

  $("memberModal").hidden =
    true;

  editingMemberId =
    null;

}


/* =====================================================
   DATE
===================================================== */

function today() {

  const date =
    new Date();


  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(
    2,
    "0"
  )}-${String(
    date.getDate()
  ).padStart(
    2,
    "0"
  )}`;

}


/* =====================================================
   ROLE
===================================================== */

function formatRole(role) {

  if (!role) {
    return "Member";
  }


  return String(role)
    .replaceAll(
      "_",
      " "
    )
    .replace(
      /\b\w/g,
      letter =>
        letter.toUpperCase()
    );

}


/* =====================================================
   ESCAPE HTML
===================================================== */

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


/* =====================================================
   STATUS
===================================================== */

function setStatus(message) {

  const element =
    $("status");


  if (element) {

    element.textContent =
      message;

  }

}


/* =====================================================
   ERROR
===================================================== */

function clearError() {

  const element =
    $("error");


  if (!element) {
    return;
  }


  element.hidden =
    true;

  element.textContent =
    "";

}


function showError(error) {

  console.error(
    error
  );


  const message =
    error?.message ||
    "Unable to complete the operation.";


  const element =
    $("error");


  if (element) {

    element.hidden =
      false;

    element.textContent =
      message;

  }


  setStatus(
    "Unable to complete operation."
  );

}


/* =====================================================
   START
===================================================== */

init();
