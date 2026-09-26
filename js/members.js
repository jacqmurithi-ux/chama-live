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

   Existing-member historical accounting MUST NOT call
   create_member_with_historical_contributions(), because
   that function creates a new member.

   ---------------------------------------------------------
   CURRENT ACCOUNTING CONTRACT
   ---------------------------------------------------------
   Creation:
     create_member_with_contribution_plan()
     create_member_with_historical_contributions()

   Position:
     get_member_contribution_position()

   Existing payment reconciliation:
     reconcile_member_historical_payments()

   Existing-member historical onboarding/edit:
     DO NOT invent an RPC here.
     The database function must be verified before wiring it.
   ========================================================= */

import { supabase } from "./supabase.js";

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
  if (!value) return "—";

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

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function getInitials(name) {
  const value = String(name || "").trim();

  if (!value) return "?";

  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join("");
}


function displayRole(role) {
  const value = String(role || "member").toLowerCase();

  if (value === "admin") return "Admin";
  if (value === "treasurer") return "Treasurer";
  if (value === "secretary") return "Secretary";

  return "Member";
}


function roleBadgeHtml(role) {
  return `
    <span class="role-badge role-${escapeHtml(
      String(role || "member").toLowerCase()
    )}">
      ${escapeHtml(displayRole(role))}
    </span>
  `;
}


function accountStatusHtml(status) {
  const value = String(status || "active").toLowerCase();

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

  if (!member.email) {
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
  const status = getLoginStatus(member);

  return `
    <span class="login-status login-status-${escapeHtml(status.key)}">
      ${escapeHtml(status.label)}
    </span>
  `;
}


/* =========================================================
   CONTRIBUTION STATUS
   ========================================================= */

function contributionStatusKey(position) {
  if (!position) return "unknown";

  const credit = Number(position.credit || 0);
  const arrears = Number(position.arrears || 0);

  if (credit > 0 && arrears <= 0) {
    return "credit";
  }

  if (arrears > 0) {
    return "arrears";
  }

  return "up-to-date";
}


function contributionStatusLabel(position) {
  const key = contributionStatusKey(position);

  if (key === "credit") return "Credit";
  if (key === "arrears") return "Arrears";

  if (key === "up-to-date") {
    return "Up to Date";
  }

  return "Unknown";
}


function contributionStatusHtml(position) {
  const key = contributionStatusKey(position);

  return `
    <span class="contribution-status contribution-status-${escapeHtml(key)}">
      ${escapeHtml(contributionStatusLabel(position))}
    </span>
  `;
}


/* =========================================================
   CONTRIBUTION POSITION
   ========================================================= */

async function loadMemberContributionPositions() {
  contributionPositions = new Map();
  contributionPositionsLoaded = false;

  if (!members.length) {
    contributionPositionsLoaded = true;
    return;
  }

  for (const member of members) {
    try {
      const { data, error } = await supabase.rpc(
        "get_member_contribution_position",
        {
          p_member_id: member.id
        },
        {
          get: true
        }
      );

      if (error) {
        console.warn(
          "Contribution position failed for member:",
          member.id,
          error
        );
        continue;
      }

      const position = Array.isArray(data)
        ? data[0] || null
        : data || null;

      if (position) {
        contributionPositions.set(member.id, position);
      }
    } catch (error) {
      console.warn(
        "Contribution position exception:",
        member.id,
        error
      );
    }
  }

  contributionPositionsLoaded = true;
}


/* =========================================================
   HEADER / STYLE HELPERS
   ========================================================= */

function ensureContributionStatusHeader() {
  const table = document.querySelector("table");

  if (!table) return;

  const headerRow = table.querySelector("thead tr");

  if (!headerRow) return;

  if (
    headerRow.querySelector(
      '[data-column="contribution-status"]'
    )
  ) {
    return;
  }

  const th = document.createElement("th");

  th.dataset.column = "contribution-status";
  th.textContent = "Contribution Status";

  headerRow.appendChild(th);
}


function ensureContributionStatusStyles() {
  if (byId("membersContributionStatusStyles")) {
    return;
  }

  const style = document.createElement("style");

  style.id = "membersContributionStatusStyles";

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
      background: rgba(22, 163, 74, .12);
      color: #15803d;
    }

    .contribution-status-arrears {
      background: rgba(220, 38, 38, .12);
      color: #b91c1c;
    }

    .contribution-status-up-to-date {
      background: rgba(37, 99, 235, .12);
      color: #1d4ed8;
    }

    .contribution-status-unknown {
      background: rgba(107, 114, 128, .12);
      color: #4b5563;
    }
  `;

  document.head.appendChild(style);
}


/* =========================================================
   MESSAGES
   ========================================================= */

function showStatus(message) {
  const element =
    byId("membersStatus") ||
    byId("statusMessage") ||
    byId("pageStatus");

  if (!element) return;

  element.textContent = message || "";
  element.hidden = !message;
}


function showError(message) {
  const element =
    byId("membersError") ||
    byId("errorMessage") ||
    byId("pageError");

  if (!element) {
    console.error(message);
    return;
  }

  element.textContent = message || "Something went wrong.";
  element.hidden = false;
}


function clearError() {
  const element =
    byId("membersError") ||
    byId("errorMessage") ||
    byId("pageError");

  if (!element) return;

  element.textContent = "";
  element.hidden = true;
}


function showFormMessage(message, type = "info") {
  const element =
    byId("memberFormMessage") ||
    byId("formMessage");

  if (!element) return;

  element.textContent = message || "";
  element.dataset.type = type;
  element.hidden = !message;
}


function clearFormMessage() {
  const element =
    byId("memberFormMessage") ||
    byId("formMessage");

  if (!element) return;

  element.textContent = "";
  element.hidden = true;
  delete element.dataset.type;
}


/* =========================================================
   MEMBER HELPERS
   ========================================================= */

function findMember(memberId) {
  if (!memberId) return null;

  return members.find(
    member => String(member.id) === String(memberId)
  ) || null;
}


function formatMoney(value) {
  const amount = Number(value || 0);

  return `KSh ${amount.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}


/* =========================================================
   NATIONAL ID UI
   ========================================================= */

function ensureNationalIdUI() {
  const input = byId("memberNationalId");

  if (!input) return;

  input.setAttribute("autocomplete", "off");
}


/* =========================================================
   CONTRIBUTION UI
   ========================================================= */

function ensureContributionUI() {
  const form = byId("memberForm");

  if (!form) return;

  const amount = byId("memberContributionAmount");

  if (amount) {
    amount.addEventListener("input", updateContributionPreview);
  }
}


/* =========================================================
   CONTRIBUTION TYPE
   ========================================================= */

async function loadMonthlyContributionType() {
  if (!groupId) {
    monthlyContributionType = null;
    contributionTypesLoaded = true;
    return;
  }

  const { data, error } = await supabase
    .from("contribution_types")
    .select("*")
    .eq("group_id", groupId);

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];

  const activeRows = rows.filter(row => {
    if (!Object.prototype.hasOwnProperty.call(row, "is_active")) {
      return true;
    }

    return row.is_active !== false;
  });

  monthlyContributionType =
    activeRows.find(row =>
      String(row.name || "").trim().toLowerCase() === "monthly"
    ) ||
    activeRows.find(row =>
      String(row.type_name || "").trim().toLowerCase() === "monthly"
    ) ||
    activeRows.find(row =>
      String(row.code || "").trim().toLowerCase() === "monthly"
    ) ||
    activeRows[0] ||
    null;

  contributionTypesLoaded = true;

  if (!monthlyContributionType) {
    throw new Error(
      "The group's Monthly contribution type could not be found."
    );
  }
}


