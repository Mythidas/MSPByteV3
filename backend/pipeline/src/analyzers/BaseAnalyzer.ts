import type { AnalysisContext, AnalyzerResult, AlertType, AlertSeverity, Alert, EntityState } from '../types.js';

export abstract class BaseAnalyzer {
  abstract getName(): string;
  abstract analyze(context: AnalysisContext): Promise<AnalyzerResult>;

  protected createEmptyResult(): AnalyzerResult {
    return {
      alerts: [],
      entityTags: new Map(),
      entityStates: new Map(),
    };
  }

  protected createAlert(
    entityId: string,
    alertType: AlertType,
    severity: AlertSeverity,
    message: string,
    metadata?: Record<string, any>,
  ): Alert {
    return {
      entityId,
      alertType,
      severity,
      message,
      fingerprint: `${alertType}:${entityId}`,
      metadata,
    };
  }

  protected addTags(
    result: AnalyzerResult,
    entityId: string,
    tags: { tag: string; category?: string; source: string }[],
  ): void {
    const existing = result.entityTags.get(entityId) || [];
    result.entityTags.set(entityId, [...existing, ...tags]);
  }

  protected setState(result: AnalyzerResult, entityId: string, state: EntityState): void {
    const existing = result.entityStates.get(entityId);
    if (!existing || getStatePriority(state) > getStatePriority(existing)) {
      result.entityStates.set(entityId, state);
    }
  }
}

function getStatePriority(state: EntityState): number {
  const priorities: Record<EntityState, number> = {
    normal: 0,
    low: 1,
    warn: 2,
    critical: 4,
  };
  return priorities[state];
}
