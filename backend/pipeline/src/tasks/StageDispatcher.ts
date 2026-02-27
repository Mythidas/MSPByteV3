import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import Encryption from '@workspace/shared/lib/utils/encryption.js';
import { DattoRMMConnector } from '@workspace/shared/lib/connectors/DattoRMMConnector.js';
import { HaloPSAConnector } from '@workspace/shared/lib/connectors/HaloPSAConnector.js';
import { AutoTaskConnector } from '@workspace/shared/lib/connectors/AutoTaskConnector.js';
import type { QueryRow, ActionRow, ScopeDefinition } from './types.js';
import { LIVE_QUERY_REGISTRY } from './registry/queries/index.js';
import { ACTION_REGISTRY } from './registry/actions/index.js';

// ============================================================================
// ENTITY TYPE MODULE MAP
// Maps module names (used in query definitions) to entity_type values in the DB.
// Modules not in this map trigger live API queries instead of DB lookups.
// ============================================================================
const ENTITY_TYPE_MAP: Record<string, string> = {
  devices: 'endpoint',
  endpoints: 'endpoint',
  identities: 'identity',
  users: 'identity',
  policies: 'policy',
  licenses: 'license',
  groups: 'group',
  roles: 'role',
  companies: 'company',
  sites: 'company',
  firewalls: 'firewall',
  tickets: 'ticket',
  contracts: 'contract',
};

// ============================================================================
// DECRYPT KEYS PER INTEGRATION
// Fields in integration.config that must be decrypted before use.
// ============================================================================
const DECRYPT_KEYS: Record<string, string[]> = {
  dattormm: ['clientSecret'],
  halopsa: ['clientSecret'],
  autotask: ['apiKey'],
  'microsoft-365': ['clientSecret'],
  'sophos-partner': ['clientSecret'],
};

/**
 * StageDispatcher
 *
 * Dispatches individual workflow stages to either:
 *   - DB entity queries (module maps to a known entity_type)
 *   - Live API queries via LIVE_QUERY_REGISTRY (module not in entity type map)
 *   - Actions via ACTION_REGISTRY (always live API)
 */
export class StageDispatcher {
  // --------------------------------------------------------------------------
  // QUERY DISPATCH
  // --------------------------------------------------------------------------

  async dispatchQuery(
    queryDef: QueryRow,
    scope: ScopeDefinition,
    params: Record<string, any>,
    tenantId: string
  ): Promise<any> {
    const entityType = ENTITY_TYPE_MAP[queryDef.module.toLowerCase()];

    if (entityType) {
      return this.queryEntities(queryDef, entityType, scope, params, tenantId);
    }

    return this.queryLiveApi(queryDef, scope, params, tenantId);
  }

  private async queryEntities(
    queryDef: QueryRow,
    entityType: string,
    scope: ScopeDefinition,
    params: Record<string, any>,
    tenantId: string
  ): Promise<any> {
    const supabase = getSupabase();

    let query = supabase
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', queryDef.integration_id)
      .eq('entity_type', entityType);

    if (scope.site_id) {
      query = query.eq('site_id', scope.site_id);
    }
    if (scope.connection_id) {
      query = query.eq('connection_id', scope.connection_id);
    }
    if (scope.entity_id) {
      query = query.eq('id', scope.entity_id);
    }

    // Apply params as additional column or raw_data filters
    for (const [key, value] of Object.entries(params)) {
      if (key === 'entity_type') continue; // already applied above
      if (Array.isArray(value)) {
        query = query.in(key as any, value);
      } else {
        query = query.eq(key as any, value);
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(`Entity query failed: ${error.message}`);

    const rows = data || [];

    switch (queryDef.output_format) {
      case 'list':
        return rows.map((e: any) => e.display_name).filter(Boolean);
      case 'scalar':
        return rows.length;
      case 'boolean':
        return rows.length > 0;
      default: // 'table'
        return rows;
    }
  }

  private async queryLiveApi(
    queryDef: QueryRow,
    scope: ScopeDefinition,
    params: Record<string, any>,
    tenantId: string
  ): Promise<any> {
    const entry =
      LIVE_QUERY_REGISTRY[queryDef.integration_id]?.[queryDef.module]?.[queryDef.function];

    if (!entry) {
      throw new Error(
        `Live API query not implemented: integration=${queryDef.integration_id} module=${queryDef.module} function=${queryDef.function}`
      );
    }

    Logger.trace({
      module: 'StageDispatcher',
      context: 'queryLiveApi',
      message: `Dispatching live query ${queryDef.integration_id}/${queryDef.module}/${queryDef.function}`,
    });

    // Attempt to load connector — null is acceptable for pure DB handlers
    let connector: any = null;
    try {
      const config = await this.loadIntegrationConfig(queryDef.integration_id, tenantId);
      connector = this.createConnector(queryDef.integration_id, config);
    } catch {
      // Handler does not require a connector (e.g. pure DB query)
    }

    return entry.handler(connector, params, tenantId, scope);
  }

  // --------------------------------------------------------------------------
  // ACTION DISPATCH
  // --------------------------------------------------------------------------

  async dispatchAction(
    actionDef: ActionRow,
    _scope: ScopeDefinition,
    resolvedArgs: Record<string, any>,
    tenantId: string
  ): Promise<any> {
    const integrationHandlers = ACTION_REGISTRY[actionDef.integration_id];
    if (!integrationHandlers) {
      throw new Error(`No action handlers registered for integration: ${actionDef.integration_id}`);
    }

    const moduleHandlers = integrationHandlers[actionDef.module];
    if (!moduleHandlers) {
      throw new Error(`No handlers for ${actionDef.integration_id}/${actionDef.module}`);
    }

    const entry = moduleHandlers[actionDef.function];
    if (!entry) {
      throw new Error(
        `No handler for ${actionDef.integration_id}/${actionDef.module}/${actionDef.function}`
      );
    }

    const config = await this.loadIntegrationConfig(actionDef.integration_id, tenantId);
    const connector = this.createConnector(actionDef.integration_id, config);

    // Merge static params from action definition with resolved dynamic args
    const mergedParams = { ...actionDef.params, ...resolvedArgs };

    Logger.trace({
      module: 'StageDispatcher',
      context: 'dispatchAction',
      message: `Dispatching ${actionDef.integration_id}/${actionDef.module}/${actionDef.function}`,
    });

    return entry.handler(connector, mergedParams);
  }

  // --------------------------------------------------------------------------
  // INTEGRATION CONFIG + CONNECTOR FACTORY
  // --------------------------------------------------------------------------

  private async loadIntegrationConfig(integrationId: string, tenantId: string): Promise<any> {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('integrations')
      .select('config')
      .eq('id', integrationId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data?.config) {
      throw new Error(`Integration config not found for ${integrationId} (tenant ${tenantId})`);
    }

    const config = { ...(data.config as any) };
    const keysToDecrypt = DECRYPT_KEYS[integrationId] || [];

    for (const key of keysToDecrypt) {
      if (config[key]) {
        config[key] = await Encryption.decrypt(config[key], process.env.ENCRYPTION_KEY!);
      }
    }

    return config;
  }

  private createConnector(integrationId: string, config: any): any {
    switch (integrationId) {
      case 'dattormm':
        return new DattoRMMConnector(config);
      case 'halopsa':
        return new HaloPSAConnector(config);
      case 'autotask':
        return new AutoTaskConnector(config);
      default:
        // Return null for unknown integrations — live query handlers may not need a connector
        return null;
    }
  }
}
