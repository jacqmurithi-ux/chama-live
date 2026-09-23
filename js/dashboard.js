/* =========================================================
   CHAMA LIVE — DASHBOARD
   RECONCILED CANONICAL 2B VERSION

   FRONTEND-ONLY VERSION
   ---------------------------------------------------------
   DATABASE:
       NO INSERT
       NO UPDATE
       NO DELETE
       NO SQL
       NO MIGRATION
       NO RLS CHANGE

   AUTH / GROUP:
       getMyApplicationContext()

   MEMBERSHIP RULE:
       members.status controls membership accounting.

       onboarding_status is NOT used to determine whether
       a member is financially active.

   CANONICAL MONTHLY ACCOUNTING:
       get_canonical_member_monthly_status()
       get_canonical_monthly_accounting_summary()

   CANONICAL CUMULATIVE ACCOUNTING:
       get_member_contribution_position()

       IMPORTANT:
       Cumulative position is kept separate from the
       monthly accounting contract.

   CANONICAL CHAIN:
       Obligation
           ↓
       Payment
           ↓
       Allocation
           ↓
       Monthly / Cumulative accounting status

   OPERATIONS SNAPSHOT:
       Read-only counts for:
       - Support & Welfare
       - Plans
       - Activities
       - Milestones
       - Assets
       - Contribution Goals

   IMPORTANT:
       layout.js is the page bootloader.

       Therefore this module does NOT auto-run
       initDashboard() at the bottom.

   EXPORTS:
       initDashboard()
       refreshDashboard()
========================================================= */

import {
  supabase
} from "./supabase.js";

import {
  getMyApplicationContext
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

let supportCases = [];
let plans = [];
let activities = [];
let milestones = [];
let assets = [];
let contributionGoals = [];

let monthlyStatus = [];
let canonicalSummary = null;

/*
   Cumulative accounting is intentionally kept separate
   from monthlyStatus and canonicalSummary.

   cumulativePositions contains one canonical position
   per active member:

       total_due
       total_allocated
       arrears
       credit
       status
*/
let cumulativePositions = [];
let cumulativePositionsComplete = false;

let initialized = false;


/* =========================================================
   DOM HELPERS
========================================================= */

function el(id) {

  return document.getElementById(
    id
  );

}


function setText(id, value) {

  const element =
    el(id);

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
   NUMBER
========================================================= */

function numberValue(value) {

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
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
   STATUS
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


function clearStatus() {

  const element =
    el("status");

  if (!element) {
    return;
  }

  element.hidden =
    true;

  element.textContent =
    "";

}


/* =========================================================
   ERROR
========================================================= */

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

  if (!errorElement) {
    return;
  }

  errorElement.hidden =
    true;

  errorElement.textContent =
    "";

}


/* =========================================================
   DATE HELPERS
========================================================= */

function normalizeDate(value) {

  if (!value) {
    return "";
  }

  return String(value)
    .substring(
      0,
      10
    );

}


function getToday() {

  const date =
    new Date();

  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    ),

    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    )

  ].join("-");

}


