import {
  supabase,
  BASE_URL
} from "./auth.js";


const form =
  document.getElementById(
    "loginForm"
  );

const email =
  document.getElementById(
    "email"
  );

const password =
  document.getElementById(
    "password"
  );

const button =
  document.getElementById(
    "loginButton"
  );

const errorBox =
  document.getElementById(
    "error"
  );


function showError(
  message
) {

  if (!errorBox) {

    alert(
      message
    );

    return;

  }


  errorBox.hidden =
    false;

  errorBox.textContent =
    message;

}


function clearError() {

  if (!errorBox) {
    return;
  }

  errorBox.hidden =
    true;

  errorBox.textContent =
    "";

}


form.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    clearError();


    const userEmail =
      email.value
        .trim()
        .toLowerCase();

    const userPassword =
      password.value;


    if (!userEmail) {

      showError(
        "Enter your email."
      );

      return;

    }


    if (!userPassword) {

      showError(
        "Enter your password."
      );

      return;

    }


    button.disabled =
      true;

    button.textContent =
      "Signing in...";


    try {

      const {
        data,
        error
      } =
        await supabase.auth.signInWithPassword({

          email:
            userEmail,

          password:
            userPassword

        });


      if (error) {
        throw error;
      }


      if (!data.session) {

        throw new Error(
          "Login was not completed."
        );

      }


      window.location.replace(
        `${BASE_URL}/dashboard.html`
      );


    } catch (error) {

      console.error(
        "Login:",
        error
      );


      let message =
        error.message ||
        "Unable to sign in.";


      if (
        message
          .toLowerCase()
          .includes(
            "invalid login credentials"
          )
      ) {

        message =
          "Incorrect email or password.";

      }


      showError(
        message
      );


      button.disabled =
        false;

      button.textContent =
        "Sign in";

    }

  }
);
