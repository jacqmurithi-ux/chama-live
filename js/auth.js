import { supabase } from "./supabase.js";


/* =========================================================
   SESSION
========================================================= */

export async function getSession() {

  const {
    data,
    error
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session || null;
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


  if (!data?.session) {

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
      "get_my_member:",
      error
    );

    throw new Error(
      "Unable to load member account: " +
      error.message
    );
  }


  console.log(
    "CHAMA LIVE MEMBER:",
    data
  );


  if (
    data === null ||
    data === undefined
  ) {
    return null;
  }


  if (Array.isArray(data)) {
    return data[0] || null;
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
      "get_my_group:",
      error
    );

    throw new Error(
      "Unable to load group: " +
      error.message
    );
  }


  console.log(
    "CHAMA LIVE GROUP:",
    data
  );


  if (
    data === null ||
    data === undefined
  ) {
    return null;
  }


  if (Array.isArray(data)) {
    return data[0] || null;
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
    throw error;
  }


  return data || null;
}
