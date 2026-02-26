import { BaseJob } from '../BaseJob.js';
import type { AlertType } from '@workspace/shared/config/integrations/alerts.js';
import type { JobContext, JobResult } from '../types.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export class SophosOfflineDevicesJob extends BaseJob {
  getName(): string {
    return 'offline-devices';
  }

  getIntegrationId(): string {
    return 'sophos-partner';
  }

  getScheduleHours(): number {
    return 24;
  }

  getScope(): 'connection' | 'site' {
    return 'site';
  }

  getDependsOn(): string[] {
    return ['endpoint'];
  }

  getAlertTypes(): AlertType[] {
    return ['device-offline'];
  }

  async execute(ctx: JobContext): Promise<JobResult> {
    const result = this.createEmptyResult();
    const now = Date.now();

    for (const endpoint of ctx.entities.endpoints) {
      const lastSeen = endpoint.raw_data?.lastSeenAt;
      const online: boolean = endpoint.raw_data?.online || false;
      console.log(lastSeen, online);
      if (!lastSeen) continue;

      const lastSeenDate = new Date(lastSeen);
      if (isNaN(lastSeenDate.getTime())) continue;

      const daysSince = Math.floor((now - lastSeenDate.getTime()) / (24 * 60 * 60 * 1000));

      if (now - lastSeenDate.getTime() > THIRTY_DAYS_MS && !online) {
        result.alerts.push(
          this.createAlert(
            endpoint,
            'device-offline',
            'medium',
            `Device "${endpoint.display_name}" has been offline for ${daysSince} days`
          )
        );
        this.addTags(result, endpoint.id, [
          { tag: 'offline', category: 'status', source: 'sophos-partner' },
        ]);
        this.setState(result, endpoint.id, 'warn');
      }
    }

    return result;
  }
}
