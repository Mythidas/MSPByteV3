import { BaseJob } from '../BaseJob.js';
import type { AlertType } from '@workspace/shared/config/integrations/alerts.js';
import type { JobContext, JobResult } from '../types.js';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export class StaleUsersJob extends BaseJob {
  getName(): string {
    return 'stale-users';
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
    return ['stale-user'];
  }

  async execute(ctx: JobContext): Promise<JobResult> {
    const result = this.createEmptyResult();
    const now = Date.now();

    for (const identity of ctx.entities.identities) {
      const lastSignIn = identity.raw_data?.signInActivity?.lastSignInDateTime;
      if (!lastSignIn) continue;

      const lastSignInDate = new Date(lastSignIn);
      if (isNaN(lastSignInDate.getTime())) continue;

      const daysSince = Math.floor((now - lastSignInDate.getTime()) / (24 * 60 * 60 * 1000));

      if (now - lastSignInDate.getTime() > NINETY_DAYS_MS) {
        result.alerts.push(
          this.createAlert(
            identity,
            'stale-user',
            'medium',
            `User "${identity.display_name}" has not signed in for ${daysSince} days`,
          ),
        );
        this.addTags(result, identity.id, [
          { tag: 'stale', category: 'activity', source: 'microsoft-365' },
        ]);
        this.setState(result, identity.id, 'warn');
      }
    }

    return result;
  }
}
