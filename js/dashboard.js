/* =========================================================
   CHAMA LIVE — DASHBOARD
   COMPLETE STABLE VERSION

   Responsibilities
   ---------------------------------------------------------
   1. Authenticate current user
   2. Resolve current member
   3. Resolve current group
   4. Load group financial metrics
   5. Load canonical monthly contribution accounting
   6. Load member contribution status
   7. Load recent contributions
   8. Load recent expenses
   9. Load upcoming meetings

   IMPORTANT DATABASE RULE
   ---------------------------------------------------------
   This file is READ-ONLY.

   It does NOT:
   - create records
   - update records
   - delete records
   - modify RLS
   - modify RPCs
   - modify accounting

   GROUP SECURITY
   ---------------------------------------------------------
   group_id is NEVER accepted from:
   - URL
   - localStorage
   - query parameters
   - form fields

   The current group comes only from:
       authenticated user
              ↓
       getMyMember()
              ↓
       member.group_id

   CONTRIBUTION ACCOUNTING
   ---------------------------------------------------------
   Monthly contribution status is obtained from the
   canonical database RPC:

       get_canonical_member_monthly_status(
           group_id,
           month_start
       )

   The dashboard does NOT independently calculate:
   - arrears
   - payment allocation
   - carry-forward
   - current outstanding

   MEETINGS SCHEMA
   ---------------------------------------------------------
   Live meetings table uses:

       meetings.date

   NOT:

       meetings.meeting_date
========================================================= */


import {
  supabase,
  requireAuth,
  getMyMember,
  getMyGroup,
  money,
  setText,
  showError,
  clearError
} from "./auth.js";


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;


/* =========================================================
   DOM HELPERS
========================================================= */

function byId(
  id
) {

  return document.getElementById(
    id
  );

}


function safeText(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return "—";

  }


  return String(
    value
  );

}


function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


/* =========================================================
   STATUS
========================================================= */

function setLoadingStatus(
  message
) {

  const element =
    byId("status");


  if (element) {

    element.textContent =
      message;

  }

}


function setReadyStatus() {

  const element =
    byId("status");


  if (element) {

    element.textContent =
      "";

  }

}


/* =========================================================
   DATE HELPERS
========================================================= */

function getCurrentMonthStart() {

  const now =
    new Date();


  const year =
    now.getFullYear();


  const month =
    String(
      now.getMonth() + 1
    )
      .padStart(
        2,
        "0"
      );


  return `${year}-${month}-01`;

}


function formatDate(
  value
) {

  if (!value) {

    return "—";

  }


  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    /*
     * PostgreSQL DATE values such as
     * 2026-08-31 can safely be displayed
     * without timezone conversion.
     */

    const raw =
      String(
        value
      );


    if (
      /^\d{4}-\d{2}-\d{2}$/.test(
        raw
      )
    ) {

      const [
        year,
        month,
        day
      ] =
        raw.split("-");


      return `${day}/${month}/${year}`;

    }


    return safeText(
      value
    );

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


function formatMonth(
  value
) {

  if (!value) {

    return "Current month";

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

    return safeText(
      value
    );

  }


  return date.toLocaleDateString(
    "en-KE",
    {
      month: "long",
      year: "numeric"
    }
  );

}


/* =========================================================
   NUMBER HELPERS
========================================================= */

function numberValue(
  value
) {

  const number =
    Number(
      value
    );


  if (
    !Number.isFinite(
      number
    )
  ) {

    return 0;

  }


  return number;

}


function percentage(
  numerator,
  denominator
) {

  const top =
    numberValue(
      numerator
    );


  const bottom =
    numberValue(
      denominator
    );


  if (
    bottom <= 0
  ) {

    return 0;

  }


  return Math.min(
    100,
    Math.max(
      0,
      (
        top /
        bottom
      ) *
      100
    )
  );

}


function roundMoney(
  value
) {

  return Math.round(
    (
      numberValue(
        value
      ) +
      Number.EPSILON
    ) *
    100
  ) / 100;

}


/* =========================================================
   MEMBER NAME
========================================================= */

function memberName(
  member
) {

  if (!member) {

    return "Unknown member";

  }


  return (
    member.name ||
    member.full_name ||
    member.member_name ||
    member.email ||
    "Unknown member"
  );

}


/* =========================================================
   STATUS BADGE
========================================================= */

function statusClass(
  status
) {

  const value =
    String(
      status || ""
    )
      .trim()
      .toLowerCase();


  if (
    value === "credit"
  ) {

    return "status-credit";

  }


  if (
    value === "paid"
  ) {

    return "status-paid";

  }


  if (
    value === "cleared"
  ) {

    return "status-cleared";

  }


  if (
    value === "partial"
  ) {

    return "status-partial";

  }


  if (
    value === "pending"
  ) {

    return "status-pending";

  }


  if (
    value === "outstanding"
  ) {

    return "status-outstanding";

  }


  return "status-neutral";

}


function statusLabel(
  status
) {

  if (!status) {

    return "—";

  }


  const value =
    String(
      status
    )
      .trim();


  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );

}


