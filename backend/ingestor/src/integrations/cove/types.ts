import type { CoveChildPartner } from '@workspace/shared/types/integrations/cove/partners';
import { BaseRawType } from '../types';
import { EntityType } from '@workspace/shared/config/integrations';

export const COVE_TYPES: Partial<EntityType>[] = ['sites', 'endpoints'];

// ============================================================================
// TYPED RAW ENTITIES (adapter output)
// ============================================================================

export type CoveAccountStat = {
  AccountId: number;
  Flags: string[];
  PartnerId: number;
  Settings: Record<string, string>;
};

export type RawCoveSite = BaseRawType<CoveChildPartner>;
export type RawCoveEndpoint = BaseRawType<CoveAccountStat>;

// Discriminated union for adapter output
export type RawCoveEntity =
  | ({ type: 'sites' } & RawCoveSite)
  | ({ type: 'endpoints' } & RawCoveEndpoint);
