/* =========================================================
   CHAMA LIVE — ADMIN PORTAL LAYOUT

   RESPONSIBILITIES
   ---------------------------------------------------------
   - Admin authentication / authorization
   - Admin page allowlist
   - Desktop navigation
   - Mobile navigation
   - Mobile bottom navigation
   - Admin logout
   - Current-page module boot

   IMPORTANT
   ---------------------------------------------------------
   This module does NOT perform database mutations.

   It does NOT:
   - INSERT
   - UPDATE
   - DELETE
   - ALTER
   - CREATE
   - change RLS
   - change privileges
   - replace database functions

   PAGE MODULES
   ---------------------------------------------------------
   Each page remains responsible for its own data/rendering.
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
   ADMIN PAGE ALLOWLIST
========================================================= */

const ADMIN_PAGES = new Set([
  "dashboard.html",
  "members.html",
  "contributions.html",
  "expenses.html",
  "meetings.html",
  "reports.html",
  "monthly-closing.html",
  "group-management.html",
  "assets.html",
  "plans-activities.html",
  "support-welfare.html",
  "milestones.html",
  "data-migration.html"
]);


/* =========================================================
   PAGE MODULES
========================================================= */

const PAGE_SCRIPTS = {

  "dashboard.html": [
    "./dashboard.js",
    "initDashboard"
  ],

  "members.html": [
    "./members.js",
    "init"
  ],

  "contributions.html": [
    "./contributions.js",
    "initContributions"
  ],

  "expenses.html": [
    "./expenses.js",
    "initPage"
  ],

  "meetings.html": [
    "./meetings.js",
    "initPage"
  ],

  "reports.html": [
    "./reports.js",
    "initPage"
  ],

  "monthly-closing.html": [
    "./monthly-closing.js",
    "initPage"
  ],

  "group-management.html": [
    "./group-management.js",
    "initGroupManagement"
  ],

  "plans-activities.html": [
    "./plans-activities.js",
    "initPage"
  ],

  "support-welfare.html": [
    "./support-welfare.js",
    "initPage"
  ],

  "milestones.html": [
    "./milestones.js",
    "initPage"
  ]

};


/* =========================================================
   RUNTIME STATE
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
    "dashboard.html"
  );

}


/* =========================================================
   ADMIN AUTHORIZATION
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
   NAVIGATION LINK
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
   ADMIN NAVIGATION GROUPS
========================================================= */

const NAVIGATION_GROUPS = [

  [
    "Home",
    [
      [
        "dashboard.html",
        "Dashboard"
      ]
    ]
  ],

  [
    "Members",
    [
      [
        "members.html",
        "Members"
      ]
    ]
  ],

  [
    "Finance",
    [
      [
        "contributions.html",
        "Contributions"
      ],
      [
        "expenses.html",
        "Expenses"
      ],
      [
        "reports.html",
        "Reports"
      ],
      [
        "monthly-closing.html",
        "Monthly Closing"
      ]
    ]
  ],

  [
    "Group",
    [
      [
        "meetings.html",
        "Meetings"
      ],
      [
        "plans-activities.html",
        "Plans & Activities"
      ],
      [
        "milestones.html",
        "Milestones"
      ],
      [
        "assets.html",
        "Assets"
      ],
      [
        "support-welfare.html",
        "Support & Welfare"
      ]
    ]
  ],

  [
    "Management",
    [
      [
        "group-management.html",
        "Group Management"
      ],
      [
        "data-migration.html",
        "Data Migration"
      ]
    ]
  ]

];


/* =========================================================
   INJECT LAYOUT STYLES
========================================================= */

