import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@workspace/shared/types/schema';
import type { ScopeDefinition } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

type EntityRow = Database['public']['Tables']['entities']['Row'];

export interface AugmentedIdentity extends EntityRow {
  mfa_state: 'none' | 'partial';
}

// ============================================================================
// MFA COVERAGE SERVICE
// ============================================================================

/**
 * Determines which M365 identities are not covered by an MFA conditional access policy.
 *
 * Correctness properties:
 *  - Group/role expansion: identities covered via includeGroups / includeRoles are treated as covered.
 *  - Exclusion handling: excludeUsers / excludeGroups / excludeRoles remove identities from coverage.
 *  - Connection isolation: policies from one M365 connection cannot cover identities from another.
 *  - Fan-out: when no connection_id is scoped, analyzes each connection independently and combines.
 */
export class MFACoverageService {
  constructor(private supabase: SupabaseClient<Database>) {}

  // --------------------------------------------------------------------------
  // PUBLIC ENTRY POINT
  // --------------------------------------------------------------------------

  async analyze(tenantId: string, scope: ScopeDefinition): Promise<AugmentedIdentity[]> {
    if (scope.connection_id) {
      return this.analyzeConnection(tenantId, scope.connection_id, scope);
    }

    // Fan-out: discover all M365 connections for this tenant
    const { data: rows, error } = await this.supabase
      .from('entities')
      .select('connection_id')
      .eq('tenant_id', tenantId)
      .eq('integration_id', 'microsoft-365')
      .eq('entity_type', 'identity')
      .not('connection_id', 'is', null);

    if (error) {
      throw new Error(`MFACoverageService: failed to discover connections — ${error.message}`);
    }

    const connectionIds = [...new Set((rows || []).map((r) => r.connection_id as string))];

    if (connectionIds.length === 0) {
      Logger.trace({
        module: 'MFACoverageService',
        context: 'analyze',
        message: `No M365 connections found for tenant ${tenantId}`,
      });
      return [];
    }

    const results = await Promise.all(
      connectionIds.map((cid) => this.analyzeConnection(tenantId, cid, scope))
    );

    return results.flat();
  }

  // --------------------------------------------------------------------------
  // PER-CONNECTION ANALYSIS
  // --------------------------------------------------------------------------