function getCurrentMonth() {

  return getToday()
    .substring(
      0,
      7
    );

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

  const context =
    await getMyApplicationContext();

  if (!context) {

    throw new Error(
      "Your authenticated group context could not be loaded."
    );

  }


  currentUser =
    context.user ||
    null;


  currentMember =
    context.member ||
    null;


  currentGroup =
    context.group ||
    null;


  if (!currentUser) {

    throw new Error(
      "You are not signed in."
    );

  }


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


/* =========================================================
   RENDER GROUP / USER CONTEXT
========================================================= */

function renderContext() {

  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(
      element => {

        element.textContent =
          currentGroup?.name ||
          "CHAMA";

      }
    );


  document
    .querySelectorAll(
      "[data-user-name]"
    )
    .forEach(
      element => {

        element.textContent =
          currentMember?.name ||
          "Member";

      }
    );

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
   LOAD SUPPORT & WELFARE
========================================================= */

async function loadSupportCases() {

  const {
    count,
    error
  } =
    await supabase
      .from("group_support_cases")
      .select("id", {
        count: "exact",
        head: true
      })
      .eq(
        "group_id",
        currentGroupId
      );


  if (error) {
    throw error;
  }


  supportCases =
    Number.isFinite(count)
      ? count
      : 0;

}


/* =========================================================
   LOAD PLANS
========================================================= */

async function loadPlans() {

  const {
    count,
    error
  } =
    await supabase
      .from("group_plans")
      .select("id", {
        count: "exact",
        head: true
      })
      .eq(
        "group_id",
        currentGroupId
      );


  if (error) {
    throw error;
  }


  plans =
    Number.isFinite(count)
      ? count
      : 0;

}


/* =========================================================
   LOAD ACTIVITIES
========================================================= */

async function loadActivities() {

  const {
    count,
    error
  } =
    await supabase
      .from("group_activities")
      .select("id", {
        count: "exact",
        head: true
      })
      .eq(
        "group_id",
        currentGroupId
      );


  if (error) {
    throw error;
  }


  activities =
    Number.isFinite(count)
      ? count
      : 0;

}


/* =========================================================
   LOAD MILESTONES
========================================================= */

async function loadMilestones() {

  const {
    count,
    error
  } =
    await supabase
      .from("group_milestones")
      .select("id", {
        count: "exact",
        head: true
      })
      .eq(
        "group_id",
        currentGroupId
      );


  if (error) {
    throw error;
  }


  milestones =
    Number.isFinite(count)
      ? count
      : 0;

}


/* =========================================================
   LOAD ASSETS
========================================================= */

async function loadAssets() {

  const {
    count,
    error
  } =
    await supabase
      .from("group_assets")
      .select("id", {
        count: "exact",
        head: true
      })
      .eq(
        "group_id",
        currentGroupId
      );


  if (error) {
    throw error;
  }


  assets =
    Number.isFinite(count)
      ? count
      : 0;

}


/* =========================================================
   LOAD CONTRIBUTION GOALS
========================================================= */

async function loadContributionGoals() {

  const {
    count,
    error
  } =
    await supabase
      .from("contribution_goals")
      .select("id", {
        count: "exact",
        head: true
      })
      .eq(
        "group_id",
        currentGroupId
      );


  if (error) {
    throw error;
  }


  contributionGoals =
    Number.isFinite(count)
      ? count
      : 0;

}


/* =========================================================
   ACTIVE MEMBER RULE
=========================================================

   THIS IS THE ONLY MEMBERSHIP RULE USED BY DASHBOARD.

   ACTIVE:
       status is NOT inactive
       status is NOT suspended
       status is NOT removed

   IMPORTANT:
       onboarding_status is ignored.

   Therefore:

       status=active
       onboarding_status=pending

   remains an active chama member.

   Login status is separate from financial membership.
========================================================= */

function isActiveMember(member) {

  const status =
    String(
      member?.status || ""
    )
      .trim()
      .toLowerCase();


  return ![
    "inactive",
    "suspended",
    "removed"
  ].includes(status);

}


/* =========================================================
   ACTIVE MEMBERS
========================================================= */

function getActiveMembers() {

  return members.filter(
    isActiveMember
  );

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
   CANONICAL MEMBER MONTHLY STATUS
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
      "CHAMA LIVE: canonical member status RPC failed",
      error
    );

    throw new Error(
      `Canonical monthly accounting could not be loaded: ${error.message}`
    );

  }


  monthlyStatus =
    (data || []).map(
      row => {

        return {

          memberId:
            row.member_id,

          memberNumber:
            row.member_number,

          memberName:
            row.member_name ||
            memberName(
              row.member_id
            ),

          monthlyDue:
            numberValue(
              row.monthly_due
            ),

          previousOutstanding:
            numberValue(
              row.previous_outstanding
            ),

          previousCredit:
            numberValue(
              row.previous_credit
            ),

          currentMonthPayment:
            numberValue(
              row.current_month_payment
            ),

          appliedThisMonth:
            numberValue(
              row.applied_this_month
            ),

          carryForward:
            numberValue(
              row.carry_forward
            ),

          currentOutstanding:
            numberValue(
              row.current_outstanding
            ),

          totalPaidToDate:
            numberValue(
              row.total_paid_to_date
            ),

          totalDueToDate:
            numberValue(
              row.total_due_to_date
            ),

          status:
            row.status ||
            "outstanding"

        };

      }
    );


  return monthlyStatus;

}


