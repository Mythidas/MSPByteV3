import { Logger } from '@workspace/shared/lib/utils/logger.js';
import { getScopedTargetIds } from '../../executor/context-resolver.js';
import type { TagNodeConfig, TagNodeInputs, TagStageResult, RunContext } from '../../types.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@workspace/shared/types/schema';

async function applyTags(
  config: TagNodeConfig,
  targetIds: string[],
  tagName: string,
  supabase: SupabaseClient<Database>,
  ctx: RunContext,
): Promise<{ applied: string[]; skipped: string[] }> {
  const applied: string[] = [];
  const skipped: string[] = [];

  const rows = targetIds.map((targetId) => ({
    entity_id: targetId,
    entity_type: ctx.entity_log[targetId]?.entity_type ?? 'unknown',
    definition_id: config.tag_definition_id,
    name: tagName,
    tenant_id: ctx.tenant_id,
  }));

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const chunkIds = targetIds.slice(i, i + CHUNK);
    const { error } = await supabase.from('tags').upsert(chunk, { ignoreDuplicates: true });
    if (error) {
      Logger.warn({
        module: 'TagNode',
        context: 'apply',
        message: `Batch tag upsert failed: ${error.message}`,
      });
      skipped.push(...chunkIds);
    } else {
      applied.push(...chunkIds);
    }
  }

  return { applied, skipped };
}

async function removeTags(
  config: TagNodeConfig,
  targetIds: string[],
  tagName: string,
  supabase: SupabaseClient<Database>,
  ctx: RunContext,
): Promise<string[]> {
  const { error } = await supabase
    .from('tags')
    .delete()
    .in('entity_id', targetIds)
    .eq('name', tagName)
    .eq('tenant_id', ctx.tenant_id)
    .eq('definition_id', config.tag_definition_id);

  if (error) {
    Logger.warn({
      module: 'TagNode',
      context: 'remove',
      message: `Failed to remove tags: ${error.message}`,
    });
    return [];
  }

  return targetIds;
}

export async function executeTagNode(
  config: TagNodeConfig,
  inputs: TagNodeInputs,
  ctx: RunContext,
  supabase: SupabaseClient<Database>,
): Promise<TagStageResult> {
  const result: TagStageResult = { applied: [], removed: [], skipped: [] };

  // Fetch tag definition
  const { data: tagDef, error: defError } = await supabase
    .from('tag_definitions')
    .select('name')
    .eq('id', config.tag_definition_id)
    .single();

  if (defError || !tagDef) {
    Logger.error({
      module: 'TagNode',
      context: 'executeTagNode',
      message: `Tag definition not found: ${config.tag_definition_id}`,
    });
    return result;
  }

  // APPLY
  if (config.mode === 'apply' || config.mode === 'apply_or_remove') {
    const { applied, skipped } = await applyTags(
      config,
      inputs.target_ids,
      tagDef.name,
      supabase,
      ctx,
    );
    result.applied.push(...applied);
    result.skipped.push(...skipped);
  }

  // REMOVE — SCOPE SAFETY: only removes tags for IDs within this run's resolved scope
  if (config.mode === 'remove' || config.mode === 'apply_or_remove') {
    const scopedIds = getScopedTargetIds(ctx, config.target_type);
    const removeSet =
      inputs.remove_target_ids ??
      (config.mode === 'apply_or_remove'
        ? scopedIds.filter((id) => !inputs.target_ids.includes(id))
        : scopedIds);

    // Intersect with scoped IDs to enforce scope safety
    const safeRemoveSet = removeSet.filter((id) => scopedIds.includes(id) || inputs.remove_target_ids !== undefined);

    if (safeRemoveSet.length > 0) {
      const removed = await removeTags(config, safeRemoveSet, tagDef.name, supabase, ctx);
      result.removed.push(...removed);
    }
  }

  return result;
}
