/* =========================================================
   CHAMA LIVE — GROUP SIGNUP / ONBOARDING

   Flow:
   ---------------------------------------------------------
   1. Create Supabase Auth account
   2. Confirm email if required
   3. Call create_group_account RPC
   4. RPC creates group
   5. RPC creates admin member
   6. Admin/member starts as PENDING
   7. Redirect to account-review.html

   IMPORTANT
   ---------------------------------------------------------
   Password is NEVER stored in localStorage.
========================================================= */

import {
  supabase
} from "./auth.js";


console.log(
  "CHAMA LIVE: signup.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const form =
  document.getElementById(
    "signupForm"
  );


const button =
  document.getElementById(
    "signupButton"
  );


const errorBox =
  document.getElementById(
    "error"
  );


const statusBox =
  document.getElementById(
    "status"
  );


/* =========================================================
   CONSTANTS
========================================================= */

const BASE_URL =
  "https://jacqmurithi-ux.github.io/chama-live";


const REVIEW_PAGE =
  `${BASE_URL}/account-review.html`;


const PENDING_KEY =
  "chama_live_pending_group_onboarding";


/* =========================================================
   HELPERS
========================================================= */

function byId(id) {

  return document.getElementById(id);

}


/* =========================================================
   SHOW ERROR
========================================================= */

function showError(message) {

  console.error(
    "CHAMA LIVE signup:",
    message
  );


  if (!errorBox) {
    return;
  }


  errorBox.textContent =
    String(
      message ||
      "Unable to create the account."
    );


  errorBox.hidden =
    false;

}


/* =========================================================
   CLEAR ERROR
========================================================= */

function clearError() {

  if (!errorBox) {
    return;
  }


  errorBox.textContent =
    "";


  errorBox.hidden =
    true;

}


/* =========================================================
   STATUS
========================================================= */

function showStatus(message) {

  if (!statusBox) {
    return;
  }


  statusBox.textContent =
    String(
      message || ""
    );


  statusBox.hidden =
    !message;

}


/* =========================================================
   LOADING
========================================================= */

function setLoading(
  loading
) {

  if (!button) {
    return;
  }


  button.disabled =
    loading;


  button.textContent =
    loading
      ? "Creating account..."
      : "Create Group Account";

}


/* =========================================================
   PHONE
========================================================= */

function normalizePhone(
  value
) {

  let phone =
    String(
      value || ""
    )
      .trim()
      .replace(
        /[\s()-]/g,
        ""
      );


  if (
    /^07\d{8}$/.test(
      phone
    )
  ) {

    return (
      "+254" +
      phone.substring(1)
    );

  }


  if (
    /^01\d{8}$/.test(
      phone
    )
  ) {

    return (
      "+254" +
      phone.substring(1)
    );

  }


  if (
    /^7\d{8}$/.test(
      phone
    )
  ) {

    return (
      "+254" +
      phone
    );

  }


  if (
    /^1\d{8}$/.test(
      phone
    )
  ) {

    return (
      "+254" +
      phone
    );

  }


  return phone;

}


/* =========================================================
   READ FORM
========================================================= */

function readForm() {

  return {

    groupName:
      byId("groupName")
        ?.value
        .trim() ||
      "",


    category:
      byId("category")
        ?.value
        .trim() ||
      "chama",


    country:
      byId("country")
        ?.value
        .trim() ||
      "Kenya",


    monthlyContribution:
      Number(
        byId(
          "monthlyContribution"
        )?.value ||
        0
      ),


    description:
      byId("description")
        ?.value
        .trim() ||
      "",


    adminName:
      byId("adminName")
        ?.value
        .trim() ||
      "",


    adminPhone:
      normalizePhone(
        byId(
          "adminPhone"
        )?.value ||
        ""
      ),


    email:
      byId("email")
        ?.value
        .trim()
        .toLowerCase() ||
      "",


    password:
      byId("password")
        ?.value ||
      "",


    confirmPassword:
      byId("confirmPassword")
        ?.value ||
      ""

  };

}


/* =========================================================
   VALIDATION
========================================================= */

function validateForm(
  values
) {

  if (!values.groupName) {

    throw new Error(
      "Please enter the group name."
    );

  }


  if (
    values.groupName.length <
    2
  ) {

    throw new Error(
      "Group name is too short."
    );

  }


  if (
    !Number.isFinite(
      values.monthlyContribution
    ) ||
    values.monthlyContribution <
    0
  ) {

    throw new Error(
      "Monthly contribution must be zero or greater."
    );

  }


  if (!values.adminName) {

    throw new Error(
      "Please enter the administrator's name."
    );

  }


  if (!values.adminPhone) {

    throw new Error(
      "Please enter the administrator's phone number."
    );

  }


  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      values.email
    )
  ) {

    throw new Error(
      "Please enter a valid email address."
    );

  }


  if (
    values.password.length <
    8
  ) {

    throw new Error(
      "Password must contain at least 8 characters."
    );

  }


  if (
    values.password !==
    values.confirmPassword
  ) {

    throw new Error(
      "Passwords do not match."
    );

  }

}


