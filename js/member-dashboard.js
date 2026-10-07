/* =========================================================
   CHAMA LIVE — MEMBER DASHBOARD
   ---------------------------------------------------------
   MEMBER PORTAL

   PURPOSE
   ---------------------------------------------------------
   • Show the authenticated member's own account information.
   • Show the member's own canonical contribution position.
   • Show read-only group-level information.
   • Show canonical monthly participation.
   • Show canonical monthly cash contribution totals.
   • Provide read-only activity information.

   SECURITY CONTRACT
   ---------------------------------------------------------
   • member-layout.js owns authentication/context resolution.
   • member-layout.js passes the resolved application context
     into initMemberDashboard(context).
   • This page is READ-ONLY.
   • No INSERT.
   • No UPDATE.
   • No DELETE.
   • No financial mutation.
   • No member mutation.
   • No group mutation.
   • No admin mutation.

   ACCOUNTING CONTRACT
   ---------------------------------------------------------
   Canonical member position:

       get_my_contribution_position()

   Canonical group monthly participation:

       get_canonical_monthly_accounting_summary()

   Canonical group monthly cash contributions:

       get_monthly_accounting_summary()

   IMPORTANT
   ---------------------------------------------------------
   • Do not assume contributions.group_id exists.
   • Group contribution activity is resolved through members.
   • Raw contribution rows are NOT used to calculate:
       - group participation
       - monthly canonical contribution totals
       - member arrears
       - member credit
       - member canonical allocated position
   • member-layout.js owns portal navigation/auth/logout.
   ========================================================= */

import { supabase } from "./supabase.js";


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

let groupMonthlyAccountingSummary = null;
let groupMonthlyFinancialSummary = null;

let initialized = false;


/* =========================================================
   DOM HELPERS
   ========================================================= */

function byId(id) {
  return document.getElementById(id);
}


function setText(id, value) {
  const element = byId(id);

  if (element) {
    element.textContent = value ?? "—";
  }
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

  return Number.isFinite(number)
    ? number
    : 0;
}


