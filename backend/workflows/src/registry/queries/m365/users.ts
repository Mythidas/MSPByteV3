import { Logger } from '@workspace/shared/lib/utils/logger.js';
import type { QueryDefinition } from '../../../types.js';
import { getSupabase } from '../../../supabase.js';
import { ORM } from '@workspace/shared/lib/utils/orm.js';
import type { Tables } from '@workspace/shared/types/database.js';
import type { MSGraphIdentity } from '@workspace/shared/types/integrations/microsoft/identity.js';
import type { MSGraphConditionalAccessPolicy } from '@workspace/shared/types/integrations/microsoft/policies.js';

export const M365IdentitiesListWithMFAStatus: QueryDefinition = {
  key: 'microsoft-365/identity/mfa-status',
  integration: 'microsoft-365',
  label: 'M365 Identities — MFA Status',
  description: 'Retrieves identities with their MFA enforcement status from Microsoft 365.',
  inputs: {
    identities: {
      type: 'array',
      items: 'object',
      optional: false,
      description: 'Entity objects for M365 identity identities (from GetEntities stage)',
    },
  },
  outputs: {
    identities: { type: 'array', description: 'Array of identity objects with MFA status' },
  },
  output_schema: {
    identities: {
      type: 'array',
      item_schema: {
        id: 'string',
        display_name: 'string',
        mfa_status: 'boolean',
        upn: 'string',
      },
      description: 'M365 identities with their current MFA enforcement status',
    },
  },
  source: 'db',
  async execute(ctx, inputs) {
    if (!inputs['identities'] || (inputs['identities'] as any[]).length === 0)
      return { identities: [] };

    const entities = inputs['identities'] as Tables<'public', 'entities'>[];
    const orm = new ORM(getSupabase());

    const groupedIdentities: Record<string, Tables<'public', 'entities'>[]> = {};
    for (const idt of entities) {
      const cid = idt.connection_id ?? '';
      if (!groupedIdentities[cid]) groupedIdentities[cid] = [idt];
      else groupedIdentities[cid].push(idt);
    }

    const finalValues: { id: string; display_name: string; mfa_status: boolean; upn: string }[] =
      [];
    const connectionIds = Object.keys(groupedIdentities);

    for (const cid of connectionIds) {
      const connectionidentities = groupedIdentities[cid];

      const { data: contextEntities, error: contextError } = await orm.select(
        'public',
        'entities',
        (q) =>
          q
            .eq('connection_id', cid)
            .in('entity_type', ['role', 'group', 'policy'])
            .eq('integration_id', 'microsoft-365')
            .eq('tenant_id', ctx.tenant_id)
      );

      if (contextError) {
        Logger.error({
          module: 'M365identitiesListWithMFAStatus',
          context: cid,
          message: `Failed to fetch context for MFA: ${contextError.message}`,
        });

        continue;
      }

      if (!contextEntities?.rows) {
        Logger.warn({
          module: 'M365identitiesListWithMFAStatus',
          context: cid,
          message: 'No context entities found — defaulting mfa_status to false',
        });
        for (const identity of connectionidentities) {
          const raw = identity.raw_data as unknown as MSGraphIdentity;
          finalValues.push({
            id: identity.id,
            display_name: identity.display_name ?? '',
            upn: raw?.userPrincipalName ?? '',
            mfa_status: false,
          });
        }
        continue;
      }

      // Filter to MFA + all-apps policies (enabled state only)
      const mfaPolicies = contextEntities.rows.filter((e) => {
        if (e.entity_type !== 'policy') return false;
        const policy = e.raw_data as unknown as MSGraphConditionalAccessPolicy;
        if (policy.state !== 'enabled') return false;
        const hasMfa = policy.grantControls?.builtInControls?.includes('mfa') ?? false;
        const hasAllApps =
          policy.conditions?.applications?.includeApplications?.includes('All') ?? false;
        return hasMfa && hasAllApps;
      });

      // Build maps from entity ID to external_id for groups and roles
      const groupEntityToExternalId = new Map<string, string>();
      const roleEntityToExternalId = new Map<string, string>();
      for (const e of contextEntities.rows) {
        if (e.entity_type === 'group') groupEntityToExternalId.set(e.id, e.external_id ?? '');
        if (e.entity_type === 'role') roleEntityToExternalId.set(e.id, e.external_id ?? '');
      }

      // Fetch group/role memberships for all identities in this connection (chunked to avoid URL limits)
      const userEntityIds = connectionidentities.map((u) => u.id);
      const CHUNK = 500;
      const allRelRows: Tables<'public', 'entity_relationships'>[] = [];
      let relationshipsError: { message: string } | null = null;
      for (let i = 0; i < userEntityIds.length; i += CHUNK) {
        const { data: chunk, error: chunkError } = await orm.select(
          'public',
          'entity_relationships',
          (q) =>
            q
              .in('child_entity_id', userEntityIds.slice(i, i + CHUNK))
              .in('relationship_type', ['member-of', 'assigned-to'])
              .eq('tenant_id', ctx.tenant_id)
        );
        if (chunkError) {
          relationshipsError = chunkError;
          break;
        }
        if (chunk?.rows) allRelRows.push(...chunk.rows);
      }

      if (relationshipsError) {
        Logger.error({
          module: 'M365identitiesListWithMFAStatus',
          context: cid,
          message: `Failed to fetch relationships for MFA: ${relationshipsError.message}`,
        });

        continue;
      }

      // Build per-user sets of group/role external IDs
      const userGroupExternalIds = new Map<string, Set<string>>();
      const userRoleExternalIds = new Map<string, Set<string>>();
      for (const userId of userEntityIds) {
        userGroupExternalIds.set(userId, new Set());
        userRoleExternalIds.set(userId, new Set());
      }
      for (const rel of allRelRows) {
        if (rel.relationship_type === 'member-of') {
          const extId = groupEntityToExternalId.get(rel.parent_entity_id);
          if (extId) userGroupExternalIds.get(rel.child_entity_id)?.add(extId);
        } else if (rel.relationship_type === 'assigned-to') {
          const extId = roleEntityToExternalId.get(rel.parent_entity_id);
          if (extId) userRoleExternalIds.get(rel.child_entity_id)?.add(extId);
        }
      }

      // Determine MFA coverage per user
      for (const identity of connectionidentities) {
        const raw = identity.raw_data as unknown as MSGraphIdentity;
        const userExternalId = identity.external_id ?? '';
        const groupExternalIds = userGroupExternalIds.get(identity.id) ?? new Set<string>();
        const roleExternalIds = userRoleExternalIds.get(identity.id) ?? new Set<string>();

        let mfa_status = false;
        for (const policyEntity of mfaPolicies) {
          const policy = policyEntity.raw_data as unknown as MSGraphConditionalAccessPolicy;
          const u = policy.conditions?.users;
          if (!u) continue;

          const included =
            u.includeUsers.includes('All') ||
            u.includeUsers.includes(userExternalId) ||
            u.includeGroups.some((g) => groupExternalIds.has(g)) ||
            u.includeRoles.some((r) => roleExternalIds.has(r));

          const excluded =
            u.excludeUsers.includes(userExternalId) ||
            u.excludeGroups.some((g) => groupExternalIds.has(g)) ||
            u.excludeRoles.some((r) => roleExternalIds.has(r));

          if (included && !excluded) {
            mfa_status = true;
            break;
          }
        }

        finalValues.push({
          id: identity.id,
          display_name: identity.display_name ?? '',
          upn: raw?.userPrincipalName ?? '',
          mfa_status,
        });
      }
    }

    return { identities: finalValues };
  },
};
