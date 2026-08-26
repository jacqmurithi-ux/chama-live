import { supabase } from "./supabase.js";
import {
  getCurrentUser,
  getCurrentMember,
  getCurrentGroup
} from "./auth.js";


/* =====================================================
   STATE
===================================================== */

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let allMembers = [];
let editingMemberId = null;


/* =====================================================
   HELPERS
===================================================== */

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


function showError(message) {

  const errorBox = byId("error");

  if (!errorBox) {
    return;
  }

  errorBox.hidden = false;
  errorBox.textContent =
    message || "Something went wrong.";
}


function clearError() {

  const errorBox = byId("error");

  if (!errorBox) {
    return;
  }

  errorBox.hidden = true;
  errorBox.textContent = "";
}


function setStatus(message) {

  const status = byId("status");

  if (status) {
    status.textContent = message || "";
  }
}


/* =====================================================
   LOAD MEMBERS
===================================================== */

async function loadMembers() {

  clearError();

  setStatus("Loading members...");

  const groupId =
    currentMember?.group_id ||
    currentGroup?.id;

  if (!groupId) {

    throw new Error(
      "Your account is not linked to a group."
    );

  }


  const {
    data,
    error
  } = await supabase

    .from("members")

    .select(`
      id,
      group_id,
      user_id,
      member_number,
      membership_number,
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
      "name",
      {
        ascending: true
      }
    );


  if (error) {
    throw error;
  }


  allMembers =
    Array.isArray(data)
      ? data
      : [];


  renderMembers(
    allMembers
  );

}


/* =====================================================
   RENDER MEMBERS
===================================================== */

function renderMembers(
  members
) {

  const rows =
    byId("memberRows");

  const count =
    byId("memberCount");


  if (count) {
    count.textContent =
      members.length;
  }


  if (!rows) {
    return;
  }


  if (!members.length) {

    rows.innerHTML = `
      <tr>
        <td colspan="8">
          No members found.
        </td>
      </tr>
    `;

    return;
  }


  rows.innerHTML =
    members.map(
      member => {

        const status =
          member.status ||
          "active";

        return `

          <tr>

            <td>
              ${escapeHtml(
                member.member_number || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                member.membership_number ||
                member.member_number ||
                "—"
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
              ${escapeHtml(
                member.role || "member"
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
                class="btn btn-secondary view-member"
                data-id="${escapeHtml(member.id)}"
              >
                View
              </button>

            </td>

          </tr>

        `;

      }
    ).join("");


  /*
   * Attach View buttons after
   * the table has been rendered.
   */

  document
    .querySelectorAll(
      ".view-member"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const memberId =
              button.dataset.id;

            openMemberModal(
              memberId
            );

          }
        );

      }
    );


  setStatus(
    `${members.length} member${members.length === 1 ? "" : "s"}`
  );

}


/* =====================================================
   SEARCH
===================================================== */

function setupSearch() {

  const search =
    byId("memberSearch");

  if (!search) {
    return;
  }


  search.addEventListener(
    "input",
    () => {

      const query =
        search.value
          .trim()
          .toLowerCase();


      if (!query) {

        renderMembers(
          allMembers
        );

        return;
      }


      const filtered =
        allMembers.filter(
          member => {

            const values = [

              member.member_number,

              member.membership_number,

              member.name,

              member.phone,

              member.email,

              member.role,

              member.status

            ];


            return values.some(
              value =>
                String(
                  value || ""
                )
                  .toLowerCase()
                  .includes(query)
            );

          }
        );


      renderMembers(
        filtered
      );

    }
  );

}


/* =====================================================
   MODAL
===================================================== */

function openMemberModal(
  memberId
) {

  const member =
    allMembers.find(
      item =>
        String(item.id) ===
        String(memberId)
    );


  if (!member) {

    console.error(
      "Member not found:",
      memberId
    );

    showError(
      "Unable to find that member."
    );

    return;
  }


  /*
   * Populate every modal field BEFORE
   * making the modal visible.
   */

  const name =
    member.name ||
    "Member";


  const memberNumber =
    member.member_number ||
    member.membership_number ||
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


  const status =
    member.status ||
    "active";


  const joinDate =
    member.join_date ||
    "—";


  byId("viewMemberName").textContent =
    name;


  byId("viewMemberNumber").textContent =
    memberNumber;


  byId("viewMemberPhone").textContent =
    phone;


  byId("viewMemberEmail").textContent =
    email;


  byId("viewMemberRole").textContent =
    role;


  byId("viewMemberStatus").textContent =
    status;


  byId("viewMemberJoinDate").textContent =
    joinDate;


  const modal =
    byId("memberModal");


  if (!modal) {

    console.error(
      "memberModal was not found in members.html"
    );

    return;
  }


  modal.hidden = false;

}


/* =====================================================
   CLOSE MODAL
===================================================== */

function closeMemberModal() {

  const modal =
    byId("memberModal");

  if (modal) {
    modal.hidden = true;
  }

}


/* =====================================================
   MODAL EVENTS
===================================================== */

function setupModal() {

  const closeButton =
    byId("closeMemberModal");


  if (closeButton) {

    closeButton.addEventListener(
      "click",
      closeMemberModal
    );

  }


  const modal =
    byId("memberModal");


  if (modal) {

    modal.addEventListener(
      "click",
      event => {

        if (
          event.target === modal
        ) {

          closeMemberModal();

        }

      }
    );

  }


  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Escape"
      ) {

        closeMemberModal();

      }

    }
  );

}


/* =====================================================
   ADD MEMBER PANEL
===================================================== */

function setupAddMemberPanel() {

  const addButton =
    byId("addMemberButton");

  const panel =
    byId("addMemberPanel");

  const closeButton =
    byId("closeAddMember");

  const cancelButton =
    byId("cancelAddMember");


  if (
    !addButton ||
    !panel
  ) {
    return;
  }


  function openPanel() {

    panel.hidden = false;

    panel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  }


  function closePanel() {

    panel.hidden = true;

  }


  addButton.addEventListener(
    "click",
    openPanel
  );


  if (closeButton) {

    closeButton.addEventListener(
      "click",
      closePanel
    );

  }


  if (cancelButton) {

    cancelButton.addEventListener(
      "click",
      closePanel
    );

  }

}


/* =====================================================
   ADD MEMBER
===================================================== */

function setupAddMemberForm() {

  const form =
    byId("addMemberForm");


  if (!form) {
    return;
  }


  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      clearError();


      const memberNumber =
        byId("memberNumber")?.value
          .trim();


      const name =
        byId("memberName")?.value
          .trim();


      const phone =
        byId("memberPhone")?.value
          .trim();


      const email =
        byId("memberEmail")?.value
          .trim();


      const role =
        byId("memberRole")?.value ||
        "member";


      if (
        !memberNumber ||
        !name ||
        !phone
      ) {

        showError(
          "Member number, name and phone are required."
        );

        return;
      }


      const groupId =
        currentMember?.group_id ||
        currentGroup?.id;


      if (!groupId) {

        showError(
          "Your account is not linked to a group."
        );

        return;
      }


      const saveButton =
        byId("saveMemberButton");


      if (saveButton) {

        saveButton.disabled = true;

        saveButton.textContent =
          "Saving...";

      }


      try {

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

            membership_number:
              memberNumber,

            name:
              name,

            phone:
              phone,

            email:
              email || null,

            role:
              role,

            status:
              "active"

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


        form.reset();


        const panel =
          byId("addMemberPanel");

        if (panel) {
          panel.hidden = true;
        }


        await loadMembers();


        alert(
          `${name} has been added successfully.`
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

        if (saveButton) {

          saveButton.disabled = false;

          saveButton.textContent =
            "Save Member";

        }

      }

    }
  );

}


/* =====================================================
   INITIALIZE
===================================================== */

async function init() {

  try {

    setStatus(
      "Loading members..."
    );


    /*
     * Authentication
     */

    currentUser =
      await getCurrentUser();


    /*
     * Current member
     */

    currentMember =
      await getCurrentMember();


    /*
     * Current group
     */

    currentGroup =
      await getCurrentGroup();


    /*
     * Setup UI
     */

    setupSearch();

    setupModal();

    setupAddMemberPanel();

    setupAddMemberForm();


    /*
     * Load members
     */

    await loadMembers();


    setStatus(
      "Members loaded."
    );


  } catch (error) {

    console.error(
      "MEMBERS PAGE ERROR:",
      error
    );


    showError(
      error?.message ||
      "Unable to load members."
    );


    setStatus(
      ""
    );

  }

}


/* =====================================================
   START
===================================================== */

init();
