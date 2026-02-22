import type { Microsoft365Connector } from '../../connectors/Microsoft365Connector.js';
import { Logger } from '../../utils/logger.js';

/**
 * Business logic for assigning directory roles to the app's service principal
 * in a GDAP customer tenant. Receives a connector already scoped to the target tenant.
 */
export class Microsoft365RoleManager {
  constructor(private connector: Microsoft365Connector) {}

  /**
   * Ensures the app's SP holds each of the given directory roles.
   * 409 Conflict (already assigned) is treated as success.
   * Returns { assigned, failed } — does not throw.
   */
  async ensureDirectoryRoles(
    requiredRoles: Record<string, string>
  ): Promise<{ assigned: string[]; failed: string[] }> {
    const { data: spId, error } = await this.connector.getServicePrincipalId();
    if (error || !spId) {
      return { assigned: [], failed: Object.keys(requiredRoles) };
    }

    const assigned: string[] = [];
    const failed: string[] = [];

    for (const [name, roleDefinitionId] of Object.entries(requiredRoles)) {
      const { data: ok, error: assignError } = await this.connector.assignDirectoryRole(
        spId,
        roleDefinitionId
      );
      if (ok) {
        assigned.push(name);
      } else {
        Logger.warn({
          module: 'Microsoft365RoleManager',
          context: 'ensureDirectoryRoles',
          message: `Failed to assign role (${name}): ${assignError?.message ?? 'unknown error'}`,
        });
        failed.push(name);
      }
    }

    return { assigned, failed };
  }
}
