/* =========================================================
   CHAMA LIVE — PLATFORM ADMIN
   ---------------------------------------------------------
   Platform-wide administration.

   AUTHORIZATION
   ---------------------------------------------------------
   Platform Admin authorization is enforced server-side by:

     public.get_platform_admin_overview()
     public.get_platform_admin_applications()
     public.approve_group_application(uuid)
     public.reject_group_application(uuid, text)

   The frontend does NOT query platform_admins directly.

   IMPORTANT
   ---------------------------------------------------------
   This module is intentionally independent from:

     - admin-layout.js
     - ADMIN_ROLES
     - getMyApplicationContext()
     - getMyMember()
     - getMyGroup()

   Those belong to the Group Admin portal.

   DATABASE
   ---------------------------------------------------------
   READ RPCs:

     get_platform_admin_overview()
     get_platform_admin_applications()

   MUTATION RPCs:

     approve_group_application(uuid)
     reject_group_application(uuid, reason)

   The frontend does NOT perform direct database writes.

   APPLICATION REVIEW
   ---------------------------------------------------------
   The application-review surface:

     1. Reads pending / under-review applications through
        get_platform_admin_applications().
     2. Displays the application details.
     3. Requires explicit confirmation before approval or rejection.
     4. Requires a rejection reason when rejecting.
     5. Calls the canonical server-side review RPC.
     6. Refreshes the overview and application list.

   No provisioning logic exists in this file.
========================================================= */


import {
  supabase
} from "./supabase.js";


/* =========================================================
   DOM
========================================================= */

const loading =
  document.getElementById(
    "loading"
  );

const overview =
  document.getElementById(
    "overview"
  );

const message =
  document.getElementById(
    "message"
  );

const generatedAt =
  document.getElementById(
    "generatedAt"
  );

const refreshButton =
  document.getElementById(
    "refreshButton"
  );

const logoutButton =
  document.getElementById(
    "logoutButton"
  );


/* ---------------------------------------------------------
   APPLICATION REVIEW DOM
--------------------------------------------------------- */

const applicationReviewLoading =
  document.getElementById(
    "applicationReviewLoading"
  );

const applicationReviewEmpty =
  document.getElementById(
    "applicationReviewEmpty"
  );

const applicationReviewList =
  document.getElementById(
    "applicationReviewList"
  );


/* =========================================================
   STATE
========================================================= */

let loadingOverview = false;

let loadingApplications = false;

let processingApplication = false;


/* =========================================================
   ROUTING
========================================================= */

function redirectToPlatformAdminLogin() {

  window.location.replace(
    "platform-admin-login.html"
  );

}


/* =========================================================
   HELPERS
========================================================= */

function getElement(id) {

  return document.getElementById(
    id
  );

}


function setText(
  id,
  value
) {

  const element =
    getElement(id);

  if (!element) {
    return;
  }

  element.textContent =
    String(
      value ?? ""
    );

}


function numberValue(
  value
) {

  const numeric =
    Number(value);

  if (
    !Number.isFinite(numeric)
  ) {

    return 0;

  }

  return numeric;

}


function formatInteger(
  value
) {

  return numberValue(
    value
  ).toLocaleString(
    "en-KE"
  );

}


function formatMoney(
  value
) {

  return (
    "KSh " +
    numberValue(
      value
    ).toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }
    )
  );

}


function formatTimestamp(
  value
) {

  if (!value) {

    return "Updated time unavailable.";

  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "Updated time unavailable.";

  }


  return (
    "Last updated " +
    date.toLocaleString(
      "en-KE",
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    )
  );

}


function formatApplicationDate(
  value
) {

  if (!value) {

    return "Date unavailable";

  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "Date unavailable";

  }


  return date.toLocaleString(
    "en-KE",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  );

}


function applicationText(
  value,
  fallback = "Not provided"
) {

  const text =
    String(
      value ?? ""
    ).trim();


  return text ||
    fallback;

}


/* =========================================================
   MESSAGES
========================================================= */

function clearMessage() {

  if (!message) {
    return;
  }

  message.textContent =
    "";

  message.className =
    "platform-message platform-hidden";

}


function showMessage(
  text,
  type = "error"
) {

  if (!message) {
    return;
  }

  message.textContent =
    text;


  let messageClass =
    "error";


  if (
    type === "access-denied"
  ) {

    messageClass =
      "access-denied";

  } else if (
    type === "success"
  ) {

    messageClass =
      "success";

  }


  message.className =
    "platform-message " +
    messageClass;

}


function showLoading() {

  if (loading) {

    loading.classList.remove(
      "platform-hidden"
    );

  }

  if (overview) {

    overview.classList.add(
      "platform-hidden"
    );

  }

}


function showOverview() {

  if (loading) {

    loading.classList.add(
      "platform-hidden"
    );

  }

  if (overview) {

    overview.classList.remove(
      "platform-hidden"
    );

  }

}


/* =========================================================
   ERROR NORMALIZATION
   ---------------------------------------------------------
   Raw database/RPC errors are never displayed directly.
========================================================= */

