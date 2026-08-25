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

  if (!sessionData?.session?.user) {
    throw new Error("You are not logged in.");
  }

  const userId =
    sessionData.session.user.id;


  /* -----------------------------------------------
     Find the member belonging to this login
  ------------------------------------------------ */

  const {
    data: members,
    error: memberError
  } = await supabase
    .from("members")
    .select("id, group_id, name")
    .eq("user_id", userId)
    .limit(1);

  if (memberError) {
    throw memberError;
  }


  if (!members || members.length === 0) {
    throw new Error(
      "Your account is not linked to a member. Add your user ID to the member record."
    );
  }


  const member =
    members[0];


  if (!member.group_id) {
    throw new Error(
      "Your member record has no group linked to it."
    );
  }


  return member.group_id;
}


/* =====================================================
   MONEY
===================================================== */

export function money(amount) {

  return (
    "KSh " +
    Number(amount || 0)
      .toLocaleString("en-KE", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      })
  );

}


/* =====================================================
   SET TEXT
===================================================== */

export function setText(selector, value) {

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
