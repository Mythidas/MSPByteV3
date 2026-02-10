import { BaseAdapter } from './BaseAdapter.js';
import { Logger } from '../lib/logger.js';
import { getSupabase } from '../supabase.js';
import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector.js';
import type { SyncJobData, AdapterFetchResult } from '../types.js';

/**
 * Microsoft365Adapter - Syncs identity, group, license, role, policy
 * Uses Microsoft365Connector from shared package.
 */
export class Microsoft365Adapter extends BaseAdapter {
  private licenseCatalog: Map<string, string> = new Map();
  private catalogLoaded = false;

  constructor() {
    super('microsoft-365');
  }

  protected getAdapterName(): string {
    return 'Microsoft365Adapter';
  }

  protected async fetchData(jobData: SyncJobData): Promise<AdapterFetchResult> {
    const { integrationDbId, entityType, cursor, tenantId } = jobData;
    const config = await this.getIntegrationConfig(integrationDbId);
    const connector = new Microsoft365Connector(config);

    const { data: healthy } = await connector.checkHealth();
    if (!healthy) throw new Error(`M365 health check failed for ${integrationDbId}`);

    switch (entityType) {
      case 'identity':
        return this.handleIdentitySync(connector, config, tenantId, integrationDbId, cursor);
      case 'group':
        return this.handleGroupSync(connector);
      case 'license':
        return this.handleLicenseSync(connector);
      case 'role':
        return this.handleRoleSync(connector);
      case 'policy':
        return this.handlePolicySync(connector);
      default:
        throw new Error(`Unsupported entity type for Microsoft 365: ${entityType}`);
    }
  }

  private async handleIdentitySync(
    connector: Microsoft365Connector,
    config: any,
    tenantId: number,
    integrationDbId: string,
    cursor?: string,
  ): Promise<AdapterFetchResult> {
    const domainMappings = config?.domainMappings || [];
    if (!domainMappings.length) {
      throw new Error('Data source has no mapped domains or sites');
    }

    // Load site mappings from DB for domain → siteId resolution
    const supabase = getSupabase();
    const { data: siteMappings } = await supabase
      .from('site_to_integration')
      .select('site_id, external_id')
      .eq('integration_id', integrationDbId)
      .eq('tenant_id', tenantId);

    const domainToSiteId = new Map<string, number>();
    for (const dm of domainMappings) {
      // Try to find site mapping by domain
      const mapping = siteMappings?.find((m) => m.external_id === dm.domain);
      if (mapping) {
        domainToSiteId.set(dm.domain, mapping.site_id);
      } else if (dm.siteId) {
        domainToSiteId.set(dm.domain, dm.siteId);
      }
    }

    const { data, error } = await connector.getIdentities({
      domains: domainMappings.map((d: any) => d.domain),
      cursor,
    });

    if (error) throw new Error(error.message || 'Failed to fetch identities');

    const { identities, next } = data;

    const entities = identities.map((rawData: any) => {
      const domain = domainMappings.find((dm: any) =>
        rawData.userPrincipalName?.endsWith(dm.domain),
      );
      const siteId = domain ? domainToSiteId.get(domain.domain) : undefined;

      return {
        externalId: rawData.id,
        displayName: rawData.displayName || rawData.userPrincipalName,
        siteId,
        rawData,
      };
    });

    Logger.log({
      module: 'Microsoft365Adapter',
      context: 'handleIdentitySync',
      message: `Fetched ${entities.length} identities, hasMore: ${!!next}`,
      level: 'trace',
    });

    return {
      entities,
      pagination: { hasMore: !!next, cursor: next },
    };
  }

  private async handleGroupSync(connector: Microsoft365Connector): Promise<AdapterFetchResult> {
    const { data: groups, error } = await connector.getGroups();
    if (error) throw new Error(error.message || 'Failed to fetch groups');

    const entities = await Promise.all(
      (groups || []).map(async (rawData: any) => {
        const { data: members } = await connector.getGroupMembers(rawData.id);
        const memberIds = members ? members.map((m: any) => m.id) : [];

        const { data: parentGroups } = await connector.getGroupMemberOf(rawData.id);
        const parentGroupIds = parentGroups
          ? parentGroups
              .filter((p: any) => p['@odata.type'] === '#microsoft.graph.group')
              .map((p: any) => p.id)
          : [];

        return {
          externalId: rawData.id,
          displayName: rawData.displayName,
          rawData: { ...rawData, members: memberIds, memberOf: parentGroupIds },
        };
      }),
    );

    Logger.log({
      module: 'Microsoft365Adapter',
      context: 'handleGroupSync',
      message: `Fetched ${entities.length} groups with members`,
      level: 'trace',
    });

    return { entities, pagination: { hasMore: false } };
  }

