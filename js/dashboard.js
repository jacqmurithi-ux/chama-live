/* =========================================================
   CHAMA LIVE — DASHBOARD
   RECURRING MONTHLY CONTRIBUTION SYSTEM

   IMPORTANT BUSINESS RULES
   ---------------------------------------------------------
   1. Monthly contribution is recurring.
   2. Every active member has a monthly due.
   3. Payments first clear previous outstanding balances.
   4. After outstanding balances are cleared, payment is
      applied toward the current month's contribution.
   5. Any amount remaining becomes carry-forward credit.
   6. Carry-forward credit can satisfy future months.
   7. Dashboard "Monthly Collected" represents the amount
      actually allocated to the CURRENT month's contribution,
      not the total cash paid during the month.
   8. Member participation counts members whose current
      monthly contribution has received an allocation.
========================================================= */

import { supabase } from "./supabase.js";

import {
  getCurrentMember,
  getCurrentGroup,
  money
} from "./auth.js";


console.log(
  "CHAMA LIVE: dashboard.js loaded"
);


/* =========================================================
   STATE
========================================================= */

let currentMember = null;
let currentGroup = null;
let currentGroupId = null;

let initialized = false;


/* =========================================================
   HELPERS
========================================================= */

function byId(id) {

  return document.getElementById(id);

}


function setText(id, value) {

  const element =
    byId(id);

  if (element) {

    element.textContent =
      value ?? "—";

  }

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
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );

}


/* =========================================================
   ERROR
========================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE: dashboard error",
    error
  );


  const errorBox =
    byId("error");


  if (errorBox) {

    errorBox.hidden =
      false;

    errorBox.textContent =
      error?.message ||
      "Unable to load dashboard data.";

  }

}


/* =========================================================
   DATE HELPERS
========================================================= */

function getLocalDate() {

  const now =
    new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

}


function getMonthKey(date = getLocalDate()) {

  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(2, "0")
  ].join("-");

}


function getMonthStart() {

  const now =
    getLocalDate();

  return [
    now.getFullYear(),
    String(
      now.getMonth() + 1
    ).padStart(2, "0"),
    "01"
  ].join("-");

}


function getNextMonthStart() {

  const now =
    getLocalDate();


  const next =
    new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1
    );


  return [
    next.getFullYear(),
    String(
      next.getMonth() + 1
    ).padStart(2, "0"),
    "01"
  ].join("-");

}


/* =========================================================
   GROUP HEADER
========================================================= */

