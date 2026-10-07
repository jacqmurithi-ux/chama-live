/* =========================================================
   CHAMA LIVE — ADD MEMBER
   CANONICAL MEMBER CREATION FRONTEND
   =========================================================

   Backend accounting boundary
   ----------------------------
   This page never writes directly to:
     contributions
     contribution_allocations
     contribution_obligations

   Member creation is delegated to the canonical RPCs:

     create_member_with_contribution_plan(
       p_member,
       p_contribution_plan
     )

     create_member_with_historical_contributions(
       p_member,
       p_contribution_plan,
       p_historical,
       p_request_id
     )

   Historical OFF
     -> create_member_with_contribution_plan()

   Historical ON
     -> create_member_with_historical_contributions()

   No admin-add-member Edge Function.
   No old members.js dependency.
   ========================================================= */

import { supabase } from "./supabase.js";
import { getLayoutState } from "./admin-layout.js";

/* =========================================================
   DOM
   ========================================================= */

const $ = (id) => document.getElementById(id);

/* =========================================================
   STATE
   ========================================================= */

const state = {
  initialised: false,
  submitting: false,
  requestId: null,
  monthlyType: null,
  context: null,
};

/* =========================================================
   CONSTANTS
   ========================================================= */

const MONTHLY_FREQUENCY = "monthly";

const ALLOWED_ROLES = [
  "member",
  "chairperson",
  "admin",
  "treasurer",
  "secretary",
];

const ALLOWED_MEMBER_STATUSES = [
  "active",
  "inactive",
];

const ALLOWED_ONBOARDING_STATUSES = [
  "pending",
  "invited",
  "active",
  "suspended",
];

const ALLOWED_POSITIONS = [
  "",
  "chairperson",
  "vice_chairperson",
  "treasurer",
  "secretary",
  "vice_secretary",
  "committee_member",
  "member",
  "other",
];

const ALLOWED_FIRST_PERIOD_RULES = [
  "full_period",
  "next_full_period",
];

const ALLOWED_RULE_STATUSES = [
  "active",
  "inactive",
  "ended",
];

const ALLOWED_HISTORICAL_PAYMENT_METHODS = [
  "M-Pesa",
  "Cash",
  "Bank transfer",
];

/* =========================================================
   BASIC HELPERS
   ========================================================= */

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function createRequestId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  throw new Error(
    "This browser does not support secure request IDs. Please reload the page or use a modern browser."
  );
}

function value(id) {
  return $(id)?.value?.trim() || "";
}

function numericValue(id) {
  const raw = value(id);

  if (!raw) {
    return null;
  }

  const number = Number(raw);

  return Number.isFinite(number)
    ? number
    : null;
}

function showElement(id) {
  const element = $(id);

  if (element) {
    element.hidden = false;
  }
}

function hideElement(id) {
  const element = $(id);

  if (element) {
    element.hidden = true;
  }
}

function setText(id, text) {
  const element = $(id);

  if (element) {
    element.textContent =
      text === null ||
      text === undefined
        ? ""
        : String(text);
  }
}

/* =========================================================
   MESSAGE / STATUS
   ========================================================= */

function clearMessage() {
  const message = $("addMemberMessage");

  if (!message) {
    return;
  }

  message.hidden = true;
  message.textContent = "";
}

function showMessage(message, type = "error") {
  const element = $("addMemberMessage");

  if (!element) {
    return;
  }

  element.hidden = false;
  element.textContent = message;

  element.dataset.type = type;
}

/* =========================================================
   RPC ERROR MAPPING
   ========================================================= */

