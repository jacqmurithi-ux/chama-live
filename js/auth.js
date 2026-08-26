import { supabase } from "./supabase.js";

export const BASE_URL =
  "https://jacqmurithi-ux.github.io/chama-live";


let cachedMember = null;


/* =====================================================
   CLEAR CACHE
===================================================== */

export function clearAuthCache() {

  cachedMember = null;

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
    throw error;
  }

  return data.session || null;

}


/* =====================================================
   GET CURRENT MEMBER
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

    console.error(
      "get_my_member error:",
      error
    );

    throw error;

  }


  /*
   * RPC may return:
   *
   * object
   * OR
   * array containing one object
   */

  if (
    Array.isArray(data)
  ) {

    cachedMember =
      data[0] || null;

  } else {

    cachedMember =
      data || null;

  }


  return cachedMember;

}


/* =====================================================
   GET ROLE
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
   GET GROUP
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
      "Authenticated user has no member record."
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
      "Authentication required. Please sign in first."
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


  cachedMember =
    null;


  return data;

}


/* =====================================================
   REFRESH MEMBER
===================================================== */

export async function refreshMyMember() {

  cachedMember =
    null;


  return await getMyMember(
    true
  );

}


/* =====================================================
   LOGOUT
===================================================== */

export async function logout() {

  cachedMember =
    null;


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
   AUTH STATE
===================================================== */

export function listenToAuthChanges(
  callback
) {

  return supabase.auth.onAuthStateChange(
    async (
      event,
      session
    ) => {

      cachedMember =
        null;


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
