/* =========================================================
   CHAMA LIVE — FORGOT PASSWORD

   File:
   /js/forgot-password.js

   Uses Supabase Auth directly.

   Flow:

   forgot-password.html
          ↓
   supabase.auth.resetPasswordForEmail()
          ↓
   Supabase recovery email
          ↓
   reset-password.html
          ↓
   New password
========================================================= */

import { supabase } from "./supabase.js";


/* =========================================================
   ELEMENTS
========================================================= */

const form =
  document.getElementById("forgotPasswordForm");

const email =
  document.getElementById("email");

const button =
  document.getElementById("resetButton");

const errorBox =
  document.getElementById("error");

const successBox =
  document.getElementById("success");


/* =========================================================
   RESET PAGE
========================================================= */

const RESET_URL =
  `${window.location.origin}/reset-password.html`;


/* =========================================================
   SHOW ERROR
========================================================= */

function showError(message) {

  if (errorBox) {

    errorBox.hidden = false;
    errorBox.textContent = message;

  }

  if (successBox) {

    successBox.hidden = true;
    successBox.textContent = "";

  }

}


/* =========================================================
   SHOW SUCCESS
========================================================= */

function showSuccess(message) {

  if (successBox) {

    successBox.hidden = false;
    successBox.textContent = message;

  }

  if (errorBox) {

    errorBox.hidden = true;
    errorBox.textContent = "";

  }

}


/* =========================================================
   CLEAR
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


/* =========================================================
   LOADING
========================================================= */

function setLoading(loading) {

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
   FORM
========================================================= */

if (!form) {

  console.error(
    "CHAMA LIVE: forgotPasswordForm not found."
  );

}
else {

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      clearMessages();


      /* ===================================================
         EMAIL
      =================================================== */

      const userEmail =
        String(
          email?.value || ""
        )
          .trim()
          .toLowerCase();


      if (!userEmail) {

        showError(
          "Enter your registered email address."
        );

        email?.focus();

        return;

      }


      /* ===================================================
         EMAIL VALIDATION
      =================================================== */

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


      setLoading(true);


      try {

        console.log(
          "CHAMA LIVE: requesting password reset",
          {
            email: userEmail,
            redirectTo: RESET_URL
          }
        );


        /* =================================================
           SUPABASE AUTH RECOVERY
        ================================================= */

        const {
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
          "CHAMA LIVE: password reset email requested successfully"
        );

      }

      catch (error) {

        console.error(
          "CHAMA LIVE: password reset failed",
          error
        );


        showError(
          error?.message ||
          "Unable to send password reset email. Please try again."
        );

      }

      finally {

        setLoading(false);

      }

    }
  );

}


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: forgot-password.js loaded"
);
