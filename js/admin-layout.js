Below are the two complete files. Upload them exactly at these paths:
js/admin-layout.js
js/member-layout.js
Do not modify js/layout.js or the HTML files yet. These are the Phase 1 independent layout candidates.
js/admin-layout.js
import { getMyApplicationContext } from "./auth.js";

const ADMIN_ROLES = new Set([
  "admin",
  "chairperson",
  "secretary",
  "treasurer"
]);

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

/*
 * Only pages whose existing modules are designed to be
 * initialized by the shared layout are loaded here.
 *
 * Independently booted modules remain independently booted
 * until their HTML contracts are migrated and verified.
 */
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

  "monthly-closing.html": [
    "./monthly-closing.js",
    "initPage"
  ],

  "group-management.html": [
    "./group-management.js",
    "initGroupManagement"
  ]
};

let bootStarted = false;
let context = null;

function getCurrentPage() {
  return (
    window.location.pathname
      .split("/")
      .pop()
      .toLowerCase() ||
    "dashboard.html"
  );
}

function isAdminAccount() {
  return (
    context?.isOwner === true ||
    ADMIN_ROLES.has(
      String(context?.role || "")
        .trim()
        .toLowerCase()
    )
  );
}

function createNavLink(href, label) {
  const link = document.createElement("a");

  link.href = href;
  link.textContent = label;

  if (getCurrentPage() === href) {
    link.classList.add("active");
    link.setAttribute(
      "aria-current",
      "page"
    );
  }

  return link;
}

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
    }

    .chama-admin-nav a,
    .chama-admin-nav summary {
      min-height: 42px;
      padding: 9px 12px;
      display: flex;
      align-items: center;
      border-radius: 10px;
      text-decoration: none;
      color: #344054;
      font-size: 13px;
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
      top: 48px;
      left: 0;
      min-width: 220px;
      padding: 6px;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      box-shadow: 0 18px 45px rgba(16, 24, 40, 0.15);
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

    @media (max-width: 800px) {
      .chama-admin-nav {
        display: none;
      }

      .chama-mobile-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.42);
        z-index: 20000;
      }

      .chama-mobile-backdrop.open {
        display: block;
      }

      .chama-mobile-menu {
        position: fixed;
        top: 64px;
        left: 10px;
        right: 10px;
        max-height: calc(100vh - 145px);
        overflow-y: auto;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        z-index: 20001;
        box-shadow: 0 22px 55px rgba(16, 24, 40, 0.20);
      }

      .chama-mobile-menu.open {
        display: block;
      }

      .chama-mobile-head {
        padding: 16px;
        background: #f8fafc;
        border-bottom: 1px solid #edf0f4;
      }

      .chama-mobile-head strong {
        display: block;
        color: #101828;
      }

      .chama-mobile-head span {
        display: block;
        color: #667085;
        font-size: 12px;
        margin-top: 3px;
      }

      .chama-mobile-section {
        padding: 12px 10px 2px;
      }

      .chama-mobile-section h2 {
        margin: 0 7px 5px;
        color: #667085;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .chama-mobile-menu a {
        display: flex;
        align-items: center;
        min-height: 48px;
        padding: 10px 12px;
        border-radius: 10px;
        color: #344054;
        text-decoration: none;
        font-size: 13px;
        font-weight: 700;
        box-sizing: border-box;
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
        grid-template-columns: repeat(5, 1fr);
        padding: 6px 6px env(safe-area-inset-bottom);
        background: #ffffff;
        border-top: 1px solid #e5e7eb;
        z-index: 15000;
        box-sizing: border-box;
      }

      .chama-admin-bottom a {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        border-radius: 11px;
        color: #64748b;
        text-decoration: none;
        font-size: 10px;
        font-weight: 700;
      }

      .chama-admin-bottom a.active {
        color: #0f766e;
        background: #ecfdf5;
      }

      .main {
        padding-bottom: 95px !important;
      }
    }
  `;

  document.head.appendChild(style);
}

function renderDesktopNavigation() {
  if (
    document.querySelector(
      ".chama-admin-nav"
    )
  ) {
    return;
  }

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
    ] of NAVIGATION_GROUPS
  ) {
    if (items.length === 1) {
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

    details.appendChild(summary);

    const panel =
      document.createElement("div");

    panel.className =
      "chama-admin-group-panel";

    for (const item of items) {
      panel.appendChild(
        createNavLink(
          item[0],
          item[1]
        )
      );
    }

    details.appendChild(panel);
    nav.appendChild(details);
  }

  nav.appendChild(
    createNavLink(
      "billing.html",
      "Billing"
    )
  );

  const target =
    document.querySelector(
      ".topbar .top-nav"
    ) ||
    document.querySelector(
      ".topbar"
    );

  if (target) {
    target.appendChild(nav);
  }
}

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

  menu?.classList.add("open");
  backdrop?.classList.add("open");

  button?.setAttribute(
    "aria-expanded",
    "true"
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

  menu?.classList.remove("open");
  backdrop?.classList.remove("open");

  button?.setAttribute(
    "aria-expanded",
    "false"
  );
}

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

  const menu =
    document.createElement("aside");

  menu.id =
    "chamaAdminMenu";

  menu.className =
    "chama-mobile-menu";

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

  header.appendChild(groupName);
  header.appendChild(memberName);

  menu.appendChild(header);

  for (
    const [
      title,
      items
    ] of NAVIGATION_GROUPS
  ) {
    const section =
      document.createElement(
        "section"
      );

    section.className =
      "chama-mobile-section";

    const heading =
      document.createElement("h2");

    heading.textContent =
      title;

    section.appendChild(heading);

    for (const item of items) {
      section.appendChild(
        createNavLink(
          item[0],
          item[1]
        )
      );
    }

    menu.appendChild(section);
  }

  const billingSection =
    document.createElement(
      "section"
    );

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

    const topbar =
      document.querySelector(
        ".topbar"
      );

    if (topbar) {
      topbar.prepend(button);
    }
  }

  const hasExpanded =
    button.hasAttribute(
      "aria-expanded"
    );

  if (!hasExpanded) {
    button.setAttribute(
      "aria-expanded",
      "false"
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
      } else {
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
    .forEach((link) => {
      link.addEventListener(
        "click",
        closeAdminMobileMenu
      );
    });
}

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

  for (const [
    href,
    label
  ] of items) {
    const link =
      document.createElement("a");

    link.href = href;
    link.textContent = label;

    if (
      href ===
      getCurrentPage()
    ) {
      link.classList.add(
        "active"
      );
    }

    if (href === "#more") {
      link.href = "#";

      link.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          openAdminMobileMenu();
        }
      );
    }

    nav.appendChild(link);
  }

  document.body.appendChild(nav);
}

async function loadCurrentPageFeature() {
  const page =
    getCurrentPage();

  const entry =
    PAGE_SCRIPTS[page];

  if (!entry) {
    return;
  }

  const module =
    await import(entry[0]);

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

export async function boot() {
  if (bootStarted) {
    return;
  }

  bootStarted = true;

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

    if (!isAdminAccount()) {
      window.location.replace(
        "member-dashboard.html"
      );

      return;
    }

    const page =
      getCurrentPage();

    if (
      !ADMIN_PAGES.has(page)
    ) {
      window.location.replace(
        "dashboard.html"
      );

      return;
    }

    /*
     * Prevent legacy page modules that still contain
     * compatibility boot logic from initializing while
     * the new portal layout owns initialization.
     */
    window.__CHAMA_LIVE_LAYOUT_LOADING__ =
      true;

    injectStyles();

    renderDesktopNavigation();

    renderMobileNavigation();

    renderMobileBottomNavigation();

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
      errorBox.hidden = false;

      errorBox.textContent =
        error?.message ||
        "Unable to load the Admin Portal.";
    }
  }
  finally {
    delete window.__CHAMA_LIVE_LAYOUT_LOADING__;
  }
}

export function getLayoutState() {
  return {
    ...context,
    portal: "admin"
  };
}
js/member-layout.js
import { getMyApplicationContext } from "./auth.js";

const ADMIN_ROLES = new Set([
  "admin",
  "chairperson",
  "secretary",
  "treasurer"
]);

const MEMBER_PAGES = new Set([
  "member-dashboard.html",
  "member-contributions.html",
  "member-activities.html",
  "getting-started.html"
]);

/*
 * Only member-activities requires the layout to invoke
 * a page initializer.
 *
 * member-dashboard.js and member-contributions.js
 * currently contain their own direct compatibility boot.
 * The layout-loading flag prevents those modules from
 * starting their compatibility boot during the transition.
 */
const PAGE_SCRIPTS = {
  "member-activities.html": [
    "./member-activities.js",
    "initMemberActivities"
  ]
};

let bootStarted = false;
let context = null;

function getCurrentPage() {
  return (
    window.location.pathname
      .split("/")
      .pop()
      .toLowerCase() ||
    "member-dashboard.html"
  );
}

function isAdminAccount() {
  return (
    context?.isOwner === true ||
    ADMIN_ROLES.has(
      String(context?.role || "")
        .trim()
        .toLowerCase()
    )
  );
}

function createNavLink(href, label) {
  const link =
    document.createElement("a");

  link.href = href;
  link.textContent = label;

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
    "getting-started.html",
    "Getting Started"
  ]
];

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
    .chama-member-nav {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
    }

    .chama-member-nav a {
      min-height: 42px;
      padding: 9px 13px;
      display: flex;
      align-items: center;
      border-radius: 10px;
      text-decoration: none;
      color: #344054;
      font-size: 13px;
      font-weight: 700;
      box-sizing: border-box;
    }

    .chama-member-nav a:hover,
    .chama-member-nav a.active {
      background: #ecfdf5;
      color: #0f766e;
    }

    .chama-member-menu,
    .chama-member-back,
    .chama-member-bottom {
      display: none;
    }

    @media (max-width: 800px) {
      .chama-member-nav {
        display: none;
      }

      .chama-member-back {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.42);
        z-index: 20000;
      }

      .chama-member-back.open {
        display: block;
      }

      .chama-member-menu {
        position: fixed;
        top: 64px;
        left: 10px;
        right: 10px;
        max-height: calc(100vh - 145px);
        overflow-y: auto;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        z-index: 20001;
        box-shadow: 0 22px 55px rgba(16, 24, 40, 0.20);
      }

      .chama-member-menu.open {
        display: block;
      }

      .chama-member-head {
        padding: 16px;
        background: #f8fafc;
        border-bottom: 1px solid #edf0f4;
      }

      .chama-member-head strong {
        display: block;
        color: #101828;
      }

      .chama-member-head span {
        display: block;
        color: #667085;
        font-size: 12px;
        margin-top: 3px;
      }

      .chama-member-menu a {
        display: flex;
        align-items: center;
        min-height: 48px;
        padding: 10px 14px;
        border-radius: 10px;
        color: #344054;
        text-decoration: none;
        font-size: 13px;
        font-weight: 700;
        box-sizing: border-box;
      }

      .chama-member-menu a.active {
        background: #ecfdf5;
        color: #0f766e;
      }

      .chama-member-bottom {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        height: 70px;
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        padding: 6px 6px env(safe-area-inset-bottom);
        background: #ffffff;
        border-top: 1px solid #e5e7eb;
        z-index: 15000;
        box-sizing: border-box;
      }

      .chama-member-bottom a {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        border-radius: 11px;
        color: #64748b;
        text-decoration: none;
        font-size: 10px;
        font-weight: 700;
      }

      .chama-member-bottom a.active {
        color: #0f766e;
        background: #ecfdf5;
      }

      .main {
        padding-bottom: 95px !important;
      }
    }
  `;

  document.head.appendChild(style);
}

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
      ".menu-toggle"
    );

  menu?.classList.add("open");
  backdrop?.classList.add("open");

  button?.setAttribute(
    "aria-expanded",
    "true"
  );
}

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
}

