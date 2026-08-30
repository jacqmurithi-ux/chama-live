```javascript
/* =========================================================
   CHAMA LIVE — CONTRIBUTIONS
   SECURE / STABLE VERSION

   Accounting rules:
   ---------------------------------------------------------
   1. Previous arrears are cleared first.
   2. Current month's recurring due is then covered.
   3. Extra payment becomes carry-forward credit.

   SECURITY:
   ---------------------------------------------------------
   contributions.recorded_by -> members.id

   DO NOT send auth.uid() from the frontend.

   The database trigger:
       set_recorded_by_from_auth()

   securely resolves:
       auth.uid()
          ↓
       members.user_id / auth_user_id
          ↓
       members.id
          ↓
       contributions.recorded_by

   This prevents the frontend from impersonating another
   recorder/member.
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember,
  getMyGroup
} from "./auth.js";


console.log(
  "CHAMA LIVE: contributions.js loaded"
);


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let groupId = null;

let members = [];
let contributions = [];

let initialized = false;
let eventsBound = false;


/* =========================================================
   ELEMENT HELPER
========================================================= */

function byId(id) {
  return document.getElementById(id);
}


/* =========================================================
   ELEMENTS
========================================================= */

const statusEl =
  byId("status");

const errorEl =
  byId("error");

const form =
  byId("contributionForm");

const memberSelect =
  byId("member");

const amountInput =
  byId("amount");

const dateInput =
  byId("contributionDate");

const typeSelect =
  byId("contributionType");

const methodSelect =
  byId("paymentMethod");

const mpesaReference =
  byId("mpesaReference");

const mpesaReferenceWrap =
  byId("mpesaReferenceWrap");

const saveButton =
  byId("saveContribution");

const monthlyExpected =
  byId("monthlyExpected");

const memberStatusRows =
  byId("memberStatusRows");

const contributionRows =
  byId("contributionRows");

const progressMonth =
  byId("progressMonth");

const progressPercent =
  byId("progressPercent");

const progressAmount =
  byId("progressAmount");

const progressGoal =
  byId("progressGoal");

const progressBar =
  byId("progressBar");

const progressRate =
  byId("progressRate");

const progressMembers =
  byId("progressMembers");

const progressParticipation =
  byId("progressParticipation");

const progressMemberCount =
  byId("progressMemberCount");


/* =========================================================
   MONEY
========================================================= */

function money(value) {

  return (
    "KSh " +
    Number(value || 0).toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }
    )
  );

}


/* =========================================================
   TODAY
========================================================= */

function todayString() {

  const now = new Date();

  return [
    now.getFullYear(),

    String(
      now.getMonth() + 1
    ).padStart(2, "0"),

    String(
      now.getDate()
    ).padStart(2, "0")

  ].join("-");

}


/* =========================================================
   CURRENT MONTH
========================================================= */

function currentMonth() {

  return todayString().slice(0, 7);

}


/* =========================================================
   ESCAPE HTML
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
   FORMAT DATE
========================================================= */

function formatDate(value) {

  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
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


/* =========================================================
   FORMAT MONTH
========================================================= */

function formatMonth(month) {

  if (!month) {
    return "—";
  }

  const parts =
    String(month).split("-");

  if (parts.length !== 2) {
    return String(month);
  }

  const year =
    Number(parts[0]);

  const monthNumber =
    Number(parts[1]);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthNumber)
  ) {
    return String(month);
  }

  const date =
    new Date(
      year,
      monthNumber - 1,
      1
    );

  return date.toLocaleDateString(
    "en-KE",
    {
      month: "long",
      year: "numeric"
    }
  );

}


/* =========================================================
   STATUS MESSAGE
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


/* =========================================================
   ERROR MESSAGE
========================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE: Contributions error",
    error
  );

  let message =
    error?.message ||
    String(error) ||
    "Something went wrong.";

  const lower =
    message.toLowerCase();


  /* -------------------------------------------------------
     CLOSED FINANCIAL MONTH
  ------------------------------------------------------- */

  if (
    lower.includes("financial month") &&
    lower.includes("closed")
  ) {

    message =
      "This financial month is closed. Contributions cannot be recorded or changed until the month is reopened.";

  }


  /* -------------------------------------------------------
     RECORDER / MEMBER LINK
  ------------------------------------------------------- */

  else if (
    lower.includes(
      "no active member record"
    ) ||
    lower.includes(
      "invalid recorded_by"
    ) ||
    lower.includes(
      "recorded_by"
    ) ||
    lower.includes(
      "contributions_recorded_by_fkey"
    )
  ) {

    message =
      "Your account is not correctly linked to an active member record. Please contact the group administrator.";

  }


  /* -------------------------------------------------------
     PERMISSION
  ------------------------------------------------------- */

  else if (
    lower.includes(
      "row-level security"
    ) ||
    lower.includes(
      "permission denied"
    )
  ) {

    message =
      "You do not have permission to record contributions for this group.";

  }


  /* -------------------------------------------------------
     PAYMENT METHOD
  ------------------------------------------------------- */

  else if (
    lower.includes(
      "payment_method"
    )
  ) {

    message =
      "The selected payment method is not valid.";

  }


  /* -------------------------------------------------------
     MEMBER
  ------------------------------------------------------- */

  else if (
    lower.includes(
      "member_id"
    )
  ) {

    message =
      "The selected member could not be found in this group.";

  }


  /* -------------------------------------------------------
     SHOW
  ------------------------------------------------------- */

  if (errorEl) {

    errorEl.textContent =
      message;

    errorEl.hidden =
      false;

  }

}


/* =========================================================
   CLEAR ERROR
========================================================= */

function clearError() {

  if (errorEl) {

    errorEl.textContent =
      "";

    errorEl.hidden =
      true;

  }

}


/* =========================================================
   MONTHLY CONTRIBUTION
========================================================= */

function getMonthlyContribution() {

  return Number(
    currentGroup?.monthly_contribution || 0
  );

}


/* =========================================================
   ACTIVE MEMBERS
========================================================= */

function getActiveMembers() {

  return members.filter(
    member => {

      const status =
        String(
          member.status || ""
        )
          .trim()
          .toLowerCase();

      return (
        status === "active" ||
        status === ""
      );

    }
  );

}


/* =========================================================
   MONTHLY GOAL
========================================================= */

function getMonthlyGoal() {

  return (
    getActiveMembers().length *
    getMonthlyContribution()
  );

}


/* =========================================================
   CONTRIBUTION MONTH
========================================================= */

function getContributionMonth(
  contribution
) {

  if (contribution?.month) {

    return String(
      contribution.month
    ).slice(0, 7);

  }

  if (contribution?.contribution_date) {

    return String(
      contribution.contribution_date
    ).slice(0, 7);

  }

  return null;

}


/* =========================================================
   MONTHLY CONTRIBUTIONS FOR MEMBER
========================================================= */

function getMonthlyContributionsForMember(
  memberId
) {

  return contributions
    .filter(
      contribution => {

        return (
          String(
            contribution.member_id
          ) === String(memberId) &&

          String(
            contribution.contribution_type || ""
          ).toLowerCase() === "monthly"
        );

      }
    )
    .sort(
      (a, b) => {

        const dateA =
          String(
            a.contribution_date ||
            a.created_at ||
            ""
          );

        const dateB =
          String(
            b.contribution_date ||
            b.created_at ||
            ""
          );

        return dateA.localeCompare(
          dateB
        );

      }
    );

}


/* =========================================================
   MONTHS BETWEEN
========================================================= */

function monthsBetween(
  startMonth,
  endMonth
) {

  const result = [];

  if (
    !startMonth ||
    !endMonth
  ) {

    return result;

  }

  let [
    year,
    month
  ] =
    String(startMonth)
      .split("-")
      .map(Number);

  const [
    endYear,
    endMonthNumber
  ] =
    String(endMonth)
      .split("-")
      .map(Number);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(endYear) ||
    !Number.isFinite(endMonthNumber)
  ) {

    return result;

  }

  while (
    year < endYear ||
    (
      year === endYear &&
      month <= endMonthNumber
    )
  ) {

    result.push(
      `${year}-${String(month).padStart(2, "0")}`
    );

    month++;

    if (month > 12) {

      month = 1;
      year++;

    }

  }

  return result;

}


/* =========================================================
   MEMBER MONTHLY ACCOUNTING
=========================================================

   NOTE:
   This function is retained for the Contributions page
   display.

   Reports and Monthly Closing MUST use the authoritative
   database RPC:

       get_monthly_financial_report()

   This avoids frontend/reporting discrepancies.
========================================================= */

function calculateMemberMonth(
  memberId,
  targetMonth
) {

  const monthlyDue =
    getMonthlyContribution();

  const memberContributions =
    getMonthlyContributionsForMember(
      memberId
    );

  if (monthlyDue <= 0) {

    return {

      monthlyDue: 0,
      previousOutstanding: 0,
      appliedThisMonth: 0,
      carryForward: 0,
      currentOutstanding: 0,
      status: "—"

    };

  }

  const contributionMonths =
    memberContributions
      .map(getContributionMonth)
      .filter(Boolean)
      .sort();

  let firstMonth =
    contributionMonths.length
      ? contributionMonths[0]
      : targetMonth;

  if (firstMonth > targetMonth) {
    firstMonth = targetMonth;
  }

  const months =
    monthsBetween(
      firstMonth,
      targetMonth
    );

  let credit = 0;
  let outstanding = 0;
  let appliedThisMonth = 0;
  let previousOutstanding = 0;

  for (const month of months) {

    previousOutstanding =
      outstanding;

    let availableCredit =
      credit;

    let currentDue =
      monthlyDue;


    /* -----------------------------------------------------
       CREDIT CLEARS PREVIOUS ARREARS
    ----------------------------------------------------- */

    if (
      availableCredit > 0 &&
      outstanding > 0
    ) {

      const usedCredit =
        Math.min(
          availableCredit,
          outstanding
        );

      outstanding -=
        usedCredit;

      availableCredit -=
        usedCredit;

    }


    /* -----------------------------------------------------
       CREDIT COVERS CURRENT MONTH
    ----------------------------------------------------- */

    if (
      availableCredit > 0 &&
      currentDue > 0
    ) {

      const usedCredit =
        Math.min(
          availableCredit,
          currentDue
        );

      currentDue -=
        usedCredit;

      availableCredit -=
        usedCredit;

    }


    /* -----------------------------------------------------
       CASH PAYMENTS
    ----------------------------------------------------- */

    const monthPayments =
      memberContributions
        .filter(
          contribution =>
            getContributionMonth(
              contribution
            ) === month
        )
        .reduce(
          (
            total,
            contribution
          ) =>
            total +
            Number(
              contribution.amount || 0
            ),
          0
        );


    let payment =
      monthPayments;


    /* -----------------------------------------------------
       PAYMENT CLEARS ARREARS
    ----------------------------------------------------- */

    if (
      payment > 0 &&
      outstanding > 0
    ) {

      const usedForOutstanding =
        Math.min(
          payment,
          outstanding
        );

      outstanding -=
        usedForOutstanding;

      payment -=
        usedForOutstanding;

    }


    /* -----------------------------------------------------
       PAYMENT COVERS CURRENT MONTH
    ----------------------------------------------------- */

    if (
      payment > 0 &&
      currentDue > 0
    ) {

      const applied =
        Math.min(
          payment,
          currentDue
        );

      currentDue -=
        applied;

      payment -=
        applied;

    }


    /* -----------------------------------------------------
       REMAINING PAYMENT = CREDIT
    ----------------------------------------------------- */

    credit =
      availableCredit +
      payment;


    outstanding =
      currentDue;


    if (
      month === targetMonth
    ) {

      appliedThisMonth =
        Math.min(
          monthlyDue,
          Math.max(
            0,
            monthlyDue -
            outstanding
          )
        );

    }

  }


  let status =
    "Outstanding";

  if (
    outstanding <= 0 &&
    credit > 0
  ) {

    status =
      "Credit";

  }
  else if (
    outstanding <= 0
  ) {

    status =
      "Paid";

  }
  else if (
    appliedThisMonth > 0
  ) {

    status =
      "Partial";

  }


  return {

    monthlyDue,

    previousOutstanding,

    appliedThisMonth,

    carryForward:
      credit,

    currentOutstanding:
      outstanding,

    status

  };

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initContributions() {

  if (initialized) {

    console.log(
      "CHAMA LIVE: contributions already initialized"
    );

    return;

  }

  initialized = true;

  try {

    clearError();

    showStatus(
      "Loading contributions..."
    );


    /* -----------------------------------------------------
       AUTH
    ----------------------------------------------------- */

    currentUser =
      await requireAuth();

    if (!currentUser?.id) {

      throw new Error(
        "You are not signed in."
      );

    }


    /* -----------------------------------------------------
       MEMBER
    ----------------------------------------------------- */

    currentMember =
      await getMyMember();

    if (!currentMember) {

      throw new Error(
        "No member record is linked to your account."
      );

    }

    if (!currentMember.id) {

      throw new Error(
        "Your member record does not have a valid member ID."
      );

    }

    if (!currentMember.group_id) {

      throw new Error(
        "Your member record is not linked to a group."
      );

    }

    groupId =
      currentMember.group_id;


    /* -----------------------------------------------------
       GROUP
    ----------------------------------------------------- */

    currentGroup =
      await getMyGroup();

    if (!currentGroup) {

      throw new Error(
        "Group information could not be loaded."
      );

    }


    /* -----------------------------------------------------
       DATE
    ----------------------------------------------------- */

    if (
      dateInput &&
      !dateInput.value
    ) {

      dateInput.value =
        todayString();

    }


    /* -----------------------------------------------------
       LOAD DATA
    ----------------------------------------------------- */

    await loadMembers();

    await loadContributions();


    /* -----------------------------------------------------
       RENDER
    ----------------------------------------------------- */

    renderMonthlyExpected();

    renderProgress();

    renderMonthlyStatus();

    renderLedger();


    /* -----------------------------------------------------
       EVENTS
    ----------------------------------------------------- */

    bindEvents();

    showStatus("");


    console.log(
      "CHAMA LIVE: contributions initialized successfully"
    );

  }
  catch (error) {

    initialized = false;

    showStatus("");

    showError(error);

  }

}


/* =========================================================
   BACKWARD COMPATIBILITY
========================================================= */

export async function init() {

  return initContributions();

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  if (!groupId) {

    throw new Error(
      "No group ID available."
    );

  }

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(`
        id,
        group_id,
        member_number,
        membership_number,
        name,
        phone,
        email,
        role,
        status,
        onboarding_status,
        auth_user_id,
        user_id
      `)
      .eq(
        "group_id",
        groupId
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


  renderMemberSelect();

}


/* =========================================================
   RENDER MEMBER SELECT
========================================================= */

function renderMemberSelect() {

  if (!memberSelect) {
    return;
  }

  memberSelect.innerHTML =
    `
      <option value="">
        Select member
      </option>
    `;


  members.forEach(
    member => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        member.id;

      const number =
        member.member_number ||
        member.membership_number ||
        "";

      option.textContent =
        number
          ? `${number} — ${member.name}`
          : member.name;

      memberSelect.appendChild(
        option
      );

    }
  );

}


/* =========================================================
   LOAD CONTRIBUTIONS
========================================================= */

async function loadContributions() {

  if (!groupId) {

    throw new Error(
      "No group ID available."
    );

  }

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
        created_at,
        goal_id,
        contribution_date,
        notes,
        mpesa_reference
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "contribution_date",
        {
          ascending: true
        }
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


  contributions =
    data || [];

}


/* =========================================================
   MONTHLY EXPECTED
========================================================= */

function renderMonthlyExpected() {

  if (!monthlyExpected) {
    return;
  }

  monthlyExpected.textContent =
    money(
      getMonthlyContribution()
    );

}


/* =========================================================
   MEMBER NAME
========================================================= */

function getMemberName(
  memberId
) {

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
   RENDER PROGRESS
========================================================= */

function renderProgress() {

  const month =
    currentMonth();

  const activeMembers =
    getActiveMembers();

  const monthlyDue =
    getMonthlyContribution();

  const goal =
    activeMembers.length *
    monthlyDue;

  let appliedTotal = 0;

  let contributingMembers = 0;


  activeMembers.forEach(
    member => {

      const account =
        calculateMemberMonth(
          member.id,
          month
        );

      appliedTotal +=
        account.appliedThisMonth;

      if (
        account.appliedThisMonth > 0
      ) {

        contributingMembers++;

      }

    }
  );


  const percentage =
    goal > 0
      ? Math.min(
          100,
          Math.round(
            (
              appliedTotal /
              goal
            ) * 100
          )
        )
      : 0;


  const participation =
    activeMembers.length > 0
      ? Math.round(
          (
            contributingMembers /
            activeMembers.length
          ) * 100
        )
      : 0;


  if (progressMonth) {

    progressMonth.textContent =
      formatMonth(month);

  }

  if (progressPercent) {

    progressPercent.textContent =
      `${percentage}%`;

  }

  if (progressAmount) {

    progressAmount.textContent =
      money(appliedTotal);

  }

  if (progressGoal) {

    progressGoal.textContent =
      money(goal);

  }

  if (progressBar) {

    progressBar.style.width =
      `${percentage}%`;

  }

  const progressTrack =
    progressBar?.parentElement;

  if (progressTrack) {

    progressTrack.setAttribute(
      "aria-valuenow",
      String(percentage)
    );

  }

  if (progressRate) {

    progressRate.textContent =
      `${percentage}%`;

  }

  if (progressMembers) {

    progressMembers.textContent =
      `${contributingMembers} / ${activeMembers.length}`;

  }

  if (progressMemberCount) {

    progressMemberCount.textContent =
      `${contributingMembers} of ${activeMembers.length} members`;

  }

  if (progressParticipation) {

    progressParticipation.textContent =
      `${participation}%`;

  }

}


/* =========================================================
   RENDER MONTHLY STATUS
========================================================= */

function renderMonthlyStatus() {

  if (!memberStatusRows) {
    return;
  }

  const month =
    currentMonth();


  if (!members.length) {

    memberStatusRows.innerHTML =
      `
        <tr>
          <td colspan="7">
            No members found.
          </td>
        </tr>
      `;

    return;

  }


  memberStatusRows.innerHTML =
    members
      .map(
        member => {

          const account =
            calculateMemberMonth(
              member.id,
              month
            );


          return `
            <tr>

              <td>
                ${escapeHtml(
                  member.name
                )}
              </td>

              <td>
                ${money(
                  account.monthlyDue
                )}
              </td>

              <td>
                ${money(
                  account.previousOutstanding
                )}
              </td>

              <td>
                ${money(
                  account.appliedThisMonth
                )}
              </td>

              <td>
                ${money(
                  account.carryForward
                )}
              </td>

              <td>
                ${money(
                  account.currentOutstanding
                )}
              </td>

              <td>
                ${escapeHtml(
                  account.status
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   RENDER LEDGER
========================================================= */

function renderLedger() {

  if (!contributionRows) {
    return;
  }


  if (!contributions.length) {

    contributionRows.innerHTML =
      `
        <tr>
          <td colspan="6">
            No contributions recorded yet.
          </td>
        </tr>
      `;

    return;

  }


  contributionRows.innerHTML =
    contributions
      .slice()
      .reverse()
      .map(
        contribution => {

          const memberName =
            getMemberName(
              contribution.member_id
            );

          const reference =
            contribution.mpesa_reference ||
            contribution.reference ||
            "—";

          const method =
            contribution.payment_method ||
            "—";

          const type =
            contribution.contribution_type ||
            "—";


          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    contribution.contribution_date
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  memberName
                )}
              </td>

              <td>
                <strong>
                  ${money(
                    contribution.amount
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  type
                )}
              </td>

              <td>
                ${escapeHtml(
                  method
                )}
              </td>

              <td>
                ${escapeHtml(
                  reference
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   TOGGLE M-PESA
========================================================= */

function toggleMpesaReference() {

  if (!methodSelect) {
    return;
  }

  const method =
    String(
      methodSelect.value || ""
    )
      .trim()
      .toLowerCase();

  const isMpesa =
    method === "m-pesa" ||
    method === "mpesa" ||
    method === "m_pesa";


  if (mpesaReferenceWrap) {

    mpesaReferenceWrap.hidden =
      !isMpesa;

  }

  if (mpesaReference) {

    mpesaReference.required =
      isMpesa;

  }

}


/* =========================================================
   BIND EVENTS
========================================================= */

function bindEvents() {

  if (eventsBound) {

    toggleMpesaReference();

    return;

  }

  eventsBound = true;


  if (form) {

    form.addEventListener(
      "submit",
      handleSubmit
    );

  }

  if (methodSelect) {

    methodSelect.addEventListener(
      "change",
      toggleMpesaReference
    );

  }

  toggleMpesaReference();

}


/* =========================================================
   VALIDATE SELECTED MEMBER
========================================================= */

function getSelectedMember(
  memberId
) {

  const member =
    members.find(
      item =>
        String(item.id) ===
        String(memberId)
    );


  if (!member) {

    throw new Error(
      "The selected member does not belong to this group."
    );

  }


  const status =
    String(
      member.status || ""
    )
      .trim()
      .toLowerCase();


  if (status === "inactive") {

    throw new Error(
      "This member is inactive and cannot receive a contribution."
    );

  }


  return member;

}


/* =========================================================
   CHECK FINANCIAL MONTH
=========================================================

   This is a UI convenience check.

   The DATABASE trigger remains the authoritative security
   control:

       prevent_closed_month_contribution()
========================================================= */

async function ensureMonthIsOpen(
  month
) {

  const {
    data,
    error
  } =
    await supabase
      .from("financial_periods")
      .select(`
        status
      `)
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "month",
        month
      )
      .maybeSingle();


  if (error) {

    throw error;

  }


  if (
    data &&
    String(
      data.status || ""
    ).toLowerCase() === "closed"
  ) {

    throw new Error(
      `Financial month ${month} is closed. Contributions cannot be recorded.`
    );

  }

}


/* =========================================================
   SUBMIT CONTRIBUTION
========================================================= */

async function handleSubmit(
  event
) {

  event.preventDefault();


  if (saveButton?.disabled) {
    return;
  }


  try {

    clearError();


    if (!groupId) {

      throw new Error(
        "No group is associated with this account."
      );

    }


    /* -----------------------------------------------------
       MEMBER
    ----------------------------------------------------- */

    const memberId =
      String(
        memberSelect?.value || ""
      ).trim();


    if (!memberId) {

      throw new Error(
        "Please select a member."
      );

    }


    getSelectedMember(
      memberId
    );


    /* -----------------------------------------------------
       AMOUNT
    ----------------------------------------------------- */

    const amount =
      Number(
        amountInput?.value
      );


    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {

      throw new Error(
        "Please enter a valid contribution amount."
      );

    }


    /* -----------------------------------------------------
       DATE
    ----------------------------------------------------- */

    const contributionDate =
      dateInput?.value ||
      todayString();


    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        contributionDate
      )
    ) {

      throw new Error(
        "Please select a valid contribution date."
      );

    }


    const month =
      contributionDate.slice(
        0,
        7
      );


    /* -----------------------------------------------------
       TYPE
    ----------------------------------------------------- */

    const contributionType =
      String(
        typeSelect?.value ||
        "monthly"
      ).trim();


    const allowedTypes = [
      "monthly",
      "registration",
      "welfare",
      "special",
      "other"
    ];


    if (
      !allowedTypes.includes(
        contributionType
      )
    ) {

      throw new Error(
        "Invalid contribution type."
      );

    }


    /* -----------------------------------------------------
       PAYMENT METHOD
    ----------------------------------------------------- */

    const paymentMethod =
      String(
        methodSelect?.value ||
        "Cash"
      ).trim();


    const allowedMethods = [
      "M-Pesa",
      "Cash",
      "Bank transfer"
    ];


    if (
      !allowedMethods.includes(
        paymentMethod
      )
    ) {

      throw new Error(
        "Invalid payment method."
      );

    }


    /* -----------------------------------------------------
       M-PESA
    ----------------------------------------------------- */

    const mpesaRef =
      String(
        mpesaReference?.value || ""
      ).trim();


    if (
      paymentMethod === "M-Pesa" &&
      !mpesaRef
    ) {

      throw new Error(
        "Please enter the M-Pesa reference."
      );

    }


    /* -----------------------------------------------------
       MONTH OPEN CHECK
    ----------------------------------------------------- */

    await ensureMonthIsOpen(
      month
    );


    /* -----------------------------------------------------
       BUTTON
    ----------------------------------------------------- */

    if (saveButton) {

      saveButton.disabled =
        true;

      saveButton.textContent =
        "Saving...";

    }


    showStatus(
      "Recording contribution..."
    );


    /* =====================================================
       IMPORTANT SECURITY CHANGE

       DO NOT SEND:

           recorded_by: currentUser.id

       DO NOT SEND:

           recorded_by: currentMember.id

       The database trigger will resolve the authenticated
       user to the correct members.id.

       This prevents clients from choosing the recorder.
    ===================================================== */

    const payload = {

      group_id:
        groupId,

      member_id:
        memberId,

      amount:
        amount,

      contribution_type:
        contributionType,

      month:
        month,

      payment_method:
        paymentMethod,

      contribution_date:
        contributionDate,

      reference:
        mpesaRef || null,

      mpesa_reference:
        mpesaRef || null

    };


    console.log(
      "CHAMA LIVE: secure contribution payload",
      {
        group_id:
          payload.group_id,

        member_id:
          payload.member_id,

        amount:
          payload.amount,

        contribution_type:
          payload.contribution_type,

        month:
          payload.month,

        payment_method:
          payload.payment_method,

        contribution_date:
          payload.contribution_date
      }
    );


    /* -----------------------------------------------------
       INSERT
    ----------------------------------------------------- */

    const {
      error
    } =
      await supabase
        .from("contributions")
        .insert(
          payload
        );


    if (error) {

      throw error;

    }


    console.log(
      "CHAMA LIVE: contribution recorded successfully"
    );


    /* -----------------------------------------------------
       RESET
    ----------------------------------------------------- */

    if (form) {

      form.reset();

    }


    if (dateInput) {

      dateInput.value =
        todayString();

    }


    if (typeSelect) {

      typeSelect.value =
        "monthly";

    }


    if (methodSelect) {

      methodSelect.value =
        "M-Pesa";

    }


    toggleMpesaReference();


    /* -----------------------------------------------------
       REFRESH
    ----------------------------------------------------- */

    await loadContributions();

    renderProgress();

    renderMonthlyStatus();

    renderLedger();


    showStatus(
      "Contribution recorded successfully."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      3000
    );

  }
  catch (error) {

    showStatus("");

    showError(error);

  }
  finally {

    if (saveButton) {

      saveButton.disabled =
        false;

      saveButton.textContent =
        "Record Contribution";

    }

  }

}


/* =========================================================
   PUBLIC REFRESH
========================================================= */

export async function refreshContributions() {

  if (!groupId) {
    return;
  }

  await loadContributions();

  renderProgress();

  renderMonthlyStatus();

  renderLedger();

}


/* =========================================================
   AUTO INITIALIZATION
========================================================= */

function autoInitialize() {

  if (
    typeof document ===
    "undefined"
  ) {

    return;

  }


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      () => {

        initContributions();

      },
      {
        once: true
      }
    );

  }
  else {

    initContributions();

  }

}


autoInitialize();


console.log(
  "CHAMA LIVE: contributions.js ready"
);
```
