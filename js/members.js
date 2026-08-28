```javascript
/* =========================================================
   CHAMA LIVE — MEMBERS
   Live Supabase Schema Aligned
   Loaded dynamically by layout.js
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup,
  signOut
} from "./auth.js";


console.log("CHAMA LIVE: members.js loaded");


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let groupId = null;

let members = [];

let initialized = false;


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


function showError(error) {

  console.error(
    "CHAMA LIVE Members:",
    error
  );

  const message =
    error?.message ||
    String(error) ||
    "Unable to load members.";

  const errorElement =
    byId("error") ||
    document.querySelector("[data-error]");

  if (errorElement) {

    errorElement.textContent =
      message;

    errorElement.hidden =
      false;

  }

}


function clearError() {

  const errorElement =
    byId("error") ||
    document.querySelector("[data-error]");

  if (errorElement) {

    errorElement.textContent =
      "";

    errorElement.hidden =
      true;

  }

}


function showLoading(message) {

  const loading =
    byId("loading") ||
    document.querySelector("[data-loading]");

  if (loading) {

    loading.textContent =
      message || "Loading members...";

    loading.hidden =
      false;

  }

}


function hideLoading() {

  const loading =
    byId("loading") ||
    document.querySelector("[data-loading]");

  if (loading) {

    loading.hidden =
      true;

  }

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function init() {

  if (initialized) {

    console.warn(
      "CHAMA LIVE: members already initialized"
    );

    return;

  }

  initialized = true;

  try {

    clearError();

    showLoading(
      "Loading members..."
    );


    /* -----------------------------------------------------
       AUTH
    ----------------------------------------------------- */

    currentUser =
      await requireAuth();


    /* -----------------------------------------------------
       CURRENT MEMBER
    ----------------------------------------------------- */

    currentMember =
      await getMyMember();


    if (!currentMember?.group_id) {

      throw new Error(
        "Your account is not linked to a group."
      );

    }


    groupId =
      currentMember.group_id;


    /* -----------------------------------------------------
       CURRENT GROUP
    ----------------------------------------------------- */

    currentGroup =
      await getMyGroup();


    console.log(
      "CHAMA LIVE: current group",
      currentGroup
    );


    /* -----------------------------------------------------
       LOAD MEMBERS
    ----------------------------------------------------- */

    await loadMembers();


    /* -----------------------------------------------------
       RENDER
    ----------------------------------------------------- */

    renderMembers();

    updateTotalMembers();

    hideLoading();


    console.log(
      "CHAMA LIVE: members initialized"
    );

  }
  catch (error) {

    initialized = false;

    hideLoading();

    showError(error);

  }

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  if (!groupId) {

    throw new Error(
      "No group ID is available."
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
        user_id,
        member_number,
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
          ascending: true
        }
      );


  if (error) {

    throw error;

  }


  members =
    data || [];


  console.log(
    "CHAMA LIVE: members loaded",
    members
  );

}


/* =========================================================
   UPDATE TOTAL
========================================================= */

function updateTotalMembers() {

  const total =
    byId("totalMembers") ||
    byId("memberCount") ||
    document.querySelector(
      "[data-total-members]"
    );


  if (total) {

    total.textContent =
      String(
        members.length
      );

  }

}


/* =========================================================
   RENDER MEMBERS
========================================================= */

function renderMembers() {

  const tbody =
    byId("memberRows") ||
    byId("membersTableBody") ||
    document.querySelector(
      "[data-members-body]"
    );


  if (!tbody) {

    console.warn(
      "CHAMA LIVE: Members table body not found."
    );

    return;

  }


  if (!members.length) {

    tbody.innerHTML =
      `
        <tr>
          <td colspan="8">
            No members registered yet.
          </td>
        </tr>
      `;

    return;

  }


  tbody.innerHTML =
    members
      .map(
        member => {

          const memberNumber =
            member.member_number ||
            "—";


          const name =
            member.name ||
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
            member.onboarding_status ||
            member.status ||
            "active";


          return `
            <tr data-member-id="${escapeHtml(member.id)}">

              <td>
                ${escapeHtml(
                  memberNumber
                )}
              </td>

              <td>
                ${escapeHtml(
                  memberNumber
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
                  class="btn btn-secondary btn-sm"
                  data-member-action="view"
                  data-member-id="${escapeHtml(member.id)}"
                >
                  View
                </button>

              </td>

            </tr>
          `;

        }
      )
      .join("");


  bindMemberActions();

}


/* =========================================================
   MEMBER ACTIONS
========================================================= */

function bindMemberActions() {

  document
    .querySelectorAll(
      "[data-member-action]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const memberId =
              button.dataset.memberId;

            viewMember(
              memberId
            );

          }
        );

      }
    );

}


/* =========================================================
   VIEW MEMBER
========================================================= */

function viewMember(
  memberId
) {

  const member =
    members.find(
      item =>
        item.id === memberId
    );


  if (!member) {

    return;

  }


  const message =
    [
      `Member: ${member.name || "—"}`,
      `Member No: ${member.member_number || "—"}`,
      `Phone: ${member.phone || "—"}`,
      `Email: ${member.email || "—"}`,
      `Role: ${member.role || "member"}`,
      `Status: ${member.status || "—"}`
    ]
      .join("\n");


  alert(message);

}


/* =========================================================
   REFRESH
========================================================= */

export async function refreshMembers() {

  if (!groupId) {

    return;

  }


  showLoading(
    "Refreshing members..."
  );


  try {

    await loadMembers();

    renderMembers();

    updateTotalMembers();

  }
  catch (error) {

    showError(error);

  }
  finally {

    hideLoading();

  }

}


/* =========================================================
   AUTO INIT
========================================================= */

if (
  document.readyState === "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      init();
    },
    {
      once: true
    }
  );

}
else {

  init();

}


console.log(
  "CHAMA LIVE: members.js ready"
);
```
