/* =========================================================
   CHAMA LIVE — MEMBER DASHBOARD

   MEMBER PORTAL
   ---------------------------------------------------------
   Read-only dashboard.

   NO:
     - INSERT
     - UPDATE
     - DELETE
     - financial mutation
     - member mutation
     - group mutation
     - administrative action
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

let groupMembers = [];
let groupContributions = [];
let groupExpenses = [];

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


function numberValue(value) {

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}


function formatMoney(amount) {

  return (
    "KSh " +
    numberValue(amount)
      .toLocaleString(
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

  return [
    now.getFullYear(),
    String(
      now.getMonth() + 1
    ).padStart(2, "0"),
    String(
      now.getDate()
    ).padStart(2, "0")
  ].join("-");
}


function currentMonthStart() {

  const now =
    new Date();

  return [
    now.getFullYear(),
    String(
      now.getMonth() + 1
    ).padStart(2, "0"),
    "01"
  ].join("-");
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


function setText(id, value) {

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
    memberNumber
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
   MY CONTRIBUTIONS
   ---------------------------------------------------------
   OWN MEMBER DATA ONLY
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
        numberValue(
          row.amount
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
   GROUP READ DATA
   ---------------------------------------------------------
   These are SELECT-only.

   IMPORTANT:
   contributions are linked to members through member_id;
   we do NOT assume contributions has group_id.
========================================================= */

