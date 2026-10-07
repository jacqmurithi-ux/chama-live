/* =========================================================
   CHAMA LIVE — MEMBERS
   CANONICAL FRONTEND — 2026-10-07

   ---------------------------------------------------------
   ACCOUNTING BOUNDARY
   ---------------------------------------------------------
   THIS PAGE NEVER DIRECTLY INSERTS OR UPDATES:

     contributions
     contribution_allocations
     contribution_obligations

   CANONICAL OPERATIONS:

     create_member_with_contribution_plan()
     create_member_with_historical_contributions()
     refresh_my_managed_member_accounting()
     get_member_contribution_position()
     set_member_actual_position()
     reconcile_member_historical_payments()

   MEMBER PROFILE EDITS:

     membersApi.updateMember()

   ---------------------------------------------------------
   IMPORTANT
   ---------------------------------------------------------
   • Members are displayed regardless of status.
   • Members are displayed regardless of onboarding status.
   • Login state is determined from user_id.
   • Contribution state comes only from the canonical
     contribution-position RPC.
   • Credit is NOT added to allocated contributions.
   • Position history is controlled by the canonical RPC.
   • Historical onboarding is creation-only.
   • No direct accounting-table writes occur here.
   ========================================================= */

import { membersApi } from "./api/members.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";


/* =========================================================
   CONSTANTS
   ========================================================= */

const POSITIONS = new Set([
  "chairperson",
  "vice_chairperson",
  "treasurer",
  "secretary",
  "vice_secretary",
  "committee_member",
  "member",
  "other"
]);


const SECURITY_ROLES = new Set([
  "member",
  "chairperson",
  "admin",
  "treasurer",
  "secretary"
]);


const VALID_MEMBER_STATUSES = new Set([
  "active",
  "inactive"
]);


const VALID_FIRST_PERIOD_RULES = new Set([
  "full_period",
  "next_full_period"
]);


const NON_FATAL_DATA_ERRORS = new Set([
  "rules",
  "positions"
]);


/* =========================================================
   PAGE STATE
   ========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;

let groupId = null;

let members = [];
let visibleMembers = [];

let contributionTypes = [];
let monthlyContributionType = null;

let contributionPositions = new Map();
let memberContributionRules = new Map();

let editingMemberId = null;
let selectedMemberId = null;

let initialized = false;
let eventsBound = false;

let searchTimer = null;

let pageBusy = false;
let saveBusy = false;
let positionBusy = false;
let reconcileBusy = false;


/* =========================================================
   DOM
   ========================================================= */

function byId(id) {
  return document.getElementById(id);
}


function allById(...ids) {
  return ids
    .map((id) => byId(id))
    .filter(Boolean);
}


/* =========================================================
   TEXT / NORMALIZATION
   ========================================================= */

function text(value) {
  return String(value ?? "").trim();
}


function normalize(value) {
  return text(value).toLowerCase();
}


