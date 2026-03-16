import { getSupabase } from '../../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { PipelineTracker } from '../../lib/tracker.js';
import type { LinkJobData } from '../../types.js';
import type { LinkRecord, ILinker } from '../../interfaces.js';

/**
 * CoveLinker — builds junction tables for cove vendor data.
 * Handles: link-site-endpoints (cove_site_endpoints).
 */
export class CoveLinker implements ILinker {
  async link(job: LinkJobData, _linkRecord: LinkRecord, tracker: PipelineTracker): Promise<void> {
    const { linkOpType } = job;

    switch (linkOpType) {
      case 'link-site-endpoints':
        return this.linkSiteEndpoints(job, tracker);
      default:
        throw new Error(`CoveLinker: unknown linkOpType "${linkOpType}"`);
    }
  }

  private async linkSiteEndpoints(job: LinkJobData, tracker: PipelineTracker): Promise<void> {
    const { tenantId, linkId } = job;
    const supabase = getSupabase();
    const syncStartTime = new Date().toISOString();

    // 1. Load the cove_sites row for this link → get its DB UUID
    tracker.trackQuery();
    const { data: coveSite, error: siteError } = await supabase
      .schema('vendors')
      .from('cove_sites')
      .select('id')
      .eq('link_id', linkId)
      .eq('tenant_id', tenantId)
      .single();

    if (siteError || !coveSite) {
      Logger.warn({
        module: 'CoveLinker',
        context: 'linkSiteEndpoints',
        message: `No cove_sites row found for link ${linkId}: ${siteError?.message}`,
      });
      return;
    }

    const coveSiteId = coveSite.id;

    // 2. Load all cove_endpoints for this link
    tracker.trackQuery();
    const { data: endpoints, error: epError } = await supabase
      .schema('vendors')
      .from('cove_endpoints')
      .select('id')
      .eq('link_id', linkId)
      .eq('tenant_id', tenantId);

    if (epError) {
      Logger.error({
        module: 'CoveLinker',
        context: 'linkSiteEndpoints',
        message: `Failed to load cove_endpoints for link ${linkId}: ${epError.message}`,
      });
      return;
    }

    const rows = (endpoints ?? []).map((ep) => ({
      tenant_id: tenantId,
      link_id: linkId,
      site_id: coveSiteId,
      endpoint_id: ep.id,
      last_seen_at: syncStartTime,
    }));

    if (rows.length > 0) {
      Logger.info({
        module: 'CoveLinker',
        context: 'linkSiteEndpoints',
        message: `Upserting ${rows.length} site → endpoint relationships for link ${linkId}`,
      });

      tracker.trackUpsert();
      const { error } = await supabase
        .schema('vendors')
        .from('cove_site_endpoints')
        .upsert(rows, { onConflict: 'tenant_id,site_id,endpoint_id' });

      if (error) {
        Logger.error({
          module: 'CoveLinker',
          context: 'linkSiteEndpoints',
          message: `Failed to upsert cove_site_endpoints for link ${linkId}: ${error.message}`,
        });
        return;
      }
    }

    // 3. Prune stale junction rows for this link
    tracker.trackUpsert();
    await supabase
      .schema('vendors')
      .from('cove_site_endpoints')
      .delete()
      .eq('link_id', linkId)
      .eq('tenant_id', tenantId)
      .lt('last_seen_at', syncStartTime);

    Logger.info({
      module: 'CoveLinker',
      context: 'linkSiteEndpoints',
      message: `Site-endpoint linking complete for link ${linkId}: ${rows.length} rows`,
    });
  }
}
