/* =========================================================
   CHAMA LIVE — DASHBOARD
   RECURRING MONTHLY CONTRIBUTION SYSTEM

   BUSINESS RULES
   ---------------------------------------------------------
   1. Every active member has a recurring monthly due.
   2. Payments first clear previous outstanding balances.
   3. Remaining payment is applied to the current month.
   4. Any remaining amount becomes carry-forward credit.
   5. Carry-forward credit can satisfy future months.
   6. "Monthly Applied" = amount allocated to the
      current month's contribution.
   7. "Members Contributed" = active members with an
      actual current-month allocation > 0.
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

  const element = byId(id);

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


function formatMoney(value) {

  const amount = Number(value || 0);

  return money(
    Number.isFinite(amount)
      ? amount
      : 0
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
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );

}


/* =========================================================
   ERROR HANDLING
========================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE: dashboard error",
    error
  );

  const errorBox =
    byId("error");

  if (errorBox) {

    errorBox.hidden = false;

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


function getMonthKey(
  date = getLocalDate()
) {

  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(2, "0")
  ].join("-");

}


function getTodayKey() {

  const date =
    getLocalDate();

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


function getPreviousMonthKey(
  monthKey
) {

  const [year, month] =
    monthKey
      .split("-")
      .map(Number);

  const date =
    new Date(
      year,
      month - 2,
      1
    );

  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(2, "0")
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
   MEMBER STATUS
========================================================= */

function isActiveMember(member) {

  return String(
    member?.status || ""
  )
    .trim()
    .toLowerCase() ===
    "active";

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
      isActiveMember
    );


  setText(
    "activeMembers",
    activeMembers.length
  );


  setText(
    "membersCount",
    members.length
  );


  console.log(
    "CHAMA LIVE: members loaded",
    {
      total: members.length,
      active: activeMembers.length
    }
  );


  return members;

}


/* =========================================================
   LOAD CONTRIBUTIONS
========================================================= */

async function loadAllContributions() {

  /*
   * Use only columns confirmed to exist
   * in the CHAMA LIVE contributions table.
   *
   * Known schema:
   * id
   * group_id
   * member_id
   * amount
   * contribution_date
   * contribution_type
   * month
   */

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
        month
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
        "id",
        {
          ascending: true
        }
      );


  if (error) {
    throw error;
  }


  const contributions =
    data || [];


  console.log(
    "CHAMA LIVE: contributions loaded",
    {
      count:
        contributions.length,

      total:
        contributions.reduce(
          (sum, row) =>
            sum +
            Number(
              row.amount || 0
            ),
          0
        )
    }
  );


  return contributions;

}


/* =========================================================
   NORMALIZE CONTRIBUTION MONTH
========================================================= */

function getContributionMonth(
  contribution
) {

  /*
   * Explicit month is preferred.
   *
   * Some databases may store this as:
   * 2026-08
   * 2026-08-01
   * 2026-08-31
   *
   * We normalize everything to YYYY-MM.
   */

  if (
    contribution?.month
  ) {

    const value =
      String(
        contribution.month
      );

    if (
      /^\d{4}-\d{2}/.test(value)
    ) {

      return value.slice(
        0,
        7
      );

    }

  }


  /*
   * Fall back to contribution_date.
   */

  if (
    contribution?.contribution_date
  ) {

    const value =
      String(
        contribution.contribution_date
      );

    if (
      /^\d{4}-\d{2}/.test(value)
    ) {

      return value.slice(
        0,
        7
      );

    }

  }


  return "";

}


/* =========================================================
   MONTH COMPARISON
========================================================= */

function compareMonthKeys(
  a,
  b
) {

  return String(a)
    .localeCompare(
      String(b)
    );

}


/* =========================================================
   GET MONTH KEYS
========================================================= */