function normalizeError(
  error
) {

  const messageText =
    String(
      error?.message ||
      error ||
      ""
    ).trim();


  const lower =
    messageText.toLowerCase();


  if (
    lower.includes(
      "platform admin access required"
    )
  ) {

    return {
      type: "access-denied",
      message:
        "Access denied. This area is restricted to Platform Administrators."
    };

  }


  if (
    lower.includes(
      "jwt"
    ) &&
    lower.includes(
      "expired"
    )
  ) {

    return {
      type: "session-expired",
      message:
        "Your session has expired. Please sign in again."
    };

  }


  if (
    lower.includes(
      "not authenticated"
    ) ||
    lower.includes(
      "authentication required"
    )
  ) {

    return {
      type: "authentication-required",
      message:
        "Authentication is required. Please sign in again."
    };

  }


  if (
    lower.includes(
      "failed to fetch"
    ) ||
    lower.includes(
      "network"
    )
  ) {

    return {
      type: "error",
      message:
        "Unable to connect to CHAMA LIVE. Please check your internet connection."
    };

  }


  return {
    type: "error",
    message:
      "Unable to load the Platform Admin overview. Please try again."
  };

}


/* =========================================================
   APPLICATION ERROR NORMALIZATION
========================================================= */

function normalizeApplicationError(
  error,
  action = "review"
) {

  const messageText =
    String(
      error?.message ||
      error ||
      ""
    ).trim();


  const lower =
    messageText.toLowerCase();


  if (
    lower.includes(
      "platform admin access required"
    )
  ) {

    return {
      type: "access-denied",
      message:
        "Access denied. This area is restricted to Platform Administrators."
    };

  }


  if (
    lower.includes(
      "jwt"
    ) &&
    lower.includes(
      "expired"
    )
  ) {

    return {
      type: "session-expired",
      message:
        "Your session has expired. Please sign in again."
    };

  }


  if (
    lower.includes(
      "not authenticated"
    ) ||
    lower.includes(
      "authentication required"
    )
  ) {

    return {
      type: "authentication-required",
      message:
        "Authentication is required. Please sign in again."
    };

  }


  if (
    lower.includes(
      "already approved"
    )
  ) {

    return {
      type: "review-conflict",
      message:
        "This application has already been approved. Refreshing the application list."
    };

  }


  if (
    lower.includes(
      "already rejected"
    )
  ) {

    return {
      type: "review-conflict",
      message:
        "This application has already been rejected. Refreshing the application list."
    };

  }


  if (
    lower.includes(
      "application not found"
    )
  ) {

    return {
      type: "review-conflict",
      message:
        "This application is no longer available. Refreshing the application list."
    };

  }


  if (
    lower.includes(
      "failed to fetch"
    ) ||
    lower.includes(
      "network"
    )
  ) {

    return {
      type: "error",
      message:
        "Unable to connect to CHAMA LIVE. Please check your internet connection."
    };

  }


  return {
    type: "error",
    message:
      action === "reject"
        ? "Unable to reject this application. Please try again."
        : "Unable to approve this application. Please try again."
  };

}


/* =========================================================
   AUTHENTICATION CHECK
   ---------------------------------------------------------
   This confirms that an authenticated Supabase user exists.

   Platform Admin authorization remains server-side in the
   Platform Admin RPCs.
========================================================= */

async function requireAuthenticatedSession() {

  const {
    data,
    error
  } =
    await supabase.auth.getUser();


  if (error) {

    throw error;

  }


  if (
    !data?.user
  ) {

    throw new Error(
      "Authentication required."
    );

  }


  return data.user;

}


/* =========================================================
   NORMALIZE RPC RESULT
   ---------------------------------------------------------
   Supabase may return a row as an object or an array.
========================================================= */

function normalizeOverviewRow(
  data
) {

  if (
    Array.isArray(data)
  ) {

    return data[0] || null;

  }


  if (
    data &&
    typeof data === "object"
  ) {

    return data;

  }


  return null;

}


/* =========================================================
   NORMALIZE APPLICATION ROW
========================================================= */

function normalizeApplicationRow(
  row
) {

  if (
    !row ||
    typeof row !== "object"
  ) {

    return null;

  }


  return {
    application_id:
      row.application_id ?? null,

    group_name:
      row.group_name ?? "",

    category:
      row.category ?? "",

    description:
      row.description ?? "",

    admin_name:
      row.admin_name ?? "",

    admin_phone:
      row.admin_phone ?? "",

    email:
      row.email ?? "",

    country:
      row.country ?? "",

    location:
      row.location ?? "",

    town:
      row.town ?? "",

    status:
      row.status ?? "",

    created_at:
      row.created_at ?? null
  };

}


/* =========================================================
   RENDER OVERVIEW
========================================================= */

