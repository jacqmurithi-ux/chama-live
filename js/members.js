/* CHAMA LIVE MEMBERS — syntax/deployment refresh 2026-10-07 */
/* =========================================================
   CHAMA LIVE — MEMBERS
   FRESH CANONICAL FRONTEND
   =========================================================
   Accounting boundary
   -------------------
   This page never writes directly to:
     contributions
     contribution_allocations
     contribution_obligations

   Canonical member/accounting operations are delegated to:
     create_member_with_contribution_plan()
     create_member_with_historical_contributions()
     refresh_my_managed_member_accounting()
     get_member_contribution_position()
     set_member_actual_position()
     reconcile_member_historical_payments()

   Member profile edits use the existing membersApi boundary.
   Actual-position history always uses the canonical RPC.
   ========================================================= */

import { membersApi } from "./api/members.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";


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


/* =========================================================
   DOM
   ========================================================= */

function byId(id) {
  return document.getElementById(id);
}


/* =========================================================
   TEXT / NORMALIZATION
   ========================================================= */

function text(value) {
  return String(value ?? "").trim();
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function normalize(value) {
  return text(value).toLowerCase();
}


function normalizePosition(value) {
  return normalize(value)
    .replaceAll(" ", "_")
    .replaceAll("-", "_");
}


/* =========================================================
   FORMATTING
   ========================================================= */

function formatPosition(value) {

  const key =
    normalizePosition(value);

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

  const key =
    normalizePosition(value);

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

  const date =
    new Date(
      `${value}T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return escapeHtml(value);
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


function today() {

  const date =
    new Date();

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

  const amount =
    Number(
      value ?? 0
    );

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
   STATUS MESSAGES
   ========================================================= */

function showStatus(message) {

  const box =
    byId("membersStatus");

  if (!box) {
    return;
  }

  box.textContent =
    message || "";

  box.hidden =
    !message;
}


function showError(error) {

  const box =
    byId("membersError");

  if (!box) {
    return;
  }

  box.textContent =
    error?.message ||
    String(
      error ||
      "Unable to complete the request."
    );

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
    message || "";

  box.hidden =
    !message;
}


function clearMessages() {

  [
    "membersStatus",
    "membersError",
    "membersSuccess",
    "formMessage"
  ].forEach(
    (id) => {

      const element =
        byId(id);

      if (!element) {
        return;
      }

      element.textContent =
        "";

      if (
        id !==
        "formMessage"
      ) {
        element.hidden =
          true;
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
    message || "";

  box.dataset.type =
    type;

  box.hidden =
    !message;
}


/* =========================================================
   MEMBER STATE HELPERS
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


function contributionState(
  position
) {

  if (!position) {

    return {
      key: "unknown",
      label: "Unavailable"
    };
  }

  const arrears =
    Number(
      position.arrears ?? 0
    );

  const credit =
    Number(
      position.credit ?? 0
    );

  if (arrears > 0) {

    return {
      key: "arrears",
      label: "Arrears"
    };
  }

  if (credit > 0) {

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
    <span
      class="badge badge-${escapeHtml(kind)}"
    >
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
    memberContributionRules.get(id) ||
    []
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

  const {
    data,
    error
  } =
    await membersApi.rpc(
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
   CANONICAL CONTRIBUTION POSITION
   ========================================================= */

async function loadPosition(
  memberId
) {

  try {

    await refreshAccounting(
      memberId
    );

  } catch (error) {

    /*
     * Refresh is a canonical synchronization operation.
     * A failed refresh must not cause the page to invent
     * accounting values. We still attempt the authoritative
     * read so the page can display existing backend state.
     */

    console.warn(
      "Canonical member accounting refresh failed; continuing with read.",
      memberId,
      error
    );
  }


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

  return Array.isArray(data)
    ? data[0] || null
    : data || null;
}


async function loadPositions() {

  contributionPositions =
    new Map();

  for (
    const member
    of members
  ) {

    if (!member?.id) {
      continue;
    }

    try {

      const position =
        await loadPosition(
          member.id
        );

      if (position) {

        contributionPositions.set(
          member.id,
          position
        );
      }

    } catch (error) {

      console.warn(
        "Contribution position unavailable for member.",
        member.id,
        error
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

  const {
    data,
    error
  } =
    await membersApi.list(
      groupId
    );

  if (error) {
    throw error;
  }

  /*
   * IMPORTANT:
   * Do not filter members by status, onboarding status,
   * login state or user_id here.
   *
   * The Members page must show the complete membership
   * population returned by the canonical members API.
   */

  members =
    Array.isArray(data)
      ? data
      : [];
}


/* =========================================================
   CONTRIBUTION TYPES
   ========================================================= */

async function loadContributionTypes() {

  if (!groupId) {
    return;
  }

  const {
    data,
    error
  } =
    await membersApi.contributionTypes(
      groupId
    );

  if (error) {
    throw error;
  }

  contributionTypes =
    Array.isArray(data)
      ? data
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

  if (!members.length) {
    return;
  }

  const ids =
    members
      .map(
        (member) =>
          member.id
      )
      .filter(Boolean);

  const {
    data,
    error
  } =
    await membersApi.contributionRules(
      groupId,
      ids
    );

  if (error) {
    throw error;
  }

  for (
    const rule
    of Array.isArray(data)
      ? data
      : []
  ) {

    if (!rule.member_id) {
      continue;
    }

    if (
      !memberContributionRules.has(
        rule.member_id
      )
    ) {

      memberContributionRules.set(
        rule.member_id,
        []
      );
    }

    memberContributionRules
      .get(rule.member_id)
      .push(rule);
  }
}


/* =========================================================
   RELOAD
   ========================================================= */

async function reloadData() {

  showStatus(
    "Loading members..."
  );

  await loadMembers();

  await loadContributionTypes();

  await loadRules();

  await loadPositions();

  visibleMembers =
    [...members];

  updateCounts();

  renderMembers();

  showStatus("");
}


/* =========================================================
   MEMBER COUNTS
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
    byId(
      "memberRows"
    );

  const cards =
    byId(
      "memberCards"
    );


  if (body) {

    body.replaceChildren();

    if (!visibleMembers.length) {

      const row =
        document.createElement(
          "tr"
        );

      row.innerHTML =
        `
          <td
            colspan="13"
            class="empty-state"
          >
            No members found.
          </td>
        `;

      body.appendChild(
        row
      );

    } else {

      for (
        const member
        of visibleMembers
      ) {

        body.appendChild(
          createRow(
            member
          )
        );
      }
    }
  }


  if (cards) {

    cards.replaceChildren();

    if (!visibleMembers.length) {

      const empty =
        document.createElement(
          "div"
        );

      empty.className =
        "empty-state";

      empty.textContent =
        "No members found.";

      cards.appendChild(
        empty
      );

    } else {

      for (
        const member
        of visibleMembers
      ) {

        cards.appendChild(
          createCard(
            member
          )
        );
      }
    }
  }


  const count =
    byId(
      "memberResultCount"
    );

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
   DESKTOP MEMBER ROW
   ========================================================= */

function createRow(
  member
) {

  const position =
    contributionPositions.get(
      member.id
    );

  const state =
    contributionState(
      position
    );

  const login =
    loginState(
      member
    );

  const row =
    document.createElement(
      "tr"
    );

  row.dataset.memberId =
    member.id;


  row.innerHTML =
    `
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
              initials(
                member.name
              )
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
          formatRole(
            member.role
          )
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
          normalize(
            member.status
          ) === "active"
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
   MOBILE MEMBER CARD
   ========================================================= */

function createCard(
  member
) {

  const position =
    contributionPositions.get(
      member.id
    );

  const state =
    contributionState(
      position
    );

  const login =
    loginState(
      member
    );

  const card =
    document.createElement(
      "article"
    );

  card.className =
    "member-card";

  card.dataset.memberId =
    member.id;


  card.innerHTML =
    `
      <div class="card-head">

        <div class="member-name-cell">

          <span class="avatar">
            ${escapeHtml(
              initials(
                member.name
              )
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
    byId(
      "addMemberPanel"
    );

  const title =
    byId(
      "memberFormTitle"
    );

  const description =
    byId(
      "memberFormDescription"
    );

  const form =
    byId(
      "addMemberForm"
    );

  if (!panel || !form) {
    return;
  }


  editingMemberId =
    member?.id ||
    null;


  form.reset();


  if (editingMemberId) {

    if (title) {

      title.textContent =
        "Edit Member";
    }

    if (description) {

      description.textContent =
        "Update member profile information. Accounting and position history remain controlled by the backend.";
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

  } else {

    if (title) {

      title.textContent =
        "Add Member";
    }

    if (description) {

      description.textContent =
        "Create the member and establish the initial Monthly contribution plan.";
    }


    editingMemberId =
      null;


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


    if (
      monthlyContributionType &&
      currentGroup
    ) {

      const amount =
        byId(
          "memberContributionAmount"
        );

      if (amount) {

        amount.value =
          Number(
            currentGroup.monthly_contribution ||
            monthlyContributionType.default_amount ||
            0
          ) || "";
      }
    }
  }


  updatePositionNameField();

  updateHistoricalFields();

  updateContributionPreview();

  updateHistoricalPreview();

  formMessage("");


  panel.hidden =
    false;

  panel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


/* =========================================================
   POPULATE EDIT FORM
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
      ""
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

      element.value =
        value ?? "";
    }
  }


  const monthlyRule =
    rulesFor(
      member.id
    ).find(
      (rule) =>
        normalize(
          rule.contribution_type_code
        ) === "monthly" ||
        normalize(
          rule.contribution_type_name
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
   CLOSE FORM
   ========================================================= */

function closeMemberForm() {

  const panel =
    byId(
      "addMemberPanel"
    );

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
   VALIDATION
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
    !["active", "inactive"]
      .includes(
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


  if (
    !editingMemberId &&
    !Number.isFinite(
      values.contribution_amount
    )
  ) {

    return "Enter a valid monthly contribution amount.";
  }


  if (
    !editingMemberId &&
    values.contribution_amount <= 0
  ) {

    return "Monthly contribution amount must be greater than zero.";
  }


  if (
    !editingMemberId &&
    !values.contribution_effective_from
  ) {

    return "Contribution effective date is required.";
  }


  if (
    !editingMemberId &&
    ![
      "full_period",
      "next_full_period"
    ].includes(
      values.first_period_rule
    )
  ) {

    return "Select a valid first-period rule.";
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


  if (
    values.actual_position &&
    !values.actual_position_effective_from
  ) {

    return "Actual position effective date is required.";
  }


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

async function checkDuplicateMemberNumber(
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
        String(
          member.id
        ) !==
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
    normalizePosition(
      value
    );

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
   POSITION FORM UI
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
    position ===
    "other";

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
   HISTORICAL FORM UI
   ========================================================= */

function updateHistoricalFields() {

  const enabled =
    byId(
      "memberHistoricalEnabled"
    )?.value ===
    "true";

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
    !amount ||
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
    )?.value ===
    "true";

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
    rulesFor(
      memberId
    );

  container.replaceChildren();


  if (!rules.length) {

    const paragraph =
      document.createElement(
        "p"
      );

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
      document.createElement(
        "div"
      );

    div.className =
      "rule-card";


    div.innerHTML =
      `
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
    byId(
      "memberModal"
    );

  if (!modal) {
    return;
  }

  selectedMemberId =
    member.id;


  const position =
    contributionPositions.get(
      member.id
    ) ||
    null;

  const state =
    contributionState(
      position
    );


  const set =
    (
      id,
      value
    ) => {

      const element =
        byId(id);

      if (element) {

        element.textContent =
          value;
      }
    };


  set(
    "viewMemberInitials",
    initials(
      member.name
    )
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

  set(
    "viewMemberActualPosition",
    formatPosition(
      member.actual_position
    ) +
      (
        member.actual_position_name
          ? ` (${member.actual_position_name})`
          : ""
      )
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
    member.activated_at
      ? new Date(
          member.activated_at
        ).toLocaleString(
          "en-KE"
        )
      : "—"
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
   * This is deliberately the authoritative position value,
   * not allocated + credit.
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
      member.id;
  }


  const positionSection =
    byId(
      "positionChangeSection"
    );

  if (positionSection) {

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
  }


  modal.hidden =
    false;
}


/* =========================================================
   CLOSE MODAL
   ========================================================= */

function closeModal() {

  const modal =
    byId(
      "memberModal"
    );

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

  const other =
    value ===
    "other";


  if (field) {

    field.hidden =
      !other;
  }

  if (input) {

    input.disabled =
      !other;

    if (!other) {

      input.value =
        "";
    }
  }
}


/* =========================================================
   SAVE POSITION CHANGE
   ========================================================= */

async function savePositionChange() {

  const member =
    memberById(
      selectedMemberId
    );

  if (!member) {
    return;
  }


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
    position ===
      "other" &&
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


  if (
    !window.confirm(
      `Set ${member.name}'s actual position to ${formatPosition(
        position
      )} effective ${formatDate(
        effective
      )}?`
    )
  ) {

    return;
  }


  try {

    showStatus(
      "Saving actual group position..."
    );

    await membersApi.rpc(
      "set_member_actual_position",
      {
        p_member_id:
          member.id,

        p_actual_position:
          position,

        p_actual_position_name:
          position ===
            "other"
            ? name
            : null,

        p_effective_from:
          effective
      }
    );


    await reloadData();


    const refreshedMember =
      memberById(
        member.id
      );

    if (refreshedMember) {

      renderModal(
        refreshedMember
      );
    }


    showStatus("");

    showSuccess(
      "Actual group position updated through the canonical position-history workflow."
    );

  } catch (error) {

    showStatus("");

    showError(
      error
    );
  }
}


/* =========================================================
   RECONCILE HISTORICAL PAYMENTS
   ========================================================= */

async function reconcileSelectedMember() {

  const member =
    memberById(
      selectedMemberId
    );

  if (!member) {
    return;
  }


  if (
    !window.confirm(
      `Reconcile existing historical payments for ${member.name}?`
    )
  ) {

    return;
  }


  try {

    showStatus(
      "Reconciling historical payments..."
    );


    const {
      data,
      error
    } =
      await membersApi.rpc(
        "reconcile_member_historical_payments",
        {
          p_member_id:
            member.id,

          p_through_date:
            null
        }
      );


    if (error) {
      throw error;
    }


    await reloadData();


    const refreshedMember =
      memberById(
        member.id
      );

    if (refreshedMember) {

      renderModal(
        refreshedMember
      );
    }


    showStatus("");

    showSuccess(
      data?.message ||
      "Historical payments reconciled successfully."
    );

  } catch (error) {

    showStatus("");

    showError(
      error
    );
  }
}


/* =========================================================
   SAVE MEMBER
   ========================================================= */

async function saveMember(
  event
) {

  event?.preventDefault();

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


  if (
    validation !==
    true
  ) {

    formMessage(
      validation
    );

    return;
  }


  try {

    const duplicate =
      await checkDuplicateMemberNumber(
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
      } =
        await membersApi.updateMember(
          groupId,
          editingMemberId,
          updatePayload
        );


      if (error) {
        throw error;
      }


      await reloadData();


      closeMemberForm();


      showSuccess(
        "Member details updated. No historical accounting, contribution allocations, or position-history entries were changed."
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


    let result =
      null;


    /* =====================================================
       HISTORICAL MEMBER CREATION
       ===================================================== */

    if (
      values.historical_enabled
    ) {

      const {
        data,
        error
      } =
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
              crypto.randomUUID()
          }
        );


      if (error) {
        throw error;
      }


      result =
        Array.isArray(data)
          ? data[0] ||
            data
          : data;

    } else {


      /* ===================================================
         NORMAL MEMBER CREATION
         =================================================== */

      const {
        data,
        error
      } =
        await membersApi.rpc(
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
          ? data[0] ||
            data
          : data;
    }


    await reloadData();


    closeMemberForm();


    showSuccess(
      values.historical_enabled
        ? "Member created and historical contribution onboarding was processed through the canonical accounting workflow."
        : "Member created and the initial Monthly contribution plan was established through the canonical accounting workflow."
    );


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
        JSON.stringify(
          {
            memberId:
              createdMemberId,

            groupId:
              groupId,

            completedAt:
              new Date().toISOString()
          }
        )
      );

    } catch {
      /*
       * Session storage is non-critical.
       */
    }


  } catch (error) {

    console.error(
      "CHAMA LIVE: saveMember failed",
      error
    );

    formMessage(
      error?.message ||
      "Unable to save the member."
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


  byId(
    "addMemberButton"
  )?.addEventListener(
    "click",
    () =>
      openMemberForm()
  );


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


  byId(
    "addMemberForm"
  )?.addEventListener(
    "submit",
    saveMember
  );


  byId(
    "refreshMembers"
  )?.addEventListener(
    "click",
    async () => {

      try {

        clearMessages();

        showStatus(
          "Refreshing members..."
        );

        await reloadData();

        showStatus("");

      } catch (error) {

        showStatus("");

        showError(
          error
        );
      }
    }
  );


  byId(
    "memberSearch"
  )?.addEventListener(
    "input",
    () => {

      clearTimeout(
        searchTimer
      );

      searchTimer =
        setTimeout(
          applySearch,
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
    }
  );


  byId(
    "memberActualPosition"
  )?.addEventListener(
    "change",
    updatePositionNameField
  );


  byId(
    "memberHistoricalEnabled"
  )?.addEventListener(
    "change",
    updateHistoricalFields
  );


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


  byId(
    "positionChangeValue"
  )?.addEventListener(
    "change",
    updateModalPositionName
  );


  byId(
    "savePositionChange"
  )?.addEventListener(
    "click",
    savePositionChange
  );


  byId(
    "reconcileHistoricalPayments"
  )?.addEventListener(
    "click",
    reconcileSelectedMember
  );


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


  byId(
    "memberModal"
  )?.addEventListener(
    "click",
    (event) => {

      if (
        event.target ===
        byId(
          "memberModal"
        )
      ) {

        closeModal();
      }
    }
  );


  document.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key !==
        "Escape"
      ) {
        return;
      }

      closeModal();

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


  document.addEventListener(
    "click",
    (event) => {

      const button =
        event.target.closest(
          "[data-action]"
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


      if (
        button.dataset.action ===
        "view"
      ) {

        renderModal(
          member
        );
      }


      if (
        button.dataset.action ===
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
   INIT
   ========================================================= */

export async function init() {

  if (initialized) {
    return;
  }

  initialized =
    true;

  clearMessages();


  try {

    currentUser =
      await requireAuth();

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


  } catch (error) {

    initialized =
      false;

    console.error(
      "CHAMA LIVE: members initialization failed",
      error
    );

    showError(
      error
    );
  }
}


/* =========================================================
   EXPLICIT REFRESH API
   ========================================================= */

export async function refreshMembers() {

  await reloadData();
}


/* =========================================================
   READY
   ========================================================= */

console.log(
  "CHAMA LIVE: members.js ready"
);
