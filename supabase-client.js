(function () {
  "use strict";

  const SUPABASE_URL =
    "https://ptktftwyltxmtcodyzoa.supabase.co";

  const SUPABASE_ANON_KEY =
    "PASTE_YOUR_EXISTING_SUPABASE_ANON_KEY_HERE";

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error(
      "Supabase JS library was not loaded before supabase-client.js"
    );
    return;
  }

  if (
    !SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY === "PASTE_YOUR_EXISTING_SUPABASE_ANON_KEY_HERE"
  ) {
    console.error(
      "Supabase publishable/anon key has not been configured."
    );
    return;
  }

  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
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

  console.log("Chama Live Supabase client initialized.");
})();
