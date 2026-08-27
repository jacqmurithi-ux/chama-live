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
   GLOBAL MOBILE NAVIGATION STYLES
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
       MOBILE NAVIGATION — DEFAULT HIDDEN
    ===================================================== */

    .mobile-bottom-nav {
      display: none;
    }


    /* =====================================================
       MOBILE DEVICES
    ===================================================== */

    @media (max-width: 650px) {

      /* -----------------------------------------------
         HIDE DESKTOP SIDEBAR
      ----------------------------------------------- */

      .sidebar {
        display: none !important;
      }


      /* -----------------------------------------------
         HIDE HAMBURGER
      ----------------------------------------------- */

      .menu-toggle {
        display: none !important;
      }


      /* -----------------------------------------------
         FULL WIDTH LAYOUT
      ----------------------------------------------- */

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


      /* -----------------------------------------------
         TOP BAR
      ----------------------------------------------- */

      .topbar {
        width: 100%;
        position: sticky;
        top: 0;
        z-index: 1000;
      }


      /* -----------------------------------------------
         MOBILE BOTTOM NAV
      ----------------------------------------------- */

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
          1px solid
          #e5e7eb;

        box-shadow:
          0 -5px 20px
          rgba(0,0,0,.08);

        backdrop-filter:
          blur(14px);

        -webkit-backdrop-filter:
          blur(14px);

      }


      /* -----------------------------------------------
         NAV ITEM
      ----------------------------------------------- */

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


      /* -----------------------------------------------
         ICON
      ----------------------------------------------- */

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


      /* -----------------------------------------------
         LABEL
      ----------------------------------------------- */

      .mobile-nav-label {

        font-size: 9px;

        line-height: 1;

        font-weight: 600;

        white-space: nowrap;

      }


      /* -----------------------------------------------
         ACTIVE PAGE
      ----------------------------------------------- */

      .mobile-nav-item.active {

        color: #0f766e;

        background:
          rgba(15,118,110,.09);

      }


      /* -----------------------------------------------
         CENTER CONTRIBUTION BUTTON
      ----------------------------------------------- */

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


      /* -----------------------------------------------
         ACTIVE CENTER BUTTON
      ----------------------------------------------- */

      .mobile-nav-main.active
      .mobile-nav-icon {

        background: #115e59;

      }


      /* -----------------------------------------------
         TABLES
      ----------------------------------------------- */

      .table-wrap {

        width: 100%;

        max-width: 100%;

        overflow-x: auto;

        -webkit-overflow-scrolling:
          touch;

      }


      /* -----------------------------------------------
         DASHBOARD ACTIONS
      ----------------------------------------------- */

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


      /* -----------------------------------------------
         QUICK ACTION CARDS
      ----------------------------------------------- */

      .quick-actions {

        display: grid;

        grid-template-columns:
          repeat(2, minmax(0, 1fr));

        gap: 10px;

      }


      .quick-action {

        min-height: 78px;

      }


      /* -----------------------------------------------
         DASHBOARD METRICS
      ----------------------------------------------- */

      .dashboard-metrics {

        display: grid;

        grid-template-columns:
          repeat(2, minmax(0, 1fr));

        gap: 10px;

      }


      /* -----------------------------------------------
         TWO COLUMN SECTIONS
      ----------------------------------------------- */

      .grid-2 {

        grid-template-columns:
          1fr !important;

      }


      /* -----------------------------------------------
         THREE COLUMN SECTIONS
      ----------------------------------------------- */

      .grid-3 {

        grid-template-columns:
          repeat(2, minmax(0, 1fr));

      }


      /* -----------------------------------------------
         PAGE HEADER
      ----------------------------------------------- */

      .page-head {

        width: 100%;

      }


      .page-head h1 {

        font-size: 26px;

      }


      /* -----------------------------------------------
         CARDS
      ----------------------------------------------- */

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
    "CHAMA LIVE: global mobile CSS injected."
  );

}

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
   DISPLAY USER
========================================================= */

function displayUser(member) {

  const name =
    member?.name ||
    member?.full_name ||
    "Member";


  const elements =
    document.querySelectorAll(
      "[data-user-name]"
    );


  elements.forEach(
    element => {

      element.textContent =
        name;

    }
  );

}


/* =========================================================
   DISPLAY GROUP
========================================================= */

