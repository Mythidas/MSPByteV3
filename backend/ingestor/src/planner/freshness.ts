import { INTEGRATIONS } from "@workspace/core/config/integrations";
import { supabase } from "../lib/supabase";
import type { PlannerEntry } from "./enumerate";

export async function filterStaleEntries(entries: PlannerEntry[]): Promise<PlannerEntry[]> {
  if (entries.length === 0) return [];

  const tenantIds = [...new Set(entries.map((e) => e.tenantId))];

  const { data: syncStates, error } = await supabase
    .from("ingest_sync_states")
    .select("*")
    .in("tenant_id", tenantIds);

  if (error) throw new Error(`filterStaleEntries: failed to query sync states: ${error.message}`);

  // Build lookup map: "integrationId:ingestType:scopeId" → last_synced_at
  const stateMap = new Map<string, string>();
  for (const row of syncStates ?? []) {
    const scopeId = row.link_id ?? row.site_id ?? "tenant";
    const key = `${row.integration_id}:${row.ingest_type}:${scopeId}`;
    stateMap.set(key, row.last_synced_at);
  }

  const now = Date.now();

  return entries.filter((entry) => {
    const scopeId = entry.linkId ?? entry.siteId ?? "tenant";
    const key = `${entry.integrationId}:${entry.ingestType}:${scopeId}`;
    const lastSyncedAt = stateMap.get(key);

    if (!lastSyncedAt) return true; // never synced → stale

    const typeConfig = INTEGRATIONS[entry.integrationId]?.supportedTypes.find(
      (t) => t.type === entry.ingestType,
    );
    if (!typeConfig) return true; // unknown type → treat as stale

    const thresholdMs = typeConfig.freshnessMinutes * 60 * 1000;
    return now - new Date(lastSyncedAt).getTime() >= thresholdMs;
  });
}