/* =========================================================
   UPDATE GROUP HEADER
========================================================= */

function renderGroupHeader() {

  setText(
    "[data-group-name]",
    currentGroup?.name ||
      "CHAMA"
  );


  setText(
    "[data-user-name]",
    memberName(
      currentMember
    )
  );

}


/* =========================================================
   LOAD GROUP MEMBERS
========================================================= */

async function loadMembers() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "Current group could not be resolved."
    );

  }


  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(`
        id,
        group_id,
        name,
        status,
        onboarding_status
      `)
      .eq(
        "group_id",
        groupId
      );


  if (error) {

    throw error;

  }


  const members =
    Array.isArray(
      data
    )
      ? data
      : [];


  const activeMembers =
    members.filter(
      member => {

        const status =
          String(
            member.status || ""
          )
            .trim()
            .toLowerCase();


        const onboarding =
          String(
            member.onboarding_status || ""
          )
            .trim()
            .toLowerCase();


        return (
          status === "active" &&
          (
            !onboarding ||
            onboarding === "active" ||
            onboarding === "approved"
          )
        );

      }
    );


  setText(
    "#activeMembers",
    activeMembers.length
  );


  setText(
    "#membersCount",
    members.length
  );


  return {
    members,
    activeMembers
  };

}


/* =========================================================
   LOAD CANONICAL MONTHLY CONTRIBUTION STATUS
========================================================= */

async function loadMonthlyContributionStatus() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "Current group could not be resolved."
    );

  }


  const monthStart =
    getCurrentMonthStart();


  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_canonical_member_monthly_status",
      {
        p_group_id:
          groupId,

        p_month_start:
          monthStart
      }
    );


  if (error) {

    throw error;

  }


  const rows =
    Array.isArray(
      data
    )
      ? data
      : [];


  renderMonthlyContributionStatus(
    rows,
    monthStart
  );


  return rows;

}


/* =========================================================
   NORMALIZE CONTRIBUTION STATUS ROW
========================================================= */

