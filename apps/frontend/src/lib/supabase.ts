import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY } from '$env/static/public';
import { type Database } from '@workspace/shared/types/schema';
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = PUBLIC_SUPABASE_URL;
const supabaseKey = PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseKey);