function displayGroup(group) {

  const name =
    group?.name ||
    group?.group_name ||
    "CHAMA";


  const elements =
    document.querySelectorAll(
      "[data-group-name]"
    );


  elements.forEach(
    element => {

      element.textContent =
        name;

    }
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


  logoutButton.addEventListener(
    "click",
    async () => {

      logoutButton.disabled =
        true;

      logoutButton.textContent =
        "Signing out...";


      try {

        await signOut();

      } catch (error) {

        console.error(
          "Logout error:",
          error
        );


        logoutButton.disabled =
          false;

        logoutButton.textContent =
          "Sign out";

      }

    }
  );

}
/* =========================================================
   MOBILE NAVIGATION
========================================================= */

function setupMobileNavigation() {

  /*
   * Do not create duplicate navigation.
   */

  if (
    document.querySelector(
      ".mobile-bottom-nav"
    )
  ) {

    return;

  }


  /*
   * Create navigation container.
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
   * Navigation items.
   */

  nav.innerHTML = `

    <a
      href="dashboard.html"
      class="mobile-nav-item"
      data-page="dashboard.html"
    >
      <span class="mobile-nav-icon">⌂</span>
      <span class="mobile-nav-label">
        Home
      </span>
    </a>


    <a
      href="members.html"
      class="mobile-nav-item"
      data-page="members.html"
    >
      <span class="mobile-nav-icon">♙</span>
      <span class="mobile-nav-label">
        Members
      </span>
    </a>


    <a
      href="contributions.html"
      class="mobile-nav-item mobile-nav-main"
      data-page="contributions.html"
    >
      <span class="mobile-nav-icon">＋</span>
      <span class="mobile-nav-label">
        Contribute
      </span>
    </a>


    <a
      href="expenses.html"
      class="mobile-nav-item"
      data-page="expenses.html"
    >
      <span class="mobile-nav-icon">−</span>
      <span class="mobile-nav-label">
        Expenses
      </span>
    </a>


    <a
      href="meetings.html"
      class="mobile-nav-item"
      data-page="meetings.html"
    >
      <span class="mobile-nav-icon">◷</span>
      <span class="mobile-nav-label">
        Meetings
      </span>
    </a>

  `;


  /*
   * Add navigation to page.
   */

  document.body.appendChild(
    nav
  );


  /*
   * Determine current page.
   */

  const currentPage =
    window.location.pathname
      .split("/")
      .pop()
      .toLowerCase();


  /*
   * Highlight current page.
   */

  nav
    .querySelectorAll(
      ".mobile-nav-item"
    )
    .forEach(item => {

      const page =
        item.dataset.page;


      if (
        page === currentPage
      ) {

        item.classList.add(
          "active"
        );

      }

    });


  /*
   * Close/scroll behavior after navigation.
   */

  nav
    .querySelectorAll(
      "a"
    )
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
   MOBILE NAVIGATION STYLES
   Injected automatically — no CSS file editing required.
========================================================= */

function setupMobileNavigationStyles() {

  if (
    document.getElementById(
      "chama-mobile-nav-styles"
    )
  ) {

    return;

  }


  const style =
    document.createElement("style");

  style.id =
    "chama-mobile-nav-styles";


  style.textContent = `

    /* =====================================================
       MOBILE BOTTOM NAV
    ===================================================== */

    .mobile-bottom-nav {

      display: none;

    }


    /* =====================================================
       MOBILE
    ===================================================== */

    @media (max-width: 650px) {

      /*
       * Hide desktop sidebar completely.
       */

      .sidebar {

        display: none !important;

      }


      /*
       * Hide hamburger/menu button.
       */

      .menu-toggle {

        display: none !important;

      }


      /*
       * Main content uses full width.
       */

      .main {

        width: 100% !important;
        max-width: 100% !important;

        margin: 0 !important;

        padding:

          16px

          14px

          95px

          14px !important;

      }


      /*
       * Top bar.
       */

      .topbar {

        position: sticky;

        top: 0;

        z-index: 1000;

      }


      /*
       * Mobile bottom navigation.
       */

      .mobile-bottom-nav {

        position: fixed;

        left: 0;

        right: 0;

        bottom: 0;

        z-index: 9999;

        display: grid;

        grid-template-columns:
          repeat(5, 1fr);

        align-items: stretch;

        height: 72px;

        background:
          rgba(255, 255, 255, 0.98);

        border-top:
          1px solid #e5e7eb;

        box-shadow:
          0 -4px 20px
          rgba(0, 0, 0, 0.08);

        padding:

          7px

          6px

          calc(
            7px +
            env(
              safe-area-inset-bottom
            )
          );

        backdrop-filter:
          blur(12px);

      }


      /*
       * Navigation item.
       */

      .mobile-nav-item {

        display: flex;

        flex-direction: column;

        align-items: center;

        justify-content: center;

        gap: 3px;

        min-width: 0;

        text-decoration: none;

        color: #64748b;

        border-radius: 12px;

        transition:
          background 0.2s ease,
          color 0.2s ease,
          transform 0.2s ease;

      }


      /*
       * Navigation icon.
       */

      .mobile-nav-icon {

        display: flex;

        align-items: center;

        justify-content: center;

        width: 32px;

        height: 32px;

        font-size: 21px;

        font-weight: 700;

        line-height: 1;

      }


      /*
       * Navigation label.
       */

      .mobile-nav-label {

        font-size: 10px;

        line-height: 1;

        font-weight: 600;

        white-space: nowrap;

      }


      /*
       * Active page.
       */

      .mobile-nav-item.active {

        color: #0f766e;

        background:
          rgba(15, 118, 110, 0.09);

      }


      /*
       * Main contribution button.
       */

      .mobile-nav-main {

        position: relative;

      }


      .mobile-nav-main
      .mobile-nav-icon {

        width: 42px;

        height: 42px;

        margin-top: -17px;

        border-radius: 50%;

        background: #0f766e;

        color: white;

        border:
          4px solid white;

        box-shadow:
          0 5px 14px
          rgba(15, 118, 110, 0.30);

        font-size: 25px;

      }


      .mobile-nav-main
      .mobile-nav-label {

        color: #0f766e;

      }


      /*
       * Active contribution button.
       */

      .mobile-nav-main.active
      .mobile-nav-icon {

        background: #115e59;

        transform:
          translateY(-1px);

      }


      /*
       * Prevent tables from breaking
       * the mobile layout.
       */

      .table-wrap {

        max-width: 100%;

        overflow-x: auto;

        -webkit-overflow-scrolling:
          touch;

      }


      /*
       * Make dashboard actions easier
       * to use on phones.
       */

      .actions {

        display: grid;

        grid-template-columns:
          1fr 1fr;

        gap: 8px;

        width: 100%;

      }


      .actions .btn {

        width: 100%;

        justify-content: center;

      }


      /*
       * Quick actions become cards.
       */

      .quick-actions {

        display: grid;

        grid-template-columns:
          repeat(2, minmax(0, 1fr));

        gap: 10px;

      }


      .quick-action {

        min-height: 76px;

      }


      /*
       * Dashboard metrics.
       */

      .dashboard-metrics {

        grid-template-columns:
          repeat(2, minmax(0, 1fr));

        gap: 10px;

      }


      /*
       * Two-column sections become
       * single column.
       */

      .grid-2 {

        grid-template-columns:
          1fr !important;

      }


      /*
       * Three-column grids become
       * two columns.
       */

      .grid-3 {

        grid-template-columns:
          repeat(2, minmax(0, 1fr));

      }


      /*
       * Page heading.
       */

      .page-head {

        gap: 12px;

      }


      .page-head h1 {

        font-size: 26px;

      }


      /*
       * Cards.
       */

      .card {

        max-width: 100%;

      }


    }


    /* =====================================================
       VERY SMALL PHONES
    ===================================================== */

    @media (max-width: 390px) {

      .mobile-bottom-nav {

        height: 68px;

      }


      .mobile-nav-icon {

        width: 28px;

        height: 28px;

        font-size: 19px;

      }


      .mobile-nav-label {

        font-size: 9px;

      }


      .mobile-nav-main
      .mobile-nav-icon {

        width: 38px;

        height: 38px;

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
    "CHAMA LIVE: mobile navigation styles ready."
  );

}
/* =========================================================
   NAVIGATION SETUP
========================================================= */

function setupNavigation() {

  /*
   * Add the mobile navigation.
   */

  setupMobileNavigation();


  /*
   * Add the mobile navigation styles.
   */

  setupMobileNavigationStyles();


  /*
   * Make sure the desktop sidebar
   * remains available on larger screens.
   */

  const sidebar =
    byId("sidebar");

  if (sidebar) {

    sidebar
      .querySelectorAll("a")
      .forEach(link => {

        link.addEventListener(
          "click",
          () => {

            /*
             * Close any mobile sidebar
             * that may exist on an older
             * version of the page.
             */

            sidebar.classList.remove(
              "open"
            );

          }
        );

      });

  }


  console.log(
    "CHAMA LIVE: navigation configured."
  );

}
/* =========================================================
   PAGE INFORMATION
========================================================= */

function updatePageInformation() {

  /*
   * Current page.
   */

  const currentPage =
    window.location.pathname
      .split("/")
      .pop()
      .toLowerCase();


  /*
   * If the page is opened from the
   * root URL, treat it as dashboard.
   */

  const page =
    currentPage ||
    "dashboard.html";


  /*
   * Highlight desktop navigation.
   */

  const sidebar =
    byId("sidebar");


  if (sidebar) {

    sidebar
      .querySelectorAll("a")
      .forEach(link => {

        const href =
          link
            .getAttribute("href")
            ?.split("/")
            .pop()
            .toLowerCase();


        link.classList.toggle(
          "active",
          href === page
        );

      });

  }


  /*
   * Highlight mobile navigation.
   */

  const mobileNav =
    document.querySelector(
      ".mobile-bottom-nav"
    );


  if (mobileNav) {

    mobileNav
      .querySelectorAll(
        ".mobile-nav-item"
      )
      .forEach(link => {

        const targetPage =
          link.dataset.page
            ?.toLowerCase();


        link.classList.toggle(
          "active",
          targetPage === page
        );

      });

  }


  console.log(
    "CHAMA LIVE: current page:",
    page
  );

}
/* =========================================================
   MOBILE NAVIGATION
========================================================= */

function setupMobileNavigation() {

  /*
   * Don't create it twice.
   */

  if (
    document.querySelector(
      ".mobile-bottom-nav"
    )
  ) {
    updatePageInformation();
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


  /*
   * Navigation items.
   *
   * Five important actions are kept
   * directly accessible on mobile.
   */

  const items = [

    {
      page: "dashboard.html",
      href: "dashboard.html",
      icon: "⌂",
      label: "Home"
    },

    {
      page: "members.html",
      href: "members.html",
      icon: "👥",
      label: "Members"
    },

    {
      page: "contributions.html",
      href: "contributions.html",
      icon: "+",
      label: "Contribute",
      main: true
    },

    {
      page: "expenses.html",
      href: "expenses.html",
      icon: "−",
      label: "Expenses"
    },

    {
      page: "meetings.html",
      href: "meetings.html",
      icon: "▣",
      label: "Meetings"
    }

  ];


  items.forEach(item => {

    const link =
      document.createElement("a");


    link.href =
      item.href;


    link.className =
      "mobile-nav-item";


    if (item.main) {

      link.classList.add(
        "mobile-nav-main"
      );

    }


    link.dataset.page =
      item.page;


    link.setAttribute(
      "aria-label",
      item.label
    );


    /*
     * Icon.
     */

    const icon =
      document.createElement("span");

    icon.className =
      "mobile-nav-icon";

    icon.textContent =
      item.icon;


    /*
     * Label.
     */

    const label =
      document.createElement("span");

    label.className =
      "mobile-nav-label";

    label.textContent =
      item.label;


    link.appendChild(icon);

    link.appendChild(label);


    /*
     * Close any accidental sidebar
     * before navigating.
     */

    link.addEventListener(
      "click",
      () => {

        const sidebar =
          byId("sidebar");

        if (sidebar) {

          sidebar.classList.remove(
            "open"
          );

        }

      }
    );


    nav.appendChild(link);

  });


  /*
   * Put navigation at the bottom
   * of the page.
   */

  document.body.appendChild(nav);


  /*
   * Set active page.
   */

  updatePageInformation();


  console.log(
    "CHAMA LIVE: mobile bottom navigation added."
  );

      }
/* =========================================================
   BOOT
========================================================= */

export async function boot() {

  try {

    console.log(
      "CHAMA LIVE booting..."
    );


    /* -----------------------------------------------------
       1. REQUIRE LOGIN
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
       3. GET CURRENT GROUP
    ----------------------------------------------------- */

    try {

      currentGroup =
        await getMyGroup();

    } catch (groupError) {

      console.warn(
        "Unable to load group using getMyGroup:",
        groupError
      );


      /*
       * Fall back to the group_id
       * stored on the member record.
       */

      if (
        currentMember?.group_id
      ) {

        currentGroup = {
          id:
            currentMember.group_id
        };

      } else {

        throw new Error(
          "Your member account is not linked to a group."
        );

      }

    }


    /* -----------------------------------------------------
       4. DISPLAY MEMBER
    ----------------------------------------------------- */

    displayUser(
      currentMember
    );


    /* -----------------------------------------------------
       5. DISPLAY GROUP
    ----------------------------------------------------- */

    displayGroup(
      currentGroup
    );


    /* -----------------------------------------------------
       6. LOGOUT
    ----------------------------------------------------- */

    setupLogout();


    /* -----------------------------------------------------
       7. NAVIGATION
    ----------------------------------------------------- */

    setupNavigation();


    /* -----------------------------------------------------
       8. PAGE INFORMATION
    ----------------------------------------------------- */

    updatePageInformation();


    /* -----------------------------------------------------
       9. LOAD PAGE-SPECIFIC JAVASCRIPT
    ----------------------------------------------------- */

    await loadPageScript();


    /* -----------------------------------------------------
       10. FINAL PAGE UPDATE
    ----------------------------------------------------- */

    updatePageInformation();


    console.log(
      "CHAMA LIVE ready."
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