function formatMoney(value) {
  return new Intl.NumberFormat(
    "en-KE",
    {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ).format(
    numberValue(value)
  );
}


/* =========================================================
   DATE HELPERS
   ========================================================= */

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString(
    "en-KE",
    {
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );
}


function todayIso() {
  const date = new Date();

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function currentMonthStart() {
  const date = new Date();

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  return `${year}-${month}-01`;
}


function currentMonthKey() {
  return currentMonthStart()
    .slice(0, 7);
}


/* =========================================================
   RPC RESULT NORMALIZATION
   ========================================================= */

function firstRpcRow(data) {
  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
}


/* =========================================================
   DISPLAY HELPERS
   ========================================================= */

function displayRole(role) {
  if (!role) {
    return "Member";
  }

  return String(role)
    .replace(
      /[_-]+/g,
      " "
    )
    .replace(
      /\b\w/g,
      letter =>
        letter.toUpperCase()
    );
}


function displayStatus(status) {
  if (!status) {
    return "—";
  }

  return String(status)
    .replace(
      /[_-]+/g,
      " "
    )
    .replace(
      /\b\w/g,
      letter =>
        letter.toUpperCase()
    );
}


/* =========================================================
   LOADING / ERROR
   ========================================================= */

function showLoading(show) {
  const loading =
    byId(
      "memberLoading"
    );

  if (loading) {
    loading.hidden = !show;
  }
}


function showError(message) {
  const error =
    byId(
      "memberError"
    );

  if (!error) {
    return;
  }

  error.textContent =
    message ||
    "Unable to load your member dashboard.";

  error.hidden = false;
}


function clearError() {
  const error =
    byId(
      "memberError"
    );

  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
}


/* =========================================================
   CANONICAL MEMBER CONTRIBUTION POSITION
   ========================================================= */

function contributionPositionStatus(position) {
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


function renderMyContributionPosition(position) {
  const statusElement =
    byId(
      "myContributionStatus"
    );

  const totalElement =
    byId(
      "myContributionPositionTotal"
    );

  const arrearsElement =
    byId(
      "myContributionArrears"
    );

  const creditElement =
    byId(
      "myContributionCredit"
    );

  if (!position) {
    if (statusElement) {
      statusElement.className =
        "member-finance-status-value status-unknown";

      statusElement.textContent =
        "Unavailable";
    }

    if (totalElement) {
      totalElement.textContent = "—";
    }

    if (arrearsElement) {
      arrearsElement.textContent = "—";
    }

    if (creditElement) {
      creditElement.textContent = "—";
    }

    /*
     * Compatibility with the existing dashboard field.
     *
     * This deliberately uses no raw contribution aggregation.
     */
    setText(
      "myContributionTotal",
      "—"
    );

    return;
  }

  const status =
    contributionPositionStatus(
      position
    );

  if (statusElement) {
    statusElement.className =
      "member-finance-status-value";

    if (status === "ARREARS") {
      statusElement.classList.add(
        "status-arrears"
      );

      statusElement.textContent =
        "ARREARS";

    } else if (status === "CREDIT") {
      statusElement.classList.add(
        "status-credit"
      );

      statusElement.textContent =
        "CREDIT";

    } else {
      statusElement.classList.add(
        "status-up-to-date"
      );

      statusElement.textContent =
        "UP TO DATE";
    }
  }

  /*
   * Canonical position contract:
   *
   *   total_due
   *   total_allocated
   *   arrears
   *   credit
   *   status
   *
   * total_allocated is the canonical amount allocated
   * against this member's obligations.
   */
  if (totalElement) {
    totalElement.textContent =
      formatMoney(
        position.total_allocated
      );
  }

  if (arrearsElement) {
    arrearsElement.textContent =
      formatMoney(
        position.arrears
      );
  }

  if (creditElement) {
    creditElement.textContent =
      formatMoney(
        position.credit
      );
  }

  /*
   * Existing dashboard compatibility field.
   *
   * It deliberately mirrors the canonical allocated amount
   * rather than independently summing contribution rows.
   */
  setText(
    "myContributionTotal",
    formatMoney(
      position.total_allocated
    )
  );
}


async function loadMyActiveContributions() {

  const container =
    byId(
      "myActiveContributions"
    );

  if (
    !container ||
    !groupId ||
    !memberId
  ) {
    return;
  }

  container.replaceChildren();

  let monthlyRow = null;
  let customRows = [];

  /*
   * Monthly status comes from the canonical monthly accounting
   * contract. This guarantees Monthly Contribution is always
   * visible alongside active Custom Contributions.
   */
  try {

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
            currentMonthKey()
        }
      );

    if (error) {
      throw error;
    }

    const rows =
      Array.isArray(data)
        ? data
        : [];

    const memberRow =
      rows.find(
        row =>
          String(
            row?.member_id
          ) ===
          String(
            memberId
          )
      );

    if (memberRow) {

      const status =
        String(
          memberRow.status ||
          ""
        )
          .trim()
          .toUpperCase();

      monthlyRow = {

        key:
          "monthly",

        contribution_name:
          "Monthly Contribution",

        type:
          "Monthly",

        frequency:
          "Monthly",

        amount_due:
          numberValue(
            memberRow.monthly_due
          ),

        amount_allocated:
          numberValue(
            memberRow.applied_this_month ??
            memberRow.current_month_payment
          ),

        outstanding_balance:
          numberValue(
            memberRow.current_outstanding
          ),

        status:
          status === "PAID"
            ? "PAID"
            : "OUTSTANDING",

        due_date:
          null,

        closing_date:
          null,

        fine_enabled:
          false,

        grace_period_value:
          0,

        fine_amount:
          0

      };

    }

  }
  catch (error) {

    console.warn(
      "Monthly active contribution status could not be loaded:",
      error
    );

  }


  /*
   * Custom active contribution status remains backend-owned.
   * The existing RPC is read-only and returns the member's
   * active contribution obligations/status.
   */
  try {

    const {
      data,
      error
    } =
      await supabase.rpc(
        "get_member_active_contributions",
        {
          p_group_id:
            groupId,

          p_member_id:
            memberId
        }
      );

    if (error) {
      throw error;
    }

    customRows =
      (
        Array.isArray(data)
          ? data
          : []
      )
        .filter(
          item =>
            String(
              item?.type ||
              item?.contribution_type ||
              ""
            )
              .trim()
              .toLowerCase() !==
            "monthly"
        );

  }
  catch (error) {

    console.warn(
      "Active custom contributions could not be loaded:",
      error
    );

  }


  const rows = [
    ...(monthlyRow
      ? [monthlyRow]
      : []),
    ...customRows
  ];

  if (!rows.length) {

    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "member-list-item";

    empty.textContent =
      "No ongoing contributions are currently available.";

    container.appendChild(
      empty
    );

    return;

  }

  rows.forEach(
    item => {

      const card =
        document.createElement(
          "div"
        );

      card.className =
        "member-list-item";

      const title =
        document.createElement(
          "strong"
        );

      title.textContent =
        item.contribution_name ||
        item.name ||
        "Contribution";

      const status =
        document.createElement(
          "span"
        );

      const normalizedStatus =
        String(
          item.status ||
          "OUTSTANDING"
        )
          .trim()
          .toUpperCase();

      status.className =
        normalizedStatus ===
        "PAID"
          ? "member-finance-status-value status-paid"
          : normalizedStatus ===
              "PARTIAL"
            ? "member-finance-status-value status-unknown"
            : "member-finance-status-value status-arrears";

      status.textContent =
        normalizedStatus ===
          "PARTIAL"
          ? "PARTIAL"
          : normalizedStatus ===
              "PAID"
            ? "PAID"
            : "OUTSTANDING";

      const amounts =
        document.createElement(
          "div"
        );

      amounts.className =
        "member-muted";

      amounts.textContent =
        "Due " +
        formatMoney(
          item.amount_due
        ) +
        " · Allocated " +
        formatMoney(
          item.amount_allocated
        ) +
        " · Outstanding " +
        formatMoney(
          item.outstanding_balance
        );

      const dates =
        document.createElement(
          "div"
        );

      dates.className =
        "member-muted";

      dates.textContent =
        (
          item.frequency ||
          (
            String(
              item.type ||
              ""
            )
              .toLowerCase() ===
            "monthly"
              ? "Monthly"
              : "—"
          )
        ) +
        " · Due " +
        formatDate(
          item.due_date
        ) +
        " · Closing " +
        formatDate(
          item.closing_date
        );

      const rules =
        document.createElement(
          "div"
        );

      rules.className =
        "member-muted";

      rules.textContent =
        item.fine_enabled
          ? "Grace " +
            Number(
              item.grace_period_value ||
              0
            ) +
            " day" +
            (
              Number(
                item.grace_period_value ||
                0
              ) ===
              1
                ? ""
                : "s"
            ) +
            " · Fine " +
            formatMoney(
              item.fine_amount
            )
          : "No fine rule";

      card.append(
        title,
        status,
        amounts,
        dates,
        rules
      );

      container.appendChild(
        card
      );

    }
  );

}


async function loadMyContributionPosition() {
  const statusElement =
    byId(
      "myContributionStatus"
    );

  if (statusElement) {
    statusElement.className =
      "member-finance-status-value status-unknown";

    statusElement.textContent =
      "Loading...";
  }

  setText(
    "myContributionPositionTotal",
    "—"
  );

  setText(
    "myContributionArrears",
    "—"
  );

  setText(
    "myContributionCredit",
    "—"
  );

  setText(
    "myContributionTotal",
    "—"
  );

  try {
    const {
      data,
      error
    } = await supabase.rpc(
      "get_my_contribution_position"
    );

    if (error) {
      throw error;
    }

    const position =
      firstRpcRow(data);

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


/* =========================================================
   ACCOUNT
   ========================================================= */

function renderAccount() {
  const memberName =
    currentMember?.name ||
    "Member";

  const groupName =
    currentGroup?.name ||
    "Your group";

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
   MEMBER CONTRIBUTION ACTIVITY COUNT
   ---------------------------------------------------------
   ACTIVITY ONLY.

   NOT used to calculate:
     • arrears
     • credit
     • canonical total allocated
     • monthly participation
     • monthly cash contribution total
   ========================================================= */

async function loadMyContributionActivity() {
  try {
    const {
      count,
      error
    } = await supabase
      .from("contributions")
      .select(
        "id",
        {
          count: "exact",
          head: true
        }
      )
      .eq(
        "member_id",
        memberId
      );

    if (error) {
      throw error;
    }

    setText(
      "myContributionCount",
      String(
        numberValue(count)
      )
    );

  } catch (error) {
    console.warn(
      "Member contribution activity count could not be loaded:",
      error
    );

    setText(
      "myContributionCount",
      "—"
    );
  }
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
      .eq(
        "group_id",
        groupId
      ),

    supabase
      .from("expenses")
      .select(
        "id, description, category, amount, date, approval_status"
      )
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
      .limit(50)
  ]);

  if (membersResult.error) {
    throw membersResult.error;
  }

  if (expensesResult.error) {
    throw expensesResult.error;
  }

  groupMembers =
    Array.isArray(
      membersResult.data
    )
      ? membersResult.data
      : [];

  groupExpenses =
    Array.isArray(
      expensesResult.data
    )
      ? expensesResult.data
      : [];

  /*
   * contributions has no assumed group_id.
   *
   * Resolve group contribution activity through
   * members belonging to the current group.
   */
  const memberIds =
    groupMembers
      .map(
        member =>
          member.id
      )
      .filter(Boolean);

  if (!memberIds.length) {
    groupContributions = [];
    return;
  }

  const contributionsResult =
    await supabase
      .from("contributions")
      .select(
        "id, member_id, amount, contribution_date, contribution_type, payment_method"
      )
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


/* =========================================================
   CANONICAL GROUP MONTHLY ACCOUNTING
   ========================================================= */

async function loadGroupMonthlyAccountingSummary() {
  const {
    data,
    error
  } = await supabase.rpc(
    "get_canonical_monthly_accounting_summary",
    {
      p_group_id:
        groupId,

      p_month:
        currentMonthKey()
    }
  );

  if (error) {
    throw error;
  }

  groupMonthlyAccountingSummary =
    firstRpcRow(data);

  if (!groupMonthlyAccountingSummary) {
    throw new Error(
      "Canonical monthly accounting returned no result."
    );
  }
}


/* =========================================================
   GROUP MONTHLY FINANCIAL SUMMARY
   ========================================================= */

async function loadGroupMonthlyFinancialSummary() {
  const {
    data,
    error
  } = await supabase.rpc(
    "get_monthly_accounting_summary",
    {
      p_group_id:
        groupId,

      p_month:
        currentMonthKey()
    }
  );

  if (error) {
    throw error;
  }

  groupMonthlyFinancialSummary =
    firstRpcRow(data);

  if (!groupMonthlyFinancialSummary) {
    throw new Error(
      "Monthly accounting summary returned no result."
    );
  }
}


/* =========================================================
   GROUP FINANCIAL HEALTH
   ========================================================= */

function renderGroupFinancialHealth(
  accountingSummary
) {
  const monthStart =
    currentMonthStart();

  /*
   * Monthly cash contribution total comes ONLY from
   * the canonical monthly financial RPC.
   *
   * It is never reconstructed from groupContributions.
   */
  const monthlyContributions =
    numberValue(
      groupMonthlyFinancialSummary
        ?.total_contributions_collected
    );

  /*
   * Expenses are read-only transaction data.
   *
   * Only approved current-month expenses are included
   * in the net movement calculation.
   */
  const monthlyExpenses =
    groupExpenses
      .filter(
        expense =>
          expense.date &&
          String(
            expense.date
          ).slice(0, 10) >=
            monthStart &&
          String(
            expense.approval_status || ""
          ).toLowerCase() ===
            "approved"
      )
      .reduce(
        (
          sum,
          expense
        ) =>
          sum +
          numberValue(
            expense.amount
          ),
        0
      );

  const netMovement =
    monthlyContributions -
    monthlyExpenses;

  /*
   * CANONICAL PARTICIPATION
   *
   * Do NOT calculate participation from raw
   * contribution rows.
   *
   * Canonical formula:
   *
   *   members_paid
   *   +
   *   partial_payments
   * ---------------------
   *     active_members
   */
  const activeMembers =
    numberValue(
      accountingSummary?.active_members
    );

  const membersPaid =
    numberValue(
      accountingSummary?.members_paid
    );

  const partialPayments =
    numberValue(
      accountingSummary?.partial_payments
    );

  const participation =
    activeMembers > 0
      ? (
          (
            membersPaid +
            partialPayments
          ) /
          activeMembers
        ) * 100
      : 0;

  const safeParticipation =
    Math.max(
      0,
      Math.min(
        100,
        participation
      )
    );

  const expenseCount =
    groupExpenses.filter(
      expense =>
        expense.date &&
        String(
          expense.date
        ).slice(0, 10) >=
          monthStart
    ).length;

  let expenseActivity =
    "Quiet";

  if (expenseCount >= 5) {
    expenseActivity =
      "Active";

  } else if (expenseCount >= 1) {
    expenseActivity =
      "Normal";
  }

  setText(
    "groupMemberCount",
    String(
      groupMembers.length
    )
  );

  setText(
    "groupMonthlyContributions",
    formatMoney(
      monthlyContributions
    )
  );

  setText(
    "groupMonthlyExpenses",
    formatMoney(
      monthlyExpenses
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
      safeParticipation
    )}%`
  );

  setText(
    "groupExpenseActivity",
    expenseActivity
  );

  setText(
    "activityMemberCount",
    String(
      groupMembers.length
    )
  );

  setText(
    "activityContributionCount",
    String(
      groupContributions.length
    )
  );

  setText(
    "activityExpenseCount",
    String(
      groupExpenses.length
    )
  );

  const bar =
    byId(
      "groupParticipationBar"
    );

  if (bar) {
    bar.style.width =
      `${safeParticipation}%`;

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
   ---------------------------------------------------------
   READ-ONLY ACTIVITY ONLY.
   ========================================================= */

function renderRecentGroupContributions() {
  const container =
    byId(
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

  const memberNames =
    new Map(
      groupMembers.map(
        member => [
          member.id,
          member.name ||
            "Member"
        ]
      )
    );

  const recent =
    groupContributions.slice(
      0,
      5
    );

  container.innerHTML =
    recent
      .map(
        contribution => {
          const name =
            memberNames.get(
              contribution.member_id
            ) ||
            "Member";

          return `
            <div class="member-dashboard-list-item">
              <div>
                <strong>
                  ${escapeHtml(name)}
                </strong>

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
                  formatMoney(
                    contribution.amount
                  )
                )}
              </strong>
            </div>
          `;
        }
      )
      .join("");
}


/* =========================================================
   RECENT GROUP EXPENSES
   ========================================================= */

function renderRecentGroupExpenses() {
  const container =
    byId(
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
    groupExpenses.slice(
      0,
      3
    );

  container.innerHTML =
    recent
      .map(
        expense => {
          const status =
            expense.approval_status ||
            "Pending";

          const approved =
            String(
              status
            ).toLowerCase() ===
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
                    expense.category ||
                    "Expense"
                  )}
                  ·
                  ${escapeHtml(
                    formatDate(
                      expense.date
                    )
                  )}
                  ·
                  ${escapeHtml(status)}
                </small>
              </div>

              <strong${
                approved
                  ? ""
                  : ' style="opacity:.75;"'
              }>
                ${escapeHtml(
                  formatMoney(
                    expense.amount
                  )
                )}
              </strong>
            </div>
          `;
        }
      )
      .join("");
}


