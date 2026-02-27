import { dattormmActions } from './dattormm.js';
import { halopsakActions } from './halopsa.js';
import { autotaskActions } from './autotask.js';
import type { ActionRegistry } from '../types.js';

export const ACTION_REGISTRY: ActionRegistry = {
  dattormm: dattormmActions,
  halopsa: halopsakActions,
  autotask: autotaskActions,
};
