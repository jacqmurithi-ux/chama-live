import { supabase } from "./supabase.js";


/* =========================================================
   AUTH CACHE
========================================================= */

let memberCache = null;
let groupCache = null;
let sessionCache = null;


/* =========================================================
   CLEAR CACHE
========================================================= */

export function clearAuthCache() {

  memberCache = null;
  groupCache = null;
  sessionCache = null;

}


/* =========================================================
   GET SESSION
========================================================= */

export async function getSession() {

  const {
    data,
    error
  } = await supabase.auth.getSession();

  if (error) {
    console.error(
      "getSession error:",
      error
    );

    throw error;
  }

  sessionCache =
    data?.session || null;

  return sessionCache;
}


/* =========================================================
   REQUIRE AUTH
========================================================= */

export async function requireAuth() {

  const session =
    await getSession();

  if (!session) {

    window.location.replace(
      "./login.html"
    );

    return null;
  }

  return session;
}


/* =========================================================
   GET CURRENT USER
========================================================= */

export async function getCurrentUser() {

  const {
    data,
    error
  } = await supabase.auth.getUser();

  if (error) {

    console.error(
      "getCurrentUser error:",
      error
    );

    throw error;
  }

  return data?.user || null;
}


/* =========================================================
   GET MY MEMBER
========================================================= */

export async function getMyMember(
  forceRefresh = false
) {

  if (
    memberCache &&
    !forceRefresh
  ) {

    return memberCache;
  }


  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_my_member"
    );


  if (error) {

    console.error(
      "get_my_member error:",
      error
    );

    throw error;
  }


  let member =
    data;


  /*
   * Supabase RPC may return
   * an object or an array.
   */

  if (
    Array.isArray(data)
  ) {

    member =
      data.length
        ? data[0]
        : null;
  }


  memberCache =
    member || null;


  return memberCache;
}


/* =========================================================
   GET MY GROUP
========================================================= */

export async function getMyGroup(
  forceRefresh = false
) {

  if (
    groupCache &&
    !forceRefresh
  ) {

    return groupCache;
  }


  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_my_group"
    );


  if (error) {

    console.error(
      "get_my_group error:",
      error
    );

    throw error;
  }


  let group =
    data;


  /*
   * Supabase RPC may return
   * an object or an array.
   */

  if (
    Array.isArray(data)
  ) {

    group =
      data.length
        ? data[0]
        : null;
  }


  groupCache =
    group || null;


  return groupCache;
}


/* =========================================================
   GET MY GROUP ID
========================================================= */

export async function getMyGroupId() {

  /*
   * First try the member record.
   */

  const member =
    await getMyMember();


  if (
    member &&
    member.group_id
  ) {

    return member.group_id;
  }


  /*
   * Fallback to RPC.
   */

  const {
    data,
    error
  } =
    await supabase.rpc(
      "my_group_id"
    );


  if (error) {

    console.error(
      "my_group_id error:",
      error
    );

    throw error;
  }


  return data || null;
}


/* =========================================================
   REQUIRE MEMBER
========================================================= */

export async function requireMember() {

  const session =
    await requireAuth();


  if (!session) {
    return null;
  }


  const member =
    await getMyMember();


  if (!member) {

    console.error(
      "No member record found for authenticated user."
    );

    await signOut();

    return null;
  }


  return member;
}


/* =========================================================
   REQUIRE GROUP
========================================================= */

export async function requireGroup() {

  const member =
    await requireMember();


  if (!member) {
    return null;
  }


  const group =
    await getMyGroup();


  if (!group) {

    console.error(
      "No group found for authenticated member."
    );

    await signOut();

    return null;
  }


  return group;
}


/* =========================================================
   GET ROLE
========================================================= */

export function getRole(
  member = null
) {

  /*
   * Use supplied member first.
   * Otherwise use cached member.
   */

  const source =
    member ||
    memberCache;


  return String(
    source?.role ||
    "member"
  )
    .trim()
    .toLowerCase();
}


/* =========================================================
   HAS ROLE
========================================================= */

