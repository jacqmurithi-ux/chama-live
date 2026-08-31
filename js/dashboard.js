/* =========================================================
   CHAMA LIVE — DASHBOARD
   COMPLETE CORRECTED + GROUP-SCOPED VERSION

   IMPORTANT DATABASE RULES
   ---------------------------------------------------------
   members.name              -> member display name
   members.id                -> member identity
   members.group_id          -> group scope

   contributions.member_id   -> member who made payment
   contributions.amount      -> payment amount
   contributions.group_id    -> group scope
   contributions.contribution_date -> payment date

   ACCOUNTING
   ---------------------------------------------------------
   Monthly recurring contribution:

       Monthly Due
       - Previous Outstanding
       - Current Month Applied
       + Carry Forward
       = Current Outstanding

   Payment allocation order:

       1. Previous arrears
       2. Current month's obligation
       3. Remaining amount becomes credit

   Dashboard is READ-ONLY.
   No database records are modified here.

   Required export:
       initDashboard()
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";


console.log(
  "CHAMA LIVE: dashboard.js loaded"
);


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let currentGroupId = null;

let members = [];
let contributions = [];
let expenses = [];
let meetings = [];

let monthlyStatus = [];

let initialized = false;


/* =========================================================
   DOM HELPERS
========================================================= */

function el(id) {

  return document.getElementById(id);

}


function setText(id, value) {

  const element = el(id);

  if (!element) {
    return;
  }

  element.textContent =
    value ?? "—";

}


/* =========================================================
   MONEY
========================================================= */

function money(value) {

  const amount =
    Number(value || 0);

  return (
    "KSh " +
    amount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }
    )
  );

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


/* =========================================================
   STATUS
========================================================= */

function showStatus(message) {

  const element =
    el("status");

  if (!element) {
    return;
  }

  element.hidden =
    !message;

  element.textContent =
    message || "";

}


function showError(error) {

  console.error(
    "CHAMA LIVE: Dashboard error",
    error
  );

  const message =
    error?.message ||
    String(error) ||
    "Dashboard could not be loaded.";

  const errorElement =
    el("error");

  if (errorElement) {

    errorElement.hidden =
      false;

    errorElement.textContent =
      message;

  }

  /*
     Some versions of the dashboard only have
     a status element and no dedicated error box.
  */

  const statusElement =
    el("status");

  if (
    statusElement &&
    !errorElement
  ) {

    statusElement.hidden =
      false;

    statusElement.textContent =
      message;

  }

}


function clearError() {

  const errorElement =
    el("error");

  if (errorElement) {

    errorElement.hidden =
      true;

    errorElement.textContent =
      "";

  }

}


/* =========================================================
   DATE HELPERS
========================================================= */

function normalizeDate(value) {

  if (!value) {
    return "";
  }

  return String(value)
    .substring(0, 10);

}


function getToday() {

  const date =
    new Date();

  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1
    ).padStart(2, "0"),

    String(
      date.getDate()
    ).padStart(2, "0")

  ].join("-");

}


function getCurrentMonth() {

  return getToday()
    .substring(0, 7);

}


function monthStart(month) {

  return `${month}-01`;

}


function monthEnd(month) {

  const [year, monthNumber] =
    month.split("-").map(Number);

  const lastDay =
    new Date(
      year,
      monthNumber,
      0
    );

  return [
    lastDay.getFullYear(),

    String(
      lastDay.getMonth() + 1
    ).padStart(2, "0"),

    String(
      lastDay.getDate()
    ).padStart(2, "0")

  ].join("-");

}


function formatDate(value) {

  const dateValue =
    normalizeDate(value);

  if (!dateValue) {
    return "—";
  }

  const date =
    new Date(
      `${dateValue}T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return dateValue;
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


function formatMonth(month) {

  if (!month) {
    return "—";
  }

  const date =
    new Date(
      `${month}-01T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return month;
  }

  return date.toLocaleDateString(
    "en-KE",
    {
      year: "numeric",
      month: "long"
    }
  );

}


/* =========================================================
   GROUP CONTEXT
========================================================= */

