import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { PipelineTracker } from '../lib/tracker.js';
import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector';
import { SkuCatalog } from '@workspace/shared/lib/services/microsoft/SkuCatalog';
import { PowerShellRunner } from '@workspace/shared/lib/utils/PowerShellRunner';
import Encryption from '@workspace/shared/lib/utils/encryption.js';
import type { IngestJobData, RawM365Entity } from '../types.js';
import type { MSCapabilities } from '@workspace/shared/types/integrations/microsoft/capabilities.js';
import type { MSGraphIdentity } from '@workspace/shared/types/integrations/microsoft/identity.js';

export class Microsoft365Adapter {
  async fetch(jobData: IngestJobData, tracker: PipelineTracker): Promise<RawM365Entity[]> {
    if (!jobData.linkId)
      throw new Error('M365 Adapter requires Job to include link_id to tenant information');

    const supabase = getSupabase();

    // Load integration config (refresh token, tenantId, mode)
    tracker.trackQuery();
    const { data: integration } = await supabase
      .from('integrations')
      .select('config')
      .eq('id', 'microsoft-365')
      .eq('tenant_id', jobData.tenantId)
      .single();

    const config = (integration?.config as any) ?? {};

    // Load integration_links for this M365 integration + tenant
    tracker.trackQuery();
    const { data: link, error: linksError } = await supabase
      .from('integration_links')
      .select('id, external_id, meta')
      .eq('id', jobData.linkId)
      .eq('tenant_id', jobData.tenantId)
      .single();

    if (linksError) {
      throw new Error(`Failed to load integration_links: ${(linksError as any).message}`);
    }

    // Site-mapping rows (site_id IS NOT NULL) — for domain → site_id resolution
    tracker.trackQuery();
    const { data: siteLinks } = await supabase
      .from('integration_links')
      .select('site_id, meta')
      .eq('integration_id', 'microsoft-365')
      .eq('tenant_id', jobData.tenantId)
      .not('site_id', 'is', null);

    // Build lookup maps from integration_links
    const domainMap = new Map<string, string | null>(); // domain → site_id
    for (const l of siteLinks ?? []) {
      for (const domain of (l.meta as any)?.domains ?? []) {
        domainMap.set((domain as string).toLowerCase(), l.site_id!);
      }
    }

    // Decrypt refresh token
    const encKey = process.env.ENCRYPTION_KEY!;
    const refreshToken = config?.refreshToken
      ? await Encryption.decrypt(config.refreshToken, encKey)
      : undefined;

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const certPem = process.env.MICROSOFT_CERT_PEM
      ? Buffer.from(process.env.MICROSOFT_CERT_PEM, 'base64').toString('utf8')
      : undefined;

    if (!clientId || !clientSecret) {
      throw new Error(
        'Microsoft365Adapter: MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are required'
      );
    }

    const mspTenantId = config?.tenantId ?? '';
    const baseConnector = new Microsoft365Connector({
      tenantId: mspTenantId,
      clientId,
      clientSecret,
      mode: 'partner',
      refreshToken: refreshToken ?? undefined,
      onRefreshToken: refreshToken
        ? async (newToken: string) => {
            const encryptedToken = await Encryption.encrypt(newToken, encKey);
            await supabase
              .from('integrations')
              .update({
                config: { ...config, refreshToken: encryptedToken },
                updated_at: new Date().toISOString(),
              })
              .eq('id', 'microsoft-365')
              .eq('tenant_id', jobData.tenantId);
          }
        : undefined,
    });

    const allEntities: RawM365Entity[] = [];
    const { ingestType } = jobData;

    const connector = baseConnector.forTenant(link.external_id);
    tracker.trackApiCall();

    const capabilities: MSCapabilities = (link.meta as any).capabilities as MSCapabilities;

    if (ingestType === 'identity') {
      const entities = await this.fetchIdentities(
        connector,
        link.external_id,
        link.id,
        domainMap,
        tracker,
        capabilities
      );
      allEntities.push(...entities);
    } else if (ingestType === 'group') {
      const entities = await this.fetchGroups(connector, link.id, tracker);
      allEntities.push(...entities);
    } else if (ingestType === 'role') {
      const entities = await this.fetchRoles(connector, link.id, tracker);
      allEntities.push(...entities);
    } else if (ingestType === 'policy') {
      const entities = await this.fetchPolicies(connector, link.id, tracker, capabilities);
      allEntities.push(...entities);
    } else if (ingestType === 'license') {
      const entities = await this.fetchLicenses(connector, link.id, tracker);
      allEntities.push(...entities);
    } else if (ingestType === 'exchange-config') {
      const defaultDomain = (link?.meta as any)?.defaultDomain ?? '';
      const entities = await this.fetchExchangeConfig(
        certPem,
        link.external_id,
        defaultDomain,
        link.id,
        tracker
      );
      allEntities.push(...entities);
    } else {
      throw new Error(`Microsoft365Adapter: unknown ingestType "${ingestType}"`);
    }

    return allEntities;
  }

