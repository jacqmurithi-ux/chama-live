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
   - Current group identity display

   IMPORTANT
   ---------------------------------------------------------
   This module does NOT perform database mutations.

   PAGE MODULES
   ---------------------------------------------------------
   Each page remains responsible for its own data/rendering.

   BOOT OWNERSHIP
   ---------------------------------------------------------
   admin-layout.js is the sole feature boot owner for
   mapped admin pages.

   Feature modules must export the initializer declared
   in PAGE_SCRIPTS and must not independently auto-boot
   when loaded by this layout.

   BILLING
   ---------------------------------------------------------
   billing.html is an admin page.
   billing.js exports initBilling().

   GETTING STARTED
   ---------------------------------------------------------
   Admin Getting Started is currently a shell-only admin
   page and therefore has no PAGE_SCRIPTS entry.

   Member Getting Started remains separate:
     member-getting-started.html
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
  "billing.html",
  "assets.html",
  "plans-activities.html",
  "support-welfare.html",
  "milestones.html",
  "data-migration.html",
  "admin-getting-started.html"
]);


/* =========================================================
   PAGE MODULES
   ---------------------------------------------------------
   Format:

     "page.html": [
       "./feature.js",
       "initializerName"
     ]

   IMPORTANT:
   ---------------------------------------------------------
   Do not add a page here until the corresponding module
   and exported initializer have been verified.

   Shell-only pages remain in ADMIN_PAGES but do not need
   a PAGE_SCRIPTS entry.
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

  "billing.html": [
    "./billing.js",
    "initBilling"
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
  ],

  "assets.html": [
    "./assets.js",
    "initPage"
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
    "dashboard.html"
  );

}


/* =========================================================
   AUTHORIZATION
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
   CURRENT GROUP
========================================================= */

