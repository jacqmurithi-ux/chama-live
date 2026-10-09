/* =========================================================
   CHAMA LIVE — REPORTS
   CANONICAL READ-ONLY REPORTING + VISUAL INSIGHTS
   =========================================================

   ARCHITECTURE
   ------------
   • reports.html remains unchanged.
   • admin-layout.js remains the page boot owner.
   • reports.js exports initPage().
   • No auto-run.
   • No direct accounting writes.
   • No direct writes to:
       contributions
       contribution_allocations
       contribution_obligations

   CANONICAL ACCOUNTING
   --------------------
   Monthly:
     get_canonical_member_monthly_status()
     get_canonical_monthly_accounting_summary()

   Cumulative:
     get_member_contribution_position()

   IMPORTANT
   ---------
   JavaScript does NOT reconstruct authoritative accounting.
   Visuals use the same canonical RPC results already used
   by the report tables.

   ========================================================= */

/* =========================================================
   IMPORTS
   ========================================================= */

import { supabase } from "./supabase.js";
import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";

/* =========================================================
   CONSTANTS
   ========================================================= */

const PAGE_NAME = "Reports";

const VISUALS_ID = "reportVisualInsights";
const VISUAL_STYLE_ID = "reportVisualInsightsStyles";

const DEFAULT_PERIOD_PRESET = "this-month";
const DEFAULT_REPORT_TYPE = "executive";

const REPORT_TYPE_LABELS = {
  executive: "Executive Summary",
  "member-contributions": "Member Contributions",
  arrears: "Monthly Arrears",
  "cumulative-arrears": "Cumulative Arrears",
  "cumulative-credit": "Cumulative Credit",
  "cumulative-up-to-date": "Cumulative Up to Date",
  credit: "Monthly Credit",
  "contribution-types": "Contribution Types",
  "payment-methods": "Payment Methods",
  expenses: "Expenses",
  "cash-flow": "Cash Flow",
  meetings: "Meetings",
  full: "Full Report"
};

const STATUS_LABELS = {
  paid: "Paid",
  partial: "Partial",
  outstanding: "Outstanding",
  arrears: "Arrears",
  credit: "Credit",
  up_to_date: "Up to Date",
  "up-to-date": "Up to Date",
  current: "Up to Date"
};


/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;

let members = [];
let contributions = [];
let expenses = [];
let meetings = [];

let canonicalStatus = [];
let canonicalSummary = null;

let cumulativePositions = [];
let cumulativePositionsLoaded = false;

let currentReportRows = [];
let currentReportType = DEFAULT_REPORT_TYPE;

let activeQuickFilter = "all";

let activeCustomContributions = [];
let customMemberStatusRows = [];
let selectedCustomContributionId = null;


/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function query(selector, root = document) {
  return root.querySelector(selector);
}

