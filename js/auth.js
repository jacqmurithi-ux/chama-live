
import { supabase } from "./supabase.js";

/* =====================================================
   CHAMA LIVE AUTH + RBAC
===================================================== */

let cachedMember = null;

/* =====================================================
   SESSION
===================================================== */

export async function getSession() {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return session;
}


/* =====================================================
   CURRENT MEMBER
===================================================== */

export async function getMyMember(force = false) {

  if (cachedMember && !force) {
    return cachedMember;
  }

  const session = await getSession();

  if (!session) {
    return null;
  }

  const {
    data,
    error
  } = await supabase.rpc(
    "get_my_member"
  );

  if (error) {
    console.error(
      "get_my_member error:",
      error
    );

    throw error;
  }

  cachedMember = data || null;

  return cachedMember;
}


/* =====================================================
   CURRENT ROLE
===================================================== */

export async function getMyRole() {

  const member =
    await getMyMember();

  if (!member) {
    return null;
  }

  return String(
    member.role || "member"
  ).toLowerCase();
}


/* =====================================================
   GROUP ID
===================================================== */

export async function getMyGroupId() {

  const member =
    await getMyMember();

  return member?.group_id || null;
}


/* =====================================================
   ROLE CHECKS
===================================================== */

export async function isAdmin() {

  return (
    await getMyRole()
  ) === "admin";

}


export async function isChairperson() {

  const role =
    await getMyRole();

  return (
    role === "admin" ||
    role === "chairperson"
  );

}


export async function isTreasurer() {

  const role =
    await getMyRole();

  return (
    role === "admin" ||
    role === "chairperson" ||
    role === "treasurer"
  );

}


export async function isSecretary() {

  const role =
    await getMyRole();

  return (
    role === "admin" ||
    role === "chairperson" ||
    role === "secretary"
  );

}


/* =====================================================
   ROLE AUTHORIZATION
===================================================== */

export async function hasRole(
  allowedRoles = []
) {

  const role =
    await getMyRole();

  if (!role) {
    return false;
  }

  return allowedRoles
    .map(
      item =>
        String(item).toLowerCase()
    )
    .includes(role);

}


/* =====================================================
   REQUIRE AUTHENTICATION
===================================================== */

export async function requireAuth() {

  const session =
    await getSession();

  if (!session) {

    window.location.href =
      "login.html";

    return null;
  }

  const member =
    await getMyMember();

  if (!member) {

    console.warn(
      "Authenticated user has no active member record."
    );

    await supabase.auth.signOut();

    window.location.href =
      "login.html";

    return null;
  }

  return session;
}


/* =====================================================
   REQUIRE ROLE
===================================================== */

export async function requireRole(
  allowedRoles = []
) {

  const session =
    await requireAuth();

  if (!session) {
    return null;
  }

  const allowed =
    await hasRole(
      allowedRoles
    );

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


/* =====================================================
   CLAIM MEMBER ACCOUNT
===================================================== */

export async function claimMemberAccount(
  membershipNumber,
  email
) {

  const session =
    await getSession();

  if (!session) {

    throw new Error(
      "Please create your login account first."
    );

  }

  const {
    data,
    error
  } = await supabase.rpc(
    "claim_member_account",
    {
      p_membership_number:
        String(
          membershipNumber || ""
        ).trim(),

      p_email:
        String(
          email || ""
        ).trim().toLowerCase()
    }
  );

  if (error) {
    throw error;
  }

  cachedMember = null;

  return data;
}


/* =====================================================
   REFRESH MEMBER
===================================================== */

export async function refreshMyMember() {

  cachedMember = null;

  return await getMyMember(
    true
  );

}


/* =====================================================
   LOGOUT
===================================================== */

export async function logout() {

  cachedMember = null;

  const {
    error
  } =
    await supabase.auth.signOut();

  if (error) {
    throw error;
  }

  window.location.href =
    "login.html";
}


/* =====================================================
   AUTH STATE LISTENER
===================================================== */

export function listenToAuthChanges(
  callback
) {

  return supabase.auth.onAuthStateChange(
    async (
      event,
      session
    ) => {

      cachedMember = null;

      if (callback) {

        await callback(
          event,
          session
        );

      }

    }
  );

}


/* =====================================================
   EXPORT SUPABASE
===================================================== */

export {
  supabase
};
