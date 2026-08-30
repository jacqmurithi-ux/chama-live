/* =========================================================
   CHAMA LIVE — FORGOT PASSWORD

   File:
   /js/forgot-password.js

   Supabase Auth password recovery.

   Flow:

   forgot-password.html
          ↓
   resetPasswordForEmail()
          ↓
   Supabase recovery email
          ↓
   /chama-live/reset-password.html
          ↓
   New password
          ↓
   Login
========================================================= */

import { supabase } from "./supabase.js";


console.log(
  "CHAMA LIVE: forgot-password.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const form =
  document.getElementById(
    "forgotPasswordForm"
  );

const email =
  document.getElementById(
    "email"
  );

const button =
  document.getElementById(
    "resetButton"
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
   CHAMA LIVE BASE URL
========================================================= */

/*
 * IMPORTANT:
 *
 * The application is hosted at:
 *
 * https://jacqmurithi-ux.github.io/chama-live/
 *
 * window.location.origin only returns:
 *
 * https://jacqmurithi-ux.github.io
 *
 * Therefore we must include /chama-live/.
 */

const BASE_URL =
  "https://jacqmurithi-ux.github.io/chama-live";


/* =========================================================
   PASSWORD RESET URL
========================================================= */

const RESET_URL =
  `${BASE_URL}/reset-password.html`;


console.log(
  "CHAMA LIVE: password reset redirect:",
  RESET_URL
);


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
   BUTTON LOADING
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
      ? "Sending..."
      : "Send Reset Link";

}


/* =========================================================
   NORMALIZE ERROR
========================================================= */

function getFriendlyError(
  error
) {

  const message =
    String(
      error?.message ||
      error ||
      "Unable to send password reset email."
    );


  const lower =
    message.toLowerCase();


  if (
    lower.includes(
      "rate limit"
    ) ||
    lower.includes(
      "too many requests"
    )
  ) {

    return (
      "Too many reset requests. " +
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
      "Unable to connect to Supabase. " +
      "Please check your internet connection and try again."
    );

  }


  if (
    lower.includes(
      "redirect"
    )
  ) {

    return (
      "Password reset redirect is not configured correctly in Supabase."
    );

  }


  return message;

}


/* =========================================================
   FORM CHECK
========================================================= */

if (!form) {

  console.error(
    "CHAMA LIVE: #forgotPasswordForm was not found."
  );

}
else {


  /* =======================================================
     SUBMIT
  ======================================================= */

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      clearMessages();


      /* ===================================================
         READ EMAIL
      =================================================== */

      const userEmail =
        String(
          email?.value ||
          ""
        )
          .trim()
          .toLowerCase();


      /* ===================================================
         VALIDATE EMAIL
      =================================================== */

      if (!userEmail) {

        showError(
          "Enter your registered email address."
        );

        email?.focus();

        return;

      }


      const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


      if (
        !emailPattern.test(
          userEmail
        )
      ) {

        showError(
          "Enter a valid email address."
        );

        email?.focus();

        return;

      }


      /* ===================================================
         LOADING
      =================================================== */

      setLoading(
        true
      );


      try {

        console.log(
          "CHAMA LIVE: requesting password reset",
          {
            email:
              userEmail,

            redirectTo:
              RESET_URL
          }
        );


        /* =================================================
           SUPABASE PASSWORD RESET
        ================================================= */

        const {
          data,
          error
        } =
          await supabase.auth
            .resetPasswordForEmail(
              userEmail,
              {
                redirectTo:
                  RESET_URL
              }
            );


        console.log(
          "CHAMA LIVE: reset request response",
          {
            data,
            error
          }
        );


        /* =================================================
           HANDLE ERROR
        ================================================= */

        if (error) {

          throw error;

        }


        /* =================================================
           SUCCESS
        ================================================= */

        showSuccess(
          "Password reset email sent. Check your inbox and spam folder, then click the reset link."
        );


        console.log(
          "CHAMA LIVE: password reset email sent successfully"
        );


        /*
         * Keep the email in the field.
         *
         * This makes it easier for the user
         * to request another link if necessary.
         */

      }

      catch (error) {

        console.error(
          "CHAMA LIVE: password reset failed",
          error
        );


        showError(
          getFriendlyError(
            error
          )
        );

      }

      finally {

        setLoading(
          false
        );

      }

    }
  );

}


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: password recovery system ready"
);