function queryAll(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function setText(id, value) {
  const el = $(id);
  if (el) {
    el.textContent = value == null ? "" : String(value);
  }
}

function showElement(id, visible = true) {
  const el = $(id);
  if (!el) return;

  el.hidden = !visible;
  el.style.display = visible ? "" : "none";
}

function setHTML(id, html) {
  const el = $(id);
  if (el) {
    el.innerHTML = html;
  }
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   SAFE VALUE HELPERS
   ========================================================= */

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function integerValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return normalizeText(value).toLowerCase();
}

function formatCurrency(value) {
  return `KSh ${numberValue(value).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatWholeCurrency(value) {
  return `KSh ${numberValue(value).toLocaleString("en-KE", {
    maximumFractionDigits: 0
  })}`;
}

function formatNumber(value) {
  return numberValue(value).toLocaleString("en-KE", {
    maximumFractionDigits: 2
  });
}

function formatPercentage(value) {
  return `${numberValue(value).toFixed(1)}%`;
}

function safeDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function dateInputValue(value) {
  const date = safeDate(value);

  if (!date) return "";

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function formatDate(value) {
  const date = safeDate(value);

  if (!date) return "—";

  return date.toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatDateTime(value) {
  const date = safeDate(value);

  if (!date) return "—";

  return date.toLocaleString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}


/* =========================================================
   ERROR / STATUS
   ========================================================= */

function clearError() {
  const el =
    $("reportsError") ||
    $("reportError") ||
    $("errorMessage");

  if (el) {
    el.textContent = "";
    el.hidden = true;
    el.style.display = "none";
  }
}

function showError(message) {
  const text = normalizeText(message) || "Unable to load reports.";

  const el =
    $("reportsError") ||
    $("reportError") ||
    $("errorMessage");

  if (el) {
    el.textContent = text;
    el.hidden = false;
    el.style.display = "";
  }

  console.error(`[${PAGE_NAME}]`, text);
}

function setStatus(message) {
  const candidates = [
    $("reportsStatus"),
    $("reportStatus"),
    $("statusMessage")
  ];

  const el = candidates.find(Boolean);

  if (el) {
    el.textContent = message || "";
  }
}


/* =========================================================
   GROUP / MEMBER CONTEXT
   ========================================================= */

async function loadContext() {
  currentUser = await requireAuth();

  if (!currentUser) {
    throw new Error("AUTHENTICATION_REQUIRED");
  }

  currentMember = await getMyMember();
  currentGroup = await getMyGroup();

  if (!currentMember?.group_id || !currentGroup?.id) {
    throw new Error("GROUP_CONTEXT_REQUIRED");
  }

  setText("groupLabel", currentGroup.name || "Your group");
  setText("printGroupName", currentGroup.name || "Group Report");
}


/* =========================================================
   MEMBER LOADING
   ========================================================= */

async function loadMembers() {
  const groupId = currentGroup?.id;

  if (!groupId) {
    throw new Error("GROUP_CONTEXT_REQUIRED");
  }

  const { data, error } = await supabase
    .from("members")
    .select(`
      id,
      group_id,
      member_number,
      membership_number,
      name,
      status,
      join_date
    `)
    .eq("group_id", groupId)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  members = safeArray(data);
  populateMemberFilter();
  return members;
}

function populateMemberFilter() {
  const select = $("memberFilter");

  if (!select) return;

  const currentValue = select.value;

  const options = [
    `<option value="all">All Members</option>`
  ];

  for (const member of members) {
    const id = member.id;
    const name =
      member.name ||
      member.membership_number ||
      member.member_number ||
      "Member";

    options.push(
      `<option value="${escapeHTML(id)}">${escapeHTML(name)}</option>`
    );
  }

  select.innerHTML = options.join("");

  if (currentValue) {
    select.value = currentValue;
  }
}


/* =========================================================
   CONTRIBUTIONS
   ========================================================= */

async function loadContributions() {
  const groupId = currentGroup?.id;

  if (!groupId) {
    throw new Error("GROUP_CONTEXT_REQUIRED");
  }

  const { data, error } = await supabase
    .from("contributions")
    .select(`
      id,
      group_id,
      member_id,
      amount,
      contribution_type,
      payment_method,
      created_at,
      contribution_date
    `)
    .eq("group_id", groupId)
    .order("contribution_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  contributions = safeArray(data);

  return contributions;
}


/* =========================================================
   EXPENSES
   ========================================================= */

async function loadExpenses() {
  const groupId = currentGroup?.id;

  if (!groupId) {
    throw new Error("GROUP_CONTEXT_REQUIRED");
  }

  const { data, error } = await supabase
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
    .eq("group_id", groupId)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  expenses = safeArray(data);

  return expenses;
}


/* =========================================================
   MEETINGS
   ========================================================= */

async function loadMeetings() {
  const groupId = currentGroup?.id;

  if (!groupId) {
    throw new Error("GROUP_CONTEXT_REQUIRED");
  }

  const { data, error } = await supabase
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
    .eq("group_id", groupId)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  meetings = safeArray(data);
  return meetings;
}


/* =========================================================
   PERIOD HELPERS
   ========================================================= */

function startOfMonth(date = new Date()) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    1
  );
}

function endOfMonth(date = new Date()) {
  return new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0
  );
}

function startOfQuarter(date = new Date()) {
  const quarterStartMonth =
    Math.floor(date.getMonth() / 3) * 3;

  return new Date(
    date.getFullYear(),
    quarterStartMonth,
    1
  );
}

function endOfQuarter(date = new Date()) {
  const start = startOfQuarter(date);

  return new Date(
    start.getFullYear(),
    start.getMonth() + 3,
    0
  );
}

function startOfYear(date = new Date()) {
  return new Date(
    date.getFullYear(),
    0,
    1
  );
}

function endOfYear(date = new Date()) {
  return new Date(
    date.getFullYear(),
    11,
    31
  );
}

function toISODate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function getAccountingMonth() {
  const value = $("accountingMonth")?.value;

  if (value) {
    return value;
  }

  const fromDate = $("fromDate")?.value;

  if (fromDate) {
    return fromDate.slice(0, 7);
  }

  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;
}

function getDateRange() {
  const preset = $("periodPreset")?.value || DEFAULT_PERIOD_PRESET;

  const now = new Date();

  if (preset === "this-month") {
    return {
      from: toISODate(startOfMonth(now)),
      to: toISODate(endOfMonth(now))
    };
  }

  if (preset === "last-month") {
    const previous = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    );

    return {
      from: toISODate(startOfMonth(previous)),
      to: toISODate(endOfMonth(previous))
    };
  }

  if (preset === "this-quarter") {
    return {
      from: toISODate(startOfQuarter(now)),
      to: toISODate(endOfQuarter(now))
    };
  }

  if (preset === "this-year") {
    return {
      from: toISODate(startOfYear(now)),
      to: toISODate(endOfYear(now))
    };
  }

  return {
    from: $("fromDate")?.value || "",
    to: $("toDate")?.value || ""
  };
}

function applyPeriodPreset() {
  const preset = $("periodPreset")?.value;

  if (!preset || preset === "custom") {
    return;
  }

  const now = new Date();

  let from;
  let to;

  switch (preset) {
    case "this-month":
      from = startOfMonth(now);
      to = endOfMonth(now);
      break;

    case "last-month": {
      const previous = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1
      );

      from = startOfMonth(previous);
      to = endOfMonth(previous);
      break;
    }

    case "this-quarter":
      from = startOfQuarter(now);
      to = endOfQuarter(now);
      break;

    case "this-year":
      from = startOfYear(now);
      to = endOfYear(now);
      break;

    default:
      return;
  }

  if ($("fromDate")) {
    $("fromDate").value = toISODate(from);
  }

  if ($("toDate")) {
    $("toDate").value = toISODate(to);
  }

  if ($("accountingMonth")) {
    $("accountingMonth").value =
      `${from.getFullYear()}-${String(
        from.getMonth() + 1
      ).padStart(2, "0")}`;
  }
}


/* =========================================================
   FILTER HELPERS
   ========================================================= */

function dateWithinRange(value, from, to) {
  const date = safeDate(value);

  if (!date) return false;

  const day = toISODate(date);

  if (from && day < from) return false;
  if (to && day > to) return false;

  return true;
}

function getMemberName(memberId) {
  const member = members.find(
    item => String(item.id) === String(memberId)
  );

  if (!member) {
    return "Unknown member";
  }

  return (
    member.name ||
    member.membership_number ||
    member.member_number ||
    "Member"
  );
}

function getMemberNumber(memberId) {
  const member = members.find(
    item => String(item.id) === String(memberId)
  );

  if (!member) return "";

  return (
    member.member_number ||
    member.membership_number ||
    ""
  );
}

function memberMatchesFilter(memberId) {
  const selected = lower($("memberFilter")?.value || "");

  // HTML uses value="all" for the All Members option.
  if (!selected || selected === "all") {
    return true;
  }

  return String(memberId) === String(selected);
}

function contributionTypeMatchesFilter(row) {
  const selected =
    lower($("contributionTypeFilter")?.value || "");

  if (!selected || selected === "all") {
    return true;
  }

  const type = lower(row.contribution_type);

  if (selected === "monthly") {
    return type === "monthly";
  }

  if (selected === "other") {
    return type !== "" && type !== "monthly";
  }

  return type === selected;
}

function paymentMethodMatchesFilter(row) {
  const selected =
    lower($("paymentMethodFilter")?.value || "");

  if (!selected || selected === "all") {
    return true;
  }

  return lower(row.payment_method) === selected;
}

function filteredContributions() {
  const { from, to } = getDateRange();

  return contributions.filter(row => {
    const date =
      row.contribution_date ||
      row.created_at;

    return (
      dateWithinRange(date, from, to) &&
      memberMatchesFilter(row.member_id) &&
      contributionTypeMatchesFilter(row) &&
      paymentMethodMatchesFilter(row)
    );
  });
}

function filteredExpenses() {
  const { from, to } = getDateRange();

  // statusFilter is a member-accounting status selector, not an
  // expense approval selector. Keep all expense states in the period
  // so pending/rejected totals remain visible in the summary.
  return expenses.filter(row => {
    const date =
      row.date ||
      row.created_at;

    return dateWithinRange(date, from, to);
  });
}

function filteredMeetings() {
  const { from, to } = getDateRange();

  return meetings.filter(row => {
    return dateWithinRange(row.date, from, to);
  });
}


/* =========================================================
   CANONICAL MONTHLY ACCOUNTING
   ========================================================= */

async function loadCanonical(month) {
  if (!currentGroup?.id) {
    throw new Error("GROUP_CONTEXT_REQUIRED");
  }

  const groupId = currentGroup.id;

  const [
    monthlyStatusResult,
    monthlySummaryResult
  ] = await Promise.all([
    supabase.rpc(
      "get_canonical_member_monthly_status",
      {
        p_group_id: groupId,
        p_month: month
      }
    ),

    supabase.rpc(
      "get_canonical_monthly_accounting_summary",
      {
        p_group_id: groupId,
        p_month: month
      }
    )
  ]);

  if (monthlyStatusResult.error) {
    throw monthlyStatusResult.error;
  }

  if (monthlySummaryResult.error) {
    throw monthlySummaryResult.error;
  }

  canonicalStatus = safeArray(
    monthlyStatusResult.data
  );

  const summaryData = safeArray(
    monthlySummaryResult.data
  );

  canonicalSummary =
    summaryData.length === 1
      ? summaryData[0]
      : summaryData[0] || monthlySummaryResult.data || null;

  return {
    status: canonicalStatus,
    summary: canonicalSummary
  };
}


/* =========================================================
   CUMULATIVE ACCOUNTING
   ========================================================= */

async function loadCumulativePositions() {
  if (!currentGroup?.id) {
    throw new Error("GROUP_CONTEXT_REQUIRED");
  }

  // Use the same group-level canonical RPC and full member population
  // as the Group Dashboard. Do not independently filter members by
  // profile status or make one RPC call per member.
  const { data, error } = await supabase.rpc(
    "get_group_contribution_positions",
    { p_group_id: currentGroup.id }
  );

  if (error) {
    throw error;
  }

  const rows = safeArray(data);
  const expectedIds = new Set(
    members.filter(member => member?.id).map(member => String(member.id))
  );
  const seenIds = new Set();

  const results = rows.map(row => {
    if (
      !row?.member_id ||
      String(row.group_id) !== String(currentGroup.id)
    ) {
      throw new Error(
        "Cumulative accounting returned a missing member or a position outside the current group."
      );
    }

    const memberId = String(row.member_id);

    if (!expectedIds.has(memberId)) {
      throw new Error(
        "Cumulative accounting returned a member outside the loaded group membership."
      );
    }

    if (seenIds.has(memberId)) {
      throw new Error(
        "Cumulative accounting returned duplicate member positions."
      );
    }

    seenIds.add(memberId);

    return {
      member_id: row.member_id,
      group_id: row.group_id,
      total_due: numberValue(row.total_due),
      total_allocated: numberValue(row.total_allocated),
      arrears: numberValue(row.arrears),
      credit: numberValue(row.credit),
      status: row.status || "up_to_date"
    };
  });

  const missing = [...expectedIds].filter(id => !seenIds.has(id));

  if (missing.length || results.length !== expectedIds.size) {
    throw new Error(
      `Cumulative accounting returned ${results.length} of ${expectedIds.size} group-member positions.`
    );
  }

  cumulativePositions = results;
  cumulativePositionsLoaded = true;

  return cumulativePositions;
}


/* =========================================================
   CUSTOM CONTRIBUTION STATUS
   ========================================================= */

async function loadActiveCustomContributionStatus() {
  const select = $("customContributionMemberStatusSelect");
  if (!currentGroup?.id || !select) return;

  activeCustomContributions = [];
  customMemberStatusRows = [];

  try {
    const [typesResult, periodsResult] = await Promise.all([
      supabase
        .from("contribution_types")
        .select("id, group_id, name, code")
        .eq("group_id", currentGroup.id),
      supabase
        .from("contribution_periods")
        .select("id, group_id, contribution_type_id, name, status, due_date")
        .eq("group_id", currentGroup.id)
    ]);

    if (typesResult.error) throw typesResult.error;
    if (periodsResult.error) throw periodsResult.error;

    const customTypeIds = new Set(
      safeArray(typesResult.data)
        .filter(type => lower(type.code) === "custom")
        .map(type => String(type.id))
    );

    // The canonical status RPC reports custom contribution PERIODS,
    // not contribution-type IDs or arbitrary contribution initiatives.
    activeCustomContributions = safeArray(periodsResult.data).filter(period =>
      customTypeIds.has(String(period.contribution_type_id)) &&
      ["open", "due", "grace"].includes(lower(period.status))
    );

    populateCustomContributionSelector();

    if (select.value) {
      await refreshSelectedCustomContribution();
    } else {
      customMemberStatusRows = [];
      renderCustomContributionStatus();
    }
  } catch (error) {
    console.warn("[Reports] Custom contribution status unavailable:", error);
    select.innerHTML = '<option value="">Custom contribution status unavailable</option>';
    setText("customContributionMemberStatusViewing", "Unavailable");
    const target = $("customContributionMemberStatusRows");
    if (target) {
      target.innerHTML = '<tr><td colspan="6">Could not load custom contribution status. Check the browser console or contact an administrator.</td></tr>';
    }
  }
}

function populateCustomContributionSelector() {
  const select = $("customContributionMemberStatusSelect");
  if (!select) return;

  const previousValue = selectedCustomContributionId || select.value;
  const options = ['<option value="">Select contribution</option>'];

  for (const item of activeCustomContributions) {
    if (!item.id) continue;
    options.push(
      `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name || "Custom contribution")}</option>`
    );
  }

  select.innerHTML = options.join("");

  const previousExists = previousValue &&
    activeCustomContributions.some(item => String(item.id) === String(previousValue));

  // Choose the first valid period on initial load so the section does
  // not remain blank while active custom periods are available.
  select.value = previousExists
    ? String(previousValue)
    : String(activeCustomContributions[0]?.id || "");

  selectedCustomContributionId = select.value || null;
}

async function refreshSelectedCustomContribution() {
  const select = $("customContributionMemberStatusSelect");
  if (!select) return;

  const selectedId = select.value;
  selectedCustomContributionId = selectedId || null;

  if (!selectedId) {
    customMemberStatusRows = [];
    setText("customContributionMemberStatusViewing", "—");
    renderCustomContributionStatus();
    return;
  }

  const selectedPeriod = activeCustomContributions.find(
    item => String(item.id) === String(selectedId)
  );

  setText(
    "customContributionMemberStatusViewing",
    selectedPeriod?.name || "Selected contribution"
  );

  try {
    const { data, error } = await supabase.rpc(
      "get_group_custom_contribution_status",
      { p_group_id: currentGroup.id }
    );

    if (error) throw error;

    customMemberStatusRows = safeArray(data)
      .filter(row => String(row.period_id) === String(selectedId));

    renderCustomContributionStatus();
  } catch (error) {
    console.warn("[Reports] Unable to load custom contribution status:", error);
    customMemberStatusRows = [];
    const target = $("customContributionMemberStatusRows");
    if (target) {
      target.innerHTML = '<tr><td colspan="6">Unable to load this contribution status. Verify officer access and try again.</td></tr>';
    }
  }
}

function renderCustomContributionStatus() {
  const target = $("customContributionMemberStatusRows");
  if (!target) return;

  if (!selectedCustomContributionId) {
    target.innerHTML =
      '<tr><td colspan="6">Select an active custom contribution to view member status.</td></tr>';
    return;
  }

  if (!customMemberStatusRows.length) {
    target.innerHTML =
      '<tr><td colspan="6">No member obligations were returned for this contribution period.</td></tr>';
    return;
  }

  target.innerHTML = customMemberStatusRows.map(row => {
    const memberName = row.member_name || getMemberName(row.member_id);
    const status = row.status || "—";

    return `
      <tr>
        <td>${escapeHTML(memberName)}</td>
        <td class="amount">${formatCurrency(row.amount_due)}</td>
        <td class="amount">${formatCurrency(row.amount_applied)}</td>
        <td class="amount">${formatCurrency(row.outstanding)}</td>
        <td>${escapeHTML(formatDate(row.due_date))}</td>
        <td>${escapeHTML(status)}</td>
      </tr>
    `;
  }).join("");
}


/* =========================================================
   CANONICAL FILTERING
   ========================================================= */

function filteredCanonicalStatus() {
  const selectedMember =
    $("memberFilter")?.value || "";

  const selectedStatus =
    lower($("statusFilter")?.value || "");

  let rows = canonicalStatus.slice();

  if (selectedMember && lower(selectedMember) !== "all") {
    rows = rows.filter(
      row =>
        String(row.member_id) ===
        String(selectedMember)
    );
  }

  if (
    selectedStatus &&
    selectedStatus !== "all" &&
    !selectedStatus.startsWith("cumulative-")
  ) {
    rows = rows.filter(row => {
      const status =
        lower(
          row.status ||
          row.accounting_status ||
          row.payment_status
        );

      if (selectedStatus === "outstanding") {
        return canonicalOutstanding(row) > 0;
      }

      if (selectedStatus === "no-payment") {
        return canonicalApplied(row) <= 0 &&
          canonicalOutstanding(row) > 0;
      }

      return status === selectedStatus;
    });
  }

  if (activeQuickFilter === "arrears") {
    rows = rows.filter(row =>
      numberValue(
        row.previous_outstanding ??
        row.previous_arrears ??
        row.outstanding_before ??
        0
      ) > 0
    );
  }

  if (activeQuickFilter === "attention") {
    rows = rows.filter(row => {
      const previous =
        numberValue(
          row.previous_outstanding ??
          row.previous_arrears ??
          row.outstanding_before ??
          0
        );

      const current =
        numberValue(
          row.outstanding ??
          row.current_outstanding ??
          row.arrears ??
          0
        );

      return previous > 0 || current > 0;
    });
  }

  if (activeQuickFilter === "credit") {
    rows = rows.filter(row =>
      numberValue(
        row.carry_forward_credit ??
        row.previous_credit ??
        row.current_credit ??
        row.credit ??
        0
      ) > 0
    );
  }

  return rows;
}

function filteredCumulativePositions() {
  const selectedMember =
    $("memberFilter")?.value || "";

  let rows = cumulativePositions.slice();

  if (selectedMember && lower(selectedMember) !== "all") {
    rows = rows.filter(
      row =>
        String(row.member_id) ===
        String(selectedMember)
    );
  }

  if (activeQuickFilter === "arrears") {
    rows = rows.filter(
      row => numberValue(row.arrears) > 0
    );
  }

  if (activeQuickFilter === "credit") {
    rows = rows.filter(
      row => numberValue(row.credit) > 0
    );
  }

  if (activeQuickFilter === "attention") {
    rows = rows.filter(row =>
      numberValue(row.arrears) > 0
    );
  }

  const selectedStatus =
    lower($("statusFilter")?.value || "");

  if (selectedStatus === "cumulative-arrears") {
    rows = rows.filter(row => numberValue(row.arrears) > 0);
  } else if (selectedStatus === "cumulative-credit") {
    rows = rows.filter(row => numberValue(row.credit) > 0);
  } else if (selectedStatus === "cumulative-up-to-date") {
    rows = rows.filter(row =>
      numberValue(row.arrears) <= 0 &&
      numberValue(row.credit) <= 0
    );
  } else if (selectedStatus === "no-payment") {
    rows = rows.filter(row => numberValue(row.total_allocated) <= 0);
  }

  return rows;
}


/* =========================================================
   SUMMARY
   ========================================================= */

function updateSummary(
  visibleContributions,
  visibleExpenses
) {
  const totalContributions =
    visibleContributions.reduce(
      (sum, row) =>
        sum + numberValue(row.amount),
      0
    );

  const approvedExpenses =
    visibleExpenses
      .filter(row =>
        lower(row.approval_status) === "approved"
      )
      .reduce(
        (sum, row) =>
          sum + numberValue(row.amount),
        0
      );

  const pendingExpenses =
    visibleExpenses
      .filter(row =>
        lower(row.approval_status) === "pending"
      )
      .reduce(
        (sum, row) =>
          sum + numberValue(row.amount),
        0
      );

  const rejectedExpenses =
    visibleExpenses
      .filter(row =>
        lower(row.approval_status) === "rejected"
      )
      .reduce(
        (sum, row) =>
          sum + numberValue(row.amount),
        0
      );

  const currentBalance =
    totalContributions -
    approvedExpenses;

  const activeMembers =
    members.filter(member => {
      const status = lower(member.status);

      return (
        !status ||
        status === "active" ||
        status === "approved"
      );
    }).length;

  setText(
    "totalContributions",
    formatCurrency(totalContributions)
  );

  setText(
    "approvedExpenses",
    formatCurrency(approvedExpenses)
  );

  setText(
    "currentBalance",
    formatCurrency(currentBalance)
  );

  setText(
    "pendingExpenses",
    formatCurrency(pendingExpenses)
  );

  setText(
    "rejectedExpenses",
    formatCurrency(rejectedExpenses)
  );

  setText(
    "activeMembers",
    formatNumber(activeMembers)
  );

  const summary =
    canonicalSummary || {};

  const applied =
    numberValue(
      summary.applied_this_month ??
      summary.applied ??
      summary.total_applied ??
      summary.total_allocated ??
      summary.current_applied
    );

  const outstanding =
    numberValue(
      summary.outstanding ??
      summary.total_outstanding ??
      summary.current_outstanding
    );

  const carryForward =
    numberValue(
      summary.carry_forward_credit ??
      summary.total_carry_forward_credit ??
      summary.credit
    );

  const totalDue =
    numberValue(
      summary.expected_monthly_contributions ??
      summary.total_due ??
      summary.total_obligations ??
      applied + outstanding
    );

  const collectionRate =
    summary.collection_rate !== undefined &&
    summary.collection_rate !== null
      ? numberValue(summary.collection_rate)
      : totalDue > 0
        ? (applied / totalDue) * 100
        : 0;

  const cumulativeRows =
    cumulativePositions;

  const cumulativeArrears =
    cumulativeRows.reduce(
      (sum, row) =>
        sum + numberValue(row.arrears),
      0
    );

  const cumulativeCredit =
    cumulativeRows.reduce(
      (sum, row) =>
        sum + numberValue(row.credit),
      0
    );

  setText(
    "reportApplied",
    formatCurrency(applied)
  );

  setText(
    "reportOutstanding",
    formatCurrency(outstanding)
  );

  setText(
    "reportCarryForward",
    formatCurrency(carryForward)
  );

  setText(
    "reportCollectionRate",
    formatPercentage(collectionRate)
  );

  setText(
    "reportCumulativeArrears",
    formatCurrency(cumulativeArrears)
  );

  setText(
    "reportCumulativeCredit",
    formatCurrency(cumulativeCredit)
  );
}


/* =========================================================
   CONTRIBUTION BREAKDOWN
   ========================================================= */

function buildContributionBreakdown(rows) {
  const map = new Map();

  for (const row of rows) {
    const type =
      normalizeText(row.contribution_type) ||
      "Unspecified";

    const existing =
      map.get(type) || {
        type,
        count: 0,
        amount: 0
      };

    existing.count += 1;
    existing.amount += numberValue(row.amount);

    map.set(type, existing);
  }

  return Array.from(map.values())
    .sort((a, b) => b.amount - a.amount);
}

function renderContributionBreakdown(rows) {
  const target =
    $("contributionBreakdownRows");

  if (!target) return;

  const breakdown =
    buildContributionBreakdown(rows);

  if (!breakdown.length) {
    target.innerHTML =
      `<tr><td colspan="3">No contribution data for the selected period.</td></tr>`;
    return;
  }

  target.innerHTML =
    breakdown.map(row => `
      <tr>
        <td>${escapeHTML(row.type)}</td>
        <td>${formatNumber(row.count)}</td>
        <td>${formatCurrency(row.amount)}</td>
      </tr>
    `).join("");
}


/* =========================================================
   EXPENSE BREAKDOWN
   ========================================================= */

function buildExpenseBreakdown(rows) {
  const map = new Map();

  for (const row of rows) {
    const category =
      normalizeText(row.category) ||
      "Uncategorised";

    const existing =
      map.get(category) || {
        category,
        count: 0,
        amount: 0
      };

    existing.count += 1;
    existing.amount += numberValue(row.amount);

    map.set(category, existing);
  }

  return Array.from(map.values())
    .sort((a, b) => b.amount - a.amount);
}

function renderExpenseBreakdown(rows) {
  const target =
    $("expenseBreakdownRows");

  if (!target) return;

  const breakdown =
    buildExpenseBreakdown(rows);

  if (!breakdown.length) {
    target.innerHTML =
      `<tr><td colspan="3">No expense data for the selected period.</td></tr>`;
    return;
  }

  target.innerHTML =
    breakdown.map(row => `
      <tr>
        <td>${escapeHTML(row.category)}</td>
        <td>${formatNumber(row.count)}</td>
        <td>${formatCurrency(row.amount)}</td>
      </tr>
    `).join("");
}


/* =========================================================
   CONTRIBUTION ENTRIES
   ========================================================= */

function renderContributionEntries(rows) {
  const target =
    $("reportContributionEntries");

  if (!target) return;

  if (!rows.length) {
    target.innerHTML =
      `<tr><td colspan="8">No contribution entries for the selected period.</td></tr>`;
    return;
  }

  target.innerHTML =
    rows.map(row => `
      <tr>
        <td>${escapeHTML(formatDate(
          row.contribution_date ||
          row.created_at
        ))}</td>

        <td>${escapeHTML(
          getMemberNumber(row.member_id) || "—"
        )}</td>

        <td>${escapeHTML(
          getMemberName(row.member_id)
        )}</td>

        <td>${escapeHTML(
          row.contribution_type || "—"
        )}</td>

        <td>${escapeHTML(
          row.payment_method || "—"
        )}</td>

        <td>${formatCurrency(row.amount)}</td>

        <td>${escapeHTML(
          formatDateTime(row.created_at)
        )}</td>

        <td>${escapeHTML(
          row.id || "—"
        )}</td>
      </tr>
    `).join("");
}


/* =========================================================
   EXPENSE ENTRIES
   ========================================================= */

function renderExpenseEntries(rows) {
  const target =
    $("reportExpenseEntries");

  if (!target) return;

  if (!rows.length) {
    target.innerHTML =
      `<tr><td colspan="7">No expense entries for the selected period.</td></tr>`;
    return;
  }

  target.innerHTML =
    rows.map(row => `
      <tr>
        <td>${escapeHTML(
          formatDate(row.date || row.created_at)
        )}</td>

        <td>${escapeHTML(
          row.description || "—"
        )}</td>

        <td>${escapeHTML(
          row.category || "—"
        )}</td>

        <td>${formatCurrency(row.amount)}</td>

        <td>${escapeHTML(
          row.approval_status || "—"
        )}</td>

        <td>${escapeHTML(
          row.recorded_by || "—"
        )}</td>

        <td>
          ${
            row.receipt_url
              ? `<a href="${escapeHTML(row.receipt_url)}" target="_blank" rel="noopener">Receipt</a>`
              : "—"
          }
        </td>
      </tr>
    `).join("");
}


/* =========================================================
   MEETING SUMMARY
   ========================================================= */

function renderMeetings(rows) {
  const total =
    rows.length;

  const upcoming =
    rows.filter(row =>
      safeDate(row.date) &&
      safeDate(row.date) > new Date() &&
      lower(row.status) !== "cancelled"
    ).length;

  const completed =
    rows.filter(row =>
      lower(row.status) === "completed"
    ).length;

  const cancelled =
    rows.filter(row =>
      lower(row.status) === "cancelled"
    ).length;

  setText("totalMeetings", formatNumber(total));
  setText("upcomingMeetings", formatNumber(upcoming));
  setText("completedMeetings", formatNumber(completed));
  setText("cancelledMeetings", formatNumber(cancelled));

  const target =
    $("meetingRows");

  if (!target) return;

  if (!rows.length) {
    target.innerHTML =
      `<tr><td colspan="6">No meetings for the selected period.</td></tr>`;
    return;
  }

  target.innerHTML =
    rows.map(row => `
      <tr>
        <td>${escapeHTML(
          formatDate(row.date)
        )}</td>

        <td>${escapeHTML(
          row.title || "Meeting"
        )}</td>

        <td>${escapeHTML(
          row.venue || "—"
        )}</td>

        <td>${escapeHTML(
          row.status || "—"
        )}</td>

        <td>${escapeHTML(
          row.agenda || "—"
        )}</td>

        <td>${escapeHTML(
          row.resolution || "—"
        )}</td>
      </tr>
    `).join("");
}


/* =========================================================
   CUMULATIVE POSITION TABLE
   ========================================================= */

function renderCumulativePosition(rows) {
  const target =
    $("reportOutput");

  if (!target) return;

  if (!rows.length) {
    target.innerHTML =
      `<div class="report-empty">No cumulative accounting data available.</div>`;
    return;
  }

  target.innerHTML = `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Member No.</th>
            <th>Total Due</th>
            <th>Total Allocated</th>
            <th>Arrears</th>
            <th>Credit</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${escapeHTML(
                getMemberName(row.member_id)
              )}</td>

              <td>${escapeHTML(
                getMemberNumber(row.member_id) || "—"
              )}</td>

              <td>${formatCurrency(
                row.total_due
              )}</td>

              <td>${formatCurrency(
                row.total_allocated
              )}</td>

              <td>${formatCurrency(
                row.arrears
              )}</td>

              <td>${formatCurrency(
                row.credit
              )}</td>

              <td>${escapeHTML(
                getStatusLabel(row.status)
              )}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}


