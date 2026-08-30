/* =========================================================
   CHAMA LIVE — REPORTS
   ---------------------------------------------------------
   COMPLETE STABLE REPORTING MODULE

   CONTRIBUTION RULES
   ---------------------------------------------------------
   1. Previous outstanding is cleared first.
   2. Existing carry-forward credit is applied before
      new money for the current month.
   3. Current month's recurring due is then covered.
   4. Remaining money becomes carry-forward.
   5. ONLY contribution_type = "monthly" affects
      recurring monthly progress.
   6. ALL contribution types affect cash balance.
   7. ONLY approved expenses affect closing balance.
   8. Pending/rejected expenses do not affect balance.
   9. Closed periods use their stored closing balance.
  10. Member calculations are processed chronologically.
========================================================= */

import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";


/* =========================================================
   HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);


function setText(id, value) {

  const el = $(id);

  if (el) {
    el.textContent = value;
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


function money(value) {

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number(value));

}


function number(value) {

  const n = Number(value);

  return Number.isFinite(n) ? n : 0;

}


function normalizeType(value) {

  return String(value || "")
    .trim()
    .toLowerCase();

}


function isMonthlyContribution(contribution) {

  return (
    normalizeType(
      contribution?.contribution_type
    ) === "monthly"
  );

}


/* =========================================================
   STATE
========================================================= */

let groupId = null;
let currentMember = null;
let currentMonth = "";
let reportData = null;


/* =========================================================
   INITIALIZE
========================================================= */

