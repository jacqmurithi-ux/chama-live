/* =========================================================
   CHAMA LIVE — MEMBERS
   CANONICAL MEMBER DIRECTORY / PROFILE
   ---------------------------------------------------------
   Responsibilities
   • Load every member in the current authenticated group.
   • Never use js/api/members.js for this page.
   • Show identity, governance, onboarding and login state.
   • Show authoritative contribution position on demand.
   • Show total recorded contributions from contribution rows.
   • Edit safe member-profile fields only.
   • Change actual position through the canonical RPC.
   • Reconcile historical payments through the canonical RPC.
   • Send member portal invitations through the authenticated
     send-member-invitation-v2 Edge Function.
   
   ACCOUNTING BOUNDARY
   ---------------------------------------------------------
   This page never directly writes:
     contributions
     contribution_allocations
     contribution_obligations
     member_contribution_rules

   Contribution accounting is read through:
     refresh_my_managed_member_accounting()
     get_member_contribution_position()

   Existing-member position changes use:
     set_member_actual_position()

   Existing-member historical reconciliation uses:
     reconcile_member_historical_payments()

   Member invitation uses:
     send-member-invitation-v2

   ========================================================= */

import { supabase } from "./supabase.js";

import {
  getDemoMembers,
  isDemoMode
} from "./demo-client.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";


/* =========================================================
   STATE
========================================================= */

let initialized = false;
let eventsBound = false;

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let groupId = null;

let members = [];
let visibleMembers = [];

let selectedMemberId = null;
let editingMemberId = null;


/* =========================================================
   DOM
========================================================= */

function byId(id) {
  return document.getElementById(id);
}


/* =========================================================
   HELPERS
========================================================= */

function text(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return text(value).toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initials(name) {
  const parts = text(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return parts.length
    ? parts.map((part) => part[0].toUpperCase()).join("")
    : "M";
}

function formatMoney(value) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return "KSh 0.00";
  }

  return `KSh ${amount.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const raw = String(value).slice(0, 10);
  const date = new Date(`${raw}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return text(value);
  }

  return date.toLocaleDateString("en-GB");
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return text(value);
  }

  return date.toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatRole(value) {
  const role = normalize(value);

  const labels = {
    admin: "Admin",
    chairperson: "Chairperson",
    treasurer: "Treasurer",
    secretary: "Secretary",
    "vice chairperson": "Vice Chairperson",
    "vice secretary": "Vice Secretary",
    member: "Member"
  };

  return labels[role] || text(value) || "Member";
}

function formatPosition(value, customName = null) {
  const position = normalize(value);

  if (position === "other") {
    return text(customName) || "Other";
  }

  const labels = {
    chairperson: "Chairperson",
    vice_chairperson: "Vice Chairperson",
    treasurer: "Treasurer",
    secretary: "Secretary",
    vice_secretary: "Vice Secretary",
    committee_member: "Committee Member",
    member: "Member"
  };

  return labels[position] || "Member";
}

function memberById(id) {
  return members.find(
    (member) => String(member.id) === String(id)
  ) || null;
}

function isManager() {
  const role = normalize(
    currentMember?.role
  );

  return (
    role === "admin" ||
    role === "chairperson"
  );
}

function isOfficialPortalRole(role) {
  return new Set([
    "admin",
    "chairperson",
    "secretary",
    "treasurer",
    "vice chairperson",
    "vice secretary"
  ]).has(
    normalize(role)
  );
}

function portalLabelForMember(member) {
  return isOfficialPortalRole(member?.role)
    ? "Admin Portal"
    : "Member Portal";
}

function setHidden(element, hidden) {
  if (!element) {
    return;
  }

  element.hidden = Boolean(hidden);
}

function showStatus(message) {
  const element = byId("membersStatus");

  if (!element) {
    return;
  }

  element.textContent = text(message);
  element.hidden = !text(message);
}

function showError(message) {
  const element = byId("membersError");

  if (!element) {
    console.error(message);
    return;
  }

  element.textContent =
    text(message) ||
    "Unable to complete the requested member operation.";

  element.hidden = false;
}

function clearMessages() {
  setHidden(byId("membersError"), true);
  setHidden(byId("membersSuccess"), true);
  setHidden(byId("membersStatus"), true);

  if (byId("membersError")) {
    byId("membersError").textContent = "";
  }

  if (byId("membersSuccess")) {
    byId("membersSuccess").textContent = "";
  }

  if (byId("membersStatus")) {
    byId("membersStatus").textContent = "";
  }
}

function showSuccess(message) {
  const element = byId("membersSuccess");

  if (!element) {
    return;
  }

  element.textContent = text(message);
  element.hidden = false;
}

function setLoadingState(loading) {
  const refresh = byId("refreshMembers");

  if (refresh) {
    refresh.disabled = loading;
    refresh.textContent =
      loading ? "Loading…" : "Refresh";
  }

  const rows = byId("memberRows");

  if (loading && rows) {
    rows.innerHTML = `
      <tr>
        <td colspan="13" class="empty-state">
          Loading members…
        </td>
      </tr>
    `;
  }

  const cards = byId("memberCards");

  if (loading && cards) {
    cards.innerHTML = `
      <div class="empty-state">
        Loading members…
      </div>
    `;
  }
}


/* =========================================================
   MEMBER LIST
========================================================= */

