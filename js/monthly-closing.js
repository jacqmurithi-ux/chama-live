/* =========================================================
   CHAMA LIVE — MONTHLY CLOSING
   TEMPORARY AUTH / RLS DIAGNOSTIC VERSION

   PURPOSE
   ---------------------------------------------------------
   Diagnose why monthly_closings INSERT is being rejected
   by Row Level Security.

   THIS FILE DOES NOT:
       - change the database
       - change RLS
       - change migrations
       - execute production SQL
       - modify accounting logic

   It DOES:
       - preserve the existing Monthly Closing UI
       - preserve canonical 2B accounting RPCs
       - preserve group/auth behaviour
       - inspect the authenticated Supabase user
       - inspect the linked member
       - test cl_user_has_role()
       - display the exact authorization values
       - preserve the corrected closed_by = currentUser.id

   LIVE RLS INSERT POLICY REQUIRES:

       cl_user_has_role(
           group_id,
           ['admin','treasurer']
       )

       AND

       closed_by = auth.uid()

       AND

       closing_month = first day of month

       AND

       total_expected >= 0

       AND

       total_collected >= 0

       AND

       total_expenses >= 0

   IMPORTANT
   ---------------------------------------------------------
   This is a TEMPORARY diagnostic build.

   Remove this diagnostic version after the RLS issue
   has been identified.
========================================================= */


import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember
} from "./auth.js";


