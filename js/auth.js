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
   CURRENT USER
===================================================== */

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
      "get_my_member error:",
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
   CURRENT GROUP
===================================================== */

export async function getMyGroup(
  force = false
) {

  if (
    cachedGroup &&
    !force
  ) {
    return cachedGroup;
  }


  const member =
    await getMyMember();


  if (!member) {
    return null;
  }


  /*
   * Preferred method:
   * use the secure RPC created for the
   * authenticated user's group.
   */

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_my_group"
    );


  if (!error && data) {

    cachedGroup =
      Array.isArray(data)
        ? data[0] || null
        : data || null;

    return cachedGroup;

  }


  /*
   * Fallback:
   * if the RPC does not exist, try
   * the normal groups query.
   */

  if (!member.group_id) {
    return null;
  }


  const {
    data: group,
    error: groupError
  } =
    await supabase
      .from("groups")
      .select("*")
      .eq(
        "id",
        member.group_id
      )
      .maybeSingle();


  if (groupError) {

    console.error(
      "get group error:",
      groupError
    );

    throw groupError;

  }


  cachedGroup =
    group || null;


  return cachedGroup;
}


/* =====================================================
   CURRENT GROUP ID
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
   CURRENT ROLE
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


  const allowed =
    roles.map(
      value =>
        String(
          value
        ).toLowerCase()
    );


  return allowed.includes(
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
   MANAGEMENT ROLE
===================================================== */

export async function canManageGroup() {

  return await hasRole([
    "admin",
    "chairperson"
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

    clearAuthCache();


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
  memberNumber,
  email
) {

  const session =
    await getSession();


  if (!session) {

    throw new Error(
      "You must be signed in."
    );

  }


  if (!memberNumber) {

    throw new Error(
      "Member number is required."
    );

  }


  if (!email) {

    throw new Error(
      "Email address is required."
    );

  }


  const {
    data,
    error
  } =
    await supabase.rpc(
      "claim_member_account",
      {
        p_member_number:
          String(
            memberNumber
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
   COMPLETE AUTH CONTEXT
===================================================== */

export async function getAuthenticatedContext() {

  const session =
    await getSession();


  if (!session) {

    return {
      session: null,
      user: null,
      member: null,
      group: null
    };

  }


  const user =
    await getCurrentUser();


  const member =
    await getMyMember();


  const group =
    await getMyGroup();


  return {
    session,
    user,
    member,
    group
  };
}


/* =====================================================
   EXPORT SUPABASE
===================================================== */

export {
  supabase
};