async function loadMembers() {

  if (isDemoMode()) {
    members = await getDemoMembers();
    visibleMembers = [...members];
    return;
  }

  if (!groupId) {
    throw new Error(
      "The current group could not be determined."
    );
  }

  const { data, error } = await supabase
    .from("members")
    .select(
      [
        "id",
        "group_id",
        "user_id",
        "member_number",
        "membership_number",
        "name",
        "phone",
        "email",
        "national_id",
        "role",
        "join_date",
        "status",
        "onboarding_status",
        "invited_at",
        "activated_at",
        "auth_user_id",
        "actual_position",
        "actual_position_name",
        "created_at"
      ].join(", ")
    )
    .eq("group_id", groupId)
    .order("member_number", {
      ascending: true,
      nullsFirst: false
    })
    .order("name", {
      ascending: true
    });

  if (error) {
    console.error(
      "CHAMA LIVE: Members list query failed:",
      error
    );
    throw error;
  }

  members = Array.isArray(data)
    ? data
    : [];

  visibleMembers = [...members];
}


/* =========================================================
   COUNTS
========================================================= */

function updateCounts() {
  const total = members.length;

  const active = members.filter(
    (member) =>
      normalize(member.status) === "active"
  ).length;

  const login = members.filter(
    (member) =>
      Boolean(
        member.auth_user_id ||
        member.user_id
      )
  ).length;

  const noLogin = total - login;

  if (byId("memberCount")) {
    byId("memberCount").textContent =
      String(total);
  }

  if (byId("activeMembers")) {
    byId("activeMembers").textContent =
      String(active);
  }

  if (byId("loginMembers")) {
    byId("loginMembers").textContent =
      String(login);
  }

  if (byId("noLoginMembers")) {
    byId("noLoginMembers").textContent =
      String(noLogin);
  }

  if (byId("memberResultCount")) {
    byId("memberResultCount").textContent =
      `${visibleMembers.length} member${visibleMembers.length === 1 ? "" : "s"}`;
  }
}


/* =========================================================
   BADGES
========================================================= */

function badge(label, type = "none") {
  return `
    <span class="badge badge-${escapeHtml(type)}">
      ${escapeHtml(label)}
    </span>
  `;
}

function statusBadge(member) {
  const status = normalize(member.status);

  if (status === "active") {
    return badge("Active", "active");
  }

  if (status === "inactive") {
    return badge("Inactive", "inactive");
  }

  return badge(
    text(member.status) || "Unknown",
    "unknown"
  );
}

function onboardingBadge(member) {
  const status =
    normalize(member.onboarding_status);

  if (status === "active") {
    return badge("Active", "active");
  }

  if (status === "invited") {
    return badge("Invited", "invited");
  }

  if (status === "pending") {
    return badge("Pending", "pending");
  }

  if (status === "suspended") {
    return badge("Suspended", "suspended");
  }

  return badge(
    text(member.onboarding_status) || "Unknown",
    "unknown"
  );
}

function loginBadge(member) {
  if (
    member.auth_user_id ||
    member.user_id
  ) {
    return badge("Login enabled", "active");
  }

  return badge("No login", "none");
}


/* =========================================================
   DESKTOP ROW
========================================================= */

function createMemberRow(member) {
  const row =
    document.createElement("tr");

  row.dataset.memberId =
    member.id;

  row.innerHTML = `
    <td>
      ${escapeHtml(
        member.member_number || "—"
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
      <div class="member-name-cell">
        <span class="avatar">
          ${escapeHtml(
            initials(member.name)
          )}
        </span>

        <div>
          <strong>
            ${escapeHtml(
              member.name ||
              "Unnamed member"
            )}
          </strong>

          <small>
            ${escapeHtml(
              formatPosition(
                member.actual_position,
                member.actual_position_name
              )
            )}
          </small>
        </div>
      </div>
    </td>

    <td>
      ${escapeHtml(
        member.national_id || "—"
      )}
    </td>

    <td>
      ${escapeHtml(
        member.phone || "—"
      )}
    </td>

    <td>
      ${escapeHtml(
        member.email || "—"
      )}
    </td>

    <td>
      ${escapeHtml(
        formatRole(member.role)
      )}
    </td>

    <td>
      ${escapeHtml(
        formatPosition(
          member.actual_position,
          member.actual_position_name
        )
      )}
    </td>

    <td>
      ${statusBadge(member)}
    </td>

    <td>
      ${onboardingBadge(member)}
    </td>

    <td>
      ${loginBadge(member)}
    </td>

    <td>
      <div class="action-row">
        <button
          type="button"
          class="btn btn-small"
          data-member-action="view"
          data-member-id="${escapeHtml(member.id)}"
        >
          View Profile
        </button>

        ${isManager() ? `
          <button
            type="button"
            class="btn btn-small"
            data-member-action="edit"
            data-member-id="${escapeHtml(member.id)}"
          >
            Edit
          </button>
        ` : ""}
      </div>
    </td>
  `;

  return row;
}


/* =========================================================
   MOBILE CARD
========================================================= */

function createMemberCard(member) {
  const card =
    document.createElement("article");

  card.className =
    "member-card";

  card.dataset.memberId =
    member.id;

  card.innerHTML = `
    <div class="card-head">
      <div class="member-name-cell">
        <span class="avatar">
          ${escapeHtml(
            initials(member.name)
          )}
        </span>

        <div>
          <strong>
            ${escapeHtml(
              member.name ||
              "Unnamed member"
            )}
          </strong>

          <small>
            ${escapeHtml(
              member.member_number ||
              "No member number"
            )}
          </small>
        </div>
      </div>

      ${statusBadge(member)}
    </div>

    <dl class="card-details">

      <div>
        <dt>Membership No.</dt>
        <dd>
          ${escapeHtml(
            member.membership_number ||
            member.member_number ||
            "—"
          )}
        </dd>
      </div>

      <div>
        <dt>Position</dt>
        <dd>
          ${escapeHtml(
            formatPosition(
              member.actual_position,
              member.actual_position_name
            )
          )}
        </dd>
      </div>

      <div>
        <dt>Phone</dt>
        <dd>
          ${escapeHtml(
            member.phone || "—"
          )}
        </dd>
      </div>

      <div>
        <dt>Email</dt>
        <dd>
          ${escapeHtml(
            member.email || "—"
          )}
        </dd>
      </div>

      <div>
        <dt>Onboarding</dt>
        <dd>
          ${onboardingBadge(member)}
        </dd>
      </div>

      <div>
        <dt>Login</dt>
        <dd>
          ${loginBadge(member)}
        </dd>
      </div>

    </dl>

    <div class="action-row">

      <button
        type="button"
        class="btn btn-small"
        data-member-action="view"
        data-member-id="${escapeHtml(member.id)}"
      >
        View Profile
      </button>

      ${isManager() ? `
        <button
          type="button"
          class="btn btn-small"
          data-member-action="edit"
          data-member-id="${escapeHtml(member.id)}"
        >
          Edit
        </button>
      ` : ""}

    </div>
  `;

  return card;
}