function injectStyles() {

  if (
    document.getElementById(
      "chama-admin-layout"
    )
  ) {
    return;
  }


  const style =
    document.createElement("style");

  style.id =
    "chama-admin-layout";


  style.textContent = `

    .chama-admin-nav {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
      min-width: 0;
    }

    .chama-admin-nav a,
    .chama-admin-nav summary {
      min-height: 40px;
      padding: 8px 10px;
      display: flex;
      align-items: center;
      border-radius: 10px;
      text-decoration: none;
      color: #344054;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      box-sizing: border-box;
      transition:
        background-color 0.15s ease,
        color 0.15s ease;
    }

    .chama-admin-nav a:hover,
    .chama-admin-nav a.active,
    .chama-admin-nav summary:hover {
      background: #ecfdf5;
      color: #0f766e;
    }

    .chama-admin-group {
      position: relative;
    }

    .chama-admin-group summary {
      list-style: none;
    }

    .chama-admin-group summary::-webkit-details-marker {
      display: none;
    }

    .chama-admin-group-panel {
      position: absolute;
      top: 46px;
      left: 0;
      min-width: 220px;
      max-width: 280px;
      padding: 6px;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      box-shadow:
        0 18px 45px rgba(16, 24, 40, 0.14);
      z-index: 20000;
    }

    .chama-admin-group-panel a {
      width: 100%;
    }

    .chama-mobile-menu,
    .chama-mobile-backdrop,
    .chama-admin-bottom {
      display: none;
    }

    .menu-toggle {
      display: none;
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      background: #ffffff;
      color: #344054;
      font-size: 19px;
      line-height: 1;
      cursor: pointer;
      box-sizing: border-box;
    }

    .menu-toggle:hover {
      background: #f8fafc;
    }

    .menu-toggle:focus-visible {
      outline:
        3px solid rgba(15, 118, 110, 0.18);
      outline-offset: 2px;
    }

    @media (max-width: 800px) {

      .chama-admin-nav {
        display: none;
      }

      .menu-toggle {
        display: inline-flex;
      }

      .chama-mobile-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.38);
        z-index: 20000;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.18s ease;
      }

      .chama-mobile-backdrop.open {
        display: block;
        opacity: 1;
        pointer-events: auto;
      }

      .chama-mobile-menu {
        position: fixed;
        top: 66px;
        left: 10px;
        right: 10px;
        max-height: calc(100vh - 145px);
        overflow-y: auto;
        overscroll-behavior: contain;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        z-index: 20001;
        box-shadow:
          0 22px 55px rgba(16, 24, 40, 0.18);
        opacity: 0;
        transform: translateY(-6px);
        pointer-events: none;
        transition:
          opacity 0.18s ease,
          transform 0.18s ease;
      }

      .chama-mobile-menu.open {
        display: block;
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }

      .chama-mobile-head {
        padding: 15px 16px;
        background: #f8fafc;
        border-bottom: 1px solid #edf0f4;
        border-radius: 17px 17px 0 0;
      }

      .chama-mobile-head strong {
        display: block;
        color: #101828;
        font-size: 14px;
        line-height: 1.35;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .chama-mobile-head span {
        display: block;
        color: #667085;
        font-size: 11px;
        margin-top: 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .chama-mobile-section {
        padding: 11px 10px 2px;
      }

      .chama-mobile-section:last-child {
        padding-bottom: 11px;
      }

      .chama-mobile-section h2 {
        margin: 0 7px 5px;
        color: #667085;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .chama-mobile-menu a {
        display: flex;
        align-items: center;
        min-height: 45px;
        padding: 9px 12px;
        border-radius: 10px;
        color: #344054;
        text-decoration: none;
        font-size: 13px;
        font-weight: 700;
        box-sizing: border-box;
      }

      .chama-mobile-menu a:hover {
        background: #f8fafc;
      }

      .chama-mobile-menu a.active {
        background: #ecfdf5;
        color: #0f766e;
      }

      .chama-admin-bottom {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        height: 70px;
        display: grid;
        grid-template-columns:
          repeat(5, minmax(0, 1fr));
        gap: 4px;
        padding:
          6px
          6px
          env(safe-area-inset-bottom);
        background: rgba(255, 255, 255, 0.98);
        border-top: 1px solid #e5e7eb;
        z-index: 15000;
        box-sizing: border-box;
        backdrop-filter: blur(10px);
      }

      .chama-admin-bottom a {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        min-height: 42px;
        padding: 5px 3px;
        border-radius: 11px;
        color: #64748b;
        text-decoration: none;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.15;
        text-align: center;
        white-space: nowrap;
      }

      .chama-admin-bottom a:hover {
        background: #f8fafc;
      }

      .chama-admin-bottom a.active {
        color: #0f766e;
        background: #ecfdf5;
      }

      .main {
        padding-bottom: 95px !important;
      }
    }

    @media (max-width: 520px) {

      .chama-mobile-menu {
        left: 8px;
        right: 8px;
        border-radius: 16px;
      }

      .chama-mobile-head {
        border-radius: 15px 15px 0 0;
      }

      .chama-admin-bottom {
        height: 68px;
      }

      .chama-admin-bottom a {
        font-size: 9px;
      }
    }

    @media (max-width: 360px) {

      .chama-admin-bottom {
        gap: 2px;
        padding-left: 4px;
        padding-right: 4px;
      }

      .chama-admin-bottom a {
        font-size: 8px;
      }

      .chama-mobile-menu a {
        min-height: 43px;
        font-size: 12px;
      }
    }

    @media (prefers-reduced-motion: reduce) {

      .chama-mobile-menu,
      .chama-mobile-backdrop {
        transition: none;
      }

    }

  `;


  document.head.appendChild(
    style
  );

}


