"use strict";

(function () {

  const SUPABASE_URL =
    "https://ptktftwyltxmtcodyzoa.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_Nfuc0Xj1LuSU-qJmSXpH5A_GSTMvmSS";

  if (typeof window.supabase === "undefined") {

    console.error(
      "Chama Live: Supabase JS library did not load."
    );

    window.chamaSupabase = null;

    return;
  }

  try {

    window.chamaSupabase =
      window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: "chama-live-auth"
          }
        }
      );

    console.log(
      "Chama Live Supabase client ready."
    );

  } catch (error) {

    console.error(
      "Chama Live Supabase initialization failed:",
      error
    );

    window.chamaSupabase = null;
  }

})();