  private async fetchIdentities(
    connector: Microsoft365Connector,
    gdapTenantId: string,
    linkId: string | null,
    domainMap: Map<string, string | null>, // domain → site_id
    tracker: PipelineTracker,
    capabilities: MSCapabilities
  ): Promise<RawM365Entity[]> {
    const select: (keyof MSGraphIdentity)[] = [
      'id',
      'displayName',
      'userType',
      'userPrincipalName',
      'accountEnabled',
      'assignedLicenses',
      'assignedPlans',
      'proxyAddresses',
      'companyName',
      'jobTitle',
    ];

    if (capabilities.signInActivity) {
      select.push('signInActivity');
    } else {
      Logger.warn({
        module: 'Microsoft365Adapter',
        context: 'fetchIdentities',
        message: `signInActivity skipped for tenant ${gdapTenantId} — Azure AD P1 not available`,
      });
    }

    const { data, error } = await tracker.trackSpan('adapter:api:getIdentities', () =>
      connector.getIdentities({ select: select as any }, true)
    );

    if (error || !data) {
      throw new Error(`Microsoft365 getIdentities failed: ${error?.message}`);
    }

    const entities: RawM365Entity[] = [];
    let mappedCount = 0;

    for (const u of data.identities) {
      const domain = u.userPrincipalName?.split('@')[1]?.toLowerCase();
      const siteId = domain ? (domainMap.get(domain) ?? null) : null;
      if (siteId) mappedCount++;

      entities.push({
        type: 'identity',
        externalId: u.id,
        linkId,
        siteId,
        data: u as MSGraphIdentity,
      });
    }

    Logger.info({
      module: 'Microsoft365Adapter',
      context: 'fetchIdentities',
      message: `Fetched ${data.identities.length} identities, matched ${mappedCount} via domain map`,
    });

    return entities;
  }

  private async fetchGroups(
    connector: Microsoft365Connector,
    linkId: string | null,
    tracker: PipelineTracker
  ): Promise<RawM365Entity[]> {
    const { data, error } = await tracker.trackSpan('adapter:api:getGroups', () =>
      connector.getGroups(undefined, true)
    );

    if (error || !data) {
      throw new Error(`Microsoft365 getGroups failed: ${error?.message}`);
    }

    Logger.info({
      module: 'Microsoft365Adapter',
      context: 'fetchGroups',
      message: `Fetched ${data.groups.length} groups`,
    });

    return data.groups.map((g: any) => ({
      type: 'group' as const,
      externalId: g.id,
      linkId,
      data: g,
    }));
  }

