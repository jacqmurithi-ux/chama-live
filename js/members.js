/* =========================================================
   CHAMA LIVE — MEMBERS
   Pilot-ready members management
   National ID + Contribution Accounting
   ---------------------------------------------------------
   NEW MEMBER FLOW
   ---------------------------------------------------------
   Member details
      ↓
   Contribution setup
      ↓
   Optional historical contribution setup
      ↓
   create_member_with_contribution_plan()
   OR
   create_member_with_historical_contributions()
      ↓
   Initial obligations / historical payments
      ↓
   Initial contribution status

   MEMBER VIEW FLOW
   ---------------------------------------------------------
   View Member
      ↓
   get_member_contribution_position()
      ↓
   Read-only contribution position
      ↓
   Total Due / Allocated / Arrears / Credit

   HISTORICAL RECONCILIATION
   ---------------------------------------------------------
   Separate explicit action only:
   reconcile_member_historical_payments()

   IMPORTANT ACCOUNTING RULE
   ---------------------------------------------------------
   Historical payments are created through the canonical
   create_member_with_historical_contributions() backend
   transaction.

   This frontend does NOT directly insert:
   - contributions
   - contribution_allocations
   - contribution_obligations

   IMPORTANT EDITING RULE
   ---------------------------------------------------------
   Existing-member profile editing does NOT call the
   new-member historical onboarding RPC.

   Historical onboarding is a creation-time operation.
   Editing an existing member must not silently create
   historical financial records.

   Existing-member reconciliation remains a separate,
   explicit server-side accounting action.
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let groupId = null;
let members = [];
let editingMemberId = null;
let initialized = false;
let eventsBound = false;

/* Approved performance change:
   debounce member search rendering */
let memberSearchTimer = null;

let monthlyContributionType = null;
let contributionTypesLoaded = false;

/*
   READ-ONLY contribution positions used by the
   Members dashboard.

   Key:
     member.id

   Value:
     get_member_contribution_position() result

   This map is never written to Supabase.
*/
let contributionPositions = new Map();
let contributionPositionsLoaded = false;


/* =========================================================
   BASIC HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date.toLocaleDateString(
    "en-KE",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );
}

function getToday() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function getInitials(name) {
  const value =
    String(name || "").trim();

  if (!value) {
    return "M";
  }

  const parts =
    value
      .split(/\s+/)
      .filter(Boolean);

  if (
    parts.length === 1
  ) {
    return parts[0]
      .substring(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
}

function displayRole(role) {
  const value =
    String(
      role || "member"
    )
      .trim()
      .toLowerCase();

  const labels = {
    admin: "Admin",
    member: "Member",
    chairperson: "Chairperson",
    secretary: "Secretary",
    treasurer: "Treasurer"
  };

  return (
    labels[value] ||
    value.charAt(0).toUpperCase() +
      value.slice(1)
  );
}

function roleBadgeHtml(role) {
  const value =
    String(
      role || "member"
    )
      .trim()
      .toLowerCase();

  const suffix = [
    "admin",
    "chairperson",
    "secretary",
    "treasurer"
  ].includes(value)
    ? ` role-${value}`
    : " role-member";

  return `
    <span class="member-role-badge${suffix}">
      ${escapeHtml(
        displayRole(role)
      )}
    </span>
  `;
}

function accountStatusHtml(status) {
  const value =
    String(
      status || "active"
    )
      .trim()
      .toLowerCase();

  if (
    value === "active"
  ) {
    return `
      <span class="member-status-badge status-active">
        <span class="status-dot"></span>
        Active
      </span>
    `;
  }

  return `
    <span class="member-status-badge status-inactive">
      <span class="status-dot"></span>
      ${escapeHtml(
        value.charAt(0).toUpperCase() +
        value.slice(1)
      )}
    </span>
  `;
}


/* =========================================================
   LOGIN STATUS
========================================================= */

function getLoginStatus(member) {
  if (!member) {
    return "No Login";
  }

  if (
    member.activated_at
  ) {
    return "Active";
  }

  const onboarding =
    String(
      member.onboarding_status || ""
    ).toLowerCase();

  if (
    onboarding === "activated" ||
    onboarding === "active"
  ) {
    return "Active";
  }

  if (
    onboarding === "invited" ||
    member.invited_at
  ) {
    return "Invitation Sent";
  }

  if (
    member.auth_user_id ||
    member.user_id
  ) {
    return "Invitation Sent";
  }

  return "No Login";
}

function loginStatusHtml(member) {
  const status =
    getLoginStatus(member);

  if (
    status === "Active"
  ) {
    return `
      <span class="login-badge login-active">
        <span class="login-icon">✓</span>
        Active
      </span>
    `;
  }

  if (
    status === "Invitation Sent"
  ) {
    return `
      <span class="login-badge login-invited">
        <span class="login-icon">✉</span>
        Invitation Sent
      </span>
    `;
  }

  return `
    <span class="login-badge login-none">
      <span class="login-icon">○</span>
      No Login
    </span>
  `;
}


/* =========================================================
   CONTRIBUTION STATUS — MEMBERS LIST
   ---------------------------------------------------------
   Read-only display sourced from:
   get_member_contribution_position()
========================================================= */

function contributionStatusKey(position) {
  const status =
    String(
      position?.status || ""
    )
      .trim()
      .toLowerCase();

  const arrears =
    Number(
      position?.arrears || 0
    );

  const credit =
    Number(
      position?.credit || 0
    );

  /*
     Canonical status compatibility.

     get_member_contribution_position()
     may expose:
       arrears
       credit
       up_to_date
       paid
       partial
       outstanding
       plan_not_set
  */

  if (
    status === "arrears" ||
    status === "outstanding" ||
    status === "partial" ||
    arrears > 0
  ) {
    return "ARREARS";
  }

  if (
    status === "credit" ||
    credit > 0
  ) {
    return "CREDIT";
  }

  if (
    status === "up_to_date" ||
    status === "paid"
  ) {
    return "UP_TO_DATE";
  }

  return status === "plan_not_set"
    ? "PLAN_NOT_SET"
    : "UNKNOWN";
}

function contributionStatusHtml(member) {
  const position =
    contributionPositions.get(
      String(member.id)
    );

  const key =
    contributionStatusKey(
      position
    );

  if (
    key === "ARREARS"
  ) {
    return `
      <span
        class="member-contribution-status status-arrears"
      >
        Arrears —
        ${escapeHtml(
          formatMoney(
            position?.arrears ??
            position?.outstanding ??
            0
          )
        )}
      </span>
    `;
  }

  if (
    key === "CREDIT"
  ) {
    return `
      <span
        class="member-contribution-status status-credit"
      >
        Credit —
        ${escapeHtml(
          formatMoney(
            position?.credit
          )
        )}
      </span>
    `;
  }

  if (
    key === "UP_TO_DATE"
  ) {
    return `
      <span
        class="member-contribution-status status-up-to-date"
      >
        Up to Date
      </span>
    `;
  }

  if (
    key === "PLAN_NOT_SET"
  ) {
    return `
      <span
        class="member-contribution-status status-unknown"
      >
        Plan Not Set
      </span>
    `;
  }

  return `
    <span
      class="member-contribution-status status-unknown"
    >
      Unavailable
    </span>
  `;
}

