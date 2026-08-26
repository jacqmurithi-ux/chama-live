
import { supabase } from "./supabase.js";

console.log("CHAMA LIVE: signup.js loaded");


/* =======================================================
   CONFIGURATION
======================================================= */

const APP_URL =
  "https://jacqmurithi-ux.github.io/chama-live";

const CONFIRM_URL =
  `${APP_URL}/confirm.html`;

const PENDING_KEY =
  "chama_pending_onboarding";


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
   SAVE PENDING ONBOARDING
======================================================= */

function savePendingOnboarding(data) {

  /*
   * IMPORTANT:
   *
   * We use localStorage instead of sessionStorage.
   *
   * The user leaves signup.html when they click
   * the confirmation email.
   *
   * localStorage survives that navigation.
   *
   * The browser NEVER supplies group_id.
   */

  localStorage.setItem(
    PENDING_KEY,
    JSON.stringify(data)
  );

  console.log(
    "CHAMA LIVE: pending onboarding saved"
  );

}


/* =======================================================
   GET PENDING ONBOARDING
======================================================= */

function getPendingOnboarding() {

  const stored =
    localStorage.getItem(PENDING_KEY);

  if (!stored) {
    return null;
  }

  try {

    return JSON.parse(stored);

  } catch (error) {

    console.error(
      "Invalid pending onboarding data:",
      error
    );

    localStorage.removeItem(
      PENDING_KEY
    );

    return null;

  }

}


/* =======================================================
   SIGNUP
======================================================= */

async function signup(event) {

  event.preventDefault();

  clearError();


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
        "Please select the group category."
      )
    );

    return;

  }


  if (
    !Number.isFinite(
      monthlyContribution
    ) ||
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
    !Number.isFinite(
      openingBalance
    ) ||
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
       SAVE ONBOARDING DATA
    =================================================== */

    savePendingOnboarding({

      adminName,
      adminPhone,
      email,
      groupName,
      category,
      monthlyContribution,
      openingBalance,
      description

    });


    /* ===================================================
       CREATE AUTH ACCOUNT
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

          emailRedirectTo:
            CONFIRM_URL

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
       SESSION CHECK
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
        "Account created successfully. Please check your email and click the confirmation link to complete your group setup."
      );


      if (createButton) {

        createButton.disabled = false;

        createButton.textContent =
          "Create Account & Group";

      }

      return;

    }


    /* ===================================================
       SESSION ALREADY EXISTS
    =================================================== */

    await completeOnboarding();


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

async function completeOnboarding() {

  setStatus(
    "Creating your group..."
  );


  /* =====================================================
     GET AUTH USER
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
     GET PENDING DATA
  ===================================================== */

  const onboardingData =
    getPendingOnboarding();


  if (!onboardingData) {

    throw new Error(
      "Your account was confirmed, but your group setup information could not be found. Please start the group registration again."
    );

  }


  console.log(
    "CHAMA LIVE PENDING ONBOARDING:",
    onboardingData
  );


  /* =====================================================
     CREATE GROUP
  ===================================================== */

  const {
    data: onboarding,
    error: onboardingError
  } =
    await supabase.rpc(
      "onboard_new_group",
      {

        /*
         * NO group_id.
         *
         * Supabase determines auth.uid()
         * and creates the group.
         */

        p_group_name:
          onboardingData.groupName,

        p_category:
          onboardingData.category,

        p_monthly_contribution:
          onboardingData.monthlyContribution,

        p_opening_balance:
          onboardingData.openingBalance,

        p_description:
          onboardingData.description ||
          null,

        p_admin_name:
          onboardingData.adminName,

        p_admin_phone:
          onboardingData.adminPhone,

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
     VERIFY
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
    "CHAMA LIVE GROUP:",
    onboarding.group_id
  );

  console.log(
    "CHAMA LIVE MEMBER:",
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


  /* =====================================================
     REMOVE TEMPORARY DATA
  ===================================================== */

  localStorage.removeItem(
    PENDING_KEY
  );


  setStatus(
    "✓ Account confirmed and group created. Redirecting..."
  );


  setTimeout(
    () => {

      window.location.href =
        `${APP_URL}/dashboard.html`;

    },
    700
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


console.log(
  "CHAMA LIVE: signup ready"
);