async function loadContext() {

  currentUser =
    await requireAuth();

  if (!currentUser) {

    throw new Error(
      "You are not signed in."
    );

  }


  currentMember =
    await getMyMember();

  if (!currentMember) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  if (!currentMember.id) {

    throw new Error(
      "Your member record has no member ID."
    );

  }


  if (!currentMember.group_id) {

    throw new Error(
      "Your member record is not linked to a group."
    );

  }


  currentGroupId =
    currentMember.group_id;


  currentGroup =
    await getMyGroup();


  if (!currentGroup) {

    throw new Error(
      "Group information could not be found."
    );

  }


  if (
    String(currentGroup.id) !==
    String(currentGroupId)
  ) {

    throw new Error(
      "Current group context could not be verified."
    );

  }


  renderContext();

}


function renderContext() {

  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(element => {

      element.textContent =
        currentGroup?.name ||
        "CHAMA";

    });


  document
    .querySelectorAll(
      "[data-user-name]"
    )
    .forEach(element => {

      element.textContent =
        currentMember?.name ||
        "Member";

    });

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

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
        phone,
        email,
        role,
        join_date,
        status,
        onboarding_status,
        created_at
      `)
      .eq(
        "group_id",
        currentGroupId
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


  members =
    data || [];

}


/* =========================================================
   LOAD CONTRIBUTIONS
========================================================= */

async function loadContributions() {

  const {
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select(`
        id,
        group_id,
        member_id,
        amount,
        contribution_type,
        month,
        payment_method,
        reference,
        recorded_by,
        contribution_date,
        notes,
        created_at
      `)
      .eq(
        "group_id",
        currentGroupId
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


  contributions =
    data || [];

}


/* =========================================================
   LOAD EXPENSES
========================================================= */

async function loadExpenses() {

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
        category,
        amount,
        date,
        recorded_by,
        approval_status,
        receipt_url,
        created_at
      `)
      .eq(
        "group_id",
        currentGroupId
      )
      .order(
        "date",
        {
          ascending: false
        }
      );


  if (error) {
    throw error;
  }


  expenses =
    data || [];

}


/* =========================================================
   LOAD MEETINGS
========================================================= */

