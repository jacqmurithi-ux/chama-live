/* =========================================================
   CHAMA LIVE — REPORTS
   CURRENT CONTRIBUTION SYSTEM
   ---------------------------------------------------------
   Uses:
   - monthly contribution allocation
   - previous outstanding
   - current-month applied amount
   - carry-forward credit
   - current outstanding
   - approved expenses
   - current top-navigation layout
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember
} from "./auth.js";


console.log("CHAMA LIVE: reports.js loaded");


/* =========================================================
   ELEMENTS
========================================================= */

const monthInput =
  document.getElementById("month");

const loadButton =
  document.getElementById("loadReport");

const printButton =
  document.getElementById("printReport");

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");


const openingBalanceEl =
  document.getElementById("openingBalance");

const expectedEl =
  document.getElementById("expected");

const collectedEl =
  document.getElementById("collected");

const outstandingEl =
  document.getElementById("outstanding");

const approvedExpensesEl =
  document.getElementById("approvedExpenses");

const closingBalanceEl =
  document.getElementById("closingBalance");


const activeMembersEl =
  document.getElementById("activeMembers");

const membersPaidEl =
  document.getElementById("membersPaid");

const membersPartialEl =
  document.getElementById("membersPartial");

const membersOutstandingEl =
  document.getElementById("membersOutstanding");

const collectionRateEl =
  document.getElementById("collectionRate");

const periodStatusEl =
  document.getElementById("periodStatus");


const cashbookRows =
  document.getElementById("cashbookRows");

const memberRows =
  document.getElementById("memberRows");

const expenseRows =
  document.getElementById("expenseRows");


/* =========================================================
   STATE
========================================================= */

let groupId = null;

let currentMember = null;

let group = null;

let members = [];

let contributions = [];

let expenses = [];

let period = null;

let initialized = false;


/* =========================================================
   HELPERS
========================================================= */

function money(value) {

  return new Intl.NumberFormat(
    "en-KE",
    {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ).format(
    Number(value || 0)
  );

}


function escapeHtml(value) {

  return String(
    value ?? ""
  )
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
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );

}


function currentMonth() {

  const now =
    new Date();


  return [
    now.getFullYear(),
    String(
      now.getMonth() + 1
    ).padStart(2, "0")
  ].join("-");

}


function monthKey(value) {

  if (!value) {

    return "";

  }


  const text =
    String(value);


  /*
   * Handles:
   * 2026-08
   * 2026-08-30
   * 2026-08-30T10:00:00
   */

  if (
    /^\d{4}-\d{2}/.test(
      text
    )
  ) {

    return text.slice(
      0,
      7
    );

  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "";

  }


  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(2, "0")
  ].join("-");

}


function addMonths(
  month,
  amount
) {

  const [
    year,
    monthNumber
  ] =
    String(month)
      .split("-")
      .map(Number);


  const date =
    new Date(
      year,
      monthNumber - 1 + amount,
      1
    );


  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(2, "0")
  ].join("-");

}


function monthDifference(
  fromMonth,
  toMonth
) {

  const [
    fromYear,
    fromMonthNumber
  ] =
    fromMonth
      .split("-")
      .map(Number);


  const [
    toYear,
    toMonthNumber
  ] =
    toMonth
      .split("-")
      .map(Number);


  return (
    (toYear - fromYear) * 12 +
    (toMonthNumber - fromMonthNumber)
  );

}


function showError(error) {

  console.error(
    "CHAMA LIVE Reports:",
    error
  );


  if (errorEl) {

    errorEl.textContent =
      error?.message ||
      "Unable to load report.";

    errorEl.hidden =
      false;

  }

}


