/* =========================================================
   CHAMA LIVE — ADD MEMBER PAGE

   IMPORTANT
   ---------------------------------------------------------
   This is a NEW standalone Add Member feature.

   It does not:
   - import members.js
   - import membersApi
   - depend on old members element IDs
   - directly write accounting tables
   - create members through table INSERTs

   admin-layout.js is the sole page boot owner.
========================================================= */

import {
  requireAuth,
  getMyApplicationContext
} from "./auth.js";

import {
  supabase
} from "./supabase.js";

import {
  loadAddMemberMonthlyType,
  checkAddMemberPermission,
  buildAddMemberPayload,
  createMemberWithPlan,
  createMemberWithHistorical
} from "./add-member-rpc.js";

import {
  mapRpcError
} from "./add-member-errors.js";


let addMemberContext = null;

let addMemberMonthlyType = null;

let addMemberRequestId = null;

let addMemberSubmitting = false;


/* =========================================================
   DOM
========================================================= */

const $ =
  (id) =>
    document.getElementById(id);


/* =========================================================
   LOCAL DATE HELPERS
   ---------------------------------------------------------
   Do not use UTC conversion for form date defaults.
========================================================= */

function addMemberToday() {

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


function addMemberMonthStart(
  value
) {

  if (!value) {

    return null;

  }


  const match =
    String(value).match(
      /^(\d{4})-(\d{2})/
    );


  if (!match) {

    return null;

  }


  return `${match[1]}-${match[2]}-01`;

}


function addMemberMonthLabel(
  value
) {

  if (!value) {

    return "—";

  }


  const date =
    new Date(
      `${value.slice(0, 7)}-01T00:00:00`
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return value;

  }


  return new Intl.DateTimeFormat(
    "en-GB",
    {
      month: "long",
      year: "numeric"
    }
  ).format(
    date
  );

}


/* =========================================================
   MONTH ARITHMETIC
========================================================= */

function addMemberMonthIndex(
  value
) {

  const match =
    String(value).match(
      /^(\d{4})-(\d{2})/
    );


  if (!match) {

    return null;

  }


  return (
    Number(match[1]) * 12 +
    (
      Number(match[2]) - 1
    )
  );

}


function addMemberIndexToMonth(
  index
) {

  const year =
    Math.floor(
      index / 12
    );

  const month =
    (
      index % 12
    ) + 1;

  return (
    `${year}-` +
    String(month).padStart(
      2,
      "0"
    ) +
    "-01"
  );

}


function addMemberInclusiveMonthCount(
  firstMonth,
  lastMonth
) {

  const first =
    addMemberMonthIndex(
      firstMonth
    );

  const last =
    addMemberMonthIndex(
      lastMonth
    );


  if (
    first === null ||
    last === null ||
    last < first
  ) {

    return 0;

  }


  return (
    last -
    first +
    1
  );

}


/* =========================================================
   BACKEND-MATCHING FIRST HISTORICAL MONTH
========================================================= */

function addMemberFirstHistoricalMonth(
  joinDate,
  effectiveFrom,
  firstPeriodRule
) {

  const joinMonth =
    addMemberMonthStart(
      joinDate
    );

  const effectiveMonth =
    addMemberMonthStart(
      effectiveFrom ||
      joinDate
    );


  if (
    !joinMonth ||
    !effectiveMonth
  ) {

    return null;

  }


  if (
    firstPeriodRule ===
      "next_full_period" &&
    effectiveMonth ===
      joinMonth
  ) {

    const index =
      addMemberMonthIndex(
        joinMonth
      );

    return addMemberIndexToMonth(
      index + 1
    );

  }


  const joinIndex =
    addMemberMonthIndex(
      joinMonth
    );

  const effectiveIndex =
    addMemberMonthIndex(
      effectiveMonth
    );


  return addMemberIndexToMonth(
    Math.max(
      joinIndex,
      effectiveIndex
    )
  );

}


/* =========================================================
   HTML SAFETY
========================================================= */

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


/* =========================================================
   PAGE STATUS
========================================================= */

function setPageLoading(
  loading
) {

  const element =
    $("addMemberLoading");


  if (!element) {

    return;

  }


  element.hidden =
    !loading;

}


function showAccessError(
  message
) {

  const box =
    $("addMemberAccessError");


  if (!box) {

    return;

  }


  box.hidden =
    false;

  box.textContent =
    message;

}


function showMessage(
  message,
  details = "",
  type = "error"
) {

  const box =
    $("addMemberMessage");


  if (!box) {

    return;

  }


  box.className =
    `add-member-alert add-member-alert-${type}`;


  box.replaceChildren();


  const main =
    document.createElement(
      "div"
    );

  main.textContent =
    message;


  box.appendChild(
    main
  );


  if (details) {

    const detailsElement =
      document.createElement(
        "small"
      );

    detailsElement.className =
      "details";

    detailsElement.textContent =
      details;

    box.appendChild(
      detailsElement
    );

  }


  box.hidden =
    false;

}


function clearMessage() {

  const box =
    $("addMemberMessage");


  if (!box) {

    return;

  }


  box.hidden =
    true;

  box.replaceChildren();

}


/* =========================================================
   FIELD VALUE
========================================================= */

function value(
  id
) {

  return String(
    $(id)?.value ||
    ""
  ).trim();

}


/* =========================================================
   FORM DEFAULTS
========================================================= */

function applyDefaults() {

  const today =
    addMemberToday();


  $("addMemberJoinDate").value =
    today;

  $("addMemberContributionEffectiveFrom").value =
    today;

  $("addMemberPositionEffectiveFrom").value =
    today;

  $("addMemberFirstPeriodRule").value =
    "full_period";

  $("addMemberFrequency").value =
    "monthly";

  $("addMemberRuleStatus").value =
    "active";

  $("addMemberRole").value =
    "member";

  $("addMemberStatus").value =
    "active";

  $("addMemberOnboardingStatus").value =
    "pending";

  $("addMemberHistoricalPaidThrough").value =
    "";

  $("addMemberHistoricalAmount").value =
    "";

  $("addMemberHistoricalPaymentMethod").value =
    "M-Pesa";

}


/* =========================================================
   POSITION UI
========================================================= */

function updatePositionUI() {

  const position =
    value(
      "addMemberActualPosition"
    );


  const wrap =
    $("addMemberPositionNameWrap");


  const input =
    $("addMemberActualPositionName");


  const enabled =
    position === "other";


  if (wrap) {

    wrap.hidden =
      !enabled;

  }


  if (input) {

    input.required =
      enabled;

    if (!enabled) {

      input.value =
        "";

    }

  }


  updateReview();

}


/* =========================================================
   DATE DEFAULT SYNC
========================================================= */

function syncDateDefaults() {

  const joinDate =
    value(
      "addMemberJoinDate"
    );


  if (!joinDate) {

    return;

  }


  const effective =
    $("addMemberContributionEffectiveFrom");


  const positionEffective =
    $("addMemberPositionEffectiveFrom");


  if (
    effective &&
    !effective.value
  ) {

    effective.value =
      joinDate;

  }


  if (
    positionEffective &&
    !positionEffective.value
  ) {

    positionEffective.value =
      joinDate;

  }


  effective?.setAttribute(
    "min",
    joinDate
  );

  positionEffective?.setAttribute(
    "min",
    joinDate
  );


  updatePreviews();

}


/* =========================================================
   HISTORICAL DETAILS
========================================================= */

function historicalEnabled() {

  return Boolean(
    $("addMemberHistoricalDetails")?.open
  );

}


/* =========================================================
   PREVIEW
========================================================= */

function updatePreviews() {

  const joinDate =
    value(
      "addMemberJoinDate"
    );

  const effectiveFrom =
    value(
      "addMemberContributionEffectiveFrom"
    ) ||
    joinDate;

  const firstPeriodRule =
    value(
      "addMemberFirstPeriodRule"
    ) ||
    "full_period";

  const amount =
    Number(
      value(
        "addMemberContributionAmount"
      )
    );


  const firstMonth =
    addMemberFirstHistoricalMonth(
      joinDate,
      effectiveFrom,
      firstPeriodRule
    );


  const obligationPreview =
    $("addMemberObligationPreview");


  if (obligationPreview) {

    if (!firstMonth) {

      obligationPreview.textContent =
        "Enter a valid join date and contribution effective date to preview the first obligation month.";

    }
    else {

      obligationPreview.innerHTML =
        `<strong>First obligation month:</strong> ${escapeHtml(addMemberMonthLabel(firstMonth))}`;

    }

  }


  const historicalAmount =
    $("addMemberHistoricalAmount");


  if (historicalAmount) {

    historicalAmount.value =
      Number.isFinite(amount) &&
      amount > 0
        ? amount.toFixed(2)
        : "";

  }


  const paidThrough =
    value(
      "addMemberHistoricalPaidThrough"
    );


  const historicalPreview =
    $("addMemberHistoricalPreview");


  if (!historicalPreview) {

    updateReview();

    return;

  }


  if (!historicalEnabled()) {

    historicalPreview.textContent =
      "Open this section to enable historical contribution onboarding.";

    updateReview();

    return;

  }


  if (!paidThrough) {

    historicalPreview.textContent =
      "Choose the month through which historical payments have been made.";

    updateReview();

    return;

  }


  const paidThroughDate =
    addMemberMonthStart(
      paidThrough
    );


  const todayMonth =
    addMemberMonthStart(
      addMemberToday()
    );


  if (
    paidThroughDate >
    todayMonth
  ) {

    historicalPreview.textContent =
      "Paid Through cannot be in the future.";

    updateReview();

    return;

  }


  if (!firstMonth) {

    historicalPreview.textContent =
      "Enter a valid join date and contribution effective date first.";

    updateReview();

    return;

  }


  const months =
    addMemberInclusiveMonthCount(
      firstMonth,
      paidThroughDate
    );


  if (months <= 0) {

    historicalPreview.textContent =
      `Paid Through must reach ${addMemberMonthLabel(firstMonth)}, the first historical obligation month.`;

    updateReview();

    return;

  }


  historicalPreview.innerHTML =
    `<strong>${months} historical month${months === 1 ? "" : "s"}</strong> will be onboarded from ${escapeHtml(addMemberMonthLabel(firstMonth))} through ${escapeHtml(addMemberMonthLabel(paidThroughDate))}.`;

  updateReview();

}


/* =========================================================
   REVIEW
========================================================= */

function reviewItem(
  label,
  content
) {

  return `
    <div class="add-member-review-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(content || "—")}</strong>
    </div>
  `;

}


function updateReview() {

  const review =
    $("addMemberReview");


  if (!review) {

    return;

  }


  const joinDate =
    value(
      "addMemberJoinDate"
    );

  const effectiveFrom =
    value(
      "addMemberContributionEffectiveFrom"
    ) ||
    joinDate;

  const firstMonth =
    addMemberFirstHistoricalMonth(
      joinDate,
      effectiveFrom,
      value(
        "addMemberFirstPeriodRule"
      )
    );


  const historical =
    historicalEnabled();


  const paidThrough =
    value(
      "addMemberHistoricalPaidThrough"
    );


  const historicalMonths =
    historical
      ? addMemberInclusiveMonthCount(
          firstMonth,
          addMemberMonthStart(
            paidThrough
          )
        )
      : 0;


  review.innerHTML = [

    reviewItem(
      "Member Number",
      value(
        "addMemberNumber"
      )
    ),

    reviewItem(
      "Membership Number",
      value(
        "addMembershipNumber"
      )
    ),

    reviewItem(
      "Name",
      value(
        "addMemberName"
      )
    ),

    reviewItem(
      "Role",
      value(
        "addMemberRole"
      )
    ),

    reviewItem(
      "Join Date",
      joinDate
    ),

    reviewItem(
      "Monthly Amount",
      value(
        "addMemberContributionAmount"
      )
        ? `KSh ${Number(value("addMemberContributionAmount")).toFixed(2)}`
        : ""
    ),

    reviewItem(
      "First Obligation",
      firstMonth
        ? addMemberMonthLabel(
            firstMonth
          )
        : ""
    ),

    reviewItem(
      "Historical",
      historical
        ? `${historicalMonths} month${historicalMonths === 1 ? "" : "s"}`
        : "No"
    )

  ].join("");

}


/* =========================================================
   CLIENT VALIDATION
========================================================= */

function validateForm() {

  const memberNumber =
    value(
      "addMemberNumber"
    );

  const membershipNumber =
    value(
      "addMembershipNumber"
    );

  const name =
    value(
      "addMemberName"
    );

  const phone =
    value(
      "addMemberPhone"
    );

  const joinDate =
    value(
      "addMemberJoinDate"
    );

  const position =
    value(
      "addMemberActualPosition"
    );

  const positionName =
    value(
      "addMemberActualPositionName"
    );

  const positionEffective =
    value(
      "addMemberPositionEffectiveFrom"
    );

  const amount =
    Number(
      value(
        "addMemberContributionAmount"
      )
    );

  const effectiveFrom =
    value(
      "addMemberContributionEffectiveFrom"
    );

  const effectiveTo =
    value(
      "addMemberContributionEffectiveTo"
    );

  const firstPeriodRule =
    value(
      "addMemberFirstPeriodRule"
    );

  const ruleStatus =
    value(
      "addMemberRuleStatus"
    );


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


  if (
    position === "other" &&
    !positionName
  ) {

    return "Enter the position name when Actual Position is Other.";

  }


  if (
    position &&
    positionEffective &&
    positionEffective < joinDate
  ) {

    return "The position effective date cannot be before the member's join date.";

  }


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    return "Monthly contribution amount must be greater than zero.";

  }


  if (!effectiveFrom) {

    return "Contribution effective date is required.";

  }


  if (
    effectiveFrom < joinDate
  ) {

    return "The contribution effective date cannot be before the member's join date.";

  }


  if (
    effectiveTo &&
    effectiveTo < effectiveFrom
  ) {

    return "Contribution Effective To cannot be before Effective From.";

  }


  if (
    ![
      "full_period",
      "next_full_period"
    ].includes(
      firstPeriodRule
    )
  ) {

    return "Select a valid first-period rule.";

  }


  if (
    ![
      "active",
      "inactive",
      "ended"
    ].includes(
      ruleStatus
    )
  ) {

    return "Select a valid contribution rule status.";

  }


  if (
    ruleStatus === "ended" &&
    !effectiveTo
  ) {

    return "An ended contribution rule must have an Effective To date.";

  }


  if (
    $("addMemberEmail")?.value &&
    !$("addMemberEmail").checkValidity()
  ) {

    return "Enter a valid email address.";

  }


  if (
    historicalEnabled()
  ) {

    const paidThrough =
      value(
        "addMemberHistoricalPaidThrough"
      );


    if (!paidThrough) {

      return "Historical Paid Through is required.";

    }


    const paidThroughDate =
      addMemberMonthStart(
        paidThrough
      );


    const currentMonth =
      addMemberMonthStart(
        addMemberToday()
      );


    if (
      paidThroughDate >
      currentMonth
    ) {

      return "Historical Paid Through cannot be in the future.";

    }


    const firstMonth =
      addMemberFirstHistoricalMonth(
        joinDate,
        effectiveFrom,
        firstPeriodRule
      );


    if (!firstMonth) {

      return "The first historical obligation month could not be calculated.";

    }


    if (
      addMemberMonthIndex(
        paidThroughDate
      ) <
      addMemberMonthIndex(
        firstMonth
      )
    ) {

      return `Paid Through must reach ${addMemberMonthLabel(firstMonth)}, the first historical obligation month.`;

    }

  }


  return null;

}