async function loadMemberContributionPositions() {
  contributionPositions.clear();
  contributionPositionsLoaded = false;

  if (
    !members.length
  ) {
    contributionPositionsLoaded = true;
    return;
  }

  const results =
    await Promise.all(
      members.map(
        async member => {
          try {
            const result =
              await supabase.rpc(
                "get_member_contribution_position",
                {
                  p_member_id:
                    member.id
                },
                {
                  get: true
                }
              );

            if (
              result.error
            ) {
              throw result.error;
            }

            const position =
              Array.isArray(
                result.data
              )
                ? result.data[0]
                : result.data;

            return [
              String(member.id),
              position || null
            ];

          } catch (error) {
            console.error(
              "CHAMA LIVE: Member contribution position error",
              member.id,
              error
            );

            return [
              String(member.id),
              null
            ];
          }
        }
      )
    );

  results.forEach(
    ([memberId, position]) => {
      contributionPositions.set(
        memberId,
        position
      );
    }
  );

  contributionPositionsLoaded = true;
}

function ensureContributionStatusHeader() {
  const headRow =
    document.querySelector(
      ".members-table thead tr"
    );

  if (!headRow) {
    return;
  }

  if (
    headRow.querySelector(
      "[data-contribution-status-header]"
    ) ||
    [...headRow.children].some(
      cell =>
        cell.textContent.trim().toLowerCase() ===
        "contribution status"
    )
  ) {
    return;
  }

  const th =
    document.createElement(
      "th"
    );

  th.dataset.contributionStatusHeader =
    "true";

  th.textContent =
    "Contribution Status";

  const loginHeader =
    [...headRow.children]
      .find(
        cell =>
          cell.textContent.trim() ===
          "Login"
      );

  if (loginHeader) {
    headRow.insertBefore(
      th,
      loginHeader
    );
  } else {
    headRow.appendChild(
      th
    );
  }
}

function ensureContributionStatusStyles() {
  if (
    byId(
      "memberContributionStatusStyles"
    )
  ) {
    return;
  }

  const style =
    document.createElement(
      "style"
    );

  style.id =
    "memberContributionStatusStyles";

  style.textContent = `
    .member-contribution-status {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.2;
      white-space: nowrap;
    }

    .member-contribution-status.status-arrears {
      background: rgba(220, 38, 38, .09);
      color: #b91c1c;
    }

    .member-contribution-status.status-credit {
      background: rgba(37, 99, 235, .09);
      color: #1d4ed8;
    }

    .member-contribution-status.status-up-to-date {
      background: rgba(22, 163, 74, .09);
      color: #15803d;
    }

    .member-contribution-status.status-unknown {
      background: rgba(100, 116, 139, .09);
      color: #64748b;
    }

    .member-card-contribution-status {
      margin-top: 8px;
    }

    .member-card-contribution-status
      .member-contribution-status {
      width: 100%;
      justify-content: center;
    }

    @media (max-width: 560px) {
      .member-contribution-status {
        white-space: normal;
      }
    }
  `;

  document.head.appendChild(
    style
  );
}


/* =========================================================
   MESSAGES
========================================================= */

function showStatus(message) {
  const node =
    byId("status");

  if (!node) {
    return;
  }

  node.textContent =
    message || "";

  node.hidden =
    !message;
}

function showError(error) {
  console.error(
    "CHAMA LIVE: Members error",
    error
  );

  const node =
    byId("error");

  if (!node) {
    return;
  }

  const message =
    typeof error === "string"
      ? error
      : error?.message ||
        String(
          error ||
          "Something went wrong."
        );

  node.innerHTML = `
    <div class="error-icon">
      !
    </div>

    <div>
      <strong>
        Something went wrong
      </strong>

      <div class="error-detail">
        ${escapeHtml(
          message
        )}
      </div>
    </div>
  `;

  node.hidden =
    false;
}

function clearError() {
  const node =
    byId("error");

  if (!node) {
    return;
  }

  node.innerHTML =
    "";

  node.hidden =
    true;
}

function showFormMessage(
  message,
  type = "success"
) {
  const node =
    byId("formMessage");

  if (!node) {
    return;
  }

  node.textContent =
    message || "";

  node.className =
    `form-message ${type}`;

  node.style.display =
    message
      ? "flex"
      : "none";
}

function clearFormMessage() {
  const node =
    byId("formMessage");

  if (!node) {
    return;
  }

  node.textContent =
    "";

  node.style.display =
    "none";
}


/* =========================================================
   MEMBER LOOKUP
========================================================= */

function findMember(memberId) {
  return members.find(
    member =>
      String(member.id) ===
      String(memberId)
  );
}


/* =========================================================
   NATIONAL ID UI
========================================================= */

function ensureNationalIdUI() {
  const form =
    byId("addMemberForm");

  const memberNumber =
    byId("memberNumber");

  if (
    form &&
    !byId("memberNationalId")
  ) {
    const field =
      document.createElement(
        "div"
      );

    field.className =
      "member-form-field";

    field.innerHTML = `
      <label
        class="form-section-label"
        for="memberNationalId"
      >
        National ID
      </label>

      <input
        id="memberNationalId"
        name="memberNationalId"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        maxlength="30"
        placeholder="National ID number"
      >

      <small class="muted member-form-hint">
        Required when adding a new member.
      </small>
    `;

    const anchor =
      memberNumber?.closest(
        ".member-form-field"
      );

    if (
      anchor?.parentElement
    ) {
      anchor.parentElement.insertBefore(
        field,
        anchor.nextElementSibling
      );
    } else {
      form
        .querySelector(
          ".member-form-grid"
        )
        ?.appendChild(
          field
        );
    }
  }

  const table =
    document.querySelector(
      ".members-table"
    );

  const headRow =
    table?.querySelector(
      "thead tr"
    );

  if (
    headRow &&
    !headRow.querySelector(
      "[data-national-id-header]"
    ) &&
    ![...headRow.children].some(
      cell =>
        cell.textContent.trim().toLowerCase() ===
        "national id"
    )
  ) {
    const th =
      document.createElement(
        "th"
      );

    th.dataset.nationalIdHeader =
      "true";

    th.textContent =
      "National ID";

    const memberHeader =
      [...headRow.children]
        .find(
          cell =>
            cell.textContent.trim() ===
            "Member No."
        );

    if (
      memberHeader?.nextElementSibling
    ) {
      headRow.insertBefore(
        th,
        memberHeader.nextElementSibling
      );
    } else {
      headRow.appendChild(
        th
      );
    }
  }

  const modalGrid =
    document.querySelector(
      ".member-detail-grid"
    );

  if (
    modalGrid &&
    !byId(
      "viewMemberNationalId"
    )
  ) {
    const detail =
      document.createElement(
        "div"
      );

    detail.className =
      "member-detail";

    detail.innerHTML = `
      <span class="member-detail-label">
        National ID
      </span>

      <span
        class="member-detail-value"
        id="viewMemberNationalId"
      >
        —
      </span>
    `;

    const first =
      modalGrid.firstElementChild;

    if (
      first?.nextElementSibling
    ) {
      modalGrid.insertBefore(
        detail,
        first.nextElementSibling
      );
    } else {
      modalGrid.appendChild(
        detail
      );
    }
  }
}


/* =========================================================
   CONTRIBUTION SETUP UI
========================================================= */

