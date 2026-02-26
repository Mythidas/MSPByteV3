import { AlertType, AlertSeverity } from '@workspace/shared/config/integrations/alerts.js';
import type { Entity, EntityState } from '../types.js';
import type { JobContext, JobResult } from './types.js';

export abstract class BaseJob {
  abstract getName(): string;
  abstract getIntegrationId(): string;
  abstract getScheduleHours(): number;
  abstract getScope(): 'connection' | 'site';
  abstract getDependsOn(): string[];
  abstract getAlertTypes(): AlertType[];
  abstract execute(ctx: JobContext): Promise<JobResult>;

  protected createEmptyResult(): JobResult {
    return {
      alerts: [],
      entityTags: new Map(),
      entityStates: new Map(),
    };
  }

  protected createAlert(
    entity: Entity,
    alertType: AlertType,
    severity: AlertSeverity,
    message: string,
    metadata?: Record<string, any>
  ) {
    return {
      entityId: entity.id,
      siteId: entity.site_id ?? undefined,
      connectionId: entity.connection_id ?? undefined,
      alertType,
      severity,
      message,
      fingerprint: `${alertType}:${entity.id}`,
      metadata,
    };
  }

  protected addTags(
    result: JobResult,
    entityId: string,
    tags: { tag: string; category?: string; source: string }[]
  ): void {
    const existing = result.entityTags.get(entityId) || [];
    result.entityTags.set(entityId, [...existing, ...tags]);
  }

  protected setState(result: JobResult, entityId: string, state: EntityState): void {
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
