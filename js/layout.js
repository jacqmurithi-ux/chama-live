```javascript
/* =========================================================
   CHAMA LIVE — GLOBAL LAYOUT
   CLEAN FINAL VERSION
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

  const parts =
    window.location.pathname.split("/");

  let page =
    parts[parts.length - 1];

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
    .forEach(function(element) {

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
    .forEach(function(element) {

      element.textContent = name;

    });

}


/* =========================================================
   MOBILE CSS
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

  style.textContent = [
    ".mobile-bottom-nav{display:none;}",

    "@media(max-width:650px){",

    ".sidebar{display:none!important;}",

    ".menu-toggle{display:none!important;}",

    ".layout{display:block!important;width:100%!important;}",

    ".main{",
    "width:100%!important;",
    "max-width:100%!important;",
    "margin:0!important;",
    "padding:16px 14px 96px 14px!important;",
    "}",

    ".topbar{",
    "width:100%;",
    "position:sticky;",
    "top:0;",
    "z-index:1000;",
    "}",

    ".mobile-bottom-nav{",
    "position:fixed;",
    "left:0;",
    "right:0;",
    "bottom:0;",
    "z-index:99999;",
    "display:grid;",
    "grid-template-columns:repeat(5,1fr);",
    "height:72px;",
    "padding:6px;",
    "background:rgba(255,255,255,.98);",
    "border-top:1px solid #e5e7eb;",
    "box-shadow:0 -5px 20px rgba(0,0,0,.08);",
    "}",

    ".mobile-nav-item{",
    "display:flex;",
    "flex-direction:column;",
    "align-items:center;",
    "justify-content:center;",
    "gap:3px;",
    "text-decoration:none;",
    "color:#64748b;",
    "border-radius:13px;",
    "}",

    ".mobile-nav-item.active{",
    "color:#0f766e;",
    "background:rgba(15,118,110,.09);",
    "}",

    ".mobile-nav-icon{",
    "display:flex;",
    "align-items:center;",
    "justify-content:center;",
    "width:30px;",
    "height:30px;",
    "font-size:21px;",
    "font-weight:700;",
    "}",

    ".mobile-nav-label{",
    "font-size:9px;",
    "line-height:1;",
    "font-weight:600;",
    "white-space:nowrap;",
    "}",

    ".mobile-nav-main .mobile-nav-icon{",
    "width:43px;",
    "height:43px;",
    "margin-top:-18px;",
    "border-radius:50%;",
    "background:#0f766e;",
    "color:white;",
    "border:4px solid white;",
    "font-size:25px;",
    "}",

    ".mobile-nav-main .mobile-nav-label{",
    "color:#0f766e;",
    "}",

    ".table-wrap{",
    "width:100%;",
    "max-width:100%;",
    "overflow-x:auto;",
    "-webkit-overflow-scrolling:touch;",
    "}",

    ".grid-2{",
    "grid-template-columns:1fr!important;",
    "}",

    ".grid-3{",
    "grid-template-columns:repeat(2,minmax(0,1fr));",
    "}",

    "}",

    "@media(max-width:390px){",

    ".mobile-bottom-nav{height:68px;}",

    ".mobile-nav-icon{",
    "width:27px;",
    "height:27px;",
    "font-size:19px;",
    "}",

    ".mobile-nav-label{font-size:8px;}",

    ".mobile-nav-main .mobile-nav-icon{",
    "width:39px;",
    "height:39px;",
    "font-size:22px;",
    "}",

    ".grid-3{",
    "grid-template-columns:1fr;",
    "}",

    "}"

  ].join("");

  document.head.appendChild(style);

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
    isMain
  ) {

    const link =
      document.createElement("a");

    link.href = href;

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

    nav.appendChild(link);

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


  document.body.appendChild(nav);


  const currentPage =
    getCurrentPage();


  nav
    .querySelectorAll(
      ".mobile-nav-item"
    )
    .forEach(function(item) {

      if (
        item.dataset.page ===
        currentPage
      ) {

        item.classList.add(
          "active"
        );

      }

    });

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
    async function() {

      const originalText =
        button.textContent;

      button.disabled =
        true;

      button.textContent =
        "Signing out...";


      try {

        const result =
          await supabase.auth.signOut();

        if (result.error) {
          throw result.error;
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
   LOAD PAGE SCRIPT
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
    "CHAMA LIVE: loading",
    script
  );


  try {

    const module =
      await import(script);


    let initializer = null;


    if (
      typeof module.initPage ===
      "function"
    ) {

      initializer =
        module.initPage;

    }
    else if (
      page === "dashboard.html" &&
      typeof module.initDashboard ===
      "function"
    ) {

      initializer =
        module.initDashboard;

    }
    else if (
      page === "members.html" &&
      typeof module.initMembers ===
      "function"
    ) {

      initializer =
        module.initMembers;

    }
    else if (
      page === "contributions.html" &&
      typeof module.initContributions ===
      "function"
    ) {

      initializer =
        module.initContributions;

    }
    else if (
      page === "expenses.html" &&
      typeof module.initExpenses ===
      "function"
    ) {

      initializer =
        module.initExpenses;

    }
    else if (
      page === "meetings.html" &&
      typeof module.initMeetings ===
      "function"
    ) {

      initializer =
        module.initMeetings;

    }
    else if (
      page === "reports.html" &&
      typeof module.initReports ===
      "function"
    ) {

      initializer =
        module.initReports;

    }
    else if (
      page === "monthly-closing.html" &&
      typeof module.initMonthlyClosing ===
      "function"
    ) {

      initializer =
        module.initMonthlyClosing;

    }
    else if (
      page === "group-management.html" &&
      typeof module.initGroupManagement ===
      "function"
    ) {

      initializer =
        module.initGroupManagement;

    }
    else if (
      typeof module.init ===
      "function"
    ) {

      initializer =
        module.init;

    }


    pageScriptLoaded =
      true;


    if (initializer) {

      await initializer();

      console.log(
        "CHAMA LIVE: page initialized",
        page
      );

    }
    else {

      console.warn(
        "CHAMA LIVE: no initializer exported by",
        page
      );

    }

  }
  catch (error) {

    pageScriptLoaded =
      false;

    console.error(
      "CHAMA LIVE: page script failed",
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


  injectMobileNavigationStyles();


  await initializeAuthentication();


  await loadLayoutData();


  setupLogout();


  setupMobileNavigation();


  await loadCurrentPageScript();


  console.log(
    "CHAMA LIVE: layout initialized"
  );

}


/* =========================================================
   PUBLIC BOOT
   THIS EXPORT IS REQUIRED BY ALL HTML FILES
========================================================= */

export async function boot() {

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
   OPTIONAL STATE EXPORTS
========================================================= */

export {
  currentMember,
  currentGroup
};


console.log(
  "CHAMA LIVE: layout.js ready — boot() exported"
);
```
