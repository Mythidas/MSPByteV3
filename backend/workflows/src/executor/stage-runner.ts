import { Logger } from '@workspace/shared/lib/utils/logger.js';
import { getSupabase } from '../supabase.js';
import {
  QUERY_REGISTRY,
  ACTION_REGISTRY,
  TEMPLATE_REGISTRY,
  executeFilterNode,
  executeAlertNode,
  executeTagNode,
} from '../registry/index.js';
import { resolvePath, PathResolutionError } from './context-resolver.js';
import { accumulateEntities, populateEntityLogFromRows } from './entity-accumulator.js';
import type {
  AlertNodeInputs,
  EntityLogEntry,
  Row,
  RunContext,
  StageStatus,
  TagNodeInputs,
  WorkflowStageNode,
} from '../types.js';

export interface StageRunResult {
  stageId: string;
  status: StageStatus;
  output: unknown;
  error?: string;
  durationMs: number;
  affectedEntityIds: string[];
}

/** Renders a ticket template body to a plain text string using context. */
function renderTemplateBody(templateKey: string, ctx: RunContext): string {
  const template = TEMPLATE_REGISTRY.get(templateKey);
  if (!template) return `[Template not found: ${templateKey}]`;

  const lines: string[] = [];

  for (const section of template.body) {
    switch (section.type) {
      case 'static_text':
        lines.push(section.content);
        break;

      case 'entity_table': {
        if (section.heading) lines.push(`\n## ${section.heading}`);
        const entries = Object.values(ctx.entity_log) as EntityLogEntry[];
        if (entries.length === 0) {
          lines.push('(no entities)');
        } else {
          const colHeaders = section.columns.join(' | ');
          lines.push(colHeaders);
          lines.push(section.columns.map(() => '---').join(' | '));
          for (const entry of entries) {
            const cells = section.columns.map((col) => {
              const val = (entry as unknown as Record<string, unknown>)[col];
              return Array.isArray(val) ? val.join(', ') : String(val ?? '');
            });
            lines.push(cells.join(' | '));
          }
        }
        break;
      }

      case 'action_summary': {
        if (section.heading) lines.push(`\n## ${section.heading}`);
        const total = Object.keys(ctx.entity_log).length;
        lines.push(`Total entities affected: ${total}`);
        break;
      }

      case 'query_output':
        if (section.heading) lines.push(`\n## ${section.heading}`);
        lines.push(`[Query output: ${section.source}]`);
        break;
    }
  }

  return lines.join('\n');
}

/** Appends stage/action info to entity_log only if the entity is already tracked. */
function appendToEntityLog(ctx: RunContext, stageId: string, entityId: string, action: string): void {
  const entry = ctx.entity_log[entityId];
  if (!entry) return;
  if (!entry.stage_node_ids.includes(stageId)) entry.stage_node_ids.push(stageId);
  if (!entry.actions_applied.includes(action)) entry.actions_applied.push(action);
}