/* =========================================================
   CONTRIBUTION PREVIEW
   ========================================================= */

function updateContributionPreview() {
  const amountInput = byId("memberContributionAmount");

  const preview =
    byId("memberContributionPreview") ||
    byId("contributionPreview");

  if (!preview) return;

  const amount = Number(amountInput?.value || 0);

  preview.textContent =
    `Monthly contribution ${formatMoney(amount)}`;
}


/* =========================================================
   HISTORICAL CONTROLS
   ========================================================= */

function updateHistoricalControls() {
  const enabledInput = byId("memberHistoricalEnabled");

  const controls =
    document.querySelector(
      '[data-historical-controls]'
    ) ||
    byId("historicalContributionControls");

  if (!enabledInput) return;

  const enabled = Boolean(enabledInput.checked);

  if (controls) {
    controls.hidden = !enabled;
  }

  const paidThrough = byId("memberHistoricalPaidThrough");
  const paymentMethod = byId("memberHistoricalPaymentMethod");

  if (paidThrough) {
    paidThrough.disabled = !enabled;
  }

  if (paymentMethod) {
    paymentMethod.disabled = !enabled;
  }

  updateHistoricalPreview();
}


function updateHistoricalPreview() {
  const preview =
    byId("memberHistoricalPreview") ||
    byId("historicalPreview");

  if (!preview) return;

  const enabledInput = byId("memberHistoricalEnabled");

  if (!enabledInput?.checked) {
    preview.textContent = "";
    return;
  }

  const joinDate =
    byId("memberJoinDate")?.value || "";

  const paidThrough =
    byId("memberHistoricalPaidThrough")?.value || "";

  const amount =
    Number(byId("memberContributionAmount")?.value || 0);

  if (!joinDate || !paidThrough || amount <= 0) {
    preview.textContent = "";
    return;
  }

  const start = new Date(`${joinDate}T00:00:00`);
  const end = new Date(`${paidThrough}T00:00:00`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  ) {
    preview.textContent = "";
    return;
  }

  let months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    1;

  if (months < 0) months = 0;

  preview.textContent =
    `${months} historical month${months === 1 ? "" : "s"} · ` +
    `${formatMoney(months * amount)}`;
}
/* =========================================================
   FORM VALUES
   ========================================================= */

