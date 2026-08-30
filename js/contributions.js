/* =========================================================
   CHAMA LIVE — CONTRIBUTIONS
   RECURRING MONTHLY CONTRIBUTIONS

   FEATURES
   ---------------------------------------------------------
   1. Monthly contribution is recurring.
   2. Previous outstanding balances are cleared first.
   3. Current month's monthly due is applied next.
   4. Any excess becomes carry-forward credit.
   5. Carry-forward credit is automatically used in future
      months before requiring a new payment.
   6. Progress counts only the amount applied to the
      selected month's recurring contribution.
   7. Shows monthly goal, collection rate and participation.
   8. recorded_by stores the CURRENT MEMBER ID.
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

  const now =
    new Date();

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

  return String(
    value ?? ""
  )
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

  const date =
    new Date(value);

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
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );

}


/* =========================================================
   MONTH NAME
========================================================= */

function formatMonth(month) {

  if (!month) {
    return "—";
  }

  const parts =
    String(month).split("-");

  if (parts.length !== 2) {
    return month;
  }

  const date =
    new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
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
   SHOW STATUS
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
   SHOW ERROR
========================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE Contributions:",
    error
  );

  let message =
    error?.message ||
    String(error) ||
    "Something went wrong.";

  /*
   * Make common Supabase errors easier to understand.
   */

  if (
    message
      .toLowerCase()
      .includes("recorded_by")
  ) {

    message =
      "The contribution recorder could not be linked to your member account. Please make sure your account is linked to a member.";

  }

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
   GET MONTHLY CONTRIBUTION
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
        status === "" ||
        status === "approved"
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
   MONTHLY CONTRIBUTIONS ONLY
========================================================= */

