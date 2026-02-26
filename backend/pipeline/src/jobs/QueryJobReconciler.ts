import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { BaseJob } from './BaseJob.js';

const RECONCILE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * QueryJobReconciler — seeds built-in query_jobs rows on startup and periodically.
 * One row per (built-in job × tenant). Uses ON CONFLICT DO NOTHING so MSP-modified
 * enabled/schedule_hours are never overwritten.
 */
export class QueryJobReconciler {
  private jobs: BaseJob[];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(jobs: BaseJob[]) {
    this.jobs = jobs;
  }

  start(): void {
    this.reconcile();
    this.timer = setInterval(() => this.reconcile(), RECONCILE_INTERVAL_MS);
    Logger.info({
      module: 'QueryJobReconciler',
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

      // Get all tenants that have each integration enabled
      const { data: integrationRows, error } = await supabase
        .from('integrations')
        .select('id, tenant_id');

      if (error || !integrationRows) {
        Logger.error({
          module: 'QueryJobReconciler',
          context: 'reconcile',
          message: `Error fetching integrationRows: ${error?.message}`,
        });
        return;
      }

      let seeded = 0;

      for (const job of this.jobs) {
        const integrationId = job.getIntegrationId();

        // Find all tenants that have this integration enabled
        const tenants = integrationRows
          .filter((r) => r.id === integrationId)
          .map((r) => r.tenant_id);

        // Deduplicate
        const uniqueTenants = [...new Set(tenants)];

        for (const tenantId of uniqueTenants) {
          // Upsert with ignoreDuplicates — ON CONFLICT DO NOTHING
          const { error: upsertError } = await supabase
            .from('query_jobs')
            .upsert(
              {
                name: job.getName(),
                integration_id: integrationId,
                tenant_id: tenantId,
                schedule_hours: job.getScheduleHours(),
                depends_on: job.getDependsOn(),
                is_built_in: true,
                enabled: true,
                repeated: true,
              },
              { onConflict: 'name,integration_id,tenant_id', ignoreDuplicates: true }
            );

          if (upsertError) {
            Logger.error({
              module: 'QueryJobReconciler',
              context: 'reconcile',
              message: `Error upserting query_job ${job.getName()} for tenant ${tenantId}: ${upsertError.message}`,
            });
          } else {
            seeded++;
          }
        }
      }

      Logger.trace({
        module: 'QueryJobReconciler',
        context: 'reconcile',
        message: `Reconcile pass complete — processed ${seeded} job definitions`,
      });
    } catch (err) {
      Logger.error({
        module: 'QueryJobReconciler',
        context: 'reconcile',
        message: `Reconcile error: ${err}`,
      });
    }
  }
}
