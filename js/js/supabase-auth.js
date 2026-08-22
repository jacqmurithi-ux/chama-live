"use strict";

/*
 * ============================================================
 * CHAMA LIVE
 * SUPABASE AUTHENTICATION
 * PART 1 OF 3
 * ============================================================
 *
 * DEPENDS ON:
 *
 * js/supabase-client.js
 *
 * That file MUST load before this file.
 *
 * This file provides:
 *
 * getCurrentSession()
 * getCurrentUser()
 * getCurrentUserId()
 * requireSession()
 * getCurrentGroupId()
 * signOutUser()
 * watchAuthState()
 *
 * ============================================================
 */


/* ============================================================
   GET SUPABASE CLIENT
   ============================================================ */

function authClient() {

  /*
   * The client must come from
   * supabase-client.js.
   */

  if (
    typeof window.getSupabaseClient !== "function"
  ) {

    throw new Error(
      "Supabase client helper is missing. Make sure js/supabase-client.js loads first."
    );

  }


  const client =
    window.getSupabaseClient();


  /*
   * Verify the client exists.
   */

  if (!client) {

    throw new Error(
      "Supabase client is not initialized."
    );

  }


  /*
   * Verify authentication exists.
   */

  if (!client.auth) {

    throw new Error(
      "Supabase Auth is unavailable."
    );

  }


  return client;

}


/* ============================================================
   GET CURRENT SESSION
   ============================================================ */

async function getCurrentSession() {

  const client =
    authClient();


  try {

    const result =
      await client.auth.getSession();


    /*
     * Supabase returned an error.
     */

    if (
      result.error
    ) {

      console.error(
        "Supabase getSession error:",
        result.error
      );


      throw result.error;

    }


    /*
     * Return session or null.
     */

    return (
      result.data &&
      result.data.session
    )
      ? result.data.session
      : null;


  } catch (error) {

    console.error(
      "GET SESSION ERROR:",
      error
    );


    throw new Error(
      error.message ||
      "Could not determine the current login session."
    );

  }

}


/* ============================================================
   GET CURRENT USER
   ============================================================ */

async function getCurrentUser() {

  const session =
    await getCurrentSession();


  /*
   * No logged-in user.
   */

  if (
    !session ||
    !session.user
  ) {

    return null;

  }


  return session.user;

}


/* ============================================================
   GET CURRENT USER ID
   ============================================================ */

async function getCurrentUserId() {

  const user =
    await getCurrentUser();


  if (!user) {

    return null;

  }


  return user.id;

}


/* ============================================================
   REQUIRE SESSION
   ============================================================ */

async function requireSession() {

  const session =
    await getCurrentSession();


  /*
   * User is not logged in.
   */

  if (
    !session ||
    !session.user
  ) {

    console.warn(
      "Chama Live: No authenticated session."
    );


    /*
     * Avoid redirecting if already
     * on the login page.
     */

    const currentPage =
      window.location.pathname
        .split("/")
        .pop()
        .toLowerCase();


    if (
      currentPage !== "login.html" &&
      currentPage !== "login"
    ) {

      window.location.href =
        "login.html";

    }


    return null;

  }


  /*
   * Return authenticated user.
   */

  return session.user;

}


/* ============================================================
   GET USER METADATA GROUP ID
   ============================================================ */

function getMetadataGroupId(
  user
) {

  if (
    !user
  ) {

    return null;

  }


  const metadata =
    user.user_metadata || {};


  return (
    metadata.group_id ||
    metadata.groupId ||
    metadata.chama_id ||
    metadata.chamaId ||
    null
  );

}


/* ============================================================
   EXPORT PART 1 FUNCTIONS
   ============================================================ */

window.authClient =
  authClient;


window.getCurrentSession =
  getCurrentSession;


window.getCurrentUser =
  getCurrentUser;


window.getCurrentUserId =
  getCurrentUserId;


window.requireSession =
  requireSession;


window.getMetadataGroupId =
  getMetadataGroupId;
/* ============================================================
   GET CURRENT GROUP ID
   PART 2 OF 3
   ============================================================ */

/*
 * Chama Live needs to know which group the
 * authenticated user belongs to.
 *
 * We first check auth metadata.
 *
 * If group_id is not available there, we check
 * the members table.
 */

