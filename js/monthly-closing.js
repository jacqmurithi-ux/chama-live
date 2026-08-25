import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";

/* =========================================================
   HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);

let groupId = null;
let currentMonth = "";
let currentSummary = null;


/* =========================================================
   INIT
========================================================= */

async function init() {
  try {
    const member = await getMyMember();

    if (!member || !member.group_id) {
      throw new Error("Unable to identify your group.");
    }

    groupId = member.group_id;

    /* -----------------------------------------
       Current month
    ----------------------------------------- */

    const today = new Date();

    currentMonth =
      `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}`;

    const monthInput = $("month");

    if (monthInput) {
      monthInput.value = currentMonth;

      monthInput.addEventListener(
        "change",
        async () => {
          const selected = monthInput.value;

          if (!selected) {
            return;
          }

          currentMonth = selected;

          await loadMonthlyClosing();
        }
      );
    }


    /* -----------------------------------------
       Close month
    ----------------------------------------- */

    const closeButton = $("closeMonth");

    if (closeButton) {
      closeButton.addEventListener(
        "click",
        closeMonth
      );
    }


    /* -----------------------------------------
       Reopen month
    ----------------------------------------- */

    const reopenButton = $("reopenMonth");

    if (reopenButton) {
      reopenButton.addEventListener(
        "click",
        reopenMonth
      );
    }


    /* -----------------------------------------
       Print
    ----------------------------------------- */

    const printButton = $("printReport");

    if (printButton) {
      printButton.addEventListener(
        "click",
        printMonthlyReport
      );
    }


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
    `Loading ${formatMonth(currentMonth)}...`
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


    /* =====================================================
       CREATE PERIOD IF IT DOES NOT EXIST
    ===================================================== */

    if (!period) {

      const opening =
        await calculateOpeningBalance();

      const {
        data: createdPeriod,
        error: createError
      } = await supabase
        .from("financial_periods")
        .insert({
          group_id: groupId,
          month: currentMonth,
          opening_balance: opening,
          status: "open"
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      period = createdPeriod;
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
        name,
        member_number,
        status
      `)
      .eq("group_id", groupId)
      .eq("status", "active")
      .order("name", {
        ascending: true
      });

    if (membersError) {
      throw membersError;
    }


    /* =====================================================
       CONTRIBUTIONS
    ===================================================== */

    const {
      data: contributions,
      error: contributionsError
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
        contribution_date,
        created_at
      `)
      .eq("group_id", groupId)
      .eq("month", currentMonth)
      .order("contribution_date", {
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
    } = await supabase
      .from("expenses")
      .select(`
        id,
        description,
        category,
        amount,
        date,
        approval_status,
        created_at
      `)
      .eq("group_id", groupId)
      .gte(
        "date",
        `${currentMonth}-01`
      )
      .lt(
        "date",
        nextMonth(currentMonth)
      )
      .order("date", {
        ascending: true
      });

    if (expensesError) {
      throw expensesError;
    }


    /* =====================================================
       MONTHLY CONTRIBUTION
    ===================================================== */

    const monthlyContribution =
      Number(
        group.monthly_contribution || 0
      );


    /* =====================================================
       MEMBER CONTRIBUTION STATUS
    ===================================================== */

    const memberStatus =
      (members || []).map((member) => {

        const paid =
          (contributions || [])
            .filter(
              contribution =>
                contribution.member_id ===
                member.id
            )
            .reduce(
              (total, contribution) =>
                total +
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
          contributionStatus: status
        };
      });


    /* =====================================================
       TOTAL EXPECTED
    ===================================================== */

    const expected =
      memberStatus.reduce(
        (total, member) =>
          total + member.expected,
        0
      );


    /* =====================================================
       TOTAL COLLECTED
    ===================================================== */

    const collected =
      (contributions || []).reduce(
        (total, contribution) =>
          total +
          Number(
            contribution.amount || 0
          ),
        0
      );


    /* =====================================================
       OUTSTANDING
    ===================================================== */

    const outstanding =
      Math.max(
        expected - collected,
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
              expense.approval_status
            ).toLowerCase() === "approved"
        )
        .reduce(
          (total, expense) =>
            total +
            Number(
              expense.amount || 0
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
              expense.approval_status
            ).toLowerCase() === "pending"
        )
        .reduce(
          (total, expense) =>
            total +
            Number(
              expense.amount || 0
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
              expense.approval_status
            ).toLowerCase() === "rejected"
        )
        .reduce(
          (total, expense) =>
            total +
            Number(
              expense.amount || 0
            ),
          0
        );


    /* =====================================================
       OPENING BALANCE
    ===================================================== */

    const opening =
      Number(
        period.opening_balance || 0
      );


    /* =====================================================
       CALCULATED CLOSING
    ===================================================== */

    const calculatedClosing =
      opening +
      collected -
      approvedExpenses;


    /* =====================================================
       STORED CLOSING
    ===================================================== */

    const closing =
      String(
        period.status
      ).toLowerCase() === "closed" &&
      period.closing_balance !== null
        ? Number(
            period.closing_balance
          )
        : calculatedClosing;


    /* =====================================================
       MEMBER COUNTS
    ===================================================== */

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


    /* =====================================================
       COLLECTION RATE
    ===================================================== */

    const collectionRate =
      expected > 0
        ? (
            collected /
            expected
          ) * 100
        : 0;


    /* =====================================================
       SAVE CURRENT SUMMARY
    ===================================================== */

    currentSummary = {
      group,
      period,
      members: members || [],
      memberStatus,
      contributions: contributions || [],
      expenses: expenses || [],
      expected,
      collected,
      outstanding,
      approvedExpenses,
      pendingExpenses,
      rejectedExpenses,
      opening,
      closing,
      calculatedClosing,
      paidMembers,
      partialMembers,
      outstandingMembers,
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
    data.length > 0 &&
    data[0].closing_balance !== null
  ) {
    return Number(
      data[0].closing_balance
    );
  }


  /* -----------------------------------------
     No previous closed month
     Use group's opening balance
  ----------------------------------------- */

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


  return Number(
    group?.opening_balance || 0
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


  $("periodStatus").textContent =
    String(
      s.period.status || "open"
    ).toUpperCase();


  /* -----------------------------------------
     Financial position
  ----------------------------------------- */

  $("opening2").textContent =
    money(s.opening);


  $("contributions2").textContent =
    money(s.collected);


  $("expenses2").textContent =
    money(s.approvedExpenses);


  $("balance2").textContent =
    money(s.closing);


  /* -----------------------------------------
     Expense summary
  ----------------------------------------- */

  $("approved2").textContent =
    money(s.approvedExpenses);


  $("pendingExpenses").textContent =
    money(s.pendingExpenses);


  $("rejectedExpenses").textContent =
    money(s.rejectedExpenses);
}


/* =========================================================
   MEMBER STATUS TABLE
========================================================= */

function renderMemberStatus() {

  const tbody =
    $("memberRows");

  if (!tbody) {
    return;
  }


  const members =
    currentSummary?.memberStatus || [];


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


/* =========================================================
   UPDATE BUTTONS
========================================================= */

function updateButtons() {

  if (!currentSummary) {
    return;
  }


  const closed =
    String(
      currentSummary.period.status
    ).toLowerCase() === "closed";


  const closeButton =
    $("closeMonth");

  const reopenButton =
    $("reopenMonth");


  if (closeButton) {

    closeButton.hidden =
      closed;

    closeButton.disabled =
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

    alert(
      "Please load the financial month first."
    );

    return;
  }


  const period =
    currentSummary.period;


  if (
    String(
      period.status
    ).toLowerCase() === "closed"
  ) {

    alert(
      "This financial month is already closed."
    );

    return;
  }


  const monthName =
    formatMonth(
      currentMonth
    );


  const confirmed =
    window.confirm(
      `Close ${monthName}?\n\n` +
      `Closing balance: ${money(
        currentSummary.calculatedClosing
      )}\n\n` +
      `This records the final financial position for the month.`
    );


  if (!confirmed) {
    return;
  }


  try {

    clearError();

    setStatus(
      `Closing ${monthName}...`
    );


    const {
      data: sessionData
    } =
      await supabase.auth.getSession();


    const userId =
      sessionData?.session?.user?.id ||
      null;


    const {
      data: updatedPeriod,
      error
    } = await supabase
      .from("financial_periods")
      .update({
        closing_balance:
          currentSummary.calculatedClosing,

        status:
          "closed",

        closed_at:
          new Date().toISOString(),

        closed_by:
          userId
      })
      .eq(
        "id",
        period.id
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


    currentSummary.period =
      updatedPeriod;


    currentSummary.closing =
      Number(
        updatedPeriod.closing_balance
      );


    renderSummary();

    updateButtons();


    setStatus(
      `${formatMonth(
        currentMonth
      )} closed successfully • ${new Date().toLocaleString(
        "en-KE"
      )}`
    );


    alert(
      `${formatMonth(
        currentMonth
      )} has been closed successfully.`
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


  const period =
    currentSummary.period;


  if (
    String(
      period.status
    ).toLowerCase() !== "closed"
  ) {

    alert(
      "This month is already open."
    );

    return;
  }


  const confirmed =
    window.confirm(
      `Reopen ${formatMonth(
        currentMonth
      )}?\n\nThe financial period will return to OPEN status.`
    );


  if (!confirmed) {
    return;
  }


  try {

    clearError();

    setStatus(
      `Reopening ${formatMonth(
        currentMonth
      )}...`
    );


    const {
      data: updatedPeriod,
      error
    } = await supabase
      .from("financial_periods")
      .update({
        status: "open",
        closing_balance: null,
        closed_at: null,
        closed_by: null
      })
      .eq(
        "id",
        period.id
      )
      .select()
      .single();


    if (error) {
      throw error;
    }


    currentSummary.period =
      updatedPeriod;


    currentSummary.closing =
      currentSummary.calculatedClosing;


    renderSummary();

    updateButtons();


    setStatus(
      `${formatMonth(
        currentMonth
      )} reopened successfully • ${new Date().toLocaleString(
        "en-KE"
      )}`
    );


    alert(
      `${formatMonth(
        currentMonth
      )} has been reopened.`
    );

  } catch (error) {

    showError(error);

  }
}


/* =========================================================
   PRINT MONTHLY REPORT
========================================================= */

function printMonthlyReport() {

  if (!currentSummary) {

    alert(
      "Please load a financial month first."
    );

    return;
  }


  const s =
    currentSummary;


  const memberRows =
    s.memberStatus
      .map(
        member => `

          <tr>

            <td>
              ${escapeHtml(
                member.name
              )}
            </td>

            <td>
              ${escapeHtml(
                member.member_number || "—"
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


  const expenseRows =
    s.expenses
      .map(
        expense => `

          <tr>

            <td>
              ${formatDate(
                expense.date
              )}
            </td>

            <td>
              ${escapeHtml(
                expense.description
              )}
            </td>

            <td>
              ${escapeHtml(
                expense.category || "other"
              )}
            </td>

            <td>
              ${money(
                expense.amount
              )}
            </td>

            <td>
              ${escapeHtml(
                String(
                  expense.approval_status ||
                  "pending"
                ).toUpperCase()
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
      "width=1000,height=800"
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

      <meta charset="utf-8">

      <title>
        ${escapeHtml(
          s.group.name
        )}
        -
        ${formatMonth(
          currentMonth
        )}
        Monthly Financial Report
      </title>


      <style>

        body {
          font-family:
            Arial,
            sans-serif;

          padding:
            30px;

          color:
            #111;
        }


        h1 {
          margin-bottom:
            5px;
        }


        h2 {
          margin-top:
            30px;
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
            7px;
        }


        table {
          width:
            100%;

          border-collapse:
            collapse;

          margin-top:
            15px;
        }


        th,
        td {
          border:
            1px solid #ddd;

          padding:
            8px;

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
        Monthly Contribution Summary
      </h2>


      <p>
        Members expected:
        <strong>
          ${s.members.length}
        </strong>
      </p>


      <p>
        Members paid:
        <strong>
          ${s.paidMembers}
        </strong>
      </p>


      <p>
        Partial:
        <strong>
          ${s.partialMembers}
        </strong>
      </p>


      <p>
        Outstanding members:
        <strong>
          ${s.outstandingMembers}
        </strong>
      </p>


      <p>
        Collection rate:
        <strong>
          ${s.collectionRate.toFixed(1)}%
        </strong>
      </p>


      <p>
        Period status:
        <strong>
          ${String(
            s.period.status ||
            "open"
          ).toUpperCase()}
        </strong>
      </p>


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
              Member No.
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


      <h2>
        Expense Report
      </h2>


      <table>

        <thead>

          <tr>

            <th>
              Date
            </th>

            <th>
              Description
            </th>

            <th>
              Category
            </th>

            <th>
              Amount
            </th>

            <th>
              Status
            </th>

          </tr>

        </thead>


        <tbody>

          ${expenseRows}

        </tbody>

      </table>


      <p
        style="margin-top:35px;"
      >

        Generated by
        <strong>
          CHAMA LIVE
        </strong>

      </p>


      <script>

        window.onload = function () {
          window.print();
        };

      <\/script>


    </body>

    </html>

  `);


  printWindow.document.close();
}


/* =========================================================
   MONEY
========================================================= */

function money(value) {

  const number =
    Number(value || 0);


  const formatted =
    Math.abs(number).toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    );


  if (number < 0) {
    return `-KSh ${formatted}`;
  }


  return `KSh ${formatted}`;
}


/* =========================================================
   DATE
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
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );
}


/* =========================================================
   FORMAT MONTH
========================================================= */

function formatMonth(month) {

  if (!month) {
    return "";
  }


  const match =
    /^(\d{4})-(\d{2})$/.exec(
      month
    );


  if (!match) {
    return month;
  }


  const year =
    Number(match[1]);


  const monthNumber =
    Number(match[2]);


  const date =
    new Date(
      year,
      monthNumber - 1,
      1
    );


  return date.toLocaleDateString(
    "en-KE",
    {
      month: "long",
      year: "numeric"
    }
  );
}


/* =========================================================
   NEXT MONTH
========================================================= */

function nextMonth(month) {

  const match =
    /^(\d{4})-(\d{2})$/.exec(
      month
    );


  if (!match) {
    throw new Error(
      "Invalid financial month."
    );
  }


  let year =
    Number(match[1]);


  let monthNumber =
    Number(match[2]);


  monthNumber++;


  if (monthNumber === 13) {

    monthNumber = 1;

    year++;
  }


  return `${year}-${String(
    monthNumber
  ).padStart(2, "0")}-01`;
}


/* =========================================================
   ESCAPE HTML
========================================================= */

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


/* =========================================================
   START APPLICATION
========================================================= */

init();
