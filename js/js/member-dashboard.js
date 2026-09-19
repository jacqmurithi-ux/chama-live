/* =========================================================
   CHAMA LIVE — MEMBER DASHBOARD

   MEMBER PORTAL ONLY

   Scope
   ---------------------------------------------------------
   - Member-safe group information.
   - Current member information.
   - Member's own contributions.
   - Group-safe meetings, activities, plans,
     milestones and assets.

   No:
   - expense management
   - full contribution ledger
   - member management
   - billing
   - data migration
   - monthly closing
   - administrative mutations
========================================================= */

import {
  supabase,
  getMyApplicationContext,
  money
} from "./auth.js";


let initialized = false;

let currentUser = null;
let currentMember = null;
let currentGroup = null;


/* =========================================================
   HELPERS
========================================================= */

function el(id) {

  return document.getElementById(id);

}


function setText(id, value) {

  const element = el(id);

  if (!element) {
    return;
  }

  element.textContent =
    value === null ||
    value === undefined
      ? "—"
      : String(value);

}


function escapeHtml(value) {

  return String(
    value ?? ""
  )
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

  const date =
    new Date(value);

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
      dateStyle: "medium"
    }
  );

}


function numberValue(value) {

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;

}


/* =========================================================
   CONTEXT
========================================================= */

async function loadContext() {

  const context =
    await getMyApplicationContext();

  currentUser =
    context.user;

  currentMember =
    context.member;

  currentGroup =
    context.group;

  const role =
    String(
      context.role || ""
    )
      .trim()
      .toLowerCase();

  /*
   * This page must never become an admin portal.
   *
   * layout.js is the primary portal guard.
   * This secondary check prevents accidental initialization
   * if the page is reached through an unexpected path.
   */
  if (
    ![
      "member"
    ].includes(role)
  ) {

    return false;

  }

  return true;

}


/* =========================================================
   MEMBER CONTRIBUTIONS
========================================================= */

