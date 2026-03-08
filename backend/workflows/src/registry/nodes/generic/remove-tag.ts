import { Logger } from '@workspace/shared/lib/utils/logger';
import { registerNode } from '../../registry.js';
import type { RunContext } from '../../../types.js';
import { ExecutorError } from '../../../errors.js';
import { ENTITY_FK_COLUMN } from '../../../lib/entity-map.js';
import { orm } from '../../../lib/orm.js';

registerNode({
  ref: 'Generic.RemoveTag',
  label: 'Remove Tag',
  description: 'Removes a tag from each entity in the input set.',
  category: 'sink',
  integration: null,
  isGeneric: true,
  pins: [{ key: 'entities', kind: 'input', dataType: 'string', cardinality: 'array' }],
  paramSchema: [
    {
      key: 'tag_definition_id',
      label: 'Tag Definition',
      dataType: 'string',
      cardinality: 'single',
      required: true,
    },
  ],
  async execute(input, ctx: RunContext) {
    const entities = input.entities as unknown[];
    const tag_definition_id = input.tag_definition_id as string;
    const entityType = (entities[0] as any)?._entityType as string | undefined;

    if (!tag_definition_id) {
      throw new ExecutorError(`Generic.RemoveTag: missing tag_definition_id`);
    }

    if (!entityType || !(entityType in ENTITY_FK_COLUMN)) {
      throw new ExecutorError(`Generic.RemoveTag: unknown or missing _entityType "${entityType}"`);
    }

    Logger.info({
      module: 'workflows',
      context: 'Generic.RemoveTag',
      message: `Would remove tag ${tag_definition_id} from ${entities.length} entities`,
    });

    const entityIds = entities.map((e: any) => e.id) as string[];

    try {
      if (entityIds.length > 0) {
        const { error } = await orm.delete('public', 'tags', (q) =>
          q
            .in('entity_id', entityIds)
            .eq('definition_id', tag_definition_id)
            .eq('entity_type', entityType)
            .eq('tenant_id', ctx.tenant_id)
        );
        if (error) throw new ExecutorError(`Generic.RemoveTags: delete failed: ${error}`);
      }
    } catch (err) {
      throw err instanceof ExecutorError ? err : new ExecutorError(String(err));
    }

    return {};
  },
});
