import type { Microsoft365Connector } from "./connector";
import { Logger } from "../../utils/logger";

/**
 * Business logic for assigning directory roles to the app's service principal
 * in a GDAP customer tenant. Receives a connector already scoped to the target tenant.
 */
export class Microsoft365RoleManagerService {
  constructor(private connector: Microsoft365Connector) {}

  /**
   * Ensures the app's SP holds each of the given directory roles.
   * 409 Conflict (already assigned) is treated as success.
   * Returns { assigned, failed } — does not throw.
   */
  async ensureDirectoryRoles(
    requiredRoles: Record<string, string>,
  ): Promise<{ assigned: string[]; failed: string[] }> {
    let spId: string;
    try {
      const sp = await this.connector.servicePrincipals.findOwn();
      if (!sp) return { assigned: [], failed: Object.keys(requiredRoles) };
      spId = sp.id;
    } catch {
      return { assigned: [], failed: Object.keys(requiredRoles) };
    }

    const assigned: string[] = [];
    const failed: string[] = [];

    for (const [name, roleDefinitionId] of Object.entries(requiredRoles)) {
      try {
        await this.connector.roleManagement.directory.roleAssignments.create(
          spId,
          roleDefinitionId,
        );
        assigned.push(name);
      } catch (err) {
        Logger.warn({
          module: "Microsoft365RoleManager",
          context: "ensureDirectoryRoles",
          message: `Failed to assign role (${name}): ${err instanceof Error ? err.message : "unknown error"}`,
        });
        failed.push(name);
      }
    }

    return { assigned, failed };
  }
}
