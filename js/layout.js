import {
  requireAuth,
  getMyMember,
  getMyGroup,
  signOut
} from "./auth.js";

/* =========================================================
   CHAMA LIVE — GLOBAL LAYOUT
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

  document
    .querySelectorAll("[data-user-name]")
    .forEach(element => {
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

  document
    .querySelectorAll("[data-group-name]")
    .forEach(element => {
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

  /*
   * Prevent duplicate listeners if boot()
   * is ever called more than once.
   */

  if (
    logoutButton.dataset.logoutReady === "true"
  ) {
    return;
  }

  logoutButton.dataset.logoutReady = "true";

  logoutButton.addEventListener(
    "click",
    async () => {

      logoutButton.disabled = true;
      logoutButton.textContent =
        "Signing out...";

      try {

        await signOut();

      } catch (error) {

        console.error(
          "CHAMA LIVE logout error:",
          error
        );

        logoutButton.disabled = false;
        logoutButton.textContent =
          "Sign out";

        const errorBox =
          byId("error");

        if (errorBox) {

          errorBox.hidden = false;

          errorBox.textContent =
            error?.message ||
            "Unable to sign out.";

        }

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
      "CHAMA LIVE: no page-specific script."
    );

    return;

  }

  console.log(
    "CHAMA LIVE: loading",
    script
  );

  try {

    await import(
      `./${script}`
    );

    pageScriptLoaded = true;

    console.log(
      "CHAMA LIVE:",
      script,
      "loaded successfully."
    );

  } catch (error) {

    console.error(
      `CHAMA LIVE: unable to load ${script}:`,
      error
    );

    const errorBox =
      byId("error");

    if (errorBox) {

      errorBox.hidden = false;

      errorBox.textContent =
        `Unable to load ${script}. Please check that /js/${script} exists and is valid JavaScript.`;

    }

  }
}


/* =========================================================
   BOOT
========================================================= */

export async function boot() {

  /*
   * Prevent accidental double boot.
   */

  if (
    document.body.dataset.chamaBooted === "true"
  ) {

    console.log(
      "CHAMA LIVE: boot already completed."
    );

    return;

  }

  document.body.dataset.chamaBooted =
    "true";


  try {

    console.log(
      "CHAMA LIVE booting..."
    );


    /* =====================================================
       1. AUTHENTICATION
    ===================================================== */

    const session =
      await requireAuth();

    if (!session) {

      console.log(
        "CHAMA LIVE: no authenticated session."
      );

      return;

    }


    /* =====================================================
       2. CURRENT MEMBER
    ===================================================== */

    currentMember =
      await getMyMember();

    if (!currentMember) {

      throw new Error(
        "Your account is authenticated, but no member record was found."
      );

    }


    console.log(
      "CHAMA LIVE member:",
      currentMember
    );


    /* =====================================================
       3. CURRENT GROUP
    ===================================================== */

    try {

      currentGroup =
        await getMyGroup();

    } catch (groupError) {

      console.warn(
        "CHAMA LIVE: getMyGroup failed.",
        groupError
      );


      /*
       * Fallback.
       *
       * The member record normally contains
       * group_id.
       */

      if (
        currentMember.group_id
      ) {

        currentGroup = {
          id:
            currentMember.group_id
        };

      } else {

        throw new Error(
          "Your member account is not linked to a group."
        );

      }

    }


    console.log(
      "CHAMA LIVE group:",
      currentGroup
    );


    /* =====================================================
       4. DISPLAY GLOBAL DATA
    ===================================================== */

    displayUser(
      currentMember
    );

    displayGroup(
      currentGroup
    );


    /* =====================================================
       5. LOGOUT
    ===================================================== */

    setupLogout();


    /* =====================================================
       6. PAGE SCRIPT
    ===================================================== */

    await loadPageScript();


    console.log(
      "CHAMA LIVE ready."
    );


  } catch (error) {

    console.error(
      "CHAMA LIVE boot error:",
      error
    );


    /*
     * Allow boot to be retried if the error
     * was caused by a temporary problem.
     */

    document.body.dataset.chamaBooted =
      "false";


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
