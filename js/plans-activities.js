import { supabase } from "./supabase.js";
import { requireAuth, getMyMember } from "./auth.js";

/* =========================================================
   CHAMA LIVE — PLANS & ACTIVITIES

   Operational module only.
   Does not modify financial accounting.
   admin-layout.js owns page initialization.
   ========================================================= */

const PLAN_CATEGORIES = [
  "investment",
  "property",
  "welfare",
  "business",
  "education",
  "membership",
  "fundraising",
  "infrastructure",
  "other"
];

const PLAN_STATUSES = [
  "planned",
  "active",
  "completed",
  "paused",
  "cancelled"
];

const ACTIVITY_STATUSES = [
  "not_started",
  "planned",
  "in_progress",
  "completed",
  "delayed",
  "cancelled"
];

const MANAGEMENT_ROLES = [
  "admin",
  "administrator",
  "chairperson",
  "secretary"
];

const state = {
  currentMember: null,
  groupId: null,
  groupName: "",
  members: [],
  plans: [],
  activities: [],
  initialized: false
};

const $ = (id) => document.getElementById(id);

/* =========================================================
   MESSAGES
   ========================================================= */

function showStatus(message) {
  const element = $("status");

  if (!element) return;

  element.textContent = message || "";
  element.classList.toggle("hidden", !message);
}

function showError(message) {
  const element = $("error");

  if (!element) {
    if (message) {
      console.error(
        "CHAMA LIVE Plans & Activities:",
        message
      );
    }

    return;
  }

  element.textContent = message || "";
  element.classList.toggle("hidden", !message);
}

function clearMessages() {
  showStatus("");
  showError("");
}

/* =========================================================
   ERROR HANDLING
   ========================================================= */

function normalizeError(error) {
  if (!error) {
    return "Unexpected error. Please try again.";
  }

  const code = error.code || error.status;

  const message = String(
    error.message || ""
  ).trim();

  if (code === "42501" || code === 403) {
    return (
      "Permission denied. Confirm that your signed-in " +
      "account is an authorised manager of this group."
    );
  }

  if (code === "23514") {
    return message ||
      "A value does not satisfy a database validation rule.";
  }

  if (code === "23503") {
    return (
      "A linked plan, member, or group record is invalid. " +
      "Check that it belongs to the current group."
    );
  }

  if (code === "23505") {
    return "A record with these details already exists.";
  }

  if (
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST200"
  ) {
    return (
      "The database schema does not match this page: " +
      (message || "please check the database columns.")
    );
  }

  if (
    message.toLowerCase().includes("failed to fetch")
  ) {
    return (
      "The request could not reach Supabase. Check your " +
      "internet connection and try again."
    );
  }

  return message ||
    "The operation could not be completed. Please try again.";
}

/* =========================================================
   HTML SAFETY
   ========================================================= */

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

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return date.toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );
}

function statusLabel(value) {
  return String(value || "")
    .replaceAll("_", " ");
}

function badge(value) {
  const safe = escapeHtml(value);

  return `
    <span class="badge status-${safe}">
      ${escapeHtml(statusLabel(value))}
    </span>
  `;
}

function progress(value) {
  const number = Math.max(
    0,
    Math.min(100, Number(value) || 0)
  );

  return `
    <div class="progress-cell">
      <div class="progress-track">
        <div
          class="progress-fill"
          style="width:${number}%"
        ></div>
      </div>

      <div class="progress-label">
        ${number}%
      </div>
    </div>
  `;
}

/* =========================================================
   VALIDATION
   ========================================================= */

function validateDateOrder(
  startDate,
  endDate,
  label
) {
  if (
    startDate &&
    endDate &&
    endDate < startDate
  ) {
    throw new Error(
      `${label}: the end date cannot be before the start date.`
    );
  }
}

function requireFormValue(id, label) {
  const element = $(id);

  if (!element) {
    throw new Error(
      `The ${label} form field was not found. ` +
      "Check that the HTML and JavaScript versions match."
    );
  }

  return element.value;
}

