/* =========================================================
   CHAMA LIVE — MONTHLY CLOSING
   ---------------------------------------------------------
   COMPLETE STABLE VERSION

   RULES
   ---------------------------------------------------------
   1. Only the logged-in user's group can be closed.
   2. A month can only be closed once.
   3. ALL contribution types count as cash.
   4. ONLY approved expenses reduce closing balance.
   5. Pending/rejected expenses do not reduce balance.
   6. Previous closed month's closing balance becomes
      current month's opening balance.
   7. Closing is stored in BOTH:
        - monthly_closings
        - financial_periods
   8. Closed months cannot be closed again.
   9. Future months cannot be closed.
  10. The closing balance is permanently stored.
========================================================= */

import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";


/* =========================================================
   HELPERS
========================================================= */

const $ = (id) =>
  document.getElementById(id);


function setText(id, value) {

  const element = $(id);

  if (element) {
    element.textContent = value;
  }

}


function money(value) {

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(
    Number(value || 0)
  );

}


function number(value) {

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;

}


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


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
   STATE
========================================================= */

let currentMember = null;
let groupId = null;
let currentUser = null;
let selectedMonth = "";
let closingData = null;


/* =========================================================
   INITIALIZE
========================================================= */

async function init() {

  try {

    setStatus(
      "Loading monthly closing..."
    );

    /* -----------------------------------------------------
       AUTH USER
    ----------------------------------------------------- */

    const {
      data: {
        user
      },
      error: userError
    } =
      await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }

    if (!user) {

      throw new Error(
        "You must be signed in to access monthly closing."
      );

    }

    currentUser =
      user;


    /* -----------------------------------------------------
       MEMBER
    ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       DEFAULT MONTH
    ----------------------------------------------------- */

    selectedMonth =
      getCurrentMonth();


    const monthInput =
      $("closingMonth");

    if (monthInput) {

      monthInput.value =
        selectedMonth;

      monthInput.max =
        selectedMonth;

      monthInput.addEventListener(
        "change",
        async () => {

          if (!monthInput.value) {
            return;
          }

          selectedMonth =
            monthInput.value;

          await loadClosing();

        }
      );

    }


    /* -----------------------------------------------------
       BUTTONS
    ----------------------------------------------------- */

    $("calculateClosing")
      ?.addEventListener(
        "click",
        loadClosing
      );


    $("closeMonth")
      ?.addEventListener(
        "click",
        closeMonth
      );


    $("refreshClosing")
      ?.addEventListener(
        "click",
        loadClosing
      );


    $("printClosing")
      ?.addEventListener(
        "click",
        printClosing
      );


    /* -----------------------------------------------------
       LOAD
    ----------------------------------------------------- */

    await loadClosing();


  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   LOAD CLOSING
========================================================= */

async function loadClosing() {

  clearError();

  if (!selectedMonth) {
    return;
  }


  setStatus(
    `Calculating ${formatMonth(selectedMonth)}...`
  );


  try {

    /* =====================================================
       PREVENT FUTURE CLOSING
    ===================================================== */

    const currentMonth =
      getCurrentMonth();

    if (
      selectedMonth >
      currentMonth
    ) {

      throw new Error(
        "A future month cannot be closed."
      );

    }


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
        .eq(
          "group_id",
          groupId
        )
        .eq(
          "month",
          selectedMonth
        )
        .maybeSingle();

    if (periodError) {
      throw periodError;
    }


    /* =====================================================
       MONTHLY CLOSING RECORD
    ===================================================== */

    const closingStart =
      `${selectedMonth}-01`;

    const nextMonth =
      addMonths(
        selectedMonth,
        1
      );

    const closingEnd =
      `${nextMonth}-01`;


    const {
      data: existingClosing,
      error: closingError
    } =
      await supabase
        .from("monthly_closings")
        .select(`
          id,
          group_id,
          closing_month,
          closed_by,
          closed_at,
          total_expected,
          total_collected,
          total_expenses,
          closing_balance,
          notes,
          created_at
        `)
        .eq(
          "group_id",
          groupId
        )
        .eq(
          "closing_month",
          closingStart
        )
        .maybeSingle();

    if (closingError) {
      throw closingError;
    }


    /* =====================================================
       CONTRIBUTIONS
       -----------------------------------------------------
       ALL contribution types count as cash.
    ===================================================== */

    const {
      data: contributions,
      error: contributionsError
    } =
      await supabase
        .from("contributions")
        .select(`
          id,
          member_id,
          amount,
          contribution_type,
          month,
          contribution_date,
          created_at
        `)
        .eq(
          "group_id",
          groupId
        )
        .lt(
          "contribution_date",
          closingEnd
        );

    if (contributionsError) {
      throw contributionsError;
    }


    /* =====================================================
       CURRENT MONTH CONTRIBUTIONS
    ===================================================== */

    const currentContributions =
      (contributions || [])
        .filter(
          contribution => {

            const contributionMonth =
              monthKey(
                contribution.month ||
                contribution.contribution_date ||
                contribution.created_at
              );

            return (
              contributionMonth ===
              selectedMonth
            );

          }
        );


    const totalCollected =
      currentContributions
        .reduce(
          (
            total,
            contribution
          ) =>
            total +
            number(
              contribution.amount
            ),
          0
        );


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
          name,
          status,
          join_date
        `)
        .eq(
          "group_id",
          groupId
        );

    if (membersError) {
      throw membersError;
    }


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


    /* =====================================================
       EXPECTED
    ===================================================== */

    const monthlyContribution =
      number(
        group.monthly_contribution
      );


    const totalExpected =
      activeMembers.reduce(
        (
          total,
          member
        ) => {

          const joinMonth =
            monthKey(
              member.join_date
            );

          if (
            joinMonth &&
            joinMonth >
            selectedMonth
          ) {

            return total;

          }

          return (
            total +
            monthlyContribution
          );

        },
        0
      );


    /* =====================================================
       EXPENSES
       -----------------------------------------------------
       ONLY APPROVED expenses count.
    ===================================================== */

    const {
      data: expenses,
      error: expensesError
    } =
      await supabase
        .from("expenses")
        .select(`
          id,
          description,
          category,
          amount,
          date,
          approval_status
        `)
        .eq(
          "group_id",
          groupId
        )
        .gte(
          "date",
          closingStart
        )
        .lt(
          "date",
          closingEnd
        );

    if (expensesError) {
      throw expensesError;
    }


    const approvedExpenses =
      (expenses || [])
        .filter(
          expense =>
            String(
              expense.approval_status ||
              ""
            ).toLowerCase() ===
            "approved"
        );


    const pendingExpenses =
      (expenses || [])
        .filter(
          expense =>
            String(
              expense.approval_status ||
              ""
            ).toLowerCase() ===
            "pending"
        );


    const rejectedExpenses =
      (expenses || [])
        .filter(
          expense =>
            String(
              expense.approval_status ||
              ""
            ).toLowerCase() ===
            "rejected"
        );


    const totalExpenses =
      approvedExpenses
        .reduce(
          (
            total,
            expense
          ) =>
            total +
            number(
              expense.amount
            ),
          0
        );


    const pendingTotal =
      pendingExpenses
        .reduce(
          (
            total,
            expense
          ) =>
            total +
            number(
              expense.amount
            ),
          0
        );


    const rejectedTotal =
      rejectedExpenses
        .reduce(
          (
            total,
            expense
          ) =>
            total +
            number(
              expense.amount
            ),
          0
        );


    /* =====================================================
       OPENING BALANCE
    ===================================================== */

    let openingBalance = 0;


    /* -----------------------------------------------------
       Existing financial period
    ----------------------------------------------------- */

    if (
      period &&
      period.opening_balance !== null &&
      period.opening_balance !== undefined
    ) {

      openingBalance =
        number(
          period.opening_balance
        );

    } else {

      /* ---------------------------------------------------
         Find previous closed financial period
      --------------------------------------------------- */

      const {
        data: previousPeriod,
        error: previousPeriodError
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
            selectedMonth
          )
          .order(
            "month",
            {
              ascending: false
            }
          )
          .limit(1)
          .maybeSingle();

      if (previousPeriodError) {
        throw previousPeriodError;
      }


      if (
        previousPeriod &&
        previousPeriod.closing_balance !== null &&
        previousPeriod.closing_balance !== undefined
      ) {

        openingBalance =
          number(
            previousPeriod.closing_balance
          );

      } else {

        /* -------------------------------------------------
           Check previous monthly closing
        ------------------------------------------------- */

        const {
          data: previousClosing,
          error: previousClosingError
        } =
          await supabase
            .from("monthly_closings")
            .select(`
              closing_month,
              closing_balance
            `)
            .eq(
              "group_id",
              groupId
            )
            .lt(
              "closing_month",
              closingStart
            )
            .order(
              "closing_month",
              {
                ascending: false
              }
            )
            .limit(1)
            .maybeSingle();

        if (previousClosingError) {
          throw previousClosingError;
        }


        if (
          previousClosing &&
          previousClosing.closing_balance !== null &&
          previousClosing.closing_balance !== undefined
        ) {

          openingBalance =
            number(
              previousClosing.closing_balance
            );

        } else {

          openingBalance =
            number(
              group.opening_balance
            );

        }

      }

    }


    /* =====================================================
       CALCULATED CLOSING
    ===================================================== */

    const calculatedClosing =
      openingBalance +
      totalCollected -
      totalExpenses;


    /* =====================================================
       STORED CLOSING
       -----------------------------------------------------
       If already closed, NEVER recalculate the stored
       closing balance for display.
    ===================================================== */

    const isClosed =
      String(
        period?.status ||
        ""
      ).toLowerCase() ===
      "closed";


    const hasStoredClosing =
      existingClosing &&
      existingClosing.closing_balance !== null &&
      existingClosing.closing_balance !== undefined;


    const finalClosing =
      isClosed &&
      period?.closing_balance !== null &&
      period?.closing_balance !== undefined

        ? number(
            period.closing_balance
          )

        : hasStoredClosing

          ? number(
              existingClosing.closing_balance
            )

          : calculatedClosing;


    /* =====================================================
       SAVE STATE
    ===================================================== */

    closingData = {

      group,

      period,

      existingClosing,

      members:
        activeMembers,

      contributions:
        currentContributions,

      expenses:
        expenses || [],

      approvedExpenses,

      pendingExpenses,

      rejectedExpenses,

      totalExpected,

      totalCollected,

      totalExpenses,

      pendingTotal,

      rejectedTotal,

      openingBalance,

      calculatedClosing,

      closingBalance:
        finalClosing,

      isClosed

    };


    /* =====================================================
       RENDER
    ===================================================== */

    renderClosing();


    setStatus(
      isClosed
        ? `${formatMonth(selectedMonth)} is CLOSED.`
        : `${formatMonth(selectedMonth)} is ready for closing.`
    );


  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   RENDER
========================================================= */

function renderClosing() {

  const data =
    closingData;

  if (!data) {
    return;
  }


  /* =====================================================
     HEADER
  ===================================================== */

  setText(
    "groupName",
    data.group?.name ||
    "CHAMA LIVE"
  );


  setText(
    "closingMonthLabel",
    formatMonth(
      selectedMonth
    )
  );


  /* =====================================================
     FINANCIAL TOTALS
  ===================================================== */

  setText(
    "openingBalance",
    money(
      data.openingBalance
    )
  );


  setText(
    "totalExpected",
    money(
      data.totalExpected
    )
  );


  setText(
    "totalCollected",
    money(
      data.totalCollected
    )
  );


  setText(
    "totalExpenses",
    money(
      data.totalExpenses
    )
  );


  setText(
    "pendingExpenses",
    money(
      data.pendingTotal
    )
  );


  setText(
    "rejectedExpenses",
    money(
      data.rejectedTotal
    )
  );


  setText(
    "calculatedClosing",
    money(
      data.calculatedClosing
    )
  );


  setText(
    "closingBalance",
    money(
      data.closingBalance
    )
  );


  /* =====================================================
     COUNTS
  ===================================================== */

  setText(
    "memberCount",
    data.members.length
  );


  setText(
    "contributionCount",
    data.contributions.length
  );


  setText(
    "expenseCount",
    data.expenses.length
  );


  /* =====================================================
     STATUS
  ===================================================== */

  const status =
    data.isClosed
      ? "CLOSED"
      : "OPEN";


  setText(
    "periodStatus",
    status
  );


  /* =====================================================
     CLOSE BUTTON
  ===================================================== */

  const closeButton =
    $("closeMonth");

  if (closeButton) {

    closeButton.disabled =
      data.isClosed;

    closeButton.textContent =
      data.isClosed
        ? "Month Already Closed"
        : `Close ${formatMonth(selectedMonth)}`;

  }


  /* =====================================================
     WARNING
  ===================================================== */

  const warning =
    $("closingWarning");

  if (warning) {

    if (data.isClosed) {

      warning.hidden =
        false;

      warning.textContent =
        `This period was closed on ${
          data.period?.closed_at
            ? new Date(
                data.period.closed_at
              ).toLocaleString("en-KE")
            : "a previous date"
        }. The stored closing balance is ${
          money(
            data.closingBalance
          )
        }.`;

    } else {

      warning.hidden =
        true;

      warning.textContent =
        "";

    }

  }


  /* =====================================================
     CLOSING NOTES
  ===================================================== */

  const notes =
    $("closingNotes");

  if (
    notes &&
    data.existingClosing?.notes
  ) {

    notes.value =
      data.existingClosing.notes;

  }


}


/* =========================================================
   CLOSE MONTH
========================================================= */

async function closeMonth() {

  if (!closingData) {

    showError(
      "Please calculate the closing first."
    );

    return;

  }


  if (
    closingData.isClosed
  ) {

    showError(
      `${formatMonth(selectedMonth)} is already closed.`
    );

    return;

  }


  const confirmed =
    window.confirm(
      `Are you sure you want to close ${formatMonth(selectedMonth)}?\n\n` +
      `Opening balance: ${money(closingData.openingBalance)}\n` +
      `Contributions: ${money(closingData.totalCollected)}\n` +
      `Approved expenses: ${money(closingData.totalExpenses)}\n` +
      `Closing balance: ${money(closingData.calculatedClosing)}\n\n` +
      `Once closed, this month's stored closing balance will be used for future reporting.`
    );


  if (!confirmed) {
    return;
  }


  const closeButton =
    $("closeMonth");

  if (closeButton) {
    closeButton.disabled =
      true;

    closeButton.textContent =
      "Closing month...";
  }


  setStatus(
    `Closing ${formatMonth(selectedMonth)}...`
  );


  try {

    /* =====================================================
       REFRESH AUTH
    ===================================================== */

    const {
      data: {
        user
      },
      error: userError
    } =
      await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }

    if (!user) {

      throw new Error(
        "Your session has expired. Please sign in again."
      );

    }


    currentUser =
      user;


    /* =====================================================
       CHECK AGAIN FOR EXISTING PERIOD
       -----------------------------------------------------
       Prevent race-condition duplicate closing.
    ===================================================== */

    const {
      data: existingPeriod,
      error: existingPeriodError
    } =
      await supabase
        .from("financial_periods")
        .select(`
          id,
          status,
          closing_balance
        `)
        .eq(
          "group_id",
          groupId
        )
        .eq(
          "month",
          selectedMonth
        )
        .maybeSingle();

    if (existingPeriodError) {
      throw existingPeriodError;
    }


    if (
      existingPeriod &&
      String(
        existingPeriod.status
      ).toLowerCase() ===
      "closed"
    ) {

      throw new Error(
        "This month has already been closed."
      );

    }


    /* =====================================================
       CHECK MONTHLY CLOSING TABLE
    ===================================================== */

    const {
      data: duplicateClosing,
      error: duplicateClosingError
    } =
      await supabase
        .from("monthly_closings")
        .select("id")
        .eq(
          "group_id",
          groupId
        )
        .eq(
          "closing_month",
          `${selectedMonth}-01`
        )
        .maybeSingle();

    if (duplicateClosingError) {
      throw duplicateClosingError;
    }


    if (duplicateClosing) {

      throw new Error(
        "A monthly closing record already exists for this month."
      );

    }


    /* =====================================================
       INSERT MONTHLY CLOSING
    ===================================================== */

    const notes =
      $("closingNotes")?.value?.trim() ||
      `Monthly closing for ${formatMonth(selectedMonth)}.`;


    const {
      data: insertedClosing,
      error: insertClosingError
    } =
      await supabase
        .from("monthly_closings")
        .insert({

          group_id:
            groupId,

          closing_month:
            `${selectedMonth}-01`,

          closed_by:
            currentUser.id,

          total_expected:
            closingData.totalExpected,

          total_collected:
            closingData.totalCollected,

          total_expenses:
            closingData.totalExpenses,

          closing_balance:
            closingData.calculatedClosing,

          notes

        })
        .select(`
          id,
          group_id,
          closing_month,
          closed_by,
          closed_at,
          total_expected,
          total_collected,
          total_expenses,
          closing_balance,
          notes,
          created_at
        `)
        .single();

    if (insertClosingError) {
      throw insertClosingError;
    }


    /* =====================================================
       FINANCIAL PERIOD
    ===================================================== */

    if (existingPeriod) {

      const {
        error: updatePeriodError
      } =
        await supabase
          .from("financial_periods")
          .update({

            opening_balance:
              closingData.openingBalance,

            closing_balance:
              closingData.calculatedClosing,

            status:
              "closed",

            closed_at:
              new Date().toISOString(),

            closed_by:
              currentUser.id

          })
          .eq(
            "id",
            existingPeriod.id
          );

      if (updatePeriodError) {

        /*
         * The monthly_closings record has already been inserted.
         * Do not create another one.
         */

        throw updatePeriodError;

      }

    } else {

      const {
        error: insertPeriodError
      } =
        await supabase
          .from("financial_periods")
          .insert({

            group_id:
              groupId,

            month:
              selectedMonth,

            opening_balance:
              closingData.openingBalance,

            closing_balance:
              closingData.calculatedClosing,

            status:
              "closed",

            closed_at:
              new Date().toISOString(),

            closed_by:
              currentUser.id

          });

      if (insertPeriodError) {

        /*
         * The monthly_closings record exists.
         * Surface the exact database error rather than silently
         * pretending the whole operation succeeded.
         */

        throw insertPeriodError;

      }

    }


    /* =====================================================
       SUCCESS
    ===================================================== */

    setStatus(
      `${formatMonth(selectedMonth)} closed successfully.`
    );


    alert(
      `${formatMonth(selectedMonth)} has been closed successfully.\n\n` +
      `Closing balance: ${money(closingData.calculatedClosing)}`
    );


    /* -----------------------------------------------------
       Reload from database.
    ----------------------------------------------------- */

    await loadClosing();


  } catch (error) {

    showError(error);

    const closeButton =
      $("closeMonth");

    if (closeButton) {

      closeButton.disabled =
        false;

      closeButton.textContent =
        `Close ${formatMonth(selectedMonth)}`;

    }

  }

}


/* =========================================================
   PRINT
========================================================= */

function printClosing() {

  if (!closingData) {

    showError(
      "No closing report is available to print."
    );

    return;

  }

  window.print();

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
    "CHAMA LIVE Monthly Closing:",
    error
  );


  const message =
    error?.message ||
    String(
      error ||
      "Unable to process monthly closing."
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
    "Monthly closing could not be completed."
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
