import { supabase } from "./supabase.js";

/*
 * Re-export Supabase so other modules can use:
 *
 * import { supabase, getMyMember, hasRole } from "./auth.js";
 */
export { supabase };


/* =========================================================
   CACHE
========================================================= */

let sessionCache = null;
let memberCache = null;
let groupCache = null;


/* =========================================================
   CLEAR CACHE
========================================================= */

export function clearAuthCache() {

  sessionCache = null;
  memberCache = null;
  groupCache = null;

}


/* =========================================================
   SESSION
========================================================= */

export async function getSession() {

  if (sessionCache) {
    return sessionCache;
  }

  const {
    data,
    error
  } = await supabase.auth.getSession();

  if (error) {
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
   CURRENT USER
========================================================= */

export async function getCurrentUser() {

  const {
    data,
    error
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return data?.user || null;
}


/* =========================================================
   MY MEMBER
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
  } = await supabase.rpc(
    "get_my_member"
  );

  if (error) {

    console.error(
      "get_my_member:",
      error
    );

    throw error;
  }

  let member = data;

  if (Array.isArray(data)) {

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
   MY GROUP
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
  } = await supabase.rpc(
    "get_my_group"
  );

  if (error) {

    console.error(
      "get_my_group:",
      error
    );

    throw error;
  }

  let group = data;

  if (Array.isArray(data)) {

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
   MY GROUP ID
========================================================= */

export async function getMyGroupId() {

  const member =
    await getMyMember();

  if (
    member &&
    member.group_id
  ) {
    return member.group_id;
  }

  const {
    data,
    error
  } = await supabase.rpc(
    "my_group_id"
  );

  if (error) {
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

    return null;
  }

  return group;
}


/* =========================================================
   ROLE
========================================================= */

export function getRole(
  member = null
) {

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
   * hasRole(member, ["admin", "secretary"])
   * hasRole("admin")
   * hasRole(["admin", "secretary"])
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
   ADMIN
========================================================= */

export function isAdmin(
  member = null
) {

  return [
    "admin",
    "administrator",
    "chairperson",
    "secretary",
    "treasurer"
  ].includes(
    getRole(member)
  );
}


/* =========================================================
   MANAGER
========================================================= */

export function isManager(
  member = null
) {

  return [
    "admin",
    "administrator",
    "chairperson",
    "secretary",
    "treasurer",
    "manager"
  ].includes(
    getRole(member)
  );
}


/* =========================================================
   PERMISSIONS
========================================================= */

export function canManageGroup(
  member = null
) {

  return isAdmin(member);
}


export function canManageMembers(
  member = null
) {

  return isManager(member);
}


export function canRecordContributions(
  member = null
) {

  return isManager(member);
}


export function canRecordExpenses(
  member = null
) {

  return isManager(member);
}


export function canManageMeetings(
  member = null
) {

  return isManager(member);
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
  email,
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
        .slice(0, 10),

    status:
      "active",

    onboarding_status:
      "pending"
  };


  const {
    data,
    error
  } = await supabase
    .from("members")
    .insert(payload)
    .select()
    .single();


  if (error) {

    console.error(
      "addGroupMember:",
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
  } = await supabase.auth.signOut();

  if (error) {
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
   AUTH STATE
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

      memberCache = null;
      groupCache = null;
    }
  }
);
