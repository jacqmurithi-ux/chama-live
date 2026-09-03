import { supabase } from "./supabase.js";
import { requireAuth, getMyMember } from "./auth.js";


/* =========================================================
   CHAMA LIVE
   PLANS & ACTIVITIES
   ---------------------------------------------------------
   Operational module only.

   IMPORTANT:
   - Does not modify accounting tables.
   - Does not call 2B functions.
   - Does not modify contributions.
   - Does not modify expenses.
   - Does not modify cl_2b_refresh_member().
   - Uses the authenticated member's group_id as context.
   - Database RLS and validators remain authoritative.
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
  "chairperson",
  "secretary"
];


const state = {

  currentMember: null,

  groupId: null,

  groupName: "",

  members: [],

  plans: [],

  activities: []

};


/* =========================================================
   DOM
   ========================================================= */

const $ = (id) => document.getElementById(id);


/* =========================================================
   MESSAGE HANDLING
   ========================================================= */

function showStatus(message) {

  const element = $("status");

  if (!element) return;

  element.textContent = message || "";

  element.classList.toggle(
    "hidden",
    !message
  );

}


function showError(message) {

  const element = $("error");

  if (!element) return;

  element.textContent = message || "";

  element.classList.toggle(
    "hidden",
    !message
  );

}


function clearMessages() {

  showStatus("");

  showError("");

}


/* =========================================================
   ERROR NORMALIZATION
   ========================================================= */

