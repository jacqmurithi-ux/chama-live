```javascript
/* =========================================================
   CHAMA LIVE — SUPABASE CLIENT
   File: /js/supabase.js
========================================================= */

import { createClient }
  from "https://esm.sh/@supabase/supabase-js@2";


/* =========================================================
   SUPABASE CONFIG
========================================================= */

const SUPABASE_URL =
  "https://ptktftwyltxmtcodyzoa.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_Nfuc0Xj1LuSU-qJmSXpH5A_GSTMvmSS";


/* =========================================================
   SUPABASE CLIENT
========================================================= */

export const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );


/* =========================================================
   TEST CONNECTION
========================================================= */

export async function testSupabaseConnection() {

  const {
    data,
    error
  } =
    await supabase.auth.getSession();

  if (error) {

    console.error(
      "CHAMA LIVE: Supabase connection failed:",
      error
    );

    throw error;
  }

  console.log(
    "CHAMA LIVE: Supabase connection OK."
  );

  return data?.session || null;
}
```
