import { supabase } from "./supabase.js";

/*
=====================================================
 CHAMA LIVE AUTH + RBAC
=====================================================

Responsibilities:

1. Verify authenticated Supabase user
2. Load the user's member record
3. Identify their group
4. Identify their role
5. Protect pages
6. Provide role checks
7. Sign users out

Expected members columns:

- id
- group_id
- auth_user_id
- member_number
- name
- phone
- email
- role
- status

Supported roles:

- admin
- chairperson
- treasurer
- secretary
- member

=====================================================
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
   ROLE PRIORITY
===================================================== */

const ROLE_PRIORITY = {
  admin: 100,
  chairperson: 90,
  treasurer: 70,
  secretary: 60,
  member: 10
};


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
      "getCurrentUser:",
      error
    );

    return null;
  }

  return data?.user || null;
}


/* =====================================================
   GET SESSION
===================================================== */

export async function getSession() {

  const {
    data,
    error
  } = await supabase.auth.getSession();

  if (error) {

    console.error(
      "getSession:",
      error
    );

    return null;
  }

  return data?.session || null;
}


/* =====================================================
   GET MY MEMBER
===================================================== */

export async function getMyMember() {

  const user =
    await getCurrentUser();

  if (!user) {

    return null;
  }


  /*
   IMPORTANT:

   auth_user_id links the Supabase Auth user
   to the member record.
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


  return data || null;
}


/* =====================================================
   GET AUTH CONTEXT
===================================================== */

export async function getAuthContext() {

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
    await getMyMember();


  if (!member) {

    return {
      authenticated: true,
      user,
      member: null,
      group: null,
      role: null
    };
  }


  let group = null;


  if (member.group_id) {

    const {
      data,
      error
    } = await supabase

      .from("groups")

      .select(`
        id,
        name,
        monthly_contribution,
        opening_balance
      `)

      .eq(
        "id",
        member.group_id
      )

      .maybeSingle();


    if (error) {

      console.error(
        "getAuthContext group:",
        error
      );

      throw error;
    }


    group = data || null;
  }


  return {

    authenticated: true,

    user,

    member,

    group,

    role:
      normalizeRole(
        member.role
      )

  };
}


/* =====================================================
   NORMALIZE ROLE
===================================================== */

export function normalizeRole(role) {

  if (!role) {

    return null;
  }


  const normalized =
    String(role)
      .trim()
      .toLowerCase();


  /*
   Handle possible legacy names.
  */

  if (
    normalized === "administrator"
  ) {

    return ROLES.ADMIN;
  }


  if (
    normalized === "chair"
  ) {

    return ROLES.CHAIRPERSON;
  }


  if (
    normalized === "group_chairperson"
  ) {

    return ROLES.CHAIRPERSON;
  }


  return normalized;
}


/* =====================================================
   ROLE PRIORITY
===================================================== */

export function rolePriority(role) {

  return (
    ROLE_PRIORITY[
      normalizeRole(role)
    ] || 0
  );
}


/* =====================================================
   HAS ROLE
===================================================== */

export function hasRole(
  member,
  allowedRoles
) {

  if (!member) {

    return false;
  }


  const role =
    normalizeRole(
      member.role
    );


  if (!role) {

    return false;
  }


  const roles =
    Array.isArray(
      allowedRoles
    )
      ? allowedRoles
      : [allowedRoles];


  return roles
    .map(normalizeRole)
    .includes(role);
}


/* =====================================================
   HAS ANY ROLE
===================================================== */

export function hasAnyRole(
  member,
  roles
) {

  return hasRole(
    member,
    roles
  );
}


/* =====================================================
   HAS MINIMUM ROLE
===================================================== */

export function hasMinimumRole(
  member,
  requiredRole
) {

  if (!member) {

    return false;
  }


  return (
    rolePriority(
      member.role
    ) >=
    rolePriority(
      requiredRole
    )
  );
}


/* =====================================================
   IS ADMIN
===================================================== */

export function isAdmin(member) {

  return hasRole(
    member,
    ROLES.ADMIN
  );
}


/* =====================================================
   IS CHAIRPERSON
===================================================== */

export function isChairperson(member) {

  return hasRole(
    member,
    ROLES.CHAIRPERSON
  );
}


/* =====================================================
   IS ADMIN OR CHAIRPERSON
===================================================== */

export function isGroupLeader(member) {

  return hasRole(
    member,
    [
      ROLES.ADMIN,
      ROLES.CHAIRPERSON
    ]
  );
}


/* =====================================================
   CAN MANAGE MEMBERS
===================================================== */

export function canManageMembers(member) {

  return hasRole(
    member,
    [
      ROLES.ADMIN,
      ROLES.CHAIRPERSON
    ]
  );
}


/* =====================================================
   CAN MANAGE GROUP
===================================================== */

export function canManageGroup(member) {

  return hasRole(
    member,
    ROLES.ADMIN
  );
}


/* =====================================================
   CAN RECORD CONTRIBUTIONS
===================================================== */

export function canRecordContributions(member) {

  return hasRole(
    member,
    [
      ROLES.ADMIN,
      ROLES.CHAIRPERSON,
      ROLES.TREASURER,
      ROLES.SECRETARY
    ]
  );
}


/* =====================================================
   CAN MANAGE EXPENSES
===================================================== */

export function canManageExpenses(member) {

  return hasRole(
    member,
    [
      ROLES.ADMIN,
      ROLES.CHAIRPERSON,
      ROLES.TREASURER,
      ROLES.SECRETARY
    ]
  );
}


/* =====================================================
   CAN CLOSE MONTH
===================================================== */

export function canCloseMonth(member) {

  return hasRole(
    member,
    [
      ROLES.ADMIN,
      ROLES.CHAIRPERSON,
      ROLES.TREASURER
    ]
  );
}


/* =====================================================
   REQUIRE AUTH
===================================================== */

export async function requireAuth(
  redirect = "login.html"
) {

  const user =
    await getCurrentUser();


  if (!user) {

    window.location.href =
      redirect;

    return null;
  }


  return user;
}


/* =====================================================
   REQUIRE MEMBER
===================================================== */

export async function requireMember(
  redirect = "login.html"
) {

  await requireAuth(
    redirect
  );


  const member =
    await getMyMember();


  if (!member) {

    alert(
      "Your account has not yet been linked to a group member."
    );

    await supabase.auth.signOut();

    window.location.href =
      redirect;

    return null;
  }


  return member;
}


/* =====================================================
   REQUIRE ROLE
===================================================== */

export async function requireRole(
  allowedRoles,
  options = {}
) {

  const {

    redirect =
      "dashboard.html",

    message =
      "You do not have permission to access this page."

  } = options;


  const member =
    await requireMember();


  if (!member) {

    return null;
  }


  if (
    !hasRole(
      member,
      allowedRoles
    )
  ) {

    alert(message);

    window.location.href =
      redirect;

    return null;
  }


  return member;
}


/* =====================================================
   REQUIRE GROUP LEADER
===================================================== */

export async function requireGroupLeader() {

  return requireRole(
    [
      ROLES.ADMIN,
      ROLES.CHAIRPERSON
    ]
  );
}


/* =====================================================
   REQUIRE ADMIN
===================================================== */

export async function requireAdmin() {

  return requireRole(
    ROLES.ADMIN
  );
}


/* =====================================================
   SIGN OUT
===================================================== */

export async function signOut(
  redirect = "login.html"
) {

  const {
    error
  } = await supabase.auth.signOut();


  if (error) {

    console.error(
      "Sign out:",
      error
    );

    throw error;
  }


  window.location.href =
    redirect;
}


/* =====================================================
   AUTH STATE LISTENER
===================================================== */

export function onAuthStateChange(
  callback
) {

  return supabase.auth
    .onAuthStateChange(
      (
        event,
        session
      ) => {

        callback(
          event,
          session
        );

      }
    );
}


/* =====================================================
   USER DISPLAY NAME
===================================================== */

export function getDisplayName(
  user,
  member
) {

  if (
    member?.name
  ) {

    return member.name;
  }


  if (
    user?.user_metadata?.name
  ) {

    return user.user_metadata.name;
  }


  if (
    user?.email
  ) {

    return user.email
      .split("@")[0];
  }


  return "User";
}


/* =====================================================
   ROLE DISPLAY NAME
===================================================== */

export function getRoleLabel(
  role
) {

  const normalized =
    normalizeRole(role);


  return (
    ROLE_LABELS[
      normalized
    ] ||
    "Member"
  );
}