function getMonthKeysThroughTarget(
  contributions,
  targetMonth
) {

  const keys =
    new Set();


  contributions.forEach(
    contribution => {

      const month =
        getContributionMonth(
          contribution
        );

      if (
        month &&
        compareMonthKeys(
          month,
          targetMonth
        ) <= 0
      ) {

        keys.add(month);

      }

    }
  );


  /*
   * Always include target month.
   */

  keys.add(
    targetMonth
  );


  const sorted =
    [...keys]
      .sort(
        compareMonthKeys
      );


  /*
   * If there are payments before
   * target month, fill in missing months.
   *
   * This is important for recurring dues.
   */

  if (
    sorted.length <= 1
  ) {

    return sorted;

  }


  const first =
    sorted[0];


  const [firstYear, firstMonth] =
    first
      .split("-")
      .map(Number);


  const [targetYear, targetMonthNumber] =
    targetMonth
      .split("-")
      .map(Number);


  const result = [];


  let year =
    firstYear;

  let month =
    firstMonth;


  while (
    year < targetYear ||
    (
      year === targetYear &&
      month <= targetMonthNumber
    )
  ) {

    result.push(
      `${year}-${String(month).padStart(2, "0")}`
    );


    month++;


    if (
      month > 12
    ) {

      month = 1;

      year++;

    }

  }


  return result;

}


/* =========================================================
   MEMBER MONTHLY STATE
========================================================= */

