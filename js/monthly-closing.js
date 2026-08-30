/* =========================================================
   CHAMA LIVE — MONTHLY CLOSING
   =========================================================
   SECURE TRANSACTIONAL VERSION

   ARCHITECTURE
   ---------------------------------------------------------
   Frontend:
   - Displays calculations
   - Requests closing through RPC
   - Never directly changes financial status

   Database RPC:
   - Validates authenticated user
   - Validates group membership
   - Validates authorized role
   - Prevents future closing
   - Prevents duplicate closing
   - Calculates financial totals server-side
   - Creates monthly_closings record
   - Updates financial_periods
   - Runs atomically

   RULES
   ---------------------------------------------------------
   1. Only authorized group officials can close.
   2. Frontend cannot force balances.
   3. Server calculates authoritative totals.
   4. All contribution types count as cash.
   5. Only approved expenses reduce balance.
   6. Previous closed balance becomes opening balance.
   7. Closed balance becomes immutable.
   8. Duplicate closing is prevented.
   9. Future months cannot close.
  10. Closing happens in one database transaction.
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


function number(value) {

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;

}


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
    number(value)
  );

}


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function normalize(value) {

  return String(value || "")
    .trim()
    .toLowerCase();

}


/* =========================================================
   MONTH HELPERS
========================================================= */

function monthKey(value) {

  if (!value) {
    return "";
  }


  const text =
    String(value).trim();


  const match =
    text.match(/^(\d{4})-(\d{2})/);


  if (match) {

    return `${match[1]}-${match[2]}`;

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
   CONTRIBUTION MONTH
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

    const dateMonth =
      monthKey(
        contribution.contribution_date
      );


    if (dateMonth) {
      return dateMonth;
    }

  }


  return monthKey(
    contribution.created_at
  );

}


/* =========================================================
   STATE
========================================================= */

let currentMember = null;

let currentUser = null;

