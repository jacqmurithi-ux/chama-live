/* =========================================================
   CHAMA LIVE — ADD MEMBER ERROR MAP
========================================================= */

const FRIENDLY_MESSAGES = new Map([

  [
    "MEMBER_INPUT_INVALID",
    "The member information is not in a valid format."
  ],

  [
    "CONTRIBUTION_PLAN_INVALID",
    "The Monthly contribution plan is not valid."
  ],

  [
    "AUTHENTICATION_REQUIRED",
    "Your session is no longer valid. Please sign in again."
  ],

  [
    "Authentication required",
    "Your session is no longer valid. Please sign in again."
  ],

  [
    "ACTIVE_GROUP_MEMBER_REQUIRED",
    "An active group membership is required to add a member."
  ],

  [
    "Active group membership is required",
    "An active group membership is required to add a member."
  ],

  [
    "MEMBER_MANAGEMENT_NOT_AUTHORIZED",
    "You do not have permission to add members. Only an authorised group manager can perform this action."
  ],

  [
    "Member-management authorization required",
    "You do not have permission to add members. Only an authorised group manager can perform this action."
  ],

  [
    "MEMBER_NUMBER_ALREADY_EXISTS",
    "That member number is already in use in this group."
  ],

  [
    "MEMBERSHIP_NUMBER_ALREADY_EXISTS",
    "That membership number is already in use in this group."
  ],

  [
    "MEMBER_NUMBER_REQUIRED",
    "Member number is required."
  ],

  [
    "Member number is required",
    "Member number is required."
  ],

  [
    "MEMBERSHIP_NUMBER_REQUIRED",
    "Membership number is required."
  ],

  [
    "Membership number is required",
    "Membership number is required."
  ],

  [
    "MEMBER_NAME_REQUIRED",
    "Member name is required."
  ],

  [
    "Member name is required",
    "Member name is required."
  ],

  [
    "MEMBER_PHONE_REQUIRED",
    "Member phone number is required."
  ],

  [
    "Member phone is required",
    "Member phone number is required."
  ],

  [
    "MEMBER_ROLE_INVALID",
    "Select a valid security role."
  ],

  [
    "MEMBER_STATUS_INVALID",
    "Select a valid member status."
  ],

  [
    "MEMBER_ONBOARDING_STATUS_INVALID",
    "Select a valid onboarding status."
  ],

  [
    "ACTUAL_POSITION_INVALID",
    "Select a valid actual group position."
  ],

  [
    "ACTUAL_POSITION_NAME_REQUIRED",
    "Enter the position name when Actual Position is Other."
  ],

  [
    "ACTUAL_POSITION_EFFECTIVE_DATE_INVALID",
    "Enter a valid position effective date."
  ],

  [
    "ACTUAL_POSITION_EFFECTIVE_DATE_BEFORE_JOIN_DATE",
    "The position effective date cannot be before the member's join date."
  ],

  [
    "CONTRIBUTION_TYPE_ID_REQUIRED",
    "The group's Monthly contribution type could not be resolved."
  ],

  [
    "CONTRIBUTION_TYPE_ID_INVALID",
    "The group's Monthly contribution type is invalid."
  ],

  [
    "CONTRIBUTION_TYPE_NOT_IN_GROUP",
    "The selected contribution type does not belong to this group."
  ],

  [
    "CONTRIBUTION_TYPE_NOT_SUPPORTED",
    "This group does not have one unambiguous canonical Monthly contribution type."
  ],

  [
    "Canonical Monthly contribution type does not belong to the group",
    "The group's canonical Monthly contribution type could not be verified."
  ],

  [
    "CONTRIBUTION_PLAN_ITEM_INVALID",
    "The Monthly contribution plan item is invalid."
  ],

  [
    "CONTRIBUTION_AMOUNT_INVALID",
    "Monthly contribution amount must be greater than zero."
  ],

  [
    "Invalid contribution amount",
    "Monthly contribution amount must be greater than zero."
  ],

  [
    "Monthly contribution amount must be greater than zero",
    "Monthly contribution amount must be greater than zero."
  ],

  [
    "CONTRIBUTION_FREQUENCY_NOT_SUPPORTED",
    "Only Monthly contributions are supported by this Add Member workflow."
  ],

  [
    "Revision 3.2 supports Monthly contributions only",
    "Only Monthly contributions are supported by this Add Member workflow."
  ],

  [
    "CONTRIBUTION_EFFECTIVE_DATE_BEFORE_JOIN_DATE",
    "The contribution effective date cannot be before the member's join date."
  ],

  [
    "Contribution effective_from cannot precede join_date",
    "The contribution effective date cannot be before the member's join date."
  ],

  [
    "CONTRIBUTION_EFFECTIVE_DATE_RANGE_INVALID",
    "Contribution Effective To cannot be before Effective From."
  ],

  [
    "Contribution effective_to cannot precede effective_from",
    "Contribution Effective To cannot be before Effective From."
  ],

  [
    "FIRST_PERIOD_RULE_NOT_SUPPORTED",
    "Select a valid first-period rule."
  ],

  [
    "Invalid first_period_rule",
    "Select a valid first-period rule."
  ],

  [
    "CONTRIBUTION_RULE_STATUS_INVALID",
    "Select a valid contribution rule status."
  ],

  [
    "ENDED_RULE_REQUIRES_EFFECTIVE_TO",
    "An ended contribution rule must have an Effective To date."
  ],

  [
    "CONTRIBUTION_RULE_OVERLAP",
    "The contribution rule overlaps an existing contribution rule."
  ],

  [
    "IDEMPOTENCY_CONFLICT",
    "This retry uses the same request ID with different member data. Reset the form and submit it as a new request."
  ],

  [
    "Request idempotency key is required",
    "The submission request ID is missing. Reset the form and try again."
  ],

  [
    "Member payload must be a JSON object",
    "The member information is not valid."
  ],

  [
    "Contribution plan must be a JSON array",
    "The Monthly contribution plan is not valid."
  ],

  [
    "Historical onboarding must be explicitly enabled",
    "Historical onboarding was not enabled correctly."
  ],

  [
    "Revision 3.2 requires exactly one Monthly contribution rule",
    "Historical onboarding requires exactly one Monthly contribution rule."
  ],

  [
    "Contribution plan item must be a JSON object",
    "The Monthly contribution plan is not valid."
  ],

  [
    "Invalid contribution_type_id",
    "The group's Monthly contribution type is invalid."
  ],

  [
    "Contribution type is required",
    "The group's Monthly contribution type is required."
  ],

  [
    "Invalid first_period_rule",
    "Select a valid first-period rule."
  ],

  [
    "Invalid historical monthly_amount",
    "The historical monthly amount is invalid."
  ],

  [
    "Historical monthly amount must be greater than zero",
    "The historical monthly amount must be greater than zero."
  ],

  [
    "Historical monthly amount must equal current Monthly amount",
    "The historical monthly amount must equal the current Monthly contribution amount."
  ],

  [
    "Invalid historical paid_through",
    "Enter a valid historical Paid Through month."
  ],

  [
    "paid_through is required",
    "Historical Paid Through is required."
  ],

  [
    "Historical paid_through cannot be in the future",
    "Historical Paid Through cannot be in the future."
  ],

  [
    "Invalid historical payment method",
    "Select M-Pesa, Cash or Bank transfer."
  ],

  [
    "paid_through does not reach the first historical obligation month",
    "Paid Through must reach the first historical obligation month."
  ],

  [
    "Member number is required",
    "Member number is required."
  ],

  [
    "Membership number is required",
    "Membership number is required."
  ],

  [
    "Invalid join_date",
    "Enter a valid join date."
  ],

  [
    "Financial month",
    "The selected historical period contains a closed financial month and cannot be modified."
  ],

  [
    "Cross-member/group allocation detected",
    "The backend detected an invalid cross-member or cross-group allocation. No accounting change should be accepted."
  ],

  [
    "Payment over-allocation detected",
    "The backend detected a payment allocated above its available amount. No accounting change should be accepted."
  ],

  [
    "Obligation over-allocation detected",
    "The backend detected an obligation allocated above its due amount. No accounting change should be accepted."
  ]

]);