/* =========================================================
   ROLE AND ACCESS
   ========================================================= */

function normalizeRole(role) {
  if (role && typeof role === "object") {
    role = role.role ?? role.name ?? "";
  }

  return String(role || "")
    .trim()
    .toLowerCase();
}

function canManage() {
  return MANAGEMENT_ROLES.includes(
    normalizeRole(state.currentMember?.role)
  );
}

/* =========================================================
   AUTHENTICATED GROUP CONTEXT
   ========================================================= */

async function loadContext() {
  await requireAuth();

  const member = await getMyMember();

  if (!member?.id || !member?.group_id) {
    throw new Error(
      "Your authenticated member/group context could not " +
      "be resolved. Sign in again or ask your group " +
      "administrator to verify your membership."
    );
  }

  state.currentMember = member;
  state.groupId = member.group_id;

  const {
    data: group,
    error
  } = await supabase
    .from("groups")
    .select("id,name")
    .eq("id", state.groupId)
    .maybeSingle();

  if (error) throw error;

  if (!group) {
    throw new Error(
      "The current group could not be loaded for your membership."
    );
  }

  state.groupName = group.name || "";

  if ($("groupName")) {
    $("groupName").textContent =
      state.groupName || "Current group";
  }

  if ($("plansGroupDisplay")) {
    $("plansGroupDisplay").textContent =
      state.groupName || "Current group";
  }

  console.info(
    "CHAMA LIVE: Plans & Activities context",
    {
      groupId: state.groupId,
      groupName: state.groupName,
      memberId: state.currentMember.id,
      role: state.currentMember.role,
      canManage: canManage()
    }
  );
}

/* =========================================================
   MEMBERS
   ========================================================= */

async function loadMembers() {
  const {
    data,
    error
  } = await supabase
    .from("members")
    .select("id,name,member_number,status")
    .eq("group_id", state.groupId)
    .order("name", {
      ascending: true
    });

  if (error) throw error;

  state.members = data || [];

  const activeMembers = state.members.filter(
    (member) => member.status === "active"
  );

  const assigneeSelect = $("activityAssignee");

  if (assigneeSelect) {
    assigneeSelect.innerHTML =
      `<option value="">Unassigned</option>` +
      activeMembers.map((member) => `
        <option value="${escapeHtml(member.id)}">
          ${escapeHtml(member.name)}
          ${
            member.member_number
              ? ` (${escapeHtml(member.member_number)})`
              : ""
          }
        </option>
      `).join("");
  }

  const filterSelect = $("activityFilterAssignee");

  if (filterSelect) {
    const previous = filterSelect.value;

    filterSelect.innerHTML =
      `<option value="">All assignees</option>` +
      activeMembers.map((member) => `
        <option value="${escapeHtml(member.id)}">
          ${escapeHtml(member.name)}
        </option>
      `).join("");

    filterSelect.value = activeMembers.some(
      (member) => member.id === previous
    ) ? previous : "";
  }
}

/* =========================================================
   LOAD PLANS
   ========================================================= */

async function loadPlans() {
  const {
    data,
    error
  } = await supabase
    .from("group_plans")
    .select(`
      id,
      group_id,
      title,
      description,
      category,
      start_date,
      target_date,
      status,
      progress_percent,
      created_by,
      created_at,
      updated_at
    `)
    .eq("group_id", state.groupId)
    .order("target_date", {
      ascending: true,
      nullsFirst: false
    })
    .order("created_at", {
      ascending: false
    });

  if (error) throw error;

  state.plans = data || [];

  populatePlanSelect();
  renderPlans();
  updateSummary();
}

/* =========================================================
   LOAD ACTIVITIES
   ========================================================= */