function getFormValues() {
  return {
    member_number:
      byId("memberNumber")?.value?.trim() || "",

    name:
      byId("memberName")?.value?.trim() || "",

    national_id:
      byId("memberNationalId")?.value?.trim() || "",

    phone:
      byId("memberPhone")?.value?.trim() || "",

    email:
      byId("memberEmail")?.value?.trim() || "",

    role:
      byId("memberRole")?.value || "member",

    status:
      byId("memberStatus")?.value || "active",

    join_date:
      byId("memberJoinDate")?.value || "",

    contribution_amount:
      Number(
        byId("memberContributionAmount")?.value || 0
      ),

    first_period_rule:
      byId("memberFirstPeriodRule")?.value ||
      "full_period",

    contribution_effective_from:
      byId("memberContributionEffectiveFrom")?.value || "",

    historical_enabled:
      Boolean(
        byId("memberHistoricalEnabled")?.checked
      ),

    historical_paid_through:
      byId("memberHistoricalPaidThrough")?.value || "",

    historical_payment_method:
      byId("memberHistoricalPaymentMethod")?.value || "cash"
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

  /*
   * IMPORTANT:
   *
   * Existing-member edits must NOT bypass validation merely
   * because the profile fields are being edited.
   *
   * However, accounting-changing historical edits cannot be
   * submitted until a verified backend accounting RPC exists.
   */
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

  if (
    !Number.isFinite(values.contribution_amount) ||
    values.contribution_amount < 0
  ) {
    return "Monthly contribution must be zero or greater.";
  }

  if (!monthlyContributionType) {
    return (
      "The group's Monthly contribution type could not be found."
    );
  }

  if (!values.join_date) {
    return "Join date is required.";
  }

  if (!values.contribution_effective_from) {
    values.contribution_effective_from =
      values.join_date;
  }

  if (values.historical_enabled) {
    if (!values.historical_paid_through) {
      return "Paid Through date is required.";
    }

    if (!values.historical_payment_method) {
      return "Historical payment method is required.";
    }

    if (
      values.historical_paid_through <
      values.join_date
    ) {
      return "Paid Through cannot be before the join date.";
    }
  }

  return true;
}


/* =========================================================
   DUPLICATE MEMBER NUMBER
   ========================================================= */

async function checkDuplicateMemberNumber(memberNumber) {
  if (!groupId || !memberNumber) {
    return false;
  }

  let query = supabase
    .from("members")
    .select("id")
    .eq("group_id", groupId)
    .eq("member_number", memberNumber);

  if (editingMemberId) {
    query = query.neq("id", editingMemberId);
  }

  const { data, error } = await query.limit(1);

  if (error) {
    throw error;
  }

  return Boolean(data && data.length);
}


/* =========================================================
   LOAD MEMBERS
   ========================================================= */

async function loadMembers() {
  if (!groupId) {
    members = [];
    return;
  }

  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("group_id", groupId)
    .order("member_number", {
      ascending: true,
      nullsFirst: false
    });

  if (error) {
    throw error;
  }

  members = Array.isArray(data) ? data : [];
}


/* =========================================================
   CONTRIBUTION RESULT MESSAGE
   ========================================================= */

function contributionResultMessage(result) {
  if (!result) return "";

  if (typeof result === "string") {
    return result;
  }

  const status = String(
    result.status ||
    result.contribution_status ||
    ""
  ).toLowerCase();

  if (status === "credit") {
    return `Member created with credit ${formatMoney(
      result.credit
    )}.`;
  }

  if (status === "arrears") {
    return `Member created with arrears ${formatMoney(
      result.arrears
    )}.`;
  }

  if (status === "up_to_date") {
    return "Member created and contribution position is up to date.";
  }

  return "Member created successfully.";
}


/* =========================================================
   MEMBER ROW
   ========================================================= */

function createMemberRow(member) {
  const position =
    contributionPositions.get(member.id) || null;

  const tr = document.createElement("tr");

  tr.dataset.memberId = member.id;

  tr.innerHTML = `
    <td>
      <div class="member-identity">
        <div class="member-avatar">
          ${escapeHtml(getInitials(member.name))}
        </div>

        <div>
          <div class="member-name">
            ${escapeHtml(member.name)}
          </div>

          <div class="member-number">
            ${escapeHtml(member.member_number || "—")}
          </div>
        </div>
      </div>
    </td>

    <td>
      ${escapeHtml(member.phone || "—")}
    </td>

    <td>
      ${roleBadgeHtml(member.role)}
    </td>

    <td>
      ${accountStatusHtml(member.status)}
    </td>

    <td>
      ${loginStatusHtml(member)}
    </td>

    <td data-column="contribution-status">
      ${contributionStatusHtml(position)}
    </td>

    <td>
      ${formatMoney(
        position?.credit ||
        0
      )}
    </td>

    <td>
      <div class="member-actions">
        <button
          type="button"
          data-action="view"
          data-member-id="${escapeHtml(member.id)}"
        >
          View
        </button>

        <button
          type="button"
          data-action="edit"
          data-member-id="${escapeHtml(member.id)}"
        >
          Edit
        </button>

        ${
          member.email
            ? `
              <button
                type="button"
                data-action="invite"
                data-member-id="${escapeHtml(member.id)}"
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
    contributionPositions.get(member.id) || null;

  const card = document.createElement("article");

  card.className = "member-card";
  card.dataset.memberId = member.id;

  card.innerHTML = `
    <div class="member-card-header">
      <div class="member-identity">
        <div class="member-avatar">
          ${escapeHtml(getInitials(member.name))}
        </div>

        <div>
          <h3>
            ${escapeHtml(member.name)}
          </h3>

          <p>
            ${escapeHtml(member.member_number || "—")}
          </p>
        </div>
      </div>

      ${accountStatusHtml(member.status)}
    </div>

    <div class="member-card-body">
      <div>
        <span>Phone</span>
        <strong>
          ${escapeHtml(member.phone || "—")}
        </strong>
      </div>

      <div>
        <span>Role</span>
        <strong>
          ${escapeHtml(displayRole(member.role))}
        </strong>
      </div>

      <div>
        <span>Login</span>
        <strong>
          ${escapeHtml(getLoginStatus(member).label)}
        </strong>
      </div>

      <div>
        <span>Contribution</span>
        <strong>
          ${escapeHtml(
            contributionStatusLabel(position)
          )}
        </strong>
      </div>

      <div>
        <span>Credit</span>
        <strong>
          ${formatMoney(position?.credit || 0)}
        </strong>
      </div>
    </div>

    <div class="member-card-actions">
      <button
        type="button"
        data-action="view"
        data-member-id="${escapeHtml(member.id)}"
      >
        View
      </button>

      <button
        type="button"
        data-action="edit"
        data-member-id="${escapeHtml(member.id)}"
      >
        Edit
      </button>

      ${
        member.email
          ? `
            <button
              type="button"
              data-action="invite"
              data-member-id="${escapeHtml(member.id)}"
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
    byId("membersTableBody") ||
    byId("membersBody");

  const cards =
    byId("membersCards") ||
    byId("membersCardGrid");

  if (tableBody) {
    tableBody.innerHTML = "";

    for (const member of members) {
      tableBody.appendChild(
        createMemberRow(member)
      );
    }
  }

  if (cards) {
    cards.innerHTML = "";

    for (const member of members) {
      cards.appendChild(
        createMemberCard(member)
      );
    }
  }

  ensureContributionStatusHeader();
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
        String(member.status || "")
          .toLowerCase() === "active"
    ).length;

  const totalElement =
    byId("totalMembers") ||
    byId("memberCount");

  const activeElement =
    byId("activeMembers");

  if (totalElement) {
    totalElement.textContent = String(total);
  }

  if (activeElement) {
    activeElement.textContent = String(active);
  }
}
/* =========================================================
   OPEN ADD MEMBER
   ========================================================= */

