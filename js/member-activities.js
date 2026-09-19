import { supabase } from "./supabase.js";
import { requireAuth, getMyMember } from "./auth.js";

const state = {
  currentMember: null,
  groupId: null,
  groupName: "",
  plans: [],
  activities: [],
  members: []
};

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

function el(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusLabel(status) {
  return STATUS_LABELS[status] || String(status || "Unknown");
}

function statusClass(status) {
  return `status-${String(status || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")}`;
}

function getMemberName(memberId) {
  if (!memberId) return "Unassigned";

  const member = state.members.find(
    item => String(item.id) === String(memberId)
  );

  if (!member) return "Unassigned";

  return member.name || member.member_number || "Member";
}

function getPlanTitle(planId) {
  if (!planId) return "No linked plan";

  const plan = state.plans.find(
    item => String(item.id) === String(planId)
  );

  return plan?.title || "Linked plan";
}

function clampProgress(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return 0;

  return Math.min(100, Math.max(0, number));
}

function showLoading() {
  el("memberActivitiesLoading")?.removeAttribute("hidden");
  el("memberActivitiesError")?.setAttribute("hidden", "");
  el("memberActivitiesContent")?.setAttribute("hidden", "");
}

function showContent() {
  el("memberActivitiesLoading")?.setAttribute("hidden", "");
  el("memberActivitiesError")?.setAttribute("hidden", "");
  el("memberActivitiesContent")?.removeAttribute("hidden");
}

function showError(message) {
  el("memberActivitiesLoading")?.setAttribute("hidden", "");
  el("memberActivitiesContent")?.setAttribute("hidden", "");

  const error = el("memberActivitiesError");

  if (error) {
    error.textContent = message;
    error.removeAttribute("hidden");
  }
}

function setSubtitle() {
  const subtitle = el("memberActivitiesSubtitle");

  if (!subtitle) return;

  subtitle.textContent = state.groupName
    ? `${state.groupName} — group activities and progress`
    : "Group activities and progress";
}

async function loadContext() {
  const user = await requireAuth();

  if (!user) {
    throw new Error("Authentication required.");
  }

  const member = await getMyMember();

  if (!member) {
    throw new Error("Your member record could not be found.");
  }

  if (!member.group_id) {
    throw new Error("Your member account is not linked to a group.");
  }

  state.currentMember = member;
  state.groupId = member.group_id;

  const { data: group, error } = await supabase
    .from("groups")
    .select("id, name")
    .eq("id", state.groupId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  state.groupName = group?.name || "Group";
}

async function loadMembers() {
  const { data, error } = await supabase
    .from("members")
    .select("id, name, member_number, status")
    .eq("group_id", state.groupId)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  state.members = data || [];
}

async function loadPlans() {
  const { data, error } = await supabase
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

  if (error) {
    throw error;
  }

  state.plans = data || [];
}

async function loadActivities() {
  const { data, error } = await supabase
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

  if (error) {
    throw error;
  }

  state.activities = data || [];
}

function getFilteredActivities() {
  const search = String(el("memberActivitySearch")?.value || "")
    .trim()
    .toLowerCase();

  const status = String(el("memberActivityStatus")?.value || "")
    .trim()
    .toLowerCase();

  return state.activities.filter(activity => {
    const matchesStatus =
      !status || String(activity.status || "").toLowerCase() === status;

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
      getPlanTitle(activity.plan_id),
      getMemberName(activity.assigned_to)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(search);
  });
}

function renderEmpty(container, message) {
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      <strong>No activities found</strong>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderDesktop(activities) {
  const container = el("memberActivitiesRows");

  if (!container) return;

  if (!activities.length) {
    container.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <strong>No activities found</strong>
            <p>There are no activities matching your current filter.</p>
          </div>
        </td>
      </tr>
    `;

    return;
  }

  container.innerHTML = activities
    .map(activity => {
      const progress = clampProgress(activity.progress_percent);
      const status = activity.status || "not_started";

      return `
        <tr>
          <td>
            <div class="activity-title">
              <strong>${escapeHtml(activity.title || "Untitled activity")}</strong>
              ${
                activity.description
                  ? `<small>${escapeHtml(activity.description)}</small>`
                  : ""
              }
            </div>
          </td>

          <td>
            ${escapeHtml(getPlanTitle(activity.plan_id))}
          </td>

          <td>
            ${escapeHtml(getMemberName(activity.assigned_to))}
          </td>

          <td>
            ${escapeHtml(formatDate(activity.start_date))}
          </td>

          <td>
            ${escapeHtml(formatDate(activity.due_date))}
          </td>

          <td>
            <span class="activity-status ${escapeHtml(statusClass(status))}">
              ${escapeHtml(statusLabel(status))}
            </span>
          </td>

          <td>
            <div class="progress-cell">
              <div class="progress-track" aria-label="${progress}% complete">
                <span style="width:${progress}%"></span>
              </div>
              <strong>${progress}%</strong>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderMobile(activities) {
  const container = el("memberActivitiesMobileList");

  if (!container) return;

  if (!activities.length) {
    renderEmpty(
      container,
      "There are no activities matching your current filter."
    );
    return;
  }

  container.innerHTML = activities
    .map(activity => {
      const progress = clampProgress(activity.progress_percent);
      const status = activity.status || "not_started";

      return `
        <article class="activity-card">
          <div class="activity-card-header">
            <div>
              <h3>${escapeHtml(activity.title || "Untitled activity")}</h3>
              ${
                activity.description
                  ? `<p>${escapeHtml(activity.description)}</p>`
                  : ""
              }
            </div>

            <span class="activity-status ${escapeHtml(statusClass(status))}">
              ${escapeHtml(statusLabel(status))}
            </span>
          </div>

          <div class="activity-details">
            <div>
              <span>Plan</span>
              <strong>${escapeHtml(getPlanTitle(activity.plan_id))}</strong>
            </div>

            <div>
              <span>Assigned to</span>
              <strong>${escapeHtml(getMemberName(activity.assigned_to))}</strong>
            </div>

            <div>
              <span>Start date</span>
              <strong>${escapeHtml(formatDate(activity.start_date))}</strong>
            </div>

            <div>
              <span>Due date</span>
              <strong>${escapeHtml(formatDate(activity.due_date))}</strong>
            </div>

            ${
              activity.completed_at
                ? `
                  <div>
                    <span>Completed</span>
                    <strong>${escapeHtml(
                      formatDateTime(activity.completed_at)
                    )}</strong>
                  </div>
                `
                : ""
            }
          </div>

          <div class="activity-progress">
            <div class="progress-heading">
              <span>Progress</span>
              <strong>${progress}%</strong>
            </div>

            <div class="progress-track" aria-label="${progress}% complete">
              <span style="width:${progress}%"></span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderActivities() {
  const activities = getFilteredActivities();

  renderDesktop(activities);
  renderMobile(activities);
}

function bindFilters() {
  const search = el("memberActivitySearch");
  const status = el("memberActivityStatus");

  search?.addEventListener("input", renderActivities);
  status?.addEventListener("change", renderActivities);
}

function populateStatusFilter() {
  const select = el("memberActivityStatus");

  if (!select) return;

  select.innerHTML = `
    <option value="">All statuses</option>
    ${ACTIVITY_STATUSES.map(status => `
      <option value="${escapeHtml(status)}">
        ${escapeHtml(statusLabel(status))}
      </option>
    `).join("")}
  `;
}

function injectStyles() {
  if (document.getElementById("memberActivitiesStyles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "memberActivitiesStyles";

  style.textContent = `
    .activity-title {
      display: grid;
      gap: 4px;
    }

    .activity-title small {
      color: #667085;
      line-height: 1.4;
    }

    .activity-status {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 5px 9px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      background: #eef2f6;
      color: #344054;
    }

    .status-not_started {
      background: #f2f4f7;
      color: #475467;
    }

    .status-planned {
      background: #eef4ff;
      color: #3538cd;
    }

    .status-in_progress {
      background: #fff7e6;
      color: #b54708;
    }

    .status-completed {
      background: #ecfdf3;
      color: #027a48;
    }

    .status-delayed {
      background: #fff1f3;
      color: #c01048;
    }

    .status-cancelled {
      background: #f2f4f7;
      color: #667085;
    }

    .progress-cell {
      min-width: 100px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .progress-track {
      width: 100%;
      height: 7px;
      overflow: hidden;
      border-radius: 999px;
      background: #eaecf0;
    }

    .progress-track span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: currentColor;
    }

    .activity-card {
      display: grid;
      gap: 16px;
      padding: 16px;
      border: 1px solid #eaecf0;
      border-radius: 14px;
      background: #fff;
    }

    .activity-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .activity-card h3 {
      margin: 0;
      font-size: 16px;
    }

    .activity-card p {
      margin: 6px 0 0;
      color: #667085;
      line-height: 1.5;
    }

    .activity-details {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .activity-details > div {
      display: grid;
      gap: 4px;
    }

    .activity-details span,
    .progress-heading span {
      font-size: 12px;
      color: #667085;
    }

    .activity-details strong {
      font-size: 14px;
      color: #101828;
    }

    .activity-progress {
      display: grid;
      gap: 7px;
    }

    .progress-heading {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }

    .empty-state {
      padding: 24px;
      text-align: center;
      color: #667085;
    }

    .empty-state strong {
      display: block;
      margin-bottom: 5px;
      color: #101828;
    }

    .empty-state p {
      margin: 0;
    }

    @media (max-width: 760px) {
      .activity-details {
        grid-template-columns: 1fr;
      }

      .activity-card-header {
        flex-direction: column;
      }
    }
  `;

  document.head.appendChild(style);
}

async function initMemberActivities() {
  try {
    showLoading();
    injectStyles();

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
  } catch (error) {
    console.error("Member Activities failed to load:", error);

    showError(
      error?.message ||
      "Unable to load group activities. Please try again."
    );
  }
}

export {
  initMemberActivities
};
