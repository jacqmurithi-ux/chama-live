/* =========================================================
   CHAMA LIVE — ACCOUNT REVIEW

   PRODUCTION ACCOUNT STATUS LOOKUP

   Flow:
   ---------------------------------------------------------
   account-review.html
          ↓
   Administrator enters registered email
          ↓
   check_application_status(p_email)
          ↓
   Supabase RPC
          ↓
   Safe application status
          ↓
   Pending / Active / Rejected / Suspended

   IMPORTANT
   ---------------------------------------------------------
   This frontend NEVER queries the members table directly.

   The deployed RPC is responsible for:
      - verifying the registered administrator
      - finding the correct group
      - checking approval status
      - returning safe information only

   Expected RPC:
      public.check_application_status(p_email text)

   Expected safe response:
      {
        found,
        group_name,
        masked_email,
        onboarding_status,
        application_status
      }

========================================================= */

import {
  supabase,
  BASE_URL
} from "./auth.js";


console.log(
  "CHAMA LIVE: account-review.js loaded"
);


/* =========================================================
   CONFIGURATION
========================================================= */

const LOGIN_PAGE =
  `${BASE_URL}/login.html`;

const HOME_PAGE =
  `${BASE_URL}/index.html`;

const STATUS_RPC =
  "check_application_status";


/* =========================================================
   ELEMENTS
========================================================= */

const applicationDetails =
  document.getElementById(
    "applicationDetails"
  );


/*
 * These elements are optional.
 *
 * The script supports the existing
 * account-review.html and will create
 * the lookup interface if it is not
 * already present.
 */

let reviewForm =
  document.getElementById(
    "reviewStatusForm"
  );

let emailInput =
  document.getElementById(
    "reviewEmail"
  );

let checkButton =
  document.getElementById(
    "checkStatusButton"
  );

let errorBox =
  document.getElementById(
    "error"
  );

let statusBox =
  document.getElementById(
    "status"
  );


/* =========================================================
   SAFE HTML ESCAPE
========================================================= */

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


/* =========================================================
   NORMALIZE EMAIL
========================================================= */

function normalizeEmail(
  email
) {

  return String(
    email || ""
  )
    .trim()
    .toLowerCase();

}


/* =========================================================
   VALIDATE EMAIL
========================================================= */

function isValidEmail(
  email
) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    .test(email);

}


/* =========================================================
   CLEAR MESSAGES
========================================================= */

function clearMessages() {

  if (errorBox) {

    errorBox.textContent =
      "";

    errorBox.hidden =
      true;

  }


  if (statusBox) {

    statusBox.textContent =
      "";

    statusBox.hidden =
      true;

  }

}


/* =========================================================
   SHOW ERROR
========================================================= */

function showError(
  message
) {

  const cleanMessage =
    String(
      message ||
      "Unable to check your application."
    );


  console.error(
    "CHAMA LIVE account review:",
    cleanMessage
  );


  if (errorBox) {

    errorBox.textContent =
      cleanMessage;

    errorBox.hidden =
      false;

  } else {

    /*
     * If the current HTML does not
     * have an error element, display
     * the message inside the details area.
     */

    if (applicationDetails) {

      applicationDetails.innerHTML = `
        <div class="cl-review-error">
          ${escapeHtml(cleanMessage)}
        </div>
      `;

    }

  }

}


/* =========================================================
   SHOW STATUS MESSAGE
========================================================= */