function clearError() {

  if (errorEl) {

    errorEl.hidden =
      true;

    errorEl.textContent =
      "";

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
        name,
        monthly_contribution,
        opening_balance,
        category,
        description,
        country
      `)
      .eq(
        "id",
        groupId
      )
      .single();


  if (error) {

    throw error;

  }


  group =
    data;

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
        join_date,
        status
      `)
      .eq(
        "group_id",
        groupId
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
   ---------------------------------------------------------
   IMPORTANT:
   We load contribution history up to the selected month,
   not only the selected month.

   This is required to calculate:
   - previous outstanding
   - current-month application
   - carry-forward
   - current outstanding
========================================================= */

async function loadContributions(
  month
) {

  const end =
    `${addMonths(
      month,
      1
    )}-01`;


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
        created_at,
        goal_id,
        contribution_date,
        notes
      `)
      .eq(
        "group_id",
        groupId
      )
      .lt(
        "contribution_date",
        end
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

    throw error;

  }


  contributions =
    data || [];

}


/* =========================================================
   LOAD EXPENSES
========================================================= */

async function loadExpenses(
  month
) {

  const start =
    `${month}-01`;

  const end =
    `${addMonths(
      month,
      1
    )}-01`;


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
        receipt_url,
        approval_status,
        created_at
      `)
      .eq(
        "group_id",
        groupId
      )
      .gte(
        "date",
        start
      )
      .lt(
        "date",
        end
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
      );


  if (error) {

    throw error;

  }


  expenses =
    data || [];

}


/* =========================================================
   LOAD FINANCIAL PERIOD
========================================================= */

async function loadFinancialPeriod(
  month
) {

  const {
    data,
    error
  } =
    await supabase
      .from("financial_periods")
      .select(`
        id,
        group_id,
        month,
        opening_balance,
        closing_balance,
        status,
        closed_at,
        closed_by,
        created_at
      `)
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "month",
        month
      )
      .limit(1);


  if (error) {

    throw error;

  }


  period =
    data?.[0] ||
    null;

}


/* =========================================================
   ACTIVE MEMBERS
========================================================= */

function getActiveMembers() {

  return members.filter(
    member =>
      String(
        member.status ||
        "active"
      ).toLowerCase() ===
      "active"
  );

}


/* =========================================================
   MONTHLY CONTRIBUTIONS ONLY
========================================================= */

function getMonthlyPaymentsForMember(
  memberId,
  upToMonth
) {

  return contributions.filter(
    contribution => {

      if (
        String(
          contribution.member_id
        ) !==
        String(memberId)
      ) {

        return false;

      }


      const type =
        String(
          contribution.contribution_type ||
          ""
        ).toLowerCase();


      /*
       * Only recurring monthly contributions
       * participate in monthly allocation.
       */

      if (
        type !==
        "monthly"
      ) {

        return false;

      }


      const paymentMonth =
        monthKey(
          contribution.month ||
          contribution.contribution_date ||
          contribution.created_at
        );


      if (!paymentMonth) {

        return false;

      }


      return (
        paymentMonth <=
        upToMonth
      );

    }
  );

}


/* =========================================================
   MEMBER START MONTH
========================================================= */

function getMemberStartMonth(
  member,
  selectedMonth
) {

  const joinMonth =
    monthKey(
      member.join_date
    );


  if (
    joinMonth &&
    joinMonth <=
    selectedMonth
  ) {

    return joinMonth;

  }


  /*
   * If no join date exists, use the earliest
   * contribution month for this member.
   */

  const memberPayments =
    contributions
      .filter(
        contribution =>
          String(
            contribution.member_id
          ) ===
          String(
            member.id
          )
      )
      .map(
        contribution =>
          monthKey(
            contribution.month ||
            contribution.contribution_date ||
            contribution.created_at
          )
      )
      .filter(Boolean)
      .sort();


  if (memberPayments.length) {

    return memberPayments[0];

  }


  /*
   * For a member with no history and no join
   * date, start at the selected month.
   */

  return selectedMonth;

}


/* =========================================================
   ALLOCATE MEMBER CONTRIBUTIONS
   ---------------------------------------------------------
   Rules:

   1. Previous outstanding is cleared first.
   2. Current month's due is then covered.
   3. Extra payment becomes carry-forward credit.
   4. Carry-forward credit is used against future dues.
   5. Only "monthly" contributions participate.
========================================================= */

