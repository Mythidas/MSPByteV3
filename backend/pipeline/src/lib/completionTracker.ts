import { getRedisConnection } from './redis.js';
import { INTEGRATION_CONFIGS, type IntegrationId } from '../config.js';
import { Logger } from './logger.js';

const KEY_PREFIX = 'pipeline:completion';
const TTL_SECONDS = 2 * 60 * 60; // 2 hours — self-cleaning on failure

/**
 * CompletionTracker - Redis-based tracking for when all entity types
 * of an integration have finished syncing, so analysis can run once.
 *
 * For simple entity types: marks a flag per type.
 * For fan-out types (e.g., DattoRMM endpoints): uses INCR against expected count.
 */
export class CompletionTracker {
  private static baseKey(tenantId: string, integrationId: string): string {
    return `${KEY_PREFIX}:${tenantId}:${integrationId}`;
  }

  /**
   * Set expected count for fan-out entity types (e.g., endpoint sites).
   * Call this AFTER fan-out jobs are created.
   */
  static async setExpectedCount(
    tenantId: string,
    integrationId: string,
    entityType: string,
    count: number,
  ): Promise<void> {
    const redis = getRedisConnection();
    const key = `${this.baseKey(tenantId, integrationId)}:expected:${entityType}`;
    await redis.set(key, count.toString(), 'EX', TTL_SECONDS);

    Logger.trace({
      module: 'CompletionTracker',
      context: 'setExpectedCount',
      message: `Set expected count for ${integrationId}:${entityType} = ${count}`,
    });
  }

  /**
   * Mark an entity type sync as complete.
   * For fan-out types with expected counts, increments a counter.
   * Returns true when ALL entity types for this integration are complete.
   */
  static async markComplete(
    tenantId: string,
    integrationId: string,
    entityType: string,
  ): Promise<boolean> {
    const redis = getRedisConnection();
    const base = this.baseKey(tenantId, integrationId);

    // Check if this is a fan-out type with an expected count
    const expectedKey = `${base}:expected:${entityType}`;
    const expectedCount = await redis.get(expectedKey);

    if (expectedCount !== null) {
      // Fan-out type: increment completed counter
      const counterKey = `${base}:counter:${entityType}`;
      const completed = await redis.incr(counterKey);
      await redis.expire(counterKey, TTL_SECONDS);

      Logger.trace({
        module: 'CompletionTracker',
        context: 'markComplete',
        message: `Fan-out ${integrationId}:${entityType} progress: ${completed}/${expectedCount}`,
      });

      if (completed < parseInt(expectedCount, 10)) {
        return false; // Not all fan-out jobs done yet
      }

      // All fan-out jobs done — mark the type as complete
    }

    // Mark this entity type as complete
    const completedKey = `${base}:done:${entityType}`;
    await redis.set(completedKey, '1', 'EX', TTL_SECONDS);

    // Check if ALL entity types for this integration are done
    const config = INTEGRATION_CONFIGS[integrationId as IntegrationId];
    if (!config) return true; // Unknown integration, assume done

    const allTypes = config.supportedTypes.map((t) => t.type);
    const pipeline = redis.pipeline();
    for (const type of allTypes) {
      pipeline.get(`${base}:done:${type}`);
    }
    const results = await pipeline.exec();

    const allDone = results?.every(([err, val]) => !err && val === '1') ?? false;

    if (allDone) {
      // Cleanup all tracking keys for this integration run
      const keysToDelete = [
        ...allTypes.map((t) => `${base}:done:${t}`),
        ...allTypes.map((t) => `${base}:expected:${t}`),
        ...allTypes.map((t) => `${base}:counter:${t}`),
      ];
      await redis.del(...keysToDelete);

      Logger.info({
        module: 'CompletionTracker',
        context: 'markComplete',
        message: `All types complete for ${integrationId}, cleaned up tracking keys`,
      });
    }

    return allDone;
  }
}