function normalizePosition(value) {
  return normalize(value)
    .replaceAll(" ", "_")
    .replaceAll("-", "_");
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
   FORMATTING
   ========================================================= */

function formatPosition(value) {
  const key = normalizePosition(value);

  if (!key) {
    return "—";
  }

  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}


function formatRole(value) {
  const key = normalizePosition(value);

  const labels = {
    member: "Member",
    admin: "Admin",
    chairperson: "Chairperson",
    treasurer: "Treasurer",
    secretary: "Secretary"
  };

  return labels[key] || "Member";
}


function formatDate(value) {
  if (!value) {
    return "—";
  }

  const raw = text(value);

  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T00:00:00`)
      : new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );
}


function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return text(value);
  }

  return date.toLocaleString(
    "en-KE",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  );
}


function today() {
  const date = new Date();

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function formatMoney(value) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return "KSh 0.00";
  }

  return `KSh ${amount.toLocaleString(
    "en-KE",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  )}`;
}


function initials(name) {
  const parts =
    text(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

  if (!parts.length) {
    return "?";
  }

  return parts
    .map(
      (part) =>
        part.charAt(0).toUpperCase()
    )
    .join("");
}


/* =========================================================
   UUID
   ========================================================= */

function requestId() {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
    Math.random().toString(36).slice(2)
  ].join("-");
}


/* =========================================================
   STATUS / MESSAGE UI
   ========================================================= */

function showStatus(message) {
  const box =
    byId("membersStatus");

  if (!box) {
    return;
  }

  box.textContent =
    text(message);

  box.hidden =
    !message;
}


function showError(error) {
  const box =
    byId("membersError");

  if (!box) {
    return;
  }

  const message =
    error?.message ||
    text(error) ||
    "Unable to complete the request.";

  box.textContent =
    message;

  box.hidden =
    false;
}


function showSuccess(message) {
  const box =
    byId("membersSuccess");

  if (!box) {
    return;
  }

  box.textContent =
    text(message);

  box.hidden =
    !message;
}


function clearMessages() {
  [
    "membersError",
    "membersSuccess",
    "membersStatus",
    "formMessage"
  ].forEach(
    (id) => {
      const element =
        byId(id);

      if (!element) {
        return;
      }

      element.textContent = "";

      if (id !== "membersStatus") {
        element.hidden = true;
      }
    }
  );
}


function formMessage(
  message,
  type = "error"
) {
  const box =
    byId("formMessage");

  if (!box) {
    return;
  }

  box.textContent =
    text(message);

  box.dataset.type =
    type;

  box.hidden =
    !message;
}


/* =========================================================
   LOADING UI
   ========================================================= */

function setElementBusy(
  element,
  busy,
  busyText = "Working..."
) {
  if (!element) {
    return;
  }

  if (busy) {
    if (!element.dataset.originalText) {
      element.dataset.originalText =
        element.textContent;
    }

    element.disabled = true;

    if (
      element.tagName === "BUTTON" &&
      element.dataset.loadingText
    ) {
      element.textContent =
        element.dataset.loadingText;
    } else if (
      element.tagName === "BUTTON" &&
      busyText
    ) {
      element.textContent =
        busyText;
    }

    element.setAttribute(
      "aria-busy",
      "true"
    );

  } else {
    element.disabled = false;

    if (element.dataset.originalText) {
      element.textContent =
        element.dataset.originalText;

      delete element.dataset.originalText;
    }

    element.removeAttribute(
      "aria-busy"
    );
  }
}


function setPageLoading(
  loading,
  message = "Loading members..."
) {
  const candidates = [
    byId("membersLoading"),
    byId("adminLoading"),
    byId("pageLoading"),
    byId("loadingMembers")
  ].filter(Boolean);

  for (
    const element
    of candidates
  ) {
    element.hidden =
      !loading;

    if (loading) {
      const textElement =
        element.querySelector(
          "[data-loading-text]"
        );

      if (textElement) {
        textElement.textContent =
          message;
      } else if (
        element.children.length === 0
      ) {
        element.textContent =
          message;
      }
    }
  }

  document.body?.toggleAttribute(
    "data-members-loading",
    loading
  );
}


/* =========================================================
   MEMBER STATE
   ========================================================= */

function loginState(member) {
  return member?.user_id
    ? {
        key: "active",
        label: "Login Active"
      }
    : {
        key: "none",
        label: "No Login"
      };
}


function contributionState(position) {
  if (!position) {
    return {
      key: "unknown",
      label: "Unavailable"
    };
  }

  const arrears =
    Number(position.arrears ?? 0);

  const credit =
    Number(position.credit ?? 0);

  if (
    Number.isFinite(arrears) &&
    arrears > 0
  ) {
    return {
      key: "arrears",
      label: "Arrears"
    };
  }

  if (
    Number.isFinite(credit) &&
    credit > 0
  ) {
    return {
      key: "credit",
      label: "Credit"
    };
  }

  return {
    key: "paid",
    label: "Up to Date"
  };
}


function badge(
  label,
  kind
) {
  return `
    <span class="badge badge-${escapeHtml(kind)}">
      ${escapeHtml(label)}
    </span>
  `;
}


function memberById(id) {
  return (
    members.find(
      (member) =>
        String(member.id) ===
        String(id)
    ) ||
    null
  );
}


function rulesFor(id) {
  return (
    memberContributionRules.get(
      String(id)
    ) ||
    []
  );
}


function positionFor(id) {
  return (
    contributionPositions.get(id) ||
    contributionPositions.get(String(id)) ||
    null
  );
}


/* =========================================================
   CANONICAL ACCOUNTING REFRESH
   ========================================================= */

async function refreshAccounting(
  memberId
) {
  if (!memberId) {
    throw new Error(
      "Member ID is required for accounting refresh."
    );
  }

  const result =
    await membersApi.rpc(
      "refresh_my_managed_member_accounting",
      {
        p_member_id:
          memberId
      }
    );

  if (result?.error) {
    throw result.error;
  }

  return result?.data;
}


/* =========================================================
   CANONICAL CONTRIBUTION POSITION
   ========================================================= */

async function loadPosition(
  memberId
) {
  /*
   * Refresh is attempted first because this page must not
   * display a fabricated or stale calculated position.
   *
   * If refresh fails, the authoritative read is still
   * attempted. The page never invents values locally.
   */

  try {
    await refreshAccounting(
      memberId
    );
  } catch {
    /*
     * Intentionally silent.
     *
     * The authoritative position RPC below remains the
     * source of displayed accounting values.
     */
  }

  const result =
    await membersApi.rpc(
      "get_member_contribution_position",
      {
        p_member_id:
          memberId
      }
    );

  if (result?.error) {
    throw result.error;
  }

  const data =
    result?.data;

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
}


async function loadPositions() {
  contributionPositions =
    new Map();

  if (!members.length) {
    return;
  }

  /*
   * Parallel reads reduce the chance of the page appearing
   * frozen while a large membership list is processed.
   *
   * Each member remains isolated: one failed accounting
   * read does not erase the others.
   */

  const results =
    await Promise.allSettled(
      members
        .filter(
          (member) =>
            Boolean(member?.id)
        )
        .map(
          async (member) => ({
            memberId:
              member.id,
            position:
              await loadPosition(
                member.id
              )
          })
        )
    );

  for (
    const result
    of results
  ) {
    if (
      result.status !==
      "fulfilled"
    ) {
      continue;
    }

    const {
      memberId,
      position
    } =
      result.value;

    if (position) {
      contributionPositions.set(
        memberId,
        position
      );
    }
  }
}


/* =========================================================
   LOAD MEMBERS
   ========================================================= */

async function loadMembers() {
  if (!groupId) {
    throw new Error(
      "The current group could not be determined."
    );
  }

  const result =
    await membersApi.list(
      groupId
    );

  if (result?.error) {
    throw result.error;
  }

  members =
    Array.isArray(result?.data)
      ? result.data
      : [];

  /*
   * IMPORTANT:
   * No filtering by:
   *   status
   *   onboarding_status
   *   user_id
   *
   * The canonical members API determines the membership
   * population for this group.
   */
}


/* =========================================================
   CONTRIBUTION TYPES
   ========================================================= */

async function loadContributionTypes() {
  if (!groupId) {
    contributionTypes = [];
    monthlyContributionType = null;
    return;
  }

  const result =
    await membersApi.contributionTypes(
      groupId
    );

  if (result?.error) {
    throw result.error;
  }

  contributionTypes =
    Array.isArray(result?.data)
      ? result.data
      : [];

  monthlyContributionType =
    contributionTypes.find(
      (type) =>
        normalize(type.code) ===
          "monthly" ||
        normalize(type.name) ===
          "monthly"
    ) ||
    null;
}


/* =========================================================
   CONTRIBUTION RULES
   ========================================================= */

async function loadRules() {
  memberContributionRules =
    new Map();

  if (
    !groupId ||
    !members.length
  ) {
    return;
  }

  const ids =
    members
      .map(
        (member) =>
          member.id
      )
      .filter(Boolean);

  if (!ids.length) {
    return;
  }

  const result =
    await membersApi.contributionRules(
      groupId,
      ids
    );

  if (result?.error) {
    throw result.error;
  }

  const rows =
    Array.isArray(result?.data)
      ? result.data
      : [];

  for (
    const rule
    of rows
  ) {
    if (!rule?.member_id) {
      continue;
    }

    const key =
      String(
        rule.member_id
      );

    if (
      !memberContributionRules.has(
        key
      )
    ) {
      memberContributionRules.set(
        key,
        []
      );
    }

    memberContributionRules
      .get(key)
      .push(rule);
  }
}


/* =========================================================
   RELOAD DATA
   ========================================================= */

async function reloadData() {
  if (pageBusy) {
    return;
  }

  pageBusy = true;

  setPageLoading(
    true,
    "Loading members..."
  );

  showStatus(
    "Loading members..."
  );

  try {
    await loadMembers();

    /*
     * Contribution types are required for the Add Member
     * workflow, so a failure here is a real page-level
     * failure.
     */
    await loadContributionTypes();

    /*
     * Rules and positions are important but should not
     * white-screen the entire membership page if a
     * non-critical read fails.
     */
    await Promise.allSettled([
      loadRules(),
      loadPositions()
    ]);

    visibleMembers =
      [...members];

    updateCounts();

    renderMembers();

    showStatus("");

  } finally {
    pageBusy = false;

    setPageLoading(
      false
    );
  }
}


/* =========================================================
   COUNTERS
   ========================================================= */

function updateCounts() {
  const total =
    members.length;

  const active =
    members.filter(
      (member) =>
        normalize(
          member.status
        ) === "active"
    ).length;

  const login =
    members.filter(
      (member) =>
        Boolean(
          member.user_id
        )
    ).length;

  const noLogin =
    total - login;

  const values = {
    memberCount:
      total,

    totalMembers:
      total,

    activeMembers:
      active,

    loginMembers:
      login,

    noLoginMembers:
      noLogin
  };

  for (
    const [
      id,
      value
    ]
    of Object.entries(
      values
    )
  ) {
    const element =
      byId(id);

    if (element) {
      element.textContent =
        String(value);
    }
  }
}


/* =========================================================
   SEARCH
   ========================================================= */

function applySearch() {
  const query =
    normalize(
      byId(
        "memberSearch"
      )?.value
    );

  if (!query) {
    visibleMembers =
      [...members];
  } else {
    visibleMembers =
      members.filter(
        (member) =>
          [
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
          ].some(
            (value) =>
              normalize(
                value
              ).includes(
                query
              )
          )
      );
  }

  renderMembers();
}


/* =========================================================
   RENDER MEMBERS
   ========================================================= */

function renderMembers() {
  const body =
    byId("memberRows");

  const cards =
    byId("memberCards");

  if (body) {
    body.replaceChildren();

    if (!visibleMembers.length) {
      const row =
        document.createElement("tr");

      row.innerHTML = `
        <td
          colspan="13"
          class="empty-state"
        >
          No members found.
        </td>
      `;

      body.appendChild(row);
    } else {
      for (
        const member
        of visibleMembers
      ) {
        body.appendChild(
          createRow(member)
        );
      }
    }
  }

  if (cards) {
    cards.replaceChildren();

    if (!visibleMembers.length) {
      const empty =
        document.createElement("div");

      empty.className =
        "empty-state";

      empty.textContent =
        "No members found.";

      cards.appendChild(empty);
    } else {
      for (
        const member
        of visibleMembers
      ) {
        cards.appendChild(
          createCard(member)
        );
      }
    }
  }

  const count =
    byId("memberResultCount");

  if (count) {
    count.textContent =
      `${visibleMembers.length} member${
        visibleMembers.length === 1
          ? ""
          : "s"
      }`;
  }
}


/* =========================================================
   DESKTOP ROW
   ========================================================= */

function createRow(member) {
  const position =
    positionFor(member.id);

  const state =
    contributionState(position);

  const login =
    loginState(member);

  const row =
    document.createElement("tr");

  row.dataset.memberId =
    String(member.id);

  row.innerHTML = `
    <td>
      ${escapeHtml(
        member.member_number ||
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
        </div>
      </div>
    </td>

    <td>
      ${escapeHtml(
        member.national_id ||
        "—"
      )}
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
      ${escapeHtml(
        formatRole(member.role)
      )}
    </td>

    <td>
      ${escapeHtml(
        formatPosition(
          member.actual_position
        )
      )}

      ${
        member.actual_position_name
          ? `
            <span class="subtext">
              ${escapeHtml(
                member.actual_position_name
              )}
            </span>
          `
          : ""
      }
    </td>

    <td>
      ${
        normalize(member.status) ===
        "active"
          ? badge(
              "Active",
              "active"
            )
          : badge(
              formatPosition(
                member.status
              ),
              "inactive"
            )
      }
    </td>

    <td>
      ${badge(
        formatPosition(
          member.onboarding_status
        ),
        normalize(
          member.onboarding_status
        ) === "active"
          ? "active"
          : "pending"
      )}
    </td>

    <td>
      ${badge(
        state.label,
        state.key
      )}
    </td>

    <td>
      ${badge(
        login.label,
        login.key
      )}
    </td>

    <td>
      <div class="action-row">

        <button
          type="button"
          class="btn btn-small"
          data-action="view"
          data-member-id="${escapeHtml(
            member.id
          )}"
        >
          View
        </button>

        <button
          type="button"
          class="btn btn-small"
          data-action="edit"
          data-member-id="${escapeHtml(
            member.id
          )}"
        >
          Edit
        </button>

      </div>
    </td>
  `;

  return row;
}


/* =========================================================
   MOBILE CARD
   ========================================================= */

function createCard(member) {
  const position =
    positionFor(member.id);

  const state =
    contributionState(position);

  const login =
    loginState(member);

  const card =
    document.createElement("article");

  card.className =
    "member-card";

  card.dataset.memberId =
    String(member.id);

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
              "—"
            )}
          </small>
        </div>

      </div>

      ${badge(
        state.label,
        state.key
      )}

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
        <dt>Status</dt>
        <dd>
          ${escapeHtml(
            formatPosition(
              member.status
            )
          )}
        </dd>
      </div>

      <div>
        <dt>Role</dt>
        <dd>
          ${escapeHtml(
            formatRole(
              member.role
            )
          )}
        </dd>
      </div>

      <div>
        <dt>Actual Position</dt>
        <dd>
          ${escapeHtml(
            formatPosition(
              member.actual_position
            )
          )}
        </dd>
      </div>

      <div>
        <dt>Phone</dt>
        <dd>
          ${escapeHtml(
            member.phone ||
            "—"
          )}
        </dd>
      </div>

      <div>
        <dt>Login</dt>
        <dd>
          ${escapeHtml(
            login.label
          )}
        </dd>
      </div>

    </dl>

    <div class="action-row">

      <button
        type="button"
        class="btn btn-small"
        data-action="view"
        data-member-id="${escapeHtml(
          member.id
        )}"
      >
        View
      </button>

      <button
        type="button"
        class="btn btn-small"
        data-action="edit"
        data-member-id="${escapeHtml(
          member.id
        )}"
      >
        Edit
      </button>

    </div>
  `;

  return card;
}


