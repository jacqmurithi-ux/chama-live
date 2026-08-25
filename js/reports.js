import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";


/* =====================================================
   HELPERS
===================================================== */

const $ = (id) =>
  document.getElementById(id);


let groupId = null;
let currentMonth = "";
let currentSummary = null;


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


    /* -----------------------------------------------
       CURRENT MONTH
    ------------------------------------------------ */

    const today =
      new Date();

    currentMonth =
      `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}`;


    const monthInput =
      $("month");


    if (!monthInput) {

      throw new Error(
        "Month selector was not found."
      );

    }


    monthInput.value =
      currentMonth;


    /* -----------------------------------------------
       EVENTS
    ------------------------------------------------ */

    $("loadReport")
      ?.addEventListener(
        "click",
        loadReport
      );


    monthInput
      .addEventListener(
        "change",
        async () => {

          if (
            monthInput.value
          ) {

            currentMonth =
              monthInput.value;

            await loadReport();

          }

        }
      );


    $("printReport")
      ?.addEventListener(
        "click",
        printReport
      );


    /* -----------------------------------------------
       LOAD
    ------------------------------------------------ */

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


  setStatus(
    `Loading ${formatMonth(
      currentMonth
    )} report...`
  );


  try {


    /* ===============================================
       GROUP
    =============================================== */

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


    /* ===============================================
       FINANCIAL PERIOD
    =============================================== */

    const {
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


    if (periodError) {

      throw periodError;

    }


    /* ===============================================
       MEMBERS
    =============================================== */

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


    if (membersError) {

      throw membersError;

    }


    /* ===============================================
       CONTRIBUTIONS
    =============================================== */

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
          created_at,
          notes
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


    if (contributionsError) {

      throw contributionsError;

    }


    /* ===============================================
       EXPENSES
    =============================================== */

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
          nextMonth(
            currentMonth
          )
        )
        .order(
          "date",
          {
            ascending: true
          }
        );


    if (expensesError) {

      throw expensesError;

    }


    /* ===============================================
       MONTHLY CONTRIBUTION
    =============================================== */

    const monthlyContribution =
      Number(
        group.monthly_contribution || 0
      );


    /* ===============================================
       MEMBER STATUS
    =============================================== */

    const memberStatus =
      (members || []).map(
        member => {

          const paid =
            (contributions || [])
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


    /* ===============================================
       TOTALS
    =============================================== */

    const expected =
      memberStatus.reduce(
        (
          total,
          member
        ) =>
          total +
          member.expected,
        0
      );


    const collected =
      (contributions || [])
        .reduce(
          (
            total,
            contribution
          ) =>
            total +
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
      (expenses || [])
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
              expense.amount || 0
            ),
          0
        );


    const opening =
      Number(
        period?.opening_balance ??
        group.opening_balance ??
        0
      );


    const closing =
      period?.status === "closed" &&
      period?.closing_balance !== null
        ? Number(
            period.closing_balance
          )
        : opening +
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


    const pendingExpenses =
      (expenses || [])
        .filter(
          expense =>
            expense.approval_status ===
            "pending"
        )
        .reduce(
          (
            total,
            expense
          ) =>
            total +
            Number(
              expense.amount || 0
            ),
          0
        );


    const rejectedExpenses =
      (expenses || [])
        .filter(
          expense =>
            expense.approval_status ===
            "rejected"
        )
        .reduce(
          (
            total,
            expense
          ) =>
            total +
            Number(
              expense.amount || 0
            ),
          0
        );


    /* ===============================================
       SAVE REPORT
    =============================================== */

    currentSummary = {

      group,

      period,

      members:

        members || [],

      contributions:

        contributions || [],

      expenses:

        expenses || [],

      memberStatus,

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


    /* ===============================================
       RENDER
    =============================================== */

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
   RENDER SUMMARY
===================================================== */

function renderSummary() {

  const s =
    currentSummary;


  $("openingBalance").textContent =
    money(
      s.opening
    );


  $("expected").textContent =
    money(
      s.expected
    );


  $("collected").textContent =
    money(
      s.collected
    );


  $("outstanding").textContent =
    money(
      s.outstanding
    );


  $("approvedExpenses").textContent =
    money(
      s.approvedExpenses
    );


  $("closingBalance").textContent =
    money(
      s.closing
    );


  $("activeMembers").textContent =
    s.members.length;


  $("membersPaid").textContent =
    s.paidMembers;


  $("membersPartial").textContent =
    s.partialMembers;


  $("membersOutstanding").textContent =
    s.outstandingMembers;


  $("collectionRate").textContent =
    `${s.collectionRate.toFixed(
      1
    )}%`;


  $("periodStatus").textContent =
    String(
      s.period?.status ||
      "open"
    ).toUpperCase();

}


/* =====================================================
   CASHBOOK
===================================================== */

function renderCashbook() {

  const tbody =
    $("cashbookRows");


  const contributions =
    currentSummary
      .contributions
      .map(
        contribution => ({

          date:
            contribution.contribution_date ||
            contribution.created_at,

          description:
            contribution.contribution_type ||
            "Contribution",

          type:
            "Contribution",

          method:
            contribution.payment_method ||
            "—",

          reference:
            contribution.mpesa_reference ||
            contribution.reference ||
            "—",

          amount:
            Number(
              contribution.amount || 0
            ),

          sort:
            1

        })
      );


  const expenses =
    currentSummary
      .expenses
      .filter(
        expense =>
          expense.approval_status ===
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
            "—",

          amount:
            -Number(
              expense.amount || 0
            ),

          sort:
            2

        })
      );


  const entries =
    [
      ...contributions,
      ...expenses
    ]
      .sort(
        (
          a,
          b
        ) =>
          new Date(a.date) -
          new Date(b.date)
      );


  if (!entries.length) {

    tbody.innerHTML = `

      <tr>

        <td colspan="6">
          No cashbook entries recorded.
        </td>

      </tr>

    `;

    return;

  }


  tbody.innerHTML =
    entries
      .map(
        entry => `

          <tr>

            <td>
              ${formatDate(
                entry.date
              )}
            </td>

            <td>
              ${escapeHtml(
                entry.description
              )}
            </td>

            <td>
              ${entry.type}
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
                ${money(
                  entry.amount
                )}
              </strong>
            </td>

          </tr>

        `
      )
      .join("");

}


/* =====================================================
   MEMBER REPORT
===================================================== */

function renderMembers() {

  const tbody =
    $("memberRows");


  const members =
    currentSummary
      .memberStatus;


  if (!members.length) {

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
              ${escapeHtml(
                member.member_number ||
                "—"
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
   EXPENSE REPORT
===================================================== */

function renderExpenses() {

  const tbody =
    $("expenseRows");


  const expenses =
    currentSummary
      .expenses;


  if (!expenses.length) {

    tbody.innerHTML = `

      <tr>

        <td colspan="5">
          No expenses recorded.
        </td>

      </tr>

    `;

    return;

  }


  tbody.innerHTML =
    expenses
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
                expense.category ||
                "other"
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
              ${String(
                expense.approval_status ||
                "pending"
              ).toUpperCase()}
            </td>

          </tr>

        `
      )
      .join("");

}


/* =====================================================
   PRINT REPORT
===================================================== */

function printReport() {

  if (!currentSummary) {

    alert(
      "Load a report first."
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
                member.member_number ||
                "—"
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
                expense.category ||
                "other"
              )}
            </td>

            <td>
              ${money(
                expense.amount
              )}
            </td>

            <td>
              ${String(
                expense.approval_status ||
                "pending"
              ).toUpperCase()}
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
            35px;

          color:
            #111;

        }


        h1 {

          margin:
            0 0 5px;

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
            6px;

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
            #f4f4f4;

        }


        .footer {

          margin-top:
            35px;

          color:
            #666;

          font-size:
            12px;

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

          Opening Balance

          <div class="value">
            ${money(
              s.opening
            )}
          </div>

        </div>


        <div class="box">

          Expected Contributions

          <div class="value">
            ${money(
              s.expected
            )}
          </div>

        </div>


        <div class="box">

          Contributions Collected

          <div class="value">
            ${money(
              s.collected
            )}
          </div>

        </div>


        <div class="box">

          Outstanding

          <div class="value">
            ${money(
              s.outstanding
            )}
          </div>

        </div>


        <div class="box">

          Approved Expenses

          <div class="value">
            ${money(
              s.approvedExpenses
            )}
          </div>

        </div>


        <div class="box">

          Closing Balance

          <div class="value">
            ${money(
              s.closing
            )}
          </div>

        </div>

      </div>


      <h2>
        Contribution Statistics
      </h2>


      <p>
        Active Members:
        <strong>
          ${s.members.length}
        </strong>
      </p>


      <p>
        Members Paid:
        <strong>
          ${s.paidMembers}
        </strong>
      </p>


      <p>
        Partial Payments:
        <strong>
          ${s.partialMembers}
        </strong>
      </p>


      <p>
        Outstanding Members:
        <strong>
          ${s.outstandingMembers}
        </strong>
      </p>


      <p>
        Collection Rate:
        <strong>
          ${s.collectionRate.toFixed(
            1
          )}%
        </strong>
      </p>


      <p>
        Period Status:
        <strong>
          ${String(
            s.period?.status ||
            "open"
          ).toUpperCase()}
        </strong>
      </p>


      <h2>
        Member Contribution Report
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


      <div class="footer">

        Generated by CHAMA LIVE

        —
        ${new Date().toLocaleString(
          "en-KE"
        )}

      </div>


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
   FORMAT DATE
===================================================== */

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
   FORMAT MONTH
===================================================== */

function formatMonth(month) {

  if (!month) {

    return "";

  }


  const parts =
    month.split("-");


  const year =
    Number(
      parts[0]
    );


  const monthNumber =
    Number(
      parts[1]
    );


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
    Number(
      parts[0]
    );


  let monthNumber =
    Number(
      parts[1]
    );


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
