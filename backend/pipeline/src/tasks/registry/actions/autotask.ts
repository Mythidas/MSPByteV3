import type { AutoTaskConnector } from '@workspace/shared/lib/connectors/AutoTaskConnector.js';
import type { ActionRegistry, ActionRegistryEntry } from '../types.js';

export const autotaskActions: ActionRegistry['autotask'] = {
  tickets: {
    create: {
      // NOTE: AutoTask write operations ideally belong in a dedicated AutoTaskService.
      // Placeholder — implement AutoTaskService.createTicket() to enable this.
      handler: async (_connector: AutoTaskConnector, _params) => {
        throw new Error(
          'autotask/tickets/create is not yet implemented. Add an AutoTaskService with createTicket().'
        );
      },
      params: [
        { key: 'title', label: 'Title', type: 'string', required: true },
        { key: 'description', label: 'Description', type: 'string', required: false },
        { key: 'priority', label: 'Priority', type: 'string', required: false },
      ],
    } satisfies ActionRegistryEntry,
  },
};
