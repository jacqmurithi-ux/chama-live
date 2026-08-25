import {
  getAuthContext,
  getDisplayName,
  getRoleLabel,
  normalizeRole,
  isAdmin,
  isGroupLeader,
  canManageMembers,
  canRecordContributions,
  canManageExpenses,
  canCloseMonth,
  signOut
} from "./auth.js";


/*
=====================================================
 CHAMA LIVE LAYOUT + RBAC
=====================================================
*/


/* =====================================================
   CURRENT AUTH CONTEXT
===================================================== */

let authContext = null;


/* =====================================================
   PAGE NAME
===================================================== */

function currentPage() {

  const path =
    window.location.pathname;


  const file =
    path.split("/").pop();


  return file ||
    "index.html";
}


/* =====================================================
   GET NAV LINKS
===================================================== */

function getNavLinks() {

  return [
    {
      selector:
        'a[href="dashboard.html"]',

      permission:
        () => true
    },

    {
      selector:
        'a[href="members.html"]',

      permission:
        member =>
          canManageMembers(member)
    },

    {
      selector:
        'a[href="contributions.html"]',

      permission:
        member =>
          canRecordContributions(member)
    },

    {
      selector:
        'a[href="expenses.html"]',

      permission:
        member =>
          canManageExpenses(member)
    },

    {
      selector:
        'a[href="meetings.html"]',

      permission:
        () => true
    },

    {
      selector:
        'a[href="reports.html"]',

      permission:
        () => true
    },

    {
      selector:
        'a[href="monthly-closing.html"]',

      permission:
        member =>
          canCloseMonth(member)
    },

    {
      selector:
        'a[href="group-management.html"]',

      permission:
        member =>
          isAdmin(member)
    }
  ];
}


/* =====================================================
   APPLY NAVIGATION RBAC
===================================================== */

function applyNavigationRBAC() {

  if (!authContext?.member) {

    return;
  }


  const member =
    authContext.member;


  getNavLinks()
    .forEach(
      item => {

        const link =
          document.querySelector(
            item.selector
          );


        if (!link) {

          return;
        }


        const allowed =
          item.permission(
            member
          );


        if (!allowed) {

          /*
           Completely hide unauthorized
           navigation items.
          */

          link.style.display =
            "none";
        }
        else {

          link.style.display =
            "";
        }

      }
    );
}


/* =====================================================
   ACTIVE NAVIGATION
===================================================== */

function applyActiveNavigation() {

  const page =
    currentPage();


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


        const linkPage =
          href.split("/").pop();


        if (
          linkPage === page
        ) {

          link.classList.add(
            "active"
          );
        }
        else {

          link.classList.remove(
            "active"
          );
        }

      }
    );
}


/* =====================================================
   CREATE USER PANEL
===================================================== */

function createUserPanel() {

  const existing =
    document.getElementById(
      "currentUserPanel"
    );


  if (existing) {

    return existing;
  }


  const topbar =
    document.querySelector(
      ".topbar"
    );


  if (!topbar) {

    return null;
  }


  const panel =
    document.createElement(
      "div"
    );


  panel.id =
    "currentUserPanel";


  panel.style.display =
    "flex";


  panel.style.alignItems =
    "center";


  panel.style.gap =
    "10px";


  panel.style.marginLeft =
    "auto";


  panel.style.marginRight =
    "15px";


  panel.style.fontSize =
    "14px";


  panel.innerHTML = `

    <div
      id="currentUserName"
      style="font-weight:600;"
    >
      User
    </div>

    <div
      id="currentUserRole"
      class="muted"
      style="font-size:12px;"
    >
      Member
    </div>

  `;


  const logout =
    document.getElementById(
      "logout"
    );


  if (logout) {

    topbar.insertBefore(
      panel,
      logout
    );

  }
  else {

    topbar.appendChild(
      panel
    );
  }


  return panel;
}


/* =====================================================
   RENDER USER INFO
===================================================== */

