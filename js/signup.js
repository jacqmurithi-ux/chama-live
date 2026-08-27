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

  return {

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
      value("category") || "other",

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


  if (
    !Number.isFinite(data.monthlyContribution) ||
    data.monthlyContribution < 0
  ) {

    throw new Error(
      "Please enter a valid monthly contribution."
    );

  }


  if (
    !Number.isFinite(data.openingBalance) ||
    data.openingBalance < 0
  ) {

    throw new Error(
      "Please enter a valid opening balance."
    );

  }

}


/* =======================================================
   SAVE LOCAL BACKUP
======================================================= */

function savePendingOnboarding(data) {

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


  try {

    sessionStorage.setItem(
      "chama_pending_onboarding",
      JSON.stringify(pending)
    );

  } catch (error) {

    console.warn(
      "CHAMA LIVE: sessionStorage unavailable",
      error
    );

  }

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
     BUTTON
  ===================================================== */

  if (createButton) {

    createButton.disabled = true;

    createButton.textContent =
      "Creating account...";

  }


  try {

    /* ===================================================
       SAVE LOCAL BACKUP
    =================================================== */

    savePendingOnboarding(data);


    /* ===================================================
       CREATE SUPABASE AUTH ACCOUNT
    =================================================== */

    setStatus(
      "Creating your account..."
    );


    console.log(
      "CHAMA LIVE: signup redirect:",
      CONFIRM_URL
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
       AUTH ERROR
    =================================================== */

    if (authError) {

      throw authError;

    }


    /* ===================================================
       USER
    =================================================== */

    const user =
      authData?.user;


    if (!user) {

      throw new Error(
        "Supabase did not return a user."
      );

    }


    console.log(
      "CHAMA LIVE: Auth user created:",
      user.id
    );


    console.log(
      "CHAMA LIVE: Confirmation URL:",
      CONFIRM_URL
    );


    /* ===================================================
       EMAIL CONFIRMATION REQUIRED
    =================================================== */

    if (!authData.session) {

      setStatus(
        "✓ Account created. Please check your email and click Confirm email address. Your group will be created after your email is confirmed."
      );


      if (createButton) {

        createButton.disabled = false;

        createButton.textContent =
          "Create Account & Group";

      }


      return;

    }


    /* ===================================================
       CONFIRMATION NOT REQUIRED
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
   COMPLETE ONBOARDING
======================================================= */

async function completeOnboardingFromMetadata() {

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
    "CHAMA LIVE: authenticated user:",
    user.id
  );


  /* =====================================================
     READ METADATA
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
    metadata.category || "other";

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
    metadata.admin_name || "";

  const adminPhone =
    metadata.admin_phone || "";


  if (!groupName) {

    throw new Error(
      "Group name is missing from your account setup."
    );

  }


  /* =====================================================
     CREATE GROUP THROUGH RPC
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
    "CHAMA LIVE: onboarding result:",
    result
  );


  /* =====================================================
     VERIFY
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
     CLEAN LOCAL STORAGE
  ===================================================== */

  try {

    sessionStorage.removeItem(
      "chama_pending_onboarding"
    );

  } catch (error) {

    console.warn(
      "CHAMA LIVE: could not clear sessionStorage",
      error
    );

  }


  /* =====================================================
     CLEAN AUTH METADATA
  ===================================================== */

  try {

    const cleanedMetadata = {
      ...metadata
    };


    delete cleanedMetadata.chama_onboarding;
    delete cleanedMetadata.admin_name;
    delete cleanedMetadata.admin_phone;
    delete cleanedMetadata.group_name;
    delete cleanedMetadata.category;
    delete cleanedMetadata.monthly_contribution;
    delete cleanedMetadata.opening_balance;
    delete cleanedMetadata.description;
    delete cleanedMetadata.country;


    const {
      error: metadataError
    } =
      await supabase.auth.updateUser({
        data: cleanedMetadata
      });


    if (metadataError) {

      console.warn(
        "CHAMA LIVE metadata cleanup warning:",
        metadataError
      );

    }

  } catch (error) {

    console.warn(
      "CHAMA LIVE metadata cleanup warning:",
      error
    );

  }


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

} else {

  console.warn(
    "CHAMA LIVE: signupForm was not found."
  );

}


/* =======================================================
   START
======================================================= */

console.log(
  "CHAMA LIVE: signup ready"
);