async function loadMeetings() {

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
        date,
        venue,
        agenda,
        minutes,
        resolution,
        status,
        created_at
      `)
      .eq(
        "group_id",
        currentGroupId
      )
      .order(
        "date",
        {
          ascending: true
        }
      );


  if (error) {
    throw error;
  }


  meetings =
    data || [];

}


/* =========================================================
   LOAD DATA
========================================================= */

async function loadData() {

  showStatus(
    "Loading dashboard..."
  );


  await Promise.all([
    loadMembers(),
    loadContributions(),
    loadExpenses(),
    loadMeetings()
  ]);


  /*
     Monthly accounting is calculated locally from
     the existing ledger records.

     This prevents the dashboard from showing zero
     simply because an optional accounting RPC has
     a different schema/version.
  */

  calculateMonthlyStatus();


  clearError();

}


/* =========================================================
   MEMBER NAME
========================================================= */

function memberName(memberId) {

  if (!memberId) {
    return "—";
  }


  const member =
    members.find(
      item =>
        String(item.id) ===
        String(memberId)
    );


  return (
    member?.name ||
    "Unknown member"
  );

}


/* =========================================================
   ACTIVE MEMBER CHECK
========================================================= */

function isActiveMember(member) {

  const status =
    String(
      member?.status || ""
    )
      .trim()
      .toLowerCase();


  /*
     Treat normal active records as active.

     If status is missing, the member is still
     considered active unless onboarding explicitly
     says otherwise.
  */

  if (
    status === "inactive" ||
    status === "suspended" ||
    status === "removed" ||
    status === "pending"
  ) {

    return false;

  }


  const onboarding =
    String(
      member?.onboarding_status || ""
    )
      .trim()
      .toLowerCase();


  if (
    onboarding === "pending" ||
    onboarding === "invited"
  ) {

    return false;

  }


  return true;

}


/* =========================================================
   MONTHLY RATE
========================================================= */

function getMonthlyRate() {

  /*
     Prefer the group's configured monthly rate.

     Different versions of CHAMA LIVE may use
     different column names, so we check known
     fields without making a database query for
     nonexistent columns.
  */

  const candidates = [
    currentGroup?.monthly_contribution,
    currentGroup?.monthly_contribution_amount,
    currentGroup?.monthly_rate,
    currentGroup?.monthly_due,
    currentGroup?.contribution_amount,
    currentGroup?.monthly_amount
  ];


  for (const value of candidates) {

    const amount =
      Number(value);

    if (
      Number.isFinite(amount) &&
      amount > 0
    ) {

      return amount;

    }

  }


  /*
     If the group does not expose the rate,
     derive it from active member monthly obligations
     if the obligation table/RPC is not needed here.

     Existing CHAMA LIVE configuration has been using
     KES 200 as the recurring monthly amount.
  */

  return 200;

}


/* =========================================================
   CONTRIBUTION TYPE
========================================================= */

function isMonthlyContribution(row) {

  const type =
    String(
      row?.contribution_type || ""
    )
      .trim()
      .toLowerCase();


  return (
    type === "monthly" ||
    type === "monthly contribution" ||
    type === "recurring monthly contribution"
  );

}


/* =========================================================
   CONTRIBUTION MONTH
========================================================= */

function contributionMonth(row) {

  /*
     Prefer explicit month when it contains a
     recognizable YYYY-MM value.
  */

  if (row?.month) {

    const month =
      String(row.month)
        .substring(0, 7);

    if (
      /^\d{4}-\d{2}$/.test(month)
    ) {

      return month;

    }

  }


  return normalizeDate(
    row?.contribution_date
  ).substring(0, 7);

}


/* =========================================================
   MONTHLY CONTRIBUTIONS FOR MEMBER
========================================================= */

function getMemberMonthlyPayments(
  memberId,
  month
) {

  return contributions
    .filter(row => {

      if (
        String(row.member_id) !==
        String(memberId)
      ) {

        return false;

      }


      if (
        !isMonthlyContribution(row)
      ) {

        return false;

      }


      return (
        contributionMonth(row) <=
        month
      );

    })
    .sort(
      (a, b) =>
        normalizeDate(
          a.contribution_date
        )
        .localeCompare(
          normalizeDate(
            b.contribution_date
          )
        )
    );

}


/* =========================================================
   CALCULATE MEMBER MONTHLY ACCOUNTING
========================================================= */

function calculateMemberMonthlyAccounting(
  member,
  targetMonth,
  monthlyDue
) {

  const memberPayments =
    getMemberMonthlyPayments(
      member.id,
      targetMonth
    );


  /*
     We calculate month by month.

     This allows old underpayments to become
     previous outstanding and excess payments
     to become carry-forward credit.
  */

  const firstPaymentMonth =
    memberPayments.length
      ? contributionMonth(
          memberPayments[0]
        )
      : targetMonth;


  const startDate =
    new Date(
      `${firstPaymentMonth}-01T00:00:00`
    );


  const targetDate =
    new Date(
      `${targetMonth}-01T00:00:00`
    );


  let year =
    startDate.getFullYear();

  let monthIndex =
    startDate.getMonth();


  let previousOutstanding = 0;
  let carryForward = 0;
  let targetApplied = 0;
  let targetCurrentOutstanding = monthlyDue;


  /*
     If there are no payments before or during the
     target month, we only need the target obligation.
  */

  if (!memberPayments.length) {

    return {

      memberId:
        member.id,

      memberName:
        member.name,

      monthlyDue,

      previousOutstanding:
        0,

      appliedThisMonth:
        0,

      carryForward:
        0,

      currentOutstanding:
        monthlyDue,

      status:
        "Outstanding"

    };

  }


  while (
    year < targetDate.getFullYear() ||
    (
      year === targetDate.getFullYear() &&
      monthIndex <= targetDate.getMonth()
    )
  ) {

    const processingMonth =
      [
        year,
        String(
          monthIndex + 1
        ).padStart(2, "0")
      ].join("-");


    const paymentsForMonth =
      memberPayments.filter(
        row =>
          contributionMonth(row) ===
          processingMonth
      );


    const paymentAmount =
      paymentsForMonth.reduce(
        (sum, row) =>
          sum +
          Number(row.amount || 0),
        0
      );


    const obligation =
      monthlyDue;


    /*
       Amount available includes previous
       carry-forward credit plus this month's
       payment.
    */

    let available =
      carryForward +
      paymentAmount;


    /*
       1. Clear previous outstanding.
    */

    const arrearsPaid =
      Math.min(
        available,
        previousOutstanding
      );


    available -=
      arrearsPaid;

    previousOutstanding -=
      arrearsPaid;


    /*
       2. Apply to current obligation.
    */

    const applied =
      Math.min(
        available,
        obligation
      );


    available -=
      applied;


    /*
       3. Remaining amount becomes carry-forward.
    */

    carryForward =
      available;


    const currentOutstanding =
      Math.max(
        0,
        obligation - applied
      );


    /*
       For the target month, preserve exact
       dashboard values.
    */

    if (
      processingMonth ===
      targetMonth
    ) {

      targetApplied =
        applied;

      targetCurrentOutstanding =
        currentOutstanding;

    }


    /*
       At month end, an unpaid obligation becomes
       previous outstanding for the next month.

       Existing carry-forward remains available.
    */

    previousOutstanding =
      currentOutstanding;


    /*
       Move to next month.
    */

    monthIndex += 1;


    if (
      monthIndex > 11
    ) {

      monthIndex = 0;
      year += 1;

    }

  }


  let status =
    "Outstanding";


  if (
    targetCurrentOutstanding <= 0 &&
    carryForward > 0
  ) {

    status =
      "Credit";

  }
  else if (
    targetCurrentOutstanding <= 0
  ) {

    status =
      "Paid";

  }
  else if (
    targetApplied > 0
  ) {

    status =
      "Partial";

  }


  return {

    memberId:
      member.id,

    memberName:
      member.name,

    monthlyDue,

    previousOutstanding:
      0,

    appliedThisMonth:
      targetApplied,

    carryForward,

    currentOutstanding:
      targetCurrentOutstanding,

    status

  };

}


/* =========================================================
   CANONICAL MONTHLY STATUS
========================================================= */

function calculateMonthlyStatus() {

  const month =
    getCurrentMonth();


  const monthlyDue =
    getMonthlyRate();


  const activeMembers =
    members.filter(
      isActiveMember
    );


  monthlyStatus =
    activeMembers.map(
      member =>
        calculateMemberMonthlyAccounting(
          member,
          month,
          monthlyDue
        )
    );


  return monthlyStatus;

}


/* =========================================================
   DASHBOARD CONTRIBUTION SUMMARY
========================================================= */

function getMonthlySummary() {

  const month =
    getCurrentMonth();


  const monthlyDue =
    getMonthlyRate();


  const activeMembers =
    members.filter(
      isActiveMember
    );


  /*
     Current month payments.

     IMPORTANT:
     This is actual money received during the
     current month, not carry-forward credit.
  */

  const currentMonthPayments =
    contributions.filter(row => {

      if (
        !isMonthlyContribution(row)
      ) {

        return false;

      }


      return (
        contributionMonth(row) ===
        month
      );

    });


  const actualCurrentMonthCash =
    currentMonthPayments.reduce(
      (sum, row) =>
        sum +
        Number(row.amount || 0),
      0
    );


  /*
     Current-month applied amount comes from the
     accounting result.

     Carry-forward is deliberately excluded.
  */

  const appliedThisMonth =
    monthlyStatus.reduce(
      (sum, row) =>
        sum +
        Number(
          row.appliedThisMonth || 0
        ),
      0
    );


  const carryForwardCredit =
    monthlyStatus.reduce(
      (sum, row) =>
        sum +
        Number(
          row.carryForward || 0
        ),
      0
    );


  const currentOutstanding =
    monthlyStatus.reduce(
      (sum, row) =>
        sum +
        Number(
          row.currentOutstanding || 0
        ),
      0
    );


  const expected =
    activeMembers.length *
    monthlyDue;


  const membersContributed =
    monthlyStatus.filter(
      row =>
        Number(
          row.appliedThisMonth || 0
        ) > 0
    ).length;


  const participation =
    activeMembers.length > 0
      ? (
          membersContributed /
          activeMembers.length
        ) * 100
      : 0;


  const collectionRate =
    expected > 0
      ? (
          appliedThisMonth /
          expected
        ) * 100
      : 0;


  return {

    month,

    monthlyDue,

    activeMembers:
      activeMembers.length,

    expected,

    actualCurrentMonthCash,

    appliedThisMonth,

    carryForwardCredit,

    currentOutstanding,

    membersContributed,

    participation,

    collectionRate

  };

}


/* =========================================================
   BALANCE
========================================================= */

function getGroupBalance() {

  /*
     Current group balance:

       Opening balance
       + all contributions
       - approved expenses

     Pending expenses do NOT reduce cash balance.
  */

  const openingBalance =
    Number(
      currentGroup?.opening_balance || 0
    );


  const totalContributions =
    contributions.reduce(
      (sum, row) =>
        sum +
        Number(row.amount || 0),
      0
    );


  const approvedExpenses =
    expenses
      .filter(
        row =>
          String(
            row.approval_status || ""
          )
            .trim()
            .toLowerCase() ===
          "approved"
      )
      .reduce(
        (sum, row) =>
          sum +
          Number(row.amount || 0),
        0
      );


  return (
    openingBalance +
    totalContributions -
    approvedExpenses
  );

}


/* =========================================================
   RENDER MAIN SUMMARY
========================================================= */

function renderSummary() {

  const summary =
    getMonthlySummary();


  const balance =
    getGroupBalance();


  setText(
    "activeMembers",
    summary.activeMembers
  );


  setText(
    "totalMembers",
    `${members.length} total members`
  );


  setText(
    "monthlyExpected",
    money(summary.expected)
  );


  setText(
    "monthlyApplied",
    money(summary.appliedThisMonth)
  );


  setText(
    "currentBalance",
    money(balance)
  );


  /*
     Current month label.
  */

  const currentMonthLabel =
    el("currentMonth");

  if (currentMonthLabel) {

    currentMonthLabel.textContent =
      formatMonth(summary.month);

  }


  /*
     Contribution progress.
  */

  const percentage =
    Math.max(
      0,
      Math.min(
        summary.collectionRate,
        100
      )
    );


  setText(
    "collectionRate",
    `${Math.round(
      percentage
    )}%`
  );


  setText(
    "monthlyCollected",
    `${money(
      summary.appliedThisMonth
    )} / ${money(
      summary.expected
    )}`
  );


  setText(
    "membersContributed",
    `${summary.membersContributed} / ${summary.activeMembers}`
  );


  setText(
    "memberParticipation",
    `${Math.round(
      summary.participation
    )}%`
  );


  setText(
    "currentOutstanding",
    money(
      summary.currentOutstanding
    )
  );


  setText(
    "appliedThisMonth",
    money(
      summary.appliedThisMonth
    )
  );


  setText(
    "carryForwardCredit",
    money(
      summary.carryForwardCredit
    )
  );


  setText(
    "outstandingAmount",
    money(
      summary.currentOutstanding
    )
  );


  /*
     Progress bars.
  */

  document
    .querySelectorAll(
      "[data-contribution-progress]"
    )
    .forEach(element => {

      element.style.width =
        `${percentage}%`;

    });


  /*
     Balance styling.
  */

  const balanceElement =
    el("currentBalance");

  if (balanceElement) {

    balanceElement.classList.remove(
      "positive",
      "negative",
      "amount-positive",
      "amount-negative"
    );


    if (balance < 0) {

      balanceElement.classList.add(
        "negative"
      );

      balanceElement.classList.add(
        "amount-negative"
      );

    }
    else {

      balanceElement.classList.add(
        "positive"
      );

      balanceElement.classList.add(
        "amount-positive"
      );

    }

  }

}


/* =========================================================
   RENDER MEMBER STATUS
========================================================= */

function renderMemberStatus() {

  const container =
    el("contributionStatusRows");


  if (!container) {
    return;
  }


  if (!monthlyStatus.length) {

    container.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <strong>No active members</strong>
            <span>
              No active members were found for this group.
            </span>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  container.innerHTML =
    monthlyStatus
      .map(row => {

        let statusClass =
          String(
            row.status || ""
          )
            .toLowerCase()
            .replace(
              /\s+/g,
              "-"
            );


        return `
          <tr>

            <td>
              <strong>
                ${escapeHtml(
                  row.memberName
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                money(
                  row.monthlyDue
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                money(
                  row.previousOutstanding
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                money(
                  row.appliedThisMonth
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                money(
                  row.carryForward
                )
              )}
            </td>

            <td>
              <strong>
                ${escapeHtml(
                  money(
                    row.currentOutstanding
                  )
                )}
              </strong>
            </td>

            <td>
              <span
                class="status-badge status-${escapeHtml(
                  statusClass
                )}"
              >
                ${escapeHtml(
                  row.status
                )}
              </span>
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   RECENT CONTRIBUTIONS
========================================================= */

function renderRecentContributions() {

  const container =
    el(
      "recentContributionRows"
    );


  if (!container) {
    return;
  }


  const rows =
    contributions
      .slice()
      .sort(
        (a, b) =>
          normalizeDate(
            b.contribution_date
          )
          .localeCompare(
            normalizeDate(
              a.contribution_date
            )
          )
      )
      .slice(0, 5);


  if (!rows.length) {

    container.innerHTML = `
      <tr>
        <td colspan="3">
          <div class="empty-state">
            <strong>No contributions yet</strong>
            <span>
              Recent contributions will appear here.
            </span>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  container.innerHTML =
    rows
      .map(row => {

        return `
          <tr>

            <td>
              <strong>
                ${escapeHtml(
                  memberName(
                    row.member_id
                  )
                )}
              </strong>
            </td>

            <td>
              <strong class="money-value">
                ${escapeHtml(
                  money(row.amount)
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                formatDate(
                  row.contribution_date
                )
              )}
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   EXPENSE STATUS
========================================================= */

function normalizeExpenseStatus(
  expense
) {

  return String(
    expense?.approval_status || ""
  )
    .trim()
    .toLowerCase();

}


/* =========================================================
   RECENT EXPENSES
========================================================= */

function renderRecentExpenses() {

  const container =
    el(
      "recentExpenseRows"
    );


  if (!container) {
    return;
  }


  const rows =
    expenses
      .slice()
      .sort(
        (a, b) =>
          normalizeDate(
            b.date
          )
          .localeCompare(
            normalizeDate(
              a.date
            )
          )
      )
      .slice(0, 5);


  if (!rows.length) {

    container.innerHTML = `
      <tr>
        <td colspan="3">
          <div class="empty-state">
            <strong>No expenses yet</strong>
            <span>
              Recent expenses will appear here.
            </span>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  container.innerHTML =
    rows
      .map(row => {

        return `
          <tr>

            <td>
              <strong>
                ${escapeHtml(
                  row.description ||
                  "Expense"
                )}
              </strong>
            </td>

            <td>
              <strong class="money-value">
                ${escapeHtml(
                  money(row.amount)
                )}
              </strong>
            </td>

            <td>
              <span
                class="status-badge status-${escapeHtml(
                  normalizeExpenseStatus(row) ||
                  "unknown"
                )}"
              >
                ${escapeHtml(
                  row.approval_status ||
                  "Unknown"
                )}
              </span>
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   UPCOMING MEETINGS
========================================================= */

function renderUpcomingMeetings() {

  const container =
    el(
      "upcomingMeetingRows"
    );


  if (!container) {
    return;
  }


  const today =
    getToday();


  const rows =
    meetings
      .filter(
        meeting =>
          normalizeDate(
            meeting.date
          ) >= today
      )
      .sort(
        (a, b) =>
          normalizeDate(
            a.date
          )
          .localeCompare(
            normalizeDate(
              b.date
            )
          )
      )
      .slice(0, 5);


  if (!rows.length) {

    container.innerHTML = `
      <tr>
        <td colspan="4">
          <div class="empty-state">
            <strong>No upcoming meetings.</strong>
            <span>
              Scheduled meetings will appear here.
            </span>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  container.innerHTML =
    rows
      .map(row => {

        return `
          <tr>

            <td>
              ${escapeHtml(
                formatDate(
                  row.date
                )
              )}
            </td>

            <td>
              <strong>
                ${escapeHtml(
                  row.title ||
                  "Meeting"
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                row.venue ||
                "—"
              )}
            </td>

            <td>
              <span class="status-badge">
                ${escapeHtml(
                  row.status ||
                  "Upcoming"
                )}
              </span>
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   FALLBACK SELECTORS
========================================================= */

function renderUsingFallbackIds() {

  /*
     Some versions of dashboard.html use slightly
     different IDs.

     These updates allow the same dashboard.js to
     work with both layouts.
  */

  const summary =
    getMonthlySummary();


  const balance =
    getGroupBalance();


  const idMap = {

    activeMembers:
      summary.activeMembers,

    monthlyExpected:
      money(summary.expected),

    monthlyApplied:
      money(summary.appliedThisMonth),

    currentBalance:
      money(balance),

    collectionRate:
      `${Math.round(
        summary.collectionRate
      )}%`,

    monthlyCollected:
      `${money(
        summary.appliedThisMonth
      )} / ${money(
        summary.expected
      )}`,

    membersContributed:
      `${summary.membersContributed} / ${summary.activeMembers}`,

    memberParticipation:
      `${Math.round(
        summary.participation
      )}%`,

    currentOutstanding:
      money(
        summary.currentOutstanding
      ),

    appliedThisMonth:
      money(
        summary.appliedThisMonth
      ),

    carryForwardCredit:
      money(
        summary.carryForwardCredit
      ),

    outstandingAmount:
      money(
        summary.currentOutstanding
      )

  };


  Object.entries(
    idMap
  ).forEach(
    ([id, value]) =>
      setText(
        id,
        value
      )
  );

}


/* =========================================================
   RENDER DASHBOARD
========================================================= */

function renderDashboard() {

  renderSummary();

  renderMemberStatus();

  renderRecentContributions();

  renderRecentExpenses();

  renderUpcomingMeetings();

  renderUsingFallbackIds();

}


/* =========================================================
   INITIALIZATION
========================================================= */

export async function initDashboard() {

  if (initialized) {
    return;
  }


  initialized =
    true;


  try {

    clearError();

    showStatus(
      "Loading dashboard..."
    );


    await loadContext();

    await loadData();

    renderDashboard();


    showStatus(
      "Dashboard loaded."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      1500
    );


    console.log(
      "CHAMA LIVE: Dashboard initialized",
      {
        userId:
          currentUser?.id,

        memberId:
          currentMember?.id,

        groupId:
          currentGroupId,

        groupName:
          currentGroup?.name,

        members:
          members.length,

        contributions:
          contributions.length,

        expenses:
          expenses.length,

        meetings:
          meetings.length,

        monthlyStatus:
          monthlyStatus.length
      }
    );

  }
  catch (error) {

    initialized =
      false;

    showError(
      error
    );

  }

}


/* =========================================================
   REFRESH
========================================================= */

export async function refreshDashboard() {

  try {

    clearError();


    if (!currentGroupId) {

      await loadContext();

    }


    await loadData();

    renderDashboard();


    showStatus(
      "Dashboard refreshed."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      1200
    );

  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =========================================================
   AUTO BOOT
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      initDashboard();

    },
    {
      once: true
    }
  );

}
else {

  initDashboard();

}


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: dashboard module ready"
);
