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
          where applicable, record previous paid months.
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

        <div class="member-form-field">
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

  const amount = byId("memberContributionAmount");
  const firstPeriod = byId("memberFirstPeriodRule");
  const effectiveFrom = byId("memberContributionEffectiveFrom");

  if (amount) amount.disabled = false;
  if (firstPeriod) firstPeriod.disabled = false;
  if (effectiveFrom) effectiveFrom.disabled = false;

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

  if (preview) {
    /*
      Do not overwrite the complete preview container because
      it contains the preview label.
    */
    if (previewText) {
      previewText.textContent =
        message;
    }
  }

  if (previewText) {
    previewText.textContent =
      message;
  }
}


/* =========================================================
   HISTORICAL CONTROLS
========================================================= */

function updateHistoricalControls() {
  const enabled =
    byId(
      "memberHistoricalEnabled"
    );

  const isEnabled =
    enabled?.value ===
    "true";

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

      <div class="member-card-details">

        <div class="member-card-detail">
          <span class="member-card-label">
            National ID
          </span>

          <span>
            ${nationalId}
          </span>
        </div>

        <div class="member-card-detail">
          <span class="member-card-label">
            Membership No.
          </span>

          <span>
            ${membershipNumber}
          </span>
        </div>

        <div class="member-card-detail">
          <span class="member-card-label">
            Phone
          </span>

          <span>
            ${phone}
          </span>
        </div>

        <div class="member-card-detail">
          <span class="member-card-label">
            Email
          </span>

          <span>
            ${email}
          </span>
        </div>

        <div class="member-card-detail">
          <span class="member-card-label">
            Role
          </span>

          <span>
            ${roleBadgeHtml(
              member.role
            )}
          </span>
        </div>

        <div class="member-card-detail">
          <span class="member-card-label">
            Login
          </span>

          <span>
            ${loginStatusHtml(
              member
            )}
          </span>
        </div>

      </div>

      <div class="member-card-contribution-status">
        ${contributionStatusHtml(
          member
        )}
      </div>

      <div class="member-card-actions">

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

    </article>
  `;
}


/* =========================================================
   MEMBER FILTERING
========================================================= */

function getSearchTerm() {
  return String(
    byId(
      "memberSearch"
    )?.value || ""
  )
    .trim()
    .toLowerCase();
}

function filterMembers() {
  const term =
    getSearchTerm();

  if (!term) {
    return [...members];
  }

  return members.filter(
    member => {
      const haystack = [
        member.member_number,
        member.membership_number,
        member.national_id,
        member.name,
        member.phone,
        member.email,
        member.role,
        member.status,
        member.onboarding_status
      ]
        .map(
          value =>
            String(
              value || ""
            ).toLowerCase()
        )
        .join(" ");

      return haystack.includes(
        term
      );
    }
  );
}

function renderMembers() {
  const filtered =
    filterMembers();

  const rows =
    byId(
      "memberRows"
    );

  const cards =
    byId(
      "memberCards"
    );

  if (rows) {
    rows.innerHTML =
      filtered.length
        ? filtered
            .map(
              createMemberRow
            )
            .join("")
        : `
          <tr>
            <td
              colspan="11"
              class="members-empty"
            >
              No members found.
            </td>
          </tr>
        `;
  }

  if (cards) {
    cards.innerHTML =
      filtered.length
        ? filtered
            .map(
              createMemberCard
            )
            .join("")
        : `
          <div class="members-empty">
            No members found.
          </div>
        `;
  }

  updateMemberResultCount(
    filtered.length
  );
}

function updateMemberResultCount(
  count
) {
  const nodes = [
    byId(
      "memberResultCount"
    ),
    byId(
      "membersCount"
    )
  ];

  nodes.forEach(
    node => {
      if (node) {
        node.textContent =
          String(count);
      }
    }
  );
}

function updateMemberCount() {
  const total =
    members.length;

  const active =
    members.filter(
      member =>
        String(
          member.status || ""
        ).toLowerCase() ===
        "active"
    ).length;

  const loginMembers =
    members.filter(
      member =>
        getLoginStatus(
          member
        ) === "Active"
    ).length;

  const noLoginMembers =
    members.filter(
      member =>
        getLoginStatus(
          member
        ) === "No Login"
    ).length;

  const countNode =
    byId(
      "memberCount"
    );

  const activeNode =
    byId(
      "activeMembers"
    );

  const loginNode =
    byId(
      "loginMembers"
    );

  const noLoginNode =
    byId(
      "noLoginMembers"
    );

  if (countNode) {
    countNode.textContent =
      String(total);
  }

  if (activeNode) {
    activeNode.textContent =
      String(active);
  }

  if (loginNode) {
    loginNode.textContent =
      String(loginMembers);
  }

  if (noLoginNode) {
    noLoginNode.textContent =
      String(noLoginMembers);
  }

  updateMemberResultCount(
    filterMembers().length
  );
}


/* =========================================================
   MEMBER FORM RESET
========================================================= */

function resetMemberForm() {
  const form =
    byId(
      "addMemberForm"
    );

  if (form) {
    form.reset();
  }

  const today =
    getToday();

  const joinDate =
    byId(
      "memberJoinDate"
    );

  const effectiveFrom =
    byId(
      "memberContributionEffectiveFrom"
    );

  if (joinDate) {
    joinDate.value =
      today;
  }

  if (effectiveFrom) {
    effectiveFrom.value =
      today;
  }

  const historicalEnabled =
    byId(
      "memberHistoricalEnabled"
    );

  if (historicalEnabled) {
    historicalEnabled.value =
      "false";
  }

  const paidThrough =
    byId(
      "memberHistoricalPaidThrough"
    );

  if (paidThrough) {
    paidThrough.value =
      "";
  }

  const paymentMethod =
    byId(
      "memberHistoricalPaymentMethod"
    );

  if (paymentMethod) {
    paymentMethod.value =
      "Cash";
  }

  const role =
    byId(
      "memberRole"
    );

  if (role) {
    role.value =
      "member";
  }

  const status =
    byId(
      "memberStatus"
    );

  if (status) {
    status.value =
      "active";
  }

  const title =
    byId(
      "memberFormTitle"
    );

  if (title) {
    title.textContent =
      "Add Member";
  }

  const description =
    byId(
      "memberFormDescription"
    );

  if (description) {
    description.textContent =
      "Add a member and configure their contribution plan.";
  }

  const nationalId =
    byId(
      "memberNationalId"
    );

  if (nationalId) {
    nationalId.value =
      "";
  }

  const contributionAmount =
    byId(
      "memberContributionAmount"
    );

  if (contributionAmount) {
    contributionAmount.value =
      "";
  }

  const firstPeriodRule =
    byId(
      "memberFirstPeriodRule"
    );

  if (firstPeriodRule) {
    firstPeriodRule.value =
      "full_period";
  }

  editingMemberId =
    null;

  updateHistoricalControls();
  updateContributionPreview();
  clearFormMessage();
}


/* =========================================================
   FORM PANEL
========================================================= */

function openAddMemberPanel() {
  const panel =
    byId(
      "addMemberPanel"
    );

  if (!panel) {
    return;
  }

  resetMemberForm();

  panel.hidden =
    false;

  panel.removeAttribute(
    "hidden"
  );

  panel.style.display =
    "";

  panel.classList.add(
    "is-open"
  );

  byId(
    "memberNumber"
  )?.focus();
}

function closeAddMemberPanel() {
  const panel =
    byId(
      "addMemberPanel"
    );

  if (!panel) {
    return;
  }

  panel.classList.remove(
    "is-open"
  );

  panel.hidden =
    true;

  panel.setAttribute(
    "hidden",
    ""
  );

  panel.style.display =
    "none";

  resetMemberForm();
}

function openEditMemberPanel(
  memberId
) {
  const member =
    findMember(
      memberId
    );

  if (!member) {
    showError(
      "Member not found."
    );
    return;
  }

  editingMemberId =
    member.id;

  const panel =
    byId(
      "addMemberPanel"
    );

  if (!panel) {
    showError(
      "Member edit panel is not available."
    );
    return;
  }

  const title =
    byId(
      "memberFormTitle"
    );

  if (title) {
    title.textContent =
      "Edit Member";
  }

  const description =
    byId(
      "memberFormDescription"
    );

  if (description) {
    description.textContent =
      "Update the member's profile information.";
  }

  const values = {
    memberNumber:
      member.member_number ||
      "",

    memberNationalId:
      member.national_id ||
      "",

    memberName:
      member.name ||
      "",

    memberPhone:
      member.phone ||
      "",

    memberEmail:
      member.email ||
      "",

    memberRole:
      member.role ||
      "member",

    memberStatus:
      member.status ||
      "active",

    memberJoinDate:
      member.join_date ||
      ""
  };

  Object.entries(
    values
  ).forEach(
    ([id, value]) => {
      const node =
        byId(id);

      if (node) {
        node.value =
          value;
      }
    }
  );

  /*
     Critical visibility fix.

     The original implementation only changed
     the hidden property/class. If the HTML/CSS
     contains inline display:none, the panel may
     remain invisible.

     Clear the hidden attribute and inline display
     state before opening.
  */
  panel.hidden =
    false;

  panel.removeAttribute(
    "hidden"
  );

  panel.style.display =
    "";

  panel.classList.add(
    "is-open"
  );

  clearFormMessage();

  updateHistoricalControls();

  panel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


/* =========================================================
   FORM VALUES
========================================================= */

function getFormValues() {
  return {
    memberNumber:
      String(
        byId(
          "memberNumber"
        )?.value || ""
      ).trim(),

    nationalId:
      String(
        byId(
          "memberNationalId"
        )?.value || ""
      ).trim(),

    name:
      String(
        byId(
          "memberName"
        )?.value || ""
      ).trim(),

    phone:
      String(
        byId(
          "memberPhone"
        )?.value || ""
      ).trim(),

    email:
      String(
        byId(
          "memberEmail"
        )?.value || ""
      ).trim(),

    role:
      String(
        byId(
          "memberRole"
        )?.value ||
        "member"
      ).trim(),

    status:
      String(
        byId(
          "memberStatus"
        )?.value ||
        "active"
      ).trim(),

    joinDate:
      String(
        byId(
          "memberJoinDate"
        )?.value || ""
      ).trim(),

    contributionAmount:
      Number(
        byId(
          "memberContributionAmount"
        )?.value || 0
      ),

    firstPeriodRule:
      String(
        byId(
          "memberFirstPeriodRule"
        )?.value ||
        "full_period"
      ).trim(),

    effectiveFrom:
      String(
        byId(
          "memberContributionEffectiveFrom"
        )?.value || ""
      ).trim(),

    historicalEnabled:
      byId(
        "memberHistoricalEnabled"
      )?.value ===
      "true",

    historicalPaidThrough:
      String(
        byId(
          "memberHistoricalPaidThrough"
        )?.value || ""
      ).trim(),

    historicalPaymentMethod:
      String(
        byId(
          "memberHistoricalPaymentMethod"
        )?.value ||
        "Cash"
      ).trim()
  };
}


/* =========================================================
   HISTORICAL MONTH RESOLUTION
========================================================= */

function resolveFirstHistoricalMonth(
  values
) {
  const effectiveFrom =
    values?.effectiveFrom ||
    values?.joinDate ||
    "";

  if (!effectiveFrom) {
    return "";
  }

  const date =
    new Date(
      `${effectiveFrom}T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  if (
    values?.firstPeriodRule ===
    "next_full_period"
  ) {
    date.setMonth(
      date.getMonth() + 1
    );
  }

  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(2, "0"),
    "01"
  ].join("-");
}