  private async analyzeConnection(
    tenantId: string,
    connectionId: string,
    scope: ScopeDefinition
  ): Promise<AugmentedIdentity[]> {
    Logger.trace({
      module: 'MFACoverageService',
      context: 'analyzeConnection',
      message: `Analyzing connection ${connectionId}`,
    });

    // Step 1 — Load identities and policies scoped to this connection
    const [identities, policies] = await Promise.all([
      this.loadEntities(tenantId, connectionId, 'identity', scope.site_id),
      this.loadEntities(tenantId, connectionId, 'policy', scope.site_id),
    ]);

    // Step 2 — Filter enabled MFA policies
    const mfaPolicies = policies.filter((p) => {
      const rd = p.raw_data as any;
      const ctrl: string[] = rd?.grantControls?.builtInControls ?? [];
      return rd?.state === 'enabled' && ctrl.includes('mfa');
    });

    // Step 3 — Early exit: no MFA policies → all identities are uncovered
    if (mfaPolicies.length === 0) {
      return identities.map((id) => ({ ...id, mfa_state: 'none' as const }));
    }

    // Step 4 — Collect all group/role Azure IDs referenced by policies
    const allGroupAzureIds = new Set<string>();
    const allRoleAzureIds = new Set<string>();

    for (const p of mfaPolicies) {
      const users = (p.raw_data as any)?.conditions?.users ?? {};
      for (const id of [
        ...(users.includeGroups ?? []),
        ...(users.excludeGroups ?? []),
      ]) {
        allGroupAzureIds.add(id);
      }
      for (const id of [
        ...(users.includeRoles ?? []),
        ...(users.excludeRoles ?? []),
      ]) {
        allRoleAzureIds.add(id);
      }
    }

    // Step 5 — Load group + role entities and their membership relationships
    const [groupEntities, roleEntities] = await Promise.all([
      allGroupAzureIds.size > 0
        ? this.loadEntitiesByExternalId(tenantId, connectionId, 'group', [...allGroupAzureIds])
        : Promise.resolve([] as EntityRow[]),
      allRoleAzureIds.size > 0
        ? this.loadEntitiesByExternalId(tenantId, connectionId, 'role', [...allRoleAzureIds])
        : Promise.resolve([] as EntityRow[]),
    ]);

    const groupEntityIds = groupEntities.map((g) => g.id);
    const roleEntityIds = roleEntities.map((r) => r.id);

    const [groupRelationships, roleRelationships] = await Promise.all([
      groupEntityIds.length > 0
        ? this.loadRelationships(groupEntityIds, 'member-of')
        : Promise.resolve([] as { parent_entity_id: string; child_entity_id: string }[]),
      roleEntityIds.length > 0
        ? this.loadRelationships(roleEntityIds, 'assigned-to')
        : Promise.resolve([] as { parent_entity_id: string; child_entity_id: string }[]),
    ]);

    // Step 6 — Build expansion helpers
    const identityEntityIdToExternalId = new Map<string, string>(
      identities.map((id) => [id.id, id.external_id])
    );

    // group entity UUID → set of identity external_ids
    const groupToIdentityExternalIds = new Map<string, Set<string>>();
    for (const rel of groupRelationships) {
      const externalId = identityEntityIdToExternalId.get(rel.child_entity_id);
      if (externalId) {
        if (!groupToIdentityExternalIds.has(rel.parent_entity_id)) {
          groupToIdentityExternalIds.set(rel.parent_entity_id, new Set());
        }
        groupToIdentityExternalIds.get(rel.parent_entity_id)!.add(externalId);
      }
    }

    // role entity UUID → set of identity external_ids
    const roleToIdentityExternalIds = new Map<string, Set<string>>();
    for (const rel of roleRelationships) {
      const externalId = identityEntityIdToExternalId.get(rel.child_entity_id);
      if (externalId) {
        if (!roleToIdentityExternalIds.has(rel.parent_entity_id)) {
          roleToIdentityExternalIds.set(rel.parent_entity_id, new Set());
        }
        roleToIdentityExternalIds.get(rel.parent_entity_id)!.add(externalId);
      }
    }

    // azure group ID → group entity UUID
    const groupAzureToEntityId = new Map<string, string>(
      groupEntities.map((g) => [g.external_id, g.id])
    );

    // azure role ID → role entity UUID
    const roleAzureToEntityId = new Map<string, string>(
      roleEntities.map((r) => [r.external_id, r.id])
    );

    const expandGroups = (azureGroupIds: string[]): Set<string> => {
      const result = new Set<string>();
      for (const azureId of azureGroupIds) {
        const entityId = groupAzureToEntityId.get(azureId);
        if (entityId) {
          const members = groupToIdentityExternalIds.get(entityId);
          if (members) members.forEach((id) => result.add(id));
        }
      }
      return result;
    };

    const expandRoles = (azureRoleIds: string[]): Set<string> => {
      const result = new Set<string>();
      for (const azureId of azureRoleIds) {
        const entityId = roleAzureToEntityId.get(azureId);
        if (entityId) {
          const members = roleToIdentityExternalIds.get(entityId);
          if (members) members.forEach((id) => result.add(id));
        }
      }
      return result;
    };

    const allIdentityExternalIds = new Set(identities.map((id) => id.external_id));

    // Step 7 — Build globally covered set
    const globalCovered = new Set<string>();

    for (const policy of mfaPolicies) {
      const users = (policy.raw_data as any)?.conditions?.users ?? {};
      const includeUsers: string[] = users.includeUsers ?? [];
      const excludeUsers: string[] = users.excludeUsers ?? [];
      const includeGroups: string[] = users.includeGroups ?? [];
      const excludeGroups: string[] = users.excludeGroups ?? [];
      const includeRoles: string[] = users.includeRoles ?? [];
      const excludeRoles: string[] = users.excludeRoles ?? [];

      const policyExcluded = new Set<string>([
        ...excludeUsers,
        ...expandGroups(excludeGroups),
        ...expandRoles(excludeRoles),
      ]);

      if (includeUsers.includes('All')) {
        // Policy covers all identities except explicitly excluded ones
        for (const externalId of allIdentityExternalIds) {
          if (!policyExcluded.has(externalId)) {
            globalCovered.add(externalId);
          }
        }
      } else {
        // Policy covers explicitly listed users + group/role members minus exclusions
        const policyIncluded = new Set<string>([
          ...includeUsers,
          ...expandGroups(includeGroups),
          ...expandRoles(includeRoles),
        ]);
        for (const externalId of policyIncluded) {
          if (!policyExcluded.has(externalId)) {
            globalCovered.add(externalId);
          }
        }
      }
    }

    // Step 8 — Return uncovered identities augmented with mfa_state
    return identities
      .filter((id) => !globalCovered.has(id.external_id))
      .map((id) => ({ ...id, mfa_state: 'partial' as const }));
  }

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  private async loadEntities(
    tenantId: string,
    connectionId: string,
    entityType: string,
    siteId?: string
  ): Promise<EntityRow[]> {
    let query = this.supabase
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', 'microsoft-365')
      .eq('entity_type', entityType)
      .eq('connection_id', connectionId);

    if (siteId) query = query.eq('site_id', siteId);

    const { data, error } = await query;
    if (error) {
      throw new Error(
        `MFACoverageService: failed to load ${entityType} entities — ${error.message}`
      );
    }
    return data ?? [];
  }

  private async loadEntitiesByExternalId(
    tenantId: string,
    connectionId: string,
    entityType: string,
    externalIds: string[]
  ): Promise<EntityRow[]> {
    const { data, error } = await this.supabase
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', 'microsoft-365')
      .eq('entity_type', entityType)
      .eq('connection_id', connectionId)
      .in('external_id', externalIds);

    if (error) {
      throw new Error(
        `MFACoverageService: failed to load ${entityType} by external_id — ${error.message}`
      );
    }
    return data ?? [];
  }

  private async loadRelationships(
    parentEntityIds: string[],
    relationshipType: string
  ): Promise<{ parent_entity_id: string; child_entity_id: string }[]> {
    const { data, error } = await this.supabase
      .from('entity_relationships')
      .select('parent_entity_id, child_entity_id')
      .in('parent_entity_id', parentEntityIds)
      .eq('relationship_type', relationshipType);

    if (error) {
      throw new Error(
        `MFACoverageService: failed to load ${relationshipType} relationships — ${error.message}`
      );
    }
    return data ?? [];
  }
}
