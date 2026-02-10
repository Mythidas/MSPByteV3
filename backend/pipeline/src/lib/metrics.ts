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

  reset(): void {
    this.stageTimes.clear();
    this.stageStartTimes.clear();
    this.dbQueries = 0;
    this.dbUpserts = 0;
    this.apiCalls = 0;
    this.entitiesCreated = 0;
    this.entitiesUpdated = 0;
    this.entitiesDeleted = 0;
    this.entitiesUnchanged = 0;
    this.errorDetails = {};
  }

  merge(other: MetricsCollector): void {
    const m = other.getMetrics();
    if (m.adapter_ms) this.stageTimes.set('adapter', (this.stageTimes.get('adapter') || 0) + m.adapter_ms);
    if (m.processor_ms)
      this.stageTimes.set('processor', (this.stageTimes.get('processor') || 0) + m.processor_ms);
    if (m.linker_ms) this.stageTimes.set('linker', (this.stageTimes.get('linker') || 0) + m.linker_ms);
    if (m.analyzer_ms)
      this.stageTimes.set('analyzer', (this.stageTimes.get('analyzer') || 0) + m.analyzer_ms);

    this.dbQueries += m.db_queries;
    this.dbUpserts += m.db_upserts;
    this.apiCalls += m.api_calls;
    this.entitiesCreated += m.entities_created;
    this.entitiesUpdated += m.entities_updated;
    this.entitiesDeleted += m.entities_deleted;
    this.entitiesUnchanged += m.entities_unchanged;

    if (m.error_message && !this.errorDetails.error_message) {
      this.errorDetails = {
        error_message: m.error_message,
        error_stack: m.error_stack,
        retry_count: m.retry_count,
      };
    }
  }

  toJSON(): any {
    return this.getMetrics();
  }

  static fromJSON(json: any): MetricsCollector {
    const c = new MetricsCollector();
    if (json.adapter_ms) c.stageTimes.set('adapter', json.adapter_ms);
    if (json.processor_ms) c.stageTimes.set('processor', json.processor_ms);
    if (json.linker_ms) c.stageTimes.set('linker', json.linker_ms);
    if (json.analyzer_ms) c.stageTimes.set('analyzer', json.analyzer_ms);
    c.dbQueries = json.db_queries || 0;
    c.dbUpserts = json.db_upserts || 0;
    c.apiCalls = json.api_calls || 0;
    c.entitiesCreated = json.entities_created || 0;
    c.entitiesUpdated = json.entities_updated || 0;
    c.entitiesDeleted = json.entities_deleted || 0;
    c.entitiesUnchanged = json.entities_unchanged || 0;
    if (json.error_message) {
      c.errorDetails = {
        error_message: json.error_message,
        error_stack: json.error_stack,
        retry_count: json.retry_count,
      };
    }
    return c;
  }
}