function renderOverview(
  row
) {

  if (!row) {

    throw new Error(
      "Platform overview returned no data."
    );

  }


  /* -------------------------------------------------------
     PRIMARY KPIs
  ------------------------------------------------------- */

  setText(
    "groupsTotal",
    formatInteger(
      row.groups_total
    )
  );


  setText(
    "membersTotal",
    formatInteger(
      row.members_total
    )
  );


  setText(
    "membersActive",
    formatInteger(
      row.members_active
    )
  );


  setText(
    "membersWithLogin",
    formatInteger(
      row.members_with_login
    )
  );


  /* -------------------------------------------------------
     GROUPS / MEMBERS
  ------------------------------------------------------- */

  setText(
    "groupsCreatedThisMonth",
    formatInteger(
      row.groups_created_this_month
    )
  );


  setText(
    "membersWithoutLogin",
    formatInteger(
      row.members_without_login
    )
  );


  setText(
    "membersActiveDetail",
    formatInteger(
      row.members_active
    )
  );


  /* -------------------------------------------------------
     ONBOARDING
  ------------------------------------------------------- */

  setText(
    "onboardingPending",
    formatInteger(
      row.onboarding_pending
    )
  );


  setText(
    "onboardingInvited",
    formatInteger(
      row.onboarding_invited
    )
  );


  setText(
    "onboardingActive",
    formatInteger(
      row.onboarding_active
    )
  );


  setText(
    "onboardingSuspended",
    formatInteger(
      row.onboarding_suspended
    )
  );


  /* -------------------------------------------------------
     APPLICATIONS
  ------------------------------------------------------- */

  setText(
    "applicationsPending",
    formatInteger(
      row.applications_pending
    )
  );


  setText(
    "applicationsUnderReview",
    formatInteger(
      row.applications_under_review
    )
  );


  setText(
    "applicationsApproved",
    formatInteger(
      row.applications_approved
    )
  );


  setText(
    "applicationsRejected",
    formatInteger(
      row.applications_rejected
    )
  );


  /* -------------------------------------------------------
     SUBSCRIPTIONS
  ------------------------------------------------------- */

  setText(
    "subscriptionsActive",
    formatInteger(
      row.subscriptions_active
    )
  );


  setText(
    "subscriptionsPending",
    formatInteger(
      row.subscriptions_pending
    )
  );


  setText(
    "subscriptionsSuspended",
    formatInteger(
      row.subscriptions_suspended
    )
  );


  setText(
    "subscriptionsCancelled",
    formatInteger(
      row.subscriptions_cancelled
    )
  );


  setText(
    "subscriptionsExpired",
    formatInteger(
      row.subscriptions_expired
    )
  );


  /* -------------------------------------------------------
     BILLING
  --------------------------------------------------------- */

  setText(
    "invoicesPaid",
    formatInteger(
      row.invoices_paid
    )
  );


  setText(
    "invoicesUnpaid",
    formatInteger(
      row.invoices_unpaid
    )
  );


  setText(
    "subscriptionPaymentsTotal",
    formatInteger(
      row.subscription_payments_total
    )
  );


  setText(
    "subscriptionRevenueTotal",
    formatMoney(
      row.subscription_revenue_total
    )
  );


  /* -------------------------------------------------------
     TIMESTAMP
  --------------------------------------------------------- */

  setText(
    "generatedAt",
    formatTimestamp(
      row.generated_at
    )
  );

}


/* =========================================================
   APPLICATION REVIEW UI
========================================================= */

function clearApplicationReview() {

  if (applicationReviewList) {

    applicationReviewList.replaceChildren();

  }


  if (applicationReviewEmpty) {

    applicationReviewEmpty.classList.add(
      "platform-hidden"
    );

  }

}


function showApplicationReviewLoading() {

  if (applicationReviewLoading) {

    applicationReviewLoading.classList.remove(
      "platform-hidden"
    );

  }

}


function hideApplicationReviewLoading() {

  if (applicationReviewLoading) {

    applicationReviewLoading.classList.add(
      "platform-hidden"
    );

  }

}


/* =========================================================
   APPLICATION DETAIL HELPER
========================================================= */

function createApplicationDetail(
  label,
  value
) {

  const detail =
    document.createElement(
      "div"
    );

  detail.className =
    "platform-application-detail";


  const strong =
    document.createElement(
      "strong"
    );

  strong.textContent =
    label + ":";


  detail.appendChild(
    strong
  );


  detail.appendChild(
    document.createTextNode(
      " " +
      applicationText(
        value
      )
    )
  );


  return detail;

}


/* =========================================================
   RENDER APPLICATIONS
========================================================= */

