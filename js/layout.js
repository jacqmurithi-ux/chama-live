import {
  requireAuth,
  getMyMember,
  getMyGroup,
  signOut
} from "./auth.js";

/* =========================================================
   LAYOUT STATE
========================================================= */

let currentMember = null;
let currentGroup = null;
let pageScriptLoaded = false;


/* =========================================================
   HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
}


/* =========================================================
   DISPLAY USER
========================================================= */

function displayUser(member) {

  const name =
    member?.name ||
    member?.full_name ||
    "Member";

  const elements = document.querySelectorAll(
    "[data-user-name]"
  );

  elements.forEach(element => {
    element.textContent = name;
  });
}


/* =========================================================
   DISPLAY GROUP
========================================================= */

function displayGroup(group) {

  const name =
    group?.name ||
    group?.group_name ||
    "CHAMA";

  const elements = document.querySelectorAll(
    "[data-group-name]"
  );

  elements.forEach(element => {
    element.textContent = name;
  });
}


/* =========================================================
   LOGOUT
========================================================= */

function setupLogout() {

  const logoutButton = byId("logout");

  if (!logoutButton) {
    return;
  }

  logoutButton.addEventListener(
    "click",
    async () => {

      logoutButton.disabled = true;
      logoutButton.textContent = "Signing out...";

      try {

        await signOut();

      } catch (error) {

        console.error(
          "Logout error:",
          error
        );

        logoutButton.disabled = false;
        logoutButton.textContent = "Sign out";

      }

    }
  );
}


/* =========================================================
   PAGE NAME
========================================================= */

function getPageScript() {

  const path =
    window.location.pathname
      .split("/")
      .pop()
      .toLowerCase();

  const pageScripts = {

    "dashboard.html":
      "dashboard.js",

    "members.html":
      "members.js",

    "contributions.html":
      "contributions.js",

    "expenses.html":
      "expenses.js",

    "meetings.html":
      "meetings.js",

    "reports.html":
      "reports.js",

    "group-management.html":
      "group-management.js",

    "monthly-closing.html":
      "monthly-closing.js"

  };

  return pageScripts[path] || null;
}


/* =========================================================
   LOAD PAGE SCRIPT
========================================================= */

async function loadPageScript() {

  if (pageScriptLoaded) {
    return;
  }

  const script =
    getPageScript();

  if (!script) {

    console.log(
      "No page-specific script for this page."
    );

    return;
  }

  console.log(
    "Loading page script:",
    script
  );

  try {

    /*
     * IMPORTANT:
     *
     * All page JS files live inside /js/
     *
     * Example:
     *
     * /js/members.js
     */

    await import(
      `./${script}`
    );

    pageScriptLoaded = true;

    console.log(
      "Loaded page script:",
      script
    );

  } catch (error) {

    console.error(
      `Unable to load ${script}:`,
      error
    );

    const errorBox =
      byId("error");

    if (errorBox) {

      errorBox.hidden = false;

      errorBox.textContent =
        `Unable to load ${script}. Check that /js/${script} contains JavaScript code and is committed to GitHub.`;

    }

  }
}


/* =========================================================
   BOOT
========================================================= */

export async function boot() {

  try {

    console.log(
      "CHAMA LIVE booting..."
    );

    /*
     * 1. Make sure the user is logged in.
     */

    const session =
      await requireAuth();

    if (!session) {
      return;
    }


    /*
     * 2. Get member.
     */

    currentMember =
      await getMyMember();

    if (!currentMember) {

      throw new Error(
        "Your account is authenticated, but no member record was found."
      );

    }


    /*
     * 3. Get group.
     */

    try {

      currentGroup =
        await getMyGroup();

    } catch (groupError) {

      console.warn(
        "getMyGroup failed:",
        groupError
      );

      /*
       * Some database versions may not
       * have get_my_group().
       *
       * The member record still contains
       * group_id, so allow the page to
       * continue.
       */

      currentGroup = {
        id:
          currentMember.group_id
      };

    }


    /*
     * 4. Display information.
     */

    displayUser(
      currentMember
    );

    displayGroup(
      currentGroup
    );


    /*
     * 5. Setup logout.
     */

    setupLogout();


    /*
     * 6. Load page-specific JS.
     */

    await loadPageScript();


    console.log(
      "CHAMA LIVE ready."
    );

  } catch (error) {

    console.error(
      "CHAMA LIVE boot error:",
      error
    );

    const errorBox =
      byId("error");

    if (errorBox) {

      errorBox.hidden = false;

      errorBox.textContent =
        error?.message ||
        "Unable to load CHAMA LIVE.";

    }

  }

}
