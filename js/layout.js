
/* =========================================================
   CHAMA LIVE — GLOBAL LAYOUT
   FINAL STABLE VERSION
========================================================= */

import { supabase } from "./supabase.js";

import {
  getCurrentUser,
  getCurrentMember,
  getCurrentGroup
} from "./auth.js";


console.log("CHAMA LIVE: layout.js loaded");


/* =========================================================
   STATE
========================================================= */

let currentMember = null;
let currentGroup = null;

let bootStarted = false;
let pageScriptLoaded = false;


/* =========================================================
   HELPER
========================================================= */

function byId(id) {
  return document.getElementById(id);
}


/* =========================================================
   CURRENT PAGE
========================================================= */

function getCurrentPage() {

  let page =
    window.location.pathname
      .split("/")
      .pop();

  if (!page) {
    page = "dashboard.html";
  }

  return page.toLowerCase();
}


/* =========================================================
   DISPLAY USER
========================================================= */

function displayUser(member) {

  const name =
    member?.name ||
    member?.full_name ||
    "Member";

  document
    .querySelectorAll("[data-user-name]")
    .forEach(function (element) {

      element.textContent = name;

    });

}


/* =========================================================
   DISPLAY GROUP
========================================================= */

function displayGroup(group) {

  const name =
    group?.name ||
    group?.group_name ||
    "CHAMA";

  document
    .querySelectorAll("[data-group-name]")
    .forEach(function (element) {

      element.textContent = name;

    });

}


/* =========================================================
   MOBILE STYLES
========================================================= */

function injectMobileNavigationStyles() {

  if (
    byId("chama-global-mobile-styles")
  ) {
    return;
  }


  const style =
    document.createElement("style");


  style.id =
    "chama-global-mobile-styles";


  style.textContent = `

    .mobile-bottom-nav {
      display: none;
    }

    @media (max-width: 650px) {

      .sidebar {
        display: none !important;
      }

      .menu-toggle {
        display: none !important;
      }

      .layout {
        display: block !important;
        width: 100% !important;
      }

      .main {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 16px 14px 96px 14px !important;
      }

      .topbar {
        width: 100%;
        position: sticky;
        top: 0;
        z-index: 1000;
      }

      .mobile-bottom-nav {

        position: fixed;

        left: 0;
        right: 0;
        bottom: 0;

        z-index: 99999;

        display: grid;

        grid-template-columns:
          repeat(5, minmax(0, 1fr));

        height: 72px;

        padding:
          6px 6px
          calc(6px + env(safe-area-inset-bottom));

        background:
          rgba(255, 255, 255, 0.98);

        border-top:
          1px solid #e5e7eb;

        box-shadow:
          0 -5px 20px rgba(0, 0, 0, 0.08);

        backdrop-filter:
          blur(14px);

        -webkit-backdrop-filter:
          blur(14px);
      }

      .mobile-nav-item {

        display: flex;

        flex-direction: column;

        align-items: center;

        justify-content: center;

        gap: 3px;

        min-width: 0;

        text-decoration: none;

        color: #64748b;

        border-radius: 13px;

        transition:
          background 0.2s ease,
          color 0.2s ease,
          transform 0.2s ease;
      }

      .mobile-nav-item:active {
        transform: scale(0.96);
      }

      .mobile-nav-item.active {

        color: #0f766e;

        background:
          rgba(15, 118, 110, 0.09);
      }

      .mobile-nav-icon {

        display: flex;

        align-items: center;

        justify-content: center;

        width: 30px;

        height: 30px;

        font-size: 21px;

        line-height: 1;

        font-weight: 700;
      }

      .mobile-nav-label {

        font-size: 9px;

        line-height: 1;

        font-weight: 600;

        white-space: nowrap;
      }

      .mobile-nav-main .mobile-nav-icon {

        width: 43px;

        height: 43px;

        margin-top: -18px;

        border-radius: 50%;

        background: #0f766e;

        color: white;

        border: 4px solid white;

        box-shadow:
          0 5px 15px
          rgba(15, 118, 110, 0.30);

        font-size: 25px;
      }

      .mobile-nav-main .mobile-nav-label {
        color: #0f766e;
      }

      .mobile-nav-main.active
      .mobile-nav-icon {
        background: #115e59;
      }

      .table-wrap {

        width: 100%;

        max-width: 100%;

        overflow-x: auto;

        -webkit-overflow-scrolling: touch;
      }

      .grid-2 {
        grid-template-columns:
          1fr !important;
      }

      .grid-3 {
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
      }

      .card {
        max-width: 100%;
      }
    }

    @media (max-width: 390px) {

      .mobile-bottom-nav {
        height: 68px;
      }

      .mobile-nav-icon {

        width: 27px;

        height: 27px;

        font-size: 19px;
      }

      .mobile-nav-label {
        font-size: 8px;
      }

      .mobile-nav-main .mobile-nav-icon {

        width: 39px;

        height: 39px;

        font-size: 22px;
      }

      .grid-3 {
        grid-template-columns: 1fr;
      }
    }

  `;


  document.head.appendChild(style);


  console.log(
    "CHAMA LIVE: mobile styles ready"
  );

}


