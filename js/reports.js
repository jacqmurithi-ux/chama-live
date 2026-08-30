/* =========================================================
   CHAMA LIVE — REPORTS
   ---------------------------------------------------------
   BACKEND-DRIVEN REPORTING MODULE

   SOURCE OF TRUTH
   ---------------------------------------------------------
   Financial summary:
   public.get_monthly_financial_report(group_id, month)

   Member contribution status:
   public.get_member_monthly_status(group_id, month)

   RULE:
   Frontend displays accounting results.
   Backend performs accounting calculations.

========================================================= */

import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";


/* =========================================================
   HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);


function setText(id, value) {

  const el = $(id);

  if (el) {
    el.textContent = value;
  }

}


function number(value) {

  const n = Number(value);

  return Number.isFinite(n) ? n : 0;

}


function money(value) {

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number(value));

}


function normalizeType(value) {

  return String(value || "")
    .trim()
    .toLowerCase();

}


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function formatMonth(month) {

  if (!month) {
    return "Selected month";
  }

  const parts = String(month)
    .split("-")
    .map(Number);

  const year = parts[0];
  const monthNumber = parts[1];

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


function getCurrentMonth() {

  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1)
      .padStart(2, "0")
  ].join("-");

}


function addMonths(month, amount) {

  const parts = String(month)
    .split("-")
    .map(Number);

  const year = parts[0];
  const monthNumber = parts[1];

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthNumber)
  ) {
    return "";
  }

  const date = new Date(
    year,
    monthNumber - 1 + amount,
    1
  );

  return [
    date.getFullYear(),
    String(date.getMonth() + 1)
      .padStart(2, "0")
  ].join("-");

}


/* =========================================================
   STATE
========================================================= */

let groupId = null;
let currentMember = null;
let currentMonth = "";
let reportData = null;


/* =========================================================
   INITIALIZE
========================================================= */

