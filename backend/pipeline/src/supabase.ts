import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@workspace/shared/types/schema';

let client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;

    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');
    }

    client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return client;
}
