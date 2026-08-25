
import { supabase } from "./supabase.js";

/*
=====================================================
CHAMA LIVE AUTH + RBAC
=====================================================

Roles:
- admin
- chairperson
- treasurer
- secretary
- member

The member record in public.members is the RBAC
source of truth.
*/

let cachedMember = null;


/* =====================================================
   GET SESSION
===================================================== */

export async function getSession() {

  const {
    data,
    error
  } = await supabase.auth.getSession();

  if (error) {
    console.error("getSession:", error);
    return null;
  }

  return data?.session || null;
}


/* =====================================================
   REQUIRE LOGIN
===================================================== */

export async function requireAuth() {

  const session = await getSession();

  if (!session) {

    const currentPage =
      window.location.pathname
        .split("/")
        .pop();

    if (
      currentPage !== "login.html" &&
      currentPage !== ""
    ) {

      window.location.href =
        `login.html?redirect=${encodeURIComponent(currentPage)}`;

    }

    return null;
  }

  return session;
}


/* =====================================================
   GET CURRENT MEMBER
===================================================== */

export async function getMyMember(
  forceRefresh = false
) {

  if (
    cachedMember &&
    !forceRefresh
  ) {

    return cachedMember;

  }


  const session =
    await getSession();


  if (!session) {

    return null;

  }


  /*
   * auth_user_id is the preferred link.
   */

  let {
    data: member,
    error
  } = await supabase

    .from("members")

    .select(`
      id,
      group_id,
      auth_user_id,
      user_id,
      member_number,
      membership_number,
      name,
      phone,
      email,
      role,
      status,
      onboarding_status,
      join_date,
      created_at
    `)

    .eq(
      "auth_user_id",
      session.user.id
    )

    .maybeSingle();


  if (error) {

    console.error(
      "getMyMember:",
      error
    );

    throw error;

  }


  /*
   * Backward compatibility:
   * some older records may still use user_id.
   */

  if (!member) {

    const result =
      await supabase

        .from("members")

        .select(`
          id,
          group_id,
          auth_user_id,
          user_id,
          member_number,
          membership_number,
          name,
          phone,
          email,
          role,
          status,
          onboarding_status,
          join_date,
          created_at
        `)

        .eq(
          "user_id",
          session.user.id
        )

        .maybeSingle();


    if (result.error) {

      throw result.error;

    }

    member =
      result.data;

  }


  if (!member) {

    throw new Error(
      "Your login account is not linked to a CHAMA LIVE member record."
    );

  }


  /*
   * Check member status.
   */

  if (
    member.status &&
    member.status !== "active"
  ) {

    await supabase.auth.signOut();

    throw new Error(
      "Your membership account is not active."
    );

  }


  /*
   * Account must be activated.
   */

  if (
    member.onboarding_status &&
    member.onboarding_status !== "active"
  ) {

    throw new Error(
      "Your CHAMA LIVE account has not been activated yet."
    );

  }


  cachedMember =
    member;


  return member;

}


/* =====================================================
   GET CURRENT ROLE
===================================================== */

export async function getMyRole() {

  const member =
    await getMyMember();

  return normalizeRole(
    member?.role
  );

}


/* =====================================================
   NORMALIZE ROLE
===================================================== */

export function normalizeRole(
  role
) {

  return String(
    role || "member"
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

}


/* =====================================================
   ROLE CHECK
===================================================== */

export function hasRole(
  member,
  roles
) {

  if (!member) {

    return false;

  }


  const currentRole =
    normalizeRole(
      member.role
    );


  const allowed =
    Array.isArray(roles)
      ? roles
      : [roles];


  return allowed
    .map(normalizeRole)
    .includes(currentRole);

}


/* =====================================================
   ADMIN / CHAIRPERSON
===================================================== */

export function isAdmin(
  member
) {

  return hasRole(
    member,
    ["admin"]
  );

}


export function isChairperson(
  member
) {

  return hasRole(
    member,
    ["chairperson"]
  );

}


export function isManagement(
  member
) {

  return hasRole(
    member,
    [
      "admin",
      "chairperson"
    ]
  );

}


/* =====================================================
   FINANCE
===================================================== */

export function canManageFinance(
  member
) {

  return hasRole(
    member,
    [
      "admin",
      "chairperson",
      "treasurer"
    ]
  );

}


/* =====================================================
   CONTRIBUTIONS
===================================================== */

export function canManageContributions(
  member
) {

  return hasRole(
    member,
    [
      "admin",
      "chairperson",
      "treasurer",
      "secretary"
    ]
  );

}


/* =====================================================
   MEMBERS
===================================================== */

export function canManageMembers(
  member
) {

  return hasRole(
    member,
    [
      "admin",
      "chairperson",
      "secretary"
    ]
  );

}


/* =====================================================
   REQUIRE ROLE
===================================================== */

export async function requireRole(
  roles
) {

  const session =
    await requireAuth();


  if (!session) {

    return null;

  }


  const member =
    await getMyMember();


  if (
    !hasRole(
      member,
      roles
    )
  ) {

    window.location.href =
      "dashboard.html";

    return null;

  }


  return member;

}


/* =====================================================
   SIGN OUT
===================================================== */

export async function signOut() {

  cachedMember =
    null;


  const {
    error
  } = await supabase.auth.signOut();


  if (error) {

    console.error(
      "signOut:",
      error
    );

    throw error;

  }


  window.location.href =
    "login.html";

}


/* =====================================================
   AUTH STATE LISTENER
===================================================== */

supabase.auth.onAuthStateChange(
  (
    event,
    session
  ) => {

    if (
      event ===
      "SIGNED_OUT"
    ) {

      cachedMember =
        null;

    }

  }
);
