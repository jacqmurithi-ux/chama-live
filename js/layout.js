import {
  supabase
} from "./supabase.js";

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


function currentPage() {

  const path =
    window.location.pathname;

  const file =
    path.split("/").pop();

  return file || "dashboard.html";
}


/* =========================================================
   GROUP DISPLAY
========================================================= */

async function loadGroupInfo() {

  try {

    const group =
      await getMyGroup();


    if (!group) {
      return null;
    }


    /*
     * Optional group name elements.
     */

    const elements =
      document.querySelectorAll(
        "[data-group-name]"
      );


    elements.forEach(
      element => {

        element.textContent =
          group.name ||
          "Your Group";

      }
    );


    return group;

  } catch (error) {

    console.error(
      "Unable to load group:",
      error
    );

    return null;

  }
}


/* =========================================================
   MEMBER DISPLAY
========================================================= */

async function loadMemberInfo() {

  try {

    const member =
      await getMyMember();


    if (!member) {
      return null;
    }


    const elements =
      document.querySelectorAll(
        "[data-member-name]"
      );


    elements.forEach(
      element => {

        element.textContent =
          member.name ||
          "Member";

      }
    );


    return member;

  } catch (error) {

    console.error(
      "Unable to load member:",
      error
    );

    return null;

  }
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
          link
            .getAttribute(
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
   LOGOUT BUTTON
========================================================= */

function setupLogout() {

  const button =
    $("logout");


  if (!button) {
    return;
  }


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
          "Sign out failed:",
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
    ).toLowerCase();


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


  /*
   * Elements can declare:
   *
   * data-role="admin"
   * data-role="manager"
   */

  document
    .querySelectorAll(
      "[data-role]"
    )
    .forEach(
      element => {

        const required =
          String(
            element.dataset.role
          ).toLowerCase();


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
   BOOT
========================================================= */

export async function boot() {

  try {

    /*
     * Authenticate first.
     */

    const session =
      await requireAuth();


    if (!session) {
      return null;
    }


    /*
     * Get member.
     */

    const member =
      await getMyMember();


    if (!member) {

      console.error(
        "No member record found for authenticated user."
      );


      await signOut();

      return null;
    }


    /*
     * Get group.
     */

    const group =
      await getMyGroup();


    if (!group) {

      console.error(
        "No group found for authenticated member."
      );


      await signOut();

      return null;
    }


    /*
     * UI.
     */

    highlightCurrentPage();

    setupLogout();

    applyRBAC(
      member
    );


    await loadMemberInfo();

    await loadGroupInfo();


    /*
     * Return useful information
     * to page scripts if needed.
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


    const status =
      $("status");


    if (status) {

      status.textContent =
        "Unable to initialize your account.";

    }


    const errorElement =
      $("error");


    if (errorElement) {

      errorElement.hidden =
        false;

      errorElement.textContent =
        error?.message ||
        "Unable to initialize application.";

    }


    return null;
  }
}
