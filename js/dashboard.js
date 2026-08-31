/* =========================================================
   CHAMA LIVE — DASHBOARD
   COMPLETE CORRECTED VERSION

   LIVE SCHEMA RULES
   ---------------------------------------------------------
   members.name              -> member display name
   members.id                -> canonical member ID

   contributions.member_id  -> member who made payment
   contributions.recorded_by -> member who recorded payment

   IMPORTANT:
   contributions has TWO foreign keys to members:
       contributions_member_id_fkey
       contributions_recorded_by_fkey

   Therefore:
       DO NOT use ambiguous members(...) embedding.

   Monthly accounting:
       Obligation
          ↓
       Payment
          ↓
       Allocation
          ↓
       Current outstanding / carry-forward credit

   This file is READ/WRITE safe for the existing dashboard.
   It does NOT modify database schema.
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";


console.log("CHAMA LIVE: dashboard.js loaded");


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;

let groupId = null;

let members = [];
let obligations = [];
let contributions = [];
let allocations = [];
let expenses = [];
let meetings = [];


/* =========================================================
   DOM HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}


function setText(id, value) {
  const el = $(id);

  if (el) {
    el.textContent = value;
  }
}


function showError(message) {
  const error = $("error");

  if (!error) return;

  error.hidden = false;
  error.textContent = message || "Dashboard could not be loaded.";
}


function clearError() {
  const error = $("error");

  if (!error) return;

  error.hidden = true;
  error.textContent = "";
}


function setStatus(message) {
  setText("status", message);
}


/* =========================================================
   MONEY
========================================================= */

function number(value) {
  const n = Number(value);

  return Number.isFinite(n) ? n : 0;
}


function money(value) {
  return `KSh ${number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}


/* =========================================================
   DATE HELPERS
========================================================= */

function today() {
  const d = new Date();

  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate()
  );
}


function monthStart() {
  const d = today();

  return new Date(
    d.getFullYear(),
    d.getMonth(),
    1
  );
}


function monthKey() {
  const d = monthStart();

  const year = d.getFullYear();

  const month = String(
    d.getMonth() + 1
  ).padStart(2, "0");

  return `${year}-${month}`;
}


function formatDate(value) {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return String(value);
  }

  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
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
   GET CURRENT GROUP
========================================================= */

async function loadContext() {

  currentUser = await requireAuth();

  if (!currentUser) {
    throw new Error("Authentication required.");
  }


  /*
     getMyMember() is the application's canonical
     authenticated-member lookup.
  */

  currentMember = await getMyMember();

  if (!currentMember) {
    throw new Error(
      "No member profile is linked to this account."
    );
  }


  /*
     getMyGroup() is the application's canonical
     current-group lookup.
  */

  currentGroup = await getMyGroup();

  if (!currentGroup) {
    throw new Error(
      "No group is linked to this account."
    );
  }


  groupId =
    currentMember.group_id ||
    currentGroup.id;


  if (!groupId) {
    throw new Error(
      "Current group ID could not be determined."
    );
  }


  console.log(
    "CHAMA LIVE dashboard context:",
    {
      userId: currentUser.id,
      memberId: currentMember.id,
      groupId
    }
  );
}


/* =========================================================
   GROUP
========================================================= */

async function loadGroup() {

  /*
     Use the verified groups columns only.
  */

  const {
    data,
    error
  } = await supabase
    .from("groups")
    .select(`
      id,
      name,
      monthly_contribution,
      opening_balance
    `)
    .eq("id", groupId)
    .maybeSingle();


  if (error) {
    throw error;
  }


  if (!data) {
    throw new Error(
      "Current group could not be found."
    );
  }


  currentGroup = {
    ...currentGroup,
    ...data
  };


  setText(
    "groupName",
    data.name || "CHAMA"
  );


  /*
     HTML uses data-group-name rather than
     id="groupName", so update both mechanisms.
  */

  document
    .querySelectorAll("[data-group-name]")
    .forEach(el => {
      el.textContent =
        data.name || "CHAMA";
    });
}


/* =========================================================
   MEMBERS
========================================================= */

async function loadMembers() {

  /*
     IMPORTANT:
     members.full_name DOES NOT EXIST.

     Verified live column:
         members.name
  */

  const {
    data,
    error
  } = await supabase
    .from("members")
    .select(`
      id,
      group_id,
      name,
      status,
      role,
      member_number,
      membership_number
    `)
    .eq("group_id", groupId)
    .order("name", {
      ascending: true
    });


  if (error) {
    throw error;
  }


  members = data || [];


  const activeMembers =
    members.filter(
      member =>
        String(member.status || "")
          .toLowerCase() === "active"
    );


  setText(
    "activeMembers",
    activeMembers.length
  );


  setText(
    "membersCount",
    members.length
  );


  return members;
}


/* =========================================================
   CONTRIBUTION OBLIGATIONS
========================================================= */

async function loadObligations() {

  /*
     Canonical 2B table.

     due_amount is the verified column.
  */

  const {
    data,
    error
  } = await supabase
    .from("contribution_obligations")
    .select(`
      id,
      group_id,
      member_id,
      obligation_month,
      due_amount
    `)
    .eq("group_id", groupId);


  if (error) {
    throw error;
  }


  obligations = data || [];

  return obligations;
}


/* =========================================================
   CONTRIBUTIONS
========================================================= */

async function loadContributions() {

  /*
     DO NOT DO THIS:

       members (
         name
       )

     because contributions has TWO foreign keys
     pointing to members.

     Instead, retrieve the contribution records and
     resolve member names from the already-loaded
     members array using member_id.
  */

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
      recorded_by,
      created_at,
      goal_id,
      contribution_date,
      notes,
      mpesa_reference
    `)
    .eq("group_id", groupId)
    .order("contribution_date", {
      ascending: false
    })
    .order("created_at", {
      ascending: false
    });


  if (error) {
    throw error;
  }


  contributions = data || [];

  return contributions;
}


