/* =========================================================
   CHAMA LIVE — AUTHENTICATION & CURRENT GROUP

   Group-scoped authentication.

   Architecture:
   ---------------------------------------------------------
   Supabase Auth user
          ↓
   members.auth_user_id
          ↓
   members.user_id fallback
          ↓
   members.group_id
          ↓
   groups.id

   NEVER accept group_id from:
   - URL
   - localStorage
   - form fields
   - query parameters
========================================================= */

import {
  supabase
} from "./supabase.js";


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
   REQUIRE AUTH
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


  /*
   * Protected pages also verify that the
   * account is approved/active.
   */

  const member =
    await getMemberByAuthUser(
      session.user.id
    );


  if (!member) {

    await supabase.auth.signOut();

    redirectToLogin();

    throw new Error(
      "No member record is linked to this account."
    );

  }


  if (!member.group_id) {

    await supabase.auth.signOut();

    redirectToLogin();

    throw new Error(
      "Your member record has no group."
    );

  }


  const onboardingStatus =
    String(
      member.onboarding_status ||
      ""
    )
      .trim()
      .toLowerCase();


  const memberStatus =
    String(
      member.status ||
      ""
    )
      .trim()
      .toLowerCase();


  /*
   * Pending accounts cannot enter
   * protected application pages.
   */

  if (
    onboardingStatus ===
      "pending" ||
    onboardingStatus ===
      "submitted" ||
    memberStatus ===
      "pending"
  ) {

    redirectToReview();

    throw new Error(
      "Your account is still under review."
    );

  }


  /*
   * Rejected accounts cannot enter.
   */

  if (
    onboardingStatus ===
      "rejected" ||
    memberStatus ===
      "rejected"
  ) {

    await supabase.auth.signOut();

    redirectToLogin();

    throw new Error(
      "Your account application was not approved."
    );

  }


  /*
   * Suspended/inactive accounts cannot enter.
   */

  if (
    memberStatus ===
      "suspended" ||
    memberStatus ===
      "inactive"
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
   MEMBER QUERY
========================================================= */

async function getMemberByAuthUser(
  userId
) {

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


  /*
   * Compatibility fallback.
   */

  if (
    (!data || data.length === 0) &&
    !error
  ) {

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
      throw fallback.error;
    }


    data =
      fallback.data;

  }


  if (error) {

    console.error(
      "CHAMA LIVE: member lookup failed",
      error
    );

    throw error;

  }


  if (
    !data ||
    data.length === 0
  ) {

    return null;

  }


  return data[0];

}


/* =========================================================
   GET MY MEMBER
========================================================= */

export async function getMyMember() {

  const user =
    await getCurrentUser();


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

  const member =
    await getMyMember();


  if (!member.group_id) {

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
    typeof error ===
    "string"
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


console.log(
  "CHAMA LIVE: auth.js ready"
);
