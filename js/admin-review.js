/* =========================================================
   CHAMA LIVE — ADMIN REVIEW

   COMPLETE PRODUCTION VERSION

   LIVE DATABASE FLOW
   ---------------------------------------------------------
   Platform Admin
        ↓
   list_pending_group_applications()
        ↓
   Admin selects application
        ↓
   APPROVE
        ↓
   approve_group_application(uuid)
        ↓
   group + admin member created
        ↓
   application marked approved
        ↓
   send-review-email Edge Function
        ↓
   approval email sent
        ↓
   Applicant signs in
        ↓
   Dashboard

   REJECT
        ↓
   reject_group_application(uuid, reason)
        ↓
   application marked rejected
        ↓
   send-review-email Edge Function
        ↓
   rejection email sent

   IMPORTANT
   ---------------------------------------------------------
   This file NEVER directly updates:

       group_applications
       groups
       members

   All approval/rejection changes happen through
   the protected live RPC functions.
========================================================= */

import {
  supabase,
  BASE_URL
} from "./auth.js";


console.log(
  "CHAMA LIVE: admin-review.js loaded"
);


/* =========================================================
   CONFIGURATION
========================================================= */

const SEND_REVIEW_EMAIL_FUNCTION =
  "send-review-email";


const LOGIN_PAGE =
  `${BASE_URL}/login.html`;


/* =========================================================
   STATE
========================================================= */

let applications = [];

let selectedApplication = null;

let loadingApplications = false;

let processingApplication = false;


/* =========================================================
   ELEMENTS
========================================================= */

const applicationList =
  document.getElementById(
    "applicationList"
  );


const applicationsContainer =
  document.getElementById(
    "applications"
  ) ||
  document.getElementById(
    "applicationsContainer"
  );


const loadingBox =
  document.getElementById(
    "loading"
  );


const emptyBox =
  document.getElementById(
    "empty"
  );


const errorBox =
  document.getElementById(
    "error"
  );


const statusBox =
  document.getElementById(
    "status"
  );


const refreshButton =
  document.getElementById(
    "refreshButton"
  );


const logoutButton =
  document.getElementById(
    "logoutButton"
  );


/* =========================================================
   GENERIC ELEMENT HELPERS
========================================================= */

