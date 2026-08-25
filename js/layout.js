import {
  supabase
} from "./supabase.js";

import {
  requireAuth,
  getAuthContext,
  logout,
  canManageGroup,
  canManageFinance,
  canManageRecords,
  roleLabel
} from "./auth.js";


/*
=====================================================
 CHAMA LIVE LAYOUT + RBAC
=====================================================
*/


/* =====================================================
   PAGE DEFINITIONS
===================================================== */

const NAV_ITEMS = [

  {
    href:
      "dashboard.html",

    label:
      "Dashboard",

    roles:
      null

  },

  {
    href:
      "members.html",

    label:
      "Members",

    roles:
      null

  },

  {
    href:
      "contributions.html",

    label:
      "Contributions",

    roles:
      null

  },

  {
    href:
      "expenses.html",

    label:
      "Expenses",

    roles:
      null

  },

  {
    href:
      "meetings.html",

    label:
      "Meetings",

    roles:
      null

  },

  {
    href:
      "reports.html",

    label:
      "Reports",

    roles:
      null

  },

  {
    href:
      "monthly-closing.html",

    label:
      "Monthly Closing",

    roles:
      [
        "admin",
        "chairperson",
        "treasurer"
      ]

  },

  {
    href:
      "group-management.html",

    label:
      "Group Management",

    roles:
      [
        "admin",
        "chairperson"
      ]

  }

];


/* =====================================================
   INIT
===================================================== */

export async function boot() {

  try {

    /*
     * Require a real authenticated user.
     */

    const user =
      await requireAuth(
        true
      );


    if (!user) {
      return null;
    }


    /*
     * Load database member record.
     */

    const context =
      await getAuthContext();


    if (!context) {

      console.error(
        "No member context."
      );

      return null;
    }


    /*
     * Render user information.
     */

    renderUser(
      context
    );


    /*
     * Apply RBAC navigation.
     */

    await applyNavigation(
      context
    );


    /*
     * Connect logout.
     */

    setupLogout();


    /*
     * Protect the current page.
     */

    protectCurrentPage(
      context
    );


    /*
     * Listen for logout/session changes.
     */

    setupAuthListener();


    return context;

  } catch (error) {

    console.error(
      "Layout boot error:",
      error
    );

    return null;

  }

}


/* =====================================================
   USER DISPLAY
===================================================== */

function renderUser(
  context
) {

  const {
    user,
    member
  } = context;


  const name =
    member.name ||
    user.email ||
    "User";


  const role =
    roleLabel(
      member.role
    );


  /*
   * Optional elements.
   */

  const nameElements =
    document.querySelectorAll(
      "[data-user-name]"
    );


  nameElements.forEach(
    element => {

      element.textContent =
        name;

    }
  );


  const roleElements =
    document.querySelectorAll(
      "[data-user-role]"
    );


  roleElements.forEach(
    element => {

      element.textContent =
        role;

    }
  );


  const emailElements =
    document.querySelectorAll(
      "[data-user-email]"
    );


  emailElements.forEach(
    element => {

      element.textContent =
        user.email ||
        member.email ||
        "";

    }
  );


  /*
   * Add body attributes so CSS can use them.
   */

  document.body.dataset.role =
    context.role;

  document.body.dataset.groupId =
    context.groupId;

}


/* =====================================================
   NAVIGATION
===================================================== */

async function applyNavigation(
  context
) {

  const nav =
    document.querySelector(
      ".nav"
    );


  if (!nav) {
    return;
  }


  const currentPage =
    getCurrentPage();


  nav.innerHTML =
    "";


  for (
    const item
    of NAV_ITEMS
  ) {

    /*
     * No roles means every authenticated
     * group member can see the page.
     */

    if (
      item.roles &&
      !item.roles.includes(
        context.role
      )
    ) {

      continue;

    }


    const link =
      document.createElement(
        "a"
      );


    link.href =
      item.href;


    link.textContent =
      item.label;


    if (
      normalizePath(
        item.href
      ) ===
      normalizePath(
        currentPage
      )
    ) {

      link.classList.add(
        "active"
      );

    }


    nav.appendChild(
      link
    );

  }


  /*
   * Optional admin-only elements elsewhere
   * in the page.
   */

  applyRoleVisibility(
    context
  );

}


