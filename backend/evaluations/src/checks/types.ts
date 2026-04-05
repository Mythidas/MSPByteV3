import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@workspace/shared/types/schema";

export interface CheckContext {
  tenantId: string;
  linkId: string;
  supabase: SupabaseClient<Database>;
}

export interface CheckHit {
  definitionId: string;
  entityId: string;
  entityType: string;
  siteId: string | null;
  message: string;
  metadata: Record<string, unknown>;
}

export interface CheckDefinition {
  definitionId: string;
  fn: (ctx: CheckContext) => Promise<CheckHit[]>;
}
