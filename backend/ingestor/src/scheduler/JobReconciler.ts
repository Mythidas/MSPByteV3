import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { M365_TYPES, type M365EntityType } from '../types.js';

const RECONCILE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Priority per entity type — lower = higher priority
const TYPE_PRIORITY: Record<M365EntityType, number> = {
  identity: 10,
  group: 20,
  role: 30,
  policy: 40,
  license: 50,
  'exchange-config': 60,
};

/**
 * JobReconciler — periodically ensures every active M365 integration_link
 * has at least one pending/queued/running ingest_job per entity type.
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

      // Fetch all active M365 integration_links
      const { data: links, error } = await supabase
        .from('integration_links')
        .select('id, tenant_id, site_id')
        .eq('integration_id', 'microsoft-365')
        .eq('status', 'active');

      if (error) {
        Logger.error({
          module: 'JobReconciler',
          context: 'reconcile',
          message: `Error fetching integration_links: ${(error as any).message}`,
        });
        return;
      }

      for (const link of links ?? []) {
        for (const ingestType of M365_TYPES) {
          await this.ensureJobExists(link.tenant_id, link.id, link.site_id, ingestType);
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
    linkId: string,
    siteId: string | null,
    ingestType: M365EntityType
  ): Promise<void> {
    const supabase = getSupabase();

    const { count, error } = await supabase
      .from('ingest_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('link_id', linkId)
      .eq('ingest_type', ingestType)
      .in('status', ['pending', 'queued', 'running']);

    if (error) {
      Logger.error({
        module: 'JobReconciler',
        context: 'ensureJobExists',
        message: `Error checking job for ${linkId}:${ingestType}: ${(error as any).message}`,
      });
      return;
    }

    if (count && count > 0) return;

    const { error: insertError } = await supabase.from('ingest_jobs').insert({
      tenant_id: tenantId,
      site_id: siteId,
      link_id: linkId,
      integration_id: 'microsoft-365',
      ingest_type: ingestType,
      status: 'pending',
      priority: (TYPE_PRIORITY[ingestType] ?? 50) + 10, // first sync gets slight boost
      trigger: 'scheduled',
      scheduled_for: null,
    });

    if (insertError) {
      Logger.error({
        module: 'JobReconciler',
        context: 'ensureJobExists',
        message: `Error inserting job for ${linkId}:${ingestType}: ${(insertError as any).message}`,
      });
      return;
    }

    Logger.info({
      module: 'JobReconciler',
      context: 'ensureJobExists',
      message: `Created missing job: ${ingestType} for link ${linkId}`,
    });
  }
}
