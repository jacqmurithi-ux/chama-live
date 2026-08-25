import {
  supabase,
  getMyMember,
  hasRole
} from "./auth.js";


/* =====================================================
   STATE
===================================================== */

let currentMember = null;
let members = [];
let editingId = null;


/* =====================================================
   ELEMENTS
===================================================== */

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
    "memberRows"
  );

const search =
  document.getElementById(
    "search"
  );

const count =
  document.getElementById(
    "memberCount"
  );

const errorBox =
  document.getElementById(
    "error"
  );

const successBox =
  document.getElementById(
    "success"
  );


/* =====================================================
   INITIALIZE
===================================================== */

async function init() {

  try {

    currentMember =
      await getMyMember();

    if (!currentMember) {

      throw new Error(
        "Unable to identify your member account."
      );

    }


    const allowed =
      await hasRole([
        "admin",
        "chairperson",
        "secretary"
      ]);


    if (!allowed) {

      addButton.hidden =
        true;

    }


    await loadMembers();

  } catch (error) {

    console.error(
      error
    );

    showError(
      error.message
    );

  }

}


/* =====================================================
   LOAD MEMBERS
===================================================== */

async function loadMembers() {

  rows.innerHTML = `
    <tr>
      <td colspan="7">
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
        name,
        member_number,
        membership_number,
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
          ascending:true
        }
      );


  if (error) {
    throw error;
  }


  members =
    data || [];


  renderMembers(
    members
  );

}


/* =====================================================
   RENDER
===================================================== */

function renderMembers(
  list
) {

  count.textContent =
    `${list.length} member${list.length === 1 ? "" : "s"}`;


  if (!list.length) {

    rows.innerHTML = `
      <tr>
        <td colspan="7">
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

          const memberNumber =
            member.membership_number ||
            member.member_number ||
            "—";


          const account =
            member.auth_user_id
              ? `<span>ACTIVE</span>`
              : `<span>PENDING</span>`;


          return `

            <tr>

              <td>
                <strong>
                  ${escapeHtml(
                    member.name
                  )}
                </strong>

                ${
                  member.email
                    ? `
                      <div class="muted">
                        ${escapeHtml(
                          member.email
                        )}
                      </div>
                    `
                    : ""
                }

              </td>


              <td>
                ${escapeHtml(
                  memberNumber
                )}
              </td>


              <td>
                ${escapeHtml(
                  member.phone || "—"
                )}
              </td>


              <td>
                ${formatRole(
                  member.role
                )}
              </td>


              <td>
                ${formatStatus(
                  member.status
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
                    data-edit="${member.id}"
                    type="button"
                  >
                    Edit
                  </button>

                  ${
                    member.status === "active"
                      ? `
                        <button
                          class="btn btn-secondary"
                          data-deactivate="${member.id}"
                          type="button"
                        >
                          Deactivate
                        </button>
                      `
                      : `
                        <button
                          class="btn btn-secondary"
                          data-activate="${member.id}"
                          type="button"
                        >
                          Activate
                        </button>
                      `
                  }

                </div>

              </td>

            </tr>

          `;

        }
      )
      .join("");


  attachRowActions();

}


/* =====================================================
   ROW ACTIONS
===================================================== */

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


/* =====================================================
   OPEN ADD FORM
===================================================== */

addButton.addEventListener(
  "click",
  () => {

    editingId =
      null;

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
        .slice(
          0,
          10
        );

    document.getElementById(
      "role"
    ).value =
      "member";

    document.getElementById(
      "status"
    ).value =
      "active";

    formCard.hidden =
      false;

    window.scrollTo({
      top:0,
      behavior:"smooth"
    });

  }
);


/* =====================================================
   EDIT FORM
===================================================== */

