/* =========================================================
   CHAMA LIVE — REPORTS
   ---------------------------------------------------------
   COMPLETE REPORTING MODULE

   CONTRIBUTION RULES
   ---------------------------------------------------------
   1. Previous outstanding is cleared first.
   2. Carry-forward credit is applied before new money.
   3. Current month's recurring due is then covered.
   4. Remaining money becomes carry-forward.
   5. ONLY contribution_type = "monthly" affects
      recurring monthly progress.
   6. ALL contribution types affect cash balance.
   7. ONLY approved expenses affect closing balance.
   8. Pending/rejected expenses do not affect balance.
   9. Closed periods use their stored closing balance.
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
  }).format(Number(value || 0));
}

function number(value) {
  return Number(value || 0);
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

    if (!currentMember || !currentMember.group_id) {
      throw new Error(
        "Unable to identify your group."
      );
    }

    groupId = currentMember.group_id;

    currentMonth = getCurrentMonth();

    const monthInput = $("month");

    if (monthInput) {

      monthInput.value = currentMonth;

      monthInput.addEventListener(
        "change",
        async () => {

          if (!monthInput.value) {
            return;
          }

          currentMonth = monthInput.value;

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
    } = await supabase
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
    } = await supabase
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
    } = await supabase
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
       Get history through selected month.

       Needed for:
       - arrears
       - carry-forward
       - monthly allocation
       - cash collection
    ===================================================== */

    const end =
      `${addMonths(currentMonth, 1)}-01`;

    const {
      data: contributions,
      error: contributionsError
    } = await supabase
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
      .lt("contribution_date", end)
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

    const start =
      `${currentMonth}-01`;

    const {
      data: expenses,
      error: expensesError
    } = await supabase
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
          String(
            member.status || "active"
          ).toLowerCase() === "active"
      );


    /* =====================================================
       MEMBER STATUS
    ===================================================== */

    const memberStatuses =
      activeMembers.map(member => ({
        member,

        ...calculateMemberStatus(
          member,
          currentMonth,
          group,
          contributions || []
        )
      }));


    /* =====================================================
       MONTHLY EXPECTED
    ===================================================== */

    const expected =
      memberStatuses.reduce(
        (total, item) =>
          total + number(item.monthlyDue),
        0
      );


    /* =====================================================
       CURRENT MONTH CONTRIBUTIONS
       -----------------------------------------------------
       ALL contribution types count as cash.
    ===================================================== */

    const currentMonthContributions =
      (contributions || []).filter(
        contribution => {

          const contributionMonth =
            monthKey(
              contribution.month ||
              contribution.contribution_date ||
              contribution.created_at
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
          number(contribution.amount),
        0
      );


    /* =====================================================
       MONTHLY CONTRIBUTIONS ONLY
    ===================================================== */

    const monthlyCollected =
      currentMonthContributions
        .filter(
          contribution =>
            String(
              contribution.contribution_type || ""
            ).toLowerCase() === "monthly"
        )
        .reduce(
          (total, contribution) =>
            total +
            number(contribution.amount),
          0
        );


    /* =====================================================
       OTHER CONTRIBUTIONS
    ===================================================== */

    const otherCollected =
      currentMonthContributions
        .filter(
          contribution =>
            String(
              contribution.contribution_type || ""
            ).toLowerCase() !== "monthly"
        )
        .reduce(
          (total, contribution) =>
            total +
            number(contribution.amount),
          0
        );


    /* =====================================================
       ALLOCATION TOTALS
    ===================================================== */

    const previousOutstanding =
      memberStatuses.reduce(
        (total, item) =>
          total +
          number(item.previousOutstanding),
        0
      );

    const clearedPrevious =
      memberStatuses.reduce(
        (total, item) =>
          total +
          number(item.clearedPrevious),
        0
      );

    const appliedThisMonth =
      memberStatuses.reduce(
        (total, item) =>
          total +
          number(item.appliedThisMonth),
        0
      );

    const carryForward =
      memberStatuses.reduce(
        (total, item) =>
          total +
          number(item.carryForward),
        0
      );

    const outstanding =
      memberStatuses.reduce(
        (total, item) =>
          total +
          number(item.currentOutstanding),
        0
      );


    /* =====================================================
       EXPENSE TOTALS
    ===================================================== */

    const approvedExpenses =
      (expenses || [])
        .filter(
          expense =>
            String(
              expense.approval_status || ""
            ).toLowerCase() === "approved"
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
            String(
              expense.approval_status || ""
            ).toLowerCase() === "pending"
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
            String(
              expense.approval_status || ""
            ).toLowerCase() === "rejected"
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
    ===================================================== */

    const isClosed =
      String(
        period?.status || ""
      ).toLowerCase() === "closed";


    const closing =
      isClosed &&
      period?.closing_balance !== null &&
      period?.closing_balance !== undefined

        ? number(period.closing_balance)

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
       ONLY current recurring allocation.
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

      members: activeMembers,

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
   MEMBER START MONTH
========================================================= */

function getMemberStartMonth(
  member,
  selectedMonth,
  contributions
) {

  const joinMonth =
    monthKey(member.join_date);


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


  return selectedMonth;

}


/* =========================================================
   MONTHLY PAYMENTS FOR MEMBER
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


      const type =
        String(
          contribution.contribution_type || ""
        ).toLowerCase();


      if (type !== "monthly") {

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
   CALCULATE MEMBER STATUS
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
        number(
          paymentsByMonth.get(key)
        );


      paymentsByMonth.set(
        key,
        current +
        number(
          contribution.amount
        )
      );

    }
  );


  let previousOutstanding = 0;

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
     PROCESS EACH MONTH
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


    let debtBeforeMonth =
      previousOutstanding;


    /* -----------------------------------------------------
       APPLY CARRY-FORWARD
    ----------------------------------------------------- */

    if (
      carryForward > 0 &&
      debtBeforeMonth <= 0
    ) {

      available +=
        carryForward;

      carryForward = 0;

    }


    /* -----------------------------------------------------
       CLEAR PREVIOUS ARREARS
    ----------------------------------------------------- */

    const clearedPrevious =
      Math.min(
        available,
        debtBeforeMonth
      );


    available -=
      clearedPrevious;


    debtBeforeMonth -=
      clearedPrevious;


    /* -----------------------------------------------------
       APPLY TO CURRENT MONTH
    ----------------------------------------------------- */

    const appliedThisMonth =
      Math.min(
        available,
        monthlyDue
      );


    available -=
      appliedThisMonth;


    /* -----------------------------------------------------
       CURRENT OUTSTANDING
    ----------------------------------------------------- */

    const currentOutstanding =
      Math.max(
        monthlyDue -
        appliedThisMonth,
        0
      );


    /* -----------------------------------------------------
       CARRY-FORWARD
    ----------------------------------------------------- */

    carryForward =
      Math.max(
        available,
        0
      );


    /* -----------------------------------------------------
       TOTAL DEBT AFTER CURRENT MONTH
    ----------------------------------------------------- */

    previousOutstanding =
      debtBeforeMonth +
      currentOutstanding;


    /* -----------------------------------------------------
       SELECTED MONTH
    ----------------------------------------------------- */

    if (
      processingMonth ===
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

        totalOutstanding:
          previousOutstanding,

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

  const {
    data,
    error
  } = await supabase
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


  const {
    data: group,
    error: groupError
  } = await supabase
    .from("groups")
    .select("opening_balance")
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

  const r = reportData;

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

  const r = reportData;

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
    members.map(item => {

      const member =
        item.member;


      return `
        <tr>

          <td>
            <strong>
              ${escapeHtml(member.name)}
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
            ${money(item.monthlyDue)}
          </td>

          <td>
            ${money(item.previousOutstanding)}
          </td>

          <td>
            ${money(item.payment)}
          </td>

          <td>
            ${money(item.clearedPrevious)}
          </td>

          <td>
            ${money(item.appliedThisMonth)}
          </td>

          <td>
            ${money(item.currentOutstanding)}
          </td>

          <td>
            <strong>
              ${escapeHtml(item.status)}
            </strong>
          </td>

        </tr>
      `;

    }).join("");

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
    reportData.members || [];


  tbody.innerHTML =
    contributions.map(
      contribution => {

        const member =
          members.find(
            item =>
              String(item.id) ===
              String(contribution.member_id)
          );


        return `
          <tr>

            <td>
              ${escapeHtml(
                member?.name || "Unknown member"
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
                contribution.contribution_date ||
                contribution.month ||
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
    ).join("");

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
    expenses.map(
      expense => {

        const status =
          String(
            expense.approval_status ||
            ""
          ).toLowerCase();


        return `
          <tr>

            <td>
              ${escapeHtml(
                expense.description
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
                  ? `<a
                       href="${escapeHtml(
                         expense.receipt_url
                       )}"
                       target="_blank"
                       rel="noopener"
                     >
                       View
                     </a>`
                  : "-"
              }
            </td>

          </tr>
        `;

      }
    ).join("");

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


  reportData.memberStatuses.forEach(
    item => {

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

    }
  );


  const csv =
    rows
      .map(
        row =>
          row.map(
            value =>
              `"${String(value)
                .replaceAll('"', '""')}"`
          ).join(",")
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


  link.href = url;

  link.download =
    `CHAMA-LIVE-${currentMonth}-member-report.csv`;


  document.body.appendChild(link);

  link.click();

  link.remove();

  URL.revokeObjectURL(url);

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


/* =========================================================
   MONTH DIFFERENCE
========================================================= */

function monthDifference(
  fromMonth,
  toMonth
) {

  const [
    fromYear,
    fromMonthNumber
  ] =
    String(fromMonth)
      .split("-")
      .map(Number);


  const [
    toYear,
    toMonthNumber
  ] =
    String(toMonth)
      .split("-")
      .map(Number);


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
    String(value);


  if (
    /^\d{4}-\d{2}/.test(text)
  ) {

    return text.slice(0, 7);

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


  const [
    year,
    monthNumber
  ] =
    String(month)
      .split("-")
      .map(Number);


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

    element.hidden = false;

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

    element.hidden = true;

    element.textContent = "";

  }

}


/* =========================================================
   START
========================================================= */

init();