function showStatusMessage(
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


/* =========================================================
   LOADING STATE
========================================================= */

function setLoading(
  loading
) {

  if (checkButton) {

    checkButton.disabled =
      loading;


    checkButton.textContent =
      loading
        ? "Checking..."
        : "Check Application Status";

  }


  if (emailInput) {

    emailInput.disabled =
      loading;

  }

}


/* =========================================================
   NORMALIZE RPC STATUS
========================================================= */

function normalizeApplicationStatus(
  result
) {

  const onboarding =
    String(
      result?.onboarding_status ||
      ""
    )
      .trim()
      .toLowerCase();


  const application =
    String(
      result?.application_status ||
      ""
    )
      .trim()
      .toLowerCase();


  /*
   * Suspended has highest priority.
   */

  if (
    onboarding === "suspended" ||
    application === "suspended"
  ) {

    return "suspended";

  }


  /*
   * Rejected.
   */

  if (
    onboarding === "rejected" ||
    application === "rejected"
  ) {

    return "rejected";

  }


  /*
   * Active / approved.
   */

  if (
    onboarding === "active" ||
    onboarding === "approved" ||
    application === "active" ||
    application === "approved"
  ) {

    return "active";

  }


  /*
   * Pending / submitted / awaiting review.
   */

  if (
    onboarding === "pending" ||
    onboarding === "submitted" ||
    application === "pending" ||
    application === "submitted"
  ) {

    return "pending";

  }


  /*
   * Fail closed.
   */

  return "pending";

}


/* =========================================================
   STATUS LABEL
========================================================= */

function getStatusLabel(
  status
) {

  switch (
    status
  ) {

    case "active":
      return "Active";

    case "rejected":
      return "Rejected";

    case "suspended":
      return "Suspended";

    case "pending":
    default:
      return "Pending Review";

  }

}


/* =========================================================
   STATUS CLASS
========================================================= */

function getStatusClass(
  status
) {

  switch (
    status
  ) {

    case "active":
      return "active";

    case "rejected":
      return "rejected";

    case "suspended":
      return "suspended";

    case "pending":
    default:
      return "pending";

  }

}


/* =========================================================
   STATUS DESCRIPTION
========================================================= */

function getStatusDescription(
  status
) {

  switch (
    status
  ) {

    case "active":

      return (
        "Your CHAMA LIVE group account has been " +
        "approved. You can now sign in and access " +
        "your Dashboard."
      );


    case "rejected":

      return (
        "Your CHAMA LIVE group application was not " +
        "approved. Please contact CHAMA LIVE support " +
        "or the administrator for assistance."
      );


    case "suspended":

      return (
        "Your CHAMA LIVE account is currently " +
        "suspended. Dashboard access is unavailable " +
        "until the account is restored."
      );


    case "pending":

    default:

      return (
        "Your group application has been received " +
        "and is currently awaiting review. You will " +
        "be able to sign in after approval."
      );

  }

}


/* =========================================================
   RENDER APPLICATION RESULT
========================================================= */

function renderApplicationResult(
  result,
  email
) {

  if (!applicationDetails) {
    return;
  }


  /*
   * RPC did not find a matching
   * registered administrator.
   */

  if (
    !result ||
    result.found === false
  ) {

    applicationDetails.innerHTML = `

      <div class="cl-review-result cl-review-not-found">

        <div class="cl-review-result-icon">
          ?
        </div>

        <h3>
          Application not found
        </h3>

        <p>
          We could not find a CHAMA LIVE group
          application registered to this email address.
        </p>

        <p class="cl-review-muted">
          Please enter the same email address used
          when the group administrator account was
          registered.
        </p>

        <div class="cl-review-result-email">
          ${escapeHtml(email)}
        </div>

      </div>

    `;

    return;

  }


  const applicationStatus =
    normalizeApplicationStatus(
      result
    );


  const statusLabel =
    getStatusLabel(
      applicationStatus
    );


  const statusClass =
    getStatusClass(
      applicationStatus
    );


  const description =
    getStatusDescription(
      applicationStatus
    );


  const groupName =
    result.group_name ||
    "Your CHAMA LIVE group";


  const maskedEmail =
    result.masked_email ||
    email;


  applicationDetails.innerHTML = `

    <div
      class="
        cl-review-result
        cl-review-result-${escapeHtml(statusClass)}
      "
    >

      <div class="cl-review-result-header">

        <div class="cl-review-result-icon">

          ${
            applicationStatus === "active"
              ? "✓"
              : applicationStatus === "rejected"
                ? "!"
                : applicationStatus === "suspended"
                  ? "!"
                  : "•"
          }

        </div>

        <div>

          <div class="cl-review-result-label">
            Application status
          </div>

          <div
            class="
              cl-review-result-status
              cl-status-${escapeHtml(statusClass)}
            "
          >
            ${escapeHtml(statusLabel)}
          </div>

        </div>

      </div>


      <div class="cl-review-result-group">

        <span>
          Group
        </span>

        <strong>
          ${escapeHtml(groupName)}
        </strong>

      </div>


      <div class="cl-review-result-email-row">

        <span>
          Registered administrator
        </span>

        <strong>
          ${escapeHtml(maskedEmail)}
        </strong>

      </div>


      <div class="cl-review-result-description">

        ${escapeHtml(description)}

      </div>


      ${
        applicationStatus === "active"

          ? `
            <a
              href="${escapeHtml(LOGIN_PAGE)}"
              class="btn btn-primary cl-full-btn"
            >
              Sign In to Dashboard
            </a>
          `

          : applicationStatus === "pending"

            ? `
              <div class="cl-review-next-step">
                <strong>
                  Next step
                </strong>

                <span>
                  Please wait for the review to be
                  completed. You can return here later
                  using your registered administrator email.
                </span>
              </div>
            `

          : applicationStatus === "rejected"

            ? `
              <div class="cl-review-next-step">
                <strong>
                  Need assistance?
                </strong>

                <span>
                  Please contact CHAMA LIVE support
                  regarding your application.
                </span>
              </div>
            `

          : `
              <div class="cl-review-next-step">
                <strong>
                  Account restricted
                </strong>

                <span>
                  Please contact your CHAMA LIVE
                  administrator or support team.
                </span>
              </div>
            `
      }

    </div>

  `;

}


/* =========================================================
   RPC ERROR NORMALIZATION
========================================================= */

function normalizeRpcError(
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
      "function"
    ) &&
    lower.includes(
      "does not exist"
    )
  ) {

    return (
      "The application status service is temporarily " +
      "unavailable. Please try again later."
    );

  }


  if (
    lower.includes(
      "permission"
    ) ||
    lower.includes(
      "not allowed"
    )
  ) {

    return (
      "You are not authorized to perform this " +
      "application status check."
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
    "We could not check your application status " +
    "right now. Please try again."
  );

}


