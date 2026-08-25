import { supabase } from "./supabase.js";

/*
=========================================================
 CHAMA LIVE AUTHENTICATION + RBAC
=========================================================

Database member structure expected:

members
---------
id
group_id
auth_user_id
member_number
name
phone
email
role
status
join_date

Supported application roles:

admin
chairperson
treasurer
secretary
member

IMPORTANT:
The role comes from the database members table.
Do NOT use user_metadata for authorization.
=========================================================
*/


/* =====================================================
   CONSTANTS
===================================================== */

const LOGIN_PAGE = "login.html";
const DASHBOARD_PAGE = "dashboard.html";

const VALID_ROLES = [
  "admin",
  "chairperson",
  "treasurer",
  "secretary",
  "member"
];


/* =====================================================
   INTERNAL CACHE
===================================================== */

let cachedUser = null;
let cachedMember = null;


/* =====================================================
   NORMALIZE ROLE
===================================================== */

export function normalizeRole(role) {

  const value = String(role || "")
    .trim()
    .toLowerCase();

  if (VALID_ROLES.includes(value)) {
    return value;
  }

  return "member";
}


/* =====================================================
   GET CURRENT AUTH USER
===================================================== */

export async function getCurrentUser() {

  const {
    data,
    error
  } = await supabase.auth.getUser();

  if (error) {
    console.error("getCurrentUser:", error);
    return null;
  }

  cachedUser = data?.user || null;

  return cachedUser;
}


/* =====================================================
   REQUIRE AUTHENTICATION
===================================================== */

export async function requireAuth() {

  const user = await getCurrentUser();

  if (!user) {

    redirectToLogin();

    return null;
  }

  return user;
}


/* =====================================================
   GET MY MEMBER RECORD
===================================================== */

export async function getMyMember(options = {}) {

  const {
    forceRefresh = false
  } = options;


  if (
    cachedMember &&
    !forceRefresh
  ) {

    return cachedMember;
  }


  const user = await requireAuth();

  if (!user) {
    return null;
  }


  /*
   * auth_user_id links the Supabase Auth user
   * to the member record.
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
      join_date
    `)

    .eq(
      "auth_user_id",
      user.id
    )

    .maybeSingle();


  if (error) {

    console.error(
      "getMyMember:",
      error
    );

    throw error;
  }


  if (!data) {

    console.error(
      "No member record linked to user:",
      user.id
    );

    return null;
  }


  /*
   * Normalize the role before returning it.
   */

  data.role =
    normalizeRole(data.role);


  cachedMember = data;

  return data;
}


/* =====================================================
   REQUIRE MEMBER
===================================================== */

export async function requireMember() {

  const member =
    await getMyMember();


  if (!member) {

    showAccessError(
      "Your login is not linked to a CHAMA LIVE member account."
    );

    return null;
  }


  /*
   * Disabled members cannot continue.
   */

  const status =
    String(
      member.status || "active"
    ).toLowerCase();


  if (
    status !== "active"
  ) {

    await signOut();

    return null;
  }


  return member;
}


/* =====================================================
   GET MY GROUP
===================================================== */

export async function getMyGroup() {

  const member =
    await getMyMember();


  if (!member) {
    return null;
  }


  const {
    data,
    error
  } = await supabase

    .from("groups")

    .select("*")

    .eq(
      "id",
      member.group_id
    )

    .maybeSingle();


  if (error) {

    console.error(
      "getMyGroup:",
      error
    );

    throw error;
  }


  return data || null;
}


/* =====================================================
   GET MY ROLE
===================================================== */

export async function getMyRole() {

  const member =
    await getMyMember();


  if (!member) {
    return null;
  }


  return normalizeRole(
    member.role
  );
}


/* =====================================================
   HAS ROLE
===================================================== */

export async function hasRole(
  roles
) {

  const role =
    await getMyRole();


  if (!role) {
    return false;
  }


  const allowed =
    Array.isArray(roles)
      ? roles
      : [roles];


  return allowed
    .map(normalizeRole)
    .includes(role);
}


/* =====================================================
   REQUIRE ROLE
===================================================== */

export async function requireRole(
  roles,
  options = {}
) {

  const {
    redirect = true
  } = options;


  const member =
    await requireMember();


  if (!member) {
    return null;
  }


  const currentRole =
    normalizeRole(
      member.role
    );


  const allowedRoles =
    (
      Array.isArray(roles)
        ? roles
        : [roles]
    )
      .map(normalizeRole);


  if (
    allowedRoles.includes(
      currentRole
    )
  ) {

    return member;
  }


  if (redirect) {

    showAccessError(
      "You do not have permission to access this page."
    );

    setTimeout(() => {

      window.location.href =
        DASHBOARD_PAGE;

    }, 1200);

  }


  return null;
}


