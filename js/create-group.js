/* =========================================================
   CHAMA LIVE — LEGACY CREATE GROUP / ONBOARDING

   IMPORTANT
   ---------------------------------------------------------
   The active registration page is signup.html.

   This file remains compatible with older links that may
   still load create-group.js.

   SECURITY / ACCOUNTING BOUNDARY
   ---------------------------------------------------------
   - Creates Supabase Auth account when necessary.
   - Preserves safe onboarding data across confirmation.
   - Submits ONLY group_applications.
   - Does NOT create groups.
   - Does NOT create members.
   - Does NOT generate access codes.
   - Does NOT generate member numbers.
   - Does NOT perform accounting operations.
========================================================= */

import {
  supabase
} from "./auth.js";


console.log(
  "CHAMA LIVE: create-group.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const $ = (id) =>
  document.getElementById(id);

const form =
  $("createGroupForm") ||
  $("signupForm");

const statusBox =
  $("status");

const errorBox =
  $("error");

const successBox =
  $("success");

const createButton =
  $("createGroupButton") ||
  $("signupButton");


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
   STATUS
========================================================= */

function showStatus(message) {

  if (!statusBox) {
    return;
  }

  statusBox.textContent =
    String(message || "");

  statusBox.hidden =
    !message;

}


/* =========================================================
   ERROR
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


function showError(message) {

  if (errorBox) {

    errorBox.textContent =
      String(
        message ||
        "Unable to submit the group application."
      );

    errorBox.hidden =
      false;

  }

  showStatus(
    "Group application could not be completed."
  );

}


/* =========================================================
   LOADING
========================================================= */

function setLoading(loading) {

  if (!createButton) {
    return;
  }

  createButton.disabled =
    loading;

  createButton.textContent =
    loading
      ? "Please wait..."
      : "Create Group Account";

}


/* =========================================================
   PHONE NORMALIZATION
========================================================= */

function normalizePhone(value) {

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
    /^07\d{8}$/.test(phone)
  ) {

    return (
      "+254" +
      phone.substring(1)
    );

  }

  if (
    /^01\d{8}$/.test(phone)
  ) {

    return (
      "+254" +
      phone.substring(1)
    );

  }

  if (
    /^7\d{8}$/.test(phone)
  ) {

    return (
      "+254" +
      phone
    );

  }

  if (
    /^1\d{8}$/.test(phone)
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
      $("groupName")
        ?.value
        .trim() ||
      "",

    category:
      $("category")
        ?.value
        .trim() ||
      "chama",

    country:
      $("country")
        ?.value
        .trim() ||
      "Kenya",

    monthlyContribution:
      Number(
        $("monthlyContribution")
          ?.value ||
        0
      ),

    description:
      $("description")
        ?.value
        .trim() ||
      "",

    adminName:
      $("adminName")
        ?.value
        .trim() ||
      "",

    adminPhone:
      normalizePhone(
        $("adminPhone")
          ?.value ||
        ""
      ),

    email:
      $("email")
        ?.value
        .trim()
        .toLowerCase() ||
      "",

    password:
      $("password")
        ?.value ||
      "",

    confirmPassword:
      $("confirmPassword")
        ?.value ||
      ""

  };

}


/* =========================================================
   VALIDATION
========================================================= */

function validateForm(values) {

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
    values.monthlyContribution < 0
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
   PENDING DATA
========================================================= */

function savePending(values) {

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
      JSON.parse(raw);

    if (
      !data ||
      typeof data !== "object"
    ) {

      localStorage.removeItem(
        PENDING_KEY
      );

      return null;

    }

    return data;

  } catch {

    localStorage.removeItem(
      PENDING_KEY
    );

    return null;

  }

}


function restorePending(data) {

  if (!data) {
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
        $(field);

      if (
        element &&
        data[field] !== undefined
      ) {

        element.value =
          data[field];

      }

    }
  );

}


/* =========================================================
   SUBMIT CANONICAL APPLICATION
========================================================= */

async function submitApplication(values) {

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
   FORM SUBMISSION
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
         * Preserve safe details before
         * email confirmation.
         */
        savePending(
          values
        );

        setLoading(
          true
        );

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
           AUTH ACCOUNT
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

                /*
                 * This is the canonical return page.
                 */
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
           *
           * DO NOT submit the application yet
           * because authentication is not established.
           */
          if (!session?.user) {

            setLoading(
              false
            );

            showStatus(
              "Your account was created. " +
              "Please check your email and confirm " +
              "your address. Your group details have " +
              "been saved for the next step."
            );

            return;

          }

        }


        if (!session?.user) {

          throw new Error(
            "Your account is not authenticated. " +
            "Please confirm your email and sign in."
          );

        }


        /* =================================================
           APPLICATION
        ================================================= */

        showStatus(
          "Submitting your group application..."
        );

        await submitApplication(
          values
        );


        /*
         * Application now exists in
         * group_applications.
         *
         * No group/member/access code exists
         * until administrator approval.
         */
        localStorage.removeItem(
          PENDING_KEY
        );


        showStatus(
          "Application submitted — awaiting review."
        );


        window.location.replace(
          `${REVIEW_PAGE}?submitted=1`
        );

      }

      catch (error) {

        console.error(
          "CHAMA LIVE signup error:",
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
   AUTH STATE / RESTORE
========================================================= */

supabase.auth.onAuthStateChange(
  (event, session) => {

    if (!session?.user) {
      return;
    }

    const pending =
      loadPending();

    if (pending) {

      restorePending(
        pending
      );

      showStatus(
        "Email confirmed. " +
        "Your saved group details are ready."
      );

    }

  }
);


/* =========================================================
   INITIAL RESTORE
========================================================= */

restorePending(
  loadPending()
);


/* =========================================================
   FRIENDLY ERRORS
========================================================= */

function friendlyError(error) {

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
    ) ||
    lower.includes(
      "already registered"
    )
  ) {

    return (
      "An account already exists for this email. " +
      "Please sign in and continue from Account Review."
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
      "email rate limit"
    ) ||
    lower.includes(
      "rate limit"
    )
  ) {

    return (
      "Too many email requests were made. " +
      "Please wait a few minutes and try again."
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
      "Please check your internet connection and try again."
    );

  }

  return (
    message ||
    "Unable to complete group registration."
  );

}


console.log(
  "CHAMA LIVE: create-group.js ready"
);
