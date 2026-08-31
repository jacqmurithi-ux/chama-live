/* =========================================================
   CHAMA LIVE — DASHBOARD
   COMPLETE UPDATED VERSION

   READ-ONLY DASHBOARD

   Responsibilities
   ---------------------------------------------------------
   1. Authenticate current user
   2. Resolve current member
   3. Resolve current group
   4. Load group members
   5. Load canonical monthly contribution accounting
   6. Load recent contributions
   7. Load recent expenses
   8. Load upcoming meetings
   9. Display group balance

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
              ↓
       getMyGroup()

   CANONICAL ACCOUNTING
   ---------------------------------------------------------
   Monthly contribution status is obtained ONLY from:

       public.get_canonical_member_monthly_status(
           p_group_id uuid,
           p_month text
       )

   IMPORTANT:
   The live database signature is:

       p_group_id
       p_month

   NOT:

       p_month_start

   The RPC returns:

       member_id
       member_number
       member_name
       monthly_due
       previous_outstanding
       previous_credit
       current_month_payment
       applied_this_month
       carry_forward
       current_outstanding
       total_paid_to_date
       total_due_to_date
       status

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

let groupMembers = [];
let activeMembers = [];

let monthlyStatusRows = [];


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
   PAGE STATUS
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


function setPartialStatus(
  message
) {

  const element =
    byId("status");


  if (element) {

    element.textContent =
      message;

  }

}


/* =========================================================
   DATE HELPERS
========================================================= */

function getCurrentMonth() {

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


  return `${year}-${month}`;

}


function getCurrentMonthStart() {

  return `${getCurrentMonth()}-01`;

}


function formatDate(
  value
) {

  if (!value) {

    return "—";

  }


  const raw =
    String(
      value
    );


  /*
   * PostgreSQL DATE values should not be
   * shifted through a UTC conversion.
   */

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


  const date =
    new Date(
      value
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


  const raw =
    String(
      value
    );


  const date =
    new Date(
      `${raw}-01T00:00:00`
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


/* =========================================================
   MEMBER HELPERS
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


function findMemberName(
  memberId
) {

  if (!memberId) {

    return "Unknown member";

  }


  const member =
    groupMembers.find(
      item =>
        item.id ===
        memberId
    );


  return member
    ? memberName(
        member
      )
    : "Unknown member";

}


/* =========================================================
   STATUS HELPERS
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
   GROUP HEADER
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
   LOAD MEMBERS
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
        onboarding_status,
        member_number,
        membership_number
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "created_at",
        {
          ascending: true
        }
      );


  if (error) {

    throw error;

  }


  groupMembers =
    Array.isArray(
      data
    )
      ? data
      : [];


  activeMembers =
    groupMembers.filter(
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


        /*
         * Treat active/approved records as
         * active members.
         *
         * Blank onboarding_status remains
         * compatible with older records.
         */

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
    groupMembers.length
  );


  return {
    members:
      groupMembers,

    activeMembers:
      activeMembers
  };

}


/* =========================================================
   CANONICAL MONTHLY ACCOUNTING
========================================================= */

async function loadMonthlyContributionStatus() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "Current group could not be resolved."
    );

  }


  /*
   * IMPORTANT:
   *
   * The live RPC signature is:
   *
   * get_canonical_member_monthly_status(
   *     p_group_id uuid,
   *     p_month text
   * )
   *
   * Do NOT send p_month_start.
   */

  const month =
    getCurrentMonth();


  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_canonical_member_monthly_status",
      {
        p_group_id:
          groupId,

        p_month:
          month
      }
    );


  if (error) {

    throw error;

  }


  monthlyStatusRows =
    Array.isArray(
      data
    )
      ? data
      : [];


  renderMonthlyContributionStatus(
    monthlyStatusRows,
    month
  );


  return monthlyStatusRows;

}


/* =========================================================
   NORMALIZE CANONICAL ROW
========================================================= */