/* =========================================================
   DESKTOP NAVIGATION
========================================================= */

function renderDesktopNavigation() {

  const target =
    document.querySelector(
      ".topbar .top-nav"
    );


  if (!target) {
    return;
  }


  /*
   * The top-nav element is the dedicated Admin navigation
   * mount point.
   *
   * Clear any legacy/static content first so an old
   * "Pages" link cannot remain above the current navigation.
   */

  target.replaceChildren();


  const nav =
    document.createElement("nav");

  nav.className =
    "chama-admin-nav";

  nav.setAttribute(
    "aria-label",
    "Admin navigation"
  );


  for (
    const [
      title,
      items
    ]
    of NAVIGATION_GROUPS
  ) {

    if (
      items.length === 1
    ) {

      nav.appendChild(
        createNavLink(
          items[0][0],
          items[0][1]
        )
      );

      continue;

    }


    const details =
      document.createElement("details");

    details.className =
      "chama-admin-group";


    const summary =
      document.createElement("summary");

    summary.textContent =
      title;


    details.appendChild(
      summary
    );


    const panel =
      document.createElement("div");

    panel.className =
      "chama-admin-group-panel";


    for (
      const item
      of items
    ) {

      panel.appendChild(
        createNavLink(
          item[0],
          item[1]
        )
      );

    }


    details.appendChild(
      panel
    );

    nav.appendChild(
      details
    );

  }


  /*
   * Billing remains a separate account destination.
   */

  nav.appendChild(
    createNavLink(
      "billing.html",
      "Billing"
    )
  );


  target.appendChild(
    nav
  );

}


/* =========================================================
   ADMIN LOGOUT
========================================================= */

function bindAdminLogout() {

  const logoutButton =
    document.getElementById(
      "logout"
    );


  if (!logoutButton) {
    return;
  }


  if (
    logoutButton.dataset.adminLogoutBound ===
    "true"
  ) {

    return;

  }


  logoutButton.dataset.adminLogoutBound =
    "true";


  logoutButton.addEventListener(
    "click",
    async () => {

      if (
        logoutButton.disabled
      ) {

        return;

      }


      logoutButton.disabled =
        true;


      const originalText =
        logoutButton.textContent;


      logoutButton.textContent =
        "Signing out…";


      try {

        await signOut();

      }

      catch (error) {

        console.error(
          "CHAMA LIVE: Admin logout failed:",
          error
        );


        logoutButton.disabled =
          false;


        logoutButton.textContent =
          originalText ||
          "Sign out";


        const errorBox =
          document.getElementById(
            "error"
          );


        if (errorBox) {

          errorBox.hidden =
            false;

          errorBox.textContent =
            error?.message ||
            "Unable to sign out.";

        }

      }

    }
  );

}


/* =========================================================
   OPEN MOBILE MENU
========================================================= */

