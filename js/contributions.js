/* =========================================================
   CHAMA LIVE — CONTRIBUTIONS
   COMPLETE GROUP-SCOPED VERSION

   FEATURES
   ---------------------------------------------------------
   1. Recurring monthly contributions
   2. Outstanding balances carried forward
   3. Oldest arrears paid first
   4. Extra payments become credit
   5. Credit offsets future obligations
   6. Contribution goals
   7. Goal amount progress
   8. Goal member participation progress
   9. Unique contributing-member count
   10. Group-scoped contribution types
   11. Custom "Other" contribution type
   12. Custom contribution types persist per group
   13. M-Pesa reference handling
   14. Notes support
   15. Correct recorded_by = members.id
   16. Uses members.name — NOT members.full_name
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
       AUTHENTICATION
    ----------------------------------------------------- */

    currentUser =
      await requireAuth();


    /* -----------------------------------------------------
       MEMBER
    ----------------------------------------------------- */

    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "No member record is linked to this account."
      );

    }


    if (!currentMember.group_id) {

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


    if (!currentGroup) {

      throw new Error(
        "The current group could not be loaded."
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

    await loadContributionTypes();

    await loadContributions();

    await loadContributionGoals();


    /* -----------------------------------------------------
       RENDER
    ----------------------------------------------------- */

    renderMonthlyExpected();

    renderContributionTypeSelect();

    renderGoalSelect();

    renderGoalProgress();

    renderMonthlyStatus();

    renderLedger();


    /* -----------------------------------------------------
       EVENTS
    ----------------------------------------------------- */

    bindEvents();


    showStatus("");


    console.log(
      "CHAMA LIVE: contributions initialized",
      {
        groupId,
        memberId: currentMember.id,
        userId: currentUser?.id
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
        status,
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


  console.log(
    "CHAMA LIVE: contribution types loaded",
    contributionTypes
  );

}


/* =========================================================
   DEFAULT CONTRIBUTION TYPES
========================================================= */

const DEFAULT_CONTRIBUTION_TYPES = [
  {
    value: "monthly",
    label: "Monthly Contribution"
  },
  {
    value: "welfare",
    label: "Welfare"
  },
  {
    value: "emergency",
    label: "Emergency"
  },
  {
    value: "fundraising",
    label: "Fundraising"
  },
  {
    value: "project",
    label: "Project"
  },
  {
    value: "event",
    label: "Event"
  }
];


/* =========================================================
   NORMALIZE TYPE
========================================================= */

function normalizeContributionType(
  value
) {

  return String(
    value || ""
  )
    .trim()
    .toLowerCase()
    .replaceAll(
      " ",
      "_"
    );

}


/* =========================================================
   RENDER CONTRIBUTION TYPE SELECT
========================================================= */

function renderContributionTypeSelect(
  selectedValue = null
) {

  if (!typeSelect) {
    return;
  }


  const previousValue =
    selectedValue ??
    typeSelect.value;


  typeSelect.innerHTML =
    "";


  /* -------------------------------------------------------
     DEFAULT TYPES
  ------------------------------------------------------- */

  DEFAULT_CONTRIBUTION_TYPES.forEach(
    type => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        type.value;


      option.textContent =
        type.label;


      typeSelect.appendChild(
        option
      );

    }
  );


  /* -------------------------------------------------------
     CUSTOM GROUP TYPES
  ------------------------------------------------------- */

  contributionTypes.forEach(
    type => {

      const normalized =
        normalizeContributionType(
          type.name
        );


      /*
       * Avoid duplicates with default
       * types.
       */

      const alreadyExists =
        Array.from(
          typeSelect.options
        ).some(
          option =>
            normalizeContributionType(
              option.value
            ) === normalized ||
            normalizeContributionType(
              option.textContent
            ) === normalized
        );


      if (
        alreadyExists
      ) {

        return;

      }


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


  /* -------------------------------------------------------
     OTHER
  ------------------------------------------------------- */

  const otherOption =
    document.createElement(
      "option"
    );


  otherOption.value =
    "other";


  otherOption.textContent =
    "Other";


  typeSelect.appendChild(
    otherOption
  );


  /*
   * Restore previous selection
   * if still available.
   */

  if (
    previousValue &&
    Array.from(
      typeSelect.options
    ).some(
      option =>
        option.value ===
        previousValue
    )
  ) {

    typeSelect.value =
      previousValue;

  }

  else {

    typeSelect.value =
      "monthly";

  }


  toggleOtherContributionType();

}


/* =========================================================
   TOGGLE OTHER CONTRIBUTION TYPE
========================================================= */

function toggleOtherContributionType() {

  if (!typeSelect) {
    return;
  }


  const selected =
    String(
      typeSelect.value || ""
    )
      .trim()
      .toLowerCase();


  const isOther =
    selected ===
    "other";


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
   SAVE CUSTOM CONTRIBUTION TYPE
========================================================= */

async function saveCustomContributionType(
  typeName
) {

  const cleanName =
    String(
      typeName || ""
    ).trim();


  if (!cleanName) {

    throw new Error(
      "Please enter the name of the other contribution."
    );

  }


  /*
   * Check existing group types first.
   */

  const existingCustom =
    contributionTypes.find(
      type =>
        normalizeContributionType(
          type.name
        ) ===
        normalizeContributionType(
          cleanName
        )
    );


  if (existingCustom) {

    return existingCustom.name;

  }


  /*
   * Check default types.
   */

  const existingDefault =
    DEFAULT_CONTRIBUTION_TYPES.find(
      type =>
        normalizeContributionType(
          type.value
        ) ===
        normalizeContributionType(
          cleanName
        ) ||
        normalizeContributionType(
          type.label
        ) ===
        normalizeContributionType(
          cleanName
        )
    );


  if (existingDefault) {

    return existingDefault.value;

  }


  /*
   * Insert into group-scoped
   * contribution_types.
   *
   * IMPORTANT:
   * created_by -> members.id
   */

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
          cleanName,

        created_by:
          currentMember?.id ||
          null
      })
      .select(`
        id,
        group_id,
        name,
        created_by,
        created_at
      `)
      .single();


  if (error) {

    /*
     * If another request created
     * the same type at the same time,
     * reload and use it.
     */

    const duplicate =
      String(
        error.message || ""
      )
        .toLowerCase()
        .includes(
          "duplicate"
        );


    if (duplicate) {

      await loadContributionTypes();

      const found =
        contributionTypes.find(
          type =>
            normalizeContributionType(
              type.name
            ) ===
            normalizeContributionType(
              cleanName
            )
        );


      if (found) {

        return found.name;

      }

    }


    throw error;

  }


  if (data) {

    contributionTypes.push(
      data
    );

  }


  /*
   * Refresh dropdown immediately.
   */

  renderContributionTypeSelect(
    cleanName
  );


  return cleanName;

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


  const monthsDue =
    monthDifference(
      joinMonth,
      currentMonthValue
    ) + 1;


  const totalDue =
    monthsDue *
    expected;


  const totalPaid =
    contributions
      .filter(
        contribution =>
          contribution.member_id ===
            member.id &&
          contribution.contribution_type ===
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


  const previousDue =
    Math.max(
      monthsDue - 1,
      0
    ) *
    expected;


  const previousPaid =
    Math.min(
      totalPaid,
      previousDue
    );


  const previousOutstanding =
    Math.max(
      previousDue -
      previousPaid,
      0
    );


  const amountAfterPrevious =
    Math.max(
      totalPaid -
      previousDue,
      0
    );


  const currentPaid =
    Math.min(
      amountAfterPrevious,
      expected
    );


  const carryForward =
    Math.max(
      amountAfterPrevious -
      expected,
      0
    );


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


          const statusClass =
            String(
              position.status
            )
              .toLowerCase()
              .replaceAll(
                " ",
                "-"
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
                    statusClass
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
              amountPercentage * 10
            ) / 10;


          const roundedMemberPercentage =
            Math.round(
              memberPercentage * 10
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

    if (!isMpesa) {

      mpesaReference.value =
        "";

    }

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


  if (typeSelect) {

    typeSelect.addEventListener(
      "change",
      toggleOtherContributionType
    );

  }


  toggleMpesaReference();

  toggleOtherContributionType();

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


    if (!currentMember?.id) {

      throw new Error(
        "Your member account could not be identified."
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


    /*
     * Extra security:
     * selected member must belong
     * to current group.
     */

    const selectedMember =
      members.find(
        member =>
          member.id ===
          memberId
      );


    if (
      !selectedMember ||
      selectedMember.group_id !==
      groupId
    ) {

      throw new Error(
        "The selected member does not belong to this group."
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


    if (!/^\d{4}-\d{2}-\d{2}$/.test(
      contributionDate
    )) {

      throw new Error(
        "Please enter a valid contribution date."
      );

    }


    /* -----------------------------------------------------
       CONTRIBUTION TYPE
    ----------------------------------------------------- */

    let contributionType =
      typeSelect?.value ||
      "monthly";


    /*
     * OTHER TYPE
     */

    if (
      normalizeContributionType(
        contributionType
      ) ===
      "other"
    ) {

      const customType =
        String(
          otherTypeInput?.value ||
          ""
        ).trim();


      if (!customType) {

        throw new Error(
          "Please enter the name of the other contribution."
        );

      }


      contributionType =
        await saveCustomContributionType(
          customType
        );

    }


    /* -----------------------------------------------------
       PAYMENT METHOD
    ----------------------------------------------------- */

    const paymentMethod =
      methodSelect?.value ||
      "Cash";


    /* -----------------------------------------------------
       M-PESA
    ----------------------------------------------------- */

    const mpesaRef =
      String(
        mpesaReference?.value ||
        ""
      ).trim();


    const paymentMethodLower =
      paymentMethod
        .toLowerCase();


    if (
      paymentMethodLower.includes(
        "mpesa"
      ) ||
      paymentMethodLower.includes(
        "m-pesa"
      )
    ) {

      if (!mpesaRef) {

        throw new Error(
          "Please enter the M-Pesa reference."
        );

      }

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
       recorded_by = currentMember.id
       NOT currentUser.id
       because contributions.recorded_by
       references members.id.
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

      mpesa_reference:
        mpesaRef ||
        null,

      goal_id:
        goalId,

      notes:
        notes ||
        null

    };


    console.log(
      "CHAMA LIVE: contribution payload",
      payload
    );


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
          notes,
          mpesa_reference
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


    /*
     * Re-render the custom types
     * after reset.
     */

    renderContributionTypeSelect();

    toggleMpesaReference();

    toggleOtherContributionType();


    /* -----------------------------------------------------
       REFRESH DATA
    ----------------------------------------------------- */

    await loadContributionTypes();

    await loadContributions();

    await loadContributionGoals();


    renderContributionTypeSelect();

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
   PUBLIC REFRESH
========================================================= */

export async function refreshContributions() {

  if (!groupId) {
    return;
  }


  await loadMembers();

  await loadContributionTypes();

  await loadContributions();

  await loadContributionGoals();


  renderMonthlyExpected();

  renderContributionTypeSelect();

  renderGoalSelect();

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
