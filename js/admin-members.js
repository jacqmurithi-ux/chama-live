```javascript
import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";


/* =====================================================
   HELPERS
===================================================== */

const $ = (id) =>
  document.getElementById(id);


let currentMember = null;

let groupId = null;

let members = [];


/* =====================================================
   INIT
===================================================== */

async function init() {

  try {

    const member =
      await getMyMember();


    if (!member) {

      throw new Error(
        "Unable to identify your member account."
      );

    }


    currentMember =
      Array.isArray(member)
        ? member[0]
        : member;


    if (!currentMember) {

      throw new Error(
        "Member profile not found."
      );

    }


    groupId =
      currentMember.group_id;


    if (!groupId) {

      throw new Error(
        "Your account is not linked to a group."
      );

    }


    /*
     * Security check.
     *
     * The UI check is only for user experience.
     * RLS must also enforce this permission.
     */

    const role =
      String(
        currentMember.role || ""
      ).toLowerCase();


    const allowedRoles = [
      "admin",
      "chairperson"
    ];


    if (
      !allowedRoles.includes(role)
    ) {

      showError(
        "Only the group administrator or chairperson can manage members."
      );

      $("memberForm").style.display =
        "none";

      return;

    }


    await loadMembers();


    $("memberForm")
      .addEventListener(
        "submit",
        addMember
      );


    $("search")
      .addEventListener(
        "input",
        renderMembers
      );


    $("logout")
      ?.addEventListener(
        "click",
        logout
      );


  } catch (error) {

    console.error(
      "Member management error:",
      error
    );

    showError(
      error?.message ||
      "Unable to load member management."
    );

  }

}


/* =====================================================
   LOAD MEMBERS
===================================================== */

async function loadMembers() {

  clearMessages();


  const {
    data,
    error
  } = await supabase

    .from("members")

    .select(`
      id,
      member_number,
      name,
      phone,
      email,
      role,
      status,
      auth_user_id,
      join_date,
      created_at
    `)

    .eq(
      "group_id",
      groupId
    )

    .order(
      "name",
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

}


/* =====================================================
   ADD MEMBER
===================================================== */

async function addMember(event) {

  event.preventDefault();

  clearMessages();


  const button =
    $("saveMember");


  button.disabled =
    true;

  button.textContent =
    "Adding member...";


  try {

    const memberNumber =
      $("memberNumber")
        .value
        .trim();


    const name =
      $("name")
        .value
        .trim();


    const phone =
      $("phone")
        .value
        .trim();


    const email =
      $("email")
        .value
        .trim()
        .toLowerCase();


    const role =
      $("role")
        .value;


    const status =
      $("status")
        .value;


    if (
      !memberNumber ||
      !name ||
      !phone
    ) {

      throw new Error(
        "Member number, name and phone are required."
      );

    }


    /*
     * Prevent duplicate member numbers
     * inside the current group.
     */

    const {
      data: duplicate,
      error: duplicateError
    } = await supabase

      .from("members")

      .select("id")

      .eq(
        "group_id",
        groupId
      )

      .eq(
        "member_number",
        memberNumber
      )
      .limit(1);


    if (duplicateError) {

      throw duplicateError;

    }


    if (
      duplicate &&
      duplicate.length
    ) {

      throw new Error(
        `Member number ${memberNumber} already exists.`
      );

    }


    /*
     * Insert member profile.
     *
     * auth_user_id remains NULL until
     * the member activates their login.
     */

    const {
      data,
      error
    } = await supabase

      .from("members")

      .insert({

        group_id:
          groupId,

        member_number:
          memberNumber,

        name,

        phone,

        email:
          email || null,

        role,

        status,

        auth_user_id:
          null

      })

      .select()

      .single();


    if (error) {

      throw error;

    }


    console.log(
      "Member created:",
      data
    );


    /*
     * Reset form.
     */

    $("memberForm")
      .reset();


    /*
     * Reload list.
     */

    await loadMembers();


    showSuccess(
      "Member added successfully. The member can now be invited to activate their login."
    );


  } catch (error) {

    console.error(
      "Add member error:",
      error
    );


    showError(
      error?.message ||
      "Unable to add member."
    );


  } finally {

    button.disabled =
      false;

    button.textContent =
      "Add Member";

  }

}


/* =====================================================
   RENDER MEMBERS
===================================================== */

function renderMembers() {

  const tbody =
    $("memberRows");


  const search =
    $("search")
      ?.value
      ?.trim()
      ?.toLowerCase() ||
      "";


  const filtered =
    members.filter(
      member => {

        const text =
          [
            member.member_number,
            member.name,
            member.phone,
            member.email,
            member.role,
            member.status
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();


        return text.includes(
          search
        );

      }
    );


  if (!filtered.length) {

    tbody.innerHTML = `

      <tr>

        <td colspan="7">

          No members found.

        </td>

      </tr>

    `;

    return;

  }


  tbody.innerHTML =
    filtered
      .map(
        member => {

          const loginStatus =
            member.auth_user_id
              ? "ACTIVE LOGIN"
              : "NOT ACTIVATED";


          const statusClass =
            member.status === "active"
              ? "status-active"
              : "status-inactive";


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

                <span class="role-badge">

                  ${escapeHtml(
                    member.role ||
                    "member"
                  )}

                </span>

              </td>


              <td>

                <span
                  class="status-badge ${statusClass}"
                >

                  ${escapeHtml(
                    String(
                      member.status ||
                      "active"
                    ).toUpperCase()
                  )}

                </span>

              </td>


              <td>

                <span
                  class="status-badge ${
                    member.auth_user_id
                      ? "status-active"
                      : "status-inactive"
                  }"
                >

                  ${loginStatus}

                </span>

              </td>

            </tr>

          `;

        }
      )
      .join("");

}


/* =====================================================
   LOGOUT
===================================================== */

async function logout() {

  await supabase.auth.signOut();

  window.location.href =
    "login.html";

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
   ERROR
===================================================== */

function showError(message) {

  const box =
    $("error");


  if (!box) {

    alert(message);

    return;

  }


  box.textContent =
    message;

  box.style.display =
    "block";


  $("success")
    .style.display =
    "none";

}


/* =====================================================
   SUCCESS
===================================================== */

function showSuccess(message) {

  const box =
    $("success");


  if (!box) {

    alert(message);

    return;

  }


  box.textContent =
    message;

  box.style.display =
    "block";


  $("error")
    .style.display =
    "none";

}


/* =====================================================
   CLEAR MESSAGES
===================================================== */

function clearMessages() {

  $("error")
    .style.display =
    "none";

  $("success")
    .style.display =
    "none";

}


/* =====================================================
   START
===================================================== */

init();
```
