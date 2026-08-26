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

  const amount =
    Number(value || 0);


  return amount.toLocaleString(
    "en-KE",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
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
   CURRENT MEMBER
========================================================= */

async function getCurrentMember() {

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
      .select(
        "id,name,status,member_number"
      )
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
      .select("*")
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
   LOAD EXPENSES
========================================================= */

async function loadExpenses(
  groupId
) {

  /*
   * IMPORTANT:
   *
   * Do NOT specify expense_date.
   *
   * We use select("*") because the database
   * schema has a different expense date field.
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
      );


  if (error) {
    throw error;
  }


  return data || [];

}


/* =========================================================
   GET AMOUNT
========================================================= */

function getAmount(
  row
) {

  return Number(
    row?.amount ||
    row?.total ||
    row?.value ||
    0
  );

}


/* =========================================================
   GET DATE
========================================================= */

function getDate(
  row
) {

  return (
    row?.date ||
    row?.expense_date ||
    row?.transaction_date ||
    row?.created_at ||
    null
  );

}


/* =========================================================
   DASHBOARD
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


    const groupId =
      member.group_id;


    if (!groupId) {

      throw new Error(
        "Your account is not linked to a group."
      );

    }


    /* =====================================================
       DATA
    ===================================================== */

    const [
      members,
      contributions,
      expenses
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
        )

      ]);


    /* =====================================================
       TOTALS
    ===================================================== */

    const activeMembers =
      members.filter(
        member =>
          member.status ===
          "active"
      ).length;


    const totalContributions =
      contributions.reduce(
        (
          total,
          row
        ) =>
          total +
          getAmount(row),
        0
      );


    const totalExpenses =
      expenses.reduce(
        (
          total,
          row
        ) =>
          total +
          getAmount(row),
        0
      );


    const balance =
      totalContributions -
      totalExpenses;


    /* =====================================================
       DISPLAY
    ===================================================== */

    const membersBox =
      byId("activeMembers");


    if (membersBox) {

      membersBox.textContent =
        activeMembers;

    }


    const collectedBox =
      byId("monthlyCollected");


    if (collectedBox) {

      collectedBox.textContent =
        `KSh ${money(
          totalContributions
        )}`;

    }


    const balanceBox =
      byId("currentBalance");


    if (balanceBox) {

      balanceBox.textContent =
        `KSh ${money(
          balance
        )}`;

    }


    /* =====================================================
       RECENT CONTRIBUTIONS
    ===================================================== */

    const contributionBody =
      document.querySelector(
        "#recentContributions tbody"
      );


    if (contributionBody) {

      const recent =
        contributions
          .slice()
          .sort(
            (
              a,
              b
            ) =>
              new Date(
                b.created_at ||
                b.date ||
                0
              ) -
              new Date(
                a.created_at ||
                a.date ||
                0
              )
          )
          .slice(
            0,
            5
          );


      if (!recent.length) {

        contributionBody.innerHTML = `
          <tr>
            <td colspan="3">
              No contributions yet.
            </td>
          </tr>
        `;

      } else {

        contributionBody.innerHTML =
          recent
            .map(
              row => `

                <tr>

                  <td>
                    ${escapeHtml(
                      row.member_name ||
                      row.name ||
                      "Member"
                    )}
                  </td>

                  <td>
                    KSh ${money(
                      getAmount(row)
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      getDate(row)
                        ? new Date(
                            getDate(row)
                          ).toLocaleDateString()
                        : "—"
                    )}
                  </td>

                </tr>

              `
            )
            .join("");

      }

    }


    /* =====================================================
       RECENT EXPENSES
    ===================================================== */

    const expenseBody =
      document.querySelector(
        "#recentExpenses tbody"
      );


    if (expenseBody) {

      const recent =
        expenses
          .slice()
          .sort(
            (
              a,
              b
            ) =>
              new Date(
                b.created_at ||
                b.date ||
                0
              ) -
              new Date(
                a.created_at ||
                a.date ||
                0
              )
          )
          .slice(
            0,
            5
          );


      if (!recent.length) {

        expenseBody.innerHTML = `
          <tr>
            <td colspan="3">
              No expenses yet.
            </td>
          </tr>
        `;

      } else {

        expenseBody.innerHTML =
          recent
            .map(
              row => `

                <tr>

                  <td>
                    ${escapeHtml(
                      row.description ||
                      row.title ||
                      "Expense"
                    )}
                  </td>

                  <td>
                    KSh ${money(
                      getAmount(row)
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      row.status ||
                      "Recorded"
                    )}
                  </td>

                </tr>

              `
            )
            .join("");

      }

    }


    console.log(
      "CHAMA LIVE dashboard data:",
      {
        members,
        contributions,
        expenses,
        totalContributions,
        totalExpenses,
        balance
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
