/* =========================================================
   CHAMA LIVE — API CLIENT
   ---------------------------------------------------------
   Responsibilities:
   • RPC allowlisting
   • Cached reads
   • In-flight request de-duplication
   • Cache invalidation
   • Sanitised user-facing database errors
   • Diagnostic browser-console logging
   ---------------------------------------------------------
   IMPORTANT:
   • Do not expose raw PostgreSQL errors to users.
   • Raw provider errors remain available in DevTools.
   • Do not bypass the RPC allowlist.
   • Do not perform direct accounting-table writes here.
   ========================================================= */

const DEFAULT_CACHE_TTL_MS = 15_000;

/* =========================================================
   SAFE DATABASE / RPC APPLICATION MESSAGES
   ========================================================= */

const SAFE_DB_MESSAGES = new Map([
  /* Authentication / authorisation */
  [
    "AUTHENTICATION_REQUIRED",
    "You must be signed in to complete this action."
  ],
  [
    "ACTIVE_GROUP_MEMBER_REQUIRED",
    "Your account must be an active group member to complete this action."
  ],
  [
    "MEMBER_MANAGEMENT_NOT_AUTHORIZED",
    "Only an authorised group manager can add members."
  ],

  /* Member validation */
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

  /* Member actual position */
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

  /* Duplicate member identifiers */
  [
    "MEMBER_NUMBER_ALREADY_EXISTS",
    "That member number is already in use in this group."
  ],
  [
    "MEMBERSHIP_NUMBER_ALREADY_EXISTS",
    "That membership number is already in use in this group."
  ],

  /* Contribution plan */
  [
    "CONTRIBUTION_PLAN_INVALID",
    "The contribution plan submitted for this member is invalid."
  ],
  [
    "CONTRIBUTION_PLAN_ITEM_INVALID",
    "One of the contribution plan entries is invalid."
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
  ]
]);

/* =========================================================
   ERROR NORMALISATION
   ========================================================= */

function safeError(error, scope) {
  const code = String(error?.code || "").trim();
  const rawMessage = String(error?.message || "").trim();

  const details = error?.details ?? null;
  const hint = error?.hint ?? null;

  /*
   * Diagnostic-only logging.
   *
   * The raw Supabase/PostgreSQL provider error remains visible
   * in the browser console for development/debugging.
   *
   * It is NOT returned to the UI.
   */
  console.error("[CHAMA LIVE API] Supabase error", {
    scope,
    code,
    message: rawMessage,
    details,
    hint,
    raw: error
  });

  /* =======================================================
     CANONICAL APPLICATION ERRORS
     ======================================================= */

  if (SAFE_DB_MESSAGES.has(rawMessage)) {
    return {
      code: code || "CLIENT_ERROR",
      message: SAFE_DB_MESSAGES.get(rawMessage)
    };
  }

  /* =======================================================
     AUTHENTICATION / AUTHORISATION
     ======================================================= */

  if (code === "42501") {
    return {
      code,
      message:
        "You do not have permission to complete this action."
    };
  }

  /* =======================================================
     UNIQUE / DUPLICATE
     ======================================================= */

  if (code === "23505") {
    return {
      code,
      message:
        "A member with the same member or membership number already exists in this group."
    };
  }

  /* =======================================================
     EXCLUSION / CONTRIBUTION RULE OVERLAP
     ======================================================= */

  if (code === "23P01") {
    return {
      code,
      message:
        "The contribution plan overlaps an existing contribution rule."
    };
  }

  /* =======================================================
     CHECK CONSTRAINT — MEMBERSHIP NUMBER FORMAT
     ======================================================= */

  if (
    code === "23514" &&
    rawMessage.includes(
      "members_membership_number_format_ck"
    )
  ) {
    return {
      code,
      message:
        "Membership Number must be exactly 4 digits, for example 0002."
    };
  }

  /* =======================================================
     OTHER CHECK CONSTRAINT FAILURES
     ======================================================= */

  if (code === "23514") {
    return {
      code,
      message:
        "One of the values entered is not allowed. Check the form and try again."
    };
  }

  /* =======================================================
     42883 — UNDEFINED FUNCTION / OPERATOR
     -------------------------------------------------------
     IMPORTANT:
     This is intentionally NOT swallowed silently.
     The raw PostgreSQL message is already logged above.
     ======================================================= */

  if (code === "42883") {
    console.error(
      "[CHAMA LIVE API] PostgreSQL 42883 — undefined function/operator.",
      {
        scope,
        code,
        message: rawMessage,
        details,
        hint
      }
    );

    return {
      code,
      message:
        `${scope} is temporarily unavailable. Refresh and try again.`
    };
  }

  /* =======================================================
     P0001 — APPLICATION-RAISED DATABASE EXCEPTION
     -------------------------------------------------------
     Known application messages are handled above.
     Unknown P0001 errors remain sanitised.
     ======================================================= */

  if (code === "P0001") {
    return {
      code,
      message:
        `${scope} could not be completed. Check the entered information and try again.`
    };
  }

  /* =======================================================
     POSTGRESQL / POSTGREST STRUCTURAL ERRORS
     ======================================================= */

  if (/^PGRST|^42/.test(code)) {
    return {
      code: code || "CLIENT_ERROR",
      message:
        `${scope} is temporarily unavailable. Refresh and try again.`
    };
  }

  /* =======================================================
     FALLBACK
     ======================================================= */

  return {
    code: code || "CLIENT_ERROR",
    message:
      "Something went wrong while contacting CHAMA LIVE. Please try again."
  };
}