/* =========================================================
   RENDER
========================================================= */

function renderMembers() {
  updateCounts();

  const rows =
    byId("memberRows");

  const cards =
    byId("memberCards");

  if (!visibleMembers.length) {
    if (rows) {
      rows.innerHTML = `
        <tr>
          <td
            colspan="13"
            class="empty-state"
          >
            No members found.
          </td>
        </tr>
      `;
    }

    if (cards) {
      cards.innerHTML = `
        <div class="empty-state">
          No members found.
        </div>
      `;
    }

    return;
  }

  if (rows) {
    rows.replaceChildren(
      ...visibleMembers.map(
        createMemberRow
      )
    );
  }

  if (cards) {
    cards.replaceChildren(
      ...visibleMembers.map(
        createMemberCard
      )
    );
  }
}


/* =========================================================
   SEARCH
========================================================= */

function filterMembers() {
  const query =
    normalize(
      byId("memberSearch")?.value
    );

  if (!query) {
    visibleMembers = [...members];
    renderMembers();
    return;
  }

  visibleMembers =
    members.filter((member) => {
      const values = [
        member.member_number,
        member.membership_number,
        member.name,
        member.phone,
        member.email,
        member.national_id,
        member.role,
        member.actual_position,
        member.actual_position_name,
        member.status,
        member.onboarding_status
      ];

      return values.some(
        (value) =>
          normalize(value).includes(query)
      );
    });

  renderMembers();
}


/* =========================================================
   CONTRIBUTION POSITION
========================================================= */

function getPositionValue(position, ...keys) {
  for (const key of keys) {
    if (
      position &&
      position[key] !== null &&
      position[key] !== undefined
    ) {
      return position[key];
    }
  }

  return null;
}

function contributionStatusLabel(position) {
  const raw = normalize(
    getPositionValue(
      position,
      "status",
      "contribution_status"
    )
  );

  if (
    raw === "arrears" ||
    raw === "overdue"
  ) {
    return "Arrears";
  }

  if (
    raw === "credit" ||
    raw === "in_credit"
  ) {
    return "Credit";
  }

  if (
    raw === "up_to_date" ||
    raw === "paid"
  ) {
    return "Up to Date";
  }

  return (
    getPositionValue(
      position,
      "status",
      "contribution_status"
    ) ||
    "Unknown"
  );
}

function positionBadgeType(position) {
  const status =
    normalize(
      contributionStatusLabel(position)
    );

  if (status === "arrears") {
    return "arrears";
  }

  if (status === "credit") {
    return "credit";
  }

  if (status === "up to date") {
    return "paid";
  }

  return "unknown";
}


/* =========================================================
   PROFILE ACCOUNTING
========================================================= */

async function loadMemberAccounting(member) {
  if (!member?.id) {
    throw new Error(
      "Member identity is missing."
    );
  }

  /*
   * Canonical synchronization is best effort.
   * A refresh failure must not block profile identity.
   */
  const refresh =
    await supabase.rpc(
      "refresh_my_managed_member_accounting",
      {
        p_member_id: member.id
      }
    );

  if (refresh.error) {
    console.warn(
      "CHAMA LIVE: member accounting refresh returned an error:",
      refresh.error
    );
  }

  const positionResult =
    await supabase.rpc(
      "get_member_contribution_position",
      {
        p_member_id: member.id
      }
    );

  if (positionResult.error) {
    console.error(
      "CHAMA LIVE: member contribution position failed:",
      positionResult.error
    );
    throw positionResult.error;
  }

  const raw =
    positionResult.data;

  const position =
    Array.isArray(raw)
      ? raw[0] || null
      : raw || null;

  /*
   * Total Contributed is the sum of contribution rows.
   * It is not synthesized from allocated + credit.
   */
  const contributionResult =
    await supabase
      .from("contributions")
      .select(
        "amount"
      )
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "member_id",
        member.id
      );

  if (contributionResult.error) {
    console.error(
      "CHAMA LIVE: member contribution total failed:",
      contributionResult.error
    );
    throw contributionResult.error;
  }

  const totalContributed =
    (contributionResult.data || [])
      .reduce(
        (sum, row) =>
          sum + Number(row.amount || 0),
        0
      );

  return {
    position,
    totalContributed
  };
}


/* =========================================================
   CONTRIBUTION RULES
========================================================= */

async function loadMemberRules(member) {
  if (!member?.id) {
    return [];
  }

  const { data, error } =
    await supabase
      .from("member_contribution_rules")
      .select(
        [
          "group_id",
          "member_id",
          "contribution_type_id",
          "amount",
          "frequency",
          "effective_from",
          "effective_to",
          "first_period_rule",
          "status"
        ].join(", ")
      )
      .eq("group_id", groupId)
      .eq("member_id", member.id)
      .order("effective_from", {
        ascending: false
      });

  if (error) {
    console.error(
      "CHAMA LIVE: member contribution rules failed:",
      error
    );
    throw error;
  }

  return Array.isArray(data)
    ? data
    : [];
}


