/* =========================================================
   CHAMA LIVE — MEMBER ACTIVITIES
   ---------------------------------------------------------
   MEMBER PORTAL

   PURPOSE
   ---------------------------------------------------------
   • Show group activities available to the authenticated
     member.
   • Show linked group plans.
   • Show assigned member where available.
   • Show activity status and progress.
   • Provide client-side search and status filtering.
   • Provide desktop and mobile-friendly presentation.

   SECURITY CONTRACT
   ---------------------------------------------------------
   • Member identity comes from the authenticated session.
   • Member/group context is resolved through getMyMember().
   • group_id is never accepted from the URL or form.
   • This page is SELECT-only.
   • No activity, plan or member record is mutated.
   • Members cannot create, edit, delete, reassign or
     change activity progress from this page.

   DATABASE
   ---------------------------------------------------------
   NO NEW RPC
   NO NEW TABLE
   NO SCHEMA CHANGE
========================================================= */

import {
  supabase
} from "./supabase.js";

import {
  requireAuth,
  getMyMember
} from "./auth.js";


console.log(
  "CHAMA LIVE: member-activities.js loaded"
);


/* =========================================================
   STATE
========================================================= */

const state = {
  currentMember: null,
  groupId: null,
  groupName: "",
  plans: [],
  activities: [],
  members: []
};


let initialized = false;


/* =========================================================
   CONSTANTS
========================================================= */

const ACTIVITY_STATUSES = [
  "not_started",
  "planned",
  "in_progress",
  "completed",
  "delayed",
  "cancelled"
];


const STATUS_LABELS = {
  not_started: "Not started",
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  delayed: "Delayed",
  cancelled: "Cancelled"
};


/* =========================================================
   ELEMENT HELPER
========================================================= */

function el(id) {

  return document.getElementById(id);

}


/* =========================================================
   SECURITY / DISPLAY HELPERS
========================================================= */

function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

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

    return String(value);

  }


  return date.toLocaleDateString(
    undefined,
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


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return String(value);

  }


  return date.toLocaleString(
    undefined,
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  );

}


function statusLabel(status) {

  return (
    STATUS_LABELS[status] ||
    String(
      status ||
      "Unknown"
    )
  );

}


function statusClass(status) {

  return (
    `status-${String(
      status ||
      "unknown"
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9_-]/g,
        "-"
      )}`
  );

}


function getMemberName(memberId) {

  if (!memberId) {
    return "Unassigned";
  }


  const member =
    state.members.find(
      item =>
        String(item.id) ===
        String(memberId)
    );


  if (!member) {
    return "Unassigned";
  }


  return (
    member.name ||
    member.member_number ||
    "Member"
  );

}


function getPlanTitle(planId) {

  if (!planId) {
    return "No linked plan";
  }


  const plan =
    state.plans.find(
      item =>
        String(item.id) ===
        String(planId)
    );


  return (
    plan?.title ||
    "Linked plan"
  );

}


function clampProgress(value) {

  const numberValue =
    Number(value);


  if (
    !Number.isFinite(
      numberValue
    )
  ) {

    return 0;

  }


  return Math.min(
    100,
    Math.max(
      0,
      numberValue
    )
  );

}


/* =========================================================
   PAGE STATE
========================================================= */

function showLoading() {

  el(
    "memberActivitiesLoading"
  )?.removeAttribute(
    "hidden"
  );


  el(
    "memberActivitiesError"
  )?.setAttribute(
    "hidden",
    ""
  );


  el(
    "memberActivitiesContent"
  )?.setAttribute(
    "hidden",
    ""
  );

}


function showContent() {

  el(
    "memberActivitiesLoading"
  )?.setAttribute(
    "hidden",
    ""
  );


  el(
    "memberActivitiesError"
  )?.setAttribute(
    "hidden",
    ""
  );


  el(
    "memberActivitiesContent"
  )?.removeAttribute(
    "hidden"
  );

}


function showError(message) {

  el(
    "memberActivitiesLoading"
  )?.setAttribute(
    "hidden",
    ""
  );


  el(
    "memberActivitiesContent"
  )?.setAttribute(
    "hidden",
    ""
  );


  const error =
    el(
      "memberActivitiesError"
    );


  if (error) {

    error.textContent =
      message ||
      "Unable to load group activities.";

    error.removeAttribute(
      "hidden"
    );

  }

}


function setSubtitle() {

  const subtitle =
    el(
      "memberActivitiesSubtitle"
    );


  if (!subtitle) {
    return;
  }


  subtitle.textContent =
    state.groupName
      ? `${state.groupName} — group activities and progress`
      : "Group activities and progress";

}


/* =========================================================
   AUTHENTICATED GROUP CONTEXT
========================================================= */

