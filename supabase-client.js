const SUPABASE_URL = 'https://ptktftwyltxmtcodyzoa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_WFptuzqTTfPvFit8mfh-og_5UaxqvbO';
window.chamaSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
