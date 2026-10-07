/* =========================================================
   CHAMA LIVE — ADD MEMBER
   Canonical member creation frontend
   =========================================================
   FILE:
     /js/add-member.js

   DEPENDENCIES:
     ./supabase.js
     ./auth.js
     ./add-member-rpc.js
     ./add-member-errors.js

   ACCOUNTING BOUNDARY
   -------------------
   This page never directly writes to:
     contributions
     contribution_allocations
     contribution_obligations

   Member/accounting creation is delegated to the canonical
   backend RPCs exposed by add-member-rpc.js.

   IMPORTANT
   ---------
   This file does NOT import or depend on the old members.js.
   ========================================================= */

import {
  getMyApplicationContext,
  requireAuth
} from "./auth.js";

import {
  loadMonthlyContributionType,
  checkCanManageMembers,
  createMember,
  createMemberWithHistorical
} from "./add-member-rpc.js";

import {
  mapRpcError
} from "./add-member-errors.js";


/* =========================================================
   STATE
========================================================= */

const state = {
  initialized: false,
  submitting: false,
  groupId: null,
  userId: null,
  monthlyType: null,
  requestId: null
};


/* =========================================================
   DOM
========================================================= */

const dom = {};


/* =========================================================
   INITIALIZATION
========================================================= */

export async function addMemberInit() {
  cacheDom();

  /*
   * Always normalize the page before doing anything else.
   *
   * This is important when the browser restores the page from
   * bfcache/history after a previous successful submission.
   */
  resetPageState();

  state.initialized = true;

  bindEvents();

  setDefaultDates();

  try {
    await initializePage();
  } catch (error) {
    console.error("CHAMA LIVE Add Member initialization error:", error);

    showAccessError(
      mapRpcError(error)
    );
  }
}


/*
 * Compatibility export.
 *
 * admin-layout.js currently resolves addMemberInit, but keeping
 * initPage makes this module safe if the shared loader falls
 * back to the standard initializer name.
 */
export const initPage = addMemberInit;


/* =========================================================
   DOM CACHE
========================================================= */

function cacheDom() {
  dom.loading = document.getElementById("addMemberLoading");
  dom.accessError = document.getElementById("addMemberAccessError");
  dom.workspace = document.getElementById("addMemberWorkspace");

  dom.message = document.getElementById("addMemberMessage");

  dom.form = document.getElementById("addMemberForm");

  dom.memberNumber = document.getElementById("addMemberNumber");
  dom.membershipNumber = document.getElementById(
    "addMembershipNumber"
  );
  dom.name = document.getElementById("addMemberName");
  dom.phone = document.getElementById("addMemberPhone");
  dom.email = document.getElementById("addMemberEmail");
  dom.nationalId = document.getElementById("addMemberNationalId");
  dom.joinDate = document.getElementById("addMemberJoinDate");

  dom.role = document.getElementById("addMemberRole");
  dom.status = document.getElementById("addMemberStatus");
  dom.onboardingStatus = document.getElementById(
    "addMemberOnboardingStatus"
  );

  dom.actualPosition = document.getElementById(
    "addMemberActualPosition"
  );

  dom.positionNameWrap = document.getElementById(
    "addMemberPositionNameWrap"
  );

  dom.actualPositionName = document.getElementById(
    "addMemberActualPositionName"
  );

  dom.positionEffectiveFrom = document.getElementById(
    "addMemberPositionEffectiveFrom"
  );

  dom.monthlyTypeStatus = document.getElementById(
    "addMemberMonthlyTypeStatus"
  );

  dom.monthlyTypeName = document.getElementById(
    "addMemberMonthlyTypeName"
  );

  dom.monthlyTypeId = document.getElementById(
    "addMemberMonthlyTypeId"
  );

  dom.contributionAmount = document.getElementById(
    "addMemberContributionAmount"
  );

  dom.frequency = document.getElementById(
    "addMemberFrequency"
  );

  dom.contributionEffectiveFrom = document.getElementById(
    "addMemberContributionEffectiveFrom"
  );

  dom.contributionEffectiveTo = document.getElementById(
    "addMemberContributionEffectiveTo"
  );

  dom.firstPeriodRule = document.getElementById(
    "addMemberFirstPeriodRule"
  );

  dom.ruleStatus = document.getElementById(
    "addMemberRuleStatus"
  );

  dom.obligationPreview = document.getElementById(
    "addMemberObligationPreview"
  );

  dom.historicalDetails = document.getElementById(
    "addMemberHistoricalDetails"
  );

  dom.historicalPaidThrough = document.getElementById(
    "addMemberHistoricalPaidThrough"
  );

  dom.historicalPaymentMethod = document.getElementById(
    "addMemberHistoricalPaymentMethod"
  );

  dom.historicalAmount = document.getElementById(
    "addMemberHistoricalAmount"
  );

  dom.historicalPreview = document.getElementById(
    "addMemberHistoricalPreview"
  );

  dom.review = document.getElementById(
    "addMemberReview"
  );

  dom.submit = document.getElementById(
    "addMemberSubmit"
  );

  dom.success = document.getElementById(
    "addMemberSuccess"
  );

  dom.successSummary = document.getElementById(
    "addMemberSuccessSummary"
  );

  dom.another = document.getElementById(
    "addMemberAnother"
  );
}