function openEditForm(
  member
) {

  editingId =
    member.id;


  document.getElementById(
    "formTitle"
  ).textContent =
    "Edit Member";


  document.getElementById(
    "name"
  ).value =
    member.name || "";


  document.getElementById(
    "memberNumber"
  ).value =
    member.membership_number ||
    member.member_number ||
    "";


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


  formCard.hidden =
    false;


  window.scrollTo({
    top:0,
    behavior:"smooth"
  });

}


/* =====================================================
   CANCEL
===================================================== */

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


/* =====================================================
   SAVE
===================================================== */

form.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    clearMessages();


    const name =
      document.getElementById(
        "name"
      ).value.trim();


    const memberNumber =
      document.getElementById(
        "memberNumber"
      ).value.trim();


    const phone =
      document.getElementById(
        "phone"
      ).value.trim();


    const memberEmail =
      document.getElementById(
        "email"
      ).value.trim()
        .toLowerCase();


    const role =
      document.getElementById(
        "role"
      ).value;


    const joinDate =
      document.getElementById(
        "joinDate"
      ).value;


    const status =
      document.getElementById(
        "status"
      ).value;


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

          phone,

          email:
            memberEmail || null,

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

          name,

          member_number:
            memberNumber,

          phone,

          email:
            memberEmail || null,

          role,

          join_date:
            joinDate ||
            new Date()
              .toISOString()
              .slice(
                0,
                10
              ),

          status

        });


        showSuccess(
          "Member added successfully. They can now activate their account."
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
        error
      );

      showError(
        friendlyError(
          error
        )
      );

    } finally {

      saveButton.disabled =
        false;

      saveButton.textContent =
        "Save Member";

    }

  }
);


/* =====================================================
   CREATE MEMBER
===================================================== */

async function createMember(
  member
) {

  /*
   * IMPORTANT:
   *
   * group_id comes from the authenticated
   * administrator's member record.
   *
   * It is NOT taken from a form field.
   */

  const payload = {

    group_id:
      currentMember.group_id,

    name:
      member.name,

    member_number:
      member.member_number,

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


  const {
    error
  } =
    await supabase
      .from("members")
      .insert(
        payload
      );


  if (error) {
    throw error;
  }

}


/* =====================================================
   UPDATE MEMBER
===================================================== */

async function updateMember(
  member
) {

  const {
    error
  } =
    await supabase
      .from("members")
      .update(
        member
      )
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


/* =====================================================
   CHANGE STATUS
===================================================== */

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
      error
    );

    showError(
      friendlyError(
        error
      )
    );

  }

}


/* =====================================================
   SEARCH
===================================================== */

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
      members.filter(
        member => {

          return [

            member.name,

            member.member_number,

            member.membership_number,

            member.phone,

            member.email,

            member.role,

            member.status

          ]
            .filter(Boolean)
            .some(
              value =>
                String(
                  value
                )
                  .toLowerCase()
                  .includes(
                    query
                  )
            );

        }
      );


    renderMembers(
      filtered
    );

  }
);


/* =====================================================
   FORMATTING
===================================================== */

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


function formatStatus(
  status
) {

  const value =
    String(
      status || "active"
    )
      .toLowerCase();


  return value === "active"
    ? "ACTIVE"
    : "INACTIVE";

}


/* =====================================================
   ERROR
===================================================== */

function friendlyError(
  error
) {

  const message =
    error?.message ||
    "Something went wrong.";


  if (
    message
      .toLowerCase()
      .includes(
        "duplicate"
      )
  ) {

    return (
      "That member number already exists. " +
      "Please use a different member number."
    );

  }


  if (
    message
      .toLowerCase()
      .includes(
        "row-level security"
      )
  ) {

    return (
      "You do not have permission to manage members."
    );

  }


  return message;

}


/* =====================================================
   MESSAGES
===================================================== */

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


function showSuccess(
  message
) {

  successBox.hidden =
    false;

  successBox.textContent =
    message;

  errorBox.hidden =
    true;

}


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


/* =====================================================
   ESCAPE HTML
===================================================== */

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


/* =====================================================
   START
===================================================== */

init();
