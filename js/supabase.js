import {
  createClient
} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";


/* =========================================================
   CHAMA LIVE — SUPABASE
   Candidate preview configuration only.
   Do not point candidate builds at production.
========================================================= */

const SUPABASE_URL =
  "https://onzaonflquipqmhgslxi.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_0jhKFtRCnOx0WDcO3PwcMg_GGsnN3kc";


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
         * confirm.html explicitly exchanges the code.
         */
        detectSessionInUrl: false,
        flowType: "pkce"
      }
    }
  );

console.log(
  "CHAMA LIVE: Candidate Supabase client loaded."
);