async function init() {

  try {

    currentMember = await getMyMember();

    if (
      !currentMember ||
      !currentMember.group_id
    ) {

      throw new Error(
        "Unable to identify your group."
      );

    }


    groupId =
      currentMember.group_id;


    currentMonth =
      getCurrentMonth();


    const monthInput =
      $("month");


    if (monthInput) {

      monthInput.value =
        currentMonth;


      monthInput.addEventListener(
        "change",
        async () => {

          if (!monthInput.value) {
            return;
          }

          currentMonth =
            monthInput.value;

          await loadReports();

        }
      );

    }


    $("printReport")
      ?.addEventListener(
        "click",
        printReport
      );


    $("exportCsv")
      ?.addEventListener(
        "click",
        exportCsv
      );


    $("refreshReport")
      ?.addEventListener(
        "click",
        loadReports
      );


    await loadReports();

  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   LOAD REPORTS
========================================================= */

async function loadReports() {

  clearError();


  if (!groupId) {

    showError(
      "Group could not be identified."
    );

    return;

  }


  setStatus(
    `Loading ${formatMonth(currentMonth)} report...`
  );


  try {

    /* =====================================================
       GROUP
    ===================================================== */

    const {
      data: group,
      error: groupError
    } =
      await supabase
        .from("groups")
        .select(`
          id,
          name,
          monthly_contribution,
          opening_balance
        `)
        .eq("id", groupId)
        .single();


    if (groupError) {
      throw groupError;
    }


    /* =====================================================
       FINANCIAL PERIOD
    ===================================================== */

    const {
      data: period,
      error: periodError
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
        .eq("group_id", groupId)
        .eq("month", currentMonth)
        .maybeSingle();


    if (periodError) {
      throw periodError;
    }


    /* =====================================================
       MEMBERS
    ===================================================== */

    const {
      data: members,
      error: membersError
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
        .eq("group_id", groupId)
        .order("name", {
          ascending: true
        });


    if (membersError) {
      throw membersError;
    }


    /* =====================================================
       CONTRIBUTIONS
       -----------------------------------------------------
       Load all contributions up to selected month.

       We need historical monthly contributions to calculate:

       - previous arrears
       - carry-forward
       - current month allocation
       - current month cash
    ===================================================== */

    const start =
      `${currentMonth}-01`;

    const end =
      `${addMonths(currentMonth, 1)}-01`;


    const {
      data: contributions,
      error: contributionsError
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
        .eq("group_id", groupId)
        .lt(
          "contribution_date",
          end
        )
        .order("contribution_date", {
          ascending: true
        })
        .order("created_at", {
          ascending: true
        });


    if (contributionsError) {
      throw contributionsError;
    }


    /* =====================================================
       EXPENSES
    ===================================================== */

    const {
      data: expenses,
      error: expensesError
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
        .eq("group_id", groupId)
        .gte("date", start)
        .lt("date", end)
        .order("date", {
          ascending: true
        })
        .order("created_at", {
          ascending: true
        });


    if (expensesError) {
      throw expensesError;
    }


    /* =====================================================
       ACTIVE MEMBERS
    ===================================================== */

    const activeMembers =
      (members || []).filter(
        member =>
          normalizeType(
            member.status || "active"
          ) === "active"
      );


    /* =====================================================
       MEMBER STATUS
    ===================================================== */

    const memberStatuses =
      activeMembers.map(member =>
        ({
          member,

          ...calculateMemberStatus(
            member,
            currentMonth,
            group,
            contributions || []
          )
        })
      );


    /* =====================================================
       MONTHLY EXPECTED
    ===================================================== */

    const expected =
      memberStatuses.reduce(
        (total, item) =>
          total +
          number(item.monthlyDue),
        0
      );


    /* =====================================================
       CURRENT MONTH CONTRIBUTIONS
       -----------------------------------------------------
       ALL contribution types affect cash.
    ===================================================== */

    const currentMonthContributions =
      (contributions || []).filter(
        contribution => {

          const contributionMonth =
            getContributionMonth(
              contribution
            );

          return (
            contributionMonth ===
            currentMonth
          );

        }
      );


    /* =====================================================
       CASH COLLECTION
    ===================================================== */

    const collected =
      currentMonthContributions.reduce(
        (total, contribution) =>
          total +
          number(
            contribution.amount
          ),
        0
      );


    /* =====================================================
       MONTHLY CONTRIBUTIONS ONLY
    ===================================================== */

    const monthlyCollected =
      currentMonthContributions
        .filter(
          isMonthlyContribution
        )
        .reduce(
          (total, contribution) =>
            total +
            number(
              contribution.amount
            ),
          0
        );


    /* =====================================================
       OTHER CONTRIBUTIONS
    ===================================================== */

    const otherCollected =
      currentMonthContributions
        .filter(
          contribution =>
            !isMonthlyContribution(
              contribution
            )
        )
        .reduce(
          (total, contribution) =>
            total +
            number(
              contribution.amount
            ),
          0
        );


    /* =====================================================
       ALLOCATION TOTALS
    ===================================================== */

    const previousOutstanding =
      memberStatuses.reduce(
        (total, item) =>
          total +
          number(
            item.previousOutstanding
          ),
        0
      );


    const clearedPrevious =
      memberStatuses.reduce(
        (total, item) =>
          total +
          number(
            item.clearedPrevious
          ),
        0
      );


    const appliedThisMonth =
      memberStatuses.reduce(
        (total, item) =>
          total +
          number(
            item.appliedThisMonth
          ),
        0
      );


    const carryForward =
      memberStatuses.reduce(
        (total, item) =>
          total +
          number(
            item.carryForward
          ),
        0
      );


    const outstanding =
      memberStatuses.reduce(
        (total, item) =>
          total +
          number(
            item.currentOutstanding
          ),
        0
      );


    /* =====================================================
       EXPENSE TOTALS
    ===================================================== */

    const approvedExpenses =
      (expenses || [])
        .filter(
          expense =>
            normalizeType(
              expense.approval_status
            ) === "approved"
        )
        .reduce(
          (total, expense) =>
            total +
            number(expense.amount),
          0
        );


    const pendingExpenses =
      (expenses || [])
        .filter(
          expense =>
            normalizeType(
              expense.approval_status
            ) === "pending"
        )
        .reduce(
          (total, expense) =>
            total +
            number(expense.amount),
          0
        );


    const rejectedExpenses =
      (expenses || [])
        .filter(
          expense =>
            normalizeType(
              expense.approval_status
            ) === "rejected"
        )
        .reduce(
          (total, expense) =>
            total +
            number(expense.amount),
          0
        );


    /* =====================================================
       OPENING BALANCE
    ===================================================== */

    let opening;


    if (period) {

      opening =
        number(
          period.opening_balance
        );

    } else {

      opening =
        await calculateOpeningBalance();

    }


    /* =====================================================
       CALCULATED CLOSING BALANCE
    ===================================================== */

    const calculatedClosing =
      opening +
      collected -
      approvedExpenses;


    /* =====================================================
       STORED CLOSING BALANCE
       -----------------------------------------------------
       Once a period is closed, its stored balance becomes
       authoritative.
    ===================================================== */

    const isClosed =
      normalizeType(
        period?.status
      ) === "closed";


    const hasStoredClosing =
      period &&
      period.closing_balance !== null &&
      period.closing_balance !== undefined;


    const closing =
      isClosed &&
      hasStoredClosing

        ? number(
            period.closing_balance
          )

        : calculatedClosing;


    /* =====================================================
       MEMBER COUNTS
    ===================================================== */

    const paidCount =
      memberStatuses.filter(
        item =>
          item.status === "Paid"
      ).length;


    const partialCount =
      memberStatuses.filter(
        item =>
          item.status === "Partial"
      ).length;


    const outstandingCount =
      memberStatuses.filter(
        item =>
          item.status === "Outstanding"
      ).length;


    /* =====================================================
       COLLECTION RATE
       -----------------------------------------------------
       Only recurring monthly obligation covered by the
       allocation engine.
    ===================================================== */

    const collectionRate =
      expected > 0

        ? Math.min(
            (
              appliedThisMonth /
              expected
            ) * 100,
            100
          )

        : 0;


    /* =====================================================
       REPORT DATA
    ===================================================== */

    reportData = {

      group,

      period,

      members:
        activeMembers,

      memberStatuses,

      contributions:
        currentMonthContributions,

      allContributions:
        contributions || [],

      expenses:
        expenses || [],

      expected,

      collected,

      monthlyCollected,

      otherCollected,

      previousOutstanding,

      clearedPrevious,

      appliedThisMonth,

      carryForward,

      outstanding,

      approvedExpenses,

      pendingExpenses,

      rejectedExpenses,

      opening,

      calculatedClosing,

      closing,

      paidCount,

      partialCount,

      outstandingCount,

      collectionRate

    };


    /* =====================================================
       RENDER
    ===================================================== */

    renderSummary();

    renderMemberReport();

    renderContributionReport();

    renderExpenseReport();

    renderContributionBreakdown();

    renderFinancialPosition();

    updateReportHeader();


    setStatus(
      `${formatMonth(currentMonth)} report loaded • ` +
      `${new Date().toLocaleString("en-KE")}`
    );


  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   CONTRIBUTION MONTH
   ---------------------------------------------------------
   Prefer the explicit contribution month.

   This is important because "month" is the accounting month
   while contribution_date is the physical payment date.
========================================================= */

function getContributionMonth(
  contribution
) {

  if (!contribution) {
    return "";
  }


  if (contribution.month) {

    const explicitMonth =
      monthKey(
        contribution.month
      );

    if (explicitMonth) {
      return explicitMonth;
    }

  }


  if (contribution.contribution_date) {

    const paymentDateMonth =
      monthKey(
        contribution.contribution_date
      );

    if (paymentDateMonth) {
      return paymentDateMonth;
    }

  }


  return monthKey(
    contribution.created_at
  );

}


/* =========================================================
   MEMBER START MONTH
========================================================= */

function getMemberStartMonth(
  member,
  selectedMonth,
  contributions
) {

  const joinMonth =
    monthKey(
      member?.join_date
    );


  if (
    joinMonth &&
    joinMonth <= selectedMonth
  ) {

    return joinMonth;

  }


  const memberPayments =
    contributions
      .filter(
        contribution =>
          String(
            contribution.member_id
          ) ===
          String(member.id)
      )
      .map(
        contribution =>
          getContributionMonth(
            contribution
          )
      )
      .filter(Boolean)
      .filter(
        month =>
          month <= selectedMonth
      )
      .sort();


  if (memberPayments.length) {

    return memberPayments[0];

  }


  return selectedMonth;

}


/* =========================================================
   MONTHLY PAYMENTS FOR MEMBER
   ---------------------------------------------------------
   ONLY monthly contributions participate in recurring
   contribution calculations.
========================================================= */

function getMonthlyPaymentsForMember(
  memberId,
  upToMonth,
  contributions
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


      if (
        !isMonthlyContribution(
          contribution
        )
      ) {

        return false;

      }


      const paymentMonth =
        getContributionMonth(
          contribution
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
   CALCULATE MEMBER STATUS
   ---------------------------------------------------------
   Accounting algorithm:

   Example:

   Monthly due = 200

   Month 1:
     payment = 100
     outstanding = 100

   Month 2:
     payment = 300

     clear previous 100
     remaining 200
     cover current 200
     carry-forward = 0

   Month 3:
     payment = 500

     cover current 200
     carry-forward = 300

   Month 4:
     payment = 100

     use carry-forward 300
     current due 200 is already covered
     remaining 200 becomes carry-forward

   This keeps the calculation chronological.
========================================================= */

function calculateMemberStatus(
  member,
  selectedMonth,
  group,
  contributions
) {

  const monthlyDue =
    number(
      group?.monthly_contribution
    );


  const startMonth =
    getMemberStartMonth(
      member,
      selectedMonth,
      contributions
    );


  const payments =
    getMonthlyPaymentsForMember(
      member.id,
      selectedMonth,
      contributions
    );


  /* =======================================================
     GROUP PAYMENTS BY ACCOUNTING MONTH
  ======================================================= */

  const paymentsByMonth =
    new Map();


  payments.forEach(
    contribution => {

      const key =
        getContributionMonth(
          contribution
        );


      if (!key) {
        return;
      }


      const existing =
        number(
          paymentsByMonth.get(key)
        );


      paymentsByMonth.set(
        key,
        existing +
        number(
          contribution.amount
        )
      );

    }
  );


  let totalOutstanding = 0;

  let carryForward = 0;

  let selectedResult = null;


  const months =
    Math.max(
      0,
      monthDifference(
        startMonth,
        selectedMonth
      )
    );


  /* =======================================================
     PROCESS MONTHS CHRONOLOGICALLY
  ======================================================= */

  for (
    let index = 0;
    index <= months;
    index++
  ) {

    const processingMonth =
      addMonths(
        startMonth,
        index
      );


    const payment =
      number(
        paymentsByMonth.get(
          processingMonth
        )
      );


    let available =
      payment;


    const debtBeforeMonth =
      Math.max(
        totalOutstanding,
        0
      );


    let previousOutstanding =
      debtBeforeMonth;


    /* =====================================================
       APPLY EXISTING CREDIT FIRST

       Carry-forward represents money already received
       earlier and not yet needed for a recurring month.

       It is therefore applied before new money.
    ===================================================== */

    if (carryForward > 0) {

      available +=
        carryForward;

      carryForward = 0;

    }


    /* =====================================================
       CLEAR PREVIOUS OUTSTANDING
    ===================================================== */

    const clearedPrevious =
      Math.min(
        available,
        previousOutstanding
      );


    available -=
      clearedPrevious;


    previousOutstanding -=
      clearedPrevious;


    /* =====================================================
       COVER CURRENT MONTH
    ===================================================== */

    const appliedThisMonth =
      Math.min(
        available,
        monthlyDue
      );


    available -=
      appliedThisMonth;


    /* =====================================================
       CURRENT MONTH OUTSTANDING
    ===================================================== */

    const currentOutstanding =
      Math.max(
        monthlyDue -
        appliedThisMonth,
        0
      );


    /* =====================================================
       REMAINING CREDIT
    ===================================================== */

    carryForward =
      Math.max(
        available,
        0
      );


    /* =====================================================
       TOTAL OUTSTANDING

       Previous debt not cleared +
       current month debt.
    ===================================================== */

    totalOutstanding =
      Math.max(
        previousOutstanding,
        0
      ) +
      currentOutstanding;


    /* =====================================================
       SELECTED MONTH
    ===================================================== */

    if (
      processingMonth ===
      selectedMonth
    ) {

      let status;


      if (
        currentOutstanding <= 0
      ) {

        status = "Paid";

      } else if (
        appliedThisMonth > 0
      ) {

        status = "Partial";

      } else {

        status = "Outstanding";

      }


      selectedResult = {

        monthlyDue,

        payment,

        previousOutstanding:
          debtBeforeMonth,

        clearedPrevious,

        appliedThisMonth,

        carryForward,

        currentOutstanding,

        totalOutstanding,

        status

      };

    }

  }


  /* =======================================================
     FALLBACK
  ======================================================= */

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

      totalOutstanding:
        monthlyDue,

      status:
        "Outstanding"

    }
  );

}


/* =========================================================
   CALCULATE OPENING BALANCE
========================================================= */

async function calculateOpeningBalance() {

  /* =======================================================
     FIRST: LAST CLOSED PERIOD
  ======================================================= */

  const {
    data,
    error
  } =
    await supabase
      .from("financial_periods")
      .select(`
        month,
        closing_balance,
        status
      `)
      .eq("group_id", groupId)
      .eq("status", "closed")
      .lt("month", currentMonth)
      .order("month", {
        ascending: false
      })
      .limit(1);


  if (error) {
    throw error;
  }


  if (
    data &&
    data.length &&
    data[0].closing_balance !== null &&
    data[0].closing_balance !== undefined
  ) {

    return number(
      data[0].closing_balance
    );

  }


  /* =======================================================
     SECOND: GROUP OPENING BALANCE
  ======================================================= */

  const {
    data: group,
    error: groupError
  } =
    await supabase
      .from("groups")
      .select(
        "opening_balance"
      )
      .eq("id", groupId)
      .single();


  if (groupError) {
    throw groupError;
  }


  return number(
    group?.opening_balance
  );

}


/* =========================================================
   RENDER SUMMARY
========================================================= */

function renderSummary() {

  const r =
    reportData;


  if (!r) {
    return;
  }


  setText(
    "openingBalance",
    money(r.opening)
  );


  setText(
    "expected",
    money(r.expected)
  );


  setText(
    "collected",
    money(r.collected)
  );


  setText(
    "monthlyCollected",
    money(r.monthlyCollected)
  );


  setText(
    "otherCollected",
    money(r.otherCollected)
  );


  setText(
    "previousOutstanding",
    money(r.previousOutstanding)
  );


  setText(
    "appliedThisMonth",
    money(r.appliedThisMonth)
  );


  setText(
    "carryForward",
    money(r.carryForward)
  );


  setText(
    "outstanding",
    money(r.outstanding)
  );


  setText(
    "approvedExpenses",
    money(r.approvedExpenses)
  );


  setText(
    "pendingExpenses",
    money(r.pendingExpenses)
  );


  setText(
    "rejectedExpenses",
    money(r.rejectedExpenses)
  );


  setText(
    "closingBalance",
    money(r.closing)
  );


  setText(
    "memberCount",
    r.members.length
  );


  setText(
    "membersPaid",
    r.paidCount
  );


  setText(
    "membersPartial",
    r.partialCount
  );


  setText(
    "membersOutstanding",
    r.outstandingCount
  );


  setText(
    "collectionRate",
    `${r.collectionRate.toFixed(1)}%`
  );


  setText(
    "periodStatus",
    String(
      r.period?.status ||
      "OPEN"
    ).toUpperCase()
  );

}


/* =========================================================
   RENDER FINANCIAL POSITION
========================================================= */

function renderFinancialPosition() {

  const r =
    reportData;


  if (!r) {
    return;
  }


  setText(
    "opening2",
    money(r.opening)
  );


  setText(
    "contributions2",
    money(r.collected)
  );


  setText(
    "expenses2",
    money(r.approvedExpenses)
  );


  setText(
    "balance2",
    money(r.closing)
  );

}


/* =========================================================
   RENDER MEMBER REPORT
========================================================= */

function renderMemberReport() {

  const tbody =
    $("memberRows");


  if (!tbody) {
    return;
  }


  const members =
    reportData?.memberStatuses || [];


  if (!members.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="9">
          No active members found.
        </td>
      </tr>
    `;

    return;

  }


  tbody.innerHTML =
    members
      .map(item => {

        const member =
          item.member;


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
                member.member_number ||
                member.membership_number ||
                "-"
              )}
            </td>

            <td>
              ${money(
                item.monthlyDue
              )}
            </td>

            <td>
              ${money(
                item.previousOutstanding
              )}
            </td>

            <td>
              ${money(
                item.payment
              )}
            </td>

            <td>
              ${money(
                item.clearedPrevious
              )}
            </td>

            <td>
              ${money(
                item.appliedThisMonth
              )}
            </td>

            <td>
              ${money(
                item.currentOutstanding
              )}
            </td>

            <td>
              <strong>
                ${escapeHtml(
                  item.status
                )}
              </strong>
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   RENDER CONTRIBUTION REPORT
========================================================= */

function renderContributionReport() {

  const tbody =
    $("contributionRows");


  if (!tbody) {
    return;
  }


  const contributions =
    reportData?.contributions || [];


  if (!contributions.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          No contributions recorded for this month.
        </td>
      </tr>
    `;

    return;

  }


  const members =
    reportData?.members || [];


  tbody.innerHTML =
    contributions
      .map(
        contribution => {

          const member =
            members.find(
              item =>
                String(item.id) ===
                String(
                  contribution.member_id
                )
            );


          return `
            <tr>

              <td>
                ${escapeHtml(
                  member?.name ||
                  "Unknown member"
                )}
              </td>

              <td>
                ${escapeHtml(
                  contribution.contribution_type ||
                  "-"
                )}
              </td>

              <td>
                <strong>
                  ${money(
                    contribution.amount
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  contribution.payment_method ||
                  "-"
                )}
              </td>

              <td>
                ${escapeHtml(
                  contribution.reference ||
                  "-"
                )}
              </td>

              <td>
                ${escapeHtml(
                  getContributionMonth(
                    contribution
                  ) ||
                  "-"
                )}
              </td>

              <td>
                ${escapeHtml(
                  contribution.notes ||
                  ""
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   RENDER EXPENSE REPORT
========================================================= */

function renderExpenseReport() {

  const tbody =
    $("expenseRows");


  if (!tbody) {
    return;
  }


  const expenses =
    reportData?.expenses || [];


  if (!expenses.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          No expenses recorded for this month.
        </td>
      </tr>
    `;

    return;

  }


  tbody.innerHTML =
    expenses
      .map(
        expense => {

          const status =
            normalizeType(
              expense.approval_status
            );


          return `
            <tr>

              <td>
                ${escapeHtml(
                  expense.description ||
                  "-"
                )}
              </td>

              <td>
                ${escapeHtml(
                  expense.category ||
                  "-"
                )}
              </td>

              <td>
                <strong>
                  ${money(
                    expense.amount
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  expense.date ||
                  "-"
                )}
              </td>

              <td>
                ${escapeHtml(
                  status
                    ? status.toUpperCase()
                    : "-"
                )}
              </td>

              <td>
                ${
                  expense.receipt_url

                    ? `
                      <a
                        href="${escapeHtml(
                          expense.receipt_url
                        )}"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View
                      </a>
                    `

                    : "-"
                }
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   CONTRIBUTION BREAKDOWN
========================================================= */

function renderContributionBreakdown() {

  const monthly =
    $("monthlyContributionTotal");


  const other =
    $("otherContributionTotal");


  const total =
    $("totalContributionTotal");


  if (monthly) {

    monthly.textContent =
      money(
        reportData?.monthlyCollected
      );

  }


  if (other) {

    other.textContent =
      money(
        reportData?.otherCollected
      );

  }


  if (total) {

    total.textContent =
      money(
        reportData?.collected
      );

  }

}


/* =========================================================
   REPORT HEADER
========================================================= */

function updateReportHeader() {

  const r =
    reportData;


  if (!r) {
    return;
  }


  setText(
    "reportGroupName",
    r.group?.name ||
    "CHAMA"
  );


  setText(
    "reportMonth",
    formatMonth(
      currentMonth
    )
  );


  setText(
    "reportGenerated",
    new Date().toLocaleString(
      "en-KE"
    )
  );

}


/* =========================================================
   PRINT
========================================================= */

function printReport() {

  if (!reportData) {

    showError(
      "Report data is not loaded."
    );

    return;

  }


  window.print();

}


/* =========================================================
   CSV EXPORT
========================================================= */

function exportCsv() {

  if (!reportData) {

    showError(
      "Report data is not loaded."
    );

    return;

  }


  const rows = [

    [
      "Member",
      "Member Number",
      "Monthly Due",
      "Previous Outstanding",
      "Payment",
      "Cleared Previous",
      "Applied Current Month",
      "Current Outstanding",
      "Status"
    ]

  ];


  reportData.memberStatuses
    .forEach(item => {

      const member =
        item.member;


      rows.push([

        member.name || "",

        member.member_number ||
        member.membership_number ||
        "",

        number(
          item.monthlyDue
        ),

        number(
          item.previousOutstanding
        ),

        number(
          item.payment
        ),

        number(
          item.clearedPrevious
        ),

        number(
          item.appliedThisMonth
        ),

        number(
          item.currentOutstanding
        ),

        item.status || ""

      ]);

    });


  const csv =
    rows
      .map(
        row =>
          row
            .map(
              value =>
                `"${String(value)
                  .replaceAll(
                    '"',
                    '""'
                  )}"`
            )
            .join(",")
      )
      .join("\n");


  const blob =
    new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8;"
      }
    );


  const url =
    URL.createObjectURL(blob);


  const link =
    document.createElement("a");


  link.href =
    url;


  link.download =
    `CHAMA-LIVE-${currentMonth}-member-report.csv`;


  document.body.appendChild(
    link
  );


  link.click();


  link.remove();


  URL.revokeObjectURL(
    url
  );

}


/* =========================================================
   CURRENT MONTH
========================================================= */

function getCurrentMonth() {

  const now =
    new Date();


  return [

    now.getFullYear(),

    String(
      now.getMonth() + 1
    ).padStart(2, "0")

  ].join("-");

}


/* =========================================================
   ADD MONTHS
========================================================= */

function addMonths(
  month,
  amount
) {

  const parts =
    String(month)
      .split("-")
      .map(Number);


  const year =
    parts[0];


  const monthNumber =
    parts[1];


  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthNumber)
  ) {

    return "";

  }


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


/* =========================================================
   MONTH DIFFERENCE
========================================================= */

function monthDifference(
  fromMonth,
  toMonth
) {

  const fromParts =
    String(fromMonth)
      .split("-")
      .map(Number);


  const toParts =
    String(toMonth)
      .split("-")
      .map(Number);


  const fromYear =
    fromParts[0];


  const fromMonthNumber =
    fromParts[1];


  const toYear =
    toParts[0];


  const toMonthNumber =
    toParts[1];


  if (
    !Number.isFinite(fromYear) ||
    !Number.isFinite(fromMonthNumber) ||
    !Number.isFinite(toYear) ||
    !Number.isFinite(toMonthNumber)
  ) {

    return 0;

  }


  return (
    (toYear - fromYear) * 12 +
    (toMonthNumber - fromMonthNumber)
  );

}


/* =========================================================
   MONTH KEY
========================================================= */

function monthKey(value) {

  if (!value) {
    return "";
  }


  const text =
    String(value).trim();


  /* =======================================================
     YYYY-MM
     YYYY-MM-DD
     YYYY-MM-DDTHH...
  ======================================================= */

  const isoMatch =
    text.match(
      /^(\d{4})-(\d{2})/
    );


  if (isoMatch) {

    return (
      `${isoMatch[1]}-${isoMatch[2]}`
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


/* =========================================================
   FORMAT MONTH
========================================================= */

function formatMonth(month) {

  if (!month) {
    return "Selected month";
  }


  const parts =
    String(month)
      .split("-")
      .map(Number);


  const year =
    parts[0];


  const monthNumber =
    parts[1];


  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthNumber)
  ) {

    return "Selected month";

  }


  return new Date(
    year,
    monthNumber - 1,
    1
  ).toLocaleDateString(
    "en-KE",
    {
      month: "long",
      year: "numeric"
    }
  );

}


/* =========================================================
   STATUS
========================================================= */

function setStatus(message) {

  const element =
    $("status");


  if (element) {

    element.textContent =
      message;

  }

}


/* =========================================================
   ERROR
========================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE Reports:",
    error
  );


  const message =
    error?.message ||
    String(
      error ||
      "Unable to load reports."
    );


  const element =
    $("error");


  if (element) {

    element.hidden =
      false;


    element.textContent =
      message;

  }


  setStatus(
    "Unable to load reports."
  );

}


/* =========================================================
   CLEAR ERROR
========================================================= */

function clearError() {

  const element =
    $("error");


  if (element) {

    element.hidden =
      true;


    element.textContent =
      "";

  }

}


/* =========================================================
   START
========================================================= */

init();
