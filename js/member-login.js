import { supabase } from "./supabase.js";

import {
  signIn,
  getMyApplicationContext
} from "./auth.js";

const ADMIN_ROLES = new Set([
  "admin",
  "chairperson",
  "secretary",
  "treasurer"
]);

const form = document.getElementById("memberLoginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const button = document.getElementById("loginButton");
const errorBox = document.getElementById("error");
const successBox = document.getElementById("success");

let loginInProgress = false;

function showError(message) {
  if (!errorBox) return;

  errorBox.textContent = message;
  errorBox.hidden = false;

  if (successBox) {
    successBox.textContent = "";
    successBox.hidden = true;
  }
}

function clearMessages() {
  if (errorBox) {
    errorBox.textContent = "";
    errorBox.hidden = true;
  }

  if (successBox) {
    successBox.textContent = "";
    successBox.hidden = true;
  }
}

function setLoading(loading) {
  if (!button) return;

  button.disabled = loading;
  button.textContent = loading
    ? "Signing in..."
    : "Sign In";
}

function normalizeError(error) {
  const message = String(
    error?.message ||
    error ||
    ""
  ).trim();

  const lower = message.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "Incorrect email or password. Please check your details and try again.";
  }

  if (lower.includes("email not confirmed")) {
    return "Your email address has not been confirmed. Please check your email and confirm your account.";
  }

  if (lower.includes("too many requests")) {
    return "Too many login attempts. Please wait a few minutes and try again.";
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("network")
  ) {
    return "Unable to connect to CHAMA LIVE. Please check your internet connection.";
  }

  return message || "Unable to sign in.";
}

function validateCredentials() {
  const email = String(
    emailInput?.value || ""
  ).trim().toLowerCase();

  const password = String(
    passwordInput?.value || ""
  );

  if (!email) {
    throw new Error("Please enter your email address.");
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error("Please enter a valid email address.");
  }

  if (!password) {
    throw new Error("Please enter your password.");
  }

  return {
    email,
    password
  };
}

function getMemberStatus(context) {
  return String(
    context?.member?.status ||
    context?.status ||
    ""
  ).trim().toLowerCase();
}

function getOnboardingStatus(context) {
  return String(
    context?.member?.onboarding_status ||
    context?.onboarding_status ||
    ""
  ).trim().toLowerCase();
}

async function performLogin() {
  if (loginInProgress) return;

  loginInProgress = true;

  clearMessages();
  setLoading(true);

  try {
    const {
      email,
      password
    } = validateCredentials();

    await signIn(email, password);

    const context =
      await getMyApplicationContext();

    const role = String(
      context?.role || ""
    ).trim().toLowerCase();

    const isOwner =
      context?.isOwner === true;

    /*
     * Member Portal boundary:
     *
     * Ordinary members enter here.
     * Admin and management accounts
     * must use the Admin Portal.
     */
    if (
      isOwner ||
      ADMIN_ROLES.has(role)
    ) {
      await supabase.auth.signOut();

      throw new Error(
        "Access Denied. Your account is registered for the Admin Portal. Please use the Admin Login."
      );
    }

    if (role !== "member") {
      await supabase.auth.signOut();

      throw new Error(
        "Your CHAMA LIVE account does not have a valid portal role. Please contact your Group Admin."
      );
    }

    const status =
      getMemberStatus(context);

    const onboarding =
      getOnboardingStatus(context);

    if (
      status &&
      status !== "active"
    ) {
      await supabase.auth.signOut();

      throw new Error(
        "Your account is not yet verified. Please contact your Group Admin."
      );
    }

    if (
      onboarding &&
      onboarding !== "active"
    ) {
      await supabase.auth.signOut();

      throw new Error(
        "Your account is not yet verified. Please contact your Group Admin."
      );
    }

    window.location.replace(
      "member-dashboard.html"
    );
  } catch (error) {
    showError(
      normalizeError(error)
    );
  } finally {
    loginInProgress = false;
    setLoading(false);
  }
}

if (form) {
  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      performLogin();
    }
  );
}
