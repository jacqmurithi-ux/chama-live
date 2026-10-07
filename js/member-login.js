/* =========================================================
   CHAMA LIVE — MEMBER LOGIN

   File:
   /js/member-login.js

   Production:
   https://chamalive.co.ke/

   FLOW
   ---------------------------------------------------------
   Member Login
        ↓
   Supabase Auth
        ↓
   getMyApplicationContext()
        ↓
   Verify portal role
        ↓
   Verify member status
        ↓
   Verify onboarding status
        ↓
   Member Dashboard

   IMPORTANT
   ---------------------------------------------------------
   - Ordinary members use the Member Portal.
   - Admin/management roles are blocked from this portal.
   - Admin accounts must use the Admin Portal.
   - Database/application context remains authoritative.
   - No member/group IDs are supplied by the browser.
========================================================= */

import {
  supabase
} from "./supabase.js";

import {
  signIn,
  getMyApplicationContext
} from "./auth.js";


/* =========================================================
   ADMIN / MANAGEMENT ROLES
========================================================= */

const ADMIN_ROLES = new Set([
  "admin",
  "chairperson",
  "secretary",
  "treasurer",
  "vice chairperson",
  "vice secretary"
]);


/* =========================================================
   ELEMENTS
========================================================= */

const form =
  document.getElementById(
    "memberLoginForm"
  );

const emailInput =
  document.getElementById(
    "email"
  );

const passwordInput =
  document.getElementById(
    "password"
  );

const button =
  document.getElementById(
    "loginButton"
  );

const errorBox =
  document.getElementById(
    "error"
  );

const successBox =
  document.getElementById(
    "success"
  );


/* =========================================================
   STATE
========================================================= */

let loginInProgress = false;


/* =========================================================
   SHOW ERROR
========================================================= */

function showError(message) {

  if (!errorBox) {
    return;
  }

  errorBox.textContent =
    message ||
    "Unable to sign in.";

  errorBox.hidden =
    false;

  if (successBox) {

    successBox.textContent =
      "";

    successBox.hidden =
      true;
  }
}


/* =========================================================
   SHOW SUCCESS
========================================================= */

function showSuccess(message) {

  if (!successBox) {
    return;
  }

  successBox.textContent =
    message ||
    "";

  successBox.hidden =
    !message;

  if (errorBox) {

    errorBox.textContent =
      "";

    errorBox.hidden =
      true;
  }
}


/* =========================================================
   CLEAR MESSAGES
========================================================= */

function clearMessages() {

  if (errorBox) {

    errorBox.textContent =
      "";

    errorBox.hidden =
      true;
  }

  if (successBox) {

    successBox.textContent =
      "";

    successBox.hidden =
      true;
  }
}


/* =========================================================
   LOADING STATE
========================================================= */

function setLoading(loading) {

  if (!button) {
    return;
  }

  button.disabled =
    loading;

  button.textContent =
    loading
      ? "Signing in..."
      : "Sign In";
}


/* =========================================================
   NORMALIZE ERROR
========================================================= */

function normalizeError(error) {

  const message =
    String(
      error?.message ||
      error ||
      ""
    ).trim();

  const lower =
    message.toLowerCase();


  if (
    lower.includes(
      "invalid login credentials"
    )
  ) {

    return (
      "Incorrect email or password. Please check your details and try again."
    );
  }


  if (
    lower.includes(
      "email not confirmed"
    )
  ) {

    return (
      "Your email address has not been confirmed. Please check your email and confirm your account."
    );
  }


  if (
    lower.includes(
      "too many requests"
    )
  ) {

    return (
      "Too many login attempts. Please wait a few minutes and try again."
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
      "Unable to connect to CHAMA LIVE. Please check your internet connection."
    );
  }


  return (
    message ||
    "Unable to sign in."
  );
}


/* =========================================================
   VALIDATE CREDENTIALS
========================================================= */

