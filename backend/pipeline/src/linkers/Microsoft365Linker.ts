import { BaseLinker } from './BaseLinker.js';
import { Logger } from '../lib/logger.js';
import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector';
import type { Entity, RelationshipToCreate } from '../types.js';

export class Microsoft365Linker extends BaseLinker {
  constructor() {
    super('microsoft-365');
  }

  protected async link(entities: Entity[]): Promise<RelationshipToCreate[]> {
    const identities = entities.filter((e) => e.entity_type === 'identity');
    const groups = entities.filter((e) => e.entity_type === 'group');
    const roles = entities.filter((e) => e.entity_type === 'role');

    // Build identity external_id → entity id map
    const identityMap = new Map<string, string>(); // externalId → entity.id
    for (const identity of identities) {
      identityMap.set(identity.external_id, identity.id);
    }

    const relationships: RelationshipToCreate[] = [];

    // Resolve connector credentials from env (partner mode) or skip gracefully
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      Logger.log({
        module: 'Microsoft365Linker',
        context: 'link',
        message: 'MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET not set — skipping member linking',
        level: 'warn',
      });
      return relationships;
    }

    const baseConnector = new Microsoft365Connector({ tenantId: '', clientId, clientSecret, mode: 'partner' });

    // Re-group by _gdapTenantId from raw_data (set by adapter) instead of site_id
    const tenantGroupMap = new Map<string, { groups: Entity[]; roles: Entity[] }>();
    for (const group of groups) {
      const key = (group.raw_data as any)?._gdapTenantId ?? group.site_id ?? '__unknown__';
      if (!tenantGroupMap.has(key)) tenantGroupMap.set(key, { groups: [], roles: [] });
      tenantGroupMap.get(key)!.groups.push(group);
    }
    for (const role of roles) {
      const key = (role.raw_data as any)?._gdapTenantId ?? role.site_id ?? '__unknown__';
      if (!tenantGroupMap.has(key)) tenantGroupMap.set(key, { groups: [], roles: [] });
      tenantGroupMap.get(key)!.roles.push(role);
    }

    for (const [gdapTenantId, { groups: siteGroups, roles: siteRoles }] of tenantGroupMap) {
      const connector =
        gdapTenantId !== '__unknown__' ? baseConnector.forTenant(gdapTenantId) : baseConnector;

      // Link group members to identity entities
      for (const group of siteGroups) {
        const { data: members, error } = await connector.getGroupMembers(group.external_id);

        if (error) {
          Logger.log({
            module: 'Microsoft365Linker',
            context: 'link',
            message: `Failed to get members for group ${group.external_id}: ${error.message}`,
            level: 'warn',
          });
          continue;
        }

        for (const member of members || []) {
          const memberEntityId = identityMap.get(member.id);
          if (!memberEntityId) continue;

          relationships.push({
            parentEntityId: group.id,
            childEntityId: memberEntityId,
            relationshipType: 'member-of',
            siteId: group.site_id || undefined,
          });
        }
      }

      // Link role members to identity entities
      for (const role of siteRoles) {
        const { data: members, error } = await connector.getRoleMembers(role.external_id);

        if (error) {
          Logger.log({
            module: 'Microsoft365Linker',
            context: 'link',
            message: `Failed to get members for role ${role.external_id}: ${error.message}`,
            level: 'warn',
          });
          continue;
        }

        for (const member of members || []) {
          const memberEntityId = identityMap.get(member.id);
          if (!memberEntityId) continue;

          relationships.push({
            parentEntityId: role.id,
            childEntityId: memberEntityId,
            relationshipType: 'assigned-to',
            siteId: role.site_id || undefined,
          });
        }
      }
    }

    Logger.log({
      module: 'Microsoft365Linker',
      context: 'link',
      message: `Determined ${relationships.length} group/role → identity relationships`,
      level: 'info',
    });

    return relationships;
  }
}
