/* =========================================================
   CHAMA LIVE — MEMBER DASHBOARD

   MEMBER PORTAL
   ---------------------------------------------------------
   Read-only group/member dashboard.

   AUTHORITY
   ---------------------------------------------------------
   Authentication/context:
     auth.js

   Page/portal authorization:
     layout.js

   Database access:
     Supabase SELECT only

   NO financial mutations.
   NO member mutations.
   NO group mutations.
   NO administrative actions.
========================================================= */

import { supabase } from "./supabase.js";
import {
  getMyApplicationContext
} from "./auth.js";


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;

let groupId = null;
let memberId = null;

let initialized = false;


/* =========================================================
   HELPERS
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


function formatMoney(amount) {

  const value =
    Number(amount || 0);

  return (
    "KSh " +
    value.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )
  );

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
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );

}


function todayIso() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;

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
    (
      value.charAt(0).toUpperCase() +
      value.slice(1)
    )
  );

}


function displayStatus(status) {

  const value =
    String(
      status || "active"
    )
      .trim()
      .toLowerCase();

  if (!value) {
    return "Active";
  }

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );

}


/* =========================================================
   UI STATE
========================================================= */

function showLoading(show) {

  const node =
    byId("memberLoading");

  if (!node) {
    return;
  }

  node.hidden =
    !show;

}


function showError(message) {

  console.error(
    "CHAMA LIVE: Member Dashboard",
    message
  );

  const node =
    byId("memberError");

  if (!node) {
    return;
  }

  node.textContent =
    message ||
    "Unable to load your dashboard.";

  node.hidden =
    false;

}


function clearError() {

  const node =
    byId("memberError");

  if (!node) {
    return;
  }

  node.textContent =
    "";

  node.hidden =
    true;

}


function setText(
  id,
  value
) {

  const node =
    byId(id);

  if (!node) {
    return;
  }

  node.textContent =
    value === null ||
    value === undefined
      ? "—"
      : String(value);

}


/* =========================================================
   ACCOUNT
========================================================= */

function renderAccount() {

  const memberName =
    currentMember?.name ||
    "Member";

  const memberNumber =
    currentMember?.member_number ||
    currentMember?.membership_number ||
    "—";

  setText(
    "memberGreeting",
    `Welcome, ${memberName}`
  );

  setText(
    "memberGroupName",
    currentGroup?.name ||
    "Your Group"
  );

  setText(
    "memberName",
    memberName
  );

  setText(
    "memberNumber",
    `Member number: ${memberNumber}`
  );

  setText(
    "memberRole",
    displayRole(
      currentMember?.role
    )
  );

  setText(
    "memberStatus",
    displayStatus(
      currentMember?.status
    )
  );

}


/* =========================================================
   CONTRIBUTIONS
   ---------------------------------------------------------
   MEMBER'S OWN CONTRIBUTIONS ONLY
========================================================= */

async function loadMyContributions() {

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
        memberId
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

  const rows =
    Array.isArray(data)
      ? data
      : [];

  const total =
    rows.reduce(
      (
        sum,
        row
      ) =>
        sum +
        Number(
          row.amount || 0
        ),
      0
    );

  setText(
    "myContributionTotal",
    formatMoney(total)
  );

  setText(
    "myContributionCount",
    rows.length
  );

}


/* =========================================================
   MEETINGS
========================================================= */

async function loadMeetings() {

  const container =
    byId("memberMeetings");

  if (!container) {
    return;
  }

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
        groupId
      )
      .gte(
        "date",
        todayIso()
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

  const rows =
    Array.isArray(data)
      ? data
      : [];

  if (!rows.length) {

    container.innerHTML = `
      <div class="member-list-item">
        <strong>No upcoming meetings</strong>
        <span class="member-muted">
          No upcoming group meetings are scheduled.
        </span>
      </div>
    `;

    return;
  }

  container.innerHTML =
    rows.map(
      meeting => `
        <div class="member-list-item">

          <strong>
            ${escapeHtml(
              meeting.title ||
              "Group Meeting"
            )}
          </strong>

          <span class="member-muted">
            ${escapeHtml(
              formatDate(
                meeting.date
              )
            )}
            ${meeting.venue
              ? ` · ${escapeHtml(
                  meeting.venue
                )}`
              : ""}
          </span>

          ${
            meeting.status
              ? `
                <span class="member-status">
                  ${escapeHtml(
                    displayStatus(
                      meeting.status
                    )
                  )}
                </span>
              `
              : ""
          }

        </div>
      `
    ).join("");

}


/* =========================================================
   GROUP ACTIVITIES
========================================================= */

