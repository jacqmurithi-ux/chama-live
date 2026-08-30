/* =========================================================
   CHAMA LIVE — RESET PASSWORD

   File:
   /js/reset-password.js

   Flow:

   Supabase recovery email
          ↓
   /chama-live/reset-password.html
          ↓
   Supabase recovery session
          ↓
   User enters new password
          ↓
   supabase.auth.updateUser()
          ↓
   Password updated
          ↓
   Redirect to login.html
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
   BASE URL
========================================================= */

const BASE_URL =
  "https://jacqmurithi-ux.github.io/chama-live";


const LOGIN_URL =
  `${BASE_URL}/login.html`;


/* =========================================================
   STATE
========================================================= */

let recoveryReady =
  false;

let passwordUpdated =
  false;


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
   GET URL PARAMETERS
========================================================= */

function inspectUrl() {

  const url =
    new URL(
      window.location.href
    );


  const params =
    url.searchParams;


  const hash =
    window.location.hash;


  console.log(
    "CHAMA LIVE: reset URL",
    {
      pathname:
        url.pathname,

      search:
        url.search,

      hash:
        hash
    }
  );


  /*
   * Supabase recovery links may contain
   * access_token / refresh_token in the hash.
   */

  if (
    hash &&
    hash.includes(
      "access_token="
    )
  ) {

    console.log(
      "CHAMA LIVE: recovery tokens detected in URL hash"
    );

    return true;

  }


  /*
   * Supabase may redirect using query
   * parameters such as code.
   */

  if (
    params.get(
      "code"
    )
  ) {

    console.log(
      "CHAMA LIVE: recovery code detected"
    );

    return true;

  }


  /*
   * Some recovery links use type=recovery.
   */

  if (
    params.get(
      "type"
    ) ===
    "recovery"
  ) {

    console.log(
      "CHAMA LIVE: recovery type detected"
    );

    return true;

  }


  return false;

}


/* =========================================================
   ESTABLISH RECOVERY SESSION
========================================================= */

async function establishRecoverySession() {

  /*
   * First check whether Supabase already
   * has a session.
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
    data?.session
  ) {

    console.log(
      "CHAMA LIVE: recovery session already available"
    );

    recoveryReady =
      true;

    return data.session;

  }


  /*
   * Inspect URL.
   */

  const hasRecoveryData =
    inspectUrl();


  if (!hasRecoveryData) {

    throw new Error(
      "This password reset link is missing or has expired. Please request a new password reset link."
    );

  }


  /*
   * Supabase JS normally handles the
   * recovery URL and establishes the session
   * through the auth state listener.
   *
   * Wait briefly for that process.
   */

  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        700
      )
  );


  const {
    data: retryData,
    error: retryError
  } =
    await supabase.auth.getSession();


  if (retryError) {

    throw retryError;

  }


  if (
    retryData?.session
  ) {

    console.log(
      "CHAMA LIVE: recovery session established"
    );

    recoveryReady =
      true;

    return retryData.session;

  }


  /*
   * Handle OAuth-style `code` recovery
   * if present.
   */

  const url =
    new URL(
      window.location.href
    );

  const code =
    url.searchParams.get(
      "code"
    );


  if (code) {

    console.log(
      "CHAMA LIVE: exchanging recovery code"
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
      exchangeData?.session
    ) {

      recoveryReady =
        true;

      return exchangeData.session;

    }

  }


  throw new Error(
    "Your password reset session could not be established. Please request a new reset link."
  );

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


    showError(
      error?.message ||
      "This password reset link is invalid or has expired. Please request a new one."
    );


    if (button) {

      button.disabled =
        true;

      button.textContent =
        "Reset Link Invalid";

    }

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
   * Make absolutely sure a recovery
   * session exists before updating.
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

    /*
     * Try establishing it again.
     */

    await establishRecoverySession();

  }


  /*
   * Update the authenticated user's
   * password.
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


  console.log(
    "CHAMA LIVE: password updated successfully",
    updateData.user.id
  );


  passwordUpdated =
    true;

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
         VALIDATE
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
         * Make sure recovery session exists.
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
         * Give the user a moment to see
         * the success message.
         */

        setTimeout(
          async () => {

            /*
             * Sign out the recovery session
             * before returning to login.
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
          lower.includes(
            "session"
          ) ||
          lower.includes(
            "jwt"
          ) ||
          lower.includes(
            "expired"
          )
        ) {

          message =
            "Your password reset link has expired. Please request a new password reset link.";

        }


        else if (
          lower.includes(
            "same password"
          )
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
  async (
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


    if (
      event ===
      "SIGNED_IN" &&
      session
    ) {

      /*
       * If this page was opened from a
       * recovery link, the session is valid.
       */

      const url =
        new URL(
          window.location.href
        );


      if (
        url.searchParams.get(
          "type"
        ) ===
        "recovery"
      ) {

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
