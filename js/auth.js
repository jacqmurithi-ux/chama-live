```javascript
import { supabase } from "./supabase.js";

/* =========================================================
   CACHE
========================================================= */

let sessionCache = null;
let memberCache = null;
let groupCache = null;


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

  sessionCache = data?.session || null;

  return sessionCache;
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
   REQUIRE AUTH
========================================================= */

export async function requireAuth() {

  const session = await getSession();

  if (!session) {

    window.location.replace("./login.html");

    return null;
  }

  return session;
}


/* =========================================================
   MY MEMBER
========================================================= */

export async function getMyMember(
  forceRefresh = false
) {

  if (memberCache && !forceRefresh) {
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
      "get_my_member error:",
      error
    );

    throw error;
  }

  let member = data;

  if (Array.isArray(data)) {
    member = data.length
      ? data[0]
      : null;
  }

  memberCache = member || null;

  return memberCache;
}


/* =========================================================
   MY GROUP
========================================================= */

export async function getMyGroup(
  forceRefresh = false
) {

  if (groupCache && !forceRefresh) {
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
      "get_my_group error:",
      error
    );

    throw error;
  }

  let group = data;

  if (Array.isArray(data)) {
    group = data.length
      ? data[0]
      : null;
  }

  groupCache = group || null;

  return groupCache;
}


/* =========================================================
   MY GROUP ID
========================================================= */

export async function getMyGroupId() {

  const member = await getMyMember();

  if (member?.group_id) {
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

  const session = await requireAuth();

  if (!session) {
    return null;
  }

  const member = await getMyMember();

  if (!member) {

    await signOut();

    return null;
  }

  return member;
}


/* =========================================================
   REQUIRE GROUP
========================================================= */

export async function requireGroup() {

  const member = await requireMember();

  if (!member) {
    return null;
  }

  const group = await getMyGroup();

  if (!group) {

    console.error(
      "Authenticated member has no group."
    );

    await signOut();

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
    source?.role || "member"
  )
    .trim()
    .toLowerCase();
}


/* =========================================================
   HAS ROLE
========================================================= */

export function hasRole(
  memberOrRoles,
  requiredRole
) {

  let member = memberOrRoles;
  let required = requiredRole;

  /*
     hasRole("admin")
     hasRole(["admin", "secretary"])

     Uses cached member.
  */

  if (
    requiredRole === undefined
  ) {

    required = memberOrRoles;
    member = memberCache;
  }

  const role = getRole(member);

  if (Array.isArray(required)) {

    return required
      .map(
        value =>
          String(value)
            .trim()
            .toLowerCase()
      )
      .includes(role);
  }

  return (
    role ===
    String(required || "member")
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
   CLEAR CACHE
========================================================= */

export function clearAuthCache() {

  sessionCache = null;
  memberCache = null;
  groupCache = null;
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

export const logout = signOut;


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
      event === "SIGNED_OUT"
    ) {

      sessionCache = null;
      memberCache = null;
      groupCache = null;
    }
  }
);


/* =========================================================
   IMPORTANT
========================================================= */

export { supabase };
```
