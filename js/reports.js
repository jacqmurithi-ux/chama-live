import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";


/* =====================================================
   HELPERS
===================================================== */

const $ = (id) =>
  document.getElementById(id);


let groupId = null;

let currentMonth = "";

let currentReport = null;


/* =====================================================
   INIT
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


    /* Current month */

    const today =
      new Date();


    currentMonth =
      `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}`;


    const monthInput =
      $("month");


    if (monthInput) {

      monthInput.value =
        currentMonth;

    }


    /* Load button */

    $("loadReport")
      ?.addEventListener(
        "click",
        loadReport
      );


    /* Month change */

    $("month")
      ?.addEventListener(
        "change",
        async () => {

          const value =
            $("month").value;

          if (!value) return;

          currentMonth =
            value;

          await loadReport();

        }
      );


    /* Print */

    $("printReport")
      ?.addEventListener(
        "click",
        printReport
      );


    await loadReport();


  } catch (error) {

    showError(error);

  }

}


/* =====================================================
   LOAD REPORT
===================================================== */

async function loadReport() {

  clearError();


  currentMonth =
    $("month")?.value ||
    currentMonth;


  if (!currentMonth) {

    showError(
      new Error(
        "Please select a financial month."
      )
    );

    return;

  }


  setStatus(
    `Loading ${formatMonth(
      currentMonth
    )}...`
  );


  try {


    /* =================================================
       GROUP
    ================================================= */

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


    if (groupError)
      throw groupError;



    /* =================================================
       FINANCIAL PERIOD
    ================================================= */

    let {
      data: period,
      error: periodError
    } =
      await supabase
        .from("financial_periods")
        .select("*")
        .eq(
          "group_id",
          groupId
        )
        .eq(
          "month",
          currentMonth
        )
        .maybeSingle();


    if (periodError)
      throw periodError;



    /*
     * If the month doesn't have a financial
     * period yet, create one.
     */

    if (!period) {

      const opening =
        await calculateOpeningBalance(
          group
        );


      const {
        data,
        error
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


      if (error)
        throw error;


      period =
        data;

    }



    /* =================================================
       ACTIVE MEMBERS
    ================================================= */

    const {
      data: members,
      error: membersError
    } =
      await supabase
        .from("members")
        .select(`
          id,
          name,
          member_number,
          status
        `)
        .eq(
          "group_id",
          groupId
        )
        .eq(
          "status",
          "active"
        )
        .order(
          "name"
        );


    if (membersError)
      throw membersError;



    /* =================================================
       CONTRIBUTIONS
    ================================================= */

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
          payment_method,
          reference,
          mpesa_reference,
          contribution_date,
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
        .order(
          "contribution_date",
          {
            ascending: true
          }
        );


    if (contributionsError)
      throw contributionsError;



    /* =================================================
       EXPENSES
    ================================================= */

    const next =
      nextMonth(
        currentMonth
      );


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
          `${currentMonth}-01`
        )
        .lt(
          "date",
          next
        )
        .order(
          "date",
          {
            ascending: true
          }
        );


    if (expensesError)
      throw expensesError;



    /* =================================================
       MEMBER STATUS
    ================================================= */

    const monthlyContribution =
      Number(
        group.monthly_contribution ||
        0
      );


    const memberReport =
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


          const expected =
            monthlyContribution;


          const outstanding =
            Math.max(
              expected -
              paid,
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

          }
          else if (
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



    /* =================================================
       TOTALS
    ================================================= */

    const expected =
      memberReport.reduce(
        (
          total,
          member
        ) =>
          total +
          member.expected,
        0
      );


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
        period.opening_balance ||
        0
      );


    /*
     * If month is closed, use the stored
     * closing balance.
     *
     * Otherwise calculate live balance.
     */

    const closing =
      period.status === "closed" &&
      period.closing_balance !== null

        ? Number(
            period.closing_balance
          )

        : opening +
          collected -
          approvedExpenses;



    /* =================================================
       STATISTICS
    ================================================= */

    const paidMembers =
      memberReport.filter(
        member =>
          member.contributionStatus ===
          "PAID"
      ).length;


    const partialMembers =
      memberReport.filter(
        member =>
          member.contributionStatus ===
          "PARTIAL"
      ).length;


    const outstandingMembers =
      memberReport.filter(
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



    /* =================================================
       STORE REPORT
    ================================================= */

    currentReport = {

      group,

      period,

      members,

      contributions,

      expenses,

      memberReport,

      expected,

      collected,

      outstanding,

      approvedExpenses,

      opening,

      closing,

      paidMembers,

      partialMembers,

      outstandingMembers,

      collectionRate

    };



    /* =================================================
       RENDER
    ================================================= */

    renderSummary();

    renderCashbook();

    renderMembers();

    renderExpenses();



    setStatus(
      `Report loaded • ${formatMonth(
        currentMonth
      )} • ${new Date().toLocaleString(
        "en-KE"
      )}`
    );


  } catch (error) {

    showError(error);

  }

}


/* =====================================================
   OPENING BALANCE
===================================================== */

async function calculateOpeningBalance(
  group
) {

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
          ascending: false
        }
      )
      .limit(1);


  if (error)
    throw error;


  if (
    data &&
    data.length > 0 &&
    data[0].closing_balance !== null
  ) {

    return Number(
      data[0].closing_balance
    );

  }


  return Number(
    group.opening_balance ||
    0
  );

}


