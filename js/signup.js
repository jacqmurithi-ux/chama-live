import { supabase } from "./supabase.js";

console.log("CHAMA LIVE: signup.js loaded");


/* =======================================================
   CONFIGURATION
======================================================= */

const APP_URL =
  "https://jacqmurithi-ux.github.io/chama-live";

const CONFIRM_URL =
  `${APP_URL}/confirm.html`;


/* =======================================================
   ELEMENTS
======================================================= */

const form =
  document.getElementById("signupForm");

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const createButton =
  document.getElementById("createAccount");


/* =======================================================
   HELPERS
======================================================= */

function setStatus(message) {

  if (statusEl) {
    statusEl.textContent = message;
  }

}


function showError(error) {

  console.error(
    "CHAMA LIVE Signup Error:",
    error
  );

  if (errorEl) {

    errorEl.textContent =
      error?.message ||
      "Unable to complete signup.";

    errorEl.hidden = false;

  }

}


function clearError() {

  if (!errorEl) {
    return;
  }

  errorEl.textContent = "";
  errorEl.hidden = true;

}


function value(id) {

  return (
    document
      .getElementById(id)
      ?.value
      ?.trim() || ""
  );

}


/* =======================================================
   SIGNUP
======================================================= */

async function signup(event) {

  event.preventDefault();

  clearError();


  /* =====================================================
     GET FORM VALUES
  ===================================================== */

  const adminName =
    value("adminName");

  const adminPhone =
    value("adminPhone");

  const email =
    value("email");

  const password =
    document.getElementById(
      "password"
    )?.value || "";

  const groupName =
    value("groupName");

  const category =
    value("category");

  const monthlyContribution =
    Number(
      document.getElementById(
        "monthlyContribution"
      )?.value || 0
    );

  const openingBalance =
    Number(
      document.getElementById(
        "openingBalance"
      )?.value || 0
    );

  const description =
    value("description");


  /* =====================================================
     VALIDATION
  ===================================================== */

  if (!adminName) {

    showError(
      new Error(
        "Please enter your full name."
      )
    );

    return;

  }


  if (!adminPhone) {

    showError(
      new Error(
        "Please enter your phone number."
      )
    );

    return;

  }


  if (!email) {

    showError(
      new Error(
        "Please enter your email address."
      )
    );

    return;

  }


  if (password.length < 6) {

    showError(
      new Error(
        "Please enter a password with at least 6 characters."
      )
    );

    return;

  }


  if (!groupName) {

    showError(
      new Error(
        "Please enter the group name."
      )
    );

    return;

  }


  if (!category) {

    showError(
      new Error(
        "Please select a group category."
      )
    );

    return;

  }


  if (
    !Number.isFinite(monthlyContribution) ||
    monthlyContribution < 0
  ) {

    showError(
      new Error(
        "Please enter a valid monthly contribution."
      )
    );

    return;

  }


  if (
    !Number.isFinite(openingBalance) ||
    openingBalance < 0
  ) {

    showError(
      new Error(
        "Please enter a valid opening balance."
      )
    );

    return;

  }


  /* =====================================================
     DISABLE BUTTON
  ===================================================== */

  if (createButton) {

    createButton.disabled = true;

    createButton.textContent =
      "Creating account...";

  }


  try {

    /* ===================================================
       CREATE AUTH ACCOUNT
    =================================================== */

    setStatus(
      "Creating your account..."
    );


    /*
     * IMPORTANT:
     *
     * The group information is temporarily
     * stored in Supabase Auth metadata.
     *
     * Password is NEVER stored in metadata.
     */

    const {
      data: authData,
      error: authError
    } =
      await supabase.auth.signUp({

        email,

        password,

        options: {

          emailRedirectTo:
            CONFIRM_URL,

          data: {

            chama_onboarding: {

              group_name:
                groupName,

              category:
                category,

              monthly_contribution:
                monthlyContribution,

              opening_balance:
                openingBalance,

              description:
                description || null,

              admin_name:
                adminName,

              admin_phone:
                adminPhone,

              country:
                "Kenya"

            }

          }

        }

      });


    if (authError) {

      throw authError;

    }


    const user =
      authData?.user;


    if (!user) {

      throw new Error(
        "Supabase did not return a user."
      );

    }


    console.log(
      "CHAMA LIVE AUTH USER:",
      user.id
    );


    /* ===================================================
       CHECK SESSION
    =================================================== */

    const {
      data: sessionData,
      error: sessionError
    } =
      await supabase.auth.getSession();


    if (sessionError) {

      throw sessionError;

    }


    const session =
      sessionData?.session;


    /* ===================================================
       EMAIL CONFIRMATION REQUIRED
    =================================================== */

    if (!session) {

      setStatus(
        "✓ Account created. Please check your email and click the confirmation link to finish creating your group."
      );


      if (createButton) {

        createButton.disabled = false;

        createButton.textContent =
          "Create Account & Group";

      }


      return;

    }


    /* ===================================================
       EMAIL CONFIRMATION NOT REQUIRED
    =================================================== */

    setStatus(
      "Account created. Setting up your group..."
    );


    /*
     * If email confirmation is disabled,
     * we already have a session.
     *
     * Send the user to confirm.html.
     *
     * confirm.html will complete the
     * exact same onboarding process.
     */

    window.location.href =
      CONFIRM_URL;


  } catch (error) {

    showError(error);

    setStatus(
      "Account creation failed."
    );


    if (createButton) {

      createButton.disabled = false;

      createButton.textContent =
        "Create Account & Group";

    }

  }

}


/* =======================================================
   EVENT
======================================================= */

if (form) {

  form.addEventListener(
    "submit",
    signup
  );

}


/* =======================================================
   STARTUP
======================================================= */

console.log(
  "CHAMA LIVE: signup ready"
);
