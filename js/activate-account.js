import {
  supabase,
  claimMemberAccount
} from "./auth.js";


/* =====================================================
   ELEMENTS
===================================================== */

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


/* =====================================================
   SHOW ERROR
===================================================== */

function showError(
  message
) {

  errorBox.hidden = false;

  errorBox.textContent =
    message;

  successBox.hidden =
    true;

}


/* =====================================================
   SHOW SUCCESS
===================================================== */

function showSuccess(
  message
) {

  successBox.hidden =
    false;

  successBox.textContent =
    message;

  errorBox.hidden =
    true;

}


/* =====================================================
   CLEAR MESSAGES
===================================================== */

function clearMessages() {

  errorBox.hidden =
    true;

  successBox.hidden =
    true;

  errorBox.textContent =
    "";

  successBox.textContent =
    "";

}


/* =====================================================
   VALIDATE
===================================================== */

function validate() {

  const number =
    membershipNumber.value
      .trim();

  const userEmail =
    email.value
      .trim()
      .toLowerCase();

  const pass =
    password.value;

  const confirm =
    confirmPassword.value;


  if (!number) {

    throw new Error(
      "Enter your membership number."
    );

  }


  if (!userEmail) {

    throw new Error(
      "Enter the email registered by your group administrator."
    );

  }


  if (pass.length < 8) {

    throw new Error(
      "Password must contain at least 8 characters."
    );

  }


  if (pass !== confirm) {

    throw new Error(
      "Passwords do not match."
    );

  }


  return {
    number,
    userEmail,
    pass
  };

}


/* =====================================================
   SUBMIT
===================================================== */

form.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    clearMessages();


    let values;


    try {

      values =
        validate();

    } catch (error) {

      showError(
        error.message
      );

      return;

    }


    button.disabled =
      true;

    button.textContent =
      "Creating account...";


    try {

      /*
       * STEP 1
       *
       * Create Supabase Auth account.
       */

      const {
        data,
        error
      } =
        await supabase.auth.signUp({

          email:
            values.userEmail,

          password:
            values.pass

        });


      if (error) {
        throw error;
      }


      /*
       * Supabase may require email
       * confirmation.
       */

      if (!data.user) {

        throw new Error(
          "Unable to create your login account."
        );

      }


      /*
       * STEP 2
       *
       * Link the authenticated user
       * to the member created by
       * the group administrator.
       */

      try {

        await claimMemberAccount(
          values.number,
          values.userEmail
        );

      } catch (claimError) {

        /*
         * If email confirmation is enabled,
         * the user may not have an active
         * session yet.
         */

        if (
          claimError.message &&
          claimError.message
            .toLowerCase()
            .includes(
              "authentication required"
            )
        ) {

          showSuccess(
            "Account created successfully. Check your email, confirm your account, then sign in using your new password."
          );

          button.disabled =
            false;

          button.textContent =
            "Activate Account";

          return;

        }


        throw claimError;

      }


      /*
       * STEP 3
       *
       * Account is now linked.
       */

      showSuccess(
        "Account activated successfully. Redirecting to your dashboard..."
      );


      setTimeout(
        () => {

          window.location.href =
            "dashboard.html";

        },
        1000
      );


    } catch (error) {

      console.error(
        "Activation error:",
        error
      );


      let message =
        error?.message ||
        "Unable to activate your account.";


      /*
       * FRIENDLY SUPABASE ERRORS
       */

      if (
        message
          .toLowerCase()
          .includes(
            "user already registered"
          )
      ) {

        message =
          "An account with this email already exists. Please sign in instead.";

      }


      if (
        message
          .toLowerCase()
          .includes(
            "no pending member account"
          )
      ) {

        message =
          "We could not find a pending member account matching that membership number and email. Check your details with your group administrator.";

      }


      if (
        message
          .toLowerCase()
          .includes(
            "already linked"
          )
      ) {

        message =
          "This login is already linked to a member account. Please sign in.";

      }


      showError(
        message
      );


      button.disabled =
        false;

      button.textContent =
        "Activate Account";

    }

  }
);