function normalizeContributionRow(
  row
) {

  /*
   * The canonical RPC is expected to expose the
   * accounting fields below.

   * Different deployments may use slightly different
   * aliases for the member name, therefore the frontend
   * accepts the common variants without changing the
   * accounting calculation.
   */

  const monthlyDue =
    numberValue(
      row.monthly_due ??
      row.monthly_contribution ??
      row.due ??
      0
    );


  const previousOutstanding =
    numberValue(
      row.previous_outstanding ??
      row.prior_outstanding ??
      row.arrears_brought_forward ??
      0
    );


  const appliedThisMonth =
    numberValue(
      row.applied_this_month ??
      row.monthly_applied ??
      row.applied ??
      0
    );


  const carryForward =
    numberValue(
      row.carry_forward ??
      row.carry_forward_credit ??
      row.credit ??
      0
    );


  const currentOutstanding =
    numberValue(
      row.current_outstanding ??
      row.outstanding ??
      0
    );


  let status =
    row.status;


  if (!status) {

    if (
      carryForward > 0
    ) {

      status =
        "credit";

    }

    else if (
      currentOutstanding <= 0 &&
      appliedThisMonth >= monthlyDue
    ) {

      status =
        "paid";

    }

    else if (
      appliedThisMonth > 0
    ) {

      status =
        "partial";

    }

    else {

      status =
        "outstanding";

    }

  }


  return {

    memberId:
      row.member_id ??
      row.id,

    memberName:
      row.member_name ??
      row.name ??
      row.full_name ??
      "Unknown member",

    monthlyDue:
      roundMoney(
        monthlyDue
      ),

    previousOutstanding:
      roundMoney(
        previousOutstanding
      ),

    appliedThisMonth:
      roundMoney(
        appliedThisMonth
      ),

    carryForward:
      roundMoney(
        carryForward
      ),

    currentOutstanding:
      roundMoney(
        currentOutstanding
      ),

    status:
      String(
        status
      )
        .trim()
        .toLowerCase()

  };

}


/* =========================================================
   RENDER MEMBER CONTRIBUTION STATUS
========================================================= */

