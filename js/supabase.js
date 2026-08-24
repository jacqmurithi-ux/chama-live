import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import "./config.js";

const { supabaseUrl, supabaseAnonKey } = window.CHAMA_CONFIG;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