function mapRpcError(error) {
  console.error(
    "CHAMA LIVE Add Member RPC error:",
    error
  );

  const code =
    error?.code ||
    error?.details?.code ||
    "";

  const message =
    error?.message ||
    error?.details ||
    error?.hint ||
    "";

  const text =
    String(message || "").trim();

  const upperCode =
    String(code).toUpperCase();

  const upperMessage =
    text.toUpperCase();

  const mappings = {
    AUTHENTICATION_REQUIRED:
      "You must be signed in to add a member.",

    ACTIVE_GROUP_MEMBER_REQUIRED:
      "Your account must be an active member of this group.",

    MEMBER_MANAGEMENT_NOT_AUTHORIZED:
      "Only a group admin or chairperson can add members.",

    MEMBER_NUMBER_ALREADY_EXISTS:
      "That member number already exists in this group.",

    MEMBERSHIP_NUMBER_ALREADY_EXISTS:
      "That membership number already exists in this group.",

    MEMBER_NUMBER_REQUIRED:
      "Member number is required.",

    MEMBERSHIP_NUMBER_REQUIRED:
      "Membership number is required.",

    MEMBER_NAME_REQUIRED:
      "Member name is required.",

    MEMBER_PHONE_REQUIRED:
      "Member phone number is required.",

    MEMBER_ROLE_INVALID:
      "The selected group role is not valid.",

    MEMBER_STATUS_INVALID:
      "The selected member status is not valid.",

    MEMBER_ONBOARDING_STATUS_INVALID:
      "The selected onboarding status is not valid.",

    ACTUAL_POSITION_INVALID:
      "The selected actual position is not valid.",

    ACTUAL_POSITION_NAME_REQUIRED:
      "Enter the position name when using Other.",

    ACTUAL_POSITION_EFFECTIVE_DATE_INVALID:
      "The position effective date is not valid.",

    ACTUAL_POSITION_EFFECTIVE_DATE_BEFORE_JOIN_DATE:
      "The position effective date cannot be before the member's join date.",

    CONTRIBUTION_TYPE_NOT_IN_GROUP:
      "The selected Monthly contribution type does not belong to this group.",

    CONTRIBUTION_TYPE_NOT_SUPPORTED:
      "The selected contribution type is not supported.",

    CONTRIBUTION_AMOUNT_INVALID:
      "Enter a valid Monthly contribution amount greater than zero.",

    CONTRIBUTION_FREQUENCY_NOT_SUPPORTED:
      "Only Monthly contributions are supported here.",

    CONTRIBUTION_EFFECTIVE_DATE_BEFORE_JOIN_DATE:
      "The contribution effective date cannot be before the member's join date.",

    CONTRIBUTION_EFFECTIVE_DATE_RANGE_INVALID:
      "The contribution effective date range is invalid.",

    FIRST_PERIOD_RULE_NOT_SUPPORTED:
      "The selected first-period rule is not supported.",

    CONTRIBUTION_RULE_STATUS_INVALID:
      "The selected contribution rule status is not valid.",

    ENDED_RULE_REQUIRES_EFFECTIVE_TO:
      "An ended contribution rule requires an effective-to date.",

    CONTRIBUTION_RULE_OVERLAP:
      "The Monthly contribution rule overlaps another contribution rule.",

    IDEMPOTENCY_CONFLICT:
      "This request has already been processed differently. Please start a new Add Member request.",

    MEMBER_INPUT_INVALID:
      "Some member details are invalid. Please review the form.",

    CONTRIBUTION_PLAN_INVALID:
      "The Monthly contribution plan is invalid. Please review the contribution section.",
  };

  if (mappings[upperCode]) {
    return mappings[upperCode];
  }

  if (
    upperMessage.includes(
      "FINANCIAL MONTH"
    ) &&
    upperMessage.includes("CLOSED")
  ) {
    return text;
  }

  if (
    upperMessage.includes(
      "HISTORICAL MONTHLY AMOUNT"
    ) &&
    upperMessage.includes(
      "CURRENT MONTHLY AMOUNT"
    )
  ) {
    return "Historical monthly amount must equal the current Monthly amount.";
  }

  if (
    upperMessage.includes(
      "INVALID HISTORICAL PAYMENT METHOD"
    )
  ) {
    return "The selected historical payment method is not valid.";
  }

  if (
    upperMessage.includes(
      "ALLOCATION"
    ) &&
    upperMessage.includes(
      "INTEGRITY"
    )
  ) {
    return text;
  }

  if (
    upperMessage.includes(
      "MEMBER NUMBER"
    ) &&
    upperMessage.includes(
      "ALREADY"
    )
  ) {
    return "That member number already exists in this group.";
  }

  if (
    upperMessage.includes(
      "MEMBERSHIP NUMBER"
    ) &&
    upperMessage.includes(
      "ALREADY"
    )
  ) {
    return "That membership number already exists in this group.";
  }

  if (text) {
    return text;
  }

  return "Unable to add the member. Please review the form and try again.";
}

/* =========================================================
   FORM DEFAULTS
   ========================================================= */

