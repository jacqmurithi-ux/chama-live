
import { supabase } from "./supabase.js";

/* =========================================================
   AUTH STATE
========================================================= */

let cachedSession = null;
let cachedMember = null;


/* =========================================================
   GET SESSION
========================================================= */

export async function getSession() {

  if (cachedSession) {
    return cachedSession;
  }

  const {
    data,
    error
  } = await supabase.auth.getSession();

  if (error) {
    console.error("getSession error:", error);
    return null;
  }

  cachedSession = data?.session || null;

  return cachedSession;
}


/* =========================================================
   REQUIRE AUTH
========================================================= */

export async function requireAuth() {

  const session = await getSession();

  if (!session) {

    const currentPage =
      window.location.pathname
        .split("/")
        .pop();

    if (currentPage !== "login.html") {
      window.location.href =
        "login.html";
    }

    return null;
  }

  return session;
}


/* =========================================================
   GET CURRENT USER
========================================================= */

export async function getCurrentUser() {

  const session =
    await getSession();

  if (!session) {
    return null;
  }

  return session.user;
}


/* =========================================================
   GET MY MEMBER
========================================================= */

export async function getMyMember() {

  if (cachedMember) {
    return cachedMember;
  }

  const session =
    await requireAuth();

  if (!session) {
    return null;
  }


  /*
   * Preferred method:
   * get_my_member RPC
   */

  const {
    data,
    error
  } = await supabase.rpc(
    "get_my_member"
  );


  if (error) {

    console.error(
      "getMyMember RPC error:",
      error
    );

    /*
     * Fallback:
     * Look directly in members.
     */

    const {
      data: member,
      error: memberError
    } = await supabase
      .from("members")
      .select("*")
      .eq(
        "auth_user_id",
        session.user.id
      )
      .maybeSingle();


    if (memberError) {

      console.error(
        "Member lookup error:",
        memberError
      );

      return null;
    }

    cachedMember =
      member || null;

    return cachedMember;
  }


  /*
   * RPC may return an object
   * or an array.
   */

  if (Array.isArray(data)) {

    cachedMember =
      data[0] || null;

  } else {

    cachedMember =
      data || null;

  }

  return cachedMember;
}


/* =========================================================
   GET MY GROUP
========================================================= */

export async function getMyGroup() {

  const member =
    await getMyMember();

  if (!member?.group_id) {
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
      "getMyGroup error:",
      error
    );

    return null;
  }

  return data || null;
}


/* =========================================================
   GET MY ROLE
========================================================= */

export async function getMyRole() {

  const member =
    await getMyMember();

  if (!member) {
    return null;
  }

  return (
    member.role ||
    "member"
  ).toLowerCase();
}


/* =========================================================
   ROLE HELPERS
========================================================= */

export async function isAdmin() {

  const role =
    await getMyRole();

  return role === "admin";
}


export async function isChairperson() {

  const role =
    await getMyRole();

  return role === "chairperson";
}


export async function isTreasurer() {

  const role =
    await getMyRole();

  return role === "treasurer";
}


export async function isSecretary() {

  const role =
    await getMyRole();

  return role === "secretary";
}


export async function isMember() {

  const role =
    await getMyRole();

  return role === "member";
}


/* =========================================================
   MANAGEMENT ROLES
========================================================= */

export async function isManagement() {

  const role =
    await getMyRole();

  return [
    "admin",
    "chairperson",
    "treasurer",
    "secretary"
  ].includes(role);
}


/* =========================================================
   HAS ROLE
========================================================= */

export async function hasRole(
  roles
) {

  const role =
    await getMyRole();

  if (!role) {
    return false;
  }

  if (!Array.isArray(roles)) {
    roles = [roles];
  }

  return roles
    .map(
      item =>
        String(item)
          .toLowerCase()
    )
    .includes(role);
}


/* =========================================================
   REQUIRE ROLE
========================================================= */

export async function requireRole(
  roles
) {

  const session =
    await requireAuth();

  if (!session) {
    return null;
  }


  const allowed =
    await hasRole(roles);


  if (!allowed) {

    alert(
      "You do not have permission to access this page."
    );

    window.location.href =
      "dashboard.html";

    return null;
  }


  return session;
}


/* =========================================================
   ROLE LABEL
========================================================= */

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
      String(role || "")
        .toLowerCase()
    ] ||
    "Member"
  );
}


/* =========================================================
   LOGOUT
========================================================= */

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

  cachedSession = null;
  cachedMember = null;

  window.location.href =
    "login.html";
}


/* =========================================================
   AUTH STATE LISTENER
========================================================= */

supabase.auth.onAuthStateChange(
  (
    event,
    session
  ) => {

    cachedSession =
      session || null;

    if (!session) {

      cachedMember =
        null;

    }

  }
);


/* =========================================================
   CLEAR CACHE
========================================================= */

export function clearAuthCache() {

  cachedSession = null;
  cachedMember = null;

}
