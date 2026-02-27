import { getSupabase } from '../../../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@workspace/shared/types/schema';
import type { ScopeDefinition } from '../../types.js';

type EntityRow = Database['public']['Tables']['entities']['Row'];

export interface OfflineEndpoint extends EntityRow {
  days_offline: number;
}

const DEFAULT_DAYS_OFFLINE = 30;

/**
 * Identifies DattoRMM-managed endpoints that have been offline beyond a threshold.
 * Uses raw_data.lastSeen and raw_data.online to determine offline status.
 */
export class DattoOfflineDevicesService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async analyze(
    tenantId: string,
    scope: ScopeDefinition,
    params: Record<string, any> = {}
  ): Promise<OfflineEndpoint[]> {
    const thresholdDays = Number(params.days_offline) || DEFAULT_DAYS_OFFLINE;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    let query = this.supabase
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', 'dattormm')
      .eq('entity_type', 'endpoint');

    if (scope.connection_id) query = query.eq('connection_id', scope.connection_id);
    if (scope.site_id) query = query.eq('site_id', scope.site_id);
    if (scope.entity_id) query = query.eq('id', scope.entity_id);

    const { data, error } = await query;
    if (error) {
      throw new Error(`DattoOfflineDevicesService: failed to load endpoints — ${error.message}`);
    }

    const entities = data ?? [];
    const offline: OfflineEndpoint[] = [];

    for (const entity of entities) {
      const rd = entity.raw_data as any;
      const lastSeen = rd?.lastSeen;
      const online: boolean = rd?.online ?? false;

      if (!lastSeen) continue;

      const lastSeenDate = new Date(lastSeen);
      if (isNaN(lastSeenDate.getTime())) continue;

      const elapsed = now - lastSeenDate.getTime();
      if (elapsed > thresholdMs && !online) {
        const days_offline = Math.floor(elapsed / (24 * 60 * 60 * 1000));
        offline.push({ ...entity, days_offline });
      }
    }

    Logger.trace({
      module: 'DattoOfflineDevicesService',
      context: 'analyze',
      message: `Found ${offline.length} offline DattoRMM endpoints for tenant ${tenantId} (threshold: ${thresholdDays}d)`,
    });

    return offline;
  }
}

export function getDattoOfflineDevicesService() {
  return new DattoOfflineDevicesService(getSupabase());
}