/* =========================================================
   CONTRIBUTION ALLOCATIONS
========================================================= */

async function loadAllocations() {

  /*
     Canonical 2B allocation table.
  */

  const {
    data,
    error
  } = await supabase
    .from("contribution_allocations")
    .select(`
      id,
      payment_id,
      obligation_id,
      amount,
      created_at
    `);


  if (error) {
    throw error;
  }


  /*
     Restrict the allocations to payments and
     obligations belonging to this group.

     We already loaded both sides, so only retain
     allocations whose IDs occur in the current group.
  */

  const paymentIds =
    new Set(
      contributions.map(
        contribution => contribution.id
      )
    );


  const obligationIds =
    new Set(
      obligations.map(
        obligation => obligation.id
      )
    );


  allocations =
    (data || []).filter(allocation =>
      paymentIds.has(allocation.payment_id) &&
      obligationIds.has(allocation.obligation_id)
    );


  return allocations;
}


/* =========================================================
   EXPENSES
========================================================= */

async function loadExpenses() {

  const {
    data,
    error
  } = await supabase
    .from("expenses")
    .select(`
      id,
      group_id,
      description,
      amount,
      date,
      approval_status,
      category
    `)
    .eq("group_id", groupId)
    .order("date", {
      ascending: false
    })
    .order("created_at", {
      ascending: false
    })
    .limit(5);


  if (error) {
    throw error;
  }


  expenses = data || [];

  return expenses;
}


/* =========================================================
   MEETINGS
========================================================= */

async function loadMeetings() {

  const todayString =
    new Date()
      .toISOString()
      .slice(0, 10);


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
    .gte("date", todayString)
    .neq("status", "cancelled")
    .order("date", {
      ascending: true
    })
    .limit(5);


  if (error) {
    throw error;
  }


  meetings = data || [];

  return meetings;
}


/* =========================================================
   ACCOUNTING HELPERS
========================================================= */

function currentObligations() {

  const currentMonth =
    monthKey();


  return obligations.filter(
    obligation =>
      String(
        obligation.obligation_month
      ).slice(0, 7) === currentMonth
  );
}


function allocationsForObligation(
  obligationId
) {

  return allocations.filter(
    allocation =>
      allocation.obligation_id ===
      obligationId
  );
}


function allocatedAmount(
  obligationId
) {

  return allocationsForObligation(
    obligationId
  ).reduce(
    (total, allocation) =>
      total + number(allocation.amount),
    0
  );
}


function paymentAmount(
  paymentId
) {

  const payment =
    contributions.find(
      contribution =>
        contribution.id === paymentId
    );

  return payment
    ? number(payment.amount)
    : 0;
}


/* =========================================================
   MEMBER ACCOUNTING
========================================================= */

