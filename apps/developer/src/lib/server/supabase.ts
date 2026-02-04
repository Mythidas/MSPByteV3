import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL } from "$env/static/public";
import { type Database } from "@workspace/shared/types/schema";
import { SUPABASE_SECRET_KEY } from "$env/static/private";

const supabaseUrl = PUBLIC_SUPABASE_URL;
const supabaseKey = SUPABASE_SECRET_KEY;

export const supabaseServer = createClient<Database>(supabaseUrl, supabaseKey);