function renderPendingApplications(
  rows
) {

  clearApplicationReview();


  const applications =
    Array.isArray(rows)
      ? rows
          .map(
            normalizeApplicationRow
          )
          .filter(
            application =>
              application &&
              application.application_id
          )
      : [];


  if (
    applications.length === 0
  ) {

    if (applicationReviewEmpty) {

      applicationReviewEmpty.classList.remove(
        "platform-hidden"
      );

    }

    return;

  }


  if (!applicationReviewList) {

    return;

  }


  const fragment =
    document.createDocumentFragment();


  for (
    const application
    of applications
  ) {

    const item =
      document.createElement(
        "article"
      );

    item.className =
      "platform-application-item";


    /* -----------------------------------------------------
       HEADER
    ----------------------------------------------------- */

    const header =
      document.createElement(
        "div"
      );

    header.className =
      "platform-application-header";


    const headingContainer =
      document.createElement(
        "div"
      );


    const name =
      document.createElement(
        "h3"
      );

    name.className =
      "platform-application-name";

    name.textContent =
      applicationText(
        application.group_name,
        "Unnamed group"
      );


    headingContainer.appendChild(
      name
    );


    const meta =
      document.createElement(
        "p"
      );

    meta.className =
      "platform-application-meta";

    meta.textContent =
      "Administrator: " +
      applicationText(
        application.admin_name
      );


    headingContainer.appendChild(
      meta
    );


    const status =
      document.createElement(
        "p"
      );

    status.className =
      "platform-application-meta";

    status.textContent =
      "Status: " +
      applicationText(
        application.status
      );


    header.appendChild(
      headingContainer
    );

    header.appendChild(
      status
    );


    item.appendChild(
      header
    );


    /* -----------------------------------------------------
       DETAILS
    ----------------------------------------------------- */

    const details =
      document.createElement(
        "div"
      );

    details.className =
      "platform-application-details";


    details.appendChild(
      createApplicationDetail(
        "Phone",
        application.admin_phone
      )
    );


    details.appendChild(
      createApplicationDetail(
        "Email",
        application.email
      )
    );


    details.appendChild(
      createApplicationDetail(
        "Location",
        application.location
      )
    );


    details.appendChild(
      createApplicationDetail(
        "Town",
        application.town
      )
    );


    details.appendChild(
      createApplicationDetail(
        "Country",
        application.country
      )
    );


    details.appendChild(
      createApplicationDetail(
        "Category",
        application.category
      )
    );


    details.appendChild(
      createApplicationDetail(
        "Submitted",
        formatApplicationDate(
          application.created_at
        )
      )
    );


    details.appendChild(
      createApplicationDetail(
        "Description",
        application.description
      )
    );


    item.appendChild(
      details
    );


    /* -----------------------------------------------------
       ACTIONS
    ----------------------------------------------------- */

    const actions =
      document.createElement(
        "div"
      );

    actions.className =
      "platform-application-actions";


    const approveButton =
      document.createElement(
        "button"
      );

    approveButton.type =
      "button";

    approveButton.className =
      "platform-application-approve";

    approveButton.textContent =
      "Approve Application";


    const rejectButton =
      document.createElement(
        "button"
      );

    rejectButton.type =
      "button";

    rejectButton.className =
      "platform-application-reject";

    rejectButton.textContent =
      "Reject Application";


    /* -----------------------------------------------------
       REJECTION PANEL
    ----------------------------------------------------- */

    const rejectionPanel =
      document.createElement(
        "div"
      );

    rejectionPanel.className =
      "platform-application-rejection-panel platform-hidden";


    const rejectionLabel =
      document.createElement(
        "label"
      );

    rejectionLabel.className =
      "platform-application-rejection-label";

    rejectionLabel.textContent =
      "Rejection reason";

    rejectionLabel.htmlFor =
      "rejection-reason-" +
      application.application_id;


    const rejectionReason =
      document.createElement(
        "textarea"
      );

    rejectionReason.id =
      "rejection-reason-" +
      application.application_id;

    rejectionReason.className =
      "platform-application-rejection-reason";

    rejectionReason.rows =
      4;

    rejectionReason.maxLength =
      1000;

    rejectionReason.required =
      true;

    rejectionReason.placeholder =
      "Enter the reason for rejecting this application.";


    const rejectionControls =
      document.createElement(
        "div"
      );

    rejectionControls.className =
      "platform-application-rejection-controls";


    const cancelRejectButton =
      document.createElement(
        "button"
      );

    cancelRejectButton.type =
      "button";

    cancelRejectButton.className =
      "platform-application-cancel";

    cancelRejectButton.textContent =
      "Cancel";


    const confirmRejectButton =
      document.createElement(
        "button"
      );

    confirmRejectButton.type =
      "button";

    confirmRejectButton.className =
      "platform-application-confirm-reject";

    confirmRejectButton.textContent =
      "Confirm Rejection";


    rejectionControls.appendChild(
      cancelRejectButton
    );

    rejectionControls.appendChild(
      confirmRejectButton
    );


    rejectionPanel.appendChild(
      rejectionLabel
    );

    rejectionPanel.appendChild(
      rejectionReason
    );

    rejectionPanel.appendChild(
      rejectionControls
    );


    /* -----------------------------------------------------
       APPROVE EVENT
    ----------------------------------------------------- */

    approveButton.addEventListener(
      "click",
      () => {

        approveApplication(
          application,
          approveButton
        );

      }
    );


    /* -----------------------------------------------------
       REJECT OPEN EVENT
    ----------------------------------------------------- */

    rejectButton.addEventListener(
      "click",
      () => {

        if (
          processingApplication
        ) {

          return;

        }


        rejectionPanel.classList.remove(
          "platform-hidden"
        );


        rejectButton.disabled =
          true;

        approveButton.disabled =
          true;


        rejectionReason.focus();

      }
    );


    /* -----------------------------------------------------
       REJECT CANCEL EVENT
    ----------------------------------------------------- */

    cancelRejectButton.addEventListener(
      "click",
      () => {

        if (
          processingApplication
        ) {

          return;

        }


        rejectionReason.value =
          "";


        rejectionPanel.classList.add(
          "platform-hidden"
        );


        rejectButton.disabled =
          false;

        approveButton.disabled =
          false;

      }
    );


    /* -----------------------------------------------------
       REJECT CONFIRM EVENT
    ----------------------------------------------------- */

    confirmRejectButton.addEventListener(
      "click",
      () => {

        rejectApplication(
          application,
          approveButton,
          rejectButton,
          confirmRejectButton,
          cancelRejectButton,
          rejectionReason,
          rejectionPanel
        );

      }
    );


    actions.appendChild(
      approveButton
    );

    actions.appendChild(
      rejectButton
    );

    actions.appendChild(
      rejectionPanel
    );


    item.appendChild(
      actions
    );


    fragment.appendChild(
      item
    );

  }


  applicationReviewList.appendChild(
    fragment
  );

}


/* =========================================================
   LOAD APPLICATIONS
   ---------------------------------------------------------
   Read-only RPC.

   Authorization is enforced by:
     public.get_platform_admin_applications()
========================================================= */

