/* =========================================================
   CHAMA LIVE — CONTRIBUTIONS
   COMPLETE STABLE + RESPONSIVE VERSION

   FIXES
   ---------------------------------------------------------
   • Prevents page content from going outside screen
   • Responsive tables
   • Mobile table-card layout
   • Correct 7-column monthly status
   • Previous arrears calculation
   • Carry-forward / credit calculation
   • Correct PAID / PARTIAL / OUTSTANDING / OVERPAID status
   • Group-scoped records
   • Monthly contributions
   • Contribution goals
   • M-Pesa / Cash / Bank transfer
   • M-Pesa reference validation
   • Other contribution type
   • Notes support
   • Duplicate monthly payment warning
   • Responsive contribution history
   • Compatible with layout.js dynamic loading

   DATABASE TABLES
   ---------------------------------------------------------
   public.groups
   public.members
   public.contributions
   public.contribution_goals

   CONTRIBUTIONS COLUMNS USED
   ---------------------------------------------------------
   group_id
   member_id
   amount
   contribution_type
   month
   payment_method
   reference
   recorded_by
   created_at
   goal_id
   contribution_date
   notes
   mpesa_reference
========================================================= */

import {
  supabase
} from "./supabase.js";


console.log(
  "CHAMA LIVE: contributions.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const statusEl =
  document.getElementById("status");


const errorEl =
  document.getElementById("error");


const form =
  document.getElementById("contributionForm");


const memberSelect =
  document.getElementById("member");


const amountInput =
  document.getElementById("amount");


const dateInput =
  document.getElementById("contributionDate");


const typeSelect =
  document.getElementById("contributionType");


const methodSelect =
  document.getElementById("paymentMethod");


const mpesaReference =
  document.getElementById("mpesaReference");


const mpesaReferenceWrap =
  document.getElementById("mpesaReferenceWrap");


const saveButton =
  document.getElementById("saveContribution");


const monthlyExpected =
  document.getElementById("monthlyExpected");


const memberStatusRows =
  document.getElementById("memberStatusRows");


const contributionRows =
  document.getElementById("contributionRows");


const notesInput =
  document.getElementById("notes");


const goalSelect =
  document.getElementById("goal") ||
  document.getElementById("contributionGoal");


const goalProgressContainer =
  document.getElementById(
    "goalProgressContainer"
  );


/* =========================================================
   STATE
========================================================= */

let groupId = null;

let members = [];

let contributions = [];

let contributionGoals = [];

let monthlyContribution = 0;

let initialized = false;


/* =========================================================
   CONSTANTS
========================================================= */

const PAYMENT_METHODS = {

  MPESA: "M-Pesa",

  CASH: "Cash",

  BANK: "Bank transfer"

};


/* =========================================================
   HELPERS
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


function number(value) {

  const result =
    Number(value || 0);

  return Number.isFinite(result)
    ? result
    : 0;

}


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


function getContributionMonth(item) {

  if (
    item?.contribution_date
  ) {

    return String(
      item.contribution_date
    ).slice(0, 7);

  }


  if (
    item?.month
  ) {

    return String(
      item.month
    ).slice(0, 7);

  }


  if (
    item?.created_at
  ) {

    const date =
      new Date(
        item.created_at
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


  return "";

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
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =========================================================
   MONTH COMPARISON
========================================================= */

function monthToNumber(month) {

  if (
    !month ||
    !/^\d{4}-\d{2}$/.test(
      String(month)
    )
  ) {

    return null;

  }


  const [
    year,
    monthNumber
  ] =
    String(month)
      .split("-")
      .map(Number);


  return (
    year * 12 +
    monthNumber
  );

}


function getMonthsBetween(
  startMonth,
  endMonth
) {

  const start =
    monthToNumber(
      startMonth
    );

  const end =
    monthToNumber(
      endMonth
    );


  if (
    start === null ||
    end === null ||
    end < start
  ) {

    return [];

  }


  const months = [];

  for (
    let value = start;
    value <= end;
    value++
  ) {

    const year =
      Math.floor(
        (value - 1) / 12
      );

    const month =
      ((value - 1) % 12) + 1;


    months.push(
      `${year}-${String(month).padStart(2, "0")}`
    );

  }


  return months;

}


/* =========================================================
   STATUS / ERROR
========================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE Contributions Error:",
    error
  );


  if (errorEl) {

    errorEl.textContent =
      error?.message ||
      "Something went wrong.";

    errorEl.hidden =
      false;

  }


  if (statusEl) {

    statusEl.textContent =
      "Unable to complete the contribution request.";

  }

}


function clearError() {

  if (errorEl) {

    errorEl.hidden =
      true;

    errorEl.textContent =
      "";

  }

}


/* =========================================================
   CURRENT GROUP
========================================================= */

async function getGroupId() {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "my_group_id"
    );


  if (error) {

    throw error;

  }


  if (!data) {

    throw new Error(
      "No group is associated with your account."
    );

  }


  return data;

}


/* =========================================================
   LOAD GROUP
========================================================= */

