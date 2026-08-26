import { supabase } from "./supabase.js";

export const BASE_URL =
  "https://jacqmurithi-ux.github.io/chama-live";

let cachedMember = null;
let cachedGroup = null;


/* =====================================================
   CACHE
===================================================== */

export function clearAuthCache() {
  cachedMember = null;
  cachedGroup = null;
}


/* =====================================================
   SESSION
===================================================== */

export async function getSession() {

  const {
    data,
    error
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data?.session || null;
}


/* =====================================================
   MEMBER
===================================================== */

export async function getMyMember(
  force = false
) {

  if (
    cachedMember &&
    !force
  ) {
    return cachedMember;
  }


  const session =
    await getSession();


  if (!session) {
    return null;
  }


  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_my_member"
    );


  if (error) {
    throw error;
  }


  cachedMember =
    Array.isArray(data)
      ? data[0] || null
      : data || null;


  return cachedMember;
}


/* =====================================================
   GROUP
===================================================== */

export async function getMyGroup() {

  if (cachedGroup) {
    return cachedGroup;
  }


  const member =
    await getMyMember();


  if (!member) {
    return null;
  }


  /*
   * Some versions of get_my_member
   * may already return group data.
   */

  if (member.group) {

    cachedGroup =
      member.group;

    return cachedGroup;

  }


  if (!member.group_id) {
    return null;
  }


  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select("*")
      .eq(
        "id",
        member.group_id
      )
      .single();


  if (error) {
    throw error;
  }


  cachedGroup =
    data;


  return cachedGroup;
}


/* =====================================================
   GROUP ID
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
   ROLE
===================================================== */

export async function getMyRole() {

  const member =
    await getMyMember();

  return String(
    member?.role ||
    "member"
  ).toLowerCase();
}


/* =====================================================
   ROLE CHECK
===================================================== */

export async function hasRole(
  roles = []
) {

  const role =
    await getMyRole();


  return roles
    .map(
      value =>
        String(
          value
        ).toLowerCase()
    )
    .includes(
      role
    );
}


/* =====================================================
   REQUIRE AUTH
===================================================== */

export async function requireAuth() {

  const session =
    await getSession();


  if (!session) {

    window.location.replace(
      `${BASE_URL}/login.html`
    );

    return null;
  }


  const member =
    await getMyMember();


  if (!member) {

    await supabase.auth.signOut();

    window.location.replace(
      `${BASE_URL}/login.html?error=no-member`
    );

    return null;
  }


  return session;
}


/* =====================================================
   REQUIRE ROLE
===================================================== */

export async function requireRole(
  roles = []
) {

  const session =
    await requireAuth();


  if (!session) {
    return null;
  }


  if (
    !(await hasRole(roles))
  ) {

    window.location.replace(
      `${BASE_URL}/dashboard.html?error=forbidden`
    );

    return null;
  }


  return session;
}


/* =====================================================
   CLAIM MEMBER
===================================================== */

export async function claimMemberAccount(
  membershipNumber,
  email
) {

  const session =
    await getSession();


  if (!session) {

    throw new Error(
      "Authentication required."
    );

  }


  const {
    data,
    error
  } =
    await supabase.rpc(
      "claim_member_account",
      {
        p_membership_number:
          String(
            membershipNumber
          ).trim(),

        p_email:
          String(
            email
          ).trim()
          .toLowerCase()
      }
    );


  if (error) {
    throw error;
  }


  clearAuthCache();


  return data;
}


/* =====================================================
   REFRESH
===================================================== */

export async function refreshMyMember() {

  clearAuthCache();

  return await getMyMember(true);
}


/* =====================================================
   LOGOUT
===================================================== */

export async function logout() {

  clearAuthCache();

  const {
    error
  } =
    await supabase.auth.signOut();


  if (error) {
    throw error;
  }


  window.location.replace(
    `${BASE_URL}/login.html`
  );
}


/* =====================================================
   AUTH LISTENER
===================================================== */

export function listenToAuthChanges(
  callback
) {

  return supabase.auth.onAuthStateChange(
    async (
      event,
      session
    ) => {

      clearAuthCache();

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
   ROLE HELPERS
===================================================== */

export async function isAdmin() {
  return await hasRole(["admin"]);
}


export async function isChairperson() {
  return await hasRole([
    "admin",
    "chairperson"
  ]);
}


export async function isTreasurer() {
  return await hasRole([
    "admin",
    "chairperson",
    "treasurer"
  ]);
}


export async function isSecretary() {
  return await hasRole([
    "admin",
    "chairperson",
    "secretary"
  ]);
}


/* =====================================================
   SUPABASE
===================================================== */

export {
  supabase
};
