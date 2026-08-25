import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";


/* =====================================================
   HELPERS
===================================================== */

const $ = (id) =>
  document.getElementById(id);


let groupId = null;
let currentMonth = "";
let currentPeriod = null;
let currentSummary = null;
let memberStatus = [];


/* =====================================================
   INITIALISE
===================================================== */

async function init() {

  try {

    const member =
      await getMyMember();

    if (!member) {

      throw new Error(
        "Unable to identify your group."
      );

    }


    groupId =
      member.group_id;


    /*
     * Set current month
     */

    const today =
      new Date();

    currentMonth =
      `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}`;


    $("month").value =
      currentMonth;


    /*
     * Month selector
     */

    $("month").addEventListener(
      "change",
      async () => {

        const selected =
          $("month").value;

        if (!selected) return;

        currentMonth =
          selected;

        await loadMonth();

      }
    );


    /*
     * Buttons
     */

    $("closeMonth").addEventListener(
      "click",
      closeMonth
    );


    $("reopenMonth").addEventListener(
      "click",
      reopenMonth
    );


    $("printReport").addEventListener(
      "click",
      printReport
    );


    /*
     * Load
     */

    await loadMonth();


  } catch (error) {

    showError(error);

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


    /*
     * Create period automatically if missing
     */

    if (!period) {


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

          group_id:
            groupId,

          month:
            currentMonth,

          opening_balance:
            openingBalance,

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


    currentPeriod =
      period;


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
      members.map(
        member => {


          const paid =
            contributions
              .filter(
                contribution =>
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

            status =
              "PAID";

          } else if (
            paid > 0
          ) {

            status =
              "PARTIAL";

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
          sum +
          member.expected,
        0
      );


    const collected =
      contributions.reduce(
        (sum, contribution) =>
          sum +
          Number(
            contribution.amount || 0
          ),
        0
      );


    const outstanding =
      Math.max(
        expected -
        collected,
        0
      );


    const approvedExpenses =
      expenses
        .filter(
          expense =>
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
      expenses
        .filter(
          expense =>
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
      expenses
        .filter(
          expense =>
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
        member =>
          member.contributionStatus ===
          "PAID"
      ).length;


    const partialMembers =
      memberStatus.filter(
        member =>
          member.contributionStatus ===
          "PARTIAL"
      ).length;


    const outstandingMembers =
      memberStatus.filter(
        member =>
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
       SAVE CURRENT SUMMARY
    ------------------------------------------------ */

    currentSummary = {

      group,

      period,

      members,

      contributions,

      expenses,

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


  /*
   * Look for latest closed month.
   */

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
    previousPeriods[0].closing_balance !==
      null
  ) {

    return Number(
      previousPeriods[0]
        .closing_balance
    );

  }


  /*
   * First month:
   * use group's opening balance.
   */

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


  $("openingBalance").textContent =
    money(s.opening);


  $("expected").textContent =
    money(s.expected);


  $("collected").textContent =
    money(s.collected);


  $("outstanding").textContent =
    money(s.outstanding);


  $("approvedExpenses").textContent =
    money(s.approvedExpenses);


  $("closingBalance").textContent =
    money(s.closing);


  $("opening2").textContent =
    money(s.opening);


  $("contributions2").textContent =
    money(s.collected);


  $("expenses2").textContent =
    money(s.approvedExpenses);


  $("balance2").textContent =
    money(s.closing);


  $("memberCount").textContent =
    s.members.length;


  $("membersPaid").textContent =
    s.paidMembers;


  $("membersPartial").textContent =
    s.partialMembers;


  $("membersOutstanding").textContent =
    s.outstandingMembers;


  $("collectionRate").textContent =
    `${s.collectionRate.toFixed(1)}%`;


  $("approved2").textContent =
    money(s.approvedExpenses);


  $("pendingExpenses").textContent =
    money(s.pendingExpenses);


  $("rejectedExpenses").textContent =
    money(s.rejectedExpenses);


  $("periodStatus").textContent =
    String(
      s.period.status || "open"
    ).toUpperCase();

}


/* =====================================================
   RENDER MEMBER TABLE
===================================================== */

function renderMembers() {

  const tbody =
    $("memberRows");


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
        member => `

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
                ${
                  member.contributionStatus
                }
              </strong>
            </td>

          </tr>

        `
      )
      .join("");

}


/* =====================================================
   CLOSE MONTH
===================================================== */

async function closeMonth() {

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

      `Continue?`
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
            user?.id || null

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

      `This will allow the month to be `
      + `updated again.`
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
   BUTTON STATE
===================================================== */

function updateActions() {

  const closed =
    currentPeriod?.status ===
    "closed";


  $("closeMonth").hidden =
    closed;


  $("reopenMonth").hidden =
    !closed;

}


/* =====================================================
   PRINT MONTHLY REPORT
===================================================== */

function printReport() {

  if (
    !currentSummary
  ) {

    return;

  }


  const s =
    currentSummary;


  const memberRows =
    memberStatus
      .map(
        member => `

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
              ${
                member.contributionStatus
              }
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
        —
        ${formatMonth(
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
   MONEY FORMAT
===================================================== */

function money(value) {

  const number =
    Number(
      value || 0
    );


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

    monthNumber =
      1;

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
