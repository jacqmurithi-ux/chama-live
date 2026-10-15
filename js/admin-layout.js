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

   FINES
   ---------------------------------------------------------
   fines.html is an admin page.
   fines.js exports initFines().

   Fines F1 is read-only.
   No accounting mutations are performed by this layout.

   ADD MEMBER
   ---------------------------------------------------------
   add-member.html is a dedicated admin page.

   It MUST NOT load members.js.

   add-member.js is the sole feature module for the
   Add Member page and must export:

     addMemberInit()

   The Add Member feature owns:
   - member form state
   - validation
   - contribution-plan UI
   - historical-contribution UI
   - RPC submission
   - RPC error mapping
   - success result
   - retry / reset handling

   The backend remains authoritative for all writes.

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

import { applyRolePermissions } from "./role-permissions.js?v=loan-export-policy-20261013";
import { supabase } from "./supabase.js";


/* =========================================================
   ADMIN ROLES
========================================================= */

const ADMIN_ROLES = new Set([
  "admin",
  "chairperson",
  "secretary",
  "treasurer",
  "administrator",
  "vice chairperson",
  "vice secretary"
]);


/* =========================================================
   ADMIN PAGE ALLOWLIST
========================================================= */

const ADMIN_PAGES = new Set([
  "dashboard.html",
  "documents.html",
  "members.html",

  /*
   * Dedicated Add Member page.
   *
   * This is intentionally separate from members.html.
   * It has its own page module and does NOT load members.js.
   */
  "add-member.html",

  "contributions.html",
  "merry-go-round.html",
  "loans.html",
  "expenses.html",
  "fines.html",
  "meetings.html",
  "reports.html",
  "monthly-closing.html",
  "group-management.html",
  "group-settings.html",
  "billing.html",
  "assets.html",
  "plans-activities.html",
  "welfare.html",
  "milestones.html",
  "data-migration.html",
  "admin-getting-started.html",
  "admin-my-account.html"
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

   ADD MEMBER
   ---------------------------------------------------------
   add-member.html deliberately points to add-member.js.

   It does NOT point to members.js.

   The expected exported initializer is:

     addMemberInit()
========================================================= */

const PAGE_SCRIPTS = {

  "dashboard.html": [
    "./dashboard.js?v=20261015-cumulative-amount-alignment1",
    "initDashboard"
  ],

  "documents.html": [
    "./documents.js?v=20261015-documents1",
    "initDocuments"
  ],

  "members.html": [
    "./members.js",
    "init"
  ],

  "add-member.html": [
    "./add-member.js",
    "addMemberInit"
  ],

  "contributions.html": [
    "./contributions.js?v=20261009-treasurer-custom-draft2",
    "initContributions"
  ],

  "merry-go-round.html": [
    "./merry-go-round.js?v=df3bc51-safe-cycle-delete",
    "initMerryGoRound"
  ],

  "loans.html": [
    "./loans.js?v=20261015-loan-syntax-fix1",
    "initLoans"
  ],

  "expenses.html": [
    "./expenses.js",
    "initPage"
  ],

  "fines.html": [
    "./fines.js",
    "initFines"
  ],

  "meetings.html": [
    "./meetings.js?v=20261009-meetings-schema-fix3",
    "initPage"
  ],

  "reports.html": [
    "./reports.js?v=20261015-custom-member-obligations",
    "initPage"
  ],

  "monthly-closing.html": [
    "./monthly-closing.js?v=20261009-closed-guard",
    "initPage"
  ],

  "group-management.html": [
    "./group-management.js",
    "initGroupManagement"
  ],

  "group-settings.html": [
    "./group-settings.js?v=20261015-admin-module-settings1",
    "initGroupSettings"
  ],

  "billing.html": [
    "./billing.js",
    "initBilling"
  ],

  "plans-activities.html": [
    "./plans-activities.js",
    "initPage"
  ],

  "welfare.html": [
    "./welfare.js?v=20261015-welfare-ui-audit1",
    "initPage"
  ],

  "milestones.html": [
    "./milestones.js",
    "initPage"
  ],

  "assets.html": [
    "./assets.js",
    "initPage"
  ],

  "admin-my-account.html": [
    "./my-account.js?v=20261013-shared-account1",
    "initMyAccount"
  ]

};


/* =========================================================
   STATE
========================================================= */

let bootStarted = false;

let context = null;


/* =========================================================
   SHARED ADMIN PORTAL SHELL
   ========================================================= */

function formatRoleLabel(role) {
  return String(role || "Member")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, character => character.toUpperCase());
}

function ensureAdminPortalShell() {
  let header = document.querySelector("header.topbar, .topbar");
  if (!header) {
    header = document.createElement("header");
    header.className = "topbar";
    document.body.prepend(header);
  }
  let inner = header.querySelector(".topbar-inner");
  if (!inner) {
    inner = document.createElement("div");
    inner.className = "topbar-inner";
    while (header.firstChild) inner.appendChild(header.firstChild);
    header.appendChild(inner);
  }
  let brand = inner.querySelector(".brand") || header.querySelector(".brand");
  if (!brand) {
    brand = document.createElement("a");
    brand.className = "brand";
    brand.innerHTML = 'CHAMA <span>LIVE</span>';
  } else if (brand.tagName !== "A") {
    const brandLink = document.createElement("a");
    brandLink.className = brand.className || "brand";
    brandLink.innerHTML = brand.innerHTML || brand.textContent || "CHAMA LIVE";
    brand.replaceWith(brandLink);
    brand = brandLink;
  }
  brand.href = "dashboard.html";
  inner.prepend(brand);
  let topNav = header.querySelector(".top-nav");
  if (!topNav) {
    topNav = document.createElement("nav");
    topNav.className = "top-nav";
    topNav.setAttribute("aria-label", "Admin navigation");
  }
  inner.appendChild(topNav);
  let actions = inner.querySelector(".topbar-actions") || header.querySelector(".topbar-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "topbar-actions";
  }
  inner.appendChild(actions);
  const name = header.querySelector("[data-user-name]");
  if (name) actions.prepend(name);
  else {
    const label = document.createElement("span");
    label.className = "muted user-name";
    label.setAttribute("data-user-name", "");
    actions.prepend(label);
  }
  let logout = document.getElementById("logout");
  if (!logout) {
    logout = document.createElement("button");
    logout.id = "logout";
    logout.type = "button";
    logout.className = "btn btn-secondary";
    logout.textContent = "Sign out";
  }
  logout.type = "button";
  actions.appendChild(logout);
  const userLabel = actions.querySelector("[data-user-name]");
  if (userLabel) {
    userLabel.textContent = context?.member?.name ||
      context?.member?.full_name || context?.user?.email || "Account";
  }
  let roleLabel = actions.querySelector("[data-user-role]");
  if (!roleLabel) {
    roleLabel = document.createElement("span");
    roleLabel.className = "muted chama-topbar-user-role";
    roleLabel.setAttribute("data-user-role", "");
    roleLabel.style.fontSize = "0.75rem";
    roleLabel.style.fontWeight = "700";
    roleLabel.style.whiteSpace = "nowrap";
    actions.insertBefore(roleLabel, actions.querySelector("[data-topbar-group-name]") || logout);
  }
  roleLabel.textContent = formatRoleLabel(context?.role || context?.member?.role);

  let groupLabel = actions.querySelector("[data-topbar-group-name]");
  if (!groupLabel) {
    groupLabel = document.createElement("span");
    groupLabel.className = "muted chama-topbar-group-name";
    groupLabel.setAttribute("data-topbar-group-name", "");
    groupLabel.style.fontSize = "0.85rem";
    groupLabel.style.fontWeight = "600";
    groupLabel.style.whiteSpace = "nowrap";
    actions.insertBefore(groupLabel, logout);
  }
  groupLabel.textContent = "· " + (
    context?.group?.name || context?.member?.group_name || "CHAMA"
  );
  inner.querySelectorAll(".topbar-left, .topbar-right").forEach(wrapper => {
    if (!wrapper.querySelector("*") && !wrapper.textContent.trim()) wrapper.remove();
  });
  return header;
}

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
      ["dashboard.html", "Dashboard"],
      ["documents.html?portal=admin", "Documents"],
      ["admin-getting-started.html", "Getting Started"]
    ]
  ],

  [
    "Members",
    [
      ["members.html", "Members"],
      ["add-member.html", "Add Member"]
    ]
  ],

  [
    "Finance",
    [
      ["contributions.html", "Contributions"],
      ["merry-go-round.html", "Merry-go-round"],
      ["loans.html", "Loans"],
      ["expenses.html", "Expenses"],
      ["fines.html", "Fines"],
      ["reports.html", "Reports"],
      ["monthly-closing.html", "Monthly Closing"]
    ]
  ],

  [
    "Group",
    [
      ["meetings.html", "Meetings"],
      ["plans-activities.html", "Plans & Activities"],
      ["milestones.html", "Milestones"],
      ["assets.html", "Assets"],
      ["welfare.html", "Welfare"]
    ]
  ],

  [
    "Management",
    [
      ["group-management.html", "Group Management"],
      ["group-settings.html", "Group Settings"],
      ["data-migration.html", "Data Migration"],
      ["billing.html", "Billing"]
    ]
  ],

  [
    "Account",
    [
      ["member-my-account.html", "View My Account"]
    ]
  ]

];