async function loadActivities() {
  const {
    data,
    error
  } = await supabase
    .from("group_activities")
    .select(`
      id,
      group_id,
      plan_id,
      title,
      description,
      assigned_to,
      start_date,
      due_date,
      status,
      progress_percent,
      completed_at,
      created_by,
      created_at,
      updated_at
    `)
    .eq("group_id", state.groupId)
    .order("due_date", {
      ascending: true,
      nullsFirst: false
    })
    .order("created_at", {
      ascending: false
    });

  if (error) throw error;

  state.activities = data || [];

  renderActivities();
  updateSummary();
}

/* =========================================================
   SELECT OPTIONS
   ========================================================= */

function populatePlanSelect() {
  const select = $("activityPlan");

  if (!select) return;

  const previous = select.value;

  select.innerHTML =
    `<option value="">No linked plan</option>` +
    state.plans.map((plan) => `
      <option value="${escapeHtml(plan.id)}">
        ${escapeHtml(plan.title)}
      </option>
    `).join("");

  select.value = state.plans.some(
    (plan) => plan.id === previous
  ) ? previous : "";
}

function getMemberName(id) {
  if (!id) return "Unassigned";

  return state.members.find(
    (member) => member.id === id
  )?.name || "Unknown member";
}

function getPlanTitle(id) {
  if (!id) return "Unlinked";

  return state.plans.find(
    (plan) => plan.id === id
  )?.title || "Unlinked";
}

/* =========================================================
   RENDER PLANS
   ========================================================= */

