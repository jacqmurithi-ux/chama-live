import { supabase } from "./supabase.js";
import {
  getCurrentMember,
  getCurrentGroup
} from "./auth.js";

console.log("CHAMA LIVE: members.js loaded");


/* =====================================================
   STATE
===================================================== */

let currentMember = null;
let currentGroup = null;
let members = [];
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

  console.error("CHAMA LIVE:", message);

  const error = byId("error");

  if (!error) {
    return;
  }

  error.hidden = false;

  error.textContent =
    message || "Unable to load members.";
}


function clearError() {

  const error = byId("error");

  if (!error) {
    return;
  }

  error.hidden = true;
  error.textContent = "";
}


function setStatus(message) {

  const status = byId("status");

  if (status) {
    status.textContent = message;
  }

}


/* =====================================================
   LOAD MEMBERS
===================================================== */

async function loadMembers() {

  clearError();

  setStatus("Loading members...");

  const rows = byId("memberRows");

  if (rows) {

    rows.innerHTML = `
      <tr>
        <td colspan="8">
          Loading...
        </td>
      </tr>
    `;

  }


  try {

    currentMember =
      await getCurrentMember();


    currentGroup =
      await getCurrentGroup();


    if (!currentGroup?.id) {

      throw new Error(
        "Your account is not linked to a valid group."
      );

    }


    console.log(
      "CHAMA LIVE group:",
      currentGroup
    );


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
          currentGroup.id
        )

        .order(
          "created_at",
          {
            ascending: true
          }
        );


    if (error) {

      console.error(
        "Members query error:",
        error
      );

      throw error;

    }


    members =
      Array.isArray(data)
        ? data
        : [];


    console.log(
      "CHAMA LIVE members:",
      members
    );


    renderMembers(
      members
    );


    setStatus(
      `${members.length} member${members.length === 1 ? "" : "s"}`
    );


  } catch (error) {

    console.error(
      "Unable to load members:",
      error
    );


    if (rows) {

      rows.innerHTML = `
        <tr>
          <td colspan="8">
            Unable to load members.
          </td>
        </tr>
      `;

    }


    setStatus(
      "Unable to load members."
    );


    showError(
      error?.message ||
      "Unable to load members."
    );

  }

}


/* =====================================================
   RENDER MEMBERS
===================================================== */