function buildMemberStatus() {

  const current =
    currentObligations();


  const currentByMember =
    new Map();


  current.forEach(obligation => {

    const existing =
      currentByMember.get(
        obligation.member_id
      );


    if (existing) {

      existing.due +=
        number(
          obligation.due_amount
        );

      existing.obligations.push(
        obligation
      );

    } else {

      currentByMember.set(
        obligation.member_id,
        {
          due:
            number(
              obligation.due_amount
            ),

          obligations: [
            obligation
          ]
        }
      );
    }

  });


  /*
     Build allocations for the current month.
  */

  const currentAllocationByMember =
    new Map();


  current.forEach(obligation => {

    const applied =
      allocatedAmount(
        obligation.id
      );


    const old =
      currentAllocationByMember.get(
        obligation.member_id
      ) || 0;


    currentAllocationByMember.set(
      obligation.member_id,
      old + applied
    );

  });


  /*
     Total payment made by each member in the
     current month.

     This is intentionally calculated from
     contribution.member_id directly.
  */

  const currentPaymentsByMember =
    new Map();


  const currentMonth =
    monthKey();


  contributions.forEach(payment => {

    const contributionMonth =
      payment.month ||
      (
        payment.contribution_date
          ? String(
              payment.contribution_date
            ).slice(0, 7)
          : String(
              payment.created_at || ""
            ).slice(0, 7)
      );


    if (
      contributionMonth !==
      currentMonth
    ) {
      return;
    }


    const old =
      currentPaymentsByMember.get(
        payment.member_id
      ) || 0;


    currentPaymentsByMember.set(
      payment.member_id,
      old + number(payment.amount)
    );

  });


  /*
     Previous outstanding cannot safely be guessed
     from payment totals.

     For the dashboard we derive it from prior
     obligations and prior allocations.
  */

  const previousOutstandingByMember =
    new Map();


  const currentStart =
    monthStart();


  obligations.forEach(obligation => {

    const obligationDate =
      new Date(
        obligation.obligation_month
      );


    if (
      obligationDate >=
      currentStart
    ) {
      return;
    }


    const due =
      number(
        obligation.due_amount
      );


    const applied =
      allocatedAmount(
        obligation.id
      );


    const outstanding =
      Math.max(
        0,
        due - applied
      );


    if (outstanding <= 0) {
      return;
    }


    const old =
      previousOutstandingByMember.get(
        obligation.member_id
      ) || 0;


    previousOutstandingByMember.set(
      obligation.member_id,
      old + outstanding
    );

  });


  /*
     Construct final member status.

     Payments first clear previous outstanding.
     Remaining payment applies to current due.
     Remaining amount becomes carry-forward credit.
  */

  return members
    .filter(member =>
      String(member.status || "")
        .toLowerCase() === "active"
    )
    .map(member => {

      const due =
        currentByMember.get(
          member.id
        )?.due || 0;


      const previousOutstanding =
        previousOutstandingByMember.get(
          member.id
        ) || 0;


      const payment =
        currentPaymentsByMember.get(
          member.id
        ) || 0;


      const previousCleared =
        Math.min(
          payment,
          previousOutstanding
        );


      const remainingAfterPrevious =
        Math.max(
          0,
          payment -
          previousCleared
        );


      const appliedThisMonth =
        Math.min(
          due,
          remainingAfterPrevious
        );


      const carryForward =
        Math.max(
          0,
          remainingAfterPrevious -
          appliedThisMonth
        );


      const currentOutstanding =
        Math.max(
          0,
          due -
          appliedThisMonth
        );


      let status =
        "Outstanding";


      if (currentOutstanding <= 0) {

        if (carryForward > 0) {
          status = "Credit";
        } else {
          status = "Cleared";
        }

      } else if (appliedThisMonth > 0) {

        status = "Partial";

      }


      return {
        member,
        due,
        previousOutstanding,
        payment,
        appliedThisMonth,
        carryForward,
        currentOutstanding,
        status
      };

    });
}


/* =========================================================
   DASHBOARD METRICS
========================================================= */

function renderMetrics() {

  const activeMembers =
    members.filter(
      member =>
        String(member.status || "")
          .toLowerCase() === "active"
    );


  const currentStatus =
    buildMemberStatus();


  const monthlyExpected =
    currentStatus.reduce(
      (total, row) =>
        total + row.due,
      0
    );


  const monthlyApplied =
    currentStatus.reduce(
      (total, row) =>
        total + row.appliedThisMonth,
      0
    );


  const currentOutstanding =
    currentStatus.reduce(
      (total, row) =>
        total + row.currentOutstanding,
      0
    );


  const carryForward =
    currentStatus.reduce(
      (total, row) =>
        total + row.carryForward,
      0
    );


  const totalContributions =
    contributions.reduce(
      (total, contribution) =>
        total + number(
          contribution.amount
        ),
      0
    );


  const totalExpenses =
    expenses.reduce(
      (total, expense) =>
        total +
        (
          String(
            expense.approval_status || ""
          ).toLowerCase() === "approved"
            ? number(expense.amount)
            : 0
        ),
      0
    );


  const openingBalance =
    number(
      currentGroup.opening_balance
    );


  const currentBalance =
    openingBalance +
    totalContributions -
    totalExpenses;


  setText(
    "activeMembers",
    activeMembers.length
  );


  setText(
    "membersCount",
    members.length
  );


  setText(
    "monthlyExpected",
    money(monthlyExpected)
  );


  setText(
    "monthlyCollected",
    money(monthlyApplied)
  );


  setText(
    "currentBalance",
    money(currentBalance)
  );


  return {
    monthlyExpected,
    monthlyApplied,
    currentOutstanding,
    carryForward,
    currentBalance
  };
}


