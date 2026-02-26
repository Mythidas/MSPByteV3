import {
  IntegrationId,
  EntityTypeConfig,
  INTEGRATIONS,
} from '@workspace/shared/config/integrations.js';
import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';

const RECONCILE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * JobReconciler — periodically ensures that every active integration/connection
 * has at least one pending, queued, or running sync job for each non-fanOut entity type.
 *
 * Handles two failure modes:
 *   1. New connection added — no jobs were ever created for it.
 *   2. Total job loss — sync_jobs cleared; recreates all missing jobs.
 */
export class JobReconciler {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.reconcile();
    this.timer = setInterval(() => this.reconcile(), RECONCILE_INTERVAL_MS);
    Logger.info({
      module: 'JobReconciler',
      context: 'start',
      message: `Reconciler started (every ${RECONCILE_INTERVAL_MS / 60000}m)`,
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async reconcile(): Promise<void> {
    try {
      const supabase = getSupabase();

      // Fetch all active integrations grouped by tenant
      const { data: integrationRows, error: intError } = await supabase
        .from('integrations')
        .select('id, tenant_id');

      if (intError || !integrationRows) {
        Logger.error({
          module: 'JobReconciler',
          context: 'reconcile',
          message: `Error fetching integrations: ${intError?.message}`,
        });
        return;
      }

      // Fetch all active connections
      const { data: connectionRows, error: connError } = await supabase
        .from('integration_connections')
        .select('id, integration_id, tenant_id')
        .eq('status', 'active');

      if (connError) {
        Logger.error({
          module: 'JobReconciler',
          context: 'reconcile',
          message: `Error fetching integration_connections: ${connError.message}`,
        });
        return;
      }

      const connections = connectionRows ?? [];

      for (const row of integrationRows) {
        const integrationId = row.id as IntegrationId;
        const config = INTEGRATIONS[integrationId];
        if (!config) continue;

        const nonFanOutTypes = config.supportedTypes.filter((t) => !t.fanOut);
        if (nonFanOutTypes.length === 0) continue;

        // Find connections scoped to this integration + tenant
        const tenantConnections = connections.filter(
          (c) => c.integration_id === row.id && c.tenant_id === row.tenant_id
        );

        if (tenantConnections.length > 0) {
          // Connection-scoped mode: one job per (connection × entityType)
          for (const conn of tenantConnections) {
            for (const typeConfig of nonFanOutTypes) {
              await this.ensureJobExists(row.tenant_id, integrationId, typeConfig, conn.id);
            }
          }
        } else {
          // Direct mode: one job per entityType with no connection_id
          for (const typeConfig of nonFanOutTypes) {
            await this.ensureJobExists(row.tenant_id, integrationId, typeConfig, null);
          }
        }
      }

      Logger.trace({
        module: 'JobReconciler',
        context: 'reconcile',
        message: 'Reconcile pass complete',
      });
    } catch (err) {
      Logger.error({
        module: 'JobReconciler',
        context: 'reconcile',
        message: `Reconcile error: ${err}`,
      });
    }
  }

  private async ensureJobExists(
    tenantId: string,
    integrationId: IntegrationId,
    typeConfig: EntityTypeConfig,
    connectionId: string | null
  ): Promise<void> {
    const supabase = getSupabase();

    const q = supabase
      .from('sync_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('integration_id', integrationId)
      .eq('entity_type', typeConfig.type)
      .in('status', ['pending', 'queued', 'running']);

    const { count, error } = connectionId
      ? await q.eq('connection_id', connectionId)
      : await q.is('connection_id', null);

    if (error) {
      Logger.error({
        module: 'JobReconciler',
        context: 'ensureJobExists',
        message: `Error checking job existence for ${integrationId}:${typeConfig.type}: ${error.message}`,
      });
      return;
    }

    if (count && count > 0) return;

    const { error: insertError } = await supabase.from('sync_jobs').insert({
      tenant_id: tenantId,
      integration_id: integrationId,
      entity_type: typeConfig.type,
      status: 'pending',
      priority: typeConfig.priority + 10, // If the job didn't exist at all, then it most likely is the first sync
      trigger: 'scheduled',
      scheduled_for: null,
      site_id: null,
      connection_id: connectionId,
    });

    if (insertError) {
      Logger.error({
        module: 'JobReconciler',
        context: 'ensureJobExists',
        message: `Error inserting job for ${integrationId}:${typeConfig.type}: ${insertError.message}`,
      });
      return;
    }

    Logger.info({
      module: 'JobReconciler',
      context: 'ensureJobExists',
      message: `Created missing job: ${integrationId}:${typeConfig.type}${connectionId ? ` (conn ${connectionId})` : ''}`,
    });
  }
}
