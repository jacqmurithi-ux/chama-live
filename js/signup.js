/* =========================================================
   CHAMA LIVE — SIGNUP

   File:
   /js/signup.js

   Production:
   https://chamalive.co.ke/

   ARCHITECTURE
   ---------------------------------------------------------
   Create Supabase Auth account
        ↓
   Supabase sends confirmation email
        ↓
   User confirms email
        ↓
   confirm.html
        ↓
   Authenticated group application submission
        ↓
   Pending platform-admin review
        ↓
   approve_group_application()
        ↓
   Group + creator member + financial period
        ↓
   Group Management / Dashboard

   IMPORTANT
   ---------------------------------------------------------
   - Supabase Auth owns the password.
   - Password is never stored in localStorage.
   - Password is never stored in Auth metadata.
   - No group/member IDs are supplied by the browser.
   - Group creation does NOT happen during signup.
   - Group creation does NOT happen immediately after
     email confirmation.
   - Email confirmation establishes the authenticated
     identity required by the application flow.
   - Platform Admin approval remains the group-creation
     boundary.
   - Database authorization remains authoritative.
   - Monthly contribution is configured after approval
     in Group Management.
   - Opening balance is not collected during onboarding.

   CURRENT SUPABASE CONTRACT
   ---------------------------------------------------------
   submit_group_application(
     p_group_name,
     p_category,
     p_description,
     p_admin_name,
     p_admin_phone,
     p_country,
     p_location,
     p_town
   )

   CURRENT AUTH CALLBACK
   ---------------------------------------------------------
   confirm.html

   PRODUCTION AUTH CALLBACK
   ---------------------------------------------------------
   https://chamalive.co.ke/confirm.html
========================================================= */

import {
  supabase
} from "./auth.js";


/* =========================================================
   CONFIGURATION
========================================================= */

/*
 * Production confirmation callback.
 *
 * Supabase Authentication must also have this exact URL
 * configured under:
 *
 * Authentication → URL Configuration → Redirect URLs
 *
 * https://chamalive.co.ke/confirm.html
 */

const CONFIRM_PAGE =
  "https://chamalive.co.ke/confirm.html";


/* =========================================================
   ELEMENTS
========================================================= */

const form =
  document.getElementById(
    "signupForm"
  );


const signupButton =
  document.getElementById(
    "signupButton"
  );


const errorBox =
  document.getElementById(
    "error"
  );


const statusBox =
  document.getElementById(
    "status"
  );


/* =========================================================
   FORM FIELD HELPERS
========================================================= */

function field(id) {

  return document.getElementById(
    id
  );

}


function valueOf(id) {

  return (
    field(id)?.value?.trim() ||
    ""
  );

}


/* =========================================================
   UI HELPERS
========================================================= */

function showError(message) {

  console.error(
    "CHAMA LIVE signup:",
    message
  );


  if (errorBox) {

    errorBox.textContent =
      message ||
      "Unable to create your account.";

    errorBox.hidden =
      false;

  }

}


function clearError() {

  if (errorBox) {

    errorBox.textContent =
      "";

    errorBox.hidden =
      true;

  }

}


function setStatus(message) {

  if (statusBox) {

    statusBox.textContent =
      message ||
      "";

    statusBox.hidden =
      !message;

  }

}


/* =========================================================
   FRIENDLY ERROR
========================================================= */

function friendlyError(error) {

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
      "An account already exists for this email. " +
      "Please sign in instead."
    );

  }


  if (
    lower.includes(
      "email address not authorized"
    )
  ) {

    return (
      "Your account was not created because the " +
      "Supabase email service is currently restricted " +
      "to authorized email addresses. Please configure " +
      "production SMTP for CHAMA LIVE."
    );

  }


  if (
    lower.includes(
      "email rate limit"
    ) ||
    lower.includes(
      "rate limit"
    )
  ) {

    return (
      "Too many email requests. " +
      "Please wait a few minutes and try again."
    );

  }


  if (
    lower.includes(
      "password"
    ) &&
    (
      lower.includes(
        "6"
      ) ||
      lower.includes(
        "characters"
      )
    )
  ) {

    return (
      "Password must be at least 8 characters."
    );

  }


  if (
    lower.includes(
      "failed to fetch"
    ) ||
    lower.includes(
      "network"
    )
  ) {

    return (
      "Unable to connect to CHAMA LIVE. " +
      "Check your internet connection and try again."
    );

  }


  return (
    message ||
    "Unable to create your account."
  );

}


/* =========================================================
   VALIDATION
========================================================= */

