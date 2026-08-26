```javascript
import { supabase } from "./supabase.js";
import {
  requireAuth,
  getMyMember,
  getMyGroup,
  getMyGroupId
} from "./auth.js";


/* =========================================================
   DOM HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);


function setText(id, value) {
  const element = $(id);

  if (element) {
    element.textContent = value;
  }
}


function showError(message) {
  const error = $("error");

  if (error) {
    error.hidden = false;
    error.textContent = message;
  }

  const status = $("status");

  if (status) {
    status.textContent = "Dashboard could not be loaded.";
  }
}


function clearError() {
  const error = $("error");

  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   MONEY
========================================================= */

function money(value) {
  const number = Number(value || 0);

  return `KSh ${number.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}


/* =========================================================
   DATE
========================================================= */

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}


/* =========================================================
   CURRENT MONTH
========================================================= */

function getCurrentMonth() {
  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;
}


function getCurrentMonthLabel() {
  return new Date().toLocaleDateString("en-KE", {
    month: "long",
    year: "numeric"
  });
}


/* =========================================================
   DATE/MONTH MATCHING
========================================================= */

function contributionBelongsToCurrentMonth(contribution) {
  const currentMonth = getCurrentMonth();

  /*
   * Preferred column:
   * contributions.month
   *
   * Expected format:
   * YYYY-MM
   */

  if (contribution.month) {
    const month = String(
      contribution.month
    ).slice(0, 7);

    if (month === currentMonth) {
      return true;
    }
  }


  /*
   * Fallback:
   * contribution_date
   */

  if (contribution.contribution_date) {
    const dateMonth = String(
      contribution.contribution_date
    ).slice(0, 7);

    if (dateMonth === currentMonth) {
      return true;
    }
  }


  /*
   * Final fallback:
   * created_at
   */

  if (contribution.created_at) {
    const createdMonth = String(
      contribution.created_at
    ).slice(0, 7);

    if (createdMonth === currentMonth) {
      return true;
    }
  }


  return false;
}


/* =========================================================
   LOAD GROUP
========================================================= */