function ensureContributionUI() {
  const form = byId("addMemberForm");
  const grid = form?.querySelector(".member-form-grid");

  if (!form || !grid) {
    return;
  }

  let setup = byId("memberContributionSetup");

  if (!setup) {
    setup = document.createElement("section");
    setup.id = "memberContributionSetup";
    setup.className = "member-contribution-setup";

    setup.innerHTML = `
      <div class="member-form-section-heading">
        <strong>Contribution Setup</strong>
        <span>
          Set the member's monthly contribution plan and,
          for a new member only, optionally record previous
          paid months through the canonical onboarding process.
        </span>
      </div>

      <div class="member-form-grid">
        <div class="member-form-field">
          <label class="form-section-label" for="memberJoinDate">
            Join Date
          </label>
          <input
            id="memberJoinDate"
            name="memberJoinDate"
            type="date"
            required
          >
        </div>

        <div class="member-form-field">
          <label class="form-section-label" for="memberContributionAmount">
            Monthly Contribution
          </label>
          <input
            id="memberContributionAmount"
            name="memberContributionAmount"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            placeholder="e.g. 500"
            required
          >
        </div>

        <div class="member-form-field">
          <label class="form-section-label" for="memberFirstPeriodRule">
            First Contribution Period
          </label>
          <select
            id="memberFirstPeriodRule"
            name="memberFirstPeriodRule"
          >
            <option value="full_period">
              Full contribution period
            </option>
            <option value="next_full_period">
              Start from next full period
            </option>
          </select>
        </div>

        <div class="member-form-field">
          <label class="form-section-label" for="memberContributionEffectiveFrom">
            Contribution Effective From
          </label>
          <input
            id="memberContributionEffectiveFrom"
            name="memberContributionEffectiveFrom"
            type="date"
            required
          >
          <small class="muted member-form-hint">
            The date from which the contribution plan becomes effective.
          </small>
        </div>

        <div class="member-form-field" id="memberHistoricalSetupField">
          <label class="form-section-label" for="memberHistoricalEnabled">
            Historical Contributions
          </label>

          <select
            id="memberHistoricalEnabled"
            name="memberHistoricalEnabled"
          >
            <option value="false">
              No — start from the contribution plan
            </option>

            <option value="true">
              Yes — record previous paid months
            </option>
          </select>

          <small
            class="muted member-form-hint"
            id="memberHistoricalEditHint"
            hidden
          >
            Historical onboarding is available when creating
            a new member. Editing an existing member does not
            create historical accounting transactions.
          </small>
        </div>

        <div
          class="member-form-field"
          id="memberHistoricalPaidThroughField"
        >
          <label class="form-section-label" for="memberHistoricalPaidThrough">
            Paid Through
          </label>
          <input
            id="memberHistoricalPaidThrough"
            name="memberHistoricalPaidThrough"
            type="date"
          >
        </div>

        <div
          class="member-form-field"
          id="memberHistoricalPaymentMethodField"
        >
          <label class="form-section-label" for="memberHistoricalPaymentMethod">
            Historical Payment Method
          </label>
          <select
            id="memberHistoricalPaymentMethod"
            name="memberHistoricalPaymentMethod"
          >
            <option value="Cash">Cash</option>
            <option value="M-Pesa">M-Pesa</option>
            <option value="Bank transfer">Bank transfer</option>
          </select>
        </div>
      </div>

      <div
        class="member-contribution-preview"
        id="memberContributionPreview"
      >
        <span class="preview-label">
          Contribution Preview
        </span>

        <span id="memberContributionPreviewText">
          Set the member's monthly contribution amount.
        </span>
      </div>

      <div
        class="member-contribution-preview"
        id="memberHistoricalPreview"
        hidden
      >
        <span class="preview-label">
          Historical Preview
        </span>

        <span id="memberHistoricalPreviewText">
          Select the member's historical payment period.
        </span>
      </div>
    `;

    form.insertBefore(
      setup,
      form.querySelector(".member-form-actions") || null
    );
  }

  const amount =
    byId(
      "memberContributionAmount"
    );

  const firstPeriod =
    byId(
      "memberFirstPeriodRule"
    );

  const effectiveFrom =
    byId(
      "memberContributionEffectiveFrom"
    );

  if (amount) {
    amount.disabled = false;
  }

  if (firstPeriod) {
    firstPeriod.disabled = false;
  }

  if (effectiveFrom) {
    effectiveFrom.disabled = false;
  }

  updateContributionPreview();
  updateHistoricalControls();
}


/* =========================================================
   MONTHLY CONTRIBUTION TYPE
========================================================= */

async function loadMonthlyContributionType() {
  if (
    contributionTypesLoaded &&
    monthlyContributionType
  ) {
    return monthlyContributionType;
  }

  if (!groupId) {
    throw new Error(
      "Group information is required before loading contribution types."
    );
  }

  const {
    data,
    error
  } = await supabase
    .from(
      "contribution_types"
    )
    .select("*")
    .eq(
      "group_id",
      groupId
    );

  if (error) {
    throw error;
  }

  const rows =
    Array.isArray(data)
      ? data
      : [];

  monthlyContributionType =
    rows.find(
      row =>
        String(
          row.name ||
          row.type_name ||
          ""
        )
          .trim()
          .toLowerCase() ===
        "monthly"
    ) ||
    rows.find(
      row =>
        String(
          row.code ||
          ""
        )
          .trim()
          .toLowerCase() ===
        "monthly"
    ) ||
    rows[0] ||
    null;

  contributionTypesLoaded =
    true;

  if (
    !monthlyContributionType
  ) {
    throw new Error(
      "The group's Monthly contribution type could not be found."
    );
  }

  return monthlyContributionType;
}


/* =========================================================
   CONTRIBUTION PREVIEW
========================================================= */

function updateContributionPreview() {
  const amount =
    Number(
      byId(
        "memberContributionAmount"
      )?.value || 0
    );

  const preview =
    byId(
      "memberContributionPreview"
    );

  const previewText =
    byId(
      "memberContributionPreviewText"
    );

  if (!preview && !previewText) {
    return;
  }

  const message =
    amount <= 0
      ? "Set the member's monthly contribution amount."
      : `Monthly contribution: ${formatMoney(amount)}`;

  /*
    Do not overwrite the complete preview container because
    it contains the preview label.
  */
  if (previewText) {
    previewText.textContent =
      message;
  }
}


/* =========================================================
   HISTORICAL CONTROLS
   ---------------------------------------------------------
   Historical onboarding is valid only for NEW members.

   Existing-member edit mode:
     - disables the historical selector
     - hides historical date/payment controls
     - prevents the UI from implying that profile save
       creates accounting transactions
========================================================= */

