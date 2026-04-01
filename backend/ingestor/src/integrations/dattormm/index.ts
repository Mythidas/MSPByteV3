import { registry } from '../../registry.js';
import { getSupabase } from '../../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { DattoRMMAdapter } from './DattoRMMAdapter.js';
import type { UpsertPayload } from '@workspace/core/types/contracts/adapter';
import type { IngestJobData } from '../../types.js';
import { IngestType as IT } from '@workspace/core/types/ingest';
import { JobScheduler } from '../../scheduler/JobScheduler.js';

registry.register({
  integrationId: 'dattormm',
  adapter: new DattoRMMAdapter(),
  linkers: [],
  enrichments: [],

  // Fan-out: after tenant-wide sites job, enqueue one endpoints job per link
  fanOut: async (_payloads: UpsertPayload[], job: IngestJobData): Promise<void> => {
    if (job.ingestType !== IT.DattoSites) return;

    const supabase = getSupabase();

    const { data: links, error: linksError } = await supabase
      .from('integration_links')
      .select('id, site_id')
      .eq('integration_id', 'dattormm')
      .eq('tenant_id', job.tenantId)
      .not('site_id', 'is', null);

    if (linksError) {
      Logger.error({
        module: 'DattoRMMFanOut',
        context: 'fanOut',
        message: `Error fetching integration_links for fan-out: ${linksError.message}`,
      });
      return;
    }

    if (!links || links.length === 0) return;

    for (const link of links) {
      await JobScheduler.enqueueNow(job.tenantId, link.site_id ?? null, link.id, 'dattormm', IT.DattoEndpoints);
    }

    Logger.info({
      module: 'DattoRMMFanOut',
      context: 'fanOut',
      message: `Enqueued ${links.length} DattoEndpoints jobs`,
    });
  },
});
