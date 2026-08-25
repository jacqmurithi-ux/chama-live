```javascript
import { supabase } from "./supabase.js";

/*
=========================================================
CHAMA LIVE — AUTH + RBAC
=========================================================

Roles supported:

admin
chairperson
treasurer
secretary
member

AUTH FLOW

Login
  ↓
Supabase Auth
  ↓
getUser()
  ↓
Find member using auth_user_id
  ↓
Get group + role
  ↓
RBAC
  ↓
Dashboard

IMPORTANT:
Authorization is based on database records, not
user-editable user_metadata.
*/


/* =====================================================
   ROLE DEFINITIONS
===================================================== */

export const ROLES = {
  ADMIN: "admin",
  CHAIRPERSON: "chairperson",
  TREASURER: "treasurer",
  SECRETARY: "secretary",
  MEMBER: "member"
};


/* =====================================================
   ROLE LABELS
===================================================== */

export const ROLE_LABELS = {
  admin: "Administrator",
  chairperson: "Chairperson",
  treasurer: "Treasurer",
  secretary: "Secretary",
  member: "Member"
};


/* =====================================================
   ROLE PERMISSIONS
===================================================== */

export const PERMISSIONS = {

  admin: [
    "dashboard.view",

    "members.view",
    "members.create",
    "members.update",
    "members.delete",

    "contributions.view",
    "contributions.create",
    "contributions.update",
    "contributions.delete",

    "expenses.view",
    "expenses.create",
    "expenses.update",
    "expenses.delete",
    "expenses.approve",

    "meetings.view",
    "meetings.create",
    "meetings.update",
    "meetings.delete",

    "reports.view",

    "monthly_closing.view",
    "monthly_closing.close",
    "monthly_closing.reopen",

    "group.view",
    "group.update"
  ],

  chairperson: [
    "dashboard.view",

    "members.view",
    "members.create",
    "members.update",

    "contributions.view",
    "contributions.create",
    "contributions.update",

    "expenses.view",
    "expenses.create",
    "expenses.update",
    "expenses.approve",

    "meetings.view",
    "meetings.create",
    "meetings.update",

    "reports.view",

    "monthly_closing.view",
    "monthly_closing.close",

    "group.view",
    "group.update"
  ],

  treasurer: [
    "dashboard.view",

    "members.view",

    "contributions.view",
    "contributions.create",
    "contributions.update",

    "expenses.view",
    "expenses.create",
    "expenses.update",
    "expenses.approve",

    "reports.view",

    "monthly_closing.view",
    "monthly_closing.close"
  ],

  secretary: [
    "dashboard.view",

    "members.view",
    "members.create",
    "members.update",

    "contributions.view",
    "contributions.create",
    "contributions.update",

    "expenses.view",
    "expenses.create",
    "expenses.update",

    "meetings.view",
    "meetings.create",
    "meetings.update",

    "reports.view"
  ],

  member: [
    "dashboard.view",

    "members.view",

    "contributions.view",

    "expenses.view",

    "meetings.view",

    "reports.view"
  ]

};


/* =====================================================
   AUTH STATE
===================================================== */

let cachedUser = null;
let cachedMember = null;
let cachedGroup = null;


/* =====================================================
   GET CURRENT AUTH USER
===================================================== */

export async function getCurrentUser() {

  const {
    data,
    error
  } = await supabase.auth.getUser();

  if (error) {

    console.error(
      "Unable to get authenticated user:",
      error
    );

    return null;
  }

  return data?.user || null;
}


/* =====================================================
   GET CURRENT SESSION
===================================================== */

export async function getSession() {

  const {
    data,
    error
  } = await supabase.auth.getSession();

  if (error) {

    console.error(
      "Unable to get session:",
      error
    );

    return null;
  }

  return data?.session || null;
}


/* =====================================================
   GET MY MEMBER RECORD
===================================================== */

export async function getMyMember(
  forceRefresh = false
) {

  if (
    cachedMember &&
    !forceRefresh
  ) {

    return cachedMember;

  }


  const user =
    await getCurrentUser();


  if (!user) {

    cachedUser = null;
    cachedMember = null;
    cachedGroup = null;

    return null;

  }


  cachedUser = user;


  /*
  Your members table should contain:

  auth_user_id
  group_id
  name
  phone
  email
  role
  status
  member_number
  */

  const {
    data,
    error
  } = await supabase

    .from("members")

    .select(`
      id,
      group_id,
      auth_user_id,
      member_number,
      name,
      phone,
      email,
      role,
      status,
      join_date,
      created_at
    `)

    .eq(
      "auth_user_id",
      user.id
    )

    .maybeSingle();


  if (error) {

    console.error(
      "Unable to load member:",
      error
    );

    throw error;

  }


  if (!data) {

    cachedMember = null;

    return null;

  }


  if (
    data.status &&
    data.status !== "active"
  ) {

    console.warn(
      "User account is not active."
    );

    cachedMember = null;

    return null;

  }


  cachedMember = data;


  return data;

}


/* =====================================================
   GET MY GROUP
===================================================== */

export async function getMyGroup(
  forceRefresh = false
) {

  if (
    cachedGroup &&
    !forceRefresh
  ) {

    return cachedGroup;

  }


  const member =
    await getMyMember(
      forceRefresh
    );


  if (!member) {

    return null;

  }


  const {
    data,
    error
  } = await supabase

    .from("groups")

    .select(`
      id,
      name,
      monthly_contribution,
      opening_balance,
      created_at
    `)

    .eq(
      "id",
      member.group_id
    )

    .single();


  if (error) {

    console.error(
      "Unable to load group:",
      error
    );

    throw error;

  }


  cachedGroup = data;


  return data;

}


/* =====================================================
   GET COMPLETE AUTH CONTEXT
===================================================== */

export async function getAuthContext(
  forceRefresh = false
) {

  const user =
    await getCurrentUser();


  if (!user) {

    return {
      authenticated: false,
      user: null,
      member: null,
      group: null,
      role: null
    };

  }


  const member =
    await getMyMember(
      forceRefresh
    );


  if (!member) {

    return {
      authenticated: true,
      user,
      member: null,
      group: null,
      role: null
    };

  }


  const group =
    await getMyGroup(
      forceRefresh
    );


  const role =
    normalizeRole(
      member.role
    );


  return {

    authenticated: true,

    user,

    member,

    group,

    role

  };

}


/* =====================================================
   NORMALIZE ROLE
===================================================== */

export function normalizeRole(
  role
) {

  const value =
    String(
      role || "member"
    )
      .trim()
      .toLowerCase();


  if (
    Object.prototype.hasOwnProperty.call(
      ROLE_LABELS,
      value
    )
  ) {

    return value;

  }


  return ROLES.MEMBER;

}


/* =====================================================
   HAS ROLE
===================================================== */

export function hasRole(
  role,
  allowedRoles
) {

  const normalized =
    normalizeRole(
      role
    );


  if (!Array.isArray(
    allowedRoles
  )) {

    allowedRoles = [
      allowedRoles
    ];

  }


  return allowedRoles
    .map(normalizeRole)
    .includes(
      normalized
    );

}


/* =====================================================
   HAS PERMISSION
===================================================== */

export function hasPermission(
  role,
  permission
) {

  const normalizedRole =
    normalizeRole(
      role
    );


  const permissions =
    PERMISSIONS[
      normalizedRole
    ] || [];


  return permissions.includes(
    permission
  );

}


/* =====================================================
   REQUIRE AUTHENTICATION
===================================================== */

export async function requireAuth(
  options = {}
) {

  const {

    loginPage =
      "login.html",

    redirect = true

  } = options;


  const context =
    await getAuthContext();


  if (
    !context.authenticated
  ) {

    if (redirect) {

      window.location.href =
        loginPage;

    }

    return null;

  }


  return context;

}


/* =====================================================
   REQUIRE MEMBER PROFILE
===================================================== */

export async function requireMember(
  options = {}
) {

  const {

    loginPage =
      "login.html",

    setupPage =
      "create-group.html",

    redirect = true

  } = options;


  const context =
    await requireAuth({
      loginPage,
      redirect
    });


  if (!context) {

    return null;

  }


  if (!context.member) {

    if (redirect) {

      window.location.href =
        setupPage;

    }

    return null;

  }


  return context;

}


/* =====================================================
   REQUIRE ROLE
===================================================== */

export async function requireRole(
  allowedRoles,
  options = {}
) {

  const {

    loginPage =
      "login.html",

    unauthorizedPage =
      "dashboard.html",

    redirect = true

  } = options;


  const context =
    await requireMember({
      loginPage,
      redirect
    });


  if (!context) {

    return null;

  }


  if (
    !hasRole(
      context.role,
      allowedRoles
    )
  ) {

    console.warn(
      "Unauthorized role:",
      context.role
    );


    if (redirect) {

      window.location.href =
        unauthorizedPage;

    }


    return null;

  }


  return context;

}


/* =====================================================
   REQUIRE PERMISSION
===================================================== */

export async function requirePermission(
  permission,
  options = {}
) {

  const {

    loginPage =
      "login.html",

    unauthorizedPage =
      "dashboard.html",

    redirect = true

  } = options;


  const context =
    await requireMember({
      loginPage,
      redirect
    });


  if (!context) {

    return null;

  }


  if (
    !hasPermission(
      context.role,
      permission
    )
  ) {

    console.warn(
      "Missing permission:",
      permission
    );


    if (redirect) {

      window.location.href =
        unauthorizedPage;

    }


    return null;

  }


  return context;

}


/* =====================================================
   LOGOUT
===================================================== */

export async function logout(
  redirectPage = "login.html"
) {

  const {
    error
  } =
    await supabase.auth.signOut({
      scope: "local"
    });


  if (error) {

    console.error(
      "Logout failed:",
      error
    );

    throw error;

  }


  cachedUser = null;
  cachedMember = null;
  cachedGroup = null;


  window.location.href =
    redirectPage;

}


/* =====================================================
   SETUP LOGOUT BUTTON
===================================================== */

export function setupLogoutButton(
  buttonId = "logout"
) {

  const button =
    document.getElementById(
      buttonId
    );


  if (!button) {

    return;

  }


  button.addEventListener(
    "click",
    async () => {

      button.disabled =
        true;

      button.textContent =
        "Signing out...";


      try {

        await logout();

      } catch (error) {

        console.error(
          error
        );

        button.disabled =
          false;

        button.textContent =
          "Sign out";

        alert(
          "Unable to sign out. Please try again."
        );

      }

    }
  );

}


/* =====================================================
   GET ROLE LABEL
===================================================== */

export function getRoleLabel(
  role
) {

  const normalized =
    normalizeRole(
      role
    );


  return (
    ROLE_LABELS[
      normalized
    ] ||
    "Member"
  );

}


/* =====================================================
   CLEAR AUTH CACHE
===================================================== */

export function clearAuthCache() {

  cachedUser = null;
  cachedMember = null;
  cachedGroup = null;

}


/* =====================================================
   AUTH STATE LISTENER
===================================================== */

export function listenForAuthChanges(
  callback
) {

  const {
    data
  } =
    supabase.auth.onAuthStateChange(
      (
        event,
        session
      ) => {

        if (
          event ===
          "SIGNED_OUT"
        ) {

          clearAuthCache();

        }


        if (
          typeof callback ===
          "function"
        ) {

          callback(
            event,
            session
          );

        }

      }
    );


  return data.subscription;

}


/* =====================================================
   AUTO REDIRECT AFTER LOGIN
===================================================== */

export async function redirectAfterLogin() {

  const context =
    await getAuthContext(
      true
    );


  if (!context.authenticated) {

    window.location.href =
      "login.html";

    return;

  }


  /*
  A logged-in user without a member
  record needs onboarding.
  */

  if (!context.member) {

    window.location.href =
      "create-group.html";

    return;

  }


  /*
  Every valid member goes to dashboard.
  The dashboard itself can show
  role-specific controls.
  */

  window.location.href =
    "dashboard.html";

}
```
