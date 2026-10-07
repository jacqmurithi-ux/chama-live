/* =========================================================
   CHAMA LIVE — DEMO READ CLIENT
   STEP 3
   ---------------------------------------------------------
   Browser stores only an opaque bearer token.
   The token is resolved by tightly-scoped demo RPCs.
   The browser NEVER supplies group_id as authorization.
========================================================= */

import { supabase } from "./supabase.js";

export const DEMO_TOKEN_KEY = "chama_live_demo_token";

export function getDemoToken() {
  try {
    const token = window.localStorage.getItem(DEMO_TOKEN_KEY);
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

  const { data, error } = await supabase.rpc(name, {
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
    window.localStorage.removeItem(DEMO_TOKEN_KEY);
  } catch {
    /* Ignore storage failures. */
  }
}
