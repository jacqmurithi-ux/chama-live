import {
  requireMember,
  signOut,
  normalizeRole
} from "./auth.js";


/*
=========================================================
 CHAMA LIVE LAYOUT + RBAC
=========================================================
*/


/* =====================================================
   ROLE NAVIGATION RULES
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
    "secretary"
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
    "member"
  ],

  "reports.html": [
    "admin",
    "chairperson",
    "treasurer",
    "secretary"
  ],

  "monthly-closing.html": [
    "admin",
    "chairperson",
    "treasurer"
  ],

  "group-management.html": [
    "admin",
    "chairperson"
  ],

  "member-management.html": [
    "admin",
    "chairperson",
    "secretary"
  ],

  "settings.html": [
    "admin",
    "chairperson"
  ]

};


/* =====================================================
   PAGE ACCESS RULES
===================================================== */

const PAGE_RULES = {

  "members.html": [
    "admin",
    "chairperson",
    "secretary"
  ],

  "group-management.html": [
    "admin",
    "chairperson"
  ],

  "monthly-closing.html": [
    "admin",
    "chairperson",
    "treasurer"
  ],

  "reports.html": [
    "admin",
    "chairperson",
    "treasurer",
    "secretary"
  ],

  "member-management.html": [
    "admin",
    "chairperson",
    "secretary"
  ],

  "settings.html": [
    "admin",
    "chairperson"
  ]

};


/* =====================================================
   BOOT
===================================================== */

export async function boot() {

  try {

    const member =
      await requireMember();


    if (!member) {
      return null;
    }


    const role =
      normalizeRole(
        member.role
      );


    /*
     * Protect current page.
     */

    enforcePageAccess(
      role
    );


    /*
     * Build navigation.
     */

    applyNavigation(
      role
    );


    /*
     * Display current user.
     */

    renderUser(
      member
    );


    /*
     * Attach logout.
     */

    setupLogout();


    /*
     * Highlight active page.
     */

    highlightCurrentPage();


    /*
     * Add role to body.
     */

    document.body.dataset.role =
      role;


    /*
     * Add member ID/group ID
     * for optional UI use.
     */

    document.body.dataset.memberId =
      member.id || "";


    document.body.dataset.groupId =
      member.group_id || "";


    return member;


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
   ENFORCE PAGE ACCESS
===================================================== */

function enforcePageAccess(
  role
) {

  const page =
    getCurrentPage();


  /*
   * Login and public pages don't
   * need RBAC protection.
   */

  const publicPages = [
    "login.html",
    "index.html",
    "create-group.html",
    "forgot-password.html",
    "reset-password.html"
  ];


  if (
    publicPages.includes(
      page
    )
  ) {

    return;
  }


  const allowed =
    PAGE_RULES[page];


  /*
   * If no explicit rule exists,
   * authenticated members can open it.
   */

  if (!allowed) {
    return;
  }


  if (
    !allowed.includes(
      role
    )
  ) {

    console.warn(
      `RBAC: ${role} cannot access ${page}`
    );


    window.location.replace(
      "dashboard.html"
    );
  }
}


/* =====================================================
   APPLY NAVIGATION
===================================================== */

function applyNavigation(
  role
) {

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
        href
          .split("/")
          .pop()
          .split("?")[0]
          .split("#")[0];


      const allowed =
        NAV_RULES[page];


      /*
       * Unknown navigation items remain visible.
       */

      if (!allowed) {
        return;
      }


      if (
        !allowed.includes(
          role
        )
      ) {

        link.remove();
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


  const page =
    pathname
      .split("/")
      .pop();


  /*
   * GitHub Pages may serve the
   * root as an empty pathname.
   */

  if (!page) {
    return "dashboard.html";
  }


  return page;
}


/* =====================================================
   ACTIVE NAV LINK
===================================================== */

function highlightCurrentPage() {

  const currentPage =
    getCurrentPage();


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
        href
          .split("/")
          .pop()
          .split("?")[0]
          .split("#")[0];


      link.classList.toggle(
        "active",
        page === currentPage
      );

    }
  );
}


/* =====================================================
   RENDER USER
===================================================== */

function renderUser(
  member
) {

  const role =
    normalizeRole(
      member.role
    );


  /*
   * Existing elements supported.
   */

  const nameElements =
    document.querySelectorAll(
      "[data-user-name]"
    );


  nameElements.forEach(
    element => {

      element.textContent =
        member.name ||
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
        formatRole(
          role
        );

    }
  );


  const numberElements =
    document.querySelectorAll(
      "[data-member-number]"
    );


  numberElements.forEach(
    element => {

      element.textContent =
        member.member_number ||
        "—";

    }
  );


  const phoneElements =
    document.querySelectorAll(
      "[data-user-phone]"
    );


  phoneElements.forEach(
    element => {

      element.textContent =
        member.phone ||
        "—";

    }
  );


  const emailElements =
    document.querySelectorAll(
      "[data-user-email]"
    );


  emailElements.forEach(
    element => {

      element.textContent =
        member.email ||
        "—";

    }
  );


  /*
   * Common ID-based elements.
   */

  setText(
    "currentUserName",
    member.name ||
      "Member"
  );


  setText(
    "userName",
    member.name ||
      "Member"
  );


  setText(
    "currentUserRole",
    formatRole(role)
  );


  setText(
    "userRole",
    formatRole(role)
  );


  setText(
    "memberNumber",
    member.member_number ||
      "—"
  );
}


/* =====================================================
   ROLE LABEL
===================================================== */

function formatRole(
  role
) {

  const value =
    normalizeRole(
      role
    );


  return value
    .charAt(0)
    .toUpperCase() +
    value.slice(1);
}


/* =====================================================
   SET TEXT
===================================================== */

function setText(
  id,
  value
) {

  const element =
    document.getElementById(
      id
    );


  if (element) {

    element.textContent =
      value;
  }
}


/* =====================================================
   LOGOUT
===================================================== */

function setupLogout() {

  const buttons =
    document.querySelectorAll(
      "#logout, [data-action='logout']"
    );


  buttons.forEach(
    button => {

      /*
       * Prevent duplicate handlers.
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
        async event => {

          event.preventDefault();


          button.disabled =
            true;


          button.textContent =
            "Signing out...";


          await signOut();

        }
      );

    }
  );
}


/* =====================================================
   LAYOUT ERROR
===================================================== */

function showLayoutError(
  error
) {

  const message =
    error?.message ||
    "Unable to load your account.";


  const element =
    document.getElementById(
      "error"
    );


  if (element) {

    element.hidden =
      false;

    element.textContent =
      message;

    return;
  }


  console.error(
    message
  );
}


/* =====================================================
   OPTIONAL RBAC HELPERS
===================================================== */

export function canAccessPage(
  role,
  page
) {

  const normalizedRole =
    normalizeRole(
      role
    );


  const allowed =
    PAGE_RULES[page];


  if (!allowed) {
    return true;
  }


  return allowed.includes(
    normalizedRole
  );
}


/* =====================================================
   EXPORT NAV RULES
===================================================== */

export {
  NAV_RULES,
  PAGE_RULES
};
