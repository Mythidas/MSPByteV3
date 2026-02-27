import { m365Queries } from './microsoft-365.js';
import { sophosQueries } from './sophos-partner.js';
import { dattormmQueries } from './dattormm.js';
import type { LiveQueryRegistry } from '../types.js';

export const LIVE_QUERY_REGISTRY: LiveQueryRegistry = {
  'microsoft-365': m365Queries,
  'sophos-partner': sophosQueries,
  dattormm: dattormmQueries,
};
