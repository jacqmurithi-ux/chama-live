import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL =
  "https://ptktftwyltxmtcodyzoa.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_Nfuc0Xj1LuSU-qJmSXpH5A_GSTMvmSS";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

console.log("CHAMA LIVE: Supabase client loaded.");
