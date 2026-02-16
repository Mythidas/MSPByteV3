import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ORM } from '@workspace/shared/lib/utils/orm';
import type { Database } from '@workspace/shared/types/schema';

let client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (!client) {
    const url = process.env.PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
      throw new Error('PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
    }

    client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return client;
}

let orm: ORM | null = null;

export function getORM(): ORM {
  if (!orm) orm = new ORM(getSupabase());
  return orm;
}
