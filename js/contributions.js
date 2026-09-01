/* =========================================================
   CHAMA LIVE — CONTRIBUTIONS
   CANONICAL 2B ACCOUNTING VERSION

   ACCOUNTING MONTH UPDATE
   ---------------------------------------------------------
   • Accounting Month is explicit page state.
   • Selected month is refreshed through the canonical RPC.
   • Monthly status is loaded for selected month.
   • No frontend arrears calculation.
   • No frontend allocation calculation.
   • No frontend carry-forward calculation.
   • Supabase canonical RPC remains authoritative.
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


/*
 * Explicit accounting month selector.
 */

const accountingMonthSelect =
  document.getElementById(
    "accountingMonth"
  );

const selectedAccountingMonthLabel =
  document.getElementById(
    "selectedAccountingMonthLabel"
  );


/* =========================================================
   STATE
========================================================= */

let groupId = null;

let members = [];

let contributions = [];

let contributionGoals = [];

let canonicalMemberStatus = [];

let monthlyContribution = 0;

let initialized = false;


/*
 * The selected accounting month is the month
 * displayed by canonical monthly accounting.
 *
 * Default:
 * current local month.
 */

let accountingMonth =
  getCurrentMonth();


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


/*
 * Convert YYYY-MM to a readable month label.
 */