/* =========================================================
   STATUS HELPERS
   ========================================================= */

function getStatusLabel(value) {
  const key = lower(value);

  return (
    STATUS_LABELS[key] ||
    normalizeText(value) ||
    "—"
  );
}

function canonicalRowStatus(row) {
  return (
    row.status ||
    row.accounting_status ||
    row.payment_status ||
    ""
  );
}

function canonicalApplied(row) {
  return numberValue(
    row.applied ??
    row.allocated ??
    row.total_allocated ??
    row.current_allocated ??
    0
  );
}

function canonicalOutstanding(row) {
  return numberValue(
    row.outstanding ??
    row.current_outstanding ??
    row.arrears ??
    row.current_arrears ??
    0
  );
}

function canonicalCredit(row) {
  return numberValue(
    row.carry_forward_credit ??
    row.credit ??
    row.current_credit ??
    0
  );
}

function canonicalDue(row) {
  return numberValue(
    row.due ??
    row.amount_due ??
    row.obligation ??
    row.total_due ??
    canonicalApplied(row) +
      canonicalOutstanding(row)
  );
}


/* =========================================================
   REPORT OUTPUT
   ========================================================= */

function setReportHeader(title, subtitle = "") {
  setText("reportOutputTitle", title);
  setText("reportOutputSubtitle", subtitle);
}

function renderExecutiveReport(
  contributionRows,
  expenseRows,
  meetingRows
) {
  const target =
    $("reportOutput");

  if (!target) return;

  const totalContributions =
    contributionRows.reduce(
      (sum, row) =>
        sum + numberValue(row.amount),
      0
    );

  const approvedExpenses =
    expenseRows
      .filter(row =>
        lower(row.approval_status) === "approved"
      )
      .reduce(
        (sum, row) =>
          sum + numberValue(row.amount),
        0
      );

  const balance =
    totalContributions -
    approvedExpenses;

  const cumulativeArrears =
    cumulativePositions.reduce(
      (sum, row) =>
        sum + numberValue(row.arrears),
      0
    );

  const cumulativeCredit =
    cumulativePositions.reduce(
      (sum, row) =>
        sum + numberValue(row.credit),
      0
    );

  target.innerHTML = `
    <div class="report-executive">
      <div class="report-executive-grid">

        <div class="report-mini-card">
          <span>Contributions</span>
          <strong>${formatCurrency(totalContributions)}</strong>
        </div>

        <div class="report-mini-card">
          <span>Approved Expenses</span>
          <strong>${formatCurrency(approvedExpenses)}</strong>
        </div>

        <div class="report-mini-card">
          <span>Net Cash Position</span>
          <strong>${formatCurrency(balance)}</strong>
        </div>

        <div class="report-mini-card">
          <span>Cumulative Arrears</span>
          <strong>${formatCurrency(cumulativeArrears)}</strong>
        </div>

        <div class="report-mini-card">
          <span>Cumulative Credit</span>
          <strong>${formatCurrency(cumulativeCredit)}</strong>
        </div>

        <div class="report-mini-card">
          <span>Meetings</span>
          <strong>${formatNumber(meetingRows.length)}</strong>
        </div>

      </div>

      <div class="report-executive-note">
        <strong>Accounting view</strong>
        <p>
          Monthly contribution status and cumulative member positions
          are supplied by the canonical server-side accounting functions.
          This report does not reconstruct accounting totals in the browser.
        </p>
      </div>
    </div>
  `;
}

