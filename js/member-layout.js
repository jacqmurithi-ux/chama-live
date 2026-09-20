/* =========================================================
   CHAMA LIVE — MEMBER PORTAL LAYOUT

   RESPONSIBILITIES
   ---------------------------------------------------------
   - Resolve authenticated member/group context
   - Protect the Member Portal
   - Prevent admin accounts from entering Member Portal
   - Render Member Portal navigation
   - Render responsive mobile navigation
   - Render canonical Logout action
   - Load the current Member Portal page feature

   SECURITY CONTRACT
   ---------------------------------------------------------
   Authentication/context comes from auth.js.

   This file does NOT:
     - create users
     - modify members
     - modify groups
     - modify financial records
     - modify subscriptions
     - bypass RLS
     - accept group_id from the URL
     - perform database mutations

   Logout uses the canonical signOut() from auth.js.
========================================================= */

import {
  getMyApplicationContext,
  signOut
} from "./auth.js";


/* =========================================================
   ADMIN ROLES
========================================================= */

const ADMIN_ROLES = new Set([
  "admin",
  "chairperson",
  "secretary",
  "treasurer"
]);


/* =========================================================
   MEMBER PORTAL PAGES
========================================================= */

const MEMBER_PAGES = new Set([
  "member-dashboard.html",
  "member-contributions.html",
  "member-activities.html",
  "member-assets.html",
  "member-getting-started.html"
]);


/* =========================================================
   PAGE FEATURE SCRIPTS
========================================================= */

const PAGE_SCRIPTS = {

  "member-dashboard.html": [
    "./member-dashboard.js",
    "initMemberDashboard"
  ],

  "member-contributions.html": [
    "./member-contributions.js",
    "initMemberContributions"
  ],

  "member-activities.html": [
    "./member-activities.js",
    "initMemberActivities"
  ],

  "member-assets.html": [
    "./member-assets.js",
    "initMemberAssets"
  ]

};


/* =========================================================
   STATE
========================================================= */

let bootStarted = false;

let context = null;


/* =========================================================
   CURRENT PAGE
========================================================= */

function getCurrentPage() {

  return (
    window.location.pathname
      .split("/")
      .pop()
      .toLowerCase() ||
    "member-dashboard.html"
  );

}


/* =========================================================
   ADMIN ACCOUNT CHECK
========================================================= */

function isAdminAccount() {

  return (
    context?.isOwner === true ||
    ADMIN_ROLES.has(
      String(
        context?.role || ""
      )
        .trim()
        .toLowerCase()
    )
  );

}


/* =========================================================
   NAV LINK CREATION
========================================================= */

function createNavLink(
  href,
  label
) {

  const link =
    document.createElement("a");


  link.href =
    href;

  link.textContent =
    label;


  if (
    getCurrentPage() ===
    href
  ) {

    link.classList.add(
      "active"
    );

    link.setAttribute(
      "aria-current",
      "page"
    );

  }


  return link;

}


/* =========================================================
   MEMBER NAVIGATION
========================================================= */

const MEMBER_NAVIGATION = [

  [
    "member-dashboard.html",
    "Home"
  ],

  [
    "member-contributions.html",
    "My Contributions"
  ],

  [
    "member-activities.html",
    "Activities"
  ],

  [
    "member-assets.html",
    "Assets"
  ],

  [
    "member-getting-started.html",
    "Getting Started"
  ]

];


/* =========================================================
   SHARED PORTAL STYLES
========================================================= */

