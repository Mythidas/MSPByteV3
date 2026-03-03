import { QUERY_REGISTRY } from '../index.js';
import { GetEntities } from './internal/entities.js';
import { M365IdentitiesListWithMFAStatus } from './m365/users.js';

const definitions = [M365IdentitiesListWithMFAStatus, GetEntities];

for (const def of definitions) {
  QUERY_REGISTRY.set(def.key, def);
}
