import { supabase } from "./supabase.js";

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const activeMembersEl = document.getElementById("activeMembers");
const totalMembersEl = document.getElementById("totalMembers");
const contributionsEl = document.getElementById("contributions");
const approvedExpensesEl = document.getElementById("approvedExpenses");
const pendingExpensesEl = document.getElementById("pendingExpenses");
const currentBalanceEl = document.getElementById("currentBalance");

const openingEl = document.getElementById("opening");
const contributions2El = document.getElementById("contributions2");
const expenses2El = document.getElementById("expenses2");
const balanceEl = document.getElementById("balance");

const contributionRowsEl =
  document.getElementById("contributionRows");

const expenseRowsEl =
  document.getElementById("expenseRows");

const upcomingMeetingsEl =
  document.getElementById("upcomingMeetings");

const completedMeetingsEl =
  document.getElementById("completedMeetings");

const cancelledMeetingsEl =
  document.getElementById("cancelledMeetings");


/* -------------------------------------------------------
   HELPERS
------------------------------------------------------- */

function money(value) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}


function number(value) {
  return new Intl.NumberFormat("en-KE").format(
    Number(value || 0)
  );
}


function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}


function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function showError(message) {
  console.error(message);

  errorEl.textContent =
    message?.message ||
    String(message) ||
    "Unable to load reports.";

  errorEl.hidden = false;

  statusEl.textContent = "Unable to load reports.";
}


function setLoading() {
  errorEl.hidden = true;
  statusEl.textContent = "Loading reports...";
}


/* -------------------------------------------------------
   GET CURRENT GROUP
------------------------------------------------------- */