function openAddMember() {
  editingMemberId = null;

  clearFormMessage();
  clearError();

  const panel =
    byId("memberFormPanel") ||
    byId("addMemberPanel");

  const title =
    byId("memberFormTitle") ||
    byId("formTitle");

  const description =
    byId("memberFormDescription") ||
    byId("formDescription");

  if (title) {
    title.textContent = "Add Member";
  }

  if (description) {
    description.textContent =
      "Create a member and configure their contribution plan.";
  }

  const form = byId("memberForm");

  if (form) {
    form.reset();
  }

  const status = byId("memberStatus");

  if (status) {
    status.value = "active";
  }

  const role = byId("memberRole");

  if (role) {
    role.value = "member";
  }

  const amount = byId("memberContributionAmount");

  if (amount && currentGroup) {
    amount.value =
      Number(currentGroup.monthly_contribution || 0);
  }

  const joinDate = byId("memberJoinDate");

  if (joinDate) {
    joinDate.value = getToday();
  }

  const effectiveDate =
    byId("memberContributionEffectiveFrom");

  if (effectiveDate) {
    effectiveDate.value =
      joinDate?.value || getToday();
  }

  const historical = byId("memberHistoricalEnabled");

  if (historical) {
    historical.checked = false;
  }

  updateHistoricalControls();
  updateContributionPreview();

  if (panel) {
    panel.hidden = false;
    panel.classList.add("open");
  }
}


