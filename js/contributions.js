/* =========================================================
   CHAMA LIVE — CONTRIBUTIONS
   COMPLETE STABLE + VISUALLY ENHANCED VERSION

   FEATURES
   ---------------------------------------------------------
   • Group-scoped contribution records
   • Monthly contribution tracking
   • Contribution goals
   • M-Pesa / Cash / Bank transfer
   • M-Pesa reference validation
   • "Other" contribution type with custom details
   • Notes support
   • Duplicate monthly payment warning
   • Responsive contribution history
   • Responsive monthly status
   • CHAMA LIVE visual enhancement
   • Compatible with layout.js dynamic loading

   LIVE DATABASE TABLES USED
   ---------------------------------------------------------
   public.groups
   public.members
   public.contributions
   public.contribution_goals

   EXISTING CONTRIBUTIONS COLUMNS USED
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

   IMPORTANT
   ---------------------------------------------------------
   No database migration is required for "Other".

   When contribution type = "other":

       contribution_type = "other"

       notes =
         "Other contribution: <custom details>"
         + optional existing notes

   This keeps the database schema compatible while
   preserving the administrator's description.
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
  document.getElementById(
    "status"
  );


const errorEl =
  document.getElementById(
    "error"
  );


const form =
  document.getElementById(
    "contributionForm"
  );


const memberSelect =
  document.getElementById(
    "member"
  );


const amountInput =
  document.getElementById(
    "amount"
  );


const dateInput =
  document.getElementById(
    "contributionDate"
  );


const typeSelect =
  document.getElementById(
    "contributionType"
  );


const methodSelect =
  document.getElementById(
    "paymentMethod"
  );


const mpesaReference =
  document.getElementById(
    "mpesaReference"
  );


const mpesaReferenceWrap =
  document.getElementById(
    "mpesaReferenceWrap"
  );


const saveButton =
  document.getElementById(
    "saveContribution"
  );


const monthlyExpected =
  document.getElementById(
    "monthlyExpected"
  );


const memberStatusRows =
  document.getElementById(
    "memberStatusRows"
  );


const contributionRows =
  document.getElementById(
    "contributionRows"
  );


/* =========================================================
   OPTIONAL EXISTING ELEMENTS
========================================================= */

const notesInput =
  document.getElementById(
    "notes"
  );


const goalSelect =
  document.getElementById(
    "goal"
  ) ||
  document.getElementById(
    "contributionGoal"
  );


/* =========================================================
   STATE
========================================================= */

let groupId =
  null;


let members =
  [];


let contributions =
  [];


let contributionGoals =
  [];


let monthlyContribution =
  0;


let initialized =
  false;


/* =========================================================
   CONSTANTS
========================================================= */

const PAYMENT_METHODS = {

  MPESA:
    "M-Pesa",

  CASH:
    "Cash",

  BANK:
    "Bank transfer"

};


/* =========================================================
   HELPERS
========================================================= */

function money(
  value
) {

  return new Intl.NumberFormat(
    "en-KE",
    {
      style:
        "currency",

      currency:
        "KES",

      minimumFractionDigits:
        0,

      maximumFractionDigits:
        2
    }
  ).format(
    Number(
      value || 0
    )
  );

}


function todayString() {

  const now =
    new Date();


  return [

    now.getFullYear(),

    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    ),

    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    )

  ].join(
    "-"
  );

}


function getCurrentMonth() {

  const now =
    new Date();


  return (
    `${now.getFullYear()}-` +
    `${String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    )}`
  );

}


