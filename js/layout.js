import {
  supabase,
  requireAuth,
  getMyMember,
  logout
} from "./auth.js";


/* =====================================================
   CHAMA LIVE LAYOUT + RBAC
===================================================== */

let currentMember = null;


/* =====================================================
   ROLE PERMISSIONS
===================================================== */

const permissions = {

  dashboard: [
    "admin",
    "chairperson",
    "treasurer",
    "secretary",
    "member"
  ],

  members: [
    "admin",
    "chairperson",
    "secretary"
  ],

  contributions: [
    "admin",
    "chairperson",
    "treasurer",
    "secretary",
    "member"
  ],

  expenses: [
    "admin",
    "chairperson",
    "treasurer"
  ],

  meetings: [
    "admin",
    "chairperson",
    "secretary",
    "member"
  ],

  reports: [
    "admin",
    "chairperson",
    "treasurer",
    "secretary"
  ],

  "monthly-closing": [
    "admin",
    "chairperson",
    "treasurer"
  ],

  "group-management": [
    "admin",
    "chairperson"
  ]

};


/* =====================================================
   INIT
===================================================== */

export async function boot() {

  try {

    const session =
      await requireAuth();

    if (!session) {
      return null;
    }

    currentMember =
      await getMyMember();

    if (!currentMember) {
      return null;
    }

    applyUserDetails();

    applyNavigationPermissions();

    setupLogout();

    return currentMember;

  } catch (error) {

    console.error(
      "Layout boot error:",
      error
    );

    showLayoutError(
      error
    );

    return null;
  }

}


/* =====================================================
   USER DETAILS
===================================================== */

function applyUserDetails() {

  if (!currentMember) {
    return;
  }

  const role =
    String(
      currentMember.role ||
      "member"
    ).toLowerCase();


  /* ---------------------------------------------
     Common selectors
  --------------------------------------------- */

  const selectors = [

    "#currentUser",

    "#userName",

    "#memberName",

    "#loggedInMember",

    "[data-user-name]"

  ];


  selectors.forEach(
    selector => {

      document
        .querySelectorAll(selector)
        .forEach(element => {

          element.textContent =
            currentMember.name ||
            "Member";

        });

    }
  );


  /* ---------------------------------------------
     Role
  --------------------------------------------- */

  const roleSelectors = [

    "#currentRole",

    "#userRole",

    "#memberRole",

    "[data-user-role]"

  ];


  roleSelectors.forEach(
    selector => {

      document
        .querySelectorAll(selector)
        .forEach(element => {

          element.textContent =
            formatRole(role);

        });

    }
  );


  /* ---------------------------------------------
     Member number
  --------------------------------------------- */

  document
    .querySelectorAll(
      "#memberNumber, [data-member-number]"
    )
    .forEach(
      element => {

        element.textContent =
          currentMember.membership_number ||
          currentMember.member_number ||
          "—";

      }
    );


  /* ---------------------------------------------
     Group ID
  --------------------------------------------- */

  document
    .querySelectorAll(
      "[data-group-id]"
    )
    .forEach(
      element => {

        element.textContent =
          currentMember.group_id ||
          "";

      }
    );

}


/* =====================================================
   NAVIGATION RBAC
===================================================== */

function applyNavigationPermissions() {

  if (!currentMember) {
    return;
  }

  const role =
    String(
      currentMember.role ||
      "member"
    ).toLowerCase();


  const links =
    document.querySelectorAll(
      ".nav a"
    );


  links.forEach(
    link => {

      const href =
        link.getAttribute(
          "href"
        );

      if (!href) {
        return;
      }


      const page =
        getPageName(
          href
        );


      if (!page) {
        return;
      }


      const allowedRoles =
        permissions[page];


      if (!allowedRoles) {
        return;
      }


      const allowed =
        allowedRoles.includes(
          role
        );


      if (!allowed) {

        link.remove();

      }

    }
  );

}


/* =====================================================
   CURRENT PAGE
===================================================== */

function getPageName(
  href
) {

  try {

    const url =
      new URL(
        href,
        window.location.href
      );

    let pathname =
      url.pathname;

    pathname =
      pathname
        .split("/")
        .pop()
        .toLowerCase();


    if (
      pathname === "" ||
      pathname === "/"
    ) {

      return "dashboard";

    }


    if (
      pathname.endsWith(
        ".html"
      )
    ) {

      pathname =
        pathname.slice(
          0,
          -5
        );

    }


    return pathname;

  } catch {

    return null;

  }

}


/* =====================================================
   LOGOUT
===================================================== */

function setupLogout() {

  const logoutButtons =
    document.querySelectorAll(
      "#logout, [data-action='logout']"
    );


  logoutButtons.forEach(
    button => {

      button.addEventListener(
        "click",
        async event => {

          event.preventDefault();

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
   ROLE FORMAT
===================================================== */

function formatRole(
  role
) {

  return String(
    role || "member"
  )
    .replaceAll(
      "_",
      " "
    )
    .replace(
      /\b\w/g,
      char =>
        char.toUpperCase()
    );

}


/* =====================================================
   LAYOUT ERROR
===================================================== */

function showLayoutError(
  error
) {

  console.error(
    error
  );

  const element =
    document.querySelector(
      "#error"
    );


  if (element) {

    element.hidden =
      false;

    element.textContent =
      error?.message ||
      "Unable to load your account.";

    return;

  }


  /* Do not redirect here if the
     auth module already handled it. */

}


/* =====================================================
   GET CURRENT MEMBER
===================================================== */

export function getCurrentMember() {

  return currentMember;

}


/* =====================================================
   GET CURRENT ROLE
===================================================== */

export function getCurrentRole() {

  return String(
    currentMember?.role ||
    "member"
  ).toLowerCase();

}


/* =====================================================
   SIMPLE FRONTEND ROLE CHECK
===================================================== */

export function canAccess(
  page
) {

  const role =
    getCurrentRole();

  return (
    permissions[page] || []
  ).includes(
    role
  );

}


/* =====================================================
   EXPOSE PERMISSIONS
===================================================== */

export {
  permissions
};
