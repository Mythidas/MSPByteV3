import type { SophosPartnerTenant } from '@workspace/shared/types/integrations/sophos/index';
import type { SophosPartnerEndpoint } from '@workspace/shared/types/integrations/sophos/endpoints';
import { BaseRawType } from '../types';
import { EntityType } from '@workspace/shared/config/integrations';

export const SOPHOS_TYPES: Partial<EntityType>[] = ['sites', 'endpoints'];

// ============================================================================
// TYPED RAW ENTITIES (adapter output)
// ============================================================================

export type RawSophosSite = BaseRawType<SophosPartnerTenant>;
export type RawSophosEndpoint = BaseRawType<SophosPartnerEndpoint>;

// Discriminated union for adapter output
export type RawSophosEntity =
  | ({ type: 'sites' } & RawSophosSite)
  | ({ type: 'endpoints' } & RawSophosEndpoint);
