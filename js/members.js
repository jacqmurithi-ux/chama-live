/* =========================================================
   CHAMA LIVE — MEMBERS
   SIMPLE CANONICAL PAGE
   2026-10-07

   BOOT CONTRACT
   ---------------------------------------------------------
   admin-layout.js is the page boot owner.

   admin-layout.js:
     1. authenticates the user
     2. resolves application/group context
     3. authorizes the page
     4. loads the page module
     5. calls init()

   members.js:
     1. receives the authorized context
     2. loads members
     3. renders members
     4. handles member actions

   ACCOUNTING BOUNDARY
   ---------------------------------------------------------
   This page NEVER directly writes to:

     contributions
     contribution_allocations
     contribution_obligations

   Canonical accounting operations remain delegated to:

     create_member_with_contribution_plan()
     create_member_with_historical_contributions()
     refresh_my_managed_member_accounting()
     get_member_contribution_position()
     set_member_actual_position()
     reconcile_member_historical_payments()

   ========================================================= */


/* =========================================================
   IMPORTS
   ========================================================= */

import { membersApi } from "./api/members.js";

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

let contributionPositions = new Map();


/* =========================================================
   DOM
   ========================================================= */

function byId(id) {
  return document.getElementById(id);
}


/* =========================================================
   TEXT HELPERS
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

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return text(value);
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}


function formatRole(value) {
  const role = normalizePosition(value);

  const labels = {
    member: "Member",
    admin: "Admin",
    chairperson: "Chairperson",
    treasurer: "Treasurer",
    secretary: "Secretary"
  };

  return labels[role] || "Member";
}


function formatPosition(value) {
  const position = normalizePosition(value);

  if (!position) {
    return "—";
  }

  return position
    .replaceAll("_", " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}


function initials(name) {
  const parts = text(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "?";
  }

  return parts
    .map(part => part.charAt(0).toUpperCase())
    .join("");
}


/* =========================================================
   MESSAGES
   ========================================================= */

function showStatus(message = "") {
  const element = byId("membersStatus");

  if (!element) {
    return;
  }

  element.textContent = message;
  element.hidden = !message;
}


function showError(error) {
  const element = byId("membersError");

  if (!element) {
    return;
  }

  element.textContent =
    error?.message ||
    String(error || "Unable to load members.");

  element.hidden = false;
}


function showSuccess(message = "") {
  const element = byId("membersSuccess");

  if (!element) {
    return;
  }

  element.textContent = message;
  element.hidden = !message;
}


function clearMessages() {
  [
    "membersStatus",
    "membersError",
    "membersSuccess"
  ].forEach(id => {
    const element = byId(id);

    if (!element) {
      return;
    }

    element.textContent = "";
    element.hidden = true;
  });
}


/* =========================================================
   BADGES
   ========================================================= */

function badge(label, type = "neutral") {
  return `
    <span class="badge badge-${escapeHtml(type)}">
      ${escapeHtml(label)}
    </span>
  `;
}


function loginBadge(member) {
  return member?.user_id
    ? badge("Login Active", "active")
    : badge("No Login", "neutral");
}


function statusBadge(member) {
  return normalize(member?.status) === "active"
    ? badge("Active", "active")
    : badge(
        formatPosition(member?.status),
        "inactive"
      );
}


/* =========================================================
   CONTRIBUTION STATE
   ========================================================= */

function contributionState(position) {
  if (!position) {
    return {
      label: "Unavailable",
      type: "neutral"
    };
  }

  const arrears = Number(position.arrears ?? 0);
  const credit = Number(position.credit ?? 0);

  if (arrears > 0) {
    return {
      label: "Arrears",
      type: "arrears"
    };
  }

  if (credit > 0) {
    return {
      label: "Credit",
      type: "credit"
    };
  }

  return {
    label: "Up to Date",
    type: "active"
  };
}


/* =========================================================
   MEMBER LOOKUP
   ========================================================= */

