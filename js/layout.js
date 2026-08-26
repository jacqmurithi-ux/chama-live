```javascript
import {
  requireAuth,
  getMyMember,
  getMyGroup,
  signOut
} from "./auth.js";


/* =========================================================
   HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}


function pageName() {

  const file =
    window.location.pathname
      .split("/")
      .pop()
      .toLowerCase();

  return file || "dashboard.html";
}


/* =========================================================
   ERROR DISPLAY
========================================================= */

function showBootError(error) {

  console.error(
    "CHAMA LIVE:",
    error
  );


  const status =
    $("status");


  if (status) {

    status.textContent =
      "";

  }


  const errorBox =
    $("error");


  if (errorBox) {

    errorBox.hidden =
      false;

    errorBox.textContent =
      error?.message ||
      "Unable to load this page.";

  }


  /*
   * Replace generic loading text
   * everywhere on the page.
   */

  document
    .querySelectorAll(
      "[data-loading]"
    )
    .forEach(
      element => {

        element.textContent =
          "Unable to load.";

      }
    );

}


/* =========================================================
   ACTIVE NAV
========================================================= */

function highlightNavigation() {

  const current =
    pageName();


  document
    .querySelectorAll(
      ".nav a"
    )
    .forEach(
      link => {

        const href =
          link.getAttribute(
            "href"
          );


        if (!href) {
          return;
        }


        const target =
          href
            .split("/")
            .pop()
            .split("?")[0]
            .toLowerCase();


        link.classList.toggle(
          "active",
          target === current
        );

      }
    );

}


/* =========================================================
   SIGN OUT
========================================================= */

function setupLogout() {

  const button =
    $("logout");


  if (!button) {
    return;
  }


  if (
    button.dataset.ready ===
    "true"
  ) {
    return;
  }


  button.dataset.ready =
    "true";


  button.addEventListener(
    "click",
    async event => {

      event.preventDefault();


      button.disabled =
        true;


      button.textContent =
        "Signing out...";


      try {

        await signOut();


      } catch (error) {

        console.error(
          "Sign out error:",
          error
        );


        button.disabled =
          false;


        button.textContent =
          "Sign out";


        showBootError(
          error
        );

      }

    }
  );

}


/* =========================================================
   DISPLAY MEMBER
========================================================= */

function displayMember(
  member
) {

  if (!member) {
    return;
  }


  document
    .querySelectorAll(
      "[data-member-name]"
    )
    .forEach(
      element => {

        element.textContent =
          member.name ||
          "Member";

      }
    );


  document
    .querySelectorAll(
      "[data-member-role]"
    )
    .forEach(
      element => {

        element.textContent =
          member.role ||
          "member";

      }
    );

}


/* =========================================================
   DISPLAY GROUP
========================================================= */

function displayGroup(
  group
) {

  if (!group) {
    return;
  }


  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(
      element => {

        element.textContent =
          group.name ||
          "Your Group";

      }
    );

}


/* =========================================================
   RBAC
========================================================= */

function applyRBAC(
  member
) {

  if (!member) {
    return;
  }


  const role =
    String(
      member.role ||
      "member"
    )
      .trim()
      .toLowerCase();


  const adminRoles = [
    "admin",
    "administrator",
    "chairperson",
    "secretary",
    "treasurer"
  ];


  const managerRoles = [
    ...adminRoles,
    "manager"
  ];


  const isAdmin =
    adminRoles.includes(
      role
    );


  const isManager =
    managerRoles.includes(
      role
    );


  document
    .querySelectorAll(
      "[data-role]"
    )
    .forEach(
      element => {

        const required =
          String(
            element.dataset.role ||
            ""
          )
            .trim()
            .toLowerCase();


        if (
          required ===
          "admin"
        ) {

          element.hidden =
            !isAdmin;

        }


        if (
          required ===
          "manager"
        ) {

          element.hidden =
            !isManager;

        }

      }
    );

}


/* =========================================================
   PAGE JAVASCRIPT MAP
========================================================= */

const PAGE_SCRIPTS = {

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

  "monthly-closing.html":
    "./monthly-closing.js",

  "group-management.html":
    "./group-management.js"

};


/* =========================================================
   LOAD PAGE SCRIPT
========================================================= */

async function loadPageScript() {

  const page =
    pageName();


  const script =
    PAGE_SCRIPTS[page];


  if (!script) {

    console.warn(
      "No page script configured for:",
      page
    );

    return null;

  }


  /*
   * Dynamic import is intentional.
   *
   * Authentication/layout can finish first.
   * A broken page JS file will no longer
   * prevent Sign out and authentication
   * from initializing.
   */

  try {

    await import(
      script +
      "?v=20260826"
    );


    console.log(
      "Loaded page script:",
      script
    );


    return true;

  } catch (error) {

    console.error(
      "Page script failed:",
      script,
      error
    );


    throw new Error(
      `Failed to load ${script}. ${error?.message || error}`
    );

  }

}


/* =========================================================
   BOOT
========================================================= */

export async function boot() {

  /*
   * These must work even when a page JS
   * has a problem.
   */

  highlightNavigation();

  setupLogout();


  /*
   * Authenticate.
   */

  let session;


  try {

    session =
      await requireAuth();

  } catch (error) {

    showBootError(
      error
    );

    return null;

  }


  if (!session) {
    return null;
  }


  /*
   * Member.
   */

  let member;


  try {

    member =
      await getMyMember();

  } catch (error) {

    showBootError(
      new Error(
        "Unable to load your member account: " +
        error.message
      )
    );

    return null;

  }


  if (!member) {

    showBootError(
      new Error(
        "Your login is not linked to an active member account."
      )
    );

    return null;

  }


  /*
   * Group.
   */

  let group;


  try {

    group =
      await getMyGroup();

  } catch (error) {

    showBootError(
      new Error(
        "Unable to load your group: " +
        error.message
      )
    );

    return null;

  }


  if (!group) {

    showBootError(
      new Error(
        "Your member account is not linked to a valid group."
      )
    );

    return null;

  }


  /*
   * Global UI.
   */

  displayMember(
    member
  );


  displayGroup(
    group
  );


  applyRBAC(
    member
  );


  /*
   * Make useful information available
   * to page scripts.
   */

  window.CHAMA =
    {
      session,
      member,
      group
    };


  /*
   * Remove generic loading status.
   */

  const status =
    $("status");


  if (
    status &&
    (
      status.textContent
        .trim()
        .toLowerCase()
        .includes("loading")
    )
  ) {

    status.textContent =
      "";

  }


  /*
   * NOW load the page-specific JS.
   */

  try {

    await loadPageScript();

  } catch (error) {

    showBootError(
      error
    );

    return null;

  }


  console.log(
    "CHAMA LIVE boot complete",
    {
      page: pageName(),
      member,
      group
    }
  );


  return {
    session,
    member,
    group
  };

}
```
