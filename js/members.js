/* =========================================================
   CHAMA LIVE — MEMBERS
   Pilot-ready members management
   National ID + Contribution Accounting
   ---------------------------------------------------------
   ACCOUNTING RULE
   ---------------------------------------------------------
   Frontend does NOT directly insert or update:

     contributions
     contribution_allocations
     contribution_obligations

   Canonical accounting is performed by database RPCs.

   ---------------------------------------------------------
   MEMBER CREATION
   ---------------------------------------------------------
   New member without historical payments:

     create_member_with_contribution_plan()

   New member with historical payments:

     create_member_with_historical_contributions()

   ---------------------------------------------------------
   MEMBER POSITION
   ---------------------------------------------------------
   Actual group position is collected only when creating a
   new member.

   Initial position data is passed through the canonical
   member-creation RPC.

   Existing-member position changes MUST use:

     set_member_actual_position()

   The browser does NOT directly update:

     members.actual_position
     members.actual_position_name
     member_position_history

   ---------------------------------------------------------
   EXISTING PAYMENT RECONCILIATION
   ---------------------------------------------------------

     reconcile_member_historical_payments()

   ---------------------------------------------------------
   CANONICAL ACCOUNTING REFRESH
   ---------------------------------------------------------

     refresh_my_managed_member_accounting()

   Before reading a member's contribution position, the page
   invokes the authenticated canonical refresh boundary.

   Refresh and read are deliberately handled independently:
   a refresh error is reported/logged but does not prevent
   the read-only position RPC from being attempted.

   ---------------------------------------------------------
   IMPORTANT
   ---------------------------------------------------------
   create_member_with_historical_contributions() creates a
   NEW member. It must NEVER be used to edit an existing
   member.

   Existing-member historical accounting changes require the
   verified canonical accounting workflow.

   Member contribution rules are displayed read-only.

   ---------------------------------------------------------
   GROUP MEMBER POPULATION
   ---------------------------------------------------------
   Every row returned for the current group is a group member.

   status and onboarding_status do NOT determine whether a
   member belongs in the member list.

   Financial contribution status is separate from account
   status and onboarding status.

   ---------------------------------------------------------
   PRODUCTION SAFETY
   ---------------------------------------------------------
   This file contains frontend-only changes.

   No SQL, migration, RLS, DDL, DML, or accounting-table
   mutation is performed here.
   ========================================================= */

import { supabase } from "./supabase.js";
import { membersApi } from "./api/members.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";


/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let groupId = null;

let members = [];

let editingMemberId = null;

let initialized = false;
let eventsBound = false;

let memberSearchTimer = null;

let monthlyContributionType = null;
let contributionTypesLoaded = false;

let contributionPositions = new Map();
let contributionPositionsLoaded = false;

let memberContributionRules = new Map();
let memberContributionRulesLoaded = false;


/* =========================================================
   ACTUAL POSITION CONTRACT
   ========================================================= */

const ACTUAL_POSITION_VALUES = new Set([
  "chairperson",
  "vice_chairperson",
  "treasurer",
  "secretary",
  "vice_secretary",
  "committee_member",
  "member",
  "other"
]);


/* =========================================================
   ACTUAL POSITION HELPERS
   ========================================================= */

function normalizeActualPosition(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_");
}


function formatActualPosition(value) {
  const normalized =
    normalizeActualPosition(value);

  if (!normalized) {
    return "—";
  }

  return normalized
    .replaceAll("_", " ")
    .replace(/\b\w/g, character =>
      character.toUpperCase()
    );
}


function isValidActualPosition(value) {
  return ACTUAL_POSITION_VALUES.has(
    normalizeActualPosition(value)
  );
}


function getActualPositionName(values) {
  const position =
    normalizeActualPosition(
      values?.actual_position
    );

  if (position !== "other") {
    return "";
  }

  return String(
    values?.actual_position_name || ""
  ).trim();
}


/* =========================================================
   ACTUAL POSITION UI
   ========================================================= */

function updateActualPositionNameUI() {
  const position =
    normalizeActualPosition(
      byId(
        "memberActualPosition"
      )?.value
    );

  const field =
    byId(
      "memberActualPositionNameField"
    );

  const name =
    byId(
      "memberActualPositionName"
    );

  const isOther =
    position === "other";

  if (field) {
    field.hidden =
      !isOther;
  }

  if (name) {
    name.disabled =
      !isOther;

    if (!isOther && !editingMemberId) {
      name.value =
        "";
    }
  }
}


/* =========================================================
   DOM HELPERS
   ========================================================= */

function byId(id) {
  return document.getElementById(id);
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}


function getToday() {
  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(now.getMonth() + 1)
      .padStart(2, "0");

  const day =
    String(now.getDate())
      .padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function getInitials(name) {
  const value =
    String(name || "").trim();

  if (!value) {
    return "?";
  }

  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part =>
      part.charAt(0).toUpperCase()
    )
    .join("");
}


function displayRole(role) {
  const normalized =
    String(role || "member")
      .trim()
      .toLowerCase()
      .replaceAll("_", " ");

  const labels = {
    admin: "Admin",
    treasurer: "Treasurer",
    secretary: "Secretary",
    chairperson: "Chairperson",
    "vice chairperson": "Vice Chairperson",
    "vice secretary": "Vice Secretary",
    member: "Member"
  };

  return (
    labels[normalized] ||
    "Member"
  );
}


function roleBadgeHtml(role) {
  return `
    <span class="role-badge role-${escapeHtml(
      String(role || "member")
        .toLowerCase()
        .replaceAll(" ", "-")
        .replaceAll("_", "-")
    )}">
      ${escapeHtml(displayRole(role))}
    </span>
  `;
}


function accountStatusHtml(status) {
  const value =
    String(status || "active")
      .toLowerCase();

  const label =
    value === "active"
      ? "Active"
      : value === "inactive"
        ? "Inactive"
        : value === "suspended"
          ? "Suspended"
          : value;

  return `
    <span class="status-badge status-${escapeHtml(value)}">
      ${escapeHtml(label)}
    </span>
  `;
}


function onboardingStatusHtml(status) {
  const value =
    String(status || "pending")
      .trim()
      .toLowerCase();

  const labels = {
    pending: "Pending",
    invited: "Invited",
    active: "Active",
    completed: "Completed",
    suspended: "Suspended"
  };

  const label =
    labels[value] ||
    value ||
    "Pending";

  return `
    <span class="onboarding-status onboarding-status-${escapeHtml(
      value || "pending"
    )}">
      ${escapeHtml(label)}
    </span>
  `;
}