/* =========================================================
   EVENT BINDING
========================================================= */

function bindEvents() {
  if (!dom.form) {
    throw new Error(
      "Add Member form was not found."
    );
  }

  dom.form.addEventListener(
    "submit",
    handleSubmit
  );

  dom.another?.addEventListener(
    "click",
    handleAddAnother
  );

  dom.actualPosition?.addEventListener(
    "change",
    handlePositionChange
  );

  dom.joinDate?.addEventListener(
    "change",
    handleDateChanges
  );

  dom.contributionEffectiveFrom?.addEventListener(
    "change",
    handleDateChanges
  );

  dom.contributionEffectiveTo?.addEventListener(
    "change",
    handleDateChanges
  );

  dom.firstPeriodRule?.addEventListener(
    "change",
    updatePreviews
  );

  dom.contributionAmount?.addEventListener(
    "input",
    handleAmountChange
  );

  dom.historicalPaidThrough?.addEventListener(
    "change",
    updatePreviews
  );

  dom.historicalPaymentMethod?.addEventListener(
    "change",
    updateReview
  );

  /*
   * Recalculate review and button state as the user types.
   */
  dom.form.addEventListener(
    "input",
    handleFormInput
  );

  dom.form.addEventListener(
    "change",
    handleFormInput
  );

  /*
   * Browser bfcache can restore the old success state.
   * pageshow fires when a page is restored from history.
   */
  window.addEventListener(
    "pageshow",
    handlePageShow
  );
}


/* =========================================================
   PAGE SHOW / BFCACHE
========================================================= */

function handlePageShow(event) {
  /*
   * persisted === true means the browser restored this page
   * from its back-forward cache.
   */
  if (event.persisted) {
    resetPageState();

    setDefaultDates();

    if (state.monthlyType) {
      populateMonthlyType(state.monthlyType);
    }

    updatePreviews();
    updateReview();
    updateSubmitState();
  }
}


/* =========================================================
   PAGE RESET
========================================================= */

function resetPageState() {
  /*
   * Never leave a previous success result visible when the
   * Add Member page starts or is reused.
   */
  dom.success?.setAttribute(
    "hidden",
    ""
  );

  dom.accessError?.setAttribute(
    "hidden",
    ""
  );

  dom.message?.setAttribute(
    "hidden",
    ""
  );

  dom.message?.classList.remove(
    "add-member-alert-error",
    "add-member-alert-success"
  );

  dom.successSummary &&
    (dom.successSummary.innerHTML = "");

  dom.review &&
    (dom.review.innerHTML = "");

  if (dom.form) {
    dom.form.hidden = false;
  }

  dom.workspace?.removeAttribute(
    "hidden"
  );

  if (dom.loading) {
    dom.loading.removeAttribute(
      "hidden"
    );
  }

  state.submitting = false;

  /*
   * A new form session gets a new idempotency request ID.
   * This is the only automatic generation during initial
   * form opening.
   */
  state.requestId =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : generateFallbackRequestId();

  setSubmitDisabled(true);
}


/* =========================================================
   INITIAL PAGE LOAD
========================================================= */

