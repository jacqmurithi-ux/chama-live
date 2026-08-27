import { supabase } from "./supabase.js";

console.log("CHAMA LIVE: signup.js loaded");


/* =======================================================
   CONFIGURATION
======================================================= */

const APP_URL =
  "https://jacqmurithi-ux.github.io/chama-live";

const CONFIRM_URL =
  "https://jacqmurithi-ux.github.io/chama-live/confirm.html";


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
   GET FORM DATA
======================================================= */

function getFormData() {

  const data = {

    adminName:
      value("adminName"),

    adminPhone:
      value("adminPhone"),

    email:
      value("email"),

    password:
      document.getElementById("password")
        ?.value || "",

    groupName:
      value("groupName"),

    category:
      value("category"),

    monthlyContribution:
      Number(
        document.getElementById(
          "monthlyContribution"
        )?.value || 0
      ),

    openingBalance:
      Number(
        document.getElementById(
          "openingBalance"
        )?.value || 0
      ),

    description:
      value("description")

  };

  return data;

}


/* =======================================================
   VALIDATION
======================================================= */

function validate(data) {

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
      "Please select a group category."
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
   SAVE ONBOARDING DATA
======================================================= */

function savePendingOnboarding(data) {

  /*
   * Backup copy for the current browser.
   *
   * The Auth user metadata is also saved below.
   *
   * The database remains responsible for:
   *
   * auth.uid()
   * group_id
   * member_id
   * role
   */

  const pending = {

    adminName:
      data.adminName,

    adminPhone:
      data.adminPhone,

    email:
      data.email,

    groupName:
      data.groupName,

    category:
      data.category,

    monthlyContribution:
      data.monthlyContribution,

    openingBalance:
      data.openingBalance,

    description:
      data.description

  };


  sessionStorage.setItem(
    "chama_pending_onboarding",
    JSON.stringify(pending)
  );

}


/* =======================================================
   SIGNUP
======================================================= */

async function signup(event) {

  event.preventDefault();

  clearError();


  const data =
    getFormData();


  /* =====================================================
     VALIDATE
  ===================================================== */

  try {

    validate(data);

  } catch (error) {

    showError(error);

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
       SAVE TEMPORARY BROWSER DATA
    =================================================== */

    savePendingOnboarding(data);


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

        email:
          data.email,

        password:
          data.password,

        options: {

          /*
           * THIS MUST BE THE GITHUB
           * PAGES CONFIRMATION PAGE.
           */

          emailRedirectTo:
            CONFIRM_URL,

          /*
           * Store onboarding information
           * with the Auth account.
           *
           * This is NOT authorization.
           */

          data: {

            chama_onboarding:
              true,

            admin_name:
              data.adminName,

            admin_phone:
              data.adminPhone,

            group_name:
              data.groupName,

            category:
              data.category,

            monthly_contribution:
              data.monthlyContribution,

            opening_balance:
              data.openingBalance,

            description:
              data.description || null,

            country:
              "Kenya"

          }

        }

      });


    /* ===================================================
       CHECK AUTH ERROR
    =================================================== */

    if (authError) {

      throw authError;

    }


    /* ===================================================
       CHECK USER
    =================================================== */

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
      "CHAMA LIVE CONFIRM URL:",
      CONFIRM_URL
    );


    /* ===================================================
       IMPORTANT
       
       DO NOT CREATE THE GROUP HERE WHEN EMAIL
       CONFIRMATION IS REQUIRED.
    =================================================== */

    if (!authData.session) {

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
       EMAIL CONFIRMATION DISABLED
       
       Session already exists, so we can complete
       onboarding immediately.
    =================================================== */

    setStatus(
      "Account created. Setting up your group..."
    );


    await completeOnboardingFromMetadata();


  } catch (error) {

    console.error(
      "CHAMA LIVE Signup Error:",
      error
    );


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
   COMPLETE ONBOARDING AFTER AUTHENTICATION
======================================================= */

async function completeOnboardingFromMetadata() {

  setStatus(
    "Creating your group..."
  );


  /* =====================================================
     GET CURRENT USER
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
     GET ONBOARDING DATA FROM AUTH METADATA
  ===================================================== */

  const metadata =
    user.user_metadata || {};


  if (
    metadata.chama_onboarding !== true
  ) {

    throw new Error(
      "No pending group setup information was found."
    );

  }


  const groupName =
    metadata.group_name;

  const category =
    metadata.category;

  const monthlyContribution =
    Number(
      metadata.monthly_contribution || 0
    );

  const openingBalance =
    Number(
      metadata.opening_balance || 0
    );

  const description =
    metadata.description || null;

  const adminName =
    metadata.admin_name;

  const adminPhone =
    metadata.admin_phone;


  if (!groupName) {

    throw new Error(
      "Group name is missing from your account setup."
    );

  }


  /* =====================================================
     CREATE GROUP
  ===================================================== */

  const {
    data: result,
    error: onboardingError
  } =
    await supabase.rpc(
      "onboard_new_group",
      {

        p_group_name:
          groupName,

        p_category:
          category || "other",

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
    result
  );


  /* =====================================================
     VERIFY RESULT
  ===================================================== */

  if (
    !result ||
    result.success !== true
  ) {

    throw new Error(
      "Group onboarding did not complete successfully."
    );

  }


  if (!result.group_id) {

    throw new Error(
      "Group was created but no group ID was returned."
    );

  }


  console.log(
    "CHAMA LIVE GROUP:",
    result.group_id
  );


  console.log(
    "CHAMA LIVE MEMBER:",
    result.member_id
  );


  console.log(
    "CHAMA LIVE MEMBER NUMBER:",
    result.member_number
  );


  console.log(
    "CHAMA LIVE ACCESS CODE:",
    result.access_code
  );


  /* =====================================================
     REMOVE TEMPORARY DATA
  ===================================================== */

  sessionStorage.removeItem(
    "chama_pending_onboarding"
  );


  /* =====================================================
     SUCCESS
  ===================================================== */

  setStatus(
    "✓ Your group has been created successfully. Redirecting..."
  );


  setTimeout(() => {

    window.location.href =
      `${APP_URL}/dashboard.html`;

  }, 800);

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
