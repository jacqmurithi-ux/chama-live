"use strict";

/*
 * ============================================================
 * CHAMA LIVE — SUPABASE CLIENT
 * PART 1 OF 2
 * ============================================================
 *
 * ONE Supabase client for the entire Chama Live application.
 *
 * Other files use:
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
  "sb_publishable_Nfuc0Xj1LuSU-qJmSXpH5A_GSTMvmSS";


/* ============================================================
   BASIC CONFIGURATION CHECK
   ============================================================ */

if (
  !CHAMA_SUPABASE_URL
) {

  console.error(
    "Chama Live: Supabase URL is missing."
  );

}


if (
  !CHAMA_SUPABASE_ANON_KEY
) {

  console.error(
    "Chama Live: Supabase Publishable Key is missing."
  );

}


/* ============================================================
   CHECK SUPABASE LIBRARY
   ============================================================ */

if (
  typeof window.supabase === "undefined"
) {

  console.error(
    "Chama Live: Supabase JavaScript library is not loaded."
  );

}
else if (
  typeof window.supabase.createClient !== "function"
) {

  console.error(
    "Chama Live: supabase.createClient() is unavailable."
  );

}
else {

  console.log(
    "Chama Live: Supabase library detected."
  );

}


/* ============================================================
   CREATE SINGLE CLIENT
   ============================================================ */

(function initializeChamaSupabase() {

  /*
   * Prevent duplicate clients.
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
   * Stop if the CDN did not load.
   */

  if (
    typeof window.supabase === "undefined"
  ) {

    console.error(
      "Chama Live: Cannot initialize Supabase because the CDN library is missing."
    );

    return;

  }


  /*
   * Stop if createClient is unavailable.
   */

  if (
    typeof window.supabase.createClient !== "function"
  ) {

    console.error(
      "Chama Live: Supabase createClient() is unavailable."
    );

    return;

  }


  /*
   * Create the ONE application client.
   */

  try {

    window.chamaSupabase =
      window.supabase.createClient(
        CHAMA_SUPABASE_URL,
        CHAMA_SUPABASE_ANON_KEY,
        {

          auth: {

            /*
             * Keep the login session in the browser.
             */

            persistSession:
              true,

            /*
             * Refresh expired access tokens.
             */

            autoRefreshToken:
              true,

            /*
             * Allow Supabase auth callbacks.
             */

            detectSessionInUrl:
              true

          }

        }
      );


    console.log(
      "Chama Live: Supabase client created."
    );


  }
  catch (error) {

    console.error(
      "Chama Live: Failed to create Supabase client:",
      error
    );

  }

})();
/* ============================================================
   GET SUPABASE CLIENT
   ============================================================ */

function getSupabaseClient() {

  /*
   * Check that the client exists.
   */

  if (
    !window.chamaSupabase
  ) {

    throw new Error(
      "Supabase client is not initialized. " +
      "Check the Supabase CDN and supabase-client.js."
    );

  }


  /*
   * Check that Auth is available.
   *
   * This prevents the previous error:
   *
   *     supabase.auth is undefined
   *
   */

  if (
    !window.chamaSupabase.auth
  ) {

    throw new Error(
      "Supabase Auth is unavailable. " +
      "The Supabase client was not initialized correctly."
    );

  }


  return window.chamaSupabase;

}


/* ============================================================
   GLOBAL EXPORT
   ============================================================ */

window.getSupabaseClient =
  getSupabaseClient;


/* ============================================================
   VERIFY CLIENT
   ============================================================ */

(function verifyChamaSupabase() {

  /*
   * Give the browser a moment to finish loading
   * the Supabase client.
   */

  if (
    !window.chamaSupabase
  ) {

    console.error(
      "Chama Live: Supabase client verification failed."
    );

    return;

  }


  /*
   * Verify Auth exists.
   */

  if (
    !window.chamaSupabase.auth
  ) {

    console.error(
      "Chama Live: Supabase client exists but Auth is unavailable."
    );

    return;

  }


  /*
   * Successful initialization.
   */

  console.log(
    "Chama Live: Supabase Auth is available."
  );


  /*
   * Optional session check.
   *
   * This does NOT sign the user in or out.
   *
   * It only confirms that Auth is responding.
   */

  window.chamaSupabase.auth
    .getSession()
    .then(
      function(result) {

        if (
          result.error
        ) {

          console.warn(
            "Chama Live: Session check returned an error:",
            result.error
          );

          return;

        }


        if (
          result.data &&
          result.data.session
        ) {

          console.log(
            "Chama Live: Existing authenticated session detected."
          );

        }
        else {

          console.log(
            "Chama Live: No active session. User can log in."
          );

        }

      }
    )
    .catch(
      function(error) {

        console.error(
          "Chama Live: Auth session check failed:",
          error
        );

      }
    );

})();


/* ============================================================
   SUPABASE AUTH STATE LISTENER
   ============================================================ */

if (
  window.chamaSupabase &&
  window.chamaSupabase.auth
) {

  window.chamaSupabase.auth
    .onAuthStateChange(
      function(
        event,
        session
      ) {

        console.log(
          "Chama Live Auth Event:",
          event
        );


        /*
         * Do not automatically redirect here.
         *
         * Login page handles successful login.
         * Protected pages handle their own session checks.
         */

        if (
          session &&
          session.user
        ) {

          console.log(
            "Chama Live: Authenticated user:",
            session.user.id
          );

        }

      }
    );

}


/* ============================================================
   FINAL READY MESSAGE
   ============================================================ */

console.log(
  "Chama Live: supabase-client.js loaded successfully."
);
