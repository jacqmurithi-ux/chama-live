/* =========================================================
   CHAMA LIVE — MEMBER MILESTONES
   ---------------------------------------------------------
   MEMBER PORTAL

   PURPOSE
   ---------------------------------------------------------
   Read-only view of the authenticated member's
   group milestones.

   LIVE TABLE
   ---------------------------------------------------------
   public.group_milestones

   RELATED TABLE
   ---------------------------------------------------------
   public.group_plans

   READ FIELDS — group_milestones
   ---------------------------------------------------------
   id
   group_id
   plan_id
   title
   description
   milestone_date
   category
   amount

   SECURITY
   ---------------------------------------------------------
   • Member/group context comes from auth.js.
   • group_id is never accepted from the URL or form.
   • Database/RLS remains authoritative.
   • This module performs SELECT operations only.

   NO INSERT
   NO UPDATE
   NO DELETE
   NO RPC
   NO SCHEMA CHANGE
========================================================= */

import { supabase } from "./supabase.js";

import {
  getMyMember
} from "./auth.js";


/* =========================================================
   STATE
========================================================= */

const state = {
  currentMember: null,
  groupId: null,
  groupName: "",
  milestones: [],
  plans: [],
  initialized: false
};


/* =========================================================
   ELEMENTS
========================================================= */

const els = {
  loading:
    document.getElementById(
      "memberMilestonesLoading"
    ),

  error:
    document.getElementById(
      "memberMilestonesError"
    ),

  content:
    document.getElementById(
      "memberMilestonesContent"
    ),

  groupName:
    document.getElementById(
      "memberMilestonesGroupName"
    ),

  total:
    document.getElementById(
      "memberMilestoneTotal"
    ),

  upcoming:
    document.getElementById(
      "memberMilestoneUpcoming"
    ),

  linked:
    document.getElementById(
      "memberMilestoneLinked"
    ),

  search:
    document.getElementById(
      "memberMilestoneSearch"
    ),

  category:
    document.getElementById(
      "memberMilestoneCategory"
    ),

  rows:
    document.getElementById(
      "memberMilestonesRows"
    ),

  mobileList:
    document.getElementById(
      "memberMilestonesMobileList"
    )
};


/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function normalize(value) {
  return String(
    value ?? ""
  )
    .trim()
    .toLowerCase();
}


