```javascript
/* =========================================================
   CHAMA LIVE — AUTHENTICATION
   File: /js/auth.js
========================================================= */

import { supabase } from "./supabase.js";


/* =========================================================
   ERROR HELPER
========================================================= */

function makeError(error, fallback) {

  console.error(
    "CHAMA LIVE AUTH ERROR:",
    error
  );

  if (error instanceof Error) {
    return error;
  }

  return new Error(
    error?.message ||
    error?.error_description ||
    fallback
  );
}


/* =========================================================
   GET CURRENT SESSION
========================================================= */

export async function getSession() {

  const {
    data,
    error
  } =
    await supabase.auth.getSession();

  if (error) {

    throw makeError(
      error,
      "Unable to check your login session."
    );
  }

  return data?.session || null;
}


/* =========================================================
   GET CURRENT USER
========================================================= */

export async function getUser() {

  const {
    data,
    error
  } =
    await supabase.auth.getUser();

  if (error) {

    throw makeError(
      error,
      "Unable to identify the logged-in user."
    );
  }

  return data?.user || null;
}


/* =========================================================
   REQUIRE AUTHENTICATION
========================================================= */

export async function requireAuth() {

  const session =
    await getSession();

  if (!session) {

    console.warn(
      "CHAMA LIVE: No authenticated session."
    );

    const page =
      window.location.pathname
        .split("/")
        .pop()
        .toLowerCase();

    /*
     * Never redirect login.html to itself.
     */

    if (page !== "login.html") {

      window.location.replace(
        "login.html"
      );
    }

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

  const cleanPassword =
    String(password || "");


  if (!cleanEmail) {

    throw new Error(
      "Please enter your email address."
    );
  }


  if (!cleanPassword) {

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

      password:
        cleanPassword
    });


  if (error) {

    throw makeError(
      error,
      "Unable to sign in."
    );
  }


  if (!data?.session) {

    throw new Error(
      "Login succeeded, but no active session was created."
    );
  }


  console.log(
    "CHAMA LIVE: Login successful."
  );


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

    throw makeError(
      error,
      "Unable to sign out."
    );
  }


  console.log(
    "CHAMA LIVE: Signed out."
  );


  window.location.replace(
    "login.html"
  );
}


/* =========================================================
   GET MY MEMBER
========================================================= */

export async function getMyMember() {

  /*
   * This matches the actual RPC in your
   * Supabase database:
   *
   * public.get_my_member()
   *
   * It returns a members row.
   */

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_my_member"
    );


  if (error) {

    throw makeError(
      error,
      "Unable to load your member record."
    );
  }


  /*
   * The RPC returns one members row,
   * not an array.
   */

  if (
    !data ||
    (
      Array.isArray(data) &&
      data.length === 0
    )
  ) {

    return null;
  }


  /*
   * Protect against a PostgREST response
   * being returned as a one-item array.
   */

  if (Array.isArray(data)) {

    return data[0] || null;
  }


  return data;
}


/* =========================================================
   GET MY GROUP
========================================================= */

export async function getMyGroup() {

  /*
   * This matches the actual RPC in your
   * Supabase database:
   *
   * public.get_my_group()
   *
   * It returns a groups row.
   */

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_my_group"
    );


  if (error) {

    throw makeError(
      error,
      "Unable to load your group."
    );
  }


  if (
    !data ||
    (
      Array.isArray(data) &&
      data.length === 0
    )
  ) {

    return null;
  }


  if (Array.isArray(data)) {

    return data[0] || null;
  }


  return data;
}


/* =========================================================
   GET ALL MY GROUPS
========================================================= */

export async function getMyGroups() {

  /*
   * Matches:
   *
   * public.get_my_groups()
   *
   * Returns:
   *
   * group_id
   * group_name
   * role
   * category
   * monthly_contribution
   */

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_my_groups"
    );


  if (error) {

    throw makeError(
      error,
      "Unable to load your groups."
    );
  }


  return data || [];
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

    throw makeError(
      error,
      "Unable to determine your group."
    );
  }


  return data || null;
}


/* =========================================================
   AUTH STATE LISTENER
========================================================= */

export function onAuthStateChange(
  callback
) {

  const {
    data
  } =
    supabase.auth.onAuthStateChange(
      (event, session) => {

        console.log(
          "CHAMA LIVE AUTH EVENT:",
          event
        );


        if (
          typeof callback ===
          "function"
        ) {

          callback(
            event,
            session
          );
        }
      }
    );


  return data?.subscription || null;
}
```
