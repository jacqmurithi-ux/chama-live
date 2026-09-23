/* =========================================================
   CHAMA LIVE — MEMBER DASHBOARD
   ---------------------------------------------------------
   MEMBER PORTAL

   PURPOSE
   ---------------------------------------------------------
   • Show the authenticated member's own account information.
   • Show the member's own contribution summary.
   • Show canonical member contribution status.
   • Show read-only group-level information.
   • Provide navigation into the member portal.

   SECURITY CONTRACT
   ---------------------------------------------------------
   • Member identity comes from the authenticated session.
   • Member/group context comes from getMyApplicationContext().
   • This page is READ-ONLY.
   • No INSERT / UPDATE / DELETE.
   • No financial mutation.
   • No member mutation.
   • No group mutation.
   • No admin mutation.

   IMPORTANT
   ---------------------------------------------------------
   • Do not assume contributions.group_id exists.
   • Group contribution data is resolved through members.
   • Canonical member contribution position is resolved
     through get_member_contribution_position(uuid).
   • member-layout.js owns portal navigation/auth/logout.
   ========================================================= */

import { supabase } from "./supabase.js";
import { getMyApplicationContext } from "./auth.js";

let currentUser = null;
let currentMember = null;
let currentGroup = null;

let groupId = null;
let memberId = null;

let groupMembers = [];
let groupContributions = [];
let groupExpenses = [];

let initialized = false;


/* =========================================================
   DOM HELPERS
   ========================================================= */

function byId(id) {
  return document.getElementById(id);
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}


function formatMoney(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numberValue(value));
}


/* =========================================================
   CANONICAL CONTRIBUTION POSITION
   ========================================================= */

function contributionPositionStatus(
  position
) {
  if (!position) {
    return "UNKNOWN";
  }

  const status =
    String(
      position.status || ""
    )
      .trim()
      .toUpperCase();

  const arrears =
    numberValue(
      position.arrears
    );

  const credit =
    numberValue(
      position.credit
    );

  if (
    status === "ARREARS" ||
    arrears > 0
  ) {
    return "ARREARS";
  }

  if (
    status === "CREDIT" ||
    credit > 0
  ) {
    return "CREDIT";
  }

  return "UP_TO_DATE";
}


function renderMyContributionPosition(
  position
) {
  const element =
    byId(
      "myContributionStatus"
    );

  if (!element) {
    return;
  }

  const status =
    contributionPositionStatus(
      position
    );

  element.className =
    "member-finance-status-value";

  if (
    status === "ARREARS"
  ) {
    const arrears =
      numberValue(
        position?.arrears
      );

    element.classList.add(
      "status-arrears"
    );

    element.textContent =
      `Arrears — ${formatMoney(
        arrears
      )}`;

    return;
  }

  if (
    status === "CREDIT"
  ) {
    element.classList.add(
      "status-credit"
    );

    element.textContent =
      "Credit";

    return;
  }

  if (
    status === "UP_TO_DATE"
  ) {
    element.classList.add(
      "status-up-to-date"
    );

    element.textContent =
      "Up to date";

    return;
  }

  element.classList.add(
    "status-unknown"
  );

  element.textContent =
    "Unavailable";
}


async function loadMyContributionPosition() {
  const element =
    byId(
      "myContributionStatus"
    );

  if (!element) {
    return;
  }

  element.className =
    "member-finance-status-value status-unknown";

  element.textContent =
    "Loading...";

  try {
    const {
      data,
      error
    } = await supabase.rpc(
      "get_member_contribution_position",
      {
        p_member_id:
          memberId
      }
    );

    if (error) {
      throw error;
    }

    const position =
      Array.isArray(data)
        ? data[0]
        : data;

    if (!position) {
      throw new Error(
        "Contribution position returned no result."
      );
    }

    renderMyContributionPosition(
      position
    );

  } catch (error) {
    console.warn(
      "Member contribution position could not be loaded:",
      error
    );

    renderMyContributionPosition(
      null
    );
  }
}


function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}