/* =========================================================
   STYLES
========================================================= */

function injectStyles() {
  if (document.getElementById("chama-admin-layout")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "chama-admin-layout";

  style.textContent = `
    .topbar {
      position: sticky;
      top: 0;
      z-index: 12000;
      width: 100%;
      box-sizing: border-box;
      background: #ffffff;
      border-bottom: 1px solid #e5e7eb;
    }

    .topbar-inner {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      max-width: 1600px;
      min-height: 68px;
      margin: 0 auto;
      padding: 10px 20px;
      box-sizing: border-box;
    }

    .topbar .brand {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex: 0 0 auto;
      color: #0f766e;
      text-decoration: none;
      font-size: 17px;
      font-weight: 850;
      white-space: nowrap;
    }

    .topbar .brand span {
      color: #344054;
    }

    .topbar .top-nav {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex: 1 1 auto;
      min-width: 0;
      overflow: visible;
    }

    .topbar .topbar-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      flex: 0 0 auto;
      min-width: 0;
    }

    .topbar [data-user-role] {
      color: #0f766e;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }

    .topbar [data-user-name] {
      max-width: 170px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #475467;
      font-size: 12px;
      font-weight: 600;
    }

    .sidebar,
    .sidebar-nav {
      display: none !important;
    }

    .layout {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    .layout > .main,
    .layout > main,
    .main-content {
      width: 100%;
      max-width: 100%;
      margin-left: 0 !important;
      box-sizing: border-box;
    }

    .topbar-actions #logout {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 8px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      background: #ffffff;
      color: #344054;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }

    /*
     * DESKTOP-SITE VIEW ON MOBILE / TABLET
     *
     * Do not horizontally scroll the top navigation.
     * An overflow container can clip the dropdown panels.
     * Put the navigation on its own row and allow wrapping.
     */
    @media (max-width: 1100px) and (min-width: 821px) {
      .topbar-inner {
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        padding-right: 12px;
        padding-left: 12px;
      }

      .topbar .brand {
        flex: 0 0 auto;
      }

      .topbar .topbar-actions {
        gap: 6px;
        margin-left: auto;
      }

      .topbar [data-user-name] {
        max-width: 80px;
      }

      .topbar .top-nav {
        order: 3;
        display: block;
        position: relative;
        flex: 1 1 100%;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        overflow: visible;
        z-index: 12001;
      }

      .chama-admin-nav {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 4px;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        flex-wrap: wrap;
        overflow: visible;
        margin-left: 0;
      }

      .chama-admin-group {
        position: relative;
        flex: 0 0 auto;
      }

      .chama-admin-group > summary {
        padding-right: 7px;
        padding-left: 7px;
        font-size: 11px;
      }

      .chama-admin-group-panel {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        z-index: 20000;
      }

      .chama-admin-group[open] {
        z-index: 20001;
      }
    }

    @media (max-width: 820px) {
      .topbar-inner {
        min-height: 60px;
        gap: 10px;
        padding: 8px 12px;
      }

      .topbar .top-nav {
        display: none !important;
      }

      .topbar .topbar-actions {
        margin-left: auto;
        gap: 7px;
      }

      .topbar [data-user-name] {
        max-width: 105px;
        font-size: 11px;
      }
    }

    .chama-admin-nav {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
      min-width: 0;
      overflow: visible;
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

    .chama-admin-group summary::after {
      content: "▾";
      margin-left: 7px;
      font-size: 10px;
      opacity: 0.72;
    }

    .chama-admin-group[open] > summary::after {
      content: "▴";
    }

    .chama-admin-group[open] {
      z-index: 20001;
    }

    .chama-admin-group summary:focus-visible,
    .chama-admin-group-panel a:focus-visible {
      outline: 2px solid #0f766e;
      outline-offset: 2px;
    }

    .chama-admin-group-panel {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      min-width: 220px;
      padding: 6px;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      box-shadow: 0 18px 45px rgba(16, 24, 40, 0.14);
      z-index: 20000;
    }

    .chama-admin-group-panel a {
      display: flex;
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

    @media (max-width: 820px) {
      .sidebar,
      .sidebar-nav {
        display: none !important;
      }

      .layout {
        display: block !important;
      }

      .layout > .main,
      .layout > main,
      .main-content {
        width: 100%;
        max-width: 100%;
        margin-left: 0 !important;
        box-sizing: border-box;
      }

      body {
        padding-bottom: calc(78px + env(safe-area-inset-bottom)) !important;
      }

      .topbar-inner {
        flex-wrap: wrap;
        align-items: center;
      }

      .top-nav {
        display: block !important;
        order: 3;
        flex: 1 1 100%;
        width: 100%;
        max-width: 100%;
        overflow: visible;
      }

      /*
       * Do not use overflow-x:auto here.
       * Keep dropdowns outside the navigation's clipping area.
       */
      .chama-admin-nav {
        display: flex !important;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        overflow: visible;
        padding: 5px 0 8px;
        touch-action: manipulation;
      }

      .chama-admin-group {
        position: relative;
        flex: 0 0 auto;
      }

      .chama-admin-group > summary {
        min-height: 44px;
        padding: 10px 12px;
        font-size: 13px;
        touch-action: manipulation;
      }

      /*
       * Fixed dropdown panels fit the viewport and remain
       * accessible above the mobile bottom navigation.
       */
      .chama-admin-group-panel {
        position: fixed;
        top: auto;
        left: 8px;
        right: 8px;
        bottom: calc(72px + env(safe-area-inset-bottom));
        width: auto;
        min-width: 0;
        max-height: min(58vh, 420px);
        overflow-y: auto;
        overscroll-behavior: contain;
        z-index: 20002;
      }

      .chama-admin-group-panel a {
        min-height: 46px;
        font-size: 14px;
        white-space: normal;
        touch-action: manipulation;
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
        top: 0;
        right: 0;
        bottom: 0;
        left: auto;
        width: min(88vw, 340px);
        max-height: none;
        overflow-y: auto;
        padding: 20px 16px;
        box-sizing: border-box;
        background: #ffffff;
        border: 0;
        border-left: 1px solid #e5e7eb;
        border-radius: 0;
        z-index: 20001;
        box-shadow: -10px 0 30px rgba(16, 24, 40, 0.16);
        opacity: 0;
        transform: translateX(12px);
        pointer-events: none;
      }

      .chama-mobile-menu.open {
        display: block;
        opacity: 1;
        transform: translateX(0);
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
        height: auto;
        min-height: 64px;
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 4px;
        padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
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
        min-height: 44px;
        padding: 5px 3px;
        border-radius: 10px;
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
      .chama-admin-bottom a {
        font-size: 9px;
      }
    }

    /* Shared desktop content frame: keep admin tools readable instead of edge-to-edge. */
    @media (min-width: 821px) {
      .layout > .main,
      .layout > main,
      .main-content,
      .page-content {
        width: min(calc(100% - 40px), 1440px);
        max-width: 1440px;
        margin-left: auto !important;
        margin-right: auto !important;
        box-sizing: border-box;
      }
    }
  `;

  document.head.appendChild(style);
}


/* =========================================================
   DESKTOP NAVIGATION
========================================================= */

async function loadOptionalModuleFlags() {
  const groupId = context?.member?.group_id;
  const defaults = { plans: false, assets: false, milestones: false, migration: false };
  try {
    const [{ data: existingData, error: existingError }, { data: moduleData, error: moduleError }] = await Promise.all([
      supabase.rpc("get_group_module_settings", { p_group_id: groupId }),
      supabase.rpc("get_group_optional_modules", { p_group_id: groupId })
    ]);
    if (existingError) throw existingError;
    if (moduleError) throw moduleError;
    const row = Array.isArray(existingData) ? existingData[0] : existingData;
    const modules = moduleData && typeof moduleData === "object"
      ? Object.fromEntries(Object.keys(defaults).map(key => [key, moduleData[key] === true]))
      : defaults;
    if (context) context.group = {
      ...(context.group || {}),
      merry_go_round_enabled: row?.merry_go_round_enabled === true,
      loans_enabled: row?.loans_enabled === true,
      modules
    };
  } catch (error) {
    console.warn("[CHAMA LIVE] Optional module navigation is hidden because settings could not be verified.", error);
    if (context) context.group = {
      ...(context.group || {}), merry_go_round_enabled: false, loans_enabled: false, modules: defaults
    };
  }
}

function normalizedPosition(position) {
  return String(position || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\\s+/g, " ");
}

export function canViewSettings(position = context?.role || context?.member?.role) {
  return ["admin", "administrator"].includes(normalizedPosition(position));
}

export function isModuleOn(key) {
  return context?.group?.modules?.[key] === true;
}

function showLayoutNotice(message) {
  if (!message || !document.body) return;
  const notice = document.createElement("div");
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  notice.textContent = message;
  notice.style.cssText = "position:fixed;z-index:20000;top:82px;left:50%;transform:translateX(-50%);max-width:min(92vw,620px);padding:12px 16px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:12px;box-shadow:0 8px 28px #0002;font-weight:700";
  document.body.appendChild(notice);
  window.setTimeout(() => notice.remove(), 6500);
}

function redirectWithNotice(message, target = "dashboard.html") {
  try { sessionStorage.setItem("chama-layout-notice", message); } catch (_) {}
  window.location.replace(target);
}

export function guardPage({ module, roles } = {}) {
  if (module && !isModuleOn(module)) {
    redirectWithNotice("This module isn't activated for your group.");
    return false;
  }
  if (Array.isArray(roles) && !roles.some(role => normalizedPosition(role) === normalizedPosition(context?.role || context?.member?.role))) {
    redirectWithNotice("No access");
    return false;
  }
  return true;
}

function visibleNavigationGroups() {
  return NAVIGATION_GROUPS.map(([title, items]) => [title, items.filter(([href]) => {
    const page = href.split("?")[0];
    if (page === "merry-go-round.html") return context?.group?.merry_go_round_enabled === true;
    if (page === "loans.html") return context?.group?.loans_enabled === true;
    if (page === "group-settings.html") return canViewSettings();
    if (page === "plans-activities.html") return isModuleOn("plans");
    if (page === "assets.html") return isModuleOn("assets");
    if (page === "milestones.html") return isModuleOn("milestones");
    if (page === "data-migration.html") return isModuleOn("migration") && canViewSettings();
    return true;
  })]).filter(([, items]) => items.length > 0);
}

function renderDesktopNavigation() {

  const target =
    document.querySelector(".topbar .top-nav");

  if (!target) {
    return;
  }

  target.replaceChildren();

  const nav = document.createElement("nav");
  nav.className = "chama-admin-nav";
  nav.setAttribute("aria-label", "Admin navigation");

  const currentPage = getCurrentPage();

  for (const [title, items] of visibleNavigationGroups()) {
    const details = document.createElement("details");
    details.className = "chama-admin-group";

    // Keep the active page's category expanded so users can see
    // where the current page belongs without losing the dropdown menus.
    if (items.some(([href]) => href === currentPage)) {
      details.open = true;
    }

    const summary = document.createElement("summary");
    summary.textContent = title;
    details.appendChild(summary);

    const panel = document.createElement("div");
    panel.className = "chama-admin-group-panel";

    for (const [href, label] of items) {
      panel.appendChild(createNavLink(href, label));
    }

    details.appendChild(panel);
    nav.appendChild(details);
  }

  target.appendChild(nav);
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
    of visibleNavigationGroups()
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


  /*
   * Billing and View My Account are included in the same
   * canonical navigation groups above, avoiding duplicate links.
   */

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

    const topbar =
      document.querySelector(
        ".topbar"
      );

    if (topbarInner) {
      topbarInner.prepend(button);
    } else if (topbar) {
      topbar.prepend(button);
    } else {
      document.body.prepend(button);
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
   ---------------------------------------------------------
   IMPORTANT DIAGNOSTIC VERSION

   This function deliberately separates:

   1. Module resolution
   2. Module import
   3. Initializer resolution
   4. Initializer execution

   This allows a browser syntax/import error to be traced
   to the actual page module instead of making it appear
   that admin-layout.js itself is malformed.

   ADD MEMBER
   ---------------------------------------------------------
   add-member.html resolves exclusively to:

     ./add-member.js

   with initializer:

     addMemberInit

   No members.js import occurs here.
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

    console.info(
      "CHAMA LIVE: Shell-only admin page:",
      page
    );

    return;

  }


  const modulePath =
    entry[0];


  const initializerName =
    entry[1];


  /* ---------------------------------------------------------
     MODULE LOAD DIAGNOSTIC
  --------------------------------------------------------- */

  console.info(
    "CHAMA LIVE: Loading page module:",
    {
      page,
      modulePath,
      initializerName
    }
  );


  let module;


  /* ---------------------------------------------------------
     MODULE IMPORT
  --------------------------------------------------------- */

  try {

    module =
      await import(
        modulePath
      );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: Page module import failed:",
      {
        page,
        modulePath,
        initializerName,
        name:
          error?.name,
        message:
          error?.message,
        stack:
          error?.stack,
        error
      }
    );


    /*
     * Re-throw the ORIGINAL error.
     *
     * The outer boot() catch will display the same
     * diagnostic without masking the actual problem.
     */

    throw error;

  }


  console.info(
    "CHAMA LIVE: Page module imported successfully:",
    {
      page,
      modulePath
    }
  );


  /* ---------------------------------------------------------
     INITIALIZER RESOLUTION
  --------------------------------------------------------- */

  const initializer =
    module?.[initializerName] ||
    module?.initPage ||
    module?.init;


  if (
    typeof initializer !==
    "function"
  ) {

    const exportedNames =
      module
        ? Object.keys(
            module
          )
        : [];


    console.error(
      "CHAMA LIVE: Page initializer missing:",
      {
        page,
        modulePath,
        expected:
          initializerName,
        exports:
          exportedNames
      }
    );


    throw new Error(
      `No initializer exported for ${page}. Expected "${initializerName}". Module exports: ${exportedNames.join(", ") || "(none)"}.`
    );

  }


  /* ---------------------------------------------------------
     INITIALIZER EXECUTION
  --------------------------------------------------------- */

  console.info(
    "CHAMA LIVE: Starting page initializer:",
    {
      page,
      modulePath,
      initializerName
    }
  );


  try {

    await initializer();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: Page initializer failed:",
      {
        page,
        modulePath,
        initializerName,
        name:
          error?.name,
        message:
          error?.message,
        stack:
          error?.stack,
        error
      }
    );


    throw error;

  }


  console.info(
    "CHAMA LIVE: Page initializer completed:",
    {
      page,
      initializerName
    }
  );

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
      !context?.member?.group_id ||
      !context?.user
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


    // The admin's personal account belongs to the self-only Member Portal.
    // Keep the legacy URL working, but never render the admin navigation on it.
    if (page === "admin-my-account.html") {
      window.location.replace("member-my-account.html");
      return;
    }


    stage =
      "page authorization";


    if (!ADMIN_PAGES.has(page)) {
      redirectWithNotice("No access");
      return;
    }

    await loadOptionalModuleFlags();

    if (page === "group-settings.html" && !canViewSettings()) {
      redirectWithNotice("No access");
      return;
    }

    const requiredModule = {
      "plans-activities.html": "plans",
      "assets.html": "assets",
      "milestones.html": "milestones",
      "data-migration.html": "migration"
    }[page];
    if (requiredModule && !isModuleOn(requiredModule)) {
      redirectWithNotice("This module isn't activated for your group.");
      return;
    }

    if (page === "data-migration.html" && !canViewSettings()) {
      redirectWithNotice("No access");
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

    /*
     * Expose the already-resolved admin context to the
     * page feature without importing admin-layout.js back
     * from the feature module. This prevents a circular
     * ES-module dependency during dynamic page loading.
     */
    window.__CHAMA_LIVE_ADMIN_CONTEXT__ =
      context;


    /* -------------------------------------------------------
       ADMIN NAVIGATION
    ------------------------------------------------------- */

    stage =
      "admin navigation";


    ensureAdminPortalShell();

    injectStyles();

    renderDesktopNavigation();

    renderMobileNavigation();

    renderMobileBottomNavigation();

    try {
      const notice = sessionStorage.getItem("chama-layout-notice");
      if (notice) { sessionStorage.removeItem("chama-layout-notice"); showLayoutNotice(notice); }
    } catch (_) {}

    bindAdminLogout();


    /* -------------------------------------------------------
       CURRENT PAGE MODULE
    ------------------------------------------------------- */

    stage =
      `${page} module`;


    await loadCurrentPageFeature();

    /*
     * Apply the shared candidate permission contract after the
     * feature renders its controls. This does not replace backend
     * authorization. Only controls explicitly tagged with
     * data-permission-action are disabled here.
     */
    applyRolePermissions({
      page: page.replace(/\.html$/i, ""),
      // Use the role resolved by the authenticated application context.
      // Some accounts expose the effective group role on context.role while
      // context.member.role may be stale or normalized differently. Preserve
      // the separately recorded office so expense approval remains slot-specific.
      member: {
        ...context.member,
        role: context.role || context.member?.role || "member"
      },
      isVerifiedPlatformAdmin: false
    });


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
        error,
        name:
          error?.name,
        message:
          error?.message,
        stack:
          error?.stack
      }
    );


    let message =
      error?.message ||
      "Unable to load the Admin Portal.";


    /*
     * Browser fetch failures often surface only as
     * "Failed to fetch". Give the user a useful next
     * step without hiding the original diagnostic.
     */

    if (
      String(message)
        .trim()
        .toLowerCase() ===
      "failed to fetch"
    ) {

      message =
        "CHAMA LIVE could not reach the authentication service. Check your internet connection and try again. If the problem continues, refresh the page before signing in again.";

    }


    showBootError(
      message,
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

}
