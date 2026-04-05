import { createClient } from "@supabase/supabase-js";
import type { Database } from "@workspace/shared/types/schema";

const url = process.env.PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_KEY ?? "";

export const supabase = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