function renderMemberContributions(rows) {
  const target =
    $("reportOutput");

  if (!target) return;

  const grouped = new Map();

  for (const row of rows) {
    const key = row.member_id;

    const existing =
      grouped.get(key) || {
        member_id: key,
        count: 0,
        amount: 0
      };

    existing.count += 1;
    existing.amount += numberValue(row.amount);

    grouped.set(key, existing);
  }

  const data =
    Array.from(grouped.values())
      .sort((a, b) => b.amount - a.amount);

  target.innerHTML = `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Member No.</th>
            <th>Entries</th>
            <th>Total Contributions</th>
          </tr>
        </thead>

        <tbody>
          ${
            data.length
              ? data.map(row => `
                  <tr>
                    <td>${escapeHTML(
                      getMemberName(row.member_id)
                    )}</td>

                    <td>${escapeHTML(
                      getMemberNumber(row.member_id) || "—"
                    )}</td>

                    <td>${formatNumber(row.count)}</td>

                    <td>${formatCurrency(row.amount)}</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="4">No contribution data.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderMonthlyStatusReport(rows) {
  const target =
    $("reportOutput");

  if (!target) return;

  target.innerHTML = `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Member No.</th>
            <th>Due</th>
            <th>Applied</th>
            <th>Outstanding</th>
            <th>Credit</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${
            rows.length
              ? rows.map(row => `
                  <tr>
                    <td>${escapeHTML(
                      getMemberName(row.member_id)
                    )}</td>

                    <td>${escapeHTML(
                      getMemberNumber(row.member_id) || "—"
                    )}</td>

                    <td>${formatCurrency(
                      canonicalDue(row)
                    )}</td>

                    <td>${formatCurrency(
                      canonicalApplied(row)
                    )}</td>

                    <td>${formatCurrency(
                      canonicalOutstanding(row)
                    )}</td>

                    <td>${formatCurrency(
                      canonicalCredit(row)
                    )}</td>

                    <td>${escapeHTML(
                      getStatusLabel(
                        canonicalRowStatus(row)
                      )
                    )}</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="7">No monthly accounting records.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderMonthlyArrearsReport(rows) {
  const arrearsRows =
    rows.filter(row =>
      canonicalOutstanding(row) > 0
    );

  const target =
    $("reportOutput");

  if (!target) return;

  target.innerHTML = `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Member No.</th>
            <th>Outstanding</th>
            <th>Previous Outstanding</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${
            arrearsRows.length
              ? arrearsRows.map(row => `
                  <tr>
                    <td>${escapeHTML(
                      getMemberName(row.member_id)
                    )}</td>

                    <td>${escapeHTML(
                      getMemberNumber(row.member_id) || "—"
                    )}</td>

                    <td>${formatCurrency(
                      canonicalOutstanding(row)
                    )}</td>

                    <td>${formatCurrency(
                      row.previous_outstanding ??
                      row.previous_arrears ??
                      row.outstanding_before ??
                      0
                    )}</td>

                    <td>${escapeHTML(
                      getStatusLabel(
                        canonicalRowStatus(row)
                      )
                    )}</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="5">No members are in arrears for the selected month.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderMonthlyCreditReport(rows) {
  const creditRows =
    rows.filter(row =>
      canonicalCredit(row) > 0
    );

  const target =
    $("reportOutput");

  if (!target) return;

  target.innerHTML = `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Member No.</th>
            <th>Credit</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${
            creditRows.length
              ? creditRows.map(row => `
                  <tr>
                    <td>${escapeHTML(
                      getMemberName(row.member_id)
                    )}</td>

                    <td>${escapeHTML(
                      getMemberNumber(row.member_id) || "—"
                    )}</td>

                    <td>${formatCurrency(
                      canonicalCredit(row)
                    )}</td>

                    <td>${escapeHTML(
                      getStatusLabel(
                        canonicalRowStatus(row)
                      )
                    )}</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="4">No monthly credit records.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderContributionTypesReport(rows) {
  const breakdown =
    buildContributionBreakdown(rows);

  const target =
    $("reportOutput");

  if (!target) return;

  target.innerHTML = `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Contribution Type</th>
            <th>Entries</th>
            <th>Total</th>
          </tr>
        </thead>

        <tbody>
          ${
            breakdown.length
              ? breakdown.map(row => `
                  <tr>
                    <td>${escapeHTML(row.type)}</td>
                    <td>${formatNumber(row.count)}</td>
                    <td>${formatCurrency(row.amount)}</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="3">No contribution types found.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderPaymentMethodsReport(rows) {
  const map = new Map();

  for (const row of rows) {
    const method =
      normalizeText(row.payment_method) ||
      "Unspecified";

    const existing =
      map.get(method) || {
        method,
        count: 0,
        amount: 0
      };

    existing.count += 1;
    existing.amount += numberValue(row.amount);

    map.set(method, existing);
  }

  const data =
    Array.from(map.values())
      .sort((a, b) => b.amount - a.amount);

  const target =
    $("reportOutput");

  if (!target) return;

  target.innerHTML = `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Payment Method</th>
            <th>Entries</th>
            <th>Total</th>
          </tr>
        </thead>

        <tbody>
          ${
            data.length
              ? data.map(row => `
                  <tr>
                    <td>${escapeHTML(row.method)}</td>
                    <td>${formatNumber(row.count)}</td>
                    <td>${formatCurrency(row.amount)}</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="3">No payment method data.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderExpensesReport(rows) {
  const target =
    $("reportOutput");

  if (!target) return;

  target.innerHTML = `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Category</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${
            rows.length
              ? rows.map(row => `
                  <tr>
                    <td>${escapeHTML(
                      formatDate(row.date || row.created_at)
                    )}</td>

                    <td>${escapeHTML(
                      row.description || "—"
                    )}</td>

                    <td>${escapeHTML(
                      row.category || "—"
                    )}</td>

                    <td>${formatCurrency(row.amount)}</td>

                    <td>${escapeHTML(
                      row.approval_status || "—"
                    )}</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="5">No expense records.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderCashFlowReport(
  contributionRows,
  expenseRows
) {
  const contributionsTotal =
    contributionRows.reduce(
      (sum, row) =>
        sum + numberValue(row.amount),
      0
    );

  const approvedExpenses =
    expenseRows
      .filter(row =>
        lower(row.approval_status) === "approved"
      )
      .reduce(
        (sum, row) =>
          sum + numberValue(row.amount),
        0
      );

  const pendingExpenses =
    expenseRows
      .filter(row =>
        lower(row.approval_status) === "pending"
      )
      .reduce(
        (sum, row) =>
          sum + numberValue(row.amount),
        0
      );

  const rejectedExpenses =
    expenseRows
      .filter(row =>
        lower(row.approval_status) === "rejected"
      )
      .reduce(
        (sum, row) =>
          sum + numberValue(row.amount),
        0
      );

  const net =
    contributionsTotal -
    approvedExpenses;

  const target =
    $("reportOutput");

  if (!target) return;

  target.innerHTML = `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Cash Flow Item</th>
            <th>Amount</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>Contributions Received</td>
            <td>${formatCurrency(contributionsTotal)}</td>
          </tr>

          <tr>
            <td>Approved Expenses</td>
            <td>${formatCurrency(approvedExpenses)}</td>
          </tr>

          <tr>
            <td>Net Cash Movement</td>
            <td>${formatCurrency(net)}</td>
          </tr>

          <tr>
            <td>Pending Expenses</td>
            <td>${formatCurrency(pendingExpenses)}</td>
          </tr>

          <tr>
            <td>Rejected Expenses</td>
            <td>${formatCurrency(rejectedExpenses)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderMeetingsReport(rows) {
  const target =
    $("reportOutput");

  if (!target) return;

  target.innerHTML = `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Meeting</th>
            <th>Venue</th>
            <th>Status</th>
            <th>Agenda</th>
            <th>Resolution</th>
          </tr>
        </thead>

        <tbody>
          ${
            rows.length
              ? rows.map(row => `
                  <tr>
                    <td>${escapeHTML(
                      formatDate(row.date)
                    )}</td>

                    <td>${escapeHTML(
                      row.title || "Meeting"
                    )}</td>

                    <td>${escapeHTML(
                      row.venue || "—"
                    )}</td>

                    <td>${escapeHTML(
                      row.status || "—"
                    )}</td>

                    <td>${escapeHTML(
                      row.agenda || "—"
                    )}</td>

                    <td>${escapeHTML(
                      row.resolution || "—"
                    )}</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="6">No meetings found.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderFullReport(
  contributionRows,
  expenseRows,
  meetingRows
) {
  const target =
    $("reportOutput");

  if (!target) return;

  target.innerHTML = `
    <div class="report-full">

      <section class="report-subsection">
        <h3>Monthly Member Accounting</h3>
        ${buildCanonicalTable(filteredCanonicalStatus())}
      </section>

      <section class="report-subsection">
        <h3>Cumulative Member Position</h3>
        ${buildCumulativeTable(filteredCumulativePositions())}
      </section>

      <section class="report-subsection">
        <h3>Contributions</h3>
        ${buildContributionTable(contributionRows)}
      </section>

      <section class="report-subsection">
        <h3>Expenses</h3>
        ${buildExpenseTable(expenseRows)}
      </section>

      <section class="report-subsection">
        <h3>Meetings</h3>
        ${buildMeetingTable(meetingRows)}
      </section>

    </div>
  `;
}

function buildCanonicalTable(rows) {
  return `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Due</th>
            <th>Applied</th>
            <th>Outstanding</th>
            <th>Credit</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows.length
              ? rows.map(row => `
                  <tr>
                    <td>${escapeHTML(
                      getMemberName(row.member_id)
                    )}</td>

                    <td>${formatCurrency(
                      canonicalDue(row)
                    )}</td>

                    <td>${formatCurrency(
                      canonicalApplied(row)
                    )}</td>

                    <td>${formatCurrency(
                      canonicalOutstanding(row)
                    )}</td>

                    <td>${formatCurrency(
                      canonicalCredit(row)
                    )}</td>

                    <td>${escapeHTML(
                      getStatusLabel(
                        canonicalRowStatus(row)
                      )
                    )}</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="6">No monthly accounting data.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function buildCumulativeTable(rows) {
  return `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Total Due</th>
            <th>Total Allocated</th>
            <th>Arrears</th>
            <th>Credit</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows.length
              ? rows.map(row => `
                  <tr>
                    <td>${escapeHTML(
                      getMemberName(row.member_id)
                    )}</td>

                    <td>${formatCurrency(
                      row.total_due
                    )}</td>

                    <td>${formatCurrency(
                      row.total_allocated
                    )}</td>

                    <td>${formatCurrency(
                      row.arrears
                    )}</td>

                    <td>${formatCurrency(
                      row.credit
                    )}</td>

                    <td>${escapeHTML(
                      getStatusLabel(row.status)
                    )}</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="6">No cumulative data.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function buildContributionTable(rows) {
  return `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Member</th>
            <th>Type</th>
            <th>Method</th>
            <th>Amount</th>
          </tr>
        </thead>

        <tbody>
          ${
            rows.length
              ? rows.map(row => `
                  <tr>
                    <td>${escapeHTML(
                      formatDate(
                        row.contribution_date ||
                        row.created_at
                      )
                    )}</td>

                    <td>${escapeHTML(
                      getMemberName(row.member_id)
                    )}</td>

                    <td>${escapeHTML(
                      row.contribution_type || "—"
                    )}</td>

                    <td>${escapeHTML(
                      row.payment_method || "—"
                    )}</td>

                    <td>${formatCurrency(
                      row.amount
                    )}</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="5">No contributions.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function buildExpenseTable(rows) {
  return `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Category</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${
            rows.length
              ? rows.map(row => `
                  <tr>
                    <td>${escapeHTML(
                      formatDate(
                        row.date ||
                        row.created_at
                      )
                    )}</td>

                    <td>${escapeHTML(
                      row.description || "—"
                    )}</td>

                    <td>${escapeHTML(
                      row.category || "—"
                    )}</td>

                    <td>${formatCurrency(
                      row.amount
                    )}</td>

                    <td>${escapeHTML(
                      row.approval_status || "—"
                    )}</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="5">No expenses.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function buildMeetingTable(rows) {
  return `
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Meeting</th>
            <th>Venue</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${
            rows.length
              ? rows.map(row => `
                  <tr>
                    <td>${escapeHTML(
                      formatDate(row.date)
                    )}</td>

                    <td>${escapeHTML(
                      row.title || "Meeting"
                    )}</td>

                    <td>${escapeHTML(
                      row.venue || "—"
                    )}</td>

                    <td>${escapeHTML(
                      row.status || "—"
                    )}</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="4">No meetings.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}


/* =========================================================
   VISUAL INSIGHTS — DYNAMIC CSS
   ========================================================= */

function injectVisualStyles() {
  if ($(VISUAL_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");

  style.id = VISUAL_STYLE_ID;

  style.textContent = `
    #${VISUALS_ID} {
      margin: 24px 0;
    }

    #${VISUALS_ID} .report-visual-heading {
      margin-bottom: 16px;
    }

    #${VISUALS_ID} .report-visual-heading h2 {
      margin: 0 0 6px;
    }

    #${VISUALS_ID} .report-visual-heading p {
      margin: 0;
      opacity: .72;
    }

    #${VISUALS_ID} .report-chart-grid {
      display: grid;
      grid-template-columns:
        repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    #${VISUALS_ID} .report-chart-card {
      min-width: 0;
      border: 1px solid
        var(--border-color, rgba(0,0,0,.10));
      border-radius: 14px;
      background:
        var(--card-bg, var(--surface, #fff));
      padding: 16px;
      box-sizing: border-box;
    }

    #${VISUALS_ID} .report-chart-card.full {
      grid-column: 1 / -1;
    }

    #${VISUALS_ID} .report-chart-card h3 {
      margin: 0 0 4px;
      font-size: 1rem;
    }

    #${VISUALS_ID} .report-chart-card p {
      margin: 0 0 12px;
      opacity: .68;
      font-size: .88rem;
    }

    #${VISUALS_ID} .report-chart-wrap {
      position: relative;
      width: 100%;
      height: 270px;
    }

    #${VISUALS_ID} canvas {
      display: block;
      width: 100%;
      height: 100%;
    }

    #${VISUALS_ID} .report-chart-summary {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid
        var(--border-color, rgba(0,0,0,.08));
      font-size: .88rem;
      line-height: 1.5;
    }

    #${VISUALS_ID} .report-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      margin-top: 10px;
    }

    #${VISUALS_ID} .report-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: .8rem;
    }

    #${VISUALS_ID} .report-legend-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      display: inline-block;
    }

    #${VISUALS_ID} .report-visual-empty {
      padding: 24px;
      border: 1px dashed
        var(--border-color, rgba(0,0,0,.16));
      border-radius: 12px;
      opacity: .72;
    }

    @media (max-width: 900px) {
      #${VISUALS_ID} .report-chart-grid {
        grid-template-columns: 1fr;
      }

      #${VISUALS_ID} .report-chart-card.full {
        grid-column: auto;
      }
    }

    @media print {
      #${VISUALS_ID} {
        break-inside: avoid;
      }

      #${VISUALS_ID} .report-chart-grid {
        grid-template-columns: 1fr 1fr;
      }

      #${VISUALS_ID} .report-chart-card {
        break-inside: avoid;
      }

      #${VISUALS_ID} .report-chart-wrap {
        height: 220px;
      }
    }
  `;

  document.head.appendChild(style);
}


/* =========================================================
   VISUAL INSIGHTS — CONTAINER
   ========================================================= */

function ensureVisualContainer() {
  let container =
    $(VISUALS_ID);

  if (container) {
    return container;
  }

  injectVisualStyles();

  container =
    document.createElement("section");

  container.id =
    VISUALS_ID;

  container.setAttribute(
    "aria-label",
    "Report visual insights"
  );

  const reportOutput =
    $("reportOutput");

  if (reportOutput?.parentElement) {
    reportOutput.parentElement.insertBefore(
      container,
      reportOutput
    );
  } else {
    const main =
      query("main") ||
      query(".main-content") ||
      document.body;

    main.appendChild(container);
  }

  return container;
}


/* =========================================================
   CANVAS HELPERS
   ========================================================= */

function getCanvasContext(canvas) {
  if (!canvas) return null;

  const context =
    canvas.getContext("2d");

  if (!context) return null;

  const rect =
    canvas.getBoundingClientRect();

  const width =
    Math.max(
      1,
      Math.round(rect.width || 600)
    );

  const height =
    Math.max(
      1,
      Math.round(rect.height || 270)
    );

  const ratio =
    Math.max(
      1,
      Math.min(
        3,
        window.devicePixelRatio || 1
      )
    );

  canvas.width =
    width * ratio;

  canvas.height =
    height * ratio;

  context.setTransform(
    ratio,
    0,
    0,
    ratio,
    0,
    0
  );

  return {
    ctx: context,
    width,
    height
  };
}

function getCSSVariable(
  name,
  fallback
) {
  const value =
    getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();

  return value || fallback;
}

function visualColors() {
  return {
    primary:
      getCSSVariable(
        "--primary-color",
        "#198754"
      ),

    primaryAlt:
      getCSSVariable(
        "--accent-color",
        "#2e7d32"
      ),

    text:
      getCSSVariable(
        "--text-color",
        "#24302a"
      ),

    muted:
      getCSSVariable(
        "--muted-text",
        "#6b7280"
      ),

    border:
      getCSSVariable(
        "--border-color",
        "rgba(0,0,0,.12)"
      ),

    background:
      getCSSVariable(
        "--card-bg",
        "#ffffff"
      ),

    warning:
      getCSSVariable(
        "--warning-color",
        "#d97706"
      ),

    danger:
      getCSSVariable(
        "--danger-color",
        "#dc2626"
      )
  };
}

function roundedRect(
  ctx,
  x,
  y,
  width,
  height,
  radius
) {
  const r =
    Math.min(
      radius,
      width / 2,
      height / 2
    );

  ctx.beginPath();

  ctx.moveTo(
    x + r,
    y
  );

  ctx.arcTo(
    x + width,
    y,
    x + width,
    y + height,
    r
  );

  ctx.arcTo(
    x + width,
    y + height,
    x,
    y + height,
    r
  );

  ctx.arcTo(
    x,
    y + height,
    x,
    y,
    r
  );

  ctx.arcTo(
    x,
    y,
    x + width,
    y,
    r
  );

  ctx.closePath();
}

function niceMax(value) {
  if (value <= 0) {
    return 1;
  }

  const magnitude =
    Math.pow(
      10,
      Math.floor(
        Math.log10(value)
      )
    );

  const normalized =
    value / magnitude;

  let rounded;

  if (normalized <= 1) {
    rounded = 1;
  } else if (normalized <= 2) {
    rounded = 2;
  } else if (normalized <= 5) {
    rounded = 5;
  } else {
    rounded = 10;
  }

  return rounded * magnitude;
}

function truncateLabel(
  value,
  maxLength = 18
) {
  const text =
    String(value ?? "");

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function drawNoData(canvas, message = "No data") {
  const setup =
    getCanvasContext(canvas);

  if (!setup) return;

  const {
    ctx,
    width,
    height
  } = setup;

  const colors =
    visualColors();

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  ctx.fillStyle =
    colors.muted;

  ctx.font =
    "14px Inter, system-ui, sans-serif";

  ctx.textAlign =
    "center";

  ctx.textBaseline =
    "middle";

  ctx.fillText(
    message,
    width / 2,
    height / 2
  );
}


/* =========================================================
   CHART — CONTRIBUTIONS VS EXPENSES
   ========================================================= */

function drawContributionExpenseChart(
  canvas,
  contributionRows,
  expenseRows
) {
  const contributionTotal =
    contributionRows.reduce(
      (sum, row) =>
        sum + numberValue(row.amount),
      0
    );

  const approvedExpenseTotal =
    expenseRows
      .filter(row =>
        lower(row.approval_status) === "approved"
      )
      .reduce(
        (sum, row) =>
          sum + numberValue(row.amount),
        0
      );

  const values = [
    contributionTotal,
    approvedExpenseTotal
  ];

  if (
    values.every(
      value => value <= 0
    )
  ) {
    drawNoData(
      canvas,
      "No cash-flow data for this selection"
    );

    return {
      contributionTotal,
      approvedExpenseTotal
    };
  }

  const setup =
    getCanvasContext(canvas);

  if (!setup) return;

  const {
    ctx,
    width,
    height
  } = setup;

  const colors =
    visualColors();

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  const left = 56;
  const right = 20;
  const top = 20;
  const bottom = 52;

  const chartWidth =
    width - left - right;

  const chartHeight =
    height - top - bottom;

  let max =
    niceMax(
      Math.max(...values)
    );

  const barWidth =
    Math.min(
      90,
      chartWidth / 4
    );

  const gap =
    chartWidth / 3;

  const labels = [
    "Received",
    "Approved expenses"
  ];

  const barValues = values;

  ctx.strokeStyle =
    colors.border;

  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y =
      top +
      chartHeight -
      (chartHeight * i / 4);

    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(
      width - right,
      y
    );
    ctx.stroke();

    ctx.fillStyle =
      colors.muted;

    ctx.font =
      "10px Inter, system-ui, sans-serif";

    ctx.textAlign =
      "right";

    ctx.textBaseline =
      "middle";

    ctx.fillText(
      formatWholeCurrency(
        max * i / 4
      ),
      left - 7,
      y
    );
  }

  const barColors = [
    colors.primary,
    colors.danger
  ];

  barValues.forEach(
    (value, index) => {
      const x =
        left +
        gap * (index + 0.5) -
        barWidth / 2;

      const barHeight =
        max > 0
          ? chartHeight *
            value /
            max
          : 0;

      const y =
        top +
        chartHeight -
        barHeight;

      ctx.fillStyle =
        barColors[index];

      roundedRect(
        ctx,
        x,
        y,
        barWidth,
        Math.max(
          2,
          barHeight
        ),
        7
      );

      ctx.fill();

      ctx.fillStyle =
        colors.text;

      ctx.font =
        "bold 11px Inter, system-ui, sans-serif";

      ctx.textAlign =
        "center";

      ctx.textBaseline =
        "bottom";

      ctx.fillText(
        formatWholeCurrency(value),
        x + barWidth / 2,
        y - 6
      );

      ctx.fillStyle =
        colors.muted;

      ctx.font =
        "10px Inter, system-ui, sans-serif";

      ctx.textBaseline =
        "top";

      ctx.fillText(
        labels[index],
        x + barWidth / 2,
        top + chartHeight + 12
      );
    }
  );

  return {
    contributionTotal,
    approvedExpenseTotal
  };
}


/* =========================================================
   CHART — CONTRIBUTION MIX
   ========================================================= */

function drawContributionMixChart(
  canvas,
  rows
) {
  const breakdown =
    buildContributionBreakdown(rows);

  if (!breakdown.length) {
    drawNoData(
      canvas,
      "No contribution mix available"
    );

    return breakdown;
  }

  const setup =
    getCanvasContext(canvas);

  if (!setup) return breakdown;

  const {
    ctx,
    width,
    height
  } = setup;

  const colors =
    visualColors();

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  const total =
    breakdown.reduce(
      (sum, row) =>
        sum + row.amount,
      0
    );

  const centerX =
    Math.min(
      width * 0.32,
      150
    );

  const centerY =
    height / 2;

  const radius =
    Math.min(
      92,
      height * 0.34
    );

  let angle =
    -Math.PI / 2;

  const palette = [
    colors.primary,
    colors.primaryAlt,
    colors.warning,
    colors.danger,
    "#64748b",
    "#7c3aed",
    "#0891b2",
    "#be123c"
  ];

  breakdown.forEach(
    (row, index) => {
      const slice =
        total > 0
          ? (
              row.amount /
              total
            ) * Math.PI * 2
          : 0;

      ctx.beginPath();

      ctx.moveTo(
        centerX,
        centerY
      );

      ctx.arc(
        centerX,
        centerY,
        radius,
        angle,
        angle + slice
      );

      ctx.closePath();

      ctx.fillStyle =
        palette[
          index % palette.length
        ];

      ctx.fill();

      angle += slice;
    }
  );

  ctx.beginPath();

  ctx.arc(
    centerX,
    centerY,
    radius * .56,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    colors.background;

  ctx.fill();

  ctx.fillStyle =
    colors.text;

  ctx.font =
    "bold 12px Inter, system-ui, sans-serif";

  ctx.textAlign =
    "center";

  ctx.textBaseline =
    "middle";

  ctx.fillText(
    formatWholeCurrency(total),
    centerX,
    centerY
  );

  const legendX =
    Math.min(
      width * .55,
      280
    );

  const legendTop =
    24;

  const rowHeight =
    29;

  breakdown
    .slice(0, 8)
    .forEach(
      (row, index) => {
        const y =
          legendTop +
          index * rowHeight;

        ctx.fillStyle =
          palette[
            index % palette.length
          ];

        ctx.beginPath();

        ctx.arc(
          legendX,
          y + 6,
          4,
          0,
          Math.PI * 2
        );

        ctx.fill();

        ctx.fillStyle =
          colors.text;

        ctx.font =
          "11px Inter, system-ui, sans-serif";

        ctx.textAlign =
          "left";

        ctx.textBaseline =
          "middle";

        ctx.fillText(
          truncateLabel(row.type),
          legendX + 10,
          y + 6
        );

        ctx.fillStyle =
          colors.muted;

        ctx.textAlign =
          "right";

        ctx.fillText(
          formatPercentage(
            total > 0
              ? row.amount / total * 100
              : 0
          ),
          width - 18,
          y + 6
        );
      }
    );

  return breakdown;
}


/* =========================================================
   CHART — MONTHLY MEMBER STATUS
   ========================================================= */

function drawMonthlyStatusChart(
  canvas,
  rows
) {
  const counts = {
    paid: 0,
    partial: 0,
    outstanding: 0,
    credit: 0,
    other: 0
  };

  for (const row of rows) {
    const status =
      lower(
        canonicalRowStatus(row)
      );

    const outstanding =
      canonicalOutstanding(row);

    const credit =
      canonicalCredit(row);

    if (credit > 0) {
      counts.credit += 1;
      continue;
    }

    if (
      outstanding > 0 &&
      canonicalApplied(row) > 0
    ) {
      counts.partial += 1;
      continue;
    }

    if (outstanding > 0) {
      counts.outstanding += 1;
      continue;
    }

    if (
      status.includes("paid") ||
      status.includes("up") ||
      status.includes("current")
    ) {
      counts.paid += 1;
      continue;
    }

    if (status.includes("partial")) {
      counts.partial += 1;
      continue;
    }

    if (
      status.includes("arrear") ||
      status.includes("outstanding")
    ) {
      counts.outstanding += 1;
      continue;
    }

    counts.other += 1;
  }

  const entries =
    [
      ["Paid", counts.paid],
      ["Partial", counts.partial],
      ["Outstanding", counts.outstanding],
      ["Credit", counts.credit],
      ["Other", counts.other]
    ].filter(
      item => item[1] > 0
    );

  if (!entries.length) {
    drawNoData(
      canvas,
      "No monthly member status data"
    );

    return counts;
  }

  const setup =
    getCanvasContext(canvas);

  if (!setup) return counts;

  const {
    ctx,
    width,
    height
  } = setup;

  const colors =
    visualColors();

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  const max =
    niceMax(
      Math.max(
        ...entries.map(
          item => item[1]
        )
      )
    );

  const left = 48;
  const right = 16;
  const top = 18;
  const bottom = 45;

  const chartWidth =
    width - left - right;

  const chartHeight =
    height - top - bottom;

  const slotWidth =
    chartWidth /
    Math.max(
      1,
      entries.length
    );

  const barWidth =
    Math.min(
      54,
      slotWidth * .56
    );

  const palette = [
    colors.primary,
    colors.warning,
    colors.danger,
    colors.primaryAlt,
    colors.muted
  ];

  for (let i = 0; i <= 4; i++) {
    const y =
      top +
      chartHeight -
      chartHeight * i / 4;

    ctx.strokeStyle =
      colors.border;

    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(
      width - right,
      y
    );
    ctx.stroke();

    ctx.fillStyle =
      colors.muted;

    ctx.font =
      "10px Inter, system-ui, sans-serif";

    ctx.textAlign =
      "right";

    ctx.textBaseline =
      "middle";

    ctx.fillText(
      String(
        Math.round(
          max * i / 4
        )
      ),
      left - 6,
      y
    );
  }

  entries.forEach(
    ([label, value], index) => {
      const x =
        left +
        slotWidth * index +
        slotWidth / 2 -
        barWidth / 2;

      const barHeight =
        chartHeight *
        value /
        max;

      const y =
        top +
        chartHeight -
        barHeight;

      ctx.fillStyle =
        palette[
          index % palette.length
        ];

      roundedRect(
        ctx,
        x,
        y,
        barWidth,
        Math.max(
          2,
          barHeight
        ),
        6
      );

      ctx.fill();

      ctx.fillStyle =
        colors.text;

      ctx.font =
        "bold 11px Inter, system-ui, sans-serif";

      ctx.textAlign =
        "center";

      ctx.textBaseline =
        "bottom";

      ctx.fillText(
        String(value),
        x + barWidth / 2,
        y - 5
      );

      ctx.fillStyle =
        colors.muted;

      ctx.font =
        "10px Inter, system-ui, sans-serif";

      ctx.textBaseline =
        "top";

      ctx.fillText(
        label,
        x + barWidth / 2,
        top + chartHeight + 10
      );
    }
  );

  return counts;
}


/* =========================================================
   CHART — CUMULATIVE POSITION
   ========================================================= */

function drawCumulativePositionChart(
  canvas,
  rows
) {
  if (!rows.length) {
    drawNoData(
      canvas,
      "No cumulative position data"
    );

    return null;
  }

  let arrears = 0;
  let credit = 0;
  let upToDate = 0;

  for (const row of rows) {
    arrears += numberValue(row.arrears);
    credit += numberValue(row.credit);

    if (
      numberValue(row.arrears) <= 0 &&
      numberValue(row.credit) <= 0
    ) {
      upToDate += 1;
    }
  }

  const setup =
    getCanvasContext(canvas);

  if (!setup) return null;

  const {
    ctx,
    width,
    height
  } = setup;

  const colors =
    visualColors();

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  const totalMembers =
    rows.length;

  const left = 56;
  const right = 20;
  const top = 20;
  const bottom = 48;

  const chartHeight =
    height - top - bottom;

  const values = [
    arrears,
    credit,
    upToDate
  ];

  const labels = [
    "Arrears value",
    "Credit value",
    "Up to date members"
  ];

  const barColors = [
    colors.danger,
    colors.primaryAlt,
    colors.primary
  ];

  const max =
    niceMax(
      Math.max(...values)
    );

  /*
   * If only the count is non-zero, keep the chart useful.
   */
  if (
    arrears <= 0 &&
    credit <= 0
  ) {
    max = Math.max(
      1,
      niceMax(totalMembers)
    );
  }

  const chartWidth =
    width - left - right;

  const slotWidth =
    chartWidth / 3;

  const barWidth =
    Math.min(
      70,
      slotWidth * .52
    );

  for (let i = 0; i <= 4; i++) {
    const y =
      top +
      chartHeight -
      chartHeight * i / 4;

    ctx.strokeStyle =
      colors.border;

    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(
      width - right,
      y
    );
    ctx.stroke();

    ctx.fillStyle =
      colors.muted;

    ctx.font =
      "10px Inter, system-ui, sans-serif";

    ctx.textAlign =
      "right";

    ctx.textBaseline =
      "middle";

    ctx.fillText(
      formatWholeCurrency(
        max * i / 4
      ),
      left - 7,
      y
    );
  }

  values.forEach(
    (value, index) => {
      const x =
        left +
        slotWidth * index +
        slotWidth / 2 -
        barWidth / 2;

      const barHeight =
        max > 0
          ? chartHeight *
            value /
            max
          : 0;

      const y =
        top +
        chartHeight -
        barHeight;

      ctx.fillStyle =
        barColors[index];

      roundedRect(
        ctx,
        x,
        y,
        barWidth,
        Math.max(
          2,
          barHeight
        ),
        6
      );

      ctx.fill();

      ctx.fillStyle =
        colors.text;

      ctx.font =
        "bold 10px Inter, system-ui, sans-serif";

      ctx.textAlign =
        "center";

      ctx.textBaseline =
        "bottom";

      ctx.fillText(
        index === 2
          ? String(
              integerValue(value)
            )
          : formatWholeCurrency(value),
        x + barWidth / 2,
        y - 5
      );

      ctx.fillStyle =
        colors.muted;

      ctx.font =
        "10px Inter, system-ui, sans-serif";

      ctx.textBaseline =
        "top";

      ctx.fillText(
        labels[index],
        x + barWidth / 2,
        top + chartHeight + 10
      );
    }
  );

  return {
    arrears,
    credit,
    upToDate,
    totalMembers
  };
}


/* =========================================================
   CHART — EXPENSE CATEGORIES
   ========================================================= */

function drawExpenseCategoryChart(
  canvas,
  rows
) {
  const breakdown =
    buildExpenseBreakdown(rows);

  if (!breakdown.length) {
    drawNoData(
      canvas,
      "No expense category data"
    );

    return breakdown;
  }

  const setup =
    getCanvasContext(canvas);

  if (!setup) return breakdown;

  const {
    ctx,
    width,
    height
  } = setup;

  const colors =
    visualColors();

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  const visible =
    breakdown.slice(0, 7);

  const max =
    niceMax(
      Math.max(
        ...visible.map(
          row => row.amount
        )
      )
    );

  const left = 105;
  const right = 55;
  const top = 16;
  const rowHeight =
    Math.min(
      32,
      (height - 30) /
        Math.max(
          1,
          visible.length
        )
    );

  visible.forEach(
    (row, index) => {
      const y =
        top +
        index * rowHeight;

      const barWidth =
        max > 0
          ? (
              width -
              left -
              right
            ) *
            row.amount /
            max
          : 0;

      ctx.fillStyle =
        colors.border;

      roundedRect(
        ctx,
        left,
        y + 5,
        width - left - right,
        15,
        5
      );

      ctx.fill();

      ctx.fillStyle =
        colors.primary;

      roundedRect(
        ctx,
        left,
        y + 5,
        Math.max(
          2,
          barWidth
        ),
        15,
        5
      );

      ctx.fill();

      ctx.fillStyle =
        colors.text;

      ctx.font =
        "10px Inter, system-ui, sans-serif";

      ctx.textAlign =
        "right";

      ctx.textBaseline =
        "middle";

      ctx.fillText(
        truncateLabel(
          row.category,
          16
        ),
        left - 9,
        y + 12
      );

      ctx.textAlign =
        "left";

      ctx.fillStyle =
        colors.muted;

      ctx.fillText(
        formatWholeCurrency(
          row.amount
        ),
        width - right + 8,
        y + 12
      );
    }
  );

  return breakdown;
}


/* =========================================================
   VISUAL INSIGHT SUMMARY
   ========================================================= */

function visualCard(
  id,
  title,
  description
) {
  return `
    <article class="report-chart-card">
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(description)}</p>

      <div class="report-chart-wrap">
        <canvas id="${escapeHTML(id)}"></canvas>
      </div>

      <div
        class="report-chart-summary"
        id="${escapeHTML(id)}Summary">
      </div>
    </article>
  `;
}

function renderVisualInsights(
  contributionRows,
  expenseRows,
  canonicalRows,
  cumulativeRows
) {
  const container =
    ensureVisualContainer();

  container.innerHTML = `
    <div class="report-visual-heading">
      <h2>Visual Insights</h2>
      <p>
        A quick visual view of the same report data shown below.
        Accounting status remains authoritative from the server-side
        accounting functions.
      </p>
    </div>

    <div class="report-chart-grid">

      ${visualCard(
        "reportCashFlowChart",
        "Contributions vs Expenses",
        "Money received compared with approved expenses."
      )}

      ${visualCard(
        "reportContributionMixChart",
        "Contribution Mix",
        "How selected contributions are distributed by type."
      )}

      ${visualCard(
        "reportMemberStatusChart",
        "Monthly Member Status",
        "Members grouped by their canonical monthly accounting position."
      )}

      ${visualCard(
        "reportCumulativeChart",
        "Cumulative Position",
        "Cumulative arrears, credit and members currently up to date."
      )}

      ${visualCard(
        "reportExpenseCategoryChart",
        "Expense Categories",
        "Approved and other selected expenses grouped by category."
      )}

    </div>
  `;

  const cashResult =
    drawContributionExpenseChart(
      $("reportCashFlowChart"),
      contributionRows,
      expenseRows
    );

  drawContributionMixChart(
    $("reportContributionMixChart"),
    contributionRows
  );

  const statusResult =
    drawMonthlyStatusChart(
      $("reportMemberStatusChart"),
      canonicalRows
    );

  const cumulativeResult =
    drawCumulativePositionChart(
      $("reportCumulativeChart"),
      cumulativeRows
    );

  const expenseResult =
    drawExpenseCategoryChart(
      $("reportExpenseCategoryChart"),
      expenseRows
  );

  if (cashResult) {
    setHTML(
      "reportCashFlowChartSummary",
      `
        <strong>Net movement:</strong>
        ${formatCurrency(
          cashResult.contributionTotal -
          cashResult.approvedExpenseTotal
        )}
      `
    );
  }

  if (statusResult) {
    setHTML(
      "reportMemberStatusChartSummary",
      `
        <strong>${formatNumber(
          statusResult.paid
        )}</strong> paid,
        <strong>${formatNumber(
          statusResult.partial
        )}</strong> partial,
        <strong>${formatNumber(
          statusResult.outstanding
        )}</strong> outstanding,
        <strong>${formatNumber(
          statusResult.credit
        )}</strong> with credit.
      `
    );
  }

  if (cumulativeResult) {
    setHTML(
      "reportCumulativeChartSummary",
      `
        <strong>${formatCurrency(
          cumulativeResult.arrears
        )}</strong> cumulative arrears and
        <strong>${formatCurrency(
          cumulativeResult.credit
        )}</strong> cumulative credit across
        <strong>${formatNumber(
          cumulativeResult.totalMembers
        )}</strong> members.
      `
    );
  }

  if (expenseResult?.length) {
    const top =
      expenseResult[0];

    setHTML(
      "reportExpenseCategoryChartSummary",
      `
        Largest category:
        <strong>${escapeHTML(
          top.category
        )}</strong>
        at
        <strong>${formatCurrency(
          top.amount
        )}</strong>.
      `
    );
  }

  if (cashResult) {
    setHTML(
      "reportContributionMixChartSummary",
      `
        Total selected contributions:
        <strong>${formatCurrency(
          cashResult.contributionTotal
        )}</strong>.
      `
    );
  }
}


/* =========================================================
   RENDER REPORT
========================================================= */


function renderFilteredMemberAccounting(rows, title) {
  const target = $("reportOutput");
  if (!target) return;

  target.innerHTML = `
    <div class="report-table-wrap">
      <h3>${escapeHTML(title)}</h3>
      <table class="report-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Member No.</th>
            <th>Previous Outstanding</th>
            <th>Due</th>
            <th>Applied</th>
            <th>Outstanding</th>
            <th>Credit</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(row => `
            <tr>
              <td>${escapeHTML(getMemberName(row.member_id))}</td>
              <td>${escapeHTML(getMemberNumber(row.member_id) || "—")}</td>
              <td>${formatCurrency(
                row.previous_outstanding ??
                row.previous_arrears ??
                row.outstanding_before ??
                0
              )}</td>
              <td>${formatCurrency(canonicalDue(row))}</td>
              <td>${formatCurrency(canonicalApplied(row))}</td>
              <td>${formatCurrency(canonicalOutstanding(row))}</td>
              <td>${formatCurrency(canonicalCredit(row))}</td>
              <td>${escapeHTML(getStatusLabel(canonicalRowStatus(row)))}</td>
            </tr>
          `).join("") : `
            <tr><td colspan="8">No members match this filter for the selected accounting month.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  `;
}

