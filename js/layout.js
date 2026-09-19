Yes. Below is the complete revised layout.js, preserving your existing structure and adding only the Member Activities integration.
/* =========================================================
   CHAMA LIVE — GLOBAL LAYOUT
   PORTAL-AWARE VERSION
   TOP NAV + SIDEBAR NAV + MOBILE MENU + MOBILE BOTTOM NAV

   PORTAL CONTRACT:
   - member → Member Portal
   - admin → Admin Portal
   - chairperson → Admin Portal
   - secretary → Admin Portal
   - treasurer → Admin Portal
   - isOwner → Admin Portal
   - unsupported role → blocked

   MEMBER PORTAL:
   - member-dashboard.html
   - member-contributions.html
   - member-activities.html
   - getting-started.html
   - Existing admin-management pages remain blocked until
     their own member-safe/read-only contract is reconciled.

   IMPORTANT:
   - Billing is intentionally not exposed to members.
   - Data Migration is intentionally not exposed to members.
   - Existing Contributions page remains Admin Portal only.
   - member-contributions.html is a separate member-safe page.
   - member-activities.html is a separate member-safe page.
   - No database authorization is changed here.
========================================================= */

import { supabase } from "./supabase.js";

import {
  getMyApplicationContext
} from "./auth.js";

console.log("CHAMA LIVE: layout.js loaded");


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;

let currentIsOwner = false;
let currentRole = "";

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
   ROLE HELPERS
========================================================= */

const ADMIN_ROLES =
  new Set([
    "admin",
    "chairperson",
    "secretary",
    "treasurer"
  ]);


function isAdminPortal() {

  return (
    currentIsOwner ||
    ADMIN_ROLES.has(currentRole)
  );

}


function isMemberPortal() {

  return (
    !currentIsOwner &&
    currentRole === "member"
  );

}


/* =========================================================
   CANONICAL APPLICATION NAVIGATION
========================================================= */

const APPLICATION_NAVIGATION = [

  {
    href: "dashboard.html",
    page: "dashboard.html",
    label: "Dashboard"
  },

  {
    href: "members.html",
    page: "members.html",
    label: "Members"
  },

  {
    href: "contributions.html",
    page: "contributions.html",
    label: "Contributions"
  },

  {
    href: "expenses.html",
    page: "expenses.html",
    label: "Expenses"
  },

  {
    href: "meetings.html",
    page: "meetings.html",
    label: "Meetings"
  },

  {
    href: "reports.html",
    page: "reports.html",
    label: "Reports"
  },

  {
    href: "monthly-closing.html",
    page: "monthly-closing.html",
    label: "Monthly Closing"
  },

  {
    href: "group-management.html",
    page: "group-management.html",
    label: "Group Management"
  },

  {
    href: "assets.html",
    page: "assets.html",
    label: "Assets"
  },

  {
    href: "plans-activities.html",
    page: "plans-activities.html",
    label: "Plans & Activities"
  },

  {
    href: "getting-started.html",
    page: "getting-started.html",
    label: "Getting Started"
  },

  {
    href: "support-welfare.html",
    page: "support-welfare.html",
    label: "Support & Welfare"
  },

  {
    href: "milestones.html",
    page: "milestones.html",
    label: "Milestones"
  },

  {
    href: "data-migration.html",
    page: "data-migration.html",
    label: "Data Migration"
  },

  {
    href: "member-dashboard.html",
    page: "member-dashboard.html",
    label: "My Dashboard"
  },

  {
    href: "member-contributions.html",
    page: "member-contributions.html",
    label: "My Contributions"
  },

  {
    href: "member-activities.html",
    page: "member-activities.html",
    label: "Group Activities"
  }

];


/* =========================================================
   PORTAL PAGE ACCESS
========================================================= */