function formatMoney(value) {
  const amount =
    Number(value || 0);

  return `KSh ${amount.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}


/* =========================================================
   HISTORICAL PAYMENT METHOD NORMALIZATION
   ========================================================= */

function normalizeHistoricalPaymentMethod(value) {
  const normalized =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    normalized === "m-pesa" ||
    normalized === "mpesa"
  ) {
    return "M-Pesa";
  }

  if (normalized === "cash") {
    return "Cash";
  }

  if (
    normalized === "bank transfer" ||
    normalized === "bank_transfer" ||
    normalized === "bank-transfer"
  ) {
    return "Bank transfer";
  }

  return String(value || "").trim();
}


/* =========================================================
   LOGIN STATUS
   ========================================================= */

function getLoginStatus(member) {
  if (!member) {
    return {
      key: "unknown",
      label: "Unknown"
    };
  }

  if (!member.user_id) {
    return {
      key: "no-login",
      label: "No Login"
    };
  }

  return {
    key: "login-active",
    label: "Login Active"
  };
}


function loginStatusHtml(member) {
  const status =
    getLoginStatus(member);

  return `
    <span class="login-status login-status-${escapeHtml(
      status.key
    )}">
      ${escapeHtml(status.label)}
    </span>
  `;
}


/* =========================================================
   CONTRIBUTION STATUS
   ========================================================= */

function contributionStatusKey(position) {
  if (!position) {
    return "unknown";
  }

  const credit =
    Number(position.credit || 0);

  const arrears =
    Number(position.arrears || 0);

  if (
    credit > 0 &&
    arrears <= 0
  ) {
    return "credit";
  }

  if (arrears > 0) {
    return "arrears";
  }

  return "up-to-date";
}


function contributionStatusLabel(position) {
  const key =
    contributionStatusKey(position);

  if (key === "credit") {
    return "Credit";
  }

  if (key === "arrears") {
    return "Arrears";
  }

  if (key === "up-to-date") {
    return "Up to Date";
  }

  return "Unavailable";
}


function contributionStatusHtml(position) {
  const key =
    contributionStatusKey(position);

  return `
    <span class="contribution-status contribution-status-${escapeHtml(
      key
    )}">
      ${escapeHtml(
        contributionStatusLabel(position)
      )}
    </span>
  `;
}


/* =========================================================
   CANONICAL ACCOUNTING REFRESH
   ========================================================= */

async function refreshManagedMemberAccounting(
  memberId
) {
  if (!memberId) {
    throw new Error(
      "Member ID is required for accounting refresh."
    );
  }

  const {
    data,
    error
  } = await membersApi.rpc(
    "refresh_my_managed_member_accounting",
    {
      p_member_id:
        memberId
    }
  );

  if (error) {
    throw error;
  }

  return data;
}


/* =========================================================
   CONTRIBUTION POSITION — ALL MEMBERS
   ---------------------------------------------------------
   REFRESH AND READ ARE INDEPENDENT.

   A failure at the canonical refresh boundary must not
   suppress the subsequent read-only position RPC.
   ========================================================= */

async function loadMemberContributionPositions() {
  contributionPositions =
    new Map();

  contributionPositionsLoaded =
    false;

  if (!members.length) {
    contributionPositionsLoaded =
      true;

    return;
  }

  for (const member of members) {

    if (!member?.id) {
      continue;
    }


    /* -----------------------------------------------------
       CANONICAL REFRESH
       ----------------------------------------------------- */

    try {

      await refreshManagedMemberAccounting(
        member.id
      );

    } catch (refreshError) {

      console.warn(
        "Canonical accounting refresh failed; continuing with read:",
        member.id,
        refreshError
      );
    }


    /* -----------------------------------------------------
       READ-ONLY POSITION
       ----------------------------------------------------- */

    try {

      const {
        data,
        error
      } = await membersApi.rpc(
        "get_member_contribution_position",
        {
          p_member_id:
            member.id
        }
      );

      if (error) {
        console.warn(
          "Contribution position read failed for member:",
          member.id,
          error
        );

        continue;
      }

      const position =
        Array.isArray(data)
          ? data[0] || null
          : data || null;

      if (position) {

        /*
         * IMPORTANT:
         *
         * total_contributed is a backend value when supplied
         * by the canonical read RPC.
         *
         * Do NOT derive it as:
         *
         *     allocated + credit
         *
         * Credit is a separate accounting state.
         */

        contributionPositions.set(
          member.id,
          {
            ...position,

            allocated:
              Number(
                position.total_allocated ?? 0
              )
          }
        );
      }

    } catch (readError) {

      console.warn(
        "Contribution position read failed:",
        member.id,
        readError
      );
    }
  }

  contributionPositionsLoaded =
    true;
}


/* =========================================================
   MEMBER CONTRIBUTION RULES
   ---------------------------------------------------------
   READ ONLY.
   ========================================================= */

async function loadMemberContributionRules() {
  memberContributionRules =
    new Map();

  memberContributionRulesLoaded =
    false;

  if (!members.length) {
    memberContributionRulesLoaded =
      true;

    return;
  }

  const memberIds =
    members
      .map(member => member.id)
      .filter(Boolean);

  if (!memberIds.length) {
    memberContributionRulesLoaded =
      true;

    return;
  }

  const {
    data,
    error
  } = await membersApi.contributionRules(groupId, memberIds);
  if (error) {
    console.warn(
      "Member contribution rules could not be loaded:",
      error
    );

    memberContributionRulesLoaded =
      true;

    return;
  }

  const rows =
    Array.isArray(data)
      ? data
      : [];

  for (const row of rows) {
    const id =
      row.member_id;

    if (!id) {
      continue;
    }

    if (
      !memberContributionRules.has(id)
    ) {
      memberContributionRules.set(
        id,
        []
      );
    }

    memberContributionRules
      .get(id)
      .push(row);
  }

  memberContributionRulesLoaded =
    true;
}


function getMemberRules(memberId) {
  return (
    memberContributionRules.get(
      memberId
    ) || []
  );
}


function formatFrequency(value) {
  const normalized =
    String(value || "")
      .trim()
      .toLowerCase();

  if (!normalized) {
    return "—";
  }

  return normalized
    .replaceAll("_", " ")
    .replace(/\b\w/g, character =>
      character.toUpperCase()
    );
}


function formatRuleStatus(value) {
  const normalized =
    String(value || "")
      .trim()
      .toLowerCase();

  if (!normalized) {
    return "—";
  }

  return normalized
    .replaceAll("_", " ")
    .replace(/\b\w/g, character =>
      character.toUpperCase()
    );
}


function memberRulesHtml(memberId) {
  const rules =
    getMemberRules(
      memberId
    );

  if (!rules.length) {
    return `
      <div class="member-rule-empty">
        No contribution rule is visible for this member.
      </div>
    `;
  }

  return `
    <div class="member-contribution-rules">

      ${rules.map(rule => {

        const amount =
          Number(
            rule.amount || 0
          );

        return `
          <div class="member-contribution-rule">

            <div>
              <span>Amount</span>

              <strong>
                ${formatMoney(amount)}
              </strong>
            </div>

            <div>
              <span>Frequency</span>

              <strong>
                ${escapeHtml(
                  formatFrequency(
                    rule.frequency
                  )
                )}
              </strong>
            </div>

            <div>
              <span>Effective From</span>

              <strong>
                ${formatDate(
                  rule.effective_from
                )}
              </strong>
            </div>

            <div>
              <span>Effective To</span>

              <strong>
                ${formatDate(
                  rule.effective_to
                )}
              </strong>
            </div>

            <div>
              <span>First Period</span>

              <strong>
                ${escapeHtml(
                  formatRuleStatus(
                    rule.first_period_rule
                  )
                )}
              </strong>
            </div>

            <div>
              <span>Status</span>

              <strong>
                ${escapeHtml(
                  formatRuleStatus(
                    rule.status
                  )
                )}
              </strong>
            </div>

          </div>
        `;
      }).join("")}

    </div>
  `;
}


/* =========================================================
   HEADER / STYLE HELPERS
   ========================================================= */

function ensureContributionStatusHeader() {
  const table =
    document.querySelector("table");

  if (!table) {
    return;
  }

  const headerRow =
    table.querySelector("thead tr");

  if (!headerRow) {
    return;
  }

  const existingHeaders =
    Array.from(
      headerRow.querySelectorAll("th")
    );

  const hasContributionStatus =
    existingHeaders.some(
      th =>
        String(th.textContent || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ") ===
        "contribution status"
    );

  if (hasContributionStatus) {
    return;
  }

  if (
    headerRow.querySelector(
      '[data-column="contribution-status"]'
    )
  ) {
    return;
  }

  const th =
    document.createElement("th");

  th.dataset.column =
    "contribution-status";

  th.textContent =
    "Contribution Status";

  headerRow.appendChild(th);
}


function ensureContributionStatusStyles() {
  if (
    byId(
      "membersContributionStatusStyles"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "membersContributionStatusStyles";

  style.textContent = `
    .contribution-status {
      display: inline-flex;
      align-items: center;
      gap: .35rem;
      padding: .25rem .55rem;
      border-radius: 999px;
      font-size: .75rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .contribution-status-credit {
      background: rgba(37, 99, 235, .12);
      color: #1d4ed8;
    }

    .contribution-status-arrears {
      background: rgba(220, 38, 38, .12);
      color: #b91c1c;
    }

    .contribution-status-up-to-date {
      background: rgba(22, 163, 74, .12);
      color: #15803d;
    }

    .contribution-status-unknown {
      background: rgba(107, 114, 128, .12);
      color: #4b5563;
    }

    .empty-state {
      padding: 2rem;
      text-align: center;
      color: #6b7280;
    }

    .actual-position-display {
      display: inline-flex;
      flex-direction: column;
      gap: .15rem;
    }

    .actual-position-display small {
      color: #6b7280;
      font-size: .72rem;
    }

    .member-contribution-rules {
      display: grid;
      gap: .75rem;
      margin-top: .75rem;
    }

    .member-contribution-rule {
      display: grid;
      grid-template-columns:
        repeat(auto-fit, minmax(130px, 1fr));
      gap: .75rem;
      padding: .75rem;
      border: 1px solid rgba(127,127,127,.18);
      border-radius: .65rem;
    }

    .member-contribution-rule > div {
      display: flex;
      flex-direction: column;
      gap: .2rem;
    }

    .member-contribution-rule span,
    .member-contribution-position span {
      color: #6b7280;
      font-size: .78rem;
    }

    .member-rule-empty {
      color: #6b7280;
      padding: .75rem 0;
    }

    .member-onboarding,
    .onboarding-status {
      display: inline-flex;
      align-items: center;
      padding: .2rem .5rem;
      border-radius: 999px;
      font-size: .72rem;
      font-weight: 600;
      white-space: nowrap;
      background: rgba(107,114,128,.10);
      color: #4b5563;
    }

    .onboarding-status-active,
    .onboarding-status-completed {
      background: rgba(22,163,74,.12);
      color: #15803d;
    }

    .onboarding-status-invited {
      background: rgba(37,99,235,.12);
      color: #1d4ed8;
    }

    .onboarding-status-pending {
      background: rgba(234,179,8,.14);
      color: #a16207;
    }

    .onboarding-status-suspended {
      background: rgba(220,38,38,.12);
      color: #b91c1c;
    }

    .member-position-change {
      margin-top: 1rem;
      padding: 1rem;
      border: 1px solid rgba(127,127,127,.2);
      border-radius: .75rem;
    }

    .member-position-change-grid {
      display: grid;
      grid-template-columns:
        repeat(auto-fit, minmax(180px, 1fr));
      gap: .75rem;
      margin-top: .75rem;
    }

    .member-position-change-field {
      display: flex;
      flex-direction: column;
      gap: .3rem;
    }

    .member-position-change-field label {
      font-size: .78rem;
      color: #6b7280;
    }

    .member-position-change-field input,
    .member-position-change-field select {
      width: 100%;
    }

    .member-position-change-help {
      margin-top: .6rem;
      color: #6b7280;
      font-size: .78rem;
    }
  `;

  document.head.appendChild(style);
}


/* =========================================================
   MESSAGES
   ========================================================= */

function showStatus(message) {
  const element =
    byId("status") ||
    byId("membersStatus") ||
    byId("statusMessage") ||
    byId("pageStatus");

  if (!element) {
    return;
  }

  element.textContent =
    message || "";

  element.hidden =
    !message;
}


function showError(message) {
  const element =
    byId("error") ||
    byId("membersError") ||
    byId("errorMessage") ||
    byId("pageError");

  if (!element) {
    console.error(message);
    return;
  }

  element.textContent =
    message ||
    "Something went wrong.";

  element.hidden =
    false;
}


function clearError() {
  const element =
    byId("error") ||
    byId("membersError") ||
    byId("errorMessage") ||
    byId("pageError");

  if (!element) {
    return;
  }

  element.textContent =
    "";

  element.hidden =
    true;
}


function showFormMessage(
  message,
  type = "info"
) {
  const element =
    byId("formMessage") ||
    byId("memberFormMessage");

  if (!element) {
    return;
  }

  element.textContent =
    message || "";

  element.dataset.type =
    type;

  element.hidden =
    !message;
}


function clearFormMessage() {
  const element =
    byId("formMessage") ||
    byId("memberFormMessage");

  if (!element) {
    return;
  }

  element.textContent =
    "";

  element.hidden =
    true;

  delete element.dataset.type;
}


/* =========================================================
   MEMBER HELPERS
   ========================================================= */

function findMember(memberId) {
  if (!memberId) {
    return null;
  }

  return (
    members.find(
      member =>
        String(member.id) ===
        String(memberId)
    ) || null
  );
}


/* =========================================================
   NATIONAL ID UI
   ========================================================= */

function ensureNationalIdUI() {
  const input =
    byId("memberNationalId");

  if (!input) {
    return;
  }

  input.setAttribute(
    "autocomplete",
    "off"
  );
}


/* =========================================================
   CONTRIBUTION UI
   ---------------------------------------------------------
   ONE AUTHORITATIVE CONTRIBUTION-AMOUNT LISTENER.

   Historical preview is updated here as well so the amount
   field has one listener only.
   ========================================================= */

function ensureContributionUI() {
  const amount =
    byId(
      "memberContributionAmount"
    );

  if (!amount) {
    return;
  }

  if (
    amount.dataset.contributionPreviewBound ===
    "true"
  ) {
    return;
  }

  amount.dataset.contributionPreviewBound =
    "true";

  amount.addEventListener(
    "input",
    () => {
      updateContributionPreview();
      updateHistoricalPreview();
    }
  );
}


/* =========================================================
   CONTRIBUTION TYPE
   ========================================================= */

async function loadMonthlyContributionType() {
  monthlyContributionType = null;
  contributionTypesLoaded = false;

  if (!groupId) {
    contributionTypesLoaded = true;
    return;
  }

  const {
    data,
    error
  } = await membersApi.contributionTypes(groupId);

  if (error) {
    /*
     * The Members page must remain usable when the optional
     * contribution-type lookup is unavailable. Member listing
     * is read-only and must not be blocked by form metadata.
     */
    console.warn(
      "Monthly contribution type could not be loaded:",
      error
    );

    contributionTypesLoaded = true;
    return;
  }

  const rows =
    Array.isArray(data)
      ? data
      : [];

  const activeRows =
    rows.filter(row => {
      if (
        !Object.prototype.hasOwnProperty.call(
          row,
          "is_active"
        )
      ) {
        return true;
      }

      return row.is_active !== false;
    });

  monthlyContributionType =
    activeRows.find(row =>
      String(row.code || "")
        .trim()
        .toLowerCase() ===
      "monthly"
    ) ||

    activeRows.find(row =>
      String(row.name || "")
        .trim()
        .toLowerCase() ===
      "monthly"
    ) ||

    activeRows.find(row =>
      String(row.type_name || "")
        .trim()
        .toLowerCase() ===
      "monthly"
    ) ||

    null;

  contributionTypesLoaded =
    true;

  if (!monthlyContributionType) {
    console.warn(
      "The group's Monthly contribution type could not be found; member listing remains available."
    );
  }
}


/* =========================================================
   CONTRIBUTION PREVIEW
   ========================================================= */

function updateContributionPreview() {
  const amountInput =
    byId(
      "memberContributionAmount"
    );

  const preview =
    byId(
      "memberContributionPreview"
    ) ||
    byId(
      "contributionPreview"
    );

  if (!preview) {
    return;
  }

  const amount =
    Number(
      amountInput?.value || 0
    );

  preview.textContent =
    `Monthly contribution ${formatMoney(amount)}`;
}


/* =========================================================
   HISTORICAL CONTROLS
   ========================================================= */

function updateHistoricalControls() {
  const enabledInput =
    byId(
      "memberHistoricalEnabled"
    );

  const controls =
    document.querySelector(
      "[data-historical-controls]"
    ) ||
    byId(
      "historicalContributionControls"
    );

  if (!enabledInput) {
    return;
  }

  const enabled =
    String(
      enabledInput.value || ""
    ).trim().toLowerCase() === "true";

  if (controls) {
    controls.hidden =
      !enabled;
  }

  const paidThrough =
    byId(
      "memberHistoricalPaidThrough"
    );

  const paymentMethod =
    byId(
      "memberHistoricalPaymentMethod"
    );

  if (paidThrough) {
    paidThrough.disabled =
      !enabled;
  }

  if (paymentMethod) {
    paymentMethod.disabled =
      !enabled;
  }

  updateHistoricalPreview();
}


function updateHistoricalPreview() {
  const preview =
    byId(
      "memberHistoricalPreview"
    ) ||
    byId(
      "historicalPreview"
    );

  if (!preview) {
    return;
  }

  const enabledInput =
    byId(
      "memberHistoricalEnabled"
    );

  if (
    String(
      enabledInput?.value || ""
    ).trim().toLowerCase() !== "true"
  ) {
    preview.textContent =
      "";

    return;
  }

  const joinDate =
    byId(
      "memberJoinDate"
    )?.value || "";

  const paidThrough =
    byId(
      "memberHistoricalPaidThrough"
    )?.value || "";

  const amount =
    Number(
      byId(
        "memberContributionAmount"
      )?.value || 0
    );

  if (
    !joinDate ||
    !paidThrough ||
    amount <= 0
  ) {
    preview.textContent =
      "";

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
    preview.textContent =
      "";

    return;
  }

  let months =
    (
      (
        end.getFullYear() -
        start.getFullYear()
      ) * 12
    ) +
    (
      end.getMonth() -
      start.getMonth()
    ) +
    1;

  if (months < 0) {
    months = 0;
  }

  preview.textContent =
    `${months} historical month${
      months === 1 ? "" : "s"
    } · ${formatMoney(
      months * amount
    )}`;
}


/* =========================================================
   FORM VALUES
   ========================================================= */

function getFormValues() {
  return {
    member_number:
      byId(
        "memberNumber"
      )?.value?.trim() || "",

    membership_number:
      byId(
        "memberMembershipNumber"
      )?.value?.trim() || "",

    name:
      byId(
        "memberName"
      )?.value?.trim() || "",

    national_id:
      byId(
        "memberNationalId"
      )?.value?.trim() || "",

    phone:
      byId(
        "memberPhone"
      )?.value?.trim() || "",

    email:
      byId(
        "memberEmail"
      )?.value?.trim() || "",

    role:
      byId(
        "memberRole"
      )?.value ||
      "member",

    actual_position:
      normalizeActualPosition(
        byId(
          "memberActualPosition"
        )?.value
      ),

    actual_position_name:
      byId(
        "memberActualPositionName"
      )?.value?.trim() || "",

    actual_position_effective_from:
      byId(
        "memberActualPositionEffectiveFrom"
      )?.value || "",

    status:
      byId(
        "memberStatus"
      )?.value ||
      "active",

    join_date:
      byId(
        "memberJoinDate"
      )?.value || "",

    contribution_amount:
      Number(
        byId(
          "memberContributionAmount"
        )?.value || 0
      ),

    first_period_rule:
      byId(
        "memberFirstPeriodRule"
      )?.value ||
      "full_period",

    contribution_effective_from:
      byId(
        "memberContributionEffectiveFrom"
      )?.value || "",

    historical_enabled:
      String(
        byId(
          "memberHistoricalEnabled"
        )?.value || ""
      ).trim().toLowerCase() === "true",

    historical_paid_through:
      byId(
        "memberHistoricalPaidThrough"
      )?.value || "",

    historical_payment_method:
      byId(
        "memberHistoricalPaymentMethod"
      )?.value ||
      "cash"
  };
}


/* =========================================================
   FORM VALIDATION
   ========================================================= */

function validateForm(values) {
  if (!values.member_number) {
    return "Member number is required.";
  }

  if (!values.name) {
    return "Member name is required.";
  }

  if (!values.national_id) {
    return "National ID is required.";
  }

  if (!values.phone) {
    return "Phone number is required.";
  }

  if (!groupId) {
    return "The member's group could not be determined.";
  }


  /* -------------------------------------------------------
     EXISTING MEMBER
     ------------------------------------------------------- */

  if (editingMemberId) {

    if (
      values.historical_enabled ||
      values.historical_paid_through
    ) {
      return (
        "Historical accounting changes for an existing member " +
        "require the verified canonical accounting workflow."
      );
    }

    return true;
  }


  /* -------------------------------------------------------
     NEW MEMBER ACTUAL POSITION
     ------------------------------------------------------- */

  if (
    values.actual_position &&
    !isValidActualPosition(
      values.actual_position
    )
  ) {
    return (
      "Select a valid actual group position."
    );
  }

  if (
    values.actual_position ===
    "other" &&
    !values.actual_position_name
  ) {
    return (
      "Enter the position name when selecting Other."
    );
  }

  if (
    values.actual_position !==
    "other"
  ) {
    values.actual_position_name =
      "";
  }

  if (!values.join_date) {
    return "Join date is required.";
  }

  if (
    !values.actual_position_effective_from
  ) {
    values.actual_position_effective_from =
      values.join_date;
  }

  if (
    values.actual_position_effective_from <
    values.join_date
  ) {
    return (
      "Actual position effective date cannot be before the join date."
    );
  }


  /* -------------------------------------------------------
     NEW MEMBER ACCOUNTING
     ------------------------------------------------------- */

  if (
    !Number.isFinite(
      values.contribution_amount
    ) ||
    values.contribution_amount < 0
  ) {
    return (
      "Monthly contribution must be zero or greater."
    );
  }

  if (!monthlyContributionType) {
    return (
      "The group's Monthly contribution type could not be found."
    );
  }

  if (!values.contribution_effective_from) {
    values.contribution_effective_from =
      values.join_date;
  }

  if (
    values.contribution_effective_from <
    values.join_date
  ) {
    return (
      "Contribution effective date cannot be before the join date."
    );
  }


  /* -------------------------------------------------------
     HISTORICAL CONTRIBUTIONS
     ------------------------------------------------------- */

  if (values.historical_enabled) {

    if (
      !values.historical_paid_through
    ) {
      return "Paid Through date is required.";
    }

    if (
      !values.historical_payment_method
    ) {
      return "Historical payment method is required.";
    }

    const historicalPaymentMethod =
      String(values.historical_payment_method || "")
        .trim()
        .toLowerCase();

    if (
      !["cash", "mpesa", "bank_transfer", "bank"]
        .includes(historicalPaymentMethod)
    ) {
      return "Select Cash, M-Pesa, or Bank transfer for historical payments.";
    }

    if (
      values.historical_paid_through <
      values.join_date
    ) {
      return (
        "Paid Through cannot be before the join date."
      );
    }
  }

  return true;
}


/* =========================================================
   DUPLICATE MEMBER NUMBER
   ========================================================= */

async function checkDuplicateMemberNumber(
  memberNumber
) {
  if (
    !groupId ||
    !memberNumber
  ) {
    return false;
  }

  let query =
    supabase
      .from("members")
      .select("id")
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "member_number",
        memberNumber
      );

  if (editingMemberId) {
    query =
      query.neq(
        "id",
        editingMemberId
      );
  }

  const {
    data,
    error
  } = await query.limit(1);

  if (error) {
    throw error;
  }

  return Boolean(
    data &&
    data.length
  );
}


/* =========================================================
   LOAD MEMBERS
   ========================================================= */

async function loadMembers() {
  if (!groupId) {
    members = [];

    return;
  }

  const {
    data,
    error
  } = await membersApi.list(groupId);
  if (error) {
    throw error;
  }

  members =
    Array.isArray(data)
      ? data
      : [];
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

  if (
    typeof result === "string"
  ) {
    return result;
  }

  const status =
    String(
      result.status ||
      result.contribution_status ||
      ""
    ).toLowerCase();

  if (status === "credit") {
    return (
      `Member created with credit ${formatMoney(
        result.credit
      )}.`
    );
  }

  if (status === "arrears") {
    return (
      `Member created with arrears ${formatMoney(
        result.arrears
      )}.`
    );
  }

  if (
    status === "up_to_date" ||
    status === "up-to-date"
  ) {
    return (
      "Member created and contribution position is up to date."
    );
  }

  if (
    result.historical_months ||
    result.historical_payment_count
  ) {
    return (
      "Member created and historical contributions recorded successfully."
    );
  }

  return (
    "Member created successfully."
  );
}


/* =========================================================
   MEMBER ROW
   ---------------------------------------------------------
   EXACTLY 13 TABLE COLUMNS:

   1  Member No.
   2  National ID
   3  Membership No.
   4  Member
   5  Phone
   6  Email
   7  Role
   8  Actual Position
   9  Account Status
   10 Onboarding
   11 Contribution Status
   12 Login
   13 Actions

   Credit is deliberately NOT a table column.
   ========================================================= */

function createMemberRow(member) {
  const position =
    contributionPositions.get(
      member.id
    ) || null;

  const tr =
    document.createElement("tr");

  tr.dataset.memberId =
    member.id;

  tr.innerHTML = `
    <td>
      ${escapeHtml(
        member.member_number ||
        "—"
      )}
    </td>

    <td>
      ${escapeHtml(
        member.national_id ||
        "—"
      )}
    </td>

    <td>
      ${escapeHtml(
        member.membership_number ||
        member.member_number ||
        "—"
      )}
    </td>

    <td>
      <div class="member-identity">

        <div class="member-avatar">
          ${escapeHtml(
            getInitials(member.name)
          )}
        </div>

        <div>
          <div class="member-name">
            ${escapeHtml(
              member.name
            )}
          </div>
        </div>

      </div>
    </td>

    <td>
      ${escapeHtml(
        member.phone ||
        "—"
      )}
    </td>

    <td>
      ${escapeHtml(
        member.email ||
        "—"
      )}
    </td>

    <td>
      ${roleBadgeHtml(
        member.role
      )}
    </td>

    <td>
      <div class="actual-position-display">

        <strong>
          ${escapeHtml(
            formatActualPosition(
              member.actual_position
            )
          )}
        </strong>

        ${
          normalizeActualPosition(
            member.actual_position
          ) === "other" &&
          member.actual_position_name
            ? `
              <small>
                ${escapeHtml(
                  member.actual_position_name
                )}
              </small>
            `
            : ""
        }

      </div>
    </td>

    <td>
      ${accountStatusHtml(
        member.status
      )}
    </td>

    <td>
      ${onboardingStatusHtml(
        member.onboarding_status
      )}
    </td>

    <td data-column="contribution-status">
      ${contributionStatusHtml(
        position
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
          data-action="view"
          data-member-id="${escapeHtml(
            member.id
          )}"
        >
          View
        </button>

        <button
          type="button"
          data-action="edit"
          data-member-id="${escapeHtml(
            member.id
          )}"
        >
          Edit
        </button>

        ${
          member.email
            ? `
              <button
                type="button"
                data-action="invite"
                data-member-id="${escapeHtml(
                  member.id
                )}"
              >
                Invite
              </button>
            `
            : ""
        }

      </div>
    </td>
  `;

  return tr;
}


/* =========================================================
   MEMBER CARD
   ========================================================= */

function createMemberCard(member) {
  const position =
    contributionPositions.get(
      member.id
    ) || null;

  const card =
    document.createElement(
      "article"
    );

  card.className =
    "member-card";

  card.dataset.memberId =
    member.id;

  card.innerHTML = `
    <div class="member-card-header">

      <div class="member-identity">

        <div class="member-avatar">
          ${escapeHtml(
            getInitials(member.name)
          )}
        </div>

        <div>
          <h3>
            ${escapeHtml(
              member.name
            )}
          </h3>

          <p>
            ${escapeHtml(
              member.member_number ||
              "—"
            )}
          </p>
        </div>

      </div>

      ${accountStatusHtml(
        member.status
      )}

    </div>

    <div class="member-card-body">

      <div>
        <span>National ID</span>

        <strong>
          ${escapeHtml(
            member.national_id ||
            "—"
          )}
        </strong>
      </div>

      <div>
        <span>Membership No.</span>

        <strong>
          ${escapeHtml(
            member.membership_number ||
            member.member_number ||
            "—"
          )}
        </strong>
      </div>

      <div>
        <span>Phone</span>

        <strong>
          ${escapeHtml(
            member.phone ||
            "—"
          )}
        </strong>
      </div>

      <div>
        <span>Email</span>

        <strong>
          ${escapeHtml(
            member.email ||
            "—"
          )}
        </strong>
      </div>

      <div>
        <span>Role</span>

        <strong>
          ${escapeHtml(
            displayRole(
              member.role
            )
          )}
        </strong>
      </div>

      <div>
        <span>Actual Position</span>

        <strong>
          ${escapeHtml(
            formatActualPosition(
              member.actual_position
            )
          )}
        </strong>

        ${
          normalizeActualPosition(
            member.actual_position
          ) === "other" &&
          member.actual_position_name
            ? `
              <small>
                ${escapeHtml(
                  member.actual_position_name
                )}
              </small>
            `
            : ""
        }
      </div>

      <div>
        <span>Onboarding</span>

        <strong>
          ${escapeHtml(
            String(
              member.onboarding_status ||
              "pending"
            )
          )}
        </strong>
      </div>

      <div>
        <span>Login</span>

        <strong>
          ${escapeHtml(
            getLoginStatus(
              member
            ).label
          )}
        </strong>
      </div>

      <div>
        <span>Contribution</span>

        <strong>
          ${escapeHtml(
            contributionStatusLabel(
              position
            )
          )}
        </strong>
      </div>

      <div>
        <span>Credit</span>

        <strong>
          ${formatMoney(
            position?.credit || 0
          )}
        </strong>
      </div>

    </div>

    <div class="member-card-actions">

      <button
        type="button"
        data-action="view"
        data-member-id="${escapeHtml(
          member.id
        )}"
      >
        View
      </button>

      <button
        type="button"
        data-action="edit"
        data-member-id="${escapeHtml(
          member.id
        )}"
      >
        Edit
      </button>

      ${
        member.email
          ? `
            <button
              type="button"
              data-action="invite"
              data-member-id="${escapeHtml(
                member.id
              )}"
            >
              Invite
            </button>
          `
          : ""
      }

    </div>
  `;

  return card;
}


/* =========================================================
   RENDER MEMBERS
   ========================================================= */

function renderMembers() {

  const tableBody =
    byId("memberRows") ||
    byId("membersTableBody") ||
    byId("membersBody");

  const cards =
    byId("memberCards") ||
    byId("membersCards") ||
    byId("membersCardGrid");


  /* -------------------------------------------------------
     DESKTOP TABLE
     ------------------------------------------------------- */

  if (tableBody) {
    tableBody.innerHTML =
      "";

    if (!members.length) {
      tableBody.innerHTML = `
        <tr>
          <td
            colspan="13"
            class="empty-state"
          >
            No members found.
          </td>
        </tr>
      `;
    } else {
      for (const member of members) {
        tableBody.appendChild(
          createMemberRow(
            member
          )
        );
      }
    }
  }


  /* -------------------------------------------------------
     MOBILE CARDS
     ------------------------------------------------------- */

  if (cards) {
    cards.innerHTML =
      "";

    if (!members.length) {
      cards.innerHTML = `
        <div class="empty-state">
          No members found.
        </div>
      `;
    } else {
      for (const member of members) {
        cards.appendChild(
          createMemberCard(
            member
          )
        );
      }
    }
  }

  ensureContributionStatusHeader();


  /* -------------------------------------------------------
     RESULT COUNT
     ------------------------------------------------------- */

  const resultCount =
    byId(
      "memberResultCount"
    );

  if (resultCount) {
    resultCount.textContent =
      `${members.length} member${
        members.length === 1
          ? ""
          : "s"
      }`;
  }
}


/* =========================================================
   MEMBER COUNT
   ========================================================= */

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

  const loginActive =
    members.filter(
      member =>
        Boolean(
          member.user_id
        )
    ).length;

  const noLogin =
    members.filter(
      member =>
        !member.user_id
    ).length;

  const totalElement =
    byId(
      "memberCount"
    ) ||
    byId(
      "totalMembers"
    );

  const activeElement =
    byId(
      "activeMembers"
    );

  const loginElement =
    byId(
      "loginMembers"
    );

  const noLoginElement =
    byId(
      "noLoginMembers"
    );

  if (totalElement) {
    totalElement.textContent =
      String(total);
  }

  if (activeElement) {
    activeElement.textContent =
      String(active);
  }

  if (loginElement) {
    loginElement.textContent =
      String(loginActive);
  }

  if (noLoginElement) {
    noLoginElement.textContent =
      String(noLogin);
  }
}


/* =========================================================
   OPEN ADD MEMBER
   ========================================================= */

function openAddMember() {
  editingMemberId =
    null;

  clearFormMessage();
  clearError();

  const panel =
    byId(
      "addMemberPanel"
    ) ||
    byId(
      "memberFormPanel"
    );

  const title =
    byId(
      "memberFormTitle"
    ) ||
    byId(
      "formTitle"
    );

  const description =
    byId(
      "memberFormDescription"
    ) ||
    byId(
      "formDescription"
    );

  if (title) {
    title.textContent =
      "Add Member";
  }

  if (description) {
    description.textContent =
      "Create a member and configure their contribution plan.";
  }

  const form =
    byId(
      "addMemberForm"
    ) ||
    byId(
      "memberForm"
    );

  if (form) {
    form.reset();
  }

  const status =
    byId(
      "memberStatus"
    );

  if (status) {
    status.value =
      "active";
  }

  const role =
    byId(
      "memberRole"
    );

  if (role) {
    role.value =
      "member";
  }

  const actualPosition =
    byId(
      "memberActualPosition"
    );

  if (actualPosition) {
    actualPosition.disabled =
      false;

    actualPosition.value =
      "";
  }

  const actualPositionName =
    byId(
      "memberActualPositionName"
    );

  if (actualPositionName) {
    actualPositionName.disabled =
      true;

    actualPositionName.value =
      "";
  }

  const actualPositionEffectiveFrom =
    byId(
      "memberActualPositionEffectiveFrom"
    );

  const joinDate =
    byId(
      "memberJoinDate"
    );

  if (joinDate) {
    joinDate.value =
      getToday();
  }

  if (actualPositionEffectiveFrom) {
    actualPositionEffectiveFrom.value =
      joinDate?.value ||
      getToday();

    actualPositionEffectiveFrom.disabled =
      false;
  }

  updateActualPositionNameUI();


  const amount =
    byId(
      "memberContributionAmount"
    );

  if (
    amount &&
    currentGroup
  ) {
    amount.value =
      Number(
        currentGroup.monthly_contribution ||
        0
      );
  }


  const effectiveDate =
    byId(
      "memberContributionEffectiveFrom"
    );

  if (effectiveDate) {
    effectiveDate.value =
      joinDate?.value ||
      getToday();
  }


  const membershipNumber =
    byId(
      "memberMembershipNumber"
    );

  if (
    membershipNumber &&
    byId("memberNumber")
  ) {
    membershipNumber.value =
      byId("memberNumber").value ||
      "";
  }


  const historical =
    byId(
      "memberHistoricalEnabled"
    );

  if (historical) {
    historical.disabled =
      false;

    historical.checked =
      false;
  }


  const paidThrough =
    byId(
      "memberHistoricalPaidThrough"
    );

  if (paidThrough) {
    paidThrough.disabled =
      true;

    paidThrough.value =
      "";
  }


  const paymentMethod =
    byId(
      "memberHistoricalPaymentMethod"
    );

  if (paymentMethod) {
    paymentMethod.disabled =
      true;
  }


  if (amount) {
    amount.disabled =
      false;
  }


  const firstPeriod =
    byId(
      "memberFirstPeriodRule"
    );

  if (firstPeriod) {
    firstPeriod.disabled =
      false;
  }


  if (effectiveDate) {
    effectiveDate.disabled =
      false;
  }

  updateHistoricalControls();

  updateContributionPreview();

  if (panel) {
    panel.hidden =
      false;

    panel.classList.add(
      "open"
    );
  }
}


/* =========================================================
   CLOSE ADD / EDIT
   ========================================================= */

function closeAddMember() {
  const panel =
    byId(
      "addMemberPanel"
    ) ||
    byId(
      "memberFormPanel"
    );

  if (panel) {
    panel.hidden =
      true;

    panel.classList.remove(
      "open"
    );
  }

  editingMemberId =
    null;

  clearFormMessage();
}


/* =========================================================
   SAVE MEMBER
   ========================================================= */

async function saveMember(event) {
  event?.preventDefault();

  clearError();
  clearFormMessage();

  const values =
    getFormValues();

  if (
    !values.membership_number &&
    values.member_number
  ) {
    values.membership_number =
      values.member_number;
  }

  const validation =
    validateForm(
      values
    );

  if (validation !== true) {
    showFormMessage(
      validation,
      "error"
    );

    return;
  }


  try {

    const duplicate =
      await checkDuplicateMemberNumber(
        values.member_number
      );

    if (duplicate) {
      showFormMessage(
        "That member number is already in use in this group.",
        "error"
      );

      return;
    }


    /* =====================================================
       EXISTING MEMBER
       ===================================================== */

    if (editingMemberId) {

      const updatePayload = {
        member_number:
          values.member_number,

        name:
          values.name,

        national_id:
          values.national_id,

        phone:
          values.phone,

        email:
          values.email ||
          null,

        role:
          values.role,

        status:
          values.status,

        join_date:
          values.join_date ||
          null
      };


      if (
        values.membership_number
      ) {
        updatePayload.membership_number =
          values.membership_number;
      }


      const {
        error
      } = await membersApi.updateMember(groupId, editingMemberId, updatePayload);
  if (error) {
        throw error;
      }


      await loadMembers();

      await loadMemberContributionRules();

      await loadMemberContributionPositions();

      renderMembers();

      updateMemberCount();

      showStatus(
        "Member details updated. No historical accounting or position-history entries were changed."
      );

      closeAddMember();

      return;
    }


    /* =====================================================
       NEW MEMBER
       CANONICAL ACCOUNTING FLOW
       ===================================================== */

    let result =
      null;


    const memberPayload = {
      group_id:
        groupId,

      member_number:
        values.member_number,

      membership_number:
        values.membership_number ||
        values.member_number,

      name:
        values.name,

      national_id:
        values.national_id,

      phone:
        values.phone,

      email:
        values.email ||
        null,

      role:
        values.role,

      actual_position:
        values.actual_position ||
        null,

      actual_position_name:
        values.actual_position ===
        "other"
          ? values.actual_position_name
          : null,

      actual_position_effective_from:
        values.actual_position_effective_from ||
        values.join_date,

      status:
        values.status,

      join_date:
        values.join_date
    };


    const contributionPlan = [
      {
        contribution_type_id:
          monthlyContributionType.id,

        amount:
          values.contribution_amount,

        frequency:
          "monthly",

        effective_from:
          values.contribution_effective_from,

        effective_to:
          null,

        first_period_rule:
          values.first_period_rule,

        status:
          "active"
      }
    ];


    if (
      values.historical_enabled
    ) {

      const {
        data,
        error
      } = await membersApi.rpc(
        "create_member_with_historical_contributions",
        {
          p_member:
            memberPayload,

          p_contribution_plan:
            contributionPlan,

          p_historical: {
            enabled:
              true,

            monthly_amount:
              values.contribution_amount,

            paid_through:
              values.historical_paid_through,

            payment_method:
              normalizeHistoricalPaymentMethod(
                values.historical_payment_method
              )
          },

          p_request_id:
            crypto.randomUUID()
        }
      );

      if (error) {
        throw error;
      }

      result =
        Array.isArray(data)
          ? data[0] || data
          : data;

    } else {

      const {
        data,
        error
      } = await membersApi.rpc(
        "create_member_with_contribution_plan",
        {
          p_member:
            memberPayload,

          p_contribution_plan:
            contributionPlan
        }
      );

      if (error) {
        throw error;
      }

      result =
        Array.isArray(data)
          ? data[0] || data
          : data;
    }


    await loadMembers();

    await loadMemberContributionRules();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();


    showStatus(
      contributionResultMessage(
        result
      )
    );


    closeAddMember();


    try {

      const createdMemberId =
        Array.isArray(result)
          ? (
              result[0]?.member_id ||
              result[0]?.id
            )
          : (
              result?.member_id ||
              result?.id
            );

      sessionStorage.setItem(
        "chamaLiveMemberOnboardingCompleted",
        JSON.stringify({
          memberId:
            createdMemberId,

          groupId:
            groupId,

          completedAt:
            new Date().toISOString()
        })
      );

    } catch {
      /* Session storage is non-critical. */
    }


  } catch (error) {

    console.error(
      "saveMember failed:",
      error
    );

    showFormMessage(
      error?.message ||
      "Unable to save the member.",
      "error"
    );
  }
}


/* =========================================================
   EXISTING PAYMENT RECONCILIATION
   ========================================================= */

async function reconcileMemberHistoricalPayments(
  memberId,
  throughDate = null
) {
  if (!memberId) {
    throw new Error(
      "Member ID is required for reconciliation."
    );
  }

  const {
    data,
    error
  } = await membersApi.rpc(
    "reconcile_member_historical_payments",
    {
      p_member_id:
        memberId,

      p_through_date:
        throughDate ||
        null
    }
  );

  if (error) {
    throw error;
  }

  return data;
}


/* =========================================================
   HISTORICAL RECONCILIATION ACTION
   ========================================================= */

async function handleHistoricalReconciliation(
  memberId
) {
  const member =
    findMember(
      memberId
    );

  if (!member) {
    showError(
      "Member could not be found."
    );

    return;
  }

  const confirmed =
    window.confirm(
      `Reconcile existing historical payments for ${member.name}?`
    );

  if (!confirmed) {
    return;
  }

  try {

    showStatus(
      "Reconciling existing historical payments..."
    );

    const result =
      await reconcileMemberHistoricalPayments(
        member.id
      );

    await loadMembers();

    await loadMemberContributionRules();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();

    showStatus(
      result?.message ||
      "Historical payments reconciled successfully."
    );

    await openMemberModal(
      member.id
    );

  } catch (error) {

    console.error(
      "Historical reconciliation failed:",
      error
    );

    showError(
      error?.message ||
      "Historical payment reconciliation failed."
    );
  }
}


/* =========================================================
   EXISTING MEMBER POSITION CHANGE
   ========================================================= */

async function setMemberActualPosition(
  memberId,
  actualPosition,
  actualPositionName,
  effectiveFrom
) {
  if (!memberId) {
    throw new Error(
      "Member ID is required."
    );
  }

  const position =
    normalizeActualPosition(
      actualPosition
    );

  if (
    !isValidActualPosition(
      position
    )
  ) {
    throw new Error(
      "Select a valid actual group position."
    );
  }

  const name =
    position === "other"
      ? String(
          actualPositionName || ""
        ).trim()
      : null;

  if (
    position === "other" &&
    !name
  ) {
    throw new Error(
      "Enter the position name when selecting Other."
    );
  }

  if (!effectiveFrom) {
    throw new Error(
      "Position effective date is required."
    );
  }

  const {
    data,
    error
  } = await membersApi.rpc(
    "set_member_actual_position",
    {
      p_member_id:
        memberId,

      p_actual_position:
        position,

      p_actual_position_name:
        name,

      p_effective_from:
        effectiveFrom
    }
  );

  if (error) {
    throw error;
  }

  return data;
}


/* =========================================================
   POSITION CHANGE UI
   ========================================================= */

function ensureMemberPositionChangeUI(
  member
) {
  const modal =
    getMemberViewModal();

  if (!modal) {
    return;
  }

  let section =
    modal.querySelector(
      "[data-member-position-change]"
    );

  if (!section) {

    section =
      document.createElement(
        "section"
      );

    section.dataset.memberPositionChange =
      "true";

    section.className =
      "member-position-change";

    section.innerHTML = `
      <h3>
        Change Actual Group Position
      </h3>

      <div class="member-position-change-grid">

        <div class="member-position-change-field">

          <label
            for="memberPositionChangeValue"
          >
            Actual Position
          </label>

          <select
            id="memberPositionChangeValue"
          >
            <option value="">
              Select position
            </option>

            <option value="chairperson">
              Chairperson
            </option>

            <option value="vice_chairperson">
              Vice Chairperson
            </option>

            <option value="treasurer">
              Treasurer
            </option>

            <option value="secretary">
              Secretary
            </option>

            <option value="vice_secretary">
              Vice Secretary
            </option>

            <option value="committee_member">
              Committee Member
            </option>

            <option value="member">
              Member
            </option>

            <option value="other">
              Other
            </option>
          </select>

        </div>

        <div
          class="member-position-change-field"
          id="memberPositionChangeNameField"
          hidden
        >

          <label
            for="memberPositionChangeName"
          >
            Position Name
          </label>

          <input
            type="text"
            id="memberPositionChangeName"
            autocomplete="off"
          />

        </div>

        <div class="member-position-change-field">

          <label
            for="memberPositionChangeEffectiveFrom"
          >
            Effective From
          </label>

          <input
            type="date"
            id="memberPositionChangeEffectiveFrom"
          />

        </div>

      </div>

      <div class="member-position-change-help">
        Position changes are recorded through the canonical
        position-history workflow. The role used for system
        access is not changed here.
      </div>

      <div
        class="member-position-change-actions"
        style="margin-top:.75rem"
      >

        <button
          type="button"
          data-action="save-position"
        >
          Save Position Change
        </button>

      </div>

      <div
        data-position-change-message
        hidden
        style="margin-top:.5rem"
      ></div>
    `;

    const container =
      modal.querySelector(
        ".member-modal-body"
      ) ||
      modal.querySelector(
        ".modal-body"
      ) ||
      modal;

    container.appendChild(
      section
    );


    const positionSelect =
      section.querySelector(
        "#memberPositionChangeValue"
      );

    positionSelect?.addEventListener(
      "change",
      () => {

        const field =
          section.querySelector(
            "#memberPositionChangeNameField"
          );

        const name =
          section.querySelector(
            "#memberPositionChangeName"
          );

        const isOther =
          normalizeActualPosition(
            positionSelect.value
          ) === "other";

        if (field) {
          field.hidden =
            !isOther;
        }

        if (name) {
          name.disabled =
            !isOther;

          if (!isOther) {
            name.value =
              "";
          }
        }
      }
    );
  }


  const positionSelect =
    section.querySelector(
      "#memberPositionChangeValue"
    );

  const positionName =
    section.querySelector(
      "#memberPositionChangeName"
    );

  const effectiveFrom =
    section.querySelector(
      "#memberPositionChangeEffectiveFrom"
    );

  const message =
    section.querySelector(
      "[data-position-change-message]"
    );

  if (positionSelect) {
    positionSelect.value =
      isValidActualPosition(
        member.actual_position
      )
        ? normalizeActualPosition(
            member.actual_position
          )
        : "";
  }

  if (positionName) {
    positionName.value =
      member.actual_position_name ||
      "";
  }

  if (effectiveFrom) {
    effectiveFrom.value =
      getToday();
  }

  if (message) {
    message.textContent =
      "";

    message.hidden =
      true;
  }

  section.dataset.memberId =
    member.id;
}


/* =========================================================
   SAVE POSITION CHANGE
   ========================================================= */

async function handlePositionChange(
  memberId
) {
  const member =
    findMember(
      memberId
    );

  if (!member) {
    showError(
      "Member could not be found."
    );

    return;
  }

  const modal =
    getMemberViewModal();

  if (!modal) {
    return;
  }

  const section =
    modal.querySelector(
      "[data-member-position-change]"
    );

  if (!section) {
    return;
  }

  const position =
    section.querySelector(
      "#memberPositionChangeValue"
    )?.value || "";

  const positionName =
    section.querySelector(
      "#memberPositionChangeName"
    )?.value?.trim() || "";

  const effectiveFrom =
    section.querySelector(
      "#memberPositionChangeEffectiveFrom"
    )?.value || "";

  const message =
    section.querySelector(
      "[data-position-change-message]"
    );

  const setMessage =
    (text, type = "info") => {

      if (!message) {
        return;
      }

      message.textContent =
        text || "";

      message.dataset.type =
        type;

      message.hidden =
        !text;
    };


  if (
    !isValidActualPosition(
      position
    )
  ) {
    setMessage(
      "Select a valid actual group position.",
      "error"
    );

    return;
  }

  if (
    normalizeActualPosition(
      position
    ) === "other" &&
    !positionName
  ) {
    setMessage(
      "Enter the position name when selecting Other.",
      "error"
    );

    return;
  }

  if (!effectiveFrom) {
    setMessage(
      "Position effective date is required.",
      "error"
    );

    return;
  }


  const confirmed =
    window.confirm(
      `Set ${member.name}'s actual position to "${formatActualPosition(
        position
      )}" effective ${formatDate(
        effectiveFrom
      )}?`
    );

  if (!confirmed) {
    return;
  }


  try {

    setMessage(
      "Saving position change..."
    );

    clearError();

    await setMemberActualPosition(
      member.id,
      position,
      positionName,
      effectiveFrom
    );


    await loadMembers();

    await loadMemberContributionRules();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();


    setMessage(
      "Actual group position updated successfully.",
      "success"
    );

    showStatus(
      "Member actual group position updated."
    );


    const refreshedMember =
      findMember(
        member.id
      );

    if (refreshedMember) {
      ensureMemberPositionChangeUI(
        refreshedMember
      );
    }

  } catch (error) {

    console.error(
      "set_member_actual_position failed:",
      error
    );

    setMessage(
      error?.message ||
      "Unable to update the member's actual group position.",
      "error"
    );
  }
}


/* =========================================================
   INVITATION
   ========================================================= */

async function sendMemberInvitation(
  memberId,
  reopenModal = false
) {
  const member =
    findMember(
      memberId
    );

  if (!member) {
    showError(
      "Member could not be found."
    );

    return;
  }

  if (!member.email) {
    showError(
      "This member does not have an email address."
    );

    return;
  }

  if (!currentUser) {
    showError(
      "Your session is not available."
    );

    return;
  }

  try {

    showStatus(
      "Sending member invitation..."
    );

    clearError();

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

    showStatus(
      data?.message ||
      "Member invitation sent."
    );


    await loadMembers();

    await loadMemberContributionRules();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();


    if (reopenModal) {
      const refreshed =
        findMember(
          member.id
        );

      if (refreshed) {
        await openMemberModal(
          refreshed.id
        );
      }
    }

  } catch (error) {

    console.error(
      "sendMemberInvitation failed:",
      error
    );

    let message =
      error?.message ||
      "Unable to send member invitation.";

    try {

      if (
        error?.context &&
        typeof error.context.json ===
          "function"
      ) {

        const details =
          await error.context.json();

        if (
          details?.error
        ) {
          message =
            String(
              details.error
            );
        }

        if (
          details?.details &&
          details.details !==
            details.error
        ) {
          message +=
            ` — ${String(
              details.details
            )}`;
        }

        if (
          details?.email_sent ===
          false &&
          !message.toLowerCase().includes(
            "email"
          )
        ) {
          message +=
            " — Email was not sent.";
        }
      }

    } catch (
      responseReadError
    ) {

      console.debug(
        "Could not read invitation error response:",
        responseReadError
      );
    }

    showError(
      message
    );
  }
}


/* =========================================================
   EDIT MEMBER
   ========================================================= */

async function openEditMember(
  memberId
) {
  const member =
    findMember(
      memberId
    );

  if (!member) {
    showError(
      "Member could not be found."
    );

    return;
  }

  editingMemberId =
    member.id;

  clearError();
  clearFormMessage();

  const title =
    byId(
      "memberFormTitle"
    ) ||
    byId(
      "formTitle"
    );

  const description =
    byId(
      "memberFormDescription"
    ) ||
    byId(
      "formDescription"
    );

  if (title) {
    title.textContent =
      "Edit Member";
  }

  if (description) {
    description.textContent =
      "Update member details. Historical accounting and actual group position remain protected by their canonical workflows.";
  }

  const fields = {
    memberNumber:
      member.member_number ||
      "",

    memberMembershipNumber:
      member.membership_number ||
      member.member_number ||
      "",

    memberName:
      member.name ||
      "",

    memberNationalId:
      member.national_id ||
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

  for (
    const [id, value]
    of Object.entries(fields)
  ) {
    const element =
      byId(id);

    if (element) {
      element.value =
        value;
    }
  }


  const actualPosition =
    byId(
      "memberActualPosition"
    );

  const actualPositionName =
    byId(
      "memberActualPositionName"
    );

  const actualPositionEffectiveFrom =
    byId(
      "memberActualPositionEffectiveFrom"
    );

  if (actualPosition) {
    actualPosition.value =
      isValidActualPosition(
        member.actual_position
      )
        ? normalizeActualPosition(
            member.actual_position
          )
        : "";

    actualPosition.disabled =
      true;
  }

  if (actualPositionName) {
    actualPositionName.value =
      member.actual_position_name ||
      "";

    actualPositionName.disabled =
      true;
  }

  if (actualPositionEffectiveFrom) {
    actualPositionEffectiveFrom.value =
      member.join_date ||
      "";

    actualPositionEffectiveFrom.disabled =
      true;
  }

  updateActualPositionNameUI();


  const contributionAmount =
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

  const historicalEnabled =
    byId(
      "memberHistoricalEnabled"
    );

  if (contributionAmount) {
    contributionAmount.disabled =
      true;
  }

  if (firstPeriod) {
    firstPeriod.disabled =
      true;
  }

  if (effectiveFrom) {
    effectiveFrom.disabled =
      true;
  }

  if (historicalEnabled) {
    historicalEnabled.checked =
      false;

    historicalEnabled.disabled =
      true;
  }

  updateHistoricalControls();


  const panel =
    byId(
      "addMemberPanel"
    ) ||
    byId(
      "memberFormPanel"
    );

  if (panel) {
    panel.hidden =
      false;

    panel.classList.add(
      "open"
    );
  }
}


/* =========================================================
   MEMBER VIEW MODAL
   ========================================================= */

function getMemberViewModal() {
  return (
    byId(
      "memberModal"
    ) ||
    byId(
      "viewMemberModal"
    )
  );
}


/* =========================================================
   CONTRIBUTION POSITION UI
   ========================================================= */

function ensureContributionPositionUI() {
  const modal =
    getMemberViewModal();

  if (!modal) {
    return;
  }

  if (
    modal.querySelector(
      "[data-member-contribution-position]"
    )
  ) {
    return;
  }

  const container =
    modal.querySelector(
      ".member-modal-body"
    ) ||
    modal.querySelector(
      ".modal-body"
    ) ||
    modal;

  const section =
    document.createElement(
      "section"
    );

  section.dataset.memberContributionPosition =
    "true";

  section.innerHTML = `
    <div class="member-contribution-position">

      <h3>
        Contribution Position
      </h3>

      <div
        data-contribution-position-loading
        hidden
      >
        Loading contribution position...
      </div>

      <div
        data-contribution-position-content
      >

        <div>
          <span>Total Contributed</span>

          <strong
            data-position-total-contributed
          >
            —
          </strong>
        </div>

        <div>
          <span>Total Due</span>

          <strong
            data-position-total-due
          >
            —
          </strong>
        </div>

        <div>
          <span>Allocated</span>

          <strong
            data-position-allocated
          >
            —
          </strong>
        </div>

        <div>
          <span>Arrears</span>

          <strong
            data-position-arrears
          >
            —
          </strong>
        </div>

        <div>
          <span>Credit</span>

          <strong
            data-position-credit
          >
            —
          </strong>
        </div>

      </div>

      <div data-position-status>
        —
      </div>

      <div data-position-records>
      </div>

    </div>
  `;

  container.appendChild(
    section
  );
}


function ensureContributionPositionStyles() {
  if (
    byId(
      "memberContributionPositionStyles"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "memberContributionPositionStyles";

  style.textContent = `
    .member-contribution-position {
      margin-top: 1rem;
      padding: 1rem;
      border: 1px solid rgba(127,127,127,.2);
      border-radius: .75rem;
    }

    .member-contribution-position h3 {
      margin-top: 0;
    }

    .member-contribution-position
      [data-contribution-position-content] {
      display: grid;
      grid-template-columns:
        repeat(auto-fit,minmax(130px,1fr));
      gap: .75rem;
    }

    .member-contribution-position
      [data-contribution-position-content] > div {
      display: flex;
      flex-direction: column;
      gap: .2rem;
    }
  `;

  document.head.appendChild(
    style
  );
}


function setContributionPositionLoading(
  loading
) {
  const modal =
    getMemberViewModal();

  if (!modal) {
    return;
  }

  const element =
    modal.querySelector(
      "[data-contribution-position-loading]"
    );

  const content =
    modal.querySelector(
      "[data-contribution-position-content]"
    );

  if (element) {
    element.hidden =
      !loading;
  }

  if (content) {
    content.hidden =
      loading;
  }
}


/* =========================================================
   LOAD MEMBER POSITION
   ---------------------------------------------------------
   REFRESH AND READ ARE INDEPENDENT.

   IMPORTANT:
   total_contributed is never calculated from allocated +
   credit. The canonical read result is displayed as returned.
   ========================================================= */

async function loadMemberContributionPosition(
  memberId
) {
  const modal =
    getMemberViewModal();

  if (!modal) {
    return null;
  }

  ensureContributionPositionUI();

  setContributionPositionLoading(
    true
  );

  let position =
    null;

  try {

    /* -----------------------------------------------------
       CANONICAL REFRESH
       ----------------------------------------------------- */

    try {

      await refreshManagedMemberAccounting(
        memberId
      );

    } catch (refreshError) {

      console.warn(
        "Canonical accounting refresh failed; continuing with position read:",
        memberId,
        refreshError
      );
    }


    /* -----------------------------------------------------
       READ-ONLY POSITION
       ----------------------------------------------------- */

    const {
      data,
      error
    } =
      await membersApi.rpc(
        "get_member_contribution_position",
        {
          p_member_id:
            memberId
        }
      );

    if (error) {
      throw error;
    }

    position =
      Array.isArray(data)
        ? data[0] || null
        : data || null;


    if (!position) {
      contributionPositions.delete(
        memberId
      );

      const totalElement =
        modal.querySelector(
          "[data-position-total-contributed]"
        );

      const dueElement =
        modal.querySelector(
          "[data-position-total-due]"
        );

      const allocatedElement =
        modal.querySelector(
          "[data-position-allocated]"
        );

      const arrearsElement =
        modal.querySelector(
          "[data-position-arrears]"
        );

      const creditElement =
        modal.querySelector(
          "[data-position-credit]"
        );

      if (totalElement) {
        totalElement.textContent =
          "—";
      }

      if (dueElement) {
        dueElement.textContent =
          "—";
      }

      if (allocatedElement) {
        allocatedElement.textContent =
          "—";
      }

      if (arrearsElement) {
        arrearsElement.textContent =
          "—";
      }

      if (creditElement) {
        creditElement.textContent =
          "—";
      }

      const status =
        modal.querySelector(
          "[data-position-status]"
        );

      if (status) {
        status.innerHTML =
          contributionStatusHtml(
            null
          );
      }

      return null;
    }


    const totalAllocated =
      Number(
        position.total_allocated ?? 0
      );

    const totalDue =
      Number(
        position.total_due ?? 0
      );

    const arrears =
      Number(
        position.arrears ?? 0
      );

    const credit =
      Number(
        position.credit ?? 0
      );


    /*
     * DO NOT CALCULATE:
     *
     *     total_contributed =
     *       totalAllocated + credit
     *
     * The canonical RPC owns this value.
     *
     * If the RPC returns total_contributed it is used.
     * If it does not, the UI displays "—".
     */

    const normalizedPosition = {
      ...position,

      allocated:
        totalAllocated
    };


    const totalElement =
      modal.querySelector(
        "[data-position-total-contributed]"
      );

    const dueElement =
      modal.querySelector(
        "[data-position-total-due]"
      );

    const allocatedElement =
      modal.querySelector(
        "[data-position-allocated]"
      );

    const arrearsElement =
      modal.querySelector(
        "[data-position-arrears]"
      );

    const creditElement =
      modal.querySelector(
        "[data-position-credit]"
      );


    if (totalElement) {
      totalElement.textContent =
        position.total_contributed == null
          ? "—"
          : formatMoney(
              position.total_contributed
            );
    }

    if (dueElement) {
      dueElement.textContent =
        formatMoney(
          totalDue
        );
    }

    if (allocatedElement) {
      allocatedElement.textContent =
        formatMoney(
          totalAllocated
        );
    }

    if (arrearsElement) {
      arrearsElement.textContent =
        formatMoney(
          arrears
        );
    }

    if (creditElement) {
      creditElement.textContent =
        formatMoney(
          credit
        );
    }


    const status =
      modal.querySelector(
        "[data-position-status]"
      );

    if (status) {
      status.innerHTML =
        contributionStatusHtml(
          normalizedPosition
        );
    }


    contributionPositions.set(
      memberId,
      normalizedPosition
    );

    return normalizedPosition;

  } finally {

    setContributionPositionLoading(
      false
    );
  }
}


/* =========================================================
   OPEN MEMBER MODAL
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
      "Member could not be found."
    );

    return;
  }

  const modal =
    getMemberViewModal();

  if (!modal) {
    showError(
      "Member profile modal could not be found."
    );

    return;
  }

  ensureContributionPositionUI();

  ensureContributionPositionStyles();

  ensureContributionStatusStyles();


  const name =
    modal.querySelector(
      "[data-member-name]"
    ) ||
    byId(
      "viewMemberName"
    );

  if (name) {
    name.textContent =
      member.name ||
      "Member";
  }


  const number =
    modal.querySelector(
      "[data-member-number]"
    ) ||
    byId(
      "viewMemberNumber"
    );

  if (number) {
    number.textContent =
      member.member_number ||
      "—";
  }


  const details =
    modal.querySelector(
      "[data-member-profile]"
    );

  if (details) {

    details.innerHTML = `
      <div>
        <span>Member No</span>

        <strong>
          ${escapeHtml(
            member.member_number ||
            "—"
          )}
        </strong>
      </div>

      <div>
        <span>Membership</span>

        <strong>
          ${escapeHtml(
            member.membership_number ||
            member.member_number ||
            "—"
          )}
        </strong>
      </div>

      <div>
        <span>National ID</span>

        <strong>
          ${escapeHtml(
            member.national_id ||
            "—"
          )}
        </strong>
      </div>

      <div>
        <span>Phone</span>

        <strong>
          ${escapeHtml(
            member.phone ||
            "—"
          )}
        </strong>
      </div>

      <div>
        <span>Email</span>

        <strong>
          ${escapeHtml(
            member.email ||
            "—"
          )}
        </strong>
      </div>

      <div>
        <span>Role</span>

        <strong>
          ${escapeHtml(
            displayRole(
              member.role
            )
          )}
        </strong>
      </div>

      <div>
        <span>Actual Position</span>

        <strong>
          ${escapeHtml(
            formatActualPosition(
              member.actual_position
            )
          )}
        </strong>
      </div>

      ${
        normalizeActualPosition(
          member.actual_position
        ) === "other" &&
        member.actual_position_name
          ? `
            <div>
              <span>Position Name</span>

              <strong>
                ${escapeHtml(
                  member.actual_position_name
                )}
              </strong>
            </div>
          `
          : ""
      }

      <div>
        <span>Status</span>

        <strong>
          ${escapeHtml(
            String(
              member.status ||
              "active"
            )
          )}
        </strong>
      </div>

      <div>
        <span>Onboarding</span>

        <strong>
          ${escapeHtml(
            String(
              member.onboarding_status ||
              "pending"
            )
          )}
        </strong>
      </div>

      <div>
        <span>Login</span>

        <strong>
          ${escapeHtml(
            getLoginStatus(
              member
            ).label
          )}
        </strong>
      </div>

      <div>
        <span>Join Date</span>

        <strong>
          ${formatDate(
            member.join_date
          )}
        </strong>
      </div>

      <div>
        <span>Group</span>

        <strong>
          ${escapeHtml(
            currentGroup?.name ||
            "—"
          )}
        </strong>
      </div>
    `;
  }


  /* -------------------------------------------------------
     CONTRIBUTION RULES
     ------------------------------------------------------- */

  let rulesSection =
    modal.querySelector(
      "[data-member-contribution-rules]"
    );

  if (!rulesSection) {

    rulesSection =
      document.createElement(
        "section"
      );

    rulesSection.dataset.memberContributionRules =
      "true";

    rulesSection.innerHTML = `
      <h3>
        Contribution Rules
      </h3>

      <div data-member-rules-content>
      </div>
    `;

    const container =
      modal.querySelector(
        ".member-modal-body"
      ) ||
      modal.querySelector(
        ".modal-body"
      ) ||
      modal;

    container.appendChild(
      rulesSection
    );
  }


  const rulesContent =
    rulesSection.querySelector(
      "[data-member-rules-content]"
    );

  if (rulesContent) {
    rulesContent.innerHTML =
      memberRulesHtml(
        member.id
      );
  }


  /* -------------------------------------------------------
     POSITION CHANGE
     ------------------------------------------------------- */

  ensureMemberPositionChangeUI(
    member
  );


  /* -------------------------------------------------------
     RECONCILIATION BUTTON
     ------------------------------------------------------- */

  let reconcileButton =
    modal.querySelector(
      '[data-action="reconcile"]'
    );

  if (!reconcileButton) {

    reconcileButton =
      document.createElement(
        "button"
      );

    reconcileButton.type =
      "button";

    reconcileButton.dataset.action =
      "reconcile";

    reconcileButton.id =
      "reconcileHistoricalPayments";

    reconcileButton.textContent =
      "Reconcile Historical Contributions";

    const actions =
      modal.querySelector(
        ".modal-actions"
      ) ||
      modal.querySelector(
        ".member-modal-actions"
      );

    if (actions) {
      actions.appendChild(
        reconcileButton
      );
    } else {
      modal.appendChild(
        reconcileButton
      );
    }
  }

  reconcileButton.dataset.memberId =
    member.id;


  modal.hidden =
    false;

  modal.classList.add(
    "open"
  );

  modal.style.display =
    "";


  const closeButton =
    byId(
      "closeMemberModal"
    );

  if (closeButton) {
    try {
      closeButton.focus();
    } catch {
      /* Focus is non-critical. */
    }
  }


  await loadMemberContributionPosition(
    member.id
  );
}


/* =========================================================
   CLOSE MEMBER MODAL
   ========================================================= */

function closeMemberModal() {
  const modal =
    getMemberViewModal();

  if (!modal) {
    return;
  }

  /*
   * Prevent focus remaining inside a hidden dialog.
   */

  const active =
    document.activeElement;

  if (
    active &&
    modal.contains(active) &&
    typeof active.blur ===
      "function"
  ) {
    active.blur();
  }

  modal.hidden =
    true;

  modal.style.display =
    "none";

  modal.classList.remove(
    "open"
  );

  modal.classList.remove(
    "modal-open"
  );
}


/* =========================================================
   SEARCH
   ========================================================= */

function filterMembers(value) {
  const query =
    String(value || "")
      .trim()
      .toLowerCase();

  if (!query) {
    renderMembers();

    updateMemberCount();

    return;
  }

  const filtered =
    members.filter(
      member => {

        const haystack = [
          member.name,
          member.member_number,
          member.membership_number,
          member.national_id,
          member.phone,
          member.email,
          member.role,
          member.actual_position,
          member.actual_position_name,
          member.status,
          member.onboarding_status
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(
          query
        );
      }
    );

  const original =
    members;

  members =
    filtered;

  renderMembers();

  updateMemberCount();

  members =
    original;
}


/* =========================================================
   MEMBER ACTION DELEGATION
   ---------------------------------------------------------
   Defensive + promise-safe.

   No unhandled rejected promise may escape an event handler.
   ========================================================= */

async function handleMemberAction(
  event
) {
  try {

    const target =
      event.target?.closest?.(
        "[data-action]"
      );

    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const action =
      target.dataset.action;

    const memberId =
      target.dataset.memberId ||
      target.closest(
        "[data-member-id]"
      )?.dataset.memberId;

    if (
      !memberId &&
      action !== "close"
    ) {
      showError(
        "The member action is missing a member ID."
      );

      return;
    }


    switch (action) {

      case "view":
        await openMemberModal(
          memberId
        );
        break;


      case "edit":
        await openEditMember(
          memberId
        );
        break;


      case "invite":
        await sendMemberInvitation(
          memberId,
          false
        );
        break;


      case "reconcile":
        await handleHistoricalReconciliation(
          memberId
        );
        break;


      case "save-position":
        await handlePositionChange(
          memberId
        );
        break;


      case "close":
        closeMemberModal();
        break;


      default:
        break;
    }

  } catch (error) {

    console.error(
      "Member action failed:",
      error
    );

    showError(
      error?.message ||
      "The requested member action could not be completed."
    );
  }
}


/* =========================================================
   EVENT BINDING
   ========================================================= */

function bindEvents() {

  if (eventsBound) {
    return;
  }

  eventsBound =
    true;


  /* -------------------------------------------------------
     ADD MEMBER
     ------------------------------------------------------- */

  const addButton =
    byId(
      "addMemberButton"
    ) ||
    byId(
      "addMember"
    );

  addButton?.addEventListener(
    "click",
    openAddMember
  );


  /* -------------------------------------------------------
     CLOSE FORM
     ------------------------------------------------------- */

  const closeButton =
    byId(
      "closeAddMember"
    ) ||
    byId(
      "closeMemberForm"
    );

  closeButton?.addEventListener(
    "click",
    closeAddMember
  );


  /* -------------------------------------------------------
     CANCEL FORM
     ------------------------------------------------------- */

  const cancelButton =
    byId(
      "cancelAddMember"
    ) ||
    byId(
      "cancelMember"
    ) ||
    byId(
      "cancelMemberForm"
    );

  cancelButton?.addEventListener(
    "click",
    closeAddMember
  );


  /* -------------------------------------------------------
     FORM
     ------------------------------------------------------- */

  const form =
    byId(
      "addMemberForm"
    ) ||
    byId(
      "memberForm"
    );

  form?.addEventListener(
    "submit",
    event => {
      void saveMember(event)
        .catch(error => {
          console.error(
            "Member form submission failed:",
            error
          );

          showError(
            error?.message ||
            "Unable to save the member."
          );
        });
    }
  );


  /* -------------------------------------------------------
     ACTUAL POSITION
     ------------------------------------------------------- */

  const actualPosition =
    byId(
      "memberActualPosition"
    );

  actualPosition?.addEventListener(
    "change",
    updateActualPositionNameUI
  );


  /* -------------------------------------------------------
     MEMBER NUMBER → MEMBERSHIP NUMBER
     ------------------------------------------------------- */

  const memberNumber =
    byId(
      "memberNumber"
    );

  const membershipNumber =
    byId(
      "memberMembershipNumber"
    );

  memberNumber?.addEventListener(
    "input",
    () => {

      if (
        editingMemberId ||
        !membershipNumber
      ) {
        return;
      }

      if (
        !membershipNumber.value
      ) {
        membershipNumber.value =
          memberNumber.value;
      }
    }
  );


  /* -------------------------------------------------------
     SEARCH
     ------------------------------------------------------- */

  const search =
    byId(
      "memberSearch"
    ) ||
    byId(
      "searchMembers"
    );

  search?.addEventListener(
    "input",
    event => {

      clearTimeout(
        memberSearchTimer
      );

      memberSearchTimer =
        setTimeout(
          () => {

            filterMembers(
              event.target.value
            );

          },
          120
        );
    }
  );


  const clearSearch =
    byId(
      "clearMemberSearch"
    );

  clearSearch?.addEventListener(
    "click",
    () => {

      if (search) {
        search.value =
          "";
      }

      filterMembers(
        ""
      );
    }
  );


  /* -------------------------------------------------------
     MEMBER TABLE
     ------------------------------------------------------- */

  const tableBody =
    byId(
      "memberRows"
    ) ||
    byId(
      "membersTableBody"
    ) ||
    byId(
      "membersBody"
    );

  tableBody?.addEventListener(
    "click",
    event => {
      void handleMemberAction(
        event
      );
    }
  );


  /* -------------------------------------------------------
     MEMBER CARDS
     ------------------------------------------------------- */

  const cards =
    byId(
      "memberCards"
    ) ||
    byId(
      "membersCards"
    ) ||
    byId(
      "membersCardGrid"
    );

  cards?.addEventListener(
    "click",
    event => {
      void handleMemberAction(
        event
      );
    }
  );


  /* -------------------------------------------------------
     VIEW MODAL
     ------------------------------------------------------- */

  const modal =
    getMemberViewModal();

  modal?.addEventListener(
    "click",
    event => {

      const actionTarget =
        event.target?.closest?.(
          "[data-action]"
        );

      if (actionTarget) {
        void handleMemberAction(
          event
        );

        return;
      }

      if (
        event.target === modal
      ) {
        closeMemberModal();
      }
    }
  );


  /* -------------------------------------------------------
     MODAL CLOSE BUTTONS
     -------------------------------------------------------
     All supported close controls use the same canonical
     closeMemberModal() function.

       [data-member-modal-close]
       #closeMemberModal
       #closeMemberModalFooter
     ------------------------------------------------------- */

  const closeModalButtons =
    document.querySelectorAll(
      [
        "[data-member-modal-close]",
        "#closeMemberModal",
        "#closeMemberModalFooter"
      ].join(",")
    );

  closeModalButtons.forEach(
    button => {

      button.addEventListener(
        "click",
        event => {

          event.preventDefault();
          event.stopPropagation();

          closeMemberModal();
        }
      );

    }
  );


  /* -------------------------------------------------------
     HISTORICAL ENABLED
     ------------------------------------------------------- */

  const historical =
    byId(
      "memberHistoricalEnabled"
    );

  historical?.addEventListener(
    "change",
    updateHistoricalControls
  );


  /* -------------------------------------------------------
     PAID THROUGH
     ------------------------------------------------------- */

  const paidThrough =
    byId(
      "memberHistoricalPaidThrough"
    );

  paidThrough?.addEventListener(
    "change",
    updateHistoricalPreview
  );


  /* -------------------------------------------------------
     PAYMENT METHOD
     ------------------------------------------------------- */

  const paymentMethod =
    byId(
      "memberHistoricalPaymentMethod"
    );

  paymentMethod?.addEventListener(
    "change",
    updateHistoricalPreview
  );


  /*
   * IMPORTANT:
   *
   * There is intentionally NO second
   * memberContributionAmount input listener here.
   *
   * ensureContributionUI() owns that listener.
   */


  /* -------------------------------------------------------
     JOIN DATE
     ------------------------------------------------------- */

  const joinDate =
    byId(
      "memberJoinDate"
    );

  joinDate?.addEventListener(
    "change",
    () => {

      const effective =
        byId(
          "memberContributionEffectiveFrom"
        );

      const positionEffective =
        byId(
          "memberActualPositionEffectiveFrom"
        );

      if (
        effective &&
        !editingMemberId
      ) {
        effective.value =
          joinDate.value;
      }

      if (
        positionEffective &&
        !editingMemberId
      ) {
        positionEffective.value =
          joinDate.value;
      }

      updateHistoricalPreview();
    }
  );


  /* -------------------------------------------------------
     EFFECTIVE DATE
     ------------------------------------------------------- */

  const effectiveDate =
    byId(
      "memberContributionEffectiveFrom"
    );

  effectiveDate?.addEventListener(
    "change",
    updateHistoricalPreview
  );


  /* -------------------------------------------------------
     ESCAPE
     ------------------------------------------------------- */

  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key !==
        "Escape"
      ) {
        return;
      }

      closeMemberModal();

      closeAddMember();
    }
  );
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function init() {

  if (initialized) {
    return;
  }

  initialized =
    true;

  try {

    clearError();


    /* -----------------------------------------------------
       AUTH
       ----------------------------------------------------- */

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
        "Your group could not be determined."
      );
    }


    /* -----------------------------------------------------
       GROUP NAME
       ----------------------------------------------------- */

    const groupNameElements =
      document.querySelectorAll(
        "[data-group-name]"
      );

    groupNameElements.forEach(
      element => {

        element.textContent =
          currentGroup?.name ||
          "—";

      }
    );


    /* -----------------------------------------------------
       UI
       ----------------------------------------------------- */

    ensureNationalIdUI();

    ensureContributionUI();

    ensureContributionStatusStyles();

    ensureContributionPositionStyles();

    updateActualPositionNameUI();


    /* -----------------------------------------------------
       EVENTS
       ----------------------------------------------------- */

    bindEvents();


    /* -----------------------------------------------------
       CONTRIBUTION TYPE
       ----------------------------------------------------- */

    await loadMonthlyContributionType();


    /* -----------------------------------------------------
       MEMBERS
       ----------------------------------------------------- */

    await loadMembers();


    /* -----------------------------------------------------
       CONTRIBUTION RULES
       ----------------------------------------------------- */

    await loadMemberContributionRules();


    /* -----------------------------------------------------
       CONTRIBUTION POSITIONS
       ----------------------------------------------------- */

    await loadMemberContributionPositions();


    /* -----------------------------------------------------
       RENDER
       ----------------------------------------------------- */

    renderMembers();

    updateMemberCount();


    /* -----------------------------------------------------
       PREVIEWS
       ----------------------------------------------------- */

    updateContributionPreview();

    updateHistoricalControls();

    updateActualPositionNameUI();


    /* -----------------------------------------------------
       STATUS
       ----------------------------------------------------- */

    showStatus("");

  } catch (error) {

    initialized =
      false;

    console.error(
      "members.js initialization failed:",
      error
    );

    showError(
      error?.message ||
      "Unable to load members."
    );
  }
}
/* =========================================================
   REFRESH
   ========================================================= */

export async function refreshMembers() {

  await loadMembers();

  await loadMemberContributionRules();

  await loadMemberContributionPositions();

  renderMembers();

  updateMemberCount();
}


/* =========================================================
   PAGE LAYOUT CONTRACT
   ---------------------------------------------------------
   Admin layout loads:

     members.html → ./members.js → init

   refreshMembers remains publicly available for explicit
   refreshes from the page/application.
   ========================================================= */

export {
  init
};


/* =========================================================
   READY
   ========================================================= */

console.log(
  "CHAMA LIVE: members.js ready"
);

