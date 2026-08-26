```javascript
import {
  supabase,
  requireAuth,
  getMyMember,
  getMyGroup,
  getMyGroupId,
  logout
} from "./auth.js";


/* =====================================================
   ELEMENTS
===================================================== */

const $ = (id) =>
  document.getElementById(id);


/* =====================================================
   FORMAT MONEY
===================================================== */

function money(value) {

  const amount =
    Number(value || 0);

  return (
    "KSh " +
    amount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }
    )
  );

}


/* =====================================================
   FORMAT DATE
===================================================== */

function formatDate(value) {

  if (!value) {
    return "—";
  }

  const date =
    new Date(value);


  if (Number.isNaN(date.getTime())) {
    return value;
  }


  return date.toLocaleDateString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );

}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =====================================================
   CURRENT MONTH
===================================================== */

function currentMonth() {

  const now =
    new Date();

  return (
    now.getFullYear() +
    "-" +
    String(
      now.getMonth() + 1
    ).padStart(2, "0")
  );

}


/* =====================================================
   MONTH LABEL
===================================================== */

function monthLabel() {

  return new Date()
    .toLocaleDateString(
      "en-KE",
      {
        month: "long",
        year: "numeric"
      }
    );

}


/* =====================================================
   SET TEXT
===================================================== */

function setText(
  id,
  value
) {

  const element =
    $(id);

  if (element) {
    element.textContent =
      value;
  }

}


/* =====================================================
   ERROR
===================================================== */

function showError(
  message
) {

  const element =
    $("dashboardError");


  if (!element) {

    console.error(
      message
    );

    return;

  }


  element.hidden =
    false;

  element.textContent =
    message;

}


/* =====================================================
   HIDE ERROR
===================================================== */

function clearError() {

  const element =
    $("dashboardError");


  if (element) {

    element.hidden =
      true;

    element.textContent =
      "";

  }

}


/* =====================================================
   LOAD MEMBERS
===================================================== */

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
        name,
        role,
        status,
        join_date,
        email
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


  return data || [];

}


/* =====================================================
   LOAD CONTRIBUTIONS
===================================================== */

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
        contribution_date,
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


  return data || [];

}


/* =====================================================
   LOAD EXPENSES
===================================================== */

async function loadExpenses(
  groupId
) {

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


/* =====================================================
   LOAD MEETINGS
===================================================== */

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
        status,
        created_at
      `)
      .eq(
        "group_id",
        groupId
      )
      .gte(
        "date",
        new Date()
          .toISOString()
          .slice(0, 10)
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


  return data || [];

}


/* =====================================================
   MEMBER COUNT
===================================================== */

function updateMemberCard(
  members
) {

  const active =
    members.filter(
      member =>
        String(
          member.status || ""
        ).toLowerCase() ===
        "active"
    );


  setText(
    "memberCount",
    active.length
  );


  setText(
    "memberActive",
    `${active.length} active`
  );

}


/* =====================================================
   CONTRIBUTION CALCULATIONS
===================================================== */

function calculateContributionTotals(
  members,
  contributions,
  group
) {

  const monthlyContribution =
    Number(
      group?.monthly_contribution ||
      0
    );


  const expected =
    members.filter(
      member =>
        String(
          member.status || ""
        ).toLowerCase() ===
        "active"
    ).length *
    monthlyContribution;


  const month =
    currentMonth();


  /*
   * contributions.month may be stored as
   * YYYY-MM, while contribution_date is a date.
   *
   * We support both.
   */

  const monthly =
    contributions.filter(
      contribution => {

        if (
          contribution.month ===
          month
        ) {

          return true;

        }


        if (
          contribution.contribution_date
        ) {

          return String(
            contribution.contribution_date
          ).slice(0, 7) ===
            month;

        }


        if (
          contribution.created_at
        ) {

          return String(
            contribution.created_at
          ).slice(0, 7) ===
            month;

        }


        return false;

      }
    );


  const collected =
    monthly.reduce(
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
        ) *
        100
      : 0;


  return {
    expected,
    collected,
    outstanding,
    rate
  };

}


/* =====================================================
   EXPENSE TOTAL
===================================================== */

