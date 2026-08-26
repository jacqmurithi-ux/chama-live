```javascript
import {
  requireAuth,
  getMyMember,
  getMyGroup,
  signOut
} from "./auth.js";


/* =========================================================
   HELPER
========================================================= */

function $(id) {
  return document.getElementById(id);
}


/* =========================================================
   CURRENT PAGE
========================================================= */

function currentPage() {

  const path =
    window.location.pathname || "";

  const parts =
    path.split("/");

  return (
    parts[parts.length - 1] ||
    "dashboard.html"
  );
}


/* =========================================================
   SHOW ERROR
========================================================= */

function showBootError(message) {

  const error =
    $("error");

  if (error) {

    error.hidden = false;

    error.textContent =
      message;

  }

  const status =
    $("status");

  if (status) {

    status.textContent =
      "Unable to load this page.";

  }

}


/* =========================================================
   GROUP DISPLAY
========================================================= */

function displayGroup(group) {

  if (!group) {
    return;
  }

  const groupName =
    group.name ||
    group.group_name ||
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

}


/* =========================================================
   MEMBER DISPLAY
========================================================= */

function displayMember(member) {

  if (!member) {
    return;
  }

  const memberName =
    member.name ||
    "Member";

  document
    .querySelectorAll(
      "[data-member-name]"
    )
    .forEach(
      element => {

        element.textContent =
          memberName;

      }
    );

}


/* =========================================================
   ACTIVE NAVIGATION
========================================================= */

function highlightCurrentPage() {

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
          href
            .split("/")
            .pop();

        link.classList.toggle(
          "active",
          linkPage === page
        );

      }
    );

}


/* =========================================================
   LOGOUT
========================================================= */

function setupLogout() {

  const button =
    $("logout");

  if (!button) {
    return;
  }


  /*
   * Prevent installing the listener twice.
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

        alert(
          error?.message ||
          "Unable to sign out."
        );

      }

    }
  );

}


/* =========================================================
   ROLE ACCESS
========================================================= */

function applyRBAC(member) {

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
    "admin",
    "administrator",
    "chairperson",
    "secretary",
    "treasurer",
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

        const requiredRole =
          String(
            element.dataset.role ||
            ""
          )
            .trim()
            .toLowerCase();


        if (
          requiredRole ===
          "admin"
        ) {

          element.hidden =
            !isAdmin;

        }


        if (
          requiredRole ===
          "manager"
        ) {

          element.hidden =
            !isManager;

        }

      }
    );

}


/* =========================================================
   BOOT APPLICATION
========================================================= */

export async function boot() {

  try {

    /*
     * 1. Check Supabase session.
     */

    const session =
      await requireAuth();


    if (!session) {

      return null;

    }


    /*
     * 2. Get logged-in member.
     */

    const member =
      await getMyMember();


    if (!member) {

      throw new Error(
        "Your login is not linked to a member record."
      );

    }


    /*
     * 3. Get the member's group.
     */

    const group =
      await getMyGroup();


    if (!group) {

      throw new Error(
        "Your account is not linked to a valid group."
      );

    }


    /*
     * 4. Update common interface.
     */

    highlightCurrentPage();

    setupLogout();

    applyRBAC(
      member
    );

    displayMember(
      member
    );

    displayGroup(
      group
    );


    /*
     * 5. Update status message.
     */

    const status =
      $("status");

    if (status) {

      status.textContent =
        "";

    }


    /*
     * 6. Return information to page scripts.
     */

    return {
      session,
      member,
      group
    };


  } catch (error) {

    console.error(
      "CHAMA LIVE boot error:",
      error
    );


    /*
     * If authentication/session is invalid,
     * send the user back to login.
     */

    const message =
      String(
        error?.message ||
        ""
      );


    if (
      message.toLowerCase().includes(
        "not authenticated"
      ) ||
      message.toLowerCase().includes(
        "no session"
      ) ||
      message.toLowerCase().includes(
        "session"
      )
    ) {

      try {

        await signOut();

      } catch (_) {

        window.location.href =
          "login.html";

      }

      return null;

    }


    /*
     * Display error without breaking
     * the rest of the page.
     */

    showBootError(
      message ||
      "Unable to initialize the application."
    );


    return null;

  }

}
```
