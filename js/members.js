import { supabase } from "./supabase.js";


/* =========================================================
   CHAMA LIVE — MEMBERS
========================================================= */

let members = [];


/* =========================================================
   HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
}


function escapeHtml(value) {

  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  const tableBody =
    document.querySelector(
      "#membersTable tbody"
    );


  if (!tableBody) {
    console.warn(
      "Members table body not found."
    );
    return;
  }


  tableBody.innerHTML = `
    <tr>
      <td colspan="8">
        Loading...
      </td>
    </tr>
  `;


  try {

    /*
     * Get the current member first.
     * This gives us the group_id.
     */

    const {
      data: myMember,
      error: memberError
    } =
      await supabase.rpc(
        "get_my_member"
      );


    if (memberError) {
      throw memberError;
    }


    const currentMember =
      Array.isArray(myMember)
        ? myMember[0]
        : myMember;


    if (!currentMember) {

      throw new Error(
        "Your member account could not be found."
      );

    }


    const groupId =
      currentMember.group_id;


    if (!groupId) {

      throw new Error(
        "Your account is not linked to a group."
      );

    }


    /*
     * Load members belonging to this group.
     */

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
          "created_at",
          {
            ascending: false
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


  } catch (error) {

    console.error(
      "Unable to load members:",
      error
    );


    tableBody.innerHTML = `
      <tr>
        <td colspan="8">
          Unable to load members: 
          ${escapeHtml(error.message)}
        </td>
      </tr>
    `;

  }

}


/* =========================================================
   RENDER MEMBERS
========================================================= */

function renderMembers(
  rows
) {

  const tableBody =
    document.querySelector(
      "#membersTable tbody"
    );


  if (!tableBody) {
    return;
  }


  if (!rows.length) {

    tableBody.innerHTML = `
      <tr>
        <td colspan="8">
          No members registered yet.
        </td>
      </tr>
    `;

    return;
  }


  tableBody.innerHTML =
    rows.map(
      member => {

        const status =
          member.status ||
          "active";


        const role =
          member.role ||
          "member";


        const joinDate =
          member.join_date
            ? new Date(
                member.join_date
              ).toLocaleDateString()
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
                member.member_number || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                member.name || "—"
              )}
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
                class="btn btn-secondary"
                data-member-id="${escapeHtml(
                  member.id
                )}"
              >
                View
              </button>
            </td>

          </tr>
        `;

      }
    )
    .join("");

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function init() {

  console.log(
    "CHAMA LIVE: members.js loaded."
  );


  await loadMembers();

}


/* =========================================================
   AUTO START
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    init,
    {
      once: true
    }
  );

} else {

  init();

}
