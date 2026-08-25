import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";

/* =====================================================
   HELPERS
===================================================== */

const $ = (id) => document.getElementById(id);

let groupId = null;
let currentMonth = "";
let currentPeriod = null;
let currentSummary = null;
let memberStatus = [];
let currentMember = null;


/* =====================================================
   INITIALISE
===================================================== */

async function init() {
  try {
    currentMember = await getMyMember();

    if (!currentMember) {
      throw new Error("Unable to identify your group.");
    }

    groupId = currentMember.group_id;

    const today = new Date();

    currentMonth =
      `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}`;

    const monthInput = $("month");

    if (!monthInput) {
      throw new Error(
        "Monthly Closing page is missing the month selector."
      );
    }

    monthInput.value = currentMonth;

    monthInput.addEventListener(
      "change",
      async () => {
        const selected = monthInput.value;

        if (!selected) return;

        currentMonth = selected;

        await loadMonth();
      }
    );

    const closeButton = $("closeMonth");

    if (closeButton) {
      closeButton.addEventListener(
        "click",
        closeMonth
      );
    }

    const reopenButton = $("reopenMonth");

    if (reopenButton) {
      reopenButton.addEventListener(
        "click",
        reopenMonth
      );
    }

    const printButton = $("printReport");

    if (printButton) {
      printButton.addEventListener(
        "click",
        printReport
      );
    }

    updatePermissionUI();

    await loadMonth();

  } catch (error) {
    showError(error);
  }
}


/* =====================================================
   ROLE / PERMISSION
===================================================== */

function getRole() {
  return String(
    currentMember?.role || ""
  ).toLowerCase().trim();
}


function canManageClosing() {
  const role = getRole();

  return (
    role === "admin" ||
    role === "treasurer"
  );
}


function updatePermissionUI() {
  const canManage =
    canManageClosing();

  const closeButton =
    $("closeMonth");

  const reopenButton =
    $("reopenMonth");

  if (closeButton) {
    closeButton.hidden =
      !canManage ||
      currentPeriod?.status === "closed";
  }

  if (reopenButton) {
    reopenButton.hidden =
      !canManage ||
      currentPeriod?.status !== "closed";
  }
}


/* =====================================================
   LOAD MONTH
===================================================== */

