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
   SAVE PENDING ONBOARDING DATA
======================================================= */

function savePendingOnboarding(data) {

  /*
   * This is only temporary browser state.
   *
   * The database still determines:
   *
   * auth.uid()
   * group_id
   * member_id
   * role
   *
   * The browser NEVER supplies group_id.
   */

  sessionStorage.setItem(
    "chama_pending_onboarding",
    JSON.stringify(data)
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
       SAVE ONBOARDING DATA TEMPORARILY
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
           * IMPORTANT:
           *
           * This is your GitHub Pages URL.
           *
           * NOT Netlify.
           */

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


    console.log(
      "CHAMA LIVE EMAIL CONFIRMATION:",
      authData?.session
        ? "Not required / session available"
        : "Required"
    );


    /* ===================================================
       CHECK WHETHER SESSION ALREADY EXISTS
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
        "Account created successfully. Please check your email and click the confirmation link to continue setting up your group."
      );


      if (createButton) {

        createButton.disabled = false;

        createButton.textContent =
          "Create Account & Group";

      }


      return;

    }


    /* ===================================================
       SESSION EXISTS
       → CONTINUE DIRECTLY
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
    "CHAMA LIVE CONFIRMED USER:",
    user.id
  );


  /* =====================================================
     GET PENDING ONBOARDING
  ===================================================== */

  const stored =
    sessionStorage.getItem(
      "chama_pending_onboarding"
    );


  if (!stored) {

    /*
     * If the browser no longer has the
     * signup information, don't create
     * an incomplete group.
     */

    throw new Error(
      "Your account is confirmed, but the group setup information is missing. Please contact the administrator."
    );

  }


  let onboardingData;


  try {

    onboardingData =
      JSON.parse(stored);

  } catch {

    throw new Error(
      "Your saved group setup information is invalid."
    );

  }


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
     VERIFY RESULT
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
   * Onboarding is complete.
   *
   * Remove temporary data.
   */

  sessionStorage.removeItem(
    "chama_pending_onboarding"
  );


  /*
   * Do NOT put group_id in the URL.
   */

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


/* =======================================================
   STARTUP
======================================================= */

console.log(
  "CHAMA LIVE: signup ready"
);