async function getGroupId() {
  const { data, error } = await supabase.rpc("my_group_id");

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


/* -------------------------------------------------------
   GET GROUP OPENING BALANCE
------------------------------------------------------- */

async function loadGroup(groupId) {
  const { data, error } = await supabase
    .from("groups")
    .select("opening_balance")
    .eq("id", groupId)
    .single();

  if (error) {
    throw error;
  }

  return {
    openingBalance: Number(data?.opening_balance || 0)
  };
}


/* -------------------------------------------------------
   MEMBERS
------------------------------------------------------- */

async function loadMembers(groupId) {
  const { data, error } = await supabase
    .from("members")
    .select("id, status")
    .eq("group_id", groupId);

  if (error) {
    throw error;
  }

  const members = data || [];

  const total = members.length;

  const active = members.filter(
    member =>
      String(member.status || "").toLowerCase() === "active"
  ).length;

  return {
    total,
    active
  };
}


/* -------------------------------------------------------
   CONTRIBUTIONS
------------------------------------------------------- */

async function loadContributions(groupId) {
  const { data, error } = await supabase
    .from("contributions")
    .select(`
      id,
      member_id,
      amount,
      contribution_date
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


/* -------------------------------------------------------
   CONTRIBUTION MEMBER NAMES
------------------------------------------------------- */

async function loadMemberNames(groupId, contributions) {
  const memberIds = [
    ...new Set(
      contributions
        .map(item => item.member_id)
        .filter(Boolean)
    )
  ];

  if (!memberIds.length) {
    return {};
  }

  const { data, error } = await supabase
    .from("members")
    .select("id, name")
    .eq("group_id", groupId)
    .in("id", memberIds);

  if (error) {
    throw error;
  }

  const lookup = {};

  (data || []).forEach(member => {
    lookup[member.id] = member.name;
  });

  return lookup;
}


/* -------------------------------------------------------
   EXPENSES
------------------------------------------------------- */

async function loadExpenses(groupId) {
  const { data, error } = await supabase
    .from("expenses")
    .select(`
      id,
      amount,
      date,
      description,
      category,
      approval_status
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


/* -------------------------------------------------------
   MEETINGS
------------------------------------------------------- */

async function loadMeetings(groupId) {
  const { data, error } = await supabase
    .from("meetings")
    .select(`
      id,
      date,
      title,
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


/* -------------------------------------------------------
   CALCULATE FINANCIALS
------------------------------------------------------- */

function calculateFinancials(
  openingBalance,
  contributions,
  expenses
) {
  const totalContributions = contributions.reduce(
    (total, item) =>
      total + Number(item.amount || 0),
    0
  );

  const approvedExpenses = expenses
    .filter(
      item =>
        String(item.approval_status || "")
          .toLowerCase() === "approved"
    )
    .reduce(
      (total, item) =>
        total + Number(item.amount || 0),
      0
    );

  const pendingExpenses = expenses
    .filter(
      item =>
        String(item.approval_status || "")
          .toLowerCase() === "pending"
    )
    .reduce(
      (total, item) =>
        total + Number(item.amount || 0),
      0
    );

  const currentBalance =
    openingBalance +
    totalContributions -
    approvedExpenses;

  return {
    totalContributions,
    approvedExpenses,
    pendingExpenses,
    currentBalance
  };
}


/* -------------------------------------------------------
   RENDER MEMBERS
------------------------------------------------------- */

function renderMembers(memberStats) {
  activeMembersEl.textContent =
    number(memberStats.active);

  totalMembersEl.textContent =
    number(memberStats.total);
}


/* -------------------------------------------------------
   RENDER FINANCIALS
------------------------------------------------------- */

function renderFinancials(
  openingBalance,
  financials
) {
  contributionsEl.textContent =
    money(financials.totalContributions);

  approvedExpensesEl.textContent =
    money(financials.approvedExpenses);

  pendingExpensesEl.textContent =
    money(financials.pendingExpenses);

  currentBalanceEl.textContent =
    money(financials.currentBalance);


  openingEl.textContent =
    money(openingBalance);

  contributions2El.textContent =
    money(financials.totalContributions);

  expenses2El.textContent =
    money(financials.approvedExpenses);

  balanceEl.textContent =
    money(financials.currentBalance);
}


/* -------------------------------------------------------
   RENDER CONTRIBUTIONS
------------------------------------------------------- */

function renderContributions(
  contributions,
  memberNames
) {
  if (!contributions.length) {
    contributionRowsEl.innerHTML = `
      <tr>
        <td colspan="6">
          No contributions recorded yet.
        </td>
      </tr>
    `;

    return;
  }


  /*
    Your current contributions schema contains:
      contribution_date
      member_id
      amount

    Type, Method and Reference are not selected because
    they are not part of the schema previously established.
  */

  contributionRowsEl.innerHTML =
    contributions
      .slice(0, 10)
      .map(item => {
        const memberName =
          memberNames[item.member_id] ||
          "Unknown member";

        return `
          <tr>

            <td>
              ${escapeHtml(
                formatDate(item.contribution_date)
              )}
            </td>

            <td>
              ${escapeHtml(memberName)}
            </td>

            <td>
              <strong>
                ${escapeHtml(money(item.amount))}
              </strong>
            </td>

            <td>
              —
            </td>

            <td>
              —
            </td>

            <td>
              —
            </td>

          </tr>
        `;
      })
      .join("");
}


/* -------------------------------------------------------
   RENDER EXPENSES
------------------------------------------------------- */

function renderExpenses(expenses) {
  if (!expenses.length) {
    expenseRowsEl.innerHTML = `
      <tr>
        <td colspan="5">
          No expenses recorded yet.
        </td>
      </tr>
    `;

    return;
  }


  expenseRowsEl.innerHTML =
    expenses
      .slice(0, 10)
      .map(item => {
        const status =
          String(
            item.approval_status || "pending"
          ).toLowerCase();

        return `
          <tr>

            <td>
              ${escapeHtml(
                formatDate(item.date)
              )}
            </td>

            <td>
              ${escapeHtml(
                item.description || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                item.category || "—"
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
                item.approval_status || "—"
              )}
            </td>

          </tr>
        `;
      })
      .join("");
}


/* -------------------------------------------------------
   RENDER MEETINGS
------------------------------------------------------- */

function renderMeetings(meetings) {
  const today = new Date();

  today.setHours(0, 0, 0, 0);


  let upcoming = 0;
  let completed = 0;
  let cancelled = 0;


  meetings.forEach(meeting => {
    const status =
      String(meeting.status || "")
        .toLowerCase()
        .trim();


    if (
      status === "cancelled" ||
      status === "canceled"
    ) {
      cancelled++;
      return;
    }


    if (
      status === "completed" ||
      status === "complete"
    ) {
      completed++;
      return;
    }


    const meetingDate =
      new Date(meeting.date);

    if (
      !Number.isNaN(
        meetingDate.getTime()
      ) &&
      meetingDate >= today
    ) {
      upcoming++;
    }
  });


  upcomingMeetingsEl.textContent =
    number(upcoming);

  completedMeetingsEl.textContent =
    number(completed);

  cancelledMeetingsEl.textContent =
    number(cancelled);
}


/* -------------------------------------------------------
   MAIN
------------------------------------------------------- */

async function loadReports() {
  try {
    setLoading();


    /*
      Get the group belonging to the
      currently authenticated user.
    */
    const groupId =
      await getGroupId();


    /*
      Load all report data.
      These requests can run in parallel.
    */
    const [
      group,
      memberStats,
      contributions,
      expenses,
      meetings
    ] = await Promise.all([
      loadGroup(groupId),
      loadMembers(groupId),
      loadContributions(groupId),
      loadExpenses(groupId),
      loadMeetings(groupId)
    ]);


    /*
      Get names for contribution member IDs.
    */
    const memberNames =
      await loadMemberNames(
        groupId,
        contributions
      );


    /*
      Calculate totals.
    */
    const financials =
      calculateFinancials(
        group.openingBalance,
        contributions,
        expenses
      );


    /*
      Render everything.
    */
    renderMembers(memberStats);

    renderFinancials(
      group.openingBalance,
      financials
    );

    renderContributions(
      contributions,
      memberNames
    );

    renderExpenses(expenses);

    renderMeetings(meetings);


    /*
      Finished successfully.
    */
    statusEl.textContent =
      `Reports updated • ${new Date().toLocaleString("en-KE")}`;

  } catch (error) {
    showError(error);
  }
}


/* -------------------------------------------------------
   START
------------------------------------------------------- */

loadReports();
