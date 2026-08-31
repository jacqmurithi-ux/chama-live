/* =========================================================
   CHAMA LIVE — AUTHENTICATION & CURRENT GROUP
   COMPLETE STABLE VERSION

   Group-scoped authentication.

   CANONICAL RESOLUTION
   ---------------------------------------------------------
   Supabase Auth user
          ↓
   get_my_member()
          ↓
   members.id / members.group_id
          ↓
   my_group_id()
          ↓
   groups.id

   IMPORTANT
   ---------------------------------------------------------
   NEVER accept group_id from:
   - URL
   - localStorage
   - form fields
   - query parameters

   The authenticated Supabase user is the source of identity.

   DATABASE
   ---------------------------------------------------------
   Production Supabase is NOT modified by this file.

   The frontend uses the existing canonical RPCs:
     - get_my_member()
     - my_group_id()

   Direct members-table lookup remains only as a
   compatibility fallback for environments where the
   canonical RPC is temporarily unavailable.
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
   PUBLIC PAGES
========================================================= */

const PUBLIC_PAGES = [

  "",

  "index.html",

  "login.html",

  "signup.html",

  "create-group.html",

  "account-review.html",

  "forgot-password.html",

  "activate-account.html",

  "reset-password.html"

];


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
   ---------------------------------------------------------
   Primary path:
       get_my_member()

   This lets the database resolve the authenticated member
   using auth.uid() rather than trusting a frontend-supplied
   user/group identifier.
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


  /*
   * PostgreSQL RPC functions may return:
   *
   *   object
   *
   * or:
   *
   *   array with one object
   *
   * Normalize both forms.
   */

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
   Used only if the canonical RPC cannot be called.

   Lookup order:
       auth_user_id
       ↓
       user_id

   group_id is NEVER supplied by the caller.
========================================================= */