async function getCurrentGroupId() {

  const client =
    authClient();


  const user =
    await getCurrentUser();


  /*
   * User must be authenticated.
   */

  if (!user) {

    throw new Error(
      "You are not signed in."
    );

  }


  /* ==========================================================
     STEP 1 — CHECK USER METADATA
     ========================================================== */

  const metadataGroupId =
    getMetadataGroupId(
      user
    );


  if (
    metadataGroupId
  ) {

    return metadataGroupId;

  }


  /* ==========================================================
     STEP 2 — CHECK MEMBERS TABLE
     ========================================================== */

  try {

    const result =
      await client
        .from("members")
        .select("group_id")
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();


    /*
     * If a group was found,
     * return it immediately.
     */

    if (
      !result.error &&
      result.data &&
      result.data.group_id
    ) {

      return result.data.group_id;

    }

  } catch (error) {

    console.warn(
      "members.user_id group lookup failed:",
      error
    );

  }


  /* ==========================================================
     STEP 3 — CHECK auth_user_id
     ========================================================== */

  try {

    const result =
      await client
        .from("members")
        .select("group_id")
        .eq(
          "auth_user_id",
          user.id
        )
        .maybeSingle();


    /*
     * If a group was found,
     * return it.
     */

    if (
      !result.error &&
      result.data &&
      result.data.group_id
    ) {

      return result.data.group_id;

    }

  } catch (error) {

    console.warn(
      "members.auth_user_id group lookup failed:",
      error
    );

  }


  /* ==========================================================
     STEP 4 — CHECK profiles TABLE
     ========================================================== */

  try {

    const result =
      await client
        .from("profiles")
        .select("group_id")
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();


    if (
      !result.error &&
      result.data &&
      result.data.group_id
    ) {

      return result.data.group_id;

    }

  } catch (error) {

    console.warn(
      "profiles group lookup failed:",
      error
    );

  }


  /* ==========================================================
     NO GROUP FOUND
     ========================================================== */

  throw new Error(
    "Your account is not linked to a Chama group. Please contact the group administrator."
  );

}


/* ============================================================
   CHECK WHETHER USER IS AUTHENTICATED
   ============================================================ */

async function isAuthenticated() {

  try {

    const session =
      await getCurrentSession();


    return !!(
      session &&
      session.user
    );

  } catch (error) {

    console.error(
      "Authentication check failed:",
      error
    );


    return false;

  }

}


/* ============================================================
   GET AUTHENTICATED USER EMAIL
   ============================================================ */

async function getCurrentUserEmail() {

  const user =
    await getCurrentUser();


  if (!user) {

    return null;

  }


  return (
    user.email ||
    null
  );

}


/* ============================================================
   SIGN OUT USER
   ============================================================ */

async function signOutUser() {

  const client =
    authClient();


  try {

    const result =
      await client.auth.signOut();


    if (
      result.error
    ) {

      console.error(
        "Supabase sign out error:",
        result.error
      );


      throw result.error;

    }


    /*
     * Send user back to login.
     */

    window.location.href =
      "login.html";


  } catch (error) {

    console.error(
      "SIGN OUT ERROR:",
      error
    );


    throw new Error(
      error.message ||
      "Could not sign out."
    );

  }

}


/* ============================================================
   AUTH STATE LISTENER
   ============================================================ */

function watchAuthState(
  callback
) {

  const client =
    authClient();


  if (
    typeof callback !== "function"
  ) {

    throw new Error(
      "watchAuthState requires a callback function."
    );

  }


  /*
   * Supabase sends events such as:
   *
   * SIGNED_IN
   * SIGNED_OUT
   * TOKEN_REFRESHED
   * USER_UPDATED
   */

  return client.auth.onAuthStateChange(
    function (
      event,
      session
    ) {

      try {

        callback(
          event,
          session
        );

      } catch (error) {

        console.error(
          "Auth state callback error:",
          error
        );

      }

    }
  );

}


/* ============================================================
   EXPOSE PART 2 FUNCTIONS
   ============================================================ */

window.getCurrentGroupId =
  getCurrentGroupId;


window.isAuthenticated =
  isAuthenticated;


window.getCurrentUserEmail =
  getCurrentUserEmail;


