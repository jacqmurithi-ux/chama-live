/* =========================================================
   CHAMA LIVE — MONTHLY CLOSING
   ---------------------------------------------------------
   Uses the SAME contribution allocation logic as reports.js.

   RULES:
   1. Previous outstanding is cleared first.
   2. Carry-forward credit is applied before new money.
   3. Current month's recurring due is then covered.
   4. Anything remaining becomes carry-forward.
   5. Only monthly contributions affect recurring progress.
   6. All actual contributions affect cash balance.
   7. Only approved expenses affect closing balance.
   8. Pending/rejected expenses do not affect closing balance.
   9. Closed periods use their stored closing balance.
========================================================= */

import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";


/* =========================================================
   HELPERS
========================================================= */

const $ = (id) =>
  document.getElementById(id);


/* =========================================================
   STATE
========================================================= */

let groupId = null;

let currentMember = null;

let currentMonth = "";

let currentSummary = null;


/* =========================================================
   INITIALIZE
========================================================= */

async function init() {

  try {

    currentMember =
      await getMyMember();


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


    /* -----------------------------------------
       Default month
    ----------------------------------------- */

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


          await loadMonthlyClosing();

        }
      );

    }


    /* -----------------------------------------
       Buttons
    ----------------------------------------- */

    $("closeMonth")
      ?.addEventListener(
        "click",
        closeMonth
      );


    $("reopenMonth")
      ?.addEventListener(
        "click",
        reopenMonth
      );


    $("printReport")
      ?.addEventListener(
        "click",
        printMonthlyReport
      );


    /* -----------------------------------------
       Initial load
    ----------------------------------------- */

    await loadMonthlyClosing();


  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   LOAD MONTHLY CLOSING
========================================================= */

