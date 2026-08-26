import { supabase } from "./supabase.js";


/* =========================================================
   CHAMA LIVE — MEMBERS
========================================================= */

console.log("CHAMA LIVE: members.js loaded");


/* =========================================================
   HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
}


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =========================================================
   ERROR
========================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE MEMBERS ERROR:",
    error
  );


  const errorBox =
    byId("error");


  if (errorBox) {

    errorBox.hidden =
      false;

    errorBox.textContent =
      error?.message ||
      String(error) ||
      "Unable to load members.";

  }

}


/* =========================================================
   CURRENT USER
========================================================= */

async function getUser() {

  const {
    data,
    error
  } =
    await supabase.auth.getUser();


  if (error) {
    throw error;
  }


  if (!data?.user) {

    throw new Error(
      "You are not logged in."
    );

  }


  return data.user;

}


/* =========================================================
   CURRENT MEMBER
========================================================= */

async function getCurrentMember(
  userId
) {

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select("*")
      .eq(
        "user_id",
        userId
      )
      .limit(1);


  if (error) {
    throw error;
  }


  if (
    !data ||
    data.length === 0
  ) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  return data[0];

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function getMembers(
  groupId
) {

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select("*")
      .eq(
        "group_id",
        groupId
      )
      .order(
        "created_at",
        {
          ascending: true
        }
      );


  if (error) {
    throw error;
  }


  return data || [];

}


/* =========================================================
   FIND TABLE
========================================================= */

function getMemberTable() {

  /*
   * Support several possible IDs so this JS works
   * with the existing members.html versions.
   */

  return (
    byId("memberRows") ||
    byId("membersRows") ||
    byId("memberTableBody") ||
    byId("membersTableBody") ||
    document.querySelector(
      "table tbody"
    )
  );

}


/* =========================================================
   RENDER MEMBERS
========================================================= */

function renderMembers(
  members
) {

  const rows =
    getMemberTable();


  if (!rows) {

    throw new Error(
      "Members table body could not be found in members.html."
    );

  }


  if (!members.length) {

    rows.innerHTML = `
      <tr>
        <td colspan="8">
          No members registered yet.
        </td>
      </tr>
    `;

    return;

  }


  rows.innerHTML =
    members
      .map(
        member => {

          const memberNumber =
            member.member_number ||
            member.membership_number ||
            member.member_no ||
            "—";


          const membershipNumber =
            member.membership_number ||
            member.member_number ||
            "—";


          const name =
            member.name ||
            member.full_name ||
            "—";


          const phone =
            member.phone ||
            "—";


          const email =
            member.email ||
            "—";


          const role =
            member.role ||
            "member";


          const accountStatus =
            member.status ||
            "active";


          const statusClass =
            String(
              accountStatus
            ).toLowerCase();


          return `
            <tr>

              <td>
                ${escapeHtml(
                  memberNumber
                )}
              </td>

              <td>
                ${escapeHtml(
                  membershipNumber
                )}
              </td>

              <td>
                ${escapeHtml(
                  name
                )}
              </td>

              <td>
                ${escapeHtml(
                  phone
                )}
              </td>

              <td>
                ${escapeHtml(
                  email
                )}
              </td>

              <td>
                ${escapeHtml(
                  role
                )}
              </td>

              <td>
                ${escapeHtml(
                  accountStatus
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
   MEMBER COUNT
========================================================= */

function updateMemberCount(
  members
) {

  const total =
    members.length;


  const active =
    members.filter(
      member =>
        String(
          member.status ||
          "active"
        ).toLowerCase() ===
        "active"
    ).length;


  /*
   * Support different possible IDs.
   */

  const totalElement =
    byId("membersCount") ||
    byId("memberCount") ||
    byId("totalMembers");


  const activeElement =
    byId("activeMembers");


  if (totalElement) {

    totalElement.textContent =
      total;

  }


  if (activeElement) {

    activeElement.textContent =
      active;

  }

}


/* =========================================================
   ADD MEMBER BUTTON
========================================================= */

function setupAddMember() {

  const buttons =
    document.querySelectorAll(
      "#addMember, [data-add-member]"
    );


  buttons.forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          /*
           * If your members page already has an
           * add-member modal/form, this leaves it
           * untouched.
           *
           * Otherwise take the user to the
           * create member page if available.
           */

          const form =
            byId("addMemberForm");


          if (form) {

            form.hidden =
              false;

            form.scrollIntoView({
              behavior: "smooth"
            });

            return;

          }


          const modal =
            byId("addMemberModal");


          if (modal) {

            modal.hidden =
              false;

            return;

          }


          console.log(
            "Add Member clicked."
          );

        }
      );

    }
  );

}


/* =========================================================
   VIEW MEMBER
========================================================= */

function setupMemberActions() {

  document.addEventListener(
    "click",
    event => {

      const button =
        event.target.closest(
          "[data-member-id]"
        );


      if (!button) {
        return;
      }


      const memberId =
        button.dataset.memberId;


      console.log(
        "Selected member:",
        memberId
      );

    }
  );

}


/* =========================================================
   MAIN
========================================================= */

async function loadMembers() {

  try {

    console.log(
      "CHAMA LIVE: Loading members..."
    );


    const user =
      await getUser();


    console.log(
      "CHAMA LIVE USER:",
      user.id
    );


    const currentMember =
      await getCurrentMember(
        user.id
      );


    console.log(
      "CHAMA LIVE CURRENT MEMBER:",
      currentMember
    );


    if (!currentMember.group_id) {

      throw new Error(
        "Your member account does not have a group assigned."
      );

    }


    const members =
      await getMembers(
        currentMember.group_id
      );


    console.log(
      "CHAMA LIVE MEMBERS:",
      members
    );


    renderMembers(
      members
    );


    updateMemberCount(
      members
    );


    setupAddMember();


    setupMemberActions();


    const status =
      byId("status");


    if (status) {

      status.style.display =
        "none";

    }


    console.log(
      "CHAMA LIVE: Members ready."
    );


  } catch (error) {

    showError(
      error
    );

  }

}


/* =========================================================
   EXPORT
========================================================= */

export async function initMembers() {

  await loadMembers();

}


/* =========================================================
   START
========================================================= */

loadMembers();