function renderDesktopNavigation() {
  if (
    document.querySelector(
      ".chama-member-nav"
    )
  ) {
    return;
  }

  const nav =
    document.createElement("nav");

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

  const target =
    document.querySelector(
      ".topbar .top-nav"
    ) ||
    document.querySelector(
      ".topbar"
    );

  if (target) {
    target.appendChild(nav);
  }
}

function renderMobileNavigation() {
  if (
    document.getElementById(
      "chamaMemberMenu"
    )
  ) {
    return;
  }

  const backdrop =
    document.createElement("div");

  backdrop.id =
    "chamaMemberBack";

  backdrop.className =
    "chama-member-back";

  const menu =
    document.createElement("aside");

  menu.id =
    "chamaMemberMenu";

  menu.className =
    "chama-member-menu";

  const header =
    document.createElement("div");

  header.className =
    "chama-member-head";

  const groupName =
    document.createElement("strong");

  groupName.textContent =
    context?.group?.name ||
    "CHAMA";

  const memberName =
    document.createElement("span");

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

    const topbar =
      document.querySelector(
        ".topbar"
      );

    if (topbar) {
      topbar.prepend(button);
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

  button.addEventListener(
    "click",
    () => {
      const isOpen =
        menu.classList.contains(
          "open"
        );

      if (isOpen) {
        closeMemberMobileMenu();
      } else {
        openMemberMobileMenu();
      }
    }
  );

  backdrop.addEventListener(
    "click",
    closeMemberMobileMenu
  );

  menu
    .querySelectorAll("a")
    .forEach((link) => {
      link.addEventListener(
        "click",
        closeMemberMobileMenu
      );
    });
}

function renderMobileBottomNavigation() {
  if (
    document.querySelector(
      ".chama-member-bottom"
    )
  ) {
    return;
  }

  const nav =
    document.createElement("nav");

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
      "getting-started.html",
      "Guide"
    ],
    [
      "#more",
      "More"
    ]
  ];

  for (const [
    href,
    label
  ] of items) {
    const link =
      document.createElement("a");

    link.href = href;
    link.textContent = label;

    if (
      href ===
      getCurrentPage()
    ) {
      link.classList.add(
        "active"
      );
    }

    if (href === "#more") {
      link.href = "#";

      link.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          openMemberMobileMenu();
        }
      );
    }

    nav.appendChild(link);
  }

  document.body.appendChild(nav);
}

