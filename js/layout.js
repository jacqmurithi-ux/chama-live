import {
  requireAuth,
  getMyMember,
  getMyGroup,
  signOut
} from "./auth.js";


/* =========================================================
   CHAMA LIVE — GLOBAL LAYOUT
========================================================= */

console.log(
  "CHAMA LIVE: layout.js loaded"
);


/* =========================================================
   LAYOUT STATE
========================================================= */

let currentMember = null;
let currentGroup = null;
let pageScriptLoaded = false;


/* =========================================================
   HELPERS
========================================================= */

function byId(id) {

  return document.getElementById(id);

}


/* =========================================================
   GLOBAL MOBILE NAVIGATION STYLES
   Injected by layout.js.
   No app.css editing required.
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

    /* =====================================================
       MOBILE NAVIGATION — DESKTOP DEFAULT
    ===================================================== */

    .mobile-bottom-nav {
      display: none;
    }


    /* =====================================================
       MOBILE DEVICES
    ===================================================== */

    @media (max-width: 650px) {

      /* ---------------------------------------------------
         HIDE DESKTOP SIDEBAR
      --------------------------------------------------- */

      .sidebar {
        display: none !important;
      }


      /* ---------------------------------------------------
         HIDE HAMBURGER
      --------------------------------------------------- */

      .menu-toggle {
        display: none !important;
      }


      /* ---------------------------------------------------
         FULL WIDTH LAYOUT
      --------------------------------------------------- */

      .layout {
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
      }


      .main {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;

        margin: 0 !important;

        padding:
          16px
          14px
          96px
          14px !important;

        box-sizing: border-box;
      }


      /* ---------------------------------------------------
         TOP BAR
      --------------------------------------------------- */

      .topbar {
        width: 100%;

        position: sticky;

        top: 0;

        z-index: 1000;

        box-sizing: border-box;
      }


      /* ---------------------------------------------------
         MOBILE BOTTOM NAVIGATION
      --------------------------------------------------- */

      .mobile-bottom-nav {

        position: fixed;

        left: 0;

        right: 0;

        bottom: 0;

        z-index: 99999;

        display: grid;

        grid-template-columns:
          repeat(5, minmax(0, 1fr));

        align-items: stretch;

        height: 72px;

        padding:
          6px
          6px
          calc(
            6px +
            env(safe-area-inset-bottom)
          );

        box-sizing: border-box;

        background:
          rgba(255, 255, 255, 0.98);

        border-top:
          1px solid #e5e7eb;

        box-shadow:
          0 -5px 20px
          rgba(0, 0, 0, 0.08);

        backdrop-filter:
          blur(14px);

        -webkit-backdrop-filter:
          blur(14px);
      }


      /* ---------------------------------------------------
         NAVIGATION ITEM
      --------------------------------------------------- */

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

        -webkit-tap-highlight-color:
          transparent;
      }


      /* ---------------------------------------------------
         ICON
      --------------------------------------------------- */

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


      /* ---------------------------------------------------
         LABEL
      --------------------------------------------------- */

      .mobile-nav-label {

        font-size: 9px;

        line-height: 1;

        font-weight: 600;

        white-space: nowrap;
      }


      /* ---------------------------------------------------
         ACTIVE PAGE
      --------------------------------------------------- */

      .mobile-nav-item.active {

        color: #0f766e;

        background:
          rgba(15, 118, 110, 0.09);
      }


      /* ---------------------------------------------------
         CENTER CONTRIBUTION BUTTON
      --------------------------------------------------- */

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

        border:
          4px solid white;

        box-shadow:
          0 5px 15px
          rgba(15, 118, 110, 0.30);

        font-size: 25px;
      }


      .mobile-nav-main
      .mobile-nav-label {

        color: #0f766e;
      }


      /* ---------------------------------------------------
         ACTIVE CENTER BUTTON
      --------------------------------------------------- */

      .mobile-nav-main.active
      .mobile-nav-icon {

        background: #115e59;

        transform:
          translateY(-1px);
      }


      /* ---------------------------------------------------
         TABLES
      --------------------------------------------------- */

      .table-wrap {

        width: 100%;

        max-width: 100%;

        overflow-x: auto;

        -webkit-overflow-scrolling:
          touch;
      }


      /* ---------------------------------------------------
         DASHBOARD ACTIONS
      --------------------------------------------------- */

      .actions {

        width: 100%;

        display: grid;

        grid-template-columns:
          repeat(2, minmax(0, 1fr));

        gap: 8px;
      }


      .actions .btn {

        width: 100%;

        justify-content: center;
      }


      /* ---------------------------------------------------
         QUICK ACTIONS
      --------------------------------------------------- */

      .quick-actions {

        display: grid;

        grid-template-columns:
          repeat(2, minmax(0, 1fr));

        gap: 10px;
      }


      .quick-action {

        min-height: 78px;
      }


      /* ---------------------------------------------------
         DASHBOARD METRICS
      --------------------------------------------------- */

      .dashboard-metrics {

        display: grid;

        grid-template-columns:
          repeat(2, minmax(0, 1fr));

        gap: 10px;
      }


      /* ---------------------------------------------------
         TWO COLUMN GRID
      --------------------------------------------------- */

      .grid-2 {

        grid-template-columns:
          1fr !important;
      }


      /* ---------------------------------------------------
         THREE COLUMN GRID
      --------------------------------------------------- */

      .grid-3 {

        grid-template-columns:
          repeat(2, minmax(0, 1fr));
      }


      /* ---------------------------------------------------
         PAGE HEADER
      --------------------------------------------------- */

      .page-head {

        width: 100%;

        min-width: 0;
      }


      .page-head h1 {

        font-size: 26px;
      }


      /* ---------------------------------------------------
         CARDS
      --------------------------------------------------- */

      .card {

        max-width: 100%;

        min-width: 0;
      }

    }


    /* =====================================================
       SMALL PHONES
    ===================================================== */

    @media (max-width: 390px) {

      .mobile-bottom-nav {

        height: 68px;
      }


      .main {

        padding-bottom:
          90px !important;
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


      .quick-actions {

        grid-template-columns:
          1fr;
      }


      .dashboard-metrics {

        grid-template-columns:
          1fr;
      }


      .actions {

        grid-template-columns:
          1fr;
      }

    }

  `;


  document.head.appendChild(
    style
  );


  console.log(
    "CHAMA LIVE: mobile CSS injected."
  );

}
/* =========================================================
   PAGE NAME / PAGE SCRIPT
========================================================= */

function getPageScript() {

  const path =
    window.location.pathname
      .split("/")
      .pop()
      .toLowerCase();


  const pageScripts = {

    "dashboard.html":
      "dashboard.js",

    "members.html":
      "members.js",

    "contributions.html":
      "contributions.js",

    "expenses.html":
      "expenses.js",

    "meetings.html":
      "meetings.js",

    "reports.html":
      "reports.js",

    "monthly-closing.html":
      "monthly-closing.js",

    "group-management.html":
      "group-management.js"

  };


  return pageScripts[path] || null;

}


/* =========================================================
   LOAD PAGE SCRIPT
========================================================= */

async function loadPageScript() {

  if (pageScriptLoaded) {

    return;

  }


  const script =
    getPageScript();


  if (!script) {

    console.log(
      "CHAMA LIVE: No page-specific script for this page."
    );

    return;

  }


  console.log(
    "CHAMA LIVE: Loading page script:",
    script
  );


  try {

    /*
     * All page-specific JavaScript files
     * are inside the /js/ folder.
     */

    await import(
      `./${script}`
    );


    pageScriptLoaded =
      true;


    console.log(
      "CHAMA LIVE: Page script loaded:",
      script
    );

  } catch (error) {

    console.error(
      `CHAMA LIVE: Unable to load ${script}:`,
      error
    );


    const errorBox =
      byId("error");


    if (errorBox) {

      errorBox.hidden =
        false;


      errorBox.textContent =
        `Unable to load ${script}. Check that /js/${script} exists and contains valid JavaScript.`;

    }

  }

}


/* =========================================================
   BOOT
========================================================= */

export async function boot() {

  try {

    console.log(
      "CHAMA LIVE: booting..."
    );


    /* -----------------------------------------------------
       1. REQUIRE AUTHENTICATION
    ----------------------------------------------------- */

    const session =
      await requireAuth();


    if (!session) {

      return;

    }


    /* -----------------------------------------------------
       2. GET CURRENT MEMBER
    ----------------------------------------------------- */

    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "Your account is authenticated, but no member record was found."
      );

    }


    /* -----------------------------------------------------
       3. CHECK GROUP LINK
    ----------------------------------------------------- */

    if (
      !currentMember.group_id
    ) {

      throw new Error(
        "Your member account is not linked to a group."
      );

    }


    /* -----------------------------------------------------
       4. GET CURRENT GROUP
    ----------------------------------------------------- */

    try {

      currentGroup =
        await getMyGroup();

    } catch (groupError) {

      console.warn(
        "CHAMA LIVE: getMyGroup failed:",
        groupError
      );


      /*
       * Continue using the group_id from
       * the member record.
       */

      currentGroup = {

        id:
          currentMember.group_id

      };

    }


    /* -----------------------------------------------------
       5. DISPLAY MEMBER NAME
    ----------------------------------------------------- */

    displayUser(
      currentMember
    );


    /* -----------------------------------------------------
       6. DISPLAY GROUP NAME
    ----------------------------------------------------- */

    displayGroup(
      currentGroup
    );


    /* -----------------------------------------------------
       7. SETUP LOGOUT
    ----------------------------------------------------- */

    setupLogout();


    /* -----------------------------------------------------
       8. INJECT MOBILE NAVIGATION CSS
    ----------------------------------------------------- */

    injectMobileNavigationStyles();


    /* -----------------------------------------------------
       9. CREATE MOBILE NAVIGATION
    ----------------------------------------------------- */

    setupMobileNavigation();


    /* -----------------------------------------------------
       10. LOAD CURRENT PAGE SCRIPT
    ----------------------------------------------------- */

    await loadPageScript();


    /* -----------------------------------------------------
       READY
    ----------------------------------------------------- */

    console.log(
      "CHAMA LIVE: application ready."
    );

  } catch (error) {

    console.error(
      "CHAMA LIVE boot error:",
      error
    );


    const errorBox =
      byId("error");


    if (errorBox) {

      errorBox.hidden =
        false;


      errorBox.textContent =
        error?.message ||
        "Unable to load CHAMA LIVE.";

    }

  }

}


/* =========================================================
   AUTO START
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      boot();

    },
    {
      once: true
    }
  );

} else {

  boot();

      }
