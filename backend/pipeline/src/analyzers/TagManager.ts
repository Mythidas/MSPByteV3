import { getSupabase } from '../supabase.js';
import { Logger } from '../lib/logger.js';

/**
 * TagManager - Manages entity_tags table.
 * Uses DELETE WHERE source + INSERT pattern per analyzer pass.
 */
export class TagManager {
  async applyTags(
    entityTags: Map<number, { tag: string; category?: string; source: string }[]>,
  ): Promise<void> {
    if (entityTags.size === 0) return;

    const supabase = getSupabase();

    // Collect all sources involved for cleanup
    const sourcesByEntity = new Map<number, Set<string>>();
    const allInserts: any[] = [];

    for (const [entityId, tags] of entityTags) {
      const sources = new Set<string>();
      for (const t of tags) {
        sources.add(t.source);
        allInserts.push({
          entity_id: entityId,
          tag: t.tag,
          category: t.category || null,
          source: t.source,
        });
      }
      sourcesByEntity.set(entityId, sources);
    }

    // For each entity + source combination, delete old tags then insert new
    for (const [entityId, sources] of sourcesByEntity) {
      for (const source of sources) {
        await supabase.from('entity_tags').delete().eq('entity_id', entityId).eq('source', source);
      }
    }

    // Batch insert new tags (filter out empty tag entries)
    const validInserts = allInserts.filter((t) => t.tag && t.tag.length > 0);
    if (validInserts.length > 0) {
      // Insert in chunks of 100
      for (let i = 0; i < validInserts.length; i += 100) {
        const chunk = validInserts.slice(i, i + 100);
        const { error } = await supabase.from('entity_tags').upsert(chunk, {
          onConflict: 'entity_id,tag',
          ignoreDuplicates: true,
        });
        if (error) {
          Logger.log({
            module: 'TagManager',
            context: 'applyTags',
            message: `Error inserting tags: ${error.message}`,
            level: 'error',
          });
        }
      }
    }

    Logger.log({
      module: 'TagManager',
      context: 'applyTags',
      message: `Applied ${validInserts.length} tags to ${entityTags.size} entities`,
      level: 'trace',
    });
  }
}
