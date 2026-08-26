import { supabase } from "./supabase.js";
import {
  requireAuth,
  getMyMember,
  getMyGroupId
} from "./auth.js";


/* =========================================================
   HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}


function money(value) {
  const amount = Number(value || 0);

  return "KSh " + amount.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
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


/* =========================================================
   STATUS
========================================================= */

function setStatus(message) {
  const status = $("status");

  if (status) {
    status.textContent = message;
  }
}


function showError(message) {
  const error = $("error");

  if (!error) return;

  error.hidden = false;
  error.textContent = message;
}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers(groupId) {

  const {
    data,
    error
  } = await supabase
    .from("members")
    .select(`
      id,
      name,
      role,
      status
    `)
    .eq("group_id", groupId)
    .order("name");

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
  } = await supabase
    .from("contributions")
    .select("*")
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
   LOAD EXPENSES
========================================================= */

async function loadExpenses(groupId) {

  const {
    data,
    error
  } = await supabase
    .from("expenses")
    .select("*")
    .eq("group_id", groupId)
    .order("expense_date", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  return data || [];
}


/* =========================================================
   LOAD MEETINGS
========================================================= */

async function loadMeetings(groupId) {

  const {
    data,
    error
  } = await supabase
    .from("meetings")
    .select("*")
    .eq("group_id", groupId)
    .order("meeting_date", {
      ascending: true
    });

  if (error) {
    throw error;
  }

  return data || [];
}


/* =========================================================
   FIND AMOUNT FIELD
========================================================= */

function getAmount(row) {

  return Number(
    row?.amount ??
    row?.total ??
    row?.value ??
    0
  );

}


/* =========================================================
   FIND DATE FIELD
========================================================= */

function getDate(row) {

  return (
    row?.contribution_date ||
    row?.expense_date ||
    row?.meeting_date ||
    row?.date ||
    row?.created_at ||
    null
  );

}


/* =========================================================
   CURRENT MONTH
========================================================= */

function currentMonthRange() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    now.getMonth();

  const start =
    new Date(
      year,
      month,
      1
    );

  const end =
    new Date(
      year,
      month + 1,
      1
    );

  return {
    start,
    end
  };

}


/* =========================================================
   UPDATE MEMBERS
========================================================= */

function renderMembers(members) {

  const total =
    members.length;

  const active =
    members.filter(
      member =>
        String(
          member.status || ""
        ).toLowerCase() === "active"
    ).length;

  const membersCount =
    $("membersCount");

  const activeMembers =
    $("activeMembers");

  if (membersCount) {
    membersCount.textContent =
      total;
  }

  if (activeMembers) {
    activeMembers.textContent =
      active;
  }

}


/* =========================================================
   MONTHLY CONTRIBUTIONS
========================================================= */

function calculateMonthlyContributions(
  contributions
) {

  const {
    start,
    end
  } =
    currentMonthRange();

  return contributions.filter(
    contribution => {

      const date =
        new Date(
          getDate(
            contribution
          )
        );

      return (
        !Number.isNaN(
          date.getTime()
        ) &&
        date >= start &&
        date < end
      );

    }
  );

}


/* =========================================================
   RENDER FINANCIAL METRICS
========================================================= */

