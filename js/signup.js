import { supabase } from "./supabase.js";

console.log("CHAMA LIVE: signup.js loaded");


/* =======================================================
   ELEMENTS
======================================================= */

const form = document.getElementById("signupForm");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const createButton = document.getElementById("createAccount");


/* =======================================================
   HELPERS
======================================================= */

function setStatus(message) {
  if (statusEl) {
    statusEl.textContent = message;
  }
}


function showError(error) {

  console.error("CHAMA LIVE Signup Error:", error);

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

  return document
    .getElementById(id)
    ?.value
    ?.trim() || "";

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
      new Error("Please enter your full name.")
    );
    return;
  }


  if (!adminPhone) {
    showError(
      new Error("Please enter your phone number.")
    );
    return;
  }


  if (!email) {
    showError(
      new Error("Please enter your email address.")
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
      new Error("Please enter the group name.")
    );
    return;
  }


  if (!category) {
    showError(
      new Error("Please select a group category.")
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
     BUTTON
  ===================================================== */

  if (createButton) {

    createButton.disabled = true;

    createButton.textContent =
      "Creating account...";

  }


  try {

    /* ===================================================
       1. CREATE AUTH ACCOUNT
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
        password

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
       2. CHECK SESSION
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


    /*
     * If email confirmation is enabled,
     * there may be no session yet.
     */

    if (!session) {

      setStatus(
        "Account created. Please confirm your email, then sign in to complete group setup."
      );


      if (createButton) {

        createButton.disabled = false;

        createButton.textContent =
          "Create Account & Group";

      }


      return;

    }


    /* ===================================================
       3. CREATE GROUP
    =================================================== */

    setStatus(
      "Creating your group..."
    );


    /*
     * IMPORTANT:
     *
     * There is NO group_id here.
     *
     * Supabase obtains auth.uid()
     * from the authenticated session.
     */

    const {
      data: onboarding,
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
            description || null,

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


    if (
      !onboarding ||
      onboarding.success !== true
    ) {

      throw new Error(
        "Group onboarding did not complete successfully."
      );

    }


    /* ===================================================
       4. SUCCESS
    =================================================== */

    setStatus(
      "✓ Group created successfully. Redirecting..."
    );


    /*
     * We don't put group_id in the URL.
     */

    setTimeout(
      () => {

        window.location.href =
          "dashboard.html";

      },
      700
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
   EVENT
======================================================= */

if (form) {

  form.addEventListener(
    "submit",
    signup
  );

}


/* =======================================================
   START
======================================================= */

console.log(
  "CHAMA LIVE: signup ready"
);