/* =========================================================
   CONTRIBUTION TYPE NAMES
========================================================= */

async function loadContributionTypeMap() {
  const { data, error } =
    await supabase
      .from("contribution_types")
      .select(
        "id, name, code"
      )
      .eq(
        "group_id",
        groupId
      );

  if (error) {
    console.error(
      "CHAMA LIVE: contribution type lookup failed:",
      error
    );
    return new Map();
  }

  return new Map(
    (data || []).map(
      (row) => [
        String(row.id),
        row.name ||
          row.code ||
          "Contribution"
      ]
    )
  );
}

async function renderContributionRules(member) {
  const target =
    byId("memberContributionRules");

  if (!target) {
    return;
  }

  target.innerHTML = `
    <div class="rule-card">
      <strong>Loading…</strong>
      <span>Contribution rules</span>
    </div>
  `;

  try {
    const [
      rules,
      typeMap
    ] = await Promise.all([
      loadMemberRules(member),
      loadContributionTypeMap()
    ]);

    if (!rules.length) {
      target.innerHTML = `
        <div class="rule-card">
          <strong>No rules</strong>
          <span>No contribution rule is currently recorded for this member.</span>
        </div>
      `;
      return;
    }

    target.innerHTML =
      rules.map((rule) => `
        <div class="rule-card">
          <strong>
            ${escapeHtml(
              typeMap.get(
                String(rule.contribution_type_id)
              ) ||
              "Contribution"
            )}
          </strong>

          <span>
            ${escapeHtml(
              formatMoney(rule.amount)
            )}
            /
            ${escapeHtml(
              rule.frequency || "monthly"
            )}
          </span>

          <span>
            ${escapeHtml(
              formatDate(rule.effective_from)
            )}
            →
            ${escapeHtml(
              rule.effective_to
                ? formatDate(rule.effective_to)
                : "Open"
            )}
            ·
            ${escapeHtml(
              rule.status || "active"
            )}
          </span>
        </div>
      `).join("");
  } catch (error) {
    target.innerHTML = `
      <div class="rule-card">
        <strong>Unavailable</strong>
        <span>
          Contribution rules could not be loaded.
        </span>
      </div>
    `;

    console.error(
      "CHAMA LIVE: rule rendering failed:",
      error
    );
  }
}


/* =========================================================
   PROFILE MODAL ACTIONS
========================================================= */

function ensureProfileActions() {
  const modalFoot =
    document.querySelector(
      "#memberModal .modal-foot"
    );

  if (!modalFoot) {
    return;
  }

  if (!byId("memberModalEdit")) {
    const button =
      document.createElement("button");

    button.id =
      "memberModalEdit";

    button.type =
      "button";

    button.className =
      "btn";

    button.textContent =
      "Edit Profile";

    button.addEventListener(
      "click",
      () => {
        if (selectedMemberId) {
          openEditMember(
            selectedMemberId
          );
        }
      }
    );

    modalFoot.prepend(button);
  }

  if (!byId("memberModalInvite")) {
    const button =
      document.createElement("button");

    button.id =
      "memberModalInvite";

    button.type =
      "button";

    button.className =
      "btn btn-primary";

    button.textContent =
      "Invite to Portal";

    button.addEventListener(
      "click",
      () => {
        if (selectedMemberId) {
          inviteMember(
            selectedMemberId
          );
        }
      }
    );

    modalFoot.prepend(button);
  }

  updateProfileActionVisibility();
}

function updateProfileActionVisibility() {
  const member =
    memberById(selectedMemberId);

  const edit =
    byId("memberModalEdit");

  const invite =
    byId("memberModalInvite");

  if (edit) {
    edit.hidden =
      !isManager();
  }

  if (invite) {
    const hasEmail =
      Boolean(
        text(member?.email)
      );

    const hasLogin =
      Boolean(
        member?.auth_user_id ||
        member?.user_id
      );

    invite.hidden =
      !isManager() ||
      !hasEmail;

    const portalLabel =
      portalLabelForMember(member);

    invite.textContent =
      hasLogin
        ? "Resend " + portalLabel + " Email"
        : "Invite to " + portalLabel;
  }
}


/* =========================================================
   OPEN PROFILE
========================================================= */

