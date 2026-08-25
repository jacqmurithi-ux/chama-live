import {
  requireMember,
  logout,
  normalizeRole,
  roleLabel
} from "./auth.js";


/*
=====================================================
 CHAMA LIVE — LAYOUT + RBAC
=====================================================
*/


let currentMember = null;


/* =====================================================
   NAVIGATION RULES
===================================================== */

const NAV_RULES = {

  "dashboard.html": [
    "admin",
    "chairperson",
    "treasurer",
    "secretary",
    "member"
  ],

  "members.html": [
    "admin",
    "chairperson",
    "secretary",
    "treasurer",
    "member"
  ],

  "contributions.html": [
    "admin",
    "chairperson",
    "treasurer",
    "secretary",
    "member"
  ],

  "expenses.html": [
    "admin",
    "chairperson",
    "treasurer",
    "secretary",
    "member"
  ],

  "meetings.html": [
    "admin",
    "chairperson",
    "secretary",
    "treasurer",
    "member"
  ],

  "reports.html": [
    "admin",
    "chairperson",
    "treasurer",
    "secretary",
    "member"
  ],

  "monthly-closing.html": [
    "admin",
    "chairperson",
    "treasurer"
  ],

  "group-management.html": [
    "admin",
    "chairperson"
  ]

};


/* =====================================================
   INIT
===================================================== */

export async function boot() {

  try {

    /*
     * Authenticate and obtain member.
     */

    currentMember =
      await requireMember();


    if (!currentMember) {
      return null;
    }


    /*
     * Setup logout.
     */

    setupLogout();


    /*
     * Setup user information.
     */

    renderUser();


    /*
     * Apply RBAC to navigation.
     */

    applyNavigationRBAC();


    /*
     * Highlight current page.
     */

    highlightCurrentPage();


    /*
     * Protect current page.
     */

    protectCurrentPage();


    return currentMember;

  } catch (error) {

    console.error(
      "Layout boot error:",
      error
    );


    showFatalError(
      error
    );


    return null;

  }

}


/* =====================================================
   LOGOUT
===================================================== */

