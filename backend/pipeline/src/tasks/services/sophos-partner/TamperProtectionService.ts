import { getSupabase } from '../../../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@workspace/shared/types/schema';
import type { ScopeDefinition } from '../../types.js';

type EntityRow = Database['public']['Tables']['entities']['Row'];

/**
 * Identifies Sophos-managed endpoints with Tamper Protection disabled.
 * Returns endpoint entities where tamperProtectionEnabled is falsy.
 */
export class TamperProtectionService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async analyze(tenantId: string, scope: ScopeDefinition): Promise<EntityRow[]> {
    let query = this.supabase
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', 'sophos-partner')
      .eq('entity_type', 'endpoint');

    if (scope.connection_id) query = query.eq('connection_id', scope.connection_id);
    if (scope.site_id) query = query.eq('site_id', scope.site_id);
    if (scope.entity_id) query = query.eq('id', scope.entity_id);

    const { data, error } = await query;
    if (error) {
      throw new Error(
        `TamperProtectionService: failed to load endpoints — ${error.message}`
      );
    }

    const entities = data ?? [];
    const unprotected = entities.filter(
      (e) => !(e.raw_data as any)?.tamperProtectionEnabled
    );

    Logger.trace({
      module: 'TamperProtectionService',
      context: 'analyze',
      message: `Found ${unprotected.length} endpoints with tamper protection disabled for tenant ${tenantId}`,
    });

    return unprotected;
  }
}

export function getTamperProtectionService() {
  return new TamperProtectionService(getSupabase());
}
