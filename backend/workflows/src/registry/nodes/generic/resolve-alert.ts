import { Logger } from '@workspace/shared/lib/utils/logger';
import { registerNode } from '../../registry.js';
import type { RunContext } from '../../../types.js';
import { ExecutorError } from '../../../errors.js';
import { orm } from '../../../lib/orm.js';
import { ENTITY_FK_COLUMN } from '../../../lib/entity-map.js';

registerNode({
  ref: 'Generic.ResolveAlert',
  label: 'Resolve Alert',
  description: 'Resolves open alerts for each entity in the input set.',
  category: 'sink',
  integration: null,
  isGeneric: true,
  pins: [
    { key: 'entities', kind: 'input', dataType: 'string', cardinality: 'array' },
    { key: 'affectedEntitiesPin', kind: 'output', dataType: 'entities', cardinality: 'array' },
  ],
  paramSchema: [
    {
      key: 'alert_definition_id',
      label: 'Alert Definition',
      dataType: 'string',
      cardinality: 'single',
      required: true,
    },
  ],
  async execute(input, _ctx: RunContext) {
    const entities = input.entities as Record<string, unknown>[];
    const alertDefinitionId = input.alert_definition_id as string;
    const entityType = (entities[0] as any)?._entityType as string | undefined;

    if (!entityType || !(entityType in ENTITY_FK_COLUMN)) {
      throw new ExecutorError(
        `Generic.ResolveAlert: unknown or missing _entityType "${entityType}"`,
      );
    }

    const fkColumn = ENTITY_FK_COLUMN[entityType];
    const entityIds = entities.map((e) => e.id as string);
    let recordsResolved = 0;

    try {
      // 1. Fetch open alerts for these entities
      const { data: openAlerts, error: fetchError } = await orm.batchSelect(
        'public',
        'alerts' as any,
        entityIds,
        fkColumn as never,
        500,
        (q: any) => q.eq('definition_id', alertDefinitionId).is('resolved_at', null),
      );

      if (fetchError || !openAlerts) {
        throw new ExecutorError(
          `Generic.ResolveAlert: failed to fetch open alerts: ${fetchError}`,
        );
      }

      // 2. Resolve by alert row ID
      const resolvedIds = openAlerts.map((a: any) => a.id as string);

      if (resolvedIds.length > 0) {
        const { error: updateError } = await orm.batchUpdate(
          'public',
          'alerts' as any,
          resolvedIds,
          { resolved_at: new Date().toISOString() } as any,
        );
        if (updateError)
          throw new ExecutorError(`Generic.ResolveAlert: update failed: ${updateError}`);
        recordsResolved = resolvedIds.length;
      }

      Logger.info({
        module: 'workflows',
        context: 'Generic.ResolveAlert',
        message: `Processed ${entityIds.length} entities: ${recordsResolved} resolved, ${entityIds.length - recordsResolved} skipped`,
      });
    } catch (err) {
      throw err instanceof ExecutorError ? err : new ExecutorError(String(err));
    }

    return {
      _metrics: {
        input_count: entityIds.length,
        records_resolved: recordsResolved,
        records_skipped: entityIds.length - recordsResolved,
        records_failed: 0,
      },
    };
  },
});
