import { supabase } from "./supabase.js";


/* =========================================================
   CHAMA LIVE — AUTH
========================================================= */


/* =========================================================
   GET CURRENT USER
========================================================= */

export async function getCurrentUser() {

  const {
    data,
    error
  } = await supabase.auth.getUser();


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
   GET SESSION
========================================================= */

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


/* =========================================================
   REQUIRE AUTH
========================================================= */

export async function requireAuth() {

  const session =
    await getSession();


  if (!session) {

    window.location.replace(
      "./login.html"
    );

    return null;
  }


  return session;
}


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
      "Enter your email address."
    );

  }


  if (!password) {

    throw new Error(
      "Enter your password."
    );

  }


  const {
    data,
    error
  } =
    await supabase.auth.signInWithPassword({

      email: cleanEmail,

      password: password

    });


  if (error) {

    console.error(
      "Supabase sign-in error:",
      error
    );

    throw error;
  }


  if (
    !data?.user ||
    !data?.session
  ) {

    throw new Error(
      "Login succeeded but no active session was created."
    );

  }


  return data;
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
    "./login.html"
  );
}


/* =========================================================
   GET CURRENT MEMBER
========================================================= */

export async function getCurrentMember() {

  const user =
    await getCurrentUser();


  /*
   * NEW AUTH SYSTEM
   *
   * auth_user_id is the primary link
   * between members and Supabase Auth.
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

    console.error(
      "Primary member lookup error:",
      error
    );

    throw error;
  }


  /*
   * LEGACY FALLBACK
   *
   * Some existing members may still
   * have their Auth UUID stored in
   * user_id instead of auth_user_id.
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
        "Legacy member lookup error:",
        fallback.error
      );

      throw fallback.error;
    }


    data =
      fallback.data || [];

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
