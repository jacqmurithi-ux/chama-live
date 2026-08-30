/* =========================================================
   CHAMA LIVE — ADMIN REVIEW
   PLATFORM ADMIN APPLICATION REVIEW

   LIVE DATABASE RPC CONTRACT
   ---------------------------------------------------------
   list_pending_group_applications()
       → SETOF public.group_applications

   approve_group_application(
       p_application_id uuid
   )
       → jsonb

   reject_group_application(
       p_application_id uuid,
       p_reason text
   )
       → jsonb

   is_platform_admin()
       → boolean

   IMPORTANT
   ---------------------------------------------------------
   This file NEVER directly edits:
       group_applications
       groups
       members

   All approval/rejection operations go through
   the SECURITY DEFINER RPCs above.

   Approval flow:
       Platform Admin
            ↓
       list pending applications
            ↓
       approve RPC
            ↓
       group created
            ↓
       admin member created
            ↓
       financial period created
            ↓
       application approved
            ↓
       account can access Dashboard

   ========================================================= */

import { supabase, BASE_URL } from "./auth.js";


console.log(
  "CHAMA LIVE: admin-review.js loaded"
);


/* =========================================================
   PAGES
========================================================= */

const LOGIN_PAGE =
  `${BASE_URL}/login.html`;

const HOME_PAGE =
  `${BASE_URL}/index.html`;


/* =========================================================
   STATE
========================================================= */

let applications = [];

let selectedApplication = null;

let isBusy = false;


/* =========================================================
   ELEMENT LOOKUP
   ---------------------------------------------------------
   The selectors intentionally support several common IDs
   so this JS remains compatible with the existing
   admin-review.html structure.
========================================================= */

function getElement(...ids) {

  for (const id of ids) {

    const element =
      document.getElementById(id);

    if (element) {
      return element;
    }

  }

  return null;

}


const applicationList =
  getElement(
    "applications",
    "applicationList",
    "pendingApplications",
    "applicationsList"
  );


const emptyState =
  getElement(
    "emptyState",
    "noApplications",
    "emptyApplications"
  );


const loadingState =
  getElement(
    "loading",
    "loadingState",
    "applicationsLoading"
  );


const errorBox =
  getElement(
    "error",
    "errorBox",
    "adminError"
  );


const successBox =
  getElement(
    "success",
    "successBox",
    "adminSuccess"
  );


const refreshButton =
  getElement(
    "refreshButton",
    "refreshApplications",
    "refresh"
  );


const logoutButton =
  getElement(
    "logoutButton",
    "adminLogout",
    "logout"
  );


const applicationCount =
  getElement(
    "applicationCount",
    "pendingCount",
    "count"
  );


/* =========================================================
   OPTIONAL DETAIL / MODAL ELEMENTS
========================================================= */

const reviewModal =
  getElement(
    "reviewModal",
    "applicationModal",
    "reviewDialog"
  );


const reviewDetails =
  getElement(
    "reviewDetails",
    "applicationDetails",
    "selectedApplication"
  );


const closeModalButton =
  getElement(
    "closeModal",
    "closeReview",
    "closeApplication"
  );


const approveButton =
  getElement(
    "approveButton",
    "approveApplication"
  );


const rejectButton =
  getElement(
    "rejectButton",
    "rejectApplication"
  );


const rejectionReasonInput =
  getElement(
    "rejectionReason",
    "rejectReason"
  );


/* =========================================================
   UTILITIES
========================================================= */

function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function formatCurrency(value) {

  const amount =
    Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return "KSh 0.00";
  }

  return (
    "KSh " +
    amount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )
  );

}


function formatDate(value) {

  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date.toLocaleString(
    "en-KE",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  );

}


/* =========================================================
   STATUS MESSAGE
========================================================= */

function hideMessage(element) {

  if (!element) {
    return;
  }

  element.hidden = true;
  element.textContent = "";

}


function showMessage(
  element,
  message
) {

  if (!element) {
    return;
  }

  element.textContent =
    String(message || "");

  element.hidden =
    !message;

}


function showError(message) {

  console.error(
    "CHAMA LIVE ADMIN REVIEW:",
    message
  );

  showMessage(
    errorBox,
    message ||
      "Something went wrong."
  );

}


function showSuccess(message) {

  showMessage(
    successBox,
    message
  );

}


function clearMessages() {

  hideMessage(errorBox);
  hideMessage(successBox);

}


/* =========================================================
   LOADING
========================================================= */

