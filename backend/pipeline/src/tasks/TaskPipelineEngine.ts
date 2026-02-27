import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import Encryption from '@workspace/shared/lib/utils/encryption.js';
import { StageDispatcher } from './StageDispatcher.js';
import type {
  TaskRow,
  WorkflowRow,
  StageDefinition,
  StageResult,
  AlertRule,
  TagRule,
  Condition,
  AlertDefinitionRow,
  TagDefinitionRow,
} from './types.js';

/**
 * TaskPipelineEngine
 *
 * Executes a workflow for a given task:
 *   1. Topological sort of stages
 *   2. Execute each stage (query or action) in dependency order
 *   3. Evaluate alert_rules and tag_rules against stage outputs
 *   4. Write final history record
 */
export class TaskPipelineEngine {
  private dispatcher: StageDispatcher;

  constructor() {
    this.dispatcher = new StageDispatcher();
  }

  async execute(task: TaskRow, workflow: WorkflowRow, historyId: string): Promise<void> {
    const supabase = getSupabase();
    const startTime = Date.now();

    // Mark history as running
    await (supabase.from('task_history' as any) as any)
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', historyId);

    Logger.info({
      module: 'TaskPipelineEngine',
      context: 'execute',
      message: `Starting task ${task.id} (workflow: ${workflow.name}, ${workflow.stages.length} stages)`,
    });

    // Map from stage_id → output (for depends_on checks)
    const stageOutputs = new Map<string, any>();
    // Map from original workflow.stages index → output (for stage_ref lookups)
    const stageOutputsByIndex = new Map<number, any>();
    // Original index lookup: stage_id → index in workflow.stages
    const stageIndexMap = new Map(workflow.stages.map((s, i) => [s.id, i]));

    const stageResults: StageResult[] = [];

    try {
      const sortedStages = this.topologicalSort(workflow.stages);

      for (const stage of sortedStages) {
        const result = await this.executeStage(stage, task, stageOutputs, stageOutputsByIndex);
        stageResults.push(result);

        if (result.status === 'completed') {
          stageOutputs.set(stage.id, result.output);
          const idx = stageIndexMap.get(stage.id);
          if (idx !== undefined) {
            stageOutputsByIndex.set(idx, result.output);
          }
        }
      }

      const alertsTriggered = await this.evaluateAlertRules(
        workflow.alert_rules,
        workflow.stages,
        stageOutputsByIndex,
        task,
        workflow.integration_id
      );

      const tagsApplied = await this.evaluateTagRules(
        workflow.tag_rules,
        workflow.stages,
        stageOutputsByIndex,
        task
      );

      const durationMs = Date.now() - startTime;

      await (supabase.from('task_history' as any) as any)
        .update({
          status: 'completed',
          stage_results: stageResults,
          alerts_triggered: alertsTriggered,
          tags_applied: tagsApplied,
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
        })
        .eq('id', historyId);

      Logger.info({
        module: 'TaskPipelineEngine',
        context: 'execute',
        message: `Task ${task.id} completed in ${durationMs}ms — ${alertsTriggered.length} alerts, ${tagsApplied.length} tags`,
      });
    } catch (error) {
      const durationMs = Date.now() - startTime;

      await (supabase.from('task_history' as any) as any)
        .update({
          status: 'failed',
          stage_results: stageResults,
          completed_at: new Date().toISOString(),
          error: (error as Error).message,
          duration_ms: durationMs,
        })
        .eq('id', historyId);

      Logger.error({
        module: 'TaskPipelineEngine',
        context: 'execute',
        message: `Task ${task.id} failed: ${(error as Error).message}`,
      });

      throw error;
    }
  }