/* =========================================================
   OPEN MEMBER FORM
   ========================================================= */

function openMemberForm(
  member = null
) {
  const panel =
    byId("addMemberPanel");

  const title =
    byId("memberFormTitle");

  const description =
    byId("memberFormDescription");

  const form =
    byId("addMemberForm");

  if (!panel || !form) {
    return;
  }

  editingMemberId =
    member?.id ||
    null;

  form.reset();

  formMessage("");

  if (editingMemberId) {
    if (title) {
      title.textContent =
        "Edit Member";
    }

    if (description) {
      description.textContent =
        "Update member profile information. Accounting history is changed only through the canonical accounting workflows.";
    }

    populateMemberForm(
      member
    );

    const historical =
      byId(
        "memberHistoricalEnabled"
      );

    if (historical) {
      historical.value =
        "false";

      historical.disabled =
        true;
    }

    const notice =
      byId(
        "memberFormAccountingNotice"
      );

    if (notice) {
      notice.hidden =
        false;
    }

    /*
     * Existing members can change their actual position,
     * but the save operation below uses the canonical
     * position-history RPC.
     */
    setPositionFieldsEnabled(
      true
    );

  } else {
    if (title) {
      title.textContent =
        "Add Member";
    }

    if (description) {
      description.textContent =
        "Create the member and establish the initial Monthly contribution plan.";
    }

    const joinDate =
      byId(
        "memberJoinDate"
      );

    if (joinDate) {
      joinDate.value =
        today();
    }

    const effectiveDate =
      byId(
        "memberContributionEffectiveFrom"
      );

    if (effectiveDate) {
      effectiveDate.value =
        joinDate?.value ||
        today();
    }

    const positionDate =
      byId(
        "memberActualPositionEffectiveFrom"
      );

    if (positionDate) {
      positionDate.value =
        joinDate?.value ||
        today();
    }

    const role =
      byId("memberRole");

    if (role) {
      role.value =
        "member";
    }

    const status =
      byId("memberStatus");

    if (status) {
      status.value =
        "active";
    }

    const historical =
      byId(
        "memberHistoricalEnabled"
      );

    if (historical) {
      historical.disabled =
        false;

      historical.value =
        "false";
    }

    const notice =
      byId(
        "memberFormAccountingNotice"
      );

    if (notice) {
      notice.hidden =
        true;
    }

    setPositionFieldsEnabled(
      true
    );

    if (
      monthlyContributionType &&
      currentGroup
    ) {
      const amount =
        byId(
          "memberContributionAmount"
        );

      if (amount) {
        const groupAmount =
          Number(
            currentGroup.monthly_contribution
          );

        const typeAmount =
          Number(
            monthlyContributionType.default_amount
          );

        const defaultAmount =
          Number.isFinite(groupAmount) &&
          groupAmount > 0
            ? groupAmount
            : (
                Number.isFinite(
                  typeAmount
                ) &&
                typeAmount > 0
                  ? typeAmount
                  : 0
              );

        amount.value =
          defaultAmount || "";
      }
    }
  }

  updatePositionNameField();
  updateHistoricalFields();
  updateContributionPreview();
  updateHistoricalPreview();

  panel.hidden =
    false;

  panel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


/* =========================================================
   POSITION FORM ENABLEMENT
   ========================================================= */

function setPositionFieldsEnabled(
  enabled
) {
  [
    "memberActualPosition",
    "memberActualPositionName",
    "memberActualPositionEffectiveFrom"
  ].forEach(
    (id) => {
      const element =
        byId(id);

      if (element) {
        element.disabled =
          !enabled;
      }
    }
  );
}


/* =========================================================
   POPULATE MEMBER FORM
   ========================================================= */

function populateMemberForm(
  member
) {
  const values = {
    memberNumber:
      member.member_number,

    memberMembershipNumber:
      member.membership_number ||
      member.member_number,

    memberName:
      member.name,

    memberNationalId:
      member.national_id,

    memberPhone:
      member.phone,

    memberEmail:
      member.email,

    memberRole:
      SECURITY_ROLES.has(
        normalizePosition(
          member.role
        )
      )
        ? normalizePosition(
            member.role
          )
        : "member",

    memberStatus:
      normalize(
        member.status
      ) === "inactive"
        ? "inactive"
        : "active",

    memberJoinDate:
      member.join_date,

    memberActualPosition:
      POSITIONS.has(
        normalizePosition(
          member.actual_position
        )
      )
        ? normalizePosition(
            member.actual_position
          )
        : "",

    memberActualPositionName:
      member.actual_position_name ||
      "",

    memberActualPositionEffectiveFrom:
      today()
  };

  for (
    const [
      id,
      value
    ]
    of Object.entries(values)
  ) {
    const element =
      byId(id);

    if (element) {
      element.value =
        value ?? "";
    }
  }

  const monthlyRule =
    rulesFor(member.id).find(
      (rule) =>
        normalize(
          rule.contribution_type_code
        ) === "monthly" ||
        normalize(
          rule.contribution_type_name
        ) === "monthly" ||
        normalize(
          rule.frequency
        ) === "monthly"
    );

  if (monthlyRule) {
    const amount =
      byId(
        "memberContributionAmount"
      );

    const effective =
      byId(
        "memberContributionEffectiveFrom"
      );

    const firstPeriod =
      byId(
        "memberFirstPeriodRule"
      );

    if (amount) {
      amount.value =
        monthlyRule.amount ??
        "";
    }

    if (effective) {
      effective.value =
        monthlyRule.effective_from ||
        member.join_date ||
        today();
    }

    if (firstPeriod) {
      firstPeriod.value =
        monthlyRule.first_period_rule ||
        "full_period";
    }
  }
}


/* =========================================================
   CLOSE MEMBER FORM
   ========================================================= */

function closeMemberForm() {
  const panel =
    byId("addMemberPanel");

  if (panel) {
    panel.hidden =
      true;
  }

  editingMemberId =
    null;

  formMessage("");
}


/* =========================================================
   FORM VALUES
   ========================================================= */

function getFormValues() {
  return {
    member_number:
      text(
        byId(
          "memberNumber"
        )?.value
      ),

    membership_number:
      text(
        byId(
          "memberMembershipNumber"
        )?.value
      ),

    name:
      text(
        byId(
          "memberName"
        )?.value
      ),

    national_id:
      text(
        byId(
          "memberNationalId"
        )?.value
      ),

    phone:
      text(
        byId(
          "memberPhone"
        )?.value
      ),

    email:
      text(
        byId(
          "memberEmail"
        )?.value
      ),

    role:
      normalizePosition(
        byId(
          "memberRole"
        )?.value
      ),

    status:
      normalize(
        byId(
          "memberStatus"
        )?.value
      ),

    join_date:
      byId(
        "memberJoinDate"
      )?.value ||
      "",

    actual_position:
      normalizePosition(
        byId(
          "memberActualPosition"
        )?.value
      ),

    actual_position_name:
      text(
        byId(
          "memberActualPositionName"
        )?.value
      ),

    actual_position_effective_from:
      byId(
        "memberActualPositionEffectiveFrom"
      )?.value ||
      "",

    contribution_amount:
      Number(
        byId(
          "memberContributionAmount"
        )?.value ||
        0
      ),

    contribution_effective_from:
      byId(
        "memberContributionEffectiveFrom"
      )?.value ||
      "",

    first_period_rule:
      byId(
        "memberFirstPeriodRule"
      )?.value ||
      "full_period",

    historical_enabled:
      byId(
        "memberHistoricalEnabled"
      )?.value === "true",

    historical_paid_through:
      byId(
        "memberHistoricalPaidThrough"
      )?.value ||
      "",

    historical_payment_method:
      byId(
        "memberHistoricalPaymentMethod"
      )?.value ||
      ""
  };
}


/* =========================================================
   FORM VALIDATION
   ========================================================= */

function validateForm(
  values
) {
  if (!values.member_number) {
    return "Member number is required.";
  }

  if (
    !/^\d{4}$/.test(
      values.member_number
    )
  ) {
    return "Member number must contain exactly 4 digits.";
  }

  if (
    values.membership_number &&
    !/^\d{4}$/.test(
      values.membership_number
    )
  ) {
    return "Membership number must contain exactly 4 digits.";
  }

  if (!values.name) {
    return "Member name is required.";
  }

  if (!values.phone) {
    return "Phone number is required.";
  }

  if (
    !SECURITY_ROLES.has(
      values.role
    )
  ) {
    return "Select a valid security role.";
  }

  if (
    !VALID_MEMBER_STATUSES.has(
      values.status
    )
  ) {
    return "Select a valid member status.";
  }

  if (!values.join_date) {
    return "Join date is required.";
  }

  if (
    !editingMemberId &&
    !monthlyContributionType
  ) {
    return "The Monthly contribution type could not be found for this group.";
  }

  if (!editingMemberId) {
    if (
      !Number.isFinite(
        values.contribution_amount
      )
    ) {
      return "Enter a valid monthly contribution amount.";
    }

    if (
      values.contribution_amount <= 0
    ) {
      return "Monthly contribution amount must be greater than zero.";
    }

    if (
      !values.contribution_effective_from
    ) {
      return "Contribution effective date is required.";
    }

    if (
      !VALID_FIRST_PERIOD_RULES.has(
        values.first_period_rule
      )
    ) {
      return "Select a valid first-period rule.";
    }
  }

  if (
    values.actual_position &&
    !POSITIONS.has(
      values.actual_position
    )
  ) {
    return "Select a valid actual group position.";
  }

  if (
    values.actual_position ===
      "other" &&
    !values.actual_position_name
  ) {
    return "Enter the actual position name when selecting Other.";
  }

  /*
   * Position effective date is required whenever a position
   * is supplied.
   */
  if (
    values.actual_position &&
    !values.actual_position_effective_from
  ) {
    return "Actual position effective date is required.";
  }

  /*
   * Historical onboarding is creation-only.
   */
  if (
    values.historical_enabled &&
    editingMemberId
  ) {
    return "Historical contribution onboarding is only available when creating a new member.";
  }

  if (
    values.historical_enabled &&
    !values.historical_paid_through
  ) {
    return "Historical Paid Through date is required.";
  }

  if (
    values.historical_enabled &&
    values.historical_paid_through >
      today()
  ) {
    return "Historical Paid Through cannot be in the future.";
  }

  if (
    values.historical_enabled &&
    !values.historical_payment_method
  ) {
    return "Select the historical payment method.";
  }

  return true;
}


/* =========================================================
   DUPLICATE MEMBER NUMBER
   ========================================================= */

function checkDuplicateMemberNumber(
  memberNumber
) {
  const duplicate =
    members.find(
      (member) =>
        normalize(
          member.member_number
        ) ===
          normalize(
            memberNumber
          ) &&
        String(member.id) !==
          String(
            editingMemberId ||
            ""
          )
    );

  return Boolean(
    duplicate
  );
}


/* =========================================================
   HISTORICAL PAYMENT METHOD
   ========================================================= */

function normalizeHistoricalPaymentMethod(
  value
) {
  const normalized =
    normalizePosition(value);

  if (
    normalized ===
    "mpesa"
  ) {
    return "mpesa";
  }

  if (
    normalized ===
    "bank_transfer"
  ) {
    return "bank_transfer";
  }

  return "cash";
}


/* =========================================================
   POSITION NAME FIELD
   ========================================================= */

function updatePositionNameField() {
  const position =
    normalizePosition(
      byId(
        "memberActualPosition"
      )?.value
    );

  const field =
    byId(
      "memberActualPositionNameField"
    );

  const input =
    byId(
      "memberActualPositionName"
    );

  const isOther =
    position === "other";

  if (field) {
    field.hidden =
      !isOther;
  }

  if (input) {
    input.disabled =
      !isOther;

    if (!isOther) {
      input.value =
        "";
    }
  }
}


/* =========================================================
   HISTORICAL FORM
   ========================================================= */

function updateHistoricalFields() {
  const enabled =
    byId(
      "memberHistoricalEnabled"
    )?.value === "true";

  const controls =
    byId(
      "historicalContributionControls"
    );

  const paidThrough =
    byId(
      "memberHistoricalPaidThrough"
    );

  const method =
    byId(
      "memberHistoricalPaymentMethod"
    );

  if (controls) {
    controls.hidden =
      !enabled;
  }

  if (paidThrough) {
    paidThrough.disabled =
      !enabled;
  }

  if (method) {
    method.disabled =
      !enabled;
  }

  if (!enabled) {
    if (paidThrough) {
      paidThrough.value =
        "";
    }

    if (method) {
      method.value =
        "";
    }
  }

  updateHistoricalPreview();
}


/* =========================================================
   CONTRIBUTION PREVIEW
   ========================================================= */

function updateContributionPreview() {
  const preview =
    byId(
      "memberContributionPreview"
    );

  if (!preview) {
    return;
  }

  const amount =
    Number(
      byId(
        "memberContributionAmount"
      )?.value ||
      0
    );

  const effectiveFrom =
    byId(
      "memberContributionEffectiveFrom"
    )?.value ||
    "";

  const firstPeriod =
    byId(
      "memberFirstPeriodRule"
    )?.value ||
    "full_period";

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !effectiveFrom
  ) {
    preview.textContent =
      "Enter the Monthly amount and effective date. Final obligations are created by the canonical accounting workflow.";

    return;
  }

  preview.textContent =
    `Monthly plan: ${formatMoney(
      amount
    )} from ${formatDate(
      effectiveFrom
    )}. First-period rule: ${formatPosition(
      firstPeriod
    )}.`;
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
    )?.value === "true";

  if (!enabled) {
    preview.textContent =
      "No historical contribution onboarding selected.";

    return;
  }

  const paid =
    byId(
      "memberHistoricalPaidThrough"
    )?.value ||
    "";

  const method =
    byId(
      "memberHistoricalPaymentMethod"
    )?.value ||
    "";

  const amount =
    Number(
      byId(
        "memberContributionAmount"
      )?.value ||
      0
    );

  if (!paid) {
    preview.textContent =
      "Select Paid Through and payment method. Future dates are not allowed.";

    return;
  }

  preview.textContent =
    `Historical onboarding: ${formatMoney(
      amount
    )} monthly through ${formatDate(
      paid
    )} using ${formatPosition(
      method
    )}. The backend validates and records the authoritative accounting state.`;
}