function calculateMemberStatus(
  member,
  selectedMonth
) {

  const monthlyDue =
    Number(
      group?.monthly_contribution ||
      0
    );


  const startMonth =
    getMemberStartMonth(
      member,
      selectedMonth
    );


  const payments =
    getMonthlyPaymentsForMember(
      member.id,
      selectedMonth
    );


  const paymentsByMonth =
    new Map();


  payments.forEach(
    contribution => {

      const key =
        monthKey(
          contribution.month ||
          contribution.contribution_date ||
          contribution.created_at
        );


      const current =
        Number(
          paymentsByMonth.get(
            key
          ) ||
          0
        );


      paymentsByMonth.set(
        key,
        current +
        Number(
          contribution.amount ||
          0
        )
      );

    }
  );


  let previousOutstanding =
    0;

  let carryForward =
    0;

  let selectedResult =
    null;


  const months =
    Math.max(
      0,
      monthDifference(
        startMonth,
        selectedMonth
      )
    );


  for (
    let index = 0;
    index <= months;
    index++
  ) {

    const currentMonth =
      addMonths(
        startMonth,
        index
      );


    const payment =
      Number(
        paymentsByMonth.get(
          currentMonth
        ) ||
        0
      );


    let available =
      payment;


    let debtBeforeMonth =
      previousOutstanding;


    /*
     * Carry-forward is credit.
     * It can never coexist with debt.
     */

    if (
      carryForward > 0 &&
      debtBeforeMonth <= 0
    ) {

      available +=
        carryForward;

      carryForward =
        0;

    }


    /*
     * First clear previous arrears.
     */

    const clearedPrevious =
      Math.min(
        available,
        debtBeforeMonth
      );


    available -=
      clearedPrevious;

    debtBeforeMonth -=
      clearedPrevious;


    /*
     * Now apply remaining amount to
     * current month's recurring due.
     */

    const appliedThisMonth =
      Math.min(
        available,
        monthlyDue
      );


    available -=
      appliedThisMonth;


    const currentOutstanding =
      Math.max(
        monthlyDue -
        appliedThisMonth,
        0
      );


    /*
     * Anything remaining becomes
     * carry-forward credit.
     */

    carryForward =
      Math.max(
        available,
        0
      );


    previousOutstanding =
      debtBeforeMonth +
      currentOutstanding;


    /*
     * Capture selected month.
     */

    if (
      currentMonth ===
      selectedMonth
    ) {

      selectedResult = {

        monthlyDue,

        payment,

        previousOutstanding:
          debtBeforeMonth,

        clearedPrevious,

        appliedThisMonth,

        carryForward,

        currentOutstanding,

        status:
          currentOutstanding <= 0
            ? "Paid"
            : (
                appliedThisMonth > 0
                  ? "Partial"
                  : "Outstanding"
              )

      };

    }

  }


  return (
    selectedResult || {

      monthlyDue,

      payment: 0,

      previousOutstanding: 0,

      clearedPrevious: 0,

      appliedThisMonth: 0,

      carryForward: 0,

      currentOutstanding:
        monthlyDue,

      status:
        "Outstanding"

    }
  );

}


/* =========================================================
   CALCULATE ALL MEMBER STATUSES
========================================================= */

function calculateMemberStatuses(
  month
) {

  return getActiveMembers()
    .map(
      member => ({

        member,

        ...calculateMemberStatus(
          member,
          month
        )

      })
    );

}


/* =========================================================
   CALCULATE REPORT
========================================================= */

function calculateReport(
  month
) {

  const activeMembers =
    getActiveMembers();


  const memberStatuses =
    calculateMemberStatuses(
      month
    );


  const monthlyExpected =
    memberStatuses.reduce(
      (
        total,
        item
      ) =>
        total +
        Number(
          item.monthlyDue ||
          0
        ),
      0
    );


  /*
   * All contribution money is used for the
   * financial cashbook.
   *
   * Registration, welfare, special and other
   * payments therefore still count as cash
   * received, but do NOT inflate monthly
   * recurring collection progress.
   */

  const collected =
    contributions.reduce(
      (
        total,
        contribution
      ) =>
        total +
        Number(
          contribution.amount ||
          0
        ),
      0
    );


  const currentMonthApplied =
    memberStatuses.reduce(
      (
        total,
        item
      ) =>
        total +
        Number(
          item.appliedThisMonth ||
          0
        ),
      0
    );


  const currentMonthCarryForward =
    memberStatuses.reduce(
      (
        total,
        item
      ) =>
        total +
        Number(
          item.carryForward ||
          0
        ),
      0
    );


  const currentOutstanding =
    memberStatuses.reduce(
      (
        total,
        item
      ) =>
        total +
        Number(
          item.currentOutstanding ||
          0
        ),
      0
    );


  const previousOutstanding =
    memberStatuses.reduce(
      (
        total,
        item
      ) =>
        total +
        Number(
          item.previousOutstanding ||
          0
        ),
      0
    );


  const approvedExpenses =
    expenses
      .filter(
        expense =>
          String(
            expense.approval_status ||
            ""
          ).toLowerCase() ===
          "approved"
      )
      .reduce(
        (
          total,
          expense
        ) =>
          total +
          Number(
            expense.amount ||
            0
          ),
        0
      );


  const opening =
    Number(
      period?.opening_balance ??
      group?.opening_balance ??
      0
    );


  const closing =
    opening +
    collected -
    approvedExpenses;


  const paidCount =
    memberStatuses.filter(
      item =>
        item.status ===
        "Paid"
    ).length;


  const partialCount =
    memberStatuses.filter(
      item =>
        item.status ===
        "Partial"
    ).length;


  const outstandingCount =
    memberStatuses.filter(
      item =>
        item.status ===
        "Outstanding"
    ).length;


  const collectionRate =
    monthlyExpected > 0
      ? Math.min(
          (
            currentMonthApplied /
            monthlyExpected
          ) *
          100,
          100
        )
      : 0;


  return {

    activeMembers:
      activeMembers.length,

    expected:
      monthlyExpected,

    collected,

    currentMonthApplied,

    currentMonthCarryForward,

    previousOutstanding,

    outstanding:
      currentOutstanding,

    approvedExpenses,

    opening,

    closing,

    paidCount,

    partialCount,

    outstandingCount,

    collectionRate,

    memberStatuses

  };

}


