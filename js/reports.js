import { supabase } from "./supabase.js";


/* =======================================================
   ELEMENTS
======================================================= */

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");


/* Financial metrics */

const activeMembersEl =
  document.getElementById(
    "activeMembers"
  );

const totalMembersEl =
  document.getElementById(
    "totalMembers"
  );

const contributionsEl =
  document.getElementById(
    "contributions"
  );

const approvedExpensesEl =
  document.getElementById(
    "approvedExpenses"
  );

const pendingExpensesEl =
  document.getElementById(
    "pendingExpenses"
  );

const currentBalanceEl =
  document.getElementById(
    "currentBalance"
  );


/* Financial position */

const openingEl =
  document.getElementById(
    "opening"
  );

const contributions2El =
  document.getElementById(
    "contributions2"
  );

const expenses2El =
  document.getElementById(
    "expenses2"
  );

const balanceEl =
  document.getElementById(
    "balance"
  );


/* Monthly summary */

const reportMonthEl =
  document.getElementById(
    "reportMonth"
  );

const monthlyExpectedEl =
  document.getElementById(
    "monthlyExpected"
  );

const monthlyCollectedEl =
  document.getElementById(
    "monthlyCollected"
  );

const monthlyOutstandingEl =
  document.getElementById(
    "monthlyOutstanding"
  );

const membersPaidEl =
  document.getElementById(
    "membersPaid"
  );

const membersPartialEl =
  document.getElementById(
    "membersPartial"
  );

const collectionRateEl =
  document.getElementById(
    "collectionRate"
  );


/* Tables */

const contributionRows =
  document.getElementById(
    "contributionRows"
  );

const expenseRows =
  document.getElementById(
    "expenseRows"
  );


/* Meetings */

const upcomingMeetingsEl =
  document.getElementById(
    "upcomingMeetings"
  );

const completedMeetingsEl =
  document.getElementById(
    "completedMeetings"
  );

const cancelledMeetingsEl =
  document.getElementById(
    "cancelledMeetings"
  );


/* =======================================================
   STATE
======================================================= */

let groupId = null;

let group = null;

let members = [];

let contributions = [];

let expenses = [];

let meetings = [];


/* =======================================================
   HELPERS
======================================================= */

function money(value) {

  return new Intl.NumberFormat(
    "en-KE",
    {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }
  ).format(
    Number(value || 0)
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
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );

}