async function init() {

  try {

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


    currentMonth =
      getCurrentMonth();


    const monthInput =
      $("month");


    if (monthInput) {

      monthInput.value =
        currentMonth;


      monthInput.addEventListener(
        "change",
        async () => {

          if (!monthInput.value) {
            return;
          }

          currentMonth =
            monthInput.value;

          await loadReports();

        }
      );

    }


    $("printReport")
      ?.addEventListener(
        "click",
        printReport
      );


    $("exportCsv")
      ?.addEventListener(
        "click",
        exportCsv
      );


    $("refreshReport")
      ?.addEventListener(
        "click",
        loadReports
      );


    await loadReports();

  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   LOAD REPORTS
========================================================= */

async function loadReports() {

  clearError();


  if (!groupId) {

    showError(
      "Group could not be identified."
    );

    return;

  }


  setStatus(
    `Loading ${formatMonth(currentMonth)} report...`
  );


  try {

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
        .eq("id", groupId)
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
        .eq("group_id", groupId)
        .eq("month", currentMonth)
        .maybeSingle();


    if (periodError) {
      throw periodError;
    }


    /* =====================================================
       AUTHORITATIVE FINANCIAL REPORT

       Backend is the single source of truth.
    ===================================================== */

    const {
      data: financialReport,
      error: financialReportError
    } =
      await supabase.rpc(
        "get_monthly_financial_report",
        {
          p_group_id: groupId,
          p_month: currentMonth
        }
      );


    if (financialReportError) {
      throw financialReportError;
    }


    const summary =
      normalizeRpcResult(
        financialReport
      );


    /* =====================================================
       MEMBER MONTHLY STATUS

       Same backend allocation engine used across the app.
    ===================================================== */

    const {
      data: memberStatusData,
      error: memberStatusError
    } =
      await supabase.rpc(
        "get_member_monthly_status",
        {
          p_group_id: groupId,
          p_month: currentMonth
        }
      );


    if (memberStatusError) {
      throw memberStatusError;
    }


    const memberStatuses =
      memberStatusData || [];


    /* =====================================================
       CONTRIBUTIONS

       These are transaction records for the selected
       physical transaction period.

       Used for:
       - Cashbook
       - Contribution ledger
       - Payment breakdown
    ===================================================== */

    const start =
      `${currentMonth}-01`;


    const end =
      `${addMonths(currentMonth, 1)}-01`;


    const {
      data: contributions,
      error: contributionsError
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
          mpesa_reference,
          recorded_by,
          created_at,
          goal_id,
          contribution_date,
          notes
        `)
        .eq("group_id", groupId)
        .gte(
          "contribution_date",
          start
        )
        .lt(
          "contribution_date",
          end
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


    if (contributionsError) {
      throw contributionsError;
    }


    /* =====================================================
       EXPENSES
    ===================================================== */

    const {
      data: expenses,
      error: expensesError
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
        .eq("group_id", groupId)
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


    if (expensesError) {
      throw expensesError;
    }


    /* =====================================================
       MEMBERS

       Needed to map member IDs to names in transaction
       reports.
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
          member_number,
          membership_number,
          name,
          phone,
          email,
          role,
          join_date,
          status
        `)
        .eq("group_id", groupId)
        .order(
          "name",
          {
            ascending: true
          }
        );


    if (membersError) {
      throw membersError;
    }


    /* =====================================================
       CONTRIBUTION BREAKDOWN
    ===================================================== */

    const monthlyCollected =
      (contributions || [])
        .filter(
          contribution =>
            normalizeType(
              contribution.contribution_type
            ) === "monthly"
        )
        .reduce(
          (total, contribution) =>
            total +
            number(contribution.amount),
          0
        );


    const otherCollected =
      (contributions || [])
        .filter(
          contribution =>
            normalizeType(
              contribution.contribution_type
            ) !== "monthly"
        )
        .reduce(
          (total, contribution) =>
            total +
            number(contribution.amount),
          0
        );


    /* =====================================================
       REPORT DATA

       IMPORTANT:
       Financial totals come from backend RPC.

       Transaction lists come directly from tables.
    ===================================================== */

    reportData = {

      group,

      period,

      summary,

      members:
        members || [],

      memberStatuses,

      contributions:
        contributions || [],

      expenses:
        expenses || [],


      /* Financial Summary */

      opening:
        number(
          summary.opening_balance
        ),

      expected:
        number(
          summary.expected_monthly_contributions
        ),

      collected:
        number(
          summary.total_contributions_collected
        ),

      previousOutstanding:
        number(
          summary.previous_outstanding
        ),

      appliedThisMonth:
        number(
          summary.applied_this_month
        ),

      carryForward:
        number(
          summary.carry_forward
        ),

      outstanding:
        number(
          summary.current_outstanding
        ),

      approvedExpenses:
        number(
          summary.approved_expenses
        ),

      pendingExpenses:
        number(
          summary.pending_expenses
        ),

      closing:
        number(
          summary.closing_balance
        ),

      calculatedClosing:
        number(
          summary.closing_balance
        ),

      activeMembers:
        number(
          summary.active_members
        ),

      paidCount:
        number(
          summary.members_paid
        ),

      partialCount:
        number(
          summary.partial_payments
        ),

      outstandingCount:
        number(
          summary.outstanding_members
        ),

      collectionRate:
        number(
          summary.collection_rate
        ),

      periodStatus:
        String(
          summary.period_status ||
          period?.status ||
          "open"
        ).toLowerCase(),


      /* Transaction breakdown */

      monthlyCollected,

      otherCollected,

      rejectedExpenses:
        (expenses || [])
          .filter(
            expense =>
              normalizeType(
                expense.approval_status
              ) === "rejected"
          )
          .reduce(
            (total, expense) =>
              total +
              number(expense.amount),
            0
          )

    };


    /* =====================================================
       RENDER
    ===================================================== */

    renderSummary();

    renderMemberReport();

    renderContributionReport();

    renderExpenseReport();

    renderContributionBreakdown();

    renderFinancialPosition();

    updateReportHeader();


    setStatus(
      `${formatMonth(currentMonth)} report loaded`
    );


  } catch (error) {

    showError(error);

  }

}


/* =========================================================
   NORMALIZE RPC RESULT

   Supabase/Postgres RPC may return:
   - object
   - JSON object
   - array containing one object
========================================================= */

function normalizeRpcResult(data) {

  if (Array.isArray(data)) {

    return data[0] || {};

  }


  if (
    typeof data === "string"
  ) {

    try {

      return JSON.parse(data);

    } catch {

      return {};

    }

  }


  return data || {};

}


/* =========================================================
   RENDER SUMMARY
========================================================= */

function renderSummary() {

  const r = reportData;

  if (!r) {
    return;
  }


  setText(
    "openingBalance",
    money(r.opening)
  );


  setText(
    "expected",
    money(r.expected)
  );


  setText(
    "collected",
    money(r.collected)
  );


  setText(
    "monthlyCollected",
    money(r.monthlyCollected)
  );


  setText(
    "otherCollected",
    money(r.otherCollected)
  );


  setText(
    "previousOutstanding",
    money(r.previousOutstanding)
  );


  setText(
    "appliedThisMonth",
    money(r.appliedThisMonth)
  );


  setText(
    "carryForward",
    money(r.carryForward)
  );


  setText(
    "outstanding",
    money(r.outstanding)
  );


  setText(
    "approvedExpenses",
    money(r.approvedExpenses)
  );


  setText(
    "pendingExpenses",
    money(r.pendingExpenses)
  );


  setText(
    "rejectedExpenses",
    money(r.rejectedExpenses)
  );


  setText(
    "closingBalance",
    money(r.closing)
  );


  setText(
    "memberCount",
    r.activeMembers
  );


  setText(
    "membersPaid",
    r.paidCount
  );


  setText(
    "membersPartial",
    r.partialCount
  );


  setText(
    "membersOutstanding",
    r.outstandingCount
  );


  setText(
    "collectionRate",
    `${r.collectionRate.toFixed(1)}%`
  );


  setText(
    "periodStatus",
    r.periodStatus.toUpperCase()
  );

}


/* =========================================================
   RENDER FINANCIAL POSITION
========================================================= */

function renderFinancialPosition() {

  const r = reportData;

  if (!r) {
    return;
  }


  setText(
    "opening2",
    money(r.opening)
  );


  setText(
    "contributions2",
    money(r.collected)
  );


  setText(
    "expenses2",
    money(r.approvedExpenses)
  );


  setText(
    "balance2",
    money(r.closing)
  );

}


/* =========================================================
   RENDER MEMBER REPORT
========================================================= */

function renderMemberReport() {

  const tbody =
    $("memberRows");


  if (!tbody) {
    return;
  }


  const rows =
    reportData?.memberStatuses || [];


  if (!rows.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="10">
          No active members found.
        </td>
      </tr>
    `;

    return;

  }


  tbody.innerHTML =
    rows
      .map(item => {

        const memberName =
          item.name ||
          item.member_name ||
          "Unknown member";


        const memberNumber =
          item.member_number ||
          item.membership_number ||
          "-";


        const status =
          item.contribution_status ||
          item.status ||
          "Outstanding";


        return `
          <tr>

            <td>
              <strong>
                ${escapeHtml(memberName)}
              </strong>
            </td>

            <td>
              ${escapeHtml(memberNumber)}
            </td>

            <td>
              ${money(item.monthly_due)}
            </td>

            <td>
              ${money(item.previous_outstanding)}
            </td>

            <td>
              ${money(item.applied_this_month)}
            </td>

            <td>
              ${money(item.carry_forward)}
            </td>

            <td>
              ${money(item.current_outstanding)}
            </td>

            <td>
              <strong>
                ${escapeHtml(status)}
              </strong>
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   RENDER CONTRIBUTION REPORT
========================================================= */

function renderContributionReport() {

  const tbody =
    $("contributionRows");


  if (!tbody) {
    return;
  }


  const contributions =
    reportData?.contributions || [];


  if (!contributions.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          No contributions recorded for this month.
        </td>
      </tr>
    `;

    return;

  }


  const members =
    reportData?.members || [];


  tbody.innerHTML =
    contributions
      .map(contribution => {

        const member =
          members.find(
            item =>
              String(item.id) ===
              String(
                contribution.member_id
              )
          );


        const reference =
          contribution.mpesa_reference ||
          contribution.reference ||
          "-";


        return `
          <tr>

            <td>
              ${escapeHtml(
                contribution.contribution_date ||
                "-"
              )}
            </td>

            <td>
              ${escapeHtml(
                member?.name ||
                "Unknown member"
              )}
            </td>

            <td>
              ${escapeHtml(
                contribution.contribution_type ||
                "-"
              )}
            </td>

            <td>
              <strong>
                ${money(
                  contribution.amount
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                contribution.payment_method ||
                "-"
              )}
            </td>

            <td>
              ${escapeHtml(reference)}
            </td>

            <td>
              ${escapeHtml(
                contribution.month ||
                "-"
              )}
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   RENDER EXPENSE REPORT
========================================================= */

function renderExpenseReport() {

  const tbody =
    $("expenseRows");


  if (!tbody) {
    return;
  }


  const expenses =
    reportData?.expenses || [];


  if (!expenses.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          No expenses recorded for this month.
        </td>
      </tr>
    `;

    return;

  }


  tbody.innerHTML =
    expenses
      .map(expense => {

        const status =
          normalizeType(
            expense.approval_status
          );


        return `
          <tr>

            <td>
              ${escapeHtml(
                expense.date ||
                "-"
              )}
            </td>

            <td>
              ${escapeHtml(
                expense.description ||
                "-"
              )}
            </td>

            <td>
              ${escapeHtml(
                expense.category ||
                "-"
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
              ${escapeHtml(
                status
                  ? status.toUpperCase()
                  : "-"
              )}
            </td>

            <td>
              ${
                expense.receipt_url

                  ? `
                    <a
                      href="${escapeHtml(
                        expense.receipt_url
                      )}"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View
                    </a>
                  `

                  : "-"
              }
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   CONTRIBUTION BREAKDOWN
========================================================= */

function renderContributionBreakdown() {

  setText(
    "monthlyContributionTotal",
    money(
      reportData?.monthlyCollected
    )
  );


  setText(
    "otherContributionTotal",
    money(
      reportData?.otherCollected
    )
  );


  setText(
    "totalContributionTotal",
    money(
      reportData?.collected
    )
  );

}


/* =========================================================
   REPORT HEADER
========================================================= */

function updateReportHeader() {

  const r =
    reportData;


  if (!r) {
    return;
  }


  setText(
    "reportGroupName",
    r.group?.name ||
    "CHAMA"
  );


  setText(
    "reportMonth",
    formatMonth(
      currentMonth
    )
  );


  setText(
    "reportGenerated",
    new Date().toLocaleString(
      "en-KE"
    )
  );

}


/* =========================================================
   PRINT
========================================================= */

function printReport() {

  if (!reportData) {

    showError(
      "Report data is not loaded."
    );

    return;

  }


  window.print();

}


/* =========================================================
   CSV EXPORT
========================================================= */

function exportCsv() {

  if (!reportData) {

    showError(
      "Report data is not loaded."
    );

    return;

  }


  const rows = [

    [
      "Member",
      "Member Number",
      "Monthly Due",
      "Previous Outstanding",
      "Applied This Month",
      "Carry Forward",
      "Current Outstanding",
      "Status"
    ]

  ];


  (
    reportData.memberStatuses || []
  ).forEach(item => {

    rows.push([

      item.name ||
      item.member_name ||
      "",

      item.member_number ||
      item.membership_number ||
      "",

      number(item.monthly_due),

      number(item.previous_outstanding),

      number(item.applied_this_month),

      number(item.carry_forward),

      number(item.current_outstanding),

      item.contribution_status ||
      item.status ||
      ""

    ]);

  });


  const csv =
    rows
      .map(
        row =>
          row
            .map(
              value =>
                `"${String(value)
                  .replaceAll(
                    '"',
                    '""'
                  )}"`
            )
            .join(",")
      )
      .join("\n");


  const blob =
    new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8;"
      }
    );


  const url =
    URL.createObjectURL(blob);


  const link =
    document.createElement("a");


  link.href =
    url;


  link.download =
    `CHAMA-LIVE-${currentMonth}-report.csv`;


  document.body.appendChild(
    link
  );


  link.click();


  link.remove();


  URL.revokeObjectURL(
    url
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

function showError(error) {

  console.error(
    "CHAMA LIVE Reports:",
    error
  );


  const message =
    error?.message ||
    String(
      error ||
      "Unable to load reports."
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
    "Unable to load reports."
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