/* =========================================================
   CONTRIBUTION PROGRESS
========================================================= */

function renderProgress() {

  const status =
    buildMemberStatus();


  const expected =
    status.reduce(
      (total, row) =>
        total + row.due,
      0
    );


  const applied =
    status.reduce(
      (total, row) =>
        total + row.appliedThisMonth,
      0
    );


  const carryForward =
    status.reduce(
      (total, row) =>
        total + row.carryForward,
      0
    );


  const outstanding =
    status.reduce(
      (total, row) =>
        total + row.currentOutstanding,
      0
    );


  const contributors =
    status.filter(
      row =>
        row.appliedThisMonth > 0
    ).length;


  const activeMemberCount =
    status.length;


  const percentage =
    expected > 0
      ? Math.min(
          100,
          Math.round(
            (
              applied /
              expected
            ) * 100
          )
        )
      : 0;


  const participation =
    activeMemberCount > 0
      ? Math.round(
          (
            contributors /
            activeMemberCount
          ) * 100
        )
      : 0;


  setText(
    "progressMonth",
    new Date().toLocaleDateString(
      "en-KE",
      {
        month: "long",
        year: "numeric"
      }
    )
  );


  setText(
    "progressPercentage",
    `${percentage}%`
  );


  const progressBar =
    $("progressBar");


  if (progressBar) {
    progressBar.style.width =
      `${percentage}%`;
  }


  const progress =
    document.querySelector(
      '[role="progressbar"]'
    );


  if (progress) {
    progress.setAttribute(
      "aria-valuenow",
      String(percentage)
    );
  }


  setText(
    "progressText",
    `${money(applied)} / ${money(expected)}`
  );


  setText(
    "contributorsCount",
    `${contributors} / ${activeMemberCount}`
  );


  setText(
    "contributorsPercentage",
    `${participation}%`
  );


  setText(
    "monthlyOutstanding",
    money(outstanding)
  );


  setText(
    "progressApplied",
    money(applied)
  );


  setText(
    "progressCarryForward",
    money(carryForward)
  );


  setText(
    "progressOutstanding",
    money(outstanding)
  );
}


/* =========================================================
   MEMBER STATUS TABLE
========================================================= */