function validateCredentials() {

  const email =
    String(
      emailInput?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  const password =
    String(
      passwordInput?.value ||
      ""
    );


  if (!email) {

    throw new Error(
      "Please enter your email address."
    );
  }


  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {

    throw new Error(
      "Please enter a valid email address."
    );
  }


  if (!password) {

    throw new Error(
      "Please enter your password."
    );
  }


  return {
    email,
    password
  };
}


/* =========================================================
   MEMBER STATUS
========================================================= */

function getMemberStatus(context) {

  return String(
    context?.member?.status ||
    context?.status ||
    ""
  )
    .trim()
    .toLowerCase();
}


/* =========================================================
   ONBOARDING STATUS
========================================================= */

function getOnboardingStatus(context) {

  return String(
    context?.member?.onboarding_status ||
    context?.onboarding_status ||
    ""
  )
    .trim()
    .toLowerCase();
}


/* =========================================================
   SIGN OUT SAFELY
========================================================= */

async function signOutAfterAccessDenial() {

  try {

    await supabase.auth.signOut();

  }
  catch (signOutError) {

    console.error(
      "CHAMA LIVE: sign-out after access denial failed:",
      signOutError
    );
  }
}


/* =========================================================
   PERFORM LOGIN
========================================================= */

async function performLogin() {

  if (loginInProgress) {
    return;
  }


  loginInProgress =
    true;


  clearMessages();

  setLoading(
    true
  );


  try {

    /* -----------------------------------------------------
       VALIDATE LOGIN INPUT
    ----------------------------------------------------- */

    const {
      email,
      password
    } =
      validateCredentials();


    /* -----------------------------------------------------
       SUPABASE AUTH
    ----------------------------------------------------- */

    await signIn(
      email,
      password
    );


    /* -----------------------------------------------------
       LOAD AUTHORITATIVE APPLICATION / MEMBER CONTEXT
    ----------------------------------------------------- */

    const context =
      await getMyApplicationContext();


    /* -----------------------------------------------------
       DETERMINE ROLE
    ----------------------------------------------------- */

    const role =
      String(
        context?.role ||
        ""
      )
        .trim()
        .toLowerCase();


    const isOwner =
      context?.isOwner === true;


    /* -----------------------------------------------------
       ADMIN PORTAL BOUNDARY
    -----------------------------------------------------

       Admin/management accounts are deliberately prevented
       from entering the Member Portal.

       This avoids exposing the member dashboard to accounts
       that belong to the administrative portal.
    ----------------------------------------------------- */

    if (
      isOwner ||
      ADMIN_ROLES.has(role)
    ) {

      await signOutAfterAccessDenial();

      throw new Error(
        "Access Denied. Your account is registered for the Admin Portal. Please use the Admin Login."
      );
    }


    /* -----------------------------------------------------
       MEMBER ROLE REQUIRED
    ----------------------------------------------------- */

    if (
      role !== "member"
    ) {

      await signOutAfterAccessDenial();

      throw new Error(
        "Your CHAMA LIVE account does not have a valid portal role. Please contact your Group Admin."
      );
    }


    /* -----------------------------------------------------
       MEMBER STATUS
    ----------------------------------------------------- */

    const status =
      getMemberStatus(
        context
      );


    /* -----------------------------------------------------
       ONBOARDING STATUS
    ----------------------------------------------------- */

    const onboarding =
      getOnboardingStatus(
        context
      );


    /* -----------------------------------------------------
       ACTIVE MEMBER REQUIRED
    ----------------------------------------------------- */

    if (
      status &&
      status !== "active"
    ) {

      await signOutAfterAccessDenial();

      throw new Error(
        "Your account is not yet verified. Please contact your Group Admin."
      );
    }


    /* -----------------------------------------------------
       ACTIVE ONBOARDING REQUIRED
    ----------------------------------------------------- */

    if (
      onboarding &&
      onboarding !== "active"
    ) {

      await signOutAfterAccessDenial();

      throw new Error(
        "Your account is not yet verified. Please contact your Group Admin."
      );
    }


    /* -----------------------------------------------------
       MEMBER PORTAL SUCCESS
    ----------------------------------------------------- */

    showSuccess(
      "Login successful. Opening your Member Portal..."
    );


    /*
     * Relative URL intentionally used.
     *
     * Production:
     * https://chamalive.co.ke/member-dashboard.html
     *
     * This avoids the obsolete:
     * /chama-live/member-dashboard.html
     */

    window.location.replace(
      "member-dashboard.html"
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE member login failed:",
      error
    );


    showError(
      normalizeError(
        error
      )
    );

  }

  finally {

    loginInProgress =
      false;

    setLoading(
      false
    );
  }
}


/* =========================================================
   FORM SUBMIT
========================================================= */

if (form) {

  form.addEventListener(
    "submit",
    event => {

      event.preventDefault();

      performLogin();

    }
  );

}
else {

  console.error(
    "CHAMA LIVE member login: #memberLoginForm was not found."
  );
}


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: member-login.js ready"
);
