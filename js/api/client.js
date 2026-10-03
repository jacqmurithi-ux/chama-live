const DEFAULT_CACHE_TTL_MS = 15_000;

function safeError(error, scope) {
  const code = String(error?.code || "");
  let message = "Something went wrong while contacting CHAMA LIVE. Please try again.";

  if (code === "42501") {
    message = "You do not have permission to complete this action.";
  } else if (/^PGRST|^42/.test(code)) {
    message = `${scope} is temporarily unavailable. Refresh and try again.`;
  }

  return { code: code || "CLIENT_ERROR", message };
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
