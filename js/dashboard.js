
/*
=========================================================
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
       Every member row belonging to the current group is
       part of the group membership population.

       members.status is NOT used to exclude a member from
       group membership.

       onboarding_status is NOT used to determine membership.

       Financial/accounting status is separate and comes
       from canonical accounting RPCs.

   CANONICAL MONTHLY ACCOUNTING:
       get_canonical_member_monthly_status()
       get_canonical_monthly_accounting_summary()

   CANONICAL CUMULATIVE ACCOUNTING:
       get_member_contribution_position()

       Cumulative position is separate from monthly accounting.

   CUSTOM / OTHER CONTRIBUTIONS:
       Read-only discovery only. No mutation.

   OPERATIONS SNAPSHOT:
       Read-only counts for support, plans, activities,
       milestones, assets, and contribution goals.

   IMPORTANT:
       admin-layout.js owns initialization.
       Do NOT auto-run initDashboard().

   EXPORTS:
       initDashboard()
       refreshDashboard()
=========================================================
*/

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
let attendance = [];

let supportCases = 0;
let plans = 0;
let activities = 0;
let milestones = 0;
let assets = 0;
let contributionGoals = 0;

let monthlyContribution = 0;

/*
   Active contribution definitions are read-only dashboard
   data.

   IMPORTANT:

   This array must NEVER be treated as an accounting ledger.

   It exists to display active contribution types such as:

       Monthly
       Custom / Other

   and their current rule metadata when the underlying
   read-only source is available.
*/
let activeContributionTypes = [];


/*
   Canonical monthly accounting.
*/
let monthlyStatus = [];
let canonicalSummary = null;


/*
   Cumulative accounting is intentionally kept separate
   from monthlyStatus and canonicalSummary.

   cumulativePositions contains one canonical position
   per group member:

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

  return document.getElementById(id);

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
    numberValue(value);

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

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }


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
   GENERIC STATUS CLASS
========================================================= */