function applyDefaults() {
  const today = todayISO();

  const joinDate =
    $("addMemberJoinDate");

  if (
    joinDate &&
    !joinDate.value
  ) {
    joinDate.value = today;
  }

  const role =
    $("addMemberRole");

  if (role) {
    role.value = "member";
  }

  const status =
    $("addMemberStatus");

  if (status) {
    status.value = "active";
  }

  const onboarding =
    $("addMemberOnboardingStatus");

  if (onboarding) {
    onboarding.value = "pending";
  }

  const frequency =
    $("addMemberFrequency");

  if (frequency) {
    frequency.value = MONTHLY_FREQUENCY;
    frequency.disabled = true;
  }

  const effectiveFrom =
    $("addMemberContributionEffectiveFrom");

  if (
    effectiveFrom &&
    !effectiveFrom.value
  ) {
    effectiveFrom.value =
      joinDate?.value ||
      today;
  }

  const firstPeriodRule =
    $("addMemberFirstPeriodRule");

  if (firstPeriodRule) {
    firstPeriodRule.value =
      "full_period";
  }

  const ruleStatus =
    $("addMemberRuleStatus");

  if (ruleStatus) {
    ruleStatus.value = "active";
  }

  const position =
    $("addMemberActualPosition");

  if (position) {
    position.value = "";
  }

  const historicalAmount =
    $("addMemberHistoricalAmount");

  if (historicalAmount) {
    historicalAmount.value = "";
  }

  updatePositionFields();
}

/* =========================================================
   POSITION
   ========================================================= */

function updatePositionFields() {
  const position =
    value("addMemberActualPosition");

  const nameField =
    $("addMemberActualPositionName");

  if (!nameField) {
    return;
  }

  const wrapper =
    nameField.closest(
      ".form-field, .field, .input-group, div"
    );

  const isOther =
    position === "other";

  nameField.disabled =
    !isOther;

  nameField.required =
    isOther;

  if (!isOther) {
    nameField.value = "";
  }

  if (wrapper) {
    wrapper.hidden = !isOther;
  }
}

/* =========================================================
   MONTHLY CONTRIBUTION TYPE
   ========================================================= */

function renderMonthlyType() {
  const type =
    state.monthlyType;

  const status =
    $("addMemberMonthlyTypeStatus");

  const name =
    $("addMemberMonthlyTypeName");

  const id =
    $("addMemberMonthlyTypeId");

  if (!type) {
    state.monthlyType = null;

    if (status) {
      status.textContent =
        "No Monthly contribution type is available for this group.";
    }

    if (name) {
      name.textContent = "Unavailable";
    }

    if (id) {
      id.value = "";
    }

    return;
  }

  if (status) {
    status.textContent =
      "Monthly contribution type loaded.";
  }

  if (name) {
    name.textContent =
      type.name ||
      type.label ||
      "Monthly";
  }

  if (id) {
    id.value =
      type.id ||
      type.contribution_type_id ||
      "";
  }
}

/* =========================================================
   LOAD MONTHLY CONTRIBUTION TYPE
   ========================================================= */

async function loadMonthlyContributionType(
  groupId
) {
  /*
    Read-only lookup.

    We deliberately do not invent a table or column.
    The current group contribution types are queried using
    the known contribution_types relationship.
  */

  const result =
    await supabase
      .from("contribution_types")
      .select("*")
      .eq("group_id", groupId);

  if (result.error) {
    console.error(
      "Monthly contribution type lookup failed:",
      result.error
    );

    throw result.error;
  }

  const rows =
    Array.isArray(result.data)
      ? result.data
      : [];

  const monthly =
    rows.find((row) => {
      const type =
        String(
          row.type ??
          row.frequency ??
          row.name ??
          ""
        ).toLowerCase();

      const name =
        String(
          row.name ??
          ""
        ).toLowerCase();

      return (
        type === "monthly" ||
        name === "monthly"
      );
    });

  state.monthlyType =
    monthly || null;

  renderMonthlyType();

  return monthly;
}

/* =========================================================
   DATE HELPERS
   ========================================================= */

function compareDates(
  first,
  second
) {
  if (!first || !second) {
    return 0;
  }

  return first.localeCompare(second);
}

function monthStart(dateString) {
  if (!dateString) {
    return null;
  }

  return `${dateString.slice(
    0,
    7
  )}-01`;
}

function addMonths(
  dateString,
  months
) {
  const date =
    new Date(
      `${dateString}T00:00:00`
    );

  date.setMonth(
    date.getMonth() + months
  );

  return date
    .toISOString()
    .slice(0, 10);
}

/* =========================================================
   OBLIGATION PREVIEW
   ========================================================= */

function calculateFirstObligationMonth() {
  const joinDate =
    value("addMemberJoinDate");

  const effectiveFrom =
    value(
      "addMemberContributionEffectiveFrom"
    );

  const firstPeriodRule =
    value(
      "addMemberFirstPeriodRule"
    );

  if (
    !joinDate ||
    !effectiveFrom ||
    !firstPeriodRule
  ) {
    return null;
  }

  const effectiveMonth =
    monthStart(effectiveFrom);

  if (!effectiveMonth) {
    return null;
  }

  if (
    firstPeriodRule ===
    "next_full_period"
  ) {
    return addMonths(
      effectiveMonth,
      1
    );
  }

  return effectiveMonth;
}