function normalizeContributionRow(
  row
) {

  const monthlyDue =
    numberValue(
      row.monthly_due
    );


  const previousOutstanding =
    numberValue(
      row.previous_outstanding
    );


  const previousCredit =
    numberValue(
      row.previous_credit
    );


  const currentMonthPayment =
    numberValue(
      row.current_month_payment
    );


  const appliedThisMonth =
    numberValue(
      row.applied_this_month
    );


  const carryForward =
    numberValue(
      row.carry_forward
    );


  const currentOutstanding =
    numberValue(
      row.current_outstanding
    );


  let status =
    row.status;


  /*
   * The canonical RPC is authoritative.
   *
   * Fallback status is only used if the RPC
   * returns a null/empty status.
   */

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
      row.member_id,

    memberNumber:
      row.member_number,

    memberName:
      row.member_name ||
      findMemberName(
        row.member_id
      ),

    monthlyDue:
      roundMoney(
        monthlyDue
      ),

    previousOutstanding:
      roundMoney(
        previousOutstanding
      ),

    previousCredit:
      roundMoney(
        previousCredit
      ),

    currentMonthPayment:
      roundMoney(
        currentMonthPayment
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

    totalPaidToDate:
      roundMoney(
        row.total_paid_to_date
      ),

    totalDueToDate:
      roundMoney(
        row.total_due_to_date
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
   RENDER MONTHLY CONTRIBUTION STATUS
========================================================= */

function renderMonthlyContributionStatus(
  rawRows,
  month
) {

  const rows =
    rawRows.map(
      normalizeContributionRow
    );


  const tbody =
    byId(
      "memberStatusRows"
    );


  setText(
    "#progressMonth",
    formatMonth(
      month
    )
  );


  if (!tbody) {

    return;

  }


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

          const badgeClass =
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
                <span
                  class="status-badge ${badgeClass}"
                >
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
   CONTRIBUTION SUMMARY
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


  const outstanding =
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


  /*
   * Participation is based on actual
   * payment received in the current month.
   *
   * Do not count carry-forward by itself
   * as a new contribution.
   */

  const contributors =
    rows.filter(
      row =>
        numberValue(
          row.currentMonthPayment
        ) > 0
    ).length;


  const memberCount =
    rows.length;


  const collectionRate =
    percentage(
      monthlyApplied,
      monthlyExpected
    );


  const participationRate =
    percentage(
      contributors,
      memberCount
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
    "#monthlyOutstanding",
    money(
      outstanding
    )
  );


  setText(
    "#contributorsCount",
    `${contributors} / ${memberCount}`
  );


  setText(
    "#contributorsPercentage",
    `${Math.round(
      participationRate
    )}%`
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
      outstanding
    )
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


  if (progressContainer) {

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
   LOAD GROUP BALANCE
========================================================= */

async function loadGroupBalance() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "Current group could not be resolved."
    );

  }


  /*
   * Contributions
   * -------------------------------------------------------
   * Read-only aggregate.
   */

  const contributionResult =
    await supabase
      .from("contributions")
      .select(
        "amount"
      )
      .eq(
        "group_id",
        groupId
      );


  if (
    contributionResult.error
  ) {

    throw contributionResult.error;

  }


  const totalContributions =
    (
      contributionResult.data || []
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


  /*
   * Approved expenses only reduce the
   * available group balance.
   */

  const expenseResult =
    await supabase
      .from("expenses")
      .select(
        "amount, approval_status"
      )
      .eq(
        "group_id",
        groupId
      );


  if (
    expenseResult.error
  ) {

    throw expenseResult.error;

  }


  const approvedExpenses =
    (
      expenseResult.data || []
    )
      .filter(
        expense => {

          const status =
            String(
              expense.approval_status || ""
            )
              .trim()
              .toLowerCase();


          /*
           * Keep approved expenses only.
           *
           * For installations where approval_status
           * is blank/null, do not treat the expense
           * as approved automatically.
           */

          return (
            status === "approved"
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


  const openingBalance =
    numberValue(
      currentGroup?.opening_balance
    );


  const balance =
    roundMoney(
      openingBalance +
      totalContributions -
      approvedExpenses
    );


  setText(
    "#currentBalance",
    money(
      balance
    )
  );


  return {

    openingBalance:
      openingBalance,

    totalContributions:
      totalContributions,

    approvedExpenses:
      approvedExpenses,

    balance:
      balance

  };

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
      .eq(
        "group_id",
        groupId
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
      .limit(
        10
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


  const tbody =
    byId(
      "recentContributionRows"
    );


  if (!tbody) {

    return rows;

  }


  if (
    rows.length === 0
  ) {

    tbody.innerHTML = `
      <tr>
        <td colspan="3">
          No contributions recorded yet.
        </td>
      </tr>
    `;


    return rows;

  }


  tbody.innerHTML =
    rows
      .map(
        row => {

          return `
            <tr>

              <td>
                ${escapeHtml(
                  findMemberName(
                    row.member_id
                  )
                )}
              </td>

              <td>
                ${money(
                  row.amount
                )}
              </td>

              <td>
                ${formatDate(
                  row.contribution_date ||
                  row.created_at
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");


  return rows;

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


  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .select(`
        id,
        description,
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
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(
        10
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


  const tbody =
    byId(
      "recentExpenseRows"
    );


  if (!tbody) {

    return rows;

  }


  if (
    rows.length === 0
  ) {

    tbody.innerHTML = `
      <tr>
        <td colspan="3">
          No expenses recorded yet.
        </td>
      </tr>
    `;


    return rows;

  }


  tbody.innerHTML =
    rows
      .map(
        row => {

          const status =
            String(
              row.approval_status ||
              "pending"
            )
              .trim()
              .toLowerCase();


          const badgeClass =
            statusClass(
              status
            );


          return `
            <tr>

              <td>
                ${escapeHtml(
                  row.description ||
                  "Expense"
                )}
              </td>

              <td>
                ${money(
                  row.amount
                )}
              </td>

              <td>
                <span
                  class="status-badge ${badgeClass}"
                >
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


  return rows;

}


/* =========================================================
   LOAD UPCOMING MEETINGS
========================================================= */

async function loadUpcomingMeetings() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {

    throw new Error(
      "Current group could not be resolved."
    );

  }


  /*
   * IMPORTANT:
   *
   * The live meetings table uses:
   *
   *     date
   *
   * NOT:
   *
   *     meeting_date
   */

  const today =
    new Date();


  const todayString =
    [
      today.getFullYear(),
      String(
        today.getMonth() + 1
      ).padStart(
        2,
        "0"
      ),
      String(
        today.getDate()
      ).padStart(
        2,
        "0"
      )
    ].join("-");


  const {
    data,
    error
  } =
    await supabase
      .from("meetings")
      .select(`
        id,
        title,
        date,
        venue,
        status
      `)
      .eq(
        "group_id",
        groupId
      )
      .gte(
        "date",
        todayString
      )
      .order(
        "date",
        {
          ascending: true
        }
      )
      .limit(
        10
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


  const tbody =
    byId(
      "upcomingMeetingRows"
    );


  if (!tbody) {

    return rows;

  }


  if (
    rows.length === 0
  ) {

    tbody.innerHTML = `
      <tr>
        <td colspan="4">
          No upcoming meetings scheduled.
        </td>
      </tr>
    `;


    return rows;

  }


  tbody.innerHTML =
    rows
      .map(
        row => {

          const status =
            String(
              row.status ||
              "scheduled"
            )
              .trim()
              .toLowerCase();


          const badgeClass =
            statusClass(
              status
            );


          return `
            <tr>

              <td>
                ${formatDate(
                  row.date
                )}
              </td>

              <td>
                ${escapeHtml(
                  row.title ||
                  "Meeting"
                )}
              </td>

              <td>
                ${escapeHtml(
                  row.venue ||
                  "—"
                )}
              </td>

              <td>
                <span
                  class="status-badge ${badgeClass}"
                >
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


  return rows;

}


/* =========================================================
   SECTION ERROR DISPLAY
========================================================= */

function renderSectionError(
  elementId,
  message,
  colspan
) {

  const tbody =
    byId(
      elementId
    );


  if (!tbody) {

    return;

  }


  tbody.innerHTML = `
    <tr>
      <td colspan="${colspan}">
        <span class="muted">
          ${escapeHtml(
            message
          )}
        </span>
      </td>
    </tr>
  `;

}


/* =========================================================
   RUN SECTION SAFELY
========================================================= */

async function runSection(
  name,
  loader,
  errorElementId,
  colspan
) {

  try {

    return await loader();

  }

  catch (error) {

    console.error(
      `CHAMA LIVE: ${name} failed`,
      error
    );


    renderSectionError(
      errorElementId,
      `${name} could not be loaded.`,
      colspan
    );


    return null;

  }

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


  /*
   * -------------------------------------------------------
   * CURRENT GROUP
   * -------------------------------------------------------
   */

  currentGroup =
    await getMyGroup();


  if (!currentGroup?.id) {

    throw new Error(
      "Your current group could not be resolved."
    );

  }


  renderGroupHeader();


  /*
   * -------------------------------------------------------
   * MEMBERS FIRST
   *
   * Recent contribution names depend on this
   * member map.
   * -------------------------------------------------------
   */

  let membersLoaded =
    false;


  try {

    await loadMembers();

    membersLoaded =
      true;

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: members failed",
      error
    );

    throw error;

  }


  /*
   * -------------------------------------------------------
   * INDEPENDENT DASHBOARD SECTIONS
   *
   * One failed section should NOT prevent the
   * other sections from displaying.
   * -------------------------------------------------------
   */

  const results =
    await Promise.allSettled([

      runSection(
        "Monthly contribution accounting",
        loadMonthlyContributionStatus,
        "memberStatusRows",
        7
      ),

      runSection(
        "Group balance",
        loadGroupBalance,
        null,
        0
      ),

      runSection(
        "Recent contributions",
        loadRecentContributions,
        "recentContributionRows",
        3
      ),

      runSection(
        "Recent expenses",
        loadRecentExpenses,
        "recentExpenseRows",
        3
      ),

      runSection(
        "Upcoming meetings",
        loadUpcomingMeetings,
        "upcomingMeetingRows",
        4
      )

    ]);


  /*
   * -------------------------------------------------------
   * DETERMINE WHETHER ANY SECTION FAILED
   * -------------------------------------------------------
   */

  const failed =
    results.some(
      result =>
        result.status ===
        "rejected"
    );


  /*
   * The runSection wrapper normally converts
   * failures into fulfilled null results.
   *
   * Keep this check for unexpected failures.
   */

  if (failed) {

    setPartialStatus(
      "Dashboard loaded with some sections unavailable."
    );

  }

  else if (
    membersLoaded
  ) {

    setReadyStatus();

  }

}


/* =========================================================
   BOOT
========================================================= */

async function bootDashboard() {

  try {

    await loadDashboard();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: Dashboard failed to load",
      error
    );


    setLoadingStatus(
      "Dashboard failed to load."
    );


    showError(
      error
    );

  }

}


/* =========================================================
   INITIALIZE
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    bootDashboard();

  }
);


/* =========================================================
   LOGOUT
========================================================= */

function initializeLogout() {

  const logoutButton =
    byId(
      "logout"
    );


  if (!logoutButton) {

    return;

  }


  logoutButton.addEventListener(
    "click",
    async () => {

      logoutButton.disabled =
        true;


      logoutButton.textContent =
        "Signing out...";


      try {

        const {
          error
        } =
          await supabase.auth.signOut();


        if (error) {

          throw error;

        }


        window.location.replace(
          "login.html"
        );

      }

      catch (error) {

        console.error(
          "CHAMA LIVE: sign out failed",
          error
        );


        logoutButton.disabled =
          false;


        logoutButton.textContent =
          "Sign out";


        showError(
          error
        );

      }

    }
  );

}


document.addEventListener(
  "DOMContentLoaded",
  () => {

    initializeLogout();

  }
);


/* =========================================================
   DEBUG
========================================================= */

console.log(
  "CHAMA LIVE: dashboard.js loaded"
);