function escapeHtml(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
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


/* =======================================================
   ERROR HANDLING
======================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE Reports Error:",
    error
  );

  errorEl.textContent =
    error?.message ||
    "Unable to load reports.";

  errorEl.hidden = false;

  statusEl.textContent =
    "Unable to load reports.";

}


/* =======================================================
   GET CURRENT USER GROUP
======================================================= */

async function getGroupId() {

  const {
    data,
    error
  } = await supabase.rpc(
    "my_group_id"
  );

  if (error) {
    throw error;
  }

  if (!data) {

    throw new Error(
      "No group is associated with your account."
    );

  }

  return data;

}


/* =======================================================
   LOAD GROUP
======================================================= */

async function loadGroup() {

  const {
    data,
    error
  } = await supabase
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

  if (error) {
    throw error;
  }

  group =
    data;

}


/* =======================================================
   LOAD MEMBERS
======================================================= */

async function loadMembers() {

  const {
    data,
    error
  } = await supabase
    .from("members")
    .select(`
      id,
      name,
      status
    `)
    .eq(
      "group_id",
      groupId
    );

  if (error) {
    throw error;
  }

  members =
    data || [];

}


/* =======================================================
   LOAD CONTRIBUTIONS
======================================================= */

async function loadContributions() {

  const {
    data,
    error
  } = await supabase
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
      contribution_date,
      mpesa_reference,
      created_at
    `)
    .eq(
      "group_id",
      groupId
    )
    .order(
      "contribution_date",
      {
        ascending: false
      }
    )
    .order(
      "created_at",
      {
        ascending: false
      }
    );

  if (error) {
    throw error;
  }

  contributions =
    data || [];

}


/* =======================================================
   LOAD EXPENSES
======================================================= */

async function loadExpenses() {

  const {
    data,
    error
  } = await supabase
    .from("expenses")
    .select(`
      id,
      group_id,
      description,
      category,
      amount,
      date,
      approval_status,
      created_at
    `)
    .eq(
      "group_id",
      groupId
    )
    .order(
      "date",
      {
        ascending: false
      }
    )
    .order(
      "created_at",
      {
        ascending: false
      }
    );

  if (error) {
    throw error;
  }

  expenses =
    data || [];

}


/* =======================================================
   LOAD MEETINGS
======================================================= */

async function loadMeetings() {

  const {
    data,
    error
  } = await supabase
    .from("meetings")
    .select(`
      id,
      group_id,
      title,
      date,
      venue,
      status,
      created_at
    `)
    .eq(
      "group_id",
      groupId
    )
    .order(
      "date",
      {
        ascending: true
      }
    );

  if (error) {
    throw error;
  }

  meetings =
    data || [];

}


/* =======================================================
   ACTIVE MEMBERS
======================================================= */

function getActiveMembers() {

  return members.filter(
    member =>
      String(
        member.status || ""
      ).toLowerCase() ===
      "active"
  );

}


/* =======================================================
   TOTAL CONTRIBUTIONS
======================================================= */

function getTotalContributions() {

  return contributions.reduce(
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

}


/* =======================================================
   APPROVED EXPENSES
======================================================= */

function getApprovedExpenses() {

  return expenses
    .filter(
      expense =>
        String(
          expense.approval_status || ""
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
          expense.amount || 0
        ),
      0
    );

}


/* =======================================================
   PENDING EXPENSES
======================================================= */

function getPendingExpenses() {

  return expenses
    .filter(
      expense =>
        String(
          expense.approval_status || ""
        ).toLowerCase() ===
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

}


/* =======================================================
   CURRENT BALANCE
======================================================= */

function getCurrentBalance() {

  const opening =
    Number(
      group?.opening_balance ||
      0
    );

  const contributionsTotal =
    getTotalContributions();

  const approvedExpenses =
    getApprovedExpenses();

  return (
    opening +
    contributionsTotal -
    approvedExpenses
  );

}


/* =======================================================
   RENDER FINANCIAL METRICS
======================================================= */

function renderMetrics() {

  const activeMembers =
    getActiveMembers();

  const totalMembers =
    members.length;

  const contributionTotal =
    getTotalContributions();

  const approvedExpenses =
    getApprovedExpenses();

  const pendingExpenses =
    getPendingExpenses();

  const opening =
    Number(
      group?.opening_balance ||
      0
    );

  const balance =
    getCurrentBalance();


  activeMembersEl.textContent =
    activeMembers.length;

  totalMembersEl.textContent =
    totalMembers;

  contributionsEl.textContent =
    money(
      contributionTotal
    );

  approvedExpensesEl.textContent =
    money(
      approvedExpenses
    );

  pendingExpensesEl.textContent =
    money(
      pendingExpenses
    );

  currentBalanceEl.textContent =
    money(
      balance
    );


  /* Financial Position */

  openingEl.textContent =
    money(
      opening
    );

  contributions2El.textContent =
    money(
      contributionTotal
    );

  expenses2El.textContent =
    money(
      approvedExpenses
    );

  balanceEl.textContent =
    money(
      balance
    );

}


/* =======================================================
   GET MEMBER NAME
======================================================= */

function getMemberName(
  memberId
) {

  const member =
    members.find(
      item =>
        item.id ===
        memberId
    );

  return (
    member?.name ||
    "Unknown member"
  );

}


/* =======================================================
   RENDER CONTRIBUTION LEDGER
======================================================= */

function renderContributions() {

  if (
    !contributions.length
  ) {

    contributionRows.innerHTML = `
      <tr>
        <td colspan="6">
          No contributions recorded yet.
        </td>
      </tr>
    `;

    return;

  }


  contributionRows.innerHTML =
    contributions
      .slice(0, 20)
      .map(
        item => {

          const date =
            item.contribution_date ||
            item.created_at ||
            (
              item.month
                ? `${item.month}-01`
                : null
            );


          const reference =
            item.mpesa_reference ||
            item.reference ||
            "—";


          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(date)
                )}
              </td>

              <td>
                ${escapeHtml(
                  getMemberName(
                    item.member_id
                  )
                )}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    money(
                      item.amount
                    )
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  item.contribution_type ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  item.payment_method ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  reference
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =======================================================
   RENDER EXPENSES
======================================================= */

function renderExpenses() {

  if (
    !expenses.length
  ) {

    expenseRows.innerHTML = `
      <tr>
        <td colspan="5">
          No expenses recorded yet.
        </td>
      </tr>
    `;

    return;

  }


  expenseRows.innerHTML =
    expenses
      .slice(0, 20)
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
                <strong>
                  ${escapeHtml(
                    money(
                      expense.amount
                    )
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  expense.approval_status
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =======================================================
   MONTHLY CONTRIBUTION SUMMARY
======================================================= */

function renderMonthlyContributionSummary() {

  const activeMembers =
    getActiveMembers();


  const expectedPerMember =
    Number(
      group?.monthly_contribution ||
      0
    );


  /* Current month */

  const now =
    new Date();


  const currentMonth =
    `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;


  const monthName =
    now.toLocaleDateString(
      "en-KE",
      {
        month: "long",
        year: "numeric"
      }
    );


  /*
    Expected contribution.

    Example:

    3 members × KSh 200
    = KSh 600
  */

  const expected =
    expectedPerMember *
    activeMembers.length;


  /*
    Only monthly contributions
    for the current month.
  */

  const monthlyContributions =
    contributions.filter(
      item => {

        return (

          String(
            item.contribution_type ||
            ""
          ).toLowerCase() ===
          "monthly"

          &&

          String(
            item.month ||
            ""
          ) ===
          currentMonth

        );

      }
    );


  /*
    Total collected.
  */

  const collected =
    monthlyContributions.reduce(
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


  /*
    Outstanding.

    Never display a negative
    outstanding amount.
  */

  const outstanding =
    Math.max(
      expected -
      collected,
      0
    );


  /*
    Member statuses.
  */

  let paidCount = 0;

  let partialCount = 0;


  activeMembers.forEach(
    member => {

      const paid =
        monthlyContributions
          .filter(
            item =>
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


      if (
        expectedPerMember > 0 &&
        paid >=
          expectedPerMember
      ) {

        paidCount++;

      }
      else if (
        paid > 0
      ) {

        partialCount++;

      }

    }
  );


  /*
    Collection rate.
  */

  const collectionRate =
    expected > 0
      ? (
          collected /
          expected
        ) * 100
      : 0;


  /*
    Update UI.
  */

  reportMonthEl.textContent =
    monthName;


  monthlyExpectedEl.textContent =
    money(
      expected
    );


  monthlyCollectedEl.textContent =
    money(
      collected
    );


  monthlyOutstandingEl.textContent =
    money(
      outstanding
    );


  membersPaidEl.textContent =
    `${paidCount} / ${activeMembers.length}`;


  membersPartialEl.textContent =
    partialCount;


  collectionRateEl.textContent =
    `${collectionRate.toFixed(1)}%`;

}


/* =======================================================
   MEETINGS SUMMARY
======================================================= */

function renderMeetings() {

  const upcoming =
    meetings.filter(
      meeting =>
        String(
          meeting.status || ""
        ).toLowerCase() ===
        "upcoming"
    ).length;


  const completed =
    meetings.filter(
      meeting =>
        String(
          meeting.status || ""
        ).toLowerCase() ===
        "completed"
    ).length;


  const cancelled =
    meetings.filter(
      meeting =>
        String(
          meeting.status || ""
        ).toLowerCase() ===
        "cancelled"
    ).length;


  upcomingMeetingsEl.textContent =
    upcoming;

  completedMeetingsEl.textContent =
    completed;

  cancelledMeetingsEl.textContent =
    cancelled;

}


/* =======================================================
   INITIALIZE
======================================================= */

async function init() {

  try {

    errorEl.hidden =
      true;

    errorEl.textContent =
      "";

    statusEl.textContent =
      "Loading reports...";


    /*
      Get current group.
    */

    groupId =
      await getGroupId();


    /*
      Load all live data.
    */

    await Promise.all([

      loadGroup(),

      loadMembers(),

      loadContributions(),

      loadExpenses(),

      loadMeetings()

    ]);


    /*
      Render report.
    */

    renderMetrics();

    renderMonthlyContributionSummary();

    renderContributions();

    renderExpenses();

    renderMeetings();


    /*
      Timestamp.
    */

    const now =
      new Date();


    statusEl.textContent =
      `Reports updated • ${now.toLocaleString(
        "en-KE"
      )}`;


  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =======================================================
   START
======================================================= */

init();
