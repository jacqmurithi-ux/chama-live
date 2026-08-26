import { supabase } from "./supabase.js";


console.log("CHAMA LIVE: dashboard.js loaded");


/* =====================================================
   HELPERS
===================================================== */

function money(value) {
  return Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}


function setValue(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}


/* =====================================================
   CURRENT USER
===================================================== */

async function getUser() {

  const {
    data,
    error
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!data?.user) {
    throw new Error("You are not logged in.");
  }

  return data.user;
}


/* =====================================================
   CURRENT MEMBER
===================================================== */

async function getMember(userId) {

  const {
    data,
    error
  } = await supabase
    .from("members")
    .select("*")
    .eq("user_id", userId)
    .limit(1);

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    throw new Error(
      "No member record is linked to this account."
    );
  }

  return data[0];
}


/* =====================================================
   CURRENT GROUP
===================================================== */

async function getGroup(groupId) {

  const {
    data,
    error
  } = await supabase
    .from("groups")
    .select("*")
    .eq("id", groupId)
    .limit(1);

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    throw new Error(
      "The member is not linked to a valid group."
    );
  }

  return data[0];
}


/* =====================================================
   MEMBERS
===================================================== */

async function getMembers(groupId) {

  const {
    data,
    error
  } = await supabase
    .from("members")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", {
      ascending: true
    });

  if (error) {
    throw error;
  }

  return data || [];
}


/* =====================================================
   CONTRIBUTIONS
===================================================== */

async function getContributions(groupId) {

  const {
    data,
    error
  } = await supabase
    .from("contributions")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  return data || [];
}


/* =====================================================
   EXPENSES
===================================================== */

async function getExpenses(groupId) {

  /*
   * IMPORTANT
   *
   * Do NOT use expense_date.
   * Your database previously reported:
   *
   * column expenses.expense_date does not exist
   *
   * We therefore select * and read the available
   * date field safely.
   */

  const {
    data,
    error
  } = await supabase
    .from("expenses")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  return data || [];
}


/* =====================================================
   MEETINGS
===================================================== */

async function getMeetings(groupId) {

  const {
    data,
    error
  } = await supabase
    .from("meetings")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  return data || [];
}


/* =====================================================
   SUMMARY
===================================================== */

function renderSummary(
  members,
  contributions,
  expenses,
  group
) {

  const activeMembers =
    members.filter(
      member =>
        String(member.status || "active")
          .toLowerCase() === "active"
    ).length;


  const totalCollected =
    contributions.reduce(
      (sum, item) =>
        sum + Number(item.amount || 0),
      0
    );


  const approvedExpenses =
    expenses
      .filter(item => {

        const status =
          String(
            item.approval_status ||
            item.status ||
            ""
          ).toLowerCase();

        return (
          status === "approved" ||
          status === "paid" ||
          status === "completed"
        );

      })
      .reduce(
        (sum, item) =>
          sum + Number(item.amount || 0),
        0
      );


  const openingBalance =
    Number(
      group.opening_balance || 0
    );


  const currentBalance =
    openingBalance +
    totalCollected -
    approvedExpenses;


  const monthlyContribution =
    Number(
      group.monthly_contribution || 0
    );


  const monthlyExpected =
    activeMembers *
    monthlyContribution;


  const outstanding =
    Math.max(
      0,
      monthlyExpected -
      totalCollected
    );


  const collectionRate =
    monthlyExpected > 0
      ? Math.min(
          100,
          (
            totalCollected /
            monthlyExpected
          ) * 100
        )
      : 0;


  setValue(
    "activeMembers",
    activeMembers
  );


  setValue(
    "monthlyExpected",
    `KSh ${money(monthlyExpected)}`
  );


  setValue(
    "monthlyCollected",
    `KSh ${money(totalCollected)}`
  );


  setValue(
    "outstanding",
    `KSh ${money(outstanding)}`
  );


  setValue(
    "collectionRate",
    `${collectionRate.toFixed(0)}%`
  );


  setValue(
    "currentBalance",
    `KSh ${money(currentBalance)}`
  );


  setValue(
    "progressAmount",
    `KSh ${money(totalCollected)} / KSh ${money(monthlyExpected)}`
  );


  setValue(
    "progressPercent",
    `${collectionRate.toFixed(0)}%`
  );
}


/* =====================================================
   RECENT CONTRIBUTIONS
===================================================== */

function renderContributions(
  contributions,
  members
) {

  const table =
    document.querySelector(
      "#recentContributions tbody"
    );

  if (!table) {
    console.warn(
      "recentContributions table not found"
    );
    return;
  }


  if (!contributions.length) {

    table.innerHTML = `
      <tr>
        <td colspan="3">
          No contributions yet.
        </td>
      </tr>
    `;

    return;
  }


  const memberMap = {};

  members.forEach(member => {

    memberMap[member.id] =
      member.name ||
      "Member";

  });


  table.innerHTML =
    contributions
      .slice(0, 5)
      .map(item => {

        const name =
          memberMap[item.member_id] ||
          "Member";


        const date =
          item.contribution_date ||
          item.date ||
          item.created_at;


        return `
          <tr>
            <td>
              ${escapeHtml(name)}
            </td>

            <td>
              KSh ${money(item.amount)}
            </td>

            <td>
              ${formatDate(date)}
            </td>
          </tr>
        `;

      })
      .join("");
}