function renderFinancials(
  members,
  contributions,
  expenses
) {

  const monthly =
    calculateMonthlyContributions(
      contributions
    );


  const collected =
    monthly.reduce(
      (
        total,
        contribution
      ) =>
        total +
        getAmount(
          contribution
        ),
      0
    );


  /*
   * Default monthly contribution.
   *
   * If your group later stores the
   * monthly amount in the groups table,
   * this can be replaced with that value.
   */

  const monthlyRate =
    200;


  const activeMembers =
    members.filter(
      member =>
        String(
          member.status || ""
        ).toLowerCase() === "active"
    ).length;


  const expected =
    activeMembers *
    monthlyRate;


  const outstanding =
    Math.max(
      expected -
      collected,
      0
    );


  const collectionRate =
    expected > 0
      ? Math.min(
          (
            collected /
            expected
          ) *
            100,
          100
        )
      : 0;


  const totalContributions =
    contributions.reduce(
      (
        total,
        contribution
      ) =>
        total +
        getAmount(
          contribution
        ),
      0
    );


  const totalExpenses =
    expenses.reduce(
      (
        total,
        expense
      ) =>
        total +
        getAmount(
          expense
        ),
      0
    );


  const balance =
    totalContributions -
    totalExpenses;


  if ($("monthlyExpected")) {
    $("monthlyExpected").textContent =
      money(expected);
  }


  if ($("monthlyCollected")) {
    $("monthlyCollected").textContent =
      money(collected);
  }


  if ($("monthlyOutstanding")) {
    $("monthlyOutstanding").textContent =
      money(outstanding);
  }


  if ($("collectionRate")) {
    $("collectionRate").textContent =
      collectionRate.toFixed(1) +
      "%";
  }


  if ($("currentBalance")) {
    $("currentBalance").textContent =
      money(balance);
  }


  if ($("progressText")) {
    $("progressText").textContent =
      money(collected) +
      " / " +
      money(expected);
  }


  if ($("progressPercentage")) {
    $("progressPercentage").textContent =
      collectionRate.toFixed(1) +
      "%";
  }


  if ($("progressBar")) {
    $("progressBar").style.width =
      collectionRate + "%";
  }


  if ($("progressMonth")) {

    const now =
      new Date();

    $("progressMonth").textContent =
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
   MEMBER PAYMENT STATUS
========================================================= */

function renderMemberStatus(
  members,
  contributions
) {

  const tbody =
    $("memberStatusRows");

  if (!tbody) return;


  const monthly =
    calculateMonthlyContributions(
      contributions
    );


  if (!members.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          No members found.
        </td>
      </tr>
    `;

    return;

  }


  tbody.innerHTML =
    members.map(
      member => {

        const paid =
          monthly
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
                getAmount(
                  contribution
                ),
              0
            );


        const expected =
          200;


        const outstanding =
          Math.max(
            expected -
            paid,
            0
          );


        const status =
          outstanding <= 0
            ? "Paid"
            : paid > 0
              ? "Partial"
              : "Pending";


        return `
          <tr>

            <td>
              ${escapeHtml(
                member.name
              )}
            </td>

            <td>
              ${money(
                expected
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
              ${status}
            </td>

          </tr>
        `;

      }
    ).join("");

}


/* =========================================================
   RECENT CONTRIBUTIONS
========================================================= */

function renderRecentContributions(
  contributions
) {

  const tbody =
    $("recentContributionRows");

  if (!tbody) return;


  const rows =
    contributions.slice(
      0,
      5
    );


  if (!rows.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="3">
          No contributions found.
        </td>
      </tr>
    `;

    return;

  }


  tbody.innerHTML =
    rows.map(
      contribution => {

        const memberName =
          contribution.member_name ||
          contribution.name ||
          "Member";


        const date =
          getDate(
            contribution
          );


        return `
          <tr>

            <td>
              ${escapeHtml(
                memberName
              )}
            </td>

            <td>
              ${money(
                getAmount(
                  contribution
                )
              )}
            </td>

            <td>
              ${
                date
                  ? new Date(
                      date
                    ).toLocaleDateString(
                      "en-KE"
                    )
                  : "—"
              }
            </td>

          </tr>
        `;

      }
    ).join("");

}


/* =========================================================
   RECENT EXPENSES
========================================================= */

function renderRecentExpenses(
  expenses
) {

  const tbody =
    $("recentExpenseRows");

  if (!tbody) return;


  const rows =
    expenses.slice(
      0,
      5
    );


  if (!rows.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="3">
          No expenses found.
        </td>
      </tr>
    `;

    return;

  }


  tbody.innerHTML =
    rows.map(
      expense => {

        return `
          <tr>

            <td>
              ${escapeHtml(
                expense.description ||
                expense.title ||
                "Expense"
              )}
            </td>

            <td>
              ${money(
                getAmount(
                  expense
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                expense.status ||
                "Recorded"
              )}
            </td>

          </tr>
        `;

      }
    ).join("");

}


/* =========================================================
   UPCOMING MEETINGS
========================================================= */

function renderUpcomingMeetings(
  meetings
) {

  const tbody =
    $("upcomingMeetingRows");

  if (!tbody) return;


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

          const date =
            new Date(
              getDate(
                meeting
              )
            );

          return (
            !Number.isNaN(
              date.getTime()
            ) &&
            date >= today
          );

        }
      )
      .slice(
        0,
        5
      );


  if (!upcoming.length) {

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
    upcoming.map(
      meeting => {

        const date =
          getDate(
            meeting
          );


        return `
          <tr>

            <td>
              ${
                date
                  ? new Date(
                      date
                    ).toLocaleDateString(
                      "en-KE"
                    )
                  : "—"
              }
            </td>

            <td>
              ${escapeHtml(
                meeting.title ||
                meeting.name ||
                meeting.meeting_type ||
                "Meeting"
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
    ).join("");

}


/* =========================================================
   BOOT
========================================================= */

async function bootDashboard() {

  try {

    setStatus(
      "Loading dashboard..."
    );


    const session =
      await requireAuth();


    if (!session) {
      return;
    }


    const member =
      await getMyMember();


    if (!member) {

      throw new Error(
        "No member record is linked to your account."
      );

    }


    const groupId =
      await getMyGroupId();


    if (!groupId) {

      throw new Error(
        "Your account is not linked to a group."
      );

    }


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


    renderMembers(
      members
    );


    renderFinancials(
      members,
      contributions,
      expenses
    );


    renderMemberStatus(
      members,
      contributions
    );


    renderRecentContributions(
      contributions
    );


    renderRecentExpenses(
      expenses
    );


    renderUpcomingMeetings(
      meetings
    );


    setStatus(
      "Dashboard loaded successfully."
    );


  } catch (error) {

    console.error(
      "Dashboard error:",
      error
    );


    setStatus(
      "Unable to load dashboard."
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

bootDashboard();
