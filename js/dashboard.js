import { supabase } from "./supabase.js";


/* =======================================================
   ELEMENTS
======================================================= */

const statusEl =
  document.getElementById(
    "status"
  );

const errorEl =
  document.getElementById(
    "error"
  );


const membersCountEl =
  document.getElementById(
    "membersCount"
  );

const activeMembersEl =
  document.getElementById(
    "activeMembers"
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

const collectionRateEl =
  document.getElementById(
    "collectionRate"
  );

const currentBalanceEl =
  document.getElementById(
    "currentBalance"
  );


const progressMonthEl =
  document.getElementById(
    "progressMonth"
  );

const progressBarEl =
  document.getElementById(
    "progressBar"
  );

const progressTextEl =
  document.getElementById(
    "progressText"
  );

const progressPercentageEl =
  document.getElementById(
    "progressPercentage"
  );


const memberStatusRows =
  document.getElementById(
    "memberStatusRows"
  );

const recentContributionRows =
  document.getElementById(
    "recentContributionRows"
  );

const recentExpenseRows =
  document.getElementById(
    "recentExpenseRows"
  );

const upcomingMeetingRows =
  document.getElementById(
    "upcomingMeetingRows"
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
   ERROR
======================================================= */

function showError(error) {

  console.error(
    "Dashboard error:",
    error
  );

  errorEl.textContent =
    error?.message ||
    "Unable to load dashboard.";

  errorEl.hidden =
    false;

  statusEl.textContent =
    "Unable to load dashboard.";

}


/* =======================================================
   GROUP
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
    )
    .order(
      "name",
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
   CURRENT MONTH
======================================================= */

function getCurrentMonth() {

  const now =
    new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;

}


/* =======================================================
   MONTHLY CONTRIBUTIONS
======================================================= */

function getMonthlyContributions() {

  const month =
    getCurrentMonth();

  return contributions.filter(
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
        month

      );

    }
  );

}


/* =======================================================
   MEMBER CONTRIBUTION STATUS
======================================================= */