async function loadGroup() {

  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select(
        "monthly_contribution,name,category"
      )
      .eq(
        "id",
        groupId
      )
      .single();


  if (error) {

    throw error;

  }


  monthlyContribution =
    number(
      data?.monthly_contribution
    );


  if (
    monthlyExpected
  ) {

    monthlyExpected.textContent =
      money(
        monthlyContribution
      );

  }


  if (
    amountInput &&
    monthlyContribution > 0
  ) {

    amountInput.value =
      monthlyContribution;

  }


  document
    .querySelectorAll(
      "[data-group-name]"
    )
    .forEach(
      element => {

        element.textContent =
          data?.name ||
          "CHAMA";

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
      .select(
        `
          id,
          name,
          status
        `
      )
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
    (data || [])
      .filter(
        member =>
          String(
            member.status ||
            "active"
          )
            .toLowerCase() ===
          "active"
      );


  if (!memberSelect) {
    return;
  }


  memberSelect.innerHTML = `

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


      option.textContent =
        member.name;


      memberSelect.appendChild(
        option
      );

    }
  );

}


/* =========================================================
   LOAD CONTRIBUTION GOALS
========================================================= */

async function loadContributionGoals() {

  contributionGoals = [];


  if (!goalSelect) {
    return;
  }


  const {
    data,
    error
  } =
    await supabase
      .from("contribution_goals")
      .select(
        `
          id,
          goal_name,
          category,
          target_amount,
          status,
          start_date,
          end_date,
          created_at
        `
      )
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "status",
        "active"
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


  contributionGoals =
    data || [];


  goalSelect.innerHTML = `

    <option value="">
      General contribution
    </option>

  `;


  contributionGoals.forEach(
    goal => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        goal.id;


      option.textContent =
        goal.target_amount
          ? `${goal.goal_name} — ${money(
              goal.target_amount
            )}`
          : goal.goal_name;


      goalSelect.appendChild(
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
      .select(
        `
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
        `
      )
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


  contributions =
    data || [];

}


/* =========================================================
   MEMBER NAME
========================================================= */

function getMemberName(memberId) {

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
   GOAL NAME
========================================================= */

function getGoalName(goalId) {

  if (!goalId) {

    return "General";

  }


  const goal =
    contributionGoals.find(
      item =>
        String(item.id) ===
        String(goalId)
    );


  return (
    goal?.goal_name ||
    "Goal"
  );

}


/* =========================================================
   PAYMENT METHOD
========================================================= */

function normalizePaymentMethod(value) {

  const method =
    String(value || "")
      .trim()
      .toLowerCase();


  if (
    method === "m-pesa" ||
    method === "mpesa" ||
    method === "m_pesa"
  ) {

    return PAYMENT_METHODS.MPESA;

  }


  if (
    method === "cash"
  ) {

    return PAYMENT_METHODS.CASH;

  }


  if (
    method === "bank" ||
    method === "bank transfer" ||
    method === "bank_transfer"
  ) {

    return PAYMENT_METHODS.BANK;

  }


  return value || "—";

}


/* =========================================================
   CONTRIBUTION TYPE
========================================================= */

function contributionTypeLabel(item) {

  const type =
    String(
      item?.contribution_type ||
      ""
    )
      .trim()
      .toLowerCase();


  const labels = {

    monthly: "Monthly",

    other: "Other",

    welfare: "Welfare",

    emergency: "Emergency",

    investment: "Investment",

    fundraising: "Fundraising",

    project: "Project",

    event: "Event",

    fine: "Fine"

  };


  return (
    labels[type] ||
    (
      type
        ? type.charAt(0).toUpperCase() +
          type.slice(1)
        : "—"
    )
  );

}


/* =========================================================
   OTHER CONTRIBUTION FIELD
========================================================= */

let otherTypeWrap = null;

let otherTypeInput = null;


/* =========================================================
   CREATE OTHER FIELD
========================================================= */

function createOtherContributionField() {

  /*
   * The HTML already contains this field.
   * Use it instead of creating a duplicate.
   */

  otherTypeWrap =
    document.getElementById(
      "otherContributionTypeWrap"
    );


  otherTypeInput =
    document.getElementById(
      "otherContributionType"
    );


  if (
    otherTypeWrap &&
    otherTypeInput
  ) {

    updateOtherContributionType();

    return;

  }


  if (!typeSelect) {
    return;
  }


  otherTypeWrap =
    document.createElement(
      "div"
    );


  otherTypeWrap.id =
    "otherContributionTypeWrap";


  otherTypeWrap.className =
    "form-group cl-other-type-wrap";


  otherTypeWrap.hidden =
    true;


  otherTypeWrap.innerHTML = `

    <label
      for="otherContributionType"
    >
      Other Contribution Name
    </label>

    <input
      id="otherContributionType"
      name="otherContributionType"
      type="text"
      maxlength="120"
      autocomplete="off"
      placeholder="e.g. Birthday contribution"
    >

    <small class="muted">
      Enter the name of this contribution.
    </small>

  `;


  otherTypeInput =
    otherTypeWrap.querySelector(
      "#otherContributionType"
    );


  const formGroup =
    typeSelect.closest(
      ".form-group"
    );


  if (
    formGroup?.parentElement
  ) {

    formGroup.parentElement
      .insertBefore(
        otherTypeWrap,
        formGroup.nextSibling
      );

  }


  updateOtherContributionType();

}


/* =========================================================
   UPDATE OTHER FIELD
========================================================= */

function updateOtherContributionType() {

  if (
    !typeSelect ||
    !otherTypeWrap ||
    !otherTypeInput
  ) {

    return;

  }


  const isOther =
    String(
      typeSelect.value || ""
    )
      .trim()
      .toLowerCase() ===
    "other";


  otherTypeWrap.hidden =
    !isOther;


  otherTypeInput.required =
    isOther;


  if (isOther) {

    otherTypeWrap.classList.add(
      "is-visible"
    );

  }
  else {

    otherTypeWrap.classList.remove(
      "is-visible"
    );

    otherTypeInput.value =
      "";

  }

}


/* =========================================================
   BUILD NOTES
========================================================= */

function buildContributionNotes(
  contributionType,
  otherDetails,
  normalNotes
) {

  const notes =
    String(
      normalNotes || ""
    ).trim();


  if (
    String(
      contributionType || ""
    ).toLowerCase() !==
    "other"
  ) {

    return notes || null;

  }


  const details =
    String(
      otherDetails || ""
    ).trim();


  if (!details) {

    return notes || null;

  }


  const otherLine =
    `Other contribution: ${details}`;


  if (!notes) {

    return otherLine;

  }


  return (
    `${otherLine}\n${notes}`
  );

}


/* =========================================================
   EXTRACT OTHER DETAILS
========================================================= */

function extractOtherDetails(item) {

  const type =
    String(
      item?.contribution_type ||
      ""
    ).toLowerCase();


  if (type !== "other") {

    return "";

  }


  const notes =
    String(
      item?.notes ||
      ""
    );


  const match =
    notes.match(
      /Other contribution:\s*(.+?)(?:\n|$)/i
    );


  return (
    match?.[1]?.trim() ||
    ""
  );

}


/* =========================================================
   PAYMENT METHOD
========================================================= */

function updatePaymentMethod() {

  if (!methodSelect) {
    return;
  }


  const method =
    normalizePaymentMethod(
      methodSelect.value
    );


  const isMpesa =
    method ===
    PAYMENT_METHODS.MPESA;


  if (mpesaReferenceWrap) {

    mpesaReferenceWrap.hidden =
      !isMpesa;

  }


  if (mpesaReference) {

    mpesaReference.required =
      isMpesa;


    if (!isMpesa) {

      mpesaReference.value =
        "";

    }

  }

}


/* =========================================================
   MONTHLY CONTRIBUTIONS FOR MEMBER
========================================================= */

function getMemberMonthlyContributions(
  memberId
) {

  return contributions.filter(
    item => {

      if (
        String(item.member_id) !==
        String(memberId)
      ) {

        return false;

      }


      return (
        String(
          item.contribution_type ||
          ""
        ).toLowerCase() ===
        "monthly"
      );

    }
  );

}


/* =========================================================
   MONTHLY PAID BY MEMBER
========================================================= */

function getMonthlyPaid(
  memberId,
  month
) {

  return getMemberMonthlyContributions(
    memberId
  )
    .filter(
      item =>
        getContributionMonth(item) ===
        month
    )
    .reduce(
      (
        total,
        item
      ) =>
        total +
        number(item.amount),
      0
    );

}


/* =========================================================
   CALCULATE MEMBER MONTHLY ACCOUNT
========================================================= */

function calculateMemberMonthlyAccount(
  memberId
) {

  const currentMonth =
    getCurrentMonth();


  const currentMonthNumber =
    monthToNumber(
      currentMonth
    );


  const memberContributions =
    getMemberMonthlyContributions(
      memberId
    );


  /*
   * Find the earliest month for which
   * this member has a monthly contribution.
   */

  let earliestMonth =
    currentMonth;


  memberContributions.forEach(
    item => {

      const month =
        getContributionMonth(
          item
        );


      if (
        monthToNumber(month) !== null &&
        monthToNumber(month) <
        monthToNumber(earliestMonth)
      ) {

        earliestMonth =
          month;

      }

    }
  );


  /*
   * Also look at current month.
   */

  const months =
    getMonthsBetween(
      earliestMonth,
      currentMonth
    );


  /*
   * If there are no historical records,
   * start with the current month only.
   */

  if (!months.length) {

    months.push(
      currentMonth
    );

  }


  let credit = 0;

  let arrears = 0;

  let previousMonthsDue = 0;

  let previousMonthsPaid = 0;


  /*
   * Calculate the position before
   * the current month.
   *
   * Positive balance = arrears
   * Negative balance = credit
   */

  months.forEach(
    month => {

      const monthNumber =
        monthToNumber(month);


      if (
        monthNumber === null ||
        monthNumber >=
        currentMonthNumber
      ) {

        return;

      }


      const paid =
        getMonthlyPaid(
          memberId,
          month
        );


      const due =
        monthlyContribution;


      previousMonthsDue +=
        due;

      previousMonthsPaid +=
        paid;


      const monthBalance =
        due - paid;


      /*
       * Apply existing credit first.
       */

      if (
        credit > 0
      ) {

        if (
          monthBalance > 0
        ) {

          const used =
            Math.min(
              credit,
              monthBalance
            );

          credit -= used;

          arrears +=
            monthBalance -
            used;

        }
        else if (
          monthBalance < 0
        ) {

          credit +=
            Math.abs(
              monthBalance
            );

        }

      }
      else {

        if (
          monthBalance > 0
        ) {

          arrears +=
            monthBalance;

        }
        else if (
          monthBalance < 0
        ) {

          /*
           * A historical overpayment
           * becomes carry-forward credit.
           */

          const overpayment =
            Math.abs(
              monthBalance
            );


          if (
            arrears > 0
          ) {

            const used =
              Math.min(
                arrears,
                overpayment
              );

            arrears -= used;

            credit =
              overpayment -
              used;

          }
          else {

            credit +=
              overpayment;

          }

        }

      }

    }
  );


  /*
   * Current month.
   */

  const currentPaid =
    getMonthlyPaid(
      memberId,
      currentMonth
    );


  const currentDue =
    monthlyContribution;


  /*
   * First use current payment
   * against previous arrears.
   */

  let remainingCurrentPaid =
    currentPaid;


  let currentArrears =
    arrears;


  if (
    currentArrears > 0 &&
    remainingCurrentPaid > 0
  ) {

    const used =
      Math.min(
        currentArrears,
        remainingCurrentPaid
      );


    currentArrears -=
      used;

    remainingCurrentPaid -=
      used;

  }


  /*
   * Then use remaining payment
   * against current month's due.
   */

  let currentOutstanding =
    currentDue;


  if (
    remainingCurrentPaid > 0
  ) {

    const used =
      Math.min(
        currentOutstanding,
        remainingCurrentPaid
      );


    currentOutstanding -=
      used;

    remainingCurrentPaid -=
      used;

  }


  /*
   * Apply previous credit to anything
   * still outstanding.
   */

  let carryForward =
    credit;


  if (
    carryForward > 0 &&
    currentArrears > 0
  ) {

    const used =
      Math.min(
        carryForward,
        currentArrears
      );


    carryForward -=
      used;

    currentArrears -=
      used;

  }


  if (
    carryForward > 0 &&
    currentOutstanding > 0
  ) {

    const used =
      Math.min(
        carryForward,
        currentOutstanding
      );


    carryForward -=
      used;

    currentOutstanding -=
      used;

  }


  /*
   * Any payment remaining after
   * all obligations is new credit.
   */

  if (
    remainingCurrentPaid > 0
  ) {

    carryForward +=
      remainingCurrentPaid;

  }


  /*
   * Total amount still owed.
   */

  const outstanding =
    Math.max(
      currentArrears +
      currentOutstanding,
      0
    );


  /*
   * Status.
   */

  let status =
    "OUTSTANDING";


  let statusClass =
    "cl-status-outstanding";


  if (
    currentDue <= 0
  ) {

    status =
      "NOT SET";

    statusClass =
      "cl-status-neutral";

  }
  else if (
    carryForward > 0
  ) {

    status =
      "OVERPAID";

    statusClass =
      "cl-status-credit";

  }
  else if (
    outstanding <= 0 &&
    currentPaid > 0
  ) {

    status =
      "PAID";

    statusClass =
      "cl-status-paid";

  }
  else if (
    currentPaid > 0
  ) {

    status =
      "PARTIAL";

    statusClass =
      "cl-status-partial";

  }


  /*
   * Progress toward current month.
   */

  const effectiveCurrentPayment =
    Math.max(
      currentPaid -
      arrears,
      0
    );


  const progress =
    currentDue > 0
      ? Math.min(
          (
            effectiveCurrentPayment /
            currentDue
          ) * 100,
          100
        )
      : 0;


  return {

    currentDue,

    previousArrears:
      Math.max(
        arrears,
        0
      ),

    currentPaid,

    carryForward:
      Math.max(
        carryForward,
        0
      ),

    outstanding,

    status,

    statusClass,

    progress,

    previousMonthsDue,

    previousMonthsPaid

  };

}


/* =========================================================
   LEDGER
========================================================= */

function renderLedger() {

  if (!contributionRows) {
    return;
  }


  if (!contributions.length) {

    contributionRows.innerHTML = `

      <tr>

        <td
          colspan="8"
          class="cl-empty-table"
        >

          <div class="cl-empty-state">

            <div class="cl-empty-icon">
              +
            </div>

            <strong>
              No contributions recorded yet
            </strong>

            <span>
              Record the group's first contribution
              using the form above.
            </span>

          </div>

        </td>

      </tr>

    `;

    return;

  }


  contributionRows.innerHTML =
    contributions
      .slice(0, 100)
      .map(
        item => {

          const date =
            item.contribution_date ||
            item.created_at ||
            (
              item.month
                ? `${item.month}-01`
                : null
            );


          const reference =
            item.mpesa_reference ||
            item.reference ||
            "—";


          const paymentMethod =
            normalizePaymentMethod(
              item.payment_method
            );


          const type =
            contributionTypeLabel(
              item
            );


          const otherDetails =
            extractOtherDetails(
              item
            );


          const goalName =
            getGoalName(
              item.goal_id
            );


          return `

            <tr>

              <td data-label="Date">

                ${escapeHtml(
                  formatDate(date)
                )}

              </td>


              <td data-label="Member">

                <strong>
                  ${escapeHtml(
                    getMemberName(
                      item.member_id
                    )
                  )}
                </strong>

              </td>


              <td
                data-label="Amount"
                class="cl-money-cell"
              >

                <strong>
                  ${escapeHtml(
                    money(item.amount)
                  )}
                </strong>

              </td>


              <td data-label="Type">

                <span
                  class="cl-type-badge"
                >
                  ${escapeHtml(type)}
                </span>

                ${
                  otherDetails
                    ? `
                      <small
                        class="cl-sub-detail"
                      >
                        ${escapeHtml(
                          otherDetails
                        )}
                      </small>
                    `
                    : ""
                }

              </td>


              <td data-label="Payment Method">

                <span
                  class="cl-payment-badge"
                >
                  ${escapeHtml(
                    paymentMethod
                  )}
                </span>

              </td>


              <td data-label="Goal">

                ${escapeHtml(
                  goalName
                )}

              </td>


              <td data-label="Reference">

                ${escapeHtml(
                  reference
                )}

              </td>


              <td data-label="Notes">

                ${
                  item.notes
                    ? `
                      <span
                        class="cl-note-text"
                      >
                        ${escapeHtml(
                          item.notes
                        )}
                      </span>
                    `
                    : "—"
                }

              </td>

            </tr>

          `;

        }
      )
      .join("");

}


/* =========================================================
   MONTHLY STATUS
========================================================= */

function renderMemberStatus() {

  if (!memberStatusRows) {
    return;
  }


  if (!members.length) {

    memberStatusRows.innerHTML = `

      <tr>

        <td
          colspan="7"
          class="cl-empty-table"
        >

          No active members found.

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
            calculateMemberMonthlyAccount(
              member.id
            );


          return `

            <tr>

              <td
                data-label="Member"
                class="cl-member-cell"
              >

                <strong>
                  ${escapeHtml(
                    member.name
                  )}
                </strong>

              </td>


              <td
                data-label="Current Due"
                class="cl-money-cell"
              >

                ${escapeHtml(
                  money(
                    account.currentDue
                  )
                )}

              </td>


              <td
                data-label="Previous Arrears"
              >

                ${
                  account.previousArrears > 0
                    ? `
                      <span
                        class="cl-arrears"
                      >
                        ${escapeHtml(
                          money(
                            account.previousArrears
                          )
                        )}
                      </span>
                    `
                    : `
                      <span
                        class="cl-zero"
                      >
                        —
                      </span>
                    `
                }

              </td>


              <td
                data-label="Current Paid"
              >

                <div
                  class="cl-paid-cell"
                >

                  <strong>
                    ${escapeHtml(
                      money(
                        account.currentPaid
                      )
                    )}
                  </strong>

                  <div
                    class="cl-mini-progress"
                    aria-hidden="true"
                  >

                    <span
                      style="
                        width:${account.progress}%;
                      "
                    ></span>

                  </div>

                </div>

              </td>


              <td
                data-label="Carry Forward"
              >

                ${
                  account.carryForward > 0
                    ? `
                      <span
                        class="cl-carry-forward"
                      >
                        ${escapeHtml(
                          money(
                            account.carryForward
                          )
                        )}
                      </span>
                    `
                    : `
                      <span
                        class="cl-zero"
                      >
                        —
                      </span>
                    `
                }

              </td>


              <td
                data-label="Outstanding"
              >

                ${
                  account.outstanding > 0
                    ? `
                      <strong
                        class="cl-outstanding-amount"
                      >
                        ${escapeHtml(
                          money(
                            account.outstanding
                          )
                        )}
                      </strong>
                    `
                    : `
                      <span
                        class="cl-zero"
                      >
                        —
                      </span>
                    `
                }

              </td>


              <td
                data-label="Status"
              >

                <span
                  class="cl-status-badge ${account.statusClass}"
                >

                  ${escapeHtml(
                    account.status
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
   SUMMARY
========================================================= */

function renderSummary() {

  const container =
    document.getElementById(
      "contributionSummary"
    );


  if (!container) {
    return;
  }


  const total =
    contributions.reduce(
      (
        sum,
        item
      ) =>
        sum +
        number(item.amount),
      0
    );


  const currentMonth =
    getCurrentMonth();


  const monthlyTotal =
    contributions
      .filter(
        item =>
          String(
            item.contribution_type ||
            ""
          ).toLowerCase() ===
          "monthly" &&
          getContributionMonth(item) ===
          currentMonth
      )
      .reduce(
        (
          sum,
          item
        ) =>
          sum +
          number(item.amount),
        0
      );


  const outstandingMembers =
    members.filter(
      member => {

        const account =
          calculateMemberMonthlyAccount(
            member.id
          );


        return (
          account.outstanding > 0
        );

      }
    ).length;


  container.innerHTML = `

    <div
      class="cl-contribution-summary-card"
    >

      <span>
        TOTAL RECORDED
      </span>

      <strong>
        ${escapeHtml(
          money(total)
        )}
      </strong>

      <small>
        All contribution records
      </small>

    </div>


    <div
      class="cl-contribution-summary-card"
    >

      <span>
        THIS MONTH
      </span>

      <strong>
        ${escapeHtml(
          money(monthlyTotal)
        )}
      </strong>

      <small>
        Monthly contributions
      </small>

    </div>


    <div
      class="cl-contribution-summary-card"
    >

      <span>
        MONTHLY RATE
      </span>

      <strong>
        ${escapeHtml(
          money(
            monthlyContribution
          )
        )}
      </strong>

      <small>
        Expected per active member
      </small>

    </div>


    <div
      class="cl-contribution-summary-card"
    >

      <span>
        NEEDS ATTENTION
      </span>

      <strong>
        ${escapeHtml(
          String(
            outstandingMembers
          )
        )}
      </strong>

      <small>
        Members with outstanding balance
      </small>

    </div>

  `;

}


/* =========================================================
   CONTRIBUTION GOALS
========================================================= */

function renderContributionGoals() {

  if (!goalProgressContainer) {
    return;
  }


  if (!contributionGoals.length) {

    goalProgressContainer.innerHTML = `

      <div class="cl-goals-empty">

        <div class="cl-empty-icon">
          +
        </div>

        <strong>
          No active contribution goals
        </strong>

        <span>
          Create a contribution goal to start
          tracking progress.
        </span>

      </div>

    `;

    return;

  }


  goalProgressContainer.innerHTML =
    contributionGoals
      .map(
        goal => {

          const target =
            number(
              goal.target_amount
            );


          const raised =
            contributions
              .filter(
                item =>
                  String(
                    item.goal_id
                  ) ===
                  String(
                    goal.id
                  )
              )
              .reduce(
                (
                  sum,
                  item
                ) =>
                  sum +
                  number(
                    item.amount
                  ),
                0
              );


          const percentage =
            target > 0
              ? Math.min(
                  (
                    raised /
                    target
                  ) * 100,
                  100
                )
              : 0;


          return `

            <div
              class="cl-goal-card"
            >

              <div
                class="cl-goal-top"
              >

                <div>

                  <strong>
                    ${escapeHtml(
                      goal.goal_name ||
                      "Contribution Goal"
                    )}
                  </strong>

                  ${
                    goal.category
                      ? `
                        <small>
                          ${escapeHtml(
                            goal.category
                          )}
                        </small>
                      `
                      : ""
                  }

                </div>

                <strong>
                  ${escapeHtml(
                    money(raised)
                  )}
                </strong>

              </div>


              <div
                class="cl-goal-progress"
              >

                <span
                  style="
                    width:${percentage}%;
                  "
                ></span>

              </div>


              <div
                class="cl-goal-bottom"
              >

                <span>
                  ${escapeHtml(
                    target > 0
                      ? `${money(target)} target`
                      : "No target set"
                  )}
                </span>

                <strong>
                  ${escapeHtml(
                    `${Math.round(
                      percentage
                    )}%`
                  )}
                </strong>

              </div>

            </div>

          `;

        }
      )
      .join("");

}


/* =========================================================
   RECORD CONTRIBUTION
========================================================= */

async function recordContribution(event) {

  event.preventDefault();

  clearError();


  const memberId =
    memberSelect?.value ||
    "";


  const amount =
    number(
      amountInput?.value
    );


  const contributionDate =
    dateInput?.value ||
    "";


  const contributionType =
    String(
      typeSelect?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  const otherDetails =
    otherTypeInput?.value
      ?.trim() ||
    "";


  const paymentMethod =
    normalizePaymentMethod(
      methodSelect?.value
    );


  const reference =
    mpesaReference?.value
      ?.trim() ||
    "";


  const normalNotes =
    notesInput?.value
      ?.trim() ||
    "";


  const goalId =
    goalSelect?.value ||
    null;


  /* =====================================================
     VALIDATION
  ==================================================== */

  if (!memberId) {

    showError(
      new Error(
        "Please select a member."
      )
    );

    return;

  }


  if (
    amount <= 0
  ) {

    showError(
      new Error(
        "Please enter a valid amount greater than zero."
      )
    );

    amountInput?.focus();

    return;

  }


  if (!contributionDate) {

    showError(
      new Error(
        "Please select the contribution date."
      )
    );

    dateInput?.focus();

    return;

  }


  if (!contributionType) {

    showError(
      new Error(
        "Please select the contribution type."
      )
    );

    typeSelect?.focus();

    return;

  }


  if (
    contributionType === "other" &&
    !otherDetails
  ) {

    showError(
      new Error(
        "Please specify what the Other contribution is for."
      )
    );

    otherTypeInput?.focus();

    return;

  }


  if (!paymentMethod) {

    showError(
      new Error(
        "Please select the payment method."
      )
    );

    return;

  }


  if (
    paymentMethod ===
      PAYMENT_METHODS.MPESA &&
    !reference
  ) {

    showError(
      new Error(
        "Please enter the M-Pesa reference."
      )
    );

    mpesaReference?.focus();

    return;

  }


  const month =
    contributionDate.slice(
      0,
      7
    );


  /* =====================================================
     DUPLICATE MONTHLY WARNING
  ==================================================== */

  if (
    contributionType ===
    "monthly"
  ) {

    const existing =
      contributions.some(
        item =>

          String(
            item.member_id
          ) ===
          String(memberId) &&

          String(
            item.contribution_type ||
            ""
          ).toLowerCase() ===
          "monthly" &&

          getContributionMonth(
            item
          ) ===
          month
      );


    if (existing) {

      const proceed =
        window.confirm(

          `This member already has a monthly contribution for ${month}.\n\n` +

          `You can still record another payment. ` +

          `Any excess payment will become carry-forward credit.\n\n` +

          `Continue?`

        );


      if (!proceed) {
        return;
      }

    }

  }


  const finalNotes =
    buildContributionNotes(
      contributionType,
      otherDetails,
      normalNotes
    );


  if (saveButton) {

    saveButton.disabled =
      true;

    saveButton.textContent =
      "Saving...";

  }


  if (statusEl) {

    statusEl.hidden =
      false;

    statusEl.textContent =
      "Recording contribution...";

  }


  try {

    const contributionData = {

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

      goal_id:
        goalId,

      notes:
        finalNotes,

      mpesa_reference:
        paymentMethod ===
          PAYMENT_METHODS.MPESA
          ? reference
          : null,

      reference:
        reference ||
        null

    };


    console.log(
      "CHAMA LIVE: Saving contribution",
      contributionData
    );


    const {
      error
    } =
      await supabase
        .from("contributions")
        .insert(
          contributionData
        );


    if (error) {
      throw error;
    }


    await loadContributions();


    renderLedger();

    renderMemberStatus();

    renderSummary();

    renderContributionGoals();


    form?.reset();


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
        PAYMENT_METHODS.MPESA;

    }


    if (goalSelect) {

      goalSelect.value =
        "";

    }


    updateOtherContributionType();

    updatePaymentMethod();


    if (
      amountInput &&
      monthlyContribution > 0
    ) {

      amountInput.value =
        monthlyContribution;

    }


    clearError();


    if (statusEl) {

      statusEl.hidden =
        false;

      statusEl.textContent =
        "✓ Contribution recorded successfully.";

    }


    if (form) {

      form.classList.add(
        "cl-save-success"
      );


      window.setTimeout(
        () => {

          form.classList.remove(
            "cl-save-success"
          );

        },
        900
      );

    }

  }
  catch (error) {

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
   VISUAL STYLES
========================================================= */

function injectContributionStyles() {

  if (
    document.getElementById(
      "chama-contributions-enhanced-styles"
    )
  ) {

    return;

  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    "chama-contributions-enhanced-styles";


  style.textContent = `

    /* =====================================================
       GLOBAL WIDTH PROTECTION
    ====================================================== */

    html,
    body {

      width:
        100%;

      max-width:
        100%;

      overflow-x:
        hidden;

    }


    *,
    *::before,
    *::after {

      box-sizing:
        border-box;

    }


    .page,
    .main {

      width:
        100%;

      max-width:
        100%;

      min-width:
        0;

    }


    .card,
    section,
    form,
    .card-header {

      max-width:
        100%;

      min-width:
        0;

    }


    /* =====================================================
       PAGE HEADER
    ====================================================== */

    .contribution-page-header {

      position:
        relative;

      overflow:
        hidden;

      width:
        100%;

      max-width:
        100%;

      padding:
        28px;

      margin-bottom:
        20px;

      border-radius:
        22px;

      color:
        #ffffff;

      background:

        radial-gradient(
          circle at 85% 10%,
          rgba(
            94,
            234,
            212,
            .24
          ),
          transparent 30%
        ),

        linear-gradient(
          135deg,
          #115e59,
          #0f766e 55%,
          #0d9488
        );

      box-shadow:
        0 18px 40px
        rgba(
          15,
          118,
          110,
          .18
        );

    }


    .contribution-page-header::after {

      content:
        "";

      position:
        absolute;

      width:
        260px;

      height:
        260px;

      right:
        -120px;

      bottom:
        -150px;

      border:
        1px solid
        rgba(
          255,
          255,
          255,
          .13
        );

      border-radius:
        50%;

      box-shadow:
        0 0 0 45px
        rgba(
          255,
          255,
          255,
          .025
        ),
        0 0 0 90px
        rgba(
          255,
          255,
          255,
          .02
        );

    }


    .contribution-page-header .eyebrow {

      color:
        #99f6e4;

      font-weight:
        800;

      letter-spacing:
        1.4px;

      font-size:
        11px;

    }


    .contribution-page-header h1 {

      margin:
        5px 0 8px;

      color:
        #ffffff;

      font-size:
        clamp(
          25px,
          4vw,
          40px
        );

      line-height:
        1.08;

      letter-spacing:
        -1.2px;

    }


    .contribution-page-header p {

      max-width:
        650px;

      margin:
        0;

      color:
        rgba(
          255,
          255,
          255,
          .76
        );

      line-height:
        1.65;

    }


    /* =====================================================
       SUMMARY
    ====================================================== */

    #contributionSummary {

      display:
        grid;

      grid-template-columns:
        repeat(
          4,
          minmax(
            0,
            1fr
          )
        );

      gap:
        14px;

      width:
        100%;

      max-width:
        100%;

      margin-bottom:
        20px;

    }


    .cl-contribution-summary-card {

      min-width:
        0;

      overflow:
        hidden;

      padding:
        19px;

      border:
        1px solid
        #e2e8f0;

      border-radius:
        17px;

      background:
        rgba(
          255,
          255,
          255,
          .96
        );

      box-shadow:
        0 18px 50px
        rgba(
          15,
          118,
          110,
          .08
        );

    }


    .cl-contribution-summary-card::before {

      content:
        "";

      display:
        block;

      width:
        4px;

      height:
        24px;

      float:
        left;

      margin-right:
        11px;

      border-radius:
        99px;

      background:
        linear-gradient(
          to bottom,
          #14b8a6,
          #0f766e
        );

    }


    .cl-contribution-summary-card span {

      display:
        block;

      color:
        #64748b;

      font-size:
        10px;

      font-weight:
        850;

      letter-spacing:
        1px;

    }


    .cl-contribution-summary-card strong {

      display:
        block;

      margin:
        7px 0 3px;

      color:
        #0f172a;

      font-size:
        24px;

      overflow:
        hidden;

      text-overflow:
        ellipsis;

    }


    .cl-contribution-summary-card small {

      color:
        #64748b;

      font-size:
        11px;

    }


    /* =====================================================
       CARDS
    ====================================================== */

    .card {

      width:
        100%;

      max-width:
        100%;

      overflow:
        hidden;

      border:
        1px solid
        rgba(
          226,
          232,
          240,
          .9
        ) !important;

      border-radius:
        19px !important;

      box-shadow:
        0 18px 50px
        rgba(
          15,
          118,
          110,
          .08
        ) !important;

      background:
        rgba(
          255,
          255,
          255,
          .96
        ) !important;

    }


    /* =====================================================
       FORM
    ====================================================== */

    #contributionForm {

      width:
        100%;

      max-width:
        100%;

      min-width:
        0;

    }


    #contributionForm .form-group {

      width:
        100%;

      min-width:
        0;

      margin-bottom:
        12px;

    }


    #contributionForm label {

      display:
        block;

      margin-bottom:
        6px;

      color:
        #0f172a;

      font-size:
        12px;

      font-weight:
        750;

    }


    #contributionForm input,
    #contributionForm select,
    #contributionForm textarea {

      display:
        block;

      width:
        100%;

      max-width:
        100%;

      min-width:
        0;

      min-height:
        47px;

      padding:
        10px 12px;

      border:
        1px solid
        #e2e8f0;

      border-radius:
        11px;

      background:
        #ffffff;

      color:
        #0f172a;

    }


    #contributionForm textarea {

      min-height:
        95px;

      resize:
        vertical;

    }


    #contributionForm input:focus,
    #contributionForm select:focus,
    #contributionForm textarea:focus {

      outline:
        none;

      border-color:
        #14b8a6;

      box-shadow:
        0 0 0 4px
        rgba(
          20,
          184,
          166,
          .10
        );

    }


    /* =====================================================
       OTHER
    ====================================================== */

    .cl-other-type-wrap {

      padding:
        14px;

      border:
        1px solid
        #99f6e4;

      border-radius:
        13px;

      background:
        linear-gradient(
          135deg,
          #f0fdfa,
          #ffffff
        );

    }


    .cl-other-type-wrap[hidden] {

      display:
        none;

    }


    .cl-other-type-wrap small {

      display:
        block;

      margin-top:
        6px;

      color:
        #64748b;

      line-height:
        1.5;

    }


    /* =====================================================
       BUTTON
    ====================================================== */

    #saveContribution {

      width:
        100%;

      max-width:
        100%;

      min-height:
        51px;

      border:
        0 !important;

      border-radius:
        12px !important;

      background:
        linear-gradient(
          135deg,
          #0f766e,
          #14b8a6
        ) !important;

      box-shadow:
        0 12px 24px
        rgba(
          15,
          118,
          110,
          .18
        );

      font-weight:
        800;

    }


    #saveContribution:disabled {

      opacity:
        .65;

    }


    /* =====================================================
       TABLE CONTAINER
    ====================================================== */

    .table-wrapper,
    .table-wrap {

      width:
        100%;

      max-width:
        100%;

      min-width:
        0;

      overflow-x:
        auto;

      overflow-y:
        hidden;

      -webkit-overflow-scrolling:
        touch;

      scrollbar-width:
        thin;

    }


    .table-wrapper table,
    .table-wrap table,
    .table {

      width:
        100%;

      max-width:
        100%;

      border-collapse:
        separate;

      border-spacing:
        0;

    }


    /*
     * Desktop tables have a minimum width.
     * The wrapper scrolls instead of the page.
     */

    .table-wrapper table,
    .table-wrap table {

      min-width:
        720px;

    }


    .table-wrapper th,
    .table-wrap th,
    .table th {

      padding:
        12px 10px;

      background:
        #f8fafc;

      color:
        #64748b;

      font-size:
        10px;

      font-weight:
        850;

      letter-spacing:
        .7px;

      text-transform:
        uppercase;

      white-space:
        nowrap;

    }


    .table-wrapper td,
    .table-wrap td,
    .table td {

      padding:
        12px 10px;

      color:
        #334155;

      font-size:
        12px;

      vertical-align:
        middle;

    }


    .table-wrapper tbody tr:hover,
    .table-wrap tbody tr:hover {

      background:
        #f8fffd;

    }


    /* =====================================================
       MONTHLY STATUS TABLE
    ====================================================== */

    #memberStatusRows td {

      white-space:
        nowrap;

    }


    #memberStatusRows td:first-child {

      min-width:
        150px;

    }


    .cl-member-cell strong {

      color:
        #0f172a;

    }


    .cl-money-cell {

      color:
        #115e59 !important;

    }


    .cl-arrears {

      color:
        #be123c;

      font-weight:
        750;

    }


    .cl-carry-forward {

      color:
        #047857;

      font-weight:
        800;

    }


    .cl-outstanding-amount {

      color:
        #be123c;

    }


    .cl-zero {

      color:
        #94a3b8;

    }


    /* =====================================================
       BADGES
    ====================================================== */

    .cl-type-badge,
    .cl-payment-badge,
    .cl-status-badge {

      display:
        inline-flex;

      align-items:
        center;

      justify-content:
        center;

      width:
        fit-content;

      max-width:
        100%;

      padding:
        5px 9px;

      border-radius:
        999px;

      font-size:
        10px;

      font-weight:
        800;

      white-space:
        nowrap;

    }


    .cl-type-badge {

      color:
        #0f766e;

      background:
        #f0fdfa;

      border:
        1px solid
        #ccfbf1;

    }


    .cl-payment-badge {

      color:
        #475569;

      background:
        #f8fafc;

      border:
        1px solid
        #e2e8f0;

    }


    .cl-status-paid {

      color:
        #047857;

      background:
        #ecfdf5;

    }


    .cl-status-credit {

      color:
        #0f766e;

      background:
        #ccfbf1;

    }


    .cl-status-partial {

      color:
        #b45309;

      background:
        #fffbeb;

    }


    .cl-status-outstanding {

      color:
        #be123c;

      background:
        #fff1f2;

    }


    .cl-status-neutral {

      color:
        #475569;

      background:
        #f1f5f9;

    }


    /* =====================================================
       PROGRESS
    ====================================================== */

    .cl-paid-cell {

      min-width:
        90px;

    }


    .cl-mini-progress {

      width:
        70px;

      height:
        4px;

      margin-top:
        5px;

      overflow:
        hidden;

      border-radius:
        999px;

      background:
        #e2e8f0;

    }


    .cl-mini-progress span {

      display:
        block;

      height:
        100%;

      border-radius:
        inherit;

      background:
        linear-gradient(
          90deg,
          #0f766e,
          #14b8a6
        );

    }


    /* =====================================================
       HISTORY
    ====================================================== */

    .cl-sub-detail {

      display:
        block;

      max-width:
        180px;

      margin-top:
        4px;

      color:
        #64748b;

      font-size:
        10px;

      line-height:
        1.4;

      white-space:
        normal;

      overflow-wrap:
        anywhere;

    }


    .cl-note-text {

      display:
        block;

      max-width:
        190px;

      color:
        #64748b;

      font-size:
        10px;

      line-height:
        1.45;

      white-space:
        normal;

      overflow-wrap:
        anywhere;

    }


    /* =====================================================
       GOALS
    ====================================================== */

    .cl-goal-card {

      width:
        100%;

      max-width:
        100%;

      margin-bottom:
        10px;

      padding:
        15px;

      border:
        1px solid
        #e2e8f0;

      border-radius:
        14px;

      background:
        #ffffff;

    }


    .cl-goal-top,
    .cl-goal-bottom {

      display:
        flex;

      align-items:
        center;

      justify-content:
        space-between;

      gap:
        12px;

    }


    .cl-goal-top strong {

      color:
        #0f172a;

    }


    .cl-goal-top small {

      display:
        block;

      margin-top:
        3px;

      color:
        #64748b;

    }


    .cl-goal-progress {

      width:
        100%;

      height:
        8px;

      margin:
        12px 0 8px;

      overflow:
        hidden;

      border-radius:
        99px;

      background:
        #e2e8f0;

    }


    .cl-goal-progress span {

      display:
        block;

      height:
        100%;

      border-radius:
        inherit;

      background:
        linear-gradient(
          90deg,
          #0f766e,
          #14b8a6
        );

    }


    .cl-goal-bottom {

      color:
        #64748b;

      font-size:
        11px;

    }


    .cl-goals-empty {

      display:
        flex;

      flex-direction:
        column;

      align-items:
        center;

      justify-content:
        center;

      min-height:
        150px;

      padding:
        25px;

      text-align:
        center;

    }


    .cl-goals-empty strong {

      color:
        #0f172a;

    }


    .cl-goals-empty span {

      margin-top:
        5px;

      color:
        #64748b;

      font-size:
        11px;

    }


    /* =====================================================
       EMPTY STATE
    ====================================================== */

    .cl-empty-table {

      padding:
        0 !important;

    }


    .cl-empty-state {

      display:
        flex;

      flex-direction:
        column;

      align-items:
        center;

      justify-content:
        center;

      min-height:
        150px;

      padding:
        25px;

      text-align:
        center;

    }


    .cl-empty-icon {

      display:
        grid;

      place-items:
        center;

      width:
        44px;

      height:
        44px;

      margin-bottom:
        10px;

      border-radius:
        14px;

      background:
        #f0fdfa;

      color:
        #0f766e;

      font-size:
        25px;

      font-weight:
        800;

    }


    /* =====================================================
       STATUS
    ====================================================== */

    #status {

      max-width:
        100%;

      color:
        #0f766e;

      font-size:
        12px;

      font-weight:
        650;

      overflow-wrap:
        anywhere;

    }


    #error {

      max-width:
        100%;

      overflow-wrap:
        anywhere;

      border:
        1px solid
        #fecdd3 !important;

      border-radius:
        12px !important;

      background:
        #fff1f2 !important;

      color:
        #be123c !important;

      font-size:
        12px;

    }


    /* =====================================================
       SUCCESS
    ====================================================== */

    .cl-save-success {

      animation:
        clSaveSuccess .5s ease;

    }


    @keyframes clSaveSuccess {

      0% {

        box-shadow:
          0 0 0 0
          rgba(
            20,
            184,
            166,
            .25
          );

      }

      100% {

        box-shadow:
          0 0 0 12px
          rgba(
            20,
            184,
            166,
            0
          );

      }

    }


    /* =====================================================
       TABLET
    ====================================================== */

    @media (
      max-width: 900px
    ) {

      #contributionSummary {

        grid-template-columns:
          repeat(
            2,
            minmax(
              0,
              1fr
            )
          );

      }

    }


    /* =====================================================
       MOBILE
    ====================================================== */

    @media (
      max-width: 650px
    ) {

      .contribution-page-header {

        padding:
          21px 18px;

        border-radius:
          17px;

      }


      .contribution-page-header h1 {

        font-size:
          27px;

      }


      #contributionSummary {

        gap:
          9px;

      }


      .cl-contribution-summary-card {

        padding:
          14px;

        border-radius:
          14px;

      }


      .cl-contribution-summary-card strong {

        font-size:
          19px;

      }


      .cl-contribution-summary-card small {

        display:
          block;

        overflow:
          hidden;

        text-overflow:
          ellipsis;

      }


      /*
       * On mobile, the tables become cards.
       */

      .table-wrapper,
      .table-wrap {

        overflow:
          visible;

      }


      .table-wrapper table,
      .table-wrap table,
      .table {

        display:
          block;

        min-width:
          0 !important;

      }


      .table-wrapper thead,
      .table-wrap thead,
      .table thead {

        display:
          none;

      }


      .table-wrapper tbody,
      .table-wrap tbody,
      .table tbody {

        display:
          grid;

        width:
          100%;

        gap:
          10px;

      }


      .table-wrapper tr,
      .table-wrap tr,
      .table tr {

        display:
          grid;

        grid-template-columns:
          1fr 1fr;

        width:
          100%;

        min-width:
          0;

        padding:
          8px;

        border:
          1px solid
          #e2e8f0;

        border-radius:
          13px;

        background:
          #ffffff;

        box-shadow:
          0 5px 16px
          rgba(
            15,
            23,
            42,
            .035
          );

      }


      .table-wrapper td,
      .table-wrap td,
      .table td {

        display:
          flex;

        flex-direction:
          column;

        align-items:
          flex-start;

        justify-content:
          center;

        width:
          100%;

        min-width:
          0;

        padding:
          8px 7px;

        border:
          0 !important;

        white-space:
          normal !important;

        overflow-wrap:
          anywhere;

      }


      .table-wrapper td::before,
      .table-wrap td::before,
      .table td::before {

        content:
          attr(data-label);

        display:
          block;

        margin-bottom:
          3px;

        color:
          #94a3b8;

        font-size:
          9px;

        font-weight:
          800;

        letter-spacing:
          .55px;

        text-transform:
          uppercase;

      }


      .cl-member-cell {

        grid-column:
          1 / -1;

      }


      .cl-sub-detail,
      .cl-note-text {

        max-width:
          100%;

      }


      .cl-mini-progress {

        width:
          100%;

        max-width:
          100px;

      }


      .cl-type-badge,
      .cl-payment-badge,
      .cl-status-badge {

        max-width:
          100%;

      }


      .cl-goal-top {

        align-items:
          flex-start;

      }

    }


    /* =====================================================
       SMALL PHONES
    ====================================================== */

    @media (
      max-width: 390px
    ) {

      #contributionSummary {

        grid-template-columns:
          1fr 1fr;

      }


      .cl-contribution-summary-card {

        padding:
          11px;

      }


      .cl-contribution-summary-card strong {

        font-size:
          17px;

      }


      .cl-contribution-summary-card small {

        display:
          none;

      }


      .table-wrapper tr,
      .table-wrap tr,
      .table tr {

        grid-template-columns:
          1fr;

      }


      .table-wrapper td,
      .table-wrap td,
      .table td {

        padding:
          7px;

      }


      .cl-goal-top,
      .cl-goal-bottom {

        flex-wrap:
          wrap;

      }

    }


    /* =====================================================
       REDUCED MOTION
    ====================================================== */

    @media (
      prefers-reduced-motion: reduce
    ) {

      * {

        animation:
          none !important;

        transition:
          none !important;

      }

    }

  `;


  document.head.appendChild(
    style
  );

}


/* =========================================================
   PAGE HEADER
========================================================= */

function enhancePageHeader() {

  if (
    document.getElementById(
      "contributionPageHeader"
    )
  ) {

    return;

  }


  const main =
    document.querySelector(
      ".main, .page"
    );


  if (!main) {
    return;
  }


  const header =
    document.createElement(
      "section"
    );


  header.id =
    "contributionPageHeader";


  header.className =
    "contribution-page-header";


  header.innerHTML = `

    <div class="eyebrow">
      FINANCIAL MANAGEMENT
    </div>

    <h1>
      Contributions
    </h1>

    <p>
      Record member contributions, track monthly
      commitments and keep every group payment
      organised in one connected ledger.
    </p>

  `;


  const firstElement =
    main.firstElementChild;


  main.insertBefore(
    header,
    firstElement
  );


  const summary =
    document.createElement(
      "div"
    );


  summary.id =
    "contributionSummary";


  main.insertBefore(
    summary,
    firstElement
  );

}


/* =========================================================
   SECTION HEADINGS
========================================================= */

function enhanceSectionHeadings() {

  document
    .querySelectorAll(
      ".card h2"
    )
    .forEach(
      heading => {

        if (
          heading.dataset
            .clEnhanced ===
          "true"
        ) {

          return;

        }


        heading.dataset
          .clEnhanced =
          "true";


        heading.parentElement
          ?.classList
          .add(
            "cl-enhanced-section-heading"
          );

      }
    );

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initContributions() {

  if (initialized) {
    return;
  }


  initialized =
    true;


  try {

    injectContributionStyles();

    enhancePageHeader();

    enhanceSectionHeadings();

    createOtherContributionField();


    clearError();


    if (statusEl) {

      statusEl.hidden =
        false;

      statusEl.textContent =
        "Loading contributions...";

    }


    /* =====================================================
       GROUP
    ==================================================== */

    groupId =
      await getGroupId();


    console.log(
      "CHAMA LIVE GROUP ID:",
      groupId
    );


    /* =====================================================
       DATA
    ==================================================== */

    await Promise.all([

      loadGroup(),

      loadMembers(),

      loadContributions(),

      loadContributionGoals()

    ]);


    /* =====================================================
       DEFAULTS
    ==================================================== */

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
        PAYMENT_METHODS.MPESA;

    }


    updateOtherContributionType();

    updatePaymentMethod();


    if (
      amountInput &&
      monthlyContribution > 0
    ) {

      amountInput.value =
        monthlyContribution;

    }


    /* =====================================================
       RENDER
    ==================================================== */

    renderLedger();

    renderMemberStatus();

    renderSummary();

    renderContributionGoals();


    if (statusEl) {

      statusEl.textContent =
        "Contributions loaded.";

    }


    console.log(
      "CHAMA LIVE: Contributions ready."
    );

  }
  catch (error) {

    initialized =
      false;

    showError(error);

  }

}


/* =========================================================
   EVENTS
========================================================= */

if (
  form &&
  !form.dataset.clContributionBound
) {

  form.dataset
    .clContributionBound =
    "true";


  form.addEventListener(
    "submit",
    recordContribution
  );

}


if (
  methodSelect &&
  !methodSelect.dataset.clPaymentBound
) {

  methodSelect.dataset
    .clPaymentBound =
    "true";


  methodSelect.addEventListener(
    "change",
    updatePaymentMethod
  );

}


if (
  typeSelect &&
  !typeSelect.dataset.clTypeBound
) {

  typeSelect.dataset
    .clTypeBound =
    "true";


  typeSelect.addEventListener(
    "change",
    updateOtherContributionType
  );

}


/* =========================================================
   DIRECT PAGE COMPATIBILITY
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      if (
        !window.__CHAMA_LIVE_LAYOUT_LOADING__
      ) {

        initContributions();

      }

    },
    {
      once: true
    }
  );

}
else {

  if (
    !window.__CHAMA_LIVE_LAYOUT_LOADING__
  ) {

    initContributions();

  }

}


console.log(
  "CHAMA LIVE: contributions.js ready"
);
