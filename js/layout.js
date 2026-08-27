
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


/* =========================================================
   HELPERS
========================================================= */

function byId(id) {

  return document.getElementById(id);

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
   MOBILE NAVIGATION STYLES
   Injected from layout.js.
   app.css does NOT need to be edited.
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
       DESKTOP
    ===================================================== */

    .mobile-bottom-nav {
      display: none;
    }


    /* =====================================================
       MOBILE
    ===================================================== */

    @media (max-width: 650px) {

      /* Hide desktop sidebar */
      .sidebar {
        display: none !important;
      }


      /* Hide hamburger */
      .menu-toggle {
        display: none !important;
      }


      /* Full-width application */
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


      /* Top bar */
      .topbar {
        width: 100%;
        position: sticky;
        top: 0;
        z-index: 1000;
      }


      /* ===================================================
         MOBILE BOTTOM NAV
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
        transform: scale(.96);
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
         ACTIVE PAGE
      =================================================== */

      .mobile-nav-item.active {

        color: #0f766e;

        background:
          rgba(15,118,110,.09);

      }


      /* ===================================================
         CENTER CONTRIBUTION BUTTON
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

        background: #0f766e;

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

        color: #0f766e;

      }


      .mobile-nav-main.active
      .mobile-nav-icon {

        background: #115e59;

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
         ACTION BUTTONS
      =================================================== */

      .actions {

        width: 100%;

        display: grid;

        grid-template-columns:
          repeat(2, minmax(0,1fr));

        gap: 8px;

      }


      .actions .btn {

        width: 100%;

        justify-content: center;

      }


      /* ===================================================
         QUICK ACTIONS
      =================================================== */

      .quick-actions {

        display: grid;

        grid-template-columns:
          repeat(2,minmax(0,1fr));

        gap: 10px;

      }


      .quick-action {

        min-height: 78px;

      }


      /* ===================================================
         DASHBOARD METRICS
      =================================================== */

      .dashboard-metrics {

        display: grid;

        grid-template-columns:
          repeat(2,minmax(0,1fr));

        gap: 10px;

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
          repeat(2,minmax(0,1fr));

      }


      /* ===================================================
         PAGE HEADER
      =================================================== */

      .page-head {
        width: 100%;
      }


      .page-head h1 {
        font-size: 26px;
      }


      /* ===================================================
         CARDS
      =================================================== */

      .card {
        max-width: 100%;
      }

    }


    /* =====================================================
       SMALL PHONES
    ===================================================== */

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


      .quick-actions {
        grid-template-columns: 1fr;
      }


      .dashboard-metrics {
        grid-template-columns: 1fr;
      }


      .actions {
        grid-template-columns: 1fr;
      }

    }

  `;


  document.head.appendChild(style);


  console.log(
    "CHAMA LIVE: mobile navigation CSS injected."
  );

}

/* =========================================================
   MOBILE NAVIGATION
========================================================= */

function setupMobileNavigation() {

  /*
   * Prevent duplicate navigation.
   */

  if (
    document.querySelector(
      ".mobile-bottom-nav"
    )
  ) {

    return;

  }


  /*
   * Create navigation.
   */

  const nav =
    document.createElement("nav");


  nav.className =
    "mobile-bottom-nav";


  nav.setAttribute(
    "aria-label",
    "Mobile navigation"
  );


  /*
   * Five primary mobile destinations.
   *
   * Home
   * Members
   * Contributions
   * Expenses
   * Meetings
   */

  nav.innerHTML = `

    <a
      href="dashboard.html"
      class="mobile-nav-item"
      data-page="dashboard.html"
    >

      <span
        class="mobile-nav-icon"
        aria-hidden="true"
      >
        ⌂
      </span>

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
      >
        ♙
      </span>

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
      >
        +
      </span>

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
      >
        −
      </span>

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
      >
        ◷
      </span>

      <span class="mobile-nav-label">
        Meetings
      </span>

    </a>

  `;


  /*
   * Add navigation to body.
   */

  document.body.appendChild(nav);


  /*
   * Determine current page.
   */

  let currentPage =
    window.location.pathname
      .split("/")
      .pop()
      .toLowerCase();


  /*
   * If the site is opened from
   * the root without a filename,
   * treat it as dashboard.
   */

  if (!currentPage) {

    currentPage =
      "dashboard.html";

  }


  /*
   * Highlight current page.
   */

  nav
    .querySelectorAll(
      ".mobile-nav-item"
    )
    .forEach(item => {

      const page =
        String(
          item.dataset.page || ""
        ).toLowerCase();


      if (
        page === currentPage
      ) {

        item.classList.add(
          "active"
        );

      }

    });


  /*
   * Give immediate visual feedback
   * when a navigation item is tapped.
   */

  nav
    .querySelectorAll("a")
    .forEach(link => {

      link.addEventListener(
        "click",
        () => {

          nav
            .querySelectorAll(
              ".mobile-nav-item"
            )
            .forEach(item => {

              item.classList.remove(
                "active"
              );

            });


          link.classList.add(
            "active"
          );

        }
      );

    });


  console.log(
    "CHAMA LIVE: mobile navigation ready."
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


  /*
   * Prevent duplicate listeners.
   */

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

      /*
       * Prevent repeated clicks.
       */

      logoutButton.disabled =
        true;


      const originalText =
        logoutButton.textContent;


      logoutButton.textContent =
        "Signing out...";


      try {

        await signOut();


      } catch (error) {

        console.error(
          "CHAMA LIVE: logout failed:",
          error
        );


        logoutButton.disabled =
          false;


        logoutButton.textContent =
          originalText ||
          "Sign out";

      }

    }
  );



  console.log(
    "CHAMA LIVE: logout ready."
  );

      }
/* =========================================================
   LOAD USER / GROUP INFORMATION
========================================================= */

async function loadLayoutData() {

  try {

    /*
     * Get the currently authenticated member.
     */

    currentMember =
      await getMyMember();


    /*
     * A valid member must have a group.
     */

    if (
      !currentMember ||
      !currentMember.group_id
    ) {

      console.warn(
        "CHAMA LIVE: No linked member/group found."
      );

      return;

    }


    /*
     * Get the member's group.
     */

    currentGroup =
      await getMyGroup();


    /*
     * Display information across
     * all pages using data attributes.
     */

    displayUser(
      currentMember
    );


    displayGroup(
      currentGroup
    );


    console.log(
      "CHAMA LIVE: layout data loaded.",
      {
        member: currentMember,
        group: currentGroup
      }
    );


  } catch (error) {

    console.error(
      "CHAMA LIVE: unable to load layout data:",
      error
    );

  }

}



/* =========================================================
   AUTHENTICATION
========================================================= */

async function initializeAuthentication() {

  try {

    /*
     * Require an authenticated user.
     *
     * auth.js handles the actual
     * authentication/session check.
     */

    await requireAuth();


    console.log(
      "CHAMA LIVE: authentication verified."
    );


  } catch (error) {

    console.error(
      "CHAMA LIVE: authentication failed:",
      error
    );


    /*
     * Stop layout initialization if
     * authentication fails.
     */

    throw error;

  }

}



/* =========================================================
   INITIALIZE GLOBAL LAYOUT
========================================================= */

async function initLayout() {

  /*
   * Inject mobile CSS first.
   */

  injectMobileNavigationStyles();


  /*
   * Make sure the user is authenticated.
   */

  await initializeAuthentication();


  /*
   * Load member and group information.
   */

  await loadLayoutData();


  /*
   * Set up logout button.
   */

  setupLogout();


  /*
   * Create mobile navigation.
   */

  setupMobileNavigation();


  console.log(
    "CHAMA LIVE: global layout initialized."
  );

}



/* =========================================================
   START LAYOUT
========================================================= */

async function startLayout() {

  try {

    await initLayout();

  } catch (error) {

    console.error(
      "CHAMA LIVE: layout initialization error:",
      error
    );

  }

}



/* =========================================================
   DOM READY
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    startLayout,
    {
      once: true
    }
  );

} else {

  startLayout();

}
