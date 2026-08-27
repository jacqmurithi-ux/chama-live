import { supabase } from "./supabase.js";

import {
  getMyMember,
  getMyGroup
} from "./auth.js";


/* =========================================================
   CHAMA LIVE — DASHBOARD
========================================================= */

console.log(
  "CHAMA LIVE: dashboard.js loaded"
);


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

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}


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
   DATE HELPERS
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
    contribution.month
  ) {

    return String(
      contribution.month
    ).slice(0, 7);

  }


  if (
    contribution.contribution_date
  ) {

    return String(
      contribution.contribution_date
    ).slice(0, 7);

  }


  if (
    contribution.created_at
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

function showStatus(
  message
) {

  const status =
    byId("status");

  if (status) {

    status.style.display =
      "";

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


function showError(
  error
) {

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
   MEMBERS
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
   CONTRIBUTIONS
========================================================= */

async function getContributions(
  groupId
) {

  /*
   * Use select("*") so this remains
   * compatible with the current
   * contributions table.
   */

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
   EXPENSES
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
   MEETINGS
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


  /* =======================================================
     MEMBERS
  ======================================================= */

  const activeMembers =
    members.filter(
      member =>
        String(
          member.status ||
          "active"
        ).toLowerCase() ===
        "active"
    );


  const activeMemberCount =
    activeMembers.length;


  const totalMembers =
    members.length;


  /* =======================================================
     TOTAL CONTRIBUTIONS
  ======================================================= */

  const totalCollected =
    contributions.reduce(
      (
        total,
        contribution
      ) => {

        return (
          total +
          Number(
            contribution.amount ||
            0
          )
        );

      },
      0
    );


  /* =======================================================
     APPROVED EXPENSES
  ======================================================= */

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
        ) => {

          return (
            total +
            Number(
              expense.amount ||
              0
            )
          );

        },
        0
      );


  /* =======================================================
     BALANCE
  ======================================================= */

  const openingBalance =
    Number(
      group?.opening_balance ||
      0
    );


  const currentBalance =
    openingBalance +
    totalCollected -
    approvedExpenses;


  /* =======================================================
     MONTHLY CONFIGURATION
  ======================================================= */

  const monthlyContribution =
    Number(
      group?.monthly_contribution ||
      0
    );


  const monthlyExpected =
    activeMemberCount *
    monthlyContribution;


  /* =======================================================
     CURRENT MONTH
  ======================================================= */

  const currentMonth =
    getCurrentMonth();


  /* =======================================================
     MONTHLY COLLECTION
  ======================================================= */

  const monthlyCollected =
    contributions
      .filter(
        contribution => {

          const type =
            String(
              contribution.contribution_type ||
              ""
            ).toLowerCase();


          /*
           * Only monthly contributions
           * count toward monthly dues.
           */

          if (
            type !== "monthly"
          ) {

            return false;

          }


          return (
            getContributionMonth(
              contribution
            ) ===
            currentMonth
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
              contribution.amount ||
              0
            )
          );

        },
        0
      );


  /* =======================================================
     OUTSTANDING
  ======================================================= */

  const monthlyOutstanding =
    Math.max(
      0,
      monthlyExpected -
      monthlyCollected
    );


  /* =======================================================
     COLLECTION RATE
  ======================================================= */

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


  /* =======================================================
     DISPLAY
  ======================================================= */

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


  const progressBar =
    byId("progressBar");


  if (progressBar) {

    progressBar.style.width =
      `${collectionRate}%`;

  }


  const progressMonth =
    byId("progressMonth");


  if (progressMonth) {

    const now =
      new Date();

    progressMonth.textContent =
      now.toLocaleDateString(
        "en-KE",
        {
          month: "long",
          year: "numeric"
        }
      );

  }

       /* =========================================================
    MEMBER MONTHLY STATUS
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
       group?.monthly_contribution ||
       0
     );


   const currentMonth =
     getCurrentMonth();


   const activeMembers =
     members.filter(
       member =>
         String(
           member.status ||
           "active"
         ).toLowerCase() ===
         "active"
     );


   if (
     activeMembers.length === 0
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


                   const type =
                     String(
                       contribution.contribution_type ||
                       ""
                     ).toLowerCase();


                   if (
                     type !== "monthly"
                   ) {

                     return false;

                   }


                   return (
                     getContributionMonth(
                       contribution
                     ) ===
                     currentMonth
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
                       contribution.amount ||
                       0
                     )
                   );

                 },
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

   const rows =
     byId(
       "recentContributionRows"
     );


   if (!rows) {
     return;
   }


   if (
     contributions.length === 0
   ) {

     rows.innerHTML = `
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


   if (
     expenses.length === 0
   ) {

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


   if (
     meetings.length === 0
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
}
/* =========================================================
   DASHBOARD REFRESH
========================================================= */

async function refreshDashboard() {

  try {

    showStatus("Refreshing dashboard...");

    const member =
      await getMyMember();

    if (!member?.group_id) {

      throw new Error(
        "Your member account is not linked to a group."
      );

    }

    const group =
      await getMyGroup();

    if (!group?.id) {

      throw new Error(
        "Group information could not be loaded."
      );

    }

    const [
      members,
      contributions,
      expenses,
      meetings
    ] = await Promise.all([

      getMembers(
        group.id
      ),

      getContributions(
        group.id
      ),

      getExpenses(
        group.id
      ),

      getMeetings(
        group.id
      )

    ]);

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

  } catch (error) {

    console.error(
      "Dashboard refresh error:",
      error
    );

    showError(error);

  }

}

/* =========================================================
   LOAD DASHBOARD
========================================================= */

async function loadDashboard() {

  try {

    showStatus(
      "Loading dashboard..."
    );


    /* -------------------------------------------------------
       GET CURRENT MEMBER
    ------------------------------------------------------- */

    const member =
      await getMyMember();


    if (
      !member?.group_id
    ) {

      throw new Error(
        "Your member account is not linked to a group."
      );

    }


    /* -------------------------------------------------------
       GET CURRENT GROUP
    ------------------------------------------------------- */

    const group =
      await getMyGroup();


    if (
      !group?.id
    ) {

      throw new Error(
        "Group information could not be loaded."
      );

    }


    console.log(
      "CHAMA LIVE DASHBOARD:",
      {
        member,
        group
      }
    );


    /* -------------------------------------------------------
       LOAD DASHBOARD DATA
    ------------------------------------------------------- */

    const [
      members,
      contributions,
      expenses,
      meetings
    ] =
      await Promise.all([

        getMembers(
          group.id
        ),

        getContributions(
          group.id
        ),

        getExpenses(
          group.id
        ),

        getMeetings(
          group.id
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


    /* -------------------------------------------------------
       RENDER SUMMARY
    ------------------------------------------------------- */

    renderSummary(
      members,
      contributions,
      expenses,
      group
    );


    /* -------------------------------------------------------
       RENDER MEMBER STATUS
    ------------------------------------------------------- */

    renderMemberStatus(
      members,
      contributions,
      group
    );


    /* -------------------------------------------------------
       RENDER RECENT CONTRIBUTIONS
    ------------------------------------------------------- */

    renderRecentContributions(
      contributions,
      members
    );


    /* -------------------------------------------------------
       RENDER RECENT EXPENSES
    ------------------------------------------------------- */

    renderRecentExpenses(
      expenses
    );


    /* -------------------------------------------------------
       RENDER MEETINGS
    ------------------------------------------------------- */

    renderUpcomingMeetings(
      meetings
    );


    /* -------------------------------------------------------
       FINISHED
    ------------------------------------------------------- */

    hideStatus();


    console.log(
      "CHAMA LIVE: Dashboard ready."
    );

  } catch (error) {

    console.error(
      "CHAMA LIVE DASHBOARD ERROR:",
      error
    );


    showError(
      error
    );

  }

}


/* =========================================================
   PUBLIC INITIALIZER
========================================================= */

export async function initDashboard() {

  await loadDashboard();

}


/* =========================================================
   AUTO REFRESH
========================================================= */

let refreshTimer = null;


function startAutoRefresh() {

  if (refreshTimer) {

    clearInterval(
      refreshTimer
    );

  }


  refreshTimer =
    setInterval(
      async () => {

        await loadDashboard();

      },
      60000
    );

}


/* =========================================================
   REFRESH WHEN USER RETURNS TO PAGE
========================================================= */

document.addEventListener(
  "visibilitychange",
  () => {

    if (
      document.visibilityState ===
      "visible"
    ) {

      loadDashboard();

    }

  }
);


/* =========================================================
   START DASHBOARD
========================================================= */

await initDashboard();


/* =========================================================
   START AUTO REFRESH
========================================================= */

startAutoRefresh();


console.log(
  "CHAMA LIVE: dashboard auto-refresh enabled."
);
