import { BaseAdapter } from './BaseAdapter.js';
import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { PipelineTracker } from '../lib/tracker.js';
import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector';
import { SkuCatalog } from '@workspace/shared/lib/services/microsoft/SkuCatalog';
import { PowerShellRunner } from '@workspace/shared/lib/utils/PowerShellRunner';
import Encryption from '@workspace/shared/lib/utils/encryption.js';
import type { AdapterFetchResult, RawEntity, SyncJobData } from '../types.js';
import type { MSCapabilities } from '@workspace/shared/types/integrations/microsoft/capabilities.js';
import { MSGraphIdentity } from '@workspace/shared/types/integrations/microsoft/identity.js';

export class Microsoft365Adapter extends BaseAdapter {
  constructor() {
    super('microsoft-365');
  }

  protected async fetchData(
    jobData: SyncJobData,
    tracker: PipelineTracker
  ): Promise<AdapterFetchResult> {
    const supabase = getSupabase();

    // Load integration config to determine mode
    const config = await this.getIntegrationConfig(jobData.integrationDbId, [], tracker);
    const mode: 'direct' | 'partner' = config?.mode ?? 'direct';

    // Load site_to_integration mappings (siteId → customer tenantId)
    tracker.trackQuery();
    const { data: mappings } = await supabase
      .from('site_to_integration')
      .select('site_id, external_id, meta')
      .eq('integration_id', jobData.integrationDbId)
      .eq('tenant_id', jobData.tenantId);

    const siteMap = new Map<string, string>(); // siteId → customerTenantId
    const domainMap = new Map<string, string>(); // domain → siteId

    for (const m of mappings || []) {
      siteMap.set(m.site_id, m.external_id);
      for (const domain of (m.meta as any)?.domains ?? []) {
        domainMap.set((domain as string).toLowerCase(), m.site_id);
      }
    }

    return this.fetchPartnerEntities(config, jobData, siteMap, domainMap, tracker);
  }

  // ---------------------------------------------------------------------------
  // PARTNER MODE — uses MSPByte ENV app credentials, iterates customer tenants
  // ---------------------------------------------------------------------------