function getMonthlyContributionsForMember(
  memberId
) {

  return contributions
    .filter(
      contribution => {

        return (
          contribution.member_id === memberId &&
          contribution.contribution_type === "monthly"
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
   GET MONTHS BETWEEN TWO MONTHS
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


  /*
   * Find earliest month with a payment.
   */

  const contributionMonths =
    memberContributions
      .map(
        getContributionMonth
      )
      .filter(Boolean)
      .sort();


  let firstMonth =
    contributionMonths.length
      ? contributionMonths[0]
      : targetMonth;


  if (firstMonth > targetMonth) {

    firstMonth =
      targetMonth;

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


  for (
    const month of months
  ) {

    previousOutstanding =
      outstanding;


    /*
     * Carry-forward credit from previous month.
     */

    let availableCredit =
      credit;


    /*
     * Monthly amount due.
     */

    let currentDue =
      monthlyDue;


    /*
     * First use existing credit against
     * previous outstanding.
     */

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


    /*
     * Then use remaining credit against
     * current month's due.
     */

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


    /*
     * Get actual payments made during this month.
     */

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


    /*
     * Payment first clears arrears.
     */

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


    /*
     * Payment then covers current month's due.
     */

    let applied =
      0;

    if (
      payment > 0 &&
      currentDue > 0
    ) {

      applied =
        Math.min(
          payment,
          currentDue
        );

      currentDue -=
        applied;

      payment -=
        applied;

    }


    /*
     * Remaining amount becomes carry-forward credit.
     */

    credit =
      availableCredit +
      payment;


    /*
     * Remaining current month due.
     */

    outstanding =
      currentDue;


    /*
     * For target month, determine amount applied.
     */

    if (
      month === targetMonth
    ) {

      appliedThisMonth =
        monthlyDue -
        outstanding;

      appliedThisMonth =
        Math.min(
          monthlyDue,
          Math.max(
            0,
            appliedThisMonth
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

export async function init() {

  if (initialized) {

    console.warn(
      "CHAMA LIVE: contributions already initialized"
    );

    return;

  }

  initialized =
    true;

  try {

    clearError();

    showStatus(
      "Loading contributions..."
    );


    /*
     * Authenticate user.
     */

    currentUser =
      await requireAuth();


    if (!currentUser?.id) {

      throw new Error(
        "You are not signed in."
      );

    }


    /*
     * Get the member linked to the
     * authenticated account.
     */

    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "No member record is linked to your account."
      );

    }


    if (!currentMember.id) {

      throw new Error(
        "Your member record is missing its ID."
      );

    }


    if (!currentMember.group_id) {

      throw new Error(
        "Your member account is not linked to a group."
      );

    }


    groupId =
      currentMember.group_id;


    /*
     * Load group.
     */

    currentGroup =
      await getMyGroup();


    if (!currentGroup) {

      throw new Error(
        "Unable to load your group."
      );

    }


    /*
     * Set today's date.
     */

    if (
      dateInput &&
      !dateInput.value
    ) {

      dateInput.value =
        todayString();

    }


    /*
     * Load data.
     */

    await loadMembers();

    await loadContributions();


    /*
     * Render page.
     */

    renderMonthlyExpected();

    renderProgress();

    renderMonthlyStatus();

    renderLedger();


    /*
     * Bind form events.
     */

    bindEvents();


    showStatus("");


    console.log(
      "CHAMA LIVE: contributions initialized",
      {
        authUserId:
          currentUser.id,

        recorderMemberId:
          currentMember.id,

        groupId
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
        member_number,
        membership_number,
        name,
        phone,
        email,
        role,
        status
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
   GET MEMBER NAME
========================================================= */

function getMemberName(
  memberId
) {

  const member =
    members.find(
      item =>
        item.id === memberId
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


  let appliedTotal =
    0;

  let contributingMembers =
    0;


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
            ) *
            100
          )
        )
      : 0;


  const participation =
    activeMembers.length > 0
      ? Math.round(
          (
            contributingMembers /
            activeMembers.length
          ) *
          100
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
      money(
        appliedTotal
      );

  }


  if (progressGoal) {

    progressGoal.textContent =
      money(
        goal
      );

  }


  if (progressBar) {

    progressBar.style.width =
      `${percentage}%`;

    progressBar.setAttribute(
      "aria-valuenow",
      percentage
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
   TOGGLE MPESA FIELD
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
    method === "mpesa" ||
    method === "m-pesa" ||
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
   SUBMIT CONTRIBUTION
========================================================= */

async function handleSubmit(
  event
) {

  event.preventDefault();


  try {

    clearError();


    if (!groupId) {

      throw new Error(
        "No group is associated with this account."
      );

    }


    /*
     * IMPORTANT:
     *
     * recorded_by MUST be the member ID,
     * NOT the Supabase Auth user ID.
     */

    if (!currentMember?.id) {

      throw new Error(
        "Your account is not linked to a valid member record. Please contact the group administrator."
      );

    }


    if (
      currentMember.group_id !== groupId
    ) {

      throw new Error(
        "Your member account is linked to a different group."
      );

    }


    const memberId =
      memberSelect?.value;


    if (!memberId) {

      throw new Error(
        "Please select a member."
      );

    }


    /*
     * Confirm selected member belongs
     * to this group.
     */

    const selectedMember =
      members.find(
        member =>
          member.id === memberId
      );


    if (!selectedMember) {

      throw new Error(
        "The selected member could not be found in this group."
      );

    }


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


    const contributionDate =
      dateInput?.value ||
      todayString();


    const contributionType =
      typeSelect?.value ||
      "monthly";


    const paymentMethod =
      methodSelect?.value ||
      "Cash";


    const mpesaRef =
      String(
        mpesaReference?.value || ""
      )
        .trim();


    if (
      paymentMethod
        .toLowerCase()
        .includes("mpesa") &&
      !mpesaRef
    ) {

      throw new Error(
        "Please enter the M-Pesa reference."
      );

    }


    const month =
      contributionDate.slice(
        0,
        7
      );


    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        contributionDate
      )
    ) {

      throw new Error(
        "Please enter a valid contribution date."
      );

    }


    if (saveButton) {

      saveButton.disabled =
        true;

      saveButton.textContent =
        "Saving...";

    }


    showStatus(
      "Recording contribution..."
    );


    /*
     * IMPORTANT DATABASE MAPPING
     * --------------------------
     *
     * recorded_by = currentMember.id
     *
     * NOT:
     *
     * currentUser.id
     */

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

      recorded_by:
        currentMember.id,

      reference:
        mpesaRef || null,

      mpesa_reference:
        mpesaRef || null

    };


    console.log(
      "CHAMA LIVE: contribution payload",
      {
        ...payload,
        recorded_by:
          currentMember.id
      }
    );


    const {
      data,
      error
    } =
      await supabase
        .from("contributions")
        .insert(
          payload
        )
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
        .single();


    if (error) {

      console.error(
        "CHAMA LIVE: contribution insert failed",
        error
      );

      throw error;

    }


    console.log(
      "CHAMA LIVE: contribution recorded",
      data
    );


    /*
     * Reset form.
     */

    if (form) {
      form.reset();
    }


    /*
     * Restore today's date.
     */

    if (dateInput) {

      dateInput.value =
        todayString();

    }


    toggleMpesaReference();


    /*
     * Reload ledger.
     */

    await loadContributions();


    /*
     * Refresh dashboard.
     */

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
   AUTO INITIALIZE
========================================================= */

if (
  document.readyState === "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      init();

    },
    {
      once: true
    }
  );

}
else {

  init();

}


console.log(
  "CHAMA LIVE: contributions.js ready"
);
