```javascript
/* =========================================================
   CHAMA LIVE — GLOBAL LAYOUT
   FINAL CLEAN VERSION
   ---------------------------------------------------------
   IMPORTANT:
   • HTML pages load ONLY layout.js
   • layout.js authenticates the user
   • layout.js loads member + group
   • layout.js dynamically loads the current page JS
   • DO NOT directly load dashboard.js, members.js,
     contributions.js, expenses.js, meetings.js,
     reports.js, etc. from HTML.
========================================================= */


/* =========================================================
   IMPORTS
========================================================= */

import { supabase } from "./supabase.js";

import {
  getCurrentUser,
  getCurrentMember,
  getCurrentGroup
} from "./auth.js";


console.log(
  "CHAMA LIVE: layout.js loaded"
);


/* =========================================================
   GLOBAL STATE
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
   GET CURRENT PAGE
========================================================= */

function getCurrentPage() {

  const path =
    window.location.pathname || "";

  const parts =
    path.split("/");

  let page =
    parts[parts.length - 1];

  if (!page) {

    page =
      "dashboard.html";

  }

  return page.toLowerCase();

}


/* =========================================================
   DISPLAY USER NAME
========================================================= */

function displayUser(member) {

  const name =
    member?.name ||
    member?.full_name ||
    "Member";


  document
    .querySelectorAll(
      "[data-user-name]"
    )
    .forEach(
      function(element) {

        element.textContent =
          name;

      }
    );

}


/* =========================================================
   DISPLAY GROUP NAME
========================================================= */

function displayGroup(group) {

  const name =
    group?.name ||
    group?.group_name ||
    "CHAMA";


  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(
      function(element) {

        element.textContent =
          name;

      }
    );

}


/* =========================================================
   MOBILE NAVIGATION CSS
========================================================= */

function injectMobileNavigationStyles() {

  if (
    byId(
      "chama-global-mobile-styles"
    )
  ) {

    return;

  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    "chama-global-mobile-styles";


  style.textContent = `

    /* =====================================================
       DESKTOP
    ===================================================== */

    .mobile-bottom-nav {
      display: none;
    }


    /* =====================================================
       MOBILE
    ===================================================== */

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

        padding:
          16px
          14px
          96px
          14px !important;

        box-sizing: border-box;
      }


      .topbar {
        width: 100%;

        position: sticky;

        top: 0;

        z-index: 1000;
      }


      /* ===================================================
         BOTTOM NAV
      =================================================== */

      .mobile-bottom-nav {

        position: fixed;

        left: 0;
        right: 0;
        bottom: 0;

        z-index: 99999;

        display: grid;

        grid-template-columns:
          repeat(5, 1fr);

        align-items: stretch;

        height: 72px;

        padding:
          6px;

        padding-bottom:
          calc(
            6px +
            env(safe-area-inset-bottom)
          );

        background:
          rgba(255,255,255,.98);

        border-top:
          1px solid #e5e7eb;

        box-shadow:
          0 -5px 20px
          rgba(0,0,0,.08);

        backdrop-filter:
          blur(14px);

        -webkit-backdrop-filter:
          blur(14px);

        box-sizing: border-box;
      }


      /* ===================================================
         NAV ITEM
      =================================================== */

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
          background .2s ease,
          color .2s ease,
          transform .2s ease;
      }


      .mobile-nav-item:active {

        transform:
          scale(.96);

      }


      /* ===================================================
         ICON
      =================================================== */

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


      /* ===================================================
         LABEL
      =================================================== */

      .mobile-nav-label {

        font-size: 9px;

        line-height: 1;

        font-weight: 600;

        white-space: nowrap;
      }


      /* ===================================================
         ACTIVE
      =================================================== */

      .mobile-nav-item.active {

        color: #0f766e;

        background:
          rgba(15,118,110,.09);
      }


      /* ===================================================
         MAIN CONTRIBUTION BUTTON
      =================================================== */

      .mobile-nav-main {

        position: relative;
      }


      .mobile-nav-main
      .mobile-nav-icon {

        width: 43px;

        height: 43px;

        margin-top: -18px;

        border-radius: 50%;

        background:
          #0f766e;

        color: white;

        border:
          4px solid white;

        box-shadow:
          0 5px 15px
          rgba(15,118,110,.30);

        font-size: 25px;
      }


      .mobile-nav-main
      .mobile-nav-label {

        color:
          #0f766e;
      }


      .mobile-nav-main.active
      .mobile-nav-icon {

        background:
          #115e59;
      }


      /* ===================================================
         TABLES
      =================================================== */

      .table-wrap {

        width: 100%;

        max-width: 100%;

        overflow-x: auto;

        -webkit-overflow-scrolling:
          touch;
      }


      /* ===================================================
         GRIDS
      =================================================== */

      .grid-2 {

        grid-template-columns:
          1fr !important;
      }


      .grid-3 {

        grid-template-columns:
          repeat(
            2,
            minmax(0,1fr)
          );
      }


      /* ===================================================
         CARDS
      =================================================== */

      .card {

        max-width:
          100%;

        box-sizing:
          border-box;
      }

    }


    /* =====================================================
       SMALL PHONES
    ===================================================== */

    @media (max-width: 390px) {

      .mobile-bottom-nav {

        height:
          68px;
      }


      .mobile-nav-icon {

        width:
          27px;

        height:
          27px;

        font-size:
          19px;
      }


      .mobile-nav-label {

        font-size:
          8px;
      }


      .mobile-nav-main
      .mobile-nav-icon {

        width:
          39px;

        height:
          39px;

        font-size:
          22px;
      }


      .grid-3 {

        grid-template-columns:
          1fr;
      }

    }

  `;


  document.head.appendChild(
    style
  );


  console.log(
    "CHAMA LIVE: mobile styles ready"
  );

}


/* =========================================================
   MOBILE NAVIGATION
========================================================= */

function setupMobileNavigation() {

  /*
   * Never create the navigation twice.
   */

  if (
    document.querySelector(
      ".mobile-bottom-nav"
    )
  ) {

    return;

  }


  const nav =
    document.createElement(
      "nav"
    );


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
    isMain
  ) {

    const link =
      document.createElement(
        "a"
      );


    link.href =
      href;


    link.className =
      "mobile-nav-item";


    if (isMain) {

      link.classList.add(
        "mobile-nav-main"
      );

    }


    link.dataset.page =
      page;


    const iconElement =
      document.createElement(
        "span"
      );


    iconElement.className =
      "mobile-nav-icon";


    iconElement.setAttribute(
      "aria-hidden",
      "true"
    );


    iconElement.textContent =
      icon;


    const labelElement =
      document.createElement(
        "span"
      );


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
    .forEach(
      function(item) {

        if (
          item.dataset.page ===
          currentPage
        ) {

          item.classList.add(
            "active"
          );

        }

      }
    );


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


  /*
   * Prevent duplicate listener.
   */

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
    async function() {

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
    "CHAMA LIVE: loading member..."
  );


  currentMember =
    await getCurrentMember();


  if (!currentMember) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  if (
    !currentMember.group_id
  ) {

    throw new Error(
      "Your member record has no group."
    );

  }


  console.log(
    "CHAMA LIVE: loading group..."
  );


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

    member:
      currentMember,

    group:
      currentGroup

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
   FIND PAGE INITIALIZER
========================================================= */

function getPageInitializer(
  page,
  module
) {

  /*
   * Standard initializer.
   */

  if (
    typeof module.initPage ===
    "function"
  ) {

    return module.initPage;

  }


  /*
   * Dashboard.
   */

  if (
    page === "dashboard.html" &&
    typeof module.initDashboard ===
    "function"
  ) {

    return module.initDashboard;

  }


  /*
   * Members.
   */

  if (
    page === "members.html" &&
    typeof module.initMembers ===
    "function"
  ) {

    return module.initMembers;

  }


  /*
   * Contributions.
   */

  if (
    page === "contributions.html" &&
    typeof module.initContributions ===
    "function"
  ) {

    return module.initContributions;

  }


  /*
   * Expenses.
   */

  if (
    page === "expenses.html" &&
    typeof module.initExpenses ===
    "function"
  ) {

    return module.initExpenses;

  }


  /*
   * Meetings.
   */

  if (
    page === "meetings.html" &&
    typeof module.initMeetings ===
    "function"
  ) {

    return module.initMeetings;

  }


  /*
   * Reports.
   */

  if (
    page === "reports.html" &&
    typeof module.initReports ===
    "function"
  ) {

    return module.initReports;

  }


  /*
   * Monthly closing.
   */

  if (
    page === "monthly-closing.html" &&
    typeof module.initMonthlyClosing ===
    "function"
  ) {

    return module.initMonthlyClosing;

  }


  /*
   * Group management.
   */

  if (
    page === "group-management.html" &&
    typeof module.initGroupManagement ===
    "function"
  ) {

    return module.initGroupManagement;

  }


  /*
   * Generic initializer.
   */

  if (
    typeof module.init ===
    "function"
  ) {

    return module.init;

  }


  return null;

}


/* =========================================================
   LOAD CURRENT PAGE SCRIPT
========================================================= */

async function loadCurrentPageScript() {

  if (pageScriptLoaded) {

    console.warn(
      "CHAMA LIVE: page script already loaded"
    );

    return;

  }


  const page =
    getCurrentPage();


  const scriptPath =
    PAGE_SCRIPTS[page];


  if (!scriptPath) {

    console.log(
      "CHAMA LIVE: no page script for",
      page
    );

    return;

  }


  console.log(
    "CHAMA LIVE: loading page script:",
    scriptPath
  );


  try {

    const module =
      await import(
        scriptPath
      );


    const initializer =
      getPageInitializer(
        page,
        module
      );


    pageScriptLoaded =
      true;


    if (
      typeof initializer ===
      "function"
    ) {

      await initializer();


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

    }

  }
  catch (error) {

    pageScriptLoaded =
      false;


    console.error(
      "CHAMA LIVE: page script failed:",
      scriptPath,
      error
    );


    const errorBox =
      byId("error");


    if (errorBox) {

      errorBox.hidden =
        false;


      errorBox.textContent =
        error?.message ||
        "Unable to load this page. Please refresh and try again.";

    }

  }

}


/* =========================================================
   AUTHENTICATION
========================================================= */

async function initializeAuthentication() {

  console.log(
    "CHAMA LIVE: checking authentication..."
  );


  const user =
    await getCurrentUser();


  if (!user) {

    throw new Error(
      "You are not logged in."
    );

  }


  console.log(
    "CHAMA LIVE: authentication verified:",
    user.email
  );


  return user;

}


/* =========================================================
   INITIALIZE LAYOUT
========================================================= */

async function initLayout() {

  console.log(
    "CHAMA LIVE: initializing layout..."
  );


  /*
   * 1. Mobile styling
   */

  injectMobileNavigationStyles();


  /*
   * 2. Authentication
   */

  await initializeAuthentication();


  /*
   * 3. Current member + group
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
   * 6. Current page JavaScript
   */

  await loadCurrentPageScript();


  console.log(
    "CHAMA LIVE: global layout initialized"
  );

}


/* =========================================================
   PUBLIC BOOT
   ---------------------------------------------------------
   THIS IS THE FUNCTION YOUR HTML FILES IMPORT.
========================================================= */

export async function boot() {

  /*
   * Prevent double initialization.
   */

  if (bootStarted) {

    console.warn(
      "CHAMA LIVE: boot already started"
    );

    return;

  }


  bootStarted =
    true;


  try {

    await initLayout();

  }
  catch (error) {

    console.error(
      "CHAMA LIVE: layout initialization failed:",
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
   OPTIONAL GETTERS
   ---------------------------------------------------------
   These do NOT export mutable state directly.
========================================================= */

export function getLayoutMember() {

  return currentMember;

}


export function getLayoutGroup() {

  return currentGroup;

}


console.log(
  "CHAMA LIVE: layout.js ready — boot() exported"
);
```

