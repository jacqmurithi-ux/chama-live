import { supabase } from "./supabase.js";


/* =========================================================
   GET CURRENT SESSION
========================================================= */

export async function getSession() {

  const {
    data,
    error
  } = await supabase.auth.getSession();

  if (error) {
    console.error("getSession error:", error);
    throw error;
  }

  return data.session || null;
}


/* =========================================================
   REQUIRE AUTHENTICATION
========================================================= */

export async function requireAuth() {

  const session = await getSession();

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
      password: password
    });


  if (error) {

    console.error(
      "Supabase sign-in error:",
      error
    );

    throw error;
  }


  if (!data || !data.session) {

    throw new Error(
      "Login succeeded but no session was created."
    );
  }


  console.log(
    "CHAMA LIVE: Authentication successful."
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

    console.error(
      "Supabase sign-out error:",
      error
    );

    throw error;
  }


  window.location.replace(
    "./login.html"
  );
}


/* =========================================================
   GET MY MEMBER
========================================================= */

export async function getMyMember() {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_my_member"
    );


  if (error) {

    console.error(
      "get_my_member error:",
      error
    );

    throw new Error(
      "Unable to load your member account: " +
      error.message
    );
  }


  console.log(
    "CHAMA LIVE get_my_member:",
    data
  );


  if (
    data === null ||
    data === undefined
  ) {

    return null;
  }


  /*
   * RPC may return either:
   *
   * { ... }
   *
   * or
   *
   * [{ ... }]
   */

  if (Array.isArray(data)) {

    return data.length > 0
      ? data[0]
      : null;
  }


  return data;
}


/* =========================================================
   GET MY GROUP
========================================================= */

export async function getMyGroup() {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_my_group"
    );


  if (error) {

    console.error(
      "get_my_group error:",
      error
    );

    throw new Error(
      "Unable to load your group: " +
      error.message
    );
  }


  console.log(
    "CHAMA LIVE get_my_group:",
    data
  );


  if (
    data === null ||
    data === undefined
  ) {

    return null;
  }


  /*
   * RPC may return:
   *
   * { ... }
   *
   * or
   *
   * [{ ... }]
   */

  if (Array.isArray(data)) {

    return data.length > 0
      ? data[0]
      : null;
  }


  return data;
}


/* =========================================================
   GET MY GROUPS
========================================================= */

export async function getMyGroups() {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_my_groups"
    );


  if (error) {

    console.error(
      "get_my_groups error:",
      error
    );

    throw error;
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

    console.error(
      "my_group_id error:",
      error
    );

    throw error;
  }


  return data || null;
}


/* =========================================================
   AUTH STATE CHANGE
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
          "CHAMA LIVE auth event:",
          event
        );

        if (
          typeof callback === "function"
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
