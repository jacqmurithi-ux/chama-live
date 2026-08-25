import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";


const $ = (id) =>
  document.getElementById(id);


let currentMember = null;
let groupId = null;


/* =====================================================
   INIT
===================================================== */

async function init() {

  try {

    setStatus("Checking your permissions...");

    const member =
      await getMyMember();

    if (!member) {
      throw new Error(
        "You must be logged in."
      );
    }

    currentMember =
      member;

    groupId =
      member.group_id;

    if (!groupId) {
      throw new Error(
        "Your account is not linked to a group."
      );
    }


    /*
      Support both existing account-linking
      fields used by CHAMA LIVE.
    */

    const role =
      String(
        member.role || ""
      )
        .trim()
        .toLowerCase();


    if (
      role !== "admin" &&
      role !== "chairperson"
    ) {

      showError(
        "Access denied. Only a group admin or chairperson can add members."
      );

      setStatus(
        "You do not have permission to add members."
      );

      return;

    }


    /*
      Default join date
    */

    const today =
      new Date();

    const todayString =
      `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}-${String(
        today.getDate()
      ).padStart(2, "0")}`;


    $("joinDate").value =
      todayString;


    $("memberFormCard").hidden =
      false;


    setStatus(
      "You can add members to this group."
    );


  } catch (error) {

    showError(error);

    setStatus(
      "Unable to load member onboarding."
    );

  }

}


/* =====================================================
   SUBMIT
===================================================== */

async function submitMember(event) {

  event.preventDefault();

  clearError();


  if (!groupId) {

    showError(
      "Your group could not be identified."
    );

    return;

  }


  const button =
    $("saveMember");


  const name =
    $("name").value.trim();

  const memberNumber =
    $("memberNumber").value.trim();

  const membershipNumber =
    $("membershipNumber").value.trim();

  const phone =
    $("phone").value.trim();

  const email =
    $("email").value.trim();

  const joinDate =
    $("joinDate").value;

  const role =
    $("role").value;


  /* =================================================
     VALIDATION
  ================================================= */

  if (!name) {

    showError(
      "Please enter the member's full name."
    );

    $("name").focus();

    return;

  }


  if (!memberNumber) {

    showError(
      "Please enter the member number."
    );

    $("memberNumber").focus();

    return;

  }


  if (!membershipNumber) {

    showError(
      "Please enter the membership number."
    );

    $("membershipNumber").focus();

    return;

  }


  if (!phone) {

    showError(
      "Please enter the member's phone number."
    );

    $("phone").focus();

    return;

  }


  if (!joinDate) {

    showError(
      "Please select the join date."
    );

    $("joinDate").focus();

    return;

  }


  const validRoles = [
    "member",
    "secretary",
    "treasurer",
    "chairperson"
  ];


  if (!validRoles.includes(role)) {

    showError(
      "Invalid member role."
    );

    return;

  }


  button.disabled =
    true;

  button.textContent =
    "Adding Member...";


  try {

    /*
      The database RPC performs the
      actual RBAC verification.

      This is important because frontend
      permission checks alone are not secure.
    */

    const {
      data,
      error
    } =
      await supabase.rpc(
        "add_group_member",
        {
          p_group_id:
            groupId,

          p_name:
            name,

          p_member_number:
            memberNumber,

          p_membership_number:
            membershipNumber,

          p_phone:
            phone,

          p_email:
            email || null,

          p_role:
            role,

          p_join_date:
            joinDate
        }
      );


    if (error) {
      throw error;
    }


    if (!data) {

      throw new Error(
        "Member was not created."
      );

    }


    /*
      Successful onboarding
    */

    $("memberFormCard").hidden =
      true;

    $("successCard").hidden =
      false;

    setStatus(
      `${name} was added successfully.`
    );


    /*
      Reset form for Add Another
    */

    $("memberForm").reset();

    const today =
      new Date();

    $("joinDate").value =
      `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}-${String(
        today.getDate()
      ).padStart(2, "0")}`;


  } catch (error) {

    console.error(
      "Add member error:",
      error
    );


    let message =
      error?.message ||
      "Unable to add member.";


    /*
      Make database errors
      easier for the user to understand.
    */

    if (
      message.includes(
        "already exists"
      )
    ) {

      message =
        "That member number or membership number already exists in this group.";

    }


    if (
      message.includes(
        "Only a group admin"
      )
    ) {

      message =
        "Only a group admin or chairperson can add members.";

    }


    showError(message);


  } finally {

    button.disabled =
      false;

    button.textContent =
      "Add Member";

  }

}


/* =====================================================
   ADD ANOTHER
===================================================== */

function addAnother() {

  $("successCard").hidden =
    true;

  $("memberFormCard").hidden =
    false;

  $("memberForm").reset();


  const today =
    new Date();

  $("joinDate").value =
    `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;


  $("name").focus();

}


/* =====================================================
   STATUS
===================================================== */

function setStatus(message) {

  const element =
    $("status");

  if (element) {

    element.textContent =
      message;

  }

}


/* =====================================================
   ERROR
===================================================== */

function clearError() {

  const element =
    $("error");

  if (!element) {
    return;
  }

  element.hidden =
    true;

  element.textContent =
    "";

}


function showError(error) {

  console.error(
    error
  );


  const message =
    typeof error === "string"
      ? error
      : error?.message ||
        "Something went wrong.";


  const element =
    $("error");


  if (element) {

    element.hidden =
      false;

    element.textContent =
      message;

  }

}


/* =====================================================
   EVENTS
===================================================== */

$("memberForm")
  .addEventListener(
    "submit",
    submitMember
  );


$("addAnother")
  .addEventListener(
    "click",
    addAnother
  );


/* =====================================================
   START
===================================================== */

init();