const ADMIN_PAGES =
  new Set([
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


const MEMBER_PAGES =
  new Set([
    "member-dashboard.html",
    "member-contributions.html",
    "member-activities.html",
    "getting-started.html"
  ]);


/* =========================================================
   PORTAL DESTINATIONS
========================================================= */

const ADMIN_DASHBOARD_URL =
  "dashboard.html";


const MEMBER_DASHBOARD_URL =
  "member-dashboard.html";


/* =========================================================
   DIRECT URL PORTAL GUARD
========================================================= */

function enforcePortalAccess() {

  const currentPage =
    getCurrentPage();


  /* =======================================================
     ADMIN PORTAL
  ======================================================= */

  if (isAdminPortal()) {

    if (
      currentPage ===
      "member-dashboard.html"
    ) {

      console.log(
        "CHAMA LIVE: admin account redirected from member portal"
      );

      window.location.replace(
        ADMIN_DASHBOARD_URL
      );

      return false;

    }


    if (
      currentPage ===
      "member-contributions.html"
    ) {

      /*
       * Member Contributions is intentionally a member-safe
       * portal surface.
       *
       * Admin users remain on the Admin Portal and should use
       * the existing Contributions page.
       */

      window.location.replace(
        ADMIN_DASHBOARD_URL
      );

      return false;

    }


    if (
      currentPage ===
      "member-activities.html"
    ) {

      /*
       * Group Activities is intentionally a member-safe
       * portal surface.
       *
       * Admin users remain on the Admin Portal and should use
       * the existing Plans & Activities page.
       */

      window.location.replace(
        ADMIN_DASHBOARD_URL
      );

      return false;

    }


    return true;

  }


  /* =======================================================
     MEMBER PORTAL
  ======================================================= */

  if (isMemberPortal()) {

    if (
      MEMBER_PAGES.has(
        currentPage
      )
    ) {

      return true;

    }


    if (
      ADMIN_PAGES.has(
        currentPage
      )
    ) {

      console.warn(
        "CHAMA LIVE: member attempted restricted admin page:",
        currentPage
      );

      window.location.replace(
        MEMBER_DASHBOARD_URL
      );

      return false;

    }


    console.warn(
      "CHAMA LIVE: member attempted unknown page:",
      currentPage
    );

    window.location.replace(
      MEMBER_DASHBOARD_URL
    );

    return false;

  }


  /* =======================================================
     UNSUPPORTED ROLE
  ======================================================= */

  throw new Error(
    "Your CHAMA LIVE account does not have a valid portal role."
  );

}


/* =========================================================
   NAVIGATION FILTER
========================================================= */

function getNavigationItems() {

  if (isAdminPortal()) {

    return APPLICATION_NAVIGATION.filter(
      function (item) {

        return (
          item.page !==
          "member-dashboard.html" &&
          item.page !==
          "member-contributions.html" &&
          item.page !==
          "member-activities.html"
        );

      }
    );

  }


  if (isMemberPortal()) {

    return APPLICATION_NAVIGATION.filter(
      function (item) {

        return MEMBER_PAGES.has(
          item.page
        );

      }
    );

  }


  return [];

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

      element.textContent =
        name;

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

      element.textContent =
        name;

    });

}


/* =========================================================
   DESKTOP NAVIGATION
========================================================= */

