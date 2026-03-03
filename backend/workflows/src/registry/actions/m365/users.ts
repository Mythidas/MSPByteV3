import { Logger } from '@workspace/shared/lib/utils/logger.js';
import type { ActionDefinition } from '../../../types.js';

export const M365UsersDisable: ActionDefinition = {
  key: 'microsoft-365/users/disable',
  integration: 'microsoft-365',
  label: 'M365 Users — Disable',
  description: 'Disables one or more Microsoft 365 user accounts.',
  inputs: {
    user_ids: { type: 'array', items: 'string', description: 'User IDs to disable' },
  },
  outputs: {
    succeeded: { type: 'array', description: 'User IDs successfully disabled' },
    failed: { type: 'array', description: 'User IDs that failed to disable' },
  },
  affectsEntities: true,
  async execute(ctx, inputs) {
    const userIds = (inputs.user_ids as string[]) ?? [];
    Logger.info({
      module: 'M365UsersDisable',
      context: 'execute',
      message: `Disabling ${userIds.length} user(s) for tenant ${ctx.tenant_id}`,
    });
    // TODO: implement API call via Microsoft365Connector
    return { succeeded: userIds, failed: [], output: null };
  },
};

export const M365UsersRevokeSessions: ActionDefinition = {
  key: 'microsoft-365/users/revoke-sessions',
  integration: 'microsoft-365',
  label: 'M365 Users — Revoke Sessions',
  description: 'Revokes all active sessions for one or more Microsoft 365 users.',
  inputs: {
    user_ids: { type: 'array', items: 'string', description: 'User IDs whose sessions to revoke' },
  },
  outputs: {
    succeeded: { type: 'array', description: 'User IDs successfully revoked' },
    failed: { type: 'array', description: 'User IDs that failed' },
  },
  affectsEntities: true,
  async execute(ctx, inputs) {
    const userIds = (inputs.user_ids as string[]) ?? [];
    Logger.info({
      module: 'M365UsersRevokeSessions',
      context: 'execute',
      message: `Revoking sessions for ${userIds.length} user(s) for tenant ${ctx.tenant_id}`,
    });
    // TODO: implement API call via Microsoft365Connector
    return { succeeded: userIds, failed: [], output: null };
  },
};

export const M365UsersRemoveMFAMethods: ActionDefinition = {
  key: 'microsoft-365/users/remove-mfa-methods',
  integration: 'microsoft-365',
  label: 'M365 Users — Remove MFA Methods',
  description: 'Removes all registered MFA authentication methods for one or more users.',
  inputs: {
    user_ids: { type: 'array', items: 'string', description: 'User IDs to remove MFA methods from' },
  },
  outputs: {
    succeeded: { type: 'array', description: 'User IDs successfully processed' },
    failed: { type: 'array', description: 'User IDs that failed' },
  },
  affectsEntities: true,
  async execute(ctx, inputs) {
    const userIds = (inputs.user_ids as string[]) ?? [];
    Logger.info({
      module: 'M365UsersRemoveMFAMethods',
      context: 'execute',
      message: `Removing MFA methods for ${userIds.length} user(s) for tenant ${ctx.tenant_id}`,
    });
    // TODO: implement API call via Microsoft365Connector
    return { succeeded: userIds, failed: [], output: null };
  },
};
