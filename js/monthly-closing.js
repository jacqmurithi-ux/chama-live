```javascript
import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";

/*
========================================================
 CHAMA LIVE — MONTHLY CLOSING
========================================================
*/

const $ = (id) => document.getElementById(id);

let groupId = null;
let currentMonth = "";
let currentSummary = null;
let loading = false;

/*
========================================================
 INIT
========================================================
*/

async function init() {
  try {
    const member = await getMyMember();

    if (!member || !member.group_id) {
      throw new Error("Unable to identify your group.");
    }

    groupId = member.group_id;

    /*
    Current month
    */

    const today = new Date();

    currentMonth =
      `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}`;

    const monthInput = $("month");

    if (monthInput) {
      monthInput.value = currentMonth;

      /*
      Make sure changing the picker actually
      changes the report.
      */

      monthInput.addEventListener(
        "change",
        async () => {
          if (!monthInput.value) return;

          currentMonth = monthInput.value;

          await loadMonthlyClosing();
        }
      );
    }

    /*
    Load button
    */

    const loadButton = $("loadMonth");

    if (loadButton) {
      loadButton.addEventListener(
        "click",
        async () => {
          const selected =
            monthInput?.value;

          if (!selected) {
            showError(
              "Please select a financial month."
            );
            return;
          }

          currentMonth = selected;

          await loadMonthlyClosing();
        }
      );
    }

    /*
    Backwards compatibility:
    some versions may use loadReport.
    */

    const loadReportButton =
      $("loadReport");

    if (
      loadReportButton &&
      loadReportButton !== loadButton
    ) {
      loadReportButton.addEventListener(
        "click",
        async () => {
          const selected =
            monthInput?.value;

          if (!selected) {
            showError(
              "Please select a financial month."
            );
            return;
          }

          currentMonth = selected;

          await loadMonthlyClosing();
        }
      );
    }

    /*
    Close month
    */

    const closeButton =
      $("closeMonth");

    if (closeButton) {
      closeButton.addEventListener(
        "click",
        closeMonth
      );
    }

    /*
    Print
    */

    const printButton =
      $("printReport");

    if (printButton) {
      printButton.addEventListener(
        "click",
        printReport
      );
    }

    /*
    Initial load
    */

    await loadMonthlyClosing();

  } catch (error) {
    showError(error);
  }
}

/*
========================================================
 LOAD MONTHLY CLOSING
========================================================
*/

async function loadMonthlyClosing() {
  if (loading) return;

  loading = true;

  clearError();

  setStatus(
    `Loading ${formatMonth(currentMonth)}...`
  );

  try {
    /*
    ====================================================
    GROUP
    ====================================================
    */

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

    /*
    ====================================================
    FINANCIAL PERIOD
    ====================================================
    */

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
    Create period if it does not exist.
    */

    if (!period) {
      const opening =
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
          opening_balance: opening,
          status: "open"
        })
        .select("*")
        .single();

      if (createError) {
        throw createError;
      }

      period = createdPeriod;
    }

    /*
    ====================================================
    MEMBERS
    ====================================================
    */

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

    /*
    ====================================================
    CONTRIBUTIONS
    ====================================================
    */

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

    /*
    ====================================================
    EXPENSES
    ====================================================
    */

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

    /*
    ====================================================
    MEMBER CONTRIBUTION STATUS
    ====================================================
    */

    const monthlyContribution =
      Number(
        group.monthly_contribution || 0
      );

    const memberStatus =
      members.map((member) => {
        const paid =
          contributions
            .filter(
              (contribution) =>
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
          paid > 0 &&
          paid < expected
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

    /*
    ====================================================
    TOTALS
    ====================================================
    */

    const expected =
      memberStatus.reduce(
        (total, member) =>
          total + member.expected,
        0
      );

    const collected =
      contributions.reduce(
        (total, contribution) =>
          total +
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
      expenses
        .filter(
          (expense) =>
            String(
              expense.approval_status
            ).toLowerCase() ===
            "approved"
        )
        .reduce(
          (total, expense) =>
            total +
            Number(
              expense.amount || 0
            ),
          0
        );

    const pendingExpenses =
      expenses
        .filter(
          (expense) =>
            String(
              expense.approval_status
            ).toLowerCase() ===
            "pending"
        )
        .reduce(
          (total, expense) =>
            total +
            Number(
              expense.amount || 0
            ),
          0
        );

    const rejectedExpenses =
      expenses
        .filter(
          (expense) =>
            String(
              expense.approval_status
            ).toLowerCase() ===
            "rejected"
        )
        .reduce(
          (total, expense) =>
            total +
            Number(
              expense.amount || 0
            ),
          0
        );

    const opening =
      Number(
        period.opening_balance || 0
      );

    /*
    ====================================================
    CLOSING BALANCE
    ====================================================
    */

    const calculatedClosing =
      opening +
      collected -
      approvedExpenses;

    const closing =
      period.status === "closed" &&
      period.closing_balance !== null
        ? Number(
            period.closing_balance
          )
        : calculatedClosing;

    /*
    ====================================================
    MEMBER COUNTS
    ====================================================
    */

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
        ? (collected / expected) * 100
        : 0;

    /*
    ====================================================
    SUMMARY
    ====================================================
    */

    currentSummary = {
      group,
      period,
      members,
      memberStatus,
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

    /*
    ====================================================
    RENDER
    ====================================================
    */

    renderSummary();
    renderMembers();
    renderExpenses();

    setCloseButtonState();

    setStatus(
      `Monthly financials loaded • ${new Date().toLocaleString(
        "en-KE"
      )}`
    );

  } catch (error) {
    showError(error);
  } finally {
    loading = false;
  }
}

/*
========================================================
 OPENING BALANCE
========================================================
*/

async function calculateOpeningBalance(
  group
) {
  /*
  Find the most recent closed financial
  period before the selected month.
  */

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

  /*
  No previous closed period:
  use group's opening balance.
  */

  return Number(
    group.opening_balance || 0
  );
}

/*
========================================================
 RENDER SUMMARY
========================================================
*/

function renderSummary() {
  const s = currentSummary;

  setText(
    "financialMonth",
    formatMonth(currentMonth)
  );

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
    "membersExpected",
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
    "periodStatus",
    String(
      s.period.status || "open"
    ).toUpperCase()
  );

  setText(
    "pendingExpenses",
    money(s.pendingExpenses)
  );

  setText(
    "rejectedExpenses",
    money(s.rejectedExpenses)
  );
}

/*
========================================================
 MEMBER TABLE
========================================================
*/

function renderMembers() {
  const tbody =
    $("memberRows");

  if (!tbody) return;

  const members =
    currentSummary.memberStatus;

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
        (member) => `
          <tr>

            <td>
              <strong>
                ${escapeHtml(member.name)}
              </strong>
            </td>

            <td>
              ${money(member.expected)}
            </td>

            <td>
              <strong>
                ${money(member.paid)}
              </strong>
            </td>

            <td>
              ${money(member.outstanding)}
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