  private async executeStage(
    stage: StageDefinition,
    task: TaskRow,
    stageOutputs: Map<string, any>,
    stageOutputsByIndex: Map<number, any>
  ): Promise<StageResult> {
    const stageStart = Date.now();

    // Skip if any dependency did not complete successfully
    for (const depId of stage.depends_on) {
      if (!stageOutputs.has(depId)) {
        Logger.trace({
          module: 'TaskPipelineEngine',
          context: 'executeStage',
          message: `Skipping stage ${stage.id} — dependency ${depId} did not complete`,
        });
        return {
          stage_id: stage.id,
          status: 'skipped',
          output: null,
          duration_ms: 0,
          skipped: true,
        };
      }
    }

    // Evaluate condition if present — skip stage if condition is false
    if (stage.condition) {
      const condData = stageOutputsByIndex.get(stage.condition.stage_ref) ?? null;
      if (!this.evaluateCondition(stage.condition, condData)) {
        Logger.trace({
          module: 'TaskPipelineEngine',
          context: 'executeStage',
          message: `Skipping stage ${stage.id} — condition not met`,
        });
        return {
          stage_id: stage.id,
          status: 'skipped',
          output: null,
          duration_ms: 0,
          skipped: true,
        };
      }
    }

    try {
      const supabase = getSupabase();
      let output: any;

      if (stage.type === 'query') {
        const { data: queryDef, error } = await (supabase.from('queries' as any) as any)
          .select('*')
          .eq('id', stage.operation)
          .single();

        if (error || !queryDef) {
          throw new Error(`Query definition not found: ${stage.operation}`);
        }

        output = await this.dispatcher.dispatchQuery(
          queryDef,
          task.scope,
          queryDef.params ?? {},
          task.tenant_id
        );
      } else {
        const { data: actionDef, error } = await (supabase.from('actions' as any) as any)
          .select('*')
          .eq('id', stage.operation)
          .single();

        if (error || !actionDef) {
          throw new Error(`Action definition not found: ${stage.operation}`);
        }

        // Resolve $stage[n].output tokens in action params using prior stage outputs
        const resolvedArgs = this.resolveTokens(actionDef.params ?? {}, stageOutputsByIndex);

        output = await this.dispatcher.dispatchAction(
          actionDef,
          task.scope,
          resolvedArgs,
          task.tenant_id
        );
      }

      Logger.trace({
        module: 'TaskPipelineEngine',
        context: 'executeStage',
        message: `Stage ${stage.id} (${stage.type}) completed in ${Date.now() - stageStart}ms`,
      });

      return {
        stage_id: stage.id,
        status: 'completed',
        output,
        duration_ms: Date.now() - stageStart,
        skipped: false,
      };
    } catch (error) {
      Logger.error({
        module: 'TaskPipelineEngine',
        context: 'executeStage',
        message: `Stage ${stage.id} failed: ${(error as Error).message}`,
      });

      return {
        stage_id: stage.id,
        status: 'failed',
        output: null,
        error: (error as Error).message,
        duration_ms: Date.now() - stageStart,
        skipped: false,
      };
    }
  }

  /**
   * Resolve $stage[n].output[.path] tokens in action parameter strings.
   * Example: "$stage[0].output.id" → looks up stageOutputsByIndex[0], then .id
   */
  resolveTokens(
    args: Record<string, any>,
    stageOutputsByIndex: Map<number, any>
  ): Record<string, any> {
    const TOKEN_RE = /\$stage\[(\d+)\]\.output((?:\.\w+|\[\d+\])*)/g;
    const resolved: Record<string, any> = {};

    for (const [key, val] of Object.entries(args)) {
      if (typeof val === 'string') {
        resolved[key] = val.replace(TOKEN_RE, (_match: string, stageIdx: string, path: string) => {
          const output = stageOutputsByIndex.get(Number(stageIdx));
          if (output === undefined) return '';
          const value = path ? this.getValueByPath(output, path.slice(1)) : output;
          return value !== undefined ? String(value) : '';
        });
      } else {
        resolved[key] = val;
      }
    }

    return resolved;
  }

  /**
   * Evaluate a condition against a data object.
   * Uses dot-notation + bracket-notation field paths.
   */
  evaluateCondition(condition: Condition, data: any): boolean {
    const value = this.getValueByPath(data, condition.field);

    switch (condition.operator) {
      case 'eq':
        return value === condition.value;
      case 'ne':
        return value !== condition.value;
      case 'gt':
        return Number(value) > Number(condition.value);
      case 'lt':
        return Number(value) < Number(condition.value);
      case 'gte':
        return Number(value) >= Number(condition.value);
      case 'lte':
        return Number(value) <= Number(condition.value);
      case 'contains':
        if (Array.isArray(value)) return value.includes(condition.value);
        if (typeof value === 'string') return value.includes(String(condition.value));
        return false;
      case 'exists':
        return value !== undefined && value !== null;
      case 'not_exists':
        return value === undefined || value === null;
      default:
        return false;
    }
  }

