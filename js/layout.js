```javascript
/* =========================================================
   CHAMA LIVE
   js/layout.js

   DEPENDENCY ORDER:

   supabase.js
        ↓
   auth.js
        ↓
   layout.js
        ↓
   page scripts
   (members.js, dashboard.js, etc.)

========================================================= */

import {
  supabase,
  requireAuth,
  getMyMember,
  getMyGroup,
  signOut
} from "./auth.js";


/* =========================================================
   STATE
========================================================= */

let currentSession = null;
let currentMember = null;
let currentGroup = null;


/* =========================================================
   PAGE SCRIPT MAP
========================================================= */

const PAGE_SCRIPTS = {

  dashboard:
    "./dashboard.js",

  members:
    "./members.js",

  contributions:
    "./contributions.js",

  expenses:
    "./expenses.js",

  meetings:
    "./meetings.js",

  reports:
    "./reports.js",

  "group-management":
    "./group-management.js",

  "monthly-closing":
    "./monthly-closing.js"

};


/* =========================================================
   BOOT
========================================================= */

export async function boot() {

  try {

    console.log(
      "CHAMA LIVE: layout booting..."
    );


    /* -----------------------------------------
       AUTHENTICATION
    ----------------------------------------- */

    currentSession =
      await requireAuth();


    if (!currentSession) {
      return;
    }


    /* -----------------------------------------
       LOAD MEMBER
    ----------------------------------------- */

    currentMember =
      await getMyMember();


    if (!currentMember) {

      console.error(
        "No member record found for logged-in user."
      );

      showGlobalError(
        "Your account is not linked to a group member record."
      );

      return;
    }


    /* -----------------------------------------
       LOAD GROUP
    ----------------------------------------- */

    try {

      currentGroup =
        await getMyGroup();

    } catch (groupError) {

      console.warn(
        "getMyGroup failed:",
        groupError
      );

      /*
       * Some older databases may not yet have
       * the get_my_group RPC.
       *
       * We can still obtain the group ID from
       * the member record.
       */

      if (currentMember.group_id) {

        const {
          data,
          error
        } =
          await supabase
            .from("groups")
            .select("*")
            .eq(
              "id",
              currentMember.group_id
            )
            .maybeSingle();


        if (!error) {
          currentGroup = data;
        }

      }

    }


    /* -----------------------------------------
       DISPLAY USER / GROUP
    ----------------------------------------- */

    updateLayout();


    /* -----------------------------------------
       LOGOUT
    ----------------------------------------- */

    setupLogout();


    /* -----------------------------------------
       LOAD PAGE SCRIPT
    ----------------------------------------- */

    await loadPageScript();


    console.log(
      "CHAMA LIVE: layout ready."
    );


  } catch (error) {

    console.error(
      "LAYOUT BOOT ERROR:",
      error
    );


    showGlobalError(
      friendlyError(error)
    );

  }

}


/* =========================================================
   UPDATE LAYOUT
========================================================= */

function updateLayout() {

  const memberName =
    currentMember?.name ||
    currentSession?.user?.email ||
    "Member";


  const groupName =
    currentGroup?.name ||
    currentGroup?.group_name ||
    "Your Group";


  /*
   * Possible elements on different pages.
   * Missing elements are simply ignored.
   */

  setText(
    "memberName",
    memberName
  );


  setText(
    "welcomeName",
    memberName
  );


  setText(
    "userName",
    memberName
  );


  setText(
    "groupName",
    groupName
  );


  setText(
    "groupTitle",
    groupName
  );


  setText(
    "currentGroup",
    groupName
  );


  /*
   * Role
   */

  setText(
    "memberRole",
    formatRole(
      currentMember?.role
    )
  );


  setText(
    "userRole",
    formatRole(
      currentMember?.role
    )
  );


  /*
   * Member number
   */

  setText(
    "memberNumber",
    currentMember?.membership_number ||
    currentMember?.member_number ||
    "—"
  );

}


/* =========================================================
   LOGOUT
========================================================= */

function setupLogout() {

  const logoutButtons =
    document.querySelectorAll(
      "#logout, [data-action='logout']"
    );


  logoutButtons.forEach(
    button => {

      /*
       * Prevent duplicate listeners.
       */

      if (
        button.dataset.logoutReady === "true"
      ) {
        return;
      }


      button.dataset.logoutReady =
        "true";


      button.addEventListener(
        "click",
        async event => {

          event.preventDefault();


          button.disabled =
            true;


          const originalText =
            button.textContent;


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
              originalText;


            showGlobalError(
              friendlyError(error)
            );

          }

        }
      );

    }
  );

}


/* =========================================================
   LOAD PAGE SCRIPT
========================================================= */

async function loadPageScript() {

  /*
   * Determine current page.
   */

  const page =
    getCurrentPage();


  console.log(
    "Current page:",
    page
  );


  const script =
    PAGE_SCRIPTS[page];


  /*
   * No page-specific script required.
   */

  if (!script) {

    console.log(
      `No page script registered for "${page}".`
    );

    return;

  }


  try {

    /*
     * Dynamic import.
     *
     * IMPORTANT:
     *
     * Page scripts must be located in:
     *
     * js/members.js
     * js/dashboard.js
     * etc.
     */

    await import(script);


    console.log(
      `Loaded page script: ${script}`
    );


  } catch (error) {

    console.error(
      `Unable to load ${script}:`,
      error
    );


    showGlobalError(
      `Unable to load this page. Check ${script} for an error.`
    );

  }

}


/* =========================================================
   DETECT CURRENT PAGE
========================================================= */

function getCurrentPage() {

  /*
   * First look for explicit data-page.
   *
   * Example:
   *
   * <body data-page="members">
   */

  const bodyPage =
    document.body?.dataset?.page;


  if (bodyPage) {

    return bodyPage
      .trim()
      .toLowerCase();

  }


  /*
   * Otherwise determine page from filename.
   */

  let filename =
    window.location.pathname
      .split("/")
      .pop();


  /*
   * Remove query/hash if present.
   */

  filename =
    filename
      .split("?")[0]
      .split("#")[0];


  /*
   * Remove .html
   */

  filename =
    filename.replace(
      /\.html$/i,
      ""
    );


  /*
   * index.html = dashboard
   */

  if (
    !filename ||
    filename === "index"
  ) {

    return "dashboard";

  }


  return filename
    .trim()
    .toLowerCase();

}


/* =========================================================
   TEXT HELPER
========================================================= */

function setText(
  id,
  value
) {

  const element =
    document.getElementById(id);


  if (!element) {
    return;
  }


  element.textContent =
    value ?? "";

}


/* =========================================================
   ROLE FORMAT
========================================================= */

function formatRole(
  role
) {

  return String(
    role || "member"
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


/* =========================================================
   GLOBAL ERROR
========================================================= */

function showGlobalError(
  message
) {

  /*
   * Use existing error element if available.
   */

  const existing =
    document.getElementById(
      "error"
    );


  if (existing) {

    existing.hidden =
      false;

    existing.textContent =
      message;

    return;

  }


  /*
   * Otherwise create a simple error box.
   */

  const box =
    document.createElement(
      "div"
    );


  box.style.cssText = `
    position:fixed;
    top:20px;
    left:20px;
    right:20px;
    z-index:99999;
    padding:15px;
    border-radius:8px;
    background:#fee2e2;
    color:#991b1b;
    border:1px solid #fecaca;
    font-family:Arial,sans-serif;
  `;


  box.textContent =
    message;


  document.body.prepend(
    box
  );

}


/* =========================================================
   FRIENDLY ERROR
========================================================= */

function friendlyError(
  error
) {

  if (!error) {

    return "Something went wrong.";

  }


  const message =
    error.message ||
    String(error);


  const lower =
    message.toLowerCase();


  if (
    lower.includes(
      "failed to fetch"
    )
  ) {

    return (
      "Unable to connect to the server. " +
      "Please check your internet connection."
    );

  }


  if (
    lower.includes(
      "row-level security"
    )
  ) {

    return (
      "You do not have permission to access this information."
    );

  }


  if (
    lower.includes(
      "jwt"
    ) ||
    lower.includes(
      "not authenticated"
    )
  ) {

    return (
      "Your session has expired. Please sign in again."
    );

  }


  return message;

}


/* =========================================================
   AUTH STATE LISTENER
========================================================= */

supabase.auth.onAuthStateChange(
  (
    event,
    session
  ) => {

    console.log(
      "Auth state:",
      event
    );


    currentSession =
      session || null;


    if (
      event === "SIGNED_OUT"
    ) {

      currentMember =
        null;

      currentGroup =
        null;


      /*
       * Only redirect if we are not already
       * on the login page.
       */

      const page =
        getCurrentPage();


      if (
        page !== "login"
      ) {

        window.location.replace(
          "./login.html"
        );

      }

    }

  }
);
```
