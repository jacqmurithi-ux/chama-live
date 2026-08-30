/* =========================================================
   CHAMA LIVE — ACTIVATE ACCOUNT

   File:
   /js/activate-account.js

   Uses:
   Supabase Edge Function:
   activate-account

   Flow:
   Membership Number
        +
   Registered Email
        +
   New Password
        ↓
   Supabase Edge Function
        ↓
   Verify member
        ↓
   Set Auth password
        ↓
   Link Auth user to member
        ↓
   Mark member ACTIVE
        ↓
   Redirect to sign in
========================================================= */

import { supabase } from "./supabase.js";


/* =========================================================
   ELEMENTS
========================================================= */

const form =
  document.getElementById(
    "activateForm"
  );

const membershipNumber =
  document.getElementById(
    "membershipNumber"
  );

const email =
  document.getElementById(
    "email"
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
    "activateButton"
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
  window.location.origin;


/* =========================================================
   SHOW ERROR
========================================================= */

function showError(message) {

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

function showSuccess(message) {

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
   READ EDGE FUNCTION ERROR
========================================================= */

async function getFunctionError(result) {

  /*
   * Normal JSON response.
   */

  if (
    result?.data &&
    typeof result.data === "object"
  ) {

    if (result.data.message) {

      return result.data.message;
    }

    if (result.data.error) {

      if (
        typeof result.data.error ===
        "string"
      ) {

        return result.data.error;
      }

      if (
        result.data.error.message
      ) {

        return result.data.error.message;
      }
    }
  }


  /*
   * Supabase Functions error.
   */

  if (result?.error) {

    const context =
      result.error.context;

    if (context) {

      /*
       * Try JSON.
       */

      try {

        const response =
          typeof context.clone ===
          "function"
            ? context.clone()
            : context;

        const body =
          await response.json();

        if (body?.message) {

          return body.message;
        }

        if (body?.error) {

          return typeof body.error ===
            "string"
              ? body.error
              : body.error.message ||
                JSON.stringify(
                  body.error
                );
        }

      }

      catch (_) {
        /*
         * Response was not JSON.
         */
      }


      /*
       * Try text.
       */

      try {

        const response =
          typeof context.clone ===
          "function"
            ? context.clone()
            : context;

        const text =
          await response.text();

        if (text) {

          try {

            const parsed =
              JSON.parse(text);

            if (parsed?.message) {

              return parsed.message;
            }

            if (parsed?.error) {

              return typeof parsed.error ===
                "string"
                  ? parsed.error
                  : parsed.error.message ||
                    JSON.stringify(
                      parsed.error
                    );
            }

          }

          catch (_) {

            return text;
          }
        }

      }

      catch (_) {
        /*
         * Could not read response.
         */
      }
    }


    if (result.error.message) {

      return result.error.message;
    }
  }


  return (
    "Unable to activate the account."
  );
}


/* =========================================================
   FORM CHECK
========================================================= */

if (!form) {

  console.error(
    "CHAMA LIVE: #activateForm was not found."
  );

}

else {

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      clearMessages();


      /* ===================================================
         READ VALUES
      =================================================== */

      const number =
        String(
          membershipNumber?.value ||
          ""
        ).trim();


      const userEmail =
        String(
          email?.value ||
          ""
        )
          .trim()
          .toLowerCase();


      const pass =
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
         VALIDATION
      =================================================== */

      if (!number) {

        showError(
          "Enter your membership number."
        );

        membershipNumber?.focus();

        return;
      }


      if (!userEmail) {

        showError(
          "Enter your registered email."
        );

        email?.focus();

        return;
      }


      /*
       * Basic email validation.
       */

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


      if (pass.length < 8) {

        showError(
          "Password must contain at least 8 characters."
        );

        password?.focus();

        return;
      }


      if (pass !== confirm) {

        showError(
          "Passwords do not match."
        );

        confirmPassword?.focus();

        return;
      }


      /* ===================================================
         BUTTON
      =================================================== */

      if (button) {

        button.disabled =
          true;

        button.textContent =
          "Activating...";
      }


      try {

        console.log(
          "CHAMA LIVE: activating account",
          {
            membership_number:
              number,

            email:
              userEmail
          }
        );


        /* =================================================
           CALL SUPABASE EDGE FUNCTION
        ================================================= */

        const result =
          await supabase.functions.invoke(
            "activate-account",
            {
              body: {

                membership_number:
                  number,

                email:
                  userEmail,

                password:
                  pass

              }
            }
          );


        console.log(
          "CHAMA LIVE: activation response",
          result
        );


        /* =================================================
           HANDLE ERROR
        ================================================= */

        if (
          result.error ||
          result.data?.success === false
        ) {

          const message =
            await getFunctionError(
              result
            );

          throw new Error(
            message
          );
        }


        /* =================================================
           SUCCESS
        ================================================= */

        showSuccess(
          result.data?.message ||
          "Account activated successfully. Redirecting to sign in..."
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
         * Redirect to login page.
         */

        setTimeout(
          () => {

            window.location.replace(
              `${BASE_URL}/login.html`
            );

          },
          1500
        );

      }


      catch (err) {

        console.error(
          "CHAMA LIVE: account activation failed",
          err
        );


        let message =
          err?.message ||
          "Unable to activate account.";


        /*
         * Friendly messages.
         */

        const lowerMessage =
          message.toLowerCase();


        if (
          lowerMessage.includes(
            "already activated"
          )
        ) {

          message =
            "This account has already been activated. Please sign in.";
        }


        else if (
          lowerMessage.includes(
            "no member record"
          ) ||
          lowerMessage.includes(
            "member was found"
          )
        ) {

          message =
            "No member record was found for that membership number and registered email.";
        }


        else if (
          lowerMessage.includes(
            "invitation has not been prepared"
          )
        ) {

          message =
            "Your login invitation has not been prepared yet. Please ask your group administrator to send the invitation first.";
        }


        else if (
          lowerMessage.includes(
            "password"
          ) &&
          lowerMessage.includes(
            "8"
          )
        ) {

          message =
            "Password must contain at least 8 characters.";
        }


        showError(
          message
        );


        if (button) {

          button.disabled =
            false;

          button.textContent =
            "Activate Account";
        }

      }

    }
  );

}


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: activate-account.js loaded"
);