async function openMemberProfile(memberId) {
  const member =
    memberById(memberId);

  if (!member) {
    showError(
      "The selected member could not be found."
    );
    return;
  }

  selectedMemberId =
    member.id;

  clearMessages();
  ensureProfileActions();

  const modal =
    byId("memberModal");

  if (!modal) {
    return;
  }

  setHidden(
    modal,
    false
  );

  byId("viewMemberInitials").textContent =
    initials(member.name);

  byId("viewMemberName").textContent =
    member.name ||
    "Member";

  byId("viewMemberNumber").textContent =
    member.member_number
      ? `Member ${member.member_number}`
      : "Member profile";

  const values = {
    viewMemberNumberDetail:
      member.member_number || "—",

    viewMemberMembershipNumber:
      member.membership_number ||
      member.member_number ||
      "—",

    viewMemberNationalId:
      member.national_id || "—",

    viewMemberPhone:
      member.phone || "—",

    viewMemberEmail:
      member.email || "—",

    viewMemberRole:
      formatRole(member.role),

    viewMemberActualPosition:
      formatPosition(
        member.actual_position,
        member.actual_position_name
      ),

    viewMemberStatus:
      text(member.status) || "—",

    viewMemberOnboardingStatus:
      text(member.onboarding_status) || "—",

    viewMemberJoinDate:
      formatDate(member.join_date),

    viewMemberActivatedAt:
      formatDateTime(member.activated_at)
  };

  Object.entries(values)
    .forEach(([id, value]) => {
      if (byId(id)) {
        byId(id).textContent =
          value;
      }
    });

  byId("viewContributionStatus").textContent =
    "Loading…";

  byId("viewContributionTotal").textContent =
    "Loading…";

  byId("viewContributionDue").textContent =
    "Loading…";

  byId("viewContributionAllocated").textContent =
    "Loading…";

  byId("viewContributionArrears").textContent =
    "Loading…";

  byId("viewContributionCredit").textContent =
    "Loading…";

  const positionTarget =
    byId("viewContributionStatus");

  if (positionTarget) {
    positionTarget.textContent =
      "Loading…";
  }

  renderContributionRules(member);

  try {
    const accounting =
      await loadMemberAccounting(
        member
      );

    const position =
      accounting.position;

    const status =
      contributionStatusLabel(
        position
      );

    const totalDue =
      getPositionValue(
        position,
        "total_due"
      );

    const allocated =
      getPositionValue(
        position,
        "total_allocated",
        "allocated"
      );

    const arrears =
      getPositionValue(
        position,
        "arrears"
      );

    const credit =
      getPositionValue(
        position,
        "credit"
      );

    if (byId("viewContributionStatus")) {
      byId("viewContributionStatus").textContent =
        status;
    }

    if (byId("viewContributionTotal")) {
      byId("viewContributionTotal").textContent =
        formatMoney(totalDue);
    }

    if (byId("viewContributionDue")) {
      byId("viewContributionDue").textContent =
        formatMoney(totalDue);
    }

    if (byId("viewContributionAllocated")) {
      byId("viewContributionAllocated").textContent =
        formatMoney(allocated);
    }

    if (byId("viewContributionArrears")) {
      byId("viewContributionArrears").textContent =
        formatMoney(arrears);
    }

    if (byId("viewContributionCredit")) {
      byId("viewContributionCredit").textContent =
        formatMoney(credit);
    }

    /*
     * The existing HTML calls this card "Total Due".
     * We repurpose the hidden/available label to show the
     * actual total contributed where possible without
     * synthesizing it from accounting position.
     */
    const totalCard =
      document.querySelector(
        "#viewContributionTotal"
      );

    if (totalCard) {
      totalCard.textContent =
        formatMoney(
          accounting.totalContributed
        );
    }

    if (byId("viewContributionStatus")) {
      const type =
        positionBadgeType(position);

      byId("viewContributionStatus").className =
        `badge badge-${type}`;
    }

  } catch (error) {
    console.error(
      "CHAMA LIVE: profile accounting load failed:",
      error
    );

    if (byId("viewContributionStatus")) {
      byId("viewContributionStatus").textContent =
        "Unavailable";
    }

    for (const id of [
      "viewContributionTotal",
      "viewContributionDue",
      "viewContributionAllocated",
      "viewContributionArrears",
      "viewContributionCredit"
    ]) {
      if (byId(id)) {
        byId(id).textContent =
          "—";
      }
    }
  }

  preparePositionEditor(member);
  updateProfileActionVisibility();
}


/* =========================================================
   CLOSE PROFILE
========================================================= */

function closeMemberProfile() {
  const modal =
    byId("memberModal");

  if (modal) {
    modal.hidden =
      true;
  }

  selectedMemberId =
    null;
}


/* =========================================================
   EDIT MEMBER
========================================================= */

function fieldContainer(id) {
  return byId(id)?.closest(".field") || null;
}

function setFormValue(id, value) {
  const element =
    byId(id);

  if (element) {
    element.value =
      value ?? "";
  }
}

function openEditMember(memberId) {
  const member =
    memberById(memberId);

  if (!member) {
    showError(
      "The selected member could not be found."
    );
    return;
  }

  if (!isManager()) {
    showError(
      "Only an admin or chairperson can edit members."
    );
    return;
  }

  editingMemberId =
    member.id;

  closeMemberProfile();

  const panel =
    byId("addMemberPanel");

  if (!panel) {
    return;
  }

  panel.hidden =
    false;

  byId("memberFormTitle").textContent =
    "Edit Member Profile";

  byId("memberFormDescription").textContent =
    "Update membership identity and profile information. Contribution accounting remains backend-controlled.";

  byId("saveMemberButton").textContent =
    "Save Changes";

  if (byId("memberFormAccountingNotice")) {
    byId("memberFormAccountingNotice").hidden =
      false;
  }

  setFormValue(
    "memberNumber",
    member.member_number
  );

  setFormValue(
    "memberMembershipNumber",
    member.membership_number ||
      member.member_number
  );

  setFormValue(
    "memberName",
    member.name
  );

  setFormValue(
    "memberNationalId",
    member.national_id
  );

  setFormValue(
    "memberPhone",
    member.phone
  );

  setFormValue(
    "memberEmail",
    member.email
  );

  setFormValue(
    "memberRole",
    normalize(member.role) ||
      "member"
  );

  setFormValue(
    "memberStatus",
    normalize(member.status) ||
      "active"
  );

  setFormValue(
    "memberJoinDate",
    member.join_date
      ? String(member.join_date).slice(0, 10)
      : ""
  );

  setFormValue(
    "memberActualPosition",
    member.actual_position || ""
  );

  setFormValue(
    "memberActualPositionName",
    member.actual_position_name || ""
  );

  setFormValue(
    "memberActualPositionEffectiveFrom",
    ""
  );

  /*
   * Existing-member editing must not expose creation-time
   * accounting controls.
   */
  for (const id of [
    "memberContributionAmount",
    "memberContributionEffectiveFrom",
    "memberFirstPeriodRule",
    "memberHistoricalEnabled",
    "memberHistoricalPaidThrough",
    "memberHistoricalPaymentMethod"
  ]) {
    const container =
      fieldContainer(id);

    if (container) {
      container.hidden =
        true;
    }
  }

  const preview =
    byId("memberContributionPreview");

  if (preview) {
    preview.hidden =
      true;
  }

  const historical =
    byId("historicalContributionControls");

  if (historical) {
    historical.hidden =
      true;
  }

  /*
   * Member number is an accounting/member reference.
   * Do not allow casual editing of it.
   */
  const memberNumberInput =
    byId("memberNumber");

  if (memberNumberInput) {
    memberNumberInput.disabled =
      true;
  }

  const membershipNumberInput =
    byId("memberMembershipNumber");

  if (membershipNumberInput) {
    membershipNumberInput.disabled =
      true;
  }

  byId("memberName")?.focus();
}