/* =========================================================
   FORM VALIDATION
========================================================= */

function validateForm(
  values
) {
  const errors = [];

  if (!values.memberNumber) {
    errors.push(
      "Member number is required."
    );
  }

  if (!values.name) {
    errors.push(
      "Member name is required."
    );
  }

  if (!values.nationalId) {
    errors.push(
      "National ID is required."
    );
  }

  if (!values.joinDate) {
    errors.push(
      "Join date is required."
    );
  }

  if (
    values.contributionAmount <
    0
  ) {
    errors.push(
      "Monthly contribution cannot be negative."
    );
  }

  if (
    !editingMemberId &&
    !monthlyContributionType
  ) {
    errors.push(
      "Monthly contribution type is not available."
    );
  }

  if (
    values.historicalEnabled
  ) {
    if (
      !values.historicalPaidThrough
    ) {
      errors.push(
        "Paid-through date is required when historical contributions are enabled."
      );
    }

    if (
      values.historicalPaidThrough &&
      values.joinDate &&
      values.historicalPaidThrough <
        values.joinDate
    ) {
      errors.push(
        "Historical paid-through date cannot be before the join date."
      );
    }

    if (
      values.historicalPaidThrough &&
      values.effectiveFrom &&
      values.historicalPaidThrough <
        values.effectiveFrom
    ) {
      errors.push(
        "Historical paid-through date cannot be before the contribution effective date."
      );
    }
  }

  return errors;
}


