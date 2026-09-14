/* =========================================================
   CHAMA LIVE — GROUP SIGNUP / ONBOARDING

   Flow:
   ---------------------------------------------------------
   1. Create Supabase Auth account
   2. Confirm email if required
   3. Submit group application
   4. Application remains PENDING
   5. Platform administrator reviews application
   6. approve_group_application() creates the group/member
   7. Redirect to account-review.html

   IMPORTANT
   ---------------------------------------------------------
   - Signup does NOT create the group directly.
   - Signup does NOT create the admin member directly.
   - Signup does NOT generate or receive an access code.
   - Password is NEVER stored in localStorage.
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

  return document.getElementById(
    id
  );

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

  /*
   * NEVER store the password.
   */

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
   LOAD SAFE ONBOARDING DATA
========================================================= */

function loadPending() {

  try {

    const raw =
      localStorage.getItem(
        PENDING_KEY
      );


    if (!raw) {
      return null;
    }


    const data =
      JSON.parse(
        raw
      );


    if (
      !data ||
      typeof data !== "object"
    ) {

      clearPending();

      return null;

    }


    return data;

  }

  catch (error) {

    console.warn(
      "CHAMA LIVE: Could not restore pending onboarding data.",
      error
    );


    clearPending();

    return null;

  }

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
   RESTORE PENDING FORM
========================================================= */

function restorePending(
  values
) {

  if (!values) {
    return;
  }


  const fields = [
    "groupName",
    "category",
    "country",
    "monthlyContribution",
    "description",
    "adminName",
    "adminPhone",
    "email"
  ];


  fields.forEach(
    field => {

      const element =
        byId(field);


      if (
        element &&
        values[field] !== undefined
      ) {

        element.value =
          values[field];

      }

    }
  );

}


/* =========================================================
   VALIDATE PENDING ACCOUNT OWNERSHIP
========================================================= */

function validatePendingOwnership(
  pending,
  session
) {

  if (
    !pending ||
    typeof pending !== "object"
  ) {

    throw new Error(
      "No pending group application was found. Please start the registration again."
    );

  }


  if (!session?.user) {

    throw new Error(
      "Your account is not authenticated. Please sign in and continue."
    );

  }


  const pendingEmail =
    String(
      pending.email ||
      ""
    )
      .trim()
      .toLowerCase();


  const authenticatedEmail =
    String(
      session.user.email ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    !pendingEmail ||
    !authenticatedEmail
  ) {

    throw new Error(
      "The pending registration could not be matched to your authenticated account."
    );

  }


  if (
    pendingEmail !==
    authenticatedEmail
  ) {

    throw new Error(
      "The saved group application does not belong to the authenticated account."
    );

  }

}


/* =========================================================
   BUILD PENDING APPLICATION VALUES
========================================================= */

function pendingApplicationValues(
  pending
) {

  return {

    groupName:
      String(
        pending.groupName ||
        ""
      ).trim(),


    category:
      String(
        pending.category ||
        "chama"
      ).trim(),


    country:
      String(
        pending.country ||
        "Kenya"
      ).trim(),


    monthlyContribution:
      Number(
        pending.monthlyContribution ||
        0
      ),


    description:
      String(
        pending.description ||
        ""
      ).trim(),


    adminName:
      String(
        pending.adminName ||
        ""
      ).trim(),


    adminPhone:
      normalizePhone(
        pending.adminPhone ||
        ""
      ),


    email:
      String(
        pending.email ||
        ""
      )
        .trim()
        .toLowerCase()

  };

}


/* =========================================================
   VALIDATE PENDING APPLICATION
========================================================= */

function validatePendingApplication(
  values
) {

  if (!values.groupName) {

    throw new Error(
      "The saved group name is missing. Please start registration again."
    );

  }


  if (
    values.groupName.length <
    2
  ) {

    throw new Error(
      "The saved group name is invalid. Please start registration again."
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
      "The saved monthly contribution is invalid."
    );

  }


  if (!values.adminName) {

    throw new Error(
      "The saved administrator name is missing."
    );

  }


  if (!values.adminPhone) {

    throw new Error(
      "The saved administrator phone number is missing."
    );

  }


  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      values.email
    )
  ) {

    throw new Error(
      "The saved registration email is invalid."
    );

  }

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
      "application already exists"
    )
  ) {

    return (
      "A group application already exists for this account."
    );

  }


  if (
    lower.includes(
      "already linked to a group"
    ) ||
    lower.includes(
      "already assigned to a group"
    )
  ) {

    return (
      "This account is already linked to a CHAMA LIVE group."
    );

  }


  if (
    lower.includes(
      "does not belong to the authenticated account"
    )
  ) {

    return (
      "The saved registration belongs to a different account. " +
      "Please use the email address originally used for registration."
    );

  }


  if (
    lower.includes(
      "no pending group application"
    )
  ) {

    return (
      "No pending registration was found. " +
      "Please start the group registration again."
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
   SUBMIT GROUP APPLICATION
========================================================= */

/*
 * Canonical application boundary.
 *
 * Signup submits a pending application only.
 *
 * It does NOT:
 *   - create public.groups
 *   - create public.members
 *   - create financial_periods
 *   - initialize subscriptions
 *   - generate access codes
 *
 * Those operations belong to
 * approve_group_application().
 */

async function submitGroupApplication(
  values
) {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "submit_group_application",
      {

        p_group_name:
          values.groupName,

        p_category:
          values.category,

        p_monthly_contribution:
          values.monthlyContribution,

        p_opening_balance:
          0,

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


  /*
   * submit_group_application() is expected to
   * return the created application payload.
   *
   * Do not require group_id/member_id/access_code:
   * those belong to the approval boundary.
   */

  if (
    !result ||
    result.success === false
  ) {

    throw new Error(
      "The group application was not submitted successfully."
    );

  }


  return result;

}


/* =========================================================
   COMPLETE PENDING APPLICATION
========================================================= */

async function completePendingApplication(
  session
) {

  const pending =
    loadPending();


  if (!pending) {

    throw new Error(
      "No pending group application was found. " +
      "Please start the registration again."
    );

  }


  /*
   * The browser may contain pending onboarding
   * data from another account. Never submit it
   * without matching it to the authenticated email.
   */

  validatePendingOwnership(
    pending,
    session
  );


  const values =
    pendingApplicationValues(
      pending
    );


  validatePendingApplication(
    values
  );


  restorePending(
    values
  );


  showStatus(
    "Email confirmed. Submitting your group application..."
  );


  await submitGroupApplication(
    values
  );


  /*
   * Remove pending data only after the RPC
   * has successfully returned.
   */

  clearPending();


  showStatus(
    "Group application submitted successfully."
  );


  window.location.replace(
    `${REVIEW_PAGE}?submitted=1`
  );

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


        /*
         * Store only non-sensitive recovery data.
         *
         * Password is never stored.
         */

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
           * Email confirmation is required before the
           * authenticated application RPC can run.
           *
           * The pending onboarding data remains in
           * localStorage so the confirmation callback
           * can complete the existing application flow.
           */

          if (!session?.user) {

            setLoading(
              false
            );


            showStatus(
              "Account created successfully. " +
              "Please check your email and confirm your address. " +
              "After confirmation, this page will continue your saved group application."
            );


            return;

          }

        }


        /* =================================================
           SUBMIT APPLICATION
        ================================================= */

        showStatus(
          "Submitting your group application..."
        );


        await submitGroupApplication(
          values
        );


        /*
         * Application has now entered the pending
         * review workflow.
         *
         * No group/member/access-code data is stored
         * because those records do not exist yet.
         */

        clearPending();


        /*
         * Preserve the existing review-page navigation
         * without inventing a client-side application ID.
         */

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


/* =========================================================
   AUTH STATE / EMAIL CONFIRMATION CONTINUATION
========================================================= */

/*
 * Supabase establishes the authenticated session after
 * the user confirms the email through the existing
 * REVIEW_PAGE callback.
 *
 * If safe pending onboarding data exists, complete the
 * existing group application through the same canonical
 * RPC boundary.
 *
 * This does NOT create a group, member, subscription,
 * access code, or accounting record.
 */

supabase.auth.onAuthStateChange(
  async (
    event,
    session
  ) => {

    if (!session?.user) {
      return;
    }


    const pending =
      loadPending();


    if (!pending) {
      return;
    }


    /*
     * Do not run a second submission when the normal
     * form flow already submitted the application.
     */

    if (
      event !== "SIGNED_IN" &&
      event !== "INITIAL_SESSION"
    ) {

      return;

    }


    /*
     * Defer the application RPC so the auth state
     * transition can complete before the authenticated
     * request is issued.
     */

    setTimeout(
      async () => {

        try {

          /*
           * Re-read the session because the event
           * callback may have been triggered before
           * the session was fully persisted.
           */

          const {
            data,
            error
          } =
            await supabase.auth.getSession();


          if (error) {
            throw error;
          }


          const currentSession =
            data?.session ||
            null;


          if (!currentSession?.user) {

            return;

          }


          /*
           * Verify that the saved onboarding data
           * belongs to the authenticated account.
           */

          validatePendingOwnership(
            pending,
            currentSession
          );


          /*
           * If the user is currently on signup.html,
           * complete the pending application here.
           *
           * This is the missing continuation after
           * email confirmation.
           */

          if (
            window.location.pathname.endsWith(
              "/signup.html"
            ) ||
            window.location.pathname ===
              "/signup.html"
          ) {

            setLoading(
              true
            );


            await completePendingApplication(
              currentSession
            );

          }

        }

        catch (error) {

          console.error(
            "CHAMA LIVE: pending signup continuation failed:",
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

      },
      0
    );

  }
);


/* =========================================================
   INITIAL RESTORE
========================================================= */

restorePending(
  loadPending()
);


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: signup.js ready"
);