/* =========================================================
   RENDER SUMMARY
========================================================= */

function renderSummary(
  summary
) {

  if (openingBalanceEl) {

    openingBalanceEl.textContent =
      money(
        summary.opening
      );

  }


  if (expectedEl) {

    expectedEl.textContent =
      money(
        summary.expected
      );

  }


  if (collectedEl) {

    collectedEl.textContent =
      money(
        summary.collected
      );

  }


  if (outstandingEl) {

    outstandingEl.textContent =
      money(
        summary.outstanding
      );

  }


  if (approvedExpensesEl) {

    approvedExpensesEl.textContent =
      money(
        summary.approvedExpenses
      );

  }


  if (closingBalanceEl) {

    closingBalanceEl.textContent =
      money(
        summary.closing
      );

  }


  if (activeMembersEl) {

    activeMembersEl.textContent =
      summary.activeMembers;

  }


  if (membersPaidEl) {

    membersPaidEl.textContent =
      summary.paidCount;

  }


  if (membersPartialEl) {

    membersPartialEl.textContent =
      summary.partialCount;

  }


  if (membersOutstandingEl) {

    membersOutstandingEl.textContent =
      summary.outstandingCount;

  }


  if (collectionRateEl) {

    collectionRateEl.textContent =
      `${summary.collectionRate.toFixed(1)}%`;

  }


  if (periodStatusEl) {

    periodStatusEl.textContent =
      String(
        period?.status ||
        "open"
      ).toUpperCase();

  }

}


/* =========================================================
   RENDER CASHBOOK
========================================================= */

function renderCashbook() {

  if (!cashbookRows) {

    return;

  }


  const contributionEntries =
    contributions
      .filter(
        contribution =>
          monthKey(
            contribution.month ||
            contribution.contribution_date ||
            contribution.created_at
          ) ===
          (
            monthInput?.value ||
            currentMonth()
          )
      )
      .map(
        contribution => {

          const member =
            members.find(
              item =>
                String(
                  item.id
                ) ===
                String(
                  contribution.member_id
                )
            );


          return {

            date:
              contribution.contribution_date ||
              contribution.created_at,

            description:
              member?.name ||
              "Member contribution",

            type:
              contribution.contribution_type ||
              "Contribution",

            method:
              contribution.payment_method ||
              "—",

            reference:
              contribution.reference ||
              "—",

            amount:
              Number(
                contribution.amount ||
                0
              ),

            income:
              true

          };

        }
      );


  const expenseEntries =
    expenses
      .filter(
        expense =>
          String(
            expense.approval_status ||
            ""
          ).toLowerCase() ===
          "approved"
      )
      .map(
        expense => ({

          date:
            expense.date,

          description:
            expense.description,

          type:
            "Expense",

          method:
            "—",

          reference:
            expense.receipt_url ||
            "—",

          amount:
            Number(
              expense.amount ||
              0
            ),

          income:
            false

        })
      );


  const entries =
    [
      ...contributionEntries,
      ...expenseEntries
    ]
      .sort(
        (
          a,
          b
        ) => {

          const dateDifference =
            new Date(
              a.date
            ) -
            new Date(
              b.date
            );


          if (
            dateDifference !==
            0
          ) {

            return dateDifference;

          }


          return (
            a.income ===
            b.income
              ? 0
              : a.income
                ? -1
                : 1
          );

        }
      );


  if (!entries.length) {

    cashbookRows.innerHTML = `
      <tr>
        <td colspan="6">
          No transactions recorded for this month.
        </td>
      </tr>
    `;

    return;

  }


  cashbookRows.innerHTML =
    entries
      .map(
        entry => {

          const amount =
            entry.income
              ? `+${money(
                  entry.amount
                )}`
              : `-${money(
                  entry.amount
                )}`;


          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    entry.date
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.description
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.type
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.method
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.reference
                )}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    amount
                  )}
                </strong>
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   RENDER MEMBER REPORT
========================================================= */

