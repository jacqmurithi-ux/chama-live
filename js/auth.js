import { supabase } from "./supabase.js";

/*
=====================================================
 CHAMA LIVE — AUTHENTICATION + RBAC
=====================================================

Expected members table fields:

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
created_at

Supported roles:

admin
chairperson
treasurer
secretary
member

RBAC hierarchy:

admin
  ↓
chairperson
  ↓
treasurer / secretary
  ↓
member
=====================================================
*/


/* =====================================================
   ROLE DEFINITIONS
===================================================== */

export const ROLES = Object.freeze({
  ADMIN: "admin",
  CHAIRPERSON: "chairperson",
  TREASURER: "treasurer",
  SECRETARY: "secretary",
  MEMBER: "member"
});


/* =====================================================
   ROLE PRIORITY
===================================================== */

const ROLE_PRIORITY = Object.freeze({
  admin: 100,
  chairperson: 80,
  treasurer: 60,
  secretary: 60,
  member: 10
});


/* =====================================================
   AUTH STATE
===================================================== */

let cachedUser = null;
let cachedMember = null;


/* =====================================================
   NORMALIZE ROLE
===================================================== */

export function normalizeRole(role) {

  if (!role) {
    return ROLES.MEMBER;
  }

  return String(role)
    .trim()
    .toLowerCase();

}


/* =====================================================
   GET AUTH USER
===================================================== */

export async function getCurrentUser() {

  const {
    data,
    error
  } = await supabase.auth.getUser();

  if (error) {
    console.error("Auth user error:", error);
    return null;
  }

  cachedUser = data?.user || null;

  return cachedUser;

}


/* =====================================================
   REQUIRE LOGIN
===================================================== */

export async function requireAuth() {

  const user = await getCurrentUser();

  if (!user) {

    const currentPage =
      window.location.pathname
        .split("/")
        .pop();

    const redirect =
      currentPage
        ? `?redirect=${encodeURIComponent(currentPage)}`
        : "";

    window.location.href =
      `login.html${redirect}`;

    return null;
  }

  return user;

}


/* =====================================================
   GET MY MEMBER RECORD
===================================================== */