/* =========================================================
   DUPLICATE MEMBER NUMBER
========================================================= */

async function checkDuplicateMemberNumber(
  memberNumber
) {
  if (!groupId) {
    return false;
  }

  let query =
    supabase
      .from(
        "members"
      )
      .select(
        "id",
        {
          count: "exact",
          head: false
        }
      )
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "member_number",
        memberNumber
      );

  if (
    editingMemberId
  ) {
    query =
      query.neq(
        "id",
        editingMemberId
      );
  }

  const {
    data,
    error
  } = await query;

  if (error) {
    throw error;
  }

  return Boolean(
    data?.length
  );
}


/* =========================================================
   SAVE MEMBER — EDIT EXISTING PROFILE
========================================================= */

async function updateExistingMember(
  values
) {
  if (!editingMemberId) {
    throw new Error(
      "No member selected for editing."
    );
  }

  const {
    error
  } = await supabase
    .from(
      "members"
    )
    .update({
      member_number:
        values.memberNumber,

      national_id:
        values.nationalId,

      name:
        values.name,

      phone:
        values.phone ||
        null,

      email:
        values.email ||
        null,

      role:
        values.role,

      status:
        values.status,

      join_date:
        values.joinDate
    })
    .eq(
      "id",
      editingMemberId
    )
    .eq(
      "group_id",
      groupId
    );

  if (error) {
    throw error;
  }

  return true;
}