function setupLogout() {

  const button =
    document.getElementById(
      "logout"
    );


  if (!button) {
    return;
  }


  /*
   * Prevent duplicate handlers.
   */

  if (
    button.dataset.bound ===
    "true"
  ) {
    return;
  }


  button.dataset.bound =
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


/* =====================================================
   RENDER USER
===================================================== */

function renderUser() {

  if (!currentMember) {
    return;
  }


  const role =
    normalizeRole(
      currentMember.role
    );


  /*
   * Optional elements supported
   * by different pages.
   */

  const nameElements =
    document.querySelectorAll(
      "[data-user-name]"
    );


  nameElements.forEach(
    element => {

      element.textContent =
        currentMember.name ||
        "Member";

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


  const memberNumberElements =
    document.querySelectorAll(
      "[data-member-number]"
    );


  memberNumberElements.forEach(
    element => {

      element.textContent =
        currentMember.member_number ||
        "—";

    }
  );


  const groupElements =
    document.querySelectorAll(
      "[data-group-id]"
    );


  groupElements.forEach(
    element => {

      element.textContent =
        currentMember.group_id ||
        "—";

    }
  );


  /*
   * Body-level role attribute.
   * Useful for CSS.
   */

  document.body.dataset.role =
    role;

}


/* =====================================================
   APPLY NAVIGATION RBAC
===================================================== */

function applyNavigationRBAC() {

  if (!currentMember) {
    return;
  }


  const role =
    normalizeRole(
      currentMember.role
    );


  /*
   * Every normal link.
   */

  document
    .querySelectorAll(
      ".nav a"
    )
    .forEach(
      link => {

        const href =
          getPageName(
            link.getAttribute(
              "href"
            )
          );


        if (!href) {
          return;
        }


        const allowed =
          NAV_RULES[href];


        /*
         * If the page isn't defined
         * in NAV_RULES, leave it alone.
         */

        if (!allowed) {
          return;
        }


        const canAccess =
          allowed.includes(role);


        if (!canAccess) {

          /*
           * Hide instead of removing
           * so layout remains stable.
           */

          link.hidden =
            true;

          link.setAttribute(
            "aria-hidden",
            "true"
          );

        }

      }
    );


  /*
   * Generic RBAC attributes.
   *
   * Example:
   *
   * <button
   *   data-role="admin,chairperson">
   * </button>
   */

  document
    .querySelectorAll(
      "[data-role]"
    )
    .forEach(
      element => {

        const allowed =
          element.dataset.role
            .split(",")
            .map(
              normalizeRole
            )
            .filter(Boolean);


        const allowedForUser =
          allowed.includes(role);


        if (
          !allowedForUser
        ) {

          element.hidden =
            true;

        }

      }
    );


  /*
   * Minimum role.
   *
   * Example:
   *
   * data-min-role="treasurer"
   *
   * Note: this is UI-level convenience,
   * not database security.
   */

  document
    .querySelectorAll(
      "[data-min-role]"
    )
    .forEach(
      element => {

        const minimum =
          normalizeRole(
            element.dataset.minRole
          );


        const allowed =
          hasMinimumRole(
            role,
            minimum
          );


        if (!allowed) {

          element.hidden =
            true;

        }

      }
    );

}


/* =====================================================
   MINIMUM ROLE
===================================================== */

function hasMinimumRole(
  currentRole,
  minimumRole
) {

  const levels = {

    member: 10,

    secretary: 60,

    treasurer: 60,

    chairperson: 80,

    admin: 100

  };


  const current =
    levels[
      normalizeRole(
        currentRole
      )
    ] || 0;


  const minimum =
    levels[
      normalizeRole(
        minimumRole
      )
    ] || 0;


  return (
    current >=
    minimum
  );

}


/* =====================================================
   PROTECT CURRENT PAGE
===================================================== */

function protectCurrentPage() {

  const page =
    getCurrentPage();


  const allowed =
    NAV_RULES[page];


  /*
   * Unknown pages aren't blocked.
   */

  if (!allowed) {
    return;
  }


  const role =
    normalizeRole(
      currentMember.role
    );


  if (
    allowed.includes(role)
  ) {

    return;

  }


  /*
   * User somehow opened a URL they
   * shouldn't access.
   */

  console.warn(
    `RBAC blocked ${page} for role ${role}`
  );


  window.location.href =
    "dashboard.html";

}


/* =====================================================
   ACTIVE NAV
===================================================== */

function highlightCurrentPage() {

  const current =
    getCurrentPage();


  document
    .querySelectorAll(
      ".nav a"
    )
    .forEach(
      link => {

        const href =
          getPageName(
            link.getAttribute(
              "href"
            )
          );


        if (
          href ===
          current
        ) {

          link.classList.add(
            "active"
          );

        } else {

          link.classList.remove(
            "active"
          );

        }

      }
    );

}


/* =====================================================
   GET CURRENT PAGE
===================================================== */

function getCurrentPage() {

  return (
    window.location.pathname
      .split("/")
      .pop() ||
    "index.html"
  );

}


/* =====================================================
   GET PAGE NAME FROM HREF
===================================================== */

function getPageName(
  href
) {

  if (!href) {
    return null;
  }


  /*
   * Ignore external links.
   */

  if (
    href.startsWith(
      "http://"
    ) ||
    href.startsWith(
      "https://"
    ) ||
    href.startsWith(
      "//"
    )
  ) {

    return null;

  }


  /*
   * Remove query string.
   */

  const clean =
    href.split("?")[0]
      .split("#")[0];


  return clean
    .split("/")
    .pop();

}


/* =====================================================
   FATAL ERROR
===================================================== */

function showFatalError(
  error
) {

  console.error(
    error
  );


  const message =
    error?.message ||
    "Unable to initialize your account.";


  /*
   * Don't expose raw database
   * errors in production.
   */

  const safeMessage =
    message.includes(
      "JWT"
    )
      ? "Your session has expired. Please sign in again."
      : "Unable to load your account. Please sign in again.";


  const existing =
    document.getElementById(
      "error"
    );


  if (existing) {

    existing.hidden =
      false;

    existing.textContent =
      safeMessage;

  } else {

    alert(
      safeMessage
    );

  }

}


/* =====================================================
   EXPORT CURRENT MEMBER
===================================================== */

export function getLayoutMember() {

  return currentMember;

}


/* =====================================================
   EXPORT CURRENT ROLE
===================================================== */

export function getLayoutRole() {

  return normalizeRole(
    currentMember?.role
  );

}
