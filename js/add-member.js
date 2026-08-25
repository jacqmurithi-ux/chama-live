import { supabase } from "./supabase.js";
import {
  getMyMember,
  hasRole
} from "./auth.js";


/* =====================================================
   HELPERS
===================================================== */

const $ = (id) =>
  document.getElementById(id);


let currentMember = null;

let groupId = null;


/* =====================================================
   INIT
===================================================== */

async function init() {

  try {

    currentMember =
      await getMyMember(
        true
      );


    if (!currentMember) {

      throw new Error(
        "Unable to identify your account."
      );

    }


    /*
     * Only Admin and Chairperson
     * may add members.
     */

    if (
      !hasRole(
        currentMember,
        [
          "admin",
          "chairperson"
        ]
      )
    ) {

      window.location.replace(
        "dashboard.html"
      );

      return;

    }


    groupId =
      currentMember.group_id;


    /*
     * Default join date.
     */

    const joinDate =
      $("join_date");


    if (joinDate) {

      const today =
        new Date();


      joinDate.value =
        `${today.getFullYear()}-${String(
          today.getMonth() + 1
        ).padStart(2, "0")}-${String(
          today.getDate()
        ).padStart(2, "0")}`;

    }


    /*
     * Load group.
     */

    await loadGroup();


    /*
     * Form.
     */

    $("memberForm")
      .addEventListener(
        "submit",
        handleSubmit
      );


    /*
     * Membership number:
     * automatically trim spaces.
     */

    $("membership_number")
      .addEventListener(
        "blur",
        event => {

          event.target.value =
            event.target.value
              .trim();

        }
      );


  } catch (error) {

    showError(
      error
    );

  }

}


/* =====================================================
   LOAD GROUP
===================================================== */

async function loadGroup() {

  const {
    data,
    error
  } = await supabase

    .from("groups")

    .select(`
      id,
      name
    `)

    .eq(
      "id",
      groupId
    )

    .single();


  if (error) {

    throw error;

  }


  $("groupName")
    .textContent =
    data.name;

}


/* =====================================================
   SUBMIT
===================================================== */

