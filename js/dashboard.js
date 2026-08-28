
/* =========================================================
   CHAMA LIVE — DASHBOARD
   FINAL FIXED VERSION
========================================================= */

import { supabase } from "./supabase.js";

import {
  getCurrentMember,
  getCurrentGroup,
  money
} from "./auth.js";


console.log("CHAMA LIVE: dashboard.js loaded");


/* =========================================================
   STATE
========================================================= */

let currentMember = null;
let currentGroup = null;
let currentGroupId = null;
let initialized = false;


/* =========================================================
   HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
}


function setText(id, value) {

  const element = byId(id);

  if (element) {
    element.textContent = value ?? "—";
  }

}


function formatDate(value) {

  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

}


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function showError(error) {

  console.error(
    "CHAMA LIVE: dashboard error",
    error
  );

  const errorBox = byId("error");

  if (errorBox) {

    errorBox.hidden = false;

    errorBox.textContent =
      error?.message ||
      "Unable to load dashboard data.";

  }

}


/* =========================================================
   CURRENT MONTH
========================================================= */

function getMonthStart() {

  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  )
    .toISOString()
    .split("T")[0];

}


function getNextMonthStart() {

  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1
  )
    .toISOString()
    .split("T")[0];

}


/* =========================================================
   GROUP HEADER
========================================================= */

