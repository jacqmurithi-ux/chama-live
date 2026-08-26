import { supabase } from "./supabase.js";


/* =========================================================
   CHAMA LIVE — DASHBOARD
========================================================= */

console.log("CHAMA LIVE: dashboard.js loaded");


/* =========================================================
   HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
}


function money(value) {

  return Number(value || 0).toLocaleString(
    "en-KE",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }
  );

}


function formatDate(value) {

  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
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


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =========================================================
   ERROR / STATUS
========================================================= */

function showStatus(message) {

  const status =
    byId("status");

  if (status) {

    status.textContent =
      message;

  }

}


function hideStatus() {

  const status =
    byId("status");

  if (status) {

    status.style.display =
      "none";

  }

}


function showError(error) {

  console.error(
    "CHAMA LIVE DASHBOARD ERROR:",
    error
  );


  const errorBox =
    byId("error");


  if (errorBox) {

    errorBox.hidden =
      false;

    errorBox.textContent =
      error?.message ||
      String(error) ||
      "Unable to load dashboard.";

  }

}


/* =========================================================
   CURRENT USER
========================================================= */

async function getUser() {

  const {
    data,
    error
  } =
    await supabase.auth.getUser();


  if (error) {
    throw error;
  }


  if (!data?.user) {

    throw new Error(
      "You are not logged in."
    );

  }


  return data.user;

}


/* =========================================================
   CURRENT MEMBER
========================================================= */

async function getMember(userId) {

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select("*")
      .eq(
        "user_id",
        userId
      )
      .limit(1);


  if (error) {
    throw error;
  }


  if (
    !data ||
    data.length === 0
  ) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  return data[0];

}


/* =========================================================
   CURRENT GROUP
========================================================= */

async function getGroup(groupId) {

  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select("*")
      .eq(
        "id",
        groupId
      )
      .limit(1);


  if (error) {
    throw error;
  }


  if (
    !data ||
    data.length === 0
  ) {

    throw new Error(
      "The member is not linked to a valid group."
    );

  }


  return data[0];

}


/* =========================================================
   MEMBERS
========================================================= */

