/* =========================================================
   CHAMA LIVE — FORGOT PASSWORD

   File:
   /js/forgot-password.js

   Flow:

   Enter registered email
          ↓
   Supabase Edge Function
   "reset-password"
          ↓
   Supabase Auth
          ↓
   Supabase email
          ↓
   reset-password.html
========================================================= */

import { supabase } from "./supabase.js";


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
   RESET PAGE URL
========================================================= */

const RESET_URL =
  `${window.location.origin}/reset-password.html`;


/* =========================================================
   SHOW ERROR
========================================================= */

function showError(message) {

  if (errorBox) {

    errorBox.hidden = false;

    errorBox.textContent =
      message;
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

    successBox.textContent =
      message;
  }

  if (errorBox) {

    errorBox.hidden = true;

    errorBox.textContent = "";
  }
}


/* =========================================================
   CLEAR MESSAGES
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
   BUTTON
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


      const userEmail =
        String(
          email?.value || ""
        )
          .trim()
          .toLowerCase();


      /* ===================================================
         VALIDATION
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


      setLoading(true);


      try {

        console.log(
          "CHAMA LIVE: requesting password reset"
        );


        /* =================================================
           CALL EDGE FUNCTION
        ================================================= */

        const result =
          await supabase.functions.invoke(
            "reset-password",
            {
              body: {

                email:
                  userEmail,

                redirect_to:
                  RESET_URL

              }
            }
          );


        console.log(
          "CHAMA LIVE: reset response",
          result
        );


        if (result.error) {

          let message =
            result.error.message ||
            "Unable to send password reset email.";


          /*
           * Try to read server response.
           */

          try {

            const context =
              result.error.context;

            if (
              context &&
              typeof context.clone ===
                "function"
            ) {

              const response =
                context.clone();

              const body =
                await response.json();

              if (body?.message) {

                message =
                  body.message;
              }

            }

          }
          catch (_) {
            /*
             * Keep normal error.
             */
          }


          throw new Error(
            message
          );
        }


        if (
          result.data?.success === false
        ) {

          throw new Error(
            result.data?.message ||
            result.data?.error ||
            "Unable to send password reset email."
          );
        }


        /* =================================================
           SUCCESS
        ================================================= */

        showSuccess(

          result.data?.message ||

          "If an account exists for that email, a password reset email has been sent. Please check your inbox and spam folder."

        );


        /*
         * Keep email visible so user knows
         * which address was used.
         */

        if (email) {

          email.value =
            userEmail;
        }


      }

      catch (error) {

        console.error(
          "CHAMA LIVE: password reset request failed",
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
  "CHAMA LIVE: forgot-password.js ready"
);