console.log(
  "CHAMA LIVE: monthly-closing.js TEMPORARY DIAGNOSTIC loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const monthInput =
  document.getElementById("closingMonth");

const calculateButton =
  document.getElementById("calculateClosing");

const closeButton =
  document.getElementById("closeMonth");

const notesInput =
  document.getElementById("closingNotes");

const expectedEl =
  document.getElementById("totalExpected");

const collectedEl =
  document.getElementById("totalCollected");

const expensesEl =
  document.getElementById("totalExpenses");

const balanceEl =
  document.getElementById("closingBalance");

const previousBalanceEl =
  document.getElementById("previousBalance");

const closingStatusEl =
  document.getElementById("closingStatus");

const closingRows =
  document.getElementById("closingRows");

const selectedMonthLabel =
  document.getElementById("selectedMonthLabel");

const collectionProgress =
  document.getElementById("collectionProgress");

const collectionProgressText =
  document.getElementById(
    "collectionProgressText"
  );

const collectionDifference =
  document.getElementById(
    "collectionDifference"
  );


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentMember = null;

let groupId = null;

let currentClosing = null;

let calculatedData = null;

let canonicalStatus = [];

let initialized = false;

let authorizationDiagnostic = null;


/* =========================================================
   MONEY
========================================================= */

function money(value) {

  return new Intl.NumberFormat(
    "en-KE",
    {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }
  ).format(
    Number(value || 0)
  );

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


/* =========================================================
   STATUS
========================================================= */

function showStatus(message) {

  if (!statusEl) {
    return;
  }

  statusEl.textContent =
    message || "";

  statusEl.hidden =
    !message;

}


function showError(error) {

  console.error(
    "CHAMA LIVE Monthly Closing:",
    error
  );

  if (!errorEl) {
    return;
  }

  errorEl.textContent =
    error?.message ||
    String(error) ||
    "Unable to process monthly closing.";

  errorEl.hidden =
    false;

}


function clearError() {

  if (!errorEl) {
    return;
  }

  errorEl.textContent =
    "";

  errorEl.hidden =
    true;

}


/* =========================================================
   TEMPORARY AUTH / RLS DIAGNOSTIC PANEL
========================================================= */

function ensureDiagnosticPanel() {

  let panel =
    document.getElementById(
      "monthlyClosingDiagnostic"
    );


  if (panel) {
    return panel;
  }


  panel =
    document.createElement("section");

  panel.id =
    "monthlyClosingDiagnostic";

  panel.style.margin =
    "20px 0";

  panel.style.padding =
    "16px";

  panel.style.border =
    "2px solid #b91c1c";

  panel.style.borderRadius =
    "10px";

  panel.style.background =
    "#fff7f7";

  panel.innerHTML = `
    <h3 style="margin-top:0;">
      Temporary Authorization Diagnostic
    </h3>

    <p style="margin-bottom:12px;">
      This panel is temporary and is being used to
      diagnose the Monthly Closing RLS INSERT failure.
    </p>

    <div
      id="monthlyClosingDiagnosticContent"
      style="
        font-family:monospace;
        font-size:13px;
        line-height:1.7;
        white-space:pre-wrap;
      "
    >
      Running diagnostic...
    </div>
  `;


  /*
     Insert near the top of the page so it is easy
     to see without changing the existing HTML.
  */

  const firstMainSection =
    document.querySelector(
      "main"
    );


  if (firstMainSection) {

    firstMainSection.prepend(
      panel
    );

  }
  else {

    document.body.prepend(
      panel
    );

  }


  return panel;

}


function renderDiagnostic(
  diagnostic
) {

  authorizationDiagnostic =
    diagnostic;


  const panel =
    ensureDiagnosticPanel();


  const content =
    panel.querySelector(
      "#monthlyClosingDiagnosticContent"
    );


  if (!content) {
    return;
  }


  const lines = [

    "AUTHENTICATED USER",

    `auth.uid(): ${diagnostic.auth_uid || "NULL"}`,

    `currentUser.id: ${diagnostic.current_user_id || "NULL"}`,

    `auth identity match: ${
      diagnostic.auth_user_matches
        ? "PASS"
        : "FAIL"
    }`,

    "",

    "MEMBER",

    `member.id: ${diagnostic.member_id || "NULL"}`,

    `member.user_id: ${diagnostic.member_user_id || "NULL"}`,

    `member.auth_user_id: ${
      diagnostic.member_auth_user_id || "NULL"
    }`,

    `member.user_id matches auth.uid(): ${
      diagnostic.member_user_matches
        ? "PASS"
        : "FAIL"
    }`,

    `member.auth_user_id matches auth.uid(): ${
      diagnostic.member_auth_user_matches
        ? "PASS"
        : "FAIL"
    }`,

    "",

    "GROUP",

    `group_id: ${diagnostic.group_id || "NULL"}`,

    `member.group_id: ${
      diagnostic.member_group_id || "NULL"
    }`,

    `group match: ${
      diagnostic.group_matches
        ? "PASS"
        : "FAIL"
    }`,

    "",

    "MEMBER STATUS",

    `role: ${diagnostic.role || "NULL"}`,

    `status: ${diagnostic.status || "NULL"}`,

    `onboarding_status: ${
      diagnostic.onboarding_status || "NULL"
    }`,

    "",

    "ROLE CHECK",

    "Required roles: admin, treasurer",

    `cl_user_has_role(): ${
      diagnostic.role_check === true
        ? "PASS"
        : diagnostic.role_check === false
          ? "FAIL"
          : "ERROR"
    }`,

    "",

    "MONTHLY CLOSING INSERT VALUES",

    `closing_month: ${
      diagnostic.closing_month || "NULL"
    }`,

    `closed_by: ${
      diagnostic.closed_by || "NULL"
    }`,

    `closed_by === auth.uid(): ${
      diagnostic.closed_by_matches_auth
        ? "PASS"
        : "FAIL"
    }`,

    `total_expected: ${
      diagnostic.total_expected
    }`,

    `total_collected: ${
      diagnostic.total_collected
    }`,

    `total_expenses: ${
      diagnostic.total_expenses
    }`,

    "",

    "FINAL DIAGNOSTIC",

    diagnostic.insert_should_pass
      ? "All visible RLS predicates appear satisfied."
      : "At least one RLS predicate is failing.",

    "",

    `Diagnostic time: ${
      new Date().toISOString()
    }`

  ];


  content.textContent =
    lines.join("\n");


  console.group(
    "CHAMA LIVE — Monthly Closing RLS Diagnostic"
  );

  console.table(
    diagnostic
  );

  console.groupEnd();

}


/* =========================================================
   RUN AUTHENTICATED RLS DIAGNOSTIC
========================================================= */

async function runAuthorizationDiagnostic() {

  try {

    /*
       Get the actual Supabase auth session.

       This is deliberately independent from
       getMyMember(), because we need to establish
       exactly which identity Supabase is using.
    */

    const {
      data: authData,
      error: authError
    } =
      await supabase.auth.getUser();


    if (authError) {
      throw authError;
    }


    const authUser =
      authData?.user || null;


    if (!authUser?.id) {

      throw new Error(
        "Authenticated Supabase user could not be determined."
      );

    }


    /*
       Query the member using the authenticated
       user's identity.

       We inspect both identity columns because the
       live role helper accepts either:
           members.user_id
           members.auth_user_id
    */

    const {
      data: memberRows,
      error: memberError
    } =
      await supabase
        .from("members")
        .select(`
          id,
          group_id,
          user_id,
          auth_user_id,
          name,
          role,
          status,
          onboarding_status
        `)
        .or(
          `user_id.eq.${authUser.id},auth_user_id.eq.${authUser.id}`
        );


    if (memberError) {
      throw memberError;
    }


    const matchingMembers =
      memberRows || [];


    const member =
      matchingMembers.find(
        row =>
          row.user_id === authUser.id ||
          row.auth_user_id === authUser.id
      ) ||
      null;


    if (!member) {

      renderDiagnostic({

        auth_uid:
          authUser.id,

        current_user_id:
          currentUser?.id || null,

        auth_user_matches:
          currentUser?.id === authUser.id,

        member_id:
          null,

        member_user_id:
          null,

        member_auth_user_id:
          null,

        member_user_matches:
          false,

        member_auth_user_matches:
          false,

        group_id:
          groupId,

        member_group_id:
          null,

        group_matches:
          false,

        role:
          null,

        status:
          null,

        onboarding_status:
          null,

        role_check:
          null,

        closing_month:
          monthInput?.value
            ? `${monthInput.value}-01`
            : null,

        closed_by:
          currentUser?.id || null,

        closed_by_matches_auth:
          currentUser?.id === authUser.id,

        total_expected:
          calculatedData?.expected_monthly_contributions || 0,

        total_collected:
          calculatedData?.total_contributions_collected || 0,

        total_expenses:
          calculatedData?.approved_expenses || 0,

        insert_should_pass:
          false

      });


      throw new Error(
        "No members record matches the authenticated user."
      );

    }


    /*
       Call the actual live helper.

       This is the same function referenced by
       the monthly_closings INSERT RLS policy.
    */

    let roleCheck =
      null;

    let roleCheckError =
      null;


    const {
      data: roleData,
      error: roleError
    } =
      await supabase
        .rpc(
          "cl_user_has_role",
          {
            p_group_id:
              member.group_id,

            p_roles:
              [
                "admin",
                "treasurer"
              ]
          }
        );


    if (roleError) {

      roleCheckError =
        roleError;

    }
    else {

      roleCheck =
        roleData === true;

    }


    const selectedMonth =
      monthInput?.value || null;


    const closingMonth =
      selectedMonth
        ? `${selectedMonth}-01`
        : null;


    const closedBy =
      currentUser?.id ||
      authUser.id ||
      null;


    const expected =
      Number(
        calculatedData
          ?.expected_monthly_contributions ||
        0
      );


    const collected =
      Number(
        calculatedData
          ?.total_contributions_collected ||
        0
      );


    const expenses =
      Number(
        calculatedData
          ?.approved_expenses ||
        0
      );


    const authUserMatches =
      currentUser?.id ===
      authUser.id;


    const memberUserMatches =
      member.user_id ===
      authUser.id;


    const memberAuthUserMatches =
      member.auth_user_id ===
      authUser.id;


    const groupMatches =
      groupId ===
      member.group_id;


    const closedByMatchesAuth =
      closedBy ===
      authUser.id;


    const monthIsFirstDay =
      Boolean(
        closingMonth &&
        closingMonth.endsWith("-01")
      );


    const numericValuesValid =
      expected >= 0 &&
      collected >= 0 &&
      expenses >= 0;


    const insertShouldPass =
      Boolean(
        roleCheck === true &&
        closedByMatchesAuth &&
        monthIsFirstDay &&
        numericValuesValid
      );


    renderDiagnostic({

      auth_uid:
        authUser.id,

      current_user_id:
        currentUser?.id || null,

      auth_user_matches:
        authUserMatches,

      member_id:
        member.id,

      member_user_id:
        member.user_id,

      member_auth_user_id:
        member.auth_user_id,

      member_user_matches:
        memberUserMatches,

      member_auth_user_matches:
        memberAuthUserMatches,

      group_id:
        groupId,

      member_group_id:
        member.group_id,

      group_matches:
        groupMatches,

      role:
        member.role,

      status:
        member.status,

      onboarding_status:
        member.onboarding_status,

      role_check:
        roleCheck,

      role_check_error:
        roleCheckError?.message ||
        null,

      closing_month:
        closingMonth,

      closed_by:
        closedBy,

      closed_by_matches_auth:
        closedByMatchesAuth,

      total_expected:
        expected,

      total_collected:
        collected,

      total_expenses:
        expenses,

      month_is_first_day:
        monthIsFirstDay,

      numeric_values_valid:
        numericValuesValid,

      insert_should_pass:
        insertShouldPass

    });


    /*
       Also log the actual role-helper result clearly.
    */

    if (roleCheckError) {

      console.error(
        "CHAMA LIVE: cl_user_has_role diagnostic failed:",
        roleCheckError
      );

    }
    else {

      console.log(
        "CHAMA LIVE: cl_user_has_role result:",
        roleCheck
      );

    }


  }
  catch (error) {

    console.error(
      "CHAMA LIVE authorization diagnostic:",
      error
    );


    renderDiagnostic({

      auth_uid:
        currentUser?.id || null,

      current_user_id:
        currentUser?.id || null,

      auth_user_matches:
        false,

      member_id:
        currentMember?.id || null,

      member_user_id:
        currentMember?.user_id || null,

      member_auth_user_id:
        currentMember?.auth_user_id || null,

      member_user_matches:
        false,

      member_auth_user_matches:
        false,

      group_id:
        groupId,

      member_group_id:
        currentMember?.group_id || null,

      group_matches:
        false,

      role:
        currentMember?.role || null,

      status:
        currentMember?.status || null,

      onboarding_status:
        currentMember?.onboarding_status || null,

      role_check:
        null,

      role_check_error:
        error?.message ||
        String(error),

      closing_month:
        monthInput?.value
          ? `${monthInput.value}-01`
          : null,

      closed_by:
        currentUser?.id || null,

      closed_by_matches_auth:
        false,

      total_expected:
        Number(
          calculatedData
            ?.expected_monthly_contributions ||
          0
        ),

      total_collected:
        Number(
          calculatedData
            ?.total_contributions_collected ||
          0
        ),

      total_expenses:
        Number(
          calculatedData
            ?.approved_expenses ||
          0
        ),

      insert_should_pass:
        false

    });

  }

}


/* =========================================================
   MONTH
========================================================= */

function getCurrentMonth() {

  const date =
    new Date();

  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1
    ).padStart(2, "0")

  ].join("-");

}