  private async handleLicenseSync(connector: Microsoft365Connector): Promise<AdapterFetchResult> {
    await this.loadLicenseCatalog();

    const { data: skus, error } = await connector.getSubscribedSkus();
    if (error) throw new Error(error.message || 'Failed to fetch licenses');

    const entities = (skus || []).map((rawData: any) => {
      const friendlyName = this.licenseCatalog.get(rawData.skuId) || rawData.skuPartNumber;
      return {
        externalId: rawData.skuId,
        displayName: friendlyName,
        rawData: { ...rawData, friendlyName },
      };
    });

    Logger.log({
      module: 'Microsoft365Adapter',
      context: 'handleLicenseSync',
      message: `Fetched ${entities.length} licenses`,
      level: 'trace',
    });

    return { entities, pagination: { hasMore: false } };
  }

  private async handleRoleSync(connector: Microsoft365Connector): Promise<AdapterFetchResult> {
    const { data: roles, error } = await connector.getRoles();
    if (error) throw new Error(error.message || 'Failed to fetch roles');

    const entities = await Promise.all(
      (roles || []).map(async (rawData: any) => {
        const { data: members } = await connector.getRoleMembers(rawData.id);
        const memberIds = members ? members.map((m: any) => m.id) : [];

        return {
          externalId: rawData.id,
          displayName: rawData.displayName,
          rawData: { ...rawData, members: memberIds },
        };
      }),
    );

    Logger.log({
      module: 'Microsoft365Adapter',
      context: 'handleRoleSync',
      message: `Fetched ${entities.length} roles with members`,
      level: 'trace',
    });

    return { entities, pagination: { hasMore: false } };
  }

  private async handlePolicySync(connector: Microsoft365Connector): Promise<AdapterFetchResult> {
    const { data: policies, error: policiesError } =
      await connector.getConditionalAccessPolicies();
    if (policiesError) throw new Error(policiesError.message || 'Failed to fetch policies');

    const { data: securityDefaults } = await connector.getSecurityDefaultsEnabled();

    const entities = (policies || []).map((rawData: any) => ({
      externalId: rawData.id,
      displayName: rawData.displayName,
      rawData,
    }));

    // Add security defaults as a pseudo-policy
    if (securityDefaults) {
      entities.push({
        externalId: 'security-defaults',
        displayName: 'Security Defaults',
        rawData: {
          id: 'security-defaults',
          displayName: 'Security Defaults',
          state: 'enabled',
          isEnabled: true,
          createdDateTime: '',
        },
      });
    }

    Logger.log({
      module: 'Microsoft365Adapter',
      context: 'handlePolicySync',
      message: `Fetched ${entities.length} policies (including security defaults)`,
      level: 'trace',
    });

    return { entities, pagination: { hasMore: false } };
  }

  private async loadLicenseCatalog(): Promise<void> {
    if (this.catalogLoaded) return;

    const csvUrl =
      'https://download.microsoft.com/download/e/3/e/e3e9faf2-f28b-490a-9ada-c6089a1fc5b0/Product%20names%20and%20service%20plan%20identifiers%20for%20licensing.csv';

    try {
      Logger.log({
        module: 'Microsoft365Adapter',
        context: 'loadLicenseCatalog',
        message: 'Loading license catalog from Microsoft CSV...',
        level: 'info',
      });

      const response = await fetch(csvUrl);
      const csvText = await response.text();
      const lines = csvText.split('\n');

      for (let i = 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i]);
        if (fields.length >= 3 && fields[2]) {
          this.licenseCatalog.set(fields[2], fields[0]);
        }
      }

      this.catalogLoaded = true;

      Logger.log({
        module: 'Microsoft365Adapter',
        context: 'loadLicenseCatalog',
        message: `Loaded ${this.licenseCatalog.size} license SKUs`,
        level: 'info',
      });
    } catch (err) {
      Logger.log({
        module: 'Microsoft365Adapter',
        context: 'loadLicenseCatalog',
        message: `Error loading license catalog: ${err}. Will use SKU IDs as fallback.`,
        level: 'warn',
      });
    }
  }
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current) fields.push(current.trim());

  return fields;
}
