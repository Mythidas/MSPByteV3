import type { TicketTemplate } from '../../types.js';

export const IdentityContainmentTemplate: TicketTemplate = {
  key: 'identity_containment_response',
  subject: 'Identity Containment Executed — {{entity_count}} Users',
  body: [
    {
      type: 'static_text',
      content:
        'MSPByte has automatically executed an identity containment workflow in response to a detected security event. ' +
        'The following users were processed and the listed actions were applied to each account.',
    },
    {
      type: 'entity_table',
      source: 'context.entity_log',
      columns: ['display_name', 'actions_applied'],
      heading: 'Affected Users',
    },
    {
      type: 'action_summary',
      heading: 'Action Summary',
    },
  ],
};
