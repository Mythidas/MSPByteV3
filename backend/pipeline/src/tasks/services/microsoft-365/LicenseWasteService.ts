import { getSupabase } from '../../../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@workspace/shared/types/schema';
import type { ScopeDefinition } from '../../types.js';

type EntityRow = Database['public']['Tables']['entities']['Row'];

export interface WastedLicenseIdentity extends EntityRow {
  license_count: number;
}

/**
 * Identifies disabled M365 identities that still have licenses assigned.
 * Returns disabled accounts with one or more active license assignments.
 */
export class LicenseWasteService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async analyze(tenantId: string, scope: ScopeDefinition): Promise<WastedLicenseIdentity[]> {
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
      throw new Error(`LicenseWasteService: failed to load identities — ${error.message}`);
    }

    const entities = data ?? [];
    const wasted: WastedLicenseIdentity[] = [];

    for (const entity of entities) {
      const rd = entity.raw_data as any;
      const accountEnabled: boolean = rd?.accountEnabled ?? true;
      const assignedLicenses: any[] = rd?.assignedLicenses ?? [];

      if (!accountEnabled && assignedLicenses.length > 0) {
        wasted.push({ ...entity, license_count: assignedLicenses.length });
      }
    }

    Logger.trace({
      module: 'LicenseWasteService',
      context: 'analyze',
      message: `Found ${wasted.length} identities with wasted licenses for tenant ${tenantId}`,
    });

    return wasted;
  }
}

export function getLicenseWasteService() {
  return new LicenseWasteService(getSupabase());
}
