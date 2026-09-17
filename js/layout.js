/* ========================================================= 
   CHAMA LIVE — GLOBAL LAYOUT 
   FINAL STABLE VERSION 
   TOP NAV + SIDEBAR NAV + MOBILE MENU + MOBILE BOTTOM NAV 
 
   GLOBAL NAVIGATION CONTRACT: 
   - Desktop navigation is reconciled centrally here. 
   - Dashboard-style .top-nav and sidebar-style .nav use 
     the same canonical destination list. 
   - Only real application destinations are exposed. 
   - Documents is intentionally excluded because 
     documents.html does not exist. 
   - Assets is included in navigation but owns its own boot. 
   - Plans & Activities owns its own boot. 
   - Getting Started owns its own boot. 
   - Support & Welfare owns its own boot. 
   - Milestones owns its own boot. 
   - Data Migration owns its own boot. 
 
   MOBILE MENU: 
   - Assets is included in the full mobile menu. 
   - Plans & Activities is included in the full mobile menu. 
   - Getting Started is included in the full mobile menu. 
   - Support & Welfare is included in the full mobile menu. 
   - Milestones is included in the full mobile menu. 
   - Data Migration is included in the full mobile menu. 
   - Assets is intentionally NOT included in the mobile 
     bottom navigation. 
   - Independently booted pages are intentionally NOT 
     included in PAGE_SCRIPTS. 
 
   PAGE SCRIPT ARCHITECTURE: 
   - Core pages may be initialized through PAGE_SCRIPTS. 
   - Independently booted pages are intentionally absent 
     from PAGE_SCRIPTS. 
 
   AUTH CONTEXT CONTRACT: 
   - layout.js consumes getMyApplicationContext(). 
   - Authentication, member, group, ownership and role 
     context are resolved centrally by auth.js. 
   - layout.js does NOT independently calculate ownership. 
   - layout.js does NOT query owner_user_id directly. 
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
   CANONICAL APPLICATION NAVIGATION 
========================================================= */ 
 
/* 
 * This is the single navigation contract for the application. 
 * 
 * IMPORTANT: 
 * - Keep only destinations that actually exist. 
 * - Do not add documents.html unless a real documents page 
 *   is introduced and verified. 
 * - Page boot architecture is separate from navigation. 
 * 
 * Therefore independently booted pages may appear here even 
 * though they remain absent from PAGE_SCRIPTS. 
 */ 
 
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
  } 
 
]; 
 
 
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
    .forEach(function (element) { 
 
      element.textContent = name; 
 
    }); 
 
} 
 
 
/* ========================================================= 
   DESKTOP NAVIGATION 
========================================================= */ 
 