export function hasRole(
  member,
  requiredRole
) {

  let actualMember =
    member;

  let required =
    requiredRole;


  /*
   * Supports:
   *
   * hasRole(member, "admin")
   *
   * hasRole(member, ["admin", "treasurer"])
   *
   * hasRole("admin")
   *
   * hasRole(["admin", "treasurer"])
   */

  if (
    requiredRole === undefined
  ) {

    required =
      member;

    actualMember =
      memberCache;
  }


  const role =
    getRole(
      actualMember
    );


  if (
    Array.isArray(required)
  ) {

    return required
      .map(
        value =>
          String(value)
            .trim()
            .toLowerCase()
      )
      .includes(
        role
      );
  }


  return (
    role ===
    String(
      required ||
      "member"
    )
      .trim()
      .toLowerCase()
  );
}


/* =========================================================
   ADMIN CHECK
========================================================= */

export function isAdmin(
  member = null
) {

  const role =
    getRole(
      member
    );


  return [
    "admin",
    "administrator",
    "chairperson",
    "secretary",
    "treasurer"
  ].includes(
    role
  );
}


/* =========================================================
   MANAGER CHECK
========================================================= */

export function isManager(
  member = null
) {

  const role =
    getRole(
      member
    );


  return [
    "admin",
    "administrator",
    "chairperson",
    "secretary",
    "treasurer",
    "manager"
  ].includes(
    role
  );
}


/* =========================================================
   GROUP MANAGEMENT PERMISSION
========================================================= */

export function canManageGroup(
  member = null
) {

  return isAdmin(
    member
  );
}


/* =========================================================
   MEMBER MANAGEMENT PERMISSION
========================================================= */

export function canManageMembers(
  member = null
) {

  return isManager(
    member
  );
}


/* =========================================================
   CONTRIBUTION PERMISSION
========================================================= */

export function canRecordContributions(
  member = null
) {

  return isManager(
    member
  );
}


/* =========================================================
   EXPENSE PERMISSION
========================================================= */

export function canRecordExpenses(
  member = null
) {

  return isManager(
    member
  );
}


/* =========================================================
   MEETING PERMISSION
========================================================= */

export function canManageMeetings(
  member = null
) {

  return isManager(
    member
  );
}


/* =========================================================
   ADD GROUP MEMBER
========================================================= */

export async function addGroupMember({
  groupId,
  name,
  memberNumber,
  membershipNumber,
  phone,
  email = null,
  role = "member",
  joinDate = null
}) {

  if (!groupId) {

    throw new Error(
      "Group ID is required."
    );
  }


  if (!name) {

    throw new Error(
      "Member name is required."
    );
  }


  if (!memberNumber) {

    throw new Error(
      "Member number is required."
    );
  }


  if (!membershipNumber) {

    throw new Error(
      "Membership number is required."
    );
  }


  if (!phone) {

    throw new Error(
      "Phone number is required."
    );
  }


  const payload = {

    group_id:
      groupId,

    member_number:
      memberNumber,

    membership_number:
      membershipNumber,

    name:
      name,

    phone:
      phone,

    email:
      email || null,

    role:
      role || "member",

    join_date:
      joinDate ||
      new Date()
        .toISOString()
        .slice(
          0,
          10
        ),

    status:
      "active"
  };


  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .insert(payload)
      .select()
      .single();


  if (error) {

    console.error(
      "addGroupMember error:",
      error
    );

    throw error;
  }


  return data;
}


/* =========================================================
   SIGN OUT
========================================================= */

export async function signOut() {

  clearAuthCache();


  const {
    error
  } =
    await supabase.auth.signOut();


  if (error) {

    console.error(
      "signOut error:",
      error
    );

    throw error;
  }


  window.location.replace(
    "./login.html"
  );
}


/* =========================================================
   LOGOUT ALIAS
========================================================= */

export const logout =
  signOut;


/* =========================================================
   AUTH STATE LISTENER
========================================================= */

supabase.auth.onAuthStateChange(
  (
    event,
    session
  ) => {

    sessionCache =
      session || null;


    if (
      event ===
      "SIGNED_OUT"
    ) {

      memberCache =
        null;

      groupCache =
        null;

      sessionCache =
        null;
    }

  }
);