function updateHistoricalControls() {
  const enabled =
    byId(
      "memberHistoricalEnabled"
    );

  const paidThrough =
    byId(
      "memberHistoricalPaidThrough"
    );

  const paymentMethod =
    byId(
      "memberHistoricalPaymentMethod"
    );

  const paidThroughField =
    byId(
      "memberHistoricalPaidThroughField"
    );

  const paymentMethodField =
    byId(
      "memberHistoricalPaymentMethodField"
    );

  const preview =
    byId(
      "memberHistoricalPreview"
    );

  const setupField =
    byId(
      "memberHistoricalSetupField"
    );

  const editHint =
    byId(
      "memberHistoricalEditHint"
    );

  const isEditing =
    Boolean(
      editingMemberId
    );

  /*
     Existing members cannot use the new-member historical
     onboarding selector.

     Do not silently reinterpret an edit as a historical
     accounting transaction.
  */
  if (isEditing) {
    if (enabled) {
      enabled.value =
        "false";

      enabled.disabled =
        true;
    }

    if (paidThrough) {
      paidThrough.value =
        "";

      paidThrough.disabled =
        true;
    }

    if (paymentMethod) {
      paymentMethod.disabled =
        true;
    }

    if (paidThroughField) {
      paidThroughField.hidden =
        true;
    }

    if (paymentMethodField) {
      paymentMethodField.hidden =
        true;
    }

    if (preview) {
      preview.hidden =
        true;
    }

    if (editHint) {
      editHint.hidden =
        false;
    }

    if (setupField) {
      setupField.classList.add(
        "historical-edit-disabled"
      );
    }

    return;
  }

  /*
     New-member mode.
  */
  if (enabled) {
    enabled.disabled =
      false;
  }

  const isEnabled =
    enabled?.value ===
    "true";

  if (paidThrough) {
    paidThrough.disabled =
      !isEnabled;
  }

  if (paymentMethod) {
    paymentMethod.disabled =
      !isEnabled;
  }

  if (paidThroughField) {
    paidThroughField.hidden =
      !isEnabled;
  }

  if (paymentMethodField) {
    paymentMethodField.hidden =
      !isEnabled;
  }

  if (preview) {
    preview.hidden =
      !isEnabled;
  }

  if (editHint) {
    editHint.hidden =
      true;
  }

  if (setupField) {
    setupField.classList.remove(
      "historical-edit-disabled"
    );
  }

  updateHistoricalPreview();
}


/* =========================================================
   HISTORICAL PREVIEW
========================================================= */

function updateHistoricalPreview() {
  const preview =
    byId(
      "memberHistoricalPreview"
    );

  if (!preview) {
    return;
  }

  /*
     Never render a historical onboarding preview while
     editing an existing member.
  */
  if (editingMemberId) {
    preview.hidden =
      true;

    return;
  }

  const enabled =
    byId(
      "memberHistoricalEnabled"
    )?.value ===
    "true";

  const text =
    byId(
      "memberHistoricalPreviewText"
    );

  if (!enabled) {
    preview.hidden =
      true;

    if (text) {
      text.textContent =
        "Select the member's historical payment period.";
    }

    return;
  }

  const joinDate =
    byId(
      "memberJoinDate"
    )?.value ||
    "";

  const paidThrough =
    byId(
      "memberHistoricalPaidThrough"
    )?.value ||
    "";

  if (
    !joinDate ||
    !paidThrough
  ) {
    preview.hidden =
      false;

    const message =
      "Select the member's historical payment period.";

    if (text) {
      text.textContent =
        message;
    }

    return;
  }

  const start =
    new Date(
      `${joinDate}T00:00:00`
    );

  const end =
    new Date(
      `${paidThrough}T00:00:00`
    );

  if (
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    ) ||
    end < start
  ) {
    preview.hidden =
      false;

    const message =
      "Check the historical payment dates.";

    if (text) {
      text.textContent =
        message;
    }

    return;
  }

  let months =
    (end.getFullYear() -
      start.getFullYear()) *
      12 +
    (
      end.getMonth() -
      start.getMonth()
    ) +
    1;

  if (
    months < 1
  ) {
    months = 1;
  }

  const amount =
    Number(
      byId(
        "memberContributionAmount"
      )?.value || 0
    );

  const total =
    months *
    amount;

  preview.hidden =
    false;

  const message =
    amount > 0
      ? `${months} historical month${months === 1 ? "" : "s"} · ${formatMoney(total)}`
      : `${months} historical month${months === 1 ? "" : "s"}`;

  if (text) {
    text.textContent =
      message;
  }
}


/* =========================================================
   CONTRIBUTION STATUS HELPERS
========================================================= */

function contributionStatusLabel(
  status
) {
  const value =
    String(
      status || ""
    ).toLowerCase();

  if (
    value === "up_to_date" ||
    value === "paid"
  ) {
    return "UP TO DATE";
  }

  if (
    value === "credit"
  ) {
    return "CREDIT";
  }

  if (
    value === "arrears" ||
    value === "outstanding" ||
    value === "partial"
  ) {
    return "ARREARS";
  }

  if (
    value ===
    "plan_not_set"
  ) {
    return "PLAN NOT SET";
  }

  return value
    .replace(
      /_/g,
      " "
    )
    .toUpperCase();
}

function formatMoney(value) {
  const amount =
    Number(
      value || 0
    );

  return `KSh ${amount.toLocaleString(
    "en-KE",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  )}`;
}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {
  if (!groupId) {
    throw new Error(
      "Group information is required."
    );
  }

  const {
    data,
    error
  } = await supabase
    .from(
      "members"
    )
    .select("*")
    .eq(
      "group_id",
      groupId
    )
    .order(
      "member_number",
      {
        ascending: true
      }
    );

  if (error) {
    throw error;
  }

  members =
    Array.isArray(data)
      ? data
      : [];

  return members;
}


/* =========================================================
   CONTRIBUTION RESULT MESSAGE
========================================================= */

function contributionResultMessage(
  result
) {
  if (!result) {
    return "";
  }

  const status =
    contributionStatusLabel(
      result.status
    );

  const arrears =
    formatMoney(
      result.arrears ??
      result.outstanding ??
      0
    );

  const credit =
    formatMoney(
      result.credit
    );

  const due =
    formatMoney(
      result.total_due ??
      result.due
    );

  const allocated =
    formatMoney(
      result.total_allocated ??
      result.allocated
    );

  const historicalCount =
    Number(
      result.historical_payment_count ||
      result.historical_count ||
      0
    );

  const details = [
    `Status: ${status}`,
    `Total due: ${due}`,
    `Allocated: ${allocated}`,
    `Arrears: ${arrears}`,
    `Credit: ${credit}`
  ];

  if (
    historicalCount > 0
  ) {
    details.push(
      `Historical payments: ${historicalCount}`
    );
  }

  return details.join(
    " · "
  );
}


/* =========================================================
   MEMBER ROW
========================================================= */

