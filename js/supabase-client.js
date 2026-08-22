"use strict";

/*
 * ============================================================
 * CHAMA LIVE — SUPABASE CLIENT
 * ============================================================
 *
 * This file creates ONE Supabase client for the whole app.
 *
 * Other files should use:
 *
 *     window.chamaSupabase
 *
 * Do NOT create another Supabase client in:
 *
 *     supabase-auth.js
 *     supabase-data.js
 *     contributions.html
 *
 * ============================================================
 */


/* ============================================================
   SUPABASE CONFIGURATION
   ============================================================ */

const CHAMA_SUPABASE_URL =
  "https://ptktftwyltxmtcodyzo.supabase.co";


const CHAMA_SUPABASE_ANON_KEY =
  "PASTE_YOUR_EXISTING_SUPABASE_ANON_KEY_HERE";


/* ============================================================
   VALIDATE CONFIGURATION
   ============================================================ */

if (
  !CHAMA_SUPABASE_URL ||
  CHAMA_SUPABASE_URL.includes("YOUR_")
) {

  console.error(
    "Chama Live: Supabase URL is not configured."
  );

}


if (
  !CHAMA_SUPABASE_ANON_KEY ||
  CHAMA_SUPABASE_ANON_KEY.includes("PASTE_YOUR")
) {

  console.error(
    "Chama Live: Supabase anon key is not configured."
  );

}


/* ============================================================
   CREATE CLIENT
   ============================================================ */

(function () {

  /*
   * Make sure the Supabase CDN loaded.
   */

  if (
    typeof window.supabase === "undefined"
  ) {

    console.error(
      "Chama Live: Supabase JavaScript library did not load."
    );

    return;
  }


  /*
   * Make sure createClient exists.
   */

  if (
    typeof window.supabase.createClient !== "function"
  ) {

    console.error(
      "Chama Live: supabase.createClient() is unavailable."
    );

    return;
  }


  /*
   * Do not create duplicate clients.
   */

  if (
    window.chamaSupabase
  ) {

    console.log(
      "Chama Live: Existing Supabase client reused."
    );

    return;
  }


  /*
   * Create the single application client.
   */

  window.chamaSupabase =
    window.supabase.createClient(
      CHAMA_SUPABASE_URL,
      CHAMA_SUPABASE_ANON_KEY,
      {

        auth: {

          /*
           * Keep login session in browser.
           */

          persistSession: true,

          /*
           * Automatically refresh expired tokens.
           */

          autoRefreshToken: true,

          /*
           * Detect authentication session
           * from URL when applicable.
           */

          detectSessionInUrl: true

        }

      }
    );


  /*
   * Verify the client actually contains auth.
   */

  if (
    !window.chamaSupabase.auth
  ) {

    console.error(
      "Chama Live: Supabase client was created without auth."
    );

    return;
  }


  console.log(
    "Chama Live: Supabase client initialized successfully."
  );

})();


/* ============================================================
   GLOBAL HELPER
   ============================================================ */

function getSupabaseClient() {

  if (
    !window.chamaSupabase
  ) {

    throw new Error(
      "Supabase client is not initialized. Check js/supabase-client.js."
    );
  }


  if (
    !window.chamaSupabase.auth
  ) {

    throw new Error(
      "Supabase Auth is unavailable. Check the Supabase CDN and client configuration."
    );
  }


  return window.chamaSupabase;
}


/* ============================================================
   EXPORT HELPER
   ============================================================ */

window.getSupabaseClient =
  getSupabaseClient;
