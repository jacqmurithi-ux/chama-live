/* =========================================================
   CHAMA LIVE — AUTHENTICATION & CURRENT GROUP
   CANONICAL GROUP-SCOPED AUTHENTICATION

   SECURITY MODEL
   ---------------------------------------------------------
   Supabase Auth user
          ↓
   public.get_my_member()
          ↓
   members.group_id
          ↓
   public.my_group_id()
          ↓
   groups.id

   NEVER accept group_id from:
   - URL
   - localStorage
   - form fields
   - query parameters
   - arbitrary JavaScript state

   The authenticated database functions determine identity
   and group membership.
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


export {
  PUBLIC_PAGES
};


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
   AUTHENTICATED MEMBER
========================================================= */

/*
 * IMPORTANT
 * ---------------------------------------------------------
 * Do not query members using a browser-supplied user id
 * as the authorization mechanism.
 *
 * get_my_member() derives the authenticated identity
 * inside PostgreSQL from auth.uid().
 */

async function getMemberByAuthUser() {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_my_member"
    );


  if (error) {

    console.error(
      "CHAMA LIVE: get_my_member RPC failed",
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
   * Resolve member through the authenticated
   * database function.
   */

  const member =
    await getMemberByAuthUser();


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


  /* -------------------------------------------------------
     PENDING
  ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     REJECTED
  ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     SUSPENDED / INACTIVE
  ------------------------------------------------------- */

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


  return session.user;

}


/* =========================================================
   GET MY MEMBER
========================================================= */

export async function getMyMember() {

  const member =
    await getMemberByAuthUser();


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

  const {
    data,
    error
  } =
    await supabase.rpc(
      "my_group_id"
    );


  if (error) {

    console.error(
      "CHAMA LIVE: my_group_id RPC failed",
      error
    );

    throw error;

  }


  if (!data) {

    throw new Error(
      "No group is associated with your member account."
    );

  }


  return data;

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

  const numericAmount =
    Number(
      amount || 0
    );


  return (
    "KSh " +
    (
      Number.isFinite(
        numericAmount
      )
        ? numericAmount
        : 0
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
