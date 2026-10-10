/* =========================================================
   CHAMA LIVE — MEMBER PORTAL LAYOUT
   ---------------------------------------------------------
   RESPONSIBILITIES
   ---------------------------------------------------------
   • Authenticate member portal access.
   • Enforce member/member-official portal eligibility.
   • Allow authorized group officials to view the Member Portal.
   • Own member portal navigation.
   • Own desktop logout.
   • Own mobile member navigation.
   • Provide an Official Portal switch-back for official roles.
   • Load the current member-page feature.
   • Keep page-specific files focused on page content.

   SECURITY CONTRACT
   ---------------------------------------------------------
   • Authentication comes from auth.js.
   • Member/group context comes from getMyApplicationContext().
   • Official roles may enter both portals.
   • Official Portal permissions remain governed by the
     existing official-page and feature authorization.
   • Member feature-specific guards remain authoritative.
   • No financial mutations.
   • No member mutations.
   • No group mutations.
   ========================================================= */

import {
  getMyApplicationContext,
  signOut
} from "./auth.js";


/* =========================================================
   CONFIGURATION
   ========================================================= */

const ADMIN_ROLES = new Set([
  "owner",
  "admin",
  "administrator",
  "chairperson",
  "secretary",
  "treasurer",
  "vice chairperson",
  "vice secretary"
]);


const MEMBER_PORTAL_ROLES = new Set([
  "member",
  "admin",
  "chairperson",
  "secretary",
  "treasurer",
  "vice chairperson",
  "vice secretary"
]);


const MEMBER_PAGES = new Set([
  "member-dashboard.html",
  "member-contributions.html",
  "member-accounting.html",
  "member-activities.html",
  "member-assets.html",
  "member-milestones.html",
  "member-profile.html",
  "member-getting-started.html"
]);


const PAGE_SCRIPTS = {
  "member-dashboard.html": {
    path: "./member-dashboard.js?v=20261010-personal-only2",
    initializer: "initMemberDashboard"
  },

  "member-contributions.html": {
    path: "./member-contributions.js",
    initializer: "initMemberContributions"
  },

  "member-accounting.html": {
    path: "./member-accounting.js?v=20261010-personal-status4",
    initializer: "initMemberAccounting"
  },

  "member-activities.html": {
    path: "./member-activities.js",
    initializer: "initMemberActivities"
  },

  "member-assets.html": {
    path: "./member-assets.js",
    initializer: "initMemberAssets"
  },

  "member-milestones.html": {
    path: "./member-milestones.js",
    initializer: "initMemberMilestones"
  },

  "member-profile.html": {
    path: "./member-profile.js?v=20261010-personal-status4",
    initializer: "initMemberAccounting"
  }
};


let bootStarted = false;
let context = null;


/* =========================================================
   PAGE HELPERS
   ========================================================= */

function getCurrentPage() {
  const pathname =
    window.location.pathname || "";

  const filename =
    pathname.split("/").pop();

  return filename || "member-dashboard.html";
}


function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase();
}


function isAdminAccount() {
  const role =
    normalizeRole(
      context?.member?.role
    );

  return ADMIN_ROLES.has(role);
}


function createNavLink(
  label,
  href,
  currentPage
) {
  const link =
    document.createElement("a");

  link.href = href;
  link.textContent = label;

  const targetPage =
    href.split("/").pop();

  if (targetPage === currentPage) {
    link.classList.add("active");

    link.setAttribute(
      "aria-current",
      "page"
    );
  }

  return link;
}


/* =========================================================
   SHARED MEMBER PORTAL SHELL
   ========================================================= */

