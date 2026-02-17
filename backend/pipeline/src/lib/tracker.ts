import { PerformanceTracker } from '@workspace/shared/lib/utils/performance.js';
import type { PerformanceSpan } from '@workspace/shared/lib/utils/performance.js';

export interface TrackerCounters {
  db_queries: number;
  db_upserts: number;
  api_calls: number;
  entities_created: number;
  entities_updated: number;
  entities_deleted: number;
  entities_unchanged: number;
}

export interface TrackerError {
  error_message: string;
  error_stack?: string;
  retry_count?: number;
}

export interface TrackerJSON {
  spans: PerformanceSpan[];
  counters: TrackerCounters;
  total_ms: number;
  error?: TrackerError;
}

export class PipelineTracker {
  private perf = new PerformanceTracker();
  private dbQueries = 0;
  private dbUpserts = 0;
  private apiCalls = 0;
  private entitiesCreated = 0;
  private entitiesUpdated = 0;
  private entitiesDeleted = 0;
  private entitiesUnchanged = 0;
  private errorDetails: TrackerError | undefined;

  async trackSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return this.perf.trackSpan(name, fn);
  }

  trackSpanSync<T>(name: string, fn: () => T): T {
    return this.perf.trackSpanSync(name, fn);
  }

  trackQuery(): void {
    this.dbQueries++;
  }

  trackUpsert(): void {
    this.dbUpserts++;
  }

  trackApiCall(): void {
    this.apiCalls++;
  }

  trackEntityCreated(count = 1): void {
    this.entitiesCreated += count;
  }

  trackEntityUpdated(count = 1): void {
    this.entitiesUpdated += count;
  }

  trackEntityDeleted(count = 1): void {
    this.entitiesDeleted += count;
  }

  trackEntityUnchanged(count = 1): void {
    this.entitiesUnchanged += count;
  }

  trackError(error: Error, retryCount?: number): void {
    this.errorDetails = {
      error_message: error.message,
      error_stack: error.stack,
      retry_count: retryCount,
    };
  }

  getCounters(): TrackerCounters {
    return {
      db_queries: this.dbQueries,
      db_upserts: this.dbUpserts,
      api_calls: this.apiCalls,
      entities_created: this.entitiesCreated,
      entities_updated: this.entitiesUpdated,
      entities_deleted: this.entitiesDeleted,
      entities_unchanged: this.entitiesUnchanged,
    };
  }

  toJSON(): TrackerJSON {
    return {
      spans: this.perf.getSpans(),
      counters: this.getCounters(),
      total_ms: this.perf.getTotalElapsed(),
      ...(this.errorDetails ? { error: this.errorDetails } : {}),
    };
  }
}
