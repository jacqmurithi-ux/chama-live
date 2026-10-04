const DEFAULT_CACHE_TTL_MS = 15_000;

const SAFE_DB_MESSAGES = new Map([
  ["AUTHENTICATION_REQUIRED", "You must be signed in to complete this action."],
  ["ACTIVE_GROUP_MEMBER_REQUIRED", "Your account must be an active group member to complete this action."],
  ["MEMBER_MANAGEMENT_NOT_AUTHORIZED", "Only a group admin or chairperson can add members."],
  ["MEMBER_NUMBER_REQUIRED", "Member number is required."],
  ["MEMBERSHIP_NUMBER_REQUIRED", "Membership number is required."],
  ["MEMBER_NAME_REQUIRED", "Member name is required."],
  ["MEMBER_PHONE_REQUIRED", "Member phone number is required."],
  ["MEMBER_ROLE_INVALID", "The selected member role is not valid."],
  ["MEMBER_STATUS_INVALID", "The selected member status is not valid."],
  ["MEMBER_ONBOARDING_STATUS_INVALID", "The selected onboarding status is not valid."],
  ["ACTUAL_POSITION_INVALID", "The selected actual group position is not valid."],
  ["ACTUAL_POSITION_NAME_REQUIRED", "A position name is required when Actual Position is Other."],
  ["ACTUAL_POSITION_EFFECTIVE_DATE_INVALID", "The actual position effective date is invalid."],
  ["ACTUAL_POSITION_EFFECTIVE_DATE_BEFORE_JOIN_DATE", "The actual position effective date cannot be before the join date."],
  ["MEMBER_NUMBER_ALREADY_EXISTS", "That member number is already in use in this group."],
  ["MEMBERSHIP_NUMBER_ALREADY_EXISTS", "That membership number is already in use in this group."],
  ["CONTRIBUTION_PLAN_INVALID", "The contribution plan submitted for this member is invalid."],
  ["CONTRIBUTION_PLAN_ITEM_INVALID", "One of the contribution plan entries is invalid."],
  ["CONTRIBUTION_TYPE_ID_INVALID", "The selected contribution type is invalid."],
  ["CONTRIBUTION_TYPE_ID_REQUIRED", "A contribution type is required."],
  ["CONTRIBUTION_AMOUNT_INVALID", "The monthly contribution amount must be greater than zero."],
  ["CONTRIBUTION_FREQUENCY_NOT_SUPPORTED", "Only monthly contribution plans are supported here."],
  ["CONTRIBUTION_EFFECTIVE_DATE_BEFORE_JOIN_DATE", "The contribution effective date cannot be before the join date."],
  ["CONTRIBUTION_EFFECTIVE_DATE_RANGE_INVALID", "The contribution effective date range is invalid."],
  ["FIRST_PERIOD_RULE_NOT_SUPPORTED", "The selected first-period contribution rule is not supported."],
  ["CONTRIBUTION_RULE_STATUS_INVALID", "The contribution rule status is invalid."],
  ["ENDED_RULE_REQUIRES_EFFECTIVE_TO", "An ended contribution rule requires an end date."],
  ["CONTRIBUTION_TYPE_NOT_IN_GROUP", "The selected contribution type does not belong to this group."],
  ["CONTRIBUTION_TYPE_NOT_SUPPORTED", "The selected contribution type is not supported for member creation."],
  ["CONTRIBUTION_RULE_OVERLAP", "The contribution plan overlaps an existing contribution rule."],
]);

function safeError(error, scope) {
  const code = String(error?.code || "");
  const rawMessage = String(error?.message || "").trim();

  if (SAFE_DB_MESSAGES.has(rawMessage)) {
    return {
      code: code || "CLIENT_ERROR",
      message: SAFE_DB_MESSAGES.get(rawMessage)
    };
  }

  if (code === "42501") {
    return {
      code,
      message: "You do not have permission to complete this action."
    };
  }

  if (code === "23505") {
    return {
      code,
      message: "A member with the same member or membership number already exists in this group."
    };
  }

  if (code === "23P01") {
    return {
      code,
      message: "The contribution plan overlaps an existing contribution rule."
    };
  }

  if (/^PGRST|^42/.test(code)) {
    return {
      code: code || "CLIENT_ERROR",
      message: `${scope} is temporarily unavailable. Refresh and try again.`
    };
  }

  /*
   * Supabase/PostgREST errors outside the known application contract
   * remain intentionally generic. The full provider error is still
   * logged by the calling page for development diagnostics.
   */
  return {
    code: code || "CLIENT_ERROR",
    message: "Something went wrong while contacting CHAMA LIVE. Please try again."
  };
}

export function createApiClient(
  supabase,
  {
    allowedRpcs = [],
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    errorScope = "This information",
    invalidateByRpc = {}
  } = {}
) {
  const rpcAllowlist = new Set(allowedRpcs);
  const cache = new Map();
  const inFlight = new Map();

  async function request(work) {
    try {
      const result = await work();

      return {
        data: result?.data ?? null,
        error: result?.error ? safeError(result.error, errorScope) : null,
        ...(result?.count !== undefined ? { count: result.count } : {})
      };
    } catch (error) {
      return {
        data: null,
        error: safeError(error, errorScope)
      };
    }
  }

  async function readCached(key, work) {
    const cached = cache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    if (inFlight.has(key)) {
      return inFlight.get(key);
    }

    const pending = request(work).then((result) => {
      if (!result.error) {
        cache.set(key, {
          result,
          expiresAt: Date.now() + cacheTtlMs
        });
      }

      inFlight.delete(key);
      return result;
    });

    inFlight.set(key, pending);
    return pending;
  }

  function invalidateCache(prefixes = []) {
    for (const key of cache.keys()) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        cache.delete(key);
      }
    }
  }

  async function rpc(name, args) {
    if (!rpcAllowlist.has(name)) {
      return {
        data: null,
        error: {
          code: "UNSUPPORTED_OPERATION",
          message: "This action is not available."
        }
      };
    }

    const result = await request(() => supabase.rpc(name, args));

    if (!result.error) {
      invalidateCache(invalidateByRpc[name] || []);
    }

    return result;
  }

  return Object.freeze({
    request,
    readCached,
    rpc,
    invalidateCache
  });
}
