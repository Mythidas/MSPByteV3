import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);
