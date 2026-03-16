import type { DattoRMMSite } from '@workspace/shared/types/integrations/datto/sites';
import type { DattoRMMDevice } from '@workspace/shared/types/integrations/datto/devices';
import { BaseRawType } from '../types';
import { EntityType } from '@workspace/shared/config/integrations';

export const DATTO_TYPES: Partial<EntityType>[] = ['sites', 'endpoints'];

// ============================================================================
// TYPED RAW ENTITIES (adapter output)
// ============================================================================

export type RawDattoSite = BaseRawType<DattoRMMSite>;
export type RawDattoEndpoint = BaseRawType<DattoRMMDevice>;

// Discriminated union for adapter output
export type RawDattoEntity =
  | ({ type: 'sites' } & RawDattoSite)
  | ({ type: 'endpoints' } & RawDattoEndpoint);