function countHistoricalMonths() {
  const enabled =
    $("addMemberHistoricalDetails")
      ?.open === true;

  if (!enabled) {
    return 0;
  }

  const paidThrough =
    value(
      "addMemberHistoricalPaidThrough"
    );

  const firstMonth =
    calculateFirstObligationMonth();

  if (
    !paidThrough ||
    !firstMonth
  ) {
    return 0;
  }

  const start =
    new Date(
      `${firstMonth}T00:00:00`
    );

  const end =
    new Date(
      `${monthStart(
        paidThrough
      )}T00:00:00`
    );

  if (
    end < start
  ) {
    return 0;
  }

  return (
    (end.getFullYear() -
      start.getFullYear()) *
      12 +
    (end.getMonth() -
      start.getMonth()) +
    1
  );
}

function renderObligationPreview() {
  const preview =
    $("addMemberObligationPreview");

  if (!preview) {
    return;
  }

  const firstMonth =
    calculateFirstObligationMonth();

  const amount =
    numericValue(
      "addMemberContributionAmount"
    );

  if (
    !firstMonth ||
    !amount ||
    amount <= 0
  ) {
    preview.textContent =
      "Enter the Monthly amount and effective date to preview the first obligation month.";

    return;
  }

  preview.textContent =
    `First obligation month: ${firstMonth}`;
}

/* =========================================================
   HISTORICAL PREVIEW
   ========================================================= */

function renderHistoricalPreview() {
  const preview =
    $("addMemberHistoricalPreview");

  if (!preview) {
    return;
  }

  const details =
    $("addMemberHistoricalDetails");

  if (!details?.open) {
    preview.textContent =
      "Historical contributions are disabled.";

    return;
  }

  const months =
    countHistoricalMonths();

  const amount =
    numericValue(
      "addMemberContributionAmount"
    );

  if (
    !months ||
    !amount
  ) {
    preview.textContent =
      "Enter a valid paid-through date to preview historical months.";

    return;
  }

  const total =
    months * amount;

  preview.textContent =
    `${months} historical month${
      months === 1
        ? ""
        : "s"
    } × KSh ${amount.toLocaleString()} = KSh ${total.toLocaleString()}`;
}

/* =========================================================
   REVIEW
   ========================================================= */

function renderReview() {
  const review =
    $("addMemberReview");

  if (!review) {
    return;
  }

  const name =
    value("addMemberName");

  const memberNumber =
    value("addMemberNumber");

  const membershipNumber =
    value("addMembershipNumber");

  const amount =
    numericValue(
      "addMemberContributionAmount"
    );

  const firstMonth =
    calculateFirstObligationMonth();

  const historicalEnabled =
    $("addMemberHistoricalDetails")
      ?.open === true;

  const historicalMonths =
    countHistoricalMonths();

  review.textContent =
    [
      name
        ? `Member: ${name}`
        : "Member name: —",

      memberNumber
        ? `Member number: ${memberNumber}`
        : "Member number: —",

      membershipNumber
        ? `Membership number: ${membershipNumber}`
        : "Membership number: —",

      amount
        ? `Monthly contribution: KSh ${amount.toLocaleString()}`
        : "Monthly contribution: —",

      firstMonth
        ? `First obligation month: ${firstMonth}`
        : "First obligation month: —",

      historicalEnabled
        ? `Historical contributions: ${historicalMonths} month(s)`
        : "Historical contributions: Disabled",
    ].join("\n");
}

/* =========================================================
   VALIDATION
   ========================================================= */