function reconcileDesktopNavigation() {

  const currentPage =
    getCurrentPage();

  const navigationItems =
    getNavigationItems();

  const navigationContainers = [];

  const topNav =
    document.querySelector(".top-nav");

  if (topNav) {
    navigationContainers.push(topNav);
  }

  document
    .querySelectorAll(".sidebar .nav")
    .forEach(function (nav) {

      if (
        !navigationContainers.includes(nav)
      ) {

        navigationContainers.push(nav);

      }

    });

  if (
    navigationContainers.length === 0
  ) {

    console.log(
      "CHAMA LIVE: no desktop navigation container found"
    );

    return;

  }

  navigationContainers.forEach(
    function (nav) {

      const existingLinks =
        Array.from(
          nav.querySelectorAll(
            ":scope > a"
          )
        );

      existingLinks.forEach(
        function (link) {

          const href =
            (
              link.getAttribute("href") ||
              ""
            )
              .split("#")[0]
              .split("?")[0]
              .trim()
              .toLowerCase();

          const isCanonical =
            navigationItems.some(
              function (item) {

                return (
                  item.page === href
                );

              }
            );

          if (!isCanonical) {

            link.remove();

          }

        }
      );

      const currentLinks =
        Array.from(
          nav.querySelectorAll(
            ":scope > a"
          )
        );

      const currentLinksByPage =
        new Map();

      currentLinks.forEach(
        function (link) {

          const href =
            (
              link.getAttribute("href") ||
              ""
            )
              .split("#")[0]
              .split("?")[0]
              .trim()
              .toLowerCase();

          if (href) {

            currentLinksByPage.set(
              href,
              link
            );

          }

        }
      );

      navigationItems.forEach(
        function (item) {

          let link =
            currentLinksByPage.get(
              item.page
            );

          if (!link) {

            link =
              document.createElement("a");

            link.href =
              item.href;

            nav.appendChild(
              link
            );

          }

          link.href =
            item.href;

          link.textContent =
            item.label;

          link.classList.toggle(
            "active",
            item.page === currentPage
          );

          link.setAttribute(
            "aria-current",
            item.page === currentPage
              ? "page"
              : "false"
          );

        }
      );

      navigationItems.forEach(
        function (item) {

          const link =
            nav.querySelector(
              `:scope > a[href="${item.href}"]`
            );

          if (link) {

            nav.appendChild(
              link
            );

          }

        }
      );

      nav
        .querySelectorAll(
          ':scope > a[aria-current="false"]'
        )
        .forEach(
          function (link) {

            link.removeAttribute(
              "aria-current"
            );

          }
        );

    }
  );

  console.log(
    "CHAMA LIVE: desktop navigation reconciled",
    {
      role:
        currentRole,

      isOwner:
        currentIsOwner,

      portal:
        isMemberPortal()
          ? "member"
          : "admin"
    }
  );

}


/* =========================================================
   GLOBAL MOBILE STYLES
========================================================= */