async function loadContext() {

  const user =
    await requireAuth();


  if (!user) {

    throw new Error(
      "Authentication required."
    );

  }


  const member =
    await getMyMember();


  if (!member) {

    throw new Error(
      "Your member record could not be found."
    );

  }


  if (!member.group_id) {

    throw new Error(
      "Your member account is not linked to a group."
    );

  }


  state.currentMember =
    member;


  state.groupId =
    member.group_id;


  const {
    data: group,
    error
  } =
    await supabase
      .from("groups")
      .select(
        "id, name"
      )
      .eq(
        "id",
        state.groupId
      )
      .maybeSingle();


  if (error) {

    throw error;

  }


  state.groupName =
    group?.name ||
    "Group";

}


/* =========================================================
   MEMBERS
========================================================= */

async function loadMembers() {

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(
        `
          id,
          name,
          member_number,
          status
        `
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


  state.members =
    data || [];

}


/* =========================================================
   GROUP PLANS
========================================================= */

async function loadPlans() {

  const {
    data,
    error
  } =
    await supabase
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


  state.plans =
    data || [];

}


/* =========================================================
   GROUP ACTIVITIES
========================================================= */

async function loadActivities() {

  const {
    data,
    error
  } =
    await supabase
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

}


/* =========================================================
   FILTERING
========================================================= */

function getFilteredActivities() {

  const search =
    String(
      el(
        "memberActivitySearch"
      )?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  const status =
    String(
      el(
        "memberActivityStatus"
      )?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  return state.activities.filter(
    activity => {

      const matchesStatus =
        !status ||
        String(
          activity.status ||
          ""
        ).toLowerCase() ===
        status;


      if (!matchesStatus) {

        return false;

      }


      if (!search) {

        return true;

      }


      const searchable = [
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
        .filter(Boolean)
        .join(" ")
        .toLowerCase();


      return searchable.includes(
        search
      );

    }
  );

}


/* =========================================================
   EMPTY STATE
========================================================= */

function renderEmpty(
  container,
  message
) {

  if (!container) {
    return;
  }


  container.innerHTML = `
    <div class="empty-state">
      <strong>No activities found</strong>
      <p>
        ${escapeHtml(message)}
      </p>
    </div>
  `;

}


/* =========================================================
   DESKTOP RENDER
========================================================= */

function renderDesktop(
  activities
) {

  const container =
    el(
      "memberActivitiesRows"
    );


  if (!container) {
    return;
  }


  if (!activities.length) {

    container.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <strong>
              No activities found
            </strong>

            <p>
              There are no activities
              matching your current filter.
            </p>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  container.innerHTML =
    activities
      .map(
        activity => {

          const progress =
            clampProgress(
              activity.progress_percent
            );


          const status =
            activity.status ||
            "not_started";


          return `
            <tr>

              <td>

                <div class="activity-title">

                  <strong>
                    ${escapeHtml(
                      activity.title ||
                      "Untitled activity"
                    )}
                  </strong>

                  ${
                    activity.description
                      ? `
                        <small>
                          ${escapeHtml(
                            activity.description
                          )}
                        </small>
                      `
                      : ""
                  }

                </div>

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
                ${escapeHtml(
                  formatDate(
                    activity.start_date
                  )
                )}
              </td>


              <td>
                ${escapeHtml(
                  formatDate(
                    activity.due_date
                  )
                )}
              </td>


              <td>

                <span
                  class="
                    activity-status
                    ${escapeHtml(
                      statusClass(status)
                    )}
                  "
                >
                  ${escapeHtml(
                    statusLabel(status)
                  )}
                </span>

              </td>


              <td>

                <div class="progress-cell">

                  <div
                    class="progress-track"
                    aria-label="${progress}% complete"
                  >
                    <span
                      style="width:${progress}%"
                    ></span>
                  </div>

                  <strong>
                    ${progress}%
                  </strong>

                </div>

              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   MOBILE RENDER
========================================================= */

function renderMobile(
  activities
) {

  const container =
    el(
      "memberActivitiesMobileList"
    );


  if (!container) {
    return;
  }


  if (!activities.length) {

    renderEmpty(
      container,
      "There are no activities matching your current filter."
    );

    return;

  }


  container.innerHTML =
    activities
      .map(
        activity => {

          const progress =
            clampProgress(
              activity.progress_percent
            );


          const status =
            activity.status ||
            "not_started";


          return `
            <article class="activity-card">

              <div
                class="activity-card-header"
              >

                <div>

                  <h3>
                    ${escapeHtml(
                      activity.title ||
                      "Untitled activity"
                    )}
                  </h3>

                  ${
                    activity.description
                      ? `
                        <p>
                          ${escapeHtml(
                            activity.description
                          )}
                        </p>
                      `
                      : ""
                  }

                </div>


                <span
                  class="
                    activity-status
                    ${escapeHtml(
                      statusClass(status)
                    )}
                  "
                >
                  ${escapeHtml(
                    statusLabel(status)
                  )}
                </span>

              </div>


              <div class="activity-details">

                <div>

                  <span>
                    Plan
                  </span>

                  <strong>
                    ${escapeHtml(
                      getPlanTitle(
                        activity.plan_id
                      )
                    )}
                  </strong>

                </div>


                <div>

                  <span>
                    Assigned to
                  </span>

                  <strong>
                    ${escapeHtml(
                      getMemberName(
                        activity.assigned_to
                      )
                    )}
                  </strong>

                </div>


                <div>

                  <span>
                    Start date
                  </span>

                  <strong>
                    ${escapeHtml(
                      formatDate(
                        activity.start_date
                      )
                    )}
                  </strong>

                </div>


                <div>

                  <span>
                    Due date
                  </span>

                  <strong>
                    ${escapeHtml(
                      formatDate(
                        activity.due_date
                      )
                    )}
                  </strong>

                </div>


                ${
                  activity.completed_at
                    ? `
                      <div>

                        <span>
                          Completed
                        </span>

                        <strong>
                          ${escapeHtml(
                            formatDateTime(
                              activity.completed_at
                            )
                          )}
                        </strong>

                      </div>
                    `
                    : ""
                }

              </div>


              <div class="activity-progress">

                <div class="progress-heading">

                  <span>
                    Progress
                  </span>

                  <strong>
                    ${progress}%
                  </strong>

                </div>


                <div
                  class="progress-track"
                  aria-label="${progress}% complete"
                >
                  <span
                    style="width:${progress}%"
                  ></span>
                </div>

              </div>

            </article>
          `;

        }
      )
      .join("");

}


/* =========================================================
   RENDER
========================================================= */

function renderActivities() {

  const activities =
    getFilteredActivities();


  renderDesktop(
    activities
  );


  renderMobile(
    activities
  );

}


/* =========================================================
   FILTER EVENTS
========================================================= */

function bindFilters() {

  const search =
    el(
      "memberActivitySearch"
    );


  const status =
    el(
      "memberActivityStatus"
    );


  if (
    search &&
    !search.dataset
      .memberActivitiesBound
  ) {

    search.dataset
      .memberActivitiesBound =
      "true";


    search.addEventListener(
      "input",
      renderActivities
    );

  }


  if (
    status &&
    !status.dataset
      .memberActivitiesBound
  ) {

    status.dataset
      .memberActivitiesBound =
      "true";


    status.addEventListener(
      "change",
      renderActivities
    );

  }

}


/* =========================================================
   STATUS FILTER
========================================================= */

function populateStatusFilter() {

  const select =
    el(
      "memberActivityStatus"
    );


  if (!select) {
    return;
  }


  select.innerHTML = `
    <option value="">
      All statuses
    </option>

    ${ACTIVITY_STATUSES
      .map(
        status => `
          <option
            value="${escapeHtml(status)}"
          >
            ${escapeHtml(
              statusLabel(status)
            )}
          </option>
        `
      )
      .join("")}
  `;

}


/* =========================================================
   INITIALIZE
========================================================= */

async function initMemberActivities() {

  if (initialized) {
    return;
  }


  initialized =
    true;


  try {

    showLoading();


    await loadContext();


    setSubtitle();


    await Promise.all([
      loadMembers(),
      loadPlans(),
      loadActivities()
    ]);


    populateStatusFilter();


    bindFilters();


    renderActivities();


    showContent();


    console.log(
      "CHAMA LIVE: Member Activities ready.",
      {
        groupId:
          state.groupId,

        memberId:
          state.currentMember?.id,

        activities:
          state.activities.length,

        plans:
          state.plans.length
      }
    );

  }
  catch (error) {

    initialized =
      false;


    console.error(
      "CHAMA LIVE Member Activities:",
      error
    );


    showError(
      error?.message ||
      "Unable to load group activities. Please try again."
    );

  }

}


/* =========================================================
   PUBLIC EXPORT
========================================================= */

export {
  initMemberActivities
};


/* =========================================================
   DIRECT PAGE COMPATIBILITY
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      if (
        !window.__CHAMA_LIVE_LAYOUT_LOADING__
      ) {

        initMemberActivities();

      }

    },
    {
      once: true
    }
  );

}
else {

  if (
    !window.__CHAMA_LIVE_LAYOUT_LOADING__
  ) {

    initMemberActivities();

  }

}


console.log(
  "CHAMA LIVE: member-activities.js ready"
);
