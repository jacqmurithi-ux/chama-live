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
   VALIDATE
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
   CREATE GROUP
======================================================= */

async function createGroup(data) {

  setStatus(
    "Creating your group..."
  );


  /*
   * IMPORTANT:
   *
   * There is NO group_id here.
   *
   * Supabase determines:
   *
   * auth.uid()
   * group_id
   * member_id
   * role
   *
   * server-side.
   */

  const {
    data: result,
    error
  } = await supabase.rpc(
    "onboard_new_group",
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


  if (error) {

    throw error;

  }


  console.log(
    "CHAMA LIVE ONBOARDING RESULT:",
    result
  );


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


  return result;

}


/* =======================================================
   COMPLETE ONBOARDING
======================================================= */

async function completeOnboarding(data) {

  const result =
    await createGroup(data);


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


  setStatus(
    "✓ Your group has been created successfully. Redirecting..."
  );


  setTimeout(() => {

    window.location.href =
      `${APP_URL}/dashboard.html`;

  }, 800);

}


/* =======================================================
   SIGNUP
======================================================= */

async function signup(event) {

  event.preventDefault();

  clearError();


  const data =
    getFormData();


  try {

    validate(data);

  } catch (error) {

    showError(error);

    return;

  }


  if (createButton) {

    createButton.disabled = true;

    createButton.textContent =
      "Creating account...";

  }


  try {

    /*
     * IMPORTANT:
     *
     * We store the onboarding information
     * inside the Auth user's metadata.
     *
     * This prevents the information from
     * disappearing when the confirmation
     * email opens in another browser tab.
     *
     * It is NOT used for authorization.
     *
     * The database still determines the
     * user's actual group and role.
     */

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

            chama_onboarding: true,

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


    /*
     * Email confirmation required.
     */

    if (!authData.session) {

      setStatus(
        "Account created successfully. Please check your email and click the confirmation link to continue."
      );


      if (createButton) {

        createButton.disabled = false;

        createButton.textContent =
          "Create Account & Group";

      }


      return;

    }


    /*
     * Email confirmation is not required.
     * Continue immediately.
     */

    await completeOnboarding(data);


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
