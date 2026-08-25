import { supabase } from "./supabase.js";


/* =====================================================
   GET CURRENT GROUP
===================================================== */

export async function getCurrentGroupId() {

  const {
    data: {
      user
    },
    error: userError
  } = await supabase.auth.getUser();


  if (userError) {
    throw userError;
  }


  if (!user) {
    throw new Error("You are not logged in.");
  }


  /*
   * Get the member record belonging
   * to the logged-in user.
   */

  const {
    data: member,
    error: memberError
  } = await supabase
    .from("members")
    .select("group_id")
    .eq("user_id", user.id)
    .maybeSingle();


  if (memberError) {
    throw memberError;
  }


  if (!member) {
    throw new Error(
      "No member record is linked to this account."
    );
  }


  if (!member.group_id) {
    throw new Error(
      "Your member record has no group."
    );
  }


  return member.group_id;

}


/* =====================================================
   MONEY
===================================================== */

export function money(value) {

  const amount =
    Number(value || 0);


  return (
    "KSh " +
    amount.toLocaleString(
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


  if (!element) {
    throw new Error(
      "Element not found: " +
      selector
    );
  }


  element.textContent =
    value ?? "—";

}


/* =====================================================
   SHOW ERROR
===================================================== */

export function showError(error) {

  console.error(
    "CHAMA LIVE:",
    error
  );


  const message =
    error?.message ||
    String(error);


  /*
   * Try the standard error container.
   */

  const errorElement =
    document.querySelector(
      "[data-error]"
    );


  if (errorElement) {

    errorElement.textContent =
      "Error: " + message;

    errorElement.hidden =
      false;

  }


  /*
   * Also support #error.
   */

  const errorBox =
    document.querySelector(
      "#error"
    );


  if (
    errorBox &&
    errorBox !== errorElement
  ) {

    errorBox.textContent =
      "Error: " + message;

    errorBox.hidden =
      false;

  }

}


/* =====================================================
   CLEAR ERROR
===================================================== */

export function clearError() {

  const elements =
    document.querySelectorAll(
      "[data-error], #error"
    );


  elements.forEach(
    function (element) {

      element.textContent =
        "";

      element.hidden =
        true;

    }
  );

}