/* =========================================================
   RAW ERROR TEXT
========================================================= */

function getRawMessage(
  error
) {

  return String(
    error?.message ||
    ""
  ).trim();

}


/* =========================================================
   CLOSED MONTH SPECIAL CASE
========================================================= */

function mapClosedMonth(
  message
) {

  const match =
    message.match(
      /Financial month\s+([0-9]{4}-[0-9]{2})\s+is closed/i
    );


  if (!match) {

    return null;

  }


  return {
    message:
      `Financial month ${match[1]} is closed. Historical onboarding cannot modify it.`,

    details:
      "Choose a different historical range or contact the group administrator about the closed period."

  };

}


/* =========================================================
   ERROR CODE NORMALIZATION
========================================================= */

function normalizeKey(
  value
) {

  return String(
    value || ""
  )
    .trim();

}


/* =========================================================
   MAIN MAP
========================================================= */

export function mapRpcError(
  error
) {

  console.error(
    "CHAMA LIVE: Add Member RPC error — raw error:",
    error
  );


  if (!error) {

    return {
      message:
        "Something went wrong while contacting CHAMA LIVE. Please try again.",

      details:
        "No error object was returned."

    };

  }


  const code =
    normalizeKey(
      error.code
    );


  const message =
    getRawMessage(
      error
    );


  const details =
    String(
      error.details ||
      ""
    ).trim();


  const hint =
    String(
      error.hint ||
      ""
    ).trim();


  const closed =
    mapClosedMonth(
      message
    );


  if (closed) {

    return closed;

  }


  const candidates = [

    message,

    code,

    details,

    hint

  ].filter(
    Boolean
  );


  for (
    const candidate
    of candidates
  ) {

    if (
      FRIENDLY_MESSAGES.has(
        candidate
      )
    ) {

      return {

        message:
          FRIENDLY_MESSAGES.get(
            candidate
          ),

        details:
          buildDetails(
            error,
            candidate
          )

      };

    }

  }


  /*
   * Some PostgreSQL/PostgREST responses contain the
   * application error code in the message rather than
   * error.code.
   */

  for (
    const [
      key,
      friendly
    ]
    of FRIENDLY_MESSAGES
  ) {

    if (
      message
        .toLowerCase()
        .includes(
          key.toLowerCase()
        )
    ) {

      return {

        message:
          friendly,

        details:
          buildDetails(
            error,
            key
          )

      };

    }

  }


  return {

    message:
      "Something went wrong while contacting CHAMA LIVE. Please try again.",

    details:
      buildDetails(
        error,
        "unknown"
      )

  };

}


/* =========================================================
   DETAILS
========================================================= */

function buildDetails(
  error,
  matched
) {

  const parts = [];


  if (
    error?.message
  ) {

    parts.push(
      `Raw message: ${String(error.message)}`
    );

  }


  if (
    error?.code
  ) {

    parts.push(
      `Code: ${String(error.code)}`
    );

  }


  if (
    error?.details
  ) {

    parts.push(
      `Details: ${String(error.details)}`
    );

  }


  if (
    error?.hint
  ) {

    parts.push(
      `Hint: ${String(error.hint)}`
    );

  }


  if (
    matched &&
    matched !== "unknown"
  ) {

    parts.push(
      `Matched: ${matched}`
    );

  }


  return parts.join(
    " • "
  );

}