/*
========================================================
 EXPENSE SUMMARY
========================================================
*/

function renderExpenses() {
  const expenses =
    currentSummary.expenses;

  const approved =
    expenses.filter(
      (expense) =>
        String(
          expense.approval_status
        ).toLowerCase() ===
        "approved"
    );

  const pending =
    expenses.filter(
      (expense) =>
        String(
          expense.approval_status
        ).toLowerCase() ===
        "pending"
    );

  const rejected =
    expenses.filter(
      (expense) =>
        String(
          expense.approval_status
        ).toLowerCase() ===
        "rejected"
    );

  setText(
    "approvedExpenseCount",
    approved.length
  );

  setText(
    "pendingExpenseCount",
    pending.length
  );

  setText(
    "rejectedExpenseCount",
    rejected.length
  );
}

/*
========================================================
 CLOSE BUTTON
========================================================
*/

function setCloseButtonState() {
  const button =
    $("closeMonth");

  if (!button || !currentSummary) {
    return;
  }

  const isClosed =
    String(
      currentSummary.period.status
    ).toLowerCase() ===
    "closed";

  if (isClosed) {
    button.disabled = true;
    button.textContent =
      "Month Closed";
    button.classList.add(
      "btn-secondary"
    );

  } else {
    button.disabled = false;
    button.textContent =
      "Close Month";
  }
}