function renderMembers(list) {

  const rows =
    byId("memberRows");

  const count =
    byId("memberCount");


  if (count) {

    count.textContent =
      list.length;

  }


  if (!rows) {
    return;
  }


  if (!list.length) {

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
    list.map(
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
                member.member_number || "—"
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
                data-member-id="${escapeHtml(member.id)}"
              >
                View
              </button>

            </td>

          </tr>

        `;

      }
    ).join("");


  document
    .querySelectorAll(".view-member")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const id =
            button.dataset.memberId;

          const member =
            members.find(
              item =>
                String(item.id) === String(id)
            );


          if (member) {

            openMemberModal(
              member
            );

          }

        }
      );

    });

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

      const term =
        search.value
          .trim()
          .toLowerCase();


      if (!term) {

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

              member.phone,

              member.email,

              member.role,

              member.status

            ]
              .filter(Boolean)
              .some(
                value =>
                  String(value)
                    .toLowerCase()
                    .includes(term)
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

function openMemberModal(member) {

  const modal =
    byId("memberModal");

  if (!modal) {
    return;
  }


  byId("viewMemberName").textContent =
    member.name || "Member";


  byId("viewMemberNumber").textContent =
    member.member_number || "—";


  byId("viewMemberPhone").textContent =
    member.phone || "—";


  byId("viewMemberEmail").textContent =
    member.email || "—";


  byId("viewMemberRole").textContent =
    member.role || "member";


  byId("viewMemberStatus").textContent =
    member.status || "active";


  byId("viewMemberJoinDate").textContent =
    formatDate(member.join_date);


  modal.hidden = false;

  modal.style.display = "flex";

  modal.setAttribute(
    "aria-hidden",
    "false"
  );

}


function closeMemberModal() {

  const modal =
    byId("memberModal");

  if (!modal) {
    return;
  }


  modal.hidden = true;

  modal.style.display = "none";

  modal.setAttribute(
    "aria-hidden",
    "true"
  );

}


/* =====================================================
   DATE
===================================================== */

function formatDate(value) {

  if (!value) {
    return "—";
  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return value;

  }


  return date.toLocaleDateString(
    "en-KE",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );

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


  addButton.addEventListener(
    "click",
    () => {

      editingMemberId =
        null;

      resetMemberForm();

      const title =
        byId("memberFormTitle");

      const description =
        byId("memberFormDescription");


      if (title) {

        title.textContent =
          "Add Member";

      }


      if (description) {

        description.textContent =
          "Register a new member in your group.";

      }


      panel.hidden = false;

      panel.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    }
  );


  function closePanel() {

    panel.hidden = true;

    editingMemberId =
      null;

  }


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
   RESET FORM
===================================================== */

function resetMemberForm() {

  const form =
    byId("addMemberForm");

  if (form) {
    form.reset();
  }


  const status =
    byId("memberStatus");

  if (status) {

    status.value =
      "active";

  }


  const role =
    byId("memberRole");

  if (role) {

    role.value =
      "member";

  }


  const message =
    byId("formMessage");

  if (message) {

    message.style.display =
      "none";

    message.textContent =
      "";

  }

}


/* =====================================================
   SAVE MEMBER
===================================================== */

function setupMemberForm() {

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


      const button =
        byId("saveMemberButton");


      const message =
        byId("formMessage");


      const memberNumber =
        byId("memberNumber")
          ?.value
          .trim();


      const name =
        byId("memberName")
          ?.value
          .trim();


      const phone =
        byId("memberPhone")
          ?.value
          .trim();


      const email =
        byId("memberEmail")
          ?.value
          .trim();


      const role =
        byId("memberRole")
          ?.value ||
        "member";


      const status =
        byId("memberStatus")
          ?.value ||
        "active";


      if (
        !memberNumber ||
        !name ||
        !phone
      ) {

        showFormMessage(
          "Please fill in member number, name and phone.",
          true
        );

        return;

      }


      if (!currentGroup?.id) {

        showFormMessage(
          "Your group could not be identified.",
          true
        );

        return;

      }


      if (button) {

        button.disabled =
          true;

        button.textContent =
          "Saving...";

      }


      try {

        const payload = {

          group_id:
            currentGroup.id,

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

          status:
            status

        };


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
                currentGroup.id
              );

        } else {

          result =
            await supabase

              .from("members")

              .insert(
                payload
              );

        }


        if (result.error) {

          throw result.error;

        }


        showFormMessage(
          editingMemberId
            ? "Member updated successfully."
            : "Member added successfully.",
          false
        );


        await loadMembers();


        setTimeout(
          () => {

            const panel =
              byId("addMemberPanel");

            if (panel) {

              panel.hidden =
                true;

            }

            resetMemberForm();

          },
          500
        );


      } catch (error) {

        console.error(
          "Save member error:",
          error
        );


        showFormMessage(
          error?.message ||
          "Unable to save member.",
          true
        );


      } finally {

        if (button) {

          button.disabled =
            false;

          button.textContent =
            "Save Member";

        }

      }

    }
  );

}


/* =====================================================
   FORM MESSAGE
===================================================== */

function showFormMessage(
  text,
  isError
) {

  const message =
    byId("formMessage");

  if (!message) {
    return;
  }


  message.textContent =
    text;


  message.style.display =
    "block";


  if (isError) {

    message.style.background =
      "#fee2e2";

    message.style.color =
      "#991b1b";

  } else {

    message.style.background =
      "#dcfce7";

    message.style.color =
      "#166534";

  }

}


/* =====================================================
   INITIALIZE
===================================================== */

async function init() {

  try {

    setupSearch();

    setupModal();

    setupAddMemberPanel();

    setupMemberForm();

    await loadMembers();

  } catch (error) {

    console.error(
      "Members initialization error:",
      error
    );

    showError(
      error?.message ||
      "Unable to initialize Members page."
    );

  }

}


/* =====================================================
   START
===================================================== */

init();