async function initializePage() {
  clearMessage();

  /*
   * Authentication.
   */
  const user = await requireAuth();

  if (!user?.id) {
    throw new Error(
      "AUTHENTICATION_REQUIRED"
    );
  }

  state.userId = user.id;

  /*
   * Application/group context.
   */
  const context =
    await getMyApplicationContext();

  const groupId =
    context?.group_id ||
    context?.groupId ||
    context?.group?.id ||
    null;

  if (!groupId) {
    throw new Error(
      "ACTIVE_GROUP_MEMBER_REQUIRED"
    );
  }

  state.groupId = groupId;

  /*
   * Backend authorization.
   */
  const canManage =
    await checkCanManageMembers(
      groupId
    );

  if (!canManage) {
    throw new Error(
      "MEMBER_MANAGEMENT_NOT_AUTHORIZED"
    );
  }

  /*
   * Load canonical Monthly contribution type.
   */
  state.monthlyType =
    await loadMonthlyContributionType(
      groupId
    );

  if (!state.monthlyType?.id) {
    throw new Error(
      "CONTRIBUTION_TYPE_NOT_IN_GROUP"
    );
  }

  populateMonthlyType(
    state.monthlyType
  );

  /*
   * Set defaults after backend data has loaded.
   */
  setDefaultDates();

  updateHistoricalAmount();

  updatePreviews();

  updateReview();

  updateSubmitState();

  dom.loading?.setAttribute(
    "hidden",
    ""
  );

  dom.workspace?.removeAttribute(
    "hidden"
  );
}


/* =========================================================
   DEFAULTS
========================================================= */

function setDefaultDates() {
  const today = localDateString();

  if (
    dom.joinDate &&
    !dom.joinDate.value
  ) {
    dom.joinDate.value = today;
  }

  if (
    dom.contributionEffectiveFrom &&
    !dom.contributionEffectiveFrom.value
  ) {
    dom.contributionEffectiveFrom.value =
      dom.joinDate?.value || today;
  }

  if (
    dom.positionEffectiveFrom &&
    !dom.positionEffectiveFrom.value
  ) {
    dom.positionEffectiveFrom.value =
      dom.joinDate?.value || today;
  }

  /*
   * Do NOT invent an amount.
   *
   * The backend/group configuration determines the amount,
   * but this UI requires the manager to enter the member's
   * actual Monthly amount.
   */
}


/* =========================================================
   MONTHLY TYPE
========================================================= */

function populateMonthlyType(type) {
  dom.monthlyTypeStatus.textContent =
    "Available";

  dom.monthlyTypeName.textContent =
    type.name || "Monthly";

  dom.monthlyTypeId.textContent =
    type.id;

  dom.monthlyTypeStatus.classList.remove(
    "is-error"
  );
}


/* =========================================================
   POSITION
========================================================= */

function handlePositionChange() {
  const value =
    dom.actualPosition?.value || "";

  const isOther =
    value === "other";

  if (dom.positionNameWrap) {
    dom.positionNameWrap.hidden =
      !isOther;
  }

  if (!isOther && dom.actualPositionName) {
    dom.actualPositionName.value = "";
  }

  if (
    value &&
    dom.positionEffectiveFrom &&
    !dom.positionEffectiveFrom.value
  ) {
    dom.positionEffectiveFrom.value =
      dom.joinDate?.value ||
      localDateString();
  }

  updateReview();
  updateSubmitState();
}


/* =========================================================
   FORM INPUT
========================================================= */

function handleFormInput() {
  updateHistoricalAmount();
  updatePreviews();
  updateReview();
  updateSubmitState();
}


/* =========================================================
   AMOUNT
========================================================= */

function handleAmountChange() {
  updateHistoricalAmount();
  updatePreviews();
  updateReview();
  updateSubmitState();
}

function updateHistoricalAmount() {
  if (!dom.historicalAmount) {
    return;
  }

  dom.historicalAmount.value =
    dom.contributionAmount?.value || "";
}


/* =========================================================
   DATE HANDLING
========================================================= */

function handleDateChanges() {
  /*
   * Contribution effective_from defaults to join_date, but
   * once the manager changes it deliberately, do not silently
   * overwrite it.
   */
  updatePreviews();
  updateReview();
  updateSubmitState();
}


/* =========================================================
   PREVIEWS
========================================================= */

function updatePreviews() {
  updateObligationPreview();
  updateHistoricalPreview();
}


/*
 * Backend rule reflected in the UI:
 *
 * full_period:
 *   first obligation month = effective_from month
 *
 * next_full_period:
 *   first obligation month = month after effective_from
 */
function getFirstObligationMonth() {
  const effectiveFrom =
    dom.contributionEffectiveFrom?.value;

  if (!effectiveFrom) {
    return null;
  }

  const firstDate =
    parseLocalDate(
      effectiveFrom
    );

  if (!firstDate) {
    return null;
  }

  if (
    dom.firstPeriodRule?.value ===
    "next_full_period"
  ) {
    firstDate.setMonth(
      firstDate.getMonth() + 1
    );
  }

  return monthString(
    firstDate
  );
}