/* =========================================================
   CREATE MEMBER — CANONICAL RPC
========================================================= */

async function createMemberWithPlan(
  values
) {
  if (
    !monthlyContributionType?.id
  ) {
    throw new Error(
      "Monthly contribution type is unavailable."
    );
  }

  const requestId =
    crypto.randomUUID();

  const params = {
    p_request_id:
      requestId,

    p_group_id:
      groupId,

    p_member_number:
      values.memberNumber,

    p_name:
      values.name,

    p_national_id:
      values.nationalId,

    p_phone:
      values.phone ||
      null,

    p_email:
      values.email ||
      null,

    p_role:
      values.role,

    p_status:
      values.status,

    p_join_date:
      values.joinDate,

    p_contribution_type_id:
      monthlyContributionType.id,

    p_contribution_amount:
      values.contributionAmount,

    p_first_period_rule:
      values.firstPeriodRule,

    p_effective_from:
      values.effectiveFrom ||
      values.joinDate
  };

  const {
    data,
    error
  } = await supabase.rpc(
    "create_member_with_contribution_plan",
    params
  );

  if (error) {
    throw error;
  }

  return {
    data,
    requestId
  };
}


/* =========================================================
   CREATE MEMBER — WITH HISTORICAL CONTRIBUTIONS
========================================================= */