function statusClass(value) {

  return String(
    value || ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      "-"
    )
    .replace(
      /[^a-z0-9_-]/g,
      ""
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

  if (!currentGroup.id) {
    throw new Error(
      "Current group information has no group ID."
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
=========================================================

   IMPORTANT:

   Every row returned for the current group is part of the
   membership population.

   Do NOT filter members.status.

   Do NOT filter onboarding_status.
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
    Array.isArray(data)
      ? data
      : [];

}


/* =========================================================
   LOAD CONTRIBUTIONS
=========================================================

   READ ONLY.

   These rows are used for the recent-contribution display
   and the separate cash-position display.

   They are NOT used to calculate canonical member
   obligation status.

   Canonical accounting comes only from the approved RPCs.
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
        payment_method,
        contribution_date,
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
    Array.isArray(data)
      ? data
      : [];

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
    Array.isArray(data)
      ? data
      : [];

}


/* =========================================================
   LOAD MEETINGS
========================================================= */

async function loadAttendance() {
  // Attendance is linked to a meeting, not directly to a group.
  // Resolve this group's meeting IDs first and scope attendance
  // through meeting_id; do not query a nonexistent attendance.group_id.
  const { data: groupMeetings, error: meetingsError } = await supabase
    .from("meetings")
    .select("id")
    .eq("group_id", currentGroupId);

  if (meetingsError) throw meetingsError;

  const meetingIds = (Array.isArray(groupMeetings) ? groupMeetings : [])
    .map(meeting => meeting.id)
    .filter(Boolean);

  if (meetingIds.length === 0) {
    attendance = [];
    return;
  }

  const { data, error } = await supabase
    .from("attendance")
    .select("id,meeting_id,member_id,status")
    .in("meeting_id", meetingIds);

  if (error) throw error;
  attendance = Array.isArray(data) ? data : [];
}


/* =========================================================
   MEETING ATTENDANCE SUMMARY — ADMIN ONLY
   ---------------------------------------------------------
   RLS remains the authorization boundary. This renderer
   exposes aggregate counts only, never member attendance
   detail.
========================================================= */
function renderAttendanceSummary() {
  const total = attendance.length;
  const present = attendance.filter(row => row.status === "present").length;
  const late = attendance.filter(row => row.status === "late").length;
  const apology = attendance.filter(row => row.status === "apology").length;
  const absent = attendance.filter(row => row.status === "absent").length;
  const rate = total ? Math.round(((present + late) / total) * 100) : 0;

  setText("adminAttendanceRecords", total);
  setText("adminAttendancePresent", present);
  setText("adminAttendanceLate", late);
  setText("adminAttendanceApology", apology);
  setText("adminAttendanceAbsent", absent);
  setText("adminAttendanceRate", total ? String(rate) + "%" : "—");
}


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
    Array.isArray(data)
      ? data
      : [];

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
      .select(
        "id",
        {
          count: "exact",
          head: true
        }
      )
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
      .select(
        "id",
        {
          count: "exact",
          head: true
        }
      )
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
      .select(
        "id",
        {
          count: "exact",
          head: true
        }
      )
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
      .select(
        "id",
        {
          count: "exact",
          head: true
        }
      )
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
      .select(
        "id",
        {
          count: "exact",
          head: true
        }
      )
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
      .select(
        "id",
        {
          count: "exact",
          head: true
        }
      )
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
   ACTIVE CONTRIBUTION TYPES
=========================================================

   IMPORTANT SAFETY BOUNDARY:

   This function is intentionally conservative.

   It attempts to discover an already-exposed read-only
   contribution-definition source without making assumptions
   about a new production schema.

   It does NOT:
       INSERT
       UPDATE
       DELETE
       activate
       create obligations
       create payments
       allocate payments

   If the candidate/read-only source is not available,
   the dashboard simply leaves the active contribution
   definition list empty.

   Monthly is represented by the canonical monthly accounting
   contract and does not require a new database mutation.
========================================================= */

async function loadActiveContributionTypes() {

  activeContributionTypes = [];

  /*
   * Monthly Contribution is a group-level ongoing definition.
   * Read-only source: groups.monthly_contribution.
   */
  monthlyContribution =
    numberValue(
      currentGroup?.monthly_contribution
    );

  try {

    const {
      data,
      error
    } =
      await supabase
        .from("groups")
        .select(
          "monthly_contribution"
        )
        .eq(
          "id",
          currentGroupId
        )
        .single();

    if (!error) {

      monthlyContribution =
        numberValue(
          data?.monthly_contribution
        );

    }

  }
  catch (error) {

    console.warn(
      "CHAMA LIVE: Monthly contribution definition read failed; using authenticated group context.",
      error
    );

  }

  activeContributionTypes.push({

    key: "monthly",

    name: "Monthly Contribution",

    type: "Monthly",

    amount:
      monthlyContribution,

    frequency:
      "Monthly",

    due_date:
      null,

    closing_date:
      null,

    fine_rule:
      "Canonical monthly rule",

    status:
      "Active",

    active:
      true,

    source:
      "groups.monthly_contribution"

  });


  /*
   * Custom contribution definitions are read-only here.
   *
   * Ongoing custom contribution = active period status:
   *   open / due / grace
   *
   * Draft, scheduled, closed and cancelled periods are
   * intentionally excluded.
   */
  const {
    data: contributionTypes,
    error: contributionTypeError
  } =
    await supabase
      .from("contribution_types")
      .select(
        "id,group_id,name,code"
      )
      .eq(
        "group_id",
        currentGroupId
      )
      .eq(
        "code",
        "custom"
      );

  if (contributionTypeError) {

    throw contributionTypeError;

  }

  const customTypes =
    Array.isArray(
      contributionTypes
    )
      ? contributionTypes
      : [];

  if (customTypes.length) {

    const customTypeIds =
      customTypes.map(
        type =>
          type.id
      );

    const {
      data: periods,
      error: periodError
    } =
      await supabase
        .from("contribution_periods")
        .select(
          [
            "id",
            "group_id",
            "contribution_type_id",
            "period_key",
            "opening_date",
            "due_date",
            "closing_date",
            "amount",
            "frequency",
            "status",
            "description",
            "fine_rule_id"
          ].join(",")
        )
        .eq(
          "group_id",
          currentGroupId
        )
        .in(
          "contribution_type_id",
          customTypeIds
        )
        .in(
          "status",
          [
            "open",
            "due",
            "grace"
          ]
        )
        .order(
          "opening_date",
          {
            ascending:
              false
          }
        );

    if (periodError) {

      throw periodError;

    }

    const typeById =
      new Map(
        customTypes.map(
          type => [
            String(type.id),
            type
          ]
        )
      );

    (
      Array.isArray(periods)
        ? periods
        : []
    )
      .filter(
        period =>
          typeById.has(
            String(
              period.contribution_type_id
            )
          )
      )
      .forEach(
        period => {

          const type =
            typeById.get(
              String(
                period.contribution_type_id
              )
            );

          activeContributionTypes.push({

            key:
              `custom:${period.contribution_type_id}`,

            id:
              period.id,

            contribution_type_id:
              period.contribution_type_id,

            name:
              type?.name ||
              "Custom Contribution",

            type:
              "Custom",

            amount:
              numberValue(
                period.amount
              ),

            frequency:
              period.frequency ||
              "—",

            opening_date:
              period.opening_date,

            due_date:
              period.due_date,

            closing_date:
              period.closing_date,

            fine_rule:
              period.fine_rule_id
                ? "Configured"
                : "None",

            fine_rule_id:
              period.fine_rule_id,

            status:
              period.status,

            description:
              period.description || "",

            active:
              true,

            source:
              "contribution_periods"

          });

        }
      );

  }

  renderActiveContributionTypes();

  return activeContributionTypes;

}


/* =========================================================
   ACTIVE CONTRIBUTION TYPE LABEL
========================================================= */

function contributionTypeName(row) {

  return (
    row?.name ||
    row?.contribution_name ||
    row?.title ||
    row?.label ||
    row?.contribution_type ||
    "Contribution"
  );

}


/* =========================================================
   ACTIVE CONTRIBUTION TYPE AMOUNT
========================================================= */

function contributionTypeAmount(row) {

  const candidates = [
    row?.amount,
    row?.contribution_amount,
    row?.required_amount,
    row?.monthly_amount,
    row?.target_amount
  ];


  for (
    const candidate of candidates
  ) {

    if (
      candidate !== null &&
      candidate !== undefined &&
      candidate !== ""
    ) {

      return numberValue(
        candidate
      );

    }

  }


  return null;

}


/* =========================================================
   ACTIVE CONTRIBUTION TYPE CYCLE
========================================================= */

function contributionTypeCycle(row) {

  return (
    row?.cycle ||
    row?.frequency ||
    row?.payment_frequency ||
    row?.period ||
    row?.contribution_cycle ||
    "—"
  );

}


/* =========================================================
   ACTIVE CONTRIBUTION TYPE STATUS
========================================================= */

function contributionTypeStatus(row) {

  if (
    row?.active === true ||
    row?.is_active === true
  ) {

    return "Active";

  }


  if (
    row?.active === false ||
    row?.is_active === false
  ) {

    return "Inactive";

  }


  if (
    row?.status
  ) {

    return String(
      row.status
    );

  }


  return "Active";

}


/* =========================================================
   RENDER ACTIVE CONTRIBUTION TYPES
========================================================= */

function renderActiveContributionTypes() {

  const container =
    el(
      "activeContributionTypeRows"
    );

  if (!container) {

    console.warn(
      "CHAMA LIVE: #activeContributionTypeRows not found."
    );

    return;

  }

  const rows =
    Array.isArray(
      activeContributionTypes
    )
      ? activeContributionTypes
      : [];

  const monthlyRows =
    rows.filter(
      row =>
        row?.type ===
        "Monthly"
    );

  const customRows =
    rows.filter(
      row =>
        row?.type ===
        "Custom"
    );

  setText(
    "activeContributionTypesCount",
    rows.length
  );

  setText(
    "monthlyContributionActiveCount",
    monthlyRows.length
  );

  setText(
    "customContributionTypesCount",
    customRows.length
  );

  setText(
    "activeContributionMembersCount",
    getActiveMembers().length
  );

  if (!rows.length) {

    container.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <strong>No ongoing contributions</strong>
            <span>
              No Monthly or active Custom Contribution definitions
              are currently available.
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

          const isCustom =
            row?.type ===
            "Custom";

          const status =
            String(
              row?.status ||
              "Active"
            );

          const statusClassName =
            statusClass(
              status
            ) ||
            "active";

          const cycle =
            row?.frequency ||
            row?.cycle ||
            (
              isCustom
                ? "—"
                : "Monthly"
            );

          const due =
            row?.due_date
              ? formatDate(
                  row.due_date
                )
              : isCustom
                ? "—"
                : "Current month";

          const closing =
            row?.closing_date
              ? formatDate(
                  row.closing_date
                )
              : "—";

          const fineRule =
            row?.fine_rule ||
            (
              row?.fine_rule_id
                ? "Configured"
                : "None"
            );

          return `
            <tr>

              <td>
                <strong class="active-contribution-name">
                  ${escapeHtml(
                    row?.name ||
                    "Contribution"
                  )}
                </strong>
              </td>

              <td>
                <span class="active-contribution-type ${isCustom ? "custom" : "monthly"}">
                  ${escapeHtml(
                    isCustom
                      ? "Custom"
                      : "Monthly"
                  )}
                </span>
              </td>

              <td>
                ${escapeHtml(
                  money(
                    row?.amount
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  cycle
                )}
              </td>

              <td>
                ${escapeHtml(
                  due
                )}
              </td>

              <td>
                ${escapeHtml(
                  closing
                )}
              </td>

              <td>
                ${escapeHtml(
                  fineRule
                )}
              </td>

              <td>
                <span
                  class="status-badge status-${escapeHtml(
                    statusClassName
                  )}"
                >
                  ${escapeHtml(
                    status
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
   GROUP MEMBERSHIP RULE
=========================================================

   GROUP MEMBERSHIP IS DETERMINED BY THE MEMBERS TABLE.

   Every member row returned for the current group is part
   of the group membership population.

   members.status is NOT used to exclude a member from the
   group membership count.

   onboarding_status is NOT used to determine membership.

   Financial/accounting status is a separate concern and is
   supplied by the canonical accounting RPCs.
========================================================= */

function getActiveMembers() {

  return members.filter(
    member =>
      Boolean(member?.id)
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
    (Array.isArray(data) ? data : [])
      .map(
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


  if (
    canonicalSummary === null ||
    typeof canonicalSummary !== "object"
  ) {

    throw new Error(
      "Canonical monthly summary returned an invalid result."
    );

  }


  return canonicalSummary;

}


/* =========================================================
   CANONICAL CUMULATIVE MEMBER POSITION
========================================================= */

async function loadCumulativePosition(memberId) {
  if (!memberId) {
    throw new Error("Cumulative accounting requires a member ID.");
  }

  const { data, error } = await supabase.rpc(
    "get_member_contribution_position",
    { p_member_id: memberId }
  );

  if (error) {
    console.error("CHAMA LIVE: cumulative member position RPC failed", {
      memberId,
      error
    });
    throw new Error(
      `Cumulative member accounting could not be loaded: ${error.message}`
    );
  }

  const row = Array.isArray(data) ? data[0] : data;

  // An empty result means no position was returned. It is not a zero balance.
  if (!row) {
    console.warn(
      "CHAMA LIVE: no cumulative position returned for member",
      memberId
    );
    return null;
  }

  const returnedMemberId = row.member_id || memberId;

  if (String(returnedMemberId) !== String(memberId)) {
    throw new Error(
      "Cumulative accounting returned a position for a different member."
    );
  }

  return {
    memberId: returnedMemberId,
    groupId: row.group_id || null,
    totalDue: numberValue(row.total_due),
    totalAllocated: numberValue(row.total_allocated),
    arrears: numberValue(row.arrears),
    credit: numberValue(row.credit),
    status: normalizeCumulativeStatus(
      row.status,
      row.arrears,
      row.credit
    )
  };
}

/* =========================================================
   CUMULATIVE STATUS NORMALIZATION
========================================================= */

function normalizeCumulativeStatus(
  value,
  arrearsValue = 0,
  creditValue = 0
) {

  const status =
    String(
      value || ""
    )
      .trim()
      .toUpperCase()
      .replace(
        /[\s-]+/g,
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


  const arrears =
    numberValue(
      arrearsValue
    );


  const credit =
    numberValue(
      creditValue
    );


  if (arrears > 0) {
    return "ARREARS";
  }


  if (credit > 0) {
    return "CREDIT";
  }


  return "UP_TO_DATE";

}


/* =========================================================
   LOAD CUMULATIVE POSITIONS
========================================================= */

async function loadCumulativePositions() {
  cumulativePositions = [];
  cumulativePositionsComplete = false;

  const activeMembers = getActiveMembers();

  if (!activeMembers.length) {
    cumulativePositionsComplete = true;
    return [];
  }

  // Settle per-member requests independently so one absent position does not
  // prevent the dashboard's monthly accounting and operational panels loading.
  const settled = await Promise.allSettled(
    activeMembers.map(member => loadCumulativePosition(member.id))
  );

  const failures = settled.filter(result => result.status === "rejected");
  const positions = settled
    .filter(result => result.status === "fulfilled" && result.value)
    .map(result => result.value);

  // Preserve real RPC/permission failures for the caller to report as unavailable.
  if (failures.length) {
    const reasons = failures.map(result => result.reason?.message || String(result.reason));
    throw new Error(
      `Cumulative accounting failed for ${failures.length} member(s): ${reasons.join("; ")}`
    );
  }

  const invalidResult = positions.find(
    position =>
      position.groupId &&
      String(position.groupId) !== String(currentGroupId)
  );

  if (invalidResult) {
    throw new Error(
      "Cumulative accounting returned a position outside the current group."
    );
  }

  const returnedMemberIds = new Set(
    positions.map(position => String(position.memberId))
  );

  if (returnedMemberIds.size !== positions.length) {
    throw new Error(
      "Cumulative accounting returned duplicate member positions."
    );
  }

  cumulativePositions = positions;
  cumulativePositionsComplete = positions.length === activeMembers.length;

  if (!cumulativePositionsComplete) {
    console.warn("CHAMA LIVE: cumulative accounting is incomplete; missing positions remain unavailable.", {
      expectedMembers: activeMembers.length,
      returnedPositions: positions.length,
      missingMemberIds: activeMembers
        .filter(member => !returnedMemberIds.has(String(member.id)))
        .map(member => member.id)
    });
  }

  return cumulativePositions;
}

/* =========================================================
   CANONICAL ACCOUNTING
========================================================= */

async function loadCanonicalAccounting() {
  const month = getCurrentMonth();

  await loadCanonicalMemberStatus(month);
  await loadCanonicalSummary(month);

  if (!canonicalSummary) {
    throw new Error("Canonical accounting summary was not returned.");
  }

  // Cumulative positions are a separate projection. If they are unavailable,
  // keep that section visibly incomplete without blocking canonical monthly data.
  try {
    await loadCumulativePositions();
  } catch (error) {
    cumulativePositions = [];
    cumulativePositionsComplete = false;
    console.error(
      "CHAMA LIVE: cumulative accounting unavailable; monthly dashboard data can still load.",
      error
    );
  }

  return {
    month,
    monthlyStatus,
    canonicalSummary,
    cumulativePositions,
    cumulativePositionsComplete
  };
}

/* =========================================================
   LOAD ALL DATA
========================================================= */

async function loadData() {
  // Reset the previous dashboard snapshot before loading live data.
  members = [];
  contributions = [];
  expenses = [];
  meetings = [];
  attendance = [];

  supportCases = 0;
  plans = 0;
  activities = 0;
  milestones = 0;
  assets = 0;
  contributionGoals = 0;

  activeContributionTypes = [];
  monthlyStatus = [];
  canonicalSummary = null;
  cumulativePositions = [];
  cumulativePositionsComplete = false;

  // Load live group data only. No demo/sample-data branch.
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
    loadContributionGoals(),
    loadAttendance()
  ]);

  // Accounting figures must come from the canonical accounting RPCs.
  await loadCanonicalAccounting();

  // Read-only contribution definitions are optional; do not fabricate
  // accounting data if the optional definition source is unavailable.
  try {
    await loadActiveContributionTypes();
  } catch (error) {
    console.warn(
      "CHAMA LIVE: Active contribution definition display unavailable.",
      error
    );

    activeContributionTypes = [];
    renderActiveContributionTypes();
  }
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


  const summaryActiveMembers =
    Number(
      summary.active_members
    );


  if (
    !Number.isFinite(
      summaryActiveMembers
    )
  ) {

    throw new Error(
      "Canonical monthly summary did not return a valid member population."
    );

  }


  const canonicalActiveMembers =
    summaryActiveMembers;


  if (
    canonicalActiveMembers !==
    activeMembers.length
  ) {

    throw new Error(
      `Canonical accounting member count (${canonicalActiveMembers}) does not match the group member list (${activeMembers.length}).`
    );

  }


  const hasMembersPaid =
    Number.isFinite(
      Number(
        summary.members_paid
      )
    );


  const hasPartialPayments =
    Number.isFinite(
      Number(
        summary.partial_payments
      )
    );


  const hasOutstandingMembers =
    Number.isFinite(
      Number(
        summary.outstanding_members
      )
    );


  let membersPaid =
    hasMembersPaid
      ? numberValue(
          summary.members_paid
        )
      : 0;


  let partialPayments =
    hasPartialPayments
      ? numberValue(
          summary.partial_payments
        )
      : 0;


  let outstandingMembers =
    hasOutstandingMembers
      ? numberValue(
          summary.outstanding_members
        )
      : 0;


  if (
    monthlyStatus.length > 0
  ) {

    if (!hasMembersPaid) {

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

    }


    if (!hasPartialPayments) {

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

    }


    if (!hasOutstandingMembers) {

      outstandingMembers =
        monthlyStatus.filter(
          row =>
            numberValue(
              row.currentOutstanding
            ) > 0
        ).length;

    }

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


  const summaryCollectionRate =
    Number(
      summary.collection_rate
    );


  const collectionRate =
    Number.isFinite(
      summaryCollectionRate
    )
      ? summaryCollectionRate
      : expected > 0
        ? (
            applied /
            expected
          ) * 100
        : 0;


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
        numberValue(
          summary.collectionRate
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
            <strong>No member accounting rows</strong>
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


          const statusClassName =
            statusClass(
              status
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
                    statusClassName
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
          position.status,
          position.arrears,
          position.credit
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
              No group members
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
              position.status,
              position.arrears,
              position.credit
            );


          const statusClassName =
            cumulativeStatusClass(
              status
            );


          let statusAmount = 0;


          if (
            status ===
            "ARREARS"
          ) {

            statusAmount =
              position.arrears;

          }
          else if (
            status ===
            "CREDIT"
          ) {

            statusAmount =
              position.credit;

          }


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
                  money(
                    statusAmount
                  )
                )}
              </td>

              <td>
                <span
                  class="status-badge ${escapeHtml(
                    statusClassName
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


          const statusClassName =
            statusClass(
              status
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
                    statusClassName ||
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

  renderActiveContributionTypes();

  renderMemberStatus();

  renderCumulativePosition();

  renderRecentContributions();

  renderRecentExpenses();

  renderUpcomingMeetings();

  renderAttendanceSummary();

  renderOperationsSnapshot();

}


/* =========================================================
   DASHBOARD ACTIONS
========================================================= */

function bindDashboardActions() {
  const refreshButton = el("refreshDashboard");

  if (!refreshButton) {
    console.warn(
      "CHAMA LIVE: Refresh button not found; dashboard refresh remains available through refreshDashboard()."
    );
    return;
  }

  // Avoid registering duplicate click handlers if initialization is retried.
  if (refreshButton.dataset.dashboardActionBound === "true") {
    return;
  }

  refreshButton.dataset.dashboardActionBound = "true";
  refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;

    try {
      await refreshDashboard();
    } finally {
      refreshButton.disabled = false;
    }
  });
}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initDashboard() {

  /*
     admin-layout.js owns initialization.

     This guard prevents accidental duplicate
     initialization if admin-layout.js invokes the
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

    bindDashboardActions();

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

        activeContributionTypes:
          activeContributionTypes.length,

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
          cumulativePositionsComplete,

        activeContributionTypes:
          activeContributionTypes.length
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
   admin-layout.js
       ↓
   dynamic import("./dashboard.js")
       ↓
   initDashboard()

   Therefore DO NOT add:

       DOMContentLoaded
       initDashboard()

   here.

   admin-layout.js remains the sole page bootloader.
========================================================= */

console.log(
  "CHAMA LIVE: dashboard module ready"
);