function validateForm() {
  const joinDate =
    value("addMemberJoinDate");

  const contributionEffectiveFrom =
    value(
      "addMemberContributionEffectiveFrom"
    );

  const contributionEffectiveTo =
    value(
      "addMemberContributionEffectiveTo"
    );

  const amount =
    numericValue(
      "addMemberContributionAmount"
    );

  const position =
    value(
      "addMemberActualPosition"
    );

  const positionName =
    value(
      "addMemberActualPositionName"
    );

  const positionEffectiveFrom =
    value(
      "addMemberPositionEffectiveFrom"
    );

  const firstPeriodRule =
    value(
      "addMemberFirstPeriodRule"
    );

  const ruleStatus =
    value("addMemberRuleStatus");

  const frequency =
    value("addMemberFrequency");

  if (!value("addMemberNumber")) {
    return "Member number is required.";
  }

  if (!value("addMembershipNumber")) {
    return "Membership number is required.";
  }

  if (!value("addMemberName")) {
    return "Member name is required.";
  }

  if (!value("addMemberPhone")) {
    return "Member phone number is required.";
  }

  if (!joinDate) {
    return "Join date is required.";
  }

  if (
    position &&
    !ALLOWED_POSITIONS.includes(
      position
    )
  ) {
    return "The selected actual position is not valid.";
  }

  if (
    position === "other" &&
    !positionName
  ) {
    return "Enter the position name when using Other.";
  }

  if (
    positionEffectiveFrom &&
    compareDates(
      positionEffectiveFrom,
      joinDate
    ) < 0
  ) {
    return "The position effective date cannot be before the member's join date.";
  }

  if (
    !state.monthlyType?.id &&
    !state.monthlyType?.contribution_type_id
  ) {
    return "No Monthly contribution type is available for this group.";
  }

  if (frequency !== MONTHLY_FREQUENCY) {
    return "Only Monthly contributions are supported here.";
  }

  if (
    !amount ||
    amount <= 0
  ) {
    return "Enter a valid Monthly contribution amount greater than zero.";
  }

  if (
    !contributionEffectiveFrom
  ) {
    return "Contribution effective date is required.";
  }

  if (
    compareDates(
      contributionEffectiveFrom,
      joinDate
    ) < 0
  ) {
    return "The contribution effective date cannot be before the member's join date.";
  }

  if (
    contributionEffectiveTo &&
    compareDates(
      contributionEffectiveTo,
      contributionEffectiveFrom
    ) < 0
  ) {
    return "The contribution effective date range is invalid.";
  }

  if (
    !ALLOWED_FIRST_PERIOD_RULES.includes(
      firstPeriodRule
    )
  ) {
    return "The selected first-period rule is not supported.";
  }

  if (
    !ALLOWED_RULE_STATUSES.includes(
      ruleStatus
    )
  ) {
    return "The selected contribution rule status is not valid.";
  }

  if (
    ruleStatus === "ended" &&
    !contributionEffectiveTo
  ) {
    return "An ended contribution rule requires an effective-to date.";
  }

  const historicalEnabled =
    $("addMemberHistoricalDetails")
      ?.open === true;

  if (historicalEnabled) {
    const historicalAmount =
      numericValue(
        "addMemberHistoricalAmount"
      );

    const paidThrough =
      value(
        "addMemberHistoricalPaidThrough"
      );

    const paymentMethod =
      value(
        "addMemberHistoricalPaymentMethod"
      );

    if (
      historicalAmount === null ||
      historicalAmount <= 0
    ) {
      return "Historical monthly amount must be valid.";
    }

    if (
      historicalAmount !== amount
    ) {
      return "Historical monthly amount must equal the current Monthly amount.";
    }

    if (!paidThrough) {
      return "Select the historical paid-through month.";
    }

    if (
      compareDates(
        paidThrough,
        todayISO()
      ) > 0
    ) {
      return "Historical paid-through date cannot be in the future.";
    }

    const firstObligationMonth =
      calculateFirstObligationMonth();

    if (
      firstObligationMonth &&
      compareDates(
        monthStart(paidThrough),
        firstObligationMonth
      ) < 0
    ) {
      return "Historical paid-through date must reach the first obligation month.";
    }

    if (
      !ALLOWED_HISTORICAL_PAYMENT_METHODS.includes(
        paymentMethod
      )
    ) {
      return "Select a valid historical payment method.";
    }
  }

  return null;
}

/* =========================================================
   BUILD MEMBER PAYLOAD
   ========================================================= */

function buildMemberPayload() {
  return {
    member_number:
      value("addMemberNumber"),

    membership_number:
      value("addMembershipNumber"),

    name:
      value("addMemberName"),

    phone:
      value("addMemberPhone"),

    email:
      value("addMemberEmail") ||
      null,

    national_id:
      value("addMemberNationalId") ||
      null,

    role:
      value("addMemberRole") ||
      "member",

    status:
      value("addMemberStatus") ||
      "active",

    onboarding_status:
      value(
        "addMemberOnboardingStatus"
      ) ||
      "pending",

    join_date:
      value("addMemberJoinDate"),

    actual_position:
      value(
        "addMemberActualPosition"
      ) || null,

    actual_position_name:
      value(
        "addMemberActualPosition"
      ) === "other"
        ? value(
            "addMemberActualPositionName"
          )
        : null,

    actual_position_effective_from:
      value(
        "addMemberPositionEffectiveFrom"
      ) || null,
  };
}

