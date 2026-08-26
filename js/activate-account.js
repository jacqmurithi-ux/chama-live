import {
  supabase,
  claimMemberAccount,
  BASE_URL
} from "./auth.js";


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


function error(
  message
) {

  errorBox.hidden =
    false;

  errorBox.textContent =
    message;

  successBox.hidden =
    true;

}


function success(
  message
) {

  successBox.hidden =
    false;

  successBox.textContent =
    message;

  errorBox.hidden =
    true;

}


form.addEventListener(
  "submit",
  async event => {

    event.preventDefault();


    errorBox.hidden =
      true;

    successBox.hidden =
      true;


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

      error(
        "Enter your membership number."
      );

      return;

    }


    if (!userEmail) {

      error(
        "Enter your registered email."
      );

      return;

    }


    if (pass.length < 8) {

      error(
        "Password must contain at least 8 characters."
      );

      return;

    }


    if (pass !== confirm) {

      error(
        "Passwords do not match."
      );

      return;

    }


    button.disabled =
      true;

    button.textContent =
      "Creating account...";


    try {

      /*
       * Create Supabase Auth account.
       */

      const {
        data,
        error: signUpError
      } =
        await supabase.auth.signUp({

          email:
            userEmail,

          password:
            pass,

          options: {

            emailRedirectTo:
              `${BASE_URL}/dashboard.html`

          }

        });


      if (signUpError) {
        throw signUpError;
      }


      /*
       * If email confirmation is required,
       * there may be no session yet.
       */

      if (!data.session) {

        success(
          "Account created. Please check your email, confirm your account, then sign in."
        );


        button.disabled =
          false;

        button.textContent =
          "Activate Account";


        return;

      }


      /*
       * Link Auth account to member.
       */

      await claimMemberAccount(
        number,
        userEmail
      );


      success(
        "Account activated successfully. Redirecting..."
      );


      setTimeout(
        () => {

          window.location.replace(
            `${BASE_URL}/dashboard.html`
          );

        },
        1000
      );


    } catch (err) {

      console.error(
        "Activation:",
        err
      );


      let message =
        err.message ||
        "Unable to activate account.";


      if (
        message
          .toLowerCase()
          .includes(
            "user already registered"
          )
      ) {

        message =
          "An account with this email already exists. Please sign in.";

      }


      if (
        message
          .toLowerCase()
          .includes(
            "no pending"
          )
      ) {

        message =
          "No pending member account was found for those details.";

      }


      error(
        message
      );


      button.disabled =
        false;

      button.textContent =
        "Activate Account";

    }

  }
);
