
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
     FORM VALUES
  ===================================================== */

  const adminName =
    value("adminName");

  const adminPhone =
    value("adminPhone");

  const email =
    value("email");

  const password =
    document.getElementById("password")?.value || "";

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
        "Password must contain at least 6 characters."
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
       CREATE SUPABASE AUTH ACCOUNT
    =================================================== */

    setStatus(
      "Creating your account..."
    );


    const {
      data: authData,
      error: authError
    } =
      await supabase.auth.signUp({

        email,

        password,

        options: {

          /*
           * Supabase will redirect the user
           * here after email confirmation.
           */

          emailRedirectTo:
            CONFIRM_URL,


          /*
           * IMPORTANT:
           *
           * Store the onboarding information
           * in Supabase Auth metadata.
           *
           * This survives the email redirect.
           *
           * We DO NOT store group_id here.
           */

          data: {

            full_name:
              adminName,

            admin_name:
              adminName,

            admin_phone:
              adminPhone,

            group_name:
              groupName,

            group_category:
              category,

            monthly_contribution:
              monthlyContribution,

            opening_balance:
              openingBalance,

            group_description:
              description || null,

            country:
              "Kenya",

            onboarding_type:
              "new_group"

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
      "CHAMA LIVE SIGNUP:",
      authData?.session
        ? "Session created immediately"
        : "Email confirmation required"
    );


    /* ===================================================
       IF EMAIL CONFIRMATION IS REQUIRED
    =================================================== */

    if (!authData?.session) {

      setStatus(
        "✓ Account created successfully. Please check your email and click the confirmation link to continue."
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
       CREATE GROUP IMMEDIATELY
    =================================================== */

    await completeOnboarding(
      authData.session
    );


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
   COMPLETE ONBOARDING
======================================================= */

async function completeOnboarding(session) {

  setStatus(
    "Creating your group..."
  );


  /* =====================================================
     GET AUTHENTICATED USER
  ===================================================== */

  const {
    data: userData,
    error: userError
  } =
    await supabase.auth.getUser();


  if (userError) {

    throw userError;

  }


  const user =
    userData?.user;


  if (!user) {

    throw new Error(
      "Authenticated user could not be found."
    );

  }


  console.log(
    "CHAMA LIVE AUTHENTICATED USER:",
    user.id
  );


  /* =====================================================
     READ ONBOARDING DATA FROM AUTH METADATA
  ===================================================== */

  const metadata =
    user.user_metadata || {};


  console.log(
    "CHAMA LIVE USER METADATA:",
    metadata
  );


  /*
   * Only continue if this is a new-group signup.
   */

  if (
    metadata.onboarding_type !==
    "new_group"
  ) {

    throw new Error(
      "This account does not contain new-group onboarding information."
    );

  }


  const groupName =
    metadata.group_name;

  const category =
    metadata.group_category || "other";

  const monthlyContribution =
    Number(
      metadata.monthly_contribution || 0
    );

  const openingBalance =
    Number(
      metadata.opening_balance || 0
    );

  const description =
    metadata.group_description || null;

  const adminName =
    metadata.admin_name ||
    metadata.full_name ||
    "";

  const adminPhone =
    metadata.admin_phone ||
    "";


  if (!groupName) {

    throw new Error(
      "Your account is confirmed, but the group name could not be found."
    );

  }


  if (!adminName) {

    throw new Error(
      "Your account is confirmed, but the administrator name could not be found."
    );

  }


  /* =====================================================
     CREATE GROUP
  ===================================================== */

  console.log(
    "CHAMA LIVE: calling onboard_new_group"
  );


  const {
    data: onboarding,
    error: onboardingError
  } =
    await supabase.rpc(
      "onboard_new_group",
      {

        /*
         * IMPORTANT:
         *
         * NO group_id.
         *
         * The database obtains auth.uid().
         */

        p_group_name:
          groupName,

        p_category:
          category,

        p_monthly_contribution:
          monthlyContribution,

        p_opening_balance:
          openingBalance,

        p_description:
          description,

        p_admin_name:
          adminName,

        p_admin_phone:
          adminPhone,

        p_country:
          "Kenya"

      }
    );


  if (onboardingError) {

    throw onboardingError;

  }


  console.log(
    "CHAMA LIVE ONBOARDING RESULT:",
    onboarding
  );


  /* =====================================================
     VERIFY DATABASE RESULT
  ===================================================== */

  if (
    !onboarding ||
    onboarding.success !== true
  ) {

    throw new Error(
      "Group onboarding did not complete successfully."
    );

  }


  if (!onboarding.group_id) {

    throw new Error(
      "Group was created but no group ID was returned."
    );

  }


  /* =====================================================
     SUCCESS
  ===================================================== */

  console.log(
    "CHAMA LIVE GROUP CREATED:",
    onboarding.group_id
  );

  console.log(
    "CHAMA LIVE MEMBER CREATED:",
    onboarding.member_id
  );

  console.log(
    "CHAMA LIVE MEMBER NUMBER:",
    onboarding.member_number
  );

  console.log(
    "CHAMA LIVE ACCESS CODE:",
    onboarding.access_code
  );


  setStatus(
    "✓ Your group has been created successfully. Redirecting..."
  );


  /*
   * Never put group_id in the URL.
   */

  setTimeout(
    () => {

      window.location.href =
        `${APP_URL}/dashboard.html`;

    },
    800
  );

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
