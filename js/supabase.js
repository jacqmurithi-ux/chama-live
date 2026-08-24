import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import "./config.js";

const { supabaseUrl, supabaseAnonKey } = window.CHAMA_CONFIG;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("CHAMA LIVE Supabase configuration is missing.");
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

