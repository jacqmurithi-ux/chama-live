import supabase from "./supabase.js";


/* =========================================================
   CHAMA LIVE — MEMBERS
========================================================= */

function escapeHtml(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function formatDate(value) {

  if (!value) {
    return "—";
  }

  return new Date(value)
    .toLocaleDateString(
      "en-KE",
      {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }
    );
}


/* =========================================================
   GET CURRENT MEMBER
========================================================= */

async function getCurrentMember() {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_my_member"
    );


  if (error) {
    throw error;
  }


  if (Array.isArray(data)) {
    return data[0] || null;
  }


  return data || null;
}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  const table =
    document.querySelector(
      "#membersTable tbody"
    );


  if (!table) {

    console.error(
      "membersTable tbody not found."
    );

    return;
  }


  table.innerHTML = `
    <tr>
      <td colspan="8">
        Loading members...
      </td>
    </tr>
  `;


  try {

    const currentMember =
      await getCurrentMember();


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


    renderMembers(
      data || []
    );


  } catch (error) {

    console.error(
      "Members loading error:",
      error
    );


    table.innerHTML = `
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
   RENDER
========================================================= */

function renderMembers(
  members
) {

  const table =
    document.querySelector(
      "#membersTable tbody"
    );


  if (!table) {
    return;
  }


  if (!members.length) {

    table.innerHTML = `
      <tr>
        <td colspan="8">
          No members registered yet.
        </td>
      </tr>
    `;

    return;
  }


  table.innerHTML =
    members
      .map(member => {

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
                member.membership_number ||
                "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                member.name
              )}
            </td>

            <td>
              ${escapeHtml(
                member.phone
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
                class="btn btn-secondary"
                type="button"
                data-member-id="${escapeHtml(
                  member.id
                )}"
              >
                View
              </button>
            </td>

          </tr>
        `;

      })
      .join("");
}


/* =========================================================
   START
========================================================= */

export async function init() {

  console.log(
    "CHAMA LIVE: members.js loaded."
  );

  await loadMembers();

}


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
