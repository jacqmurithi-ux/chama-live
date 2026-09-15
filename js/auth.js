/* =========================================================
   CHAMA LIVE — AUTHENTICATION CORE

   AUTHORITY
   ---------------------------------------------------------
   Supabase Auth owns authentication identity and passwords.
   The members relationship resolves the authenticated user's
   group context.

   SECURITY CONTRACT
   ---------------------------------------------------------
   auth.uid()
        ↓
   get_my_member()
        ↓
   members.id / members.group_id
        ↓
   my_group_id()
        ↓
   groups.id

   The frontend never accepts group_id from a URL, query string,
   localStorage value, or form field as an authorization source.

   PORTAL ARCHITECTURE
   ---------------------------------------------------------
   This module authenticates the user and resolves the current
   member/group context. Portal authorization is handled by the
   portal guard and, ultimately, by database authorization.

   IMPORTANT
   ---------------------------------------------------------
   This module contains NO platform-admin account-review flow.
   There is no redirect to account-review.html and no dependency
   on group application approval.

   CANONICAL FRONTEND EXPORTS
   ---------------------------------------------------------
     - supabase
     - BASE_URL
     - getCurrentUser()
     - getMyMember()
     - getMyGroupId()
     - getMyGroup()
     - requireAuth()
     - signIn()
     - signOut()
     - money()
     - setText()
     - showError()
     - clearError()

   DATABASE
   ---------------------------------------------------------
   No database mutation is performed by this file.
   Existing canonical RPC contracts are preserved.
========================================================= */

import {
  supabase
} from "./supabase.js";


/* =========================================================
   EXPORT SUPABASE CLIENT
========================================================= */

export {
  supabase
};


/* =========================================================
   BASE URL
========================================================= */

export const BASE_URL =
  "https://jacqmurithi-ux.github.io/chama-live";


/* =========================================================
   SIGN IN
========================================================= */

export async function signIn(
  email,
  password
) {

  const cleanEmail =
    String(
      email || ""
    )
      .trim()
      .toLowerCase();


  if (!cleanEmail) {

    throw new Error(
      "Please enter your email address."
    );

  }


  if (!password) {

    throw new Error(
      "Please enter your password."
    );

  }


  const {
    data,
    error
  } =
    await supabase.auth.signInWithPassword({

      email:
        cleanEmail,

      password

    });


  if (error) {

    throw error;

  }


  if (
    !data?.user ||
    !data?.session
  ) {

    throw new Error(
      "Sign in failed. No active session was created."
    );

  }


  return data;

}


/* =========================================================
   CURRENT USER
========================================================= */

export async function getCurrentUser() {

  const {
    data,
    error
  } =
    await supabase.auth.getUser();


  if (error) {

    throw error;

  }


  if (!data?.user) {

    throw new Error(
      "You are not logged in."
    );

  }


  return data.user;

}


/* =========================================================
   CANONICAL MEMBER LOOKUP
========================================================= */

async function getMemberFromCanonicalRPC() {

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


  if (
    Array.isArray(data)
  ) {

    if (
      data.length === 0
    ) {

      return null;

    }


    return data[0];

  }


  if (
    data &&
    typeof data === "object"
  ) {

    return data;

  }


  return null;

}


/* =========================================================
   COMPATIBILITY MEMBER LOOKUP
   ---------------------------------------------------------
   Retained only for existing deployments where the canonical
   RPC is temporarily unavailable.

   Identity still comes exclusively from Supabase Auth.
========================================================= */

async function getMemberByAuthUser(
  userId
) {

  if (!userId) {

    throw new Error(
      "Authentication user ID is required."
    );

  }


  const memberColumns = `
    id,
    group_id,
    user_id,
    auth_user_id,
    member_number,
    membership_number,
    name,
    phone,
    email,
    role,
    join_date,
    status,
    onboarding_status,
    invited_at,
    activated_at,
    created_at
  `;


  const byAuthUser =
    await supabase
      .from("members")
      .select(memberColumns)
      .eq(
        "auth_user_id",
        userId
      )
      .order(
        "created_at",
        {
          ascending: true
        }
      )
      .limit(1);


  if (byAuthUser.error) {

    console.error(
      "CHAMA LIVE: auth_user_id member lookup failed",
      byAuthUser.error
    );

    throw byAuthUser.error;

  }


  if (
    byAuthUser.data &&
    byAuthUser.data.length > 0
  ) {

    return byAuthUser.data[0];

  }


  const byLegacyUserId =
    await supabase
      .from("members")
      .select(memberColumns)
      .eq(
        "user_id",
        userId
      )
      .order(
        "created_at",
        {
          ascending: true
        }
      )
      .limit(1);


  if (byLegacyUserId.error) {

    console.error(
      "CHAMA LIVE: user_id member lookup failed",
      byLegacyUserId.error
    );

    throw byLegacyUserId.error;

  }


  if (
    !byLegacyUserId.data ||
    byLegacyUserId.data.length === 0
  ) {

    return null;

  }


  return byLegacyUserId.data[0];

}


/* =========================================================
   GET MY MEMBER
========================================================= */

