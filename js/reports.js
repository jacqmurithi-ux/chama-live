import { supabase } from "./supabase.js";
import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";

/* =========================================================
   CHAMA LIVE — REPORTS
   =========================================================

   READ-ONLY REPORTING

   Canonical accounting chain:

   Obligation
        ↓
   Payment
        ↓
   Allocation
        ↓
   Arrears / Credit

   Canonical RPCs:
   - get_canonical_member_monthly_status()
   - get_canonical_monthly_accounting_summary()

   IMPORTANT:
   This file NEVER calls:
   - refresh_canonical_contribution_accounting()
   - cl_2b_refresh_member()

   Reports only READ existing accounting results.

   ========================================================= */

console.log("CHAMA LIVE: reports.js loaded");

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

let currentReportRows = [];
let currentReportType = "executive";

/* =========================================================
   DOM HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = $(id);
  if (node) {
    node.textContent = value ?? "";
  }
}

function showStatus(message) {
  const node = $("statusMessage");

  if (!node) return;

  node.textContent = message || "";
  node.classList.toggle("hidden", !message);
}

function clearStatus() {
  showStatus("");
}

function showError(message) {
  const node = $("errorMessage");

  if (!node) return;

  node.textContent = message || "Something went wrong.";
  node.classList.remove("hidden");
}

function clearError() {
  const node = $("errorMessage");

  if (!node) return;

  node.textContent = "";
  node.classList.add("hidden");
}

/* =========================================================
   SAFE FORMATTING
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(value) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function number(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRows(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (data) {
    return [data];
  }

  return [];
}

/* =========================================================
   DATE HELPERS
   ========================================================= */

function today() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonth(date = new Date()) {
  const d = new Date(date);

  return `${d.getFullYear()}-${String(
    d.getMonth() + 1
  ).padStart(2, "0")}-01`;
}

function monthKey(value) {
  if (!value) {
    return "";
  }

  const raw = String(value);

  if (/^\d{4}-\d{2}$/.test(raw)) {
    return raw;
  }

  const d = new Date(raw);

  if (Number.isNaN(d.getTime())) {
    return raw.slice(0, 7);
  }

  return `${d.getFullYear()}-${String(
    d.getMonth() + 1
  ).padStart(2, "0")}`;
}

function monthStart(month) {
  return month ? `${month}-01` : "";
}

function nextMonthStart(month) {
  if (!month) {
    return "";
  }

  const parts = String(month).split("-").map(Number);

  if (parts.length !== 2) {
    return "";
  }

  const year = parts[0];
  const monthNumber = parts[1];

  if (!year || !monthNumber) {
    return "";
  }

  const d = new Date(year, monthNumber, 1);

  return `${d.getFullYear()}-${String(
    d.getMonth() + 1
  ).padStart(2, "0")}-01`;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const raw = String(value).slice(0, 10);

  const d = new Date(`${raw}T00:00:00`);

  if (Number.isNaN(d.getTime())) {
    return String(value);
  }

  return d.toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatMonth(value) {
  if (!value) {
    return "—";
  }

  const raw = String(value).slice(0, 7);
  const parts = raw.split("-").map(Number);

  if (parts.length !== 2) {
    return String(value);
  }

  const year = parts[0];
  const month = parts[1];

  if (!year || !month) {
    return String(value);
  }

  return new Date(year, month - 1, 1).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "long"
  });
}

function normalizeDate(value) {
  if (!value) {
    return "";
  }

  return String(value).slice(0, 10);
}

function inRange(value, from, to) {
  const date = normalizeDate(value);

  if (!date) {
    return false;
  }

  if (from && date < from) {
    return false;
  }

  if (to && date > to) {
    return false;
  }

  return true;
}

/* =========================================================
   PERIOD FILTERS
   ========================================================= */

function setPeriod(from, to) {
  if ($("fromDate")) {
    $("fromDate").value = from;
  }

  if ($("toDate")) {
    $("toDate").value = to;
  }
}

function setPeriodFromPreset(preset) {
  const now = new Date();

  const year = now.getFullYear();
  const monthIndex = now.getMonth();

  switch (preset) {
    case "this-month":
      setPeriod(
        firstDayOfMonth(now),
        today()
      );
      break;

    case "last-month": {
      const first = new Date(
        year,
        monthIndex - 1,
        1
      );

      const last = new Date(
        year,
        monthIndex,
        0
      );

      setPeriod(
        firstDayOfMonth(first),
        last.toISOString().slice(0, 10)
      );

      break;
    }

    case "this-quarter": {
      const quarterStart =
        Math.floor(monthIndex / 3) * 3;

      const first = new Date(
        year,
        quarterStart,
        1
      );

      setPeriod(
        firstDayOfMonth(first),
        today()
      );

      break;
    }

    case "this-year":
      setPeriod(
        `${year}-01-01`,
        today()
      );
      break;

    case "custom":
    default:
      break;
  }
}

