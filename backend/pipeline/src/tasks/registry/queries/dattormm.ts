import { getDattoOfflineDevicesService } from '../../services/dattormm/OfflineDevicesService.js';
import { getDattoEmptySitesService } from '../../services/dattormm/EmptySitesService.js';
import type { LiveQueryRegistry, LiveQueryRegistryEntry } from '../types.js';

export const dattormmQueries: LiveQueryRegistry['dattormm'] = {
  endpoints: {
    offline: {
      handler: (_connector, params, tenantId, scope) =>
        getDattoOfflineDevicesService().analyze(tenantId, scope, params),
      params: [
        {
          key: 'days_offline',
          label: 'Days Offline',
          type: 'number',
          required: false,
          placeholder: '30',
          description: 'Flag devices offline for this many days (default: 30)',
        },
      ],
    } satisfies LiveQueryRegistryEntry,
  },
  sites: {
    empty: {
      handler: (_connector, _params, tenantId, scope) =>
        getDattoEmptySitesService().analyze(tenantId, scope),
      params: [],
    } satisfies LiveQueryRegistryEntry,
  },
};
