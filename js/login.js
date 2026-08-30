/* =========================================================
   CHAMA LIVE — LOGIN

   File:
   /js/login.js

   Features:
   - Supabase email/password login
   - Session verification before redirect
   - Forgot password link
   - Safe URL parameter handling
   - Clear error messages
   - Prevents redirect loops
   - Compatible with auth.js
========================================================= */

import {
  supabase,
  BASE_URL
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


/* =========================================================
   SHOW ERROR
========================================================= */

function showError(
  message
) {

  const cleanMessage =
    String(
      message ||
      "Unable to sign in."
    );


  console.error(
    "CHAMA LIVE: login error:",
    cleanMessage
  );


  if (!errorBox) {

    alert(
      cleanMessage
    );

    return;

  }


  errorBox.textContent =
    cleanMessage;

  errorBox.hidden =
    false;

}


/* =========================================================
   CLEAR ERROR
========================================================= */

function clearError() {

  if (!errorBox) {
    return;
  }


  errorBox.textContent =
    "";

  errorBox.hidden =
    true;

}


/* =========================================================
   SET BUTTON STATE
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
   NORMALIZE AUTH ERROR
========================================================= */

function normalizeLoginError(
  error
) {

  let message =
    error?.message ||
    String(error || "");


  const lower =
    message.toLowerCase();


  /*
   * Invalid credentials.
   */

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


  /*
   * Email not confirmed.
   */

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


  /*
   * Too many attempts.
   */

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


  /*
   * Network problem.
   */

  if (
    lower.includes(
      "failed to fetch"
    ) ||
    lower.includes(
      "network"
    )
  ) {

    return (
      "Unable to connect to the server. " +
      "Please check your internet connection and try again."
    );

  }


  return (
    message ||
    "Unable to sign in."
  );

}


/* =========================================================
   READ URL PARAMETERS
========================================================= */

function loadUrlParameters() {

  const params =
    new URLSearchParams(
      window.location.search
    );


  const urlEmail =
    params.get(
      "email"
    );


  /*
   * IMPORTANT:
   * Do NOT read password from the URL.
   *
   * Passwords should never be placed
   * in a URL because they can appear in:
   * - browser history
   * - server logs
   * - analytics
   * - shared links
   */


  if (
    urlEmail &&
    emailInput
  ) {

    emailInput.value =
      urlEmail
        .trim()
        .toLowerCase();

  }


  /*
   * Remove query parameters from
   * browser address bar.
   */

  if (
    window.history &&
    window.history.replaceState
  ) {

    const cleanUrl =
      `${BASE_URL}/login.html`;

    window.history.replaceState(
      {},
      document.title,
      cleanUrl
    );

  }

}


/* =========================================================
   VERIFY SESSION
========================================================= */

async function verifySession() {

  const {
    data,
    error
  } =
    await supabase.auth.getSession();


  if (error) {

    console.error(
      "CHAMA LIVE: session check failed",
      error
    );

    return null;

  }


  return (
    data?.session ||
    null
  );

}


/* =========================================================
   REDIRECT TO DASHBOARD
========================================================= */

function redirectToDashboard() {

  console.log(
    "CHAMA LIVE: redirecting to dashboard"
  );


  window.location.replace(
    `${BASE_URL}/dashboard.html`
  );

}


/* =========================================================
   CHECK EXISTING SESSION
========================================================= */

async function checkExistingSession() {

  try {

    const session =
      await verifySession();


    if (!session) {
      return;
    }


    console.log(
      "CHAMA LIVE: existing session found",
      session.user?.id
    );


    /*
     * User is already authenticated.
     *
     * Do not force them to log in again.
     */

    redirectToDashboard();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: existing session check failed",
      error
    );

  }

}


/* =========================================================
   LOGIN
========================================================= */

async function performLogin() {

  clearError();


  if (!emailInput) {

    showError(
      "The email field could not be found."
    );

    return;

  }


  if (!passwordInput) {

    showError(
      "The password field could not be found."
    );

    return;

  }


  const email =
    emailInput.value
      .trim()
      .toLowerCase();


  const password =
    passwordInput.value;


  /* =======================================================
     VALIDATION
  ======================================================= */

  if (!email) {

    showError(
      "Please enter your email address."
    );

    emailInput.focus();

    return;

  }


  const emailPattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


  if (
    !emailPattern.test(
      email
    )
  ) {

    showError(
      "Please enter a valid email address."
    );

    emailInput.focus();

    return;

  }


  if (!password) {

    showError(
      "Please enter your password."
    );

    passwordInput.focus();

    return;

  }


  /* =======================================================
     LOADING
  ======================================================= */

  setLoading(
    true
  );


  try {

    console.log(
      "CHAMA LIVE: signing in",
      {
        email
      }
    );


    /* =====================================================
       SUPABASE LOGIN
    ===================================================== */

    const {
      data,
      error
    } =
      await supabase.auth.signInWithPassword({

        email,

        password

      });


    if (error) {

      throw error;

    }


    /*
     * Supabase must return both
     * user and session.
     */

    if (
      !data?.user ||
      !data?.session
    ) {

      throw new Error(
        "Login was not completed. No active session was created."
      );

    }


    console.log(
      "CHAMA LIVE: password accepted"
    );


    console.log(
      "CHAMA LIVE: authenticated user",
      data.user.id
    );


    /* =====================================================
       VERIFY SESSION
    ===================================================== */

    const session =
      await verifySession();


    if (!session) {

      throw new Error(
        "Login succeeded, but the session could not be stored. Please try again."
      );

    }


    if (
      session.user?.id !==
      data.user.id
    ) {

      throw new Error(
        "The authenticated session could not be verified."
      );

    }


    console.log(
      "CHAMA LIVE: session verified successfully"
    );


    /* =====================================================
       CLEAR PASSWORD
    ===================================================== */

    if (passwordInput) {

      passwordInput.value =
        "";

    }


    /* =====================================================
       REDIRECT
    ===================================================== */

    redirectToDashboard();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: sign in failed",
      error
    );


    const message =
      normalizeLoginError(
        error
      );


    showError(
      message
    );


    setLoading(
      false
    );

  }

}


/* =========================================================
   FORM SUBMIT
========================================================= */

if (!form) {

  console.error(
    "CHAMA LIVE: #loginForm was not found."
  );

}

else {

  form.addEventListener(
    "submit",
    event => {

      event.preventDefault();

      performLogin();

    }
  );

}


/* =========================================================
   PASSWORD ENTER KEY
========================================================= */

if (passwordInput) {

  passwordInput.addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
        "Enter"
      ) {

        event.preventDefault();

        if (
          form
        ) {

          form.requestSubmit();

        }

      }

    }
  );

}


/* =========================================================
   INITIALIZE
========================================================= */

loadUrlParameters();

checkExistingSession();


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: login.js ready"
);
