import { BaseJob } from '../BaseJob.js';
import type { AlertType } from '@workspace/shared/config/integrations/alerts.js';
import type { JobContext, JobResult } from '../types.js';

export class MFACoverageJob extends BaseJob {
  getName(): string {
    return 'mfa-coverage';
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
    return ['identity', 'policy'];
  }

  getAlertTypes(): AlertType[] {
    return ['mfa-not-enforced', 'mfa-partial-enforced'];
  }

  async execute(ctx: JobContext): Promise<JobResult> {
    const result = this.createEmptyResult();
    const { policies, identities } = ctx.entities;

    if (identities.length === 0) return result;

    const mfaPolicies = policies.filter((p) => {
      const grantControls: any[] = p.raw_data?.grantControls?.builtInControls ?? [];
      const state: string = p.raw_data?.state ?? 'disabled';
      return state === 'enabled' && grantControls.includes('mfa');
    });

    if (mfaPolicies.length === 0) {
      for (const identity of identities) {
        result.alerts.push(
          this.createAlert(
            identity,
            'mfa-not-enforced',
            'critical',
            `No MFA policy targets user "${identity.display_name}"`,
          ),
        );
        this.addTags(result, identity.id, [
          { tag: 'mfa-none', category: 'security', source: 'microsoft-365' },
        ]);
        this.setState(result, identity.id, 'critical');
      }
      return result;
    }

    const coveredUserIds = new Set<string>();

    for (const policy of mfaPolicies) {
      const includeUsers: string[] = policy.raw_data?.conditions?.users?.includeUsers ?? [];
      const includeGroups: string[] = policy.raw_data?.conditions?.users?.includeGroups ?? [];

      if (includeUsers.includes('All') || includeGroups.includes('All')) {
        return result;
      }

      for (const uid of includeUsers) {
        coveredUserIds.add(uid);
      }
    }

    for (const identity of identities) {
      if (!coveredUserIds.has(identity.external_id)) {
        result.alerts.push(
          this.createAlert(
            identity,
            'mfa-partial-enforced',
            'high',
            `User "${identity.display_name}" is not targeted by any MFA Conditional Access policy`,
          ),
        );
        this.addTags(result, identity.id, [
          { tag: 'mfa-partial', category: 'security', source: 'microsoft-365' },
        ]);
        this.setState(result, identity.id, 'warn');
      }
    }

    return result;
  }
}
