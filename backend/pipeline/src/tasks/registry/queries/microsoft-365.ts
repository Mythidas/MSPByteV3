import { getMFACoverageService } from '../../services/microsoft-365/MFACoverageService.js';
import { getStaleUsersService } from '../../services/microsoft-365/StaleUsersService.js';
import { getLicenseWasteService } from '../../services/microsoft-365/LicenseWasteService.js';
import { getDirectSendService } from '../../services/microsoft-365/DirectSendService.js';
import type { LiveQueryRegistry, LiveQueryRegistryEntry } from '../types.js';

export const m365Queries: LiveQueryRegistry['microsoft-365'] = {
  mfa: {
    coverage: {
      handler: (_connector, _params, tenantId, scope) =>
        getMFACoverageService().analyze(tenantId, scope),
      params: [],
    } satisfies LiveQueryRegistryEntry,
  },
  identities: {
    stale: {
      handler: (_connector, params, tenantId, scope) =>
        getStaleUsersService().analyze(tenantId, scope, params),
      params: [
        {
          key: 'days_inactive',
          label: 'Days Inactive',
          type: 'number',
          required: false,
          placeholder: '90',
          description: 'Flag users inactive for this many days (default: 90)',
        },
      ],
    } satisfies LiveQueryRegistryEntry,
  },
  licenses: {
    waste: {
      handler: (_connector, _params, tenantId, scope) =>
        getLicenseWasteService().analyze(tenantId, scope),
      params: [],
    } satisfies LiveQueryRegistryEntry,
  },
  exchange: {
    'direct-send': {
      handler: (_connector, _params, tenantId, scope) =>
        getDirectSendService().analyze(tenantId, scope),
      params: [],
    } satisfies LiveQueryRegistryEntry,
  },
};