/* =========================================================
   RULE RENDERING
   ========================================================= */

function renderRules(
  memberId
) {
  const container =
    byId(
      "memberContributionRules"
    );

  if (!container) {
    return;
  }

  const rules =
    rulesFor(memberId);

  container.replaceChildren();

  if (!rules.length) {
    const paragraph =
      document.createElement("p");

    paragraph.className =
      "empty-state compact";

    paragraph.textContent =
      "No contribution rule is currently visible for this member.";

    container.appendChild(
      paragraph
    );

    return;
  }

  for (
    const rule
    of rules
  ) {
    const div =
      document.createElement("div");

    div.className =
      "rule-card";

    div.innerHTML = `
      <strong>
        ${
          rule.amount == null
            ? "—"
            : escapeHtml(
                formatMoney(
                  rule.amount
                )
              )
        }
      </strong>

      <span>
        ${escapeHtml(
          formatPosition(
            rule.frequency
          )
        )}
      </span>

      <span>
        From
        ${escapeHtml(
          formatDate(
            rule.effective_from
          )
        )}
      </span>

      <span>
        To
        ${escapeHtml(
          formatDate(
            rule.effective_to
          )
        )}
      </span>

      <span>
        ${escapeHtml(
          formatPosition(
            rule.first_period_rule
          )
        )}
      </span>

      <span>
        ${escapeHtml(
          formatPosition(
            rule.status
          )
        )}
      </span>
    `;

    container.appendChild(
      div
    );
  }
}


