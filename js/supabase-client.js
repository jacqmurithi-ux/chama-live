(function () {
  "use strict";

  const SUPABASE_URL =
    "https://ptktftwyltxmtcodyzoa.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_Nfuc0Xj1LuSU-qJmSXpH5A_GSTMvmSS";

  if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
  ) {
    console.error(
      "Chama Live: Supabase library was not loaded."
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
      "Chama Live: Supabase client initialized."
    );

  } catch (error) {

    console.error(
      "Chama Live: Supabase initialization failed.",
      error
    );

  }

})();