function getMemberContributionStatus() {

  const activeMembers =
    getActiveMembers();

  const monthlyContributions =
    getMonthlyContributions();

  const expectedPerMember =
    Number(
      group?.monthly_contribution ||
      0
    );


  return activeMembers.map(
    member => {

      const paid =
        monthlyContributions
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
        expectedPerMember;

      const outstanding =
        Math.max(
          expected -
          paid,
          0
        );


      let status =
        "OUTSTANDING";


      if (
        expected === 0
      ) {

        status =
          "NO TARGET";

      }
      else if (
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

        member,

        expected,

        paid,

        outstanding,

        status

      };

    }
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
   CURRENT BALANCE
======================================================= */

function getCurrentBalance() {

  const opening =
    Number(
      group?.opening_balance ||
      0
    );

  return (
    opening +
    getTotalContributions() -
    getApprovedExpenses()
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
   RENDER MAIN METRICS
======================================================= */

function renderMetrics() {

  const activeMembers =
    getActiveMembers();

  const monthlyContributions =
    getMonthlyContributions();

  const expectedPerMember =
    Number(
      group?.monthly_contribution ||
      0
    );


  const expected =
    expectedPerMember *
    activeMembers.length;


  const collected =
    monthlyContributions.reduce(
      (
        total,
        item
      ) =>
        total +
        Number(
          item.amount ||
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


  const rate =
    expected > 0
      ? (
          collected /
          expected
        ) * 100
      : 0;


  membersCountEl.textContent =
    members.length;

  activeMembersEl.textContent =
    activeMembers.length;


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


  collectionRateEl.textContent =
    `${rate.toFixed(1)}%`;


  currentBalanceEl.textContent =
    money(
      getCurrentBalance()
    );

}


/* =======================================================
   RENDER PROGRESS
======================================================= */

function renderProgress() {

  const month =
    new Date();

  const monthName =
    month.toLocaleDateString(
      "en-KE",
      {
        month: "long",
        year: "numeric"
      }
    );


  const activeMembers =
    getActiveMembers();

  const expectedPerMember =
    Number(
      group?.monthly_contribution ||
      0
    );


  const expected =
    expectedPerMember *
    activeMembers.length;


  const collected =
    getMonthlyContributions()
      .reduce(
        (
          total,
          item
        ) =>
          total +
          Number(
            item.amount ||
            0
          ),
        0
      );


  const percentage =
    expected > 0
      ? Math.min(
          (
            collected /
            expected
          ) * 100,
          100
        )
      : 0;


  progressMonthEl.textContent =
    monthName;


  progressBarEl.style.width =
    `${percentage}%`;


  progressTextEl.textContent =
    `${money(
      collected
    )} / ${money(
      expected
    )}`;


  progressPercentageEl.textContent =
    `${percentage.toFixed(1)}%`;

}


/* =======================================================
   RENDER MEMBER STATUS
======================================================= */

function renderMemberStatus() {

  const statuses =
    getMemberContributionStatus();


  if (
    !statuses.length
  ) {

    memberStatusRows.innerHTML = `
      <tr>
        <td colspan="5">
          No active members.
        </td>
      </tr>
    `;

    return;

  }


  memberStatusRows.innerHTML =
    statuses.map(
      item => {

        return `
          <tr>

            <td>
              ${escapeHtml(
                item.member.name
              )}
            </td>

            <td>
              ${escapeHtml(
                money(
                  item.expected
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                money(
                  item.paid
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                money(
                  item.outstanding
                )
              )}
            </td>

            <td>
              <strong>
                ${escapeHtml(
                  item.status
                )}
              </strong>
            </td>

          </tr>
        `;

      }
    )
    .join("");

}


/* =======================================================
   RECENT CONTRIBUTIONS
======================================================= */

function renderRecentContributions() {

  const recent =
    contributions.slice(
      0,
      5
    );


  if (
    !recent.length
  ) {

    recentContributionRows.innerHTML = `
      <tr>
        <td colspan="3">
          No contributions yet.
        </td>
      </tr>
    `;

    return;

  }


  recentContributionRows.innerHTML =
    recent.map(
      item => {

        return `
          <tr>

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
                formatDate(
                  item.contribution_date ||
                  item.created_at
                )
              )}
            </td>

          </tr>
        `;

      }
    )
    .join("");

}


/* =======================================================
   RECENT EXPENSES
======================================================= */

function renderRecentExpenses() {

  const recent =
    expenses.slice(
      0,
      5
    );


  if (
    !recent.length
  ) {

    recentExpenseRows.innerHTML = `
      <tr>
        <td colspan="3">
          No expenses yet.
        </td>
      </tr>
    `;

    return;

  }


  recentExpenseRows.innerHTML =
    recent.map(
      expense => {

        return `
          <tr>

            <td>
              ${escapeHtml(
                expense.description
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
   UPCOMING MEETINGS
======================================================= */

function renderUpcomingMeetings() {

  const upcoming =
    meetings
      .filter(
        meeting => {

          const status =
            String(
              meeting.status ||
              ""
            ).toLowerCase();

          return (
            status === "upcoming"
          );

        }
      )
      .slice(
        0,
        5
      );


  if (
    !upcoming.length
  ) {

    upcomingMeetingRows.innerHTML = `
      <tr>
        <td colspan="4">
          No upcoming meetings.
        </td>
      </tr>
    `;

    return;

  }


  upcomingMeetingRows.innerHTML =
    upcoming.map(
      meeting => {

        return `
          <tr>

            <td>
              ${escapeHtml(
                formatDate(
                  meeting.date
                )
              )}
            </td>

            <td>
              <strong>
                ${escapeHtml(
                  meeting.title
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                meeting.venue ||
                "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                meeting.status
              )}
            </td>

          </tr>
        `;

      }
    )
    .join("");

}


/* =======================================================
   INITIALIZE
======================================================= */

async function init() {

  try {

    errorEl.hidden =
      true;

    statusEl.textContent =
      "Loading dashboard...";


    /*
      Identify current group.
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
      Render dashboard.
    */

    renderMetrics();

    renderProgress();

    renderMemberStatus();

    renderRecentContributions();

    renderRecentExpenses();

    renderUpcomingMeetings();


    /*
      Timestamp.
    */

    statusEl.textContent =
      `Dashboard updated • ${new Date().toLocaleString(
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