/* =========================================================
   SAVE SAFE ONBOARDING DATA
========================================================= */

function savePending(
  values
) {

  const safeData = {

    groupName:
      values.groupName,

    category:
      values.category,

    country:
      values.country,

    monthlyContribution:
      values.monthlyContribution,

    description:
      values.description,

    adminName:
      values.adminName,

    adminPhone:
      values.adminPhone,

    email:
      values.email

  };


  localStorage.setItem(
    PENDING_KEY,
    JSON.stringify(
      safeData
    )
  );

}


/* =========================================================
   CLEAR PENDING
========================================================= */

function clearPending() {

  localStorage.removeItem(
    PENDING_KEY
  );

}


/* =========================================================
   FRIENDLY ERROR
========================================================= */

function friendlyError(
  error
) {

  const message =
    String(
      error?.message ||
      error ||
      ""
    );


  const lower =
    message.toLowerCase();


  if (
    lower.includes(
      "user already registered"
    )
  ) {

    return (
      "An account already exists for this email. " +
      "Please sign in instead."
    );

  }


  if (
    lower.includes(
      "email rate limit"
    )
  ) {

    return (
      "Too many email requests. " +
      "Please wait a few minutes and try again."
    );

  }


  if (
    lower.includes(
      "already linked to a group"
    )
  ) {

    return (
      "This account is already linked to a CHAMA LIVE group."
    );

  }


  if (
    lower.includes(
      "failed to fetch"
    ) ||
    lower.includes(
      "network"
    )
  ) {

    return (
      "Unable to connect to CHAMA LIVE. " +
      "Check your internet connection and try again."
    );

  }


  return (
    message ||
    "Unable to complete group registration."
  );

}


/* =========================================================
   CREATE GROUP
========================================================= */

async function createGroup(
  values
) {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "create_group_account",
      {

        p_name:
          values.groupName,

        p_category:
          values.category,

        p_monthly_contribution:
          values.monthlyContribution,

        p_description:
          values.description,

        p_admin_name:
          values.adminName,

        p_admin_phone:
          values.adminPhone,

        p_country:
          values.country

      }
    );


  if (error) {
    throw error;
  }


  const result =
    Array.isArray(data)
      ? data[0]
      : data;


  if (!result?.group_id) {

    throw new Error(
      "The group was not created. No group ID was returned."
    );

  }


  return result;

}


/* =========================================================
   FORM SUBMIT
========================================================= */

if (form) {

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      clearError();


      let values;


      try {

        values =
          readForm();


        validateForm(
          values
        );


        savePending(
          values
        );


        setLoading(
          true
        );


        /* =================================================
           CHECK SESSION
        ================================================= */

        showStatus(
          "Checking your account..."
        );


        const {
          data: sessionData,
          error: sessionError
        } =
          await supabase.auth.getSession();


        if (sessionError) {
          throw sessionError;
        }


        let session =
          sessionData?.session ||
          null;


        /* =================================================
           CREATE AUTH USER
        ================================================= */

        if (!session?.user) {

          showStatus(
            "Creating your secure login account..."
          );


          const {
            data,
            error
          } =
            await supabase.auth.signUp({

              email:
                values.email,

              password:
                values.password,

              options: {

                emailRedirectTo:
                  REVIEW_PAGE,

                data: {

                  full_name:
                    values.adminName

                }

              }

            });


          if (error) {
            throw error;
          }


          session =
            data?.session ||
            null;


          /*
           * Email confirmation required.
           */

          if (!session?.user) {

            setLoading(
              false
            );


            showStatus(
              "Account created successfully. " +
              "Please check your email and confirm your address. " +
              "After confirmation, sign in to continue."
            );


            return;

          }

        }


        /* =================================================
           CREATE GROUP
        ================================================= */

        showStatus(
          "Creating your group application..."
        );


        const result =
          await createGroup(
            values
          );


        /*
         * The RPC now creates the administrator
         * as pending.
         */

        clearPending();


        /*
         * Save only non-sensitive result data.
         */

        localStorage.setItem(
          "chama_live_review_application",
          JSON.stringify({

            group_id:
              result.group_id,

            member_id:
              result.member_id,

            member_number:
              result.member_number,

            access_code:
              result.access_code,

            email:
              values.email,

            created_at:
              new Date().toISOString()

          })
        );


        showStatus(
          "Group application submitted successfully."
        );


        window.location.replace(
          `${REVIEW_PAGE}?submitted=1`
        );

      }

      catch (error) {

        console.error(
          "CHAMA LIVE: signup failed",
          error
        );


        showError(
          friendlyError(
            error
          )
        );


        setLoading(
          false
        );

      }

    }
  );

}


console.log(
  "CHAMA LIVE: signup.js ready"
);
