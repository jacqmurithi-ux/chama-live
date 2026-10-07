/* =========================================================
   CHAMA LIVE — ADD MEMBER
   ---------------------------------------------------------
   Dedicated member-creation page.

   IMPORTANT ACCOUNTING BOUNDARY
   ---------------------------------------------------------
   This file NEVER directly inserts/updates:

     contributions
     contribution_allocations
     contribution_obligations

   Member/accounting creation is delegated to the canonical
   backend RPCs.

   Historical OFF:
     create_member_with_contribution_plan()

   Historical ON:
     create_member_with_historical_contributions()

   No members.js dependency.
========================================================= */

import {
  getMyApplicationContext,
  requireAuth
} from "./auth.js";

import {
  loadContributionTypes,
  findMonthlyContributionType,
  canManageMembers,
  createMember
} from "./add-member-rpc.js";

import {
  mapRpcError
} from "./add-member-errors.js";


/* =========================================================
   STATE
========================================================= */

const state = {
  context: null,
  groupId: null,
  monthlyType: null,
  requestId: null,
  submitting: false,
  initialised: false
};


/* =========================================================
   DOM
========================================================= */

const $ = (id) =>
  document.getElementById(id);


/* =========================================================
   TEXT
========================================================= */

function text(
  element,
  value
) {

  if (!element) {
    return;
  }

  element.textContent =
    value == null
      ? ""
      : String(value);

}


/* =========================================================
   TODAY
========================================================= */

function todayDate() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;

}


/* =========================================================
   DATE PARSING
========================================================= */

