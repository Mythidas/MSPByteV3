import { getSupabase } from '../supabase.js';
import { Logger } from '../lib/logger.js';
import type { Alert } from '../types.js';

/**
 * AlertManager - Fingerprint-based deduplication for entity_alerts.
 * New alerts → insert, existing alerts → touch last_seen_at,
 * missing alerts → resolve (set resolved_at). Respects suppressed status.
 */
export class AlertManager {
  async processAlerts(
    alerts: Alert[],
    tenantId: string,
    integrationId: string,
    syncId: string,
    siteId?: string,
  ): Promise<{ created: number; updated: number; resolved: number }> {
    const supabase = getSupabase();
    const now = new Date().toISOString();

    Logger.log({
      module: 'AlertManager',
      context: 'processAlerts',
      message: `Processing ${alerts.length} alerts for ${integrationId}`,
      level: 'info',
    });

    // Load existing alerts for this integration + tenant
    const { data: existingAlerts } = await supabase
      .from('entity_alerts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', integrationId);

    const existingMap = new Map((existingAlerts || []).map((a) => [a.fingerprint, a]));
    const seenFingerprints = new Set<string>();

    const toCreate: any[] = [];
    const toUpdate: { id: string; updates: any }[] = [];

    for (const alert of alerts) {
      seenFingerprints.add(alert.fingerprint);
      const existing = existingMap.get(alert.fingerprint);

      if (!existing) {
        toCreate.push({
          tenant_id: tenantId,
          entity_id: alert.entityId,
          integration_id: integrationId,
          site_id: siteId || null,
          alert_type: alert.alertType,
          severity: alert.severity,
          message: alert.message,
          fingerprint: alert.fingerprint,
          metadata: alert.metadata || null,
          status: 'active',
          last_seen_at: now,
          sync_id: syncId,
        });
      } else {
        // Don't modify suppressed alerts' status
        const newStatus = existing.status === 'suppressed' ? 'suppressed' : 'active';
        toUpdate.push({
          id: existing.id,
          updates: {
            severity: alert.severity,
            message: alert.message,
            metadata: alert.metadata || null,
            status: newStatus,
            last_seen_at: now,
            sync_id: syncId,
            updated_at: now,
          },
        });
      }
    }

    // Resolve active alerts not seen in this sync
    const toResolve: string[] = [];
    for (const existing of existingAlerts || []) {
      if (!seenFingerprints.has(existing.fingerprint) && existing.status === 'active') {
        toResolve.push(existing.id);
      }
    }

    Logger.log({
      module: 'AlertManager',
      context: 'processAlerts',
      message: `Categorized: ${toCreate.length} create, ${toUpdate.length} update, ${toResolve.length} resolve`,
      level: 'trace',
    });

    // Execute
    if (toCreate.length > 0) {
      const { error } = await supabase.from('entity_alerts').insert(toCreate);
      if (error) {
        Logger.log({
          module: 'AlertManager',
          context: 'processAlerts',
          message: `Error creating alerts: ${error.message}`,
          level: 'error',
        });
      }
    }

    for (const { id, updates } of toUpdate) {
      await supabase.from('entity_alerts').update(updates).eq('id', id);
    }

    if (toResolve.length > 0) {
      await supabase
        .from('entity_alerts')
        .update({ status: 'resolved', resolved_at: now, updated_at: now })
        .in('id', toResolve);
    }

    const result = { created: toCreate.length, updated: toUpdate.length, resolved: toResolve.length };

    Logger.log({
      module: 'AlertManager',
      context: 'processAlerts',
      message: `Complete: ${result.created} created, ${result.updated} updated, ${result.resolved} resolved`,
      level: 'info',
    });

    return result;
  }
}