/* =========================================================
   CANONICAL MONTHLY SUMMARY
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
      "CHAMA LIVE: canonical summary RPC failed",
      error
    );

    throw new Error(
      `Canonical monthly summary could not be loaded: ${error.message}`
    );

  }


  if (
    typeof data ===
    "string"
  ) {

    try {

      canonicalSummary =
        JSON.parse(
          data
        );

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
   CANONICAL CUMULATIVE MEMBER POSITION
=========================================================

   IMPORTANT:

   This RPC is deliberately separate from the monthly
   accounting contract.

   It returns cumulative position:

       total_due
       total_allocated
       arrears
       credit
       status

   Status precedence is defined by the canonical RPC:

       ARREARS
       CREDIT
       UP_TO_DATE

   We do not infer cumulative status from monthly fields.
========================================================= */

async function loadCumulativePosition(
  memberId
) {

  if (!memberId) {

    throw new Error(
      "Cumulative accounting requires a member ID."
    );

  }


  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_member_contribution_position",
      {
        p_member_id:
          memberId
      }
    );


  if (error) {

    console.error(
      "CHAMA LIVE: cumulative member position RPC failed",
      {
        memberId,
        error
      }
    );

    throw new Error(
      `Cumulative member accounting could not be loaded: ${error.message}`
    );

  }


  /*
     Supabase can return a table-valued RPC as an array.

     The canonical function returns one position for the
     supplied member, so normalize both array and object
     responses defensively.
  */

  const row =
    Array.isArray(data)
      ? data[0]
      : data;


  if (!row) {

    throw new Error(
      "Cumulative member accounting returned no position."
    );

  }


  return {

    memberId:
      row.member_id ||
      memberId,

    groupId:
      row.group_id ||
      null,

    totalDue:
      numberValue(
        row.total_due
      ),

    totalAllocated:
      numberValue(
        row.total_allocated
      ),

    arrears:
      numberValue(
        row.arrears
      ),

    credit:
      numberValue(
        row.credit
      ),

    status:
      normalizeCumulativeStatus(
        row.status
      )

  };

}


/* =========================================================
   CUMULATIVE STATUS NORMALIZATION
========================================================= */

function normalizeCumulativeStatus(
  value
) {

  const status =
    String(
      value || ""
    )
      .trim()
      .toUpperCase()
      .replace(
        /\s+/g,
        "_"
      );


  if (
    status ===
    "ARREARS"
  ) {

    return "ARREARS";

  }


  if (
    status ===
    "CREDIT"
  ) {

    return "CREDIT";

  }


  if (
    status ===
    "UP_TO_DATE" ||
    status ===
    "UPTODATE"
  ) {

    return "UP_TO_DATE";

  }


  /*
     Do not invent a cumulative state.

     The canonical function should normally return one
     of the three documented values. If it returns an
     unexpected value, preserve the data as UP_TO_DATE
     only when there is no arrears or credit amount.

     Otherwise derive the only state supported by the
     canonical amounts.
  */

  return "UP_TO_DATE";

}


/* =========================================================
   LOAD CUMULATIVE POSITIONS
=========================================================

   IMPORTANT:

   Promise.all() is intentional.

   If any active-member cumulative read fails, the entire
   cumulative load fails rather than displaying a partial
   distribution as though it were complete.
========================================================= */