window.signOutUser =
  signOutUser;


window.watchAuthState =
  watchAuthState;
/* ============================================================
   CHAMA LIVE — AUTHENTICATION FINALIZATION
   PART 3 OF 3
   ============================================================ */


/* ============================================================
   GET AUTH USER SAFELY
   ============================================================ */

async function getAuthenticatedUser() {

  try {

    const user =
      await getCurrentUser();


    if (!user) {

      return null;

    }


    return user;

  } catch (error) {

    console.error(
      "GET AUTHENTICATED USER ERROR:",
      error
    );


    return null;

  }

}


/* ============================================================
   GET AUTH SESSION SAFELY
   ============================================================ */

async function getAuthenticatedSession() {

  try {

    const session =
      await getCurrentSession();


    if (!session) {

      return null;

    }


    return session;

  } catch (error) {

    console.error(
      "GET AUTHENTICATED SESSION ERROR:",
      error
    );


    return null;

  }

}


/* ============================================================
   REQUIRE AUTHENTICATED USER
   ============================================================ */

async function requireAuthenticatedUser() {

  const user =
    await requireSession();


  if (!user) {

    return null;

  }


  return user;

}


/* ============================================================
   GET USER DISPLAY NAME
   ============================================================ */

async function getCurrentUserDisplayName() {

  const user =
    await getCurrentUser();


  if (!user) {

    return "";

  }


  const metadata =
    user.user_metadata || {};


  return (
    metadata.full_name ||
    metadata.name ||
    metadata.display_name ||
    user.email ||
    "User"
  );

}


/* ============================================================
   AUTH DIAGNOSTIC
   ============================================================ */

function diagnoseAuthentication() {

  const result = {

    clientAvailable:false,

    authAvailable:false,

    getSessionAvailable:false,

    currentUser:null,

    error:null

  };


  try {

    /*
     * Check shared Supabase client.
     */

    const client =
      authClient();


    result.clientAvailable =
      !!client;


    result.authAvailable =
      !!(
        client &&
        client.auth
      );


    result.getSessionAvailable =
      !!(
        client &&
        client.auth &&
        typeof client.auth.getSession === "function"
      );


    console.log(
      "Chama Live authentication diagnostic:",
      result
    );


  } catch (error) {

    result.error =
      error.message ||
      String(error);


    console.error(
      "Chama Live authentication diagnostic failed:",
      error
    );

  }


  return result;

}


/* ============================================================
   EXPOSE FINAL FUNCTIONS
   ============================================================ */

window.getAuthenticatedUser =
  getAuthenticatedUser;


window.getAuthenticatedSession =
  getAuthenticatedSession;


window.requireAuthenticatedUser =
  requireAuthenticatedUser;


window.getCurrentUserDisplayName =
  getCurrentUserDisplayName;


window.diagnoseAuthentication =
  diagnoseAuthentication;


/* ============================================================
   STARTUP CHECK
   ============================================================ */

(function initializeAuthenticationModule() {

  try {

    /*
     * Check that the shared Supabase client
     * is available.
     */

    if (
      typeof window.getSupabaseClient !== "function"
    ) {

      console.error(
        "Chama Live AUTH ERROR: getSupabaseClient() is missing."
      );

      return;

    }


    const client =
      window.getSupabaseClient();


    /*
     * This is the important check for the
     * previous error:
     *
     * supabase.auth is undefined
     */

    if (
      !client ||
      !client.auth
    ) {

      console.error(
        "Chama Live AUTH ERROR: Supabase Auth is unavailable."
      );

      return;

    }


    if (
      typeof client.auth.getSession !== "function"
    ) {

      console.error(
        "Chama Live AUTH ERROR: supabase.auth.getSession() is unavailable."
      );

      return;

    }


    console.log(
      "Chama Live: supabase-auth.js loaded successfully."
    );


  } catch (error) {

    console.error(
      "Chama Live AUTH INITIALIZATION ERROR:",
      error
    );

  }

})();


/* ============================================================
   FINAL FILE CHECK
   ============================================================ */

console.log(
  "Chama Live: Authentication functions ready."
);


/*
 * ============================================================
 * END OF supabase-auth.js
 * ============================================================
 */