async function getMembers(groupId) {

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select("*")
      .eq(
        "group_id",
        groupId
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


  return data || [];

}


/* =========================================================
   CONTRIBUTIONS
========================================================= */

async function getContributions(groupId) {

  const {
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select("*")
      .eq(
        "group_id",
        groupId
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


  return data || [];

}


/* =========================================================
   EXPENSES
========================================================= */

async function getExpenses(groupId) {

  /*
   * We deliberately use select("*")
   * because your database previously reported:
   *
   * column expenses.expense_date does not exist
   */

  const {
    data,
    error
  } =
    await supabase
      .from("expenses")
      .select("*")
      .eq(
        "group_id",
        groupId
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


  return data || [];

}


/* =========================================================
   MEETINGS
========================================================= */

async function getMeetings(groupId) {

  const {
    data,
    error
  } =
    await supabase
      .from("meetings")
      .select("*")
      .eq(
        "group_id",
        groupId
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


  return data || [];

}


/* =========================================================
   SUMMARY
========================================================= */

function renderSummary(
  members,
  contributions,
  expenses,
  group
) {

  const activeMembers =
    members.filter(
      member =>
        String(
          member.status ||
          "active"
        ).toLowerCase() ===
        "active"
    ).length;


  const totalMembers =
    members.length;


  const totalCollected =
    contributions.reduce(
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


  const approvedExpenses =
    expenses
      .filter(
        expense => {

          const status =
            String(
              expense.approval_status ||
              expense.status ||
              ""
            ).toLowerCase();


          return (
            status === "approved" ||
            status === "paid" ||
            status === "completed"
          );

        }
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


  const openingBalance =
    Number(
      group?.opening_balance || 0
    );


  const currentBalance =
    openingBalance +
    totalCollected -
    approvedExpenses;


  const monthlyContribution =
    Number(
      group?.monthly_contribution || 0
    );


  const monthlyExpected =
    activeMembers *
    monthlyContribution;


  /*
   * For the dashboard summary,
   * calculate current-month contributions.
   */

  const now =
    new Date();


  const currentYear =
    now.getFullYear();


  const currentMonth =
    now.getMonth();


  const monthlyCollected =
    contributions
      .filter(
        contribution => {

          const dateValue =
            contribution.contribution_date ||
            contribution.date ||
            contribution.created_at;


          if (!dateValue) {
            return false;
          }


          const date =
            new Date(dateValue);


          return (
            date.getFullYear() ===
              currentYear &&
            date.getMonth() ===
              currentMonth
          );

        }
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


  const monthlyOutstanding =
    Math.max(
      0,
      monthlyExpected -
      monthlyCollected
    );


  const collectionRate =
    monthlyExpected > 0
      ? Math.min(
          100,
          (
            monthlyCollected /
            monthlyExpected
          ) * 100
        )
      : 0;


  /* -------------------------------------------------------
     MEMBERS
  ------------------------------------------------------- */

  setText(
    "membersCount",
    totalMembers
  );


  setText(
    "activeMembers",
    activeMembers
  );


  /* -------------------------------------------------------
     MONTHLY
  ------------------------------------------------------- */

  setText(
    "monthlyExpected",
    `KSh ${money(monthlyExpected)}`
  );


  setText(
    "monthlyCollected",
    `KSh ${money(monthlyCollected)}`
  );


  setText(
    "monthlyOutstanding",
    `KSh ${money(monthlyOutstanding)}`
  );


  setText(
    "collectionRate",
    `${collectionRate.toFixed(0)}%`
  );


  /* -------------------------------------------------------
     BALANCE
  ------------------------------------------------------- */

  setText(
    "currentBalance",
    `KSh ${money(currentBalance)}`
  );


  /* -------------------------------------------------------
     PROGRESS
  ------------------------------------------------------- */

  setText(
    "progressText",
    `KSh ${money(monthlyCollected)} / KSh ${money(monthlyExpected)}`
  );


  setText(
    "progressPercentage",
    `${collectionRate.toFixed(0)}%`
  );


  const progressBar =
    byId("progressBar");


  if (progressBar) {

    progressBar.style.width =
      `${collectionRate}%`;

  }


  const progressMonth =
    byId("progressMonth");


  if (progressMonth) {

    progressMonth.textContent =
      now.toLocaleDateString(
        "en-KE",
        {
          month: "long",
          year: "numeric"
        }
      );

  }

}


/* =========================================================
   SET TEXT
========================================================= */

function setText(
  id,
  value
) {

  const element =
    byId(id);


  if (element) {

    element.textContent =
      value;

  }

}


/* =========================================================
   MEMBER STATUS
========================================================= */

function renderMemberStatus(
  members,
  contributions,
  group
) {

  const rows =
    byId(
      "memberStatusRows"
    );


  if (!rows) {
    return;
  }


  const monthlyAmount =
    Number(
      group?.monthly_contribution || 0
    );


  const now =
    new Date();


  const currentYear =
    now.getFullYear();


  const currentMonth =
    now.getMonth();


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

    rows.innerHTML = `
      <tr>
        <td colspan="5">
          No active members.
        </td>
      </tr>
    `;

    return;

  }


  rows.innerHTML =
    activeMembers
      .map(
        member => {

          const paid =
            contributions
              .filter(
                contribution => {

                  if (
                    contribution.member_id !==
                    member.id
                  ) {
                    return false;
                  }


                  const dateValue =
                    contribution.contribution_date ||
                    contribution.date ||
                    contribution.created_at;


                  if (!dateValue) {
                    return false;
                  }


                  const date =
                    new Date(dateValue);


                  return (
                    date.getFullYear() ===
                      currentYear &&
                    date.getMonth() ===
                      currentMonth
                  );

                }
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


          const outstanding =
            Math.max(
              0,
              monthlyAmount -
              paid
            );


          let status =
            "Outstanding";


          if (
            monthlyAmount > 0 &&
            paid >= monthlyAmount
          ) {

            status =
              "Paid";

          } else if (
            paid > 0
          ) {

            status =
              "Partial";

          }


          return `
            <tr>

              <td>
                ${escapeHtml(
                  member.name ||
                  "Member"
                )}
              </td>

              <td>
                KSh ${money(
                  monthlyAmount
                )}
              </td>

              <td>
                KSh ${money(
                  paid
                )}
              </td>

              <td>
                KSh ${money(
                  outstanding
                )}
              </td>

              <td>
                ${status}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   RECENT CONTRIBUTIONS
========================================================= */

function renderRecentContributions(
  contributions,
  members
) {

  const rows =
    byId(
      "recentContributionRows"
    );


  if (!rows) {
    return;
  }


  if (!contributions.length) {

    rows.innerHTML = `
      <tr>
        <td colspan="3">
          No contributions yet.
        </td>
      </tr>
    `;

    return;

  }


  const memberMap =
    {};


  members.forEach(
    member => {

      memberMap[
        member.id
      ] =
        member.name ||
        "Member";

    }
  );


  rows.innerHTML =
    contributions
      .slice(0, 5)
      .map(
        contribution => {

          const name =
            memberMap[
              contribution.member_id
            ] ||
            "Member";


          const date =
            contribution.contribution_date ||
            contribution.date ||
            contribution.created_at;


          return `
            <tr>

              <td>
                ${escapeHtml(
                  name
                )}
              </td>

              <td>
                KSh ${money(
                  contribution.amount
                )}
              </td>

              <td>
                ${formatDate(
                  date
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   RECENT EXPENSES
========================================================= */

function renderRecentExpenses(
  expenses
) {

  const rows =
    byId(
      "recentExpenseRows"
    );


  if (!rows) {
    return;
  }


  if (!expenses.length) {

    rows.innerHTML = `
      <tr>
        <td colspan="3">
          No expenses yet.
        </td>
      </tr>
    `;

    return;

  }


  rows.innerHTML =
    expenses
      .slice(0, 5)
      .map(
        expense => {

          const description =
            expense.description ||
            expense.title ||
            expense.name ||
            "Expense";


          const status =
            expense.approval_status ||
            expense.status ||
            "Recorded";


          return `
            <tr>

              <td>
                ${escapeHtml(
                  description
                )}
              </td>

              <td>
                KSh ${money(
                  expense.amount
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
   UPCOMING MEETINGS
========================================================= */

function renderUpcomingMeetings(
  meetings
) {

  const rows =
    byId(
      "upcomingMeetingRows"
    );


  if (!rows) {
    return;
  }


  if (!meetings.length) {

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
      .slice(0, 5)
      .map(
        meeting => {

          const date =
            meeting.date ||
            meeting.meeting_date ||
            meeting.created_at;


          const title =
            meeting.title ||
            meeting.name ||
            meeting.description ||
            "Meeting";


          return `
            <tr>

              <td>
                ${formatDate(
                  date
                )}
              </td>

              <td>
                ${escapeHtml(
                  title
                )}
              </td>

              <td>
                ${escapeHtml(
                  meeting.venue ||
                  meeting.location ||
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

        }
      )
      .join("");

}


/* =========================================================
   LOAD DASHBOARD
========================================================= */

async function loadDashboard() {

  try {

    showStatus(
      "Loading dashboard..."
    );


    console.log(
      "CHAMA LIVE: Checking session..."
    );


    const user =
      await getUser();


    console.log(
      "CHAMA LIVE USER:",
      user.id
    );


    console.log(
      "CHAMA LIVE: Loading member..."
    );


    const member =
      await getMember(
        user.id
      );


    console.log(
      "CHAMA LIVE MEMBER:",
      member
    );


    if (!member.group_id) {

      throw new Error(
        "Your member account does not have a group assigned."
      );

    }


    console.log(
      "CHAMA LIVE: Loading group..."
    );


    const group =
      await getGroup(
        member.group_id
      );


    console.log(
      "CHAMA LIVE GROUP:",
      group
    );


    console.log(
      "CHAMA LIVE: Loading dashboard data..."
    );


    const [
      members,
      contributions,
      expenses,
      meetings
    ] =
      await Promise.all([

        getMembers(
          member.group_id
        ),

        getContributions(
          member.group_id
        ),

        getExpenses(
          member.group_id
        ),

        getMeetings(
          member.group_id
        )

      ]);


    console.log(
      "CHAMA LIVE DASHBOARD DATA:",
      {
        members,
        contributions,
        expenses,
        meetings
      }
    );


    renderSummary(
      members,
      contributions,
      expenses,
      group
    );


    renderMemberStatus(
      members,
      contributions,
      group
    );


    renderRecentContributions(
      contributions,
      members
    );


    renderRecentExpenses(
      expenses
    );


    renderUpcomingMeetings(
      meetings
    );


    hideStatus();


    console.log(
      "CHAMA LIVE: Dashboard ready."
    );


  } catch (error) {

    showError(
      error
    );

  }

}


/* =========================================================
   EXPORT
========================================================= */

export async function initDashboard() {

  await loadDashboard();

}


/* =========================================================
   START
========================================================= */

loadDashboard();