let groupId = null;

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


    /* =====================================================
       AUTH USER
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
        "You must be signed in to access monthly closing."
      );

    }


    currentUser =
      user;


    /* =====================================================
       CURRENT MEMBER
    ===================================================== */

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


    /* =====================================================
       DEFAULT MONTH
    ===================================================== */

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


    /* =====================================================
       BUTTONS
    ===================================================== */

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


    /* =====================================================
       LOAD
    ===================================================== */

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


  if (!groupId) {

    throw new Error(
      "Group could not be identified."
    );

  }


  if (!selectedMonth) {
    return;
  }


  setStatus(
    `Calculating ${formatMonth(selectedMonth)}...`
  );


  try {

    /* =====================================================
       PREVENT FUTURE MONTH
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


    const startDate =
      `${selectedMonth}-01`;


    const nextMonth =
      addMonths(
        selectedMonth,
        1
      );


    const endDate =
      `${nextMonth}-01`;


    /* =====================================================
       LOAD GROUP
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
       LOAD FINANCIAL PERIOD
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
       LOAD MONTHLY CLOSING
    ===================================================== */

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
          startDate
        )
        .maybeSingle();


    if (closingError) {
      throw closingError;
    }


    /* =====================================================
       LOAD CONTRIBUTIONS
       -----------------------------------------------------
       We load by accounting month.

       ALL contribution types count as cash.
    ===================================================== */

    const {
      data: contributions,
      error: contributionError
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
          contribution_date,
          created_at
        `)
        .eq(
          "group_id",
          groupId
        )
        .lt(
          "contribution_date",
          endDate
        );


    if (contributionError) {
      throw contributionError;
    }


    const currentContributions =
      (contributions || [])
        .filter(
          contribution =>
            getContributionMonth(
              contribution
            ) === selectedMonth
        );


    const totalCollected =
      currentContributions
        .reduce(
          (total, contribution) =>
            total +
            number(
              contribution.amount
            ),
          0
        );


    /* =====================================================
       LOAD MEMBERS
    ===================================================== */

    const {
      data: members,
      error: membersError
    } =
      await supabase
        .from("members")
        .select(`
          id,
          name,
          status,
          onboarding_status,
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
            normalize(
              member.status || "active"
            ) === "active" &&
            normalize(
              member.onboarding_status || "active"
            ) === "active"
        )
        .filter(
          member => {

            const joinMonth =
              monthKey(
                member.join_date
              );


            return (
              !joinMonth ||
              joinMonth <= selectedMonth
            );

          }
        );


    /* =====================================================
       EXPECTED CONTRIBUTIONS
    ===================================================== */

    const monthlyContribution =
      number(
        group.monthly_contribution
      );


    const totalExpected =
      activeMembers.length *
      monthlyContribution;


    /* =====================================================
       LOAD EXPENSES
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
          startDate
        )
        .lt(
          "date",
          endDate
        );


    if (expensesError) {
      throw expensesError;
    }


    const approvedExpenses =
      (expenses || [])
        .filter(
          expense =>
            normalize(
              expense.approval_status
            ) === "approved"
        );


    const pendingExpenses =
      (expenses || [])
        .filter(
          expense =>
            normalize(
              expense.approval_status
            ) === "pending"
        );


    const rejectedExpenses =
      (expenses || [])
        .filter(
          expense =>
            normalize(
              expense.approval_status
            ) === "rejected"
        );


    const totalExpenses =
      approvedExpenses
        .reduce(
          (total, expense) =>
            total +
            number(
              expense.amount
            ),
          0
        );


    const pendingTotal =
      pendingExpenses
        .reduce(
          (total, expense) =>
            total +
            number(
              expense.amount
            ),
          0
        );


    const rejectedTotal =
      rejectedExpenses
        .reduce(
          (total, expense) =>
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


    if (
      period &&
      period.opening_balance !== null
    ) {

      openingBalance =
        number(
          period.opening_balance
        );

    } else {

      const {
        data: previousPeriod,
        error: previousError
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


      if (previousError) {
        throw previousError;
      }


      if (
        previousPeriod &&
        previousPeriod.closing_balance !== null
      ) {

        openingBalance =
          number(
            previousPeriod.closing_balance
          );

      } else {

        openingBalance =
          number(
            group.opening_balance
          );

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
       CLOSED STATUS
    ===================================================== */

    const isClosed =
      normalize(
        period?.status
      ) === "closed";


    const storedClosing =
      isClosed &&
      period?.closing_balance !== null

        ? number(
            period.closing_balance
          )

        : existingClosing &&
          existingClosing.closing_balance !== null

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
        storedClosing,

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
     TOTALS
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

  setText(
    "periodStatus",
    data.isClosed
      ? "CLOSED"
      : "OPEN"
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
     CLOSED WARNING
  ===================================================== */

  const warning =
    $("closingWarning");


  if (warning) {

    if (data.isClosed) {

      warning.hidden =
        false;


      warning.textContent =
        `This period is closed. ` +
        `Stored closing balance: ` +
        `${money(data.closingBalance)}.`;

    } else {

      warning.hidden =
        true;

      warning.textContent =
        "";

    }

  }


  /* =====================================================
     NOTES
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
   ---------------------------------------------------------
   IMPORTANT:

   The frontend DOES NOT:

   - insert financial_periods
   - update financial_periods
   - insert monthly_closings
   - calculate authoritative balances

   Everything important happens inside PostgreSQL RPC.
========================================================= */

async function closeMonth() {

  if (!closingData) {

    showError(
      "Please calculate the closing first."
    );

    return;

  }


  if (closingData.isClosed) {

    showError(
      `${formatMonth(selectedMonth)} is already closed.`
    );

    return;

  }


  /* =====================================================
     PREVENT FUTURE MONTH
  ===================================================== */

  if (
    selectedMonth >
    getCurrentMonth()
  ) {

    showError(
      "A future month cannot be closed."
    );

    return;

  }


  /* =====================================================
     CONFIRM
  ===================================================== */

  const confirmed =
    window.confirm(

      `Close ${formatMonth(selectedMonth)}?\n\n` +

      `Opening Balance: ${money(
        closingData.openingBalance
      )}\n` +

      `Contributions: ${money(
        closingData.totalCollected
      )}\n` +

      `Approved Expenses: ${money(
        closingData.totalExpenses
      )}\n\n` +

      `Calculated Closing: ${money(
        closingData.calculatedClosing
      )}\n\n` +

      `The database will independently verify and calculate all totals before permanently closing this period.`

    );


  if (!confirmed) {
    return;
  }


  const button =
    $("closeMonth");


  if (button) {

    button.disabled =
      true;


    button.textContent =
      "Closing month securely...";

  }


  clearError();


  setStatus(
    `Securing ${formatMonth(selectedMonth)} closing...`
  );


  try {

    /* =====================================================
       REFRESH AUTH SESSION
    ===================================================== */

    const {
      data: {
        user
      },
      error: authError
    } =
      await supabase.auth.getUser();


    if (authError) {
      throw authError;
    }


    if (!user) {

      throw new Error(
        "Your session has expired. Please sign in again."
      );

    }


    currentUser =
      user;


    /* =====================================================
       NOTES
    ===================================================== */

    const notes =
      $("closingNotes")
        ?.value
        ?.trim() || "";


    /* =====================================================
       SECURE RPC
       -----------------------------------------------------
       Expected PostgreSQL function:

       close_financial_month(
         p_group_id uuid,
         p_month text,
         p_notes text
       )

       Database performs:

       ✓ auth validation
       ✓ group validation
       ✓ role validation
       ✓ future month validation
       ✓ duplicate prevention
       ✓ advisory locking
       ✓ contribution calculation
       ✓ expense calculation
       ✓ opening balance calculation
       ✓ monthly_closings insert
       ✓ financial_periods update
       ✓ atomic transaction
    ===================================================== */

    const {
      data,
      error
    } =
      await supabase.rpc(
        "close_financial_month",
        {

          p_group_id:
            groupId,

          p_month:
            selectedMonth,

          p_notes:
            notes

        }
      );


    if (error) {
      throw error;
    }


    /* =====================================================
       RPC RESULT
    ===================================================== */

    console.log(
      "CHAMA LIVE closing result:",
      data
    );


    setStatus(
      `${formatMonth(selectedMonth)} closed successfully.`
    );


    const result =
      Array.isArray(data)
        ? data[0]
        : data;


    const authoritativeClosing =
      result?.closing_balance ??
      result?.closingBalance ??
      closingData.calculatedClosing;


    alert(

      `${formatMonth(selectedMonth)} has been closed successfully.\n\n` +

      `Closing Balance: ${money(
        authoritativeClosing
      )}`

    );


    /* =====================================================
       RELOAD DATABASE STATE
    ===================================================== */

    await loadClosing();


  } catch (error) {

    console.error(
      "CHAMA LIVE secure closing:",
      error
    );


    showError(error);


    if (button) {

      button.disabled =
        false;


      button.textContent =
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


  let message =
    error?.message ||
    String(
      error ||
      "Unable to process monthly closing."
    );


  /* =====================================================
     CLEAN POSTGRES ERRORS
  ===================================================== */

  message =
    String(message)
      .replace(/^ERROR:\s*/i, "")
      .trim();


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
