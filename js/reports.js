/* =========================================================
   CHAMA LIVE — REPORTS
   Schema-aligned version
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember
} from "./auth.js";


console.log(
  "CHAMA LIVE: reports.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const monthInput =
  document.getElementById("month");

const loadButton =
  document.getElementById("loadReport");

const printButton =
  document.getElementById("printReport");

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const openingBalanceEl =
  document.getElementById(
    "openingBalance"
  );

const expectedEl =
  document.getElementById(
    "expected"
  );

const collectedEl =
  document.getElementById(
    "collected"
  );

const outstandingEl =
  document.getElementById(
    "outstanding"
  );

const approvedExpensesEl =
  document.getElementById(
    "approvedExpenses"
  );

const closingBalanceEl =
  document.getElementById(
    "closingBalance"
  );

const activeMembersEl =
  document.getElementById(
    "activeMembers"
  );

const membersPaidEl =
  document.getElementById(
    "membersPaid"
  );

const membersPartialEl =
  document.getElementById(
    "membersPartial"
  );

const membersOutstandingEl =
  document.getElementById(
    "membersOutstanding"
  );

const collectionRateEl =
  document.getElementById(
    "collectionRate"
  );

const periodStatusEl =
  document.getElementById(
    "periodStatus"
  );

const cashbookRows =
  document.getElementById(
    "cashbookRows"
  );

const memberRows =
  document.getElementById(
    "memberRows"
  );

const expenseRows =
  document.getElementById(
    "expenseRows"
  );


/* =========================================================
   STATE
========================================================= */

let groupId = null;

let currentMember = null;

let group = null;

let members = [];

let contributions = [];

let expenses = [];

let period = null;

let initialized = false;


/* =========================================================
   HELPERS
========================================================= */

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
    Number(value || 0)
  );

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

    return value;

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


function currentMonth() {

  const date =
    new Date();


  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(2, "0")
  ].join("-");

}


function showError(error) {

  console.error(
    "CHAMA LIVE Reports:",
    error
  );


  if (errorEl) {

    errorEl.textContent =
      error?.message ||
      "Unable to load report.";

    errorEl.hidden =
      false;

  }

}


/* =========================================================
   LOAD GROUP
========================================================= */

async function loadGroup() {

  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select(`
        id,
        name,
        monthly_contribution,
        opening_balance,
        category,
        description,
        country
      `)
      .eq(
        "id",
        groupId
      )
      .single();


  if (error) {

    throw error;

  }


  group =
    data;

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  const {
    data,
    error
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
        "member_number",
        {
          ascending: true
        }
      );


  if (error) {

    throw error;

  }


  members =
    data || [];

}


/* =========================================================
   LOAD CONTRIBUTIONS
========================================================= */

