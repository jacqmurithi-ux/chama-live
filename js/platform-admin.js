/* =========================================================
   CHAMA LIVE — PLATFORM ADMIN
   ---------------------------------------------------------
   Platform-wide read-only overview.

   AUTHORIZATION
   ---------------------------------------------------------
   Platform Admin authorization is enforced server-side by:

     public.get_platform_admin_overview()

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
   Read-only RPC:

     get_platform_admin_overview()

   No database mutation is performed by this file.
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


/* =========================================================
   STATE
========================================================= */

let loadingOverview = false;


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

  message.className =
    "platform-message " +
    (
      type === "access-denied"
        ? "access-denied"
        : "error"
    );

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
      type: "error",
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
      type: "error",
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
      messageText ||
      "Unable to load the Platform Admin overview."
  };

}


/* =========================================================
   AUTHENTICATION CHECK
   ---------------------------------------------------------
   This confirms that an authenticated Supabase user exists.

   Platform Admin authorization itself remains server-side in
   get_platform_admin_overview().
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
   Supabase may return a row as an object or a one-row array
   depending on the RPC/table-return representation.

   The verified function returns one aggregate row.
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
  ------------------------------------------------------- */

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
  ------------------------------------------------------- */

  setText(
    "generatedAt",
    formatTimestamp(
      row.generated_at
    )
  );

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

  } catch (error) {

    const normalized =
      normalizeError(
        error
      );


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


    window.location.replace(
      "admin-login.html"
    );

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