function todayIso() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function currentMonthStart() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}-01`;
}


function displayRole(role) {
  if (!role) {
    return "Member";
  }

  return String(role)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}


function displayStatus(status) {
  if (!status) {
    return "—";
  }

  return String(status)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}


function setText(id, value) {
  const element = byId(id);

  if (element) {
    element.textContent = value ?? "—";
  }
}


/* =========================================================
   LOADING / ERROR
   ========================================================= */

function showLoading(show) {
  const loading = byId("memberLoading");

  if (loading) {
    loading.hidden = !show;
  }
}


function showError(message) {
  const error = byId("memberError");

  if (!error) {
    return;
  }

  error.textContent = message || "Unable to load your member dashboard.";
  error.hidden = false;
}


function clearError() {
  const error = byId("memberError");

  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
}


/* =========================================================
   ACCOUNT
   ========================================================= */

function renderAccount() {
  const memberName = currentMember?.name || "Member";
  const groupName = currentGroup?.name || "Your group";

  setText(
    "memberGreeting",
    `Welcome, ${memberName}`
  );

  setText(
    "memberGroupName",
    groupName
  );

  setText(
    "memberName",
    memberName
  );

  setText(
    "memberNumber",
    currentMember?.member_number ||
    currentMember?.membership_number ||
    currentMember?.member_no ||
    currentMember?.id ||
    "—"
  );

  setText(
    "memberRole",
    displayRole(currentMember?.role)
  );

  setText(
    "memberStatus",
    displayStatus(currentMember?.status)
  );
}


/* =========================================================
   MEMBER CONTRIBUTIONS
   ========================================================= */

async function loadMyContributions() {
  const { data, error } = await supabase
    .from("contributions")
    .select(
      "id, member_id, amount, contribution_date, contribution_type, payment_method"
    )
    .eq("member_id", memberId)
    .order("contribution_date", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  const contributions = Array.isArray(data)
    ? data
    : [];

  const total = contributions.reduce(
    (sum, contribution) =>
      sum + numberValue(contribution.amount),
    0
  );

  setText(
    "myContributionTotal",
    formatMoney(total)
  );

  setText(
    "myContributionCount",
    String(contributions.length)
  );
}


/* =========================================================
   GROUP READ DATA
   ========================================================= */

async function loadGroupReadData() {
  const [
    membersResult,
    expensesResult
  ] = await Promise.all([
    supabase
      .from("members")
      .select(
        "id, group_id, name, status"
      )
      .eq("group_id", groupId),

    supabase
      .from("expenses")
      .select(
        "id, description, category, amount, date, approval_status"
      )
      .eq("group_id", groupId)
      .order("date", {
        ascending: false
      })
      .limit(50)
  ]);

  if (membersResult.error) {
    throw membersResult.error;
  }

  if (expensesResult.error) {
    throw expensesResult.error;
  }

  groupMembers = Array.isArray(membersResult.data)
    ? membersResult.data
    : [];

  groupExpenses = Array.isArray(expensesResult.data)
    ? expensesResult.data
    : [];

  const memberIds = groupMembers
    .map(member => member.id)
    .filter(Boolean);

  if (!memberIds.length) {
    groupContributions = [];
    return;
  }

  const contributionsResult = await supabase
    .from("contributions")
    .select(
      "id, member_id, amount, contribution_date, contribution_type, payment_method"
    )
    .in("member_id", memberIds)
    .order("contribution_date", {
      ascending: false
    })
    .limit(50);

  if (contributionsResult.error) {
    throw contributionsResult.error;
  }

  groupContributions = Array.isArray(
    contributionsResult.data
  )
    ? contributionsResult.data
    : [];
}


/* =========================================================
   GROUP FINANCIAL HEALTH
   ========================================================= */

function renderGroupFinancialHealth() {
  const monthStart = currentMonthStart();

  const monthlyContributions =
    groupContributions
      .filter(contribution =>
        contribution.contribution_date &&
        String(contribution.contribution_date)
          .slice(0, 10) >= monthStart
      )
      .reduce(
        (sum, contribution) =>
          sum + numberValue(contribution.amount),
        0
      );

  const monthlyExpenses =
    groupExpenses
      .filter(expense =>
        expense.date &&
        String(expense.date).slice(0, 10) >= monthStart &&
        String(expense.approval_status || "").toLowerCase() ===
          "approved"
      )
      .reduce(
        (sum, expense) =>
          sum + numberValue(expense.amount),
        0
      );

  const netMovement =
    monthlyContributions - monthlyExpenses;

  const activeMembers =
    groupMembers.filter(member =>
      String(member.status || "").toLowerCase() === "active"
    );

  const activeMemberIds = new Set(
    activeMembers.map(member => member.id)
  );

  const activeContributors =
    new Set(
      groupContributions
        .filter(contribution =>
          activeMemberIds.has(contribution.member_id) &&
          contribution.contribution_date &&
          String(contribution.contribution_date)
            .slice(0, 10) >= monthStart
        )
        .map(contribution => contribution.member_id)
    );

  const participation =
    activeMembers.length
      ? (activeContributors.size / activeMembers.length) * 100
      : 0;

  const safeParticipation = Math.max(
    0,
    Math.min(100, participation)
  );

  const expenseCount =
    groupExpenses.filter(expense =>
      expense.date &&
      String(expense.date).slice(0, 10) >= monthStart
    ).length;

  let expenseActivity = "Quiet";

  if (expenseCount >= 5) {
    expenseActivity = "Active";
  } else if (expenseCount >= 1) {
    expenseActivity = "Normal";
  }

  setText(
    "groupMemberCount",
    String(groupMembers.length)
  );

  setText(
    "groupMonthlyContributions",
    formatMoney(monthlyContributions)
  );

  setText(
    "groupMonthlyExpenses",
    formatMoney(monthlyExpenses)
  );

  setText(
    "groupNetMovement",
    formatMoney(netMovement)
  );

  setText(
    "groupParticipation",
    `${Math.round(safeParticipation)}%`
  );

  setText(
    "groupExpenseActivity",
    expenseActivity
  );

  setText(
    "activityMemberCount",
    String(groupMembers.length)
  );

  setText(
    "activityContributionCount",
    String(groupContributions.length)
  );

  setText(
    "activityExpenseCount",
    String(groupExpenses.length)
  );

  const bar = byId("groupParticipationBar");

  if (bar) {
    bar.style.width = `${safeParticipation}%`;

    bar.setAttribute(
      "aria-valuenow",
      String(
        Math.round(
          safeParticipation
        )
      )
    );
  }
}


/* =========================================================
   RECENT GROUP CONTRIBUTIONS
   ========================================================= */

function renderRecentGroupContributions() {
  const container = byId(
    "memberRecentContributions"
  );

  if (!container) {
    return;
  }

  if (!groupContributions.length) {
    container.innerHTML =
      "<p>No recent group contributions recorded.</p>";
    return;
  }

  const memberNames = new Map(
    groupMembers.map(member => [
      member.id,
      member.name || "Member"
    ])
  );

  const recent =
    groupContributions.slice(0, 5);

  container.innerHTML = recent
    .map(contribution => {
      const name =
        memberNames.get(
          contribution.member_id
        ) || "Member";

      return `
        <div class="member-dashboard-list-item">
          <div>
            <strong>${escapeHtml(name)}</strong>
            <small>
              ${escapeHtml(
                contribution.contribution_type ||
                "Contribution"
              )}
              ·
              ${escapeHtml(
                formatDate(
                  contribution.contribution_date
                )
              )}
            </small>
          </div>

          <strong>
            ${escapeHtml(
              formatMoney(contribution.amount)
            )}
          </strong>
        </div>
      `;
    })
    .join("");
}


/* =========================================================
   RECENT GROUP EXPENSES
   ========================================================= */

function renderRecentGroupExpenses() {
  const container = byId(
    "memberRecentExpenses"
  );

  if (!container) {
    return;
  }

  if (!groupExpenses.length) {
    container.innerHTML =
      "<p>No recent group expenses recorded.</p>";
    return;
  }

  const recent =
    groupExpenses.slice(0, 3);

  container.innerHTML = recent
    .map(expense => {
      const status =
        expense.approval_status ||
        "Pending";

      const approved =
        String(status).toLowerCase() ===
        "approved";

      return `
        <div class="member-dashboard-list-item">
          <div>
            <strong>
              ${escapeHtml(
                expense.description ||
                expense.category ||
                "Expense"
              )}
            </strong>

            <small>
              ${escapeHtml(
                expense.category || "Expense"
              )}
              ·
              ${escapeHtml(
                formatDate(expense.date)
              )}
              ·
              ${escapeHtml(status)}
            </small>
          </div>

          <strong${approved ? "" : ' style="opacity:.75;"'}>
            ${escapeHtml(
              formatMoney(expense.amount)
            )}
          </strong>
        </div>
      `;
    })
    .join("");
}


/* =========================================================
   MEETINGS
   ========================================================= */

async function loadMeetings() {
  const container = byId(
    "memberMeetings"
  );

  if (!container) {
    return;
  }

  const { data, error } = await supabase
    .from("meetings")
    .select(
      "id, date, title, venue, status"
    )
    .eq("group_id", groupId)
    .gte("date", todayIso())
    .order("date", {
      ascending: true
    })
    .limit(5);

  if (error) {
    throw error;
  }

  const meetings = Array.isArray(data)
    ? data
    : [];

  if (!meetings.length) {
    container.innerHTML =
      "<p>No upcoming meetings recorded.</p>";
    return;
  }

  container.innerHTML = meetings
    .map(meeting => `
      <div class="member-dashboard-list-item">
        <div>
          <strong>
            ${escapeHtml(
              meeting.title || "Meeting"
            )}
          </strong>

          <small>
            ${escapeHtml(
              formatDate(meeting.date)
            )}
            ${meeting.venue
              ? ` · ${escapeHtml(meeting.venue)}`
              : ""}
          </small>
        </div>

        <span>
          ${escapeHtml(
            meeting.status || "Scheduled"
          )}
        </span>
      </div>
    `)
    .join("");
}


/* =========================================================
   GROUP ACTIVITIES
   ========================================================= */

async function loadActivities() {
  const container = byId(
    "memberActivities"
  );

  if (!container) {
    return;
  }

  const { data, error } = await supabase
    .from("group_activities")
    .select(
      "id, plan_id, title, description, start_date, due_date, status, progress_percent"
    )
    .eq("group_id", groupId)
    .order("due_date", {
      ascending: true,
      nullsFirst: false
    })
    .limit(5);

  if (error) {
    throw error;
  }

  const activities = Array.isArray(data)
    ? data
    : [];

  if (!activities.length) {
    container.innerHTML =
      "<p>No group activities recorded.</p>";
    return;
  }

  container.innerHTML = activities
    .map(activity => `
      <div class="member-dashboard-list-item">
        <div>
          <strong>
            ${escapeHtml(
              activity.title || "Activity"
            )}
          </strong>

          <small>
            ${escapeHtml(
              activity.status || "Planned"
            )}
            ${activity.due_date
              ? ` · Due ${escapeHtml(
                  formatDate(activity.due_date)
                )}`
              : ""}
          </small>
        </div>

        <span>
          ${numberValue(
            activity.progress_percent
          )}%
        </span>
      </div>
    `)
    .join("");
}


/* =========================================================
   PLANS & GOALS
   ========================================================= */

async function loadPlansAndGoals() {
  const container = byId(
    "memberPlans"
  );

  if (!container) {
    return;
  }

  const [
    plansResult,
    goalsResult
  ] = await Promise.all([
    supabase
      .from("group_plans")
      .select(
        "id, title, description, category, start_date, target_date, status, progress_percent"
      )
      .eq("group_id", groupId)
      .order("target_date", {
        ascending: true,
        nullsFirst: false
      })
      .limit(5),

    supabase
      .from("contribution_goals")
      .select(
        "id, goal_name, category, description, frequency, start_date, end_date, target_amount, status"
      )
      .eq("group_id", groupId)
      .order("end_date", {
        ascending: true,
        nullsFirst: false
      })
      .limit(5)
  ]);

  if (plansResult.error) {
    throw plansResult.error;
  }

  if (goalsResult.error) {
    throw goalsResult.error;
  }

  const plans = Array.isArray(plansResult.data)
    ? plansResult.data
    : [];

  const goals = Array.isArray(goalsResult.data)
    ? goalsResult.data
    : [];

  const combined = [
    ...plans.map(plan => ({
      type: "Plan",
      title: plan.title,
      description: plan.description,
      status: plan.status,
      progress: plan.progress_percent,
      date: plan.target_date
    })),

    ...goals.map(goal => ({
      type: "Goal",
      title: goal.goal_name,
      description: goal.description,
      status: goal.status,
      progress: null,
      date: goal.end_date
    }))
  ]
    .sort((a, b) => {
      const first =
        a.date
          ? new Date(a.date).getTime()
          : Number.MAX_SAFE_INTEGER;

      const second =
        b.date
          ? new Date(b.date).getTime()
          : Number.MAX_SAFE_INTEGER;

      return first - second;
    })
    .slice(0, 5);

  if (!combined.length) {
    container.innerHTML =
      "<p>No plans or goals recorded.</p>";
    return;
  }

  container.innerHTML = combined
    .map(item => `
      <div class="member-dashboard-list-item">
        <div>
          <strong>
            ${escapeHtml(
              item.title || item.type
            )}
          </strong>

          <small>
            ${escapeHtml(item.type)}
            ${item.status
              ? ` · ${escapeHtml(item.status)}`
              : ""}
            ${item.date
              ? ` · ${escapeHtml(
                  formatDate(item.date)
                )}`
              : ""}
          </small>
        </div>

        <span>
          ${
            item.progress !== null &&
            item.progress !== undefined
              ? `${numberValue(item.progress)}%`
              : ""
          }
        </span>
      </div>
    `)
    .join("");
}


/* =========================================================
   GROUP ASSETS
   ========================================================= */

async function loadAssets() {
  const container = byId(
    "memberAssets"
  );

  if (!container) {
    return;
  }

  const { data, error } = await supabase
    .from("group_assets")
    .select(
      "id, asset_name, category, description, acquired_date, acquisition_cost, current_value, location, status"
    )
    .eq("group_id", groupId)
    .order("created_at", {
      ascending: false
    })
    .limit(5);

  if (error) {
    throw error;
  }

  const assets = Array.isArray(data)
    ? data
    : [];

  if (!assets.length) {
    container.innerHTML =
      "<p>No group assets recorded.</p>";
    return;
  }

  container.innerHTML = assets
    .map(asset => `
      <div class="member-dashboard-list-item">
        <div>
          <strong>
            ${escapeHtml(
              asset.asset_name || "Asset"
            )}
          </strong>

          <small>
            ${escapeHtml(
              asset.category || "Asset"
            )}
            ${asset.location
              ? ` · ${escapeHtml(asset.location)}`
              : ""}
            ${asset.status
              ? ` · ${escapeHtml(asset.status)}`
              : ""}
          </small>
        </div>

        <span>
          ${asset.current_value !== null &&
          asset.current_value !== undefined
            ? escapeHtml(
                formatMoney(asset.current_value)
              )
            : ""}
        </span>
      </div>
    `)
    .join("");
}


/* =========================================================
   DASHBOARD LOAD
   ========================================================= */

async function loadDashboard() {
  clearError();
  showLoading(true);

  try {
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

    if (!currentMember) {
      throw new Error(
        "Your member account could not be loaded."
      );
    }

    if (!groupId) {
      throw new Error(
        "Your group could not be identified."
      );
    }

    if (!memberId) {
      throw new Error(
        "Your member identity could not be identified."
      );
    }

    renderAccount();

    const results =
      await Promise.allSettled([
        loadMyContributions(),
        loadMyContributionPosition(),
        loadGroupReadData(),
        loadMeetings(),
        loadActivities(),
        loadPlansAndGoals(),
        loadAssets()
      ]);

    const [
      myContributionsResult,
      myContributionPositionResult,
      groupDataResult,
      meetingsResult,
      activitiesResult,
      plansResult,
      assetsResult
    ] = results;

    if (
      groupDataResult.status ===
      "fulfilled"
    ) {
      renderGroupFinancialHealth();
      renderRecentGroupContributions();
      renderRecentGroupExpenses();
    } else {
      console.warn(
        "Member dashboard group read data failed:",
        groupDataResult.reason
      );

      setText(
        "groupMemberCount",
        "—"
      );

      setText(
        "groupMonthlyContributions",
        "—"
      );

      setText(
        "groupMonthlyExpenses",
        "—"
      );

      setText(
        "groupNetMovement",
        "—"
      );

      setText(
        "groupParticipation",
        "—"
      );

      setText(
        "groupExpenseActivity",
        "—"
      );

      setText(
        "activityMemberCount",
        "—"
      );

      setText(
        "activityContributionCount",
        "—"
      );

      setText(
        "activityExpenseCount",
        "—"
      );

      const contributionContainer =
        byId("memberRecentContributions");

      if (contributionContainer) {
        contributionContainer.innerHTML =
          "<p>Group contribution data could not be loaded.</p>";
      }

      const expenseContainer =
        byId("memberRecentExpenses");

      if (expenseContainer) {
        expenseContainer.innerHTML =
          "<p>Group expense data could not be loaded.</p>";
      }
    }

    const failures = results.filter(
      result =>
        result.status === "rejected"
    );

    if (failures.length) {
      console.warn(
        "Some member dashboard sections failed to load:",
        failures.map(
          failure => failure.reason
        )
      );
    }

    if (failures.length === results.length) {
      throw new Error(
        "The member dashboard could not load its data."
      );
    }

    void myContributionsResult;
    void myContributionPositionResult;
    void meetingsResult;
    void activitiesResult;
    void plansResult;
    void assetsResult;

  } catch (error) {
    console.error(
      "Member dashboard load failed:",
      error
    );

    showError(
      error?.message ||
      "Unable to load your member dashboard."
    );

  } finally {
    showLoading(false);
  }
}


/* =========================================================
   INITIALIZER
   ========================================================= */

export async function initMemberDashboard() {
  if (initialized) {
    return;
  }

  initialized = true;

  await loadDashboard();
}


console.log(
  "CHAMA LIVE member-dashboard.js loaded."
);