/* =========================================================
   CLOSE EDIT
========================================================= */

function closeEditMember() {
  const panel =
    byId("addMemberPanel");

  if (panel) {
    panel.hidden =
      true;
  }

  editingMemberId =
    null;

  restoreEditForm();
}

function restoreEditForm() {
  const title =
    byId("memberFormTitle");

  const description =
    byId("memberFormDescription");

  const save =
    byId("saveMemberButton");

  if (title) {
    title.textContent =
      "Add Member";
  }

  if (description) {
    description.textContent =
      "Create the member and establish the initial Monthly contribution plan.";
  }

  if (save) {
    save.textContent =
      "Save Member";
  }

  if (byId("memberFormAccountingNotice")) {
    byId("memberFormAccountingNotice").hidden =
      true;
  }

  const memberNumberInput =
    byId("memberNumber");

  if (memberNumberInput) {
    memberNumberInput.disabled =
      false;
  }

  const membershipNumberInput =
    byId("memberMembershipNumber");

  if (membershipNumberInput) {
    membershipNumberInput.disabled =
      false;
  }

  for (const id of [
    "memberContributionAmount",
    "memberContributionEffectiveFrom",
    "memberFirstPeriodRule",
    "memberHistoricalEnabled",
    "memberHistoricalPaidThrough",
    "memberHistoricalPaymentMethod"
  ]) {
    const container =
      fieldContainer(id);

    if (container) {
      container.hidden =
        false;
    }
  }

  const preview =
    byId("memberContributionPreview");

  if (preview) {
    preview.hidden =
      false;
  }
}


/* =========================================================
   SAVE EDIT
========================================================= */

async function saveMemberEdit(event) {
  event.preventDefault();

  if (!editingMemberId) {
    /*
     * Add Member has its own canonical page.
     */
    window.location.href =
      "add-member.html";
    return;
  }

  if (!isManager()) {
    showError(
      "Only an admin or chairperson can edit members."
    );
    return;
  }

  const member =
    memberById(editingMemberId);

  if (!member) {
    showError(
      "The member could not be found."
    );
    return;
  }

  const button =
    byId("saveMemberButton");

  const formMessage =
    byId("formMessage");

  if (formMessage) {
    formMessage.hidden =
      true;
    formMessage.textContent =
      "";
  }

  const payload = {
    name:
      text(byId("memberName")?.value),
    national_id:
      text(byId("memberNationalId")?.value) ||
      null,
    phone:
      text(byId("memberPhone")?.value),
    email:
      text(byId("memberEmail")?.value) ||
      null,
    role:
      normalize(byId("memberRole")?.value) ||
      "member",
    status:
      normalize(byId("memberStatus")?.value) ||
      "active"
  };

  if (!payload.name) {
    showError(
      "Member name is required."
    );
    return;
  }

  if (!payload.phone) {
    showError(
      "Member phone is required."
    );
    return;
  }

  if (
    ![
      "member",
      "admin",
      "chairperson",
      "treasurer",
      "secretary"
    ].includes(payload.role)
  ) {
    showError(
      "The selected security role is invalid."
    );
    return;
  }

  if (
    ![
      "active",
      "inactive"
    ].includes(payload.status)
  ) {
    showError(
      "The selected member status is invalid."
    );
    return;
  }

  if (button) {
    button.disabled =
      true;
    button.textContent =
      "Saving…";
  }

  try {
    const { error } =
      await supabase
        .from("members")
        .update(payload)
        .eq("id", member.id)
        .eq("group_id", groupId);

    if (error) {
      console.error(
        "CHAMA LIVE: member profile update failed:",
        error
      );
      throw error;
    }

    /*
     * Refresh the directory from the database so every page
     * consumer sees the same current member record.
     */
    await loadMembers();
    filterMembers();

    closeEditMember();

    showSuccess(
      `${member.name || "Member"}'s profile was updated successfully.`
    );

  } catch (error) {
    console.error(
      "CHAMA LIVE: member edit failed:",
      error
    );

    showError(
      error?.message ||
      "Unable to update the member profile."
    );
  } finally {
    if (button) {
      button.disabled =
        false;
      button.textContent =
        "Save Changes";
    }
  }
}


/* =========================================================
   POSITION EDITOR
========================================================= */

function preparePositionEditor(member) {
  setFormValue(
    "positionChangeValue",
    ""
  );

  setFormValue(
    "positionChangeName",
    ""
  );

  setFormValue(
    "positionChangeEffectiveFrom",
    ""
  );

  const nameField =
    byId("positionChangeNameField");

  if (nameField) {
    nameField.hidden =
      true;
  }

  const section =
    byId("positionChangeSection");

  if (section) {
    section.hidden =
      !isManager();
  }

  const reconcile =
    byId("reconcileHistoricalPayments");

  if (reconcile) {
    reconcile.hidden =
      !isManager();
  }
}

