import { getSupabase } from '../../../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@workspace/shared/types/schema';
import type { ScopeDefinition } from '../../types.js';

type EntityRow = Database['public']['Tables']['entities']['Row'];

/**
 * Identifies M365 Exchange Online configurations with DirectSend open.
 * Returns exchange-config entities where RejectDirectSend is explicitly false,
 * meaning unauthenticated external mail delivery is accepted.
 */
export class DirectSendService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async analyze(tenantId: string, scope: ScopeDefinition): Promise<EntityRow[]> {
    let query = this.supabase
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', 'microsoft-365')
      .eq('entity_type', 'exchange-config');

    if (scope.connection_id) query = query.eq('connection_id', scope.connection_id);
    if (scope.site_id) query = query.eq('site_id', scope.site_id);
    if (scope.entity_id) query = query.eq('id', scope.entity_id);

    const { data, error } = await query;
    if (error) {
      throw new Error(`DirectSendService: failed to load exchange configs — ${error.message}`);
    }

    const entities = data ?? [];
    const open = entities.filter((e) => (e.raw_data as any)?.RejectDirectSend === false);

    Logger.trace({
      module: 'DirectSendService',
      context: 'analyze',
      message: `Found ${open.length} exchange configs with DirectSend open for tenant ${tenantId}`,
    });

    return open;
  }
}

export function getDirectSendService() {
  return new DirectSendService(getSupabase());
}