function renderSelectedReport(
  type,
  contributionRows,
  expenseRows,
  meetingRows,
  canonicalRows,
  cumulativeRows
) {
  currentReportType = type;

  const label =
    REPORT_TYPE_LABELS[type] ||
    "Report";

  const month =
    getAccountingMonth();

  setReportHeader(
    label,
    `Accounting month: ${month}`
  );

  const selectedStatus =
    lower($("statusFilter")?.value || "");

  const hasMonthlyFilter =
    activeQuickFilter !== "all" ||
    (selectedStatus &&
      selectedStatus !== "all" &&
      !selectedStatus.startsWith("cumulative-"));

  const hasCumulativeFilter =
    selectedStatus.startsWith("cumulative-");

  if (hasCumulativeFilter) {
    renderCumulativePosition(cumulativeRows);
    setReportHeader(
      "Filtered Cumulative Member Position",
      `Accounting month: ${month} • ${selectedStatus.replace(/-/g, " ")}`
    );
  } else if (hasMonthlyFilter) {
    const filterTitle = activeQuickFilter !== "all"
      ? ({
          attention: "Needs Attention",
          arrears: "Has Previous Outstanding",
          credit: "Has Credit"
        }[activeQuickFilter] || "Filtered Monthly Accounting")
      : (selectedStatus === "outstanding"
          ? "Outstanding Members"
          : selectedStatus === "no-payment"
            ? "Members With No Payment"
            : `Monthly Status: ${selectedStatus}`);

    renderFilteredMemberAccounting(canonicalRows, filterTitle);
    setReportHeader(
      filterTitle,
      `Accounting month: ${month} • ${canonicalRows.length} matching members`
    );
  } else switch (type) {
    case "member-contributions":
      renderMemberContributions(
        contributionRows
      );
      break;

    case "arrears":
      renderMonthlyArrearsReport(
        canonicalRows
      );
      break;

    case "credit":
      renderMonthlyCreditReport(
        canonicalRows
      );
      break;

    case "cumulative-arrears":
      renderCumulativePosition(
        cumulativeRows.filter(
          row => numberValue(row.arrears) > 0
        )
      );
      break;

    case "cumulative-credit":
      renderCumulativePosition(
        cumulativeRows.filter(
          row => numberValue(row.credit) > 0
        )
      );
      break;

    case "cumulative-up-to-date":
      renderCumulativePosition(
        cumulativeRows.filter(
          row =>
            numberValue(row.arrears) <= 0 &&
            numberValue(row.credit) <= 0
        )
      );
      break;

    case "contribution-types":
      renderContributionTypesReport(
        contributionRows
      );
      break;

    case "payment-methods":
      renderPaymentMethodsReport(
        contributionRows
      );
      break;

    case "expenses":
      renderExpensesReport(
        expenseRows
      );
      break;

    case "cash-flow":
      renderCashFlowReport(
        contributionRows,
        expenseRows
      );
      break;

    case "meetings":
      renderMeetingsReport(
        meetingRows
      );
      break;

    case "full":
      renderFullReport(
        contributionRows,
        expenseRows,
        meetingRows
      );
      break;

    case "executive":
    default:
      renderExecutiveReport(
        contributionRows,
        expenseRows,
        meetingRows
      );
      break;
  }

  /*
   * Keep visuals useful regardless of selected report type.
   * They reflect the same current filters.
   */
  renderVisualInsights(
    contributionRows,
    expenseRows,
    canonicalRows,
    cumulativeRows
  );
}



