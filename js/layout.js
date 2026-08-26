import {
  supabase,
  requireAuth,
  getMyMember,
  getMyGroup,
  signOut
} from "./auth.js";


/* =========================================================
   ELEMENTS
========================================================= */

const logoutButton = document.getElementById("logout");


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

    const session = await requireAuth();

    if (!session) {
      return;
    }


    currentMember = await getMyMember();

    if (!currentMember) {

      console.error(
        "No member record found for this account."
      );

      showGlobalError(
        "Your account is authenticated, but no member record was found."
      );

      return;
    }


    try {

      currentGroup = await getMyGroup();

    } catch (groupError) {

      console.warn(
        "getMyGroup failed:",
        groupError
      );

      currentGroup = null;

    }


    displayUser();

    displayGroup();

    setupLogout();

    loadPageScript();


  } catch (error) {

    console.error(
      "Layout boot error:",
      error
    );

    showGlobalError(
      error?.message ||
      "Unable to load the application."
    );

  }

}


/* =========================================================
   DISPLAY USER
========================================================= */

function displayUser() {

  const userName =
    currentMember?.name ||
    "Member";


  document
    .querySelectorAll(
      "[data-user-name]"
    )
    .forEach(
      element => {

        element.textContent =
          userName;

      }
    );


  document
    .querySelectorAll(
      ".welcome-name"
    )
    .forEach(
      element => {

        element.textContent =
          userName;

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

}


/* =========================================================
   LOGOUT
========================================================= */

function setupLogout() {

  if (!logoutButton) {
    return;
  }


  logoutButton.addEventListener(
    "click",
    async () => {

      logoutButton.disabled =
        true;

      logoutButton.textContent =
        "Signing out...";


      try {

        await signOut();

      } catch (error) {

        console.error(
          "Logout error:",
          error
        );

        logoutButton.disabled =
          false;

        logoutButton.textContent =
          "Sign out";

      }

    }
  );

}


/* =========================================================
   PAGE SCRIPT
========================================================= */

async function loadPageScript() {

  const path =
    window.location.pathname
      .toLowerCase();


  let script = null;


  if (
    path.endsWith(
      "/dashboard.html"
    ) ||
    path.endsWith(
      "/"
    )
  ) {

    script =
      "./dashboard.js";

  }


  else if (
    path.endsWith(
      "/members.html"
    )
  ) {

    script =
      "./members.js";

  }


  else if (
    path.endsWith(
      "/contributions.html"
    )
  ) {

    script =
      "./contributions.js";

  }


  else if (
    path.endsWith(
      "/expenses.html"
    )
  ) {

    script =
      "./expenses.js";

  }


  else if (
    path.endsWith(
      "/meetings.html"
    )
  ) {

    script =
      "./meetings.js";

  }


  else if (
    path.endsWith(
      "/reports.html"
    )
  ) {

    script =
      "./reports.js";

  }


  else if (
    path.endsWith(
      "/group-management.html"
    )
  ) {

    script =
      "./group-management.js";

  }


  else {

    return;

  }


  try {

    await import(
      `./${script.replace(
        "./",
        ""
      )}`
    );

  } catch (error) {

    console.error(
      `Unable to load ${script}:`,
      error
    );

    showGlobalError(
      `Unable to load page module. Check ${script}.`
    );

  }

}


/* =========================================================
   GLOBAL ERROR
========================================================= */

function showGlobalError(
  message
) {

  let errorBox =
    document.getElementById(
      "layoutError"
    );


  if (!errorBox) {

    errorBox =
      document.createElement(
        "div"
      );

    errorBox.id =
      "layoutError";

    errorBox.className =
      "error";


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


  errorBox.hidden =
    false;

  errorBox.textContent =
    message;

}