async function createMemberWithHistoricalContributions(
  values
) {
  if (
    !monthlyContributionType?.id
  ) {
    throw new Error(
      "Monthly contribution type is unavailable."
    );
  }

  const requestId =
    crypto.randomUUID();

  const firstHistoricalMonth =
    resolveFirstHistoricalMonth(
      values
    );

  const params = {
    p_request_id:
      requestId,

    p_group_id:
      groupId,

    p_member_number:
      values.memberNumber,

    p_name:
      values.name,

    p_national_id:
      values.nationalId,

    p_phone:
      values.phone ||
      null,

    p_email:
      values.email ||
      null,

    p_role:
      values.role,

    p_status:
      values.status,

    p_join_date:
      values.joinDate,

    p_contribution_type_id:
      monthlyContributionType.id,

    p_contribution_amount:
      values.contributionAmount,

    p_first_period_rule:
      values.firstPeriodRule,

    p_effective_from:
      values.effectiveFrom ||
      values.joinDate,

    p_historical_paid_through:
      values.historicalPaidThrough,

    p_historical_payment_method:
      values.historicalPaymentMethod,

    p_first_historical_month:
      firstHistoricalMonth
  };

  const {
    data,
    error
  } = await supabase.rpc(
    "create_member_with_historical_contributions",
    params
  );

  if (error) {
    throw error;
  }

  return {
    data,
    requestId
  };
}


/* =========================================================
   SAVE MEMBER
========================================================= */

async function saveMember(
  event
) {
  event?.preventDefault();

  clearError();
  clearFormMessage();

  const button =
    byId(
      "saveMemberButton"
    );

  const values =
    getFormValues();

  const errors =
    validateForm(
      values
    );

  if (
    errors.length
  ) {
    showFormMessage(
      errors.join(" "),
      "error"
    );
    return;
  }

  if (button) {
    button.disabled =
      true;

    button.dataset.originalText =
      button.textContent;

    button.textContent =
      editingMemberId
        ? "Saving..."
        : "Creating...";
  }

  try {
    const duplicate =
      await checkDuplicateMemberNumber(
        values.memberNumber
      );

    if (duplicate) {
      throw new Error(
        `Member number ${values.memberNumber} is already in use by another member in this group.`
      );
    }

    if (
      editingMemberId
    ) {
      await updateExistingMember(
        values
      );

      showFormMessage(
        "Member updated successfully.",
        "success"
      );

      await loadMembers();
      await loadMemberContributionPositions();

      renderMembers();
      updateMemberCount();

      setTimeout(
        () => {
          closeAddMemberPanel();
        },
        600
      );

      return;
    }

    await loadMonthlyContributionType();

    let result;

    if (
      values.historicalEnabled
    ) {
      result =
        await createMemberWithHistoricalContributions(
          values
        );
    } else {
      result =
        await createMemberWithPlan(
          values
        );
    }

    console.info(
      "CHAMA LIVE: Member creation completed",
      result
    );

    showFormMessage(
      values.historicalEnabled
        ? "Member and historical contribution setup completed successfully."
        : "Member and contribution plan created successfully.",
      "success"
    );

    await loadMembers();
    await loadMemberContributionPositions();

    renderMembers();
    updateMemberCount();

    setTimeout(
      () => {
        closeAddMemberPanel();
      },
      700
    );

  } catch (error) {
    showFormMessage(
      error?.message ||
        String(
          error ||
          "Unable to save member."
        ),
      "error"
    );

    console.error(
      "CHAMA LIVE: Save member failed",
      error
    );

  } finally {
    if (button) {
      button.disabled =
        false;

      button.textContent =
        button.dataset.originalText ||
        "Save Member";
    }
  }
}


/* =========================================================
   INVITATION
========================================================= */

async function sendMemberInvitation(
  member
) {
  if (!member) {
    throw new Error(
      "Member not found."
    );
  }

  if (
    !String(
      member.email || ""
    ).trim()
  ) {
    throw new Error(
      "This member does not have an email address."
    );
  }

  const {
    data,
    error
  } =
    await supabase.functions.invoke(
      "send-member-invitation",
      {
        body: {
          member_id:
            member.id
        }
      }
    );

  if (error) {
    throw error;
  }

  return data;
}

