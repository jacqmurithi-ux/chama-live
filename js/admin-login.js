/* =========================================================
   CHAMA LIVE — ADMIN LOGIN
   ---------------------------------------------------------
   Authority:
   - Supabase Auth handles credential authentication.
   - auth.js resolves the authenticated application context.
   - Owner OR management role may enter the admin portal.
   - Membership must be active.
   - Onboarding must be active.
   - No URL credentials.
   - No group_id supplied by the browser.
   ========================================================= */

import {
  signIn,
  getMyApplicationContext
} from "./auth.js";


/* =========================================================
   ALLOWED MANAGEMENT ROLES
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
   DOM REFERENCES
   ========================================================= */

const form = document.getElementById("adminLoginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const errorBox = document.getElementById("error");
const successBox = document.getElementById("success");


/* =========================================================
   BASIC PAGE VALIDATION
   ========================================================= */

if (!form || !emailInput || !passwordInput || !loginButton) {
  console.error(
    "CHAMA LIVE admin login: required login elements are missing."
  );
}


/* =========================================================
   MESSAGE HELPERS
   ========================================================= */

function clearMessages() {
  if (errorBox) {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  if (successBox) {
    successBox.hidden = true;
    successBox.textContent = "";
  }
}


function showError(message) {
  if (!errorBox) {
    console.error(message);
    return;
  }

  if (successBox) {
    successBox.hidden = true;
    successBox.textContent = "";
  }

  errorBox.textContent = message;
  errorBox.hidden = false;
}


function showSuccess(message) {
  if (!successBox) {
    console.info(message);
    return;
  }

  if (errorBox) {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  successBox.textContent = message;
  successBox.hidden = false;
}


/* =========================================================
   ERROR NORMALISATION
   ========================================================= */

function normalizeError(error) {
  const message = String(
    error?.message ||
    error?.error_description ||
    error ||
    ""
  ).trim();

  const lower = message.toLowerCase();

  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid credentials")
  ) {
    return "Invalid email or password.";
  }

  if (
    lower.includes("email not confirmed") ||
    lower.includes("email_not_confirmed")
  ) {
    return "Your email address has not been confirmed.";
  }

  if (
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    lower.includes("over_request_rate_limit")
  ) {
    return "Too many login attempts. Please wait a few minutes and try again.";
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network error") ||
    lower.includes("fetch")
  ) {
    return "Unable to connect to CHAMA LIVE. Check your internet connection and try again.";
  }

  if (
    lower.includes("missing") &&
    lower.includes("group")
  ) {
    return "Your account is not linked to a CHAMA LIVE group.";
  }

  if (
    lower.includes("not authorized") ||
    lower.includes("unauthorized") ||
    lower.includes("permission denied")
  ) {
    return "Your account is not authorized to access the Admin Portal.";
  }

  return message || "Unable to sign in. Please try again.";
}


/* =========================================================
   LOGIN
   ========================================================= */

async function performLogin() {
  clearMessages();

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!email) {
    showError("Enter your email address.");
    emailInput.focus();
    return;
  }

  if (!emailInput.checkValidity()) {
    showError("Enter a valid email address.");
    emailInput.focus();
    return;
  }

  if (!password) {
    showError("Enter your password.");
    passwordInput.focus();
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = "Signing In…";

  try {
    /* -------------------------------------------------------
       STEP 1 — AUTHENTICATE WITH SUPABASE
       ------------------------------------------------------- */

    await signIn(email, password);


    /* -------------------------------------------------------
       STEP 2 — RESOLVE AUTHORITATIVE APPLICATION CONTEXT

       The authenticated Supabase user is the authority.

       group_id, role and ownership are NOT taken from:
       - URL parameters
       - localStorage
       - form fields
       - client-supplied values
       ------------------------------------------------------- */

    const context = await getMyApplicationContext();

    const user = context?.user;
    const member = context?.member;
    const group = context?.group;

    if (!user) {
      throw new Error(
        "Authenticated user could not be resolved."
      );
    }

    if (!member) {
      throw new Error(
        "Your account is not linked to a CHAMA LIVE member record."
      );
    }

    if (!group) {
      throw new Error(
        "Your account is not linked to a CHAMA LIVE group."
      );
    }


    /* -------------------------------------------------------
       STEP 3 — AUTHORIZE ADMIN / MANAGEMENT ACCESS
       ------------------------------------------------------- */

    const role = String(
      context?.role ||
      member?.role ||
      ""
    )
      .trim()
      .toLowerCase();

    const isOwner = context?.isOwner === true;

    const hasManagementRole = ADMIN_ROLES.has(role);

    if (!isOwner && !hasManagementRole) {
      throw new Error(
        "Your account is not authorized to access the Admin Portal."
      );
    }


    /* -------------------------------------------------------
       STEP 4 — REQUIRE ACTIVE MEMBERSHIP
       ------------------------------------------------------- */

    const memberStatus = String(
      member?.status || ""
    )
      .trim()
      .toLowerCase();

    if (memberStatus !== "active") {
      throw new Error(
        "Your member account is not active."
      );
    }


    /* -------------------------------------------------------
       STEP 5 — REQUIRE ACTIVE ONBOARDING
       ------------------------------------------------------- */

    const onboardingStatus = String(
      member?.onboarding_status || ""
    )
      .trim()
      .toLowerCase();

    if (onboardingStatus !== "active") {
      throw new Error(
        "Your account onboarding is not active. Please complete account onboarding before using the Admin Portal."
      );
    }


    /* -------------------------------------------------------
       STEP 6 — SUCCESS
       ------------------------------------------------------- */

    showSuccess("Sign in successful. Opening Admin Portal…");

    /*
      Give the browser a moment to persist the Supabase session
      before navigating to the protected dashboard.
    */
    await new Promise((resolve) => {
      window.setTimeout(resolve, 250);
    });

    window.location.replace("dashboard.html");

  } catch (error) {
    console.error(
      "CHAMA LIVE admin login failed:",
      error
    );

    showError(normalizeError(error));

  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Sign In";
  }
}


/* =========================================================
   FORM SUBMISSION
   ========================================================= */

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    await performLogin();
  });
}


/* =========================================================
   ENTER-KEY / FIELD BEHAVIOUR
   ========================================================= */

if (emailInput) {
  emailInput.addEventListener("input", () => {
    if (errorBox && !errorBox.hidden) {
      clearMessages();
    }
  });
}

if (passwordInput) {
  passwordInput.addEventListener("input", () => {
    if (errorBox && !errorBox.hidden) {
      clearMessages();
    }
  });
}


/* =========================================================
   INITIAL STATE
   ========================================================= */

clearMessages();