function updateObligationPreview() {
  if (!dom.obligationPreview) {
    return;
  }

  const joinDate =
    dom.joinDate?.value || "";

  const effectiveFrom =
    dom.contributionEffectiveFrom?.value || "";

  const amount =
    numberValue(
      dom.contributionAmount?.value
    );

  if (!joinDate || !effectiveFrom) {
    dom.obligationPreview.textContent =
      "Enter the member's join date and contribution settings to preview the first obligation month.";

    return;
  }

  if (!amount || amount <= 0) {
    dom.obligationPreview.textContent =
      "Enter a Monthly amount greater than KSh 0.00 to preview the obligation.";

    return;
  }

  const firstMonth =
    getFirstObligationMonth();

  if (!firstMonth) {
    dom.obligationPreview.textContent =
      "Enter a valid contribution effective date.";

    return;
  }

  dom.obligationPreview.innerHTML =
    `<strong>First obligation month:</strong> ${escapeHtml(firstMonth)}
     <br>
     <strong>Monthly obligation:</strong> ${formatCurrency(amount)}`;
}


function updateHistoricalPreview() {
  if (!dom.historicalPreview) {
    return;
  }

  const paidThrough =
    dom.historicalPaidThrough?.value || "";

  if (!paidThrough) {
    dom.historicalPreview.textContent =
      "Enable this section by choosing a Paid Through month.";

    return;
  }

  const firstMonth =
    getFirstObligationMonth();

  if (!firstMonth) {
    dom.historicalPreview.textContent =
      "Complete the Monthly contribution plan first.";

    return;
  }

  const first =
    parseMonth(firstMonth);

  const through =
    parseMonth(paidThrough);

  if (!first || !through) {
    dom.historicalPreview.textContent =
      "Enter a valid historical Paid Through month.";

    return;
  }

  if (
    through.getTime() <
    first.getTime()
  ) {
    dom.historicalPreview.textContent =
      "Paid Through must reach at least the first obligation month.";

    return;
  }

  const months =
    monthsInclusive(
      first,
      through
    );

  const amount =
    numberValue(
      dom.contributionAmount?.value
    );

  const total =
    amount > 0
      ? amount * months
      : 0;

  dom.historicalPreview.innerHTML =
    `<strong>Historical months:</strong> ${months}
     <br>
     <strong>Historical monthly amount:</strong> ${formatCurrency(amount)}
     <br>
     <strong>Historical amount:</strong> ${formatCurrency(total)}`;
}


/* =========================================================
   VALIDATION
========================================================= */