function renderGroup() {

  const groupName =
    currentGroup?.name ||
    "CHAMA";


  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(element => {

      element.textContent =
        groupName;

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
   MONTHLY CONTRIBUTION
========================================================= */

function getMonthlyExpectedPerMember() {

  const amount =
    Number(
      currentGroup?.monthly_contribution
    );


  if (
    Number.isFinite(amount) &&
    amount > 0
  ) {

    return amount;

  }


  return 0;

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
        member_number,
        membership_number,
        name,
        phone,
        email,
        role,
        status,
        join_date
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


  const members =
    data || [];


  const activeMembers =
    members.filter(
      member =>
        String(
          member.status || ""
        )
          .trim()
          .toLowerCase() ===
        "active"
    );


  setText(
    "activeMembers",
    activeMembers.length
  );


  setText(
    "membersCount",
    members.length
  );


  return members;

}


/* =========================================================
   LOAD ALL CONTRIBUTIONS
   Needed for calculating:
   - previous outstanding
   - carry-forward credit
   - current month allocation
========================================================= */

async function loadAllContributions() {

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
        contribution_date,
        contribution_type,
        month,
        payment_method,
        reference,
        mpesa_reference,
        created_at
      `)
      .eq(
        "group_id",
        currentGroupId
      )
      .order(
        "contribution_date",
        {
          ascending: true
        }
      )
      .order(
        "created_at",
        {
          ascending: true
        }
      );


  if (error) {

    /*
     * Compatibility fallback if an older
     * database does not have mpesa_reference.
     */

    if (
      String(
        error.message || ""
      )
        .toLowerCase()
        .includes(
          "mpesa_reference"
        )
    ) {

      const retry =
        await supabase
          .from("contributions")
          .select(`
            id,
            group_id,
            member_id,
            amount,
            contribution_date,
            contribution_type,
            month,
            payment_method,
            reference,
            created_at
          `)
          .eq(
            "group_id",
            currentGroupId
          )
          .order(
            "contribution_date",
            {
              ascending: true
            }
          )
          .order(
            "created_at",
            {
              ascending: true
            }
          );


      if (retry.error) {
        throw retry.error;
      }


      return retry.data || [];

    }


    throw error;

  }


  return data || [];

}


/* =========================================================
   NORMALIZE CONTRIBUTION MONTH
========================================================= */

function getContributionMonth(
  contribution
) {

  /*
   * Prefer the explicit month field.
   */

  if (
    contribution?.month
  ) {

    return String(
      contribution.month
    ).slice(0, 7);

  }


  /*
   * Fall back to contribution_date.
   */

  if (
    contribution?.contribution_date
  ) {

    return String(
      contribution.contribution_date
    ).slice(0, 7);

  }


  /*
   * Final fallback.
   */

  if (
    contribution?.created_at
  ) {

    return String(
      contribution.created_at
    ).slice(0, 7);

  }


  return "";

}


/* =========================================================
   MONTHLY RECURRING ALLOCATION ENGINE
========================================================= */

/*
 * This is the important part.
 *
 * It calculates the actual amount that should count
 * toward each month's recurring contribution.
 *
 * Example:
 *
 * Monthly due = 200
 *
 * Previous outstanding = 0
 * Previous credit = 0
 *
 * August payment = 600
 *
 * August allocation:
 * 200
 *
 * Carry forward:
 * 400
 *
 * Therefore August collection =
 * 200, NOT 600.
 */

function calculateMemberMonthlyState(
  memberId,
  contributions,
  targetMonth,
  monthlyDue
) {

  if (
    !memberId ||
    monthlyDue <= 0
  ) {

    return {
      previousOutstanding: 0,
      previousCredit: 0,
      currentPayment: 0,
      appliedToPrevious: 0,
      appliedThisMonth: 0,
      carryForward: 0,
      currentOutstanding: 0,
      totalCashPaid: 0
    };

  }


  /*
   * Convert YYYY-MM into a date-like
   * sortable numeric value.
   */

  const targetYear =
    Number(
      targetMonth.slice(0, 4)
    );

  const targetMonthNumber =
    Number(
      targetMonth.slice(5, 7)
    );


  /*
   * We need to know all previous months.
   */

  let credit = 0;

  let outstanding = 0;

  let currentPayment = 0;

  let currentApplied = 0;

  let currentCarryForward = 0;

  let totalCashPaid = 0;


  /*
   * Group contributions by month.
   */

  const monthlyPayments = {};


  contributions
    .filter(
      contribution =>
        contribution.member_id ===
        memberId
    )
    .forEach(
      contribution => {

        const month =
          getContributionMonth(
            contribution
          );


        if (!month) {
          return;
        }


        const amount =
          Number(
            contribution.amount || 0
          );


        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {

          return;

        }


        if (
          !monthlyPayments[month]
        ) {

          monthlyPayments[month] =
            0;

        }


        monthlyPayments[month] +=
          amount;


        totalCashPaid +=
          amount;

      }
    );


  /*
   * Build every month from the first
   * contribution month through target month.
   */

  const monthKeys =
    Object.keys(
      monthlyPayments
    );


  /*
   * If there are no payments at all,
   * there is nothing to process.
   */

  if (
    monthKeys.length === 0
  ) {

    return {
      previousOutstanding: monthlyDue,
      previousCredit: 0,
      currentPayment: 0,
      appliedToPrevious: 0,
      appliedThisMonth: 0,
      carryForward: 0,
      currentOutstanding: monthlyDue,
      totalCashPaid: 0
    };

  }


  let firstYear =
    targetYear;

  let firstMonth =
    targetMonthNumber;


  monthKeys.forEach(
    month => {

      const year =
        Number(
          month.slice(0, 4)
        );

      const monthNumber =
        Number(
          month.slice(5, 7)
        );


      if (
        year < firstYear ||
        (
          year === firstYear &&
          monthNumber < firstMonth
        )
      ) {

        firstYear =
          year;

        firstMonth =
          monthNumber;

      }

    }
  );


  /*
   * Start one month before the first
   * actual contribution.
   *
   * There is no historical debt known
   * before CHAMA LIVE started recording.
   */

  let year =
    firstYear;

  let month =
    firstMonth;


  const monthDifference =
    (
      targetYear * 12 +
      targetMonthNumber
    ) -
    (
      year * 12 +
      month
    );


  for (
    let index = 0;
    index <= monthDifference;
    index++
  ) {

    const key =
      `${year}-${String(month).padStart(2, "0")}`;


    const payment =
      Number(
        monthlyPayments[key] || 0
      );


    const isTarget =
      key === targetMonth;


    /*
     * -----------------------------------------------------
     * PREVIOUS BALANCE
     * -----------------------------------------------------
     *
     * outstanding = amount still owed
     * credit = overpayment available
     */

    const previousOutstanding =
      outstanding;

    const previousCredit =
      credit;


    /*
     * The current month's due is
     * added to the previous outstanding.
     *
     * BUT existing credit is applied
     * first.
     */

    let monthDue =
      monthlyDue;


    let creditUsed =
      Math.min(
        previousCredit,
        monthDue
      );


    monthDue -=
      creditUsed;


    let remainingCredit =
      Math.max(
        previousCredit -
        creditUsed,
        0
      );


    /*
     * Add any existing previous
     * outstanding to the current
     * month's obligation.
     *
     * Previous outstanding must be
     * cleared before current month.
     */

    let obligation =
      previousOutstanding +
      monthDue;


    /*
     * Payment for this month.
     */

    let remainingPayment =
      payment;


    /*
     * First clear previous outstanding.
     */

    const appliedToPrevious =
      Math.min(
        previousOutstanding,
        remainingPayment
      );


    remainingPayment -=
      appliedToPrevious;


    obligation =
      Math.max(
        obligation -
        appliedToPrevious,
        0
      );


    /*
     * Apply remaining payment
     * to current month's due.
     */

    const appliedToCurrent =
      Math.min(
        monthDue,
        remainingPayment
      );


    remainingPayment -=
      appliedToCurrent;


    /*
     * Anything remaining is credit.
     */

    const newCredit =
      remainingCredit +
      remainingPayment;


    /*
     * Calculate current outstanding.
     */

    const newOutstanding =
      Math.max(
        obligation -
        appliedToCurrent,
        0
      );


    /*
     * Save target month information.
     */

    if (isTarget) {

      currentPayment =
        payment;

      currentApplied =
        appliedToCurrent;

      currentCarryForward =
        newCredit;


      /*
       * Previous outstanding displayed
       * for the current month should be
       * the outstanding BEFORE the
       * current month's payment.
       */

      /*
       * If credit was available before
       * this month, it would have already
       * reduced the current obligation.
       *
       * For dashboard display we expose
       * the actual previous debt.
       */

      outstanding =
        newOutstanding;

      credit =
        newCredit;


      return;

    }


    /*
     * Move state forward.
     */

    outstanding =
      newOutstanding;

    credit =
      newCredit;


    /*
     * Move to next month.
     */

    month++;


    if (
      month > 12
    ) {

      month = 1;

      year++;

    }

  }


  /*
   * Previous outstanding for the target
   * month must be calculated separately.
   *
   * Recalculate history up to the month
   * immediately before target.
   */

  let historyOutstanding = 0;

  let historyCredit = 0;


  year =
    firstYear;

  month =
    firstMonth;


  const historyDifference =
    (
      targetYear * 12 +
      targetMonthNumber
    ) -
    (
      year * 12 +
      month
    );


  for (
    let index = 0;
    index < historyDifference;
    index++
  ) {

    const key =
      `${year}-${String(month).padStart(2, "0")}`;


    const payment =
      Number(
        monthlyPayments[key] || 0
      );


    /*
     * Existing credit first reduces
     * this month's due.
     */

    let monthDue =
      Math.max(
        monthlyDue -
        historyCredit,
        0
      );


    const creditUsed =
      Math.min(
        historyCredit,
        monthlyDue
      );


    let remainingPayment =
      payment;


    /*
     * Clear old outstanding.
     */

    const oldOutstanding =
      historyOutstanding;


    const appliedToOld =
      Math.min(
        oldOutstanding,
        remainingPayment
      );


    remainingPayment -=
      appliedToOld;


    /*
     * Current month allocation.
     */

    const appliedCurrent =
      Math.min(
        monthDue,
        remainingPayment
      );


    remainingPayment -=
      appliedCurrent;


    historyOutstanding =
      Math.max(
        oldOutstanding +
        monthDue -
        creditUsed -
        appliedToOld -
        appliedCurrent,
        0
      );


    historyCredit =
      Math.max(
        historyCredit -
        creditUsed +
        remainingPayment,
        0
      );


    month++;


    if (
      month > 12
    ) {

      month = 1;

      year++;

    }

  }


  /*
   * Current month payment allocation
   * needs to use the historical state.
   */

  const targetPayment =
    Number(
      monthlyPayments[targetMonth] || 0
    );


  const previousOutstanding =
    historyOutstanding;


  const previousCredit =
    historyCredit;


  /*
   * Current month due after previous
   * credit.
   */

  const currentDueAfterCredit =
    Math.max(
      monthlyDue -
      previousCredit,
      0
    );


  /*
   * Payment first clears previous debt.
   */

  const appliedToPrevious =
    Math.min(
      previousOutstanding,
      targetPayment
    );


  const afterPrevious =
    Math.max(
      targetPayment -
      appliedToPrevious,
      0
    );


  /*
   * Then it pays the current month.
   */

  const appliedThisMonth =
    Math.min(
      currentDueAfterCredit,
      afterPrevious
    );


  /*
   * Anything left is carry-forward.
   */

  const carryForward =
    Math.max(
      afterPrevious -
      appliedThisMonth,
      0
    );


  /*
   * Current outstanding.
   */

  const currentOutstanding =
    Math.max(
      previousOutstanding -
      appliedToPrevious +
      currentDueAfterCredit -
      appliedThisMonth,
      0
    );


  return {

    previousOutstanding,

    previousCredit,

    currentPayment:
      targetPayment,

    appliedToPrevious,

    appliedThisMonth,

    carryForward,

    currentOutstanding,

    totalCashPaid

  };

}


/* =========================================================
   CALCULATE ALL MEMBER STATES
========================================================= */

function calculateAllMemberStates(
  members,
  contributions
) {

  const monthlyDue =
    getMonthlyExpectedPerMember();


  const month =
    getMonthKey();


  const states = {};


  members
    .filter(
      member =>
        String(
          member.status || ""
        )
          .trim()
          .toLowerCase() ===
        "active"
    )
    .forEach(
      member => {

        states[member.id] =
          calculateMemberMonthlyState(
            member.id,
            contributions,
            month,
            monthlyDue
          );

      }
    );


  return states;

}


/* =========================================================
   CONTRIBUTION SUMMARY
========================================================= */

function renderContributionSummary(
  members,
  contributions
) {

  const monthlyDue =
    getMonthlyExpectedPerMember();


  const activeMembers =
    members.filter(
      member =>
        String(
          member.status || ""
        )
          .trim()
          .toLowerCase() ===
        "active"
    );


  const expected =
    monthlyDue *
    activeMembers.length;


  /*
   * Calculate actual monthly allocation.
   */

  const states =
    calculateAllMemberStates(
      members,
      contributions
    );


  let collected =
    0;


  let outstanding =
    0;


  let contributedMembers =
    0;


  activeMembers.forEach(
    member => {

      const state =
        states[member.id];


      const applied =
        Number(
          state?.appliedThisMonth || 0
        );


      const memberOutstanding =
        Number(
          state?.currentOutstanding || 0
        );


      collected +=
        applied;


      outstanding +=
        memberOutstanding;


      /*
       * A member counts as having
       * contributed if money has actually
       * been applied to this month's
       * recurring contribution.
       */

      if (
        applied > 0
      ) {

        contributedMembers++;

      }

    }
  );


  /*
   * IMPORTANT:
   *
   * Do NOT calculate outstanding as
   * expected - total cash received.
   *
   * Instead use the recurring allocation
   * engine above.
   */

  const percentage =
    expected > 0
      ? Math.min(
          100,
          Math.round(
            (
              collected /
              expected
            ) *
            100
          )
        )
      : 0;


  const participation =
    activeMembers.length > 0
      ? Math.round(
          (
            contributedMembers /
            activeMembers.length
          ) *
          100
        )
      : 0;


  /* =======================================================
     METRICS
  ======================================================= */

  setText(
    "monthlyExpected",
    money(expected)
  );


  setText(
    "monthlyCollected",
    money(collected)
  );


  setText(
    "monthlyOutstanding",
    money(outstanding)
  );


  /* =======================================================
     PROGRESS
  ======================================================= */

  setText(
    "progressPercentage",
    `${percentage}%`
  );


  setText(
    "progressText",
    `${money(collected)} / ${money(expected)}`
  );


  setText(
    "progressMonth",
    new Date().toLocaleDateString(
      "en-KE",
      {
        month: "long",
        year: "numeric"
      }
    )
  );


  const progressBar =
    byId("progressBar");


  if (progressBar) {

    progressBar.style.width =
      `${percentage}%`;

  }


  /* =======================================================
     MEMBER PARTICIPATION
  ======================================================= */

  setText(
    "membersContributed",
    `${contributedMembers} / ${activeMembers.length}`
  );


  setText(
    "memberParticipation",
    `${participation}%`
  );


  return {

    expected,

    collected,

    outstanding,

    percentage,

    contributedMembers,

    activeMembers:
      activeMembers.length,

    participation,

    states

  };

}


/* =========================================================
   MEMBER PAYMENT STATUS
========================================================= */

function renderMemberPaymentStatus(
  members,
  contributions
) {

  const rows =
    byId(
      "memberStatusRows"
    );


  if (!rows) {
    return;
  }


  const activeMembers =
    members.filter(
      member =>
        String(
          member.status || ""
        )
          .trim()
          .toLowerCase() ===
        "active"
    );


  const monthlyDue =
    getMonthlyExpectedPerMember();


  if (
    activeMembers.length === 0
  ) {

    rows.innerHTML = `
      <tr>
        <td colspan="5">
          No active members found.
        </td>
      </tr>
    `;

    return;

  }


  const states =
    calculateAllMemberStates(
      members,
      contributions
    );


  rows.innerHTML =
    activeMembers
      .map(
        member => {

          const state =
            states[member.id] ||
            {
              appliedThisMonth: 0,
              currentOutstanding:
                monthlyDue
            };


          const applied =
            Number(
              state.appliedThisMonth || 0
            );


          const outstanding =
            Number(
              state.currentOutstanding || 0
            );


          let status =
            "Pending";


          if (
            monthlyDue <= 0
          ) {

            status =
              applied > 0
                ? "Paid"
                : "No amount set";

          }
          else if (
            outstanding <= 0
          ) {

            status =
              "Cleared";

          }
          else if (
            applied > 0
          ) {

            status =
              "Partial";

          }


          return `
            <tr>

              <td>
                ${escapeHtml(
                  member.name ||
                  "Member"
                )}
              </td>

              <td>
                ${money(
                  monthlyDue
                )}
              </td>

              <td>
                ${money(
                  applied
                )}
              </td>

              <td>
                ${money(
                  outstanding
                )}
              </td>

              <td>
                ${escapeHtml(
                  status
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   RECENT CONTRIBUTIONS
========================================================= */

async function renderRecentContributions() {

  const rows =
    byId(
      "recentContributionRows"
    );


  if (!rows) {
    return;
  }


  const {
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select(`
        amount,
        contribution_date,
        member_id
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
    data || [];


  if (
    contributions.length === 0
  ) {

    rows.innerHTML = `
      <tr>
        <td colspan="3">
          No contributions recorded yet.
        </td>
      </tr>
    `;

    return;

  }


  const memberIds =
    [
      ...new Set(
        contributions
          .map(
            row =>
              row.member_id
          )
          .filter(Boolean)
      )
    ];


  const membersById = {};


  if (
    memberIds.length > 0
  ) {

    const memberResult =
      await supabase
        .from("members")
        .select(
          "id,name"
        )
        .in(
          "id",
          memberIds
        );


    if (
      !memberResult.error
    ) {

      (
        memberResult.data ||
        []
      )
        .forEach(
          member => {

            membersById[
              member.id
            ] =
              member.name;

          }
        );

    }

  }


  rows.innerHTML =
    contributions
      .map(
        contribution => {

          const memberName =
            membersById[
              contribution.member_id
            ] ||
            "Member";


          return `
            <tr>

              <td>
                ${escapeHtml(
                  memberName
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
                    contribution.contribution_date
                  )
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   RECENT EXPENSES
========================================================= */

async function renderRecentExpenses() {

  const rows =
    byId(
      "recentExpenseRows"
    );


  if (!rows) {
    return;
  }


  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .select(`
        description,
        amount,
        approval_status,
        date
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
      )
      .limit(5);


  if (error) {
    throw error;
  }


  const expenses =
    data || [];


  if (
    expenses.length === 0
  ) {

    rows.innerHTML = `
      <tr>
        <td colspan="3">
          No expenses recorded yet.
        </td>
      </tr>
    `;

    return;

  }


  rows.innerHTML =
    expenses
      .map(
        expense => {

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
                ${escapeHtml(
                  expense.approval_status ||
                  "Pending"
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   UPCOMING MEETINGS
========================================================= */

async function renderUpcomingMeetings() {

  const rows =
    byId(
      "upcomingMeetingRows"
    );


  if (!rows) {
    return;
  }


  const today =
    getMonthStart()
      .slice(0, 7) +
    "-" +
    String(
      getLocalDate().getDate()
    ).padStart(2, "0");


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
        currentGroupId
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
      .limit(5);


  if (error) {
    throw error;
  }


  const meetings =
    data || [];


  if (
    meetings.length === 0
  ) {

    rows.innerHTML = `
      <tr>
        <td colspan="4">
          No upcoming meetings.
        </td>
      </tr>
    `;

    return;

  }


  rows.innerHTML =
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
                ${escapeHtml(
                  meeting.status ||
                  "Upcoming"
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   CURRENT BALANCE
========================================================= */

async function loadBalance() {

  /*
   * TOTAL CONTRIBUTIONS
   */

  const contributionResult =
    await supabase
      .from("contributions")
      .select(
        "amount"
      )
      .eq(
        "group_id",
        currentGroupId
      );


  if (
    contributionResult.error
  ) {

    throw contributionResult.error;

  }


  const totalContributions =
    (
      contributionResult.data ||
      []
    )
      .reduce(
        (
          total,
          row
        ) =>
          total +
          Number(
            row.amount || 0
          ),
        0
      );


  /*
   * APPROVED EXPENSES
   */

  const expenseResult =
    await supabase
      .from("expenses")
      .select(`
        amount,
        approval_status
      `)
      .eq(
        "group_id",
        currentGroupId
      );


  if (
    expenseResult.error
  ) {

    console.warn(
      "CHAMA LIVE: expense balance query failed",
      expenseResult.error
    );


    setText(
      "currentBalance",
      money(
        totalContributions
      )
    );


    return totalContributions;

  }


  const approvedExpenses =
    (
      expenseResult.data ||
      []
    )
      .filter(
        expense =>
          String(
            expense.approval_status ||
            "pending"
          )
            .trim()
            .toLowerCase() ===
          "approved"
      )
      .reduce(
        (
          total,
          expense
        ) =>
          total +
          Number(
            expense.amount || 0
          ),
        0
      );


  const balance =
    totalContributions -
    approvedExpenses;


  setText(
    "currentBalance",
    money(balance)
  );


  return balance;

}


/* =========================================================
   MAIN DASHBOARD
========================================================= */

async function loadDashboard() {

  console.log(
    "CHAMA LIVE: loading dashboard data..."
  );


  /* -------------------------------------------------------
     MEMBER
  ------------------------------------------------------- */

  currentMember =
    await getCurrentMember();


  if (!currentMember) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  currentGroupId =
    currentMember.group_id;


  if (!currentGroupId) {

    throw new Error(
      "Your member record has no group."
    );

  }


  /* -------------------------------------------------------
     GROUP
  ------------------------------------------------------- */

  currentGroup =
    await getCurrentGroup();


  if (!currentGroup) {

    throw new Error(
      "Group information could not be found."
    );

  }


  renderGroup();


  /* -------------------------------------------------------
     MEMBERS
  ------------------------------------------------------- */

  const members =
    await loadMembers();


  /* -------------------------------------------------------
     ALL CONTRIBUTIONS
  ------------------------------------------------------- */

  const contributions =
    await loadAllContributions();


  /* -------------------------------------------------------
     CONTRIBUTION SUMMARY
  ------------------------------------------------------- */

  renderContributionSummary(
    members,
    contributions
  );


  /* -------------------------------------------------------
     MEMBER STATUS
  ------------------------------------------------------- */

  renderMemberPaymentStatus(
    members,
    contributions
  );


  /* -------------------------------------------------------
     RECENT ACTIVITY
  ------------------------------------------------------- */

  await renderRecentContributions();

  await renderRecentExpenses();

  await renderUpcomingMeetings();


  /* -------------------------------------------------------
     BALANCE
  ------------------------------------------------------- */

  await loadBalance();


  console.log(
    "CHAMA LIVE: dashboard data loaded successfully"
  );

}


/* =========================================================
   PUBLIC INITIALIZER
========================================================= */

export async function initDashboard() {

  if (initialized) {

    console.warn(
      "CHAMA LIVE: dashboard already initialized"
    );

    return;

  }


  initialized =
    true;


  const status =
    byId("status");


  if (status) {

    status.textContent =
      "Loading dashboard...";

  }


  try {

    await loadDashboard();


    if (status) {

      status.textContent =
        "Dashboard loaded.";

    }


    console.log(
      "CHAMA LIVE: dashboard initialized"
    );

  }
  catch (error) {

    initialized =
      false;


    if (status) {

      status.textContent =
        "Unable to load dashboard.";

    }


    showError(error);

  }

}


/* =========================================================
   COMPATIBILITY
========================================================= */

export const initPage =
  initDashboard;


console.log(
  "CHAMA LIVE: dashboard.js ready"
);
