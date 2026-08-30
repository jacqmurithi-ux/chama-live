/* =========================================================
   CHAMA LIVE — AUTHENTICATION & CURRENT GROUP
   Complete fixed version

   File:
   /js/auth.js

   Handles:
   - Supabase authentication
   - Sign in
   - Current user
   - Current member
   - Current group
   - Group ID
   - Sign out
   - Money formatting
   - Error helpers
   - Compatibility with auth_user_id / user_id
========================================================= */

import { supabase } from "./supabase.js";


/* =========================================================
   EXPORT SUPABASE
========================================================= */

export { supabase };


/* =========================================================
   BASE URL
========================================================= */

export const BASE_URL =
  "https://jacqmurithi-ux.github.io/chama-live";


/* =========================================================
   LOG
========================================================= */

console.log(
  "CHAMA LIVE: auth.js loaded"
);


/* =========================================================
   SIGN IN
========================================================= */

export async function signIn(
  email,
  password
) {

  const cleanEmail =
    String(email || "")
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


  console.log(
    "CHAMA LIVE: sign in successful",
    data.user.id
  );


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

    const currentPage =
      window.location.pathname
        .split("/")
        .pop()
        .toLowerCase();


    /*
     * Public pages.
     */

    const publicPages = [

      "",
      "index.html",
      "login.html",
      "forgot-password.html",
      "activate-account.html",
      "reset-password.html"

    ];


    if (
      !publicPages.includes(
        currentPage
      )
    ) {

      window.location.replace(
        `${BASE_URL}/login.html`
      );

    }


    throw new Error(
      "You are not logged in."
    );

  }


  console.log(
    "CHAMA LIVE: authentication verified",
    session.user.id
  );


  return session.user;

}


/* =========================================================
   GET MY MEMBER
========================================================= */

export async function getMyMember() {

  const user =
    await getCurrentUser();


  /*
   * First try the current linkage:
   *
   * auth_user_id
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
        user.id
      )
      .order(
        "created_at",
        {
          ascending: true
        }
      )
      .limit(1);


  /*
   * If the column/query fails,
   * report the actual database error.
   */

  if (error) {

    console.error(
      "CHAMA LIVE: auth_user_id lookup failed",
      error
    );

    /*
     * Continue to compatibility fallback.
     */

  }


  /*
   * Older records may use user_id.
   */

  if (
    !data ||
    data.length === 0
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
          user.id
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
        "CHAMA LIVE: user_id lookup failed",
        fallback.error
      );

      throw fallback.error;

    }


    data =
      fallback.data;

  }


  /*
   * No member found.
   */

  if (
    !data ||
    data.length === 0
  ) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  const member =
    data[0];


  /*
   * Every member must belong to a group.
   */

  if (!member.group_id) {

    throw new Error(
      "Your member record has no group."
    );

  }


  console.log(
    "CHAMA LIVE: member found",
    {
      id:
        member.id,

      group_id:
        member.group_id,

      name:
        member.name,

      membership_number:
        member.membership_number ||
        member.member_number
    }
  );


  return member;

}


/* =========================================================
   GET MY GROUP ID
========================================================= */

export async function getMyGroupId() {

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


  console.log(
    "CHAMA LIVE: group found",
    {
      id:
        data[0].id,

      name:
        data[0].name
    }
  );


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


  window.location.replace(
    `${BASE_URL}/login.html`
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


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: auth functions ready"
);
