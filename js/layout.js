```javascript
import {
  requireMember,
  setupLogoutButton,
  getRoleLabel,
  hasPermission
} from "./auth.js";


/*
=========================================================
CHAMA LIVE — GLOBAL LAYOUT + RBAC
=========================================================

This file:

1. Authenticates the user
2. Loads member/group information
3. Displays user information
4. Displays group information
5. Applies role-based navigation
6. Hides unauthorized buttons
7. Handles logout
8. Protects every application page
*/


/* =====================================================
   GLOBAL AUTH CONTEXT
===================================================== */

let authContext = null;


/* =====================================================
   INITIALIZE
===================================================== */

export async function boot(
  options = {}
) {

  try {

    /*
    Authenticate the current user.
    */

    authContext =
      await requireMember({
        loginPage:
          options.loginPage ||
          "login.html",

        setupPage:
          options.setupPage ||
          "create-group.html",

        redirect:
          options.redirect !== false
      });


    if (!authContext) {

      return null;

    }


    /*
    Setup logout.
    */

    setupLogoutButton(
      "logout"
    );


    /*
    Render global user information.
    */

    renderUser(
      authContext
    );


    /*
    Render group information.
    */

    renderGroup(
      authContext
    );


    /*
    Apply role-based navigation.
    */

    applyNavigationRBAC(
      authContext
    );


    /*
    Apply permission-based controls.
    */

    applyPermissionRBAC(
      authContext
    );


    /*
    Mark page as ready.
    */

    document.body.classList.add(
      "auth-ready"
    );


    /*
    Fire optional event.
    */

    document.dispatchEvent(
      new CustomEvent(
        "chama:auth-ready",
        {
          detail:
            authContext
        }
      )
    );


    return authContext;


  } catch (error) {

    console.error(
      "CHAMA LIVE boot failed:",
      error
    );


    showBootError(
      error
    );


    return null;

  }

}


/* =====================================================
   GET AUTH CONTEXT
===================================================== */

export function getAuthContext() {

  return authContext;

}


/* =====================================================
   RENDER USER
===================================================== */

function renderUser(
  context
) {

  const member =
    context.member;


  /*
  Supported elements:

  #currentUserName
  #userName
  #currentUserRole
  #userRole
  #memberName
  */

  setText(
    "currentUserName",
    member.name
  );

  setText(
    "userName",
    member.name
  );

  setText(
    "memberName",
    member.name
  );


  const roleLabel =
    getRoleLabel(
      context.role
    );


  setText(
    "currentUserRole",
    roleLabel
  );

  setText(
    "userRole",
    roleLabel
  );


  setText(
    "memberRole",
    roleLabel
  );


  /*
  Optional email.
  */

  setText(
    "currentUserEmail",
    member.email ||
    context.user?.email ||
    ""
  );


  /*
  Optional phone.
  */

  setText(
    "currentUserPhone",
    member.phone ||
    ""
  );

}


/* =====================================================
   RENDER GROUP
===================================================== */

function renderGroup(
  context
) {

  const group =
    context.group;


  if (!group) {

    return;

  }


  /*
  Supported elements:

  #groupName
  #currentGroupName
  #groupTitle
  */

  setText(
    "groupName",
    group.name
  );

  setText(
    "currentGroupName",
    group.name
  );

  setText(
    "groupTitle",
    group.name
  );


  /*
  Group ID is sometimes useful
  for hidden application elements.
  */

  const groupIdElements =
    document.querySelectorAll(
      "[data-group-id]"
    );


  groupIdElements.forEach(
    element => {

      element.dataset.groupId =
        group.id;

    }
  );

}


/* =====================================================
   NAVIGATION RBAC
===================================================== */

function applyNavigationRBAC(
  context
) {

  /*
  Navigation links can specify:

  data-permission="members.view"

  OR

  data-role="admin,chairperson"

  OR

  data-permission="reports.view"
  */


  const navigationItems =
    document.querySelectorAll(
      "[data-permission], [data-role]"
    );


  navigationItems.forEach(
    element => {

      const permission =
        element.dataset.permission;


      const roles =
        element.dataset.role;


      let allowed =
        true;


      /*
      Permission check.
      */

      if (permission) {

        allowed =
          hasPermission(
            context.role,
            permission
          );

      }


      /*
      Role check.
      */

      if (
        allowed &&
        roles
      ) {

        const allowedRoles =
          roles
            .split(",")
            .map(
              role =>
                role
                  .trim()
                  .toLowerCase()
            );


        allowed =
          allowedRoles.includes(
            context.role
          );

      }


      /*
      Hide unauthorized item.
      */

      if (!allowed) {

        element.style.display =
          "none";

        element.setAttribute(
          "aria-hidden",
          "true"
        );

      } else {

        element.style.display =
          "";

        element.removeAttribute(
          "aria-hidden"
        );

      }

    }
  );

}


/* =====================================================
   BUTTON / ACTION RBAC
===================================================== */

function applyPermissionRBAC(
  context
) {

  /*
  Any element with:

  data-requires="permission"

  is hidden if the user doesn't
  have that permission.
  */

  const elements =
    document.querySelectorAll(
      "[data-requires]"
    );


  elements.forEach(
    element => {

      const permission =
        element.dataset.requires;


      const allowed =
        hasPermission(
          context.role,
          permission
        );


      if (!allowed) {

        element.style.display =
          "none";

        element.disabled =
          true;

        element.setAttribute(
          "aria-hidden",
          "true"
        );

      }

    }
  );

}


/* =====================================================
   HELPER — SET TEXT
===================================================== */

function setText(
  id,
  value
) {

  const element =
    document.getElementById(
      id
    );


  if (!element) {

    return;

  }


  element.textContent =
    value ?? "";

}


/* =====================================================
   BOOT ERROR
===================================================== */

function showBootError(
  error
) {

  const existing =
    document.getElementById(
      "error"
    );


  const message =
    error?.message ||
    "Unable to load your account.";


  if (existing) {

    existing.hidden =
      false;

    existing.textContent =
      message;

    return;

  }


  /*
  Avoid replacing the entire page.
  */

  const banner =
    document.createElement(
      "div"
    );


  banner.className =
    "error";


  banner.style.margin =
    "20px";


  banner.textContent =
    message;


  document.body.prepend(
    banner
  );

}


/* =====================================================
   PAGE PROTECTION HELPERS
===================================================== */

/*
You can use this on pages that require
a specific permission.

Example:

const context =
  await requirePagePermission(
    "monthly_closing.close"
  );

*/

export async function requirePagePermission(
  permission
) {

  const {
    requirePermission
  } =
    await import(
      "./auth.js"
    );


  return requirePermission(
    permission
  );

}


/* =====================================================
   ROLE DISPLAY
===================================================== */

export function currentRole() {

  return authContext?.role ||
    "member";

}


/* =====================================================
   CURRENT GROUP
===================================================== */

export function currentGroup() {

  return authContext?.group ||
    null;

}


/* =====================================================
   CURRENT MEMBER
===================================================== */

export function currentMember() {

  return authContext?.member ||
    null;

}


/* =====================================================
   CURRENT USER
===================================================== */

export function currentUser() {

  return authContext?.user ||
    null;

}


/* =====================================================
   ROLE CHECK
===================================================== */

export function userHasRole(
  role
) {

  return (
    authContext?.role ===
    role
  );

}


/* =====================================================
   PERMISSION CHECK
===================================================== */

export function userHasPermission(
  permission
) {

  if (!authContext) {

    return false;

  }


  return hasPermission(
    authContext.role,
    permission
  );

}


/* =====================================================
   UPDATE PAGE TITLE
===================================================== */

export function setPageTitle(
  title
) {

  const groupName =
    authContext?.group?.name;


  if (!groupName) {

    document.title =
      `${title} — CHAMA LIVE`;

    return;

  }


  document.title =
    `${title} — ${groupName} — CHAMA LIVE`;

}


/* =====================================================
   EXPOSE AUTH CONTEXT
===================================================== */

window.CHAMA =
  window.CHAMA || {};


window.CHAMA.auth =
  () => authContext;


window.CHAMA.role =
  () =>
    authContext?.role ||
    null;


window.CHAMA.group =
  () =>
    authContext?.group ||
    null;


window.CHAMA.member =
  () =>
    authContext?.member ||
    null;
```
