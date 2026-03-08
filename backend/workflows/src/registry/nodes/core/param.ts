import { Logger } from '@workspace/shared/lib/utils/logger';
import { registerNode } from '../../registry.js';
import type { RunContext } from '../../../types.js';

registerNode({
  ref: 'Core.Param',
  label: 'Parameter',
  description: 'Emits a single parameter value from the run seed.',
  category: 'param',
  integration: null,
  isGeneric: true,
  pins: [{ key: 'value', kind: 'output', dataType: 'string', cardinality: 'single' }],
  paramSchema: [],
  async execute(input, _ctx: RunContext) {
    Logger.info({
      module: 'workflows',
      context: 'Core.Param',
      message: `emitting value for key: ${input.paramKey}`,
    });
    // TODO: implement — executor reads ctx.seed.params[paramKey] directly
    return { value: null };
  },
});