function collectFormValues() {

  return {

    groupName:
      valueOf(
        "groupName"
      ),

    category:
      valueOf(
        "category"
      ) ||
      "other",

    country:
      valueOf(
        "country"
      ) ||
      "Kenya",

    location:
      valueOf(
        "location"
      ),

    town:
      valueOf(
        "town"
      ),

    description:
      valueOf(
        "description"
      ),

    adminName:
      valueOf(
        "adminName"
      ),

    adminPhone:
      valueOf(
        "adminPhone"
      ),

    email:
      valueOf(
        "email"
      ).toLowerCase(),

    password:
      field(
        "password"
      )?.value ||
      "",

    confirmPassword:
      field(
        "confirmPassword"
      )?.value ||
      ""

  };

}


function validate(values) {

  if (!values.groupName) {

    throw new Error(
      "Please enter your Chama name."
    );

  }


  if (
    values.groupName.length <
    2
  ) {

    throw new Error(
      "Your Chama name is too short."
    );

  }


  if (!values.category) {

    throw new Error(
      "Please select the Chama type."
    );

  }


  if (!values.location) {

    throw new Error(
      "Please enter the group location."
    );

  }


  if (!values.town) {

    throw new Error(
      "Please enter the town."
    );

  }


  if (!values.adminName) {

    throw new Error(
      "Please enter your full name."
    );

  }


  if (!values.adminPhone) {

    throw new Error(
      "Please enter your phone number."
    );

  }


  if (!values.email) {

    throw new Error(
      "Please enter your email address."
    );

  }


  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      values.email
    )
  ) {

    throw new Error(
      "Please enter a valid email address."
    );

  }


  if (
    !values.password ||
    values.password.length < 8
  ) {

    throw new Error(
      "Password must be at least 8 characters."
    );

  }


  if (
    values.password !==
    values.confirmPassword
  ) {

    throw new Error(
      "Passwords do not match."
    );

  }


  return values;

}


/* =========================================================
   CREATE AUTH ACCOUNT
========================================================= */

async function createAuthAccount(
  values
) {

  /*
   * IMPORTANT:
   *
   * Password is supplied only to Supabase Auth.
   *
   * It is deliberately NOT placed in:
   *
   * - user_metadata
   * - app_metadata
   * - localStorage
   * - sessionStorage
   * - URL parameters
   *
   * The remaining onboarding fields are carried in
   * user_metadata only so confirm.html can recover the
   * application information after email verification.
   *
   * Database authorization remains authoritative.
   */

  const {
    data,
    error
  } =
    await supabase.auth.signUp({

      email:
        values.email,

      password:
        values.password,

      options: {

        emailRedirectTo:
          CONFIRM_PAGE,

        data: {

          chama_onboarding:
            true,

          group_name:
            values.groupName,

          category:
            values.category,

          description:
            values.description ||
            null,

          admin_name:
            values.adminName,

          admin_phone:
            values.adminPhone,

          location:
            values.location,

          town:
            values.town,

          country:
            values.country

        }

      }

    });


  if (error) {

    throw error;

  }


  if (!data?.user) {

    throw new Error(
      "The account could not be created."
    );

  }


  return data;

}


/* =========================================================
   HANDLE SUCCESS
========================================================= */

function handleSignupSuccess(
  data
) {

  /*
   * Normal production path:
   *
   * email confirmation is required
   * → Supabase returns user
   * → session is null
   * → user must confirm email
   * → confirmation link opens confirm.html.
   */

  if (!data?.session) {

    setStatus(
      "Account created successfully. " +
      "Please check your email and click the " +
      "confirmation link to continue your group application."
    );

    return;

  }


  /*
   * If email confirmation is disabled in Supabase,
   * Supabase may return an active session immediately.
   *
   * We still do not create the group here.
   *
   * Redirecting to confirm.html keeps the application
   * submission boundary centralized.
   */

  setStatus(
    "Account created. Continuing to your application..."
  );


  window.location.replace(
    CONFIRM_PAGE
  );

}


/* =========================================================
   SUBMIT
========================================================= */

async function handleSubmit(
  event
) {

  event.preventDefault();


  clearError();

  setStatus("");


  if (signupButton) {

    signupButton.disabled =
      true;

  }


  try {

    const values =
      collectFormValues();


    validate(
      values
    );


    setStatus(
      "Creating your secure account..."
    );


    const data =
      await createAuthAccount(
        values
      );


    handleSignupSuccess(
      data
    );

  }

  catch (error) {

    showError(
      friendlyError(
        error
      )
    );


    if (signupButton) {

      signupButton.disabled =
        false;

    }

  }

}


/* =========================================================
   INITIALIZE
========================================================= */

function init() {

  if (!form) {

    console.error(
      "CHAMA LIVE signup: #signupForm was not found."
    );

    return;

  }


  form.addEventListener(
    "submit",
    handleSubmit
  );

}


/* =========================================================
   START
========================================================= */

init();
