import {
  requireAuth,
  getMyMember,
  getMyGroup,
  signOut
} from "./auth.js";


/* =========================================================
   STATE
========================================================= */

let currentMember = null;
let currentGroup = null;


/* =========================================================
   BOOT
========================================================= */

export async function boot() {

  try {

    /* -----------------------------------------------------
       REQUIRE LOGIN
    ----------------------------------------------------- */

    const session =
      await requireAuth();

    if (!session) {
      return;
    }


    /* -----------------------------------------------------
       GET MEMBER
    ----------------------------------------------------- */

    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "No member record was found for this account."
      );

    }


    /* -----------------------------------------------------
       GET GROUP
    ----------------------------------------------------- */

    try {

      currentGroup =
        await getMyGroup();

    } catch (error) {

      console.warn(
        "Unable to load group:",
        error
      );

      /*
       * Do not stop the whole application if the
       * group RPC is unavailable.
       *
       * The member record still contains group_id.
       */

      currentGroup =
        null;

    }


    /* -----------------------------------------------------
       DISPLAY USER
    ----------------------------------------------------- */

    displayUser();


    /* -----------------------------------------------------
       DISPLAY GROUP
    ----------------------------------------------------- */

    displayGroup();


    /* -----------------------------------------------------
       LOGOUT
    ----------------------------------------------------- */

    setupLogout();


    /* -----------------------------------------------------
       LOAD CURRENT PAGE
    ----------------------------------------------------- */

    await loadPageScript();


  } catch (error) {

    console.error(
      "LAYOUT BOOT ERROR:",
      error
    );


    showGlobalError(
      error?.message ||
      "Unable to load CHAMA LIVE."
    );

  }

}


/* =========================================================
   DISPLAY USER
========================================================= */

function displayUser() {

  const name =
    currentMember?.name ||
    "Member";


  /* Welcome name */

  document
    .querySelectorAll(
      "[data-user-name]"
    )
    .forEach(
      element => {

        element.textContent =
          name;

      }
    );


  /* Other possible welcome elements */

  document
    .querySelectorAll(
      ".welcome-name"
    )
    .forEach(
      element => {

        element.textContent =
          name;

      }
    );


  /* Generic member name */

  document
    .querySelectorAll(
      "#memberName"
    )
    .forEach(
      element => {

        element.textContent =
          name;

      }
    );

}


/* =========================================================
   DISPLAY GROUP
========================================================= */

function displayGroup() {

  const groupName =
    currentGroup?.name ||
    currentMember?.group_name ||
    "Your Group";


  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(
      element => {

        element.textContent =
          groupName;

      }
    );


  document
    .querySelectorAll(
      ".group-name"
    )
    .forEach(
      element => {

        element.textContent =
          groupName;

      }
    );


  document
    .querySelectorAll(
      "#groupName"
    )
    .forEach(
      element => {

        element.textContent =
          groupName;

      }
    );

}


/* =========================================================
   LOGOUT
========================================================= */

function setupLogout() {

  const logoutButton =
    document.getElementById(
      "logout"
    );


  if (!logoutButton) {

    console.warn(
      "Logout button not found on this page."
    );

    return;

  }


  /*
   * Prevent duplicate listeners
   */

  if (
    logoutButton.dataset
      .logoutReady === "true"
  ) {

    return;

  }


  logoutButton.dataset
    .logoutReady = "true";


  logoutButton.addEventListener(
    "click",
    async () => {

      try {

        logoutButton.disabled =
          true;

        logoutButton.textContent =
          "Signing out...";


        await signOut();


      } catch (error) {

        console.error(
          "SIGN OUT ERROR:",
          error
        );


        logoutButton.disabled =
          false;

        logoutButton.textContent =
          "Sign out";


        showGlobalError(
          error?.message ||
          "Unable to sign out."
        );

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
      .toLowerCase();


  let script = null;


  /* -------------------------------------------------------
     DASHBOARD
  ------------------------------------------------------- */

  if (
    path.endsWith(
      "/dashboard.html"
    ) ||
    path.endsWith(
      "/index.html"
    ) ||
    path.endsWith(
      "/"
    )
  ) {

    script =
      "dashboard.js";

  }


  /* -------------------------------------------------------
     MEMBERS
  ------------------------------------------------------- */

  else if (
    path.endsWith(
      "/members.html"
    )
  ) {

    script =
      "members.js";

  }


  /* -------------------------------------------------------
     CONTRIBUTIONS
  ------------------------------------------------------- */

  else if (
    path.endsWith(
      "/contributions.html"
    )
  ) {

    script =
      "contributions.js";

  }


  /* -------------------------------------------------------
     EXPENSES
  ------------------------------------------------------- */

  else if (
    path.endsWith(
      "/expenses.html"
    )
  ) {

    script =
      "expenses.js";

  }


  /* -------------------------------------------------------
     MEETINGS
  ------------------------------------------------------- */

  else if (
    path.endsWith(
      "/meetings.html"
    )
  ) {

    script =
      "meetings.js";

  }


  /* -------------------------------------------------------
     REPORTS
  ------------------------------------------------------- */

  else if (
    path.endsWith(
      "/reports.html"
    )
  ) {

    script =
      "reports.js";

  }


  /* -------------------------------------------------------
     GROUP MANAGEMENT
  ------------------------------------------------------- */

  else if (
    path.endsWith(
      "/group-management.html"
    )
  ) {

    script =
      "group-management.js";

  }


  /* -------------------------------------------------------
     NO PAGE SCRIPT
  ------------------------------------------------------- */

  else {

    console.log(
      "No page-specific script required for:",
      path
    );

    return;

  }


  /* -------------------------------------------------------
     IMPORT PAGE SCRIPT
  ------------------------------------------------------- */

  try {

    console.log(
      "Loading page script:",
      script
    );


    await import(
      `./${script}`
    );


    console.log(
      "Page script loaded:",
      script
    );


  } catch (error) {

    console.error(
      `Unable to load ${script}:`,
      error
    );


    showGlobalError(
      `Unable to load ${script}. Check the browser console.`
    );

  }

}


/* =========================================================
   GLOBAL ERROR MESSAGE
========================================================= */

function showGlobalError(
  message
) {

  let errorBox =
    document.getElementById(
      "layoutError"
    );


  /* -------------------------------------------------------
     CREATE ERROR BOX
  ------------------------------------------------------- */

  if (!errorBox) {

    errorBox =
      document.createElement(
        "div"
      );


    errorBox.id =
      "layoutError";


    errorBox.className =
      "error";


    errorBox.style.margin =
      "20px 0";


    errorBox.style.padding =
      "15px";


    const main =
      document.querySelector(
        "main"
      );


    if (main) {

      main.prepend(
        errorBox
      );

    } else {

      document.body.prepend(
        errorBox
      );

    }

  }


  /* -------------------------------------------------------
     SHOW ERROR
  ------------------------------------------------------- */

  errorBox.hidden =
    false;


  errorBox.textContent =
    message;

}


/* =========================================================
   EXPORT STATE
========================================================= */

export function getCurrentMember() {

  return currentMember;

}


export function getCurrentGroup() {

  return currentGroup;

}
