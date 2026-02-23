export const INTEGRATIONS: Record<IntegrationId, Integration> = {
  'sophos-partner': {
    id: 'sophos-partner',
    name: 'Sophos Partner',
    type: 'security',
    supportedTypes: [
      { type: 'company', rateMinutes: 60, priority: 5 },
      { type: 'endpoint', rateMinutes: 15, priority: 3, fanOut: true },
    ],
  },
  dattormm: {
    id: 'dattormm',
    name: 'DattoRMM',
    type: 'security',
    supportedTypes: [
      { type: 'company', rateMinutes: 60, priority: 5 },
      { type: 'endpoint', rateMinutes: 15, priority: 3, fanOut: true },
    ],
  },
  cove: {
    id: 'cove',
    name: 'Cove Backups',
    type: 'security',
    supportedTypes: [
      { type: 'company', rateMinutes: 60, priority: 5 },
      { type: 'endpoint', rateMinutes: 30, priority: 3 },
    ],
  },
  'microsoft-365': {
    id: 'microsoft-365',
    name: 'Microsoft 365',
    type: 'security',
    supportedTypes: [
      { type: 'identity', rateMinutes: 15, priority: 3 },
      { type: 'group', rateMinutes: 30, priority: 5 },
      { type: 'license', rateMinutes: 120, priority: 7 },
      { type: 'role', rateMinutes: 60, priority: 5 },
      { type: 'policy', rateMinutes: 60, priority: 5 },
      { type: 'exchange-config', rateMinutes: 1440, priority: 9 },
    ],
  },
  halopsa: {
    id: 'halopsa',
    name: 'HaloPSA',
    type: 'security',
    supportedTypes: [{ type: 'company', rateMinutes: 60, priority: 5 }],
  },
  mspagent: {
    id: 'mspagent',
    name: 'MSPAgent',
    type: 'other',
    supportedTypes: [],
  },
};

export type IntegrationId =
  | 'sophos-partner'
  | 'dattormm'
  | 'cove'
  | 'microsoft-365'
  | 'halopsa'
  | 'mspagent';

export type EntityType =
  | 'company'
  | 'contract'
  | 'contract_service'
  | 'endpoint'
  | 'firewall'
  | 'license'
  | 'identity'
  | 'group'
  | 'role'
  | 'policy'
  | 'ticket'
  | 'exchange-config';

export interface EntityTypeConfig {
  type: EntityType;
  rateMinutes: number;
  priority: number;
  fanOut?: boolean; // true = created by linker fan-out; reconciler skips these
}

export interface Integration {
  id: IntegrationId;
  name: string;
  type: 'psa' | 'rmm' | 'recovery' | 'security' | 'identity' | 'other';
  supportedTypes: EntityTypeConfig[];
}