async function loadMonth() {
  clearError();

  setStatus(
    `Loading ${formatMonth(
      currentMonth
    )}...`
  );

  try {

    /* -----------------------------------------------
       LOAD GROUP
    ------------------------------------------------ */

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


    /* -----------------------------------------------
       LOAD FINANCIAL PERIOD
    ------------------------------------------------ */

    let {
      data: period,
      error: periodError
    } = await supabase
      .from("financial_periods")
      .select("*")
      .eq("group_id", groupId)
      .eq("month", currentMonth)
      .maybeSingle();

    if (periodError) {
      throw periodError;
    }


    /* -----------------------------------------------
       CREATE PERIOD IF MISSING
    ------------------------------------------------ */

    if (!period) {

      /*
       * Only Treasurer/Admin should create a period.
       *
       * If this user cannot manage closing, don't attempt
       * an INSERT because RLS will correctly reject it.
       */

      if (!canManageClosing()) {

        throw new Error(
          "This financial period has not been created yet. A Treasurer or Admin must open it first."
        );
      }

      const openingBalance =
        await calculateOpeningBalance(
          group
        );

      const {
        data: createdPeriod,
        error: createError
      } = await supabase
        .from("financial_periods")
        .insert({
          group_id: groupId,
          month: currentMonth,
          opening_balance:
            openingBalance,
          status: "open"
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      period = createdPeriod;
    }


    currentPeriod = period;


    /* -----------------------------------------------
       LOAD ACTIVE MEMBERS
    ------------------------------------------------ */

    const {
      data: members,
      error: membersError
    } = await supabase
      .from("members")
      .select(`
        id,
        name,
        member_number,
        status
      `)
      .eq("group_id", groupId)
      .eq("status", "active")
      .order("name");

    if (membersError) {
      throw membersError;
    }


    /* -----------------------------------------------
       LOAD CONTRIBUTIONS
    ------------------------------------------------ */

    const {
      data: contributions,
      error: contributionError
    } = await supabase
      .from("contributions")
      .select(`
        id,
        member_id,
        amount,
        contribution_type,
        month,
        payment_method,
        reference,
        mpesa_reference,
        contribution_date
      `)
      .eq("group_id", groupId)
      .eq("month", currentMonth);

    if (contributionError) {
      throw contributionError;
    }


    /* -----------------------------------------------
       LOAD EXPENSES
    ------------------------------------------------ */

    const {
      data: expenses,
      error: expenseError
    } = await supabase
      .from("expenses")
      .select(`
        id,
        description,
        category,
        amount,
        date,
        approval_status
      `)
      .eq("group_id", groupId)
      .gte(
        "date",
        `${currentMonth}-01`
      )
      .lt(
        "date",
        nextMonth(currentMonth)
      );

    if (expenseError) {
      throw expenseError;
    }


    /* -----------------------------------------------
       MEMBER CONTRIBUTION STATUS
    ------------------------------------------------ */

    const monthlyContribution =
      Number(
        group.monthly_contribution || 0
      );

    memberStatus =
      (members || []).map(
        (member) => {

          const paid =
            (contributions || [])
              .filter(
                (contribution) =>
                  contribution.member_id ===
                  member.id
              )
              .reduce(
                (sum, contribution) =>
                  sum +
                  Number(
                    contribution.amount || 0
                  ),
                0
              );

          const expected =
            monthlyContribution;

          const outstanding =
            Math.max(
              expected - paid,
              0
            );

          let status =
            "OUTSTANDING";

          if (
            expected > 0 &&
            paid >= expected
          ) {
            status = "PAID";
          } else if (
            paid > 0
          ) {
            status = "PARTIAL";
          }

          return {
            ...member,
            expected,
            paid,
            outstanding,
            contributionStatus:
              status
          };
        }
      );


    /* -----------------------------------------------
       FINANCIAL TOTALS
    ------------------------------------------------ */

    const expected =
      memberStatus.reduce(
        (sum, member) =>
          sum + member.expected,
        0
      );

    const collected =
      (contributions || []).reduce(
        (sum, contribution) =>
          sum +
          Number(
            contribution.amount || 0
          ),
        0
      );

    const outstanding =
      Math.max(
        expected - collected,
        0
      );

    const approvedExpenses =
      (expenses || [])
        .filter(
          (expense) =>
            expense.approval_status ===
            "approved"
        )
        .reduce(
          (sum, expense) =>
            sum +
            Number(
              expense.amount || 0
            ),
          0
        );

    const pendingExpenses =
      (expenses || [])
        .filter(
          (expense) =>
            expense.approval_status ===
            "pending"
        )
        .reduce(
          (sum, expense) =>
            sum +
            Number(
              expense.amount || 0
            ),
          0
        );

    const rejectedExpenses =
      (expenses || [])
        .filter(
          (expense) =>
            expense.approval_status ===
            "rejected"
        )
        .reduce(
          (sum, expense) =>
            sum +
            Number(
              expense.amount || 0
            ),
          0
        );

    const opening =
      Number(
        period.opening_balance || 0
      );

    const closing =
      opening +
      collected -
      approvedExpenses;

    const paidMembers =
      memberStatus.filter(
        (member) =>
          member.contributionStatus ===
          "PAID"
      ).length;

    const partialMembers =
      memberStatus.filter(
        (member) =>
          member.contributionStatus ===
          "PARTIAL"
      ).length;

    const outstandingMembers =
      memberStatus.filter(
        (member) =>
          member.contributionStatus ===
          "OUTSTANDING"
      ).length;

    const collectionRate =
      expected > 0
        ? (
            collected /
            expected
          ) * 100
        : 0;


    /* -----------------------------------------------
       SAVE SUMMARY
    ------------------------------------------------ */

    currentSummary = {

      group,
      period,
      members: members || [],
      contributions:
        contributions || [],
      expenses:
        expenses || [],

      expected,
      collected,
      outstanding,

      approvedExpenses,
      pendingExpenses,
      rejectedExpenses,

      opening,
      closing,

      paidMembers,
      partialMembers,
      outstandingMembers,

      collectionRate
    };


    /* -----------------------------------------------
       RENDER
    ------------------------------------------------ */

    renderSummary();

    renderMembers();

    updateActions();

    setStatus(
      `Monthly financials loaded • ${
        new Date().toLocaleString(
          "en-KE"
        )
      }`
    );

  } catch (error) {

    showError(error);

  }
}


/* =====================================================
   CALCULATE OPENING BALANCE
===================================================== */

async function calculateOpeningBalance(
  group
) {

  const {
    data: previousPeriods,
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
    .lt(
      "month",
      currentMonth
    )
    .order(
      "month",
      {
        ascending: false
      }
    )
    .limit(1);

  if (error) {
    throw error;
  }

  if (
    previousPeriods &&
    previousPeriods.length > 0 &&
    previousPeriods[0]
      .closing_balance !== null
  ) {

    return Number(
      previousPeriods[0]
        .closing_balance
    );

  }

  return Number(
    group.opening_balance || 0
  );
}


/* =====================================================
   RENDER SUMMARY
===================================================== */

function renderSummary() {

  const s =
    currentSummary;

  if (!s) return;

  setText(
    "openingBalance",
    money(s.opening)
  );

  setText(
    "expected",
    money(s.expected)
  );

  setText(
    "collected",
    money(s.collected)
  );

  setText(
    "outstanding",
    money(s.outstanding)
  );

  setText(
    "approvedExpenses",
    money(s.approvedExpenses)
  );

  setText(
    "closingBalance",
    money(s.closing)
  );

  setText(
    "opening2",
    money(s.opening)
  );

  setText(
    "contributions2",
    money(s.collected)
  );

  setText(
    "expenses2",
    money(s.approvedExpenses)
  );

  setText(
    "balance2",
    money(s.closing)
  );

  setText(
    "memberCount",
    s.members.length
  );

  setText(
    "membersPaid",
    s.paidMembers
  );

  setText(
    "membersPartial",
    s.partialMembers
  );

  setText(
    "membersOutstanding",
    s.outstandingMembers
  );

  setText(
    "collectionRate",
    `${s.collectionRate.toFixed(1)}%`
  );

  setText(
    "approved2",
    money(s.approvedExpenses)
  );

  setText(
    "pendingExpenses",
    money(s.pendingExpenses)
  );

  setText(
    "rejectedExpenses",
    money(s.rejectedExpenses)
  );

  setText(
    "periodStatus",
    String(
      s.period.status || "open"
    ).toUpperCase()
  );
}


/* =====================================================
   RENDER MEMBER TABLE
===================================================== */

function renderMembers() {

  const tbody =
    $("memberRows");

  if (!tbody) return;

  if (
    !memberStatus.length
  ) {

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
    memberStatus
      .map(
        (member) => `
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
                member.expected
              )}
            </td>

            <td>
              <strong>
                ${money(
                  member.paid
                )}
              </strong>
            </td>

            <td>
              ${money(
                member.outstanding
              )}
            </td>

            <td>
              <strong>
                ${escapeHtml(
                  member.contributionStatus
                )}
              </strong>
            </td>

          </tr>
        `
      )
      .join("");
}


/* =====================================================
   BUTTON STATE
===================================================== */

function updateActions() {

  const closed =
    currentPeriod?.status ===
    "closed";

  const canManage =
    canManageClosing();

  const closeButton =
    $("closeMonth");

  const reopenButton =
    $("reopenMonth");

  if (closeButton) {

    closeButton.hidden =
      !canManage || closed;
  }

  if (reopenButton) {

    reopenButton.hidden =
      !canManage || !closed;
  }

  updatePermissionMessage();
}


function updatePermissionMessage() {

  const existing =
    $("closingPermission");

  if (!existing) return;

  if (!canManageClosing()) {

    existing.textContent =
      "Only the Treasurer or Admin can close or reopen a financial month.";

  } else if (
    currentPeriod?.status ===
    "closed"
  ) {

    existing.textContent =
      "This financial period is closed.";

  } else {

    existing.textContent =
      "This financial period is open.";
  }
}


/* =====================================================
   CLOSE MONTH
===================================================== */

async function closeMonth() {

  if (!canManageClosing()) {

    alert(
      "Only the Treasurer or Admin can close the month."
    );

    return;
  }

  if (
    !currentPeriod ||
    !currentSummary
  ) {
    return;
  }

  if (
    currentPeriod.status ===
    "closed"
  ) {

    alert(
      "This month is already closed."
    );

    return;
  }


  const confirmed =
    confirm(
      `Close ${formatMonth(
        currentMonth
      )}?\n\n` +

      `Opening balance: ${
        money(
          currentSummary.opening
        )
      }\n` +

      `Contributions: ${
        money(
          currentSummary.collected
        )
      }\n` +

      `Approved expenses: ${
        money(
          currentSummary.approvedExpenses
        )
      }\n` +

      `Closing balance: ${
        money(
          currentSummary.closing
        )
      }\n\n` +

      `Once closed, the period will be locked.\n\nContinue?`
    );

  if (!confirmed) {
    return;
  }


  try {

    const {
      data: {
        user
      }
    } =
      await supabase.auth.getUser();

    if (!user) {
      throw new Error(
        "Your session has expired. Please sign in again."
      );
    }


    const {
      data,
      error
    } =
      await supabase
        .from(
          "financial_periods"
        )
        .update({

          status:
            "closed",

          closing_balance:
            currentSummary.closing,

          closed_at:
            new Date().toISOString(),

          closed_by:
            user.id

        })
        .eq(
          "id",
          currentPeriod.id
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
        "The financial period could not be closed."
      );
    }


    currentPeriod =
      data;


    alert(
      `${formatMonth(
        currentMonth
      )} has been closed successfully.`
    );


    await loadMonth();

  } catch (error) {

    showError(error);

  }
}


/* =====================================================
   REOPEN MONTH
===================================================== */

async function reopenMonth() {

  if (!canManageClosing()) {

    alert(
      "Only the Treasurer or Admin can reopen the month."
    );

    return;
  }

  if (!currentPeriod) {
    return;
  }

  if (
    currentPeriod.status !==
    "closed"
  ) {

    alert(
      "This month is already open."
    );

    return;
  }


  const confirmed =
    confirm(
      `Reopen ${formatMonth(
        currentMonth
      )}?\n\n` +

      `This will allow the financial period to be updated again.\n\nContinue?`
    );

  if (!confirmed) {
    return;
  }


  try {

    const {
      data,
      error
    } =
      await supabase
        .from(
          "financial_periods"
        )
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
          currentPeriod.id
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
        "The financial period could not be reopened."
      );
    }


    currentPeriod =
      data;


    alert(
      `${formatMonth(
        currentMonth
      )} has been reopened.`
    );


    await loadMonth();

  } catch (error) {

    showError(error);

  }
}


/* =====================================================
   PRINT REPORT
===================================================== */

function printReport() {

  if (!currentSummary) {
    return;
  }

  const s =
    currentSummary;

  const memberRows =
    memberStatus
      .map(
        (member) => `
          <tr>

            <td>
              ${escapeHtml(
                member.name
              )}
            </td>

            <td>
              ${money(
                member.expected
              )}
            </td>

            <td>
              ${money(
                member.paid
              )}
            </td>

            <td>
              ${money(
                member.outstanding
              )}
            </td>

            <td>
              ${escapeHtml(
                member.contributionStatus
              )}
            </td>

          </tr>
        `
      )
      .join("");


  const printWindow =
    window.open(
      "",
      "_blank",
      "width=900,height=700"
    );


  if (!printWindow) {

    alert(
      "Please allow pop-ups to print the report."
    );

    return;
  }


  printWindow.document.write(`

    <!doctype html>

    <html>

    <head>

      <title>
        ${escapeHtml(
          s.group.name
        )}
        — ${formatMonth(
          currentMonth
        )}
      </title>

      <style>

        body {
          font-family:
            Arial,
            sans-serif;

          padding:
            40px;

          color:
            #111;
        }

        h1 {
          margin-bottom:
            4px;
        }

        .muted {
          color:
            #666;
        }

        .summary {
          display:
            grid;

          grid-template-columns:
            repeat(3, 1fr);

          gap:
            12px;

          margin:
            25px 0;
        }

        .box {
          border:
            1px solid #ddd;

          padding:
            15px;

          border-radius:
            8px;
        }

        .value {
          font-size:
            20px;

          font-weight:
            bold;

          margin-top:
            6px;
        }

        table {
          width:
            100%;

          border-collapse:
            collapse;

          margin-top:
            20px;
        }

        th,
        td {
          border:
            1px solid #ddd;

          padding:
            9px;

          text-align:
            left;
        }

        th {
          background:
            #f5f5f5;
        }

        @media print {

          body {
            padding:
              15px;
          }

        }

      </style>

    </head>

    <body>

      <h1>
        ${escapeHtml(
          s.group.name
        )}
      </h1>

      <div class="muted">

        Monthly Financial Report —
        ${formatMonth(
          currentMonth
        )}

      </div>


      <div class="summary">

        <div class="box">

          <div>
            Opening Balance
          </div>

          <div class="value">
            ${money(
              s.opening
            )}
          </div>

        </div>


        <div class="box">

          <div>
            Expected Contributions
          </div>

          <div class="value">
            ${money(
              s.expected
            )}
          </div>

        </div>


        <div class="box">

          <div>
            Collected Contributions
          </div>

          <div class="value">
            ${money(
              s.collected
            )}
          </div>

        </div>


        <div class="box">

          <div>
            Outstanding
          </div>

          <div class="value">
            ${money(
              s.outstanding
            )}
          </div>

        </div>


        <div class="box">

          <div>
            Approved Expenses
          </div>

          <div class="value">
            ${money(
              s.approvedExpenses
            )}
          </div>

        </div>


        <div class="box">

          <div>
            Closing Balance
          </div>

          <div class="value">
            ${money(
              s.closing
            )}
          </div>

        </div>

      </div>


      <h2>
        Member Contribution Status
      </h2>


      <table>

        <thead>

          <tr>

            <th>
              Member
            </th>

            <th>
              Expected
            </th>

            <th>
              Paid
            </th>

            <th>
              Outstanding
            </th>

            <th>
              Status
            </th>

          </tr>

        </thead>


        <tbody>

          ${memberRows}

        </tbody>

      </table>


      <p style="margin-top:30px;">

        Collection rate:

        <strong>
          ${s.collectionRate.toFixed(
            1
          )}%
        </strong>

      </p>


      <p>

        Period status:

        <strong>
          ${String(
            s.period.status
          ).toUpperCase()}
        </strong>

      </p>


      <p>

        Generated:

        ${new Date().toLocaleString(
          "en-KE"
        )}

      </p>


      <script>

        window.onload = function() {
          window.print();
        };

      <\/script>

    </body>

    </html>

  `);

  printWindow.document.close();
}


/* =====================================================
   MONEY
===================================================== */

function money(value) {

  const number =
    Number(value || 0);

  const formatted =
    Math.abs(number)
      .toLocaleString(
        "en-KE",
        {
          minimumFractionDigits:
            2,

          maximumFractionDigits:
            2
        }
      );

  if (number < 0) {

    return `-KSh ${formatted}`;

  }

  return `KSh ${formatted}`;
}


/* =====================================================
   FORMAT MONTH
===================================================== */

function formatMonth(month) {

  if (!month) {
    return "";
  }

  const parts =
    month.split("-");

  const year =
    Number(parts[0]);

  const monthNumber =
    Number(parts[1]);

  const date =
    new Date(
      year,
      monthNumber - 1,
      1
    );

  return date.toLocaleDateString(
    "en-KE",
    {
      month:
        "long",

      year:
        "numeric"
    }
  );
}


/* =====================================================
   NEXT MONTH
===================================================== */

function nextMonth(month) {

  const parts =
    month.split("-");

  let year =
    Number(parts[0]);

  let monthNumber =
    Number(parts[1]);

  monthNumber++;

  if (
    monthNumber === 13
  ) {

    monthNumber = 1;

    year++;
  }

  return (
    `${year}-${String(
      monthNumber
    ).padStart(
      2,
      "0"
    )}-01`
  );
}


/* =====================================================
   ESCAPE HTML
===================================================== */

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


/* =====================================================
   SET TEXT SAFELY
===================================================== */

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


/* =====================================================
   STATUS
===================================================== */

function setStatus(message) {

  const element =
    $("status");

  if (element) {
    element.textContent =
      message;
  }
}


/* =====================================================
   ERROR
===================================================== */

function clearError() {

  const element =
    $("error");

  if (!element) {
    return;
  }

  element.hidden =
    true;

  element.textContent =
    "";
}


/* =====================================================
   SHOW ERROR
===================================================== */

function showError(error) {

  console.error(
    "Monthly Closing Error:",
    error
  );

  const message =
    error?.message ||
    "Unable to load monthly financials.";

  const element =
    $("error");

  if (element) {

    element.hidden =
      false;

    element.textContent =
      message;
  }

  setStatus(
    "Unable to load monthly financials."
  );
}


/* =====================================================
   START
===================================================== */

init();
