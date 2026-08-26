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

  const file =
    window.location.pathname
      .split("/")
      .pop();

  return file || "dashboard.html";
}


/* =========================================================
   ACTIVE NAVIGATION
========================================================= */

function highlightCurrentPage() {

  const page =
    currentPage();


  document
    .querySelectorAll(".nav a")
    .forEach(link => {

      const href =
        link.getAttribute("href");


      if (!href) {
        return;
      }


      const linkPage =
        href
          .split("/")
          .pop()
          .split("?")[0];


      link.classList.toggle(
        "active",
        linkPage === page
      );

    });
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
   * Prevent duplicate event listeners.
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


      if (
        button.dataset.loggingOut ===
        "true"
      ) {
        return;
      }


      button.dataset.loggingOut =
        "true";


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


        button.dataset.loggingOut =
          "false";


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
   MEMBER DISPLAY
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
   GROUP DISPLAY
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
   SAFE STATUS
========================================================= */

function setStatus(
  message
) {

  const status =
    $("status");


  if (status) {
    status.textContent =
      message;
  }

}


/* =========================================================
   BOOT
========================================================= */

export async function boot() {

  /*
   * ALWAYS install the logout button
   * and navigation first.
   *
   * These must not depend on Supabase RPCs.
   */

  highlightCurrentPage();

  setupLogout();


  /*
   * Then check authentication.
   */

  let session;

  try {

    session =
      await requireAuth();

  } catch (error) {

    console.error(
      "Authentication boot error:",
      error
    );


    setStatus(
      "Authentication error."
    );


    return null;
  }


  if (!session) {
    return null;
  }


  /*
   * Get member.
   *
   * Failure here should NOT prevent
   * the page itself from loading.
   */

  let member =
    null;


  try {

    member =
      await getMyMember();

  } catch (error) {

    console.error(
      "Member loading error:",
      error
    );

  }


  /*
   * Apply RBAC if member exists.
   */

  if (member) {

    displayMember(
      member
    );


    applyRBAC(
      member
    );

  }


  /*
   * Get group.
   *
   * Again, don't block the page.
   */

  let group =
    null;


  try {

    group =
      await getMyGroup();

  } catch (error) {

    console.error(
      "Group loading error:",
      error
    );

  }


  if (group) {

    displayGroup(
      group
    );

  }


  /*
   * Don't show "loading dashboard"
   * forever simply because group
   * metadata failed.
   */

  const status =
    $("status");


  if (
    status &&
    status.textContent ===
    "Loading dashboard..."
  ) {

    status.textContent =
      "";

  }


  /*
   * Return information to page scripts.
   */

  return {
    session,
    member,
    group
  };

}
```