function injectStyles() {

  if (
    document.getElementById(
      "chama-member-layout"
    )
  ) {

    return;

  }


  const style =
    document.createElement("style");


  style.id =
    "chama-member-layout";


  style.textContent = `

    /* =====================================================
       DESKTOP MEMBER NAVIGATION
    ====================================================== */

    .chama-member-nav {

      display:
        flex;

      align-items:
        center;

      gap:
        4px;

      margin-left:
        auto;

      flex-wrap:
        wrap;

    }


    .chama-member-nav a {

      min-height:
        42px;

      padding:
        9px 13px;

      display:
        flex;

      align-items:
        center;

      border-radius:
        10px;

      text-decoration:
        none;

      color:
        #344054;

      font-size:
        13px;

      font-weight:
        700;

      box-sizing:
        border-box;

      transition:
        background .18s ease,
        color .18s ease,
        transform .18s ease;

    }


    .chama-member-nav a:hover {

      background:
        #f0fdfa;

      color:
        #0f766e;

      transform:
        translateY(-1px);

    }


    .chama-member-nav a.active {

      background:
        #ecfdf5;

      color:
        #0f766e;

    }


    /* =====================================================
       LOGOUT
    ====================================================== */

    .chama-member-logout {

      min-height:
        40px;

      padding:
        8px 13px;

      display:
        inline-flex;

      align-items:
        center;

      justify-content:
        center;

      gap:
        6px;

      margin-left:
        8px;

      border:
        1px solid #dfe4ea;

      border-radius:
        10px;

      background:
        #ffffff;

      color:
        #475467;

      font-family:
        inherit;

      font-size:
        12px;

      font-weight:
        750;

      cursor:
        pointer;

      box-sizing:
        border-box;

      transition:
        background .18s ease,
        border-color .18s ease,
        color .18s ease,
        transform .18s ease,
        box-shadow .18s ease;

    }


    .chama-member-logout:hover {

      background:
        #fff7f7;

      border-color:
        #fecaca;

      color:
        #b91c1c;

      transform:
        translateY(-1px);

      box-shadow:
        0 5px 15px rgba(185,28,28,.08);

    }


    .chama-member-logout:focus-visible {

      outline:
        3px solid
        rgba(15,118,110,.25);

      outline-offset:
        2px;

    }


    .chama-member-logout:disabled {

      opacity:
        .65;

      cursor:
        wait;

      transform:
        none;

    }


    /* =====================================================
       MOBILE ELEMENTS
    ====================================================== */

    .chama-member-menu,
    .chama-member-back,
    .chama-member-bottom {

      display:
        none;

    }


    /* =====================================================
       MOBILE
    ====================================================== */

    @media (max-width: 800px) {


      .chama-member-nav {

        display:
          none;

      }


      /* ---------------------------------------------------
         BACKDROP
      ---------------------------------------------------- */

      .chama-member-back {

        position:
          fixed;

        inset:
          0;

        background:
          rgba(15,23,42,.42);

        z-index:
          20000;

      }


      .chama-member-back.open {

        display:
          block;

      }


      /* ---------------------------------------------------
         MOBILE MENU
      ---------------------------------------------------- */

      .chama-member-menu {

        position:
          fixed;

        top:
          64px;

        left:
          10px;

        right:
          10px;

        max-height:
          calc(100vh - 145px);

        overflow-y:
          auto;

        background:
          #ffffff;

        border:
          1px solid #e5e7eb;

        border-radius:
          18px;

        z-index:
          20001;

        box-shadow:
          0 22px 55px
          rgba(16,24,40,.20);

      }


      .chama-member-menu.open {

        display:
          block;

      }


      /* ---------------------------------------------------
         MOBILE HEADER
      ---------------------------------------------------- */

      .chama-member-head {

        padding:
          16px;

        background:
          linear-gradient(
            135deg,
            #effaf8,
            #ffffff
          );

        border-bottom:
          1px solid #edf0f4;

        border-radius:
          18px 18px 0 0;

      }


      .chama-member-head strong {

        display:
          block;

        color:
          #101828;

        font-size:
          15px;

        font-weight:
          800;

      }


      .chama-member-head span {

        display:
          block;

        color:
          #667085;

        font-size:
          12px;

        margin-top:
          3px;

      }


      /* ---------------------------------------------------
         MOBILE MENU LINKS
      ---------------------------------------------------- */

      .chama-member-menu a {

        display:
          flex;

        align-items:
          center;

        min-height:
          48px;

        margin:
          3px 8px;

        padding:
          10px 14px;

        border-radius:
          10px;

        color:
          #344054;

        text-decoration:
          none;

        font-size:
          13px;

        font-weight:
          700;

        box-sizing:
          border-box;

      }


      .chama-member-menu a:hover {

        background:
          #f8fafc;

      }


      .chama-member-menu a.active {

        background:
          #ecfdf5;

        color:
          #0f766e;

      }


      /* ---------------------------------------------------
         MOBILE LOGOUT
      ---------------------------------------------------- */

      .chama-member-mobile-logout {

        width:
          calc(100% - 16px);

        min-height:
          48px;

        margin:
          8px;

        padding:
          10px 14px;

        display:
          flex;

        align-items:
          center;

        justify-content:
          flex-start;

        border:
          1px solid #fee2e2;

        border-radius:
          10px;

        background:
          #fffafa;

        color:
          #b91c1c;

        font-family:
          inherit;

        font-size:
          13px;

        font-weight:
          750;

        cursor:
          pointer;

      }


      .chama-member-mobile-logout:disabled {

        opacity:
          .65;

        cursor:
          wait;

      }


      /* ---------------------------------------------------
         MOBILE MENU BUTTON
      ---------------------------------------------------- */

      .chama-member-menu-toggle {

        display:
          inline-flex;

        align-items:
          center;

        justify-content:
          center;

        width:
          42px;

        height:
          42px;

        margin-right:
          8px;

        border:
          1px solid #dfe4ea;

        border-radius:
          11px;

        background:
          #ffffff;

        color:
          #344054;

        font-size:
          20px;

        line-height:
          1;

        cursor:
          pointer;

      }


      .chama-member-menu-toggle:hover {

        background:
          #f8fafc;

      }


      .chama-member-menu-toggle:focus-visible {

        outline:
          3px solid
          rgba(15,118,110,.25);

        outline-offset:
          2px;

      }


      /* ---------------------------------------------------
         MOBILE BOTTOM NAVIGATION
      ---------------------------------------------------- */

      .chama-member-bottom {

        position:
          fixed;

        left:
          0;

        right:
          0;

        bottom:
          0;

        height:
          70px;

        display:
          grid;

        grid-template-columns:
          repeat(5, 1fr);

        gap:
          4px;

        padding:
          6px 6px
          env(safe-area-inset-bottom);

        background:
          rgba(255,255,255,.98);

        border-top:
          1px solid #e5e7eb;

        z-index:
          15000;

        box-sizing:
          border-box;

        box-shadow:
          0 -8px 25px
          rgba(16,24,40,.06);

      }


      .chama-member-bottom a {

        display:
          flex;

        align-items:
          center;

        justify-content:
          center;

        min-width:
          0;

        border-radius:
          11px;

        color:
          #64748b;

        text-decoration:
          none;

        font-size:
          10px;

        font-weight:
          700;

        text-align:
          center;

      }


      .chama-member-bottom a.active {

        color:
          #0f766e;

        background:
          #ecfdf5;

      }


      .chama-member-bottom a:focus-visible {

        outline:
          2px solid
          rgba(15,118,110,.35);

        outline-offset:
          -2px;

      }


      /* ---------------------------------------------------
         PAGE SPACE FOR BOTTOM NAV
      ---------------------------------------------------- */

      .main {

        padding-bottom:
          95px !important;

      }


      .member-dashboard {

        padding-bottom:
          105px;

      }

    }


    /* =====================================================
       VERY SMALL PHONES
    ====================================================== */

    @media (max-width: 380px) {

      .chama-member-bottom {

        height:
          66px;

      }


      .chama-member-bottom a {

        font-size:
          9px;

      }


      .chama-member-menu-toggle {

        width:
          39px;

        height:
          39px;

      }

    }


    /* =====================================================
       REDUCED MOTION
    ====================================================== */

    @media (prefers-reduced-motion: reduce) {

      .chama-member-nav a,
      .chama-member-logout,
      .chama-member-menu-toggle {

        transition:
          none;

      }

    }

  `;


  document.head.appendChild(
    style
  );

}


