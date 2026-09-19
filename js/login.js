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
   auth.js / getMyApplicationContext()
        ↓
   Portal authorization
        ↓
   Admin Portal OR Member Portal

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
  getMyMember,
  getMyApplicationContext
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
   DESTINATIONS
========================================================= */

const ADMIN_DASHBOARD_URL =
  `${BASE_URL}/dashboard.html`;


const MEMBER_DASHBOARD_URL =
  `${BASE_URL}/member-dashboard.html`;


/* =========================================================
   PORTAL ROLES
========================================================= */

const ADMIN_ROLES =
  new Set([
    "admin",
    "chairperson",
    "secretary",
    "treasurer"
  ]);


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


  if (
    lower.includes(
      "not authorized"
    ) ||
    lower.includes(
      "unsupported role"
    )
  ) {

    return (
      "Your CHAMA LIVE account does not have a valid portal role. " +
      "Please contact your group administrator."
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
        member.role ||
        null,

      status:
        member.status ||
        null
    }
  );


  return member;

}


/* =========================================================
   PORTAL DESTINATION
========================================================= */

/*
 * Portal routing uses the canonical application context
 * from auth.js.
 *
 * Role meanings:
 *
 *     member
 *         → Member Portal
 *
 *     admin
 *     chairperson
 *     secretary
 *     treasurer
 *         → Admin Portal
 *
 *     isOwner
 *         → Admin Portal
 *
 * The OWNER concept remains separate from members.role.
 * No OWNER role is invented here.
 */

function getPortalDestination(
  context
) {

  if (!context) {

    throw new Error(
      "Unable to resolve your CHAMA LIVE application context."
    );

  }


  const role =
    String(
      context.role ||
      ""
    )
      .trim()
      .toLowerCase();


  const isOwner =
    context.isOwner === true;


  if (
    isOwner ||
    ADMIN_ROLES.has(
      role
    )
  ) {

    return ADMIN_DASHBOARD_URL;

  }


  if (
    role === "member"
  ) {

    return MEMBER_DASHBOARD_URL;

  }


  throw new Error(
    "Your CHAMA LIVE account does not have a valid portal role."
  );

}


/* =========================================================
   REDIRECT TO PORTAL
========================================================= */

async function redirectToPortal() {

  /*
   * auth.js remains the canonical source for:
   *
   *     user
   *     member
   *     group
   *     owner
   *     role
   *
   * Do not calculate portal role from URL parameters,
   * localStorage, or a second members-table query.
   */

  const context =
    await getMyApplicationContext();


  const destination =
    getPortalDestination(
      context
    );


  console.log(
    "CHAMA LIVE: portal destination resolved",
    {
      role:
        context?.role ||
        null,

      isOwner:
        context?.isOwner === true,

      destination
    }
  );


  window.location.replace(
    destination
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
       RESOLVE PORTAL
    ===================================================== */

    showSuccess(
      "Checking your CHAMA LIVE portal..."
    );


    /*
     * Resolve the canonical application context before
     * redirecting.
     *
     * This determines whether the authenticated account
     * belongs in the Admin Portal or Member Portal.
     */

    const context =
      await getMyApplicationContext();


    /*
     * Resolve the destination before clearing the password
     * so an invalid/unsupported role is handled by the
     * existing login error path.
     */

    const destination =
      getPortalDestination(
        context
      );


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


    console.log(
      "CHAMA LIVE: authenticated portal resolved",
      {
        role:
          context?.role ||
          null,

        isOwner:
          context?.isOwner === true,

        destination
      }
    );


    /*
     * The destination is determined from canonical auth
     * context. Group context is never passed through the URL.
     */

    window.location.replace(
      destination
    );

  }


  catch (error) {

    console.error(
      "CHAMA LIVE: login failed",
      error
    );


    /*
     * If authentication succeeded but member/context
     * resolution failed, remove the unusable session before
     * returning to the login screen.
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
     * Resolve the canonical application context and send
     * the user to the appropriate portal.
     */

    const context =
      await getMyApplicationContext();


    const destination =
      getPortalDestination(
        context
      );


    console.log(
      "CHAMA LIVE: existing session portal resolved",
      {
        role:
          context?.role ||
          null,

        isOwner:
          context?.isOwner === true,

        destination
      }
    );


    window.location.replace(
      destination
    );

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