function createMemberRow(
  member
) {
  const id =
    escapeHtml(
      member.id
    );

  const memberNumber =
    escapeHtml(
      member.member_number ||
      "—"
    );

  const membershipNumber =
    escapeHtml(
      member.membership_number ||
      member.member_number ||
      "—"
    );

  const nationalId =
    escapeHtml(
      member.national_id ||
      "—"
    );

  const name =
    escapeHtml(
      member.name ||
      "—"
    );

  const phone =
    escapeHtml(
      member.phone ||
      "—"
    );

  const email =
    escapeHtml(
      member.email ||
      "—"
    );

  const loginStatus =
    getLoginStatus(
      member
    );

  const hasEmail =
    Boolean(
      String(
        member.email ||
        ""
      ).trim()
    );

  let invitationButton = `
    <button
      type="button"
      class="member-action invitation-disabled"
      disabled
      title="Add an email address first"
    >
      <span>✉</span>
      No Email
    </button>
  `;

  if (
    hasEmail &&
    loginStatus ===
      "Active"
  ) {
    invitationButton = `
      <button
        type="button"
        class="member-action invitation-disabled"
        disabled
      >
        <span>✓</span>
        Active
      </button>
    `;
  } else if (
    hasEmail &&
    loginStatus ===
      "Invitation Sent"
  ) {
    invitationButton = `
      <button
        type="button"
        class="member-action invitation-action"
        data-action="invite"
        data-member-id="${id}"
      >
        <span>↻</span>
        Resend
      </button>
    `;
  } else if (
    hasEmail
  ) {
    invitationButton = `
      <button
        type="button"
        class="member-action invitation-primary"
        data-action="invite"
        data-member-id="${id}"
      >
        <span>✉</span>
        Invite
      </button>
    `;
  }

  return `
    <tr data-member-id="${id}">

      <td>
        <span class="member-number">
          ${memberNumber}
        </span>
      </td>

      <td>
        <span class="member-contact">
          ${nationalId}
        </span>
      </td>

      <td>
        <span class="membership-number">
          ${membershipNumber}
        </span>
      </td>

      <td>
        <div class="member-table-profile">

          <div class="member-avatar">
            ${escapeHtml(
              getInitials(
                member.name
              )
            )}
          </div>

          <div class="member-table-name">

            <strong>
              ${name}
            </strong>

            <span>
              Joined
              ${escapeHtml(
                formatDate(
                  member.join_date
                )
              )}
            </span>

          </div>

        </div>
      </td>

      <td>
        <span class="member-contact">
          ${phone}
        </span>
      </td>

      <td>
        <span
          class="member-contact email-contact"
        >
          ${email}
        </span>
      </td>

      <td>
        ${roleBadgeHtml(
          member.role
        )}
      </td>

      <td>
        ${accountStatusHtml(
          member.status
        )}
      </td>

      <td>
        ${contributionStatusHtml(
          member
        )}
      </td>

      <td>
        ${loginStatusHtml(
          member
        )}
      </td>

      <td>

        <div class="member-actions">

          <button
            type="button"
            class="member-action view-action"
            data-action="view"
            data-member-id="${id}"
          >
            <span>◉</span>
            View
          </button>

          <button
            type="button"
            class="member-action edit-action"
            data-action="edit"
            data-member-id="${id}"
          >
            <span>✎</span>
            Edit
          </button>

          ${invitationButton}

        </div>

      </td>

    </tr>
  `;
}


/* =========================================================
   MEMBER CARD
========================================================= */

