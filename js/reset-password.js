/* =========================================================
   CHAMA LIVE — RESET PASSWORD

   File:
   /js/reset-password.js

   Supabase Auth sends the user to this page after
   clicking the password reset email.

   The recovery session is established by Supabase Auth.

   This page then calls:

       supabase.auth.updateUser({
         password
       })

   No service-role key is exposed in the browser.
========================================================= */

import { supabase } from "./supabase.js";


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
      ? "Updating..."
      : "Update Password";
}


/* =========================================================
   CHECK RECOVERY SESSION
========================================================= */

async function checkSession() {

  const {
    data,
    error
  } =
    await supabase.auth.getSession();


  if (error) {

    throw error;
  }


  if (!data?.session) {

    throw new Error(
      "This password reset link is invalid or has expired. Please request a new password reset link."
    );
  }


  return data.session;
}


/* =========================================================
   FORM
========================================================= */

if (!form) {

  console.error(
    "CHAMA LIVE: resetPasswordForm not found."
  );

}
else {

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      clearMessages();


      const pass =
        String(
          password?.value || ""
        );


      const confirm =
        String(
          confirmPassword?.value || ""
        );


      /* ===================================================
         VALIDATION
      =================================================== */

      if (
        pass.length < 8
      ) {

        showError(
          "Password must contain at least 8 characters."
        );

        password?.focus();

        return;
      }


      if (
        pass !== confirm
      ) {

        showError(
          "Passwords do not match."
        );

        confirmPassword?.focus();

        return;
      }


      setLoading(true);


      try {

        /* ===============================================
           VERIFY RECOVERY SESSION
        =============================================== */

        await checkSession();


        /* ===============================================
           UPDATE PASSWORD
        =============================================== */

        const {
          error
        } =
          await supabase.auth.updateUser({

            password:
              pass

          });


        if (error) {

          throw error;
        }


        /* ===============================================
           SUCCESS
        =============================================== */

        showSuccess(
          "Your password has been updated successfully. Redirecting to sign in..."
        );


        if (password) {

          password.value =
            "";
        }


        if (confirmPassword) {

          confirmPassword.value =
            "";
        }


        /*
         * Sign out the recovery session.
         * User will sign in normally with the new password.
         */

        await supabase.auth.signOut();


        setTimeout(
          () => {

            window.location.replace(
              "login.html"
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
            "expired"
          ) ||
          lower.includes(
            "invalid"
          ) &&
            lower.includes(
              "token"
            )
        ) {

          message =
            "This password reset link has expired or is invalid. Please request a new one.";
        }


        showError(
          message
        );


        setLoading(false);

      }

    }
  );

}


/* =========================================================
   INITIAL SESSION CHECK
========================================================= */

(async function initialize() {

  try {

    await checkSession();

    console.log(
      "CHAMA LIVE: password recovery session detected"
    );

  }

  catch (error) {

    console.warn(
      "CHAMA LIVE: no password recovery session",
      error
    );

    /*
     * Don't immediately redirect.
     * Show a useful message on the page.
     */

    showError(
      error?.message ||
      "This password reset link is invalid or has expired."
    );

  }

})();


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: reset-password.js ready"
);