async function loadGroupReadData() {

  const membersResult =
    await supabase
      .from("members")
      .select(`
        id,
        group_id,
        name,
        status
      `)
      .eq(
        "group_id",
        groupId
      );

  if (membersResult.error) {
    throw membersResult.error;
  }

  groupMembers =
    Array.isArray(
      membersResult.data
    )
      ? membersResult.data
      : [];


  const memberIds =
    groupMembers
      .map(
        member =>
          member.id
      )
      .filter(Boolean);


  if (memberIds.length) {

    const contributionsResult =
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
        .in(
          "member_id",
          memberIds
        )
        .order(
          "contribution_date",
          {
            ascending: false
          }
        )
        .limit(50);

    if (contributionsResult.error) {
      throw contributionsResult.error;
    }

    groupContributions =
      Array.isArray(
        contributionsResult.data
      )
        ? contributionsResult.data
        : [];

  }
  else {

    groupContributions = [];

  }


  const expensesResult =
    await supabase
      .from("expenses")
      .select(`
        id,
        description,
        category,
        amount,
        date,
        approval_status
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "date",
        {
          ascending: false
        }
      )
      .limit(50);

  if (expensesResult.error) {
    throw expensesResult.error;
  }

  groupExpenses =
    Array.isArray(
      expensesResult.data
    )
      ? expensesResult.data
      : [];
}


/* =========================================================
   GROUP FINANCIAL HEALTH
========================================================= */

function renderGroupFinancialHealth() {

  const monthStart =
    currentMonthStart();

  const monthlyContributions =
    groupContributions.filter(
      contribution =>
        String(
          contribution.contribution_date || ""
        ).slice(0, 10) >=
        monthStart
    );

  const monthlyExpenses =
    groupExpenses.filter(
      expense =>
        String(
          expense.date || ""
        ).slice(0, 10) >=
        monthStart
    );


  const contributionTotal =
    monthlyContributions.reduce(
      (
        total,
        row
      ) =>
        total +
        numberValue(
          row.amount
        ),
      0
    );


  const approvedExpenses =
    monthlyExpenses
      .filter(
        expense =>
          String(
            expense.approval_status || ""
          )
            .trim()
            .toLowerCase() ===
          "approved"
      );


  const expenseTotal =
    approvedExpenses.reduce(
      (
        total,
        row
      ) =>
        total +
        numberValue(
          row.amount
        ),
      0
    );


  const netMovement =
    contributionTotal -
    expenseTotal;


  const activeMembers =
    groupMembers.filter(
      member =>
        String(
          member.status || ""
        )
          .trim()
          .toLowerCase() ===
        "active"
    );


  const activeMemberIds =
    new Set(
      activeMembers.map(
        member =>
          String(member.id)
      )
    );


  const contributingMemberIds =
    new Set(
      monthlyContributions
        .filter(
          contribution =>
            activeMemberIds.has(
              String(
                contribution.member_id
              )
            )
        )
        .map(
          contribution =>
            String(
              contribution.member_id
            )
        )
    );


  const participation =
    activeMembers.length > 0
      ? (
          contributingMemberIds.size /
          activeMembers.length
        ) * 100
      : 0;


  let expenseActivity =
    "Quiet";

  if (monthlyExpenses.length >= 5) {
    expenseActivity = "Active";
  }
  else if (monthlyExpenses.length > 0) {
    expenseActivity = "Normal";
  }


  const memberCount =
    activeMembers.length ||
    groupMembers.length;


  setText(
    "groupMemberCount",
    memberCount
  );

  setText(
    "groupMonthlyContributions",
    formatMoney(
      contributionTotal
    )
  );

  setText(
    "groupMonthlyExpenses",
    formatMoney(
      expenseTotal
    )
  );

  setText(
    "groupNetMovement",
    formatMoney(
      netMovement
    )
  );

  setText(
    "groupParticipation",
    `${Math.round(
      participation
    )}%`
  );

  setText(
    "groupExpenseActivity",
    expenseActivity
  );


  const bar =
    byId(
      "groupParticipationBar"
    );

  if (bar) {

    const safeParticipation =
      Math.max(
        0,
        Math.min(
          100,
          participation
        )
      );

    bar.style.width =
      `${safeParticipation}%`;

    bar.setAttribute(
      "aria-valuenow",
      String(
        Math.round(
          safeParticipation
        )
      );

  }


  setText(
    "activityMemberCount",
    memberCount
  );

  setText(
    "activityContributionCount",
    monthlyContributions.length
  );

  setText(
    "activityExpenseCount",
    monthlyExpenses.length
  );
}


/* =========================================================
   RECENT CONTRIBUTIONS
========================================================= */

function renderRecentGroupContributions() {

  const container =
    byId(
      "memberRecentContributions"
    );

  if (!container) {
    return;
  }

  const memberNames =
    new Map(
      groupMembers.map(
        member => [
          String(member.id),
          member.name ||
          "Member"
        ]
      )
    );


  const rows =
    groupContributions
      .slice(
        0,
        5
      );


  if (!rows.length) {

    container.innerHTML = `
      <div class="member-list-item">
        <strong>No recent contributions</strong>
        <span class="member-muted">
          Recent group contributions will appear here.
        </span>
      </div>
    `;

    return;
  }


  container.innerHTML =
    rows.map(
      contribution => {

        const memberName =
          memberNames.get(
            String(
              contribution.member_id
            )
          ) ||
          "Member";

        return `
          <div class="member-transaction">

            <div class="member-transaction-main">

              <div class="member-transaction-title">
                ${escapeHtml(
                  memberName
                )}
              </div>

              <div class="member-transaction-meta">

                ${
                  contribution.contribution_type
                    ? escapeHtml(
                        contribution.contribution_type
                      )
                    : "Contribution"
                }

                ·

                ${escapeHtml(
                  formatDate(
                    contribution.contribution_date
                  )
                )}

              </div>

            </div>

            <div class="member-transaction-amount">
              ${escapeHtml(
                formatMoney(
                  contribution.amount
                )
              )}
            </div>

          </div>
        `;
      }
    ).join("");
}


/* =========================================================
   RECENT EXPENSES
========================================================= */

function renderRecentGroupExpenses() {

  const container =
    byId(
      "memberRecentExpenses"
    );

  if (!container) {
    return;
  }


  const rows =
    groupExpenses
      .slice(
        0,
        3
      );


  if (!rows.length) {

    container.innerHTML = `
      <div class="member-list-item">
        <strong>No recent expenses</strong>
        <span class="member-muted">
          Recent group expenses will appear here.
        </span>
      </div>
    `;

    return;
  }


  container.innerHTML =
    rows.map(
      expense => {

        const approved =
          String(
            expense.approval_status || ""
          )
            .trim()
            .toLowerCase() ===
          "approved";

        return `
          <div class="member-transaction">

            <div class="member-transaction-main">

              <div class="member-transaction-title">
                ${escapeHtml(
                  expense.description ||
                  expense.category ||
                  "Group Expense"
                )}
              </div>

              <div class="member-transaction-meta">

                ${
                  expense.category
                    ? escapeHtml(
                        expense.category
                      )
                    : "Expense"
                }

                ·

                ${escapeHtml(
                  formatDate(
                    expense.date
                  )
                )}

                ·

                ${escapeHtml(
                  displayStatus(
                    expense.approval_status ||
                    "pending"
                  )
                )}

              </div>

            </div>

            <div
              class="member-transaction-amount"
              ${approved ? "" : "style=\"color:#b45309\""}
            >
              ${escapeHtml(
                formatMoney(
                  expense.amount
                )
              )}
            </div>

          </div>
        `;
      }
    ).join("");
}


/* =========================================================
   MEETINGS
========================================================= */

async function loadMeetings() {

  const container =
    byId(
      "memberMeetings"
    );

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

        <strong>
          No upcoming meetings
        </strong>

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

            ${
              meeting.venue
                ? ` · ${escapeHtml(
                    meeting.venue
                  )}`
                : ""
            }

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
    byId(
      "memberActivities"
    );

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

        <strong>
          No group activities
        </strong>

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
          Math.max(
            0,
            Math.min(
              100,
              numberValue(
                activity.progress_percent
              )
            )
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

            </span>

            <div class="member-progress">

              <span
                style="width:${progress}%"
              ></span>

            </div>

            <span class="member-muted">
              ${progress}% complete
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
    byId(
      "memberPlans"
    );

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

        <strong>
          No plans or goals
        </strong>

        <span class="member-muted">
          No group plans or contribution goals have been recorded.
        </span>

      </div>
    `;

    return;
  }


  items.sort(
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
      .slice(
        0,
        8
      )
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
                  <div class="member-progress">

                    <span
                      style="width:${Math.max(
                        0,
                        Math.min(
                          100,
                          numberValue(
                            item.progress
                          )
                        )
                      )}%"
                    ></span>

                  </div>
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
   ASSETS