export async function getMyMember() {

  const user =
    await getCurrentUser();


  try {

    const member =
      await getMemberFromCanonicalRPC();


    if (member) {

      if (!member.group_id) {

        throw new Error(
          "Your member record has no group."
        );

      }


      return member;

    }

  }

  catch (rpcError) {

    console.warn(
      "CHAMA LIVE: get_my_member RPC unavailable; using compatibility lookup.",
      rpcError
    );

  }


  const member =
    await getMemberByAuthUser(
      user.id
    );


  if (!member) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  if (!member.group_id) {

    throw new Error(
      "Your member record has no group."
    );

  }


  return member;

}


/* =========================================================
   GET MY GROUP ID
========================================================= */

export async function getMyGroupId() {

  try {

    const {
      data,
      error
    } =
      await supabase.rpc(
        "my_group_id"
      );


    if (!error && data) {

      return data;

    }


    if (error) {

      console.warn(
        "CHAMA LIVE: my_group_id RPC unavailable; using member group_id.",
        error
      );

    }

  }

  catch (error) {

    console.warn(
      "CHAMA LIVE: my_group_id RPC failed; using member group_id.",
      error
    );

  }


  const member =
    await getMyMember();


  if (!member?.group_id) {

    throw new Error(
      "No group is associated with your member account."
    );

  }


  return member.group_id;

}


/* =========================================================
   GET MY GROUP
========================================================= */

export async function getMyGroup() {

  const groupId =
    await getMyGroupId();


  if (!groupId) {

    throw new Error(
      "No group is associated with your member account."
    );

  }


  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select(`
        id,
        name,
        registration_number,
        phone,
        email,
        monthly_contribution,
        opening_balance,
        created_at,
        category,
        description,
        access_code,
        country
      `)
      .eq(
        "id",
        groupId
      )
      .limit(1);


  if (error) {

    console.error(
      "CHAMA LIVE: group lookup failed",
      error
    );

    throw error;

  }


  if (
    !data ||
    data.length === 0
  ) {

    throw new Error(
      "Group information could not be found."
    );

  }


  return data[0];

}


/* =========================================================
   REQUIRE AUTH
   ---------------------------------------------------------
   Authentication gate only.

   There is intentionally NO:
     - account-review redirect
     - application approval check
     - onboarding approval routing
     - platform-admin review dependency

   Portal-specific authorization belongs to portal-guard.js.
========================================================= */

export async function requireAuth() {

  const {
    data,
    error
  } =
    await supabase.auth.getSession();


  if (error) {

    throw error;

  }


  const session =
    data?.session;


  if (!session?.user) {

    redirectToLogin();

    throw new Error(
      "You are not logged in."
    );

  }


  let member;


  try {

    member =
      await getMyMember();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: authenticated member resolution failed",
      error
    );

    redirectToLogin();

    throw error;

  }


  if (!member?.group_id) {

    redirectToLogin();

    throw new Error(
      "Your member record has no group."
    );

  }


  const status =
    String(
      member.status || ""
    )
      .trim()
      .toLowerCase();


  if (
    status === "suspended" ||
    status === "inactive" ||
    status === "rejected"
  ) {

    await supabase.auth.signOut();

    redirectToLogin();

    throw new Error(
      "Your account is not currently active."
    );

  }


  return session.user;

}


/* =========================================================
   SIGN OUT
========================================================= */

export async function signOut() {

  const {
    error
  } =
    await supabase.auth.signOut();


  if (error) {

    throw error;

  }


  redirectToLogin();

}


/* =========================================================
   LOGIN REDIRECT
========================================================= */

function redirectToLogin() {

  if (
    typeof window !== "undefined"
  ) {

    window.location.replace(
      `${BASE_URL}/login.html`
    );

  }

}


/* =========================================================
   MONEY
========================================================= */

export function money(
  amount
) {

  const numericAmount =
    Number(amount || 0);


  return (
    "KSh " +
    numericAmount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )
  );

}


/* =========================================================
   SET TEXT
========================================================= */

export function setText(
  elementOrId,
  value
) {

  const element =
    typeof elementOrId === "string"
      ? document.getElementById(elementOrId)
      : elementOrId;


  if (!element) {

    return;

  }


  element.textContent =
    value === null ||
    value === undefined
      ? ""
      : String(value);

}


/* =========================================================
   SHOW ERROR
========================================================= */

export function showError(
  elementOrId,
  message
) {

  const element =
    typeof elementOrId === "string"
      ? document.getElementById(elementOrId)
      : elementOrId;


  if (!element) {

    console.error(
      message
    );

    return;

  }


  element.textContent =
    message || "An unexpected error occurred.";


  element.hidden =
    false;

  element.style.display =
    "block";

}


/* =========================================================
   CLEAR ERROR
========================================================= */

export function clearError(
  elementOrId
) {

  const element =
    typeof elementOrId === "string"
      ? document.getElementById(elementOrId)
      : elementOrId;


  if (!element) {

    return;

  }


  element.textContent =
    "";

  element.hidden =
    true;

  element.style.display =
    "none";

}