function calculateMemberMonthlyState(
  memberId,
  contributions,
  targetMonth,
  monthlyDue
) {

  const emptyState = {

    previousOutstanding: 0,

    previousCredit: 0,

    currentPayment: 0,

    appliedToPrevious: 0,

    appliedThisMonth: 0,

    carryForward: 0,

    currentOutstanding: monthlyDue,

    totalCashPaid: 0

  };


  if (
    !memberId ||
    monthlyDue <= 0
  ) {

    return emptyState;

  }


  /*
   * -------------------------------------------------------
   * GROUP PAYMENTS BY MEMBER + MONTH
   * -------------------------------------------------------
   */

  const monthlyPayments = {};


  let totalCashPaid = 0;


  contributions
    .filter(
      contribution =>
        String(
          contribution.member_id
        ) ===
        String(memberId)
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
   * -------------------------------------------------------
   * NO CONTRIBUTIONS
   * -------------------------------------------------------
   */

  if (
    Object.keys(
      monthlyPayments
    ).length === 0
  ) {

    return {

      previousOutstanding: 0,

      previousCredit: 0,

      currentPayment: 0,

      appliedToPrevious: 0,

      appliedThisMonth: 0,

      carryForward: 0,

      currentOutstanding:
        monthlyDue,

      totalCashPaid: 0

    };

  }


  /*
   * -------------------------------------------------------
   * FIND FIRST RECORDED MONTH
   * -------------------------------------------------------
   */

  const firstRecordedMonth =
    Object.keys(
      monthlyPayments
    )
      .sort(
        compareMonthKeys
      )[0];


  const monthKeys =
    getMonthKeysThroughTarget(
      contributions.filter(
        contribution =>
          String(
            contribution.member_id
          ) ===
          String(memberId)
      ),
      targetMonth
    );


  /*
   * If target is before all payments,
   * member has no previous history.
   */

  if (
    compareMonthKeys(
      targetMonth,
      firstRecordedMonth
    ) < 0
  ) {

    return {

      previousOutstanding: 0,

      previousCredit: 0,

      currentPayment: 0,

      appliedToPrevious: 0,

      appliedThisMonth: 0,

      carryForward: 0,

      currentOutstanding:
        monthlyDue,

      totalCashPaid

    };

  }


  /*
   * -------------------------------------------------------
   * RECURRING LEDGER
   * -------------------------------------------------------
   *
   * We process each month chronologically.
   *
   * outstanding:
   * amount still owed from previous months
   *
   * credit:
   * overpayment available for future months
   */

  let outstanding = 0;

  let credit = 0;


  let targetPreviousOutstanding = 0;

  let targetPreviousCredit = 0;

  let targetPayment = 0;

  let targetAppliedToPrevious = 0;

  let targetAppliedThisMonth = 0;

  let targetCarryForward = 0;

  let targetCurrentOutstanding = monthlyDue;


  for (
    const monthKey of monthKeys
  ) {

    const payment =
      Number(
        monthlyPayments[monthKey] ||
        0
      );


    const isTarget =
      monthKey === targetMonth;


    /*
     * Save balances immediately before
     * processing target month.
     */

    if (isTarget) {

      targetPreviousOutstanding =
        outstanding;

      targetPreviousCredit =
        credit;

      targetPayment =
        payment;

    }


    /*
     * -----------------------------------------------------
     * CURRENT MONTH DUE
     * -----------------------------------------------------
     *
     * Every active member has a monthly due.
     */

    let currentDue =
      monthlyDue;


    /*
     * Existing credit can pay
     * the current month's due.
     */

    const creditUsed =
      Math.min(
        credit,
        currentDue
      );


    currentDue -=
      creditUsed;


    credit =
      Math.max(
        credit -
        creditUsed,
        0
      );


    /*
     * -----------------------------------------------------
     * PAYMENT
     * -----------------------------------------------------
     *
     * Payment first clears previous
     * outstanding.
     */

    let remainingPayment =
      payment;


    const appliedToPrevious =
      Math.min(
        outstanding,
        remainingPayment
      );


    outstanding =
      Math.max(
        outstanding -
        appliedToPrevious,
        0
      );


    remainingPayment -=
      appliedToPrevious;


    /*
     * -----------------------------------------------------
     * APPLY TO CURRENT MONTH
     * -----------------------------------------------------
     */

    const appliedThisMonth =
      Math.min(
        currentDue,
        remainingPayment
      );


    currentDue =
      Math.max(
        currentDue -
        appliedThisMonth,
        0
      );


    remainingPayment -=
      appliedThisMonth;


    /*
     * -----------------------------------------------------
     * CARRY FORWARD
     * -----------------------------------------------------
     */

    credit +=
      remainingPayment;


    /*
     * -----------------------------------------------------
     * CURRENT OUTSTANDING
     * -----------------------------------------------------
     */

    outstanding +=
      currentDue;


    /*
     * -----------------------------------------------------
     * SAVE TARGET VALUES
     * -----------------------------------------------------
     */

    if (isTarget) {

      targetAppliedToPrevious =
        appliedToPrevious;

      targetAppliedThisMonth =
        appliedThisMonth;

      targetCarryForward =
        credit;

      targetCurrentOutstanding =
        outstanding;

    }

  }


  /*
   * -------------------------------------------------------
   * RETURN TARGET STATE
   * -------------------------------------------------------
   */

  return {

    previousOutstanding:
      targetPreviousOutstanding,

    previousCredit:
      targetPreviousCredit,

    currentPayment:
      targetPayment,

    appliedToPrevious:
      targetAppliedToPrevious,

    appliedThisMonth:
      targetAppliedThisMonth,

    carryForward:
      targetCarryForward,

    currentOutstanding:
      targetCurrentOutstanding,

    totalCashPaid

  };

}


/* =========================================================
   CALCULATE ALL MEMBER STATES
========================================================= */

function calculateAllMemberStates(
  members,
  contributions,
  targetMonth = getMonthKey()
) {

  const monthlyDue =
    getMonthlyExpectedPerMember();


  const states = {};


  members
    .filter(
      isActiveMember
    )
    .forEach(
      member => {

        states[member.id] =
          calculateMemberMonthlyState(
            member.id,
            contributions,
            targetMonth,
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
      isActiveMember
    );


  const expected =
    monthlyDue *
    activeMembers.length;


  const targetMonth =
    getMonthKey();


  const states =
    calculateAllMemberStates(
      members,
      contributions,
      targetMonth
    );


  let collected =
    0;


  let outstanding =
    0;


  let contributedMembers =
    0;


  let carryForward =
    0;


  let previousOutstanding =
    0;


  activeMembers.forEach(
    member => {

      const state =
        states[member.id] ||
        {
          appliedThisMonth: 0,
          currentOutstanding:
            monthlyDue,
          carryForward: 0,
          previousOutstanding: 0
        };


      const applied =
        Number(
          state.appliedThisMonth ||
          0
        );


      const memberOutstanding =
        Number(
          state.currentOutstanding ||
          0
        );


      const memberCredit =
        Number(
          state.carryForward ||
          0
        );


      const previousDebt =
        Number(
          state.previousOutstanding ||
          0
        );


      collected +=
        applied;


      outstanding +=
        memberOutstanding;


      carryForward +=
        memberCredit;


      previousOutstanding +=
        previousDebt;


      /*
       * THIS IS THE IMPORTANT FIX.
       *
       * Count a member when an actual amount
       * was allocated to the current month's
       * recurring contribution.
       */

      if (
        applied > 0
      ) {

        contributedMembers++;

      }

    }
  );


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


  /*
   * -------------------------------------------------------
   * FINANCIAL METRICS
   * -------------------------------------------------------
   */

  setText(
    "monthlyExpected",
    formatMoney(expected)
  );


  setText(
    "monthlyCollected",
    formatMoney(collected)
  );


  setText(
    "monthlyOutstanding",
    formatMoney(outstanding)
  );


  /*
   * -------------------------------------------------------
   * PROGRESS
   * -------------------------------------------------------
   */

  setText(
    "progressPercentage",
    `${percentage}%`
  );


  setText(
    "progressText",
    `${formatMoney(collected)} / ${formatMoney(expected)}`
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


  /*
   * -------------------------------------------------------
   * MEMBER PARTICIPATION
   * -------------------------------------------------------
   *
   * These IDs MUST match dashboard.html.
   *
   * HTML:
   * contributorsCount
   * contributorsPercentage
   */

  setText(
    "contributorsCount",
    `${contributedMembers} / ${activeMembers.length}`
  );


  setText(
    "contributorsPercentage",
    `${participation}%`
  );


  /*
   * -------------------------------------------------------
   * BREAKDOWN
   * -------------------------------------------------------
   */

  setText(
    "progressApplied",
    formatMoney(collected)
  );


  setText(
    "progressCarryForward",
    formatMoney(carryForward)
  );


  setText(
    "progressOutstanding",
    formatMoney(outstanding)
  );


  /*
   * -------------------------------------------------------
   * DEBUG
   * -------------------------------------------------------
   */

  console.log(
    "CHAMA LIVE: contribution summary",
    {
      targetMonth,
      monthlyDue,
      activeMembers:
        activeMembers.length,
      expected,
      collected,
      contributedMembers,
      participation,
      outstanding,
      carryForward,
      previousOutstanding
    }
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

    carryForward,

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
      isActiveMember
    );


  const monthlyDue =
    getMonthlyExpectedPerMember();


  if (
    activeMembers.length === 0
  ) {

    rows.innerHTML = `
      <tr>
        <td colspan="7">
          No active members found.
        </td>
      </tr>
    `;

    return;

  }


  const states =
    calculateAllMemberStates(
      members,
      contributions,
      getMonthKey()
    );


  rows.innerHTML =
    activeMembers
      .map(
        member => {

          const state =
            states[member.id] ||
            {
              previousOutstanding: 0,
              appliedThisMonth: 0,
              carryForward: 0,
              currentOutstanding:
                monthlyDue
            };


          const previousOutstanding =
            Number(
              state.previousOutstanding ||
              0
            );


          const appliedThisMonth =
            Number(
              state.appliedThisMonth ||
              0
            );


          const carryForward =
            Number(
              state.carryForward ||
              0
            );


          const currentOutstanding =
            Number(
              state.currentOutstanding ||
              0
            );


          /*
           * -------------------------------------------------
           * STATUS
           * -------------------------------------------------
           */

          let status =
            "Pending";


          let statusClass =
            "status-neutral";


          if (
            monthlyDue <= 0
          ) {

            status =
              appliedThisMonth > 0
                ? "Paid"
                : "No amount set";

            statusClass =
              appliedThisMonth > 0
                ? "status-paid"
                : "status-neutral";

          }
          else if (
            currentOutstanding <= 0
          ) {

            status =
              carryForward > 0
                ? "Paid + Credit"
                : "Cleared";

            statusClass =
              "status-cleared";

          }
          else if (
            appliedThisMonth > 0
          ) {

            status =
              "Partial";

            statusClass =
              "status-partial";

          }
          else if (
            previousOutstanding > 0
          ) {

            status =
              "Outstanding";

            statusClass =
              "status-outstanding";

          }


          /*
           * -------------------------------------------------
           * SEVEN HTML COLUMNS
           * -------------------------------------------------
           *
           * 1 Member
           * 2 Monthly Due
           * 3 Previous Outstanding
           * 4 Applied This Month
           * 5 Carry Forward
           * 6 Current Outstanding
           * 7 Status
           */

          return `
            <tr>

              <td>
                ${escapeHtml(
                  member.name ||
                  "Member"
                )}
              </td>

              <td>
                ${formatMoney(
                  monthlyDue
                )}
              </td>

              <td>
                <span class="${
                  previousOutstanding > 0
                    ? "outstanding-value"
                    : ""
                }">
                  ${formatMoney(
                    previousOutstanding
                  )}
                </span>
              </td>

              <td>
                <span class="${
                  appliedThisMonth > 0
                    ? "applied-value"
                    : ""
                }">
                  ${formatMoney(
                    appliedThisMonth
                  )}
                </span>
              </td>

              <td>
                <span class="${
                  carryForward > 0
                    ? "credit-value"
                    : ""
                }">
                  ${formatMoney(
                    carryForward
                  )}
                </span>
              </td>

              <td>
                <span class="${
                  currentOutstanding > 0
                    ? "outstanding-value"
                    : "credit-value"
                }">
                  ${formatMoney(
                    currentOutstanding
                  )}
                </span>
              </td>

              <td>
                <span class="status-badge ${statusClass}">
                  ${escapeHtml(
                    status
                  )}
                </span>
              </td>

            </tr>
          `;

        }
      )
      .join("");


  console.log(
    "CHAMA LIVE: member payment status rendered",
    {
      members:
        activeMembers.length
    }
  );

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


  /*
   * IMPORTANT:
   *
   * Do not request created_at here because
   * the known schema only guarantees the
   * contribution columns we use.
   */

  const {
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select(`
        id,
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
        "id",
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


  /*
   * Get member names.
   */

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
      memberResult.error
    ) {

      console.warn(
        "CHAMA LIVE: member lookup for recent contributions failed",
        memberResult.error
      );

    }
    else {

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
                ${formatMoney(
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

          const rawStatus =
            String(
              expense.approval_status ||
              "Pending"
            );


          const normalizedStatus =
            rawStatus
              .trim()
              .toLowerCase();


          let statusClass =
            "status-neutral";


          if (
            normalizedStatus ===
            "approved"
          ) {

            statusClass =
              "status-paid";

          }
          else if (
            normalizedStatus ===
              "pending" ||
            normalizedStatus ===
              "submitted"
          ) {

            statusClass =
              "status-pending";

          }
          else if (
            normalizedStatus ===
              "rejected" ||
            normalizedStatus ===
              "declined"
          ) {

            statusClass =
              "status-outstanding";

          }


          return `
            <tr>

              <td>
                ${escapeHtml(
                  expense.description ||
                  "Expense"
                )}
              </td>

              <td>
                ${formatMoney(
                  expense.amount
                )}
              </td>

              <td>
                <span class="status-badge ${statusClass}">
                  ${escapeHtml(
                    rawStatus
                  )}
                </span>
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
    getTodayKey();


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
                <span class="status-badge status-neutral">
                  ${escapeHtml(
                    meeting.status ||
                    "Upcoming"
                  )}
                </span>
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
      formatMoney(
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
    formatMoney(balance)
  );


  console.log(
    "CHAMA LIVE: balance",
    {
      totalContributions,
      approvedExpenses,
      balance
    }
  );


  return balance;

}


/* =========================================================
   DIAGNOSTIC CONTRIBUTION CHECK
========================================================= */

/*
 * This function is intentionally included to make the
 * "0 contributors" problem easy to diagnose.
 *
 * It prints the exact member IDs and contribution member IDs
 * being compared.
 */

function debugContributionLinks(
  members,
  contributions
) {

  const activeMembers =
    members.filter(
      isActiveMember
    );


  const activeIds =
    activeMembers.map(
      member =>
        String(
          member.id
        )
    );


  const contributionLinks =
    contributions
      .map(
        contribution => ({
          memberId:
            contribution.member_id,

          memberIdString:
            String(
              contribution.member_id
            ),

          amount:
            Number(
              contribution.amount || 0
            ),

          month:
            getContributionMonth(
              contribution
            )
        })
      );


  console.log(
    "CHAMA LIVE: contribution/member diagnostic",
    {
      activeMemberIds:
        activeIds,

      contributionLinks,

      currentMonth:
        getMonthKey()
    }
  );


  /*
   * Warn if contributions exist but none
   * can be linked to a member.
   */

  const linked =
    contributionLinks.filter(
      contribution =>
        activeIds.includes(
          contribution.memberIdString
        )
    );


  if (
    contributionLinks.length > 0 &&
    linked.length === 0
  ) {

    console.warn(
      "CHAMA LIVE: contributions exist, but none are linked to an active member by member_id."
    );

  }

}


/* =========================================================
   MAIN DASHBOARD
========================================================= */

async function loadDashboard() {

  console.log(
    "CHAMA LIVE: loading dashboard data..."
  );


  /*
   * -------------------------------------------------------
   * CURRENT MEMBER
   * -------------------------------------------------------
   */

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


  console.log(
    "CHAMA LIVE: current member",
    {
      id:
        currentMember.id,

      name:
        currentMember.name,

      groupId:
        currentGroupId
    }
  );


  /*
   * -------------------------------------------------------
   * GROUP
   * -------------------------------------------------------
   */

  currentGroup =
    await getCurrentGroup();


  if (!currentGroup) {

    throw new Error(
      "Group information could not be found."
    );

  }


  renderGroup();


  console.log(
    "CHAMA LIVE: current group",
    {
      id:
        currentGroup.id,

      name:
        currentGroup.name,

      monthlyContribution:
        currentGroup.monthly_contribution
    }
  );


  /*
   * -------------------------------------------------------
   * MEMBERS
   * -------------------------------------------------------
   */

  const members =
    await loadMembers();


  /*
   * -------------------------------------------------------
   * CONTRIBUTIONS
   * -------------------------------------------------------
   */

  const contributions =
    await loadAllContributions();


  /*
   * -------------------------------------------------------
   * DEBUG LINKING
   * -------------------------------------------------------
   */

  debugContributionLinks(
    members,
    contributions
  );


  /*
   * -------------------------------------------------------
   * CONTRIBUTION SUMMARY
   * -------------------------------------------------------
   */

  renderContributionSummary(
    members,
    contributions
  );


  /*
   * -------------------------------------------------------
   * MEMBER STATUS
   * -------------------------------------------------------
   */

  renderMemberPaymentStatus(
    members,
    contributions
  );


  /*
   * -------------------------------------------------------
   * RECENT ACTIVITY
   * -------------------------------------------------------
   */

  await renderRecentContributions();

  await renderRecentExpenses();

  await renderUpcomingMeetings();


  /*
   * -------------------------------------------------------
   * BALANCE
   * -------------------------------------------------------
   */

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
