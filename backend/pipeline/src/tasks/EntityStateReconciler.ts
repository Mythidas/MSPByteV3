import { Logger } from '@workspace/shared/lib/utils/logger';
import { getSupabase } from '../supabase';

// Severity → entity state mapping
const SEVERITY_TO_STATE: Record<string, string> = {
  critical: 'critical',
  high: 'warn',
  error: 'warn',
  medium: 'low',
  low: 'normal',
  info: 'normal',
};

const STATE_PRIORITY: Record<string, number> = {
  normal: 0,
  low: 1,
  warn: 2,
  critical: 3,
};

function severityToState(severity: string): string {
  return SEVERITY_TO_STATE[severity.toLowerCase()] ?? 'normal';
}

function worstState(a: string, b: string): string {
  return (STATE_PRIORITY[a] ?? 0) >= (STATE_PRIORITY[b] ?? 0) ? a : b;
}

/**
 * EntityStateReconciler
 *
 * After alert and tag evaluation, sweeps all affected entities and sets their
 * `state` column to reflect the worst active alert severity. This ensures
 * entities show `critical` / `warn` / `low` / `normal` based on current alerts.
 *
 * Algorithm (3 DB calls):
 *  1. SELECT entity_id, severity FROM alerts WHERE tenant_id=X AND entity_id IN (...) AND status='active'
 *  2. Compute worst state per entity (no active alerts → 'normal')
 *  3. UPDATE entities SET state=... via per-state IN groups
 */
export class EntityStateReconciler {
  async reconcile(tenantId: string, entityIds: string[]): Promise<void> {
    if (entityIds.length === 0) return;

    const supabase = getSupabase();
    const uniqueIds = [...new Set(entityIds)];

    // Step 1 — Load active alerts for all affected entities
    const { data: alerts, error: alertsError } = await supabase
      .from('alerts')
      .select('entity_id, severity')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .in('entity_id', uniqueIds);

    if (alertsError) {
      Logger.error({
        module: 'EntityStateReconciler',
        context: 'reconcile',
        message: `Failed to load alerts: ${alertsError.message}`,
      });
      return;
    }

    // Step 2 — Compute worst state per entity
    const entityStateMap = new Map<string, string>();

    // Default all affected entities to 'normal'
    for (const id of uniqueIds) {
      entityStateMap.set(id, 'normal');
    }

    for (const alert of alerts ?? []) {
      if (!alert.entity_id) continue;
      const current = entityStateMap.get(alert.entity_id) ?? 'normal';
      const fromAlert = severityToState(alert.severity);
      entityStateMap.set(alert.entity_id, worstState(current, fromAlert));
    }

    // Step 3 — Group entities by target state and UPDATE in batches per state
    const byState = new Map<string, string[]>();
    for (const [entityId, state] of entityStateMap) {
      if (!byState.has(state)) byState.set(state, []);
      byState.get(state)!.push(entityId);
    }

    const updates = [...byState.entries()].map(([state, ids]) =>
      supabase
        .from('entities')
        .update({ state } as any)
        .in('id', ids)
    );

    const results = await Promise.all(updates);
    for (const { error } of results) {
      if (error) {
        Logger.error({
          module: 'EntityStateReconciler',
          context: 'reconcile',
          message: `Failed to update entity states: ${error.message}`,
        });
      }
    }

    Logger.trace({
      module: 'EntityStateReconciler',
      context: 'reconcile',
      message: `Updated states for ${uniqueIds.length} entities (tenant ${tenantId})`,
    });
  }
}