function escapeHtml(
  value
) {

  return String(
    value ??
    ""
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
   STATUS
========================================================= */

function showStatus(
  message
) {

  if (!statusBox) {
    return;
  }


  statusBox.textContent =
    String(
      message ||
      ""
    );


  statusBox.hidden =
    !message;

}


/* =========================================================
   ERROR
========================================================= */

function showError(
  message
) {

  const cleanMessage =
    String(
      message ||
      "Something went wrong."
    );


  console.error(
    "CHAMA LIVE ADMIN REVIEW:",
    cleanMessage
  );


  if (errorBox) {

    errorBox.textContent =
      cleanMessage;

    errorBox.hidden =
      false;

  }


  showStatus(
    ""
  );

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
   LOADING UI
========================================================= */

function setLoading(
  loading
) {

  loadingApplications =
    loading;


  if (loadingBox) {

    loadingBox.hidden =
      !loading;

  }


  if (refreshButton) {

    refreshButton.disabled =
      loading;

    refreshButton.textContent =
      loading
        ? "Refreshing..."
        : "Refresh";

  }

}


/* =========================================================
   PROCESSING UI
========================================================= */

function setProcessing(
  processing
) {

  processingApplication =
    processing;


  document
    .querySelectorAll(
      "[data-approve]"
    )
    .forEach(
      button => {

        button.disabled =
          processing;

      }
    );


  document
    .querySelectorAll(
      "[data-reject]"
    )
    .forEach(
      button => {

        button.disabled =
          processing;

      }
    );

}


/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function normalizeError(
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
      "authentication required"
    )
  ) {

    return (
      "Your administrator session has expired. " +
      "Please sign in again."
    );

  }


  if (
    lower.includes(
      "platform administrator access required"
    )
  ) {

    return (
      "Platform administrator access is required " +
      "to review group applications."
    );

  }


  if (
    lower.includes(
      "application not found"
    )
  ) {

    return (
      "This application could not be found. " +
      "It may have already been processed."
    );

  }


  if (
    lower.includes(
      "already approved"
    )
  ) {

    return (
      "This application has already been approved."
    );

  }


  if (
    lower.includes(
      "rejected applications cannot be approved"
    )
  ) {

    return (
      "A rejected application cannot be approved."
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
      "Please check your internet connection."
    );

  }


  return (
    message ||
    "The requested operation could not be completed."
  );

}


/* =========================================================
   VERIFY PLATFORM ADMIN
========================================================= */

async function verifyPlatformAdmin() {

  const {
    data: {
      session
    } = {},
    error: sessionError
  } =
    await supabase.auth.getSession();


  if (sessionError) {
    throw sessionError;
  }


  if (!session?.user) {

    throw new Error(
      "Authentication required."
    );

  }


  const {
    data,
    error
  } =
    await supabase.rpc(
      "is_platform_admin"
    );


  if (error) {
    throw error;
  }


  if (data !== true) {

    throw new Error(
      "Platform administrator access required."
    );

  }


  return session.user;

}


/* =========================================================
   LOAD PENDING APPLICATIONS
========================================================= */

async function loadPendingApplications() {

  clearMessages();


  setLoading(
    true
  );


  try {

    await verifyPlatformAdmin();


    showStatus(
      "Loading pending applications..."
    );


    /*
     * IMPORTANT:
     *
     * This calls the exact live RPC:
     *
     * list_pending_group_applications()
     *
     * It does NOT query group_applications
     * directly.
     */

    const {
      data,
      error
    } =
      await supabase.rpc(
        "list_pending_group_applications"
      );


    if (error) {
      throw error;
    }


    applications =
      Array.isArray(data)
        ? data
        : [];


    console.log(
      "CHAMA LIVE: pending applications",
      applications
    );


    renderApplications();


    showStatus(
      applications.length
        ? `${applications.length} pending application${applications.length === 1 ? "" : "s"}.`
        : "No pending applications."
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: failed loading applications",
      error
    );


    showError(
      normalizeError(
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
   FORMAT DATE
========================================================= */

function formatDate(
  value
) {

  if (!value) {
    return "—";
  }


  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return String(
      value
    );

  }


  return new Intl.DateTimeFormat(
    "en-KE",
    {
      dateStyle:
        "medium",
      timeStyle:
        "short"
    }
  ).format(
    date
  );

}


/* =========================================================
   APPLICATION DISPLAY VALUE
========================================================= */

function applicationId(
  application
) {

  return (
    application?.id ||
    application?.application_id ||
    ""
  );

}


/* =========================================================
   RENDER APPLICATIONS
========================================================= */

function renderApplications() {

  const target =
    applicationList ||
    applicationsContainer;


  if (!target) {

    console.warn(
      "CHAMA LIVE: application list container not found."
    );

    return;

  }


  target.innerHTML =
    "";


  if (
    applications.length ===
    0
  ) {

    if (emptyBox) {

      emptyBox.hidden =
        false;

    }


    target.innerHTML = `
      <div class="cl-empty-review">
        <strong>No pending applications</strong>
        <p>
          New group applications will appear here
          when they are submitted.
        </p>
      </div>
    `;


    return;

  }


  if (emptyBox) {

    emptyBox.hidden =
      true;

  }


  applications.forEach(
    application => {

      target.appendChild(
        createApplicationCard(
          application
        )
      );

    }
  );

}


/* =========================================================
   CREATE APPLICATION CARD
========================================================= */

function createApplicationCard(
  application
) {

  const card =
    document.createElement(
      "article"
    );


  card.className =
    "cl-review-application";


  const id =
    applicationId(
      application
    );


  card.dataset.applicationId =
    id;


  const groupName =
    application.group_name ||
    "Unnamed group";


  const category =
    application.category ||
    "Other";


  const adminName =
    application.admin_name ||
    "—";


  const adminPhone =
    application.admin_phone ||
    "—";


  const email =
    application.email ||
    "—";


  const country =
    application.country ||
    "Kenya";


  const contribution =
    application.monthly_contribution;


  const description =
    application.description ||
    "No description provided.";


  const submittedAt =
    application.created_at ||
    application.submitted_at ||
    application.createdAt;


  card.innerHTML = `

    <div class="cl-review-card-header">

      <div>

        <div class="cl-review-status-badge">
          PENDING REVIEW
        </div>

        <h3>
          ${escapeHtml(groupName)}
        </h3>

        <p>
          ${escapeHtml(category)}
        </p>

      </div>

    </div>


    <div class="cl-review-details">

      <div class="cl-review-detail">

        <span>Administrator</span>

        <strong>
          ${escapeHtml(adminName)}
        </strong>

      </div>


      <div class="cl-review-detail">

        <span>Email</span>

        <strong>
          ${escapeHtml(email)}
        </strong>

      </div>


      <div class="cl-review-detail">

        <span>Phone</span>

        <strong>
          ${escapeHtml(adminPhone)}
        </strong>

      </div>


      <div class="cl-review-detail">

        <span>Country</span>

        <strong>
          ${escapeHtml(country)}
        </strong>

      </div>


      <div class="cl-review-detail">

        <span>Monthly contribution</span>

        <strong>
          ${
            contribution === null ||
            contribution === undefined ||
            contribution === ""
              ? "KSh 0"
              : `KSh ${Number(contribution).toLocaleString("en-KE")}`
          }
        </strong>

      </div>


      <div class="cl-review-detail">

        <span>Submitted</span>

        <strong>
          ${escapeHtml(
            formatDate(
              submittedAt
            )
          )}
        </strong>

      </div>

    </div>


    <div class="cl-review-description">

      <span>Description</span>

      <p>
        ${escapeHtml(description)}
      </p>

    </div>


    <div class="cl-review-actions">

      <button
        type="button"
        class="btn btn-primary"
        data-approve="${escapeHtml(id)}"
      >
        Approve Application
      </button>


      <button
        type="button"
        class="btn btn-secondary"
        data-reject="${escapeHtml(id)}"
      >
        Reject Application
      </button>

    </div>

  `;


  return card;

}


/* =========================================================
   FIND APPLICATION
========================================================= */

function findApplication(
  id
) {

  return applications.find(
    application =>
      String(
        applicationId(
          application
        )
      ) ===
      String(
        id
      )
  );

}


/* =========================================================
   APPROVE APPLICATION
========================================================= */

async function approveApplication(
  id
) {

  if (
    processingApplication
  ) {
    return;
  }


  const application =
    findApplication(
      id
    );


  if (!application) {

    showError(
      "The selected application could not be found."
    );

    return;

  }


  const groupName =
    application.group_name ||
    "this group";


  const confirmed =
    window.confirm(
      `Approve "${groupName}"?\n\n` +
      "This will create the group and administrator " +
      "member, activate the account, and then send " +
      "the approval email."
    );


  if (!confirmed) {
    return;
  }


  clearMessages();


  setProcessing(
    true
  );


  try {

    await verifyPlatformAdmin();


    showStatus(
      "Approving application..."
    );


    /*
     * EXACT LIVE RPC:
     *
     * approve_group_application(
     *   p_application_id uuid
     * )
     *
     * The RPC performs the actual database
     * transaction.
     */

    const {
      data: approvalResult,
      error: approvalError
    } =
      await supabase.rpc(
        "approve_group_application",
        {
          p_application_id:
            id
        }
      );


    if (approvalError) {
      throw approvalError;
    }


    console.log(
      "CHAMA LIVE: approval RPC result",
      approvalResult
    );


    if (
      !approvalResult ||
      approvalResult.success !== true
    ) {

      throw new Error(
        "The approval RPC did not return a successful result."
      );

    }


    showStatus(
      "Application approved. Sending confirmation email..."
    );


    /*
     * The approval RPC returns the approved
     * application information.
     *
     * We use the application ID returned by
     * the RPC to invoke the email function.
     */

    const approvedApplicationId =
      approvalResult.application_id ||
      id;


    await sendReviewEmail(
      approvedApplicationId,
      "approval"
    );


    /*
     * Remove the approved application from
     * the current screen.
     */

    applications =
      applications.filter(
        item =>
          String(
            applicationId(
              item
            )
          ) !==
          String(
            id
          )
      );


    renderApplications();


    const memberNumber =
      approvalResult.member_number ||
      "assigned";


    const accessCode =
      approvalResult.access_code ||
      "generated";


    showStatus(
      `Approved successfully. ` +
      `Administrator member number: ${memberNumber}. ` +
      `Access code: ${accessCode}. ` +
      `Approval email sent.`
    );


    console.log(
      "CHAMA LIVE: application approved and email sent",
      {
        applicationId:
          approvedApplicationId,

        groupId:
          approvalResult.group_id,

        memberId:
          approvalResult.member_id,

        memberNumber,

        accessCode,

        email:
          approvalResult.email
      }
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: approval failed",
      error
    );


    showError(
      normalizeError(
        error
      )
    );

  }

  finally {

    setProcessing(
      false
    );

  }

}


/* =========================================================
   REJECT APPLICATION
========================================================= */

async function rejectApplication(
  id
) {

  if (
    processingApplication
  ) {
    return;
  }


  const application =
    findApplication(
      id
    );


  if (!application) {

    showError(
      "The selected application could not be found."
    );

    return;

  }


  const groupName =
    application.group_name ||
    "this group";


  const reason =
    window.prompt(
      `Reason for rejecting "${groupName}":`
    );


  if (
    reason ===
    null
  ) {

    return;

  }


  const cleanReason =
    reason.trim();


  if (!cleanReason) {

    showError(
      "Please provide a rejection reason."
    );

    return;

  }


  clearMessages();


  setProcessing(
    true
  );


  try {

    await verifyPlatformAdmin();


    showStatus(
      "Rejecting application..."
    );


    /*
     * EXACT LIVE RPC:
     *
     * reject_group_application(
     *   p_application_id uuid,
     *   p_reason text
     * )
     */

    const {
      data: rejectionResult,
      error: rejectionError
    } =
      await supabase.rpc(
        "reject_group_application",
        {
          p_application_id:
            id,

          p_reason:
            cleanReason
        }
      );


    if (rejectionError) {
      throw rejectionError;
    }


    console.log(
      "CHAMA LIVE: rejection RPC result",
      rejectionResult
    );


    if (
      rejectionResult &&
      rejectionResult.success === false
    ) {

      throw new Error(
        "The rejection RPC did not return a successful result."
      );

    }


    showStatus(
      "Application rejected. Sending notification email..."
    );


    /*
     * Send rejection email ONLY AFTER the
     * rejection RPC has successfully completed.
     */

    const rejectedApplicationId =
      rejectionResult?.application_id ||
      id;


    await sendReviewEmail(
      rejectedApplicationId,
      "rejection"
    );


    applications =
      applications.filter(
        item =>
          String(
            applicationId(
              item
            )
          ) !==
          String(
            id
          )
      );


    renderApplications();


    showStatus(
      "Application rejected successfully. Rejection email sent."
    );


    console.log(
      "CHAMA LIVE: application rejected and email sent",
      {
        applicationId:
          rejectedApplicationId
      }
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: rejection failed",
      error
    );


    showError(
      normalizeError(
        error
      )
    );

  }

  finally {

    setProcessing(
      false
    );

  }

}


/* =========================================================
   SEND REVIEW EMAIL
========================================================= */

async function sendReviewEmail(
  applicationIdValue,
  type
) {

  if (
    !applicationIdValue
  ) {

    throw new Error(
      "Missing application ID for review email."
    );

  }


  if (
    type !==
      "approval" &&
    type !==
      "rejection"
  ) {

    throw new Error(
      "Invalid review email type."
    );

  }


  /*
   * Ensure there is still a valid authenticated
   * platform-admin session before calling the
   * protected Edge Function.
   */

  const {
    data: {
      session
    } = {},
    error: sessionError
  } =
    await supabase.auth.getSession();


  if (sessionError) {
    throw sessionError;
  }


  if (!session?.access_token) {

    throw new Error(
      "Your administrator session has expired. " +
      "Please sign in again."
    );

  }


  /*
   * IMPORTANT:
   *
   * supabase.functions.invoke()
   * automatically uses the Supabase client's
   * current authentication session.
   *
   * The deployed function receives:
   *
   * {
   *   application_id,
   *   type
   * }
   */

  const {
    data,
    error
  } =
    await supabase.functions.invoke(
      SEND_REVIEW_EMAIL_FUNCTION,
      {
        body: {

          application_id:
            applicationIdValue,

          type

        }
      }
    );


  if (error) {

    console.error(
      "CHAMA LIVE: send-review-email error",
      error
    );


    /*
     * functions.invoke() can return an error
     * without giving us the JSON body directly.
     *
     * Preserve a useful message for the admin.
     */

    let message =
      error.message ||
      "Unable to send review email.";


    /*
     * Some Supabase function errors expose
     * context with a Response object.
     */

    try {

      if (
        error.context &&
        typeof error.context.json ===
          "function"
      ) {

        const body =
          await error.context.json();


        if (
          body?.error
        ) {

          message =
            body.error;

        }

      }

    }

    catch (
      ignored
    ) {

      console.warn(
        "CHAMA LIVE: unable to parse Edge Function error body",
        ignored
      );

    }


    throw new Error(
      message
    );

  }


  console.log(
    "CHAMA LIVE: review email response",
    data
  );


  /*
   * The deployed function should return
   * success=true.
   *
   * Fail if it explicitly reports failure.
   */

  if (
    data &&
    data.success === false
  ) {

    throw new Error(
      data.error ||
      "Review email was not sent."
    );

  }


  return data;

}


/* =========================================================
   EVENT DELEGATION
========================================================= */

function setupApplicationActions() {

  const target =
    applicationList ||
    applicationsContainer;


  if (!target) {

    console.warn(
      "CHAMA LIVE: no application action container found."
    );

    return;

  }


  target.addEventListener(
    "click",
    event => {

      const approveButton =
        event.target.closest(
          "[data-approve]"
        );


      if (approveButton) {

        const id =
          approveButton.dataset.approve;


        approveApplication(
          id
        );


        return;

      }


      const rejectButton =
        event.target.closest(
          "[data-reject]"
        );


      if (rejectButton) {

        const id =
          rejectButton.dataset.reject;


        rejectApplication(
          id
        );

      }

    }
  );

}


/* =========================================================
   REFRESH
========================================================= */

if (refreshButton) {

  refreshButton.addEventListener(
    "click",
    () => {

      loadPendingApplications();

    }
  );

}


/* =========================================================
   LOGOUT
========================================================= */

if (logoutButton) {

  logoutButton.addEventListener(
    "click",
    async () => {

      try {

        await supabase.auth.signOut();

      }

      catch (
        error
      ) {

        console.error(
          "CHAMA LIVE: logout failed",
          error
        );

      }


      window.location.replace(
        LOGIN_PAGE
      );

    }
  );

}


/* =========================================================
   AUTH STATE
========================================================= */

supabase.auth.onAuthStateChange(
  (
    event,
    session
  ) => {

    console.log(
      "CHAMA LIVE: auth event",
      event
    );


    if (
      event ===
        "SIGNED_OUT" ||
      !session?.user
    ) {

      window.location.replace(
        LOGIN_PAGE
      );

    }

  }
);


/* =========================================================
   INITIALIZE
========================================================= */

async function initialize() {

  try {

    await verifyPlatformAdmin();

    setupApplicationActions();

    await loadPendingApplications();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: admin review initialization failed",
      error
    );


    showError(
      normalizeError(
        error
      )
    );

  }

}


initialize();


console.log(
  "CHAMA LIVE: admin-review.js ready"
);