/* =========================================================
   API CLIENT FACTORY
   ========================================================= */

export function createApiClient(
  supabase,
  {
    allowedRpcs = [],
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    errorScope = "This information",
    invalidateByRpc = {}
  } = {}
) {
  /* =======================================================
     RPC ALLOWLIST
     ======================================================= */

  const rpcAllowlist = new Set(
    Array.isArray(allowedRpcs)
      ? allowedRpcs
      : []
  );

  /* =======================================================
     CACHE
     ======================================================= */

  const cache = new Map();

  /* =======================================================
     IN-FLIGHT REQUESTS
     -------------------------------------------------------
     Prevents duplicate simultaneous reads.
     ======================================================= */

  const inFlight = new Map();

  /* =======================================================
     GENERIC REQUEST WRAPPER
     ======================================================= */

  async function request(work) {
    try {
      const result = await work();

      return {
        data: result?.data ?? null,

        error: result?.error
          ? safeError(
              result.error,
              errorScope
            )
          : null,

        ...(result?.count !== undefined
          ? {
              count: result.count
            }
          : {})
      };
    } catch (error) {
      return {
        data: null,
        error: safeError(
          error,
          errorScope
        )
      };
    }
  }

  /* =======================================================
     CACHED READ
     ======================================================= */

  async function readCached(key, work) {
    const cached = cache.get(key);

    /* -----------------------------------------------------
       Valid cached result
       ----------------------------------------------------- */

    if (
      cached &&
      cached.expiresAt > Date.now()
    ) {
      return cached.result;
    }

    /* -----------------------------------------------------
       Existing request already in progress
       ----------------------------------------------------- */

    if (inFlight.has(key)) {
      return inFlight.get(key);
    }

    /* -----------------------------------------------------
       Execute request
       ----------------------------------------------------- */

    const pending = request(work)
      .then((result) => {
        /*
         * Only successful results are cached.
         * Errors must never poison the cache.
         */
        if (!result.error) {
          cache.set(key, {
            result,
            expiresAt:
              Date.now() + cacheTtlMs
          });
        }

        inFlight.delete(key);

        return result;
      })
      .catch((error) => {
        /*
         * Safety net in case a promise unexpectedly rejects
         * outside the normal request() handling.
         */
        inFlight.delete(key);

        return {
          data: null,
          error: safeError(
            error,
            errorScope
          )
        };
      });

    inFlight.set(
      key,
      pending
    );

    return pending;
  }

  /* =======================================================
     CACHE INVALIDATION
     ======================================================= */

  function invalidateCache(
    prefixes = []
  ) {
    if (
      !Array.isArray(prefixes) ||
      prefixes.length === 0
    ) {
      return;
    }

    for (const key of cache.keys()) {
      if (
        prefixes.some(
          (prefix) =>
            key.startsWith(prefix)
        )
      ) {
        cache.delete(key);
      }
    }
  }

  /* =======================================================
     RPC
     ======================================================= */

  async function rpc(
    name,
    args
  ) {
    /* -----------------------------------------------------
       RPC allowlist protection
       ----------------------------------------------------- */

    if (!rpcAllowlist.has(name)) {
      return {
        data: null,
        error: {
          code:
            "UNSUPPORTED_OPERATION",
          message:
            "This action is not available."
        }
      };
    }

    /* -----------------------------------------------------
       Execute canonical Supabase RPC
       ----------------------------------------------------- */

    const result = await request(
      () =>
        supabase.rpc(
          name,
          args
        )
    );

    /* -----------------------------------------------------
       Invalidate related reads only after successful RPC
       ----------------------------------------------------- */

    if (!result.error) {
      invalidateCache(
        invalidateByRpc[name] || []
      );
    }

    return result;
  }

  /* =======================================================
     PUBLIC API
     ======================================================= */

  return Object.freeze({
    request,
    readCached,
    rpc,
    invalidateCache
  });
}
