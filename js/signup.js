import { supabase } from "./supabase.js";

console.log("CHAMA LIVE: signup.js loaded");


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

const adminNameInput =
  document.getElementById("adminName");

const adminPhoneInput =
  document.getElementById("adminPhone");

const emailInput =
  document.getElementById("email");

const passwordInput =
  document.getElementById("password");

const groupNameInput =
  document.getElementById("groupName");

const categoryInput =
  document.getElementById("category");

const monthlyContributionInput =
  document.getElementById("monthlyContribution");

const openingBalanceInput =
  document.getElementById("openingBalance");

const descriptionInput =
  document.getElementById("description");


/* =======================================================
   HELPERS
======================================================= */

function showError(message) {

  console.error(
    "CHAMA LIVE Signup Error:",
    message
  );

  if (errorEl) {

    errorEl.textContent =
      message;

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


function setStatus(message) {

  if (statusEl) {

    statusEl.textContent =
      message;

  }

}


function normalizePhone(phone) {

  return String(phone || "")
    .trim()
    .replace(/\s+/g, "");

}


function validateForm() {

  const adminName =
    adminNameInput?.value.trim();

  const adminPhone =
    normalizePhone(
      adminPhoneInput?.value
    );

  const email =
    emailInput?.value.trim();

  const password =
    passwordInput?.value || "";

  const groupName =
    groupNameInput?.value.trim();

  const category =
    categoryInput?.value;

  const monthlyContribution =
    Number(
      monthlyContributionInput?.value || 0
    );

  const openingBalance =
    Number(
      openingBalanceInput?.value || 0
    );


  if (!adminName) {

    throw new Error(
      "Please enter the administrator's full name."
    );

  }


  if (!adminPhone) {

    throw new Error(
      "Please enter a phone number."
    );

  }


  if (!email) {

    throw new Error(
      "Please enter an email address."
    );

  }


  if (password.length < 6) {

    throw new Error(
      "Password must contain at least 6 characters."
    );

  }


  if (!groupName) {

    throw new Error(
      "Please enter the group name."
    );

  }


  if (!category) {

    throw new Error(
      "Please select the group category."
    );

  }


  if (
    !Number.isFinite(monthlyContribution) ||
    monthlyContribution < 0
  ) {

    throw new Error(
      "Please enter a valid monthly contribution."
    );

  }


  if (
    !Number.isFinite(openingBalance) ||
    openingBalance < 0
  ) {

    throw new Error(
      "Please enter a valid opening balance."
    );

  }


  return {

    adminName,
    adminPhone,
    email,
    password,
    groupName,
    category,
    monthlyContribution,
    openingBalance

  };

}


/* =======================================================
   CREATE AUTH ACCOUNT
======================================================= */

async function createAuthAccount(
  email,
  password
) {

  setStatus(
    "Creating your account..."
  );


  const {
    data,
    error
  } = await supabase.auth.signUp({

    email,
    password

  });


  if (error) {

    throw error;

  }


  if (!data?.user) {

    throw new Error(
      "Account creation did not return a user."
    );

  }


  return data.user;

}


/* =======================================================
   CREATE GROUP + ADMIN
======================================================= */

async function createGroupAndAdmin(
  details
) {

  setStatus(
    "Creating your group and assigning you as administrator..."
  );


  /*
   * IMPORTANT:
   *
   * We deliberately DO NOT send group_id.
   *
   * Supabase gets auth.uid() from the
   * authenticated session and creates
   * the group server-side.
   */

  const {
    data,
    error
  } = await supabase.rpc(
    "onboard_new_group",
    {

      p_group_name:
        details.groupName,

      p_category:
        details.category,

      p_monthly_contribution:
        details.monthlyContribution,

      p_opening_balance:
        details.openingBalance,

      p_description:
        descriptionInput?.value.trim() || null,

      p_admin_name:
        details.adminName,

      p_admin_phone:
        details.adminPhone,

      p_country:
        "Kenya"

    }
  );


  if (error) {

    throw error;

  }


  if (!data) {

    throw new Error(
      "Group onboarding did not return a result."
    );

  }


  return data;

}


/* =======================================================
   CHECK SESSION
======================================================= */

async function getCurrentSession() {

  const {
    data,
    error
  } =
    await supabase.auth.getSession();


  if (error) {

    throw error;

  }


  return data?.session || null;

}


/* =======================================================
   MAIN SIGNUP
======================================================= */

async function signup(event) {

  event.preventDefault();

  clearError();


  if (createButton) {

    createButton.disabled = true;

    createButton.textContent =
      "Creating account...";

  }


  try {

    const details =
      validateForm();


    /*
     * STEP 1
     *
     * Create Supabase Auth account.
     */

    await createAuthAccount(
      details.email,
      details.password
    );


    /*
     * IMPORTANT:
     *
     * If Supabase email confirmation is enabled,
     * signUp() may create the user without creating
     * an authenticated session.
     */

    const session =
      await getCurrentSession();


    if (!session) {

      setStatus(
        "Account created. Please check your email and confirm your account before continuing."
      );


      if (createButton) {

        createButton.disabled = false;

        createButton.textContent =
          "Create Account & Group";

      }


      return;

    }


    /*
     * STEP 2
     *
     * Create group.
     *
     * The database function determines
     * auth.uid() and assigns this user
     * as the administrator.
     */

    const onboarding =
      await createGroupAndAdmin(
        details
      );


    /*
     * STEP 3
     *
     * Verify that onboarding returned
     * the newly-created group.
     */

    if (!onboarding.group_id) {

      throw new Error(
        "Group was created but no group ID was returned."
      );

    }


    console.log(
      "CHAMA LIVE: Group onboarding successful",
      onboarding
    );


    setStatus(
      "✓ Account created successfully. Your group is ready."
    );


    /*
     * STEP 4
     *
     * Give Supabase a moment to persist
     * the authentication state before
     * redirecting.
     */

    await new Promise(
      resolve =>
        setTimeout(resolve, 500)
    );


    /*
     * STEP 5
     *
     * Dashboard determines the user's
     * group from the database.
     *
     * We do NOT put group_id in the URL.
     */

    window.location.href =
      "dashboard.html";


  } catch (error) {

    console.error(
      "CHAMA LIVE Signup Error:",
      error
    );


    showError(
      error?.message ||
      "Unable to create your account."
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
   SUBMIT EVENT
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

async function init() {

  try {

    const session =
      await getCurrentSession();


    /*
     * If already logged in, there is
     * no reason to create another account.
     */

    if (session) {

      setStatus(
        "You are already signed in. Redirecting..."
      );


      setTimeout(
        () => {

          window.location.href =
            "dashboard.html";

        },
        500
      );

    }

  } catch (error) {

    console.error(
      "CHAMA LIVE Signup initialization error:",
      error
    );

  }

}


init();