async function inviteMember(
  memberId,
  button
) {
  const member =
    findMember(
      memberId
    );

  if (!member) {
    showError(
      "Member not found."
    );
    return;
  }

  if (button) {
    button.disabled =
      true;

    button.dataset.originalText =
      button.textContent;

    button.textContent =
      "Sending...";
  }

  clearError();

  try {
    await sendMemberInvitation(
      member
    );

    showStatus(
      `Invitation sent to ${member.email}.`
    );

    await loadMembers();

    renderMembers();
    updateMemberCount();

  } catch (error) {
    showError(
      error
    );

  } finally {
    if (button) {
      button.disabled =
        false;

      button.textContent =
        button.dataset.originalText ||
        "Invite";
    }
  }
}


/* =========================================================
   MEMBER CONTRIBUTION POSITION
========================================================= */

function getPositionForMember(
  memberId
) {
  return contributionPositions.get(
    String(memberId)
  );
}

function setText(
  id,
  value
) {
  const node =
    byId(id);

  if (node) {
    node.textContent =
      value;
  }
}

function renderMemberContributionPosition(
  member
) {
  const panel =
    byId(
      "memberContributionPosition"
    );

  if (!panel) {
    return;
  }

  const position =
    getPositionForMember(
      member.id
    );

  if (!position) {
    panel.hidden =
      false;

    panel.removeAttribute(
      "hidden"
    );

    setText(
      "viewContributionStatus",
      "Unavailable"
    );

    setText(
      "viewContributionTotal",
      formatMoney(0)
    );

    setText(
      "viewContributionDue",
      formatMoney(0)
    );

    setText(
      "viewContributionAllocated",
      formatMoney(0)
    );

    setText(
      "viewContributionArrears",
      formatMoney(0)
    );

    setText(
      "viewContributionCredit",
      formatMoney(0)
    );

    setText(
      "viewContributionDescription",
      "Contribution position could not be loaded."
    );

    return;
  }

  panel.hidden =
    false;

  panel.removeAttribute(
    "hidden"
  );

  const status =
    contributionStatusLabel(
      position.status
    );

  const totalDue =
    position.total_due ??
    position.due ??
    0;

  const allocated =
    position.total_allocated ??
    position.allocated ??
    0;

  const arrears =
    position.arrears ??
    position.outstanding ??
    0;

  const credit =
    position.credit ??
    0;

  setText(
    "viewContributionStatus",
    status
  );

  setText(
    "viewContributionTotal",
    formatMoney(
      totalDue
    )
  );

  setText(
    "viewContributionDue",
    formatMoney(
      totalDue
    )
  );

  setText(
    "viewContributionAllocated",
    formatMoney(
      allocated
    )
  );

  setText(
    "viewContributionArrears",
    formatMoney(
      arrears
    )
  );

  setText(
    "viewContributionCredit",
    formatMoney(
      credit
    )
  );

  let description =
    contributionResultMessage(
      position
    );

  if (
    position.description
  ) {
    description =
      String(
        position.description
      );
  }

  setText(
    "viewContributionDescription",
    description
  );
}


/* =========================================================
   MEMBER MODAL
========================================================= */

