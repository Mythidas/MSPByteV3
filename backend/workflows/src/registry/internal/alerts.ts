import { createHash } from 'crypto';
import { Logger } from '@workspace/shared/lib/utils/logger.js';
import { getScopedTargetIds } from '../../executor/context-resolver.js';
import type {
  AlertNodeConfig,
  AlertNodeInputs,
  AlertStageResult,
  RunContext,
} from '../../types.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@workspace/shared/types/schema';

const TARGET_COLUMN = {
  entity: 'entity_id',
  site: 'site_id',
  connection: 'connection_id',
} as const;

function makeFingerprint(
  tenantId: string,
  alertDefId: string,
  targetType: string,
  targetId: string
): string {
  return createHash('sha256')
    .update(`${tenantId}:${alertDefId}:${targetType}:${targetId}`)
    .digest('hex');
}

function renderMessage(
  template: string | undefined,
  targetId: string,
  displayName: string | null,
  props?: Record<string, unknown>,
): string {
  if (!template) return `Alert triggered for ${targetId}`;
  let msg = template
    .replace(/\{\{display_name\}\}/g, displayName ?? targetId)
    .replace(/\{\{target_id\}\}/g, targetId);
  if (props) {
    for (const [key, val] of Object.entries(props)) {
      msg = msg.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val ?? ''));
    }
  }
  return msg;
}

async function updateEntityStates(
  entityIds: string[],
  supabase: SupabaseClient<Database>
): Promise<void> {
  if (entityIds.length === 0) return;

  // Fetch all active alerts for the affected entity IDs
  const { data: activeAlerts } = await supabase
    .from('alerts')
    .select('entity_id, severity')
    .in('entity_id', entityIds)
    .eq('status', 'active');

  // Build severity map: entity_id -> worst severity
  const severityMap = new Map<string, string>();
  for (const alert of activeAlerts ?? []) {
    if (!alert.entity_id) continue;
    const existing = severityMap.get(alert.entity_id);
    const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    if (!existing || (severityRank[alert.severity] ?? 0) > (severityRank[existing] ?? 0)) {
      severityMap.set(alert.entity_id, alert.severity);
    }
  }

  // Bucket entities by target state
  const buckets: Record<string, string[]> = { critical: [], warn: [], low: [], normal: [] };
  for (const entityId of entityIds) {
    const sev = severityMap.get(entityId);
    if (!sev) {
      buckets.normal.push(entityId);
    } else if (sev === 'critical') {
      buckets.critical.push(entityId);
    } else if (sev === 'high' || sev === 'medium') {
      buckets.warn.push(entityId);
    } else {
      buckets.low.push(entityId);
    }
  }

  // Apply state updates per bucket
  for (const [state, ids] of Object.entries(buckets)) {
    if (ids.length === 0) continue;
    await supabase.from('entities').update({ state }).in('id', ids);
  }
}

export async function executeAlertNode(
  config: AlertNodeConfig,
  inputs: AlertNodeInputs,
  ctx: RunContext,
  supabase: SupabaseClient<Database>
): Promise<AlertStageResult> {
  const result: AlertStageResult = { created: [], resolved: [], created_alert_ids: [], resolved_alert_ids: [], skipped: [] };
  const targetColumn = TARGET_COLUMN[config.target_type];
  const now = new Date().toISOString();

  // Fetch alert definition
  const { data: alertDef, error: defError } = await supabase
    .from('alert_definitions')
    .select('severity, name')
    .eq('id', config.alert_definition_id)
    .single();

  if (defError || !alertDef) {
    Logger.error({
      module: 'AlertNode',
      context: 'executeAlertNode',
      message: `Alert definition not found: ${config.alert_definition_id}`,
    });
    return result;
  }

  const severity = config.severity_override ?? alertDef.severity;

  // CREATE
  if (config.mode === 'create' || config.mode === 'create_or_resolve') {
    // BUILD phase — no DB calls
    const rows: Array<{ targetId: string; row: object }> = [];
    for (const targetId of inputs.target_ids) {
      const fingerprint = makeFingerprint(
        ctx.tenant_id,
        config.alert_definition_id,
        config.target_type,
        targetId
      );
      const entityEntry = config.target_type === 'entity' ? ctx.entity_log[targetId] : undefined;
      const displayName = entityEntry?.display_name ?? null;
      const integrationId = entityEntry?.integration ?? 'unknown';
      const rawData = entityEntry?.raw_data ?? {};
      const message = renderMessage(config.message_template, targetId, displayName, rawData);
      rows.push({
        targetId,
        row: {
          fingerprint,
          alert_definition_id: config.alert_definition_id,
          alert_type: alertDef.name,
          [targetColumn]: targetId,
          tenant_id: ctx.tenant_id,
          integration_id: integrationId,
          site_id: entityEntry?.site_id ?? null,
          connection_id: entityEntry?.connection_id ?? null,
          sync_id: ctx.run_id,
          severity,
          status: 'active',
          message,
          metadata: (config.metadata ?? null) as any,
          last_seen_at: now,
        },
      });
    }

    // UPSERT phase — chunked
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { data: upserted, error } = await supabase
        .from('alerts')
        .upsert(chunk.map((r) => r.row) as any[], { onConflict: 'fingerprint' })
        .select('id');
      if (error) {
        Logger.warn({
          module: 'AlertNode',
          context: 'create',
          message: `Batch alert upsert failed: ${error.message}`,
        });
        result.skipped.push(...chunk.map((r) => r.targetId));
      } else {
        result.created.push(...chunk.map((r) => r.targetId));
        result.created_alert_ids.push(...(upserted ?? []).map((r: any) => r.id));
      }
    }
  }

  // RESOLVE
  if (config.mode === 'resolve' || config.mode === 'create_or_resolve') {
    const scopedIds = getScopedTargetIds(ctx, config.target_type);
    const resolveSet =
      inputs.resolve_target_ids ??
      (config.mode === 'create_or_resolve'
        ? scopedIds.filter((id) => !inputs.target_ids.includes(id))
        : scopedIds);

    if (resolveSet.length > 0) {
      const fingerprintToId = new Map(
        resolveSet.map((id) => [
          makeFingerprint(ctx.tenant_id, config.alert_definition_id, config.target_type, id),
          id,
        ])
      );
      const fingerprints = [...fingerprintToId.keys()];

      const { data: resolvedRows, error } = await supabase
        .from('alerts')
        .update({ status: 'resolved', resolved_at: now })
        .in('fingerprint', fingerprints)
        .eq('status', 'active')
        .eq('alert_definition_id', config.alert_definition_id)
        .select('id, fingerprint');

      if (error) {
        Logger.warn({
          module: 'AlertNode',
          context: 'resolve',
          message: `Failed to resolve alerts: ${error.message}`,
        });
      } else {
        for (const row of resolvedRows ?? []) {
          const entityId = fingerprintToId.get((row as any).fingerprint);
          if (entityId) result.resolved.push(entityId);
        }
        result.resolved_alert_ids.push(...(resolvedRows ?? []).map((r: any) => r.id));
      }
    }
  }

  // Update entity states when target_type is 'entity'
  if (config.target_type === 'entity') {
    const allAffected = [...new Set([...result.created, ...result.resolved])];
    await updateEntityStates(allAffected, supabase);
  }

  return result;
}
