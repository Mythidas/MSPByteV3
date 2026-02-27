import { getSupabase } from '../../../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@workspace/shared/types/schema';
import type { ScopeDefinition } from '../../types.js';

type EntityRow = Database['public']['Tables']['entities']['Row'];

export interface StaleIdentity extends EntityRow {
  days_inactive: number;
}

const DEFAULT_DAYS_INACTIVE = 90;

/**
 * Identifies M365 identities that have not signed in recently.
 * Returns only enabled accounts that are stale (inactive beyond threshold).
 */
export class StaleUsersService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async analyze(
    tenantId: string,
    scope: ScopeDefinition,
    params: Record<string, any> = {}
  ): Promise<StaleIdentity[]> {
    const thresholdDays = Number(params.days_inactive) || DEFAULT_DAYS_INACTIVE;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    let query = this.supabase
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', 'microsoft-365')
      .eq('entity_type', 'identity');

    if (scope.connection_id) query = query.eq('connection_id', scope.connection_id);
    if (scope.site_id) query = query.eq('site_id', scope.site_id);
    if (scope.entity_id) query = query.eq('id', scope.entity_id);

    const { data, error } = await query;
    if (error) {
      throw new Error(`StaleUsersService: failed to load identities — ${error.message}`);
    }

    const entities = data ?? [];
    const stale: StaleIdentity[] = [];

    for (const entity of entities) {
      const rd = entity.raw_data as any;
      const enabled: boolean = rd?.accountEnabled ?? false;
      const lastSignIn = rd?.signInActivity?.lastSignInDateTime;

      if (!enabled || !lastSignIn) continue;

      const lastSignInDate = new Date(lastSignIn);
      if (isNaN(lastSignInDate.getTime())) continue;

      const elapsed = now - lastSignInDate.getTime();
      if (elapsed > thresholdMs) {
        const days_inactive = Math.floor(elapsed / (24 * 60 * 60 * 1000));
        stale.push({ ...entity, days_inactive });
      }
    }

    Logger.trace({
      module: 'StaleUsersService',
      context: 'analyze',
      message: `Found ${stale.length} stale identities for tenant ${tenantId} (threshold: ${thresholdDays}d)`,
    });

    return stale;
  }
}

export function getStaleUsersService() {
  return new StaleUsersService(getSupabase());
}
