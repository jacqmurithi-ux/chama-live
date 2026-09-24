/* =========================================================
   CHAMA LIVE — PLATFORM ADMIN LOGIN

   RESPONSIBILITIES
   ---------------------------------------------------------
   - Authenticate through Supabase Auth.
   - Verify Platform Admin authorization server-side.
   - Route authorized Platform Admin users to:
       platform-admin.html
   - Reject authenticated users who are not Platform Admins.
   - Keep unauthorized users outside the Platform Admin portal.

   IMPORTANT
   ---------------------------------------------------------
   This file is intentionally independent from:

     - admin-login.js
     - member-login.js
     - admin-layout.js
     - member-dashboard.js
     - getMyApplicationContext()
     - getMyMember()
     - getMyGroup()
     - group roles
     - group ownership
     - group applications

   PLATFORM ADMIN AUTHORIZATION
   ---------------------------------------------------------
   Password authentication establishes the Supabase
   identity.

   Platform Admin authorization is established by the
   existing server-side function:

       get_platform_admin_overview()

   which internally enforces:

       is_platform_admin()

   No direct frontend query against platform_admins
   is performed.

   DATABASE MUTATION
   ---------------------------------------------------------
   None.

   GITHUB / REPOSITORY
   ---------------------------------------------------------
   Candidate only. No repository write is performed.
========================================================= */

import {
  supabase
} from "./supabase.js";


/* =========================================================
   DOM REFERENCES
========================================================= */

const form =
  document.getElementById(
    "platformAdminLoginForm"
  );

const emailInput =
  document.getElementById(
    "platformAdminEmail"
  );

const passwordInput =
  document.getElementById(
    "platformAdminPassword"
  );

const loginButton =
  document.getElementById(
    "platformAdminLoginButton"
  );

const passwordToggle =
  document.getElementById(
    "platformPasswordToggle"
  );

const errorBox =
  document.getElementById(
    "platformLoginError"
  );

const statusBox =
  document.getElementById(
    "platformLoginStatus"
  );


/* =========================================================
   STATE
========================================================= */

let loginInProgress =
  false;

let routingInProgress =
  false;


/* =========================================================
   ERROR DISPLAY
========================================================= */

function showError(
  message
) {

  if (!errorBox) {
    return;
  }

  errorBox.textContent =
    message;

  errorBox.hidden =
    false;

  if (statusBox) {

    statusBox.textContent =
      "";

    statusBox.hidden =
      true;

  }

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
   STATUS
========================================================= */

function showStatus(
  message
) {

  if (!statusBox) {
    return;
  }

  statusBox.textContent =
    message;

  statusBox.hidden =
    false;

}


/* =========================================================
   CLEAR STATUS
========================================================= */

function clearStatus() {

  if (!statusBox) {
    return;
  }

  statusBox.textContent =
    "";

  statusBox.hidden =
    true;

}


/* =========================================================
   LOADING STATE
========================================================= */

function setLoading(
  loading
) {

  if (!loginButton) {
    return;
  }

  loginButton.disabled =
    loading;

  loginButton.textContent =
    loading
      ? "Signing in..."
      : "Sign In";

}


/* =========================================================
   SAFE ERROR NORMALIZATION
   ---------------------------------------------------------
   Do not expose raw database/RPC errors to users.
========================================================= */

function normalizeError(
  error
) {

  const message =
    String(
      error?.message ||
      error ||
      ""
    )
      .trim();

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


  /*
   * Explicit Platform Admin authorization failure.
   */
  if (
    lower.includes(
      "platform admin access required"
    )
  ) {

    return (
      "This account does not have Platform Admin access. " +
      "Please use the portal registered for your account."
    );

  }


  /*
   * Do not expose arbitrary database/RPC messages.
   */
  return (
    "Unable to complete Platform Admin sign in. " +
    "Please try again or contact the system administrator."
  );

}


/* =========================================================
   CREDENTIAL VALIDATION
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
   SERVER-SIDE PLATFORM ADMIN AUTHORIZATION
   ---------------------------------------------------------
   This is the critical authorization boundary.

   The browser does NOT:
     - query platform_admins
     - inspect active
     - inspect user IDs
     - determine Platform Admin status locally

   The database function performs that authorization.
========================================================= */

async function verifyPlatformAdminAccess() {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_platform_admin_overview"
    );


  if (error) {

    throw error;

  }


  /*
   * The verified RPC returns one row.
   *
   * Accept both the normal Supabase array form and
   * a single object defensively.
   */
  let row =
    null;


  if (
    Array.isArray(data)
  ) {

    row =
      data[0] || null;

  }

  else if (
    data &&
    typeof data === "object"
  ) {

    row =
      data;

  }


  /*
   * A successful authorized RPC should return a row.
   */
  if (!row) {

    throw new Error(
      "Platform Admin authorization could not be verified."
    );

  }


  return row;

}


/* =========================================================
   SIGN OUT AFTER AUTHORIZATION FAILURE
   ---------------------------------------------------------
   Prevent an authenticated but unauthorized account from
   remaining signed in after being rejected.
========================================================= */

