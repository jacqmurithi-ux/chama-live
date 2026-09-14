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

   3. Email-confirmation continuation:
        authenticated session
          ↓
        safe pending onboarding data
          ↓
        email ownership check
          ↓
        submit_group_application()
          ↓
        pending application
          ↓
        account review

   IMPORTANT
   ---------------------------------------------------------
   - Never query another applicant's application.
   - Never expose auth_user_id.
   - Never expose access_code before approval.
   - Never expose approved_member_number before approval.
   - Never create groups or members.
   - Never store or recover passwords.
   - Never create subscriptions.
   - Never perform accounting.
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

const STATUS_RPC =
  "check_application_status";

const PENDING_KEY =
  "chama_live_pending_group_onboarding";


/* =========================================================
   ELEMENTS

   IMPORTANT
   ---------------------------------------------------------
   These IDs MUST match account-review.html.
========================================================= */

const reviewForm =
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

const applicationDetails =
  document.getElementById(
    "reviewResult"
  );

const errorBox =
  document.getElementById(
    "error"
  );

const statusBox =
  document.getElementById(
    "status"
  );

const statusBadge =
  document.getElementById(
    "statusBadge"
  );

const groupNameBox =
  document.getElementById(
    "groupName"
  );

const registeredEmailBox =
  document.getElementById(
    "registeredEmail"
  );

const statusMessageBox =
  document.getElementById(
    "statusMessage"
  );

const statusAction =
  document.getElementById(
    "statusAction"
  );


/* =========================================================
   CONTINUATION LOCK
========================================================= */

let pendingContinuationRunning =
  false;


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
      return "Approved";

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
   STATUS BADGE CLASS
========================================================= */

function statusBadgeClass(status) {

  switch (status) {

    case "active":
      return "status-approved";

    case "rejected":
      return "status-rejected";

    case "suspended":
      return "status-suspended";

    case "pending":
    default:
      return "status-pending";

  }

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
   RENDER RESULT

   Uses the existing DOM contract from account-review.html.
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

    applicationDetails.hidden =
      false;

    if (statusBadge) {

      statusBadge.className =
        "cl-status-badge status-rejected";

      statusBadge.textContent =
        "Not Found";

    }

    if (groupNameBox) {

      groupNameBox.textContent =
        "Application not found";

    }

    if (registeredEmailBox) {

      registeredEmailBox.textContent =
        email;

    }

    if (statusMessageBox) {

      statusMessageBox.textContent =
        "We could not find a CHAMA LIVE application registered to this email address. Please use the same email address used during group registration.";

    }

    if (statusAction) {

      statusAction.hidden =
        true;

    }

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
    maskEmail(
      email
    );

  applicationDetails.hidden =
    false;

  if (statusBadge) {

    statusBadge.className =
      `cl-status-badge ${statusBadgeClass(status)}`;

    statusBadge.textContent =
      statusLabel(status);

  }

  if (groupNameBox) {

    groupNameBox.textContent =
      groupName;

  }

  if (registeredEmailBox) {

    registeredEmailBox.textContent =
      maskedEmail;

  }

  if (statusMessageBox) {

    statusMessageBox.textContent =
      statusDescription(
        status
      );

  }

  if (statusAction) {

    statusAction.hidden =
      status !== "active";

  }

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
   * Cannot safely query group_applications through
   * the authenticated ownership boundary.
   *
   * Caller will use the existing status RPC.
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
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(1)
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
   PENDING ONBOARDING
========================================================= */

function loadPendingOnboarding() {

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

      clearPendingOnboarding();

      return null;

    }

    return data;

  }

  catch (error) {

    console.warn(
      "CHAMA LIVE: Could not restore pending onboarding data.",
      error
    );

    clearPendingOnboarding();

    return null;

  }

}


function clearPendingOnboarding() {

  localStorage.removeItem(
    PENDING_KEY
  );

}


/* =========================================================
   PENDING ACCOUNT OWNERSHIP
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
      "No pending group application was found."
    );

  }

  if (!session?.user) {

    throw new Error(
      "Your account is not authenticated."
    );

  }

  const pendingEmail =
    normalizeEmail(
      pending.email
    );

  const authenticatedEmail =
    normalizeEmail(
      session.user.email
    );

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
   PENDING APPLICATION VALUES
========================================================= */

function buildPendingApplicationValues(
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
      String(
        pending.adminPhone ||
        ""
      ).trim(),

    email:
      normalizeEmail(
        pending.email
      )

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
    !isValidEmail(
      values.email
    )
  ) {

    throw new Error(
      "The saved registration email is invalid."
    );

  }

}


/* =========================================================
   SUBMIT GROUP APPLICATION

   Canonical existing application boundary.
========================================================= */

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
   COMPLETE CONFIRMED PENDING APPLICATION
========================================================= */

async function completePendingApplication(
  session
) {

  if (
    pendingContinuationRunning
  ) {

    return;

  }

  const pending =
    loadPendingOnboarding();

  if (!pending) {

    return;

  }

  pendingContinuationRunning =
    true;

  try {

    validatePendingOwnership(
      pending,
      session
    );

    const values =
      buildPendingApplicationValues(
        pending
      );

    validatePendingApplication(
      values
    );

    showStatus(
      "Email confirmed. Submitting your group application..."
    );

    await submitGroupApplication(
      values
    );

    /*
     * Remove pending data ONLY after the
     * canonical application RPC succeeds.
     */
    clearPendingOnboarding();

    showStatus(
      "Group application submitted successfully. Your application is now awaiting review."
    );

    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}?submitted=1`
    );

    showSubmissionMessage();

    /*
     * Render the newly submitted application
     * through the authenticated ownership lookup.
     */
    const email =
      normalizeEmail(
        session.user.email
      );

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
        "Application submitted — awaiting review."
      );

    }

  }

  finally {

    pendingContinuationRunning =
      false;

  }

}


/* =========================================================
   EMAIL-CONFIRMATION CONTINUATION
========================================================= */

supabase.auth.onAuthStateChange(
  (
    event,
    session
  ) => {

    if (
      event !==
      "SIGNED_IN"
    ) {

      return;

    }

    if (
      !session?.user
    ) {

      return;

    }

    if (
      pendingContinuationRunning
    ) {

      return;

    }

    if (
      !loadPendingOnboarding()
    ) {

      return;

    }

    setTimeout(
      async () => {

        try {

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

          if (
            !currentSession?.user
          ) {

            throw new Error(
              "Your confirmed account session could not be established. Please refresh and try again."
            );

          }

          await completePendingApplication(
            currentSession
          );

        }

        catch (error) {

          console.error(
            "CHAMA LIVE: pending signup continuation failed:",
            error
          );

          showError(
            normalizeRpcError(
              error
            )
          );

        }

      },
      0
    );

  }
);


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

    applicationDetails.hidden =
      true;

  }

  setLoading(
    true
  );

  showStatus(
    "Checking your registered group application..."
  );

  try {

    /*
     * First attempt the authenticated ownership
     * boundary.
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
     * No authenticated own application was found.
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

      applicationDetails.hidden =
        true;

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
      "application already exists"
    )
  ) {

    return (
      "A group application already exists for this account."
    );

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
   FORM BINDING
========================================================= */

function bindForm() {

  if (!reviewForm) {

    console.error(
      "CHAMA LIVE: account review form #reviewLookupForm was not found."
    );

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

bindForm();

showSubmissionMessage();

console.log(
  "CHAMA LIVE: account-review.js ready"
);
