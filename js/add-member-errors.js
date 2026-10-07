/* =========================================================
   CHAMA LIVE — ADD MEMBER ERROR MAPPING
   ---------------------------------------------------------
   Frontend-only error presentation.

   Raw Supabase/PostgreSQL errors are ALWAYS logged.
   Known application errors receive friendly messages.
   Unknown errors retain their raw message in Details.
========================================================= */

const ERROR_MESSAGES = new Map([

  /* Authentication / authorisation */

  [
    "AUTHENTICATION_REQUIRED",
    "You must be signed in to complete this action."
  ],

  [
    "ACTIVE_GROUP_MEMBER_REQUIRED",
    "Your account must be an active group member to add a member."
  ],

  [
    "MEMBER_MANAGEMENT_NOT_AUTHORIZED",
    "Only an authorised group manager can add members."
  ],


  /* General member validation */

  [
    "MEMBER_INPUT_INVALID",
    "The member information entered is invalid."
  ],

  [
    "MEMBER_NUMBER_REQUIRED",
    "Member number is required."
  ],

  [
    "MEMBERSHIP_NUMBER_REQUIRED",
    "Membership number is required."
  ],

  [
    "MEMBER_NAME_REQUIRED",
    "Member name is required."
  ],

  [
    "MEMBER_PHONE_REQUIRED",
    "Member phone number is required."
  ],

  [
    "MEMBER_ROLE_INVALID",
    "The selected member role is not valid."
  ],

  [
    "MEMBER_STATUS_INVALID",
    "The selected member status is not valid."
  ],

  [
    "MEMBER_ONBOARDING_STATUS_INVALID",
    "The selected onboarding status is not valid."
  ],


  /* Duplicate identifiers */

  [
    "MEMBER_NUMBER_ALREADY_EXISTS",
    "That member number is already in use in this group."
  ],

  [
    "MEMBERSHIP_NUMBER_ALREADY_EXISTS",
    "That membership number is already in use in this group."
  ],


  /* Position */

  [
    "ACTUAL_POSITION_INVALID",
    "The selected actual group position is not valid."
  ],

  [
    "ACTUAL_POSITION_NAME_REQUIRED",
    "A position name is required when Actual Position is Other."
  ],

  [
    "ACTUAL_POSITION_EFFECTIVE_DATE_INVALID",
    "The actual position effective date is invalid."
  ],

  [
    "ACTUAL_POSITION_EFFECTIVE_DATE_BEFORE_JOIN_DATE",
    "The actual position effective date cannot be before the join date."
  ],


  /* Contribution plan */

  [
    "CONTRIBUTION_PLAN_INVALID",
    "The contribution plan submitted for this member is invalid."
  ],

  [
    "CONTRIBUTION_PLAN_ITEM_INVALID",
    "The contribution plan entry is invalid."
  ],

  [
    "CONTRIBUTION_TYPE_ID_INVALID",
    "The selected contribution type is invalid."
  ],

  [
    "CONTRIBUTION_TYPE_ID_REQUIRED",
    "A contribution type is required."
  ],

  [
    "CONTRIBUTION_AMOUNT_INVALID",
    "The monthly contribution amount must be greater than zero."
  ],

  [
    "CONTRIBUTION_FREQUENCY_NOT_SUPPORTED",
    "Only monthly contribution plans are supported for member creation."
  ],

  [
    "CONTRIBUTION_EFFECTIVE_DATE_BEFORE_JOIN_DATE",
    "The contribution effective date cannot be before the join date."
  ],

  [
    "CONTRIBUTION_EFFECTIVE_DATE_RANGE_INVALID",
    "The contribution effective date range is invalid."
  ],

  [
    "FIRST_PERIOD_RULE_NOT_SUPPORTED",
    "The selected first-period contribution rule is not supported."
  ],

  [
    "CONTRIBUTION_RULE_STATUS_INVALID",
    "The contribution rule status is not valid."
  ],

  [
    "ENDED_RULE_REQUIRES_EFFECTIVE_TO",
    "An ended contribution rule requires an end date."
  ],

  [
    "CONTRIBUTION_TYPE_NOT_IN_GROUP",
    "The selected contribution type does not belong to this group."
  ],

  [
    "CONTRIBUTION_TYPE_NOT_SUPPORTED",
    "The selected contribution type is not supported for member creation."
  ],

  [
    "CONTRIBUTION_RULE_OVERLAP",
    "The contribution plan overlaps an existing contribution rule."
  ],


  /* Idempotency */

  [
    "IDEMPOTENCY_CONFLICT",
    "This member creation request conflicts with an earlier request. Do not submit it again."
  ],


  /* Historical onboarding */

  [
    "HISTORICAL_INPUT_INVALID",
    "The historical contribution information is invalid."
  ],

  [
    "HISTORICAL_MONTHLY_AMOUNT_INVALID",
    "The historical monthly amount is invalid."
  ],

  [
    "HISTORICAL_PAYMENT_METHOD_INVALID",
    "The selected historical payment method is invalid."
  ],

  [
    "HISTORICAL_PAID_THROUGH_INVALID",
    "The historical Paid Through month is invalid."
  ],


  /* Accounting integrity */

  [
    "ALLOCATION_INTEGRITY_ERROR",
    "The member was not created because the accounting allocation could not be completed safely."
  ],

  [
    "CONTRIBUTION_ALLOCATION_INTEGRITY_ERROR",
    "The member was not created because the accounting allocation could not be completed safely."
  ]

]);


