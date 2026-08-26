import {
  requireAuth,
  getMyMember,
  getMyGroup,
  signOut
} from "./auth.js";


/* =========================================================
   BOOT
========================================================= */

export async function boot() {

  try {

    const session =
      await requireAuth();

    if (!session) {
      return;
    }


    const member =
      await getMyMember();


    if (!member) {

      showLayoutError(
        "Your account is authenticated, but no member record was found."
      );

      return;
    }


    let group = null;

    try {

      group =
        await getMyGroup();

    } catch (error) {

      console.warn(
        "Unable to load group:",
        error
      );
    }


    renderUser(
      member,
      group
    );


    setupLogout();


    await loadPageScript();

  } catch (error) {

    console.error(
      "LAYOUT ERROR:",
      error
    );

    showLayoutError(
      error.message ||
      "Unable to load the application."
    );
  }
}


/* =========================================================
   USER DISPLAY
========================================================= */

function renderUser(
  member,
  group
) {

  const welcome =
    document.getElementById(
      "welcome"
    );

  if (welcome) {

    welcome.textContent =
      `Welcome, ${member.name || "Member"}.`;
  }


  const memberName =
    document.getElementById(
      "memberName"
    );

  if (memberName) {

    memberName.textContent =
      member.name || "";
  }


  const groupName =
    document.getElementById(
      "groupName"
    );

  if (groupName) {

    groupName.textContent =
      group?.name ||
      "CHAMA LIVE";
  }
}


/* =========================================================
   LOGOUT
========================================================= */

function setupLogout() {

  const button =
    document.getElementById(
      "logout"
    );

  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    async () => {

      button.disabled =
        true;

      button.textContent =
        "Signing out...";

      try {

        await signOut();

      } catch (error) {

        console.error(
          "Logout error:",
          error
        );

        button.disabled =
          false;

        button.textContent =
          "Sign out";
      }
    }
  );
}


/* =========================================================
   LOAD PAGE SCRIPT
========================================================= */

async function loadPageScript() {

  const path =
    window.location.pathname
      .split("/")
      .pop()
      .toLowerCase();


  const scripts = {

    "dashboard.html":
      "./dashboard.js",

    "members.html":
      "./members.js",

    "contributions.html":
      "./contributions.js",

    "expenses.html":
      "./expenses.js",

    "meetings.html":
      "./meetings.js",

    "reports.html":
      "./reports.js",

    "group-management.html":
      "./group-management.js",

    "create-group.html":
      "./create-group.js",

    "activate-account.html":
      "./activate-account.js"
  };


  const script =
    scripts[path];


  if (!script) {
    return;
  }


  try {

    await import(
      `./${script.replace("./", "")}`
    );

  } catch (error) {

    console.error(
      `Unable to load ${script}:`,
      error
    );

    showLayoutError(
      `Unable to load page script: ${script}`
    );
  }
}


/* =========================================================
   ERROR
========================================================= */

function showLayoutError(
  message
) {

  let box =
    document.getElementById(
      "layoutError"
    );


  if (!box) {

    box =
      document.createElement(
        "div"
      );

    box.id =
      "layoutError";

    box.className =
      "error";

    document
      .body
      .prepend(box);
  }


  box.hidden =
    false;

  box.textContent =
    message;
}