async function getMemberByAuthUser(
  userId
) {

  if (!userId) {

    throw new Error(
      "Authentication user ID is required."
    );

  }


  /*
   * -------------------------------------------------------
   * FIRST: auth_user_id
   * -------------------------------------------------------
   */

  let {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(`
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
      `)
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


  if (error) {

    console.error(
      "CHAMA LIVE: auth_user_id member lookup failed",
      error
    );

    throw error;

  }


  if (
    data &&
    data.length > 0
  ) {

    return data[0];

  }


  /*
   * -------------------------------------------------------
   * SECOND: legacy user_id
   * -------------------------------------------------------
   */

  const fallback =
    await supabase
      .from("members")
      .select(`
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
      `)
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


  if (fallback.error) {

    console.error(
      "CHAMA LIVE: user_id member lookup failed",
      fallback.error
    );

    throw fallback.error;

  }


  if (
    !fallback.data ||
    fallback.data.length === 0
  ) {

    return null;

  }


  return fallback.data[0];

}


/* =========================================================
   GET MY MEMBER
   ---------------------------------------------------------
   CANONICAL PATH
========================================================= */

export async function getMyMember() {

  /*
   * Verify that an authenticated user exists first.
   */

  const user =
    await getCurrentUser();


  /*
   * -------------------------------------------------------
   * PRIMARY: CANONICAL RPC
   * -------------------------------------------------------
   */

  try {

    const member =
      await getMemberFromCanonicalRPC();


    if (member) {

      /*
       * Ensure the canonical result has a group.
       */

      if (!member.group_id) {

        throw new Error(
          "Your member record has no group."
        );

      }


      return member;

    }

  }

  catch (rpcError) {

    /*
     * The fallback is deliberately retained for
     * compatibility with older database deployments.
     *
     * This does NOT change production data.
     */

    console.warn(
      "CHAMA LIVE: get_my_member RPC unavailable; using compatibility lookup.",
      rpcError
    );

  }


  /*
   * -------------------------------------------------------
   * FALLBACK
   * -------------------------------------------------------
   */

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
   ---------------------------------------------------------
   Primary path:
       my_group_id()

   Fallback:
       getMyMember().group_id
========================================================= */

export async function getMyGroupId() {

  /*
   * First attempt the canonical database function.
   */

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


  /*
   * Fallback to the canonical member object.
   */

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
========================================================= */

export async function requireAuth() {

  /*
   * -------------------------------------------------------
   * VERIFY SESSION
   * -------------------------------------------------------
   */

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


  /*
   * -------------------------------------------------------
   * RESOLVE MEMBER THROUGH CANONICAL PATH
   * -------------------------------------------------------
   */

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


    await supabase.auth.signOut();

    redirectToLogin();


    throw error;

  }


  /*
   * -------------------------------------------------------
   * GROUP REQUIRED
   * -------------------------------------------------------
   */

  if (!member?.group_id) {

    await supabase.auth.signOut();

    redirectToLogin();

    throw new Error(
      "Your member record has no group."
    );

  }


  /*
   * -------------------------------------------------------
   * ONBOARDING STATUS
   * -------------------------------------------------------
   */

  const onboardingStatus =
    String(
      member.onboarding_status ||
      ""
    )
      .trim()
      .toLowerCase();


  /*
   * -------------------------------------------------------
   * MEMBER STATUS
   * -------------------------------------------------------
   */

  const memberStatus =
    String(
      member.status ||
      ""
    )
      .trim()
      .toLowerCase();


  /*
   * -------------------------------------------------------
   * PENDING / SUBMITTED
   * -------------------------------------------------------
   */

  if (
    onboardingStatus === "pending" ||
    onboardingStatus === "submitted" ||
    memberStatus === "pending"
  ) {

    redirectToReview();

    throw new Error(
      "Your account is still under review."
    );

  }


  /*
   * -------------------------------------------------------
   * REJECTED
   * -------------------------------------------------------
   */

  if (
    onboardingStatus === "rejected" ||
    memberStatus === "rejected"
  ) {

    await supabase.auth.signOut();

    redirectToLogin();

    throw new Error(
      "Your account application was not approved."
    );

  }


  /*
   * -------------------------------------------------------
   * SUSPENDED / INACTIVE
   * -------------------------------------------------------
   */

  if (
    memberStatus === "suspended" ||
    memberStatus === "inactive"
  ) {

    await supabase.auth.signOut();

    redirectToLogin();

    throw new Error(
      "Your account is not currently active."
    );

  }


  /*
   * -------------------------------------------------------
   * ACTIVE ACCOUNT
   * -------------------------------------------------------
   */

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
   REDIRECT LOGIN
========================================================= */

function redirectToLogin() {

  window.location.replace(
    `${BASE_URL}/login.html`
  );

}


/* =========================================================
   REDIRECT REVIEW
========================================================= */

function redirectToReview() {

  window.location.replace(
    `${BASE_URL}/account-review.html`
  );

}


/* =========================================================
   MONEY
========================================================= */

export function money(
  amount
) {

  return (
    "KSh " +
    Number(
      amount || 0
    ).toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }
    )
  );

}


/* =========================================================
   SET TEXT
========================================================= */

export function setText(
  selector,
  value
) {

  const element =
    document.querySelector(
      selector
    );


  if (element) {

    element.textContent =
      value ?? "—";

  }

}


/* =========================================================
   SHOW ERROR
========================================================= */

export function showError(
  error
) {

  console.error(
    "CHAMA LIVE:",
    error
  );


  let message =
    "Something went wrong.";


  if (
    typeof error === "string"
  ) {

    message =
      error;

  }

  else if (
    error?.message
  ) {

    message =
      error.message;

  }


  const element =
    document.querySelector(
      "[data-error]"
    ) ||
    document.querySelector(
      "#error"
    );


  if (element) {

    element.textContent =
      message;

    element.hidden =
      false;

  }


  return message;

}


/* =========================================================
   CLEAR ERROR
========================================================= */

export function clearError() {

  const element =
    document.querySelector(
      "[data-error]"
    ) ||
    document.querySelector(
      "#error"
    );


  if (element) {

    element.textContent =
      "";

    element.hidden =
      true;

  }

}


/* =========================================================
   COMPATIBILITY ALIASES
========================================================= */

export const getCurrentMember =
  getMyMember;


export const getCurrentGroup =
  getMyGroup;


export const getCurrentGroupId =
  getMyGroupId;


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: auth.js ready — canonical member/group resolution enabled"
);
