import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';

/**
 * TagManager - Manages tags table.
 * Uses DELETE WHERE (entity_id, source) + INSERT pattern per analyzer pass.
 */
export class TagManager {
  async applyTags(
    tenantId: string,
    entityTags: Map<string, { tag: string; category?: string; source: string }[]>
  ): Promise<void> {
    if (entityTags.size === 0) return;

    const supabase = getSupabase();

    // Collect all sources involved for cleanup
    const sourcesByEntity = new Map<string, Set<string>>();
    const allInserts: any[] = [];

    for (const [entityId, tags] of entityTags) {
      const sources = new Set<string>();
      for (const t of tags) {
        sources.add(t.source);
        allInserts.push({
          tenant_id: tenantId,
          entity_id: entityId,
          tag: t.tag,
          category: t.category || null,
          source: t.source,
        });
      }
      sourcesByEntity.set(entityId, sources);
    }

    // Group entity IDs by source for batched deletes
    const entityIdsBySource = new Map<string, string[]>();
    for (const [entityId, sources] of sourcesByEntity) {
      for (const source of sources) {
        if (!entityIdsBySource.has(source)) {
          entityIdsBySource.set(source, []);
        }
        entityIdsBySource.get(source)!.push(entityId);
      }
    }

    // One batched delete per source (typically 1-2 sources)
    for (const [source, entityIds] of entityIdsBySource) {
      for (let i = 0; i < entityIds.length; i += 500) {
        const chunk = entityIds.slice(i, i + 500);
        await supabase.from('tags').delete().in('entity_id', chunk).eq('source', source);
      }
    }

    // Batch insert new tags
    const validInserts = allInserts.filter((t) => t.tag && t.tag.length > 0);
    if (validInserts.length > 0) {
      for (let i = 0; i < validInserts.length; i += 100) {
        const chunk = validInserts.slice(i, i + 100);
        const { error } = await supabase.from('tags').upsert(chunk, {
          onConflict: 'entity_id,tag',
          ignoreDuplicates: true,
        });
        if (error) {
          Logger.error({
            module: 'TagManager',
            context: 'applyTags',
            message: `Error inserting tags: ${error.message}`,
          });
        }
      }
    }

    Logger.trace({
      module: 'TagManager',
      context: 'applyTags',
      message: `Applied ${validInserts.length} tags to ${entityTags.size} entities`,
    });
  }
}
