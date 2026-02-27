import { DattoRMMConnector } from '@workspace/shared/lib/connectors/DattoRMMConnector.js';
import type { ActionRegistry, ActionRegistryEntry } from '../types.js';

export const dattormmActions: ActionRegistry['dattormm'] = {
  variables: {
    set: {
      handler: async (connector: DattoRMMConnector, params) =>
        connector.setSiteVariable(params.siteUid, params.varName, params.value),
      params: [
        { key: 'siteUid', label: 'Site UID', type: 'string', required: true },
        { key: 'varName', label: 'Variable Name', type: 'string', required: true },
        { key: 'value', label: 'Value', type: 'string', required: true },
      ],
    } satisfies ActionRegistryEntry,
  },
};
