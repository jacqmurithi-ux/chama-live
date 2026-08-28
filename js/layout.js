```javascript
/* =========================================================
   CHAMA LIVE — GLOBAL LAYOUT
   Clean Version
   ---------------------------------------------------------
   IMPORTANT:
   - HTML calls boot()
   - layout.js dynamically loads page JS
   - Page JS must NOT be loaded directly in HTML
   - Prevents duplicate initialization
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

  let page = window.location.pathname
    .split("/")
    .pop()
    .toLowerCase();

  if (!page) {
    page = "dashboard.html";
  }

  return page;
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
    .forEach(element => {
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
    .forEach(element => {
      element.textContent = name;
    });
}


/* =========================================================
   MOBILE CSS
========================================================= */

function injectMobileNavigationStyles() {

  if (
    document.getElementById(
      "chama-global-mobile-styles"
    )
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

        padding:
          16px
          14px
          96px
          14px !important;
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
          repeat(5, 1fr);

        align-items: stretch;

        height: 72px;

        padding:
          6px
          6px
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


      .mobile-nav-item.active {

        color: #0f766e;

        background:
          rgba(15,118,110,.09);
      }


      .mobile-nav-main {
        position: relative;
      }


      .mobile-nav-main
      .mobile-nav-icon {

        width: 43px;
        height: 43px;

        margin-top: -18px;

        border-radius: 50%;

        background: #0f766e;

        color: white;

        border: 4px solid white;

        box-shadow:
          0 5px 15px
          rgba(15,118,110,.30);

        font-size: 25px;
      }


      .mobile-nav-main
      .mobile-nav-label {

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


      .mobile-nav-main
      .mobile-nav-icon {

        width: 39px;
        height: 39px;

        font-size: 22px;
      }


      .grid-3 {

        grid-template-columns:
          1fr;
      }

    }

  `;


  document.head.appendChild(style);

  console.log(
    "CHAMA LIVE: mobile CSS injected"
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


  nav.innerHTML = `

    <a
      href="dashboard.html"
      class="mobile-nav-item"
      data-page="dashboard.html"
    >
      <span
        class="mobile-nav-icon"
        aria-hidden="true"
      >⌂</span>

      <span class="mobile-nav-label">
        Home
      </span>
    </a>


    <a
      href="members.html"
      class="mobile-nav-item"
      data-page="members.html"
    >
      <span
        class="mobile-nav-icon"
        aria-hidden="true"
      >♙</span>

      <span class="mobile-nav-label">
        Members
      </span>
    </a>


    <a
      href="contributions.html"
      class="mobile-nav-item mobile-nav-main"
      data-page="contributions.html"
    >
      <span
        class="mobile-nav-icon"
        aria-hidden="true"
      >+</span>

      <span class="mobile-nav-label">
        Contribute
      </span>
    </a>


    <a
      href="expenses.html"
      class="mobile-nav-item"
      data-page="expenses.html"
    >
      <span
        class="mobile-nav-icon"
        aria-hidden="true"
      >−</span>

      <span class="mobile-nav-label">
        Expenses
      </span>
    </a>


    <a
      href="meetings.html"
      class="mobile-nav-item"
      data-page="meetings.html"
    >
      <span
        class="mobile-nav-icon"
        aria-hidden="true"
      >◷</span>

      <span class="mobile-nav-label">
        Meetings
      </span>
    </a>

  `;


  document.body.appendChild(nav);


  const currentPage =
    getCurrentPage();


  nav
    .querySelectorAll(
      ".mobile-nav-item"
    )
    .forEach(item => {

      const page =
        String(
          item.dataset.page || ""
        ).toLowerCase();


      if (page === currentPage) {

        item.classList.add("active");

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

  const logoutButton =
    byId("logout");


  if (!logoutButton) {
    return;
  }


  if (
    logoutButton.dataset
      .layoutLogoutReady === "true"
  ) {
    return;
  }


  logoutButton.dataset
    .layoutLogoutReady = "true";


  logoutButton.addEventListener(
    "click",
    async () => {

      const originalText =
        logoutButton.textContent;


      logoutButton.disabled = true;

      logoutButton.textContent =
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
          "CHAMA LIVE: logout failed:",
          error
        );


        logoutButton.disabled =
          false;

        logoutButton.textContent =
          originalText || "Sign out";

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
    "CHAMA LIVE: current member:",
    currentMember
  );


  console.log(
    "CHAMA LIVE: current group:",
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
   LOAD PAGE SCRIPT
========================================================= */

async function loadCurrentPageScript() {

  if (pageScriptLoaded) {

    console.log(
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
      "CHAMA LIVE: no page script for:",
      page
    );

    return;
  }


  console.log(
    "CHAMA LIVE: loading:",
    scriptPath
  );


  try {

    const module =
      await import(scriptPath);


    pageScriptLoaded =
      true;


    console.log(
      "CHAMA LIVE: page module loaded:",
      page
    );


    /* =====================================================
       STANDARD initPage()
    ===================================================== */

    if (
      typeof module.initPage ===
      "function"
    ) {

      await module.initPage();

      return;
    }


    /* =====================================================
       PAGE-SPECIFIC INITIALIZERS
    ===================================================== */

    const initializers = {

      "dashboard.html":
        "initDashboard",

      "members.html":
        "initMembers",

      "contributions.html":
        "initContributions",

      "expenses.html":
        "initExpenses",

      "meetings.html":
        "initMeetings",

      "reports.html":
        "initReports",

      "monthly-closing.html":
        "initMonthlyClosing",

      "group-management.html":
        "initGroupManagement"

    };


    const initializerName =
      initializers[page];


    if (
      initializerName &&
      typeof module[initializerName] ===
      "function"
    ) {

      await module[
        initializerName
      ]();

      return;
    }


    /* =====================================================
       GENERIC init()
    ===================================================== */

    if (
      typeof module.init ===
      "function"
    ) {

      await module.init();

      return;
    }


    console.warn(
      "CHAMA LIVE: no initializer exported by:",
      page
    );

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
        "Unable to load this page.";
    }

  }
}


/* =========================================================
   AUTHENTICATION
========================================================= */

async function initializeAuthentication() {

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
    "CHAMA LIVE: starting layout..."
  );


  /* 1. Mobile styles */

  injectMobileNavigationStyles();


  /* 2. Authentication */

  await initializeAuthentication();


  /* 3. Current member/group */

  await loadLayoutData();


  /* 4. Logout */

  setupLogout();


  /* 5. Mobile navigation */

  setupMobileNavigation();


  /* 6. Page JS */

  await loadCurrentPageScript();


  console.log(
    "CHAMA LIVE: layout initialized"
  );
}


/* =========================================================
   BOOT
========================================================= */

export async function boot() {

  if (bootStarted) {

    console.warn(
      "CHAMA LIVE: boot() already running"
    );

    return;
  }


  bootStarted = true;


  try {

    await initLayout();

  }
  catch (error) {

    console.error(
      "CHAMA LIVE: boot failed:",
      error
    );


    bootStarted = false;


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
   PUBLIC STATE
========================================================= */

export {
  currentMember,
  currentGroup
};


console.log(
  "CHAMA LIVE: layout ready — call boot() from HTML"
);
```