async function loadCurrentPageFeature() {
  const page =
    getCurrentPage();

  const entry =
    PAGE_SCRIPTS[page];

  if (!entry) {
    return;
  }

  const module =
    await import(entry[0]);

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

export async function boot() {
  if (bootStarted) {
    return;
  }

  bootStarted = true;

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

    if (isAdminAccount()) {
      window.location.replace(
        "dashboard.html"
      );

      return;
    }

    if (
      context.role !==
      "member"
    ) {
      throw new Error(
        "Your account does not have a valid Member Portal role."
      );
    }

    const page =
      getCurrentPage();

    if (
      !MEMBER_PAGES.has(page)
    ) {
      window.location.replace(
        "member-dashboard.html"
      );

      return;
    }

    /*
     * Prevent compatibility boot code in existing
     * member page modules from running while the
     * portal layout owns initialization.
     */
    window.__CHAMA_LIVE_LAYOUT_LOADING__ =
      true;

    injectStyles();

    renderDesktopNavigation();

    renderMobileNavigation();

    renderMobileBottomNavigation();

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
      errorBox.hidden = false;

      errorBox.textContent =
        error?.message ||
        "Unable to load the Member Portal.";
    }
  }
  finally {
    delete window.__CHAMA_LIVE_LAYOUT_LOADING__;
  }
}

export function getLayoutState() {
  return {
    ...context,
    portal: "member"
  };
}
