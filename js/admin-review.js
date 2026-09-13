import {
  supabase,
  BASE_URL
} from "./auth.js";

/* =========================================================
   CHAMA LIVE — PLATFORM ADMIN REVIEW
   Reconciled application-layer candidate

   Scope:
   - Preserve existing approval/rejection workflow
   - Preserve existing Supabase RPC contracts
   - Preserve existing approval response contract
   - Preserve existing review-email workflow
   - Reconcile Refresh button ID with admin-review.html
   - No subscription RPC calls
   - No direct database writes
   - No Edge Function changes
   ========================================================= */

const applicationList =
  document.getElementById("applicationList");

const applicationsContainer =
  document.getElementById("applications") ||
  document.getElementById("applicationsContainer");

const loadingBox =
  document.getElementById("loading");

const emptyBox =
  document.getElementById("empty");

const errorBox =
  document.getElementById("error");

const statusBox =
  document.getElementById("status");

/*
 * admin-review.html uses:
 *
 *   id="refreshApplications"
 *
 * Keep the older refreshButton fallback so this JS remains
 * compatible with any existing page variant without creating
 * a new UI contract.
 */
const refreshButton =
  document.getElementById("refreshApplications") ||
  document.getElementById("refreshButton");

const logoutButton =
  document.getElementById("logoutButton");


/* =========================================================
   UI HELPERS
   ========================================================= */

function showLoading(show) {
  if (!loadingBox) return;

  loadingBox.hidden = !show;
}

function showEmpty(show) {
  if (!emptyBox) return;

  emptyBox.hidden = !show;
}

function showError(message) {
  if (!errorBox) return;

  errorBox.textContent =
    message || "An unexpected error occurred.";

  errorBox.hidden = false;
}

function clearError() {
  if (!errorBox) return;

  errorBox.textContent = "";
  errorBox.hidden = true;
}

function showStatus(message) {
  if (!statusBox) return;

  statusBox.textContent = message || "";
  statusBox.hidden = !message;
}

function clearStatus() {
  if (!statusBox) return;

  statusBox.textContent = "";
  statusBox.hidden = true;
}