export async function getMyMember() {

  if (cachedMember) {
    return cachedMember;
  }


  const user =
    await getCurrentUser();


  if (!user) {
    return null;
  }


  /*
   * auth_user_id links Supabase Auth
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
      "Member lookup error:",
      error
    );

    throw error;

  }


  if (!data) {

    console.warn(
      "Authenticated user has no member record."
    );

    return null;

  }


  cachedMember = {
    ...data,
    role: normalizeRole(data.role)
  };


  return cachedMember;

}


/* =====================================================
   REQUIRE MEMBER RECORD
===================================================== */

export async function requireMember() {

  const user =
    await requireAuth();


  if (!user) {
    return null;
  }


  const member =
    await getMyMember();


  if (!member) {

    alert(
      "Your account is authenticated, but it is not linked to a group member record. Please contact your group administrator."
    );

    await supabase.auth.signOut();

    window.location.href =
      "login.html";

    return null;

  }


  if (
    member.status &&
    member.status !== "active"
  ) {

    alert(
      "Your membership account is not active. Please contact your group administrator."
    );

    await supabase.auth.signOut();

    window.location.href =
      "login.html";

    return null;

  }


  return member;

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
   CHECK ROLE
===================================================== */

export async function hasRole(
  allowedRoles
) {

  const role =
    await getMyRole();

  if (!role) {
    return false;
  }


  if (
    typeof allowedRoles ===
    "string"
  ) {

    allowedRoles = [
      allowedRoles
    ];

  }


  return allowedRoles
    .map(normalizeRole)
    .includes(role);

}


/* =====================================================
   ROLE LEVEL
===================================================== */

export async function getRoleLevel() {

  const role =
    await getMyRole();

  if (!role) {
    return 0;
  }

  return (
    ROLE_PRIORITY[role] ||
    0
  );

}


/* =====================================================
   HAS MINIMUM ROLE
===================================================== */

export async function hasMinimumRole(
  requiredRole
) {

  const currentLevel =
    await getRoleLevel();

  const requiredLevel =
    ROLE_PRIORITY[
      normalizeRole(
        requiredRole
      )
    ] || 0;

  return (
    currentLevel >=
    requiredLevel
  );

}


/* =====================================================
   REQUIRE ROLE
===================================================== */

export async function requireRole(
  allowedRoles,
  options = {}
) {

  const member =
    await requireMember();


  if (!member) {
    return null;
  }


  const allowed =
    Array.isArray(
      allowedRoles
    )
      ? allowedRoles
      : [allowedRoles];


  const role =
    normalizeRole(
      member.role
    );


  const authorized =
    allowed
      .map(normalizeRole)
      .includes(role);


  if (authorized) {
    return member;
  }


  const message =
    options.message ||
    "You do not have permission to access this page.";


  if (
    options.alert !== false
  ) {

    alert(message);

  }


  const redirect =
    options.redirect ||
    "dashboard.html";


  window.location.href =
    redirect;


  return null;

}


/* =====================================================
   REQUIRE ADMIN
===================================================== */

export async function requireAdmin() {

  return requireRole(
    ROLES.ADMIN,
    {
      message:
        "Only a system administrator can access this page."
    }
  );

}


/* =====================================================
   REQUIRE ADMIN OR CHAIRPERSON
===================================================== */

export async function requireGroupLeadership() {

  return requireRole(
    [
      ROLES.ADMIN,
      ROLES.CHAIRPERSON
    ],
    {
      message:
        "Only the group administrator or chairperson can access this page."
    }
  );

}


/* =====================================================
   REQUIRE FINANCE ROLE
===================================================== */

export async function requireFinanceRole() {

  return requireRole(
    [
      ROLES.ADMIN,
      ROLES.CHAIRPERSON,
      ROLES.TREASURER
    ],
    {
      message:
        "You do not have permission to access financial management."
    }
  );

}


/* =====================================================
   REQUIRE MANAGEMENT ROLE
===================================================== */

export async function requireManagementRole() {

  return requireRole(
    [
      ROLES.ADMIN,
      ROLES.CHAIRPERSON,
      ROLES.TREASURER,
      ROLES.SECRETARY
    ],
    {
      message:
        "You do not have permission to access group management."
    }
  );

}


/* =====================================================
   GROUP ACCESS
===================================================== */

export async function getMyGroupId() {

  const member =
    await getMyMember();

  return (
    member?.group_id ||
    null
  );

}


/* =====================================================
   GET GROUP
===================================================== */

export async function getMyGroup() {

  const groupId =
    await getMyGroupId();


  if (!groupId) {
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
      groupId
    )

    .maybeSingle();


  if (error) {
    throw error;
  }


  return data || null;

}


/* =====================================================
   CHECK GROUP ACCESS
===================================================== */

export async function belongsToGroup(
  groupId
) {

  const myGroupId =
    await getMyGroupId();

  return (
    Boolean(myGroupId) &&
    myGroupId === groupId
  );

}


/* =====================================================
   LOGOUT
===================================================== */

export async function logout() {

  const {
    error
  } = await supabase.auth.signOut();


  if (error) {

    console.error(
      "Logout error:",
      error
    );

    throw error;

  }


  cachedUser = null;
  cachedMember = null;


  window.location.href =
    "login.html";

}


/* =====================================================
   AUTH STATE LISTENER
===================================================== */

export function watchAuth(
  callback
) {

  return supabase.auth
    .onAuthStateChange(
      (
        event,
        session
      ) => {

        /*
         * Clear cached identity when
         * the session disappears.
         */

        if (!session) {

          cachedUser = null;
          cachedMember = null;

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

}


/* =====================================================
   CLEAR AUTH CACHE
===================================================== */

export function clearAuthCache() {

  cachedUser = null;
  cachedMember = null;

}


/* =====================================================
   ROLE DISPLAY NAME
===================================================== */

export function roleLabel(
  role
) {

  const labels = {

    admin:
      "Administrator",

    chairperson:
      "Chairperson",

    treasurer:
      "Treasurer",

    secretary:
      "Secretary",

    member:
      "Member"

  };


  return (
    labels[
      normalizeRole(role)
    ] ||
    "Member"
  );

}


/* =====================================================
   ROLE PERMISSION HELPERS
===================================================== */

export async function canManageMembers() {

  return hasRole([
    ROLES.ADMIN,
    ROLES.CHAIRPERSON,
    ROLES.SECRETARY
  ]);

}


export async function canManageContributions() {

  return hasRole([
    ROLES.ADMIN,
    ROLES.CHAIRPERSON,
    ROLES.TREASURER,
    ROLES.SECRETARY
  ]);

}


export async function canManageExpenses() {

  return hasRole([
    ROLES.ADMIN,
    ROLES.CHAIRPERSON,
    ROLES.TREASURER,
    ROLES.SECRETARY
  ]);

}


export async function canCloseMonth() {

  return hasRole([
    ROLES.ADMIN,
    ROLES.CHAIRPERSON,
    ROLES.TREASURER
  ]);

}


export async function canManageGroup() {

  return hasRole([
    ROLES.ADMIN,
    ROLES.CHAIRPERSON
  ]);

}


export async function canManageUsers() {

  return hasRole([
    ROLES.ADMIN,
    ROLES.CHAIRPERSON
  ]);

}


/* =====================================================
   DEFAULT DASHBOARD
===================================================== */

export function dashboardForRole(
  role
) {

  role =
    normalizeRole(role);


  /*
   * For now all users use the same
   * dashboard. The dashboard itself
   * can hide/show modules according
   * to role.
   */

  return "dashboard.html";

}