/* =========================================================
   MEMBER MODAL
   ========================================================= */

function renderModal(
  member
) {
  const modal =
    byId("memberModal");

  if (!modal) {
    return;
  }

  selectedMemberId =
    member.id;

  const position =
    positionFor(member.id);

  const state =
    contributionState(
      position
    );

  const set = (
    id,
    value
  ) => {
    const element =
      byId(id);

    if (element) {
      element.textContent =
        value ?? "—";
    }
  };

  set(
    "viewMemberInitials",
    initials(member.name)
  );

  set(
    "viewMemberName",
    member.name ||
      "Member"
  );

  set(
    "viewMemberNumber",
    member.member_number ||
      "—"
  );

  set(
    "viewMemberNumberDetail",
    member.member_number ||
      "—"
  );

  set(
    "viewMemberMembershipNumber",
    member.membership_number ||
      member.member_number ||
      "—"
  );

  set(
    "viewMemberNationalId",
    member.national_id ||
      "—"
  );

  set(
    "viewMemberPhone",
    member.phone ||
      "—"
  );

  set(
    "viewMemberEmail",
    member.email ||
      "—"
  );

  set(
    "viewMemberRole",
    formatRole(
      member.role
    )
  );

  const positionLabel =
    formatPosition(
      member.actual_position
    );

  set(
    "viewMemberActualPosition",
    member.actual_position_name
      ? `${positionLabel} (${member.actual_position_name})`
      : positionLabel
  );

  set(
    "viewMemberStatus",
    formatPosition(
      member.status
    )
  );

  set(
    "viewMemberOnboardingStatus",
    formatPosition(
      member.onboarding_status
    )
  );

  set(
    "viewMemberJoinDate",
    formatDate(
      member.join_date
    )
  );

  set(
    "viewMemberActivatedAt",
    formatDateTime(
      member.activated_at
    )
  );

  set(
    "viewContributionStatus",
    state.label
  );

  set(
    "viewContributionDue",
    position
      ? formatMoney(
          position.total_due
        )
      : "—"
  );

  set(
    "viewContributionAllocated",
    position
      ? formatMoney(
          position.total_allocated
        )
      : "—"
  );

  set(
    "viewContributionArrears",
    position
      ? formatMoney(
          position.arrears
        )
      : "—"
  );

  set(
    "viewContributionCredit",
    position
      ? formatMoney(
          position.credit
        )
      : "—"
  );

  /*
   * IMPORTANT:
   *
   * Do NOT calculate:
   *
   * total_allocated + credit
   *
   * The canonical position is authoritative.
   */
  set(
    "viewContributionTotal",
    position
      ? formatMoney(
          position.total_due
        )
      : "—"
  );

  renderRules(
    member.id
  );

  const reconcile =
    byId(
      "reconcileHistoricalPayments"
    );

  if (reconcile) {
    reconcile.dataset.memberId =
      String(member.id);
  }

  const positionValue =
    byId(
      "positionChangeValue"
    );

  const positionName =
    byId(
      "positionChangeName"
    );

  const effectiveFrom =
    byId(
      "positionChangeEffectiveFrom"
    );

  if (positionValue) {
    positionValue.value =
      POSITIONS.has(
        normalizePosition(
          member.actual_position
        )
      )
        ? normalizePosition(
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
      today();
  }

  updateModalPositionName();

  modal.hidden =
    false;
}


/* =========================================================
   CLOSE MODAL
   ========================================================= */

function closeModal() {
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
   MODAL POSITION UI
   ========================================================= */

function updateModalPositionName() {
  const value =
    normalizePosition(
      byId(
        "positionChangeValue"
      )?.value
    );

  const field =
    byId(
      "positionChangeNameField"
    );

  const input =
    byId(
      "positionChangeName"
    );

  const isOther =
    value === "other";

  if (field) {
    field.hidden =
      !isOther;
  }

  if (input) {
    input.disabled =
      !isOther;

    if (!isOther) {
      input.value =
        "";
    }
  }
}


/* =========================================================
   SAVE POSITION CHANGE
   ========================================================= */

async function savePositionChange() {
  if (positionBusy) {
    return;
  }

  const member =
    memberById(
      selectedMemberId
    );

  if (!member) {
    return;
  }

  const button =
    byId(
      "savePositionChange"
    );

  const position =
    normalizePosition(
      byId(
        "positionChangeValue"
      )?.value
    );

  const name =
    text(
      byId(
        "positionChangeName"
      )?.value
    );

  const effective =
    byId(
      "positionChangeEffectiveFrom"
    )?.value ||
    "";

  if (
    !POSITIONS.has(
      position
    )
  ) {
    showError(
      new Error(
        "Select a valid actual group position."
      )
    );

    return;
  }

  if (
    position === "other" &&
    !name
  ) {
    showError(
      new Error(
        "Enter the position name when selecting Other."
      )
    );

    return;
  }

  if (!effective) {
    showError(
      new Error(
        "Position effective date is required."
      )
    );

    return;
  }

  const currentPosition =
    normalizePosition(
      member.actual_position
    );

  const currentName =
    text(
      member.actual_position_name
    );

  const newName =
    position === "other"
      ? name
      : "";

  if (
    currentPosition === position &&
    currentName === newName
  ) {
    showSuccess(
      "No position change was required."
    );

    return;
  }

  const confirmed =
    window.confirm(
      `Set ${member.name}'s actual position to ${formatPosition(
        position
      )} effective ${formatDate(
        effective
      )}?`
    );

  if (!confirmed) {
    return;
  }

  positionBusy =
    true;

  setElementBusy(
    button,
    true,
    "Saving..."
  );

  clearMessages();

  showStatus(
    "Saving actual group position..."
  );

  try {
    const result =
      await membersApi.rpc(
        "set_member_actual_position",
        {
          p_member_id:
            member.id,

          p_actual_position:
            position,

          p_actual_position_name:
            position === "other"
              ? name
              : null,

          p_effective_from:
            effective
        }
      );

    if (result?.error) {
      throw result.error;
    }

    await reloadData();

    const refreshedMember =
      memberById(
        member.id
      );

    showStatus("");

    if (refreshedMember) {
      renderModal(
        refreshedMember
      );
    }

    showSuccess(
      "Actual group position updated through the canonical position-history workflow."
    );

  } catch (error) {
    showStatus("");

    showError(
      error
    );
  } finally {
    positionBusy =
      false;

    setElementBusy(
      button,
      false
    );
  }
}


/* =========================================================
   HISTORICAL RECONCILIATION
   ========================================================= */

async function reconcileSelectedMember() {
  if (reconcileBusy) {
    return;
  }

  const member =
    memberById(
      selectedMemberId
    );

  if (!member) {
    return;
  }

  const confirmed =
    window.confirm(
      `Reconcile existing historical payments for ${member.name}?`
    );

  if (!confirmed) {
    return;
  }

  const button =
    byId(
      "reconcileHistoricalPayments"
    );

  reconcileBusy =
    true;

  setElementBusy(
    button,
    true,
    "Reconciling..."
  );

  clearMessages();

  showStatus(
    "Reconciling historical payments..."
  );

  try {
    const result =
      await membersApi.rpc(
        "reconcile_member_historical_payments",
        {
          p_member_id:
            member.id,

          p_through_date:
            null
        }
      );

    if (result?.error) {
      throw result.error;
    }

    const data =
      result?.data;

    await reloadData();

    const refreshedMember =
      memberById(
        member.id
      );

    showStatus("");

    if (refreshedMember) {
      renderModal(
        refreshedMember
      );
    }

    showSuccess(
      data?.message ||
      "Historical payments reconciled successfully."
    );

  } catch (error) {
    showStatus("");

    showError(
      error
    );
  } finally {
    reconcileBusy =
      false;

    setElementBusy(
      button,
      false
    );
  }
}


/* =========================================================
   POSITION CHANGE DETECTION
   ========================================================= */

function positionChanged(
  member,
  values
) {
  if (!member) {
    return false;
  }

  const oldPosition =
    normalizePosition(
      member.actual_position
    );

  const newPosition =
    normalizePosition(
      values.actual_position
    );

  const oldName =
    text(
      member.actual_position_name
    );

  const newName =
    newPosition === "other"
      ? text(
          values.actual_position_name
        )
      : "";

  return (
    oldPosition !== newPosition ||
    oldName !== newName
  );
}


/* =========================================================
   SAVE MEMBER
   ========================================================= */

async function saveMember(
  event
) {
  event?.preventDefault();

  if (saveBusy) {
    return;
  }

  clearMessages();

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
    formMessage(
      validation
    );

    return;
  }

  saveBusy =
    true;

  const submitButton =
    byId(
      "addMemberForm"
    )?.querySelector(
      'button[type="submit"]'
    );

  setElementBusy(
    submitButton,
    true,
    editingMemberId
      ? "Saving..."
      : "Creating..."
  );

  try {
    const duplicate =
      checkDuplicateMemberNumber(
        values.member_number
      );

    if (duplicate) {
      formMessage(
        "That member number is already in use in this group."
      );

      return;
    }

    /* =====================================================
       EXISTING MEMBER
       ===================================================== */

    if (editingMemberId) {
      const existingMember =
        memberById(
          editingMemberId
        );

      if (!existingMember) {
        throw new Error(
          "The member being edited could not be found."
        );
      }

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

      const updateResult =
        await membersApi.updateMember(
          groupId,
          editingMemberId,
          updatePayload
        );

      if (updateResult?.error) {
        throw updateResult.error;
      }

      /*
       * Profile update is complete.
       *
       * Actual position history is separate and must use
       * the canonical position RPC.
       */
      if (
        positionChanged(
          existingMember,
          values
        )
      ) {
        if (
          !values.actual_position
        ) {
          throw new Error(
            "Select an actual position before saving the position change."
          );
        }

        if (
          !values.actual_position_effective_from
        ) {
          throw new Error(
            "Actual position effective date is required."
          );
        }

        const positionResult =
          await membersApi.rpc(
            "set_member_actual_position",
            {
              p_member_id:
                editingMemberId,

              p_actual_position:
                values.actual_position,

              p_actual_position_name:
                values.actual_position ===
                  "other"
                  ? values.actual_position_name
                  : null,

              p_effective_from:
                values.actual_position_effective_from
            }
          );

        if (positionResult?.error) {
          throw positionResult.error;
        }
      }

      await reloadData();

      closeMemberForm();

      showSuccess(
        "Member details updated successfully. Accounting history remains under the canonical accounting and position-history workflows."
      );

      return;
    }


    /* =====================================================
       NEW MEMBER
       ===================================================== */

    if (
      !monthlyContributionType?.id
    ) {
      throw new Error(
        "The Monthly contribution type could not be found for this group."
      );
    }

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


    let result = null;


    /* =====================================================
       HISTORICAL MEMBER CREATION
       ===================================================== */

    if (
      values.historical_enabled
    ) {
      const rpcResult =
        await membersApi.rpc(
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
              requestId()
          }
        );

      if (rpcResult?.error) {
        throw rpcResult.error;
      }

      result =
        rpcResult?.data;
    } else {
      /* ===================================================
         NORMAL MEMBER CREATION
         =================================================== */

      const rpcResult =
        await membersApi.rpc(
          "create_member_with_contribution_plan",
          {
            p_member:
              memberPayload,

            p_contribution_plan:
              contributionPlan
          }
        );

      if (rpcResult?.error) {
        throw rpcResult.error;
      }

      result =
        rpcResult?.data;
    }


    await reloadData();

    closeMemberForm();

    showSuccess(
      values.historical_enabled
        ? "Member created and historical contribution onboarding was processed through the canonical accounting workflow."
        : "Member created and the initial Monthly contribution plan was established through the canonical accounting workflow."
    );


    /*
     * Session storage is informational only.
     * Failure here must never affect member creation.
     */
    try {
      const row =
        Array.isArray(result)
          ? result[0]
          : result;

      const createdMemberId =
        row?.member_id ||
        row?.id ||
        null;

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
      /*
       * Non-critical.
       */
    }

  } catch (error) {
    formMessage(
      error?.message ||
      "Unable to save the member."
    );
  } finally {
    saveBusy =
      false;

    setElementBusy(
      submitButton,
      false
    );
  }
}