function getContributionMonth(
  item
) {

  if (
    item?.contribution_date
  ) {

    return String(
      item.contribution_date
    ).slice(
      0,
      7
    );

  }


  if (
    item?.month
  ) {

    return String(
      item.month
    ).slice(
      0,
      7
    );

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
        ).padStart(
          2,
          "0"
        )}`
      );

    }

  }


  return "";

}


function formatDate(
  value
) {

  if (!value) {
    return "—";
  }


  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return String(
      value
    );

  }


  return date.toLocaleDateString(
    "en-KE",
    {
      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric"
    }
  );

}


function escapeHtml(
  value
) {

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

function showError(
  error
) {

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
      .from(
        "groups"
      )
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
    Number(
      data?.monthly_contribution ||
      0
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


  /*
   * Update group heading if the page
   * contains the global group-name hook.
   */

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
      .from(
        "members"
      )
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
          ascending:
            true
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


  if (
    !memberSelect
  ) {

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

  contributionGoals =
    [];


  /*
   * If this page has no goal selector,
   * there is nothing to populate.
   */

  if (
    !goalSelect
  ) {

    return;

  }


  const {
    data,
    error
  } =
    await supabase
      .from(
        "contribution_goals"
      )
      .select(
        `
          id,
          goal_name,
          category,
          target_amount,
          status,
          start_date,
          end_date
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
          ascending:
            false
        }
      );


  if (error) {

    throw error;

  }


  contributionGoals =
    data ||
    [];


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
      .from(
        "contributions"
      )
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
          ascending:
            false
        }
      )
      .order(
        "created_at",
        {
          ascending:
            false
        }
      );


  if (error) {

    throw error;

  }


  contributions =
    data ||
    [];

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
        String(
          item.id
        ) ===
        String(
          memberId
        )
    );


  return (
    member?.name ||
    "Unknown member"
  );

}


/* =========================================================
   GOAL NAME
========================================================= */

function getGoalName(
  goalId
) {

  if (!goalId) {

    return "General";

  }


  const goal =
    contributionGoals.find(
      item =>
        String(
          item.id
        ) ===
        String(
          goalId
        )
    );


  return (
    goal?.goal_name ||
    "Goal"
  );

}


/* =========================================================
   PAYMENT METHOD NORMALIZATION
========================================================= */

function normalizePaymentMethod(
  value
) {

  const method =
    String(
      value || ""
    )
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


  return (
    value ||
    "—"
  );

}


/* =========================================================
   CONTRIBUTION TYPE DISPLAY
========================================================= */

function contributionTypeLabel(
  item
) {

  const type =
    String(
      item?.contribution_type ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    type ===
    "monthly"
  ) {

    return "Monthly";

  }


  if (
    type ===
    "other"
  ) {

    return "Other";

  }


  if (
    type ===
    "welfare"
  ) {

    return "Welfare";

  }


  if (
    type ===
    "investment"
  ) {

    return "Investment";

  }


  if (
    type ===
    "fundraising"
  ) {

    return "Fundraising";

  }


  if (
    type ===
    "fine"
  ) {

    return "Fine";

  }


  if (
    type
  ) {

    return (
      type.charAt(0)
        .toUpperCase() +
      type.slice(1)
    );

  }


  return "—";

}


/* =========================================================
   OTHER CONTRIBUTION FIELD
========================================================= */

let otherTypeWrap =
  null;


let otherTypeInput =
  null;


/* =========================================================
   CREATE OTHER FIELD
========================================================= */