/* =========================================================
   CHECK APPLICATION STATUS
========================================================= */

async function checkApplicationStatus() {

  clearMessages();


  const email =
    normalizeEmail(
      emailInput?.value
    );


  /*
   * Email is required.
   */

  if (!email) {

    showError(
      "Please enter the email address used to register the group."
    );

    emailInput?.focus();

    return;

  }


  /*
   * Validate email.
   */

  if (
    !isValidEmail(
      email
    )
  ) {

    showError(
      "Please enter a valid email address."
    );

    emailInput?.focus();

    return;

  }


  /*
   * Do not display stale results.
   */

  if (applicationDetails) {

    applicationDetails.innerHTML =
      "";

  }


  setLoading(
    true
  );


  showStatusMessage(
    "Checking your registered group application..."
  );


  try {

    console.log(
      "CHAMA LIVE: checking application status"
    );


    /*
     * =====================================================
     * DEPLOYED RPC
     * =====================================================
     *
     * IMPORTANT:
     *
     * Do NOT replace this with:
     *
     * supabase
     *   .from("members")
     *
     * The RPC is the security boundary.
     */

    const {
      data,
      error
    } =
      await supabase.rpc(
        STATUS_RPC,
        {
          p_email:
            email
        }
      );


    if (error) {

      throw error;

    }


    console.log(
      "CHAMA LIVE: application status received",
      {
        found:
          data?.found,

        group_name:
          data?.group_name,

        masked_email:
          data?.masked_email,

        onboarding_status:
          data?.onboarding_status,

        application_status:
          data?.application_status
      }
    );


    /*
     * Supabase RPC functions may return:
     *
     * 1. an object
     * 2. an array containing one object
     *
     * Support both without exposing
     * any additional database data.
     */

    let result =
      data;


    if (
      Array.isArray(data)
    ) {

      result =
        data[0] ||
        {
          found:
            false
        };

    }


    renderApplicationResult(
      result,
      email
    );


    showStatusMessage(
      ""
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: application status lookup failed",
      error
    );


    if (applicationDetails) {

      applicationDetails.innerHTML =
        "";

    }


    showStatusMessage(
      ""
    );


    showError(
      normalizeRpcError(
        error
      )
    );

  }

  finally {

    setLoading(
      false
    );

  }

}


