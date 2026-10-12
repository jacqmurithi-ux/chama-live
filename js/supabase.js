import {
  createClient
} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* =========================================================
   CHAMA LIVE — SUPABASE PROJECT ROUTING

   Production domain -> production Supabase project.
   Vercel previews and other non-production hosts -> candidate
   project, so test logins do not silently use production.

   Publishable/anon client keys are designed for browser use.
   Never place a service-role or secret key in this file.
========================================================= */

const PRODUCTION_HOSTS = new Set([
  "chamalive.co.ke",
  "www.chamalive.co.ke"
]);

const PRODUCTION_SUPABASE_URL =
  "https://ptktftwyltxmtcodyzoa.supabase.co";

const PRODUCTION_PUBLISHABLE_KEY =
  "sb_publishable_WFptuzqTTfPvFit8mfh-og_5UaxqvbO";

const CANDIDATE_SUPABASE_URL =
  "https://onzaonflquipqmhgslxi.supabase.co";

const CANDIDATE_PUBLISHABLE_KEY =
  "sb_publishable_0jhKFtRCnOx0WDcO3PwcMg_GGsnN3kc";

const isProductionHost =
  typeof window !== "undefined" &&
  PRODUCTION_HOSTS.has(window.location.hostname.toLowerCase());

const SUPABASE_URL = isProductionHost
  ? PRODUCTION_SUPABASE_URL
  : CANDIDATE_SUPABASE_URL;

const SUPABASE_PUBLISHABLE_KEY = isProductionHost
  ? PRODUCTION_PUBLISHABLE_KEY
  : CANDIDATE_PUBLISHABLE_KEY;

/* =========================================================
   CLIENT
========================================================= */

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,

      /*
       * CHAMA LIVE uses the PKCE verification flow.
       * confirm.html performs the explicit exchangeCodeForSession()
       * call, so automatic URL detection stays disabled.
       */
      detectSessionInUrl: false,
      flowType: "pkce"
    }
  }
);

console.info(
  "CHAMA LIVE: Supabase client loaded.",
  isProductionHost ? "production project" : "candidate project"
);