function renderMonthlyContributionStatus(
  rawRows,
  monthStart
) {

  const rows =
    rawRows.map(
      normalizeContributionRow
    );


  const tbody =
    byId(
      "memberStatusRows"
    );


  if (!tbody) {

    return;

  }


  setText(
    "#progressMonth",
    formatMonth(
      monthStart
    )
  );


  if (
    rows.length === 0
  ) {

    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          No member contribution status is available for this month.
        </td>
      </tr>
    `;


    updateContributionSummary(
      rows
    );


    return;

  }


  tbody.innerHTML =
    rows
      .map(
        row => {

          const statusClassName =
            statusClass(
              row.status
            );


          return `
            <tr>

              <td>
                ${escapeHtml(
                  row.memberName
                )}
              </td>

              <td>
                ${money(
                  row.monthlyDue
                )}
              </td>

              <td>
                ${money(
                  row.previousOutstanding
                )}
              </td>

              <td class="applied-value">
                ${money(
                  row.appliedThisMonth
                )}
              </td>

              <td class="credit-value">
                ${money(
                  row.carryForward
                )}
              </td>

              <td class="outstanding-value">
                ${money(
                  row.currentOutstanding
                )}
              </td>

              <td>
                <span class="status-badge ${statusClassName}">
                  ${escapeHtml(
                    statusLabel(
                      row.status
                    )
                  )}
                </span>
              </td>

            </tr>
          `;

        }
      )
      .join("");


  updateContributionSummary(
    rows
  );

}


/* =========================================================
   UPDATE CONTRIBUTION SUMMARY
========================================================= */

function updateContributionSummary(
  rows
) {

  const monthlyExpected =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        numberValue(
          row.monthlyDue
        ),
      0
    );


  const monthlyApplied =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        numberValue(
          row.appliedThisMonth
        ),
      0
    );


  const carryForward =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        numberValue(
          row.carryForward
        ),
      0
    );


  const currentOutstanding =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        numberValue(
          row.currentOutstanding
        ),
      0
    );


  const previousOutstanding =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        numberValue(
          row.previousOutstanding
        ),
      0
    );


  /*
   * A member is considered a contributor for this month's
   * participation measure when the canonical RPC reports
   * an applied amount greater than zero.
   */

  const contributors =
    rows.filter(
      row =>
        numberValue(
          row.appliedThisMonth
        ) > 0
    ).length;


  const memberCount =
    rows.length;


  const collectionRate =
    percentage(
      monthlyApplied,
      monthlyExpected
    );


  setText(
    "#monthlyExpected",
    money(
      monthlyExpected
    )
  );


  setText(
    "#monthlyCollected",
    money(
      monthlyApplied
    )
  );


  setText(
    "#progressPercentage",
    `${Math.round(
      collectionRate
    )}%`
  );


  setText(
    "#progressText",
    `${money(
      monthlyApplied
    )} / ${money(
      monthlyExpected
    )}`
  );


  setText(
    "#contributorsCount",
    `${contributors} / ${memberCount}`
  );


  setText(
    "#contributorsPercentage",
    `${Math.round(
      percentage(
        contributors,
        memberCount
      )
    )}%`
  );


  setText(
    "#monthlyOutstanding",
    money(
      currentOutstanding
    )
  );


  setText(
    "#progressApplied",
    money(
      monthlyApplied
    )
  );


  setText(
    "#progressCarryForward",
    money(
      carryForward
    )
  );


  setText(
    "#progressOutstanding",
    money(
      currentOutstanding
    )
  );


  /*
   * Keep these values available for debugging without
   * displaying them as part of the dashboard.
   */

  console.log(
    "CHAMA LIVE: monthly contribution summary",
    {
      monthlyExpected,
      monthlyApplied,
      previousOutstanding,
      carryForward,
      currentOutstanding,
      contributors,
      memberCount,
      collectionRate
    }
  );


  const progressBar =
    byId(
      "progressBar"
    );


  const progressContainer =
    progressBar?.parentElement;


  if (progressBar) {

    progressBar.style.width =
      `${collectionRate}%`;

  }


  if (
    progressContainer
  ) {

    progressContainer.setAttribute(
      "aria-valuenow",
      String(
        Math.round(
          collectionRate
        )
      )
    );

  }

}


/* =========================================================
   LOAD RECENT CONTRIBUTIONS
========================================================= */

async function loadRecentContributions() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "Current group could not be resolved."
    );

  }


  /*
   * The contribution record is group-scoped through the
   * member relationship.
   *
   * We first obtain current-group member IDs.
   */

  const {
    data: members,
    error: memberError
  } =
    await supabase
      .from("members")
      .select(`
        id,
        name
      `)
      .eq(
        "group_id",
        groupId
      );


  if (memberError) {

    throw memberError;

  }


  const memberIds =
    (
      members || []
    )
      .map(
        member =>
          member.id
      )
      .filter(
        Boolean
      );


  const tbody =
    byId(
      "recentContributionRows"
    );


  if (!tbody) {

    return [];

  }


  if (
    memberIds.length === 0
  ) {

    tbody.innerHTML = `
      <tr>
        <td colspan="3">
          No contributions recorded.
        </td>
      </tr>
    `;


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
        created_at
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


  const contributions =
    Array.isArray(
      data
    )
      ? data
      : [];


  const memberMap =
    new Map(
      (
        members || []
      )
        .map(
          member => [
            member.id,
            member.name
          ]
        )
    );


  if (
    contributions.length === 0
  ) {

    tbody.innerHTML = `
      <tr>
        <td colspan="3">
          No contributions recorded.
        </td>
      </tr>
    `;


    return contributions;

  }


  tbody.innerHTML =
    contributions
      .map(
        contribution => {

          const name =
            memberMap.get(
              contribution.member_id
            ) ||
            "Unknown member";


          const contributionDate =
            contribution.contribution_date ||
            contribution.created_at;


          return `
            <tr>

              <td>
                ${escapeHtml(
                  name
                )}
              </td>

              <td>
                ${money(
                  contribution.amount
                )}
              </td>

              <td>
                ${escapeHtml(
                  formatDate(
                    contributionDate
                  )
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");


  return contributions;

}


/* =========================================================
   LOAD RECENT EXPENSES
========================================================= */

async function loadRecentExpenses() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "Current group could not be resolved."
    );

  }


  const tbody =
    byId(
      "recentExpenseRows"
    );


  if (!tbody) {

    return [];

  }


  /*
   * Expenses are directly group-scoped.
   */

  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .select(`
        id,
        group_id,
        description,
        amount,
        status,
        expense_date,
        created_at
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "expense_date",
        {
          ascending: false
        }
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


  const expenses =
    Array.isArray(
      data
    )
      ? data
      : [];


  if (
    expenses.length === 0
  ) {

    tbody.innerHTML = `
      <tr>
        <td colspan="3">
          No expenses recorded.
        </td>
      </tr>
    `;


    return expenses;

  }


  tbody.innerHTML =
    expenses
      .map(
        expense => {

          const status =
            expense.status ||
            "pending";


          return `
            <tr>

              <td>
                ${escapeHtml(
                  expense.description ||
                  "Expense"
                )}
              </td>

              <td>
                ${money(
                  expense.amount
                )}
              </td>

              <td>
                <span class="status-badge ${statusClass(
                  status
                )}">
                  ${escapeHtml(
                    statusLabel(
                      status
                    )
                  )}
                </span>
              </td>

            </tr>
          `;

        }
      )
      .join("");


  return expenses;

}


/* =========================================================
   LOAD CURRENT BALANCE
========================================================= */

async function loadCurrentBalance() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "Current group could not be resolved."
    );

  }


  /*
   * Calculate the displayed balance from the current
   * group's opening balance plus approved income less
   * approved expenses.

   * Contributions are received money.
   * Expenses reduce available group funds.
   */

  const openingBalance =
    numberValue(
      currentGroup.opening_balance
    );


  /*
   * Load all group members first so contributions can be
   * restricted to this group without accepting a client-
   * supplied group_id.
   */

  const {
    data: members,
    error: memberError
  } =
    await supabase
      .from("members")
      .select("id")
      .eq(
        "group_id",
        groupId
      );


  if (memberError) {

    throw memberError;

  }


  const memberIds =
    (
      members || []
    )
      .map(
        member =>
          member.id
      )
      .filter(
        Boolean
      );


  let contributionTotal =
    0;


  if (
    memberIds.length > 0
  ) {

    const {
      data: contributions,
      error: contributionError
    } =
      await supabase
        .from("contributions")
        .select(`
          amount
        `)
        .in(
          "member_id",
          memberIds
        );


    if (contributionError) {

      throw contributionError;

    }


    contributionTotal =
      (
        contributions || []
      )
        .reduce(
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

  }


  /*
   * Approved expenses only reduce the balance.
   */

  const {
    data: expenses,
    error: expenseError
  } =
    await supabase
      .from("expenses")
      .select(`
        amount,
        status
      `)
      .eq(
        "group_id",
        groupId
      );


  if (expenseError) {

    throw expenseError;

  }


  const approvedExpenseTotal =
    (
      expenses || []
    )
      .filter(
        expense => {

          const status =
            String(
              expense.status || ""
            )
              .trim()
              .toLowerCase();


          /*
           * Some installations may not populate status.
           * In that case the existing record is treated as
           * part of the balance rather than silently omitted.
           */

          return (
            !status ||
            status === "approved" ||
            status === "paid" ||
            status === "completed"
          );

        }
      )
      .reduce(
        (
          total,
          expense
        ) =>
          total +
          numberValue(
            expense.amount
          ),
        0
      );


  const balance =
    openingBalance +
    contributionTotal -
    approvedExpenseTotal;


  setText(
    "#currentBalance",
    money(
      balance
    )
  );


  return balance;

}


/* =========================================================
   LOAD UPCOMING MEETINGS
   ---------------------------------------------------------
   IMPORTANT:
   Live schema uses meetings.date.

   NEVER use:
       meetings.meeting_date
========================================================= */

async function loadUpcomingMeetings() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "Current group could not be resolved."
    );

  }


  const tbody =
    byId(
      "upcomingMeetingRows"
    );


  if (!tbody) {

    return [];

  }


  /*
   * IMPORTANT:
   *
   * The live meetings table uses:
   *
   *     date
   *
   * The previous dashboard implementation incorrectly
   * requested:
   *
   *     meeting_date
   *
   * That caused:
   *
   *     column meetings.meeting_date does not exist
   *
   * This query deliberately uses meetings.date.
   */

  const today =
    new Date()
      .toISOString()
      .slice(
        0,
        10
      );


  const {
    data,
    error
  } =
    await supabase
      .from("meetings")
      .select(`
        id,
        group_id,
        title,
        venue,
        date,
        status,
        created_at
      `)
      .eq(
        "group_id",
        groupId
      )
      .gte(
        "date",
        today
      )
      .order(
        "date",
        {
          ascending: true
        }
      )
      .order(
        "created_at",
        {
          ascending: true
        }
      )
      .limit(5);


  if (error) {

    throw error;

  }


  const meetings =
    Array.isArray(
      data
    )
      ? data
      : [];


  if (
    meetings.length === 0
  ) {

    tbody.innerHTML = `
      <tr>
        <td colspan="4">
          No upcoming meetings.
        </td>
      </tr>
    `;


    return meetings;

  }


  tbody.innerHTML =
    meetings
      .map(
        meeting => {

          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    meeting.date
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  meeting.title ||
                  meeting.name ||
                  "Meeting"
                )}
              </td>

              <td>
                ${escapeHtml(
                  meeting.venue ||
                  "—"
                )}
              </td>

              <td>
                <span class="status-badge ${statusClass(
                  meeting.status ||
                  "scheduled"
                )}">
                  ${escapeHtml(
                    statusLabel(
                      meeting.status ||
                      "scheduled"
                    )
                  )}
                </span>
              </td>

            </tr>
          `;

        }
      )
      .join("");


  return meetings;

}


