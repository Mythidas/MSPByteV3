import { HaloPSAConnector } from '@workspace/shared/lib/connectors/HaloPSAConnector.js';
import type { ActionRegistry, ActionRegistryEntry } from '../types.js';

export const halopsakActions: ActionRegistry['halopsa'] = {
  tickets: {
    create: {
      // NOTE: HaloPSA write operations ideally belong in a dedicated HaloPSAService.
      // Using connector directly here until a service layer is added.
      handler: async (connector: HaloPSAConnector, params) => connector.createTicket(params as any),
      params: [
        { key: 'summary', label: 'Summary', type: 'string', required: true },
        { key: 'details', label: 'Details', type: 'string', required: false },
        { key: 'priority', label: 'Priority', type: 'string', required: false },
      ],
    } satisfies ActionRegistryEntry,
  },
};
