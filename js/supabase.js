import {
  createClient
} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";


/* =========================================================
   CHAMA LIVE — SUPABASE
========================================================= */

const SUPABASE_URL =
  "https://ptktftwyltxmtcodyzoa.supabase.co";


const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_Nfuc0Xj1LuSU-qJmSXpH5A_GSTMvmSS";


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
         * detectSessionInUrl allows the Supabase client
         * to process the returned authentication URL.
         */
        detectSessionInUrl: true,
        flowType: "pkce"
      }
    }
  );


console.log(
  "CHAMA LIVE: Supabase client loaded."
);