/* =========================================================
   PAYLOAD VALUES
========================================================= */

function collectValues() {

  const amount =
    Number(
      value(
        "addMemberContributionAmount"
      )
    );


  const historical =
    historicalEnabled();


  return {

    member_number:
      value(
        "addMemberNumber"
      ),

    membership_number:
      value(
        "addMembershipNumber"
      ),

    name:
      value(
        "addMemberName"
      ),

    phone:
      value(
        "addMemberPhone"
      ),

    email:
      value(
        "addMemberEmail"
      ),

    national_id:
      value(
        "addMemberNationalId"
      ),

    role:
      value(
        "addMemberRole"
      ),

    status:
      value(
        "addMemberStatus"
      ),

    onboarding_status:
      value(
        "addMemberOnboardingStatus"
      ),

    join_date:
      value(
        "addMemberJoinDate"
      ),

    actual_position:
      value(
        "addMemberActualPosition"
      ),

    actual_position_name:
      value(
        "addMemberActualPositionName"
      ),

    actual_position_effective_from:
      value(
        "addMemberPositionEffectiveFrom"
      ),

    contribution_type_id:
      addMemberMonthlyType?.id,

    amount,

    effective_from:
      value(
        "addMemberContributionEffectiveFrom"
      ),

    effective_to:
      value(
        "addMemberContributionEffectiveTo"
      ),

    first_period_rule:
      value(
        "addMemberFirstPeriodRule"
      ),

    rule_status:
      value(
        "addMemberRuleStatus"
      ),

    historical_enabled:
      historical,

    paid_through:
      historical
        ? addMemberMonthStart(
            value(
              "addMemberHistoricalPaidThrough"
            )
          )
        : null,

    payment_method:
      value(
        "addMemberHistoricalPaymentMethod"
      )

  };

}