function formatMonth(value) {

  if (!value) {
    return "—";
  }

  const date =
    new Date(
      `${value}-01T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    "en-KE",
    {
      year: "numeric",
      month: "long"
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
    return String(value);
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


/* =========================================================
   SELECTED MONTH
========================================================= */

function renderSelectedMonth() {

  if (!selectedMonthLabel) {
    return;
  }

  const month =
    monthInput?.value;

  selectedMonthLabel.textContent =
    month
      ? formatMonth(month)
      : "Select a month";

}


/* =========================================================
   LOAD EXISTING CLOSING
========================================================= */

async function loadExistingClosing(
  month
) {

  const {
    data,
    error
  } =
    await supabase
      .from("monthly_closings")
      .select(`
        id,
        group_id,
        closing_month,
        closed_by,
        closed_at,
        total_expected,
        total_collected,
        total_expenses,
        closing_balance,
        notes
      `)
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "closing_month",
        `${month}-01`
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  currentClosing =
    data || null;

}


/* =========================================================
   LOAD HISTORY
========================================================= */

async function loadClosingHistory() {

  if (!closingRows) {
    return;
  }

  const {
    data,
    error
  } =
    await supabase
      .from("monthly_closings")
      .select(`
        id,
        closing_month,
        closed_at,
        total_expected,
        total_collected,
        total_expenses,
        closing_balance,
        notes
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "closing_month",
        {
          ascending: false
        }
      );

  if (error) {
    throw error;
  }


  if (!data?.length) {

    closingRows.innerHTML = `
      <tr>
        <td colspan="7">

          <div class="empty-state">

            <div class="empty-state-icon">
              ▣
            </div>

            <strong>
              No monthly closings yet
            </strong>

            <span>
              Closed financial months will
              appear here.
            </span>

          </div>

        </td>
      </tr>
    `;

    return;

  }


  closingRows.innerHTML =
    data
      .map(
        closing => {

          const balance =
            Number(
              closing.closing_balance || 0
            );


          const balanceClass =
            balance < 0
              ? "amount-negative"
              : balance > 0
                ? "amount-positive"
                : "";


          return `
            <tr>

              <td>
                <strong>
                  ${escapeHtml(
                    formatMonth(
                      String(
                        closing.closing_month
                      ).slice(0, 7)
                    )
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  money(
                    closing.total_expected
                  )
                )}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    money(
                      closing.total_collected
                    )
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  money(
                    closing.total_expenses
                  )
                )}
              </td>

              <td>
                <strong
                  class="${balanceClass}"
                >
                  ${escapeHtml(
                    money(balance)
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  formatDate(
                    closing.closed_at
                  )
                )}
              </td>

              <td class="history-notes">
                ${escapeHtml(
                  closing.notes ||
                  "—"
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   GET OPENING BALANCE
========================================================= */

async function getOpeningBalance(
  month
) {

  const monthStart =
    `${month}-01`;


  const {
    data: previousPeriod,
    error:
      previousPeriodError
  } =
    await supabase
      .from("financial_periods")
      .select(`
        closing_balance,
        month,
        status
      `)
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "status",
        "closed"
      )
      .lt(
        "month",
        month
      )
      .order(
        "month",
        {
          ascending: false
        }
      )
      .limit(1)
      .maybeSingle();


  if (
    previousPeriodError &&
    previousPeriodError.code !==
      "PGRST116"
  ) {

    console.warn(
      "CHAMA LIVE: financial_periods lookup:",
      previousPeriodError
    );

  }


  if (
    previousPeriod?.closing_balance !== null &&
    previousPeriod?.closing_balance !== undefined
  ) {

    return Number(
      previousPeriod.closing_balance || 0
    );

  }


  const {
    data: previousClosing,
    error:
      previousClosingError
  } =
    await supabase
      .from("monthly_closings")
      .select(`
        closing_balance,
        closing_month
      `)
      .eq(
        "group_id",
        groupId
      )
      .lt(
        "closing_month",
        monthStart
      )
      .order(
        "closing_month",
        {
          ascending: false
        }
      )
      .limit(1)
      .maybeSingle();


  if (previousClosingError) {

    console.warn(
      "CHAMA LIVE: previous monthly closing lookup:",
      previousClosingError
    );

  }


  if (
    previousClosing?.closing_balance !==
      null &&
    previousClosing?.closing_balance !==
      undefined
  ) {

    return Number(
      previousClosing.closing_balance || 0
    );

  }


  const {
    data: group,
    error:
      groupError
  } =
    await supabase
      .from("groups")
      .select(`
        opening_balance
      `)
      .eq(
        "id",
        groupId
      )
      .single();


  if (groupError) {
    throw groupError;
  }


  return Number(
    group?.opening_balance || 0
  );

}


/* =========================================================
   LOAD CANONICAL ACCOUNTING
========================================================= */

async function loadCanonicalAccounting(
  month
) {

  showStatus(
    `Calculating ${formatMonth(month)}...`
  );


  const {
    data: statusData,
    error: statusError
  } =
    await supabase
      .rpc(
        "get_canonical_member_monthly_status",
        {
          p_group_id:
            groupId,

          p_month:
            month
        }
      );


  if (statusError) {
    throw statusError;
  }


  canonicalStatus =
    statusData || [];


  const {
    data: summaryData,
    error: summaryError
  } =
    await supabase
      .rpc(
        "get_canonical_monthly_accounting_summary",
        {
          p_group_id:
            groupId,

          p_month:
            month
        }
      );


  if (summaryError) {
    throw summaryError;
  }


  if (!summaryData) {

    throw new Error(
      "No canonical accounting summary was returned."
    );

  }


  const monthStart =
    `${month}-01`;

  const date =
    new Date(
      `${month}-01T00:00:00`
    );

  date.setMonth(
    date.getMonth() + 1
  );


  const monthEnd =
    [
      date.getFullYear(),

      String(
        date.getMonth() + 1
      ).padStart(2, "0"),

      "01"

    ].join("-");


  const {
    data: expenseRows,
    error: expenseError
  } =
    await supabase
      .from("expenses")
      .select(`
        id,
        amount,
        date,
        approval_status
      `)
      .eq(
        "group_id",
        groupId
      )
      .gte(
        "date",
        monthStart
      )
      .lt(
        "date",
        monthEnd
      )
      .eq(
        "approval_status",
        "approved"
      );


  if (expenseError) {
    throw expenseError;
  }


  const approvedExpenses =
    (expenseRows || [])
      .reduce(
        (total, expense) =>
          total +
          Number(
            expense.amount || 0
          ),
        0
      );


  const openingBalance =
    await getOpeningBalance(
      month
    );


  const totalCollected =
    Number(
      summaryData
        .total_contributions_collected ||
      0
    );


  const expected =
    Number(
      summaryData
        .expected_monthly_contributions ||
      0
    );


  const applied =
    Number(
      summaryData
        .applied_this_month ||
      0
    );


  const carryForward =
    Number(
      summaryData
        .carry_forward ||
      0
    );


  const outstanding =
    Number(
      summaryData
        .current_outstanding ||
      0
    );


  const closingBalance =
    openingBalance +
    totalCollected -
    approvedExpenses;


  let collectionRate = 0;


  if (expected > 0) {

    collectionRate =
      Math.min(
        100,
        Math.max(
          0,
          (
            applied /
            expected
          ) * 100
        )
      );

  }


  calculatedData = {

    month,

    opening_balance:
      openingBalance,

    expected_monthly_contributions:
      expected,

    total_contributions_collected:
      totalCollected,

    applied_this_month:
      applied,

    carry_forward:
      carryForward,

    current_outstanding:
      outstanding,

    approved_expenses:
      approvedExpenses,

    closing_balance:
      closingBalance,

    active_members:
      Number(
        summaryData.active_members ||
        canonicalStatus.length ||
        0
      ),

    members_paid:
      Number(
        summaryData.members_paid ||
        0
      ),

    partial_payments:
      Number(
        summaryData.partial_payments ||
        0
      ),

    outstanding_members:
      Number(
        summaryData.outstanding_members ||
        0
      ),

    collection_rate:
      Number(
        collectionRate.toFixed(2)
      )

  };


  renderCalculation();

}


/* =========================================================
   RENDER CALCULATION
========================================================= */

function renderCalculation() {

  if (!calculatedData) {
    return;
  }


  const expected =
    Number(
      calculatedData
        .expected_monthly_contributions ||
      0
    );


  const collected =
    Number(
      calculatedData
        .total_contributions_collected ||
      0
    );


  const applied =
    Number(
      calculatedData
        .applied_this_month ||
      0
    );


  const carryForward =
    Number(
      calculatedData
        .carry_forward ||
      0
    );


  const outstanding =
    Number(
      calculatedData
        .current_outstanding ||
      0
    );


  const expenses =
    Number(
      calculatedData
        .approved_expenses ||
      0
    );


  const previousBalance =
    Number(
      calculatedData
        .opening_balance ||
      0
    );


  const balance =
    Number(
      calculatedData
        .closing_balance ||
      0
    );


  if (expectedEl) {

    expectedEl.textContent =
      money(expected);

  }


  if (collectedEl) {

    collectedEl.textContent =
      money(collected);

  }


  if (expensesEl) {

    expensesEl.textContent =
      money(expenses);

  }


  if (previousBalanceEl) {

    previousBalanceEl.textContent =
      money(previousBalance);

  }


  if (balanceEl) {

    balanceEl.textContent =
      money(balance);

  }


  let percentage = 0;


  if (expected > 0) {

    percentage =
      (
        applied /
        expected
      ) * 100;

  }


  percentage =
    Math.max(
      0,
      Math.min(
        percentage,
        100
      )
    );


  if (collectionProgress) {

    collectionProgress.style.width =
      `${percentage}%`;

  }


  if (collectionProgressText) {

    collectionProgressText.textContent =
      `${Math.round(
        percentage
      )}% collected`;

  }


  if (collectionDifference) {

    const difference =
      applied -
      expected;


    if (difference > 0) {

      collectionDifference.textContent =
        `${money(
          difference
        )} above expected`;

      collectionDifference.className =
        "collection-difference positive";

    }
    else if (difference < 0) {

      collectionDifference.textContent =
        `${money(
          Math.abs(difference)
        )} below expected`;

      collectionDifference.className =
        "collection-difference negative";

    }
    else {

      collectionDifference.textContent =
        "Fully collected";

      collectionDifference.className =
        "collection-difference positive";

    }

  }


  if (balanceEl) {

    balanceEl.classList.remove(
      "amount-positive",
      "amount-negative",
      "amount-neutral"
    );


    if (balance < 0) {

      balanceEl.classList.add(
        "amount-negative"
      );

    }
    else if (balance > 0) {

      balanceEl.classList.add(
        "amount-positive"
      );

    }
    else {

      balanceEl.classList.add(
        "amount-neutral"
      );

    }

  }


  const appliedEl =
    document.getElementById(
      "appliedThisMonth"
    );

  if (appliedEl) {

    appliedEl.textContent =
      money(applied);

  }


  const carryForwardEl =
    document.getElementById(
      "carryForward"
    );

  if (carryForwardEl) {

    carryForwardEl.textContent =
      money(carryForward);

  }


  const outstandingEl =
    document.getElementById(
      "currentOutstanding"
    );

  if (outstandingEl) {

    outstandingEl.textContent =
      money(outstanding);

  }

}


/* =========================================================
   RENDER CLOSING STATUS
========================================================= */

function renderClosingStatus() {

  if (!closingStatusEl) {
    return;
  }


  if (currentClosing) {

    closingStatusEl.textContent =
      `Closed on ${formatDate(
        currentClosing.closed_at
      )}`;

    closingStatusEl.className =
      "closing-status-badge closed";


    if (closeButton) {

      closeButton.disabled =
        true;

      closeButton.textContent =
        "Month Already Closed";

    }


    if (notesInput) {

      notesInput.value =
        currentClosing.notes ||
        "";

    }


    if (expectedEl) {

      expectedEl.textContent =
        money(
          currentClosing.total_expected
        );

    }


    if (collectedEl) {

      collectedEl.textContent =
        money(
          currentClosing.total_collected
        );

    }


    if (expensesEl) {

      expensesEl.textContent =
        money(
          currentClosing.total_expenses
        );

    }


    if (balanceEl) {

      balanceEl.textContent =
        money(
          currentClosing.closing_balance
        );

    }


    const finalizeSection =
      document.getElementById(
        "finalizeSection"
      );

    if (finalizeSection) {

      finalizeSection.classList.add(
        "already-closed"
      );

    }

  }
  else {

    closingStatusEl.textContent =
      "Open";

    closingStatusEl.className =
      "closing-status-badge open";


    if (closeButton) {

      closeButton.disabled =
        false;

      closeButton.textContent =
        "Close Month";

    }


    const finalizeSection =
      document.getElementById(
        "finalizeSection"
      );

    if (finalizeSection) {

      finalizeSection.classList.remove(
        "already-closed"
      );

    }

  }

}


/* =========================================================
   CALCULATE MONTH
========================================================= */

async function calculateMonth() {

  try {

    clearError();

    const month =
      monthInput?.value;


    if (!month) {

      throw new Error(
        "Please select a month."
      );

    }


    calculatedData =
      null;

    currentClosing =
      null;


    renderSelectedMonth();


    await loadCanonicalAccounting(
      month
    );


    await loadExistingClosing(
      month
    );


    renderClosingStatus();


    /*
       Run after accounting has been calculated so
       the diagnostic can also inspect the exact values
       that would be inserted into monthly_closings.
    */

    await runAuthorizationDiagnostic();


    showStatus(
      `Calculation ready for ${formatMonth(
        month
      )}.`
    );

  }
  catch (error) {

    showError(error);

  }

}


/* =========================================================
   CLOSE MONTH
========================================================= */

async function closeMonth() {

  try {

    clearError();


    const month =
      monthInput?.value;


    if (!month) {

      throw new Error(
        "Please select a month."
      );

    }


    if (!currentUser?.id) {

      throw new Error(
        "Your authenticated user session is unavailable."
      );

    }


    if (!currentMember?.id) {

      throw new Error(
        "Your member record is unavailable."
      );

    }


    if (!groupId) {

      throw new Error(
        "Your member record is not linked to a group."
      );

    }


    if (currentClosing) {

      throw new Error(
        "This month has already been closed."
      );

    }


    if (!calculatedData) {

      await loadCanonicalAccounting(
        month
      );

    }


    if (!calculatedData) {

      throw new Error(
        "Unable to calculate the month."
      );

    }


    /*
       Re-run diagnostic immediately before INSERT.

       This ensures the displayed diagnostic reflects
       the current authenticated session and current
       calculated values.
    */

    await runAuthorizationDiagnostic();


    const confirmed =
      window.confirm(

        `Close ${formatMonth(
          month
        )}?\n\n` +

        `Expected monthly obligations: ` +
        `${money(
          calculatedData
            .expected_monthly_contributions
        )}\n` +

        `Cash contributions received: ` +
        `${money(
          calculatedData
            .total_contributions_collected
        )}\n` +

        `Applied to monthly obligations: ` +
        `${money(
          calculatedData
            .applied_this_month
        )}\n` +

        `Carry-forward credit: ` +
        `${money(
          calculatedData
            .carry_forward
        )}\n` +

        `Current outstanding: ` +
        `${money(
          calculatedData
            .current_outstanding
        )}\n` +

        `Approved expenses: ` +
        `${money(
          calculatedData
            .approved_expenses
        )}\n` +

        `Closing balance: ` +
        `${money(
          calculatedData
            .closing_balance
        )}\n\n` +

        `Continue?`

      );


    if (!confirmed) {
      return;
    }


    if (closeButton) {

      closeButton.disabled =
        true;

      closeButton.textContent =
        "Closing...";

    }


    showStatus(
      `Closing ${formatMonth(
        month
      )}...`
    );


    /*
     ========================================================
     CORRECT IDENTITY
     ========================================================

     closed_by MUST be auth.uid().

     currentMember.id is NOT used.
    */

    const payload = {

      group_id:
        groupId,

      closing_month:
        `${month}-01`,

      closed_by:
        currentUser.id,

      closed_at:
        new Date().toISOString(),

      total_expected:
        Number(
          calculatedData
            .expected_monthly_contributions ||
          0
        ),

      total_collected:
        Number(
          calculatedData
            .total_contributions_collected ||
          0
        ),

      total_expenses:
        Number(
          calculatedData
            .approved_expenses ||
          0
        ),

      closing_balance:
        Number(
          calculatedData
            .closing_balance ||
          0
        ),

      notes:
        notesInput?.value?.trim() ||
        null

    };


    console.log(
      "CHAMA LIVE: monthly closing INSERT payload",
      payload
    );


    const {
      data,
      error
    } =
      await supabase
        .from("monthly_closings")
        .insert(
          payload
        )
        .select(`
          id,
          group_id,
          closing_month,
          closed_by,
          closed_at,
          total_expected,
          total_collected,
          total_expenses,
          closing_balance,
          notes
        `)
        .single();


    if (error) {

      console.error(
        "CHAMA LIVE: monthly_closings INSERT failed",
        {
          error,
          payload,
          authorizationDiagnostic
        }
      );


      if (
        error.code ===
        "23505"
      ) {

        throw new Error(
          "This financial month has already been closed."
        );

      }


      if (
        error.code ===
        "42501"
      ) {

        throw new Error(
          "RLS rejected the monthly closing INSERT. " +
          "Check the Temporary Authorization Diagnostic panel " +
          "and browser console for the exact failing predicate."
        );

      }


      throw error;

    }


    if (!data) {

      throw new Error(
        "The monthly closing was not returned after insertion."
      );

    }


    currentClosing =
      data;


    renderClosingStatus();

    await loadClosingHistory();


    showStatus(
      `${formatMonth(
        month
      )} closed successfully.`
    );


  }
  catch (error) {

    showError(error);

  }
  finally {

    if (
      closeButton &&
      !currentClosing
    ) {

      closeButton.disabled =
        false;

      closeButton.textContent =
        "Close Month";

    }

  }

}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  if (
    monthInput &&
    monthInput.dataset.bound !== "true"
  ) {

    monthInput.dataset.bound =
      "true";


    monthInput.addEventListener(
      "change",
      () => {

        calculatedData =
          null;

        currentClosing =
          null;

        canonicalStatus =
          [];

        authorizationDiagnostic =
          null;

        renderSelectedMonth();

        calculateMonth();

      }
    );

  }


  if (
    calculateButton &&
    calculateButton.dataset.bound !== "true"
  ) {

    calculateButton.dataset.bound =
      "true";


    calculateButton.addEventListener(
      "click",
      () => {

        calculateMonth();

      }
    );

  }


  if (
    closeButton &&
    closeButton.dataset.bound !== "true"
  ) {

    closeButton.dataset.bound =
      "true";


    closeButton.addEventListener(
      "click",
      () => {

        closeMonth();

      }
    );

  }

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initPage() {

  if (initialized) {
    return;
  }


  initialized =
    true;


  try {

    clearError();

    showStatus(
      "Loading monthly closing..."
    );


    /*
       Require the authenticated application user.
    */

    currentUser =
      await requireAuth();


    if (!currentUser) {

      throw new Error(
        "You are not signed in."
      );

    }


    /*
       Load the CHAMA member linked to this account.
    */

    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "No member record is linked to this account."
      );

    }


    groupId =
      currentMember.group_id;


    if (!groupId) {

      throw new Error(
        "Your member record is not linked to a group."
      );

    }


    if (monthInput) {

      monthInput.value =
        getCurrentMonth();

    }


    renderSelectedMonth();

    setupEvents();


    /*
       Calculate first.

       This also runs the authenticated diagnostic.
    */

    await calculateMonth();


    await loadClosingHistory();


    /*
       Run once more after all initialization has
       completed so the diagnostic is definitely visible.
    */

    await runAuthorizationDiagnostic();


    showStatus(
      "Monthly closing ready."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      2500
    );


    console.log(
      "CHAMA LIVE: monthly closing diagnostic initialized",
      {
        groupId,

        memberId:
          currentMember.id,

        userId:
          currentUser.id,

        canonicalMembers:
          canonicalStatus.length
      }
    );

  }
  catch (error) {

    initialized =
      false;

    showStatus("");

    showError(error);

  }

}


export const initMonthlyClosing =
  initPage;


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

      initPage();

    },
    {
      once: true
    }
  );

}
else {

  initPage();

}


console.log(
  "CHAMA LIVE: monthly-closing.js TEMPORARY DIAGNOSTIC ready"
);