function createMemberCard(
  member
) {
  const id =
    escapeHtml(
      member.id
    );

  const name =
    escapeHtml(
      member.name ||
      "—"
    );

  const memberNumber =
    escapeHtml(
      member.member_number ||
      "—"
    );

  const membershipNumber =
    escapeHtml(
      member.membership_number ||
      member.member_number ||
      "—"
    );

  const nationalId =
    escapeHtml(
      member.national_id ||
      "—"
    );

  const phone =
    escapeHtml(
      member.phone ||
      "—"
    );

  const email =
    escapeHtml(
      member.email ||
      "—"
    );

  const loginStatus =
    getLoginStatus(
      member
    );

  const hasEmail =
    Boolean(
      String(
        member.email ||
        ""
      ).trim()
    );

  let invitationButton = `
    <button
      type="button"
      class="member-action invitation-disabled"
      disabled
      title="Add an email address first"
    >
      <span>✉</span>
      No Email
    </button>
  `;

  if (
    hasEmail &&
    loginStatus ===
      "Active"
  ) {
    invitationButton = `
      <button
        type="button"
        class="member-action invitation-disabled"
        disabled
      >
        <span>✓</span>
        Active
      </button>
    `;
  } else if (
    hasEmail &&
    loginStatus ===
      "Invitation Sent"
  ) {
    invitationButton = `
      <button
        type="button"
        class="member-action invitation-action"
        data-action="invite"
        data-member-id="${id}"
      >
        <span>↻</span>
        Resend
      </button>
    `;
  } else if (
    hasEmail
  ) {
    invitationButton = `
      <button
        type="button"
        class="member-action invitation-primary"
        data-action="invite"
        data-member-id="${id}"
      >
        <span>✉</span>
        Invite
      </button>
    `;
  }

  return `
    <article
      class="member-card"
      data-member-id="${id}"
    >

      <div class="member-card-top">

        <div class="member-card-profile">

          <div class="member-avatar">
            ${escapeHtml(
              getInitials(
                member.name
              )
            )}
          </div>

          <div>
            <strong>
              ${name}
            </strong>

            <span>
              Member No.
              ${memberNumber}
            </span>
          </div>

        </div>

        <div class="member-card-status">
          ${accountStatusHtml(
            member.status
          )}
        </div>
      </div>
/* =========================================================
   CHAMA LIVE — MEMBERS
   PART 2 OF 2 — UPDATED
   ---------------------------------------------------------
   Edit / Create / Historical Accounting / Modal / Events
   ---------------------------------------------------------
   IMPORTANT:
   - Existing-member edits update member profile fields only.
   - Historical contribution onboarding is creation-only.
   - Existing-member reconciliation only allocates existing
     payments against existing obligations.
   - This file does NOT invent or call a historical-backfill
     RPC that does not exist.
   ========================================================= */


/* =========================================================
   EDIT MEMBER
   ========================================================= */

function openEditMemberPanel(memberId) {
  const member = members.find((item) => item.id === memberId);

  if (!member) {
    showError("Member could not be found.");
    return;
  }

  editingMemberId = member.id;

  const memberNumber = byId("memberNumber");
  const nationalId = byId("memberNationalId");
  const name = byId("memberName");
  const phone = byId("memberPhone");
  const email = byId("memberEmail");
  const role = byId("memberRole");
  const status = byId("memberStatus");
  const joinDate = byId("memberJoinDate");

  if (memberNumber) {
    memberNumber.value = member.member_number || "";
  }

  if (nationalId) {
    nationalId.value = member.national_id || "";
  }

  if (name) {
    name.value = member.name || "";
  }

  if (phone) {
    phone.value = member.phone || "";
  }

  if (email) {
    email.value = member.email || "";
  }

  if (role) {
    role.value = member.role || "member";
  }

  if (status) {
    status.value = member.status || "active";
  }

  if (joinDate) {
    joinDate.value = member.join_date || "";
  }


  /* ---------------------------------------------------------
     Existing-member accounting controls

     The current updateExistingMember() operation only updates
     profile fields. It does NOT update contribution rules,
     obligations, payments, or allocations.

     Therefore these controls must not remain apparently
     editable in a way that suggests they will be persisted.
     --------------------------------------------------------- */

  const accountingControls = [
    "memberContributionAmount",
    "memberFirstPeriodRule",
    "memberContributionEffectiveFrom",
    "memberHistoricalEnabled",
    "memberHistoricalPaidThrough",
    "memberHistoricalPaymentMethod"
  ];

  accountingControls.forEach((id) => {
    const element = byId(id);

    if (!element) {
      return;
    }

    element.disabled = true;
  });


  /* ---------------------------------------------------------
     Clear historical onboarding state for edit mode.

     Historical onboarding is a member-creation operation.
     We deliberately do not preload or fabricate historical
     accounting values here.
     --------------------------------------------------------- */

  const historicalEnabled = byId("memberHistoricalEnabled");
  const historicalPaidThrough = byId("memberHistoricalPaidThrough");
  const historicalPaymentMethod = byId("memberHistoricalPaymentMethod");

  if (historicalEnabled) {
    historicalEnabled.value = "false";
  }

  if (historicalPaidThrough) {
    historicalPaidThrough.value = "";
  }

  if (historicalPaymentMethod) {
    historicalPaymentMethod.value = "Cash";
  }

  updateHistoricalControls();


  /* ---------------------------------------------------------
     Edit-mode description
     --------------------------------------------------------- */

  const description = byId("memberFormDescription");

  if (description) {
    description.textContent =
      "Update the member's profile information. Contribution plan and historical accounting setup are available when creating a new member.";
  }


  /* ---------------------------------------------------------
     Optional form title
     --------------------------------------------------------- */

  const title = byId("memberFormTitle");

  if (title) {
    title.textContent = "Edit Member";
  }


  /* ---------------------------------------------------------
     Open the panel/modal
     --------------------------------------------------------- */

  const panel = byId("memberFormPanel");

  if (panel) {
    panel.classList.remove("hidden");
    panel.removeAttribute("hidden");
  }

  const modal = byId("memberFormModal");

  if (modal) {
    modal.classList.remove("hidden");
    modal.removeAttribute("hidden");
  }
}


/* =========================================================
   FORM VALUES
   ========================================================= */

function getFormValues() {
  return {
    memberNumber:
      byId("memberNumber")?.value?.trim() || "",

    nationalId:
      byId("memberNationalId")?.value?.trim() || "",

    name:
      byId("memberName")?.value?.trim() || "",

    phone:
      byId("memberPhone")?.value?.trim() || "",

    email:
      byId("memberEmail")?.value?.trim() || "",

    role:
      byId("memberRole")?.value || "member",

    status:
      byId("memberStatus")?.value || "active",

    joinDate:
      byId("memberJoinDate")?.value || "",

    contributionAmount:
      parseMoney(
        byId("memberContributionAmount")?.value
      ),

    firstPeriodRule:
      byId("memberFirstPeriodRule")?.value ||
      "full_period",

    effectiveFrom:
      byId("memberContributionEffectiveFrom")?.value ||
      "",

    historicalEnabled:
      byId("memberHistoricalEnabled")?.value === "true",

    historicalPaidThrough:
      byId("memberHistoricalPaidThrough")?.value ||
      "",

    historicalPaymentMethod:
      byId("memberHistoricalPaymentMethod")?.value ||
      "Cash"
  };
}


/* =========================================================
   FIRST HISTORICAL MONTH
   ========================================================= */

function resolveFirstHistoricalMonth(values) {
  let sourceDate =
    values.effectiveFrom ||
    values.joinDate;

  if (!sourceDate) {
    return null;
  }

  const date = new Date(`${sourceDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  /*
   * "Start from next full period" means the month following
   * the effective/join month.
   */
  if (values.firstPeriodRule === "next_full_period") {
    date.setMonth(date.getMonth() + 1);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}-01`;
}


/* =========================================================
   FORM VALIDATION
   ========================================================= */

function validateForm(values) {
  const errors = [];

  if (!values.memberNumber) {
    errors.push("Member number is required.");
  }

  if (!values.name) {
    errors.push("Member name is required.");
  }

  if (!values.nationalId) {
    errors.push("National ID is required.");
  }

  if (!values.joinDate) {
    errors.push("Join date is required.");
  }

  if (
    values.contributionAmount === null ||
    values.contributionAmount === undefined ||
    Number.isNaN(values.contributionAmount)
  ) {
    errors.push("Monthly contribution amount is required.");
  } else if (values.contributionAmount < 0) {
    errors.push("Monthly contribution cannot be negative.");
  }


  /* ---------------------------------------------------------
     New members require the monthly contribution type.
     Existing members do not use the creation RPC.
     --------------------------------------------------------- */

  if (!editingMemberId && !monthlyContributionType) {
    errors.push(
      "The group's Monthly contribution type could not be found."
    );
  }


  /* ---------------------------------------------------------
     IMPORTANT EXISTING-MEMBER GUARD

     The current backend does not provide an existing-member
     historical-backfill RPC.

     Never silently accept historical settings and then save
     only the profile.
     --------------------------------------------------------- */

  if (editingMemberId && values.historicalEnabled) {
    errors.push(
      "Historical contribution setup is only available when creating a new member. Editing an existing member does not create historical accounting entries."
    );
  }


  /* ---------------------------------------------------------
     Historical onboarding validation applies only to NEW
     members.
     --------------------------------------------------------- */

  if (!editingMemberId && values.historicalEnabled) {
    if (!values.historicalPaidThrough) {
      errors.push(
        "Paid-through date is required for historical contributions."
      );
    }

    if (
      values.historicalPaidThrough &&
      values.joinDate &&
      values.historicalPaidThrough < values.joinDate
    ) {
      errors.push(
        "Historical paid-through date cannot be before the member's join date."
      );
    }

    if (
      values.historicalPaidThrough &&
      values.effectiveFrom &&
      values.historicalPaidThrough < values.effectiveFrom
    ) {
      errors.push(
        "Historical paid-through date cannot be before the contribution effective date."
      );
    }
  }


  if (errors.length) {
    throw new Error(errors.join("\n"));
  }

  return true;
}


/* =========================================================
   UPDATE EXISTING MEMBER
   ========================================================= */

async function updateExistingMember(values) {
  if (!editingMemberId) {
    throw new Error(
      "No existing member is selected for update."
    );
  }

  /*
   * IMPORTANT:
   *
   * This operation is intentionally profile-only.
   *
   * Do NOT add contribution payments, obligations,
   * allocations, or historical accounting here unless a
   * dedicated canonical backend RPC has first been created
   * and audited.
   */

  const { error } = await supabase
    .from("members")
    .update({
      member_number: values.memberNumber,
      national_id: values.nationalId,
      name: values.name,
      phone: values.phone,
      email: values.email,
      role: values.role,
      status: values.status,
      join_date: values.joinDate
    })
    .eq("id", editingMemberId);

  if (error) {
    throw error;
  }

  return true;
}


/* =========================================================
   CREATE MEMBER WITH CONTRIBUTION PLAN
   ========================================================= */

async function createMemberWithPlan(values) {
  if (!currentGroupId) {
    throw new Error(
      "No group is selected."
    );
  }

  if (!monthlyContributionType?.id) {
    throw new Error(
      "The group's Monthly contribution type could not be found."
    );
  }

  const requestId = crypto.randomUUID();

  const payload = {
    request_id: requestId,
    group_id: currentGroupId,
    member_number: values.memberNumber,
    national_id: values.nationalId,
    name: values.name,
    phone: values.phone || null,
    email: values.email || null,
    role: values.role,
    status: values.status,
    join_date: values.joinDate,
    contribution_type_id: monthlyContributionType.id,
    contribution_amount: values.contributionAmount,
    first_period_rule: values.firstPeriodRule,
    effective_from:
      values.effectiveFrom ||
      values.joinDate
  };

  const { data, error } = await supabase.rpc(
    "create_member_with_contribution_plan",
    {
      p_request_id: requestId,
      p_group_id: payload.group_id,
      p_member_number: payload.member_number,
      p_national_id: payload.national_id,
      p_name: payload.name,
      p_phone: payload.phone,
      p_email: payload.email,
      p_role: payload.role,
      p_status: payload.status,
      p_join_date: payload.join_date,
      p_contribution_type_id:
        payload.contribution_type_id,
      p_contribution_amount:
        payload.contribution_amount,
      p_first_period_rule:
        payload.first_period_rule,
      p_effective_from:
        payload.effective_from
    }
  );

  if (error) {
    throw error;
  }

  return data;
}


/* =========================================================
   CREATE MEMBER WITH HISTORICAL CONTRIBUTIONS
   ========================================================= */

async function createMemberWithHistoricalContributions(values) {
  if (!currentGroupId) {
    throw new Error(
      "No group is selected."
    );
  }

  if (!monthlyContributionType?.id) {
    throw new Error(
      "The group's Monthly contribution type could not be found."
    );
  }

  const firstHistoricalMonth =
    resolveFirstHistoricalMonth(values);

  if (!firstHistoricalMonth) {
    throw new Error(
      "Unable to determine the first historical contribution month."
    );
  }

  if (!values.historicalPaidThrough) {
    throw new Error(
      "Historical paid-through date is required."
    );
  }

  const requestId = crypto.randomUUID();

  const memberPayload = {
    member_number: values.memberNumber,
    national_id: values.nationalId,
    name: values.name,
    phone: values.phone || null,
    email: values.email || null,
    role: values.role,
    status: values.status,
    join_date: values.joinDate
  };

  const contributionPayload = {
    contribution_type_id:
      monthlyContributionType.id,
    contribution_amount:
      values.contributionAmount,
    first_period_rule:
      values.firstPeriodRule,
    effective_from:
      values.effectiveFrom ||
      values.joinDate
  };

  const historicalPayload = {
    first_historical_month:
      firstHistoricalMonth,
    historical_paid_through:
      values.historicalPaidThrough,
    payment_method:
      values.historicalPaymentMethod || "Cash"
  };

  const { data, error } = await supabase.rpc(
    "create_member_with_historical_contributions",
    {
      p_request_id: requestId,
      p_group_id: currentGroupId,
      p_member: memberPayload,
      p_contribution: contributionPayload,
      p_historical: historicalPayload
    }
  );

  if (error) {
    throw error;
  }

  return data;
}


/* =========================================================
   SAVE MEMBER
   ========================================================= */

async function saveMember(event) {
  if (event) {
    event.preventDefault();
  }

  try {
    const values = getFormValues();

    validateForm(values);


    /* -------------------------------------------------------
       Duplicate member-number protection
       ------------------------------------------------------- */

    const duplicate = members.find((member) => {
      if (
        editingMemberId &&
        member.id === editingMemberId
      ) {
        return false;
      }

      return (
        String(member.member_number || "")
          .trim()
          .toLowerCase() ===
        values.memberNumber
          .trim()
          .toLowerCase()
      );
    });

    if (duplicate) {
      throw new Error(
        `Member number ${values.memberNumber} is already in use.`
      );
    }


    /* -------------------------------------------------------
       EXISTING MEMBER
       -------------------------------------------------------

       Existing-member edits are profile-only.

       Historical contribution fields are explicitly blocked
       rather than silently ignored.
       ------------------------------------------------------- */

    if (editingMemberId) {
      if (values.historicalEnabled) {
        throw new Error(
          "Historical contribution setup is only available when creating a new member."
        );
      }

      await updateExistingMember(values);

      showSuccess(
        "Member profile updated successfully."
      );

      closeMemberForm();
      await loadMembers();

      return;
    }


    /* -------------------------------------------------------
       NEW MEMBER
       ------------------------------------------------------- */

    let result;

    if (values.historicalEnabled) {
      result =
        await createMemberWithHistoricalContributions(
          values
        );
    } else {
      result =
        await createMemberWithPlan(values);
    }

    /*
     * Preserve the returned canonical accounting state.
     * The backend is the source of truth.
     */
    lastMemberOperationResult = result;

    showSuccess(
      values.historicalEnabled
        ? "Member created and historical contributions recorded."
        : "Member created successfully."
    );

    closeMemberForm();
    await loadMembers();

  } catch (error) {
    console.error(
      "saveMember failed:",
      error
    );

    showError(
      error?.message ||
      "Unable to save member."
    );
  }
}


/* =========================================================
   RECONCILE EXISTING HISTORICAL PAYMENTS
   ========================================================= */

async function reconcileHistoricalPayments(memberId) {
  if (!memberId) {
    throw new Error(
      "Member ID is required."
    );
  }

  try {
    const requestId = crypto.randomUUID();

    const { data, error } = await supabase.rpc(
      "reconcile_member_historical_payments",
      {
        p_member_id: memberId,
        p_cutoff_date: null,
        p_request_id: requestId
      }
    );

    if (error) {
      throw error;
    }

    /*
     * IMPORTANT:
     *
     * This reconciliation operation works with accounting
     * records that already exist. It does NOT manufacture
     * missing historical obligations or historical payments.
     */

    lastMemberOperationResult = data;

    showSuccess(
      "Existing historical payments were reconciled against existing obligations."
    );

    await loadMembers();

    return data;

  } catch (error) {
    console.error(
      "reconcileHistoricalPayments failed:",
      error
    );

    showError(
      error?.message ||
      "Unable to reconcile historical payments."
    );

    throw error;
  }
}


/* =========================================================
   OPEN MEMBER MODAL
   ========================================================= */

async function openMemberModal(memberId) {
  const member = members.find(
    (item) => item.id === memberId
  );

  if (!member) {
    showError("Member could not be found.");
    return;
  }

  activeMemberId = member.id;

  const modal = byId("memberProfileModal");

  if (!modal) {
    return;
  }

  const position = await loadMemberAccountingPosition(
    member.id
  );

  renderMemberProfile(member, position);

  modal.classList.remove("hidden");
  modal.removeAttribute("hidden");
}


/* =========================================================
   CLOSE MEMBER MODAL
   ========================================================= */

function closeMemberModal() {
  const modal = byId("memberProfileModal");

  if (!modal) {
    return;
  }

  modal.classList.add("hidden");
  modal.setAttribute("hidden", "");

  activeMemberId = null;
}


/* =========================================================
   MEMBER ACCOUNTING POSITION
   ========================================================= */

async function loadMemberAccountingPosition(memberId) {
  if (!memberId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("member_accounting_position")
      .select("*")
      .eq("member_id", memberId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;

  } catch (error) {
    console.error(
      "Unable to load member accounting position:",
      error
    );

    /*
     * Do not manufacture accounting values in the UI.
     */
    return null;
  }
}


/* =========================================================
   RENDER MEMBER PROFILE
   ========================================================= */

function renderMemberProfile(member, position) {
  setText(
    "profileMemberNumber",
    member.member_number || "—"
  );

  setText(
    "profileMembership",
    member.member_number || "—"
  );

  setText(
    "profileNationalId",
    member.national_id || "—"
  );

  setText(
    "profilePhone",
    member.phone || "—"
  );

  setText(
    "profileEmail",
    member.email || "—"
  );

  setText(
    "profileRole",
    member.role || "—"
  );

  setText(
    "profileStatus",
    member.status || "—"
  );

  setText(
    "profileLoginStatus",
    member.login_active
      ? "Login Active"
      : "No Login"
  );

  setText(
    "profileJoinDate",
    formatDate(member.join_date)
  );

  setText(
    "profileGroup",
    currentGroupName || "—"
  );


  /* ---------------------------------------------------------
     Canonical accounting position
     --------------------------------------------------------- */

  const totalContributed =
    Number(
      position?.total_contributed ?? 0
    );

  const totalDue =
    Number(
      position?.total_due ?? 0
    );

  const allocated =
    Number(
      position?.allocated ?? 0
    );

  const arrears =
    Number(
      position?.arrears ?? 0
    );

  const credit =
    Number(
      position?.credit ?? 0
    );

  setText(
    "profileTotalContributed",
    formatCurrency(totalContributed)
  );

  setText(
    "profileTotalDue",
    formatCurrency(totalDue)
  );

  setText(
    "profileAllocated",
    formatCurrency(allocated)
  );

  setText(
    "profileArrears",
    formatCurrency(arrears)
  );

  setText(
    "profileCredit",
    formatCurrency(credit)
  );


  /* ---------------------------------------------------------
     Position status
     --------------------------------------------------------- */

  const statusElement =
    byId("profileContributionStatus");

  if (statusElement) {
    let statusText = "UP TO DATE";

    if (arrears > 0) {
      statusText = "ARREARS";
    } else if (credit > 0) {
      statusText = "CREDIT";
    }

    statusElement.textContent = statusText;

    statusElement.classList.remove(
      "credit",
      "arrears",
      "up-to-date"
    );

    if (credit > 0) {
      statusElement.classList.add("credit");
    } else if (arrears > 0) {
      statusElement.classList.add("arrears");
    } else {
      statusElement.classList.add("up-to-date");
    }
  }


  /* ---------------------------------------------------------
     Historical reconciliation action
     --------------------------------------------------------- */

  const reconcileButton =
    byId("reconcileHistoricalButton");

  if (reconcileButton) {
    reconcileButton.onclick = async () => {
      reconcileButton.disabled = true;

      try {
        await reconcileHistoricalPayments(
          member.id
        );

        /*
         * Reload the profile so the displayed position comes
         * from the canonical accounting state after the
         * reconciliation.
         */
        const refreshedPosition =
          await loadMemberAccountingPosition(
            member.id
          );

        renderMemberProfile(
          member,
          refreshedPosition
        );

      } finally {
        reconcileButton.disabled = false;
      }
    };
  }
}


/* =========================================================
   CLOSE MEMBER FORM
   ========================================================= */

function closeMemberForm() {
  const panel = byId("memberFormPanel");

  if (panel) {
    panel.classList.add("hidden");
    panel.setAttribute("hidden", "");
  }

  const modal = byId("memberFormModal");

  if (modal) {
    modal.classList.add("hidden");
    modal.setAttribute("hidden", "");
  }

  resetMemberForm();

  editingMemberId = null;
}


/* =========================================================
   RESET MEMBER FORM
   ========================================================= */

function resetMemberForm() {
  const form = byId("memberForm");

  if (form) {
    form.reset();
  }


  /* ---------------------------------------------------------
     Restore creation-mode defaults
     --------------------------------------------------------- */

  const role = byId("memberRole");

  if (role) {
    role.value = "member";
  }

  const status = byId("memberStatus");

  if (status) {
    status.value = "active";
  }

  const firstPeriodRule =
    byId("memberFirstPeriodRule");

  if (firstPeriodRule) {
    firstPeriodRule.value = "full_period";
  }

  const historicalEnabled =
    byId("memberHistoricalEnabled");

  if (historicalEnabled) {
    historicalEnabled.disabled = false;
    historicalEnabled.value = "false";
  }

  const historicalPaidThrough =
    byId("memberHistoricalPaidThrough");

  if (historicalPaidThrough) {
    historicalPaidThrough.disabled = false;
    historicalPaidThrough.value = "";
  }

  const historicalPaymentMethod =
    byId("memberHistoricalPaymentMethod");

  if (historicalPaymentMethod) {
    historicalPaymentMethod.disabled = false;
    historicalPaymentMethod.value = "Cash";
  }


  /* ---------------------------------------------------------
     Re-enable creation accounting controls
     --------------------------------------------------------- */

  [
    "memberContributionAmount",
    "memberFirstPeriodRule",
    "memberContributionEffectiveFrom"
  ].forEach((id) => {
    const element = byId(id);

    if (element) {
      element.disabled = false;
    }
  });


  updateHistoricalControls();


  const description =
    byId("memberFormDescription");

  if (description) {
    description.textContent =
      "Create a new member and configure their contribution plan.";
  }


  const title =
    byId("memberFormTitle");

  if (title) {
    title.textContent = "Add Member";
  }
}


/* =========================================================
   EVENT BINDING
   ========================================================= */

function bindMemberEvents() {
  const form = byId("memberForm");

  if (form) {
    form.addEventListener(
      "submit",
      saveMember
    );
  }


  const historicalEnabled =
    byId("memberHistoricalEnabled");

  if (historicalEnabled) {
    historicalEnabled.addEventListener(
      "change",
      updateHistoricalControls
    );
  }


  const addButton =
    byId("addMemberButton");

  if (addButton) {
    addButton.addEventListener(
      "click",
      () => {
        editingMemberId = null;

        resetMemberForm();

        const panel =
          byId("memberFormPanel");

        if (panel) {
          panel.classList.remove("hidden");
          panel.removeAttribute("hidden");
        }

        const modal =
          byId("memberFormModal");

        if (modal) {
          modal.classList.remove("hidden");
          modal.removeAttribute("hidden");
        }
      }
    );
  }


  const closeFormButton =
    byId("closeMemberForm");

  if (closeFormButton) {
    closeFormButton.addEventListener(
      "click",
      closeMemberForm
    );
  }


  const cancelButton =
    byId("cancelMemberForm");

  if (cancelButton) {
    cancelButton.addEventListener(
      "click",
      closeMemberForm
    );
  }


  const closeProfileButton =
    byId("closeMemberProfile");

  if (closeProfileButton) {
    closeProfileButton.addEventListener(
      "click",
      closeMemberModal
    );
  }
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function init() {
  try {
    bindMemberEvents();

    resetMemberForm();

    await loadMonthlyContributionType();

    await loadMembers();

  } catch (error) {
    console.error(
      "Members initialization failed:",
      error
    );

    showError(
      error?.message ||
      "Unable to initialize Members."
    );
  }
}


/* =========================================================
   EXPORTS
   ========================================================= */

export {
  init,
  refreshMembers,
  loadMembers,
  openMemberModal,
  closeMemberModal
};


/* =========================================================
   DIRECT-PAGE COMPATIBILITY / LAYOUT BOOT GUARD
   =========================================================

   Admin layout is the preferred boot owner.

   When members.js is dynamically loaded by the layout,
   __CHAMA_LIVE_LAYOUT_LOADING__ prevents this module from
   independently initializing itself.

   This avoids two initialization paths, duplicate event
   handlers,
   duplicate queries, and duplicate rendering.
   ========================================================= */

if (!window.__CHAMA_LIVE_LAYOUT_LOADING__) {
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        init();
      },
      { once: true }
    );
  } else {
    init();
  }
}





      
