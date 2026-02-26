import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { AlertType } from '@workspace/shared/config/integrations/alerts.js';
import type { Alert } from '../types.js';

/**
 * AlertManager - Fingerprint-based deduplication for alerts.
 * New alerts → insert, existing alerts → touch last_seen_at,
 * missing alerts → resolve (set resolved_at). Respects suppressed status.
 *
 * Alerts can target an entity (entityId), connection (connectionId), or site (siteId).
 * Exactly one target must be set per alert.
 */
export class AlertManager {
  async processAlerts(
    alerts: Alert[],
    tenantId: string,
    integrationId: string,
    syncId: string,
    siteId?: string,
    connectionId?: string,
    alertTypes?: AlertType[],
  ): Promise<{ created: number; updated: number; resolved: number }> {
    const supabase = getSupabase();
    const now = new Date().toISOString();

    Logger.info({
      module: 'AlertManager',
      context: 'processAlerts',
      message: `Processing ${alerts.length} alerts for ${integrationId}`,
    });

    // Load existing alerts for this integration + tenant, scoped to connection/site
    let query = supabase
      .from('alerts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', integrationId);

    if (connectionId) {
      query = query.eq('connection_id', connectionId);
    } else if (siteId) {
      query = query.eq('site_id', siteId);
    }

    if (alertTypes && alertTypes.length > 0) {
      query = query.in('alert_type', alertTypes);
    }

    const { data: existingAlerts } = await query;

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
          entity_id: alert.entityId ?? null,
          connection_id: alert.connectionId ?? connectionId ?? null,
          site_id: alert.siteId ?? siteId ?? null,
          integration_id: integrationId,
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

    Logger.trace({
      module: 'AlertManager',
      context: 'processAlerts',
      message: `Categorized: ${toCreate.length} create, ${toUpdate.length} update, ${toResolve.length} resolve`,
    });

    // Execute
    if (toCreate.length > 0) {
      const { error } = await supabase.from('alerts').insert(toCreate);
      if (error) {
        Logger.error({
          module: 'AlertManager',
          context: 'processAlerts',
          message: `Error creating alerts: ${error.message}`,
        });
      }
    }

    // Batch update alerts via chunked upsert on id conflict
    if (toUpdate.length > 0) {
      const upsertRows = toUpdate.map(({ id, updates }) => {
        const existing = existingMap.get(
          (existingAlerts || []).find((a) => a.id === id)?.fingerprint || ''
        );
        return {
          id,
          tenant_id: existing?.tenant_id ?? tenantId,
          entity_id: existing?.entity_id,
          integration_id: existing?.integration_id ?? integrationId,
          site_id: existing?.site_id ?? siteId ?? null,
          connection_id: existing?.connection_id ?? connectionId ?? null,
          alert_type: existing?.alert_type,
          fingerprint: existing?.fingerprint,
          created_at: existing?.created_at,
          ...updates,
        };
      });

      for (let i = 0; i < upsertRows.length; i += 100) {
        const chunk = upsertRows.slice(i, i + 100);
        const { error } = await supabase.from('alerts').upsert(chunk, { onConflict: 'id' });
        if (error) {
          Logger.error({
            module: 'AlertManager',
            context: 'processAlerts',
            message: `Error upserting alerts: ${error.message}`,
          });
        }
      }
    }

    if (toResolve.length > 0) {
      await supabase
        .from('alerts')
        .update({ status: 'resolved', resolved_at: now, updated_at: now, resolved_by_sync_id: syncId })
        .in('id', toResolve);
    }

    const result = {
      created: toCreate.length,
      updated: toUpdate.length,
      resolved: toResolve.length,
    };

    Logger.info({
      module: 'AlertManager',
      context: 'processAlerts',
      message: `Complete: ${result.created} created, ${result.updated} updated, ${result.resolved} resolved`,
    });

    return result;
  }
}