async function handleSubmit(
  event
) {

  event.preventDefault();


  clearMessages();


  const button =
    $("saveMember");


  button.disabled =
    true;

  button.textContent =
    "Adding Member...";


  try {

    const name =
      $("name")
        .value
        .trim();


    const membershipNumber =
      $("membership_number")
        .value
        .trim();


    const phone =
      $("phone")
        .value
        .trim();


    const email =
      $("email")
        .value
        .trim()
        .toLowerCase();


    const role =
      $("role")
        .value;


    const joinDate =
      $("join_date")
        .value;


    /* =================================================
       VALIDATION
    ================================================= */

    if (!name) {

      throw new Error(
        "Please enter the member's full name."
      );

    }


    if (!membershipNumber) {

      throw new Error(
        "Please enter the membership number."
      );

    }


    if (!phone) {

      throw new Error(
        "Please enter the member's phone number."
      );

    }


    const allowedRoles = [
      "member",
      "secretary",
      "treasurer",
      "chairperson"
    ];


    if (
      !allowedRoles.includes(
        role
      )
    ) {

      throw new Error(
        "Invalid member role."
      );

    }


    /*
     * Admin/chairperson cannot create
     * another admin account from this form.
     *
     * The first group administrator is created
     * through group onboarding.
     */

    if (
      role === "admin"
    ) {

      throw new Error(
        "Admin accounts can only be created through group onboarding."
      );

    }


    /* =================================================
       CHECK DUPLICATE MEMBERSHIP NUMBER
    ================================================= */

    const {
      data: existingNumber,
      error: numberError
    } = await supabase

      .from("members")

      .select(
        "id,name"
      )

      .eq(
        "group_id",
        groupId
      )

      .eq(
        "membership_number",
        membershipNumber
      )

      .maybeSingle();


    if (numberError) {

      throw numberError;

    }


    if (existingNumber) {

      throw new Error(
        `Membership number ${membershipNumber} already exists for ${existingNumber.name}.`
      );

    }


    /* =================================================
       CHECK DUPLICATE MEMBER NUMBER
    ================================================= */

    const {
      data: existingMemberNumber,
      error: memberNumberError
    } = await supabase

      .from("members")

      .select(
        "id,name"
      )

      .eq(
        "group_id",
        groupId
      )

      .eq(
        "member_number",
        membershipNumber
      )

      .maybeSingle();


    if (memberNumberError) {

      throw memberNumberError;

    }


    /*
     * Keep the legacy member_number populated
     * because the existing reports use it.
     */

    if (
      existingMemberNumber
    ) {

      throw new Error(
        `Member number ${membershipNumber} already exists for ${existingMemberNumber.name}.`
      );

    }


    /* =================================================
       CHECK EMAIL
    ================================================= */

    if (email) {

      const {
        data: existingEmail,
        error: emailError
      } = await supabase

        .from("members")

        .select(
          "id,name"
        )

        .eq(
          "group_id",
          groupId
        )

        .ilike(
          "email",
          email
        )
        .maybeSingle();


      if (emailError) {

        throw emailError;

      }


      if (existingEmail) {

        throw new Error(
          `This email is already assigned to ${existingEmail.name}.`
        );

      }

    }


    /* =================================================
       CREATE MEMBER
    ================================================= */

    const {
      data: newMember,
      error: insertError
    } = await supabase

      .from("members")

      .insert({

        group_id:
          groupId,

        member_number:
          membershipNumber,

        membership_number:
          membershipNumber,

        name:
          name,

        phone:
          phone,

        email:
          email || null,

        role:
          role,

        join_date:
          joinDate || null,

        status:
          "active",

        onboarding_status:
          "pending"

      })

      .select(`
        id,
        group_id,
        member_number,
        membership_number,
        name,
        phone,
        email,
        role,
        join_date,
        status,
        onboarding_status,
        created_at
      `)

      .single();


    if (insertError) {

      throw insertError;

    }


    /* =================================================
       SUCCESS
    ================================================= */

    showSuccess(
      newMember
    );


    $("memberForm")
      .reset();


    /*
     * Restore today's date.
     */

    if (joinDate) {

      $("join_date")
        .value =
        joinDate;

    }


  } catch (error) {

    showError(
      error
    );

  } finally {

    button.disabled =
      false;

    button.textContent =
      "Add Member";

  }

}


/* =====================================================
   SUCCESS
===================================================== */

function showSuccess(
  member
) {

  const element =
    $("success");


  element.hidden =
    false;


  element.innerHTML = `

    <strong>
      Member added successfully.
    </strong>

    <p style="margin-bottom:0;">

      ${escapeHtml(
        member.name
      )}

      has been added as

      <strong>
        ${formatRole(
          member.role
        )}
      </strong>

      with membership number

      <strong>
        ${escapeHtml(
          member.membership_number
        )}
      </strong>.

      <br><br>

      Account status:

      <strong>
        PENDING
      </strong>

      <br>

      The member must activate their
      CHAMA LIVE account before they can
      log in.

    </p>

  `;

}


/* =====================================================
   ERROR
===================================================== */

function showError(
  error
) {

  console.error(
    error
  );


  const element =
    $("error");


  element.hidden =
    false;


  element.textContent =
    error?.message ||
    "Unable to add member.";


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* =====================================================
   CLEAR MESSAGES
===================================================== */

function clearMessages() {

  const error =
    $("error");

  const success =
    $("success");


  if (error) {

    error.hidden =
      true;

    error.textContent =
      "";

  }


  if (success) {

    success.hidden =
      true;

    success.innerHTML =
      "";

  }

}


/* =====================================================
   ROLE FORMAT
===================================================== */

function formatRole(
  role
) {

  return String(
    role || ""
  )
    .replaceAll(
      "_",
      " "
    )
    .replace(
      /\b\w/g,
      char =>
        char.toUpperCase()
    );

}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );

}


/* =====================================================
   START
===================================================== */

init();