/* =========================================================
   OPEN MOBILE MENU
========================================================= */

function openMemberMobileMenu() {

  const menu =
    document.getElementById(
      "chamaMemberMenu"
    );


  const backdrop =
    document.getElementById(
      "chamaMemberBack"
    );


  const button =
    document.querySelector(
      ".chama-member-menu-toggle"
    );


  menu?.classList.add(
    "open"
  );


  backdrop?.classList.add(
    "open"
  );


  button?.setAttribute(
    "aria-expanded",
    "true"
  );


  button?.setAttribute(
    "aria-label",
    "Close menu"
  );

}


/* =========================================================
   CLOSE MOBILE MENU
========================================================= */

function closeMemberMobileMenu() {

  const menu =
    document.getElementById(
      "chamaMemberMenu"
    );


  const backdrop =
    document.getElementById(
      "chamaMemberBack"
    );


  const button =
    document.querySelector(
      ".chama-member-menu-toggle"
    );


  menu?.classList.remove(
    "open"
  );


  backdrop?.classList.remove(
    "open"
  );


  button?.setAttribute(
    "aria-expanded",
    "false"
  );


  button?.setAttribute(
    "aria-label",
    "Open menu"
  );

}


/* =========================================================
   CANONICAL LOGOUT
   ---------------------------------------------------------
   Uses auth.js signOut().
========================================================= */