function setLoading(
  loading,
  message = "Loading applications..."
) {

  if (loadingState) {

    loadingState.textContent =
      message;

    loadingState.hidden =
      !loading;

  }

  if (refreshButton) {

    refreshButton.disabled =
      loading;

  }

}


/* =========================================================
   BUTTON STATE
========================================================= */

function setActionButtonsDisabled(
  disabled
) {

  if (approveButton) {
    approveButton.disabled =
      disabled;
  }

  if (rejectButton) {
    rejectButton.disabled =
      disabled;
  }

}


/* =========================================================
   AUTHENTICATION
========================================================= */

async function requirePlatformAdmin() {

  const {
    data,
    error
  } =
    await supabase.auth.getSession();


  if (error) {
    throw error;
  }


  const session =
    data?.session;


  if (!session?.user) {

    window.location.replace(
      LOGIN_PAGE
    );

    return false;

  }


  /*
   * IMPORTANT:
   *
   * Do not trust a local role,
   * localStorage value, URL parameter,
   * or HTML state.
   *
   * Ask the live database.
   */

  const {
    data: isAdmin,
    error: adminError
  } =
    await supabase.rpc(
      "is_platform_admin"
    );


  if (adminError) {
    throw adminError;
  }


  if (isAdmin !== true) {

    showError(
      "Platform administrator access is required."
    );

    setTimeout(
      () => {

        window.location.replace(
          LOGIN_PAGE
        );

      },
      1600
    );

    return false;

  }


  return true;

}


/* =========================================================
   LOAD PENDING APPLICATIONS
========================================================= */