/* =========================================================
   CLOSE ADD/EDIT
   ========================================================= */

function closeAddMember() {
  const panel =
    byId("memberFormPanel") ||
    byId("addMemberPanel");

  if (panel) {
    panel.hidden = true;
    panel.classList.remove("open");
  }

  editingMemberId = null;

  clearFormMessage();
}


/* =========================================================
   SAVE MEMBER
   ========================================================= */

async function saveMember(event) {
  event?.preventDefault();

  clearError();
  clearFormMessage();

  const values = getFormValues();

  const validation = validateForm(values);

  if (validation !== true) {
    showFormMessage(validation, "error");
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

    /*
     * -------------------------------------------------------
     * EXISTING MEMBER
     * -------------------------------------------------------
     *
     * This path intentionally updates profile fields only.
     *
     * It MUST NOT pretend that historical contribution setup
     * has been recorded when no verified canonical accounting
     * RPC exists.
     */
    if (editingMemberId) {
      const { error } = await supabase
        .from("members")
        .update({
          member_number: values.member_number,
          name: values.name,
          national_id: values.national_id,
          phone: values.phone,
          email: values.email || null,
          role: values.role,
          status: values.status,
          join_date: values.join_date || null
        })
        .eq("id", editingMemberId)
        .eq("group_id", groupId);

      if (error) {
        throw error;
      }

      await loadMembers();
      await loadMemberContributionPositions();

      renderMembers();
      updateMemberCount();

      showStatus(
        "Member details updated. No historical accounting entries were changed."
      );

      closeAddMember();

      return;
    }


    /* -------------------------------------------------------
       NEW MEMBER — CANONICAL ACCOUNTING FLOW
       ------------------------------------------------------- */

    let result = null;

    if (values.historical_enabled) {
      const { data, error } = await supabase.rpc(
        "create_member_with_historical_contributions",
        {
          p_member: {
            group_id: groupId,
            member_number: values.member_number,
            name: values.name,
            national_id: values.national_id,
            phone: values.phone,
            email: values.email || null,
            role: values.role,
            status: values.status,
            join_date: values.join_date
          },

          p_contribution_rule: {
            contribution_type_id:
              monthlyContributionType?.id || null,

            amount:
              values.contribution_amount,

            first_period_rule:
              values.first_period_rule,

            effective_from:
              values.contribution_effective_from
          },

          p_historical: {
            enabled: true,

            paid_through:
              values.historical_paid_through,

            payment_method:
              values.historical_payment_method
          },

          p_idempotency_key:
            crypto.randomUUID()
        }
      );

      if (error) {
        throw error;
      }

      result = data;
    } else {
      const { data, error } = await supabase.rpc(
        "create_member_with_contribution_plan",
        {
          p_member: {
            group_id: groupId,
            member_number: values.member_number,
            name: values.name,
            national_id: values.national_id,
            phone: values.phone,
            email: values.email || null,
            role: values.role,
            status: values.status,
            join_date: values.join_date
          },

          p_contribution_rule: {
            contribution_type_id:
              monthlyContributionType?.id || null,

            amount:
              values.contribution_amount,

            first_period_rule:
              values.first_period_rule,

            effective_from:
              values.contribution_effective_from
          },

          p_idempotency_key:
            crypto.randomUUID()
        }
      );

      if (error) {
        throw error;
      }

      result = data;
    }

    await loadMembers();
    await loadMemberContributionPositions();

    renderMembers();
    updateMemberCount();

    showStatus(
      contributionResultMessage(result)
    );

    closeAddMember();

    try {
      sessionStorage.setItem(
        "chamaLiveMemberOnboardingCompleted",
        JSON.stringify({
          memberId:
            Array.isArray(result)
              ? result[0]?.member_id || result[0]?.id
              : result?.member_id || result?.id,

          groupId,

          completedAt:
            new Date().toISOString()
        })
      );
    } catch {
      // Non-critical.
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

  const { data, error } = await supabase.rpc(
    "reconcile_member_historical_payments",
    {
      p_member_id: memberId,
      p_through_date: throughDate || null
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
  const member = findMember(memberId);

  if (!member) {
    showError("Member could not be found.");
    return;
  }

  const confirmed = window.confirm(
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
    await loadMemberContributionPositions();

    renderMembers();
    updateMemberCount();

    showStatus(
      result?.message ||
      "Historical payments reconciled successfully."
    );

    await openMemberModal(member.id);

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
   INVITATION
   ========================================================= */

async function sendMemberInvitation(
  memberId,
  reopenModal = false
) {
  const member = findMember(memberId);

  if (!member) {
    showError("Member could not be found.");
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

    const { data, error } =
      await supabase.functions.invoke(
        "send-member-invitation",
        {
          body: {
            member_id: member.id
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

    if (reopenModal) {
      await openMemberModal(member.id);
    }

  } catch (error) {
    console.error(
      "sendMemberInvitation failed:",
      error
    );

    showError(
      error?.message ||
      "Unable to send member invitation."
    );
  }
}


/* =========================================================
   EDIT MEMBER
   ========================================================= */

async function openEditMember(memberId) {
  const member = findMember(memberId);

  if (!member) {
    showError("Member could not be found.");
    return;
  }

  editingMemberId = member.id;

  clearError();
  clearFormMessage();

  const title =
    byId("memberFormTitle") ||
    byId("formTitle");

  const description =
    byId("memberFormDescription") ||
    byId("formDescription");

  if (title) {
    title.textContent = "Edit Member";
  }

  if (description) {
    description.textContent =
      "Update member details. Historical accounting remains protected by the canonical accounting workflow.";
  }

  const fields = {
    memberNumber: member.member_number || "",
    memberName: member.name || "",
    memberNationalId: member.national_id || "",
    memberPhone: member.phone || "",
    memberEmail: member.email || "",
    memberRole: member.role || "member",
    memberStatus: member.status || "active",
    memberJoinDate: member.join_date || ""
  };

  for (const [id, value] of Object.entries(fields)) {
    const element = byId(id);

    if (element) {
      element.value = value;
    }
  }

  /*
   * Existing-member accounting fields are not presented as
   * if they can safely modify canonical accounting.
   */
  const contributionAmount =
    byId("memberContributionAmount");

  const firstPeriod =
    byId("memberFirstPeriodRule");

  const effectiveFrom =
    byId("memberContributionEffectiveFrom");

  const historicalEnabled =
    byId("memberHistoricalEnabled");

  if (contributionAmount) {
    contributionAmount.disabled = true;
  }

  if (firstPeriod) {
    firstPeriod.disabled = true;
  }

  if (effectiveFrom) {
    effectiveFrom.disabled = true;
  }

  if (historicalEnabled) {
    historicalEnabled.checked = false;
    historicalEnabled.disabled = true;
  }

  updateHistoricalControls();

  const panel =
    byId("memberFormPanel") ||
    byId("addMemberPanel");

  if (panel) {
    panel.hidden = false;
    panel.classList.add("open");
  }
}


/* =========================================================
   MEMBER VIEW MODAL
   ========================================================= */

function getMemberViewModal() {
  return (
    byId("viewMemberModal") ||
    byId("memberModal")
  );
}


function ensureContributionPositionUI() {
  const modal = getMemberViewModal();

  if (!modal) return;

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
    document.createElement("section");

  section.dataset.memberContributionPosition = "true";

  section.innerHTML = `
    <div class="member-contribution-position">
      <h3>Contribution Position</h3>

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
          <strong data-position-total-contributed>
            —
          </strong>
        </div>

        <div>
          <span>Total Due</span>
          <strong data-position-total-due>
            —
          </strong>
        </div>

        <div>
          <span>Allocated</span>
          <strong data-position-allocated>
            —
          </strong>
        </div>

        <div>
          <span>Arrears</span>
          <strong data-position-arrears>
            —
          </strong>
        </div>

        <div>
          <span>Credit</span>
          <strong data-position-credit>
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

  container.appendChild(section);
}


function ensureContributionPositionStyles() {
  if (byId("memberContributionPositionStyles")) {
    return;
  }

  const style = document.createElement("style");

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

  document.head.appendChild(style);
}


function setContributionPositionLoading(
  loading
) {
  const modal = getMemberViewModal();

  if (!modal) return;

  const element =
    modal.querySelector(
      "[data-contribution-position-loading]"
    );

  const content =
    modal.querySelector(
      "[data-contribution-position-content]"
    );

  if (element) {
    element.hidden = !loading;
  }

  if (content) {
    content.hidden = loading;
  }
}


function contributionPositionStatusClass(
  position
) {
  return contributionStatusKey(position);
}


/* =========================================================
   LOAD MEMBER POSITION
   ========================================================= */

async function loadMemberContributionPosition(
  memberId
) {
  const modal = getMemberViewModal();

  if (!modal) return null;

  ensureContributionPositionUI();

  setContributionPositionLoading(true);

  try {
    const { data, error } =
      await supabase.rpc(
        "get_member_contribution_position",
        {
          p_member_id: memberId
        },
        {
          get: true
        }
      );

    if (error) {
      throw error;
    }

    const position =
      Array.isArray(data)
        ? data[0] || null
        : data || null;

    const totalContributed =
      Number(
        position?.total_contributed || 0
      );

    const totalDue =
      Number(
        position?.total_due || 0
      );

    const allocated =
      Number(
        position?.allocated || 0
      );

    const arrears =
      Number(
        position?.arrears || 0
      );

    const credit =
      Number(
        position?.credit || 0
      );

    modal.querySelector(
      "[data-position-total-contributed]"
    ).textContent =
      formatMoney(totalContributed);

    modal.querySelector(
      "[data-position-total-due]"
    ).textContent =
      formatMoney(totalDue);

    modal.querySelector(
      "[data-position-allocated]"
    ).textContent =
      formatMoney(allocated);

    modal.querySelector(
      "[data-position-arrears]"
    ).textContent =
      formatMoney(arrears);

    modal.querySelector(
      "[data-position-credit]"
    ).textContent =
      formatMoney(credit);

    const status =
      modal.querySelector(
        "[data-position-status]"
      );

    if (status) {
      status.innerHTML =
        contributionStatusHtml(position);
    }

    return position;

  } finally {
    setContributionPositionLoading(false);
  }
}


/* =========================================================
   OPEN MEMBER MODAL
   ========================================================= */

async function openMemberModal(memberId) {
  const member = findMember(memberId);

  if (!member) {
    showError("Member could not be found.");
    return;
  }

  const modal = getMemberViewModal();

  if (!modal) {
    showError(
      "Member profile modal could not be found."
    );
    return;
  }

  ensureContributionPositionUI();
  ensureContributionPositionStyles();

  const name =
    modal.querySelector(
      "[data-member-name]"
    ) ||
    byId("viewMemberName");

  if (name) {
    name.textContent =
      member.name || "Member";
  }

  const number =
    modal.querySelector(
      "[data-member-number]"
    ) ||
    byId("viewMemberNumber");

  if (number) {
    number.textContent =
      member.member_number || "—";
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
          ${escapeHtml(member.member_number || "—")}
        </strong>
      </div>

      <div>
        <span>Membership</span>
        <strong>
          ${escapeHtml(member.member_number || "—")}
        </strong>
      </div>

      <div>
        <span>National ID</span>
        <strong>
          ${escapeHtml(member.national_id || "—")}
        </strong>
      </div>

      <div>
        <span>Phone</span>
        <strong>
          ${escapeHtml(member.phone || "—")}
        </strong>
      </div>

      <div>
        <span>Email</span>
        <strong>
          ${escapeHtml(member.email || "—")}
        </strong>
      </div>

      <div>
        <span>Role</span>
        <strong>
          ${escapeHtml(displayRole(member.role))}
        </strong>
      </div>

      <div>
        <span>Status</span>
        <strong>
          ${escapeHtml(
            String(member.status || "active")
          )}
        </strong>
      </div>

      <div>
        <span>Login</span>
        <strong>
          ${escapeHtml(
            getLoginStatus(member).label
          )}
        </strong>
      </div>

      <div>
        <span>Join Date</span>
        <strong>
          ${formatDate(member.join_date)}
        </strong>
      </div>

      <div>
        <span>Group</span>
        <strong>
          ${escapeHtml(
            currentGroup?.name || "—"
          )}
        </strong>
      </div>
    `;
  }

  let reconcileButton =
    modal.querySelector(
      '[data-action="reconcile"]'
    );

  if (!reconcileButton) {
    reconcileButton =
      document.createElement("button");

    reconcileButton.type = "button";
    reconcileButton.dataset.action =
      "reconcile";

    /*
     * IMPORTANT:
     * The dynamic button must carry the member ID.
     */
    reconcileButton.dataset.memberId =
      member.id;

    reconcileButton.textContent =
      "Reconcile Historical Contributions";

    const actions =
      modal.querySelector(
        ".modal-actions"
      ) ||
      modal.querySelector(
        ".member-modal-actions"
      ) ||
      modal;

    actions.appendChild(
      reconcileButton
    );
  } else {
    reconcileButton.dataset.memberId =
      member.id;
  }

  modal.hidden = false;
  modal.classList.add("open");

  await loadMemberContributionPosition(
    member.id
  );
}


/* =========================================================
   CLOSE MEMBER MODAL
   ========================================================= */

function closeMemberModal() {
  const modal = getMemberViewModal();

  if (!modal) return;

  modal.hidden = true;
  modal.classList.remove("open");
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
    return;
  }

  const filtered =
    members.filter(member => {
      const haystack = [
        member.name,
        member.member_number,
        member.national_id,
        member.phone,
        member.email,
        member.role,
        member.status
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });

  const original =
    members;

  members = filtered;

  renderMembers();

  members = original;
}


/* =========================================================
   MEMBER ACTION DELEGATION
   ========================================================= */

async function handleMemberAction(
  event
) {
  const target =
    event.target.closest(
      "[data-action]"
    );

  if (!target) return;

  event.preventDefault();
  event.stopPropagation();

  const action =
    target.dataset.action;

  const memberId =
    target.dataset.memberId;

  if (!memberId && action !== "close") {
    showError(
      "The member action is missing a member ID."
    );
    return;
  }

  switch (action) {
    case "view":
      await openMemberModal(memberId);
      break;

    case "edit":
      await openEditMember(memberId);
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

    case "close":
      closeMemberModal();
      break;

    default:
      break;
  }
}


/* =========================================================
   EVENT BINDING
   ========================================================= */

function bindEvents() {
  /*
   * IMPORTANT:
   * Prevent duplicate listeners if init() is called again.
   */
  if (eventsBound) {
    return;
  }

  eventsBound = true;


  /* -------------------------------------------------------
     ADD
     ------------------------------------------------------- */

  const addButton =
    byId("addMember") ||
    byId("addMemberButton");

  addButton?.addEventListener(
    "click",
    openAddMember
  );


  /* -------------------------------------------------------
     CLOSE / CANCEL FORM
     ------------------------------------------------------- */

  const closeButton =
    byId("closeMemberForm") ||
    byId("closeAddMember");

  closeButton?.addEventListener(
    "click",
    closeAddMember
  );


  const cancelButton =
    byId("cancelMember") ||
    byId("cancelMemberForm");

  cancelButton?.addEventListener(
    "click",
    closeAddMember
  );


  /* -------------------------------------------------------
     FORM
     ------------------------------------------------------- */

  const form =
    byId("memberForm");

  form?.addEventListener(
    "submit",
    saveMember
  );


  /* -------------------------------------------------------
     SEARCH
     ------------------------------------------------------- */

  const search =
    byId("memberSearch") ||
    byId("searchMembers");

  search?.addEventListener(
    "input",
    event => {
      clearTimeout(
        memberSearchTimer
      );

      memberSearchTimer =
        setTimeout(() => {
          filterMembers(
            event.target.value
          );
        }, 120);
    }
  );


  const clearSearch =
    byId("clearMemberSearch");

  clearSearch?.addEventListener(
    "click",
    () => {
      if (search) {
        search.value = "";
      }

      filterMembers("");
    }
  );


  /* -------------------------------------------------------
     MEMBER LIST ACTIONS
     ------------------------------------------------------- */

  const tableBody =
    byId("membersTableBody") ||
    byId("membersBody");

  tableBody?.addEventListener(
    "click",
    handleMemberAction
  );


  const cards =
    byId("membersCards") ||
    byId("membersCardGrid");

  cards?.addEventListener(
    "click",
    handleMemberAction
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
        event.target.closest(
          "[data-action]"
        );

      if (actionTarget) {
        handleMemberAction(event);
        return;
      }

      /*
       * Clicking the modal backdrop closes it.
       */
      if (
        event.target === modal
      ) {
        closeMemberModal();
      }
    }
  );


  const closeModalButtons =
    document.querySelectorAll(
      "[data-member-modal-close]"
    );

  closeModalButtons.forEach(
    button => {
      button.addEventListener(
        "click",
        closeMemberModal
      );
    }
  );


  /* -------------------------------------------------------
     HISTORICAL CONTROLS
     ------------------------------------------------------- */

  const historical =
    byId("memberHistoricalEnabled");

  historical?.addEventListener(
    "change",
    updateHistoricalControls
  );


  const paidThrough =
    byId("memberHistoricalPaidThrough");

  paidThrough?.addEventListener(
    "change",
    updateHistoricalPreview
  );


  const contributionAmount =
    byId("memberContributionAmount");

  contributionAmount?.addEventListener(
    "input",
    updateContributionPreview
  );


  const joinDate =
    byId("memberJoinDate");

  joinDate?.addEventListener(
    "change",
    () => {
      const effective =
        byId(
          "memberContributionEffectiveFrom"
        );

      if (
        effective &&
        !editingMemberId
      ) {
        effective.value =
          joinDate.value;
      }

      updateHistoricalPreview();
    }
  );


  /* -------------------------------------------------------
     ESCAPE
     ------------------------------------------------------- */

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key !== "Escape"
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

  initialized = true;

  try {
    clearError();

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


    /* -----------------------------------------------------
       CONTRIBUTION TYPE
       ----------------------------------------------------- */

    await loadMonthlyContributionType();


    /* -----------------------------------------------------
       MEMBERS
       ----------------------------------------------------- */

    await loadMembers();

    await loadMemberContributionPositions();


    /* -----------------------------------------------------
       RENDER
       ----------------------------------------------------- */

    renderMembers();
    updateMemberCount();


    /* -----------------------------------------------------
       EVENTS
       ----------------------------------------------------- */

    bindEvents();


    /* -----------------------------------------------------
       PREVIEWS
       ----------------------------------------------------- */

    updateContributionPreview();
    updateHistoricalControls();


    showStatus("");

  } catch (error) {
    initialized = false;

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
  await loadMemberContributionPositions();

  renderMembers();
  updateMemberCount();
}


/* =========================================================
   PAGE LAYOUT CONTRACT
   ========================================================= */

export const loadPage = init;


/* =========================================================
   READY
   ========================================================= */

console.log(
  "CHAMA LIVE: members.js ready"
);


















