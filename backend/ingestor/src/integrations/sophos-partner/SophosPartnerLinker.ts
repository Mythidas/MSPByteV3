import { getSupabase } from '../../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { PipelineTracker } from '../../lib/tracker.js';
import type { LinkJobData } from '../../types.js';
import type { LinkRecord, ILinker } from '../../interfaces.js';

/**
 * SophosPartnerLinker — builds junction tables for sophos vendor data.
 * Currently handles: link-site-endpoints (sophos_site_endpoints).
 */
export class SophosPartnerLinker implements ILinker {
  async link(job: LinkJobData, _linkRecord: LinkRecord, tracker: PipelineTracker): Promise<void> {
    const { linkOpType } = job;

    switch (linkOpType) {
      case 'link-site-endpoints':
        return this.linkSiteEndpoints(job, tracker);
      default:
        throw new Error(`SophosPartnerLinker: unknown linkOpType "${linkOpType}"`);
    }
  }

  private async linkSiteEndpoints(job: LinkJobData, tracker: PipelineTracker): Promise<void> {
    const { tenantId, linkId } = job;
    const supabase = getSupabase();
    const syncStartTime = new Date().toISOString();

    // 1. Load the sophos_sites row for this link → get its DB UUID
    tracker.trackQuery();
    const { data: sophosSite, error: siteError } = await (
      supabase.schema('vendors').from('sophos_sites' as any) as any
    )
      .select('id')
      .eq('link_id', linkId)
      .eq('tenant_id', tenantId)
      .single();

    if (siteError || !sophosSite) {
      Logger.warn({
        module: 'SophosPartnerLinker',
        context: 'linkSiteEndpoints',
        message: `No sophos_sites row found for link ${linkId}: ${siteError?.message}`,
      });
      return;
    }

    const sophosSiteId = (sophosSite as any).id as string;

    // 2. Load all sophos_endpoints for this link
    tracker.trackQuery();
    const { data: endpoints, error: epError } = await (
      supabase.schema('vendors').from('sophos_endpoints' as any) as any
    )
      .select('id')
      .eq('link_id', linkId)
      .eq('tenant_id', tenantId);

    if (epError) {
      Logger.error({
        module: 'SophosPartnerLinker',
        context: 'linkSiteEndpoints',
        message: `Failed to load sophos_endpoints for link ${linkId}: ${epError.message}`,
      });
      return;
    }

    const rows = (endpoints ?? []).map((ep: any) => ({
      tenant_id: tenantId,
      link_id: linkId,
      site_id: sophosSiteId,
      endpoint_id: ep.id,
      last_seen_at: syncStartTime,
    }));

    if (rows.length > 0) {
      Logger.info({
        module: 'SophosPartnerLinker',
        context: 'linkSiteEndpoints',
        message: `Upserting ${rows.length} site → endpoint relationships for link ${linkId}`,
      });

      tracker.trackUpsert();
      const { error } = await (supabase.schema('vendors').from('sophos_site_endpoints' as any) as any)
        .upsert(rows, { onConflict: 'tenant_id,site_id,endpoint_id' });

      if (error) {
        Logger.error({
          module: 'SophosPartnerLinker',
          context: 'linkSiteEndpoints',
          message: `Failed to upsert sophos_site_endpoints for link ${linkId}: ${error.message}`,
        });
        return;
      }
    }

    // 4. Prune stale junction rows for this link
    tracker.trackUpsert();
    await (supabase.schema('vendors').from('sophos_site_endpoints' as any) as any)
      .delete()
      .eq('link_id', linkId)
      .eq('tenant_id', tenantId)
      .lt('last_seen_at', syncStartTime);

    Logger.info({
      module: 'SophosPartnerLinker',
      context: 'linkSiteEndpoints',
      message: `Site-endpoint linking complete for link ${linkId}: ${rows.length} rows`,
    });
  }
}