async function loadCumulativePositions() {

  cumulativePositions = [];
  cumulativePositionsComplete = false;


  const activeMembers =
    getActiveMembers();


  if (!activeMembers.length) {

    cumulativePositionsComplete =
      true;

    return [];

  }


  const results =
    await Promise.all(
      activeMembers.map(
        member =>
          loadCumulativePosition(
            member.id
          )
      )
    );


  /*
     Verify that every returned position belongs to the
     current group before accepting the complete result.

     The RPC itself is authoritative, but this additional
     client-side boundary prevents accidental rendering of
     a row returned for a different group.
  */

  const invalidResult =
    results.find(
      position =>
        position.groupId &&
        String(
          position.groupId
        ) !==
        String(
          currentGroupId
        )
    );


  if (invalidResult) {

    throw new Error(
      "Cumulative accounting returned a position outside the current group."
    );

  }


  cumulativePositions =
    results;


  cumulativePositionsComplete =
    results.length ===
    activeMembers.length;


  if (
    !cumulativePositionsComplete
  ) {

    throw new Error(
      "Cumulative accounting could not be fully loaded."
    );

  }


  return cumulativePositions;

}


/* =========================================================
   CANONICAL ACCOUNTING
========================================================= */

async function loadCanonicalAccounting() {

  const month =
    getCurrentMonth();


  /*
     Canonical member status first.

     This is the authoritative member-level
     obligation/payment/allocation/monthly status.
  */

  await loadCanonicalMemberStatus(
    month
  );


  /*
     Canonical group summary.

     This is the authoritative monthly aggregate state.
  */

  await loadCanonicalSummary(
    month
  );


  if (!canonicalSummary) {

    throw new Error(
      "Canonical accounting summary was not returned."
    );

  }


  /*
     Cumulative position is loaded independently from
     monthly accounting.

     It must never be synthesized from previous_outstanding,
     carry_forward or monthly status.
  */

  await loadCumulativePositions();


  return {
    month,
    monthlyStatus,
    canonicalSummary,
    cumulativePositions
  };

}


/* =========================================================
   LOAD ALL DATA
========================================================= */

async function loadData() {

  await Promise.all([
    loadMembers(),
    loadContributions(),
    loadExpenses(),
    loadMeetings(),
    loadSupportCases(),
    loadPlans(),
    loadActivities(),
    loadMilestones(),
    loadAssets(),
    loadContributionGoals()
  ]);

  await loadCanonicalAccounting();

}


/* =========================================================
   CANONICAL SUMMARY NORMALIZATION
========================================================= */

function getMonthlySummary() {

  const activeMembers =
    getActiveMembers();


  const summary =
    canonicalSummary || {};


  const expected =
    numberValue(
      summary.expected_monthly_contributions
    );


  const collected =
    numberValue(
      summary.total_contributions_collected
    );


  const applied =
    numberValue(
      summary.applied_this_month
    );


  const carryForward =
    numberValue(
      summary.carry_forward
    );


  const outstanding =
    numberValue(
      summary.current_outstanding
    );


  const canonicalActiveMembers =
    Number.isFinite(
      Number(
        summary.active_members
      )
    )
      ? Number(
          summary.active_members
        )
      : activeMembers.length;


  let membersPaid =
    numberValue(
      summary.members_paid
    );


  let partialPayments =
    numberValue(
      summary.partial_payments
    );


  let outstandingMembers =
    numberValue(
      summary.outstanding_members
    );


  if (
    membersPaid === 0 &&
    partialPayments === 0 &&
    monthlyStatus.length > 0
  ) {

    membersPaid =
      monthlyStatus.filter(
        row =>
          String(
            row.status || ""
          )
            .trim()
            .toLowerCase() ===
          "paid"
      ).length;


    partialPayments =
      monthlyStatus.filter(
        row =>
          String(
            row.status || ""
          )
            .trim()
            .toLowerCase() ===
          "partial"
      ).length;


    outstandingMembers =
      monthlyStatus.filter(
        row =>
          numberValue(
            row.currentOutstanding
          ) > 0
      ).length;

  }


  const contributors =
    membersPaid +
    partialPayments;


  const participation =
    canonicalActiveMembers > 0
      ? (
          contributors /
          canonicalActiveMembers
        ) * 100
      : 0;


  let collectionRate =
    Number(
      summary.collection_rate
    );


  if (
    !Number.isFinite(
      collectionRate
    )
  ) {

    collectionRate =
      expected > 0
        ? (
            applied /
            expected
          ) * 100
        : 0;

  }


  return {

    month:
      getCurrentMonth(),

    activeMembers:
      canonicalActiveMembers,

    statusActiveMembers:
      activeMembers.length,

    expected,

    collected,

    applied,

    carryForward,

    outstanding,

    membersPaid,

    partialPayments,

    outstandingMembers,

    contributors,

    participation,

    collectionRate

  };

}