async function openMemberModal(
  memberId
) {
  const member =
    findMember(
      memberId
    );

  if (!member) {
    showError(
      "Member not found."
    );
    return;
  }

  const modal =
    byId(
      "memberModal"
    );

  if (!modal) {
    showError(
      "Member details modal is not available."
    );
    return;
  }

  ensureNationalIdUI();

  setText(
    "viewMemberInitials",
    getInitials(
      member.name
    )
  );

  setText(
    "viewMemberName",
    member.name ||
      "—"
  );

  setText(
    "viewMemberNumber",
    member.member_number ||
      "—"
  );

  setText(
    "viewMembershipNumber",
    member.membership_number ||
      member.member_number ||
      "—"
  );

  setText(
    "viewMemberNationalId",
    member.national_id ||
      "—"
  );

  setText(
    "viewMemberPhone",
    member.phone ||
      "—"
  );

  setText(
    "viewMemberEmail",
    member.email ||
      "—"
  );

  setText(
    "viewMemberRole",
    displayRole(
      member.role
    )
  );

  setText(
    "viewMemberStatus",
    String(
      member.status ||
      "—"
    )
  );

  setText(
    "viewMemberLoginStatus",
    getLoginStatus(
      member
    )
  );

  setText(
    "viewMemberJoinDate",
    formatDate(
      member.join_date
    )
  );

  setText(
    "viewMemberGroup",
    currentGroup?.name ||
      "—"
  );

  renderMemberContributionPosition(
    member
  );

  /*
     Critical modal visibility fix.

     The HTML may contain:
       hidden
       style="display:none"

     Setting only modal.hidden=false is not sufficient
     when inline display:none remains.

     We explicitly clear the hidden state and set the
     visible display mode.
  */
  modal.hidden =
    false;

  modal.removeAttribute(
    "hidden"
  );

  modal.style.display =
    "flex";

  modal.classList.add(
    "is-open"
  );

  document.body.classList.add(
    "modal-open"
  );
}

function closeMemberModal() {
  const modal =
    byId(
      "memberModal"
    );

  if (!modal) {
    return;
  }

  modal.classList.remove(
    "is-open"
  );

  modal.hidden =
    true;

  modal.setAttribute(
    "hidden",
    ""
  );

  modal.style.display =
    "none";

  document.body.classList.remove(
    "modal-open"
  );
}


/* =========================================================
   HISTORICAL RECONCILIATION
========================================================= */

async function reconcileHistoricalPayments(
  memberId
) {
  const member =
    findMember(
      memberId
    );

  if (!member) {
    throw new Error(
      "Member not found."
    );
  }

  const requestId =
    crypto.randomUUID();

  const {
    data,
    error
  } = await supabase.rpc(
    "reconcile_member_historical_payments",
    {
      p_request_id:
        requestId,

      p_member_id:
        member.id
    }
  );

  if (error) {
    throw error;
  }

  return data;
}

async function handleHistoricalReconciliation(
  memberId,
  button
) {
  const member =
    findMember(
      memberId
    );

  if (!member) {
    showError(
      "Member not found."
    );
    return;
  }

  const confirmed =
    window.confirm(
      `Reconcile historical payments for ${member.name}? This uses the approved server-side reconciliation process.`
    );

  if (!confirmed) {
    return;
  }

  if (button) {
    button.disabled =
      true;

    button.dataset.originalText =
      button.textContent;

    button.textContent =
      "Reconciling...";
  }

  clearError();

  try {
    await reconcileHistoricalPayments(
      member.id
    );

    await loadMemberContributionPositions();

    renderMemberContributionPosition(
      member
    );

    renderMembers();

    showStatus(
      `Historical payments reconciled for ${member.name}.`
    );

  } catch (error) {
    showError(
      error
    );

  } finally {
    if (button) {
      button.disabled =
        false;

      button.textContent =
        button.dataset.originalText ||
        "Reconcile Historical Payments";
    }
  }
}


/* =========================================================
   SEARCH
========================================================= */

function handleMemberSearch() {
  if (
    memberSearchTimer
  ) {
    clearTimeout(
      memberSearchTimer
    );
  }

  memberSearchTimer =
    setTimeout(
      () => {
        renderMembers();
      },
      120
    );
}

function clearMemberSearch() {
  const input =
    byId(
      "memberSearch"
    );

  if (input) {
    input.value =
      "";
  }

  renderMembers();

  input?.focus();
}


/* =========================================================
   EVENT ACTION ROUTER
========================================================= */

