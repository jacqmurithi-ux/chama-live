(function () {
  "use strict";

  const SUPABASE_URL =
    "https://ptktftwyltxmtcodyzoa.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_Nfuc0Xj1LuSU-qJmSXpH5A_GSTMvmSS";

  /*
   * Make sure the Supabase CDN library has loaded first.
   */
  if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
  ) {
    console.error(
      "Chama Live: Supabase JavaScript library was not loaded."
    );

    return;
  }

  /*
   * Create the Supabase client.
   */
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

    /*
     * Make the client available to the rest
     * of the Chama Live application.
     */
    window.chamaSupabase = client;

    console.log(
      "Chama Live: Supabase client initialized successfully."
    );

  } catch (error) {

    console.error(
      "Chama Live: Supabase client initialization failed.",
      error
    );

  }

})();