async function loadPendingApplications() {

  if (
    loadingApplications
  ) {

    return;

  }


  loadingApplications =
    true;


  showApplicationReviewLoading();


  try {

    const {
      data,
      error
    } =
      await supabase.rpc(
        "get_platform_admin_applications"
      );


    if (error) {

      throw error;

    }


    renderPendingApplications(
      data
    );

  } catch (error) {

    clearApplicationReview();


    const normalized =
      normalizeApplicationError(
        error
      );


    if (
      normalized.type ===
        "session-expired" ||
      normalized.type ===
        "authentication-required"
    ) {

      showMessage(
        normalized.message,
        "error"
      );

      redirectToPlatformAdminLogin();

      return;

    }


    showMessage(
      normalized.message,
      normalized.type
    );

  } finally {

    loadingApplications =
      false;

    hideApplicationReviewLoading();

  }

}


/* =========================================================
   APPROVE APPLICATION
   ---------------------------------------------------------
   The existing server-side approval RPC remains the sole
   provisioning boundary.

   This frontend does NOT:

     - create groups
     - create members
     - create financial periods
     - create subscriptions
     - create invoices
     - generate access codes
     - update group_applications directly
========================================================= */

async function approveApplication(
  application,
  button
) {

  if (
    processingApplication
  ) {

    return;

  }


  const applicationId =
    application?.application_id;


  if (!applicationId) {

    showMessage(
      "This application has no valid application ID.",
      "error"
    );

    return;

  }


  const groupName =
    applicationText(
      application.group_name,
      "this group"
    );


  const confirmed =
    window.confirm(
      `Approve "${groupName}"? This will create the group account, administrator member, financial period and initial subscription records.`
    );


  if (!confirmed) {

    return;

  }


  processingApplication =
    true;


  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Approving...";

  }


  try {

    /*
     * Confirm that an authenticated session still exists
     * immediately before the mutation.
     */

    await requireAuthenticatedSession();


    /*
     * Existing canonical provisioning boundary.
     *
     * Do not replace this with direct table writes.
     */

    const {
      data,
      error
    } =
      await supabase.rpc(
        "approve_group_application",
        {
          p_application_id:
            applicationId
        }
      );


    if (error) {

      throw error;

    }


    if (
      !data ||
      data.success !== true
    ) {

      throw new Error(
        "Application approval did not return a successful result."
      );

    }


    showMessage(
      `Application approved for ${groupName}.`,
      "success"
    );


    /*
     * Refresh both the platform-wide counters and the
     * application review surface after successful approval.
     */

    await loadPlatformOverview();

  } catch (error) {

    const normalized =
      normalizeApplicationError(
        error,
        "approve"
      );


    if (
      normalized.type ===
        "session-expired" ||
      normalized.type ===
        "authentication-required"
    ) {

      showMessage(
        normalized.message,
        "error"
      );

      redirectToPlatformAdminLogin();

      return;

    }


    /*
     * A concurrent administrator may have processed the
     * same application between display and confirmation.
     *
     * Refresh the read surfaces so the UI reflects the
     * authoritative server state.
     */

    if (
      normalized.type ===
        "review-conflict"
    ) {

      showMessage(
        normalized.message,
        "error"
      );

      await loadPlatformOverview();

      return;

    }


    showMessage(
      normalized.message,
      normalized.type
    );

  } finally {

    processingApplication =
      false;


    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Approve Application";

    }

  }

}


/* =========================================================
   REJECT APPLICATION
   ---------------------------------------------------------
   Rejection is performed exclusively through the canonical
   server-side RPC.

   The frontend does NOT:

     - update group_applications directly
     - write platform_activity directly
     - perform rejection-side business logic
========================================================= */

async function rejectApplication(
  application,
  approveButton,
  rejectButton,
  confirmRejectButton,
  cancelRejectButton,
  rejectionReason,
  rejectionPanel
) {

  if (
    processingApplication
  ) {

    return;

  }


  const applicationId =
    application?.application_id;


  if (!applicationId) {

    showMessage(
      "This application has no valid application ID.",
      "error"
    );

    return;

  }


  const groupName =
    applicationText(
      application.group_name,
      "this group"
    );


  const reason =
    String(
      rejectionReason?.value ??
      ""
    ).trim();


  if (!reason) {

    showMessage(
      "A rejection reason is required.",
      "error"
    );

    if (rejectionReason) {

      rejectionReason.focus();

    }

    return;

  }


  const confirmed =
    window.confirm(
      `Reject "${groupName}"? The application will be marked as rejected and the rejection reason will be recorded.`
    );


  if (!confirmed) {

    return;

  }


  processingApplication =
    true;


  if (approveButton) {

    approveButton.disabled =
      true;

  }


  if (rejectButton) {

    rejectButton.disabled =
      true;

  }


  if (confirmRejectButton) {

    confirmRejectButton.disabled =
      true;

    confirmRejectButton.textContent =
      "Rejecting...";

  }


  if (cancelRejectButton) {

    cancelRejectButton.disabled =
      true;

  }


  if (rejectionReason) {

    rejectionReason.disabled =
      true;

  }


  try {

    /*
     * Confirm that an authenticated session still exists
     * immediately before the mutation.
     */

    await requireAuthenticatedSession();


    /*
     * Canonical rejection boundary.
     *
     * Do not replace this with direct table writes.
     */

    const {
      data,
      error
    } =
      await supabase.rpc(
        "reject_group_application",
        {
          p_application_id:
            applicationId,

          p_reason:
            reason
        }
      );


    if (error) {

      throw error;

    }


    if (
      !data ||
      data.success !== true
    ) {

      throw new Error(
        "Application rejection did not return a successful result."
      );

    }


    showMessage(
      `Application rejected for ${groupName}.`,
      "success"
    );


    /*
     * Refresh both the platform-wide counters and the
     * application review surface after successful rejection.
     */

    await loadPlatformOverview();

  } catch (error) {

    const normalized =
      normalizeApplicationError(
        error,
        "reject"
      );


    if (
      normalized.type ===
        "session-expired" ||
      normalized.type ===
        "authentication-required"
    ) {

      showMessage(
        normalized.message,
        "error"
      );

      redirectToPlatformAdminLogin();

      return;

    }


    /*
     * A concurrent administrator may have processed the
     * same application between display and confirmation.
     *
     * Refresh the read surfaces so the UI reflects the
     * authoritative server state.
     */

    if (
      normalized.type ===
        "review-conflict"
    ) {

      showMessage(
        normalized.message,
        "error"
      );

      await loadPlatformOverview();

      return;

    }


    showMessage(
      normalized.message,
      normalized.type
    );

  } finally {

    processingApplication =
      false;


    if (approveButton) {

      approveButton.disabled =
        false;

    }


    if (rejectButton) {

      rejectButton.disabled =
        false;

    }


    if (confirmRejectButton) {

      confirmRejectButton.disabled =
        false;

      confirmRejectButton.textContent =
        "Confirm Rejection";

    }


    if (cancelRejectButton) {

      cancelRejectButton.disabled =
        false;

    }


    if (rejectionReason) {

      rejectionReason.disabled =
        false;

    }

  }

}