async function savePositionChange() {
  if (!selectedMemberId) {
    return;
  }

  if (!isManager()) {
    showError(
      "Only an admin or chairperson can change a member position."
    );
    return;
  }

  const position =
    normalize(
      byId("positionChangeValue")?.value
    );

  const positionName =
    text(
      byId("positionChangeName")?.value
    );

  const effectiveFrom =
    text(
      byId("positionChangeEffectiveFrom")?.value
    );

  if (!position) {
    showError(
      "Select the new actual group position."
    );
    return;
  }

  if (
    position === "other" &&
    !positionName
  ) {
    showError(
      "Enter the position name for Other."
    );
    return;
  }

  if (!effectiveFrom) {
    showError(
      "Select the effective date."
    );
    return;
  }

  const button =
    byId("savePositionChange");

  if (button) {
    button.disabled =
      true;
    button.textContent =
      "Saving…";
  }

  try {
    const { data, error } =
      await supabase.rpc(
        "set_member_actual_position",
        {
          p_member_id:
            selectedMemberId,
          p_actual_position:
            position,
          p_actual_position_name:
            position === "other"
              ? positionName
              : null,
          p_effective_from:
            effectiveFrom
        }
      );

    if (error) {
      console.error(
        "CHAMA LIVE: position change failed:",
        error
      );
      throw error;
    }

    console.info(
      "CHAMA LIVE: position change result:",
      data
    );

    await loadMembers();
    filterMembers();

    const updated =
      memberById(selectedMemberId);

    if (updated) {
      byId("viewMemberActualPosition").textContent =
        formatPosition(
          updated.actual_position,
          updated.actual_position_name
        );
    }

    showSuccess(
      "Member position updated successfully."
    );

    await openMemberProfile(
      selectedMemberId
    );

  } catch (error) {
    console.error(
      "CHAMA LIVE: position change failed:",
      error
    );

    showError(
      error?.message ||
      "Unable to change the member position."
    );
  } finally {
    if (button) {
      button.disabled =
        false;
      button.textContent =
        "Save Position Change";
    }
  }
}


/* =========================================================
   HISTORICAL RECONCILIATION
========================================================= */

async function reconcileHistoricalPayments() {
  if (!selectedMemberId) {
    return;
  }

  if (!isManager()) {
    showError(
      "Only an admin or chairperson can reconcile historical payments."
    );
    return;
  }

  const throughDate =
    prompt(
      "Reconcile historical payments through which date? Use YYYY-MM-DD.",
      new Date().toISOString().slice(0, 10)
    );

  if (!throughDate) {
    return;
  }

  const button =
    byId("reconcileHistoricalPayments");

  if (button) {
    button.disabled =
      true;
    button.textContent =
      "Reconciling…";
  }

  try {
    const { data, error } =
      await supabase.rpc(
        "reconcile_member_historical_payments",
        {
          p_member_id:
            selectedMemberId,
          p_through_date:
            throughDate
        }
      );

    if (error) {
      console.error(
        "CHAMA LIVE: historical reconciliation failed:",
        error
      );
      throw error;
    }

    console.info(
      "CHAMA LIVE: historical reconciliation result:",
      data
    );

    showSuccess(
      "Historical member payments were reconciled successfully."
    );

    await openMemberProfile(
      selectedMemberId
    );

  } catch (error) {
    console.error(
      "CHAMA LIVE: historical reconciliation failed:",
      error
    );

    showError(
      error?.message ||
      "Unable to reconcile historical payments."
    );
  } finally {
    if (button) {
      button.disabled =
        false;
      button.textContent =
        "Reconcile Historical Payments";
    }
  }
}


/* =========================================================
   INVITATION
========================================================= */

async function inviteMember(memberId) {
  const member =
    memberById(memberId);

  if (!member) {
    showError(
      "The selected member could not be found."
    );
    return;
  }

  if (!isManager()) {
    showError(
      "Only an admin or chairperson can send portal invitations."
    );
    return;
  }

  const email =
    text(member.email);

  if (!email) {
    showError(
      "Add an email address to this member before sending the invitation."
    );
    return;
  }

  const portalLabel =
    portalLabelForMember(member);

  const confirmed =
    window.confirm(
      "Send a CHAMA LIVE " +
      portalLabel +
      " invitation to " +
      email +
      " for " +
      (member.name || "this member") +
      "?"
    );

  if (!confirmed) {
    return;
  }

  const button =
    byId("memberModalInvite");

  if (button) {
    button.disabled =
      true;
    button.textContent =
      "Sending…";
  }

  try {
    /*
     * The authenticated Supabase client automatically sends
     * the current session JWT with functions.invoke().
     */
    const { data, error } =
      await supabase.functions.invoke(
        "send-member-invitation-v2",
        {
          body: {
            member_id:
              member.id
          }
        }
      );

    if (error) {
      console.error(
        "CHAMA LIVE: member invitation function failed:",
        error
      );

      /*
       * FunctionsHttpError can contain the actual JSON response.
       */
      let message =
        error?.message ||
        "Unable to send the member invitation.";

      try {
        const responseBody =
          await error.context?.json?.();

        if (responseBody?.error) {
          message =
            responseBody.error;
        }
      } catch {
        /* Keep the provider error message. */
      }

      throw new Error(message);
    }

    if (!data?.success) {
      throw new Error(
        data?.error ||
        "The member invitation was not sent."
      );
    }

    await loadMembers();
    filterMembers();

    showSuccess(
      data.message ||
      (portalLabel + " invitation sent to " + email + ".")
    );

    /*
     * Keep the profile open and show the updated onboarding
     * and login state.
     */
    await openMemberProfile(
      member.id
    );

  } catch (error) {
    console.error(
      "CHAMA LIVE: member invitation failed:",
      error
    );

    showError(
      error?.message ||
      "Unable to send the member portal invitation."
    );
  } finally {
    updateProfileActionVisibility();

    if (button) {
      button.disabled =
        false;

      const refreshed =
        memberById(memberId);

      const refreshedPortalLabel =
        portalLabelForMember(refreshed);

      button.textContent =
        refreshed?.auth_user_id ||
        refreshed?.user_id
          ? "Resend " + refreshedPortalLabel + " Email"
          : "Invite to " + refreshedPortalLabel;
    }
  }
}


