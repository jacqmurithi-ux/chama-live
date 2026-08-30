/* =========================================================
   CHAMA LIVE — CONTRIBUTIONS
   COMPLETE UPDATED VERSION

   Features
   ---------------------------------------------------------
   1. Recurring monthly contributions
   2. Outstanding balances carried forward
   3. Oldest arrears paid first
   4. Extra payments become credit
   5. Credit automatically offsets future obligations
   6. Contribution goals
   7. Goal amount progress
   8. Goal member participation progress
   9. Unique contributing-member count
  10. Live Supabase data
  11. Group-scoped contribution types
  12. Custom "Other" contribution categories
  13. Custom categories persist in Supabase
  14. members.name used for member display
  15. contributions.recorded_by = members.id
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
let contributionGoals = [];
let contributionTypes = [];

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

const otherTypeWrap =
  byId("otherContributionTypeWrap");

const otherTypeInput =
  byId("otherContributionType");

const methodSelect =
  byId("paymentMethod");

const mpesaReference =
  byId("mpesaReference");

const mpesaReferenceWrap =
  byId("mpesaReferenceWrap");

const goalSelect =
  byId("goal");

const notesInput =
  byId("notes");

const saveButton =
  byId("saveContribution");

const monthlyExpected =
  byId("monthlyExpected");

const memberStatusRows =
  byId("memberStatusRows");

const contributionRows =
  byId("contributionRows");

const goalProgressContainer =
  byId("goalProgressContainer");


/* =========================================================
   DEFAULT CONTRIBUTION TYPES
========================================================= */

const DEFAULT_CONTRIBUTION_TYPES = [
  "Monthly",
  "Registration",
  "Welfare",
  "Special"
];


/* =========================================================
   MONEY
========================================================= */

