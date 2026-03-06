import type { ActionResult, EntityLogEntry, NodeDataType, RunContext } from '../types.js';

export function populateEntityLogFromRows(
  ctx: RunContext,
  rows: Array<{
    id: string;
    entity_type: string;
    integration_id: string;
    display_name?: string | null;
    site_id?: string | null;
    connection_id?: string | null;
    raw_data?: unknown;
  }>,
): void {
  for (const row of rows) {
    if (ctx.entity_log[row.id]) continue; // don't overwrite action-set entries
    ctx.entity_log[row.id] = {
      entity_id: row.id,
      entity_type: row.entity_type as NodeDataType,
      integration: row.integration_id,
      display_name: row.display_name ?? null,
      site_id: row.site_id ?? null,
      connection_id: row.connection_id ?? null,
      raw_data: (row.raw_data ?? {}) as Record<string, unknown>,
      actions_applied: [],
      stage_node_ids: [],
    };
  }
}

/**
 * Mutates ctx.entity_log in place.
 * For each id in result.succeeded: find or create EntityLogEntry, append stageNodeId + actionLabel.
 */
export function accumulateEntities(
  ctx: RunContext,
  stageNodeId: string,
  result: ActionResult,
  entityType: string,
  integration: string,
  actionLabel: string,
): void {
  for (const entityId of result.succeeded) {
    const existing = ctx.entity_log[entityId];
    if (!existing) {
      ctx.entity_log[entityId] = {
        entity_id: entityId,
        entity_type: entityType as NodeDataType,
        integration,
        display_name: null,
        site_id: null,
        connection_id: null,
        raw_data: {},
        actions_applied: [actionLabel],
        stage_node_ids: [stageNodeId],
      };
    } else {
      if (!existing.stage_node_ids.includes(stageNodeId)) existing.stage_node_ids.push(stageNodeId);
      if (!existing.actions_applied.includes(actionLabel)) existing.actions_applied.push(actionLabel);
    }
  }
}
