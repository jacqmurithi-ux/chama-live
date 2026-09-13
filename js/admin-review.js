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
   - Reconcile application rendering with admin-review.html
   - Remove stale loading/empty DOM dependencies
   - No subscription RPC calls
   - No direct database writes
   - No Edge Function changes
   ========================================================= */


/* =========================================================
   DOM REFERENCES
   ========================================================= */

const applicationsContainer =
  document.getElementById("applications");

const errorBox =
  document.getElementById("error");

const statusBox =
  document.getElementById("status");

const refreshButton =
  document.getElementById("refreshApplications") ||
  document.getElementById("refreshButton");

const logoutButton =
  document.getElementById("logoutButton");


/* =========================================================
   APPLICATION STATE
   ========================================================= */

/*
 * Keep the complete application objects returned by
 * list_pending_group_applications() available by ID.
 *
 * This preserves the applicant data returned by the
 * existing RPC without depending on rendered DOM text
 * for the rejection-email workflow.
 */
const applicationsById =
  new Map();


/* =========================================================
   UI HELPERS
   ========================================================= */

function showError(message) {
  if (!errorBox) return;

  errorBox.textContent =
    message ||
    "An unexpected error occurred.";

  errorBox.hidden = false;
}

function clearError() {
  if (!errorBox) return;

  errorBox.textContent = "";
  errorBox.hidden = true;
}

function showStatus(message) {
  if (!statusBox) return;

  statusBox.textContent =
    message || "";

  statusBox.hidden =
    !message;
}

function clearStatus() {
  if (!statusBox) return;

  statusBox.textContent = "";
  statusBox.hidden = true;
}

function setRefreshState(disabled) {
  if (!refreshButton) return;

  refreshButton.disabled =
    disabled;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

function escapeAttribute(value) {
  return escapeHtml(value);
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
    window.location.href =
      "login.html";

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

  setRefreshState(true);

  try {
    if (!applicationsContainer) {
      throw new Error(
        "Applications container was not found."
      );
    }

    /*
     * Preserve the existing pending-application RPC.
     */
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

    applicationsById.clear();

    applications.forEach(
      (application) => {
        if (application?.id) {
          applicationsById.set(
            String(application.id),
            application
          );
        }
      }
    );

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
    renderEmptyState();
    return;
  }

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

function renderEmptyState() {
  if (!applicationsContainer) {
    return;
  }

  applicationsContainer.innerHTML = `
    <div class="cl-empty">

      <div class="cl-empty-icon">
        ✓
      </div>

      <strong>
        No pending applications
      </strong>

      <span>
        There are currently no group applications
        awaiting administrator review.
      </span>

    </div>
  `;
}

function createApplicationCard(
  application
) {
  const card =
    document.createElement("article");

  card.className =
    "cl-application";

  const id =
    application?.id || "";

  const groupName =
    application?.group_name ||
    "Unnamed group";

  const adminName =
    application?.admin_name ||
    "Unnamed administrator";

  const email =
    application?.email ||
    "";

  const phone =
    application?.phone ||
    application?.phone_number ||
    "";

  const county =
    application?.county ||
    "";

  const ward =
    application?.ward ||
    "";

  const createdAt =
    application?.created_at
      ? new Date(
          application.created_at
        ).toLocaleString()
      : "";

  card.innerHTML = `
    <div class="cl-application-top">

      <div>
        <h3 class="cl-application-title">
          ${escapeHtml(groupName)}
        </h3>

        ${
          createdAt
            ? `
              <div class="cl-application-meta">
                Applied ${escapeHtml(createdAt)}
              </div>
            `
            : ""
        }
      </div>

      <span class="cl-status-pill">
        Pending
      </span>

    </div>


    <div class="cl-application-grid">

      <div class="cl-detail">
        <span class="cl-detail-label">
          Administrator
        </span>

        <span class="cl-detail-value">
          ${escapeHtml(adminName)}
        </span>
      </div>


      <div class="cl-detail">
        <span class="cl-detail-label">
          Email
        </span>

        <span class="cl-detail-value">
          ${escapeHtml(email)}
        </span>
      </div>


      ${
        phone
          ? `
            <div class="cl-detail">
              <span class="cl-detail-label">
                Phone
              </span>

              <span class="cl-detail-value">
                ${escapeHtml(phone)}
              </span>
            </div>
          `
          : ""
      }


      ${
        county
          ? `
            <div class="cl-detail">
              <span class="cl-detail-label">
                County
              </span>

              <span class="cl-detail-value">
                ${escapeHtml(county)}
              </span>
            </div>
          `
          : ""
      }


      ${
        ward
          ? `
            <div class="cl-detail">
              <span class="cl-detail-label">
                Ward
              </span>

              <span class="cl-detail-value">
                ${escapeHtml(ward)}
              </span>
            </div>
          `
          : ""
      }


      ${
        createdAt
          ? `
            <div class="cl-detail">
              <span class="cl-detail-label">
                Applied
              </span>

              <span class="cl-detail-value">
                ${escapeHtml(createdAt)}
              </span>
            </div>
          `
          : ""
      }

    </div>


    <div class="cl-application-actions">

      <button
        type="button"
        class="cl-action cl-approve"
        data-action="approve"
        data-application-id="${escapeAttribute(id)}"
      >
        Approve
      </button>

      <button
        type="button"
        class="cl-action cl-reject"
        data-action="reject"
        data-application-id="${escapeAttribute(id)}"
      >
        Reject
      </button>

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
     * Subscription initialization and Cycle 1 creation
     * remain inside approve_group_application().
     *
     * No client-side subscription operation is introduced.
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
     * Recover the original application returned by
     * list_pending_group_applications().
     *
     * This avoids inventing a new database query and avoids
     * depending on presentation-layer text extraction.
     */
    const application =
      applicationsById.get(
        String(id)
      );

    const email =
      application?.email ||
      "";

    const adminName =
      application?.admin_name ||
      "";

    const groupName =
      application?.group_name ||
      "";

    /*
     * Preserve the existing behavior:
     * send the rejection email after the rejection succeeds.
     */
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
      button.disabled =
        disabled;
    }
  );
}


/* =========================================================
   EVENT HANDLERS
   ========================================================= */

function setupActions() {
  /*
   * admin-review.html:
   *
   *   id="refreshApplications"
   */
  if (refreshButton) {
    refreshButton.addEventListener(
      "click",
      async () => {
        await loadApplications();
      }
    );
  }

  /*
   * Keep compatibility with any existing page variant
   * that provides logoutButton.
   *
   * The supplied admin-review.html does not currently
   * render this element, so no new UI contract is created.
   */
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