/* =========================================================
   CREATE LOOKUP UI IF HTML DOES NOT HAVE IT
========================================================= */

function ensureLookupInterface() {

  /*
   * If the page already contains the form,
   * preserve it completely.
   */

  if (
    reviewForm &&
    emailInput &&
    checkButton
  ) {

    return;

  }


  /*
   * Existing page may only contain the
   * informational review screen.
   *
   * Insert the administrator status
   * lookup immediately before the
   * application details section.
   */

  if (!applicationDetails) {

    console.warn(
      "CHAMA LIVE: applicationDetails element not found."
    );

    return;

  }


  const wrapper =
    document.createElement(
      "div"
    );


  wrapper.className =
    "cl-status-lookup";


  wrapper.innerHTML = `

    <div class="cl-status-lookup-header">

      <div class="cl-status-lookup-icon">
        ✓
      </div>

      <div>

        <h2>
          Check your application
        </h2>

        <p>
          Enter the registered administrator
          email to securely view your group status.
        </p>

      </div>

    </div>


    <form
      id="reviewStatusForm"
      class="cl-status-lookup-form"
      novalidate
    >

      <div class="form-group">

        <label for="reviewEmail">
          Registered administrator email
        </label>

        <input
          id="reviewEmail"
          name="reviewEmail"
          type="email"
          required
          autocomplete="email"
          inputmode="email"
          placeholder="you@example.com"
        >

        <small>
          Use the same email address used when
          creating the group account.
        </small>

      </div>


      <button
        id="checkStatusButton"
        type="submit"
        class="btn btn-primary cl-full-btn"
      >
        Check Application Status
      </button>

    </form>

  `;


  applicationDetails.parentNode.insertBefore(
    wrapper,
    applicationDetails
  );


  /*
   * Re-read the dynamically-created
   * elements.
   */

  reviewForm =
    document.getElementById(
      "reviewStatusForm"
    );


  emailInput =
    document.getElementById(
      "reviewEmail"
    );


  checkButton =
    document.getElementById(
      "checkStatusButton"
    );


  if (reviewForm) {

    reviewForm.addEventListener(
      "submit",
      event => {

        event.preventDefault();

        checkApplicationStatus();

      }
    );

  }

}


/* =========================================================
   EXISTING FORM INITIALIZATION
========================================================= */

function initializeExistingForm() {

  if (!reviewForm) {
    return;
  }


  if (!emailInput) {
    return;
  }


  if (checkButton) {

    reviewForm.addEventListener(
      "submit",
      event => {

        event.preventDefault();

        checkApplicationStatus();

      }
    );

  }

}


/* =========================================================
   PRE-FILL REGISTERED EMAIL
========================================================= */

function restoreRegisteredEmail() {

  /*
   * Login.js stores this object when a
   * pending user is redirected here.
   *
   * Example:
   *
   * chama_live_review_application
   *
   * {
   *   member_number,
   *   email
   * }
   *
   * We only use the email.
   *
   * No member number is displayed.
   */

  try {

    const stored =
      localStorage.getItem(
        "chama_live_review_application"
      );


    if (!stored) {
      return;
    }


    const parsed =
      JSON.parse(
        stored
      );


    const email =
      normalizeEmail(
        parsed?.email
      );


    if (
      email &&
      emailInput
    ) {

      emailInput.value =
        email;

    }

  }

  catch (error) {

    console.warn(
      "CHAMA LIVE: unable to restore review email",
      error
    );

  }

}


/* =========================================================
   OPTIONAL AUTO CHECK
========================================================= */

function shouldAutoCheck() {

  /*
   * We deliberately DO NOT automatically
   * query the RPC merely because an email
   * was stored in localStorage.
   *
   * The administrator should explicitly
   * submit the registered email.
   */

  return false;

}


/* =========================================================
   INITIALIZE
========================================================= */

function initialize() {

  ensureLookupInterface();


  initializeExistingForm();


  restoreRegisteredEmail();


  if (
    shouldAutoCheck()
  ) {

    checkApplicationStatus();

  }


  console.log(
    "CHAMA LIVE: account-review.js ready"
  );

}


/* =========================================================
   START
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initialize,
    {
      once:
        true
    }
  );

} else {

  initialize();

}
