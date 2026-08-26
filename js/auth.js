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


  /*
   * RPC RETURNS members
   *
   * Depending on Supabase response
   * it can arrive as an object or
   * single-element array.
   */

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
   GET MY GROUP ID
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


  /*
   * Fallback to database RPC.
   */

  const {
    data,
    error
  } =
    await supabase.rpc(
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

    await signOut();

    window.location.replace(
      "./login.html"
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
      "Authenticated member has no valid group."
    );

    await signOut();

    window.location.replace(
      "./login.html"
    );

    return null;
  }


  return group;
}


/* =========================================================
   ROLE
========================================================= */

export function getRole(
  member
) {

  return String(
    member?.role ||
    "member"
  ).toLowerCase();

}


/* =========================================================
   ADMIN CHECK
========================================================= */

export function isAdmin(
  member
) {

  const role =
    getRole(member);


  return [
    "admin",
    "administrator",
    "chairperson",
    "secretary",
    "treasurer"
  ].includes(role);

}


/* =========================================================
   MANAGER CHECK
========================================================= */

export function isManager(
  member
) {

  const role =
    getRole(member);


  return [
    "admin",
    "administrator",
    "chairperson",
    "secretary",
    "treasurer",
    "manager"
  ].includes(role);

}


/* =========================================================
   PERMISSION CHECK
========================================================= */

export function canManageGroup(
  member
) {

  return isAdmin(member);

}


export function canManageMembers(
  member
) {

  return isManager(member);

}


export function canRecordContributions(
  member
) {

  return isManager(member);

}


export function canRecordExpenses(
  member
) {

  return isManager(member);

}


export function canManageMeetings(
  member
) {

  return isManager(member);

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
    throw error;
  }


  window.location.replace(
    "./login.html"
  );
}


/*
 * Alias used by older pages.
 */

export const logout =
  signOut;


/* =========================================================
   SUPABASE AUTH LISTENER
========================================================= */

supabase.auth.onAuthStateChange(
  (
    event,
    session
  ) => {

    sessionCache =
      session || null;


    /*
     * Clear member/group data when
     * the user signs out.
     */

    if (
      event ===
      "SIGNED_OUT"
    ) {

      memberCache = null;
      groupCache = null;

    }

  }
);
