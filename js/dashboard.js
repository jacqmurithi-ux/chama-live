/* =========================================================
   CHAMA LIVE — DASHBOARD
   Clean Final Version
   Compatible with:
   - layout.js dynamic page loading
   - current auth.js
   - dashboard.html
========================================================= */

import { supabase } from "./supabase.js";

import {
  getMyMember,
  getMyGroup
} from "./auth.js";


console.log(
  "CHAMA LIVE: dashboard.js loaded"
);


/* =========================================================
   STATE
========================================================= */

let dashboardInitialized = false;


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


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

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


function setText(id, value) {

  const element =
    byId(id);


  if (element) {

    element.textContent =
      value;

  }

}


/* =========================================================
   MONTH HELPERS
========================================================= */

function getCurrentMonth() {

  const now =
    new Date();


  return (
    `${now.getFullYear()}-` +
    `${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`
  );

}


function getContributionMonth(
  contribution
) {

  if (
    contribution?.month
  ) {

    return String(
      contribution.month
    ).slice(0, 7);

  }


  if (
    contribution?.contribution_date
  ) {

    return String(
      contribution.contribution_date
    ).slice(0, 7);

  }


  if (
    contribution?.created_at
  ) {

    const date =
      new Date(
        contribution.created_at
      );


    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {

      return (
        `${date.getFullYear()}-` +
        `${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`
      );

    }

  }


  return null;

}


/* =========================================================
   STATUS
========================================================= */

function showStatus(message) {

  const status =
    byId("status");


  if (!status) {
    return;
  }


  status.style.display =
    "";


  status.textContent =
    message;

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


  if (!errorBox) {
    return;
  }


  errorBox.hidden =
    false;


  errorBox.textContent =
    error?.message ||
    String(error) ||
    "Unable to load dashboard.";

}


/* =========================================================
   GET MEMBERS
========================================================= */