  private async fetchPartnerEntities(
    config: any,
    jobData: SyncJobData,
    siteMap: Map<string, string>, // siteId → gdapTenantId
    domainMap: Map<string, string>, // domain → siteId (from site_to_integration.meta.domains)
    tracker: PipelineTracker
  ): Promise<AdapterFetchResult> {
    const supabase = getSupabase();
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const certPem = Buffer.from(process.env.MICROSOFT_CERT_PEM!, 'base64').toString('utf8');
    const certThumbprint = process.env.MICROSOFT_CERT_THUMBPRINT;

    if (!clientId || !clientSecret) {
      throw new Error(
        'Microsoft365Adapter (partner): MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET env vars are required'
      );
    }

    // Build gdapTenantId → [siteId, ...] map (multiple sites per GDAP tenant)
    const gdapTenantToSites = new Map<string, string[]>();
    for (const [siteId, gdapTenantId] of siteMap) {
      if (!gdapTenantToSites.has(gdapTenantId)) gdapTenantToSites.set(gdapTenantId, []);
      gdapTenantToSites.get(gdapTenantId)!.push(siteId);
    }

    // Load integration_connections to map GDAP external_id → connection UUID
    tracker.trackQuery();
    const { data: connectionsData } = await supabase
      .from('integration_connections')
      .select('id, external_id, meta')
      .eq('integration_id', jobData.integrationDbId)
      .eq('tenant_id', jobData.tenantId);

    const connectionIdByExternalId = new Map(
      (connectionsData ?? []).map((c) => [c.external_id, c.id])
    );

    // Map: gdapTenantId → stored MSCapabilities | null (null = never probed)
    const capabilityMap = new Map<string, MSCapabilities | null>(
      (connectionsData ?? []).map((c) => [c.external_id, (c.meta as any)?.capabilities ?? null])
    );

    // Decrypt stored refresh token (delegated auth for GDAP)
    const encKey = process.env.ENCRYPTION_KEY!;
    const refreshToken = config?.refreshToken
      ? await Encryption.decrypt(config.refreshToken, encKey)
      : undefined;

    // Base connector using MSPByte's own Entra tenant
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

    // Determine which unique GDAP tenants to process
    let gdapTenants: string[];
    if (jobData.connectionId) {
      // Per-connection job: find the GDAP external_id for this connection UUID
      const conn = connectionsData?.find((c) => c.id === jobData.connectionId);
      if (!conn) {
        throw new Error(
          `Microsoft365Adapter: no connection found for connectionId ${jobData.connectionId}`
        );
      }
      gdapTenants = [conn.external_id];
    } else if (jobData.siteId) {
      const gdapTenantId = siteMap.get(jobData.siteId);
      if (!gdapTenantId) {
        throw new Error(
          `Microsoft365Adapter: no customer tenant mapping for site_id ${jobData.siteId}`
        );
      }
      gdapTenants = [gdapTenantId];
    } else {
      gdapTenants = [...gdapTenantToSites.keys()];
    }

    const allEntities: RawEntity[] = [];
    const { entityType } = jobData;

    for (const gdapTenantId of gdapTenants) {
      const connector = baseConnector.forTenant(gdapTenantId);
      tracker.trackApiCall();

      const connectionId = connectionIdByExternalId.get(gdapTenantId);

      // Conservative default: if never probed, assume P1 features unavailable
      const capabilities: MSCapabilities = capabilityMap.get(gdapTenantId) ?? {
        signInActivity: false,
        conditionalAccess: false,
      };

      if (entityType === 'identity') {
        // Filter users by domain → assign siteId per user; unmapped stored with site_id = null
        const entities = await this.fetchIdentities(
          connector,
          gdapTenantId,
          domainMap,
          connectionId,
          tracker,
          capabilities
        );
        allEntities.push(...entities);
      } else if (entityType === 'group') {
        const entities = await this.fetchGroups(connector, undefined, tracker);
        allEntities.push(
          ...entities.map((e) => ({
            ...e,
            connectionId,
            rawData: { ...e.rawData, _gdapTenantId: gdapTenantId },
          }))
        );
      } else if (entityType === 'role') {
        const entities = await this.fetchRoles(connector, undefined, tracker);
        allEntities.push(
          ...entities.map((e) => ({
            ...e,
            connectionId,
            rawData: { ...e.rawData, _gdapTenantId: gdapTenantId },
          }))
        );
      } else if (entityType === 'policy') {
        const entities = await this.fetchPolicies(connector, undefined, tracker, capabilities);
        allEntities.push(
          ...entities.map((e) => ({
            ...e,
            connectionId,
            rawData: { ...e.rawData, _gdapTenantId: gdapTenantId },
          }))
        );
      } else if (entityType === 'license') {
        const entities = await this.fetchLicenses(connector, undefined, tracker);
        allEntities.push(...entities.map((e) => ({ ...e, connectionId })));
      } else if (entityType === 'exchange-config') {
        const connectionMeta = connectionsData?.find((cd) => cd.id === connectionId);
        const entities = await this.fetchExchangeConfig(
          certPem,
          (connectionMeta?.meta as any).defaultDomain ?? '',
          undefined,
          tracker
        );
        allEntities.push(
          ...entities.map((e) => ({
            ...e,
            externalId: `org-config-${connectionId}`,
            connectionId,
            rawData: { ...e.rawData, _gdapTenantId: gdapTenantId },
          }))
        );
      } else {
        throw new Error(`Microsoft365Adapter: unknown entityType "${entityType}"`);
      }
    }

    return { entities: allEntities, pagination: { hasMore: false } };
  }

