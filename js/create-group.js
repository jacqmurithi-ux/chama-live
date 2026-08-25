```javascript
import { supabase } from "./supabase.js";


/* =====================================================
   CHAMA LIVE
   CREATE GROUP + FIRST ADMIN
===================================================== */


/* =====================================================
   HELPERS
===================================================== */

const $ = (id) => document.getElementById(id);


let createdGroupId = null;


/* =====================================================
   INIT
===================================================== */

document.addEventListener(
  "DOMContentLoaded",
  init
);


async function init() {

  const form =
    $("createGroupForm");

  if (!form) {
    console.error(
      "createGroupForm not found."
    );

    return;
  }


  /*
   * If someone is already logged in,
   * don't allow them to create another
   * group accidentally from this page.
   */

  try {

    const {
      data
    } =
      await supabase.auth.getSession();


    if (
      data?.session?.user
    ) {

      showError(
        "You are already signed in. Sign out before creating a new group."
      );

      $("createGroupButton").disabled =
        true;

      return;

    }

  } catch (error) {

    console.warn(
      "Could not check existing session:",
      error
    );

  }


  form.addEventListener(
    "submit",
    handleSubmit
  );


  const password =
    $("password");

  const confirmPassword =
    $("confirmPassword");


  if (
    password &&
    confirmPassword
  ) {

    confirmPassword.addEventListener(
      "input",
      () => {

        if (
          confirmPassword.value &&
          password.value !==
            confirmPassword.value
        ) {

          confirmPassword.setCustomValidity(
            "Passwords do not match."
          );

        } else {

          confirmPassword.setCustomValidity(
            ""
          );

        }

      }
    );

  }


  /*
   * Normalize phone input.
   */

  $("adminPhone")?.addEventListener(
    "blur",
    (event) => {

      event.target.value =
        normalizeKenyanPhone(
          event.target.value
        );

    }
  );


  $("groupPhone")?.addEventListener(
    "blur",
    (event) => {

      event.target.value =
        normalizeKenyanPhone(
          event.target.value
        );

    }
  );

}


/* =====================================================
   SUBMIT
===================================================== */

async function handleSubmit(
  event
) {

  event.preventDefault();

  clearError();


  const form =
    $("createGroupForm");


  /*
   * Browser validation.
   */

  if (
    !form.checkValidity()
  ) {

    form.reportValidity();

    return;

  }


  const values =
    collectFormValues();


  /*
   * Extra validation.
   */

  const validation =
    validateValues(
      values
    );


  if (
    !validation.valid
  ) {

    showError(
      validation.message
    );

    return;

  }


  setLoading(
    true
  );


  try {


    /* =================================================
       1. CREATE AUTH USER
    ================================================= */

    setStatus(
      "Creating administrator account..."
    );


    const {
      data: authData,
      error: authError
    } =
      await supabase.auth.signUp({

        email:
          values.adminEmail,

        password:
          values.password,

        options: {

          data: {

            full_name:
              values.adminName,

            phone:
              values.adminPhone,

            role:
              "admin"

          }

        }

      });


    if (authError) {

      throw authError;

    }


    const user =
      authData?.user;


    if (!user) {

      throw new Error(
        "Supabase did not return the new user account."
      );

    }


    /*
     * If email confirmation is enabled,
     * Supabase may return a user but no session.
     *
     * We cannot safely insert the group/member
     * from the browser until the user has an
     * authenticated session.
     */

    const session =
      authData?.session;


    if (!session) {

      /*
       * In this first version we stop here.
       *
       * The proper production version will use
       * an onboarding Edge Function / server-side
       * transaction so the group can be created
       * atomically before email confirmation.
       */

      showConfirmationMessage(
        values
      );

      return;

    }


    /* =================================================
       2. CREATE GROUP
    ================================================= */

    setStatus(
      "Creating group..."
    );


    const groupPayload =
      buildGroupPayload(
        values
      );


    const {
      data: group,
      error: groupError
    } =
      await supabase

        .from("groups")

        .insert(
          groupPayload
        )

        .select()

        .single();


    if (groupError) {

      /*
       * Remove the just-created auth session
       * because group creation failed.
       */

      await supabase.auth.signOut();

      throw groupError;

    }


    if (!group?.id) {

      await supabase.auth.signOut();

      throw new Error(
        "Group was created but no group ID was returned."
      );

    }


    createdGroupId =
      group.id;


    /* =================================================
       3. CREATE FIRST MEMBER / ADMIN
    ================================================= */

    setStatus(
      "Creating administrator profile..."
    );


    const memberPayload =
      buildMemberPayload(
        values,
        user.id,
        group.id
      );


    const {
      data: member,
      error: memberError
    } =
      await supabase

        .from("members")

        .insert(
          memberPayload
        )

        .select()

        .single();


    if (memberError) {

      /*
       * We do NOT delete the group automatically
       * from the browser.
       *
       * This avoids dangerous client-side cleanup.
       */

      console.error(
        "Member creation failed:",
        memberError
      );

      throw new Error(
        "The group was created, but the administrator profile could not be created. " +
        "Check the members table RLS policy and column names."
      );

    }


    if (!member) {

      throw new Error(
        "Administrator profile was not returned."
      );

    }


    /* =================================================
       4. SUCCESS
    ================================================= */

    setStatus(
      "Group created successfully."
    );


    showSuccess(
      values,
      group,
      member
    );


  } catch (error) {

    console.error(
      "Create group error:",
      error
    );


    showError(
      friendlyError(
        error
      )
    );


  } finally {

    setLoading(
      false
    );

  }

}


/* =====================================================
   COLLECT FORM VALUES
===================================================== */

function collectFormValues() {

  return {

    groupName:
      value("groupName"),

    groupType:
      value("groupType"),

    registrationNumber:
      value("registrationNumber"),

    location:
      value("location"),

    groupPhone:
      normalizeKenyanPhone(
        value("groupPhone")
      ),

    meetingDay:
      value("meetingDay"),

    monthlyContribution:
      Number(
        value("monthlyContribution") ||
        0
      ),

    adminName:
      value("adminName"),

    memberNumber:
      value("memberNumber"),

    adminPhone:
      normalizeKenyanPhone(
        value("adminPhone")
      ),

    adminEmail:
      value("adminEmail")
        .toLowerCase()
        .trim(),

    password:
      value("password"),

    confirmPassword:
      value("confirmPassword")

  };

}


/* =====================================================
   VALIDATION
===================================================== */

function validateValues(
  values
) {


  if (
    !values.groupName
  ) {

    return {
      valid: false,
      message:
        "Please enter the group name."
    };

  }


  if (
    !values.groupType
  ) {

    return {
      valid: false,
      message:
        "Please select the group type."
    };

  }


  if (
    values.monthlyContribution <
    0
  ) {

    return {
      valid: false,
      message:
        "Monthly contribution cannot be negative."
    };

  }


  if (
    !values.adminName
  ) {

    return {
      valid: false,
      message:
        "Please enter the administrator's full name."
    };

  }


  if (
    !values.memberNumber
  ) {

    return {
      valid: false,
      message:
        "Please enter the administrator's member number."
    };

  }


  if (
    !values.adminPhone
  ) {

    return {
      valid: false,
      message:
        "Please enter the administrator's phone number."
    };

  }


  if (
    !isValidEmail(
      values.adminEmail
    )
  ) {

    return {
      valid: false,
      message:
        "Please enter a valid email address."
    };

  }


  if (
    values.password.length <
    8
  ) {

    return {
      valid: false,
      message:
        "Password must contain at least 8 characters."
    };

  }


  if (
    values.password !==
    values.confirmPassword
  ) {

    return {
      valid: false,
      message:
        "Passwords do not match."
    };

  }


  const agreement =
    $("agreement");


  if (
    !agreement?.checked
  ) {

    return {
      valid: false,
      message:
        "Please confirm that you are authorized to create this group."
    };

  }


  return {
    valid: true
  };

}


/* =====================================================
   GROUP PAYLOAD
===================================================== */

function buildGroupPayload(
  values
) {

  /*
   * These columns correspond to the fields
   * used by the current CHAMA LIVE financial
   * system.
   *
   * If your groups table uses different names,
   * change them here only.
   */

  return {

    name:
      values.groupName,

    type:
      values.groupType,

    registration_number:
      values.registrationNumber ||
      null,

    location:
      values.location ||
      null,

    phone:
      values.groupPhone ||
      null,

    meeting_day:
      values.meetingDay ||
      null,

    monthly_contribution:
      values.monthlyContribution,

    opening_balance:
      0

  };

}


/* =====================================================
   MEMBER PAYLOAD
===================================================== */

function buildMemberPayload(
  values,
  userId,
  groupId
) {

  /*
   * Your existing members table already uses:
   *
   * group_id
   * member_number
   * name
   * phone
   * role
   * join_date
   * status
   * email
   *
   * Your existing authentication/RLS setup has also
   * referenced auth_user_id.
   *
   * We therefore use auth_user_id here.
   */

  return {

    group_id:
      groupId,

    auth_user_id:
      userId,

    member_number:
      values.memberNumber,

    name:
      values.adminName,

    phone:
      values.adminPhone,

    email:
      values.adminEmail,

    role:
      "admin",

    join_date:
      today(),

    status:
      "active"

  };

}


/* =====================================================
   SUCCESS
===================================================== */

function showSuccess(
  values,
  group,
  member
) {

  const form =
    $("createGroupForm");

  const success =
    $("success");


  if (form) {

    form.classList.add(
      "hidden"
    );

  }


  if (success) {

    success.classList.remove(
      "hidden"
    );

  }


  const message =
    $("successMessage");


  if (message) {

    message.textContent =
      `${group.name} has been created successfully. ` +
      `You are now the administrator.`;

  }


  const continueButton =
    $("continueButton");


  if (
    continueButton
  ) {

    continueButton.onclick =
      () => {

        window.location.href =
          "dashboard.html";

      };

  }

}


/* =====================================================
   EMAIL CONFIRMATION MESSAGE
===================================================== */

function showConfirmationMessage(
  values
) {

  const form =
    $("createGroupForm");

  const success =
    $("success");


  if (form) {

    form.classList.add(
      "hidden"
    );

  }


  if (success) {

    success.classList.remove(
      "hidden"
    );

  }


  const message =
    $("successMessage");


  if (message) {

    message.innerHTML = `
      We created your administrator login request.
      <br><br>
      Please check
      <strong>${escapeHtml(values.adminEmail)}</strong>
      and confirm your email address.
      <br><br>
      After confirmation, continue to the next onboarding step.
    `;

  }


  const continueButton =
    $("continueButton");


  if (
    continueButton
  ) {

    continueButton.textContent =
      "Go to Login";


    continueButton.onclick =
      () => {

        window.location.href =
          "login.html";

      };

  }


  setStatus(
    "Email confirmation required."
  );

}


/* =====================================================
   LOADING
===================================================== */

function setLoading(
  loading
) {

  const button =
    $("createGroupButton");

  if (!button) {
    return;
  }


  button.disabled =
    loading;


  if (loading) {

    button.dataset.originalText =
      button.textContent;

    button.textContent =
      "Creating account...";

  } else {

    button.textContent =
      button.dataset.originalText ||
      "Create Group Account";

  }

}


/* =====================================================
   STATUS
===================================================== */

function setStatus(
  message
) {

  /*
   * There is no permanent status box
   * in the form, so log progress.
   */

  console.log(
    "CHAMA LIVE:",
    message
  );

}


/* =====================================================
   ERROR
===================================================== */

function showError(
  message
) {

  const element =
    $("error");


  if (!element) {

    alert(
      message
    );

    return;

  }


  element.hidden =
    false;

  element.textContent =
    message;


  element.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

}


/* =====================================================
   CLEAR ERROR
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


/* =====================================================
   FORM VALUE
===================================================== */

function value(
  id
) {

  const element =
    $(id);

  return (
    element?.value ||
    ""
  ).trim();

}


/* =====================================================
   EMAIL VALIDATION
===================================================== */

function isValidEmail(
  email
) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    .test(email);

}


/* =====================================================
   KENYAN PHONE
===================================================== */

function normalizeKenyanPhone(
  phone
) {

  let value =
    String(
      phone || ""
    )
      .trim()
      .replace(
        /[\s()-]/g,
        ""
      );


  if (
    value.startsWith(
      "+254"
    )
  ) {

    return value;

  }


  if (
    value.startsWith(
      "254"
    )
  ) {

    return "+" +
      value;

  }


  if (
    value.startsWith(
      "07"
    ) ||
    value.startsWith(
      "01"
    )
  ) {

    return "+254" +
      value.substring(
        1
      );

  }


  return value;

}


/* =====================================================
   TODAY
===================================================== */

function today() {

  const date =
    new Date();


  return date
    .toISOString()
    .slice(
      0,
      10
    );

}


/* =====================================================
   FRIENDLY SUPABASE ERRORS
===================================================== */

function friendlyError(
  error
) {

  const message =
    String(
      error?.message ||
      error ||
      ""
    );


  const lower =
    message.toLowerCase();


  if (
    lower.includes(
      "user already registered"
    )
  ) {

    return (
      "An account with this email already exists. " +
      "Please use Member Login instead."
    );

  }


  if (
    lower.includes(
      "invalid email"
    )
  ) {

    return (
      "Please enter a valid email address."
    );

  }


  if (
    lower.includes(
      "password"
    ) &&
    lower.includes(
      "characters"
    )
  ) {

    return (
      "Your password must meet the minimum length requirement."
    );

  }


  if (
    lower.includes(
      "row-level security"
    ) ||
    lower.includes(
      "rls"
    ) ||
    lower.includes(
      "permission denied"
    )
  ) {

    return (
      "The account was authenticated, but CHAMA LIVE " +
      "blocked the database operation. Check the groups " +
      "and members RLS policies."
    );

  }


  if (
    lower.includes(
      "column"
    ) &&
    lower.includes(
      "does not exist"
    )
  ) {

    return (
      "A database column used by onboarding does not exist. " +
      "Check the groups/members table columns."
    );

  }


  return (
    message ||
    "Unable to create the group account. Please try again."
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
```
