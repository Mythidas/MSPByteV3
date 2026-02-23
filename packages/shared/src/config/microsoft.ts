import type { MSCapabilityKey } from '../types/integrations/microsoft/capabilities.js';

/** Directory roles the app's SP must hold in each GDAP customer tenant. Add here as features grow. */
export const REQUIRED_DIRECTORY_ROLES: Record<string, string> = {
  'Exchange Administrator': '29232cdf-9323-42fd-ade2-1d097af3e4de',
};

export const MS_CAPABILITIES: Record<
  MSCapabilityKey,
  { label: string; description: string; requiredLicense: string }
> = {
  signInActivity: {
    label: 'Sign-in Activity',
    description: 'Last sign-in timestamps per user',
    requiredLicense: 'Azure AD P1 or P2',
  },
  conditionalAccess: {
    label: 'Conditional Access',
    description: 'Conditional Access policy retrieval',
    requiredLicense: 'Azure AD P1 or P2',
  },
};

/** Graph service plan names that grant each capability.
 *  Source: Microsoft licensing docs — these names are stable across tenants. */
export const CAPABILITY_SERVICE_PLANS: Record<MSCapabilityKey, string[]> = {
  signInActivity: ['AAD_PREMIUM', 'AAD_PREMIUM_P2'],
  conditionalAccess: ['AAD_PREMIUM', 'AAD_PREMIUM_P2'],
};