function setDefaultFilters() {
  const now = new Date();

  if ($("periodPreset")) {
    $("periodPreset").value = "this-month";
  }

  setPeriodFromPreset("this-month");

  if ($("accountingMonth")) {
    $("accountingMonth").value = monthKey(now);
  }

  if ($("reportType")) {
    $("reportType").value = "executive";
  }

  if ($("memberFilter")) {
    $("memberFilter").value = "all";
  }

  if ($("statusFilter")) {
    $("statusFilter").value = "all";
  }

  if ($("contributionTypeFilter")) {
    $("contributionTypeFilter").value = "all";
  }

  if ($("paymentMethodFilter")) {
    $("paymentMethodFilter").value = "all";
  }

  if ($("groupBy")) {
    $("groupBy").value = "member";
  }

  document
    .querySelectorAll(".quick-filter")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.quick === "all"
      );
    });
}

function selectedPeriod() {
  return {
    from:
      $("fromDate")?.value ||
      firstDayOfMonth(),

    to:
      $("toDate")?.value ||
      today()
  };
}

function selectedAccountingMonth() {
  return (
    $("accountingMonth")?.value ||
    monthKey(
      $("toDate")?.value ||
      today()
    )
  );
}

/* =========================================================
   MEMBER HELPERS
   ========================================================= */

function memberName(memberId) {
  const member = members.find(
    item => String(item.id) === String(memberId)
  );

  if (!member) {
    return "Unknown member";
  }

  return (
    member.name ||
    member.member_number ||
    member.membership_number ||
    "Unnamed member"
  );
}

function memberNumber(memberId) {
  const member = members.find(
    item => String(item.id) === String(memberId)
  );

  if (!member) {
    return "—";
  }

  return (
    member.member_number ||
    member.membership_number ||
    "—"
  );
}

function activeMembers() {
  return members.filter(
    member =>
      String(
        member.status || "active"
      ).toLowerCase() === "active"
  );
}

/* =========================================================
   STATUS HELPERS
   ========================================================= */

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function statusLabel(status) {
  const normalized = normalizeStatus(status);

  switch (normalized) {
    case "paid":
      return "Paid";

    case "partial":
      return "Partial";

    case "credit":
      return "Credit";

    case "outstanding":
      return "Outstanding";

    case "no-payment":
      return "No Payment";

    default:
      return normalized || "Unknown";
  }
}

function statusClass(status) {
  const normalized = normalizeStatus(status);

  if (normalized === "paid") {
    return "status-paid";
  }

  if (normalized === "credit") {
    return "status-credit";
  }

  if (normalized === "partial") {
    return "status-partial";
  }

  if (
    normalized === "outstanding" ||
    normalized === "no-payment"
  ) {
    return "status-outstanding";
  }

  return "status-other";
}

function statusBadge(status) {
  return `
    <span class="status-badge ${statusClass(status)}">
      ${escapeHtml(statusLabel(status))}
    </span>
  `;
}

function contributionTypeLabel(value) {
  const type = String(value || "")
    .trim()
    .toLowerCase();

  if (type === "monthly") {
    return "Monthly";
  }

  if (type === "other") {
    return "Other Savings";
  }

  return value
    ? String(value)
    : "Other";
}

function paymentMethodLabel(value) {
  if (!value) {
    return "Not specified";
  }

  const raw = String(value).trim();

  return raw || "Not specified";
}

function expenseStatus(row) {
  return normalizeStatus(
    row?.approval_status ||
    "pending"
  );
}

/* =========================================================
   AUTHENTICATED GROUP CONTEXT
   ========================================================= */

async function loadContext() {
  currentUser = await requireAuth();

  currentMember = await getMyMember();

  currentGroup = await getMyGroup();

  if (
    !currentMember?.group_id ||
    !currentGroup?.id ||
    currentMember.group_id !== currentGroup.id
  ) {
    throw new Error(
      "Your member and group context could not be verified."
    );
  }

  setText(
    "groupLabel",
    currentGroup.name || "Group"
  );

  setText(
    "printGroupName",
    currentGroup.name || "Group Report"
  );
}

/* =========================================================
   LOAD MEMBERS
   ========================================================= */