/* =========================================================
   MOBILE NAVIGATION
========================================================= */

function setupMobileNavigation() {

  if (
    document.querySelector(
      ".mobile-bottom-nav"
    )
  ) {
    return;
  }


  const nav =
    document.createElement("nav");


  nav.className =
    "mobile-bottom-nav";


  nav.setAttribute(
    "aria-label",
    "Mobile navigation"
  );


  function addLink(
    href,
    page,
    icon,
    label,
    main
  ) {

    const link =
      document.createElement("a");


    link.href =
      href;


    link.className =
      "mobile-nav-item";


    link.dataset.page =
      page;


    if (main) {

      link.classList.add(
        "mobile-nav-main"
      );

    }


    const iconElement =
      document.createElement("span");


    iconElement.className =
      "mobile-nav-icon";


    iconElement.setAttribute(
      "aria-hidden",
      "true"
    );


    iconElement.textContent =
      icon;


    const labelElement =
      document.createElement("span");


    labelElement.className =
      "mobile-nav-label";


    labelElement.textContent =
      label;


    link.appendChild(
      iconElement
    );


    link.appendChild(
      labelElement
    );


    nav.appendChild(
      link
    );

  }


  addLink(
    "dashboard.html",
    "dashboard.html",
    "⌂",
    "Home",
    false
  );


  addLink(
    "members.html",
    "members.html",
    "♙",
    "Members",
    false
  );


  addLink(
    "contributions.html",
    "contributions.html",
    "+",
    "Contribute",
    true
  );


  addLink(
    "expenses.html",
    "expenses.html",
    "−",
    "Expenses",
    false
  );


  addLink(
    "meetings.html",
    "meetings.html",
    "◷",
    "Meetings",
    false
  );


  document.body.appendChild(
    nav
  );


  const currentPage =
    getCurrentPage();


  nav
    .querySelectorAll(
      ".mobile-nav-item"
    )
    .forEach(function (item) {

      if (
        item.dataset.page ===
        currentPage
      ) {

        item.classList.add(
          "active"
        );

      }

    });


  console.log(
    "CHAMA LIVE: mobile navigation ready"
  );

}


/* =========================================================
   LOGOUT
========================================================= */

function setupLogout() {

  const button =
    byId("logout");


  if (!button) {
    return;
  }


  if (
    button.dataset.layoutLogoutReady ===
    "true"
  ) {
    return;
  }


  button.dataset.layoutLogoutReady =
    "true";


  button.addEventListener(
    "click",
    async function () {

      const originalText =
        button.textContent;


      button.disabled =
        true;


      button.textContent =
        "Signing out...";


      try {

        const {
          error
        } =
          await supabase.auth.signOut();


        if (error) {
          throw error;
        }


        window.location.href =
          "index.html";

      }
      catch (error) {

        console.error(
          "CHAMA LIVE: logout failed",
          error
        );


        button.disabled =
          false;


        button.textContent =
          originalText ||
          "Sign out";

      }

    }
  );


  console.log(
    "CHAMA LIVE: logout ready"
  );

}


/* =========================================================
   LOAD MEMBER + GROUP
========================================================= */

async function loadLayoutData() {

  console.log(
    "CHAMA LIVE: loading member and group"
  );


  currentMember =
    await getCurrentMember();


  if (!currentMember) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  if (!currentMember.group_id) {

    throw new Error(
      "Your member record has no group."
    );

  }


  currentGroup =
    await getCurrentGroup();


  if (!currentGroup) {

    throw new Error(
      "Group information could not be found."
    );

  }


  displayUser(
    currentMember
  );


  displayGroup(
    currentGroup
  );


  console.log(
    "CHAMA LIVE: member loaded",
    currentMember
  );


  console.log(
    "CHAMA LIVE: group loaded",
    currentGroup
  );


  return {
    member: currentMember,
    group: currentGroup
  };

}


/* =========================================================
   PAGE SCRIPT MAP
========================================================= */