/* =========================================================
   BUILD CONTRIBUTION PLAN
   ========================================================= */

function buildContributionPlan() {
  const contributionTypeId =
    state.monthlyType?.id ||
    state.monthlyType
      ?.contribution_type_id;

  return {
    contribution_type_id:
      contributionTypeId,

    amount:
      numericValue(
        "addMemberContributionAmount"
      ),

    frequency:
      MONTHLY_FREQUENCY,

    effective_from:
      value(
        "addMemberContributionEffectiveFrom"
      ),

    effective_to:
      value(
        "addMemberContributionEffectiveTo"
      ) || null,

    first_period_rule:
      value(
        "addMemberFirstPeriodRule"
      ) ||
      "full_period",

    status:
      value("addMemberRuleStatus") ||
      "active",
  };
}

/* =========================================================
   BUILD HISTORICAL PAYLOAD
   ========================================================= */

function buildHistoricalPayload() {
  return {
    enabled: true,

    monthly_amount:
      numericValue(
        "addMemberHistoricalAmount"
      ),

    paid_through:
      value(
        "addMemberHistoricalPaidThrough"
      ),

    payment_method:
      value(
        "addMemberHistoricalPaymentMethod"
      ),
  };
}

/* =========================================================
   RPC
   ========================================================= */

async function createMember() {
  const member =
    buildMemberPayload();

  const contributionPlan =
    buildContributionPlan();

  const historicalEnabled =
    $("addMemberHistoricalDetails")
      ?.open === true;

  if (historicalEnabled) {
    const historical =
      buildHistoricalPayload();

    return await supabase.rpc(
      "create_member_with_historical_contributions",
      {
        p_member: member,
        p_contribution_plan:
          contributionPlan,
        p_historical: historical,
        p_request_id:
          state.requestId,
      }
    );
  }

  return await supabase.rpc(
    "create_member_with_contribution_plan",
    {
      p_member: member,
      p_contribution_plan:
        contributionPlan,
    }
  );
}

/* =========================================================
   SUBMIT BUTTON
   ========================================================= */

function setSubmitting(
  submitting
) {
  state.submitting =
    submitting;

  const button =
    $("addMemberSubmit");

  if (!button) {
    return;
  }

  button.disabled =
    submitting;

  button.textContent =
    submitting
      ? "Adding Member…"
      : "Add Member";
}

function updateSubmitState() {
  const button =
    $("addMemberSubmit");

  if (!button) {
    return;
  }

  const error =
    validateForm();

  button.disabled =
    state.submitting ||
    Boolean(error) ||
    !state.monthlyType;
}

/* =========================================================
   SUCCESS
   ========================================================= */

function hideSuccessState() {
  hideElement(
    "addMemberSuccess"
  );
}

function clearSuccessSummary() {
  setText(
    "addMemberSuccessSummary",
    ""
  );
}

function renderSuccess(data) {
  const row =
    Array.isArray(data)
      ? data[0]
      : data || {};

  const memberNumber =
    row.member_number ||
    value("addMemberNumber") ||
    "—";

  const membershipNumber =
    row.membership_number ||
    value("addMembershipNumber") ||
    "—";

  const obligationsCreated =
    row.obligations_created ??
    "—";

  const totalDue =
    row.total_due ??
    "—";

  const totalAllocated =
    row.total_allocated ??
    "—";

  const arrears =
    row.arrears ??
    "—";

  const credit =
    row.credit ??
    "—";

  const status =
    row.contribution_status ||
    value("addMemberStatus") ||
    "—";

  const summary = [
    `Member number: ${memberNumber}`,
    `Membership number: ${membershipNumber}`,
    `Obligations created: ${obligationsCreated}`,
    `Total due: ${totalDue}`,
    `Total allocated: ${totalAllocated}`,
    `Arrears: ${arrears}`,
    `Credit: ${credit}`,
    `Status: ${status}`,
  ].join("\n");

  setText(
    "addMemberSuccessSummary",
    summary
  );

  showElement(
    "addMemberSuccess"
  );

  hideElement(
    "addMemberWorkspace"
  );
}

/* =========================================================
   RESET AFTER SUCCESS
   ========================================================= */

