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

   MUTATION RPC:

     approve_group_application(uuid)

   The frontend does NOT perform direct database writes.

   APPLICATION REVIEW
   ---------------------------------------------------------
   The application-review surface:

     1. Reads pending / under-review applications through
        get_platform_admin_applications().
     2. Displays the application details.
     3. Requires explicit confirmation before approval.
     4. Calls the existing approve_group_application(uuid).
     5. Refreshes the overview and application list.

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

let approvingApplication = false;


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
      "already approved"
    )
  ) {

    return {
      type: "approval-conflict",
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
      type: "approval-conflict",
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
      type: "approval-conflict",
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
      "Unable to approve this application. Please try again."
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
       ACTION
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


    approveButton.addEventListener(
      "click",
      () => {

        approveApplication(
          application,
          approveButton
        );

      }
    );


    actions.appendChild(
      approveButton
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
    approvingApplication
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


  approvingApplication =
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

    await Promise.all([
      loadPlatformOverview(),
      loadPendingApplications()
    ]);

  } catch (error) {

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


    /*
     * A concurrent administrator may have processed the
     * same application between display and confirmation.
     *
     * Refresh the read surfaces so the UI reflects the
     * authoritative server state.
     */

    if (
      normalized.type ===
        "approval-conflict"
    ) {

      showMessage(
        normalized.message,
        "error"
      );

      await Promise.all([
        loadPlatformOverview(),
        loadPendingApplications()
      ]);

      return;

    }


    showMessage(
      normalized.message,
      normalized.type
    );

  } finally {

    approvingApplication =
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

    await loadPendingApplications();

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
   INITIAL BOOT
========================================================= */

loadPlatformOverview();
