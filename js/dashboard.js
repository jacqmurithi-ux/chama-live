/* =========================================================
   CHAMA LIVE — DASHBOARD
   RECURRING CONTRIBUTION / CARRY-FORWARD VERSION

   IMPORTANT CONTRIBUTION LOGIC

   Monthly contribution is recurring.

   Example:

   Monthly contribution = KSh 200

   Member pays KSh 600 in August:

      August monthly due       = KSh 200
      Applied to August        = KSh 200
      Carry-forward credit     = KSh 400
      Current outstanding      = KSh 0

   The KSh 400 is NOT counted as August collection
   toward the group's August monthly target.

   It becomes credit for future months.

   Payment allocation order:

      1. Previous outstanding balances
      2. Current month's recurring contribution
      3. Remaining amount becomes carry-forward credit

   The dashboard and Contributions page should therefore
   use the allocated amount rather than simply summing
   raw contribution transactions.
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


/* =========================================================
   FORMAT DATE
========================================================= */

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
   SHOW ERROR
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
   MONTH HELPERS
========================================================= */

function getCurrentMonthKey() {

  const now =
    new Date();


  return [
    now.getFullYear(),
    String(
      now.getMonth() + 1
    ).padStart(2, "0")
  ].join("-");

}


function getCurrentMonthLabel() {

  return new Date()
    .toLocaleDateString(
      "en-KE",
      {
        month: "long",
        year: "numeric"
      }
    );

}


function monthKeyFromDate(value) {

  if (!value) {

    return null;

  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return null;

  }


  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(2, "0")
  ].join("-");

}


function monthKeyToDate(monthKey) {

  if (!monthKey) {

    return null;

  }


  const parts =
    String(monthKey)
      .split("-");


  if (parts.length !== 2) {

    return null;

  }


  const year =
    Number(parts[0]);

  const month =
    Number(parts[1]);


  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month)
  ) {

    return null;

  }


  return new Date(
    year,
    month - 1,
    1
  );

}


function addMonths(
  monthKey,
  amount
) {

  const date =
    monthKeyToDate(
      monthKey
    );


  if (!date) {

    return null;

  }


  date.setMonth(
    date.getMonth() + amount
  );


  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(2, "0")
  ].join("-");

}


/* =========================================================
   MONTH DIFFERENCE
========================================================= */

function monthsBetween(
  startMonth,
  endMonth
) {

  const start =
    monthKeyToDate(
      startMonth
    );

  const end =
    monthKeyToDate(
      endMonth
    );


  if (
    !start ||
    !end
  ) {

    return 0;

  }


  return (
    (end.getFullYear() -
      start.getFullYear()) *
      12
    +
    (
      end.getMonth() -
      start.getMonth()
    )
  );

}


/* =========================================================
   MONTHLY CONTRIBUTION
========================================================= */