async function signOutAfterDeniedAccess() {

  try {

    await supabase.auth.signOut();

  }

  catch (error) {

    /*
     * The primary requirement is that access is not granted.
     * Do not expose this secondary sign-out error.
     */
    console.warn(
      "CHAMA LIVE: Platform Admin denial sign-out failed.",
      error
    );

  }

}


/* =========================================================
   ROUTE TO PLATFORM ADMIN
========================================================= */

function routeToPlatformAdmin() {

  if (routingInProgress) {
    return;
  }

  routingInProgress =
    true;

  window.location.replace(
    "platform-admin.html"
  );

}


/* =========================================================
   PERFORM LOGIN
========================================================= */

async function performLogin() {

  if (
    loginInProgress ||
    routingInProgress
  ) {

    return;

  }


  loginInProgress =
    true;

  clearError();
  clearStatus();
  setLoading(true);


  try {

    const {
      email,
      password
    } =
      validateCredentials();


    /*
     * Step 1:
     * Authenticate identity with Supabase Auth.
     */
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
     * Authentication must produce both user and session.
     */
    if (
      !data?.user ||
      !data?.session
    ) {

      throw new Error(
        "Sign in failed. No active session was created."
      );

    }


    /*
     * Step 2:
     * Verify Platform Admin authorization through the
     * existing server-side protected RPC.
     */
    showStatus(
      "Verifying Platform Admin access..."
    );


    try {

      await verifyPlatformAdminAccess();

    }

    catch (authorizationError) {

      /*
       * Never leave an unauthorized account authenticated
       * after Platform Admin access is denied.
       */
      await signOutAfterDeniedAccess();

      throw authorizationError;

    }


    /*
     * Step 3:
     * Only an account that successfully passed the
     * server-side authorization boundary reaches the
     * Platform Admin dashboard.
     */
    routeToPlatformAdmin();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: Platform Admin sign in failed.",
      error
    );

    showError(
      normalizeError(error)
    );

  }

  finally {

    loginInProgress =
      false;

    setLoading(false);

  }

}


/* =========================================================
   EXISTING SESSION CHECK
   ---------------------------------------------------------
   If a session already exists, do not assume it is a
   Platform Admin session.

   Re-run the server-side authorization check.
========================================================= */

async function checkExistingSession() {

  if (
    loginInProgress ||
    routingInProgress
  ) {

    return;

  }


  try {

    const {
      data,
      error
    } =
      await supabase.auth.getSession();


    if (error) {

      console.warn(
        "CHAMA LIVE: existing session check failed.",
        error
      );

      return;

    }


    const session =
      data?.session;


    if (
      !session?.user
    ) {

      return;

    }


    showStatus(
      "Checking your Platform Admin access..."
    );


    try {

      await verifyPlatformAdminAccess();

      routeToPlatformAdmin();

    }

    catch (authorizationError) {

      /*
       * Existing authenticated user is not authorized
       * for this portal. Remove the session before
       * returning to the login form.
       */
      await signOutAfterDeniedAccess();

      clearStatus();

      showError(
        normalizeError(
          authorizationError
        )
      );

    }

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: existing Platform Admin session check failed.",
      error
    );

    clearStatus();

  }

}


/* =========================================================
   PASSWORD VISIBILITY
========================================================= */

function togglePassword() {

  if (
    !passwordInput ||
    !passwordToggle
  ) {

    return;

  }


  const showing =
    passwordInput.type === "text";


  passwordInput.type =
    showing
      ? "password"
      : "text";


  passwordToggle.textContent =
    showing
      ? "Show"
      : "Hide";


  passwordToggle.setAttribute(
    "aria-label",
    showing
      ? "Show password"
      : "Hide password"
  );


  passwordToggle.setAttribute(
    "aria-pressed",
    showing
      ? "false"
      : "true"
  );

}


/* =========================================================
   FORM SUBMISSION
========================================================= */

if (form) {

  form.addEventListener(
    "submit",
    (event) => {

      event.preventDefault();

      performLogin();

    }
  );

}


/* =========================================================
   PASSWORD TOGGLE
========================================================= */

if (passwordToggle) {

  passwordToggle.addEventListener(
    "click",
    togglePassword
  );

}


/* =========================================================
   AUTH STATE CHANGE
   ---------------------------------------------------------
   This does not authorize the user.

   Authorization still occurs through the server-side RPC.
   The listener only prevents stale UI/session state.
========================================================= */

supabase.auth.onAuthStateChange(
  (event, session) => {

    if (
      event === "SIGNED_OUT"
    ) {

      routingInProgress =
        false;

      loginInProgress =
        false;

      clearStatus();

      setLoading(false);

      return;

    }


    /*
     * Do not automatically trust SIGNED_IN here.
     *
     * The explicit login flow performs the authorization
     * RPC. This listener therefore does not create a
     * second authorization path.
     */
    if (
      event === "TOKEN_REFRESHED" &&
      !session
    ) {

      routingInProgress =
        false;

    }

  }
);


/* =========================================================
   INITIAL SESSION CHECK
========================================================= */

checkExistingSession();
