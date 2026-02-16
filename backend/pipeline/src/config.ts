export type IntegrationId =
  | 'autotask'
  | 'sophos-partner'
  | 'dattormm'
  | 'cove'
  | 'microsoft-365'
  | 'halopsa';

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
  | 'ticket';

export interface EntityTypeConfig {
  type: EntityType;
  rateMinutes: number;
  priority: number;
}

export interface IntegrationConfig {
  name: string;
  id: IntegrationId;
  supportedTypes: EntityTypeConfig[];
}

export const INTEGRATION_CONFIGS: Record<IntegrationId, IntegrationConfig> = {
  autotask: {
    name: 'AutoTask',
    id: 'autotask',
    supportedTypes: [
      { type: 'company', rateMinutes: 60, priority: 5 },
      { type: 'contract', rateMinutes: 60, priority: 5 },
      { type: 'contract_service', rateMinutes: 60, priority: 5 },
    ],
  },
  'sophos-partner': {
    name: 'Sophos Partner',
    id: 'sophos-partner',
    supportedTypes: [
      { type: 'endpoint', rateMinutes: 15, priority: 3 },
      { type: 'firewall', rateMinutes: 30, priority: 5 },
      { type: 'license', rateMinutes: 120, priority: 7 },
    ],
  },
  dattormm: {
    name: 'DattoRMM',
    id: 'dattormm',
    supportedTypes: [
      { type: 'company', rateMinutes: 60, priority: 5 },
      { type: 'endpoint', rateMinutes: 15, priority: 3 },
    ],
  },
  cove: {
    name: 'Cove Backups',
    id: 'cove',
    supportedTypes: [
      { type: 'company', rateMinutes: 60, priority: 5 },
      { type: 'endpoint', rateMinutes: 30, priority: 3 },
    ],
  },
  'microsoft-365': {
    name: 'Microsoft 365',
    id: 'microsoft-365',
    supportedTypes: [
      { type: 'identity', rateMinutes: 15, priority: 3 },
      { type: 'group', rateMinutes: 30, priority: 5 },
      { type: 'license', rateMinutes: 120, priority: 7 },
      { type: 'role', rateMinutes: 60, priority: 5 },
      { type: 'policy', rateMinutes: 60, priority: 5 },
    ],
  },
  halopsa: {
    name: 'HaloPSA',
    id: 'halopsa',
    supportedTypes: [
      { type: 'company', rateMinutes: 60, priority: 5 },
      { type: 'ticket', rateMinutes: 15, priority: 3 },
    ],
  },
};