function formatAccountingMonth(month) {

  if (
    !/^\d{4}-\d{2}$/.test(
      String(month || "")
    )
  ) {

    return String(
      month || ""
    );

  }

  const [
    year,
    monthNumber
  ] =
    String(month).split("-");

  const date =
    new Date(
      Number(year),
      Number(monthNumber) - 1,
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


/*
 * Return YYYY-MM for a Date object.
 */

function monthKeyFromDate(date) {

  return (
    `${date.getFullYear()}-` +
    `${String(
      date.getMonth() + 1
    ).padStart(2, "0")}`
  );

}


/*
 * Add/subtract months from YYYY-MM.
 */

function shiftMonth(
  month,
  offset
) {

  const [
    year,
    monthNumber
  ] =
    String(month)
      .split("-")
      .map(Number);

  const date =
    new Date(
      year,
      monthNumber - 1 + offset,
      1
    );

  return monthKeyFromDate(
    date
  );

}


/*
 * Build accounting month options.
 *
 * Previous months are included because arrears
 * may originate there.
 *
 * Future months are included so the user can
 * inspect future obligations such as October.
 */

function buildAccountingMonthOptions() {

  if (!accountingMonthSelect) {
    return;
  }

  const current =
    getCurrentMonth();

  const start =
    shiftMonth(
      current,
      -12
    );

  const end =
    shiftMonth(
      current,
      6
    );

  const options = [];

  let cursor =
    start;

  while (
    cursor <= end
  ) {

    options.push(cursor);

    cursor =
      shiftMonth(
        cursor,
        1
      );

  }

  accountingMonthSelect.innerHTML =
    options
      .map(
        month => `
          <option value="${month}">
            ${escapeHtml(
              formatAccountingMonth(
                month
              )
            )}
          </option>
        `
      )
      .join("");

  accountingMonthSelect.value =
    accountingMonth;

}


/*
 * Update visible selected-month label.
 */

function renderAccountingMonthLabel() {

  if (
    !selectedAccountingMonthLabel
  ) {
    return;
  }

  selectedAccountingMonthLabel.textContent =
    formatAccountingMonth(
      accountingMonth
    );

}


/*
 * Return the month selected by the user.
 */

function getSelectedAccountingMonth() {

  const value =
    String(
      accountingMonthSelect?.value ||
      accountingMonth ||
      getCurrentMonth()
    );

  if (
    !/^\d{4}-\d{2}$/.test(
      value
    )
  ) {

    return getCurrentMonth();

  }

  return value;

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

      return monthKeyFromDate(
        date
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
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

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

    statusEl.hidden =
      false;

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
   ---------------------------------------------------------
   Membership accounting is controlled by members.status.
   onboarding_status is deliberately NOT used here.
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
   CANONICAL 2B STATUS
========================================================= */

/*
 * IMPORTANT:
 *
 * This function does NOT calculate:
 *
 * • arrears
 * • credit
 * • allocations
 * • outstanding
 *
 * It only asks the canonical RPC for the
 * selected accounting month.
 */

async function loadCanonicalMemberStatus(
  month = accountingMonth
) {

  if (!groupId) {

    canonicalMemberStatus = [];

    return [];

  }


  if (
    !/^\d{4}-\d{2}$/.test(
      String(month || "")
    )
  ) {

    throw new Error(
      "Accounting month must use YYYY-MM format."
    );

  }


  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_canonical_member_monthly_status",
      {
        p_group_id:
          groupId,

        p_month:
          month
      }
    );


  if (error) {

    throw error;

  }


  canonicalMemberStatus =
    data || [];


  return canonicalMemberStatus;

}


/*
 * Find canonical status for one member.
 */

function getCanonicalMemberStatus(
  memberId
) {

  return canonicalMemberStatus.find(
    item =>
      String(item.member_id) ===
      String(memberId)
  ) || null;

}


/*
 * Refresh canonical accounting for one member.
 *
 * Used after recording a monthly contribution.
 */

async function refreshCanonicalMember(
  memberId,
  month
) {

  if (!groupId) {

    throw new Error(
      "No current group is available."
    );

  }


  if (!memberId) {

    throw new Error(
      "No contribution member was supplied."
    );

  }


  if (
    !/^\d{4}-\d{2}$/.test(
      String(month || "")
    )
  ) {

    throw new Error(
      "Contribution month must use YYYY-MM format."
    );

  }


  const {
    data,
    error
  } =
    await supabase.rpc(
      "refresh_canonical_contribution_accounting",
      {
        p_group_id:
          groupId,

        p_through_month:
          month,

        p_member_id:
          memberId
      }
    );


  if (error) {

    throw error;

  }


  console.log(
    "CHAMA LIVE: Canonical contribution accounting refreshed",
    {
      groupId,
      memberId,
      month,
      result: data
    }
  );


  return data;

}


/*
 * NEW:
 * Refresh canonical accounting for the current group
 * through the selected accounting month.
 *
 * This deliberately uses the existing canonical RPC
 * with p_member_id = null so every active/member
 * accounting chain can be brought through the selected
 * month before the status RPC is read.
 *
 * No manual obligation or allocation is performed here.
 */

async function refreshCanonicalAccountingThroughMonth(
  month
) {

  if (!groupId) {

    throw new Error(
      "No current group is available."
    );

  }


  if (
    !/^\d{4}-\d{2}$/.test(
      String(month || "")
    )
  ) {

    throw new Error(
      "Accounting month must use YYYY-MM format."
    );

  }


  const {
    data,
    error
  } =
    await supabase.rpc(
      "refresh_canonical_contribution_accounting",
      {
        p_group_id:
          groupId,

        p_through_month:
          month,

        p_member_id:
          null
      }
    );


  if (error) {

    throw error;

  }


  console.log(
    "CHAMA LIVE: Canonical group accounting refreshed",
    {
      groupId,
      month,
      result: data
    }
  );


  return data;

}


/* =========================================================
   ACCOUNTING MONTH
========================================================= */

async function changeAccountingMonth() {

  const selected =
    getSelectedAccountingMonth();


  accountingMonth =
    selected;


  renderAccountingMonthLabel();


  clearError();


  if (statusEl) {

    statusEl.hidden =
      false;

    statusEl.textContent =
      `Refreshing ${formatAccountingMonth(
        accountingMonth
      )} canonical accounting...`;

  }


  if (memberStatusRows) {

    memberStatusRows.innerHTML = `

      <tr>

        <td colspan="7">

          Refreshing ${escapeHtml(
            formatAccountingMonth(
              accountingMonth
            )
          )} canonical accounting...

        </td>

      </tr>

    `;

  }


  /*
   * IMPORTANT:
   *
   * Selecting an accounting month is not merely a
   * display operation.
   *
   * The canonical obligation/allocation chain must
   * first exist through the selected month.
   *
   * We therefore call the EXISTING canonical refresh
   * RPC and let Supabase perform all obligation and
   * allocation work.
   *
   * The frontend does not calculate or create any
   * accounting values itself.
   */

  try {

    await refreshCanonicalAccountingThroughMonth(
      accountingMonth
    );


    /*
     * Read the canonical result only after refresh.
     */

    await loadCanonicalMemberStatus(
      accountingMonth
    );


    renderMemberStatus();

    renderSummary();


    if (statusEl) {

      statusEl.textContent =
        `${formatAccountingMonth(
          accountingMonth
        )} accounting loaded.`;

    }

  }
  catch (error) {

    showError(error);

  }

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


function createOtherContributionField() {

  otherTypeWrap =
    document.getElementById(
      "otherContributionTypeWrap"
    );


  otherTypeInput =
    document.getElementById(
      "otherContributionType"
    );


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


  if (!isOther) {

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


  if (
    type !== "other"
  ) {

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
   PAYMENT METHOD UI
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

          No contributions recorded yet.

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
   CANONICAL STATUS HELPERS
========================================================= */

function canonicalStatusLabel(
  status
) {

  const value =
    String(
      status || ""
    )
      .trim()
      .toLowerCase();


  const labels = {

    paid: "PAID",

    partial: "PARTIAL",

    outstanding: "OUTSTANDING",

    credit: "OVERPAID"

  };


  return (
    labels[value] ||
    (
      value
        ? value.toUpperCase()
        : "NOT SET"
    )
  );

}


function canonicalStatusClass(
  status
) {

  const value =
    String(
      status || ""
    )
      .trim()
      .toLowerCase();


  if (
    value === "paid"
  ) {

    return "cl-status-paid";

  }


  if (
    value === "partial"
  ) {

    return "cl-status-partial";

  }


  if (
    value === "credit"
  ) {

    return "cl-status-credit";

  }


  if (
    value === "outstanding"
  ) {

    return "cl-status-outstanding";

  }


  return "cl-status-neutral";

}


/*
 * Progress is visual only.
 *
 * The amount applied is supplied by
 * the canonical RPC.
 */

function canonicalProgress(
  account
) {

  const due =
    number(
      account?.monthly_due
    );


  const applied =
    number(
      account?.applied_this_month
    );


  if (
    due <= 0
  ) {

    return 0;

  }


  return Math.min(
    Math.max(
      (
        applied /
        due
      ) * 100,
      0
    ),
    100
  );

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


  if (!canonicalMemberStatus.length) {

    memberStatusRows.innerHTML = `

      <tr>

        <td
          colspan="7"
          class="cl-empty-table"
        >

          No canonical accounting rows are
          available for
          ${escapeHtml(
            formatAccountingMonth(
              accountingMonth
            )
          )}.

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
            getCanonicalMemberStatus(
              member.id
            );


          /*
           * Never replace missing canonical
           * accounting data with frontend
           * calculations.
           */

          if (!account) {

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


                <td data-label="Current Due">
                  —
                </td>


                <td data-label="Previous Arrears">
                  —
                </td>


                <td data-label="Current Paid">
                  —
                </td>


                <td data-label="Carry Forward">
                  —
                </td>


                <td data-label="Outstanding">
                  —
                </td>


                <td data-label="Status">

                  <span
                    class="cl-status-badge cl-status-neutral"
                  >
                    NOT AVAILABLE
                  </span>

                </td>

              </tr>

            `;

          }


          const monthlyDue =
            number(
              account.monthly_due
            );


          const previousArrears =
            number(
              account.previous_outstanding
            );


          const currentPaid =
            number(
              account.current_month_payment
            );


          const appliedThisMonth =
            number(
              account.applied_this_month
            );


          const carryForward =
            number(
              account.carry_forward
            );


          const outstanding =
            number(
              account.current_outstanding
            );


          const progress =
            canonicalProgress(
              account
            );


          const status =
            canonicalStatusLabel(
              account.status
            );


          const statusClass =
            canonicalStatusClass(
              account.status
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
                  money(monthlyDue)
                )}

              </td>


              <td
                data-label="Previous Arrears"
              >

                ${
                  previousArrears > 0
                    ? `
                      <span
                        class="cl-arrears"
                      >
                        ${escapeHtml(
                          money(
                            previousArrears
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
                        currentPaid
                      )
                    )}
                  </strong>

                  <div
                    class="cl-mini-progress"
                    aria-hidden="true"
                  >

                    <span
                      style="
                        width:${progress}%;
                      "
                    ></span>

                  </div>

                  <small
                    class="cl-sub-detail"
                  >

                    Applied:
                    ${escapeHtml(
                      money(
                        appliedThisMonth
                      )
                    )}

                  </small>

                </div>

              </td>


              <td
                data-label="Carry Forward"
              >

                ${
                  carryForward > 0
                    ? `
                      <span
                        class="cl-carry-forward"
                      >
                        ${escapeHtml(
                          money(
                            carryForward
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
                  outstanding > 0
                    ? `
                      <strong
                        class="cl-outstanding-amount"
                      >
                        ${escapeHtml(
                          money(
                            outstanding
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
                  class="cl-status-badge ${statusClass}"
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


  /*
   * THIS MONTH means the selected
   * accounting month.
   */

  const selectedMonth =
    accountingMonth;


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
          selectedMonth
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
    canonicalMemberStatus.filter(
      account =>
        number(
          account.current_outstanding
        ) > 0
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
        ${escapeHtml(
          formatAccountingMonth(
            selectedMonth
          )
        ).toUpperCase()}
      </span>

      <strong>
        ${escapeHtml(
          money(monthlyTotal)
        )}
      </strong>

      <small>
        Monthly contributions recorded
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
        Canonical outstanding members
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


  if (
    !/^\d{4}-\d{2}$/.test(
      month
    )
  ) {

    showError(
      new Error(
        "Please enter a valid contribution date."
      )
    );

    return;

  }


  /*
   * Duplicate warning remains a warning only.
   *
   * A second monthly payment is legitimate
   * and may become carry-forward.
   */

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


    /*
     * STEP 1
     *
     * Raw contribution record.
     */

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


    /*
     * STEP 2
     *
     * Monthly contribution:
     * refresh canonical accounting through
     * the contribution's month.
     *
     * No manual allocation is performed.
     */

    if (
      contributionType ===
      "monthly"
    ) {

      if (statusEl) {

        statusEl.textContent =
          "Updating canonical monthly accounting...";

      }


      await refreshCanonicalMember(
        memberId,
        month
      );


      /*
       * After recording a contribution,
       * automatically display the contribution's
       * accounting month.
       */

      accountingMonth =
        month;


      if (
        accountingMonthSelect
      ) {

        accountingMonthSelect.value =
          accountingMonth;

      }


      renderAccountingMonthLabel();


      await loadCanonicalMemberStatus(
        accountingMonth
      );

    }
    else {

      /*
       * Non-monthly contributions do not enter
       * canonical monthly obligation allocation.
       *
       * Keep the user's selected accounting month.
       */

      await loadCanonicalMemberStatus(
        accountingMonth
      );

    }


    /*
     * STEP 3
     *
     * Reload raw ledger.
     */

    await loadContributions();


    /*
     * STEP 4
     *
     * Render.
     */

    renderLedger();

    renderMemberStatus();

    renderSummary();

    renderContributionGoals();


    /*
     * Reset form.
     */

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
        `✓ Contribution recorded. ${formatAccountingMonth(
          accountingMonth
        )} canonical accounting refreshed.`;

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
   INITIALIZE
========================================================= */

export async function initContributions() {

  if (initialized) {
    return;
  }


  initialized =
    true;


  try {

    clearError();


    /*
     * Build month selector before loading data.
     */

    buildAccountingMonthOptions();

    renderAccountingMonthLabel();


    if (statusEl) {

      statusEl.hidden =
        false;

      statusEl.textContent =
        "Loading contributions...";

    }


    /*
     * GROUP
     */

    groupId =
      await getGroupId();


    /*
     * DATA
     */

    await Promise.all([

      loadGroup(),

      loadMembers(),

      loadContributions(),

      loadContributionGoals()

    ]);


    /*
     * CANONICAL ACCOUNTING
     *
     * Uses selected accountingMonth.
     */

    await loadCanonicalMemberStatus(
      accountingMonth
    );


    /*
     * DEFAULT FORM VALUES
     */

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


    createOtherContributionField();

    updateOtherContributionType();

    updatePaymentMethod();


    if (
      amountInput &&
      monthlyContribution > 0
    ) {

      amountInput.value =
        monthlyContribution;

    }


    /*
     * RENDER
     */

    renderAccountingMonthLabel();

    renderLedger();

    renderMemberStatus();

    renderSummary();

    renderContributionGoals();


    if (statusEl) {

      statusEl.textContent =
        `${formatAccountingMonth(
          accountingMonth
        )} accounting loaded.`;

    }


    console.log(
      "CHAMA LIVE: Contributions ready.",
      {
        groupId,
        accountingMonth
      }
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


/*
 * Contribution form.
 */

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


/*
 * Payment method.
 */

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


/*
 * Contribution type.
 */

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


/*
 * Accounting month selector.
 */

if (
  accountingMonthSelect &&
  !accountingMonthSelect.dataset
    .clAccountingMonthBound
) {

  accountingMonthSelect.dataset
    .clAccountingMonthBound =
    "true";


  accountingMonthSelect.addEventListener(
    "change",
    changeAccountingMonth
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
