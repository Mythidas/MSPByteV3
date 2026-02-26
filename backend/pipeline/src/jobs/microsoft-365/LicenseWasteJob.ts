import { BaseJob } from '../BaseJob.js';
import type { AlertType } from '@workspace/shared/config/integrations/alerts.js';
import type { JobContext, JobResult } from '../types.js';

export class LicenseWasteJob extends BaseJob {
  getName(): string {
    return 'license-waste';
  }

  getIntegrationId(): string {
    return 'microsoft-365';
  }

  getScheduleHours(): number {
    return 24;
  }

  getScope(): 'connection' | 'site' {
    return 'connection';
  }

  getDependsOn(): string[] {
    return ['identity'];
  }

  getAlertTypes(): AlertType[] {
    return ['license-waste'];
  }

  async execute(ctx: JobContext): Promise<JobResult> {
    const result = this.createEmptyResult();

    for (const identity of ctx.entities.identities) {
      const accountEnabled: boolean = identity.raw_data?.accountEnabled ?? true;
      const assignedLicenses: any[] = identity.raw_data?.assignedLicenses ?? [];

      if (!accountEnabled && assignedLicenses.length > 0) {
        result.alerts.push(
          this.createAlert(
            identity,
            'license-waste',
            'high',
            `Disabled user "${identity.display_name}" has ${assignedLicenses.length} license(s) assigned`,
          ),
        );
        this.addTags(result, identity.id, [
          { tag: 'license-waste', category: 'cost', source: 'microsoft-365' },
          { tag: 'disabled', category: 'status', source: 'microsoft-365' },
        ]);
        this.setState(result, identity.id, 'warn');
      }
    }

    return result;
  }
}
