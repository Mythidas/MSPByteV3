import { SupabaseHelper } from '@workspace/shared/lib/utils/supabase-helper';
import { getSupabase } from '../supabase.js';

export const supabaseHelper = new SupabaseHelper(getSupabase());
