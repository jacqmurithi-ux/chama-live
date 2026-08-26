import { supabase } from "./supabase.js";

export const BASE_URL =
  "https://jacqmurithi-ux.github.io/chama-live";

let cachedMember = null;
let cachedGroup = null;


/* =====================================================
   CLEAR CACHE
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

  return data.session || null;
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
      "get_my_member:",
      error
    );

    throw error;
  }

  if (Array.isArray(data)) {
    cachedMember =
      data[0] || null;
  } else {
    cachedMember =
      data || null;
  }

  return cachedMember;
}


/* =====================================================
   CURRENT MEMBER - ALIASES
===================================================== */

export async function getCurrentMember() {
  return await getMyMember();
}


/* =====================================================
   CURRENT GROUP
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
   * If get_my_member already returns
   * group information, use it.
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

    console.error(
      "getMyGroup:",
      error
    );

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
  allowedRoles = []
) {

  const role =
    await getMyRole();

  return allowedRoles
    .map(
      item =>
        String(
          item
        ).toLowerCase()
    )
    .includes(
      role
    );
}


/* =====================================================
   ADMIN
===================================================== */

export async function isAdmin() {

  return await hasRole([
    "admin"
  ]);
}


/* =====================================================
   CHAIRPERSON
===================================================== */

export async function isChairperson() {

  return await hasRole([
    "admin",
    "chairperson"
  ]);
}


/* =====================================================
   TREASURER
===================================================== */

export async function isTreasurer() {

  return await hasRole([
    "admin",
    "chairperson",
    "treasurer"
  ]);
}


/* =====================================================
   SECRETARY
===================================================== */

export async function isSecretary() {

  return await hasRole([
    "admin",
    "chairperson",
    "secretary"
  ]);
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

    console.error(
      "No member record found for authenticated user."
    );

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

    window.location.replace(
      `${BASE_URL}/dashboard.html?error=forbidden`
    );

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
          )
            .trim(),

        p_email:
          String(
            email
          )
            .trim()
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
   REFRESH MEMBER
===================================================== */

export async function refreshMyMember() {

  clearAuthCache();

  return await getMyMember(
    true
  );
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
   SUPABASE EXPORT
===================================================== */

export {
  supabase
};