/* =========================================================
   PLAIN-LANGUAGE REPORT STORY
   Uses the same filtered rows and canonical server results
   already loaded for this report. It does not write or
   recalculate canonical member accounting.
   ========================================================= */
function renderReportStory(
  contributionRows,
  expenseRows,
  meetingRows,
  canonicalRows,
  cumulativeRows
) {
  const host = $("reportStory");
  if (!host) return;

  const from = $("fromDate")?.value || "";
  const to = $("toDate")?.value || "";
  const period = from && to
    ? (from === to ? from : `${from} to ${to}`)
    : from || to || getAccountingMonth();

  setText("reportStoryPeriod", `Reporting window: ${period}. Figures below follow the selected filters.`);

  const cashIn = contributionRows.reduce((sum, row) => sum + numberValue(row.amount), 0);
  const approvedExpenseRows = expenseRows.filter(row => lower(row.approval_status) === "approved");
  const approvedOut = approvedExpenseRows.reduce((sum, row) => sum + numberValue(row.amount), 0);
  const pendingExpenseRows = expenseRows.filter(row => lower(row.approval_status) === "pending");
  const pendingOut = pendingExpenseRows.reduce((sum, row) => sum + numberValue(row.amount), 0);
  const periodNet = cashIn - approvedOut;

  const monthlyDue = canonicalRows.reduce((sum, row) => sum + canonicalDue(row), 0);
  const monthlyApplied = canonicalRows.reduce((sum, row) => sum + canonicalApplied(row), 0);
  const monthlyOutstanding = canonicalRows.reduce((sum, row) => sum + canonicalOutstanding(row), 0);
  const cumulativeArrears = cumulativeRows.reduce((sum, row) => sum + numberValue(row.arrears ?? row.total_arrears ?? row.outstanding), 0);
  const cumulativeCredit = cumulativeRows.reduce((sum, row) => sum + numberValue(row.credit ?? row.total_credit), 0);

  const activeMembers = members.filter(member => {
    const status = lower(member.status);
    return !status || status === "active" || status === "approved";
  }).length;

  const money = value => escapeHTML(formatCurrency(value));
  const item = (title, body, tone = "") =>
    `<article class="story-item ${tone}"><h3>${escapeHTML(title)}</h3><p>${body}</p></article>`;

  const parts = [];
  if (!contributionRows.length && !expenseRows.length && !meetingRows.length) {
    parts.push(
      `<div class="report-story-empty"><strong>No activity matched these filters.</strong> This means the current report returned no contribution, expense, or meeting rows for the selected window. It does not prove the group has no historical activity. Check the date range, accounting month, member and status filters, then generate the report again. If you expected records, confirm that the correct group is shown above.</div>`
    );
  } else {
    parts.push(item(
      "1. Money received",
      contributionRows.length
        ? `The report found ${contributionRows.length} contribution record(s), totalling <strong>${money(cashIn)}</strong> in the selected window. This is recorded contribution cash, not a forecast or amount merely due.`
        : "No contribution cash records matched this report window. Check the date and contribution filters if you expected receipts.",
      contributionRows.length ? "story-good" : "story-attention"
    ));
    parts.push(item(
      "2. Spending and period net",
      `${approvedExpenseRows.length} approved expense record(s) total <strong>${money(approvedOut)}</strong>. The simple period net—matched contribution cash less approved expenses—is <strong>${money(periodNet)}</strong>. ${pendingExpenseRows.length ? `${pendingExpenseRows.length} expense record(s), totalling ${money(pendingOut)}, are still pending approval and are not included in approved spending.` : "No pending expense records matched these filters."}`
    ));
    parts.push(item(
      "3. Monthly member accounting",
      canonicalRows.length
        ? `Canonical accounting returned ${canonicalRows.length} member row(s): due ${money(monthlyDue)}, applied/allocated ${money(monthlyApplied)}, and outstanding ${money(monthlyOutstanding)}. These values come from the server-side accounting results; the report does not create or alter obligations, allocations, arrears or credit.`
        : "No canonical monthly accounting rows were returned for this selection. Confirm the accounting month and group context before drawing conclusions."
    ));
    parts.push(item(
      "4. Cumulative position",
      cumulativeRows.length
        ? `Across ${cumulativeRows.length} cumulative member position(s), reported arrears total ${money(cumulativeArrears)} and reported credit totals ${money(cumulativeCredit)}. These are separate member-accounting positions; do not treat credit as cash received during this period.`
        : "No cumulative member positions were returned. Check group access and the selected accounting context."
    ));
    parts.push(item(
      "5. Meetings and membership",
      `The selected window contains ${meetingRows.length} meeting record(s). The group currently has ${activeMembers} active/approved member(s) in the loaded membership list. Meeting count follows the date filter; membership is a current count, not a historical headcount.`
    ));
    if (monthlyOutstanding > 0 || cumulativeArrears > 0 || pendingOut > 0) {
      parts.push(item(
        "Officer follow-up",
        `${monthlyOutstanding > 0 || cumulativeArrears > 0 ? "Review the outstanding and cumulative arrears member lists, confirm due dates and allocations, and follow up through the group's normal process. " : ""}${pendingOut > 0 ? "Review pending expense evidence and record an authorised approval decision. " : ""}Use the detailed tables below to identify the specific records before taking action.`,
        "story-attention"
      ));
    }
  }

  host.innerHTML = parts.join("");
}