function validateForm() {
  const errors = [];

  const memberNumber =
    clean(dom.memberNumber?.value);

  const membershipNumber =
    clean(dom.membershipNumber?.value);

  const name =
    clean(dom.name?.value);

  const phone =
    clean(dom.phone?.value);

  const joinDate =
    dom.joinDate?.value;

  const role =
    dom.role?.value;

  const status =
    dom.status?.value;

  const onboardingStatus =
    dom.onboardingStatus?.value;

  const position =
    dom.actualPosition?.value || "";

  const positionName =
    clean(dom.actualPositionName?.value);

  const positionEffective =
    dom.positionEffectiveFrom?.value;

  const amount =
    numberValue(
      dom.contributionAmount?.value
    );

  const effectiveFrom =
    dom.contributionEffectiveFrom?.value;

  const effectiveTo =
    dom.contributionEffectiveTo?.value;

  const firstPeriodRule =
    dom.firstPeriodRule?.value;

  const ruleStatus =
    dom.ruleStatus?.value;

  if (!memberNumber) {
    errors.push(
      "Member Number is required."
    );
  }

  if (!membershipNumber) {
    errors.push(
      "Membership Number is required."
    );
  }

  if (!name) {
    errors.push(
      "Full Name is required."
    );
  }

  if (!phone) {
    errors.push(
      "Phone is required."
    );
  }

  if (!joinDate) {
    errors.push(
      "Join Date is required."
    );
  }

  if (!role) {
    errors.push(
      "Security Role is required."
    );
  }

  if (!status) {
    errors.push(
      "Member Status is required."
    );
  }

  if (!onboardingStatus) {
    errors.push(
      "Onboarding Status is required."
    );
  }

  if (
    !amount ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    errors.push(
      "Monthly Amount must be greater than KSh 0.00."
    );
  }

  if (!effectiveFrom) {
    errors.push(
      "Contribution Effective From is required."
    );
  }

  if (
    joinDate &&
    effectiveFrom &&
    effectiveFrom < joinDate
  ) {
    errors.push(
      "Contribution Effective From cannot be before Join Date."
    );
  }

  if (
    effectiveTo &&
    effectiveFrom &&
    effectiveTo < effectiveFrom
  ) {
    errors.push(
      "Contribution Effective To cannot be before Effective From."
    );
  }

  if (
    position &&
    !positionName &&
    position === "other"
  ) {
    errors.push(
      "Position Name is required when Actual Position is Other."
    );
  }

  if (
    position &&
    positionEffective &&
    joinDate &&
    positionEffective < joinDate
  ) {
    errors.push(
      "Position Effective From cannot be before Join Date."
    );
  }

  if (
    ruleStatus === "ended" &&
    !effectiveTo
  ) {
    errors.push(
      "An ended contribution rule requires Effective To."
    );
  }

  if (
    !firstPeriodRule
  ) {
    errors.push(
      "First Period Rule is required."
    );
  }

  /*
   * Historical validation only applies when the section
   * contains a Paid Through value.
   */
  const historicalEnabled =
    Boolean(
      dom.historicalPaidThrough?.value
    );

  if (historicalEnabled) {
    const paidThrough =
      dom.historicalPaidThrough.value;

    const currentMonth =
      monthString(
        new Date()
      );

    if (
      paidThrough > currentMonth
    ) {
      errors.push(
        "Historical Paid Through cannot be in the future."
      );
    }

    const firstMonth =
      getFirstObligationMonth();

    if (
      firstMonth &&
      paidThrough < firstMonth
    ) {
      errors.push(
        "Historical Paid Through must reach at least the first obligation month."
      );
    }

    const paymentMethod =
      dom.historicalPaymentMethod?.value;

    if (!paymentMethod) {
      errors.push(
        "Historical Payment Method is required."
      );
    }
  }

  return errors;
}


/* =========================================================
   SUBMIT STATE
========================================================= */

function updateSubmitState() {
  if (!dom.submit) {
    return;
  }

  if (state.submitting) {
    setSubmitDisabled(
      true
    );

    return;
  }

  /*
   * Do not use HTML form.checkValidity() as the only test
   * because the form has custom accounting validation.
   */
  const errors =
    validateForm();

  const ready =
    Boolean(
      state.groupId &&
      state.monthlyType?.id &&
      errors.length === 0
    );

  setSubmitDisabled(
    !ready
  );
}


function setSubmitDisabled(disabled) {
  if (!dom.submit) {
    return;
  }

  dom.submit.disabled =
    Boolean(disabled);

  dom.submit.setAttribute(
    "aria-disabled",
    String(Boolean(disabled))
  );
}


/* =========================================================
   SUBMIT
========================================================= */

async function handleSubmit(event) {
  event.preventDefault();

  if (state.submitting) {
    return;
  }

  clearMessage();

  const errors =
    validateForm();

  if (errors.length > 0) {
    showValidationErrors(
      errors
    );

    updateReview();
    updateSubmitState();

    return;
  }

  if (!state.groupId) {
    showMessage(
      "Your group session could not be resolved. Please reload the page.",
      "error"
    );

    return;
  }

  if (!state.monthlyType?.id) {
    showMessage(
      "The group's Monthly contribution type could not be loaded.",
      "error"
    );

    return;
  }

  /*
   * The same request ID is reused if the RPC fails and the user
   * retries the same form.
   */
  if (!state.requestId) {
    state.requestId =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : generateFallbackRequestId();
  }

  state.submitting = true;

  setSubmitDisabled(true);

  setSubmitText(
    "Creating Member…"
  );

  try {
    const payload =
      buildPayload();

    const historicalEnabled =
      Boolean(
        payload.p_historical?.enabled
      );

    let result;

    if (historicalEnabled) {
      result =
        await createMemberWithHistorical(
          state.groupId,
          payload.p_member,
          payload.p_contribution_plan,
          payload.p_historical,
          state.requestId
        );
    } else {
      result =
        await createMember(
          state.groupId,
          payload.p_member,
          payload.p_contribution_plan
        );
    }

    handleSuccess(
      result
    );

  } catch (error) {
    console.error(
      "CHAMA LIVE Add Member submission failed:",
      error
    );

    showMessage(
      mapRpcError(error),
      "error",
      error
    );

  } finally {
    state.submitting = false;

    if (!dom.success || dom.success.hidden) {
      setSubmitText(
        "Add Member"
      );

      updateSubmitState();
    }
  }
}