async function loadContributions(
  month
) {

  const {
    data,
    error
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
        notes,
        mpesa_reference
      `)
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "month",
        month
      )
      .order(
        "contribution_date",
        {
          ascending: true
        }
      )
      .order(
        "created_at",
        {
          ascending: true
        }
      );


  if (error) {

    throw error;

  }


  contributions =
    data || [];

}


/* =========================================================
   LOAD EXPENSES
========================================================= */

async function loadExpenses(
  month
) {

  const start =
    `${month}-01`;


  const date =
    new Date(
      `${month}-01T00:00:00`
    );


  date.setMonth(
    date.getMonth() + 1
  );


  const end =
    [
      date.getFullYear(),
      String(
        date.getMonth() + 1
      ).padStart(2, "0"),
      "01"
    ].join("-");


  const {
    data,
    error
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
          ascending: true
        }
      )
      .order(
        "created_at",
        {
          ascending: true
        }
      );


  if (error) {

    throw error;

  }


  expenses =
    data || [];

}


/* =========================================================
   LOAD / CREATE FINANCIAL PERIOD
========================================================= */

async function loadFinancialPeriod(
  month
) {

  let {
    data,
    error
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
        month
      )
      .limit(1);


  if (error) {

    throw error;

  }


  if (
    data &&
    data.length
  ) {

    period =
      data[0];

    return;

  }


  /*
   * Create an open period using
   * the group's opening balance.
   */

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
          month,

        opening_balance:
          Number(
            group?.opening_balance ||
            0
          ),

        status:
          "open"

      })
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
      .single();


  if (createError) {

    throw createError;

  }


  period =
    created;

}


/* =========================================================
   MEMBER PAID MAP
========================================================= */

function getMemberPaid(
  memberId,
  month
) {

  return contributions
    .filter(
      contribution =>
        String(
          contribution.member_id
        ) ===
        String(
          memberId
        ) &&
        String(
          contribution.month ||
          ""
        ).slice(0, 7) ===
        month
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

}


/* =========================================================
   CALCULATE
========================================================= */

function calculateReport(
  month
) {

  const activeMembers =
    members.filter(
      member =>
        String(
          member.status ||
          "active"
        ).toLowerCase() ===
        "active"
    );


  const monthlyAmount =
    Number(
      group?.monthly_contribution ||
      0
    );


  const expected =
    activeMembers.length *
    monthlyAmount;


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


  const approvedExpenses =
    expenses
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


  const outstanding =
    Math.max(
      expected -
      collected,
      0
    );


  const opening =
    Number(
      period?.opening_balance ||
      group?.opening_balance ||
      0
    );


  const closing =
    opening +
    collected -
    approvedExpenses;


  const paidCount =
    activeMembers.filter(
      member =>
        getMemberPaid(
          member.id,
          month
        ) >=
        monthlyAmount &&
        monthlyAmount > 0
    ).length;


  const partialCount =
    activeMembers.filter(
      member => {

        const paid =
          getMemberPaid(
            member.id,
            month
          );


        return (
          paid > 0 &&
          paid <
          monthlyAmount
        );

      }
    ).length;


  const outstandingCount =
    activeMembers.filter(
      member =>
        getMemberPaid(
          member.id,
          month
        ) <= 0
    ).length;


  const collectionRate =
    expected > 0
      ? (
          collected /
          expected
        ) *
        100
      : 0;


  return {

    activeMembers:
      activeMembers.length,

    expected,

    collected,

    outstanding,

    approvedExpenses,

    opening,

    closing,

    paidCount,

    partialCount,

    outstandingCount,

    collectionRate

  };

}


/* =========================================================
   RENDER SUMMARY
========================================================= */

function renderSummary(
  summary
) {

  openingBalanceEl.textContent =
    money(
      summary.opening
    );


  expectedEl.textContent =
    money(
      summary.expected
    );


  collectedEl.textContent =
    money(
      summary.collected
    );


  outstandingEl.textContent =
    money(
      summary.outstanding
    );


  approvedExpensesEl.textContent =
    money(
      summary.approvedExpenses
    );


  closingBalanceEl.textContent =
    money(
      summary.closing
    );


  activeMembersEl.textContent =
    summary.activeMembers;


  membersPaidEl.textContent =
    summary.paidCount;


  membersPartialEl.textContent =
    summary.partialCount;


  membersOutstandingEl.textContent =
    summary.outstandingCount;


  collectionRateEl.textContent =
    `${summary.collectionRate.toFixed(1)}%`;


  periodStatusEl.textContent =
    String(
      period?.status ||
      "open"
    ).toUpperCase();

}


/* =========================================================
   RENDER CASHBOOK
========================================================= */

function renderCashbook() {

  if (!cashbookRows) {

    return;

  }


  const contributionEntries =
    contributions.map(
      contribution => {

        const reference =
          contribution.mpesa_reference ||
          contribution.reference ||
          "—";


        const member =
          members.find(
            item =>
              String(
                item.id
              ) ===
              String(
                contribution.member_id
              )
          );


        return {

          date:
            contribution.contribution_date ||
            contribution.created_at,

          description:
            member?.name ||
            "Member contribution",

          type:
            contribution.contribution_type ||
            "Contribution",

          method:
            contribution.payment_method ||
            "—",

          reference:
            reference,

          amount:
            Number(
              contribution.amount ||
              0
            ),

          income:
            true

        };

      }
    );


  const expenseEntries =
    expenses
      .filter(
        expense =>
          String(
            expense.approval_status ||
            ""
          ).toLowerCase() ===
          "approved"
      )
      .map(
        expense => {

          return {

            date:
              expense.date,

            description:
              expense.description,

            type:
              "Expense",

            method:
              "—",

            reference:
              expense.receipt_url ||
              "—",

            amount:
              Number(
                expense.amount ||
                0
              ),

            income:
              false

          };

        }
      );


  const entries =
    [
      ...contributionEntries,
      ...expenseEntries
    ]
      .sort(
        (
          a,
          b
        ) =>
          new Date(
            a.date
          ) -
          new Date(
            b.date
          )
      );


  if (!entries.length) {

    cashbookRows.innerHTML = `
      <tr>
        <td colspan="6">
          No transactions recorded for this month.
        </td>
      </tr>
    `;

    return;

  }


  cashbookRows.innerHTML =
    entries
      .map(
        entry => {

          const amount =
            entry.income
              ? `+${money(
                  entry.amount
                )}`
              : `-${money(
                  entry.amount
                )}`;


          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    entry.date
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.description
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.type
                )}
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
                  ${escapeHtml(
                    amount
                  )}
                </strong>
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   RENDER MEMBERS
========================================================= */

function renderMembers(
  month
) {

  if (!memberRows) {

    return;

  }


  const activeMembers =
    members.filter(
      member =>
        String(
          member.status ||
          "active"
        ).toLowerCase() ===
        "active"
    );


  if (!activeMembers.length) {

    memberRows.innerHTML = `
      <tr>
        <td colspan="6">
          No active members found.
        </td>
      </tr>
    `;

    return;

  }


  const expected =
    Number(
      group?.monthly_contribution ||
      0
    );


  memberRows.innerHTML =
    activeMembers
      .map(
        member => {

          const paid =
            getMemberPaid(
              member.id,
              month
            );


          const outstanding =
            Math.max(
              expected -
              paid,
              0
            );


          let status =
            "Outstanding";


          if (
            expected > 0 &&
            paid >= expected
          ) {

            status =
              "Paid";

          }
          else if (
            paid > 0
          ) {

            status =
              "Partial";

          }


          return `
            <tr>

              <td>
                ${escapeHtml(
                  member.name
                )}
              </td>

              <td>
                ${escapeHtml(
                  member.member_number ||
                  member.membership_number ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(expected)
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(paid)
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(outstanding)
                )}
              </td>

              <td>
                ${escapeHtml(
                  status
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   RENDER EXPENSES
========================================================= */

function renderExpenses() {

  if (!expenseRows) {

    return;

  }


  if (!expenses.length) {

    expenseRows.innerHTML = `
      <tr>
        <td colspan="5">
          No expenses recorded for this month.
        </td>
      </tr>
    `;

    return;

  }


  expenseRows.innerHTML =
    expenses
      .map(
        expense => {

          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    expense.date
                  )
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
                ${escapeHtml(
                  money(
                    expense.amount
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  expense.approval_status ||
                  "pending"
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   LOAD REPORT
========================================================= */

async function loadReport() {

  const month =
    monthInput?.value ||
    currentMonth();


  if (monthInput) {

    monthInput.value =
      month;

  }


  try {

    if (errorEl) {

      errorEl.hidden =
        true;

    }


    if (statusEl) {

      statusEl.textContent =
        "Loading report...";

    }


    await loadGroup();

    await loadMembers();

    await loadContributions(
      month
    );

    await loadExpenses(
      month
    );

    await loadFinancialPeriod(
      month
    );


    const summary =
      calculateReport(
        month
      );


    renderSummary(
      summary
    );


    renderCashbook();

    renderMembers(
      month
    );

    renderExpenses();


    if (statusEl) {

      statusEl.textContent =
        `Report loaded for ${month}.`;

    }

  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =========================================================
   PRINT
========================================================= */

function printReport() {

  window.print();

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initPage() {

  if (initialized) {

    return;

  }


  initialized =
    true;


  try {

    await requireAuth();


    currentMember =
      await getMyMember();


    groupId =
      currentMember.group_id;


    const month =
      currentMonth();


    if (monthInput) {

      monthInput.value =
        month;

    }


    loadButton?.addEventListener(
      "click",
      loadReport
    );


    printButton?.addEventListener(
      "click",
      printReport
    );


    await loadReport();


    console.log(
      "CHAMA LIVE: reports page ready"
    );

  }
  catch (error) {

    initialized =
      false;

    showError(
      error
    );

  }

}


export const initReports =
  initPage;


console.log(
  "CHAMA LIVE: reports.js ready"
);
