import {
requireMember,
roleCan,
signOut,
listenForAuthChanges
} from "./auth.js";

# /*

# CHAMA LIVE — GLOBAL LAYOUT + ROLE BASED NAVIGATION

*/

/* =====================================================
HELPERS
===================================================== */

const $ =
(selector) =>
document.querySelector(
selector
);

const $$ =
(selector) =>
Array.from(
document.querySelectorAll(
selector
)
);

/* =====================================================
PAGE PERMISSIONS
===================================================== */

const NAV_PERMISSIONS = {

"dashboard.html":
"view_dashboard",

"members.html":
"manage_members",

"add-member.html":
"manage_members",

"contributions.html":
"view_contributions",

"expenses.html":
"view_expenses",

"meetings.html":
"view_meetings",

"reports.html":
"view_reports",

"monthly-closing.html":
"monthly_closing",

"group-management.html":
"manage_group"

};

/* =====================================================
BOOT
===================================================== */

export async function boot() {

try {

```
const member =
  await requireMember(
    true
  );


if (!member) {

  return null;

}


/*
 Render authenticated user information.
*/

renderUser(
  member
);


/*
 Apply role based navigation.
*/

applyRoleNavigation(
  member.role
);


/*
 Highlight current page.
*/

highlightCurrentPage();


/*
 Wire logout.
*/

wireLogout();


/*
 Add role to body.
*/

document.body.dataset.role =
  member.role;


/*
 Add group ID to body.

 Useful for other frontend modules.
*/

if (
  member.group_id
) {

  document.body.dataset.groupId =
    member.group_id;

}


/*
 Listen for future auth changes.
*/

listenForAuthChanges(
  async (
    event,
    session
  ) => {

    if (
      event ===
      "SIGNED_OUT"
    ) {

      window.location.href =
        "login.html";

    }

  }
);


return member;
```

} catch (error) {

```
console.error(
  "CHAMA LIVE boot error:",
  error
);


showGlobalError(
  error
);


return null;
```

}

}

/* =====================================================
RENDER USER
===================================================== */

