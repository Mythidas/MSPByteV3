import { BaseJob } from '../BaseJob.js';
import type { AlertType } from '@workspace/shared/config/integrations/alerts.js';
import type { JobContext, JobResult } from '../types.js';

export class TamperProtectionJob extends BaseJob {
  getName(): string {
    return 'tamper-protection';
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
    return ['tamper-disabled'];
  }

  async execute(ctx: JobContext): Promise<JobResult> {
    const result = this.createEmptyResult();

    for (const endpoint of ctx.entities.endpoints) {
      const tamperProtectionEnabled: boolean =
        endpoint.raw_data?.tamperProtectionEnabled || false;

      if (!tamperProtectionEnabled) {
        result.alerts.push(
          this.createAlert(
            endpoint,
            'tamper-disabled',
            'high',
            `Device "${endpoint.display_name}" has Tamper Protection Disabled`,
          ),
        );
        this.addTags(result, endpoint.id, [
          { tag: 'tamper-disabled', category: 'status', source: 'sophos-partner' },
        ]);
        this.setState(result, endpoint.id, 'critical');
      }
    }

    return result;
  }
}
