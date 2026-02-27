import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import Encryption from '@workspace/shared/lib/utils/encryption.js';
import { DattoRMMConnector } from '@workspace/shared/lib/connectors/DattoRMMConnector.js';
import { HaloPSAConnector } from '@workspace/shared/lib/connectors/HaloPSAConnector.js';
import { AutoTaskConnector } from '@workspace/shared/lib/connectors/AutoTaskConnector.js';
import type { QueryRow, ActionRow, ScopeDefinition } from './types.js';
import { MFACoverageService } from './MFACoverageService.js';

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
// LIVE QUERY REGISTRY
// Handlers for modules not in ENTITY_TYPE_MAP (complex multi-entity analysis).
// Connector is provided but may be null for pure DB-based handlers.
// ============================================================================
type LiveQueryHandler = (
  connector: any,
  params: Record<string, any>,
  tenantId: string,
  scope: ScopeDefinition
) => Promise<any>;

type LiveQueryRegistry = Record<string, Record<string, Record<string, LiveQueryHandler>>>;

const LIVE_QUERY_REGISTRY: LiveQueryRegistry = {
  'microsoft-365': {
    mfa: {
      // Returns uncovered identity rows augmented with mfa_state: 'none' | 'partial'.
      // Empty array means all users are covered → no alerts fired.
      coverage: async (_connector, _params, tenantId, scope) =>
        new MFACoverageService(getSupabase()).analyze(tenantId, scope),
    },
  },
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

// ============================================================================
// ACTION REGISTRY
// Maps integration_id → module → function → handler(connector, params)
//
// NOTE: Actions should ideally use dedicated Service classes (not connectors
// directly) since services encapsulate write/mutation logic and can compose
// multiple connector calls. Use connectors here only when no service exists.
// Add service-based handlers as integrations mature.
// ============================================================================
type ActionHandler = (connector: any, params: Record<string, any>) => Promise<any>;
type ActionRegistry = Record<string, Record<string, Record<string, ActionHandler>>>;

const ACTION_REGISTRY: ActionRegistry = {
  dattormm: {
    variables: {
      set: async (connector: DattoRMMConnector, params) =>
        connector.setSiteVariable(params.siteUid, params.varName, params.value),
    },
  },
  halopsa: {
    tickets: {
      // NOTE: HaloPSA write operations ideally belong in a dedicated HaloPSAService.
      // Using connector directly here until a service layer is added.
      create: async (connector: HaloPSAConnector, params) => connector.createTicket(params as any),
    },
  },
  autotask: {
    tickets: {
      // NOTE: AutoTask write operations ideally belong in a dedicated AutoTaskService.
      // Placeholder — implement AutoTaskService.createTicket() to enable this.
      create: async (_connector: AutoTaskConnector, _params) => {
        throw new Error(
          'autotask/tickets/create is not yet implemented. Add an AutoTaskService with createTicket().'
        );
      },
    },
  },
};

/**
 * StageDispatcher
 *
 * Dispatches individual workflow stages to either:
 *   - DB entity queries (module maps to a known entity_type)
 *   - Live API queries (module not in entity type map)
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
    const handler =
      LIVE_QUERY_REGISTRY[queryDef.integration_id]?.[queryDef.module]?.[queryDef.function];

    if (!handler) {
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

    return handler(connector, params, tenantId, scope);
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

    const handler = moduleHandlers[actionDef.function];
    if (!handler) {
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

    return handler(connector, mergedParams);
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