function renderMembers(
  summary
) {

  if (!memberRows) {

    return;

  }


  const statuses =
    summary.memberStatuses;


  if (!statuses.length) {

    memberRows.innerHTML = `
      <tr>
        <td colspan="9">
          No active members found.
        </td>
      </tr>
    `;

    return;

  }


  memberRows.innerHTML =
    statuses
      .map(
        item => {

          const member =
            item.member;


          const memberNumber =
            member.member_number ||
            member.membership_number ||
            "—";


          const statusClass =
            item.status
              .toLowerCase();


          return `
            <tr>

              <td>
                <strong>
                  ${escapeHtml(
                    member.name
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  memberNumber
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    item.monthlyDue
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    item.previousOutstanding
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    item.appliedThisMonth
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    item.carryForward
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    item.currentOutstanding
                  )
                )}
              </td>

              <td>
                <strong
                  class="
                    report-status
                    report-status-${escapeHtml(
                      statusClass
                    )}
                  "
                >
                  ${escapeHtml(
                    item.status
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  money(
                    item.payment
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
   RENDER EXPENSES
========================================================= */

function renderExpenses() {

  if (!expenseRows) {

    return;

  }


  if (!expenses.length) {

    expenseRows.innerHTML = `
      <tr>
        <td colspan="5">
          No expenses recorded for this month.
        </td>
      </tr>
    `;

    return;

  }


  expenseRows.innerHTML =
    expenses
      .map(
        expense => {

          const status =
            String(
              expense.approval_status ||
              "pending"
            ).toLowerCase();


          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    expense.date
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  expense.description
                )}
              </td>

              <td>
                ${escapeHtml(
                  expense.category
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    expense.amount
                  )
                )}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    status
                  )}
                </strong>
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   UPDATE NEW REPORT METRICS
========================================================= */

function renderNewContributionMetrics(
  summary
) {

  const appliedEl =
    document.getElementById(
      "currentMonthApplied"
    );

  const carryForwardEl =
    document.getElementById(
      "carryForward"
    );

  const previousOutstandingEl =
    document.getElementById(
      "previousOutstanding"
    );


  if (appliedEl) {

    appliedEl.textContent =
      money(
        summary.currentMonthApplied
      );

  }


  if (carryForwardEl) {

    carryForwardEl.textContent =
      money(
        summary.currentMonthCarryForward
      );

  }


  if (previousOutstandingEl) {

    previousOutstandingEl.textContent =
      money(
        summary.previousOutstanding
      );

  }

}


/* =========================================================
   LOAD REPORT
========================================================= */

async function loadReport() {

  const month =
    monthInput?.value ||
    currentMonth();


  if (monthInput) {

    monthInput.value =
      month;

  }


  clearError();


  try {

    if (statusEl) {

      statusEl.textContent =
        "Loading report...";

    }


    await loadGroup();

    await loadMembers();

    await loadContributions(
      month
    );

    await loadExpenses(
      month
    );

    await loadFinancialPeriod(
      month
    );


    const summary =
      calculateReport(
        month
      );


    renderSummary(
      summary
    );

    renderNewContributionMetrics(
      summary
    );

    renderCashbook();

    renderMembers(
      summary
    );

    renderExpenses();


    if (statusEl) {

      statusEl.textContent =
        `Report loaded for ${month}.`;

    }

  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =========================================================
   PRINT
========================================================= */

function printReport() {

  window.print();

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initPage() {

  if (initialized) {

    return;

  }


  initialized =
    true;


  try {

    await requireAuth();


    currentMember =
      await getMyMember();


    if (
      !currentMember ||
      !currentMember.group_id
    ) {

      throw new Error(
        "No group is linked to your account."
      );

    }


    groupId =
      currentMember.group_id;


    const month =
      currentMonth();


    if (monthInput) {

      monthInput.value =
        month;

    }


    loadButton?.addEventListener(
      "click",
      loadReport
    );


    printButton?.addEventListener(
      "click",
      printReport
    );


    await loadReport();


    console.log(
      "CHAMA LIVE: reports page ready"
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


export const initReports =
  initPage;


console.log(
  "CHAMA LIVE: reports.js ready"
);