/* =========================================================
   LOAD PLATFORM OVERVIEW
========================================================= */

async function loadPlatformOverview() {

  if (
    loadingOverview
  ) {

    return;

  }


  loadingOverview =
    true;


  if (refreshButton) {

    refreshButton.disabled =
      true;

    refreshButton.textContent =
      "Refreshing...";

  }


  clearMessage();
  showLoading();


  try {

    /*
     * Authentication check only.
     *
     * This does not establish Platform Admin authority.
     * The RPC performs that authorization server-side.
     */

    await requireAuthenticatedSession();


    /*
     * Canonical Platform Admin read contract.
     */

    const {
      data,
      error
    } =
      await supabase.rpc(
        "get_platform_admin_overview"
      );


    if (error) {

      throw error;

    }


    const row =
      normalizeOverviewRow(
        data
      );


    renderOverview(
      row
    );


    showOverview();


    /*
     * Only load application-review data after the
     * Platform Admin overview has successfully passed
     * its server-side authorization boundary.
     */

    /*
     * Load the platform-owner feedback inbox immediately after
     * authorization succeeds. Keep it independent of application
     * review so an unrelated application-list failure cannot hide it.
     */
    await loadPlatformFeedback();
    await loadPlatformPageUsage();

    try {
      await loadPendingApplications();
    } catch (applicationError) {
      console.error("CHAMA LIVE: pending applications could not load.", applicationError);
      showMessage(
        "Platform overview and feedback are available, but pending applications could not be loaded. Use Refresh to try again.",
        "error"
      );
    }

  } catch (error) {

    const normalized =
      normalizeError(
        error
      );


    /*
     * Authentication/session failures must return to
     * the dedicated Platform Admin authentication boundary.
     *
     * Access-denied remains on this page so that an
     * authenticated non-admin is not silently redirected
     * into another portal.
     */

    if (
      normalized.type ===
        "session-expired" ||
      normalized.type ===
        "authentication-required"
    ) {

      showMessage(
        normalized.message,
        "error"
      );

      if (generatedAt) {

        generatedAt.textContent =
          "Platform overview unavailable.";

      }

      redirectToPlatformAdminLogin();

      return;

    }


    showMessage(
      normalized.message,
      normalized.type
    );


    if (generatedAt) {

      generatedAt.textContent =
        "Platform overview unavailable.";

    }

  } finally {

    loadingOverview =
      false;


    if (refreshButton) {

      refreshButton.disabled =
        false;

      refreshButton.textContent =
        "Refresh";

    }

  }

}


/* =========================================================
   SIGN OUT
========================================================= */

async function signOut() {

  if (logoutButton) {

    logoutButton.disabled =
      true;

    logoutButton.textContent =
      "Signing out...";

  }


  try {

    const {
      error
    } =
      await supabase.auth.signOut();


    if (error) {

      throw error;

    }


    /*
     * Platform Admin must return to the dedicated
     * Platform Admin authentication entry point.
     *
     * Do NOT route to admin-login.html because that
     * belongs to the Group Admin portal.
     */

    redirectToPlatformAdminLogin();

  } catch (error) {

    if (logoutButton) {

      logoutButton.disabled =
        false;

      logoutButton.textContent =
        "Sign Out";

    }


    showMessage(
      "Unable to sign out. Please try again."
    );

  }

}


/* =========================================================
   EVENTS
========================================================= */

if (refreshButton) {

  refreshButton.addEventListener(
    "click",
    () => {
      loadPlatformOverview();
    }
  );

}


if (logoutButton) {

  logoutButton.addEventListener(
    "click",
    () => {
      signOut();
    }
  );

}



/* =========================================================
   PLATFORM FEATURE / PAGE USAGE
   ---------------------------------------------------------
   The RPC authorizes platform-owner access server-side.
   The browser receives only group/page aggregate counts.
========================================================= */

const USAGE_PAGE_LABELS = {
  dashboard: "Dashboard",
  members: "Members",
  contributions: "Contributions",
  expenses: "Expenses",
  fines: "Fines",
  reports: "Reports",
  meetings: "Meetings",
  documents: "Documents",
  group_management: "Group Management",
  group_settings: "Group Settings",
  loans: "Loans",
  merry_go_round: "Merry-go-round",
  my_account: "My Account / Profile",
  plans: "Plans",
  activities: "Activities",
  assets: "Assets",
  milestones: "Milestones",
  data_migration: "Data Migration",
  notifications: "Notifications",
  group_calendar: "Group Calendar",
  other: "Other Pages"
};