async function getMembers(
  groupId
) {

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(`
        id,
        group_id,
        user_id,
        member_number,
        name,
        phone,
        email,
        role,
        join_date,
        status,
        onboarding_status,
        created_at
      `)
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
   GET CONTRIBUTIONS
========================================================= */

async function getContributions(
  groupId
) {

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


  return data || [];

}


/* =========================================================
   GET EXPENSES
========================================================= */

async function getExpenses(
  groupId
) {

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
   GET MEETINGS
========================================================= */

async function getMeetings(
  groupId
) {

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
        "date",
        {
          ascending: true
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


  return data || [];

}


/* =========================================================
   FINANCIAL MEMBERS
========================================================= */

function getFinancialMembers(
  members
) {

  return (
    members || []
  ).filter(
    member => {

      const status =
        String(
          member.status ||
          "active"
        ).toLowerCase();


      const onboarding =
        String(
          member.onboarding_status ||
          "active"
        ).toLowerCase();


      return (
        status === "active" &&
        onboarding === "active"
      );

    }
  );

}


/* =========================================================
   CONTRIBUTION TYPE
========================================================= */

function isMonthlyContribution(
  contribution
) {

  return (
    String(
      contribution?.contribution_type ||
      ""
    ).toLowerCase() ===
    "monthly"
  );

}


/* =========================================================
   EXPENSE STATUS
========================================================= */

function isApprovedExpense(
  expense
) {

  const status =
    String(
      expense?.approval_status ||
      expense?.status ||
      ""
    ).toLowerCase();


  return (
    status === "approved" ||
    status === "paid" ||
    status === "completed"
  );

}


/* =========================================================
   DASHBOARD SUMMARY
========================================================= */

function renderSummary(
  members,
  contributions,
  expenses,
  group
) {

  const financialMembers =
    getFinancialMembers(
      members
    );


  const totalMembers =
    members.length;


  const activeMemberCount =
    financialMembers.length;


  /* -------------------------------------------------------
     TOTAL CONTRIBUTIONS
  ------------------------------------------------------- */

  const totalCollected =
    contributions.reduce(
      (
        total,
        contribution
      ) => {

        return (
          total +
          Number(
            contribution.amount || 0
          )
        );

      },
      0
    );


  /* -------------------------------------------------------
     APPROVED EXPENSES
  ------------------------------------------------------- */

  const approvedExpenses =
    expenses
      .filter(
        isApprovedExpense
      )
      .reduce(
        (
          total,
          expense
        ) => {

          return (
            total +
            Number(
              expense.amount || 0
            )
          );

        },
        0
      );


  /* -------------------------------------------------------
     OPENING BALANCE
  ------------------------------------------------------- */

  const openingBalance =
    Number(
      group?.opening_balance || 0
    );


  /* -------------------------------------------------------
     CURRENT BALANCE
  ------------------------------------------------------- */

  const currentBalance =
    openingBalance +
    totalCollected -
    approvedExpenses;


  /* -------------------------------------------------------
     MONTHLY CONTRIBUTION
  ------------------------------------------------------- */

  const monthlyContribution =
    Number(
      group?.monthly_contribution || 0
    );


  /* -------------------------------------------------------
     MONTHLY EXPECTED
  ------------------------------------------------------- */

  const monthlyExpected =
    activeMemberCount *
    monthlyContribution;


  /* -------------------------------------------------------
     CURRENT MONTH
  ------------------------------------------------------- */

  const currentMonth =
    getCurrentMonth();


  /* -------------------------------------------------------
     MONTHLY COLLECTED
  ------------------------------------------------------- */

  const monthlyCollected =
    contributions
      .filter(
        contribution => {

          if (
            !isMonthlyContribution(
              contribution
            )
          ) {

            return false;

          }


          return (
            getContributionMonth(
              contribution
            ) === currentMonth
          );

        }
      )
      .reduce(
        (
          total,
          contribution
        ) => {

          return (
            total +
            Number(
              contribution.amount || 0
            )
          );

        },
        0
      );


  /* -------------------------------------------------------
     OUTSTANDING
  ------------------------------------------------------- */

  const monthlyOutstanding =
    Math.max(
      0,
      monthlyExpected -
      monthlyCollected
    );


  /* -------------------------------------------------------
     COLLECTION RATE
  ------------------------------------------------------- */

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
     UPDATE UI
  ------------------------------------------------------- */

  setText(
    "membersCount",
    totalMembers
  );


  setText(
    "activeMembers",
    activeMemberCount
  );


  setText(
    "monthlyExpected",
    `KSh ${money(
      monthlyExpected
    )}`
  );


  setText(
    "monthlyCollected",
    `KSh ${money(
      monthlyCollected
    )}`
  );


  setText(
    "monthlyOutstanding",
    `KSh ${money(
      monthlyOutstanding
    )}`
  );


  setText(
    "collectionRate",
    `${collectionRate.toFixed(0)}%`
  );


  setText(
    "currentBalance",
    `KSh ${money(
      currentBalance
    )}`
  );


  setText(
    "progressText",
    `KSh ${money(
      monthlyCollected
    )} / KSh ${money(
      monthlyExpected
    )}`
  );


  setText(
    "progressPercentage",
    `${collectionRate.toFixed(0)}%`
  );


  /* -------------------------------------------------------
     PROGRESS BAR
  ------------------------------------------------------- */

  const progressBar =
    byId("progressBar");


  if (progressBar) {

    progressBar.style.width =
      `${collectionRate}%`;

    progressBar.setAttribute(
      "aria-valuenow",
      String(
        Math.round(
          collectionRate
        )
      )
    );

  }


  /* -------------------------------------------------------
     MONTH LABEL
  ------------------------------------------------------- */

  const progressMonth =
    byId("progressMonth");


  if (progressMonth) {

    progressMonth.textContent =
      new Date()
        .toLocaleDateString(
          "en-KE",
          {
            month: "long",
            year: "numeric"
          }
        );

  }

}


/* =========================================================
   MEMBER CONTRIBUTION STATUS
========================================================= */

function renderMemberStatus(
  members,
  contributions,
  group
) {

  const rows =
    byId("memberStatusRows");


  if (!rows) {
    return;
  }


  const financialMembers =
    getFinancialMembers(
      members
    );


  const monthlyAmount =
    Number(
      group?.monthly_contribution || 0
    );


  const currentMonth =
    getCurrentMonth();


  /* -------------------------------------------------------
     NO MEMBERS
  ------------------------------------------------------- */

  if (
    financialMembers.length === 0
  ) {

    rows.innerHTML = `
      <tr>
        <td colspan="5">
          No active members.
        </td>
      </tr>
    `;

    return;

  }


  /* -------------------------------------------------------
     BUILD ROWS
  ------------------------------------------------------- */

  rows.innerHTML =
    financialMembers
      .map(member => {

        const paid =
          contributions
            .filter(
              contribution => {

                if (
                  String(
                    contribution.member_id
                  ) !==
                  String(member.id)
                ) {

                  return false;

                }


                if (
                  !isMonthlyContribution(
                    contribution
                  )
                ) {

                  return false;

                }


                return (
                  getContributionMonth(
                    contribution
                  ) === currentMonth
                );

              }
            )
            .reduce(
              (
                total,
                contribution
              ) => {

                return (
                  total +
                  Number(
                    contribution.amount || 0
                  )
                );

              },
              0
            );


        /* -------------------------------------------------
           OUTSTANDING
        ------------------------------------------------- */

        const outstanding =
          Math.max(
            0,
            monthlyAmount -
            paid
          );


        /* -------------------------------------------------
           STATUS
        ------------------------------------------------- */

        let status =
          "Outstanding";


        if (
          monthlyAmount <= 0
        ) {

          status =
            "Not Set";

        }
        else if (
          paid >= monthlyAmount
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


        /* -------------------------------------------------
           ROW
        ------------------------------------------------- */

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
              <strong>
                ${escapeHtml(
                  status
                )}
              </strong>
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   MEMBER LOOKUP
========================================================= */

function getMemberName(
  memberId,
  members
) {

  if (!memberId) {
    return "Member";
  }


  const member =
    members.find(
      item =>
        String(item.id) ===
        String(memberId)
    );


  return (
    member?.name ||
    "Member"
  );

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


  const recent =
    contributions
      .slice(0, 5);


  if (
    recent.length === 0
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


  rows.innerHTML =
    recent
      .map(
        contribution => {

          const memberName =
            contribution.member_name ||
            contribution.member?.name ||
            getMemberName(
              contribution.member_id,
              members
            );


          return `
            <tr>

              <td>
                ${escapeHtml(
                  memberName
                )}
              </td>

              <td>
                KSh ${money(
                  contribution.amount
                )}
              </td>

              <td>
                ${escapeHtml(
                  formatDate(
                    contribution.contribution_date ||
                    contribution.created_at
                  )
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


  const recent =
    expenses
      .slice(0, 5);


  if (
    recent.length === 0
  ) {

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
    recent
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
            "Pending";


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


  const today =
    new Date();


  today.setHours(
    0,
    0,
    0,
    0
  );


  const upcoming =
    meetings
      .filter(
        meeting => {

          if (
            !meeting.date
          ) {

            return false;

          }


          const meetingDate =
            new Date(
              meeting.date
            );


          if (
            Number.isNaN(
              meetingDate.getTime()
            )
          ) {

            return false;

          }


          meetingDate.setHours(
            0,
            0,
            0,
            0
          );


          return (
            meetingDate >= today
          );

        }
      )
      .sort(
        (
          a,
          b
        ) => {

          return (
            new Date(a.date) -
            new Date(b.date)
          );

        }
      )
      .slice(0, 5);


  if (
    upcoming.length === 0
  ) {

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
    upcoming
      .map(
        meeting => {

          const meetingName =
            meeting.title ||
            meeting.name ||
            meeting.subject ||
            meeting.meeting_title ||
            "Group Meeting";


          const venue =
            meeting.venue ||
            meeting.location ||
            meeting.place ||
            "—";


          const status =
            meeting.status ||
            "Scheduled";


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
                ${escapeHtml(
                  meetingName
                )}
              </td>

              <td>
                ${escapeHtml(
                  venue
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
   LOAD DASHBOARD DATA
========================================================= */

async function loadDashboardData() {

  showStatus(
    "Loading dashboard..."
  );


  const member =
    await getMyMember();


  if (!member) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  const group =
    await getMyGroup();


  if (!group) {

    throw new Error(
      "Group information could not be found."
    );

  }


  const groupId =
    group.id ||
    member.group_id;


  if (!groupId) {

    throw new Error(
      "Your member record has no group."
    );

  }


  /* -------------------------------------------------------
     LOAD DATA
  ------------------------------------------------------- */

  const [
    members,
    contributions,
    expenses,
    meetings
  ] =
    await Promise.all([
      getMembers(groupId),
      getContributions(groupId),
      getExpenses(groupId),
      getMeetings(groupId)
    ]);


  /* -------------------------------------------------------
     RENDER
  ------------------------------------------------------- */

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
    "CHAMA LIVE: dashboard data rendered",
    {
      member,
      group,
      members: members.length,
      contributions: contributions.length,
      expenses: expenses.length,
      meetings: meetings.length
    }
  );


  return {
    member,
    group,
    members,
    contributions,
    expenses,
    meetings
  };

}


/* =========================================================
   PAGE INITIALIZER
   layout.js dynamically imports this file and calls
   initPage().
========================================================= */

export async function initPage() {

  /*
   * Prevent accidental double initialization.
   *
   * This protects against another script importing and
   * initializing the dashboard more than once.
   */

  if (dashboardInitialized) {

    console.log(
      "CHAMA LIVE: dashboard already initialized"
    );

    return;

  }


  dashboardInitialized =
    true;


  try {

    await loadDashboardData();

  } catch (error) {

    /*
     * Allow another intentional retry if initialization
     * failed.
     */

    dashboardInitialized =
      false;


    showError(
      error
    );

    showStatus(
      "Unable to load dashboard."
    );


    throw error;

  }

}


/* =========================================================
   OPTIONAL COMPATIBILITY ALIAS
   layout.js currently prefers initPage(), but keeping
   initDashboard() makes this file compatible with the
   fallback initializer as well.
========================================================= */

export async function initDashboard() {

  return initPage();

}


console.log(
  "CHAMA LIVE: dashboard module ready"
);