/* =========================================================
   PAYLOAD BUILDING
========================================================= */

function buildPayload() {
  const member = {
    member_number:
      clean(dom.memberNumber.value),

    membership_number:
      clean(dom.membershipNumber.value),

    name:
      clean(dom.name.value),

    phone:
      clean(dom.phone.value),

    email:
      clean(dom.email?.value),

    national_id:
      clean(dom.nationalId?.value),

    role:
      dom.role.value,

    status:
      dom.status.value,

    onboarding_status:
      dom.onboardingStatus.value,

    join_date:
      dom.joinDate.value
  };

  /*
   * Position information belongs to the member payload because
   * it is part of the member creation contract.
   */
  if (dom.actualPosition?.value) {
    member.actual_position =
      dom.actualPosition.value;

    if (
      dom.actualPosition.value === "other"
    ) {
      member.actual_position_name =
        clean(
          dom.actualPositionName.value
        );
    }

    if (
      dom.positionEffectiveFrom?.value
    ) {
      member.actual_position_effective_from =
        dom.positionEffectiveFrom.value;
    }
  }

  const contributionPlan = [
    {
      contribution_type_id:
        state.monthlyType.id,

      amount:
        numberValue(
          dom.contributionAmount.value
        ),

      frequency:
        "monthly",

      effective_from:
        dom.contributionEffectiveFrom.value,

      effective_to:
        dom.contributionEffectiveTo.value ||
        null,

      first_period_rule:
        dom.firstPeriodRule.value,

      status:
        dom.ruleStatus.value
    }
  ];

  const historicalPaidThrough =
    dom.historicalPaidThrough?.value ||
    null;

  const historicalEnabled =
    Boolean(
      historicalPaidThrough
    );

  const historical = {
    enabled:
      historicalEnabled,

    monthly_amount:
      numberValue(
        dom.contributionAmount.value
      ),

    paid_through:
      historicalPaidThrough,

    payment_method:
      historicalEnabled
        ? dom.historicalPaymentMethod.value
        : null
  };

  return {
    p_member: member,
    p_contribution_plan: contributionPlan,
    p_historical: historical
  };
}


/* =========================================================
   SUCCESS
========================================================= */

function handleSuccess(result) {
  /*
   * Hide the form immediately so the old Add Member submit
   * controls cannot remain active behind the success state.
   */
  if (dom.form) {
    dom.form.hidden = true;
  }

  if (dom.message) {
    dom.message.hidden = true;
  }

  if (dom.success) {
    dom.success.removeAttribute(
      "hidden"
    );
  }

  renderSuccessSummary(
    result
  );

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  setSubmitDisabled(
    true
  );
}


/* =========================================================
   SUCCESS SUMMARY
========================================================= */

function renderSuccessSummary(result) {
  if (!dom.successSummary) {
    return;
  }

  /*
   * RPC A returns a table row.
   * RPC B returns JSONB.
   *
   * Normalize both without assuming additional backend fields.
   */
  const row =
    normalizeResult(result);

  const values = [
    [
      "Member Number",
      row.member_id !== undefined
        ? row.member_number
        : row.member_number
    ],

    [
      "Membership Number",
      row.membership_number
    ],

    [
      "Obligations Created",
      row.obligations_created
    ],

    [
      "Total Due",
      currencyOrDash(
        row.total_due
      )
    ],

    [
      "Total Allocated",
      currencyOrDash(
        row.total_allocated
      )
    ],

    [
      "Arrears",
      currencyOrDash(
        row.arrears
      )
    ],

    [
      "Credit",
      currencyOrDash(
        row.credit
      )
    ],

    [
      "Contribution Status",
      row.contribution_status
    ]
  ];

  dom.successSummary.innerHTML =
    values
      .filter(
        ([, value]) =>
          value !== undefined &&
          value !== null &&
          value !== ""
      )
      .map(
        ([label, value]) =>
          `<div class="add-member-result-item">
             <span class="label">${escapeHtml(label)}</span>
             <strong>${escapeHtml(String(value))}</strong>
           </div>`
      )
      .join("");
}