let usageDays = 30;
let usageLoading = false;

function usageCell(row, value, tag = "td") {
  const cell = document.createElement(tag);
  cell.textContent = value == null ? "" : String(value);
  cell.style.cssText = "padding:10px 12px;border-bottom:1px solid #edf2f1;text-align:left;vertical-align:top";
  return cell;
}

function usageTable(headers, rows) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "overflow-x:auto";
  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px;min-width:520px";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const label of headers) headerRow.appendChild(usageCell(headerRow, label, "th"));
  thead.appendChild(headerRow);
  const tbody = document.createElement("tbody");
  for (const values of rows) {
    const tr = document.createElement("tr");
    for (const value of values) tr.appendChild(usageCell(tr, value));
    tbody.appendChild(tr);
  }
  table.append(thead, tbody);
  wrap.appendChild(table);
  return wrap;
}

function usageDate(value) {
  if (!value) return "No recorded visits";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
}

function ensureUsageSection() {
  let section = document.getElementById("platformUsageAnalytics");
  if (section) return section;

  section = document.createElement("section");
  section.id = "platformUsageAnalytics";
  section.className = "platform-card";
  section.style.cssText = "margin-top:20px;padding:20px";
  const top = document.createElement("div");
  top.style.cssText = "display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap";
  const copy = document.createElement("div");
  const heading = document.createElement("h2");
  heading.className = "platform-section-title";
  heading.textContent = "Feature & Page Usage";
  const description = document.createElement("p");
  description.textContent = "Group-level page visits and adoption. No member identities or financial details are collected.";
  description.style.cssText = "margin:-8px 0 14px;color:#667085;font-size:13px";
  copy.append(heading, description);

  const controls = document.createElement("div");
  controls.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:12px";
  const label = document.createElement("label");
  label.htmlFor = "platformUsagePeriod";
  label.textContent = "Period";
  const select = document.createElement("select");
  select.id = "platformUsagePeriod";
  select.className = "platform-refresh-button";
  select.style.cssText = "min-height:40px";
  for (const [value, textLabel] of [[7,"Last 7 days"],[30,"Last 30 days"],[90,"Last 90 days"]]) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = textLabel;
    if (value === usageDays) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener("change", () => {
    usageDays = Number(select.value) || 30;
    loadPlatformPageUsage();
  });
  controls.append(label, select);
  top.append(copy, controls);

  const status = document.createElement("p");
  status.id = "platformUsageStatus";
  status.setAttribute("role", "status");
  status.style.cssText = "color:#667085;font-size:13px";
  const content = document.createElement("div");
  content.id = "platformUsageContent";
  content.style.cssText = "display:grid;gap:22px";
  section.append(top, status, content);

  const main = document.querySelector("main") || document.querySelector(".platform-main") || document.body;
  const feedback = document.getElementById("platformFeedbackInbox");
  if (feedback && feedback.parentNode === main) main.insertBefore(section, feedback);
  else main.appendChild(section);
  return section;
}