function ensureMemberPortalShell() {
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
  brand.href = "member-dashboard.html";
  inner.prepend(brand);
  let topNav = header.querySelector(".top-nav");
  if (!topNav) {
    topNav = document.createElement("nav");
    topNav.className = "top-nav";
    topNav.setAttribute("aria-label", "Member navigation");
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
  // Member logout is recreated by this layout so its sign-out handler is preserved.
  const legacyLogout = document.getElementById("logout");
  if (legacyLogout) legacyLogout.remove();
  const userLabel = actions.querySelector("[data-user-name]");
  if (userLabel) {
    userLabel.textContent = context?.member?.name ||
      context?.member?.full_name || context?.user?.email || "Member";
  }
  inner.querySelectorAll(".topbar-left, .topbar-right").forEach(wrapper => {
    if (!wrapper.querySelector("*") && !wrapper.textContent.trim()) wrapper.remove();
  });
  return header;
}

/* =========================================================
   MEMBER NAVIGATION
   ========================================================= */

const MEMBER_NAVIGATION = [
  {
    label: "Home",
    href: "member-dashboard.html"
  },
  {
    label: "My Contributions",
    href: "member-contributions.html"
  },
  {
    label: "My Accounting",
    href: "member-accounting.html"
  },
  {
    label: "Activities",
    href: "member-activities.html"
  },
  {
    label: "Assets",
    href: "member-assets.html"
  },
  {
    label: "Milestones",
    href: "member-milestones.html"
  },
  {
    label: "My Profile",
    href: "member-profile.html"
  },
  {
    label: "Getting Started",
    href: "member-getting-started.html"
  }
];


/* =========================================================
   MEMBER DESKTOP NAVIGATION GROUPS
   ========================================================= */

const MEMBER_DESKTOP_NAVIGATION_GROUPS = [
  [
    "Home",
    [
      { label: "Home", href: "member-dashboard.html" },
      { label: "Getting Started", href: "member-getting-started.html" }
    ]
  ],
  [
    "Finance",
    [
      { label: "My Contributions", href: "member-contributions.html" },
      { label: "My Accounting", href: "member-accounting.html" }
    ]
  ],
  [
    "Group",
    [
      { label: "Activities", href: "member-activities.html" },
      { label: "Assets", href: "member-assets.html" },
      { label: "Milestones", href: "member-milestones.html" }
    ]
  ],
  [
    "Account",
    [
      { label: "My Profile", href: "member-profile.html" }
    ]
  ]
];


/* =========================================================
   STYLES
   ========================================================= */

function injectStyles() {
  if (
    document.getElementById(
      "chama-member-layout-styles"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "chama-member-layout-styles";

  style.textContent = `
    /* Shared desktop shell to match the Admin Portal's header. */
    .topbar {
      position: sticky; top: 0; z-index: 12000; width: 100%;
      box-sizing: border-box; background: #ffffff;
      border-bottom: 1px solid #e5e7eb;
    }
    .topbar-inner {
      display: flex; align-items: center; gap: 12px; width: 100%;
      max-width: 1600px; min-height: 68px; margin: 0 auto;
      padding: 10px 20px; box-sizing: border-box;
    }
    .topbar .brand {
      display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto;
      color: #0f766e; text-decoration: none; font-size: 17px;
      font-weight: 850; white-space: nowrap;
    }
    .topbar .brand span { color: #344054; }
    .topbar .top-nav {
      display: flex; align-items: center; justify-content: flex-end;
      flex: 1 1 auto; min-width: 0;
    }
    .topbar .topbar-actions {
      display: flex; align-items: center; justify-content: flex-end;
      gap: 10px; flex: 0 0 auto; min-width: 0;
    }
    .topbar [data-user-name] {
      max-width: 170px; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; color: #475467; font-size: 12px; font-weight: 600;
    }
    .topbar-actions .chama-member-logout {
      min-height: 38px; padding: 8px 12px; border: 1px solid #e5e7eb;
      border-radius: 10px; background: #ffffff; color: #344054;
      box-shadow: none; font-size: 12px; font-weight: 700;
    }
    @media (max-width: 1100px) and (min-width: 821px) {
      .topbar-inner {
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        padding-right: 12px;
        padding-left: 12px;
      }

      .topbar .topbar-actions {
        gap: 6px;
      }

      .topbar [data-user-name] {
        max-width: 80px;
      }

      /* Put navigation on a separate row.
         Do not clip its dropdown panels. */
      .topbar .top-nav {
        display: block;
        order: 3;
        flex: 1 1 100%;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        justify-content: flex-start;
        overflow: visible;
      }

      .chama-member-nav {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 4px;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        flex: 1 1 100%;
        flex-wrap: wrap;
        overflow: visible;
      }

      .chama-member-nav a,
      .chama-member-nav summary {
        padding-right: 7px;
        padding-left: 7px;
        font-size: 11px;
      }

      .chama-member-group {
        position: relative;
      }

      .chama-member-group-panel {
        position: absolute;
        top: 46px;
        left: 0;
        right: auto;
        width: max-content;
        min-width: 220px;
        max-width: min(320px, calc(100vw - 32px));
        box-sizing: border-box;
        z-index: 20000;
      }

      .chama-member-group-panel a {
        white-space: normal;
      }
    }
    @media (max-width: 820px) {
      .topbar-inner { min-height: 60px; gap: 10px; padding: 8px 12px; }
      .topbar .top-nav { display: none !important; }
      .topbar .topbar-actions { margin-left: auto; gap: 7px; }
      .topbar [data-user-name] { max-width: 105px; font-size: 11px; }
    }


    .chama-member-nav {
      display: flex; align-items: center; justify-content: flex-end;
      gap: 4px; flex-wrap: nowrap; min-width: 0;
    }
    .chama-member-nav a {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 40px; padding: 8px 10px; border-radius: 10px;
      color: #344054; text-decoration: none; font-size: 12px;
      font-weight: 700; white-space: nowrap; box-sizing: border-box;
    }
    .chama-member-nav a:hover,
    .chama-member-nav a.active,
    .chama-member-nav summary:hover {
      background: #ecfdf5; color: #0f766e;
    }

    .chama-member-nav summary {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 40px; padding: 8px 10px; border-radius: 10px;
      color: #344054; font-size: 12px; font-weight: 700;
      white-space: nowrap; cursor: pointer; box-sizing: border-box;
      list-style: none;
    }

    .chama-member-nav summary::-webkit-details-marker {
      display: none;
    }

    .chama-member-nav summary::after {
      content: "▾"; margin-left: 7px; font-size: 10px; opacity: 0.72;
    }

    .chama-member-nav details[open] > summary::after {
      content: "▴";
    }

    .chama-member-nav summary:focus-visible,
    .chama-member-nav .chama-member-group-panel a:focus-visible {
      outline: 2px solid #0f766e; outline-offset: 2px;
    }

    .chama-member-group {
      position: relative;
    }

    .chama-member-group-panel {
      position: absolute; top: 46px; left: 0; min-width: 220px;
      padding: 6px; background: #ffffff; border: 1px solid #e5e7eb;
      border-radius: 14px; box-shadow: 0 18px 45px rgba(16, 24, 40, 0.14);
      z-index: 20000;
    }

    .chama-member-group-panel a {
      display: flex; width: 100%; justify-content: flex-start;
    }

    .chama-member-logout {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      min-height: 38px;
      padding: 0.55rem 0.9rem;
      border: 1px solid currentColor;
      border-radius: 10px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
      white-space: nowrap;
    }

    .chama-member-logout:hover {
      opacity: 0.82;
    }

    .chama-member-logout:disabled {
      opacity: 0.6;
      cursor: wait;
    }

    /*
     * Standalone logout fallback.
     *
     * Important:
     * This is deliberately NOT placed inside
     * .chama-member-nav because .chama-member-nav
     * is hidden on mobile.
     */
    .chama-member-desktop-logout-wrap {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .chama-member-desktop-logout {
      min-height: 38px; padding: 8px 12px; border: 1px solid #e5e7eb;
      border-radius: 10px; background: #ffffff; color: #344054;
      box-shadow: none; font-size: 12px; font-weight: 700;
    }
    .chama-member-desktop-logout:hover { background: #f8fafc; opacity: 1; }

    .chama-member-mobile-backdrop {
      position: fixed;
      inset: 0;
      z-index: 20000;
      background: rgba(0, 0, 0, 0.38);
    }

    .chama-member-mobile-menu {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 20001;
      width: min(88vw, 340px);
      overflow-y: auto;
      padding: 20px 16px;
      box-sizing: border-box;
      background: #ffffff;
      border-left: 1px solid #e5e7eb;
      box-shadow:
        -10px 0 30px rgba(16, 24, 40, 0.16);
    }

    .chama-member-mobile-header {
      margin-bottom: 1rem;
      padding-bottom: 1rem;
      border-bottom:
        1px solid rgba(127, 127, 127, 0.2);
    }

    .chama-member-mobile-header strong {
      display: block;
      margin-bottom: 0.25rem;
    }

    .chama-member-mobile-header span {
      display: block;
      opacity: 0.7;
      font-size: 0.9rem;
    }

    .chama-member-mobile-links {
      display: grid;
      gap: 0.45rem;
    }

    .chama-member-mobile-links a {
      display: block;
      padding: 0.8rem;
      border-radius: 10px;
      color: #344054;
      text-decoration: none;
      font-weight: 600;
    }

    .chama-member-mobile-links a.active {
      background: #ecfdf5;
      color: #0f766e;
      font-weight: 700;
    }

    .chama-member-mobile-logout {
      width: 100%;
      margin-top: 1rem;
    }

    .chama-member-bottom-nav {
      display: none;
    }

    .chama-member-menu-toggle {
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
      /* Keep the actual top navigation available on mobile;
         use a touch-scrollable row and a reachable dropdown panel. */
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

      .chama-member-nav {
        display: flex !important;
        flex-wrap: nowrap;
        align-items: center;
        gap: 4px;
        width: 100%;
        max-width: 100%;
        overflow-x: auto;
        overflow-y: visible;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        padding: 5px 0 8px;
        touch-action: pan-x;
      }

      .chama-member-group {
        flex: 0 0 auto;
      }

      .chama-member-group > summary {
        min-height: 44px;
        padding: 10px 12px;
        font-size: 13px;
        touch-action: manipulation;
      }

      .chama-member-group-panel {
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

      .chama-member-group-panel a {
        min-height: 46px;
        font-size: 14px;
        white-space: normal;
        touch-action: manipulation;
      }

      /*
       * Keep the standalone logout visible on mobile.
       */
      .chama-member-desktop-logout-wrap {
        top: 10px;
        right: 10px;
      }

      .chama-member-desktop-logout {
        min-height: 38px;
        padding: 0.5rem 0.75rem;
        font-size: 0.82rem;
      }

      .chama-member-menu-toggle {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
      }

      .chama-member-bottom-nav {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 15000;
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 4px;
        height: auto;
        min-height: 64px;
        padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.98);
        border-top: 1px solid #e5e7eb;
        backdrop-filter: blur(10px);
      }

      .chama-member-bottom-nav a {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        min-height: 44px;
        padding: 5px 3px;
        border-radius: 10px;
        color: #64748b;
        text-align: center;
        text-decoration: none;
        font-size: 10px;
        font-weight: 700;
        white-space: nowrap;
      }

      .chama-member-bottom-nav a.active {
        color: #0f766e;
        background: #ecfdf5;
        font-weight: 800;
      }

      body {
        padding-bottom: calc(78px + env(safe-area-inset-bottom)) !important;
      }
    }

    @media (max-width: 520px) {
      .chama-member-bottom-nav a {
        font-size: 9px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .chama-member-mobile-menu,
      .chama-member-mobile-backdrop {
        scroll-behavior: auto;
      }
    }
  `;

  document.head.appendChild(style);
}


/* =========================================================
   MOBILE MENU
   ========================================================= */

function closeMobileMenu() {
  const menu =
    document.querySelector(
      ".chama-member-mobile-menu"
    );

  const backdrop =
    document.querySelector(
      ".chama-member-mobile-backdrop"
    );

  if (menu) {
    menu.remove();
  }

  if (backdrop) {
    backdrop.remove();
  }

  document.body.style.overflow = "";
}


function openMobileMenu() {
  if (
    document.querySelector(
      ".chama-member-mobile-menu"
    )
  ) {
    return;
  }

  const currentPage =
    getCurrentPage();

  const backdrop =
    document.createElement("div");

  backdrop.className =
    "chama-member-mobile-backdrop";

  backdrop.addEventListener(
    "click",
    closeMobileMenu
  );

  const menu =
    document.createElement("aside");

  menu.className =
    "chama-member-mobile-menu";

  menu.setAttribute(
    "aria-label",
    "Member navigation"
  );

  const header =
    document.createElement("div");

  header.className =
    "chama-member-mobile-header";

  const memberName =
    context?.member?.name ||
    "Member";

  const groupName =
    context?.group?.name ||
    "Your group";

  header.innerHTML = `
    <strong>${escapeHtml(memberName)}</strong>
    <span>${escapeHtml(groupName)}</span>
  `;

  menu.appendChild(header);

  const links =
    document.createElement("nav");

  links.className =
    "chama-member-mobile-links";

  MEMBER_NAVIGATION.forEach(item => {
    const link =
      createNavLink(
        item.label,
        item.href,
        currentPage
      );

    link.addEventListener(
      "click",
      closeMobileMenu
    );

    links.appendChild(link);
  });

  /*
   * Official roles can switch back to the
   * Official Portal without changing identity.
   *
   * This is navigation only. Existing official
   * page/feature/RPC authorization remains
   * authoritative.
   */
  if (isAdminAccount()) {
    const officialLink =
      createNavLink(
        "Official Portal",
        "dashboard.html",
        currentPage
      );

    officialLink.addEventListener(
      "click",
      closeMobileMenu
    );

    links.appendChild(
      officialLink
    );
  }

  menu.appendChild(links);

  /*
   * Mobile menu keeps its own Logout action.
   */
  const logout =
    createLogoutButton(
      "Logout"
    );

  logout.classList.add(
    "chama-member-mobile-logout"
  );

  menu.appendChild(logout);

  document.body.appendChild(
    backdrop
  );

  document.body.appendChild(
    menu
  );

  document.body.style.overflow =
    "hidden";
}


/* =========================================================
   LOGOUT
   ========================================================= */

function createLogoutButton(
  label = "Logout"
) {
  const button =
    document.createElement("button");

  button.type = "button";

  button.className =
    "chama-member-logout";

  button.textContent =
    label;

  button.addEventListener(
    "click",
    async () => {
      if (button.disabled) {
        return;
      }

      button.disabled = true;

      button.textContent =
        "Signing out…";

      try {
        await signOut();

        window.location.href =
          "index.html";

      } catch (error) {
        console.error(
          "Member logout failed:",
          error
        );

        button.disabled = false;

        button.textContent =
          label;

        showLayoutError(
          error?.message ||
          "Unable to sign out."
        );
      }
    }
  );

  return button;
}


function renderDesktopLogout() {
  /*
   * Prevent duplicate standalone logout.
   */
  const existingStandalone =
    document.querySelector(
      ".chama-member-desktop-logout-wrap"
    );

  if (existingStandalone) {
    return;
  }

  /*
   * Prevent duplicate logout when a real
   * topbar already contains one.
   */
  const existingDesktop =
    document.querySelector(
      ".chama-member-desktop-logout"
    );

  if (existingDesktop) {
    return;
  }

  const logout =
    createLogoutButton(
      "Logout"
    );

  logout.classList.add(
    "chama-member-desktop-logout"
  );

  const topbarActions =
    document.querySelector(
      ".topbar-actions"
    );

  if (topbarActions) {
    topbarActions.appendChild(
      logout
    );

    return;
  }

  const topbar =
    document.querySelector(
      ".topbar"
    );

  if (topbar) {
    let actions =
      topbar.querySelector(
        ".topbar-actions"
      );

    if (!actions) {
      actions =
        document.createElement("div");

      actions.className =
        "topbar-actions";

      topbar.appendChild(
        actions
      );
    }

    actions.appendChild(
      logout
    );

    return;
  }

  /*
   * IMPORTANT:
   *
   * Do NOT append Logout to
   * .chama-member-nav.
   *
   * .chama-member-nav is hidden on
   * mobile, which was the reason Logout
   * disappeared on the mobile dashboard.
   */
  const wrapper =
    document.createElement("div");

  wrapper.className =
    "chama-member-desktop-logout-wrap";

  wrapper.appendChild(
    logout
  );

  document.body.appendChild(
    wrapper
  );
}


/* =========================================================
   DESKTOP NAVIGATION
   ========================================================= */

function renderDesktopNavigation() {
  const currentPage = getCurrentPage();

  // Replace any legacy desktop menu with the canonical collapsible groups.
  document
    .querySelectorAll(".chama-member-nav")
    .forEach(existing => existing.remove());

  const nav = document.createElement("nav");
  nav.className = "chama-member-nav";
  nav.setAttribute("aria-label", "Member portal navigation");

  const groups = MEMBER_DESKTOP_NAVIGATION_GROUPS.map(([title, items]) => [
    title,
    [...items]
  ]);

  // Official users can switch portals from the Account menu.
  if (isAdminAccount()) {
    const accountGroup = groups.find(([title]) => title === "Account");
    accountGroup?.[1].push({
      label: "Official Portal",
      href: "dashboard.html"
    });
  }

  for (const [title, items] of groups) {
    const details = document.createElement("details");
    details.className = "chama-member-group";

    if (items.some(item => item.href.split("/").pop() === currentPage)) {
      details.open = true;
    }

    const summary = document.createElement("summary");
    summary.textContent = title;
    details.appendChild(summary);

    const panel = document.createElement("div");
    panel.className = "chama-member-group-panel";

    items.forEach(item => {
      panel.appendChild(
        createNavLink(item.label, item.href, currentPage)
      );
    });

    details.appendChild(panel);
    nav.appendChild(details);
  }

  const existingTopNav =
    document.querySelector(".topbar .top-nav, .top-nav");

  if (existingTopNav) {
    existingTopNav.replaceChildren(nav);
    renderDesktopLogout();
    return;
  }

  const topbar = document.querySelector(".topbar");

  if (topbar) {
    topbar.appendChild(nav);
    renderDesktopLogout();
    return;
  }

  document.body.prepend(nav);
  renderDesktopLogout();
}


/* =========================================================
   MOBILE TOGGLE
   ========================================================= */

function renderMobileMenuToggle() {
  let button =
    document.querySelector(
      ".menu-toggle"
    );

  if (!button) {
    const topbarInner =
      document.querySelector(
        ".topbar-inner"
      );

    const topbar =
      document.querySelector(
        ".topbar"
      );

    if (!topbarInner && !topbar) {
      return;
    }

    button =
      document.createElement("button");

    button.type = "button";

    button.className =
      "menu-toggle";

    button.textContent =
      "☰";

    if (topbarInner) {
      topbarInner.prepend(button);
    } else {
      topbar.prepend(button);
    }
  }

  button.classList.add(
    "chama-member-menu-toggle"
  );

  button.setAttribute(
    "aria-label",
    "Open menu"
  );

  button.setAttribute(
    "aria-expanded",
    "false"
  );

  if (
    button.dataset.chamaMemberBound ===
    "true"
  ) {
    return;
  }

  button.dataset.chamaMemberBound =
    "true";

  button.addEventListener(
    "click",
    () => {
      const open =
        Boolean(
          document.querySelector(
            ".chama-member-mobile-menu"
          )
        );

      if (open) {
        closeMobileMenu();

        button.setAttribute(
          "aria-expanded",
          "false"
        );
      } else {
        openMobileMenu();

        button.setAttribute(
          "aria-expanded",
          "true"
        );
      }
    }
  );
}


/* =========================================================
   MOBILE BOTTOM NAV
   ========================================================= */

function renderBottomNavigation() {
  const existing =
    document.querySelector(
      ".chama-member-bottom-nav"
    );

  if (existing) {
    return;
  }

  const currentPage =
    getCurrentPage();

  const bottom =
    document.createElement("nav");

  bottom.className =
    "chama-member-bottom-nav";

  bottom.setAttribute(
    "aria-label",
    "Member quick navigation"
  );

  const items = [
    {
      label: "Home",
      href: "member-dashboard.html"
    },
    {
      label: "Money",
      href: "member-contributions.html"
    },
    {
      label: "Activities",
      href: "member-activities.html"
    },
    {
      label: "Milestones",
      href: "member-milestones.html"
    },
    {
      label: "Guide",
      href: "member-getting-started.html"
    }
  ];

  items.forEach(item => {
    bottom.appendChild(
      createNavLink(
        item.label,
        item.href,
        currentPage
      )
    );
  });

  document.body.appendChild(
    bottom
  );
}


/* =========================================================
   HTML ESCAPING
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   PAGE FEATURE LOADER
   ========================================================= */

async function loadCurrentPageFeature() {
  const currentPage =
    getCurrentPage();

  const feature =
    PAGE_SCRIPTS[currentPage];

  if (!feature) {
    return;
  }

  const module =
    await import(feature.path);

  const initializer =
    module[feature.initializer];

  if (
    typeof initializer !==
    "function"
  ) {
    throw new Error(
      `Member page initializer "${feature.initializer}" was not found.`
    );
  }

  await initializer(context);
}


/* =========================================================
   ERROR / LOADING HELPERS
   ========================================================= */

function showLayoutError(message) {
  const error =
    document.getElementById(
      "error"
    ) ||
    document.getElementById(
      "memberError"
    ) ||
    document.getElementById(
      "memberMilestonesError"
    );

  if (!error) {
    return;
  }

  error.textContent =
    message ||
    "Unable to load the member portal.";

  error.hidden = false;
}


function hideLayoutLoading() {
  const loading =
    document.getElementById(
      "loading"
    ) ||
    document.getElementById(
      "memberLoading"
    ) ||
    document.getElementById(
      "memberMilestonesLoading"
    );

  if (loading) {
    loading.hidden = true;
  }
}


/* =========================================================
   BOOT
   ========================================================= */

export async function boot() {
  if (bootStarted) {
    return;
  }

  bootStarted = true;

  try {
    context =
      await getMyApplicationContext();

    if (!context?.user) {
      window.location.href =
        "index.html";

      return;
    }

    if (
      !context?.member ||
      !context.member.group_id
    ) {
      throw new Error(
        "Your member account or group could not be identified."
      );
    }

    const role =
      normalizeRole(
        context.member.role
      );

    /*
     * Both ordinary members and authorized
     * official roles may enter the Member Portal.
     *
     * Official roles retain their existing
     * feature/RPC/RLS permissions.
     */
    if (
      !MEMBER_PORTAL_ROLES.has(role)
    ) {
      throw new Error(
        "This portal is available to members and authorized group officials."
      );
    }

    const currentPage =
      getCurrentPage();

    if (
      !MEMBER_PAGES.has(
        currentPage
      )
    ) {
      window.location.href =
        "member-dashboard.html";

      return;
    }

    window.__CHAMA_LIVE_LAYOUT_LOADING__ =
      true;

    ensureMemberPortalShell();

    injectStyles();

    renderDesktopNavigation();
    renderMobileMenuToggle();
    renderBottomNavigation();

    await loadCurrentPageFeature();

    hideLayoutLoading();

  } catch (error) {
    console.error(
      "Member portal boot failed:",
      error
    );

    hideLayoutLoading();

    let message =
      error?.message ||
      "Unable to load the member portal.";

    if (
      String(message).trim().toLowerCase() ===
      "failed to fetch"
    ) {
      message =
        "CHAMA LIVE could not reach the authentication service. Check your internet connection and try again. If the problem continues, refresh the page before signing in again.";
    }

    showLayoutError(
      message
    );

  } finally {
    delete window
      .__CHAMA_LIVE_LAYOUT_LOADING__;
  }
}


/* =========================================================
   LAYOUT STATE
   ========================================================= */

export function getLayoutState() {
  return {
    ...(context || {}),
    portal: "member"
  };
}