function injectMobileNavigationStyles() {

  if (byId("chama-global-mobile-styles")) {
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

    .chama-mobile-menu {
      display: none;
    }

    .chama-mobile-menu-backdrop {
      display: none;
    }

    @media (max-width: 650px) {

      .topbar {
        width: 100%;
        position: sticky;
        top: 0;
        z-index: 10000;
      }

      .menu-toggle {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        padding: 0;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        background: #ffffff;
        color: #344054;
        cursor: pointer;
        font-size: 21px;
        line-height: 1;
        flex-shrink: 0;
      }

      .menu-toggle:hover {
        background: #f0fdfa;
        color: #0f766e;
      }

      .menu-toggle:active {
        transform: scale(.96);
      }

      .chama-mobile-menu-backdrop {
        position: fixed;
        inset: 0;
        z-index: 19998;
        background: rgba(15, 23, 42, .38);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
      }

      .chama-mobile-menu {
        position: fixed;
        top: 58px;
        left: 10px;
        right: 10px;
        z-index: 19999;
        display: none;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 16px;
        box-shadow:
          0 18px 45px
          rgba(16, 24, 40, .18);
        overflow: hidden;
        max-height:
          calc(100vh - 75px);
        overflow-y: auto;
      }

      .chama-mobile-menu.open {
        display: block;
      }

      .chama-mobile-menu-header {
        padding: 15px 16px;
        border-bottom: 1px solid #edf0f4;
        background: #f8fafc;
      }

      .chama-mobile-menu-group {
        font-size: 14px;
        font-weight: 800;
        color: #101828;
      }

      .chama-mobile-menu-user {
        margin-top: 2px;
        font-size: 12px;
        color: #667085;
      }

      .chama-mobile-menu-link {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        min-height: 48px;
        padding: 10px 16px;
        text-decoration: none;
        color: #344054;
        font-size: 13px;
        font-weight: 650;
        border-bottom: 1px solid #f2f4f7;
        background: #ffffff;
      }

      .chama-mobile-menu-link:last-child {
        border-bottom: 0;
      }

      .chama-mobile-menu-link:hover {
        background: #f0fdfa;
        color: #0f766e;
      }

      .chama-mobile-menu-link.active {
        background: #ecfdf5;
        color: #0f766e;
        font-weight: 750;
      }

      .chama-mobile-menu-icon {
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        background: #f8fafc;
        font-size: 17px;
        flex-shrink: 0;
      }

      .chama-mobile-menu-link.active
      .chama-mobile-menu-icon {
        background: #d1fae5;
      }

      .mobile-bottom-nav {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 15000;
        display: grid;
        grid-template-columns:
          repeat(5, minmax(0, 1fr));
        height: 72px;
        padding:
          6px 6px
          calc(6px + env(safe-area-inset-bottom));
        background:
          rgba(255, 255, 255, .98);
        border-top: 1px solid #e5e7eb;
        box-shadow:
          0 -5px 20px
          rgba(0, 0, 0, .08);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
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
          background .2s ease,
          color .2s ease,
          transform .2s ease;
      }

      .mobile-nav-item:active {
        transform: scale(.96);
      }

      .mobile-nav-item.active {
        color: #0f766e;
        background: rgba(15, 118, 110, .09);
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
          rgba(15, 118, 110, .30);
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

      .sidebar {
        display: none !important;
      }

      .sidebar-overlay {
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
        padding: 16px 10px 96px 10px !important;
      }

      .table-wrap {
        width: 100%;
        max-width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }

      .grid-2 {
        grid-template-columns: 1fr !important;
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
        grid-template-columns: 1fr;
      }

    }

  `;

  document.head.appendChild(style);

  console.log(
    "CHAMA LIVE: mobile navigation styles ready"
  );

}


/* =========================================================
   MOBILE MENU
========================================================= */

function setupMobileMenu() {

  if (byId("chama-mobile-menu")) {
    return;
  }

  let menuButton =
    document.querySelector(".menu-toggle");

  if (!menuButton) {

    const topbar =
      document.querySelector(".topbar");

    if (!topbar) {

      console.warn(
        "CHAMA LIVE: topbar not found; mobile menu skipped"
      );

      return;

    }

    menuButton =
      document.createElement("button");

    menuButton.className =
      "menu-toggle";

    menuButton.type =
      "button";

    menuButton.id =
      "mobileMenuButton";

    menuButton.setAttribute(
      "aria-label",
      "Open menu"
    );

    menuButton.setAttribute(
      "aria-expanded",
      "false"
    );

    menuButton.textContent =
      "☰";

    topbar.insertBefore(
      menuButton,
      topbar.firstChild
    );

  }

  menuButton.id =
    menuButton.id ||
    "mobileMenuButton";

  menuButton.setAttribute(
    "aria-controls",
    "chama-mobile-menu"
  );


  /* =====================================================
     BACKDROP
  ===================================================== */

  const backdrop =
    document.createElement("div");

  backdrop.className =
    "chama-mobile-menu-backdrop";

  backdrop.id =
    "chama-mobile-menu-backdrop";


  /* =====================================================
     MENU
  ===================================================== */

  const menu =
    document.createElement("div");

  menu.className =
    "chama-mobile-menu";

  menu.id =
    "chama-mobile-menu";

  menu.setAttribute(
    "aria-label",
    "CHAMA LIVE menu"
  );


  /* =====================================================
     MENU HEADER
  ===================================================== */

  const header =
    document.createElement("div");

  header.className =
    "chama-mobile-menu-header";


  const group =
    document.createElement("div");

  group.className =
    "chama-mobile-menu-group";

  group.textContent =
    currentGroup?.name ||
    currentGroup?.group_name ||
    "CHAMA";


  const user =
    document.createElement("div");

  user.className =
    "chama-mobile-menu-user";

  user.textContent =
    currentMember?.name ||
    currentMember?.full_name ||
    "Member";


  header.appendChild(group);
  header.appendChild(user);

  menu.appendChild(header);


  /* =====================================================
     ADMIN MENU
  ===================================================== */

  const adminMenuItems = [

    {
      href: "dashboard.html",
      page: "dashboard.html",
      icon: "⌂",
      label: "Dashboard"
    },

    {
      href: "members.html",
      page: "members.html",
      icon: "♙",
      label: "Members"
    },

    {
      href: "contributions.html",
      page: "contributions.html",
      icon: "+",
      label: "Contributions"
    },

    {
      href: "expenses.html",
      page: "expenses.html",
      icon: "−",
      label: "Expenses"
    },

    {
      href: "meetings.html",
      page: "meetings.html",
      icon: "◷",
      label: "Meetings"
    },

    {
      href: "reports.html",
      page: "reports.html",
      icon: "▤",
      label: "Reports"
    },

    {
      href: "monthly-closing.html",
      page: "monthly-closing.html",
      icon: "✓",
      label: "Monthly Closing"
    },

    {
      href: "group-management.html",
      page: "group-management.html",
      icon: "⚙",
      label: "Group Management"
    },

    {
      href: "assets.html",
      page: "assets.html",
      icon: "▣",
      label: "Assets"
    },

    {
      href: "plans-activities.html",
      page: "plans-activities.html",
      icon: "◫",
      label: "Plans & Activities"
    },

    {
      href: "getting-started.html",
      page: "getting-started.html",
      icon: "?",
      label: "Getting Started"
    },

    {
      href: "support-welfare.html",
      page: "support-welfare.html",
      icon: "♡",
      label: "Support & Welfare"
    },

    {
      href: "milestones.html",
      page: "milestones.html",
      icon: "★",
      label: "Milestones"
    },

    {
      href: "data-migration.html",
      page: "data-migration.html",
      icon: "⇅",
      label: "Data Migration"
    }

  ];


  /* =====================================================
     MEMBER MENU
  ===================================================== */

  const memberMenuItems = [

    {
      href: "member-dashboard.html",
      page: "member-dashboard.html",
      icon: "⌂",
      label: "My Dashboard"
    },

    {
      href: "member-contributions.html",
      page: "member-contributions.html",
      icon: "+",
      label: "My Contributions"
    },

    {
      href: "member-activities.html",
      page: "member-activities.html",
      icon: "◷",
      label: "Group Activities"
    },

    {
      href: "getting-started.html",
      page: "getting-started.html",
      icon: "?",
      label: "Getting Started"
    }

  ];


  const menuItems =
    isMemberPortal()
      ? memberMenuItems
      : adminMenuItems;


  const currentPage =
    getCurrentPage();


  menuItems.forEach(function (item) {

    const link =
      document.createElement("a");

    link.href =
      item.href;

    link.className =
      "chama-mobile-menu-link";

    link.dataset.page =
      item.page;


    if (
      item.page ===
      currentPage
    ) {

      link.classList.add(
        "active"
      );

      link.setAttribute(
        "aria-current",
        "page"
      );

    }


    const icon =
      document.createElement("span");

    icon.className =
      "chama-mobile-menu-icon";

    icon.setAttribute(
      "aria-hidden",
      "true"
    );

    icon.textContent =
      item.icon;


    const label =
      document.createElement("span");

    label.textContent =
      item.label;


    link.appendChild(icon);
    link.appendChild(label);

    menu.appendChild(link);

  });


  document.body.appendChild(
    backdrop
  );

  document.body.appendChild(
    menu
  );


  /* =====================================================
     OPEN / CLOSE
  ===================================================== */

  function openMenu() {

    menu.classList.add(
      "open"
    );

    backdrop.style.display =
      "block";

    menuButton.setAttribute(
      "aria-expanded",
      "true"
    );

    menuButton.setAttribute(
      "aria-label",
      "Close menu"
    );

    menuButton.textContent =
      "×";

  }


  function closeMenu() {

    menu.classList.remove(
      "open"
    );

    backdrop.style.display =
      "none";

    menuButton.setAttribute(
      "aria-expanded",
      "false"
    );

    menuButton.setAttribute(
      "aria-label",
      "Open menu"
    );

    menuButton.textContent =
      "☰";

  }


  menuButton.addEventListener(
    "click",
    function (event) {

      event.preventDefault();

      if (
        menu.classList.contains("open")
      ) {

        closeMenu();

      }
      else {

        openMenu();

      }

    }
  );


  backdrop.addEventListener(
    "click",
    function () {

      closeMenu();

    }
  );


  document.addEventListener(
    "keydown",
    function (event) {

      if (
        event.key === "Escape"
      ) {

        closeMenu();

      }

    }
  );


  menu
    .querySelectorAll("a")
    .forEach(function (link) {

      link.addEventListener(
        "click",
        function () {

          closeMenu();

        }
      );

    });


  console.log(
    "CHAMA LIVE: mobile menu ready"
  );

}


/* =========================================================
   MOBILE BOTTOM NAVIGATION
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


  /* =======================================================
     MEMBER BOTTOM NAV
  ======================================================= */

  if (isMemberPortal()) {

    addLink(
      "member-dashboard.html",
      "member-dashboard.html",
      "⌂",
      "Home",
      false
    );

    addLink(
      "member-contributions.html",
      "member-contributions.html",
      "+",
      "Contributions",
      true
    );

    addLink(
      "getting-started.html",
      "getting-started.html",
      "?",
      "Guide",
      false
    );

    addLink(
      "member-activities.html",
      "member-activities.html",
      "◷",
      "Activity",
      false
    );

    addLink(
      "member-dashboard.html",
      "member-dashboard.html",
      "♙",
      "Profile",
      false
    );

  }


  /* =======================================================
     ADMIN BOTTOM NAV
  ======================================================= */

  else {

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

  }


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

        item.setAttribute(
          "aria-current",
          "page"
        );

      }

    });


  console.log(
    "CHAMA LIVE: mobile bottom navigation ready"
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
   LOAD APPLICATION CONTEXT
========================================================= */

async function loadLayoutData() {

  console.log(
    "CHAMA LIVE: loading application context"
  );


  const {
    user,
    member,
    group,
    isOwner,
    role
  } =
    await getMyApplicationContext();


  if (!user) {

    throw new Error(
      "You are not logged in."
    );

  }


  if (!member) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  if (!member.group_id) {

    throw new Error(
      "Your member record has no group."
    );

  }


  if (!group) {

    throw new Error(
      "Group information could not be found."
    );

  }


  currentUser =
    user;

  currentMember =
    member;

  currentGroup =
    group;

  currentIsOwner =
    Boolean(
      isOwner
    );

  currentRole =
    String(
      role || ""
    )
      .trim()
      .toLowerCase();


  displayUser(
    currentMember
  );

  displayGroup(
    currentGroup
  );


  console.log(
    "CHAMA LIVE: application context loaded",
    {
      user: currentUser,
      member: currentMember,
      group: currentGroup,
      isOwner: currentIsOwner,
      role: currentRole
    }
  );


  return {
    user:
      currentUser,

    member:
      currentMember,

    group:
      currentGroup,

    isOwner:
      currentIsOwner,

    role:
      currentRole

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
    "./group-management.js",

  "member-dashboard.html":
    "./member-dashboard.js",

  "member-contributions.html":
    "./member-contributions.js",

  "member-activities.html":
    "./member-activities.js"

  /*
   * Independently booted pages remain absent:
   *
   * - assets.html
   * - plans-activities.html
   * - getting-started.html
   * - support-welfare.html
   * - milestones.html
   * - data-migration.html
   *
   * Their own modules control their boot sequence.
   */

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


    if (
      typeof pageModule.initPage ===
      "function"
    ) {

      initializer =
        pageModule.initPage;

    }

    else if (
      page === "dashboard.html" &&
      typeof pageModule.initDashboard ===
      "function"
    ) {

      initializer =
        pageModule.initDashboard;

    }

    else if (
      page === "members.html" &&
      typeof pageModule.initMembers ===
      "function"
    ) {

      initializer =
        pageModule.initMembers;

    }

    else if (
      page === "contributions.html" &&
      typeof pageModule.initContributions ===
      "function"
    ) {

      initializer =
        pageModule.initContributions;

    }

    else if (
      page === "expenses.html" &&
      typeof pageModule.initExpenses ===
      "function"
    ) {

      initializer =
        pageModule.initExpenses;

    }

    else if (
      page === "meetings.html" &&
      typeof pageModule.initMeetings ===
      "function"
    ) {

      initializer =
        pageModule.initMeetings;

    }

    else if (
      page === "reports.html" &&
      typeof pageModule.initReports ===
      "function"
    ) {

      initializer =
        pageModule.initReports;

    }

    else if (
      page === "monthly-closing.html" &&
      typeof pageModule.initMonthlyClosing ===
      "function"
    ) {

      initializer =
        pageModule.initMonthlyClosing;

    }

    else if (
      page === "group-management.html" &&
      typeof pageModule.initGroupManagement ===
      "function"
    ) {

      initializer =
        pageModule.initGroupManagement;

    }

    else if (
      page === "member-dashboard.html" &&
      typeof pageModule.initMemberDashboard ===
      "function"
    ) {

      initializer =
        pageModule.initMemberDashboard;

    }

    else if (
      page === "member-contributions.html" &&
      typeof pageModule.initMemberContributions ===
      "function"
    ) {

      initializer =
        pageModule.initMemberContributions;

    }

    else if (
      page === "member-activities.html" &&
      typeof pageModule.initMemberActivities ===
      "function"
    ) {

      initializer =
        pageModule.initMemberActivities;

    }

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


  const {
    user
  } =
    await getMyApplicationContext();


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
   * 2. Authentication + application context
   */

  await loadLayoutData();


  /*
   * 3. Portal/direct-URL authorization
   */

  const accessGranted =
    enforcePortalAccess();


  if (!accessGranted) {

    return;

  }


  /*
   * 4. Desktop navigation
   */

  reconcileDesktopNavigation();


  /*
   * 5. Logout
   */

  setupLogout();


  /*
   * 6. Full mobile menu
   */

  setupMobileMenu();


  /*
   * 7. Mobile bottom navigation
   */

  setupMobileNavigation();


  /*
   * 8. Current page script
   */

  await loadCurrentPageScript();


  console.log(
    "CHAMA LIVE: layout initialized successfully"
  );

}


/* =========================================================
   PUBLIC BOOT
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

    user:
      currentUser,

    member:
      currentMember,

    group:
      currentGroup,

    isOwner:
      currentIsOwner,

    role:
      currentRole

  };

}


console.log(
  "CHAMA LIVE: layout.js ready — portal-aware boot() exported"
);
Controlled change set
This version adds only the Member Activities portal integration:
member-activities.html is a recognized Member Portal page.
Members get Group Activities in the mobile menu.
Members get Activity in the bottom navigation.
The Activity bottom-nav button now opens member-activities.html.
Admins are redirected away from the member-only page.
Members attempting the admin plans-activities.html page are still redirected to their Member Dashboard.
layout.js automatically loads ./member-activities.js.
It expects member-activities.js to export initMemberActivities().
No Supabase/database authorization or schema is changed.
Existing Admin Plans & Activities remains untouched.
One important upload rule: because this layout.js now owns the page-script loading, your member-activities.html should not separately import member-activities.js. Otherwise the module can initialize twice.