function reconcileDesktopNavigation() { 
 
  const currentPage = 
    getCurrentPage(); 
 
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
            APPLICATION_NAVIGATION.some( 
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
 
      APPLICATION_NAVIGATION.forEach( 
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
 
      APPLICATION_NAVIGATION.forEach( 
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
    "CHAMA LIVE: desktop navigation reconciled" 
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
 
        background: 
          rgba(15, 23, 42, .38); 
 
        backdrop-filter: 
          blur(2px); 
 
        -webkit-backdrop-filter: 
          blur(2px); 
 
      } 
 
      .chama-mobile-menu { 
 
        position: fixed; 
 
        top: 58px; 
 
        left: 10px; 
 
        right: 10px; 
 
        z-index: 19999; 
 
        display: none; 
 
        background: #ffffff; 
 
        border: 
          1px solid #e5e7eb; 
 
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
 
        padding: 
          15px 16px; 
 
        border-bottom: 
          1px solid #edf0f4; 
 
        background: 
          #f8fafc; 
 
      } 
 
      .chama-mobile-menu-group { 
 
        font-size: 
          14px; 
 
        font-weight: 
          800; 
 
        color: 
          #101828; 
 
      } 
 
      .chama-mobile-menu-user { 
 
        margin-top: 
          2px; 
 
        font-size: 
          12px; 
 
        color: 
          #667085; 
 
      } 
 
      .chama-mobile-menu-link { 
 
        display: 
          flex; 
 
        align-items: 
          center; 
 
        gap: 
          12px; 
 
        width: 
          100%; 
 
        min-height: 
          48px; 
 
        padding: 
          10px 16px; 
 
        text-decoration: 
          none; 
 
        color: 
          #344054; 
 
        font-size: 
          13px; 
 
        font-weight: 
          650; 
 
        border-bottom: 
          1px solid #f2f4f7; 
 
        background: 
          #ffffff; 
 
      } 
 
      .chama-mobile-menu-link:last-child { 
        border-bottom: 
          0; 
      } 
 
      .chama-mobile-menu-link:hover { 
 
        background: 
          #f0fdfa; 
 
        color: 
          #0f766e; 
 
      } 
 
      .chama-mobile-menu-link.active { 
 
        background: 
          #ecfdf5; 
 
        color: 
          #0f766e; 
 
        font-weight: 
          750; 
 
      } 
 
      .chama-mobile-menu-icon { 
 
        width: 
          30px; 
 
        height: 
          30px; 
 
        display: 
          flex; 
 
        align-items: 
          center; 
 
        justify-content: 
          center; 
 
        border-radius: 
          8px; 
 
        background: 
          #f8fafc; 
 
        font-size: 
          17px; 
 
        flex-shrink: 
          0; 
 
      } 
 
      .chama-mobile-menu-link.active 
      .chama-mobile-menu-icon { 
 
        background: 
          #d1fae5; 
 
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
 
        height: 
          72px; 
 
        padding: 
          6px 6px 
          calc(6px + env(safe-area-inset-bottom)); 
 
        background: 
          rgba(255, 255, 255, .98); 
 
        border-top: 
          1px solid #e5e7eb; 
 
        box-shadow: 
          0 -5px 20px 
          rgba(0, 0, 0, .08); 
 
        backdrop-filter: 
          blur(14px); 
 
        -webkit-backdrop-filter: 
          blur(14px); 
 
      } 
 
      .mobile-nav-item { 
 
        display: 
          flex; 
 
        flex-direction: 
          column; 
 
        align-items: 
          center; 
 
        justify-content: 
          center; 
 
        gap: 
          3px; 
 
        min-width: 
          0; 
 
        text-decoration: 
          none; 
 
        color: 
          #64748b; 
 
        border-radius: 
          13px; 
 
        transition: 
          background .2s ease, 
          color .2s ease, 
          transform .2s ease; 
 
      } 
 
      .mobile-nav-item:active { 
 
        transform: 
          scale(.96); 
 
      } 
 
      .mobile-nav-item.active { 
 
        color: 
          #0f766e; 
 
        background: 
          rgba(15, 118, 110, .09); 
 
      } 
 
      .mobile-nav-icon { 
 
        display: 
          flex; 
 
        align-items: 
          center; 
 
        justify-content: 
          center; 
 
        width: 
          30px; 
 
        height: 
          30px; 
 
        font-size: 
          21px; 
 
        line-height: 
          1; 
 
        font-weight: 
          700; 
 
      } 
 
      .mobile-nav-label { 
 
        font-size: 
          9px; 
 
        line-height: 
          1; 
 
        font-weight: 
          600; 
 
        white-space: 
          nowrap; 
 
      } 
 
      .mobile-nav-main 
      .mobile-nav-icon { 
 
        width: 
          43px; 
 
        height: 
          43px; 
 
        margin-top: 
          -18px; 
 
        border-radius: 
          50%; 
 
        background: 
          #0f766e; 
 
        color: 
          white; 
 
        border: 
          4px solid white; 
 
        box-shadow: 
          0 5px 15px 
          rgba(15, 118, 110, .30); 
 
        font-size: 
          25px; 
 
      } 
 
      .mobile-nav-main 
      .mobile-nav-label { 
 
        color: 
          #0f766e; 
 
      } 
 
      .mobile-nav-main.active 
      .mobile-nav-icon { 
 
        background: 
          #115e59; 
 
      } 
 
      .sidebar { 
 
        display: 
          none !important; 
 
      } 
 
      .sidebar-overlay { 
 
        display: 
          none !important; 
 
      } 
 
      .layout { 
 
        display: 
          block !important; 
 
        width: 
          100% !important; 
 
      } 
 
      .main { 
 
        width: 
          100% !important; 
 
        max-width: 
          100% !important; 
 
        margin: 
          0 !important; 
 
        padding: 
          16px 10px 96px 10px !important; 
 
      } 
 
      .table-wrap { 
 
        width: 
          100%; 
 
        max-width: 
          100%; 
 
        overflow-x: 
          auto; 
 
        -webkit-overflow-scrolling: 
          touch; 
 
      } 
 
      .grid-2 { 
 
        grid-template-columns: 
          1fr !important; 
 
      } 
 
      .grid-3 { 
 
        grid-template-columns: 
          repeat(2, minmax(0, 1fr)); 
 
      } 
 
      .card { 
 
        max-width: 
          100%; 
 
      } 
 
    } 
 
    @media (max-width: 390px) { 
 
      .mobile-bottom-nav { 
 
        height: 
          68px; 
 
      } 
 
      .mobile-nav-icon { 
 
        width: 
          27px; 
 
        height: 
          27px; 
 
        font-size: 
          19px; 
 
      } 
 
      .mobile-nav-label { 
 
        font-size: 
          8px; 
 
      } 
 
      .mobile-nav-main 
      .mobile-nav-icon { 
 
        width: 
          39px; 
 
        height: 
          39px; 
 
        font-size: 
          22px; 
 
      } 
 
      .grid-3 { 
 
        grid-template-columns: 
          1fr; 
 
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
     MENU ITEMS 
  ===================================================== */ 
 
  const menuItems = [ 
 
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
 
/* 
 * Canonical auth boundary. 
 * 
 * auth.js is responsible for resolving: 
 * 
 *   user 
 *   member 
 *   group 
 *   isOwner 
 *   role 
 * 
 * layout.js consumes that context. 
 * 
 * IMPORTANT: 
 * - Do not calculate ownership here. 
 * - Do not query owner_user_id here. 
 * - Do not invent a new OWNER member role. 
 * - Preserve members.role = admin compatibility. 
 */ 
 
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
    "./group-management.js" 
 
  /* 
   * IMPORTANT: 
   * 
   * assets.html is intentionally absent. 
   * 
   * assets.js owns its own independent boot sequence. 
   * 
   * The following newer/independently booted pages are also 
   * intentionally absent from this map: 
   * 
   * - plans-activities.html 
   * - getting-started.html 
   * - support-welfare.html 
   * - milestones.html 
   * - data-migration.html 
   * 
   * Their page modules own their own initialization. 
   * 
   * Do not add those pages here unless their boot architecture 
   * is explicitly reconciled and changed. 
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
 
/* 
 * Authentication is now resolved through the same canonical 
 * application context used by the layout. 
 * 
 * Do not call getCurrentUser() separately here. 
 */ 
 
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
   * 
   * loadLayoutData() consumes the canonical auth.js 
   * context and therefore also establishes authentication. 
   */ 
 
  await loadLayoutData(); 
 
 
  /* 
   * 3. Desktop navigation 
   */ 
 
  reconcileDesktopNavigation(); 
 
 
  /* 
   * 4. Logout 
   */ 
 
  setupLogout(); 
 
 
  /* 
   * 5. Full mobile menu 
   */ 
 
  setupMobileMenu(); 
 
 
  /* 
   * 6. Mobile bottom navigation 
   */ 
 
  setupMobileNavigation(); 
 
 
  /* 
   * 7. Current page script 
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
  "CHAMA LIVE: layout.js ready — boot() exported" 
);
