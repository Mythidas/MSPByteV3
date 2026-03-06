import type { QueryDefinition } from '../../../types.js';
import { ORM } from '@workspace/shared/lib/utils/orm.js';
import { getSupabase } from '../../../supabase.js';

export const GetConnections: QueryDefinition = {
  key: 'internal/connections',
  integration: 'internal',
  label: 'Get Connections',
  description: 'Fetch integration connections for a given integration.',
  inputs: {
    integration: {
      type: 'string',
      description: 'Integration ID to fetch connections for',
    },
  },
  outputs: {
    connections: { type: 'array', description: 'Array of integration connection objects' },
  },
  output_schema: {
    connections: {
      type: 'array',
      description: 'Integration connections from provided inputs',
    },
  },
  source: 'live',
  outputType: 'void',
  async execute(ctx, inputs) {
    if (!inputs['integration']) return { connections: [] };

    const orm = new ORM(getSupabase());
    const { data } = await orm.select(
      'public',
      'integration_connections',
      (q) =>
        q
          .eq('integration_id', inputs['integration'] as string)
          .eq('tenant_id', ctx.tenant_id)
    );

    return { connections: data?.rows ?? [] };
  },
};
