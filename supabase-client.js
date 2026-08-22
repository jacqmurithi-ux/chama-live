(function () {
  "use strict";

  const SUPABASE_URL =
    "https://ptktftwyltxmtcodyzoa.supabase.co";

  /*
   * IMPORTANT:
   * Put your EXISTING Supabase Publishable/Anon key below.
   * Never use the service_role key in browser code.
   */
  const SUPABASE_KEY = "YOUR_EXISTING_PUBLISHABLE_OR_ANON_KEY";

  if (!window.supabase) {
    console.error(
      "ERROR: Supabase JavaScript library is not loaded."
    );
    return;
  }

  if (typeof window.supabase.createClient !== "function") {
    console.error(
      "ERROR: window.supabase.createClient is unavailable."
    );
    return;
  }

  if (
    !SUPABASE_KEY ||
    SUPABASE_KEY === "YOUR_EXISTING_PUBLISHABLE_OR_ANON_KEY"
  ) {
    console.error(
      "ERROR: Supabase publishable/anon key is missing."
    );
    return;
  }

  try {

    const client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage
        }
      }
    );

    window.chamaSupabase = client;

    console.log(
      "Chama Live: Supabase client initialized successfully."
    );

  } catch (error) {

    console.error(
      "Chama Live: Failed to initialize Supabase client.",
      error
    );

  }

})();