/* =====================================================
   ROLE HELPERS
===================================================== */

export function isAdmin(member) {

  return normalizeRole(
    member?.role
  ) === "admin";
}


export function isChairperson(member) {

  return normalizeRole(
    member?.role
  ) === "chairperson";
}


export function isTreasurer(member) {

  return normalizeRole(
    member?.role
  ) === "treasurer";
}


export function isSecretary(member) {

  return normalizeRole(
    member?.role
  ) === "secretary";
}


export function isMember(member) {

  return normalizeRole(
    member?.role
  ) === "member";
}


/* =====================================================
   ADMIN / MANAGEMENT CHECK
===================================================== */

export function canManageGroup(
  member
) {

  const role =
    normalizeRole(
      member?.role
    );


  return [
    "admin",
    "chairperson"
  ].includes(role);
}


/* =====================================================
   FINANCE MANAGEMENT CHECK
===================================================== */

export function canManageFinance(
  member
) {

  const role =
    normalizeRole(
      member?.role
    );


  return [
    "admin",
    "chairperson",
    "treasurer"
  ].includes(role);
}


/* =====================================================
   CONTRIBUTION MANAGEMENT
===================================================== */

export function canManageContributions(
  member
) {

  const role =
    normalizeRole(
      member?.role
    );


  return [
    "admin",
    "chairperson",
    "treasurer",
    "secretary"
  ].includes(role);
}


/* =====================================================
   MEMBER MANAGEMENT
===================================================== */

export function canManageMembers(
  member
) {

  const role =
    normalizeRole(
      member?.role
    );


  return [
    "admin",
    "chairperson",
    "secretary"
  ].includes(role);
}


/* =====================================================
   REPORT ACCESS
===================================================== */

export function canViewReports(
  member
) {

  const role =
    normalizeRole(
      member?.role
    );


  return [
    "admin",
    "chairperson",
    "treasurer",
    "secretary"
  ].includes(role);
}


/* =====================================================
   LOGOUT
===================================================== */

export async function signOut() {

  try {

    const {
      error
    } = await supabase.auth.signOut();


    if (error) {
      throw error;
    }


  } catch (error) {

    console.error(
      "Sign out error:",
      error
    );

  } finally {

    cachedUser = null;
    cachedMember = null;

    redirectToLogin();
  }
}


/* =====================================================
   REDIRECT TO LOGIN
===================================================== */

export function redirectToLogin() {

  const current =
    window.location.pathname;


  /*
   * Avoid endless redirects.
   */

  if (
    !current.endsWith(
      LOGIN_PAGE
    )
  ) {

    window.location.href =
      LOGIN_PAGE;
  }
}


/* =====================================================
   AUTH STATE LISTENER
===================================================== */

export function watchAuthState(
  callback
) {

  const {
    data
  } =
    supabase.auth.onAuthStateChange(
      async (
        event,
        session
      ) => {

        /*
         * Clear cache when user signs out.
         */

        if (
          event ===
          "SIGNED_OUT"
        ) {

          cachedUser = null;
          cachedMember = null;
        }


        /*
         * Refresh user cache when
         * authentication changes.
         */

        if (
          session &&
          event !== "SIGNED_OUT"
        ) {

          cachedUser =
            session.user;
        }


        if (
          typeof callback ===
          "function"
        ) {

          await callback(
            event,
            session
          );
        }

      }
    );


  return data.subscription;
}


/* =====================================================
   ACCESS ERROR
===================================================== */

function showAccessError(
  message
) {

  console.error(
    message
  );


  /*
   * If a global error element exists,
   * use it.
   */

  const error =
    document.getElementById(
      "error"
    );


  if (error) {

    error.hidden = false;

    error.textContent =
      message;

    return;
  }


  /*
   * Otherwise use a simple alert.
   */

  alert(message);
}


/* =====================================================
   CLEAR AUTH CACHE
===================================================== */

export function clearAuthCache() {

  cachedUser = null;
  cachedMember = null;
}


/* =====================================================
   EXPORT DEFAULT OBJECT
===================================================== */

export default {

  getCurrentUser,
  requireAuth,
  getMyMember,
  requireMember,
  getMyGroup,
  getMyRole,
  hasRole,
  requireRole,

  isAdmin,
  isChairperson,
  isTreasurer,
  isSecretary,
  isMember,

  canManageGroup,
  canManageFinance,
  canManageContributions,
  canManageMembers,
  canViewReports,

  signOut,
  redirectToLogin,
  watchAuthState,
  clearAuthCache

};
