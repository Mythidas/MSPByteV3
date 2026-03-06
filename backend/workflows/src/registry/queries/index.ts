import { QUERY_REGISTRY } from '../index.js';
import { GetEntities } from './internal/entities.js';
import { GetConnections } from './internal/connections.js';
import { M365IdentitiesListWithMFAStatus } from './m365/identities.js';
import { M365ExchangeConfig } from './m365/exchange.js';

const definitions = [M365IdentitiesListWithMFAStatus, M365ExchangeConfig, GetEntities, GetConnections];

for (const def of definitions) {
  QUERY_REGISTRY.set(def.key, def);
}
