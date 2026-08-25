import { supabase } from "./supabase.js";

/* =======================================================
   ELEMENTS
======================================================= */

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const activeMembersEl =
  document.getElementById("activeMembers");

const totalMembersEl =
  document.getElementById("totalMembers");

const contributionsEl =
  document.getElementById("contributions");

const approvedExpensesEl =
  document.getElementById("approvedExpenses");

const pendingExpensesEl =
  document.getElementById("pendingExpenses");

const currentBalanceEl =
  document.getElementById("currentBalance");

const openingEl =
  document.getElementById("opening");

const contributions2El =
  document.getElementById("contributions2");

const expenses2El =
  document.getElementById("expenses2");

const balanceEl =
  document.getElementById("balance");

const contributionRows =
  document.getElementById("contributionRows");

const expenseRows =
  document.getElementById("expenseRows");

const upcomingMeetingsEl =
  document.getElementById("upcomingMeetings");

const completedMeetingsEl =
  document.getElementById("completedMeetings");

const cancelledMeetingsEl =
  document.getElementById("cancelledMeetings");


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

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(
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
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll(
      "'",
      "&#039;"
    );

}


/* =======================================================
   ERROR
======================================================= */

function showError(error) {

  console.error(
    "Reports error:",
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
   GET GROUP
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
          expense.approval_status ||
          ""
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
   RENDER MAIN METRICS
======================================================= */

function renderMetrics() {

  const active =
    getActiveMembers();

  const total =
    members.length;

  const contributionTotal =
    getTotalContributions();

  const approved =
    getApprovedExpenses();

  const pending =
    getPendingExpenses();

  const opening =
    Number(
      group?.opening_balance ||
      0
    );

  const balance =
    opening +
    contributionTotal -
    approved;


  activeMembersEl.textContent =
    active.length;

  totalMembersEl.textContent =
    total;

  contributionsEl.textContent =
    money(
      contributionTotal
    );

  approvedExpensesEl.textContent =
    money(
      approved
    );

  pendingExpensesEl.textContent =
    money(
      pending
    );

  currentBalanceEl.textContent =
    money(
      balance
    );


  /* Financial position */

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
      approved
    );

  balanceEl.textContent =
    money(
      balance
    );

}


/* =======================================================
   MEMBER NAME
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
   RENDER CONTRIBUTIONS
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
                    money(item.amount)
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

    statusEl.textContent =
      "Loading reports...";


    /*
      Get current user's group.
    */

    groupId =
      await getGroupId();


    /*
      Load everything from Supabase.
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


  } catch (error) {

    showError(error);

  }

}


/* =======================================================
   START
======================================================= */

init();