/* =====================================================
   ROLE-BASED ELEMENT VISIBILITY
===================================================== */

function applyRoleVisibility(
  context
) {

  document
    .querySelectorAll(
      "[data-role]"
    )
    .forEach(
      element => {

        const roles =
          element
            .dataset
            .role
            .split(",")
            .map(
              value =>
                value
                  .trim()
                  .toLowerCase()
            );


        if (
          roles.includes(
            context.role
          )
        ) {

          element.hidden =
            false;

        } else {

          element.hidden =
            true;

        }

      }
    );


  /*
   * Admin-only.
   */

  document
    .querySelectorAll(
      "[data-admin-only]"
    )
    .forEach(
      element => {

        element.hidden =
          context.role !==
          "admin";

      }
    );


  /*
   * Group management.
   */

  document
    .querySelectorAll(
      "[data-management-only]"
    )
    .forEach(
      element => {

        element.hidden =
          ![
            "admin",
            "chairperson"
          ].includes(
            context.role
          );

      }
    );


  /*
   * Finance.
   */

  document
    .querySelectorAll(
      "[data-finance-only]"
    )
    .forEach(
      element => {

        element.hidden =
          ![
            "admin",
            "chairperson",
            "treasurer"
          ].includes(
            context.role
          );

      }
    );


  /*
   * Secretary / treasurer / management.
   */

  document
    .querySelectorAll(
      "[data-record-management-only]"
    )
    .forEach(
      element => {

        element.hidden =
          ![
            "admin",
            "chairperson",
            "secretary",
            "treasurer"
          ].includes(
            context.role
          );

      }
    );

}


/* =====================================================
   CURRENT PAGE PROTECTION
===================================================== */

function protectCurrentPage(
  context
) {

  const page =
    normalizePath(
      getCurrentPage()
    );


  const item =
    NAV_ITEMS.find(
      navigationItem =>
        normalizePath(
          navigationItem.href
        ) === page
    );


  /*
   * Unknown pages are allowed because they may
   * be special pages such as profile/settings.
   */

  if (!item) {
    return;
  }


  /*
   * Authenticated member pages.
   */

  if (!item.roles) {
    return;
  }


  /*
   * Role restricted page.
   */

  if (
    !item.roles.includes(
      context.role
    )
  ) {

    window.location.replace(
      "dashboard.html"
    );

  }

}


/* =====================================================
   LOGOUT
===================================================== */

function setupLogout() {

  const buttons =
    document.querySelectorAll(
      "#logout, [data-logout]"
    );


  buttons.forEach(
    button => {

      /*
       * Prevent duplicate listeners.
       */

      if (
        button.dataset.logoutReady ===
        "true"
      ) {

        return;

      }


      button.dataset.logoutReady =
        "true";


      button.addEventListener(
        "click",
        async () => {

          button.disabled =
            true;

          button.textContent =
            "Signing out...";


          try {

            await logout();

          } catch (error) {

            console.error(
              "Logout failed:",
              error
            );

            button.disabled =
              false;

            button.textContent =
              "Sign out";

            alert(
              error.message ||
              "Unable to sign out."
            );

          }

        }
      );

    }
  );

}


/* =====================================================
   AUTH STATE LISTENER
===================================================== */

function setupAuthListener() {

  supabase.auth.onAuthStateChange(
    (
      event,
      session
    ) => {

      if (
        event ===
        "SIGNED_OUT"
      ) {

        window.location.href =
          "login.html";

      }

    }
  );

}


/* =====================================================
   CURRENT PAGE
===================================================== */

function getCurrentPage() {

  const pathname =
    window.location.pathname;


  const parts =
    pathname.split("/");


  return (
    parts[
      parts.length - 1
    ] ||
    "dashboard.html"
  );

}


/* =====================================================
   NORMALIZE PATH
===================================================== */

function normalizePath(
  value
) {

  return String(
    value || ""
  )
    .split("?")[0]
    .split("#")[0]
    .replace(
      /^\/+/,
      ""
    )
    .toLowerCase();

}


/* =====================================================
   ROLE HELPER EXPORTS
===================================================== */

export {
  applyRoleVisibility
};
