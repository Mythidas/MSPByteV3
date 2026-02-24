import { IntegrationId } from '@workspace/shared/config/integrations';

export type AlertConfig = {
  displayName: string;
  description: string;
};

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertType =
  | 'mfa-not-enforced'
  | 'mfa-partial-enforced'
  | 'policy-gap'
  | 'license-waste'
  | 'stale-user'
  | 'tamper-disabled'
  | 'backup-failed'
  | 'device-offline'
  | 'site-empty';

const ALERTS: Record<IntegrationId, Partial<Record<AlertType, AlertConfig>>> = {
  cove: {},
  dattormm: {},
  halopsa: {},
  'microsoft-365': {},
  mspagent: {},
  'sophos-partner': {},
};