async function handleMemberLogout(
  button
) {

  if (!button) {
    return;
  }


  if (
    button.disabled
  ) {
    return;
  }


  button.disabled =
    true;


  const originalText =
    button.textContent;


  button.textContent =
    "Signing out…";


  try {

    await signOut();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: Member Portal sign out failed:",
      error
    );


    button.disabled =
      false;


    button.textContent =
      originalText ||
      "Logout";


    /*
     * The canonical auth layer owns redirect behaviour.
     * If signOut() throws, remain on the page and allow
     * the user to try again.
     */

  }

}


/* =========================================================
   CREATE LOGOUT BUTTON
========================================================= */

function createLogoutButton(
  className
) {

  const button =
    document.createElement(
      "button"
    );


  button.type =
    "button";


  button.className =
    className ||
    "chama-member-logout";


  button.textContent =
    "Logout";


  button.setAttribute(
    "aria-label",
    "Sign out of CHAMA LIVE"
  );


  button.addEventListener(
    "click",
    () => {
      handleMemberLogout(
        button
      );
    }
  );


  return button;

}


/* =========================================================
   DESKTOP LOGOUT
========================================================= */

function renderDesktopLogout() {

  if (
    document.getElementById(
      "chamaMemberLogout"
    )
  ) {

    return;

  }


  const button =
    createLogoutButton(
      "chama-member-logout"
    );


  button.id =
    "chamaMemberLogout";


  /*
   * Prefer the topbar's action area if one already exists.
   */

  const existingActions =
    document.querySelector(
      ".topbar-actions"
    );


  if (existingActions) {

    existingActions.appendChild(
      button
    );

    return;

  }


  /*
   * Otherwise append it to the topbar.
   */

  const topbar =
    document.querySelector(
      ".topbar"
    );


  if (topbar) {

    topbar.appendChild(
      button
    );

    return;

  }


  /*
   * Final fallback: place it beside the member nav.
   */

  const memberNav =
    document.querySelector(
      ".chama-member-nav"
    );


  if (memberNav) {

    memberNav.parentElement?.appendChild(
      button
    );

  }

}


/* =========================================================
   MOBILE LOGOUT
========================================================= */

function renderMobileLogout(
  menu
) {

  if (!menu) {
    return;
  }


  if (
    menu.querySelector(
      ".chama-member-mobile-logout"
    )
  ) {

    return;

  }


  const divider =
    document.createElement(
      "div"
    );


  divider.style.height =
    "1px";

  divider.style.background =
    "#edf0f4";

  divider.style.margin =
    "7px 8px";


  menu.appendChild(
    divider
  );


  const button =
    createLogoutButton(
      "chama-member-mobile-logout"
    );


  menu.appendChild(
    button
  );

}


/* =========================================================
   DESKTOP MEMBER NAVIGATION
========================================================= */

function renderDesktopNavigation() {

  if (
    document.querySelector(
      ".chama-member-nav"
    )
  ) {

    renderDesktopLogout();

    return;

  }


  const nav =
    document.createElement(
      "nav"
    );


  nav.className =
    "chama-member-nav";


  nav.setAttribute(
    "aria-label",
    "Member navigation"
  );


  for (
    const [
      href,
      label
    ] of MEMBER_NAVIGATION
  ) {

    nav.appendChild(
      createNavLink(
        href,
        label
      )
    );

  }


  const topNav =
    document.querySelector(
      ".topbar .top-nav"
    ) ||
    document.querySelector(
      ".top-nav"
    );


  if (topNav) {

    const memberHrefs =
      new Set(
        MEMBER_NAVIGATION.map(
          ([href]) => href
        )
      );


    topNav
      .querySelectorAll(
        "a[href]"
      )
      .forEach(
        (link) => {

          const href =
            link
              .getAttribute(
                "href"
              )
              ?.split("#")[0]
              .split("?")[0]
              .toLowerCase();


          if (
            memberHrefs.has(
              href
            )
          ) {

            link.remove();

          }

        }
      );


    topNav.appendChild(
      nav
    );

  }

  else {

    const topbar =
      document.querySelector(
        ".topbar"
      );


    if (topbar) {

      topbar.appendChild(
        nav
      );

    }

  }


  renderDesktopLogout();

}


