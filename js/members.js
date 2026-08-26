import { supabase } from "./supabase.js";

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
   USER
========================================================= */

async function getUser() {

  const {
    data,
    error
  } = await supabase.auth.getUser();

  if (error) throw error;

  if (!data?.user) {
    throw new Error("You are not logged in.");
  }

  return data.user;
}


/* =========================================================
   CURRENT MEMBER
========================================================= */

async function getCurrentMember(userId) {

  const {
    data,
    error
  } = await supabase
    .from("members")
    .select("*")
    .eq("user_id", userId)
    .limit(1);

  if (error) throw error;

  if (!data?.length) {
    throw new Error(
      "No member record is linked to this account."
    );
  }

  return data[0];
}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function getMembers(groupId) {

  const {
    data,
    error
  } = await supabase
    .from("members")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", {
      ascending: true
    });

  if (error) throw error;

  return data || [];
}


/* =========================================================
   RENDER MEMBERS
========================================================= */

function renderMembers(members) {

  const rows =
    byId("memberRows");

  if (!rows) return;


  byId("memberCount").textContent =
    members.length;


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
    members.map(member => {

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

      const status =
        member.status ||
        "active";


      return `
        <tr>

          <td>
            ${escapeHtml(memberNumber)}
          </td>

          <td>
            ${escapeHtml(memberNumber)}
          </td>

          <td>
            ${escapeHtml(name)}
          </td>

          <td>
            ${escapeHtml(phone)}
          </td>

          <td>
            ${escapeHtml(email)}
          </td>

          <td>
            ${escapeHtml(role)}
          </td>

          <td>
            ${escapeHtml(status)}
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

    }).join("");
}


/* =========================================================
   LOAD
========================================================= */

async function loadMembers() {

  const status =
    byId("status");

  try {

    if (status) {
      status.textContent =
        "Loading members...";
    }


    const user =
      await getUser();


    const currentMember =
      await getCurrentMember(
        user.id
      );


    if (!currentMember.group_id) {

      throw new Error(
        "Your account is not linked to a group."
      );

    }


    const members =
      await getMembers(
        currentMember.group_id
      );


    renderMembers(
      members
    );


    window.CHAMA_CURRENT_GROUP_ID =
      currentMember.group_id;


    if (status) {
      status.textContent =
        "";
    }


    console.log(
      "CHAMA LIVE MEMBERS:",
      members
    );

  } catch (error) {

    console.error(
      "Members loading error:",
      error
    );


    if (status) {
      status.textContent =
        "";
    }


    const errorBox =
      byId("error");

    if (errorBox) {

      errorBox.hidden =
        false;

      errorBox.textContent =
        error.message ||
        "Unable to load members.";

    }

  }

}


/* =========================================================
   ADD MEMBER
========================================================= */

async function addMember(event) {

  event.preventDefault();


  const form =
    byId("addMemberForm");

  const button =
    byId("saveMemberButton");

  const message =
    byId("formMessage");


  const name =
    byId("memberName")
      .value
      .trim();


  const phone =
    byId("memberPhone")
      .value
      .trim();


  const email =
    byId("memberEmail")
      .value
      .trim()
      .toLowerCase();


  const role =
    byId("memberRole")
      .value;


  const memberNumber =
    byId("memberNumber")
      .value
      .trim();


  if (!name) {

    showFormMessage(
      "Member name is required.",
      true
    );

    return;
  }


  if (!phone) {

    showFormMessage(
      "Phone number is required.",
      true
    );

    return;
  }


  if (!memberNumber) {

    showFormMessage(
      "Member number is required.",
      true
    );

    return;
  }


  const groupId =
    window.CHAMA_CURRENT_GROUP_ID;


  if (!groupId) {

    showFormMessage(
      "Group information is not available. Refresh the page and try again.",
      true
    );

    return;
  }


  try {

    button.disabled =
      true;

    button.textContent =
      "Saving...";


    showFormMessage(
      "Saving member...",
      false
    );


    /* -----------------------------------------------------
       CHECK DUPLICATE MEMBER NUMBER
    ----------------------------------------------------- */

    const {
      data: existingNumber,
      error: numberError
    } =
      await supabase
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


    if (numberError) {
      throw numberError;
    }


    if (existingNumber?.length) {

      throw new Error(
        `Member number ${memberNumber} already exists in this group.`
      );

    }


    /* -----------------------------------------------------
       INSERT
    ----------------------------------------------------- */

    const {
      data,
      error
    } =
      await supabase
        .from("members")
        .insert({

          group_id:
            groupId,

          member_number:
            memberNumber,

          name:
            name,

          phone:
            phone,

          email:
            email || null,

          role:
            role || "member",

          status:
            "active"

        })
        .select()
        .single();


    if (error) {
      throw error;
    }


    console.log(
      "NEW MEMBER:",
      data
    );


    showFormMessage(
      `${name} has been added successfully.`,
      false
    );


    form.reset();


    await loadMembers();


    setTimeout(
      () => {

        closeAddMember();

      },
      1000
    );


  } catch (error) {

    console.error(
      "Add member error:",
      error
    );


    showFormMessage(
      error.message ||
      "Unable to add member.",
      true
    );


  } finally {

    button.disabled =
      false;

    button.textContent =
      "Save Member";

  }

}


/* =========================================================
   FORM MESSAGE
========================================================= */

function showFormMessage(
  message,
  isError
) {

  const element =
    byId("formMessage");

  if (!element) return;


  element.textContent =
    message;


  element.style.display =
    "block";


  if (isError) {

    element.style.background =
      "#fee2e2";

    element.style.color =
      "#991b1b";

  } else {

    element.style.background =
      "#dcfce7";

    element.style.color =
      "#166534";

  }

}


/* =========================================================
   OPEN ADD MEMBER
========================================================= */

function openAddMember() {

  const panel =
    byId("addMemberPanel");

  if (!panel) return;


  panel.hidden =
    false;


  byId("memberName")?.focus();


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* =========================================================
   CLOSE ADD MEMBER
========================================================= */

function closeAddMember() {

  const panel =
    byId("addMemberPanel");

  if (!panel) return;


  panel.hidden =
    true;


  const message =
    byId("formMessage");

  if (message) {

    message.textContent =
      "";

    message.style.display =
      "none";

  }

}


/* =========================================================
   VIEW MEMBER
========================================================= */

async function viewMember(memberId) {

  try {

    const {
      data,
      error
    } =
      await supabase
        .from("members")
        .select("*")
        .eq(
          "id",
          memberId
        )
        .single();


    if (error) {
      throw error;
    }


    alert(
      [
        `Name: ${data.name || "—"}`,
        `Member No: ${data.member_number || "—"}`,
        `Phone: ${data.phone || "—"}`,
        `Email: ${data.email || "—"}`,
        `Role: ${data.role || "member"}`,
        `Status: ${data.status || "active"}`
      ].join("\n")
    );


  } catch (error) {

    console.error(
      "View member error:",
      error
    );

  }

}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  const addButton =
    byId("addMemberButton");


  if (addButton) {

    addButton.addEventListener(
      "click",
      openAddMember
    );

  }


  const closeButton =
    byId("closeAddMember");


  if (closeButton) {

    closeButton.addEventListener(
      "click",
      closeAddMember
    );

  }


  const cancelButton =
    byId("cancelAddMember");


  if (cancelButton) {

    cancelButton.addEventListener(
      "click",
      closeAddMember
    );

  }


  const form =
    byId("addMemberForm");


  if (form) {

    form.addEventListener(
      "submit",
      addMember
    );

  }


  document.addEventListener(
    "click",
    event => {

      const button =
        event.target.closest(
          ".view-member"
        );


      if (!button) {
        return;
      }


      viewMember(
        button.dataset.id
      );

    }
  );

}


/* =========================================================
   INIT
========================================================= */

async function init() {

  setupEvents();

  await loadMembers();

}


init();


export {
  initMembers
};


async function initMembers() {
  await init();
}
