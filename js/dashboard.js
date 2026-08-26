import supabase from "./supabase.js";

/* =========================================================
   CHAMA LIVE — DASHBOARD
========================================================= */

function byId(id) {
  return document.getElementById(id);
}

function money(value) {
  return Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(value) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   CURRENT MEMBER
========================================================= */

async function getCurrentMember() {

  const {
    data,
    error
  } = await supabase.rpc("get_my_member");

  if (error) {
    throw error;
  }

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
}


/* =========================================================
   GROUP
========================================================= */

async function getCurrentGroup() {

  const {
    data,
    error
  } = await supabase.rpc("get_my_group");

  if (error) {
    throw error;
  }

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
}


/* =========================================================
   MEMBERS
========================================================= */

async function loadMembers(groupId) {

  const {
    data,
    error
  } = await supabase
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
    .order("created_at", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  return data || [];
}


/* =========================================================
   CONTRIBUTIONS
========================================================= */

async function loadContributions(groupId) {

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
      mpesa_reference,
      contribution_date,
      notes,
      created_at
    `)
    .eq("group_id", groupId)
    .order("contribution_date", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  return data || [];
}


/* =========================================================
   EXPENSES
========================================================= */

async function loadExpenses(groupId) {

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
    .eq("group_id", groupId)
    .order("date", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  return data || [];
}


/* =========================================================
   MEETINGS
========================================================= */

async function loadMeetings(groupId) {

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
      status
    `)
    .eq("group_id", groupId)
    .order("date", {
      ascending: true
    });

  if (error) {
    throw error;
  }

  return data || [];
}


/* =========================================================
   MEMBER NAME MAP
========================================================= */

function createMemberMap(members) {

  const map = {};

  members.forEach(member => {

    map[member.id] =
      member.name || "Member";

  });

  return map;
}


/* =========================================================
   DISPLAY SUMMARY
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
      (sum, row) =>
        sum + Number(row.amount || 0),
      0
    );


  /*
   * Only approved expenses are included
   * in the current balance.
   */

  const approvedExpenses =
    expenses
      .filter(
        row =>
          row.approval_status ===
          "approved"
      )
      .reduce(
        (sum, row) =>
          sum + Number(row.amount || 0),
        0
      );


  const openingBalance =
    Number(
      group?.opening_balance || 0
    );


  const currentBalance =
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
      `KSh ${money(monthlyExpected)}`;
  }


  /* -------------------------------------------------------
     MONTHLY COLLECTED
  ------------------------------------------------------- */

  const collectedBox =
    byId("monthlyCollected");

  if (collectedBox) {
    collectedBox.textContent =
      `KSh ${money(totalContributions)}`;
  }


  /* -------------------------------------------------------
     CURRENT BALANCE
  ------------------------------------------------------- */

  const balanceBox =
    byId("currentBalance");

  if (balanceBox) {
    balanceBox.textContent =
      `KSh ${money(currentBalance)}`;
  }


  /* -------------------------------------------------------
     COLLECTION RATE
  ------------------------------------------------------- */

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


  const rateBox =
    byId("collectionRate");

  if (rateBox) {
    rateBox.textContent =
      `${collectionRate.toFixed(0)}%`;
  }


  /* -------------------------------------------------------
     PROGRESS
  ------------------------------------------------------- */

  const progressAmount =
    byId("progressAmount");

  if (progressAmount) {
    progressAmount.textContent =
      `KSh ${money(totalContributions)} / KSh ${money(monthlyExpected)}`;
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


  const memberMap =
    createMemberMap(members);


  body.innerHTML =
    contributions
      .slice(0, 5)
      .map(row => {

        const memberName =
          memberMap[row.member_id] ||
          "Member";


        return `
          <tr>

            <td>
              ${escapeHtml(memberName)}
            </td>

            <td>
              KSh ${money(row.amount)}
            </td>

            <td>
              ${formatDate(
                row.contribution_date
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
      .map(row => {

        return `
          <tr>

            <td>
              ${escapeHtml(
                row.description
              )}
            </td>

            <td>
              KSh ${money(row.amount)}
            </td>

            <td>
              ${escapeHtml(
                row.approval_status
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
      .map(row => {

        return `
          <tr>

            <td>
              ${formatDate(row.date)}
            </td>

            <td>
              ${escapeHtml(row.title)}
            </td>

            <td>
              ${escapeHtml(
                row.venue || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                row.status || "upcoming"
              )}
            </td>

          </tr>
        `;

      })
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


  body.innerHTML =
    members
      .filter(
        member =>
          member.status === "active"
      )
      .map(member => {

        const paid =
          contributions
            .filter(
              contribution =>
                contribution.member_id ===
                  member.id &&
                contribution.month ===
                  currentMonth
            )
            .reduce(
              (sum, contribution) =>
                sum +
                Number(
                  contribution.amount || 0
                ),
              0
            );


        const outstanding =
          Math.max(
            0,
            monthlyAmount - paid
          );


        const status =
          outstanding <= 0
            ? "Paid"
            : paid > 0
              ? "Partial"
              : "Outstanding";


        return `
          <tr>

            <td>
              ${escapeHtml(
                member.name
              )}
            </td>

            <td>
              KSh ${money(monthlyAmount)}
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


  if (!body.innerHTML) {

    body.innerHTML = `
      <tr>
        <td colspan="5">
          No active members.
        </td>
      </tr>
    `;

  }

}


/* =========================================================
   MAIN
========================================================= */

async function loadDashboard() {

  console.log(
    "CHAMA LIVE: dashboard.js loaded."
  );


  const errorBox =
    byId("error");


  try {

    const member =
      await getCurrentMember();


    if (!member) {

      throw new Error(
        "No member account found."
      );

    }


    if (!member.group_id) {

      throw new Error(
        "Your account is not linked to a group."
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

        getCurrentGroup(),

        loadMembers(groupId),

        loadContributions(groupId),

        loadExpenses(groupId),

        loadMeetings(groupId)

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
      "CHAMA LIVE dashboard ready.",
      {
        group,
        members,
        contributions,
        expenses,
        meetings
      }
    );


  } catch (error) {

    console.error(
      "Dashboard error:",
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
