import { getTamperProtectionService } from '../../services/sophos-partner/TamperProtectionService.js';
import { getSophosOfflineDevicesService } from '../../services/sophos-partner/OfflineDevicesService.js';
import { getSophosEmptySitesService } from '../../services/sophos-partner/EmptySitesService.js';
import type { LiveQueryRegistry, LiveQueryRegistryEntry } from '../types.js';

export const sophosQueries: LiveQueryRegistry['sophos-partner'] = {
  endpoints: {
    'tamper-protection': {
      handler: (_connector, _params, tenantId, scope) =>
        getTamperProtectionService().analyze(tenantId, scope),
      params: [],
    } satisfies LiveQueryRegistryEntry,
    offline: {
      handler: (_connector, params, tenantId, scope) =>
        getSophosOfflineDevicesService().analyze(tenantId, scope, params),
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
        getSophosEmptySitesService().analyze(tenantId, scope),
      params: [],
    } satisfies LiveQueryRegistryEntry,
  },
};
