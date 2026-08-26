```javascript
import { supabase } from "./supabase.js";

export const BASE_URL =
  "https://jacqmurithi-ux.github.io/chama-live";


/* =====================================================
   CACHE
===================================================== */

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
      "get_my_member:",
      error
    );

    throw error;

  }


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


  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_my_group"
    );


  if (error) {

    console.error(
      "get_my_group:",
      error
    );

    throw error;

  }


  if (
    Array.isArray(data)
  ) {

    cachedGroup =
      data[0] || null;

  } else {

    cachedGroup =
      data || null;

  }


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


  const allowed =
    roles.map(
      item =>
        String(
          item
        ).toLowerCase()
    );


  return allowed.includes(
    role
  );

}


/* =====================================================
   ADMIN / CHAIRPERSON
===================================================== */

export async function canManageGroup() {

  return await hasRole([
    "admin",
    "chairperson"
  ]);

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
  membershipNumber,
  email
) {

  const session =
    await getSession();


  if (!session) {

    throw new Error(
      "You must be signed in before activating your member account."
    );

  }


  const number =
    String(
      membershipNumber || ""
    ).trim();


  const address =
    String(
      email || ""
    ).trim()
    .toLowerCase();


  if (!number) {

    throw new Error(
      "Membership number is required."
    );

  }


  if (!address) {

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
        p_membership_number:
          number,

        p_email:
          address
      }
    );


  if (error) {

    console.error(
      "claim_member_account:",
      error
    );

    throw error;

  }


  clearAuthCache();


  return data;

}


/* =====================================================
   ADD GROUP MEMBER
===================================================== */

export async function addGroupMember({
  groupId,
  name,
  memberNumber,
  membershipNumber,
  phone,
  email,
  role,
  joinDate
}) {

  if (!groupId) {

    throw new Error(
      "Group ID is required."
    );

  }


  const {
    data,
    error
  } =
    await supabase.rpc(
      "add_group_member",
      {
        p_group_id:
          groupId,

        p_name:
          name,

        p_member_number:
          memberNumber,

        p_membership_number:
          membershipNumber,

        p_phone:
          phone,

        p_email:
          email || null,

        p_role:
          role || "member",

        p_join_date:
          joinDate ||
          new Date()
            .toISOString()
            .slice(0, 10)
      }
    );


  if (error) {

    console.error(
      "add_group_member:",
      error
    );

    throw error;

  }


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
   AUTH CONTEXT
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
   SUPABASE EXPORT
===================================================== */

export {
  supabase
};
```
