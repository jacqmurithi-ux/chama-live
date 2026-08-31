/* =========================================================
   CHAMA LIVE — DASHBOARD
   CANONICAL 2B ACCOUNTING VERSION

   FRONTEND-ONLY CORRECTION
   ---------------------------------------------------------
   This file does NOT modify the database.

   Authentication / group context:
       requireAuth()
       getMyMember()
       getMyGroup()

   Membership rule:
       members.status controls membership accounting.

       onboarding_status is NOT used to determine
       whether a member is financially active.

   Canonical accounting:
       get_canonical_member_monthly_status()
       get_canonical_monthly_accounting_summary()

   Canonical chain:
       Obligation
            ↓
       Payment
            ↓
       Allocation
            ↓
       Arrears / Credit

   Dashboard is READ-ONLY.

   Required exports:
       initDashboard()
       refreshDashboard()
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";


console.log(
  "CHAMA LIVE: dashboard.js loaded"
);


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let currentGroupId = null;

let members = [];
let contributions = [];
let expenses = [];
let meetings = [];

let monthlyStatus = [];
let canonicalSummary = null;

let initialized = false;


/* =========================================================
   DOM HELPERS
========================================================= */

function el(id) {

  return document.getElementById(id);

}


function setText(id, value) {

  const element = el(id);

  if (!element) {
    return;
  }

  element.textContent =
    value ?? "—";

}


/* =========================================================
   MONEY
========================================================= */

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


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


/* =========================================================
   STATUS / ERROR
========================================================= */

function showStatus(message) {

  const element =
    el("status");

  if (!element) {
    return;
  }

  element.hidden =
    !message;

  element.textContent =
    message || "";

}


function showError(error) {

  console.error(
    "CHAMA LIVE: Dashboard error",
    error
  );

  const message =
    error?.message ||
    String(error) ||
    "Dashboard could not be loaded.";

  const errorElement =
    el("error");

  if (errorElement) {

    errorElement.hidden =
      false;

    errorElement.textContent =
      message;

  }

  /*
     Some Dashboard versions only have
     a status element.
  */

  const statusElement =
    el("status");

  if (
    statusElement &&
    !errorElement
  ) {

    statusElement.hidden =
      false;

    statusElement.textContent =
      message;

  }

}


function clearError() {

  const errorElement =
    el("error");

  if (errorElement) {

    errorElement.hidden =
      true;

    errorElement.textContent =
      "";

  }

}


/* =========================================================
   DATE HELPERS
========================================================= */

function normalizeDate(value) {

  if (!value) {
    return "";
  }

  return String(value)
    .substring(0, 10);

}


function getToday() {

  const date =
    new Date();

  return [

    date.getFullYear(),

    String(
      date.getMonth() + 1
    ).padStart(2, "0"),

    String(
      date.getDate()
    ).padStart(2, "0")

  ].join("-");

}


function getCurrentMonth() {

  return getToday()
    .substring(0, 7);

}


function formatDate(value) {

  const dateValue =
    normalizeDate(value);

  if (!dateValue) {
    return "—";
  }

  const date =
    new Date(
      `${dateValue}T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return dateValue;

  }

  return date.toLocaleDateString(
    "en-KE",
    {
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );

}


function formatMonth(month) {

  if (!month) {
    return "—";
  }

  const date =
    new Date(
      `${month}-01T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return month;

  }

  return date.toLocaleDateString(
    "en-KE",
    {
      year: "numeric",
      month: "long"
    }
  );

}


/* =========================================================
   GROUP CONTEXT
========================================================= */

async function loadContext() {

  currentUser =
    await requireAuth();

  if (!currentUser) {

    throw new Error(
      "You are not signed in."
    );

  }


  currentMember =
    await getMyMember();

  if (!currentMember) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  if (!currentMember.id) {

    throw new Error(
      "Your member record has no member ID."
    );

  }


  if (!currentMember.group_id) {

    throw new Error(
      "Your member record is not linked to a group."
    );

  }


  currentGroupId =
    currentMember.group_id;


  currentGroup =
    await getMyGroup();

  if (!currentGroup) {

    throw new Error(
      "Group information could not be found."
    );

  }


  if (
    String(currentGroup.id) !==
    String(currentGroupId)
  ) {

    throw new Error(
      "Current group context could not be verified."
    );

  }


  renderContext();

}