function renderPlans() {
  const body = $("plansBody");

  if (!body) return;

  const status = $("planFilterStatus")?.value || "";

  const search =
    $("planSearch")?.value.trim().toLowerCase() || "";

  const rows = state.plans.filter((plan) => {
    if (status && plan.status !== status) {
      return false;
    }

    if (!search) return true;

    return [
      plan.title,
      plan.description,
      plan.category,
      plan.status
    ].some((value) =>
      String(value || "").toLowerCase().includes(search)
    );
  });

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty">
          No plans found.
        </td>
      </tr>
    `;

    return;
  }

  body.innerHTML = rows.map((plan) => `
    <tr>
      <td>
        <strong>${escapeHtml(plan.title)}</strong>

        ${
          plan.description
            ? `
              <div class="help">
                ${escapeHtml(plan.description)}
              </div>
            `
            : ""
        }
      </td>

      <td>${escapeHtml(plan.category)}</td>

      <td>
        ${formatDate(plan.start_date)}
        →
        ${formatDate(plan.target_date)}
      </td>

      <td>${badge(plan.status)}</td>

      <td>${progress(plan.progress_percent)}</td>

      <td>${formatDateTime(plan.created_at)}</td>

      <td>
        ${
          canManage()
            ? `
              <div class="row-actions">
                ${
                  plan.status !== "active"
                    ? `
                      <button
                        class="action"
                        data-plan-action="active"
                        data-id="${escapeHtml(plan.id)}"
                        type="button"
                      >
                        Activate
                      </button>
                    `
                    : ""
                }

                ${
                  plan.status !== "completed"
                    ? `
                      <button
                        class="action"
                        data-plan-action="completed"
                        data-id="${escapeHtml(plan.id)}"
                        type="button"
                      >
                        Complete
                      </button>
                    `
                    : ""
                }

                ${
                  plan.status !== "paused"
                    ? `
                      <button
                        class="action"
                        data-plan-action="paused"
                        data-id="${escapeHtml(plan.id)}"
                        type="button"
                      >
                        Pause
                      </button>
                    `
                    : ""
                }

                ${
                  plan.status !== "cancelled"
                    ? `
                      <button
                        class="action"
                        data-plan-action="cancelled"
                        data-id="${escapeHtml(plan.id)}"
                        type="button"
                      >
                        Cancel
                      </button>
                    `
                    : ""
                }
              </div>
            `
            : "View only"
        }
      </td>
    </tr>
  `).join("");
}

/* =========================================================
   RENDER ACTIVITIES
   ========================================================= */

function renderActivities() {
  const body = $("activitiesBody");

  if (!body) return;

  const status =
    $("activityFilterStatus")?.value || "";

  const assignee =
    $("activityFilterAssignee")?.value || "";

  const search =
    $("activitySearch")?.value.trim().toLowerCase() || "";

  const rows = state.activities.filter((activity) => {
    if (status && activity.status !== status) {
      return false;
    }

    if (
      assignee &&
      activity.assigned_to !== assignee
    ) {
      return false;
    }

    if (!search) return true;

    return [
      activity.title,
      activity.description,
      activity.status,
      getPlanTitle(activity.plan_id),
      getMemberName(activity.assigned_to)
    ].some((value) =>
      String(value || "").toLowerCase().includes(search)
    );
  });

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty">
          No activities found.
        </td>
      </tr>
    `;

    return;
  }

  body.innerHTML = rows.map((activity) => `
    <tr>
      <td>
        <strong>${escapeHtml(activity.title)}</strong>

        ${
          activity.description
            ? `
              <div class="help">
                ${escapeHtml(activity.description)}
              </div>
            `
            : ""
        }
      </td>

      <td>
        ${escapeHtml(getPlanTitle(activity.plan_id))}
      </td>

      <td>
        ${escapeHtml(getMemberName(activity.assigned_to))}
      </td>

      <td>
        ${formatDate(activity.start_date)}
        →
        ${formatDate(activity.due_date)}
      </td>

      <td>${badge(activity.status)}</td>

      <td>${progress(activity.progress_percent)}</td>

      <td>
        ${
          canManage()
            ? `
              <div class="row-actions">
                ${
                  activity.status !== "in_progress" &&
                  activity.status !== "completed" &&
                  activity.status !== "cancelled"
                    ? `
                      <button
                        class="action"
                        data-activity-action="in_progress"
                        data-id="${escapeHtml(activity.id)}"
                        type="button"
                      >
                        Start
                      </button>
                    `
                    : ""
                }

                ${
                  activity.status !== "completed"
                    ? `
                      <button
                        class="action"
                        data-activity-action="completed"
                        data-id="${escapeHtml(activity.id)}"
                        type="button"
                      >
                        Complete
                      </button>
                    `
                    : ""
                }

                ${
                  activity.status !== "delayed" &&
                  activity.status !== "completed" &&
                  activity.status !== "cancelled"
                    ? `
                      <button
                        class="action"
                        data-activity-action="delayed"
                        data-id="${escapeHtml(activity.id)}"
                        type="button"
                      >
                        Delay
                      </button>
                    `
                    : ""
                }

                ${
                  activity.status !== "cancelled" &&
                  activity.status !== "completed"
                    ? `
                      <button
                        class="action"
                        data-activity-action="cancelled"
                        data-id="${escapeHtml(activity.id)}"
                        type="button"
                      >
                        Cancel
                      </button>
                    `
                    : ""
                }
              </div>
            `
            : "View only"
        }
      </td>
    </tr>
  `).join("");
}

/* =========================================================
   SUMMARY
   ========================================================= */

function updateSummary() {
  if ($("totalPlans")) {
    $("totalPlans").textContent = state.plans.length;
  }

  if ($("activePlans")) {
    $("activePlans").textContent = state.plans.filter(
      (plan) => plan.status === "active"
    ).length;
  }

  if ($("openActivities")) {
    $("openActivities").textContent =
      state.activities.filter(
        (activity) =>
          !["completed", "cancelled"].includes(
            activity.status
          )
      ).length;
  }

  if ($("completedActivities")) {
    $("completedActivities").textContent =
      state.activities.filter(
        (activity) => activity.status === "completed"
      ).length;
  }
}

/* =========================================================
   RESET FORMS
   ========================================================= */

function resetPlanForm() {
  const form = $("planForm");

  if (!form) return;

  form.reset();

  if ($("planStatus")) {
    $("planStatus").value = "planned";
  }

  if ($("planProgress")) {
    $("planProgress").value = "0";
  }
}