async function loadApplications() {

  if (isBusy) {
    return;
  }


  isBusy = true;

  clearMessages();

  setLoading(
    true,
    "Loading pending applications..."
  );


  try {

    /*
     * EXACT LIVE RPC:
     *
     * list_pending_group_applications()
     *
     * No arguments.
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


    updateCount();

    renderApplications();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: unable to load applications",
      error
    );


    showError(
      normalizeError(
        error,
        "Unable to load pending applications."
      )
    );

  }

  finally {

    setLoading(
      false
    );

    isBusy = false;

  }

}


/* =========================================================
   COUNT
========================================================= */

function updateCount() {

  if (!applicationCount) {
    return;
  }


  applicationCount.textContent =
    String(
      applications.length
    );

}


/* =========================================================
   RENDER APPLICATIONS
========================================================= */

function renderApplications() {

  if (!applicationList) {

    console.warn(
      "CHAMA LIVE: application list container not found."
    );

    return;

  }


  applicationList.innerHTML = "";


  if (
    applications.length === 0
  ) {

    if (emptyState) {
      emptyState.hidden = false;
    }

    return;

  }


  if (emptyState) {
    emptyState.hidden = true;
  }


  for (
    const application
    of applications
  ) {

    applicationList.appendChild(
      createApplicationCard(
        application
      )
    );

  }

}


/* =========================================================
   APPLICATION CARD
========================================================= */

function createApplicationCard(
  application
) {

  const card =
    document.createElement(
      "article"
    );


  card.className =
    "cl-application-card";


  const id =
    application.id;


  const groupName =
    application.group_name ||
    "Unnamed Group";


  const adminName =
    application.admin_name ||
    "—";


  const email =
    application.email ||
    "—";


  const phone =
    application.admin_phone ||
    "—";


  const category =
    application.category ||
    "other";


  const country =
    application.country ||
    "Kenya";


  const monthly =
    formatCurrency(
      application.monthly_contribution
    );


  const created =
    formatDate(
      application.created_at
    );


  card.innerHTML = `

    <div class="cl-application-card-header">

      <div>

        <span class="cl-application-badge">
          PENDING REVIEW
        </span>

        <h3>
          ${escapeHtml(groupName)}
        </h3>

      </div>

      <span class="cl-application-date">
        ${escapeHtml(created)}
      </span>

    </div>


    <div class="cl-application-grid">

      <div>
        <small>Administrator</small>
        <strong>
          ${escapeHtml(adminName)}
        </strong>
      </div>

      <div>
        <small>Email</small>
        <strong>
          ${escapeHtml(email)}
        </strong>
      </div>

      <div>
        <small>Phone</small>
        <strong>
          ${escapeHtml(phone)}
        </strong>
      </div>

      <div>
        <small>Group type</small>
        <strong>
          ${escapeHtml(category)}
        </strong>
      </div>

      <div>
        <small>Country</small>
        <strong>
          ${escapeHtml(country)}
        </strong>
      </div>

      <div>
        <small>Monthly contribution</small>
        <strong>
          ${escapeHtml(monthly)}
        </strong>
      </div>

    </div>


    <div class="cl-application-actions">

      <button
        type="button"
        class="btn btn-secondary"
        data-action="view"
        data-id="${escapeHtml(id)}"
      >
        View Application
      </button>

      <button
        type="button"
        class="btn btn-primary"
        data-action="approve"
        data-id="${escapeHtml(id)}"
      >
        Approve
      </button>

      <button
        type="button"
        class="btn btn-danger"
        data-action="reject"
        data-id="${escapeHtml(id)}"
      >
        Reject
      </button>

    </div>

  `;


  return card;

}


/* =========================================================
   VIEW APPLICATION
========================================================= */

function viewApplication(
  application
) {

  selectedApplication =
    application;


  if (!reviewDetails) {

    /*
     * Fallback:
     * use a simple browser dialog if
     * no detail container exists.
     */

    window.alert(
      buildApplicationText(
        application
      )
    );

    return;

  }


  reviewDetails.innerHTML = `

    <div class="cl-detail-row">
      <span>Application ID</span>
      <strong>
        ${escapeHtml(application.id)}
      </strong>
    </div>

    <div class="cl-detail-row">
      <span>Group name</span>
      <strong>
        ${escapeHtml(application.group_name)}
      </strong>
    </div>

    <div class="cl-detail-row">
      <span>Group type</span>
      <strong>
        ${escapeHtml(application.category || "other")}
      </strong>
    </div>

    <div class="cl-detail-row">
      <span>Country</span>
      <strong>
        ${escapeHtml(application.country || "Kenya")}
      </strong>
    </div>

    <div class="cl-detail-row">
      <span>Administrator</span>
      <strong>
        ${escapeHtml(application.admin_name)}
      </strong>
    </div>

    <div class="cl-detail-row">
      <span>Phone</span>
      <strong>
        ${escapeHtml(application.admin_phone)}
      </strong>
    </div>

    <div class="cl-detail-row">
      <span>Email</span>
      <strong>
        ${escapeHtml(application.email)}
      </strong>
    </div>

    <div class="cl-detail-row">
      <span>Monthly contribution</span>
      <strong>
        ${escapeHtml(
          formatCurrency(
            application.monthly_contribution
          )
        )}
      </strong>
    </div>

    <div class="cl-detail-row">
      <span>Opening balance</span>
      <strong>
        ${escapeHtml(
          formatCurrency(
            application.opening_balance
          )
        )}
      </strong>
    </div>

    <div class="cl-detail-description">

      <span>Description</span>

      <p>
        ${
          escapeHtml(
            application.description ||
            "No description provided."
          )
        }
      </p>

    </div>

  `;


  if (reviewModal) {
    reviewModal.hidden = false;
  }

}


/* =========================================================
   BUILD TEXT FALLBACK
========================================================= */

function buildApplicationText(
  application
) {

  return [

    `Group: ${application.group_name || "—"}`,

    `Administrator: ${application.admin_name || "—"}`,

    `Email: ${application.email || "—"}`,

    `Phone: ${application.admin_phone || "—"}`,

    `Type: ${application.category || "other"}`,

    `Country: ${application.country || "Kenya"}`,

    `Monthly contribution: ${
      formatCurrency(
        application.monthly_contribution
      )
    }`,

    `Opening balance: ${
      formatCurrency(
        application.opening_balance
      )
    }`,

    `Description: ${
      application.description ||
      "None"
    }`

  ].join("\n");

}


/* =========================================================
   CLOSE MODAL
========================================================= */

function closeReviewModal() {

  selectedApplication =
    null;


  if (reviewModal) {
    reviewModal.hidden = true;
  }

}


/* =========================================================
   FIND APPLICATION
========================================================= */

function findApplication(
  id
) {

  return applications.find(
    application =>
      String(application.id) ===
      String(id)
  );

}


/* =========================================================
   APPROVE APPLICATION
========================================================= */

async function approveApplication(
  application
) {

  if (!application?.id) {

    showError(
      "Invalid application."
    );

    return;

  }


  if (isBusy) {
    return;
  }


  const confirmed =
    window.confirm(
      `Approve "${application.group_name}"?\n\n` +
      "This will create the group, create the administrator member, " +
      "generate the group access code and activate the account."
    );


  if (!confirmed) {
    return;
  }


  isBusy = true;

  clearMessages();

  setActionButtonsDisabled(
    true
  );

  setLoading(
    true,
    "Approving application..."
  );


  try {

    /*
     * EXACT LIVE RPC:
     *
     * approve_group_application(
     *   p_application_id uuid
     * )
     */

    const {
      data,
      error
    } =
      await supabase.rpc(
        "approve_group_application",
        {
          p_application_id:
            application.id
        }
      );


    if (error) {
      throw error;
    }


    /*
     * Expected result:
     *
     * {
     *   success: true,
     *   application_id,
     *   group_id,
     *   member_id,
     *   member_number,
     *   access_code,
     *   role: "admin",
     *   email,
     *   admin_name,
     *   group_name
     * }
     */

    const result =
      Array.isArray(data)
        ? data[0]
        : data;


    if (
      !result ||
      result.success !== true
    ) {

      throw new Error(
        "The approval RPC did not return a successful result."
      );

    }


    showSuccess(
      `${result.group_name || application.group_name} ` +
      "has been approved successfully."
    );


    /*
     * Remove the approved application
     * from the pending list immediately.
     */

    applications =
      applications.filter(
        item =>
          String(item.id) !==
          String(application.id)
      );


    updateCount();

    renderApplications();

    closeReviewModal();


    /*
     * Keep the generated credentials available
     * for the admin UI without storing them in
     * the browser permanently.
     */

    showApprovalResult(
      result
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: approval failed",
      error
    );


    showError(
      normalizeError(
        error,
        "Unable to approve the application."
      )
    );

  }

  finally {

    setLoading(
      false
    );

    setActionButtonsDisabled(
      false
    );

    isBusy = false;

  }

}


/* =========================================================
   SHOW APPROVAL RESULT
========================================================= */

function showApprovalResult(
  result
) {

  const accessCode =
    result?.access_code ||
    "";


  const memberNumber =
    result?.member_number ||
    "";


  /*
   * If the HTML contains dedicated result
   * elements, populate them.
   */

  const approvalResult =
    getElement(
      "approvalResult",
      "approvedResult",
      "successResult"
    );


  const resultAccessCode =
    getElement(
      "resultAccessCode",
      "accessCode"
    );


  const resultMemberNumber =
    getElement(
      "resultMemberNumber",
      "memberNumber"
    );


  if (approvalResult) {

    approvalResult.hidden =
      false;

  }


  if (resultAccessCode) {

    resultAccessCode.textContent =
      accessCode || "—";

  }


  if (resultMemberNumber) {

    resultMemberNumber.textContent =
      memberNumber || "—";

  }


  /*
   * If no result UI exists, don't create
   * a disruptive popup.
   *
   * The RPC has already completed the
   * database operation successfully.
   */

}


/* =========================================================
   REJECT APPLICATION
========================================================= */

async function rejectApplication(
  application,
  reason = ""
) {

  if (!application?.id) {

    showError(
      "Invalid application."
    );

    return;

  }


  const cleanReason =
    String(reason || "")
      .trim();


  if (!cleanReason) {

    showError(
      "Please provide a rejection reason."
    );

    if (rejectionReasonInput) {
      rejectionReasonInput.focus();
    }

    return;

  }


  if (isBusy) {
    return;
  }


  const confirmed =
    window.confirm(
      `Reject "${application.group_name}"?\n\n` +
      "The application will be marked as rejected."
    );


  if (!confirmed) {
    return;
  }


  isBusy = true;

  clearMessages();

  setActionButtonsDisabled(
    true
  );

  setLoading(
    true,
    "Rejecting application..."
  );


  try {

    /*
     * EXACT LIVE RPC:
     *
     * reject_group_application(
     *   p_application_id uuid,
     *   p_reason text
     * )
     */

    const {
      data,
      error
    } =
      await supabase.rpc(
        "reject_group_application",
        {
          p_application_id:
            application.id,

          p_reason:
            cleanReason
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
      result.success !== true
    ) {

      throw new Error(
        "The rejection RPC did not return a successful result."
      );

    }


    showSuccess(
      `${result.group_name || application.group_name} ` +
      "has been rejected."
    );


    applications =
      applications.filter(
        item =>
          String(item.id) !==
          String(application.id)
      );


    updateCount();

    renderApplications();

    closeReviewModal();


    if (rejectionReasonInput) {
      rejectionReasonInput.value = "";
    }

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: rejection failed",
      error
    );


    showError(
      normalizeError(
        error,
        "Unable to reject the application."
      )
    );

  }

  finally {

    setLoading(
      false
    );

    setActionButtonsDisabled(
      false
    );

    isBusy = false;

  }

}


/* =========================================================
   REJECTION PROMPT
========================================================= */

function promptReject(
  application
) {

  const reason =
    window.prompt(
      `Why are you rejecting "${application.group_name}"?\n\n` +
      "A rejection reason is required."
    );


  if (
    reason === null
  ) {
    return;
  }


  rejectApplication(
    application,
    reason
  );

}


/* =========================================================
   APPLICATION LIST EVENTS
========================================================= */

if (applicationList) {

  applicationList.addEventListener(
    "click",
    event => {

      const button =
        event.target.closest(
          "button[data-action]"
        );


      if (!button) {
        return;
      }


      const action =
        button.dataset.action;


      const id =
        button.dataset.id;


      const application =
        findApplication(
          id
        );


      if (!application) {

        showError(
          "This application is no longer available."
        );

        return;

      }


      if (
        action ===
        "view"
      ) {

        viewApplication(
          application
        );

        return;

      }


      if (
        action ===
        "approve"
      ) {

        approveApplication(
          application
        );

        return;

      }


      if (
        action ===
        "reject"
      ) {

        promptReject(
          application
        );

      }

    }
  );

}


/* =========================================================
   MODAL BUTTONS
========================================================= */

if (closeModalButton) {

  closeModalButton.addEventListener(
    "click",
    closeReviewModal
  );

}


if (approveButton) {

  approveButton.addEventListener(
    "click",
    () => {

      if (
        selectedApplication
      ) {

        approveApplication(
          selectedApplication
        );

      }

    }
  );

}


if (rejectButton) {

  rejectButton.addEventListener(
    "click",
    () => {

      if (
        selectedApplication
      ) {

        const reason =
          rejectionReasonInput?.value ||
          "";


        rejectApplication(
          selectedApplication,
          reason
        );

      }

    }
  );

}


/* =========================================================
   CLOSE MODAL ON BACKDROP
========================================================= */

if (reviewModal) {

  reviewModal.addEventListener(
    "click",
    event => {

      if (
        event.target ===
        reviewModal
      ) {

        closeReviewModal();

      }

    }
  );

}


/* =========================================================
   ESCAPE KEY
========================================================= */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key ===
      "Escape"
    ) {

      closeReviewModal();

    }

  }
);