function renderCurrentGroupName() {

  const groupName =
    context?.group?.name ||
    context?.member?.group_name ||
    "CHAMA";

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
   NAV LINK
========================================================= */

function createNavLink(
  href,
  label
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
   NAVIGATION GROUPS
========================================================= */

const NAVIGATION_GROUPS = [

  [
    "Home",
    [
      [
        "dashboard.html",
        "Dashboard"
      ],
      [
        "admin-getting-started.html",
        "Getting Started"
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
   STYLES
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
    document.createElement(
      "style"
    );

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
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        z-index: 20001;
        box-shadow:
          0 22px 55px rgba(16, 24, 40, 0.18);
        opacity: 0;
        transform: translateY(-6px);
        pointer-events: none;
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
      }

      .chama-mobile-head strong {
        display: block;
        color: #101828;
        font-size: 14px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .chama-mobile-head span {
        display: block;
        margin-top: 3px;
        color: #667085;
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .chama-mobile-section {
        padding: 11px 10px 2px;
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
      }

      .chama-mobile-menu a:hover,
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
        text-align: center;
        white-space: nowrap;
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
      }

      .chama-admin-bottom {
        height: 68px;
      }

      .chama-admin-bottom a {
        font-size: 9px;
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

  target.replaceChildren();

  const nav =
    document.createElement(
      "nav"
    );

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
      document.createElement(
        "details"
      );

    details.className =
      "chama-admin-group";


    const summary =
      document.createElement(
        "summary"
      );

    summary.textContent =
      title;


    details.appendChild(
      summary
    );


    const panel =
      document.createElement(
        "div"
      );

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
   * Billing is a dedicated admin page.
   *
   * It is intentionally outside the grouped
   * Finance navigation.
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
   LOGOUT
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
    logoutButton.dataset
      .adminLogoutBound ===
    "true"
  ) {
    return;
  }

  logoutButton.dataset
    .adminLogoutBound =
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
   MOBILE MENU
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

}


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
    document.createElement(
      "div"
    );

  backdrop.id =
    "chamaAdminBack";

  backdrop.className =
    "chama-mobile-backdrop";


  const menu =
    document.createElement(
      "aside"
    );

  menu.id =
    "chamaAdminMenu";

  menu.className =
    "chama-mobile-menu";

  menu.setAttribute(
    "aria-label",
    "Admin menu"
  );


  const header =
    document.createElement(
      "div"
    );

  header.className =
    "chama-mobile-head";


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


  /* ---------------------------------------------------------
     STANDARD ADMIN NAVIGATION
  --------------------------------------------------------- */

  for (
    const [
      title,
      items
    ]
    of NAVIGATION_GROUPS
  ) {

    const section =
      document.createElement(
        "section"
      );

    section.className =
      "chama-mobile-section";


    const heading =
      document.createElement(
        "h2"
      );

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


  /* ---------------------------------------------------------
     ACCOUNT
  --------------------------------------------------------- */

  const accountSection =
    document.createElement(
      "section"
    );

  accountSection.className =
    "chama-mobile-section";


  const accountHeading =
    document.createElement(
      "h2"
    );

  accountHeading.textContent =
    "Account";


  accountSection.appendChild(
    accountHeading
  );


  accountSection.appendChild(
    createNavLink(
      "billing.html",
      "Billing"
    )
  );


  menu.appendChild(
    accountSection
  );


  document.body.appendChild(
    backdrop
  );

  document.body.appendChild(
    menu
  );


  /* ---------------------------------------------------------
     MOBILE MENU TOGGLE
  --------------------------------------------------------- */

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


    if (topbarInner) {

      topbarInner.prepend(
        button
      );

    }

  }


  if (
    button.dataset
      .adminMenuBound ===
    "true"
  ) {
    return;
  }


  button.dataset
    .adminMenuBound =
    "true";


  button.addEventListener(
    "click",
    () => {

      if (
        menu.classList.contains(
          "open"
        )
      ) {

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
    .querySelectorAll(
      "a"
    )
    .forEach(
      link => {

        link.addEventListener(
          "click",
          closeAdminMobileMenu
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
      ".chama-admin-bottom"
    )
  ) {
    return;
  }


  const nav =
    document.createElement(
      "nav"
    );

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


    if (
      href === "#more"
    ) {

      link.href =
        "#";


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
   CURRENT PAGE FEATURE
========================================================= */

async function loadCurrentPageFeature() {

  const page =
    getCurrentPage();


  const entry =
    PAGE_SCRIPTS[page];


  /*
   * Shell-only page.
   *
   * The page is authorized but does not have a
   * feature initializer registered.
   */

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
   HIDE ALL LOADERS
========================================================= */

function hideAdminLoaders() {

  document
    .querySelectorAll(
      "[data-admin-loading]"
    )
    .forEach(
      element => {

        element.hidden =
          true;

      }
    );


  document
    .querySelectorAll(
      "[data-loading], .loading, .page-loading"
    )
    .forEach(
      element => {

        element.hidden =
          true;

      }
    );

}


/* =========================================================
   BOOT ERROR
========================================================= */

function showBootError(
  message,
  stage
) {

  hideAdminLoaders();


  const errorBox =
    document.getElementById(
      "error"
    );


  if (!errorBox) {

    const billingError =
      document.getElementById(
        "billingError"
      );


    if (billingError) {

      billingError.hidden =
        false;


      billingError.textContent =
        `Admin Portal loading failed during ${stage}: ${message}`;

    }


    return;

  }


  errorBox.hidden =
    false;


  errorBox.textContent =
    `Admin Portal loading failed during ${stage}: ${message}`;

}


/* =========================================================
   ADMIN PORTAL BOOT
   ---------------------------------------------------------
   IMPORTANT:
   There is intentionally NO automatic boot at the bottom
   of this file.

   HTML pages must explicitly call:

     import { boot } from "./js/admin-layout.js";
     boot();

   This makes admin-layout.js the single page-shell boot
   owner.
========================================================= */

export async function boot() {

  if (bootStarted) {
    return;
  }


  bootStarted =
    true;


  let stage =
    "authentication";


  try {

    /* -------------------------------------------------------
       APPLICATION CONTEXT
    ------------------------------------------------------- */

    stage =
      "application context";


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


    /* -------------------------------------------------------
       GROUP IDENTITY
    ------------------------------------------------------- */

    stage =
      "group identity";


    renderCurrentGroupName();


    /* -------------------------------------------------------
       ADMIN AUTHORIZATION
    ------------------------------------------------------- */

    stage =
      "admin authorization";


    if (
      !isAdminAccount()
    ) {

      window.location.replace(
        "member-dashboard.html"
      );

      return;

    }


    /* -------------------------------------------------------
       PAGE AUTHORIZATION
    ------------------------------------------------------- */

    const page =
      getCurrentPage();


    stage =
      "page authorization";


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


    /* -------------------------------------------------------
       LAYOUT LOADING FLAG
       -------------------------------------------------------
       Feature modules that retain direct-page compatibility
       can use this flag to avoid duplicate initialization
       when they are loaded by admin-layout.js.
    ------------------------------------------------------- */

    window.__CHAMA_LIVE_LAYOUT_LOADING__ =
      true;


    /* -------------------------------------------------------
       ADMIN NAVIGATION
    ------------------------------------------------------- */

    stage =
      "admin navigation";


    injectStyles();

    renderDesktopNavigation();

    renderMobileNavigation();

    renderMobileBottomNavigation();

    bindAdminLogout();


    /* -------------------------------------------------------
       CURRENT PAGE MODULE
    ------------------------------------------------------- */

    stage =
      `${page} module`;


    await loadCurrentPageFeature();


    /* -------------------------------------------------------
       PAGE READY
    ------------------------------------------------------- */

    hideAdminLoaders();

  }


  catch (error) {

    console.error(
      "CHAMA LIVE Admin Portal boot failed:",
      {
        stage,
        error
      }
    );


    showBootError(
      error?.message ||
        "Unable to load the Admin Portal.",
      stage
    );

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

}1
