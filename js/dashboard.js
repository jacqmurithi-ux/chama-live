import {
  supabase
} from "./supabase.js";


/* =========================================================
   CHAMA LIVE — DASHBOARD
========================================================= */


/* =========================================================
   HELPERS
========================================================= */

function byId(id) {
  return document.getElementById(id);
}


function money(value) {

  return Number(
    value || 0
  ).toLocaleString(
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

  return new Date(
    value
  ).toLocaleDateString(
    "en-KE",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
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
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


/* =========================================================
   GET MEMBER
========================================================= */

async function getMember() {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_my_member"
    );


  if (error) {
    throw error;
  }


  if (Array.isArray(data)) {
    return data[0] || null;
  }


  return data || null;
}


/* =========================================================
   GET GROUP
========================================================= */

async function getGroup() {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_my_group"
    );


  if (error) {
    throw error;
  }


  if (Array.isArray(data)) {
    return data[0] || null;
  }


  return data || null;
}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers(
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
      );


  if (error) {
    throw error;
  }


  return data || [];
}


/* =========================================================
   LOAD CONTRIBUTIONS
========================================================= */

async function loadContributions(
  groupId
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
        mpesa_reference,
        contribution_date,
        notes,
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
      );


  if (error) {
    throw error;
  }


  return data || [];
}


/* =========================================================
   LOAD EXPENSES
========================================================= */

async function loadExpenses(
  groupId
) {

  /*
   * IMPORTANT:
   * The real database column is:
   *
   * expenses.date
   *
   * NOT:
   *
   * expenses.expense_date
   */

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
      );


  if (error) {
    throw error;
  }


  return data || [];
}


/* =========================================================
   LOAD MEETINGS
========================================================= */