const PAGE_SCRIPTS = {

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


/* =========================================================
   LOAD CURRENT PAGE SCRIPT
========================================================= */

async function loadCurrentPageScript() {

  if (pageScriptLoaded) {
    return;
  }


  const page =
    getCurrentPage();


  const script =
    PAGE_SCRIPTS[page];


  if (!script) {

    console.log(
      "CHAMA LIVE: no page script for",
      page
    );

    return;

  }


  console.log(
    "CHAMA LIVE: loading page script:",
    script
  );


  try {

    const pageModule =
      await import(script);


    let initializer =
      null;


    /*
     * Preferred initializer
     */

    if (
      typeof pageModule.initPage ===
      "function"
    ) {

      initializer =
        pageModule.initPage;

    }


    /*
     * Dashboard
     */

    else if (
      page === "dashboard.html" &&
      typeof pageModule.initDashboard ===
      "function"
    ) {

      initializer =
        pageModule.initDashboard;

    }


    /*
     * Members
     */

    else if (
      page === "members.html" &&
      typeof pageModule.initMembers ===
      "function"
    ) {

      initializer =
        pageModule.initMembers;

    }


    /*
     * Contributions
     */

    else if (
      page === "contributions.html" &&
      typeof pageModule.initContributions ===
      "function"
    ) {

      initializer =
        pageModule.initContributions;

    }


    /*
     * Expenses
     */

    else if (
      page === "expenses.html" &&
      typeof pageModule.initExpenses ===
      "function"
    ) {

      initializer =
        pageModule.initExpenses;

    }


    /*
     * Meetings
     */

    else if (
      page === "meetings.html" &&
      typeof pageModule.initMeetings ===
      "function"
    ) {

      initializer =
        pageModule.initMeetings;

    }


    /*
     * Reports
     */

    else if (
      page === "reports.html" &&
      typeof pageModule.initReports ===
      "function"
    ) {

      initializer =
        pageModule.initReports;

    }


    /*
     * Monthly closing
     */

    else if (
      page === "monthly-closing.html" &&
      typeof pageModule.initMonthlyClosing ===
      "function"
    ) {

      initializer =
        pageModule.initMonthlyClosing;

    }


    /*
     * Group management
     */

    else if (
      page === "group-management.html" &&
      typeof pageModule.initGroupManagement ===
      "function"
    ) {

      initializer =
        pageModule.initGroupManagement;

    }


    /*
     * Generic init
     */

    else if (
      typeof pageModule.init ===
      "function"
    ) {

      initializer =
        pageModule.init;

    }


    if (initializer) {

      await initializer();


      pageScriptLoaded =
        true;


      console.log(
        "CHAMA LIVE: page initialized:",
        page
      );

    }
    else {

      console.warn(
        "CHAMA LIVE: no initializer exported by:",
        page
      );


      /*
       * We still mark it loaded so the
       * layout doesn't repeatedly import it.
       */

      pageScriptLoaded =
        true;

    }

  }
  catch (error) {

    pageScriptLoaded =
      false;


    console.error(
      "CHAMA LIVE: page script failed:",
      error
    );


    const errorBox =
      byId("error");


    if (errorBox) {

      errorBox.hidden =
        false;


      errorBox.textContent =
        error?.message ||
        "Unable to load this page.";

    }

  }

}


/* =========================================================
   AUTHENTICATION
========================================================= */

async function initializeAuthentication() {

  console.log(
    "CHAMA LIVE: checking authentication"
  );


  const user =
    await getCurrentUser();


  if (!user) {

    throw new Error(
      "You are not logged in."
    );

  }


  console.log(
    "CHAMA LIVE: authentication verified"
  );


  return user;

}


/* =========================================================
   INITIALIZE LAYOUT
========================================================= */

async function initLayout() {

  console.log(
    "CHAMA LIVE: initializing layout"
  );


  /*
   * 1. Mobile CSS
   */

  injectMobileNavigationStyles();


  /*
   * 2. Authentication
   */

  await initializeAuthentication();


  /*
   * 3. Member + Group
   */

  await loadLayoutData();


  /*
   * 4. Logout
   */

  setupLogout();


  /*
   * 5. Mobile navigation
   */

  setupMobileNavigation();


  /*
   * 6. Current page
   */

  await loadCurrentPageScript();


  console.log(
    "CHAMA LIVE: layout initialized successfully"
  );

}


/* =========================================================
   PUBLIC BOOT
========================================================= */

/*
 * IMPORTANT:
 *
 * Every protected HTML page imports:
 *
 * import { boot } from "./js/layout.js";
 *
 * Therefore this function MUST remain exported.
 */

export async function boot() {

  if (bootStarted) {

    console.warn(
      "CHAMA LIVE: boot already started"
    );

    return;

  }


  bootStarted =
    true;


  console.log(
    "CHAMA LIVE: boot() started"
  );


  try {

    await initLayout();

  }
  catch (error) {

    console.error(
      "CHAMA LIVE: boot failed",
      error
    );


    bootStarted =
      false;


    const errorBox =
      byId("error");


    if (errorBox) {

      errorBox.hidden =
        false;


      errorBox.textContent =
        error?.message ||
        "Unable to initialize CHAMA LIVE.";

    }

  }

}


/* =========================================================
   OPTIONAL PUBLIC STATE
========================================================= */

export function getLayoutState() {

  return {

    member: currentMember,

    group: currentGroup

  };

}


console.log(
  "CHAMA LIVE: layout.js ready — boot() exported"
);