function setRefreshState(disabled) {
  if (!refreshButton) return;

  refreshButton.disabled = disabled;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   AUTHENTICATION / PLATFORM ADMIN CHECK
   ========================================================= */

async function getCurrentSession() {
  const {
    data,
    error
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(
      error.message ||
      "Unable to read the current session."
    );
  }

  return data?.session || null;
}

async function verifyPlatformAdmin() {
  const session =
    await getCurrentSession();

  if (!session) {
    window.location.href = "login.html";
    return false;
  }

  const {
    data,
    error
  } = await supabase.rpc(
    "is_platform_admin"
  );

  if (error) {
    throw new Error(
      error.message ||
      "Unable to verify platform administrator access."
    );
  }

  if (data !== true) {
    throw new Error(
      "Platform administrator access required."
    );
  }

  return true;
}


/* =========================================================
   APPLICATION LOADING
   ========================================================= */

async function loadApplications() {
  clearError();
  clearStatus();

  showLoading(true);
  showEmpty(false);
  setRefreshState(true);

  try {
    const {
      data,
      error
    } = await supabase.rpc(
      "list_pending_group_applications"
    );

    if (error) {
      throw new Error(
        error.message ||
        "Unable to load pending applications."
      );
    }

    const applications =
      Array.isArray(data)
        ? data
        : [];

    renderApplications(
      applications
    );
  } catch (error) {
    console.error(
      "Failed to load pending applications:",
      error
    );

    showError(
      error?.message ||
      "Unable to load pending applications."
    );
  } finally {
    showLoading(false);
    setRefreshState(false);
  }
}


/* =========================================================
   APPLICATION RENDERING
   ========================================================= */

function renderApplications(
  applications
) {
  if (!applicationsContainer) {
    throw new Error(
      "Applications container was not found."
    );
  }

  applicationsContainer.innerHTML = "";

  if (!applications.length) {
    showEmpty(true);
    return;
  }

  showEmpty(false);

  applications.forEach(
    (application) => {
      const card =
        createApplicationCard(
          application
        );

      applicationsContainer.appendChild(
        card
      );
    }
  );
}

function createApplicationCard(
  application
) {
  const card =
    document.createElement("div");

  card.className =
    "application-card";

  const id =
    application.id;

  const groupName =
    application.group_name ||
    "Unnamed group";

  const adminName =
    application.admin_name ||
    "Unnamed administrator";

  const email =
    application.email ||
    "";

  const phone =
    application.phone ||
    application.phone_number ||
    "";

  const county =
    application.county ||
    "";

  const ward =
    application.ward ||
    "";

  const createdAt =
    application.created_at
      ? new Date(
          application.created_at
        ).toLocaleString()
      : "";

  card.innerHTML = `
    <div class="application-card-content">

      <div class="application-card-header">
        <h3>
          ${escapeHtml(groupName)}
        </h3>
      </div>

      <div class="application-details">

        <div class="application-detail">
          <strong>Administrator</strong>
          <span>
            ${escapeHtml(adminName)}
          </span>
        </div>

        <div class="application-detail">
          <strong>Email</strong>
          <span>
            ${escapeHtml(email)}
          </span>
        </div>

        ${
          phone
            ? `
              <div class="application-detail">
                <strong>Phone</strong>
                <span>
                  ${escapeHtml(phone)}
                </span>
              </div>
            `
            : ""
        }

        ${
          county
            ? `
              <div class="application-detail">
                <strong>County</strong>
                <span>
                  ${escapeHtml(county)}
                </span>
              </div>
            `
            : ""
        }

        ${
          ward
            ? `
              <div class="application-detail">
                <strong>Ward</strong>
                <span>
                  ${escapeHtml(ward)}
                </span>
              </div>
            `
            : ""
        }

        ${
          createdAt
            ? `
              <div class="application-detail">
                <strong>Applied</strong>
                <span>
                  ${escapeHtml(createdAt)}
                </span>
              </div>
            `
            : ""
        }

      </div>

      <div class="application-actions">

        <button
          type="button"
          class="approve-button"
          data-action="approve"
          data-application-id="${escapeHtml(id)}"
        >
          Approve
        </button>

        <button
          type="button"
          class="reject-button"
          data-action="reject"
          data-application-id="${escapeHtml(id)}"
        >
          Reject
        </button>

      </div>

    </div>
  `;

  return card;
}


/* =========================================================
   APPROVAL
   ========================================================= */

async function approveApplication(
  id
) {
  if (!id) {
    showError(
      "Application ID is missing."
    );
    return;
  }

  const confirmed =
    window.confirm(
      "Approve this application?\n\n" +
      "This will create the group and " +
      "administrator member, activate the account, " +
      "and then send the approval email."
    );

  if (!confirmed) {
    return;
  }

  clearError();
  clearStatus();

  try {
    setActionButtonsDisabled(true);

    showStatus(
      "Approving application..."
    );

    /*
     * Preserve the existing approval RPC contract.
     *
     * Do not replace this with client-side inserts.
     * Subscription initialization and Cycle 1 creation
     * are handled inside approve_group_application().
     */
    const {
      data,
      error
    } = await supabase.rpc(
      "approve_group_application",
      {
        p_application_id: id
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "Unable to approve application."
      );
    }

    if (
      !data ||
      data.success !== true
    ) {
      throw new Error(
        "Application approval did not return a successful response."
      );
    }

    /*
     * Preserve the existing approval response contract.
     *
     * These fields are returned by
     * approve_group_application().
     */
    const email =
      data.email;

    const adminName =
      data.admin_name;

    const groupName =
      data.group_name;

    const memberNumber =
      data.member_number;

    const accessCode =
      data.access_code;

    if (!email) {
      throw new Error(
        "Application was approved, but no applicant email was returned."
      );
    }

    showStatus(
      "Application approved. Sending approval email..."
    );

    /*
     * Preserve the existing review-email workflow.
     *
     * No direct authentication or member writes
     * are performed here.
     */
    const {
      data: emailData,
      error: emailError
    } = await supabase.functions.invoke(
      "send-review-email",
      {
        body: {
          action: "approved",
          email,
          admin_name: adminName,
          group_name: groupName,
          member_number: memberNumber,
          access_code: accessCode
        }
      }
    );

    if (emailError) {
      console.error(
        "Approval email failed:",
        emailError
      );

      showStatus(
        "Application approved, but the approval email could not be sent."
      );

      /*
       * The approval itself has already succeeded.
       * Do not report the database operation as failed.
       */
      await loadApplications();
      return;
    }

    if (
      emailData &&
      emailData.success === false
    ) {
      console.error(
        "Approval email returned failure:",
        emailData
      );

      showStatus(
        "Application approved, but the approval email could not be sent."
      );

      await loadApplications();
      return;
    }

    showStatus(
      "Application approved successfully."
    );

    await loadApplications();
  } catch (error) {
    console.error(
      "Failed to approve application:",
      error
    );

    showError(
      error?.message ||
      "Unable to approve application."
    );
  } finally {
    setActionButtonsDisabled(
      false
    );
  }
}


/* =========================================================
   REJECTION
   ========================================================= */

async function rejectApplication(
  id
) {
  if (!id) {
    showError(
      "Application ID is missing."
    );
    return;
  }

  const confirmed =
    window.confirm(
      "Reject this application?\n\n" +
      "This action will mark the application as rejected."
    );

  if (!confirmed) {
    return;
  }

  clearError();
  clearStatus();

  try {
    setActionButtonsDisabled(true);

    showStatus(
      "Rejecting application..."
    );

    /*
     * Preserve the existing rejection RPC contract.
     */
    const {
      data,
      error
    } = await supabase.rpc(
      "reject_group_application",
      {
        p_application_id: id
      }
    );

    if (error) {
      throw new Error(
        error.message ||
        "Unable to reject application."
      );
    }

    if (
      data === false ||
      (
        data &&
        typeof data === "object" &&
        data.success === false
      )
    ) {
      throw new Error(
        "Application rejection was not successful."
      );
    }

    /*
     * Preserve the existing workflow of sending the
     * rejection email after the rejection RPC succeeds.
     *
     * The applicant details are recovered from the
     * application currently rendered in the page.
     */
    const card =
      applicationsContainer?.querySelector(
        `[data-application-id="${CSS.escape(
          String(id)
        )}"]`
      );

    let email = "";
    let adminName = "";
    let groupName = "";

    if (card) {
      const details =
        card.querySelectorAll(
          ".application-detail"
        );

      details.forEach(
        (detail) => {
          const label =
            detail.querySelector(
              "strong"
            )
              ?.textContent
              ?.trim()
              ?.toLowerCase();

          const value =
            detail.querySelector(
              "span"
            )
              ?.textContent
              ?.trim() || "";

          if (
            label === "email"
          ) {
            email = value;
          }

          if (
            label === "administrator"
          ) {
            adminName = value;
          }
        }
      );

      groupName =
        card.querySelector("h3")
          ?.textContent
          ?.trim() || "";
    }

    if (email) {
      showStatus(
        "Application rejected. Sending rejection email..."
      );

      const {
        data: emailData,
        error: emailError
      } = await supabase.functions.invoke(
        "send-review-email",
        {
          body: {
            action: "rejected",
            email,
            admin_name: adminName,
            group_name: groupName
          }
        }
      );

      if (emailError) {
        console.error(
          "Rejection email failed:",
          emailError
        );

        showStatus(
          "Application rejected, but the rejection email could not be sent."
        );

        await loadApplications();
        return;
      }

      if (
        emailData &&
        emailData.success === false
      ) {
        console.error(
          "Rejection email returned failure:",
          emailData
        );

        showStatus(
          "Application rejected, but the rejection email could not be sent."
        );

        await loadApplications();
        return;
      }
    }

    showStatus(
      "Application rejected successfully."
    );

    await loadApplications();
  } catch (error) {
    console.error(
      "Failed to reject application:",
      error
    );

    showError(
      error?.message ||
      "Unable to reject application."
    );
  } finally {
    setActionButtonsDisabled(
      false
    );
  }
}


/* =========================================================
   ACTION BUTTON STATE
   ========================================================= */

function setActionButtonsDisabled(
  disabled
) {
  if (!applicationsContainer) {
    return;
  }

  const buttons =
    applicationsContainer.querySelectorAll(
      "[data-action]"
    );

  buttons.forEach(
    (button) => {
      button.disabled = disabled;
    }
  );
}


/* =========================================================
   EVENT HANDLERS
   ========================================================= */

function setupActions() {
  /*
   * Reconciled with admin-review.html:
   *
   * HTML:
   *   id="refreshApplications"
   *
   * JS:
   *   refreshButton
   *
   * The fallback to refreshButton preserves compatibility
   * with any older markup without changing the page contract.
   */
  if (refreshButton) {
    refreshButton.addEventListener(
      "click",
      async () => {
        await loadApplications();
      }
    );
  }

  if (logoutButton) {
    logoutButton.addEventListener(
      "click",
      async () => {
        clearError();
        clearStatus();

        try {
          const {
            error
          } = await supabase.auth.signOut();

          if (error) {
            throw error;
          }

          window.location.href =
            "login.html";
        } catch (error) {
          console.error(
            "Logout failed:",
            error
          );

          showError(
            error?.message ||
            "Unable to sign out."
          );
        }
      }
    );
  }

  if (applicationsContainer) {
    applicationsContainer.addEventListener(
      "click",
      async (event) => {
        const button =
          event.target.closest(
            "[data-action]"
          );

        if (!button) {
          return;
        }

        const action =
          button.dataset.action;

        const id =
          button.dataset.applicationId;

        if (
          action === "approve"
        ) {
          await approveApplication(
            id
          );
          return;
        }

        if (
          action === "reject"
        ) {
          await rejectApplication(
            id
          );
        }
      }
    );
  }
}


/* =========================================================
   AUTH STATE
   ========================================================= */

function setupAuthListener() {
  supabase.auth.onAuthStateChange(
    (event, session) => {
      if (
        event === "SIGNED_OUT" ||
        !session
      ) {
        window.location.href =
          "login.html";
      }
    }
  );
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function initialize() {
  clearError();
  clearStatus();

  try {
    const isAdmin =
      await verifyPlatformAdmin();

    if (!isAdmin) {
      return;
    }

    setupActions();
    setupAuthListener();

    await loadApplications();
  } catch (error) {
    console.error(
      "Admin review initialization failed:",
      error
    );

    showLoading(false);

    showError(
      error?.message ||
      "Unable to initialize the admin review page."
    );
  }
}


/* =========================================================
   START
   ========================================================= */

initialize();

