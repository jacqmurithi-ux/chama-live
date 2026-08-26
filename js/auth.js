
import { supabase } from "./supabase.js";

const BASE_URL =
  "https://jacqmurithi-ux.github.io/chama-live";


let cachedMember = null;


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

  return data.session;
}


/* =====================================================
   CURRENT MEMBER
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
      "get_my_member:",
      error
    );

    throw error;

  }


  cachedMember =
    Array.isArray(data)
      ? data[0] || null
      : data || null;


  return cachedMember;
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
   GROUP
===================================================== */

export async function getMyGroupId() {

  const member =
    await getMyMember();

  return member?.group_id ||
    null;
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


  const allowed =
    await hasRole(
      roles
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
      "Please sign in before activating your member account."
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


  cachedMember =
    null;


  return data;

}


/* =====================================================
   REFRESH
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
   EXPORT
===================================================== */

export {
  supabase
};

export {
  BASE_URL
};
