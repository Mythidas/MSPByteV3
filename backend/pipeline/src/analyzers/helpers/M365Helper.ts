import type { AnalysisContext, Entity, MFACoverage } from '../../types.js';

/**
 * Check if Security Defaults are enabled
 */
export function checkSecurityDefaults(context: AnalysisContext): boolean {
  const sdPolicy = context.entities.policies.find((p) => p.external_id === 'security-defaults');
  if (!sdPolicy) return false;
  return sdPolicy.raw_data?.isEnabled === true;
}

/**
 * Get conditional access policies that enforce MFA
 */
export function getMFAPolicies(context: AnalysisContext): Entity[] {
  return context.entities.policies.filter((policy) => {
    if (policy.external_id === 'security-defaults') return false;

    const rawData = policy.raw_data;
    if (rawData?.state !== 'enabled') return false;

    const grantControls = rawData?.grantControls?.builtInControls || [];
    return grantControls.includes('mfa');
  });
}

/**
 * Check MFA coverage level for an identity
 */
export function checkIdentityMFACoverage(
  identity: Entity,
  context: AnalysisContext,
  mfaPolicies: Entity[],
  securityDefaultsEnabled: boolean,
): { coverage: MFACoverage; reason?: string } {
  const isAdmin = isAdminUser(identity, context);

  // Security Defaults only fully protect admins
  if (securityDefaultsEnabled) {
    if (isAdmin) {
      return { coverage: 'full' };
    } else {
      return {
        coverage: 'partial',
        reason: 'Security Defaults only enforce MFA for administrator accounts, not regular users',
      };
    }
  }

  let hasFullCoverage = false;
  let hasPartialCoverage = false;
  let partialReason = '';

  for (const policy of mfaPolicies) {
    if (!doesPolicyApplyToUser(policy, identity, context)) continue;

    const apps = policy.raw_data?.conditions?.applications;
    const includeApps = apps?.includeApplications || [];
    const coversAllApps = includeApps.includes('All');

    if (coversAllApps) {
      hasFullCoverage = true;
      break;
    } else {
      hasPartialCoverage = true;
      const appCount = includeApps.length;
      partialReason = `MFA policy only covers ${appCount} specific application${appCount !== 1 ? 's' : ''}, not all applications`;
    }
  }

  if (hasFullCoverage) return { coverage: 'full' };
  if (hasPartialCoverage) return { coverage: 'partial', reason: partialReason };
  return { coverage: 'none' };
}

/**
 * Check if a conditional access policy applies to a specific user
 */
export function doesPolicyApplyToUser(
  policy: Entity,
  identity: Entity,
  context: AnalysisContext,
): boolean {
  const conditions = policy.raw_data?.conditions;
  if (!conditions) return false;

  const users = conditions.users;
  const includeUsers = users?.includeUsers || [];
  const excludeUsers = users?.excludeUsers || [];
  const includeGroups = users?.includeGroups || [];
  const excludeGroups = users?.excludeGroups || [];

  const userId = identity.external_id;

  // Check exclusions first
  if (excludeUsers.includes(userId) || excludeUsers.includes('All')) return false;
  if (isUserInAnyGroup(identity, excludeGroups, context)) return false;

  // Check inclusions
  if (includeUsers.includes(userId) || includeUsers.includes('All')) return true;
  if (isUserInAnyGroup(identity, includeGroups, context)) return true;

  return false;
}

/**
 * Check if a user is a member of any of the specified groups
 */
export function isUserInAnyGroup(
  identity: Entity,
  groupIds: string[],
  context: AnalysisContext,
): boolean {
  const memberships = context.getRelationships(identity.id, 'group-member');

  for (const membership of memberships) {
    const group = context.getEntity(membership.parent_entity_id);
    if (group && groupIds.includes(group.external_id)) return true;
  }

  return false;
}

/**
 * Check if a user has admin role assignments
 */
export function isAdminUser(identity: Entity, context: AnalysisContext): boolean {
  const roleAssignments = context.getRelationships(identity.id, 'role-assignment');

  for (const assignment of roleAssignments) {
    const role = context.getEntity(assignment.parent_entity_id);
    if (role && isAdminRole(role)) return true;
  }

  return false;
}

/**
 * Check if a role is an admin role
 */
export function isAdminRole(role: Entity): boolean {
  const adminRoleNames = [
    'Global Administrator',
    'Privileged Role Administrator',
    'Security Administrator',
    'Compliance Administrator',
    'Exchange Administrator',
    'SharePoint Administrator',
    'User Administrator',
  ];

  const displayName = role.raw_data?.displayName || '';
  return adminRoleNames.some(
    (adminRole) => displayName.includes(adminRole) || displayName.includes('Admin'),
  );
}

/**
 * Get display name for identity
 */
export function getDisplayName(identity: Entity): string {
  return (
    identity.raw_data?.displayName ||
    identity.raw_data?.userPrincipalName ||
    identity.external_id
  );
}