async function loadMembers() {
  const {
    data,
    error
  } = await supabase
    .from("members")
    .select(
      [
        "id",
        "group_id",
        "member_number",
        "membership_number",
        "name",
        "status",
        "join_date"
      ].join(",")
    )
    .eq(
      "group_id",
      currentGroup.id
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

  members = data || [];

  const select = $("memberFilter");

  if (select) {
    select.innerHTML =
      `<option value="all">All Members</option>` +
      members
        .map(member => `
          <option value="${escapeHtml(member.id)}">
            ${escapeHtml(
              member.name ||
              member.member_number ||
              "Member"
            )}
          </option>
        `)
        .join("");
  }

  setText(
    "activeMembers",
    activeMembers().length
  );
}

/* =========================================================
   LOAD CONTRIBUTIONS
   ========================================================= */

async function loadContributions() {
  const {
    data,
    error
  } = await supabase
    .from("contributions")
    .select(
      [
        "id",
        "group_id",
        "member_id",
        "amount",
        "contribution_type",
        "month",
        "payment_method",
        "reference",
        "recorded_by",
        "created_at",
        "goal_id",
        "contribution_date",
        "notes",
        "mpesa_reference"
      ].join(",")
    )
    .eq(
      "group_id",
      currentGroup.id
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

  contributions = data || [];

  const methods = [
    ...new Set(
      contributions
        .map(row => row.payment_method)
        .filter(Boolean)
    )
  ].sort();

  const select = $("paymentMethodFilter");

  if (select) {
    select.innerHTML =
      `<option value="all">All Methods</option>` +
      methods
        .map(method => `
          <option value="${escapeHtml(method)}">
            ${escapeHtml(method)}
          </option>
        `)
        .join("");
  }
}

/* =========================================================
   LOAD EXPENSES
   ========================================================= */

async function loadExpenses() {
  const {
    data,
    error
  } = await supabase
    .from("expenses")
    .select(
      [
        "id",
        "group_id",
        "description",
        "category",
        "amount",
        "date",
        "recorded_by",
        "receipt_url",
        "approval_status",
        "created_at"
      ].join(",")
    )
    .eq(
      "group_id",
      currentGroup.id
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

  expenses = data || [];
}

/* =========================================================
   LOAD MEETINGS
   ========================================================= */

async function loadMeetings() {
  const {
    data,
    error
  } = await supabase
    .from("meetings")
    .select(
      [
        "id",
        "group_id",
        "title",
        "date",
        "venue",
        "agenda",
        "minutes",
        "resolution",
        "status",
        "created_at"
      ].join(",")
    )
    .eq(
      "group_id",
      currentGroup.id
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

  meetings = data || [];
}

/* =========================================================
   LOAD CANONICAL ACCOUNTING
   ========================================================= */

async function loadCanonical(month) {
  canonicalStatus = [];
  canonicalSummary = null;

  const {
    data: statusData,
    error: statusError
  } = await supabase.rpc(
    "get_canonical_member_monthly_status",
    {
      p_group_id: currentGroup.id,
      p_month: month
    }
  );

  if (statusError) {
    throw statusError;
  }

  canonicalStatus =
    normalizeRows(statusData);

  const {
    data: summaryData,
    error: summaryError
  } = await supabase.rpc(
    "get_canonical_monthly_accounting_summary",
    {
      p_group_id: currentGroup.id,
      p_month: month
    }
  );

  if (summaryError) {
    throw summaryError;
  }

  canonicalSummary =
    Array.isArray(summaryData)
      ? summaryData[0] || null
      : summaryData || null;
}

/* =========================================================
   FILTERED DATA
   ========================================================= */

function filteredContributions() {
  const {
    from,
    to
  } = selectedPeriod();

  const selectedMember =
    $("memberFilter")?.value ||
    "all";

  const selectedType =
    $("contributionTypeFilter")?.value ||
    "all";

  const selectedMethod =
    $("paymentMethodFilter")?.value ||
    "all";

  return contributions.filter(row => {
    const date =
      row.contribution_date ||
      normalizeDate(row.created_at);

    if (!inRange(date, from, to)) {
      return false;
    }

    if (
      selectedMember !== "all" &&
      String(row.member_id) !==
        String(selectedMember)
    ) {
      return false;
    }

    if (
      selectedMethod !== "all" &&
      String(row.payment_method || "") !==
        String(selectedMethod)
    ) {
      return false;
    }

    if (selectedType !== "all") {
      const type =
        String(
          row.contribution_type || ""
        ).toLowerCase();

      if (
        selectedType === "monthly" &&
        type !== "monthly"
      ) {
        return false;
      }

      if (
        selectedType === "other" &&
        type === "monthly"
      ) {
        return false;
      }
    }

    return true;
  });
}

function filteredExpenses() {
  const {
    from,
    to
  } = selectedPeriod();

  return expenses.filter(row =>
    inRange(
      row.date || row.created_at,
      from,
      to
    )
  );
}

function filteredMeetings() {
  const {
    from,
    to
  } = selectedPeriod();

  return meetings.filter(row =>
    inRange(
      row.date || row.created_at,
      from,
      to
    )
  );
}

function filteredCanonicalStatus() {
  const selectedMember =
    $("memberFilter")?.value ||
    "all";

  const selectedStatus =
    $("statusFilter")?.value ||
    "all";

  return canonicalStatus.filter(row => {
    if (
      selectedMember !== "all" &&
      String(row.member_id) !==
        String(selectedMember)
    ) {
      return false;
    }

    const status =
      normalizeStatus(row.status);

    if (selectedStatus === "all") {
      return true;
    }

    if (selectedStatus === "outstanding") {
      return (
        status === "outstanding" ||
        status === "no-payment"
      );
    }

    if (selectedStatus === "credit") {
      return status === "credit";
    }

    return status === selectedStatus;
  });
}

/* =========================================================
   SUMMARY CARDS
   ========================================================= */

function updateSummary(
  contributionRows,
  expenseRows
) {
  const received =
    contributionRows.reduce(
      (sum, row) =>
        sum + number(row.amount),
      0
    );

  const approved =
    expenseRows
      .filter(
        row =>
          expenseStatus(row) ===
          "approved"
      )
      .reduce(
        (sum, row) =>
          sum + number(row.amount),
        0
      );

  const pending =
    expenseRows
      .filter(
        row =>
          expenseStatus(row) ===
          "pending"
      )
      .reduce(
        (sum, row) =>
          sum + number(row.amount),
        0
      );

  const rejected =
    expenseRows
      .filter(
        row =>
          expenseStatus(row) ===
          "rejected"
      )
      .reduce(
        (sum, row) =>
          sum + number(row.amount),
        0
      );

  setText(
    "totalContributions",
    money(received)
  );

  setText(
    "approvedExpenses",
    money(approved)
  );

  setText(
    "currentBalance",
    money(received - approved)
  );

  setText(
    "pendingExpenses",
    money(pending)
  );

  setText(
    "rejectedExpenses",
    money(rejected)
  );

  setText(
    "reportApplied",
    money(
      canonicalSummary?.applied_this_month
    )
  );

  setText(
    "reportOutstanding",
    money(
      canonicalSummary?.current_outstanding
    )
  );

  setText(
    "reportCarryForward",
    money(
      canonicalSummary?.carry_forward
    )
  );

  setText(
    "reportCollectionRate",
    `${number(
      canonicalSummary?.collection_rate
    ).toFixed(0)}%`
  );
}

/* =========================================================
   BREAKDOWN TABLES
   ========================================================= */

function renderBreakdown(rows) {
  const target =
    $("contributionBreakdownRows");

  if (!target) {
    return;
  }

  const map = new Map();

  rows.forEach(row => {
    const key =
      row.contribution_type ||
      "Other";

    const existing =
      map.get(key) || {
        count: 0,
        amount: 0
      };

    existing.count += 1;
    existing.amount +=
      number(row.amount);

    map.set(key, existing);
  });

  if (!map.size) {
    target.innerHTML = `
      <tr>
        <td colspan="3" class="report-empty">
          No data.
        </td>
      </tr>
    `;

    return;
  }

  target.innerHTML =
    [...map.entries()]
      .map(([type, value]) => `
        <tr>
          <td>
            ${escapeHtml(
              contributionTypeLabel(type)
            )}
          </td>
          <td>
            ${value.count}
          </td>
          <td class="amount">
            ${money(value.amount)}
          </td>
        </tr>
      `)
      .join("");
}

function renderExpenseBreakdown(rows) {
  const target =
    $("expenseBreakdownRows");

  if (!target) {
    return;
  }

  const map = new Map();

  rows.forEach(row => {
    const key =
      row.category ||
      "Uncategorised";

    const existing =
      map.get(key) || {
        count: 0,
        amount: 0
      };

    existing.count += 1;
    existing.amount +=
      number(row.amount);

    map.set(key, existing);
  });

  if (!map.size) {
    target.innerHTML = `
      <tr>
        <td colspan="3" class="report-empty">
          No data.
        </td>
      </tr>
    `;

    return;
  }

  target.innerHTML =
    [...map.entries()]
      .map(([category, value]) => `
        <tr>
          <td>
            ${escapeHtml(category)}
          </td>
          <td>
            ${value.count}
          </td>
          <td class="amount">
            ${money(value.amount)}
          </td>
        </tr>
      `)
      .join("");
}

/* =========================================================
   CONTRIBUTION ENTRIES
   ========================================================= */

function renderContributionEntries(rows) {
  const target =
    $("reportContributionEntries");

  if (!target) {
    return;
  }

  if (!rows.length) {
    target.innerHTML = `
      <tr>
        <td colspan="6" class="report-empty">
          No data.
        </td>
      </tr>
    `;

    return;
  }

  target.innerHTML =
    rows
      .map(row => `
        <tr>
          <td>
            ${escapeHtml(
              formatDate(
                row.contribution_date ||
                row.created_at
              )
            )}
          </td>

          <td>
            ${escapeHtml(
              memberName(row.member_id)
            )}
          </td>

          <td>
            ${escapeHtml(
              contributionTypeLabel(
                row.contribution_type
              )
            )}
          </td>

          <td>
            ${escapeHtml(
              paymentMethodLabel(
                row.payment_method
              )
            )}
          </td>

          <td>
            ${escapeHtml(
              row.reference ||
              row.mpesa_reference ||
              "—"
            )}
          </td>

          <td class="amount">
            ${money(row.amount)}
          </td>
        </tr>
      `)
      .join("");
}

/* =========================================================
   EXPENSE ENTRIES
   ========================================================= */

function renderExpenseEntries(rows) {
  const target =
    $("reportExpenseEntries");

  if (!target) {
    return;
  }

  if (!rows.length) {
    target.innerHTML = `
      <tr>
        <td colspan="5" class="report-empty">
          No data.
        </td>
      </tr>
    `;

    return;
  }

  target.innerHTML =
    rows
      .map(row => `
        <tr>
          <td>
            ${escapeHtml(
              formatDate(row.date)
            )}
          </td>

          <td>
            ${escapeHtml(
              row.description ||
              "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              row.category ||
              "Uncategorised"
            )}
          </td>

          <td>
            ${statusBadge(
              row.approval_status
            )}
          </td>

          <td class="amount">
            ${money(row.amount)}
          </td>
        </tr>
      `)
      .join("");
}

/* =========================================================
   MEETINGS
   ========================================================= */

function renderMeetings(rows) {
  const target =
    $("meetingRows");

  if (target) {
    if (!rows.length) {
      target.innerHTML = `
        <tr>
          <td colspan="4" class="report-empty">
            No meetings.
          </td>
        </tr>
      `;
    } else {
      target.innerHTML =
        rows
          .map(row => `
            <tr>
              <td>
                ${escapeHtml(
                  formatDate(row.date)
                )}
              </td>

              <td>
                ${escapeHtml(
                  row.title || "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  row.venue || "—"
                )}
              </td>

              <td>
                ${statusBadge(
                  row.status ||
                  "scheduled"
                )}
              </td>
            </tr>
          `)
          .join("");
    }
  }

  setText(
    "totalMeetings",
    rows.length
  );

  const todayDate =
    today();

  const upcoming =
    rows.filter(
      row =>
        normalizeDate(row.date) >=
        todayDate
    ).length;

  setText(
    "upcomingMeetings",
    upcoming
  );
}

/* =========================================================
   REPORT OUTPUT
   ========================================================= */

function renderReportOutput(
  type,
  contributionRows,
  expenseRows,
  meetingRows
) {
  const output =
    $("reportOutput");

  if (!output) {
    return;
  }

  const month =
    selectedAccountingMonth();

  const statusRows =
    filteredCanonicalStatus();

  currentReportRows = [];

  setText(
    "reportOutputTitle",
    $("reportType")?.selectedOptions?.[0]
      ?.textContent ||
      "Report"
  );

  setText(
    "reportOutputSubtitle",
    `${formatDate(
      selectedPeriod().from
    )} — ${formatDate(
      selectedPeriod().to
    )}`
  );

  setText(
    "printReportType",
    $("reportType")?.selectedOptions?.[0]
      ?.textContent ||
      "Executive Summary"
  );

  setText(
    "printPeriod",
    `${formatDate(
      selectedPeriod().from
    )} — ${formatDate(
      selectedPeriod().to
    )}`
  );

  setText(
    "printAccountingMonth",
    formatMonth(month)
  );

  setText(
    "printGeneratedAt",
    new Date().toLocaleString(
      "en-KE"
    )
  );

  if (type === "member-contributions") {
    currentReportRows =
      statusRows;

    output.innerHTML =
      statusRows.length
        ? `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Member No.</th>
                  <th class="amount">Due</th>
                  <th class="amount">Previous Outstanding</th>
                  <th class="amount">Current Payment</th>
                  <th class="amount">Applied</th>
                  <th class="amount">Credit</th>
                  <th class="amount">Outstanding</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                ${statusRows.map(row => `
                  <tr>
                    <td>
                      ${escapeHtml(
                        row.member_name ||
                        memberName(row.member_id)
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        row.member_number ||
                        memberNumber(row.member_id)
                      )}
                    </td>

                    <td class="amount">
                      ${money(row.monthly_due)}
                    </td>

                    <td class="amount">
                      ${money(
                        row.previous_outstanding
                      )}
                    </td>

                    <td class="amount">
                      ${money(
                        row.current_month_payment
                      )}
                    </td>

                    <td class="amount">
                      ${money(
                        row.applied_this_month
                      )}
                    </td>

                    <td class="amount">
                      ${money(
                        row.carry_forward
                      )}
                    </td>

                    <td class="amount">
                      ${money(
                        row.current_outstanding
                      )}
                    </td>

                    <td>
                      ${statusBadge(row.status)}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `
        : `
          <div class="report-empty">
            No matching member accounting records.
          </div>
        `;

    return;
  }

  if (type === "arrears") {
    const rows =
      statusRows.filter(row =>
        number(
          row.current_outstanding
        ) > 0
      );

    currentReportRows = rows;

    output.innerHTML =
      rows.length
        ? `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Member No.</th>
                  <th class="amount">Outstanding</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                ${rows.map(row => `
                  <tr>
                    <td>
                      ${escapeHtml(
                        row.member_name ||
                        memberName(row.member_id)
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        row.member_number ||
                        memberNumber(row.member_id)
                      )}
                    </td>

                    <td class="amount">
                      ${money(
                        row.current_outstanding
                      )}
                    </td>

                    <td>
                      ${statusBadge(row.status)}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `
        : `
          <div class="report-empty">
            No members currently have outstanding accounting for the selected month.
          </div>
        `;

    return;
  }

  if (type === "credit") {
    const rows =
      statusRows.filter(row =>
        number(row.carry_forward) > 0
      );

    currentReportRows = rows;

    output.innerHTML =
      rows.length
        ? `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Member No.</th>
                  <th class="amount">Carry-forward Credit</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                ${rows.map(row => `
                  <tr>
                    <td>
                      ${escapeHtml(
                        row.member_name ||
                        memberName(row.member_id)
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        row.member_number ||
                        memberNumber(row.member_id)
                      )}
                    </td>

                    <td class="amount">
                      ${money(
                        row.carry_forward
                      )}
                    </td>

                    <td>
                      ${statusBadge(row.status)}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `
        : `
          <div class="report-empty">
            No carry-forward credit for the selected month.
          </div>
        `;

    return;
  }

  if (
    type === "contribution-types" ||
    type === "payment-methods"
  ) {
    const field =
      type === "contribution-types"
        ? "contribution_type"
        : "payment_method";

    const map = new Map();

    contributionRows.forEach(row => {
      const key =
        row[field] ||
        "Unspecified";

      map.set(
        key,
        (map.get(key) || 0) +
          number(row.amount)
      );
    });

    const total =
      contributionRows.reduce(
        (sum, row) =>
          sum + number(row.amount),
        0
      );

    currentReportRows =
      [...map.entries()].map(
        ([key, amount]) => ({
          [field]: key,
          amount
        })
      );

    output.innerHTML =
      map.size
        ? `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    ${
                      field ===
                      "contribution_type"
                        ? "Contribution Type"
                        : "Payment Method"
                    }
                  </th>

                  <th class="amount">
                    Amount
                  </th>

                  <th class="amount">
                    Share
                  </th>
                </tr>
              </thead>

              <tbody>
                ${[...map.entries()]
                  .map(([key, amount]) => `
                    <tr>
                      <td>
                        ${escapeHtml(
                          field ===
                          "contribution_type"
                            ? contributionTypeLabel(key)
                            : paymentMethodLabel(key)
                        )}
                      </td>

                      <td class="amount">
                        ${money(amount)}
                      </td>

                      <td class="amount">
                        ${
                          total
                            ? (
                                amount /
                                total *
                                100
                              ).toFixed(1)
                            : "0.0"
                        }%
                      </td>
                    </tr>
                  `)
                  .join("")}
              </tbody>
            </table>
          </div>
        `
        : `
          <div class="report-empty">
            No matching contribution records.
          </div>
        `;

    return;
  }

  if (type === "expenses") {
    currentReportRows =
      expenseRows;

    output.innerHTML =
      expenseRows.length
        ? `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th class="amount">Amount</th>
                </tr>
              </thead>

              <tbody>
                ${expenseRows.map(row => `
                  <tr>
                    <td>
                      ${escapeHtml(
                        formatDate(row.date)
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        row.description || "—"
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        row.category ||
                        "Uncategorised"
                      )}
                    </td>

                    <td>
                      ${statusBadge(
                        row.approval_status
                      )}
                    </td>

                    <td class="amount">
                      ${money(row.amount)}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `
        : `
          <div class="report-empty">
            No expense records.
          </div>
        `;

    return;
  }

  if (type === "cash-flow") {
    const received =
      contributionRows.reduce(
        (sum, row) =>
          sum + number(row.amount),
        0
      );

    const approved =
      expenseRows
        .filter(
          row =>
            expenseStatus(row) ===
            "approved"
        )
        .reduce(
          (sum, row) =>
            sum + number(row.amount),
          0
        );

    const net =
      received - approved;

    currentReportRows = [
      {
        received,
        approved,
        net
      }
    ];

    output.innerHTML = `
      <div class="report-kpi-grid">

        <div class="report-kpi">
          <span>Received</span>
          <strong>
            ${money(received)}
          </strong>
        </div>

        <div class="report-kpi">
          <span>Approved Expenses</span>
          <strong>
            ${money(approved)}
          </strong>
        </div>

        <div class="report-kpi">
          <span>Net Cash Movement</span>
          <strong>
            ${money(net)}
          </strong>
        </div>

        <div class="report-kpi">
          <span>Canonical Carry-forward</span>
          <strong>
            ${money(
              canonicalSummary?.carry_forward
            )}
          </strong>
        </div>

      </div>
    `;

    return;
  }

  if (type === "meetings") {
    currentReportRows =
      meetingRows;

    output.innerHTML =
      meetingRows.length
        ? `
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Venue</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                ${meetingRows.map(row => `
                  <tr>
                    <td>
                      ${escapeHtml(
                        formatDate(row.date)
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        row.title || "—"
                      )}
                    </td>

                    <td>
                      ${escapeHtml(
                        row.venue || "—"
                      )}
                    </td>

                    <td>
                      ${statusBadge(
                        row.status ||
                        "scheduled"
                      )}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `
        : `
          <div class="report-empty">
            No meetings in the selected period.
          </div>
        `;

    return;
  }

  if (type === "full") {
    currentReportRows =
      contributionRows;

    output.innerHTML = `
      <div class="report-kpi-grid">

        <div class="report-kpi">
          <span>Contribution Entries</span>
          <strong>
            ${contributionRows.length}
          </strong>
        </div>

        <div class="report-kpi">
          <span>Expense Records</span>
          <strong>
            ${expenseRows.length}
          </strong>
        </div>

        <div class="report-kpi">
          <span>Meetings</span>
          <strong>
            ${meetingRows.length}
          </strong>
        </div>

        <div class="report-kpi">
          <span>Accounting Month</span>
          <strong>
            ${escapeHtml(
              formatMonth(month)
            )}
          </strong>
        </div>

      </div>

      <p>
        The detailed contribution, expense and meeting
        tables below are filtered to the selected reporting
        period. Canonical accounting figures are read from
        the canonical monthly accounting RPCs.
      </p>
    `;

    return;
  }

  /* =======================================================
     EXECUTIVE SUMMARY
     ======================================================= */

  currentReportRows =
    statusRows;

  const summary =
    canonicalSummary || {};

  output.innerHTML = `
    <div class="report-kpi-grid">

      <div class="report-kpi">
        <span>Active Members</span>
        <strong>
          ${number(summary.active_members)}
        </strong>
      </div>

      <div class="report-kpi">
        <span>Expected Monthly</span>
        <strong>
          ${money(
            summary.expected_monthly_contributions
          )}
        </strong>
      </div>

      <div class="report-kpi">
        <span>Collected This Month</span>
        <strong>
          ${money(
            summary.total_contributions_collected
          )}
        </strong>
      </div>

      <div class="report-kpi">
        <span>Applied This Month</span>
        <strong>
          ${money(
            summary.applied_this_month
          )}
        </strong>
      </div>

    </div>

    <p>
      Canonical collection rate is based on
      applied accounting against expected monthly
      contributions. Actual cash received in the
      selected reporting period is shown separately.
    </p>
  `;
}

/* =========================================================
   GENERATE REPORT
   ========================================================= */

async function generateReport() {
  clearError();
  clearStatus();

  const month =
    selectedAccountingMonth();

  if (!month) {
    throw new Error(
      "Please select an accounting month."
    );
  }

  showStatus(
    "Generating report…"
  );

  await loadCanonical(month);

  const contributionRows =
    filteredContributions();

  const expenseRows =
    filteredExpenses();

  const meetingRows =
    filteredMeetings();

  currentReportType =
    $("reportType")?.value ||
    "executive";

  updateSummary(
    contributionRows,
    expenseRows
  );

  renderBreakdown(
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

  renderReportOutput(
    currentReportType,
    contributionRows,
    expenseRows,
    meetingRows
  );

  clearStatus();

  showStatus(
    `Report generated for ${formatMonth(month)}.`
  );
}

/* =========================================================
   RESET
   ========================================================= */

function resetFilters() {
  setDefaultFilters();

  generateReport()
    .catch(reportError);
}

/* =========================================================
   QUICK FILTERS
   ========================================================= */

function applyQuickFilter(value) {
  const status =
    $("statusFilter");

  if (value === "all") {
    if (status) {
      status.value = "all";
    }
  }

  if (value === "attention") {
    if (status) {
      status.value = "all";
    }
  }

  if (value === "arrears") {
    if (status) {
      status.value = "outstanding";
    }
  }

  if (value === "credit") {
    if (status) {
      status.value = "credit";
    }
  }

  document
    .querySelectorAll(".quick-filter")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.quick === value
      );
    });

  generateReport()
    .catch(reportError);
}

/* =========================================================
   ERROR HANDLING
   ========================================================= */

function reportError(error) {
  console.error(
    "CHAMA LIVE reports:",
    error
  );

  clearStatus();

  showError(
    error?.message ||
    String(error) ||
    "Unable to generate report."
  );
}

/* =========================================================
   EXPORT HELPERS
   ========================================================= */

function downloadBlob(
  content,
  filename,
  mimeType
) {
  const blob =
    new Blob(
      [content],
      {
        type: mimeType
      }
    );

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
    () =>
      URL.revokeObjectURL(url),
    1000
  );
}

/* =========================================================
   CSV
   ========================================================= */

function csvEscape(value) {
  const text =
    String(value ?? "");

  if (
    /[",\n\r]/.test(text)
  ) {
    return `"${text.replaceAll(
      '"',
      '""'
    )}"`;
  }

  return text;
}

function exportCSV() {
  const rows = [];

  rows.push([
    "CHAMA LIVE Report"
  ]);

  rows.push([
    "Group",
    currentGroup?.name || ""
  ]);

  rows.push([
    "Period",
    `${selectedPeriod().from} to ${selectedPeriod().to}`
  ]);

  rows.push([
    "Accounting Month",
    selectedAccountingMonth()
  ]);

  rows.push([]);

  rows.push([
    "Contribution Date",
    "Member",
    "Member Number",
    "Contribution Type",
    "Payment Method",
    "Reference",
    "Amount"
  ]);

  filteredContributions()
    .forEach(row => {
      rows.push([
        row.contribution_date ||
          normalizeDate(row.created_at),

        memberName(
          row.member_id
        ),

        memberNumber(
          row.member_id
        ),

        contributionTypeLabel(
          row.contribution_type
        ),

        paymentMethodLabel(
          row.payment_method
        ),

        row.reference ||
          row.mpesa_reference ||
          "",

        number(row.amount)
          .toFixed(2)
      ]);
    });

  rows.push([]);

  rows.push([
    "Expense Date",
    "Description",
    "Category",
    "Status",
    "Amount"
  ]);

  filteredExpenses()
    .forEach(row => {
      rows.push([
        row.date ||
          normalizeDate(row.created_at),

        row.description || "",

        row.category || "",

        row.approval_status || "",

        number(row.amount)
          .toFixed(2)
      ]);
    });

  const csv =
    rows
      .map(row =>
        row
          .map(csvEscape)
          .join(",")
      )
      .join("\r\n");

  downloadBlob(
    csv,
    `chama-live-report-${today()}.csv`,
    "text/csv;charset=utf-8"
  );
}

/* =========================================================
   EXCEL-COMPATIBLE EXPORT
   ========================================================= */

function exportExcel() {
  const contributionsRows =
    filteredContributions();

  const expenseRows =
    filteredExpenses();

  const meetingRows =
    filteredMeetings();

  const contributionHtml =
    contributionsRows
      .map(row => `
        <tr>
          <td>
            ${escapeHtml(
              formatDate(
                row.contribution_date ||
                row.created_at
              )
            )}
          </td>

          <td>
            ${escapeHtml(
              memberName(row.member_id)
            )}
          </td>

          <td>
            ${escapeHtml(
              memberNumber(row.member_id)
            )}
          </td>

          <td>
            ${escapeHtml(
              contributionTypeLabel(
                row.contribution_type
              )
            )}
          </td>

          <td>
            ${escapeHtml(
              paymentMethodLabel(
                row.payment_method
              )
            )}
          </td>

          <td>
            ${escapeHtml(
              row.reference ||
              row.mpesa_reference ||
              ""
            )}
          </td>

          <td>
            ${number(row.amount).toFixed(2)}
          </td>
        </tr>
      `)
      .join("");

  const expenseHtml =
    expenseRows
      .map(row => `
        <tr>
          <td>
            ${escapeHtml(
              formatDate(row.date)
            )}
          </td>

          <td>
            ${escapeHtml(
              row.description || ""
            )}
          </td>

          <td>
            ${escapeHtml(
              row.category || ""
            )}
          </td>

          <td>
            ${escapeHtml(
              row.approval_status || ""
            )}
          </td>

          <td>
            ${number(row.amount).toFixed(2)}
          </td>
        </tr>
      `)
      .join("");

  const meetingHtml =
    meetingRows
      .map(row => `
        <tr>
          <td>
            ${escapeHtml(
              formatDate(row.date)
            )}
          </td>

          <td>
            ${escapeHtml(
              row.title || ""
            )}
          </td>

          <td>
            ${escapeHtml(
              row.venue || ""
            )}
          </td>

          <td>
            ${escapeHtml(
              row.status || ""
            )}
          </td>
        </tr>
      `)
      .join("");

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">

  <title>
    CHAMA LIVE Report
  </title>

  <style>
    body {
      font-family: Arial, sans-serif;
    }

    h1,
    h2 {
      margin-bottom: 8px;
    }

    p {
      margin: 4px 0;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 24px;
    }

    th,
    td {
      border: 1px solid #999;
      padding: 7px;
      text-align: left;
    }

    th {
      font-weight: bold;
      background: #eee;
    }
  </style>
</head>

<body>

  <h1>
    CHAMA LIVE —
    ${escapeHtml(
      currentGroup?.name ||
      "Group"
    )}
  </h1>

  <p>
    Period:
    ${escapeHtml(
      selectedPeriod().from
    )}
    —
    ${escapeHtml(
      selectedPeriod().to
    )}
  </p>

  <p>
    Accounting Month:
    ${escapeHtml(
      selectedAccountingMonth()
    )}
  </p>

  <h2>
    Contributions
  </h2>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Member</th>
        <th>Member Number</th>
        <th>Type</th>
        <th>Payment Method</th>
        <th>Reference</th>
        <th>Amount</th>
      </tr>
    </thead>

    <tbody>
      ${
        contributionHtml ||
        `
          <tr>
            <td colspan="7">
              No contribution records.
            </td>
          </tr>
        `
      }
    </tbody>
  </table>

  <h2>
    Expenses
  </h2>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Category</th>
        <th>Status</th>
        <th>Amount</th>
      </tr>
    </thead>

    <tbody>
      ${
        expenseHtml ||
        `
          <tr>
            <td colspan="5">
              No expense records.
            </td>
          </tr>
        `
      }
    </tbody>
  </table>

  <h2>
    Meetings
  </h2>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Title</th>
        <th>Venue</th>
        <th>Status</th>
      </tr>
    </thead>

    <tbody>
      ${
        meetingHtml ||
        `
          <tr>
            <td colspan="4">
              No meetings.
            </td>
          </tr>
        `
      }
    </tbody>
  </table>

</body>
</html>
`;

  downloadBlob(
    html,
    `chama-live-report-${today()}.xls`,
    "application/vnd.ms-excel;charset=utf-8"
  );
}

/* =========================================================
   PRINT
   ========================================================= */

function printReport() {
  setText(
    "printGeneratedAt",
    new Date().toLocaleString(
      "en-KE"
    )
  );

  window.print();
}

/* =========================================================
   EVENT BINDING
   ========================================================= */

function bindEvents() {
  $("applyFilters")
    ?.addEventListener(
      "click",
      () =>
        generateReport()
          .catch(reportError)
    );

  $("resetFilters")
    ?.addEventListener(
      "click",
      resetFilters
    );

  $("printReport")
    ?.addEventListener(
      "click",
      printReport
    );

  $("csvButton")
    ?.addEventListener(
      "click",
      exportCSV
    );

  $("excelButton")
    ?.addEventListener(
      "click",
      exportExcel
    );

  $("periodPreset")
    ?.addEventListener(
      "change",
      event => {
        const value =
          event.target.value;

        if (value !== "custom") {
          setPeriodFromPreset(
            value
          );
        }

        generateReport()
          .catch(reportError);
      }
    );

  [
    "fromDate",
    "toDate",
    "accountingMonth",
    "memberFilter",
    "statusFilter",
    "contributionTypeFilter",
    "paymentMethodFilter",
    "groupBy",
    "reportType"
  ].forEach(id => {
    $(id)?.addEventListener(
      "change",
      () =>
        generateReport()
          .catch(reportError)
    );
  });

  document
    .querySelectorAll(
      ".quick-filter"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () =>
          applyQuickFilter(
            button.dataset.quick
          )
      );
    });
}

/* =========================================================
   INITIALISATION
   ========================================================= */

async function init() {
  try {
    clearError();

    setDefaultFilters();

    bindEvents();

    showStatus(
      "Loading report centre…"
    );

    await loadContext();

    await Promise.all([
      loadMembers(),
      loadContributions(),
      loadExpenses(),
      loadMeetings()
    ]);

    await generateReport();

  } catch (error) {
    reportError(error);
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
    init,
    {
      once: true
    }
  );
} else {
  init();
}