async function loadActivities() {

  const container =
    byId("memberActivities");

  if (!container) {
    return;
  }

  const {
    data,
    error
  } =
    await supabase
      .from("group_activities")
      .select(`
        id,
        plan_id,
        title,
        description,
        start_date,
        due_date,
        status,
        progress_percent
      `)
      .eq(
        "group_id",
        groupId
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

  const rows =
    Array.isArray(data)
      ? data
      : [];

  if (!rows.length) {

    container.innerHTML = `
      <div class="member-list-item">
        <strong>No group activities</strong>
        <span class="member-muted">
          No activities have been recorded yet.
        </span>
      </div>
    `;

    return;
  }

  container.innerHTML =
    rows.map(
      activity => {

        const progress =
          Number(
            activity.progress_percent || 0
          );

        return `
          <div class="member-list-item">

            <strong>
              ${escapeHtml(
                activity.title ||
                "Group Activity"
              )}
            </strong>

            ${
              activity.description
                ? `
                  <span class="member-muted">
                    ${escapeHtml(
                      activity.description
                    )}
                  </span>
                `
                : ""
            }

            <span class="member-muted">
              ${
                activity.due_date
                  ? `Due ${escapeHtml(
                      formatDate(
                        activity.due_date
                      )
                    )}`
                  : "No due date"
              }
              ·
              ${Math.max(
                0,
                Math.min(
                  100,
                  progress
                )
              )}% complete
            </span>

            ${
              activity.status
                ? `
                  <span class="member-status">
                    ${escapeHtml(
                      displayStatus(
                        activity.status
                      )
                    )}
                  </span>
                `
                : ""
            }

          </div>
        `;

      }
    ).join("");

}


/* =========================================================
   PLANS & GOALS
========================================================= */

async function loadPlansAndGoals() {

  const container =
    byId("memberPlans");

  if (!container) {
    return;
  }

  const [
    plansResult,
    goalsResult
  ] =
    await Promise.all([
      supabase
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
          groupId
        )
        .order(
          "target_date",
          {
            ascending: true,
            nullsFirst: false
          }
        )
        .limit(5),

      supabase
        .from("contribution_goals")
        .select(`
          id,
          goal_name,
          category,
          description,
          frequency,
          start_date,
          end_date,
          target_amount,
          status
        `)
        .eq(
          "group_id",
          groupId
        )
        .order(
          "end_date",
          {
            ascending: true,
            nullsFirst: false
          }
        )
        .limit(5)
    ]);

  if (plansResult.error) {
    throw plansResult.error;
  }

  if (goalsResult.error) {
    throw goalsResult.error;
  }

  const plans =
    Array.isArray(
      plansResult.data
    )
      ? plansResult.data
      : [];

  const goals =
    Array.isArray(
      goalsResult.data
    )
      ? goalsResult.data
      : [];

  const items = [];

  plans.forEach(
    plan => {

      items.push({
        type: "Plan",
        title:
          plan.title ||
          "Group Plan",
        description:
          plan.description,
        date:
          plan.target_date,
        status:
          plan.status,
        progress:
          plan.progress_percent
      });

    }
  );

  goals.forEach(
    goal => {

      items.push({
        type: "Goal",
        title:
          goal.goal_name ||
          "Contribution Goal",
        description:
          goal.description,
        date:
          goal.end_date,
        status:
          goal.status,
        amount:
          goal.target_amount
      });

    }
  );

  if (!items.length) {

    container.innerHTML = `
      <div class="member-list-item">
        <strong>No plans or goals</strong>
        <span class="member-muted">
          No group plans or contribution goals have been recorded.
        </span>
      </div>
    `;

    return;
  }

  items
    .sort(
      (
        a,
        b
      ) => {

        if (!a.date) return 1;
        if (!b.date) return -1;

        return (
          new Date(a.date) -
          new Date(b.date)
        );

      }
    );

  container.innerHTML =
    items
      .slice(0, 8)
      .map(
        item => `

          <div class="member-list-item">

            <strong>
              ${escapeHtml(
                item.title
              )}
            </strong>

            <span class="member-muted">
              ${escapeHtml(
                item.type
              )}

              ${
                item.date
                  ? ` · Target ${escapeHtml(
                      formatDate(
                        item.date
                      )
                    )}`
                  : ""
              }

              ${
                item.amount !== undefined &&
                item.amount !== null
                  ? ` · ${escapeHtml(
                      formatMoney(
                        item.amount
                      )
                    )}`
                  : ""
              }
            </span>

            ${
              item.progress !== undefined &&
              item.progress !== null
                ? `
                  <span class="member-muted">
                    ${Math.max(
                      0,
                      Math.min(
                        100,
                        Number(
                          item.progress || 0
                        )
                      )
                    )}% complete
                  </span>
                `
                : ""
            }

            ${
              item.status
                ? `
                  <span class="member-status">
                    ${escapeHtml(
                      displayStatus(
                        item.status
                      )
                    )}
                  </span>
                `
                : ""
            }

          </div>

        `
      )
      .join("");

}


/* =========================================================
   MILESTONES
========================================================= */