async function handleMemberAction(
  event
) {
  const button =
    event.target.closest(
      "[data-action]"
    );

  if (!button) {
    return;
  }

  const action =
    button.dataset.action;

  const memberId =
    button.dataset.memberId;

  if (!memberId) {
    return;
  }

  if (
    action === "view"
  ) {
    await openMemberModal(
      memberId
    );
    return;
  }

  if (
    action === "edit"
  ) {
    openEditMemberPanel(
      memberId
    );
    return;
  }

  if (
    action === "invite"
  ) {
    await inviteMember(
      memberId,
      button
    );
    return;
  }

  if (
    action === "reconcile"
  ) {
    await handleHistoricalReconciliation(
      memberId,
      button
    );
  }
}


/* =========================================================
   EVENT BINDING
========================================================= */

function bindEvents() {
  if (
    eventsBound
  ) {
    return;
  }

  eventsBound =
    true;

  byId(
    "addMemberButton"
  )?.addEventListener(
    "click",
    openAddMemberPanel
  );

  byId(
    "closeAddMember"
  )?.addEventListener(
    "click",
    closeAddMemberPanel
  );

  byId(
    "cancelAddMember"
  )?.addEventListener(
    "click",
    closeAddMemberPanel
  );

  byId(
    "addMemberForm"
  )?.addEventListener(
    "submit",
    saveMember
  );

  byId(
    "memberSearch"
  )?.addEventListener(
    "input",
    handleMemberSearch
  );

  byId(
    "clearMemberSearch"
  )?.addEventListener(
    "click",
    clearMemberSearch
  );

  byId(
    "memberRows"
  )?.addEventListener(
    "click",
    handleMemberAction
  );

  byId(
    "memberCards"
  )?.addEventListener(
    "click",
    handleMemberAction
  );

  byId(
    "closeMemberModal"
  )?.addEventListener(
    "click",
    closeMemberModal
  );

  byId(
    "doneMemberModal"
  )?.addEventListener(
    "click",
    closeMemberModal
  );

  byId(
    "memberHistoricalEnabled"
  )?.addEventListener(
    "change",
    updateHistoricalControls
  );

  byId(
    "memberHistoricalPaidThrough"
  )?.addEventListener(
    "change",
    updateHistoricalPreview
  );

  byId(
    "memberJoinDate"
  )?.addEventListener(
    "change",
    updateHistoricalPreview
  );

  byId(
    "memberContributionAmount"
  )?.addEventListener(
    "input",
    () => {
      updateContributionPreview();
      updateHistoricalPreview();
    }
  );

  byId(
    "memberContributionEffectiveFrom"
  )?.addEventListener(
    "change",
    updateHistoricalPreview
  );

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key ===
        "Escape"
      ) {
        closeMemberModal();
      }
    }
  );
}


/* =========================================================
   INITIALIZATION
========================================================= */

async function init() {
  if (
    initialized
  ) {
    return;
  }

  initialized =
    true;

  clearError();

  showStatus(
    "Loading members..."
  );

  try {
    currentUser =
      await requireAuth();

    currentMember =
      await getMyMember();

    currentGroup =
      await getMyGroup();

    groupId =
      currentMember?.group_id ||
      currentGroup?.id ||
      null;

    if (!groupId) {
      throw new Error(
        "Your account is not associated with a group."
      );
    }

    ensureNationalIdUI();
    ensureContributionUI();
    ensureContributionStatusStyles();

    bindEvents();

    await loadMonthlyContributionType();
    await loadMembers();
    await loadMemberContributionPositions();

    ensureContributionStatusHeader();

    renderMembers();
    updateMemberCount();

    showStatus("");

  } catch (error) {
    initialized =
      false;

    showError(
      error
    );

    showStatus("");
  }
}


/* =========================================================
   PUBLIC REFRESH
========================================================= */

async function refreshMembers() {
  clearError();

  try {
    await loadMembers();
    await loadMemberContributionPositions();

    renderMembers();
    updateMemberCount();

  } catch (error) {
    showError(
      error
    );
  }
}


/* =========================================================
   AUTO BOOT
========================================================= */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      init();
    },
    {
      once: true
    }
  );
} else {
  init();
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