function createOtherContributionField() {

  if (
    otherTypeWrap
  ) {

    return;

  }


  if (
    !typeSelect
  ) {

    return;

  }


  otherTypeWrap =
    document.createElement(
      "div"
    );


  otherTypeWrap.id =
    "otherContributionTypeWrap";


  otherTypeWrap.className =
    "cl-other-type-wrap";


  otherTypeWrap.hidden =
    true;


  otherTypeWrap.innerHTML = `

    <label
      for="otherContributionType"
    >
      Specify contribution type
      <span class="cl-required">
        *
      </span>
    </label>

    <input
      id="otherContributionType"
      name="otherContributionType"
      type="text"
      maxlength="120"
      autocomplete="off"
      placeholder="e.g. Welfare support, special collection, fine..."
    >

    <span class="cl-field-help">
      Tell us what this contribution is for.
    </span>

  `;


  otherTypeInput =
    otherTypeWrap.querySelector(
      "#otherContributionType"
    );


  /*
   * Insert immediately after the
   * contribution type field's wrapper.
   */

  const parent =
    typeSelect.parentElement;


  if (
    parent?.parentElement
  ) {

    parent.parentElement
      .insertBefore(
        otherTypeWrap,
        parent.nextSibling
      );

  }
  else {

    typeSelect
      .parentElement
      ?.appendChild(
        otherTypeWrap
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
      typeSelect.value ||
      ""
    )
      .trim()
      .toLowerCase() ===
    "other";


  otherTypeWrap.hidden =
    !isOther;


  otherTypeInput.required =
    isOther;


  if (
    isOther
  ) {

    otherTypeWrap
      .classList
      .add(
        "is-visible"
      );

  }
  else {

    otherTypeWrap
      .classList
      .remove(
        "is-visible"
      );


    otherTypeInput.value =
      "";

  }

}


/* =========================================================
   BUILD SAVED NOTES
========================================================= */

function buildContributionNotes(
  contributionType,
  otherDetails,
  normalNotes
) {

  const notes =
    String(
      normalNotes ||
      ""
    )
      .trim();


  if (
    String(
      contributionType ||
      ""
    ).toLowerCase() !==
    "other"
  ) {

    return notes ||
      null;

  }


  const details =
    String(
      otherDetails ||
      ""
    )
      .trim();


  if (
    !details
  ) {

    return notes ||
      null;

  }


  const otherLine =
    `Other contribution: ${details}`;


  if (
    !notes
  ) {

    return otherLine;

  }


  return (
    `${otherLine}\n${notes}`
  );

}


/* =========================================================
   EXTRACT OTHER DETAILS
========================================================= */

function extractOtherDetails(
  item
) {

  const type =
    String(
      item?.contribution_type ||
      ""
    )
      .toLowerCase();


  if (
    type !==
    "other"
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


  if (
    match?.[1]
  ) {

    return match[1]
      .trim();

  }


  return "";

}


/* =========================================================
   UPDATE PAYMENT METHOD
========================================================= */

function updatePaymentMethod() {

  if (
    !methodSelect
  ) {

    return;

  }


  const method =
    normalizePaymentMethod(
      methodSelect.value
    );


  const isMpesa =
    method ===
    PAYMENT_METHODS.MPESA;


  if (
    mpesaReferenceWrap
  ) {

    mpesaReferenceWrap.style.display =
      isMpesa
        ? ""
        : "none";

  }


  if (
    mpesaReference
  ) {

    mpesaReference.required =
      isMpesa;


    if (
      !isMpesa
    ) {

      mpesaReference.value =
        "";

    }

  }

}


/* =========================================================
   LEDGER
========================================================= */

function renderLedger() {

  if (
    !contributionRows
  ) {

    return;

  }


  if (
    !contributions.length
  ) {

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
      .slice(
        0,
        100
      )
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
                  formatDate(
                    date
                  )
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
                    money(
                      item.amount
                    )
                  )}
                </strong>

              </td>


              <td data-label="Type">

                <span
                  class="cl-type-badge"
                >

                  ${escapeHtml(
                    type
                  )}

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


              <td data-label="Payment">

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

  if (
    !memberStatusRows
  ) {

    return;

  }


  if (
    !members.length
  ) {

    memberStatusRows.innerHTML = `

      <tr>

        <td
          colspan="5"
          class="cl-empty-table"
        >

          No active members found.

        </td>

      </tr>

    `;

    return;

  }


  const currentMonth =
    getCurrentMonth();


  memberStatusRows.innerHTML =
    members
      .map(
        member => {

          /*
           * Only MONTHLY contributions
           * count toward monthly status.
           */

          const paid =
            contributions
              .filter(
                item => {

                  if (
                    String(
                      item.member_id
                    ) !==
                    String(
                      member.id
                    )
                  ) {

                    return false;

                  }


                  const type =
                    String(
                      item.contribution_type ||
                      ""
                    )
                      .toLowerCase();


                  if (
                    type !==
                    "monthly"
                  ) {

                    return false;

                  }


                  return (
                    getContributionMonth(
                      item
                    ) ===
                    currentMonth
                  );

                }
              )
              .reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  Number(
                    item.amount ||
                    0
                  ),
                0
              );


          const expected =
            monthlyContribution;


          const outstanding =
            Math.max(
              expected -
              paid,
              0
            );


          let status =
            "OUTSTANDING";


          let statusClass =
            "cl-status-outstanding";


          if (
            expected <= 0
          ) {

            status =
              "NOT SET";

            statusClass =
              "cl-status-neutral";

          }
          else if (
            paid >
            expected
          ) {

            status =
              "OVERPAID";

            statusClass =
              "cl-status-credit";

          }
          else if (
            paid ===
            expected
          ) {

            status =
              "PAID";

            statusClass =
              "cl-status-paid";

          }
          else if (
            paid >
            0
          ) {

            status =
              "PARTIAL";

            statusClass =
              "cl-status-partial";

          }


          const progress =
            expected > 0
              ? Math.min(
                  (
                    paid /
                    expected
                  ) *
                  100,
                  100
                )
              : 0;


          return `

            <tr>

              <td
                data-label="Member"
              >

                <strong>
                  ${escapeHtml(
                    member.name
                  )}
                </strong>

              </td>


              <td
                data-label="Expected"
              >

                ${escapeHtml(
                  money(
                    expected
                  )
                )}

              </td>


              <td
                data-label="Paid"
              >

                <div
                  class="cl-paid-cell"
                >

                  <strong>
                    ${escapeHtml(
                      money(
                        paid
                      )
                    )}
                  </strong>

                  <div
                    class="cl-mini-progress"
                  >

                    <span
                      style="
                        width:${progress}%;
                      "
                    ></span>

                  </div>

                </div>

              </td>


              <td
                data-label="Outstanding"
              >

                ${escapeHtml(
                  money(
                    outstanding
                  )
                )}

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
   SUMMARY CARDS
========================================================= */

function renderSummary() {

  const container =
    document.getElementById(
      "contributionSummary"
    );


  if (
    !container
  ) {

    return;

  }


  const total =
    contributions.reduce(
      (
        sum,
        item
      ) =>
        sum +
        Number(
          item.amount ||
          0
        ),
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
          getContributionMonth(
            item
          ) ===
          currentMonth
      )
      .reduce(
        (
          sum,
          item
        ) =>
          sum +
          Number(
            item.amount ||
            0
          ),
        0
      );


  const outstandingMembers =
    members.filter(
      member => {

        const paid =
          contributions
            .filter(
              item =>
                String(
                  item.member_id
                ) ===
                  String(
                    member.id
                  ) &&
                String(
                  item.contribution_type ||
                  ""
                ).toLowerCase() ===
                  "monthly" &&
                getContributionMonth(
                  item
                ) ===
                  currentMonth
            )
            .reduce(
              (
                sum,
                item
              ) =>
                sum +
                Number(
                  item.amount ||
                  0
                ),
              0
            );


        return (
          monthlyContribution >
          0 &&
          paid <
          monthlyContribution
        );

      }
    )
    .length;


  container.innerHTML = `

    <div class="cl-contribution-summary-card">

      <span>
        TOTAL RECORDED
      </span>

      <strong>
        ${escapeHtml(
          money(
            total
          )
        )}
      </strong>

      <small>
        All contribution records
      </small>

    </div>


    <div class="cl-contribution-summary-card">

      <span>
        THIS MONTH
      </span>

      <strong>
        ${escapeHtml(
          money(
            monthlyTotal
          )
        )}
      </strong>

      <small>
        Monthly contributions
      </small>

    </div>


    <div class="cl-contribution-summary-card">

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


    <div class="cl-contribution-summary-card">

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
        Members below monthly target
      </small>

    </div>

  `;

}


/* =========================================================
   RECORD CONTRIBUTION
========================================================= */

async function recordContribution(
  event
) {

  event.preventDefault();


  clearError();


  const memberId =
    memberSelect?.value ||
    "";


  const amount =
    Number(
      amountInput?.value ||
      0
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
      .trim() ||
    "";


  const paymentMethod =
    normalizePaymentMethod(
      methodSelect?.value
    );


  const reference =
    mpesaReference?.value
      .trim() ||
    "";


  const normalNotes =
    notesInput?.value
      .trim() ||
    "";


  const goalId =
    goalSelect?.value ||
    null;


  /* =====================================================
     VALIDATION
  ==================================================== */

  if (
    !memberId
  ) {

    showError(
      new Error(
        "Please select a member."
      )
    );

    return;

  }


  if (
    !amount ||
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


  if (
    !contributionDate
  ) {

    showError(
      new Error(
        "Please select the contribution date."
      )
    );

    dateInput?.focus();

    return;

  }


  if (
    !contributionType
  ) {

    showError(
      new Error(
        "Please select the contribution type."
      )
    );

    typeSelect?.focus();

    return;

  }


  /* =====================================================
     OTHER TYPE VALIDATION
  ==================================================== */

  if (
    contributionType ===
    "other" &&
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


  if (
    !paymentMethod
  ) {

    showError(
      new Error(
        "Please select the payment method."
      )
    );

    return;

  }


  /* =====================================================
     M-PESA VALIDATION
  ==================================================== */

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


  /* =====================================================
     MONTH
  ==================================================== */

  const month =
    contributionDate.slice(
      0,
      7
    );


  /* =====================================================
     DUPLICATE MONTHLY PAYMENT WARNING
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
            String(
              memberId
            ) &&

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


    if (
      existing
    ) {

      const proceed =
        window.confirm(

          `This member already has a monthly contribution for ${month}.\n\n` +

          `You can still record another payment. ` +

          `If the total exceeds the monthly amount, ` +

          `the member will be marked OVERPAID.\n\n` +

          `Continue?`

        );


      if (
        !proceed
      ) {

        return;

      }

    }

  }


  /* =====================================================
     BUILD NOTES
  ==================================================== */

  const finalNotes =
    buildContributionNotes(
      contributionType,
      otherDetails,
      normalNotes
    );


  /* =====================================================
     BUTTON STATE
  ==================================================== */

  if (
    saveButton
  ) {

    saveButton.disabled =
      true;

    saveButton.textContent =
      "Saving...";

  }


  if (
    statusEl
  ) {

    statusEl.textContent =
      "Recording contribution...";

  }


  try {

    /* ===================================================
       INSERT
    ================================================== */

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
        .from(
          "contributions"
        )
        .insert(
          contributionData
        );


    if (
      error
    ) {

      throw error;

    }


    /* ===================================================
       RELOAD
    ================================================== */

    await loadContributions();


    renderLedger();

    renderMemberStatus();

    renderSummary();


    /* ===================================================
       RESET FORM
    ================================================== */

    form?.reset();


    if (
      dateInput
    ) {

      dateInput.value =
        todayString();

    }


    if (
      typeSelect
    ) {

      typeSelect.value =
        "monthly";

    }


    if (
      methodSelect
    ) {

      methodSelect.value =
        PAYMENT_METHODS.MPESA;

    }


    if (
      goalSelect
    ) {

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


    if (
      statusEl
    ) {

      statusEl.textContent =
        "✓ Contribution recorded successfully.";

    }


    /*
     * Brief success animation.
     */

    if (
      form
    ) {

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

  catch (
    error
  ) {

    showError(
      error
    );

  }

  finally {

    if (
      saveButton
    ) {

      saveButton.disabled =
        false;

      saveButton.textContent =
        "Record Contribution";

    }

  }

}


/* =========================================================
   VISUAL ENHANCEMENT
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
       CHAMA LIVE CONTRIBUTIONS VISUAL SYSTEM
    ====================================================== */

    :root {

      --cl-green-950:
        #063f3a;

      --cl-green-900:
        #115e59;

      --cl-green-800:
        #0f766e;

      --cl-green-700:
        #0d9488;

      --cl-green-500:
        #14b8a6;

      --cl-green-100:
        #ccfbf1;

      --cl-green-50:
        #f0fdfa;

      --cl-ink:
        #0f172a;

      --cl-text:
        #334155;

      --cl-muted:
        #64748b;

      --cl-border:
        #e2e8f0;

      --cl-card:
        #ffffff;

      --cl-page:
        #f4f8f7;

      --cl-success:
        #047857;

      --cl-success-bg:
        #ecfdf5;

      --cl-warning:
        #b45309;

      --cl-warning-bg:
        #fffbeb;

      --cl-danger:
        #be123c;

      --cl-danger-bg:
        #fff1f2;

      --cl-shadow:
        0 18px 50px
        rgba(
          15,
          118,
          110,
          .08
        );

    }


    /* =====================================================
       PAGE BACKGROUND
    ====================================================== */

    body {

      background:

        radial-gradient(
          circle at 5% 5%,
          rgba(
            20,
            184,
            166,
            .08
          ),
          transparent 25%
        ),

        radial-gradient(
          circle at 95% 10%,
          rgba(
            15,
            118,
            110,
            .07
          ),
          transparent 25%
        ),

        linear-gradient(
          145deg,
          #f0fdfa 0%,
          #f8fafc 45%,
          #f0fdf9 100%
        );

    }


    /* =====================================================
       MAIN CONTENT
    ====================================================== */

    .main {

      position:
        relative;

    }


    /* =====================================================
       CONTRIBUTION HEADER
    ====================================================== */

    .contribution-page-header {

      position:
        relative;

      overflow:
        hidden;

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
          var(--cl-green-900),
          var(--cl-green-800) 55%,
          var(--cl-green-700)
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


    .contribution-page-header
    .eyebrow {

      color:
        #99f6e4;

      font-weight:
        800;

      letter-spacing:
        1.4px;

    }


    .contribution-page-header
    h1 {

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


    .contribution-page-header
    p {

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

      margin-bottom:
        20px;

    }


    .cl-contribution-summary-card {

      position:
        relative;

      overflow:
        hidden;

      padding:
        19px;

      border:
        1px solid
        rgba(
          226,
          232,
          240,
          .9
        );

      border-radius:
        17px;

      background:
        rgba(
          255,
          255,
          255,
          .92
        );

      box-shadow:
        var(--cl-shadow);

    }


    .cl-contribution-summary-card::before {

      content:
        "";

      position:
        absolute;

      left:
        0;

      top:
        0;

      width:
        4px;

      height:
        100%;

      background:
        linear-gradient(
          to bottom,
          var(--cl-green-500),
          var(--cl-green-800)
        );

    }


    .cl-contribution-summary-card
    span {

      display:
        block;

      color:
        var(--cl-muted);

      font-size:
        10px;

      font-weight:
        850;

      letter-spacing:
        1px;

    }


    .cl-contribution-summary-card
    strong {

      display:
        block;

      margin:
        7px 0 3px;

      color:
        var(--cl-ink);

      font-size:
        24px;

      letter-spacing:
        -.5px;

    }


    .cl-contribution-summary-card
    small {

      color:
        var(--cl-muted);

      font-size:
        11px;

    }


    /* =====================================================
       CARDS
    ====================================================== */

    .card {

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
        var(--cl-shadow) !important;

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

      position:
        relative;

    }


    #contributionForm
    .form-group {

      margin-bottom:
        2px;

    }


    #contributionForm
    label {

      color:
        var(--cl-ink);

      font-size:
        12px;

      font-weight:
        750;

    }


    #contributionForm
    input,
    #contributionForm
    select,
    #contributionForm
    textarea {

      width:
        100%;

      min-height:
        47px;

      border:
        1px solid
        var(--cl-border);

      border-radius:
        11px;

      background:
        #ffffff;

      color:
        var(--cl-ink);

      transition:
        border-color .18s ease,
        box-shadow .18s ease,
        transform .18s ease;

    }


    #contributionForm
    textarea {

      min-height:
        95px;

    }


    #contributionForm
    input:focus,
    #contributionForm
    select:focus,
    #contributionForm
    textarea:focus {

      outline:
        none;

      border-color:
        var(--cl-green-500);

      box-shadow:
        0 0 0 4px
        rgba(
          20,
          184,
          166,
          .10
        );

    }


    #contributionForm
    input:hover,
    #contributionForm
    select:hover,
    #contributionForm
    textarea:hover {

      border-color:
        #a7f3d0;

    }


    /* =====================================================
       OTHER TYPE
    ====================================================== */

    .cl-other-type-wrap {

      margin:
        10px 0 4px;

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

      animation:
        clOtherReveal .2s ease;

    }


    .cl-other-type-wrap[hidden] {

      display:
        none;

    }


    .cl-other-type-wrap
    label {

      display:
        block;

      margin-bottom:
        7px;

    }


    .cl-other-type-wrap
    input {

      min-height:
        48px;

    }


    .cl-field-help {

      display:
        block;

      margin-top:
        6px;

      color:
        var(--cl-muted);

      font-size:
        11px;

    }


    .cl-required {

      color:
        var(--cl-danger);

    }


    @keyframes clOtherReveal {

      from {

        opacity:
          0;

        transform:
          translateY(
            -4px
          );

      }

      to {

        opacity:
          1;

        transform:
          translateY(
            0
          );

      }

    }


    /* =====================================================
       BUTTON
    ====================================================== */

    #saveContribution {

      min-height:
        51px;

      border:
        0 !important;

      border-radius:
        12px !important;

      background:
        linear-gradient(
          135deg,
          var(--cl-green-800),
          var(--cl-green-500)
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

      transition:
        transform .18s ease,
        box-shadow .18s ease,
        opacity .18s ease;

    }


    #saveContribution:hover {

      transform:
        translateY(
          -1px
        );

      box-shadow:
        0 16px 30px
        rgba(
          15,
          118,
          110,
          .23
        );

    }


    #saveContribution:disabled {

      opacity:
        .65;

      transform:
        none;

      box-shadow:
        none;

    }


    /* =====================================================
       TABLE WRAPPER
    ====================================================== */

    .table-wrap {

      border-radius:
        14px;

      overflow-x:
        auto;

      -webkit-overflow-scrolling:
        touch;

    }


    .table {

      width:
        100%;

      border-collapse:
        separate;

      border-spacing:
        0;

    }


    .table th {

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


    .table td {

      color:
        var(--cl-text);

      font-size:
        12px;

      vertical-align:
        middle;

    }


    .table tbody tr {

      transition:
        background .15s ease;

    }


    .table tbody tr:hover {

      background:
        #f8fffd;

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

      width:
        fit-content;

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
        var(--cl-green-800);

      background:
        var(--cl-green-50);

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
        var(--cl-success);

      background:
        var(--cl-success-bg);

    }


    .cl-status-credit {

      color:
        var(--cl-green-800);

      background:
        var(--cl-green-100);

    }


    .cl-status-partial {

      color:
        var(--cl-warning);

      background:
        var(--cl-warning-bg);

    }


    .cl-status-outstanding {

      color:
        var(--cl-danger);

      background:
        var(--cl-danger-bg);

    }


    .cl-status-neutral {

      color:
        #475569;

      background:
        #f1f5f9;

    }


    .cl-sub-detail {

      display:
        block;

      margin-top:
        4px;

      max-width:
        180px;

      color:
        var(--cl-muted);

      font-size:
        10px;

      line-height:
        1.4;

    }


    .cl-note-text {

      display:
        block;

      max-width:
        190px;

      color:
        var(--cl-muted);

      font-size:
        10px;

      line-height:
        1.45;

      white-space:
        normal;

    }


    .cl-money-cell {

      color:
        var(--cl-green-900) !important;

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
          var(--cl-green-800),
          var(--cl-green-500)
        );

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

      width:
        44px;

      height:
        44px;

      display:
        grid;

      place-items:
        center;

      margin-bottom:
        10px;

      border-radius:
        14px;

      background:
        var(--cl-green-50);

      color:
        var(--cl-green-800);

      font-size:
        25px;

      font-weight:
        800;

    }


    .cl-empty-state strong {

      color:
        var(--cl-ink);

      font-size:
        13px;

    }


    .cl-empty-state span {

      max-width:
        300px;

      margin-top:
        4px;

      color:
        var(--cl-muted);

      font-size:
        11px;

    }


    /* =====================================================
       STATUS MESSAGE
    ====================================================== */

    #status {

      color:
        var(--cl-green-800);

      font-size:
        12px;

      font-weight:
        650;

    }


    #error {

      border:
        1px solid
        #fecdd3 !important;

      border-radius:
        12px !important;

      background:
        #fff1f2 !important;

      color:
        var(--cl-danger) !important;

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
       MOBILE
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


    @media (
      max-width: 650px
    ) {

      .contribution-page-header {

        padding:
          21px 18px;

        border-radius:
          17px;

      }


      .contribution-page-header
      h1 {

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


      .cl-contribution-summary-card
      strong {

        font-size:
          19px;

      }


      /*
       * Convert tables into readable
       * mobile cards when possible.
       */

      .table-wrap {

        overflow:
          visible;

      }


      .table {

        display:
          block;

      }


      .table thead {

        display:
          none;

      }


      .table tbody {

        display:
          grid;

        gap:
          10px;

      }


      .table tr {

        display:
          grid;

        grid-template-columns:
          1fr 1fr;

        gap:
          0;

        padding:
          9px 11px;

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


      .table td {

        display:
          flex;

        flex-direction:
          column;

        align-items:
          flex-start;

        gap:
          3px;

        min-width:
          0;

        padding:
          8px 7px;

        border:
          0 !important;

      }


      .table td::before {

        content:
          attr(data-label);

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


      .table td:first-child {

        padding-top:
          5px;

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

    }


    @media (
      max-width: 390px
    ) {

      #contributionSummary {

        grid-template-columns:
          1fr 1fr;

      }


      .cl-contribution-summary-card
      small {

        display:
          none;

      }


      .table tr {

        grid-template-columns:
          1fr;

      }


      .table td {

        padding:
          7px;

      }

    }


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
   ENHANCE PAGE HEADER
========================================================= */

function enhancePageHeader() {

  /*
   * Don't duplicate.
   */

  if (
    document.getElementById(
      "contributionPageHeader"
    )
  ) {

    return;

  }


  const main =
    document.querySelector(
      ".main"
    );


  if (
    !main
  ) {

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


  /*
   * Put the header before existing status.
   */

  main.insertBefore(
    header,
    firstElement
  );


  /*
   * Add summary container after header.
   */

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
   ENHANCE SECTION HEADINGS
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


        const parent =
          heading.parentElement;


        if (
          parent
        ) {

          parent.classList.add(
            "cl-enhanced-section-heading"
          );

        }

      }
    );

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initContributions() {

  if (
    initialized
  ) {

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


    if (
      statusEl
    ) {

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
       DEFAULT DATE
    ==================================================== */

    if (
      dateInput
    ) {

      dateInput.value =
        todayString();

    }


    /* =====================================================
       DEFAULT TYPE
    ==================================================== */

    if (
      typeSelect
    ) {

      typeSelect.value =
        "monthly";

    }


    /* =====================================================
       DEFAULT PAYMENT
    ==================================================== */

    if (
      methodSelect
    ) {

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


    if (
      statusEl
    ) {

      statusEl.textContent =
        "Contributions loaded.";

    }


    console.log(
      "CHAMA LIVE: Contributions ready."
    );

  }

  catch (
    error
  ) {

    initialized =
      false;

    showError(
      error
    );

  }

}


/* =========================================================
   EVENTS
========================================================= */

if (
  form &&
  !form.dataset
    .clContributionBound
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
  !methodSelect.dataset
    .clPaymentBound
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
  !typeSelect.dataset
    .clTypeBound
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
   ---------------------------------------------------------
   If contributions.js is loaded directly from HTML,
   initialize it automatically.

   If layout.js dynamically imports it and calls
   initContributions(), this prevents duplicate loading.
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      /*
       * Only auto-start when layout.js
       * is not responsible for initialization.
       */

      if (
        !window.__CHAMA_LIVE_LAYOUT_LOADING__
      ) {

        initContributions();

      }

    },
    {
      once:
        true
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
