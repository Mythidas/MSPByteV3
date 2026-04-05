import { Logger } from "@workspace/shared/lib/utils/logger";
import { SupabaseHelper } from "@workspace/shared/lib/utils/supabase-helper";
import { supabase } from "../lib/supabase";
import type { CheckHit } from "../checks/types";

const MODULE = "evaluations";
const CONTEXT = "writer";

export async function upsertAlerts(
  hits: CheckHit[],
  tenantId: string,
  linkId: string,
  definitionId: string,
  severity: number,
): Promise<void> {
  const now = new Date().toISOString();
  const helper = new SupabaseHelper(supabase);

  // Fetch all currently active alerts for this (definition, link) pair
  const { data: openAlerts, error: fetchError } = await supabase
    .from("alerts" as any)
    .select("id, entity_id")
    .eq("definition_id", definitionId)
    .eq("link_id", linkId)
    .eq("tenant_id", tenantId)
    .is("resolved_at", null);

  if (fetchError) throw new Error(`upsertAlerts fetch: ${fetchError.message}`);

  const openAlertsMap = new Map<string, string>(
    ((openAlerts as any[]) ?? []).map((a: any) => [a.entity_id as string, a.id as string]),
  );
  const hittingEntityIds = new Set(hits.map((h) => h.entityId));

  // Entities triggering but no open alert → INSERT
  const toInsert = hits.filter((h) => !openAlertsMap.has(h.entityId));
  // Entities with an open alert still triggering → UPDATE last_seen_at
  const toUpdate = hits
    .filter((h) => openAlertsMap.has(h.entityId))
    .map((h) => openAlertsMap.get(h.entityId)!);
  // Entities with an open alert no longer triggering → RESOLVE
  const toResolve = [...openAlertsMap.entries()]
    .filter(([entityId]) => !hittingEntityIds.has(entityId))
    .map(([, alertId]) => alertId);

  if (toInsert.length > 0) {
    const rows = toInsert.map((h) => ({
      definition_id: h.definitionId,
      tenant_id: tenantId,
      link_id: linkId,
      site_id: h.siteId,
      entity_id: h.entityId,
      entity_type: h.entityType,
      message: h.message,
      status: "active",
      severity,
      metadata: h.metadata,
      last_seen_at: now,
    }));

    const result = await helper.batchInsert("public", "alerts" as any, rows as any);
    if ("error" in result) throw new Error(`upsertAlerts insert: ${result.error}`);
  }

  if (toUpdate.length > 0) {
    const result = await helper.batchUpdate("public", "alerts" as any, toUpdate, {
      last_seen_at: now,
    } as any);
    if ("error" in result) throw new Error(`upsertAlerts refresh: ${result.error}`);
  }

  if (toResolve.length > 0) {
    const result = await helper.batchUpdate("public", "alerts" as any, toResolve, {
      status: "resolved",
      resolved_at: now,
    } as any);
    if ("error" in result) throw new Error(`upsertAlerts resolve: ${result.error}`);
  }

  Logger.info({
    module: MODULE,
    context: CONTEXT,
    message: `definition ${definitionId}: ${toInsert.length} inserted, ${toUpdate.length} refreshed, ${toResolve.length} resolved`,
    meta: { tenantId, linkId, definitionId },
  });
}