/* =========================================================
   LOAD DASHBOARD
========================================================= */

async function loadDashboard() {

  clearError();


  setLoadingStatus(
    "Loading dashboard..."
  );


  /*
   * -------------------------------------------------------
   * AUTHENTICATION
   * -------------------------------------------------------
   */

  currentUser =
    await requireAuth();


  /*
   * -------------------------------------------------------
   * CURRENT MEMBER
   * -------------------------------------------------------
   */

  currentMember =
    await getMyMember();


  if (
    !currentMember?.group_id
  ) {

    throw new Error(
      "Your member record has no group."
    );

  }


  /*
   * -------------------------------------------------------
   * CURRENT GROUP
   * -------------------------------------------------------
   */

  currentGroup =
    await getMyGroup();


  if (
    !currentGroup?.id
  ) {

    throw new Error(
      "Group information could not be found."
    );

  }


  /*
   * -------------------------------------------------------
   * HEADER
   * -------------------------------------------------------
   */

  renderGroupHeader();


  /*
   * -------------------------------------------------------
   * LOAD DASHBOARD DATA
   *
   * Each section is loaded independently so that one
   * optional section cannot erase already loaded financial
   * information.
   * -------------------------------------------------------
   */

  const results =
    await Promise.allSettled([

      loadMembers(),

      loadMonthlyContributionStatus(),

      loadRecentContributions(),

      loadRecentExpenses(),

      loadCurrentBalance(),

      loadUpcomingMeetings()

    ]);


  const failures =
    results.filter(
      result =>
        result.status ===
        "rejected"
    );


  if (
    failures.length > 0
  ) {

    console.warn(
      "CHAMA LIVE: one or more dashboard sections failed",
      failures.map(
        result =>
          result.reason
      )
    );

    /*
     * Display the first meaningful error while allowing the
     * other dashboard sections to remain usable.
     */

    const firstError =
      failures[0]?.reason;


    showError(
      firstError
    );

    setLoadingStatus(
      "Dashboard loaded with some unavailable sections."
    );

  }

  else {

    setReadyStatus();

  }


  console.log(
    "CHAMA LIVE: dashboard loaded",
    {
      userId:
        currentUser?.id,

      memberId:
        currentMember?.id,

      groupId:
        currentGroup?.id,

      groupName:
        currentGroup?.name
    }
  );

}


/* =========================================================
   INITIALIZE
========================================================= */

async function init() {

  try {

    await loadDashboard();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: dashboard failed to load",
      error
    );


    showError(
      error
    );


    setLoadingStatus(
      "Dashboard failed to load."
    );

  }

}


/* =========================================================
   EXPORT
========================================================= */

export {
  init,
  loadDashboard,
  loadUpcomingMeetings,
  loadMonthlyContributionStatus
};


/* =========================================================
   BOOT
========================================================= */

init();