/* =========================================================
   MOBILE MEMBER NAVIGATION
========================================================= */

function renderMobileNavigation() {

  if (
    document.getElementById(
      "chamaMemberMenu"
    )
  ) {

    renderMobileLogout(
      document.getElementById(
        "chamaMemberMenu"
      )
    );

    return;

  }


  /* -------------------------------------------------------
     BACKDROP
  -------------------------------------------------------- */

  const backdrop =
    document.createElement(
      "div"
    );


  backdrop.id =
    "chamaMemberBack";


  backdrop.className =
    "chama-member-back";


  /* -------------------------------------------------------
     MENU
  -------------------------------------------------------- */

  const menu =
    document.createElement(
      "aside"
    );


  menu.id =
    "chamaMemberMenu";


  menu.className =
    "chama-member-menu";


  menu.setAttribute(
    "aria-label",
    "Member Portal menu"
  );


  /* -------------------------------------------------------
     MENU HEADER
  -------------------------------------------------------- */

  const header =
    document.createElement(
      "div"
    );


  header.className =
    "chama-member-head";


  const groupName =
    document.createElement(
      "strong"
    );


  groupName.textContent =
    context?.group?.name ||
    "CHAMA";


  const memberName =
    document.createElement(
      "span"
    );


  memberName.textContent =
    context?.member?.name ||
    "Member";


  header.appendChild(
    groupName
  );


  header.appendChild(
    memberName
  );


  menu.appendChild(
    header
  );


  /* -------------------------------------------------------
     MENU LINKS
  -------------------------------------------------------- */

  for (
    const [
      href,
      label
    ] of MEMBER_NAVIGATION
  ) {

    menu.appendChild(
      createNavLink(
        href,
        label
      )
    );

  }


  /* -------------------------------------------------------
     LOGOUT
  -------------------------------------------------------- */

  renderMobileLogout(
    menu
  );


  /* -------------------------------------------------------
     ATTACH MENU
  -------------------------------------------------------- */

  document.body.appendChild(
    backdrop
  );


  document.body.appendChild(
    menu
  );


  /* -------------------------------------------------------
     MENU TOGGLE
  -------------------------------------------------------- */

  let button =
    document.querySelector(
      ".menu-toggle"
    );


  /*
   * If the page already has a menu-toggle, reuse it.
   */

  if (button) {

    button.classList.add(
      "chama-member-menu-toggle"
    );

  }


  /*
   * Otherwise create one.
   */

  if (!button) {

    button =
      document.createElement(
        "button"
      );


    button.type =
      "button";


    button.className =
      "menu-toggle chama-member-menu-toggle";


    button.textContent =
      "☰";


    button.setAttribute(
      "aria-label",
      "Open menu"
    );


    button.setAttribute(
      "aria-expanded",
      "false"
    );


    const topbar =
      document.querySelector(
        ".topbar"
      );


    if (topbar) {

      topbar.prepend(
        button
      );

    }

  }


  if (
    !button.hasAttribute(
      "aria-expanded"
    )
  ) {

    button.setAttribute(
      "aria-expanded",
      "false"
    );

  }


  /* -------------------------------------------------------
     TOGGLE EVENT
  -------------------------------------------------------- */

  button.addEventListener(
    "click",
    () => {

      const isOpen =
        menu.classList.contains(
          "open"
        );


      if (isOpen) {

        closeMemberMobileMenu();

      }

      else {

        openMemberMobileMenu();

      }

    }
  );


  /* -------------------------------------------------------
     BACKDROP EVENT
  -------------------------------------------------------- */

  backdrop.addEventListener(
    "click",
    closeMemberMobileMenu
  );


  /* -------------------------------------------------------
     LINK EVENTS
  -------------------------------------------------------- */

  menu
    .querySelectorAll(
      "a"
    )
    .forEach(
      (link) => {

        link.addEventListener(
          "click",
          closeMemberMobileMenu
        );

      }
    );

}


/* =========================================================
   MOBILE BOTTOM NAVIGATION
========================================================= */