export async function runStage(
  stage: WorkflowStageNode,
  ctx: RunContext,
  stageIndex: number,
  runId: string,
): Promise<StageRunResult> {
  const supabase = getSupabase();
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // 1. Insert task_run_stages row as 'running'
  await (supabase.from('task_run_stages' as any) as any).insert({
    run_id: runId,
    stage_node_id: stage.id,
    stage_index: stageIndex,
    label: stage.label,
    stage_type: stage.type,
    ref: stage.ref,
    tenant_id: ctx.tenant_id,
    integration: stage.integration ?? null,
    status: 'running',
    started_at: startedAt,
  });

  let resolvedInputs: Record<string, unknown> = { ...stage.params };

  const fail = async (errorMsg: string): Promise<StageRunResult> => {
    const durationMs = Date.now() - startMs;
    await (supabase.from('task_run_stages' as any) as any)
      .update({
        status: 'failed',
        error: errorMsg,
        resolved_input: resolvedInputs,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      })
      .eq('run_id', runId)
      .eq('stage_node_id', stage.id);

    return { stageId: stage.id, status: 'failed', output: null, error: errorMsg, durationMs, affectedEntityIds: [] };
  };

  try {
    // 2. Resolve input_map against context, merge with static params
    resolvedInputs = { ...stage.params };
    for (const [inputKey, { from: dotPath }] of Object.entries(stage.input_map)) {
      try {
        resolvedInputs[inputKey] = resolvePath(ctx, dotPath);
      } catch (e) {
        if (e instanceof PathResolutionError) {
          Logger.warn({
            module: 'StageRunner',
            context: 'resolveInput',
            message: `Path resolution failed for key "${inputKey}" path "${dotPath}": ${e.message}`,
          });
        } else {
          throw e;
        }
      }
    }

    // 3. Filter stage — pure, no DB
    if (stage.type === 'filter') {
      if (!stage.filter_config) return await fail('filter stage missing filter_config');
      const rows = (resolvedInputs['rows'] as Row[]) ?? [];
      const result = executeFilterNode(stage.filter_config, rows);
      ctx.stage_outputs[stage.id] = result;
      const allIds = [...result.in_ids, ...result.out_ids];
      const durationMs = Date.now() - startMs;

      await (supabase.from('task_run_stages' as any) as any)
        .update({
          status: 'completed',
          output: result,
          resolved_input: resolvedInputs,
          affected_entity_ids: allIds,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
        .eq('stage_node_id', stage.id);

      return { stageId: stage.id, status: 'completed', output: result, durationMs, affectedEntityIds: allIds };
    }

    // 4. Alert stage
    if (stage.type === 'alert') {
      if (!stage.alert_config) return await fail('alert stage missing alert_config');
      const inputs: AlertNodeInputs = {
        target_ids: (resolvedInputs['target_ids'] as string[]) ?? [],
        resolve_target_ids: resolvedInputs['resolve_target_ids'] as string[] | undefined,
      };
      const result = await executeAlertNode(stage.alert_config, inputs, ctx, supabase as any);
      const allAffected = [...result.created, ...result.resolved];

      for (const id of result.created) appendToEntityLog(ctx, stage.id, id, `Alert Created: ${stage.label}`);
      for (const id of result.resolved) appendToEntityLog(ctx, stage.id, id, `Alert Resolved: ${stage.label}`);

      const alertOutput = {
        created_alert_ids: result.created_alert_ids,
        resolved_alert_ids: result.resolved_alert_ids,
        created_count: result.created_alert_ids.length,
        resolved_count: result.resolved_alert_ids.length,
      };
      ctx.stage_outputs[stage.id] = alertOutput;
      const durationMs = Date.now() - startMs;

      await (supabase.from('task_run_stages' as any) as any)
        .update({
          status: 'completed',
          output: alertOutput,
          resolved_input: resolvedInputs,
          affected_entity_ids: allAffected,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
        .eq('stage_node_id', stage.id);

      return { stageId: stage.id, status: 'completed', output: alertOutput, durationMs, affectedEntityIds: allAffected };
    }

    // 5. Tag stage
    if (stage.type === 'tag') {
      if (!stage.tag_config) return await fail('tag stage missing tag_config');
      const inputs: TagNodeInputs = {
        target_ids: (resolvedInputs['target_ids'] as string[]) ?? [],
        remove_target_ids: resolvedInputs['remove_target_ids'] as string[] | undefined,
      };
      const result = await executeTagNode(stage.tag_config, inputs, ctx, supabase as any);
      const allAffected = [...result.applied, ...result.removed];

      for (const id of result.applied) appendToEntityLog(ctx, stage.id, id, `Tag Applied: ${stage.label}`);
      for (const id of result.removed) appendToEntityLog(ctx, stage.id, id, `Tag Removed: ${stage.label}`);
      ctx.stage_outputs[stage.id] = result;
      const durationMs = Date.now() - startMs;

      await (supabase.from('task_run_stages' as any) as any)
        .update({
          status: 'completed',
          output: result,
          resolved_input: resolvedInputs,
          affected_entity_ids: allAffected,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
        })
        .eq('run_id', runId)
        .eq('stage_node_id', stage.id);

      return { stageId: stage.id, status: 'completed', output: result, durationMs, affectedEntityIds: allAffected };
    }

    // 6. Lookup registry for query/action/ticket
    const queryDef = QUERY_REGISTRY.get(stage.ref);
    const actionDef = ACTION_REGISTRY.get(stage.ref);

    if (!queryDef && !actionDef) {
      return await fail(`No registry entry found for ref: ${stage.ref}`);
    }

    let output: unknown = null;
    const affectedEntityIds: string[] = [];

    if (stage.type === 'ticket' && stage.template) {
      // 7. Ticket stage: render template, then execute the action
      const renderedBody = renderTemplateBody(stage.template, ctx);
      resolvedInputs['rendered_body'] = renderedBody;
      resolvedInputs['payload'] = Object.values(ctx.entity_log);

      const def = actionDef!;
      const result = await def.execute(ctx, resolvedInputs);
      output = result.output;
      affectedEntityIds.push(...result.succeeded);
    } else if (queryDef) {
      // 8. Query stage
      output = await queryDef.execute(ctx, resolvedInputs);

      // Populate entity_log if query declares an entityOutputKey
      if (queryDef.entityOutputKey && output && typeof output === 'object') {
        const rows = (output as Record<string, unknown>)[queryDef.entityOutputKey];
        if (Array.isArray(rows)) {
          populateEntityLogFromRows(ctx, rows as any[]);
        }
      }
    } else if (actionDef) {
      // 9. Action stage
      const result = await actionDef.execute(ctx, resolvedInputs);
      output = result.output;

      if (actionDef.affectsEntities) {
        accumulateEntities(ctx, stage.id, result, '', actionDef.integration, actionDef.label);
        affectedEntityIds.push(...result.succeeded);
      }
    }

    // 10. Write output to context
    ctx.stage_outputs[stage.id] = output;

    // 11. Update task_run_stages as completed
    const finalDurationMs = Date.now() - startMs;
    await (supabase.from('task_run_stages' as any) as any)
      .update({
        status: 'completed',
        output,
        resolved_input: resolvedInputs,
        affected_entity_ids: affectedEntityIds,
        duration_ms: finalDurationMs,
        completed_at: new Date().toISOString(),
      })
      .eq('run_id', runId)
      .eq('stage_node_id', stage.id);

    return { stageId: stage.id, status: 'completed', output, durationMs: finalDurationMs, affectedEntityIds };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    Logger.error({
      module: 'StageRunner',
      context: 'runStage',
      message: `Stage "${stage.id}" threw unexpected error: ${errorMsg}`,
    });
    return await fail(errorMsg);
  }
}