function openAdminMobileMenu() {

  const menu =
    document.getElementById(
      "chamaAdminMenu"
    );

  const backdrop =
    document.getElementById(
      "chamaAdminBack"
    );

  const button =
    document.querySelector(
      ".menu-toggle"
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

  document.body.classList.add(
    "chama-admin-menu-open"
  );

}


/* =========================================================
   CLOSE MOBILE MENU
========================================================= */

function closeAdminMobileMenu() {

  const menu =
    document.getElementById(
      "chamaAdminMenu"
    );

  const backdrop =
    document.getElementById(
      "chamaAdminBack"
    );

  const button =
    document.querySelector(
      ".menu-toggle"
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

  document.body.classList.remove(
    "chama-admin-menu-open"
  );

}


/* =========================================================
   MOBILE NAVIGATION
========================================================= */

function renderMobileNavigation() {

  if (
    document.getElementById(
      "chamaAdminMenu"
    )
  ) {

    return;

  }


  const backdrop =
    document.createElement("div");

  backdrop.id =
    "chamaAdminBack";

  backdrop.className =
    "chama-mobile-backdrop";

  backdrop.setAttribute(
    "aria-hidden",
    "true"
  );


  const menu =
    document.createElement("aside");

  menu.id =
    "chamaAdminMenu";

  menu.className =
    "chama-mobile-menu";

  menu.setAttribute(
    "aria-label",
    "Admin menu"
  );


  const header =
    document.createElement("div");

  header.className =
    "chama-mobile-head";


  const groupName =
    document.createElement("strong");

  groupName.textContent =
    context?.group?.name ||
    "CHAMA";


  const memberName =
    document.createElement("span");

  memberName.textContent =
    context?.member?.name ||
    "Admin";


  header.appendChild(
    groupName
  );

  header.appendChild(
    memberName
  );

  menu.appendChild(
    header
  );


  for (
    const [
      title,
      items
    ]
    of NAVIGATION_GROUPS
  ) {

    const section =
      document.createElement("section");

    section.className =
      "chama-mobile-section";


    const heading =
      document.createElement("h2");

    heading.textContent =
      title;


    section.appendChild(
      heading
    );


    for (
      const item
      of items
    ) {

      section.appendChild(
        createNavLink(
          item[0],
          item[1]
        )
      );

    }


    menu.appendChild(
      section
    );

  }


  const billingSection =
    document.createElement("section");

  billingSection.className =
    "chama-mobile-section";


  const billingHeading =
    document.createElement("h2");

  billingHeading.textContent =
    "Account";


  billingSection.appendChild(
    billingHeading
  );


  billingSection.appendChild(
    createNavLink(
      "billing.html",
      "Billing"
    )
  );


  menu.appendChild(
    billingSection
  );


  document.body.appendChild(
    backdrop
  );

  document.body.appendChild(
    menu
  );


  let button =
    document.querySelector(
      ".menu-toggle"
    );


  if (!button) {

    button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      "menu-toggle";

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


    const topbarInner =
      document.querySelector(
        ".topbar-inner"
      );

    const topbar =
      document.querySelector(
        ".topbar"
      );


    if (topbarInner) {

      topbarInner.prepend(
        button
      );

    }
    else if (topbar) {

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


  if (
    !button.hasAttribute(
      "aria-label"
    )
  ) {

    button.setAttribute(
      "aria-label",
      "Open menu"
    );

  }


  button.addEventListener(
    "click",
    () => {

      const isOpen =
        menu.classList.contains(
          "open"
        );


      if (isOpen) {

        closeAdminMobileMenu();

      }
      else {

        openAdminMobileMenu();

      }

    }
  );


  backdrop.addEventListener(
    "click",
    closeAdminMobileMenu
  );


  menu
    .querySelectorAll("a")
    .forEach(
      link => {

        link.addEventListener(
          "click",
          closeAdminMobileMenu
        );

      }
    );


  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Escape" &&
        menu.classList.contains(
          "open"
        )
      ) {

        closeAdminMobileMenu();

      }

    }
  );

}


/* =========================================================
   MOBILE BOTTOM NAVIGATION
========================================================= */

function renderMobileBottomNavigation() {

  if (
    document.querySelector(
      ".chama-admin-bottom"
    )
  ) {

    return;

  }


  const nav =
    document.createElement("nav");

  nav.className =
    "chama-admin-bottom";

  nav.setAttribute(
    "aria-label",
    "Primary mobile navigation"
  );


  const items = [

    [
      "dashboard.html",
      "Home"
    ],

    [
      "members.html",
      "Members"
    ],

    [
      "contributions.html",
      "Finance"
    ],

    [
      "meetings.html",
      "Group"
    ],

    [
      "#more",
      "More"
    ]

  ];


  for (
    const [
      href,
      label
    ]
    of items
  ) {

    const link =
      document.createElement("a");


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


    if (
      href ===
      "#more"
    ) {

      link.href =
        "#";


      link.setAttribute(
        "aria-label",
        "Open more admin navigation"
      );


      link.addEventListener(
        "click",
        event => {

          event.preventDefault();

          openAdminMobileMenu();

        }
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
   LOAD CURRENT PAGE FEATURE
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
   ADMIN PORTAL BOOT
========================================================= */

export async function boot() {

  if (bootStarted) {

    return;

  }


  bootStarted =
    true;


  try {

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


    context.role =
      String(
        context.role || ""
      )
        .trim()
        .toLowerCase();


    if (
      !isAdminAccount()
    ) {

      window.location.replace(
        "member-dashboard.html"
      );

      return;

    }


    const page =
      getCurrentPage();


    if (
      !ADMIN_PAGES.has(
        page
      )
    ) {

      window.location.replace(
        "dashboard.html"
      );

      return;

    }


    window.__CHAMA_LIVE_LAYOUT_LOADING__ =
      true;


    injectStyles();

    renderDesktopNavigation();

    renderMobileNavigation();

    renderMobileBottomNavigation();

    bindAdminLogout();


    await loadCurrentPageFeature();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE Admin Portal boot failed:",
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
        "Unable to load the Admin Portal.";

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
      "admin"

  };

}
