import { BaseAdapter } from './BaseAdapter.js';
import { getSupabase } from '../supabase.js';
import { Logger } from '../lib/logger.js';
import { PipelineTracker } from '../lib/tracker.js';
import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector';
import { PowerShellRunner } from '@workspace/shared/lib/utils/PowerShellRunner';
import Encryption from '@workspace/shared/lib/utils/encryption.js';
import type { AdapterFetchResult, RawEntity, SyncJobData } from '../types.js';

export class Microsoft365Adapter extends BaseAdapter {
  constructor() {
    super('microsoft-365');
  }

  protected async fetchData(
    jobData: SyncJobData,
    tracker: PipelineTracker,
  ): Promise<AdapterFetchResult> {
    const supabase = getSupabase();

    // Load integration config to determine mode
    const config = await this.getIntegrationConfig(jobData.integrationDbId, ['clientSecret'], tracker);
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

    if (mode === 'partner') {
      return this.fetchPartnerEntities(config, jobData, siteMap, domainMap, tracker);
    }

    return this.fetchDirectEntities(config, jobData, siteMap, tracker);
  }

  // ---------------------------------------------------------------------------
  // PARTNER MODE — uses MSPByte ENV app credentials, iterates customer tenants
  // ---------------------------------------------------------------------------

  private async fetchPartnerEntities(
    config: any,
    jobData: SyncJobData,
    siteMap: Map<string, string>, // siteId → gdapTenantId
    domainMap: Map<string, string>, // domain → siteId (from site_to_integration.meta.domains)
    tracker: PipelineTracker,
  ): Promise<AdapterFetchResult> {
    const supabase = getSupabase();
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const certPem = process.env.MICROSOFT_CERT_PEM;

    if (!clientId || !clientSecret) {
      throw new Error(
        'Microsoft365Adapter (partner): MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET env vars are required',
      );
    }

    // Build gdapTenantId → [siteId, ...] map (multiple sites per GDAP tenant)
    const gdapTenantToSites = new Map<string, string[]>();
    for (const [siteId, gdapTenantId] of siteMap) {
      if (!gdapTenantToSites.has(gdapTenantId)) gdapTenantToSites.set(gdapTenantId, []);
      gdapTenantToSites.get(gdapTenantId)!.push(siteId);
    }

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
    if (jobData.siteId) {
      const gdapTenantId = siteMap.get(jobData.siteId);
      if (!gdapTenantId) {
        throw new Error(
          `Microsoft365Adapter: no customer tenant mapping for site_id ${jobData.siteId}`,
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

      if (entityType === 'identity') {
        // Filter users by domain → assign siteId per user, skip unmatched
        const entities = await this.fetchPartnerIdentities(connector, domainMap, tracker);
        allEntities.push(...entities);
      } else if (entityType === 'group') {
        const entities = await this.fetchGroups(connector, undefined, tracker);
        allEntities.push(
          ...entities.map((e) => ({ ...e, rawData: { ...e.rawData, _gdapTenantId: gdapTenantId } })),
        );
      } else if (entityType === 'role') {
        const entities = await this.fetchRoles(connector, undefined, tracker);
        allEntities.push(
          ...entities.map((e) => ({ ...e, rawData: { ...e.rawData, _gdapTenantId: gdapTenantId } })),
        );
      } else if (entityType === 'policy') {
        const entities = await this.fetchPolicies(connector, undefined, tracker);
        allEntities.push(
          ...entities.map((e) => ({ ...e, rawData: { ...e.rawData, _gdapTenantId: gdapTenantId } })),
        );
      } else if (entityType === 'license') {
        const entities = await this.fetchLicenses(connector, undefined, tracker);
        allEntities.push(...entities);
      } else if (entityType === 'exchange-config') {
        const entities = await this.fetchExchangeConfig(certPem, gdapTenantId, undefined, tracker);
        allEntities.push(
          ...entities.map((e) => ({ ...e, rawData: { ...e.rawData, _gdapTenantId: gdapTenantId } })),
        );
      } else {
        throw new Error(`Microsoft365Adapter: unknown entityType "${entityType}"`);
      }
    }

    return { entities: allEntities, pagination: { hasMore: false } };
  }

  private async fetchPartnerIdentities(
    connector: Microsoft365Connector,
    domainMap: Map<string, string>, // domain → siteId
    tracker: PipelineTracker,
  ): Promise<RawEntity[]> {
    const { data, error } = await tracker.trackSpan('adapter:api:getIdentities', () =>
      connector.getIdentities({ domains: [] }),
    );

    if (error || !data) {
      throw new Error(`Microsoft365 getIdentities failed: ${error?.message}`);
    }

    const entities: RawEntity[] = [];

    for (const u of data.identities) {
      const domain = u.userPrincipalName?.split('@')[1]?.toLowerCase();
      const siteId = domain ? domainMap.get(domain) : undefined;
      if (!siteId) continue; // Skip users with no domain mapping

      entities.push({
        externalId: u.id,
        displayName: u.displayName || u.userPrincipalName,
        siteId,
        rawData: u,
      });
    }

    Logger.log({
      module: 'Microsoft365Adapter',
      context: 'fetchPartnerIdentities',
      message: `Fetched ${data.identities.length} identities, matched ${entities.length} via domain map`,
      level: 'info',
    });

    return entities;
  }

  // ---------------------------------------------------------------------------
  // DIRECT MODE — uses per-integration credentials from the DB config
  // ---------------------------------------------------------------------------

  private async fetchDirectEntities(
    config: any,
    jobData: SyncJobData,
    _siteMap: Map<string, string>,
    tracker: PipelineTracker,
  ): Promise<AdapterFetchResult> {
    const connector = new Microsoft365Connector({
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      mode: 'direct',
      certificatePem: config.certificatePem,
      domainMappings: config.domainMappings,
    });

    tracker.trackApiCall();
    const entities = await this.fetchEntitiesForTenant(
      connector,
      jobData,
      jobData.siteId || undefined,
      config.certificatePem,
      config.tenantId,
      tracker,
    );

    return { entities, pagination: { hasMore: false } };
  }

  // ---------------------------------------------------------------------------
  // SHARED — fetch a single entity type for one tenant
  // ---------------------------------------------------------------------------

  private async fetchEntitiesForTenant(
    connector: Microsoft365Connector,
    jobData: SyncJobData,
    siteId: string | undefined,
    certPem: string | undefined,
    customerTenantId: string,
    tracker: PipelineTracker,
  ): Promise<RawEntity[]> {
    const { entityType } = jobData;

    if (entityType === 'identity') {
      return this.fetchIdentities(connector, siteId, tracker);
    }

    if (entityType === 'group') {
      return this.fetchGroups(connector, siteId, tracker);
    }

    if (entityType === 'license') {
      return this.fetchLicenses(connector, siteId, tracker);
    }

    if (entityType === 'role') {
      return this.fetchRoles(connector, siteId, tracker);
    }

    if (entityType === 'policy') {
      return this.fetchPolicies(connector, siteId, tracker);
    }

    if (entityType === 'exchange-config') {
      return this.fetchExchangeConfig(certPem, customerTenantId, siteId, tracker);
    }

    throw new Error(`Microsoft365Adapter: unknown entityType "${entityType}"`);
  }

  private async fetchIdentities(
    connector: Microsoft365Connector,
    siteId: string | undefined,
    tracker: PipelineTracker,
  ): Promise<RawEntity[]> {
    const { data, error } = await tracker.trackSpan('adapter:api:getIdentities', () =>
      connector.getIdentities({ domains: [] }),
    );

    if (error || !data) {
      throw new Error(`Microsoft365 getIdentities failed: ${error?.message}`);
    }

    Logger.log({
      module: 'Microsoft365Adapter',
      context: 'fetchIdentities',
      message: `Fetched ${data.identities.length} identities`,
      level: 'info',
    });

    return data.identities.map((u: any) => ({
      externalId: u.id,
      displayName: u.displayName || u.userPrincipalName,
      siteId,
      rawData: u,
    }));
  }

  private async fetchGroups(
    connector: Microsoft365Connector,
    siteId: string | undefined,
    tracker: PipelineTracker,
  ): Promise<RawEntity[]> {
    const { data: groups, error } = await tracker.trackSpan('adapter:api:getGroups', () =>
      connector.getGroups(),
    );

    if (error || !groups) {
      throw new Error(`Microsoft365 getGroups failed: ${error?.message}`);
    }

    Logger.log({
      module: 'Microsoft365Adapter',
      context: 'fetchGroups',
      message: `Fetched ${groups.length} groups`,
      level: 'info',
    });

    return groups.map((g: any) => ({
      externalId: g.id,
      displayName: g.displayName,
      siteId,
      rawData: g,
    }));
  }

  private async fetchLicenses(
    connector: Microsoft365Connector,
    siteId: string | undefined,
    tracker: PipelineTracker,
  ): Promise<RawEntity[]> {
    const { data: skus, error } = await tracker.trackSpan('adapter:api:getSubscribedSkus', () =>
      connector.getSubscribedSkus(),
    );

    if (error || !skus) {
      throw new Error(`Microsoft365 getSubscribedSkus failed: ${error?.message}`);
    }

    Logger.log({
      module: 'Microsoft365Adapter',
      context: 'fetchLicenses',
      message: `Fetched ${skus.length} subscribed SKUs`,
      level: 'info',
    });

    return skus.map((sku: any) => ({
      externalId: sku.skuId,
      displayName: sku.skuPartNumber || sku.skuId,
      siteId,
      rawData: sku,
    }));
  }

  private async fetchRoles(
    connector: Microsoft365Connector,
    siteId: string | undefined,
    tracker: PipelineTracker,
  ): Promise<RawEntity[]> {
    const { data: roles, error } = await tracker.trackSpan('adapter:api:getRoles', () =>
      connector.getRoles(),
    );

    if (error || !roles) {
      throw new Error(`Microsoft365 getRoles failed: ${error?.message}`);
    }

    Logger.log({
      module: 'Microsoft365Adapter',
      context: 'fetchRoles',
      message: `Fetched ${roles.length} directory roles`,
      level: 'info',
    });

    return roles.map((r: any) => ({
      externalId: r.id,
      displayName: r.displayName,
      siteId,
      rawData: r,
    }));
  }

  private async fetchPolicies(
    connector: Microsoft365Connector,
    siteId: string | undefined,
    tracker: PipelineTracker,
  ): Promise<RawEntity[]> {
    const { data: policies, error } = await tracker.trackSpan(
      'adapter:api:getConditionalAccessPolicies',
      () => connector.getConditionalAccessPolicies(),
    );

    if (error || !policies) {
      throw new Error(`Microsoft365 getConditionalAccessPolicies failed: ${error?.message}`);
    }

    Logger.log({
      module: 'Microsoft365Adapter',
      context: 'fetchPolicies',
      message: `Fetched ${policies.length} conditional access policies`,
      level: 'info',
    });

    return policies.map((p: any) => ({
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
    tracker: PipelineTracker,
  ): Promise<RawEntity[]> {
    if (!certPem) {
      Logger.log({
        module: 'Microsoft365Adapter',
        context: 'fetchExchangeConfig',
        message: 'Skipping exchange-config: no certificate PEM configured',
        level: 'warn',
      });
      return [];
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      throw new Error(
        'Microsoft365Adapter: MICROSOFT_CLIENT_ID env var required for exchange-config',
      );
    }

    const data = await tracker.trackSpan('adapter:api:getOrganizationConfig', () =>
      PowerShellRunner.runExchangeOnline(
        clientId,
        certPem,
        customerTenantId,
        'Get-OrganizationConfig',
      ),
    );

    Logger.log({
      module: 'Microsoft365Adapter',
      context: 'fetchExchangeConfig',
      message: `Fetched Exchange organization config for tenant ${customerTenantId}`,
      level: 'info',
    });

    return [
      {
        externalId: 'org-config',
        displayName: 'Exchange Organization Config',
        siteId,
        rawData: data,
      },
    ];
  }
}