async function loadMonthlyClosing() {

  clearError();


  setStatus(
    `Loading ${formatMonth(
      currentMonth
    )}...`
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
        .eq(
          "id",
          groupId
        )
        .single();


    if (groupError) {
      throw groupError;
    }


    /* =====================================================
       FINANCIAL PERIOD
    ===================================================== */

    let {
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
        .eq(
          "group_id",
          groupId
        )
        .eq(
          "month",
          currentMonth
        )
        .maybeSingle();


    if (periodError) {
      throw periodError;
    }


    /* =====================================================
       CREATE PERIOD IF MISSING
    ===================================================== */

    if (!period) {

      const opening =
        await calculateOpeningBalance();


      const {
        data: createdPeriod,
        error: createError
      } =
        await supabase
          .from("financial_periods")
          .insert({
            group_id:
              groupId,

            month:
              currentMonth,

            opening_balance:
              opening,

            status:
              "open"
          })
          .select()
          .single();


      if (createError) {
        throw createError;
      }


      period =
        createdPeriod;

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
        .eq(
          "group_id",
          groupId
        )
        .order(
          "name",
          {
            ascending:
              true
          }
        );


    if (membersError) {
      throw membersError;
    }


    /* =====================================================
       CONTRIBUTIONS
       -----------------------------------------------------
       We need history up to selected month.

       This is necessary for:
       - previous outstanding
       - carry-forward
       - current-month application
    ===================================================== */

    const end =
      `${addMonths(
        currentMonth,
        1
      )}-01`;


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
            ascending:
              true
          }
        )
        .order(
          "created_at",
          {
            ascending:
              true
          }
        );


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
            ascending:
              true
          }
        )
        .order(
          "created_at",
          {
            ascending:
              true
          }
        );


    if (expensesError) {
      throw expensesError;
    }


    /* =====================================================
       MONTHLY CONTRIBUTION ALLOCATION
    ===================================================== */

    const monthlyContribution =
      Number(
        group.monthly_contribution ||
        0
      );


    const activeMembers =
      (members || [])
        .filter(
          member =>
            String(
              member.status ||
              "active"
            ).toLowerCase() ===
            "active"
        );


    const memberStatuses =
      activeMembers.map(
        member => {

          return {

            member,

            ...calculateMemberStatus(
              member,
              currentMonth,
              group,
              contributions || []
            )

          };

        }
      );


    /* =====================================================
       MONTHLY EXPECTED
    ===================================================== */

    const expected =
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


    /* =====================================================
       CURRENT MONTH CASH COLLECTION
       -----------------------------------------------------
       ALL contribution types count as cash.

       Monthly allocation is handled separately.
    ===================================================== */

    const currentMonthContributions =
      (contributions || [])
        .filter(
          contribution => {

            const paymentMonth =
              monthKey(
                contribution.month ||
                contribution.contribution_date ||
                contribution.created_at
              );


            return (
              paymentMonth ===
              currentMonth
            );

          }
        );


    const collected =
      currentMonthContributions.reduce(
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


    /* =====================================================
       ALLOCATION TOTALS
    ===================================================== */

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


    const appliedThisMonth =
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


    const carryForward =
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


    const outstanding =
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


    /* =====================================================
       APPROVED EXPENSES
    ===================================================== */

    const approvedExpenses =
      (expenses || [])
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


    /* =====================================================
       PENDING EXPENSES
    ===================================================== */

    const pendingExpenses =
      (expenses || [])
        .filter(
          expense =>
            String(
              expense.approval_status ||
              ""
            ).toLowerCase() ===
            "pending"
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


    /* =====================================================
       REJECTED EXPENSES
    ===================================================== */

    const rejectedExpenses =
      (expenses || [])
        .filter(
          expense =>
            String(
              expense.approval_status ||
              ""
            ).toLowerCase() ===
            "rejected"
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


    /* =====================================================
       OPENING BALANCE
    ===================================================== */

    const opening =
      Number(
        period.opening_balance ??
        group.opening_balance ??
        0
      );


    /* =====================================================
       CLOSING BALANCE
       -----------------------------------------------------
       IMPORTANT:

       Carry-forward is NOT subtracted.

       It is already included in actual cash collected.

       Example:

       Opening       0
       Contributions 900
       Expenses      1050

       Closing      -150
    ===================================================== */

    const calculatedClosing =
      opening +
      collected -
      approvedExpenses;


    const periodIsClosed =
      String(
        period.status ||
        ""
      ).toLowerCase() ===
      "closed";


    const closing =
      periodIsClosed &&
      period.closing_balance !== null &&
      period.closing_balance !== undefined

        ? Number(
            period.closing_balance
          )

        : calculatedClosing;


    /* =====================================================
       COUNTS
    ===================================================== */

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


    /* =====================================================
       COLLECTION RATE
       -----------------------------------------------------
       ONLY applied current-month recurring contribution
       counts toward progress.

       Carry-forward does not inflate progress.

       Maximum = 100%.
    ===================================================== */

    const collectionRate =
      expected > 0

        ? Math.min(
            (
              appliedThisMonth /
              expected
            ) *
            100,
            100
          )

        : 0;


    /* =====================================================
       SAVE SUMMARY
    ===================================================== */

    currentSummary = {

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

      previousOutstanding,

      appliedThisMonth,

      carryForward,

      outstanding,

      approvedExpenses,

      pendingExpenses,

      rejectedExpenses,

      opening,

      closing,

      calculatedClosing,

      paidCount,

      partialCount,

      outstandingCount,

      collectionRate

    };


    /* =====================================================
       RENDER
    ===================================================== */

    renderSummary();

    renderMemberStatus();

    updateButtons();


    setStatus(
      `Monthly financials loaded • ${new Date().toLocaleString(
        "en-KE"
      )}`
    );


  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   MEMBER START MONTH
   ---------------------------------------------------------
   Same rule as reports.js.

   1. Use join_date when available.
   2. Otherwise use earliest contribution.
   3. Otherwise start at selected month.
========================================================= */

function getMemberStartMonth(
  member,
  selectedMonth,
  contributions
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


  if (
    memberPayments.length
  ) {

    return memberPayments[0];

  }


  return selectedMonth;

}


/* =========================================================
   GET MONTHLY PAYMENTS
   ---------------------------------------------------------
   ONLY "monthly" contributions participate in recurring
   monthly allocation.

   Registration/welfare/special/etc. remain cash but do not
   inflate recurring monthly collection progress.
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
        String(
          memberId
        )
      ) {

        return false;

      }


      const type =
        String(
          contribution.contribution_type ||
          ""
        ).toLowerCase();


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
   CALCULATE MEMBER STATUS
   ---------------------------------------------------------
   THIS IS THE SAME CORE MODEL USED BY REPORTS.JS.

   Flow:

   Previous outstanding
           ↓
   Carry-forward
           ↓
   Current payment
           ↓
   Previous arrears
           ↓
   Current month due
           ↓
   Carry-forward
========================================================= */

function calculateMemberStatus(
  member,
  selectedMonth,
  group,
  contributions
) {

  const monthlyDue =
    Number(
      group?.monthly_contribution ||
      0
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


  /* =======================================================
     PROCESS EVERY MONTH FROM MEMBER START
     TO SELECTED MONTH
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
      Number(
        paymentsByMonth.get(
          processingMonth
        ) ||
        0
      );


    let available =
      payment;


    let debtBeforeMonth =
      previousOutstanding;


    /* -----------------------------------------
       Use carry-forward first.

       Credit should not coexist with debt.
    ----------------------------------------- */

    if (
      carryForward > 0 &&
      debtBeforeMonth <= 0
    ) {

      available +=
        carryForward;


      carryForward =
        0;

    }


    /* -----------------------------------------
       Clear previous arrears first.
    ----------------------------------------- */

    const clearedPrevious =
      Math.min(
        available,
        debtBeforeMonth
      );


    available -=
      clearedPrevious;


    debtBeforeMonth -=
      clearedPrevious;


    /* -----------------------------------------
       Apply remaining amount to current month.
    ----------------------------------------- */

    const appliedThisMonth =
      Math.min(
        available,
        monthlyDue
      );


    available -=
      appliedThisMonth;


    /* -----------------------------------------
       Current outstanding
    ----------------------------------------- */

    const currentOutstanding =
      Math.max(
        monthlyDue -
        appliedThisMonth,
        0
      );


    /* -----------------------------------------
       Remaining amount becomes credit.
    ----------------------------------------- */

    carryForward =
      Math.max(
        available,
        0
      );


    /* -----------------------------------------
       Debt after current month.
    ----------------------------------------- */

    previousOutstanding =
      debtBeforeMonth +
      currentOutstanding;


    /* -----------------------------------------
       Capture selected month.
    ----------------------------------------- */

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

      payment:
        0,

      previousOutstanding:
        0,

      clearedPrevious:
        0,

      appliedThisMonth:
        0,

      carryForward:
        0,

      currentOutstanding:
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
  } =
    await supabase
      .from("financial_periods")
      .select(`
        month,
        closing_balance,
        status
      `)
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "status",
        "closed"
      )
      .lt(
        "month",
        currentMonth
      )
      .order(
        "month",
        {
          ascending:
            false
        }
      )
      .limit(1);


  if (error) {
    throw error;
  }


  if (
    data &&
    data.length > 0 &&
    data[0].closing_balance !== null &&
    data[0].closing_balance !== undefined
  ) {

    return Number(
      data[0].closing_balance
    );

  }


  /* -----------------------------------------
     No previous closed period.
     Use group opening balance.
  ----------------------------------------- */

  const {
    data: group,
    error: groupError
  } =
    await supabase
      .from("groups")
      .select(
        "opening_balance"
      )
      .eq(
        "id",
        groupId
      )
      .single();


  if (groupError) {
    throw groupError;
  }


  return Number(
    group?.opening_balance ||
    0
  );

}


/* =========================================================
   RENDER SUMMARY
========================================================= */

function renderSummary() {

  const s =
    currentSummary;


  if (!s) {
    return;
  }


  setText(
    "openingBalance",
    money(
      s.opening
    )
  );


  setText(
    "expected",
    money(
      s.expected
    )
  );


  setText(
    "collected",
    money(
      s.collected
    )
  );


  setText(
    "outstanding",
    money(
      s.outstanding
    )
  );


  setText(
    "approvedExpenses",
    money(
      s.approvedExpenses
    )
  );


  setText(
    "closingBalance",
    money(
      s.closing
    )
  );


  setText(
    "memberCount",
    s.members.length
  );


  setText(
    "membersPaid",
    s.paidCount
  );


  setText(
    "membersPartial",
    s.partialCount
  );


  setText(
    "membersOutstanding",
    s.outstandingCount
  );


  setText(
    "collectionRate",
    `${s.collectionRate.toFixed(
      1
    )}%`
  );


  setText(
    "periodStatus",
    String(
      s.period.status ||
      "open"
    ).toUpperCase()
  );


  /* -----------------------------------------
     Financial position
  ----------------------------------------- */

  setText(
    "opening2",
    money(
      s.opening
    )
  );


  setText(
    "contributions2",
    money(
      s.collected
    )
  );


  setText(
    "expenses2",
    money(
      s.approvedExpenses
    )
  );


  setText(
    "balance2",
    money(
      s.closing
    )
  );


  /* -----------------------------------------
     Expense summary
  ----------------------------------------- */

  setText(
    "approved2",
    money(
      s.approvedExpenses
    )
  );


  setText(
    "pendingExpenses",
    money(
      s.pendingExpenses
    )
  );


  setText(
    "rejectedExpenses",
    money(
      s.rejectedExpenses
    )
  );

}


/* =========================================================
   RENDER MEMBER STATUS
========================================================= */

function renderMemberStatus() {

  const tbody =
    $("memberRows");


  if (!tbody) {
    return;
  }


  const members =
    currentSummary?.memberStatuses ||
    [];


  if (!members.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          No active members found.
        </td>
      </tr>
    `;

    return;

  }


  tbody.innerHTML =
    members
      .map(
        item => {

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
                ${money(
                  item.monthlyDue
                )}
              </td>

              <td>
                <strong>
                  ${money(
                    item.appliedThisMonth
                  )}
                </strong>
              </td>

              <td>
                ${money(
                  item.currentOutstanding
                )}
              </td>

              <td>
                ${escapeHtml(
                  item.status
                )}
              </td>

            </tr>

          `;

        }
      )
      .join("");

}


/* =========================================================
   UPDATE BUTTONS
========================================================= */

function updateButtons() {

  const closed =
    String(
      currentSummary?.period?.status ||
      "open"
    ).toLowerCase() ===
    "closed";


  const closeButton =
    $("closeMonth");


  const reopenButton =
    $("reopenMonth");


  if (closeButton) {

    closeButton.hidden =
      closed;

  }


  if (reopenButton) {

    reopenButton.hidden =
      !closed;

  }

}


/* =========================================================
   CLOSE MONTH
========================================================= */

async function closeMonth() {

  if (!currentSummary) {

    showError(
      "Monthly financial data is not loaded."
    );

    return;

  }


  const s =
    currentSummary;


  if (
    String(
      s.period.status
    ).toLowerCase() ===
    "closed"
  ) {

    showError(
      "This month is already closed."
    );

    return;

  }


  /* -----------------------------------------
     Confirmation
  ----------------------------------------- */

  const confirmed =
    window.confirm(

      `Close ${formatMonth(
        currentMonth
      )}?

Opening balance:
${money(
  s.opening
)}

Contributions collected:
${money(
  s.collected
)}

Applied to current month:
${money(
  s.appliedThisMonth
)}

Carry-forward:
${money(
  s.carryForward
)}

Current outstanding:
${money(
  s.outstanding
)}

Approved expenses:
${money(
  s.approvedExpenses
)}

Closing balance:
${money(
  s.calculatedClosing
)}

This action should only be performed after reviewing the report.`

    );


  if (!confirmed) {
    return;
  }


  try {

    setStatus(
      "Closing financial month..."
    );


    /* -----------------------------------------
       Recalculate closing balance.
    ----------------------------------------- */

    const closingBalance =
      Number(
        s.opening
      ) +
      Number(
        s.collected
      ) -
      Number(
        s.approvedExpenses
      );


    /* -----------------------------------------
       Close only if still OPEN.

       This prevents two simultaneous
       close operations from both succeeding.
    ----------------------------------------- */

    const {
      data,
      error
    } =
      await supabase
        .from("financial_periods")
        .update({

          status:
            "closed",

          closing_balance:
            closingBalance,

          closed_at:
            new Date().toISOString(),

          closed_by:
            currentMember?.id ||
            null

        })
        .eq(
          "id",
          s.period.id
        )
        .eq(
          "status",
          "open"
        )
        .select()
        .single();


    if (error) {
      throw error;
    }


    if (!data) {

      throw new Error(
        "The month could not be closed. It may already have been closed."
      );

    }


    currentSummary.period =
      data;


    currentSummary.closing =
      Number(
        data.closing_balance
      );


    updateButtons();

    renderSummary();


    setStatus(
      `${formatMonth(
        currentMonth
      )} closed successfully.`
    );


  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   REOPEN MONTH
========================================================= */

async function reopenMonth() {

  if (!currentSummary) {
    return;
  }


  const confirmed =
    window.confirm(

      `Reopen ${formatMonth(
        currentMonth
      )}?

This should only be done by an authorized administrator.

Reopening allows the financial period to be edited again.`

    );


  if (!confirmed) {
    return;
  }


  try {

    setStatus(
      "Reopening financial month..."
    );


    const {
      data,
      error
    } =
      await supabase
        .from("financial_periods")
        .update({

          status:
            "open",

          closing_balance:
            null,

          closed_at:
            null,

          closed_by:
            null

        })
        .eq(
          "id",
          currentSummary.period.id
        )
        .eq(
          "status",
          "closed"
        )
        .select()
        .single();


    if (error) {
      throw error;
    }


    if (!data) {

      throw new Error(
        "The month could not be reopened."
      );

    }


    currentSummary.period =
      data;


    currentSummary.closing =
      currentSummary.calculatedClosing;


    updateButtons();

    renderSummary();


    setStatus(
      `${formatMonth(
        currentMonth
      )} reopened.`
    );


  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   PRINT
========================================================= */

function printMonthlyReport() {

  window.print();

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
    ).padStart(
      2,
      "0"
    )
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
    ).padStart(
      2,
      "0"
    )
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
    String(
      fromMonth
    )
      .split("-")
      .map(Number);


  const [
    toYear,
    toMonthNumber
  ] =
    String(
      toMonth
    )
      .split("-")
      .map(Number);


  return (
    (
      toYear -
      fromYear
    ) * 12
    +
    (
      toMonthNumber -
      fromMonthNumber
    )
  );

}


/* =========================================================
   MONTH KEY
========================================================= */

function monthKey(
  value
) {

  if (!value) {
    return "";
  }


  const text =
    String(value);


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
    ).padStart(
      2,
      "0"
    )
  ].join("-");

}


/* =========================================================
   FORMAT MONTH
========================================================= */

function formatMonth(
  month
) {

  if (!month) {
    return "selected month";
  }


  const [
    year,
    monthNumber
  ] =
    String(
      month
    )
      .split("-")
      .map(Number);


  return new Date(
    year,
    monthNumber - 1,
    1
  ).toLocaleDateString(
    "en-KE",
    {
      month:
        "long",

      year:
        "numeric"
    }
  );

}


/* =========================================================
   MONEY
========================================================= */

function money(
  value
) {

  return new Intl.NumberFormat(
    "en-KE",
    {
      style:
        "currency",

      currency:
        "KES",

      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2
    }
  ).format(
    Number(
      value || 0
    )
  );

}


/* =========================================================
   SET TEXT
========================================================= */

function setText(
  id,
  value
) {

  const element =
    $(id);


  if (element) {

    element.textContent =
      value;

  }

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(
  value
) {

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
   STATUS
========================================================= */

function setStatus(
  message
) {

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

function showError(
  error
) {

  console.error(
    "CHAMA LIVE Monthly Closing:",
    error
  );


  const message =
    error?.message ||
    String(
      error ||
      "Unable to load monthly financials."
    );


  const errorElement =
    $("error");


  if (errorElement) {

    errorElement.hidden =
      false;

    errorElement.textContent =
      message;

  }


  setStatus(
    "Unable to load monthly financials."
  );

}


/* =========================================================
   CLEAR ERROR
========================================================= */

function clearError() {

  const errorElement =
    $("error");


  if (errorElement) {

    errorElement.hidden =
      true;

    errorElement.textContent =
      "";

  }

}


/* =========================================================
   START APPLICATION
========================================================= */

init();
