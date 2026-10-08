/* =========================================================
   CHAMA LIVE — DEMO DATA ACCESS BOUNDARY
   STEP 1
   ---------------------------------------------------------
   This module is the only browser-side entry point intended
   for future demo page data access.

   The verified demo token is opaque. No group_id is accepted
   from the caller. The candidate database resolves the token
   to the fixed E2600 demo boundary.

   IMPORTANT:
   ---------------------------------------------------------
   Step 1 intentionally exposes only the existing read RPC
   contract. Interactive session writes/reset semantics are
   introduced only after the approved data plan and sandbox
   implementation gates.
========================================================= */

import {
  createClient
} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const DEMO_SUPABASE_URL =
  "https://onzaonflquipqmhgslxi.supabase.co";

const DEMO_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_0jhKFtRCnOx0WDcO3PwcMg_GGsnN3kc";

export const DEMO_TOKEN_KEY =
  "chama_live_demo_token";

const demoClient =
  createClient(
    DEMO_SUPABASE_URL,
    DEMO_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );

export function getDemoToken() {
  try {
    const token =
      window.sessionStorage.getItem(
        DEMO_TOKEN_KEY
      );

    return String(token || "").trim() || null;

  } catch {
    return null;
  }
}

export function isDemoSession() {
  return Boolean(
    getDemoToken()
  );
}

export async function demoRpc(
  name
) {

  const token =
    getDemoToken();

  if (!token) {
    throw new Error(
      "No active CHAMA LIVE demo session."
    );
  }

  const {
    data,
    error
  } =
    await demoClient.rpc(
      name,
      {
        p_token: token
      }
    );

  if (error) {
    throw error;
  }

  return data;

}

export async function getDemoContext() {
  return demoRpc(
    "cl_demo_get_context"
  );
}

export async function getDemoGroup() {

  const data =
    await demoRpc(
      "cl_demo_get_group"
    );

  return Array.isArray(data)
    ? data[0] || null
    : data || null;

}

export function clearDemoSession() {

  try {
    window.sessionStorage.removeItem(
      DEMO_TOKEN_KEY
    );
  } catch {
    /* Ignore storage failures. */
  }

}