function renderUserInfo() {

  if (!authContext) {

    return;
  }


  const panel =
    createUserPanel();


  if (!panel) {

    return;
  }


  const nameElement =
    document.getElementById(
      "currentUserName"
    );


  const roleElement =
    document.getElementById(
      "currentUserRole"
    );


  if (nameElement) {

    nameElement.textContent =
      getDisplayName(
        authContext.user,
        authContext.member
      );
  }


  if (roleElement) {

    roleElement.textContent =
      getRoleLabel(
        authContext.role
      );
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
   Prevent duplicate listeners.
  */

  if (
    button.dataset.authBound ===
    "true"
  ) {

    return;
  }


  button.dataset.authBound =
    "true";


  button.addEventListener(
    "click",
    async () => {

      button.disabled =
        true;


      button.textContent =
        "Signing out...";


      try {

        await signOut(
          "login.html"
        );

      }
      catch (error) {

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
   ADD GROUP NAME
===================================================== */

function renderGroupName() {

  const group =
    authContext?.group;


  if (!group) {

    return;
  }


  /*
   If a group-name element already exists,
   populate it.
  */

  const elements =
    document.querySelectorAll(
      "[data-group-name]"
    );


  elements.forEach(
    element => {

      element.textContent =
        group.name || "My Group";

    }
  );
}


/* =====================================================
   ROLE BADGES
===================================================== */

function renderRoleElements() {

  if (
    !authContext?.member
  ) {

    return;
  }


  const role =
    normalizeRole(
      authContext.member.role
    );


  document
    .querySelectorAll(
      "[data-user-role]"
    )
    .forEach(
      element => {

        element.textContent =
          getRoleLabel(
            role
          );

      }
    );


  /*
   Elements can declare:

   data-role="admin"

   data-role="admin,chairperson"
  */

  document
    .querySelectorAll(
      "[data-role]"
    )
    .forEach(
      element => {

        const required =
          element
            .dataset
            .role
            .split(",")
            .map(
              value =>
                normalizeRole(
                  value
                )
            );


        const allowed =
          required.includes(
            role
          );


        element.style.display =
          allowed
            ? ""
            : "none";

      }
    );
}


/* =====================================================
   REQUIRE PAGE ACCESS
===================================================== */

async function protectPage() {

  const page =
    currentPage();


  /*
   Public pages.
  */

  const publicPages = [

    "",

    "index.html",

    "login.html",

    "create-group.html",

    "forgot-password.html",

    "reset-password.html"

  ];


  if (
    publicPages.includes(
      page
    )
  ) {

    return true;
  }


  /*
   All other pages require
   authentication + member record.
  */

  if (
    !authContext
      ?.authenticated
  ) {

    window.location.href =
      "login.html";

    return false;
  }


  if (
    !authContext.member
  ) {

    alert(
      "Your account is not linked to a CHAMA LIVE member record."
    );


    await signOut(
      "login.html"
    );


    return false;
  }


  /*
   Page-specific RBAC.
  */

  const member =
    authContext.member;


  const rules = {

    "members.html":
      () =>
        canManageMembers(
          member
        ),

    "contributions.html":
      () =>
        canRecordContributions(
          member
        ),

    "expenses.html":
      () =>
        canManageExpenses(
          member
        ),

    "monthly-closing.html":
      () =>
        canCloseMonth(
          member
        ),

    "group-management.html":
      () =>
        isAdmin(
          member
        )

  };


  const rule =
    rules[page];


  if (
    rule &&
    !rule()
  ) {

    alert(
      "You do not have permission to access this page."
    );


    window.location.href =
      "dashboard.html";


    return false;
  }


  return true;
}


/* =====================================================
   BOOT
===================================================== */

export async function boot() {

  try {

    /*
     Load authenticated context.
    */

    authContext =
      await getAuthContext();


    /*
     Protect page before rendering
     private information.
    */

    const allowed =
      await protectPage();


    if (!allowed) {

      return null;
    }


    /*
     Public pages don't need
     the remaining layout work.
    */

    if (
      !authContext
        ?.authenticated
    ) {

      return authContext;
    }


    /*
     Render layout.
    */

    renderUserInfo();

    renderGroupName();

    renderRoleElements();

    applyNavigationRBAC();

    applyActiveNavigation();

    setupLogout();


    /*
     Make context available to
     other scripts.
    */

    window.CHAMA_AUTH =
      authContext;


    return authContext;

  }
  catch (error) {

    console.error(
      "CHAMA LIVE boot error:",
      error
    );


    const page =
      currentPage();


    if (
      page !== "login.html" &&
      page !== "create-group.html"
    ) {

      window.location.href =
        "login.html";

      return null;
    }


    return null;
  }
}


/* =====================================================
   EXPORT CURRENT CONTEXT
===================================================== */

export function getAuthContextCached() {

  return authContext;
}


/* =====================================================
   AUTO-BOOT OPTION
===================================================== */

/*
 We intentionally DO NOT automatically call boot()
 here.

 Each private HTML page should use:

 <script type="module">

   import {
     boot
   } from "./js/layout.js";

   await boot();

   import "./js/reports.js";

 </script>

 This prevents layout.js and page scripts
 from racing each other.
*/
