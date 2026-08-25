import { supabase } from "./supabase.js";


/* =====================================================
   GET CURRENT GROUP ID
===================================================== */

export async function getCurrentGroupId() {

  const {
    data: sessionData,
    error: sessionError
  } = await supabase.auth.getSession();


  if (sessionError) {
    throw sessionError;
  }


  if (!sessionData?.session) {
    throw new Error("You are not logged in.");
  }


  /*
   * Use the existing Supabase RPC.
   *
   * Database function:
   * my_group_id()
   *
   * It returns the group_id for auth.uid().
   */

  const {
    data,
    error
  } = await supabase.rpc(
    "my_group_id"
  );


  if (error) {
    throw error;
  }


  if (!data) {
    throw new Error(
      "No group is linked to your account."
    );
  }


  return data;
}


/* =====================================================
   MONEY
===================================================== */

export function money(amount) {

  return (
    "KSh " +
    Number(amount || 0).toLocaleString(
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
    document.querySelector(selector);


  if (element) {

    element.textContent =
      value ?? "—";

  }

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
