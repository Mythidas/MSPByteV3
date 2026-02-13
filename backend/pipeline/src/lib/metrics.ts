export interface StageMetrics {
  adapter_ms?: number;
  processor_ms?: number;
  linker_ms?: number;
  analyzer_ms?: number;
}

export interface DbMetrics {
  db_queries: number;
  db_upserts: number;
}

export interface ApiMetrics {
  api_calls: number;
}

export interface EntityMetrics {
  entities_created: number;
  entities_updated: number;
  entities_deleted: number;
  entities_unchanged: number;
}

export interface ErrorMetrics {
  error_message?: string;
  error_stack?: string;
  retry_count?: number;
}

export interface JobMetrics extends StageMetrics, DbMetrics, ApiMetrics, EntityMetrics, ErrorMetrics {}

export class MetricsCollector {
  private stageTimes = new Map<string, number>();
  private stageStartTimes = new Map<string, number>();
  private dbQueries = 0;
  private dbUpserts = 0;
  private apiCalls = 0;
  private entitiesCreated = 0;
  private entitiesUpdated = 0;
  private entitiesDeleted = 0;
  private entitiesUnchanged = 0;
  private errorDetails: ErrorMetrics = {};

  startStage(stageName: string): void {
    this.stageStartTimes.set(stageName, Date.now());
  }

  endStage(stageName: string): void {
    const startTime = this.stageStartTimes.get(stageName);
    if (startTime) {
      this.stageTimes.set(stageName, Date.now() - startTime);
      this.stageStartTimes.delete(stageName);
    }
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

  getMetrics(): JobMetrics {
    return {
      adapter_ms: this.stageTimes.get('adapter'),
      processor_ms: this.stageTimes.get('processor'),
      linker_ms: this.stageTimes.get('linker'),
      analyzer_ms: this.stageTimes.get('analyzer'),
      db_queries: this.dbQueries,
      db_upserts: this.dbUpserts,
      api_calls: this.apiCalls,
      entities_created: this.entitiesCreated,
      entities_updated: this.entitiesUpdated,
      entities_deleted: this.entitiesDeleted,
      entities_unchanged: this.entitiesUnchanged,
      ...this.errorDetails,
    };
  }

  toJSON(): any {
    return this.getMetrics();
  }
}