async function loadMeetings(
  groupId
) {

  const {
    data,
    error
  } =
    await supabase
      .from("meetings")
      .select(`
        id,
        group_id,
        title,
        date,
        venue,
        status
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


  return data || [];
}


/* =========================================================
   SUMMARY
========================================================= */

function displaySummary(
  members,
  contributions,
  expenses,
  group
) {

  const activeMembers =
    members.filter(
      member =>
        member.status === "active"
    ).length;


  const totalContributions =
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


  const openingBalance =
    Number(
      group?.opening_balance || 0
    );


  const balance =
    openingBalance +
    totalContributions -
    approvedExpenses;


  const monthlyContribution =
    Number(
      group?.monthly_contribution || 0
    );


  const monthlyExpected =
    activeMembers *
    monthlyContribution;


  const collectionRate =
    monthlyExpected > 0
      ? Math.min(
          100,
          (
            totalContributions /
            monthlyExpected
          ) * 100
        )
      : 0;


  /* -------------------------------------------------------
     ACTIVE MEMBERS
  ------------------------------------------------------- */

  const activeBox =
    byId("activeMembers");

  if (activeBox) {
    activeBox.textContent =
      activeMembers;
  }


  /* -------------------------------------------------------
     MONTHLY EXPECTED
  ------------------------------------------------------- */

  const expectedBox =
    byId("monthlyExpected");

  if (expectedBox) {

    expectedBox.textContent =
      `KSh ${money(
        monthlyExpected
      )}`;

  }


  /* -------------------------------------------------------
     MONTHLY COLLECTED
  ------------------------------------------------------- */

  const collectedBox =
    byId("monthlyCollected");

  if (collectedBox) {

    collectedBox.textContent =
      `KSh ${money(
        totalContributions
      )}`;

  }


  /* -------------------------------------------------------
     OUTSTANDING
  ------------------------------------------------------- */

  const outstandingBox =
    byId("outstanding");

  if (outstandingBox) {

    outstandingBox.textContent =
      `KSh ${money(
        Math.max(
          0,
          monthlyExpected -
          totalContributions
        )
      )}`;

  }


  /* -------------------------------------------------------
     COLLECTION RATE
  ------------------------------------------------------- */

  const rateBox =
    byId("collectionRate");

  if (rateBox) {

    rateBox.textContent =
      `${collectionRate.toFixed(0)}%`;

  }


  /* -------------------------------------------------------
     CURRENT BALANCE
  ------------------------------------------------------- */

  const balanceBox =
    byId("currentBalance");

  if (balanceBox) {

    balanceBox.textContent =
      `KSh ${money(
        balance
      )}`;

  }


  /* -------------------------------------------------------
     PROGRESS
  ------------------------------------------------------- */

  const progressAmount =
    byId("progressAmount");

  if (progressAmount) {

    progressAmount.textContent =
      `KSh ${money(
        totalContributions
      )} / KSh ${money(
        monthlyExpected
      )}`;

  }


  const progressPercent =
    byId("progressPercent");

  if (progressPercent) {

    progressPercent.textContent =
      `${collectionRate.toFixed(0)}%`;

  }

}


/* =========================================================
   RECENT CONTRIBUTIONS
========================================================= */

function displayRecentContributions(
  contributions,
  members
) {

  const body =
    document.querySelector(
      "#recentContributions tbody"
    );


  if (!body) {
    return;
  }


  if (!contributions.length) {

    body.innerHTML = `
      <tr>
        <td colspan="3">
          No contributions yet.
        </td>
      </tr>
    `;

    return;
  }


  const memberMap = {};


  members.forEach(
    member => {

      memberMap[
        member.id
      ] =
        member.name ||
        "Member";

    }
  );


  body.innerHTML =
    contributions
      .slice(0, 5)
      .map(
        contribution => {

          return `
            <tr>

              <td>
                ${escapeHtml(
                  memberMap[
                    contribution.member_id
                  ] ||
                  "Member"
                )}
              </td>

              <td>
                KSh ${money(
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

        }
      )
      .join("");

}


/* =========================================================
   RECENT EXPENSES
========================================================= */

function displayRecentExpenses(
  expenses
) {

  const body =
    document.querySelector(
      "#recentExpenses tbody"
    );


  if (!body) {
    return;
  }


  if (!expenses.length) {

    body.innerHTML = `
      <tr>
        <td colspan="3">
          No expenses yet.
        </td>
      </tr>
    `;

    return;
  }


  body.innerHTML =
    expenses
      .slice(0, 5)
      .map(
        expense => {

          return `
            <tr>

              <td>
                ${escapeHtml(
                  expense.description ||
                  "Expense"
                )}
              </td>

              <td>
                KSh ${money(
                  expense.amount
                )}
              </td>

              <td>
                ${escapeHtml(
                  expense.approval_status ||
                  "Recorded"
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

function displayMeetings(
  meetings
) {

  const body =
    document.querySelector(
      "#upcomingMeetings tbody"
    );


  if (!body) {
    return;
  }


  if (!meetings.length) {

    body.innerHTML = `
      <tr>
        <td colspan="4">
          No upcoming meetings.
        </td>
      </tr>
    `;

    return;
  }


  body.innerHTML =
    meetings
      .slice(0, 5)
      .map(
        meeting => {

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
                  "upcoming"
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   MEMBER CONTRIBUTION STATUS
========================================================= */

function displayMemberStatus(
  members,
  contributions,
  group
) {

  const body =
    document.querySelector(
      "#memberContributionStatus tbody"
    );


  if (!body) {
    return;
  }


  const monthlyAmount =
    Number(
      group?.monthly_contribution || 0
    );


  const currentMonth =
    new Date()
      .toISOString()
      .slice(0, 7);


  const activeMembers =
    members.filter(
      member =>
        member.status === "active"
    );


  if (!activeMembers.length) {

    body.innerHTML = `
      <tr>
        <td colspan="5">
          No active members.
        </td>
      </tr>
    `;

    return;
  }


  body.innerHTML =
    activeMembers
      .map(
        member => {

          const paid =
            contributions
              .filter(
                contribution => {

                  return (
                    contribution.member_id ===
                      member.id &&
                    contribution.month ===
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
            outstanding <= 0 &&
            monthlyAmount > 0
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
                  member.name
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
   MAIN DASHBOARD
========================================================= */

async function loadDashboard() {

  console.log(
    "CHAMA LIVE: dashboard.js loaded."
  );


  const errorBox =
    byId("error");


  try {

    const member =
      await getMember();


    if (!member) {

      throw new Error(
        "No member account found."
      );

    }


    if (!member.group_id) {

      throw new Error(
        "Your member account has no group."
      );

    }


    const groupId =
      member.group_id;


    const [
      group,
      members,
      contributions,
      expenses,
      meetings
    ] =
      await Promise.all([

        getGroup(),

        loadMembers(
          groupId
        ),

        loadContributions(
          groupId
        ),

        loadExpenses(
          groupId
        ),

        loadMeetings(
          groupId
        )

      ]);


    displaySummary(
      members,
      contributions,
      expenses,
      group
    );


    displayRecentContributions(
      contributions,
      members
    );


    displayRecentExpenses(
      expenses
    );


    displayMeetings(
      meetings
    );


    displayMemberStatus(
      members,
      contributions,
      group
    );


    console.log(
      "CHAMA LIVE: dashboard ready."
    );


  } catch (error) {

    console.error(
      "CHAMA LIVE dashboard error:",
      error
    );


    if (errorBox) {

      errorBox.hidden =
        false;

      errorBox.textContent =
        error?.message ||
        "Unable to load dashboard.";

    }

  }

}


/* =========================================================
   START
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    loadDashboard,
    {
      once: true
    }
  );

} else {

  loadDashboard();

}