function resetForAnotherMember(
  event
) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (state.submitting) {
    return;
  }

  const form =
    $("addMemberForm");

  if (!form) {
    console.error(
      "CHAMA LIVE Add Member: form not found during reset."
    );

    return;
  }

  form.reset();

  state.requestId =
    createRequestId();

  clearMessage();
  clearSuccessSummary();
  hideSuccessState();

  const historicalDetails =
    $("addMemberHistoricalDetails");

  if (historicalDetails) {
    historicalDetails.open =
      false;
  }

  applyDefaults();
  renderMonthlyType();
  updatePositionFields();
  renderObligationPreview();
  renderHistoricalPreview();
  renderReview();
  updateSubmitState();

  showElement(
    "addMemberWorkspace"
  );

  const name =
    $("addMemberName");

  if (name) {
    name.focus();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

/* =========================================================
   SUBMIT
   ========================================================= */

async function handleSubmit(
  event
) {
  event.preventDefault();

  if (state.submitting) {
    return;
  }

  clearMessage();

  const validationError =
    validateForm();

  if (validationError) {
    showMessage(
      validationError,
      "error"
    );

    updateSubmitState();

    return;
  }

  setSubmitting(true);

  showMessage(
    "Creating the member and canonical accounting state…",
    "info"
  );

  try {
    const {
      data: sessionData,
      error: sessionError,
    } =
      await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (
      !sessionData?.session
    ) {
      window.location.href =
        "login.html";

      return;
    }

    /*
      Reuse the same request ID during retries.

      It is generated when the form is opened/reset,
      and only replaced after a successful creation
      when Add Another Member is selected.
    */

    if (!state.requestId) {
      state.requestId =
        createRequestId();
    }

    const {
      data,
      error,
    } =
      await createMember();

    if (error) {
      throw error;
    }

    renderSuccess(data);

    showMessage(
      "Member created successfully.",
      "success"
    );
  } catch (error) {
    const message =
      mapRpcError(error);

    showMessage(
      message,
      "error"
    );
  } finally {
    setSubmitting(false);

    /*
      Do not replace requestId here.
      A retry must reuse the same request ID.
    */

    if (
      $("addMemberSuccess")?.hidden !==
      false
    ) {
      updateSubmitState();
    }
  }
}

/* =========================================================
   EVENT BINDING
   ========================================================= */

function bindFormEvents() {
  const form =
    $("addMemberForm");

  if (
    !form ||
    form.dataset.addMemberEventsBound ===
      "true"
  ) {
    return;
  }

  form.dataset.addMemberEventsBound =
    "true";

  form.addEventListener(
    "submit",
    handleSubmit
  );

  const watchedIds = [
    "addMemberNumber",
    "addMembershipNumber",
    "addMemberName",
    "addMemberPhone",
    "addMemberEmail",
    "addMemberNationalId",
    "addMemberJoinDate",
    "addMemberRole",
    "addMemberStatus",
    "addMemberOnboardingStatus",
    "addMemberActualPosition",
    "addMemberActualPositionName",
    "addMemberPositionEffectiveFrom",
    "addMemberContributionAmount",
    "addMemberFrequency",
    "addMemberContributionEffectiveFrom",
    "addMemberContributionEffectiveTo",
    "addMemberFirstPeriodRule",
    "addMemberRuleStatus",
    "addMemberHistoricalPaidThrough",
    "addMemberHistoricalPaymentMethod",
  ];

  watchedIds.forEach((id) => {
    const element = $(id);

    if (!element) {
      return;
    }

    element.addEventListener(
      "input",
      () => {
        if (
          id ===
          "addMemberActualPosition"
        ) {
          updatePositionFields();
        }

        const amount =
          numericValue(
            "addMemberContributionAmount"
          );

        const historicalAmount =
          $("addMemberHistoricalAmount");

        if (historicalAmount) {
          historicalAmount.value =
            amount === null
              ? ""
              : String(amount);
        }

        renderObligationPreview();
        renderHistoricalPreview();
        renderReview();
        updateSubmitState();
      }
    );

    element.addEventListener(
      "change",
      () => {
        if (
          id ===
          "addMemberActualPosition"
        ) {
          updatePositionFields();
        }

        const amount =
          numericValue(
            "addMemberContributionAmount"
          );

        const historicalAmount =
          $("addMemberHistoricalAmount");

        if (historicalAmount) {
          historicalAmount.value =
            amount === null
              ? ""
              : String(amount);
        }

        renderObligationPreview();
        renderHistoricalPreview();
        renderReview();
        updateSubmitState();
      }
    );
  });

  const historicalDetails =
    $("addMemberHistoricalDetails");

  if (historicalDetails) {
    historicalDetails.addEventListener(
      "toggle",
      () => {
        renderHistoricalPreview();
        renderReview();
        updateSubmitState();
      }
    );
  }

  /*
    IMPORTANT:
    Use delegated click handling for Add Another Member.

    This remains reliable even if the success section
    is shown/hidden or its contents are replaced.
  */

  const workspace =
    $("addMemberWorkspace") ||
    document;

  if (
    workspace.dataset &&
    workspace.dataset.addMemberAnotherBound !==
      "true"
  ) {
    workspace.dataset.addMemberAnotherBound =
      "true";

    workspace.addEventListener(
      "click",
      (event) => {
        const target =
          event.target instanceof Element
            ? event.target.closest(
                "#addMemberAnother"
              )
            : null;

        if (!target) {
          return;
        }

        resetForAnotherMember(
          event
        );
      }
    );
  }
}

/* =========================================================
   APPLICATION CONTEXT
   ========================================================= */

async function loadApplicationContext() {
  /*
    admin-layout.js has already authenticated the user,
    resolved the member, resolved the group and authorised
    the current admin page before this feature module loads.

    Reuse that exact context instead of running the complete
    Auth/member/group resolution a second time.
  */

  const layoutState =
    getLayoutState();

  const context =
    layoutState || null;

  if (!context?.user || !context?.member) {
    throw new Error(
      "Your authenticated group context could not be resolved."
    );
  }

  const groupId =
    context.member?.group_id ||
    context.group?.id;

  if (!groupId) {
    throw new Error(
      "No active group could be resolved for your account."
    );
  }

  state.context = {
    ...context,
    group_id:
      groupId,
  };

  return state.context;
}

/* =========================================================
   ACCESS CHECK
   ========================================================= */

async function checkMemberManagementAccess(
  groupId
) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      "can_manage_members",
      {
        p_group_id:
          groupId,
      }
    );

  if (error) {
    throw error;
  }

  return data === true;
}