function resetActivityForm() {
  const form = $("activityForm");

  if (!form) return;

  form.reset();

  if ($("activityStatus")) {
    $("activityStatus").value = "not_started";
  }

  if ($("activityProgress")) {
    $("activityProgress").value = "0";
  }
}

/* =========================================================
   CREATE PLAN
   ========================================================= */

async function createPlan(event) {
  event.preventDefault();

  clearMessages();

  if (!canManage()) {
    throw new Error(
      "Only an authorised group admin, chairperson, " +
      "or secretary can create plans."
    );
  }

  const title =
    requireFormValue("planTitle", "plan title").trim();

  const description =
    requireFormValue(
      "planDescription",
      "plan description"
    ).trim() || null;

  const category =
    requireFormValue("planCategory", "plan category");

  const status =
    requireFormValue("planStatus", "plan status");

  const startDate =
    requireFormValue("planStart", "plan start date") || null;

  const targetDate =
    requireFormValue("planTarget", "plan target date") || null;

  const progressPercent = Number(
    requireFormValue("planProgress", "plan progress")
  );

  if (!title) {
    throw new Error("Plan title is required.");
  }

  if (!PLAN_CATEGORIES.includes(category)) {
    throw new Error(
      "Invalid plan category. Refresh the page and select a listed category."
    );
  }

  if (!PLAN_STATUSES.includes(status)) {
    throw new Error(
      "Invalid plan status. Refresh the page and select a listed status."
    );
  }

  if (
    !Number.isInteger(progressPercent) ||
    progressPercent < 0 ||
    progressPercent > 100
  ) {
    throw new Error(
      "Progress must be a whole number from 0 to 100."
    );
  }

  validateDateOrder(
    startDate,
    targetDate,
    "Plan dates"
  );

  const button = $("savePlan");

  if (button) button.disabled = true;

  showStatus("Saving plan…");

  try {
    const { error } = await supabase
      .from("group_plans")
      .insert({
        group_id: state.groupId,
        title,
        description,
        category,
        start_date: startDate,
        target_date: targetDate,
        status,
        progress_percent: progressPercent,
        created_by: state.currentMember.id
      });

    if (error) throw error;

    resetPlanForm();

    showStatus(
      "Plan saved. Refreshing the plans list…"
    );

    try {
      await loadPlans();

      showStatus("Plan created successfully.");
    } catch (refreshError) {
      console.error(
        "Plan saved, but plans list refresh failed:",
        refreshError
      );

      showError(
        "The plan was saved, but the list could not be " +
        "refreshed. Do not submit it again. " +
        normalizeError(refreshError)
      );
    }
  } catch (error) {
    console.error("Create plan failed:", {
      error,
      groupId: state.groupId,
      memberId: state.currentMember?.id,
      role: state.currentMember?.role
    });

    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

/* =========================================================
   CREATE ACTIVITY
   ========================================================= */

async function createActivity(event) {
  event.preventDefault();

  clearMessages();

  if (!canManage()) {
    throw new Error(
      "Only an authorised group admin, chairperson, " +
      "or secretary can create activities."
    );
  }

  const title =
    requireFormValue(
      "activityTitle",
      "activity title"
    ).trim();

  const description =
    requireFormValue(
      "activityDescription",
      "activity description"
    ).trim() || null;

  const planId =
    requireFormValue(
      "activityPlan",
      "linked plan"
    ) || null;

  const assignedTo =
    requireFormValue(
      "activityAssignee",
      "activity assignee"
    ) || null;

  const status =
    requireFormValue(
      "activityStatus",
      "activity status"
    );

  const startDate =
    requireFormValue(
      "activityStart",
      "activity start date"
    ) || null;

  const dueDate =
    requireFormValue(
      "activityDue",
      "activity due date"
    ) || null;

  const progressPercent = Number(
    requireFormValue(
      "activityProgress",
      "activity progress"
    )
  );

  if (!title) {
    throw new Error("Activity title is required.");
  }

  if (!ACTIVITY_STATUSES.includes(status)) {
    throw new Error(
      "Invalid activity status. Refresh the page and select a listed status."
    );
  }

  if (
    !Number.isInteger(progressPercent) ||
    progressPercent < 0 ||
    progressPercent > 100
  ) {
    throw new Error(
      "Progress must be a whole number from 0 to 100."
    );
  }

  validateDateOrder(
    startDate,
    dueDate,
    "Activity dates"
  );

  const button = $("saveActivity");

  if (button) button.disabled = true;

  showStatus("Saving activity…");

  try {
    const { error } = await supabase
      .from("group_activities")
      .insert({
        group_id: state.groupId,
        plan_id: planId,
        title,
        description,
        assigned_to: assignedTo,
        start_date: startDate,
        due_date: dueDate,
        status,
        progress_percent: progressPercent,
        completed_at:
          status === "completed"
            ? new Date().toISOString()
            : null,
        created_by: state.currentMember.id
      });

    if (error) throw error;

    resetActivityForm();

    showStatus(
      "Activity saved. Refreshing the activities list…"
    );

    try {
      await loadActivities();

      showStatus("Activity created successfully.");
    } catch (refreshError) {
      console.error(
        "Activity saved, but activities list refresh failed:",
        refreshError
      );

      showError(
        "The activity was saved, but the list could not " +
        "be refreshed. Do not submit it again. " +
        normalizeError(refreshError)
      );
    }
  } catch (error) {
    console.error("Create activity failed:", {
      error,
      groupId: state.groupId,
      memberId: state.currentMember?.id,
      role: state.currentMember?.role
    });

    throw error;
  } finally {
    if (button) button.disabled = false;
  }
}

/* =========================================================
   UPDATE PLAN STATUS
   ========================================================= */

async function updatePlanStatus(id, nextStatus) {
  if (!canManage()) {
    throw new Error(
      "You do not have permission to update plans."
    );
  }

  const plan = state.plans.find(
    (item) => item.id === id
  );

  if (!plan) return;

  if (!PLAN_STATUSES.includes(nextStatus)) {
    throw new Error("Invalid plan status.");
  }

  const update = {
    status: nextStatus
  };

  if (nextStatus === "completed") {
    update.progress_percent = 100;
  }

  const { error } = await supabase
    .from("group_plans")
    .update(update)
    .eq("id", id)
    .eq("group_id", state.groupId);

  if (error) throw error;

  await loadPlans();

  showStatus(
    `Plan marked ${statusLabel(nextStatus)}.`
  );
}

/* =========================================================
   UPDATE ACTIVITY STATUS
   ========================================================= */

async function updateActivityStatus(id, nextStatus) {
  if (!canManage()) {
    throw new Error(
      "You do not have permission to update activities."
    );
  }

  const activity = state.activities.find(
    (item) => item.id === id
  );

  if (!activity) return;

  if (!ACTIVITY_STATUSES.includes(nextStatus)) {
    throw new Error("Invalid activity status.");
  }

  const update = {
    status: nextStatus
  };

  if (nextStatus === "completed") {
    update.progress_percent = 100;
    update.completed_at = new Date().toISOString();
  } else if (activity.status === "completed") {
    update.completed_at = null;
  }

  const { error } = await supabase
    .from("group_activities")
    .update(update)
    .eq("id", id)
    .eq("group_id", state.groupId);

  if (error) throw error;

  await loadActivities();

  showStatus(
    `Activity marked ${statusLabel(nextStatus)}.`
  );
}

/* =========================================================
   REFRESH
   ========================================================= */

async function refreshAll() {
  clearMessages();

  showStatus("Refreshing Plans & Activities…");

  try {
    await Promise.all([
      loadPlans(),
      loadActivities()
    ]);

    showStatus("Plans & Activities refreshed.");
  } catch (error) {
    console.error(
      "Refresh Plans & Activities failed:",
      error
    );

    showError(normalizeError(error));
  }
}

/* =========================================================
   EVENT BINDING
   ========================================================= */

function bindEvents() {
  $("planForm")?.addEventListener(
    "submit",
    (event) => {
      createPlan(event).catch((error) => {
        console.error(
          "Plan submission handler failed:",
          error
        );

        showStatus("");
        showError(normalizeError(error));
      });
    }
  );

  $("activityForm")?.addEventListener(
    "submit",
    (event) => {
      createActivity(event).catch((error) => {
        console.error(
          "Activity submission handler failed:",
          error
        );

        showStatus("");
        showError(normalizeError(error));
      });
    }
  );

  $("resetPlan")?.addEventListener(
    "click",
    resetPlanForm
  );

  $("resetActivity")?.addEventListener(
    "click",
    resetActivityForm
  );

  $("planFilterStatus")?.addEventListener(
    "change",
    renderPlans
  );

  $("planSearch")?.addEventListener(
    "input",
    renderPlans
  );

  $("activityFilterStatus")?.addEventListener(
    "change",
    renderActivities
  );

  $("activityFilterAssignee")?.addEventListener(
    "change",
    renderActivities
  );

  $("activitySearch")?.addEventListener(
    "input",
    renderActivities
  );

  $("refreshPlans")?.addEventListener(
    "click",
    async () => {
      clearMessages();

      try {
        await loadPlans();
        showStatus("Plans refreshed.");
      } catch (error) {
        console.error(error);
        showError(normalizeError(error));
      }
    }
  );

  $("refreshActivities")?.addEventListener(
    "click",
    async () => {
      clearMessages();

      try {
        await loadActivities();
        showStatus("Activities refreshed.");
      } catch (error) {
        console.error(error);
        showError(normalizeError(error));
      }
    }
  );

  $("refreshAll")?.addEventListener(
    "click",
    refreshAll
  );

  $("plansBody")?.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest(
        "[data-plan-action]"
      );

      if (!button) return;

      button.disabled = true;

      updatePlanStatus(
        button.dataset.id,
        button.dataset.planAction
      )
        .catch((error) => {
          console.error(error);
          showError(normalizeError(error));
        })
        .finally(() => {
          button.disabled = false;
        });
    }
  );

  $("activitiesBody")?.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest(
        "[data-activity-action]"
      );

      if (!button) return;

      button.disabled = true;

      updateActivityStatus(
        button.dataset.id,
        button.dataset.activityAction
      )
        .catch((error) => {
          console.error(error);
          showError(normalizeError(error));
        })
        .finally(() => {
          button.disabled = false;
        });
    }
  );
}

/* =========================================================
   PAGE INITIALIZER
   admin-layout.js owns page boot.
   ========================================================= */

async function initPage() {
  if (state.initialized) return;

  state.initialized = true;

  console.info(
    "CHAMA LIVE: plans-activities.js loaded"
  );

  bindEvents();

  try {
    await loadContext();
    await loadMembers();

    const results = await Promise.allSettled([
      loadPlans(),
      loadActivities()
    ]);

    const failed = results.find(
      (result) => result.status === "rejected"
    );

    if (failed) {
      throw failed.reason;
    }

    console.info(
      "CHAMA LIVE: Plans & Activities ready",
      {
        groupId: state.groupId,
        groupName: state.groupName,
        memberId: state.currentMember?.id,
        role: state.currentMember?.role,
        canManage: canManage()
      }
    );
  } catch (error) {
    console.error(
      "CHAMA LIVE: Plans & Activities boot failed",
      error
    );

    showError(normalizeError(error));

    // Allow a later attempt if initialization failed.
    state.initialized = false;
  }
}

/* =========================================================
   EXPORT
   ========================================================= */

export { initPage };
