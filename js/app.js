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

  const user =
    sessionData?.session?.user;

  if (!user) {
    throw new Error(
      "You are not logged in."
    );
  }


  const {
    data,
    error
  } = await supabase
    .from("members")
    .select("group_id")
    .eq("user_id", user.id)
    .limit(1);


  if (error) {
    throw error;
  }


  if (!data || data.length === 0) {
    throw new Error(
      "No group is linked to this account."
    );
  }


  if (!data[0].group_id) {
    throw new Error(
      "Your member record has no group."
    );
  }


  return data[0].group_id;
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
