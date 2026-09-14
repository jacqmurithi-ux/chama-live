/* =========================================================
   CHAMA LIVE — ACCOUNT REVIEW

   SECURITY MODEL
   ---------------------------------------------------------
   1. Authenticated pending applicant:
        auth.uid()
          ↓
        own group_applications row
          ↓
        pending/rejected/application status

   2. Existing registered administrator:
        check_application_status(p_email)
          ↓
        safe approved-account status

   IMPORTANT
   ---------------------------------------------------------
   - Never query another applicant's application.
   - Never expose auth_user_id.
   - Never expose access_code before approval.
   - Never expose approved_member_number before approval.
   - Never create groups or members.
========================================================= */

import {
  supabase,
  BASE_URL
} from "./auth.js";


console.log(
  "CHAMA LIVE: account-review.js loaded"
);


/* =========================================================
   CONSTANTS
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
   HTML ESCAPE
========================================================= */

function escapeHtml(value) {

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
   EMAIL
========================================================= */

function normalizeEmail(email) {

  return String(
    email || ""
  )
    .trim()
    .toLowerCase();

}


function isValidEmail(email) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    .test(email);

}


/* =========================================================
   MESSAGES
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


function showError(message) {

  const clean =
    String(
      message ||
      "Unable to check your application."
    );

  console.error(
    "CHAMA LIVE account review:",
    clean
  );

  if (errorBox) {

    errorBox.textContent =
      clean;

    errorBox.hidden =
      false;

  }

}


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

function setLoading(loading) {

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
   STATUS NORMALIZATION
========================================================= */

function normalizeStatus(result) {

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
      result?.status ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    onboarding === "suspended" ||
    application === "suspended"
  ) {

    return "suspended";

  }

  if (
    onboarding === "rejected" ||
    application === "rejected"
  ) {

    return "rejected";

  }

  if (
    onboarding === "active" ||
    onboarding === "approved" ||
    application === "active" ||
    application === "approved"
  ) {

    return "active";

  }

  return "pending";

}


/* =========================================================
   STATUS TEXT
========================================================= */

