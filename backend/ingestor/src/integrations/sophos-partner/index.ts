import { registry } from '../../registry.js';
import { getSupabase } from '../../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { SophosPartnerAdapter } from './SophosPartnerAdapter.js';
import type { UpsertPayload } from '@workspace/core/types/contracts/adapter';
import type { IngestJobData } from '../../types.js';
import { IngestType as IT } from '@workspace/core/types/ingest';
import { SophosSiteEndpointsLinker } from './SophosSiteEndpointLinker.js';
import { JobScheduler } from '../../scheduler/JobScheduler.js';

registry.register({
  integrationId: 'sophos-partner',
  adapter: new SophosPartnerAdapter(),
  linkers: [new SophosSiteEndpointsLinker()],
  enrichments: [],

  // Fan-out: after tenant-wide sites job, enqueue one endpoints job per link
  fanOut: async (_payloads: UpsertPayload[], job: IngestJobData): Promise<void> => {
    if (job.ingestType !== IT.SophosSites) return;

    const supabase = getSupabase();

    const { data: links, error: linksError } = await supabase
      .from('integration_links')
      .select('id, site_id')
      .eq('integration_id', 'sophos-partner')
      .eq('tenant_id', job.tenantId)
      .not('site_id', 'is', null);

    if (linksError) {
      Logger.error({
        module: 'SophosPartnerFanOut',
        context: 'fanOut',
        message: `Error fetching integration_links for fan-out: ${linksError.message}`,
      });
      return;
    }

    if (!links || links.length === 0) return;

    for (const link of links) {
      await JobScheduler.enqueueNow(job.tenantId, link.site_id ?? null, link.id, 'sophos-partner', IT.SophosEndpoints);
    }

    Logger.info({
      module: 'SophosPartnerFanOut',
      context: 'fanOut',
      message: `Enqueued ${links.length} SophosEndpoints jobs`,
    });
  },
});