async function loadGroup(groupId) {

  /*
   * First use the existing secure RPC.
   */

  try {

    const group =
      await getMyGroup(true);

    if (group) {
      return group;
    }

  } catch (error) {

    console.warn(
      "getMyGroup RPC failed:",
      error
    );

  }


  /*
   * Fallback to direct group query.
   */

  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select(`
        id,
        name,
        registration_number,
        phone,
        email,
        monthly_contribution,
        opening_balance,
        created_at,
        category,
        description,
        access_code,
        country
      `)
      .eq(
        "id",
        groupId
      )
      .maybeSingle();


  if (error) {
    throw error;
  }


  return data;

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers(groupId) {

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
        auth_user_id,
        member_number,
        membership_number,
        name,
        phone,
        email,
        role,
        join_date,
        status,
        onboarding_status,
        created_at,
        activated_at
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


/* =========================================================
   LOAD CONTRIBUTIONS
========================================================= */

async function loadContributions(groupId) {

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
        recorded_by,
        created_at,
        goal_id,
        contribution_date,
        notes
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


/* =========================================================
   LOAD EXPENSES
========================================================= */

async function loadExpenses(groupId) {

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
        recorded_by,
        receipt_url,
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


/* =========================================================
   LOAD MEETINGS
========================================================= */

async function loadMeetings(groupId) {

  const today =
    new Date()
      .toISOString()
      .slice(
        0,
        10
      );


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
        agenda,
        minutes,
        resolution,
        status,
        created_at
      `)
      .eq(
        "group_id",
        groupId
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


  return data || [];

}


/* =========================================================
   MEMBER METRICS
========================================================= */

function updateMemberMetrics(members) {

  /*
   * The dashboard should count active members.
   */

  const activeMembers =
    members.filter(
      member =>
        String(
          member.status || ""
        ).toLowerCase() === "active"
    );


  setText(
    "membersCount",
    members.length
  );


  setText(
    "activeMembers",
    activeMembers.length
  );

}


/* =========================================================
   FINANCIAL CALCULATIONS
========================================================= */

function calculateFinancials(
  members,
  contributions,
  expenses,
  group
) {

  const monthlyContribution =
    Number(
      group?.monthly_contribution || 0
    );


  /*
   * Active members × monthly contribution
   */

  const activeMembers =
    members.filter(
      member =>
        String(
          member.status || ""
        ).toLowerCase() === "active"
    );


  const monthlyExpected =
    activeMembers.length *
    monthlyContribution;


  /*
   * Current month contributions.
   */

  const currentMonthContributions =
    contributions.filter(
      contribution =>
        contributionBelongsToCurrentMonth(
          contribution
        )
    );


  const monthlyCollected =
    currentMonthContributions.reduce(
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
      monthlyExpected -
      monthlyCollected,
      0
    );


  const collectionRate =
    monthlyExpected > 0
      ? (
          monthlyCollected /
          monthlyExpected
        ) *
        100
      : 0;


  /*
   * Total contributions ever recorded.
   */

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


  /*
   * Approved expenses only.
   */

  const approvedExpenses =
    expenses
      .filter(
        expense =>
          String(
            expense.approval_status || ""
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


  /*
   * Opening balance.
   */

  const openingBalance =
    Number(
      group?.opening_balance || 0
    );


  /*
   * Current balance.
   */

  const currentBalance =
    openingBalance +
    totalContributions -
    approvedExpenses;


  return {
    monthlyContribution,
    monthlyExpected,
    monthlyCollected,
    outstanding,
    collectionRate,
    totalContributions,
    approvedExpenses,
    openingBalance,
    currentBalance
  };

}


/* =========================================================
   UPDATE FINANCIAL CARDS
========================================================= */

function updateFinancialCards(
  financials
) {

  setText(
    "monthlyExpected",
    money(
      financials.monthlyExpected
    )
  );


  setText(
    "monthlyCollected",
    money(
      financials.monthlyCollected
    )
  );


  setText(
    "monthlyOutstanding",
    money(
      financials.outstanding
    )
  );


  setText(
    "collectionRate",
    `${financials.collectionRate.toFixed(1)}%`
  );


  setText(
    "currentBalance",
    money(
      financials.currentBalance
    )
  );


  /*
   * Contribution progress.
   */

  setText(
    "progressMonth",
    getCurrentMonthLabel()
  );


  setText(
    "progressText",
    `${money(
      financials.monthlyCollected
    )} / ${money(
      financials.monthlyExpected
    )}`
  );


  setText(
    "progressPercentage",
    `${financials.collectionRate.toFixed(1)}%`
  );


  const progressBar =
    $("progressBar");


  if (progressBar) {

    progressBar.style.width =
      `${Math.min(
        Math.max(
          financials.collectionRate,
          0
        ),
        100
      )}%`;

  }

}


/* =========================================================
   MEMBER PAYMENT STATUS
========================================================= */

function renderMemberStatus(
  members,
  contributions,
  group
) {

  const tbody =
    $("memberStatusRows");


  if (!tbody) {
    return;
  }


  const monthlyContribution =
    Number(
      group?.monthly_contribution || 0
    );


  const currentMonthContributions =
    contributions.filter(
      contribution =>
        contributionBelongsToCurrentMonth(
          contribution
        )
    );


  /*
   * Build a map:
   *
   * member ID -> amount paid
   */

  const paidMap =
    new Map();


  for (
    const contribution
    of currentMonthContributions
  ) {

    const memberId =
      contribution.member_id;


    if (!memberId) {
      continue;
    }


    const existing =
      Number(
        paidMap.get(
          memberId
        ) || 0
      );


    paidMap.set(
      memberId,
      existing +
      Number(
        contribution.amount || 0
      )
    );

  }


  const activeMembers =
    members.filter(
      member =>
        String(
          member.status || ""
        ).toLowerCase() ===
        "active"
    );


  if (!activeMembers.length) {

    tbody.innerHTML = `

      <tr>

        <td colspan="5">
          No active members.
        </td>

      </tr>

    `;

    return;

  }


  tbody.innerHTML =
    activeMembers
      .map(
        member => {

          const paid =
            Number(
              paidMap.get(
                member.id
              ) || 0
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


/* =========================================================
   RECENT CONTRIBUTIONS
========================================================= */

function renderRecentContributions(
  contributions,
  members
) {

  const tbody =
    $("recentContributionRows");


  if (!tbody) {
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
    contributions.slice(
      0,
      5
    );


  if (!recent.length) {

    tbody.innerHTML = `

      <tr>

        <td colspan="3">
          No contributions recorded.
        </td>

      </tr>

    `;

    return;

  }


  tbody.innerHTML =
    recent
      .map(
        contribution => {

          const memberName =
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
                  memberName
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


/* =========================================================
   RECENT EXPENSES
========================================================= */

function renderRecentExpenses(
  expenses
) {

  const tbody =
    $("recentExpenseRows");


  if (!tbody) {
    return;
  }


  const recent =
    expenses.slice(
      0,
      5
    );


  if (!recent.length) {

    tbody.innerHTML = `

      <tr>

        <td colspan="3">
          No expenses recorded.
        </td>

      </tr>

    `;

    return;

  }


  tbody.innerHTML =
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


/* =========================================================
   UPCOMING MEETINGS
========================================================= */

function renderUpcomingMeetings(
  meetings
) {

  const tbody =
    $("upcomingMeetingRows");


  if (!tbody) {
    return;
  }


  if (!meetings.length) {

    tbody.innerHTML = `

      <tr>

        <td colspan="4">
          No upcoming meetings.
        </td>

      </tr>

    `;

    return;

  }


  tbody.innerHTML =
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


/* =========================================================
   MAIN DASHBOARD
========================================================= */

async function loadDashboard() {

  clearError();


  setText(
    "status",
    "Loading dashboard..."
  );


  try {

    /*
     * 1. Authentication
     */

    const session =
      await requireAuth();


    if (!session) {
      return;
    }


    /*
     * 2. Current member
     */

    const member =
      await getMyMember(true);


    if (!member) {

      throw new Error(
        "Your account is not linked to a member record."
      );

    }


    /*
     * 3. Group ID
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
     * 4. Load group
     */

    const group =
      await loadGroup(
        groupId
      );


    if (!group) {

      throw new Error(
        "Your account is not linked to a valid group."
      );

    }


    /*
     * 5. Load all dashboard data.
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
     * 6. Member card
     */

    updateMemberMetrics(
      members
    );


    /*
     * 7. Financial calculations
     */

    const financials =
      calculateFinancials(
        members,
        contributions,
        expenses,
        group
      );


    /*
     * 8. Financial cards
     */

    updateFinancialCards(
      financials
    );


    /*
     * 9. Tables
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


    renderUpcomingMeetings(
      meetings
    );


    /*
     * 10. Success status
     */

    setText(
      "status",
      `Dashboard updated • ${new Date().toLocaleString(
        "en-KE"
      )}`
    );


  } catch (error) {

    console.error(
      "CHAMA LIVE DASHBOARD ERROR:",
      error
    );


    showError(
      error?.message ||
      "Unable to load dashboard."
    );

  }

}


/* =========================================================
   START
========================================================= */

loadDashboard();
```