function renderGroup() {

  const groupName =
    currentGroup?.name ||
    "CHAMA";

  document
    .querySelectorAll("[data-group-name]")
    .forEach(element => {

      element.textContent = groupName;

    });


  document
    .querySelectorAll("[data-user-name]")
    .forEach(element => {

      element.textContent =
        currentMember?.name ||
        "Member";

    });

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  const { data, error } =
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
        status,
        join_date
      `)
      .eq("group_id", currentGroupId)
      .order("name", {
        ascending: true
      });


  if (error) {
    throw error;
  }


  const members = data || [];


  const activeMembers =
    members.filter(member =>
      String(member.status || "")
        .toLowerCase() === "active"
    );


  setText(
    "activeMembers",
    activeMembers.length
  );


  setText(
    "membersCount",
    members.length
  );


  return members;

}


/* =========================================================
   LOAD CURRENT MONTH CONTRIBUTIONS
========================================================= */

async function loadContributions() {

  const monthStart =
    getMonthStart();

  const nextMonthStart =
    getNextMonthStart();


  const { data, error } =
    await supabase
      .from("contributions")
      .select(`
        id,
        group_id,
        member_id,
        amount,
        contribution_date,
        contribution_type,
        payment_method,
        mpesa_reference,
        created_at
      `)
      .eq("group_id", currentGroupId)
      .gte(
        "contribution_date",
        monthStart
      )
      .lt(
        "contribution_date",
        nextMonthStart
      )
      .order(
        "contribution_date",
        {
          ascending: false
        }
      );


  if (error) {

    /*
     * Compatibility fallback for databases
     * where mpesa_reference is unavailable.
     */

    if (
      String(error.message || "")
        .toLowerCase()
        .includes("mpesa_reference")
    ) {

      const retry =
        await supabase
          .from("contributions")
          .select(`
            id,
            group_id,
            member_id,
            amount,
            contribution_date,
            contribution_type,
            payment_method,
            created_at
          `)
          .eq(
            "group_id",
            currentGroupId
          )
          .gte(
            "contribution_date",
            monthStart
          )
          .lt(
            "contribution_date",
            nextMonthStart
          )
          .order(
            "contribution_date",
            {
              ascending: false
            }
          );


      if (retry.error) {
        throw retry.error;
      }


      return retry.data || [];

    }


    throw error;

  }


  return data || [];

}


/* =========================================================
   MONTHLY EXPECTED
========================================================= */

function getMonthlyExpected() {

  const amount =
    Number(
      currentGroup?.monthly_contribution
    );


  if (
    Number.isFinite(amount) &&
    amount > 0
  ) {
    return amount;
  }


  return 0;

}


/* =========================================================
   CONTRIBUTION SUMMARY
========================================================= */

function renderContributionSummary(
  members,
  contributions
) {

  const expectedPerMember =
    getMonthlyExpected();


  const activeMembers =
    members.filter(member =>
      String(member.status || "")
        .toLowerCase() === "active"
    );


  const expected =
    expectedPerMember *
    activeMembers.length;


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


  const percentage =
    expected > 0
      ? Math.min(
          100,
          Math.round(
            (collected / expected) * 100
          )
        )
      : 0;


  /* =======================================================
     METRICS
  ======================================================= */

  setText(
    "monthlyExpected",
    money(expected)
  );


  setText(
    "monthlyCollected",
    money(collected)
  );


  setText(
    "monthlyOutstanding",
    money(outstanding)
  );


  /* =======================================================
     PROGRESS
  ======================================================= */

  setText(
    "progressPercentage",
    `${percentage}%`
  );


  setText(
    "progressText",
    `${money(collected)} / ${money(expected)}`
  );


  setText(
    "progressMonth",
    new Date().toLocaleDateString(
      "en-KE",
      {
        month: "long",
        year: "numeric"
      }
    )
  );


  const progressBar =
    byId("progressBar");


  if (progressBar) {

    progressBar.style.width =
      `${percentage}%`;

  }


  return {
    expected,
    collected,
    outstanding,
    percentage
  };

}


/* =========================================================
   CURRENT BALANCE
========================================================= */

async function loadBalance() {

  /*
   * TOTAL CONTRIBUTIONS
   */

  const contributionResult =
    await supabase
      .from("contributions")
      .select("amount")
      .eq(
        "group_id",
        currentGroupId
      );


  if (contributionResult.error) {
    throw contributionResult.error;
  }


  const totalContributions =
    (contributionResult.data || [])
      .reduce(
        (total, row) =>
          total +
          Number(row.amount || 0),
        0
      );


  /*
   * EXPENSES
   *
   * Actual database column is `date`
   * and approval column is `approval_status`.
   */

  const expenseResult =
    await supabase
      .from("expenses")
      .select(`
        amount,
        approval_status
      `)
      .eq(
        "group_id",
        currentGroupId
      );


  if (expenseResult.error) {

    console.warn(
      "CHAMA LIVE: expense balance query failed",
      expenseResult.error
    );


    setText(
      "currentBalance",
      money(totalContributions)
    );


    return totalContributions;

  }


  const approvedExpenses =
    (expenseResult.data || [])
      .filter(expense => {

        const status =
          String(
            expense.approval_status ||
            "pending"
          ).toLowerCase();


        return (
          status === "approved"
        );

      })
      .reduce(
        (total, expense) =>
          total +
          Number(
            expense.amount || 0
          ),
        0
      );


  const balance =
    totalContributions -
    approvedExpenses;


  setText(
    "currentBalance",
    money(balance)
  );


  return balance;

}


/* =========================================================
   MEMBER CONTRIBUTION STATUS
========================================================= */

async function renderMemberPaymentStatus(
  members,
  contributions
) {

  const rows =
    byId("memberStatusRows");


  if (!rows) {
    return;
  }


  const activeMembers =
    members.filter(member =>
      String(member.status || "")
        .toLowerCase() === "active"
    );


  const expected =
    getMonthlyExpected();


  if (
    activeMembers.length === 0
  ) {

    rows.innerHTML = `
      <tr>
        <td colspan="5">
          No active members found.
        </td>
      </tr>
    `;

    return;

  }


  const paidByMember = {};


  contributions.forEach(
    contribution => {

      const memberId =
        contribution.member_id;


      if (!memberId) {
        return;
      }


      paidByMember[memberId] =
        (paidByMember[memberId] || 0) +
        Number(
          contribution.amount || 0
        );

    }
  );


  rows.innerHTML =
    activeMembers
      .map(member => {

        const paid =
          Number(
            paidByMember[member.id] || 0
          );


        const outstanding =
          Math.max(
            expected - paid,
            0
          );


        let status =
          "Pending";


        if (expected <= 0) {

          status =
            paid > 0
              ? "Paid"
              : "No amount set";

        }
        else if (paid >= expected) {

          status = "Cleared";

        }
        else if (paid > 0) {

          status = "Partial";

        }


        return `
          <tr>

            <td>
              ${escapeHtml(
                member.name || "Member"
              )}
            </td>

            <td>
              ${money(expected)}
            </td>

            <td>
              ${money(paid)}
            </td>

            <td>
              ${money(outstanding)}
            </td>

            <td>
              ${escapeHtml(status)}
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   RECENT CONTRIBUTIONS
========================================================= */

async function renderRecentContributions() {

  const rows =
    byId("recentContributionRows");


  if (!rows) {
    return;
  }


  const { data, error } =
    await supabase
      .from("contributions")
      .select(`
        amount,
        contribution_date,
        member_id
      `)
      .eq(
        "group_id",
        currentGroupId
      )
      .order(
        "contribution_date",
        {
          ascending: false
        }
      )
      .limit(5);


  if (error) {
    throw error;
  }


  const contributions =
    data || [];


  if (
    contributions.length === 0
  ) {

    rows.innerHTML = `
      <tr>
        <td colspan="3">
          No contributions recorded yet.
        </td>
      </tr>
    `;

    return;

  }


  const memberIds =
    [
      ...new Set(
        contributions
          .map(row => row.member_id)
          .filter(Boolean)
      )
    ];


  let membersById = {};


  if (memberIds.length > 0) {

    const memberResult =
      await supabase
        .from("members")
        .select("id,name")
        .in(
          "id",
          memberIds
        );


    if (!memberResult.error) {

      (memberResult.data || [])
        .forEach(member => {

          membersById[member.id] =
            member.name;

        });

    }

  }


  rows.innerHTML =
    contributions
      .map(contribution => {

        const memberName =
          membersById[
            contribution.member_id
          ] ||
          "Member";


        return `
          <tr>

            <td>
              ${escapeHtml(memberName)}
            </td>

            <td>
              ${money(
                contribution.amount
              )}
            </td>

            <td>
              ${formatDate(
                contribution.contribution_date
              )}
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   RECENT EXPENSES
========================================================= */

async function renderRecentExpenses() {

  const rows =
    byId("recentExpenseRows");


  if (!rows) {
    return;
  }


  /*
   * IMPORTANT:
   *
   * Database uses:
   * date
   * approval_status
   */

  const { data, error } =
    await supabase
      .from("expenses")
      .select(`
        description,
        amount,
        approval_status,
        date
      `)
      .eq(
        "group_id",
        currentGroupId
      )
      .order(
        "date",
        {
          ascending: false
        }
      )
      .limit(5);


  if (error) {
    throw error;
  }


  const expenses =
    data || [];


  if (expenses.length === 0) {

    rows.innerHTML = `
      <tr>
        <td colspan="3">
          No expenses recorded yet.
        </td>
      </tr>
    `;

    return;

  }


  rows.innerHTML =
    expenses
      .map(expense => {

        return `
          <tr>

            <td>
              ${escapeHtml(
                expense.description ||
                "Expense"
              )}
            </td>

            <td>
              ${money(
                expense.amount
              )}
            </td>

            <td>
              ${escapeHtml(
                expense.approval_status ||
                "Pending"
              )}
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   UPCOMING MEETINGS
========================================================= */

async function renderUpcomingMeetings() {

  const rows =
    byId("upcomingMeetingRows");


  if (!rows) {
    return;
  }


  const today =
    new Date()
      .toISOString()
      .split("T")[0];


  /*
   * IMPORTANT:
   *
   * Database uses `date`
   * not `meeting_date`.
   */

  const { data, error } =
    await supabase
      .from("meetings")
      .select(`
        id,
        date,
        title,
        venue,
        status
      `)
      .eq(
        "group_id",
        currentGroupId
      )
      .gte(
        "date",
        today
      )
      .order(
        "date",
        {
          ascending: true
        }
      )
      .limit(5);


  if (error) {
    throw error;
  }


  const meetings =
    data || [];


  if (meetings.length === 0) {

    rows.innerHTML = `
      <tr>
        <td colspan="4">
          No upcoming meetings.
        </td>
      </tr>
    `;

    return;

  }


  rows.innerHTML =
    meetings
      .map(meeting => {

        return `
          <tr>

            <td>
              ${formatDate(
                meeting.date
              )}
            </td>

            <td>
              ${escapeHtml(
                meeting.title ||
                "Meeting"
              )}
            </td>

            <td>
              ${escapeHtml(
                meeting.venue ||
                "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                meeting.status ||
                "Upcoming"
              )}
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   MAIN DASHBOARD
========================================================= */

async function loadDashboard() {

  console.log(
    "CHAMA LIVE: loading dashboard data..."
  );


  /*
   * MEMBER
   */

  currentMember =
    await getCurrentMember();


  if (!currentMember) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  currentGroupId =
    currentMember.group_id;


  if (!currentGroupId) {

    throw new Error(
      "Your member record has no group."
    );

  }


  /*
   * GROUP
   */

  currentGroup =
    await getCurrentGroup();


  if (!currentGroup) {

    throw new Error(
      "Group information could not be found."
    );

  }


  renderGroup();


  /*
   * MEMBERS
   */

  const members =
    await loadMembers();


  /*
   * CONTRIBUTIONS
   */

  const contributions =
    await loadContributions();


  /*
   * SUMMARY
   */

  renderContributionSummary(
    members,
    contributions
  );


  /*
   * MEMBER PAYMENT STATUS
   */

  await renderMemberPaymentStatus(
    members,
    contributions
  );


  /*
   * RECENT CONTRIBUTIONS
   */

  await renderRecentContributions();


  /*
   * RECENT EXPENSES
   */

  await renderRecentExpenses();


  /*
   * MEETINGS
   */

  await renderUpcomingMeetings();


  /*
   * BALANCE
   */

  await loadBalance();


  console.log(
    "CHAMA LIVE: dashboard data loaded successfully"
  );

}


/* =========================================================
   PUBLIC INITIALIZER
========================================================= */

export async function initDashboard() {

  if (initialized) {

    console.warn(
      "CHAMA LIVE: dashboard already initialized"
    );

    return;

  }


  initialized = true;


  const status =
    byId("status");


  if (status) {

    status.textContent =
      "Loading dashboard...";

  }


  try {

    await loadDashboard();


    if (status) {

      status.textContent =
        "Dashboard loaded.";

    }


    console.log(
      "CHAMA LIVE: dashboard initialized"
    );

  }
  catch (error) {

    initialized = false;


    if (status) {

      status.textContent =
        "Unable to load dashboard.";

    }


    showError(error);

  }

}


/* =========================================================
   COMPATIBILITY
========================================================= */

export const initPage =
  initDashboard;


console.log(
  "CHAMA LIVE: dashboard.js ready"
);