function money(value) {

  return (
    "KSh " +
    Number(
      value || 0
    ).toLocaleString(
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

  return todayString()
    .slice(0, 7);

}


/* =========================================================
   ESCAPE HTML
========================================================= */

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

  const message =
    error?.message ||
    String(error) ||
    "Something went wrong.";

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
   NORMALIZE TYPE NAME
========================================================= */

function normalizeTypeName(value) {

  return String(
    value || ""
  )
    .trim()
    .replace(/\s+/g, " ");

}


/* =========================================================
   COMPARE TYPE NAMES
========================================================= */

function sameTypeName(
  first,
  second
) {

  return normalizeTypeName(first)
    .toLowerCase() ===
    normalizeTypeName(second)
      .toLowerCase();

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


    /* -----------------------------------------------------
       AUTH
    ----------------------------------------------------- */

    currentUser =
      await requireAuth();


    /* -----------------------------------------------------
       MEMBER
    ----------------------------------------------------- */

    currentMember =
      await getMyMember();


    if (!currentMember?.group_id) {

      throw new Error(
        "Your account is not linked to a group."
      );

    }


    groupId =
      currentMember.group_id;


    /* -----------------------------------------------------
       GROUP
    ----------------------------------------------------- */

    currentGroup =
      await getMyGroup();


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

    await loadContributionGoals();

    await loadContributionTypes();


    /* -----------------------------------------------------
       RENDER
    ----------------------------------------------------- */

    renderMonthlyExpected();

    renderGoalSelect();

    renderContributionTypeSelect();

    renderOtherContributionType();

    renderMonthlyStatus();

    renderGoalProgress();

    renderLedger();


    /* -----------------------------------------------------
       EVENTS
    ----------------------------------------------------- */

    bindEvents();


    showStatus("");


    console.log(
      "CHAMA LIVE: contributions initialized",
      {
        userId:
          currentUser?.id,

        memberId:
          currentMember?.id,

        groupId:
          groupId,

        contributionTypes:
          contributionTypes.length
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
        join_date,
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
   ACTIVE MEMBERS
========================================================= */

function getActiveMembers() {

  return members.filter(
    member =>
      String(
        member.status || "active"
      ).toLowerCase() ===
      "active"
  );

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


      option.textContent =
        `${
          member.member_number ||
          member.membership_number ||
          ""
        } — ${member.name}`;


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
   LOAD CONTRIBUTION GOALS
========================================================= */

async function loadContributionGoals() {

  const {
    data,
    error
  } =
    await supabase
      .from("contribution_goals")
      .select(`
        id,
        group_id,
        goal_name,
        category,
        description,
        frequency,
        start_date,
        end_date,
        expected_amount_per_member,
        target_amount,
        status,
        created_by,
        created_at,
        updated_at
      `)
      .eq(
        "group_id",
        groupId
      )
      .in(
        "status",
        [
          "active"
        ]
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

}


/* =========================================================
   LOAD CONTRIBUTION TYPES
========================================================= */

async function loadContributionTypes() {

  const {
    data,
    error
  } =
    await supabase
      .from("contribution_types")
      .select(`
        id,
        group_id,
        name,
        created_by,
        created_at
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


  contributionTypes =
    data || [];


  /*
   * Make sure older groups also have
   * the standard categories.
   */

  for (
    const defaultType
    of DEFAULT_CONTRIBUTION_TYPES
  ) {

    const exists =
      contributionTypes.some(
        type =>
          sameTypeName(
            type.name,
            defaultType
          )
      );


    if (!exists) {

      try {

        const created =
          await createContributionType(
            defaultType
          );


        if (created) {

          contributionTypes.push(
            created
          );

        }

      }
      catch (createError) {

        console.warn(
          "CHAMA LIVE: could not create default type",
          defaultType,
          createError
        );

      }

    }

  }


  contributionTypes =
    contributionTypes.sort(
      (a, b) =>
        String(
          a.name || ""
        ).localeCompare(
          String(
            b.name || ""
          )
        )
    );

}


/* =========================================================
   CREATE CONTRIBUTION TYPE
========================================================= */

async function createContributionType(
  name
) {

  const cleanedName =
    normalizeTypeName(name);


  if (!cleanedName) {

    throw new Error(
      "Contribution type name cannot be empty."
    );

  }


  /*
   * Prevent duplicate category names
   * within the same group.
   */

  const existing =
    contributionTypes.find(
      type =>
        sameTypeName(
          type.name,
          cleanedName
        )
    );


  if (existing) {

    return existing;

  }


  const {
    data,
    error
  } =
    await supabase
      .from("contribution_types")
      .insert({
        group_id:
          groupId,

        name:
          cleanedName,

        created_by:
          currentMember.id
      })
      .select(`
        id,
        group_id,
        name,
        created_by,
        created_at
      `)
      .single();


  if (!error) {

    return data;

  }


  /*
   * If another group member created
   * the same category at almost the
   * same time, retrieve it.
   */

  const {
    data: existingData,
    error: existingError
  } =
    await supabase
      .from("contribution_types")
      .select(`
        id,
        group_id,
        name,
        created_by,
        created_at
      `)
      .eq(
        "group_id",
        groupId
      )
      .ilike(
        "name",
        cleanedName
      )
      .limit(1)
      .maybeSingle();


  if (
    !existingError &&
    existingData
  ) {

    return existingData;

  }


  throw error;

}


/* =========================================================
   RENDER CONTRIBUTION TYPE SELECT
========================================================= */

function renderContributionTypeSelect() {

  if (!typeSelect) {
    return;
  }


  const currentValue =
    typeSelect.value;


  typeSelect.innerHTML =
    `
      <option value="">
        Select contribution type
      </option>
    `;


  contributionTypes.forEach(
    type => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        type.name;


      option.textContent =
        type.name;


      typeSelect.appendChild(
        option
      );

    }
  );


  const otherOption =
    document.createElement(
      "option"
    );


  otherOption.value =
    "__OTHER__";


  otherOption.textContent =
    "Other";


  typeSelect.appendChild(
    otherOption
  );


  if (
    currentValue &&
    Array.from(
      typeSelect.options
    ).some(
      option =>
        option.value ===
        currentValue
    )
  ) {

    typeSelect.value =
      currentValue;

  }

}


/* =========================================================
   RENDER OTHER CONTRIBUTION TYPE
========================================================= */

function renderOtherContributionType() {

  if (!typeSelect) {
    return;
  }


  const isOther =
    typeSelect.value ===
    "__OTHER__";


  if (otherTypeWrap) {

    otherTypeWrap.hidden =
      !isOther;

  }


  if (otherTypeInput) {

    otherTypeInput.required =
      isOther;


    if (!isOther) {

      otherTypeInput.value =
        "";

    }

  }

}


/* =========================================================
   GET SELECTED CONTRIBUTION TYPE
========================================================= */

async function getSelectedContributionType() {

  const selected =
    normalizeTypeName(
      typeSelect?.value
    );


  if (!selected) {

    throw new Error(
      "Please select a contribution type."
    );

  }


  /*
   * Normal existing category.
   */

  if (
    selected !==
    "__OTHER__"
  ) {

    return selected;

  }


  /*
   * User selected Other.
   */

  const customName =
    normalizeTypeName(
      otherTypeInput?.value
    );


  if (!customName) {

    throw new Error(
      "Please enter the other contribution type."
    );

  }


  /*
   * Check if this category
   * already exists.
   */

  const existing =
    contributionTypes.find(
      type =>
        sameTypeName(
          type.name,
          customName
        )
    );


  if (existing) {

    return existing.name;

  }


  /*
   * Persist category to Supabase.
   */

  showStatus(
    "Saving new contribution category..."
  );


  const newType =
    await createContributionType(
      customName
    );


  /*
   * Add to local state.
   */

  contributionTypes.push(
    newType
  );


  contributionTypes =
    contributionTypes.sort(
      (a, b) =>
        String(
          a.name || ""
        ).localeCompare(
          String(
            b.name || ""
          )
        )
    );


  /*
   * Re-render dropdown.
   */

  renderContributionTypeSelect();


  /*
   * Select the newly created
   * category.
   */

  if (typeSelect) {

    typeSelect.value =
      newType.name;

  }


  renderOtherContributionType();


  return newType.name;

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
   RENDER MONTHLY EXPECTED
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
   RENDER GOAL SELECT
========================================================= */

function renderGoalSelect() {

  if (!goalSelect) {
    return;
  }


  goalSelect.innerHTML =
    `
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
        goal.goal_name;


      goalSelect.appendChild(
        option
      );

    }
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
   MONTH DIFFERENCE
========================================================= */

function monthDifference(
  startMonth,
  endMonth
) {

  const start =
    new Date(
      `${startMonth}-01T00:00:00`
    );

  const end =
    new Date(
      `${endMonth}-01T00:00:00`
    );


  if (
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    )
  ) {

    return 0;

  }


  return (
    (
      end.getFullYear() -
      start.getFullYear()
    ) * 12
  ) +
  (
    end.getMonth() -
    start.getMonth()
  );

}


/* =========================================================
   GET MEMBER START MONTH
========================================================= */

function getMemberStartMonth(
  member
) {

  const rawDate =
    member.join_date ||
    member.created_at ||
    todayString();


  return String(
    rawDate
  ).slice(0, 7);

}


/* =========================================================
   GET MEMBER MONTHLY POSITION
========================================================= */

function getMemberMonthlyPosition(
  member
) {

  const expected =
    getMonthlyContribution();


  if (expected <= 0) {

    return {

      previousOutstanding: 0,

      currentDue: 0,

      currentPaid: 0,

      carryForward: 0,

      currentOutstanding: 0,

      status: "—",

      totalPaid: 0,

      totalDue: 0,

      monthsDue: 0

    };

  }


  const currentMonthValue =
    currentMonth();


  const joinMonth =
    getMemberStartMonth(
      member
    );


  /*
   * Member hasn't joined yet.
   */

  if (
    joinMonth >
    currentMonthValue
  ) {

    return {

      previousOutstanding: 0,

      currentDue: 0,

      currentPaid: 0,

      carryForward: 0,

      currentOutstanding: 0,

      status: "—",

      totalPaid: 0,

      totalDue: 0,

      monthsDue: 0

    };

  }


  /*
   * Number of recurring monthly
   * obligations including current month.
   */

  const monthsDue =
    monthDifference(
      joinMonth,
      currentMonthValue
    ) + 1;


  const totalDue =
    monthsDue *
    expected;


  /*
   * IMPORTANT:
   *
   * Monthly accounting only counts
   * the Monthly category.
   *
   * Custom categories and goal
   * contributions do NOT reduce
   * monthly arrears.
   */

  const totalPaid =
    contributions
      .filter(
        contribution =>
          contribution.member_id ===
            member.id &&
          String(
            contribution.contribution_type ||
            ""
          ).toLowerCase() ===
            "monthly"
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


  /*
   * Amount required for all
   * months before current month.
   */

  const previousDue =
    Math.max(
      monthsDue - 1,
      0
    ) *
    expected;


  /*
   * Payment applied against
   * previous months.
   */

  const previousPaid =
    Math.min(
      totalPaid,
      previousDue
    );


  /*
   * Remaining arrears from
   * previous months.
   */

  const previousOutstanding =
    Math.max(
      previousDue -
      previousPaid,
      0
    );


  /*
   * Payment remaining after
   * previous arrears.
   */

  const amountAfterPrevious =
    Math.max(
      totalPaid -
      previousDue,
      0
    );


  /*
   * Amount allocated to current
   * month's obligation.
   */

  const currentPaid =
    Math.min(
      amountAfterPrevious,
      expected
    );


  /*
   * Extra amount becomes credit.
   */

  const carryForward =
    Math.max(
      amountAfterPrevious -
      expected,
      0
    );


  /*
   * Current month outstanding.
   */

  const currentOutstanding =
    Math.max(
      expected -
      currentPaid,
      0
    );


  let status =
    "Outstanding";


  if (
    carryForward > 0
  ) {

    status =
      "Credit";

  }

  else if (
    currentPaid >= expected
  ) {

    status =
      "Paid";

  }

  else if (
    currentPaid > 0
  ) {

    status =
      "Partial";

  }

  else if (
    previousOutstanding > 0
  ) {

    status =
      "Outstanding";

  }


  return {

    previousOutstanding,

    currentDue:
      expected,

    currentPaid,

    carryForward,

    currentOutstanding,

    status,

    totalPaid,

    totalDue,

    monthsDue

  };

}


/* =========================================================
   RENDER MONTHLY STATUS
========================================================= */

function renderMonthlyStatus() {

  if (!memberStatusRows) {
    return;
  }


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

          const position =
            getMemberMonthlyPosition(
              member
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
                  position.currentDue
                )}
              </td>

              <td>
                ${money(
                  position.previousOutstanding
                )}
              </td>

              <td>
                ${money(
                  position.currentPaid
                )}
              </td>

              <td>
                ${money(
                  position.carryForward
                )}
              </td>

              <td>
                ${money(
                  position.currentOutstanding
                )}
              </td>

              <td>
                <span
                  class="contribution-status contribution-status-${escapeHtml(
                    position.status
                      .toLowerCase()
                      .replaceAll(
                        " ",
                        "-"
                      )
                  )}"
                >
                  ${escapeHtml(
                    position.status
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
   GOAL DATE CHECK
========================================================= */

function goalIsWithinDate(
  goal,
  month
) {

  if (
    goal.start_date &&
    String(
      goal.start_date
    ).slice(0, 7) >
      month
  ) {

    return false;

  }


  if (
    goal.end_date &&
    String(
      goal.end_date
    ).slice(0, 7) <
      month
  ) {

    return false;

  }


  return true;

}


/* =========================================================
   GET GOAL CONTRIBUTIONS
========================================================= */

function getGoalContributions(
  goal
) {

  return contributions.filter(
    contribution => {

      if (
        contribution.goal_id !==
        goal.id
      ) {

        return false;

      }


      const month =
        contribution.month ||
        String(
          contribution.contribution_date ||
          ""
        ).slice(0, 7);


      return goalIsWithinDate(
        goal,
        month
      );

    }
  );

}


/* =========================================================
   RENDER GOAL PROGRESS
========================================================= */

function renderGoalProgress() {

  if (!goalProgressContainer) {
    return;
  }


  if (!contributionGoals.length) {

    goalProgressContainer.innerHTML =
      `
        <div class="goal-empty">

          <strong>
            No active contribution goals
          </strong>

          <p class="muted">
            Create a contribution goal from Group Management to track a fundraising target here.
          </p>

        </div>
      `;

    return;

  }


  const activeMembers =
    getActiveMembers();


  const totalMembers =
    activeMembers.length;


  goalProgressContainer.innerHTML =
    contributionGoals
      .map(
        goal => {

          const goalContributions =
            getGoalContributions(
              goal
            );


          const amountCollected =
            goalContributions
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


          const target =
            Number(
              goal.target_amount || 0
            );


          let amountPercentage =
            target > 0
              ? (
                  amountCollected /
                  target
                ) *
                100
              : 0;


          amountPercentage =
            Math.min(
              Math.max(
                amountPercentage,
                0
              ),
              100
            );


          /*
           * Count unique active members
           * who have contributed towards
           * this specific goal.
           */

          const contributingMemberIds =
            new Set(
              goalContributions
                .filter(
                  contribution =>
                    activeMembers.some(
                      member =>
                        member.id ===
                        contribution.member_id
                    )
                )
                .map(
                  contribution =>
                    contribution.member_id
                )
            );


          const contributingMembers =
            contributingMemberIds.size;


          const memberPercentage =
            totalMembers > 0
              ? (
                  contributingMembers /
                  totalMembers
                ) *
                100
              : 0;


          const roundedAmountPercentage =
            Math.round(
              amountPercentage *
              10
            ) / 10;


          const roundedMemberPercentage =
            Math.round(
              memberPercentage *
              10
            ) / 10;


          const category =
            goal.category ||
            "other";


          return `
            <article
              class="goal-progress-card"
            >

              <div
                class="goal-progress-header"
              >

                <div>

                  <div
                    class="goal-category"
                  >
                    ${escapeHtml(
                      category
                    )}
                  </div>

                  <h3>
                    ${escapeHtml(
                      goal.goal_name
                    )}
                  </h3>

                  ${
                    goal.description
                      ? `
                        <p class="muted">
                          ${escapeHtml(
                            goal.description
                          )}
                        </p>
                      `
                      : ""
                  }

                </div>

                <strong
                  class="goal-percent"
                >
                  ${roundedAmountPercentage}%
                </strong>

              </div>


              <div
                class="goal-progress-label-row"
              >

                <span>
                  Amount collected
                </span>

                <strong>
                  ${money(
                    amountCollected
                  )}
                  ${
                    target > 0
                      ? ` / ${money(target)}`
                      : ""
                  }
                </strong>

              </div>


              <div
                class="goal-progress-track"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${roundedAmountPercentage}"
                aria-label="${escapeHtml(
                  goal.goal_name
                )} amount progress"
              >

                <div
                  class="goal-progress-fill"
                  style="width:${roundedAmountPercentage}%"
                ></div>

              </div>


              <div
                class="goal-members-row"
              >

                <div>

                  <strong>
                    ${contributingMembers}
                  </strong>

                  <span class="muted">
                    of
                    ${totalMembers}
                    active members contributed
                  </span>

                </div>


                <strong>
                  ${roundedMemberPercentage}%
                </strong>

              </div>


              <div
                class="goal-member-progress-track"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${roundedMemberPercentage}"
                aria-label="${escapeHtml(
                  goal.goal_name
                )} member participation"
              >

                <div
                  class="goal-member-progress-fill"
                  style="width:${roundedMemberPercentage}%"
                ></div>

              </div>


              <div
                class="goal-footer"
              >

                <span>
                  ${contributingMembers}
                  member${
                    contributingMembers === 1
                      ? ""
                      : "s"
                  }
                  contributing
                </span>

                ${
                  target > 0
                    ? `
                      <span>
                        ${
                          target >
                          amountCollected
                            ? money(
                                target -
                                amountCollected
                              )
                            : "Target reached"
                        }
                      </span>
                    `
                    : ""
                }

              </div>

            </article>
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

          <td colspan="8">
            No contributions recorded yet.
          </td>

        </tr>
      `;

    return;

  }


  contributionRows.innerHTML =
    contributions
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


          const goal =
            contributionGoals.find(
              item =>
                item.id ===
                contribution.goal_id
            );


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
                  goal?.goal_name ||
                  "General"
                )}
              </td>

              <td>
                ${escapeHtml(
                  reference
                )}
              </td>

              <td>
                ${escapeHtml(
                  contribution.notes ||
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
   TOGGLE MPESA
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


    /* -----------------------------------------------------
       MEMBER
    ----------------------------------------------------- */

    const memberId =
      memberSelect?.value;


    if (!memberId) {

      throw new Error(
        "Please select a member."
      );

    }


    const selectedMember =
      members.find(
        member =>
          member.id ===
          memberId
      );


    if (!selectedMember) {

      throw new Error(
        "Selected member could not be found in this group."
      );

    }


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


    /* -----------------------------------------------------
       TYPE
    ----------------------------------------------------- */

    const contributionType =
      await getSelectedContributionType();


    /* -----------------------------------------------------
       PAYMENT METHOD
    ----------------------------------------------------- */

    const paymentMethod =
      methodSelect?.value ||
      "Cash";


    /* -----------------------------------------------------
       MPESA
    ----------------------------------------------------- */

    const mpesaRef =
      String(
        mpesaReference?.value ||
        ""
      ).trim();


    const normalizedMethod =
      paymentMethod
        .toLowerCase()
        .replaceAll(
          "-",
          ""
        )
        .replaceAll(
          "_",
          ""
        );


    if (
      normalizedMethod ===
        "mpesa" &&
      !mpesaRef
    ) {

      throw new Error(
        "Please enter the M-Pesa reference."
      );

    }


    /* -----------------------------------------------------
       MONTH
    ----------------------------------------------------- */

    const month =
      contributionDate.slice(
        0,
        7
      );


    /* -----------------------------------------------------
       GOAL
    ----------------------------------------------------- */

    const goalId =
      goalSelect?.value ||
      null;


    /* -----------------------------------------------------
       NOTES
    ----------------------------------------------------- */

    const notes =
      String(
        notesInput?.value ||
        ""
      ).trim();


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


    /* -----------------------------------------------------
       PAYLOAD
       IMPORTANT:
       recorded_by MUST be members.id
       NOT auth.users.id
    ----------------------------------------------------- */

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
        mpesaRef ||
        null,

      goal_id:
        goalId,

      notes:
        notes ||
        null

    };


    /*
     * Do not send mpesa_reference separately
     * unless the database has that column.
     *
     * reference is the canonical field
     * used by this implementation.
     */


    /* -----------------------------------------------------
       INSERT
    ----------------------------------------------------- */

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
          notes
        `)
        .single();


    if (error) {
      throw error;
    }


    console.log(
      "CHAMA LIVE: contribution recorded",
      data
    );


    /* -----------------------------------------------------
       RESET FORM
    ----------------------------------------------------- */

    if (form) {

      form.reset();

    }


    if (dateInput) {

      dateInput.value =
        todayString();

    }


    renderOtherContributionType();

    toggleMpesaReference();


    /* -----------------------------------------------------
       REFRESH DATA
    ----------------------------------------------------- */

    await loadContributions();

    await loadContributionGoals();


    renderGoalSelect();

    renderGoalProgress();

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
   BIND EVENTS
========================================================= */

function bindEvents() {

  if (
    form &&
    form.dataset.bound !==
      "true"
  ) {

    form.dataset.bound =
      "true";


    form.addEventListener(
      "submit",
      handleSubmit
    );

  }


  if (
    methodSelect &&
    methodSelect.dataset.bound !==
      "true"
  ) {

    methodSelect.dataset.bound =
      "true";


    methodSelect.addEventListener(
      "change",
      toggleMpesaReference
    );

  }


  if (
    typeSelect &&
    typeSelect.dataset.bound !==
      "true"
  ) {

    typeSelect.dataset.bound =
      "true";


    typeSelect.addEventListener(
      "change",
      renderOtherContributionType
    );

  }


  /*
   * Allow Enter/blur to clean
   * the custom category name.
   */

  if (
    otherTypeInput &&
    otherTypeInput.dataset.bound !==
      "true"
  ) {

    otherTypeInput.dataset.bound =
      "true";


    otherTypeInput.addEventListener(
      "blur",
      () => {

        otherTypeInput.value =
          normalizeTypeName(
            otherTypeInput.value
          );

      }
    );

  }


  toggleMpesaReference();

}


/* =========================================================
   PUBLIC REFRESH
========================================================= */

export async function refreshContributions() {

  if (!groupId) {
    return;
  }


  await loadMembers();

  await loadContributions();

  await loadContributionGoals();

  await loadContributionTypes();


  renderMonthlyExpected();

  renderGoalSelect();

  renderContributionTypeSelect();

  renderOtherContributionType();

  renderGoalProgress();

  renderMonthlyStatus();

  renderLedger();

}


/* =========================================================
   AUTO INITIALIZE
========================================================= */

if (
  document.readyState ===
  "loading"
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
