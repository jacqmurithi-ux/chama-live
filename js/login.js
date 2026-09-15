/* =========================================================
   CHAMA LIVE — LOGIN

   CANONICAL AUTHENTICATION FLOW
   ---------------------------------------------------------
   Sign-in form
        ↓
   auth.js / signIn()
        ↓
   Supabase Auth session
        ↓
   auth.js / getMyMember()
        ↓
   Authenticated member
        ↓
   Dashboard / portal authorization

   IMPORTANT
   ---------------------------------------------------------
   - Supabase Auth owns authentication.
   - auth.js owns canonical user/member/group resolution.
   - This file does NOT implement account approval.
   - This file does NOT query group_applications.
   - This file does NOT use onboarding_status.
   - This file does NOT redirect to account-review.html.
   - This file does NOT implement platform-admin review.
   - Portal authorization remains a separate security layer.
========================================================= */

import {
  supabase,
  BASE_URL,
  signIn,
  getMyMember
} from "./auth.js";


console.log(
  "CHAMA LIVE: login.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const form =
  document.getElementById(
    "loginForm"
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
   DESTINATION
========================================================= */

const DASHBOARD_URL =
  `${BASE_URL}/dashboard.html`;


/* =========================================================
   ERROR
========================================================= */

function showError(
  message
) {

  const cleanMessage =
    String(
      message ||
      "Unable to sign in."
    ).trim();


  console.error(
    "CHAMA LIVE login:",
    cleanMessage
  );


  if (errorBox) {

    errorBox.textContent =
      cleanMessage;

    errorBox.hidden =
      false;

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
   SUCCESS
========================================================= */

function showSuccess(
  message
) {

  if (!successBox) {
    return;
  }


  successBox.textContent =
    String(
      message ||
      ""
    );


  successBox.hidden =
    !message;

}


/* =========================================================
   LOADING
========================================================= */

function setLoading(
  loading
) {

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
   LOGIN ERROR NORMALIZATION
========================================================= */

function normalizeLoginError(
  error
) {

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
      "Incorrect email or password. " +
      "Please check your details and try again."
    );

  }


  if (
    lower.includes(
      "email not confirmed"
    )
  ) {

    return (
      "Your email address has not been confirmed. " +
      "Please check your email and confirm your account."
    );

  }


  if (
    lower.includes(
      "too many requests"
    )
  ) {

    return (
      "Too many login attempts. " +
      "Please wait a few minutes and try again."
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
      "Please check your internet connection."
    );

  }


  if (
    lower.includes(
      "no member record"
    )
  ) {

    return (
      "Your account is not linked to a CHAMA LIVE member record. " +
      "Please contact your group administrator."
    );

  }


  if (
    lower.includes(
      "not linked to a group"
    )
  ) {

    return (
      "Your member account is not linked to a group. " +
      "Please contact your group administrator."
    );

  }


  if (
    lower.includes(
      "user is not authenticated"
    )
  ) {

    return (
      "Your session could not be established. " +
      "Please sign in again."
    );

  }


  return (
    message ||
    "Unable to sign in."
  );

}


/* =========================================================
   VERIFY CANONICAL MEMBER CONTEXT
========================================================= */

/*
 * IMPORTANT:
 *
 * Do not query the members table directly here.
 *
 * auth.js is the canonical owner of:
 *
 *     authenticated user
 *          ↓
 *       member
 *          ↓
 *       group_id
 *
 * This prevents login.js from maintaining a second
 * authentication/member-resolution implementation.
 */

async function verifyMemberContext() {

  const member =
    await getMyMember();


  if (!member) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  if (!member.group_id) {

    throw new Error(
      "Your member record is not linked to a group."
    );

  }


  console.log(
    "CHAMA LIVE: canonical member context resolved",
    {
      memberId:
        member.id,

      groupId:
        member.group_id,

      role:
        member.role || null,

      status:
        member.status || null
    }
  );


  return member;

}


/* =========================================================
   REDIRECT
========================================================= */

function redirectToDashboard() {

  window.location.replace(
    DASHBOARD_URL
  );

}


/* =========================================================
   READ LOGIN CREDENTIALS
========================================================= */

function readCredentials() {

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
   LOGIN
========================================================= */

async function performLogin() {

  clearMessages();


  let credentials;


  /* =======================================================
     VALIDATE
  ======================================================= */

  try {

    credentials =
      readCredentials();

  }

  catch (error) {

    showError(
      normalizeLoginError(
        error
      )
    );

    return;

  }


  setLoading(
    true
  );


  try {

    /* =====================================================
       AUTHENTICATE
    ===================================================== */

    showSuccess(
      "Authenticating..."
    );


    /*
     * auth.js owns the sign-in contract.
     *
     * Do not call signInWithPassword() directly here.
     */

    const data =
      await signIn(
        credentials.email,
        credentials.password
      );


    if (
      !data?.user ||
      !data?.session
    ) {

      throw new Error(
        "Sign in failed. No active session was created."
      );

    }


    /* =====================================================
       RESOLVE MEMBER
    ===================================================== */

    showSuccess(
      "Loading your CHAMA LIVE account..."
    );


    /*
     * Canonical member resolution.
     *
     * No approval workflow is performed.
     * No application lookup is performed.
     */

    await verifyMemberContext();


    /* =====================================================
       CLEAR PASSWORD
    ===================================================== */

    if (passwordInput) {

      passwordInput.value =
        "";

    }


    /* =====================================================
       SUCCESS
    ===================================================== */

    showSuccess(
      "Signed in successfully. Opening CHAMA LIVE..."
    );


    /*
     * The dashboard independently resolves:
     *
     *     requireAuth()
     *     getMyMember()
     *     getMyGroup()
     *
     * Group context is therefore never passed through
     * the URL.
     *
     * Portal authorization remains separate and must
     * ultimately be enforced by backend authorization.
     */

    redirectToDashboard();

  }


  catch (error) {

    console.error(
      "CHAMA LIVE: login failed",
      error
    );


    /*
     * If authentication succeeded but member resolution
     * failed, remove the unusable session before returning
     * to the login screen.
     */

    try {

      await supabase.auth.signOut();

    }

    catch (signOutError) {

      console.warn(
        "CHAMA LIVE: cleanup sign-out failed",
        signOutError
      );

    }


    showError(
      normalizeLoginError(
        error
      )
    );


    setLoading(
      false
    );

  }

}


/* =========================================================
   EXISTING SESSION
========================================================= */

async function checkExistingSession() {

  try {

    const {
      data,
      error
    } =
      await supabase.auth.getSession();


    if (error) {

      console.warn(
        "CHAMA LIVE: existing session check failed",
        error
      );

      return;

    }


    const session =
      data?.session;


    if (!session?.user) {
      return;
    }


    /*
     * An existing Auth session is not sufficient by itself.
     *
     * Resolve the canonical member context before allowing
     * access to the application.
     */

    await verifyMemberContext();


    /*
     * Existing valid session.
     */

    redirectToDashboard();

  }


  catch (error) {

    console.warn(
      "CHAMA LIVE: existing session is not usable",
      error
    );


    /*
     * Remove an unusable session.
     */

    try {

      await supabase.auth.signOut();

    }

    catch (signOutError) {

      console.warn(
        "CHAMA LIVE: existing-session cleanup failed",
        signOutError
      );

    }

  }

}


/* =========================================================
   FORM
========================================================= */

if (!form) {

  console.error(
    "CHAMA LIVE: loginForm was not found."
  );

}

else {

  form.addEventListener(
    "submit",
    function (event) {

      event.preventDefault();

      performLogin();

    }
  );

}


/* =========================================================
   INITIALIZE
========================================================= */

checkExistingSession();


console.log(
  "CHAMA LIVE: login.js ready — canonical authentication flow enabled"
);