function getMonthlyExpected() {

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
   PAYMENT TYPE CHECK
========================================================= */

function isMonthlyContribution(
  contribution
) {

  const type =
    String(
      contribution?.contribution_type ||
      ""
    )
      .trim()
      .toLowerCase();


  /*
   * Only recurring monthly payments participate
   * in monthly allocation.
   *
   * Registration, welfare, special and other
   * contributions are not used to clear recurring
   * monthly dues.
   */

  return (
    type === "monthly" ||
    type === "recurring" ||
    type === "monthly contribution"
  );

}


/* =========================================================
   CONTRIBUTION MONTH
========================================================= */

function getContributionMonth(
  contribution
) {

  /*
   * Prefer actual contribution date.
   */

  const fromDate =
    monthKeyFromDate(
      contribution?.contribution_date
    );


  if (fromDate) {

    return fromDate;

  }


  /*
   * Fallback to database month column.
   */

  const month =
    String(
      contribution?.month ||
      ""
    ).trim();


  if (
    /^\d{4}-\d{2}$/.test(
      month
    )
  ) {

    return month;

  }


  return null;

}


/* =========================================================
   CONTRIBUTION DATE FOR SORTING
========================================================= */

function getContributionSortDate(
  contribution
) {

  if (
    contribution?.contribution_date
  ) {

    const date =
      new Date(
        contribution.contribution_date
      );


    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {

      return date.getTime();

    }

  }


  if (
    contribution?.created_at
  ) {

    const date =
      new Date(
        contribution.created_at
      );


    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {

      return date.getTime();

    }

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
   FOR RECURRING ALLOCATION
========================================================= */

async function loadAllContributions() {

  /*
   * We deliberately load historical monthly
   * contributions because carry-forward and
   * outstanding balances depend on previous months.
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
        payment_method,
        mpesa_reference,
        reference,
        month,
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
     * Compatibility fallback for databases
     * where mpesa_reference does not exist.
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
            payment_method,
            reference,
            month,
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
   GET MEMBER START MONTH
========================================================= */

function getMemberStartMonth(
  member,
  memberContributions,
  currentMonth
) {

  /*
   * Best source:
   * member join date.
   */

  const joinMonth =
    monthKeyFromDate(
      member?.join_date
    );


  if (
    joinMonth &&
    joinMonth <= currentMonth
  ) {

    return joinMonth;

  }


  /*
   * Fallback:
   * earliest monthly contribution.
   *
   * This avoids creating artificial historical
   * outstanding balances where no join date exists.
   */

  const contributionMonths =
    memberContributions
      .map(
        contribution =>
          getContributionMonth(
            contribution
          )
      )
      .filter(Boolean)
      .filter(
        month =>
          month <= currentMonth
      )
      .sort();


  if (
    contributionMonths.length
  ) {

    return contributionMonths[0];

  }


  /*
   * Last fallback:
   * current month.
   */

  return currentMonth;

}


/* =========================================================
   ALLOCATE ONE MEMBER'S CONTRIBUTIONS
========================================================= */

function calculateMemberRecurringStatus(
  member,
  memberContributions,
  currentMonth,
  monthlyDue
) {

  /*
   * If no recurring amount has been configured,
   * there is nothing to allocate.
   */

  if (
    monthlyDue <= 0
  ) {

    return {

      memberId:
        member.id,

      monthlyDue:
        0,

      previousOutstanding:
        0,

      appliedThisMonth:
        0,

      carryForward:
        0,

      currentOutstanding:
        0,

      status:
        memberContributions.length
          ? "Credit"
          : "—",

      contributing:
        false,

      totalMonthlyPayments:
        memberContributions
          .reduce(
            (
              total,
              contribution
            ) =>
              total +
              Number(
                contribution.amount || 0
              ),
            0
          )

    };

  }


  /*
   * Keep only recurring monthly payments.
   */

  const payments =
    memberContributions
      .filter(
        isMonthlyContribution
      )
      .map(
        contribution => ({

          ...contribution,

          amount:
            Math.max(
              Number(
                contribution.amount || 0
              ),
              0
            ),

          month:
            getContributionMonth(
              contribution
            ),

          sortDate:
            getContributionSortDate(
              contribution
            )

        })
      )
      .filter(
        contribution =>
          contribution.month &&
          contribution.month <=
            currentMonth
      )
      .sort(
        (a, b) => {

          if (
            a.month <
            b.month
          ) {

            return -1;

          }


          if (
            a.month >
            b.month
          ) {

            return 1;

          }


          return (
            a.sortDate -
            b.sortDate
          );

        }
      );


  /*
   * Determine where recurring billing begins.
   */

  const startMonth =
    getMemberStartMonth(
      member,
      payments,
      currentMonth
    );


  /*
   * State carried through each month.
   */

  let carryForward =
    0;


  let previousOutstanding =
    0;


  let appliedThisMonth =
    0;


  let currentOutstanding =
    0;


  /*
   * Process every month from member joining
   * through the current month.
   */

  const totalMonths =
    monthsBetween(
      startMonth,
      currentMonth
    );


  /*
   * Guard against malformed dates.
   */

  if (
    totalMonths < 0
  ) {

    return {

      memberId:
        member.id,

      monthlyDue,

      previousOutstanding:
        0,

      appliedThisMonth:
        0,

      carryForward:
        0,

      currentOutstanding:
        0,

      status:
        "—",

      contributing:
        false,

      totalMonthlyPayments:
        0

    };

  }


  for (
    let index = 0;
    index <= totalMonths;
    index++
  ) {

    const month =
      addMonths(
        startMonth,
        index
      );


    if (!month) {

      continue;

    }


    /*
     * Find all payments belonging to this month.
     */

    const monthlyPayments =
      payments.filter(
        payment =>
          payment.month ===
          month
      );


    const monthlyPaid =
      monthlyPayments.reduce(
        (
          total,
          payment
        ) =>
          total +
          Number(
            payment.amount || 0
          ),
        0
      );


    /*
     * Monthly recurring due.
     */

    const due =
      monthlyDue;


    /*
     * Outstanding entering this month.
     *
     * The current month's due is added to
     * the previous month's outstanding.
     */

    const amountDueBeforePayment =
      due +
      previousOutstanding;


    /*
     * Available money for this month:
     *
     * previous carry-forward
     * +
     * this month's payment
     */

    const available =
      carryForward +
      monthlyPaid;


    /*
     * First clear previous/current obligations.
     */

    const amountApplied =
      Math.min(
        available,
        amountDueBeforePayment
      );


    /*
     * Anything not required becomes credit.
     */

    const newCarryForward =
      Math.max(
        available -
          amountApplied,
        0
      );


    /*
     * Remaining amount is outstanding.
     */

    const newOutstanding =
      Math.max(
        amountDueBeforePayment -
          amountApplied,
        0
      );


    /*
     * For the current month, expose the
     * calculated values.
     */

    if (
      month === currentMonth
    ) {

      /*
       * Previous outstanding before August
       * recurring due was added.
       *
       * This is useful for dashboard display.
       */

      previousOutstanding =
        Math.max(
          amountDueBeforePayment -
            due,
          0
        );


      appliedThisMonth =
        Math.min(
          amountApplied,
          due
        );


      carryForward =
        newCarryForward;


      currentOutstanding =
        newOutstanding;

    }


    /*
     * Prepare state for next month.
     */

    previousOutstanding =
      newOutstanding;

    carryForward =
      newCarryForward;

  }


  /*
   * A member is considered to have contributed
   * for the current month when the current month's
   * recurring contribution has been fully satisfied.
   *
   * This can happen by:
   *
   * - current-month payment
   * - previous carry-forward credit
   * - both
   */

  const contributing =
    appliedThisMonth >=
      monthlyDue &&
    currentOutstanding <= 0;


  let status =
    "Outstanding";


  if (
    currentOutstanding <= 0 &&
    carryForward > 0
  ) {

    status =
      "Credit";

  }
  else if (
    currentOutstanding <= 0
  ) {

    status =
      "Cleared";

  }
  else if (
    appliedThisMonth > 0
  ) {

    status =
      "Partial";

  }


  /*
   * Total historical monthly payments.
   */

  const totalMonthlyPayments =
    payments.reduce(
      (
        total,
        payment
      ) =>
        total +
        Number(
          payment.amount || 0
        ),
      0
    );


  return {

    memberId:
      member.id,

    monthlyDue,

    previousOutstanding,

    appliedThisMonth,

    carryForward,

    currentOutstanding,

    status,

    contributing,

    totalMonthlyPayments

  };

}


/* =========================================================
   CALCULATE ALL MEMBER RECURRING STATUS
========================================================= */

function calculateAllMemberStatuses(
  members,
  contributions
) {

  const currentMonth =
    getCurrentMonthKey();


  const monthlyDue =
    getMonthlyExpected();


  const activeMembers =
    members.filter(
      member =>
        String(
          member.status || ""
        )
          .toLowerCase() ===
        "active"
    );


  const contributionsByMember =
    {};


  contributions.forEach(
    contribution => {

      if (
        !contribution.member_id
      ) {

        return;

      }


      if (
        !contributionsByMember[
          contribution.member_id
        ]
      ) {

        contributionsByMember[
          contribution.member_id
        ] = [];

      }


      contributionsByMember[
        contribution.member_id
      ].push(
        contribution
      );

    }
  );


  const statuses =
    {};


  activeMembers.forEach(
    member => {

      statuses[
        member.id
      ] =
        calculateMemberRecurringStatus(
          member,
          contributionsByMember[
            member.id
          ] || [],
          currentMonth,
          monthlyDue
        );

    }
  );


  return {

    currentMonth,

    monthlyDue,

    statuses

  };

}


/* =========================================================
   RENDER CONTRIBUTION SUMMARY
========================================================= */

function renderContributionSummary(
  members,
  contributions
) {

  const {

    currentMonth,

    monthlyDue,

    statuses

  } =
    calculateAllMemberStatuses(
      members,
      contributions
    );


  const activeMembers =
    members.filter(
      member =>
        String(
          member.status || ""
        )
          .toLowerCase() ===
        "active"
    );


  /*
   * GROUP MONTHLY TARGET
   */

  const expected =
    monthlyDue *
    activeMembers.length;


  /*
   * IMPORTANT:
   *
   * Do NOT sum raw August payments.
   *
   * Sum only amounts actually applied
   * toward August recurring dues.
   */

  const collected =
    activeMembers.reduce(
      (
        total,
        member
      ) => {

        const status =
          statuses[
            member.id
          ];


        return (
          total +
          Number(
            status?.appliedThisMonth ||
            0
          )
        );

      },
      0
    );


  /*
   * Outstanding is based on member-level
   * recurring balances.
   */

  const outstanding =
    activeMembers.reduce(
      (
        total,
        member
      ) => {

        const status =
          statuses[
            member.id
          ];


        return (
          total +
          Number(
            status?.currentOutstanding ||
            0
          )
        );

      },
      0
    );


  /*
   * Members who have fully contributed
   * toward the current month's recurring due.
   */

  const contributingMembers =
    activeMembers.filter(
      member =>
        statuses[
          member.id
        ]?.contributing === true
    ).length;


  /*
   * Collection percentage.
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


  /*
   * Member participation percentage.
   */

  const memberPercentage =
    activeMembers.length > 0
      ? Math.round(
          (
            contributingMembers /
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
    getCurrentMonthLabel()
  );


  const progressBar =
    byId("progressBar");


  if (progressBar) {

    progressBar.style.width =
      `${percentage}%`;

    progressBar.setAttribute(
      "aria-valuenow",
      String(
        percentage
      )
    );

  }


  /*
   * Display number / percentage of members
   * who have contributed.
   *
   * Works if the HTML contains either:
   *
   * #contributingMembers
   *
   * or
   *
   * #progressMembers
   *
   */

  setText(
    "contributingMembers",
    `${contributingMembers} of ${activeMembers.length} members (${memberPercentage}%)`
  );


  setText(
    "progressMembers",
    `${contributingMembers} of ${activeMembers.length} members (${memberPercentage}%)`
  );


  /*
   * Optional separate values if HTML contains
   * individual elements.
   */

  setText(
    "contributingMemberCount",
    contributingMembers
  );


  setText(
    "totalActiveMembers",
    activeMembers.length
  );


  setText(
    "memberContributionPercentage",
    `${memberPercentage}%`
  );


  /*
   * Optional progress member label.
   */

  const progressMemberLabel =
    byId(
      "progressMemberLabel"
    );


  if (
    progressMemberLabel
  ) {

    progressMemberLabel.textContent =
      `${contributingMembers} of ${activeMembers.length} members contributing (${memberPercentage}%)`;

  }


  return {

    expected,

    collected,

    outstanding,

    percentage,

    contributingMembers,

    activeMembers:
      activeMembers.length,

    memberPercentage,

    statuses,

    currentMonth

  };

}


/* =========================================================
   MEMBER CONTRIBUTION STATUS
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


  const {

    monthlyDue,

    statuses

  } =
    calculateAllMemberStatuses(
      members,
      contributions
    );


  const activeMembers =
    members.filter(
      member =>
        String(
          member.status || ""
        )
          .toLowerCase() ===
        "active"
    );


  if (
    activeMembers.length ===
    0
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


  rows.innerHTML =
    activeMembers
      .map(
        member => {

          const status =
            statuses[
              member.id
            ];


          const previousOutstanding =
            Number(
              status?.previousOutstanding ||
              0
            );


          const appliedThisMonth =
            Number(
              status?.appliedThisMonth ||
              0
            );


          const carryForward =
            Number(
              status?.carryForward ||
              0
            );


          const currentOutstanding =
            Number(
              status?.currentOutstanding ||
              0
            );


          const statusText =
            status?.status ||
            "Outstanding";


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
                  previousOutstanding
                )}
              </td>

              <td>
                ${money(
                  appliedThisMonth
                )}
              </td>

              <td>
                ${money(
                  carryForward
                )}
              </td>

              <td>
                ${money(
                  currentOutstanding
                )}
              </td>

              <td>
                ${escapeHtml(
                  statusText
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   LOAD CURRENT BALANCE
========================================================= */

async function loadBalance() {

  /*
   * TOTAL MONEY RECEIVED
   *
   * Balance is actual cash position.
   * Carry-forward is an accounting allocation,
   * not money leaving the group.
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
        expense => {

          const status =
            String(
              expense.approval_status ||
              "pending"
            )
              .toLowerCase();


          return (
            status ===
            "approved"
          );

        }
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
    money(
      balance
    )
  );


  return balance;

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
      .limit(5);


  if (error) {

    throw error;

  }


  const contributions =
    data || [];


  if (
    contributions.length ===
    0
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


  let membersById =
    {};


  if (
    memberIds.length >
    0
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
                ${formatDate(
                  contribution.contribution_date
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
    expenses.length ===
    0
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
    new Date()
      .toISOString()
      .split("T")[0];


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
    meetings.length ===
    0
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
                ${formatDate(
                  meeting.date
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
   MAIN DASHBOARD
========================================================= */

async function loadDashboard() {

  console.log(
    "CHAMA LIVE: loading dashboard data..."
  );


  /* -------------------------------------------------------
     CURRENT MEMBER
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
     CURRENT GROUP
  ------------------------------------------------------- */

  currentGroup =
    await getCurrentGroup();


  if (!currentGroup) {

    throw new Error(
      "Group information could not be found."
    );

  }


  /* -------------------------------------------------------
     GROUP HEADER
  ------------------------------------------------------- */

  const groupName =
    currentGroup?.name ||
    "CHAMA";


  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(
      element => {

        element.textContent =
          groupName;

      }
    );


  document
    .querySelectorAll(
      "[data-user-name]"
    )
    .forEach(
      element => {

        element.textContent =
          currentMember?.name ||
          "Member";

      }
    );


  /* -------------------------------------------------------
     MEMBERS
  ------------------------------------------------------- */

  const members =
    await loadMembers();


  /* -------------------------------------------------------
     ALL CONTRIBUTIONS
     Needed for carry-forward calculation
  ------------------------------------------------------- */

  const contributions =
    await loadAllContributions();


  /* -------------------------------------------------------
     RECURRING CONTRIBUTION SUMMARY
  ------------------------------------------------------- */

  renderContributionSummary(
    members,
    contributions
  );


  /* -------------------------------------------------------
     MEMBER PAYMENT STATUS
  ------------------------------------------------------- */

  renderMemberPaymentStatus(
    members,
    contributions
  );


  /* -------------------------------------------------------
     RECENT CONTRIBUTIONS
  ------------------------------------------------------- */

  await renderRecentContributions();


  /* -------------------------------------------------------
     RECENT EXPENSES
  ------------------------------------------------------- */

  await renderRecentExpenses();


  /* -------------------------------------------------------
     UPCOMING MEETINGS
  ------------------------------------------------------- */

  await renderUpcomingMeetings();


  /* -------------------------------------------------------
     ACTUAL GROUP BALANCE
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
    byId(
      "status"
    );


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


    showError(
      error
    );

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
   
