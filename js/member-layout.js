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
"member-getting-started.html"
]);
/*
Only member-activities requires the layout to invoke
a page initializer.

member-dashboard.js and member-contributions.js
currently contain their own direct compatibility boot.
The layout-loading flag prevents those modules from
starting their compatibility boot during the transition.
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
"member-getting-started.html",
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
"member-getting-started.html",
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
No initializer exported for ${page}.
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
delete window.CHAMA_LIVE_LAYOUT_LOADING;
}
}
export function getLayoutState() {
return {
...context,
portal: "member"
};
}