function renderMobileBottomNavigation() {

  if (
    document.querySelector(
      ".chama-member-bottom"
    )
  ) {

    return;

  }


  const nav =
    document.createElement(
      "nav"
    );


  nav.className =
    "chama-member-bottom";


  nav.setAttribute(
    "aria-label",
    "Primary member navigation"
  );


  const items = [

    [
      "member-dashboard.html",
      "Home"
    ],

    [
      "member-contributions.html",
      "Money"
    ],

    [
      "member-activities.html",
      "Activities"
    ],

    [
      "member-assets.html",
      "Assets"
    ],

    [
      "member-getting-started.html",
      "Guide"
    ]

  ];


  for (
    const [
      href,
      label
    ] of items
  ) {

    const link =
      document.createElement(
        "a"
      );


    link.href =
      href;


    link.textContent =
      label;


    if (
      href ===
      getCurrentPage()
    ) {

      link.classList.add(
        "active"
      );

      link.setAttribute(
        "aria-current",
        "page"
      );

    }


    nav.appendChild(
      link
    );

  }


  document.body.appendChild(
    nav
  );

}


/* =========================================================
   PAGE FEATURE LOADER
========================================================= */

async function loadCurrentPageFeature() {

  const page =
    getCurrentPage();


  const entry =
    PAGE_SCRIPTS[page];


  if (!entry) {

    return;

  }


  const module =
    await import(
      entry[0]
    );


  const initializer =
    module?.[entry[1]] ||
    module?.initPage ||
    module?.init;


  if (
    typeof initializer !==
    "function"
  ) {

    throw new Error(
      `No initializer exported for ${page}.`
    );

  }


  await initializer();

}


/* =========================================================
   BOOT
========================================================= */

export async function boot() {

  if (bootStarted) {

    return;

  }


  bootStarted =
    true;


  try {

    /* -----------------------------------------------------
       RESOLVE AUTHENTICATED CONTEXT
    ------------------------------------------------------ */

    context =
      await getMyApplicationContext();


    if (
      !context?.user ||
      !context?.member?.group_id
    ) {

      throw new Error(
        "Your account is not linked to a group."
      );

    }


    /* -----------------------------------------------------
       NORMALIZE ROLE
    ------------------------------------------------------ */

    context.role =
      String(
        context.role || ""
      )
        .trim()
        .toLowerCase();


    /* -----------------------------------------------------
       ADMIN / OWNER PROTECTION
    ------------------------------------------------------ */

    if (
      isAdminAccount()
    ) {

      window.location.replace(
        "dashboard.html"
      );

      return;

    }


    /* -----------------------------------------------------
       MEMBER ROLE PROTECTION
    ------------------------------------------------------ */

    if (
      context.role !==
      "member"
    ) {

      throw new Error(
        "Your account does not have a valid Member Portal role."
      );

    }


    /* -----------------------------------------------------
       PAGE PROTECTION
    ------------------------------------------------------ */

    const page =
      getCurrentPage();


    if (
      !MEMBER_PAGES.has(
        page
      )
    ) {

      window.location.replace(
        "member-dashboard.html"
      );

      return;

    }


    /* -----------------------------------------------------
       PREVENT PAGE FLASH
    ------------------------------------------------------ */

    window.__CHAMA_LIVE_LAYOUT_LOADING__ =
      true;


    /* -----------------------------------------------------
       VISUAL LAYOUT
    ------------------------------------------------------ */

    injectStyles();


    /* -----------------------------------------------------
       NAVIGATION
    ------------------------------------------------------ */

    renderDesktopNavigation();

    renderMobileNavigation();

    renderMobileBottomNavigation();


    /* -----------------------------------------------------
       PAGE FEATURE
    ------------------------------------------------------ */

    await loadCurrentPageFeature();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE Member Portal boot failed:",
      error
    );


    const errorBox =
      document.getElementById(
        "error"
      );


    if (errorBox) {

      errorBox.hidden =
        false;


      errorBox.textContent =
        error?.message ||
        "Unable to load the Member Portal.";

    }

  }

  finally {

    delete window.__CHAMA_LIVE_LAYOUT_LOADING__;

  }

}


/* =========================================================
   LAYOUT STATE
========================================================= */

export function getLayoutState() {

  return {

    ...context,

    portal:
      "member"

  };

}