  private async fetchIdentities(
    connector: Microsoft365Connector,
    gdapTenantId: string,
    domainMap: Map<string, string>, // domain → siteId
    connectionId: string | undefined,
    tracker: PipelineTracker,
    capabilities: MSCapabilities
  ): Promise<RawEntity[]> {
    const select: (keyof MSGraphIdentity)[] = [
      'id',
      'displayName',
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
        context: 'fetchPartnerIdentities',
        message: `signInActivity skipped for tenant ${gdapTenantId} — Azure AD P1 not available`,
      });
    }

    const { data, error } = await tracker.trackSpan('adapter:api:getIdentities', () =>
      connector.getIdentities({ select: select as any }, true)
    );

    if (error || !data) {
      throw new Error(`Microsoft365 getIdentities failed: ${error?.message}`);
    }

    const entities: RawEntity[] = [];
    let mappedCount = 0;

    for (const u of data.identities) {
      const domain = u.userPrincipalName?.split('@')[1]?.toLowerCase();
      const siteId = domain ? domainMap.get(domain) : undefined;
      if (siteId) mappedCount++;

      const { assignedPlans: _ap, ...userRest } = u as any;
      entities.push({
        externalId: u.id,
        displayName: u.displayName || u.userPrincipalName,
        siteId,
        connectionId,
        rawData: { ...userRest, _gdapTenantId: gdapTenantId },
      });
    }

    Logger.info({
      module: 'Microsoft365Adapter',
      context: 'fetchPartnerIdentities',
      message: `Fetched ${data.identities.length} identities, matched ${mappedCount} via domain map, ${data.identities.length - mappedCount} orphaned`,
    });

    return entities;
  }

  private async fetchGroups(
    connector: Microsoft365Connector,
    siteId: string | undefined,
    tracker: PipelineTracker
  ): Promise<RawEntity[]> {
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
      externalId: g.id,
      displayName: g.displayName,
      siteId,
      rawData: g,
    }));
  }

  private async fetchLicenses(
    connector: Microsoft365Connector,
    siteId: string | undefined,
    tracker: PipelineTracker
  ): Promise<RawEntity[]> {
    const { data, error } = await tracker.trackSpan('adapter:api:getSubscribedSkus', () =>
      connector.getSubscribedSkus(undefined, true)
    );

    if (error || !data) {
      throw new Error(`Microsoft365 getSubscribedSkus failed: ${error?.message}`);
    }

    Logger.info({
      module: 'Microsoft365Adapter',
      context: 'fetchLicenses',
      message: `Fetched ${data.skus.length} subscribed SKUs`,
    });

    const skuNames = await SkuCatalog.resolve();

    return data.skus.map((sku) => ({
      externalId: sku.skuId,
      displayName: skuNames.get(sku.skuPartNumber) || sku.skuPartNumber || sku.skuId,
      siteId,
      rawData: sku,
    }));
  }

  private async fetchRoles(
    connector: Microsoft365Connector,
    siteId: string | undefined,
    tracker: PipelineTracker
  ): Promise<RawEntity[]> {
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
      externalId: r.roleTemplateId,
      displayName: r.displayName,
      siteId,
      rawData: r,
    }));
  }

  private async fetchPolicies(
    connector: Microsoft365Connector,
    siteId: string | undefined,
    tracker: PipelineTracker,
    capabilities?: MSCapabilities
  ): Promise<RawEntity[]> {
    if (capabilities && !capabilities.conditionalAccess) {
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
      externalId: p.id,
      displayName: p.displayName,
      siteId,
      rawData: p,
    }));
  }

  private async fetchExchangeConfig(
    certPem: string | undefined,
    customerTenantId: string,
    siteId: string | undefined,
    tracker: PipelineTracker
  ): Promise<RawEntity[]> {
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
      throw new Error(
        'Microsoft365Adapter: MICROSOFT_CLIENT_ID env var required for exchange-config'
      );
    }

    const data = await tracker.trackSpan('adapter:api:getOrganizationConfig', () =>
      PowerShellRunner.runExchangeOnline(
        clientId,
        certPem,
        customerTenantId,
        'Get-OrganizationConfig'
      )
    );

    Logger.info({
      module: 'Microsoft365Adapter',
      context: 'fetchExchangeConfig',
      message: `Fetched Exchange organization config for tenant ${customerTenantId}`,
    });

    return [
      {
        externalId: `org-config`,
        displayName: 'Exchange Organization Config',
        siteId,
        rawData: data,
      },
    ];
  }
}