  private async fetchRoles(
    connector: Microsoft365Connector,
    linkId: string | null,
    tracker: PipelineTracker
  ): Promise<RawM365Entity[]> {
    const { data, error } = await tracker.trackSpan('adapter:api:getRoles', () =>
      connector.getRoles(undefined, true)
    );

    if (error || !data) {
      throw new Error(`Microsoft365 getRoles failed: ${error?.message}`);
    }

    Logger.info({
      module: 'Microsoft365Adapter',
      context: 'fetchRoles',
      message: `Fetched ${data.roles.length} directory roles`,
    });

    return data.roles.map((r) => ({
      type: 'role' as const,
      externalId: r.id,
      linkId,
      data: r,
    }));
  }

  private async fetchPolicies(
    connector: Microsoft365Connector,
    linkId: string | null,
    tracker: PipelineTracker,
    capabilities: MSCapabilities
  ): Promise<RawM365Entity[]> {
    if (!capabilities.conditionalAccess) {
      Logger.warn({
        module: 'Microsoft365Adapter',
        context: 'fetchPolicies',
        message: 'Conditional Access skipped — tenant lacks Azure AD P1',
      });
      return [];
    }

    const { data, error } = await tracker.trackSpan(
      'adapter:api:getConditionalAccessPolicies',
      () => connector.getConditionalAccessPolicies(undefined, true)
    );

    if (error || !data) {
      throw new Error(`Microsoft365 getConditionalAccessPolicies failed: ${error?.message}`);
    }

    Logger.info({
      module: 'Microsoft365Adapter',
      context: 'fetchPolicies',
      message: `Fetched ${data.policies.length} conditional access policies`,
    });

    return data.policies.map((p: any) => ({
      type: 'policy' as const,
      externalId: p.id,
      linkId,
      data: p,
    }));
  }

  private async fetchLicenses(
    connector: Microsoft365Connector,
    linkId: string | null,
    tracker: PipelineTracker
  ): Promise<RawM365Entity[]> {
    const { data, error } = await tracker.trackSpan('adapter:api:getSubscribedSkus', () =>
      connector.getSubscribedSkus(undefined, true)
    );

    if (error || !data) {
      throw new Error(`Microsoft365 getSubscribedSkus failed: ${error?.message}`);
    }

    const skuNames = await SkuCatalog.resolve();

    Logger.info({
      module: 'Microsoft365Adapter',
      context: 'fetchLicenses',
      message: `Fetched ${data.skus.length} subscribed SKUs`,
    });

    return data.skus.map((sku) => ({
      type: 'license' as const,
      externalId: sku.skuId,
      linkId,
      data: {
        ...sku,
        friendlyName: skuNames.get(sku.skuPartNumber) || sku.skuPartNumber || sku.skuId,
      },
    }));
  }

  private async fetchExchangeConfig(
    certPem: string | undefined,
    gdapTenantId: string,
    defaultDomain: string,
    linkId: string | null,
    tracker: PipelineTracker
  ): Promise<RawM365Entity[]> {
    if (!certPem) {
      Logger.warn({
        module: 'Microsoft365Adapter',
        context: 'fetchExchangeConfig',
        message: 'Skipping exchange-config: no certificate PEM configured',
      });
      return [];
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      throw new Error('Microsoft365Adapter: MICROSOFT_CLIENT_ID required for exchange-config');
    }

    const orgConfig = await tracker.trackSpan('adapter:api:getOrganizationConfig', () =>
      PowerShellRunner.runExchangeOnline(
        clientId,
        certPem,
        defaultDomain || gdapTenantId,
        'Get-OrganizationConfig'
      )
    );

    Logger.info({
      module: 'Microsoft365Adapter',
      context: 'fetchExchangeConfig',
      message: `Fetched Exchange org config for tenant ${gdapTenantId}`,
    });

    const rejectDirectSend =
      (orgConfig as any)?.RejectDirectSend === true ||
      (orgConfig as any)?.RejectDirectSend === 'True';

    return [
      {
        type: 'exchange-config',
        externalId: `org-config-${linkId ?? gdapTenantId}`,
        linkId,
        rejectDirectSend,
      },
    ];
  }
}
