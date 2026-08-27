
import { supabase } from "./supabase.js";


/* =====================================================
   GET CURRENT USER
===================================================== */

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


/* =====================================================
   GET SESSION
===================================================== */

export async function getSession() {

  const {
    data,
    error
  } =
    await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data?.session || null;
}


/* =====================================================
   REQUIRE AUTH
===================================================== */

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


/* =====================================================
   SIGN IN
===================================================== */

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

      email:
        cleanEmail,

      password:
        password

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


/* =====================================================
   SIGN OUT
===================================================== */

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


/* =====================================================
   GET CURRENT MEMBER
===================================================== */

export async function getCurrentMember() {

  const user =
    await getCurrentUser();


  /*
   * Keep this query limited to columns that
   * are part of the current members table.
   */

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(`
        id,
        group_id,
        user_id,
        member_number,
        name,
        phone,
        email,
        role,
        join_date,
        status,
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


  if (error) {

    console.error(
      "CHAMA LIVE getCurrentMember error:",
      error
    );

    throw error;
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
      "Your member record has no group assigned."
    );

  }


  return member;
}


/* =====================================================
   ALIAS
===================================================== */

export async function getMyMember() {

  return await getCurrentMember();

}


/* =====================================================
   GET CURRENT GROUP ID
===================================================== */

export async function getCurrentGroupId() {

  const member =
    await getCurrentMember();

  return member.group_id;
}


/* =====================================================
   GET CURRENT GROUP
===================================================== */

export async function getCurrentGroup() {

  const groupId =
    await getCurrentGroupId();


  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select(`
        id,
        name,
        category,
        monthly_contribution,
        opening_balance,
        description,
        country,
        access_code
      `)
      .eq(
        "id",
        groupId
      )
      .limit(1);


  if (error) {

    console.error(
      "CHAMA LIVE getCurrentGroup error:",
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


/* =====================================================
   ALIAS
===================================================== */

export async function getMyGroup() {

  return await getCurrentGroup();

}


/* =====================================================
   GET MY GROUPS
===================================================== */

export async function getMyGroups() {

  const groupId =
    await getCurrentGroupId();


  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select(`
        id,
        name,
        category,
        monthly_contribution,
        opening_balance,
        description,
        country,
        access_code
      `)
      .eq(
        "id",
        groupId
      );


  if (error) {

    throw error;
  }


  return data || [];
}


/* =====================================================
   MONEY
===================================================== */

export function money(amount) {

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


/* =====================================================
   SET TEXT
===================================================== */

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


/* =====================================================
   SHOW ERROR
===================================================== */

export function showError(
  error
) {

  const message =
    error?.message ||
    String(error);


  console.error(
    "CHAMA LIVE:",
    error
  );


  const errorElement =
    document.querySelector(
      "[data-error]"
    ) ||
    document.querySelector(
      "#error"
    );


  if (errorElement) {

    errorElement.textContent =
      "Error: " + message;

    errorElement.hidden =
      false;

  }

}


/* =====================================================
   CLEAR ERROR
===================================================== */

export function clearError() {

  const errorElement =
    document.querySelector(
      "[data-error]"
    ) ||
    document.querySelector(
      "#error"
    );


  if (errorElement) {

    errorElement.textContent =
      "";

    errorElement.hidden =
      true;

  }

     }