/* =========================================================
   NORMALISE RAW ERROR
========================================================= */

function extractError(error) {

  const code =
    String(
      error?.code ||
      error?.error_code ||
      ""
    ).trim();

  const message =
    String(
      error?.message ||
      error?.error ||
      ""
    ).trim();

  const details =
    error?.details ??
    null;

  const hint =
    error?.hint ??
    null;

  return {
    code,
    message,
    details,
    hint
  };

}


/* =========================================================
   HISTORICAL PLAIN-TEXT ERROR MAPPING
========================================================= */

function mapHistoricalMessage(
  message
) {

  const text =
    String(
      message || ""
    ).trim();

  const lower =
    text.toLowerCase();


  if (
    lower.includes(
      "historical monthly amount must equal current monthly amount"
    )
  ) {

    return {
      message:
        "The historical monthly amount must equal the current Monthly contribution amount.",
      details:
        text
    };

  }


  if (
    lower.includes(
      "invalid historical payment method"
    )
  ) {

    return {
      message:
        "The selected historical payment method is not supported.",
      details:
        text
    };

  }


  if (
    lower.includes(
      "financial month"
    ) &&
    lower.includes(
      "closed"
    )
  ) {

    return {
      message:
        "The selected accounting period is closed. This member cannot be onboarded through that period.",
      details:
        text
    };

  }


  if (
    lower.includes(
      "historical"
    ) &&
    (
      lower.includes("paid through") ||
      lower.includes("paid_through")
    )
  ) {

    return {
      message:
        "The Historical Paid Through month is not valid.",
      details:
        text
    };

  }


  if (
    lower.includes(
      "allocation"
    ) &&
    (
      lower.includes("integrity") ||
      lower.includes("mismatch") ||
      lower.includes("failed")
    )
  ) {

    return {
      message:
        "The member was not created because the accounting allocation could not be completed safely.",
      details:
        text
    };

  }


  return null;

}


/* =========================================================
   PUBLIC ERROR MAPPER
========================================================= */

export function mapRpcError(
  error
) {

  /*
   * REQUIRED DIAGNOSTIC LOGGING.
   */
  console.error(
    "[CHAMA LIVE] Add Member raw RPC error:",
    error
  );


  const {
    code,
    message,
    details,
    hint
  } =
    extractError(error);


  /* -------------------------------------------------------
     Known application error code
  ------------------------------------------------------- */

  if (
    code &&
    ERROR_MESSAGES.has(code)
  ) {

    return {
      code,
      message:
        ERROR_MESSAGES.get(code),
      details:
        details ||
        hint ||
        null
    };

  }


  /* -------------------------------------------------------
     Known plain-text database messages
  ------------------------------------------------------- */

  const historical =
    mapHistoricalMessage(
      message
    );


  if (historical) {

    return {
      code:
        code ||
        "DATABASE_VALIDATION_ERROR",

      message:
        historical.message,

      details:
        historical.details ||
        details ||
        hint ||
        null
    };

  }


  /* -------------------------------------------------------
     PostgreSQL permission failure
  ------------------------------------------------------- */

  if (
    code === "42501"
  ) {

    return {
      code,
      message:
        "You do not have permission to complete this action.",
      details:
        details ||
        hint ||
        null
    };

  }


  /* -------------------------------------------------------
     Unique constraint
  ------------------------------------------------------- */

  if (
    code === "23505"
  ) {

    return {
      code,
      message:
        "A member with the same member or membership number already exists in this group.",
      details:
        details ||
        hint ||
        null
    };

  }


  /* -------------------------------------------------------
     Contribution-rule exclusion overlap
  ------------------------------------------------------- */

  if (
    code === "23P01"
  ) {

    return {
      code,
      message:
        "The contribution plan overlaps an existing contribution rule.",
      details:
        details ||
        hint ||
        null
    };

  }


  /* -------------------------------------------------------
     Check constraints
  ------------------------------------------------------- */

  if (
    code === "23514" &&
    message.includes(
      "members_membership_number_format_ck"
    )
  ) {

    return {
      code,
      message:
        "Membership Number must be exactly 4 digits, for example 0002.",
      details:
        details ||
        hint ||
        null
    };

  }


  if (
    code === "23514"
  ) {

    return {
      code,
      message:
        "One of the entered values is not allowed. Check the form and try again.",
      details:
        details ||
        hint ||
        null
    };

  }


  /* -------------------------------------------------------
     Undefined function/operator
  ------------------------------------------------------- */

  if (
    code === "42883"
  ) {

    return {
      code,
      message:
        "The Add Member backend operation is temporarily unavailable. Refresh and try again.",
      details:
        message ||
        details ||
        hint ||
        null
    };

  }


  /* -------------------------------------------------------
     Unknown database/application error
     Keep raw message as Details.
  ------------------------------------------------------- */

  return {
    code:
      code ||
      "UNKNOWN_ERROR",

    message:
      "The Add Member operation could not be completed.",

    details:
      message ||
      details ||
      hint ||
      null
  };

}
