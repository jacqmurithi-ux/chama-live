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
   GET CURRENT MEMBER
===================================================== */

export async function getCurrentMember() {

  const user =
    await getCurrentUser();


  const {
    data,
    error
  } = await supabase

    .from("members")

    .select(
      "id,name,user_id,group_id,role,status"
    )

    .eq(
      "user_id",
      user.id
    )

    .order(
      "id",
      {
        ascending: true
      }
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
  } = await supabase

    .from("groups")

    .select(
      "id,name,category,monthly_contribution,opening_balance,description,country,access_code"
    )

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

export function showError(error) {

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