function parseDate(
  value
) {

  if (!value) {
    return null;
  }

  const date =
    new Date(
      `${value}T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return null;

  }

  return date;

}


/* =========================================================
   DATE COMPARISON
========================================================= */

function dateOnly(
  date
) {

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

}


function compareDates(
  a,
  b
) {

  const da =
    dateOnly(a).getTime();

  const db =
    dateOnly(b).getTime();

  if (da < db) {
    return -1;
  }

  if (da > db) {
    return 1;
  }

  return 0;

}


/* =========================================================
   MONTH HELPERS
========================================================= */

function monthFromDate(
  value
) {

  const date =
    parseDate(value);

  if (!date) {
    return "";
  }

  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    )
  ].join("-");

}


function monthToDate(
  value
) {

  if (
    !/^\d{4}-\d{2}$/.test(
      value || ""
    )
  ) {

    return null;

  }

  const [
    year,
    month
  ] =
    value
      .split("-")
      .map(Number);


  const date =
    new Date(
      year,
      month - 1,
      1
    );


  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1
  ) {

    return null;

  }

  return date;

}


function nextMonth(
  month
) {

  const date =
    monthToDate(
      month
    );

  if (!date) {
    return "";
  }

  date.setMonth(
    date.getMonth() + 1
  );

  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    )
  ].join("-");

}


/* =========================================================
   CURRENT MONTH
========================================================= */

function currentMonth() {

  return monthFromDate(
    todayDate()
  );

}


/* =========================================================
   MONEY
========================================================= */

function formatMoney(
  value
) {

  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {

    return "KSh 0.00";

  }

  return `KSh ${number.toLocaleString(
    "en-KE",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  )}`;

}


/* =========================================================
   UUID
========================================================= */

function createRequestId() {

  if (
    !globalThis.crypto ||
    typeof globalThis.crypto.randomUUID !==
      "function"
  ) {

    throw new Error(
      "This browser cannot create the required secure member-creation request ID."
    );

  }

  return globalThis.crypto.randomUUID();

}


/* =========================================================
   ERROR UI
========================================================= */

function clearMessage() {

  const box =
    $("addMemberMessage");

  if (!box) {
    return;
  }

  box.hidden =
    true;

  box.className =
    "add-member-alert";

  box.replaceChildren();

}


function showMessage(
  message,
  details = null,
  type = "error"
) {

  const box =
    $("addMemberMessage");

  if (!box) {
    return;
  }

  box.hidden =
    false;

  box.className =
    `add-member-alert add-member-alert-${type}`;

  box.replaceChildren();


  const main =
    document.createElement(
      "div"
    );

  main.textContent =
    message ||
    "The member could not be created.";

  box.appendChild(
    main
  );


  if (details) {

    const detail =
      document.createElement(
        "small"
      );

    detail.className =
      "details";

    detail.textContent =
      `Details: ${details}`;

    box.appendChild(
      detail
    );

  }


  box.scrollIntoView({
    behavior:
      "smooth",
    block:
      "nearest"
  });

}


function showAccessError(
  error
) {

  const box =
    $("addMemberAccessError");

  if (!box) {
    return;
  }

  box.hidden =
    false;

  box.textContent =
    error?.message ||
    "You cannot access Add Member.";

}


/* =========================================================
   LOADING
========================================================= */

function setPageLoading(
  loading
) {

  const box =
    $("addMemberLoading");

  if (!box) {
    return;
  }

  box.hidden =
    !loading;

}


/* =========================================================
   WORKSPACE
========================================================= */

function showWorkspace() {

  const workspace =
    $("addMemberWorkspace");

  if (!workspace) {
    return;
  }

  workspace.hidden =
    false;

}


function hideWorkspace() {

  const workspace =
    $("addMemberWorkspace");

  if (!workspace) {
    return;
  }

  workspace.hidden =
    true;

}


/* =========================================================
   SUCCESS STATE
========================================================= */

function hideSuccessState() {

  const success =
    $("addMemberSuccess");

  const form =
    $("addMemberForm");

  if (success) {
    success.hidden =
      true;
  }

  if (form) {
    form.hidden =
      false;
  }

}


function clearSuccessSummary() {

  const summary =
    $("addMemberSuccessSummary");

  if (!summary) {
    return;
  }

  summary.replaceChildren();

}


/* =========================================================
   PAGE STATE RESET
   ---------------------------------------------------------
   Used when the page is opened fresh or restored from
   browser history/cache.

   IMPORTANT:
   This does NOT generate the next request ID.
   The request ID belongs to the current form session.
========================================================= */

function resetPageState({
  generateRequestId = true
} = {}) {

  const form =
    $("addMemberForm");

  const success =
    $("addMemberSuccess");

  const historical =
    $("addMemberHistoricalDetails");

  clearMessage();

  clearSuccessSummary();

  hideSuccessState();


  if (success) {
    success.hidden =
      true;
  }


  if (form) {
    form.hidden =
      false;
  }


  if (historical) {
    historical.open =
      false;
  }


  state.submitting =
    false;


  if (generateRequestId) {

    state.requestId =
      createRequestId();

  }


  const submit =
    $("addMemberSubmit");

  if (submit) {

    submit.disabled =
      true;

    submit.textContent =
      "Add Member";

  }

}


/* =========================================================
   MEMBER DEFAULTS
========================================================= */

function applyDefaults() {

  const today =
    todayDate();


  const joinDate =
    $("addMemberJoinDate");

  const effectiveFrom =
    $("addMemberContributionEffectiveFrom");

  const firstPeriod =
    $("addMemberFirstPeriodRule");

  const frequency =
    $("addMemberFrequency");

  const memberStatus =
    $("addMemberStatus");

  const onboardingStatus =
    $("addMemberOnboardingStatus");

  const role =
    $("addMemberRole");

  const ruleStatus =
    $("addMemberRuleStatus");


  if (joinDate) {
    joinDate.value =
      today;
  }

  if (effectiveFrom) {
    effectiveFrom.value =
      today;
  }

  if (firstPeriod) {
    firstPeriod.value =
      "full_period";
  }

  if (frequency) {
    frequency.value =
      "monthly";
  }

  if (memberStatus) {
    memberStatus.value =
      "active";
  }

  if (onboardingStatus) {
    onboardingStatus.value =
      "pending";
  }

  if (role) {
    role.value =
      "member";
  }

  if (ruleStatus) {
    ruleStatus.value =
      "active";
  }

}


/* =========================================================
   MONTHLY TYPE DISPLAY
========================================================= */

function renderMonthlyType() {

  const type =
    state.monthlyType;

  if (!type) {
    return;
  }


  text(
    $("addMemberMonthlyTypeName"),
    type.name ||
    "Monthly"
  );


  text(
    $("addMemberMonthlyTypeId"),
    type.id ||
    "—"
  );


  const status =
    $("addMemberMonthlyTypeStatus");


  if (status) {

    status.textContent =
      "Available";

    status.className =
      "add-member-badge";

  }

}


/* =========================================================
   MONTHLY TYPE ERROR
========================================================= */

function renderMonthlyTypeError(
  error
) {

  text(
    $("addMemberMonthlyTypeName"),
    "Monthly type unavailable"
  );

  text(
    $("addMemberMonthlyTypeId"),
    "—"
  );


  const status =
    $("addMemberMonthlyTypeStatus");


  if (status) {

    status.textContent =
      "Unavailable";

    status.className =
      "add-member-badge";

  }


  showMessage(
    error?.message ||
    "The group's Monthly contribution type could not be loaded.",
    error?.details ||
    error?.message
  );

}


/* =========================================================
   FIRST OBLIGATION MONTH
========================================================= */

function getFirstObligationMonth() {

  const effectiveFrom =
    $("addMemberContributionEffectiveFrom")
      ?.value;

  const rule =
    $("addMemberFirstPeriodRule")
      ?.value;


  const effectiveMonth =
    monthFromDate(
      effectiveFrom
    );


  if (!effectiveMonth) {
    return "";
  }


  if (
    rule ===
    "next_full_period"
  ) {

    return nextMonth(
      effectiveMonth
    );

  }


  return effectiveMonth;

}


/* =========================================================
   HISTORICAL ENABLED
========================================================= */

function isHistoricalEnabled() {

  return (
    $("addMemberHistoricalDetails")
      ?.open === true
  );

}


/* =========================================================
   HISTORICAL MONTH COUNT
========================================================= */

function monthDistanceInclusive(
  startMonth,
  endMonth
) {

  const start =
    monthToDate(
      startMonth
    );

  const end =
    monthToDate(
      endMonth
    );


  if (!start || !end) {
    return 0;
  }


  if (
    start > end
  ) {

    return 0;

  }


  return (
    (
      end.getFullYear() -
      start.getFullYear()
    ) *
    12
  ) +
  (
    end.getMonth() -
    start.getMonth()
  ) +
  1;

}


/* =========================================================
   OBLIGATION PREVIEW
========================================================= */

function renderObligationPreview() {

  const box =
    $("addMemberObligationPreview");

  if (!box) {
    return;
  }


  const firstMonth =
    getFirstObligationMonth();

  const amount =
    Number(
      $("addMemberContributionAmount")
        ?.value
    );


  if (
    !firstMonth ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    box.textContent =
      "Enter the member's join date and contribution settings to preview the first obligation month.";

    return;

  }


  const effectiveTo =
    $("addMemberContributionEffectiveTo")
      ?.value;


  if (
    effectiveTo &&
    firstMonth >
      monthFromDate(effectiveTo)
  ) {

    box.innerHTML =
      "<strong>Plan check:</strong> The first obligation month falls after the rule's effective end date.";

    return;

  }


  box.innerHTML =
    `<strong>First obligation month:</strong> ${firstMonth}<br>` +
    `<strong>Monthly obligation:</strong> ${formatMoney(amount)}<br>` +
    `<strong>Frequency:</strong> Monthly`;

}


/* =========================================================
   HISTORICAL PREVIEW
========================================================= */

function renderHistoricalPreview() {

  const box =
    $("addMemberHistoricalPreview");

  const amountInput =
    $("addMemberHistoricalAmount");

  if (!box) {
    return;
  }


  const amount =
    Number(
      $("addMemberContributionAmount")
        ?.value
    );


  if (amountInput) {

    amountInput.value =
      Number.isFinite(amount) &&
      amount > 0
        ? amount.toFixed(2)
        : "";

  }


  if (
    !isHistoricalEnabled()
  ) {

    box.textContent =
      "Historical onboarding is disabled. The normal member-creation RPC will be used.";

    return;

  }


  const paidThrough =
    $("addMemberHistoricalPaidThrough")
      ?.value;

  const firstMonth =
    getFirstObligationMonth();


  if (!paidThrough) {

    box.textContent =
      "Choose the Paid Through month to preview historical coverage.";

    return;

  }


  const paidThroughDate =
    monthToDate(
      paidThrough
    );


  if (!paidThroughDate) {

    box.textContent =
      "Enter a valid Paid Through month.";

    return;

  }


  const today =
    monthToDate(
      currentMonth()
    );


  if (
    paidThroughDate >
    today
  ) {

    box.innerHTML =
      "<strong>Historical check:</strong> Paid Through cannot be in the future.";

    return;

  }


  if (
    firstMonth &&
    paidThrough <
    firstMonth
  ) {

    box.innerHTML =
      `<strong>Historical check:</strong> Paid Through must reach the first obligation month (${firstMonth}).`;

    return;

  }


  const months =
    monthDistanceInclusive(
      firstMonth,
      paidThrough
    );


  const total =
    months *
    amount;


  box.innerHTML =
    `<strong>Historical months:</strong> ${months}<br>` +
    `<strong>Historical amount:</strong> ${formatMoney(total)}<br>` +
    `<strong>Paid Through:</strong> ${paidThrough}`;

}


/* =========================================================
   POSITION UI
========================================================= */

function updatePositionFields() {

  const position =
    $("addMemberActualPosition")
      ?.value;

  const wrap =
    $("addMemberPositionNameWrap");

  const name =
    $("addMemberActualPositionName");

  if (!wrap || !name) {
    return;
  }


  const other =
    position ===
    "other";


  wrap.hidden =
    !other;

  name.required =
    other;


  if (!other) {

    name.value =
      "";

  }

}


/* =========================================================
   REVIEW
========================================================= */

function reviewItem(
  label,
  value
) {

  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.className =
    "add-member-review-item";


  const labelElement =
    document.createElement(
      "span"
    );

  labelElement.textContent =
    label;


  const valueElement =
    document.createElement(
      "strong"
    );

  valueElement.textContent =
    value ||
    "—";


  wrapper.append(
    labelElement,
    valueElement
  );


  return wrapper;

}


function renderReview() {

  const review =
    $("addMemberReview");

  if (!review) {
    return;
  }


  review.replaceChildren();


  const historical =
    isHistoricalEnabled();


  const position =
    $("addMemberActualPosition")
      ?.value;


  const positionName =
    $("addMemberActualPositionName")
      ?.value
      ?.trim();


  const positionDisplay =
    position === "other"
      ? positionName
      : position;


  const type =
    state.monthlyType;


  const items = [

    [
      "Member Number",
      $("addMemberNumber")?.value?.trim()
    ],

    [
      "Membership Number",
      $("addMembershipNumber")?.value?.trim()
    ],

    [
      "Name",
      $("addMemberName")?.value?.trim()
    ],

    [
      "Phone",
      $("addMemberPhone")?.value?.trim()
    ],

    [
      "Join Date",
      $("addMemberJoinDate")?.value
    ],

    [
      "Security Role",
      $("addMemberRole")?.value
    ],

    [
      "Member Status",
      $("addMemberStatus")?.value
    ],

    [
      "Onboarding",
      $("addMemberOnboardingStatus")?.value
    ],

    [
      "Position",
      positionDisplay
    ],

    [
      "Position Effective",
      $("addMemberPositionEffectiveFrom")?.value
    ],

    [
      "Contribution Type",
      type?.name
    ],

    [
      "Monthly Amount",
      formatMoney(
        $("addMemberContributionAmount")
          ?.value
      )
    ],

    [
      "Effective From",
      $("addMemberContributionEffectiveFrom")?.value
    ],

    [
      "Effective To",
      $("addMemberContributionEffectiveTo")?.value ||
      "Open-ended"
    ],

    [
      "First Period Rule",
      $("addMemberFirstPeriodRule")?.value
    ],

    [
      "Rule Status",
      $("addMemberRuleStatus")?.value
    ],

    [
      "First Obligation Month",
      getFirstObligationMonth()
    ],

    [
      "Historical",
      historical
        ? "Enabled"
        : "Disabled"
    ]

  ];


  if (historical) {

    items.push(
      [
        "Paid Through",
        $("addMemberHistoricalPaidThrough")
          ?.value
      ],
      [
        "Payment Method",
        $("addMemberHistoricalPaymentMethod")
          ?.value
      ]
    );

  }


  for (
    const [
      label,
      value
    ]
    of items
  ) {

    review.appendChild(
      reviewItem(
        label,
        value
      )
    );

  }

}


/* =========================================================
   FORM VALIDATION
========================================================= */

function validateForm() {

  const memberNumber =
    $("addMemberNumber")
      ?.value
      ?.trim();

  const membershipNumber =
    $("addMembershipNumber")
      ?.value
      ?.trim();

  const name =
    $("addMemberName")
      ?.value
      ?.trim();

  const phone =
    $("addMemberPhone")
      ?.value
      ?.trim();

  const joinDate =
    $("addMemberJoinDate")
      ?.value;

  const role =
    $("addMemberRole")
      ?.value;

  const status =
    $("addMemberStatus")
      ?.value;

  const onboardingStatus =
    $("addMemberOnboardingStatus")
      ?.value;

  const position =
    $("addMemberActualPosition")
      ?.value;

  const positionName =
    $("addMemberActualPositionName")
      ?.value
      ?.trim();

  const positionEffective =
    $("addMemberPositionEffectiveFrom")
      ?.value;

  const amount =
    Number(
      $("addMemberContributionAmount")
        ?.value
    );

  const effectiveFrom =
    $("addMemberContributionEffectiveFrom")
      ?.value;

  const effectiveTo =
    $("addMemberContributionEffectiveTo")
      ?.value;

  const firstPeriodRule =
    $("addMemberFirstPeriodRule")
      ?.value;

  const ruleStatus =
    $("addMemberRuleStatus")
      ?.value;


  if (!memberNumber) {
    return "Member number is required.";
  }

  if (!membershipNumber) {
    return "Membership number is required.";
  }

  if (!name) {
    return "Member name is required.";
  }

  if (!phone) {
    return "Member phone number is required.";
  }

  if (!joinDate) {
    return "Join date is required.";
  }

  if (!role) {
    return "Security role is required.";
  }

  if (!status) {
    return "Member status is required.";
  }

  if (!onboardingStatus) {
    return "Onboarding status is required.";
  }


  const joinDateObject =
    parseDate(
      joinDate
    );


  if (!joinDateObject) {
    return "The join date is invalid.";
  }


  if (
    position === "other" &&
    !positionName
  ) {

    return "A position name is required when Actual Position is Other.";

  }


  if (positionEffective) {

    const positionDate =
      parseDate(
        positionEffective
      );


    if (!positionDate) {
      return "The actual position effective date is invalid.";
    }


    if (
      compareDates(
        positionDate,
        joinDateObject
      ) < 0
    ) {

      return "The actual position effective date cannot be before the join date.";

    }

  }


  if (
    !state.monthlyType?.id
  ) {

    return "The group's Monthly contribution type has not loaded.";

  }


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    return "The monthly contribution amount must be greater than zero.";

  }


  if (!effectiveFrom) {
    return "Contribution effective date is required.";
  }


  const effectiveFromDate =
    parseDate(
      effectiveFrom
    );


  if (!effectiveFromDate) {
    return "The contribution effective date is invalid.";
  }


  if (
    compareDates(
      effectiveFromDate,
      joinDateObject
    ) < 0
  ) {

    return "The contribution effective date cannot be before the join date.";

  }


  if (effectiveTo) {

    const effectiveToDate =
      parseDate(
        effectiveTo
      );


    if (!effectiveToDate) {
      return "The contribution effective end date is invalid.";
    }


    if (
      compareDates(
        effectiveToDate,
        effectiveFromDate
      ) < 0
    ) {

      return "The contribution effective end date cannot be before the effective-from date.";

    }

  }


  if (
    firstPeriodRule !==
      "full_period" &&
    firstPeriodRule !==
      "next_full_period"
  ) {

    return "The selected first-period contribution rule is not supported.";

  }


  if (
    ruleStatus !== "active" &&
    ruleStatus !== "inactive" &&
    ruleStatus !== "ended"
  ) {

    return "The contribution rule status is not valid.";

  }


  if (
    ruleStatus === "ended" &&
    !effectiveTo
  ) {

    return "An ended contribution rule requires an end date.";

  }


  if (
    isHistoricalEnabled()
  ) {

    const paidThrough =
      $("addMemberHistoricalPaidThrough")
        ?.value;

    const paymentMethod =
      $("addMemberHistoricalPaymentMethod")
        ?.value;


    if (!paidThrough) {
      return "Choose the Historical Paid Through month.";
    }


    const paidThroughDate =
      monthToDate(
        paidThrough
      );


    if (!paidThroughDate) {
      return "The Historical Paid Through month is invalid.";
    }


    const now =
      monthToDate(
        currentMonth()
      );


    if (
      paidThroughDate >
      now
    ) {

      return "Historical Paid Through cannot be in the future.";

    }


    const firstMonth =
      getFirstObligationMonth();


    if (
      firstMonth &&
      paidThrough <
      firstMonth
    ) {

      return `Historical Paid Through must reach the first obligation month (${firstMonth}).`;

    }


    const allowedMethods =
      new Set([
        "M-Pesa",
        "Cash",
        "Bank transfer"
      ]);


    if (
      !allowedMethods.has(
        paymentMethod
      )
    ) {

      return "The selected historical payment method is invalid.";

    }

  }


  return null;

}


/* =========================================================
   BUILD MEMBER JSON
========================================================= */

function buildMemberPayload() {

  const payload = {

    member_number:
      $("addMemberNumber")
        .value
        .trim(),

    membership_number:
      $("addMembershipNumber")
        .value
        .trim(),

    name:
      $("addMemberName")
        .value
        .trim(),

    phone:
      $("addMemberPhone")
        .value
        .trim(),

    role:
      $("addMemberRole")
        .value,

    status:
      $("addMemberStatus")
        .value,

    onboarding_status:
      $("addMemberOnboardingStatus")
        .value,

    join_date:
      $("addMemberJoinDate")
        .value

  };


  const email =
    $("addMemberEmail")
      ?.value
      ?.trim();

  const nationalId =
    $("addMemberNationalId")
      ?.value
      ?.trim();


  if (email) {

    payload.email =
      email;

  }


  if (nationalId) {

    payload.national_id =
      nationalId;

  }


  const position =
    $("addMemberActualPosition")
      ?.value;


  if (position) {

    payload.actual_position =
      position;


    if (
      position ===
      "other"
    ) {

      payload.actual_position_name =
        $("addMemberActualPositionName")
          .value
          .trim();

    }


    const effectiveFrom =
      $("addMemberPositionEffectiveFrom")
        ?.value;


    if (effectiveFrom) {

      payload.actual_position_effective_from =
        effectiveFrom;

    }

  }


  return payload;

}


/* =========================================================
   BUILD CONTRIBUTION PLAN
========================================================= */

function buildContributionPlan() {

  return [
    {

      contribution_type_id:
        state.monthlyType.id,

      amount:
        Number(
          $("addMemberContributionAmount")
            .value
        ),

      frequency:
        "monthly",

      effective_from:
        $("addMemberContributionEffectiveFrom")
          .value,

      effective_to:
        $("addMemberContributionEffectiveTo")
          .value ||
        null,

      first_period_rule:
        $("addMemberFirstPeriodRule")
          .value,

      status:
        $("addMemberRuleStatus")
          .value

    }
  ];

}


/* =========================================================
   BUILD HISTORICAL JSON
========================================================= */

function buildHistoricalPayload() {

  if (
    !isHistoricalEnabled()
  ) {

    return null;

  }


  const paidThrough =
    $("addMemberHistoricalPaidThrough")
      .value;


  /*
   * The UI stores the selected month as YYYY-MM.
   *
   * The historical backend contract receives a date-like
   * paid-through boundary. The first day of the selected
   * month is sent as the canonical JSON date.
   */

  return {

    enabled:
      true,

    monthly_amount:
      Number(
        $("addMemberContributionAmount")
          .value
      ),

    paid_through:
      `${paidThrough}-01`,

    payment_method:
      $("addMemberHistoricalPaymentMethod")
        .value

  };

}


/* =========================================================
   SUCCESS RESULT NORMALISATION
========================================================= */

function normaliseRpcResult(
  data
) {

  /*
   * create_member_with_contribution_plan()
   * returns a table, therefore Supabase normally returns
   * an array with one row.
   *
   * Historical creation returns jsonb, therefore it may
   * arrive as an object.
   */

  if (
    Array.isArray(data)
  ) {

    return data[0] ||
      null;

  }


  if (
    data &&
    typeof data === "object"
  ) {

    return data;

  }


  return null;

}


/* =========================================================
   RESULT VALUE
========================================================= */

function resultValue(
  result,
  ...keys
) {

  for (
    const key
    of keys
  ) {

    if (
      result &&
      result[key] !== undefined &&
      result[key] !== null
    ) {

      return result[key];

    }

  }

  return null;

}


/* =========================================================
   SUCCESS SUMMARY
========================================================= */

function renderSuccess(
  result
) {

  const summary =
    $("addMemberSuccessSummary");

  const form =
    $("addMemberForm");

  const success =
    $("addMemberSuccess");


  if (!summary || !form || !success) {
    return;
  }


  summary.replaceChildren();


  const values = [

    [
      "Member Number",
      resultValue(
        result,
        "member_number"
      )
    ],

    [
      "Membership Number",
      resultValue(
        result,
        "membership_number"
      )
    ],

    [
      "Obligations Created",
      resultValue(
        result,
        "obligations_created"
      )
    ],

    [
      "Total Due",
      formatMoney(
        resultValue(
          result,
          "total_due"
        )
      )
    ],

    [
      "Total Allocated",
      formatMoney(
        resultValue(
          result,
          "total_allocated"
        )
      )
    ],

    [
      "Arrears",
      formatMoney(
        resultValue(
          result,
          "arrears"
        )
      )
    ],

    [
      "Credit",
      formatMoney(
        resultValue(
          result,
          "credit"
        )
      )
    ],

    [
      "Status",
      resultValue(
        result,
        "contribution_status",
        "status"
      ) ||
      "Created"
    ]

  ];


  for (
    const [
      label,
      value
    ]
    of values
  ) {

    const item =
      document.createElement(
        "div"
      );

    item.className =
      "add-member-result-item";


    const labelElement =
      document.createElement(
        "span"
      );

    labelElement.textContent =
      label;


    const valueElement =
      document.createElement(
        "strong"
      );

    valueElement.textContent =
      value == null
        ? "—"
        : String(value);


    item.append(
      labelElement,
      valueElement
    );


    summary.appendChild(
      item
    );

  }


  /*
   * Success state is now explicit:
   *
   *   form    -> hidden
   *   success -> visible
   *
   * This prevents an empty form and old success card from
   * being displayed simultaneously.
   */

  form.hidden =
    true;

  success.hidden =
    false;


  success.scrollIntoView({
    behavior:
      "smooth",
    block:
      "start"
  });

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


/* =========================================================
   SUBMIT ENABLEMENT
========================================================= */

function updateSubmitState() {

  const button =
    $("addMemberSubmit");


  if (!button) {
    return;
  }


  const validation =
    validateForm();


  button.disabled =
    state.submitting ||
    Boolean(validation) ||
    !state.monthlyType;

}


/* =========================================================
   LIVE FORM UPDATE
========================================================= */

function updateFormPreview() {

  updatePositionFields();

  renderObligationPreview();

  renderHistoricalPreview();

  renderReview();

  updateSubmitState();

}


/* =========================================================
   ADD ANOTHER MEMBER
========================================================= */

function resetForAnotherMember(
  event
) {

  if (event) {
    event.preventDefault();
  }


  const form =
    $("addMemberForm");

  if (!form) {
    return;
  }


  /*
   * The previous request has already succeeded.
   * The next member must receive a fresh request UUID.
   */

  state.requestId =
    createRequestId();


  state.submitting =
    false;


  /*
   * Reset native form values first.
   */

  form.reset();


  /*
   * Explicitly close historical onboarding.
   * <details> state is not guaranteed to be reset by
   * HTMLFormElement.reset().
   */

  const historical =
    $("addMemberHistoricalDetails");

  if (historical) {
    historical.open =
      false;
  }


  /*
   * Remove the old success state before showing the form.
   */

  clearSuccessSummary();

  clearMessage();

  hideSuccessState();


  /*
   * Reapply CHAMA LIVE smart defaults.
   */

  applyDefaults();


  /*
   * The Monthly contribution type belongs to the group
   * and therefore remains loaded. It does NOT need to be
   * fetched again.
   */

  renderMonthlyType();

  updatePositionFields();

  renderObligationPreview();

  renderHistoricalPreview();

  renderReview();

  updateSubmitState();


  /*
   * Return the user to the first member-identification
   * field.
   */

  const memberNumber =
    $("addMemberNumber");

  if (memberNumber) {

    memberNumber.focus();

  }


  window.scrollTo({
    top:
      0,
    behavior:
      "smooth"
  });

}


/* =========================================================
   FORM EVENTS
========================================================= */

function bindFormEvents() {

  const form = $("addMemberForm");

  if (!form) {
    return;
  }

  if (form.dataset.addMemberEventsBound === "true") {
    return;
  }

  form.dataset.addMemberEventsBound = "true";

  form.addEventListener("submit", handleSubmit);

  form.addEventListener("input", updateFormPreview);

  form.addEventListener("change", updateFormPreview);

  const historical = $("addMemberHistoricalDetails");

  if (historical) {
    historical.addEventListener("toggle", updateFormPreview);
  }

  const another = $("addMemberAnother");

  if (another) {
    another.addEventListener("click", resetForAnotherMember);
  }

}


/* =========================================================
   SUBMIT
========================================================= */

async function handleSubmit(
  event
) {

  event.preventDefault();


  if (
    state.submitting
  ) {

    return;

  }


  clearMessage();


  const validation =
    validateForm();


  if (validation) {

    showMessage(
      validation
    );

    return;

  }


  if (
    !state.requestId
  ) {

    state.requestId =
      createRequestId();

  }


  const pMember =
    buildMemberPayload();


  const pContributionPlan =
    buildContributionPlan();


  const historicalEnabled =
    isHistoricalEnabled();


  const pHistorical =
    historicalEnabled
      ? buildHistoricalPayload()
      : null;


  /*
   * IMPORTANT:
   * Do not generate a new request ID here.
   *
   * If the RPC fails, retry must reuse the same ID.
   */

  const requestId =
    state.requestId;


  setSubmitting(
    true
  );


  try {

    const {
      data,
      error
    } =
      await createMember({

        pMember,

        pContributionPlan,

        historicalEnabled,

        pHistorical,

        requestId

      });


    if (error) {

      throw error;

    }


    const result =
      normaliseRpcResult(
        data
      );


    if (!result) {

      throw new Error(
        "The member creation RPC completed without returning the expected member result."
      );

    }


    /*
     * The request succeeded.
     *
     * Keep the request ID unchanged until the user
     * explicitly chooses Add Another Member.
     */

    setSubmitting(
      false
    );


    renderSuccess(
      result
    );

  }

  catch (error) {

    /*
     * Always log the complete raw backend error for
     * debugging. The user receives the mapped message.
     */

    console.error(
      "[CHAMA LIVE] Add Member RPC failed:",
      error
    );


    setSubmitting(
      false
    );


    const mapped =
      mapRpcError(
        error
      );


    showMessage(
      mapped.message,
      mapped.details
    );


    updateSubmitState();

  }

}


/* =========================================================
   LOAD MONTHLY TYPE
========================================================= */

async function initialiseMonthlyType() {

  const types =
    await loadContributionTypes(
      state.groupId
    );


  state.monthlyType =
    findMonthlyContributionType(
      types
    );


  if (!state.monthlyType?.id) {

    throw new Error(
      "The group's Monthly contribution type could not be found."
    );

  }


  renderMonthlyType();

}


/* =========================================================
   AUTHORISATION
========================================================= */

async function initialiseAccess() {

  await requireAuth();


  const context =
    await getMyApplicationContext();


  if (!context?.user?.id) {

    const error =
      new Error(
        "AUTHENTICATION_REQUIRED"
      );

    error.code =
      "AUTHENTICATION_REQUIRED";

    throw error;

  }


  if (!context?.group?.id) {

    const error =
      new Error(
        "Your group could not be resolved."
      );

    error.code =
      "GROUP_NOT_RESOLVED";

    throw error;

  }


  const memberStatus =
    String(
      context?.member?.status ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    memberStatus !==
    "active"
  ) {

    const error =
      new Error(
        "ACTIVE_GROUP_MEMBER_REQUIRED"
      );

    error.code =
      "ACTIVE_GROUP_MEMBER_REQUIRED";

    throw error;

  }


  state.context =
    context;

  state.groupId =
    context.group.id;


  const allowed =
    await canManageMembers(
      state.groupId
    );


  if (!allowed) {

    const error =
      new Error(
        "MEMBER_MANAGEMENT_NOT_AUTHORIZED"
      );

    error.code =
      "MEMBER_MANAGEMENT_NOT_AUTHORIZED";

    throw error;

  }


  return context;

}


/* =========================================================
   BFCACHE / PAGE RESTORE
   ---------------------------------------------------------
   Browsers can restore the page from back-forward cache
   without running the module again.

   If the restored page contains an old success result,
   return to a clean Add Member form.
========================================================= */

function bindPageRestoreHandler() {

  if (
    window.__chamaLiveAddMemberPageshowBound
  ) {

    return;

  }


  window.__chamaLiveAddMemberPageshowBound =
    true;


  window.addEventListener(
    "pageshow",
    (
      event
    ) => {

      if (!event.persisted) {
        return;
      }


      /*
       * Do not rerun authorisation or reload the group
       * contribution type unnecessarily.
       *
       * Just restore the page to a clean creation state.
       */

      if (
        !document.body
          .dataset
          .addMemberInitialised
      ) {

        return;

      }


      resetPageState({
        generateRequestId:
          true
      });


      applyDefaults();

      renderMonthlyType();

      updatePositionFields();

      renderObligationPreview();

      renderHistoricalPreview();

      renderReview();

      updateSubmitState();

    }
  );

}


/* =========================================================
   INIT
   ---------------------------------------------------------
   admin-layout.js calls this function.
========================================================= */

export async function addMemberInit() {

  /*
   * Protect against duplicate initialisation from the
   * shared admin layout.
   */

  if (
    state.initialised
  ) {

    return;

  }


  /*
   * IMPORTANT:
   * Clear any stale success state BEFORE loading the page.
   *
   * This prevents:
   *
   *   empty form
   *   +
   *   "Member added successfully"
   *
   * from appearing together.
   */

  resetPageState({
    generateRequestId:
      true
  });


  bindPageRestoreHandler();


  setPageLoading(
    true
  );


  try {

    await initialiseAccess();


    /*
     * The request ID was already generated during the
     * clean page-state reset. Do not generate another one.
     */


    applyDefaults();


    try {

      await initialiseMonthlyType();

    }

    catch (error) {

      console.error(
        "[CHAMA LIVE] Monthly contribution type initialisation failed:",
        error
      );


      const mapped =
        mapRpcError(
          error
        );


      renderMonthlyTypeError(
        mapped
      );

    }


    bindFormEvents();

    updatePositionFields();

    renderObligationPreview();

    renderHistoricalPreview();

    renderReview();

    updateSubmitState();


    showWorkspace();

    state.initialised =
      true;

    document.body.dataset
      .addMemberInitialised =
      "true";

  }

  catch (error) {

    console.error(
      "[CHAMA LIVE] Add Member access initialisation failed:",
      error
    );


    const mapped =
      mapRpcError(
        error
      );


    showAccessError(
      mapped
    );

  }

  finally {

    setPageLoading(
      false
    );

  }

}


/* =========================================================
   COMPATIBILITY EXPORT
   ---------------------------------------------------------
   Allows admin-layout.js to resolve either the dedicated
   initializer or the generic initPage name.
========================================================= */

export const initPage =
  addMemberInit;