function renderMemberStatus() {

  const tbody =
    $("memberStatusRows");


  if (!tbody) return;


  const status =
    buildMemberStatus();


  if (!status.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          No active members found.
        </td>
      </tr>
    `;

    return;
  }


  tbody.innerHTML =
    status.map(row => {

      const name =
        row.member.name ||
        "Unnamed member";


      const statusClass =
        row.status === "Credit"
          ? "status-credit"
          : row.status === "Cleared"
            ? "status-cleared"
            : row.status === "Partial"
              ? "status-partial"
              : "status-outstanding";


      return `
        <tr>

          <td>
            ${escapeHtml(name)}
          </td>

          <td>
            ${money(row.due)}
          </td>

          <td>
            ${money(row.previousOutstanding)}
          </td>

          <td class="applied-value">
            ${money(row.appliedThisMonth)}
          </td>

          <td class="credit-value">
            ${money(row.carryForward)}
          </td>

          <td class="outstanding-value">
            ${money(row.currentOutstanding)}
          </td>

          <td>
            <span class="status-badge ${statusClass}">
              ${escapeHtml(row.status)}
            </span>
          </td>

        </tr>
      `;

    }).join("");
}


/* =========================================================
   RECENT CONTRIBUTIONS
========================================================= */

function renderRecentContributions() {

  const tbody =
    $("recentContributionRows");


  if (!tbody) return;


  const rows =
    contributions.slice(0, 5);


  if (!rows.length) {

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
    rows.map(contribution => {

      /*
         Resolve the member name locally.

         This is the important relationship fix.
      */

      const member =
        members.find(
          item =>
            item.id ===
            contribution.member_id
        );


      const memberName =
        member?.name ||
        "Unknown member";


      const contributionDate =
        contribution.contribution_date ||
        contribution.created_at;


      return `
        <tr>

          <td>
            ${escapeHtml(memberName)}
          </td>

          <td>
            ${money(contribution.amount)}
          </td>

          <td>
            ${escapeHtml(
              formatDate(
                contributionDate
              )
            )}
          </td>

        </tr>
      `;

    }).join("");
}


/* =========================================================
   RECENT EXPENSES
========================================================= */

function renderRecentExpenses() {

  const tbody =
    $("recentExpenseRows");


  if (!tbody) return;


  if (!expenses.length) {

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
    expenses.map(expense => {

      const approval =
        String(
          expense.approval_status ||
          "pending"
        );


      const statusClass =
        approval === "approved"
          ? "status-paid"
          : approval === "rejected"
            ? "status-outstanding"
            : "status-pending";


      return `
        <tr>

          <td>
            ${escapeHtml(
              expense.description ||
              "Expense"
            )}
          </td>

          <td>
            ${money(expense.amount)}
          </td>

          <td>
            <span class="status-badge ${statusClass}">
              ${escapeHtml(
                approval
              )}
            </span>
          </td>

        </tr>
      `;

    }).join("");
}


/* =========================================================
   UPCOMING MEETINGS
========================================================= */

function renderMeetings() {

  const tbody =
    $("upcomingMeetingRows");


  if (!tbody) return;


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
    meetings.map(meeting => {

      const status =
        String(
          meeting.status ||
          "upcoming"
        );


      const statusClass =
        status === "completed"
          ? "status-paid"
          : status === "cancelled"
            ? "status-outstanding"
            : "status-neutral";


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
            <span class="status-badge ${statusClass}">
              ${escapeHtml(status)}
            </span>
          </td>

        </tr>
      `;

    }).join("");
}


/* =========================================================
   LOAD DASHBOARD
========================================================= */

async function loadDashboard() {

  clearError();

  setStatus(
    "Loading dashboard..."
  );


  try {

    /*
       1. Authentication
       2. Current member
       3. Current group
    */

    await loadContext();


    /*
       Load the group first.
    */

    await loadGroup();


    /*
       Members must be loaded before contributions
       are rendered because contribution.member_id
       is resolved locally to members.name.
    */

    await loadMembers();


    /*
       Canonical contribution accounting data.
    */

    await loadObligations();

    await loadContributions();

    await loadAllocations();


    /*
       Activity data.
    */

    await loadExpenses();

    await loadMeetings();


    /*
       Render.
    */

    renderMetrics();

    renderProgress();

    renderMemberStatus();

    renderRecentContributions();

    renderRecentExpenses();

    renderMeetings();


    setStatus(
      "Dashboard loaded."
    );


    console.log(
      "CHAMA LIVE dashboard data:",
      {
        groupId,
        members: members.length,
        obligations: obligations.length,
        contributions: contributions.length,
        allocations: allocations.length,
        expenses: expenses.length,
        meetings: meetings.length
      }
    );

  } catch (error) {

    console.error(
      "CHAMA LIVE dashboard error:",
      error
    );


    setStatus(
      "Dashboard could not be loaded."
    );


    showError(
      error?.message ||
      "Unable to load dashboard."
    );

  }
}


/* =========================================================
   LOGOUT
========================================================= */

function setupLogout() {

  const button =
    $("logout");


  if (!button) return;


  button.addEventListener(
    "click",
    async () => {

      button.disabled = true;

      button.textContent =
        "Signing out...";


      try {

        const {
          error
        } =
          await supabase.auth.signOut();


        if (error) {
          throw error;
        }


        window.location.href =
          "index.html";

      } catch (error) {

        console.error(
          "CHAMA LIVE logout error:",
          error
        );


        button.disabled = false;

        button.textContent =
          "Sign out";


        showError(
          error?.message ||
          "Unable to sign out."
        );

      }

    }
  );
}


/* =========================================================
   USER NAME
========================================================= */

function renderUserName() {

  const name =
    currentMember?.name ||
    currentUser?.email ||
    "Member";


  document
    .querySelectorAll("[data-user-name]")
    .forEach(el => {

      el.textContent = name;

    });
}


/* =========================================================
   BOOT
========================================================= */

async function bootDashboard() {

  setupLogout();

  await loadDashboard();

  renderUserName();

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
    bootDashboard,
    {
      once: true
    }
  );

} else {

  bootDashboard();

}