/* =========================================================
   CASH BALANCE
=========================================================

   IMPORTANT ACCOUNTING DISTINCTION:

   Cash balance:
       opening balance
       + all cash contributions received
       - approved expenses

   Monthly obligation accounting:
       canonical 2B RPC

   Cumulative member position:
       canonical cumulative RPC

   These are different calculations.
========================================================= */

function getGroupBalance() {

  const openingBalance =
    numberValue(
      currentGroup?.opening_balance
    );


  const totalContributions =
    contributions.reduce(
      (
        sum,
        contribution
      ) =>
        sum +
        numberValue(
          contribution.amount
        ),
      0
    );


  const approvedExpenses =
    expenses
      .filter(
        expense =>
          String(
            expense?.approval_status || ""
          )
            .trim()
            .toLowerCase() ===
          "approved"
      )
      .reduce(
        (
          sum,
          expense
        ) =>
          sum +
          numberValue(
            expense.amount
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
   RENDER MAIN METRICS
========================================================= */

function renderSummary() {

  const summary =
    getMonthlySummary();


  const balance =
    getGroupBalance();


  setText(
    "membersCount",
    `${members.length} members`
  );


  setText(
    "activeMembers",
    summary.activeMembers
  );


  setText(
    "monthlyExpected",
    money(
      summary.expected
    )
  );


  setText(
    "currentBalance",
    money(
      balance
    )
  );


  setText(
    "monthlyCollected",
    money(
      summary.applied
    )
  );


  const percentage =
    Math.max(
      0,
      Math.min(
        100,
        Number(
          summary.collectionRate || 0
        )
      )
    );


  setText(
    "progressMonth",
    formatMonth(
      summary.month
    )
  );


  setText(
    "progressPercentage",
    `${Math.round(
      percentage
    )}%`
  );


  setText(
    "progressText",
    `${money(
      summary.applied
    )} of ${money(
      summary.expected
    )}`
  );


  const progressBar =
    el("progressBar");


  if (progressBar) {

    progressBar.style.width =
      `${percentage}%`;

    progressBar.setAttribute(
      "aria-valuenow",
      String(
        Math.round(
          percentage
        )
      )
    );

  }


  setText(
    "contributorsCount",
    summary.contributors
  );


  setText(
    "contributorsPercentage",
    `${Math.round(
      summary.participation
    )}%`
  );


  setText(
    "monthlyOutstanding",
    money(
      summary.outstanding
    )
  );


  setText(
    "progressApplied",
    money(
      summary.applied
    )
  );


  setText(
    "progressCarryForward",
    money(
      summary.carryForward
    )
  );


  setText(
    "progressOutstanding",
    money(
      summary.outstanding
    )
  );


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
   MEMBER STATUS TABLE
========================================================= */

function renderMemberStatus() {

  const container =
    el("memberStatusRows");


  if (!container) {

    console.warn(
      "CHAMA LIVE: #memberStatusRows not found."
    );

    return;

  }


  if (!monthlyStatus.length) {

    container.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <strong>No active members</strong>
            <span>
              No canonical member accounting rows were returned.
            </span>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  container.innerHTML =
    monthlyStatus
      .map(
        row => {

          const status =
            String(
              row.status ||
              "outstanding"
            )
              .trim()
              .toLowerCase();


          const statusClass =
            status.replace(
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
                    row.status ||
                    "Outstanding"
                  )}
                </span>
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   CUMULATIVE POSITION SUMMARY
========================================================= */

function getCumulativeSummary() {

  if (
    !cumulativePositionsComplete
  ) {

    return {
      complete: false,
      totalMembers: 0,
      upToDateCount: 0,
      arrearsCount: 0,
      creditCount: 0,
      arrearsAmount: 0,
      creditAmount: 0
    };

  }


  const positions =
    cumulativePositions || [];


  let upToDateCount = 0;
  let arrearsCount = 0;
  let creditCount = 0;

  let arrearsAmount = 0;
  let creditAmount = 0;


  positions.forEach(
    position => {

      const status =
        normalizeCumulativeStatus(
          position.status
        );


      if (
        status ===
        "ARREARS"
      ) {

        arrearsCount += 1;

        arrearsAmount +=
          numberValue(
            position.arrears
          );

      }
      else if (
        status ===
        "CREDIT"
      ) {

        creditCount += 1;

        creditAmount +=
          numberValue(
            position.credit
          );

      }
      else {

        upToDateCount += 1;

      }

    }
  );


  return {

    complete: true,

    totalMembers:
      positions.length,

    upToDateCount,

    arrearsCount,

    creditCount,

    arrearsAmount,

    creditAmount

  };

}


/* =========================================================
   CUMULATIVE STATUS LABEL
========================================================= */

function cumulativeStatusLabel(
  status
) {

  switch (
    normalizeCumulativeStatus(
      status
    )
  ) {

    case "ARREARS":
      return "Arrears";

    case "CREDIT":
      return "Credit";

    case "UP_TO_DATE":
      return "Up to date";

    default:
      return "Up to date";

  }

}


/* =========================================================
   CUMULATIVE STATUS CLASS
========================================================= */

function cumulativeStatusClass(
  status
) {

  switch (
    normalizeCumulativeStatus(
      status
    )
  ) {

    case "ARREARS":
      return "status-outstanding";

    case "CREDIT":
      return "status-paid";

    case "UP_TO_DATE":
      return "status-active";

    default:
      return "status-active";

  }

}


/* =========================================================
   RENDER CUMULATIVE POSITION
========================================================= */

function renderCumulativePosition() {

  /*
     Summary cards are optional until the corresponding
     dashboard HTML is added.

     Therefore this renderer is safe against the current
     HTML while preparing the exact IDs for the reconciled
     candidate HTML.
  */

  const summary =
    getCumulativeSummary();


  setText(
    "cumulativeUpToDateCount",
    summary.complete
      ? summary.upToDateCount
      : "—"
  );


  setText(
    "cumulativeArrearsCount",
    summary.complete
      ? summary.arrearsCount
      : "—"
  );


  setText(
    "cumulativeCreditCount",
    summary.complete
      ? summary.creditCount
      : "—"
  );


  setText(
    "cumulativeArrearsAmount",
    summary.complete
      ? money(
          summary.arrearsAmount
        )
      : "—"
  );


  setText(
    "cumulativeCreditAmount",
    summary.complete
      ? money(
          summary.creditAmount
        )
      : "—"
  );


  const container =
    el(
      "cumulativePositionRows"
    );


  if (!container) {
    return;
  }


  if (
    !summary.complete
  ) {

    container.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            <strong>
              Cumulative position unavailable
            </strong>
            <span>
              The complete cumulative accounting set
              could not be loaded.
            </span>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  if (
    !cumulativePositions.length
  ) {

    container.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            <strong>
              No active members
            </strong>
            <span>
              No cumulative accounting positions were returned.
            </span>
          </div>
        </td>
      </tr>
    `;

    return;

  }


  const positions =
    cumulativePositions
      .slice()
      .sort(
        (
          a,
          b
        ) =>
          memberName(
            a.memberId
          ).localeCompare(
            memberName(
              b.memberId
            )
          )
      );


  container.innerHTML =
    positions
      .map(
        position => {

          const status =
            normalizeCumulativeStatus(
              position.status
            );


          const statusClass =
            cumulativeStatusClass(
              status
            );


          return `
            <tr>

              <td>
                <strong>
                  ${escapeHtml(
                    memberName(
                      position.memberId
                    )
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  money(
                    position.totalDue
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(
                    position.totalAllocated
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  status === "ARREARS"
                    ? money(
                        position.arrears
                      )
                    : status === "CREDIT"
                      ? money(
                          position.credit
                        )
                      : money(0)
                )}
              </td>

              <td>
                <span
                  class="status-badge ${escapeHtml(
                    statusClass
                  )}"
                >
                  ${escapeHtml(
                    cumulativeStatusLabel(
                      status
                    )
                  )}
                </span>
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

function renderRecentContributions() {

  const container =
    el(
      "recentContributionRows"
    );


  if (!container) {

    console.warn(
      "CHAMA LIVE: #recentContributionRows not found."
    );

    return;

  }


  const rows =
    contributions
      .slice()
      .sort(
        (
          a,
          b
        ) =>
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
        <td colspan="4">
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
      .map(
        row => {

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
                <strong>
                  ${escapeHtml(
                    money(
                      row.amount
                    )
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  row.contribution_type ||
                  "Contribution"
                )}
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

        }
      )
      .join("");

}


/* =========================================================
   EXPENSE STATUS
========================================================= */

function expenseStatus(expense) {

  return String(
    expense?.approval_status ||
    ""
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

    console.warn(
      "CHAMA LIVE: #recentExpenseRows not found."
    );

    return;

  }


  const rows =
    expenses
      .slice()
      .sort(
        (
          a,
          b
        ) =>
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
        <td colspan="4">
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
      .map(
        row => {

          const status =
            expenseStatus(
              row
            );


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
                ${escapeHtml(
                  money(
                    row.amount
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  row.category ||
                  "—"
                )}
              </td>

              <td>
                <span
                  class="status-badge status-${escapeHtml(
                    status ||
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

        }
      )
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

    console.warn(
      "CHAMA LIVE: #upcomingMeetingRows not found."
    );

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
        (
          a,
          b
        ) =>
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
      .map(
        row => {

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

        }
      )
      .join("");

}


/* =========================================================
   OPERATIONS SNAPSHOT
========================================================= */

function renderOperationsSnapshot() {

  setText(
    "operationsSupportCases",
    supportCases
  );


  setText(
    "operationsPlans",
    plans
  );


  setText(
    "operationsActivities",
    activities
  );


  setText(
    "operationsMilestones",
    milestones
  );


  setText(
    "operationsAssets",
    assets
  );


  setText(
    "operationsContributionGoals",
    contributionGoals
  );

}


/* =========================================================
   RENDER DASHBOARD
========================================================= */

function renderDashboard() {

  renderSummary();

  renderMemberStatus();

  renderCumulativePosition();

  renderRecentContributions();

  renderRecentExpenses();

  renderUpcomingMeetings();

  renderOperationsSnapshot();

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initDashboard() {

  /*
     layout.js owns initialization.

     This guard prevents accidental duplicate
     initialization if layout.js invokes the
     function more than once.
  */

  if (initialized) {

    console.log(
      "CHAMA LIVE: Dashboard already initialized."
    );

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


    clearStatus();


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

        totalMembers:
          members.length,

        activeMembers:
          getActiveMembers().length,

        canonicalRows:
          monthlyStatus.length,

        cumulativeRows:
          cumulativePositions.length,

        cumulativePositionsComplete:
          cumulativePositionsComplete,

        canonicalSummary:
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
   REFRESH DASHBOARD
========================================================= */

export async function refreshDashboard() {

  try {

    clearError();

    showStatus(
      "Refreshing dashboard..."
    );


    /*
       Revalidate context if necessary.
    */

    if (!currentGroupId) {

      await loadContext();

    }


    await loadData();

    renderDashboard();


    clearStatus();


    console.log(
      "CHAMA LIVE: Dashboard refreshed",
      {
        cumulativeRows:
          cumulativePositions.length,

        cumulativePositionsComplete:
          cumulativePositionsComplete
      }
    );

  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =========================================================
   NO AUTO-BOOT HERE
=========================================================

   IMPORTANT:

   dashboard.html
       ↓
   layout.js
       ↓
   dynamic import("./dashboard.js")
       ↓
   initDashboard()

   Therefore DO NOT add:

       DOMContentLoaded
       initDashboard()

   here.

   layout.js is the sole page bootloader.
========================================================= */

console.log(
  "CHAMA LIVE: dashboard module ready"
);