/* =========================================================
   EVENT HELPERS
   ========================================================= */

function closestActionButton(
  event
) {
  const target =
    event.target;

  if (
    !target ||
    typeof target.closest !==
      "function"
  ) {
    return null;
  }

  return target.closest(
    "[data-action]"
  );
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

  byId(
    "addMemberButton"
  )?.addEventListener(
    "click",
    () => {
      if (
        !pageBusy &&
        !saveBusy
      ) {
        openMemberForm();
      }
    }
  );


  /* -------------------------------------------------------
     CLOSE MEMBER FORM
     ------------------------------------------------------- */

  byId(
    "closeAddMember"
  )?.addEventListener(
    "click",
    closeMemberForm
  );


  byId(
    "cancelAddMember"
  )?.addEventListener(
    "click",
    closeMemberForm
  );


  /* -------------------------------------------------------
     FORM SUBMIT
     ------------------------------------------------------- */

  byId(
    "addMemberForm"
  )?.addEventListener(
    "submit",
    saveMember
  );


  /* -------------------------------------------------------
     REFRESH
     ------------------------------------------------------- */

  byId(
    "refreshMembers"
  )?.addEventListener(
    "click",
    async (event) => {
      if (pageBusy) {
        return;
      }

      const button =
        event.currentTarget;

      clearMessages();

      setElementBusy(
        button,
        true,
        "Refreshing..."
      );

      try {
        await reloadData();

        showSuccess(
          "Members refreshed successfully."
        );
      } catch (error) {
        showError(
          error
        );
      } finally {
        setElementBusy(
          button,
          false
        );
      }
    }
  );


  /* -------------------------------------------------------
     SEARCH
     ------------------------------------------------------- */

  byId(
    "memberSearch"
  )?.addEventListener(
    "input",
    () => {
      if (searchTimer) {
        clearTimeout(
          searchTimer
        );
      }

      searchTimer =
        setTimeout(
          () => {
            applySearch();
          },
          100
        );
    }
  );


  byId(
    "clearMemberSearch"
  )?.addEventListener(
    "click",
    () => {
      const input =
        byId(
          "memberSearch"
        );

      if (input) {
        input.value =
          "";
      }

      applySearch();

      input?.focus();
    }
  );


  /* -------------------------------------------------------
     POSITION
     ------------------------------------------------------- */

  byId(
    "memberActualPosition"
  )?.addEventListener(
    "change",
    updatePositionNameField
  );


  /* -------------------------------------------------------
     HISTORICAL
     ------------------------------------------------------- */

  byId(
    "memberHistoricalEnabled"
  )?.addEventListener(
    "change",
    updateHistoricalFields
  );


  /* -------------------------------------------------------
     CONTRIBUTION PREVIEW
     ------------------------------------------------------- */

  [
    "memberContributionAmount",
    "memberContributionEffectiveFrom",
    "memberFirstPeriodRule"
  ].forEach(
    (id) => {
      byId(id)?.addEventListener(
        "input",
        updateContributionPreview
      );

      byId(id)?.addEventListener(
        "change",
        updateContributionPreview
      );
    }
  );


  /* -------------------------------------------------------
     HISTORICAL PREVIEW
     ------------------------------------------------------- */

  [
    "memberHistoricalPaidThrough",
    "memberHistoricalPaymentMethod"
  ].forEach(
    (id) => {
      byId(id)?.addEventListener(
        "input",
        updateHistoricalPreview
      );

      byId(id)?.addEventListener(
        "change",
        updateHistoricalPreview
      );
    }
  );


  /* -------------------------------------------------------
     MODAL POSITION
     ------------------------------------------------------- */

  byId(
    "positionChangeValue"
  )?.addEventListener(
    "change",
    updateModalPositionName
  );


  /* -------------------------------------------------------
     SAVE POSITION
     ------------------------------------------------------- */

  byId(
    "savePositionChange"
  )?.addEventListener(
    "click",
    savePositionChange
  );


  /* -------------------------------------------------------
     RECONCILE
     ------------------------------------------------------- */

  byId(
    "reconcileHistoricalPayments"
  )?.addEventListener(
    "click",
    reconcileSelectedMember
  );


  /* -------------------------------------------------------
     CLOSE MODAL
     ------------------------------------------------------- */

  byId(
    "closeMemberModal"
  )?.addEventListener(
    "click",
    closeModal
  );


  byId(
    "closeMemberModalFooter"
  )?.addEventListener(
    "click",
    closeModal
  );


  /* -------------------------------------------------------
     MODAL BACKDROP
     ------------------------------------------------------- */

  byId(
    "memberModal"
  )?.addEventListener(
    "click",
    (event) => {
      const modal =
        byId(
          "memberModal"
        );

      if (
        modal &&
        event.target === modal
      ) {
        closeModal();
      }
    }
  );


  /* -------------------------------------------------------
     GLOBAL ESCAPE
     ------------------------------------------------------- */

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key !==
        "Escape"
      ) {
        return;
      }

      const modal =
        byId(
          "memberModal"
        );

      if (
        modal &&
        !modal.hidden
      ) {
        closeModal();

        return;
      }

      const panel =
        byId(
          "addMemberPanel"
        );

      if (
        panel &&
        !panel.hidden
      ) {
        closeMemberForm();
      }
    }
  );


  /* -------------------------------------------------------
     MEMBER VIEW / EDIT ACTIONS
     ------------------------------------------------------- */

  document.addEventListener(
    "click",
    (event) => {
      const button =
        closestActionButton(
          event
        );

      if (!button) {
        return;
      }

      const member =
        memberById(
          button.dataset.memberId
        );

      if (!member) {
        return;
      }

      const action =
        button.dataset.action;

      if (
        action ===
        "view"
      ) {
        renderModal(
          member
        );

        return;
      }

      if (
        action ===
        "edit"
      ) {
        openMemberForm(
          member
        );
      }
    }
  );
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

export async function init() {
  if (initialized) {
    return;
  }

  initialized =
    true;

  clearMessages();

  setPageLoading(
    true,
    "Loading members..."
  );

  showStatus(
    "Loading members..."
  );

  try {
    currentUser =
      await requireAuth();

    if (!currentUser) {
      throw new Error(
        "Authentication is required to access Members."
      );
    }

    currentMember =
      await getMyMember();

    currentGroup =
      await getMyGroup();

    groupId =
      currentGroup?.id ||
      currentMember?.group_id ||
      null;

    if (!groupId) {
      throw new Error(
        "Your account is not linked to a group."
      );
    }

    bindEvents();

    await reloadData();

    updatePositionNameField();

    updateHistoricalFields();

    updateContributionPreview();

    updateHistoricalPreview();

    showStatus("");

  } catch (error) {
    initialized =
      false;

    showStatus("");

    showError(
      error
    );
  } finally {
    setPageLoading(
      false
    );
  }
}


/* =========================================================
   EXPLICIT REFRESH API
   ========================================================= */

export async function refreshMembers() {
  if (!groupId) {
    await init();

    return;
  }

  try {
    await reloadData();
  } catch (error) {
    showError(
      error
    );
  }
}
