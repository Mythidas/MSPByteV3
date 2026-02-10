import { BaseLinker } from './BaseLinker.js';
import { Logger } from '../lib/logger.js';
import type { Entity, RelationshipToCreate } from '../types.js';

/**
 * Microsoft365Linker - Creates relationships between M365 entities.
 *
 * Relationships:
 * 1. Group memberships: identity/group → group (group-member)
 * 2. Role assignments: identity → role (role-assignment)
 * 3. License assignments: license → identity (license-assignment)
 * 4. Nested groups: group → parent group (group-member)
 */
export class Microsoft365Linker extends BaseLinker {
  constructor() {
    super('microsoft-365');
  }

  protected getLinkerName(): string {
    return 'Microsoft365Linker';
  }

  protected async link(entities: Entity[]): Promise<RelationshipToCreate[]> {
    Logger.log({
      module: 'Microsoft365Linker',
      context: 'link',
      message: `Linking ${entities.length} entities`,
      level: 'info',
    });

    const relationships: RelationshipToCreate[] = [];

    // Build lookup maps
    const entityByExternalId = new Map(entities.map((e) => [e.external_id, e]));
    const byType = groupByType(entities);

    // 1. Group memberships (identity/group → group)
    relationships.push(...this.linkGroupMemberships(byType.groups, entityByExternalId));

    // 2. Role assignments (identity → role)
    relationships.push(...this.linkRoleAssignments(byType.roles, entityByExternalId));

    // 3. License assignments (license → identity)
    relationships.push(...this.linkLicenseAssignments(byType.identities, entityByExternalId));

    // 4. Nested groups (group → parent group)
    relationships.push(...this.linkNestedGroups(byType.groups, entityByExternalId));

    Logger.log({
      module: 'Microsoft365Linker',
      context: 'link',
      message: `Created ${relationships.length} relationships`,
      level: 'info',
    });

    return relationships;
  }

  private linkGroupMemberships(
    groups: Entity[],
    entityMap: Map<string, Entity>,
  ): RelationshipToCreate[] {
    const rels: RelationshipToCreate[] = [];

    for (const group of groups) {
      const members = group.raw_data?.members || [];
      for (const memberId of members) {
        const member = entityMap.get(memberId);
        if (!member) continue;

        rels.push({
          parentEntityId: group.id,
          childEntityId: member.id,
          relationshipType: 'group-member',
          metadata: {
            groupDisplayName: group.raw_data?.displayName,
            memberDisplayName: member.raw_data?.displayName || member.raw_data?.userPrincipalName,
          },
        });
      }
    }

    Logger.log({
      module: 'Microsoft365Linker',
      context: 'linkGroupMemberships',
      message: `Linked ${rels.length} group memberships`,
      level: 'trace',
    });

    return rels;
  }

  private linkRoleAssignments(
    roles: Entity[],
    entityMap: Map<string, Entity>,
  ): RelationshipToCreate[] {
    const rels: RelationshipToCreate[] = [];

    for (const role of roles) {
      const members = role.raw_data?.members || [];
      for (const memberId of members) {
        const member = entityMap.get(memberId);
        if (!member || member.entity_type !== 'identity') continue;

        rels.push({
          parentEntityId: role.id,
          childEntityId: member.id,
          relationshipType: 'role-assignment',
          metadata: {
            roleDisplayName: role.raw_data?.displayName,
            memberDisplayName: member.raw_data?.displayName || member.raw_data?.userPrincipalName,
          },
        });
      }
    }

    Logger.log({
      module: 'Microsoft365Linker',
      context: 'linkRoleAssignments',
      message: `Linked ${rels.length} role assignments`,
      level: 'trace',
    });

    return rels;
  }

  private linkLicenseAssignments(
    identities: Entity[],
    entityMap: Map<string, Entity>,
  ): RelationshipToCreate[] {
    const rels: RelationshipToCreate[] = [];

    for (const identity of identities) {
      const assignedLicenses = identity.raw_data?.assignedLicenses || [];
      for (const licenseAssignment of assignedLicenses) {
        const skuId = licenseAssignment.skuId;
        const license = entityMap.get(skuId);
        if (!license || license.entity_type !== 'license') continue;

        rels.push({
          parentEntityId: license.id,
          childEntityId: identity.id,
          relationshipType: 'license-assignment',
          metadata: {
            licenseSkuPartNumber: license.raw_data?.skuPartNumber,
            licenseFriendlyName: license.raw_data?.friendlyName,
            userDisplayName:
              identity.raw_data?.displayName || identity.raw_data?.userPrincipalName,
            disabledPlans: licenseAssignment.disabledPlans || [],
          },
        });
      }
    }

    Logger.log({
      module: 'Microsoft365Linker',
      context: 'linkLicenseAssignments',
      message: `Linked ${rels.length} license assignments`,
      level: 'trace',
    });

    return rels;
  }

  private linkNestedGroups(
    groups: Entity[],
    entityMap: Map<string, Entity>,
  ): RelationshipToCreate[] {
    const rels: RelationshipToCreate[] = [];

    for (const group of groups) {
      const memberOf = group.raw_data?.memberOf || [];
      for (const parentGroupId of memberOf) {
        const parentGroup = entityMap.get(parentGroupId);
        if (!parentGroup || parentGroup.entity_type !== 'group') continue;

        rels.push({
          parentEntityId: parentGroup.id,
          childEntityId: group.id,
          relationshipType: 'group-member',
          metadata: {
            parentGroupDisplayName: parentGroup.raw_data?.displayName,
            childGroupDisplayName: group.raw_data?.displayName,
          },
        });
      }
    }

    Logger.log({
      module: 'Microsoft365Linker',
      context: 'linkNestedGroups',
      message: `Linked ${rels.length} nested group memberships`,
      level: 'trace',
    });

    return rels;
  }
}

function groupByType(entities: Entity[]): Record<string, Entity[]> {
  const grouped: Record<string, Entity[]> = {
    identities: [],
    groups: [],
    roles: [],
    licenses: [],
    policies: [],
  };

  for (const entity of entities) {
    // Map new entity_type names to old grouped names
    const key =
      entity.entity_type === 'identity'
        ? 'identities'
        : entity.entity_type === 'group'
          ? 'groups'
          : entity.entity_type === 'role'
            ? 'roles'
            : entity.entity_type === 'license'
              ? 'licenses'
              : entity.entity_type === 'policy'
                ? 'policies'
                : entity.entity_type;

    if (grouped[key]) {
      grouped[key].push(entity);
    }
  }

  return grouped;
}