/* =========================================================
   SUBMIT BUTTON
========================================================= */

function setSubmitting(
  submitting
) {

  addMemberSubmitting =
    submitting;


  const button =
    $("addMemberSubmit");


  if (!button) {

    return;

  }


  button.disabled =
    submitting ||
    !addMemberMonthlyType;


  button.textContent =
    submitting
      ? "Adding Member…"
      : "Add Member";

}


/* =========================================================
   SUCCESS NORMALIZATION
========================================================= */

function normalizeResult(
  data,
  historical
) {

  if (!historical) {

    const row =
      Array.isArray(data)
        ? data[0]
        : data;


    return row || {};

  }


  const outer =
    data || {};


  if (
    outer.result &&
    typeof outer.result === "object"
  ) {

    return outer.result;

  }


  return outer;

}


/* =========================================================
   RESULT RENDER
========================================================= */

function renderSuccess(
  result
) {

  const summary =
    $("addMemberSuccessSummary");


  if (!summary) {

    return;

  }


  const contributionStatus =
    result.contribution_status ||
    result.status ||
    "—";


  summary.innerHTML = [

    [
      "Member Number",
      result.member_number
    ],

    [
      "Membership Number",
      result.membership_number
    ],

    [
      "Status",
      contributionStatus
    ],

    [
      "Obligations Created",
      result.obligations_created
    ],

    [
      "Total Due",
      formatMoney(
        result.total_due
      )
    ],

    [
      "Allocated",
      formatMoney(
        result.total_allocated
      )
    ],

    [
      "Arrears",
      formatMoney(
        result.arrears
      )
    ],

    [
      "Credit",
      formatMoney(
        result.credit
      )
    ]

  ]
    .map(
      ([label, content]) =>
        `
          <div class="add-member-result-item">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(content)}</strong>
          </div>
        `
    )
    .join("");

}