function calculateApprovedExpenses(
  expenses
) {

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
          expense.amount ||
          0
        ),
      0
    );

}


/* =====================================================
   CURRENT BALANCE
===================================================== */

function calculateBalance(
  group,
  contributions,
  expenses
) {

  const openingBalance =
    Number(
      group?.opening_balance ||
      0
    );


  const totalContributions =
    contributions.reduce(
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


  const approvedExpenses =
    calculateApprovedExpenses(
      expenses
    );


  return (
    openingBalance +
    totalContributions -
    approvedExpenses
  );

}


/* =====================================================
   UPDATE FINANCIAL CARDS
===================================================== */

function updateFinancialCards(
  totals,
  balance
) {

  setText(
    "monthlyExpected",
    money(
      totals.expected
    )
  );


  setText(
    "monthlyCollected",
    money(
      totals.collected
    )
  );


  setText(
    "monthlyOutstanding",
    money(
      totals.outstanding
    )
  );


  setText(
    "collectionRate",
    `${totals.rate.toFixed(1)}%`
  );


  setText(
    "currentBalance",
    money(balance)
  );


  setText(
    "progressAmount",
    `${money(
      totals.collected
    )} / ${money(
      totals.expected
    )}`
  );


  setText(
    "progressPercent",
    `${totals.rate.toFixed(1)}%`
  );


  const progress =
    $("progressBar");


  if (progress) {

    progress.style.width =
      `${Math.min(
        totals.rate,
        100
      )}%`;

  }


  setText(
    "currentMonth",
    monthLabel()
  );

}


/* =====================================================
   MEMBER CONTRIBUTION STATUS
===================================================== */

function renderMemberStatus(
  members,
  contributions,
  group
) {

  const container =
    $("memberContributionBody");


  if (!container) {
    return;
  }


  const monthlyContribution =
    Number(
      group?.monthly_contribution ||
      0
    );


  const month =
    currentMonth();


  const monthly =
    contributions.filter(
      contribution => {

        if (
          contribution.month ===
          month
        ) {

          return true;

        }


        if (
          contribution.contribution_date
        ) {

          return String(
            contribution.contribution_date
          ).slice(0, 7) ===
            month;

        }


        return false;

      }
    );


  const paidByMember =
    {};


  monthly.forEach(
    contribution => {

      const id =
        contribution.member_id;


      if (!id) {
        return;
      }


      paidByMember[id] =
        (
          paidByMember[id] ||
          0
        ) +
        Number(
          contribution.amount ||
          0
        );

    }
  );


  const activeMembers =
    members.filter(
      member =>
        String(
          member.status || ""
        ).toLowerCase() ===
        "active"
    );


  if (!activeMembers.length) {

    container.innerHTML = `

      <tr>

        <td
          colspan="4"
          class="muted"
        >
          No active members.

        </td>

      </tr>

    `;

    return;

  }


  container.innerHTML =
    activeMembers
      .map(
        member => {

          const paid =
            Number(
              paidByMember[
                member.id
              ] ||
              0
            );


          const outstanding =
            Math.max(
              monthlyContribution -
              paid,
              0
            );


          const status =
            outstanding <= 0
              ? "PAID"
              : "OUTSTANDING";


          return `

            <tr>

              <td>
                ${escapeHtml(
                  member.name
                )}
              </td>

              <td>
                ${money(
                  monthlyContribution
                )}
              </td>

              <td>
                ${money(
                  paid
                )}
              </td>

              <td>
                ${money(
                  outstanding
                )}
              </td>

              <td>
                <strong>
                  ${status}
                </strong>
              </td>

            </tr>

          `;

        }
      )
      .join("");

}


/* =====================================================
   RECENT CONTRIBUTIONS
===================================================== */

function renderRecentContributions(
  contributions,
  members
) {

  const container =
    $("recentContributionsBody");


  if (!container) {
    return;
  }


  const memberMap =
    new Map(
      members.map(
        member => [
          member.id,
          member.name
        ]
      )
    );


  const recent =
    contributions
      .slice(
        0,
        5
      );


  if (!recent.length) {

    container.innerHTML = `

      <tr>

        <td
          colspan="3"
          class="muted"
        >
          No contributions recorded.

        </td>

      </tr>

    `;

    return;

  }


  container.innerHTML =
    recent
      .map(
        contribution => {

          const name =
            memberMap.get(
              contribution.member_id
            ) ||
            "Unknown member";


          const date =
            contribution.contribution_date ||
            contribution.created_at;


          return `

            <tr>

              <td>
                ${escapeHtml(
                  name
                )}
              </td>

              <td>
                <strong>
                  ${money(
                    contribution.amount
                  )}
                </strong>
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


/* =====================================================
   RECENT EXPENSES
===================================================== */

function renderRecentExpenses(
  expenses
) {

  const container =
    $("recentExpensesBody");


  if (!container) {
    return;
  }


  const recent =
    expenses
      .slice(
        0,
        5
      );


  if (!recent.length) {

    container.innerHTML = `

      <tr>

        <td
          colspan="3"
          class="muted"
        >
          No expenses recorded.

        </td>

      </tr>

    `;

    return;

  }


  container.innerHTML =
    recent
      .map(
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
                  ${money(
                    expense.amount
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  expense.approval_status ||
                  "pending"
                )}
              </td>

            </tr>

          `;

        }
      )
      .join("");

}


/* =====================================================
   UPCOMING MEETINGS
===================================================== */

function renderMeetings(
  meetings
) {

  const container =
    $("upcomingMeetingsBody");


  if (!container) {
    return;
  }


  if (!meetings.length) {

    container.innerHTML = `

      <tr>

        <td
          colspan="4"
          class="muted"
        >
          No upcoming meetings.

        </td>

      </tr>

    `;

    return;

  }


  container.innerHTML =
    meetings
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


/* =====================================================
   UPDATE GROUP NAME
===================================================== */

function updateGroupHeader(
  group
) {

  const name =
    group?.name ||
    "Your Group";


  setText(
    "groupName",
    name
  );

}


/* =====================================================
   LOAD DASHBOARD
===================================================== */

async function loadDashboard() {

  clearError();


  setText(
    "dashboardStatus",
    "Loading dashboard..."
  );


  try {


    /*
     * Authentication
     */

    const session =
      await requireAuth();


    if (!session) {
      return;
    }


    /*
     * Member
     */

    const member =
      await getMyMember(
        true
      );


    if (!member) {

      throw new Error(
        "Your account is not linked to a member record."
      );

    }


    /*
     * Group ID
     */

    const groupId =
      member.group_id ||
      await getMyGroupId();


    if (!groupId) {

      throw new Error(
        "Your account is not linked to a group."
      );

    }


    /*
     * Group
     */

    const group =
      await getMyGroup(
        true
      );


    if (!group) {

      throw new Error(
        "Your account is not linked to a valid group."
      );

    }


    /*
     * Load data in parallel.
     */

    const [
      members,
      contributions,
      expenses,
      meetings
    ] =
      await Promise.all([

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


    /*
     * Header
     */

    updateGroupHeader(
      group
    );


    /*
     * Members
     */

    updateMemberCard(
      members
    );


    /*
     * Monthly totals
     */

    const totals =
      calculateContributionTotals(
        members,
        contributions,
        group
      );


    /*
     * Balance
     */

    const balance =
      calculateBalance(
        group,
        contributions,
        expenses
      );


    /*
     * Cards
     */

    updateFinancialCards(
      totals,
      balance
    );


    /*
     * Tables
     */

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


    renderMeetings(
      meetings
    );


    /*
     * Last updated
     */

    setText(
      "dashboardStatus",
      `Dashboard updated • ${
        new Date().toLocaleString(
          "en-KE"
        )
      }`
    );


  } catch (error) {

    console.error(
      "DASHBOARD ERROR:",
      error
    );


    showError(
      error?.message ||
      "Unable to load dashboard."
    );


    setText(
      "dashboardStatus",
      "Dashboard could not be loaded."
    );

  }

}


/* =====================================================
   LOGOUT
===================================================== */

const logoutButton =
  $("logout");


if (logoutButton) {

  logoutButton.addEventListener(
    "click",
    async () => {

      try {

        await logout();

      } catch (error) {

        console.error(
          "Logout:",
          error
        );

      }

    }
  );

}


/* =====================================================
   START
===================================================== */

loadDashboard();
```
