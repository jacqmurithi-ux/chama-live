import {
  requireAuth,
  getMyMember,
  getMyGroup,
  getMyRole,
  roleLabel,
  logout
} from "./auth.js";


/* =========================================================
   ROLE PERMISSIONS
========================================================= */

const permissions = {

  admin: [
    "dashboard",
    "members",
    "contributions",
    "expenses",
    "meetings",
    "reports",
    "monthly-closing",
    "group-management"
  ],

  chairperson: [
    "dashboard",
    "members",
    "contributions",
    "expenses",
    "meetings",
    "reports",
    "monthly-closing",
    "group-management"
  ],

  treasurer: [
    "dashboard",
    "members",
    "contributions",
    "expenses",
    "meetings",
    "reports",
    "monthly-closing"
  ],

  secretary: [
    "dashboard",
    "members",
    "contributions",
    "expenses",
    "meetings",
    "reports"
  ],

  member: [
    "dashboard",
    "contributions",
    "meetings",
    "reports"
  ]

};


/* =========================================================
   PAGE → PERMISSION
========================================================= */

const pagePermissions = {

  "dashboard.html":
    "dashboard",

  "members.html":
    "members",

  "contributions.html":
    "contributions",

  "expenses.html":
    "expenses",

  "meetings.html":
    "meetings",

  "reports.html":
    "reports",

  "monthly-closing.html":
    "monthly-closing",

  "group-management.html":
    "group-management"

};


/* =========================================================
   GET CURRENT PAGE
========================================================= */

function getCurrentPage() {

  return (
    window.location.pathname
      .split("/")
      .pop()
      .toLowerCase()
  );

}


/* =========================================================
   CHECK PAGE ACCESS
========================================================= */

function canAccessPage(
  role,
  page
) {

  const permission =
    pagePermissions[page];

  if (!permission) {
    return true;
  }

  const allowedPages =
    permissions[role] || [];

  return allowedPages.includes(
    permission
  );

}


/* =========================================================
   PROTECT PAGE
========================================================= */

async function protectPage(
  role
) {

  const page =
    getCurrentPage();

  if (
    page === "" ||
    page === "index.html" ||
    page === "login.html" ||
    page === "create-group.html"
  ) {

    return true;

  }


  if (
    !canAccessPage(
      role,
      page
    )
  ) {

    console.warn(
      `RBAC blocked ${page} for ${role}`
    );

    window.location.href =
      "dashboard.html";

    return false;
  }

  return true;
}


/* =========================================================
   APPLY NAVIGATION RBAC
========================================================= */

function applyNavigationRBAC(
  role
) {

  const allowedPages =
    permissions[role] || [];


  const links =
    document.querySelectorAll(
      ".nav a"
    );


  links.forEach(
    link => {

      const href =
        link
          .getAttribute("href");

      if (!href) {
        return;
      }


      const page =
        href
          .split("/")
          .pop()
          .toLowerCase();


      const permission =
        pagePermissions[page];


      if (
        permission &&
        !allowedPages.includes(
          permission
        )
      ) {

        link.style.display =
          "none";

        link.setAttribute(
          "aria-hidden",
          "true"
        );

      }

    }
  );

}


/* =========================================================
   SHOW USER INFORMATION
========================================================= */

function renderUser(
  member,
  group,
  role
) {

  /*
   * Existing dashboard elements
   * can use these IDs if present.
   */

  const nameElements =
    document.querySelectorAll(
      "[data-user-name]"
    );


  nameElements.forEach(
    element => {

      element.textContent =
        member?.name ||
        "User";

    }
  );


  const roleElements =
    document.querySelectorAll(
      "[data-user-role]"
    );


  roleElements.forEach(
    element => {

      element.textContent =
        roleLabel(role);

    }
  );


  const groupElements =
    document.querySelectorAll(
      "[data-group-name]"
    );


  groupElements.forEach(
    element => {

      element.textContent =
        group?.name ||
        "My Group";

    }
  );


  /*
   * Optional common IDs.
   */

  const userName =
    document.getElementById(
      "userName"
    );

  if (userName) {

    userName.textContent =
      member?.name ||
      "User";

  }


  const userRole =
    document.getElementById(
      "userRole"
    );

  if (userRole) {

    userRole.textContent =
      roleLabel(role);

  }


  const groupName =
    document.getElementById(
      "groupName"
    );

  if (groupName) {

    groupName.textContent =
      group?.name ||
      "My Group";

  }

}


/* =========================================================
   LOGOUT BUTTON
========================================================= */

function setupLogout() {

  const buttons =
    document.querySelectorAll(
      "#logout, [data-logout]"
    );


  buttons.forEach(
    button => {

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
              error
            );

            button.disabled =
              false;

            button.textContent =
              "Sign out";

            alert(
              "Unable to sign out. Please try again."
            );

          }

        }
      );

    }
  );

}


/* =========================================================
   BOOT
========================================================= */

export async function boot() {

  try {

    /*
     * Require login.
     */

    const session =
      await requireAuth();

    if (!session) {
      return null;
    }


    /*
     * Load member.
     */

    const member =
      await getMyMember();


    if (!member) {

      console.error(
        "Authenticated user has no member record."
      );

      alert(
        "Your account has not been added to a group yet."
      );

      await logout();

      return null;
    }


    /*
     * Load group.
     */

    const group =
      await getMyGroup();


    if (!group) {

      console.error(
        "Member has no valid group."
      );

      alert(
        "Your group account could not be found."
      );

      await logout();

      return null;
    }


    /*
     * Determine role.
     */

    const role =
      (
        await getMyRole()
      ) || "member";


    /*
     * Protect current page.
     */

    const allowed =
      await protectPage(
        role
      );

    if (!allowed) {
      return null;
    }


    /*
     * Navigation.
     */

    applyNavigationRBAC(
      role
    );


    /*
     * User information.
     */

    renderUser(
      member,
      group,
      role
    );


    /*
     * Logout.
     */

    setupLogout();


    /*
     * Add useful data attributes
     * to the document.
     */

    document.body.dataset.role =
      role;

    document.body.dataset.groupId =
      member.group_id;

    document.body.dataset.memberId =
      member.id;


    return {
      session,
      member,
      group,
      role
    };


  } catch (error) {

    console.error(
      "Layout boot error:",
      error
    );

    const message =
      error?.message ||
      "Unable to load your account.";

    alert(message);

    return null;
  }

}


/* =========================================================
   ROLE ACCESS HELPER
========================================================= */

export function hasPermission(
  role,
  permission
) {

  const allowed =
    permissions[role] || [];

  return allowed.includes(
    permission
  );

}


/* =========================================================
   EXPORT PERMISSIONS
========================================================= */

export {
  permissions,
  pagePermissions
};
