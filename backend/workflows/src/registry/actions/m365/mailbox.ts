import { Logger } from '@workspace/shared/lib/utils/logger.js';
import type { ActionDefinition } from '../../../types.js';

export const M365MailboxGetInboxRules: ActionDefinition = {
  key: 'microsoft-365/mailbox/get-inbox-rules',
  integration: 'microsoft-365',
  label: 'M365 Mailbox — Get Inbox Rules',
  description: 'Retrieves inbox forwarding rules for one or more Microsoft 365 mailboxes.',
  inputs: {
    user_ids: { type: 'array', items: 'string', description: 'User IDs whose inbox rules to retrieve' },
  },
  outputs: {
    rules_by_user: { type: 'object', description: 'Map of user_id to their inbox rules' },
  },
  inputType: 'm365_identity[]',
  outputType: 'void',
  affectsEntities: false,
  async execute(ctx, inputs) {
    const userIds = (inputs.user_ids as string[]) ?? [];
    Logger.info({
      module: 'M365MailboxGetInboxRules',
      context: 'execute',
      message: `Getting inbox rules for ${userIds.length} user(s) for tenant ${ctx.tenant_id}`,
    });
    // TODO: implement API call via Microsoft365Connector
    return { succeeded: [], failed: [], output: { rules_by_user: {} } };
  },
};
