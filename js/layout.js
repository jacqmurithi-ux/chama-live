import {
  requireAuth,
  getMyMember,
  getMyGroup,
  signOut
} from "./auth.js";


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
      .pop()
      .toLowerCase();

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
          .toLowerCase();

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

  if (
    button.dataset.logoutReady === "true"
  ) {
    return;
  }

  button.dataset.logoutReady =
    "true";

  button.addEventListener(
    "click",
    async event => {

      event.preventDefault();

      button.disabled = true;

      button.textContent =
        "Signing out...";

      try {

        await signOut();

      } catch (error) {

        console.error(
          "Sign out error:",
          error
        );

        button.disabled = false;

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

  document
    .querySelectorAll(
      "[data-member-name]"
    )
    .forEach(element => {

      element.textContent =
        member?.name ||
        "Member";

    });

}


/* =========================================================
   GROUP DISPLAY
========================================================= */

function displayGroup(
  group
) {

  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(element => {

      element.textContent =
        group?.name ||
        "Your Group";

    });

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
      member.role || "member"
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
    adminRoles.includes(role);


  const isManager =
    managerRoles.includes(role);


  document
    .querySelectorAll("[data-role]")
    .forEach(element => {

      const required =
        String(
          element.dataset.role
        )
          .trim()
          .toLowerCase();


      if (
        required === "admin"
      ) {

        element.hidden =
          !isAdmin;

      }


      if (
        required === "manager"
      ) {

        element.hidden =
          !isManager;

      }

    });

}


/* =========================================================
   LOAD PAGE SCRIPT
========================================================= */

async function loadPageScript() {

  const page =
    currentPage();


  const scripts = {

    "dashboard.html":
      "./dashboard.js",

    "members.html":
      "./members.js",

    "contributions.html":
      "./contributions.js",

    "expenses.html":
      "./expenses.js",

    "meetings.html":
      "./meetings.js",

    "reports.html":
      "./reports.js",

    "monthly-closing.html":
      "./monthly-closing.js",

    "group-management.html":
      "./group-management.js"

  };


  const script =
    scripts[page];


  if (!script) {
    return;
  }


  try {

    await import(script);

  } catch (error) {

    console.error(
      `Unable to load ${script}:`,
      error
    );


    const errorBox =
      $("error");


    if (errorBox) {

      errorBox.hidden =
        false;

      errorBox.textContent =
        error?.message ||
        `Unable to load ${page} JavaScript.`;

    }

  }

}


/* =========================================================
   BOOT
========================================================= */

export async function boot() {

  try {

    const session =
      await requireAuth();


    if (!session) {
      return null;
    }


    const member =
      await getMyMember();


    if (!member) {

      throw new Error(
        "Your authenticated account is not linked to an active member record."
      );

    }


    const group =
      await getMyGroup();


    if (!group) {

      throw new Error(
        "Your member account is not linked to an active group."
      );

    }


    displayMember(
      member
    );


    displayGroup(
      group
    );


    highlightCurrentPage();

    setupLogout();

    applyRBAC(
      member
    );


    const status =
      $("status");


    if (status) {

      status.textContent =
        `Welcome, ${member.name || "Member"}.`;

    }


    /*
     * Now load the page-specific
     * JavaScript.
     */

    await loadPageScript();


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


    const errorBox =
      $("error");


    if (errorBox) {

      errorBox.hidden =
        false;

      errorBox.textContent =
        error?.message ||
        "Unable to initialize application.";

    }


    return null;

  }

}