/* =========================================================
   ACTION DELEGATION
========================================================= */

function handleMemberAction(event) {
  const button =
    event.target.closest(
      "[data-member-action]"
    );

  if (!button) {
    return;
  }

  const action =
    button.dataset.memberAction;

  const memberId =
    button.dataset.memberId;

  if (!memberId) {
    return;
  }

  if (action === "view") {
    openMemberProfile(memberId);
    return;
  }

  if (action === "edit") {
    openEditMember(memberId);
  }
}


/* =========================================================
   POSITION UI
========================================================= */

function updatePositionNameVisibility() {
  const position =
    normalize(
      byId("positionChangeValue")?.value
    );

  const field =
    byId("positionChangeNameField");

  if (field) {
    field.hidden =
      position !== "other";
  }
}

function updateAddPositionNameVisibility() {
  const position =
    normalize(
      byId("memberActualPosition")?.value
    );

  const field =
    byId("memberActualPositionNameField");

  if (field) {
    field.hidden =
      position !== "other";
  }
}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {
  if (eventsBound) {
    return;
  }

  eventsBound =
    true;

  byId("refreshMembers")
    ?.addEventListener(
      "click",
      () => {
        refreshMembers();
      }
    );

  byId("addMemberButton")
    ?.addEventListener(
      "click",
      () => {
        window.location.href =
          "add-member.html";
      }
    );

  byId("memberSearch")
    ?.addEventListener(
      "input",
      filterMembers
    );

  byId("clearMemberSearch")
    ?.addEventListener(
      "click",
      () => {
        if (byId("memberSearch")) {
          byId("memberSearch").value =
            "";
        }

        filterMembers();
      }
    );

  byId("memberRows")
    ?.addEventListener(
      "click",
      handleMemberAction
    );

  byId("memberCards")
    ?.addEventListener(
      "click",
      handleMemberAction
    );

  byId("closeMemberModal")
    ?.addEventListener(
      "click",
      closeMemberProfile
    );

  byId("closeMemberModalFooter")
    ?.addEventListener(
      "click",
      closeMemberProfile
    );

  byId("savePositionChange")
    ?.addEventListener(
      "click",
      savePositionChange
    );

  byId("reconcileHistoricalPayments")
    ?.addEventListener(
      "click",
      reconcileHistoricalPayments
    );

  byId("positionChangeValue")
    ?.addEventListener(
      "change",
      updatePositionNameVisibility
    );

  byId("memberActualPosition")
    ?.addEventListener(
      "change",
      updateAddPositionNameVisibility
    );

  byId("addMemberForm")
    ?.addEventListener(
      "submit",
      saveMemberEdit
    );

  byId("closeAddMember")
    ?.addEventListener(
      "click",
      closeEditMember
    );

  byId("cancelAddMember")
    ?.addEventListener(
      "click",
      closeEditMember
    );

  byId("memberModal")
    ?.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          byId("memberModal")
        ) {
          closeMemberProfile();
        }
      }
    );

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape" &&
        byId("memberModal")?.hidden === false
      ) {
        closeMemberProfile();
      }
    }
  );
}


/* =========================================================
   REFRESH
========================================================= */

async function refreshMembers() {
  clearMessages();
  setLoadingState(true);

  try {
    await loadMembers();
    filterMembers();

    showStatus(
      `${members.length} member${members.length === 1 ? "" : "s"} loaded.`
    );

  } catch (error) {
    console.error(
      "CHAMA LIVE: Members page load failed:",
      error
    );

    members = [];
    visibleMembers = [];

    updateCounts();
    renderMembers();

    showError(
      error?.message ||
      "Unable to load group members."
    );

  } finally {
    setLoadingState(false);
  }
}


/* =========================================================
   INITIALIZATION
========================================================= */

export async function init() {
  if (initialized) {
    return;
  }

  initialized = true;

  clearMessages();
  bindEvents();

  try {

    if (isDemoMode()) {

      const demo =
        window.__CHAMA_LIVE_ADMIN_CONTEXT__;

      currentUser = null;
      currentMember = demo?.member || null;
      currentGroup = demo?.group || null;

      groupId =
        currentGroup?.id ||
        currentMember?.group_id ||
        null;

      if (!groupId) {
        throw new Error(
          "The demo group could not be determined."
        );
      }

      if (byId("addMemberButton")) {
        byId("addMemberButton").hidden = true;
      }

      await refreshMembers();
      return;

    }

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
        "Your member account is not linked to a group."
      );
    }

    if (!isManager()) {
      window.location.replace(
        "member-dashboard.html"
      );
      return;
    }

    ensureProfileActions();

    await refreshMembers();

  } catch (error) {

    console.error(
      "CHAMA LIVE: Members initializer failed:",
      error
    );

    showError(
      error?.message ||
      "Unable to load the Members page."
    );

  }
}

export const initPage =
  init;
