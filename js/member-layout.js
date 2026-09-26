/* =========================================================
   CHAMA LIVE — MEMBER PORTAL LAYOUT
   ---------------------------------------------------------
   RESPONSIBILITIES
   ---------------------------------------------------------
   • Authenticate member portal access.
   • Enforce member-only portal access.
   • Redirect admin accounts to the admin dashboard.
   • Own member portal navigation.
   • Own desktop logout.
   • Own mobile member navigation.
   • Load the current member-page feature.
   • Keep page-specific files focused on page content.

   SECURITY CONTRACT
   ---------------------------------------------------------
   • Authentication comes from auth.js.
   • Member/group context comes from getMyApplicationContext().
   • Admin roles do not remain inside the member portal.
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
  "admin",
  "chairperson",
  "secretary",
  "treasurer"
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
    path: "./member-dashboard.js",
    initializer: "initMemberDashboard"
  },

  "member-contributions.html": {
    path: "./member-contributions.js",
    initializer: "initMemberContributions"
  },

  "member-accounting.html": {
    path: "./member-accounting.js",
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
    path: "./member-profile.js",
    initializer: "initMemberProfile"
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
    label: "Getting Started",
    href: "member-getting-started.html"
  }
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
    .chama-member-nav {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      flex-wrap: wrap;
    }

    .chama-member-nav a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 0.55rem 0.8rem;
      border-radius: 10px;
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 600;
    }

    .chama-member-nav a.active {
      font-weight: 700;
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
      min-height: 40px;
      padding: 0.55rem 0.9rem;
      border: 1px solid rgba(185, 28, 28, 0.35);
      border-radius: 10px;
      background: #ffffff;
      color: #b91c1c;
      box-shadow:
        0 4px 14px rgba(0, 0, 0, 0.12);
    }

    .chama-member-desktop-logout:hover {
      background: #fef2f2;
      opacity: 1;
    }

    .chama-member-mobile-backdrop {
      position: fixed;
      inset: 0;
      z-index: 9997;
      background: rgba(0, 0, 0, 0.38);
    }

    .chama-member-mobile-menu {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 9998;
      width: min(88vw, 340px);
      overflow-y: auto;
      padding: 1.25rem;
      background: var(--surface, #ffffff);
      box-shadow:
        -10px 0 30px rgba(0, 0, 0, 0.16);
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
      text-decoration: none;
      font-weight: 600;
    }

    .chama-member-mobile-links a.active {
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
    }

    @media (max-width: 820px) {
      .chama-member-nav {
        display: none !important;
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
        z-index: 9990;
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 0.15rem;
        padding:
          0.4rem
          0.35rem
          calc(
            0.4rem + env(safe-area-inset-bottom)
          );
        background: var(--surface, #ffffff);
        border-top:
          1px solid rgba(127, 127, 127, 0.2);
      }

      .chama-member-bottom-nav a {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 0.35rem 0.15rem;
        border-radius: 9px;
        text-align: center;
        text-decoration: none;
        font-size: 0.72rem;
        font-weight: 600;
      }

      .chama-member-bottom-nav a.active {
        font-weight: 800;
      }

      body {
        padding-bottom: 72px;
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
  const currentPage =
    getCurrentPage();

  const existingMemberNav =
    document.querySelector(
      ".chama-member-nav"
    );

  if (existingMemberNav) {
    renderDesktopLogout();
    return;
  }

  const nav =
    document.createElement("nav");

  nav.className =
    "chama-member-nav";

  nav.setAttribute(
    "aria-label",
    "Member portal navigation"
  );

  MEMBER_NAVIGATION.forEach(item => {
    nav.appendChild(
      createNavLink(
        item.label,
        item.href,
        currentPage
      )
    );
  });

  const existingTopNav =
    document.querySelector(
      ".topbar .top-nav, .top-nav"
    );

  if (existingTopNav) {
    MEMBER_NAVIGATION.forEach(item => {
      const target =
        item.href.split("/").pop();

      existingTopNav
        .querySelectorAll(
          `a[href$="${target}"]`
        )
        .forEach(link => {
          link.remove();
        });
    });

    existingTopNav.appendChild(
      nav
    );

    renderDesktopLogout();

    return;
  }

  const topbar =
    document.querySelector(
      ".topbar"
    );

  if (topbar) {
    topbar.appendChild(
      nav
    );

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
    const topbar =
      document.querySelector(
        ".topbar"
      );

    if (!topbar) {
      return;
    }

    button =
      document.createElement("button");

    button.type = "button";

    button.className =
      "menu-toggle";

    button.textContent =
      "Menu";

    topbar.appendChild(
      button
    );
  }

  button.classList.add(
    "chama-member-menu-toggle"
  );

  button.setAttribute(
    "aria-label",
    "Open member menu"
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

    if (isAdminAccount()) {
      window.location.href =
        "dashboard.html";

      return;
    }

    const role =
      normalizeRole(
        context.member.role
      );

    if (role !== "member") {
      throw new Error(
        "This portal is available to member accounts."
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

    showLayoutError(
      error?.message ||
      "Unable to load the member portal."
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
