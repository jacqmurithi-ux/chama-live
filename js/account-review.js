/* =========================================================
   CHAMA LIVE — ACCOUNT REVIEW

   Secure Group Application Status Lookup

   Flow:
   ---------------------------------------------------------
   Group Registration
        ↓
   Administrator Email
        ↓
   Member Lookup
        ↓
   Verify Registered Admin
        ↓
   Read onboarding_status
        ↓
   Display:

      pending
      approved / active
      rejected
      suspended

========================================================= */

import {
  supabase
} from "./auth.js";


console.log(
  "CHAMA LIVE: account-review.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const form =
  document.getElementById(
    "reviewLookupForm"
  );


const emailInput =
  document.getElementById(
    "adminEmail"
  );


const checkButton =
  document.getElementById(
    "checkStatusButton"
  );


const errorBox =
  document.getElementById(
    "error"
  );


const statusBox =
  document.getElementById(
    "status"
  );


const reviewResult =
  document.getElementById(
    "reviewResult"
  );


const statusBadge =
  document.getElementById(
    "statusBadge"
  );


const groupNameElement =
  document.getElementById(
    "groupName"
  );


const registeredEmailElement =
  document.getElementById(
    "registeredEmail"
  );


const statusMessageElement =
  document.getElementById(
    "statusMessage"
  );


const statusAction =
  document.getElementById(
    "statusAction"
  );


/* =========================================================
   ERROR
========================================================= */

function showError(
  message
) {

  if (!errorBox) {
    return;
  }


  errorBox.textContent =
    String(
      message ||
      "Unable to check application status."
    );


  errorBox.hidden =
    false;

}


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
   STATUS MESSAGE
========================================================= */

function showStatus(
  message
) {

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


function clearStatus() {

  if (!statusBox) {
    return;
  }


  statusBox.textContent =
    "";


  statusBox.hidden =
    true;

}


/* =========================================================
   LOADING
========================================================= */

function setLoading(
  loading
) {

  if (!checkButton) {
    return;
  }


  checkButton.disabled =
    loading;


  checkButton.textContent =
    loading
      ? "Checking status..."
      : "Check Application Status";

}


/* =========================================================
   CLEAR RESULT
========================================================= */

function clearResult() {

  if (!reviewResult) {
    return;
  }


  reviewResult.hidden =
    true;


  if (groupNameElement) {

    groupNameElement.textContent =
      "";

  }


  if (registeredEmailElement) {

    registeredEmailElement.textContent =
      "";

  }


  if (statusMessageElement) {

    statusMessageElement.textContent =
      "";

  }


  if (statusAction) {

    statusAction.hidden =
      true;

  }

}


/* =========================================================
   NORMALIZE STATUS
========================================================= */

function normalizeStatus(
  onboardingStatus,
  memberStatus
) {

  const onboarding =
    String(
      onboardingStatus || ""
    )
      .trim()
      .toLowerCase();


  const member =
    String(
      memberStatus || ""
    )
      .trim()
      .toLowerCase();


  /* =====================================================
     SUSPENDED
  ===================================================== */

  if (
    onboarding === "suspended" ||
    member === "suspended"
  ) {

    return "suspended";

  }


  /* =====================================================
     REJECTED
  ===================================================== */

  if (
    onboarding === "rejected" ||
    member === "rejected"
  ) {

    return "rejected";

  }


  /* =====================================================
     APPROVED
  ===================================================== */

  if (
    onboarding === "approved" ||
    onboarding === "active"
  ) {

    return "approved";

  }


  /*
   * Legacy records.
   */

  if (
    member === "active" &&
    onboarding !== "pending" &&
    onboarding !== "submitted"
  ) {

    return "approved";

  }


  /* =====================================================
     PENDING
  ===================================================== */

  return "pending";

}


/* =========================================================
   STATUS CONFIGURATION
========================================================= */

function getStatusConfiguration(
  status
) {

  const configs = {


    pending: {

      label:
        "Pending Review",

      className:
        "status-pending",

      message:
        "Your group application has been received and is currently awaiting review. Your administrator account remains restricted until the application is approved.",

      showLogin:
        false

    },


    approved: {

      label:
        "Active",

      className:
        "status-approved",

      message:
        "Your group application has been approved. Your administrator account is active and you can now sign in to access your CHAMA LIVE Dashboard.",

      showLogin:
        true

    },


    rejected: {

      label:
        "Rejected",

      className:
        "status-rejected",

      message:
        "Your group application was not approved. Please contact the CHAMA LIVE administrator if you need clarification or assistance.",

      showLogin:
        false

    },


    suspended: {

      label:
        "Suspended",

      className:
        "status-suspended",

      message:
        "This group account is currently suspended. Dashboard access is temporarily unavailable. Please contact the CHAMA LIVE administrator for assistance.",

      showLogin:
        false

    }

  };


  return (
    configs[status] ||
    configs.pending
  );

}


/* =========================================================
   FIND ADMIN APPLICATION
========================================================= */

async function findApplicationByEmail(
  email
) {

  /*
   * Primary lookup:
   *
   * members.email
   *
   * The registration system stores
   * the administrator email against
   * the administrator member record.
   */

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(`
        id,
        group_id,
        name,
        email,
        role,
        status,
        onboarding_status,
        member_number,
        membership_number,
        created_at,
        groups (
          id,
          name,
          status
        )
      `)
      .eq(
        "email",
        email
      )
      .limit(10);


  if (error) {

    console.error(
      "CHAMA LIVE: application lookup error",
      error
    );


    throw error;

  }


  if (
    !data ||
    data.length === 0
  ) {

    return null;

  }


  /*
   * Find the administrator record.
   *
   * Different historical role values
   * are supported for compatibility.
   */

  const adminRoles = [

    "admin",

    "administrator",

    "group_admin",

    "chairperson"

  ];


  let application =
    data.find(
      member =>
        adminRoles.includes(
          String(
            member.role || ""
          )
            .trim()
            .toLowerCase()
        )
    );


  /*
   * If only one member record matches
   * the email, use it.
   */

  if (
    !application &&
    data.length === 1
  ) {

    application =
      data[0];

  }


  /*
   * Compatibility fallback:
   * use first matching record.
   */

  if (!application) {

    application =
      data[0];

  }


  return application;

}


/* =========================================================
   DISPLAY RESULT
========================================================= */

function displayApplication(
  application
) {

  if (!application) {

    showError(
      "No group application was found for this email address. Please make sure you are using the administrator email registered during group creation."
    );


    return;

  }


  const normalizedStatus =
    normalizeStatus(
      application.onboarding_status,
      application.status
    );


  const config =
    getStatusConfiguration(
      normalizedStatus
    );


  const groupName =
    application.groups?.name ||
    "Your CHAMA LIVE Group";


  /* =====================================================
     STATUS BADGE
  ===================================================== */

  if (statusBadge) {

    statusBadge.textContent =
      config.label;


    statusBadge.className =
      `cl-status-badge ${config.className}`;

  }


  /* =====================================================
     GROUP
  ===================================================== */

  if (groupNameElement) {

    groupNameElement.textContent =
      groupName;

  }


  /* =====================================================
     EMAIL
  ===================================================== */

  if (registeredEmailElement) {

    registeredEmailElement.textContent =
      application.email ||
      "";

  }


  /* =====================================================
     MESSAGE
  ===================================================== */

  if (statusMessageElement) {

    statusMessageElement.textContent =
      config.message;

  }


  /* =====================================================
     ACTION
  ===================================================== */

  if (statusAction) {

    statusAction.hidden =
      !config.showLogin;

  }


  /* =====================================================
     SHOW RESULT
  ===================================================== */

  if (reviewResult) {

    reviewResult.hidden =
      false;


    reviewResult.scrollIntoView({

      behavior:
        "smooth",

      block:
        "nearest"

    });

  }

}


/* =========================================================
   CHECK APPLICATION
========================================================= */

async function checkApplicationStatus() {

  clearError();

  clearStatus();

  clearResult();


  const email =
    String(
      emailInput?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  /* =====================================================
     VALIDATE EMAIL
  ===================================================== */

  if (!email) {

    showError(
      "Please enter the administrator email address."
    );


    emailInput?.focus();


    return;

  }


  const emailPattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


  if (
    !emailPattern.test(
      email
    )
  ) {

    showError(
      "Please enter a valid email address."
    );


    emailInput?.focus();


    return;

  }


  setLoading(
    true
  );


  try {

    showStatus(
      "Checking your group application..."
    );


    const application =
      await findApplicationByEmail(
        email
      );


    clearStatus();


    displayApplication(
      application
    );


  }

  catch (error) {

    console.error(
      "CHAMA LIVE: status lookup failed",
      error
    );


    clearStatus();


    showError(
      "Unable to check your application status right now. Please try again later."
    );

  }

  finally {

    setLoading(
      false
    );

  }

}


/* =========================================================
   FORM SUBMISSION
========================================================= */

if (form) {

  form.addEventListener(
    "submit",
    event => {

      event.preventDefault();


      checkApplicationStatus();

    }
  );

}


/* =========================================================
   EMAIL FROM REGISTRATION FLOW
========================================================= */

/*
 * When redirected from signup.js or login.js,
 * the registered email can be stored locally.
 *
 * This is only for convenience.
 *
 * The database is always queried again.
 */

function loadStoredEmail() {

  try {

    const stored =
      localStorage.getItem(
        "chama_live_review_application"
      );


    if (!stored) {
      return;
    }


    const application =
      JSON.parse(
        stored
      );


    const email =
      String(
        application?.email ||
        ""
      )
        .trim()
        .toLowerCase();


    if (
      email &&
      emailInput
    ) {

      emailInput.value =
        email;


      /*
       * Automatically check status
       * when arriving from login/signup.
       */

      setTimeout(
        () => {

          checkApplicationStatus();

        },
        250
      );

    }

  }

  catch (error) {

    console.warn(
      "CHAMA LIVE: unable to load stored application",
      error
    );

  }

}


/* =========================================================
   INITIALIZE
========================================================= */

loadStoredEmail();


console.log(
  "CHAMA LIVE: account-review.js ready"
);
