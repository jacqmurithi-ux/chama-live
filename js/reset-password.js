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
   Verified recovery session
          ↓
   User enters new password
          ↓
   getUser()
          ↓
   supabase.auth.updateUser()
          ↓
   Password updated
          ↓
   Local recovery session sign-out
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

let recoveryReady =
  false;

let recoveryFlowEstablished =
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
      "CHAMA LIVE: unable to clean recovery URL"
    );

  }

}


/* =========================================================
   VERIFY AUTHENTICATED USER
========================================================= */

async function verifyRecoveryUser() {

  const {
    data,
    error
  } =
    await supabase.auth.getUser();


  if (error) {

    throw error;

  }


  if (!data?.user) {

    recoveryReady =
      false;

    recoveryFlowEstablished =
      false;

    throw new Error(
      "Your password reset session is no longer valid. Please request a new password reset link."
    );

  }


  return data.user;

}


/* =========================================================
   ESTABLISH RECOVERY SESSION
========================================================= */

async function establishRecoverySession() {

  /*
   * CHAMA LIVE intentionally uses:
   *
   * detectSessionInUrl: false
   *
   * therefore the PKCE recovery code must be
   * explicitly exchanged here.
   *
   * An arbitrary existing browser session is
   * NOT accepted as proof of a recovery flow.
   */

  const code =
    getRecoveryCode();


  /*
   * A recovery flow must begin with the
   * authorization code.
   */

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


  /*
   * Confirm that Auth recognizes an actual
   * authenticated user after the PKCE exchange.
   */

  await verifyRecoveryUser();


  recoveryReady =
    true;

  recoveryFlowEstablished =
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
      "CHAMA LIVE: recovery session error"
    );


    disableResetForm(
      error?.message ||
      "This password reset link is invalid or has expired. Please request a new password reset link."
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
   * A password update requires an authenticated
   * user. Confirm the session still exists.
   */

  const {
    data,
    error
  } =
    await supabase.auth.getSession();


  if (error) {

    throw error;

  }


  /*
   * If the session disappeared after initial
   * recovery, the recovery authorization is
   * no longer valid.
   *
   * Do NOT accept an arbitrary existing session.
   */

  if (
    !data?.session
  ) {

    recoveryReady =
      false;

    recoveryFlowEstablished =
      false;

    throw new Error(
      "Your password reset session is no longer valid. Please request a new password reset link."
    );

  }


  if (
    !recoveryReady ||
    !recoveryFlowEstablished
  ) {

    throw new Error(
      "Your password reset session is no longer valid. Please request a new password reset link."
    );

  }


  /*
   * Verify the authenticated user with the
   * Supabase Auth server immediately before
   * changing the password.
   */

  await verifyRecoveryUser();


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
          error?.message ||
          "Please enter a valid password."
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
         * Establish the recovery flow if it
         * has not already been established.
         */

        if (
          !recoveryReady ||
          !recoveryFlowEstablished
        ) {

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
             * End only the current recovery
             * session before returning to login.
             *
             * This avoids signing the user out
             * on other devices.
             */

            try {

              const {
                error: signOutError
              } =
                await supabase.auth.signOut({
                  scope:
                    "local"
                });


              if (signOutError) {

                console.warn(
                  "CHAMA LIVE: sign out after password reset failed"
                );

              }

            }

            catch (signOutError) {

              console.warn(
                "CHAMA LIVE: sign out after password reset failed"
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
          "CHAMA LIVE: password update failed"
        );


        let message =
          error?.message ||
          "Unable to update your password.";


        const lower =
          message.toLowerCase();


        /*
         * Same-password response.
         */

        if (
          error?.code ===
            "same_password" ||
          lower.includes(
            "same password"
          )
        ) {

          message =
            "Please choose a different password.";

        }


        /*
         * Recovery/session failures.
         *
         * Do not classify every generic
         * "invalid" error as an expired link.
         */

        else if (
          error?.code ===
            "invalid_token" ||
          error?.code ===
            "session_not_found" ||
          error?.code ===
            "refresh_token_not_found" ||
          lower.includes(
            "jwt"
          ) ||
          lower.includes(
            "session"
          ) ||
          lower.includes(
            "expired"
          )
        ) {

          message =
            "Your password reset session has expired or is no longer valid. Please request a new password reset link.";

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

const {
  data: authListener
} =
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

          recoveryFlowEstablished =
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