/* =========================================================
   SORTABLE REPORT TABLES
   Sorting changes only the visible row order; it does not
   change database data, accounting values, or saved records.
   ========================================================= */
function enableReportTableSorting() {
  queryAll(".table-wrap table thead th").forEach(th => {
    if (th.dataset.sortBound === "true") return;
    th.dataset.sortBound = "true";
    th.dataset.sortable = "true";
    th.tabIndex = 0;
    th.setAttribute("role", "button");
    th.setAttribute("aria-label", `Sort by ${normalizeText(th.textContent)}`);
    th.title = "Select to sort this column";
  });
}

function sortReportTable(th) {
  const table = th.closest("table");
  const body = table?.tBodies?.[0];
  if (!body) return;

  const headers = Array.from(th.parentElement.children);
  const columnIndex = headers.indexOf(th);
  const nextDirection = th.dataset.sortDirection === "asc" ? "desc" : "asc";

  headers.forEach(header => {
    delete header.dataset.sortDirection;
    header.setAttribute("aria-sort", "none");
  });

  th.dataset.sortDirection = nextDirection;
  th.setAttribute("aria-sort", nextDirection === "asc" ? "ascending" : "descending");

  const rows = Array.from(body.rows).filter(row => !row.querySelector(".report-empty"));
  const emptyRows = Array.from(body.rows).filter(row => row.querySelector(".report-empty"));

  const valueFor = row => {
    const cell = row.cells[columnIndex];
    const raw = normalizeText(cell?.textContent || "");
    const cleaned = raw.replace(/[KSh\s,]/gi, "").replace(/%$/, "");
    if (!cleaned) return { raw, numeric: null, date: null };
    const numeric = Number(cleaned);
    const looksLikeDate = /^\d{4}-\d{2}-\d{2}$/.test(raw) || /^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/.test(raw);
    const date = looksLikeDate ? Date.parse(raw) : null;
    return {
      raw,
      numeric: Number.isFinite(numeric) && cleaned !== "" ? numeric : null,
      date: Number.isFinite(date) ? date : null
    };
  };

  rows.sort((a, b) => {
    const av = valueFor(a), bv = valueFor(b);
    let result;
    if (av.date !== null && bv.date !== null) result = av.date - bv.date;
    else if (av.numeric !== null && bv.numeric !== null) result = av.numeric - bv.numeric;
    else result = av.raw.localeCompare(bv.raw, undefined, { numeric: true, sensitivity: "base" });
    return nextDirection === "asc" ? result : -result;
  });

  rows.forEach(row => body.appendChild(row));
  emptyRows.forEach(row => body.appendChild(row));
}

/* =========================================================
   GENERATE REPORT
   ========================================================= */

async function generateReport() {
  clearError();

  try {
    setStatus("Loading report data…");

    const month =
      getAccountingMonth();

    /*
     * These are the canonical accounting reads.
     * No refresh RPC and no accounting mutation.
     */
    await Promise.all([
      loadCanonical(month),
      loadCumulativePositions()
    ]);

    const contributionRows =
      filteredContributions();

    const expenseRows =
      filteredExpenses();

    const meetingRows =
      filteredMeetings();

    const canonicalRows =
      filteredCanonicalStatus();

    const cumulativeRows =
      filteredCumulativePositions();

    currentReportRows = contributionRows;

    updateSummary(
      contributionRows,
      expenseRows
    );

    renderReportStory(
      contributionRows,
      expenseRows,
      meetingRows,
      canonicalRows,
      cumulativeRows
    );
    enableReportTableSorting();

    renderContributionBreakdown(
      contributionRows
    );

    renderExpenseBreakdown(
      expenseRows
    );

    renderContributionEntries(
      contributionRows
    );

    renderExpenseEntries(
      expenseRows
    );

    renderMeetings(
      meetingRows
    );

    renderSelectedReport(
      $("reportType")?.value ||
        DEFAULT_REPORT_TYPE,
      contributionRows,
      expenseRows,
      meetingRows,
      canonicalRows,
      cumulativeRows
    );

    setStatus(
      `Report ready • ${formatNumber(
        contributionRows.length
      )} contribution entries • ${formatNumber(
        expenseRows.length
      )} expense entries`
    );
  } catch (error) {
    console.error(
      "[Reports] generateReport failed:",
      error
    );

    showError(
      friendlyError(error)
    );

    setStatus("");
  }
}


/* =========================================================
   FRIENDLY ERRORS
   ========================================================= */

function friendlyError(error) {
  const message =
    normalizeText(
      error?.message ||
      error?.error_description ||
      error
    );

  const safeMessages = {
    AUTHENTICATION_REQUIRED:
      "You must be signed in to view reports.",

    ACTIVE_GROUP_MEMBER_REQUIRED:
      "Your account must be an active group member to view reports.",

    GROUP_CONTEXT_REQUIRED:
      "Your group context could not be loaded.",

    PGRST116:
      "The requested report data could not be found."
  };

  if (safeMessages[message]) {
    return safeMessages[message];
  }

  if (
    message.toLowerCase().includes(
      "permission"
    )
  ) {
    return "You do not have permission to view this report.";
  }

  return (
    message ||
    "Unable to generate the report."
  );
}


/* =========================================================
   RESET
   ========================================================= */

function resetFilters() {
  activeQuickFilter = "all";

  if ($("reportType")) {
    $("reportType").value =
      DEFAULT_REPORT_TYPE;
  }

  if ($("periodPreset")) {
    $("periodPreset").value =
      DEFAULT_PERIOD_PRESET;
  }

  applyPeriodPreset();

  const ids = [
    "memberFilter",
    "statusFilter",
    "contributionTypeFilter",
    "paymentMethodFilter"
  ];

  for (const id of ids) {
    const el = $(id);

    if (el) {
      el.value = "";
    }
  }

  queryAll(
    "[data-quick]"
  ).forEach(button => {
    button.classList.remove("active");
    button.removeAttribute("aria-pressed");
  });

  const allButton =
    query(
      '[data-quick="all"]'
    );

  if (allButton) {
    allButton.classList.add("active");
    allButton.setAttribute(
      "aria-pressed",
      "true"
    );
  }

  generateReport();
}


/* =========================================================
   QUICK FILTERS
   ========================================================= */

function applyQuickFilter(filter) {
  activeQuickFilter =
    filter || "all";

  queryAll(
    "[data-quick]"
  ).forEach(button => {
    const active =
      button.dataset.quick ===
      activeQuickFilter;

    button.classList.toggle(
      "active",
      active
    );

    button.setAttribute(
      "aria-pressed",
      active ? "true" : "false"
    );
  });

  generateReport();
}


/* =========================================================
   CSV EXPORT
   ========================================================= */

function csvEscape(value) {
  const text =
    String(value ?? "");

  return `"${text
    .replace(/"/g, '""')
    .replace(/\r?\n/g, " ")}"`;
}

function downloadBlob(
  blob,
  filename
) {
  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );
}

function reportFilename(extension) {
  const group =
    normalizeText(
      currentGroup?.name ||
      "group"
    )
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") ||
    "group";

  const type =
    normalizeText(
      REPORT_TYPE_LABELS[
        $("reportType")?.value ||
        DEFAULT_REPORT_TYPE
      ] ||
      "report"
    )
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const month =
    getAccountingMonth()
      .replace(/[^0-9-]/g, "");

  return `chama-live-${group}-${type}-${month}.${extension}`;
}