function normalizeResult(result) {
  /*
   * The RPC wrapper may return:
   *   { data, error }
   * or directly return data.
   */
  const data =
    result?.data !== undefined
      ? result.data
      : result;

  /*
   * Table-returning RPC normally arrives as an array with one
   * row.
   */
  if (Array.isArray(data)) {
    return data[0] || {};
  }

  /*
   * Historical RPC returns jsonb.
   */
  if (
    data &&
    typeof data === "object"
  ) {
    return data;
  }

  return {};
}


/* =========================================================
   ADD ANOTHER MEMBER
========================================================= */

function handleAddAnother() {
  /*
   * Start a genuinely new form session.
   *
   * This generates a NEW request ID, which is correct because
   * this is a new member rather than a retry of the previous
   * request.
   */
  state.requestId =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : generateFallbackRequestId();

  state.submitting = false;

  /*
   * Hide success and restore form.
   */
  dom.success?.setAttribute(
    "hidden",
    ""
  );

  dom.form?.removeAttribute(
    "hidden"
  );

  dom.message?.setAttribute(
    "hidden",
    ""
  );

  dom.message?.classList.remove(
    "add-member-alert-error",
    "add-member-alert-success"
  );

  /*
   * Reset user-entered values.
   */
  dom.form?.reset();

  /*
   * Restore required smart defaults.
   */
  setDefaultDates();

  /*
   * Restore UI-only fields.
   */
  if (dom.positionNameWrap) {
    dom.positionNameWrap.hidden =
      true;
  }

  if (dom.actualPositionName) {
    dom.actualPositionName.value = "";
  }

  if (dom.historicalAmount) {
    dom.historicalAmount.value = "";
  }

  if (dom.successSummary) {
    dom.successSummary.innerHTML = "";
  }

  /*
   * The historical section must start closed.
   */
  if (dom.historicalDetails) {
    dom.historicalDetails.open =
      false;
  }

  /*
   * Preserve the canonical Monthly type loaded from the group.
   */
  if (state.monthlyType) {
    populateMonthlyType(
      state.monthlyType
    );
  }

  updateHistoricalAmount();
  updatePreviews();
  updateReview();

  setSubmitText(
    "Add Member"
  );

  updateSubmitState();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  dom.memberNumber?.focus();
}


/* =========================================================
   REVIEW
========================================================= */

function updateReview() {
  if (!dom.review) {
    return;
  }

  const memberNumber =
    clean(dom.memberNumber?.value) ||
    "—";

  const membershipNumber =
    clean(dom.membershipNumber?.value) ||
    "—";

  const name =
    clean(dom.name?.value) ||
    "—";

  const phone =
    clean(dom.phone?.value) ||
    "—";

  const joinDate =
    dom.joinDate?.value ||
    "—";

  const role =
    dom.role?.value ||
    "—";

  const status =
    dom.status?.value ||
    "—";

  const onboarding =
    dom.onboardingStatus?.value ||
    "—";

  const position =
    dom.actualPosition?.value
      ? positionLabel(
          dom.actualPosition.value
        )
      : "—";

  const positionEffective =
    dom.positionEffectiveFrom?.value ||
    "—";

  const contributionType =
    state.monthlyType?.name ||
    "—";

  const amount =
    numberValue(
      dom.contributionAmount?.value
    );

  const effectiveFrom =
    dom.contributionEffectiveFrom?.value ||
    "—";

  const effectiveTo =
    dom.contributionEffectiveTo?.value ||
    "Open-ended";

  const firstPeriodRule =
    dom.firstPeriodRule?.value ||
    "—";

  const ruleStatus =
    dom.ruleStatus?.value ||
    "—";

  const firstObligation =
    getFirstObligationMonth() ||
    "—";

  const historicalEnabled =
    Boolean(
      dom.historicalPaidThrough?.value
    );

  const rows = [
    ["Member Number", memberNumber],
    ["Membership Number", membershipNumber],
    ["Name", name],
    ["Phone", phone],
    ["Join Date", joinDate],
    ["Security Role", role],
    ["Member Status", status],
    ["Onboarding", onboarding],
    ["Position", position],
    [
      "Position Effective",
      positionEffective
    ],
    [
      "Contribution Type",
      contributionType
    ],
    [
      "Monthly Amount",
      formatCurrency(amount)
    ],
    [
      "Effective From",
      effectiveFrom
    ],
    [
      "Effective To",
      effectiveTo
    ],
    [
      "First Period Rule",
      firstPeriodRule
    ],
    [
      "Rule Status",
      ruleStatus
    ],
    [
      "First Obligation Month",
      firstObligation
    ],
    [
      "Historical",
      historicalEnabled
        ? "Enabled"
        : "Disabled"
    ]
  ];

  dom.review.innerHTML =
    rows
      .map(
        ([label, value]) =>
          `<div class="add-member-review-item">
             <span class="label">${escapeHtml(label)}</span>
             <strong>${escapeHtml(String(value))}</strong>
           </div>`
      )
      .join("");
}