function memberById(id) {
  return members.find(
    member => String(member.id) === String(id)
  ) || null;
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

  const result = await membersApi.list(groupId);

  if (result?.error) {
    throw result.error;
  }

  members = Array.isArray(result?.data)
    ? result.data
    : [];

  visibleMembers = [...members];
}


/* =========================================================
   ACCOUNTING READ
   ---------------------------------------------------------
   Accounting is intentionally SECONDARY.

   Failure here must NOT prevent the Members page
   itself from loading.
   ========================================================= */

async function loadContributionPositions() {
  contributionPositions = new Map();

  for (const member of members) {
    if (!member?.id) {
      continue;
    }

    try {
      /*
       * Canonical synchronization first.
       *
       * Do NOT require data.ok === true.
       */
      const refreshResult = await membersApi.rpc(
        "refresh_my_managed_member_accounting",
        {
          p_member_id: member.id
        }
      );

      /*
       * A failed refresh must not make the frontend
       * invent accounting values.
       *
       * We simply continue to the authoritative read.
       */
      if (refreshResult?.error) {
        // Deliberately ignored here.
      }

      const positionResult = await membersApi.rpc(
        "get_member_contribution_position",
        {
          p_member_id: member.id
        }
      );

      if (positionResult?.error) {
        continue;
      }

      const data = positionResult?.data;

      const position = Array.isArray(data)
        ? data[0] || null
        : data || null;

      if (position) {
        contributionPositions.set(
          member.id,
          position
        );
      }

    } catch {
      /*
       * Contribution information is supplemental.
       * Never block the Members page because of it.
       */
    }
  }
}


/* =========================================================
   COUNTS
   ========================================================= */

function updateCounts() {
  const total = members.length;

  const active = members.filter(
    member =>
      normalize(member.status) === "active"
  ).length;

  const login = members.filter(
    member => Boolean(member.user_id)
  ).length;

  const values = {
    memberCount: total,
    totalMembers: total,
    activeMembers: active,
    loginMembers: login,
    noLoginMembers: total - login
  };

  Object.entries(values).forEach(
    ([id, value]) => {
      const element = byId(id);

      if (element) {
        element.textContent = String(value);
      }
    }
  );
}


/* =========================================================
   SEARCH
   ========================================================= */

function applySearch() {
  const query = normalize(
    byId("memberSearch")?.value
  );

  if (!query) {
    visibleMembers = [...members];
  } else {
    visibleMembers = members.filter(member => {
      const fields = [
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

      return fields.some(value =>
        normalize(value).includes(query)
      );
    });
  }

  renderMembers();
}


/* =========================================================
   DESKTOP ROW
   ========================================================= */

function createMemberRow(member) {
  const position =
    contributionPositions.get(member.id);

  const contribution =
    contributionState(position);

  const row =
    document.createElement("tr");

  row.dataset.memberId = member.id;

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
      ${statusBadge(member)}
    </td>

    <td>
      ${loginBadge(member)}
    </td>

    <td>
      ${badge(
        contribution.label,
        contribution.type
      )}
    </td>

    <td>
      <div class="action-row">

        <button
          type="button"
          class="btn btn-small"
          data-member-action="view"
          data-member-id="${escapeHtml(member.id)}"
        >
          View
        </button>

        <button
          type="button"
          class="btn btn-small"
          data-member-action="edit"
          data-member-id="${escapeHtml(member.id)}"
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

function createMemberCard(member) {
  const position =
    contributionPositions.get(member.id);

  const contribution =
    contributionState(position);

  const card =
    document.createElement("article");

  card.className = "member-card";
  card.dataset.memberId = member.id;

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
        contribution.label,
        contribution.type
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
            formatPosition(member.status)
          )}
        </dd>
      </div>

      <div>
        <dt>Role</dt>
        <dd>
          ${escapeHtml(
            formatRole(member.role)
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
            member.phone || "—"
          )}
        </dd>
      </div>

      <div>
        <dt>Login</dt>
        <dd>
          ${
            member.user_id
              ? "Login Active"
              : "No Login"
          }
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
        View
      </button>

      <button
        type="button"
        class="btn btn-small"
        data-member-action="edit"
        data-member-id="${escapeHtml(member.id)}"
      >
        Edit
      </button>

    </div>
  `;

  return card;
}


/* =========================================================
   RENDER
   ========================================================= */

function renderMembers() {
  const body = byId("memberRows");
  const cards = byId("memberCards");

  if (body) {
    body.replaceChildren();

    if (!visibleMembers.length) {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td
          colspan="20"
          class="empty-state"
        >
          No members found.
        </td>
      `;

      body.appendChild(row);
    } else {
      visibleMembers.forEach(member => {
        body.appendChild(
          createMemberRow(member)
        );
      });
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
      visibleMembers.forEach(member => {
        cards.appendChild(
          createMemberCard(member)
        );
      });
    }
  }

  const resultCount =
    byId("memberResultCount");

  if (resultCount) {
    resultCount.textContent =
      `${visibleMembers.length} member${
        visibleMembers.length === 1
          ? ""
          : "s"
      }`;
  }

  updateCounts();
}


