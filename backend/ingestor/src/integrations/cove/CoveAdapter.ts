import { getSupabase } from '../../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { PipelineTracker } from '../../lib/tracker.js';
import { CoveConnector } from '@workspace/shared/lib/connectors/CoveConnector';
import type { IngestJobData } from '../../types.js';
import type { RawCoveEntity } from './types.js';
import type { IAdapter } from '../../interfaces.js';
import Encryption from '@workspace/shared/lib/utils/encryption.js';

export class CoveAdapter implements IAdapter<RawCoveEntity> {
  async fetch(job: IngestJobData, tracker: PipelineTracker): Promise<RawCoveEntity[]> {
    const supabase = getSupabase();

    tracker.trackQuery();
    const { data: integration } = await supabase
      .from('integrations')
      .select('config')
      .eq('id', 'cove')
      .eq('tenant_id', job.tenantId)
      .single();

    const config = (integration?.config as any) ?? {};
    const server = config?.server as string | undefined;
    const clientId = config?.clientId as string | undefined;
    const partnerId = config?.partnerId as number | undefined;
    const clientSecret = (await Encryption.decrypt(
      config?.clientSecret || '',
      process.env.ENCRYPTION_KEY!,
    )) as string;

    if (!server || !clientId || !clientSecret || !partnerId) {
      throw new Error(
        'CoveAdapter: server, clientId, clientSecret, and partnerId are required in integration config',
      );
    }

    const connector = new CoveConnector({ server, clientId, clientSecret, partnerId });

    if (job.ingestType === 'sites') {
      return this.fetchSites(connector, job.tenantId, tracker);
    } else if (job.ingestType === 'endpoints') {
      if (!job.linkId) {
        throw new Error('CoveAdapter: endpoints job requires link_id');
      }

      tracker.trackQuery();
      const { data: link, error: linkError } = await supabase
        .from('integration_links')
        .select('id, external_id, site_id')
        .eq('id', job.linkId)
        .eq('tenant_id', job.tenantId)
        .single();

      if (linkError || !link) {
        throw new Error(`CoveAdapter: failed to load integration_links: ${linkError?.message}`);
      }

      if (!link.external_id) {
        throw new Error(`CoveAdapter: link ${job.linkId} has no external_id (Cove partner ID)`);
      }

      return this.fetchEndpoints(connector, link.external_id, job.linkId, link.site_id, tracker);
    } else {
      throw new Error(`CoveAdapter: unknown ingestType "${job.ingestType}"`);
    }
  }

  private async fetchSites(
    connector: CoveConnector,
    tenantId: string,
    tracker: PipelineTracker,
  ): Promise<RawCoveEntity[]> {
    const supabase = getSupabase();

    tracker.trackQuery();
    const { data: links, error: linksError } = await supabase
      .from('integration_links')
      .select('id, external_id, site_id')
      .eq('integration_id', 'cove')
      .eq('tenant_id', tenantId)
      .not('site_id', 'is', null);

    if (linksError) {
      throw new Error(`CoveAdapter: failed to load integration_links: ${linksError.message}`);
    }

    if (!links || links.length === 0) return [];

    const { data: customers, error: customersError } = await tracker.trackSpan(
      'adapter:api:getCustomers',
      () => connector.getCustomers(),
    );

    if (customersError || !customers) {
      throw new Error(`CoveAdapter: getCustomers failed: ${customersError?.message}`);
    }

    // Filter for EndCustomers only and build lookup map by partner ID
    const endCustomers = customers.filter((c) => c.Info.Level === 'EndCustomer');
    const partnersById = new Map(endCustomers.map((c) => [c.Info.Id.toString(), c]));

    const results: RawCoveEntity[] = [];

    for (const link of links) {
      const partner = partnersById.get(link.external_id ?? '');
      if (!partner) {
        Logger.warn({
          module: 'CoveAdapter',
          context: 'fetchSites',
          message: `Cove partner ${link.external_id} not found in customer list (link ${link.id})`,
        });
        continue;
      }

      results.push({
        type: 'sites',
        externalId: partner.Info.Id.toString(),
        linkId: link.id,
        siteId: link.site_id,
        data: partner,
      });
    }

    Logger.info({
      module: 'CoveAdapter',
      context: 'fetchSites',
      message: `Fetched ${results.length} sites for tenant ${tenantId} (${links.length} links)`,
    });

    return results;
  }

  private async fetchEndpoints(
    connector: CoveConnector,
    externalId: string,
    linkId: string,
    siteId: string | null,
    tracker: PipelineTracker,
  ): Promise<RawCoveEntity[]> {
    const { data: stats, error } = await tracker.trackSpan(
      'adapter:api:getAccountStatistics',
      () => connector.getAccountStatistics(),
    );

    if (error || !stats) {
      throw new Error(`CoveAdapter: getAccountStatistics failed: ${error?.message}`);
    }

    const partnerId = parseInt(externalId, 10);
    const filtered = stats.filter((s) => s.PartnerId === partnerId);

    Logger.info({
      module: 'CoveAdapter',
      context: 'fetchEndpoints',
      message: `Fetched ${filtered.length} endpoints for Cove partner ${externalId}`,
    });

    return filtered.map((stat) => ({
      type: 'endpoints' as const,
      externalId: stat.AccountId.toString(),
      linkId,
      siteId,
      data: stat,
    }));
  }
}