function exportCSV() {
  try {
    const contributionRows =
      filteredContributions();

    const expenseRows =
      filteredExpenses();

    const cumulativeRows =
      filteredCumulativePositions();

    const canonicalRows =
      filteredCanonicalStatus();

    const lines = [];

    lines.push(
      [
        "REPORT",
        REPORT_TYPE_LABELS[
          $("reportType")?.value ||
          DEFAULT_REPORT_TYPE
        ]
      ]
        .map(csvEscape)
        .join(",")
    );

    lines.push("");

    lines.push(
      [
        "MONTHLY MEMBER ACCOUNTING"
      ]
        .map(csvEscape)
        .join(",")
    );

    lines.push(
      [
        "Member",
        "Member Number",
        "Due",
        "Applied",
        "Outstanding",
        "Credit",
        "Status"
      ]
        .map(csvEscape)
        .join(",")
    );

    for (const row of canonicalRows) {
      lines.push(
        [
          getMemberName(row.member_id),
          getMemberNumber(row.member_id),
          canonicalDue(row),
          canonicalApplied(row),
          canonicalOutstanding(row),
          canonicalCredit(row),
          getStatusLabel(
            canonicalRowStatus(row)
          )
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    lines.push("");

    lines.push(
      [
        "CONTRIBUTIONS"
      ]
        .map(csvEscape)
        .join(",")
    );

    lines.push(
      [
        "Date",
        "Member",
        "Member Number",
        "Contribution Type",
        "Payment Method",
        "Amount",
        "ID"
      ]
        .map(csvEscape)
        .join(",")
    );

    for (const row of contributionRows) {
      lines.push(
        [
          formatDate(
            row.contribution_date ||
            row.created_at
          ),
          getMemberName(row.member_id),
          getMemberNumber(row.member_id),
          row.contribution_type,
          row.payment_method,
          row.amount,
          row.id
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    lines.push("");

    lines.push(
      [
        "EXPENSES"
      ]
        .map(csvEscape)
        .join(",")
    );

    lines.push(
      [
        "Date",
        "Description",
        "Category",
        "Amount",
        "Approval Status",
        "Recorded By",
        "Receipt"
      ]
        .map(csvEscape)
        .join(",")
    );

    for (const row of expenseRows) {
      lines.push(
        [
          formatDate(
            row.date ||
            row.created_at
          ),
          row.description,
          row.category,
          row.amount,
          row.approval_status,
          row.recorded_by,
          row.receipt_url
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    lines.push("");

    lines.push(
      [
        "CUMULATIVE MEMBER POSITION"
      ]
        .map(csvEscape)
        .join(",")
    );

    lines.push(
      [
        "Member",
        "Member Number",
        "Total Due",
        "Total Allocated",
        "Arrears",
        "Credit",
        "Status"
      ]
        .map(csvEscape)
        .join(",")
    );

    for (const row of cumulativeRows) {
      lines.push(
        [
          getMemberName(row.member_id),
          getMemberNumber(row.member_id),
          row.total_due,
          row.total_allocated,
          row.arrears,
          row.credit,
          getStatusLabel(row.status)
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    const blob =
      new Blob(
        [lines.join("\r\n")],
        {
          type:
            "text/csv;charset=utf-8"
        }
      );

    downloadBlob(
      blob,
      reportFilename("csv")
    );

    setStatus(
      "CSV report downloaded."
    );
  } catch (error) {
    console.error(
      "[Reports] CSV export failed:",
      error
    );

    showError(
      "Unable to download the CSV report."
    );
  }
}


/* =========================================================
   EXCEL EXPORT
   ========================================================= */

function excelEscape(value) {
  return escapeHTML(
    String(value ?? "")
  );
}

function exportExcel() {
  try {
    const contributionRows =
      filteredContributions();

    const expenseRows =
      filteredExpenses();

    const meetingRows =
      filteredMeetings();

    const cumulativeRows =
      filteredCumulativePositions();

    const canonicalRows =
      filteredCanonicalStatus();

    const reportName =
      REPORT_TYPE_LABELS[
        $("reportType")?.value ||
        DEFAULT_REPORT_TYPE
      ] || "Report";

    const html = `
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: Arial, sans-serif;
            }

            h1, h2 {
              margin-bottom: 8px;
            }

            table {
              border-collapse: collapse;
              width: 100%;
              margin-bottom: 24px;
            }

            th, td {
              border: 1px solid #999;
              padding: 6px;
              text-align: left;
            }

            th {
              font-weight: bold;
            }
          </style>
        </head>

        <body>

          <h1>
            CHAMA LIVE — ${excelEscape(reportName)}
          </h1>

          <p>
            Group:
            ${excelEscape(
              currentGroup?.name ||
              "Group"
            )}
          </p>

          <p>
            Accounting Month:
            ${excelEscape(
              getAccountingMonth()
            )}
          </p>

          <h2>Monthly Member Accounting</h2>

          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Member Number</th>
                <th>Due</th>
                <th>Applied</th>
                <th>Outstanding</th>
                <th>Credit</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              ${canonicalRows.map(row => `
                <tr>
                  <td>${excelEscape(
                    getMemberName(row.member_id)
                  )}</td>

                  <td>${excelEscape(
                    getMemberNumber(row.member_id)
                  )}</td>

                  <td>${excelEscape(
                    canonicalDue(row)
                  )}</td>

                  <td>${excelEscape(
                    canonicalApplied(row)
                  )}</td>

                  <td>${excelEscape(
                    canonicalOutstanding(row)
                  )}</td>

                  <td>${excelEscape(
                    canonicalCredit(row)
                  )}</td>

                  <td>${excelEscape(
                    getStatusLabel(
                      canonicalRowStatus(row)
                    )
                  )}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <h2>Contributions</h2>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Member</th>
                <th>Member Number</th>
                <th>Contribution Type</th>
                <th>Payment Method</th>
                <th>Amount</th>
                <th>ID</th>
              </tr>
            </thead>

            <tbody>
              ${contributionRows.map(row => `
                <tr>
                  <td>${excelEscape(
                    formatDate(
                      row.contribution_date ||
                      row.created_at
                    )
                  )}</td>

                  <td>${excelEscape(
                    getMemberName(row.member_id)
                  )}</td>

                  <td>${excelEscape(
                    getMemberNumber(row.member_id)
                  )}</td>

                  <td>${excelEscape(
                    row.contribution_type
                  )}</td>

                  <td>${excelEscape(
                    row.payment_method
                  )}</td>

                  <td>${excelEscape(
                    row.amount
                  )}</td>

                  <td>${excelEscape(
                    row.id
                  )}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <h2>Expenses</h2>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Approval Status</th>
                <th>Recorded By</th>
                <th>Receipt</th>
              </tr>
            </thead>

            <tbody>
              ${expenseRows.map(row => `
                <tr>
                  <td>${excelEscape(
                    formatDate(
                      row.date ||
                      row.created_at
                    )
                  )}</td>

                  <td>${excelEscape(
                    row.description
                  )}</td>

                  <td>${excelEscape(
                    row.category
                  )}</td>

                  <td>${excelEscape(
                    row.amount
                  )}</td>

                  <td>${excelEscape(
                    row.approval_status
                  )}</td>

                  <td>${excelEscape(
                    row.recorded_by
                  )}</td>

                  <td>${excelEscape(
                    row.receipt_url
                  )}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <h2>Cumulative Member Position</h2>

          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Member Number</th>
                <th>Total Due</th>
                <th>Total Allocated</th>
                <th>Arrears</th>
                <th>Credit</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              ${cumulativeRows.map(row => `
                <tr>
                  <td>${excelEscape(
                    getMemberName(row.member_id)
                  )}</td>

                  <td>${excelEscape(
                    getMemberNumber(row.member_id)
                  )}</td>

                  <td>${excelEscape(
                    row.total_due
                  )}</td>

                  <td>${excelEscape(
                    row.total_allocated
                  )}</td>

                  <td>${excelEscape(
                    row.arrears
                  )}</td>

                  <td>${excelEscape(
                    row.credit
                  )}</td>

                  <td>${excelEscape(
                    getStatusLabel(row.status)
                  )}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <h2>Meetings</h2>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Meeting</th>
                <th>Venue</th>
                <th>Status</th>
                <th>Agenda</th>
                <th>Resolution</th>
              </tr>
            </thead>

            <tbody>
              ${meetingRows.map(row => `
                <tr>
                  <td>${excelEscape(
                    formatDate(row.date)
                  )}</td>

                  <td>${excelEscape(
                    row.title
                  )}</td>

                  <td>${excelEscape(
                    row.venue
                  )}</td>

                  <td>${excelEscape(
                    row.status
                  )}</td>

                  <td>${excelEscape(
                    row.agenda
                  )}</td>

                  <td>${excelEscape(
                    row.resolution
                  )}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

        </body>
      </html>
    `;

    const blob =
      new Blob(
        [html],
        {
          type:
            "application/vnd.ms-excel;charset=utf-8"
        }
      );

    downloadBlob(
      blob,
      reportFilename("xls")
    );

    setStatus(
      "Excel-compatible report downloaded."
    );
  } catch (error) {
    console.error(
      "[Reports] Excel export failed:",
      error
    );

    showError(
      "Unable to download the Excel report."
    );
  }
}


/* =========================================================
   PRINT
   ========================================================= */

function printReport() {
  try {
    window.print();
  } catch (error) {
    console.error(
      "[Reports] Print failed:",
      error
    );

    showError(
      "Unable to open the print dialog."
    );
  }
}


/* =========================================================
   EVENT BINDING
   ========================================================= */

function bindEvents() {
  document.addEventListener("click", event => {
    const th = event.target.closest(".table-wrap table thead th[data-sortable='true']");
    if (th) sortReportTable(th);
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const th = event.target.closest(".table-wrap table thead th[data-sortable='true']");
    if (!th) return;
    event.preventDefault();
    sortReportTable(th);
  });

  const generateButton =
    $("applyFilters");

  if (generateButton) {
    generateButton.addEventListener(
      "click",
      generateReport
    );
  }

  const resetButton =
    $("resetFilters");

  if (resetButton) {
    resetButton.addEventListener(
      "click",
      resetFilters
    );
  }

  const printButton =
    $("printReport");

  if (printButton) {
    printButton.addEventListener(
      "click",
      printReport
    );
  }

  const csvButton =
    $("csvButton");

  if (csvButton) {
    csvButton.addEventListener(
      "click",
      exportCSV
    );
  }

  const excelButton =
    $("excelButton");

  if (excelButton) {
    excelButton.addEventListener(
      "click",
      exportExcel
    );
  }

  const periodPreset =
    $("periodPreset");

  if (periodPreset) {
    periodPreset.addEventListener(
      "change",
      () => {
        applyPeriodPreset();
        generateReport();
      }
    );
  }

  const accountingMonth =
    $("accountingMonth");

  if (accountingMonth) {
    accountingMonth.addEventListener(
      "change",
      generateReport
    );
  }

  const regularFilters = [
    "reportType",
    "fromDate",
    "toDate",
    "memberFilter",
    "contributionTypeFilter",
    "paymentMethodFilter",
    "statusFilter",
    "groupBy"
  ];

  for (const id of regularFilters) {
    const el = $(id);

    if (!el) continue;

    el.addEventListener(
      "change",
      generateReport
    );
  }

  queryAll(
    "[data-quick]"
  ).forEach(button => {
    button.addEventListener(
      "click",
      () => {
        applyQuickFilter(
          button.dataset.quick
        );
      }
    );
  });

  const customSelector =
    $("customContributionMemberStatusSelect");

  if (customSelector) {
    customSelector.addEventListener(
      "change",
      refreshSelectedCustomContribution
    );
  }

  /*
   * Redraw native canvas charts after a layout resize.
   * ResizeObserver is preferred, but window resize is also
   * supported for older browsers.
   */
  let resizeTimer = null;

  window.addEventListener(
    "resize",
    () => {
      clearTimeout(resizeTimer);

      resizeTimer = setTimeout(
        () => {
          if (!$(VISUALS_ID)) {
            return;
          }

          renderVisualInsights(
            filteredContributions(),
            filteredExpenses(),
            filteredCanonicalStatus(),
            filteredCumulativePositions()
          );
        },
        150
      );
    },
    { passive: true }
  );
}


/* =========================================================
   INITIAL FILTERS
   ========================================================= */

function initializeFilters() {
  if ($("reportType") &&
      !$("reportType").value) {
    $("reportType").value =
      DEFAULT_REPORT_TYPE;
  }

  if ($("periodPreset") &&
      !$("periodPreset").value) {
    $("periodPreset").value =
      DEFAULT_PERIOD_PRESET;
  }

  applyPeriodPreset();

  activeQuickFilter = "all";

  queryAll(
    "[data-quick]"
  ).forEach(button => {
    const active =
      button.dataset.quick ===
      "all";

    button.classList.toggle(
      "active",
      active
    );

    button.setAttribute(
      "aria-pressed",
      active ? "true" : "false"
    );
  });
}


/* =========================================================
   INIT
   ========================================================= */

export async function initPage() {
  clearError();
  setStatus("Loading reports…");

  try {
    initializeFilters();

    bindEvents();

    await loadContext();

    await Promise.all([
      loadMembers(),
      loadContributions(),
      loadExpenses(),
      loadMeetings()
    ]);

    await loadActiveCustomContributionStatus();

    await generateReport();

    console.log(
      "[Reports] Ready — canonical read-only reporting + visual insights."
    );
  } catch (error) {
    console.error(
      "[Reports] Initialization failed:",
      error
    );

    showError(
      friendlyError(error)
    );

    setStatus("");
  }
}


/* =========================================================
   BACKWARD-COMPATIBLE EXPORT
   ========================================================= */

export const initReports =
  initPage;