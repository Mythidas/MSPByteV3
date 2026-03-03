import { ACTION_REGISTRY } from '../index.js';
import { M365UsersDisable, M365UsersRevokeSessions, M365UsersRemoveMFAMethods } from './m365/users.js';
import { M365MailboxGetInboxRules } from './m365/mailbox.js';
import { HaloPSATicketsCreateOrUpdate } from './halopsa/tickets.js';

const definitions = [
  M365UsersDisable,
  M365UsersRevokeSessions,
  M365UsersRemoveMFAMethods,
  M365MailboxGetInboxRules,
  HaloPSATicketsCreateOrUpdate,
];

for (const def of definitions) {
  ACTION_REGISTRY.set(def.key, def);
}
