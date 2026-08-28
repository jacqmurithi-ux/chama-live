/* =========================================================
   CHAMA LIVE — AUTHENTICATION & CURRENT GROUP
   Schema-aligned version
========================================================= */

import { supabase } from "./supabase.js";


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
      email: cleanEmail,
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
    "CHAMA LIVE: sign in successful"
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


    if (
      currentPage !== "index.html" &&
      currentPage !== "login.html" &&
      currentPage !== ""
    ) {

      window.location.href =
        "index.html";

    }


    throw new Error(
      "You are not logged in."
    );

  }


  return session.user;

}


/* =========================================================
   GET MY MEMBER
========================================================= */

export async function getMyMember() {

  const user =
    await getCurrentUser();


  /*
   * Newer account linkage:
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


  if (error) {

    throw error;

  }


  /*
   * Compatibility fallback:
   * older accounts may still use user_id.
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


    data =
      fallback.data;


    error =
      fallback.error;


    if (error) {

      throw error;

    }

  }


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


  window.location.href =
    "index.html";

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


  const message =
    error?.message ||
    String(error) ||
    "Something went wrong.";


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
  "CHAMA LIVE: auth functions ready"
);