function renderUser(
member
) {

const userName =
member.name ||
"User";

const role =
formatRole(
member.role
);

/*
Supported selectors.

If the page contains any of these,
they will be populated.
*/

$$(".user-name")
.forEach(
element => {

```
    element.textContent =
      userName;

  }
);
```

$$(".member-name")
.forEach(
element => {

```
    element.textContent =
      userName;

  }
);
```

$$(".user-role")
.forEach(
element => {

```
    element.textContent =
      role;

  }
);
```

$$(".group-name")
.forEach(
element => {

```
    /*
     group_name may not exist in the member
     record, so don't overwrite it with blank.
    */

    if (
      member.group_name
    ) {

      element.textContent =
        member.group_name;

    }

  }
);
```

/*
Generic element:

<span id="currentUserName"></span>
*/

const currentUserName =
document.getElementById(
"currentUserName"
);

if (
currentUserName
) {

```
currentUserName.textContent =
  userName;
```

}

const currentUserRole =
document.getElementById(
"currentUserRole"
);

if (
currentUserRole
) {

```
currentUserRole.textContent =
  role;
```

}

const currentGroupName =
document.getElementById(
"currentGroupName"
);

if (
currentGroupName &&
member.group_name
) {

```
currentGroupName.textContent =
  member.group_name;
```

}

}

/* =====================================================
ROLE NAVIGATION
===================================================== */

function applyRoleNavigation(
role
) {

const normalizedRole =
String(
role ||
"member"
)
.toLowerCase();

/*
Every navigation link gets checked.
*/

$$(".nav a")
.forEach(
link => {

```
    const href =
      getPageName(
        link.getAttribute(
          "href"
        )
      );


    const permission =
      NAV_PERMISSIONS[
        href
      ];


    /*
     Unknown links remain visible.

     This prevents custom navigation links
     from accidentally disappearing.
    */

    if (!permission) {

      return;

    }


    const allowed =
      roleCan(
        normalizedRole,
        permission
      );


    if (!allowed) {

      link.hidden =
        true;

      link.setAttribute(
        "aria-hidden",
        "true"
      );

      link.style.display =
        "none";

    } else {

      link.hidden =
        false;

      link.removeAttribute(
        "aria-hidden"
      );

      link.style.display =
        "";

    }

  }
);
```

/*
Page-level permission protection.

This catches someone manually typing a URL.
*/

enforceCurrentPageAccess(
normalizedRole
);

}

/* =====================================================
CURRENT PAGE ACCESS
===================================================== */

function enforceCurrentPageAccess(
role
) {

const currentPage =
getPageName(
window.location.pathname
);

const permission =
NAV_PERMISSIONS[
currentPage
];

if (!permission) {

```
return;
```

}

const allowed =
roleCan(
role,
permission
);

if (!allowed) {

```
/*
 Avoid redirect loops.
*/

if (
  currentPage !==
  "dashboard.html"
) {

  window.location.replace(
    "dashboard.html"
  );

}
```

}

}

/* =====================================================
CURRENT PAGE HIGHLIGHT
===================================================== */

function highlightCurrentPage() {

const currentPage =
getPageName(
window.location.pathname
);

$$(".nav a")
.forEach(
link => {

```
    const linkPage =
      getPageName(
        link.getAttribute(
          "href"
        )
      );


    if (
      linkPage ===
      currentPage
    ) {

      link.classList.add(
        "active"
      );

    } else {

      link.classList.remove(
        "active"
      );

    }

  }
);
```

}

/* =====================================================
LOGOUT
===================================================== */

function wireLogout() {

const buttons =
$$(
"#logout, .logout, [data-action='logout']"
);

buttons.forEach(
button => {

```
  /*
   Prevent duplicate listeners.
  */

  if (
    button.dataset.logoutBound ===
    "true"
  ) {

    return;

  }


  button.dataset.logoutBound =
    "true";


  button.addEventListener(
    "click",
    async () => {

      button.disabled =
        true;

      button.textContent =
        "Signing out...";


      try {

        await signOut();

      } catch (error) {

        console.error(
          "Logout error:",
          error
        );

        button.disabled =
          false;

        button.textContent =
          "Sign out";

      }

    }
  );

}
```

);

}

/* =====================================================
GET PAGE NAME
===================================================== */

function getPageName(
path
) {

if (!path) {

```
return "";
```

}

const clean =
String(
path
)
.split("?")[0]
.split("#")[0];

const parts =
clean.split("/");

return (
parts[
parts.length - 1
] ||
"index.html"
);

}

/* =====================================================
FORMAT ROLE
===================================================== */

function formatRole(
role
) {

if (!role) {

```
return "Member";
```

}

return String(
role
)
.replaceAll(
"_",
" "
)
.replace(
/\b\w/g,
character =>
character.toUpperCase()
);

}

/* =====================================================
GLOBAL ERROR
===================================================== */

function showGlobalError(
error
) {

const existing =
document.getElementById(
"globalAuthError"
);

if (existing) {

```
existing.textContent =
  error?.message ||
  "Unable to load your account.";

existing.hidden =
  false;

return;
```

}

/*
Don't inject a large error message if the page
has already redirected.
*/

console.error(
"Global authentication error:",
error
);

}

/* =====================================================
PERMISSION UTILITY
===================================================== */

export function can(
role,
permission
) {

return roleCan(
role,
permission
);

}

/* =====================================================
REQUIRE PAGE ROLE
===================================================== */

export async function requirePageRole(
roles
) {

const member =
await requireMember(
true
);

if (!member) {

```
return null;
```

}

const allowedRoles =
Array.isArray(
roles
)
? roles
: [roles];

if (
!allowedRoles
.map(
role =>
String(
role
).toLowerCase()
)
.includes(
String(
member.role
).toLowerCase()
)
) {

```
window.location.replace(
  "dashboard.html"
);

return null;
```

}

return member;

}

/* =====================================================
ROLE DATA ATTRIBUTES
===================================================== */

/*
Allows HTML such as:

 <button data-permission="approve_expenses">
   Approve
 </button>

to be hidden automatically.

*/

export function applyPermissionElements(
role
) {

$$(
"[data-permission]"
)
.forEach(
element => {

```
    const permission =
      element.dataset.permission;


    const allowed =
      roleCan(
        role,
        permission
      );


    if (!allowed) {

      element.hidden =
        true;

      element.style.display =
        "none";

    } else {

      element.hidden =
        false;

      element.style.display =
        "";

    }

  }
);
```

}

/* =====================================================
ROLE DATA ATTRIBUTES
===================================================== */

/*
Allows:

 <div data-role="admin">
*/

export function applyRoleElements(
role
) {

$$(
"[data-role]"
)
.forEach(
element => {

```
    const allowedRoles =
      element.dataset.role
        .split(",")
        .map(
          value =>
            value
              .trim()
              .toLowerCase()
        );


    const allowed =
      allowedRoles.includes(
        String(
          role
        ).toLowerCase()
      );


    if (!allowed) {

      element.hidden =
        true;

      element.style.display =
        "none";

    } else {

      element.hidden =
        false;

      element.style.display =
        "";

    }

  }
);
```

}

/* =====================================================
AUTO APPLY OPTIONAL PERMISSION ELEMENTS
===================================================== */

export async function applyAccessControls(
member
) {

if (!member) {

```
return;
```

}

applyPermissionElements(
member.role
);

applyRoleElements(
member.role
);

}