/* =========================================================
   REFRESH
========================================================= */

if (refreshButton) {

  refreshButton.addEventListener(
    "click",
    () => {

      loadApplications();

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

      if (isBusy) {
        return;
      }


      try {

        await supabase.auth.signOut();

      }

      finally {

        window.location.replace(
          LOGIN_PAGE
        );

      }

    }
  );

}


/* =========================================================
   NORMALIZE RPC ERRORS
========================================================= */

function normalizeError(
  error,
  fallback
) {

  const raw =
    String(
      error?.message ||
      error?.details ||
      error ||
      ""
    );


  const lower =
    raw.toLowerCase();


  if (
    lower.includes(
      "platform administrator access required"
    )
  ) {

    return (
      "Platform administrator access is required."
    );

  }


  if (
    lower.includes(
      "authentication required"
    )
  ) {

    return (
      "Your admin session has expired. " +
      "Please sign in again."
    );

  }


  if (
    lower.includes(
      "application not found"
    )
  ) {

    return (
      "That application could not be found. " +
      "Refresh the review list."
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
      "already rejected"
    )
  ) {

    return (
      "This application has already been rejected."
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
      "approved applications cannot be rejected"
    )
  ) {

    return (
      "An approved application cannot be rejected."
    );

  }


  if (
    lower.includes(
      "network"
    ) ||
    lower.includes(
      "failed to fetch"
    )
  ) {

    return (
      "Unable to connect to CHAMA LIVE. " +
      "Check your internet connection and try again."
    );

  }


  return (
    raw ||
    fallback ||
    "An unexpected error occurred."
  );

}


/* =========================================================
   INITIALIZE
========================================================= */

async function initialize() {

  clearMessages();


  try {

    const isAdmin =
      await requirePlatformAdmin();


    if (!isAdmin) {
      return;
    }


    await loadApplications();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: admin review initialization failed",
      error
    );


    showError(
      normalizeError(
        error,
        "Unable to initialize the account review page."
      )
    );

  }

}


/* =========================================================
   START
========================================================= */

initialize();


console.log(
  "CHAMA LIVE: admin-review.js ready"
);