========================================================= */

async function loadAssets() {

  const container =
    byId(
      "memberAssets"
    );

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

        <strong>
          No group assets
        </strong>

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

    const context =
      await getMyApplicationContext();


    currentUser =
      context?.user ||
      null;

    currentMember =
      context?.member ||
      null;

    currentGroup =
      context?.group ||
      null;


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


    renderAccount();


    /*
     * The member dashboard sections are kept independent.
     * A failure in one optional group section must not
     * erase the rest of the dashboard.
     */

    const results =
      await Promise.allSettled([

        loadMyContributions(),

        loadGroupReadData(),

        loadMeetings(),

        loadActivities(),

        loadPlansAndGoals(),

        loadAssets()

      ]);


    /*
     * Render group financial information only when its
     * SELECT queries succeeded.
     */

    const groupDataResult =
      results[1];

    if (
      groupDataResult?.status ===
      "fulfilled"
    ) {

      renderGroupFinancialHealth();

      renderRecentGroupContributions();

      renderRecentGroupExpenses();

    }
    else {

      setText(
        "groupMemberCount",
        "—"
      );

      setText(
        "groupMonthlyContributions",
        "Not available"
      );

      setText(
        "groupMonthlyExpenses",
        "Not available"
      );

      setText(
        "groupNetMovement",
        "Not available"
      );

      setText(
        "groupParticipation",
        "—"
      );

      setText(
        "groupExpenseActivity",
        "Not available"
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

      console.warn(
        "CHAMA LIVE: group financial read data unavailable.",
        groupDataResult?.reason
      );

    }


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
       * Optional sections should not make the entire
       * dashboard look broken.
       */

      if (
        failures.length >=
        results.length
      ) {

        const firstFailure =
          failures[0]?.reason;

        showError(
          firstFailure?.message ||
          "Unable to load your dashboard information."
        );

      }

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

export async function initMemberDashboard() {

  if (initialized) {
    return;
  }

  initialized =
    true;

  await loadDashboard();
}


console.log(
  "CHAMA LIVE: member-dashboard.js loaded"
);