/* =========================================================
   VALIDATION DISPLAY
========================================================= */

function showValidationErrors(errors) {
  const unique =
    [...new Set(errors)];

  const message =
    unique.length === 1
      ? unique[0]
      : `Please correct the following before submitting:
         <br><br>
         <ul>
           ${unique
             .map(
               error =>
                 `<li>${escapeHtml(error)}</li>`
             )
             .join("")}
         </ul>`;

  showMessage(
    message,
    "error"
  );
}


/* =========================================================
   ACCESS ERROR
========================================================= */

function showAccessError(message) {
  if (dom.loading) {
    dom.loading.setAttribute(
      "hidden",
      ""
    );
  }

  if (dom.workspace) {
    dom.workspace.setAttribute(
      "hidden",
      ""
    );
  }

  if (dom.accessError) {
    dom.accessError.innerHTML =
      escapeHtml(
        message ||
        "You cannot access Add Member."
      );

    dom.accessError.removeAttribute(
      "hidden"
    );
  }
}


/* =========================================================
   MESSAGES
========================================================= */

function showMessage(
  message,
  type = "error",
  rawError = null
) {
  if (!dom.message) {
    return;
  }

  if (rawError) {
    console.error(
      "CHAMA LIVE raw Add Member error:",
      rawError
    );
  }

  dom.message.classList.toggle(
    "add-member-alert-error",
    type === "error"
  );

  dom.message.classList.toggle(
    "add-member-alert-success",
    type === "success"
  );

  dom.message.innerHTML =
    message || "Unable to complete the request.";

  dom.message.removeAttribute(
    "hidden"
  );
}


function clearMessage() {
  if (!dom.message) {
    return;
  }

  dom.message.setAttribute(
    "hidden",
    ""
  );

  dom.message.textContent = "";

  dom.message.classList.remove(
    "add-member-alert-error",
    "add-member-alert-success"
  );
}


/* =========================================================
   SUBMIT BUTTON TEXT
========================================================= */

function setSubmitText(text) {
  if (dom.submit) {
    dom.submit.textContent =
      text;
  }
}


/* =========================================================
   DATE HELPERS
========================================================= */

function localDateString() {
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


function parseLocalDate(value) {
  if (!value) {
    return null;
  }

  const parts =
    value.split("-").map(
      Number
    );

  if (parts.length !== 3) {
    return null;
  }

  const [
    year,
    month,
    day
  ] = parts;

  const date =
    new Date(
      year,
      month - 1,
      day
    );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}


function monthString(date) {
  if (!(date instanceof Date)) {
    return null;
  }

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;
}


function parseMonth(value) {
  if (!value) {
    return null;
  }

  const parts =
    value.split("-").map(
      Number
    );

  if (parts.length !== 2) {
    return null;
  }

  const [
    year,
    month
  ] = parts;

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


function monthsInclusive(
  start,
  end
) {
  return (
    (end.getFullYear() -
      start.getFullYear()) *
      12 +
    (end.getMonth() -
      start.getMonth()) +
    1
  );
}


/* =========================================================
   VALUE HELPERS
========================================================= */

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}


function numberValue(value) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}


function formatCurrency(value) {
  const amount =
    numberValue(value);

  return `KSh ${amount.toLocaleString(
    "en-KE",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  )}`;
}


function currencyOrDash(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "—";
  }

  return formatCurrency(value);
}


/* =========================================================
   LABEL HELPERS
========================================================= */

function positionLabel(value) {
  const labels = {
    chairperson: "Chairperson",
    vice_chairperson: "Vice Chairperson",
    treasurer: "Treasurer",
    secretary: "Secretary",
    vice_secretary: "Vice Secretary",
    committee_member: "Committee Member",
    member: "Member",
    other: clean(
      dom.actualPositionName?.value
    ) || "Other"
  };

  return (
    labels[value] ||
    value
  );
}


/* =========================================================
   SECURITY / HTML ESCAPING
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
   FALLBACK REQUEST ID
========================================================= */

function generateFallbackRequestId() {
  return (
    "add-member-" +
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .slice(2, 14)
  );
}
