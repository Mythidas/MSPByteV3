import { getSupabase } from '../../../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@workspace/shared/types/schema';
import type { ScopeDefinition } from '../../types.js';

type EntityRow = Database['public']['Tables']['entities']['Row'];

/**
 * Identifies DattoRMM-managed company/site entities with no endpoint children.
 * A site is "empty" if it has no endpoint entities assigned to it (site_id matches).
 */
export class DattoEmptySitesService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async analyze(tenantId: string, scope: ScopeDefinition): Promise<EntityRow[]> {
    let companyQuery = this.supabase
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', 'dattormm')
      .eq('entity_type', 'company');

    if (scope.connection_id) companyQuery = companyQuery.eq('connection_id', scope.connection_id);
    if (scope.site_id) companyQuery = companyQuery.eq('site_id', scope.site_id);
    if (scope.entity_id) companyQuery = companyQuery.eq('id', scope.entity_id);

    const { data: companies, error: companyError } = await companyQuery;
    if (companyError) {
      throw new Error(`DattoEmptySitesService: failed to load companies — ${companyError.message}`);
    }

    if (!companies || companies.length === 0) return [];

    // Load all endpoints for this tenant to find which sites have children
    let endpointQuery = this.supabase
      .from('entities')
      .select('site_id')
      .eq('tenant_id', tenantId)
      .eq('integration_id', 'dattormm')
      .eq('entity_type', 'endpoint')
      .not('site_id', 'is', null);

    if (scope.connection_id) endpointQuery = endpointQuery.eq('connection_id', scope.connection_id);

    const { data: endpoints, error: endpointError } = await endpointQuery;
    if (endpointError) {
      throw new Error(
        `DattoEmptySitesService: failed to load endpoints — ${endpointError.message}`
      );
    }

    const sitesWithDevices = new Set<string>(
      (endpoints ?? []).map((e) => e.site_id as string).filter(Boolean)
    );

    const empty = companies.filter((c) => !sitesWithDevices.has(c.id));

    Logger.trace({
      module: 'DattoEmptySitesService',
      context: 'analyze',
      message: `Found ${empty.length} empty DattoRMM sites for tenant ${tenantId}`,
    });

    return empty;
  }
}

export function getDattoEmptySitesService() {
  return new DattoEmptySitesService(getSupabase());
}