function money(value) {
  const amount =
    Number(value);

  if (
    !Number.isFinite(amount)
  ) {
    return "—";
  }

  return (
    "KSh " +
    amount.toLocaleString(
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

  const raw =
    String(value);

  const date =
    new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? `${raw}T00:00:00`
        : raw
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return raw;
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


function getPlanTitle(planId) {
  if (!planId) {
    return "—";
  }

  const plan =
    state.plans.find(
      item =>
        item.id === planId
    );

  return (
    plan?.title ||
    "Linked Plan"
  );
}


function isUpcoming(value) {
  if (!value) {
    return false;
  }

  const milestoneDate =
    new Date(
      `${String(value)}T23:59:59`
    );

  if (
    Number.isNaN(
      milestoneDate.getTime()
    )
  ) {
    return false;
  }

  return (
    milestoneDate.getTime() >=
    Date.now()
  );
}


/* =========================================================
   UI STATE
========================================================= */

function showLoading() {
  if (els.loading) {
    els.loading.hidden = false;
  }

  if (els.error) {
    els.error.hidden = true;
  }

  if (els.content) {
    els.content.hidden = true;
  }
}


function showError(message) {
  if (els.loading) {
    els.loading.hidden = true;
  }

  if (els.content) {
    els.content.hidden = true;
  }

  if (els.error) {
    els.error.textContent =
      message ||
      "Unable to load group milestones.";

    els.error.hidden = false;
  }
}


function showContent() {
  if (els.loading) {
    els.loading.hidden = true;
  }

  if (els.error) {
    els.error.hidden = true;
  }

  if (els.content) {
    els.content.hidden = false;
  }
}


/* =========================================================
   LOAD GROUP
========================================================= */

async function loadGroup() {
  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select(`
        id,
        name
      `)
      .eq(
        "id",
        state.groupId
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  state.groupName =
    data?.name ||
    "Your Group";
}


/* =========================================================
   LOAD PLANS
========================================================= */

async function loadPlans() {
  const {
    data,
    error
  } =
    await supabase
      .from("group_plans")
      .select(`
        id,
        group_id,
        title
      `)
      .eq(
        "group_id",
        state.groupId
      )
      .order(
        "title",
        {
          ascending: true
        }
      );

  if (error) {
    throw error;
  }

  state.plans =
    Array.isArray(data)
      ? data
      : [];
}


/* =========================================================
   LOAD MILESTONES
========================================================= */

async function loadMilestones() {
  const {
    data,
    error
  } =
    await supabase
      .from("group_milestones")
      .select(`
        id,
        group_id,
        plan_id,
        title,
        description,
        milestone_date,
        category,
        amount
      `)
      .eq(
        "group_id",
        state.groupId
      )
      .order(
        "milestone_date",
        {
          ascending: true
        }
      );

  if (error) {
    throw error;
  }

  state.milestones =
    Array.isArray(data)
      ? data
      : [];
}


/* =========================================================
   SUMMARY
========================================================= */

function renderSummary() {
  const milestones =
    state.milestones;

  const upcomingCount =
    milestones.filter(
      milestone =>
        isUpcoming(
          milestone.milestone_date
        )
    ).length;

  const linkedCount =
    milestones.filter(
      milestone =>
        Boolean(
          milestone.plan_id
        )
    ).length;

  if (els.total) {
    els.total.textContent =
      String(
        milestones.length
      );
  }

  if (els.upcoming) {
    els.upcoming.textContent =
      String(
        upcomingCount
      );
  }

  if (els.linked) {
    els.linked.textContent =
      String(
        linkedCount
      );
  }
}


/* =========================================================
   CATEGORY FILTER
========================================================= */

function populateCategories() {
  if (!els.category) {
    return;
  }

  const categories =
    [
      ...new Set(
        state.milestones
          .map(
            milestone =>
              String(
                milestone.category || ""
              ).trim()
          )
          .filter(Boolean)
      )
    ]
      .sort(
        (a, b) =>
          a.localeCompare(
            b
          )
      );

  els.category.innerHTML = `
    <option value="">
      All categories
    </option>
  `;

  categories.forEach(
    category => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        category;

      option.textContent =
        category
          .charAt(0)
          .toUpperCase() +
        category.slice(1);

      els.category.appendChild(
        option
      );
    }
  );
}


/* =========================================================
   FILTERING
========================================================= */

function getFilteredMilestones() {
  const search =
    normalize(
      els.search?.value
    );

  const category =
    normalize(
      els.category?.value
    );

  return state.milestones.filter(
    milestone => {

      const searchable =
        [
          milestone.title,
          milestone.description,
          milestone.category,
          getPlanTitle(
            milestone.plan_id
          ),
          milestone.milestone_date
        ]
          .map(normalize)
          .join(" ");

      if (
        search &&
        !searchable.includes(
          search
        )
      ) {
        return false;
      }

      if (
        category &&
        normalize(
          milestone.category
        ) !== category
      ) {
        return false;
      }

      return true;
    }
  );
}


/* =========================================================
   EMPTY STATE
========================================================= */

function renderEmptyState() {
  if (els.rows) {
    els.rows.innerHTML = `
      <tr>
        <td colspan="5">

          <div class="member-milestones-empty">

            <strong>
              No matching milestones
            </strong>

            No milestones match the current
            search or category filter.

          </div>

        </td>
      </tr>
    `;
  }

  if (els.mobileList) {
    els.mobileList.innerHTML = `
      <div class="member-milestones-empty">

        <strong>
          No matching milestones
        </strong>

        No milestones match the current
        search or category filter.

      </div>
    `;
  }
}


/* =========================================================
   DESKTOP TABLE
========================================================= */

function renderRows(milestones) {
  if (!els.rows) {
    return;
  }

  els.rows.innerHTML =
    milestones
      .map(
        milestone => `
          <tr>

            <td>

              <div class="member-milestone-title">
                ${escapeHtml(
                  milestone.title ||
                  "Milestone"
                )}
              </div>

              ${
                milestone.description
                  ? `
                    <div class="member-milestone-description">
                      ${escapeHtml(
                        milestone.description
                      )}
                    </div>
                  `
                  : ""
              }

            </td>


            <td>

              ${
                milestone.category
                  ? `
                    <span class="member-milestone-category">
                      ${escapeHtml(
                        milestone.category
                      )}
                    </span>
                  `
                  : "—"
              }

            </td>


            <td>

              <span class="member-milestone-plan">
                ${escapeHtml(
                  getPlanTitle(
                    milestone.plan_id
                  )
                )}
              </span>

            </td>


            <td>
              ${escapeHtml(
                formatDate(
                  milestone.milestone_date
                )
              )}
            </td>


            <td>

              <span class="member-milestone-amount">
                ${escapeHtml(
                  money(
                    milestone.amount
                  )
                )}
              </span>

            </td>

          </tr>
        `
      )
      .join("");
}


/* =========================================================
   MOBILE LIST
========================================================= */

function renderMobile(milestones) {
  if (!els.mobileList) {
    return;
  }

  els.mobileList.innerHTML =
    milestones
      .map(
        milestone => `
          <article
            class="member-milestone-mobile-card"
          >

            <div class="member-milestone-mobile-top">

              <h3>
                ${escapeHtml(
                  milestone.title ||
                  "Milestone"
                )}
              </h3>

              ${
                milestone.category
                  ? `
                    <span class="member-milestone-category">
                      ${escapeHtml(
                        milestone.category
                      )}
                    </span>
                  `
                  : ""
              }

            </div>


            ${
              milestone.description
                ? `
                  <p class="member-milestone-mobile-description">
                    ${escapeHtml(
                      milestone.description
                    )}
                  </p>
                `
                : ""
            }


            <div
              class="member-milestone-mobile-details"
            >

              <div
                class="member-milestone-mobile-detail"
              >
                <span>
                  Date
                </span>

                <strong>
                  ${escapeHtml(
                    formatDate(
                      milestone.milestone_date
                    )
                  )}
                </strong>
              </div>


              <div
                class="member-milestone-mobile-detail"
              >
                <span>
                  Plan
                </span>

                <strong>
                  ${escapeHtml(
                    getPlanTitle(
                      milestone.plan_id
                    )
                  )}
                </strong>
              </div>


              <div
                class="member-milestone-mobile-detail"
              >
                <span>
                  Amount
                </span>

                <strong>
                  ${escapeHtml(
                    money(
                      milestone.amount
                    )
                  )}
                </strong>
              </div>

            </div>

          </article>
        `
      )
      .join("");
}


/* =========================================================
   RENDER
========================================================= */

function renderMilestones() {
  const milestones =
    getFilteredMilestones();

  if (!milestones.length) {
    renderEmptyState();
    return;
  }

  renderRows(
    milestones
  );

  renderMobile(
    milestones
  );
}


/* =========================================================
   FILTER EVENTS
========================================================= */

function bindFilters() {
  els.search?.addEventListener(
    "input",
    renderMilestones
  );

  els.category?.addEventListener(
    "change",
    renderMilestones
  );
}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initMemberMilestones() {
  if (
    state.initialized
  ) {
    return;
  }

  state.initialized =
    true;

  showLoading();

  try {

    const member =
      await getMyMember();

    state.currentMember =
      member || null;

    state.groupId =
      member?.group_id ||
      null;

    if (!state.groupId) {
      throw new Error(
        "No group is associated with your member account."
      );
    }

    await Promise.all([
      loadGroup(),
      loadPlans(),
      loadMilestones()
    ]);

    if (els.groupName) {
      els.groupName.textContent =
        state.groupName;
    }

    renderSummary();

    populateCategories();

    bindFilters();

    renderMilestones();

    showContent();

  } catch (error) {

    console.error(
      "CHAMA LIVE: Member Milestones",
      error
    );

    showError(
      error?.message ||
      "Unable to load group milestones."
    );
  }
}


/* =========================================================
   MODULE STATUS
========================================================= */

console.log(
  "CHAMA LIVE: member-milestones.js loaded"
);