/* =====================================================
   RECENT EXPENSES
===================================================== */

function renderExpenses(
  expenses
) {

  const table =
    document.querySelector(
      "#recentExpenses tbody"
    );

  if (!table) {
    console.warn(
      "recentExpenses table not found"
    );
    return;
  }


  if (!expenses.length) {

    table.innerHTML = `
      <tr>
        <td colspan="3">
          No expenses yet.
        </td>
      </tr>
    `;

    return;
  }


  table.innerHTML =
    expenses
      .slice(0, 5)
      .map(item => {

        const description =
          item.description ||
          item.title ||
          item.name ||
          "Expense";


        const status =
          item.approval_status ||
          item.status ||
          "Recorded";


        return `
          <tr>
            <td>
              ${escapeHtml(description)}
            </td>

            <td>
              KSh ${money(item.amount)}
            </td>

            <td>
              ${escapeHtml(status)}
            </td>
          </tr>
        `;

      })
      .join("");
}


/* =====================================================
   MEETINGS
===================================================== */

function renderMeetings(
  meetings
) {

  const table =
    document.querySelector(
      "#upcomingMeetings tbody"
    );

  if (!table) {
    console.warn(
      "upcomingMeetings table not found"
    );
    return;
  }


  if (!meetings.length) {

    table.innerHTML = `
      <tr>
        <td colspan="4">
          No upcoming meetings.
        </td>
      </tr>
    `;

    return;
  }


  table.innerHTML =
    meetings
      .slice(0, 5)
      .map(item => {

        const title =
          item.title ||
          item.name ||
          item.description ||
          "Meeting";


        const date =
          item.date ||
          item.meeting_date ||
          item.created_at;


        return `
          <tr>

            <td>
              ${formatDate(date)}
            </td>

            <td>
              ${escapeHtml(title)}
            </td>

            <td>
              ${escapeHtml(
                item.venue ||
                item.location ||
                "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                item.status ||
                "Upcoming"
              )}
            </td>

          </tr>
        `;

      })
      .join("");
}


/* =====================================================
   MEMBER CONTRIBUTION STATUS
===================================================== */

function renderMemberStatus(
  members,
  contributions,
  group
) {

  const table =
    document.querySelector(
      "#memberContributionStatus tbody"
    );

  if (!table) {
    console.warn(
      "memberContributionStatus table not found"
    );
    return;
  }


  const monthlyAmount =
    Number(
      group.monthly_contribution || 0
    );


  const now =
    new Date();


  const currentYear =
    now.getFullYear();


  const currentMonth =
    now.getMonth();


  table.innerHTML =
    members
      .filter(member =>
        String(member.status || "active")
          .toLowerCase() === "active"
      )
      .map(member => {

        const paid =
          contributions
            .filter(item => {

              if (
                item.member_id !==
                member.id
              ) {
                return false;
              }


              const dateValue =
                item.contribution_date ||
                item.date ||
                item.created_at;


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

            })
            .reduce(
              (sum, item) =>
                sum +
                Number(item.amount || 0),
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
              KSh ${money(paid)}
            </td>

            <td>
              KSh ${money(outstanding)}
            </td>

            <td>
              ${status}
            </td>

          </tr>
        `;

      })
      .join("");


  if (!table.innerHTML) {

    table.innerHTML = `
      <tr>
        <td colspan="5">
          No active members.
        </td>
      </tr>
    `;

  }
}


/* =====================================================
   MAIN
===================================================== */

async function loadDashboard() {

  const errorBox =
    document.getElementById("error");


  try {

    console.log(
      "CHAMA LIVE: getting current user..."
    );


    const user =
      await getUser();


    console.log(
      "CHAMA LIVE USER:",
      user.id
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
        "Your member account does not have a group_id."
      );

    }


    const group =
      await getGroup(
        member.group_id
      );


    console.log(
      "CHAMA LIVE GROUP:",
      group
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
      "DASHBOARD DATA",
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


    renderContributions(
      contributions,
      members
    );


    renderExpenses(
      expenses
    );


    renderMeetings(
      meetings
    );


    renderMemberStatus(
      members,
      contributions,
      group
    );


    console.log(
      "CHAMA LIVE DASHBOARD READY"
    );


  } catch (error) {

    console.error(
      "CHAMA LIVE DASHBOARD ERROR:",
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


/* =====================================================
   START
===================================================== */

loadDashboard();