/* =========================================================
   MEETINGS
   ========================================================= */

async async function loadMeetings() {
  const container = byId("memberMeetings");

  if (!container) return;

  const { data, error } = await supabase
    .from("meetings")
    .select("id, date, start_time, end_time, title, venue, agenda, type, status")
    .eq("group_id", groupId)
    .gte("date", todayIso())
    .neq("status", "cancelled")
    .order("date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false })
    .limit(5);

  if (error) throw error;

  const meetings = Array.isArray(data) ? data : [];

  if (!meetings.length) {
    container.innerHTML = "<p>No upcoming meetings recorded.</p>";
    return;
  }

  const summaries = await Promise.all(
    meetings.map(async meeting => {
      const result = await supabase.rpc("get_meeting_rsvp_summary", {
        p_meeting_id: meeting.id
      });

      if (result.error) throw result.error;

      return result.data?.[0] || {
        attending_count: 0,
        apology_count: 0,
        my_status: null
      };
    })
  );

  const formatTime = value => {
    if (!value) return "";
    const parts = String(value).split(":");
    const hour = Number(parts[0]);
    const minute = parts[1] || "00";
    if (!Number.isFinite(hour)) return String(value);
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return displayHour + ":" + minute + " " + suffix;
  };

  const formatType = value => ({
    regular: "Regular",
    AGM: "AGM",
    special: "Special",
    committee: "Committee"
  }[String(value || "regular")] || "Meeting");

  const agendaText = agenda => {
    const items = Array.isArray(agenda)
      ? agenda.filter(Boolean)
      : [];
    return items.length ? items.join(" · ") : "No agenda recorded";
  };

  container.innerHTML = meetings.map((meeting, index) => {
    const summary = summaries[index] || {};
    const myStatus = summary.my_status || "";
    const attending = Number(summary.attending_count || 0);
    const apologies = Number(summary.apology_count || 0);

    return `
      <div class="member-dashboard-list-item member-meeting-item">
        <div>
          <strong>${escapeHtml(meeting.title || "Meeting")}</strong>
          <small>
            ${escapeHtml(formatDate(meeting.date))}
            · ${escapeHtml(formatTime(meeting.start_time) || "Time not specified")}
            ${meeting.end_time ? `– ${escapeHtml(formatTime(meeting.end_time))}` : ""}
            ${meeting.venue ? ` · ${escapeHtml(meeting.venue)}` : ""}
            · ${escapeHtml(formatType(meeting.type))}
          </small>
          <small>
            ${escapeHtml(agendaText(meeting.agenda))}
          </small>
          <small>
            Attending: ${attending} · Apologies: ${apologies}
          </small>
        </div>

        <div class="member-meeting-rsvp-actions">
          <button
            type="button"
            class="btn btn-secondary"
            data-meeting-rsvp="attending"
            data-meeting-id="${escapeHtml(meeting.id)}"
            ${myStatus === "attending" ? "disabled" : ""}
          >
            ${myStatus === "attending" ? "I’ll attend ✓" : "I’ll attend"}
          </button>

          <button
            type="button"
            class="btn btn-secondary"
            data-meeting-rsvp="apology"
            data-meeting-id="${escapeHtml(meeting.id)}"
            ${myStatus === "apology" ? "disabled" : ""}
          >
            ${myStatus === "apology" ? "Apology sent ✓" : "Send apology"}
          </button>
        </div>
      </div>
    `;
  }).join("");

  container.onclick = async event => {
    const button = event.target.closest("button[data-meeting-rsvp]");

    if (!button || !container.contains(button)) return;

    const meetingId = button.dataset.meetingId;
    const status = button.dataset.meetingRsvp;

    if (!meetingId || !["attending", "apology"].includes(status)) return;

    button.disabled = true;

    try {
      const { error: rsvpError } = await supabase
        .from("meeting_rsvps")
        .upsert(
          {
            meeting_id: meetingId,
            member_id: memberId,
            status,
            responded_at: new Date().toISOString()
          },
          { onConflict: "meeting_id,member_id" }
        );

      if (rsvpError) throw rsvpError;

      await loadMeetings();
    }
    catch (rsvpError) {
      console.error("CHAMA LIVE meeting RSVP:", rsvpError);
    }
    finally {
      if (button.isConnected) button.disabled = false;
    }
  };
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
  } = await supabase
    .from("group_activities")
    .select(
      "id, plan_id, title, description, start_date, due_date, status, progress_percent"
    )
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

  const activities =
    Array.isArray(data)
      ? data
      : [];

  if (!activities.length) {
    container.innerHTML =
      "<p>No group activities recorded.</p>";

    return;
  }

  container.innerHTML =
    activities
      .map(
        activity => `
          <div class="member-dashboard-list-item">
            <div>
              <strong>
                ${escapeHtml(
                  activity.title ||
                  "Activity"
                )}
              </strong>

              <small>
                ${escapeHtml(
                  activity.status ||
                  "Planned"
                )}
                ${
                  activity.due_date
                    ? ` · Due ${escapeHtml(
                        formatDate(
                          activity.due_date
                        )
                      )}`
                    : ""
                }
              </small>
            </div>

            <span>
              ${numberValue(
                activity.progress_percent
              )}%
            </span>
          </div>
        `
      )
      .join("");
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
  ] = await Promise.all([
    supabase
      .from("group_plans")
      .select(
        "id, title, description, category, start_date, target_date, status, progress_percent"
      )
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
      .select(
        "id, goal_name, category, description, frequency, start_date, end_date, target_amount, status"
      )
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

  const combined = [
    ...plans.map(
      plan => ({
        type: "Plan",
        title:
          plan.title,
        description:
          plan.description,
        status:
          plan.status,
        progress:
          plan.progress_percent,
        date:
          plan.target_date
      })
    ),

    ...goals.map(
      goal => ({
        type: "Goal",
        title:
          goal.goal_name,
        description:
          goal.description,
        status:
          goal.status,
        progress:
          null,
        date:
          goal.end_date
      })
    )
  ]
    .sort(
      (
        first,
        second
      ) => {
        const firstDate =
          first.date
            ? new Date(
                first.date
              ).getTime()
            : Number.MAX_SAFE_INTEGER;

        const secondDate =
          second.date
            ? new Date(
                second.date
              ).getTime()
            : Number.MAX_SAFE_INTEGER;

        return (
          firstDate -
          secondDate
        );
      }
    )
    .slice(
      0,
      5
    );

  if (!combined.length) {
    container.innerHTML =
      "<p>No plans or goals recorded.</p>";

    return;
  }

  container.innerHTML =
    combined
      .map(
        item => `
          <div class="member-dashboard-list-item">
            <div>
              <strong>
                ${escapeHtml(
                  item.title ||
                  item.type
                )}
              </strong>

              <small>
                ${escapeHtml(
                  item.type
                )}
                ${
                  item.status
                    ? ` · ${escapeHtml(
                        item.status
                      )}`
                    : ""
                }
                ${
                  item.date
                    ? ` · ${escapeHtml(
                        formatDate(
                          item.date
                        )
                      )}`
                    : ""
                }
              </small>
            </div>

            <span>
              ${
                item.progress !== null &&
                item.progress !== undefined
                  ? `${numberValue(
                      item.progress
                    )}%`
                  : ""
              }
            </span>
          </div>
        `
      )
      .join("");
}


/* =========================================================
   GROUP ASSETS
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
  } = await supabase
    .from("group_assets")
    .select(
      "id, asset_name, category, description, acquired_date, acquisition_cost, current_value, location, status"
    )
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

  const assets =
    Array.isArray(data)
      ? data
      : [];

  if (!assets.length) {
    container.innerHTML =
      "<p>No group assets recorded.</p>";

    return;
  }

  container.innerHTML =
    assets
      .map(
        asset => `
          <div class="member-dashboard-list-item">
            <div>
              <strong>
                ${escapeHtml(
                  asset.asset_name ||
                  "Asset"
                )}
              </strong>

              <small>
                ${escapeHtml(
                  asset.category ||
                  "Asset"
                )}
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
                        asset.status
                      )}`
                    : ""
                }
              </small>
            </div>

            <span>
              ${
                asset.current_value !== null &&
                asset.current_value !== undefined
                  ? escapeHtml(
                      formatMoney(
                        asset.current_value
                      )
                    )
                  : ""
              }
            </span>
          </div>
        `
      )
      .join("");
}



/* =========================================================
   MEMBER FINE POSITION — READ ONLY
   ========================================================= */

async function loadMyFinePosition() {
  const container = byId("myFinePosition");
  if (!container || !groupId || !memberId) return;

  try {
    const { data, error } = await supabase
      .from("fines")
      .select(
        "id,rule_id,trigger_type,accounting_month,original_amount,calculated_amount,triggered_at,source_type,fine_type,reason,imposed_at"
      )
      .eq("group_id", groupId)
      .eq("member_id", memberId)
      .order("triggered_at", { ascending: false });

    if (error) throw error;

    const fines = Array.isArray(data) ? data : [];
    const balances = new Map();

    await Promise.all(fines.map(async fine => {
      const result = await supabase.rpc("cl_fine_balance", {
        p_fine_id: fine.id
      });

      if (result.error) throw result.error;

      const row = Array.isArray(result.data)
        ? result.data[0]
        : result.data;

      if (row) balances.set(String(fine.id), row);
    }));

    const outstanding = fines.reduce(
      (sum, fine) =>
        sum + Number(
          balances.get(String(fine.id))?.outstanding_amount || 0
        ),
      0
    );

    const total = fines.reduce(
      (sum, fine) =>
        sum + Number(fine.original_amount ?? fine.calculated_amount ?? 0),
      0
    );

    const status = outstanding > 0
      ? "FINES OUTSTANDING"
      : fines.length
        ? "NO OUTSTANDING FINES"
        : "NO FINES";

    const rows = fines.slice(0, 5).map(fine => {
      const balance = balances.get(String(fine.id)) || {};
      const source =
        String(fine.source_type || "").toUpperCase() === "MANUAL_MEMBER_FINE"
          ? "Manual"
          : "Contribution";

      const type =
        fine.fine_type ||
        (source === "Manual" ? "Manual fine" : "Contribution fine");

      const reason =
        fine.reason ||
        (source === "Manual"
          ? "Member fine"
          : "Contribution-related fine");

      return `
        <div class="member-fine-item">
          <div>
            <strong>${escapeHtml(type)}</strong>
            <small>
              ${escapeHtml(source)}
              · ${escapeHtml(reason)}
              · ${escapeHtml(formatDate(fine.imposed_at || fine.triggered_at))}
            </small>
          </div>
          <span>
            ${escapeHtml(formatMoney(balance.outstanding_amount || 0))}
          </span>
        </div>
      `;
    }).join("");

    container.innerHTML = `
      <div class="member-fine-summary">
        <div>
          <span>Total fines</span>
          <strong>${escapeHtml(formatMoney(total))}</strong>
        </div>
        <div>
          <span>Outstanding</span>
          <strong>${escapeHtml(formatMoney(outstanding))}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>${escapeHtml(status)}</strong>
        </div>
      </div>
      <div class="member-fine-list">
        ${rows || '<p class="member-muted">No fines have been recorded against your account.</p>'}
      </div>
    `;
  } catch (error) {
    console.warn("Member fine position could not be loaded:", error);
    container.innerHTML =
      '<p class="member-muted">Fine information could not be loaded.</p>';
  }
}

/* =========================================================
   DASHBOARD LOAD
   ---------------------------------------------------------
   CONTEXT OWNERSHIP
   ---------------------------------------------------------
   member-layout.js resolves:
     • authenticated user
     • member
     • group

   It then calls:

       initMemberDashboard(context)

   This module does not independently resolve auth/context.
   ========================================================= */

async function loadDashboard() {
  clearError();
  showLoading(true);

  try {
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

    /*
     * Independent read-only dashboard sections.
     *
     * A failure in one optional section does not destroy
     * successfully loaded canonical member accounting data.
     */
    const results =
      await Promise.allSettled([
        loadMyContributionPosition(),
        loadMyActiveContributions(),
        loadMyFinePosition(),
        loadMyContributionActivity(),
        loadGroupReadData(),
        loadGroupMonthlyAccountingSummary(),
        loadGroupMonthlyFinancialSummary(),
        loadMeetings(),
        loadActivities(),
        loadPlansAndGoals(),
        loadAssets()
      ]);

    const [
      myPositionResult,
      myActivityResult,
      groupDataResult,
      groupAccountingResult,
      groupFinancialResult,
      meetingsResult,
      activitiesResult,
      plansResult,
      assetsResult
    ] = results;


    /* =====================================================
       GROUP FINANCIAL HEALTH GATE
       ===================================================== */

    /*
     * Financial health is rendered only when all required
     * source contracts are available:
     *
     *   A. group read data
     *   B. canonical monthly accounting
     *   C. monthly financial summary
     *
     * There is NO fallback to raw contribution aggregation.
     */
    if (
      groupDataResult.status ===
        "fulfilled" &&

      groupAccountingResult.status ===
        "fulfilled" &&

      groupFinancialResult.status ===
        "fulfilled"
    ) {
      renderGroupFinancialHealth(
        groupMonthlyAccountingSummary
      );

      renderRecentGroupContributions();
      renderRecentGroupExpenses();

    } else {
      console.warn(
        "Member dashboard group financial data failed:",
        {
          groupData:
            groupDataResult.status ===
            "rejected"
              ? groupDataResult.reason
              : null,

          groupAccounting:
            groupAccountingResult.status ===
            "rejected"
              ? groupAccountingResult.reason
              : null,

          groupFinancial:
            groupFinancialResult.status ===
            "rejected"
              ? groupFinancialResult.reason
              : null
        }
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
        byId(
          "memberRecentContributions"
        );

      if (contributionContainer) {
        contributionContainer.innerHTML =
          "<p>Group contribution data could not be loaded.</p>";
      }

      const expenseContainer =
        byId(
          "memberRecentExpenses"
        );

      if (expenseContainer) {
        expenseContainer.innerHTML =
          "<p>Group expense data could not be loaded.</p>";
      }
    }


    /* =====================================================
       FAILURE REPORTING
       ===================================================== */

    const failures =
      results.filter(
        result =>
          result.status ===
          "rejected"
      );

    if (failures.length) {
      console.warn(
        "Some member dashboard sections failed to load:",
        failures.map(
          failure =>
            failure.reason
        )
      );
    }


    /*
     * The dashboard should fail completely only when every
     * requested section failed.
     */
    if (
      failures.length ===
      results.length
    ) {
      throw new Error(
        "The member dashboard could not load its data."
      );
    }


    /*
     * Explicit references retained for readability and
     * future debugging of individual section results.
     */
    void currentUser;
    void myPositionResult;
    void myActivityResult;
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
   ---------------------------------------------------------
   member-layout.js remains the owner of:
     • authentication
     • context resolution
     • navigation
     • logout

   Expected call:

       initMemberDashboard(context)

   where context contains:
     {
       user,
       member,
       group
     }
   ========================================================= */

export async function initMemberDashboard(
  context
) {
  if (initialized) {
    return;
  }

  if (!context) {
    throw new Error(
      "Member application context was not provided."
    );
  }

  currentUser =
    context.user ||
    null;

  currentMember =
    context.member ||
    null;

  currentGroup =
    context.group ||
    null;

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

  initialized = true;

  await loadDashboard();
}


console.log(
  "CHAMA LIVE member-dashboard.js loaded."
);
