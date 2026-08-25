import { supabase } from "./supabase.js";


/* =====================================================
   REQUIRE AUTHENTICATION
===================================================== */

export async function requireAuth() {

  const {
    data: {
      session
    },
    error
  } = await supabase.auth.getSession();


  if (error) {

    console.error(
      "Session error:",
      error
    );

    window.location.href =
      "login.html";

    return null;

  }


  if (!session) {

    window.location.href =
      "login.html";

    return null;

  }


  return session;

}


/* =====================================================
   GET CURRENT USER
===================================================== */

export async function getCurrentUser() {

  const {
    data: {
      user
    },
    error
  } = await supabase.auth.getUser();


  if (error) {

    console.error(
      "User error:",
      error
    );

    return null;

  }


  return user || null;

}


/* =====================================================
   GET MY MEMBER
===================================================== */

export async function getMyMember() {

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


  /*
   * Supabase RPC can return:
   *
   * [
   *   { ...member }
   * ]
   *
   * or a single object depending
   * on the function definition.
   */

  if (Array.isArray(data)) {

    return data.length
      ? data[0]
      : null;

  }


  return data || null;

}


/* =====================================================
   SIGN OUT
===================================================== */

export async function signOut() {

  const {
    error
  } = await supabase.auth.signOut();


  if (error) {

    console.error(
      "Sign out error:",
      error
    );

    throw error;

  }


  window.location.href =
    "login.html";

}


/* =====================================================
   AUTH INITIALISATION
===================================================== */

export async function initAuth() {

  const session =
    await requireAuth();


  if (!session) {

    return null;

  }


  return session;

}