function statusLabel(status) {

  switch (status) {

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


function statusDescription(status) {

  switch (status) {

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
        "for assistance."
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
        "be able to access the Dashboard after approval."
      );

  }

}


/* =========================================================
   RENDER
========================================================= */

function renderResult(
  result,
  email
) {

  if (!applicationDetails) {
    return;
  }

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
          We could not find a CHAMA LIVE application
          registered to this email address.
        </p>

        <p class="cl-review-muted">
          Please use the same email address used
          during group registration.
        </p>

        <div class="cl-review-result-email">
          ${escapeHtml(email)}
        </div>

      </div>

    `;

    return;

  }

  const status =
    normalizeStatus(
      result
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
        cl-review-result-${escapeHtml(status)}
      "
    >

      <div class="cl-review-result-header">

        <div class="cl-review-result-icon">

          ${
            status === "active"
              ? "✓"
              : status === "rejected"
                ? "!"
                : status === "suspended"
                  ? "!"
                  : "•"
          }

        </div>

        <div>

          <div class="cl-review-result-label">
            Application status
          </div>

          <div class="
            cl-review-result-status
            cl-status-${escapeHtml(status)}
          ">
            ${escapeHtml(
              statusLabel(status)
            )}
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

        ${escapeHtml(
          statusDescription(status)
        )}

      </div>


      ${
        status === "active"

          ? `
            <a
              href="${escapeHtml(LOGIN_PAGE)}"
              class="btn btn-primary cl-full-btn"
            >
              Sign In to Dashboard
            </a>
          `

          : status === "pending"

            ? `
              <div class="cl-review-next-step">

                <strong>
                  Next step
                </strong>

                <span>
                  CHAMA LIVE is reviewing your
                  group application. You can
                  return here later to check again.
                </span>

              </div>
            `

          : status === "rejected"

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
                  Please contact CHAMA LIVE support
                  regarding your account.
                </span>

              </div>
            `
      }

    </div>

  `;

}


/* =========================================================
   AUTHENTICATED OWN APPLICATION
========================================================= */

async function checkOwnPendingApplication(
  email
) {

  const {
    data: sessionData,
    error: sessionError
  } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  const user =
    sessionData?.session?.user;

  /*
   * No authenticated user:
   *
   * Cannot safely query group_applications because
   * its SELECT policy is scoped to auth.uid().
   *
   * Caller must use the existing status RPC.
   */
  if (!user) {

    return null;

  }

  const userEmail =
    normalizeEmail(
      user.email
    );

  /*
   * Never allow the authenticated user to use
   * another email to query their application.
   */
  if (
    !userEmail ||
    userEmail !== email
  ) {

    throw new Error(
      "Please use the email address associated with your CHAMA LIVE login."
    );

  }

  const {
    data,
    error
  } =
    await supabase
      .from(
        "group_applications"
      )
      .select(
        [
          "group_name",
          "email",
          "status",
          "created_at"
        ].join(",")
      )
      .eq(
        "auth_user_id",
        user.id
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  /*
   * Convert the existing application row into
   * the safe rendering contract.
   *
   * No internal identifiers are exposed.
   */
  return {

    found:
      true,

    group_name:
      data.group_name,

    masked_email:
      maskEmail(
        data.email ||
        email
      ),

    application_status:
      data.status,

    onboarding_status:
      data.status

  };

}


/* =========================================================
   EMAIL MASK
========================================================= */

function maskEmail(email) {

  const normalized =
    normalizeEmail(email);

  const at =
    normalized.indexOf("@");

  if (
    at <= 0
  ) {

    return normalized;

  }

  const local =
    normalized.substring(
      0,
      at
    );

  const domain =
    normalized.substring(
      at
    );

  if (
    local.length <= 2
  ) {

    return (
      local.charAt(0) +
      "*" +
      domain
    );

  }

  return (
    local.charAt(0) +
    "*".repeat(
      Math.max(
        1,
        local.length - 2
      )
    ) +
    local.charAt(
      local.length - 1
    ) +
    domain
  );

}


/* =========================================================
   EXISTING REGISTERED ACCOUNT RPC
========================================================= */

async function checkRegisteredAccount(
  email
) {

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

  let result =
    data;

  if (
    Array.isArray(data)
  ) {

    result =
      data[0] || {
        found:
          false
      };

  }

  return result;

}


/* =========================================================
   MAIN STATUS CHECK
========================================================= */

async function checkApplicationStatus() {

  clearMessages();

  const email =
    normalizeEmail(
      emailInput?.value
    );

  if (!email) {

    showError(
      "Please enter the email address used to register the group."
    );

    emailInput?.focus();

    return;

  }

  if (
    !isValidEmail(email)
  ) {

    showError(
      "Please enter a valid email address."
    );

    emailInput?.focus();

    return;

  }

  if (applicationDetails) {

    applicationDetails.innerHTML =
      "";

  }

  setLoading(
    true
  );

  showStatus(
    "Checking your registered group application..."
  );

  try {

    /*
     * First attempt the authenticated application
     * boundary. This is what makes pending
     * applications visible after confirmation.
     */
    const ownApplication =
      await checkOwnPendingApplication(
        email
      );

    if (ownApplication) {

      renderResult(
        ownApplication,
        email
      );

      showStatus(
        ""
      );

      return;

    }


    /*
     * No authenticated application was available.
     *
     * Preserve the existing production RPC for
     * approved/registered administrators.
     */
    const registeredAccount =
      await checkRegisteredAccount(
        email
      );

    renderResult(
      registeredAccount,
      email
    );

    showStatus(
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
   ERROR NORMALIZATION
========================================================= */

function normalizeRpcError(error) {

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
      "email address associated"
    )
  ) {

    return message;

  }

  if (
    lower.includes(
      "permission"
    ) ||
    lower.includes(
      "row-level security"
    )
  ) {

    return (
      "Please sign in with the administrator account " +
      "used to register this group before checking " +
      "a pending application."
    );

  }

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
   DYNAMIC LOOKUP UI
========================================================= */

function ensureLookupInterface() {

  if (
    reviewForm &&
    emailInput &&
    checkButton
  ) {

    return;

  }

  if (!applicationDetails) {
    return;
  }

  const wrapper =
    document.createElement(
      "form"
    );

  wrapper.id =
    "reviewStatusForm";

  wrapper.className =
    "cl-review-form";

  wrapper.innerHTML = `

    <div class="cl-review-field">

      <label for="reviewEmail">
        Registered administrator email
      </label>

      <input
        id="reviewEmail"
        name="reviewEmail"
        type="email"
        autocomplete="email"
        required
        placeholder="you@example.com"
      >

      <span class="cl-review-help">
        Use the email address associated with
        your CHAMA LIVE administrator account.
      </span>

    </div>

    <button
      id="checkStatusButton"
      class="cl-review-button"
      type="submit"
    >
      Check Application Status
    </button>

  `;

  applicationDetails.parentNode.insertBefore(
    wrapper,
    applicationDetails
  );

  reviewForm =
    wrapper;

  emailInput =
    wrapper.querySelector(
      "#reviewEmail"
    );

  checkButton =
    wrapper.querySelector(
      "#checkStatusButton"
    );

}


/* =========================================================
   FORM BINDING
========================================================= */

function bindForm() {

  if (!reviewForm) {
    return;
  }

  reviewForm.addEventListener(
    "submit",
    event => {

      event.preventDefault();

      checkApplicationStatus();

    }
  );

}


/* =========================================================
   SUBMISSION MESSAGE
========================================================= */

function showSubmissionMessage() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  if (
    params.get(
      "submitted"
    ) !== "1"
  ) {

    return;

  }

  showStatus(
    "Application submitted — awaiting review."
  );

}


/* =========================================================
   INITIALIZE
========================================================= */

ensureLookupInterface();

bindForm();

showSubmissionMessage();

console.log(
  "CHAMA LIVE: account-review.js ready"
);
