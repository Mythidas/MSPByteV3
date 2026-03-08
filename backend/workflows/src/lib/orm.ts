import { ORM } from '@workspace/shared/lib/utils/orm';
import { getSupabase } from '../supabase.js';

export const orm = new ORM(getSupabase());
