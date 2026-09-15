/* =========================================================
   CHAMA LIVE — SIGNUP

   ARCHITECTURE
   ---------------------------------------------------------
   Create a Chama
        ↓
   Create Supabase Auth account
        ↓
   Verify email
        ↓
   confirm.html
        ↓
   onboard_new_group()
        ↓
   Group + creator member + initial financial period
        ↓
   Dashboard

   IMPORTANT
   ---------------------------------------------------------
   - Supabase Auth owns the password.
   - No password is stored in localStorage.
   - No group/member IDs are supplied by the browser.
   - No group_applications workflow.
   - No account-review workflow.
   - No platform-admin approval.
   - Group creation happens after authenticated
     email confirmation through confirm.html.
   - Database authorization remains authoritative.

   CURRENT SUPABASE CONTRACT
   ---------------------------------------------------------
   onboard_new_group(
     p_group_name,
     p_category,
     p_monthly_contribution,
     p_opening_balance,
     p_description,
     p_admin_name,
     p_admin_phone,
     p_country
   )

   CURRENT AUTH CALLBACK
   ---------------------------------------------------------
   confirm.html

   CURRENT GITHUB PAGES BASE URL
   ---------------------------------------------------------
   https://jacqmurithi-ux.github.io/chama-live
========================================================= */

import {
  supabase,
  BASE_URL
} from "./auth.js";


/* =========================================================
   CONFIGURATION
========================================================= */

const CONFIRM_PAGE =
  `${BASE_URL}/confirm.html`;


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
   FORM FIELD HELPER
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
      "email rate limit"
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
    lower.includes(
      "6"
    )
  ) {

    return (
      "Password must contain at least 8 characters."
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

  const values = {

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

    monthlyContribution:
      valueOf(
        "monthlyContribution"
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
      )
        .toLowerCase(),

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


  return values;

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


  const monthlyContribution =
    Number(
      values.monthlyContribution ||
      0
    );


  if (
    !Number.isFinite(
      monthlyContribution
    ) ||
    monthlyContribution < 0
  ) {

    throw new Error(
      "Monthly contribution must be zero or greater."
    );

  }


  values.monthlyContribution =
    monthlyContribution;


  return values;

}


/* =========================================================
   CREATE AUTH ACCOUNT
========================================================= */

async function createAuthAccount(
  values
) {

  /*
   * The browser never stores the password outside
   * Supabase Auth.
   *
   * Safe onboarding values are carried in Auth metadata
   * so confirm.html can complete authenticated group
   * creation after email verification.
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

          monthly_contribution:
            values.monthlyContribution,

          opening_balance:
            0,

          description:
            values.description ||
            null,

          admin_name:
            values.adminName,

          admin_phone:
            values.adminPhone,

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
   * When email confirmation is required,
   * Supabase returns the user without an active
   * session. Group creation therefore waits for
   * the confirmation callback.
   */

  if (!data?.session) {

    setStatus(
      "Account created. Please check your email and confirm your address to continue creating your Chama."
    );

    return;

  }


  /*
   * If the project permits an immediate session,
   * use the same confirmation boundary so there is
   * only one group-creation path.
   */

  setStatus(
    "Account created. Completing your Chama setup..."
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

