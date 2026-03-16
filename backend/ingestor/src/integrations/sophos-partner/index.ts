import { registry } from '../../registry.js';
import { getSupabase } from '../../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { SophosPartnerAdapter } from './SophosPartnerAdapter.js';
import { SophosPartnerProcessor } from './SophosPartnerProcessor.js';
import { SophosPartnerLinker } from './SophosPartnerLinker.js';
import { SophosPartnerEnricher } from './SophosPartnerEnricher.js';
import type { ProcessedRow } from '../../interfaces.js';
import type { IngestJobData } from '../../types.js';

const DAILY = 24 * 60 * 60 * 1000;

registry.register({
  integrationId: 'sophos-partner',
  adapter: new SophosPartnerAdapter(),
  processor: new SophosPartnerProcessor(),
  linker: new SophosPartnerLinker(),
  enricher: new SophosPartnerEnricher(),

  // endpoints being available is sufficient — sites job (link_id=null) won't appear in link-scoped sync state checks
  linkOpDeps: {
    'link-site-endpoints': ['endpoints'],
  },

  enrichOpDeps: {},

  staleThresholdMs: DAILY,

  // Fan-out: after tenant-wide sites job, create one endpoints job per link that was processed
  fanOut: async (rows: ProcessedRow[], job: IngestJobData): Promise<void> => {
    if (job.ingestType !== 'sites') return;

    const supabase = getSupabase();

    const uniqueLinkIds = [...new Set(rows.map((r) => r.link_id).filter(Boolean) as string[])];
    if (!uniqueLinkIds.length) return;

    // Fetch site_id for each link_id
    const { data: links, error: linksError } = await supabase
      .from('integration_links')
      .select('id, site_id')
      .in('id', uniqueLinkIds)
      .eq('tenant_id', job.tenantId);

    if (linksError) {
      Logger.error({
        module: 'SophosPartnerFanOut',
        context: 'fanOut',
        message: `Error fetching integration_links for fan-out: ${linksError.message}`,
      });
      return;
    }

    const siteIdMap = new Map((links ?? []).map((l) => [l.id, l.site_id]));

    for (const linkId of uniqueLinkIds) {
      const siteId = siteIdMap.get(linkId) ?? null;

      const { count, error: countError } = await (supabase.from('ingest_jobs' as any) as any)
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', job.tenantId)
        .eq('link_id', linkId)
        .eq('ingest_type', 'endpoints')
        .in('status', ['pending', 'queued', 'running']);

      if (countError) {
        Logger.error({
          module: 'SophosPartnerFanOut',
          context: 'fanOut',
          message: `Error checking endpoints job for link ${linkId}: ${countError.message}`,
        });
        continue;
      }

      if (count && count > 0) continue;

      const { error: insertError } = await (supabase.from('ingest_jobs' as any) as any).insert({
        tenant_id: job.tenantId,
        site_id: siteId,
        link_id: linkId,
        integration_id: 'sophos-partner',
        ingest_type: 'endpoints',
        status: 'pending',
        priority: 3,
        trigger: 'scheduled',
        scheduled_for: null,
      });

      if (insertError) {
        Logger.error({
          module: 'SophosPartnerFanOut',
          context: 'fanOut',
          message: `Error creating endpoints job for link ${linkId}: ${insertError.message}`,
        });
        continue;
      }

      Logger.info({
        module: 'SophosPartnerFanOut',
        context: 'fanOut',
        message: `Created endpoints ingest_job for link ${linkId}`,
      });
    }
  },
});
