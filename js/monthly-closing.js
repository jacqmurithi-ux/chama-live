import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";


/* =====================================================
   STATE
===================================================== */

let groupId = null;
let currentMonth = "";
let currentPeriod = null;
let currentSummary = null;
let memberStatus = [];


/* =====================================================
   DOM
===================================================== */

const $ = (id) =>
  document.getElementById(id);


/* =====================================================
   INIT
===================================================== */

async function init() {

  try {

    setStatus(
      "Starting Monthly Closing..."
    );


    /* -----------------------------------------------
       GET CURRENT MEMBER
    ------------------------------------------------ */

    const member =
      await getMyMember();

    if (!member) {

      throw new Error(
        "You are not logged in or your member account could not be found."
      );

    }


    groupId =
      member.group_id;

    if (!groupId) {

      throw new Error(
        "Your member account does not have a group_id."
      );

    }


    /* -----------------------------------------------
       CURRENT MONTH
    ------------------------------------------------ */

    const now =
      new Date();

    currentMonth =
      `${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, "0")}`;


    const month =
      $("month");

    if (!month) {

      throw new Error(
        "The month input #month is missing from monthly-closing.html."
      );

    }


    month.value =
      currentMonth;


    month.addEventListener(
      "change",
      async () => {

        if (!month.value) {
          return;
        }

        currentMonth =
          month.value;

        await loadMonth();

      }
    );


    /* -----------------------------------------------
       BUTTONS
    ------------------------------------------------ */

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
        printReport
      );


    /* -----------------------------------------------
       LOAD
    ------------------------------------------------ */

    await loadMonth();


  } catch (error) {

    showError(
      "Initialisation failed",
      error
    );

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


    /* ===============================================
       GROUP
    =============================================== */

    setStatus(
      "Loading group..."
    );

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

      throw new Error(
        `Groups query failed: ${groupError.message}`
      );

    }


    if (!group) {

      throw new Error(
        "No group record was found."
      );

    }


    /* ===============================================
       FINANCIAL PERIOD
    =============================================== */

    setStatus(
      "Loading financial period..."
    );


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


    if (periodError) {

      throw new Error(
        `Financial period query failed: ${periodError.message}`
      );

    }


    /* ===============================================
       CREATE PERIOD IF MISSING
    =============================================== */

    if (!period) {

      setStatus(
        `Creating ${formatMonth(
          currentMonth
        )} financial period...`
      );


      const opening =
        await calculateOpeningBalance(
          group
        );


      const {
        data: created,
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

        throw new Error(
          `Could not create financial period: ${createError.message}`
        );

      }


      period =
        created;

    }


    currentPeriod =
      period;


    /* ===============================================
       MEMBERS
    =============================================== */

    setStatus(
      "Loading members..."
    );


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

      throw new Error(
        `Members query failed: ${membersError.message}`
      );

    }


    /* ===============================================
       CONTRIBUTIONS
    =============================================== */

    setStatus(
      "Loading contributions..."
    );


    const {
      data: contributions,
      error: contributionError
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
          contribution_date
        `)
        .eq(
          "group_id",
          groupId
        )
        .eq(
          "month",
          currentMonth
        );


    if (contributionError) {

      throw new Error(
        `Contributions query failed: ${contributionError.message}`
      );

    }


    /* ===============================================
       EXPENSES
    =============================================== */

    setStatus(
      "Loading expenses..."
    );


    const {
      data: expenses,
      error: expenseError
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
        );


    if (expenseError) {

      throw new Error(
        `Expenses query failed: ${expenseError.message}`
      );

    }


    /* ===============================================
       MEMBER STATUS
    =============================================== */

    const monthlyContribution =
      Number(
        group.monthly_contribution || 0
      );


    memberStatus =
      (members || [])
        .map(
          (member) => {

            const paid =
              (contributions || [])
                .filter(
                  (item) =>
                    item.member_id ===
                    member.id
                )
                .reduce(
                  (
                    total,
                    item
                  ) =>
                    total +
                    Number(
                      item.amount || 0
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
      memberStatus
        .reduce(
          (total, member) =>
            total +
            member.expected,
          0
        );


    const collected =
      (contributions || [])
        .reduce(
          (total, item) =>
            total +
            Number(
              item.amount || 0
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
          (item) =>
            String(
              item.approval_status
            ).toLowerCase() ===
            "approved"
        )
        .reduce(
          (total, item) =>
            total +
            Number(
              item.amount || 0
            ),
          0
        );


    const pendingExpenses =
      (expenses || [])
        .filter(
          (item) =>
            String(
              item.approval_status
            ).toLowerCase() ===
            "pending"
        )
        .reduce(
          (total, item) =>
            total +
            Number(
              item.amount || 0
            ),
          0
        );


    const rejectedExpenses =
      (expenses || [])
        .filter(
          (item) =>
            String(
              item.approval_status
            ).toLowerCase() ===
            "rejected"
        )
        .reduce(
          (total, item) =>
            total +
            Number(
              item.amount || 0
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
      memberStatus
        .filter(
          (member) =>
            member.contributionStatus ===
            "PAID"
        )
        .length;


    const partialMembers =
      memberStatus
        .filter(
          (member) =>
            member.contributionStatus ===
            "PARTIAL"
        )
        .length;


    const outstandingMembers =
      memberStatus
        .filter(
          (member) =>
            member.contributionStatus ===
            "OUTSTANDING"
        )
        .length;


    const collectionRate =
      expected > 0
        ? (
            collected /
            expected
          ) * 100
        : 0;


    currentSummary = {

      group,

      period,

      members:
        members || [],

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


    /* ===============================================
       RENDER
    =============================================== */

    renderSummary();

    renderMembers();

    updateActions();


    setStatus(
      `Monthly financials loaded • ${
        new Date()
          .toLocaleString("en-KE")
      }`
    );


  } catch (error) {

    showError(
      "Monthly Closing failed",
      error
    );

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
          ascending:
            false
        }
      )
      .limit(1);


  if (error) {

    throw new Error(
      `Previous period query failed: ${error.message}`
    );

  }


  if (
    data &&
    data.length &&
    data[0].closing_balance !==
      null
  ) {

    return Number(
      data[0].closing_balance
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


/* =====================================================
   MEMBER TABLE
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
   CLOSE MONTH
===================================================== */

async function closeMonth() {

  if (
    !currentPeriod ||
    !currentSummary
  ) {

    alert(
      "Monthly financials are not loaded yet."
    );

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


  const s =
    currentSummary;


  const confirmed =
    confirm(
      `Close ${formatMonth(
        currentMonth
      )}?\n\n` +

      `Opening balance: ${
        money(s.opening)
      }\n` +

      `Contributions: ${
        money(s.collected)
      }\n` +

      `Approved expenses: ${
        money(s.approvedExpenses)
      }\n` +

      `Closing balance: ${
        money(s.closing)
      }\n\n` +

      `Continue?`
    );


  if (!confirmed) {
    return;
  }


  try {

    setStatus(
      "Closing financial period..."
    );


    const {
      data: {
        user
      }
    } =
      await supabase
        .auth
        .getUser();


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
            s.closing,

          closed_at:
            new Date()
              .toISOString(),

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

      throw new Error(
        `Close failed: ${error.message}`
      );

    }


    if (!data) {

      throw new Error(
        "Close failed: Supabase updated 0 rows. Check the financial_periods UPDATE policy."
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

    showError(
      "Unable to close month",
      error
    );

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
      )}?\n\nThis will allow the month to be updated again.`
    );


  if (!confirmed) {
    return;
  }


  try {

    setStatus(
      "Reopening financial period..."
    );


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
            null,

          closing_balance:
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

      throw new Error(
        `Reopen failed: ${error.message}`
      );

    }


    if (!data) {

      throw new Error(
        "Reopen failed: Supabase updated 0 rows."
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

    showError(
      "Unable to reopen month",
      error
    );

  }

}


