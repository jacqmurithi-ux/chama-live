/* =========================================================
   CHAMA LIVE — RESET PASSWORD

   File:
   /js/reset-password.js

   Flow:

   Supabase recovery email
          ↓
   /reset-password.html
          ↓
   PKCE recovery code
          ↓
   exchangeCodeForSession()
          ↓
   Recovery session
          ↓
   User enters new password
          ↓
   supabase.auth.updateUser()
          ↓
   Password updated
          ↓
   Sign out recovery session
          ↓
   login.html
========================================================= */

import { supabase } from "./supabase.js";

console.log(
  "CHAMA LIVE: reset-password.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const form =
  document.getElementById(
    "resetPasswordForm"
  );

const password =
  document.getElementById(
    "password"
  );

const confirmPassword =
  document.getElementById(
    "confirmPassword"
  );

const button =
  document.getElementById(
    "resetPasswordButton"
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
   CHAMA LIVE PRODUCTION URL
========================================================= */

const BASE_URL =
  window.location.origin;

const LOGIN_URL =
  `${BASE_URL}/login.html`;


/* =========================================================
   STATE
========================================================= */

let recoveryReady = false;
let passwordUpdated = false;


/* =========================================================
   SHOW ERROR
========================================================= */

function showError(
  message
) {

  if (errorBox) {

    errorBox.hidden =
      false;

    errorBox.textContent =
      message;

  }

  if (successBox) {

    successBox.hidden =
      true;

    successBox.textContent =
      "";

  }

}


/* =========================================================
   SHOW SUCCESS
========================================================= */

function showSuccess(
  message
) {

  if (successBox) {

    successBox.hidden =
      false;

    successBox.textContent =
      message;

  }

  if (errorBox) {

    errorBox.hidden =
      true;

    errorBox.textContent =
      "";

  }

}


/* =========================================================
   CLEAR MESSAGES
========================================================= */

function clearMessages() {

  if (errorBox) {

    errorBox.hidden =
      true;

    errorBox.textContent =
      "";

  }

  if (successBox) {

    successBox.hidden =
      true;

    successBox.textContent =
      "";

  }

}


/* =========================================================
   BUTTON STATE
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
      ? "Updating..."
      : "Update Password";

}


/* =========================================================
   INVALID RECOVERY STATE
========================================================= */

function disableResetForm(
  message
) {

  showError(
    message
  );

  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Reset Link Invalid";

  }

}


/* =========================================================
   INSPECT RECOVERY URL
========================================================= */

function getRecoveryCode() {

  const url =
    new URL(
      window.location.href
    );

  const code =
    url.searchParams.get(
      "code"
    );

  console.log(
    "CHAMA LIVE: reset URL inspected",
    {
      pathname:
        url.pathname,

      hasCode:
        Boolean(code),

      hashPresent:
        Boolean(window.location.hash)
    }
  );

  return code;
}


/* =========================================================
   CLEAR AUTH CODE FROM ADDRESS BAR
========================================================= */

function cleanRecoveryUrl() {

  try {

    const cleanUrl =
      `${window.location.origin}${window.location.pathname}`;

    window.history.replaceState(
      {},
      document.title,
      cleanUrl
    );

  }

  catch (error) {

    console.warn(
      "CHAMA LIVE: unable to clean recovery URL",
      error
    );

  }

}


/* =========================================================
   ESTABLISH RECOVERY SESSION
========================================================= */

async function establishRecoverySession() {

  /*
   * Because supabase.js intentionally uses:
   *
   * detectSessionInUrl: false
   *
   * we must explicitly handle the PKCE
   * recovery code here.
   */

  const {
    data: existingData,
    error: existingError
  } =
    await supabase.auth.getSession();


  if (existingError) {

    throw existingError;

  }


  /*
   * A recovery session may already exist.
   */

  if (
    existingData?.session
  ) {

    console.log(
      "CHAMA LIVE: existing recovery session available"
    );

    recoveryReady =
      true;

    return existingData.session;

  }


  /*
   * No session exists.
   *
   * Look for the PKCE authorization code.
   */

  const code =
    getRecoveryCode();


  if (!code) {

    throw new Error(
      "This password reset link is missing or has expired. Please request a new password reset link."
    );

  }


  console.log(
    "CHAMA LIVE: exchanging password recovery code"
  );


  const {
    data: exchangeData,
    error: exchangeError
  } =
    await supabase.auth.exchangeCodeForSession(
      code
    );


  if (exchangeError) {

    throw exchangeError;

  }


  if (
    !exchangeData?.session
  ) {

    throw new Error(
      "Your password reset session could not be established. Please request a new password reset link."
    );

  }


  recoveryReady =
    true;


  /*
   * The authorization code is no longer
   * needed after successful exchange.
   *
   * Remove it from the visible URL.
   */

  cleanRecoveryUrl();


  console.log(
    "CHAMA LIVE: password recovery session established"
  );


  return exchangeData.session;

}


/* =========================================================
   CHECK RECOVERY SESSION
========================================================= */

async function checkRecoverySession() {

  try {

    await establishRecoverySession();

    console.log(
      "CHAMA LIVE: password recovery session ready"
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: recovery session error",
      error
    );


    disableResetForm(
      error?.message ||
      "This password reset link is invalid or has expired. Please request a new one."
    );

  }

}


/* =========================================================
   FORM VALIDATION
========================================================= */

function validatePassword(
  newPassword,
  confirm
) {

  if (
    newPassword.length <
    8
  ) {

    throw new Error(
      "Password must contain at least 8 characters."
    );

  }


  if (
    newPassword !==
    confirm
  ) {

    throw new Error(
      "Passwords do not match."
    );

  }

}


/* =========================================================
   UPDATE PASSWORD
========================================================= */

async function updatePassword(
  newPassword
) {

  /*
   * Confirm that a valid recovery session
   * still exists immediately before updating.
   */

  const {
    data,
    error
  } =
    await supabase.auth.getSession();


  if (error) {

    throw error;

  }


  if (
    !data?.session
  ) {

    recoveryReady =
      false;

    await establishRecoverySession();

  }


  if (!recoveryReady) {

    throw new Error(
      "Your password reset session is no longer valid. Please request a new password reset link."
    );

  }


  /*
   * Update the authenticated user's password.
   */

  const {
    data: updateData,
    error: updateError
  } =
    await supabase.auth.updateUser({
      password:
        newPassword
    });


  if (updateError) {

    throw updateError;

  }


  if (
    !updateData?.user
  ) {

    throw new Error(
      "Password update was not completed."
    );

  }


  passwordUpdated =
    true;


  console.log(
    "CHAMA LIVE: password updated successfully"
  );

}


/* =========================================================
   HANDLE FORM
========================================================= */

if (!form) {

  console.error(
    "CHAMA LIVE: #resetPasswordForm was not found."
  );

}
else {

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      if (passwordUpdated) {

        return;

      }


      clearMessages();


      const newPassword =
        String(
          password?.value ||
          ""
        );


      const confirm =
        String(
          confirmPassword?.value ||
          ""
        );


      /* ===================================================
         VALIDATE PASSWORD
      =================================================== */

      try {

        validatePassword(
          newPassword,
          confirm
        );

      }

      catch (error) {

        showError(
          error.message
        );

        return;

      }


      /* ===================================================
         LOADING
      =================================================== */

      setLoading(
        true
      );


      try {

        /*
         * Establish or verify the recovery
         * session before changing the password.
         */

        if (!recoveryReady) {

          await establishRecoverySession();

        }


        /*
         * Update password.
         */

        await updatePassword(
          newPassword
        );


        /* =================================================
           SUCCESS
        ================================================= */

        showSuccess(
          "Your password has been updated successfully. Redirecting to sign in..."
        );


        /*
         * Clear password fields.
         */

        if (password) {

          password.value =
            "";

        }


        if (confirmPassword) {

          confirmPassword.value =
            "";

        }


        /*
         * Give the user time to see the
         * success message.
         */

        setTimeout(
          async () => {

            /*
             * End the recovery session before
             * returning to the normal login page.
             */

            try {

              await supabase.auth.signOut();

            }

            catch (signOutError) {

              console.warn(
                "CHAMA LIVE: sign out after password reset failed",
                signOutError
              );

            }


            window.location.replace(
              LOGIN_URL
            );

          },
          1500
        );

      }

      catch (error) {

        console.error(
          "CHAMA LIVE: password update failed",
          error
        );


        let message =
          error?.message ||
          "Unable to update your password.";


        const lower =
          message.toLowerCase();


        if (
          lower.includes("session") ||
          lower.includes("jwt") ||
          lower.includes("expired") ||
          lower.includes("invalid")
        ) {

          message =
            "Your password reset link has expired or is no longer valid. Please request a new password reset link.";

        }

        else if (
          lower.includes("same password")
        ) {

          message =
            "Please choose a different password.";

        }


        showError(
          message
        );


        setLoading(
          false
        );

      }

    }
  );

}


/* =========================================================
   AUTH STATE LISTENER
========================================================= */

supabase.auth.onAuthStateChange(
  (
    event,
    session
  ) => {

    console.log(
      "CHAMA LIVE: auth state changed",
      event
    );


    if (
      event ===
      "PASSWORD_RECOVERY"
    ) {

      console.log(
        "CHAMA LIVE: PASSWORD_RECOVERY event received"
      );


      if (session) {

        recoveryReady =
          true;

      }

    }

  }
);


/* =========================================================
   START
========================================================= */

checkRecoverySession();


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: reset password system ready"
);