function normalizeError(error) {

  if (!error) {
    return "Unexpected error.";
  }


  if (error.code === "42501") {

    return "You do not have permission to perform this action.";

  }


  if (error.code === "23514") {

    return (
      error.message ||
      "The value does not satisfy a database rule."
    );

  }


  if (error.code === "23503") {

    return (
      "The selected related record is invalid for this group."
    );

  }


  if (error.code === "23505") {

    return (
      "This record already exists."
    );

  }


  return (
    error.message ||
    "The operation could not be completed."
  );

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

  if (!value) {
    return "—";
  }


  const date = new Date(
    `${value}T00:00:00`
  );


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

  if (!value) {
    return "—";
  }


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
    Math.min(
      100,
      Number(value) || 0
    )
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
   DATE VALIDATION
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


/* =========================================================
   CONTEXT
   ========================================================= */

async function loadContext() {

  await requireAuth();


  const member = await getMyMember();


  if (
    !member?.id ||
    !member?.group_id
  ) {

    throw new Error(
      "Your authenticated member/group context could not be resolved."
    );

  }


  state.currentMember = member;

  state.groupId = member.group_id;


  const { data: group, error } = await supabase

    .from("groups")

    .select("id,name")

    .eq(
      "id",
      state.groupId
    )

    .maybeSingle();


  if (error) {
    throw error;
  }


  if (!group) {

    throw new Error(
      "The current group could not be loaded."
    );

  }


  state.groupName =
    group.name || "";


  $("groupName").textContent =
    state.groupName ||
    "Current group";


  console.log(
    "CHAMA LIVE: Plans & Activities context",
    {
      groupId: state.groupId,
      groupName: state.groupName,
      memberId: state.currentMember.id,
      role: state.currentMember.role
    }
  );

}


/* =========================================================
   MANAGEMENT ACCESS
   ========================================================= */

function canManage() {

  const role =
    String(
      state.currentMember?.role ||
      ""
    ).toLowerCase();


  return MANAGEMENT_ROLES.includes(role);

}


/* =========================================================
   MEMBERS
   ========================================================= */

async function loadMembers() {

  const { data, error } = await supabase

    .from("members")

    .select(
      "id,name,member_number,status"
    )

    .eq(
      "group_id",
      state.groupId
    )

    .order(
      "name",
      {
        ascending: true
      }
    );


  if (error) {
    throw error;
  }


  state.members = data || [];


  const activeMembers =
    state.members.filter(
      (member) =>
        member.status === "active"
    );


  $("activityAssignee").innerHTML =
    `
      <option value="">
        Unassigned
      </option>
    ` +

    activeMembers
      .map(
        (member) => `
          <option value="${escapeHtml(member.id)}">
            ${escapeHtml(member.name)}
            ${
              member.member_number
                ? ` (${escapeHtml(member.member_number)})`
                : ""
            }
          </option>
        `
      )
      .join("");


  $("activityFilterAssignee").innerHTML =
    `
      <option value="">
        All assignees
      </option>
    ` +

    activeMembers
      .map(
        (member) => `
          <option value="${escapeHtml(member.id)}">
            ${escapeHtml(member.name)}
          </option>
        `
      )
      .join("");

}


/* =========================================================
   PLANS
   ========================================================= */

async function loadPlans() {

  const { data, error } = await supabase

    .from("group_plans")

    .select(
      `
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
      `
    )

    .eq(
      "group_id",
      state.groupId
    )

    .order(
      "target_date",
      {
        ascending: true,
        nullsFirst: false
      }
    )

    .order(
      "created_at",
      {
        ascending: false
      }
    );


  if (error) {
    throw error;
  }


  state.plans = data || [];


  populatePlanSelect();

  renderPlans();

  updateSummary();

}


/* =========================================================
   ACTIVITIES
   ========================================================= */

async function loadActivities() {

  const { data, error } = await supabase

    .from("group_activities")

    .select(
      `
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
      `
    )

    .eq(
      "group_id",
      state.groupId
    )

    .order(
      "due_date",
      {
        ascending: true,
        nullsFirst: false
      }
    )

    .order(
      "created_at",
      {
        ascending: false
      }
    );


  if (error) {
    throw error;
  }


  state.activities =
    data || [];


  renderActivities();

  updateSummary();

}


/* =========================================================
   SELECT POPULATION
   ========================================================= */

function populatePlanSelect() {

  const select =
    $("activityPlan");


  select.innerHTML =
    `
      <option value="">
        No linked plan
      </option>
    ` +

    state.plans

      .map(
        (plan) => `
          <option value="${escapeHtml(plan.id)}">
            ${escapeHtml(plan.title)}
          </option>
        `
      )

      .join("");

}


/* =========================================================
   LOOKUPS
   ========================================================= */

function getMemberName(id) {

  if (!id) {
    return "Unassigned";
  }


  const member =
    state.members.find(
      (item) =>
        item.id === id
    );


  return (
    member?.name ||
    "Unknown member"
  );

}


function getPlanTitle(id) {

  if (!id) {
    return "Unlinked";
  }


  const plan =
    state.plans.find(
      (item) =>
        item.id === id
    );


  return (
    plan?.title ||
    "Unlinked"
  );

}


/* =========================================================
   PLAN RENDERING
   ========================================================= */

function renderPlans() {

  const body =
    $("plansBody");


  const status =
    $("planFilterStatus").value;


  const search =
    $("planSearch")
      .value
      .trim()
      .toLowerCase();


  const rows =
    state.plans.filter(
      (plan) => {

        if (
          status &&
          plan.status !== status
        ) {

          return false;

        }


        if (!search) {
          return true;
        }


        return [

          plan.title,

          plan.description,

          plan.category,

          plan.status

        ]

          .some(
            (value) =>
              String(
                value || ""
              )
                .toLowerCase()
                .includes(search)
          );

      }
    );


  if (!rows.length) {

    body.innerHTML = `
      <tr>
        <td
          colspan="7"
          class="empty"
        >
          No plans found.
        </td>
      </tr>
    `;

    return;

  }


  body.innerHTML =
    rows

      .map(
        (plan) => `
          <tr>

            <td>

              <strong>
                ${escapeHtml(plan.title)}
              </strong>

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


            <td>
              ${escapeHtml(plan.category)}
            </td>


            <td>
              ${formatDate(plan.start_date)}
              →
              ${formatDate(plan.target_date)}
            </td>


            <td>
              ${badge(plan.status)}
            </td>


            <td>
              ${progress(plan.progress_percent)}
            </td>


            <td>
              ${formatDateTime(plan.created_at)}
            </td>


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
        `
      )

      .join("");

}


/* =========================================================
   ACTIVITY RENDERING
   ========================================================= */

function renderActivities() {

  const body =
    $("activitiesBody");


  const status =
    $("activityFilterStatus").value;


  const assignee =
    $("activityFilterAssignee").value;


  const search =
    $("activitySearch")
      .value
      .trim()
      .toLowerCase();


  const rows =
    state.activities.filter(
      (activity) => {

        if (
          status &&
          activity.status !== status
        ) {

          return false;

        }


        if (
          assignee &&
          activity.assigned_to !== assignee
        ) {

          return false;

        }


        if (!search) {
          return true;
        }


        return [

          activity.title,

          activity.description,

          activity.status,

          getPlanTitle(
            activity.plan_id
          ),

          getMemberName(
            activity.assigned_to
          )

        ]

          .some(
            (value) =>
              String(
                value || ""
              )
                .toLowerCase()
                .includes(search)
          );

      }
    );


  if (!rows.length) {

    body.innerHTML = `
      <tr>
        <td
          colspan="7"
          class="empty"
        >
          No activities found.
        </td>
      </tr>
    `;

    return;

  }


  body.innerHTML =
    rows

      .map(
        (activity) => `
          <tr>

            <td>

              <strong>
                ${escapeHtml(activity.title)}
              </strong>

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
              ${escapeHtml(
                getPlanTitle(
                  activity.plan_id
                )
              )}
            </td>


            <td>
              ${escapeHtml(
                getMemberName(
                  activity.assigned_to
                )
              )}
            </td>


            <td>
              ${formatDate(activity.start_date)}
              →
              ${formatDate(activity.due_date)}
            </td>


            <td>
              ${badge(activity.status)}
            </td>


            <td>
              ${progress(
                activity.progress_percent
              )}
            </td>


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
        `
      )

      .join("");

}


/* =========================================================
   SUMMARY
   ========================================================= */

function updateSummary() {

  $("totalPlans").textContent =
    state.plans.length;


  $("activePlans").textContent =
    state.plans.filter(
      (plan) =>
        plan.status === "active"
    ).length;


  $("openActivities").textContent =
    state.activities.filter(
      (activity) =>
        ![
          "completed",
          "cancelled"
        ].includes(
          activity.status
        )
    ).length;


  $("completedActivities").textContent =
    state.activities.filter(
      (activity) =>
        activity.status === "completed"
    ).length;

}


/* =========================================================
   FORM RESET
   ========================================================= */

function resetPlanForm() {

  $("planForm").reset();

  $("planStatus").value =
    "planned";

  $("planProgress").value =
    "0";

}


function resetActivityForm() {

  $("activityForm").reset();

  $("activityStatus").value =
    "not_started";

  $("activityProgress").value =
    "0";

}


/* =========================================================
   CREATE PLAN
   ========================================================= */

async function createPlan(event) {

  event.preventDefault();

  clearMessages();


  if (!canManage()) {

    throw new Error(
      "Only an authorized group management role can create plans."
    );

  }


  const title =
    $("planTitle")
      .value
      .trim();


  const description =
    $("planDescription")
      .value
      .trim() ||
    null;


  const category =
    $("planCategory")
      .value;


  const status =
    $("planStatus")
      .value;


  const startDate =
    $("planStart")
      .value ||
    null;


  const targetDate =
    $("planTarget")
      .value ||
    null;


  const progressPercent =
    Number(
      $("planProgress")
        .value
    );


  if (!title) {

    throw new Error(
      "Plan title is required."
    );

  }


  if (
    !PLAN_CATEGORIES.includes(
      category
    )
  ) {

    throw new Error(
      "Invalid plan category."
    );

  }


  if (
    !PLAN_STATUSES.includes(
      status
    )
  ) {

    throw new Error(
      "Invalid plan status."
    );

  }


  if (
    !Number.isInteger(
      progressPercent
    ) ||
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


  const button =
    $("savePlan");


  button.disabled = true;


  try {

    const { error } =
      await supabase

        .from("group_plans")

        .insert({

          group_id:
            state.groupId,

          title,

          description,

          category,

          start_date:
            startDate,

          target_date:
            targetDate,

          status,

          progress_percent:
            progressPercent,

          created_by:
            state.currentMember.id

        });


    if (error) {
      throw error;
    }


    resetPlanForm();


    await loadPlans();


    showStatus(
      "Plan created successfully."
    );

  }

  finally {

    button.disabled = false;

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
      "Only an authorized group management role can create activities."
    );

  }


  const title =
    $("activityTitle")
      .value
      .trim();


  const description =
    $("activityDescription")
      .value
      .trim() ||
    null;


  const planId =
    $("activityPlan")
      .value ||
    null;


  const assignedTo =
    $("activityAssignee")
      .value ||
    null;


  const status =
    $("activityStatus")
      .value;


  const startDate =
    $("activityStart")
      .value ||
    null;


  const dueDate =
    $("activityDue")
      .value ||
    null;


  const progressPercent =
    Number(
      $("activityProgress")
        .value
    );


  if (!title) {

    throw new Error(
      "Activity title is required."
    );

  }


  if (
    !ACTIVITY_STATUSES.includes(
      status
    )
  ) {

    throw new Error(
      "Invalid activity status."
    );

  }


  if (
    !Number.isInteger(
      progressPercent
    ) ||
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


  const button =
    $("saveActivity");


  button.disabled = true;


  try {

    const { error } =
      await supabase

        .from("group_activities")

        .insert({

          group_id:
            state.groupId,

          plan_id:
            planId,

          title,

          description,

          assigned_to:
            assignedTo,

          start_date:
            startDate,

          due_date:
            dueDate,

          status,

          progress_percent:
            progressPercent,

          completed_at:
            status === "completed"
              ? new Date().toISOString()
              : null,

          created_by:
            state.currentMember.id

        });


    if (error) {
      throw error;
    }


    resetActivityForm();


    await loadActivities();


    showStatus(
      "Activity created successfully."
    );

  }

  finally {

    button.disabled = false;

  }

}


/* =========================================================
   PLAN STATUS
   ========================================================= */

async function updatePlanStatus(
  id,
  nextStatus
) {

  if (!canManage()) {

    throw new Error(
      "You do not have permission to update plans."
    );

  }


  const plan =
    state.plans.find(
      (item) =>
        item.id === id
    );


  if (!plan) {
    return;
  }


  if (
    !PLAN_STATUSES.includes(
      nextStatus
    )
  ) {

    throw new Error(
      "Invalid plan status."
    );

  }


  const update = {

    status:
      nextStatus

  };


  if (
    nextStatus === "completed"
  ) {

    update.progress_percent =
      100;

  }


  const { error } =
    await supabase

      .from("group_plans")

      .update(update)

      .eq(
        "id",
        id
      )

      .eq(
        "group_id",
        state.groupId
      );


  if (error) {
    throw error;
  }


  await loadPlans();


  showStatus(
    `Plan marked ${statusLabel(nextStatus)}.`
  );

}


/* =========================================================
   ACTIVITY STATUS
   ========================================================= */

async function updateActivityStatus(
  id,
  nextStatus
) {

  if (!canManage()) {

    throw new Error(
      "You do not have permission to update activities."
    );

  }


  const activity =
    state.activities.find(
      (item) =>
        item.id === id
    );


  if (!activity) {
    return;
  }


  if (
    !ACTIVITY_STATUSES.includes(
      nextStatus
    )
  ) {

    throw new Error(
      "Invalid activity status."
    );

  }


  const update = {

    status:
      nextStatus

  };


  if (
    nextStatus === "completed"
  ) {

    update.progress_percent =
      100;

    update.completed_at =
      new Date().toISOString();

  }

  else if (
    activity.status === "completed"
  ) {

    update.completed_at =
      null;

  }


  const { error } =
    await supabase

      .from("group_activities")

      .update(update)

      .eq(
        "id",
        id
      )

      .eq(
        "group_id",
        state.groupId
      );


  if (error) {
    throw error;
  }


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

  showStatus(
    "Refreshing Plans & Activities…"
  );


  try {

    await Promise.all([
      loadPlans(),
      loadActivities()
    ]);


    showStatus(
      "Plans & Activities refreshed."
    );

  }

  catch (error) {

    showError(
      normalizeError(error)
    );

  }

}


/* =========================================================
   EVENT BINDING
   ========================================================= */

function bindEvents() {


  $("planForm")
    .addEventListener(
      "submit",
      (event) => {

        createPlan(event)
          .catch(
            (error) =>
              showError(
                normalizeError(error)
              )
          );

      }
    );


  $("activityForm")
    .addEventListener(
      "submit",
      (event) => {

        createActivity(event)
          .catch(
            (error) =>
              showError(
                normalizeError(error)
              )
          );

      }
    );


  $("resetPlan")
    .addEventListener(
      "click",
      resetPlanForm
    );


  $("resetActivity")
    .addEventListener(
      "click",
      resetActivityForm
    );


  $("planFilterStatus")
    .addEventListener(
      "change",
      renderPlans
    );


  $("planSearch")
    .addEventListener(
      "input",
      renderPlans
    );


  $("activityFilterStatus")
    .addEventListener(
      "change",
      renderActivities
    );


  $("activityFilterAssignee")
    .addEventListener(
      "change",
      renderActivities
    );


  $("activitySearch")
    .addEventListener(
      "input",
      renderActivities
    );


  $("refreshPlans")
    .addEventListener(
      "click",
      () => {

        loadPlans()

          .then(
            () =>
              showStatus(
                "Plans refreshed."
              )
          )

          .catch(
            (error) =>
              showError(
                normalizeError(error)
              )
          );

      }
    );


  $("refreshActivities")
    .addEventListener(
      "click",
      () => {

        loadActivities()

          .then(
            () =>
              showStatus(
                "Activities refreshed."
              )
          )

          .catch(
            (error) =>
              showError(
                normalizeError(error)
              )
          );

      }
    );


  $("plansBody")
    .addEventListener(
      "click",
      (event) => {

        const button =
          event.target.closest(
            "[data-plan-action]"
          );


        if (!button) {
          return;
        }


        const id =
          button.dataset.id;


        const nextStatus =
          button.dataset.planAction;


        button.disabled = true;


        updatePlanStatus(
          id,
          nextStatus
        )

          .catch(
            (error) =>
              showError(
                normalizeError(error)
              )
          )

          .finally(
            () => {
              button.disabled = false;
            }
          );

      }
    );


  $("activitiesBody")
    .addEventListener(
      "click",
      (event) => {

        const button =
          event.target.closest(
            "[data-activity-action]"
          );


        if (!button) {
          return;
        }


        const id =
          button.dataset.id;


        const nextStatus =
          button.dataset.activityAction;


        button.disabled = true;


        updateActivityStatus(
          id,
          nextStatus
        )

          .catch(
            (error) =>
              showError(
                normalizeError(error)
              )
          )

          .finally(
            () => {
              button.disabled = false;
            }
          );

      }
    );

}


/* =========================================================
   BOOT
   ========================================================= */

async function boot() {

  console.log(
    "CHAMA LIVE: plans-activities.js loaded"
  );


  bindEvents();


  try {

    await loadContext();

    await loadMembers();


    await Promise.all([
      loadPlans(),
      loadActivities()
    ]);


    console.log(
      "CHAMA LIVE: Plans & Activities ready",
      {
        groupId:
          state.groupId,

        groupName:
          state.groupName,

        memberId:
          state.currentMember?.id,

        role:
          state.currentMember?.role,

        canManage:
          canManage()
      }
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: Plans & Activities boot failed",
      error
    );


    showError(
      normalizeError(error)
    );

  }

}


boot();


export {
  boot
};