/* =========================================================
   FORM
   ========================================================= */

function openMemberForm(member = null) {
  const panel = byId("addMemberPanel");
  const form = byId("addMemberForm");

  if (!panel || !form) {
    return;
  }

  form.reset();

  const title =
    byId("memberFormTitle");

  const description =
    byId("memberFormDescription");

  if (member) {
    if (title) {
      title.textContent = "Edit Member";
    }

    if (description) {
      description.textContent =
        "Update member profile information.";
    }

    setField(
      "memberNumber",
      member.member_number
    );

    setField(
      "memberMembershipNumber",
      member.membership_number ||
      member.member_number
    );

    setField(
      "memberName",
      member.name
    );

    setField(
      "memberNationalId",
      member.national_id
    );

    setField(
      "memberPhone",
      member.phone
    );

    setField(
      "memberEmail",
      member.email
    );

    setField(
      "memberRole",
      normalizePosition(member.role) ||
      "member"
    );

    setField(
      "memberStatus",
      normalize(member.status) ===
        "inactive"
        ? "inactive"
        : "active"
    );

    setField(
      "memberJoinDate",
      member.join_date
    );

    setField(
      "memberActualPosition",
      normalizePosition(
        member.actual_position
      )
    );

    setField(
      "memberActualPositionName",
      member.actual_position_name
    );

  } else {
    if (title) {
      title.textContent = "Add Member";
    }

    if (description) {
      description.textContent =
        "Create a group member.";
    }

    setField(
      "memberStatus",
      "active"
    );

    setField(
      "memberRole",
      "member"
    );

    setField(
      "memberJoinDate",
      today()
    );
  }

  panel.hidden = false;

  panel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


function setField(id, value) {
  const element = byId(id);

  if (element) {
    element.value = value ?? "";
  }
}


function closeMemberForm() {
  const panel = byId("addMemberPanel");

  if (panel) {
    panel.hidden = true;
  }
}


/* =========================================================
   DATE
   ========================================================= */

function today() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


/* =========================================================
   EDIT MEMBER
   ========================================================= */

async function saveMember(event) {
  event.preventDefault();

  clearMessages();

  if (!groupId) {
    showError(
      new Error(
        "The current group could not be determined."
      )
    );

    return;
  }

  const memberNumber =
    text(
      byId("memberNumber")?.value
    );

  const membershipNumber =
    text(
      byId(
        "memberMembershipNumber"
      )?.value
    ) || memberNumber;

  const name =
    text(
      byId("memberName")?.value
    );

  const nationalId =
    text(
      byId("memberNationalId")?.value
    );

  const phone =
    text(
      byId("memberPhone")?.value
    );

  const email =
    text(
      byId("memberEmail")?.value
    );

  const role =
    normalizePosition(
      byId("memberRole")?.value
    ) || "member";

  const status =
    normalize(
      byId("memberStatus")?.value
    ) || "active";

  const joinDate =
    byId("memberJoinDate")?.value ||
    "";

  if (!memberNumber) {
    showError(
      new Error(
        "Member number is required."
      )
    );

    return;
  }

  if (!/^\d{4}$/.test(memberNumber)) {
    showError(
      new Error(
        "Member number must contain exactly 4 digits."
      )
    );

    return;
  }

  if (!name) {
    showError(
      new Error(
        "Member name is required."
      )
    );

    return;
  }

  if (!phone) {
    showError(
      new Error(
        "Phone number is required."
      )
    );

    return;
  }

  if (!joinDate) {
    showError(
      new Error(
        "Join date is required."
      )
    );

    return;
  }

  const duplicate =
    members.find(member =>
      normalize(member.member_number) ===
        normalize(memberNumber)
    );

  if (duplicate) {
    showError(
      new Error(
        "That member number is already in use."
      )
    );

    return;
  }

  try {
    showStatus("Saving member...");

    const result =
      await membersApi.createMember({
        group_id: groupId,
        member_number: memberNumber,
        membership_number: membershipNumber,
        name,
        national_id: nationalId || null,
        phone,
        email: email || null,
        role,
        status,
        join_date: joinDate
      });

    if (result?.error) {
      throw result.error;
    }

    closeMemberForm();

    await loadMembers();

    renderMembers();

    showStatus("");

    showSuccess(
      "Member created successfully."
    );

  } catch (error) {
    showStatus("");

    showError(error);
  }
}


/* =========================================================
   VIEW MEMBER
   ========================================================= */

function viewMember(member) {
  const modal = byId("memberModal");

  if (!modal) {
    return;
  }

  setView(
    "viewMemberInitials",
    initials(member.name)
  );

  setView(
    "viewMemberName",
    member.name || "Member"
  );

  setView(
    "viewMemberNumber",
    member.member_number || "—"
  );

  setView(
    "viewMemberNumberDetail",
    member.member_number || "—"
  );

  setView(
    "viewMemberMembershipNumber",
    member.membership_number ||
    member.member_number ||
    "—"
  );

  setView(
    "viewMemberNationalId",
    member.national_id || "—"
  );

  setView(
    "viewMemberPhone",
    member.phone || "—"
  );

  setView(
    "viewMemberEmail",
    member.email || "—"
  );

  setView(
    "viewMemberRole",
    formatRole(member.role)
  );

  setView(
    "viewMemberActualPosition",
    formatPosition(
      member.actual_position
    )
  );

  setView(
    "viewMemberStatus",
    formatPosition(member.status)
  );

  setView(
    "viewMemberOnboardingStatus",
    formatPosition(
      member.onboarding_status
    )
  );

  setView(
    "viewMemberJoinDate",
    formatDate(member.join_date)
  );

  setView(
    "viewMemberLoginStatus",
    member.user_id
      ? "Login Active"
      : "No Login"
  );

  const position =
    contributionPositions.get(member.id);

  const state =
    contributionState(position);

  setView(
    "viewContributionStatus",
    state.label
  );

  setView(
    "viewContributionDue",
    position
      ? formatMoney(position.total_due)
      : "—"
  );

  setView(
    "viewContributionAllocated",
    position
      ? formatMoney(
          position.total_allocated
        )
      : "—"
  );

  setView(
    "viewContributionArrears",
    position
      ? formatMoney(position.arrears)
      : "—"
  );

  setView(
    "viewContributionCredit",
    position
      ? formatMoney(position.credit)
      : "—"
  );

  modal.hidden = false;
}


function setView(id, value) {
  const element = byId(id);

  if (element) {
    element.textContent =
      String(value ?? "—");
  }
}


function closeModal() {
  const modal =
    byId("memberModal");

  if (modal) {
    modal.hidden = true;
  }
}


/* =========================================================
   REFRESH
   ========================================================= */

async function refreshPage() {
  try {
    clearMessages();

    showStatus(
      "Refreshing members..."
    );

    await loadMembers();

    renderMembers();

    /*
     * Accounting is supplemental.
     * It is deliberately loaded after the member list
     * has already rendered.
     */
    await loadContributionPositions();

    renderMembers();

    showStatus("");

  } catch (error) {
    showStatus("");
    showError(error);
  }
}


/* =========================================================
   EVENTS
   ========================================================= */

function bindEvents() {
  if (eventsBound) {
    return;
  }

  eventsBound = true;


  byId("addMemberButton")
    ?.addEventListener(
      "click",
      () => openMemberForm()
    );


  byId("closeAddMember")
    ?.addEventListener(
      "click",
      closeMemberForm
    );


  byId("cancelAddMember")
    ?.addEventListener(
      "click",
      closeMemberForm
    );


  byId("addMemberForm")
    ?.addEventListener(
      "submit",
      saveMember
    );


  byId("refreshMembers")
    ?.addEventListener(
      "click",
      refreshPage
    );


  byId("memberSearch")
    ?.addEventListener(
      "input",
      applySearch
    );


  byId("clearMemberSearch")
    ?.addEventListener(
      "click",
      () => {
        const input =
          byId("memberSearch");

        if (input) {
          input.value = "";
        }

        applySearch();
      }
    );


  byId("closeMemberModal")
    ?.addEventListener(
      "click",
      closeModal
    );


  byId("closeMemberModalFooter")
    ?.addEventListener(
      "click",
      closeModal
    );


  byId("memberModal")
    ?.addEventListener(
      "click",
      event => {
        if (
          event.target ===
          byId("memberModal")
        ) {
          closeModal();
        }
      }
    );


  document.addEventListener(
    "click",
    event => {
      const button =
        event.target.closest(
          "[data-member-action]"
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
        button.dataset.memberAction;

      if (action === "view") {
        viewMember(member);
      }

      if (action === "edit") {
        /*
         * Editing is intentionally kept simple.
         * The current page's dedicated member API remains
         * the profile-edit boundary.
         */
        openMemberForm(member);
      }
    }
  );


  document.addEventListener(
    "keydown",
    event => {
      if (event.key === "Escape") {
        closeModal();
        closeMemberForm();
      }
    }
  );
}


/* =========================================================
   INITIALIZATION
   ---------------------------------------------------------
   IMPORTANT:

   admin-layout.js calls this function.

   members.js does NOT auto-run.

   The member list is loaded FIRST.

   Accounting is loaded SECOND so an accounting read
   cannot leave the entire page stuck on "Loading members".
   ========================================================= */

export async function init() {
  if (initialized) {
    return;
  }

  initialized = true;

  clearMessages();

  try {
    /*
     * These calls should normally already have been resolved
     * by admin-layout.js. They are retained here as a defensive
     * page-level context check.
     */
    currentUser = await requireAuth();

    currentMember = await getMyMember();

    currentGroup = await getMyGroup();

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

    /*
     * CRITICAL:
     *
     * Load the basic membership population first.
     * Do not load contribution types, contribution rules,
     * accounting positions or historical reconciliation
     * before the member list is rendered.
     */
    showStatus("Loading members...");

    await loadMembers();

    renderMembers();

    showStatus("");

    /*
     * Accounting enhancement.
     *
     * It cannot block the basic page.
     */
    void loadContributionPositions()
      .then(() => {
        renderMembers();
      })
      .catch(() => {
        /*
         * Intentionally silent.
         *
         * The Members page is already usable.
         * Missing accounting data is shown as "Unavailable"
         * rather than breaking page initialization.
         */
      });

  } catch (error) {
    initialized = false;

    showStatus("");

    showError(error);
  }
}


/* =========================================================
   EXPLICIT REFRESH API
   ========================================================= */

export async function refreshMembers() {
  await refreshPage();
}
