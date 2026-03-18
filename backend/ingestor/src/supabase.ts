// Compatibility shim — canonical client is src/lib/supabase.ts
// Integrations and compliance files will migrate to the new import in Session 2
import { SupabaseHelper } from "@workspace/shared/lib/utils/supabase-helper";
import { supabase } from "./lib/supabase";

let helper: SupabaseHelper | null = null;

export function getSupabase() {
  return supabase;
}

export function getSupabaseHelper(): SupabaseHelper {
  if (!helper) helper = new SupabaseHelper(supabase);
  return helper;
}
