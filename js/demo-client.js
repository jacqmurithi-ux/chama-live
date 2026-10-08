/* =========================================================
   CHAMA LIVE — DEMO READ CLIENT
   STEP 3
   ---------------------------------------------------------
   Browser stores only an opaque bearer token.
   The token is resolved by tightly-scoped demo RPCs.
   The browser NEVER supplies group_id as authorization.

   DEMO DATABASE ISOLATION
   ---------------------------------------------------------
   Normal CHAMA LIVE pages continue using the production
   Supabase client from ./supabase.js.

   Demo pages use a separate browser client pointed at the
   candidate/test Supabase project. This keeps the opaque
   demo session in the same project that created it.
========================================================= */

import {
  createClient
} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const DEMO_SUPABASE_URL =
  "https://onzaonflquipqmhgslxi.supabase.co";

const DEMO_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_0jhKFtRCnOx0WDcO3PwcMg_GGsnN3kc";

const demoSupabase =
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

export const DEMO_TOKEN_KEY = "chama_live_demo_token";

export function getDemoToken() {
  try {
    const token = window.sessionStorage.getItem(DEMO_TOKEN_KEY);
    return String(token || "").trim() || null;
  } catch {
    return null;
  }
}

export function isDemoMode() {
  return Boolean(getDemoToken());
}

async function callDemoRpc(name) {
  const token = getDemoToken();

  if (!token) {
    throw new Error("No active CHAMA LIVE demo session.");
  }

  const { data, error } = await demoSupabase.rpc(name, {
    p_token: token
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function getDemoContext() {
  return callDemoRpc("cl_demo_get_context");
}

export async function getDemoGroup() {
  const data = await callDemoRpc("cl_demo_get_group");
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function getDemoMembers() {
  const data = await callDemoRpc("cl_demo_get_members");
  return Array.isArray(data) ? data : [];
}

export async function getDemoMeetings() {
  const data = await callDemoRpc("cl_demo_get_meetings");
  return Array.isArray(data) ? data : [];
}

export async function getDemoAttendance() {
  const data = await callDemoRpc("cl_demo_get_attendance");
  return Array.isArray(data) ? data : [];
}

export function clearDemoSession() {
  try {
    window.sessionStorage.removeItem(DEMO_TOKEN_KEY);
  } catch {
    /* Ignore storage failures. */
  }
}
