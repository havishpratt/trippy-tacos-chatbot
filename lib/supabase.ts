import { createClient } from "@supabase/supabase-js";

// Use service role key server-side (for embedding writes)
// Use anon key client-side (for reads if needed)
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