/* =====================================================
   SUMMARY
===================================================== */

function renderSummary() {

  const r =
    currentReport;


  $("openingBalance").textContent =
    money(r.opening);


  $("expected").textContent =
    money(r.expected);


  $("collected").textContent =
    money(r.collected);


  $("outstanding").textContent =
    money(r.outstanding);


  $("approvedExpenses").textContent =
    money(r.approvedExpenses);


  $("closingBalance").textContent =
    money(r.closing);


  $("activeMembers").textContent =
    r.members.length;


  $("membersPaid").textContent =
    r.paidMembers;


  $("membersPartial").textContent =
    r.partialMembers;


  $("membersOutstanding").textContent =
    r.outstandingMembers;


  $("collectionRate").textContent =
    `${r.collectionRate.toFixed(1)}%`;


  $("periodStatus").textContent =
    String(
      r.period.status ||
      "open"
    ).toUpperCase();

}


/* =====================================================
   CASHBOOK
===================================================== */

function renderCashbook() {

  const tbody =
    $("cashbookRows");


  const rows = [];


  /* Contributions */

  currentReport.contributions
    .forEach(
      contribution => {

        rows.push({

          date:
            contribution.contribution_date ||
            contribution.created_at,

          description:
            "Member Contribution",

          type:
            contribution.contribution_type ||
            "monthly",

          method:
            contribution.payment_method ||
            "—",

          reference:
            contribution.mpesa_reference ||
            contribution.reference ||
            "—",

          amount:
            Number(
              contribution.amount ||
              0
            )

        });

      }
    );


  /* Expenses */

  currentReport.expenses
    .forEach(
      expense => {

        rows.push({

          date:
            expense.date,

          description:
            expense.description,

          type:
            "Expense",

          method:
            "—",

          reference:
            "—",

          amount:
            -Number(
              expense.amount ||
              0
            )

        });

      }
    );


  rows.sort(
    (a, b) =>
      new Date(a.date) -
      new Date(b.date)
  );


  if (!rows.length) {

    tbody.innerHTML = `

      <tr>

        <td colspan="6">
          No cashbook transactions recorded.
        </td>

      </tr>

    `;

    return;

  }


  tbody.innerHTML =
    rows.map(
      row => `

        <tr>

          <td>
            ${formatDate(row.date)}
          </td>

          <td>
            ${escapeHtml(
              row.description
            )}
          </td>

          <td>
            ${escapeHtml(
              row.type
            )}
          </td>

          <td>
            ${escapeHtml(
              row.method
            )}
          </td>

          <td>
            ${escapeHtml(
              row.reference
            )}
          </td>

          <td>

            <strong>
              ${money(row.amount)}
            </strong>

          </td>

        </tr>

      `
    ).join("");

}


/* =====================================================
   MEMBER TABLE
===================================================== */

function renderMembers() {

  const tbody =
    $("memberRows");


  if (
    !currentReport.memberReport.length
  ) {

    tbody.innerHTML = `

      <tr>

        <td colspan="6">
          No active members found.
        </td>

      </tr>

    `;

    return;

  }


  tbody.innerHTML =
    currentReport.memberReport
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
              ${escapeHtml(
                member.member_number
              )}
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
                ${member.contributionStatus}
              </strong>

            </td>

          </tr>

        `
      )
      .join("");

}


/* =====================================================
   EXPENSE TABLE
===================================================== */

function renderExpenses() {

  const tbody =
    $("expenseRows");


  if (
    !currentReport.expenses.length
  ) {

    tbody.innerHTML = `

      <tr>

        <td colspan="5">
          No expenses recorded for this month.
        </td>

      </tr>

    `;

    return;

  }


  tbody.innerHTML =
    currentReport.expenses
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
                expense.category
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

              <strong>
                ${escapeHtml(
                  String(
                    expense.approval_status ||
                    ""
                  ).toUpperCase()
                )}
              </strong>

            </td>

          </tr>

        `
      )
      .join("");

}


