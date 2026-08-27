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
      "Unable to complete account creation.";

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
   GET FORM DATA
======================================================= */

function getFormData() {

  const adminName =
    value("adminName");

  const adminPhone =
    value("adminPhone");

  const email =
    value("email");

  const password =
    document.getElementById("password")
      ?.value || "";

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


  return {

    adminName,
    adminPhone,
    email,
    password,
    groupName,
    category,
    monthlyContribution,
    openingBalance,
    description

  };

}


/* =======================================================
   VALIDATION
======================================================= */

function validateForm(data) {

  if (!data.adminName) {

    throw new Error(
      "Please enter your full name."
    );

  }


  if (!data.adminPhone) {

    throw new Error(
      "Please enter your phone number."
    );

  }


  if (!data.email) {

    throw new Error(
      "Please enter your email address."
    );

  }


  if (data.password.length < 6) {

    throw new Error(
      "Password must contain at least 6 characters."
    );

  }


  if (!data.groupName) {

    throw new Error(
      "Please enter the group name."
    );

  }


  if (!data.category) {

    throw new Error(
      "Please select the group category."
    );

  }


  if (
    !Number.isFinite(
      data.monthlyContribution
    ) ||
    data.monthlyContribution < 0
  ) {

    throw new Error(
      "Please enter a valid monthly contribution."
    );

  }


  if (
    !Number.isFinite(
      data.openingBalance
    ) ||
    data.openingBalance < 0
  ) {

    throw new Error(
      "Please enter a valid opening balance."
    );

  }

}


/* =======================================================
   CREATE SUPABASE AUTH ACCOUNT
======================================================= */

async function createAuthAccount(data) {

  setStatus(
    "Creating your account..."
  );


  const {
    data: authData,
    error: authError
  } =
    await supabase.auth.signUp({

      email:
        data.email,

      password:
        data.password,

      options: {

        emailRedirectTo:
          CONFIRM_URL,

        data: {

          full_name:
            data.adminName,

          phone:
            data.adminPhone

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


  console.log(
    "CHAMA LIVE EMAIL CONFIRMATION:",
    authData?.session
      ? "Not required / session available"
      : "Required"
  );


  return {

    user,

    session:
      authData?.session || null

  };

}


/* =======================================================
   SUBMIT GROUP APPLICATION
======================================================= */

async function submitApplication(
  user,
  data
) {

  setStatus(
    "Submitting your group application..."
  );


  /*
   * IMPORTANT
   *
   * This function ONLY submits an application.
   *
   * It does NOT create:
   *
   * - groups
   * - members
   * - financial_periods
   *
   * Group creation happens only after
   * manual approval.
   *
   * The database determines the authenticated
   * user through auth.uid().
   *
   * We deliberately do NOT send group_id.
   */


  const {
    data: application,
    error: applicationError
  } =
    await supabase.rpc(
      "submit_group_application",
      {

        p_group_name:
          data.groupName,

        p_category:
          data.category,

        p_monthly_contribution:
          data.monthlyContribution,

        p_opening_balance:
          data.openingBalance,

        p_description:
          data.description || null,

        p_admin_name:
          data.adminName,

        p_admin_phone:
          data.adminPhone,

        p_country:
          "Kenya"

      }
    );


  if (applicationError) {

    throw applicationError;

  }


  console.log(
    "CHAMA LIVE GROUP APPLICATION:",
    application
  );


  return application;

}


/* =======================================================
   HANDLE SUCCESS
======================================================= */

function showApplicationSuccess() {

  setStatus(
    "✓ Application received successfully. Your account will be reviewed within 1–2 days."
  );


  if (errorEl) {

    errorEl.textContent = "";

    errorEl.hidden = true;

  }


  /*
   * Keep the user on this page.
   *
   * The account/group must NOT be activated
   * until manual review is completed.
   */

  if (createButton) {

    createButton.disabled = true;

    createButton.textContent =
      "Application Submitted";

  }


  /*
   * Optional visual message.
   */

  const message =
    document.createElement("div");

  message.className = "card";

  message.style.marginTop = "20px";

  message.innerHTML = `

    <h3>Application received</h3>

    <p class="muted">
      Thank you for registering your group with CHAMA LIVE.
    </p>

    <p class="muted">
      Your application is now awaiting manual review.
      Reviews normally take 1–2 days.
    </p>

    <p class="muted">
      After approval, you will receive a confirmation
      email with instructions for accessing your group account.
    </p>

  `;


  if (
    form &&
    form.parentNode
  ) {

    form.parentNode.insertBefore(
      message,
      form
    );

  }

}


/* =======================================================
   SIGNUP
======================================================= */

async function signup(event) {

  event.preventDefault();

  clearError();


  let data;


  /* =====================================================
     GET DATA
  ===================================================== */

  try {

    data =
      getFormData();


    validateForm(
      data
    );

  } catch (error) {

    showError(
      error
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
       STEP 1
       CREATE AUTH USER
    =================================================== */

    const {
      user,
      session
    } =
      await createAuthAccount(
        data
      );


    /* ===================================================
       STEP 2
       SUBMIT APPLICATION
    =================================================== */

    const application =
      await submitApplication(
        user,
        data
      );


    /* ===================================================
       STEP 3
       CHECK APPLICATION RESULT
    =================================================== */

    if (
      application === null ||
      application === undefined
    ) {

      /*
       * A PostgreSQL function can legitimately
       * return null depending on its definition.
       *
       * The absence of an error means the RPC
       * completed successfully.
       */

      console.log(
        "CHAMA LIVE: application submitted"
      );

    }


    /* ===================================================
       STEP 4
       SUCCESS
    =================================================== */

    showApplicationSuccess();


    /*
     * If a session exists because email confirmation
     * is disabled, sign the user out.
     *
     * They should not access the dashboard before
     * their application is approved.
     */

    if (session) {

      console.log(
        "CHAMA LIVE: signing out pending applicant"
      );


      const {
        error: signOutError
      } =
        await supabase.auth.signOut();


      if (signOutError) {

        console.warn(
          "CHAMA LIVE sign-out warning:",
          signOutError
        );

      }

    }


  } catch (error) {

    showError(
      error
    );


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
   EVENT LISTENER
======================================================= */

if (form) {

  form.addEventListener(
    "submit",
    signup
  );

} else {

  console.error(
    "CHAMA LIVE: signupForm was not found."
  );

}


/* =======================================================
   STARTUP
======================================================= */

console.log(
  "CHAMA LIVE: signup ready"
);