  /**
   * Traverse a dot/bracket path into an object.
   * Example: getValueByPath({a: {b: [1,2]}}, "a.b[1]") → 2
   */
  getValueByPath(obj: any, path: string): any {
    if (!path) return obj;
    const parts = path
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .filter(Boolean);
    let current = obj;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return current;
  }

  /**
   * Topological sort (Kahn's algorithm) on the stage depends_on DAG.
   */
  private topologicalSort(stages: StageDefinition[]): StageDefinition[] {
    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const visited = new Set<string>();
    const sorted: StageDefinition[] = [];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const stage = stageMap.get(id);
      if (!stage) return;
      for (const depId of stage.depends_on) visit(depId);
      sorted.push(stage);
    };

    for (const stage of stages) visit(stage.id);
    return sorted;
  }

  /**
   * Evaluate alert_rules and insert alerts for any matching conditions.
   */
  private async evaluateAlertRules(
    alertRules: AlertRule[],
    _originalStages: StageDefinition[],
    stageOutputsByIndex: Map<number, any>,
    task: TaskRow,
    integrationId: string
  ): Promise<{ alert_definition_id: string; message: string }[]> {
    if (!alertRules.length) return [];

    const supabase = getSupabase();
    const triggered: { alert_definition_id: string; message: string }[] = [];

    for (const rule of alertRules) {
      const stageOutput = stageOutputsByIndex.get(rule.stage_ref) ?? null;

      if (stageOutput === null && rule.condition.operator !== 'not_exists') continue;

      // Load alert definition once per rule
      const { data: def } = await (supabase.from('alert_definitions' as any) as any)
        .select('*')
        .eq('id', rule.alert_definition_id)
        .single();

      if (!def) {
        Logger.warn({
          module: 'TaskPipelineEngine',
          context: 'evaluateAlertRules',
          message: `Alert definition not found: ${rule.alert_definition_id}`,
        });
        continue;
      }

      const alertDef = def as AlertDefinitionRow;

      if (rule.apply_to_each_entity && Array.isArray(stageOutput) && rule.entity_id_field) {
        // Per-entity alerting: iterate array, fire one alert per matching entity
        for (const item of stageOutput) {
          if (!this.evaluateCondition(rule.condition, item)) continue;

          const entityId = this.getValueByPath(item, rule.entity_id_field);
          if (!entityId) continue;

          const fingerprint = Encryption.sha256(
            `task-automation:${task.id}:${rule.alert_definition_id}:${entityId}`
          );

          let message = rule.message_template || alertDef.description || alertDef.name;
          message = message.replace(/\{\{([^}]+)\}\}/g, (_m: string, field: string) => {
            const v = this.getValueByPath(item, field.trim());
            return v !== undefined ? String(v) : '';
          });

          await this.upsertAlert(supabase, {
            tenant_id: task.tenant_id,
            integration_id: integrationId,
            entity_id: entityId,
            alert_type: alertDef.name,
            severity: alertDef.severity,
            message,
            fingerprint,
            alert_definition_id: rule.alert_definition_id,
          });

          triggered.push({ alert_definition_id: rule.alert_definition_id, message });
        }
      } else {
        // Single-alert path: condition over the whole stage output
        if (!this.evaluateCondition(rule.condition, stageOutput)) continue;

        const fingerprint = Encryption.sha256(
          `task-automation:${task.id}:${rule.alert_definition_id}:${rule.stage_ref}`
        );

        let message = rule.message_template || alertDef.description || alertDef.name;
        message = message.replace(/\{\{([^}]+)\}\}/g, (_m: string, field: string) => {
          const v = this.getValueByPath(stageOutput, field.trim());
          return v !== undefined ? String(v) : '';
        });

        await this.upsertAlert(supabase, {
          tenant_id: task.tenant_id,
          integration_id: integrationId,
          entity_id: null,
          alert_type: alertDef.name,
          severity: alertDef.severity,
          message,
          fingerprint,
          alert_definition_id: rule.alert_definition_id,
        });

        triggered.push({ alert_definition_id: rule.alert_definition_id, message });
      }
    }

    return triggered;
  }

  /**
   * Insert or update a single alert row (fingerprint-based dedup).
   */
  private async upsertAlert(
    supabase: any,
    alert: {
      tenant_id: string;
      integration_id: string;
      entity_id: string | null;
      alert_type: string;
      severity: string;
      message: string;
      fingerprint: string;
      alert_definition_id: string;
    }
  ): Promise<void> {
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from('alerts')
      .select('id')
      .eq('fingerprint', alert.fingerprint)
      .eq('tenant_id', alert.tenant_id)
      .maybeSingle();

    if (!existing) {
      const { error: insertErr } = await supabase.from('alerts').insert({
        tenant_id: alert.tenant_id,
        entity_id: alert.entity_id,
        integration_id: alert.integration_id,
        alert_type: alert.alert_type,
        severity: alert.severity,
        message: alert.message,
        fingerprint: alert.fingerprint,
        status: 'active',
        last_seen_at: now,
        alert_definition_id: alert.alert_definition_id,
      } as any);

      if (insertErr) {
        Logger.error({
          module: 'TaskPipelineEngine',
          context: 'upsertAlert',
          message: `Failed to insert alert: ${insertErr.message}`,
        });
      }
    } else {
      await supabase
        .from('alerts')
        .update({ last_seen_at: now, updated_at: now } as any)
        .eq('id', existing.id);
    }
  }

  /**
   * Evaluate tag_rules and apply tags for any matching conditions.
   */
  private async evaluateTagRules(
    tagRules: TagRule[],
    _originalStages: StageDefinition[],
    stageOutputsByIndex: Map<number, any>,
    task: TaskRow
  ): Promise<{ tag_definition_id: string }[]> {
    if (!tagRules.length) return [];

    const supabase = getSupabase();
    const applied: { tag_definition_id: string }[] = [];

    for (const rule of tagRules) {
      const stageOutput = stageOutputsByIndex.get(rule.stage_ref) ?? null;

      if (stageOutput === null && rule.condition.operator !== 'not_exists') continue;
      if (!this.evaluateCondition(rule.condition, stageOutput)) continue;

      // Load tag definition
      const { data: def } = await (supabase.from('tag_definitions' as any) as any)
        .select('*')
        .eq('id', rule.tag_definition_id)
        .single();

      if (!def) {
        Logger.warn({
          module: 'TaskPipelineEngine',
          context: 'evaluateTagRules',
          message: `Tag definition not found: ${rule.tag_definition_id}`,
        });
        continue;
      }

      const tagDef = def as TagDefinitionRow;

      if (rule.apply_to_entity_field && Array.isArray(stageOutput)) {
        // Apply tag to each entity identified by the field
        for (const item of stageOutput) {
          const entityId = this.getValueByPath(item, rule.apply_to_entity_field);
          if (entityId) {
            const tagInsert: any = {
              tenant_id: task.tenant_id,
              entity_id: entityId,
              tag: tagDef.name,
              category: tagDef.category ?? null,
              source: 'task-automation',
              tag_definition_id: rule.tag_definition_id,
            };
            await supabase
              .from('tags')
              .upsert(tagInsert, { onConflict: 'entity_id,tag', ignoreDuplicates: true });
          }
        }
      } else if (task.scope.entity_id) {
        // Apply tag to the task's target entity
        const tagInsert: any = {
          tenant_id: task.tenant_id,
          entity_id: task.scope.entity_id,
          tag: tagDef.name,
          category: tagDef.category ?? null,
          source: 'task-automation',
          tag_definition_id: rule.tag_definition_id,
        };
        await supabase
          .from('tags')
          .upsert(tagInsert, { onConflict: 'entity_id,tag', ignoreDuplicates: true });
      }

      applied.push({ tag_definition_id: rule.tag_definition_id });
    }

    return applied;
  }
}
