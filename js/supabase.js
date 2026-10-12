import {
  createClient
} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";


/* =========================================================
   CHAMA LIVE — SUPABASE
========================================================= */

// Candidate Vercel preview deployments must use the isolated candidate
// Supabase project. The official portal hosts (including chamalive.co.ke)
// continue to use production. Never point a preview at production data.
const isCandidatePreview =
  typeof window !== "undefined" &&
  /^chama-live-[a-z0-9]+-chamalive\.vercel\.app$/i.test(window.location.hostname);

const SUPABASE_URL = isCandidatePreview
  ? "https://onzaonflquipqmhgslxi.supabase.co"
  : "https://ptktftwyltxmtcodyzoa.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = isCandidatePreview
  ? "sb_publishable_0jhKFtRCnOx0WDcO3PwcMg_GGsnN3kc"
  : "sb_publishable_Nfuc0Xj1LuSU-qJmSXpH5A_GSTMvmSS";


/* =========================================================
   CLIENT
========================================================= */

export const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,

        /*
         * CHAMA LIVE uses the PKCE verification flow.
         *
         * signup.js
         *      ↓
         * Supabase Auth
         *      ↓
         * email verification
         *      ↓
         * confirm.html
         *
         * confirm.html is responsible for the explicit
         * exchangeCodeForSession() call.
         *
         * Automatic URL detection is therefore disabled.
         * This prevents the shared client from consuming
         * the authorization code before confirm.html can
         * perform the PKCE exchange with its verifier.
         */
        detectSessionInUrl: false,

        flowType: "pkce"
      }
    }
  );


console.log(
  "CHAMA LIVE: Supabase client loaded."
);
