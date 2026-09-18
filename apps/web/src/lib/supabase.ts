import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Server-only key (no NEXT_PUBLIC_ prefix — never bundled to the browser). Every caller of this
// client is a route handler or a module it imports (app/api/**, lib/company/*), never a "use
// client" component, so this bypasses RLS the same way the Python pipeline does via postgres.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);