/* =====================================================
   PRINT
===================================================== */

function printReport() {

  if (!currentReport) {

    alert(
      "Please load a report first."
    );

    return;

  }


  const r =
    currentReport;


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


  const members =
    r.memberReport
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
                member.member_number
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
              ${member.contributionStatus}
            </td>

          </tr>

        `
      )
      .join("");


  const expenses =
    r.expenses
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
                expense.category
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
                  ""
                ).toUpperCase()
              )}
            </td>

          </tr>

        `
      )
      .join("");


  printWindow.document.write(`

    <!doctype html>

    <html>

    <head>

      <title>
        ${escapeHtml(
          r.group.name
        )}
        — Monthly Report
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


        h2 {

          margin-top:
            30px;

        }


        @media print {

          body {

            padding:
              10px;

          }

        }

      </style>

    </head>


    <body>


      <h1>
        ${escapeHtml(
          r.group.name
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

          Opening Balance

          <div class="value">
            ${money(r.opening)}
          </div>

        </div>


        <div class="box">

          Expected Contributions

          <div class="value">
            ${money(r.expected)}
          </div>

        </div>


        <div class="box">

          Contributions Collected

          <div class="value">
            ${money(r.collected)}
          </div>

        </div>


        <div class="box">

          Outstanding

          <div class="value">
            ${money(r.outstanding)}
          </div>

        </div>


        <div class="box">

          Approved Expenses

          <div class="value">
            ${money(r.approvedExpenses)}
          </div>

        </div>


        <div class="box">

          Closing Balance

          <div class="value">
            ${money(r.closing)}
          </div>

        </div>


      </div>



      <h2>
        Contribution Statistics
      </h2>


      <p>
        Active Members:
        <strong>
          ${r.members.length}
        </strong>
      </p>


      <p>
        Members Paid:
        <strong>
          ${r.paidMembers}
        </strong>
      </p>


      <p>
        Partial Payments:
        <strong>
          ${r.partialMembers}
        </strong>
      </p>


      <p>
        Outstanding Members:
        <strong>
          ${r.outstandingMembers}
        </strong>
      </p>


      <p>
        Collection Rate:
        <strong>
          ${r.collectionRate.toFixed(1)}%
        </strong>
      </p>


      <p>
        Period Status:
        <strong>
          ${String(
            r.period.status
          ).toUpperCase()}
        </strong>
      </p>



      <h2>
        Member Contribution Report
      </h2>


      <table>

        <thead>

          <tr>

            <th>Member</th>

            <th>Member No.</th>

            <th>Expected</th>

            <th>Paid</th>

            <th>Outstanding</th>

            <th>Status</th>

          </tr>

        </thead>


        <tbody>

          ${members}

        </tbody>

      </table>



      <h2>
        Expense Report
      </h2>


      <table>

        <thead>

          <tr>

            <th>Date</th>

            <th>Description</th>

            <th>Category</th>

            <th>Amount</th>

            <th>Status</th>

          </tr>

        </thead>


        <tbody>

          ${expenses}

        </tbody>

      </table>



      <script>

        window.onload =
          function() {

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
   DATE
===================================================== */

function formatDate(value) {

  if (!value)
    return "—";


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
      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric"
    }
  );

}


/* =====================================================
   MONTH
===================================================== */

function formatMonth(month) {

  if (!month)
    return "";


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


  return `${year}-${String(
    monthNumber
  ).padStart(
    2,
    "0"
  )}-01`;

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


  if (!element)
    return;


  element.hidden =
    true;


  element.textContent =
    "";

}


function showError(error) {

  console.error(
    "Reports error:",
    error
  );


  const message =
    error?.message ||
    "Unable to load report.";


  const element =
    $("error");


  if (element) {

    element.hidden =
      false;

    element.textContent =
      message;

  }


  setStatus(
    "Unable to load report."
  );

}


/* =====================================================
   START
===================================================== */

init();
