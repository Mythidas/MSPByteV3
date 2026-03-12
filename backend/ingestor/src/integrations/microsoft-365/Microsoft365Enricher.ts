import { getSupabase } from '../../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { PipelineTracker } from '../../lib/tracker.js';
import type { EnrichJobData } from '../../types.js';
import type { IEnricher } from '../../interfaces.js';
import type { MSGraphConditionalAccessPolicy } from '@workspace/shared/types/integrations/microsoft/policies.js';

const CHUNK = 500;

/**
 * Microsoft365Enricher — computes derived columns on already-synced vendor rows.
 * No API calls. Runs after Adapter → Processor → Linker.
 * Dep checking is handled by EnrichWorker — no prerequisites guard here.
 */
export class Microsoft365Enricher implements IEnricher {
  async enrich(job: EnrichJobData, tracker: PipelineTracker): Promise<void> {
    switch (job.enrichOpType) {
      case 'enrich-mfa-enforced':
        return this.enrichMfaEnforced(job, tracker);
      default:
        throw new Error(`Microsoft365Enricher: unknown enrichOpType "${job.enrichOpType}"`);
    }
  }

  private async enrichMfaEnforced(job: EnrichJobData, tracker: PipelineTracker): Promise<void> {
    const { tenantId, linkId } = job;
    const supabase = getSupabase();

    // Load data
    tracker.trackQuery();
    const { data: policyRows } = await supabase
      .schema('vendors')
      .from('m365_policies')
      .select('id, policy_state, requires_mfa, conditions')
      .eq('tenant_id', tenantId)
      .eq('link_id', linkId);

    tracker.trackQuery();
    const { data: identityRows } = await supabase
      .schema('vendors')
      .from('m365_identities')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .eq('link_id', linkId);

    tracker.trackQuery();
    const { data: groupRows } = await supabase
      .schema('vendors')
      .from('m365_groups')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .eq('link_id', linkId);

    tracker.trackQuery();
    const { data: roleRows } = await supabase
      .schema('vendors')
      .from('m365_roles')
      .select('id, external_id')
      .eq('tenant_id', tenantId)
      .eq('link_id', linkId);

    tracker.trackQuery();
    const { data: identityGroupRows } = await supabase
      .schema('vendors')
      .from('m365_identity_groups')
      .select('identity_id, group_id')
      .eq('tenant_id', tenantId)
      .eq('link_id', linkId);

    tracker.trackQuery();
    const { data: identityRoleRows } = await supabase
      .schema('vendors')
      .from('m365_identity_roles')
      .select('identity_id, role_id')
      .eq('tenant_id', tenantId)
      .eq('link_id', linkId);

    // Filter to MFA + all-apps policies using pre-computed columns
    type PolicyConditions = MSGraphConditionalAccessPolicy['conditions'];
    const mfaPolicies = (policyRows ?? [])
      .filter((r) => {
        if (r.policy_state !== 'enabled') return false;
        if (!r.requires_mfa) return false;
        const cond = r.conditions as unknown as PolicyConditions | null;
        return cond?.applications?.includeApplications?.includes('All') ?? false;
      })
      .map((r) => r.conditions as unknown as PolicyConditions);

    // Build lookup maps
    const groupIdToExternal = new Map<string, string>(
      (groupRows ?? []).map((g) => [g.id, g.external_id ?? '']),
    );
    const roleIdToExternal = new Map<string, string>(
      (roleRows ?? []).map((r) => [r.id, r.external_id ?? '']),
    );

    const identityGroups = new Map<string, Set<string>>();
    for (const row of identityGroupRows ?? []) {
      const extId = groupIdToExternal.get(row.group_id);
      if (!extId) continue;
      if (!identityGroups.has(row.identity_id)) identityGroups.set(row.identity_id, new Set());
      identityGroups.get(row.identity_id)!.add(extId);
    }

    const identityRoles = new Map<string, Set<string>>();
    for (const row of identityRoleRows ?? []) {
      const extId = roleIdToExternal.get(row.role_id);
      if (!extId) continue;
      if (!identityRoles.has(row.identity_id)) identityRoles.set(row.identity_id, new Set());
      identityRoles.get(row.identity_id)!.add(extId);
    }

    // Evaluate MFA enforcement per identity
    const trueIds: string[] = [];
    const falseIds: string[] = [];

    for (const identity of identityRows ?? []) {
      const userExternalId = identity.external_id ?? '';
      const groupExtIds = identityGroups.get(identity.id) ?? new Set<string>();
      const roleExtIds = identityRoles.get(identity.id) ?? new Set<string>();

      let mfaEnforced = false;
      for (const cond of mfaPolicies) {
        const u = cond?.users;
        if (!u) continue;

        const included =
          u.includeUsers.includes('All') ||
          u.includeUsers.includes(userExternalId) ||
          u.includeGroups.some((g) => groupExtIds.has(g)) ||
          u.includeRoles.some((r) => roleExtIds.has(r));

        const excluded =
          u.excludeUsers.includes(userExternalId) ||
          u.excludeGroups.some((g) => groupExtIds.has(g)) ||
          u.excludeRoles.some((r) => roleExtIds.has(r));

        if (included && !excluded) {
          mfaEnforced = true;
          break;
        }
      }

      if (mfaEnforced) trueIds.push(identity.id);
      else falseIds.push(identity.id);
    }

    // Batch-update in chunks of 500
    for (let i = 0; i < trueIds.length; i += CHUNK) {
      tracker.trackUpsert();
      await supabase
        .schema('vendors')
        .from('m365_identities')
        .update({ mfa_enforced: true })
        .in('id', trueIds.slice(i, i + CHUNK));
    }

    for (let i = 0; i < falseIds.length; i += CHUNK) {
      tracker.trackUpsert();
      await supabase
        .schema('vendors')
        .from('m365_identities')
        .update({ mfa_enforced: false })
        .in('id', falseIds.slice(i, i + CHUNK));
    }

    const total = trueIds.length + falseIds.length;
    tracker.trackEntityUpdated(total);

    Logger.info({
      module: 'Microsoft365Enricher',
      context: 'enrich',
      message: `Enriched ${total} identities (${trueIds.length} MFA enforced, ${falseIds.length} not) for linkId ${linkId}`,
    });
  }
}