/*
========================================================
 CLOSE MONTH
========================================================
*/

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
    String(period.status).toLowerCase() ===
    "closed"
  ) {
    alert(
      "This financial month is already closed."
    );

    return;
  }

  /*
  Confirm
  */

  const confirmed =
    window.confirm(
      `Close ${formatMonth(
        currentMonth
      )}?\n\n` +
      `Closing balance: ${money(
        currentSummary.closing
      )}\n\n` +
      `Once closed, this period should not be changed.`
    );

  if (!confirmed) {
    return;
  }

  clearError();

  const button =
    $("closeMonth");

  if (button) {
    button.disabled = true;
    button.textContent =
      "Closing...";
  }

  try {
    /*
    Get authenticated user.
    */

    const {
      data: {
        user
      },
      error: userError
    } = await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }

    if (!user) {
      throw new Error(
        "Your session has expired. Please sign in again."
      );
    }

    /*
    Update financial period.
    */

    const {
      data: updatedPeriod,
      error: updateError
    } = await supabase
      .from("financial_periods")
      .update({
        closing_balance:
          currentSummary.closing,

        status: "closed",

        closed_at:
          new Date().toISOString(),

        closed_by:
          user.id
      })
      .eq("id", period.id)
      .eq("group_id", groupId)
      .eq("status", "open")
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    /*
    Update local summary.
    */

    currentSummary.period =
      updatedPeriod;

    currentSummary.closing =
      Number(
        updatedPeriod.closing_balance
      );

    /*
    Render again.
    */

    renderSummary();
    setCloseButtonState();

    setStatus(
      `${formatMonth(
        currentMonth
      )} has been successfully closed.`
    );

    alert(
      `${formatMonth(
        currentMonth
      )} has been successfully closed.`
    );

  } catch (error) {
    showError(error);

    if (button) {
      button.disabled = false;
      button.textContent =
        "Close Month";
    }
  }
}

/*
========================================================
 PRINT REPORT
========================================================
*/

function printReport() {
  if (!currentSummary) {
    alert(
      "Load a financial month first."
    );

    return;
  }

  const s =
    currentSummary;

  const memberRows =
    s.memberStatus
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

  const expenseRows =
    s.expenses
      .map(
        (expense) => `
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
        Monthly Closing
      </title>

      <style>

        body {
          font-family:
            Arial,
            sans-serif;

          padding: 35px;

          color: #111;
        }

        h1 {
          margin-bottom: 5px;
        }

        h2 {
          margin-top: 30px;
        }

        .muted {
          color: #666;
        }

        .summary {
          display: grid;

          grid-template-columns:
            repeat(3, 1fr);

          gap: 12px;

          margin:
            25px 0;
        }

        .box {
          border:
            1px solid #ddd;

          padding: 15px;

          border-radius: 8px;
        }

        .value {
          font-size: 20px;

          font-weight: bold;

          margin-top: 8px;
        }

        table {
          width: 100%;

          border-collapse:
            collapse;

          margin-top: 15px;
        }

        th,
        td {
          border:
            1px solid #ddd;

          padding: 8px;

          text-align: left;
        }

        th {
          background:
            #f5f5f5;
        }

        .closed {
          font-weight: bold;
        }

        @media print {

          body {
            padding: 15px;
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

        Monthly Financial Closing —

        ${formatMonth(
          currentMonth
        )}

      </div>

      <p class="closed">

        Period Status:

        ${String(
          s.period.status
        ).toUpperCase()}

      </p>


      <div class="summary">


        <div class="box">

          <div>
            Opening Balance
          </div>

          <div class="value">
            ${money(s.opening)}
          </div>

        </div>


        <div class="box">

          <div>
            Expected Contributions
          </div>

          <div class="value">
            ${money(s.expected)}
          </div>

        </div>


        <div class="box">

          <div>
            Collected Contributions
          </div>

          <div class="value">
            ${money(s.collected)}
          </div>

        </div>


        <div class="box">

          <div>
            Outstanding
          </div>

          <div class="value">
            ${money(s.outstanding)}
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
            ${money(s.closing)}
          </div>

        </div>


      </div>


      <h2>
        Monthly Contribution Summary
      </h2>

      <p>
        Members Expected:
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
        Partial:
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
          ${s.collectionRate.toFixed(1)}%
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
        Expense Summary
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


      <p style="margin-top:35px;">

        Generated by
        <strong>
          CHAMA LIVE
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

/*
========================================================
 HELPERS
========================================================
*/

function setText(
  id,
  value
) {
  const element = $(id);

  if (element) {
    element.textContent =
      value;
  }
}

function money(value) {
  const number =
    Number(value || 0);

  const formatted =
    Math.abs(number)
      .toLocaleString(
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
      month: "long",
      year: "numeric"
    }
  );
}

function nextMonth(month) {
  const parts =
    month.split("-");

  let year =
    Number(parts[0]);

  let monthNumber =
    Number(parts[1]);

  monthNumber++;

  if (monthNumber === 13) {
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

function setStatus(message) {
  const element =
    $("status");

  if (element) {
    element.textContent =
      message;
  }
}

function clearError() {
  const element =
    $("error");

  if (!element) {
    return;
  }

  element.hidden = true;
  element.textContent = "";
}

function showError(error) {
  console.error(error);

  const message =
    error?.message ||
    "Unable to load monthly financials.";

  const element =
    $("error");

  if (element) {
    element.hidden = false;
    element.textContent =
      message;
  }

  setStatus(
    "Unable to load monthly financials."
  );
}

/*
========================================================
 START
========================================================
*/

init();
```