function renderContext() {

  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(element => {

      element.textContent =
        currentGroup?.name ||
        "CHAMA";

    });


  document
    .querySelectorAll(
      "[data-user-name]"
    )
    .forEach(element => {

      element.textContent =
        currentMember?.name ||
        "Member";

    });

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

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
        phone,
        email,
        role,
        join_date,
        status,
        onboarding_status,
        created_at
      `)
      .eq(
        "group_id",
        currentGroupId
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


  members =
    data || [];

}


/* =========================================================
   LOAD CONTRIBUTIONS
========================================================= */

async function loadContributions() {

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
        recorded_by,
        contribution_date,
        notes,
        created_at
      `)
      .eq(
        "group_id",
        currentGroupId
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


  contributions =
    data || [];

}


/* =========================================================
   LOAD EXPENSES
========================================================= */

async function loadExpenses() {

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
        approval_status,
        receipt_url,
        created_at
      `)
      .eq(
        "group_id",
        currentGroupId
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


  expenses =
    data || [];

}


/* =========================================================
   LOAD MEETINGS
========================================================= */

async function loadMeetings() {

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
        currentGroupId
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


  meetings =
    data || [];

}


/* =========================================================
   ACTIVE MEMBER CHECK
=========================================================

   IMPORTANT:
   ---------------------------------------------------------
   Financial membership is controlled by members.status.

   onboarding_status is deliberately ignored.

   A member with:
       status = active
       onboarding_status = pending

   is STILL an active chama member.

   Login status is separate from membership status.
========================================================= */

function isActiveMember(member) {

  const status =
    String(
      member?.status || ""
    )
      .trim()
      .toLowerCase();


  /*
     Only explicit non-active states are excluded.

     Do NOT check:
         onboarding_status
         auth_user_id
         login status
   */

  return ![
    "inactive",
    "suspended",
    "removed"
  ].includes(status);

}


/* =========================================================
   MEMBER NAME
========================================================= */

function memberName(memberId) {

  if (!memberId) {
    return "—";
  }


  const member =
    members.find(
      item =>
        String(item.id) ===
        String(memberId)
    );


  return (
    member?.name ||
    "Unknown member"
  );

}


/* =========================================================
   CANONICAL 2B MEMBER STATUS
========================================================= */

async function loadCanonicalMemberStatus(
  month
) {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_canonical_member_monthly_status",
      {
        p_group_id:
          currentGroupId,

        p_month:
          month
      }
    );


  if (error) {

    console.error(
      "CHAMA LIVE: canonical member status error",
      error
    );

    throw new Error(
      `Canonical monthly accounting could not be loaded: ${error.message}`
    );

  }


  monthlyStatus =
    (data || []).map(row => {

      return {

        memberId:
          row.member_id,

        memberNumber:
          row.member_number,

        memberName:
          row.member_name ||
          memberName(row.member_id),

        monthlyDue:
          Number(
            row.monthly_due || 0
          ),

        previousOutstanding:
          Number(
            row.previous_outstanding || 0
          ),

        previousCredit:
          Number(
            row.previous_credit || 0
          ),

        currentMonthPayment:
          Number(
            row.current_month_payment || 0
          ),

        appliedThisMonth:
          Number(
            row.applied_this_month || 0
          ),

        carryForward:
          Number(
            row.carry_forward || 0
          ),

        currentOutstanding:
          Number(
            row.current_outstanding || 0
          ),

        totalPaidToDate:
          Number(
            row.total_paid_to_date || 0
          ),

        totalDueToDate:
          Number(
            row.total_due_to_date || 0
          ),

        status:
          row.status || "outstanding"

      };

    });


  return monthlyStatus;

}


/* =========================================================
   CANONICAL 2B SUMMARY
========================================================= */

async function loadCanonicalSummary(
  month
) {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_canonical_monthly_accounting_summary",
      {
        p_group_id:
          currentGroupId,

        p_month:
          month
      }
    );


  if (error) {

    console.error(
      "CHAMA LIVE: canonical summary error",
      error
    );

    throw new Error(
      `Canonical monthly summary could not be loaded: ${error.message}`
    );

  }


  /*
     Supabase normally returns jsonb
     as an object.

     This also safely handles a JSON string.
  */

  if (
    typeof data ===
    "string"
  ) {

    try {

      canonicalSummary =
        JSON.parse(data);

    }
    catch {

      throw new Error(
        "Canonical monthly summary returned invalid JSON."
      );

    }

  }
  else {

    canonicalSummary =
      data || {};

  }


  return canonicalSummary;

}


/* =========================================================
   LOAD CANONICAL ACCOUNTING
========================================================= */

async function loadCanonicalAccounting() {

  const month =
    getCurrentMonth();


  /*
     Load both canonical endpoints.

     The member-status RPC materializes the
     canonical 2B state before returning it.
  */

  await loadCanonicalMemberStatus(
    month
  );

  await loadCanonicalSummary(
    month
  );


  /*
     Defensive consistency check.

     The canonical summary is authoritative.
     The member list is still used for general
     Dashboard membership display and recent data.
  */

  if (!canonicalSummary) {

    throw new Error(
      "Canonical accounting summary was not returned."
    );

  }


  return {
    month,
    monthlyStatus,
    canonicalSummary
  };

}


/* =========================================================
   LOAD DATA
========================================================= */

async function loadData() {

  showStatus(
    "Loading dashboard..."
  );


  /*
     These remain ordinary read-only Dashboard
     data sources.
  */

  await Promise.all([

    loadMembers(),

    loadContributions(),

    loadExpenses(),

    loadMeetings()

  ]);


  /*
     IMPORTANT:
     Monthly accounting is NO LONGER reconstructed
     from raw contribution records.

     Dashboard now consumes canonical 2B accounting.
  */

  await loadCanonicalAccounting();


  clearError();

}


/* =========================================================
   MONTHLY SUMMARY
========================================================= */

function getMonthlySummary() {

  const month =
    getCurrentMonth();


  const activeMembers =
    members.filter(
      isActiveMember
    );


  /*
     The canonical summary is authoritative.

     Do not reconstruct expected, applied,
     carry-forward, outstanding or collection
     rate from raw contributions here.
  */

  const summary =
    canonicalSummary || {};


  const expected =
    Number(
      summary.expected_monthly_contributions || 0
    );


  const collected =
    Number(
      summary.total_contributions_collected || 0
    );


  const applied =
    Number(
      summary.applied_this_month || 0
    );


  const carryForward =
    Number(
      summary.carry_forward || 0
    );


  const outstanding =
    Number(
      summary.current_outstanding || 0
    );


  const canonicalActiveMembers =
    Number(
      summary.active_members ??
      activeMembers.length
    );


  const membersPaid =
    Number(
      summary.members_paid || 0
    );


  const partialPayments =
    Number(
      summary.partial_payments || 0
    );


  const outstandingMembers =
    Number(
      summary.outstanding_members || 0
    );


  const collectionRate =
    Number(
      summary.collection_rate || 0
    );


  /*
     Preserve the existing Dashboard concept
     of member participation.

     Paid + partial members are members with
     some canonical application for the month.

     If the backend gives an unexpected value,
     fall back to the member-status rows.
  */

  let membersContributed =
    membersPaid +
    partialPayments;


  if (
    membersContributed === 0 &&
    monthlyStatus.length > 0
  ) {

    membersContributed =
      monthlyStatus.filter(
        row =>
          Number(
            row.appliedThisMonth || 0
          ) > 0
      ).length;

  }


  const participation =
    canonicalActiveMembers > 0
      ? (
          membersContributed /
          canonicalActiveMembers
        ) * 100
      : 0;


  return {

    month,

    /*
       Use canonical active-member count for
       financial accounting.

       This should equal the status-based
       active member count for the group.
    */

    activeMembers:
      canonicalActiveMembers,

    /*
       Keep a separately calculated UI membership
       count for diagnostics.

       It is based ONLY on members.status.
    */

    statusActiveMembers:
      activeMembers.length,

    expected,

    actualCurrentMonthCash:
      collected,

    totalContributionsCollected:
      collected,

    appliedThisMonth:
      applied,

    carryForwardCredit:
      carryForward,

    currentOutstanding:
      outstanding,

    membersContributed,

    membersPaid,

    partialPayments,

    outstandingMembers,

    participation,

    collectionRate

  };

}


/* =========================================================
   GROUP BALANCE
========================================================= */

function getGroupBalance() {

  /*
     Cash balance remains a separate cash-accounting
     calculation.

     Opening balance
     + all contributions received
     - approved expenses

     Pending expenses do not reduce cash balance.
  */

  const openingBalance =
    Number(
      currentGroup?.opening_balance || 0
    );


  const totalContributions =
    contributions.reduce(
      (sum, row) =>
        sum +
        Number(
          row.amount || 0
        ),
      0
    );


  const approvedExpenses =
    expenses
      .filter(
        row =>
          String(
            row.approval_status || ""
          )
            .trim()
            .toLowerCase() ===
          "approved"
      )
      .reduce(
        (sum, row) =>
          sum +
          Number(
            row.amount || 0
          ),
        0
      );


  return (
    openingBalance +
    totalContributions -
    approvedExpenses
  );

}


/* =========================================================
   RENDER MAIN SUMMARY
========================================================= */

function renderSummary() {

  const summary =
    getMonthlySummary();


  const balance =
    getGroupBalance();


  /*
     Active Members.

     The financial figure comes from the canonical
     summary.

     The canonical RPC itself uses members.status='active'.
  */

  setText(
    "activeMembers",
    summary.activeMembers
  );


  /*
     Total Members remains the complete members
     collection for the current group.

     Login/onboarding status does not alter this.
  */

  setText(
    "totalMembers",
    `${members.length} total members`
  );


  setText(
    "monthlyExpected",
    money(
      summary.expected
    )
  );


  setText(
    "monthlyApplied",
    money(
      summary.appliedThisMonth
    )
  );


  setText(
    "currentBalance",
    money(balance)
  );


  /*
     Current month label.
  */

  const currentMonthLabel =
    el("currentMonth");

  if (currentMonthLabel) {

    currentMonthLabel.textContent =
      formatMonth(
        summary.month
      );

  }


  /*
     Canonical collection rate.
  */

  const percentage =
    Math.max(
      0,
      Math.min(
        Number(
          summary.collectionRate || 0
        ),
        100
      )
    );


  setText(
    "collectionRate",
    `${Math.round(
      percentage
    )}%`
  );


  setText(
    "monthlyCollected",
    `${money(
      summary.appliedThisMonth
    )} / ${money(
      summary.expected
    )}`
  );


  setText(
    "membersContributed",
    `${summary.membersContributed} / ${summary.activeMembers}`
  );


  setText(
    "memberParticipation",
    `${Math.round(
      summary.participation
    )}%`
  );


  setText(
    "currentOutstanding",
    money(
      summary.currentOutstanding
    )
  );


  setText(
    "appliedThisMonth",
    money(
      summary.appliedThisMonth
    )
  );


  setText(
    "carryForwardCredit",
    money(
      summary.carryForwardCredit
    )
  );


  setText(
    "outstandingAmount",
    money(
      summary.currentOutstanding
    )
  );


  /*
     Progress bars.
  */

  document
    .querySelectorAll(
      "[data-contribution-progress]"
    )
    .forEach(element => {

      element.style.width =
        `${percentage}%`;

    });


  /*
     Balance styling.
  */

  const balanceElement =
    el("currentBalance");

  if (balanceElement) {

    balanceElement.classList.remove(
      "positive",
      "negative",
      "amount-positive",
      "amount-negative"
    );


    if (balance < 0) {

      balanceElement.classList.add(
        "negative"
      );

      balanceElement.classList.add(
        "amount-negative"
      );

    }
    else {

      balanceElement.classList.add(
        "positive"
      );

      balanceElement.classList.add(
        "amount-positive"
      );

    }

  }

}


/* =========================================================
   RENDER MEMBER STATUS
========================================================= */

function renderMemberStatus() {

  const container =
    el(
      "contributionStatusRows"
    );


  if (!container) {
    return;
  }


  if (!monthlyStatus.length) {

    container.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <strong>No active members</strong>
            <span>
              No active members were found for this group.
            </span>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  container.innerHTML =
    monthlyStatus
      .map(row => {

        const statusClass =
          String(
            row.status || ""
          )
            .toLowerCase()
            .replace(
              /\s+/g,
              "-"
            );


        return `
          <tr>

            <td>
              <strong>
                ${escapeHtml(
                  row.memberName
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                money(
                  row.monthlyDue
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                money(
                  row.previousOutstanding
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                money(
                  row.appliedThisMonth
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                money(
                  row.carryForward
                )
              )}
            </td>

            <td>
              <strong>
                ${escapeHtml(
                  money(
                    row.currentOutstanding
                  )
                )}
              </strong>
            </td>

            <td>
              <span
                class="status-badge status-${escapeHtml(
                  statusClass
                )}"
              >
                ${escapeHtml(
                  row.status
                )}
              </span>
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   RECENT CONTRIBUTIONS
========================================================= */

function renderRecentContributions() {

  const container =
    el(
      "recentContributionRows"
    );


  if (!container) {
    return;
  }


  const rows =
    contributions
      .slice()
      .sort(
        (a, b) =>
          normalizeDate(
            b.contribution_date
          )
          .localeCompare(
            normalizeDate(
              a.contribution_date
            )
          )
      )
      .slice(
        0,
        5
      );


  if (!rows.length) {

    container.innerHTML = `
      <tr>
        <td colspan="3">
          <div class="empty-state">
            <strong>No contributions yet</strong>
            <span>
              Recent contributions will appear here.
            </span>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  container.innerHTML =
    rows
      .map(row => {

        return `
          <tr>

            <td>
              <strong>
                ${escapeHtml(
                  memberName(
                    row.member_id
                  )
                )}
              </strong>
            </td>

            <td>
              <strong class="money-value">
                ${escapeHtml(
                  money(
                    row.amount
                  )
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                formatDate(
                  row.contribution_date
                )
              )}
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   EXPENSE STATUS
========================================================= */

function normalizeExpenseStatus(
  expense
) {

  return String(
    expense?.approval_status || ""
  )
    .trim()
    .toLowerCase();

}


/* =========================================================
   RECENT EXPENSES
========================================================= */

function renderRecentExpenses() {

  const container =
    el(
      "recentExpenseRows"
    );


  if (!container) {
    return;
  }


  const rows =
    expenses
      .slice()
      .sort(
        (a, b) =>
          normalizeDate(
            b.date
          )
          .localeCompare(
            normalizeDate(
              a.date
            )
          )
      )
      .slice(
        0,
        5
      );


  if (!rows.length) {

    container.innerHTML = `
      <tr>
        <td colspan="3">
          <div class="empty-state">
            <strong>No expenses yet</strong>
            <span>
              Recent expenses will appear here.
            </span>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  container.innerHTML =
    rows
      .map(row => {

        return `
          <tr>

            <td>
              <strong>
                ${escapeHtml(
                  row.description ||
                  "Expense"
                )}
              </strong>
            </td>

            <td>
              <strong class="money-value">
                ${escapeHtml(
                  money(
                    row.amount
                  )
                )}
              </strong>
            </td>

            <td>
              <span
                class="status-badge status-${escapeHtml(
                  normalizeExpenseStatus(row) ||
                  "unknown"
                )}"
              >
                ${escapeHtml(
                  row.approval_status ||
                  "Unknown"
                )}
              </span>
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   UPCOMING MEETINGS
========================================================= */

function renderUpcomingMeetings() {

  const container =
    el(
      "upcomingMeetingRows"
    );


  if (!container) {
    return;
  }


  const today =
    getToday();


  const rows =
    meetings
      .filter(
        meeting =>
          normalizeDate(
            meeting.date
          ) >= today
      )
      .sort(
        (a, b) =>
          normalizeDate(
            a.date
          )
          .localeCompare(
            normalizeDate(
              b.date
            )
          )
      )
      .slice(
        0,
        5
      );


  if (!rows.length) {

    container.innerHTML = `
      <tr>
        <td colspan="4">
          <div class="empty-state">
            <strong>No upcoming meetings.</strong>
            <span>
              Scheduled meetings will appear here.
            </span>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  container.innerHTML =
    rows
      .map(row => {

        return `
          <tr>

            <td>
              ${escapeHtml(
                formatDate(
                  row.date
                )
              )}
            </td>

            <td>
              <strong>
                ${escapeHtml(
                  row.title ||
                  "Meeting"
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                row.venue ||
                "—"
              )}
            </td>

            <td>
              <span class="status-badge">
                ${escapeHtml(
                  row.status ||
                  "Upcoming"
                )}
              </span>
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =========================================================
   FALLBACK SELECTORS
========================================================= */

function renderUsingFallbackIds() {

  const summary =
    getMonthlySummary();


  const balance =
    getGroupBalance();


  const idMap = {

    activeMembers:
      summary.activeMembers,

    monthlyExpected:
      money(
        summary.expected
      ),

    monthlyApplied:
      money(
        summary.appliedThisMonth
      ),

    currentBalance:
      money(balance),

    collectionRate:
      `${Math.round(
        summary.collectionRate
      )}%`,

    monthlyCollected:
      `${money(
        summary.appliedThisMonth
      )} / ${money(
        summary.expected
      )}`,

    membersContributed:
      `${summary.membersContributed} / ${summary.activeMembers}`,

    memberParticipation:
      `${Math.round(
        summary.participation
      )}%`,

    currentOutstanding:
      money(
        summary.currentOutstanding
      ),

    appliedThisMonth:
      money(
        summary.appliedThisMonth
      ),

    carryForwardCredit:
      money(
        summary.carryForwardCredit
      ),

    outstandingAmount:
      money(
        summary.currentOutstanding
      )

  };


  Object.entries(
    idMap
  ).forEach(
    ([id, value]) =>
      setText(
        id,
        value
      )
  );

}


/* =========================================================
   RENDER DASHBOARD
========================================================= */

function renderDashboard() {

  renderSummary();

  renderMemberStatus();

  renderRecentContributions();

  renderRecentExpenses();

  renderUpcomingMeetings();

  renderUsingFallbackIds();

}


/* =========================================================
   INITIALIZATION
========================================================= */

export async function initDashboard() {

  if (initialized) {
    return;
  }


  initialized =
    true;


  try {

    clearError();

    showStatus(
      "Loading dashboard..."
    );


    await loadContext();

    await loadData();

    renderDashboard();


    showStatus(
      "Dashboard loaded."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      1500
    );


    console.log(
      "CHAMA LIVE: Dashboard initialized",
      {

        userId:
          currentUser?.id,

        memberId:
          currentMember?.id,

        groupId:
          currentGroupId,

        groupName:
          currentGroup?.name,

        members:
          members.length,

        activeMembers:
          members.filter(
            isActiveMember
          ).length,

        contributions:
          contributions.length,

        expenses:
          expenses.length,

        meetings:
          meetings.length,

        monthlyStatus:
          monthlyStatus.length,

        canonicalSummary

      }
    );

  }
  catch (error) {

    initialized =
      false;

    showError(
      error
    );

  }

}


/* =========================================================
   REFRESH
========================================================= */

export async function refreshDashboard() {

  try {

    clearError();


    if (!currentGroupId) {

      await loadContext();

    }


    await loadData();

    renderDashboard();


    showStatus(
      "Dashboard refreshed."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      1200
    );

  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =========================================================
   AUTO BOOT
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      initDashboard();

    },
    {
      once: true
    }
  );

}
else {

  initDashboard();

}


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: dashboard module ready"
);