async function loadPlatformPageUsage() {
  const section = ensureUsageSection();
  const status = document.getElementById("platformUsageStatus");
  const content = document.getElementById("platformUsageContent");
  if (!status || !content || usageLoading) return;

  usageLoading = true;
  status.textContent = "Loading page usage…";
  content.replaceChildren();
  try {
    const { data, error } = await supabase.rpc("get_platform_page_usage", { p_days: usageDays });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];

    const pageTotals = new Map();
    const groupTotals = new Map();
    for (const row of rows) {
      const visits = Number(row.view_count || 0);
      if (!pageTotals.has(row.page_key)) pageTotals.set(row.page_key, { visits: 0, groups: new Set() });
      const page = pageTotals.get(row.page_key);
      page.visits += visits;
      if (visits > 0) page.groups.add(row.group_id);

      if (!groupTotals.has(row.group_id)) {
        groupTotals.set(row.group_id, { name: row.group_name || "Unnamed group", visits: 0, last: null, pages: new Map() });
      }
      const group = groupTotals.get(row.group_id);
      group.visits += visits;
      if (row.last_viewed_at && (!group.last || new Date(row.last_viewed_at) > new Date(group.last))) group.last = row.last_viewed_at;
      if (visits > 0) {
        group.pages.set(row.page_key, (group.pages.get(row.page_key) || 0) + visits);
        if (!group.features) group.features = [];
        group.features.push({
          pageKey: row.page_key,
          visits,
          activeDays: Number(row.active_days || 0),
          lastViewedAt: row.last_viewed_at || null
        });
      }
    }

    const sortedPages = [...pageTotals.entries()].sort((a,b) => b[1].visits - a[1].visits || a[0].localeCompare(b[0]));
    const usedPages = sortedPages.filter(([, stats]) => stats.visits > 0);
    const groupRows = [...groupTotals.values()].sort((a,b) => b.visits - a.visits || a.name.localeCompare(b.name));
    status.textContent = "Showing " + usageDays + "-day usage. A visit is counted when a signed-in group page passes its portal access checks.";

    const pageHeading = document.createElement("h3");
    pageHeading.textContent = "Most-used pages";
    pageHeading.style.cssText = "margin:0;font-size:15px";
    content.appendChild(pageHeading);
    if (!usedPages.length) {
      const empty = document.createElement("p");
      empty.textContent = "No page visits have been recorded yet. Counts will grow as groups use CHAMA LIVE.";
      empty.style.cssText = "color:#667085;font-size:13px";
      content.appendChild(empty);
    }
    content.appendChild(usageTable(
      ["Page / feature", "Visits", "Groups using it"],
      sortedPages.map(([key, stats]) => [USAGE_PAGE_LABELS[key] || key, stats.visits.toLocaleString("en-KE"), stats.groups.size.toLocaleString("en-KE")])
    ));

    const groupHeading = document.createElement("h3");
    groupHeading.textContent = "Usage by group";
    groupHeading.style.cssText = "margin:0;font-size:15px";
    content.appendChild(groupHeading);
    content.appendChild(usageTable(
      ["Group", "Visits", "Most-used page", "Last visit"],
      groupRows.map(group => {
        const topPage = [...group.pages.entries()].sort((a,b) => b[1]-a[1])[0];
        return [group.name, group.visits.toLocaleString("en-KE"), topPage ? (USAGE_PAGE_LABELS[topPage[0]] || topPage[0]) : "No visits yet", usageDate(group.last)];
      })
    ));

    const detailHeading = document.createElement("h3");
    detailHeading.textContent = "Feature usage by group";
    detailHeading.style.cssText = "margin:0;font-size:15px";
    content.appendChild(detailHeading);
    const featureRows = [];
    for (const group of groupRows) {
      for (const feature of (group.features || [])) {
        featureRows.push([
          group.name,
          USAGE_PAGE_LABELS[feature.pageKey] || feature.pageKey,
          feature.visits.toLocaleString("en-KE"),
          feature.activeDays.toLocaleString("en-KE"),
          usageDate(feature.lastViewedAt)
        ]);
      }
    }
    featureRows.sort((a,b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    if (featureRows.length) {
      content.appendChild(usageTable(["Group", "Feature", "Visits", "Active days", "Last visit"], featureRows));
    } else {
      const empty = document.createElement("p");
      empty.textContent = "No group-feature combinations have usage yet.";
      empty.style.cssText = "color:#667085;font-size:13px";
      content.appendChild(empty);
    }
  } catch (error) {
    console.error("CHAMA LIVE: page usage report could not load.", error);
    status.textContent = "Page usage report could not be loaded. Confirm the signed-in account has platform-owner access and refresh.";
  } finally {
    usageLoading = false;
  }
}


/* =========================================================
   PLATFORM-OWNER FEEDBACK INBOX
   ---------------------------------------------------------
   Read access is enforced by public.feedback RLS using
   public.is_platform_admin(). Group roles cannot read rows.
========================================================= */

let feedbackInboxLoaded = false;

async function loadPlatformFeedback() {
  let section = document.getElementById("platformFeedbackInbox");
  if (!section) {
    section = document.createElement("section");
    section.id = "platformFeedbackInbox";
    section.className = "platform-card";
    section.style.cssText = "margin-top:20px;padding:20px";
    const heading = document.createElement("h2");
    heading.className = "platform-section-title";
    heading.textContent = "Member feedback";
    const description = document.createElement("p");
    description.textContent = "Feedback submitted from authenticated group pages. Visible to platform owners only.";
    description.style.cssText = "color:#667085;font-size:13px";
    const list = document.createElement("div");
    list.id = "platformFeedbackList";
    list.style.cssText = "display:grid;gap:12px";
    section.append(heading, description, list);
    const main = document.querySelector("main") || document.querySelector(".platform-main") || document.body;
    main.appendChild(section);
  }

  const list = document.getElementById("platformFeedbackList");
  if (!list) return;
  list.replaceChildren();
  const loadingText = document.createElement("p");
  loadingText.textContent = "Loading feedback…";
  list.appendChild(loadingText);

  try {
    const { data, error } = await supabase
      .from("feedback")
      .select("id,group_id,member_id,page,message,category,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.textContent = "No feedback has been submitted yet.";
      list.appendChild(empty);
      feedbackInboxLoaded = true;
      return;
    }

    for (const row of rows) {
      const item = document.createElement("article");
      item.style.cssText = "padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#fff";
      const title = document.createElement("strong");
      title.textContent = String(row.category || "feedback").replace(/[_-]+/g, " ");
      const meta = document.createElement("p");
      meta.style.cssText = "margin:5px 0;color:#667085;font-size:12px;overflow-wrap:anywhere";
      const date = row.created_at ? new Date(row.created_at).toLocaleString("en-KE") : "Time unavailable";
      meta.textContent = `${date} · Page: ${row.page || "unknown"} · Group: ${String(row.group_id || "").slice(0, 8)} · Member: ${String(row.member_id || "").slice(0, 8)}`;
      const body = document.createElement("p");
      body.style.cssText = "margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere";
      body.textContent = row.message || "";
      item.append(title, meta, body);
      list.appendChild(item);
    }
    feedbackInboxLoaded = true;
  } catch (error) {
    console.error("CHAMA LIVE: platform feedback inbox could not load.", error);
    list.replaceChildren();
    const warning = document.createElement("p");
    warning.setAttribute("role", "alert");
    warning.textContent = "Feedback inbox could not be loaded. Confirm the signed-in account has platform-owner access.";
    list.appendChild(warning);
  }
}


/* =========================================================
   INITIAL BOOT
========================================================= */

loadPlatformOverview();