async function loadMilestones() {

  const container =
    byId("memberMilestones");

  if (!container) {
    return;
  }

  const {
    data,
    error
  } =
    await supabase
      .from("group_milestones")
      .select(`
        id,
        plan_id,
        title,
        description,
        milestone_date,
        category,
        amount
      `)
      .eq(
        "group_id",
        groupId
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

  const rows =
    Array.isArray(data)
      ? data
      : [];

  if (!rows.length) {

    container.innerHTML = `
      <div class="member-list-item">
        <strong>No milestones</strong>
        <span class="member-muted">
          No group milestones have been recorded.
        </span>
      </div>
    `;

    return;
  }

  container.innerHTML =
    rows.map(
      milestone => `

        <div class="member-list-item">

          <strong>
            ${escapeHtml(
              milestone.title ||
              "Milestone"
            )}
          </strong>

          ${
            milestone.description
              ? `
                <span class="member-muted">
                  ${escapeHtml(
                    milestone.description
                  )}
                </span>
              `
              : ""
          }

          <span class="member-muted">
            ${
              milestone.milestone_date
                ? escapeHtml(
                    formatDate(
                      milestone.milestone_date
                    )
                  )
                : "No date"
            }

            ${
              milestone.category
                ? ` · ${escapeHtml(
                    milestone.category
                  )}`
                : ""
            }

            ${
              milestone.amount !== null &&
              milestone.amount !== undefined
                ? ` · ${escapeHtml(
                    formatMoney(
                      milestone.amount
                    )
                  )}`
                : ""
            }
          </span>

        </div>

      `
    ).join("");

}


/* =========================================================
   GROUP ASSETS
========================================================= */

async function loadAssets() {

  const container =
    byId("memberAssets");

  if (!container) {
    return;
  }

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
        acquisition_cost,
        current_value,
        location,
        status
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(5);

  if (error) {
    throw error;
  }

  const rows =
    Array.isArray(data)
      ? data
      : [];

  if (!rows.length) {

    container.innerHTML = `
      <div class="member-list-item">
        <strong>No group assets</strong>
        <span class="member-muted">
          No assets have been recorded yet.
        </span>
      </div>
    `;

    return;
  }

  container.innerHTML =
    rows.map(
      asset => `

        <div class="member-list-item">

          <strong>
            ${escapeHtml(
              asset.asset_name ||
              "Group Asset"
            )}
          </strong>

          <span class="member-muted">

            ${
              asset.category
                ? escapeHtml(
                    asset.category
                  )
                : "Asset"
            }

            ${
              asset.location
                ? ` · ${escapeHtml(
                    asset.location
                  )}`
                : ""
            }

            ${
              asset.status
                ? ` · ${escapeHtml(
                    displayStatus(
                      asset.status
                    )
                  )}`
                : ""
            }

          </span>

          ${
            asset.description
              ? `
                <span class="member-muted">
                  ${escapeHtml(
                    asset.description
                  )}
                </span>
              `
              : ""
          }

        </div>

      `
    ).join("");

}


/* =========================================================
   LOAD DASHBOARD
========================================================= */

async function loadDashboard() {

  clearError();
  showLoading(true);

  try {

    /* =====================================================
       CANONICAL APPLICATION CONTEXT
    ===================================================== */

    const context =
      await getMyApplicationContext();

    currentUser =
      context?.user || null;

    currentMember =
      context?.member || null;

    currentGroup =
      context?.group || null;

    groupId =
      currentMember?.group_id ||
      currentGroup?.id ||
      null;

    memberId =
      currentMember?.id ||
      null;


    if (!groupId) {

      throw new Error(
        "No group is associated with your member account."
      );

    }


    if (!memberId) {

      throw new Error(
        "No member record is associated with your account."
      );

    }


    /* =====================================================
       ACCOUNT
    ===================================================== */

    renderAccount();


    /* =====================================================
       READ-ONLY DASHBOARD DATA
       -----------------------------------------------------
       Each loader performs SELECT operations only.
    ===================================================== */

    const results =
      await Promise.allSettled([
        loadMyContributions(),
        loadMeetings(),
        loadActivities(),
        loadPlansAndGoals(),
        loadMilestones(),
        loadAssets()
      ]);


    const failures =
      results.filter(
        result =>
          result.status ===
          "rejected"
      );


    if (failures.length) {

      console.error(
        "CHAMA LIVE: some member dashboard sections failed",
        failures.map(
          failure =>
            failure.reason
        )
      );


      /*
       * Do not erase successfully loaded sections.
       *
       * Show a single useful dashboard-level warning while
       * preserving whatever data loaded successfully.
       */

      const firstFailure =
        failures[0]?.reason;

      const message =
        firstFailure?.message ||
        "Some group information could not be loaded.";

      showError(
        `Some dashboard information could not be loaded: ${message}`
      );

    }

  }

  catch (error) {

    showError(
      error?.message ||
      "Unable to load your member dashboard."
    );

  }

  finally {

    showLoading(false);

  }

}


/* =========================================================
   INITIALIZE
========================================================= */

async function init() {

  if (initialized) {
    return;
  }

  initialized =
    true;

  await loadDashboard();

}


/* =========================================================
   BOOT
   ---------------------------------------------------------
   layout.js loads this module after the authenticated
   portal context has been established.
========================================================= */

init();


console.log(
  "CHAMA LIVE: member-dashboard.js loaded"
);
