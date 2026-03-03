import type { QueryDefinition } from '../../../types.js';
import { ORM } from '@workspace/shared/lib/utils/orm.js';
import { getSupabase } from '../../../supabase.js';

export const GetEntities: QueryDefinition = {
  key: 'internal/entities',
  integration: 'internal',
  label: 'Get Entities',
  description: 'Fetch entities for a given type and parameters.',
  inputs: {
    integration: {
      type: 'string',
      description: 'Integration to fetch entities from',
    },
    type: {
      type: 'string',
      description: 'Entity type to fetch entities by',
    },
    site_id: {
      type: 'string',
      description: 'Site to narrow down entity selection',
      optional: true,
    },
    connection_id: {
      type: 'string',
      description: 'Connection to narrow down entity selection',
      optional: true,
    },
  },
  outputs: {
    entities: { type: 'array', description: 'Array of entity objects' },
  },
  output_schema: {
    entities: {
      type: 'array',
      description: 'Entities from provided inputs',
    },
  },
  source: 'live',
  entityOutputKey: 'entities',
  async execute(ctx, inputs) {
    if (!inputs['integration'] || !inputs['type']) return { entities: [] };

    const orm = new ORM(getSupabase());
    const { data } = await orm.select(
      'public',
      'entities',
      (q) => {
        q.eq('integration_id', inputs['integration'] as string)
          .eq('entity_type', inputs['type'] as string)
          .eq('tenant_id', ctx.tenant_id);
        if (inputs['site_id']) q.eq('site_id', inputs['site_id'] as string);
        if (inputs['connection_id']) q.eq('connection_id', inputs['connection_id'] as string);
      }
    );

    return { entities: data?.rows ?? [] };
  },
};