async function loadMyContributions() {

  if (!currentMember?.id) {
    return [];
  }

  const {
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select(`
        id,
        member_id,
        amount,
        contribution_date,
        contribution_type,
        payment_method
      `)
      .eq(
        "member_id",
        currentMember.id
      )
      .order(
        "contribution_date",
        {
          ascending: false
        }
      );

  if (error) {
    throw error;
  }

  return data || [];

}


/* =========================================================
   GROUP-SAFE DATA
========================================================= */

async function loadMeetings() {

  const {
    data,
    error
  } =
    await supabase
      .from("meetings")
      .select(`
        id,
        date,
        title,
        venue,
        status
      `)
      .eq(
        "group_id",
        currentGroup.id
      )
      .order(
        "date",
        {
          ascending: true
        }
      )
      .limit(5);

  if (error) {
    throw error;
  }

  return data || [];

}


async function loadActivities() {

  const {
    data,
    error
  } =
    await supabase
      .from("group_activities")
      .select(`
        id,
        title,
        description,
        start_date,
        due_date,
        status,
        progress_percent
      `)
      .eq(
        "group_id",
        currentGroup.id
      )
      .order(
        "due_date",
        {
          ascending: true,
          nullsFirst: false
        }
      )
      .limit(5);

  if (error) {
    throw error;
  }

  return data || [];

}


async function loadPlans() {

  const {
    data,
    error
  } =
    await supabase
      .from("group_plans")
      .select(`
        id,
        title,
        description,
        category,
        start_date,
        target_date,
        status,
        progress_percent
      `)
      .eq(
        "group_id",
        currentGroup.id
      )
      .order(
        "target_date",
        {
          ascending: true,
          nullsFirst: false
        }
      )
      .limit(5);

  if (error) {
    throw error;
  }

  return data || [];

}


async function loadMilestones() {

  const {
    data,
    error
  } =
    await supabase
      .from("group_milestones")
      .select(`
        id,
        title,
        description,
        milestone_date,
        category,
        amount
      `)
      .eq(
        "group_id",
        currentGroup.id
      )
      .order(
        "milestone_date",
        {
          ascending: true,
          nullsFirst: false
        }
      )
      .limit(5);

  if (error) {
    throw error;
  }

  return data || [];

}


async function loadAssets() {

  const {
    data,
    error
  } =
    await supabase
      .from("group_assets")
      .select(`
        id,
        asset_name,
        category,
        description,
        acquired_date,
        current_value,
        location,
        status
      `)
      .eq(
        "group_id",
        currentGroup.id
      )
      .order(
        "asset_name",
        {
          ascending: true
        }
      )
      .limit(10);

  if (error) {
    throw error;
  }

  return data || [];

}


/* =========================================================
   RENDER
========================================================= */

function renderMember() {

  const name =
    currentMember?.name ||
    currentUser?.email ||
    "Member";

  setText(
    "memberGreeting",
    `Welcome, ${name}`
  );

  setText(
    "memberGroupName",
    currentGroup?.name ||
    "Your group"
  );

  setText(
    "memberName",
    name
  );

  setText(
    "memberNumber",
    `Member number: ${
      currentMember?.member_number ||
      currentMember?.membership_number ||
      "—"
    }`
  );

  setText(
    "memberRole",
    currentMember?.role ||
    "Member"
  );

  setText(
    "memberStatus",
    currentMember?.status ||
    "Active"
  );

}


function renderContributions(
  contributions
) {

  const total =
    contributions.reduce(
      (
        sum,
        row
      ) =>
        sum +
        numberValue(
          row.amount
        ),
      0
    );

  setText(
    "myContributionTotal",
    money(total)
  );

  setText(
    "myContributionCount",
    contributions.length
  );

}


function renderList(
  id,
  rows,
  emptyText,
  renderer
) {

  const container =
    el(id);

  if (!container) {
    return;
  }

  if (!rows.length) {

    container.innerHTML = `
      <div class="member-list-item">
        <span class="member-muted">
          ${escapeHtml(emptyText)}
        </span>
      </div>
    `;

    return;

  }

  container.innerHTML =
    rows
      .map(renderer)
      .join("");

}


function renderMeetings(
  rows
) {

  renderList(
    "memberMeetings",
    rows,
    "No upcoming meetings.",
    row => `
      <div class="member-list-item">

        <strong>
          ${escapeHtml(
            row.title ||
            "Meeting"
          )}
        </strong>

        <span class="member-muted">
          ${escapeHtml(
            formatDate(row.date)
          )}
          ·
          ${escapeHtml(
            row.venue ||
            "Venue not specified"
          )}
        </span>

      </div>
    `
  );

}


function renderActivities(
  rows
) {

  renderList(
    "memberActivities",
    rows,
    "No group activities available.",
    row => `
      <div class="member-list-item">

        <strong>
          ${escapeHtml(
            row.title ||
            "Activity"
          )}
        </strong>

        <span class="member-muted">
          ${escapeHtml(
            row.status ||
            "Not started"
          )}
          ·
          ${numberValue(
            row.progress_percent
          )}%
        </span>

      </div>
    `
  );

}


function renderPlans(
  rows
) {

  renderList(
    "memberPlans",
    rows,
    "No group plans available.",
    row => `
      <div class="member-list-item">

        <strong>
          ${escapeHtml(
            row.title ||
            "Plan"
          )}
        </strong>

        <span class="member-muted">
          ${escapeHtml(
            row.status ||
            "Active"
          )}
          ·
          ${numberValue(
            row.progress_percent
          )}%
        </span>

      </div>
    `
  );

}


function renderMilestones(
  rows
) {

  renderList(
    "memberMilestones",
    rows,
    "No milestones available.",
    row => `
      <div class="member-list-item">

        <strong>
          ${escapeHtml(
            row.title ||
            "Milestone"
          )}
        </strong>

        <span class="member-muted">
          ${escapeHtml(
            formatDate(
              row.milestone_date
            )
          )}
        </span>

      </div>
    `
  );

}


function renderAssets(
  rows
) {

  renderList(
    "memberAssets",
    rows,
    "No group assets available.",
    row => `
      <div class="member-list-item">

        <strong>
          ${escapeHtml(
            row.asset_name ||
            "Asset"
          )}
        </strong>

        <span class="member-muted">
          ${escapeHtml(
            row.category ||
            "Group asset"
          )}
          ·
          ${escapeHtml(
            row.status ||
            "Active"
          )}
        </span>

      </div>
    `
  );

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initMemberDashboard() {

  if (initialized) {
    return;
  }

  initialized =
    true;

  try {

    const allowed =
      await loadContext();

    if (!allowed) {

      window.location.replace(
        "./dashboard.html"
      );

      return;

    }

    renderMember();

    const [
      contributions,
      meetings,
      activities,
      plans,
      milestones,
      assets
    ] =
      await Promise.all([
        loadMyContributions(),
        loadMeetings(),
        loadActivities(),
        loadPlans(),
        loadMilestones(),
        loadAssets()
      ]);

    renderContributions(
      contributions
    );

    renderMeetings(
      meetings
    );

    renderActivities(
      activities
    );

    renderPlans(
      plans
    );

    renderMilestones(
      milestones
    );

    renderAssets(
      assets
    );

    const loading =
      el("memberLoading");

    if (loading) {
      loading.hidden = true;
    }

  }
  catch (error) {

    initialized =
      false;

    const loading =
      el("memberLoading");

    if (loading) {
      loading.hidden = true;
    }

    const errorEl =
      el("memberError");

    if (errorEl) {

      errorEl.hidden =
        false;

      errorEl.textContent =
        error?.message ||
        "Unable to load your member dashboard.";

    }

    console.error(
      "CHAMA LIVE: member dashboard failed",
      error
    );

  }

}


console.log(
  "CHAMA LIVE: member-dashboard module ready"
);