/* =====================================================
   BUTTONS
===================================================== */

function updateActions() {

  const closed =
    currentPeriod?.status ===
    "closed";


  const close =
    $("closeMonth");

  const reopen =
    $("reopenMonth");


  if (close) {

    close.hidden =
      closed;

  }


  if (reopen) {

    reopen.hidden =
      !closed;

  }

}


/* =====================================================
   PRINT
===================================================== */

function printReport() {

  if (!currentSummary) {

    alert(
      "Load the monthly financials first."
    );

    return;

  }


  const s =
    currentSummary;


  const rows =
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


  const win =
    window.open(
      "",
      "_blank",
      "width=900,height=700"
    );


  if (!win) {

    alert(
      "Please allow pop-ups to print the report."
    );

    return;

  }


  win.document.write(`

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
  font-family: Arial, sans-serif;
  padding: 35px;
  color: #111;
}

h1 {
  margin-bottom: 5px;
}

.muted {
  color: #666;
}

.summary {
  display: grid;
  grid-template-columns:
    repeat(3, 1fr);
  gap: 12px;
  margin: 25px 0;
}

.box {
  border: 1px solid #ddd;
  padding: 15px;
  border-radius: 8px;
}

.value {
  font-size: 20px;
  font-weight: bold;
  margin-top: 6px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
}

th,
td {
  border: 1px solid #ddd;
  padding: 9px;
  text-align: left;
}

th {
  background: #f5f5f5;
}

</style>

</head>

<body>

<h1>
${escapeHtml(
  s.group.name
)}
</h1>

<p class="muted">
Monthly Financial Report —
${formatMonth(
  currentMonth
)}
</p>


<div class="summary">

<div class="box">
Opening Balance
<div class="value">
${money(s.opening)}
</div>
</div>


<div class="box">
Expected Contributions
<div class="value">
${money(s.expected)}
</div>
</div>


<div class="box">
Collected Contributions
<div class="value">
${money(s.collected)}
</div>
</div>


<div class="box">
Outstanding
<div class="value">
${money(s.outstanding)}
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
${money(s.closing)}
</div>
</div>

</div>


<h2>
Member Contribution Status
</h2>


<table>

<thead>

<tr>
<th>Member</th>
<th>Expected</th>
<th>Paid</th>
<th>Outstanding</th>
<th>Status</th>
</tr>

</thead>


<tbody>

${rows}

</tbody>

</table>


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


  win.document.close();

}


/* =====================================================
   HELPERS
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


  return number < 0
    ? `-KSh ${formatted}`
    : `KSh ${formatted}`;

}


function formatMonth(
  month
) {

  if (!month) {
    return "";
  }


  const parts =
    month.split("-");


  const year =
    Number(parts[0]);


  const monthNumber =
    Number(parts[1]);


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


function nextMonth(
  month
) {

  const parts =
    month.split("-");


  let year =
    Number(parts[0]);


  let monthNumber =
    Number(parts[1]);


  monthNumber++;


  if (
    monthNumber ===
    13
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


function showError(
  title,
  error
) {

  console.error(
    title,
    error
  );


  const message =
    error?.message ||
    String(error) ||
    "Unknown error";


  const element =
    $("error");


  if (element) {

    element.hidden =
      false;

    element.innerHTML = `
      <strong>
        ${escapeHtml(title)}
      </strong>
      <br>
      ${escapeHtml(message)}
    `;

  }


  setStatus(
    title
  );

}


/* =====================================================
   START
===================================================== */

init();