/* =========================================================
   MONEY
========================================================= */

function formatMoney(
  amount
) {

  const value =
    Number(
      amount
    );


  if (
    !Number.isFinite(value)
  ) {

    return "KSh 0.00";

  }


  return (
    "KSh " +
    value.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits:
          2,
        maximumFractionDigits:
          2
      }
    )
  );

}


/* =========================================================
   SUCCESS FLOW
========================================================= */

function showSuccess(
  result
) {

  $("addMemberForm").hidden =
    true;

  $("addMemberSuccess").hidden =
    false;

  renderSuccess(
    result
  );


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* =========================================================
   RESET FORM
   ---------------------------------------------------------
   A new request UUID is generated only after success/reset.
========================================================= */

function resetForAnotherMember() {

  $("addMemberForm").reset();

  $("addMemberForm").hidden =
    false;

  $("addMemberSuccess").hidden =
    true;

  clearMessage();


  applyDefaults();


  addMemberRequestId =
    crypto.randomUUID();


  const details =
    $("addMemberHistoricalDetails");


  if (details) {

    details.open =
      false;

  }


  updatePositionUI();

  updatePreviews();

  updateReview();

  setSubmitting(
    false
  );


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* =========================================================
   SUBMIT
========================================================= */

async function handleSubmit(
  event
) {

  event.preventDefault();


  if (
    addMemberSubmitting
  ) {

    return;

  }


  clearMessage();


  const validationError =
    validateForm();


  if (validationError) {

    showMessage(
      validationError
    );

    return;

  }


  if (
    !addMemberMonthlyType?.id
  ) {

    showMessage(
      "The group's Monthly contribution type has not loaded yet."
    );

    return;

  }


  if (
    !addMemberContext?.group?.id
  ) {

    showMessage(
      "Your group could not be resolved."
    );

    return;

  }


  setSubmitting(
    true
  );


  try {

    const values =
      collectValues();


    const payload =
      buildAddMemberPayload(
        values
      );


    let response;


    if (
      values.historical_enabled
    ) {

      response =
        await createMemberWithHistorical(
          payload,
          addMemberRequestId
        );

    }
    else {

      response =
        await createMemberWithPlan(
          payload
        );

    }


    if (
      response?.error
    ) {

      throw response.error;

    }


    const result =
      normalizeResult(
        response?.data,
        values.historical_enabled
      );


    showMessage(
      "Member added successfully.",
      "",
      "success"
    );


    showSuccess(
      result
    );

  }

  catch (error) {

    const mapped =
      mapRpcError(
        error
      );


    showMessage(
      mapped.message,
      mapped.details,
      "error"
    );

  }

  finally {

    setSubmitting(
      false
    );

  }

}


/* =========================================================
   PERMISSION / MONTHLY TYPE UI
========================================================= */

async function loadPageContext() {

  setPageLoading(
    true
  );


  try {

    /*
     * Authentication guard.
     *
     * The helper redirects to login if the authenticated
     * user cannot be established.
     */

    await requireAuth();


    addMemberContext =
      await getMyApplicationContext();


    const groupId =
      addMemberContext?.group?.id;


    if (!groupId) {

      throw new Error(
        "Your group could not be resolved."
      );

    }


    if (
      String(
        addMemberContext?.member?.status ||
        ""
      )
        .trim()
        .toLowerCase() !==
      "active"
    ) {

      showAccessError(
        "An active group membership is required to add a member."
      );

      return;

    }


    /*
     * Backend-owned permission check.
     */

    const canManage =
      await checkAddMemberPermission(
        groupId
      );


    if (!canManage) {

      showAccessError(
        "Access denied. Only an authorised group manager can add members."
      );

      return;

    }


    /*
     * Load the group's canonical Monthly type.
     */

    addMemberMonthlyType =
      await loadAddMemberMonthlyType(
        groupId
      );


    if (
      !addMemberMonthlyType?.id
    ) {

      throw new Error(
        "CONTRIBUTION_TYPE_NOT_SUPPORTED"
      );

    }


    $("addMemberMonthlyTypeName").textContent =
      addMemberMonthlyType.name ||
      "Monthly";


    $("addMemberMonthlyTypeId").textContent =
      addMemberMonthlyType.id;


    const typeStatus =
      $("addMemberMonthlyTypeStatus");


    if (typeStatus) {

      typeStatus.textContent =
        "Ready";

      typeStatus.style.background =
        "var(--cl-success-soft)";

      typeStatus.style.color =
        "#047857";

    }


    applyDefaults();

    bindEvents();

    updatePositionUI();

    updatePreviews();

    updateReview();


    $("addMemberWorkspace").hidden =
      false;

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: Add Member page initialization failed.",
      error
    );


    const mapped =
      mapRpcError(
        error
      );


    showAccessError(
      mapped.message
    );

  }

  finally {

    setPageLoading(
      false
    );

  }

}


/* =========================================================
   EVENT BINDING
========================================================= */

function bindEvents() {

  const form =
    $("addMemberForm");


  if (
    form?.dataset.addMemberBound ===
    "true"
  ) {

    return;

  }


  if (!form) {

    throw new Error(
      "Add Member form was not found."
    );

  }


  form.dataset.addMemberBound =
    "true";


  form.addEventListener(
    "submit",
    handleSubmit
  );


  $("addMemberActualPosition")
    ?.addEventListener(
      "change",
      updatePositionUI
    );


  $("addMemberJoinDate")
    ?.addEventListener(
      "change",
      syncDateDefaults
    );


  [

    "addMemberContributionEffectiveFrom",

    "addMemberContributionEffectiveTo",

    "addMemberFirstPeriodRule",

    "addMemberContributionAmount",

    "addMemberHistoricalPaidThrough",

    "addMemberHistoricalPaymentMethod",

    "addMemberNumber",

    "addMembershipNumber",

    "addMemberName",

    "addMemberRole",

    "addMemberStatus",

    "addMemberOnboardingStatus"

  ]
    .forEach(
      id => {

        $(id)?.addEventListener(
          "input",
          () => {

            updatePreviews();

            updateReview();

          }
        );


        $(id)?.addEventListener(
          "change",
          () => {

            updatePreviews();

            updateReview();

          }
        );

      }
    );


  $("addMemberHistoricalDetails")
    ?.addEventListener(
      "toggle",
      () => {

        updatePreviews();

        updateReview();

      }
    );


  $("addMemberAnother")
    ?.addEventListener(
      "click",
      resetForAnotherMember
    );

}


/* =========================================================
   PUBLIC PAGE INITIALIZER
========================================================= */

export async function initPage() {

  /*
   * Exactly one UUID is generated when the form is opened.
   * It remains unchanged across retries.
   */

  addMemberRequestId =
    crypto.randomUUID();


  await loadPageContext();

}