/* =========================================================
   UI STATES
   ========================================================= */

function showLoading() {
  hideElement(
    "addMemberAccessError"
  );

  hideElement(
    "addMemberWorkspace"
  );

  showElement(
    "addMemberLoading"
  );
}

function hideLoading() {
  hideElement(
    "addMemberLoading"
  );
}

function showAccessError(
  message
) {
  hideElement(
    "addMemberLoading"
  );

  hideElement(
    "addMemberWorkspace"
  );

  const error =
    $("addMemberAccessError");

  if (error) {
    error.hidden = false;

    const messageElement =
      error.querySelector(
        "[data-add-member-error-message]"
      );

    if (messageElement) {
      messageElement.textContent =
        message;
    } else {
      error.textContent =
        message;
    }
  }
}

function showWorkspace() {
  hideElement(
    "addMemberLoading"
  );

  hideElement(
    "addMemberAccessError"
  );

  showElement(
    "addMemberWorkspace"
  );
}

/* =========================================================
   INITIALISE
   ========================================================= */

export async function addMemberInit() {
  if (state.initialised) {
    return;
  }

  showLoading();

  try {
    console.info(
      "CHAMA LIVE Add Member: starting feature initialization."
    );

    state.requestId =
      createRequestId();

    const context =
      await loadApplicationContext();

    console.info(
      "CHAMA LIVE Add Member: admin context resolved.",
      {
        groupId:
          context.group_id,
        role:
          context.role
      }
    );

    const groupId =
      context.group_id;

    const canManage =
      await checkMemberManagementAccess(
        groupId
      );

    console.info(
      "CHAMA LIVE Add Member: can_manage_members result:",
      canManage
    );

    if (!canManage) {
      showAccessError(
        "Only a group admin or chairperson can add members."
      );

      return;
    }

    console.info(
      "CHAMA LIVE Add Member: loading Monthly contribution type."
    );

    await loadMonthlyContributionType(
      groupId
    );

    console.info(
      "CHAMA LIVE Add Member: Monthly contribution type loaded.",
      state.monthlyType
    );

    applyDefaults();

    bindFormEvents();

    renderMonthlyType();
    updatePositionFields();
    renderObligationPreview();
    renderHistoricalPreview();
    renderReview();
    updateSubmitState();

    showWorkspace();

    state.initialised =
      true;

    console.info(
      "CHAMA LIVE Add Member: feature initialization completed."
    );
  } catch (error) {
    console.error(
      "CHAMA LIVE Add Member initialization failed:",
      error
    );

    showAccessError(
      mapRpcError(error)
    );
  }
}

/* =========================================================
   COMPATIBILITY EXPORT
   ========================================================= */

export const initPage =
  addMemberInit;a